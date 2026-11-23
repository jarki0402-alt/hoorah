/** Lab "Suara" tab: the Kampung Siluman sounds exactly as the game plays them, to judge by ear. */
import { audio, type Sfx } from '../shared/audio';
import { SOUND } from './strings';

const ORDER: readonly (keyof typeof SOUND.items)[] = [
  'night',
  'growl',
  'genta',
  'flute',
  'heart',
  'rooster',
  'kentongan',
  'birds',
  'win-village',
  'win-siluman',
];

/** The first tap only wakes audio up; the sound follows once it runs (a few ms later). */
function play(name: Sfx): void {
  audio.unlock();
  if (audio.unlocked) audio.sfx(name);
  else window.setTimeout(() => audio.sfx(name), 120);
}

/** The heartbeat as in the game: beats getting faster over about six seconds. */
function playHeart(): void {
  let at = 0;
  for (let i = 0; i < 9; i++) {
    window.setTimeout(() => play('heart'), at);
    at += 940 - i * 50;
  }
}

export function SoundTab() {
  return (
    <section class="lab-tab">
      <p class="lab-help">{SOUND.help}</p>
      <ul class="lab-sounds">
        {ORDER.map((id) => {
          const item = SOUND.items[id];
          return (
            <li key={id} class="lab-sound">
              <div class="lab-sound-head">
                <strong>{item.title}</strong>
                <span class="lab-sound-when">{item.when}</span>
              </div>
              <div class="lab-sound-row">
                <button
                  type="button"
                  class="lab-chip on"
                  onClick={() => (id === 'heart' ? playHeart() : play(id))}
                >
                  {SOUND.play}
                  <small>{item.what}</small>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
