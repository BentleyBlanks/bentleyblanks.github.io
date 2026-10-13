// Dossier page structure, independent of gameplay and rendering.
// Front sheet corners measured on Texture_AboutDossierImage.webp (TL, TR, BR, BL).
// The ragged folder border is deliberately outside this printable plane.
export const ABOUT_PAPER = Object.freeze({
  sourceWidth: 1402, sourceHeight: 1122,
  corners: [[165, 70], [1267, 81], [1356, 1053], [119, 1058]],
  layoutWidth: .84, layoutHeight: .92,
});

export const ABOUT_PAGES = Object.freeze([
  {
    "id": "work",
    "labelKey": "about.work.label",
    "titleKey": "about.work.title",
    "subtitleKey": "about.work.subtitle",
    "actionKey": "about.work.action",
    "dedicationKey": "about.work.dedication",
    "sections": [
      {
        "titleKey": "about.work.section0.title",
        "lines": [
          "about.work.section0.line0",
          "about.work.section0.line1"
        ]
      },
      {
        "titleKey": "about.work.section1.title",
        "lines": [
          "about.work.section1.line0"
        ]
      }
    ]
  },
  {
    "id": "credits",
    "labelKey": "about.credits.label",
    "titleKey": "about.credits.title",
    "subtitleKey": "about.credits.subtitle",
    "actionKey": "about.credits.action",
    "dedicationKey": "about.credits.dedication",
    "sections": [
      {
        "titleKey": "about.credits.section0.title",
        "lines": [
          "about.credits.section0.line0",
          "about.credits.section0.line1"
        ],
        "authors": true
      },
      {
        "titleKey": "about.credits.section1.title",
        "lines": [
          "about.credits.section1.line0",
          "about.credits.section1.line1"
        ]
      },
      {
        "titleKey": "about.credits.section2.title",
        "lines": [
          "about.credits.section2.line0",
          "about.credits.section2.line1"
        ]
      }
    ]
  },
  {
    "id": "history",
    "labelKey": "about.history.label",
    "titleKey": "about.history.title",
    "subtitleKey": "about.history.subtitle",
    "actionKey": "about.history.action",
    "dedicationKey": null,
    "sections": [
      {
        "titleKey": "about.history.section0.title",
        "lines": [
          "about.history.section0.line0",
          "about.history.section0.line1"
        ]
      },
      {
        "titleKey": "about.history.section1.title",
        "lines": [
          "about.history.section1.line0",
          "about.history.section1.line1"
        ]
      },
      {
        "titleKey": "about.history.section2.title",
        "lines": [
          "about.history.section2.line0",
          "about.history.section2.line1"
        ]
      }
    ]
  },
  {
    "id": "licenses",
    "labelKey": "about.licenses.label",
    "titleKey": "about.licenses.title",
    "subtitleKey": "about.licenses.subtitle",
    "actionKey": "about.licenses.action",
    "dedicationKey": null,
    "sections": [
      {
        "titleKey": "about.licenses.section0.title",
        "lines": [
          "about.licenses.section0.line0",
          "about.licenses.section0.line1"
        ]
      },
      {
        "titleKey": "about.licenses.section1.title",
        "lines": [
          "about.licenses.section1.line0",
          "about.licenses.section1.line1"
        ]
      },
      {
        "titleKey": "about.licenses.section2.title",
        "lines": [
          "about.licenses.section2.line0",
          "about.licenses.section2.line1"
        ]
      },
      {
        "titleKey": "about.licenses.section3.title",
        "lines": [
          "about.licenses.section3.line0"
        ]
      }
    ]
  }
]);
// Attribution excerpt; source records: Font/README, Music manifest, ExternalPropSources, Volume/README and vendor licenses.
export const ABOUT_SOURCES = Object.freeze([
  {
    "nameKey": "about.source0.name",
    "creditKey": "about.source0.credit",
    "licenseKey": "about.source0.license",
    "url": "https://github.com/notofonts/noto-cjk",
    "licenseUrl": "https://openfontlicense.org/"
  },
  {
    "nameKey": "about.source1.name",
    "creditKey": "about.source1.credit",
    "licenseKey": "about.source1.license",
    "url": "https://github.com/jpt/barlow",
    "licenseUrl": "https://openfontlicense.org/"
  },
  {
    "nameKey": "about.source2.name",
    "creditKey": "about.source2.credit",
    "licenseKey": "about.source2.license",
    "url": "https://incompetech.com/music/royalty-free/",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/"
  },
  {
    "nameKey": "about.source3.name",
    "creditKey": "about.source3.credit",
    "licenseKey": "about.source3.license",
    "url": "https://opengameart.org/content/laments-of-the-war",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/"
  },
  {
    "nameKey": "about.source4.name",
    "creditKey": "about.source4.credit",
    "licenseKey": "about.source4.license",
    "url": "https://opengameart.org/content/tension-and-distress",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/"
  },
  {
    "nameKey": "about.source5.name",
    "creditKey": "about.source5.credit",
    "licenseKey": "about.source5.license",
    "url": "https://opengameart.org/content/village-ruins",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/"
  },
  {
    "nameKey": "about.source6.name",
    "creditKey": "about.source6.credit",
    "licenseKey": "about.source6.license",
    "url": "https://sketchfab.com/3d-models/ancient-chinese-courtyard-house-ed4ea9eb5f024d989eec182d48fa72d8",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/"
  },
  {
    "nameKey": "about.source7.name",
    "creditKey": "about.source7.credit",
    "licenseKey": "about.source7.license",
    "url": "https://sketchfab.com/3d-models/battlefield-pack-dcd0ade8c80e46d982a54fe4619f1c87",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/"
  },
  {
    "nameKey": "about.source8.name",
    "creditKey": "about.source8.credit",
    "licenseKey": "about.source8.license",
    "url": "https://sketchfab.com/3d-models/medieval-market-asset-pack-006ffc4ac5f34a1782f567b07e6605f2",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/"
  },
  {
    "nameKey": "about.source9.name",
    "creditKey": "about.source9.credit",
    "licenseKey": "about.source9.license",
    "url": "https://jangafx.com/software/embergen/download/free-vdb-animations",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/"
  },
  {
    "nameKey": "about.source10.name",
    "creditKey": "about.source10.credit",
    "licenseKey": "about.source10.license",
    "url": "https://threejs.org/",
    "licenseUrl": "./vendor/three/LICENSE"
  },
  {
    "nameKey": "about.source11.name",
    "creditKey": "about.source11.credit",
    "licenseKey": "about.source11.license",
    "url": "https://rapier.rs/",
    "licenseUrl": "./vendor/rapier/LICENSE"
  }
]);
