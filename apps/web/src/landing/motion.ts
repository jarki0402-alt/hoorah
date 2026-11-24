/**
 * Motion plumbing of the landing page: one shared scroll loop (read then write, once per frame),
 * one shared reveal observer, in-view tracking, reduced-motion and media-query signals. Everything
 * moves with transforms and opacity only.
 */
import { signal } from '@preact/signals';
import type { RefObject } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { looksLikeTv } from '../shared/device';

function media(query: string): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(query) : null;
}

function watchMedia(mql: MediaQueryList, fn: (matches: boolean) => void): () => void {
  const on = (e: MediaQueryListEvent) => fn(e.matches);
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', on);
    return () => mql.removeEventListener('change', on);
  }
  // Safari before 14 and old Smart TV browsers only know the legacy listener.
  mql.addListener(on);
  return () => mql.removeListener(on);
}

const reducedQuery = media('(prefers-reduced-motion: reduce)');

/** The visitor asked for less motion: no parallax, drifting or auto cycling. */
export const reducedMotion = signal(reducedQuery?.matches ?? false);
if (reducedQuery) watchMedia(reducedQuery, (m) => (reducedMotion.value = m));

/** Smart TV browsers are weak: fewer simultaneous animations (no parallax, fewer floating fruits). */
export const liteMotion = looksLikeTv();

/** A media query as component state. */
export function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => media(query)?.matches ?? false);
  useEffect(() => {
    const mql = media(query);
    if (!mql) return;
    setMatches(mql.matches);
    return watchMedia(mql, setMatches);
  }, [query]);
  return matches;
}

/* ------------------------------------------------------------------ scroll loop */

/** Reads layout and returns the writes to apply (or nothing). Writes run after every read. */
export type FrameReader = (viewport: { w: number; h: number }) => (() => void) | undefined;

const readers = new Set<FrameReader>();
let queued = false;

function runFrame(): void {
  queued = false;
  const viewport = { w: window.innerWidth, h: window.innerHeight };
  const writes: (() => void)[] = [];
  for (const read of readers) {
    const write = read(viewport);
    if (write) writes.push(write);
  }
  for (const write of writes) write();
}

/** Schedules one frame of every scroll reader (scroll, resize and layout changes call this). */
export function requestFrame(): void {
  if (queued) return;
  queued = true;
  window.requestAnimationFrame(runFrame);
}

/** Runs `read` on every scroll frame until the returned function is called. */
export function onScrollFrame(read: FrameReader): () => void {
  readers.add(read);
  if (readers.size === 1) {
    window.addEventListener('scroll', requestFrame, { passive: true });
    window.addEventListener('resize', requestFrame);
  }
  requestFrame();
  return () => {
    readers.delete(read);
    if (readers.size === 0) {
      window.removeEventListener('scroll', requestFrame);
      window.removeEventListener('resize', requestFrame);
    }
  };
}

/* ------------------------------------------------------------------ in view */

const hasIo = typeof window.IntersectionObserver === 'function';

/** Whether the element is on screen (with `margin` around the viewport). True without the API. */
export function useInView(ref: RefObject<Element>, margin = '0px', once = false): boolean {
  const [inView, setInView] = useState(!hasIo);
  useEffect(() => {
    const el = ref.current;
    if (!el || !hasIo) return;
    const io = new IntersectionObserver(
      (entries) => {
        const seen = entries.some((e) => e.isIntersecting);
        setInView(seen);
        if (seen && once) io.disconnect();
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin, once]);
  return inView;
}

/* ------------------------------------------------------------------ reveal */

let revealIo: IntersectionObserver | null = null;

function revealObserver(): IntersectionObserver | null {
  if (!hasIo) return null;
  revealIo ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('is-in');
        revealIo?.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );
  return revealIo;
}

/** Fades and lifts the element in the first time it scrolls into view (see `.rv` in the CSS). */
export function useReveal(ref: RefObject<Element>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = revealObserver();
    if (!io || reducedMotion.value) {
      el.classList.add('is-in');
      return;
    }
    io.observe(el);
    return () => io.unobserve(el);
  }, [ref]);
}

/**
 * Pauses the CSS animations of a section while it is off screen (`.is-idle`), so a weak Smart TV
 * only runs what is visible.
 */
export function useLiveSection(ref: RefObject<Element>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || !hasIo) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) e.target.classList.toggle('is-idle', !e.isIntersecting);
      },
      { rootMargin: '120px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
}

/* ------------------------------------------------------------------ parallax */

/**
 * Moves the element up or down by `speed` times its anchor's distance from the middle of the
 * screen. The anchor (an untransformed parent) is measured, never the moving element itself.
 */
export function useParallax(ref: RefObject<HTMLElement>, speed: number): void {
  useEffect(() => {
    const el = ref.current;
    const anchor = el?.parentElement;
    if (!el || !anchor || liteMotion || reducedMotion.value) return;
    const stop = onScrollFrame(({ h }) => {
      const r = anchor.getBoundingClientRect();
      if (r.bottom < -h * 0.5 || r.top > h * 1.5) return undefined;
      const y = Math.round((r.top + r.height / 2 - h / 2) * speed);
      return () => {
        el.style.transform = `translate3d(0, ${y}px, 0)`;
      };
    });
    return () => {
      stop();
      el.style.transform = '';
    };
  }, [ref, speed]);
}
