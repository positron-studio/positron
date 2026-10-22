# `demo/shell/line-chart.mjs`

## header

Asked 2026-10-22 for the cast's listener counts: *"i will broadcast 2 days. i want charts out of it later"*, then
*"use simple svg component, make it into kit"*. Plain SVG built with `createElementNS`: no library and no canvas,
so ticks and labels are text in the site's mono face and the picture scales with no backing store to resize.

- `chartLayout` is pure (scales, ticks, the broken line, the peak) and is graded with no document by
  `node demo/shell/line-chart-test.mjs` (23 checks, 6 named negative controls). `createLineChart` only draws it.
- Width is the box's own (a ResizeObserver on the element), never the window's: a chart in a half column is half
  as wide. Height is `--lc-h` in `shell.css`, 180 px unless a page sets it.
- Y ticks are whole numbers on a 1, 2 or 5 step, at least 1 at the top, so all zeros is a flat line on a chart and
  not a division by zero. X ticks are on whole steps of local time (`TIME_STEPS`), at least `TICK_PX` (84) apart, and
  a tick where a day starts says the day.
- A null value breaks the line: a missing reading is a gap, never a line drawn across it.
- The peak is series 0's largest value (the earliest of a tie), a dot and the words `peak N`, labelled leftwards
  in the right half so the words stay on the chart.
- Two series get a key (the faint one dashed); one series gets none, because the heading names it.
- Colours are tokens: series 0 `--md-audio` (from `useMediumColours`, with `--fg` when a page has not published
  the media colours), the faint series `--dim2`, the grid `--line`. None typed.
- A pointer over the chart marks the nearest reading of series 0 and writes its time and value above the plot's
  right end, in a fixed place, so nothing reflows.

## css

The chart's rules are one block at the foot of `shell.css`. `.pos-lc[hidden]` is said there because `.pos-lc` sets
`display: flex`, which beats the UA's own `[hidden]`: an empty chart has to take no room (an empty box is a line).

<a id="max-gap"></a>

## `maxGap`: missing time is not a slope

Asked 2026-10-22 with a crop of /radio/cast/: *"last diatonal makes no sense. its jsut missing data (no lsiteners on
air)"*. Two radio1965 broadcasts, 13:49 to 13:53 and from 14:55, were drawn as one line, a diagonal from 3 down to 0
across the hour nothing was recorded. `chartLayout` takes `maxGap` (ms): two readings further apart start a new
stroke. The cast page passes three bucket steps, so one late reading still joins and an hour off air does not.
