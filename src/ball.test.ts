import { describe, expect, test } from "vitest";
import {
  BALL_R,
  FIELD_H,
  FIELD_W,
  MAX_BOUNCE_ANGLE,
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
} from "./constants";
import {
  advanceBall,
  decaySpin,
  goalScorer,
  paddleBounce,
  recordTrail,
  resolveRect,
  resolveWalls,
  serveBall,
  speedOf,
  substepCount,
  turnBySpin,
} from "./ball";
import type { BallState, CaromState } from "./game";
import { parkedBall, titleState } from "./world";

function flying(patch: Partial<BallState>): BallState {
  return { ...parkedBall(1), held: false, holdTimer: 0, ...patch };
}

function world(patch: Partial<CaromState> = {}): CaromState {
  return { ...titleState(false), screen: "playing", ...patch };
}

describe("walls", () => {
  test("the top wall reflects a ball travelling up", () => {
    const { motion, hit } = resolveWalls({ x: 100, y: 5, vx: 10, vy: -50 });
    expect(hit).toBe(true);
    expect(motion).toEqual({ x: 100, y: BALL_R, vx: 10, vy: 50 });
  });

  test("the bottom wall reflects a ball travelling down", () => {
    const { motion, hit } = resolveWalls({
      x: 100,
      y: FIELD_H - 2,
      vx: 10,
      vy: 50,
    });
    expect(hit).toBe(true);
    expect(motion.y).toBe(FIELD_H - BALL_R);
    expect(motion.vy).toBe(-50);
  });

  test("a ball past the wall but travelling away is left alone", () => {
    const { motion, hit } = resolveWalls({ x: 100, y: 5, vx: 10, vy: 50 });
    expect(hit).toBe(false);
    expect(motion.y).toBe(5);
  });
});

describe("circle against a rectangle", () => {
  const rect = OBSTACLES[0];

  test("no overlap resolves nothing", () => {
    expect(resolveRect({ x: 10, y: 10, vx: 0, vy: 0 }, rect)).toBeNull();
  });

  test("the center on the expanded edge is not an overlap", () => {
    const m = { x: rect.x0 - BALL_R, y: 220, vx: 100, vy: 0 };
    expect(resolveRect(m, rect)).toBeNull();
  });

  test("the least-penetrated face is struck and the velocity reversed", () => {
    const m = { x: rect.x0 - BALL_R + 2, y: 220, vx: 300, vy: 20 };
    const hit = resolveRect(m, rect);
    expect(hit?.face).toBe("left");
    expect(hit?.motion).toEqual({
      x: rect.x0 - BALL_R,
      y: 220,
      vx: -300,
      vy: 20,
    });
  });

  test("a velocity already leaving the face is kept", () => {
    const m = { x: rect.x1 + BALL_R - 1, y: 220, vx: 300, vy: 0 };
    const hit = resolveRect(m, rect);
    expect(hit?.face).toBe("right");
    expect(hit?.motion.vx).toBe(300);
    expect(hit?.motion.x).toBe(rect.x1 + BALL_R);
  });

  test("the top and bottom faces place the ball off them", () => {
    const top = resolveRect(
      { x: 490, y: rect.y0 - BALL_R + 3, vx: 0, vy: 200 },
      rect,
    );
    expect(top?.face).toBe("top");
    expect(top?.motion).toMatchObject({ y: rect.y0 - BALL_R, vy: -200 });
    const bottom = resolveRect(
      { x: 490, y: rect.y1 + BALL_R - 3, vx: 0, vy: -200 },
      rect,
    );
    expect(bottom?.face).toBe("bottom");
    expect(bottom?.motion).toMatchObject({ y: rect.y1 + BALL_R, vy: 200 });
  });

  test("a tie goes to the first of left, right, top, bottom", () => {
    // Equal depth on the left and top faces: a center exactly on the diagonal.
    const d = 4;
    const m = {
      x: rect.x0 - BALL_R + d,
      y: rect.y0 - BALL_R + d,
      vx: 1,
      vy: 1,
    };
    expect(resolveRect(m, rect)?.face).toBe("left");
  });
});

