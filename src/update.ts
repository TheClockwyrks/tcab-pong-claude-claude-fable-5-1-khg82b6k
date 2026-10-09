// The render-free core: one frame of Carom as a transition over the state.
//
// `advanceFrame` reads the frame's input first, applies it to the screen the
// frame began on, then advances the screen the input left it on. It returns the
// next state together with the cues the frame raised and the mute bit it wants,
// so the engine-facing `update` in `./game` only has to carry those out.

import { CUES, WIN_LEAD, WIN_SCORE, type CueName } from "./constants";
import {
  advanceBall,
  goalScorer,
  recordTrail,
  serveBall,
  type Contacts,
} from "./ball";
import type { CaromState, CaromView, Screen, Side } from "./game";
import type { FrameInput } from "./input";
import { applyPointerToMenu, menuItems, wrapIndex } from "./menu";
import { movePaddles } from "./paddle";
import { parkedBall, returnToTitle, startMatch } from "./world";

export interface FrameResult {
  readonly state: CaromState;
  readonly cues: readonly CueName[];
  readonly muted: boolean;
}

/** The screens a match is live on, the ones that simulate. */
function isLive(screen: Screen): screen is "countdown" | "playing" {
  return screen === "countdown" || screen === "playing";
}

// ---- Menus ----------------------------------------------------------------

interface MenuOutcome {
  readonly state: CaromState;
  /** Whether this frame confirmed the item at `state.menuIndex`. */
  readonly confirmed: boolean;
}

/**
 * The keyboard and pointer navigation every menu shares: up before down,
 * movement before confirm, keyboard before pointer, and a keyboard confirm
 * alone when both confirm at once.
 */
function navigateMenu(state: CaromView, input: FrameInput): MenuOutcome {
  const count = menuItems(state.screen).length;
  const { pressed } = input;
  const up = pressed["p1-up"] || pressed["p2-up"];
  const down = pressed["p1-down"] || pressed["p2-down"];

  let menuIndex = state.menuIndex;
  if (up) menuIndex = wrapIndex(menuIndex, -1, count);
  else if (down) menuIndex = wrapIndex(menuIndex, 1, count);
  else if (pressed.confirm) {
    return { state: { ...state, presses: [] }, confirmed: true };
  }

  const pointer = applyPointerToMenu(
    state.screen,
    menuIndex,
    state.presses,
    input.pointer,
  );
  return {
    state: { ...state, menuIndex: pointer.menuIndex, presses: pointer.presses },
    // A keyboard movement edge moves only, so it takes the pointer's selection
    // but not its confirm.
    confirmed: pointer.confirmed && !up && !down,
  };
}

function confirmTitle(state: CaromView): CaromState {
  const remembered: CaromState = { ...state, titleIndex: state.menuIndex };
  switch (state.menuIndex) {
    case 0:
      return startMatch(remembered, "solo");
    case 1:
      return startMatch(remembered, "versus");
    default:
      return { ...remembered, screen: "howto", menuIndex: 0, presses: [] };
  }
}

function resume(state: CaromView): CaromState {
  return { ...state, screen: state.resumeScreen, presses: [] };
}

function confirmPaused(state: CaromView): CaromState {
  switch (state.menuIndex) {
    case 0:
      return resume(state);
    case 1:
      return startMatch(state, state.mode);
    default:
      return returnToTitle(state);
  }
}

function confirmMatchover(state: CaromView): CaromState {
  return state.menuIndex === 0
    ? startMatch(state, state.mode)
    : returnToTitle(state);
}

// ---- Input, by the screen the frame began on --------------------------------

