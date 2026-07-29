/**
 * Script_EnemyAi.mjs — 感知 / 状态机 / 小队协同 / 搜索 / 军犬 / 探照灯
 * Owner: AgentEnemy
 *
 * ⚠ 本文件目前是 **AgentBoot 铺设的签名占位**：所有 API 存在且返回契约要求的形状，
 *   但只做最小行为（站岗 + 朝向）。AgentEnemy 接管后整体替换，调用方无需改动。
 *
 * 纪律（AgentEnemy 必须遵守）：导航/视线/遮挡走 ctx.world，警戒公式走 ctx.rules.ComputeDetection，
 * 玩家可感知度走 ctx.player.GetStealthProfile()。禁止自己 raycast / 寻路 / 造探测公式。
 */

import * as THREE from 'three';
import { Config } from './Script_Config.mjs';
import * as MathUtil from './Script_Math.mjs';
import { EventNames } from './Script_Event.mjs';

export function CreateEnemyDirector(ctx, options) {
  const settings = options || {};
  const THREEns = ctx.THREE || THREE;
  const group = new THREEns.Group();
  group.name = 'GroupEnemies';
  if (ctx.scene) ctx.scene.add(group);

  const enemies = [];
  const squads = new Map();
  let profile = settings.profile || 'PuppetPatrol';
  let difficulty = 1;
  let spawningEnabled = true;
  let nextId = 0;
  let globalAlert = 0;
  let lastKnownPlayerPosition = null;

  function EnsureSquad(squadId) {
    if (!squads.has(squadId)) {
      squads.set(squadId, { id: squadId, members: [], alert: 0, lastKnownTarget: null, state: 'Idle' });
    }
    return squads.get(squadId);
  }

  function MakeEnemy(def) {
    const archetype = def.archetype || 'PuppetSoldier';
    const stats = Config.Enemy.Archetypes[archetype] || Config.Enemy.Archetypes.PuppetSoldier;
    const character = ctx.characters ? ctx.characters.Spawn(archetype, { id: def.id }) : null;
    const position = def.position ? def.position.clone() : new THREEns.Vector3();
    const enemy = {
      id: def.id || ('Enemy#' + (nextId += 1)),
      squadId: def.squadId || 'SquadA',
      archetype: archetype,
      character: character,
      position: position,
      yaw: def.yaw || 0,
      health: stats.health,
      alive: true,
      downed: false,
      alert: 0,
      alertLevel: 0,
      state: 'Post',
      hasSeenPlayer: false,
      lastKnownPlayerPosition: null,
      weapon: def.weapon || stats.weapon,
      light: null,
      route: def.route || null,
      routeIndex: 0,
      post: def.post || { position: position.clone(), yaw: def.yaw || 0, lookArcDeg: 90 },

      SetPatrolRoute(points, loop) { enemy.route = points; enemy.routeIndex = 0; enemy.loopRoute = loop !== false; },
      SetPost(postPosition, postYaw, lookArcDeg) {
        enemy.post = { position: postPosition.clone(), yaw: postYaw, lookArcDeg: lookArcDeg };
      },
      Investigate(target) { enemy.lastKnownPlayerPosition = target.clone(); enemy.state = 'Investigate'; },
      ForceState(nextState) { enemy.state = nextState; },
      Distract(target, seconds) { enemy.lastKnownPlayerPosition = target.clone(); enemy.distractSeconds = seconds; },

      GetViewCone() {
        return {
          origin: enemy.position.clone().setY(enemy.position.y + 1.5),
          forward: new THREEns.Vector3(-Math.sin(enemy.yaw), 0, -Math.cos(enemy.yaw)),
          halfAngle: Config.Enemy.viewHalfAngleDeg * MathUtil.DegToRad,
          range: Config.Enemy.viewRangeDay,
        };
      },
      CanSee(targetPosition) {
        if (!ctx.world) return false;
        const cone = enemy.GetViewCone();
        if (!MathUtil.PointInCone(cone.origin.x, cone.origin.z, cone.forward.x, cone.forward.z,
          targetPosition.x, targetPosition.z, cone.halfAngle, cone.range)) return false;
        return ctx.world.HasLineOfSight(cone.origin, targetPosition);
      },
      GetVisibilityOf(stealthProfile) {
        if (!stealthProfile || !enemy.CanSee(stealthProfile.position)) return 0;
        return 1 - stealthProfile.concealment;
      },

      ApplyDamage(amount) {
        if (!enemy.alive) return { applied: 0, killed: false, staggered: false };
        enemy.health -= amount;
        const killed = enemy.health <= 0;
        if (killed) {
          enemy.alive = false;
          enemy.state = 'Dead';
          if (enemy.character) enemy.character.SetVisible(false);
          ctx.bus.Emit(EventNames.EnemyDown, {
            enemyId: enemy.id, squadId: enemy.squadId, byPlayer: true, silent: false, position: enemy.position,
          });
        }
        return { applied: amount, killed: killed, staggered: amount >= Config.Enemy.staggerThreshold };
      },
      TryStealthKill() { return false; },
      Suppress() { /* 占位 */ },
    };

    if (character) character.Warp(position, enemy.yaw);
    EnsureSquad(enemy.squadId).members.push(enemy.id);
    enemies.push(enemy);
    return enemy;
  }

  const director = {
    group: group,
    enemies: enemies,

    Spawn(def) { return spawningEnabled ? MakeEnemy(def || {}) : null; },
    Despawn(enemyId) {
      for (let i = enemies.length - 1; i >= 0; i -= 1) {
        if (enemies[i].id !== enemyId) continue;
        if (enemies[i].character && ctx.characters) ctx.characters.Despawn(enemies[i].character);
        enemies.splice(i, 1);
      }
    },
    SpawnFromWorld() {
      const posts = ctx.world && ctx.world.spawns ? ctx.world.spawns.enemyPosts : [];
      const spawned = [];
      for (let i = 0; i < posts.length; i += 1) {
        const post = posts[i];
        const enemy = director.Spawn({
          id: post.id, archetype: post.archetype, squadId: post.squadId,
          position: post.position, yaw: post.yaw, route: post.route,
        });
        if (enemy) spawned.push(enemy);
      }
      return spawned;
    },
    GetEnemy(enemyId) {
      for (let i = 0; i < enemies.length; i += 1) if (enemies[i].id === enemyId) return enemies[i];
      return null;
    },
    GetNearest(position, maxDistance, filter) {
      let best = null;
      let bestDistance = maxDistance === undefined ? Infinity : maxDistance;
      for (let i = 0; i < enemies.length; i += 1) {
        const enemy = enemies[i];
        if (filter && !filter(enemy)) continue;
        const distance = enemy.position.distanceTo(position);
        if (distance < bestDistance) { bestDistance = distance; best = enemy; }
      }
      return best;
    },
    QueryInRadius(position, radius) {
      const list = [];
      for (let i = 0; i < enemies.length; i += 1) {
        if (enemies[i].position.distanceTo(position) <= radius) list.push(enemies[i]);
      }
      return list;
    },
    AliveCount() {
      let count = 0;
      for (let i = 0; i < enemies.length; i += 1) if (enemies[i].alive) count += 1;
      return count;
    },

    GetSquad(squadId) { return squads.get(squadId) || null; },
    AlertSquad(squadId, position, level, source) {
      const squad = EnsureSquad(squadId);
      squad.alert = Math.max(squad.alert, level / 2);
      squad.lastKnownTarget = position ? position.clone() : null;
      ctx.bus.Emit(EventNames.SquadAlerted, { squadId: squadId, level: level, position: position, source: source });
    },
    AlertAll(position, level, source) {
      for (const squadId of squads.keys()) director.AlertSquad(squadId, position, level, source);
    },
    ReportNoise() { /* 占位：AgentEnemy 接管后走 ctx.rules.ComputeNoiseAudibility */ },
    ReportBody() { /* 占位 */ },
    ReportFootprints() { /* 占位 */ },

    GetGlobalAlert() { return globalAlert; },
    GetAlertLevel() {
      if (globalAlert >= Config.Stealth.alertRed) return 2;
      if (globalAlert >= Config.Stealth.alertYellow) return 1;
      return 0;
    },
    GetAlertLevelName() {
      const level = director.GetAlertLevel();
      return level === 2 ? 'Combat' : (level === 1 ? 'Suspicious' : 'Calm');
    },
    IsPlayerDetected() { return director.GetAlertLevel() >= 2; },
    GetThreatDirection(fromPosition) {
      const nearest = director.GetNearest(fromPosition, Config.Enemy.squadCallRadius, (e) => e.alive && e.alert > 0.2);
      if (!nearest) return null;
      return Math.atan2(nearest.position.x - fromPosition.x, nearest.position.z - fromPosition.z);
    },
    GetLastKnownPlayerPosition() { return lastKnownPlayerPosition; },

    SetChapterProfile(profileId) { profile = profileId; },
    SetDifficulty(scale) { difficulty = scale; },
    SetSpawningEnabled(enabled) { spawningEnabled = !!enabled; },
    DebugDraw() { /* 占位 */ },

    Update(dt) {
      if (dt <= 0) return;
      /* 占位行为：站岗待机 + 警戒自然回落。真正的感知/搜索由 AgentEnemy 实现。 */
      for (let i = 0; i < enemies.length; i += 1) {
        const enemy = enemies[i];
        if (!enemy.alive) continue;
        enemy.alert = Math.max(0, enemy.alert - Config.Stealth.alertDecayPerSecond * dt);
        enemy.alertLevel = enemy.alert >= Config.Stealth.alertRed ? 2 : (enemy.alert >= Config.Stealth.alertYellow ? 1 : 0);
        if (enemy.character) {
          enemy.character.SetLocomotion({ speed: 0, strafe: 0, turnRate: 0, crouch: false, prone: false, aiming: false, grounded: true, surface: 'Snow' });
          enemy.character.SetYaw(enemy.yaw + Math.sin(ctx.elapsed * 0.35 + i) * 0.5);
        }
      }
      let highest = 0;
      for (let i = 0; i < enemies.length; i += 1) if (enemies[i].alive) highest = Math.max(highest, enemies[i].alert);
      globalAlert = highest;
    },

    Dispose() {
      for (let i = enemies.length - 1; i >= 0; i -= 1) {
        if (enemies[i].character && ctx.characters) ctx.characters.Despawn(enemies[i].character);
      }
      enemies.length = 0;
      squads.clear();
      if (group.parent) group.parent.remove(group);
    },
  };

  director.GetProfile = function GetProfile() { return profile; };
  director.GetDifficulty = function GetDifficulty() { return difficulty; };
  return director;
}

export default CreateEnemyDirector;
