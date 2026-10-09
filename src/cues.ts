// The four audio cues, each a distinct short blip (specs/audio.md).

import type { InitApi } from "@clockwyrks/simple-2d";
import { CUES } from "./constants";

export function defineCues(audio: InitApi["audio"]): void {
  audio.define(CUES.paddleHit, {
    wave: "square",
    freq: 520,
    freqTo: 380,
    durationMs: 70,
    gain: 0.18,
  });
  audio.define(CUES.wallBounce, {
    wave: "triangle",
    freq: 300,
    freqTo: 240,
    durationMs: 55,
    gain: 0.16,
  });
  audio.define(CUES.obstacleBounce, {
    wave: "sawtooth",
    freq: 760,
    freqTo: 560,
    durationMs: 60,
    gain: 0.12,
  });
  audio.define(CUES.score, {
    wave: "sine",
    freq: 440,
    freqTo: 880,
    durationMs: 260,
    gain: 0.2,
  });
}
