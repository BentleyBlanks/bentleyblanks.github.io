import type { EventBus, GameEvent } from '../types/events.types';

export function createEventBus(): EventBus {
  const handlers = new Map<GameEvent['type'], Set<(event: GameEvent) => void>>();

  return {
    on(type, handler) {
      const list = handlers.get(type) ?? new Set<(event: GameEvent) => void>();
      list.add(handler as (event: GameEvent) => void);
      handlers.set(type, list);
      return () => {
        list.delete(handler as (event: GameEvent) => void);
      };
    },
    emit(event) {
      const list = handlers.get(event.type);
      if (!list) {
        return;
      }
      for (const handler of [...list]) {
        handler(event);
      }
    },
  };
}
