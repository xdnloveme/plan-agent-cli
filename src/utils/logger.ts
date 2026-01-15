import chalk from 'chalk';
import { config } from '../../config/env';

/**
 * 日志级别枚举
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * 日志级别映射
 */
const LOG_LEVEL_MAP: Record<string, LogLevel> = {
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR,
};

/**
 * 获取当前配置的日志级别
 */
function getCurrentLogLevel(): LogLevel {
  return LOG_LEVEL_MAP[config.logging.level] ?? LogLevel.INFO;
}

/**
 * 格式化时间戳
 */
function formatTimestamp(): string {
  return new Date().toISOString();
}

/**
 * 日志记录器类
 */
export class Logger {
  private context: string;
  private currentLevel: LogLevel;

  constructor(context: string) {
    this.context = context;
    this.currentLevel = getCurrentLogLevel();
  }

  /**
   * 调试日志
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.currentLevel <= LogLevel.DEBUG) {
      console.log(
        chalk.gray(`[${formatTimestamp()}]`),
        chalk.blue('[DEBUG]'),
        chalk.cyan(`[${this.context}]`),
        message,
        ...args
      );
    }
  }

  /**
   * 信息日志
   */
  info(message: string, ...args: unknown[]): void {
    if (this.currentLevel <= LogLevel.INFO) {
      console.log(
        chalk.gray(`[${formatTimestamp()}]`),
        chalk.green('[INFO]'),
        chalk.cyan(`[${this.context}]`),
        message,
        ...args
      );
    }
  }

  /**
   * 警告日志
   */
  warn(message: string, ...args: unknown[]): void {
    if (this.currentLevel <= LogLevel.WARN) {
      console.log(
        chalk.gray(`[${formatTimestamp()}]`),
        chalk.yellow('[WARN]'),
        chalk.cyan(`[${this.context}]`),
        message,
        ...args
      );
    }
  }

  /**
   * 错误日志
   */
  error(message: string, ...args: unknown[]): void {
    if (this.currentLevel <= LogLevel.ERROR) {
      console.error(
        chalk.gray(`[${formatTimestamp()}]`),
        chalk.red('[ERROR]'),
        chalk.cyan(`[${this.context}]`),
        message,
        ...args
      );
    }
  }

  /**
   * 成功日志（总是显示）
   */
  success(message: string, ...args: unknown[]): void {
    console.log(
      chalk.gray(`[${formatTimestamp()}]`),
      chalk.green.bold('[SUCCESS]'),
      chalk.cyan(`[${this.context}]`),
      chalk.green(message),
      ...args
    );
  }

  /**
   * 任务进度日志
   */
  progress(current: number, total: number, message: string): void {
    const percentage = Math.round((current / total) * 100);
    const progressBar = this.createProgressBar(percentage);
    console.log(
      chalk.gray(`[${formatTimestamp()}]`),
      chalk.blue('[PROGRESS]'),
      chalk.cyan(`[${this.context}]`),
      progressBar,
      `${percentage}%`,
      message
    );
  }

  /**
   * 创建进度条
   */
  private createProgressBar(percentage: number): string {
    const filled = Math.round(percentage / 5);
    const empty = 20 - filled;
    return chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  }
}

/**
 * 创建日志记录器实例
 */
export function createLogger(context: string): Logger {
  return new Logger(context);
}
