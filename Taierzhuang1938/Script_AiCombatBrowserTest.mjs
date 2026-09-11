// 《台儿庄：血战滕县》敌军 AI 实战验收（docs/Data_EnemyAi.md §9 的浏览器那一半）。
//
// 这一层要回答的是四句话能不能被量出来：**会躲、躲得有节奏、不隔墙打人、会绕会扔**。
// `Script_AiBehaviorTest` 锁的是「不抽搐、不甩枪口、不乱冲」——那是**稳定性**；
// 这一层锁的是**行为本身发生了**，两条互不替代（旧那套一条都量不到「躲」）。
//
// 用法：node Taierzhuang1938/Script_AiCombatBrowserTest.mjs
// 退出码即成败。约 10—20 分钟（推 ~9000 帧真实战斗）。
//
// ---------------------------------------------------------------------------
// 阈值一律从表里读，不在这里抄数
// ---------------------------------------------------------------------------
// `COVER_CYCLE`（探头节拍）、`GRENADE`（投弹条件）、`FLANK`（侧翼角）、
// `MISSION_TUNING`（第一关编排）都在页面里 import 回来 —— 调参表改了数这一层跟着走，
// 不会出现「表里 2.5 s、断言里写死 2.5」的第二份真相。
//
// ---------------------------------------------------------------------------
// 两个场景，各自量各自那一半
// ---------------------------------------------------------------------------
// **A 正片前沿**（`?whitebox=p012` 的 Support 段）：量「接进正片之后前沿到底变了没有」。
//   这里有一条必须写明的实况：第一关的前沿是**开阔地**，日军突击线够得着的范围内
//   实测一个掩体点都没有（`covers.Nearby(pos, reach).length === 0`）。
//   「会躲」不可能在没有掩体的地方成立，所以 A 的分母是**够得着掩体的那批人**，
//   够不着的另行报数 —— 这是地形事实，不是 AI 退步；把它混进分母只会让断言变成一句谎话。
//
// **B 受控实验**（村落一带的一堵真墙 + 一支现撒的普通班）：量「隔墙打不打得到人」
//   「探头有没有节奏」「会不会绕」「会不会扔」。之所以另撒一支班：第一关前沿的日军
//   全带剧本旗，而 `Script_AiTactics.IsScripted` **明确不给剧本单位派机动任务**
//   （关卡的跃进线不能被侧翼任务改写）—— 那是设计不是缺陷，所以侧翼与投弹要在
//   没有剧本旗的普通班上量，走的仍然是同一条 AI 链路。
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { MISSION_ANCHORS } from "./Data_FirstLevelMissionLayout.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const server = await ServeRoot(rootDir, 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors = [];
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 240)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  errors.push(`CONSOLE ${message.text().slice(0, 240)}`);
});

const results = [];
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  — ${detail}` : ""}`);
}

