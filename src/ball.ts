// The ball: the sub-stepped physics, every collision, the paddle bounce and its
// spin, the serve, and the goal test (specs/balls.md, specs/playfield.md).

import {
  BALL_R,
  FIELD_H,
  FIELD_W,
  MAX_BOUNCE_ANGLE,
  MAX_SUBSTEP,
  OBSTACLES,
  P1_X0,
  P1_X1,
  P2_X0,
  P2_X1,
  PADDLE_HALF,
  SERVE_ANGLE,
  SERVE_SPEED,
  SPEED_CAP,
  SPEED_MULT,
  SPIN_CLAMP,
  SPIN_FROM_PADDLE,
  SPIN_HALFLIFE,
  TRAIL_TIME,
  type Rect,
} from "./constants";
import type {
  BallState,
  CaromView,
  ObstacleState,
  PaddleState,
  Side,
} from "./game";
import { clamp } from "./world";

/** The ball's position and velocity, the part of it a collision touches. */
export interface Motion {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
}

export type Face = "left" | "right" | "top" | "bottom";

/** Which kinds of contact a frame's sub-steps raised, each at most once. */
export interface Contacts {
  readonly wall: boolean;
  readonly paddle: boolean;
  readonly obstacle: boolean;
}

export const NO_CONTACTS: Contacts = {
  wall: false,
  paddle: false,
  obstacle: false,
};

export function speedOf(ball: Motion): number {
  return Math.hypot(ball.vx, ball.vy);
}

/** The rectangle `side`'s paddle occupies around `cy`. */
export function paddleRect(side: Side, paddle: PaddleState): Rect {
  return {
    x0: side === "left" ? P1_X0 : P2_X0,
    x1: side === "left" ? P1_X1 : P2_X1,
    y0: paddle.cy - PADDLE_HALF,
    y1: paddle.cy + PADDLE_HALF,
  };
}

/** The top and bottom walls, resolved first in every sub-step. */
export function resolveWalls(m: Motion): { motion: Motion; hit: boolean } {
  if (m.y - BALL_R < 0 && m.vy < 0) {
    return { motion: { ...m, y: BALL_R, vy: -m.vy }, hit: true };
  }
  if (m.y + BALL_R > FIELD_H && m.vy > 0) {
    return { motion: { ...m, y: FIELD_H - BALL_R, vy: -m.vy }, hit: true };
  }
  return { motion: m, hit: false };
}

/**
 * The circle against an axis-aligned rectangle rule: the ball is placed off the
 * least-penetrated face, and its normal velocity reversed if it points in.
 * Returns `null` when the ball does not overlap the rectangle.
 */
export function resolveRect(
  m: Motion,
  rect: Rect,
): { motion: Motion; face: Face } | null {
  const ex0 = rect.x0 - BALL_R;
  const ex1 = rect.x1 + BALL_R;
  const ey0 = rect.y0 - BALL_R;
  const ey1 = rect.y1 + BALL_R;
  if (!(m.x > ex0 && m.x < ex1 && m.y > ey0 && m.y < ey1)) return null;

  const depths: readonly (readonly [Face, number])[] = [
    ["left", m.x - ex0],
    ["right", ex1 - m.x],
    ["top", m.y - ey0],
    ["bottom", ey1 - m.y],
  ];
  let face: Face = "left";
  let least = Infinity;
  for (const [candidate, depth] of depths) {
    if (depth < least) {
      face = candidate;
      least = depth;
    }
  }

  switch (face) {
    case "left":
      return { face, motion: { ...m, x: ex0, vx: m.vx > 0 ? -m.vx : m.vx } };
    case "right":
      return { face, motion: { ...m, x: ex1, vx: m.vx < 0 ? -m.vx : m.vx } };
    case "top":
      return { face, motion: { ...m, y: ey0, vy: m.vy > 0 ? -m.vy : m.vy } };
    case "bottom":
      return { face, motion: { ...m, y: ey1, vy: m.vy < 0 ? -m.vy : m.vy } };
  }
}

/** The paddle bounce: angle from the contact point, speed up, spin, placement. */
export function paddleBounce(
  ball: BallState,
  side: Side,
  paddle: PaddleState,
): BallState {
  const offset = clamp((ball.y - paddle.cy) / PADDLE_HALF, -1, 1);
  const theta = offset * MAX_BOUNCE_ANGLE;
  const speed = Math.min(speedOf(ball) * SPEED_MULT, SPEED_CAP);
  const dir = side === "left" ? 1 : -1;
  return {
    ...ball,
    x: side === "left" ? P1_X1 + BALL_R : P2_X0 - BALL_R,
    vx: dir * speed * Math.cos(theta),
    vy: speed * Math.sin(theta),
    spin: clamp(
      ball.spin + paddle.vy * SPIN_FROM_PADDLE,
      -SPIN_CLAMP,
      SPIN_CLAMP,
    ),
  };
}

