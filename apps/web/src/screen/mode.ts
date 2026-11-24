/**
 * Whether this main screen is a far-away one (long-distance play, owner 2026-11-24): opened from
 * the Host's link `/J/<code>-<key>` (main.ts turns it into `/main?mirror=<code>-<key>`). It then
 * watches that room and draws what the Host's main screen shows; it never controls anything.
 */
import { type MirrorLink, parseMirrorLink } from '@hoorah/protocol';

export const MIRROR: MirrorLink | null = parseMirrorLink(new URLSearchParams(location.search).get('mirror'));
