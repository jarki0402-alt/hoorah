/**
 * Juara Eja option pictures in the game's paper-and-ink look: an open notebook on cream paper
 * with a big serif word. Keys: `lang-id`, `lang-en`.
 */
import { thumbSvg } from './frame';

const PAPER = '#FBF6EC';
const INK = '#1C1A17';
const LINE = '#E4D5BC';
const SERIF = 'font-family="Georgia, Times New Roman, serif" font-weight="700"';

/** An open notebook with ruled lines, a word in serif and a small two-stripe ribbon tag. */
function notebook(word: string, ribbon: [string, string], accent: string): string {
  const rules = [58, 72, 86, 100]
    .map((y) => `<path d="M24 ${y}h50M86 ${y}h50" stroke="${LINE}" stroke-width="2"/>`)
    .join('');
  return (
    `<path d="M14 22q33-8 66 4q33-12 66-4v86q-33-8-66 4q-33-12-66-4Z" fill="#FFFFFF" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>` +
    `<path d="M80 26v86" stroke="${INK}" stroke-width="2.5"/>` +
    rules +
    `<text x="80" y="58" text-anchor="middle" font-size="34" fill="${INK}" ${SERIF}>${word}</text>` +
    `<path d="M80 74q-14 10-28 6" fill="none" stroke="${accent}" stroke-width="4" stroke-linecap="round"/>` +
    `<rect x="118" y="6" width="14" height="13" fill="${ribbon[0]}"/><rect x="118" y="19" width="14" height="13" fill="${ribbon[1]}"/>` +
    `<path d="M118 32l7-6l7 6" fill="${PAPER}"/>`
  );
}

export const THUMBS: Record<string, () => string> = {
  'lang-id': () => thumbSvg(PAPER, notebook('Eja', ['#E8352E', '#FFFFFF'], '#FF5A1F')),
  'lang-en': () => thumbSvg(PAPER, notebook('Spell', ['#2E7D4F', '#FFFFFF'], '#2E7D4F')),
};
