// 调试口 window.Tengxian.Debug 的一组：关卡与任务：换关跳段、钉关、检查点、摆点、第一关与 P012、叙事结果（docs/Data_DebugApi.md）。
// 主文件里的状态、服务、函数一律从工具箱 ctx 取；名字与签名是测试脚本的契约，改名要同步改测试。

import { FIRST_LEVEL_STAGES } from "./Data_FirstLevelMissionStages.mjs";
import { PhaseContentId } from "./Script_FirstLevelWhiteboxFlow.mjs";
import { LastLitterArrived } from "./Script_MissionSetpieces.mjs";
import { CHAPTER_RELEASE_SIGNAL } from "./Script_Story.mjs";

export function MissionDebugApi(ctx) {
  return {
  EndBattle: ctx.EndBattle,
      // --- 线性关卡的取证口 ---
      // 这一关是哪一关、目标链走到第几个、路标各在哪儿。
      // 「七关能依次推进」这条断言只能从这里读，读源码是推断不出来的。
      Level: () => {
        const phase = ctx.PHASE_TABLE[ctx.state.phaseIndex];
        return {
          index: ctx.state.phaseIndex, id: phase.id, title: phase.label,
          objectiveIndex: ctx.state.objectiveIndex, objectiveCount: ctx.state.objectiveCount,
          objective: ctx.state.storyObjective,
          zones: ctx.battlefield.objectives.map((o) => ({
            id: o.id, name: o.name, x: o.x, z: o.z, radius: o.radius, reached: o.reached,
          })),
          seconds: ctx.state.levelSeconds, elapsed: ctx.state.phaseTime,
          pool: ctx.state.nraPool, advancing: ctx.state.advancing,
        };
      },
      // 直接把玩家挪到第 n 个路标里（通关冒烟靠它一关一关推，不必真走两公里）
      GotoObjective: (n) => {
        const objectives = ctx.battlefield.objectives;
        const o = objectives[Math.min(Math.max(0, n), objectives.length - 1)];
        if (!o) return null;
        ctx.player.Spawn(o.x, o.z, ctx.player.yaw);
        return { x: o.x, z: o.z, id: o.id };
      },
      // 把当前这一关的目标链一路点完（不动画、不等 AI 让开）
      CompleteLevel: () => {
        const objectives = ctx.battlefield.objectives;
        for (let i = ctx.state.objectiveIndex; i < objectives.length; i += 1) ctx.ReachObjective(i);
        return ctx.state.objectiveIndex;
      },
      AdvanceLevel: (opts) => ctx.AdvanceLevel(opts || {}),
      // 钉住/放开当前关。剧本长跑要用它，见 state.pinned 的注释。
      PinLevel: (on) => { ctx.state.pinned = on !== false; return ctx.state.pinned; },
      // --- 钉关原语（mechanics.pinFinalZone）的取证口 ---
      // 「走到最后一个路标为什么没换关」只能从这里读。
      ChapterPin: () => ({
        pinFinalZone: ctx.state.pinFinalZone,
        released: ctx.state.chapterReleased,
        releaseAt: ctx.state.chapterReleaseAt,
        signal: CHAPTER_RELEASE_SIGNAL,
        signalled: ctx.story ? ctx.story.Signalled(CHAPTER_RELEASE_SIGNAL) : false,
        objectiveIndex: ctx.state.objectiveIndex, objectiveCount: ctx.state.objectiveCount,
        phaseTime: ctx.state.phaseTime, levelSeconds: ctx.state.levelSeconds,
      }),
      ReleaseChapter: () => { ctx.story?.Signal(CHAPTER_RELEASE_SIGNAL); return ctx.state.chapterReleased; },
      // --- 脚本检查点的取证口 ---
      Checkpoint: () => ({
        samples: ctx.checkpoint ? ctx.checkpoint.Count : 0,
        rewinds: ctx.checkpoint ? ctx.checkpoint.rewinds.slice() : [],
        latest: ctx.checkpoint ? ctx.checkpoint.Latest : null,
      }),
      SaveCheckpoint: () => !!ctx.checkpoint?.Save(),
      RewindCheckpoint: (seconds) => (ctx.checkpoint ? ctx.checkpoint.Rewind(seconds) : null),
      /**
       * 章节摆点的取证口（集成批 INT2）。
       *
       *   Debug.Setpieces()              这一章摆了什么、推过哪些信号、后送队走到哪儿
       *   Debug.SetpieceFacts()          同一局之内的场景事实（门板拆了几块、门开没开）
       *   Debug.SetpieceProps()          运行时道具清单
       *
       * `signals` 是最要紧的一栏：**七章与九个系统之间的接缝只有这一条**，
       * 「这一拍该发生的事到底推没推」在这里一眼看得出来。
       *
       * 还欠着的动词（host 里恒返回 null / 只记事实的那几条）：
       *   CookingCrate  —— 二关殉爆倒计时要一件**真的弹药箱实体**，现在的箱子
       *                    是交互点 + 搬运态，场上没有可被掷弹筒打中的那一只；
       *   SetCombatBed  —— 交火声床的整层淡入淡出归音频批（INT3）。
       */
      Setpieces: () => (ctx.setpieces ? ctx.setpieces.State() : null),
      P012: () => ctx.missionRuntime?.State() || ctx.p012Flow?.State() || null,
      FirstLevelMission: () => ctx.missionRuntime?.State() || null,
      FirstLevelStages: () => FIRST_LEVEL_STAGES.map(stage => ({...stage,current:ctx.missionRuntime?.flow.phase.id===stage.id})),
      FirstLevelJump: (value) => ctx.JumpFirstLevelStage(value),
      // 性能取证与专项测试直接读运行时对象（敌人表、事实、列队）；不是玩法入口。
      FirstLevelMissionRuntime: () => ctx.missionRuntime || null,
      P012Progress: () => ctx.p012Debug.State(),
      P012NextProgress: () => ctx.p012Debug.Next(),
      P012CarryView: () => ctx.p012CarryView?.Debug() || null,
      P012Casualties:()=>[...ctx.setpieceProps.entries()].filter(([,entry])=>entry.woundedActor).map(([id,entry])=>({id,actor:entry.woundedActor,root:entry.root})),
      P012Environment: () => ({externalCount:ctx.battlefield?.externalProps?.count || 0,pcgCount:ctx.battlefield?.externalProps?.pcgCount || 0,trimCount:ctx.battlefield?.trimProps?.count || 0,
        roots:ctx.scene.children.filter(root=>root.userData?.externalProps || /^(ExternalProps_|TrimProps_)/.test(root.name)).map(root=>root.name)}),
      P012Scene: () => ctx.p012Runtime ? { ...ctx.p012Runtime.Sample(), stageZero:ctx.p012StageZero?.Snapshot(), cast:ctx.ai.soldiers.filter(actor=>actor.castId).map(actor=>({castId:actor.castId,age:actor.identity?.age,modelVariant:actor.actor?.modelVariant,position:{...actor.position}})), resting:{count:ctx.p012Resting?.entries.length||0,people:ctx.p012Resting?.Snapshot()||[]}, airColumnEnteredRoad:ctx.AirColumnEnteredRoad(ctx.setpieces?.mem?.column,ctx.player.position,ctx.PHASE_TABLE[ctx.state.phaseIndex]?.whitebox?.activities), columnPosition: ctx.setpieces?.mem?.column?.HeadPosition(), columnRouteIndex: ctx.setpieces?.mem?.column?.legIndex,
        woundedDragPosition: ctx.setpieces?.mem?.p012WoundedDrag?.position || null,
        woundedDragDelivered: !!ctx.setpieces?.mem?.p012WoundedDrag?.delivered, woundedDragDistance: ctx.setpieces?.mem?.p012WoundedDrag?.distance || 0,
        airCivilian: ctx.setpieces?.mem?.p012AirCivilian ? {
          id:ctx.setpieces.mem.p012AirCivilian.member.handle.id,alive:ctx.setpieces.mem.p012AirCivilian.member.handle.alive,
          health:ctx.setpieces.mem.p012AirCivilian.member.handle.health,carried:ctx.setpieces.mem.p012AirCivilian.carried,
          delivered:ctx.setpieces.mem.p012AirCivilian.delivered,position:{...ctx.setpieces.mem.p012AirCivilian.member.handle.position},
          modelKind:ctx.setpieces.mem.p012AirCivilian.member.handle.actor?.kind,
        }:null,
        carryDistance: ctx.setpieces?.mem?.p012CarryDistance || 0, litterOverturned: !!ctx.setpieces?.mem?.p012LitterOverturned,
        litterRecovered: !!ctx.setpieces?.mem?.p012LitterRecovered, lastLitterArrived: LastLitterArrived(ctx.setpieces?.mem?.column),
        fallenAt: ctx.setpieces?.mem?.p012FallenAt ? { ...ctx.setpieces.mem.p012FallenAt } : null, recoveryReason: ctx.setpieces?.mem?.p012RecoveryReason || null,
        litters: (ctx.setpieces?.mem?.column?.litters || []).map((litter) => ({ id: litter.propLitter, bodyId: litter.propBody, dropped: litter.dropped,
          originalCarried: litter === ctx.setpieces?.mem?.p012CarriedLitter,
          front: litter.front?.handle?.position ? { ...litter.front.handle.position } : null,
          rear: litter.rear?.handle?.position ? { ...litter.rear.handle.position } : null,
          frontAlive: !!litter.front?.handle?.alive, rearAlive: !!litter.rear?.handle?.alive,
          frontHealth: litter.front?.handle?.health ?? null, rearHealth: litter.rear?.handle?.health ?? null,
          propPosition: ctx.setpieceProps.get(String(litter.propLitter))?.root?.position ? { ...ctx.setpieceProps.get(String(litter.propLitter)).root.position } : null })),
        columnActors: (ctx.setpieces?.mem?.column?.Alive || []).map((member) => ({ role: member.role, x: member.handle.position.x, z: member.handle.position.z })) } : null,
      SetpieceFacts: () => ({ ...ctx.state.setpieceFacts, items: { ...ctx.state.setpieceItems } }),
      SetpieceProps: () => [...ctx.setpieceProps.entries()].map(([id, entry]) => ({
        id, kind: entry.spec.kind || "box", visible: !!entry.root?.visible,
        x: +entry.root.position.x.toFixed(1), z: +entry.root.position.z.toFixed(1),
      })),
      Firewalls: () => ctx.state.firewalls.map((w) => ({
        id: w.id, until: +w.until.toFixed(1), damagePlayer: w.damagePlayer, smoke: w.smoke.length,
      })),
      Spoken: () => ctx.hud.spoken.slice(),
      StoryFired: () => ctx.story.fired.slice(),
      Outcome: () => ctx.state.outcome,
      Whitebox: () => {
        const phase = ctx.PHASE_TABLE[ctx.state.phaseIndex];
        return {
          phase: phase.id,
          contentId: PhaseContentId(phase),
          storyLevel: ctx.story?.levelId || null,
          setpieceLevel: ctx.setpieces?.levelId || null,
          companions: ctx.companion?.Present?.length || 0,
          enemyCount: ctx.ai.CountSide("ija"),
          enemyDeaths: ctx.ai.deaths.ija || 0,
          phaseTime: ctx.state.phaseTime,
          objectiveIndex: ctx.state.objectiveIndex,
          blockedReason: ctx.state.objectiveBlockedReason,
          field: ctx.battlefield?.DebugState?.() || null,
        };
      },
  };
}
