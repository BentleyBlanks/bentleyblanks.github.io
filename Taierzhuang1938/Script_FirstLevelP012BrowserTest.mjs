// P012 真浏览器验收。截图成功不等于玩法通过，运行时断言与人工看图分别记录。
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { P012_ANCHORS, P012_ROUTES } from "./Data_FirstLevelP012Layout.mjs";
import { P012SouthPoint } from "./Data_FirstLevelP012Space.mjs";
import { VOICE_LINES as chapterVoices } from "./Data_MissionCh1.mjs";
import { VOICE_LINES as prologueVoices } from "./Data_MissionCh0.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
// Predeclared sensitivity settings, not calibrated claims about human skill.
// Neither setting reads live recoil offsets or acquires targets outside the camera.
const perceptionName = process.argv.find(arg => arg.startsWith("--perception="))?.split("=")[1];
const perceptionProfiles = {
  bounded: { name: "bounded", confirmationFrames: 23, turnRadPerSecond: 1.5, errorRad: 0.004, shotIntervalS: 1.5 },
  deliberate: { name: "deliberate", confirmationFrames: 36, turnRadPerSecond: 1, errorRad: 0.007, shotIntervalS: 2 },
};
if (perceptionName && !perceptionProfiles[perceptionName]) throw new Error(`Unknown perception profile: ${perceptionName}`);
const perceptionProfile = perceptionProfiles[perceptionName] || null;
const runLabel = process.argv.find(arg => arg.startsWith("--run-label="))?.split("=")[1] || "";
const orientationReview = process.argv.includes("--orientation");
const openingGuidanceReview = process.argv.includes("--opening-guidance");
if (runLabel && !/^[A-Za-z0-9_]+$/.test(runLabel)) throw new Error("Run label must contain only English letters, digits, or underscores");
const outputDir = process.env.P012_SCREENSHOT_DIR || path.join(os.tmpdir(),
  perceptionProfile ? `P012WhiteboxPerception_${perceptionProfile.name}${runLabel ? `_${runLabel}` : ""}`
    : process.argv.includes("--campaign") ? `P012WhiteboxCampaign${runLabel ? `_${runLabel}` : ""}`
      : `P012WhiteboxReview${runLabel ? `_${runLabel}` : ""}`);
await fs.mkdir(outputDir, { recursive: true });
const server = await ServeRoot(rootDir, 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
const audioSmoke = process.argv.includes("--audio-smoke");
if (audioSmoke && ["--campaign", "--frontline", "--prelude", "--pacing", "--voice-timing"].some(flag => process.argv.includes(flag))) {
  throw new Error("--audio-smoke is a separate real-time playback fixture, not accelerated campaign timing");
}
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error" && !/fonts\.(googleapis|gstatic)\.com/.test(message.location()?.url || "")) {
    errors.push(message.text());
  }
});

