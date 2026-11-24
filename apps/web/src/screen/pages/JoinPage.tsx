import { formatRoomCode } from '@hoorah/protocol';
import { useEffect, useRef, useState } from 'preact/hooks';
import { switchRole } from '../../shared/device';
import { CATALOG, GAMES } from '../../shared/games';
import { KeyArt } from '../../shared/keyart';
import { FLAG_ICON_PATH } from '../../shared/report';
import { REPORT_STR } from '../../shared/reportStrings';
import { Avatar, Icon, type IconName, Logo } from '../../shared/ui';
import {
  AccessChip,
  FocusButton,
  FullscreenButton,
  inviteUrl,
  joinOrigin,
  QrCard,
  SoundButton,
} from '../components';
import { setFocusMap } from '../nav';
import {
  code,
  goHome,
  maxPlayers,
  players,
  rtt,
  runTopBar,
  startFullscreen,
  TOP_BAR_IDS,
  unlockAudio,
} from '../store';
import { JOIN } from '../strings';

const STEPS: { t: string; d: string; icon: IconName }[] = [
  { t: 'Scan QR', d: 'Pakai kamera HP, tanpa install aplikasi', icon: 'scan' },
  { t: 'Tulis nama & pilih tokohmu', d: '24 tokoh, atur kulit, rambut, dan bajunya', icon: 'smile' },
  { t: 'Lihat layar ini', d: 'HP-mu otomatis jadi stik game', icon: 'tv' },
];

function FlagIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-width={2.4}
      stroke-linecap="round"
      stroke-linejoin="round"
      style={{ flex: 'none' }}
    >
      <path d={FLAG_ICON_PATH} />
    </svg>
  );
}

/**
 * "Laporkan masalah" on the main screen only explains where to send it: typing on a big screen
 * with a remote is hard, so the form lives on the phones.
 */
function ReportInfo({ onClose }: { onClose: () => void }) {
  useEffect(
    () =>
      setFocusMap(
        { rows: [['report-close']], onOk: onClose, onBack: onClose, onMenu: onClose },
        'report-close',
      ),
    [],
  );
  return (
    <div
      class="overlay pause-screen"
      style={{ background: 'rgba(17, 18, 20, 0.97)' }}
      role="dialog"
      aria-modal="true"
      aria-label={REPORT_STR.screenTitle}
    >
      <div class="pause-card">
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 88,
            height: 88,
            borderRadius: '50%',
            background: 'var(--yellow)',
            color: 'var(--ink)',
          }}
        >
          <FlagIcon size={40} />
        </span>
        <h1 class="display pause-title" style={{ fontSize: 64 }}>
          {REPORT_STR.screenTitle}
        </h1>
        <div style={{ fontSize: 30, fontWeight: 800, color: '#fff', maxWidth: 760 }}>
          {REPORT_STR.screenBody}
        </div>
        <div style={{ fontSize: 18, color: 'var(--text-3)', maxWidth: 640 }}>{REPORT_STR.screenSub}</div>
        <div class="pause-actions">
          <FocusButton id="report-close" class="btn primary">
            {REPORT_STR.close}
          </FocusButton>
        </div>
      </div>
    </div>
  );
}

