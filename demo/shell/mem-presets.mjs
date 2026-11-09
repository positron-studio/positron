// demo/shell/mem-presets.mjs: MEM's presets (the music) and hosts (what a machine can carry, applied over any preset).
// The presets came from v2in server/engines/mem/presets.json at eaadb58; positron holds the master copy since 2026-11-09.
// The host numbers are guesses until measured on each machine.
export const PRESETS = {
  "default": "drift",
  "presets": {
    "sparse": {
      "says": "four speakers, long takes that live for minutes, one change at a time, little processing, the room close and drifting a little",
      "players": 4,
      "enter": [
        10,
        30
      ],
      "level": 1,
      "dry": 0,
      "takes": {
        "min": 8,
        "max": 36,
        "every": [
          40,
          110
        ],
        "life": [
          150,
          360
        ],
        "xfade": [
          4,
          9
        ],
        "memory": 40,
        "revisit": 0.2,
        "past": 0.15,
        "gateDb": -45,
        "minLcm": 600,
        "tiers": {
          "mid": [
            8,
            15
          ],
          "long": [
            15,
            36
          ]
        },
        "mix": {
          "mid": 0.5,
          "long": 0.5
        },
        "speech": 0.2,
        "apart": 8
      },
      "colour": {
        "hp": [
          170,
          230
        ],
        "lp": [
          6000,
          8000
        ],
        "drive": [
          1.1,
          1.8
        ]
      },
      "process": {
        "speed": {
          "p": 0.3,
          "lo": 0.96,
          "hi": 1.02,
          "every": [
            60,
            180
          ],
          "glide": [
            15,
            40
          ],
          "max": 1
        },
        "reverse": 0.1,
        "disintegrate": [
          0.02,
          0.12
        ],
        "maxPasses": 60,
        "freeze": {
          "p": 0.05,
          "len": [
            0.6,
            1.6
          ],
          "hold": [
            12,
            30
          ],
          "max": 1
        }
      },
      "room": {
        "arrangements": [
          "ring",
          "line"
        ],
        "hold": [
          150,
          300
        ],
        "move": [
          90,
          180
        ],
        "width": 1,
        "distance": 1,
        "itd": 0.0006,
        "reverb": {
          "room": 0.7,
          "damp": 0.5,
          "level": 0.6,
          "send": 1
        },
        "walk": {
          "p": 0.5,
          "angle": 10,
          "distance": 0.2,
          "period": [
            90,
            240
          ]
        }
      },
      "spacing": 15
    },
    "dense": {
      "says": "the busiest: up to eight speakers, short loops beside long ones, breathing through moods from one loop to eight, one change every few seconds",
      "players": 8,
      "enter": [
        8,
        20
      ],
      "spacing": 6,
      "level": 1,
      "dry": 0.1,
      "dryDelay": 0.5,
      "takes": {
        "min": 2,
        "max": 40,
        "tiers": {
          "short": [
            2,
            6
          ],
          "mid": [
            6,
            15
          ],
          "long": [
            15,
            40
          ]
        },
        "mix": {
          "short": 0.35,
          "mid": 0.35,
          "long": 0.3
        },
        "every": [
          20,
          50
        ],
        "life": [
          60,
          180
        ],
        "xfade": [
          4,
          10
        ],
        "memory": 60,
        "revisit": 0.3,
        "past": 0.2,
        "gateDb": -45,
        "minLcm": 300,
        "speech": 0.2,
        "apart": 8
      },
      "colour": {
        "hp": [
          180,
          260
        ],
        "lp": [
          5000,
          7500
        ],
        "drive": [
          1.3,
          2.4
        ]
      },
      "process": {
        "speed": {
          "p": 0.45,
          "lo": 0.8,
          "hi": 1.1,
          "every": [
            60,
            150
          ],
          "glide": [
            15,
            45
          ],
          "max": 2
        },
        "reverse": 0.2,
        "disintegrate": [
          0.08,
          0.3
        ],
        "maxPasses": 50,
        "freeze": {
          "p": 0.12,
          "len": [
            0.5,
            1.5
          ],
          "hold": [
            10,
            25
          ],
          "max": 1
        }
      },
      "room": {
        "arrangements": [
          "ring",
          "line",
          "corner",
          "pairs"
        ],
        "hold": [
          90,
          200
        ],
        "move": [
          60,
          140
        ],
        "width": 1,
        "distance": 1,
        "itd": 0.0006,
        "walk": {
          "p": 0.7,
          "angle": 20,
          "distance": 0.4,
          "period": [
            50,
            160
          ]
        },
        "reverb": {
          "room": 0.75,
          "damp": 0.5,
          "level": 0.5,
          "send": 1
        }
      },
      "moods": [
        {
          "name": "thin",
          "s": [
            90,
            180
          ],
          "players": [
            2,
            3
          ],
          "mix": {
            "short": 0,
            "mid": 0.3,
            "long": 0.7
          },
          "pace": 1.6,
          "process": 0.5
        },
        {
          "name": "building",
          "s": [
            120,
            200
          ],
          "players": [
            4,
            6
          ],
          "mix": {
            "short": 0.3,
            "mid": 0.4,
            "long": 0.3
          },
          "pace": 1.1,
          "process": 0.8
        },
        {
          "name": "dense",
          "s": [
            120,
            240
          ],
          "players": [
            7,
            8
          ],
          "mix": {
            "short": 0.45,
            "mid": 0.35,
            "long": 0.2
          },
          "pace": 0.9,
          "process": 1.1
        },
        {
          "name": "thinning",
          "s": [
            90,
            180
          ],
          "players": [
            3,
            5
          ],
          "mix": {
            "short": 0.1,
            "mid": 0.4,
            "long": 0.5
          },
          "pace": 1.3,
          "process": 1.3
        },
        {
          "name": "one loop",
          "s": [
            45,
            100
          ],
          "players": [
            1,
            1
          ],
          "mix": {
            "short": 0,
            "mid": 0,
            "long": 1
          },
          "pace": 2,
          "process": 0.7
        }
      ]
    },
    "far": {
      "says": "six speakers far off in a large room, slowed and darkening takes that fall apart over their passes, wandering slowly",
      "players": 6,
      "enter": [
        8,
        24
      ],
      "level": 1,
      "dry": 0,
      "takes": {
        "min": 4,
        "max": 30,
        "every": [
          30,
          90
        ],
        "life": [
          120,
          300
        ],
        "xfade": [
          6,
          12
        ],
        "memory": 40,
        "revisit": 0.3,
        "past": 0.25,
        "gateDb": -45,
        "minLcm": 600,
        "tiers": {
          "mid": [
            4,
            12
          ],
          "long": [
            12,
            30
          ]
        },
        "mix": {
          "mid": 0.5,
          "long": 0.5
        },
        "speech": 0.2,
        "apart": 8
      },
      "colour": {
        "hp": [
          160,
          220
        ],
        "lp": [
          4500,
          6500
        ],
        "drive": [
          1.2,
          2
        ]
      },
      "process": {
        "speed": {
          "p": 0.7,
          "lo": 0.55,
          "hi": 0.95,
          "every": [
            50,
            150
          ],
          "glide": [
            20,
            60
          ],
          "max": 2
        },
        "reverse": 0.3,
        "disintegrate": [
          0.3,
          0.6
        ],
        "maxPasses": 30,
        "freeze": {
          "p": 0.15,
          "len": [
            0.8,
            2
          ],
          "hold": [
            15,
            40
          ],
          "max": 1
        }
      },
      "room": {
        "arrangements": [
          "corner",
          "pairs",
          "ring"
        ],
        "hold": [
          90,
          200
        ],
        "move": [
          60,
          150
        ],
        "width": 0.9,
        "distance": 1.8,
        "itd": 0.0005,
        "reverb": {
          "room": 0.92,
          "damp": 0.6,
          "level": 0.8,
          "send": 1.2
        },
        "walk": {
          "p": 0.8,
          "angle": 18,
          "distance": 0.5,
          "period": [
            80,
            220
          ]
        }
      },
      "spacing": 12
    },
    "drift": {
      "says": "the most varied, for many hours: six speakers wandering in a wide room, moods from one far loop to a swell of six, long loops under short ones",
      "players": 6,
      "enter": [
        10,
        25
      ],
      "spacing": 10,
      "level": 1,
      "dry": 0,
      "takes": {
        "min": 2,
        "max": 40,
        "tiers": {
          "short": [
            2,
            5
          ],
          "mid": [
            5,
            14
          ],
          "long": [
            14,
            40
          ]
        },
        "mix": {
          "short": 0.25,
          "mid": 0.35,
          "long": 0.4
        },
        "every": [
          30,
          80
        ],
        "life": [
          90,
          240
        ],
        "xfade": [
          6,
          12
        ],
        "memory": 60,
        "revisit": 0.35,
        "past": 0.25,
        "gateDb": -45,
        "minLcm": 600,
        "speech": 0.2,
        "apart": 8
      },
      "colour": {
        "hp": [
          160,
          240
        ],
        "lp": [
          4800,
          7500
        ],
        "drive": [
          1.1,
          2.2
        ]
      },
      "process": {
        "speed": {
          "p": 0.5,
          "lo": 0.7,
          "hi": 1.05,
          "every": [
            80,
            200
          ],
          "glide": [
            20,
            60
          ],
          "max": 1
        },
        "reverse": 0.25,
        "disintegrate": [
          0.1,
          0.45
        ],
        "maxPasses": 45,
        "freeze": {
          "p": 0.12,
          "len": [
            0.6,
            2
          ],
          "hold": [
            12,
            35
          ],
          "max": 1
        }
      },
      "room": {
        "arrangements": [
          "ring",
          "pairs",
          "corner",
          "line"
        ],
        "hold": [
          120,
          260
        ],
        "move": [
          90,
          200
        ],
        "width": 1,
        "distance": 1.3,
        "itd": 0.0006,
        "walk": {
          "p": 0.75,
          "angle": 28,
          "distance": 0.6,
          "period": [
            70,
            240
          ]
        },
        "reverb": {
          "room": 0.85,
          "damp": 0.55,
          "level": 0.65,
          "send": 1.1
        }
      },
      "moods": [
        {
          "name": "still",
          "s": [
            120,
            240
          ],
          "players": [
            1,
            2
          ],
          "mix": {
            "short": 0,
            "mid": 0.2,
            "long": 0.8
          },
          "pace": 1.8,
          "process": 0.6
        },
        {
          "name": "gather",
          "s": [
            150,
            260
          ],
          "players": [
            3,
            4
          ],
          "mix": {
            "short": 0.2,
            "mid": 0.4,
            "long": 0.4
          },
          "pace": 1.2,
          "process": 0.9
        },
        {
          "name": "swell",
          "s": [
            120,
            220
          ],
          "players": [
            5,
            6
          ],
          "mix": {
            "short": 0.35,
            "mid": 0.35,
            "long": 0.3
          },
          "pace": 1,
          "process": 1
        },
        {
          "name": "scatter",
          "s": [
            120,
            220
          ],
          "players": [
            2,
            4
          ],
          "mix": {
            "short": 0.5,
            "mid": 0,
            "long": 0.5
          },
          "pace": 1.2,
          "process": 1.5
        }
      ]
    },
      "colours": {
        "says": "colour always moving: eight speakers coming in fast, most loops short-lived and a few staying for minutes, each speaker's filters gliding on their own",
        "players": 8,
        "enter": [
          3,
          10
        ],
        "spacing": 4,
        "level": 1,
        "dry": 0,
        "takes": {
          "min": 2,
          "max": 40,
          "tiers": {
            "short": [
              2,
              5
            ],
            "mid": [
              5,
              14
            ],
            "long": [
              14,
              40
            ]
          },
          "mix": {
            "short": 0.25,
            "mid": 0.35,
            "long": 0.4
          },
          "every": [
            8,
            25
          ],
          "life": [
            25,
            90
          ],
          "fadeIn": [
          8,
          20
        ],
        "xfade": [
            3,
            8
          ],
          "memory": 80,
          "revisit": 0.3,
          "past": 0.25,
          "gateDb": -45,
          "minLcm": 600,
          "speech": 0.2,
          "apart": 8,
          "stay": {
            "p": 0.3,
            "life": [
              240,
              720
            ]
          }
        },
        "colour": {
          "hp": [
            70,
            1200
          ],
          "lp": [
            1200,
            11000
          ],
          "drive": [
            1,
            3.4
          ],
          "walk": {
            "glide": [
              4,
              18
            ],
            "hold": [
              0,
              6
            ]
          }
        },
        "process": {
          "speed": {
            "p": 0.5,
            "lo": 0.7,
            "hi": 1.05,
            "every": [
              80,
              200
            ],
            "glide": [
              20,
              60
            ],
            "max": 1
          },
          "reverse": 0.25,
          "disintegrate": [
            0.1,
            0.45
          ],
          "maxPasses": 45,
          "freeze": {
            "p": 0.12,
            "len": [
              0.6,
              2
            ],
            "hold": [
              12,
              35
            ],
            "max": 1
          }
        },
        "room": {
          "arrangements": [
            "ring",
            "pairs",
            "corner",
            "line"
          ],
          "hold": [
            120,
            260
          ],
          "move": [
            90,
            200
          ],
          "width": 1,
          "distance": 1.3,
          "itd": 0.0006,
          "walk": {
            "p": 0.75,
            "angle": 28,
            "distance": 0.6,
            "period": [
              70,
              240
            ]
          },
          "reverb": {
            "room": 0.85,
            "damp": 0.55,
            "level": 0.65,
            "send": 1.1
          }
        },
        "moods": [
          {
            "name": "gather",
            "s": [
              60,
              120
            ],
            "players": [
              3,
              5
            ],
            "mix": {
              "short": 0.4,
              "mid": 0.4,
              "long": 0.2
            },
            "pace": 0.7,
            "process": 1
          },
          {
            "name": "swarm",
            "s": [
              90,
              180
            ],
            "players": [
              6,
              8
            ],
            "mix": {
              "short": 0.5,
              "mid": 0.3,
              "long": 0.2
            },
            "pace": 0.5,
            "process": 1.2
          },
          {
            "name": "thin",
            "s": [
              40,
              90
            ],
            "players": [
              2,
              3
            ],
            "mix": {
              "short": 0.2,
              "mid": 0.4,
              "long": 0.4
            },
            "pace": 0.8,
            "process": 0.8
          }
        ]
      }
  }
};

export const HOSTS = {
  "server": {
    "says": "a server with memory to spare: the engine as v2in runs it",
    "rate": 44100,
    "ringS": 300,
    "players": 12
  },
  "tab": {
    "says": "a desk browser tab",
    "rate": 44100,
    "ringS": 300,
    "players": 8
  },
  "pi": {
    "says": "the Raspberry Pi beside the receiver",
    "rate": 24000,
    "ringS": 300,
    "players": 6
  },
  "worker": {
    "says": "a Cloudflare Durable Object, 128 MB in all",
    "rate": 12000,
    "ringS": 240,
    "players": 6
  },
  "phone": {
    "says": "a phone tab",
    "rate": 24000,
    "ringS": 90,
    "players": 4
  }
};
