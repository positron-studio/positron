// rig/pico/net/pico/main.c: the Pico 2 W as a node on the relay, over wifi,
// over TLS. ws.c and node.c are the files the Linux test runs; this is only
// the glue to lwIP's altcp and the CYW43.
//
// First run on a Pico 2 W 2026-10-16 (README). The LED, BOOTSEL, temperature,
// USB log and Wi-Fi rejoin below are built and not yet run on the board.
//
// Polled (pico_cyw43_arch_lwip_poll): every lwIP callback runs from the main
// loop's cyw43_arch_poll(), so ws.c and node.c never see an interrupt.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "hardware/adc.h"
#include "hardware/gpio.h"
#include "hardware/structs/ioqspi.h"
#include "hardware/structs/sio.h"
#include "hardware/sync.h"
#include "pico/cyw43_arch.h"
#include "pico/rand.h"
#include "pico/stdlib.h"
#include "pico/unique_id.h"

#include "lwip/altcp.h"
#include "lwip/altcp_tcp.h"
#include "lwip/altcp_tls.h"
#include "lwip/dns.h"
#include "lwip/stats.h"

#include "mbedtls/platform_time.h"
#include "mbedtls/ssl.h"
#include "psa/crypto.h"

#include "../gts_root_r4.h"
#include "../node.h"
#include "../ws.h"
// WIFI_SSID and WIFI_PASSWORD: NOT committed, see wifi_secrets.example.h.
#if __has_include("wifi_secrets.h")
#include "wifi_secrets.h"
#else
#warning "no pico/wifi_secrets.h: this UF2 builds and links but joins no network"
#define WIFI_SSID ""
#define WIFI_PASSWORD ""
#endif

#ifndef RELAY_HOST
#define RELAY_HOST "ws.positron.studio"
#endif
#ifndef RELAY_ROOM
#define RELAY_ROOM "studio-1"
#endif
#ifndef RELAY_TLS
#define RELAY_TLS 1                // 0 is plain ws:// on port 80, the fallback the plan measured
#endif
#define RELAY_PORT (RELAY_TLS ? 443 : 80)
#define RELAY_PATH "/room/" RELAY_ROOM "/ws"

static char site[16];
static ws_t ws;
static node_t node;
static struct altcp_pcb *pcb;
static struct altcp_tls_config *tls_conf;
static ip_addr_t relay_ip;
static uint32_t t_dial, backoff_ms = 1000, next_dial_ms;
static bool connected;
static bool wifi_up;
static uint32_t wifi_down_at, wifi_join_at;
// A drop asked for inside an lwIP callback is done from the main loop, so a
// pcb is never closed under the callback that is still using it.
static const char *pending_drop;

// Stack high water mark: paint what is free at boot, count what is still paint.
extern char __StackBottom, __StackTop;
static void stack_paint(void) {
  char here;
  for (char *p = &__StackBottom + 64; p < &here - 256; p++) *p = (char)0xA5;   // 64 bytes left for the guard
}
static unsigned stack_used(void) {
  char *p = &__StackBottom + 64;
  while (p < &__StackTop && *p == (char)0xA5) p++;
  return (unsigned)(&__StackTop - p);
}

static uint32_t now_ms(void) { return to_ms_since_boot(get_absolute_time()); }

// mbedTLS asks for milliseconds; there is no calendar, so no certificate dates
// are checked (MBEDTLS_HAVE_TIME_DATE is off on the Pico, see the config).
mbedtls_ms_time_t mbedtls_ms_time(void) { return (mbedtls_ms_time_t)now_ms(); }

static void say(const char *line) { printf("%8lu %s\n", (unsigned long)now_ms(), line); }
static void on_log(void *u, const char *line) { (void)u; say(line); }

// on_light runs inside cyw43_arch_poll, so the LED (on the CYW43, over its bus) is set from the loop.
static int led_want = -1, led_is = -1;
static void on_light(void *u, const node_light_t *l) {
  (void)u;
  led_want = (l->hex.r | l->hex.g | l->hex.b) != 0;
}

