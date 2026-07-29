/**
 * Script_Event.mjs — 事件总线 + 事件名常量
 * Owner: AgentFoundation
 *
 * 纪律：零 import。跨模块通信一律走这里，不许互相 import 玩法模块。
 *
 * 保证（其它模块可以依赖这三条）：
 *  1. 重入安全：handler 内部再 Emit / On / Off，不会破坏本次派发的遍历。
 *  2. 异常隔离：一个订阅者抛错不会中断其他订阅者，也不会冒泡出 Emit。
 *  3. 通配符：On('*') 收全部事件，handler 收到 (payload, name)。
 */

/** 事件名常量表。所有 Emit/On 必须用 EventNames.Xxx，不许写字符串字面量。 */
export const EventNames = Object.freeze({
  /* 潜行与噪音 */
  NoiseEmitted: 'NoiseEmitted',
  GunFired: 'GunFired',
  MeleeHit: 'MeleeHit',
  StealthKill: 'StealthKill',
  ThrowLanded: 'ThrowLanded',

  /* 敌人 */
  EnemyAlertChanged: 'EnemyAlertChanged',
  EnemySpotted: 'EnemySpotted',
  EnemyDown: 'EnemyDown',
  SquadAlerted: 'SquadAlerted',

  /* 玩家与生存 */
  PlayerDamaged: 'PlayerDamaged',
  PlayerDowned: 'PlayerDowned',
  HealthChanged: 'HealthChanged',
  StaminaChanged: 'StaminaChanged',
  WarmthChanged: 'WarmthChanged',

  /* 物品 */
  ItemPicked: 'ItemPicked',
  ItemCrafted: 'ItemCrafted',
  ItemUsed: 'ItemUsed',
  AmmoChanged: 'AmmoChanged',

  /* 交互 */
  InteractPrompt: 'InteractPrompt',
  InteractStarted: 'InteractStarted',
  InteractFinished: 'InteractFinished',

  /* 流程与叙事 */
  ObjectiveChanged: 'ObjectiveChanged',
  StoryBeat: 'StoryBeat',
  Subtitle: 'Subtitle',
  SoundCaption: 'SoundCaption',
  CompanionState: 'CompanionState',
  CompanionCaptured: 'CompanionCaptured',
  WeatherChanged: 'WeatherChanged',
  ChapterChanged: 'ChapterChanged',
  GameOver: 'GameOver',
  GameEnded: 'GameEnded',
  /** 只记录代价，永不计分、永不转化为奖励（红线三）。 */
  CostRecorded: 'CostRecorded',

  /* 系统请求 */
  RequestTimeScale: 'RequestTimeScale',
  RequestCameraShake: 'RequestCameraShake',
  SettingsChanged: 'SettingsChanged',
  QualityChanged: 'QualityChanged',
  PauseChanged: 'PauseChanged',
  SaveWritten: 'SaveWritten',
});

/** 通配符订阅名。 */
export const WildcardName = '*';

const DefaultHistoryLimit = 64;

function Now() {
  if (typeof performance === 'object' && performance && typeof performance.now === 'function') {
    return performance.now() / 1000;
  }
  return Date.now() / 1000;
}

function ReportListenerError(name, error, debug) {
  /* 订阅者的锅不能砸到派发者头上；但也不能悄悄吞掉。 */
  if (typeof console === 'object' && console && typeof console.error === 'function') {
    console.error('[EventBus] 订阅者异常 @ ' + name + ':', error);
  }
  if (debug && typeof console === 'object' && console && typeof console.trace === 'function') {
    console.trace();
  }
}

