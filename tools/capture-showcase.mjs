// Captures the showcase media into `showcase/`: screenshots of the running
// game and a gzipped replay of a rally, both taken from the real game in a
// headless Chromium over Vite's dev server.
//
//   node tools/capture-showcase.mjs
//
// The page is `tools/showcase-harness.html`, which exposes the engine on
// `window.carom`. Every scenario is posed through the game's own debug surface
// and advanced on a constant 60 Hz clock, so each capture is reproducible.

/* global window, console */

import { gzipSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "showcase");

/**
 * Runs inside the page: a scripted rally. Both paddles are driven by the
 * surface; each follows the ball with the lag and overshoot of a human hand so
 * its strikes carry spin, which is what curves the flight. Runs `frames`
 * frames, or until a point is scored when `stopOnPoint` is set, or until the
 * ball is curving hard past an obstacle when `freezeNearObstacle` is set. With
 * `record` set, the recorder is armed around the rally and the recording is
 * returned as JSON; otherwise a snapshot of the final state is returned.
 */
async function rally({
  frames,
  seed,
  stopOnPoint,
  freezeNearObstacle,
  record,
}) {
  const { engine } = window.carom;
  const debug = engine.debug;
  const apply = (f) => engine.apply((s) => f(debug, s));
  if (record) engine.startRecording();

  let random = seed;
  const next = () => {
    random = (random * 1664525 + 1013904223) % 4294967296;
    return random / 4294967296;
  };

  apply((d, s) => d.setMode(s, "versus"));
  apply((d, s) => d.setScore(s, 4, 3));
  apply((d, s) => d.setPaddleDriven(s, "left", true));
  apply((d, s) => d.setPaddleDriven(s, "right", true));
  apply((d, s) => d.setPaddleCy(s, "left", 300));
  apply((d, s) => d.setPaddleCy(s, "right", 420));
  apply((d, s) => d.setScreen(s, "playing"));
  apply((d, s) => d.spawnBall(s));
  apply((d, s) => d.setBallHeld(s, false));
  apply((d, s) => d.setBallVelocity(s, -520, -140));
  apply((d, s) => d.setBallSpin(s, 260));

  // Each paddle tracks the ball while it is far, then flicks through it as it
  // arrives: a full-speed sweep past the ball's line, so the paddle is still
  // moving at contact and the strike carries spin.
  const flick = { left: 0, right: 0 };
  const face = { left: 64, right: 1216 };
  for (let i = 0; i < frames; i += 1) {
    const snap = debug.snapshot(engine.state);
    if (snap.screen !== "playing" && stopOnPoint) break;
    const ball = snap.ball;
    if (ball !== null && freezeNearObstacle && i > 30) {
      const near = snap.obstacles.some(
        (o) => Math.hypot(ball.x - o.cx, ball.y - o.cy) < 130,
      );
      if (near && Math.abs(ball.spin) > 200 && ball.speed > 760) break;
    }
    if (ball !== null && snap.screen === "playing") {
      for (const side of ["left", "right"]) {
        const toward = side === "left" ? ball.vx < 0 : ball.vx > 0;
        const distance = Math.abs(ball.x - face[side]);
        const cy = snap.paddles[side].cy;
        let vy = 0;
        if (!toward) {
          flick[side] = 0;
          const diff = 360 - cy;
          vy =
            Math.abs(diff) < 10
              ? 0
              : Math.sign(diff) * Math.min(400, Math.abs(diff) * 6);
        } else if (distance > 260) {
          const diff = ball.y - cy;
          vy =
            Math.abs(diff) < 6
              ? 0
              : Math.sign(diff) * Math.min(720, Math.abs(diff) * 9);
        } else {
          if (flick[side] === 0) flick[side] = next() < 0.5 ? -1 : 1;
          // Sweep toward a point past the ball's line, never settling.
          const target = ball.y + flick[side] * 38;
          const diff = target - cy;
          vy = Math.sign(diff || flick[side]) * 720;
        }
        apply((d, s) => d.setPaddleVy(s, side, vy));
      }
    }
    await engine.advance(1);
  }
  if (record) return JSON.stringify(engine.stopRecording());
  return debug.snapshot(engine.state);
}

async function main() {
  await mkdir(out, { recursive: true });
  const server = await createServer({
    root,
    configFile: path.join(root, "vite.config.ts"),
    server: { port: 0, host: "127.0.0.1" },
    logLevel: "error",
  });
  await server.listen();
  const base = server.resolvedUrls.local[0];

  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.goto(`${base}tools/showcase-harness.html`);
  await page.evaluate(() => window.carom.ready);

  const shoot = async (name) => {
    await page.screenshot({ path: path.join(out, name), type: "png" });
    console.log(`wrote showcase/${name}`);
  };

  // The title screen.
  await shoot("title.png");

  // A rally frozen mid-flight, the ball curving between the obstacles.
  const frozen = await page.evaluate(rally, {
    frames: 1800,
    seed: 7,
    stopOnPoint: false,
    freezeNearObstacle: true,
    record: false,
  });
  console.log(
    `rally frozen on ${frozen.screen} at ${frozen.score.p1}-${frozen.score.p2}, spin ${frozen.ball?.spin.toFixed(0)}`,
  );
  await shoot("rally.png");

  // The how-to screen, which names the controls and the mechanics.
  await page.evaluate(() => {
    const { engine } = window.carom;
    engine.apply((s) => engine.debug.reset(s));
    engine.apply((s) => engine.debug.setScreen(s, "howto"));
    return engine.advance(1);
  });
  await shoot("howto.png");

  // A replay of a few seconds of the rally.
  await page.evaluate(() => {
    const { engine } = window.carom;
    engine.apply((s) => engine.debug.reset(s));
  });
  const recording = await page.evaluate(rally, {
    frames: 360,
    seed: 11,
    stopOnPoint: false,
    freezeNearObstacle: false,
    record: true,
  });
  await writeFile(path.join(out, "rally.json.gz"), gzipSync(recording));
  const replay = JSON.parse(recording);
  const after = await page.evaluate(() => {
    const { engine } = window.carom;
    return engine.debug.snapshot(engine.state);
  });
  console.log(
    `wrote showcase/rally.json.gz: ${replay.frames.length} frames, ending on ${after.screen} at ${after.score.p1}-${after.score.p2}`,
  );

  await browser.close();
  await server.close();
}

await main();
