export const FLOW_PREVIOUS_AMBUSH = {"revision":"2026-11-13-pit-retreat-1","groups":[{"id":"TankEscort","label":"头车护卫","beat":"03h","endBeat":"06e","triggerId":"Trigger_TankEscort","enabled":true,"side":"enemy","target":"player","area":{"shape":"rect","center":[113,72],"size":[7,34]},"route":[[113,72],[110,114],[108,150],[106,182],[103,212],[101,240],[101,269]],"count":5,"interval":2.2,"maxAlive":5,"lifetime":400,"speed":1.7,"grenadeInterval":12,"behavior":"escort","note":"头车四至五人，演示取五人","tankId":"tank1","spawnOffsets":[[-1.6,-2],[-1.9,-5.5],[-1.6,-9],[-1.9,-12.5],[-1.6,-16]],"memberPlans":[{"delay":0,"route":[[108.4,112],[106.4,148],[104.4,180],[101.4,210],[99.4,238],[99.4,267]]},{"delay":0.6,"route":[[108.1,108.5],[106.1,144.5],[104.1,176.5],[101.1,206.5],[99.1,234.5],[99.1,263.5]]},{"delay":1.2,"route":[[108.4,105],[106.4,141],[104.4,173],[101.4,203],[99.4,231],[99.4,260]]},{"delay":1.8,"route":[[108.1,101.5],[106.1,137.5],[104.1,169.5],[101.1,199.5],[99.1,227.5],[99.1,256.5]]},{"delay":2.4,"route":[[108.4,98],[106.4,134],[104.4,166],[101.4,196],[99.4,224],[99.4,253]]}]},{"id":"TankRearScreen","label":"后车行军护卫","beat":"03h","endBeat":"06f","triggerId":"Trigger_TankEscort","enabled":true,"side":"enemy","target":"player","area":{"shape":"rect","center":[116,56],"size":[7,27]},"route":[[116,56],[112,98],[110,134],[108,166],[105,196],[103,218],[101,249]],"count":4,"interval":2,"maxAlive":4,"lifetime":470,"speed":1.7,"behavior":"escort","note":"关卡调度布设","tankId":"tank2","grenadeInterval":14,"spawnOffsets":[[2.2,-2],[2.7,-5.5],[2.2,-9],[2.7,-12.5]],"memberPlans":[{"delay":0.4,"route":[[114.2,96],[112.2,132],[110.2,164],[107.2,194],[105.2,216],[103.2,247]]},{"delay":1,"route":[[114.7,92.5],[112.7,128.5],[110.7,160.5],[107.7,190.5],[105.7,212.5],[103.7,243.5]]},{"delay":1.6,"route":[[114.2,89],[112.2,125],[110.2,157],[107.2,187],[105.2,209],[103.2,240]]},{"delay":2.2,"route":[[114.7,85.5],[112.7,121.5],[110.7,153.5],[107.7,183.5],[105.7,205.5],[103.7,236.5]]}]},{"id":"LaneGround","label":"凹路西坎阻击","beat":"03a","endBeat":"06h","triggerId":"Trigger_LaneGround","enabled":true,"side":"friend","target":"enemy","area":{"shape":"rect","center":[72,190],"size":[3,3]},"route":[[72,190]],"count":3,"interval":2,"maxAlive":3,"lifetime":800,"speed":2.2,"behavior":"guard","note":"关卡调度布设","weapon":"rifle"},{"id":"BendGround","label":"弯口接应","beat":"03a","endBeat":"06h","triggerId":"Trigger_BendGround","enabled":true,"side":"friend","target":"enemy","area":{"shape":"rect","center":[80,279],"size":[3,3]},"route":[[80,279]],"count":2,"interval":2,"maxAlive":2,"lifetime":800,"speed":2.2,"behavior":"guard","note":"关卡调度布设","weapon":"machineGun"}],"triggers":[{"id":"Trigger_TankEscort","label":"头车护卫","beat":"03h","endBeat":"06e","mode":"area","delay":0,"area":{"shape":"rect","center":[32.5,101],"size":[8,8]}},{"id":"Trigger_LaneGround","label":"凹路西坎阻击","beat":"03a","endBeat":"06h","mode":"time","delay":0,"area":{"shape":"rect","center":[61,64.6],"size":[6,6]}},{"id":"Trigger_BendGround","label":"弯口接应","beat":"03a","endBeat":"06h","mode":"time","delay":0,"area":{"shape":"rect","center":[61,64.6],"size":[6,6]}}]};
export const FLOW_PREVIOUS_FRONT_DEFENSE = {"revision":"2026-11-14-bend-ambush-1","groups":[{"id":"Rim","label":"③ 追着幺娃来的日军","beat":"03d","endBeat":"03g","triggerId":"Trigger_Rim","enabled":true,"side":"enemy","target":"player","area":{"shape":"rect","center":[-8,-20],"size":[2.4,3]},"route":[[-8,-20],[2,-20],[2,-10],[0,-7],[0,11],[13,21],[17,36],[14.5,40],[12,44],[16,53],[21.9,67.1]],"standoffMetres":16,"count":3,"interval":2,"maxAlive":3,"lifetime":82,"speed":1.7,"grenadeInterval":0,"behavior":"advance","note":"从机枪坑北侧土墙后跟进，经北坡进入交通沟，在北沟沙包处停步压制，保持十六米交战距离"},{"id":"TrafficFlank","label":"西坡土墙后追兵","beat":"03h","endBeat":"04a","triggerId":"Trigger_TrafficFlank","enabled":true,"side":"enemy","target":"player","area":{"shape":"rect","center":[-2,70],"size":[3,5]},"route":[[-2,70],[8,68],[14,68],[14,77],[20,76.8],[26,76.6],[28,81],[30,86],[32.5,101],[34,117]],"reinforceAfterClear":true,"standoffMetres":16,"count":6,"interval":2,"maxAlive":3,"lifetime":30,"speed":3.4,"grenadeInterval":10,"behavior":"advance","note":"玩家到标记 2 后，西坡两批各三人从土墙后绕行进入，逐段追击并保持十六米射击距离"},{"id":"RearPursuit","label":"③ 北坡下沟第二波","beat":"03g","endBeat":"03h","triggerId":"Trigger_RearPursuit","enabled":true,"side":"enemy","target":"player","area":{"shape":"rect","center":[20,33],"size":[3,3]},"route":[[20,33],[17,36],[14.5,40],[12,44],[21.9,67.1],[26,76.6],[30,86],[32.5,101],[34,117]],"count":3,"interval":2.5,"maxAlive":3,"lifetime":54,"speed":2.2,"behavior":"bounds","note":"关卡调度布设","standoffMetres":16,"grenadeInterval":11}]};

