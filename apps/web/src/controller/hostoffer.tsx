/**
 * Handing the Host role to another player with their consent: the Host picks a player, that phone
 * asks "Jadi Host?", and the role moves only after they accept (the server checks every step).
 */
import { LIMITS } from '@hoorah/protocol';
import { useEffect, useState } from 'preact/hooks';
import { Avatar } from '../shared/ui';
import {
  cancelHostOffer,
  haptic,
  hostNotice,
  hostOffer,
  meId,
  offerHost,
  players,
  replyHostOffer,
} from './store';
import { STR } from './strings';

const NOTICE_MS = 3200;

/**
 * A short two-note call on the asked phone, so the player notices the question even with the phone
 * lying on the table. Phones only play sound after a touch on the page, which every player made
 * when joining; if the browser still refuses, the vibration and the sheet remain.
 */
function chime(): void {
  try {
    const Ctx =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const t0 = ctx.currentTime;
    for (const [i, f] of [660, 880].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const t = t0 + i * 0.16;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    }
    window.setTimeout(() => void ctx.close(), 800);
  } catch {
    // No audio on this browser: the vibration and the sheet still ask.
  }
}

/** Seconds left to answer an offer that arrived at `since` (local clock). */
function useSecondsLeft(since: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [since]);
  if (since === null) return 0;
  return Math.max(0, Math.ceil((LIMITS.hostOfferMs - (now - since)) / 1000));
}

/** The Host's list of connected players to hand the role to. */
export function HostSwapSheet({ onClose }: { onClose: () => void }) {
  const others = players.value.filter((p) => p.connected && p.id !== meId.value);
  return (
    <div class="sheet">
      <div class="sheet-card" role="dialog" aria-modal="true" aria-labelledby="host-swap-title">
        <h2 class="title sheet-title" id="host-swap-title">
          {STR.hostSwapTitle}
        </h2>
        <div class="muted">{others.length ? STR.hostSwapLead : STR.hostSwapEmpty}</div>
        {others.length > 0 && (
          <ul class="host-swap-list">
            {others.map((p) => (
              <li key={p.id} class="host-swap-row">
                <Avatar look={p.look} ring={p.color} size={40} />
                <span class="host-swap-name">{p.name}</span>
                <button
                  type="button"
                  class="big-btn yellow host-swap-btn"
                  onClick={() => {
                    offerHost(p.id);
                    onClose();
                  }}
                >
                  {STR.hostMake}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" class="big-btn secondary" onClick={onClose}>
          {STR.hostClose}
        </button>
      </div>
    </div>
  );
}

/** Always mounted in the room: the question on the asked phone, the wait on the Host's, notices. */
export function HostOfferLayer() {
  const offer = hostOffer.value;
  const notice = hostNotice.value;
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => {
      if (hostNotice.value?.id === notice.id) hostNotice.value = null;
    }, NOTICE_MS);
    return () => window.clearTimeout(t);
  }, [notice?.id]);

  // The asked phone: when the question arrived (for the countdown), and a call to get noticed.
  const asked = offer !== null && offer.to === meId.value;
  const askKey = asked ? `${offer.from}>${offer.to}` : '';
  const [since, setSince] = useState<number | null>(null);
  useEffect(() => {
    if (!asked) {
      setSince(null);
      return;
    }
    setSince(Date.now());
    haptic([90, 70, 90]);
    chime();
  }, [askKey]);
  const left = useSecondsLeft(asked ? since : null);

  const nameOf = (id: number) => players.value.find((p) => p.id === id)?.name ?? 'Pemain';
  let sheet = null;
  if (offer && offer.to === meId.value) {
    const from = players.value.find((p) => p.id === offer.from);
    sheet = (
      // Above everything, the "Putar HP-mu" screen and the full-screen offer included.
      <div class="sheet sheet-top" style={{ alignItems: 'center' }}>
        <div
          class="sheet-card host-ask"
          style={{ alignItems: 'center', textAlign: 'center' }}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="host-ask-title"
        >
          {from && <Avatar look={from.look} ring={from.color} size={64} />}
          <h2 class="title sheet-title" id="host-ask-title">
            {STR.hostAskTitle}
          </h2>
          <div class="muted">{STR.hostAsk(nameOf(offer.from))}</div>
          {left > 0 && <div class="host-ask-left">{STR.hostAskLeft(left)}</div>}
          <div class="duo" style={{ alignSelf: 'stretch' }}>
            <button type="button" class="big-btn secondary" onClick={() => replyHostOffer(false)}>
              {STR.hostDecline}
            </button>
            <button type="button" class="big-btn yellow" onClick={() => replyHostOffer(true)}>
              {STR.hostAccept}
            </button>
          </div>
        </div>
      </div>
    );
  } else if (offer && offer.from === meId.value) {
    sheet = (
      <div class="sheet sheet-top" style={{ alignItems: 'center' }}>
        <div class="sheet-card" style={{ alignItems: 'center', textAlign: 'center' }} role="status">
          <div class="spinner big" />
          <h2 class="title sheet-title">{STR.hostWaiting(nameOf(offer.to))}</h2>
          <div class="muted">{STR.hostWaitingSub}</div>
          <button
            type="button"
            class="big-btn secondary"
            style={{ alignSelf: 'stretch' }}
            onClick={cancelHostOffer}
          >
            {STR.hostCancel}
          </button>
        </div>
      </div>
    );
  }

  let text: string | null = null;
  if (notice) {
    if (notice.kind === 'now') text = notice.who === meId.value ? STR.hostNowMe : STR.hostNow(notice.name);
    else if (notice.kind === 'declined') text = STR.hostDeclined(notice.name);
    else if (notice.kind === 'expired') text = STR.hostNoAnswer;
    else text = STR.hostOfferGone;
  }
  return (
    <>
      {sheet}
      {text && (
        <div class="banner host-notice" role="status" key={notice?.id}>
          {text}
        </div>
      )}
    </>
  );
}
