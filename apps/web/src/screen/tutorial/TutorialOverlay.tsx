/**
 * "Cara main" on the main screen: the origin card, then each step's animated scene with the phone
 * control beside it. Steps advance by themselves; an intro tutorial ends when everyone pressed
 * "Paham!" on their phone, the Host skipped (phone or remote OK) or the last step finished.
 */
import { useEffect, useState } from 'preact/hooks';
import { GAMES } from '../../shared/games';
import { KeyArt } from '../../shared/keyart';
import { cachedTutorial, loadTutorial } from '../../shared/tutorial';
import type { Tutorial } from '../../shared/tutorial/types';
import { Avatar, Icon } from '../../shared/ui';
import { setFocusMap } from '../nav';
import { connected, finishTutorial, players, type TutorialRun } from '../store';
import { TUTORIAL as STR } from '../strings';
import { PhoneMock } from './PhoneMock';
import './tutorial.css';

const ORIGIN_MS = 5_000;
const STEP_MS = 5_500;

export function TutorialOverlay({ run }: { run: TutorialRun }) {
  const [data, setData] = useState<Tutorial | null>(() => cachedTutorial(run.id));
  // -1: the origin card; 0..n-1: the steps.
  const [at, setAt] = useState(-1);

  useEffect(() => {
    let live = true;
    setAt(-1);
    if (cachedTutorial(run.id)) setData(cachedTutorial(run.id));
    else
      void loadTutorial(run.id).then((t) => {
        if (!live) return;
        if (t) setData(t);
        else finishTutorial();
      });
    return () => {
      live = false;
    };
  }, [run.id]);

  useEffect(() => {
    if (!data) return;
    const last = at >= data.steps.length - 1;
    const t = window.setTimeout(
      () => (last ? finishTutorial() : setAt((i) => i + 1)),
      at < 0 ? ORIGIN_MS : STEP_MS,
    );
    return () => window.clearTimeout(t);
  }, [data, at]);

  useEffect(
    () =>
      setFocusMap(
        { rows: [['tutorial']], onOk: finishTutorial, onBack: finishTutorial, onMenu: finishTutorial },
        'tutorial',
      ),
    [],
  );

  const info = GAMES[run.id];
  const host = players.value.find((p) => p.isHost);
  const intro = run.mode === 'intro';
  const step = data && at >= 0 ? data.steps[at] : null;
  const total = data ? data.steps.length + 1 : 1;

  return (
    <div class="overlay tu-overlay" role="dialog" aria-label={`${STR.eyebrow} ${info.title}`}>
      <header class="tu-head">
        <div>
          <div class="tu-eyebrow">{STR.eyebrow}</div>
          <h1 class="display tu-title">{info.title}</h1>
        </div>
        <div class="tu-dots" role="img" aria-label={STR.step(at + 2, total)}>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} class={i < at + 1 ? 'done' : i === at + 1 ? 'on' : ''}>
              {i === at + 1 && (
                <i key={at} style={{ animationDuration: `${at < 0 ? ORIGIN_MS : STEP_MS}ms` }} />
              )}
            </span>
          ))}
        </div>
      </header>

      {!data ? (
        <div class="tu-loading">{STR.loading}</div>
      ) : (
        <main class="tu-body" key={at}>
          <div class="tu-stage">
            {step ? (
              // Scenes are built in-repo from tutorial data (shared/tutorial/draw.ts escapes text).
              <div class="tu-scene" dangerouslySetInnerHTML={{ __html: step.scene() }} />
            ) : (
              <div class="tu-scene tu-origin-art">
                <KeyArt id={run.id} width={836} radius={0} />
              </div>
            )}
          </div>
          <aside class="tu-side">
            {step ? (
              <>
                <div class="tu-phone-label">
                  <Icon name="tap" size={18} />
                  {STR.phone}
                </div>
                <PhoneMock hint={step.phone} />
              </>
            ) : (
              <div class="tu-origin-label">{STR.originTitle}</div>
            )}
          </aside>
          <p class={`tu-text ${step ? '' : 'origin'}`}>
            {step ? (
              <>
                <span class="tu-num">{at + 1}</span>
                {step.text}
              </>
            ) : (
              data.origin
            )}
          </p>
        </main>
      )}

      <footer class="tu-foot">
        {intro ? (
          <>
            <div class="tu-ready">
              {connected.value.map((p) => (
                <span key={p.id} class={`tu-player ${run.ready.includes(p.id) ? 'ok' : ''}`}>
                  <Avatar fruit={p.fruit} ring={p.color} size={36} />
                  {run.ready.includes(p.id) && (
                    <span class="tu-tick">
                      <Icon name="check" size={12} stroke={3.4} />
                    </span>
                  )}
                </span>
              ))}
            </div>
            <div class="tu-hint">
              {STR.waitPhones}
              {host ? ` · ${STR.hostSkip(host.name)}` : ''}
            </div>
          </>
        ) : (
          <div class="tu-hint">{STR.remoteClose}</div>
        )}
        {intro && <div class="tu-key">{STR.remoteSkip}</div>}
      </footer>
    </div>
  );
}
