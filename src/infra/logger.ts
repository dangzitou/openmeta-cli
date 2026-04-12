import chalk from 'chalk';

export type LogLevel = 'info' | 'success' | 'warn' | 'error' | 'debug';

export class Logger {
  private prefix: string;

  constructor(prefix: string = '') {
    this.prefix = prefix;
  }

  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    const timestamp = new Date().toISOString().split('T')[1]?.slice(0, 8) || '';
    const prefix = this.prefix ? `[${this.prefix}] ` : '';

    const format: Record<LogLevel, string> = {
      info: chalk.blue('[INFO]'),
      success: chalk.green('[SUCCESS]'),
      warn: chalk.yellow('[WARN]'),
      error: chalk.red('[ERROR]'),
      debug: chalk.gray('[DEBUG]'),
    };

    console.log(`${chalk.gray(timestamp)} ${format[level]} ${prefix}${message}`, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.log('info', message, ...args);
  }

  success(message: string, ...args: unknown[]): void {
    this.log('success', message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log('warn', message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.log('error', message, ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    this.log('debug', message, ...args);
  }
}

export const logger = new Logger();
