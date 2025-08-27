/* eslint-disable @typescript-eslint/no-explicit-any */
enum LogLevel {
  INFO,
  WARN,
  ERROR,
}

const LOG_LEVEL_NAMES = {
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
};

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.INFO;

  private constructor() {}

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  private log(level: LogLevel, message: string, ...args: any[]): void {
    if (level >= this.logLevel) {
      const timestamp = new Date().toISOString();
      const levelName = LOG_LEVEL_NAMES[level];
      console.log(`[${timestamp}] [${levelName}] ${message}`, ...args);
    }
  }

  public info(message: string, ...args: any[]): void {
    this.log(LogLevel.INFO, message, ...args);
  }

  public warn(message: string, ...args: any[]): void {
    this.log(LogLevel.WARN, message, ...args);
  }

  public error(message: string, ...args: any[]): void {
    this.log(LogLevel.ERROR, message, ...args);
  }
}

export const logger = Logger.getInstance();
