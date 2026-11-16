import '@fontsource/baloo-2/latin-800.css';
import '../shared/base.css';
import { FRUITS } from '@hoorah/protocol';
import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

const NAMES = ['Rina', 'Budi', 'Sari', 'Dimas', 'Ayu', 'Joko', 'Tari', 'Eko'];

/**
 * Dev simulator: one TV and several virtual phones on one page, all real clients talking to the
 * real server. Click inside the TV and use the arrow keys/Enter, or drive it from the Host phone.
 */
function Sim() {
  const tv = useRef<HTMLIFrameElement>(null);
  const [code, setCode] = useState('');
  const [count, setCount] = useState(2);
  const [run, setRun] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => {
      const el = tv.current?.contentDocument?.querySelector('.room-code');
      const txt = el?.textContent?.replace(/\s/g, '') ?? '';
      if (/^\d{6}$/.test(txt) && txt !== code) setCode(txt);
    }, 400);
    return () => window.clearInterval(t);
  }, [code]);

  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        padding: 16,
        height: '100vh',
        boxSizing: 'border-box',
        background: '#0A0B0C',
      }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#DADCE0', fontSize: 14 }}>
          <b class="display" style={{ fontSize: 22, color: '#fff' }}>
            Simulator
          </b>
          <span>Room: {code || '…'}</span>
          <button type="button" onClick={() => setCount((c) => Math.min(8, c + 1))}>
            + HP
          </button>
          <button type="button" onClick={() => setCount((c) => Math.max(1, c - 1))}>
            − HP
          </button>
          <button type="button" onClick={() => setRun((r) => r + 1)}>
            Muat ulang HP
          </button>
          <span style={{ color: '#A8ABB2' }}>
            Klik di layar utama lalu pakai panah + Enter, atau kendalikan dari HP Host.
          </span>
        </div>
        <div
          style={{ position: 'relative', flex: 1, background: '#000', borderRadius: 12, overflow: 'hidden' }}
        >
          <iframe
            ref={tv}
            title="Layar utama"
            src="/?tv=1&sim=1"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
            allow="autoplay"
          />
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignContent: 'flex-start',
          gap: 12,
          width: count > 2 ? 600 : 300,
          overflowY: 'auto',
        }}
      >
        {code &&
          Array.from({ length: count }, (_, i) => (
            <iframe
              key={`${run}-${i}`}
              title={`HP ${i + 1}`}
              src={`/?ctrl=1&r=${code}&name=${NAMES[i]}&fruit=${FRUITS[i % FRUITS.length]}&auto=1&sim=${run}-${i}`}
              style={{
                width: 280,
                height: 560,
                border: '6px solid #2A2B30',
                borderRadius: 28,
                background: '#111214',
              }}
            />
          ))}
      </div>
    </div>
  );
}

render(<Sim />, document.getElementById('app')!);
