import chalk from 'chalk';
import { AgentBuilder, AgentOrchestrator, OrchestratorStatus } from '../core/index';
import { TaskPlan, ExecutionSummary, TaskStatus } from '../core/types';
import { validateConfig } from '../../config/env';
import { createLogger } from '../utils/logger';

const logger = createLogger('CommandHandler');

/**
 * 命令处理结果
 */
export interface CommandResult {
  success: boolean;
  message: string;
  data?: unknown;
}

/**
 * 命令处理器
 * 处理 CLI 命令并返回结果
 */
export class CommandHandler {
  private orchestrator: AgentOrchestrator | null = null;
  private currentPlan: TaskPlan | null = null;

  constructor() {
    this.initializeOrchestrator();
  }

  /**
   * 初始化编排器
   */
  private initializeOrchestrator(): void {
    // 验证配置
    const validation = validateConfig();
    if (!validation.valid) {
      logger.warn('Configuration validation failed', validation.errors);
      return;
    }

    try {
      const builder = new AgentBuilder().withDefaults();
      this.orchestrator = builder.build();
      logger.info('Orchestrator initialized');
    } catch (error) {
      logger.error('Failed to initialize orchestrator', error);
    }
  }

  /**
   * 处理命令
   */
  async handleCommand(command: string, args: string[]): Promise<CommandResult> {
    switch (command.toLowerCase()) {
      case 'plan':
        return await this.handlePlan(args.join(' '));
      case 'execute':
        return await this.handleExecute(args[0]);
      case 'run':
        return await this.handleRun(args.join(' '));
      case 'status':
        return this.handleStatus();
      case 'tasks':
        return this.handleTasks();
      case 'config':
        return this.handleConfig();
      case 'reset':
        return this.handleReset();
      case 'help':
        return this.handleHelp();
      default:
        return {
          success: false,
          message: `Unknown command: ${command}. Type 'help' for available commands.`,
        };
    }
  }

  /**
   * 处理 plan 命令 - 生成任务计划
   */
  private async handlePlan(input: string): Promise<CommandResult> {
    if (!input.trim()) {
      return {
        success: false,
        message: 'Please provide a task description. Usage: plan <description>',
      };
    }

    if (!this.orchestrator) {
      return {
        success: false,
        message: 'Orchestrator not initialized. Please check your configuration.',
      };
    }

    try {
      console.log(chalk.cyan('\n📋 Generating task plan...\n'));

      const plan = await this.orchestrator.createPlan(input);
      this.currentPlan = plan;

      this.printPlan(plan);

      return {
        success: true,
        message: `Plan created: ${plan.id}`,
        data: plan,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to create plan: ${errorMessage}`,
      };
    }
  }

  /**
   * 处理 execute 命令 - 执行已有计划
   */
  private async handleExecute(planId?: string): Promise<CommandResult> {
    if (!this.currentPlan) {
      return {
        success: false,
        message: 'No plan available. Please create a plan first using the "plan" command.',
      };
    }

    if (planId && planId !== this.currentPlan.id) {
      return {
        success: false,
        message: `Plan ${planId} not found. Current plan: ${this.currentPlan.id}`,
      };
    }

    if (!this.orchestrator) {
      return {
        success: false,
        message: 'Orchestrator not initialized.',
      };
    }

    try {
      console.log(chalk.cyan('\n🚀 Executing plan...\n'));

      const summary = await this.orchestrator.execute(this.currentPlan.originalInput);

      this.printSummary(summary);

      return {
        success: summary.success,
        message: summary.success ? 'Execution completed successfully' : 'Execution completed with failures',
        data: summary,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Execution failed: ${errorMessage}`,
      };
    }
  }

