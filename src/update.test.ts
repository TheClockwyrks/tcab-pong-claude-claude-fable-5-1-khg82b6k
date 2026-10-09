import { describe, expect, test } from "vitest";
import {
  BALL_R,
  CUES,
  FIELD_CY,
  FIELD_W,
  HOLD_TIME,
  PADDLE_SPEED,
  TRAIL_TIME,
  WIN_SCORE,
} from "./constants";
import type { ActionName } from "./constants";
import type { CaromState, Screen } from "./game";
import { idleInput, type FrameInput, type PointerEvent } from "./input";
import { menuItemRect } from "./menu";
import { advanceFrame, scorePoint } from "./update";
import { parkedBall, startMatch, titleState } from "./world";

const DT = 1 / 60;

function input(
  patch: {
    pressed?: Partial<Record<ActionName, boolean>>;
    held?: Partial<FrameInput["held"]>;
    pointer?: PointerEvent[];
    muted?: boolean;
  } = {},
): FrameInput {
  const idle = idleInput(patch.muted ?? false);
  return {
    held: { ...idle.held, ...patch.held },
    pressed: { ...idle.pressed, ...patch.pressed },
    pointer: patch.pointer ?? [],
    muted: idle.muted,
  };
}

function press(...actions: ActionName[]): FrameInput {
  const pressed: Partial<Record<ActionName, boolean>> = {};
  for (const action of actions) pressed[action] = true;
  return input({ pressed });
}

/** Advances `state` by `frames` idle frames of `dt`. */
function idle(state: CaromState, frames: number, dt = DT): CaromState {
  let next = state;
  for (let i = 0; i < frames; i += 1) {
    next = advanceFrame(next, idleInput(), dt).state;
  }
  return next;
}

function at(screen: Screen, patch: Partial<CaromState> = {}): CaromState {
  return { ...titleState(false), screen, ...patch };
}

describe("time and sound", () => {
  test("simTime accumulates on every screen, the paused one included", () => {
    for (const screen of ["title", "howto", "paused", "matchover"] as const) {
      const next = advanceFrame(at(screen, { simTime: 1 }), idleInput(), 0.25);
      expect(next.state.simTime).toBeCloseTo(1.25);
      expect(next.state.screen).toBe(screen);
    }
  });

  test("the mute edge toggles the bit on any screen and the state mirrors it", () => {
    const on = advanceFrame(at("title"), press("mute"), DT);
    expect(on.muted).toBe(true);
    expect(on.state.muted).toBe(true);
    const off = advanceFrame(on.state, { ...press("mute"), muted: true }, DT);
    expect(off.muted).toBe(false);
    const held = advanceFrame(at("playing"), input({ muted: true }), DT);
    expect(held.muted).toBe(true);
  });
});

