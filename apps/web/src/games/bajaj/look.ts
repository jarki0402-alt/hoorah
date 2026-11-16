/**
 * Bajaj Rush look kit: PBR materials, renderer setup, image-based lighting from a procedural sky
 * (no files), a warm sun with follow-the-action soft shadows, sky moods per map and automatic
 * quality tiers. Every map and model should get its look from here.
 *
 * Renderer core (scene.ts):
 *   setupRenderer(renderer)                    ACES Filmic, sRGB output, PCF shadow maps
 *   const rig = new LightRig(renderer, scene, sun, hemi)
 *   rig.setSky(SKIES.kota)                     sun, hemisphere fill, IBL, exposure (any `Mood` works too)
 *   upgradeMaterials(map.root)                 old toon/lambert materials -> PBR, shadow flags, prop culling
 *   per frame, for every viewport first: rig.shadowView(vi, count, camera)   (shadow maps)
 *   then per viewport:  rig.useView(vi) right before renderer.render(scene, camera)
 *   The game's quality ladder (quality.ts) steps shadows down through `rig.stepDown()`.
 *
 * Graphics level (common/gfx.ts): `new LightRig(..., level)` picks the starting shadow tier, and
 * `setLightMaterials(true)` before the first material turns the whole kit into Lambert materials
 * without sky reflections for the low level (Smart TVs, weak GPUs).
 *
 * Map builders:
 *   - Merged GeoBuilder chunks: render with MAT.surface() and pick finishes per part with
 *     `builder.surface = SURF.glass | SURF.metal | SURF.chrome | SURF.gloss | glow(2) ...` (geo.ts).
 *   - Single objects: MAT.paint(color), MAT.chrome(), MAT.glass(), MAT.rubber(), MAT.plastic(c),
 *     MAT.wood(), MAT.concrete(), MAT.asphalt(), MAT.foliage(c), MAT.water(), MAT.sand(),
 *     MAT.fabric(c), MAT.emissive(c, k). They are cached: the same arguments share one material.
 *   - Moods: SKIES.kota / pantai / puncak / arena are complete `Mood`s (sun, fill, fog, sky colours
 *     for reflections). Copy one with `{ ...SKIES.pantai, fogFar: 600 }` to tweak.
 *   - Glows: emissive surfaces read as lit at any tier; avoid real lights and post-processing.
 *   - Shadows: meshes cast/receive automatically after upgradeMaterials; set
 *     `mesh.userData.noShadow = true` to opt out (big flat ground pieces already do).
 */
import * as THREE from 'three';
import type { GfxTier } from '../common/gfx';
import { LEVELS, type QualityTier } from './quality';
import { grainTexture, sandTexture, sharedAsphalt, waterNormalTexture } from './textures';

export { glow, SURF, type Surf } from './geo';
export type { QualityTier } from './quality';

/* ------------------------------------------------------------------ sky moods */

/** A map's lighting mood. Field names match `Mood` in maps/types.ts, plus sky colours for IBL. */
export interface SkyLook {
  sunDir: THREE.Vector3;
  sunColor: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  fog: THREE.Color;
  fogNear: number;
  fogFar: number;
  /** Sky colours used for reflections and ambient light (not the visible sky dome). */
  zenith: number;
  horizon: number;
  ground: number;
  /** What breaks the horizon in reflections. */
  skyline: 'city' | 'hills' | 'sea' | 'stands';
  envIntensity: number;
  exposure: number;
}

/** Anything with the `Mood` fields (older maps tuned for toon shading). */
export type MoodLike = Pick<
  SkyLook,
  | 'sunDir'
  | 'sunColor'
  | 'sunIntensity'
  | 'hemiSky'
  | 'hemiGround'
  | 'hemiIntensity'
  | 'fog'
  | 'fogNear'
  | 'fogFar'
>;

const dir = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).normalize();

export const SKIES = {
  /** Lingkar Kota: warm, bright late morning. */
  kota: {
    sunDir: dir(-0.55, 0.78, 0.3),
    sunColor: 0xffe7c4,
    sunIntensity: 3.6,
    hemiSky: 0xcfe4ff,
    hemiGround: 0x9a8870,
    hemiIntensity: 0.42,
    fog: new THREE.Color(0xcfe6f2),
    fogNear: 140,
    fogFar: 460,
    zenith: 0x3d8ddc,
    horizon: 0xdcebf3,
    ground: 0x8c8476,
    skyline: 'city',
    envIntensity: 0.72,
    exposure: 0.98,
  },
  /** Pesisir Pantai: high tropical sun, sand-bounced fill, sea horizon. */
  pantai: {
    sunDir: dir(0.42, 0.84, -0.36),
    sunColor: 0xfff2dc,
    sunIntensity: 3.5,
    hemiSky: 0xd0ecff,
    hemiGround: 0xd6bf90,
    hemiIntensity: 0.6,
    fog: new THREE.Color(0xd4eef3),
    fogNear: 170,
    fogFar: 540,
    zenith: 0x2b93e2,
    horizon: 0xd7f0f3,
    ground: 0xcdb78c,
    skyline: 'sea',
    envIntensity: 0.95,
    exposure: 1.0,
  },
  /** Jalur Puncak: cool morning on the tea hills, soft low sun and mint haze. */
  puncak: {
    sunDir: dir(0.62, 0.52, 0.45),
    sunColor: 0xffe2bd,
    sunIntensity: 2.9,
    hemiSky: 0xd6ebf2,
    hemiGround: 0x6f8a58,
    hemiIntensity: 0.62,
    fog: new THREE.Color(0xd2e3dc),
    fogNear: 90,
    fogFar: 380,
    zenith: 0x5a9ed6,
    horizon: 0xdce9e3,
    ground: 0x5f7d4c,
    skyline: 'hills',
    envIntensity: 0.9,
    exposure: 1.05,
  },
  /** Arena Tempur: golden late afternoon over the market square. */
  arena: {
    sunDir: dir(-0.68, 0.46, -0.32),
    sunColor: 0xffd09a,
    sunIntensity: 3.1,
    hemiSky: 0xe2dccb,
    hemiGround: 0x8d7356,
    hemiIntensity: 0.55,
    fog: new THREE.Color(0xeadbc2),
    fogNear: 110,
    fogFar: 420,
    zenith: 0x4b8bcb,
    horizon: 0xf2dcb9,
    ground: 0x8a7860,
    skyline: 'stands',
    envIntensity: 0.95,
    exposure: 1.0,
  },
} as const satisfies Record<string, SkyLook>;

