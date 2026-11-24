/**
 * "Laporkan masalah" on the phone: a sheet with the kind, the story and an optional contact. The
 * technical context (app version, phone, page, game, room, link) goes along by itself.
 */
import { REPORT_CONTACT_MAX, REPORT_KINDS, REPORT_TEXT_MAX, type ReportKind } from '@hoorah/protocol';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  buildContext,
  type ContextExtra,
  currentLink,
  FLAG_ICON_PATH,
  type ReportResult,
  sendReport,
} from '../shared/report';
import { REPORT_STR } from '../shared/reportStrings';
import { code, haptic, platform } from './store';

/** What the phone knows for reports and error logs right now. */
export function controllerExtra(): ContextExtra {
  const pg = platform.peek();
  const extra: ContextExtra = { page: pg.page };
  if (pg.gameId) extra.gameId = pg.gameId;
  if (code.peek()) extra.room = code.peek();
  const link = currentLink();
  if (link) extra.link = link;
  return extra;
}

export function FlagIcon({ size = 16 }: { size?: number }) {
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

/** The small "Laporkan masalah" entry: a text link that never takes a key's place. */
export function ReportLink({ onOpen, class: cls = '' }: { onOpen: () => void; class?: string }) {
  return (
    <button
      type="button"
      class={`report-link ${cls}`}
      onClick={() => {
        haptic(10);
        onOpen();
      }}
    >
      <FlagIcon size={14} />
      {REPORT_STR.open}
    </button>
  );
}

type SheetState = { s: 'edit'; error: ReportResult | 'short' | null } | { s: 'sending' } | { s: 'done' };

const ERRORS: Record<Exclude<ReportResult, 'ok'> | 'short', string> = {
  short: REPORT_STR.tooShort,
  invalid: REPORT_STR.errInvalid,
  limited: REPORT_STR.errLimited,
  failed: REPORT_STR.errFailed,
};

export function ReportSheet({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<ReportKind>('teknis');
  const [text, setText] = useState('');
  const [contact, setContact] = useState('');
  const [st, setSt] = useState<SheetState>({ s: 'edit', error: null });
  // A report already on its way finishes even if the sheet closes meanwhile.
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const submit = async () => {
    if (st.s === 'sending') return;
    const body = text.trim();
    if (body.length < 3) {
      setSt({ s: 'edit', error: 'short' });
      return;
    }
    setSt({ s: 'sending' });
    const res = await sendReport({
      kind,
      text: body.slice(0, REPORT_TEXT_MAX),
      contact: contact.trim().slice(0, REPORT_CONTACT_MAX) || null,
      context: buildContext('controller', controllerExtra()),
    });
    if (!alive.current) return;
    if (res === 'ok') {
      haptic([20, 40, 20]);
      setSt({ s: 'done' });
    } else {
      setSt({ s: 'edit', error: res });
    }
  };

  const close = () => {
    alive.current = false;
    onClose();
  };

  if (st.s === 'done') {
    return (
      <div class="sheet sheet-top">
        <div class="sheet-card report-card" role="dialog" aria-modal="true" aria-label={REPORT_STR.title}>
          <div class="report-done" role="status">
            <span class="report-done-icon">
              <FlagIcon size={26} />
            </span>
            <h2 class="title sheet-title">{REPORT_STR.done}</h2>
            <div class="muted">{REPORT_STR.doneSub}</div>
          </div>
          <button type="button" class="big-btn" onClick={close}>
            {REPORT_STR.close}
          </button>
        </div>
      </div>
    );
  }

  const busy = st.s === 'sending';
  const error = st.s === 'edit' && st.error && st.error !== 'ok' ? ERRORS[st.error] : null;
  return (
    <div class="sheet sheet-top">
      <form
        class="sheet-card report-card scroll-y"
        role="dialog"
        aria-modal="true"
        aria-label={REPORT_STR.title}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2 class="title sheet-title">{REPORT_STR.title}</h2>
        <fieldset class="report-kinds" disabled={busy}>
          <legend class="report-label">{REPORT_STR.kindLabel}</legend>
          {REPORT_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              class={`report-kind ${kind === k ? 'is-on' : ''}`}
              onClick={() => setKind(k)}
            >
              {REPORT_STR.kinds[k]}
            </button>
          ))}
        </fieldset>
        <label class="report-field">
          <span class="report-label">
            {REPORT_STR.textLabel}
            <span class="report-count">{REPORT_STR.counter(text.length, REPORT_TEXT_MAX)}</span>
          </span>
          <textarea
            class="text-input report-text"
            value={text}
            maxLength={REPORT_TEXT_MAX}
            rows={3}
            disabled={busy}
            placeholder={REPORT_STR.textPlaceholder}
            onInput={(e) => {
              setText((e.target as HTMLTextAreaElement).value.slice(0, REPORT_TEXT_MAX));
              if (st.s === 'edit' && st.error) setSt({ s: 'edit', error: null });
            }}
          />
        </label>
        <label class="report-field">
          <span class="report-label">{REPORT_STR.contactLabel}</span>
          <input
            class="text-input report-contact"
            value={contact}
            maxLength={REPORT_CONTACT_MAX}
            autoComplete="off"
            enterKeyHint="send"
            disabled={busy}
            placeholder={REPORT_STR.contactPlaceholder}
            onInput={(e) => setContact((e.target as HTMLInputElement).value.slice(0, REPORT_CONTACT_MAX))}
          />
        </label>
        {error && (
          <div class="pass-msg is-error" role="alert">
            {error}
          </div>
        )}
        <div class="duo">
          <button type="button" class="big-btn secondary" onClick={close}>
            {REPORT_STR.cancel}
          </button>
          <button type="submit" class="big-btn" disabled={busy}>
            {busy ? REPORT_STR.sending : REPORT_STR.send}
          </button>
        </div>
      </form>
    </div>
  );
}
