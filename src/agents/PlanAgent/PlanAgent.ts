import { ChatOpenAI } from "@langchain/openai";
import { TaskPlan, PlanAgentConfig, AgentType } from "../../core/types";
import { TaskAnalyzer } from "./TaskAnalyzer";
import { PlanGenerator } from "./PlanGenerator";
import { getModelConfig } from "../../../config/models";
import { config } from "../../../config/env";
import { createLogger } from "../../utils/logger";
import { wrapModelWithMemory } from "../../memory/index";

const logger = createLogger("PlanAgent");

/**
 * PlanAgent - 感知层
 * 负责语义理解、任务分解和计划生成
 */
export class PlanAgent {
  private model: ChatOpenAI;
  private taskAnalyzer: TaskAnalyzer;
  private planGenerator: PlanGenerator;
  private agentConfig: PlanAgentConfig;

  constructor(agentConfig?: Partial<PlanAgentConfig>) {
    const modelConfig = getModelConfig("planAgent");

    // 初始化 LLM
    const baseModel = new ChatOpenAI({
      modelName: modelConfig.modelName,
      temperature: modelConfig.temperature,
      maxTokens: modelConfig.maxTokens,
      openAIApiKey: config.openai.apiKey,
      configuration: {
        baseURL: config.openai.baseUrl,
      },
    });

    // 使用 Memory 代理包装 model
    this.model = wrapModelWithMemory(baseModel, "PlanAgent");

    // 初始化子组件（传入已包装的 model）
    this.taskAnalyzer = new TaskAnalyzer(this.model);
    this.planGenerator = new PlanGenerator(this.model);

    // 合并配置
    this.agentConfig = {
      type: AgentType.PLAN,
      modelName: modelConfig.modelName,
      temperature: modelConfig.temperature,
      maxTokens: modelConfig.maxTokens,
      maxTasksPerPlan: 10,
      enableDependencyAnalysis: true,
      ...agentConfig,
    };

    logger.info("PlanAgent initialized", {
      model: this.agentConfig.modelName,
    });
  }

  /**
   * 分析用户输入并生成任务计划
   */
  async analyze(input: string): Promise<TaskPlan> {
    logger.info("Starting input analysis");

    try {
      // 1. 语义解析
      logger.debug("Step 1: Parsing input");
      const parsed = await this.taskAnalyzer.parse(input);

      // 2. 任务分解
      logger.debug("Step 2: Decomposing tasks");
      const decomposed = await this.taskAnalyzer.decompose(parsed);

      // 3. 限制任务数量
      if (
        this.agentConfig.maxTasksPerPlan &&
        decomposed.tasks.length > this.agentConfig.maxTasksPerPlan
      ) {
        logger.warn(
          `Task count (${decomposed.tasks.length}) exceeds limit (${this.agentConfig.maxTasksPerPlan}), truncating`
        );
        decomposed.tasks = decomposed.tasks.slice(
          0,
          this.agentConfig.maxTasksPerPlan
        );
      }

      // 4. 生成计划
      logger.debug("Step 3: Generating plan");
      const plan = await this.planGenerator.generate(decomposed, input);

      logger.success(
        `Plan generated: ${plan.id} with ${plan.tasks.length} tasks`
      );

      return plan;
    } catch (error) {
      logger.error("Failed to analyze input", error);
      throw error;
    }
  }

  /**
   * 获取 Agent 配置
   */
  getConfig(): PlanAgentConfig {
    return { ...this.agentConfig };
  }

  /**
   * 更新 Agent 配置
   */
  updateConfig(updates: Partial<PlanAgentConfig>): void {
    this.agentConfig = {
      ...this.agentConfig,
      ...updates,
    };

    // 如果模型配置改变，重新初始化 LLM
    if (updates.modelName || updates.temperature || updates.maxTokens) {
      const baseModel = new ChatOpenAI({
        modelName: this.agentConfig.modelName,
        temperature: this.agentConfig.temperature,
        maxTokens: this.agentConfig.maxTokens,
        openAIApiKey: config.openai.apiKey,
        configuration: {
          baseURL: config.openai.baseUrl,
        },
      });

      // 使用 Memory 代理包装 model
      this.model = wrapModelWithMemory(baseModel, "PlanAgent");

      this.taskAnalyzer = new TaskAnalyzer(this.model);
      this.planGenerator = new PlanGenerator(this.model);

      logger.info("PlanAgent model updated", {
        model: this.agentConfig.modelName,
      });
    }
  }
}
