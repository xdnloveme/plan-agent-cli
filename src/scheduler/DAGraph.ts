import { DAGNode, GraphEdge } from './types';

/**
 * 有向无环图 (DAG) 数据结构实现
 * 支持拓扑排序和循环检测
 */
export class DAGraph<T> {
  /** 节点映射表 */
  private nodes: Map<string, DAGNode<T>> = new Map();
  /** 邻接表（出边） */
  private adjacencyList: Map<string, Set<string>> = new Map();
  /** 入度表 */
  private inDegree: Map<string, number> = new Map();

  constructor() {
    this.reset();
  }

  /**
   * 重置图
   */
  reset(): void {
    this.nodes = new Map();
    this.adjacencyList = new Map();
    this.inDegree = new Map();
  }

  /**
   * 添加节点
   */
  addNode(node: DAGNode<T>): void {
    if (this.nodes.has(node.id)) {
      throw new Error(`Node with id ${node.id} already exists`);
    }

    this.nodes.set(node.id, node);
    this.adjacencyList.set(node.id, new Set());
    this.inDegree.set(node.id, 0);
  }

  /**
   * 添加边（从 from 指向 to，表示 to 依赖于 from）
   */
  addEdge(from: string, to: string): void {
    if (!this.nodes.has(from)) {
      throw new Error(`Source node ${from} does not exist`);
    }
    if (!this.nodes.has(to)) {
      throw new Error(`Target node ${to} does not exist`);
    }

    const adjacency = this.adjacencyList.get(from);
    if (adjacency && !adjacency.has(to)) {
      adjacency.add(to);
      const currentInDegree = this.inDegree.get(to) || 0;
      this.inDegree.set(to, currentInDegree + 1);
    }
  }

  /**
   * 根据节点的依赖关系构建边
   */
  buildFromDependencies(): void {
    for (const [nodeId, node] of this.nodes) {
      for (const depId of node.dependencies) {
        if (this.nodes.has(depId)) {
          // 依赖节点指向当前节点
          this.addEdge(depId, nodeId);
        }
      }
    }
  }

  /**
   * 获取节点
   */
  getNode(id: string): DAGNode<T> | undefined {
    return this.nodes.get(id);
  }

  /**
   * 获取所有节点
   */
  getAllNodes(): DAGNode<T>[] {
    return Array.from(this.nodes.values());
  }

  /**
   * 获取节点数量
   */
  getNodeCount(): number {
    return this.nodes.size;
  }

  /**
   * 获取所有边
   */
  getAllEdges(): GraphEdge[] {
    const edges: GraphEdge[] = [];
    for (const [from, toSet] of this.adjacencyList) {
      for (const to of toSet) {
        edges.push({ from, to });
      }
    }
    return edges;
  }

  /**
   * 检测循环依赖（使用 DFS）
   * @returns 如果存在循环返回 true，否则返回 false
   */
  hasCycle(): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const neighbors = this.adjacencyList.get(nodeId) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) {
            return true;
          }
        } else if (recursionStack.has(neighbor)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const nodeId of this.nodes.keys()) {
      if (!visited.has(nodeId)) {
        if (dfs(nodeId)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 查找循环中的节点
   * @returns 循环中涉及的节点 ID 数组
   */
  findCycleNodes(): string[] {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycleNodes: string[] = [];

    const dfs = (nodeId: string, path: string[]): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      const neighbors = this.adjacencyList.get(nodeId) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor, path)) {
            return true;
          }
        } else if (recursionStack.has(neighbor)) {
          // 找到循环，收集循环中的节点
          const cycleStartIndex = path.indexOf(neighbor);
          cycleNodes.push(...path.slice(cycleStartIndex));
          return true;
        }
      }

      path.pop();
      recursionStack.delete(nodeId);
      return false;
    };

    for (const nodeId of this.nodes.keys()) {
      if (!visited.has(nodeId)) {
        if (dfs(nodeId, [])) {
          break;
        }
      }
    }

    return [...new Set(cycleNodes)];
  }

  /**
   * Kahn's 算法进行拓扑排序
   * @returns 分层的执行顺序，每层中的任务可以并行执行
   */
  topologicalSort(): string[][] {
    if (this.hasCycle()) {
      throw new Error('Cannot perform topological sort on a graph with cycles');
    }

    // 复制入度表，避免修改原始数据
    const inDegreeClone = new Map(this.inDegree);
    const result: string[][] = [];

    while (inDegreeClone.size > 0) {
      // 找到所有入度为 0 的节点（当前层可并行执行的任务）
      const currentLayer: string[] = [];
      for (const [nodeId, degree] of inDegreeClone) {
        if (degree === 0) {
          currentLayer.push(nodeId);
        }
      }

      if (currentLayer.length === 0 && inDegreeClone.size > 0) {
        // 这种情况理论上不应该发生，因为我们已经检查了循环
        throw new Error('Unexpected state: no nodes with zero in-degree');
      }

      // 从入度表中移除当前层的节点
      for (const nodeId of currentLayer) {
        inDegreeClone.delete(nodeId);

        // 更新后继节点的入度
        const successors = this.adjacencyList.get(nodeId) || new Set();
        for (const successor of successors) {
          const currentDegree = inDegreeClone.get(successor);
          if (currentDegree !== undefined) {
            inDegreeClone.set(successor, currentDegree - 1);
          }
        }
      }

      if (currentLayer.length > 0) {
        result.push(currentLayer);
      }
    }

    return result;
  }

  /**
   * 获取入度为 0 的节点（可立即执行的任务）
   */
  getZeroInDegreeNodes(): string[] {
    const result: string[] = [];
    for (const [nodeId, degree] of this.inDegree) {
      if (degree === 0) {
        result.push(nodeId);
      }
    }
    return result;
  }

  /**
   * 移除节点并更新相关节点的入度
   */
  removeNode(nodeId: string): void {
    if (!this.nodes.has(nodeId)) {
      return;
    }

    // 更新后继节点的入度
    const successors = this.adjacencyList.get(nodeId) || new Set();
    for (const successor of successors) {
      const currentDegree = this.inDegree.get(successor);
      if (currentDegree !== undefined && currentDegree > 0) {
        this.inDegree.set(successor, currentDegree - 1);
      }
    }

    // 从前驱节点的邻接表中移除
    for (const [, adjSet] of this.adjacencyList) {
      adjSet.delete(nodeId);
    }

    // 删除节点
    this.nodes.delete(nodeId);
    this.adjacencyList.delete(nodeId);
    this.inDegree.delete(nodeId);
  }
}
