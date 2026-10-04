export { cn } from "cn"

/**
 * For a state setter: keeps the previous value when the new one has the same JSON, so polling an
 * answer that did not change re-renders nothing (and charts do not replay their animation).
 */
export const unlessChanged =
  <T,>(next: T) =>
  (before: T | null): T =>
    before != null && JSON.stringify(before) === JSON.stringify(next) ? before : next
