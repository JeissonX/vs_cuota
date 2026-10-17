/**
 * AG Pro Quota — Logger con OutputChannel y nivel configurable
 */

import * as vscode from 'vscode';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private channel: vscode.OutputChannel | null = null;
  private level: LogLevel = 'info';

  init(channel: vscode.OutputChannel): void {
    this.channel = channel;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  show(): void {
    this.channel?.show(true);
  }

  debug(message: string): void {
    this.log('debug', message);
  }

  info(message: string): void {
    this.log('info', message);
  }

  warn(message: string): void {
    this.log('warn', message);
  }

  error(message: string): void {
    this.log('error', message);
  }

  private sanitize(message: string): string {
    // Redacción preventiva de tokens o contraseñas
    return message.replace(/(--csrf_token[\s=]+)[^\s&]+/gi, '$1[REDACTED]')
                  .replace(/([xX]-[cC]odeium-[cC]srf-[tT]oken:\s*)[^\r\n]+/g, '$1[REDACTED]');
  }

  private log(level: LogLevel, message: string): void {
    if (LOG_PRIORITY[level] < LOG_PRIORITY[this.level]) {
      return;
    }
    const safeMsg = this.sanitize(message);
    const ts = new Date().toISOString().slice(11, 23);
    const tag = level.toUpperCase().padEnd(5);
    const line = `[${ts}] [${tag}] ${safeMsg}`;
    this.channel?.appendLine(line);
  }

  dispose(): void {
    this.channel?.dispose();
    this.channel = null;
  }
}

export const logger = new Logger();
