/**
 * Custom Sub-Agent Example
 *
 * This example demonstrates how to create custom sub-agents
 * with specialized behavior.
 */

import {
  SubAgent,
  type AgentDependencies,
  type AgentContext,
  type AgentResult,
  type SubAgentConfig,
  ModelFactory,
  type ProviderRegistry,
  ToolRegistry,
  Memory,
  EventBus,
  Logger,
  MainAgent,
  type MainAgentDependencies,
  TaskQueue,
} from '@ai-agent-plan/core';

/**
 * Custom code review sub-agent
 *
 * Specializes in reviewing code and providing feedback.
 */
export class CodeReviewSubAgent extends SubAgent {
  readonly specialization = 'code-review';
  readonly capabilities = ['review', 'code', 'analyze', 'refactor', 'improve'];

  private supportedLanguages: string[];

  constructor(
    dependencies: AgentDependencies,
    config: SubAgentConfig & { supportedLanguages?: string[] }
  ) {
    super(dependencies, config);
    this.supportedLanguages = config.supportedLanguages ?? [
      'typescript',
      'javascript',
      'python',
      'java',
    ];
  }

  canHandle(task: string, _context?: AgentContext): boolean {
    const taskLower = task.toLowerCase();

    // Check for code review keywords
    const reviewKeywords = ['review', 'analyze', 'check', 'improve', 'refactor'];
    const hasReviewKeyword = reviewKeywords.some((kw) => taskLower.includes(kw));

    // Check for code-related keywords
    const codeKeywords = ['code', 'function', 'class', 'method', ...this.supportedLanguages];
    const hasCodeKeyword = codeKeywords.some((kw) => taskLower.includes(kw));

    return hasReviewKeyword && hasCodeKeyword;
  }

  getCapabilityScore(task: string, context?: AgentContext): number {
    let score = super.getCapabilityScore(task, context);
    const taskLower = task.toLowerCase();

    // Boost score for specific language mentions
    for (const lang of this.supportedLanguages) {
      if (taskLower.includes(lang)) {
        score += 15;
      }
    }

    // Boost for specific review-related terms
    if (taskLower.includes('security')) score += 10;
    if (taskLower.includes('performance')) score += 10;
    if (taskLower.includes('best practices')) score += 10;

    return Math.min(100, score);
  }

  async execute(task: string, context?: AgentContext): Promise<AgentResult> {
    const ctx = this.createContext(context);
    const taskId = this.generateTaskId();

    this.emitTaskStart(taskId, task);
    this.logger?.info(`CodeReviewSubAgent executing`, { taskId, task });

    try {
      // Check depth
      if (this.isMaxDepthExceeded(ctx)) {
        return {
          success: false,
          content: 'Maximum depth exceeded',
          error: new Error('Max depth exceeded'),
        };
      }

      // Add specialized system prompt for code review
      const systemPrompt = `You are an expert code reviewer specializing in ${this.supportedLanguages.join(', ')}.
Your responsibilities include:
1. Identifying bugs and potential issues
2. Suggesting performance improvements
3. Checking for security vulnerabilities
4. Recommending best practices
5. Improving code readability and maintainability

Provide structured, actionable feedback.`;

      // Add task to memory
      this.addToMemory(ctx.conversationId, 'user', task);

      // Get history
      const history = this.memory.getRecentMessages(ctx.conversationId);
      const messages = this.toCoreMessages(history);

      // Generate review
      const result = await this.generate(messages, { systemPrompt });

      if (result.success) {
        this.addToMemory(ctx.conversationId, 'assistant', result.content);
      }

      this.emitTaskComplete(taskId, result);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emitTaskError(taskId, err);
      return { success: false, content: '', error: err };
    }
  }
}

/**
 * Custom translation sub-agent
 */
export class TranslationSubAgent extends SubAgent {
  readonly specialization = 'translation';
  readonly capabilities = ['translate', 'language', 'localize'];

  private supportedPairs: Array<{ from: string; to: string }>;

  constructor(
    dependencies: AgentDependencies,
    config: SubAgentConfig & {
      supportedPairs?: Array<{ from: string; to: string }>;
    }
  ) {
    super(dependencies, config);
    this.supportedPairs = config.supportedPairs ?? [
      { from: 'english', to: 'chinese' },
      { from: 'chinese', to: 'english' },
      { from: 'english', to: 'spanish' },
      { from: 'spanish', to: 'english' },
    ];
  }

