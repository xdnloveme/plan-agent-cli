/**
 * Multi-Agent Collaboration Example
 *
 * This example demonstrates how to set up a multi-agent system
 * with specialized sub-agents working together.
 */

import { MainAgent, type MainAgentDependencies } from '../agents/MainAgent';
import { ModelFactory } from '../core/model/ModelFactory';
import { ToolRegistry } from '../core/tools/ToolRegistry';
import { Memory } from '../core/memory/Memory';
import { EventBus } from '../utils/event-bus';
import { TaskQueue } from '../utils/task-queue';
import { Logger } from '../utils/logger';
import { registerBuiltinTools } from '../core/tools/builtin';
import type { Config } from '../config/schema';

/**
 * Example configuration
 */
const exampleConfig: Config = {
  id: 'main-research-agent',
  name: 'Research Assistant',
  model: {
    provider: 'openai',
    name: 'gpt-4-turbo',
    // apiKey will be read from OPENAI_API_KEY env var
  },
  systemPrompt: `You are a helpful research assistant. You can search the web, 
perform calculations, and manage files. When given a research task, 
break it down into smaller steps and use the appropriate tools.`,
  subAgents: [
    {
      id: 'search-agent',
      name: 'Search Specialist',
      specialization: 'web-search',
      capabilities: ['search', 'find', 'lookup', 'research'],
      priority: 8,
      enabled: true,
      systemPrompt: 'You are a search specialist. Use web search to find information.',
    },
    {
      id: 'calculator-agent',
      name: 'Calculator',
      specialization: 'calculation',
      capabilities: ['calculate', 'compute', 'math', 'arithmetic'],
      priority: 7,
      enabled: true,
      systemPrompt: 'You are a calculator. Perform mathematical calculations.',
    },
    {
      id: 'file-agent',
      name: 'File Manager',
      specialization: 'file-operations',
      capabilities: ['read', 'write', 'file', 'save', 'load'],
      priority: 6,
      enabled: true,
      systemPrompt: 'You are a file manager. Handle file operations safely.',
    },
  ],
  coordination: {
    maxConcurrent: 3,
    timeout: 30000,
    retryAttempts: 2,
    selectionStrategy: 'capability-match',
  },
  maxDepth: 3,
  debug: true,
};

/**
 * Setup and run the multi-agent example
 */
async function main() {
  // Create logger
  const logger = new Logger({
    level: 'debug',
    context: 'MultiAgentExample',
    colors: true,
  });

  logger.info('Starting multi-agent example');

  try {
    // Create model adapter
    logger.info('Creating model adapter...');
    const modelAdapter = await ModelFactory.create(exampleConfig.model);

    // Create tool registry with built-in tools
    logger.info('Setting up tools...');
    const tools = new ToolRegistry();
    registerBuiltinTools(tools, {
      calculator: true,
      webSearch: true,
      fileSystem: { basePath: process.cwd() },
    });

    // Create memory
    const memory = new Memory({ maxMessages: 50, maxTokens: 4000 });

    // Create event bus
    const eventBus = new EventBus({ debug: true });

    // Create task queue
    const taskQueue = new TaskQueue({
      maxConcurrent: exampleConfig.coordination.maxConcurrent,
      defaultTimeout: exampleConfig.coordination.timeout,
      debug: true,
    });

    // Subscribe to events for logging
    eventBus.on('task:start', (data) => {
      logger.info('Task started', data);
    });

    eventBus.on('task:complete', (data) => {
      logger.info('Task completed', { taskId: data.taskId, success: data.result.success });
    });

    eventBus.on('subagent:selected', (data) => {
      logger.info('Sub-agent selected', data);
    });

    eventBus.on('tool:call', (data) => {
      logger.info('Tool called', { toolName: data.toolName, agentId: data.agentId });
    });

    // Create main agent
    logger.info('Creating main agent...');
    const dependencies: MainAgentDependencies = {
      model: modelAdapter,
      tools,
      memory,
      eventBus,
      taskQueue,
      logger,
    };

    const agent = new MainAgent(dependencies, {
      id: exampleConfig.id,
      name: exampleConfig.name,
      model: exampleConfig.model,
      systemPrompt: exampleConfig.systemPrompt,
      maxConcurrent: exampleConfig.coordination.maxConcurrent,
      timeout: exampleConfig.coordination.timeout,
      retryAttempts: exampleConfig.coordination.retryAttempts,
      maxDepth: exampleConfig.maxDepth,
    });

    // Create sub-agents
    for (const subConfig of exampleConfig.subAgents) {
      agent.createSubAgent({
        ...subConfig,
        model: exampleConfig.model,
        keywords: subConfig.capabilities,
      });
    }

    logger.info('Agent setup complete', agent.getStats());

    // Example tasks
    const tasks = [
      'Calculate the square root of 144 plus 25',
      'Search for information about TypeScript best practices',
      'What is 15% of 250?',
    ];

    // Execute tasks
    logger.info('Executing example tasks...');

    for (const task of tasks) {
      logger.info(`\n--- Executing: "${task}" ---`);
      const result = await agent.execute(task);

      if (result.success) {
        logger.info('Result:', { content: result.content.slice(0, 200) });
      } else {
        logger.error('Failed:', { error: result.error?.message });
      }
    }

    // Chat example
    logger.info('\n--- Chat Example ---');
    const chatResponse = await agent.chat('Hello! Can you help me calculate 100 * 1.15?');
    logger.info('Chat response:', { response: chatResponse });

    // Parallel execution example
    logger.info('\n--- Parallel Execution Example ---');
    const parallelResults = await agent.executeParallel([
      'Calculate 50 + 50',
      'What is sqrt(256)?',
    ]);

    for (const [i, result] of parallelResults.entries()) {
      logger.info(`Parallel result ${i + 1}:`, {
        success: result.success,
        content: result.content.slice(0, 100),
      });
    }

    logger.info('Multi-agent example completed successfully!');
  } catch (error) {
    logger.error('Example failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// Run if executed directly
// eslint-disable-next-line @typescript-eslint/no-floating-promises
main().catch(console.error);

export { main, exampleConfig };