/** Spin turns the velocity: a positive angle turns `+x` toward `+y`. */
export function turnBySpin(ball: BallState, h: number): BallState {
  const speed = speedOf(ball);
  if (speed <= 0) return ball;
  const angle = (ball.spin / speed) * h;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    ...ball,
    vx: ball.vx * cos - ball.vy * sin,
    vy: ball.vx * sin + ball.vy * cos,
  };
}

export function decaySpin(spin: number, h: number): number {
  return spin * Math.pow(0.5, h / SPIN_HALFLIFE);
}

/** How many sub-steps a frame of `dt` seconds is cut into at `speed`. */
export function substepCount(speed: number, dt: number): number {
  return Math.max(1, Math.ceil((speed * dt) / MAX_SUBSTEP));
}

interface SubstepResult {
  readonly ball: BallState;
  readonly contacts: Contacts;
}

function resolvePaddle(
  ball: BallState,
  side: Side,
  paddle: PaddleState,
  contacts: Contacts,
): SubstepResult {
  const hit = resolveRect(ball, paddleRect(side, paddle));
  if (hit === null) return { ball, contacts };
  if (hit.face === "left" || hit.face === "right") {
    return {
      ball: paddleBounce(ball, side, paddle),
      contacts: { ...contacts, paddle: true },
    };
  }
  // An end cap is resolved like a wall.
  return {
    ball: { ...ball, ...hit.motion },
    contacts: { ...contacts, wall: true },
  };
}

function resolveObstacles(
  ball: BallState,
  obstacles: readonly ObstacleState[],
  contacts: Contacts,
): SubstepResult {
  let next = ball;
  let hitAny = false;
  for (const obstacle of obstacles) {
    const hit = resolveRect(next, OBSTACLES[obstacle.index]);
    if (hit !== null) {
      next = { ...next, ...hit.motion };
      hitAny = true;
    }
  }
  return {
    ball: next,
    contacts: hitAny ? { ...contacts, obstacle: true } : contacts,
  };
}

/** One sub-step of `h` seconds: spin, decay, advance, then every collision. */
export function substep(
  ball: BallState,
  state: CaromView,
  h: number,
  contacts: Contacts,
): SubstepResult {
  const turned = turnBySpin(ball, h);
  const moved: BallState = {
    ...turned,
    spin: decaySpin(turned.spin, h),
    x: turned.x + turned.vx * h,
    y: turned.y + turned.vy * h,
  };

  const walls = resolveWalls(moved);
  let result: SubstepResult = {
    ball: { ...moved, ...walls.motion },
    contacts: walls.hit ? { ...contacts, wall: true } : contacts,
  };
  result = resolvePaddle(
    result.ball,
    "left",
    state.paddles.left,
    result.contacts,
  );
  result = resolvePaddle(
    result.ball,
    "right",
    state.paddles.right,
    result.contacts,
  );
  return resolveObstacles(result.ball, state.obstacles, result.contacts);
}

/** The ball advanced by one `playing` frame of `dt` seconds. */
export function advanceBall(
  ball: BallState,
  state: CaromView,
  dt: number,
): SubstepResult {
  const n = substepCount(speedOf(ball), dt);
  const h = dt / n;
  let result: SubstepResult = { ball, contacts: NO_CONTACTS };
  for (let i = 0; i < n; i += 1) {
    result = substep(result.ball, state, h, result.contacts);
  }
  return result;
}

/** The side that scored, if the ball has passed a goal, else `null`. */
export function goalScorer(ball: Motion): Side | null {
  if (ball.x - BALL_R > FIELD_W) return "left";
  if (ball.x + BALL_R < 0) return "right";
  return null;
}

/** The ball served toward `receiver` at `SERVE_SPEED` and `SERVE_ANGLE`. */
export function serveBall(ball: BallState, receiver: Side): BallState {
  const dir = receiver === "left" ? -1 : 1;
  return {
    ...ball,
    held: false,
    holdTimer: 0,
    trail: [],
    vx: dir * SERVE_SPEED * Math.cos(SERVE_ANGLE),
    vy: ball.serveSign * SERVE_SPEED * Math.sin(SERVE_ANGLE),
  };
}

/** The ball with a sample at its position appended and the stale ones dropped. */
export function recordTrail(ball: BallState, simTime: number): BallState {
  const trail = [...ball.trail, { x: ball.x, y: ball.y, t: simTime }].filter(
    (sample) => simTime - sample.t <= TRAIL_TIME,
  );
  return { ...ball, trail };
}
