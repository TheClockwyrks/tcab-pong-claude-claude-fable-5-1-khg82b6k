import { describe, expect, test } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import {
  FIELD_CX,
  FIELD_CY,
  FIELD_H,
  FIELD_W,
  P1_X0,
  P2_X0,
} from "./constants";
import type { CaromState, Screen } from "./game";
import { BACKGROUND_COLOR, renderFrame } from "./render";
import { parkedBall, startMatch, titleState } from "./world";

type Ctx = CanvasRenderingContext2D;

function draw(state: CaromState): Ctx {
  const canvas = createCanvas(FIELD_W, FIELD_H);
  const ctx = canvas.getContext("2d") as unknown as Ctx;
  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  renderFrame(ctx, state);
  return ctx;
}

function pixel(ctx: Ctx, x: number, y: number): [number, number, number] {
  const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
  return [d[0], d[1], d[2]];
}

function brightness([r, g, b]: [number, number, number]): number {
  return r + g + b;
}

const background = brightness([10, 14, 26]);

describe("the renderer", () => {
  test("every screen draws without throwing", () => {
    const live = startMatch(titleState(false), "solo");
    for (const screen of [
      "title",
      "howto",
      "countdown",
      "playing",
      "paused",
      "matchover",
    ] as Screen[]) {
      expect(() =>
        draw({ ...live, screen, winner: "right", score: { p1: 7, p2: 11 } }),
      ).not.toThrow();
    }
  });

  test("the paddles, ball, and obstacles are bright bodies on the dark field", () => {
    const ctx = draw({
      ...startMatch(titleState(false), "versus"),
      screen: "playing",
    });
    expect(brightness(pixel(ctx, P1_X0 + 8, FIELD_CY))).toBeGreaterThan(400);
    expect(brightness(pixel(ctx, P2_X0 + 8, FIELD_CY))).toBeGreaterThan(400);
    expect(brightness(pixel(ctx, FIELD_CX, FIELD_CY))).toBeGreaterThan(500);
    expect(brightness(pixel(ctx, 490, 220))).toBeGreaterThan(400);
    expect(brightness(pixel(ctx, 790, 500))).toBeGreaterThan(400);
    // An empty patch of field stays dark.
    expect(brightness(pixel(ctx, 300, 600))).toBeLessThan(background + 60);
  });

  test("the two paddles differ in color from each other and from the obstacles", () => {
    const ctx = draw({
      ...startMatch(titleState(false), "versus"),
      screen: "playing",
    });
    const left = pixel(ctx, P1_X0 + 8, FIELD_CY);
    const right = pixel(ctx, P2_X0 + 8, FIELD_CY);
    const obstacle = pixel(ctx, 490, 220);
    const distance = (a: number[], b: number[]) =>
      Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    expect(distance(left, right)).toBeGreaterThan(100);
    expect(distance(left, obstacle)).toBeGreaterThan(100);
    expect(distance(right, obstacle)).toBeGreaterThan(100);
  });

  test("an absent ball and absent obstacles leave their spots dark", () => {
    const live = startMatch(titleState(false), "versus");
    const present = draw({
      ...live,
      screen: "playing",
      ball: { ...live.ball!, x: 300, y: 500 },
    });
    expect(brightness(pixel(present, 300, 500))).toBeGreaterThan(500);
    const absent = draw({
      ...live,
      screen: "playing",
      ball: null,
      obstacles: [],
    });
    expect(brightness(pixel(absent, 300, 500))).toBeLessThan(background + 60);
    expect(brightness(pixel(absent, 490, 220))).toBeLessThan(background + 60);
  });

  test("the trail is drawn behind a moving ball, and a spinning ball wears its arc", () => {
    const base = startMatch(titleState(false), "versus");
    const ball = {
      ...parkedBall(1),
      held: false,
      x: 300,
      y: 500,
      vx: 600,
      vy: 0,
      spin: 500,
      trail: [
        { x: 200, y: 500, t: 0 },
        { x: 250, y: 500, t: 0.05 },
      ],
    };
    const ctx = draw({ ...base, screen: "playing", ball });
    expect(brightness(pixel(ctx, 230, 500))).toBeGreaterThan(background + 60);
    const bare = draw({
      ...base,
      screen: "playing",
      ball: { ...ball, trail: [], spin: 0 },
    });
    expect(brightness(pixel(bare, 230, 500))).toBeLessThan(background + 60);
  });

  test("the menus highlight the selected item", () => {
    const first = draw(titleState(false));
    const second = draw({ ...titleState(false), menuIndex: 1 });
    // The same point reads differently once the highlight moves.
    expect(pixel(first, FIELD_CX - 150, 392 + 29)).not.toEqual(
      pixel(second, FIELD_CX - 150, 392 + 29),
    );
  });

  test("the countdown ring and the match-over copy draw", () => {
    const live = startMatch(titleState(false), "solo");
    expect(() =>
      draw({ ...live, ball: { ...live.ball!, holdTimer: 0.5 } }),
    ).not.toThrow();
    expect(() => draw({ ...live, receiver: "right" })).not.toThrow();
    for (const [mode, winner] of [
      ["solo", "left"],
      ["solo", "right"],
      ["versus", "left"],
      ["versus", "right"],
    ] as const) {
      expect(() =>
        draw({ ...live, screen: "matchover", mode, winner }),
      ).not.toThrow();
    }
    expect(() =>
      draw({ ...live, screen: "matchover", winner: null }),
    ).not.toThrow();
    expect(() =>
      draw({ ...live, screen: "howto", mode: "versus" }),
    ).not.toThrow();
  });
});
