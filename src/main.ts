import './styles.css';
import sampleBlueprint from './assets/sample-blueprint.jpg';

import { store } from './state/store.ts';
import { clearProject } from './state/persistence.ts';
import { type AppPhase } from './state/types.ts';
import { $, el, clear, toast } from './util/dom.ts';
import {
  loadBlueprintFromFile,
  loadBlueprintFromUrl,
} from './upload/imageUpload.ts';

import { TraceCanvas } from './trace/traceCanvas.ts';
import { TraceController, type Tool } from './trace/traceController.ts';
import { validateGraph } from './trace/graphOps.ts';

import { SceneManager } from './three/sceneManager.ts';
import { WalkthroughEngine } from './walkthrough/walkthroughEngine.ts';
import { MeasureInputUI } from './walkthrough/measureInputUI.ts';
import { allMeasured } from './graph/sections.ts';

import { computeCalibration } from './rescale/calibrate.ts';
import { buildAnnotatedBlueprint, buildMeasurementsJson } from './export/annotate.ts';
import { shareOrDownload } from './export/share.ts';

import { uid } from './util/id.ts';
import { ensureApiKey, changeApiKey, clearApiKey } from './detect/apiKey.ts';
import {
  detectViaProxy,
  detectDirect,
  ProxyUnavailable,
  AuthError,
  type DetectedLayout,
} from './detect/visionDetect.ts';

import {
  PHASE_TITLE,
  surfaceFor,
} from './phases/phaseMachine.ts';
import {
  setTitle,
  buildToolSegmented,
  buildUploadPanel,
  buildRescalePanel,
} from './phases/ui-shell.ts';

class App {
  private stage = $('#stage');
  private toolbar = $('#toolbar');
  private hud = $('#hud');
  private topActions = $('#topbar-actions');

  private traceCanvas = new TraceCanvas(
    document.getElementById('trace-canvas') as HTMLCanvasElement,
  );
  private controller: TraceController;
  private scene = new SceneManager(
    document.getElementById('scene-canvas') as HTMLCanvasElement,
  );
  private engine = new WalkthroughEngine(this.scene);
  private measureUI: MeasureInputUI;

  private fileInput: HTMLInputElement;
  private renderedPhase: AppPhase | null = null;

  constructor() {
    this.controller = new TraceController(this.traceCanvas, () =>
      this.traceCanvas.render(),
    );
    this.measureUI = new MeasureInputUI(this.hud, {
      onPrev: () => this.engine.prev(),
      onNext: () => this.onMeasureNext(),
      onValue: (edgeId, cm) => {
        store.setMeasurement(edgeId, cm);
        this.refreshDoneButton();
      },
    });

    this.fileInput = el('input', {
      type: 'file',
      accept: 'image/*',
    }) as HTMLInputElement;
    this.fileInput.style.display = 'none';
    this.fileInput.addEventListener('change', async () => {
      const file = this.fileInput.files?.[0];
      if (file) await loadBlueprintFromFile(file);
      this.fileInput.value = '';
    });
    document.body.append(this.fileInput);

    // persistent top-bar actions
    const keyBtn = el('button', { class: 'ghost' }, ['API key']);
    keyBtn.addEventListener('click', () => {
      void changeApiKey().then((k) => {
        if (k) toast('API key saved on this device.');
      });
    });
    const reset = el('button', { class: 'ghost' }, ['Start over']);
    reset.addEventListener('click', () => this.startOver());
    this.topActions.append(keyBtn, reset);

    window.addEventListener('resize', () => this.onResize());
    store.subscribe(() => this.onStoreChange());

    this.render();
    this.onResize();
  }

  // --- phase orchestration ---------------------------------------------

  private onStoreChange(): void {
    if (store.state.phase !== this.renderedPhase) this.render();
  }

  private render(): void {
    const phase = store.state.phase;
    this.renderedPhase = phase;
    const meta = PHASE_TITLE[phase];
    setTitle(meta.title, meta.sub);
    this.stage.dataset.surface = surfaceFor(phase);
    clear(this.toolbar);
    clear(this.hud);

    switch (phase) {
      case 'upload':
        void this.renderUpload();
        break;
      case 'trace':
        void this.renderTracePhase();
        break;
      case 'walkthrough':
        this.renderWalkthrough();
        break;
      case 'rescale':
      case 'done':
        this.renderRescale();
        break;
    }
  }

