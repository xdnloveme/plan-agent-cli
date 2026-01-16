import EventEmitter from 'eventemitter3';
import type { AgentEvents } from '../agents/types';

/**
 * Type-safe event handler
 */
type EventHandler<T> = (data: T) => void | Promise<void>;

/**
 * Type-safe event bus for agent communication
 *
 * Provides decoupled communication between agents and components
 * following the Observer pattern.
 */
export class EventBus {
  private emitter: EventEmitter;
  private debug: boolean;

  constructor(options: { debug?: boolean } = {}) {
    this.emitter = new EventEmitter();
    this.debug = options.debug ?? false;
  }

  /**
   * Subscribe to an event
   */
  on<K extends keyof AgentEvents>(event: K, handler: EventHandler<AgentEvents[K]>): void {
    this.emitter.on(event, handler as EventEmitter.ListenerFn);
  }

  /**
   * Subscribe to an event once
   */
  once<K extends keyof AgentEvents>(event: K, handler: EventHandler<AgentEvents[K]>): void {
    this.emitter.once(event, handler as EventEmitter.ListenerFn);
  }

  /**
   * Unsubscribe from an event
   */
  off<K extends keyof AgentEvents>(event: K, handler: EventHandler<AgentEvents[K]>): void {
    this.emitter.off(event, handler as EventEmitter.ListenerFn);
  }

  /**
   * Emit an event
   */
  emit<K extends keyof AgentEvents>(event: K, data: AgentEvents[K]): void {
    if (this.debug) {
      // eslint-disable-next-line no-console
      console.log(`[EventBus] ${event}:`, JSON.stringify(data, null, 2));
    }
    this.emitter.emit(event, data);
  }

  /**
   * Remove all listeners for an event
   */
  removeAllListeners<K extends keyof AgentEvents>(event?: K): void {
    if (event) {
      this.emitter.removeAllListeners(event);
    } else {
      this.emitter.removeAllListeners();
    }
  }

  /**
   * Get listener count for an event
   */
  listenerCount<K extends keyof AgentEvents>(event: K): number {
    return this.emitter.listenerCount(event);
  }

  /**
   * Wait for an event to be emitted
   */
  waitFor<K extends keyof AgentEvents>(
    event: K,
    timeout?: number
  ): Promise<AgentEvents[K]> {
    return new Promise((resolve, reject) => {
      const timeoutId = timeout
        ? setTimeout(() => {
            this.off(event, handler);
            reject(new Error(`Timeout waiting for event: ${event}`));
          }, timeout)
        : null;

      const handler = (data: AgentEvents[K]) => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve(data);
      };

      this.once(event, handler);
    });
  }

  /**
   * Create a scoped event bus that prefixes all events
   */
  scoped(prefix: string): ScopedEventBus {
    return new ScopedEventBus(this, prefix);
  }
}

/**
 * Scoped event bus that prefixes all events with a given prefix
 */
class ScopedEventBus {
  constructor(
    private parent: EventBus,
    private prefix: string
  ) {}

  private scopeEvent<K extends keyof AgentEvents>(event: K): K {
    return `${this.prefix}:${event}` as K;
  }

  on<K extends keyof AgentEvents>(event: K, handler: EventHandler<AgentEvents[K]>): void {
    this.parent.on(this.scopeEvent(event), handler);
  }

  off<K extends keyof AgentEvents>(event: K, handler: EventHandler<AgentEvents[K]>): void {
    this.parent.off(this.scopeEvent(event), handler);
  }

  emit<K extends keyof AgentEvents>(event: K, data: AgentEvents[K]): void {
    this.parent.emit(this.scopeEvent(event), data);
  }
}

/**
 * Global event bus instance (optional singleton pattern)
 */
let globalEventBus: EventBus | null = null;

/**
 * Get or create the global event bus instance
 */
export function getGlobalEventBus(options?: { debug?: boolean }): EventBus {
  if (!globalEventBus) {
    globalEventBus = new EventBus(options);
  }
  return globalEventBus;
}

/**
 * Reset the global event bus (useful for testing)
 */
export function resetGlobalEventBus(): void {
  if (globalEventBus) {
    globalEventBus.removeAllListeners();
    globalEventBus = null;
  }
}
