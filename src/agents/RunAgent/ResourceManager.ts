import { createLogger } from '../../utils/logger';

const logger = createLogger('ResourceManager');

/**
 * 资源类型
 */
export enum ResourceType {
  LLM = 'llm',
  MEMORY = 'memory',
  TOOL = 'tool',
  EXTERNAL_API = 'external_api',
}

/**
 * 资源状态
 */
export enum ResourceStatus {
  AVAILABLE = 'available',
  IN_USE = 'in_use',
  EXHAUSTED = 'exhausted',
  ERROR = 'error',
}

/**
 * 资源接口
 */
export interface Resource {
  id: string;
  type: ResourceType;
  status: ResourceStatus;
  capacity: number;
  used: number;
  metadata?: Record<string, unknown>;
}

/**
 * 资源分配结果
 */
export interface ResourceAllocation {
  resources: Resource[];
  success: boolean;
  message?: string;
}

/**
 * 资源管理器
 * 负责管理和分配执行任务所需的资源
 */
export class ResourceManager {
  private resources: Map<string, Resource> = new Map();
  private allocations: Map<string, string[]> = new Map(); // taskId -> resourceIds

  constructor() {
    this.initializeDefaultResources();
  }

  /**
   * 初始化默认资源
   */
  private initializeDefaultResources(): void {
    // LLM 资源
    this.addResource({
      id: 'llm_pool',
      type: ResourceType.LLM,
      status: ResourceStatus.AVAILABLE,
      capacity: 10,
      used: 0,
    });

    // 内存资源
    this.addResource({
      id: 'memory_pool',
      type: ResourceType.MEMORY,
      status: ResourceStatus.AVAILABLE,
      capacity: 100,
      used: 0,
    });

    // 工具资源
    this.addResource({
      id: 'tool_pool',
      type: ResourceType.TOOL,
      status: ResourceStatus.AVAILABLE,
      capacity: 20,
      used: 0,
    });

    logger.info('Default resources initialized');
  }

  /**
   * 添加资源
   */
  addResource(resource: Resource): void {
    this.resources.set(resource.id, resource);
    logger.debug(`Resource added: ${resource.id}`);
  }

  /**
   * 获取资源
   */
  getResource(resourceId: string): Resource | undefined {
    return this.resources.get(resourceId);
  }

  /**
   * 获取所有资源
   */
  getAllResources(): Resource[] {
    return Array.from(this.resources.values());
  }

  /**
   * 为任务分配资源
   */
  async allocate(taskId: string, requirements?: {
    llm?: number;
    memory?: number;
    tools?: number;
  }): Promise<ResourceAllocation> {
    logger.info(`Allocating resources for task: ${taskId}`);

    const reqs = {
      llm: requirements?.llm ?? 1,
      memory: requirements?.memory ?? 1,
      tools: requirements?.tools ?? 1,
    };

    const allocatedResources: Resource[] = [];
    const allocatedIds: string[] = [];

    // 检查并分配 LLM 资源
    const llmResource = this.resources.get('llm_pool');
    if (llmResource && llmResource.capacity - llmResource.used >= reqs.llm) {
      llmResource.used += reqs.llm;
      allocatedResources.push({ ...llmResource });
      allocatedIds.push(llmResource.id);
    } else {
      return {
        resources: [],
        success: false,
        message: 'Insufficient LLM resources',
      };
    }

    // 检查并分配内存资源
    const memoryResource = this.resources.get('memory_pool');
    if (memoryResource && memoryResource.capacity - memoryResource.used >= reqs.memory) {
      memoryResource.used += reqs.memory;
      allocatedResources.push({ ...memoryResource });
      allocatedIds.push(memoryResource.id);
    } else {
      // 回滚 LLM 分配
      this.releaseResourceUnits('llm_pool', reqs.llm);
      return {
        resources: [],
        success: false,
        message: 'Insufficient memory resources',
      };
    }

    // 检查并分配工具资源
    const toolResource = this.resources.get('tool_pool');
    if (toolResource && toolResource.capacity - toolResource.used >= reqs.tools) {
      toolResource.used += reqs.tools;
      allocatedResources.push({ ...toolResource });
      allocatedIds.push(toolResource.id);
    } else {
      // 回滚之前的分配
      this.releaseResourceUnits('llm_pool', reqs.llm);
      this.releaseResourceUnits('memory_pool', reqs.memory);
      return {
        resources: [],
        success: false,
        message: 'Insufficient tool resources',
      };
    }

    // 记录分配
    this.allocations.set(taskId, allocatedIds);

    logger.debug(`Resources allocated for task ${taskId}:`, allocatedIds);

    return {
      resources: allocatedResources,
      success: true,
    };
  }

  /**
   * 释放任务占用的资源
   */
  release(taskId: string): void {
    logger.info(`Releasing resources for task: ${taskId}`);

    const allocatedIds = this.allocations.get(taskId);
    if (!allocatedIds) {
      logger.warn(`No allocations found for task: ${taskId}`);
      return;
    }

    // 释放所有分配的资源
    for (const resourceId of allocatedIds) {
      this.releaseResourceUnits(resourceId, 1);
    }

    this.allocations.delete(taskId);
    logger.debug(`Resources released for task ${taskId}`);
  }

  /**
   * 释放资源单位
   */
  private releaseResourceUnits(resourceId: string, units: number): void {
    const resource = this.resources.get(resourceId);
    if (resource) {
      resource.used = Math.max(0, resource.used - units);
      if (resource.status === ResourceStatus.EXHAUSTED && resource.used < resource.capacity) {
        resource.status = ResourceStatus.AVAILABLE;
      }
    }
  }

  /**
   * 获取资源使用情况
   */
  getUsageStats(): Record<string, { capacity: number; used: number; available: number }> {
    const stats: Record<string, { capacity: number; used: number; available: number }> = {};

    for (const [id, resource] of this.resources) {
      stats[id] = {
        capacity: resource.capacity,
        used: resource.used,
        available: resource.capacity - resource.used,
      };
    }

    return stats;
  }

  /**
   * 检查资源是否可用
   */
  isResourceAvailable(resourceId: string, required: number = 1): boolean {
    const resource = this.resources.get(resourceId);
    if (!resource) {
      return false;
    }
    return resource.capacity - resource.used >= required;
  }

  /**
   * 重置所有资源
   */
  reset(): void {
    for (const resource of this.resources.values()) {
      resource.used = 0;
      resource.status = ResourceStatus.AVAILABLE;
    }
    this.allocations.clear();
    logger.info('All resources reset');
  }
}
