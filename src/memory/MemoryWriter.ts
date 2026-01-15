/**
 * MemoryWriter - 文件写入器
 * 负责将 LLM 交互记录写入到 .memory 目录
 */

import * as fs from "fs";
import * as path from "path";
import { MemoryEntry, MemoryContext } from "./types";
import { createLogger } from "../utils/logger";

const logger = createLogger("MemoryWriter");

/**
 * TaskPlan 概览信息（简化版本，避免循环依赖）
 */
export interface PlanOverview {
  id: string;
  originalInput: string;
  summary: string;
  createdAt: Date;
  tasks: Array<{
    id: string;
    description: string;
    priority: number | string;
    dependencies: string[];
    steps: Array<{
      id: string;
      action: string;
      expectedResult?: string;
    }>;
  }>;
}

/**
 * 格式化日期为可读字符串
 */
function formatTimestamp(date: Date): string {
  return date
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "");
}

/**
 * 格式化 PlanOverview 为 Markdown 格式
 */
function formatOverview(plan: PlanOverview): string {
  const lines: string[] = [];

  lines.push(`# 任务计划概览`);
  lines.push(``);
  lines.push(`## 基本信息`);
  lines.push(``);
  lines.push(`- **Plan ID**: \`${plan.id}\``);
  lines.push(`- **创建时间**: ${formatTimestamp(plan.createdAt)}`);
  lines.push(`- **任务数量**: ${plan.tasks.length}`);
  lines.push(``);
  lines.push(`## 原始输入`);
  lines.push(``);
  lines.push(`\`\`\``);
  lines.push(plan.originalInput);
  lines.push(`\`\`\``);
  lines.push(``);
  lines.push(`## 计划摘要`);
  lines.push(``);
  lines.push(plan.summary);
  lines.push(``);
  lines.push(`## 任务列表`);
  lines.push(``);

  for (const task of plan.tasks) {
    lines.push(`### ${task.id}`);
    lines.push(``);
    lines.push(`- **描述**: ${task.description}`);
    lines.push(`- **优先级**: ${task.priority}`);
    lines.push(
      `- **依赖**: ${
        task.dependencies.length > 0 ? task.dependencies.join(", ") : "无"
      }`
    );
    lines.push(``);

    if (task.steps.length > 0) {
      lines.push(`**执行步骤**:`);
      lines.push(``);
      for (const step of task.steps) {
        lines.push(`1. **${step.id}**: ${step.action}`);
        if (step.expectedResult) {
          lines.push(`   - 预期结果: ${step.expectedResult}`);
        }
      }
      lines.push(``);
    }
  }

  lines.push(`---`);
  lines.push(``);
  lines.push(`*此文件由 Memory 模块自动生成*`);

  return lines.join("\n");
}

/**
 * 格式化 Memory 条目为 Markdown 格式
 */
function formatEntry(entry: MemoryEntry): string {
  return `# 任务时间戳：${formatTimestamp(entry.timestamp)}

## 任务Task名称：${entry.taskName}

## 任务提示词内容：
\`\`\`
${entry.prompt}
\`\`\`

## 大模型返回的内容：
\`\`\`
${entry.response}
\`\`\`

---

`;
}

/**
 * MemoryWriter 类
 * 单例模式实现，负责管理 .memory 目录和写入记录
 */
export class MemoryWriter {
  private static instance: MemoryWriter;
  private baseDir: string;

  private constructor() {
    // 默认使用当前工作目录
    this.baseDir = process.cwd();
  }

  /**
   * 获取 MemoryWriter 单例实例
   */
  static getInstance(): MemoryWriter {
    if (!MemoryWriter.instance) {
      MemoryWriter.instance = new MemoryWriter();
    }
    return MemoryWriter.instance;
  }

  /**
   * 设置基础目录
   */
  setBaseDir(dir: string): void {
    this.baseDir = dir;
  }

  /**
   * 获取 .memory 目录路径
   */
  getMemoryDir(context: MemoryContext): string {
    const outputDir = context.outputDir || this.baseDir;
    return path.join(outputDir, ".memory", context.planId);
  }