// BOOTSEL is read through the flash chip select (pico-examples picoboard/button): flash is
// unreachable while CS is floated, so this runs from RAM with interrupts off, for about 10 us.
static bool __no_inline_not_in_flash_func(bootsel_down)(void) {
  const uint CS = 1;
  uint32_t flags = save_and_disable_interrupts();
  hw_write_masked(&ioqspi_hw->io[CS].ctrl, GPIO_OVERRIDE_LOW << IO_QSPI_GPIO_QSPI_SS_CTRL_OEOVER_LSB,
                  IO_QSPI_GPIO_QSPI_SS_CTRL_OEOVER_BITS);
  for (volatile int i = 0; i < 1000; ++i) {}
#if PICO_RP2040
  bool down = !(sio_hw->gpio_hi_in & (1u << 1));
#else
  bool down = !(sio_hw->gpio_hi_in & SIO_GPIO_HI_IN_QSPI_CSN_BITS);
#endif
  hw_write_masked(&ioqspi_hw->io[CS].ctrl, GPIO_OVERRIDE_NORMAL << IO_QSPI_GPIO_QSPI_SS_CTRL_OEOVER_LSB,
                  IO_QSPI_GPIO_QSPI_SS_CTRL_OEOVER_BITS);
  restore_interrupts(flags);
  return down;
}

// The datasheet's line: 27 C at 0.706 V, -1.721 mV per degree, 3.3 V reference. Tenths of a degree.
static int temp_dc_last;
static int read_temp(void *u, int *dc) {
  (void)u;
  float v = adc_read() * 3.3f / 4096.0f;
  float c = 27.0f - (v - 0.706f) / 0.001721f;
  *dc = temp_dc_last = (int)(c * 10.0f + (c < 0 ? -0.5f : 0.5f));
  return 0;
}

// ---- transport

static int io_send(void *io, const uint8_t *p, size_t n) {
  (void)io;
  if (!pcb || !connected) return -1;
  if (altcp_sndbuf(pcb) < n) return -1;
  if (altcp_write(pcb, p, (u16_t)n, TCP_WRITE_FLAG_COPY) != ERR_OK) return -1;
  altcp_output(pcb);
  return 0;
}
static uint32_t io_rand(void *io) { (void)io; return get_rand_32(); }

static void schedule_redial(const char *why) {
  // Jittered: between half and all of the backoff, which then doubles to 30 s.
  uint32_t wait = backoff_ms / 2 + get_rand_32() % (backoff_ms / 2 + 1);
  next_dial_ms = now_ms() + wait;
  backoff_ms = backoff_ms * 2 > 30000 ? 30000 : backoff_ms * 2;
  char b[96];
  snprintf(b, sizeof b, "link down (%s), dialling again in %lu ms", why, (unsigned long)wait);
  say(b);
}

static void drop(const char *why) {
  if (pcb) {
    altcp_arg(pcb, NULL);
    altcp_recv(pcb, NULL);
    altcp_err(pcb, NULL);
    if (altcp_close(pcb) != ERR_OK) altcp_abort(pcb);
    pcb = NULL;
  }
  connected = false;
  ws.state = WS_CLOSED;
  schedule_redial(why);
}

static err_t on_recv(void *arg, struct altcp_pcb *conn, struct pbuf *p, err_t err) {
  (void)arg;
  if (!p || err != ERR_OK) { if (p) pbuf_free(p); pending_drop = "closed by the far end"; return ERR_OK; }
  for (struct pbuf *q = p; q; q = q->next) ws_feed(&ws, q->payload, q->len);
  altcp_recved(conn, p->tot_len);
  pbuf_free(p);
  return ERR_OK;
}

static void on_err(void *arg, err_t err) {
  (void)arg;
  pcb = NULL;                        // lwIP has already freed it
  char b[48];
  snprintf(b, sizeof b, "error %d", err);
  connected = false;
  ws.state = WS_CLOSED;
  schedule_redial(b);
}

// For TLS this is called once the HANDSHAKE is done, not when TCP connects.
static err_t on_connected(void *arg, struct altcp_pcb *conn, err_t err) {
  (void)arg; (void)conn;
  if (err != ERR_OK) { pending_drop = "connect failed"; return ERR_OK; }
  connected = true;
  char b[96];
  snprintf(b, sizeof b, "%s up in %lu ms (DNS done, TCP%s)", RELAY_TLS ? "TLS" : "TCP",
           (unsigned long)(now_ms() - t_dial), RELAY_TLS ? " and the TLS handshake" : "");
  say(b);
  ws_start(&ws);
  return ERR_OK;
}

