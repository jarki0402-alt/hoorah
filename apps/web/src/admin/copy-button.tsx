import { useEffect, useRef, useState } from 'preact/hooks';
import { copyText } from './share';
import { showToast } from './state';
import { STR } from './strings';
import { AdminIcon } from './ui';

interface CopyButtonProps {
  text: () => string;
  label: string;
  class?: string;
}

/** Copies on press and turns into "Tersalin" for a moment. */
export function CopyButton({ text, label, class: cls = 'ad-btn' }: CopyButtonProps) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    const ok = await copyText(text());
    if (!ok) {
      showToast(STR.copyFailed, 'error');
      return;
    }
    setDone(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), 1800);
  };

  return (
    <button type="button" class={`${cls}${done ? ' is-done' : ''}`} onClick={() => void copy()}>
      <AdminIcon name={done ? 'check' : 'copy'} />
      <span aria-live="polite">{done ? STR.copied : label}</span>
    </button>
  );
}

/** The pass code itself, large; pressing it copies just the code. */
export function CodeButton({ code, big = false }: { code: string; big?: boolean }) {
  const copy = async () => {
    if (await copyText(code)) showToast(STR.codeCopied);
    else showToast(STR.copyFailed, 'error');
  };
  return (
    <button
      type="button"
      class={`ad-code-btn${big ? ' ad-code-btn--big' : ''}`}
      aria-label={STR.copyCode(code)}
      title={STR.copyCode(code)}
      style={{ '--len': Math.max(code.length, 4) }}
      onClick={() => void copy()}
    >
      <span class="ad-code">{code}</span>
      <span class="ad-code-copy" aria-hidden="true">
        <AdminIcon name="copy" size={big ? 20 : 16} />
      </span>
    </button>
  );
}
