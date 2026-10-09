// Building the world: the parked ball, the obstacles, the title-screen state,
// and the two transitions every menu shares, starting a match and returning to
// the title (specs/state.md, specs/ui.md).

import { FIELD_CX, FIELD_CY, HOLD_TIME, OBSTACLE_CENTERS } from "./constants";
import type {
  BallState,
  CaromState,
  CaromView,
  Mode,
  ObstacleState,
  PaddleState,
} from "./game";
import { drawServeSign } from "./random";

/** A ball parked at its home point, waiting out a fresh hold. */
export function parkedBall(serveSign: 1 | -1 = drawServeSign()): BallState {
  return {
    x: FIELD_CX,
    y: FIELD_CY,
    vx: 0,
    vy: 0,
    spin: 0,
    held: true,
    holdTimer: HOLD_TIME,
    serveSign,
    trail: [],
  };
}

/** Obstacle `index` at its fixed center. */
export function obstacleAt(index: number): ObstacleState {
  const center = OBSTACLE_CENTERS[index];
  if (center === undefined) {
    throw new RangeError(`Carom: no obstacle has index ${index}`);
  }
  return { index, cx: center.x, cy: center.y };
}

/** Every obstacle, in `OBSTACLE_CENTERS` order. */
export function allObstacles(): ObstacleState[] {
  return OBSTACLE_CENTERS.map((_, index) => obstacleAt(index));
}

/** A paddle at rest at the vertical center, not driven. */
export function restingPaddle(): PaddleState {
  return { cy: FIELD_CY, vy: 0, driven: false, drivenVy: 0 };
}

/** The state the game opens on (specs/state.md, "The state at the title screen"). */
export function titleState(muted: boolean): CaromState {
  return {
    screen: "title",
    mode: "solo",
    menuIndex: 0,
    titleIndex: 0,
    resumeScreen: "playing",
    score: { p1: 0, p2: 0 },
    winner: null,
    paddles: { left: restingPaddle(), right: restingPaddle() },
    ai: { tracking: true, movement: true },
    receiver: "left",
    ball: parkedBall(),
    obstacles: allObstacles(),
    simTime: 0,
    muted,
    presses: [],
  };
}

/** Starts a match in `mode` from wherever the game stands (specs/ui.md). */
export function startMatch(state: CaromView, mode: Mode): CaromState {
  return {
    ...state,
    mode,
    screen: "countdown",
    resumeScreen: "playing",
    menuIndex: 0,
    score: { p1: 0, p2: 0 },
    winner: null,
    receiver: "left",
    ball: parkedBall(),
    paddles: {
      left: { ...state.paddles.left, cy: FIELD_CY, vy: 0 },
      right: { ...state.paddles.right, cy: FIELD_CY, vy: 0 },
    },
    presses: [],
  };
}

/**
 * Returns to the title: every declared field back to its title-screen value,
 * except `titleIndex`, `simTime`, and `muted`, with `menuIndex` restored from
 * `titleIndex` (specs/ui.md).
 */
export function returnToTitle(state: CaromView): CaromState {
  return {
    ...titleState(state.muted),
    titleIndex: state.titleIndex,
    menuIndex: state.titleIndex,
    simTime: state.simTime,
  };
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
