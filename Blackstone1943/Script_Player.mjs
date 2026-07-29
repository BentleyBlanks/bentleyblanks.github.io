/**
 * Script_Player.mjs — 输入（键鼠 + 触屏）与第三人称控制器 / 相机
 * Owner: AgentPlayer
 *
 * ⚠ 本文件目前是 **AgentBoot 铺设的可运行灰盒实现**：公开 API 与 AGENTS.md 5.9 一致，
 *   AgentPlayer 接管后可整体重写内部（贴墙、翻越、瞄准、触屏手感），调用方无需改动。
 *
 * 依赖 DAG：three, Config, Math, Event, Character（经 ctx.characters）。
 */

import * as THREE from 'three';
import { Config } from './Script_Config.mjs';
import * as MathUtil from './Script_Math.mjs';
import { EventNames } from './Script_Event.mjs';

/* ================================================================== *
 * 一、输入
 * ================================================================== */

/** 物理键 → 动作名。键位表由 GetBindingsText 供 HUD 显示。 */
const KeyBindings = {
  KeyW: 'moveForward', KeyS: 'moveBack', KeyA: 'moveLeft', KeyD: 'moveRight',
  ArrowUp: 'moveForward', ArrowDown: 'moveBack', ArrowLeft: 'moveLeft', ArrowRight: 'moveRight',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  KeyC: 'crouch', KeyZ: 'prone', KeyF: 'interact', KeyR: 'reload', KeyQ: 'throw',
  KeyE: 'command', KeyV: 'melee', KeyG: 'swap', KeyL: 'flashlight',
  KeyB: 'menu', Tab: 'menu', Escape: 'pause', Space: 'vault',
};

const BindingLabels = [
  { action: 'move', key: 'W / A / S / D', label: '移动' },
  { action: 'sprint', key: 'Shift', label: '奔跑' },
  { action: 'crouch', key: 'C', label: '蹲伏' },
  { action: 'prone', key: 'Z', label: '伏地' },
  { action: 'interact', key: 'F', label: '交互 / 搜刮' },
  { action: 'aim', key: '鼠标右键', label: '瞄准' },
  { action: 'fire', key: '鼠标左键', label: '开火' },
  { action: 'melee', key: 'V', label: '近战' },
  { action: 'throw', key: 'Q', label: '投掷' },
  { action: 'reload', key: 'R', label: '上膛' },
  { action: 'command', key: 'E', label: '指令小满' },
  { action: 'menu', key: 'Tab', label: '背包' },
  { action: 'pause', key: 'Esc', label: '暂停' },
];