  /**
   * 处理 run 命令 - 一键生成并执行计划
   */
  private async handleRun(input: string): Promise<CommandResult> {
    if (!input.trim()) {
      return {
        success: false,
        message: 'Please provide a task description. Usage: run <description>',
      };
    }

    if (!this.orchestrator) {
      return {
        success: false,
        message: 'Orchestrator not initialized. Please check your configuration.',
      };
    }

    try {
      console.log(chalk.cyan('\n🚀 Creating plan and executing...\n'));

      const summary = await this.orchestrator.execute(input);
      this.currentPlan = this.orchestrator.getCurrentPlan() || null;

      this.printSummary(summary);

      return {
        success: summary.success,
        message: summary.success ? 'Execution completed successfully' : 'Execution completed with failures',
        data: summary,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Run failed: ${errorMessage}`,
      };
    }
  }

  /**
   * 处理 status 命令
   */
  private handleStatus(): CommandResult {
    if (!this.orchestrator) {
      return {
        success: true,
        message: 'Orchestrator: Not initialized',
      };
    }

    const status = this.orchestrator.getStatus();
    const progress = this.orchestrator.getProgress();

    console.log(chalk.cyan('\n📊 Status Report\n'));
    console.log(chalk.white(`  Status: ${this.formatStatus(status)}`));
    console.log(chalk.white(`  Progress: ${progress.completed}/${progress.total} tasks (${progress.percentage}%)`));

    if (progress.failed > 0) {
      console.log(chalk.red(`  Failed: ${progress.failed} tasks`));
    }

    if (this.currentPlan) {
      console.log(chalk.white(`  Current Plan: ${this.currentPlan.id}`));
    }

    console.log('');

    return {
      success: true,
      message: `Status: ${status}`,
      data: { status, progress },
    };
  }

  /**
   * 处理 tasks 命令 - 显示当前任务列表
   */
  private handleTasks(): CommandResult {
    if (!this.currentPlan) {
      return {
        success: false,
        message: 'No plan available. Please create a plan first.',
      };
    }

    console.log(chalk.cyan('\n📋 Task List\n'));

    for (const task of this.currentPlan.tasks) {
      const statusIcon = this.getStatusIcon(task.status);
      const priorityColor = this.getPriorityColor(task.priority);

      console.log(
        `  ${statusIcon} ${chalk.white(task.id)} - ${priorityColor(`[P${task.priority}]`)} ${task.description}`
      );

      if (task.dependencies.length > 0) {
        console.log(chalk.gray(`      Dependencies: ${task.dependencies.join(', ')}`));
      }
    }

    console.log('');

    return {
      success: true,
      message: `${this.currentPlan.tasks.length} tasks in current plan`,
      data: this.currentPlan.tasks,
    };
  }

  /**
   * 处理 config 命令
   */
  private handleConfig(): CommandResult {
    const validation = validateConfig();

    console.log(chalk.cyan('\n⚙️ Configuration\n'));
    console.log(chalk.white(`  Valid: ${validation.valid ? chalk.green('Yes') : chalk.red('No')}`));

    if (!validation.valid) {
      console.log(chalk.red(`  Errors:`));
      for (const error of validation.errors) {
        console.log(chalk.red(`    - ${error}`));
      }
    }

    console.log('');

    return {
      success: validation.valid,
      message: validation.valid ? 'Configuration is valid' : 'Configuration has errors',
      data: validation,
    };
  }

  /**
   * 处理 reset 命令
   */
  private handleReset(): CommandResult {
    if (this.orchestrator) {
      this.orchestrator.reset();
    }

    this.currentPlan = null;

    console.log(chalk.green('\n✓ System reset successfully\n'));

    return {
      success: true,
      message: 'System reset successfully',
    };
  }

  /**
   * 处理 help 命令
   */
  private handleHelp(): CommandResult {
    console.log(chalk.cyan('\n📖 Available Commands\n'));
    console.log(chalk.white('  plan <description>    Create a task plan from natural language description'));
    console.log(chalk.white('  execute [plan_id]     Execute the current plan'));
    console.log(chalk.white('  run <description>     Create and execute plan in one step'));
    console.log(chalk.white('  status                Show current status and progress'));
    console.log(chalk.white('  tasks                 List tasks in current plan'));
    console.log(chalk.white('  config                Show configuration status'));
    console.log(chalk.white('  reset                 Reset the system'));
    console.log(chalk.white('  help                  Show this help message'));
    console.log(chalk.white('  exit / quit           Exit the CLI'));
    console.log('');

    return {
      success: true,
      message: 'Help displayed',
    };
  }

  /**
   * 打印计划
   */
  private printPlan(plan: TaskPlan): void {
    console.log(chalk.green(`\n✓ Plan Created: ${plan.id}\n`));
    console.log(chalk.white(`  Summary: ${plan.summary}`));
    console.log(chalk.white(`  Tasks: ${plan.tasks.length}`));
    console.log('');

    for (const task of plan.tasks) {
      const priorityColor = this.getPriorityColor(task.priority);
      console.log(`  ${chalk.white(task.id)} - ${priorityColor(`[P${task.priority}]`)} ${task.description}`);
      console.log(chalk.gray(`    Steps: ${task.steps.length}`));

      if (task.dependencies.length > 0) {
        console.log(chalk.gray(`    Dependencies: ${task.dependencies.join(', ')}`));
      }
    }

    console.log('');
  }

  /**
   * 打印执行摘要
   */
  private printSummary(summary: ExecutionSummary): void {
    const statusText = summary.success
      ? chalk.green('✓ SUCCESS')
      : chalk.red('✗ FAILED');

    console.log(chalk.cyan('\n📊 Execution Summary\n'));
    console.log(`  Status: ${statusText}`);
    console.log(chalk.white(`  Plan ID: ${summary.planId}`));
    console.log(chalk.white(`  Total Tasks: ${summary.totalTasks}`));
    console.log(chalk.green(`  Completed: ${summary.completedTasks}`));

    if (summary.failedTasks > 0) {
      console.log(chalk.red(`  Failed: ${summary.failedTasks}`));
    }

    console.log(chalk.white(`  Duration: ${this.formatDuration(summary.duration)}`));
    console.log('');
  }

  /**
   * 格式化状态
   */
  private formatStatus(status: OrchestratorStatus): string {
    const statusMap: Record<OrchestratorStatus, string> = {
      [OrchestratorStatus.IDLE]: chalk.gray('Idle'),
      [OrchestratorStatus.PLANNING]: chalk.blue('Planning'),
      [OrchestratorStatus.EXECUTING]: chalk.yellow('Executing'),
      [OrchestratorStatus.VALIDATING]: chalk.cyan('Validating'),
      [OrchestratorStatus.REPAIRING]: chalk.magenta('Repairing'),
      [OrchestratorStatus.COMPLETED]: chalk.green('Completed'),
      [OrchestratorStatus.FAILED]: chalk.red('Failed'),
    };

    return statusMap[status] || status;
  }

  /**
   * 获取状态图标
   */
  private getStatusIcon(status: TaskStatus): string {
    const iconMap: Record<TaskStatus, string> = {
      [TaskStatus.PENDING]: chalk.gray('○'),
      [TaskStatus.EXECUTING]: chalk.yellow('◐'),
      [TaskStatus.COMPLETED]: chalk.green('●'),
      [TaskStatus.FAILED]: chalk.red('✗'),
      [TaskStatus.RETRYING]: chalk.magenta('↻'),
      [TaskStatus.CANCELLED]: chalk.gray('⊘'),
    };

    return iconMap[status] || '○';
  }

  /**
   * 获取优先级颜色
   */
  private getPriorityColor(priority: number): (text: string) => string {
    const colorMap: Record<number, (text: string) => string> = {
      1: chalk.gray,
      2: chalk.white,
      3: chalk.yellow,
      4: chalk.red,
    };

    return colorMap[priority] || chalk.white;
  }

  /**
   * 格式化持续时间
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    }

    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }
}
