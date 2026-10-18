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
  }
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
  }
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
  }
 },
 "evt_1791829792104": {
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
  }
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
  }
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
  }
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
  }
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
  }
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
  }
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
  }
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
  }
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
  }
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
  }
 }
};
export const UNMEASURED = {
 "evt_1791830156488": {
  "title": "VÃ¤in on user1",
  "why": "an empty file from /file/"
 }
};
/** What /feed adds to an item: gain in dB (0 when never measured), kind and kindConf (null then), soften, seconds. */
export const levelFor = (id) => { const g = GAINS[String(id)]; return { gain: g?.gain ?? 0, kind: g?.kind ?? null, kindConf: g?.kindConf ?? null, soften: !!g?.soften, seconds: g?.seconds ?? null }; };
