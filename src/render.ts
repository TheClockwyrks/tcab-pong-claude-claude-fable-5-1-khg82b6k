// Drawing Carom: the field and its furniture, the live match, and each menu
// screen, all in logical 1280x720 units on the context the engine hands over.

import {
  BALL_R,
  FIELD_CX,
  FIELD_CY,
  FIELD_H,
  FIELD_W,
  HOLD_TIME,
  NET_X,
  OBSTACLE_H,
  OBSTACLE_W,
  P1_X0,
  P2_X0,
  PADDLE_H,
  PADDLE_W,
  TITLE_TEXT,
} from "./constants";
import type { BallState, CaromView, Screen, Side } from "./game";
import { menuItemRect, menuItems } from "./menu";

export const BACKGROUND_COLOR = "#0a0e1a";

const PALETTE = {
  left: "#4fe3ff",
  right: "#ff7a59",
  ball: "#fff3b0",
  obstacle: "#b48cff",
  accent: "#ffd166",
  text: "#e8ecf8",
  muted: "rgba(232, 236, 248, 0.55)",
  line: "rgba(140, 160, 200, 0.22)",
  net: "rgba(170, 190, 230, 0.38)",
  dim: "rgba(10, 14, 26, 0.74)",
} as const;

const FONT = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

type Ctx = CanvasRenderingContext2D;

function font(size: number, weight = 700): string {
  return `${weight} ${size}px ${FONT}`;
}

function text(
  ctx: Ctx,
  copy: string,
  x: number,
  y: number,
  size: number,
  color: string,
  options: { weight?: number; align?: CanvasTextAlign; glow?: string } = {},
): void {
  ctx.font = font(size, options.weight ?? 700);
  ctx.fillStyle = color;
  ctx.textAlign = options.align ?? "center";
  ctx.textBaseline = "middle";
  setGlow(ctx, options.glow ?? null, size * 0.6);
  ctx.fillText(copy, x, y);
  setGlow(ctx, null);
}

/**
 * Turns the context's shadow into a glow of `color`, or off for `null`. Only
 * the large headline text uses it: a blurred shadow is costly on a CPU
 * rasterizer, so the bodies on the field glow through layered halos instead.
 * Styles are set and reset explicitly rather than bracketed in `save` and
 * `restore`; the engine brackets the whole frame.
 */
function setGlow(ctx: Ctx, color: string | null, blur = 0): void {
  if (color === null) {
    ctx.shadowBlur = 0;
    ctx.shadowColor = "rgba(0, 0, 0, 0)";
  } else {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
  }
}

/**
 * A solid rounded body wearing a glow: a few translucent halos behind it,
 * each a little larger and fainter. Halos are plain fills, which keeps the glow
 * cheap on a CPU rasterizer where a blurred shadow is not.
 */
