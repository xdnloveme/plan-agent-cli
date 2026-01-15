import * as readline from 'readline';
import chalk from 'chalk';
import { CommandHandler } from './CommandHandler';
import { createLogger } from '../utils/logger';

const logger = createLogger('ShellInterface');

/**
 * 交互式 Shell 接口
 */
export class ShellInterface {
  private rl: readline.Interface | null = null;
  private commandHandler: CommandHandler;
  private isRunning: boolean = false;

  constructor() {
    this.commandHandler = new CommandHandler();
  }

  /**
   * 启动交互式 Shell
   */
  async start(): Promise<void> {
    this.printBanner();

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.cyan('ai-agent> '),
    });

    this.isRunning = true;

    this.rl.on('line', async (line) => {
      await this.processInput(line.trim());
      if (this.isRunning && this.rl) {
        this.rl.prompt();
      }
    });

    this.rl.on('close', () => {
      this.shutdown();
    });

    // 处理 SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n\nReceived SIGINT. Shutting down...'));
      this.shutdown();
    });

    this.rl.prompt();

    logger.info('Shell interface started');
  }

  /**
   * 处理用户输入
   */
  private async processInput(input: string): Promise<void> {
    if (!input) {
      return;
    }

    // 处理退出命令
    if (input === 'exit' || input === 'quit') {
      this.shutdown();
      return;
    }

    // 解析命令和参数
    const parts = this.parseInput(input);
    const command = parts[0];
    const args = parts.slice(1);

    try {
      const result = await this.commandHandler.handleCommand(command, args);

      if (!result.success) {
        console.log(chalk.red(`\nError: ${result.message}\n`));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(chalk.red(`\nUnexpected error: ${errorMessage}\n`));
      logger.error('Command processing error', error);
    }
  }

  /**
   * 解析输入，支持引号包围的参数
   */
  private parseInput(input: string): string[] {
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < input.length; i++) {
      const char = input[i];

      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false;
        quoteChar = '';
      } else if (char === ' ' && !inQuotes) {
        if (current) {
          parts.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current) {
      parts.push(current);
    }

    return parts;
  }

  /**
   * 打印启动横幅
   */
  private printBanner(): void {
    console.log('');
    console.log(chalk.cyan('╔══════════════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║                                                              ║'));
    console.log(chalk.cyan('║    ') + chalk.white.bold('AI Agent CLI') + chalk.gray(' - Intelligent Task Execution System') + chalk.cyan('     ║'));
    console.log(chalk.cyan('║                                                              ║'));
    console.log(chalk.cyan('║    ') + chalk.gray('Three-Layer Architecture: Plan → Run → Quality') + chalk.cyan('          ║'));
    console.log(chalk.cyan('║                                                              ║'));
    console.log(chalk.cyan('╚══════════════════════════════════════════════════════════════╝'));
    console.log('');
    console.log(chalk.gray('  Type "help" for available commands, "exit" to quit.'));
    console.log('');
  }

  /**
   * 关闭 Shell
   */
  private shutdown(): void {
    this.isRunning = false;

    console.log(chalk.cyan('\n👋 Goodbye!\n'));

    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    process.exit(0);
  }

  /**
   * 检查 Shell 是否正在运行
   */
  isActive(): boolean {
    return this.isRunning;
  }
}
