import { v4 as uuidv4 } from 'uuid';
import { AgentType } from '../core/types';
import {
  A2AMessage,
  MessageType,
  MessagePriority,
  MessageHandler,
  MessageListenerConfig,
  BroadcastResult,
  MessageMetadata,
} from './types';
import { createLogger } from '../utils/logger';

const logger = createLogger('A2AProtocol');

/**
 * A2A 协议实现
 * 单例模式，负责 Agent 间的通信
 */
export class A2AProtocol {
  private static instance: A2AProtocol;

  /** 消息监听器 */
  private listeners: Map<AgentType, MessageListenerConfig[]> = new Map();
  /** 待处理消息队列 */
  private messageQueue: A2AMessage[] = [];
  /** 消息历史 */
  private messageHistory: A2AMessage[] = [];
  /** 最大历史记录数 */
  private maxHistorySize = 1000;

  private constructor() {
    // 初始化各 Agent 类型的监听器列表
    Object.values(AgentType).forEach((type) => {
      this.listeners.set(type, []);
    });
  }

  /**
   * 获取单例实例
   */
  static getInstance(): A2AProtocol {
    if (!A2AProtocol.instance) {
      A2AProtocol.instance = new A2AProtocol();
    }
    return A2AProtocol.instance;
  }

  /**
   * 重置单例（主要用于测试）
   */
  static resetInstance(): void {
    A2AProtocol.instance = new A2AProtocol();
  }

  /**
   * 注册消息监听器
   */
  registerListener(config: MessageListenerConfig): void {
    const listeners = this.listeners.get(config.agentType) || [];
    listeners.push(config);
    this.listeners.set(config.agentType, listeners);
    logger.debug(`Registered listener for ${config.agentType}`);
  }

  /**
   * 移除消息监听器
   */
  removeListener(agentType: AgentType, handler: MessageHandler): void {
    const listeners = this.listeners.get(agentType) || [];
    const filtered = listeners.filter((l) => l.handler !== handler);
    this.listeners.set(agentType, filtered);
    logger.debug(`Removed listener for ${agentType}`);
  }

  /**
   * 发送消息
   */
  async send<T, R>(
    from: AgentType,
    to: AgentType,
    type: MessageType,
    payload: T,
    metadata?: Partial<MessageMetadata>
  ): Promise<R | undefined> {
    const message = this.createMessage(from, to, type, payload, metadata);

    logger.debug(`Sending message from ${from} to ${to}`, { type, id: message.id });

    // 添加到历史记录
    this.addToHistory(message);

    // 获取目标 Agent 的监听器
    const listeners = this.listeners.get(to) || [];

    for (const listener of listeners) {
      // 检查消息类型过滤
      if (
        listener.messageTypes &&
        listener.messageTypes.length > 0 &&
        !listener.messageTypes.includes(type)
      ) {
        continue;
      }

      try {
        const response = await listener.handler(message);
        return response as R;
      } catch (error) {
        logger.error(`Error handling message in ${to}`, error);
        throw error;
      }
    }

    logger.warn(`No handler found for message to ${to}`);
    return undefined;
  }

  /**
   * 广播消息到所有 Agent
   */
  async broadcast<T, R>(
    from: AgentType,
    type: MessageType,
    payload: T,
    exclude?: AgentType[]
  ): Promise<BroadcastResult<R>> {
    const responses = new Map<AgentType, R>();
    const failures = new Map<AgentType, Error>();
    const excludeSet = new Set(exclude || []);

    logger.info(`Broadcasting message from ${from}`, { type });

    const promises = Object.values(AgentType)
      .filter((agentType) => agentType !== from && !excludeSet.has(agentType))
      .map(async (agentType) => {
        try {
          const response = await this.send<T, R>(
            from,
            agentType,
            type,
            payload
          );
          if (response !== undefined) {
            responses.set(agentType, response);
          }
        } catch (error) {
          failures.set(agentType, error as Error);
        }
      });

    await Promise.all(promises);

    return { responses, failures };
  }

  /**
   * 发送带超时的消息
   */
  async sendWithTimeout<T, R>(
    from: AgentType,
    to: AgentType,
    type: MessageType,
    payload: T,
    timeoutMs: number,
    metadata?: Partial<MessageMetadata>
  ): Promise<R> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Message timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      this.send<T, R>(from, to, type, payload, {
        ...metadata,
        timeout: timeoutMs,
      })
        .then((result) => {
          clearTimeout(timer);
          if (result !== undefined) {
            resolve(result);
          } else {
            reject(new Error('No response received'));
          }
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * 创建消息对象
   */
  private createMessage<T>(
    from: AgentType,
    to: AgentType,
    type: MessageType,
    payload: T,
    metadata?: Partial<MessageMetadata>
  ): A2AMessage<T> {
    return {
      id: uuidv4(),
      type,
      from,
      to,
      payload,
      metadata: {
        priority: MessagePriority.NORMAL,
        ...metadata,
      },
      timestamp: new Date(),
    };
  }

  /**
   * 添加消息到历史记录
   */
  private addToHistory<T>(message: A2AMessage<T>): void {
    this.messageHistory.push(message as A2AMessage);

    // 限制历史记录大小
    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory = this.messageHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * 获取消息历史
   */
  getMessageHistory(filter?: {
    from?: AgentType;
    to?: AgentType;
    type?: MessageType;
    limit?: number;
  }): A2AMessage[] {
    let history = [...this.messageHistory];

    if (filter) {
      if (filter.from) {
        history = history.filter((m) => m.from === filter.from);
      }
      if (filter.to) {
        history = history.filter((m) => m.to === filter.to);
      }
      if (filter.type) {
        history = history.filter((m) => m.type === filter.type);
      }
      if (filter.limit) {
        history = history.slice(-filter.limit);
      }
    }

    return history;
  }

  /**
   * 清除消息历史
   */
  clearHistory(): void {
    this.messageHistory = [];
    logger.info('Message history cleared');
  }

  /**
   * 添加消息到队列
   */
  enqueue<T>(message: A2AMessage<T>): void {
    this.messageQueue.push(message as A2AMessage);
  }

  /**
   * 从队列取出消息
   */
  dequeue(): A2AMessage | undefined {
    return this.messageQueue.shift();
  }

  /**
   * 获取队列长度
   */
  getQueueLength(): number {
    return this.messageQueue.length;
  }
}

/**
 * 获取 A2A 协议实例的便捷函数
 */
export function getA2AProtocol(): A2AProtocol {
  return A2AProtocol.getInstance();
}
