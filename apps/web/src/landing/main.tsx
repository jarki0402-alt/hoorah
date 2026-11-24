/**
 * The landing page at `/` for newcomers: what Hoorah is, how to start and what it costs. A normal
 * scrolling page (unlike the app screens): zoom is allowed and the body scrolls.
 */
import '@fontsource/baloo-2/latin-700.css';
import '@fontsource/baloo-2/latin-800.css';
import '@fontsource/plus-jakarta-sans/latin-400.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/plus-jakarta-sans/latin-800.css';
import '../shared/base.css';
import './landing.css';
import { render } from 'preact';
import { looksLikePhone } from '../shared/device';
import { Logo } from '../shared/ui';
import { loadArt } from './artLoader';
import { Parade } from './cast';
import { Hero } from './hero';
import { Audience, Closing, Devices, Faq, Footer, Pricing } from './info';
import { liteMotion, reducedMotion } from './motion';
import { bindRemote } from './nav';
import { PartySection } from './party';
import { Showcase } from './showcase';
import { Steps } from './steps';
import { STR } from './strings';

/** `index.html` locks zoom for the app screens; a page of text must allow it (accessibility). */
function allowZoom(): void {
  const meta = document.querySelector('meta[name="viewport"]');
  meta?.setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

function Landing({ phone }: { phone: boolean }) {
  return (
    <div class="lp">
      <header class="lp-top">
        <div class="lp-wrap lp-top-inner">
          <Logo size={34} />
        </div>
      </header>
      <main>
        <Hero phone={phone} />
        <Parade />
        <Steps />
        <Showcase />
        <PartySection />
        <Audience />
        <Devices />
        <Pricing phone={phone} />
        <Faq />
        <Closing phone={phone} />
      </main>
      <Footer />
    </div>
  );
}

const phone = looksLikePhone();
const root = document.documentElement;
root.classList.add('lp-root');
// Reveal-on-scroll hides blocks until they are seen; only when the browser can tell us that.
if (typeof window.IntersectionObserver === 'function' && !reducedMotion.value)
  root.classList.add('lp-motion');
if (liteMotion) root.classList.add('lp-lite');
document.title = STR.pageTitle;
allowZoom();
loadArt();

const app = document.getElementById('app')!;
render(<Landing phone={phone} />, app);
bindRemote(app, liteMotion);
// A remote has no pointer: start on the main button so the first press of OK starts playing.
if (liteMotion) document.getElementById('lp-start')?.focus({ preventScroll: true });
