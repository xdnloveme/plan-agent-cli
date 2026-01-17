import { describe, it, expect, beforeEach } from 'vitest';
import { Memory } from '../../../src/core/memory/Memory.js';
import type { Message } from '../../../src/agents/types.js';

describe('Memory', () => {
  let memory: Memory;

  beforeEach(() => {
    memory = new Memory({ maxMessages: 10, maxTokens: 1000 });
  });

  describe('conversation management', () => {
    it('should create conversation on first access', () => {
      const conversation = memory.getConversation('test-conv');
      expect(conversation).toBeDefined();
      expect(conversation.messages).toHaveLength(0);
    });

    it('should add messages to conversation', () => {
      const message: Message = {
        role: 'user',
        content: 'Hello',
        timestamp: new Date(),
      };

      memory.addMessage('conv-1', message);
      const history = memory.getHistory('conv-1');

      expect(history).toHaveLength(1);
      expect(history[0].content).toBe('Hello');
    });

    it('should add multiple messages', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello', timestamp: new Date() },
        { role: 'assistant', content: 'Hi there!', timestamp: new Date() },
      ];

      memory.addMessages('conv-1', messages);
      const history = memory.getHistory('conv-1');

      expect(history).toHaveLength(2);
    });

    it('should return empty array for non-existent conversation', () => {
      const history = memory.getHistory('non-existent');
      expect(history).toHaveLength(0);
    });

    it('should clear conversation history', () => {
      memory.addMessage('conv-1', { role: 'user', content: 'Test', timestamp: new Date() });
      memory.clearHistory('conv-1');

      expect(memory.getHistory('conv-1')).toHaveLength(0);
    });

    it('should delete conversation', () => {
      memory.addMessage('conv-1', { role: 'user', content: 'Test', timestamp: new Date() });
      const deleted = memory.deleteConversation('conv-1');

      expect(deleted).toBe(true);
      expect(memory.getConversationIds()).not.toContain('conv-1');
    });
  });

  describe('sliding window', () => {
    it('should limit messages by count', () => {
      const memory = new Memory({ maxMessages: 3, maxTokens: 10000 });

      for (let i = 0; i < 5; i++) {
        memory.addMessage('conv-1', {
          role: 'user',
          content: `Message ${i}`,
          timestamp: new Date(),
        });
      }

      const history = memory.getHistory('conv-1');
      expect(history).toHaveLength(3);
      expect(history[0].content).toBe('Message 2');
    });

    it('should limit messages by token estimate', () => {
      const memory = new Memory({ maxMessages: 100, maxTokens: 50, tokensPerChar: 1 });

      // Add messages that would exceed token limit
      memory.addMessage('conv-1', {
        role: 'user',
        content: 'A'.repeat(30),
        timestamp: new Date(),
      });

      memory.addMessage('conv-1', {
        role: 'user',
        content: 'B'.repeat(30),
        timestamp: new Date(),
      });

      const history = memory.getHistory('conv-1');
      // Should have removed oldest to stay under limit
      expect(history.length).toBeLessThanOrEqual(2);
    });
  });

  describe('recent messages', () => {
    it('should get recent messages within token limit', () => {
      const memory = new Memory({ maxTokens: 10000, tokensPerChar: 1 });

      for (let i = 0; i < 10; i++) {
        memory.addMessage('conv-1', {
          role: 'user',
          content: `Message ${i}`,
          timestamp: new Date(),
        });
      }

      const recent = memory.getRecentMessages('conv-1', 30);
      const totalChars = recent.reduce((sum, m) => sum + m.content.length, 0);

      expect(totalChars).toBeLessThanOrEqual(30);
    });
  });

  describe('variables', () => {
    it('should set and get variables', () => {
      memory.setVariable('key1', 'value1');
      memory.setVariable('key2', { nested: true });

      expect(memory.getVariable('key1')).toBe('value1');
      expect(memory.getVariable('key2')).toEqual({ nested: true });
    });

    it('should return undefined for non-existent variables', () => {
      expect(memory.getVariable('non-existent')).toBeUndefined();
    });

    it('should delete variables', () => {
      memory.setVariable('key', 'value');
      const deleted = memory.deleteVariable('key');

      expect(deleted).toBe(true);
      expect(memory.getVariable('key')).toBeUndefined();
    });

    it('should get all variables', () => {
      memory.setVariable('a', 1);
      memory.setVariable('b', 2);

      const all = memory.getAllVariables();
      expect(all.size).toBe(2);
      expect(all.get('a')).toBe(1);
    });

    it('should clear all variables', () => {
      memory.setVariable('a', 1);
      memory.setVariable('b', 2);
      memory.clearVariables();

      expect(memory.getAllVariables().size).toBe(0);
    });
  });

  describe('metadata', () => {
    it('should set and get conversation metadata', () => {
      memory.setMetadata('conv-1', 'topic', 'testing');
      expect(memory.getMetadata('conv-1', 'topic')).toBe('testing');
    });
  });

  describe('export/import', () => {
    it('should export conversation as JSON', () => {
      memory.addMessage('conv-1', { role: 'user', content: 'Hello', timestamp: new Date() });
      memory.setMetadata('conv-1', 'topic', 'greeting');

      const exported = memory.exportConversation('conv-1');
      expect(exported).toBeDefined();

      const parsed = JSON.parse(exported!);
      expect(parsed.conversationId).toBe('conv-1');
      expect(parsed.messages).toHaveLength(1);
      expect(parsed.metadata.topic).toBe('greeting');
    });

    it('should import conversation from JSON', () => {
      const json = JSON.stringify({
        messages: [{ role: 'user', content: 'Imported', timestamp: new Date().toISOString() }],
        metadata: { source: 'import' },
      });

      memory.importConversation('imported-conv', json);
      const history = memory.getHistory('imported-conv');

      expect(history).toHaveLength(1);
      expect(history[0].content).toBe('Imported');
    });
  });

  describe('statistics', () => {
    it('should return correct stats', () => {
      memory.addMessage('conv-1', { role: 'user', content: 'Hello', timestamp: new Date() });
      memory.addMessage('conv-2', { role: 'user', content: 'World', timestamp: new Date() });
      memory.setVariable('key', 'value');

      const stats = memory.getStats();

      expect(stats.conversationCount).toBe(2);
      expect(stats.totalMessages).toBe(2);
      expect(stats.variableCount).toBe(1);
    });
  });

  describe('clear all', () => {
    it('should clear all data', () => {
      memory.addMessage('conv-1', { role: 'user', content: 'Test', timestamp: new Date() });
      memory.setVariable('key', 'value');
      memory.clear();

      const stats = memory.getStats();
      expect(stats.conversationCount).toBe(0);
      expect(stats.variableCount).toBe(0);
    });
  });
});
