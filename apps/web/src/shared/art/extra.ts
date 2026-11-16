import { fruitMarkup } from './fruits';
import { svgDoc } from './svg';

/** Key art for games that are "coming soon". 640x360 each. */

export function bajajSvg(): string {
  return svgDoc(
    640,
    360,
    [
      '<rect width="640" height="360" fill="#FF9A4D"/><circle cx="500" cy="120" r="46" fill="#FFD36B"/>',
      '<path d="M0 182 V128 h40 v54Z M50 182 V104 h30 v78Z M90 182 V138 h50 v44Z M150 182 V118 h32 v64Z M192 182 V146 h40 v36Z M380 182 V112 h36 v70Z M426 182 V92 h28 v90Z M462 182 V128 h50 v54Z M520 182 V106 h40 v76Z M570 182 V136 h70 v46Z" fill="#C9572B"/>',
      '<path d="M296 64 h10 l6 92 h-22Z M280 156 h42 v12 h-42Z M270 168 h62 v14 h-62Z" fill="#B44A22"/><path d="M301 44 q7 9 0 18 q-7 -9 0 -18Z" fill="#FFC928"/>',
      '<rect x="0" y="182" width="640" height="14" fill="#9AA0A6"/><rect x="0" y="196" width="640" height="164" fill="#3A3D44"/>',
      '<path d="M0 274 h40 v6 h-40Z M80 274 h40 v6 h-40Z M160 274 h40 v6 h-40Z M400 274 h40 v6 h-40Z M480 274 h40 v6 h-40Z M560 274 h40 v6 h-40Z" fill="#FFF7F0"/>',
      '<g stroke="#FFF7F0" stroke-width="4" stroke-linecap="round" opacity="0.7"><path d="M90 236 H170"/><path d="M70 262 H160"/><path d="M110 290 H190"/></g>',
      '<path d="M200 312 V256 Q202 214 248 210 H318 Q354 212 362 252 L368 312Z" fill="#2F8CFF"/><path d="M222 214 H330 Q338 202 326 196 H234 Q220 202 222 214Z" fill="#1F6FD6"/>',
      '<path d="M250 224 h50 v36 h-50Z" fill="#BFE6FF"/><path d="M310 224 h24 q12 10 14 36 h-38Z" fill="#BFE6FF"/>',
      `<g transform="translate(262 222) scale(0.5)">${fruitMarkup('jeruk', 'wow')}</g>`,
      '<rect x="206" y="272" width="156" height="8" fill="#FFC928"/><circle cx="364" cy="268" r="6" fill="#FFE38A"/>',
      '<circle cx="236" cy="314" r="18" fill="#111214"/><circle cx="236" cy="314" r="7" fill="#9AA0A6"/><circle cx="338" cy="314" r="18" fill="#111214"/><circle cx="338" cy="314" r="7" fill="#9AA0A6"/>',
      '<path d="M520 316 L534 278 L548 316Z" fill="#FF5A1F"/><rect x="516" y="314" width="36" height="5" fill="#111214"/><rect x="527" y="294" width="14" height="5" fill="#fff"/>',
    ].join(''),
  );
}

