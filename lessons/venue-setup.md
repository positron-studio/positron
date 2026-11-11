# Showing positron at a venue

Learned on 2026-11-11 setting up for TechTrack Lab II (Music Estonia, Telliskivi 60a), with the Pi, the Palm,
the Fast Track, a laptop and an Apple TV. Each item is what happened, then what to do.

## The network can block the domain

**What happened.** On the venue's Telia line, `https://positron.studio` answered nothing (`curl` code 000), and so
did `pub.positron.studio` and `ws.positron.studio`. Telia's "Turvafilter" puts positron.studio in
**"Malicious Websites"** and answers its DNS with a Fortinet block page address, `208.91.112.55` (IPv4) and
`2620:101:9000:53::55` (IPv6). Plain HTTP shows "Telia turvafiltri hoiatus / Website blocked!". Port 53 is
intercepted on the way out: `dig @1.1.1.1` got the same block address, so changing the DNS server does not help.
Only DNS is filtered: connecting to the real Cloudflare address (`curl --resolve`) gave 200 with a valid
certificate, and Cloudflare in general (cloudflare.com, workers.dev) was fine.

**What to do.**
- First check: `dig +short positron.studio`. A `208.91.112.55` answer is the filter.
- Real addresses, from DNS over HTTPS (works through the filter):
  `curl -s -H 'accept: application/dns-json' 'https://1.1.1.1/dns-query?name=ws.positron.studio&type=A'` (and `AAAA`).
  On 2026-11-11: `104.21.53.189`, `172.67.216.161`, `2606:4700:3036::ac43:d8a1`. Cloudflare can change them.
- Pin **all three names**, **both IPv4 and IPv6**, in `/etc/hosts` on the laptop AND the Pi:
  ```
  104.21.53.189 positron.studio pub.positron.studio ws.positron.studio
  2606:4700:3036::ac43:d8a1 positron.studio pub.positron.studio ws.positron.studio
  ```
  - `ws.positron.studio` is the relay every Pi page, the Palm bridge and the board use. Pinning only `pub` and the
    site left every relay socket closing with 1006.
  - IPv4 only was not enough on the Pi: `getent` still returned the filter's IPv6 address and node tried it first.
  - On the laptop `sudo` needs a real Terminal: the `!` prefix in Claude Code cannot answer the password prompt.
  - Remove the lines afterwards (marked "Telia filter workaround 2026-11-11, remove after" on the Pi).
- Browser only, no admin rights: Chrome, Settings, Privacy and security, Security, Use secure DNS, Cloudflare.
  Does nothing for the Pi.
- The site under another name, with no DNS of ours: `https://positron.kristjan-jansen.workers.dev/` (worker
  `positron`, `workers/view/wrangler.positron.jsonc`, same files, no custom domain) and the original
  `https://elektron-view.kristjan-jansen.workers.dev/`. The pages still call `ws.` and `pub.positron.studio` by
  name, so the live parts need the hosts lines anyway. Deploying `positron` is a second command:
  `cd workers/view && env -u CF_API_TOKEN -u CLOUDFLARE_API_TOKEN npx wrangler deploy -c wrangler.positron.jsonc`.
- Local fallback for the slides: `node demo/server.mjs`, then `http://127.0.0.1:8890/present/studio/`. Films,
  radio and the Pi still need the internet.
- Phone hotspot avoids all of it, if the phone is not on the same filtered plan.
- For good: re-rating request at https://www.fortiguard.com/webfilter (it refuses scripted and Claude in Chrome
  lookups, do it by hand) and `aritugi@telia.ee`, the address on Telia's block page.

## The Fast Track's USB is the Pi's whole audio

**What happened.** At 12:56 the Fast Track dropped off USB (`No such device` in jackd). JACK runs on it ("circuit is
the clock"), so JACK hung, and everything waiting on sound hung with it: the Pi slide's Listen spun for ever. At
13:08 the board killed jackd and restarted it on the dummy clock; Plaits and the PWM output came back without the
Fast Track. Plugging it back in does not move the board back onto it.

**What to do.**
- Seat the Fast Track's USB firmly and do not touch it during a show.
- A spinning sound button on a Pi page is a question about the board's audio before it is one about the page:
  `ssh positron@192.168.1.213 'journalctl -u positron-board --since "-15min" --no-pager | grep -iE "jackd|xrun|No such device"'`.
- Back onto the Fast Track: `rig/board/push.sh 192.168.1.213` (restarts the board on `hw:CARD=Pro`).
- After a board restart JACK may name the inputs `system:capture_N` or `circuit:capture_N`; `rig/palm/start.sh`
  asks JACK each time (commit 62240c08).
- `-inf dBFS` on both senders is exact digital silence: nothing plugged in, gain at zero, or the instrument silent.
  A live microphone in a quiet room still reads around -70 dBFS.

## The Palm

- No `/dev/ttyUSB*` on the Pi means the Palm's cable is out; the bridge then exits and restarts every 3 s
  (`bridge exited 0, again in 3 s` in `~/palm/bridge.log`). Plug it in and it is back within 3 s.
- The bridge also needs the relay (`ws.positron.studio`): with the domain blocked it drew locally but nothing
  played. Look for `joined studio-1 as palm-...` in `~/palm/bridge.log`.

## The Apple TV

- Control Center, Screen Mirroring, pick the Apple TV (type the code it shows). "Use As Separate Display" plus the
  browser window dragged over and full screen with Ctrl+Cmd+F, or plain mirroring.
- The laptop normally has to be on the same Wi-Fi as the Apple TV; a hotspot hides it. Peer to peer AirPlay may
  still find it with Wi-Fi and Bluetooth on.
- Mirroring switches the sound to the Apple TV; check the Mac's output if the room should hear the slides.

## Before leaving for a venue

1. `pgrep -fl Endpoint_Security_VPN` off, and the hosts lines ready to paste (above).
2. Pi: `systemctl is-active positron-board`, `ls /dev/ttyUSB*`, `lsusb | grep -i "fast track"`, `tail ~/palm/bridge.log`.
3. Open every slide once on the venue network, with `?cam=` already stored, before the audience arrives.