const SKYLINES: Record<string, SkyLook['skyline']> = {
  kota: 'city',
  pantai: 'sea',
  puncak: 'hills',
  arena: 'stands',
};

/**
 * Full sky look for any mood. SkyLooks pass through; older toon-tuned moods keep their colours
 * (they match each map's painted sky and fog) with intensities re-balanced for PBR, and get
 * reflection colours from their fog and fill. `mapId` picks what breaks the reflected horizon.
 */
export function skyFromMood(m: MoodLike | SkyLook, mapId?: string): SkyLook {
  if ('envIntensity' in m) return m;
  const fog = m.fog.clone();
  return {
    ...m,
    sunIntensity: m.sunIntensity * 1.7,
    hemiIntensity: m.hemiIntensity * 0.34,
    zenith: new THREE.Color(m.hemiSky).multiplyScalar(0.62).getHex(),
    horizon: fog.getHex(),
    ground: new THREE.Color(m.hemiGround).getHex(),
    skyline: SKYLINES[mapId ?? ''] ?? 'city',
    envIntensity: 0.75,
    exposure: 0.98,
  };
}

/* ------------------------------------------------------------------ renderer + IBL */

/**
 * Cheaper soft-shadow filter for PCF maps: four hardware-filtered taps (16 texels) in a fixed
 * pattern instead of three's five noise-rotated taps with per-pixel trig, plus a fade at the
 * edge of the shadow area so the follow-cam box never shows a hard line. Most of a shadow's cost
 * is this lookup on every lit pixel, so this matters more than the shadow pass itself.
 * `?pcf=three` keeps three's own filter (for A/B checks).
 */
let filterInstalled = false;
function installShadowFilter(): void {
  if (filterInstalled) return;
  filterInstalled = true;
  if (new URLSearchParams(window.location.search).get('pcf') === 'three') return;
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  const sig = 'float getShadow( sampler2DShadow shadowMap,';
  const start = chunk.indexOf(sig);
  if (start < 0) return;
  // Find the end of the function body by brace matching.
  let depth = 0;
  let end = -1;
  for (let i = chunk.indexOf('{', start); i < chunk.length; i++) {
    if (chunk[i] === '{') depth++;
    else if (chunk[i] === '}' && --depth === 0) {
      end = i + 1;
      break;
    }
  }
  if (end < 0) return;
  const fn = /* glsl */ `float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			shadowCoord.xyz /= shadowCoord.w;
			shadowCoord.z += shadowBias;
			vec2 e = min( shadowCoord.xy, 1.0 - shadowCoord.xy );
			float edge = min( e.x, e.y );
			if ( edge <= 0.0 || shadowCoord.z > 1.0 ) return 1.0;
			vec2 d = vec2( shadowRadius * 0.5 ) / shadowMapSize;
			float shadow = (
				texture( shadowMap, vec3( shadowCoord.xy + vec2( -d.x, -d.y ), shadowCoord.z ) ) +
				texture( shadowMap, vec3( shadowCoord.xy + vec2( d.x, -d.y ), shadowCoord.z ) ) +
				texture( shadowMap, vec3( shadowCoord.xy + vec2( -d.x, d.y ), shadowCoord.z ) ) +
				texture( shadowMap, vec3( shadowCoord.xy + vec2( d.x, d.y ), shadowCoord.z ) )
			) * 0.25;
			return mix( 1.0, shadow, shadowIntensity * smoothstep( 0.0, 0.06, edge ) );
		}`;
  THREE.ShaderChunk.shadowmap_pars_fragment = chunk.slice(0, start) + fn + chunk.slice(end);
}

