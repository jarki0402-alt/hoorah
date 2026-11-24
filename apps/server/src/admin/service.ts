/** What the dashboard does with passes, rooms and the server; the HTTP layer only translates. */
import {
  type AdminConfig,
  type AdminEgress,
  type AdminErrorGroup,
  type AdminEvent,
  type AdminPass,
  type AdminPassCreate,
  type AdminPassUpdate,
  type AdminReportList,
  type AdminRoom,
  type AdminStats,
  type AdminSystem,
  type AdminSystemHistory,
  type AdminUsage,
  generatePassCode,
  PASS_MAX_DURATION_MS,
  parseAppConfig,
  type ReportStatus,
  type SystemHistoryHours,
  type UsageDays,
} from '@hoorah/protocol';
import { dbSizeKb } from '../db';
import type { Monitor } from '../metrics/monitor';
import type { SecurityLog } from '../metrics/security';
import type { UsageStore } from '../metrics/usage';
import { type NewPass, type PassRepository, type PassRow, passStatus } from '../passes';
import type { ErrorRepository, ReportRepository } from '../reports';
import type { RoomManager } from '../rooms';
import type { SettingsRepository } from '../settings';

/** A pass must still run at least this long when it is saved. */
const MIN_REMAINING_MS = 60_000;
const DAY_MS = 24 * 60 * 60_000;

export type PassSaveError = 'code_taken' | 'expired_time' | 'not_found';

export interface AdminServiceDeps {
  passes: PassRepository;
  rooms: RoomManager;
  now: () => number;
  random: () => number;
  dbFile: string;
  startedAt: number;
  /** Monitoring (live numbers, samples, egress); without it the monitoring calls are not available. */
  monitor?: Monitor;
  usage?: UsageStore;
  security?: SecurityLog;
  /** Settings, reports and device errors; without them those calls answer null/empty. */
  settings?: SettingsRepository;
  reports?: ReportRepository;
  errors?: ErrorRepository;
}

export class AdminService {
  constructor(private readonly d: AdminServiceDeps) {}

  listPasses(): AdminPass[] {
    const live = this.d.rooms.passLiveCounts();
    const now = this.d.now();
    return this.d.passes.list().map((r) => this.view(r, live.get(r.id) ?? 0, now));
  }

  /** One pass, or a batch of single codes (`count`) sharing the label and settings. */
  createPass(input: AdminPassCreate, adminId: number): AdminPass[] | PassSaveError {
    const now = this.d.now();
    if (!this.validEnd(input.expiresAt, now)) return 'expired_time';
    const kind = input.kind ?? 'shared';
    const base: Omit<NewPass, 'code'> = {
      label: input.label,
      kind,
      durationMs: kind === 'shared' ? null : (input.durationDays ?? 1) * DAY_MS,
      maxUses: kind === 'promo' ? (input.maxUses ?? null) : null,
      maxPlayers: input.maxPlayers,
      maxRooms: input.maxRooms,
      expiresAt: input.expiresAt,
      createdBy: adminId,
      now,
    };
    const count = kind === 'single' ? Math.max(1, input.count ?? 1) : 1;
    if (input.code) {
      if (count > 1) return 'code_taken';
      const id = this.d.passes.insert({ ...base, code: input.code });
      if (id === null) return 'code_taken';
      const view = this.passView(id);
      return view ? [view] : 'not_found';
    }
    const ids = this.d.passes.transaction(() => {
      const out: number[] = [];
      for (let n = 0; n < count; n++) {
        // 31^8 codes: a clash is very unlikely, but retry instead of failing.
        let id: number | null = null;
        for (let i = 0; i < 8 && id === null; i++) {
          id = this.d.passes.insert({ ...base, code: generatePassCode(this.d.random) });
        }
        if (id === null) return null;
        out.push(id);
      }
      return out;
    });
    if (ids === null) return 'code_taken';
    const views = ids.map((id) => this.passView(id)).filter((v): v is AdminPass => v !== null);
    return views.length === ids.length ? views : 'not_found';
  }

