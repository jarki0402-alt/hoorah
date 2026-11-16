/**
 * Lari Terus materials on top of the Bajaj Rush PBR kit (look.ts). Models from the asset packs
 * carry a per-vertex surface attribute `aSurf` (roughness, metalness, emission, baked ambient
 * occlusion) read by `LARI_MAT.surface()` and the runner materials; the occlusion darkens ambient
 * light only (and a little of the sun), which gives every prop its contact shading for free.
 * Roof surfaces and building façades take their texture coordinates from world position, so any
 * module (scaled, instanced, any length) gets correctly sized tiles and window bays.
 */
import * as THREE from 'three';
import { reflective, type TextureSurface } from '../bajaj/look';
import { windowTexture } from '../bajaj/textures';
import {
  clothTexture,
  duckSignTexture,
  ROOF_TILE_M,
  type RoofKind,
  roofTexture,
  signTexture,
} from './textures';

/** Standard (PBR) everywhere, or Lambert on weak GPUs (Smart TV tier). */
export type LitMaterial = THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;

let LOW = false;

/**
 * Weak GPUs: every material becomes a cheaper Lambert material without reflections or normal
 * maps. Call before the first material is made (the scene does, from its starting tier).
 */
export function setLowDetailMaterials(low: boolean): void {
  LOW = low;
}

function lit(
  params: THREE.MeshStandardMaterialParameters & THREE.MeshLambertMaterialParameters,
): LitMaterial {
  if (LOW) {
    const { roughness: _r, metalness: _m, ...rest } = params;
    return new THREE.MeshLambertMaterial(rest);
  }
  return new THREE.MeshStandardMaterial(params);
}

/** Sky reflections for PBR materials (none on weak GPUs). */
function shiny<T extends LitMaterial>(m: T, strength: number): T {
  if (!LOW && m instanceof THREE.MeshStandardMaterial) reflective(m, strength);
  return m;
}

/** Floor-to-floor height and bay width of the window tile on façades (m). */
export const BAY = 3.2;

type UvMode = 'top' | 'facade';

/**
 * Replace the map/normal/roughness UVs with world-space ones. `top`: x/z over the ground
 * (roofs). `facade`: the wall plane (z or x, with y up) and a plain wall corner on roofs.
 */
function worldUv<T extends LitMaterial>(m: T, mode: UvMode, scale: number): T {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    prev.call(m, shader, r);
    shader.uniforms.uWorldUvScale = { value: 1 / scale };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWorldUvScale;')
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        {
          mat4 lariM = modelMatrix;
          #ifdef USE_INSTANCING
            lariM = modelMatrix * instanceMatrix;
          #endif
          vec4 lariW = lariM * vec4(position, 1.0);
          vec3 lariN = normalize(mat3(lariM) * normal);
          vec2 lariUv;
          ${
            mode === 'top'
              ? 'lariUv = lariW.xz * uWorldUvScale;'
              : `if (abs(lariN.y) > 0.6) lariUv = vec2(0.06, 0.94);
                 else lariUv = (abs(lariN.x) > abs(lariN.z) ? lariW.zy : lariW.xy) * uWorldUvScale;`
          }
          #ifdef USE_MAP
            vMapUv = lariUv;
          #endif
          #ifdef USE_NORMALMAP
            vNormalMapUv = lariUv;
          #endif
          #ifdef USE_ROUGHNESSMAP
            vRoughnessMapUv = lariUv;
          #endif
        }`,
      );
  };
  const prevKey = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => `${prevKey()}|lari-world-uv-${mode}`;
  return m;
}

/** Street haze: walls fade towards the warm haze colour the deeper they go below the roofs. */
const HAZE = new THREE.Color(0xe9bf92);

function hazeBelow<T extends LitMaterial>(m: T): T {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    prev.call(m, shader, r);
    shader.uniforms.uLariHaze = { value: HAZE };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vLariY;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        {
          vec4 lariP = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            lariP = instanceMatrix * lariP;
          #endif
          vLariY = (modelMatrix * lariP).y;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLariY;\nuniform vec3 uLariHaze;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float lariT = clamp((-vLariY - 1.5) / 30.0, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, uLariHaze, lariT * lariT * 0.85) * (1.0 - lariT * 0.25);
        }`,
      );
  };
  const prevKey = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => `${prevKey()}|lari-haze`;
  return m;
}