function glowRoundRect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  color: string,
  glow: number,
): void {
  ctx.fillStyle = color;
  for (let k = HALO_LAYERS; k >= 1; k -= 1) {
    const spread = (glow * k) / HALO_LAYERS;
    ctx.globalAlpha = HALO_ALPHA;
    ctx.beginPath();
    ctx.roundRect(
      x - spread,
      y - spread,
      w + spread * 2,
      h + spread * 2,
      radius + spread,
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();
}

/** A solid disc wearing the same layered glow. */
function glowDisc(
  ctx: Ctx,
  x: number,
  y: number,
  radius: number,
  color: string,
  glow: number,
): void {
  ctx.fillStyle = color;
  for (let k = HALO_LAYERS; k >= 1; k -= 1) {
    ctx.globalAlpha = HALO_ALPHA;
    ctx.beginPath();
    ctx.arc(x, y, radius + (glow * k) / HALO_LAYERS, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

const HALO_LAYERS = 3;
const HALO_ALPHA = 0.11;
const COURT_INSET = 22;

// ---- The field ------------------------------------------------------------

function drawFieldLines(ctx: Ctx): void {
  // A court line inset from the walls, with a tick at each corner.
  ctx.strokeStyle = PALETTE.line;
  ctx.lineWidth = 2;
  ctx.strokeRect(
    COURT_INSET,
    COURT_INSET,
    FIELD_W - COURT_INSET * 2,
    FIELD_H - COURT_INSET * 2,
  );
  ctx.fillStyle = PALETTE.net;
  for (const x of [COURT_INSET, FIELD_W - COURT_INSET]) {
    for (const y of [COURT_INSET, FIELD_H - COURT_INSET]) {
      ctx.fillRect(x - 3, y - 3, 6, 6);
    }
  }

  // The solid walls, top and bottom.
  ctx.fillStyle = PALETTE.net;
  ctx.fillRect(0, 0, FIELD_W, 3);
  ctx.fillRect(0, FIELD_H - 3, FIELD_W, 3);

  // The goals, left and right, drawn open.
  ctx.strokeStyle = PALETTE.line;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 10]);
  ctx.beginPath();
  ctx.moveTo(1, 0);
  ctx.lineTo(1, FIELD_H);
  ctx.moveTo(FIELD_W - 1, 0);
  ctx.lineTo(FIELD_W - 1, FIELD_H);
  ctx.stroke();

  // The dashed center net.
  ctx.strokeStyle = PALETTE.net;
  ctx.lineWidth = 4;
  ctx.setLineDash([16, 14]);
  ctx.lineDashOffset = 8;
  ctx.beginPath();
  ctx.moveTo(NET_X, 0);
  ctx.lineTo(NET_X, FIELD_H);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}

function drawPaddle(ctx: Ctx, side: Side, cy: number): void {
  const x = side === "left" ? P1_X0 : P2_X0;
  glowRoundRect(
    ctx,
    x,
    cy - PADDLE_H / 2,
    PADDLE_W,
    PADDLE_H,
    7,
    PALETTE[side],
    18,
  );
}

function drawObstacles(ctx: Ctx, state: CaromView): void {
  for (const obstacle of state.obstacles) {
    glowRoundRect(
      ctx,
      obstacle.cx - OBSTACLE_W / 2,
      obstacle.cy - OBSTACLE_H / 2,
      OBSTACLE_W,
      OBSTACLE_H,
      9,
      PALETTE.obstacle,
      14,
    );
  }
}

function drawTrail(ctx: Ctx, ball: BallState): void {
  const points = [...ball.trail, { x: ball.x, y: ball.y }];
  if (points.length < 2) return;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const last = points.length - 1;
  for (let i = 1; i <= last; i += 1) {
    const age = i / last;
    ctx.strokeStyle = `rgba(255, 243, 176, ${(0.08 + 0.5 * age).toFixed(3)})`;
    ctx.lineWidth = 2 + age * BALL_R * 1.5;
    ctx.beginPath();
    ctx.moveTo(points[i - 1].x, points[i - 1].y);
    ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
}

function drawBall(ctx: Ctx, ball: BallState): void {
  glowDisc(ctx, ball.x, ball.y, BALL_R, PALETTE.ball, 14);

  // A spinning ball wears an arc that shows which way it curves.
  if (Math.abs(ball.spin) > 40) {
    const sweep = Math.min(1, Math.abs(ball.spin) / 600) * Math.PI * 1.2;
    const start = -Math.PI / 2;
    ctx.strokeStyle = PALETTE.accent;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R + 6, start, start + sweep, ball.spin < 0);
    ctx.stroke();
  }
}

function drawHold(ctx: Ctx, ball: BallState, receiver: Side): void {
  const fraction = Math.max(0, Math.min(1, ball.holdTimer / HOLD_TIME));
  ctx.strokeStyle = PALETTE.accent;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.5 + 0.5 * fraction;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_R + 10 + 44 * fraction, 0, Math.PI * 2);
  ctx.stroke();

  // An arrow toward the receiver, who the serve travels to.
  const dir = receiver === "left" ? -1 : 1;
  const ax = ball.x + dir * (BALL_R + 70);
  ctx.fillStyle = PALETTE.accent;
  ctx.beginPath();
  ctx.moveTo(ax + dir * 14, ball.y);
  ctx.lineTo(ax - dir * 6, ball.y - 11);
  ctx.lineTo(ax - dir * 6, ball.y + 11);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  text(ctx, "READY", FIELD_CX, FIELD_CY - 96, 26, PALETTE.accent);
}

function drawScores(ctx: Ctx, state: CaromView): void {
  text(ctx, String(state.score.p1), FIELD_CX - 130, 74, 68, PALETTE.left);
  text(ctx, String(state.score.p2), FIELD_CX + 130, 74, 68, PALETTE.right);
  const label =
    state.mode === "solo" ? "SOLO  ·  YOU vs AI" : "VERSUS  ·  P1 vs P2";
  text(ctx, label, FIELD_CX, FIELD_H - 22, 16, PALETTE.muted, { weight: 600 });
}

/** The field with everything on it: walls, net, obstacles, paddles, ball. */
function drawField(ctx: Ctx, state: CaromView): void {
  drawFieldLines(ctx);
  drawObstacles(ctx, state);
  drawPaddle(ctx, "left", state.paddles.left.cy);
  drawPaddle(ctx, "right", state.paddles.right.cy);
  if (state.ball !== null) {
    drawTrail(ctx, state.ball);
    drawBall(ctx, state.ball);
  }
}

function drawMatch(ctx: Ctx, state: CaromView): void {
  drawField(ctx, state);
  drawScores(ctx, state);
  if (state.screen === "countdown" && state.ball !== null) {
    drawHold(ctx, state.ball, state.receiver);
  }
}

// ---- Menus ------------------------------------------------------------------

function dimField(ctx: Ctx): void {
  ctx.fillStyle = PALETTE.dim;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
}

function drawMenu(ctx: Ctx, screen: Screen, menuIndex: number): void {
  const items = menuItems(screen);
  items.forEach((label, index) => {
    const r = menuItemRect(screen, index);
    if (r === null) return;
    const selected = index === menuIndex;
    if (selected) {
      glowRoundRect(ctx, r.x, r.y, r.w, r.h, 12, PALETTE.accent, 12);
    } else {
      ctx.strokeStyle = "rgba(232, 236, 248, 0.28)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 12);
      ctx.stroke();
    }
    text(
      ctx,
      label,
      r.x + r.w / 2,
      r.y + r.h / 2 + 1,
      24,
      selected ? BACKGROUND_COLOR : PALETTE.text,
    );
  });
}

function drawTitle(ctx: Ctx, state: CaromView): void {
  drawField(ctx, state);
  dimField(ctx);
  text(ctx, TITLE_TEXT, FIELD_CX, 210, 128, PALETTE.accent, {
    weight: 800,
    glow: PALETTE.accent,
  });
  text(
    ctx,
    "a top-down paddle duel with spin",
    FIELD_CX,
    300,
    24,
    PALETTE.muted,
    { weight: 500 },
  );
  drawMenu(ctx, "title", state.menuIndex);
  text(
    ctx,
    "W / S and ↑ / ↓ move   ·   Enter confirms   ·   Esc pauses   ·   M mutes",
    FIELD_CX,
    FIELD_H - 24,
    16,
    PALETTE.muted,
    { weight: 500 },
  );
}

const HOWTO_CONTROLS: readonly string[] = [
  "Player one: W up, S down",
  "Player two: ↑ up, ↓ down",
  "Solo: either pair moves you; the AI takes the right paddle",
  "Enter or Space confirms",
  "P or Esc pauses",
  "M mutes",
];

const HOWTO_RULES: readonly string[] = [
  "Score by sending the ball past the far paddle.",
  "First to 11 wins, by two clear points.",
  "SPIN: a moving paddle curves the ball. Strike while",
  "sliding down for a clockwise curve, up for the reverse.",
  "The spin fades over the flight.",
  "BANK SHOTS: two bars stand mid-field. The ball",
  "ricochets off them, so aim around or off them.",
  "Hit near a paddle's edge for a sharper angle.",
];

function drawHowto(ctx: Ctx, state: CaromView): void {
  drawField(ctx, state);
  dimField(ctx);
  text(ctx, "HOW TO PLAY", FIELD_CX, 96, 56, PALETTE.accent, {
    glow: PALETTE.accent,
  });
  text(ctx, "CONTROLS", 330, 178, 24, PALETTE.left);
  HOWTO_CONTROLS.forEach((line, i) => {
    text(ctx, line, 330, 222 + i * 34, 19, PALETTE.text, { weight: 500 });
  });
  text(ctx, "THE GAME", 950, 178, 24, PALETTE.right);
  HOWTO_RULES.forEach((line, i) => {
    text(ctx, line, 950, 222 + i * 34, 19, PALETTE.text, { weight: 500 });
  });
  drawMenu(ctx, "howto", state.menuIndex);
}

function drawPaused(ctx: Ctx, state: CaromView): void {
  drawMatch(ctx, state);
  dimField(ctx);
  text(ctx, "PAUSED", FIELD_CX, 230, 72, PALETTE.accent, {
    glow: PALETTE.accent,
  });
  drawMenu(ctx, "paused", state.menuIndex);
}

function winnerCopy(state: CaromView): string {
  if (state.winner === null) return "MATCH OVER";
  if (state.mode === "solo") {
    return state.winner === "left" ? "YOU WIN" : "THE AI WINS";
  }
  return state.winner === "left" ? "PLAYER ONE WINS" : "PLAYER TWO WINS";
}

function drawMatchover(ctx: Ctx, state: CaromView): void {
  drawMatch(ctx, state);
  dimField(ctx);
  const color = state.winner === "right" ? PALETTE.right : PALETTE.left;
  text(ctx, winnerCopy(state), FIELD_CX, 220, 64, color, { glow: color });
  text(
    ctx,
    `${state.score.p1}  –  ${state.score.p2}`,
    FIELD_CX,
    320,
    56,
    PALETTE.text,
  );
  drawMenu(ctx, "matchover", state.menuIndex);
}

export function renderFrame(ctx: Ctx, state: CaromView): void {
  switch (state.screen) {
    case "title":
      drawTitle(ctx, state);
      return;
    case "howto":
      drawHowto(ctx, state);
      return;
    case "countdown":
    case "playing":
      drawMatch(ctx, state);
      return;
    case "paused":
      drawPaused(ctx, state);
      return;
    case "matchover":
      drawMatchover(ctx, state);
      return;
  }
}
