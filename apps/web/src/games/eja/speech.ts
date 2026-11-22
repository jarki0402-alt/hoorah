/**
 * Reads the word aloud with the browser's own voice (Web Speech `speechSynthesis`) on the main
 * screen. Many Smart TV browsers have no voice for a language, or block speech without a tap;
 * `speak` then resolves false and the game shows the first letter as a hint instead.
 */
import type { Lang } from './words';

/** If speech has not started by then, treat it as unavailable for this word. */
const START_TIMEOUT_MS = 1_800;
const LANG_TAGS: Record<Lang, string> = { id: 'id-ID', en: 'en-US' };

function synth(): SpeechSynthesis | null {
  try {
    return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  } catch {
    return null;
  }
}

export class Speaker {
  private voices: SpeechSynthesisVoice[] = [];

  constructor() {
    const s = synth();
    if (!s) return;
    const load = () => {
      try {
        this.voices = s.getVoices();
      } catch {
        this.voices = [];
      }
    };
    load();
    try {
      s.addEventListener('voiceschanged', load);
    } catch {
      // Older engines: the list read above is all we get.
    }
  }

  /** The best voice for the language, or null when the device has none. */
  voiceFor(lang: Lang): SpeechSynthesisVoice | null {
    const tag = LANG_TAGS[lang].toLowerCase();
    const prefix = lang;
    const norm = (v: SpeechSynthesisVoice) => v.lang.replace('_', '-').toLowerCase();
    return (
      this.voices.find((v) => norm(v) === tag && v.localService) ??
      this.voices.find((v) => norm(v) === tag) ??
      this.voices.find((v) => norm(v).startsWith(`${prefix}-`) || norm(v) === prefix) ??
      null
    );
  }

  hasVoice(lang: Lang): boolean {
    return synth() !== null && this.voiceFor(lang) !== null;
  }

  /** Say the word. Resolves true once the voice actually starts, false if it cannot. */
  speak(text: string, lang: Lang): Promise<boolean> {
    const s = synth();
    const voice = this.voiceFor(lang);
    if (!s || !voice || typeof SpeechSynthesisUtterance === 'undefined') return Promise.resolve(false);
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        resolve(ok);
      };
      const timer = window.setTimeout(() => finish(false), START_TIMEOUT_MS);
      try {
        s.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.voice = voice;
        u.lang = voice.lang;
        u.rate = 0.82;
        u.pitch = 1;
        u.volume = 1;
        u.onstart = () => finish(true);
        u.onerror = () => finish(false);
        s.speak(u);
      } catch {
        finish(false);
      }
    });
  }

  stop(): void {
    try {
      synth()?.cancel();
    } catch {
      // Nothing to stop.
    }
  }
}
