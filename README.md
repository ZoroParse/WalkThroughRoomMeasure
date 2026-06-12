# Walk‑Through Room Measure

Turn a 2D room blueprint into an interactive **3D walkthrough** that guides you
section‑by‑section and collects a real‑world measurement (in cm) for every part
of the room — each **wall**, **window**, **door** and piece of **furniture**.

A "section" is any segment of a component bounded by where it meets another
component. The section you're measuring is highlighted by a translucent,
colour‑coded arrow in the 3D scene. When every section has a value, a green
**Done!** button rebuilds the room at true scale and exports the blueprint with
your measurements drawn on it — straight to your phone's share sheet.

Fully client‑side: no backend, no accounts, no API keys. Built with **Vite +
TypeScript + Three.js**.

## How it works

1. **Upload** a blueprint image (or try the bundled sample bedroom).
2. **Trace** the room: tap to drop points and connect them into typed segments
   (wall / window / door / furniture). Re‑tapping a point shares a corner, so
   the place where two components meet becomes a junction automatically. Each
   segment becomes one measurable section.
3. **Walk & measure**: a first‑person camera flies to each section in turn; a
   see‑through arrow shows the exact span; you type the length in centimetres.
4. **True‑scale model**: your measurements calibrate a single px→cm scale and
   the 3D room is rebuilt at real size (proportions preserved).
5. **Done!**: the cm values are composited onto a copy of the blueprint and
   handed to the native share sheet (Messages, contacts, Photos, WhatsApp…),
   with a file‑download fallback on desktop.

Everything is saved to `localStorage` as you go, so a refresh restores your
image, trace and measurements.

## Run it

```bash
npm install
npm run dev        # local dev server (http://localhost:5173)
```

Other scripts:

```bash
npm run typecheck  # tsc --noEmit
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build locally
```

> The dev server is exposed on your LAN (`--host`), so you can open it on a
> phone at `http://<your-computer-ip>:5173` to try the touch tracing and the
> share sheet.

## Deploy (GitHub Pages)

The build uses the base path `/WalkThroughRoomMeasure/` so it works on Pages.
Pushing to `main` runs `.github/workflows/deploy.yml`, which builds and
publishes `dist/` to GitHub Pages. In the repo settings, set **Pages → Build
and deployment → Source** to **GitHub Actions** once.

## Notes & limitations

- **Web Share with files** requires a secure context (HTTPS) and a real mobile
  browser. On desktop browsers that don't support it, the app downloads the
  annotated PNG + a JSON of the measurements instead.
- **Sending to a phone number / contact** uses the device's native share sheet
  (you pick the recipient). Programmatic SMS to a number would need a paid
  gateway and a backend, which this app intentionally avoids.
- **Rescale** applies one global scale (length‑weighted mean of cm/px). This
  keeps the traced shape faithful and corrects absolute size; it does not warp
  individual edges to reconcile small inconsistencies between measurements.
- The 3D openings (doors/windows) are built by rendering each traced segment
  differently rather than boolean‑cutting walls, so trace a wall and its door as
  separate segments that meet at shared points.

## Project layout

```
src/
  state/        data model, reactive store, localStorage persistence
  upload/       load + downscale the blueprint image
  trace/        2D canvas tracer (pan/zoom, nodes, typed edges, edit/delete)
  graph/        section derivation + 2D geometry helpers
  three/        scene, coords (px→world), wall/furniture builders, arrow overlay
  walkthrough/  section ordering, camera animation, measurement HUD
  rescale/      global px→cm calibration
  export/       annotate blueprint + Web Share / download
  phases/       phase metadata + DOM chrome builders
  main.ts       orchestrates the phases
```
