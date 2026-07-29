/**
 * Script_Character.mjs — 程序化骨骼角色 + 过程动画状态机（玩家与 NPC 共用）
 * Owner: AgentCharacter
 *
 * ⚠ 本文件目前是 **AgentBoot 铺设的可运行灰盒实现**：公开 API 与 AGENTS.md 5.8 一致，
 *   AgentCharacter 接管后可整体重写内部（更好的体态、重量感、蹲伏差异），调用方无需改动。
 *
 * 依赖 DAG：three, Config, Math, Art（只取材质）。
 * 无外部模型：骨骼是 Object3D 层级，肢体是共享几何 + 逐骨缩放。
 */

import * as THREE from 'three';
import { Config } from './Script_Config.mjs';
import * as MathUtil from './Script_Math.mjs';

export const ArchetypeKeys = [
  'ShenTie', 'FengXiaoman', 'PuppetSoldier', 'PuppetOfficer',
  'JapaneseSoldier', 'JapaneseNco', 'Dog', 'Villager', 'Courier',
];

export const ActionNames = [
  'Idle', 'Walk', 'Run', 'TurnLeft', 'TurnRight', 'CrouchIdle', 'CrouchWalk', 'ProneIdle', 'ProneCrawl',
  'Interact', 'Search', 'PickUp', 'Craft', 'OpenDoor', 'Vault', 'Climb', 'Squeeze', 'Land',
  'AimRaise', 'AimIdle', 'AimLower', 'Fire', 'BoltCycle', 'Reload', 'ThrowCharge', 'ThrowRelease',
  'MeleeLight', 'MeleeHeavy', 'Block', 'BlockHit', 'Dodge', 'TakedownAttacker', 'TakedownVictim',
  'Hurt', 'Stagger', 'Down', 'Dead', 'Limp',
  'Point', 'Wave', 'Shiver', 'WarmHands', 'Listen', 'Hide', 'Sit', 'Kneel', 'Comfort', 'Salute', 'Cower',
];

/** 体型与配色：轮廓差别要一眼看得出（大人 / 孩子 / 敌兵）。 */
const Archetypes = {
  ShenTie: { height: 1.76, build: 1.00, coat: 'FabricGray', trim: 'ClothPadded', skin: 'SkinWeathered', cap: true, accent: null },
  FengXiaoman: { height: 1.36, build: 0.82, coat: 'FabricBlue', trim: 'ClothCoarse', skin: 'SkinPale', cap: false, accent: 'FabricRed' },
  PuppetSoldier: { height: 1.71, build: 1.02, coat: 'FabricKhaki', trim: 'ClothCoarse', skin: 'SkinWeathered', cap: true, accent: null },
  PuppetOfficer: { height: 1.73, build: 1.04, coat: 'FabricKhaki', trim: 'MetalDull', skin: 'SkinWeathered', cap: true, accent: null },
  JapaneseSoldier: { height: 1.68, build: 1.05, coat: 'ClothPadded', trim: 'MetalDull', skin: 'SkinWeathered', cap: true, accent: null },
  JapaneseNco: { height: 1.70, build: 1.08, coat: 'ClothPadded', trim: 'MetalDull', skin: 'SkinWeathered', cap: true, accent: null },
  Dog: { height: 0.72, build: 1.0, coat: 'Fur', trim: 'Fur', skin: 'Fur', cap: false, accent: null },
  Villager: { height: 1.62, build: 0.96, coat: 'ClothCoarse', trim: 'ClothPadded', skin: 'SkinWeathered', cap: false, accent: null },
  Courier: { height: 1.70, build: 0.98, coat: 'FabricGray', trim: 'ClothCoarse', skin: 'SkinWeathered', cap: true, accent: null },
};

