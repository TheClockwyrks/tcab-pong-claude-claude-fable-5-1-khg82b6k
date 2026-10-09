import { expect, test } from "vitest";
import { FIELD_CY, HOLD_TIME, OBSTACLE_CENTERS } from "./constants";
import {
  allObstacles,
  clamp,
  obstacleAt,
  parkedBall,
  returnToTitle,
  startMatch,
  titleState,
} from "./world";

test("the obstacles are built from their fixed centers, in order", () => {
  expect(allObstacles()).toEqual(
    OBSTACLE_CENTERS.map((c, index) => ({ index, cx: c.x, cy: c.y })),
  );
  expect(() => obstacleAt(2)).toThrow(/index/);
});

test("a parked ball draws its own serve sign", () => {
  const signs = new Set<number>();
  for (let i = 0; i < 200; i += 1) signs.add(parkedBall().serveSign);
  expect([...signs].sort()).toEqual([-1, 1]);
  expect(parkedBall(-1)).toMatchObject({ serveSign: -1, holdTimer: HOLD_TIME });
});

test("starting a match keeps the paddles' driven flags and the obstacles", () => {
  const s = {
    ...titleState(true),
    obstacles: [],
    paddles: {
      left: { cy: 100, vy: 5, driven: true, drivenVy: 40 },
      right: { cy: 600, vy: -5, driven: false, drivenVy: 0 },
    },
  };
  const match = startMatch(s, "versus");
  expect(match.paddles.left).toEqual({
    cy: FIELD_CY,
    vy: 0,
    driven: true,
    drivenVy: 40,
  });
  expect(match.obstacles).toEqual([]);
  expect(match.muted).toBe(true);
  const title = returnToTitle(match);
  expect(title.obstacles.length).toBe(2);
  expect(title.paddles.left.driven).toBe(false);
});

test("clamp", () => {
  expect(clamp(5, 0, 10)).toBe(5);
  expect(clamp(-1, 0, 10)).toBe(0);
  expect(clamp(11, 0, 10)).toBe(10);
});