describe("the title menu", () => {
  test("up and down move the selection with wrapping", () => {
    let s = at("title");
    s = advanceFrame(s, press("p1-up"), DT).state;
    expect(s.menuIndex).toBe(2);
    s = advanceFrame(s, press("p2-down"), DT).state;
    expect(s.menuIndex).toBe(0);
    s = advanceFrame(s, press("p2-down"), DT).state;
    expect(s.menuIndex).toBe(1);
  });

  test("up beats down, and movement beats confirm, on one frame", () => {
    const both = advanceFrame(
      at("title", { menuIndex: 1 }),
      press("p1-up", "p1-down"),
      DT,
    );
    expect(both.state.menuIndex).toBe(0);
    const move = advanceFrame(at("title"), press("p1-down", "confirm"), DT);
    expect(move.state.screen).toBe("title");
    expect(move.state.menuIndex).toBe(1);
  });

  test("SOLO starts a solo match and remembers the selection", () => {
    const next = advanceFrame(at("title"), press("confirm"), DT).state;
    expect(next.screen).toBe("countdown");
    expect(next.mode).toBe("solo");
    expect(next.titleIndex).toBe(0);
    expect(next.menuIndex).toBe(0);
    expect(next.resumeScreen).toBe("playing");
    expect(next.score).toEqual({ p1: 0, p2: 0 });
    expect(next.receiver).toBe("left");
    expect(next.ball?.held).toBe(true);
    // The countdown frame the confirm left the game on already ran.
    expect(next.ball?.holdTimer).toBeCloseTo(HOLD_TIME - DT);
  });

  test("VERSUS starts a versus match", () => {
    const next = advanceFrame(
      at("title", { menuIndex: 1 }),
      press("confirm"),
      DT,
    ).state;
    expect(next.mode).toBe("versus");
    expect(next.titleIndex).toBe(1);
  });

  test("HOW TO PLAY opens the how-to screen, and either edge returns", () => {
    const howto = advanceFrame(
      at("title", { menuIndex: 2 }),
      press("confirm"),
      DT,
    ).state;
    expect(howto.screen).toBe("howto");
    expect(howto.menuIndex).toBe(0);
    expect(howto.titleIndex).toBe(2);
    const back = advanceFrame(howto, press("back"), DT).state;
    expect(back.screen).toBe("title");
    expect(back.menuIndex).toBe(2);
    const confirmed = advanceFrame(howto, press("confirm"), DT).state;
    expect(confirmed.screen).toBe("title");
  });

  test("back does nothing on the title", () => {
    const next = advanceFrame(
      at("title", { menuIndex: 1 }),
      press("back"),
      DT,
    ).state;
    expect(next.screen).toBe("title");
    expect(next.menuIndex).toBe(1);
  });

  test("a pointer hovers and taps the menu", () => {
    const r = menuItemRect("title", 1)!;
    const hovered = advanceFrame(
      at("title"),
      input({ pointer: [{ type: "move", id: 1, x: r.x + 2, y: r.y + 2 }] }),
      DT,
    ).state;
    expect(hovered.menuIndex).toBe(1);
    const tapped = advanceFrame(
      hovered,
      input({
        pointer: [
          { type: "down", id: 1, x: r.x + 2, y: r.y + 2 },
          { type: "up", id: 1, x: r.x + 2, y: r.y + 2 },
        ],
      }),
      DT,
    ).state;
    expect(tapped.screen).toBe("countdown");
    expect(tapped.mode).toBe("versus");
    expect(tapped.titleIndex).toBe(1);
    expect(tapped.presses).toEqual([]);
  });

  test("a keyboard movement edge yields the selection to the pointer", () => {
    const r = menuItemRect("title", 2)!;
    const next = advanceFrame(
      at("title"),
      input({
        pressed: { "p1-down": true },
        pointer: [{ type: "move", id: 1, x: r.x + 2, y: r.y + 2 }],
      }),
      DT,
    ).state;
    expect(next.menuIndex).toBe(2);
  });

  test("a keyboard confirm beats a pointer confirm on the same frame", () => {
    const r = menuItemRect("title", 2)!;
    const next = advanceFrame(
      at("title"),
      input({
        pressed: { confirm: true },
        pointer: [
          { type: "down", id: 1, x: r.x + 2, y: r.y + 2 },
          { type: "up", id: 1, x: r.x + 2, y: r.y + 2 },
        ],
      }),
      DT,
    ).state;
    expect(next.screen).toBe("countdown");
    expect(next.titleIndex).toBe(0);
  });
});

describe("pausing", () => {
  const live = startMatch(titleState(false), "versus");

  test("pause on countdown or playing opens the menu over the frozen field", () => {
    const paused = advanceFrame(live, press("pause"), DT).state;
    expect(paused.screen).toBe("paused");
    expect(paused.resumeScreen).toBe("countdown");
    expect(paused.menuIndex).toBe(0);
    expect(paused.ball?.holdTimer).toBe(HOLD_TIME);

    const flying = { ...live, screen: "playing" as const };
    const pausedFlying = advanceFrame(flying, press("pause"), DT).state;
    expect(pausedFlying.resumeScreen).toBe("playing");
  });

  test("Escape raises pause and back together: one press pauses, the next resumes", () => {
    const paused = advanceFrame(live, press("pause", "back"), DT).state;
    expect(paused.screen).toBe("paused");
    const resumed = advanceFrame(paused, press("pause", "back"), DT).state;
    expect(resumed.screen).toBe("countdown");
  });

  test("the paused frame freezes the paddles, ball, and hold", () => {
    const paused = { ...live, screen: "paused" as const };
    const held = input({ held: { "p1-up": 1 } });
    const next = advanceFrame(paused, held, DT).state;
    expect(next.paddles.left.cy).toBe(FIELD_CY);
    expect(next.ball).toEqual(live.ball);
  });

  test("pause or back resumes before the menu edges are read", () => {
    const paused = {
      ...live,
      screen: "paused" as const,
      resumeScreen: "countdown" as const,
      menuIndex: 2,
    };
    const next = advanceFrame(
      paused,
      press("back", "confirm", "p1-down"),
      DT,
    ).state;
    expect(next.screen).toBe("countdown");
    expect(next.menuIndex).toBe(2);
  });

  test("the pause menu's items", () => {
    const paused = {
      ...live,
      screen: "paused" as const,
      score: { p1: 3, p2: 4 },
    };
    const resumed = advanceFrame(paused, press("confirm"), DT).state;
    expect(resumed.screen).toBe("playing");
    expect(resumed.score).toEqual({ p1: 3, p2: 4 });

    const down = advanceFrame(paused, press("p2-down"), DT).state;
    expect(down.menuIndex).toBe(1);
    const restarted = advanceFrame(down, press("confirm"), DT).state;
    expect(restarted.screen).toBe("countdown");
    expect(restarted.score).toEqual({ p1: 0, p2: 0 });
    expect(restarted.mode).toBe("versus");

    const up = advanceFrame(paused, press("p1-up"), DT).state;
    expect(up.menuIndex).toBe(2);
    const quit = advanceFrame(up, press("confirm"), DT).state;
    expect(quit.screen).toBe("title");
    expect(quit.score).toEqual({ p1: 0, p2: 0 });
    expect(quit.mode).toBe("solo");
  });
});

