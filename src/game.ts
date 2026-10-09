// Carom — the game: the state it holds, the debug surface that poses and reads
// that state, and the three functions the Simple 2D engine drives.
//
// The simulation itself lives in the modules beside this one. `update` reads
// the engine's input into a plain record, hands it with the current state to the
// render-free core in `./update`, then plays the cues and applies the mute bit
// that core decided on. `render` draws whatever state the frame left behind.

import type {
  Game,
  InitApi,
  RenderApi,
  UpdateApi,
} from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import { ACTIONS, BINDINGS, CAROM_DEBUG_VERSION } from "./constants";
import { createDebugApi } from "./debug";
import { registerDiagnostics } from "./diagnostics";
import { defineCues } from "./cues";
import { readFrameInput } from "./input";
import { BACKGROUND_COLOR, renderFrame } from "./render";
import { advanceFrame } from "./update";
import { titleState } from "./world";

// ---- The state (specs/state.md) ------------------------------------------

export type Screen =
  "title" | "howto" | "countdown" | "playing" | "paused" | "matchover";

export type Mode = "solo" | "versus";

export type Side = "left" | "right";

export interface PaddleState {
  readonly cy: number;
  readonly vy: number;
  readonly driven: boolean;
  readonly drivenVy: number;
}

export interface AiState {
  readonly tracking: boolean;
  readonly movement: boolean;
}

export interface TrailSample {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

export interface BallState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly spin: number;
  readonly held: boolean;
  readonly holdTimer: number;
  readonly serveSign: 1 | -1;
  readonly trail: readonly TrailSample[];
}

export interface ObstacleState {
  readonly index: number;
  readonly cx: number;
  readonly cy: number;
}

/**
 * Where a pointer that is in contact with a menu came down: the item it landed
 * on, or `null` for a press outside every item. A pointer confirm needs its press
 * and its release inside one item, and the press may be frames old, so the menus
 * carry this between frames. It is input bookkeeping rather than game state:
 * nothing reads it but the menus, and every return to the title clears it.
 */
export interface PointerPress {
  readonly id: number;
  readonly item: number | null;
}

export interface CaromState {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;
  readonly titleIndex: number;
  readonly resumeScreen: "countdown" | "playing";

  readonly score: { readonly p1: number; readonly p2: number };
  readonly winner: Side | null;

  readonly paddles: { readonly left: PaddleState; readonly right: PaddleState };
  readonly ai: AiState;

  readonly receiver: Side;
  readonly ball: BallState | null;
  readonly obstacles: readonly ObstacleState[];

  readonly simTime: number;
  readonly muted: boolean;

  /** See {@link PointerPress}. Empty whenever no menu is being pressed. */
  readonly presses: readonly PointerPress[];
}

/** The read-only view every reader of the state is handed. */
export type CaromView = DeepReadonly<CaromState>;

// ---- The debug surface (specs/instrumentation.md) -------------------------

export interface MenuItemRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface BallSnapshot {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly speed: number;
  readonly spin: number;
  readonly held: boolean;
  readonly holdTimer: number;
  readonly serveSign: 1 | -1;
  readonly trail: readonly TrailSample[];
}

export interface PaddleSnapshot {
  readonly cy: number;
  readonly vy: number;
  readonly drivenVy: number;
  readonly driven: boolean;
}

export interface CaromSnapshot {
  readonly version: number;
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;
  readonly titleIndex: number;
  readonly resumeScreen: "countdown" | "playing";
  readonly score: { readonly p1: number; readonly p2: number };
  readonly winner: Side | null;
  readonly muted: boolean;
  readonly paddles: {
    readonly left: PaddleSnapshot;
    readonly right: PaddleSnapshot;
  };
  readonly ai: AiState;
  readonly receiver: Side;
  readonly ball: BallSnapshot | null;
  readonly obstacles: readonly ObstacleState[];
  readonly simTime: number;
}

export interface CaromDebugApi {
  readonly version: typeof CAROM_DEBUG_VERSION;

  // The world.
  clearWorld(state: CaromView): CaromState;
  spawnBall(state: CaromView): CaromState;
  spawnObstacle(state: CaromView, index: number): CaromState;
  reset(state: CaromView): CaromState;
  reconcile(state: CaromView): CaromState;

  // Screens and menus.
  setScreen(state: CaromView, screen: Screen): CaromState;
  setMode(state: CaromView, mode: Mode): CaromState;
  setMenuIndex(state: CaromView, index: number): CaromState;
  setTitleIndex(state: CaromView, index: number): CaromState;
  setResumeScreen(
    state: CaromView,
    screen: "countdown" | "playing",
  ): CaromState;

  // Match state.
  setScore(state: CaromView, p1: number, p2: number): CaromState;
  setWinner(state: CaromView, side: Side | null): CaromState;
  setReceiver(state: CaromView, side: Side): CaromState;

  // Paddles.
  setPaddleCy(state: CaromView, side: Side, cy: number): CaromState;
  setPaddleVy(state: CaromView, side: Side, vy: number): CaromState;
  setPaddleDriven(state: CaromView, side: Side, driven: boolean): CaromState;

  // The ball.
  setBallPosition(state: CaromView, x: number, y: number): CaromState;
  setBallVelocity(state: CaromView, vx: number, vy: number): CaromState;
  setBallSpin(state: CaromView, spin: number): CaromState;
  setBallHeld(state: CaromView, held: boolean): CaromState;
  setBallHoldTimer(state: CaromView, seconds: number): CaromState;
  setBallServeSign(state: CaromView, sign: 1 | -1): CaromState;
  drawBallServeSign(state: CaromView): CaromState;

  // The AI opponent.
  setAiTracking(state: CaromView, enabled: boolean): CaromState;
  setAiMovement(state: CaromView, enabled: boolean): CaromState;

  // Audio.
  setMuted(state: CaromView, muted: boolean): CaromState;

  // Readings.
  snapshot(state: CaromView): CaromSnapshot;
  menuItemRect(state: CaromView, index: number): MenuItemRect | null;
}

// ---- The game -------------------------------------------------------------

/**
 * The field background, a CSS color string. `src/main.ts` hands it to the engine
 * as the color the canvas is cleared to each frame, so the letterbox bars around
 * the field match the field itself.
 */
export const BACKGROUND = BACKGROUND_COLOR;

export const game: Game<CaromState, CaromDebugApi> = {
  initialize(api: InitApi<CaromState>): [CaromState, CaromDebugApi] {
    for (const action of ACTIONS) {
      api.input.register(action, { keys: [...BINDINGS[action]] });
    }
    defineCues(api.audio);
    registerDiagnostics(api.diagnostics);

    // The engine's mute bit starts clear, and the state mirrors it.
    return [titleState(false), createDebugApi()];
  },

  update(state: CaromView, api: UpdateApi, dt: number): CaromState {
    // A `setMuted` pose wrote the bit into the state alone, because a pose has no
    // audio bus. Bring the bus into line with the state before this frame's
    // `mute` edge toggles it, so the pose and the action compose.
    if (state.muted !== api.audio.muted()) api.audio.setMuted(state.muted);

    const input = readFrameInput(api);
    const { state: next, cues, muted } = advanceFrame(state, input, dt);

    if (muted !== api.audio.muted()) api.audio.setMuted(muted);
    for (const cue of cues) api.audio.play(cue);

    return { ...next, muted: api.audio.muted() };
  },

  render(state: CaromView, api: RenderApi): void {
    renderFrame(api.ctx, state);
  },
};