export function CreateCharacterFactory(ctx, options) {
  const settings = options || {};
  const THREEns = ctx.THREE || THREE;
  const art = ctx.art;

  const group = new THREEns.Group();
  group.name = 'GroupCharacters';
  if (ctx.scene) ctx.scene.add(group);

  /* 共享几何：所有角色复用，靠逐骨缩放拉出体型差异。
     胶囊的「单位总高」= 2*radius + length，缩放时必须按这个换算，否则躯干会吞掉脑袋。 */
  const limbGeometry = new THREEns.CapsuleGeometry(0.5, 1.0, 4, 8);
  const limbUnitHeight = 2.0;
  const torsoGeometry = new THREEns.CapsuleGeometry(0.5, 0.9, 5, 10);
  const torsoUnitHeight = 1.9;
  const headGeometry = new THREEns.SphereGeometry(0.5, 12, 10);
  const footGeometry = new THREEns.BoxGeometry(1, 1, 1);
  const capGeometry = new THREEns.CylinderGeometry(0.52, 0.55, 0.32, 10);
  const geometries = [limbGeometry, torsoGeometry, headGeometry, footGeometry, capGeometry];

  const characters = [];
  const byId = new Map();
  let nextId = 0;

  function MakeBone(parent, x, y, z, name) {
    const bone = new THREEns.Object3D();
    bone.name = 'Bone' + name;
    bone.position.set(x, y, z);
    parent.add(bone);
    return bone;
  }

  function AttachMesh(bone, geometry, material, offsetY, scaleX, scaleY, scaleZ, castShadow) {
    const mesh = new THREEns.Mesh(geometry, material);
    mesh.position.y = offsetY;
    mesh.scale.set(scaleX, scaleY, scaleZ);
    mesh.castShadow = castShadow !== false;
    mesh.receiveShadow = true;
    bone.add(mesh);
    return mesh;
  }

  function Spawn(archetype, spawnOptions) {
    const spec = Archetypes[archetype] || Archetypes.ShenTie;
    const settingsSpawn = spawnOptions || {};
    const scale = settingsSpawn.scale === undefined ? 1 : settingsSpawn.scale;
    const height = spec.height * scale;
    const build = spec.build;
    const id = settingsSpawn.id || (archetype + '#' + (nextId += 1));

    const coatMaterial = art.MakeVariant(spec.coat, archetype + 'Coat', null);
    const trimMaterial = art.MakeVariant(spec.trim, archetype + 'Trim', null);
    const skinMaterial = art.MakeVariant(spec.skin, archetype + 'Skin', null);
    const accentMaterial = spec.accent ? art.MakeVariant(spec.accent, archetype + 'Accent', null) : null;

    const root = new THREEns.Group();
    root.name = 'Character_' + id;
    group.add(root);

    const hipHeight = height * 0.52;
    const legLength = hipHeight * 0.47;
    const torsoLength = height * 0.26;

    const hips = MakeBone(root, 0, hipHeight, 0, 'Hips');
    const spine = MakeBone(hips, 0, torsoLength * 0.26, 0, 'Spine');
    const chest = MakeBone(spine, 0, torsoLength * 0.44, 0, 'Chest');
    const neck = MakeBone(chest, 0, torsoLength * 0.40, 0, 'Neck');
    const head = MakeBone(neck, 0, height * 0.075, 0, 'Head');

    /* 肩必须比棉衣宽，否则胳膊整根埋进躯干里，剪影就是一个「布口袋」 */
    const shoulderWidth = height * 0.128 * build;
    const armUpper = height * 0.165;
    const armLower = height * 0.155;

    const shoulderLeft = MakeBone(chest, -shoulderWidth, torsoLength * 0.20, 0, 'ShoulderLeft');
    const elbowLeft = MakeBone(shoulderLeft, 0, -armUpper, 0, 'ElbowLeft');
    const handLeft = MakeBone(elbowLeft, 0, -armLower, 0, 'HandLeft');
    const shoulderRight = MakeBone(chest, shoulderWidth, torsoLength * 0.20, 0, 'ShoulderRight');
    const elbowRight = MakeBone(shoulderRight, 0, -armUpper, 0, 'ElbowRight');
    const handRight = MakeBone(elbowRight, 0, -armLower, 0, 'HandRight');
    const weapon = MakeBone(handRight, 0, -0.06, 0.09, 'Weapon');

    const hipSpread = height * 0.055 * build;
    const hipLeft = MakeBone(hips, -hipSpread, -height * 0.02, 0, 'HipLeft');
    const kneeLeft = MakeBone(hipLeft, 0, -legLength, 0, 'KneeLeft');
    const footLeft = MakeBone(kneeLeft, 0, -legLength, 0, 'FootLeft');
    const hipRight = MakeBone(hips, hipSpread, -height * 0.02, 0, 'HipRight');
    const kneeRight = MakeBone(hipRight, 0, -legLength, 0, 'KneeRight');
    const footRight = MakeBone(kneeRight, 0, -legLength, 0, 'FootRight');

    /* —— 皮肉：棉衣是最大的一块剪影 —— */
    const torsoHalfWidth = height * 0.093 * build;
    const torsoHalfDepth = height * 0.068 * build;
    const coatLength = torsoLength * 1.15;
    AttachMesh(spine, torsoGeometry, coatMaterial, coatLength * 0.5 - torsoLength * 0.10,
      torsoHalfWidth * 2, coatLength / torsoUnitHeight, torsoHalfDepth * 2);
    AttachMesh(hips, limbGeometry, coatMaterial, -height * 0.012,
      torsoHalfWidth * 2.05, (height * 0.13) / limbUnitHeight, torsoHalfDepth * 2.05);
    /* 脖子：不给一截脖子，脑袋就会陷进棉衣领子里 */
    AttachMesh(neck, limbGeometry, skinMaterial, height * 0.022,
      height * 0.055, (height * 0.075) / limbUnitHeight, height * 0.055);
    AttachMesh(head, headGeometry, skinMaterial, 0, height * 0.118, height * 0.140, height * 0.122);
    if (spec.cap) AttachMesh(head, capGeometry, trimMaterial, height * 0.052, height * 0.135, height * 0.075, height * 0.135);
    if (accentMaterial) {
      AttachMesh(head, limbGeometry, accentMaterial, height * 0.045,
        height * 0.13, (height * 0.02) / limbUnitHeight, height * 0.13);
    }

    const armThickness = height * 0.040 * build;
    AttachMesh(shoulderLeft, limbGeometry, coatMaterial, -armUpper * 0.5, armThickness * 2, (armUpper * 1.12) / limbUnitHeight, armThickness * 2);
    AttachMesh(elbowLeft, limbGeometry, coatMaterial, -armLower * 0.5, armThickness * 1.7, (armLower * 1.12) / limbUnitHeight, armThickness * 1.7);
    AttachMesh(handLeft, headGeometry, skinMaterial, -0.02, armThickness * 2.1, armThickness * 2.1, armThickness * 2.1);
    AttachMesh(shoulderRight, limbGeometry, coatMaterial, -armUpper * 0.5, armThickness * 2, (armUpper * 1.12) / limbUnitHeight, armThickness * 2);
    AttachMesh(elbowRight, limbGeometry, coatMaterial, -armLower * 0.5, armThickness * 1.7, (armLower * 1.12) / limbUnitHeight, armThickness * 1.7);
    AttachMesh(handRight, headGeometry, skinMaterial, -0.02, armThickness * 2.1, armThickness * 2.1, armThickness * 2.1);

    const legThickness = height * 0.050 * build;
    AttachMesh(hipLeft, limbGeometry, trimMaterial, -legLength * 0.5, legThickness * 2, (legLength * 1.12) / limbUnitHeight, legThickness * 2);
    AttachMesh(kneeLeft, limbGeometry, trimMaterial, -legLength * 0.5, legThickness * 1.75, (legLength * 1.12) / limbUnitHeight, legThickness * 1.75);
    AttachMesh(footLeft, footGeometry, trimMaterial, 0.01, legThickness * 2.1, height * 0.038, legThickness * 3.4);
    AttachMesh(hipRight, limbGeometry, trimMaterial, -legLength * 0.5, legThickness * 2, (legLength * 1.12) / limbUnitHeight, legThickness * 2);
    AttachMesh(kneeRight, limbGeometry, trimMaterial, -legLength * 0.5, legThickness * 1.75, (legLength * 1.12) / limbUnitHeight, legThickness * 1.75);
    AttachMesh(footRight, footGeometry, trimMaterial, 0.01, legThickness * 2.1, height * 0.038, legThickness * 3.4);

    const bones = {
      hips: hips, spine: spine, chest: chest, neck: neck, head: head,
      shoulderLeft: shoulderLeft, elbowLeft: elbowLeft, handLeft: handLeft,
      shoulderRight: shoulderRight, elbowRight: elbowRight, handRight: handRight,
      hipLeft: hipLeft, kneeLeft: kneeLeft, footLeft: footLeft,
      hipRight: hipRight, kneeRight: kneeRight, footRight: footRight,
      weapon: weapon,
    };

    const locomotion = {
      speed: 0, strafe: 0, turnRate: 0, crouch: false, prone: false, aiming: false,
      injured: 0, carrying: false, grounded: true, surface: 'Snow',
    };
    const modifiers = { breath: 0.25, shiver: 0, injury: 0, tension: 0, aimPitch: 0 };
    const actions = new Map();
    const footstepHandlers = [];
    const scratch = new THREEns.Vector3();

    let phase = 0;
    let previousPhaseSide = 0;
    let stanceBlend = 0;
    let time = MathUtil.Hash1((settingsSpawn.seed || nextId) * 7.3) * 10;
    let lookTarget = null;
    let lookWeight = 0;
    let disposed = false;

    const hitboxes = [
      { name: 'Head', radius: height * 0.12, offset: new THREEns.Vector3(0, height * 0.93, 0), multiplier: 2.6 },
      { name: 'Torso', radius: height * 0.20, offset: new THREEns.Vector3(0, height * 0.66, 0), multiplier: 1.0 },
      { name: 'ArmLeft', radius: height * 0.08, offset: new THREEns.Vector3(-shoulderWidth, height * 0.62, 0), multiplier: 0.7 },
      { name: 'ArmRight', radius: height * 0.08, offset: new THREEns.Vector3(shoulderWidth, height * 0.62, 0), multiplier: 0.7 },
      { name: 'LegLeft', radius: height * 0.09, offset: new THREEns.Vector3(-hipSpread, height * 0.25, 0), multiplier: 0.65 },
      { name: 'LegRight', radius: height * 0.09, offset: new THREEns.Vector3(hipSpread, height * 0.25, 0), multiplier: 0.65 },
    ];

    const character = {
      id: id,
      archetype: archetype,
      group: root,
      bones: bones,
      height: height,
      eyeHeight: height * 0.92,
      radius: Config.Player.radius * (build * 0.95),
      hitboxes: hitboxes,

      GetBone(name) { return bones[name] || null; },
      GetWorldPosition(boneName, out) {
        const bone = bones[boneName] || root;
        return bone.getWorldPosition(out || new THREEns.Vector3());
      },
      GetEyePosition(out) {
        const target = out || new THREEns.Vector3();
        bones.head.getWorldPosition(target);
        return target;
      },
      GetMuzzlePosition(out) {
        const target = out || new THREEns.Vector3();
        bones.weapon.getWorldPosition(target);
        return target;
      },
      GetMuzzleDirection(out) {
        const target = out || new THREEns.Vector3();
        root.getWorldDirection(target);
        return target.negate().normalize();
      },
      GetChestPosition(out) {
        const target = out || new THREEns.Vector3();
        bones.chest.getWorldPosition(target);
        return target;
      },
      GetHitSphere(part, out) {
        for (let i = 0; i < hitboxes.length; i += 1) {
          if (hitboxes[i].name !== part) continue;
          const target = out || {};
          target.center = root.position.clone().add(hitboxes[i].offset);
          target.radius = hitboxes[i].radius;
          return target;
        }
        return null;
      },
      RaycastHitbox(origin, direction, maxDistance) {
        let best = null;
        for (let i = 0; i < hitboxes.length; i += 1) {
          const box = hitboxes[i];
          scratch.copy(root.position).add(box.offset).sub(origin);
          const along = scratch.dot(direction);
          if (along < 0 || along > maxDistance) continue;
          const perpendicular = Math.sqrt(Math.max(0, scratch.lengthSq() - along * along));
          if (perpendicular > box.radius) continue;
          if (!best || along < best.distance) {
            best = {
              part: box.name,
              point: origin.clone().addScaledVector(direction, along),
              distance: along,
              multiplier: box.multiplier,
            };
          }
        }
        return best;
      },

      PlayAction(name, actionOptions) {
        const settingsAction = actionOptions || {};
        const handle = {
          name: name,
          done: false,
          Cancel() { handle.done = true; actions.delete(name); },
        };
        actions.set(name, {
          handle: handle,
          seconds: 0,
          duration: settingsAction.loop ? Infinity : (settingsAction.fade || 0.6),
          onDone: settingsAction.onDone || null,
        });
        return handle;
      },
      StopAction(name) { actions.delete(name); },
      IsPlaying(name) { return actions.has(name); },
      GetActionProgress(name) {
        const entry = actions.get(name);
        if (!entry || !isFinite(entry.duration)) return 0;
        return MathUtil.Clamp01(entry.seconds / entry.duration);
      },

      SetLocomotion(params) {
        if (!params) return;
        locomotion.speed = params.speed === undefined ? locomotion.speed : params.speed;
        locomotion.strafe = params.strafe === undefined ? locomotion.strafe : params.strafe;
        locomotion.turnRate = params.turnRate === undefined ? locomotion.turnRate : params.turnRate;
        locomotion.crouch = !!params.crouch;
        locomotion.prone = !!params.prone;
        locomotion.aiming = !!params.aiming;
        locomotion.injured = params.injured === undefined ? locomotion.injured : params.injured;
        locomotion.carrying = !!params.carrying;
        locomotion.grounded = params.grounded === undefined ? true : !!params.grounded;
        locomotion.surface = params.surface || locomotion.surface;
      },
      SetLookAt(worldPosition, weight) {
        lookTarget = worldPosition ? worldPosition.clone() : null;
        lookWeight = weight === undefined ? 1 : weight;
      },
      SetAimPitch(radians) { modifiers.aimPitch = radians; },
      SetHolding() { /* 灰盒阶段不挂武器模型，AgentCharacter 接管后实现 */ },
      SetBreath(intensity) { modifiers.breath = MathUtil.Clamp01(intensity); },
      SetShiver(intensity) { modifiers.shiver = MathUtil.Clamp01(intensity); },
      SetInjury(level) { modifiers.injury = MathUtil.Clamp01(level); },
      SetTension(level) { modifiers.tension = MathUtil.Clamp01(level); },
      SetVisible(visible) { root.visible = !!visible; },
      SetOpacity(alpha) {
        root.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material.transparent = alpha < 1;
            child.material.opacity = alpha;
          }
        });
      },
      SetPalette() { /* 灰盒阶段用固定调色板 */ },

      Warp(position, yaw) {
        root.position.copy(position);
        root.rotation.y = yaw === undefined ? root.rotation.y : yaw;
        root.updateMatrixWorld(true);
      },
      SetPosition(position) { root.position.copy(position); },
      GetPosition(out) { return (out || new THREEns.Vector3()).copy(root.position); },
      SetYaw(radians) { root.rotation.y = radians; },
      GetYaw() { return root.rotation.y; },

      OnFootstep(handler) {
        footstepHandlers.push(handler);
        return () => {
          const index = footstepHandlers.indexOf(handler);
          if (index >= 0) footstepHandlers.splice(index, 1);
        };
      },

      Update(dt) {
        if (disposed) return;
        time += dt;

        /* —— 步频：走 / 跑 用不同步幅，蹲伏更碎 —— */
        const speed = Math.max(0, locomotion.speed);
        const stride = locomotion.crouch ? Config.Player.footstepStrideCrouch
          : (speed > Config.Player.walkSpeed * 1.4 ? Config.Player.footstepStrideRun : Config.Player.footstepStrideWalk);
        const moving = speed > 0.08;
        if (moving) phase += (speed / Math.max(0.2, stride)) * dt * 2.2;
        else phase = MathUtil.Damp(phase % MathUtil.Tau, Math.round((phase % MathUtil.Tau) / Math.PI) * Math.PI, 6, dt);

        const side = Math.sin(phase) >= 0 ? 1 : -1;
        if (moving && side !== previousPhaseSide) {
          previousPhaseSide = side;
          if (footstepHandlers.length > 0) {
            const info = { side: side > 0 ? 'R' : 'L', position: root.position.clone(), speed: speed };
            for (let i = 0; i < footstepHandlers.length; i += 1) footstepHandlers[i](info);
          }
        }

        const targetStance = locomotion.prone ? 2 : (locomotion.crouch ? 1 : 0);
        stanceBlend = MathUtil.Damp(stanceBlend, targetStance, 9, dt);
        const crouchAmount = MathUtil.Clamp01(stanceBlend);
        const proneAmount = MathUtil.Clamp01(stanceBlend - 1);

        const swing = MathUtil.Lerp(0.42, 0.86, MathUtil.Clamp01(speed / Config.Player.runSpeed));
        const legSwing = Math.sin(phase) * swing * (1 - proneAmount * 0.7);
        const kneeBend = Math.max(0, -Math.sin(phase + 0.7)) * swing * 1.15;

        /* 腿 */
        bones.hipLeft.rotation.x = legSwing - crouchAmount * 0.75;
        bones.hipRight.rotation.x = -legSwing - crouchAmount * 0.75;
        bones.kneeLeft.rotation.x = -kneeBend - crouchAmount * 1.25;
        bones.kneeRight.rotation.x = -Math.max(0, Math.sin(phase + 0.7)) * swing * 1.15 - crouchAmount * 1.25;
        bones.footLeft.rotation.x = kneeBend * 0.4 + crouchAmount * 0.55;
        bones.footRight.rotation.x = Math.max(0, Math.sin(phase + 0.7)) * swing * 0.4 + crouchAmount * 0.55;

        /* 髋部：走路上下起伏 + 蹲伏下沉 + 受伤跛行 */
        const bob = moving ? Math.abs(Math.sin(phase)) * 0.035 * (0.5 + speed * 0.12) : 0;
        const limp = modifiers.injury * (Math.max(0, Math.sin(phase)) * 0.05);
        bones.hips.position.y = hipHeight - crouchAmount * (hipHeight * 0.30) - proneAmount * (hipHeight * 0.45) + bob - limp;
        bones.hips.rotation.z = Math.sin(phase) * 0.045 + modifiers.injury * 0.06;
        bones.hips.rotation.y = -locomotion.turnRate * 0.10;

        /* 躯干：前倾 = 潜行与紧张的读数 */
        const lean = crouchAmount * 0.42 + proneAmount * 0.55 + MathUtil.Clamp01(speed / Config.Player.runSpeed) * 0.20
          + modifiers.tension * 0.10;
        bones.spine.rotation.x = lean;
        bones.chest.rotation.x = lean * 0.35 + Math.sin(time * 1.4) * 0.012 * (0.4 + modifiers.breath);
        bones.chest.rotation.y = -Math.sin(phase) * 0.10 + locomotion.strafe * 0.12;
        bones.chest.rotation.z = modifiers.tension * 0.05;

        /* 头：呼吸 + 发抖 + 看向目标 */
        const shiver = modifiers.shiver * 0.035;
        bones.neck.rotation.x = -lean * 0.55 + modifiers.aimPitch * 0.4;
        bones.head.rotation.x = MathUtil.Wobble(time * 5.5, 1) * shiver;
        bones.head.rotation.z = MathUtil.Wobble(time * 6.2, 2) * shiver;
        if (lookTarget && lookWeight > 0) {
          bones.head.getWorldPosition(scratch);
          const deltaX = lookTarget.x - scratch.x;
          const deltaZ = lookTarget.z - scratch.z;
          const desired = Math.atan2(deltaX, deltaZ) - root.rotation.y;
          bones.head.rotation.y = MathUtil.Damp(bones.head.rotation.y,
            MathUtil.Clamp(MathUtil.WrapAngle(desired), -1.1, 1.1) * lookWeight, 8, dt);
        } else {
          bones.head.rotation.y = MathUtil.Damp(bones.head.rotation.y, 0, 5, dt);
        }

        /* 手臂：反相摆动；瞄准时抬到胸前 */
        const armSwing = -legSwing * 0.75;
        const aim = locomotion.aiming ? 1 : 0;
        const guard = MathUtil.Lerp(0, 1, aim);
        bones.shoulderLeft.rotation.x = MathUtil.Lerp(armSwing - crouchAmount * 0.25, -1.15, guard);
        bones.shoulderRight.rotation.x = MathUtil.Lerp(-armSwing - crouchAmount * 0.25, -1.30, guard);
        bones.shoulderLeft.rotation.z = MathUtil.Lerp(0.12 + modifiers.tension * 0.16, 0.42, guard);
        bones.shoulderRight.rotation.z = MathUtil.Lerp(-0.12 - modifiers.tension * 0.16, -0.30, guard);
        bones.elbowLeft.rotation.x = MathUtil.Lerp(-0.25 - Math.max(0, armSwing) * 0.6, -1.05, guard);
        bones.elbowRight.rotation.x = MathUtil.Lerp(-0.25 - Math.max(0, -armSwing) * 0.6, -0.85, guard);

        /* 一次性动作只走计时，姿态留给 AgentCharacter */
        for (const entry of actions.values()) {
          entry.seconds += dt;
          if (entry.seconds >= entry.duration) {
            entry.handle.done = true;
            if (entry.onDone) entry.onDone();
            actions.delete(entry.handle.name);
          }
        }
      },

      Dispose() {
        if (disposed) return;
        disposed = true;
        if (root.parent) root.parent.remove(root);
        footstepHandlers.length = 0;
        actions.clear();
      },
    };

    characters.push(character);
    byId.set(id, character);
    return character;
  }

  const factory = {
    group: group,
    count: 0,
    Spawn: Spawn,
    Despawn(character) {
      if (!character) return;
      const index = characters.indexOf(character);
      if (index >= 0) characters.splice(index, 1);
      byId.delete(character.id);
      character.Dispose();
      factory.count = characters.length;
    },
    GetById(id) { return byId.get(id) || null; },
    Update(dt, frameCtx) {
      factory.count = characters.length;
      const camera = frameCtx ? frameCtx.camera : null;
      const nearDistance = Config.Render.lodNearDistance;
      const farDistance = Config.Render.lodFarDistance;
      for (let i = 0; i < characters.length; i += 1) {
        const character = characters[i];
        let step = dt;
        if (camera) {
          const distance = camera.position.distanceTo(character.group.position);
          if (distance > farDistance) continue;
          if (distance > nearDistance && (frameCtx.frame + i) % 4 !== 0) continue;
          if (distance > nearDistance) step = dt * 4;
        }
        character.Update(step, frameCtx);
      }
    },
    Dispose() {
      for (let i = characters.length - 1; i >= 0; i -= 1) characters[i].Dispose();
      characters.length = 0;
      byId.clear();
      for (let i = 0; i < geometries.length; i += 1) geometries[i].dispose();
      if (group.parent) group.parent.remove(group);
    },
  };

  if (settings.debug) factory.archetypes = Archetypes;
  return factory;
}

export default CreateCharacterFactory;
