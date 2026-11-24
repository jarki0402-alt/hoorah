import { describe, expect, it } from 'vitest';
import { assetUrls } from './prefetch';

const BASE = 'http://localhost:1010/games/bom/';

describe('assetUrls', () => {
  it('finds scripts, module preloads and stylesheets, deduped and absolute', () => {
    const html = `<!doctype html><html><head>
      <script type="module" crossorigin src="/assets/bom-abc.js"></script>
      <link rel="modulepreload" crossorigin href="/assets/three-def.js">
      <link rel="stylesheet" crossorigin href="/assets/bom-123.css">
      <link href='/assets/three-def.js' rel='modulepreload'>
      <link rel="icon" href="/favicon.svg">
      <script>console.log(1)</script>
    </head><body><script type="module" src="./main.tsx"></script></body></html>`;
    expect(assetUrls(html, BASE)).toEqual([
      'http://localhost:1010/assets/bom-abc.js',
      'http://localhost:1010/assets/three-def.js',
      'http://localhost:1010/assets/bom-123.css',
      'http://localhost:1010/games/bom/main.tsx',
    ]);
  });

  it('ignores other origins', () => {
    const html = '<script src="https://cdn.example.com/x.js"></script><link rel=stylesheet href=/a.css>';
    expect(assetUrls(html, BASE)).toEqual(['http://localhost:1010/a.css']);
  });
});