/** Tone mapping, colour space and shadow map type for every Bajaj Rush renderer. */
export function setupRenderer(r: THREE.WebGLRenderer): void {
  installShadowFilter();
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFShadowMap;
  r.shadowMap.autoUpdate = false;
}

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSun;
uniform vec3 uSunDir;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 sky = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.5));
  vec3 grd = mix(uHorizon * 0.8, uGround, smoothstep(0.0, 0.25, -h));
  vec3 col = h >= 0.0 ? sky : grd;
  float s = max(dot(d, uSunDir), 0.0);
  col += uSun * (pow(s, 1200.0) * 40.0 + pow(s, 64.0) * 0.9 + pow(s, 6.0) * 0.18);
  gl_FragColor = vec4(col, 1.0);
}`;

const envCache = new Map<string, THREE.Texture>();

function linear(hex: number): THREE.Color {
  return new THREE.Color(hex);
}

/**
 * Prefiltered environment map rendered from a procedural sky (gradient, sun glow and a soft
 * skyline band so glossy paint shows a horizon). Cached per mood.
 */
export function makeEnvironment(renderer: THREE.WebGLRenderer, look: SkyLook): THREE.Texture {
  const key = [
    look.zenith,
    look.horizon,
    look.ground,
    look.sunColor,
    look.skyline,
    look.sunDir.x.toFixed(3),
    look.sunDir.y.toFixed(3),
    look.sunDir.z.toFixed(3),
  ].join('|');
  const hit = envCache.get(key);
  if (hit) return hit;
  const scene = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(50, 48, 24),
    new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uZenith: { value: linear(look.zenith) },
        uHorizon: { value: linear(look.horizon) },
        uGround: { value: linear(look.ground) },
        uSun: { value: linear(look.sunColor) },
        uSunDir: { value: look.sunDir.clone().normalize() },
      },
    }),
  );
  scene.add(sky);
  // Horizon breakers: low-contrast shapes, so reflections show a believable world.
  const band = new THREE.Color(look.horizon).lerp(new THREE.Color(look.ground), 0.55);
  const mat = new THREE.MeshBasicMaterial({ color: band });
  const add = (g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0) => {
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    scene.add(m);
  };
  if (look.skyline === 'city' || look.skyline === 'stands') {
    const n = look.skyline === 'city' ? 46 : 28;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.sin(i * 7.1) * 0.05;
      const h = look.skyline === 'city' ? 3 + Math.abs(Math.sin(i * 12.9898)) * 9 : 6 + (i % 2) * 2;
      const w = look.skyline === 'city' ? 4 + Math.abs(Math.sin(i * 3.7)) * 4 : 9;
      add(new THREE.BoxGeometry(w, h, 2), Math.cos(a) * 38, h / 2 - 0.5, Math.sin(a) * 38, -a + Math.PI / 2);
    }
  } else if (look.skyline === 'hills') {
    const g = new THREE.CylinderGeometry(40, 40, 1, 96, 1, true);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) > 0) {
        const a = Math.atan2(p.getZ(i), p.getX(i));
        p.setY(i, 4 + Math.sin(a * 3) * 3 + Math.sin(a * 7 + 1) * 1.6 + Math.sin(a * 13) * 0.6);
      } else p.setY(i, -1);
    }
    const hm = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: band, side: THREE.DoubleSide }));
    scene.add(hm);
  } else {
    // Sea: a darker band just below the horizon.
    const g = new THREE.CylinderGeometry(42, 42, 4, 64, 1, true);
    const sea = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0x1f7fae).lerp(new THREE.Color(look.horizon), 0.3),
        side: THREE.DoubleSide,
      }),
    );
    sea.position.y = -2.05;
    scene.add(sea);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.012, 0.1, 100, { size: 256 });
  pmrem.dispose();
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
  envCache.set(key, rt.texture);
  return rt.texture;
}

/* ------------------------------------------------------------------ materials */

/** A lit material of this kit: PBR, or Lambert on the low graphics level. */
export type LitMaterial = THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;

let LIGHT = false;

/**
 * Low graphics level (Smart TVs, weak GPUs): every material from this kit becomes a Lambert
 * material (diffuse only: no specular, clearcoat, normal or roughness maps) and nothing gets the
 * sky's reflection map, which is then never rendered. Call before the first material is made.
 */
export function setLightMaterials(on: boolean): void {
  LIGHT = on;
}

export function lightMaterials(): boolean {
  return LIGHT;
}

/**
 * The Lambert twin of a PBR material on the low level (colour, maps, emission, blending and any
 * `withSurface` patch carry over); the material itself otherwise.
 */
export function forLevel(m: THREE.MeshStandardMaterial): LitMaterial {
  if (!LIGHT) return m;
  const l = new THREE.MeshLambertMaterial({
    color: m.color,
    map: m.map,
    vertexColors: m.vertexColors,
    emissive: m.emissive,
    emissiveMap: m.emissiveMap,
    emissiveIntensity: m.emissiveIntensity,
  });
  copyCommon(m, l);
  l.blendSrc = m.blendSrc;
  l.blendDst = m.blendDst;
  l.blendSrcAlpha = m.blendSrcAlpha;
  l.blendDstAlpha = m.blendDstAlpha;
  l.onBeforeCompile = m.onBeforeCompile;
  l.customProgramCacheKey = m.customProgramCacheKey;
  const attrs = (m as unknown as { defaultAttributeValues?: Record<string, number[]> })
    .defaultAttributeValues;
  if (attrs)
    (l as unknown as { defaultAttributeValues: Record<string, number[]> }).defaultAttributeValues = attrs;
  l.name = m.name;
  l.userData = { ...m.userData };
  return l;
}

const SURF_KEY = 'bajaj-surf-v1';

/**
 * Teach a standard/physical material the per-vertex `aSurf` attribute (see geo.ts): roughness,
 * metalness and clearcoat overrides plus emission (a Lambert material keeps only the emission).
 * Geometry without it renders unchanged.
 */
export function withSurface<T extends LitMaterial>(mat: T, key = ''): T {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    prev.call(mat, shader, r);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aSurf;\nvarying vec4 vSurf;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = aSurf;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vSurf;')
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nif (vSurf.x < 0.999) roughnessFactor = vSurf.x * 1.004;',
      )
      .replace(
        '#include <metalnessmap_fragment>',
        '#include <metalnessmap_fragment>\nif (vSurf.y < 0.999) metalnessFactor = vSurf.y * 1.004;',
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vSurf.w * 8.0;',
      )
      .replace(
        '#include <lights_physical_fragment>',
        '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nif (vSurf.z < 0.999) material.clearcoat = vSurf.z * 1.004;\n#endif',
      );
  };
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${prevKey()}|${SURF_KEY}|${key}`;
  // Geometry without aSurf reads these: "use the material's own values, no emission".
  (mat as unknown as { defaultAttributeValues: Record<string, number[]> }).defaultAttributeValues = {
    aSurf: [1, 1, 1, 0],
  };
  return mat;
}