/** Jago Masak: a warm kitchen counter with a flaming wok, a cutting board and a chef. */
export function masakSvg(): string {
  return svgDoc(
    640,
    360,
    [
      '<rect width="640" height="360" fill="#2E8C83"/>',
      '<g fill="#3AA196">' +
        Array.from({ length: 8 }, (_, r) =>
          Array.from({ length: 14 }, (_, c) =>
            (r + c) % 2 ? '' : `<rect x="${c * 46 + 2}" y="${r * 30 + 2}" width="42" height="26" rx="3"/>`,
          ).join(''),
        ).join('') +
        '</g>',
      '<rect x="0" y="0" width="640" height="10" fill="#1F6E66"/>',
      // Shelf with jars.
      '<rect x="380" y="72" width="230" height="10" fill="#8A5A2B"/>',
      '<rect x="392" y="40" width="30" height="32" rx="5" fill="#FFC928"/><rect x="430" y="34" width="34" height="38" rx="5" fill="#E8352E"/><rect x="472" y="44" width="28" height="28" rx="5" fill="#FFF7F0"/><rect x="508" y="38" width="32" height="34" rx="5" fill="#7BC043"/><rect x="548" y="46" width="44" height="26" rx="5" fill="#B8410F"/>',
      // Counter.
      '<rect x="0" y="232" width="640" height="128" fill="#B9773E"/><rect x="0" y="224" width="640" height="16" fill="#D9955A"/><rect x="0" y="240" width="640" height="6" fill="#8A5A2B" opacity="0.5"/>',
      // Stove and wok with flames.
      '<rect x="300" y="196" width="190" height="30" rx="8" fill="#2A2B30"/><rect x="314" y="190" width="162" height="10" rx="4" fill="#3C3E44"/>',
      '<path d="M352 196 q8 -26 18 -8 q6 -20 16 -4 q8 -24 18 -2 q6 -18 14 4Z" fill="#FF5A1F"/><path d="M362 196 q6 -14 12 -4 q6 -12 12 0 q6 -12 12 2Z" fill="#FFC928"/>',
      '<path d="M310 150 h170 a85 44 0 0 1 -170 0Z" fill="#3C3E44"/><path d="M480 154 h78 a8 8 0 0 1 0 14 h-74Z" fill="#2A2B30"/>',
      '<ellipse cx="395" cy="152" rx="80" ry="12" fill="#C0602A"/>',
      '<g fill="#E9A24C"><circle cx="362" cy="148" r="5"/><circle cx="378" cy="146" r="5"/><circle cx="398" cy="147" r="5"/><circle cx="418" cy="146" r="5"/><circle cx="432" cy="149" r="5"/><circle cx="386" cy="151" r="4"/><circle cx="408" cy="151" r="4"/></g>',
      '<g fill="#7BC043"><circle cx="372" cy="146" r="3"/><circle cx="412" cy="144" r="3"/></g><g fill="#E8352E"><circle cx="392" cy="144" r="3"/><circle cx="425" cy="146" r="3"/></g>',
      '<ellipse cx="402" cy="140" rx="20" ry="10" fill="#FFF7F0"/><circle cx="404" cy="139" r="7" fill="#FFC928"/>',
      // Steam.
      '<g fill="none" stroke="#FFF7F0" stroke-width="5" stroke-linecap="round" opacity="0.75"><path d="M370 122 q-12 -16 0 -30 q12 -14 0 -30"/><path d="M402 114 q-12 -16 0 -30 q12 -14 0 -30"/><path d="M434 122 q-12 -16 0 -30 q12 -14 0 -30"/></g>',
      // Cutting board with chillies and shallots.
      '<rect x="60" y="250" width="200" height="74" rx="14" fill="#E8B77A"/><rect x="60" y="250" width="200" height="74" rx="14" fill="none" stroke="#C98D4E" stroke-width="5"/><circle cx="238" cy="270" r="7" fill="#C98D4E"/>',
      '<path d="M96 292 q40 -28 74 -10 q-30 4 -74 18Z" fill="#E8352E"/><path d="M168 282 l10 -6 4 4 -8 6Z" fill="#2F8C3A"/>',
      '<path d="M104 306 q36 -18 62 -4 q-26 8 -62 12Z" fill="#E8352E"/>',
      '<g fill="#C77DA0"><ellipse cx="200" cy="300" rx="14" ry="11"/><ellipse cx="222" cy="306" rx="11" ry="9"/></g><g fill="#F3C6D9"><ellipse cx="200" cy="300" rx="7" ry="5"/></g>',
      '<path d="M120 268 L222 262 L226 270 L122 276Z" fill="#DADCE0"/><rect x="226" y="259" width="26" height="12" rx="4" fill="#2A2B30"/>',
      // Chef with a hat.
      `<g transform="translate(500 176) scale(0.95)">${fruitMarkup('semangka', 'wow')}</g>`,
      '<path d="M516 170 q-14 -36 16 -38 q14 -22 36 -6 q28 -8 26 20 q16 14 -4 24Z" fill="#FFFFFF"/><rect x="516" y="160" width="74" height="16" rx="5" fill="#F2F2F2"/>',
      '<path d="M0 340 h640 v20 h-640Z" fill="#8A5A2B"/>',
    ].join(''),
  );
}

