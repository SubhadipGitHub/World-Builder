// Builds the fleet car models in Blender and packs them for the app (requirements §15, architecture §23).
// Run with `npm run models` (all classes) or `npm run models -- sedan suv` (some). Needs Blender 5.2:
// set BLENDER_PATH if it isn't at the default Windows path. Set MODELS_PREVIEW to a folder to also
// render a preview of each class there. The output is committed, so builds and CI never need Blender.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Box3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { FLEET_CLASSES, FLEET_CLASS_ORDER } from '../src/config/fleet.ts';

const BLENDER = process.env.BLENDER_PATH ?? 'C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe';
const PREVIEW = process.env.MODELS_PREVIEW;
const OUT = resolve('src/render/assets/models');
const MANIFEST = join(OUT, 'manifest.json');
const BUILD = resolve('tools/blender/build.py');
const GLTFPACK = resolve('node_modules/gltfpack/cli.js');

const requested = process.argv.slice(2);
for (const cls of requested) {
  if (!FLEET_CLASS_ORDER.includes(cls)) throw new Error(`Unknown class "${cls}" (expected one of ${FLEET_CLASS_ORDER.join(', ')})`);
}
const classes = requested.length > 0 ? requested : FLEET_CLASS_ORDER;

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  for (const line of out.split(/\r?\n/)) if (/MODEL (OK|ERROR)|Traceback|Error:/.test(line)) console.log(`  ${line.trim()}`);
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${cmd} exited with ${r.status}\n${out.slice(-2000)}`);
}

/** Triangles and bounds per LOD, measured from the packed file exactly as the app will decode it (M10-10). */
async function measure(file) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const bytes = readFileSync(file);
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  gltf.scene.updateMatrixWorld(true);
  const entry = {};
  for (const lod of ['LOD0', 'LOD1']) {
    const node = gltf.scene.getObjectByName(lod);
    if (!node) throw new Error(`${file}: no ${lod} node`);
    let triangles = 0;
    node.traverse((o) => {
      if (o.isMesh) triangles += (o.geometry.index ? o.geometry.index.count : o.geometry.getAttribute('position').count) / 3;
    });
    const box = new Box3().setFromObject(node, true);
    const round = (v) => Math.round(v * 1e4) / 1e4;
    entry[lod.toLowerCase()] = { triangles, min: box.min.toArray().map(round), max: box.max.toArray().map(round) };
  }
  return entry;
}

mkdirSync(OUT, { recursive: true });
if (PREVIEW) mkdirSync(PREVIEW, { recursive: true });
const work = mkdtempSync(join(tmpdir(), 'goldlane-models-'));
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
try {
  for (const cls of classes) {
    console.log(`${cls}:`);
    const { length, width } = FLEET_CLASSES[cls];
    const spec = join(work, `${cls}.json`);
    const raw = join(work, `${cls}.raw.glb`);
    const out = join(OUT, `${cls}.glb`);
    writeFileSync(spec, JSON.stringify({ length, width }));
    const args = ['--background', '--factory-startup', '--python', BUILD, '--', cls, spec, raw];
    if (PREVIEW) args.push(resolve(PREVIEW, `${cls}.png`));
    run(BLENDER, args);
    run(process.execPath, [GLTFPACK, '-i', raw, '-o', out, '-cc', '-kn', '-km']);
    manifest[cls] = await measure(out);
    const size = readFileSync(out).length;
    console.log(`  packed ${(size / 1024).toFixed(1)} KB, LOD0 ${manifest[cls].lod0.triangles} / LOD1 ${manifest[cls].lod1.triangles} triangles`);
  }
  const ordered = Object.fromEntries(FLEET_CLASS_ORDER.filter((c) => c in manifest).map((c) => [c, manifest[c]]));
  writeFileSync(MANIFEST, `${JSON.stringify(ordered, null, 2)}\n`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
