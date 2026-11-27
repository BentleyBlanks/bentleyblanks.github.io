import * as THREE from "three";
import { CAMERA } from "../Data_Tuning_Main.mjs";
import { LoadSavedGraphics } from "../Script_EditorSettings.mjs";
import { LoadRiggedAssets } from "../Script_RiggedModel.mjs";
import { Viewmodel } from "../Script_Viewmodel.mjs";
import { BuildStandardPostOptions } from "../Script_CameraProfile.mjs";

const FRAME_ASPECT = 16 / 9;

export class WeaponInspectionFirstPerson {
  static async Create(stage) {
    const riggedAssets = await LoadRiggedAssets();
    return new WeaponInspectionFirstPerson(stage, riggedAssets);
  }

  constructor(stage, riggedAssets) {
    this.camera = new THREE.PerspectiveCamera(CAMERA.baseFovDeg, FRAME_ASPECT, .06, 80);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x525448);
    this.scene.environment = stage.scene.environment;
    this.scene.environmentIntensity = stage.scene.environmentIntensity;
    this.scene.add(this.camera);
    for (const source of stage.scene.children) {
      if (!source.isLight) continue;
      const light = source.clone();
      light.castShadow = false;
      this.scene.add(light);
    }
    this.viewmodel = new Viewmodel(stage.library, {
      fov: 52, depthBudget: 1.22, meshDocs: stage.factory.meshDocs, riggedAssets,
    });
    this.camera.add(this.viewmodel.root);
  }

  Equip({ id, variant, glbAsset }) {
    const { camera, viewmodel } = this;
    const graphics = { fov: CAMERA.baseFovDeg };
    LoadSavedGraphics(graphics);
    camera.fov = graphics.fov;
    camera.updateProjectionMatrix();
    if (id === "HanYang") viewmodel.hanYang173R = glbAsset;
    if (id === "Type38") viewmodel.type38 = glbAsset;
    if (viewmodel.weaponId !== id || viewmodel.weaponVariant !== variant || !viewmodel.rig) {
      viewmodel.Equip(id, variant, { instant: true });
    }
    viewmodel.Update(1 / 60, { elapsed: 0 });
  }

  Draw(renderer, width, height, post = null) {
    const frameWidth = Math.min(width, height * FRAME_ASPECT);
    const frameHeight = frameWidth / FRAME_ASPECT;
    const left = (width - frameWidth) / 2;
    const bottom = (height - frameHeight) / 2;
    if (post) {
      post.Render(this.scene, this.camera, BuildStandardPostOptions({
        dt: 1 / 60,
        steadyView: true,
        outputViewport: { x: left, y: bottom, w: frameWidth, h: frameHeight },
      }));
      return;
    }
    renderer.clear();
    renderer.setViewport(left, bottom, frameWidth, frameHeight);
    renderer.setScissor(left, bottom, frameWidth, frameHeight);
    renderer.setScissorTest(true);
    try {
      renderer.render(this.scene, this.camera);
    } finally {
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, width, height);
    }
  }
}
