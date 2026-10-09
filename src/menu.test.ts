import { describe, expect, test } from "vitest";
import { MATCHOVER_ITEMS, PAUSE_ITEMS, TITLE_ITEMS } from "./constants";
import {
  applyPointerToMenu,
  HOWTO_ITEMS,
  menuItemAt,
  menuItemRect,
  menuItems,
  wrapIndex,
} from "./menu";

describe("menu items and regions", () => {
  test("each menu screen shows its items in order", () => {
    expect(menuItems("title")).toEqual(TITLE_ITEMS);
    expect(menuItems("howto")).toEqual(HOWTO_ITEMS);
    expect(menuItems("paused")).toEqual(PAUSE_ITEMS);
    expect(menuItems("matchover")).toEqual(MATCHOVER_ITEMS);
    expect(menuItems("countdown")).toEqual([]);
    expect(menuItems("playing")).toEqual([]);
  });

  test("regions are laid out down the field without overlapping", () => {
    const first = menuItemRect("title", 0);
    const second = menuItemRect("title", 1);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.h);
    expect(first!.x).toBe(second!.x);
    expect(first!.w).toBeGreaterThan(0);
  });

  test("no region on the live screens or for an index off the menu", () => {
    expect(menuItemRect("playing", 0)).toBeNull();
    expect(menuItemRect("countdown", 0)).toBeNull();
    expect(menuItemRect("title", 3)).toBeNull();
    expect(menuItemRect("title", -1)).toBeNull();
    expect(menuItemRect("title", 0.5)).toBeNull();
    expect(menuItemRect("howto", 1)).toBeNull();
  });

  test("a point inside a region names that item", () => {
    const r = menuItemRect("paused", 2)!;
    expect(menuItemAt("paused", r.x + 1, r.y + 1)).toBe(2);
    expect(menuItemAt("paused", r.x + r.w, r.y + 1)).toBeNull();
    expect(menuItemAt("paused", 5, 5)).toBeNull();
    expect(menuItemAt("playing", 640, 400)).toBeNull();
  });

  test("the index wraps both ways", () => {
    expect(wrapIndex(0, -1, 3)).toBe(2);
    expect(wrapIndex(2, 1, 3)).toBe(0);
    expect(wrapIndex(1, 1, 3)).toBe(2);
    expect(wrapIndex(4, 1, 0)).toBe(0);
  });
});

describe("pointer navigation", () => {
  const r0 = menuItemRect("title", 0)!;
  const r1 = menuItemRect("title", 1)!;
  const inside = (r: typeof r0) => ({ x: r.x + 10, y: r.y + 10 });

  test("a move onto an item selects it", () => {
    const out = applyPointerToMenu(
      "title",
      0,
      [],
      [{ type: "move", id: 1, ...inside(r1) }],
    );
    expect(out.menuIndex).toBe(1);
    expect(out.confirmed).toBe(false);
  });

  test("a move outside every item leaves the selection", () => {
    const out = applyPointerToMenu(
      "title",
      2,
      [],
      [{ type: "move", id: 1, x: 5, y: 5 }],
    );
    expect(out.menuIndex).toBe(2);
  });

  test("a press and release inside one item confirms it", () => {
    const out = applyPointerToMenu(
      "title",
      0,
      [],
      [
        { type: "down", id: 1, ...inside(r1) },
        { type: "up", id: 1, ...inside(r1) },
      ],
    );
    expect(out).toEqual({ menuIndex: 1, presses: [], confirmed: true });
  });

  test("a press remembered across frames confirms on the later release", () => {
    const pressed = applyPointerToMenu(
      "title",
      0,
      [],
      [{ type: "down", id: 1, ...inside(r1) }],
    );
    expect(pressed.presses).toEqual([{ id: 1, item: 1 }]);
    expect(pressed.confirmed).toBe(false);
    const released = applyPointerToMenu(
      "title",
      pressed.menuIndex,
      pressed.presses,
      [{ type: "up", id: 1, ...inside(r1) }],
    );
    expect(released.confirmed).toBe(true);
  });

  test("edges in different items, or one outside, confirm nothing", () => {
    const across = applyPointerToMenu(
      "title",
      0,
      [],
      [
        { type: "down", id: 1, ...inside(r0) },
        { type: "move", id: 1, ...inside(r1) },
        { type: "up", id: 1, ...inside(r1) },
      ],
    );
    expect(across.confirmed).toBe(false);
    expect(across.menuIndex).toBe(1);
    expect(across.presses).toEqual([]);

    const fromOutside = applyPointerToMenu(
      "title",
      0,
      [],
      [
        { type: "down", id: 1, x: 5, y: 5 },
        { type: "up", id: 1, ...inside(r1) },
      ],
    );
    expect(fromOutside.confirmed).toBe(false);
    expect(fromOutside.menuIndex).toBe(1);

    const toOutside = applyPointerToMenu(
      "title",
      0,
      [],
      [
        { type: "down", id: 1, ...inside(r1) },
        { type: "up", id: 1, x: 5, y: 5 },
      ],
    );
    expect(toOutside.confirmed).toBe(false);
  });

  test("each contact keeps its own press", () => {
    const two = applyPointerToMenu(
      "title",
      0,
      [],
      [
        { type: "down", id: 7, ...inside(r0) },
        { type: "down", id: 8, ...inside(r1) },
        { type: "up", id: 7, ...inside(r1) },
      ],
    );
    expect(two.confirmed).toBe(false);
    expect(two.presses).toEqual([{ id: 8, item: 1 }]);
    const lift = applyPointerToMenu("title", two.menuIndex, two.presses, [
      { type: "up", id: 8, ...inside(r1) },
    ]);
    expect(lift.confirmed).toBe(true);
  });

  test("a second press by the same pointer replaces the first", () => {
    const out = applyPointerToMenu(
      "title",
      0,
      [{ id: 1, item: 0 }],
      [{ type: "down", id: 1, ...inside(r1) }],
    );
    expect(out.presses).toEqual([{ id: 1, item: 1 }]);
  });
});