export function CreateInput(ctx, options) {
  const settings = options || {};
  const element = settings.element || ctx.canvas || (typeof document !== 'undefined' ? document.body : null);
  const down = new Set();
  /* 本帧对外可见的按下/抬起沿。只在 Update 里被整体替换，帧内保持稳定。 */
  const pressed = new Set();
  const released = new Set();
  /* DOM 事件在帧与帧之间到达，先写进 pending，由 Update 交接给上面两个集合。
     若直接写 pressed，帧头的 pressed.clear() 会在任何消费者读到之前把沿抹掉。 */
  const pendingPressed = new Set();
  const pendingReleased = new Set();
  const virtualButtons = new Set();
  const axes = { moveX: 0, moveY: 0, lookX: 0, lookY: 0 };
  const virtualAxes = { moveX: 0, moveY: 0, lookX: 0, lookY: 0 };

  let enabled = true;
  let sensitivity = 1;
  let invertY = false;
  let touchEnabled = false;
  let lastInputAt = 0;
  let dragging = false;
  let pendingLookX = 0;
  let pendingLookY = 0;
  const disposers = [];

  const isTouch = typeof window !== 'undefined'
    && (('ontouchstart' in window) || (navigator && navigator.maxTouchPoints > 0));

  function Mark(name, isDown) {
    if (isDown) {
      if (!down.has(name)) pendingPressed.add(name);
      down.add(name);
    } else {
      if (down.has(name)) pendingReleased.add(name);
      down.delete(name);
    }
    lastInputAt = 0;
  }

  function OnKeyDown(event) {
    if (!enabled) return;
    const action = KeyBindings[event.code];
    if (!action) return;
    if (event.code === 'Tab' || event.code === 'Space') event.preventDefault();
    if (event.repeat) return;
    Mark(action, true);
  }

  function OnKeyUp(event) {
    const action = KeyBindings[event.code];
    if (!action) return;
    Mark(action, false);
  }

  function OnMouseDown(event) {
    if (!enabled) return;
    if (event.button === 0) Mark('fire', true);
    else if (event.button === 2) Mark('aim', true);
    dragging = true;
  }

  function OnMouseUp(event) {
    if (event.button === 0) Mark('fire', false);
    else if (event.button === 2) Mark('aim', false);
    dragging = false;
  }

  function OnMouseMove(event) {
    if (!enabled) return;
    const locked = typeof document !== 'undefined' && document.pointerLockElement === element;
    if (!locked && !dragging) return;
    pendingLookX += event.movementX || 0;
    pendingLookY += event.movementY || 0;
    lastInputAt = 0;
  }

  function OnContextMenu(event) { event.preventDefault(); }
  function OnBlur() { down.clear(); dragging = false; }

  function OnPointerDown() {
    if (input.isPointerLocked || isTouch) return;
    input.RequestPointerLock();
  }

  function Bind(target, type, handler, useOptions) {
    if (!target || !target.addEventListener) return;
    target.addEventListener(type, handler, useOptions);
    disposers.push(() => target.removeEventListener(type, handler, useOptions));
  }

  const input = {
    axes: axes,
    isTouch: isTouch,
    isPointerLocked: false,

    Down(name) { return down.has(name) || virtualButtons.has(name); },
    Pressed(name) { return pressed.has(name); },
    Released(name) { return released.has(name); },
    Consume(name) {
      if (!pressed.has(name)) return false;
      pressed.delete(name);
      return true;
    },
    AnyInputSinceSeconds() { return lastInputAt; },

    SetVirtualAxis(name, x, y) {
      if (name === 'move') { virtualAxes.moveX = x; virtualAxes.moveY = y; }
      else { virtualAxes.lookX = x; virtualAxes.lookY = y; }
      lastInputAt = 0;
    },
    SetVirtualButton(name, isDown) {
      if (isDown) {
        if (!virtualButtons.has(name)) pendingPressed.add(name);
        virtualButtons.add(name);
      } else {
        if (virtualButtons.has(name)) pendingReleased.add(name);
        virtualButtons.delete(name);
      }
      lastInputAt = 0;
    },
    SetTouchEnabled(value) { touchEnabled = !!value; },

    SetSensitivity(value) { sensitivity = Math.max(0.05, value); },
    SetInvertY(value) { invertY = !!value; },
    SetEnabled(value) {
      enabled = !!value;
      /* 禁用时连未派发的沿一起丢掉，避免菜单关掉的瞬间补放一个陈旧按键。 */
      if (!enabled) { down.clear(); pendingPressed.clear(); pendingReleased.clear(); }
    },
    RequestPointerLock() {
      if (!element || !element.requestPointerLock) return;
      try {
        const result = element.requestPointerLock();
        if (result && typeof result.catch === 'function') result.catch(() => {});
      } catch (error) { /* 浏览器拒绝就退回拖拽视角，不抛错 */ }
    },
    ExitPointerLock() {
      if (typeof document !== 'undefined' && document.exitPointerLock) {
        try { document.exitPointerLock(); } catch (error) { /* 忽略 */ }
      }
    },
    GetBindingsText() { return BindingLabels.slice(); },

    Update(dt) {
      /* 交接上一帧末到本帧头之间累积的沿，让 Player / Hud / Combat 在本帧内都能读到。 */
      pressed.clear();
      released.clear();
      for (const name of pendingPressed) pressed.add(name);
      for (const name of pendingReleased) released.add(name);
      pendingPressed.clear();
      pendingReleased.clear();
      lastInputAt += dt;

      let moveX = 0;
      let moveY = 0;
      if (input.Down('moveLeft')) moveX -= 1;
      if (input.Down('moveRight')) moveX += 1;
      if (input.Down('moveForward')) moveY += 1;
      if (input.Down('moveBack')) moveY -= 1;
      if (touchEnabled || virtualAxes.moveX !== 0 || virtualAxes.moveY !== 0) {
        moveX += virtualAxes.moveX;
        moveY += virtualAxes.moveY;
      }
      const length = Math.sqrt(moveX * moveX + moveY * moveY);
      if (length > 1) { moveX /= length; moveY /= length; }
      axes.moveX = moveX;
      axes.moveY = moveY;

      const lookScale = 0.0022 * sensitivity;
      axes.lookX = pendingLookX * lookScale + virtualAxes.lookX * dt * 2.2 * sensitivity;
      axes.lookY = (pendingLookY * lookScale + virtualAxes.lookY * dt * 2.2 * sensitivity) * (invertY ? -1 : 1);
      pendingLookX = 0;
      pendingLookY = 0;
      virtualAxes.lookX = 0;
      virtualAxes.lookY = 0;
    },

    Dispose() {
      for (let i = 0; i < disposers.length; i += 1) disposers[i]();
      disposers.length = 0;
      down.clear();
      pressed.clear();
      released.clear();
      pendingPressed.clear();
      pendingReleased.clear();
    },
  };

  if (typeof window !== 'undefined') {
    Bind(window, 'keydown', OnKeyDown);
    Bind(window, 'keyup', OnKeyUp);
    Bind(window, 'blur', OnBlur);
    Bind(window, 'mouseup', OnMouseUp);
    Bind(window, 'mousemove', OnMouseMove);
    Bind(document, 'pointerlockchange', () => {
      input.isPointerLocked = document.pointerLockElement === element;
    });
  }
  if (element) {
    Bind(element, 'mousedown', OnMouseDown);
    Bind(element, 'contextmenu', OnContextMenu);
    Bind(element, 'pointerdown', OnPointerDown);
  }

  return input;
}

