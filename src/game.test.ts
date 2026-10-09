import { describe, expect, test } from "vitest";
import { TOUCH_LAYOUTS } from "@clockwyrks/simple-2d";
import {
  ACTIONS,
  CUES,
  FIELD_CY,
  HOLD_TIME,
  LAYOUT,
  PADDLE_SPEED,
  SERVE_SPEED,
} from "./constants";
import { BACKGROUND } from "./game";
import { createHarness } from "./testing/harness";

describe("the game on the engine", () => {
  test("initialize builds the title state and the debug surface", async () => {
    const h = await createHarness();
    const snap = h.debug.snapshot(h.engine.state);
    expect(snap).toMatchObject({
      version: 1,
      screen: "title",
      mode: "solo",
      menuIndex: 0,
      titleIndex: 0,
      resumeScreen: "playing",
      score: { p1: 0, p2: 0 },
      winner: null,
      muted: false,
      receiver: "left",
      simTime: 0,
    });
    expect(snap.ball).toMatchObject({
      x: 640,
      y: 360,
      held: true,
      holdTimer: HOLD_TIME,
    });
    expect(snap.obstacles.length).toBe(2);
    expect(ACTIONS).toEqual(TOUCH_LAYOUTS[LAYOUT].actions);
    expect(BACKGROUND).toMatch(/^#[0-9a-f]{6}$/i);
    expect(h.engine.diagnostics().map((d) => d.name)).toEqual(
      expect.arrayContaining([
        "screen",
        "mode",
        "score",
        "ball pos",
        "ball vel",
        "ball speed",
        "ball spin",
        "left paddle",
        "right paddle",
      ]),
    );
    for (const reading of h.engine.diagnostics())
      expect(reading.error).toBeUndefined();
    h.engine.destroy();
  });

  test("the diagnostics read the state current at the read", async () => {
    const h = await createHarness();
    h.engine.apply((s) => h.debug.setScreen(s, "paused"));
    h.engine.apply((s) => h.debug.setScore(s, 4, 2));
    const byName = Object.fromEntries(
      h.engine.diagnostics().map((d) => [d.name, d.value]),
    );
    expect(byName.screen).toBe("paused");
    expect(byName.score).toBe("4 - 2");
    h.engine.apply((s) => h.debug.clearWorld(s));
    const cleared = Object.fromEntries(
      h.engine.diagnostics().map((d) => [d.name, d.value]),
    );
    expect(cleared["ball pos"]).toBe("-");
    expect(cleared["ball speed"]).toBe("-");
    h.engine.destroy();
  });

  test("keys drive the menus and a match", async () => {
    const h = await createHarness();
    h.tap("ArrowDown");
    await h.advance(1);
    expect(h.engine.state.menuIndex).toBe(1);
    h.tap("Enter");
    await h.advance(1);
    expect(h.engine.state.screen).toBe("countdown");
    expect(h.engine.state.mode).toBe("versus");

    h.keyDown("KeyW");
    h.keyDown("ArrowDown");
    await h.advance(6);
    h.keyUp("KeyW");
    h.keyUp("ArrowDown");
    const { paddles } = h.engine.state;
    expect(paddles.left.cy).toBeCloseTo(FIELD_CY - PADDLE_SPEED * 0.1);
    expect(paddles.right.cy).toBeCloseTo(FIELD_CY + PADDLE_SPEED * 0.1);

    await h.run(HOLD_TIME);
    expect(h.engine.state.screen).toBe("playing");
    expect(h.debug.snapshot(h.engine.state).ball?.speed).toBeCloseTo(
      SERVE_SPEED,
    );

    h.tap("Escape");
    await h.advance(1);
    expect(h.engine.state.screen).toBe("paused");
    h.tap("Escape");
    await h.advance(1);
    expect(h.engine.state.screen).toBe("playing");
    h.tap("KeyP");
    await h.advance(1);
    expect(h.engine.state.screen).toBe("paused");
    h.engine.destroy();
  });

  test("the mute key and the mute pose both reach the runtime's bit", async () => {
    const h = await createHarness();
    h.tap("KeyM");
    await h.advance(1);
    expect(h.engine.state.muted).toBe(true);
    h.engine.apply((s) => h.debug.setMuted(s, false));
    expect(h.debug.snapshot(h.engine.state).muted).toBe(false);
    await h.advance(1);
    expect(h.engine.state.muted).toBe(false);
    h.engine.apply((s) => h.debug.setMuted(s, true));
    h.tap("KeyM");
    await h.advance(1);
    expect(h.engine.state.muted).toBe(false);
    h.engine.apply((s) => h.debug.reset(s));
    expect(h.engine.state.muted).toBe(false);
    h.engine.destroy();
  });

  test("a muted game still raises its cues, silently", async () => {
    const h = await createHarness({ render: false });
    h.engine.apply((s) => h.debug.setMuted(s, true));
    h.engine.apply((s) => h.debug.setScreen(s, "playing"));
    h.engine.apply((s) => h.debug.setBallHeld(s, false));
    h.engine.apply((s) => h.debug.setBallPosition(s, 300, 20));
    h.engine.apply((s) => h.debug.setBallVelocity(s, 0, -600));
    await h.advance(2);
    expect(h.cues).toContain(CUES.wallBounce);
    h.engine.destroy();
  });

  test("a posed rally bounces off a driven paddle with spin", async () => {
    const h = await createHarness({ render: false });
    h.engine.apply((s) => h.debug.setMode(s, "versus"));
    h.engine.apply((s) => h.debug.setScreen(s, "playing"));
    h.engine.apply((s) => h.debug.setBallHeld(s, false));
    h.engine.apply((s) => h.debug.setBallPosition(s, 120, 360));
    h.engine.apply((s) => h.debug.setBallVelocity(s, -500, 0));
    h.engine.apply((s) => h.debug.setPaddleDriven(s, "left", true));
    h.engine.apply((s) => h.debug.setPaddleVy(s, "left", 200));
    expect(h.debug.snapshot(h.engine.state).paddles.left).toMatchObject({
      driven: true,
      drivenVy: 200,
      vy: 0,
    });
    await h.advance(1);
    expect(h.debug.snapshot(h.engine.state).paddles.left.vy).toBe(200);
    await h.advance(12);
    const ball = h.debug.snapshot(h.engine.state).ball!;
    expect(ball.vx).toBeGreaterThan(0);
    expect(ball.spin).toBeGreaterThan(0);
    expect(h.cues).toContain(CUES.paddleHit);
    h.engine.destroy();
  });

  test("the AI defends and scores in solo while the player stands still", async () => {
    const h = await createHarness({ render: false });
    h.tap("Enter");
    await h.advance(1);
    await h.run(20);
    const snap = h.debug.snapshot(h.engine.state);
    expect(snap.score.p2).toBeGreaterThan(0);
    expect(h.cues.filter((c) => c === CUES.score).length).toBe(
      snap.score.p1 + snap.score.p2,
    );
    h.engine.destroy();
  });

  test("a match ends on the win rule and PLAY AGAIN restarts it", async () => {
    const h = await createHarness({ render: false });
    h.engine.apply((s) => h.debug.setMode(s, "versus"));
    h.engine.apply((s) => h.debug.setScore(s, 10, 3));
    h.engine.apply((s) => h.debug.setScreen(s, "playing"));
    h.engine.apply((s) => h.debug.setBallHeld(s, false));
    h.engine.apply((s) => h.debug.setBallPosition(s, 1250, 600));
    h.engine.apply((s) => h.debug.setBallVelocity(s, 900, 0));
    h.engine.apply((s) => h.debug.setPaddleCy(s, "right", 100));
    await h.advance(5);
    expect(h.engine.state.screen).toBe("matchover");
    expect(h.engine.state.winner).toBe("left");
    expect(h.engine.state.score).toEqual({ p1: 11, p2: 3 });
    h.tap("Space");
    await h.advance(1);
    expect(h.engine.state.screen).toBe("countdown");
    expect(h.engine.state.score).toEqual({ p1: 0, p2: 0 });
    h.engine.destroy();
  });

  test("a pointer tap confirms a menu item through the engine", async () => {
    const h = await createHarness();
    const r = h.debug.menuItemRect(h.engine.state, 2)!;
    h.pointer("pointermove", r.x + 5, r.y + 5);
    await h.advance(1);
    expect(h.engine.state.menuIndex).toBe(2);
    h.pointer("pointerdown", r.x + 5, r.y + 5);
    await h.advance(1);
    expect(h.engine.state.screen).toBe("title");
    h.pointer("pointerup", r.x + 6, r.y + 6);
    await h.advance(1);
    expect(h.engine.state.screen).toBe("howto");
    const back = h.debug.menuItemRect(h.engine.state, 0)!;
    h.pointer("pointerdown", back.x + 5, back.y + 5, {
      pointerType: "touch",
      id: 4,
    });
    h.pointer("pointerup", back.x + 5, back.y + 5, {
      pointerType: "touch",
      id: 4,
    });
    await h.advance(1);
    expect(h.engine.state.screen).toBe("title");
    expect(h.engine.state.menuIndex).toBe(2);
    h.engine.destroy();
  });

  test("the recorder captures the frames the game draws", async () => {
    const h = await createHarness();
    h.engine.startRecording();
    await h.advance(3);
    const recording = h.engine.stopRecording();
    expect(recording.frames.length).toBe(3);
    expect(recording.width).toBe(1280);
    expect(recording.ops.length).toBeGreaterThan(10);
    h.engine.destroy();
  });

  test("two step sizes reach the same rally", async () => {
    const drive = async (stepMs: number) => {
      const h = await createHarness({ stepMs, render: false });
      h.engine.apply((s) => h.debug.setMode(s, "versus"));
      h.engine.apply((s) => h.debug.setPaddleDriven(s, "left", true));
      h.engine.apply((s) => h.debug.setPaddleDriven(s, "right", true));
      h.engine.apply((s) => h.debug.setPaddleCy(s, "left", 320));
      h.engine.apply((s) => h.debug.setPaddleCy(s, "right", 380));
      h.engine.apply((s) => h.debug.setScreen(s, "playing"));
      h.engine.apply((s) => h.debug.setBallHeld(s, false));
      h.engine.apply((s) => h.debug.setBallPosition(s, 640, 360));
      h.engine.apply((s) => h.debug.setBallVelocity(s, 600, -300));
      h.engine.apply((s) => h.debug.setBallSpin(s, 400));
      while (
        h.engine.state.screen === "playing" &&
        h.engine.frame().timeMs < 10000
      ) {
        await h.advance(1);
      }
      const snap = h.debug.snapshot(h.engine.state);
      h.engine.destroy();
      return {
        cues: [...h.cues],
        score: snap.score,
        time: h.engine.frame().timeMs,
      };
    };
    const fine = await drive(2);
    const coarse = await drive(16);
    expect(fine.cues).toEqual(coarse.cues);
    expect(fine.score).toEqual(coarse.score);
    expect(Math.abs(fine.time - coarse.time) / fine.time).toBeLessThan(0.08);
  }, 20000);
});