  /**
   * 确保目录存在
   */
  private ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      logger.debug(`Created memory directory: ${dirPath}`);
    }
  }

  /**
   * 获取 plan.md 文件路径
   */
  private getPlanFilePath(context: MemoryContext): string {
    const memoryDir = this.getMemoryDir(context);
    return path.join(memoryDir, "plan.md");
  }

  /**
   * 获取 overview.md 文件路径
   */
  private getOverviewFilePath(context: MemoryContext): string {
    const memoryDir = this.getMemoryDir(context);
    return path.join(memoryDir, "overview.md");
  }

  /**
   * 写入 Memory 条目
   */
  async write(entry: MemoryEntry, context: MemoryContext): Promise<void> {
    if (!context.enabled) {
      logger.debug("Memory is disabled, skipping write");
      return;
    }

    try {
      const memoryDir = this.getMemoryDir(context);
      this.ensureDir(memoryDir);

      const filePath = this.getPlanFilePath(context);
      const content = formatEntry(entry);

      // 追加写入
      fs.appendFileSync(filePath, content, "utf-8");

      logger.debug(`Memory entry written to: ${filePath}`);
    } catch (error) {
      logger.error("Failed to write memory entry", error);
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 写入 Plan Overview（任务计划概览）
   */
  async writeOverview(
    plan: PlanOverview,
    context: MemoryContext
  ): Promise<void> {
    if (!context.enabled) {
      logger.debug("Memory is disabled, skipping overview write");
      return;
    }

    try {
      const memoryDir = this.getMemoryDir(context);
      this.ensureDir(memoryDir);

      const filePath = this.getOverviewFilePath(context);
      const content = formatOverview(plan);

      // 覆盖写入（overview 只需要一份）
      fs.writeFileSync(filePath, content, "utf-8");

      logger.debug(`Plan overview written to: ${filePath}`);
    } catch (error) {
      logger.error("Failed to write plan overview", error);
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 写入 Plan Overview（同步版本）
   */
  writeOverviewSync(plan: PlanOverview, context: MemoryContext): void {
    if (!context.enabled) {
      return;
    }

    try {
      const memoryDir = this.getMemoryDir(context);
      this.ensureDir(memoryDir);

      const filePath = this.getOverviewFilePath(context);
      const content = formatOverview(plan);

      fs.writeFileSync(filePath, content, "utf-8");
    } catch (error) {
      logger.error("Failed to write plan overview (sync)", error);
    }
  }

  /**
   * 写入 Memory 条目（同步版本）
   */
  writeSync(entry: MemoryEntry, context: MemoryContext): void {
    if (!context.enabled) {
      return;
    }

    try {
      const memoryDir = this.getMemoryDir(context);
      this.ensureDir(memoryDir);

      const filePath = this.getPlanFilePath(context);
      const content = formatEntry(entry);

      fs.appendFileSync(filePath, content, "utf-8");
    } catch (error) {
      logger.error("Failed to write memory entry (sync)", error);
    }
  }

  /**
   * 读取指定 Plan 的所有 Memory 记录
   */
  read(context: MemoryContext): string | null {
    const filePath = this.getPlanFilePath(context);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    return fs.readFileSync(filePath, "utf-8");
  }

  /**
   * 列出所有 Plan ID
   */
  listPlans(outputDir?: string): string[] {
    const memoryRoot = path.join(outputDir || this.baseDir, ".memory");

    if (!fs.existsSync(memoryRoot)) {
      return [];
    }

    return fs.readdirSync(memoryRoot).filter((item) => {
      const itemPath = path.join(memoryRoot, item);
      return fs.statSync(itemPath).isDirectory();
    });
  }

  /**
   * 清除指定 Plan 的 Memory 记录
   */
  clear(context: MemoryContext): boolean {
    const filePath = this.getPlanFilePath(context);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info(`Memory file cleared: ${filePath}`);
      return true;
    }

    return false;
  }

  /**
   * 删除整个 Plan 目录
   */
  deletePlan(context: MemoryContext): boolean {
    const memoryDir = this.getMemoryDir(context);

    if (fs.existsSync(memoryDir)) {
      fs.rmSync(memoryDir, { recursive: true });
      logger.info(`Memory directory deleted: ${memoryDir}`);
      return true;
    }

    return false;
  }
}

/**
 * 导出默认 MemoryWriter 实例
 */
export const memoryWriter = MemoryWriter.getInstance();
