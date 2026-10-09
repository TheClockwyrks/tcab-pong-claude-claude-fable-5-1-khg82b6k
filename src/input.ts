// What one frame of input looks like to the simulation: the movement values,
// the press edges, and the pointer samples, read once from the engine at the
// top of `update` and handed to the render-free core as plain data.

import type { UpdateApi } from "@clockwyrks/simple-2d";
import { ACTIONS, type ActionName } from "./constants";

export type MovementAction = "p1-up" | "p1-down" | "p2-up" | "p2-down";

export type MovementValues = Readonly<Record<MovementAction, number>>;

export type ActionEdges = Readonly<Record<ActionName, boolean>>;

export interface PointerEvent {
  readonly type: "down" | "move" | "up";
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

export interface FrameInput {
  /** Each movement action's held magnitude, `0` or `1`. */
  readonly held: MovementValues;
  /** Whether each action was pressed since the last frame. */
  readonly pressed: ActionEdges;
  /** Every pointer sample since the last frame, in arrival order. */
  readonly pointer: readonly PointerEvent[];
  /** The runtime's mute bit as this frame opened. */
  readonly muted: boolean;
}

const MOVEMENT: readonly MovementAction[] = [
  "p1-up",
  "p1-down",
  "p2-up",
  "p2-down",
];

export function readFrameInput(api: UpdateApi): FrameInput {
  const held = {} as Record<MovementAction, number>;
  for (const action of MOVEMENT) held[action] = api.input.value(action);

  const pressed = {} as Record<ActionName, boolean>;
  for (const action of ACTIONS) pressed[action] = api.input.pressed(action);

  const pointer = api.input
    .pointerSamples()
    .map(({ type, id, x, y }) => ({ type, id, x, y }));

  return { held, pressed, pointer, muted: api.audio.muted() };
}

/** An input frame with nothing held, nothing pressed, and no pointer. */
export function idleInput(muted = false): FrameInput {
  const held = {} as Record<MovementAction, number>;
  for (const action of MOVEMENT) held[action] = 0;
  const pressed = {} as Record<ActionName, boolean>;
  for (const action of ACTIONS) pressed[action] = false;
  return { held, pressed, pointer: [], muted };
}
