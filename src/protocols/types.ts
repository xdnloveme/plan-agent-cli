import { AgentType } from '../core/types';

/**
 * 消息类型枚举
 */
export enum MessageType {
  /** 任务请求 */
  TASK_REQUEST = 'task_request',
  /** 任务响应 */
  TASK_RESPONSE = 'task_response',
  /** 状态更新 */
  STATUS_UPDATE = 'status_update',
  /** 验证请求 */
  VALIDATION_REQUEST = 'validation_request',
  /** 验证响应 */
  VALIDATION_RESPONSE = 'validation_response',
  /** 修复请求 */
  REPAIR_REQUEST = 'repair_request',
  /** 修复响应 */
  REPAIR_RESPONSE = 'repair_response',
  /** 广播消息 */
  BROADCAST = 'broadcast',
  /** 错误消息 */
  ERROR = 'error',
  /** 心跳 */
  HEARTBEAT = 'heartbeat',
}

/**
 * 消息优先级
 */
export enum MessagePriority {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  URGENT = 4,
}

/**
 * A2A 消息接口
 */
export interface A2AMessage<T = unknown> {
  /** 消息 ID */
  id: string;
  /** 消息类型 */
  type: MessageType;
  /** 发送方 */
  from: AgentType;
  /** 接收方 */
  to: AgentType;
  /** 消息负载 */
  payload: T;
  /** 元数据 */
  metadata: MessageMetadata;
  /** 时间戳 */
  timestamp: Date;
}

/**
 * 消息元数据接口
 */
export interface MessageMetadata {
  /** 关联 ID（用于追踪请求-响应） */
  correlationId?: string;
  /** 优先级 */
  priority: MessagePriority;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 重试次数 */
  retryCount?: number;
  /** 是否需要确认 */
  requiresAck?: boolean;
  /** 自定义元数据 */
  custom?: Record<string, unknown>;
}

/**
 * 消息处理器类型
 */
export type MessageHandler<T = unknown, R = unknown> = (
  message: A2AMessage<T>
) => Promise<R>;

/**
 * 消息监听器配置
 */
export interface MessageListenerConfig {
  /** Agent 类型 */
  agentType: AgentType;
  /** 消息类型过滤 */
  messageTypes?: MessageType[];
  /** 处理器 */
  handler: MessageHandler;
}

/**
 * 广播结果
 */
export interface BroadcastResult<R = unknown> {
  /** 各 Agent 的响应 */
  responses: Map<AgentType, R>;
  /** 失败的 Agent */
  failures: Map<AgentType, Error>;
}
