/**
 * Built-in tools exports
 */
export { CalculatorTool, createCalculatorTool } from './CalculatorTool';
export { WebSearchTool, createWebSearchTool, type SearchProvider, MockSearchProvider } from './WebSearchTool';
export { FileSystemTool, createFileSystemTool } from './FileSystemTool';

import { CalculatorTool } from './CalculatorTool';
import { WebSearchTool } from './WebSearchTool';
import { FileSystemTool } from './FileSystemTool';
import type { ToolRegistry } from '../ToolRegistry';

/**
 * File system operation type
 */
type FileSystemOperation = 'read' | 'write' | 'list' | 'exists' | 'delete' | 'mkdir';

/**
 * Register all built-in tools to a registry
 */
export function registerBuiltinTools(
  registry: ToolRegistry,
  options?: {
    calculator?: boolean;
    webSearch?: boolean;
    fileSystem?: boolean | { basePath?: string; allowedOperations?: FileSystemOperation[] };
  }
): void {
  const opts = {
    calculator: true,
    webSearch: true,
    fileSystem: true,
    ...options,
  };

  if (opts.calculator) {
    registry.register(new CalculatorTool());
  }

  if (opts.webSearch) {
    registry.register(new WebSearchTool());
  }

  if (opts.fileSystem) {
    const fsOptions = typeof opts.fileSystem === 'object' ? opts.fileSystem : {};
    registry.register(new FileSystemTool(fsOptions));
  }
}
