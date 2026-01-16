import { z } from 'zod';
import type { CoreTool } from 'ai';

/**
 * Tool execution context
 */
export interface ToolContext {
  /** Agent ID that is calling the tool */
  agentId: string;
  /** Conversation ID */
  conversationId?: string;
  /** Additional context data */
  data?: Record<string, unknown>;
}

/**
 * Tool execution result
 */
export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Base class for all tools
 *
 * Provides a consistent interface for tool definition and execution.
 * Tools are the primary way agents interact with external systems.
 */
export abstract class BaseTool<
  TInput extends z.ZodType = z.ZodType,
  TOutput = unknown,
> {
  /** Unique tool name */
  abstract readonly name: string;

  /** Human-readable description */
  abstract readonly description: string;

  /** Zod schema for input validation */
  abstract readonly inputSchema: TInput;

  /**
   * Execute the tool with validated input
   */
  abstract execute(
    input: z.infer<TInput>,
    context?: ToolContext
  ): Promise<ToolResult<TOutput>>;

  /**
   * Convert to AI SDK CoreTool format
   */
  toCoreTool(): CoreTool {
    return {
      description: this.description,
      parameters: this.inputSchema,
      execute: async (args: z.infer<TInput>) => {
        const result = await this.execute(args);
        if (result.success) {
          return result.data;
        }
        throw new Error(result.error ?? 'Tool execution failed');
      },
    };
  }

  /**
   * Validate input against schema
   */
  validateInput(input: unknown): { success: true; data: z.infer<TInput> } | { success: false; error: z.ZodError } {
    const result = this.inputSchema.safeParse(input);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { success: false, error: result.error };
  }

  /**
   * Get JSON schema representation of input
   */
  getInputJsonSchema(): Record<string, unknown> {
    // Simple conversion - in production you might use zod-to-json-schema
    return {
      type: 'object',
      description: this.description,
    };
  }
}

/**
 * Helper to create a simple tool from a function
 */
export function createTool<TInput extends z.ZodType, TOutput>(config: {
  name: string;
  description: string;
  inputSchema: TInput;
  execute: (input: z.infer<TInput>, context?: ToolContext) => Promise<TOutput>;
}): BaseTool<TInput, TOutput> {
  return new (class extends BaseTool<TInput, TOutput> {
    readonly name = config.name;
    readonly description = config.description;
    readonly inputSchema = config.inputSchema;

    async execute(input: z.infer<TInput>, context?: ToolContext): Promise<ToolResult<TOutput>> {
      try {
        const data = await config.execute(input, context);
        return { success: true, data };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  })();
}