export const FLOW_PREVIOUS_TANK_APPROACH = {
  "groups": [
    {
      "id": "TankEscort",
      "label": "头车护卫",
      "beat": "06a",
      "endBeat": "06e",
      "triggerId": "Trigger_TankEscort",
      "enabled": true,
      "side": "enemy",
      "target": "player",
      "area": {
        "shape": "rect",
        "center": [
          105,
          187
        ],
        "size": [
          7,
          34
        ]
      },
      "route": [
        [
          105,
          187
        ],
        [
          103,
          212
        ],
        [
          101,
          240
        ],
        [
          101,
          269
        ]
      ],
      "count": 5,
      "interval": 2.2,
      "maxAlive": 5,
      "lifetime": 182,
      "speed": 2.2,
      "grenadeInterval": 12,
      "behavior": "escort",
      "note": "步兵阻击后才随两辆战车追入，头车护卫五人",
      "tankId": "tank1",
      "spawnOffsets": [
        [
          -1.6,
          -2
        ],
        [
          -1.9,
          -5.5
        ],
        [
          -1.6,
          -9
        ],
        [
          -1.9,
          -12.5
        ],
        [
          -1.6,
          -16
        ]
      ],
      "memberPlans": [
        {
          "delay": 0,
          "route": [
            [
              101.4,
              210
            ],
            [
              99.4,
              238
            ],
            [
              99.4,
              267
            ]
          ]
        },
        {
          "delay": 0.6,
          "route": [
            [
              101.1,
              206.5
            ],
            [
              99.1,
              234.5
            ],
            [
              99.1,
              263.5
            ]
          ]
        },
        {
          "delay": 1.2,
          "route": [
            [
              101.4,
              203
            ],
            [
              99.4,
              231
            ],
            [
              99.4,
              260
            ]
          ]
        },
        {
          "delay": 1.8,
          "route": [
            [
              101.1,
              199.5
            ],
            [
              99.1,
              227.5
            ],
            [
              99.1,
              256.5
            ]
          ]
        },
        {
          "delay": 2.4,
          "route": [
            [
              101.4,
              196
            ],
            [
              99.4,
              224
            ],
            [
              99.4,
              253
            ]
          ]
        }
      ]
    },
    {
      "id": "TankRearScreen",
      "label": "后车行军护卫",
      "beat": "06a",
      "endBeat": "06f",
      "triggerId": "Trigger_TankEscort",
      "enabled": true,
      "side": "enemy",
      "target": "player",
      "area": {
        "shape": "rect",
        "center": [
          107,
          170
        ],
        "size": [
          7,
          27
        ]
      },
      "route": [
        [
          107,
          170
        ],
        [
          105,
          196
        ],
        [
          103,
          218
        ],
        [
          101,
          249
        ]
      ],
      "count": 4,
      "interval": 2,
      "maxAlive": 4,
      "lifetime": 260,
      "speed": 2.2,
      "behavior": "escort",
      "note": "关卡调度布设",
      "tankId": "tank2",
      "grenadeInterval": 14,
      "spawnOffsets": [
        [
          2.2,
          -2
        ],
        [
          2.7,
          -5.5
        ],
        [
          2.2,
          -9
        ],
        [
          2.7,
          -12.5
        ]
      ],
      "memberPlans": [
        {
          "delay": 0.4,
          "route": [
            [
              107.2,
              194
            ],
            [
              105.2,
              216
            ],
            [
              103.2,
              247
            ]
          ]
        },
        {
          "delay": 1,
          "route": [
            [
              107.7,
              190.5
            ],
            [
              105.7,
              212.5
            ],
            [
              103.7,
              243.5
            ]
          ]
        },
        {
          "delay": 1.6,
          "route": [
            [
              107.2,
              187
            ],
            [
              105.2,
              209
            ],
            [
              103.2,
              240
            ]
          ]
        },
        {
          "delay": 2.2,
          "route": [
            [
              107.7,
              183.5
            ],
            [
              105.7,
              205.5
            ],
            [
              103.7,
              236.5
            ]
          ]
        }
      ]
    }
  ],
  "triggers": [
    {
      "id": "Trigger_TankEscort",
      "label": "头车护卫",
      "beat": "06a",
      "endBeat": "06e",
      "mode": "area",
      "delay": 0,
      "area": {
        "shape": "rect",
        "center": [
          86,
          225
        ],
        "size": [
          8,
          8
        ]
      }
    }
  ]
};
