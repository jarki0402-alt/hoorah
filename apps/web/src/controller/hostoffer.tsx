/**
 * Handing the Host role to another player with their consent: the Host picks a player, that phone
 * asks "Jadi Host?", and the role moves only after they accept (the server checks every step).
 */
import { useEffect } from 'preact/hooks';
import { Avatar } from '../shared/ui';
import { cancelHostOffer, hostNotice, hostOffer, meId, offerHost, players, replyHostOffer } from './store';
import { STR } from './strings';

const NOTICE_MS = 3200;

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
                <Avatar fruit={p.fruit} ring={p.color} size={40} />
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

  const nameOf = (id: number) => players.value.find((p) => p.id === id)?.name ?? 'Pemain';
  let sheet = null;
  if (offer && offer.to === meId.value) {
    const from = players.value.find((p) => p.id === offer.from);
    sheet = (
      <div class="sheet" style={{ alignItems: 'center' }}>
        <div
          class="sheet-card"
          style={{ alignItems: 'center', textAlign: 'center' }}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="host-ask-title"
        >
          {from && <Avatar fruit={from.fruit} ring={from.color} size={64} />}
          <h2 class="title sheet-title" id="host-ask-title">
            {STR.hostAskTitle}
          </h2>
          <div class="muted">{STR.hostAsk(nameOf(offer.from))}</div>
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
      <div class="sheet" style={{ alignItems: 'center' }}>
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
