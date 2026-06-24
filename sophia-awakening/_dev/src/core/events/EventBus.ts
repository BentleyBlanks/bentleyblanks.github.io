import type { GameEvent, GameEventType } from "./GameEvents";

type EventHandler<T extends GameEvent = GameEvent> = (event: T) => void;

export class EventBus {
  private handlers = new Map<GameEventType, Set<EventHandler>>();

  on<T extends GameEventType>(type: T, handler: EventHandler<Extract<GameEvent, { type: T }>>): () => void {
    const typedHandler = handler as EventHandler;
    const handlers = this.handlers.get(type) ?? new Set<EventHandler>();
    handlers.add(typedHandler);
    this.handlers.set(type, handlers);

    return () => {
      handlers.delete(typedHandler);
    };
  }

  emit(event: GameEvent): void {
    const handlers = this.handlers.get(event.type);

    if (!handlers) {
      return;
    }

    for (const handler of handlers) {
      handler(event);
    }
  }
}