export function JoinPage() {
  const [reportInfo, setReportInfo] = useState(false);
  // Focus lands on Mulai at first, and back on "Laporkan masalah" after its overlay closes.
  const landOn = useRef('start');
  useEffect(() => {
    // The report explanation owns the remote while it is open.
    if (reportInfo) return;
    return setFocusMap(
      {
        rows: [['report', ...TOP_BAR_IDS], ['start']],
        onOk: (id) => {
          if (runTopBar(id)) return;
          if (id === 'report') {
            landOn.current = 'report';
            setReportInfo(true);
            return;
          }
          unlockAudio();
          goHome();
          // After goHome: leaving the join page clears toasts, and this one must stay.
          startFullscreen();
        },
      },
      landOn.current,
    );
  }, [reportInfo]);

  const origin = joinOrigin();
  const list = players.value;
  const max = maxPlayers.value;
  const empty = Math.max(0, max - list.length);
  const ping = rtt.value;

  return (
    <div class="page join">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Logo size={30} />
        <div style={{ display: 'flex', gap: 10 }}>
          <div class="chip">
            <span class={`dot ${ping > 200 ? 'bad' : ping > 80 ? 'warn' : ''}`} />
            {ping ? `Jaringan ${ping > 200 ? 'lambat' : 'baik'} · ${ping} ms` : 'Mengukur jaringan…'}
          </div>
          <button
            type="button"
            class="chip"
            style={{ border: 'none', cursor: 'pointer' }}
            onClick={() => switchRole('controller')}
          >
            <Icon name="tap" size={14} />
            Pakai sebagai kontroler
          </button>
          <FocusButton
            id="report"
            class="chip glass"
            style={{ border: 'none', padding: '7px 12px', cursor: 'pointer' }}
          >
            <FlagIcon size={15} />
            {REPORT_STR.open}
          </FocusButton>
          <SoundButton />
          <FullscreenButton label />
        </div>
      </div>

      <div class="join-main">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div class="eyebrow">ROOM SIAP</div>
            <h1 class="display" style={{ margin: 0, fontSize: 52 }}>
              Ambil HP-mu,
              <br />
              ayo main bareng!
            </h1>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {STEPS.map((s, i) => (
              <div class="step" key={s.t} style={{ animationDelay: `${0.1 + i * 0.08}s` }}>
                <div class="step-icon">
                  <Icon name={s.icon} size={22} color="#FFC928" />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{s.t}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{s.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          {code.value ? (
            <QrCard text={inviteUrl(code.value)} size={260} />
          ) : (
            <div class="qr-card" style={{ width: 260, height: 260 }} />
          )}
          <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-3)' }}>
            atau buka <b style={{ color: '#fff' }}>{origin.replace(/^https?:\/\//, '')}</b> lalu ketik
          </div>
          <div class="display room-code">{formatRoomCode(code.value) || '··· ···'}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Yang sudah masuk</div>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-3)' }}
            >
              <AccessChip />
              <span>
                <b style={{ color: '#fff' }}>{list.length}</b> / {max}
              </span>
            </div>
          </div>
          {list.slice(0, 4).map((p) => (
            <div
              class="player-row"
              key={p.id}
              style={{ boxShadow: `inset 0 0 0 2px ${p.color}`, opacity: p.connected ? 1 : 0.5 }}
            >
              <Avatar look={p.look} ring={p.color} size={52} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 18, fontWeight: 800 }}>
                  {p.name}
                  {p.isHost && (
                    <span
                      class="tag"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11 }}
                    >
                      <Icon name="crown" size={11} color="#111214" />
                      HOST
                    </span>
                  )}
                </div>
                <div
                  class={p.picking ? 'player-picking' : undefined}
                  style={{ fontSize: 13, color: p.picking ? 'var(--yellow)' : 'var(--text-3)' }}
                >
                  {!p.connected
                    ? JOIN.away
                    : p.picking
                      ? JOIN.picking
                      : p.isHost
                        ? JOIN.hostPicking
                        : JOIN.ready}
                </div>
              </div>
            </div>
          ))}
          {list.length > 4 && (
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>+{list.length - 4} pemain lain</div>
          )}
          {Array.from({ length: Math.min(empty, 2) }, (_, i) => (
            <div class="player-row empty" key={`e${i}`}>
              <div class="slot-plus">
                <Icon name="plus" size={22} color="#5B5E66" />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-2)' }}>Kursi kosong</div>
                <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
                  {list.length === 0 ? 'Scan QR untuk jadi Host' : 'Ajak 1 teman lagi'}
                </div>
              </div>
            </div>
          ))}
          {max <= 2 && (
            <div class="player-row locked">
              <Icon name="lock" size={18} color="#FFC928" />
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                Kursi 3–16 terbuka dengan <b style={{ color: 'var(--yellow)' }}>Kacaw Pass</b>
              </div>
            </div>
          )}
          <FocusButton id="start" class="btn primary" style={{ marginTop: 4 }}>
            <Icon name="play" size={18} color="#111214" />
            Mulai
          </FocusButton>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Yang bisa kalian mainkan</div>
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Game baru setiap bulan</div>
        </div>
        <div class="showcase">
          {CATALOG.map((id, i) => (
            <div
              key={id}
              style={{
                position: 'relative',
                opacity: GAMES[id].available ? 1 : 0.6,
                animationDelay: `${0.15 + i * 0.06}s`,
              }}
            >
              <KeyArt id={id} width={223} radius={12} />
              {!GAMES[id].available && (
                <span
                  class="tag"
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: 8,
                    background: '#111214',
                    color: '#fff',
                    fontSize: 10,
                  }}
                >
                  SEGERA
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      {reportInfo && <ReportInfo onClose={() => setReportInfo(false)} />}
    </div>
  );
}
