import { Command } from 'commander';
import chalk from 'chalk';
import { ShellInterface } from './ShellInterface';
import { CommandHandler } from './CommandHandler';
import { validateConfig } from '../../config/env';
import { createLogger } from '../utils/logger';

const logger = createLogger('CLI');

/**
 * CLI 入口
 */
async function main(): Promise<void> {
  const program = new Command();

  program
    .name('ai-agent')
    .description('AI Agent CLI - Intelligent Task Execution System')
    .version('1.0.0');

  // 交互模式命令
  program
    .command('shell')
    .alias('i')
    .description('Start interactive shell mode')
    .action(async () => {
      const shell = new ShellInterface();
      await shell.start();
    });

  // 计划命令
  program
    .command('plan <description>')
    .description('Create a task plan from description')
    .action(async (description: string) => {
      await runSingleCommand('plan', [description]);
    });

  // 执行命令
  program
    .command('run <description>')
    .description('Create and execute a task plan')
    .action(async (description: string) => {
      await runSingleCommand('run', [description]);
    });

  // 配置检查命令
  program
    .command('config')
    .description('Check configuration status')
    .action(async () => {
      await runSingleCommand('config', []);
    });

  // 帮助命令
  program
    .command('help-commands')
    .description('Show available commands')
    .action(async () => {
      await runSingleCommand('help', []);
    });

  // 如果没有提供命令，默认进入交互模式
  if (process.argv.length <= 2) {
    // 检查配置
    const validation = validateConfig();
    if (!validation.valid) {
      console.log(chalk.yellow('\n⚠️ Configuration Warning:\n'));
      for (const error of validation.errors) {
        console.log(chalk.yellow(`  - ${error}`));
      }
      console.log(chalk.gray('\n  Please configure environment variables before using the agent.\n'));
      console.log(chalk.gray('  Copy .env.example to .env and fill in the required values.\n'));
    }

    const shell = new ShellInterface();
    await shell.start();
  } else {
    program.parse();
  }
}

/**
 * 运行单个命令
 */
async function runSingleCommand(command: string, args: string[]): Promise<void> {
  const handler = new CommandHandler();

  try {
    const result = await handler.handleCommand(command, args);

    if (!result.success) {
      console.log(chalk.red(`\nError: ${result.message}\n`));
      process.exit(1);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`\nError: ${errorMessage}\n`));
    logger.error('Command execution error', error);
    process.exit(1);
  }
}

// 运行主函数
main().catch((error) => {
  logger.error('Fatal error', error);
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});
