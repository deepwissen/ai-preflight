import type { EventMap } from "./types.js";

type EventHandler<T> = (data: T) => void;

/**
 * Typed event bus for decoupled communication between components.
 * No VS Code dependency — works in tests, CLI, and extension.
 */
export class EventBus {
  private listeners = new Map<string, Set<EventHandler<unknown>>>();

  on<K extends keyof EventMap>(
    event: K,
    handler: EventHandler<EventMap[K]>
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler as EventHandler<unknown>);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(handler as EventHandler<unknown>);
    };
  }

  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;

    for (const handler of handlers) {
      try {
        handler(data);
      } catch (err) {
        console.error(`[EventBus] Error in handler for "${event}":`, err);
      }
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}
