# How it works: 3D factory tour

The `/how-it-works` page opens with a scroll-driven walk through a factory.
Each stop is one of the five steps, with the same copy as the page.

* `src/tour.js`: DOM, scroll timeline, camera path and step cards.
* `src/scene.js`: the hall. It builds the architecture, CNC machines, conveyor, racking and crane in code, and places the props from `props.glb` **by name**.
* `src/tour.css`: styles. Esbuild inlines them into the bundle.
* Output goes to `public/hiw-tour/` (`tour.js`, `props.glb`, `env.hdr`, `tex/`).

The site bundle renders `<div id="hiw-tour">` and, after it, `<div id="hiw-classic">` (the old hero + five step cards).
A small loader in `lib/site/home.ts` mounts the tour when WebGL is available and the visitor hasn't asked for reduced motion.
Otherwise, or if the tour fails to load, the classic section shows instead.

## Rebuild

```bash
cd scripts/hiw-tour
npm install           # separate from the app's dependencies
npm run fetch         # downloads raw Poly Haven assets into raw/ (gitignored)
npm run props         # packs + compresses them into public/hiw-tour/props.glb
npm run build         # bundles src/ into public/hiw-tour/tour.js
```

## Swapping in better models (e.g. from CGTrader)

1. Export the model as `.glb`/`.gltf` in metres, with Y up. Check that the licence allows commercial web use ("Royalty Free" on CGTrader).
2. Put it in `raw/<name>/<name>.gltf` and run `npm run props`. It is packed into `props.glb` under `<name>`.
3. In `src/scene.js`, place it with `put('<name>', x, y, z, rotationY, scale)` inside `placeProps()`. To replace a code-built piece (CNC machines, conveyor, racking, crane), swap that block for a `put(...)`.
4. Keep `props.glb` under about 8 MB. Use 512px textures for small props, 1024px for hero pieces.

## Asset licences

All props, textures and the HDRI (`empty_warehouse_01`) are from [Poly Haven](https://polyhaven.com) and are **CC0**: free for commercial use, no attribution required.