  private async renderUpload(): Promise<void> {
    // Refresh the trace canvas from state so a "Start over" clears the previous
    // blueprint from behind the panel (setImageFromState nulls it when there's
    // no image).
    await this.traceCanvas.setImageFromState();
    this.traceCanvas.render();
    this.hud.append(
      buildUploadPanel(
        () => this.fileInput.click(),
        () => void loadBlueprintFromUrl(sampleUrl()),
      ),
    );
  }

  private async renderTracePhase(): Promise<void> {
    await this.traceCanvas.setImageFromState();
    this.traceCanvas.resize();
    this.traceCanvas.fit();
    this.traceCanvas.render();

    // toolbar: tools + chain actions + start
    const seg = buildToolSegmented(this.controller.tool, (t) =>
      this.setTool(t),
    );
    const endLine = el('button', { class: 'ghost' }, ['End line']);
    endLine.addEventListener('click', () => {
      this.controller.endChain();
      this.traceCanvas.render();
    });
    const closeLoop = el('button', { class: 'ghost' }, ['Close loop']);
    closeLoop.addEventListener('click', () => {
      this.controller.closeLoop();
      this.traceCanvas.render();
    });
    const detect = el('button', { class: 'accent' }, [
      '✨ Auto-detect',
    ]) as HTMLButtonElement;
    detect.addEventListener('click', () => void this.autoDetect(detect));
    const start = el('button', { class: 'primary' }, ['Walk & measure ›']);
    start.addEventListener('click', () => this.startWalkthrough());

    this.toolbar.append(seg, detect, endLine, closeLoop, start);

    this.hud.append(
      el(
        'div',
        {
          class: 'card hint',
          // top-aligned and non-interactive so it never blocks tracing
          style: 'margin-bottom:auto; pointer-events:none',
        },
        [
          'Tap to drop points along each wall, window, door or furniture edge. Tap a point again on the next segment to share a corner. Switch the tool for each component.',
        ],
      ),
    );
  }

  private renderWalkthrough(): void {
    this.engine.onChange = (s, i, total) => {
      this.measureUI.render(s, i, total);
      this.measureUI.focusInput();
    };
    this.engine.setup(store.state);

    const back = el('button', { class: 'ghost' }, ['‹ Edit trace']);
    back.addEventListener('click', () => store.setPhase('trace'));
    this.doneButton = el('button', { class: 'go' }, ['Done!']);
    this.doneButton.addEventListener('click', () => this.finishMeasuring());
    this.toolbar.append(back, this.doneButton);
    this.refreshDoneButton();
  }

  private renderRescale(): void {
    this.engine.onChange = null;
    const cal = computeCalibration(store.state);
    if (cal) {
      store.setCalibration(cal.cmPerPixel);
      this.engine.setup(store.state);
      this.engine.overview();
    }
    const dims = cal ?? { widthM: 0, depthM: 0 };
    this.hud.append(
      buildRescalePanel(
        dims.widthM,
        dims.depthM,
        () => void this.share(),
        () => store.setPhase('walkthrough'),
      ),
    );
  }

  // --- actions ----------------------------------------------------------

  private doneButton: HTMLButtonElement | null = null;

  private setTool(t: Tool): void {
    this.controller.setTool(t);
    // refresh pressed state without rebuilding the whole phase
    const seg = this.toolbar.querySelector('.segmented');
    if (seg) {
      seg.replaceWith(buildToolSegmented(t, (nt) => this.setTool(nt)));
    }
    this.traceCanvas.render();
  }

  private startWalkthrough(): void {
    const v = validateGraph(store.state);
    if (!v.ok) {
      toast(v.warnings[0] ?? 'Add at least one section first.');
      return;
    }
    if (v.warnings.length) toast(v.warnings[0]);
    store.setPhase('walkthrough');
  }

