import {
  generateText,
  streamText,
  type CoreMessage,
  type CoreTool,
  type LanguageModel,
  type GenerateTextResult,
  type StreamTextResult,
} from 'ai';
import type { GenerateOptions, GenerateResult } from '../../agents/types';

/**
 * Stream chunk from model
 */
export interface StreamChunk {
  type: 'text-delta' | 'tool-call' | 'tool-result' | 'finish';
  textDelta?: string;
  toolCall?: {
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
  };
  toolResult?: {
    toolCallId: string;
    result: unknown;
  };
  finishReason?: string;
}

/**
 * Model adapter that wraps Vercel AI SDK
 *
 * Provides a consistent interface for interacting with different
 * LLM providers through the AI SDK.
 */
export class ModelAdapter {
  private model: LanguageModel;
  private defaultSystemPrompt?: string;

  constructor(model: LanguageModel, options: { systemPrompt?: string } = {}) {
    this.model = model;
    this.defaultSystemPrompt = options.systemPrompt;
  }

  /**
   * Generate text completion
   */
  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const { messages, systemPrompt, tools, maxTokens, temperature, stopSequences } = options;

    // Prepare messages with system prompt
    const allMessages = this.prepareMessages(messages, systemPrompt);

    const result: GenerateTextResult<Record<string, CoreTool>, never> = await generateText({
      model: this.model,
      messages: allMessages,
      tools: tools as Record<string, CoreTool> | undefined,
      maxTokens,
      temperature,
      stopSequences,
    });

    return this.mapGenerateResult(result);
  }

  /**
   * Generate text completion with tool execution
   */
  async generateWithTools(
    options: GenerateOptions & {
      onToolCall?: (toolCall: { toolName: string; args: Record<string, unknown> }) => void;
      maxSteps?: number;
    }
  ): Promise<GenerateResult> {
    const { messages, systemPrompt, tools, maxTokens, temperature, onToolCall, maxSteps = 5 } = options;

    const allMessages = this.prepareMessages(messages, systemPrompt);

    const result = await generateText({
      model: this.model,
      messages: allMessages,
      tools: tools as Record<string, CoreTool> | undefined,
      maxTokens,
      temperature,
      maxSteps,
      onStepFinish: (step) => {
        if (step.toolCalls && onToolCall) {
          for (const call of step.toolCalls) {
            onToolCall({
              toolName: call.toolName,
              args: call.args as Record<string, unknown>,
            });
          }
        }
      },
    });

    return this.mapGenerateResult(result);
  }

  /**
   * Stream text completion
   */
  async *stream(options: GenerateOptions): AsyncGenerator<StreamChunk> {
    const { messages, systemPrompt, tools, maxTokens, temperature } = options;

    const allMessages = this.prepareMessages(messages, systemPrompt);

    const result: StreamTextResult<Record<string, CoreTool>, never> = streamText({
      model: this.model,
      messages: allMessages,
      tools: tools as Record<string, CoreTool> | undefined,
      maxTokens,
      temperature,
    });

    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        yield {
          type: 'text-delta',
          textDelta: part.textDelta,
        };
      } else if (part.type === 'tool-call') {
        yield {
          type: 'tool-call',
          toolCall: {
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            args: part.args as Record<string, unknown>,
          },
        };
      } else if (part.type === 'step-finish') {
        // Step finish indicates completion of a step (may include tool results)
        yield {
          type: 'finish',
          finishReason: part.finishReason,
        };
      } else if (part.type === 'finish') {
        yield {
          type: 'finish',
          finishReason: part.finishReason,
        };
      }
    }
  }

  /**
   * Get the underlying model
   */
  getModel(): LanguageModel {
    return this.model;
  }

  /**
   * Create a new adapter with different system prompt
   */
  withSystemPrompt(systemPrompt: string): ModelAdapter {
    return new ModelAdapter(this.model, { systemPrompt });
  }

  /**
   * Prepare messages with system prompt
   */
  private prepareMessages(messages: CoreMessage[], systemPrompt?: string): CoreMessage[] {
    const prompt = systemPrompt ?? this.defaultSystemPrompt;
    if (prompt) {
      return [{ role: 'system', content: prompt }, ...messages];
    }
    return messages;
  }

  /**
   * Map AI SDK result to our GenerateResult
   */
  private mapGenerateResult(result: GenerateTextResult<Record<string, CoreTool>, never>): GenerateResult {
    return {
      text: result.text,
      toolCalls: result.toolCalls?.map((call) => ({
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        args: call.args as Record<string, unknown>,
      })),
      usage: result.usage
        ? {
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            totalTokens: result.usage.totalTokens,
          }
        : undefined,
      finishReason: result.finishReason as GenerateResult['finishReason'],
    };
  }
}
