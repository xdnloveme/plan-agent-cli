/**
 * Log level type
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Log entry
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: string;
  data?: Record<string, unknown>;
}

/**
 * Logger options
 */
export interface LoggerOptions {
  /** Minimum log level to output */
  level?: LogLevel;
  /** Context prefix for all logs */
  context?: string;
  /** Enable timestamps */
  timestamps?: boolean;
  /** Enable colored output */
  colors?: boolean;
  /** Custom log handler */
  handler?: (entry: LogEntry) => void;
}

/**
 * Log level priority
 */
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * ANSI color codes
 */
const COLORS = {
  reset: '\x1b[0m',
  debug: '\x1b[36m', // cyan
  info: '\x1b[32m', // green
  warn: '\x1b[33m', // yellow
  error: '\x1b[31m', // red
  context: '\x1b[90m', // gray
};

/**
 * Structured logger for the agent framework
 */
export class Logger {
  private level: LogLevel;
  private context?: string;
  private timestamps: boolean;
  private colors: boolean;
  private handler?: (entry: LogEntry) => void;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? 'info';
    this.context = options.context;
    this.timestamps = options.timestamps ?? true;
    this.colors = options.colors ?? true;
    this.handler = options.handler;
  }

  /**
   * Create a child logger with additional context
   */
  child(context: string): Logger {
    const childContext = this.context ? `${this.context}:${context}` : context;
    return new Logger({
      level: this.level,
      context: childContext,
      timestamps: this.timestamps,
      colors: this.colors,
      handler: this.handler,
    });
  }

  /**
   * Log a debug message
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  /**
   * Log an info message
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  /**
   * Log a warning message
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  /**
   * Log an error message
   */
  error(message: string, data?: Record<string, unknown>): void {
    this.log('error', message, data);
  }

  /**
   * Log an error object
   */
  logError(error: Error, message?: string): void {
    this.error(message ?? error.message, {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
  }

  /**
   * Internal log method
   */
  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (LOG_LEVELS[level] < LOG_LEVELS[this.level]) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      context: this.context,
      data,
    };

    if (this.handler) {
      this.handler(entry);
    } else {
      this.defaultHandler(entry);
    }
  }

  /**
   * Default console output handler
   */
  private defaultHandler(entry: LogEntry): void {
    const parts: string[] = [];

    // Timestamp
    if (this.timestamps) {
      const ts = entry.timestamp.toISOString();
      parts.push(this.colors ? `${COLORS.context}${ts}${COLORS.reset}` : ts);
    }

    // Level
    const levelStr = entry.level.toUpperCase().padEnd(5);
    if (this.colors) {
      parts.push(`${COLORS[entry.level]}${levelStr}${COLORS.reset}`);
    } else {
      parts.push(levelStr);
    }

    // Context
    if (entry.context) {
      const ctx = `[${entry.context}]`;
      parts.push(this.colors ? `${COLORS.context}${ctx}${COLORS.reset}` : ctx);
    }

    // Message
    parts.push(entry.message);

    // Data
    if (entry.data && Object.keys(entry.data).length > 0) {
      parts.push(JSON.stringify(entry.data));
    }

    const output = parts.join(' ');

    switch (entry.level) {
      case 'debug':
      case 'info':
        // eslint-disable-next-line no-console
        console.log(output);
        break;
      case 'warn':
        // eslint-disable-next-line no-console
        console.warn(output);
        break;
      case 'error':
        // eslint-disable-next-line no-console
        console.error(output);
        break;
    }
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.level;
  }
}

/**
 * Create a JSON logger for structured logging
 */
export function createJsonLogger(options: Omit<LoggerOptions, 'handler'> = {}): Logger {
  return new Logger({
    ...options,
    colors: false,
    handler: (entry) => {
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          timestamp: entry.timestamp.toISOString(),
          level: entry.level,
          context: entry.context,
          message: entry.message,
          ...entry.data,
        })
      );
    },
  });
}

/**
 * Global logger instance
 */
let globalLogger: Logger | null = null;

/**
 * Get or create global logger
 */
export function getGlobalLogger(options?: LoggerOptions): Logger {
  if (!globalLogger) {
    globalLogger = new Logger(options);
  }
  return globalLogger;
}

/**
 * Reset global logger
 */
export function resetGlobalLogger(): void {
  globalLogger = null;
}
