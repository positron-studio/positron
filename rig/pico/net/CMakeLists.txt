# rig/pico/net/CMakeLists.txt: the Pico 2 W network node. Build with build.sh,
# which runs this inside Docker (image positron-pico-net:2.2.0) for pico2_w.
#
#   -DRELAY_TLS=0      plain ws:// instead of wss://
#   -DRELAY_ROOM=name  another room (the default is studio-1)
#   -DPICO_SITE=name   the site's name, as the Pi is pi-1 (the default is pico-<flash id>)
cmake_minimum_required(VERSION 3.13)
include($ENV{PICO_SDK_PATH}/external/pico_sdk_import.cmake)
project(positron_net C CXX ASM)
set(CMAKE_C_STANDARD 11)
set(PICO_BOARD pico2_w CACHE STRING "")
# Our config replaces the SDK's pico_mbedtls_config.h for every mbedTLS file.
# It has to be set before pico_sdk_init(), which reads it.
set(PICO_MBEDTLS_CONFIG_FILE positron_mbedtls_config.h)
pico_sdk_init()

add_executable(net
  pico/main.c
  ws.c
  node.c
)
target_include_directories(net PRIVATE ${CMAKE_CURRENT_LIST_DIR} ${CMAKE_CURRENT_LIST_DIR}/pico)
target_compile_options(net PRIVATE -Wall -Wextra)
target_compile_definitions(net PRIVATE
  # stdio on UART1, GP8 TX and GP9 RX: UART0 (GP0, GP1) is DIN MIDI in the router
  PICO_DEFAULT_UART=1 PICO_DEFAULT_UART_TX_PIN=8 PICO_DEFAULT_UART_RX_PIN=9
  # 4 KB of stack, not the SDK's 2 KB. The Linux test MEASURED 3,424 bytes for
  # the TLS handshake alone on a 64 bit host, and on the board the handshake
  # runs inside cyw43_arch_poll -> lwIP tcp_input -> altcp, deeper still.
  # 4 KB is all of SCRATCH_Y (0x2000 was tried: "region SCRATCH_Y overflowed").
  # Guards on, so an overflow faults instead of running into SCRATCH_X, and
  # main.c paints the stack and prints its high water mark every 30 s.
  PICO_STACK_SIZE=0x1000 PICO_USE_STACK_GUARDS=1
)
if (DEFINED RELAY_TLS)
  target_compile_definitions(net PRIVATE RELAY_TLS=${RELAY_TLS})
endif()
if (DEFINED PICO_SITE)
  target_compile_definitions(net PRIVATE PICO_SITE="${PICO_SITE}")
endif()
if (DEFINED RELAY_ROOM)
  target_compile_definitions(net PRIVATE RELAY_ROOM="${RELAY_ROOM}")
endif()
target_include_directories(pico_mbedtls_headers INTERFACE ${CMAKE_CURRENT_LIST_DIR})
# The SDK's file list for mbedTLS 3 builds ssl_tls13_keys.c and NOT the TLS 1.3
# client state machine, and leaves out one PSA file, so TLS 1.3 needs these
# added (the last one MEASURED by the first link failing on
# psa_driver_wrapper_export_public_key). (READ in the image,
# src/rp2_common/pico_mbedtls/CMakeLists.txt, 2026-10-04.)
target_sources(net PRIVATE
  ${PICO_SDK_PATH}/lib/mbedtls/library/ssl_tls13_client.c
  ${PICO_SDK_PATH}/lib/mbedtls/library/ssl_tls13_generic.c
  ${PICO_SDK_PATH}/lib/mbedtls/library/psa_util.c
  ${PICO_SDK_PATH}/lib/mbedtls/library/psa_crypto_driver_wrappers_no_static.c
)
target_link_libraries(net
  pico_stdlib
  hardware_adc
  pico_unique_id
  pico_rand
  pico_cyw43_arch_lwip_poll
  pico_lwip_mbedtls
  pico_mbedtls
)
# Logs on both: UART1 as before, and USB CDC, read on the host as /dev/cu.usbmodem*.
# USB also lets picotool reboot it into BOOTSEL without holding the button.
pico_enable_stdio_uart(net 1)
pico_enable_stdio_usb(net 1)
pico_add_extra_outputs(net)
