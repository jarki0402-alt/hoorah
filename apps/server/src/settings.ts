/** The owner's settings (`AppConfig`), changed in the admin dashboard and kept in SQLite. */
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import { type AppConfig, DEFAULT_CONFIG, parseAppConfig } from '@hoorah/protocol';

const CONFIG_KEY = 'app_config';

export class SettingsRepository {
  private readonly getQ: StatementSync;
  private readonly putQ: StatementSync;

  /** `defaults`: the config before the owner ever saved one (see config.openAllDefault). */
  constructor(
    db: DatabaseSync,
    private readonly defaults: AppConfig = DEFAULT_CONFIG,
  ) {
    this.getQ = db.prepare('SELECT value FROM settings WHERE key = ?');
    this.putQ = db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    );
  }

  /** The stored config; missing or broken fields fall back to the defaults. */
  config(): AppConfig {
    const row = this.getQ.get(CONFIG_KEY) as { value: string } | undefined;
    if (!row) return this.defaults;
    try {
      return parseAppConfig(JSON.parse(row.value), this.defaults);
    } catch {
      return this.defaults;
    }
  }

  saveConfig(config: AppConfig): void {
    this.putQ.run(CONFIG_KEY, JSON.stringify(config));
  }
}
