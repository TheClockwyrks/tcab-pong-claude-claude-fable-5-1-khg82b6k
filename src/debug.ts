// The debug and automation surface (specs/instrumentation.md): poses written
// as transitions over the state, and readings that report what they read.

import { CAROM_DEBUG_VERSION, OBSTACLE_CENTERS } from "./constants";
import type {
  BallState,
  CaromDebugApi,
  CaromSnapshot,
  CaromState,
  CaromView,
  Mode,
  Screen,
  Side,
} from "./game";
import { menuItemRect } from "./menu";
import { drawServeSign } from "./random";
import { obstacleAt, parkedBall, titleState } from "./world";

const SCREENS: readonly Screen[] = [
  "title",
  "howto",
  "countdown",
  "playing",
  "paused",
  "matchover",
];
const MODES: readonly Mode[] = ["solo", "versus"];
const SIDES: readonly Side[] = ["left", "right"];

function expectOneOf<T>(
  value: unknown,
  allowed: readonly T[],
  what: string,
): T {
  if (!allowed.includes(value as T)) {
    throw new RangeError(
      `Carom debug: ${what} must be one of ${allowed.join(", ")}, got ${String(value)}`,
    );
  }
  return value as T;
}

function expectNumber(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RangeError(`Carom debug: ${what} must be a finite number`);
  }
  return value;
}

function expectIndex(value: unknown, what: string): number {
  const n = expectNumber(value, what);
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(
      `Carom debug: ${what} must be a whole number, got ${n}`,
    );
  }
  return n;
}

function expectBoolean(value: unknown, what: string): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(`Carom debug: ${what} must be a boolean`);
  }
  return value;
}

function expectSign(value: unknown): 1 | -1 {
  if (value !== 1 && value !== -1) {
    throw new RangeError(
      `Carom debug: a serve sign is 1 or -1, got ${String(value)}`,
    );
  }
  return value;
}

/** The ball, which every ball pose needs on the field to act on. */
function presentBall(state: CaromView): BallState {
  if (state.ball === null) {
    throw new Error("Carom debug: no ball is on the field to pose");
  }
  return state.ball;
}

function withBall(state: CaromView, patch: Partial<BallState>): CaromState {
  return { ...state, ball: { ...presentBall(state), ...patch } };
}

function withPaddle(
  state: CaromView,
  side: Side,
  patch: Partial<CaromState["paddles"]["left"]>,
): CaromState {
  const which = expectOneOf(side, SIDES, "side");
  return {
    ...state,
    paddles: {
      ...state.paddles,
      [which]: { ...state.paddles[which], ...patch },
    },
  };
}

export function snapshot(state: CaromView): CaromSnapshot {
  const ball = state.ball;
  return {
    version: CAROM_DEBUG_VERSION,
    screen: state.screen,
    mode: state.mode,
    menuIndex: state.menuIndex,
    titleIndex: state.titleIndex,
    resumeScreen: state.resumeScreen,
    score: { p1: state.score.p1, p2: state.score.p2 },
    winner: state.winner,
    muted: state.muted,
    paddles: {
      left: { ...state.paddles.left },
      right: { ...state.paddles.right },
    },
    ai: { ...state.ai },
    receiver: state.receiver,
    ball:
      ball === null
        ? null
        : {
            x: ball.x,
            y: ball.y,
            vx: ball.vx,
            vy: ball.vy,
            speed: Math.hypot(ball.vx, ball.vy),
            spin: ball.spin,
            held: ball.held,
            holdTimer: ball.holdTimer,
            serveSign: ball.serveSign,
            trail: ball.trail.map((sample) => ({ ...sample })),
          },
    obstacles: state.obstacles.map((obstacle) => ({ ...obstacle })),
    simTime: state.simTime,
  };
}

export function createDebugApi(): CaromDebugApi {
  return {
    version: CAROM_DEBUG_VERSION,

    clearWorld: (s) => ({ ...s, ball: null, obstacles: [] }),
    spawnBall: (s) => ({ ...s, ball: parkedBall() }),
    spawnObstacle: (s, index) => {
      const i = expectIndex(index, "an obstacle index");
      if (i >= OBSTACLE_CENTERS.length) {
        throw new RangeError(`Carom debug: no obstacle has index ${i}`);
      }
      const others = s.obstacles.filter((o) => o.index !== i);
      const obstacles = [...others, obstacleAt(i)].sort(
        (a, b) => a.index - b.index,
      );
      return { ...s, obstacles };
    },
    reset: (s) => titleState(s.muted),
    // Every reading is worked out at the read, so there is nothing to rewrite.
    reconcile: (s) => ({ ...s }),

    setScreen: (s, screen) => ({
      ...s,
      screen: expectOneOf(screen, SCREENS, "screen"),
    }),
    setMode: (s, mode) => ({ ...s, mode: expectOneOf(mode, MODES, "mode") }),
    setMenuIndex: (s, index) => ({
      ...s,
      menuIndex: expectIndex(index, "a menu index"),
    }),
    setTitleIndex: (s, index) => ({
      ...s,
      titleIndex: expectIndex(index, "a title index"),
    }),
    setResumeScreen: (s, screen) => ({
      ...s,
      resumeScreen: expectOneOf(
        screen,
        ["countdown", "playing"] as const,
        "resume screen",
      ),
    }),

    setScore: (s, p1, p2) => ({
      ...s,
      score: { p1: expectIndex(p1, "p1"), p2: expectIndex(p2, "p2") },
    }),
    setWinner: (s, side) => ({
      ...s,
      winner: side === null ? null : expectOneOf(side, SIDES, "winner"),
    }),
    setReceiver: (s, side) => ({
      ...s,
      receiver: expectOneOf(side, SIDES, "receiver"),
    }),

    setPaddleCy: (s, side, cy) =>
      withPaddle(s, side, { cy: expectNumber(cy, "cy") }),
    setPaddleVy: (s, side, vy) =>
      withPaddle(s, side, { drivenVy: expectNumber(vy, "vy") }),
    setPaddleDriven: (s, side, driven) =>
      withPaddle(s, side, { driven: expectBoolean(driven, "driven") }),

    setBallPosition: (s, x, y) =>
      withBall(s, { x: expectNumber(x, "x"), y: expectNumber(y, "y") }),
    setBallVelocity: (s, vx, vy) =>
      withBall(s, { vx: expectNumber(vx, "vx"), vy: expectNumber(vy, "vy") }),
    setBallSpin: (s, spin) => withBall(s, { spin: expectNumber(spin, "spin") }),
    setBallHeld: (s, held) =>
      withBall(s, { held: expectBoolean(held, "held") }),
    setBallHoldTimer: (s, seconds) =>
      withBall(s, { holdTimer: expectNumber(seconds, "hold timer") }),
    setBallServeSign: (s, sign) => withBall(s, { serveSign: expectSign(sign) }),
    drawBallServeSign: (s) => withBall(s, { serveSign: drawServeSign() }),

    setAiTracking: (s, enabled) => ({
      ...s,
      ai: { ...s.ai, tracking: expectBoolean(enabled, "tracking") },
    }),
    setAiMovement: (s, enabled) => ({
      ...s,
      ai: { ...s.ai, movement: expectBoolean(enabled, "movement") },
    }),

    setMuted: (s, muted) => ({ ...s, muted: expectBoolean(muted, "muted") }),

    snapshot,
    menuItemRect: (s, index) => menuItemRect(s.screen, index),
  };
}
