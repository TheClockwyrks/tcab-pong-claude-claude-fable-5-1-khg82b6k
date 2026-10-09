import { describe, expect, test } from "vitest";
import {
  AI_DEADZONE,
  AI_HOME_DEADZONE,
  AI_HOME_Y,
  AI_REACT,
  AI_SPEED,
  FIELD_CY,
  PADDLE_MAX_CY,
  PADDLE_MIN_CY,
  PADDLE_SPEED,
} from "./constants";
import type { CaromState, PaddleState } from "./game";
import { idleInput } from "./input";
import { aiVy, humanVy, integratePaddle, movePaddles } from "./paddle";
import { parkedBall, titleState } from "./world";

const rest: PaddleState = { cy: FIELD_CY, vy: 0, driven: false, drivenVy: 0 };

function playing(patch: Partial<CaromState> = {}): CaromState {
  return { ...titleState(false), screen: "playing", ...patch };
}

describe("integration", () => {
  test("a paddle moves by its velocity over the frame", () => {
    const next = integratePaddle(rest, 300, 0.1);
    expect(next.cy).toBeCloseTo(FIELD_CY + 30);
    expect(next.vy).toBe(300);
  });

  test("the clamp pins the center and reports the velocity actually travelled", () => {
    const nearTop = { ...rest, cy: PADDLE_MIN_CY + 10 };
    const next = integratePaddle(nearTop, -PADDLE_SPEED, 0.1);
    expect(next.cy).toBe(PADDLE_MIN_CY);
    expect(next.vy).toBeCloseTo(-100);

    const pinned = integratePaddle(next, -PADDLE_SPEED, 0.1);
    expect(pinned.cy).toBe(PADDLE_MIN_CY);
    expect(pinned.vy).toBe(0);

    const bottom = integratePaddle({ ...rest, cy: PADDLE_MAX_CY }, 500, 0.1);
    expect(bottom.cy).toBe(PADDLE_MAX_CY);
    expect(bottom.vy).toBe(0);
  });

  test("a zero-length frame keeps the velocity it was given", () => {
    const next = integratePaddle({ ...rest, cy: PADDLE_MIN_CY }, -500, 0);
    expect(next.vy).toBe(-500);
    expect(next.cy).toBe(PADDLE_MIN_CY);
  });
});

describe("human control", () => {
  test("down minus up, at PADDLE_SPEED", () => {
    expect(humanVy(0, 0)).toBe(0);
    expect(humanVy(1, 0)).toBe(-PADDLE_SPEED);
    expect(humanVy(0, 1)).toBe(PADDLE_SPEED);
    expect(humanVy(1, 1)).toBe(0);
  });

  test("in solo either pair moves the left paddle and the AI holds the right", () => {
    const held = { ...idleInput().held, "p2-down": 1 };
    const next = movePaddles(playing({ mode: "solo" }), held, 0.1);
    expect(next.paddles.left.cy).toBeCloseTo(FIELD_CY + PADDLE_SPEED * 0.1);
    expect(next.paddles.right.cy).toBe(FIELD_CY);
  });

  test("in versus each pair moves its own paddle", () => {
    const held = { ...idleInput().held, "p1-up": 1, "p2-down": 1 };
    const next = movePaddles(playing({ mode: "versus" }), held, 0.1);
    expect(next.paddles.left.cy).toBeCloseTo(FIELD_CY - PADDLE_SPEED * 0.1);
    expect(next.paddles.right.cy).toBeCloseTo(FIELD_CY + PADDLE_SPEED * 0.1);
  });

  test("a driven paddle moves at drivenVy and ignores the player", () => {
    const held = { ...idleInput().held, "p1-up": 1 };
    const state = playing({
      mode: "versus",
      paddles: { left: { ...rest, driven: true, drivenVy: 100 }, right: rest },
    });
    const next = movePaddles(state, held, 0.1);
    expect(next.paddles.left.cy).toBeCloseTo(FIELD_CY + 10);
    expect(next.paddles.left.vy).toBe(100);
    expect(next.paddles.left.drivenVy).toBe(100);
  });
});

describe("the AI", () => {
  const dt = 1 / 60;

  test("returns home while the ball travels away", () => {
    const state = playing({
      ball: { ...parkedBall(1), held: false, vx: -400, vy: 0, y: 100 },
      paddles: { left: rest, right: { ...rest, cy: 500 } },
    });
    expect(aiVy(state, dt)).toBe(-AI_SPEED);
    const within = {
      ...state,
      paddles: {
        left: rest,
        right: { ...rest, cy: AI_HOME_Y + AI_HOME_DEADZONE },
      },
    };
    expect(aiVy(within, dt)).toBe(0);
  });

  test("tracks the ball ahead of its motion while it approaches", () => {
    const ball = {
      ...parkedBall(1),
      held: false,
      x: 900,
      y: 300,
      vx: 400,
      vy: 200,
    };
    const state = playing({
      ball,
      paddles: { left: rest, right: { ...rest, cy: 360 } },
    });
    const target = ball.y - ball.vy * AI_REACT;
    expect(aiVy(state, dt)).toBe(Math.sign(target - 360) * AI_SPEED);
    const close = {
      ...state,
      paddles: { left: rest, right: { ...rest, cy: target + AI_DEADZONE } },
    };
    expect(aiVy(close, dt)).toBe(0);
    const nearer = {
      ...state,
      paddles: { left: rest, right: { ...rest, cy: target - AI_DEADZONE - 1 } },
    };
    expect(aiVy(nearer, dt)).toBeCloseTo(
      Math.min(AI_SPEED, (AI_DEADZONE + 1) / dt),
    );
  });

  test("only a playing screen is tracked", () => {
    const ball = {
      ...parkedBall(1),
      held: false,
      x: 900,
      y: 100,
      vx: 400,
      vy: 0,
    };
    const state = playing({ screen: "countdown", ball });
    expect(aiVy(state, dt)).toBe(0);
  });

  test("the faculties gate the rule", () => {
    const ball = {
      ...parkedBall(1),
      held: false,
      x: 900,
      y: 100,
      vx: 400,
      vy: 0,
    };
    const state = playing({
      ball,
      paddles: { left: rest, right: { ...rest, cy: 600 } },
    });
    expect(
      aiVy({ ...state, ai: { tracking: false, movement: true } }, dt),
    ).toBe(-AI_SPEED);
    expect(
      aiVy({ ...state, ai: { tracking: true, movement: false } }, dt),
    ).toBe(0);
    expect(
      aiVy(
        {
          ...state,
          ai: { tracking: false, movement: true },
          paddles: { left: rest, right: rest },
        },
        dt,
      ),
    ).toBe(0);
  });

  test("a ball that is absent leaves the AI returning home", () => {
    const state = playing({
      ball: null,
      paddles: { left: rest, right: { ...rest, cy: 100 } },
    });
    expect(aiVy(state, dt)).toBe(AI_SPEED);
  });
});