/* ------------------------------------------------------------------ reflections */

/**
 * Image-based lighting is applied only to materials that visibly reflect (paint, chrome, glass,
 * window façades, water): the environment lookup is the single most expensive part of a lit
 * pixel, and matte plaster, asphalt and foliage get their ambient light from the hemisphere fill
 * instead. Register a material with `reflective(m)`; the current sky is applied to it.
 */
const reflectiveSet = new Set<THREE.MeshStandardMaterial>();
let currentEnv: THREE.Texture | null = null;
let currentEnvIntensity = 1;

/** Mark a material as reflective: it gets the sky's environment map (now and on map changes). */
export function reflective<T extends THREE.MeshStandardMaterial>(m: T, strength = 1): T {
  // The low level has no reflections (its materials become Lambert).
  if (LIGHT) return m;
  m.userData.reflect = strength;
  reflectiveSet.add(m);
  applyEnv(m);
  return m;
}

function applyEnv(m: THREE.MeshStandardMaterial): void {
  if (m.envMap !== currentEnv) {
    m.envMap = currentEnv;
    m.needsUpdate = true;
  }
  m.envMapIntensity = currentEnvIntensity * ((m.userData.reflect as number | undefined) ?? 1);
}

const matCache = new Map<string, LitMaterial>();

function cached(key: string, make: () => THREE.MeshStandardMaterial): LitMaterial {
  const hit = matCache.get(key);
  if (hit) return hit;
  const pbr = make();
  pbr.name = key;
  const m = forLevel(pbr);
  matCache.set(key, m);
  return m;
}

const hex = (c: THREE.ColorRepresentation) => new THREE.Color(c).getHexString();