  canHandle(task: string, _context?: AgentContext): boolean {
    const taskLower = task.toLowerCase();

    // Check for translation keywords
    const keywords = ['translate', 'translation', 'convert to', 'in chinese', 'in english'];
    return keywords.some((kw) => taskLower.includes(kw));
  }

  async execute(task: string, context?: AgentContext): Promise<AgentResult> {
    const ctx = this.createContext(context);
    const taskId = this.generateTaskId();

    this.emitTaskStart(taskId, task);

    try {
      if (this.isMaxDepthExceeded(ctx)) {
        return {
          success: false,
          content: 'Maximum depth exceeded',
          error: new Error('Max depth exceeded'),
        };
      }

      const supportedLanguages = [
        ...new Set(this.supportedPairs.flatMap((p) => [p.from, p.to])),
      ].join(', ');

      const systemPrompt = `You are a professional translator. 
Supported languages: ${supportedLanguages}
Provide accurate, natural-sounding translations while preserving the original meaning and tone.`;

      this.addToMemory(ctx.conversationId, 'user', task);
      const history = this.memory.getRecentMessages(ctx.conversationId);
      const messages = this.toCoreMessages(history);

      const result = await this.generate(messages, { systemPrompt });

      if (result.success) {
        this.addToMemory(ctx.conversationId, 'assistant', result.content);
      }

      this.emitTaskComplete(taskId, result);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emitTaskError(taskId, err);
      return { success: false, content: '', error: err };
    }
  }
}

/**
 * Create custom sub-agents with given dependencies
 */
export function createCustomSubAgents(dependencies: AgentDependencies) {
  const codeReviewer = new CodeReviewSubAgent(dependencies, {
    id: 'code-reviewer',
    name: 'Code Reviewer',
    model: dependencies.model.getModel() as never, // Use parent's model
    specialization: 'code-review',
    capabilities: ['review', 'code', 'analyze'],
    priority: 8,
    supportedLanguages: ['typescript', 'javascript', 'python'],
  });

  const translator = new TranslationSubAgent(dependencies, {
    id: 'translator',
    name: 'Translator',
    model: dependencies.model.getModel() as never,
    specialization: 'translation',
    capabilities: ['translate', 'language'],
    priority: 7,
    supportedPairs: [
      { from: 'english', to: 'chinese' },
      { from: 'chinese', to: 'english' },
    ],
  });

  return { codeReviewer, translator };
}

/**
 * Example: Complete setup with provider registration
 */
export async function exampleUsage() {
  const logger = new Logger({
    level: 'info',
    context: 'CustomSubAgentExample',
  });

  try {
    // Register model providers (following Dependency Inversion Principle)
    logger.info('Registering model providers...');
    try {
      const { createOpenAI } = await import('@ai-sdk/openai');
      const { createAnthropic } = await import('@ai-sdk/anthropic');
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
      const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');

      const registry: Partial<ProviderRegistry> = {
        openai: { provider: createOpenAI },
        anthropic: { provider: createAnthropic },
        google: { provider: createGoogleGenerativeAI },
        custom: { provider: createOpenAICompatible },
      };

      ModelFactory.registerProviders(registry);
      logger.info('Model providers registered successfully');
    } catch (error) {
      logger.warn('Some providers failed to load', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue with available providers
    }

    // Create model adapter
    const modelAdapter = ModelFactory.create({
      provider: 'openai',
      name: 'gpt-4',
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Create dependencies
    const tools = new ToolRegistry();
    const memory = new Memory({ maxMessages: 50 });
    const eventBus = new EventBus();
    const taskQueue = new TaskQueue({ maxConcurrent: 3 });

    const dependencies: AgentDependencies = {
      model: modelAdapter,
      tools,
      memory,
      eventBus,
      logger,
    };

    // Create custom sub-agents
    const { codeReviewer, translator } = createCustomSubAgents(dependencies);

    // Create main agent with custom sub-agents
    const mainAgentDependencies: MainAgentDependencies = {
      ...dependencies,
      taskQueue,
    };

    const mainAgent = new MainAgent(mainAgentDependencies, {
      id: 'main-agent',
      name: 'Main Agent',
      model: {
        provider: 'openai',
        name: 'gpt-4',
      },
      systemPrompt: 'You are a helpful assistant with specialized sub-agents.',
    });

    // Add custom sub-agents to main agent
    // Note: This would require extending MainAgent to support external sub-agents
    // For now, this demonstrates the setup pattern

    logger.info('Custom sub-agents created successfully');
    return { mainAgent, codeReviewer, translator };
  } catch (error) {
    logger.error('Example failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// Run example if executed directly
if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  exampleUsage().catch(console.error);
}
