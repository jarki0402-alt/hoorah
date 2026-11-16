/**
 * "Pemakaian" tab: aggregated use over 24 hours, 7 or 30 days. Rooms opened, games played, how many
 * players, how long rooms live, Pass activations, when people play (weekday x hour, WIB) and which
 * games are played most. No names or room codes: the server only keeps hourly counts.
 */
import { type AdminUsage, USAGE_DAYS, type UsageDays } from '@hoorah/protocol';
import { useEffect, useState } from 'preact/hooks';
import { GAMES } from '../shared/games';
import { api, errorCode } from './api';
import { BarChart, type ChartPoint, Heatmap } from './charts';
import { dayKeyOf, formatDay, formatDuration, formatHour, formatNumber, HOUR } from './format';
import { busiestSlot, share, weekdayOfKey } from './logic';
import { ERRORS, STR, USAGE, USAGE_RANGES, WEEKDAYS_SHORT } from './strings';
import { EmptyState, LoadError, RangeButtons, Stat } from './ui';

const REFRESH_MS = 60_000;
const LOCAL_TZ = 'Asia/Jakarta';

const has = (obj: object, key: string) => Object.hasOwn(obj, key);
const gameTitle = (id: string) => (has(GAMES, id) ? GAMES[id as keyof typeof GAMES].title : id);
const hourText = (h: number) => `${String(h % 24).padStart(2, '0')}.00`;
const weekdayAt = (ms: number) => WEEKDAYS_SHORT[weekdayOfKey(dayKeyOf(ms, LOCAL_TZ))] ?? '';

function points(data: AdminUsage, pick: (p: AdminUsage['series'][number]) => number): ChartPoint[] {
  return data.series.map((p) =>
    data.bucket === 'hour'
      ? {
          value: pick(p),
          label: formatHour(p.at, LOCAL_TZ),
          detail: USAGE.hourRange(
            weekdayAt(p.at),
            formatHour(p.at, LOCAL_TZ),
            formatHour(p.at + HOUR, LOCAL_TZ),
          ),
        }
      : {
          value: pick(p),
          label: formatDay(p.at, LOCAL_TZ),
          detail: `${weekdayAt(p.at)}, ${formatDay(p.at, LOCAL_TZ)}`,
        },
  );
}

const avg = (sum: number, n: number) => (n > 0 ? formatNumber(sum / n, 1) : STR.dash);

function Totals({ t }: { t: AdminUsage['totals'] }) {
  return (
    <dl class="ad-stats ad-stats--3">
      <Stat
        label={USAGE.roomsCreated}
        value={formatNumber(t.roomsCreated)}
        hint={USAGE.roomsCreatedHint(formatNumber(t.roomsClosed))}
      />
      <Stat label={USAGE.gameStarts} value={formatNumber(t.gameStarts)} hint={USAGE.gameStartsHint} />
      <Stat
        label={USAGE.avgPlayersGame}
        value={avg(t.startPlayers, t.gameStarts)}
        hint={USAGE.avgPlayersGameHint}
      />
      <Stat
        label={USAGE.avgDuration}
        value={t.roomsClosed > 0 ? formatDuration((t.roomSeconds / t.roomsClosed) * 1000) : STR.dash}
        hint={USAGE.avgDurationHint}
      />
      <Stat
        label={USAGE.avgPlayersRoom}
        value={avg(t.roomPlayers, t.roomsPlayed)}
        hint={USAGE.avgPlayersRoomHint(formatNumber(Math.max(0, t.roomsClosed - t.roomsPlayed)))}
      />
      <Stat label={USAGE.passes} value={formatNumber(t.passActivations)} hint={USAGE.passesHint} />
    </dl>
  );
}

function TopGames({ games }: { games: AdminUsage['games'] }) {
  const top = games.slice(0, 10);
  const most = top[0]?.plays ?? 0;
  return (
    <ol class="ad-top">
      {top.map((g) => (
        <li key={g.gameId}>
          <div class="ad-top-line">
            <span class="ad-top-name">{gameTitle(g.gameId)}</span>
            <span class="ad-row-value">{USAGE.topPlays(formatNumber(g.plays))}</span>
          </div>
          <span class="ad-top-bar" aria-hidden="true">
            <span class="ad-top-fill" style={{ width: `${(share(g.plays, most) * 100).toFixed(1)}%` }} />
          </span>
          <span class="ad-top-hint">{USAGE.topPlayers(avg(g.players, g.plays))}</span>
        </li>
      ))}
    </ol>
  );
}