static void on_ws_open(void *u) { backoff_ms = 1000; node_on_open(u); }
static void on_ws_close(void *u, int code, const char *why) {
  (void)u;
  char b[96];
  snprintf(b, sizeof b, "websocket closed %d (%s)", code, why);
  say(b);
  pending_drop = "websocket closed";
}

static void dial_ip(void) {
  pcb = RELAY_TLS ? altcp_tls_new(tls_conf, IPADDR_TYPE_V4) : altcp_tcp_new_ip_type(IPADDR_TYPE_V4);
  if (!pcb) { schedule_redial("no pcb"); return; }
#if RELAY_TLS
  // SNI and the name the certificate is checked against. Without it Cloudflare
  // cannot choose the certificate and mbedTLS cannot match the leaf's name.
  mbedtls_ssl_set_hostname(altcp_tls_context(pcb), RELAY_HOST);
#endif
  altcp_recv(pcb, on_recv);
  altcp_err(pcb, on_err);
  ws_cfg_t wc = { .host = RELAY_HOST, .path = RELAY_PATH, .send = io_send, .rand32 = io_rand,
                  .on_open = on_ws_open, .on_text = node_on_text, .on_close = on_ws_close, .user = &node };
  ws_init(&ws, &wc);
  if (altcp_connect(pcb, &relay_ip, RELAY_PORT, on_connected) != ERR_OK) drop("connect refused locally");
}

static void on_dns(const char *name, const ip_addr_t *ip, void *arg) {
  (void)name; (void)arg;
  if (!ip) { schedule_redial("DNS failed"); return; }
  relay_ip = *ip;
  dial_ip();
}

static void dial(void) {
  next_dial_ms = 0;
  t_dial = now_ms();
  err_t e = dns_gethostbyname(RELAY_HOST, &relay_ip, on_dns, NULL);
  if (e == ERR_OK) dial_ip();
  else if (e != ERR_INPROGRESS) schedule_redial("DNS refused");
}

