"use client";

/**
 * useHoverCard — hover-intent state for the floating hotspot card.
 *
 * A hover card that vanishes the instant the pointer leaves its marker is
 * unusable: you can never reach the card to read or click it. This hook
 * gives the card three properties it needs to feel solid:
 *
 *   • a grace period — leaving the marker starts a short countdown rather
 *     than closing, so travelling across the gap to the card is forgiving
 *   • stickiness — the card itself calls `keep()` on enter, cancelling that
 *     countdown, so it stays as long as the pointer is on it
 *   • a real exit — `open` flips false before `mounted` does, giving the
 *     close animation time to play instead of the card just disappearing
 *
 * Timers are cleared on unmount, so a marker that disappears mid-hover
 * (scene change, auto-tour advance) never leaves a stray timeout behind.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type HoverCardState = {
  /** Keep the card in the tree — true through the whole exit animation. */
  mounted: boolean;
  /** Visually open. Flips false first so the exit animation can run. */
  open: boolean;
  /** Pointer entered the marker or the card. */
  show: () => void;
  /** Pointer left — begins the grace period, then closes. */
  hide: () => void;
  /** Pointer re-entered (usually the card itself) — cancel any pending close. */
  keep: () => void;
  /** Close now, skipping the grace period (used after acting on a row). */
  close: () => void;
};

export function useHoverCard(opts?: {
  /** ms to wait after the pointer leaves before starting to close. */
  grace?: number;
  /** ms the exit animation runs before unmounting. */
  exit?: number;
}): HoverCardState {
  const grace = opts?.grace ?? 260;
  const exit = opts?.exit ?? 190;

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  const graceTimer = useRef<number | null>(null);
  const exitTimer = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (graceTimer.current) {
      window.clearTimeout(graceTimer.current);
      graceTimer.current = null;
    }
    if (exitTimer.current) {
      window.clearTimeout(exitTimer.current);
      exitTimer.current = null;
    }
  }, []);

  const show = useCallback(() => {
    clearTimers();
    setMounted(true);
    setOpen(true);
  }, [clearTimers]);

  const keep = show;

  const beginExit = useCallback(() => {
    setOpen(false);
    exitTimer.current = window.setTimeout(() => setMounted(false), exit);
  }, [exit]);

  const hide = useCallback(() => {
    clearTimers();
    graceTimer.current = window.setTimeout(beginExit, grace);
  }, [clearTimers, beginExit, grace]);

  const close = useCallback(() => {
    clearTimers();
    beginExit();
  }, [clearTimers, beginExit]);

  useEffect(() => clearTimers, [clearTimers]);

  return { mounted, open, show, hide, keep, close };
}