function UsageHeatmap({ grid }: { grid: number[][] }) {
  const best = busiestSlot(grid);
  if (!best) return <p class="ad-chart-empty">{USAGE.heatEmpty}</p>;
  const busiest = USAGE.heatBusiest(WEEKDAYS_SHORT[best.day] ?? '', hourText(best.hour));
  return (
    <Heatmap
      grid={grid}
      days={WEEKDAYS_SHORT}
      label={USAGE.heatLabel(busiest)}
      idle={busiest}
      less={USAGE.less}
      more={USAGE.more}
      cellText={(d, h, v) =>
        USAGE.heatCell(WEEKDAYS_SHORT[d] ?? '', hourText(h), hourText(h + 1), formatNumber(v))
      }
    />
  );
}

export function UsageTab() {
  const [days, setDays] = useState<UsageDays>(7);
  const [data, setData] = useState<AdminUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      setBusy(true);
      try {
        const u = await api.usage(days);
        if (!alive) return;
        setData(u);
        setError(null);
      } catch (err) {
        const c = errorCode(err);
        if (alive && c !== 'unauthorized') setError(ERRORS[c]);
      } finally {
        if (alive) setBusy(false);
      }
    };
    void run();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void run();
    }, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [days, reload]);

  const t = data?.totals;
  const nothing =
    t && t.roomsCreated === 0 && t.gameStarts === 0 && t.roomsClosed === 0 && t.passActivations === 0;
  return (
    <section class="ad-section" aria-labelledby="usage-title">
      <div class="ad-section-head">
        <div>
          <h1 id="usage-title" class="ad-title">
            {USAGE.title}
          </h1>
          <p class="ad-lead">{USAGE.lead}</p>
        </div>
      </div>
      <RangeButtons
        label={USAGE.ranges}
        options={USAGE_DAYS}
        value={days}
        names={USAGE_RANGES}
        onChange={setDays}
      />

      {error && <LoadError text={error} onRetry={() => setReload((n) => n + 1)} />}

      {data === null ? (
        !error && <p class="ad-loading">{STR.loading}</p>
      ) : (
        <div class={`ad-usage${busy ? ' is-busy' : ''}`}>
          <Totals t={data.totals} />
          {nothing ? (
            <EmptyState icon="users" title={USAGE.emptyTitle} body={USAGE.emptyBody} />
          ) : (
            <>
              <div class="ad-panels">
                <article class="ad-card ad-panel">
                  <h3 class="ad-card-title">{USAGE.chartGames(data.bucket)}</h3>
                  <BarChart
                    points={points(data, (p) => p.gameStarts)}
                    format={(v) => USAGE.games(formatNumber(v))}
                    axisFormat={(v) => formatNumber(v)}
                    scale="integer"
                    label={USAGE.chartGames(data.bucket)}
                  />
                </article>
                <article class="ad-card ad-panel">
                  <h3 class="ad-card-title">{USAGE.chartRooms(data.bucket)}</h3>
                  <BarChart
                    points={points(data, (p) => p.roomsCreated)}
                    format={(v) => USAGE.rooms(formatNumber(v))}
                    axisFormat={(v) => formatNumber(v)}
                    scale="integer"
                    label={USAGE.chartRooms(data.bucket)}
                  />
                </article>
              </div>
              <article class="ad-card ad-panel">
                <h3 class="ad-card-title">{USAGE.heatTitle}</h3>
                <p class="ad-card-lead">{USAGE.heatLead}</p>
                <UsageHeatmap grid={data.heatmap} />
              </article>
              {data.games.length > 0 && (
                <article class="ad-card ad-panel">
                  <h3 class="ad-card-title">{USAGE.topTitle}</h3>
                  <TopGames games={data.games} />
                </article>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
