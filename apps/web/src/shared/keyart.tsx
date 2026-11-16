import type { JSX } from 'preact';
import { arenaSvg } from './art/arena';
import { caturSvg } from './art/catur';
import { congklakSvg } from './art/congklak';
import { dapurSvg } from './art/dapur';
import { bajajSvg, gambarSvg, masakSvg, panjatSvg } from './art/extra';
import { juraganSvg } from './art/juragan';
import { karungSvg } from './art/karung';
import { kataSvg } from './art/kata';
import { kerupukSvg } from './art/kerupuk';
import { kompakSvg } from './art/kompak';
import { kuisKeyArtSvg } from './art/kuis';
import { lariSvg } from './art/lari';
import { ludoSvg } from './art/ludo';
import { rusunSceneSvg } from './art/rusun';
import { svgUrl } from './art/svg';
import { tarikSceneSvg } from './art/tarik';
import { ularSvg } from './art/ular';
import { wilayahSvg } from './art/wilayah';
import { GAMES, type GameId } from './games';

const ART: Record<GameId, () => string> = {
  tarik: () => tarikSceneSvg(),
  kuis: kuisKeyArtSvg,
  rusun: rusunSceneSvg,
  bajaj: bajajSvg,
  masak: masakSvg,
  ular: ularSvg,
  congklak: congklakSvg,
  kerupuk: kerupukSvg,
  karung: karungSvg,
  kompak: kompakSvg,
  ludo: ludoSvg,
  catur: caturSvg,
  arena: arenaSvg,
  wilayah: wilayahSvg,
  lari: lariSvg,
  kata: kataSvg,
  juragan: juraganSvg,
  dapur: dapurSvg,
  gambar: gambarSvg,
  panjat: panjatSvg,
};

/** Posters rendered from the 3D games' own scenes (`?poster=1`); the SVG art is the fallback. */
const POSTERS: Partial<Record<GameId, string>> = {
  bajaj: '/keyart/bajaj.jpg',
  masak: '/keyart/masak.jpg',
  juragan: '/keyart/juragan.jpg',
  lari: '/keyart/lari.jpg',
};

export function keyArtUrl(id: GameId): string {
  return POSTERS[id] ?? svgUrl(`keyart:${id}`, ART[id]);
}

const LOGO_POS: Record<GameId, JSX.CSSProperties> = {
  tarik: { left: 0, right: 0, top: '15%', textAlign: 'center' },
  kuis: { left: 0, right: 0, bottom: '4%', textAlign: 'center' },
  rusun: { left: '4%', top: '12%' },
  bajaj: { left: '4%', top: '8%' },
  masak: { left: '4%', top: '8%' },
  ular: { left: '4%', bottom: '8%' },
  congklak: { left: '4%', top: '8%' },
  kerupuk: { left: '4%', top: '8%' },
  karung: { left: '4%', top: '8%' },
  kompak: { left: '4%', top: '15%' },
  ludo: { left: '4%', top: '8%' },
  catur: { left: '4%', top: '8%' },
  arena: { left: '4%', top: '8%' },
  wilayah: { left: '4%', top: '8%' },
  lari: { left: '4%', top: '8%' },
  kata: { left: '4%', top: '8%' },
  juragan: { left: '4%', top: '8%' },
  dapur: { left: '4%', top: '8%' },
  gambar: { left: 0, right: 0, bottom: '4%', textAlign: 'center' },
  panjat: { left: '4%', bottom: '4%' },
};

interface KeyArtProps {
  id: GameId;
  width: number;
  logo?: boolean;
  radius?: number;
  class?: string;
}

export function KeyArt({ id, width, logo = true, radius = 0, class: cls }: KeyArtProps) {
  const height = Math.round((width * 9) / 16);
  const g = GAMES[id];
  return (
    <div
      class={cls}
      style={{ position: 'relative', width, height, borderRadius: radius, overflow: 'hidden', flex: 'none' }}
    >
      <img
        src={keyArtUrl(id)}
        width={width}
        height={height}
        alt={g.title}
        decoding="async"
        draggable={false}
        style={{ display: 'block', width, height }}
      />
      {logo && (
        <div
          class="display outline-text"
          aria-hidden="true"
          style={{
            position: 'absolute',
            fontSize: Math.round(width * (id === 'rusun' ? 0.1 : 0.068)),
            color: g.logoColor,
            textShadow: `0 ${Math.max(1, width / 160)}px 0 #111214`,
            ['--stroke' as string]: `${Math.max(2, width / 90)}px`,
            letterSpacing: '0.01em',
            whiteSpace: 'nowrap',
            ...LOGO_POS[id],
          }}
        >
          {g.title.toUpperCase()}
        </div>
      )}
    </div>
  );
}
