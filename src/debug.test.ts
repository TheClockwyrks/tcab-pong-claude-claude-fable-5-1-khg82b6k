import { describe, expect, test, vi } from "vitest";
import {
  CAROM_DEBUG_VERSION,
  FIELD_CY,
  HOLD_TIME,
  OBSTACLE_CENTERS,
} from "./constants";
import { createDebugApi } from "./debug";
import type { CaromState } from "./game";
import { menuItemRect } from "./menu";
import { startMatch, titleState } from "./world";

const debug = createDebugApi();

function base(): CaromState {
  return titleState(false);
}

describe("the surface", () => {
  test("carries the version", () => {
    expect(debug.version).toBe(CAROM_DEBUG_VERSION);
  });

  test("a pose leaves the state it was handed as it was", () => {
    const s = base();
    const frozen = JSON.stringify(s);
    debug.setScreen(s, "playing");
    debug.setBallPosition(s, 1, 2);
    debug.clearWorld(s);
    expect(JSON.stringify(s)).toBe(frozen);
  });
});

describe("the world", () => {
  test("clearWorld empties the field and keeps the paddles", () => {
    const s = debug.clearWorld(debug.setPaddleCy(base(), "left", 100));
    expect(s.ball).toBeNull();
    expect(s.obstacles).toEqual([]);
    expect(s.paddles.left.cy).toBe(100);
    const snap = debug.snapshot(s);
    expect(snap.ball).toBeNull();
    expect(snap.obstacles).toEqual([]);
  });

  test("spawnBall parks a fresh ball", () => {
    const cleared = debug.clearWorld(base());
    const s = debug.spawnBall(cleared);
    expect(s.ball).toMatchObject({
      x: 640,
      y: 360,
      vx: 0,
      vy: 0,
      spin: 0,
      held: true,
      holdTimer: HOLD_TIME,
      trail: [],
    });
    expect([1, -1]).toContain(s.ball?.serveSign);
    const again = debug.spawnBall(debug.setBallPosition(s, 10, 10));
    expect(again.ball?.x).toBe(640);
  });

  test("spawnObstacle places one in index order and refuses a bad index", () => {
    const cleared = debug.clearWorld(base());
    const b = debug.spawnObstacle(cleared, 1);
    expect(b.obstacles).toEqual([{ index: 1, cx: 790, cy: 500 }]);
    const both = debug.spawnObstacle(b, 0);
    expect(both.obstacles.map((o) => o.index)).toEqual([0, 1]);
    expect(both.obstacles[0]).toEqual({
      index: 0,
      cx: OBSTACLE_CENTERS[0].x,
      cy: OBSTACLE_CENTERS[0].y,
    });
    const twice = debug.spawnObstacle(both, 0);
    expect(twice.obstacles.length).toBe(2);
    expect(() => debug.spawnObstacle(both, 2)).toThrow(/index/);
    expect(() => debug.spawnObstacle(both, -1)).toThrow();
    expect(() => debug.spawnObstacle(both, 0.5)).toThrow();
  });

  test("reset returns the game to the title screen and keeps the mute bit", () => {
    let s = startMatch(base(), "versus");
    s = debug.setScore(s, 5, 7);
    s = debug.setMuted(s, true);
    s = debug.setPaddleDriven(s, "left", true);
    s = debug.setPaddleVy(s, "left", 300);
    s = debug.setAiTracking(s, false);
    s = debug.setTitleIndex(s, 2);
    s = debug.clearWorld(s);
    s = { ...s, simTime: 99 };
    const reset = debug.reset(s);
    expect(reset).toMatchObject({
      screen: "title",
      mode: "solo",
      menuIndex: 0,
      titleIndex: 0,
      resumeScreen: "playing",
      score: { p1: 0, p2: 0 },
      winner: null,
      receiver: "left",
      simTime: 0,
      muted: true,
      ai: { tracking: true, movement: true },
      presses: [],
    });
    expect(reset.paddles.left).toEqual({
      cy: FIELD_CY,
      vy: 0,
      driven: false,
      drivenVy: 0,
    });
    expect(reset.obstacles.map((o) => o.index)).toEqual([0, 1]);
    expect(reset.ball?.held).toBe(true);
  });

  test("reconcile changes nothing and is idempotent", () => {
    const s = debug.setBallVelocity(startMatch(base(), "solo"), 300, 400);
    const once = debug.reconcile(s);
    expect(once).toEqual(s);
    expect(once).not.toBe(s);
    expect(debug.reconcile(once)).toEqual(once);
    expect(debug.snapshot(once).ball?.speed).toBeCloseTo(500);
  });
});