  updatePass(id: number, input: AdminPassUpdate): AdminPass | PassSaveError {
    const now = this.d.now();
    if (input.expiresAt !== undefined && !this.validEnd(input.expiresAt, now)) return 'expired_time';
    const ok = this.d.passes.update(id, {
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.maxPlayers !== undefined ? { maxPlayers: input.maxPlayers } : {}),
      ...(input.maxRooms !== undefined ? { maxRooms: input.maxRooms } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      ...(input.revoked !== undefined ? { revokedAt: input.revoked ? now : null } : {}),
    });
    if (!ok) return 'not_found';
    this.d.rooms.refreshPass(id);
    return this.passView(id) ?? 'not_found';
  }

  deletePass(id: number): boolean {
    const ok = this.d.passes.delete(id);
    if (ok) this.d.rooms.refreshPass(id);
    return ok;
  }

  rooms(): AdminRoom[] {
    return this.d.rooms.adminRooms();
  }

  config(): AdminConfig {
    return this.d.rooms.appConfig;
  }

  /** Applies a partial or full settings body on top of the current one; null without storage. */
  setConfig(body: unknown): AdminConfig | null {
    if (!this.d.settings) return null;
    const next = parseAppConfig(body, this.d.rooms.appConfig);
    this.d.settings.saveConfig(next);
    this.d.rooms.setConfig(next);
    return next;
  }

  reports(status?: ReportStatus): AdminReportList {
    return this.d.reports?.list(status) ?? { reports: [], counts: { baru: 0, diproses: 0, selesai: 0 } };
  }

  setReportStatus(id: number, status: ReportStatus): boolean {
    return this.d.reports?.setStatus(id, status) ?? false;
  }

  errors(): AdminErrorGroup[] {
    return this.d.errors?.list() ?? [];
  }

  deleteError(id: number): boolean {
    return this.d.errors?.delete(id) ?? false;
  }

  clearErrors(): number {
    return this.d.errors?.clear() ?? 0;
  }

  stats(): AdminStats {
    const mem = process.memoryUsage();
    const now = this.d.now();
    return {
      startedAt: this.d.startedAt,
      uptimeSec: Math.round((now - this.d.startedAt) / 1000),
      rssMb: Math.round(mem.rss / 1048576),
      heapUsedMb: Math.round(mem.heapUsed / 1048576),
      rooms: this.d.rooms.roomCount,
      players: this.d.rooms.playerCount,
      sockets: this.d.rooms.connectionCount,
      node: process.version,
      dbKb: dbSizeKb(this.d.dbFile),
    };
  }

  async system(): Promise<AdminSystem | null> {
    return this.d.monitor ? this.d.monitor.system() : null;
  }

  history(hours: SystemHistoryHours): AdminSystemHistory | null {
    return this.d.monitor?.history(hours) ?? null;
  }

  async egress(): Promise<AdminEgress | null> {
    return this.d.monitor ? this.d.monitor.egress() : null;
  }

  usage(days: UsageDays): AdminUsage | null {
    return this.d.usage?.summary(days, this.d.now()) ?? null;
  }

  events(): AdminEvent[] {
    return this.d.security?.list() ?? [];
  }

  private validEnd(expiresAt: number, now: number): boolean {
    return expiresAt >= now + MIN_REMAINING_MS && expiresAt <= now + PASS_MAX_DURATION_MS;
  }

  private passView(id: number): AdminPass | null {
    const row = this.d.passes.row(id);
    if (!row) return null;
    return this.view(row, this.d.rooms.passLiveCounts().get(id) ?? 0, this.d.now());
  }

  private view(r: PassRow, liveRooms: number, now: number): AdminPass {
    return {
      id: r.id,
      code: r.code,
      label: r.label,
      kind: r.kind,
      durationMs: r.durationMs,
      maxUses: r.maxUses,
      uses: r.uses,
      firstStartedAt: r.firstStartedAt,
      lastRunsUntil: r.lastRunsUntil,
      maxPlayers: r.maxPlayers,
      maxRooms: r.maxRooms,
      expiresAt: r.expiresAt,
      revokedAt: r.revokedAt,
      createdAt: r.createdAt,
      status: passStatus(r, now),
      liveRooms,
      roomsUsed: r.roomsUsed,
      peakPlayers: r.peakPlayers,
      lastUsedAt: r.lastUsedAt,
    };
  }
}
