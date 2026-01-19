// 前置加载环境变量
import '../../config/env';

import type { LanguageModel } from 'ai';
import type { ModelConfig } from '../../agents/types';
import { ModelAdapter } from './ModelAdapter';

// 这些包是 peer dependencies，可能未安装，使用条件类型导入
type AnthropicModule = typeof import('@ai-sdk/anthropic');
type OpenaiModule = typeof import('@ai-sdk/openai');
type GoogleModule = typeof import('@ai-sdk/google');
// @ai-sdk/openai-compatible 可能没有类型定义，使用更灵活的类型
type OpenAICompatibleModule = {
  createOpenAICompatible?: (config: { baseURL: string; apiKey?: string; name?: string }) => {
    (modelId: string): LanguageModel;
  };
} & Record<string, unknown>;

/**
 * Error thrown when a model provider is not available
 */
export class ProviderNotAvailableError extends Error {
  constructor(provider: string) {
    super(
      `Model provider "${provider}" is not available. ` +
      `Please install the corresponding package: @ai-sdk/${provider}`
    );
    this.name = 'ProviderNotAvailableError';
  }
}

/**
 * Error thrown when model configuration is invalid
 */
export class InvalidModelConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidModelConfigError';
  }
}

/**
 * Provider module cache
 */
const providerCache = new Map<string, unknown>();

/**
 * Model factory that creates ModelAdapter instances based on configuration
 *
 * Supports dynamic loading of AI SDK provider packages, allowing users
 * to only install the providers they need.
 */
export class ModelFactory {
  /**
   * Create a ModelAdapter from configuration
   */
  static async create(config: ModelConfig): Promise<ModelAdapter> {
    const model = await this.createLanguageModel(config);
    return new ModelAdapter(model);
  }

  /**
   * Create a LanguageModel from configuration
   */
  static async createLanguageModel(config: ModelConfig): Promise<LanguageModel> {
    const { provider, name, baseURL, apiKey, options } = config;

    switch (provider) {
      case 'openai':
        return this.createOpenAIModel(name, { baseURL, apiKey, ...options });

      case 'anthropic':
        return this.createAnthropicModel(name, { apiKey, ...options });

      case 'google':
        return this.createGoogleModel(name, { apiKey, ...options });

      case 'custom':
        return this.createCustomModel(name, { baseURL, apiKey, ...options });

      default:
        throw new InvalidModelConfigError(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Create OpenAI model
   */
  private static async createOpenAIModel(
    modelName: string,
    options: { baseURL?: string; apiKey?: string;[key: string]: unknown }
  ): Promise<LanguageModel> {
    const openaiModule = await this.loadProvider('@ai-sdk/openai') as OpenaiModule;

    // Type guard for module with createOpenAI
    const { createOpenAI } = openaiModule;

    const provider = createOpenAI({
      baseURL: options.baseURL ?? process.env.OPENAI_BASE_URL,
      apiKey: options.apiKey ?? process.env.OPENAI_API_KEY,
    });

    return provider(modelName);
  }

  /**
   * Create Anthropic model
   */
  private static async createAnthropicModel(
    modelName: string,
    options: { apiKey?: string;[key: string]: unknown }
  ): Promise<LanguageModel> {
    const anthropicModule = await this.loadProvider('@ai-sdk/anthropic') as AnthropicModule;

    // Type guard for module with createAnthropic
    const { createAnthropic } = anthropicModule;

    const provider = createAnthropic({
      apiKey: options.apiKey ?? process.env.ANTHROPIC_API_KEY,
    });

    return provider(modelName);
  }

  /**
   * Create Google model
   */
  private static async createGoogleModel(
    modelName: string,
    options: { apiKey?: string;[key: string]: unknown }
  ): Promise<LanguageModel> {
    const googleModule = await this.loadProvider('@ai-sdk/google') as GoogleModule;
    const { createGoogleGenerativeAI } = googleModule;

    const provider = createGoogleGenerativeAI({
      apiKey: options.apiKey ?? process.env.GOOGLE_API_KEY,
    });

    return provider(modelName);
  }

  /**
   * Create custom OpenAI-compatible model
   */
  private static async createCustomModel(
    modelName: string,
    options: { baseURL?: string; apiKey?: string;[key: string]: unknown }
  ): Promise<LanguageModel> {
    if (!options.baseURL) {
      throw new InvalidModelConfigError('baseURL is required for custom provider');
    }

    // Try to use openai-compatible provider first
    try {
      const compatModule = await this.loadProvider('@ai-sdk/openai-compatible') as OpenAICompatibleModule;
      const { createOpenAICompatible } = compatModule;

      if (!createOpenAICompatible) {
        throw new Error('createOpenAICompatible not found');
      }

      const provider = createOpenAICompatible({
        baseURL: options.baseURL,
        apiKey: options.apiKey,
        name: 'custom',
      });

      return provider(modelName) as LanguageModel;
    } catch {
      // Fall back to standard OpenAI provider with custom base URL
      return this.createOpenAIModel(modelName, options);
    }
  }

  /**
   * Dynamically load a provider package
   */
  private static async loadProvider(packageName: string): Promise<unknown> {
    // Check cache first
    if (providerCache.has(packageName)) {
      return providerCache.get(packageName);
    }

    try {
      const module = await import(packageName);
      providerCache.set(packageName, module);
      return module;
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('Cannot find module') ||
          error.message.includes('ERR_MODULE_NOT_FOUND'))
      ) {
        throw new ProviderNotAvailableError(packageName.replace('@ai-sdk/', ''));
      }
      throw error;
    }
  }

  /**
   * Check if a provider is available
   */
  static async isProviderAvailable(provider: string): Promise<boolean> {
    const packageName = `@ai-sdk/${provider}`;
    try {
      await this.loadProvider(packageName);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get list of available providers
   */
  static async getAvailableProviders(): Promise<string[]> {
    const providers = ['openai', 'anthropic', 'google', 'openai-compatible'];
    const available: string[] = [];

    for (const provider of providers) {
      if (await this.isProviderAvailable(provider)) {
        available.push(provider);
      }
    }

    return available;
  }
}
