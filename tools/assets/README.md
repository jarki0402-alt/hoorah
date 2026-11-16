# Asset workshop

Smooth, stylised 3D models authored in code and exported as real `.glb` files. No modelling app,
no downloaded assets: every shape is original and rebuilds exactly the same from the scripts.

## Regenerate

```sh
npx tsx tools/assets/lari/build.ts            # all Lari Terus packs (about 1 minute)
npx tsx tools/assets/lari/build.ts runners    # only some packs: runners | props | city
npx vitest run --config tools/assets/vitest.config.ts
npx tsc --noEmit -p tools/assets
```

Output goes to `apps/web/public/models/lari/*.glb`, plus the generated manifest
`apps/web/src/games/lari/asset-manifest.ts` (URLs carry a content hash, so browsers fetch a new
pack after a rebuild). Commit both. `apps/web/src/games/lari/assets.test.ts` checks that the packs
match the manifest, contain every model the game uses and stay under 6 MB.

## Pipeline (`src/`)

| File | What it does |
| --- | --- |
| `sdf.ts` | Signed distance primitives (sphere, ellipsoid, capsule, rounded box, torus, plane) and smooth blends |
| `polygonize.ts` | Surface nets on a grid, then vertices relaxed along the surface and snapped back onto it |
| `simplify.ts` | Quadric edge-collapse decimation with flip and manifold checks, per-vertex importance |
| `organic.ts` | SDF to finished mesh: extract, relax, decimate (keeps colour edges), smooth normals from the field gradient, per-vertex paint |
| `shapes.ts` | Hard-surface parts with analytic normals: rounded boxes, lathes with crisp or smooth corners, swept tubes with caps, rings, extrusions |
| `normals.ts` | Area-weighted crease normals and welding |
| `decal.ts` | Raised details hugging an organic surface: eyes, pupils, mouths, cheeks, brow strokes |
| `foliage.ts` | Folded leaf blades and lumpy foliage clumps |
| `ao.ts` | BVH ray caster and per-vertex ambient occlusion baked into the surface attribute |
| `rig.ts` | Skeletons, skin weights from labelled distance fields, keyframe clips sampled from pose functions |
| `lod.ts` | Lighter levels of detail for finished meshes |
| `gltf.ts` | Binary glTF writer: 16-bit positions and 8/16-bit normals (`KHR_mesh_quantization`), 8-bit colours, skins, animations |

Every vertex carries `_SURF` = roughness, metalness, emission, baked occlusion. The game reads it
as `aSurf` (see `apps/web/src/games/lari/materials.ts`); occlusion darkens ambient light only.

## Lari Terus packs (`lari/`)

- `runners.ts`: eight fruit mascots (one per avatar fruit) on a shared 16-bone skeleton, two
  levels of detail each; the player-colour kit (sneakers, wristbands, headband) is a separate
  `runnerTint` primitive. Clips: idle, ready, run, jump, slide, trip, hit, fall, climb, victory.
- `props.ts` + `kit.ts`: lane obstacles, the coin and rooftop clutter, each with `@1` (and `@2`
  for clutter) lighter versions.
- `city.ts`: parapets, top-floor façade bays, the gap edge, neighbour rims, festoon spans,
  billboard and sculpted clouds.

Model space everywhere: metres, y up, ground at y = 0, the front facing +z.

Review the runners in the game itself: `/games/lari/?showroom=run` (also `idle`, `air`, `slide`,
`stumble`, `fall`, `climb`, `ready`, `cheer`) lines up all eight fruits facing the camera.

To reuse the pipeline for another game, add a `tools/assets/<game>/build.ts` next to `lari/`
that writes its own packs and manifest.
