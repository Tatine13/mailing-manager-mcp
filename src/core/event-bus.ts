import { EventEmitter } from 'events';
import { EventMap } from './types.js';
import { getLogger } from '../utils/logger.js';

type EventKey = keyof EventMap;

export class EventBus {
  private emitter: EventEmitter;
  private logger = getLogger();

  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(100);
  }

  emit<K extends EventKey>(event: K, data: EventMap[K]): void {
    this.logger.debug({ event, data }, 'Event emitted');
    this.emitter.emit(event, data);
  }

  on<K extends EventKey>(event: K, handler: (data: EventMap[K]) => void): void {
    this.emitter.on(event, handler);
  }

  once<K extends EventKey>(event: K, handler: (data: EventMap[K]) => void): void {
    this.emitter.once(event, handler);
  }

  off<K extends EventKey>(event: K, handler: (data: EventMap[K]) => void): void {
    this.emitter.off(event, handler);
  }

  removeAllListeners(event?: EventKey): void {
    if (event) {
      this.emitter.removeAllListeners(event);
    } else {
      this.emitter.removeAllListeners();
    }
  }
}

// Singleton
let eventBusInstance: EventBus | null = null;

export function getEventBus(): EventBus {
  if (!eventBusInstance) {
    eventBusInstance = new EventBus();
  }
  return eventBusInstance;
}
