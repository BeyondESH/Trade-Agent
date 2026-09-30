import type { Transition, Variants } from "motion/react";

/**
 * The app's motion vocabulary.
 *
 * Every animation in the terminal draws from this file rather than inventing
 * its own duration, so the product moves like one instrument. Springs are
 * preferred over fixed durations: they settle physically and avoid the
 * "linear CSS transition" tell that makes an interface feel generated.
 *
 * Rule of thumb used throughout: motion explains a change of state (something
 * appeared, moved, or was selected). It never decorates. Everything here is
 * therefore short, and every consumer pairs it with `useReducedMotion`.
 */

/** Default spring: UI movement, selection, layout shifts. */
export const SPRING: Transition = { type: "spring", stiffness: 380, damping: 30, mass: 0.9 };

/** Snappier spring for small popovers and menus. */
export const SPRING_SNAPPY: Transition = { type: "spring", stiffness: 520, damping: 34 };

/** Full-screen scrim behind an overlay. */
export const scrim: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.18, ease: "easeOut" } },
  exit: { opacity: 0, transition: { duration: 0.12, ease: "easeIn" } },
};

/** Anchored overlay: menus, popovers, dropdowns. Settles down and in. */
export const popover: Variants = {
  hidden: { opacity: 0, y: -6, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: SPRING_SNAPPY },
  exit: { opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.11, ease: "easeIn" } },
};

/** Centred modal shell. */
export const modalShell: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: SPRING },
  exit: { opacity: 0, y: 6, scale: 0.99, transition: { duration: 0.13, ease: "easeIn" } },
};

/**
 * Workspace view switching is intentionally NOT defined here: it is a plain
 * opacity cross-fade (the `ta-fade` keyframe in src/index.css applied to the
 * workspace key). A transform on an ancestor becomes a containing block and
 * would mis-position every `position: fixed` descendant - the chart context
 * menu and the popovers - so the motion library is the wrong tool for it.
 */
