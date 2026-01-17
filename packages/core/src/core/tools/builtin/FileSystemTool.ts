import { z } from 'zod';
import { BaseTool, type ToolContext, type ToolResult } from '../BaseTool';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * File system operation type
 */
const fileOperationSchema = z.enum(['read', 'write', 'list', 'exists', 'delete', 'mkdir']);

/**
 * File system input schema
 */
const fileSystemInputSchema = z.object({
  operation: fileOperationSchema.describe('File system operation to perform'),
  path: z.string().describe('File or directory path'),
  content: z.string().optional().describe('Content to write (for write operation)'),
  encoding: z.enum(['utf8', 'utf-8', 'base64', 'hex']).default('utf8').describe('File encoding'),
});

type FileSystemInput = z.infer<typeof fileSystemInputSchema>;

/**
 * File system operation result
 */
interface FileSystemResult {
  operation: string;
  path: string;
  success: boolean;
  content?: string;
  files?: string[];
  exists?: boolean;
  message?: string;
}

/**
 * File system tool options
 */
interface FileSystemToolOptions {
  /** Base directory to restrict operations */
  basePath?: string;
  /** Allowed operations */
  allowedOperations?: Array<'read' | 'write' | 'list' | 'exists' | 'delete' | 'mkdir'>;
  /** Maximum file size to read (in bytes) */
  maxReadSize?: number;
}

/**
 * File system tool for reading and writing files
 *
 * This tool provides safe file system operations with configurable restrictions.
 */
export class FileSystemTool extends BaseTool<typeof fileSystemInputSchema, FileSystemResult> {
  readonly name = 'file_system';
  readonly description =
    'Perform file system operations: read files, write files, list directories, ' +
    'check if files exist, delete files, and create directories.';
  readonly inputSchema = fileSystemInputSchema;

  private basePath?: string;
  private allowedOperations: Set<string>;
  private maxReadSize: number;

  constructor(options: FileSystemToolOptions = {}) {
    super();
    this.basePath = options.basePath;
    this.allowedOperations = new Set(
      options.allowedOperations ?? ['read', 'write', 'list', 'exists', 'delete', 'mkdir']
    );
    this.maxReadSize = options.maxReadSize ?? 10 * 1024 * 1024; // 10MB default
  }

  async execute(
    input: FileSystemInput,
    _context?: ToolContext
  ): Promise<ToolResult<FileSystemResult>> {
    const { operation, path: filePath, content, encoding } = input;

    // Check if operation is allowed
    if (!this.allowedOperations.has(operation)) {
      return {
        success: false,
        error: `Operation "${operation}" is not allowed`,
      };
    }

    // Resolve and validate path
    const resolvedPath = this.resolvePath(filePath);
    if (!resolvedPath) {
      return {
        success: false,
        error: 'Path is outside allowed directory',
      };
    }

    try {
      switch (operation) {
        case 'read':
          return await this.readFile(resolvedPath, encoding);
        case 'write':
          return await this.writeFile(resolvedPath, content ?? '', encoding);
        case 'list':
          return await this.listDirectory(resolvedPath);
        case 'exists':
          return await this.checkExists(resolvedPath);
        case 'delete':
          return await this.deleteFile(resolvedPath);
        case 'mkdir':
          return await this.createDirectory(resolvedPath);
        default:
          return {
            success: false,
            error: `Unknown operation: ${operation}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Operation failed',
      };
    }
  }

  /**
   * Resolve and validate path against base path
   */
  private resolvePath(inputPath: string): string | null {
    const resolved = this.basePath
      ? path.resolve(this.basePath, inputPath)
      : path.resolve(inputPath);

    // If base path is set, ensure resolved path is within it
    if (this.basePath) {
      const normalizedBase = path.resolve(this.basePath);
      if (!resolved.startsWith(normalizedBase)) {
        return null;
      }
    }

    return resolved;
  }

  /**
   * Read a file
   */
  private async readFile(
    filePath: string,
    encoding: BufferEncoding
  ): Promise<ToolResult<FileSystemResult>> {
    // Check file size first
    const stats = await fs.stat(filePath);
    if (stats.size > this.maxReadSize) {
      return {
        success: false,
        error: `File too large: ${stats.size} bytes (max: ${this.maxReadSize})`,
      };
    }

    const content = await fs.readFile(filePath, { encoding });
    return {
      success: true,
      data: {
        operation: 'read',
        path: filePath,
        success: true,
        content,
      },
    };
  }

  /**
   * Write to a file
   */
  private async writeFile(
    filePath: string,
    content: string,
    encoding: BufferEncoding
  ): Promise<ToolResult<FileSystemResult>> {
    // Ensure parent directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(filePath, content, { encoding });
    return {
      success: true,
      data: {
        operation: 'write',
        path: filePath,
        success: true,
        message: `File written successfully (${content.length} characters)`,
      },
    };
  }

  /**
   * List directory contents
   */
  private async listDirectory(dirPath: string): Promise<ToolResult<FileSystemResult>> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files = entries.map((entry) => {
      const suffix = entry.isDirectory() ? '/' : '';
      return entry.name + suffix;
    });

    return {
      success: true,
      data: {
        operation: 'list',
        path: dirPath,
        success: true,
        files,
      },
    };
  }

  /**
   * Check if file/directory exists
   */
  private async checkExists(filePath: string): Promise<ToolResult<FileSystemResult>> {
    try {
      await fs.access(filePath);
      return {
        success: true,
        data: {
          operation: 'exists',
          path: filePath,
          success: true,
          exists: true,
        },
      };
    } catch {
      return {
        success: true,
        data: {
          operation: 'exists',
          path: filePath,
          success: true,
          exists: false,
        },
      };
    }
  }

  /**
   * Delete a file
   */
  private async deleteFile(filePath: string): Promise<ToolResult<FileSystemResult>> {
    await fs.unlink(filePath);
    return {
      success: true,
      data: {
        operation: 'delete',
        path: filePath,
        success: true,
        message: 'File deleted successfully',
      },
    };
  }

  /**
   * Create a directory
   */
  private async createDirectory(dirPath: string): Promise<ToolResult<FileSystemResult>> {
    await fs.mkdir(dirPath, { recursive: true });
    return {
      success: true,
      data: {
        operation: 'mkdir',
        path: dirPath,
        success: true,
        message: 'Directory created successfully',
      },
    };
  }
}

/**
 * Create a file system tool instance
 */
export function createFileSystemTool(options?: FileSystemToolOptions): FileSystemTool {
  return new FileSystemTool(options);
}
