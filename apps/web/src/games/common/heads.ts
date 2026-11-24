/**
 * Player heads (cast looks) as Phaser textures for the 2D games, rasterized the first time a look
 * shows up: looks cannot be listed ahead like the old fruits. Until a head is ready the key is
 * Phaser's transparent `__DEFAULT`; `onReady(look)` then lets the scene swap the real one in.
 */
import type { Look } from '@hoorah/protocol';
import type * as Phaser from 'phaser';

/** Stable text id of a look (texture keys, change detection). */
export const lookId = (look: Look): string => [look.c, look.s, look.h, look.hc, look.oc].join('.');

/** Phaser's built-in transparent texture: the stand-in while a head rasterizes. */
export const BLANK_KEY = '__DEFAULT';

export class HeadBank<F extends string> {
  private readonly pending = new Set<string>();

  constructor(
    private readonly textures: Phaser.Textures.TextureManager,
    /** Texture key of one face of a look. */
    private readonly keyOf: (look: Look, face: F) => string,
    /** Every face of a look, rasterized, by texture key. */
    private readonly load: (look: Look) => Promise<Map<string, HTMLImageElement | HTMLCanvasElement>>,
    private readonly onReady: (look: Look) => void,
  ) {}

  /** Texture key of a head, or BLANK_KEY while it is still rasterizing (onReady follows). */
  key(look: Look, face: F): string {
    const key = this.keyOf(look, face);
    if (this.textures.exists(key)) return key;
    this.request(look);
    return BLANK_KEY;
  }

  private request(look: Look): void {
    const id = lookId(look);
    if (this.pending.has(id)) return;
    this.pending.add(id);
    this.load(look).then(
      (images) => {
        for (const [key, img] of images) {
          if (this.textures.exists(key)) continue;
          if (img instanceof HTMLImageElement) this.textures.addImage(key, img);
          else this.textures.addCanvas(key, img);
        }
        this.pending.delete(id);
        this.onReady(look);
      },
      // A failed head stays pending so it is not retried every frame; the blank stand-in remains.
      () => undefined,
    );
  }
}
