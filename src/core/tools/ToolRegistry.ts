import type { CoreTool } from 'ai';
import type { BaseTool, ToolContext, ToolResult } from './BaseTool';

/**
 * Tool permission levels
 */
export type ToolPermission = 'read' | 'write' | 'execute' | 'admin';

/**
 * Tool registration entry
 */
interface ToolEntry {
  tool: BaseTool;
  permissions: Set<ToolPermission>;
  allowedAgents: Set<string> | 'all';
}

/**
 * Tool registry for managing and discovering tools
 *
 * Provides centralized tool management with permission-based access control.
 */
export class ToolRegistry {
  private tools = new Map<string, ToolEntry>();
  private agentPermissions = new Map<string, Set<ToolPermission>>();

  /**
   * Register a tool
   */
  register(
    tool: BaseTool,
    options: {
      permissions?: ToolPermission[];
      allowedAgents?: string[] | 'all';
    } = {}
  ): void {
    const { permissions = ['read', 'execute'], allowedAgents = 'all' } = options;

    this.tools.set(tool.name, {
      tool,
      permissions: new Set(permissions),
      allowedAgents: allowedAgents === 'all' ? 'all' : new Set(allowedAgents),
    });
  }

  /**
   * Unregister a tool
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Get a tool by name
   */
  get(name: string): BaseTool | undefined {
    return this.tools.get(name)?.tool;
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all registered tool names
   */
  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get all registered tools
   */
  getAll(): BaseTool[] {
    return Array.from(this.tools.values()).map((entry) => entry.tool);
  }

  /**
   * Set permissions for an agent
   */
  setAgentPermissions(agentId: string, permissions: ToolPermission[]): void {
    this.agentPermissions.set(agentId, new Set(permissions));
  }

  /**
   * Check if an agent can access a tool
   */
  canAccess(
    agentId: string,
    toolName: string,
    requiredPermission: ToolPermission = 'execute'
  ): boolean {
    const entry = this.tools.get(toolName);
    if (!entry) {
      return false;
    }

    // Check if agent is allowed
    if (entry.allowedAgents !== 'all' && !entry.allowedAgents.has(agentId)) {
      return false;
    }

    // Check if tool has required permission
    if (!entry.permissions.has(requiredPermission)) {
      return false;
    }

    // Check if agent has required permission
    const agentPerms = this.agentPermissions.get(agentId);
    if (agentPerms && !agentPerms.has(requiredPermission)) {
      return false;
    }

    return true;
  }

  /**
   * Get tools available for an agent
   */
  getForAgent(agentId: string): BaseTool[] {
    const available: BaseTool[] = [];

    for (const [name, entry] of this.tools) {
      if (this.canAccess(agentId, name)) {
        available.push(entry.tool);
      }
    }

    return available;
  }

  /**
   * Convert tools to AI SDK CoreTool format for an agent
   */
  toCoreTools(agentId: string): Record<string, CoreTool> {
    const tools: Record<string, CoreTool> = {};

    for (const tool of this.getForAgent(agentId)) {
      tools[tool.name] = tool.toCoreTool();
    }

    return tools;
  }

  /**
   * Execute a tool by name
   */
  async execute(name: string, input: unknown, context: ToolContext): Promise<ToolResult> {
    const entry = this.tools.get(name);
    if (!entry) {
      return {
        success: false,
        error: `Tool not found: ${name}`,
      };
    }

    // Check access
    if (!this.canAccess(context.agentId, name)) {
      return {
        success: false,
        error: `Access denied: agent ${context.agentId} cannot access tool ${name}`,
      };
    }

    // Validate input
    const validation = entry.tool.validateInput(input);
    if (!validation.success) {
      return {
        success: false,
        error: `Invalid input: ${validation.error.message}`,
      };
    }

    // Execute
    return entry.tool.execute(validation.data, context);
  }

  /**
   * Get tool descriptions for prompt generation
   */
  getDescriptions(agentId?: string): string {
    const tools = agentId ? this.getForAgent(agentId) : this.getAll();

    return tools.map((tool) => `- ${tool.name}: ${tool.description}`).join('\n');
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear();
    this.agentPermissions.clear();
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalTools: number;
    toolNames: string[];
  } {
    return {
      totalTools: this.tools.size,
      toolNames: this.getNames(),
    };
  }
}

/**
 * Create a pre-configured tool registry with common tools
 */
export function createDefaultRegistry(): ToolRegistry {
  return new ToolRegistry();
}