function Check(condition, label, detail = "") {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ""}`);
  console.log(`ok  ${label}${detail ? ` — ${detail}` : ""}`);
}

// 只驱动移动与交互输入，不改任务阶段，不传送，不把完成标志直接写进导演。
async function PlayPrelude() {
  let result;
  const orientations = [];
  for (let chunk = 0; chunk < 36; chunk += 1) {
    result = await page.evaluate(({ orientationReview }) => {
      const game = window.Tengxian;
      const bot = window.p012ReviewBot ||= { held: {}, trace: [], frame: 0, lastProgress: 0, progressKey: "" };
      const Key = (code, down) => {
        if (!!bot.held[code] === down) return;
        game.Debug.Key(code, down); bot.held[code] = down;
      };
      for (let frame = 0; frame < 600; frame += 1) {
        const flow = game.Debug.P012();
        if (window.p012PendingTrafficView) break;
        const objective = flow.objective;
        if (flow.beatIndex >= 6 || !game.player.Alive) break;
        // Return an actual gameplay frame while the landmark is being observed.
        // No camera override or stage initialization is used for these captures.
        if (orientationReview && flow.beatIndex === 3 && objective.progress?.value >= 1
          && !(bot.capturedOrientations || []).includes(flow.orientationIndex)) {
          (bot.capturedOrientations ||= []).push(flow.orientationIndex);
          bot.pendingOrientation = { index: flow.orientationIndex, at: flow.elapsed,
            text: objective.text, progress: { ...objective.progress }, lookAt: objective.lookAt };
          break;
        }
        const progressKey = [flow.beat, flow.routeIndex, flow.orientationIndex, flow.facts.join(",")].join("|");
        if (bot.progressKey !== progressKey) {
          bot.progressKey = progressKey; bot.lastProgress = flow.elapsed;
          bot.trace.push({ at: flow.elapsed, beat: flow.beat, action: flow.action,
            routeIndex: flow.routeIndex, orientationIndex: flow.orientationIndex });
        }
        if (flow.elapsed - bot.lastProgress > 65) break;
        const target = objective.target;
        if (!target) break;
        const dx = target.x - game.player.position.x, dz = target.z - game.player.position.z;
        const distance = Math.hypot(dx, dz);
        const interactionId = objective.interactionId;
        const following = objective.requiredAction === "follow";
        const crouching = flow.beatIndex === 4 ? distance < 3.1 : objective.requiredStance === "crouch";
        if (game.player.stance !== (crouching ? "crouch" : "stand")) game.Debug.Key("KeyC");
        const arrive = interactionId ? flow.beatIndex === 1 ? 0.35 : 1.6
          // Respect the public opening follow radius instead of deliberately
          // walking into the leader's backpack. Later carry/escort stays unchanged.
          : following ? [0,2].includes(flow.beatIndex) ? objective.arrivalRadiusM : 1.2 : flow.beatIndex === 4 ? 2 : 0.8;
        const move = distance > arrive && !bot.held.KeyF;
        Key("KeyW", move);
        Key("ShiftLeft", move && flow.beatIndex === 4 && !crouching);
        if (distance > 0.15) game.player.yaw = Math.atan2(-dx, -dz);
        if (objective.lookAt && distance <= 2.8) {
          game.player.yaw = Math.atan2(-(objective.lookAt.x - game.player.position.x),
            -(objective.lookAt.z - game.player.position.z));
          Key("KeyW", false);
        }
        const point = interactionId && game.interact.Point(interactionId);
        if (point && distance <= 1.7) {
          const anchor = point.Anchor ? point.Anchor() : point.position;
          game.player.yaw = Math.atan2(-(anchor.x - game.player.position.x), -(anchor.z - game.player.position.z));
          if (game.interact.Query(game.player)?.point?.id === interactionId) {
            Key("KeyW", false);
            Key("KeyF", true);
          }
        } else Key("KeyF", false);
        if (objective.requiredAction === "reload" && distance < 2.7 && bot.frame % 60 === 0) game.Debug.Key("KeyR");
        game.StepFrames(1, 1 / 30, false);
        bot.frame += 1;
      }
      for (const code of Object.keys(bot.held)) Key(code, false);
      game.StepFrames(1);
      const orientation = bot.pendingOrientation ? { ...bot.pendingOrientation,
        player: game.player.position.toArray(), yaw: game.player.yaw, pitch: game.player.pitch,
        camera: game.camera.position.toArray() } : null;
      bot.pendingOrientation = null;
      const trafficView = window.p012PendingTrafficView || null;
      if(trafficView)trafficView.openingCast=game.Debug.P012Scene?.().openingCast;
      window.p012PendingTrafficView = null;
      return { flow: game.Debug.P012(), scene: game.Debug.P012Scene?.(),
        orientation, trafficView,
        position: game.player.position.toArray(), health: game.player.health, alive: game.player.Alive,
        trace: bot.trace, stalled: game.Debug.P012().elapsed - bot.lastProgress > 65,
        weapons: game.Debug.Slots(), carry: game.carry.KindId, ammo: game.state.ammo, interact: game.Debug.Interact() };
    }, { orientationReview });
    if (result.orientation) {
      orientations.push(result.orientation);
      await page.screenshot({ path: path.join(outputDir, `Scene_P012Orientation${result.orientation.index + 1}.png`) });
    }
    if (result.trafficView) {
      await fs.writeFile(path.join(outputDir, `Data_P012Traffic_${result.trafficView.captureId}.json`), JSON.stringify(result.trafficView, null, 2));
      await page.screenshot({ path: path.join(outputDir, `Scene_P012Traffic_${result.trafficView.captureId}.png`) });
    }
    console.log("P012 opening", JSON.stringify({ at: result.flow.elapsed, beat: result.flow.beat,
      route: result.flow.routeIndex, action: result.flow.action, position: result.position,
      guide: result.scene?.guidePosition, trafficReady: result.scene?.trafficReady }));
    if (result.stalled || !result.alive || result.flow.beatIndex >= 6) break;
  }
  Check(result.flow.beatIndex >= 6, "真实移动、观察、验枪与搬弹完成开场",
    result.flow.beatIndex >= 6 ? `${result.flow.elapsed.toFixed(1)}s` : JSON.stringify(result));
  Check(result.carry === null, "弹药实际交付后释放双手，能够拔枪");
  if (orientationReview) {
    Check(orientations.length === 4, "四处方位观察均记录真实第一人称帧（可读性另行人工看图）");
    await fs.writeFile(path.join(outputDir, "Data_P012OrientationTrace.json"), JSON.stringify(orientations, null, 2));
  }
  await fs.writeFile(path.join(outputDir, "Data_P012OpeningTrace.json"), JSON.stringify(result, null, 2));
  await page.screenshot({ path: path.join(outputDir, "Scene_P012FirstContact.png") });
  console.log("P012 opening activity trace", JSON.stringify(result.trace));
}

async function PlayFrontline() {
  const fullCampaign = process.argv.includes("--campaign");
  const recoverDeaths = process.argv.includes("--recover-deaths");
  const deaths = [];
  let result;
  let capturedBeat = -1;
  let capturedWindow = false;
  let capturedJointAirView = false;
  for (let chunk = 0; chunk < (fullCampaign ? 250 : 45); chunk += 1) {
    result = await page.evaluate(({ ports, fullCampaign, anchors, routes, retryDive, perception, spatial }) => {
      const game = window.Tengxian;
      const bot = window.p012CombatReview ||= { frame: 0, firstShotAt: null, trace: [], oldBeat: -1, shots: [], targetId: null, aimFrames: 0, held: {}, cleanupPoint: 0, lastProgress: 0, progressKey: "" };
      const Key = (code, down) => {
        if (!!bot.held[code] === down) return;
        game.Debug.Key(code, down); bot.held[code] = down;
      };
      for (let frame = 0; frame < 600; frame += 1) {
        const flow = game.Debug.P012();
        if (window.p012JointAirView && !bot.jointAirViewCaptured) {
          bot.jointAirViewCaptured = true;
          break;
        }
        // Observer-only lateral/backward input is scoped to the aircraft turn.
        // Always release it before another objective, interaction or retry.
        Key("KeyS", false); Key("KeyA", false); Key("KeyD", false);
        const interactionId = flow.objective.interactionId || null;
        if (bot.interactionId !== interactionId) {
          Key("KeyF", false);
          bot.interactionId = interactionId;
        }
        if (Number.isFinite(bot.previousElapsed) && flow.elapsed < bot.previousElapsed - 1) {
          bot.rewindCount = (bot.rewindCount || 0) + 1;
          bot.forceMissDone = true;
        }
        bot.previousElapsed = flow.elapsed;
        // A broken retry must produce bounded, actionable evidence instead of repeating the whole beat forever.
        if ((bot.rewindCount || 0) >= 3) break;
        if (flow.beatIndex === 19 && bot.frame % 3 === 0) {
          const airState = game.Debug.Strafe.State();
          (bot.diveTrace ||= []).push({ at: flow.elapsed, attempt: bot.rewindCount || 0,
            position: game.player.position.toArray(), stance: game.player.stance,
            carry: game.carry.KindId, health: game.player.health,
            player: airState.run?.player, held: { ...bot.held },
            intentionalMiss: retryDive && !bot.forceMissDone });
        }
        if (flow.beatIndex >= (fullCampaign ? 25 : 11) || !game.player.Alive) break;
        if (flow.beatIndex !== bot.oldBeat) {
          const scene = game.Debug.P012Scene();
          bot.trace.push({ at: flow.elapsed, beat: flow.beat,
            lastLitterArrived: scene.lastLitterArrived, litterRecovered: scene.litterRecovered,
            lastLitterArrivedEvent: flow.signals.includes("P012LastLitterArrived"),
            woundedDragDistance: scene.woundedDragDistance, carryDistance: scene.carryDistance,
            originalLitter: scene.litters.find(litter => litter.originalCarried)?.id,
            ...(flow.beatIndex === 24 ? { litterParking: scene.litters.map(litter => ({
              id: litter.id, front: litter.front, rear: litter.rear,
            })) } : {}),
            aliveColumnCount: scene.columnActors.length });
          bot.oldBeat = flow.beatIndex;
          if (frame > 0) break;
        }
        // 飞机目标转移只有数秒：每2秒交回真实画面，避免20秒采样跨过整个转弯。
        if (flow.beatIndex >= 16 && flow.beatIndex <= 19 && frame >= 60) break;
        const progressKey = [flow.beat, flow.routeIndex, flow.retreatPoint, flow.spawnedTotal,
          game.Debug.P012Scene().nearEnemyDeaths, game.Debug.P012Scene().columnRouteIndex, flow.facts.join(",")].join("|");
        if (bot.progressKey !== progressKey) { bot.progressKey = progressKey; bot.lastProgress = flow.elapsed; }
        if (flow.elapsed - bot.lastProgress > 180) break;
        if (retryDive && flow.beatIndex === 19 && !bot.forceMissDone) {
          game.Debug.Mouse(2, false); Key("KeyW", false); Key("KeyF", false); Key("ShiftLeft", false);
          if (game.player.stance !== "stand") game.Debug.Key(game.player.stance === "prone" ? "KeyZ" : "KeyC");
          game.StepFrames(1, 1 / 30, false); bot.frame += 1;
          continue;
        }
        if (game.player.bleeding > 0 && game.player.bandages > 0) game.Debug.Key("KeyB");
        // An actual window glance after clearing the interior firing pair.
        // Observe the moving litter through real collision/LOS; do not advance its path or facts.
        if (flow.beatIndex === 14 && flow.routeIndex >= 3 && !bot.windowView
          && Math.hypot(game.player.position.x - spatial.window.x, game.player.position.z - spatial.window.z) < 2
          && (bot.windowWatchFrames || 0) < 240) {
          const litter = game.Debug.P012Scene().litters[0];
          if (litter?.front && litter?.rear) {
            const aim = game.player.position.clone().set((litter.front.x + litter.rear.x) / 2, 1.1,
              (litter.front.z + litter.rear.z) / 2);
            game.Debug.Mouse(2, false); Key("KeyW", false); Key("ShiftLeft", false);
            if (game.player.stance !== "stand") game.Debug.Key(game.player.stance === "prone" ? "KeyZ" : "KeyC");
            const direction = aim.clone().sub(game.player.EyePosition), distance = direction.length();
            game.player.yaw = Math.atan2(-direction.x, -direction.z);
            game.player.pitch = Math.atan2(direction.y, Math.hypot(direction.x, direction.z));
            const hit = game.battlefield.Raycast(game.player.EyePosition, direction.normalize(), distance);
            const visible = !hit || hit.t > distance - 0.5;
            bot.windowWatchFrames = (bot.windowWatchFrames || 0) + 1;
            game.StepFrames(1, 1 / 30, false); bot.frame += 1;
            if (visible && bot.windowWatchFrames >= 20 && litter.front.z > 16) {
              bot.windowView = { at: flow.elapsed, player: game.player.position.toArray(),
                target: aim.toArray(), litter: litter.id, collisionClear: true };
              break;
            }
            continue;
          }
        }
        // 与屏幕手雷预警同源：真实移开，不站在落点上让战斗验收退化成木桩测试。
        const grenadeThreat = game.combat.GrenadeThreats(game.player.position)
          .find(threat => threat.fuse < 3.5 && threat.distance < threat.dangerRadius * 0.9);
        if (grenadeThreat && flow.beatIndex <= 21) {
          const dx = game.player.position.x - grenadeThreat.position.x;
          const dz = game.player.position.z - grenadeThreat.position.z;
          game.Debug.Mouse(2, false); Key("KeyF", false);
          if (game.player.stance !== "stand") game.Debug.Key(game.player.stance === "prone" ? "KeyZ" : "KeyC");
          game.player.yaw = Math.atan2(-dx, -dz);
          game.Debug.Key("KeyW", true); Key("ShiftLeft", true);
          game.StepFrames(1, 1 / 30, false); bot.frame += 1;
          continue;
        }
        if (flow.beatIndex <= 10 && flow.objective.interactionId === "p012_frontlineAmmo") {
          const point = game.interact.Point("p012_frontlineAmmo");
          const anchor = point.Anchor ? point.Anchor() : point.position;
          const dx = anchor.x - game.player.position.x, dz = anchor.z - game.player.position.z;
          const distance = Math.hypot(dx, dz);
          game.Debug.Mouse(2, false); Key("ShiftLeft", false);
          if (game.player.stance !== "crouch") game.Debug.Key("KeyC");
          game.player.yaw = Math.atan2(-dx, -dz); game.player.pitch = 0;
          Key("KeyW", distance > 1.5 && !bot.held.KeyF);
          const reachable = distance < 1.7 && game.interact.Query(game.player)?.point?.id === "p012_frontlineAmmo";
          Key("KeyF", reachable);
          if (reachable) Key("KeyW", false);
          game.StepFrames(1, 1 / 30, false); bot.frame += 1;
          continue;
        }
        let destination = null;
        if (flow.beatIndex === 6 || flow.beatIndex === 7) destination = flow.objective.target || ports[1];
        if (flow.beatIndex === 8) destination = flow.objective.target || ports[2];
        if (flow.beatIndex === 9) destination = flow.objective.target || ports[1];
        if (flow.beatIndex === 10) destination = flow.objective.target || ports[0];
        if (destination && flow.beatIndex <= 10 && flow.objective.requiredAction !== "move") destination = { x: destination.x, z: destination.z - 0.8 };
        if (flow.beatIndex >= 11) {
          const objective = flow.objective;
          const point = objective.interactionId && game.interact.Point(objective.interactionId);
          const anchor = point && (point.Anchor ? point.Anchor() : point.position);
          destination = anchor || objective.target;
          if (flow.beatIndex === 15 && !destination) destination = spatial.airRoad;
          const diveOpen = flow.beatIndex === 19 && game.Debug.Strafe.State().run?.player?.open;
          if (flow.beatIndex === 19) destination = { x: anchors.strafeSlots[0].x, z: anchors.strafeSlots[0].z + (diveOpen ? 0 : 1.8) };
          if (flow.beatIndex === 20 && !destination) destination = anchors.strafeSlots[0];
          if (flow.beatIndex === 22 && !destination) destination = spatial.southBlockade;
          const distance = destination ? Math.hypot(destination.x - game.player.position.x, destination.z - game.player.position.z) : Infinity;
          if (![14, 20, 21].includes(flow.beatIndex) || point || objective.requiredAction === "grenade") {
            game.Debug.Mouse(2, false);
            const arrive = point ? 1.5 : objective.requiredAction === "follow"
              ? Math.max(0.1, Math.min(2.4, (objective.arrivalRadiusM ?? 2.45) - 0.05))
              : Math.min(0.9, (objective.arrivalRadiusM ?? 0.95) - 0.05);
            Key("KeyW", !!destination && distance > arrive && !bot.held.KeyF);
            Key("ShiftLeft", objective.requiredAction === "sprint" && !!destination && distance > arrive);
            if (destination && distance > 0.1) {
              game.player.yaw = Math.atan2(-(destination.x - game.player.position.x), -(destination.z - game.player.position.z));
              game.player.pitch = 0;
            }
            const strafeState = game.Debug.Strafe.State();
            const air = strafeState.modelAt;
            // A player can choose to track the five-second turn while backing
            // toward the public ditch objective. Use ordinary movement keys;
            // do not lock the production camera or move any actor directly.
            // Global frame-modulo glances previously missed the end of this
            // event when earlier travel changed by a fraction of a second.
            const observeTurn = flow.beatIndex === 17 && strafeState.run?.presetId === "crowdTurn"
              && strafeState.run?.phase === "approach";
            if ([16, 17].includes(flow.beatIndex) && air
              && (observeTurn || !destination || distance <= arrive || bot.frame % 90 < 30)) {
              Key("KeyW", false);
              const eye = game.player.EyePosition;
              game.player.yaw = Math.atan2(-(air.x - eye.x), -(air.z - eye.z));
              game.player.pitch = Math.atan2(air.y - eye.y, Math.hypot(air.x - eye.x, air.z - eye.z));
              if (observeTurn && destination && distance > arrive && !bot.held.KeyF) {
                const dx = (destination.x - game.player.position.x) / distance;
                const dz = (destination.z - game.player.position.z) / distance;
                const sine = Math.sin(game.player.yaw), cosine = Math.cos(game.player.yaw);
                const forward = -(dx * sine + dz * cosine), right = dx * cosine - dz * sine;
                Key("KeyW", forward > 0.25); Key("KeyS", forward < -0.25);
                Key("KeyD", right > 0.25); Key("KeyA", right < -0.25);
              }
            }
            if (flow.beatIndex === 22 && objective.requiredAction === "observe" && objective.lookAt && distance < arrive + 0.2) {
              const target = objective.lookAt;
              game.player.yaw = target ? Math.atan2(-(target.x - game.player.position.x), -(target.z - game.player.position.z)) : Math.PI;
              game.player.pitch = 0;
            }
            const crouching = (flow.beatIndex === 23 && objective.requiredAction === "crouch" && distance < 3)
              || diveOpen;
            const stance = diveOpen ? "prone" : objective.requiredStance || (crouching ? "crouch" : "stand");
            if (game.player.stance !== stance) game.Debug.Key(stance === "prone" || game.player.stance === "prone" ? "KeyZ" : "KeyC");
            if (point && distance < 1.7 && game.interact.Query(game.player)?.point?.id === objective.interactionId) {
              Key("KeyW", false); Key("KeyF", true);
            } else Key("KeyF", false);
            if (objective.requiredAction === "grenade" && distance < 1.7 && objective.lookAt
              && flow.elapsed - (bot.lastGrenadeAt || 0) > 9) {
              const target = objective.lookAt;
              Key("KeyW", false);
              game.player.yaw = Math.atan2(-(target.x - game.player.position.x), -(target.z - game.player.position.z));
              game.player.pitch = 0;
              game.Debug.Key("KeyG"); bot.lastGrenadeAt = flow.elapsed;
            }
            if (objective.requiredAction === "reload" && distance < 2.7 && bot.frame % 60 === 0) game.Debug.Key("KeyR");
            game.StepFrames(1, 1 / 30, false); bot.frame += 1;
            continue;
          }
        }
        Key("KeyF", false);
        if (destination && Math.hypot(destination.x - game.player.position.x, destination.z - game.player.position.z)
          > (flow.beatIndex <= 10 ? 0.35 : [14, 21].includes(flow.beatIndex)
            ? Math.max(0.1, (flow.objective.arrivalRadiusM ?? 0.6) - 0.05) : 1)) {
          game.Debug.Mouse(2, false);
          Key("ShiftLeft", flow.objective.requiredAction === "sprint");
          game.player.yaw = Math.atan2(-(destination.x - game.player.position.x), -(destination.z - game.player.position.z));
          game.Debug.Key("KeyW", true);
          const stance = flow.beatIndex <= 10
            ? (flow.objective.requiredAction === "sprint" ? "stand"
              : flow.objective.requiredStance === "prone" ? "prone" : "crouch")
            : flow.objective.requiredStance || "stand";
          if (game.player.stance !== stance) game.Debug.Key(stance === "prone" || game.player.stance === "prone" ? "KeyZ" : "KeyC");
        } else {
          game.Debug.Key("KeyW", false);
          const behindCover = (flow.beatIndex <= 10 || [14, 20, 21].includes(flow.beatIndex))
            && (game.viewmodel.IsBusy?.() || game.state.ammo === 0);
          const noLiveThreats = !game.ai.soldiers.some(soldier => soldier.alive && soldier.side === "ija");
          const stance = behindCover ? "prone" : noLiveThreats && flow.objective.requiredStance
            ? flow.objective.requiredStance : "stand";
          if (game.player.stance !== stance) game.Debug.Key(stance === "prone" || game.player.stance === "prone" ? "KeyZ" : "KeyC");
          const eye = game.player.EyePosition.clone();
          const candidates = [];
          for (const soldier of game.ai.soldiers) {
            if (!soldier.alive || soldier.side !== "ija") continue;
            if (perception) {
              const screen = soldier.position.clone().add({ x: 0, y: 1.2, z: 0 }).project(game.camera);
              if (screen.z < -1 || screen.z > 1 || Math.abs(screen.x) > 0.95 || Math.abs(screen.y) > 0.95) continue;
            }
            const shapes = soldier.actor?.GetBoneHitboxes?.() || [];
            // A head visibly exposed above a parapet remains a perceptible target;
            // refusing it would test an artificial inability to recognize heads.
            // The precision fixture used to keep selecting the low torso behind
            // the distant MG parapet after many visible misses. Prefer the
            // exposed head for long shots; still require live LOS/hitboxes and
            // use ordinary trigger, spread and damage (never write enemy health).
            const parts=!perception && soldier.position.distanceTo(eye)>60 ? ["head","torso"] : ["torso","head"];
            for (const part of parts) {
              const shape = shapes.find(item => item.part === part);
              if (!shape) continue;
              const aim = ["sphere", "ellipsoid"].includes(shape.type) ? shape.center.clone()
                : shape.start.clone().add(shape.end).multiplyScalar(0.5);
              const direction = aim.clone().sub(eye), distance = direction.length(); direction.normalize();
              const obstacle = game.battlefield.Raycast(eye, direction, distance);
              if (obstacle && obstacle.t < distance - 0.4) continue;
              if (!soldier.actor.RaycastHitboxes(eye, direction, distance + 0.5)) continue;
              if (game.ai.soldiers.some(ally => ally.alive && ally.side === "nra"
                && ally.actor?.RaycastHitboxes?.(eye, direction, distance - 0.6))) continue;
              candidates.push({ soldier, aim, distance, part });
              break;
            }
          }
          candidates.sort((a, b) => a.distance - b.distance);
          const chosen = candidates[0];
          if (perception) {
            // LOS-visible enemies inside the current view may be remembered only
            // while visible. Public objectives tell us where to scan, not where to hit.
            const Turn = (yaw, pitch) => {
              const max = perception.turnRadPerSecond / 30;
              const delta = Math.atan2(Math.sin(yaw - game.player.yaw), Math.cos(yaw - game.player.yaw));
              game.player.yaw += Math.max(-max, Math.min(max, delta));
              game.player.pitch += Math.max(-max, Math.min(max, pitch - game.player.pitch));
            };
            if (chosen) {
              if (bot.targetId !== chosen.soldier.id) { bot.targetId = chosen.soldier.id; bot.aimFrames = 0; }
              bot.aimFrames += 1;
              const aim = chosen.aim.clone().sub(eye);
              const errorYaw = Math.sin(flow.elapsed * 1.7 + chosen.soldier.id) * perception.errorRad;
              const errorPitch = Math.cos(flow.elapsed * 1.1 + chosen.soldier.id) * perception.errorRad;
              const yaw = Math.atan2(-aim.x, -aim.z) + errorYaw;
              const pitch = Math.atan2(aim.y, Math.hypot(aim.x, aim.z)) + errorPitch;
              Turn(yaw, pitch);
              const linedUp = Math.abs(Math.atan2(Math.sin(yaw - game.player.yaw), Math.cos(yaw - game.player.yaw))) < 0.025
                && Math.abs(pitch - game.player.pitch) < 0.025;
              game.Debug.Mouse(2, bot.aimFrames >= perception.confirmationFrames);
              Key("ShiftLeft", game.player.ads > 0.95 && !behindCover);
              if (linedUp && bot.aimFrames >= perception.confirmationFrames && game.player.ads > 0.95
                && !game.viewmodel.IsBusy?.() && game.state.ammo > 0
                && flow.elapsed - (bot.lastPerceptionShotAt ?? -Infinity) >= perception.shotIntervalS) {
                const before = game.state.ammo;
                game.Debug.Fire();
                if (game.state.ammo < before) {
                  bot.lastPerceptionShotAt = flow.elapsed;
                  if (bot.firstShotAt === null) bot.firstShotAt = flow.elapsed;
                  bot.shots.push({ at: flow.elapsed, distance: chosen.distance, part: chosen.part,
                    aim: chosen.aim.toArray(), enemy: chosen.soldier.position.toArray(), ...game.Debug.LastShot() });
                }
              }
            } else {
              bot.targetId = null; bot.aimFrames = 0;
              game.Debug.Mouse(2, false); Key("ShiftLeft", false);
              const look = flow.objective.lookAt;
              const base = look ? Math.atan2(-(look.x - eye.x), -(look.z - eye.z)) : 0;
              Turn(base + Math.sin(flow.elapsed * 0.35) * 1.1, 0);
            }
            if (game.state.ammo === 0 && !game.viewmodel.IsBusy?.()) game.Debug.Key("KeyR");
            game.StepFrames(1, 1 / 30, false); bot.frame += 1;
            continue;
          }
          game.Debug.Mouse(2, !!chosen);
          Key("ShiftLeft", !!chosen && game.player.ads > 0.95 && !behindCover);
          if (chosen) {
            if (bot.targetId !== chosen.soldier.id) { bot.targetId = chosen.soldier.id; bot.aimFrames = 0; }
            bot.aimFrames += 1;
            const aim = chosen.aim.clone().sub(eye);
            // 近距聚集的涵洞兵可以用现有有限投掷物处理；按键走真实弹道/引信/伤害。
            const grouped = candidates.filter(candidate => candidate.soldier.position.distanceTo(chosen.soldier.position) < 5).length;
            if (flow.beatIndex === 10 && chosen.distance >= 8 && chosen.distance < 19
              && grouped >= 2 && game.state.grenades > 0 && flow.elapsed - (bot.lastGrenadeAt || 0) > 9
              && !game.viewmodel.IsBusy?.()) {
              game.player.yaw = Math.atan2(-aim.x, -aim.z);
              game.player.pitch = chosen.distance < 12 ? -0.18 : 0;
              game.Debug.Key("KeyG"); bot.lastGrenadeAt = flow.elapsed;
            }
            game.player.yaw = Math.atan2(-aim.x, -aim.z) - game.player.aimYaw;
            // 靶场同口径：射击会先顶起准星；只调整瞄点，不绕过散布/弹道/命中。
            game.player.pitch = Math.atan2(aim.y, Math.hypot(aim.x, aim.z)) - game.player.aimPitch - (chosen.part === "head" ? 0.014 : 0.005);
            // After lining up a close-range peek, shoot when the production
            // weapon is ready; do not stand exposed waiting for a test clock.
            if ((flow.beatIndex <= 10 ? bot.frame % 60 === 0 : true)
              && bot.aimFrames > 18 && game.player.ads > 0.95 && !game.viewmodel.IsBusy?.() && game.state.ammo > 0) {
              const before = game.state.ammo;
              game.Debug.Fire();
              if (game.state.ammo < before) {
                if (bot.firstShotAt === null) bot.firstShotAt = flow.elapsed;
                bot.shots.push({ at: flow.elapsed, distance: chosen.distance, part: chosen.part,
                  aim: chosen.aim.toArray(), enemy: chosen.soldier.position.toArray(), ...game.Debug.LastShot() });
              }
            }
          } else { bot.targetId = null; bot.aimFrames = 0; }
          if (game.state.ammo === 0 && !game.viewmodel.IsBusy?.()) game.Debug.Key("KeyR");
        }
        game.StepFrames(1, 1 / 30, false); bot.frame += 1;
      }
      for (const code of Object.keys(bot.held)) Key(code, false);
      game.Debug.Key("KeyW", false); game.Debug.Mouse(2, false); game.StepFrames(1);
      return { flow: game.Debug.P012(), scene: game.Debug.P012Scene(), health: game.player.health,
        activity: window.p012ActivityTrace || [],
        airViews: window.p012AirViews || [], crowdFireCues: window.p012CrowdFireCues || [], airGroundShots: window.p012AirGroundShots || [],
        airImpacts: window.p012AirImpacts || [],
        escortApproval: window.p012EscortApproval || [],
        prematureEscortMovement: window.p012PrematureEscortMovement || [],
        southGrenadeExplosions: window.p012SouthGrenadeExplosions || [],
        jointAirView: window.p012JointAirView || null,
        windowView: bot.windowView || null,
        damageTrace: window.p012DamageTrace || [],
        bleeding: game.player.bleeding, bandages: game.player.bandages,
        companions: game.ai.soldiers.filter(s => s.side === "nra" && s.castId).map(s => ({
          id: s.castId, alive: s.alive, health: s.health, position: s.position.toArray(),
          state: s.state, order: s.order, scripted: s.p012Guided, defense: s.scriptDefensive })),
        position: game.player.position.toArray(), ammo: game.state.ammo, clips: game.state.clips,
        firstShotAt: bot.firstShotAt, perceptionProfile: perception, rewindCount: bot.rewindCount || 0, diveTrace: bot.diveTrace || [],
        trace: bot.trace, hits: game.Debug.Hits(), shots: bot.shots,
        carry: game.carry.KindId, strafe: game.Debug.Strafe.State(), interact: game.Debug.Interact(),
        stalled: game.Debug.P012().elapsed - bot.lastProgress > 180 || (bot.rewindCount || 0) >= 3,
        enemies: game.ai.soldiers.filter(s => s.alive && s.side === "ija").map(s => ({
          position: s.position.toArray(), health: s.health, state: s.state, goal: s.goal.toArray() })) };
    }, { ports: P012_ANCHORS.gunports, fullCampaign, anchors: P012_ANCHORS, routes: P012_ROUTES,
      retryDive: process.argv.includes("--retry"), perception: perceptionProfile,
      spatial:{window:P012SouthPoint(68,24),airRoad:P012SouthPoint(50,68),southBlockade:P012SouthPoint(42,98)} });
    console.log("P012 frontline", JSON.stringify({ at: result.flow.elapsed, beat: result.flow.beat,
      health: result.health, ammo: result.ammo, clips: result.clips, position: result.position,
      enemies: result.enemies.length, dead: result.scene.nearEnemyDeaths, firstShotAt: result.firstShotAt,
      action: result.flow.action, carry: result.carry, route: result.flow.routeIndex, returnPoint: result.flow.retreatPoint,
      column: result.scene.columnPosition }));
    if (capturedBeat !== result.flow.beatIndex) {
      capturedBeat = result.flow.beatIndex;
      await page.screenshot({ path: path.join(outputDir, `Scene_P012${result.flow.beat}.png`) });
    }
    if (result.windowView && !capturedWindow) {
      capturedWindow = true;
      await page.screenshot({ path: path.join(outputDir, "Scene_P012WindowLitterResponse.png") });
    }
    if (result.jointAirView && !capturedJointAirView) {
      capturedJointAirView = true;
      await page.screenshot({ path: path.join(outputDir, "Scene_P012AircraftAndCivilians.png") });
    }
    if (result.flow.beatIndex >= 16 && result.flow.beatIndex <= 19) {
      await page.screenshot({ path: path.join(outputDir, `Scene_P012Air${Math.round(result.flow.elapsed * 10)}.png`) });
    }
    if ([14, 20, 21, 23, 24].includes(result.flow.beatIndex)) {
      await page.screenshot({ path: path.join(outputDir, `Scene_P012Combat${result.flow.beat}_${Math.round(result.flow.elapsed * 10)}.png`) });
    }
    if (result.health <= 0 && recoverDeaths && deaths.length < 4) {
      // Exercise the visible player-only retry. Never erase the death record,
      // replenish ammunition, restore enemies or rewind the campaign ourselves.
      deaths.push({ at: result.flow.elapsed, beat: result.flow.beat, position: result.position,
        ammo: result.ammo, clips: result.clips, carry: result.carry,
        damageTrace: result.damageTrace, routeIndex: result.flow.routeIndex });
      await fs.writeFile(path.join(outputDir, "Data_P012OrdinaryDeaths.json"), JSON.stringify(deaths, null, 2));
      await page.locator('#menu button[data-act="retrySandbox"]').click();
      const recovery = await page.evaluate(() => {
        const game = window.Tengxian;
        const bot = window.p012CombatReview;
        bot.lastProgress = game.Debug.P012().elapsed;
        bot.targetId = null; bot.aimFrames = 0;
        return { alive: game.player.Alive, elapsed: game.Debug.P012().elapsed,
          ammo: game.state.ammo, clips: game.state.clips, position: game.player.position.toArray() };
      });
      Check(recovery.alive && recovery.ammo === result.ammo && recovery.clips === result.clips
        && Math.abs(recovery.elapsed - result.flow.elapsed) < 0.1,
      "普通死亡通过可见菜单继续，保留战场时间与弹药", JSON.stringify(recovery));
      continue;
    }
    if (result.flow.beatIndex >= (fullCampaign ? 25 : 11) || result.health <= 0 || result.stalled) break;
  }
  result.ordinaryDeaths = deaths;
  await fs.writeFile(path.join(outputDir, "Data_P012GameplayTrace.json"), JSON.stringify(result, null, 2));
  Check(result.flow.beatIndex >= (fullCampaign ? 25 : 11), fullCampaign ? "整关真实输入顺序通关" : "有限前线五波可由真实操作完成",
    `${result.flow.beat} at ${result.flow.elapsed.toFixed(1)}s; health ${result.health}; ${path.join(outputDir, "Data_P012GameplayTrace.json")}`);
  Check(result.firstShotAt !== null, "玩家实际参与射击而非全靠友军清场", String(result.firstShotAt));
  // P0's explicit acceptance window (4:30–5:30) takes precedence over the
  // illustrative 4:45 start in P1's table. Do not pad walking to hit that start.
  Check(result.firstShotAt >= 270 && result.firstShotAt <= 330,
    "实际第一枪落在 P0 四分半至五分半窗口", `${result.firstShotAt.toFixed(1)}s`);
  Check(result.shots[0]?.distance >= 44 && result.shots[0]?.distance <= 61,
    "中央枪眼首次交火距离约 45–60 米（含角色与枪眼边缘容差）", `${result.shots[0]?.distance?.toFixed(2)}m`);
  Check(result.flow.frontlineAmmo.remainingClips >= 0 && result.flow.spawnedTotal <= 33,
    "弹药与近敌保持有限预算");
  const tacticalPressures = result.flow.pressureHistory.filter(entry => ["machineGun", "mortar", "culvert"].includes(entry.kind));
  Check(tacticalPressures.length === 3 && tacticalPressures.every(entry => entry.interval >= 29.99),
    "机枪、掷弹筒、涵洞三种新压力不因快清敌而密集叠加", JSON.stringify(tacticalPressures));
  if (fullCampaign && process.argv.includes("--retry")) Check(result.rewindCount >= 1,
    "故意错过首次扑救后真实回退并继续通关", `${result.rewindCount}次`);
  if (fullCampaign) {
    const requested = result.escortApproval.find(entry => entry.event === "P012EscortRequested");
    const spoken = result.escortApproval.find(entry => entry.event === "LuoApprovalStarted");
    const approved = result.escortApproval.find(entry => entry.event === "P012EscortApproved");
    const departed = result.escortApproval.find(entry => entry.event === "EscortCall");
    Check(requested && spoken && approved && departed && requested.at <= spoken.at
      && approved.at >= spoken.at + (spoken.duration || 0) - 0.04 && approved.at <= departed.at
      && result.prematureEscortMovement.length === 0,
    "实际请求、批准语音时长／字幕占用结束、担架启程按因果先后发生", JSON.stringify(result.escortApproval));
    const grenadeEffect = result.flow.lastSouthGrenadeEffect;
    Check(!result.flow.facts.includes("southGrenadeThrown") || (grenadeEffect?.damage > 0
      && result.southGrenadeExplosions.some(entry => entry.effect?.targetId === grenadeEffect.targetId
        && entry.effect.damage > 0)),
    "南路手雷事实只由真实爆炸作用产生；步枪清场不冒称投掷成功",
    JSON.stringify({ effect: grenadeEffect, explosions: result.southGrenadeExplosions }));
    await page.waitForFunction(() => {
      const menu = document.querySelector("#menu.p012Complete");
      return menu && getComputedStyle(menu).backgroundColor === "rgb(0, 0, 0)"
        && menu.innerText.includes("重新测试");
    }, null, { timeout: 6000 });
    const ending = await page.evaluate(() => {
      const game = window.Tengxian;
      const before = { elapsed: game.Debug.P012().elapsed, health: game.player.health,
        spawned: game.Debug.P012().spawnedTotal, level: game.story.levelId };
      game.StepFrames(300, 1 / 30, false);
      return { before, after: { elapsed: game.Debug.P012().elapsed, health: game.player.health,
        spawned: game.Debug.P012().spawnedTotal, level: game.story.levelId },
        scene: game.Debug.P012Scene(), complete: game.Debug.P012().complete,
        endingText: document.body.innerText };
    });
    Check(ending.complete && ending.endingText.includes("测试关卡完成")
      && ending.endingText.includes("重新测试") && ending.endingText.includes("返回主菜单"),
    "独立测试完成后提供重玩和返回主菜单");
    Check(JSON.stringify(ending.before) === JSON.stringify(ending.after),
      "终局停止敌军、伤害和剧情推进，不误入第二章");
    // Regrip preparation deliberately lowers the original litter, so the live
    // "all still carried at parking slots" predicate is no longer true in B24.
    // Require the prior production arrival event plus the actual parking geometry below.
    Check(result.trace.some(entry => entry.beat === "B24" && entry.lastLitterArrivedEvent)
      && ending.scene.woundedDragDelivered,
      "真实伤员拖行与最后担架抵达均已发生");
    const firstLitter = result.trace.find(entry => entry.beat === "B19")?.originalLitter;
    const returnedLitter = result.trace.find(entry => entry.beat === "B24")?.originalLitter;
    Check(!!firstLitter && firstLitter === returnedLitter && ending.scene.litterRecovered,
      "扑救放下、扶起恢复、结尾重新握住的是同一副担架", firstLitter);
    const parked = result.trace.find(entry => entry.beat === "B24")?.litterParking || [];
    const spans = parked.map(litter => Math.hypot(litter.front.x - litter.rear.x, litter.front.z - litter.rear.z));
    const centers = parked.map(litter => ({ x: (litter.front.x + litter.rear.x) / 2,
      z: (litter.front.z + litter.rear.z) / 2 }));
    Check(parked.length === 2 && spans.every(span => span > 1.2 && span < 2.8)
      && Math.hypot(centers[0].x - centers[1].x, centers[0].z - centers[1].z) >= 3,
    "回撤停车仍保留两副担架及前后抬手间距", JSON.stringify(parked));
    Check(ending.scene.farSpawned === 4 && ending.scene.retreatPursuit.length === 2
      && ending.scene.retreatPursuit.every(entry => !entry.alive || entry.index > 1),
    "有限追兵已沿路线追击或被真实击毙，不复活补兵",
    JSON.stringify(ending.scene.retreatPursuit));
    Check(!!result.windowView?.collisionClear, "实际从破屋窗口看到前副担架移出院墙", JSON.stringify(result.windowView));
    Check(result.airViews.some(view => view.preset === "crowdTurn" && view.phase === "approach"
      && view.airVisible && view.bearersVisible >= 2 && view.civiliansVisible >= 1),
    "自由视角实际同屏看见飞机转向、担架员与平民道路");
    const turnPrompts = result.airViews.filter(view => view.beat === "B17" && view.preset === "crowdTurn");
    const beforeCrowdFire = turnPrompts.filter(view => !view.crowdFire);
    const afterCrowdFire = turnPrompts.filter(view => view.crowdFire);
    Check(beforeCrowdFire.length > 0 && beforeCrowdFire.every(view => /留意飞机来向/.test(view.objectiveText)
      && !/转向道路|向道路开火|扫射/.test(view.objectiveText)),
    "转向期间提示引导观察，不预告飞机将攻击道路", `${beforeCrowdFire.length} actual frames`);
    Check(result.crowdFireCues.some(cue => cue.beat === "B17" && /已向道路开火/.test(cue.text))
      && afterCrowdFire.every(view => /已向道路开火/.test(view.objectiveText)
        && !/正在转向/.test(view.objectiveText) && view.phase !== "approach"),
    "真实道路扫射事件立即更新提示；已入沟可直接推进B18", JSON.stringify(result.crowdFireCues));
    // A rifle shot during the aviation gun's existing 0.18s burst gap is still
    // overlapping pressure. Require real impacts within 0.25s in the same run;
    // merely seeing an egress aircraft, or a phase label without bullets, fails.
    const jointFire = result.airGroundShots.filter(shot => shot.preset === "divePress"
      && shot.phase === "strafe" && (shot.targetPlayer || shot.targetNearPlayer)
      && result.airImpacts.some(impact => impact.runId === shot.runId
        && impact.preset === "divePress" && Math.abs(impact.at - shot.at) <= 0.25));
    Check(jointFire.length > 0, "实际扫射弹着与地面枪响相隔不超过0.25秒，构成空地交叉压力", JSON.stringify(jointFire));
    await fs.writeFile(path.join(outputDir, "Data_P012EndingTrace.json"), JSON.stringify(ending, null, 2));
    await page.screenshot({ path: path.join(outputDir, "Scene_P012Ending.png") });
  }
  if (fullCampaign && process.argv.includes("--pacing")) {
    Check(result.flow.elapsed >= 23 * 60 && result.flow.elapsed <= 26 * 60,
      "整关实际时长落在 P0 目标", `${(result.flow.elapsed / 60).toFixed(2)}min`);
  }
  if (fullCampaign) {
    const totals = {};
    for (const span of result.activity) totals[span.kind] = (totals[span.kind] || 0) + span.to - span.from;
    console.log("P012 measured activity (observational, not a first-player pacing verdict)", JSON.stringify(totals));
    await fs.writeFile(path.join(outputDir, "Data_P012ActivityTrace.json"), JSON.stringify({
      definitions: { combat: "Actual shot within 3 seconds by player, or enemy firing at player/ally within 12m; not merely a living enemy.",
        moving: "Actual horizontal displacement while not actively engaged.",
        interaction: "Production interaction hold while stationary and not engaged.",
        weaponAction: "Production weapon busy cycle (bolt/reload) while stationary and not engaged.",
        observation: "Public objective look target while stationary; may include narration.",
        stationary: "Unclassified stationary time; needs manual review, not automatically forced waiting." },
      totals, spans: result.activity,
    }, null, 2));
  }
  await page.screenshot({ path: path.join(outputDir, "Scene_P012FrontlineAftermath.png") });
}

// Production director objectives + real player collision, isolated from the
// sequential campaign. Fixture setup may reset position; movement never does.
async function VerifySouthRouteRecoveryFixtures() {
  const results = await page.evaluate(async () => {
    const { FirstLevelP012Director } = await import("./Script_FirstLevelP012Flow.mjs");
    const { FIRST_LEVEL_P012_WHITEBOX_PHASE: phase } = await import("./Data_FirstLevelP012Whitebox.mjs");
    const game = window.Tengxian, results = [];
    for (const beat of [21, 22]) {
      const indices = beat === 21 ? [5, 6, 7] : [0, 1, 2, 3, 4];
      for (const routeIndex of indices) {
        const director = new FirstLevelP012Director({}, phase.whitebox);
        director.beat = beat; director.routeIndex = routeIndex;
        const destination = director.ActivityRoute()[routeIndex];
        const unchanged = JSON.stringify(director.Snapshot()), path = [];
        const start=phase.whitebox.anchors.strafeSlots[0];
        game.player.Spawn(start.x, start.z, 0);
        game.player.stance = "stand"; game.player.pitch = 0;
        let reached = false;
        for (let frame = 0; frame < 2400; frame++) {
          director.lastSample = { position: game.player.position };
          if (game.player.position.distanceTo(game.player.position.clone().set(destination.x, 0, destination.z)) < .6) {
            reached = true; break;
          }
          const objective = director.CurrentObjective(), target = objective.target;
          if (!target) break;
          game.player.yaw = Math.atan2(-(target.x - game.player.position.x), -(target.z - game.player.position.z));
          game.Debug.Key("KeyW", true);
          game.StepFrames(1, 1 / 30, false);
          if (frame % 30 === 0) path.push(game.player.position.toArray());
        }
        game.Debug.Key("KeyW", false);
        results.push({ beat, routeIndex, reached, position: game.player.position.toArray(),
          destination, path, preserved: unchanged === JSON.stringify(director.Snapshot()) });
      }
    }
    return results;
  });
  await fs.writeFile(path.join(outputDir, "Data_P012SouthRetryRoutes.json"), JSON.stringify(results, null, 2));
  for (const result of results) Check(result.reached && result.preserved,
    `B${result.beat} 路点${result.routeIndex}：从CP05按公开转角目标真实走回，任务进度不变`,
    JSON.stringify({ destination: result.destination, position: result.position }));
  await page.screenshot({ path: path.join(outputDir, "Scene_P012SouthRetryArrival.png") });
}

async function VerifyFrontlineRecoveryFixtures() {
  const results = await page.evaluate(async () => {
    const { FirstLevelP012Director } = await import("./Script_FirstLevelP012Flow.mjs");
    const { FIRST_LEVEL_P012_WHITEBOX_PHASE: phase } = await import("./Data_FirstLevelP012Whitebox.mjs");
    const { P012NorthPoint } = await import("./Data_FirstLevelP012Space.mjs");
    const game = window.Tengxian, results = [];
    for (const beat of [6, 7, 8, 9, 10]) {
      const director = new FirstLevelP012Director({}, phase.whitebox);
      director.beat = beat;
      const destination = phase.whitebox.anchors.gunports[beat === 8 ? 2 : beat === 10 ? 0 : 1];
      const unchanged = JSON.stringify(director.Snapshot()), path = [];
      const start=P012NorthPoint(3.32966,-43.11849);
      game.player.Spawn(start.x, start.z, 0);
      game.player.stance = "prone"; game.player.pitch = 0;
      let reached = false;
      for (let frame = 0; frame < 3000; frame++) {
        director.lastSample = { position: game.player.position, clips: 1 };
        const objective = director.CurrentObjective();
        if (Math.hypot(destination.x - game.player.position.x, destination.z - game.player.position.z) < .6) {
          reached = true; break;
        }
        const target = objective.target;
        if (!target) break;
        game.player.yaw = Math.atan2(-(target.x - game.player.position.x), -(target.z - game.player.position.z));
        game.Debug.Key("KeyW", true);
        game.StepFrames(1, 1 / 30, false);
        if (frame % 30 === 0) path.push(game.player.position.toArray());
      }
      game.Debug.Key("KeyW", false);
      results.push({ beat, reached, position: game.player.position.toArray(), destination, path,
        preserved: unchanged === JSON.stringify(director.Snapshot()) });
    }
    return results;
  });
  await fs.writeFile(path.join(outputDir, "Data_P012FrontlineRetryRoutes.json"), JSON.stringify(results, null, 2));
  for (const result of results) Check(result.reached && result.preserved,
    `B${result.beat}：从CP01沿交通壕真实卧姿回枪眼，任务进度不变`,
    JSON.stringify({ destination: result.destination, position: result.position }));
  await page.screenshot({ path: path.join(outputDir, "Scene_P012FrontlineRetryArrival.png") });
}

// Inspection fixture, not campaign movement or a natural gameplay camera claim.
async function VerifyCastClothing() {
  const cast = await page.evaluate(async () => {
    const { P012_CAST_CLOTH_COLORS: colors } = await import("./Script_FirstLevelP012CastAppearance.mjs");
    const game = window.Tengxian;
    return game.ai.soldiers.filter(soldier => soldier.castId).map(soldier => {
      const clothes = [], other = [];
      soldier.actor.characterRig.root.traverse(object => {
        if (!object.isMesh) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          const entry = { name: material.name, color: material.color?.getHex(), map: !!material.map };
          (material.name.startsWith("P012Cloth_") ? clothes : other).push(entry);
        }
      });
      return { castId: soldier.castId, expected: colors[soldier.castId],
        applied: soldier.actor.p012ClothColor, clothes, other };
    });
  });
  Check(cast.length === 5 && new Set(cast.map(entry => entry.applied)).size === 5
    && cast.every(entry => entry.applied === entry.expected && entry.clothes.length > 0
      && entry.clothes.every(material => material.color === entry.expected && !material.map)
      && entry.other.some(material => material.map)),
  "五名具名NPC使用各自纯色衣服，仍保留原皮肤/装备贴图");
  for (const entry of cast) {
    const placement = await page.evaluate(castId => {
      const game = window.Tengxian, soldier = game.ai.soldiers.find(actor => actor.castId === castId);
      const before = { position: soldier.position.toArray(), goal: soldier.goal.toArray(), yaw: soldier.yaw,
        speed: soldier.scriptMoveSpeedMps ?? null, manualGoalUntil: soldier.manualGoalUntil };
      // Explicit appearance inspection stage: avoid the random initial squad
      // formation occluding a costume. This is not used by campaign acceptance.
      soldier.position.set(-50, 0, 60); soldier.body?.Teleport(-50, 0, 60);
      soldier.goal.set(-50, 0, 60); soldier.manualGoalUntil = game.ai.time + 5;
      soldier.scriptMoveSpeedMps = 0; soldier.yaw = Math.PI;
      game.player.Spawn(-50, 63.5, 0);
      game.player.stance = "stand"; game.player.pitch = -.1;
      game.StepFrames(2);
      return before;
    }, entry.castId);
    await page.screenshot({ path: path.join(outputDir, `Scene_P012Cast_${entry.castId}.png`) });
    await page.evaluate(({ castId, before }) => {
      const soldier = window.Tengxian.ai.soldiers.find(actor => actor.castId === castId);
      soldier.position.fromArray(before.position); soldier.body?.Teleport(...before.position);
      soldier.actor.root.position.copy(soldier.position); soldier.goal.fromArray(before.goal);
      soldier.yaw = before.yaw; soldier.manualGoalUntil = before.manualGoalUntil;
      if (before.speed === null) delete soldier.scriptMoveSpeedMps;
      else soldier.scriptMoveSpeedMps = before.speed;
    }, { castId: entry.castId, before: placement });
  }
  await fs.writeFile(path.join(outputDir, "Data_P012CastClothing.json"), JSON.stringify(cast, null, 2));
}

// Physical scale audit: isolated straight corridor, no plot gating or combat.
// This measures a spatial traverse, not the length of a complete mission.
async function VerifyMapScale() {
  const report = await page.evaluate(async () => {
    const { FIRST_LEVEL_P012_LAYOUT: layout, P012_ROUTES: routes } = await import("./Data_FirstLevelP012Layout.mjs");
    const game = window.Tengxian, original = game.Debug.DebugOptions(), runs = [];
    const corridor={x:layout.bounds.minX+7,fromZ:layout.bounds.maxZ-10,toZ:layout.bounds.minZ+10};
    const length = points => points.slice(1).reduce((sum, point, index) => sum
      + Math.hypot(point.x - points[index].x, point.z - points[index].z), 0);
    try {
      game.Debug.SetDebugOption("noCollision", false);
      for (const fastMove of [false, true]) {
        game.Debug.SetDebugOption("fastMove", fastMove);
        game.player.Spawn(corridor.x, corridor.fromZ, 0); game.player.stance = "stand";
        game.player.stamina = 1; game.player.pitch = 0;
        game.Debug.Key("KeyW", true); game.Debug.Key("ShiftLeft", true);
        let tenSeconds = null, frame = 0;
        for (; frame < 5400; frame++) {
          game.StepFrames(1, 1 / 30, false);
          if (frame === 299) tenSeconds = { distanceM: corridor.fromZ - game.player.position.z, position: game.player.position.toArray() };
          if (game.player.position.z <= corridor.toZ) break;
        }
        game.Debug.Key("KeyW", false); game.Debug.Key("ShiftLeft", false);
        runs.push({ fastMove, tenSeconds, crossingSeconds: (frame + 1) / 30,
          reached: game.player.position.z <= corridor.toZ, position: game.player.position.toArray() });
      }
    } finally {
      for (const [id, value] of Object.entries(original)) game.Debug.SetDebugOption(id, value);
    }
    return { bounds: layout.bounds, corridor, corridorLengthM:corridor.fromZ-corridor.toZ, routesM: Object.fromEntries(Object.entries(routes).map(([key, points]) => [key, length(points)])), runs };
  });
  await fs.writeFile(path.join(outputDir, "Data_P012MapScale.json"), JSON.stringify(report, null, 2));
  Check(report.runs.every(run => run.reached && run.tenSeconds && run.crossingSeconds > 10),
    "沿新外框西侧实际走廊测试普通/三倍奔跑，保留真实碰撞与速度", JSON.stringify(report));
}

// Discovery fixture: follow the actual leader and look along his body heading.
// No objective target, route waypoint or interaction-anchor position steers this
// player. This proves the cues are physically usable, not that every human will
// understand them; first-person captures still require visual review.
async function VerifyOpeningDiscovery() {
  const pause = await page.evaluate(() => {
    const game = window.Tengxian;
    game.StepFrames(1200, 1 / 30, false);
    const guide = game.ai.soldiers.find(actor => actor.castId === "luo");
    const before = guide.position.clone();
    game.StepFrames(180, 1 / 30, false);
    // The idle batch did not stop on a capture; discard its stale candidate.
    window.p012PendingTrafficView = null;
    window.p012TrafficCapturedBeats = [];
    game.StepFrames(1);
    return { beat: game.Debug.P012().beat, position: guide.position.toArray(),
      moved: guide.position.distanceTo(before), player: game.player.position.toArray() };
  });
  Check(pause.beat === "B00" && pause.moved < .1, "开局停留观察时罗班长等候，不独自走完路线", JSON.stringify(pause));
  await page.screenshot({ path: path.join(outputDir, "Scene_P012GuideWaitsAtDoor.png") });
  let result;
  for (let chunk = 0; chunk < 45; chunk++) {
    result = await page.evaluate(() => {
      const game = window.Tengxian;
      const bot = window.p012DiscoveryBot ||= { used: [], captured: [], held: false, elapsed: 0 };
      let capture = null, trafficView = null;
      for (let frame = 0; frame < 120; frame++) {
        if (window.p012PendingTrafficView) {
          trafficView = window.p012PendingTrafficView; window.p012PendingTrafficView = null; break;
        }
        const guide = game.ai.soldiers.find(actor => actor.castId === "luo");
        const flow = game.Debug.P012();
        if (bot.used.includes("p012_ammoIssue") || flow.beatIndex >= 2) break;
        const completed = ["p012_weaponCheck", "p012_ammoIssue"].filter(id => game.interact.Point(id)?.count > 0);
        if (completed.length > bot.used.length) { bot.used = completed; game.Debug.Key("KeyF", false); bot.held = false; }
        const waitingAtTable = flow.beatIndex === 1 && guide.scriptMoveSpeedMps === 0;
        const sight = waitingAtTable ? { x: guide.position.x - Math.sin(guide.yaw) * 2.4,
          z: guide.position.z - Math.cos(guide.yaw) * 2.4 } : guide.position;
        game.player.yaw = Math.atan2(-(sight.x - game.player.position.x), -(sight.z - game.player.position.z));
        game.player.pitch = waitingAtTable ? -.15 : 0;
        const query = game.interact.Query(game.player)?.point;
        const usable = waitingAtTable && query && ["p012_weaponCheck", "p012_ammoIssue"].includes(query.id)
          && !bot.used.includes(query.id);
        game.Debug.Key("KeyW", !bot.held && (waitingAtTable
          ? !usable && Math.hypot(sight.x - game.player.position.x, sight.z - game.player.position.z) > 1.1
          : guide.position.distanceTo(game.player.position) > 2.6));
        if (usable && !bot.captured.includes(query.id)) {
          game.Debug.Key("KeyW", false);
          bot.captured.push(query.id);
          game.StepFrames(1);
          capture = { id: query.id, player: game.player.position.toArray(), guide: guide.position.toArray(),
            yaw: game.player.yaw, guideYaw: guide.yaw, label: query.label, at: flow.elapsed };
          break;
        }
        if (usable) { game.Debug.Key("KeyF", true); bot.held = true; }
        game.StepFrames(1, 1 / 30, false); bot.elapsed += 1 / 30;
      }
      game.Debug.Key("KeyW", false);
      if (trafficView) game.StepFrames(1);
      return { used: bot.used, captured: bot.captured, elapsed: bot.elapsed, capture, trafficView,
        flow: game.Debug.P012(), scene: game.Debug.P012Scene(), player: game.player.position.toArray() };
    });
    if (result.capture) {
      await fs.writeFile(path.join(outputDir, `Data_P012Discovery_${result.capture.id}.json`), JSON.stringify(result, null, 2));
      await page.screenshot({ path: path.join(outputDir, `Scene_P012Discovery_${result.capture.id}.png`) });
    }
    if (result.trafficView) {
      await fs.writeFile(path.join(outputDir, `Data_P012Traffic_${result.trafficView.captureId}.json`), JSON.stringify(result.trafficView, null, 2));
      await page.screenshot({ path: path.join(outputDir, `Scene_P012Traffic_${result.trafficView.captureId}.png`) });
    }
    if (result.used.includes("p012_ammoIssue")) break;
  }
  await fs.writeFile(path.join(outputDir, "Data_P012OpeningDiscovery.json"), JSON.stringify(result, null, 2));
  Check(result.used.includes("p012_weaponCheck") && result.used.includes("p012_ammoIssue"),
    "仅跟随罗班长、看向其停步朝向即可实际完成桌边交互（未读取目标坐标）", JSON.stringify(result.used));
  await page.evaluate(() => { window.Tengxian.Debug.Key("KeyF", false); window.Tengxian.Debug.Key("KeyW", false); });
}

// 独立物理夹具可重置出生位置；不计入顺序通关或节奏证据。
async function VerifyTraversalFixtures() {
  for (const [kind, point] of Object.entries(P012_ANCHORS.traversal)) {
    const result = await page.evaluate(({ kind, point }) => {
      const game = window.Tengxian;
      game.player.Spawn(point.x, point.z + (kind === "step" ? 1.3 : 0.9), 0);
      game.StepFrames(20, 1 / 60, false);
      const before = game.Debug.Vault();
      const jumpBefore = game.Debug.Jump().count;
      let peak = game.player.position.y;
      game.Debug.Key("KeyW", true);
      if (kind !== "step") game.Debug.Key("Space");
      for (let frame = 0; frame < 160; frame += 1) {
        game.StepFrames(1, 1 / 60, false);
        peak = Math.max(peak, game.player.position.y);
      }
      game.Debug.Key("KeyW", false);
      game.StepFrames(1);
      return { before, after: game.Debug.Vault(), peak, jumpCount: game.Debug.Jump().count - jumpBefore,
        position: game.player.position.toArray() };
    }, { kind, point });
    Check(result.position[2] < point.z - 0.8, `${kind} 色块可由对应真实动作越过`, JSON.stringify(result));
    if (kind === "step") Check(result.jumpCount === 0, "黄色跨步无需按跳跃");
    else Check(result.after.count > result.before.count && result.after.kind === kind,
      `${kind} 色标与引擎动作分类一致`, JSON.stringify(result));
    await page.screenshot({ path: path.join(outputDir, `Scene_P012Traversal${kind[0].toUpperCase()}${kind.slice(1)}.png`) });
  }
}

// Dedicated P2 plan-view evidence, after gameplay checks; the menu owns this camera.
async function CaptureLayoutOverview() {
  const view = await page.evaluate(async () => {
    const {FIRST_LEVEL_P012_LAYOUT:layout}=await import("./Data_FirstLevelP012Layout.mjs");
    const game = window.Tengxian;
    game.Debug.Pause();
    const menu = game.menu;
    menu.live = true; menu.open = true; game.state.menu = true;
    menu.shotSliceId = menu.host.SlicePhase().id;
    const b=layout.bounds,x=(b.minX+b.maxX)/2,z=(b.minZ+b.maxZ)/2,height=Math.max(b.maxX-b.minX,b.maxZ-b.minZ)*1.4;
    menu.shots = [{ id: "P012Overview", from: [x, height, z], to: [x, height, z],
      look: [x, 0, z], lookTo: [x, 0, z], focalMm: 24 }];
    menu.shotIndex = 0; menu.shotTime = 0;
    game.camera.up.set(0, 0, -1); game.camera.far = height+600; game.camera.updateProjectionMatrix();
    document.getElementById("menu").style.display = "none";
    game.viewmodel.root.visible = false;
    menu.ApplyShot(0); game.StepFrames(12);
    return { position: game.camera.position.toArray(), colliders: game.battlefield.colliders.length };
  });
  Check(view.position[1] > 250 && view.colliders > 15, "P2 俯视图使用实际已构建关卡", JSON.stringify(view));
  await page.screenshot({ path: path.join(outputDir, "Scene_P012LayoutOverview.png") });
}

// Normal audio-enabled entry. This verifies decoded assets, actual WebAudio
// output and bark suppression, not a subjective listening/mix approval.
async function VerifyAudioPlayback() {
  await page.waitForFunction(() => {
    const audio = window.Tengxian.audio;
    return audio.Ready && !audio.voiceLoading && !audio.sfxLoading;
  }, null, { timeout: 120000 });
  const samples = await page.evaluate(() => {
    const game = window.Tengxian, audio = game.audio;
    const keys = [...new Set([...game.story.queue, ...(game.story.p012Immediate || [])]
      .map(cue => cue.voice).filter(Boolean))];
    const missing = keys.filter(key => !audio.voiceBank.has(key));
    const barkBefore = audio.barkCounter;
    const attempts = ["nra", "ija"].flatMap(side => ["hurt", "spot", "ammo", "rally"]
      .map(kind => ({ side, kind, blocked: audio.Bark(kind, { side }) === null })));
    audio.StopAmbience(); audio.StopMusic(); audio.StopStoryVoice();
    const analyser = audio.ctx.createAnalyser(); analyser.fftSize = 2048;
    audio.sfxUser.connect(analyser);
    const key = "ch0_junguan_04";
    const played = audio.PlayStoryVoice(key);
    const sources = played?.voice?.nodes.filter(node => node.buffer) || [];
    window.p012AudioProbe = { analyser, data: new Float32Array(analyser.fftSize),
      peakRms: 0, ended: false, startedAt: audio.ctx.currentTime, endedAt: null };
    sources[0]?.addEventListener("ended", () => {
      window.p012AudioProbe.ended = true;
      window.p012AudioProbe.endedAt = audio.ctx.currentTime;
    });
    return { enabled: audio.enabled, ready: audio.Ready, keys: keys.length, missing,
      errors: [...audio.voiceErrors, ...audio.sfxErrors], attempts,
      barkCountUnchanged: barkBefore === audio.barkCounter,
      key, duration: played?.duration, sourceCount: sources.length,
      sampledCues: ["trainBrake", "carriageDoorSlide", "stretcherWood", "stepBallast"]
        .filter(cue => audio.sampleCues.has(cue)) };
  });
  Check(samples.enabled && samples.ready, "正常入口解锁真实 AudioContext");
  Check(samples.keys > 40 && !samples.missing.length && !samples.errors.length,
    "P012 剧情音频真实加载且解码", JSON.stringify({ keys: samples.keys, missing: samples.missing, errors: samples.errors }));
  Check(samples.attempts.every(attempt => attempt.blocked) && samples.barkCountUnchanged,
    "双方自主喊话被播放入口阻止，未占用喊话节流槽");
  Check(samples.sampledCues.length === 4, "列车与担架等关键已有采样可用");
  Check(samples.sourceCount > 0 && samples.duration > 0, "剧情对白建立真实采样源", JSON.stringify(samples));
  await page.waitForFunction(() => {
    const probe = window.p012AudioProbe;
    probe.analyser.getFloatTimeDomainData(probe.data);
    const rms = Math.sqrt(probe.data.reduce((sum, value) => sum + value * value, 0) / probe.data.length);
    probe.peakRms = Math.max(probe.peakRms, rms);
    return probe.ended;
  }, null, { timeout: 30000 });
  const output = await page.evaluate(() => {
    const probe = window.p012AudioProbe;
    window.Tengxian.audio.sfxUser.disconnect(probe.analyser);
    return { peakRms: probe.peakRms, duration: probe.endedAt - probe.startedAt };
  });
  Check(output.peakRms > 0.00001, "剧情对白在混音输出端产生非零信号", JSON.stringify(output));
  Check(output.duration >= samples.duration - 0.1, "实际对白自然播完，没有被自主喊话截断");
  await fs.writeFile(path.join(outputDir, "Data_P012AudioPlayback.json"), JSON.stringify({ samples, output,
    scope: "real playback/suppression smoke only; not subjective listening approval" }, null, 2));
}

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&${audioSmoke ? "audio=1" : "shot=1"}&manual=1&quality=low&scale=small`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 180000 });
  if (audioSmoke) await page.click("#bootStart");
  await page.evaluate(() => {
    const game = window.Tengxian, originalHit = game.player.TakeHit;
    window.p012DamageTrace = [];
    window.p012ActivityTrace = [];
    window.p012AirViews = [];
    window.p012TrafficViews = [];
    window.p012TrafficCapturedBeats = [];
    window.p012PopulationMax = { armed: 0, unarmed: 0 };
    window.p012CrowdFireCues = [];
    window.p012AirGroundShots = [];
    window.p012AirImpacts = [];
    window.p012EscortApproval = [];
    window.p012PrematureEscortMovement = [];
    window.p012SouthGrenadeExplosions = [];
    const originalDetonate = game.combat.Detonate;
    game.combat.Detonate = function (projectile) {
      const before = game.Debug.P012();
      const result = originalDetonate.call(this, projectile);
      if (before.beatIndex === 21 && projectile.owner === "player") {
        const after = game.Debug.P012();
        window.p012SouthGrenadeExplosions.push({ at: after.elapsed,
          position: projectile.position.toArray(), kind: projectile.kind,
          effect: JSON.stringify(before.lastSouthGrenadeEffect) !== JSON.stringify(after.lastSouthGrenadeEffect)
            ? after.lastSouthGrenadeEffect || null : null });
      }
      return result;
    };
    const originalSignal = game.story.Signal;
    game.story.Signal = function (name, ...args) {
      const result = originalSignal.call(this, name, ...args);
      if (name === "P012CrowdFire") {
        const flow = game.Debug.P012();
        window.p012CrowdFireCues.push({ at: flow.elapsed, beat: flow.beat, text: flow.objective.text });
      }
      if (["P012EscortRequested", "P012EscortApproved", "EscortCall"].includes(name)) {
        window.p012EscortApproval.push({ at: game.Debug.P012().elapsed, event: name,
          column: game.Debug.P012Scene().columnPosition });
      }
      return result;
    };
    const originalStoryPlay = game.story.Play;
    game.story.Play = function (beat, ...args) {
      const result = originalStoryPlay.call(this, beat, ...args);
      if (beat.voice === "ch1_luo_08") {
        const voice = this.voiceLog.at(-1);
        window.p012EscortApproval.push({ at: game.Debug.P012().elapsed, event: "LuoApprovalStarted",
          played: voice?.key === beat.voice && voice.played, duration: voice?.key === beat.voice ? voice.dur || 0 : 0 });
      }
      return result;
    };
    const originalAirImpact = game.strafe.EmitImpact;
    game.strafe.EmitImpact = function (...args) {
      const before = this.stats.impacts;
      const result = originalAirImpact.apply(this, args);
      if (this.stats.impacts > before) {
        const air = this.View();
        window.p012AirImpacts.push({ at: game.Debug.P012().elapsed, runId: air?.id,
          preset: air?.presetId, flightTime: air?.t, point: air?.impact });
      }
      return result;
    };
    const originalAiFire = game.ai.TryFire;
    game.ai.TryFire = function (soldier, ...args) {
      const before = soldier.fireSequence;
      const result = originalAiFire.call(this, soldier, ...args);
      const flow = game.Debug.P012(), air = game.Debug.Strafe.State().run;
      if (soldier.side === "ija" && soldier.fireSequence !== before && flow.beatIndex >= 16 && flow.beatIndex <= 20) {
        window.p012AirGroundShots.push({ at: flow.elapsed, beat: flow.beat, actor: soldier.id,
          runId: air?.id ?? null,
          targetPlayer: !!soldier.target?.isPlayer, preset: air?.presetId || null,
          targetNearPlayer: soldier.target?.position?.distanceTo?.(game.player.position) < 12,
          phase: air?.phase || null, firing: air?.firing || false, flightTime: air?.t ?? null });
      }
      return result;
    };
    const originalStep = game.StepFrames;
    let lastShotAt = -Infinity;
    let previousShots = game.state.playerShots;
    let lastAirViewAt = -Infinity;
    let lastTrafficViewAt = -Infinity;
    const previousTraffic = new Map();
    game.StepFrames = function (count = 1, dt = 1 / 60, render = true) {
      for (let frame = 0; frame < count; frame += 1) {
        const before = game.Debug.P012(), position = game.player.position.clone();
        const waitingApproval = before.beatIndex === 12 && !game.story.Signalled("P012EscortApproved");
        const waitingColumn = waitingApproval ? game.Debug.P012Scene().columnPosition : null;
        originalStep(1, dt, render);
        const after = game.Debug.P012(), spans = window.p012ActivityTrace;
        if (waitingColumn && !game.story.Signalled("P012EscortApproved")) {
          const column = game.Debug.P012Scene().columnPosition;
          if (Math.hypot(column.x - waitingColumn.x, column.z - waitingColumn.z) > 0.01)
            window.p012PrematureEscortMovement.push({ at: after.elapsed, before: waitingColumn, after: column });
        }
        if (after.elapsed < before.elapsed) {
          while (spans.length && spans.at(-1).from >= after.elapsed) spans.pop();
          if (spans.length) spans.at(-1).to = Math.min(spans.at(-1).to, after.elapsed);
          lastShotAt = -Infinity;
          previousShots = game.state.playerShots;
          continue;
        }
        if (after.elapsed <= before.elapsed) continue;
        const friendly = game.ai.soldiers.filter(actor => actor.alive && actor.side === "nra");
        window.p012PopulationMax.armed = Math.max(window.p012PopulationMax.armed, friendly.filter(actor => !actor.unarmed).length);
        window.p012PopulationMax.unarmed = Math.max(window.p012PopulationMax.unarmed, friendly.filter(actor => actor.unarmed).length);
        if (after.beatIndex <= 2 && after.elapsed - lastTrafficViewAt >= .5) {
          lastTrafficViewAt = after.elapsed;
          const actors = friendly.filter(actor => actor.p012TrafficSide !== undefined).map(actor => {
            const at = actor.position.clone(); at.y += 1.2;
            const screen = at.clone().project(game.camera), delta = at.sub(game.player.EyePosition), distance = delta.length();
            const hit = game.battlefield.Raycast(game.player.EyePosition, delta.normalize(), distance);
            const previous = previousTraffic.get(actor.id);
            previousTraffic.set(actor.id, { at: after.elapsed, x: actor.position.x, z: actor.position.z });
            return { id: actor.id, side: actor.p012TrafficSide, role: actor.escortRole,
              position: actor.position.toArray(), distance,
              speedX: previous ? (actor.position.x - previous.x) / (after.elapsed - previous.at) : 0,
              speedZ: previous ? (actor.position.z - previous.z) / (after.elapsed - previous.at) : 0,
              visible: screen.z >= -1 && screen.z <= 1 && Math.abs(screen.x) < .95 && Math.abs(screen.y) < .95
                && (!hit || hit.t >= distance - .3) };
          });
          const view = { at: after.elapsed, beat: after.beat, player: game.player.position.toArray(),
            yaw: game.player.yaw, pitch: game.player.pitch, actors, population: { ...window.p012PopulationMax } };
          window.p012TrafficViews.push(view);
          const movingVisible = actors.filter(actor => actor.visible && actor.distance < 24
            && Math.hypot(actor.speedX, actor.speedZ) > .2);
          const opposed = movingVisible.some(north => north.side === 0 && movingVisible.some(south => south.side === 1
            && north.speedX * south.speedX + north.speedZ * south.speedZ < -.25));
          const dense = movingVisible.filter(actor => actor.role === "civilian").length >= 2
            && movingVisible.filter(actor => actor.side === 0).length >= 2;
          view.captureId = after.beat + (dense ? "Crowd" : "");
          if (!window.p012TrafficCapturedBeats.includes(view.captureId) && opposed) {
            window.p012TrafficCapturedBeats.push(view.captureId);
            window.p012PendingTrafficView = view;
          }
        }
        if (after.beatIndex >= 15 && after.beatIndex <= 20 && after.elapsed - lastAirViewAt >= 0.25) {
          lastAirViewAt = after.elapsed;
          const air = game.Debug.Strafe.State().run;
          if (air?.active) {
            const Visible = (point) => {
              const at = game.player.position.clone().set(point.x, point.y, point.z);
              const projected = at.clone().project(game.camera);
              if (projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 0.95 || Math.abs(projected.y) > 0.95) return false;
              const delta = at.sub(game.player.EyePosition), distance = delta.length();
              const hit = game.battlefield.Raycast(game.player.EyePosition, delta.normalize(), distance);
              return !hit || hit.t >= distance - 0.5;
            };
            const members = game.Debug.P012Scene().columnActors;
            const visible = members.filter(member => Visible({ x: member.x, y: 1.2, z: member.z }));
            const view = { at: after.elapsed, beat: after.beat, preset: air.presetId, phase: air.phase,
              objectiveText: after.objective.text, crowdFire: game.story.Signalled("P012CrowdFire"),
              flightTime: air.t, airVisible: Visible(air.aircraft), airPosition: air.aircraft,
              player: game.player.position.toArray(), yaw: game.player.yaw, pitch: game.player.pitch,
              bearersVisible: visible.filter(member => member.role === "bearer").length,
              civiliansVisible: visible.filter(member => member.role === "civilian").length };
            window.p012AirViews.push(view);
            if (!window.p012JointAirView && view.preset === "crowdTurn" && view.phase === "approach"
              && view.airVisible && view.bearersVisible >= 2 && view.civiliansVisible >= 1) window.p012JointAirView = view;
          }
        }
        if (game.state.playerShots > previousShots) lastShotAt = after.elapsed;
        previousShots = game.state.playerShots;
        const enemyFire = game.ai.soldiers.some(soldier => soldier.alive && soldier.side === "ija"
          && game.ai.time - soldier.lastFire < 3 && soldier.target
          && (soldier.target.isPlayer || soldier.target.position?.distanceTo?.(game.player.position) < 12));
        const moving = Math.hypot(game.player.position.x - position.x, game.player.position.z - position.z) > 0.002;
        const kind = enemyFire || after.elapsed - lastShotAt < 3 ? "combat" : moving ? "moving"
          : game.Debug.Interact().hold ? "interaction" : game.viewmodel.IsBusy?.() ? "weaponAction"
            : before.objective.lookAt ? "observation" : "stationary";
        const last = spans.at(-1);
        if (last && last.kind === kind && last.beat === before.beat && Math.abs(last.to - before.elapsed) < 0.001) last.to = after.elapsed;
        else spans.push({ from: before.elapsed, to: after.elapsed, beat: before.beat, kind });
      }
    };
    game.player.TakeHit = function (...args) {
      const before = this.health, position = this.position.toArray(), stance = this.stance;
      const result = originalHit.apply(this, args);
      if (this.health < before) window.p012DamageTrace.push({ at: game.Debug.P012().elapsed,
        beat: game.Debug.P012().beat, position, stance, damage: before - this.health,
        part: args[1], from: args[3]?.from?.toArray?.() || null,
        bullet: !!args[3]?.bullet, blast: !!args[3]?.blast });
      return result;
    };
  });
  if (process.argv.includes("--voice-timing")) {
    const durations = Object.fromEntries([...prologueVoices, ...chapterVoices].map(line => [line.key, line.dur]));
    const count = await page.evaluate(durations => {
      const story = window.Tengxian.story;
      // Silent deterministic narration timing, not an audio-output verification.
      // Use checked-in recording durations; leave production sequencing and hooks intact.
      story.voicePlay = ({ key }) => Number.isFinite(durations[key]) ? { duration: durations[key] } : null;
      return Object.keys(durations).length;
    }, durations);
    Check(count > 60, "静音实跑使用已有对白的标注时长（不代表声音播放验收）", String(count));
  }
  const initial = await page.evaluate(() => {
    const game = window.Tengxian;
    game.StepFrames(2);
    return {
      state: game.Debug.Whitebox(),
      position: game.player.position.toArray(),
      autonomousBarkAllowed: game.audio.allowAutonomousBark?.(),
      storyVoices: game.story.queue.filter((beat) => beat.voice).length,
      cameraHeld: game.state.cutscene,
      colliders: game.battlefield.colliders.length,
      externalProps: game.battlefield.externalProps?.count || 0,
      trimProps: game.battlefield.trimProps?.count || 0,
    };
  });
  Check(initial.state.phase === "FirstLevelP012Whitebox", "独立 P012 query 正确进入新关卡");
  Check(initial.state.companions >= 3, "具名小队复用现有角色配置", String(initial.state.companions));
  Check(initial.state.enemyCount === 0, "兵站开局没有日军");
  Check(initial.autonomousBarkAllowed === false, "前期自主喊话被抑制");
  Check(initial.storyVoices > 0, "关键剧情对白仍保留", String(initial.storyVoices));
  Check(!initial.cameraHeld, "正常开局不锁定玩家镜头");
  const semantics = initial.state.field.coloredSemantics;
  Check(["ground", "step", "vault", "mantle", "cover", "boundary", "danger", "missionRoute", "stretcherRoute"]
    .every((semantic) => semantics.includes(semantic)), "全部通行语义使用独立颜色");
  Check(initial.state.field.externalAssets === 0 && initial.externalProps === 0 && initial.trimProps === 0 && initial.colliders > 15,
    "程序体块环境具有实际碰撞且不加载正式环境资产");
  await page.screenshot({ path: path.join(outputDir, "Scene_P012Arrival.png") });
  if (openingGuidanceReview) await VerifyOpeningDiscovery();
  if (orientationReview || process.argv.includes("--prelude") || process.argv.includes("--pacing") || process.argv.includes("--frontline") || process.argv.includes("--campaign")) await PlayPrelude();
  if (process.argv.includes("--frontline") || process.argv.includes("--campaign") || process.argv.includes("--pacing")) await PlayFrontline();
  if (process.argv.includes("--geometry")) await VerifyTraversalFixtures();
  if (process.argv.includes("--south-recovery")) await VerifySouthRouteRecoveryFixtures();
  if (process.argv.includes("--front-recovery")) await VerifyFrontlineRecoveryFixtures();
  if (process.argv.includes("--cast-colors")) await VerifyCastClothing();
  if (process.argv.includes("--scale-review")) await VerifyMapScale();
  if (process.argv.includes("--overview")) await CaptureLayoutOverview();
  if (audioSmoke) await VerifyAudioPlayback();
  const traffic = await page.evaluate(() => ({ views: window.p012TrafficViews, population: window.p012PopulationMax }));
  await fs.writeFile(path.join(outputDir, "Data_P012TrafficViews.json"), JSON.stringify(traffic, null, 2));
  Check(traffic.population.armed <= 12 && traffic.population.unarmed <= 15,
    "实际全程友军战斗角色不超12、无枪群众伤员不超15", JSON.stringify(traffic.population));
  Check(errors.length === 0, "浏览器没有脚本或控制台错误", errors.join(" | "));
  console.log(`P012 screenshots: ${outputDir}`);
  console.log(process.argv.includes("--campaign") ? "FirstLevelP012BrowserTest campaign PASS" : "FirstLevelP012BrowserTest partial PASS (not a full campaign playthrough)");
} catch (error) {
  await page.evaluate(() => window.Tengxian?.StepFrames(1)).catch(() => {});
  await page.screenshot({ path: path.join(outputDir, "Scene_P012Failure.png") }).catch(() => {});
  const failureState = await page.evaluate(() => {
    const game = window.Tengxian;
    return { flow: game?.Debug.P012(), scene: game?.Debug.P012Scene(),
      player: game?.player.position.toArray(), health: game?.player.health,
      trace: window.p012CombatReview?.trace, diveTrace: window.p012CombatReview?.diveTrace,
      rewindCount: window.p012CombatReview?.rewindCount,
      damageTrace: window.p012DamageTrace || [],
      interact: game?.Debug.Interact(), strafe: game?.Debug.Strafe.State(),
      story: { fired: game?.story.fired, signals: [...(game?.story.signals || [])],
        immediate: game?.story.p012Immediate, cueLog: game?.story.p012CueLog } };
  }).catch(() => null);
  await fs.writeFile(path.join(outputDir, "Data_P012FailureTrace.json"),
    JSON.stringify({ error: String(error), state: failureState }, null, 2));
  console.error("P012 failure state", failureState);
  throw error;
} finally {
  await browser.close();
  server.close();
}