describe("the countdown and the serve", () => {
  test("the hold counts down and serves on the frame it elapses", () => {
    let s = startMatch(titleState(false), "versus");
    const frames = Math.ceil(HOLD_TIME / DT);
    s = idle(s, frames - 1);
    expect(s.screen).toBe("countdown");
    expect(s.ball?.held).toBe(true);
    s = idle(s, 1);
    expect(s.screen).toBe("playing");
    expect(s.ball?.held).toBe(false);
    expect(s.ball?.holdTimer).toBe(0);
    expect(s.ball?.vx).toBeLessThan(0);
    // The ball is not advanced on the frame it is served.
    expect(s.ball?.x).toBe(640);
    const flown = idle(s, 1);
    expect(flown.ball!.x).toBeLessThan(640);
  });

  test("the paddles move during the countdown", () => {
    const s = startMatch(titleState(false), "versus");
    const next = advanceFrame(s, input({ held: { "p2-up": 1 } }), 0.1).state;
    expect(next.paddles.right.cy).toBeCloseTo(FIELD_CY - PADDLE_SPEED * 0.1);
    expect(next.paddles.right.vy).toBe(-PADDLE_SPEED);
  });

  test("a hold timer posed to zero serves on the next frame", () => {
    const s = startMatch(titleState(false), "solo");
    const posed = {
      ...s,
      ball: { ...s.ball!, holdTimer: 0, serveSign: -1 as const },
    };
    const next = idle(posed, 1);
    expect(next.screen).toBe("playing");
    expect(next.ball?.vy).toBeLessThan(0);
  });

  test("a countdown with no ball waits", () => {
    const s = { ...startMatch(titleState(false), "solo"), ball: null };
    expect(idle(s, 100).screen).toBe("countdown");
  });
});

describe("scoring", () => {
  test("a ball past the right edge scores for the left and parks for the next hold", () => {
    const s = at("playing", {
      mode: "versus",
      ball: {
        ...parkedBall(1),
        held: false,
        x: FIELD_W - BALL_R - 1,
        y: 300,
        vx: 600,
        vy: 0,
      },
      receiver: "left",
    });
    const next = advanceFrame(s, idleInput(), 0.05);
    expect(next.cues).toContain(CUES.score);
    expect(next.state.score).toEqual({ p1: 1, p2: 0 });
    expect(next.state.screen).toBe("countdown");
    expect(next.state.receiver).toBe("right");
    expect(next.state.ball).toMatchObject({
      x: 640,
      y: 360,
      vx: 0,
      vy: 0,
      held: true,
      holdTimer: HOLD_TIME,
      spin: 0,
    });
  });

  test("a ball past the left edge scores for the right", () => {
    const s = at("playing", {
      ball: {
        ...parkedBall(1),
        held: false,
        x: BALL_R + 1,
        y: 300,
        vx: -600,
        vy: 0,
      },
    });
    const next = advanceFrame(s, idleInput(), 0.05).state;
    expect(next.score).toEqual({ p1: 0, p2: 1 });
    expect(next.receiver).toBe("left");
  });

  test("the win rule needs WIN_SCORE and a two point lead", () => {
    const base = at("playing");
    const won = scorePoint(
      { ...base, score: { p1: WIN_SCORE - 1, p2: 5 } },
      "left",
    );
    expect(won.screen).toBe("matchover");
    expect(won.winner).toBe("left");
    expect(won.menuIndex).toBe(0);
    expect(won.ball).toBe(base.ball);

    const deuce = scorePoint({ ...base, score: { p1: 10, p2: 10 } }, "right");
    expect(deuce.screen).toBe("countdown");
    expect(deuce.winner).toBeNull();
    const advantage = scorePoint(deuce, "right");
    expect(advantage.screen).toBe("matchover");
    expect(advantage.winner).toBe("right");
    expect(advantage.score).toEqual({ p1: 10, p2: 12 });
  });

  test("the match-over screen's items and back", () => {
    const over = at("matchover", {
      mode: "versus",
      winner: "left",
      score: { p1: 11, p2: 3 },
    });
    const again = advanceFrame(over, press("confirm"), DT).state;
    expect(again.screen).toBe("countdown");
    expect(again.mode).toBe("versus");
    expect(again.winner).toBeNull();
    const menu = advanceFrame(
      { ...over, menuIndex: 1 },
      press("confirm"),
      DT,
    ).state;
    expect(menu.screen).toBe("title");
    expect(menu.winner).toBeNull();
    const back = advanceFrame(over, press("back"), DT).state;
    expect(back.screen).toBe("title");
    const moved = advanceFrame(over, press("p1-down"), DT).state;
    expect(moved.menuIndex).toBe(1);
    expect(advanceFrame(moved, press("p2-down"), DT).state.menuIndex).toBe(0);
  });

  test("returning to the title keeps titleIndex, simTime, and muted", () => {
    const over = at("matchover", {
      titleIndex: 2,
      simTime: 40,
      muted: true,
      obstacles: [],
      ball: null,
      paddles: {
        left: { cy: 100, vy: 0, driven: true, drivenVy: 50 },
        right: { cy: 600, vy: 0, driven: false, drivenVy: 0 },
      },
      ai: { tracking: false, movement: false },
    });
    const title = advanceFrame(
      over,
      { ...press("back"), muted: true },
      DT,
    ).state;
    expect(title).toMatchObject({
      screen: "title",
      titleIndex: 2,
      menuIndex: 2,
      muted: true,
      ai: { tracking: true, movement: true },
    });
    expect(title.simTime).toBeCloseTo(40 + DT);
    expect(title.obstacles.length).toBe(2);
    expect(title.ball?.held).toBe(true);
    expect(title.paddles.left).toEqual({
      cy: FIELD_CY,
      vy: 0,
      driven: false,
      drivenVy: 0,
    });
  });
});

