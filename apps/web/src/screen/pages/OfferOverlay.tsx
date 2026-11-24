/**
 * The Hoorah Pass offer (owner 2026-11-23): why it shows (a locked game, Mode Pesta, a full room,
 * the trial just ended), three benefits, then "Coba gratis" (once per main screen), "Punya kode
 * Pass? Ketik di HP" and "Nanti saja". Driven by the remote, the keyboard or the Host's d-pad; it
 * owns the focus while open and the page underneath reinstalls its map when `offer` clears.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { CATALOG, GAMES } from '../../shared/games';
import { Icon } from '../../shared/ui';
import { FocusButton } from '../components';
import { setFocusMap } from '../nav';
import { access, appConfig, closeOffer, type OfferReason, offer, requestTrial, sfx } from '../store';
import { OFFER } from '../strings';

function reasonLine(r: OfferReason): string {
  switch (r.kind) {
    case 'game':
      return OFFER.reasonGame(GAMES[r.game].title);
    case 'party':
      return OFFER.reasonParty;
    case 'full':
      return OFFER.reasonFull;
    case 'ended':
      return OFFER.reasonEnded;
    case 'passEnded':
      return OFFER.reasonPassEnded;
  }
}

/** Renders the offer while one is open; pages that can show it mount this once. */
export function OfferLayer() {
  const r = offer.value;
  return r ? <OfferOverlay reason={r} /> : null;
}

function OfferOverlay({ reason }: { reason: OfferReason }) {
  const canTry = !access.value.trialUsed;
  const minutes = appConfig.value.trialMinutes;
  const [asking, setAsking] = useState(false);
  const askingRef = useRef(asking);
  askingRef.current = asking;

  // A refused trial (already used, too many tries) lets the buttons work again.
  useEffect(() => {
    if (!asking) return;
    const t = window.setTimeout(() => setAsking(false), 4000);
    return () => window.clearTimeout(t);
  }, [asking]);

  const rows = [...(canTry ? [['offer-trial']] : []), ['offer-code'], ['offer-later']];
  const rowsKey = rows.join('|');
  useEffect(
    () =>
      setFocusMap(
        {
          rows,
          onOk: (id) => {
            if (id === 'offer-trial') {
              if (askingRef.current) return;
              setAsking(true);
              sfx('select');
              requestTrial();
              return;
            }
            // The Pass code is typed on a phone (the Host's "Hoorah Pass" button), nothing to do here.
            closeOffer();
          },
          onBack: closeOffer,
          onMenu: closeOffer,
          onMove: () => sfx('tick'),
        },
        canTry ? 'offer-trial' : 'offer-code',
      ),
    [rowsKey],
  );

  return (
    <div class="overlay offer-overlay">
      <div class="offer-panel on-surface" role="dialog" aria-modal="true" aria-label={OFFER.title}>
        <div class="offer-head">
          <span class="offer-reason">
            <Icon name="lock" size={16} stroke={2.6} />
            {reasonLine(reason)}
          </span>
          <span class="eyebrow">{OFFER.eyebrow}</span>
          <h1 class="display offer-title">{OFFER.title}</h1>
        </div>
        <ul class="offer-benefits">
          {OFFER.benefits(CATALOG.filter((id) => GAMES[id].available).length).map((b) => (
            <li key={b}>
              <span class="offer-check">
                <Icon name="check" size={16} stroke={3.2} color="#111214" />
              </span>
              {b}
            </li>
          ))}
        </ul>
        <div class="offer-buttons">
          {canTry && (
            <FocusButton id="offer-trial" class="btn primary offer-btn">
              <Icon name="play" size={16} color="#111214" />
              {asking ? OFFER.starting : OFFER.trial(minutes)}
            </FocusButton>
          )}
          <FocusButton id="offer-code" class={`btn offer-btn ${canTry ? '' : 'light'}`}>
            <Icon name="tap" size={16} color={canTry ? 'currentColor' : '#111214'} />
            {OFFER.code}
          </FocusButton>
          <FocusButton id="offer-later" class="btn offer-btn">
            {OFFER.later}
          </FocusButton>
        </div>
        <span class="offer-hint">{OFFER.hint}</span>
      </div>
    </div>
  );
}
