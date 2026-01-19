import type { LanguageModel } from 'ai';
import type { ModelConfig } from '../../agents/types';
import { ModelAdapter } from './ModelAdapter';

/**
 * Provider type enumeration - ModelFactory only provides enum values, not concrete implementations
 */
export type ProviderType = 'openai' | 'anthropic' | 'google' | 'custom';

/**
 * ModelProvider interface - abstracts the ability to create LanguageModel instances
 * This is a function that takes a model name and returns a LanguageModel instance
 */
export type ModelProvider = (modelName: string) => LanguageModel;

/**
 * Provider Factory interface - factory function that creates ModelProvider instances
 * 
 * Different types of providers have different configuration parameters:
 * - OpenAI: requires baseURL? and apiKey?
 * - Anthropic: requires apiKey?
 * - Google: requires apiKey?
 * - Custom: requires baseURL and apiKey?
 */
export type ProviderFactory = (config: ProviderConfig) => ModelProvider;

/**
 * Provider configuration parameters
 */
export interface ProviderConfig {
  baseURL?: string;
  apiKey?: string;
  [key: string]: unknown;
}

/**
 * Provider registration entry - contains the provider factory function
 */
export interface ProviderRegistration {
  provider: ProviderFactory;
}

/**
 * Provider registry - key is ProviderType, value is ProviderRegistration
 */
export type ProviderRegistry = Record<ProviderType, ProviderRegistration>;

/**
 * Error thrown when a model provider is not registered
 */
export class ProviderNotAvailableError extends Error {
  constructor(provider: string) {
    super(
      `Model provider "${provider}" is not registered. ` +
      `Please register it first using ModelFactory.registerProviders() or ModelFactory.registerProvider().`
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
 * Provider registry - stores externally registered provider implementations
 */
const providerRegistry = new Map<ProviderType, ProviderRegistration>();

/**
 * Model factory that creates ModelAdapter instances based on configuration
 *
 * Follows the Dependency Inversion Principle:
 * - ModelFactory only provides ProviderType enum values, not concrete implementations
 * - External code passes provider implementations via registerProviders in key-value format
 * - The create method retrieves the corresponding implementation from the registry by enum value
 */
export class ModelFactory {
  /**
   * Register provider implementations (initialize the factory)
   * 
   * External code passes provider implementations in key-value format,
   * e.g.: { "openai": { provider: createOpenAI }, "anthropic": { provider: createAnthropic } }
   * 
   * @param registry - Provider registry, key is ProviderType, value is ProviderRegistration
   * 
   * @example
   * ```typescript
   * import { createOpenAI } from '@ai-sdk/openai';
   * import { createAnthropic } from '@ai-sdk/anthropic';
   * 
   * ModelFactory.registerProviders({
   *   openai: { provider: createOpenAI },
   *   anthropic: { provider: createAnthropic },
   * });
   * ```
   */
  static registerProviders(registry: Partial<ProviderRegistry>): void {
    for (const [type, registration] of Object.entries(registry)) {
      providerRegistry.set(type as ProviderType, registration);
    }
  }

  /**
   * Register a single provider implementation
   * 
   * @param type - Provider type
   * @param registration - Provider registration entry
   */
  static registerProvider(type: ProviderType, registration: ProviderRegistration): void {
    providerRegistry.set(type, registration);
  }

  /**
   * Get a registered provider
   * 
   * @param type - Provider type
   * @returns Provider registration entry, or undefined if not registered
   */
  static getProvider(type: ProviderType): ProviderRegistration | undefined {
    return providerRegistry.get(type);
  }

  /**
   * Check if a provider is registered
   * 
   * @param type - Provider type
   * @returns Whether the provider is registered
   */
  static isProviderRegistered(type: ProviderType): boolean {
    return providerRegistry.has(type);
  }

  /**
   * Create a ModelAdapter (uses registry, follows Dependency Inversion Principle)
   * 
   * Retrieves the corresponding provider implementation from the registry,
   * then creates a ModelAdapter instance.
   * 
   * @param config - Model configuration, includes provider type, model name, and configuration parameters
   * @returns ModelAdapter instance
   * 
   * @example
   * ```typescript
   * // 1. Register provider first
   * import { createOpenAI } from '@ai-sdk/openai';
   * ModelFactory.registerProviders({
   *   openai: { provider: createOpenAI },
   * });
   * 
   * // 2. Create ModelAdapter using ModelConfig
   * const adapter = ModelFactory.create({
   *   provider: 'openai',
   *   name: 'gpt-4',
   *   apiKey: process.env.OPENAI_API_KEY,
   * });
   * ```
   */
  static create(config: ModelConfig): ModelAdapter {
    const { provider, name, baseURL, apiKey, options } = config;

    // Convert ModelConfig's provider string to ProviderType
    const providerType = provider as ProviderType;

    // Get provider implementation from registry
    const registration = providerRegistry.get(providerType);

    if (!registration) {
      throw new ProviderNotAvailableError(provider);
    }

    // Build ProviderConfig
    const providerConfig: ProviderConfig = {
      baseURL,
      apiKey,
      ...options,
    };

    // Get provider factory function from registry, create provider instance
    const modelProvider = registration.provider(providerConfig);

    // Create LanguageModel using provider
    const model = modelProvider(name);

    // Wrap into ModelAdapter
    return new ModelAdapter(model);
  }
}