describe("the live frame", () => {
  test("the trail records a sample every live frame and drops stale ones", () => {
    let s = startMatch(titleState(false), "versus");
    s = idle(s, 3);
    expect(s.ball?.trail.length).toBe(3);
    s = idle(s, 120);
    for (const sample of s.ball!.trail) {
      expect(s.simTime - sample.t).toBeLessThanOrEqual(TRAIL_TIME + 1e-9);
    }
    expect(s.ball!.trail.length).toBeGreaterThan(2);
  });

  test("the cues of a frame are raised once each", () => {
    const s = at("playing", {
      ball: {
        ...parkedBall(1),
        held: false,
        x: 300,
        y: BALL_R + 2,
        vx: 0,
        vy: -900,
      },
    });
    const next = advanceFrame(s, idleInput(), 0.05);
    expect(next.cues).toEqual([CUES.wallBounce]);
  });

  test("a paddle hit raises its cue and sends the ball back", () => {
    const s = at("playing", {
      mode: "versus",
      ball: { ...parkedBall(1), held: false, x: 90, y: 360, vx: -600, vy: 0 },
    });
    const next = advanceFrame(s, input({ held: { "p1-down": 1 } }), 0.05);
    expect(next.cues).toEqual([CUES.paddleHit]);
    expect(next.state.ball!.vx).toBeGreaterThan(0);
    expect(next.state.ball!.spin).toBeGreaterThan(0);
  });

  test("a playing frame with no ball moves the paddles alone", () => {
    const s = at("playing", { mode: "versus", ball: null });
    const next = advanceFrame(s, input({ held: { "p1-down": 1 } }), 0.1);
    expect(next.state.paddles.left.cy).toBeGreaterThan(FIELD_CY);
    expect(next.state.ball).toBeNull();
    expect(next.cues).toEqual([]);
  });
});

describe("delta-time independence", () => {
  test("a rally reaches the same contacts under 2 ms and 16 ms frames", () => {
    const start: CaromState = {
      ...startMatch(titleState(false), "versus"),
      screen: "playing",
      paddles: {
        left: { cy: 300, vy: 0, driven: true, drivenVy: 0 },
        right: { cy: 400, vy: 0, driven: true, drivenVy: 0 },
      },
      ball: {
        ...parkedBall(1),
        held: false,
        x: 640,
        y: 360,
        vx: -700,
        vy: -260,
        spin: 350,
      },
    };
    const drive = (dt: number) => {
      let s = start;
      const cues: string[] = [];
      let time = 0;
      while (s.screen === "playing" && time < 10) {
        const r = advanceFrame(s, idleInput(), dt);
        cues.push(...r.cues);
        s = r.state;
        time += dt;
      }
      return { s, cues, time };
    };
    const fine = drive(0.002);
    const coarse = drive(0.016);
    expect(fine.cues).toEqual(coarse.cues);
    expect(fine.s.score).toEqual(coarse.s.score);
    expect(Math.abs(fine.time - coarse.time) / fine.time).toBeLessThan(0.08);
  });
});
