import { config } from './config';

const levels = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof levels;

function write(level: Level, msg: string, fields?: Record<string, unknown>): void {
  if (levels[level] < levels[config.logLevel]) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields });
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}

export type Logger = Record<Level, (msg: string, fields?: Record<string, unknown>) => void>;

/** Structured JSON lines; one per event, cheap enough for the hot path at info level. */
export const log: Logger = {
  debug: (m, f) => write('debug', m, f),
  info: (m, f) => write('info', m, f),
  warn: (m, f) => write('warn', m, f),
  error: (m, f) => write('error', m, f),
};