function fromTexture(map: THREE.Texture, vertexColors: boolean): LitMaterial {
  const s = (map.userData.surface ?? {}) as TextureSurface;
  if (LOW) {
    const l = new THREE.MeshLambertMaterial({ map, vertexColors });
    if (s.emissive) {
      l.emissive.setScalar(s.emissive);
      l.emissiveMap = map;
    }
    return l;
  }
  const m = new THREE.MeshStandardMaterial({
    map,
    vertexColors,
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
  return m;
}

/** Teach a standard material the `aSurf` attribute; `rim` adds a soft warm edge light. */
function withLariSurface<T extends LitMaterial>(m: T, key: string, rim = 0): T {
  const rimColor = new THREE.Color(0xffd2a0).multiplyScalar(rim);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uLariRim = { value: rimColor };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aSurf;\nvarying vec4 vLariSurf;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLariSurf = aSurf;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vLariSurf;\nuniform vec3 uLariRim;')
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = max(vLariSurf.x, 0.04);',
      )
      .replace(
        '#include <metalnessmap_fragment>',
        '#include <metalnessmap_fragment>\nmetalnessFactor = vLariSurf.y;',
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * vLariSurf.z * 3.0;
        totalEmissiveRadiance += uLariRim * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0) * vLariSurf.w;`,
      )
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= vLariSurf.w;
        reflectedLight.indirectSpecular *= mix(1.0, vLariSurf.w, 0.8);
        reflectedLight.directDiffuse *= mix(1.0, vLariSurf.w, 0.3);`,
      );
  };
  m.customProgramCacheKey = () => `lari-surf|${key}`;
  // Geometry without the attribute: rough, not metal, no glow, open.
  (m as unknown as { defaultAttributeValues: Record<string, number[]> }).defaultAttributeValues = {
    aSurf: [0.8, 0, 0, 1],
  };
  return m;
}

const CLOUD_VERT = /* glsl */ `
attribute vec3 color;
varying vec3 vColor;
varying float vFacing;
void main() {
  vColor = color;
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vec3 n = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vFacing = abs(dot(n, normalize(cameraPosition - world.xyz)));
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const CLOUD_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vFacing;
void main() {
  gl_FragColor = vec4(vColor, smoothstep(0.05, 0.55, vFacing) * 0.92);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const cache = new Map<string, THREE.Material>();
function cached<T extends THREE.Material>(key: string, make: () => T): T {
  const hit = cache.get(key);
  if (hit) return hit as T;
  const m = make();
  m.name = key;
  cache.set(key, m);
  return m;
}

export const LARI_MAT = {
  /**
   * Vertex-coloured models from the packs (instance colours tint them). `reflect` > 0 gives
   * them the sky reflections (metal, glazing, glossy plastics); 0 skips the environment lookup.
   */
  surface(reflect = 0): LitMaterial {
    return cached(`surface-${reflect}`, () => {
      const m = withLariSurface(lit({ vertexColors: true }), `s${reflect}${LOW ? 'L' : ''}`);
      return reflect > 0 ? shiny(m, reflect) : m;
    });
  },
  /** Runner body (and, with `tint`, the player-coloured kit). Not cached: one per runner. */
  runner(tint: THREE.ColorRepresentation | null, reflect: boolean): LitMaterial {
    const m = withLariSurface(
      lit({ vertexColors: true, color: tint ?? 0xffffff }),
      `runner${reflect ? 'R' : ''}${LOW ? 'L' : ''}`,
      0.32,
    );
    return reflect ? shiny(m, 0.9) : m;
  },
  /** Roof deck: tiles, painted coating or screed, tinted by vertex colour. */
  roof(kind: RoofKind): LitMaterial {
    return cached(`roof-${kind}`, () => {
      const m = worldUv(fromTexture(roofTexture(kind), true), 'top', ROOF_TILE_M);
      // Glazed tiles catch the sky.
      return kind === 0 ? shiny(m, 0.7) : m;
    });
  },
  /** Window-bay façade tinted per building (vertex or instance colour). */
  facade(): LitMaterial {
    return cached('facade', () =>
      shiny(hazeBelow(worldUv(fromTexture(windowTexture(), true), 'facade', BAY)), 0.9),
    );
  },
  /** Laundry from the packs: the fabric atlas, with baked occlusion. */
  fabric(): LitMaterial {
    return cached('fabric', () => {
      const m = withLariSurface(fromTexture(clothTexture(), true), 'fabric');
      m.side = THREE.DoubleSide;
      return m;
    });
  },
  /** Coins: polished gold that catches the sky, with a warm inner glow so they read at speed. */
  gold(low: boolean): LitMaterial {
    return cached(`gold-${low}`, () => {
      const m = withLariSurface(
        lit({
          vertexColors: true,
          emissive: 0x6b4300,
          emissiveIntensity: low ? 1.1 : 0.55,
        }),
        `gold${LOW ? 'L' : ''}`,
      );
      return low ? m : shiny(m, 1.4);
    });
  },
  /**
   * Sculpted clouds: baked light-to-shade colour, unlit, outside the fog. Their silhouettes fade
   * out so they read as soft vapour rather than solid shapes.
   */
  cloud(): THREE.ShaderMaterial {
    return cached(
      'cloud',
      () =>
        new THREE.ShaderMaterial({
          vertexShader: CLOUD_VERT,
          fragmentShader: CLOUD_FRAG,
          transparent: true,
          depthWrite: false,
          fog: false,
        }),
    );
  },
  signs(): LitMaterial {
    return cached('signs', () => fromTexture(signTexture(), false));
  },
  duck(): LitMaterial {
    return cached('duck', () => {
      const m = fromTexture(duckSignTexture(), false);
      m.side = THREE.DoubleSide;
      return m;
    });
  },
};