describe("screens, menus, and match state", () => {
  test("each pose sets its own field alone", () => {
    const s = startMatch(base(), "solo");
    const screen = debug.setScreen(s, "paused");
    expect(screen.screen).toBe("paused");
    expect(screen.menuIndex).toBe(s.menuIndex);
    expect(screen.ball).toBe(s.ball);
    expect(debug.setMode(s, "versus").mode).toBe("versus");
    expect(debug.setMenuIndex(s, 2).menuIndex).toBe(2);
    expect(debug.setTitleIndex(s, 1).titleIndex).toBe(1);
    expect(debug.setResumeScreen(s, "countdown").resumeScreen).toBe(
      "countdown",
    );
    expect(debug.setScore(s, 3, 9).score).toEqual({ p1: 3, p2: 9 });
    expect(debug.setWinner(s, "right").winner).toBe("right");
    expect(debug.setWinner(debug.setWinner(s, "left"), null).winner).toBeNull();
    expect(debug.setReceiver(s, "right").receiver).toBe("right");
  });

  test("a value off the vocabulary fails loudly", () => {
    const s = base();
    expect(() => debug.setScreen(s, "lobby" as never)).toThrow(/screen/);
    expect(() => debug.setMode(s, "coop" as never)).toThrow(/mode/);
    expect(() => debug.setResumeScreen(s, "title" as never)).toThrow();
    expect(() => debug.setWinner(s, "top" as never)).toThrow();
    expect(() => debug.setReceiver(s, "up" as never)).toThrow();
    expect(() => debug.setMenuIndex(s, -1)).toThrow();
    expect(() => debug.setScore(s, 1.5, 0)).toThrow();
    expect(() => debug.setScore(s, Number.NaN, 0)).toThrow();
  });
});

describe("paddles", () => {
  test("cy, drivenVy, and driven are set one at a time", () => {
    const s = base();
    const cy = debug.setPaddleCy(s, "right", 123);
    expect(cy.paddles.right.cy).toBe(123);
    expect(cy.paddles.left).toEqual(s.paddles.left);
    const vy = debug.setPaddleVy(s, "left", -250);
    expect(vy.paddles.left.drivenVy).toBe(-250);
    expect(vy.paddles.left.vy).toBe(0);
    expect(vy.paddles.left.driven).toBe(false);
    const driven = debug.setPaddleDriven(s, "left", true);
    expect(driven.paddles.left.driven).toBe(true);
    expect(driven.paddles.right.driven).toBe(false);
    expect(() => debug.setPaddleCy(s, "middle" as never, 1)).toThrow();
    expect(() =>
      debug.setPaddleVy(s, "left", Number.POSITIVE_INFINITY),
    ).toThrow();
    expect(() => debug.setPaddleDriven(s, "left", 1 as never)).toThrow();
  });
});

