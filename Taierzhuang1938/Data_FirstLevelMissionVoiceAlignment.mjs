import { GUIDE_VOICE_ALIGNMENT } from "./Data_FirstLevelGuideVoiceAlignment.mjs";
// Complete Seed Audio takes, source-relative forced alignment; model recorded per cue.
// Audio and script hashes prevent reuse after a Notion dialogue change.
export const MISSION_VOICE_ALIGNMENT = Object.freeze({
  ...GUIDE_VOICE_ALIGNMENT,
  "TrainMeal": {
    "sha256": "8fe5a4f72f2f36980b48a2a9e67f07f20db26f28a03ded8cad612c89cef3ddf7",
    "scriptSha256": "5e8deb7f0f6c0df1cf2b0761f36602fcc5b289587351c7e620dd5058f1aebae1",
    "groupsSha256": "4ecf07b9fa02d5aa519e16aeddb2a390ce13df7d3633dca185a4cff3b5a90b82",
    "lines": [
      [
        0.0,
        4.64
      ],
      [
        4.76,
        7.58
      ],
      [
        8.06,
        11.26
      ],
      [
        11.76,
        15.74
      ],
      [
        16.34,
        19.08
      ],
      [
        19.9,
        22.28
      ],
      [
        22.52,
        24.36
      ],
      [
        24.5,
        28.82
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "TrainShelling": {
    "sha256": "b245adeb13391beb7e79c720368b329496ef905304781131aebe05da68302409",
    "scriptSha256": "52a31aeb8a31911af0dfd2b8ae3fe07dcd9d9485213ec3b84a2274fe0132f0ff",
    "groupsSha256": "37d14b56560e27cf1ede8cee9d9e4892c2e5f6422fa3ce3699bf33d19b4891cb",
    "lines": [
      [
        0.0,
        1.68
      ],
      [
        2.22,
        3.38
      ]
    ],
    "model": "faster-whisper small CPU int8",
    "markers": {
      "rescueLift": 2.46,
      "rescueFeet": 3.02
    },
    "note": "Whole two-line rescue; grip at second-line onset, lift during qi-lai, feet steady before gen-dao-wo. Unprompted transcripts retained locally; dialect homophones require listening review."
  },
  "EscapeWhisper": {
    "sha256": "c3615769347e02fab3efc972e1a4b2ddec2a0c4a385ea680f17bdf4adedfe040",
    "scriptSha256": "05097ab8402193fb7bcdab8e3f7d0fe067d9887aabf3574c8d6e18f023b54c3f",
    "groupsSha256": "3b14829c455fcfde647e79dd701e2a7c89d555215c5a7ecf4e463858b963659e",
    "lines": [
      [
        0.0,
        3.96
      ],
      [
        4.14,
        5.14
      ],
      [
        5.82,
        8.48
      ],
      [
        8.7,
        9.62
      ],
      [
        9.94,
        11.52
      ],
      [
        11.98,
        15.86
      ],
      [
        16.22,
        16.92
      ],
      [
        17.3,
        20.04
      ],
      [
        20.9,
        22.26
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "SupportOrder": {
    "sha256": "4a63b48d56b4185a675fd10fa908720e98354c1eb33954255fb36ec39e2308de",
    "scriptSha256": "2ddd2aabc45edde5ed91ed857970a630bdd611c6d4cdfcb7dd54c91ed54831a6",
    "groupsSha256": "87b5169d13f766ecbecb7806c4f8afe62f09da565c4133bef77dde9533a192dd",
    "lines": [
      [
        0.0,
        4.78
      ],
      [
        5.24,
        5.62
      ],
      [
        6.46,
        9.06
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "TankTerror": {
    "sha256": "961a3c76c9730620cc6a3ef283da3410dd3519e6787e519c89c6e88b54cab7ea",
    "scriptSha256": "33677bf2b9369cdf90ee18cc6293ec6a1685453a08e350e186e806eea53815c4",
    "groupsSha256": "0a50cc1563d718285e7eb41be35d50b6939f092873acb814ae55c36230de921e",
    "lines": [
      [
        0.0,
        3.24
      ],
      [
        3.38,
        6.5
      ],
      [
        7.0,
        9.1
      ],
      [
        9.3,
        11.5
      ],
      [
        12.32,
        14.0
      ],
      [
        14.34,
        15.1
      ],
      [
        15.24,
        17.54
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "TakeMachineGun": {
    "sha256": "8d029ba5aa6d7f3a1823ca98d79122460d0fa928b0d4dd514e2e86e3bb5ab471",
    "scriptSha256": "dd1c709643793fe6a64d3e54326aa0259795a7baa61e508b0d8575ee6f0f03f3",
    "groupsSha256": "a53cc65d7264552606d0d37dae6344f3432cf464fd68ad6bf550d94cb6d08c5a",
    "lines": [
      [
        0.0,
        1.62
      ],
      [
        1.64,
        2.66
      ],
      [
        2.96,
        3.9
      ],
      [
        4.76,
        6.26
      ],
      [
        7.08,
        7.46
      ],
      [
        7.78,
        11.52
      ],
      [
        12.66,
        15.7
      ],
      [
        15.92,
        16.68
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "ThreeMagazines": {
    "sha256": "28c601c334aeff3d864e29d3e3459985cc21ac7fd387d7ee5a3c620a80ba2235",
    "scriptSha256": "f4ac8380c234925adec728d058b1d787d80f67b51acd80c53cb3333993d9efd4",
    "groupsSha256": "3a567df009c42e683d27da22536d10aba22f8fed093960220b789277d46193b7",
    "lines": [
      [
        0.0,
        2.24
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "TwoMagazines": {
    "sha256": "fdaed98880c014f18a46a97d4bf0d076d5a9994f72e5c0f219d7b5c902a53c4d",
    "scriptSha256": "dd202fa25983801323acc5dc2d15d7469885ee1d7e7d98d98393f180c7a54398",
    "groupsSha256": "aed363cfc2c4ff262d897a45da958496fb48c08ca32c7bebf8fe5760a9f7f8d4",
    "lines": [
      [
        0.0,
        1.34
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "GuardsSafe": {
    "sha256": "9d71ccd06d4eaba3987a797b70ac54b0a8150fd7ca165f9ed5217033f9b1cda5",
    "scriptSha256": "324f246d38e74ee8c302ee65c6f25756d56bfcb7c119d79b7ee7478f15423d0a",
    "groupsSha256": "223224112d1cace3c6376108fc93d27cc763ede82075e427837a678798a5e4d4",
    "lines": [
      [
        0.0,
        0.68
      ],
      [
        1.16,
        2.3
      ],
      [
        4.02,
        9.42
      ],
      [
        10.34,
        12.28
      ],
      [
        12.74,
        14.82
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "TankStopped": {
    "sha256": "32a5f166bd4337134ec8038bb6cde37e40a7daeb8c4ee03141de380487310aca",
    "scriptSha256": "8c2036f5a49653cedf9480fa68bfda98113bcd5812c078d19eea335e894dea78",
    "groupsSha256": "a95176ef58cd93263d68bec7f842334b856381bd8c9c2870e6f2b2e88ab496f5",
    "lines": [
      [
        0.0,
        2.1
      ],
      [
        2.44,
        4.36
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "JapaneseFlank": {
    "sha256": "cc5c9d369b172f5c12648c255a98cd492ef94220aa7a7d47e4ec6a3b8f8c5054",
    "scriptSha256": "20708857d41f3098346e22fdd97c385f3ad44daab74258f83dc083a27414c87f",
    "groupsSha256": "92d0bc1ef24487161bf69a9d33df3b79b9602acae11c9d75fbc206fff516b66f",
    "lines": [
      [
        0.0,
        5.9
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "FlankWarning": {
    "sha256": "ce75e79b74caf29c02fa53efc8b1ae0619cddd2666572b319da2b39ac772afca",
    "scriptSha256": "133e9ab7e10547a6f76599abba5401717b69c9319eca1c08c81978e5f8b85bde",
    "groupsSha256": "ad5b89c256e8f4d31031f40a92abda3373606c59e4413bdebccba827259a3772",
    "lines": [
      [
        0.0,
        1.56
      ],
      [
        2.04,
        4.34
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "Volunteer": {
    "sha256": "7a7066eadc182324d439e78c60bf6344c516db776b41d5eee1fd561b00e2c7e0",
    "scriptSha256": "c562b8351139dc3f73b4e1e62334685a1f4f09a9f44f550fddd1e4574e0e9fa7",
    "groupsSha256": "77004b192a0b7406bca32b639596ee05734fec7caa60592ff128a0f2cfa09018",
    "lines": [
      [
        0.0,
        7.66
      ],
      [
        9.24,
        9.84
      ],
      [
        10.2,
        11.08
      ],
      [
        11.84,
        12.12
      ],
      [
        12.92,
        13.82
      ],
      [
        14.92,
        18.82
      ],
      [
        20.18,
        23.98
      ],
      [
        24.8,
        25.1
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "ZhouLift": {
    "sha256": "3d6fe4dca6ed578278076df38eb86572282458e96e6a899092d0628921b7c36d",
    "scriptSha256": "6d44a9c952c26a03c8224a9e89e418d39b7d13e5829c8b0a20ea8cb865012631",
    "groupsSha256": "600cd08d2ac398c89d70116abf56af597117c23b7897bba687f595b812e9780e",
    "lines": [
      [
        0.0,
        2.98
      ],
      [
        4.16,
        6.32
      ],
      [
        6.78,
        9.42
      ],
      [
        10.08,
        11.66
      ],
      [
        12.04,
        14.0
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "SouthSecret": {
    "sha256": "4d96c9ca804baab07e355a3d3ca3d27ceaa85bd6517f2561742b71608079b20a",
    "scriptSha256": "09779945c14ee854e5cb221c2d4e1b5c7951496cc02ff35b8fd6383b1c3c5321",
    "groupsSha256": "0661d9b4d30e7dac83fba060c64370e27e60a9821975bd82365c8ef1002a0636",
    "lines": [
      [
        0.0,
        1.1
      ],
      [
        1.46,
        5.02
      ],
      [
        6.28,
        7.56
      ],
      [
        8.48,
        9.26
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "SouthVehicles": {
    "sha256": "015716ca7f7b31baa46e12ac979ec4a0d7f4b889f156dc5c2d2f0b385b6d374b",
    "scriptSha256": "d1e86cdb39d7dabb20142bf5ed4813db3d955eea815b55b6bbcd545c8a88f51e",
    "groupsSha256": "fc51324078f3eec2099c4c7959b5f917c00f8c3421556b889cc7391e6e525a67",
    "lines": [
      [
        0.0,
        6.52
      ],
      [
        6.68,
        7.28
      ],
      [
        7.76,
        9.76
      ],
      [
        10.22,
        11.3
      ],
      [
        11.62,
        12.7
      ],
      [
        12.8,
        13.84
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "SouthHope": {
    "sha256": "5d6efa3839e5c4e8f51399c76813909865c7b899f394d4cabc617135cc58884e",
    "scriptSha256": "054b5d469a3ee6db5ccdc988e0bdf9b6bb593d9e42b77f878bc17fb34589bd7e",
    "groupsSha256": "ff7a395e9a1c39676b0aa6c98a68ade1986de4a3202644fd182776e001be7367",
    "lines": [
      [
        0.0,
        3.32
      ],
      [
        3.76,
        7.48
      ],
      [
        7.58,
        7.72
      ],
      [
        8.12,
        8.8
      ],
      [
        9.94,
        11.7
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "VillageAmbush": {
    "sha256": "22ae5c995efe264e8bdfab306552e1ec1f61b38d92c77907ebe2aae13d04be46",
    "scriptSha256": "992ca84386160de97616f4fe36c42dac0dae3454d92198722dd6e789940a0cea",
    "groupsSha256": "bc2e6e3f07f9f28383465d089b2dd53653c4147ce74ec970786dcab7e76e1237",
    "lines": [
      [
        0.0,
        2.34
      ],
      [
        2.58,
        5.0
      ],
      [
        6.12,
        8.58
      ],
      [
        8.92,
        17.52
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "RoomAmbush": {
    "sha256": "eb00cf1f028a95f3dcbbe7d8728655dd698fddf851884869fad4a42b66021c67",
    "scriptSha256": "5eb5e6c21a52fd54449aa7ab19de3cb6bd9d2f4b851684ac7c4e94001886e719",
    "groupsSha256": "7460488a1490a53db2a68ee2002dd851d35e1f113e88e06aec8a73e4ac9997e1",
    "lines": [
      [
        0.0,
        2.72
      ],
      [
        3.8,
        6.48
      ],
      [
        7.5,
        10.32
      ],
      [
        12.02,
        13.58
      ]
    ],
    "model": "faster-whisper medium CPU int8"
  },
  "RoomAmbushBreak": {
    "sha256": "a089c6a0e8119a9f756fd9b76733db9aa79a3639acd43da4492d8b9c517cf7d2",
    "scriptSha256": "970a0d1636c48335404eda235d6904c30397a74437097f8283e21cfb39549955",
    "groupsSha256": "4a56d0201780659f04a2a2567ed819da0a89b34f403dd814f8c4980ec15f66d1",
    "lines": [
      [
        0.0,
        2.26
      ],
      [
        2.9,
        5.4
      ],
      [
        5.54,
        9.12
      ]
    ],
    "model": "faster-whisper medium CPU int8"
  },
  "RoomAmbushCleared": {
    "sha256": "e2cdfaf6ae818920f76e5bc53805aa8d47256996236312489acc43995fb74e32",
    "scriptSha256": "a5764be9fd917a1266ea12d5dd6a2cc4e63bf10b98204bd865b54c5fdd3fd41b",
    "groupsSha256": "b46ac797d076171b034d237e9da4ffe12c7770176ffdbd3dcc032e59ac2733e4",
    "lines": [
      [
        0.0,
        4.94
      ],
      [
        5.2,
        8.38
      ],
      [
        8.44,
        11.68
      ],
      [
        12.22,
        19.52
      ]
    ],
    "model": "faster-whisper medium CPU int8"
  },
  "CourtyardOpen": {
    "sha256": "9312d13468e648f68c6e10a4f0b61412c386e293c1c8c4d224bafb7c617e26f0",
    "scriptSha256": "6bbfa4badd5121563f228bd3bcaa114fb101ce3b1fb4627f1baa9ab7dc8f992f",
    "groupsSha256": "8b5e6b627164920107258287355ae17d97b8a42d1ac0fc0685e2c1da678ce786",
    "lines": [
      [
        0.0,
        2.32
      ],
      [
        3.24,
        5.5
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "ZhouThreshold": {
    "sha256": "b1f6fee14db2ec1cbeb5d017fa55f523bec2bd2092b0a02257de95e130b6a9ec",
    "scriptSha256": "d913740b35d3ee4a2d0e9e96160cf716c9526896be3ad09cd3218d3ce5282b72",
    "groupsSha256": "09b8cc0338c0cc37996e0c469257f05bc928c609e9c1cc64b0d2217cf5aadac7",
    "lines": [
      [
        0.0,
        1.76
      ],
      [
        2.24,
        4.16
      ],
      [
        4.58,
        6.24
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "TwoLitters": {
    "sha256": "086a49bc62bba8456493677feeb8f907692359ee5f7de864fab70013bf9d5a54",
    "scriptSha256": "f7567b63e9b9cfa4024b9a6344770e31b60620c14907daa779a6d54e565c329c",
    "groupsSha256": "d9723d16bf87878917f738953248d653b44eb686cc05f97124bd9fa08db1e688",
    "lines": [
      [
        0.0,
        2.6
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "LastLitter": {
    "sha256": "e8b7fdfbcc3af0aea7ae00568edc4a7489f4dfa24bd991ebeb21840dac21c81a",
    "scriptSha256": "e28ac6bd034edb99922608731c75197c6f09adae610dc3652ee01bd2004969a4",
    "groupsSha256": "2de0bba5271f7519f9a0970c9bbc89f41463a7ed940512893c77118b5f70268f",
    "lines": [
      [
        0.0,
        1.6
      ],
      [
        1.68,
        2.32
      ],
      [
        2.44,
        4.64
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "TransferHope": {
    "sha256": "90b02fde4ca1f3313b30fc1051ae71163d774216f190d65a61d22b593fb5095e",
    "scriptSha256": "adc4626674a1b5b19d3f27b6e18f004c2d159638a765f051c4fbd334f18fac6a",
    "groupsSha256": "1c213eff6c278ecc25c310c7371e0fd96226e03ab775300455f19b7733161a01",
    "lines": [
      [
        0.0,
        1.5
      ],
      [
        2.26,
        6.22
      ],
      [
        6.68,
        8.34
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "TransferDefense": {
    "sha256": "6013b0bf558586c38e9778560ef5f1f8a2b82dbb6fec4c09ee88962bde15e948",
    "scriptSha256": "a855e97866cde9720e416ced2f674274c06d95a7b396dfe42593f3286349308b",
    "groupsSha256": "4386c05765f22c3faa0fcc2c7d56e00411155975a4188c0c15514600bf348e4e",
    "lines": [
      [
        0.0,
        1.86
      ],
      [
        1.92,
        6.04
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "TransferQueue": {
    "sha256": "2d8026eca1b8acf0bf27a38114743a748ffab834d1075dd07854a065a8a455b1",
    "scriptSha256": "ab8275ab0c2fc7b0e63c425c39b2c904b1f25901d00239f6721b2a1dd740b39c",
    "groupsSha256": "e204c38aae6109e41ca41fda26f3102b558d5a200b2336b0c77342c57ddf4d52",
    "lines": [
      [
        0.0,
        1.24
      ],
      [
        1.72,
        3.42
      ],
      [
        3.7,
        4.54
      ],
      [
        4.88,
        6.32
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "TransferTwo": {
    "sha256": "035f0e1e49fb77c31efaa7501b4839404d81ae4388382ca84f16ffdee553e828",
    "scriptSha256": "92934b5729d26917c992e482cc8d2c45a025bc059754c4431d0705ad071e33de",
    "groupsSha256": "6acc8aacf245c4fc8695f219d8216f95b1d9aaf241e0954bcfd99d35967c4fe5",
    "lines": [
      [
        0.0,
        1.62
      ],
      [
        2.96,
        3.32
      ],
      [
        4.08,
        4.66
      ],
      [
        5.0,
        6.92
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "FollowVehicle": {
    "sha256": "bb72d4ee21d5eec206484ebfe79bd215c7da0a9f0598bd539b5ddb50ed1a3c94",
    "scriptSha256": "47aa20faa7abfb440c40c20512859e52482fda1c7859e5c7d85cdba85332c029",
    "groupsSha256": "6acc8aacf245c4fc8695f219d8216f95b1d9aaf241e0954bcfd99d35967c4fe5",
    "lines": [
      [
        0.0,
        0.72
      ],
      [
        2.04,
        3.08
      ],
      [
        4.5,
        5.92
      ],
      [
        6.38,
        7.42
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "AircraftFirst": {
    "sha256": "52fa002c5189e2866a7954b78c836c6930b1da41571a128820d9829759cba181",
    "scriptSha256": "683de2e70c7e4e8204181a34670685d072849bafecaf5a5d4b78fb29e92b7f51",
    "groupsSha256": "38b9eda0b003ee4bf037e71a921b0263582c3a4ac77445552dcfbd40f5c69e74",
    "lines": [
      [
        0.0,
        1.68
      ],
      [
        1.9,
        3.9
      ],
      [
        4.06,
        7.0
      ],
      [
        7.56,
        9.82
      ],
      [
        10.1,
        12.36
      ],
      [
        12.86,
        15.32
      ],
      [
        15.42,
        17.04
      ],
      [
        17.14,
        19.6
      ],
      [
        19.76,
        22.06
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "CarryZhou": {
    "sha256": "7080bd0827dc69b94565d798d7be849e9cc0cc67d2c6a56265fb635b37f44ea3",
    "scriptSha256": "346405ef9616c6ba4f6b05e8c9c19a71f2193843517705868109a8a1bb9db25f",
    "groupsSha256": "6a3050bdcd1bfb70f95636fe5c5a6b66b016a13b8635a189731d9f6ed0a28edd",
    "lines": [
      [
        0.0,
        3.94
      ],
      [
        4.16,
        8.34
      ],
      [
        9.0,
        10.38
      ],
      [
        10.7,
        12.32
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "AircraftReturn": {
    "sha256": "78d98b0adb7d6b2dc0da72e4434200b3bb43e40b226462cb663173a51e252edd",
    "scriptSha256": "2d638e8b626ee62c3d67d9a3132523703a63c9b808e1163ff6cbeb754148afbf",
    "groupsSha256": "f6ccb98da72331af199d1a38e2f2a0e9cbbab0e8c5e02b91c5a7006d4e9649e8",
    "lines": [
      [
        0.0,
        1.0
      ],
      [
        1.32,
        3.52
      ],
      [
        4.24,
        5.16
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "RescueZhou": {
    "sha256": "b4f517b5b9301b4b83c48c8948d3cc14b14658812091f4436a871fae086873e8",
    "scriptSha256": "8711d607c1a0d69f5bcd559debf0d5c55b2760bd771f7de0d60ef1d713c1c283",
    "groupsSha256": "d9fce3d1ccf4e023c285ca68c0b083c2bf651d72b1324a85f7ff819f757066ad",
    "lines": [
      [
        0.0,
        1.3
      ],
      [
        1.48,
        3.6
      ],
      [
        4.42,
        7.44
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "WestRetreat": {
    "sha256": "1ab13fda311d82f534a0a864e1e74322d2612daa41bb9c0dbe95428be6f39d36",
    "scriptSha256": "a7003c8d2fd985923c98862b1d6aac1d10b5be873b536e8e2c88935688406431",
    "groupsSha256": "d72fb6150f389827b4c585a444cee3eea0ce35371eec09522ae1bb609ac10b42",
    "lines": [
      [
        0.0,
        3.02
      ],
      [
        3.74,
        9.06
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "RetreatFirst": {
    "sha256": "731f73b171102ec19cd95ef55b83af27f2b68bfb3ef1049f401cea237cd42bf7",
    "scriptSha256": "548e4041b65ec232206295c8c6cea12c585252d317556c3738e3e2cc27eb6c69",
    "groupsSha256": "2400e2e02e1b831d5d9b4b4b56060d3597c372abe359d48d313e71e77ee316ae",
    "lines": [
      [
        0.0,
        2.44
      ],
      [
        3.16,
        4.64
      ],
      [
        4.88,
        6.84
      ],
      [
        7.34,
        8.86
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "RetreatBleeding": {
    "sha256": "370153e7deaeb7bbbd174d9c4710293cb05b32aa1eee71f768aa1852df678566",
    "scriptSha256": "fb9a85db545b5d159dcf8d426c07b5b597027528074f16c615871f3725abe089",
    "groupsSha256": "e056db3003937a4f093b3dac87ebdb1e32b6bcab49c9fbe216d76e2058045fc1",
    "lines": [
      [
        0.0,
        2.08
      ],
      [
        2.2,
        4.88
      ],
      [
        4.92,
        5.12
      ],
      [
        6.0,
        8.08
      ],
      [
        8.36,
        9.88
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "RetreatCold": {
    "sha256": "3f3567756db3d0b6e59baba6da25a1c93a962f2c614c1b46b1c0b594771a0973",
    "scriptSha256": "e9778f4ffb30303ef9767bd41a4b3b0e2268a8036bbb7ec9aea9b26ea7b94cb5",
    "groupsSha256": "e0b23113bcf4a7406f0607c2fc598e3400d6df41da825091dd7c08af1469d597",
    "lines": [
      [
        0.0,
        0.42
      ],
      [
        2.02,
        3.02
      ],
      [
        3.38,
        5.36
      ],
      [
        5.56,
        6.08
      ],
      [
        6.54,
        7.42
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "ReceptionDefense": {
    "sha256": "f6e62ddee7cf39848548132a6610d5a9c6d129c25b44461e0f8ff1d353026875",
    "scriptSha256": "044a60dc3a10b7ba5f448100afd951a9c35db39be8081ef5825e1ca14796cadc",
    "groupsSha256": "d758d7b69a330a88b26932614df3fbc889a6dc926f346d5f59ed887f8b7d7faf",
    "lines": [
      [
        0.0,
        3.36
      ],
      [
        3.58,
        7.62
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "FinalCarry": {
    "sha256": "6d74822e6f1fa627fee7bd7af67632cab4626036bad1359e9bc20776161c9470",
    "scriptSha256": "65d372b9eb64f83fc7fb803cbda1a2b89a03556cc1b27d3d061217a6f4e979d2",
    "groupsSha256": "41bab247a1ec95993007549bd52b2e3cbae4b6f2f42262c3a3792a223b0fae67",
    "lines": [
      [
        0.0,
        2.92
      ],
      [
        3.18,
        4.52
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "ZhouDeath": {
    "sha256": "0cf9c1a0a0131525c6622b62cd1550da3a37a85269cb52f94138c939273de18b",
    "scriptSha256": "09daf1bd94d4f02fdb5e3f420a7bb3962b18c1096242837ace6ed63679a1dcaf",
    "groupsSha256": "7ee2f85dd9be7e4dfacded1a88f01b94f6551ec49131fa05c4f5545a43d253a5",
    "lines": [
      [
        0.0,
        1.34
      ],
      [
        1.76,
        3.22
      ],
      [
        3.36,
        3.72
      ],
      [
        4.0,
        4.44
      ],
      [
        4.6,
        6.06
      ],
      [
        6.3,
        6.74
      ],
      [
        6.94,
        8.32
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "ReceptionWithdrawal": {
    "sha256": "855fb0c29a9366c169e3831efb242b01f1ef56c93813f0a3dc76b618ca0169fb",
    "scriptSha256": "63a01d058c339c4fbe3ea14e08ebe8366e6b1d95e9cf1a11455b1bb80aaea2d1",
    "groupsSha256": "3db0ce02a13e98d7b3174f5d1f32e334577143e9f973ac4b58ffc85f968bc971",
    "lines": [
      [
        0.0,
        1.92
      ],
      [
        1.92,
        7.66
      ],
      [
        7.88,
        9.46
      ],
      [
        9.9,
        18.72
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "JapanesePursuit": {
    "sha256": "97615d82af4cd005a669ac77ef69131e237e7cfb75136bddefafeecf3ebb3a71",
    "scriptSha256": "931f4cef8aab76f99c51bd79b8918dbef64b1ae205784687aad69cc0e8d38b89",
    "groupsSha256": "220811d0052fd19b46d4b7d36a223c704b2b4e80b6c2dc1b780cf1cf1a518985",
    "lines": [
      [
        0.0,
        3.84
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "FinalExit": {
    "sha256": "49a44d480142b58dad066108acf89bb61e1e4e01940b0795c59f12acafee4254",
    "scriptSha256": "3bc309e2bd7ad30c725da55143b31c0d27516627df45e1f03e97399dc5844dd1",
    "groupsSha256": "d73c1b14297f8a4bac4837def408e35fbb02bf72521106fb6325a319ba9bec9f",
    "lines": [
      [
        0.0,
        1.46
      ],
      [
        2.46,
        5.48
      ],
      [
        5.9,
        7.8
      ],
      [
        7.94,
        10.34
      ],
      [
        10.78,
        11.12
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "TrainBanter": {
    "sha256": "1ecdb2abac2bd630a16b77849bc026a9ecbd3d3138c50af674ffb3a5784eea55",
    "scriptSha256": "5937f881d267a1264ae8e5ffa2ef2233ada8f0ac8d425be9cd32a933d7174a98",
    "groupsSha256": "af88de9c22b2b0aced887a45f34a5760ad785092b10001a686f7dd74d15f1aa7",
    "lines": [
      [
        0.0,
        0.42
      ],
      [
        0.72,
        3.58
      ],
      [
        4.0,
        7.32
      ],
      [
        7.6,
        9.64
      ],
      [
        9.94,
        12.82
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "TrainBriefing": {
    "sha256": "ca7d412e8e6136f2915afa1363d86bcb1bf5d3b639e315bfc94b3a26f5580c35",
    "scriptSha256": "befbda0a3711e63e8c9a8e3d523adf1d72ad0748be8b2b757966b8faa5aa36b6",
    "groupsSha256": "58949ad271a58108d5ad42f63d8b662e7276b89d9bf2870c661c9cf11c477f81",
    "lines": [
      [
        0.0,
        2.18
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "TrainPack": {
    "sha256": "aabd72fd0ecd3f5720e5713c3d8bed9d08daba833ae5b46ac4a2881de53e72fd",
    "scriptSha256": "cf53030d3f5660ef5d939d94e89fd28c4c3c24be9e2d0e29e51dfd78659c3874",
    "groupsSha256": "ba75022cb112a19efa1d95b74720c78de8ab84dca9af1c5c48f243cbaac1134e",
    "lines": [
      [
        0.0,
        3.58
      ],
      [
        3.58,
        5.92
      ],
      [
        6.48,
        8.76
      ],
      [
        9.9,
        11.64
      ],
      [
        14.9,
        15.64
      ],
      [
        16.26,
        19.36
      ],
      [
        21.96,
        26.1
      ],
      [
        27.0,
        34.42
      ],
      [
        34.82,
        36.12
      ],
      [
        36.44,
        39.28
      ],
      [
        40.12,
        41.26
      ],
      [
        41.86,
        49.72
      ],
      [
        50.04,
        52.66
      ],
      [
        53.6,
        56.22
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "WreckImpact": {
    "sha256": "751a392bad3d6ed43532a9a7232eda346236f6fe53e9e8c03db5da12ef53241f",
    "scriptSha256": "984717eae5ed6f39c16963d9e9e737283506f1c52936e5c28f734d5143ec31f1",
    "groupsSha256": "b9a4f237aa2ac9c17d694c490bbebc26d31d180ca732f3ad8aa02de5edeaff74",
    "lines": [
      [
        0.0,
        1.16
      ],
      [
        3.1,
        4.86
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "WreckExit": {
    "sha256": "230aff1b4b01d3e900e5977e70b7df23698c641133b8f4e89424901d40309035",
    "scriptSha256": "4ee8788b77c335c58b0dd1adb08ebee33591fcb83558e393df5e72a324d20593",
    "groupsSha256": "bab6aadeede623faf7ef3e6d48aea319234585340dd74a1b5e31b2bc786fd680",
    "lines": [
      [
        0.0,
        1.38
      ],
      [
        1.4,
        2.86
      ],
      [
        3.14,
        5.56
      ],
      [
        6.26,
        7.34
      ],
      [
        7.58,
        8.34
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "TrenchContact": {
    "sha256": "5aa59458d913924664483d2b53896a758bbe487324714296e6b5c8160b86cdae",
    "scriptSha256": "1a9ca7bd51e3cefbd80c99235847a82339d14256aeb0d28265a2f8cef1f452d0",
    "groupsSha256": "427624d66c139f9dc3e8c443bea8c67442d324aee71c6ccb7b31913c7ac28c24",
    "lines": [
      [
        0.0,
        2.96
      ],
      [
        3.42,
        6.16
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "ShelterAid": {
    "sha256": "b2eefc19818ce757c6a6fa95b0cca1a3644ba00cd0c0e370193fd05a8d3cd678",
    "scriptSha256": "9bba35a55b2737104773aa933c5c4b2d79b7547e4f965d7e8a124d9c0561c768",
    "groupsSha256": "8bc2b83084a7800d14f1411d3bedf55662914cfd5b5d03dea240c9384be8ba3f",
    "lines": [
      [
        0.0,
        2.5
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "WoundedArrival": {
    "sha256": "8a50e85c70b9a1cae751073a9aad32e8a153b6a2d9f412146bd231c7823d0b7d",
    "scriptSha256": "1e66f3d8b32bc7cd260fb7f2c2123a9c99c5f62684b3d645ad7430074114ff95",
    "groupsSha256": "427624d66c139f9dc3e8c443bea8c67442d324aee71c6ccb7b31913c7ac28c24",
    "lines": [
      [
        0.0,
        1.4
      ],
      [
        1.4,
        6.18
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "TransferOne": {
    "sha256": "be3b150628c3a18e5a42389597c28ca543d5c8aaf15dc826bbaf32d0d7c1e42c",
    "scriptSha256": "7ed13e4a4516fc0379a4d9b6e0e1ee105e046bef787d949856896783f4f0c722",
    "groupsSha256": "629be50b8ba3c0fce67a2fea7a022e3987e4c0ac4f664cb5518d157b80ed33ac",
    "lines": [
      [
        0.0,
        3.0
      ],
      [
        3.38,
        4.92
      ],
      [
        5.18,
        5.92
      ],
      [
        6.24,
        6.66
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "FrontCoverCall": {
    "sha256": "861b42fd5135b791a41854f03438a6dc0d7fb2816252d04fca771f37d0737f03",
    "scriptSha256": "272538832cd2bdf89abccc14326e543519b0a6b9c394ca1b22c384d83d81a71e",
    "groupsSha256": "29e2740e085888119ac40982ce4d16ce99e10b935ff4d60fac5ea6ea946e4f99",
    "lines": [
      [
        0.0,
        4.3
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "FrontBlockade": {
    "sha256": "3e25016f198e26d2a29757dba01c72f4bc4ca77e8dbab8c2c9bf4220b59a3a35",
    "scriptSha256": "0644973098aba1c8c28a934b95a5d8c6bc6e74c1192ce1d25cc1271f32722358",
    "groupsSha256": "4a167c37c71227d08c737e5f16fe3f54cf37efafcbe3306abd38824f1a89c84d",
    "lines": [
      [
        0.0,
        3.86
      ],
      [
        3.94,
        7.1
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "FrontReminder": {
    "sha256": "fe843a81ed8e4d3a11a09a422105e5a749e6b3fe8ec62152f3ebd91bd377baf5",
    "scriptSha256": "5dc99a345731efade1236e511385d587c054d9b6da2734d4f804d008f73bc0a8",
    "groupsSha256": "29e2740e085888119ac40982ce4d16ce99e10b935ff4d60fac5ea6ea946e4f99",
    "lines": [
      [
        0.0,
        3.9
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "FrontFallback": {
    "sha256": "014bed783e18ba584367f27424e02aef169d4727b95a024c6fb4cdc836dec755",
    "scriptSha256": "dc984515a552a39fed2ce1a8ccf3d231f17105f1f6083cd1fd70bda742fd482a",
    "groupsSha256": "637634397f4758030c346ed7a22d873215470abcc1c26e5688c35826738e93bf",
    "lines": [
      [
        0.0,
        3.76
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "FrontCrossing": {
    "sha256": "7bffbda821206c42c302d48e02948f5d2ef24229a48573bef0e198fbc5d2aa34",
    "scriptSha256": "525bbce4e37060cd7440a2c0a115004b97233adff989fd033f5059dff3ecfce2",
    "groupsSha256": "37d14b56560e27cf1ede8cee9d9e4892c2e5f6422fa3ce3699bf33d19b4891cb",
    "lines": [
      [
        0.0,
        1.58
      ],
      [
        1.58,
        3.5
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "FrontPursuit": {
    "sha256": "1184f7510584638f18f5cfa045d0c0f15098ec8f809c71d7dcd70a2ccb299b01",
    "scriptSha256": "6d5ed32d4cee4f21e4b414237fb39548ddc397c9ed48932b0faf29595004f659",
    "groupsSha256": "19e0e21fb0eb0ccfddc1a94b324a043db65534ed009094ade02c8b0b9b3d9ebe",
    "lines": [
      [
        0.0,
        3.5
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "FrontReceived": {
    "sha256": "9e549113f2a0bac8591af1f1ec4742dd33f5841a692c02be3d85ad1f33da8cf4",
    "scriptSha256": "70809887d29572539ab038c21b2fcc279b441ed1b97600d60aadae830cc14b8e",
    "groupsSha256": "ad5b89c256e8f4d31031f40a92abda3373606c59e4413bdebccba827259a3772",
    "lines": [
      [
        0.0,
        2.98
      ],
      [
        3.48,
        4.38
      ]
    ],
    "model": "faster-whisper small CPU int8"
  },
  "FrontWeaponChoice": {
    "sha256": "aea487da36652597a34615c6c4f639edcc09d52dd61552291dd01547fe9cfc54",
    "scriptSha256": "997a2405230292c9508916a9c4dcd34f92e7177545404d434b08726af6bf6397",
    "groupsSha256": "f4120940f7600c29e08f6754cf0b83cb5227b0d9ecf3e49f271bad4b95f48ba7",
    "lines": [
      [
        0.0,
        6.22
      ]
    ],
    "model": "faster-whisper medium CPU int8"
  },
  "BundleSortieOrder": {
    "sha256": "89dbf2e85ed11d7ffa94e0c152ff9dde0a3ba5112849efae7a21952c53b8b26a",
    "scriptSha256": "86d7c69b8d289306fd4b1059f30009160a48570fad594b86d2db74729621312f",
    "groupsSha256": "bf08ca1f9f96f7961df744289867b78c231cb2e742a84c4ab25cd64410ab72c2",
    "lines": [
      [
        0.0,
        8.66
      ]
    ],
    "model": "faster-whisper medium CPU int8"
  },
  "BundleSupplyDirections": {
    "sha256": "895b3875072d0d4d1612f9001fb9199a0c934e4ea95139b3f6effb3e04db269e",
    "scriptSha256": "9a1926eba2b35e880d7270707ac26a75eb42e3158534dfcc849bc52e4ba1f976",
    "groupsSha256": "447d24770fa58c8a86a01304f787fc34982cfedb5865084b52778f59845cd07c",
    "lines": [
      [
        0.0,
        5.96
      ],
      [
        6.26,
        10.26
      ]
    ],
    "model": "faster-whisper medium CPU int8"
  }
});
