import type { Message } from '../../agents/types';

/**
 * Memory options
 */
export interface MemoryOptions {
  /** Maximum number of messages to keep in history */
  maxMessages?: number;
  /** Maximum total tokens to estimate for context window */
  maxTokens?: number;
  /** Average tokens per character for estimation */
  tokensPerChar?: number;
}

/**
 * Conversation entry
 */
interface ConversationEntry {
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
}

/**
 * Memory system for managing conversation history and context
 *
 * Provides sliding window management for keeping conversation
 * history within context limits.
 */
export class Memory {
  private conversations = new Map<string, ConversationEntry>();
  private variables = new Map<string, unknown>();
  private maxMessages: number;
  private maxTokens: number;
  private tokensPerChar: number;

  constructor(options: MemoryOptions = {}) {
    this.maxMessages = options.maxMessages ?? 100;
    this.maxTokens = options.maxTokens ?? 8000;
    this.tokensPerChar = options.tokensPerChar ?? 0.25; // Rough estimate
  }

  /**
   * Get or create a conversation
   */
  getConversation(conversationId: string): ConversationEntry {
    let entry = this.conversations.get(conversationId);
    if (!entry) {
      entry = {
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {},
      };
      this.conversations.set(conversationId, entry);
    }
    return entry;
  }

  /**
   * Add a message to conversation history
   */
  addMessage(conversationId: string, message: Message): void {
    const entry = this.getConversation(conversationId);
    entry.messages.push(message);
    entry.updatedAt = new Date();

    // Apply sliding window if needed
    this.applySlidingWindow(entry);
  }

  /**
   * Add multiple messages to conversation history
   */
  addMessages(conversationId: string, messages: Message[]): void {
    const entry = this.getConversation(conversationId);
    entry.messages.push(...messages);
    entry.updatedAt = new Date();

    // Apply sliding window if needed
    this.applySlidingWindow(entry);
  }

  /**
   * Get conversation history
   */
  getHistory(conversationId: string): Message[] {
    const entry = this.conversations.get(conversationId);
    return entry ? [...entry.messages] : [];
  }

  /**
   * Get recent messages within token limit
   */
  getRecentMessages(conversationId: string, tokenLimit?: number): Message[] {
    const entry = this.conversations.get(conversationId);
    if (!entry) return [];

    const limit = tokenLimit ?? this.maxTokens;
    const messages: Message[] = [];
    let totalTokens = 0;

    // Start from most recent and work backwards
    for (let i = entry.messages.length - 1; i >= 0; i--) {
      const msg = entry.messages[i];
      const tokens = this.estimateTokens(msg.content);

      if (totalTokens + tokens > limit) {
        break;
      }

      messages.unshift(msg);
      totalTokens += tokens;
    }

    return messages;
  }

  /**
   * Clear conversation history
   */
  clearHistory(conversationId: string): void {
    const entry = this.conversations.get(conversationId);
    if (entry) {
      entry.messages = [];
      entry.updatedAt = new Date();
    }
  }

  /**
   * Delete a conversation
   */
  deleteConversation(conversationId: string): boolean {
    return this.conversations.delete(conversationId);
  }

  /**
   * Get all conversation IDs
   */
  getConversationIds(): string[] {
    return Array.from(this.conversations.keys());
  }

  /**
   * Set conversation metadata
   */
  setMetadata(conversationId: string, key: string, value: unknown): void {
    const entry = this.getConversation(conversationId);
    entry.metadata[key] = value;
    entry.updatedAt = new Date();
  }

  /**
   * Get conversation metadata
   */
  getMetadata(conversationId: string, key: string): unknown {
    const entry = this.conversations.get(conversationId);
    return entry?.metadata[key];
  }

  /**
   * Set a global variable
   */
  setVariable(key: string, value: unknown): void {
    this.variables.set(key, value);
  }

  /**
   * Get a global variable
   */
  getVariable<T = unknown>(key: string): T | undefined {
    return this.variables.get(key) as T | undefined;
  }

  /**
   * Delete a global variable
   */
  deleteVariable(key: string): boolean {
    return this.variables.delete(key);
  }

  /**
   * Get all variables
   */
  getAllVariables(): Map<string, unknown> {
    return new Map(this.variables);
  }

  /**
   * Clear all variables
   */
  clearVariables(): void {
    this.variables.clear();
  }

  /**
   * Estimate token count for a string
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length * this.tokensPerChar);
  }

  /**
   * Get total estimated tokens for a conversation
   */
  getConversationTokens(conversationId: string): number {
    const entry = this.conversations.get(conversationId);
    if (!entry) return 0;

    return entry.messages.reduce((sum, msg) => sum + this.estimateTokens(msg.content), 0);
  }

  /**
   * Apply sliding window to keep messages within limits
   */
  private applySlidingWindow(entry: ConversationEntry): void {
    // Remove oldest messages if over count limit
    while (entry.messages.length > this.maxMessages) {
      entry.messages.shift();
    }

    // Remove oldest messages if over token limit
    let totalTokens = entry.messages.reduce(
      (sum, msg) => sum + this.estimateTokens(msg.content),
      0
    );

    while (totalTokens > this.maxTokens && entry.messages.length > 1) {
      const removed = entry.messages.shift();
      if (removed) {
        totalTokens -= this.estimateTokens(removed.content);
      }
    }
  }

  /**
   * Get memory statistics
   */
  getStats(): {
    conversationCount: number;
    totalMessages: number;
    totalEstimatedTokens: number;
    variableCount: number;
  } {
    let totalMessages = 0;
    let totalTokens = 0;

    for (const entry of this.conversations.values()) {
      totalMessages += entry.messages.length;
      totalTokens += entry.messages.reduce((sum, msg) => sum + this.estimateTokens(msg.content), 0);
    }

    return {
      conversationCount: this.conversations.size,
      totalMessages,
      totalEstimatedTokens: totalTokens,
      variableCount: this.variables.size,
    };
  }

  /**
   * Export conversation as JSON
   */
  exportConversation(conversationId: string): string | null {
    const entry = this.conversations.get(conversationId);
    if (!entry) return null;

    return JSON.stringify({
      conversationId,
      messages: entry.messages,
      metadata: entry.metadata,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    });
  }

  /**
   * Import conversation from JSON
   */
  importConversation(conversationId: string, json: string): void {
    const data = JSON.parse(json) as {
      messages: Message[];
      metadata?: Record<string, unknown>;
    };

    const entry = this.getConversation(conversationId);
    entry.messages = data.messages.map((msg) => ({
      ...msg,
      timestamp: new Date(msg.timestamp),
    }));
    entry.metadata = data.metadata ?? {};
    entry.updatedAt = new Date();

    this.applySlidingWindow(entry);
  }

  /**
   * Clear all memory
   */
  clear(): void {
    this.conversations.clear();
    this.variables.clear();
  }
}

/**
 * Create a memory instance with default options
 */
export function createMemory(options?: MemoryOptions): Memory {
  return new Memory(options);
}