/** Shared PBR material library (cached instances). */
export const MAT = {
  /** Vertex-coloured standard material that reads per-vertex surfaces: merged map chunks, props. */
  surface(): LitMaterial {
    return cached('surface', () =>
      withSurface(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 })),
    );
  },
  /** Like `surface` with a clearcoat layer: karts, drivers, glossy hero props. */
  surfacePhysical(): LitMaterial {
    return cached('surfacePhysical', () =>
      reflective(
        withSurface(
          new THREE.MeshPhysicalMaterial({
            vertexColors: true,
            roughness: 0.5,
            metalness: 0,
            clearcoat: 1,
            clearcoatRoughness: 0.06,
          }),
        ),
      ),
    );
  },
  /** Glossy car paint with clearcoat. */
  paint(color: THREE.ColorRepresentation): LitMaterial {
    return cached(`paint-${hex(color)}`, () =>
      reflective(
        new THREE.MeshPhysicalMaterial({
          color,
          metalness: 0.18,
          roughness: 0.36,
          clearcoat: 1,
          clearcoatRoughness: 0.05,
        }),
      ),
    );
  },
  chrome(): LitMaterial {
    return cached('chrome', () =>
      reflective(new THREE.MeshStandardMaterial({ color: 0xf1f3f5, metalness: 1, roughness: 0.08 })),
    );
  },
  metal(color: THREE.ColorRepresentation = 0x9aa0a6, roughness = 0.38): LitMaterial {
    return cached(`metal-${hex(color)}-${roughness}`, () =>
      reflective(new THREE.MeshStandardMaterial({ color, metalness: 0.85, roughness })),
    );
  },
  /**
   * Window glass: dark tint, strong Fresnel reflections, background dimmed slightly. Uses
   * premultiplied-style blending instead of real transmission (cheap on every device).
   */
  glass(tint: THREE.ColorRepresentation = 0x0d1a1f, opacity = 0.2): LitMaterial {
    return cached(`glass-${hex(tint)}-${opacity}`, () =>
      reflective(
        new THREE.MeshPhysicalMaterial({
          color: tint,
          metalness: 0,
          roughness: 0.03,
          transparent: true,
          opacity,
          depthWrite: false,
          blending: THREE.CustomBlending,
          blendSrc: THREE.OneFactor,
          blendDst: THREE.OneMinusSrcAlphaFactor,
          blendSrcAlpha: THREE.OneFactor,
          blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
        }),
        2.4,
      ),
    );
  },
  rubber(): LitMaterial {
    return cached('rubber', () => new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.88 }));
  },
  plastic(color: THREE.ColorRepresentation, roughness = 0.42): LitMaterial {
    return cached(`plastic-${hex(color)}-${roughness}`, () =>
      reflective(new THREE.MeshStandardMaterial({ color, roughness }), 0.8),
    );
  },
  wood(color: THREE.ColorRepresentation = 0x9a6a42): LitMaterial {
    return cached(`wood-${hex(color)}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.72 }));
  },
  concrete(color: THREE.ColorRepresentation = 0xd2cbbf): LitMaterial {
    return cached(
      `concrete-${hex(color)}`,
      () => new THREE.MeshStandardMaterial({ color, roughness: 0.92, map: grainTexture() }),
    );
  },
  /** Road surface with fine normal and roughness variation (`map` defaults to the asphalt grain). */
  asphalt(map?: THREE.Texture): LitMaterial {
    const t = map ?? sharedAsphalt();
    return cached(`asphalt-${t.uuid}`, () => texturedStandard(t));
  },
  foliage(color: THREE.ColorRepresentation = 0x3f9e4a): LitMaterial {
    return cached(
      `foliage-${hex(color)}`,
      () =>
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.7,
          emissive: new THREE.Color(color).multiplyScalar(0.06),
        }),
    );
  },
  water(color: THREE.ColorRepresentation = 0x1f86b8): LitMaterial {
    return cached(`water-${hex(color)}`, () => {
      const n = waterNormalTexture();
      return reflective(
        new THREE.MeshPhysicalMaterial({
          color,
          roughness: 0.06,
          metalness: 0,
          normalMap: n,
          normalScale: new THREE.Vector2(0.6, 0.6),
          clearcoat: 1,
          clearcoatRoughness: 0.02,
        }),
        1.3,
      );
    });
  },
  sand(color: THREE.ColorRepresentation = 0xead6a8): LitMaterial {
    return cached(
      `sand-${hex(color)}`,
      () => new THREE.MeshStandardMaterial({ color, roughness: 0.96, map: sandTexture() }),
    );
  },
  /** Canvas, cloth, awnings: matte with a soft sheen at grazing angles. */
  fabric(color: THREE.ColorRepresentation): LitMaterial {
    return cached(
      `fabric-${hex(color)}`,
      () =>
        new THREE.MeshPhysicalMaterial({
          color,
          roughness: 0.9,
          sheen: 0.6,
          sheenRoughness: 0.6,
          sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.5),
        }),
    );
  },
  /** Self-lit: lamps, lit signs, turbo glow. `k` > 1 blooms into white under tone mapping. */
  emissive(color: THREE.ColorRepresentation, k = 2): LitMaterial {
    return cached(
      `emissive-${hex(color)}-${k}`,
      () =>
        new THREE.MeshStandardMaterial({
          color: 0x000000,
          emissive: color,
          emissiveIntensity: k,
          roughness: 0.4,
        }),
    );
  },
};

/** PBR intent a texture can declare in `texture.userData.surface` (see textures.ts). */
export interface TextureSurface {
  roughness?: number;
  metalness?: number;
  normalMap?: THREE.Texture;
  normalScale?: number;
  roughnessMap?: THREE.Texture;
  /** Self-illumination as a fraction of the texture colour (signs stay readable in shadow). */
  emissive?: number;
}

function texturedStandard(map: THREE.Texture, base?: THREE.Material): THREE.MeshStandardMaterial {
  const s = (map.userData.surface ?? {}) as TextureSurface;
  const m = new THREE.MeshStandardMaterial({
    map,
    roughness: s.roughness ?? 0.85,
    metalness: s.metalness ?? 0,
  });
  if (s.normalMap) {
    m.normalMap = s.normalMap;
    m.normalScale.setScalar(s.normalScale ?? 1);
  }
  if (s.roughnessMap) m.roughnessMap = s.roughnessMap;
  if (s.emissive) {
    m.emissive.setScalar(s.emissive);
    m.emissiveMap = map;
  }
  if (base) copyCommon(base, m);
  // Glass façades and water show the sky; matte textures do not need the lookup.
  if (s.roughnessMap || (s.roughness ?? 1) < 0.3) reflective(m);
  return m;
}

function copyCommon(from: THREE.Material, to: THREE.Material): void {
  to.side = from.side;
  to.transparent = from.transparent;
  to.opacity = from.opacity;
  to.depthWrite = from.depthWrite;
  to.depthTest = from.depthTest;
  to.polygonOffset = from.polygonOffset;
  to.polygonOffsetFactor = from.polygonOffsetFactor;
  to.polygonOffsetUnits = from.polygonOffsetUnits;
  to.alphaTest = from.alphaTest;
  (to as THREE.MeshStandardMaterial).fog = (from as THREE.MeshBasicMaterial).fog ?? true;
  to.blending = from.blending;
  to.visible = from.visible;
}

/* ------------------------------------------------------------------ legacy upgrade */

const upgraded = new WeakMap<THREE.Material, THREE.Material>();
const NO_CAST = /^(road|ground|groundpatch|decals|signs|water|sky)$/;

function upgradeOne(m: THREE.Material): THREE.Material {
  const hit = upgraded.get(m);
  if (hit) return hit;
  let out: THREE.Material = m;
  if (m instanceof THREE.MeshToonMaterial || m instanceof THREE.MeshLambertMaterial) {
    const map = m.map;
    if (map) {
      const s = texturedStandard(map, m);
      s.vertexColors = m.vertexColors;
      s.color.copy(m.color);
      out = s;
    } else if (m.vertexColors && m.onBeforeCompile === THREE.Material.prototype.onBeforeCompile) {
      // Plain vertex-coloured chunk material: share the surface-aware one.
      out = m.side === THREE.DoubleSide ? doubleSided(MAT.surface()) : MAT.surface();
    } else {
      const s = new THREE.MeshStandardMaterial({
        color: m.color,
        vertexColors: m.vertexColors,
        roughness: 0.8,
      });
      copyCommon(m, s);
      if (m instanceof THREE.MeshLambertMaterial) {
        s.emissive.copy(m.emissive).multiplyScalar(0.5);
        // Keep custom vertex animation (waving flags) working.
        s.onBeforeCompile = m.onBeforeCompile;
        s.customProgramCacheKey = m.customProgramCacheKey;
      }
      out = s;
    }
    out.name = `${m.name || m.type}->pbr`;
  } else if (m instanceof THREE.MeshBasicMaterial) {
    if (!m.fog) {
      // Sky dome, clouds, skyline: painted for display, keep them out of tone mapping.
      m.toneMapped = false;
    } else if (m.map && !m.transparent && !m.userData.keepBasic) {
      const s = texturedStandard(m.map, m);
      s.vertexColors = m.vertexColors;
      s.color.copy(m.color);
      if (!s.emissiveMap) {
        // Painted signs: lit like the walls they hang on, but never murky.
        s.emissiveMap = m.map;
        s.emissive.setScalar(0.22);
      }
      out = s;
    } else {
      m.toneMapped = false;
    }
  }
  // Low level: the Lambert twin of whatever PBR material was made here.
  if (out !== m && out instanceof THREE.MeshStandardMaterial) out = forLevel(out);
  upgraded.set(m, out);
  return out;
}

const doubleCache = new WeakMap<THREE.Material, THREE.Material>();
function doubleSided(m: LitMaterial): THREE.Material {
  let d = doubleCache.get(m);
  if (!d) {
    d = forLevel(
      withSurface(
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }),
        'ds',
      ),
    );
    doubleCache.set(m, d);
  }
  return d;
}

/**
 * Bring a map built with older toon/lambert/basic materials to the PBR look, in place:
 * materials are swapped (shared ones stay shared) and meshes get shadow flags. With
 * `split`, big static instanced props (frustum-culled, static draw usage) are split into 90 m
 * cells so each view and shadow pass only draws what is near: instanced meshes you animate
 * must set `frustumCulled = false` or DynamicDrawUsage. Materials the map mutates later (start
 * lights) are MeshBasic without a map and are kept. Kart meshes (`userData.kartPart`) are skipped.
 */
export function upgradeMaterials(root: THREE.Object3D, opts: { split?: boolean } = {}): void {
  const splits: THREE.InstancedMesh[] = [];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.userData.kartPart) return;
    if (Array.isArray(o.material)) o.material = o.material.map(upgradeOne);
    else o.material = upgradeOne(o.material);
    if (o.userData.lookDone) return;
    o.userData.lookDone = true;
    const mat = (Array.isArray(o.material) ? o.material[0] : o.material) as THREE.Material | undefined;
    const lit = mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshLambertMaterial;
    // Shadows land on the road, pavements, walls and karts; props and far façades skip the lookup.
    o.receiveShadow =
      lit && !o.userData.noShadow && !(o instanceof THREE.InstancedMesh) && o.name !== 'facade';
    // Animated instanced crowds and traffic are drawn in every pass (no culling): no shadows.
    const dynamicSet =
      o instanceof THREE.InstancedMesh &&
      (!o.frustumCulled || o.instanceMatrix.usage === THREE.DynamicDrawUsage);
    o.castShadow = lit && !mat.transparent && !NO_CAST.test(o.name) && !o.userData.noShadow && !dynamicSet;
    if (
      opts.split &&
      o instanceof THREE.InstancedMesh &&
      o.frustumCulled &&
      o.count > 24 &&
      o.instanceMatrix.usage === THREE.StaticDrawUsage
    )
      splits.push(o);
  });
  for (const m of splits) splitInstances(m, 150);
}

/** Replace a static InstancedMesh by one per `cell` metre square (same geometry and material). */
function splitInstances(src: THREE.InstancedMesh, cell: number): void {
  const parent = src.parent;
  if (!parent) return;
  const groups = new Map<string, number[]>();
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  for (let i = 0; i < src.count; i++) {
    src.getMatrixAt(i, m);
    p.setFromMatrixPosition(m);
    const key = `${Math.floor(p.x / cell)},${Math.floor(p.z / cell)}`;
    let g = groups.get(key);
    if (!g) {
      g = [];
      groups.set(key, g);
    }
    g.push(i);
  }
  if (groups.size < 2) return;
  const c = new THREE.Color();
  for (const ids of groups.values()) {
    const out = new THREE.InstancedMesh(src.geometry, src.material, ids.length);
    ids.forEach((id, j) => {
      src.getMatrixAt(id, m);
      out.setMatrixAt(j, m);
      if (src.instanceColor) {
        src.getColorAt(id, c);
        out.setColorAt(j, c);
      }
    });
    out.name = src.name;
    out.castShadow = src.castShadow;
    out.receiveShadow = src.receiveShadow;
    out.computeBoundingSphere();
    out.computeBoundingBox();
    parent.add(out);
  }
  parent.remove(src);
}

/* ------------------------------------------------------------------ lights, shadows, quality */

/**
 * Shadow tiers (`QualityTier`), highest first. The graphics level picks the starting one (high 3,
 * medium 2, low 0) and the game's quality ladder steps down one at a time before resolution.
 *  3: 2048 shadow map per viewport, updated every frame, karts cast real shadows.
 *  2: 1024 map, karts use their contact shadow only, views share updates on alternate frames.
 *  1: 1024 map over a smaller area, every view refreshed every third frame.
 *  0: no shadow maps (contact shadows and baked occlusion only).
 */

interface TierSpec {
  map: number;
  radius: number;
  every: number;
  karts: boolean;
}

const TIERS: Record<Exclude<QualityTier, 0>, TierSpec> = {
  3: { map: 2048, radius: 34, every: 1, karts: true },
  2: { map: 1024, radius: 30, every: 2, karts: false },
  1: { map: 1024, radius: 22, every: 3, karts: false },
};
/** Top tier with 3-4 viewports. */
const MULTI: TierSpec = { map: 1024, radius: 30, every: 2, karts: false };
/** Lower tiers with 3-4 viewports: refreshed one frame less often. */
const SPLIT: Record<1 | 2, TierSpec> = {
  2: { ...TIERS[2], every: TIERS[2].every + 1 },
  1: { ...TIERS[1], every: TIERS[1].every + 1 },
};

/** `?q=0..3` pins the shadow tier (no automatic changes). */
function pinnedTier(): QualityTier | null {
  const q = new URLSearchParams(window.location.search).get('q');
  return q !== null && /^[0-3]$/.test(q) ? (Number(q) as QualityTier) : null;
}

/** How much of the image-based ambient the hemisphere light replaces on matte materials. */
const AMBIENT_FROM_ENV = 0.95;

/** DirectionalLightShadow is not exported by three; take its type from the light. */
type DirShadow = THREE.DirectionalLight['shadow'];

const _fwd = new THREE.Vector3();
const _focus = new THREE.Vector3();
const _ls = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _origin = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export class LightRig {
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  tier: QualityTier;
  /** True when the tier is pinned by `?q=` (no automatic changes). */
  readonly pinned: boolean;
  private look: SkyLook = SKIES.kota;
  private readonly shadows: DirShadow[] = [];
  private frameNo = 0;
  private readonly startTier: QualityTier;
  private lastCount = 0;
  private kartScan = 0;
  /** Sees nothing (empty frustum): rendering with it runs just the shadow pass. */
  private readonly voidCam = new THREE.PerspectiveCamera(1, 1, 0.01, 0.02);
  private readonly dummy = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    sun?: THREE.DirectionalLight,
    hemi?: THREE.HemisphereLight,
    level: GfxTier = 'high',
  ) {
    this.sun = sun ?? new THREE.DirectionalLight();
    this.hemi = hemi ?? new THREE.HemisphereLight();
    if (!this.sun.parent) scene.add(this.sun);
    if (!this.sun.target.parent) scene.add(this.sun.target);
    if (!this.hemi.parent) scene.add(this.hemi);
    // Far below the world: its own view is empty, but the shadow pass still sees layer 0.
    this.voidCam.position.set(0, -1e5, 0);
    const pin = pinnedTier();
    this.pinned = pin !== null;
    this.tier = pin ?? LEVELS[level].shadow;
    this.startTier = this.tier;
    this.applyTier();
  }

  /** Mood for the current map: lights, image-based lighting and exposure. */
  setSky(mood: MoodLike | SkyLook, mapId?: string): void {
    const look = skyFromMood(mood, mapId);
    this.look = look;
    this.sun.color.setHex(look.sunColor);
    this.sun.intensity = look.sunIntensity;
    this.hemi.color.setHex(look.hemiSky);
    this.hemi.groundColor.setHex(look.hemiGround);
    // The hemisphere fill also stands in for the sky's ambient light on non-reflective materials.
    this.hemi.intensity = look.hemiIntensity + look.envIntensity * AMBIENT_FROM_ENV;
    this.renderer.toneMappingExposure = look.exposure;
    // The low level has no reflective materials: skip rendering the reflection map.
    currentEnv = LIGHT ? null : makeEnvironment(this.renderer, look);
    // Reflective materials already get the hemisphere fill: their sky light is mostly reflection.
    currentEnvIntensity = look.envIntensity * 0.75;
    for (const m of reflectiveSet) applyEnv(m);
    this.scene.environment = null;
  }

  get sky(): SkyLook {
    return this.look;
  }

  setTier(t: QualityTier): void {
    if (t === this.tier) return;
    this.tier = t;
    this.applyTier();
  }

  /** One shadow tier down (the quality ladder's first rungs); false when off or pinned. */
  stepDown(): boolean {
    if (this.pinned || this.tier === 0) return false;
    this.setTier((this.tier - 1) as QualityTier);
    return true;
  }

  /** One tier back up: never from off (shaders would recompile) nor above the starting tier. */
  stepUp(): boolean {
    if (this.pinned || this.tier === 0 || this.tier >= this.startTier) return false;
    this.setTier((this.tier + 1) as QualityTier);
    return true;
  }

  private applyTier(): void {
    const on = this.tier > 0;
    if (this.sun.castShadow !== on) this.sun.castShadow = on;
    this.renderer.shadowMap.enabled = on;
    const spec = this.tier > 0 ? TIERS[this.tier as 1 | 2 | 3] : null;
    for (const s of this.shadows) this.configure(s, spec);
    this.kartScan = 0;
  }

  private configure(s: DirShadow, spec: TierSpec | null): void {
    if (!spec) return;
    if (s.mapSize.x !== spec.map) {
      s.mapSize.set(spec.map, spec.map);
      s.map?.dispose();
      s.map = null;
    }
    const cam = s.camera;
    cam.left = -spec.radius;
    cam.right = spec.radius;
    cam.top = spec.radius;
    cam.bottom = -spec.radius;
    cam.near = 1;
    cam.far = 260;
    cam.updateProjectionMatrix();
    s.bias = -0.00025;
    s.normalBias = 0.035;
    s.radius = spec.map >= 2048 ? 3 : 2;
    s.intensity = 0.9;
    s.needsUpdate = true;
  }

  private shadowFor(vi: number): DirShadow {
    while (this.shadows.length <= vi) {
      const s = this.shadows.length === 0 ? this.sun.shadow : new THREE.DirectionalLight().shadow;
      this.configure(s, this.tier > 0 ? TIERS[this.tier as 1 | 2 | 3] : TIERS[3]);
      this.shadows.push(s);
    }
    return this.shadows[vi]!;
  }

  /**
   * Phase 1, for every viewport before any viewport is drawn: refresh viewport `vi`'s shadow map
   * if it is due (each viewport keeps its own map, refreshed every frame or every few frames by
   * tier). Rendering all shadow maps first keeps the multisampled canvas bound once per frame,
   * which matters a lot on tile-based GPUs (Apple, mobile, most Smart TVs).
   */
  shadowView(vi: number, count: number, cam: THREE.Camera): void {
    if (vi === 0) {
      this.frameNo++;
      if (count !== this.lastCount) {
        this.lastCount = count;
        this.kartScan = 0;
      }
      // Without shadow maps nothing casts: no need to walk the scene.
      if (this.tier > 0 && this.kartScan-- <= 0) this.scanKarts();
    }
    if (this.tier === 0) return;
    const spec = this.spec(count);
    const s = this.shadowFor(vi);
    this.sun.shadow = s;
    if (s.mapSize.x !== spec.map) this.configure(s, spec);
    const due = s.map === null || (this.frameNo + vi) % spec.every === 0;
    if (!due) return;
    // Focus ahead of the camera along its ground direction.
    cam.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, 1);
    _fwd.normalize();
    const camPos = cam.getWorldPosition(_focus);
    const ahead = spec.radius * 0.72;
    _focus.set(camPos.x + _fwd.x * ahead, Math.max(0, camPos.y - 6), camPos.z + _fwd.z * ahead);
    // Snap to shadow texels in light space so static shadows do not shimmer as the camera moves.
    const L = this.look.sunDir;
    _ls.lookAt(L, _origin, _up);
    _inv.copy(_ls).invert();
    _focus.applyMatrix4(_inv);
    const texel = (spec.radius * 2) / spec.map;
    _focus.x = Math.round(_focus.x / texel) * texel;
    _focus.y = Math.round(_focus.y / texel) * texel;
    _focus.applyMatrix4(_ls);
    this.sun.target.position.copy(_focus);
    this.sun.position.copy(_focus).addScaledVector(L, 130);
    this.sun.target.updateMatrixWorld();
    this.sun.updateMatrixWorld();
    // Draw only the shadow map: an empty view into a 1x1 target triggers the shadow pass.
    const r = this.renderer;
    r.shadowMap.needsUpdate = true;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.dummy);
    r.render(this.scene, this.voidCam);
    r.setRenderTarget(prev);
    r.shadowMap.needsUpdate = false;
  }

  /** Phase 2, right before drawing viewport `vi`: sample its shadow map. */
  useView(vi: number): void {
    if (this.tier > 0) this.sun.shadow = this.shadowFor(vi);
    this.renderer.shadowMap.needsUpdate = false;
  }

  /** Both phases at once (single-viewport callers). */
  prepareView(vi: number, count: number, cam: THREE.Camera): void {
    this.shadowView(vi, count, cam);
    this.useView(vi);
  }

  /** Effective shadow settings for this tier and number of viewports. */
  private spec(count: number): TierSpec {
    const t = TIERS[this.tier as 1 | 2 | 3];
    if (count <= 2) return t;
    // Split screen with 3-4 views: a smaller map refreshed less often; karts keep their contact
    // shadows (they would lag behind on a map that is not redrawn every frame).
    return this.tier >= 3 ? MULTI : SPLIT[this.tier as 1 | 2];
  }

  /** Karts carry `userData.kartPart`; they cast real shadows only on the top tier. */
  private scanKarts(): void {
    this.kartScan = 45;
    const want = this.tier > 0 && this.spec(Math.max(1, this.lastCount)).karts;
    this.scene.traverse((o) => {
      if (o.userData.kartPart && o instanceof THREE.Mesh) {
        const cast = want && o.userData.kartPart === 'cast';
        if (o.castShadow !== cast) o.castShadow = cast;
      }
    });
  }
}
