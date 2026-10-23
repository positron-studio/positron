# workers/earlog

## header

Asked 2026-10-23 during the two-day radio1965 broadcast: *"i need web listerner count somehow not interrruptin stream ... over time"*.
The cast already keeps a listener history (`/listens/<station>`, dataset `cast_listeners`), but only Väin's mount count:
our own `/listen` ears were never written. Adding them to the cast meant a cast deploy, and a cast deploy hands a
station over, which drops every Väin app listener. So the reading lives in a worker of its own that polls cast
`/state/<station>` once a minute (edge cached 5 s, built from the last status snapshot, never asks a container).
`ears` counts open connections to our `/listen`, so a headless test that presses Play counts as a listener.