describe("the paddle bounce", () => {
  const paddle = { cy: 360, vy: 0, driven: false, drivenVy: 0 };

  test("the center sends the ball straight across, sped up", () => {
    const ball = flying({ x: 60, y: 360, vx: -500, vy: 0 });
    const out = paddleBounce(ball, "left", paddle);
    expect(out.vx).toBeCloseTo(500 * SPEED_MULT);
    expect(out.vy).toBeCloseTo(0);
    expect(out.x).toBe(P1_X1 + BALL_R);
  });

  test("the top edge sends the ball up at the full angle", () => {
    const ball = flying({ x: 1210, y: 360 - PADDLE_HALF, vx: 400, vy: 0 });
    const out = paddleBounce(ball, "right", paddle);
    const speed = 400 * SPEED_MULT;
    expect(out.vx).toBeCloseTo(-speed * Math.cos(MAX_BOUNCE_ANGLE));
    expect(out.vy).toBeCloseTo(-speed * Math.sin(MAX_BOUNCE_ANGLE));
    expect(out.x).toBe(P2_X0 - BALL_R);
  });

  test("the offset is clamped beyond the paddle's half height", () => {
    const ball = flying({ x: 60, y: 360 + PADDLE_HALF * 3, vx: -400, vy: 0 });
    const out = paddleBounce(ball, "left", paddle);
    expect(Math.atan2(out.vy, out.vx)).toBeCloseTo(MAX_BOUNCE_ANGLE);
  });

  test("speed is capped", () => {
    const ball = flying({ x: 60, y: 360, vx: -SPEED_CAP, vy: 0 });
    expect(speedOf(paddleBounce(ball, "left", paddle))).toBeCloseTo(SPEED_CAP);
  });

  test("a moving paddle adds spin, clamped", () => {
    const ball = flying({ x: 60, y: 360, vx: -400, vy: 0, spin: 100 });
    const down = paddleBounce(ball, "left", { ...paddle, vy: 200 });
    expect(down.spin).toBeCloseTo(100 + 200 * SPIN_FROM_PADDLE);
    const up = paddleBounce(ball, "left", { ...paddle, vy: -5000 });
    expect(up.spin).toBe(-SPIN_CLAMP);
    const still = paddleBounce(ball, "left", paddle);
    expect(still.spin).toBe(100);
  });
});

describe("spin", () => {
  test("positive spin turns +x toward +y, keeping speed", () => {
    const ball = flying({ vx: 300, vy: 0, spin: 300 });
    const out = turnBySpin(ball, 0.5);
    // (spin / speed) * h = 0.5 radians.
    expect(out.vx).toBeCloseTo(300 * Math.cos(0.5));
    expect(out.vy).toBeCloseTo(300 * Math.sin(0.5));
    expect(speedOf(out)).toBeCloseTo(300);
  });

  test("a resting ball is not turned", () => {
    const ball = flying({ vx: 0, vy: 0, spin: 300 });
    expect(turnBySpin(ball, 1)).toBe(ball);
  });

  test("spin halves every half-life", () => {
    expect(decaySpin(800, SPIN_HALFLIFE)).toBeCloseTo(400);
    expect(decaySpin(800, SPIN_HALFLIFE * 2)).toBeCloseTo(200);
  });
});

