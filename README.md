# Carom

Carom is a top-down paddle duel that runs entirely in the browser. Two paddles
face each other across a dark field while a ball ricochets between them, off the
top and bottom walls, and off a pair of bars standing in the middle of the field.
A player scores when the ball passes the far edge behind their opponent's paddle.
First to 11 wins, by two clear points.

What sets Carom apart is **spin**: the motion of a paddle at the moment it
strikes the ball curves the ball's flight afterward. Strike while sliding down
and the ball bends clockwise; strike while sliding up and it bends the other way.
The spin fades over the flight, so a well-timed hit sends the ball arcing around
an obstacle, or banking off one into the far goal.

Play it **solo** against the AI, or **versus** a friend on the same keyboard.

## Controls

| Key | Action |
| --- | --- |
| `W` / `S` | Player one (left paddle) up / down |
| `↑` / `↓` | Player two (right paddle) up / down |
| `Enter` or `Space` | Confirm a menu item |
| `Esc` | Pause, resume, or back out of a menu |
| `P` | Pause and resume |
| `M` | Mute and unmute |
| `` ` `` (backtick) | Toggle the debug overlay |

In solo mode either pair of movement keys moves your paddle; the AI takes the
right one. Menus also take the mouse and touch: hover or tap an item to pick it.
On a touchscreen, on-screen sliders appear for both paddles.

## Install

Carom is a TypeScript project built with [Vite](https://vite.dev). It needs
Node.js 20 or newer.

```sh
npm ci
```

## Run in development

```sh
npm run dev
```

Vite serves the game with hot reload and prints the URL to open, usually
`http://localhost:5173/`.

## Build for production

```sh
npm run build
```

This type-checks the project and emits the complete static site into `dist/`,
with `index.html` at its root. The bundle is self-contained and fetches nothing
at runtime, so `dist/` runs as-is from any static file server:

```sh
npm run preview
```

serves the built site locally on port 4173 for a final check.

## Checks and tests

```sh
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint
npm run format      # Prettier, in check mode
npm test            # Vitest, with coverage over src/
```

The tests stand the engine up over a headless canvas and advance the game a
counted number of frames, so they need no browser.

## Layout

| Path | Holds |
| --- | --- |
| `src/game.ts` | The state types, the debug surface's type, and the three engine functions. |
| `src/update.ts` | The render-free core: one frame as a transition over the state. |
| `src/ball.ts`, `src/paddle.ts` | The physics: sub-stepped flight, collisions, spin, the AI, and the paddle integration. |
| `src/menu.ts`, `src/world.ts` | The menus and their hit regions; building and resetting the world. |
| `src/debug.ts` | The debug and automation surface the engine returns from `engine.debug`. |
| `src/render.ts` | Everything drawn on the canvas. |
| `src/constants.ts` | Every figure the specification fixes. |
| `specs/` | The game's specification. |
| `engine/` | The Simple 2D engine's documentation. |
| `showcase/` | The store-page description, carousel, screenshots, and a replay. |
| `tools/` | The script that captures the showcase media from the built game. |

## Credits

Carom is built on the Simple 2D engine. Its look, sounds, and design are its own:
everything is drawn and synthesized in code, and the build ships no art or audio
files.
