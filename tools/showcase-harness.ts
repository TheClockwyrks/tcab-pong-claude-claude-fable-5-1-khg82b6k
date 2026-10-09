// The showcase capture harness: the real game on the real engine in a real
// browser, stepped from a script rather than from the frame callback.
//
// `tools/capture-showcase.mjs` serves this page through Vite's dev server,
// poses scenarios through the debug surface, advances exact frames on a
// constant clock, and screenshots or records the result. It is tooling, not the
// shipped game: `vite build` emits `index.html` alone.

import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import { FIELD_H, FIELD_W, LAYOUT } from "../src/constants";
import { BACKGROUND, game } from "../src/game";

const canvas = document.getElementById("stage") as HTMLCanvasElement;

const engine = createEngine({
  canvas,
  width: FIELD_W,
  height: FIELD_H,
  game,
  background: BACKGROUND,
  layout: LAYOUT,
  clock: new ConstantClock(1000 / 60),
});

declare global {
  interface Window {
    carom: { engine: typeof engine; ready: Promise<void> };
  }
}

window.carom = {
  engine,
  ready: engine.initialize().then(() => engine.advance(1)),
};
