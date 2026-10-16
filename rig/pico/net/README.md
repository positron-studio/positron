# rig/pico/net

The Pico 2 W as a node on the relay, over wifi, over TLS: `plans/plan-pico.md`
§3, item 1. It joins a room on `wss://ws.positron.studio`, announces a graph
that `demo/shell/graph-registry.mjs` accepts as `kind: "board"`, answers
`graph.ask`, takes `light.set` aimed at its own port and answers `node.ping`.

## Ports

Named `<medium>-<dir>` from the bay's side, which `graphProblem` enforces on a board.

| port | dir | medium | is |
| --- | --- | --- | --- |
| `<site>:din:midi-out` | out | midi | what arrives on the DIN socket (not wired yet) |
| `<site>:din:midi-in` | in | midi | what goes out of the DIN socket (not wired yet) |
| `<site>:led:value-in` | in | value | `light.set`; the onboard LED is on for any colour but `#000000` |
| `<site>:button:value-out` | out | value | BOOTSEL, `{"of":"key","cls":"key","k":0,"down":true}` on press and `false` on release |
| `<site>:temp:value-out` | out | value | the chip temperature every 5 s, `{"of":"number","cls":"number","v":23.4,"unit":"C"}` |

The two outputs go to the room as `bay.event` (`{"type":"bay.event","source":"<site>:button:value-out","ev":{...}}`),
the message `demo/shell/bay-node.mjs` sends and receives, so a page holding a
link out of either port delivers it like one of its own. They are sent whether
or not anybody holds a link, because the board does not know about links.

**Site name.** `-DPICO_SITE=pico-1` names the site as the Pi is `pi-1`; without it the site is `pico-` and the last three bytes of the flash id. The Pico on the desk runs as `pico-1` in `studio-1` since 2026-10-16. **Flashing needs no button**: with this firmware's USB serial, opening its port at 1200 baud reboots it into BOOTSEL (on the M1: `stty -f /dev/cu.usbmodem1101 1200`), then copy the UF2 onto the RP2350 drive.

**First run on a real Pico 2 W, 2026-10-16**, nothing wired to it, flashed from
the M1 (this laptop will not mount the `RP2350` drive). It joined the home
Wi-Fi, made the TLS connection and joined `pico-test-ab59ad` as site
`pico-a629d5` on one steady socket, announcing every 5 s. `node.ping` to the site
answered `node.pong` 5 of 5, round trips 50, 43, 45, 49 and 42 ms from a laptop
on the same LAN through `ws.positron.studio`. That firmware still used the old
port names (`din:in`, `din:out`, `led:light`); the renamed ports, the LED, BOOTSEL,
the temperature, the USB log and the Wi-Fi rejoin are built and tested on Linux
but not yet run on the board. The WebSocket client and the node protocol are the same C files
the Linux test runs against the real relay.

## Run the test (Docker and node only)

```sh
node rig/pico/net/test.mjs              # build, self test, then wss, ws, and wss with a 4 KB TLS buffer
node rig/pico/net/test.mjs --no-build   # reuse what is in the Docker volume
```

Every run makes its own room `pico-test-<6 hex>` and site `pico-<6 hex>`.
Never `studio-1`. The binaries live in the Docker volume `positron-pico-net-bin`
and never on the Mac.

## Build the UF2

```sh
cp rig/pico/net/pico/wifi_secrets.example.h rig/pico/net/pico/wifi_secrets.h   # then edit; it is gitignored
rig/pico/net/build.sh                           # wss:// to studio-1
rig/pico/net/build.sh -DRELAY_TLS=0             # plain ws://
rig/pico/net/build.sh -DRELAY_ROOM=pico-test-abc123
```

Writes `build-pico2_w/net.uf2`, `net.elf` and `net.map`. Without
`wifi_secrets.h` it still builds and links, with a warning, and joins nothing.
The UF2 and ELF hold the Wi-Fi password, so they stay in `build-pico2_w/`.

## Logs

