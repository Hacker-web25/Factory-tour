import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, textureCompress, meshopt, mergeDocuments, unpartition, flatten, join } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const big = { overhead_crane: 1024, drill_press_01: 1024, rollershutter_door: 1024 };
const names = fs.readdirSync('raw').filter(n => !['tex', 'hdri', 'overhead_crane', 'classic_laptop', 'mounted_fluorescent_lights', 'rollershutter_door'].includes(n));
let out = null;
for (const n of names) {
  const doc = await io.read(`raw/${n}/${n}.gltf`);
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  // wrap scene children in one named root so the page can find each model by name
  const root = doc.createNode(n);
  for (const c of scene.listChildren()) { scene.removeChild(c); root.addChild(c); }
  scene.addChild(root);
  const s = big[n] || 512;
  await doc.transform(dedup(), prune(), weld(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [s, s], quality: 82 }));
  if (!out) out = doc; else { mergeDocuments(out, doc); }
  console.log('ok', n);
}
// merge all scenes into the first scene
const scenes = out.getRoot().listScenes();
for (const sc of scenes.slice(1)) { for (const c of sc.listChildren()) { sc.removeChild(c); scenes[0].addChild(c); } sc.dispose(); }
await out.transform(unpartition(), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write('../../public/hiw-tour/props.glb', out);
console.log('props.glb', (fs.statSync('../../public/hiw-tour/props.glb').size / 1e6).toFixed(2), 'MB');