describe("the ball", () => {
  test("each field is posed on its own", () => {
    const s = base();
    expect(debug.setBallPosition(s, 10, 20).ball).toMatchObject({
      x: 10,
      y: 20,
    });
    expect(debug.setBallVelocity(s, 30, 40).ball).toMatchObject({
      vx: 30,
      vy: 40,
    });
    expect(debug.setBallSpin(s, -500).ball?.spin).toBe(-500);
    expect(debug.setBallHeld(s, false).ball?.held).toBe(false);
    expect(debug.setBallHoldTimer(s, 0).ball?.holdTimer).toBe(0);
    expect(debug.setBallServeSign(s, -1).ball?.serveSign).toBe(-1);
  });

  test("drawBallServeSign draws afresh and changes nothing else", () => {
    const s = debug.setBallVelocity(base(), 5, 6);
    const random = vi.spyOn(Math, "random");
    random.mockReturnValue(0.9);
    const down = debug.drawBallServeSign(s);
    expect(down.ball?.serveSign).toBe(-1);
    random.mockReturnValue(0.1);
    const up = debug.drawBallServeSign(s);
    expect(up.ball?.serveSign).toBe(1);
    random.mockRestore();
    expect(up.ball).toMatchObject({ vx: 5, vy: 6 });
  });

  test("an absent ball is no ball to set", () => {
    const s = debug.clearWorld(base());
    expect(() => debug.setBallPosition(s, 1, 1)).toThrow(/no ball/);
    expect(() => debug.setBallVelocity(s, 1, 1)).toThrow(/no ball/);
    expect(() => debug.setBallSpin(s, 1)).toThrow(/no ball/);
    expect(() => debug.setBallHeld(s, true)).toThrow(/no ball/);
    expect(() => debug.setBallHoldTimer(s, 1)).toThrow(/no ball/);
    expect(() => debug.setBallServeSign(s, 1)).toThrow(/no ball/);
    expect(() => debug.drawBallServeSign(s)).toThrow(/no ball/);
  });

  test("a bad ball value fails loudly", () => {
    const s = base();
    expect(() => debug.setBallServeSign(s, 0 as never)).toThrow(/sign/);
    expect(() => debug.setBallPosition(s, Number.NaN, 0)).toThrow();
    expect(() => debug.setBallHeld(s, "yes" as never)).toThrow();
  });
});

describe("the AI and audio", () => {
  test("the faculties and the mute bit", () => {
    const s = base();
    expect(debug.setAiTracking(s, false).ai).toEqual({
      tracking: false,
      movement: true,
    });
    expect(debug.setAiMovement(s, false).ai).toEqual({
      tracking: true,
      movement: false,
    });
    expect(debug.setMuted(s, true).muted).toBe(true);
    expect(() => debug.setAiTracking(s, 0 as never)).toThrow();
  });
});

describe("readings", () => {
  test("the snapshot carries the declared state and the derived speed", () => {
    let s = startMatch(base(), "versus");
    s = debug.setBallVelocity(s, 300, -400);
    s = debug.setBallSpin(s, 42);
    s = debug.setPaddleVy(s, "right", 11);
    const snap = debug.snapshot(s);
    expect(snap).toMatchObject({
      version: 1,
      screen: "countdown",
      mode: "versus",
      menuIndex: 0,
      titleIndex: 0,
      resumeScreen: "playing",
      score: { p1: 0, p2: 0 },
      winner: null,
      muted: false,
      receiver: "left",
      ai: { tracking: true, movement: true },
      simTime: 0,
    });
    expect(snap.paddles.right).toEqual({
      cy: FIELD_CY,
      vy: 0,
      drivenVy: 11,
      driven: false,
    });
    expect(snap.ball).toMatchObject({
      vx: 300,
      vy: -400,
      speed: 500,
      spin: 42,
      held: true,
      holdTimer: HOLD_TIME,
      trail: [],
    });
    expect(snap.obstacles).toEqual([
      { index: 0, cx: 490, cy: 220 },
      { index: 1, cx: 790, cy: 500 },
    ]);
    expect(snap).not.toHaveProperty("presses");
    // The snapshot is a copy: changing it changes nothing.
    (snap.obstacles as unknown as { index: number }[]).pop();
    expect(s.obstacles.length).toBe(2);
  });

  test("menuItemRect reports the region of the current menu's item", () => {
    const s = base();
    expect(debug.menuItemRect(s, 1)).toEqual(menuItemRect("title", 1));
    expect(debug.menuItemRect(s, 3)).toBeNull();
    expect(debug.menuItemRect(debug.setScreen(s, "playing"), 0)).toBeNull();
    expect(debug.menuItemRect(debug.setScreen(s, "countdown"), 0)).toBeNull();
    expect(debug.menuItemRect(debug.setScreen(s, "howto"), 0)).not.toBeNull();
    expect(
      debug.menuItemRect(debug.setScreen(s, "matchover"), 1),
    ).not.toBeNull();
  });
});