The same lines go to USB serial (`/dev/cu.usbmodem*` on a Mac, 115200 or any
rate) and to UART1 on GP8 (TX) and GP9 (RX), because UART0 is DIN MIDI. Each
line starts with milliseconds since boot. The ones to measure with:

| line | says |
| --- | --- |
| `wifi up after N ms down, the join took M ms` | the first join, and every rejoin |
| `wifi down (link status S), rejoining` | the link status left `CYW43_LINK_UP`, checked every 500 ms; the socket is closed |
| `TLS up in N ms (DNS done, TCP and the TLS handshake)` | from dialling to the handshake done |
| `heap used ... stack max ... lights ... events ... temp ... C` | every 30 s |
| `BOOTSEL down`, `BOOTSEL up` | a debounced press, two equal reads 20 ms apart |

With USB on, `picotool reboot -u -f` can put a running board into BOOTSEL
without holding the button (not yet tried on this board).

## The image

`Dockerfile` builds `positron-pico-net:2.2.0` FROM the router's
`positron-pico-sdk:2.2.0` and adds four submodules at the commits pico-sdk
2.2.0 pins: cyw43-driver `dd75682`, lwip `77dcd25` (2.2.x), mbedtls `107ea89`
(3.6.2), tinyusb `86ad6e5` (for the USB log). `build.sh` builds the image again
when an older one has no tinyusb. The router image is unchanged.

## Files

| file | is |
| --- | --- |
| `ws.c`, `ws.h` | RFC 6455 client, sans-IO: bytes in by `ws_feed`, out by a callback. No heap |
| `node.c`, `node.h` | the wire.mjs envelope, the graph, `graph.ask`, `light.set`, `node.ping`, `bay.event` out, keep-alive. No heap |
| `vendor/jsmn.h` | jsmn, MIT, verbatim (below) |
| `positron_mbedtls_config.h` | the one mbedTLS config, Pico and Linux. Not called `mbedtls_config.h`, and the file says why |
| `gts_root_r4.h` | the pinned root, with its fingerprint and where it came from |
| `pico/main.c`, `pico/lwipopts.h` | the glue to the CYW43 and lwIP altcp, polled; the LED, BOOTSEL, the ADC and the Wi-Fi rejoin |
| `CMakeLists.txt`, `build.sh`, `Dockerfile` | the Pico build |
| `linux/main.c`, `linux/build.sh` | the same C on Linux over sockets and mbedTLS, plus `--selftest`; a stand-in temperature and `test.press` for BOOTSEL |
| `test.mjs` | the Mac side: wire.mjs, graph-registry.mjs and a page's bay-node against the C node |

## jsmn

`vendor/jsmn.h` and `vendor/jsmn.LICENSE` are
`https://github.com/zserge/jsmn` at commit
`25647e692c7906b96ffd2b05ca54c097948e879c` (2021-10-14), unmodified. MIT,
Copyright (c) 2010 Serge Zaitsev. sha256 of `jsmn.h`:
`c04533e9181e1e33baceb0f55ac449b05145bb936e8c68cc77dfe0d8277514fb`.

## What is not covered

- **On the board, not yet run**: the LED, BOOTSEL, the temperature reading (its
  calibration is the datasheet's line, not this chip's), the USB log, reconnect
  after an access point reboot, the soak, the TLS handshake time on a 150 MHz
  M33, and the real heap and stack high water marks (printed every 30 s).
- **BOOTSEL on Linux** is `test.press`, and the temperature there is a stand-in
  (-0.5 C, then 23.4 C), so the test checks the message and the page side, not
  the button or the sensor.
- **Certificate dates on the Pico.** There is no calendar until SNTP is added,
  so an expired certificate from the right chain would be accepted. Linux checks
  the dates.
- **`sent` is 0 on the Pico**, for the same reason (the envelope's send stamp,
  called `at` until 2026-10-04).
- **WS2812.** `light.set` is parsed, stored and logged, and the onboard LED goes
  on or off; no strip is driven.
