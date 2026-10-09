// The paddles: how a player, the AI, and the debug driver move one, and the one
// integration they all share (specs/playfield.md, specs/modes/*.md).

import {
  AI_DEADZONE,
  AI_HOME_DEADZONE,
  AI_HOME_Y,
  AI_REACT,
  AI_SPEED,
  PADDLE_MAX_CY,
  PADDLE_MIN_CY,
  PADDLE_SPEED,
} from "./constants";
import type { CaromState, CaromView, PaddleState, Side } from "./game";
import type { MovementValues } from "./input";
import { clamp } from "./world";

/**
 * Sets `vy` and integrates it: the center is clamped to the field, and when the
 * clamp bit, `vy` becomes the velocity the paddle actually travelled at.
 */
export function integratePaddle(
  paddle: PaddleState,
  vy: number,
  dt: number,
): PaddleState {
  const unclamped = paddle.cy + vy * dt;
  const next = clamp(unclamped, PADDLE_MIN_CY, PADDLE_MAX_CY);
  const actualVy = next !== unclamped && dt > 0 ? (next - paddle.cy) / dt : vy;
  return { ...paddle, cy: next, vy: actualVy };
}

/** A human paddle's velocity from the `up` and `down` values held this frame. */
export function humanVy(up: number, down: number): number {
  const axis = (down > 0 ? 1 : 0) - (up > 0 ? 1 : 0);
  return axis * PADDLE_SPEED;
}

/** The AI's velocity for the frame (specs/modes/single-player.md). */
export function aiVy(state: CaromView, dt: number): number {
  if (!state.ai.movement) return 0;

  let target = AI_HOME_Y;
  let deadzone = AI_HOME_DEADZONE;
  const ball = state.ball;
  if (
    state.ai.tracking &&
    state.screen === "playing" &&
    ball !== null &&
    ball.vx > 0
  ) {
    target = ball.y - ball.vy * AI_REACT;
    deadzone = AI_DEADZONE;
  }

  const diff = target - state.paddles.right.cy;
  if (Math.abs(diff) <= deadzone) return 0;
  const reach = dt > 0 ? Math.abs(diff) / dt : AI_SPEED;
  return Math.sign(diff) * Math.min(AI_SPEED, reach);
}

/** The velocity the game gives `side`'s paddle this frame, before integration. */
function paddleVy(
  state: CaromView,
  side: Side,
  held: MovementValues,
  dt: number,
): number {
  const paddle = state.paddles[side];
  if (paddle.driven) return paddle.drivenVy;

  if (state.mode === "solo") {
    if (side === "right") return aiVy(state, dt);
    return humanVy(
      Math.max(held["p1-up"], held["p2-up"]),
      Math.max(held["p1-down"], held["p2-down"]),
    );
  }
  return side === "left"
    ? humanVy(held["p1-up"], held["p1-down"])
    : humanVy(held["p2-up"], held["p2-down"]);
}

/** Both paddles moved for the frame, each by whoever holds it. */
export function movePaddles(
  state: CaromView,
  held: MovementValues,
  dt: number,
): CaromState {
  return {
    ...state,
    paddles: {
      left: integratePaddle(
        state.paddles.left,
        paddleVy(state, "left", held, dt),
        dt,
      ),
      right: integratePaddle(
        state.paddles.right,
        paddleVy(state, "right", held, dt),
        dt,
      ),
    },
  };
}