export function gambarSvg(): string {
  return svgDoc(
    640,
    360,
    [
      '<defs><pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="2.4" fill="#FF7DB0"/></pattern></defs>',
      '<rect width="640" height="360" fill="#FF5C9A"/><rect width="640" height="360" fill="url(#dots)"/>',
      '<path d="M240 250 L210 350 M400 250 L430 350 M320 240 L320 350" stroke="#7A4A1E" stroke-width="10" stroke-linecap="round"/>',
      '<g transform="rotate(-3 320 140)"><rect x="196" y="36" width="248" height="208" rx="6" fill="#FFF7F0"/><rect x="196" y="236" width="248" height="10" fill="#7A4A1E"/>',
      '<g fill="none" stroke="#111214" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><circle cx="314" cy="150" r="46"/><path d="M278 118 L284 84 L304 106 M350 118 L344 84 L324 106"/><path d="M262 154 H292 M262 168 L292 162 M366 154 H336 M366 168 L336 162"/><path d="M306 160 Q314 168 322 160"/></g>',
      '<circle cx="298" cy="144" r="5" fill="#111214"/><circle cx="330" cy="144" r="5" fill="#111214"/>',
      '<circle cx="404" cy="76" r="16" fill="none" stroke="#FFC928" stroke-width="5"/><path d="M404 50 V56 M404 96 V102 M378 76 H384 M424 76 H430" stroke="#FFC928" stroke-width="5" stroke-linecap="round"/></g>',
      '<g transform="rotate(-18 120 300)"><rect x="60" y="292" width="120" height="16" rx="3" fill="#2F8CFF"/><path d="M180 292 L200 300 L180 308Z" fill="#F3D9B0"/></g>',
      '<g transform="rotate(14 520 300)"><rect x="460" y="292" width="110" height="16" rx="3" fill="#FFC928"/><path d="M570 292 L590 300 L570 308Z" fill="#F3D9B0"/></g>',
      '<path d="M470 120 h120 a14 14 0 0 1 14 14 v34 a14 14 0 0 1 -14 14 h-82 l-18 16 l2 -16 h-22 a14 14 0 0 1 -14 -14 v-34 a14 14 0 0 1 14 -14Z" fill="#fff" stroke="#111214" stroke-width="3"/>',
      '<text x="530" y="160" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="20" fill="#111214">Kucing?!</text>',
    ].join(''),
  );
}

export function panjatSvg(): string {
  return svgDoc(
    640,
    360,
    [
      '<rect width="640" height="360" fill="#7FD1FF"/>',
      '<g fill="#fff"><ellipse cx="110" cy="96" rx="44" ry="12"/><circle cx="100" cy="88" r="16"/><circle cx="122" cy="82" r="19"/><ellipse cx="540" cy="120" rx="40" ry="11"/><circle cx="552" cy="110" r="16"/></g>',
      '<path d="M0 290 C140 270 260 280 320 286 C420 276 540 272 640 286 V360 H0Z" fill="#5DB04F"/>',
      '<rect x="306" y="70" width="28" height="290" fill="#C8925A"/>',
      '<path d="M306 100 L334 84 M306 140 L334 124 M306 180 L334 164 M306 220 L334 204 M306 260 L334 244 M306 300 L334 284" stroke="#E6B880" stroke-width="5"/>',
      '<ellipse cx="320" cy="72" rx="96" ry="14" fill="none" stroke="#7A4A1E" stroke-width="6"/>',
      '<path d="M320 72 V20" stroke="#5A3A1A" stroke-width="3"/><path d="M320 20 h30 v9 h-30Z" fill="#E8352E"/><path d="M320 29 h30 v9 h-30Z" fill="#fff"/>',
      '<path d="M240 76 V104 M276 84 V118 M366 84 V112 M402 76 V100" stroke="#5A3A1A" stroke-width="2"/>',
      '<g fill="none" stroke="#111214" stroke-width="3"><circle cx="228" cy="118" r="11"/><circle cx="252" cy="118" r="11"/><path d="M228 118 L240 104 L252 118 M240 104 H246"/></g>',
      '<rect x="264" y="118" width="24" height="22" rx="3" fill="#FFC928"/><path d="M276 118 V140 M264 128 H288" stroke="#FF5A1F" stroke-width="3"/>',
      '<path d="M354 112 h24 l-3 26 h-18Z" fill="#2F8CFF"/><rect x="390" y="100" width="26" height="20" rx="4" fill="#22B35E"/>',
      '<g transform="translate(320 214)"><rect x="-16" y="-10" width="32" height="44" rx="12" fill="#22B35E"/><path d="M-12 -2 Q-22 -20 -14 -40 M12 -2 Q22 -20 14 -40" fill="none" stroke="#22B35E" stroke-width="9" stroke-linecap="round"/><circle cx="-14" cy="-40" r="6" fill="#fff" stroke="#111214" stroke-width="1.5"/><circle cx="14" cy="-40" r="6" fill="#fff" stroke="#111214" stroke-width="1.5"/><path d="M-8 32 Q-20 44 -14 58 M8 32 Q20 44 14 58" fill="none" stroke="#2B3A55" stroke-width="10" stroke-linecap="round"/>',
      `<g transform="translate(-25.6 -62) scale(0.8)">${fruitMarkup('nanas', 'effort')}</g></g>`,
    ].join(''),
  );
}
