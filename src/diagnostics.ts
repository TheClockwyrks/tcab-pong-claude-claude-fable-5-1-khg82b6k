// The values Carom registers with the engine's debug overlay
// (specs/instrumentation.md, "Diagnostics").

import type { InitApi } from "@clockwyrks/simple-2d";
import type { CaromState, CaromView, Side } from "./game";

const NONE = "-";

function fixed(value: number, digits = 1): string {
  return value.toFixed(digits);
}

function paddleLine(state: CaromView, side: Side): string {
  const p = state.paddles[side];
  const owner = p.driven ? " driven" : "";
  return `cy ${fixed(p.cy)} vy ${fixed(p.vy)}${owner}`;
}

export function registerDiagnostics(
  diagnostics: InitApi<CaromState>["diagnostics"],
): void {
  diagnostics.register("screen", (s) => s.screen);
  diagnostics.register("mode", (s) => s.mode);
  diagnostics.register("score", (s) => `${s.score.p1} - ${s.score.p2}`);
  diagnostics.register("ball pos", (s) =>
    s.ball === null ? NONE : `${fixed(s.ball.x)}, ${fixed(s.ball.y)}`,
  );
  diagnostics.register("ball vel", (s) =>
    s.ball === null ? NONE : `${fixed(s.ball.vx)}, ${fixed(s.ball.vy)}`,
  );
  diagnostics.register("ball speed", (s) =>
    s.ball === null ? NONE : fixed(Math.hypot(s.ball.vx, s.ball.vy)),
  );
  diagnostics.register("ball spin", (s) =>
    s.ball === null ? NONE : fixed(s.ball.spin),
  );
  diagnostics.register("left paddle", (s) => paddleLine(s, "left"));
  diagnostics.register("right paddle", (s) => paddleLine(s, "right"));
  diagnostics.register("sim time", (s) => fixed(s.simTime, 2));
}