int main(void) {
  stack_paint();
  stdio_init_all();
  pico_unique_board_id_t id;
  pico_get_unique_board_id(&id);
  // The last three bytes of the flash's unique id, as plan-pico §3.3 asks.
#ifdef PICO_SITE
  // A chosen name, as the Pi is pi-1; the flash id is the fallback that needs nobody to choose.
  snprintf(site, sizeof site, "%s", PICO_SITE);
#else
  snprintf(site, sizeof site, "pico-%02x%02x%02x", id.id[5], id.id[6], id.id[7]);
#endif

  if (cyw43_arch_init()) { say("cyw43 init failed"); return 1; }
  cyw43_arch_enable_sta_mode();
  // 🔴 POWER SAVE OFF. The default PM2 sleeps 200 ms between beacons; a Pico W
  // pinged 23.8 / 186.3 / 320.5 ms min/avg/max with it and 2.87 / 3.76 / 12.05
  // without (plan-pico §3.2, a forum measurement, not ours).
  cyw43_wifi_pm(&cyw43_state, CYW43_NONE_PM);
  adc_init();
  adc_set_temp_sensor_enabled(true);
  adc_select_input(ADC_TEMPERATURE_CHANNEL_NUM);

#if RELAY_TLS
  // The config FIRST: creating it is what points mbedtls_calloc at lwIP's heap
  // (altcp_mbedtls_mem_init), and anything mbedTLS allocates before that would
  // land in newlib's malloc instead.
  tls_conf = altcp_tls_create_config_client((const u8_t *)GTS_ROOT_R4_PEM, sizeof GTS_ROOT_R4_PEM);
  if (!tls_conf) { say("TLS config failed (the pinned root did not parse?)"); return 1; }
  // TLS 1.3 in mbedTLS 3.6 runs on PSA, and altcp never initialises it.
  if (psa_crypto_init() != PSA_SUCCESS) { say("psa_crypto_init failed"); return 1; }
#endif
  node_cfg_t nc = { .site = site, .place = RELAY_ROOM, .now_ms = NULL, .log = on_log, .on_light = on_light, .temp = read_temp };
  if (node_init(&node, &nc, &ws)) { say("node_init failed"); return 1; }
  char b[160];
  snprintf(b, sizeof b, "%s, dialling %s://%s%s", site, RELAY_TLS ? "wss" : "ws", RELAY_HOST, RELAY_PATH);
  say(b);

  // Wi-Fi is a state checked every 500 ms: a drop closes the socket and rejoins, and the
  // log says how long it was down and how long the rejoin took, for the router reboot test.
  uint32_t last_stats = 0, last_wifi = 0, last_key = 0;
  bool key = false, key_seen = false;
  wifi_down_at = wifi_join_at = now_ms();
  say("joining wifi");
  cyw43_arch_wifi_connect_async(WIFI_SSID, WIFI_PASSWORD, CYW43_AUTH_WPA2_AES_PSK);
  for (;;) {
    cyw43_arch_poll();
    uint32_t t = now_ms();
    if (t - last_wifi >= 500) {
      last_wifi = t;
      int ls = cyw43_tcpip_link_status(&cyw43_state, CYW43_ITF_STA);
      if (!wifi_up && ls == CYW43_LINK_UP) {
        wifi_up = true;
        snprintf(b, sizeof b, "wifi up after %lu ms down, the join took %lu ms", (unsigned long)(t - wifi_down_at), (unsigned long)(t - wifi_join_at));
        say(b);
        backoff_ms = 1000;
        if (!pcb) next_dial_ms = t;
      } else if (wifi_up && ls != CYW43_LINK_UP) {
        wifi_up = false;
        wifi_down_at = wifi_join_at = t;
        snprintf(b, sizeof b, "wifi down (link status %d), rejoining", ls);
        say(b);
        if (pcb) drop("wifi down");
        cyw43_arch_wifi_connect_async(WIFI_SSID, WIFI_PASSWORD, CYW43_AUTH_WPA2_AES_PSK);
      } else if (!wifi_up && ((ls < 0 && t - wifi_join_at > 5000) || t - wifi_join_at > 30000)) {
        // FAIL, NONET or BADAUTH means the join gave up; 30 s with no address is asked again too.
        snprintf(b, sizeof b, "wifi join failed (link status %d), again", ls);
        say(b);
        wifi_join_at = t;
        cyw43_arch_wifi_connect_async(WIFI_SSID, WIFI_PASSWORD, CYW43_AUTH_WPA2_AES_PSK);
      }
    }
    if (pending_drop) { const char *w = pending_drop; pending_drop = NULL; if (pcb) drop(w); }
    if (node_tick(&node, t) < 0 && pcb) drop("node says the link is dead");
    if (wifi_up && !pcb && next_dial_ms && (int32_t)(t - next_dial_ms) >= 0) dial();
    if (led_want >= 0 && led_want != led_is) { led_is = led_want; cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, led_is); }
    // Two equal reads 20 ms apart make a change, so a bounce shorter than that is not a press.
    if (t - last_key >= 20) {
      last_key = t;
      bool now_down = bootsel_down();
      if (now_down == key_seen && now_down != key) {
        key = now_down;
        say(key ? "BOOTSEL down" : "BOOTSEL up");
        node_button(&node, key);
      }
      key_seen = now_down;
    }
    if (t - last_stats > 30000) {
      last_stats = t;
      snprintf(b, sizeof b, "heap used %u max %u of %u, stack max %u of %u, lights %lu, events %lu, temp %s%d.%d C",
               (unsigned)lwip_stats.mem.used, (unsigned)lwip_stats.mem.max, (unsigned)MEM_SIZE, stack_used(),
               (unsigned)(&__StackTop - &__StackBottom), (unsigned long)node.st.lights, (unsigned long)node.st.events,
               temp_dc_last < 0 ? "-" : "", abs(temp_dc_last) / 10, abs(temp_dc_last) % 10);
      say(b);
    }
    cyw43_arch_wait_for_work_until(make_timeout_time_ms(10));
  }
}
