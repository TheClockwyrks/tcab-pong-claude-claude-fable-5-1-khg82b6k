// A Carom engine stood up over its own canvas, clock, and event target, so a
// test advances the game a counted number of frames with no browser.

import {
  ConstantClock,
  createEngine,
  type Engine,
} from "@clockwyrks/simple-2d";
import { createCanvas, type Canvas } from "@napi-rs/canvas";
import { FIELD_H, FIELD_W, LAYOUT } from "../constants";
import { BACKGROUND, game, type CaromDebugApi, type CaromState } from "../game";

export type CaromEngine = Engine<CaromState, CaromDebugApi>;

export interface Harness {
  readonly engine: CaromEngine;
  readonly debug: CaromDebugApi;
  readonly canvas: Canvas;
  /** Press a physical key, by `KeyboardEvent.code`. */
  keyDown(code: string): void;
  /** Release a physical key. */
  keyUp(code: string): void;
  /** Press and release a key, so the next frame sees one edge. */
  tap(code: string): void;
  /** Deliver a pointer event at a logical position. */
  pointer(
    type: "pointerdown" | "pointermove" | "pointerup",
    x: number,
    y: number,
    options?: { id?: number; pointerType?: "mouse" | "touch" | "pen" },
  ): void;
  /** Advance `frames` frames. */
  advance(frames: number): Promise<void>;
  /** Advance `seconds` of game time at the harness's step. */
  run(seconds: number): Promise<void>;
  /** The cues played since the harness was built, in order. */
  readonly cues: string[];
}

export interface HarnessOptions {
  /** Milliseconds per frame; `1000 / 60` by default. */
  readonly stepMs?: number;
  /**
   * Whether frames draw. On by default; a long simulation-only scenario turns
   * it off, because the headless canvas rasterizes on the CPU.
   */
  readonly render?: boolean;
}

/** Builds an initialized engine over its own canvas and clock. */
export async function createHarness(
  options: HarnessOptions = {},
): Promise<Harness> {
  const stepMs = options.stepMs ?? 1000 / 60;
  const render = options.render ?? true;
  const canvas: Canvas = createCanvas(FIELD_W, FIELD_H);
  const target = new EventTarget();
  const cues: string[] = [];
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: FIELD_W,
    height: FIELD_H,
    game: render ? game : { ...game, render: () => {} },
    background: BACKGROUND,
    layout: LAYOUT,
    clock: new ConstantClock(stepMs),
    surface: {
      cssWidth: () => FIELD_W,
      cssHeight: () => FIELD_H,
      dpr: () => 1,
      events: () => target,
    },
  });
  engine.events.on("cue:played", (event) => {
    cues.push(event.cue);
  });
  await engine.initialize();

  const key = (type: "keydown" | "keyup", code: string): void => {
    target.dispatchEvent(
      Object.assign(new Event(type), { code, repeat: false }),
    );
  };

  return {
    engine,
    debug: engine.debug,
    canvas,
    cues,
    keyDown: (code) => key("keydown", code),
    keyUp: (code) => key("keyup", code),
    tap: (code) => {
      key("keydown", code);
      key("keyup", code);
    },
    pointer: (type, x, y, options = {}) => {
      const down = type !== "pointerup";
      target.dispatchEvent(
        Object.assign(new Event(type), {
          clientX: x,
          clientY: y,
          pointerId: options.id ?? 1,
          pointerType: options.pointerType ?? "mouse",
          isPrimary: true,
          button: type === "pointermove" ? -1 : 0,
          buttons: down ? 1 : 0,
        }),
      );
    },
    advance: (frames) => engine.advance(frames),
    run: (seconds) => engine.advance(Math.round((seconds * 1000) / stepMs)),
  };
}
