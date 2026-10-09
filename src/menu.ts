// The menus: the items each menu screen shows, the hit region each item
// occupies, and how keyboard edges and pointer samples move over them
// (specs/ui.md, "Menu navigation").

import {
  FIELD_CX,
  MATCHOVER_ITEMS,
  PAUSE_ITEMS,
  TITLE_ITEMS,
} from "./constants";
import type { MenuItemRect, PointerPress, Screen } from "./game";
import type { PointerEvent } from "./input";

/** The copy of the how-to screen's single item. */
export const HOWTO_ITEMS = ["BACK TO TITLE"] as const;

export const MENU_ITEM_W = 340;
export const MENU_ITEM_H = 58;
export const MENU_ITEM_GAP = 18;

/** Where each menu's first item sits; a screen with no menu has no entry. */
const MENU_TOP: Partial<Record<Screen, number>> = {
  title: 392,
  howto: 626,
  paused: 330,
  matchover: 430,
};

/** The items the menu on `screen` shows, in order; empty off the menus. */
export function menuItems(screen: Screen): readonly string[] {
  switch (screen) {
    case "title":
      return TITLE_ITEMS;
    case "howto":
      return HOWTO_ITEMS;
    case "paused":
      return PAUSE_ITEMS;
    case "matchover":
      return MATCHOVER_ITEMS;
    case "countdown":
    case "playing":
      return [];
  }
}

/** The hit region of item `index` on `screen`'s menu, or `null` for none. */
export function menuItemRect(
  screen: Screen,
  index: number,
): MenuItemRect | null {
  const top = MENU_TOP[screen];
  if (top === undefined) return null;
  if (!Number.isInteger(index) || index < 0) return null;
  if (index >= menuItems(screen).length) return null;
  return {
    x: FIELD_CX - MENU_ITEM_W / 2,
    y: top + index * (MENU_ITEM_H + MENU_ITEM_GAP),
    w: MENU_ITEM_W,
    h: MENU_ITEM_H,
  };
}

/** The index of the item at `(x, y)` on `screen`'s menu, or `null`. */
export function menuItemAt(
  screen: Screen,
  x: number,
  y: number,
): number | null {
  const count = menuItems(screen).length;
  for (let index = 0; index < count; index += 1) {
    const r = menuItemRect(screen, index);
    if (r !== null && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
      return index;
    }
  }
  return null;
}

/** `index` moved by `delta` over `count` items, wrapping both ways. */
export function wrapIndex(index: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return (((index + delta) % count) + count) % count;
}

export interface PointerMenuResult {
  readonly menuIndex: number;
  readonly presses: readonly PointerPress[];
  readonly confirmed: boolean;
}

function withPress(
  presses: readonly PointerPress[],
  press: PointerPress,
): PointerPress[] {
  return [...presses.filter((p) => p.id !== press.id), press];
}

/**
 * Applies a frame's pointer samples to `screen`'s menu. A sample inside an item
 * selects it; a release inside the item its pointer came down on confirms it.
 * Processing stops at the first confirm, which leaves the menu.
 */
export function applyPointerToMenu(
  screen: Screen,
  menuIndex: number,
  presses: readonly PointerPress[],
  samples: readonly PointerEvent[],
): PointerMenuResult {
  let index = menuIndex;
  let pressed = presses;
  for (const sample of samples) {
    const item = menuItemAt(screen, sample.x, sample.y);
    if (item !== null) index = item;
    if (sample.type === "down") {
      pressed = withPress(pressed, { id: sample.id, item });
    } else if (sample.type === "up") {
      const press = pressed.find((p) => p.id === sample.id);
      pressed = pressed.filter((p) => p.id !== sample.id);
      if (item !== null && press !== undefined && press.item === item) {
        return { menuIndex: index, presses: [], confirmed: true };
      }
    }
  }
  return { menuIndex: index, presses: pressed, confirmed: false };
}