  private async autoDetect(btn: HTMLButtonElement): Promise<void> {
    const { imageDataUrl } = store.state;
    if (!imageDataUrl) return;

    const label = btn.textContent;
    btn.toggleAttribute('disabled', true);
    btn.textContent = '✨ Detecting…';
    try {
      const layout = await this.runDetection(imageDataUrl);
      if (layout) {
        this.applyDetected(layout);
        this.traceCanvas.fit();
        this.traceCanvas.render();
        toast('Detected the room — review and adjust, then Walk & measure.');
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Auto-detect failed.');
    } finally {
      btn.toggleAttribute('disabled', false);
      btn.textContent = label;
    }
  }

  /**
   * Detect via the server-side proxy when one exists (hosted build — no key
   * in the browser); otherwise fall back to a user-supplied key (the
   * standalone file). Returns null if the user cancels the key prompt.
   */
  private async runDetection(
    imageDataUrl: string,
  ): Promise<DetectedLayout | null> {
    try {
      return await detectViaProxy(imageDataUrl);
    } catch (err) {
      if (!(err instanceof ProxyUnavailable)) throw err;
    }
    // No proxy here: use a key on this device, re-prompting if it's rejected.
    for (let attempt = 0; attempt < 3; attempt++) {
      const key = await ensureApiKey();
      if (!key) return null;
      try {
        return await detectDirect(imageDataUrl, key);
      } catch (e) {
        if (e instanceof AuthError) {
          clearApiKey();
          toast('Key rejected — enter a different key.');
          continue;
        }
        throw e;
      }
    }
    return null;
  }

  /** Replace the traced graph with the detected one (normalised → image px). */
  private applyDetected(layout: DetectedLayout): void {
    // Lift the pen first: any active chain still references old node ids, so the
    // next tap would otherwise add an edge with a dangling endpoint. endChain
    // also clears the rubber-band / active-node visual state.
    this.controller.endChain();
    const { imageW, imageH } = store.state;
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    const idMap = new Map<string, string>();
    const nodes = layout.nodes.map((n) => {
      const realId = uid('n');
      idMap.set(n.id, realId);
      return { id: realId, x: clamp01(n.x) * imageW, y: clamp01(n.y) * imageH };
    });
    const edges = layout.edges
      .filter((e) => idMap.has(e.a) && idMap.has(e.b) && e.a !== e.b)
      .map((e) => ({
        id: uid('e'),
        a: idMap.get(e.a)!,
        b: idMap.get(e.b)!,
        type: e.type,
        loopId: e.loopId ?? undefined,
        kind: e.kind ?? undefined,
      }));
    store.update((p) => {
      p.nodes = nodes;
      p.edges = edges;
      p.measurements = {};
      p.cmPerPixel = null;
    });
  }

  private onMeasureNext(): void {
    if (this.engine.index < this.engine.sections.length - 1) {
      this.engine.next();
    } else if (allMeasured(store.state)) {
      this.finishMeasuring();
    } else {
      toast('Some sections still need a measurement.');
    }
  }

  private refreshDoneButton(): void {
    if (!this.doneButton) return;
    this.doneButton.toggleAttribute('disabled', !allMeasured(store.state));
  }

  private finishMeasuring(): void {
    if (!allMeasured(store.state)) {
      toast('Measure every section before finishing.');
      return;
    }
    store.setPhase('rescale');
  }

  private async share(): Promise<void> {
    try {
      const png = await buildAnnotatedBlueprint(store.state);
      const json = buildMeasurementsJson(store.state);
      const res = await shareOrDownload(png, json);
      if (res.shared) {
        toast('Shared!');
        store.setPhase('done');
      }
    } catch (err) {
      console.error(err);
      toast('Could not prepare the export.');
    }
  }

  private startOver(): void {
    if (!confirm('Start over and clear this room?')) return;
    clearProject();
    store.reset();
  }

  private onResize(): void {
    const rect = this.stage.getBoundingClientRect();
    this.traceCanvas.resize();
    if (store.state.phase === 'trace') {
      this.traceCanvas.render();
    } else if (store.state.phase === 'upload') {
      this.traceCanvas.render();
    }
    this.scene.resize(rect.width, rect.height);
  }
}

function sampleUrl(): string {
  // bundled asset: a hashed URL in the Pages build, an inlined data URL in the
  // single-file build — so the sample works in both without a separate request.
  return sampleBlueprint;
}

new App();