describe("sub-steps", () => {
  test("a frame is cut so the ball travels at most MAX_SUBSTEP per step", () => {
    expect(substepCount(0, 1 / 60)).toBe(1);
    expect(substepCount(520, 1 / 60)).toBe(3);
    expect(substepCount(980, 0.016)).toBe(4);
  });

  test("a frame advances the ball by its velocity", () => {
    const ball = flying({ x: 300, y: 300, vx: 600, vy: -120 });
    const { ball: out, contacts } = advanceBall(ball, world(), 0.1);
    expect(out.x).toBeCloseTo(360);
    expect(out.y).toBeCloseTo(288);
    expect(contacts).toEqual({ wall: false, paddle: false, obstacle: false });
  });

  test("a wall contact is reported once however many sub-steps raised it", () => {
    const ball = flying({ x: 300, y: BALL_R + 1, vx: 0, vy: -600 });
    const { ball: out, contacts } = advanceBall(ball, world(), 0.05);
    expect(contacts.wall).toBe(true);
    expect(out.vy).toBe(600);
    expect(out.y).toBeGreaterThanOrEqual(BALL_R);
  });

  test("an obstacle bounce keeps speed and spin", () => {
    const rect = OBSTACLES[1];
    const ball = flying({
      x: rect.x0 - BALL_R - 3,
      y: 500,
      vx: 600,
      vy: 0,
      spin: 50,
    });
    const { ball: out, contacts } = advanceBall(ball, world(), 0.02);
    expect(contacts.obstacle).toBe(true);
    expect(out.vx).toBeLessThan(0);
    expect(speedOf(out)).toBeCloseTo(600);
    expect(out.spin).toBeCloseTo(decaySpin(50, 0.02));
    expect(out.x).toBeLessThanOrEqual(rect.x0 - BALL_R);
  });

  test("an absent obstacle has no collision", () => {
    const rect = OBSTACLES[1];
    const ball = flying({ x: rect.x0 - BALL_R - 3, y: 500, vx: 600, vy: 0 });
    const { ball: out, contacts } = advanceBall(
      ball,
      world({ obstacles: [] }),
      0.1,
    );
    expect(contacts.obstacle).toBe(false);
    expect(out.x).toBeGreaterThan(rect.x1);
  });

  test("a paddle face raises a paddle hit and an end cap a wall bounce", () => {
    const state = world();
    const face = advanceBall(
      flying({ x: P1_X1 + BALL_R + 2, y: 360, vx: -600, vy: 0 }),
      state,
      0.02,
    );
    expect(face.contacts.paddle).toBe(true);
    expect(face.ball.vx).toBeGreaterThan(0);

    const cap = advanceBall(
      flying({ x: 56, y: 360 - PADDLE_HALF - BALL_R - 2, vx: 0, vy: 600 }),
      state,
      0.02,
    );
    expect(cap.contacts).toMatchObject({ paddle: false, wall: true });
    expect(cap.ball.vy).toBeLessThan(0);
    expect(cap.ball.y).toBeLessThanOrEqual(360 - PADDLE_HALF - BALL_R);
  });

  test("the ball stays out of every body at the speed cap", () => {
    const state = world({
      paddles: {
        left: { cy: 300, vy: 0, driven: false, drivenVy: 0 },
        right: { cy: 420, vy: 0, driven: false, drivenVy: 0 },
      },
    });
    let ball = flying({
      x: 640,
      y: 360,
      vx: SPEED_CAP * 0.8,
      vy: SPEED_CAP * 0.6,
      spin: 400,
    });
    for (let i = 0; i < 600; i += 1) {
      ball = advanceBall(ball, state, 1 / 60).ball;
      if (goalScorer(ball) !== null) {
        ball = { ...ball, x: 640, y: 360 };
      }
      expect(ball.y).toBeGreaterThanOrEqual(BALL_R - 1e-9);
      expect(ball.y).toBeLessThanOrEqual(FIELD_H - BALL_R + 1e-9);
      for (const rect of [
        ...OBSTACLES,
        { x0: P1_X0, x1: P1_X1, y0: 245, y1: 355 },
        { x0: P2_X0, x1: P2_X1, y0: 365, y1: 475 },
      ]) {
        const inside =
          ball.x > rect.x0 - BALL_R + 1e-9 &&
          ball.x < rect.x1 + BALL_R - 1e-9 &&
          ball.y > rect.y0 - BALL_R + 1e-9 &&
          ball.y < rect.y1 + BALL_R - 1e-9;
        expect(inside).toBe(false);
      }
    }
  });
});

describe("goals and serves", () => {
  test("a ball wholly past an edge scores for the far side", () => {
    expect(goalScorer({ x: FIELD_W + BALL_R + 1, y: 0, vx: 0, vy: 0 })).toBe(
      "left",
    );
    expect(goalScorer({ x: -BALL_R - 1, y: 0, vx: 0, vy: 0 })).toBe("right");
    expect(goalScorer({ x: FIELD_W + BALL_R, y: 0, vx: 0, vy: 0 })).toBeNull();
    expect(goalScorer({ x: 5, y: 0, vx: 0, vy: 0 })).toBeNull();
  });

  test("a serve leaves toward the receiver with the drawn sign", () => {
    const toLeft = serveBall(parkedBall(1), "left");
    expect(toLeft.held).toBe(false);
    expect(toLeft.holdTimer).toBe(0);
    expect(toLeft.vx).toBeCloseTo(-SERVE_SPEED * Math.cos(SERVE_ANGLE));
    expect(toLeft.vy).toBeCloseTo(SERVE_SPEED * Math.sin(SERVE_ANGLE));
    expect(toLeft.serveSign).toBe(1);

    const toRight = serveBall(parkedBall(-1), "right");
    expect(toRight.vx).toBeCloseTo(SERVE_SPEED * Math.cos(SERVE_ANGLE));
    expect(toRight.vy).toBeCloseTo(-SERVE_SPEED * Math.sin(SERVE_ANGLE));
  });

  test("the trail keeps TRAIL_TIME of samples, oldest first", () => {
    let ball = flying({ x: 0, y: 0 });
    for (let i = 0; i <= 20; i += 1) {
      ball = recordTrail({ ...ball, x: i }, i * 0.02);
    }
    expect(ball.trail[ball.trail.length - 1]).toEqual({ x: 20, y: 0, t: 0.4 });
    for (const sample of ball.trail) {
      expect(0.4 - sample.t).toBeLessThanOrEqual(TRAIL_TIME + 1e-9);
    }
    expect(ball.trail.length).toBe(7);
    expect(ball.trail[0].t).toBeLessThan(ball.trail[1].t);
  });
});
