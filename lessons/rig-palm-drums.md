# The Palm as a drum grid (rig/palm/bridge.mjs --view drums, demo/shell/palm-drums.mjs)

## strokes

Only a pen up ends a stroke. pframe sends a pen down and a pen move as the same line (`p x y 1`), so the
bridge cannot tell a new stroke from a moved one except by the pen up between them.

Tried and removed on 2026-11-11: a stroke also ended after 250 ms with no pen event, to survive a lost pen up.
A stylus held still sends nothing, so the next move after a pause started a new stroke and flipped the square
back. Measured that morning in ~/palm/bridge.log: `rim step 13 on` at 06:26:19.508, `rim step 13 off` at
06:26:20.650, pen up at 06:26:21.981, all one stroke. The lost pen up it guarded against was a pen up with y
past the screen, which the bridge dropped; onPen now passes every pen up in the drums view.

The owner then asked for *"drawing filled one should erase"*: every square a stroke crosses flips once, and a
square already flipped in the stroke is not flipped again however often the stylus crosses it.

## first answers that were wrong

- *"Drawing does nothing"* was read as pframe holding pen lines until the pen up, because every logged stroke
  had its down and up 9 to 17 ms apart. A hold test disproved it: a 2.5 s hold arrived as down and up 2.5 s apart
  and a 7 s drag sent 68 edits live. The short strokes were quick taps.
- The tap that had to be held before it showed was the picture, not the pen: 4 bit frames are 12.8 KB and the
  Palm drew 3 to 9 a second while drawing, and pframe's event loop does not run while it reads a frame. The grid
  goes at 1 bit (3.2 KB) since, and a still grid refreshes every 5 s instead of every second.

## pframe's top strip

Until the 2026-11-11 build, a tap on pframe's top 14 rows toggled three status lines over rows 122 to 159 and
reopened the port, which ended the bridge with `write EIO`. The kick row started one pixel under it. The grid
starts at y 22 since, and the new pframe has no toggle and no status lines (the owner: *"rm logs, i can not
uset them"*).

## installing pframe

`~/palm/install-pframe.sh` first, then the HotSync tap. udev loads `visor` again the moment the Palm connects,
so `pilot-xfer -p usb:` with visor removed never saw the Palm and timed out three times; the install that
worked went over `/dev/ttyUSB1`, the HotSync port visor makes.
