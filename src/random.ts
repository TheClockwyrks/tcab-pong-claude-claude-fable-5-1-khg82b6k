// The one random draw in Carom: the vertical sign a serve takes.

/** `1` and `-1`, each equally likely (specs/balls.md). */
export function drawServeSign(): 1 | -1 {
  return Math.random() < 0.5 ? 1 : -1;
}
