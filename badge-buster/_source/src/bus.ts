// EventBus 实现 —— 同步派发的类型安全事件总线
import type { EventBus, GameEvent, GameEventType } from './types/events.types';

type AnyHandler = (e: GameEvent) => void;

export function createEventBus(): EventBus {
  const handlers = new Map<GameEventType, Set<AnyHandler>>();

  return {
    on(type, handler) {
      let set = handlers.get(type);
      if (!set) { set = new Set(); handlers.set(type, set); }
      const h = handler as AnyHandler;
      set.add(h);
      return () => set!.delete(h);
    },
    emit(e) {
      const set = handlers.get(e.type);
      if (!set || set.size === 0) return;
      // 复制一份，避免处理器内部增删订阅导致迭代异常
      for (const h of [...set]) {
        try {
          h(e);
        } catch (err) {
          // 单个处理器异常不应中断整条派发链
          console.error(`[bus] handler error on "${e.type}"`, err);
        }
      }
    },
  };
}