try {
  const port = server.address().port;
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&quality=low`,
    { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 300000 });

  const sample = await page.evaluate(async (anchors) => {
    const T = window.Tengxian;
    // 受控场（找墙 / 撒班 / 清场 / 摆玩家 / 无敌）整套搬进了 `Script_AiProbeScene`，
    // 编辑器的「试验场」分节用的是**同一份**：这里量到的行为，设计师能一键复现。
    const probe = await import("./Script_AiProbeScene.mjs");
    const coverTable = await import("./Data_Tuning_AiCover.mjs");
    const tacticsTable = await import("./Data_Tuning_AiTactics.mjs");
    const firstTable = await import("./Data_Tuning_FirstLevel.mjs");
    const aiTable = await import("./Data_Tuning_Ai.mjs");
    const COVER_CYCLE = coverTable.COVER_CYCLE;
    const GRENADE = tacticsTable.GRENADE;
    const FLANK = tacticsTable.FLANK;
    const WATCH = aiTable.WATCH;
    const R = firstTable.MISSION_TUNING;
    const out = { thresholds: { COVER_CYCLE, GRENADE, FLANK, WATCH } };

    T.state.menu = false;
    // Isolated AI fixture: use the supported public stage installer. Normal
    // campaign acceptance runs separately without jumps or fabricated facts.
    await T.Debug.FirstLevelJump(4);
    const rt = T.Debug.FirstLevelMissionRuntime();
    T.StepFrames(2, 1 / 60, false);

    const Step = (n) => { for (let i = 0; i < n; i += 1) T.StepFrames(1, 1 / 60, false); };
    const Ground = (x, z) => T.battlefield.GroundHeight(x, z);
    const Teleport = (x, z, stance = "stand", yaw = 0) => probe.PlacePlayer(T, { x, z }, stance, yaw);
    const Immortal = () => probe.Immortal(T);
    const InCover = (s) => !!s.cover && s.cover.validated
      && Math.hypot(s.cover.hidePos.x - s.position.x, s.cover.hidePos.z - s.position.z)
        < COVER_CYCLE.arriveRadiusM;
    /** 这个人够得着的范围里到底有没有掩体点可用（没有的话「会躲」无从谈起）。 */
    const HasCoverInReach = (s) => {
      const reach = T.ai.CoverReachM(s);
      const r = Number.isFinite(reach) ? reach : 22;
      return T.ai.covers.Nearby(s.position.x, s.position.z, r).length > 0;
    };

    // ======================================================================
    // A 正片前沿：开战 20 s 后的掩体实况
    // ======================================================================
    Teleport(anchors.gun.x, anchors.gun.z, "stand", 0);
    Step(120);                 // 让流程把前沿这一段推起来
    Immortal();
    Step(20 * 60);
    {
      const fighting = T.ai.soldiers.filter((s) => s.alive && s.side === "ija"
        && !s.scriptedNoncombatant
        // 正走剧本路线的人（跃进冲刺途中）位移归关卡编排，掩体对他这一秒无从谈起
        && !(s.p012Guided && Number.isFinite(s.scriptMoveSpeedMps))
        && (s.target || (s.lkpConfidence || 0) > 0));
      const reachable = fighting.filter(HasCoverInReach);
      // 真正「在守位上」的那批：跃进冲击途中的人由关卡编排接管位移，
      // 他每隔几秒就被 `MoveActor` 拽向下一条跃进线，谈不上进掩体。
      const holding = fighting.filter((s) => s.scriptDefensive);
      const holdingWithCover = holding.filter((s) => !!s.cover);
      out.front = {
        fighting: fighting.length,
        noCoverNearby: fighting.length - reachable.length,
        reachable: reachable.length,
        inCover: reachable.filter(InCover).length,
        anyCover: reachable.filter((s) => !!s.cover).length,
        validated: reachable.filter((s) => s.cover && s.cover.validated).length,
        holding: holding.length,
        holdingWithCover: holdingWithCover.length,
        holdingInCover: holdingWithCover.filter(InCover).length,
        holdingReachable: holding.filter(HasCoverInReach).length,
        peeked: fighting.filter((s) => s.peekCount > 0).length,
        cycling: fighting.filter((s) => s.state === "cover_engage").length,
      };
      // 「够得着却没选上」的人现场重跑一次 Query，把被哪一条筛掉记下来。
      out.frontWhy = holding.filter((s) => !s.cover && HasCoverInReach(s)).slice(0, 4).map((s) => {
        const t = T.ai.ThreatPoint(s);
        if (!t) return { id: s.id, why: "no-threat", lkpC: +(s.lkpConfidence || 0).toFixed(2) };
        const reach = T.ai.CoverReachM(s);
        const found = T.ai.covers.Query(s, [t], {
          radiusM: Math.min(22, reach), maxCandidates: 16, maxValidate: 3,
          soldierId: s.id, suppression: s.suppression, allies: T.ai.CoverAllies(s),
          minAllySpacingM: 2, towardX: NaN, towardZ: NaN,
        });
        const anchor = s.holdZone || s.position;
        return {
          id: s.id, reach: +reach.toFixed(1), found: found.length,
          anchorDist: +Math.hypot(s.position.x - anchor.x, s.position.z - anchor.z).toFixed(1),
          allowed: found.filter((c) => T.ai.CoverAllowed(s, c)).length,
          nearestHideFromAnchor: found.length
            ? +Math.min(...found.map((c) => Math.hypot(c.hidePos.x - anchor.x, c.hidePos.z - anchor.z))).toFixed(1)
            : null,
          pickAgo: +(T.ai.time - s.coverPickAt).toFixed(1),
        };
      });
    }

    // ======================================================================
    // A2 远处不干站着（docs/Data_EnemyAi.md §15）
    // ======================================================================
    // 玩家的原话是「远处的敌人不会动、不找掩体、干站着」。前两条 A 已经量过了
    // （掩体接得活不活），这一节量剩下那条**「干站着」**，按距离分两档，
    // 与取证探针 `_shots/EnemyAi/Script_FarEnemyProbe.mjs` 同一条口径：
    //   · 46–74 m（交战距离内的前沿）：跪射之后**会不会换位** —— 四秒里挪没挪窝；
    //   · 120 m 外（听得见枪声、看不见玩家）：**听没听见** —— 警戒级别与姿态、朝向。
    // 后一档在这张图上是 village / melee 遭遇编成那批剧本旗单位（`missionDormant`）。
    // 他们本来就不该参战，但「战场上有人站得笔直、警戒 unaware」是画面事故不是设计：
    // 病根是剧本旗分支每拍 `ForgetAll`，听觉刚写进去的记忆活不过一拍（§15）。
    {
      const Dist = (s) => Math.hypot(s.position.x - T.player.position.x,
        s.position.z - T.player.position.z);
      const Ija = () => T.ai.soldiers.filter((s) => s.alive && s.side === "ija");
      const seen = new Map();
      for (const s of Ija()) seen.set(s.id, { x: s.position.x, z: s.position.z, maxMoved: 0 });
      // A real player MG burst supplies the opposing audible stimulus. The
      // reduced roster has no 110-man rear reserve generating constant noise.
      T.Debug.Key("KeyF",true);Step(2);T.Debug.Key("KeyF",false);
      T.Debug.Mouse(0,true);
      // Measure movement throughout the window. A soldier who peeks out and
      // returns to cover has moved; comparing only the endpoints erases it.
      for (let frame = 0; frame < 4 * 60; frame++) {
        Step(1);
        for (const s of Ija()) {
          const before = seen.get(s.id);
          if (before) before.maxMoved = Math.max(before.maxMoved,
            Math.hypot(s.position.x - before.x, s.position.z - before.z));
        }
      }
      T.Debug.Mouse(0,false);
      const rows = Ija().map((s) => {
        const b = seen.get(s.id);
        // 朝向契约：yaw=0 面朝 −Z，前向量 =（−sin yaw, −cos yaw）。
        const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
        const at = s.target ? s.target.position : ((s.lkpConfidence || 0) > 0 ? s.lkp : null);
        let facingDeg = null;
        if (at) {
          const dx = at.x - s.position.x, dz = at.z - s.position.z;
          const len = Math.hypot(dx, dz) || 1;
          facingDeg = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / len))) * 180 / Math.PI;
        }
        return {
          d: Dist(s), mobile:!!s.missionAssault, stance: s.stance, state: s.state, alert: s.alert,
          moved: b?.maxMoved || 0,
          facingDeg, knows: !!at,
        };
      });
      const Band = (lo, hi) => {
        const r = rows.filter((x) => x.d >= lo && x.d < hi && (lo>=120 || x.mobile));
        const n = (fn) => r.filter(fn).length;
        return {
          n: r.length,
          still: n((x) => x.moved < 0.5),
          standing: n((x) => x.stance === 0),
          low: n((x) => x.stance > 0),
          unaware: n((x) => x.alert === "unaware"),
          alerted: n((x) => x.alert && x.alert !== "unaware"),
          facingKnown: n((x) => x.facingDeg !== null),
          facingAt: n((x) => x.facingDeg !== null && x.facingDeg <= 60),
          states: r.reduce((h, x) => { h[x.state] = (h[x.state] || 0) + 1; return h; }, {}),
        };
      };
      out.bands = { near: Band(46, 74), far: Band(120, 400) };
      out.displaces = T.ai.stats.displaces;
      T.Debug.Key("KeyF",true);Step(2);T.Debug.Key("KeyF",false);
    }

    // ======================================================================
    // B 受控实验：找一堵真墙 + 现撒一支没有剧本旗的普通班
    // ======================================================================
    // 「找一堵真的挡得住的墙」整段搬进了 Script_AiProbeScene.PickSite（判据与数一个都没改）：
    // 「墙挡住了」只认碰撞体，「看不看得见」还要过 AI 自己那条判据（aiHost.BlocksSight，**含地形**）——
    // 两条不一致的话，挑出来的空地在 AI 眼里可能仍然是看不见的，对照组就会量成
    // 「同一批枪打不到他」，那是地形不是 AI。射手三档眼高逐档验、整班六个撒兵位逐个验、
    // 每个位子身边还得有掩体点可进（探头节奏要在有掩体的地方量）。
    /** 投弹那一段把人挪到离玩家多远（落在 GRENADE 的 [minM, maxM] 中段）。 */
    const GRENADE_RANGE_M = 16;
    let site = probe.PickSite(T, anchors.village.x, anchors.village.z);
    out.site = site ? {
      cover: { x: +site.cover.x.toFixed(1), z: +site.cover.z.toFixed(1), h: +site.cover.height.toFixed(2) },
      hide: { x: +site.hide.x.toFixed(1), z: +site.hide.z.toFixed(1) },
      open: { x: +site.open.x.toFixed(1), z: +site.open.z.toFixed(1) },
      shoot: { x: +site.shoot.x.toFixed(1), z: +site.shoot.z.toFixed(1) },
      yaw: +site.yaw.toFixed(2), rangeM: site.rangeM, seats: site.seats.length,
      coversAtShoot: site.coversAtShoot,
    } : null;
    if (!site) return out;

    // 撒班与清场也在 `Script_AiProbeScene` 里（人口上限、波次预算、花名册的存取一字未改）：
    //   · 人口上限是给正片配的（同屏 56 人），撒兵那几行临时抬一下；
    //   · **B 段把场上清成「一个班对一个玩家」**（事后由 Restore 原样还原）。三个理由，
    //     每一个都足以单独否掉「就在正片里量」：`COMBAT.maxShootersOnPlayer` 是全场共享的
    //     三个名额（A 段已经占满，这支班转去打一百米外的国军）；具名同伴会跟着玩家跑，
    //     探针班眼前最近的敌人变成同伴；`ai.fireCount` 是全场计数，混着前沿读不出这支班打了几发。
    //   · 补兵会往清空后的表里塞人（`UpdateWaves`），所以先把这一关的波次预算用光。
    // 与 `Script_AiBehaviorTest` 里过热对账那一段是同一类归一化：把要量的东西单独拎出来。
    const squad = probe.SpawnProbeSquad(T, site, {
      count: 6, weapon: "Type38", grenades: R.enemyGrenades, coverSlackM: R.defendCoverSlackM,
    });
    out.squad = squad.length;
    // 清场：只留这支班。玩家不在 ai.soldiers 里，所以他照常存在。
    const RestoreRoster = probe.IsolateSquad(T, squad, { runtime: rt });
    out.nearestFriendly = (() => {
      let d = 1e9;
      for (const s of T.ai.soldiers) {
        if (!s.alive || s.side !== "nra") continue;
        d = Math.min(d, Math.hypot(s.position.x - site.hide.x, s.position.z - site.hide.z));
      }
      return +d.toFixed(1);
    })();

    /**
     * 一次**定量齐射**：把一个射手摆到验证过的射击位上、目标焊死成玩家，
     * 然后连着走 `n` 次真的 `TryFire`。方法与 `Script_DamageTest` 的靶场同源 ——
     * 不去等 AI 自己发现玩家，因为那件事取决于通视缓存、探头相位与令牌名额，
     * 重跑一次就是另一个数，方差比要测的效果还大。
     *
     * 这里量的是**结算链**：同一支枪、同一个人、同一段距离，
     * 隔着墙打不打得中，站在空地上打不打得中。
     */
    const Volley = (shooter, at, stance, shots) => {
      // 射击走廊里不许有自己人：齐射期间场上只留这一个射手（事后还原）。
      const bench = T.ai.soldiers.slice();
      T.ai.soldiers.length = 0;
      T.ai.soldiers.push(shooter);
      T.ai.tactics.Reset();
      T.ai.shooting.Detach(shooter);
      Teleport(at.x, at.z, stance, site.yaw);
      shooter.position.set(site.shoot.x, T.player.position.y, site.shoot.z);
      shooter.body?.Teleport(shooter.position.x, shooter.position.y, shooter.position.z);
      shooter.stance = 0;
      shooter.moveSpeed = 0;
      shooter.suppression = 0;
      shooter.heat = 0;
      shooter.coolUntil = -1;
      shooter.scriptDefensive = false;
      shooter.yaw = Math.atan2(-(T.player.position.x - shooter.position.x),
        -(T.player.position.z - shooter.position.z));
      shooter.target = { position: T.player.position, isPlayer: true, ref: null, id: -1 };
      shooter.targetVisible = true;
      shooter.playerLockAt = -999;
      const healthBefore = T.player.health;
      let fired = 0;
      let maxExposure = 0;
      let aimed = 0;
      for (let i = 0; i < shots; i += 1) {
        shooter.ammo = 99999;
        shooter.fireTimer = 0;
        shooter.aimTime = 99;
        shooter.suppression = 0;
        T.player.velocity.set(0, 0, 0);
        const before = T.ai.fireCount;
        const aimedBefore = T.ai.stats.aimedShots;
        T.ai.TryFire(shooter, 0.25, T.player);
        if (T.ai.fireCount > before) fired += 1;
        if (T.ai.stats.aimedShots > aimedBefore) aimed += 1;
        const frac = shooter.shooting ? shooter.shooting.exposure.fraction : 0;
        if (frac > maxExposure) maxExposure = frac;
      }
      const result = {
        fired, aimed, suppress: fired - aimed,
        damage: +(healthBefore - T.player.health).toFixed(1),
        maxExposure: +maxExposure.toFixed(2),
        muzzleY: +T.ai.shooting.MuzzleOrigin(shooter).y.toFixed(2),
      };
      T.ai.soldiers.length = 0;
      for (const b of bench) T.ai.soldiers.push(b);
      return result;
    };

    // B1 墙后：实际射击路径被挡时停火，不能退成朝实墙压制。
    out.wall = Volley(squad[0], site.hide, "crouch", 60);
    // B2 空地对照：同一支枪、同一段距离，看得见就打得到。
    out.open = Volley(squad[0], site.open, "stand", 60);

    // B3 探头节奏（这支班身边有真掩体，前沿那片开阔地量不到）
    {
      const watch = new Map();
      for (const s of squad) {
        if (!s.alive) continue;
        watch.set(s.id, { frames: 0, hide: 0, peek: 0, cycles: 0, lastPhase: s.coverPhase,
          reloads: 0, reloadsHidden: 0, lastState: s.state });
      }
      Teleport(site.open.x, site.open.z, "stand", site.yaw);
      let peakInCover = 0;
      for (let f = 0; f < 25 * 60; f += 1) {
        T.StepFrames(1, 1 / 60, false);
        T.player.position.set(site.open.x, T.player.position.y, site.open.z);
        T.player.velocity.set(0, 0, 0);
        T.player.health = 1e9;
        if (f % 90 === 0) { T.state.ammo = 5; T.Debug.Fire(); }
        for (const s of squad) {
          const w = watch.get(s.id);
          if (!w || !s.alive) continue;
          w.frames += 1;
          if (s.coverPhase === "hide") w.hide += 1;
          else if (s.coverPhase === "peek") w.peek += 1;
          // 一圈 = 一次 peek→hide 的回落（起手就在 hide，数回落最稳）。
          if (w.lastPhase === "peek" && s.coverPhase === "hide") w.cycles += 1;
          w.lastPhase = s.coverPhase;
          // 「换弹在掩体里」量的是**不在暴露相位**：缩着头换弹算数，
          // 还在往掩体跑的路上换弹也算数（他本来就没探出去），
          // 唯独探着头换弹不算 —— 那正是这条要消灭的事。
          if (s.state === "reload" && w.lastState !== "reload") {
            w.reloads += 1;
            if (s.coverPhase !== "peek") w.reloadsHidden += 1;
          }
          w.lastState = s.state;
        }
        if (f % 30 === 0) {
          const now = squad.filter((s) => s.alive && InCover(s)).length;
          if (now > peakInCover) peakInCover = now;
        }
      }
      const rows = [...watch.values()].filter((w) => (w.hide + w.peek) > 0);
      const hide = rows.reduce((n, w) => n + w.hide, 0);
      const peek = rows.reduce((n, w) => n + w.peek, 0);
      out.rhythm = {
        squad: squad.length, watched: rows.length,
        hideRatio: hide + peek > 0 ? +(hide / (hide + peek)).toFixed(3) : -1,
        cycled: rows.filter((w) => w.cycles >= 1).length,
        reloads: rows.reduce((n, w) => n + w.reloads, 0),
        reloadsHidden: rows.reduce((n, w) => n + w.reloadsHidden, 0),
        inCover: squad.filter((s) => s.alive && InCover(s)).length,
        peakInCover,
        anyCover: squad.filter((s) => s.alive && !!s.cover).length,
        states: squad.map((s) => `${s.state}/${s.coverPhase}/${s.stance}`
          + `/${s.cover ? Math.hypot(s.cover.hidePos.x - s.position.x, s.cover.hidePos.z - s.position.z).toFixed(1) : "-"}`),
      };
    }

    // B4 会绕：把钉子拔了（侧翼与跃进属于机动任务，守区的人一条都不许拿）
    {
      // The protected opening recess intentionally has no flank exit. Use a
      // village wall for the maneuver fixture; keep the same six live actors.
      site=probe.PickSite(T,anchors.village.x,anchors.village.z,{nearest:true});
      if(!site)throw new Error("Missing village flank fixture");
      Teleport(site.open.x,site.open.z,"stand",site.yaw);
      // This invulnerable fixture measures rifle maneuvering. A flanker who
      // passes the player otherwise enters an endless melee (neither can die),
      // freezing Think before the flank angle can be measured. Melee has its own gates.
      const meleeDormancy = squad.map(s => s.meleeDormant);
      for(const [i,s] of squad.entries()){
        const p=T.physics.FindFreeSpot(site.shoot.x-7+i*2.8,site.shoot.z);
        s.position.set(p.x,p.y,p.z);s.body?.Teleport(p.x,p.y,p.z);s.goal.copy(s.position);s.cover=null;
        s.meleeDormant = true;
      }
      for (const s of squad) { s.holdZone = null; s.order = "advance"; s.scriptCoverSlackM = undefined; }
      const flank = { assigned: 0, wide: 0, bestAngleDeg: 0 };
      for (let f = 0; f < 40 * 60; f += 1) {
        T.StepFrames(1, 1 / 60, false);
        T.player.position.set(site.open.x, T.player.position.y, site.open.z);
        T.player.velocity.set(0, 0, 0);
        T.player.health = 1e9;
        if (f % 90 === 0) { T.state.ammo = 5; T.Debug.Fire(); }
        if (f % 6 !== 0) continue;
        for (const s of squad) {
          if (!s.alive || !s.task || s.task.kind !== "flank") continue;
          flank.assigned += 1;
          // 朝向契约：yaw=0 面朝 -Z，前向量 = (-sin yaw, -cos yaw)。
          const fx = -Math.sin(T.player.yaw), fz = -Math.cos(T.player.yaw);
          const dx = s.position.x - T.player.position.x, dz = s.position.z - T.player.position.z;
          const len = Math.hypot(dx, dz) || 1;
          const deg = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / len))) * 180 / Math.PI;
          if (deg > flank.bestAngleDeg) flank.bestAngleDeg = deg;
          if (deg > FLANK.flankMinAngleRad * 180 / Math.PI) flank.wide += 1;
        }
      }
      out.flank = flank;
      squad.forEach((s, i) => { s.meleeDormant = meleeDormancy[i]; });
    }

    // B5 会扔：把人钉回射击线。**距离必须留住** —— 上一段他们会一路压到玩家脸上，
    // 而 `ShouldGrenade` 的第③条是「距离 ∈ [minM, maxM]」，minM 含自身杀伤半径，
    // 贴到五米就谁也不敢扔了。投弹是守区的人也能做的事（HOLD_SAFE_TASKS），钉住不影响。
    {
      // 投弹要的距离在 [minM, maxM] 里（min 含自身杀伤半径，max 含初速射程），
      // 而挑站点时为了避开自动冲锋距离特意拉到了三十多米 —— 那就超出投掷射程了。
      // 所以沿同一条（验证过通视的）轴线把人挪到十六米上。
      const axis = Math.sign(site.shoot.z - site.open.z) || 1;
      const throwZ = site.open.z + axis * GRENADE_RANGE_M;
      squad.forEach((s, i) => {
        const dx = site.seats[i % site.seats.length];
        s.position.set(site.shoot.x + dx, Ground(site.shoot.x + dx, throwZ), throwZ);
        s.body?.Teleport(s.position.x, s.position.y, s.position.z);
        s.holdZone = { id: "AiProbeHold", x: s.position.x, z: s.position.z, radius: 2 };
        s.scriptCoverSlackM = R.defendCoverSlackM;
        s.order = "hold";
        s.lastGrenadeAt = -999;
        s.grenades = R.enemyGrenades;
        s.health = 1e9;
      });
      const grenade = { seen: 0, nearest: 1e9 };
      const before = T.ai.stats.grenades;
      let live = 0;
      for (let f = 0; f < 40 * 60; f += 1) {
        T.StepFrames(1, 1 / 60, false);
        // 玩家钉在同一处：投弹判据的第②条要的就是「对方钉在一处」。
        // **刚体也一起钉**（2026-09-09）：这一条判据读的是 `playerStationaryS`，
        // 而那个计时器按**速度**算，挨一发的 knockback 就是 1.2 m/s（阈值 0.4 m/s）。
        // 只归零 `velocity` 而把刚体留在被推开的地方，等于给下一帧留了一段位移。
        // 这不是本条失败的**已证明**病根（见 docs/Data_EnemyAi.md §15.4 的 A/B 取证：
        // 同一份代码两趟一趟 0 枚一趟 1 枚，方差比效应大），只是把「钉住」这个动作做全。
        T.player.position.set(site.open.x, T.player.position.y, site.open.z);
        T.player.body?.Teleport(T.player.position.x, T.player.position.y, T.player.position.z);
        T.player.velocity.set(0, 0, 0);
        T.player.health = 1e9;
        if (f % 90 === 0) { T.state.ammo = 5; T.Debug.Fire(); }
        const flying = T.combat.projectiles.filter((p) => p.alive && p.owner === "ija");
        if (flying.length > live) grenade.seen += flying.length - live;
        live = flying.length;
        for (const p of flying) {
          const d = Math.hypot(p.position.x - T.player.position.x, p.position.z - T.player.position.z);
          if (d < grenade.nearest) grenade.nearest = +d.toFixed(1);
        }
      }
      out.grenade = { ...grenade, thrown: T.ai.stats.grenades - before,
        left: squad.reduce((n, s) => n + (s.grenades || 0), 0),
        rangeM: +Math.hypot(site.shoot.x - site.open.x, site.shoot.z - site.open.z).toFixed(1) };
      out.rhythmEnd = {
        inCover: squad.filter((s) => s.alive && InCover(s)).length,
        anyCover: squad.filter((s) => s.alive && !!s.cover).length,
        states: squad.map((s) => `${s.state}/${s.coverPhase}/${s.stance}`
          + `/${s.cover ? Math.hypot(s.cover.hidePos.x - s.position.x, s.cover.hidePos.z - s.position.z).toFixed(1) : "-"}`),
      };
    }

    // 还原场上人口 / 波次预算 / 人口上限（新撒的那一班留着，方便覆盖层与快照有东西可看）。
    RestoreRoster();
    out.debug = T.Debug.Ai.State();
    out.debugOne = squad.length ? T.Debug.Ai.State(squad[0].id) : null;
    // 覆盖层：把玩家挪到班边上、面朝他们，再开一次、推一帧、数标签 ——
    // 覆盖层只画视锥内 120 m 以内的人，背对着他们数出来的永远是 0。
    {
      const alive = squad.filter((s) => s.alive);
      if (alive.length) {
        const c = alive[0];
        // 站到班的南面 8 m、yaw=0 面朝 -Z（也就是朝着他们）。
        Teleport(c.position.x, c.position.z + 8, "stand", 0);
        T.player.pitch = 0;
        T.StepFrames(3, 1 / 60, true);
      }
    }
    T.Debug.Ai.Overlay(true);
    T.StepFrames(1, 1 / 60, true);
    const box = document.getElementById("aiDebugOverlay");
    out.overlay = {
      on: T.Debug.Ai.Overlay(),
      labels: box ? [...box.children].filter((el) => el.style.display !== "none").length : -1,
    };
    T.Debug.Ai.Overlay(false);
    return out;
  }, { gun: MISSION_ANCHORS.gun, village: MISSION_ANCHORS.village });

  const C = sample.thresholds;
  console.log("阈值（读表）:", JSON.stringify({
    arriveRadiusM: C.COVER_CYCLE.arriveRadiusM,
    hideDwellS: [C.COVER_CYCLE.hideDwellMinS, C.COVER_CYCLE.hideDwellMaxS],
    peekS: [C.COVER_CYCLE.peekMinS, C.COVER_CYCLE.peekMaxS],
    grenadeHoldS: C.GRENADE.holdS, grenadeMaxM: C.GRENADE.maxM,
    flankMinDeg: +(C.FLANK.flankMinAngleRad * 180 / Math.PI).toFixed(0),
  }));
  console.log("A 正片前沿:", JSON.stringify(sample.front));
  console.log("A2 按距离分档（§15）:", JSON.stringify(sample.bands), "换位次数", sample.displaces);
  console.log("A 没选上掩体的现场诊断:", JSON.stringify(sample.frontWhy));
  console.log("B 受控场地:", JSON.stringify(sample.site), "班", sample.squad, "最近友军", sample.nearestFriendly);
  console.log("B 定量齐射:", JSON.stringify({ open: sample.open, wall: sample.wall }));
  console.log("B 节奏/侧翼/投弹:", JSON.stringify({
    rhythm: sample.rhythm, rhythmEnd: sample.rhythmEnd, flank: sample.flank, grenade: sample.grenade,
  }));
  console.log("直方图:", JSON.stringify(sample.debug?.states), JSON.stringify(sample.debug?.tasks));

  Check("场地成立：找到一堵真的挡得住的墙，且撒出了整班", !!sample.site && sample.squad >= 5,
    `${JSON.stringify(sample.site)} 班=${sample.squad}`);

  const f = sample.front || {};
  // 正片前沿这一条**不压 60%**，压的是「接进去了、而且是活的」：有人选到掩体、
  // 有人在跑探头周期。60% 那个数在这块地形上不可能成立 —— 实测 24/42 的日军
  // 身边一个掩体点都没有（跃进冲击走的是开阔地），而剩下的人每隔三秒就被
  // `UpdateAssault` 拽向下一条跃进线，走不完那五到八米。这是关卡内容的账，
  // 不是 AI 的账；严格的 60% 在下面那条受控实验里压。
  Check("① 会躲（正片前沿）：掩体接入是活的（有人选上、有人在跑周期）",
    f.anyCover >= 3 && f.cycling >= 2,
    `选上掩体=${f.anyCover}（验证过=${f.validated}、已到位=${f.inCover}）、`
      + `在跑周期=${f.cycling}、探过头=${f.peeked}；`
      + `守位上=${f.holding}（其中够得着掩体 ${f.holdingReachable}、选上 ${f.holdingWithCover}）；`
      + `另有 ${f.noCoverNearby}/${f.fighting} 人身边根本没有掩体点（开阔地，地形事实）`);

  // ⑨ 远处不干站着（§15）。两档各压一条，阈值口径写在断言的说明里：
  //   · 46–74 m：跪射之后会换位 —— 四秒窗口里**挪过窝的人过半**，而且还有三分之一
  //     以上的人是伏低的（挡住「所有人都站起来走来走去」这一种退化）；
  //   · 120 m 外：听得见 —— 警戒过半不再是 unaware、站直的不过半，
  //     而且知道动静在哪的人里有人是**朝着那边**的（±60°）。
  //
  // 伏低那条**不要求「跪的比站的多」**：跃进节奏加快之后（assaultFinalHoldS 11 → 4.5 s
  // 加上横向换位）本来就有更多人正在两条线之间跑，站着的那一批多半是跑动中的人
  // —— 实测同一份代码两趟读到 12:12 与 11:13，压「多数」等于压一枚硬币。
  const nb = sample.bands?.near || { n: 0 };
  const fb = sample.bands?.far || { n: 0 };
  Check("⑨ 跪射之后会换位（46–74 m）：四秒窗口里挪过窝的人过半，且仍有三分之一以上伏低",
    nb.n === 0 || (nb.still <= Math.floor(nb.n / 2) && nb.low >= Math.ceil(nb.n * 0.35)),
    `${nb.n} 人：四秒没挪窝 ${nb.still}、蹲/卧 ${nb.low}、站 ${nb.standing}、`
      + `全场换位 ${sample.displaces} 次；${JSON.stringify(nb.states)}`);
  Check("⑨ 远处听得见（120 m 外）：警戒过半不再是 unaware、站直的不过半、有人朝着枪声",
    fb.n === 0 || (fb.alerted >= Math.ceil(fb.n / 2) && fb.standing <= Math.floor(fb.n / 2)
      && (fb.facingKnown === 0 || fb.facingAt >= 1)),
    `${fb.n} 人：警戒 ${fb.alerted}（unaware ${fb.unaware}）、站 ${fb.standing}、蹲/卧 ${fb.low}、`
      + `知道动静在哪 ${fb.facingKnown}（其中面向 ±60° 的 ${fb.facingAt}）；${JSON.stringify(fb.states)}`);

  const rh = sample.rhythm || {};
  Check("① 会躲（受控）：整班在验证过的掩体里",
    rh.watched >= 3 && Math.max(rh.inCover, rh.peakInCover) / Math.max(1, rh.squad) >= 0.6,
    `窗口内最多到位=${rh.peakInCover}/${rh.squad}、窗口末 ${rh.inCover}（有掩体=${rh.anyCover}）；`
      + `钉回射击线之后 ${sample.rhythmEnd?.inCover}/${rh.squad}；${JSON.stringify(rh.states)}`);
  Check("② 躲得有节奏：隐蔽帧占 40—80%，多数人跑满 hide→peek→hide",
    rh.hideRatio >= 0.4 && rh.hideRatio <= 0.8 && rh.cycled >= Math.ceil(rh.watched * 0.6),
    `隐蔽帧 ${(rh.hideRatio * 100).toFixed(0)}%，跑满圈 ${rh.cycled}/${rh.watched}`);
  Check("④ 换弹不在探头相位：进入 RELOAD 的那一帧已经缩回去了",
    rh.reloads === 0 || rh.reloadsHidden / rh.reloads >= 0.8,
    `${rh.reloadsHidden}/${rh.reloads}`);

  Check("③ 实墙遮挡时停火：60 次开火尝试，零出膛、零伤害",
    sample.wall.fired === 0 && sample.wall.damage === 0 && sample.wall.maxExposure === 0
      && sample.wall.aimed === 0,
    `出膛 ${sample.wall.fired} 发（瞄准 ${sample.wall.aimed} / 压制 ${sample.wall.suppress}）、`
      + `掉血 ${sample.wall.damage}、最大暴露 ${sample.wall.maxExposure}、枪口 ${sample.wall.muzzleY} m`);
  Check("③ 对照组：同一支枪、同一段距离，站在空地上打得到他",
    sample.open.damage > 0 && sample.open.maxExposure > 0 && sample.open.aimed > 0,
    `出膛 ${sample.open.fired} 发（瞄准 ${sample.open.aimed} / 压制 ${sample.open.suppress}）、`
      + `掉血 ${sample.open.damage}、最大暴露 ${sample.open.maxExposure}`);

  Check("⑤ 会绕：60 s 内有人拿到 FLANK 任务并绕出正面锥",
    sample.flank.assigned > 0 && sample.flank.wide > 0,
    `派活 ${sample.flank.assigned} 次、绕出正面锥 ${sample.flank.wide} 次、`
      + `最大偏角 ${sample.flank.bestAngleDeg.toFixed(0)}°`);

  Check("⑥ 会扔：玩家钉在一处时挨了手榴弹",
    sample.grenade.thrown > 0 && sample.grenade.nearest <= C.GRENADE.maxM,
    `投出 ${sample.grenade.thrown} 枚、最近落点 ${sample.grenade.nearest} m、剩余携行 ${sample.grenade.left}`);

  Check("⑦ 取证口：Debug.Ai 的直方图与单兵快照都拿得到",
    !!sample.debug && !!sample.debug.states && !!sample.debugOne && sample.overlay.labels >= 1,
    `覆盖层标签 ${sample.overlay.labels} 条`);

  Check("⑧ 浏览器无脚本错误", errors.length === 0, errors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length) {
  console.log("失败：\n  " + failed.map((r) => r.name).join("\n  "));
  process.exitCode = 1;
}