function applyInput(state: CaromView, input: FrameInput): CaromState {
  const { pressed } = input;
  switch (state.screen) {
    case "title": {
      const menu = navigateMenu(state, input);
      return menu.confirmed ? confirmTitle(menu.state) : menu.state;
    }
    case "howto": {
      if (pressed.back) return returnToTitle(state);
      const menu = navigateMenu(state, input);
      return menu.confirmed ? returnToTitle(menu.state) : menu.state;
    }
    case "countdown":
    case "playing":
      if (pressed.pause) {
        return {
          ...state,
          resumeScreen: state.screen,
          screen: "paused",
          menuIndex: 0,
          presses: [],
        };
      }
      return { ...state };
    case "paused": {
      if (pressed.pause || pressed.back) return resume(state);
      const menu = navigateMenu(state, input);
      return menu.confirmed ? confirmPaused(menu.state) : menu.state;
    }
    case "matchover": {
      if (pressed.back) return returnToTitle(state);
      const menu = navigateMenu(state, input);
      return menu.confirmed ? confirmMatchover(menu.state) : menu.state;
    }
  }
}

// ---- The live field -----------------------------------------------------------

function matchWon(p1: number, p2: number): Side | null {
  if (p1 >= WIN_SCORE && p1 - p2 >= WIN_LEAD) return "left";
  if (p2 >= WIN_SCORE && p2 - p1 >= WIN_LEAD) return "right";
  return null;
}

/** The point `scorer` just won: the score, then the match end or the next hold. */
export function scorePoint(state: CaromView, scorer: Side): CaromState {
  const score = {
    p1: state.score.p1 + (scorer === "left" ? 1 : 0),
    p2: state.score.p2 + (scorer === "right" ? 1 : 0),
  };
  const winner = matchWon(score.p1, score.p2);
  if (winner !== null) {
    return { ...state, score, winner, screen: "matchover", menuIndex: 0 };
  }
  return {
    ...state,
    score,
    receiver: scorer === "left" ? "right" : "left",
    ball: parkedBall(),
    screen: "countdown",
  };
}

function cuesFor(contacts: Contacts, scored: boolean): CueName[] {
  const cues: CueName[] = [];
  if (contacts.paddle) cues.push(CUES.paddleHit);
  if (contacts.wall) cues.push(CUES.wallBounce);
  if (contacts.obstacle) cues.push(CUES.obstacleBounce);
  if (scored) cues.push(CUES.score);
  return cues;
}

/** A `countdown` frame: the hold counts down, and an elapsed hold serves. */
function holdFrame(state: CaromView, dt: number): CaromState {
  const ball = state.ball;
  if (ball === null) return { ...state };
  const holdTimer = ball.holdTimer - dt;
  if (holdTimer > 0) return { ...state, ball: { ...ball, holdTimer } };
  return { ...state, screen: "playing", ball: serveBall(ball, state.receiver) };
}

/** A `playing` frame: the ball flies, collides, and may pass a goal. */
function flightFrame(
  state: CaromView,
  dt: number,
): { state: CaromState; cues: CueName[] } {
  if (state.ball === null) return { state: { ...state }, cues: [] };
  const flown = advanceBall(state.ball, state, dt);
  const scorer = goalScorer(flown.ball);
  const next: CaromState = { ...state, ball: flown.ball };
  return {
    state: scorer === null ? next : scorePoint(next, scorer),
    cues: cuesFor(flown.contacts, scorer !== null),
  };
}

/** The trail sample every live frame records once the ball has been advanced. */
function sampleTrail(state: CaromView): CaromState {
  if (state.ball === null || !isLive(state.screen)) return { ...state };
  return { ...state, ball: recordTrail(state.ball, state.simTime) };
}

function simulate(
  state: CaromView,
  input: FrameInput,
  dt: number,
): { state: CaromState; cues: CueName[] } {
  const moved = movePaddles(state, input.held, dt);
  const stepped =
    moved.screen === "countdown"
      ? { state: holdFrame(moved, dt), cues: [] }
      : flightFrame(moved, dt);
  return { state: sampleTrail(stepped.state), cues: stepped.cues };
}

// ---- The frame -------------------------------------------------------------------

export function advanceFrame(
  state: CaromView,
  input: FrameInput,
  dt: number,
): FrameResult {
  const muted = input.pressed.mute ? !input.muted : input.muted;
  const timed: CaromView = { ...state, simTime: state.simTime + dt, muted };
  const entered = applyInput(timed, input);
  if (!isLive(entered.screen)) return { state: entered, cues: [], muted };
  const { state: next, cues } = simulate(entered, input, dt);
  return { state: next, cues, muted };
}
