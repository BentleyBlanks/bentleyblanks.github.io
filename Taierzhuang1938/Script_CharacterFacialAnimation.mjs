import * as THREE from 'three';
import { CHARACTER_SPEECH as C } from './Data_Tuning_CharacterSpeech.mjs';

/** Face-only layers sampled from the Blender study; never replace body clips. */
export class CharacterFacialAnimation {
  constructor(root, definition) {
    this.source = null; this.level = 0; this.time = 0; this.lastSpeech = null;
    this.controls = definition.bones.map(name => {
      const bone = root.getObjectByName(name);
      if (!bone) throw new Error(`Missing facial bone ${name}`);
      const poses = Object.fromEntries(Object.entries(definition.poses).map(([key, pose]) => [key, {
        position: new THREE.Vector3().fromArray(pose[name].translation),
        quaternion: new THREE.Quaternion().fromArray(pose[name].rotation),
      }]));
      return {name, bone, position: bone.position.clone(), quaternion: bone.quaternion.clone(), poses};
    });
  }
  Update(dt, state = {}) {
    const elapsed = Math.max(0, dt); this.time += elapsed;
    const speech = state.speech ?? this.source?.();
    const active = !state.dead && !(state.dying > 0) && speech?.active;
    this.lastSpeech = active ? speech : null;
    const target = active ? speech.level : 0;
    // Pauses/cancellations reset immediately; short intra-word gaps release smoothly.
    this.level = active ? this.level + (target - this.level) * (1 - Math.exp(-elapsed / (target > this.level ? C.attackS : C.releaseS))) : 0;
    const open = Math.min(C.maximumOpen, this.level);
    const brightness = speech?.brightness || 0;
    const shape = brightness > .35 ? 'Wide' : 'Round';
    const shapeWeight = open * C.expressionScale;
    const blinkPhase = this.time % C.blinkPeriodS;
    const blink = state.dead ? 0 : Math.max(0, 1 - Math.abs(blinkPhase - C.blinkDurationS / 2) / (C.blinkDurationS / 2));
    for (const control of this.controls) {
      const {bone, name, position, quaternion, poses} = control;
      bone.position.copy(position); bone.quaternion.copy(quaternion);
      let pose, weight;
      if (name.includes('Lid')) { pose = poses.Blink; weight = blink; }
      else if (name.includes('Brow')) { pose = poses.Open; weight = open * C.expressionScale; }
      else if (name === 'Face_Jaw') { pose = poses.Open; weight = open; }
      else { pose = poses[shape]; weight = shapeWeight; }
      if (weight > 0) {
        bone.position.lerp(pose.position, weight);
        bone.quaternion.slerp(pose.quaternion, weight);
      }
    }
  }
  Reset() { this.source = null; this.Update(0, {dead: true}); }
}
