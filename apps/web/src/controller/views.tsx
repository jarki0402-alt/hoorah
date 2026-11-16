import type { ControllerView } from '@hoorah/protocol';
import { useEffect, useRef, useState } from 'preact/hooks';
import { celebrate, confetti } from '../shared/confetti';
import { Icon } from '../shared/ui';
import { ChessView } from './chess';
import { Me, PlayerAvatar, Timer, usePress, useSecondsLeft, type V } from './common';
import { MenuView } from './menu';
import { DriveView, GestureView } from './motion';
import { PadView } from './pad';
import { action, haptic, react, serverNow, tap } from './store';
import { STR } from './strings';
import { WordView } from './word';

function Actions({ actions }: { actions: NonNullable<V<'message'>['actions']> }) {
  return (
    <div
      class="view-actions"
      style={{ gridTemplateColumns: `repeat(${Math.min(2, actions.length)}, minmax(0, 1fr))` }}
    >
      {actions.map((a) => (
        <button
          type="button"
          key={a.id}
          class={`big-btn ${a.style === 'secondary' ? 'secondary' : a.style === 'yellow' ? 'yellow' : ''}`}
          onPointerDown={() => {
            haptic(20);
            // Game-defined buttons go to the game; a rematch request is a platform-level thing.
            if (a.id === 'rematch') react('rematch');
            action(a.id);
          }}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ views */

function MessageView({ v }: { v: V<'message'> }) {
  return (
    <div class={`ctrl msg-view ${v.eyebrow ? 'has-eyebrow' : ''}`}>
      <div class="panes">
        <div class="pane">
          {v.eyebrow && <div class="eyebrow soft">{v.eyebrow}</div>}
          <div class="hero-avatar">
            {v.avatarOf !== undefined ? <PlayerAvatar id={v.avatarOf} size={120} /> : <Me size={120} />}
          </div>
          <h1 class="title">{v.title}</h1>
          {v.subtitle && <div class="muted view-sub">{v.subtitle}</div>}
        </div>
        {(v.stats || (v.actions && v.actions.length > 0) || v.reactions) && (
          <div class="pane">
            {v.stats && (
              <div class="stat-grid">
                {v.stats.map((s) => (
                  <div class="stat" key={s.label}>
                    <div class="k">{s.label}</div>
                    <div class="v">{s.value}</div>
                  </div>
                ))}
              </div>
            )}
            <div class="spacer" />
            {v.actions && v.actions.length > 0 && (
              <div class="msg-actions">
                <Actions actions={v.actions} />
                <div class="muted msg-note">{STR.reactNote}</div>
              </div>
            )}
            {v.reactions && <WaitReactions />}
          </div>
        )}
      </div>
    </div>
  );
}

/** Cheer or boo while someone else plays; the bubbles appear on the main screen. */
function WaitReactions() {
  const [cheer, fireCheer] = usePress();
  const [boo, fireBoo] = usePress();
  return (
    <div class="msg-actions">
      <div class="row" style={{ gap: 10 }}>
        <button
          type="button"
          class={`big-btn yellow react-btn ${cheer ? 'pressed' : ''}`}
          style={{ flex: 1 }}
          onPointerDown={() => {
            fireCheer();
            haptic(12);
            react('cheer');
          }}
        >
          {STR.reactCheer}
        </button>
        <button
          type="button"
          class={`big-btn secondary react-btn ${boo ? 'pressed' : ''}`}
          style={{ flex: 1 }}
          onPointerDown={() => {
            fireBoo();
            haptic(12);
            react('boo');
          }}
        >
          {STR.reactBoo}
        </button>
      </div>
      <div class="muted msg-note">{STR.reactNote}</div>
    </div>
  );
}

function ChoiceView({ v }: { v: V<'choice'> }) {
  const [picked, setPicked] = useState<string | null>(null);
  const expired = useSecondsLeft(v.deadline) === 0;
  const done = v.progress?.done ?? 0;
  const total = v.progress?.total ?? 0;
  return (
    <div class="ctrl choice-view">
      <div class="panes">
        <div class="pane">
          <div class="row">
            <Me />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{v.title}</div>
              {total > 0 && (
                <div class="pips">
                  {Array.from({ length: total }, (_, i) => (
                    <span
                      key={i}
                      style={{ background: i < done ? '#22B35E' : i === done ? '#FFC928' : undefined }}
                    />
                  ))}
                </div>
              )}
            </div>
            {(v.streak ?? 0) >= 2 && (
              <span class="badge" style={{ background: '#FF8A3D' }}>
                <Icon name="fire" size={13} color="#111214" />
                {v.streak}
              </span>
            )}
            <Timer deadline={v.deadline} />
          </div>
          {v.prompt && <div class="prompt t-panel">{v.prompt}</div>}
        </div>
        <div class="pane zone answers">
          {v.options.map((o) => (
            <button
              type="button"
              key={o.id}
              class={`answer ${picked === o.id ? 'pressed' : ''} ${picked && picked !== o.id ? 'faded' : ''}`}
              style={{
                background: o.color,
                boxShadow: picked === o.id ? `0 1px 0 ${o.dark}` : `0 7px 0 ${o.dark}`,
              }}
              disabled={picked !== null || expired}
              onPointerDown={() => {
                if (picked || expired) return;
                setPicked(o.id);
                haptic(25);
                action('answer', o.id);
              }}
            >
              <span class="letter" style={{ color: o.color }}>
                {o.id}
              </span>
              <span class="label">{o.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function LockedView({ v }: { v: V<'locked'> }) {
  return (
    <div class="ctrl locked-view">
      <div class="panes">
        <div class="pane">
          <div
            class="result-burst locked-card"
            style={{
              background: v.color,
              boxShadow: `0 8px 0 ${v.dark}, 0 0 0 4px var(--t-bg), 0 0 0 8px var(--text)`,
            }}
          >
            <span class="letter" style={{ color: v.color }}>
              {v.key}
            </span>
            <span class="locked-label">{v.label}</span>
          </div>
        </div>
        <div class="pane">
          <h1 class="title">{v.title}</h1>
          <div class="chips">
            {v.chips.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <div class="spacer" />
          {v.waitingFor && v.waitingFor.length > 0 && (
            <div class="row t-panel wait-row">
              <div class="row" style={{ gap: 0 }}>
                {v.waitingFor.slice(0, 4).map((id) => (
                  <div key={id} style={{ marginRight: -8 }}>
                    <PlayerAvatar id={id} size={34} />
                  </div>
                ))}
              </div>
              <div class="muted" style={{ marginLeft: 12, color: 'var(--text-2)' }}>
                Menunggu {v.waitingFor.length} pemain lagi…
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SwingTrack({ swing }: { swing: NonNullable<V<'button'>['swing']> }) {
  const block = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const el = block.current;
      const tr = track.current;
      if (el && tr) {
        const phase = ((serverNow() - swing.start) / swing.period) * Math.PI * 2;
        const x = (Math.sin(phase) * 0.5 + 0.5) * tr.clientWidth;
        el.style.transform = `translateX(${x}px)`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [swing.start, swing.period]);
  const zone = Math.max(0.04, Math.min(0.5, swing.zone));
  return (
    <div class="t-panel swing-panel">
      <div class="muted swing-label">
        {swing.label ?? 'Posisi crane (lihat layar utama untuk lebih jelas)'}
      </div>
      <div class="swing-track" ref={track}>
        <div class="rail" />
        <div class="zone" style={{ left: `${(0.5 - zone / 2) * 100}%`, width: `${zone * 100}%` }} />
        <div class="block" ref={block} />
      </div>
      <div class="row" style={{ justifyContent: 'space-between', fontSize: 12, color: 'var(--text-3)' }}>
        <span>kiri</span>
        <span style={{ color: 'var(--t-good)', fontWeight: 800 }}>zona PAS</span>
        <span>kanan</span>
      </div>
    </div>
  );
}

function ButtonView({ v }: { v: V<'button'> }) {
  const [used, setUsed] = useState(false);
  const [pressed, fire] = usePress();
  return (
    <div class={`ctrl turn button-view ${v.swing ? 'has-swing' : ''}`}>
      <div class="panes">
        <div class="pane">
          <div class="row">
            <Me size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div class="eyebrow">{v.eyebrow}</div>
              <div class="button-title">{v.title}</div>
            </div>
            <Timer deadline={v.deadline} />
          </div>
          {v.swing && <SwingTrack swing={v.swing} />}
          <div class="muted press-hint">{v.hint ?? 'Ketuk sekali.'}</div>
        </div>
        <div class="pane zone drop-zone">
          <div class="drop-base">
            <button
              type="button"
              class={`round-btn ${pressed ? 'pressed' : ''}`}
              disabled={used}
              onPointerDown={() => {
                if (used) return;
                fire();
                setUsed(true);
                haptic(40);
                action('drop');
              }}
            >
              <Icon name="down" size={44} color={used ? '#A8ABB2' : '#111214'} stroke={3} />
              {used ? 'TERKIRIM' : v.label}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TapView({ v }: { v: V<'tap'> }) {
  const ring = useRef<HTMLDivElement>(null);
  const pad = useRef<HTMLButtonElement>(null);
  const [floats, setFloats] = useState<{ id: number; x: number; y: number }[]>([]);
  const [pressed, fire] = usePress();
  const fid = useRef(0);

  useEffect(() => {
    if (!v.ring) return;
    const { start, period } = v.ring;
    let raf = 0;
    const loop = () => {
      const el = ring.current;
      if (el) {
        const phase = (((serverNow() - start) % period) + period) % period;
        // Shrinks from 1.4 to 1.0 and meets the white guide exactly at the cycle end: that tap is a SUPER pull.
        const s = 1.4 - 0.4 * (phase / period);
        el.style.transform = `translate(-50%, -50%) scale(${s.toFixed(3)})`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [v.ring?.start, v.ring?.period]);

  const onTap = (e: PointerEvent) => {
    tap();
    fire();
    haptic(8);
    const rect = pad.current?.getBoundingClientRect();
    if (!rect) return;
    const id = ++fid.current;
    const x = e.clientX - rect.left + (Math.random() * 30 - 15);
    const y = e.clientY - rect.top - 30;
    setFloats((f) => [...f.slice(-6), { id, x, y }]);
    window.setTimeout(() => setFloats((f) => f.filter((q) => q.id !== id)), 700);
  };

  return (
    <div
      class="ctrl landscape-split tap-view"
      style={{
        boxShadow: `inset 10px 0 0 ${v.teamColor}`,
        '--team': v.teamColor,
      }}
    >
      <div class="tap-info">
        <div class="row">
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: v.teamColor }} />
          <span style={{ fontSize: 15, fontWeight: 800 }}>{v.teamName}</span>
          <span class="muted" style={{ fontSize: 13 }}>
            {v.round}
          </span>
        </div>
        {/* Lead line and combo badge always keep their space: the card must not change height
            mid-tap, or the pad (and the button sized from it) would jump. */}
        <div class="muted tap-lead">{v.lead || '\u00a0'}</div>
        <div class="row" style={{ alignItems: 'baseline' }}>
          <span class="display tap-rate">{v.rate ?? '0'}</span>
          <span class="muted">ketuk/dtk</span>
          <span
            class="badge"
            aria-hidden={(v.combo ?? 0) < 2}
            style={{ marginLeft: 'auto', visibility: (v.combo ?? 0) >= 2 ? 'visible' : 'hidden' }}
          >
            <Icon name="fire" size={13} color="#111214" />
            KOMBO x{v.combo ?? 0}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, minmax(0, 1fr))', gap: 3 }}>
          {Array.from({ length: 10 }, (_, i) => (
            <div
              key={i}
              style={{
                height: 12,
                borderRadius: 3,
                background: i < Math.round((v.power ?? 0) * 10) ? v.teamColor : 'var(--t-track)',
                boxShadow: 'inset 0 0 0 1.5px var(--t-panel-edge)',
              }}
            />
          ))}
        </div>
      </div>
      <button
        type="button"
        class="tap-pad"
        aria-label={v.label}
        ref={pad}
        style={{ touchAction: 'none' }}
        onPointerDown={onTap}
      >
        {v.ring && (
          <>
            <span class="tap-ring is-guide" />
            <span ref={ring} class="tap-ring is-live" />
          </>
        )}
        <span class={`round-btn tap-btn ${pressed ? 'pressed' : ''}`} aria-hidden="true">
          {v.label}
        </span>
        {floats.map((f) => (
          <span key={f.id} class="float-plus" data-fx="" style={{ left: f.x, top: f.y }}>
            +1
          </span>
        ))}
      </button>
    </div>
  );
}

function CountdownView({ v }: { v: V<'countdown'> }) {
  useEffect(() => haptic(v.value === 'TARIK!' || v.value === 'MULAI!' ? [60, 30, 60] : 30), [v.value]);
  return (
    <div
      class="ctrl landscape-split countdown-view"
      style={{
        background: `repeating-linear-gradient(135deg, ${v.color} 0px, ${v.color} 28px, rgba(0,0,0,0.12) 28px, rgba(0,0,0,0.12) 56px), ${v.color}`,
      }}
    >
      <div class="countdown-who">
        <Me size={100} />
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.1em' }}>KAMU</div>
        <div class="display countdown-title">{v.title}</div>
      </div>
      <div
        key={v.value}
        class="display outline-text result-burst countdown-num"
        style={{ color: 'var(--yellow)', ['--stroke' as string]: '10px', lineHeight: 0.9 }}
      >
        {v.value}
      </div>
      {v.subtitle && <div class="countdown-sub">{v.subtitle}</div>}
      {v.opponents && v.opponents.length > 0 && (
        <div
          class="row"
          style={{ background: 'rgba(17,18,20,0.35)', borderRadius: 16, padding: '10px 14px' }}
        >
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', color: 'var(--yellow)' }}>
            LAWAN
          </span>
          {v.opponents.slice(0, 4).map((id) => (
            <PlayerAvatar key={id} id={id} size={36} />
          ))}
        </div>
      )}
    </div>
  );
}

function ResultView({ v }: { v: V<'result'> }) {
  const good = v.tone === 'win' || v.tone === 'good';
  useEffect(() => {
    if (v.tone === 'win') {
      celebrate();
      haptic([80, 50, 80, 50, 160]);
    } else if (v.tone === 'good') {
      confetti({ y: 0.45, count: 60, power: 0.7 });
      haptic(30);
    } else if (v.tone === 'lose' || v.tone === 'bad') {
      haptic([60, 40, 60]);
    }
  }, []);
  return (
    <div class="ctrl result-view">
      <div class="panes">
        <div class="pane">
          <div class={`result-burst result-icon ${v.tone === 'bad' || v.tone === 'lose' ? 'shake' : ''}`}>
            <svg width="190" height="190" viewBox="0 0 200 200" aria-hidden="true">
              {good && (
                <g
                  fill="#FFC928"
                  opacity="0.35"
                  style={{ transformOrigin: '100px 100px', animation: 'pop-in 0.6s ease both' }}
                >
                  <path d="M100 100 L92 0 H108Z" />
                  <path d="M100 100 L200 92 V108Z" />
                  <path d="M100 100 L108 200 H92Z" />
                  <path d="M100 100 L0 108 V92Z" />
                  <path d="M100 100 L164 24 L176 36Z" />
                  <path d="M100 100 L176 164 L164 176Z" />
                  <path d="M100 100 L36 176 L24 164Z" />
                  <path d="M100 100 L24 36 L36 24Z" />
                </g>
              )}
              <circle
                cx="100"
                cy="100"
                r="54"
                fill={good ? '#22B35E' : v.tone === 'neutral' ? '#FFC928' : '#FF5A1F'}
                stroke="#111214"
                stroke-width="5"
              />
              {good ? (
                <path
                  d="M76 100 L94 118 L126 82"
                  fill="none"
                  stroke="#111214"
                  stroke-width="11"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              ) : v.tone === 'neutral' ? (
                <path
                  d="M100 74 V104 M100 124 V126"
                  fill="none"
                  stroke="#111214"
                  stroke-width="11"
                  stroke-linecap="round"
                />
              ) : (
                <path
                  d="M80 80 L120 120 M120 80 L80 120"
                  fill="none"
                  stroke="#111214"
                  stroke-width="11"
                  stroke-linecap="round"
                />
              )}
            </svg>
          </div>
          <h1
            class="display outline-text result-title"
            style={{ ['--stroke' as string]: '6px', color: good ? '#fff' : '#FF5A1F' }}
          >
            {v.title}
          </h1>
          {v.big && (
            <div class="display outline-text result-big" style={{ ['--stroke' as string]: '6px' }}>
              {v.big}
            </div>
          )}
          {v.subtitle && <div class="muted view-sub">{v.subtitle}</div>}
          {v.chips && v.chips.length > 0 && (
            <div class="chips">
              {v.chips.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
          )}
        </div>
        <div class="pane">
          <div class="spacer" />
          {(v.stats || v.streak) && (
            <div class="t-panel result-panel">
              {v.stats?.map((s) => (
                <div key={s.label} class="row result-stat">
                  <span class="muted">{s.label}</span>
                  <b>{s.value}</b>
                </div>
              ))}
              {v.streak && (
                <>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {Array.from({ length: v.streak.total }, (_, i) => (
                      <div
                        key={i}
                        style={{
                          flex: 1,
                          height: 8,
                          borderRadius: 4,
                          background: i < v.streak!.done ? '#FF8A3D' : 'var(--t-track)',
                        }}
                      />
                    ))}
                  </div>
                  <div class="result-streak">{v.streak.label}</div>
                </>
              )}
            </div>
          )}
          {v.actions && v.actions.length > 0 && <Actions actions={v.actions} />}
        </div>
      </div>
    </div>
  );
}

export function GameView({ v }: { v: ControllerView }) {
  switch (v.kind) {
    case 'message':
      return <MessageView v={v} />;
    case 'choice':
      return <ChoiceView v={v} />;
    case 'locked':
      return <LockedView v={v} />;
    case 'button':
      return <ButtonView v={v} />;
    case 'tap':
      return <TapView v={v} />;
    case 'countdown':
      return <CountdownView v={v} />;
    case 'result':
      return <ResultView v={v} />;
    case 'drive':
      return <DriveView v={v} />;
    case 'gesture':
      return <GestureView v={v} />;
    case 'menu':
      return <MenuView v={v} />;
    case 'chess':
      return <ChessView v={v} />;
    case 'pad':
      return <PadView v={v} />;
    case 'word':
      return <WordView v={v} />;
  }
}
