// Written by measure-gains.mjs, not by hand: each archive file's loudness as the tuner hears it, the gain that
// brings it to TARGET (clamped to GAIN_DB) and its kind; `soften` is set by hand. A feed id with no row plays at 0 dB. why: lessons/workers-cast.md#level
export const TARGET = -23;
export const GAINS = {
 "evt_1792082680406": {
  "title": "Clip test on user2",
  "lufs": -37.8,
  "tp": -15.3,
  "lra": 14.5,
  "seconds": 15,
  "gain": 12,
  "kind": "speech",
  "kindConf": 1,
  "kindLean": "speech",
  "kindBy": "gaps 65.484/min, flat 0.05",
  "features": {
   "syll": 0.78,
   "depth": 12.774,
   "gaps": 65.484,
   "tonal": 0.007,
   "flat": 0.05,
   "beat": 0.317,
   "seconds": 15
  },
  "moments": [
   {
    "at": 2.7,
    "kind": "phrase"
   },
   {
    "at": 7.1,
    "kind": "rise"
   },
   {
    "at": 14.3,
    "kind": "rise"
   }
  ]
 },
 "evt_1792082383536": {
  "title": "Clip test on user2",
  "lufs": -44.1,
  "tp": -24.4,
  "lra": 5.5,
  "seconds": 15,
  "gain": 12,
  "kind": "speech",
  "kindConf": 0.7,
  "kindLean": "speech",
  "kindBy": "gaps 57.299/min, flat 0.084",
  "features": {
   "syll": 0.451,
   "depth": 12.841,
   "gaps": 57.299,
   "tonal": 0,
   "flat": 0.084,
   "beat": 0.174,
   "seconds": 15
  },
  "moments": [
   {
    "at": 4.9,
    "kind": "rise"
   },
   {
    "at": 8.9,
    "kind": "rise"
   },
   {
    "at": 13.7,
    "kind": "rise"
   }
  ]
 },
 "evt_1791874248959": {
  "soften": true,
  "title": "Driving along on user2",
  "lufs": -21.7,
  "tp": -5.6,
  "lra": 9.1,
  "seconds": 102,
  "gain": -1.3,
  "kind": "field",
  "kindConf": 1,
  "kindLean": "field",
  "kindBy": "tonal 0, gaps 2.358/min",
  "features": {
   "syll": 0.777,
   "depth": 3.137,
   "gaps": 2.358,
   "tonal": 0,
   "flat": 0.033,
   "beat": 0.381,
   "seconds": 102
  },
  "moments": [
   {
    "at": 1.1,
    "kind": "rise"
   }
  ]
 },
 "evt_1791829792104": {
  "soften": true,
  "title": "Evening rituals on user2",
  "lufs": -21.6,
  "tp": 0.1,
  "lra": 22.6,
  "seconds": 132,
  "gain": -1.4,
  "kind": "ambiguous",
  "kindConf": 0.6,
  "kindLean": "speech",
  "kindBy": "gaps 61.401/min, flat 0.092",
  "features": {
   "syll": 0.481,
   "depth": 11.551,
   "gaps": 61.401,
   "tonal": 0.042,
   "flat": 0.092,
   "beat": 0.248,
   "seconds": 132
  },
  "moments": [
   {
    "at": 2.3,
    "kind": "phrase"
   },
   {
    "at": 6.8,
    "kind": "rise"
   },
   {
    "at": 10.8,
    "kind": "rise"
   },
   {
    "at": 15.7,
    "kind": "rise"
   },
   {
    "at": 20.9,
    "kind": "rise"
   },
   {
    "at": 27.2,
    "kind": "rise"
   },
   {
    "at": 31.8,
    "kind": "rise"
   },
   {
    "at": 41.9,
    "kind": "phrase"
   },
   {
    "at": 49.7,
    "kind": "rise"
   },
   {
    "at": 55.3,
    "kind": "rise"
   },
   {
    "at": 63.7,
    "kind": "rise"
   },
   {
    "at": 75.2,
    "kind": "rise"
   },
   {
    "at": 95.2,
    "kind": "rise"
   },
   {
    "at": 108.7,
    "kind": "rise"
   }
  ]
 },
 "evt_1791829519911": {
  "title": "Poorisvool on user3",
  "lufs": -24.6,
  "tp": 0.2,
  "lra": 10.5,
  "seconds": 39,
  "gain": 1.6,
  "kind": "field",
  "kindConf": 1,
  "kindLean": "field",
  "kindBy": "tonal 0.037, gaps 15.56/min",
  "features": {
   "syll": 0.461,
   "depth": 13.068,
   "gaps": 15.56,
   "tonal": 0.037,
   "flat": 0.148,
   "beat": 0.207,
   "seconds": 39
  },
  "moments": [
   {
    "at": 1.2,
    "kind": "rise"
   },
   {
    "at": 5.2,
    "kind": "rise"
   },
   {
    "at": 10.2,
    "kind": "rise"
   },
   {
    "at": 16.5,
    "kind": "rise"
   },
   {
    "at": 22.5,
    "kind": "rise"
   },
   {
    "at": 27.3,
    "kind": "rise"
   },
   {
    "at": 33.5,
    "kind": "rise"
   }
  ]
 },
 "evt_1791543189468": {
  "title": "Oriental analog on user2",
  "lufs": -18.2,
  "tp": -0.4,
  "lra": 10.5,
  "seconds": 74,
  "gain": -4.8,
  "kind": "music",
  "kindConf": 1,
  "kindLean": "music",
  "kindBy": "tonal 0.309",
  "features": {
   "syll": 0.426,
   "depth": 2.739,
   "gaps": 0,
   "tonal": 0.309,
   "flat": 0.05,
   "beat": 0.267,
   "seconds": 74
  },
  "moments": [
   {
    "at": 1.1,
    "kind": "rise"
   },
   {
    "at": 7.4,
    "kind": "rise"
   },
   {
    "at": 65.1,
    "kind": "rise"
   }
  ]
 },
 "evt_1791488817996": {
  "soften": true,
  "title": "Kalle 2 on user2",
  "lufs": -14.1,
  "tp": 1.2,
  "lra": 4.2,
  "seconds": 181,
  "gain": -8.9,
  "kind": "music",
  "kindConf": 1,
  "kindLean": "music",
  "kindBy": "tonal 0.307",
  "features": {
   "syll": 0.366,
   "depth": 5.067,
   "gaps": 7.643,
   "tonal": 0.307,
   "flat": 0.014,
   "beat": 0.43,
   "seconds": 181
  },
  "moments": [
   {
    "at": 1.2,
    "kind": "rise"
   },
   {
    "at": 5.4,
    "kind": "rise"
   },
   {
    "at": 17.6,
    "kind": "rise"
   },
   {
    "at": 23.2,
    "kind": "rise"
   },
   {
    "at": 27.3,
    "kind": "rise"
   },
   {
    "at": 31.4,
    "kind": "rise"
   },
   {
    "at": 36.9,
    "kind": "rise"
   },
   {
    "at": 41,
    "kind": "rise"
   },
   {
    "at": 45.1,
    "kind": "rise"
   },
   {
    "at": 53.4,
    "kind": "rise"
   },
   {
    "at": 58.5,
    "kind": "rise"
   },
   {
    "at": 64.4,
    "kind": "rise"
   },
   {
    "at": 71.7,
    "kind": "rise"
   },
   {
    "at": 82.4,
    "kind": "rise"
   },
   {
    "at": 87.8,
    "kind": "rise"
   },
   {
    "at": 95,
    "kind": "rise"
   },
   {
    "at": 99.5,
    "kind": "rise"
   },
   {
    "at": 104.8,
    "kind": "rise"
   },
   {
    "at": 113,
    "kind": "rise"
   },
   {
    "at": 118.5,
    "kind": "rise"
   },
   {
    "at": 128,
    "kind": "rise"
   },
   {
    "at": 133.5,
    "kind": "rise"
   },
   {
    "at": 138.9,
    "kind": "rise"
   },
   {
    "at": 145.8,
    "kind": "rise"
   },
   {
    "at": 149.9,
    "kind": "rise"
   },
   {
    "at": 154.1,
    "kind": "rise"
   },
   {
    "at": 159.7,
    "kind": "rise"
   },
   {
    "at": 165.6,
    "kind": "rise"
   },
   {
    "at": 175.5,
    "kind": "rise"
   }
  ]
 },
 "evt_1791488203609": {
  "soften": true,
  "title": "Kalle on user2",
  "lufs": -14.8,
  "tp": 1,
  "lra": 6.7,
  "seconds": 319,
  "gain": -8.2,
  "kind": "music",
  "kindConf": 1,
  "kindLean": "music",
  "kindBy": "tonal 0.203",
  "features": {
   "syll": 0.577,
   "depth": 5.103,
   "gaps": 12.982,
   "tonal": 0.203,
   "flat": 0.014,
   "beat": 0.339,
   "seconds": 319
  },
  "moments": [
   {
    "at": 1.3,
    "kind": "rise"
   },
   {
    "at": 8.6,
    "kind": "rise"
   },
   {
    "at": 17.9,
    "kind": "rise"
   },
   {
    "at": 25.6,
    "kind": "rise"
   },
   {
    "at": 31.5,
    "kind": "rise"
   },
   {
    "at": 41.2,
    "kind": "rise"
   },
   {
    "at": 46.6,
    "kind": "rise"
   },
   {
    "at": 52.6,
    "kind": "rise"
   },
   {
    "at": 57.2,
    "kind": "rise"
   },
   {
    "at": 86.5,
    "kind": "phrase"
   },
   {
    "at": 94.9,
    "kind": "rise"
   },
   {
    "at": 100.5,
    "kind": "rise"
   },
   {
    "at": 109.2,
    "kind": "rise"
   },
   {
    "at": 120.8,
    "kind": "rise"
   },
   {
    "at": 126.8,
    "kind": "rise"
   },
   {
    "at": 131.9,
    "kind": "rise"
   },
   {
    "at": 139.3,
    "kind": "rise"
   },
   {
    "at": 143.6,
    "kind": "rise"
   },
   {
    "at": 148.8,
    "kind": "rise"
   },
   {
    "at": 155.9,
    "kind": "rise"
   },
   {
    "at": 160.8,
    "kind": "rise"
   },
   {
    "at": 173.8,
    "kind": "rise"
   },
   {
    "at": 178.4,
    "kind": "rise"
   },
   {
    "at": 183.8,
    "kind": "rise"
   },
   {
    "at": 193.3,
    "kind": "rise"
   },
   {
    "at": 197.7,
    "kind": "rise"
   },
   {
    "at": 205.2,
    "kind": "rise"
   },
   {
    "at": 217.3,
    "kind": "rise"
   },
   {
    "at": 223.1,
    "kind": "rise"
   },
   {
    "at": 234.2,
    "kind": "rise"
   },
   {
    "at": 238.5,
    "kind": "rise"
   },
   {
    "at": 248.6,
    "kind": "rise"
   },
   {
    "at": 252.6,
    "kind": "rise"
   },
   {
    "at": 257.9,
    "kind": "rise"
   },
   {
    "at": 264,
    "kind": "rise"
   },
   {
    "at": 269.5,
    "kind": "rise"
   },
   {
    "at": 274.5,
    "kind": "rise"
   },
   {
    "at": 288.1,
    "kind": "rise"
   },
   {
    "at": 298.6,
    "kind": "rise"
   },
   {
    "at": 306.7,
    "kind": "rise"
   },
   {
    "at": 313.8,
    "kind": "phrase"
   }
  ]
 },
 "evt_1790075765975": {
  "title": "EMA salvestab Varssavis on user1",
  "lufs": -23.9,
  "tp": -1.6,
  "lra": 16.5,
  "seconds": 598,
  "gain": 0.9,
  "kind": "music",
  "kindConf": 1,
  "kindLean": "music",
  "kindBy": "tonal 0.583",
  "features": {
   "syll": 0.219,
   "depth": 5.393,
   "gaps": 14.144,
   "tonal": 0.583,
   "flat": 0.001,
   "beat": 0.221,
   "seconds": 598
  },
  "moments": [
   {
    "at": 2.4,
    "kind": "rise"
   },
   {
    "at": 6.5,
    "kind": "rise"
   },
   {
    "at": 12.9,
    "kind": "rise"
   },
   {
    "at": 25.5,
    "kind": "rise"
   },
   {
    "at": 31,
    "kind": "rise"
   },
   {
    "at": 42.7,
    "kind": "rise"
   },
   {
    "at": 60.7,
    "kind": "phrase"
   },
   {
    "at": 69.5,
    "kind": "phrase"
   },
   {
    "at": 75.8,
    "kind": "phrase"
   },
   {
    "at": 87,
    "kind": "rise"
   },
   {
    "at": 93.5,
    "kind": "rise"
   },
   {
    "at": 105.7,
    "kind": "phrase"
   },
   {
    "at": 114.1,
    "kind": "phrase"
   },
   {
    "at": 119.9,
    "kind": "rise"
   },
   {
    "at": 124.8,
    "kind": "rise"
   },
   {
    "at": 131.9,
    "kind": "rise"
   },
   {
    "at": 144,
    "kind": "rise"
   },
   {
    "at": 148.2,
    "kind": "rise"
   },
   {
    "at": 160.3,
    "kind": "rise"
   },
   {
    "at": 167.2,
    "kind": "rise"
   },
   {
    "at": 172.3,
    "kind": "rise"
   },
   {
    "at": 179.1,
    "kind": "rise"
   },
   {
    "at": 183.1,
    "kind": "rise"
   },
   {
    "at": 192.2,
    "kind": "rise"
   },
   {
    "at": 202.1,
    "kind": "rise"
   },
   {
    "at": 231.1,
    "kind": "rise"
   },
   {
    "at": 235.3,
    "kind": "rise"
   },
   {
    "at": 240.5,
    "kind": "rise"
   },
   {
    "at": 253.3,
    "kind": "phrase"
   },
   {
    "at": 258,
    "kind": "rise"
   },
   {
    "at": 268.3,
    "kind": "rise"
   },
   {
    "at": 275.3,
    "kind": "rise"
   },
   {
    "at": 295,
    "kind": "phrase"
   },
   {
    "at": 300.7,
    "kind": "rise"
   },
   {
    "at": 308.2,
    "kind": "rise"
   },
   {
    "at": 326.5,
    "kind": "rise"
   },
   {
    "at": 335.6,
    "kind": "rise"
   },
   {
    "at": 342.4,
    "kind": "rise"
   },
   {
    "at": 352.1,
    "kind": "phrase"
   },
   {
    "at": 366.7,
    "kind": "rise"
   },
   {
    "at": 371.3,
    "kind": "rise"
   },
   {
    "at": 375.3,
    "kind": "phrase"
   },
   {
    "at": 385.3,
    "kind": "rise"
   },
   {
    "at": 406.2,
    "kind": "phrase"
   },
   {
    "at": 419.1,
    "kind": "phrase"
   },
   {
    "at": 432.7,
    "kind": "rise"
   },
   {
    "at": 442.8,
    "kind": "rise"
   },
   {
    "at": 457.9,
    "kind": "phrase"
   },
   {
    "at": 469.5,
    "kind": "phrase"
   },
   {
    "at": 476.6,
    "kind": "rise"
   },
   {
    "at": 485.1,
    "kind": "rise"
   },
   {
    "at": 489.9,
    "kind": "rise"
   },
   {
    "at": 497.9,
    "kind": "phrase"
   },
   {
    "at": 505,
    "kind": "rise"
   },
   {
    "at": 512.9,
    "kind": "rise"
   },
   {
    "at": 518.1,
    "kind": "rise"
   },
   {
    "at": 523.5,
    "kind": "rise"
   },
   {
    "at": 531.2,
    "kind": "rise"
   },
   {
    "at": 536.9,
    "kind": "rise"
   },
   {
    "at": 545.5,
    "kind": "rise"
   },
   {
    "at": 550.4,
    "kind": "rise"
   },
   {
    "at": 555.6,
    "kind": "rise"
   },
   {
    "at": 560.7,
    "kind": "rise"
   },
   {
    "at": 566.6,
    "kind": "rise"
   },
   {
    "at": 572.4,
    "kind": "rise"
   },
   {
    "at": 580.2,
    "kind": "rise"
   },
   {
    "at": 584.3,
    "kind": "rise"
   },
   {
    "at": 590.5,
    "kind": "rise"
   },
   {
    "at": 597,
    "kind": "rise"
   }
  ]
 },
 "evt_1790072932381": {
  "title": "EMA salvestab Varssavis on user1",
  "lufs": -29.2,
  "tp": -6.3,
  "lra": 21.2,
  "seconds": 675,
  "gain": 6.2,
  "kind": "music",
  "kindConf": 1,
  "kindLean": "music",
  "kindBy": "tonal 0.192",
  "features": {
   "syll": 0.383,
   "depth": 4.862,
   "gaps": 19.901,
   "tonal": 0.192,
   "flat": 0.011,
   "beat": 0.23,
   "seconds": 600
  },
  "moments": [
   {
    "at": 1.3,
    "kind": "rise"
   },
   {
    "at": 10.2,
    "kind": "rise"
   },
   {
    "at": 102.9,
    "kind": "rise"
   },
   {
    "at": 127.6,
    "kind": "rise"
   },
   {
    "at": 158,
    "kind": "rise"
   },
   {
    "at": 162.3,
    "kind": "rise"
   },
   {
    "at": 172.3,
    "kind": "phrase"
   },
   {
    "at": 177,
    "kind": "rise"
   },
   {
    "at": 190.2,
    "kind": "phrase"
   },
   {
    "at": 214.5,
    "kind": "phrase"
   },
   {
    "at": 221.5,
    "kind": "rise"
   },
   {
    "at": 269.7,
    "kind": "rise"
   },
   {
    "at": 283.2,
    "kind": "rise"
   },
   {
    "at": 293.1,
    "kind": "phrase"
   },
   {
    "at": 299.5,
    "kind": "phrase"
   },
   {
    "at": 315.7,
    "kind": "rise"
   },
   {
    "at": 375,
    "kind": "phrase"
   },
   {
    "at": 381.9,
    "kind": "rise"
   },
   {
    "at": 400.9,
    "kind": "rise"
   },
   {
    "at": 436.8,
    "kind": "phrase"
   },
   {
    "at": 460.2,
    "kind": "phrase"
   },
   {
    "at": 497.8,
    "kind": "phrase"
   },
   {
    "at": 585.1,
    "kind": "rise"
   },
   {
    "at": 597.2,
    "kind": "phrase"
   },
   {
    "at": 635.6,
    "kind": "phrase"
   },
   {
    "at": 643.4,
    "kind": "rise"
   },
   {
    "at": 655.6,
    "kind": "rise"
   },
   {
    "at": 662.5,
    "kind": "rise"
   }
  ]
 },
 "evt_1790003057318": {
  "title": "EMA kontsert Varssavis on user1",
  "lufs": -23.7,
  "tp": -0.9,
  "lra": 21,
  "seconds": 5791,
  "gain": 0.7,
  "kind": "music",
  "kindConf": 1,
  "kindLean": "music",
  "kindBy": "tonal 0.279",
  "features": {
   "syll": 0.561,
   "depth": 5.622,
   "gaps": 21.504,
   "tonal": 0.279,
   "flat": 0.01,
   "beat": 0.227,
   "seconds": 600
  },
  "moments": [
   {
    "at": 4.1,
    "kind": "phrase"
   },
   {
    "at": 15.5,
    "kind": "rise"
   },
   {
    "at": 19.7,
    "kind": "rise"
   },
   {
    "at": 24,
    "kind": "rise"
   },
   {
    "at": 28.9,
    "kind": "rise"
   },
   {
    "at": 35.7,
    "kind": "rise"
   },
   {
    "at": 44.5,
    "kind": "rise"
   },
   {
    "at": 48.6,
    "kind": "rise"
   },
   {
    "at": 56.5,
    "kind": "rise"
   },
   {
    "at": 61.7,
    "kind": "rise"
   },
   {
    "at": 66.5,
    "kind": "rise"
   },
   {
    "at": 72.3,
    "kind": "rise"
   },
   {
    "at": 81.1,
    "kind": "rise"
   },
   {
    "at": 85.9,
    "kind": "rise"
   },
   {
    "at": 94.8,
    "kind": "rise"
   },
   {
    "at": 102.3,
    "kind": "rise"
   },
   {
    "at": 106.5,
    "kind": "rise"
   },
   {
    "at": 115.4,
    "kind": "phrase"
   },
   {
    "at": 142.7,
    "kind": "phrase"
   },
   {
    "at": 154.6,
    "kind": "phrase"
   },
   {
    "at": 178.2,
    "kind": "phrase"
   },
   {
    "at": 194.3,
    "kind": "rise"
   },
   {
    "at": 203.8,
    "kind": "rise"
   },
   {
    "at": 223.5,
    "kind": "phrase"
   },
   {
    "at": 229.4,
    "kind": "rise"
   },
   {
    "at": 234.1,
    "kind": "rise"
   },
   {
    "at": 240.1,
    "kind": "phrase"
   },
   {
    "at": 281,
    "kind": "phrase"
   },
   {
    "at": 294.7,
    "kind": "rise"
   },
   {
    "at": 307.4,
    "kind": "rise"
   },
   {
    "at": 714.1,
    "kind": "phrase"
   },
   {
    "at": 874.2,
    "kind": "phrase"
   },
   {
    "at": 981.4,
    "kind": "phrase"
   },
   {
    "at": 1159.9,
    "kind": "phrase"
   },
   {
    "at": 1187.8,
    "kind": "rise"
   },
   {
    "at": 1220,
    "kind": "phrase"
   },
   {
    "at": 1328,
    "kind": "phrase"
   },
   {
    "at": 1938.9,
    "kind": "phrase"
   },
   {
    "at": 1972.7,
    "kind": "rise"
   },
   {
    "at": 2038.2,
    "kind": "rise"
   },
   {
    "at": 2042.2,
    "kind": "phrase"
   },
   {
    "at": 2065.9,
    "kind": "rise"
   },
   {
    "at": 2096.7,
    "kind": "phrase"
   },
   {
    "at": 2106.2,
    "kind": "phrase"
   },
   {
    "at": 2113.7,
    "kind": "rise"
   },
   {
    "at": 2128.4,
    "kind": "phrase"
   },
   {
    "at": 2134,
    "kind": "phrase"
   },
   {
    "at": 2140.4,
    "kind": "rise"
   },
   {
    "at": 2147.4,
    "kind": "rise"
   },
   {
    "at": 2152.6,
    "kind": "rise"
   },
   {
    "at": 2167.6,
    "kind": "phrase"
   },
   {
    "at": 2177.9,
    "kind": "phrase"
   },
   {
    "at": 2181.9,
    "kind": "rise"
   },
   {
    "at": 2195.7,
    "kind": "rise"
   },
   {
    "at": 2206.8,
    "kind": "rise"
   },
   {
    "at": 2215.2,
    "kind": "rise"
   },
   {
    "at": 2220.1,
    "kind": "rise"
   },
   {
    "at": 2225.6,
    "kind": "rise"
   },
   {
    "at": 2231.1,
    "kind": "rise"
   },
   {
    "at": 2257.8,
    "kind": "rise"
   },
   {
    "at": 2272.4,
    "kind": "phrase"
   },
   {
    "at": 2281.6,
    "kind": "phrase"
   },
   {
    "at": 2311.6,
    "kind": "phrase"
   },
   {
    "at": 2320.9,
    "kind": "rise"
   },
   {
    "at": 2328.8,
    "kind": "rise"
   },
   {
    "at": 2338.1,
    "kind": "rise"
   },
   {
    "at": 2342.4,
    "kind": "rise"
   },
   {
    "at": 2360.5,
    "kind": "rise"
   },
   {
    "at": 2390.8,
    "kind": "rise"
   },
   {
    "at": 2404.3,
    "kind": "rise"
   },
   {
    "at": 2428.3,
    "kind": "phrase"
   },
   {
    "at": 2440.3,
    "kind": "rise"
   },
   {
    "at": 2444.3,
    "kind": "rise"
   },
   {
    "at": 2452.2,
    "kind": "rise"
   },
   {
    "at": 2481.7,
    "kind": "rise"
   },
   {
    "at": 2500.2,
    "kind": "rise"
   },
   {
    "at": 2535.6,
    "kind": "rise"
   },
   {
    "at": 2710.5,
    "kind": "phrase"
   },
   {
    "at": 2866.7,
    "kind": "rise"
   },
   {
    "at": 2873.7,
    "kind": "rise"
   },
   {
    "at": 2892.8,
    "kind": "rise"
   },
   {
    "at": 2899,
    "kind": "rise"
   },
   {
    "at": 2909.7,
    "kind": "phrase"
   },
   {
    "at": 2919.1,
    "kind": "rise"
   },
   {
    "at": 2952,
    "kind": "phrase"
   },
   {
    "at": 2956.6,
    "kind": "rise"
   },
   {
    "at": 2971.9,
    "kind": "rise"
   },
   {
    "at": 2980.8,
    "kind": "rise"
   },
   {
    "at": 2984.8,
    "kind": "rise"
   },
   {
    "at": 2991.3,
    "kind": "rise"
   },
   {
    "at": 3001.2,
    "kind": "rise"
   },
   {
    "at": 3024,
    "kind": "rise"
   },
   {
    "at": 3033.8,
    "kind": "rise"
   },
   {
    "at": 3041.5,
    "kind": "rise"
   },
   {
    "at": 3046.6,
    "kind": "rise"
   },
   {
    "at": 3054.5,
    "kind": "rise"
   },
   {
    "at": 3068.1,
    "kind": "rise"
   },
   {
    "at": 3079,
    "kind": "rise"
   },
   {
    "at": 3085.1,
    "kind": "rise"
   },
   {
    "at": 3095.1,
    "kind": "rise"
   },
   {
    "at": 3103.3,
    "kind": "rise"
   },
   {
    "at": 3109.3,
    "kind": "rise"
   },
   {
    "at": 3116.7,
    "kind": "rise"
   },
   {
    "at": 3124.1,
    "kind": "rise"
   },
   {
    "at": 3129.9,
    "kind": "rise"
   },
   {
    "at": 3143.3,
    "kind": "rise"
   },
   {
    "at": 3148.9,
    "kind": "rise"
   },
   {
    "at": 3157.7,
    "kind": "rise"
   },
   {
    "at": 3164.2,
    "kind": "rise"
   },
   {
    "at": 3170,
    "kind": "rise"
   },
   {
    "at": 3192.6,
    "kind": "rise"
   },
   {
    "at": 3203.5,
    "kind": "rise"
   },
   {
    "at": 3216.5,
    "kind": "rise"
   },
   {
    "at": 3222.8,
    "kind": "rise"
   },
   {
    "at": 3230.2,
    "kind": "rise"
   },
   {
    "at": 3238.9,
    "kind": "rise"
   },
   {
    "at": 3246.4,
    "kind": "rise"
   },
   {
    "at": 3250.7,
    "kind": "rise"
   },
   {
    "at": 3254.7,
    "kind": "rise"
   },
   {
    "at": 3259,
    "kind": "rise"
   },
   {
    "at": 3263.8,
    "kind": "phrase"
   },
   {
    "at": 3272.2,
    "kind": "phrase"
   },
   {
    "at": 3279.8,
    "kind": "phrase"
   },
   {
    "at": 3289.6,
    "kind": "phrase"
   },
   {
    "at": 3296.9,
    "kind": "phrase"
   },
   {
    "at": 3305.2,
    "kind": "phrase"
   },
   {
    "at": 3316.3,
    "kind": "phrase"
   },
   {
    "at": 3326.7,
    "kind": "rise"
   },
   {
    "at": 3358.4,
    "kind": "rise"
   },
   {
    "at": 3363.1,
    "kind": "rise"
   },
   {
    "at": 3369.4,
    "kind": "rise"
   },
   {
    "at": 3375.8,
    "kind": "rise"
   },
   {
    "at": 3383.3,
    "kind": "rise"
   },
   {
    "at": 3388.5,
    "kind": "rise"
   },
   {
    "at": 3395.8,
    "kind": "phrase"
   },
   {
    "at": 3403.6,
    "kind": "rise"
   },
   {
    "at": 3453.6,
    "kind": "phrase"
   },
   {
    "at": 3463,
    "kind": "phrase"
   },
   {
    "at": 3474.8,
    "kind": "phrase"
   },
   {
    "at": 3517.6,
    "kind": "phrase"
   },
   {
    "at": 3532.7,
    "kind": "phrase"
   },
   {
    "at": 3537.6,
    "kind": "phrase"
   },
   {
    "at": 3551.4,
    "kind": "phrase"
   },
   {
    "at": 3556.2,
    "kind": "rise"
   },
   {
    "at": 3561.7,
    "kind": "rise"
   },
   {
    "at": 3570.2,
    "kind": "rise"
   },
   {
    "at": 3574.3,
    "kind": "rise"
   },
   {
    "at": 3581.7,
    "kind": "phrase"
   },
   {
    "at": 3586.3,
    "kind": "rise"
   },
   {
    "at": 3593,
    "kind": "rise"
   },
   {
    "at": 3600,
    "kind": "rise"
   },
   {
    "at": 3607.3,
    "kind": "rise"
   },
   {
    "at": 3617.2,
    "kind": "phrase"
   },
   {
    "at": 3621.5,
    "kind": "rise"
   },
   {
    "at": 3626,
    "kind": "rise"
   },
   {
    "at": 3642,
    "kind": "rise"
   },
   {
    "at": 3646.2,
    "kind": "rise"
   },
   {
    "at": 3653.1,
    "kind": "rise"
   },
   {
    "at": 3659.4,
    "kind": "rise"
   },
   {
    "at": 3666.9,
    "kind": "phrase"
   },
   {
    "at": 3684.7,
    "kind": "rise"
   },
   {
    "at": 3694.9,
    "kind": "rise"
   },
   {
    "at": 3699.8,
    "kind": "rise"
   },
   {
    "at": 3857.7,
    "kind": "phrase"
   },
   {
    "at": 3869.5,
    "kind": "phrase"
   },
   {
    "at": 3879.2,
    "kind": "phrase"
   },
   {
    "at": 3900.8,
    "kind": "rise"
   },
   {
    "at": 3913.1,
    "kind": "rise"
   },
   {
    "at": 3922.1,
    "kind": "rise"
   },
   {
    "at": 3927.8,
    "kind": "rise"
   },
   {
    "at": 3948.2,
    "kind": "rise"
   },
   {
    "at": 3956.2,
    "kind": "rise"
   },
   {
    "at": 3960.8,
    "kind": "rise"
   },
   {
    "at": 3964.8,
    "kind": "rise"
   },
   {
    "at": 3971.7,
    "kind": "rise"
   },
   {
    "at": 4011.3,
    "kind": "phrase"
   },
   {
    "at": 4026.4,
    "kind": "phrase"
   },
   {
    "at": 4031.2,
    "kind": "phrase"
   },
   {
    "at": 4053.2,
    "kind": "phrase"
   },
   {
    "at": 4080.8,
    "kind": "rise"
   },
   {
    "at": 4106.1,
    "kind": "rise"
   },
   {
    "at": 4112.6,
    "kind": "phrase"
   },
   {
    "at": 4230.9,
    "kind": "phrase"
   },
   {
    "at": 4292.8,
    "kind": "phrase"
   },
   {
    "at": 4413.8,
    "kind": "phrase"
   },
   {
    "at": 4427.5,
    "kind": "phrase"
   },
   {
    "at": 4433.6,
    "kind": "rise"
   },
   {
    "at": 4461.2,
    "kind": "phrase"
   },
   {
    "at": 4474,
    "kind": "rise"
   },
   {
    "at": 4535,
    "kind": "phrase"
   },
   {
    "at": 4540.6,
    "kind": "phrase"
   },
   {
    "at": 4547.1,
    "kind": "rise"
   },
   {
    "at": 4553.1,
    "kind": "rise"
   },
   {
    "at": 4569.8,
    "kind": "phrase"
   },
   {
    "at": 4575.5,
    "kind": "phrase"
   },
   {
    "at": 4586.1,
    "kind": "rise"
   },
   {
    "at": 4599.1,
    "kind": "phrase"
   },
   {
    "at": 4610.8,
    "kind": "rise"
   },
   {
    "at": 4617.8,
    "kind": "rise"
   },
   {
    "at": 4623.3,
    "kind": "rise"
   },
   {
    "at": 4691.1,
    "kind": "phrase"
   },
   {
    "at": 4696.2,
    "kind": "phrase"
   },
   {
    "at": 4729.4,
    "kind": "rise"
   },
   {
    "at": 4757.7,
    "kind": "rise"
   },
   {
    "at": 4772.2,
    "kind": "rise"
   },
   {
    "at": 4776.2,
    "kind": "rise"
   },
   {
    "at": 4780.5,
    "kind": "rise"
   },
   {
    "at": 4815.2,
    "kind": "rise"
   },
   {
    "at": 4820,
    "kind": "rise"
   },
   {
    "at": 4825.6,
    "kind": "rise"
   },
   {
    "at": 4831,
    "kind": "rise"
   },
   {
    "at": 4848.9,
    "kind": "rise"
   },
   {
    "at": 4857.3,
    "kind": "rise"
   },
   {
    "at": 4887.3,
    "kind": "rise"
   },
   {
    "at": 4902.9,
    "kind": "rise"
   },
   {
    "at": 4910.4,
    "kind": "rise"
   },
   {
    "at": 4922.7,
    "kind": "rise"
   },
   {
    "at": 4932.5,
    "kind": "rise"
   },
   {
    "at": 4973.8,
    "kind": "phrase"
   },
   {
    "at": 4980,
    "kind": "rise"
   },
   {
    "at": 4987,
    "kind": "rise"
   },
   {
    "at": 4994.6,
    "kind": "rise"
   },
   {
    "at": 4999.7,
    "kind": "rise"
   },
   {
    "at": 5004.7,
    "kind": "rise"
   },
   {
    "at": 5010.8,
    "kind": "rise"
   },
   {
    "at": 5033.8,
    "kind": "rise"
   },
   {
    "at": 5045.1,
    "kind": "rise"
   },
   {
    "at": 5050.6,
    "kind": "phrase"
   },
   {
    "at": 5055.1,
    "kind": "phrase"
   },
   {
    "at": 5062.1,
    "kind": "rise"
   },
   {
    "at": 5085.6,
    "kind": "rise"
   },
   {
    "at": 5089.6,
    "kind": "rise"
   },
   {
    "at": 5112,
    "kind": "rise"
   },
   {
    "at": 5196.8,
    "kind": "phrase"
   },
   {
    "at": 5220.7,
    "kind": "phrase"
   },
   {
    "at": 5253.4,
    "kind": "phrase"
   },
   {
    "at": 5279.1,
    "kind": "phrase"
   },
   {
    "at": 5313.8,
    "kind": "phrase"
   },
   {
    "at": 5340.9,
    "kind": "rise"
   },
   {
    "at": 5344.9,
    "kind": "rise"
   },
   {
    "at": 5376.8,
    "kind": "rise"
   },
   {
    "at": 5475.4,
    "kind": "rise"
   },
   {
    "at": 5479.4,
    "kind": "rise"
   },
   {
    "at": 5565.6,
    "kind": "rise"
   },
   {
    "at": 5608.4,
    "kind": "rise"
   },
   {
    "at": 5658.2,
    "kind": "phrase"
   },
   {
    "at": 5667.1,
    "kind": "phrase"
   },
   {
    "at": 5788.7,
    "kind": "phrase"
   }
  ]
 },
 "evt_1789994563812": {
  "title": "EMA Varssavis on user1",
  "lufs": -24.2,
  "tp": -3.2,
  "lra": 22.8,
  "seconds": 642,
  "gain": 1.2,
  "kind": "music",
  "kindConf": 1,
  "kindLean": "music",
  "kindBy": "tonal 0.635",
  "features": {
   "syll": 0.296,
   "depth": 4.312,
   "gaps": 19.007,
   "tonal": 0.635,
   "flat": 0.002,
   "beat": 0.242,
   "seconds": 600
  },
  "moments": [
   {
    "at": 6.2,
    "kind": "rise"
   },
   {
    "at": 17.5,
    "kind": "phrase"
   },
   {
    "at": 24,
    "kind": "rise"
   },
   {
    "at": 29.6,
    "kind": "rise"
   },
   {
    "at": 35.4,
    "kind": "rise"
   },
   {
    "at": 40.9,
    "kind": "rise"
   },
   {
    "at": 46.6,
    "kind": "rise"
   },
   {
    "at": 50.7,
    "kind": "rise"
   },
   {
    "at": 63.5,
    "kind": "rise"
   },
   {
    "at": 67.5,
    "kind": "rise"
   },
   {
    "at": 72.1,
    "kind": "rise"
   },
   {
    "at": 115.6,
    "kind": "phrase"
   },
   {
    "at": 131.1,
    "kind": "rise"
   },
   {
    "at": 148.2,
    "kind": "phrase"
   },
   {
    "at": 153,
    "kind": "rise"
   },
   {
    "at": 157.3,
    "kind": "rise"
   },
   {
    "at": 162.6,
    "kind": "rise"
   },
   {
    "at": 174,
    "kind": "rise"
   },
   {
    "at": 179.9,
    "kind": "phrase"
   },
   {
    "at": 184.3,
    "kind": "rise"
   },
   {
    "at": 225,
    "kind": "rise"
   },
   {
    "at": 333.3,
    "kind": "rise"
   },
   {
    "at": 367.4,
    "kind": "rise"
   },
   {
    "at": 392.5,
    "kind": "phrase"
   },
   {
    "at": 398.8,
    "kind": "rise"
   },
   {
    "at": 405.3,
    "kind": "rise"
   },
   {
    "at": 410.5,
    "kind": "rise"
   },
   {
    "at": 417.7,
    "kind": "rise"
   },
   {
    "at": 430.2,
    "kind": "rise"
   },
   {
    "at": 441.1,
    "kind": "phrase"
   },
   {
    "at": 452.5,
    "kind": "rise"
   },
   {
    "at": 460.5,
    "kind": "rise"
   },
   {
    "at": 464.5,
    "kind": "rise"
   },
   {
    "at": 469.8,
    "kind": "rise"
   },
   {
    "at": 475.5,
    "kind": "rise"
   },
   {
    "at": 485.9,
    "kind": "rise"
   },
   {
    "at": 506.2,
    "kind": "phrase"
   },
   {
    "at": 513.3,
    "kind": "rise"
   },
   {
    "at": 528.2,
    "kind": "rise"
   },
   {
    "at": 542.1,
    "kind": "rise"
   },
   {
    "at": 561.9,
    "kind": "phrase"
   },
   {
    "at": 568.1,
    "kind": "rise"
   },
   {
    "at": 572.3,
    "kind": "rise"
   },
   {
    "at": 576.4,
    "kind": "rise"
   },
   {
    "at": 581.5,
    "kind": "phrase"
   },
   {
    "at": 586.6,
    "kind": "rise"
   },
   {
    "at": 593.9,
    "kind": "rise"
   },
   {
    "at": 598.6,
    "kind": "rise"
   },
   {
    "at": 604.6,
    "kind": "rise"
   },
   {
    "at": 612.6,
    "kind": "rise"
   }
  ]
 },
 "evt_1786054444346": {
  "title": "Audio test",
  "lufs": -26.8,
  "tp": -2.6,
  "lra": 21.9,
  "seconds": 301,
  "gain": 3.8,
  "kind": "music",
  "kindConf": 0.75,
  "kindLean": "music",
  "kindBy": "tonal 0.155",
  "features": {
   "syll": 0.785,
   "depth": 4.304,
   "gaps": 28.927,
   "tonal": 0.155,
   "flat": 0.032,
   "beat": 0.41,
   "seconds": 301
  },
  "moments": [
   {
    "at": 61.3,
    "kind": "phrase"
   },
   {
    "at": 148.9,
    "kind": "phrase"
   },
   {
    "at": 191.9,
    "kind": "rise"
   },
   {
    "at": 209.5,
    "kind": "rise"
   },
   {
    "at": 215.3,
    "kind": "phrase"
   },
   {
    "at": 243,
    "kind": "rise"
   },
   {
    "at": 263.3,
    "kind": "rise"
   }
  ]
 }
};
export const UNMEASURED = {};
/** What /feed adds to an item: gain in dB (0 when never measured), kind and kindConf (null then), soften, seconds, moments. */
export const levelFor = (id) => { const g = GAINS[String(id)]; return { gain: g?.gain ?? 0, kind: g?.kind ?? null, kindConf: g?.kindConf ?? null, soften: !!g?.soften, seconds: g?.seconds ?? null, moments: g?.moments ?? [] }; };