export function CreateEventBus(options) {
  const settings = options || {};
  const historyLimit = Math.max(0, settings.historyLimit === undefined ? DefaultHistoryLimit : settings.historyLimit);

  /** name → Array<{ handler, once, priority, order, dead }> */
  const listeners = new Map();
  const deferred = [];
  const history = new Array(historyLimit);
  let historyCursor = 0;
  let historyCount = 0;
  let orderCounter = 0;
  let debugEnabled = !!settings.debug;
  let disposed = false;
  let emitDepth = 0;

  function GetBucket(name, create) {
    let bucket = listeners.get(name);
    if (!bucket && create) {
      bucket = [];
      listeners.set(name, bucket);
    }
    return bucket;
  }

  function SortBucket(bucket) {
    /* priority 大的先收；同 priority 保持注册顺序 */
    bucket.sort((a, b) => (b.priority - a.priority) || (a.order - b.order));
  }

  function Subscribe(name, handler, subscribeOptions) {
    if (disposed || typeof handler !== 'function' || typeof name !== 'string' || name.length === 0) {
      return function NoopUnsubscribe() {};
    }
    const entry = {
      handler: handler,
      once: !!(subscribeOptions && subscribeOptions.once),
      priority: (subscribeOptions && Number(subscribeOptions.priority)) || 0,
      order: orderCounter++,
      dead: false,
    };
    const bucket = GetBucket(name, true);
    bucket.push(entry);
    SortBucket(bucket);
    let unsubscribed = false;
    return function Unsubscribe() {
      if (unsubscribed) return;
      unsubscribed = true;
      entry.dead = true;
      const current = listeners.get(name);
      if (!current) return;
      const index = current.indexOf(entry);
      if (index >= 0) current.splice(index, 1);
      if (current.length === 0) listeners.delete(name);
    };
  }

  function RecordHistory(name, payload) {
    if (historyLimit === 0) return;
    history[historyCursor] = { name: name, payload: payload, time: Now() };
    historyCursor = (historyCursor + 1) % historyLimit;
    if (historyCount < historyLimit) historyCount += 1;
  }

  function DispatchBucket(bucket, name, payload) {
    if (!bucket || bucket.length === 0) return;
    /* 快照遍历：本次派发中新增/移除的订阅者不影响这一轮 */
    const snapshot = bucket.slice();
    for (let i = 0; i < snapshot.length; i += 1) {
      const entry = snapshot[i];
      if (entry.dead) continue;
      if (entry.once) {
        entry.dead = true;
        const live = listeners.get(name === WildcardName ? WildcardName : name);
        if (live) {
          const index = live.indexOf(entry);
          if (index >= 0) live.splice(index, 1);
          if (live.length === 0) listeners.delete(name === WildcardName ? WildcardName : name);
        }
      }
      try {
        entry.handler(payload, name);
      } catch (error) {
        ReportListenerError(name, error, debugEnabled);
      }
    }
  }

  const bus = {
    /** 返回退订函数；priority 越大越先收到，默认 0。 */
    On(name, handler, subscribeOptions) {
      return Subscribe(name, handler, subscribeOptions);
    },

    Once(name, handler) {
      return Subscribe(name, handler, { once: true });
    },

    Off(name, handler) {
      const bucket = listeners.get(name);
      if (!bucket) return;
      for (let i = bucket.length - 1; i >= 0; i -= 1) {
        if (bucket[i].handler === handler) {
          bucket[i].dead = true;
          bucket.splice(i, 1);
        }
      }
      if (bucket.length === 0) listeners.delete(name);
    },

    /** 同步派发。重入安全，异常隔离。 */
    Emit(name, payload) {
      if (disposed || typeof name !== 'string' || name.length === 0) return;
      const data = payload === undefined ? {} : payload;
      RecordHistory(name, data);
      if (debugEnabled && typeof console === 'object' && console && typeof console.debug === 'function') {
        console.debug('[EventBus] ' + name, data);
      }
      emitDepth += 1;
      try {
        DispatchBucket(listeners.get(name), name, data);
        if (name !== WildcardName) DispatchBucket(listeners.get(WildcardName), name, data);
      } finally {
        emitDepth -= 1;
      }
    },

    /** 入队，由 Boot 每帧固定点 Flush() 统一派发。 */
    EmitLater(name, payload) {
      if (disposed || typeof name !== 'string' || name.length === 0) return;
      deferred.push({ name: name, payload: payload === undefined ? {} : payload });
    },

    Flush() {
      if (disposed) return;
      let guard = 0;
      while (deferred.length > 0) {
        guard += 1;
        if (guard > 512) {
          /* 有人在 handler 里无限 EmitLater，掐断而不是卡死整帧 */
          deferred.length = 0;
          if (typeof console === 'object' && console && typeof console.warn === 'function') {
            console.warn('[EventBus] Flush 迭代超限，已丢弃剩余队列');
          }
          break;
        }
        const batch = deferred.splice(0, deferred.length);
        for (let i = 0; i < batch.length; i += 1) bus.Emit(batch[i].name, batch[i].payload);
      }
    },

    Clear(name) {
      if (name === undefined) {
        listeners.clear();
        deferred.length = 0;
        return;
      }
      const bucket = listeners.get(name);
      if (bucket) {
        for (let i = 0; i < bucket.length; i += 1) bucket[i].dead = true;
        listeners.delete(name);
      }
    },

    ListenerCount(name) {
      if (name === undefined) {
        let total = 0;
        listeners.forEach((bucket) => { total += bucket.length; });
        return total;
      }
      const bucket = listeners.get(name);
      return bucket ? bucket.length : 0;
    },

    /** 最近 historyLimit 条（默认 64），按时间正序返回。 */
    History(name, limit) {
      const out = [];
      const total = historyCount;
      const start = historyLimit === 0 ? 0 : (historyCursor - total + historyLimit) % historyLimit;
      for (let i = 0; i < total; i += 1) {
        const entry = history[(start + i) % historyLimit];
        if (!entry) continue;
        if (name !== undefined && entry.name !== name) continue;
        out.push(entry);
      }
      if (limit !== undefined && out.length > limit) return out.slice(out.length - limit);
      return out;
    },

    SetDebug(enabled) { debugEnabled = !!enabled; },
    IsDebug() { return debugEnabled; },
    IsEmitting() { return emitDepth > 0; },
    PendingCount() { return deferred.length; },

    Dispose() {
      disposed = true;
      listeners.clear();
      deferred.length = 0;
      historyCount = 0;
      historyCursor = 0;
    },
  };

  return bus;
}