/* ================================================================== *
 * 二、玩家控制器 + 第三人称相机
 * ================================================================== */

export function CreatePlayer(ctx, options) {
  const settings = options || {};
  const THREEns = ctx.THREE || THREE;
  const world = ctx.world;
  const camera = ctx.camera;
  const input = ctx.input;
  const bus = ctx.bus;
  const cameraConfig = Config.Camera;
  const playerConfig = Config.Player;

  const character = ctx.characters.Spawn('ShenTie', { id: 'PlayerShenTie' });
  const spawn = settings.spawn || (world && world.spawns ? world.spawns.playerStart : null);
  const position = new THREEns.Vector3(0, 0, 0);
  if (spawn && spawn.position) position.copy(spawn.position);
  if (world) position.y = world.SampleHeight(position.x, position.z);
  const velocity = new THREEns.Vector3();

  let yaw = spawn && spawn.yaw !== undefined ? spawn.yaw : 0;
  let pitch = -0.12;
  let bodyYaw = yaw;
  let cameraMode = 'Follow';
  let cameraDistance = cameraConfig.distance;
  let shakeEnabled = true;
  let interactTarget = null;
  let interactSeconds = 0;
  let promptVisible = false;

  character.Warp(position, bodyYaw);

  const state = {
    stance: 'Stand',
    sprinting: false,
    aiming: false,
    braced: false,
    inCover: false,
    coverId: null,
    peeking: 0,
    grounded: true,
    moving: false,
    speed: 0,
    surface: 'Snow',
    indoors: false,
    controlEnabled: true,
    interacting: false,
    dead: false,
    noiseRadius: 0,
    concealment: 0,
    lightLevel: 1,
  };

  const scratchA = new THREEns.Vector3();
  const scratchB = new THREEns.Vector3();
  const scratchC = new THREEns.Vector3();
  const desiredCamera = new THREEns.Vector3();
  const cameraTarget = new THREEns.Vector3();
  const forwardVector = new THREEns.Vector3(0, 0, -1);
  const cameraLookAt = new THREEns.Vector3();
  let cameraInitialised = false;
  let breathTime = 0;

  const unsubscribeFootstep = character.OnFootstep((info) => {
    const kind = state.stance === 'Crouch' ? 'footstepCrouch'
      : (state.sprinting ? 'footstepRun' : 'footstepWalk');
    player.EmitNoise(kind);
    if (world && world.StampFootprint) {
      scratchC.set(-Math.sin(bodyYaw), 0, -Math.cos(bodyYaw));
      world.StampFootprint(info.position, scratchC, 'Player', state.surface);
    }
  });

  function CurrentSpeedLimit() {
    if (state.stance === 'Prone') return playerConfig.proneSpeed;
    if (state.stance === 'Crouch') return playerConfig.crouchSpeed;
    if (state.aiming) return playerConfig.aimSpeed;
    if (state.sprinting) return playerConfig.runSpeed;
    return playerConfig.walkSpeed;
  }

  function StanceHeightOffset() {
    if (state.stance === 'Prone') return cameraConfig.proneHeightOffset;
    if (state.stance === 'Crouch') return cameraConfig.crouchHeightOffset;
    return 0;
  }

  function UpdateCamera(dt) {
    const pivotHeight = playerConfig.eyeHeight + StanceHeightOffset();
    cameraTarget.set(position.x, position.y + pivotHeight, position.z);

    const cosPitch = Math.cos(pitch);
    forwardVector.set(-Math.sin(yaw) * cosPitch, Math.sin(pitch), -Math.cos(yaw) * cosPitch).normalize();
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    const aiming = state.aiming || cameraMode === 'Aim';
    const wantedDistance = aiming ? cameraConfig.aimDistance : cameraConfig.distance;
    cameraDistance = MathUtil.Damp(cameraDistance, wantedDistance, cameraConfig.aimLambda, dt);

    const shoulder = cameraConfig.shoulderOffset;
    desiredCamera.copy(cameraTarget);
    desiredCamera.x += rightX * shoulder.x;
    desiredCamera.z += rightZ * shoulder.x;
    desiredCamera.addScaledVector(forwardVector, -cameraDistance);

    /* 相机避障：从人物胸口往镜头位置打一条射线，撞墙就把镜头拉近 */
    if (world && world.Raycast) {
      scratchA.copy(desiredCamera).sub(cameraTarget);
      const length = scratchA.length();
      if (length > 0.01) {
        scratchA.multiplyScalar(1 / length);
        const hit = world.Raycast(cameraTarget, scratchA, length + cameraConfig.collisionRadius);
        if (hit && hit.distance < length) {
          desiredCamera.copy(cameraTarget).addScaledVector(scratchA, Math.max(0.4, hit.distance - cameraConfig.collisionRadius));
        }
      }
    }
    /* 永远不许穿到地面以下 */
    if (world) {
      const floor = world.SampleHeight(desiredCamera.x, desiredCamera.z) + 0.35;
      if (desiredCamera.y < floor) desiredCamera.y = floor;
    }

    if (!cameraInitialised) { camera.position.copy(desiredCamera); cameraInitialised = true; }
    else {
      const lambda = aiming ? cameraConfig.aimLambda : cameraConfig.followLambda;
      camera.position.x = MathUtil.Damp(camera.position.x, desiredCamera.x, lambda, dt);
      camera.position.y = MathUtil.Damp(camera.position.y, desiredCamera.y, lambda, dt);
      camera.position.z = MathUtil.Damp(camera.position.z, desiredCamera.z, lambda, dt);
    }

    /* 镜头呼吸与手持微抖：唯一让画面「活着」的东西，可在无障碍里关掉 */
    breathTime += dt;
    if (shakeEnabled) {
      const breath = MathUtil.Breath(breathTime, cameraConfig.breathRate, cameraConfig.breathAmplitude);
      const handheld = MathUtil.Wobble(breathTime * cameraConfig.handheldRate, 3) * cameraConfig.handheldAmplitude;
      camera.position.y += breath;
      camera.position.x += handheld;
    }

    cameraLookAt.copy(cameraTarget).addScaledVector(forwardVector, 8);
    camera.lookAt(cameraLookAt);

    const targetFov = aiming ? cameraConfig.aimFov
      : cameraConfig.fov + (state.sprinting && state.moving ? cameraConfig.sprintFovBoost : 0);
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov = MathUtil.Damp(camera.fov, targetFov, 8, dt);
      camera.updateProjectionMatrix();
    }
  }

  const player = {
    character: character,
    object: character.group,
    position: position,
    velocity: velocity,
    yaw: yaw,
    pitch: pitch,
    state: state,

    GetEyePosition(out) {
      const target = out || new THREEns.Vector3();
      return target.set(position.x, position.y + playerConfig.eyeHeight + StanceHeightOffset(), position.z);
    },
    GetAimRay(out) {
      const target = out || {};
      target.origin = player.GetEyePosition(target.origin instanceof THREEns.Vector3 ? target.origin : new THREEns.Vector3());
      target.direction = (target.direction instanceof THREEns.Vector3 ? target.direction : new THREEns.Vector3())
        .copy(forwardVector);
      return target;
    },
    GetAimPoint(maxDistance, out) {
      const target = out || new THREEns.Vector3();
      const ray = player.GetAimRay();
      if (world && world.Raycast) {
        const hit = world.Raycast(ray.origin, ray.direction, maxDistance);
        if (hit) return target.copy(hit.point);
      }
      return target.copy(ray.origin).addScaledVector(ray.direction, maxDistance);
    },
    GetForward(out) {
      const target = out || new THREEns.Vector3();
      return target.set(-Math.sin(bodyYaw), 0, -Math.cos(bodyYaw)).normalize();
    },

    GetStealthProfile() {
      return {
        position: position,
        eyePosition: player.GetEyePosition(scratchB),
        height: state.stance === 'Prone' ? playerConfig.proneHeight
          : (state.stance === 'Crouch' ? playerConfig.crouchHeight : playerConfig.height),
        moving: state.moving,
        speed: state.speed,
        crouched: state.stance === 'Crouch',
        prone: state.stance === 'Prone',
        inCover: state.inCover,
        concealment: state.concealment,
        lightLevel: state.lightLevel,
        indoors: state.indoors,
      };
    },

    Teleport(target, newYaw) {
      position.copy(target);
      if (world) position.y = world.SampleHeight(position.x, position.z);
      if (newYaw !== undefined) { yaw = newYaw; bodyYaw = newYaw; }
      character.Warp(position, bodyYaw);
      cameraInitialised = false;
    },
    ApplyImpulse(vector) { velocity.add(vector); },
    SetControlEnabled(value) { state.controlEnabled = !!value; },
    SetStance(stance) {
      if (stance !== 'Stand' && stance !== 'Crouch' && stance !== 'Prone') return false;
      state.stance = stance;
      return true;
    },
    SetWeaponDrawn(kind) { character.SetHolding(kind); },
    EmitNoise(kind, radiusOverride) {
      const table = Config.Stealth.Noise;
      const base = radiusOverride === undefined ? (table[kind] === undefined ? 3 : table[kind]) : radiusOverride;
      const surfaceScale = Config.Stealth.SurfaceNoiseScale[state.surface] || 1;
      state.noiseRadius = base * surfaceScale;
      bus.Emit(EventNames.NoiseEmitted, {
        position: position, radius: state.noiseRadius, kind: kind, sourceId: 'Player', hostile: false,
      });
    },
    StartInteract(interactable) {
      if (!interactable) return false;
      interactTarget = interactable;
      interactSeconds = 0;
      state.interacting = true;
      bus.Emit(EventNames.InteractStarted, {
        targetId: interactable.id, kind: interactable.kind, seconds: interactable.seconds,
      });
      return true;
    },
    CancelInteract() {
      if (!interactTarget) return;
      bus.Emit(EventNames.InteractFinished, { targetId: interactTarget.id, kind: interactTarget.kind, completed: false });
      interactTarget = null;
      state.interacting = false;
    },
    ForceStagger(fromPosition, strength) {
      scratchA.subVectors(position, fromPosition).setY(0).normalize().multiplyScalar(strength);
      velocity.add(scratchA);
      character.PlayAction('Stagger', { fade: 0.5 });
    },
    PlayScriptedPose(actionName, seconds) {
      character.PlayAction(actionName, { fade: seconds });
    },

    SetCameraMode(mode) { cameraMode = mode; },
    GetCameraMode() { return cameraMode; },
    SetCameraShakeEnabled(value) { shakeEnabled = !!value; },
    NudgeCamera(yawDelta, pitchDelta) {
      yaw += yawDelta;
      pitch = MathUtil.Clamp(pitch + pitchDelta,
        cameraConfig.pitchMinDeg * MathUtil.DegToRad, cameraConfig.pitchMaxDeg * MathUtil.DegToRad);
    },

    Update(dt) {
      if (dt <= 0) return;

      /* —— 视角 —— */
      if (state.controlEnabled && input) {
        yaw -= input.axes.lookX;
        pitch = MathUtil.Clamp(pitch - input.axes.lookY,
          cameraConfig.pitchMinDeg * MathUtil.DegToRad, cameraConfig.pitchMaxDeg * MathUtil.DegToRad);
      }
      yaw = MathUtil.WrapAngle(yaw);

      /* —— 姿态 —— */
      if (state.controlEnabled && input) {
        if (input.Consume('crouch')) state.stance = state.stance === 'Crouch' ? 'Stand' : 'Crouch';
        if (input.Consume('prone')) state.stance = state.stance === 'Prone' ? 'Stand' : 'Prone';
        state.sprinting = input.Down('sprint') && state.stance === 'Stand' && !state.aiming;
        state.aiming = input.Down('aim');
      }

      /* —— 位移 —— */
      const moveX = state.controlEnabled && input ? input.axes.moveX : 0;
      const moveY = state.controlEnabled && input ? input.axes.moveY : 0;
      const inputLength = Math.min(1, Math.sqrt(moveX * moveX + moveY * moveY));

      const forwardX = -Math.sin(yaw);
      const forwardZ = -Math.cos(yaw);
      const rightX = Math.cos(yaw);
      const rightZ = -Math.sin(yaw);
      const wishX = forwardX * moveY + rightX * moveX;
      const wishZ = forwardZ * moveY + rightZ * moveX;

      const limit = CurrentSpeedLimit() * MathUtil.Lerp(1, playerConfig.injuredSpeedScale, 0.35);
      const targetVelocityX = wishX * limit;
      const targetVelocityZ = wishZ * limit;
      const rate = inputLength > 0.01 ? playerConfig.acceleration : playerConfig.deceleration;
      velocity.x = MathUtil.MoveTowards(velocity.x, targetVelocityX, rate * dt);
      velocity.z = MathUtil.MoveTowards(velocity.z, targetVelocityZ, rate * dt);

      scratchA.copy(position);
      scratchB.set(position.x + velocity.x * dt, position.y, position.z + velocity.z * dt);
      if (world) world.ResolveMove(scratchA, scratchB, playerConfig.radius, position);
      else position.copy(scratchB);

      const planarSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
      state.speed = planarSpeed;
      state.moving = planarSpeed > 0.08;
      state.grounded = true;

      /* —— 朝向：移动时朝移动方向，瞄准时朝镜头 —— */
      const desiredYaw = state.aiming ? yaw
        : (state.moving ? Math.atan2(-wishX, -wishZ) : bodyYaw);
      const previousBodyYaw = bodyYaw;
      bodyYaw = MathUtil.DampAngle(bodyYaw, desiredYaw, playerConfig.turnLambda, dt);
      const turnRate = MathUtil.AngleDelta(previousBodyYaw, bodyYaw) / Math.max(dt, 1e-4);

      character.SetPosition(position);
      character.SetYaw(bodyYaw);
      character.SetLocomotion({
        speed: planarSpeed,
        strafe: moveX,
        turnRate: turnRate,
        crouch: state.stance === 'Crouch',
        prone: state.stance === 'Prone',
        aiming: state.aiming,
        injured: 0.25,
        carrying: false,
        grounded: true,
        surface: state.surface,
      });
      character.SetAimPitch(pitch);
      character.SetBreath(MathUtil.Clamp01(0.2 + planarSpeed / playerConfig.runSpeed));

      /* —— 环境采样 —— */
      if (world) {
        state.surface = world.SampleGroundKind(position.x, position.z);
        state.concealment = world.SampleConcealment(position, state.stance === 'Crouch', state.stance === 'Prone');
        state.lightLevel = world.GetLightLevel(position);
        state.indoors = world.IsIndoors(position);
      }

      /* —— 交互 —— */
      if (world && world.QueryInteractable) {
        const forward = player.GetForward(scratchC);
        const candidate = world.QueryInteractable(position, forward, 2.4);
        if (candidate && !state.interacting) {
          if (!promptVisible || (interactTarget && interactTarget.id !== candidate.id)) {
            promptVisible = true;
            bus.Emit(EventNames.InteractPrompt, {
              visible: true, text: candidate.label, keyLabel: 'F', kind: candidate.kind, targetId: candidate.id,
            });
          }
          if (input && input.Consume('interact')) player.StartInteract(candidate);
        } else if (promptVisible && !candidate) {
          promptVisible = false;
          bus.Emit(EventNames.InteractPrompt, { visible: false, text: '', keyLabel: 'F', kind: 'None', targetId: null });
        }
      }
      if (state.interacting && interactTarget) {
        interactSeconds += dt;
        if (state.moving || interactSeconds >= interactTarget.seconds) {
          const completed = interactSeconds >= interactTarget.seconds;
          if (completed) {
            if (world) world.SetInteractableState(interactTarget.id, interactTarget.kind === 'Door' ? 'Open' : 'Used');
            player.EmitNoise('container', interactTarget.noiseRadius);
          }
          bus.Emit(EventNames.InteractFinished, {
            targetId: interactTarget.id, kind: interactTarget.kind, completed: completed,
          });
          interactTarget = null;
          state.interacting = false;
        }
      }

      player.yaw = yaw;
      player.pitch = pitch;
      UpdateCamera(dt);
    },

    Dispose() {
      unsubscribeFootstep();
      if (ctx.characters) ctx.characters.Despawn(character);
    },
  };

  return player;
}

export default CreatePlayer;
