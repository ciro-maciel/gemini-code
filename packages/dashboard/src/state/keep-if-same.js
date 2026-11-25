// A poll or a stream that brings back what the screen already has must not
// redraw it: the state keeps the current value when the new one is equal.
export const keepIfSame = (next) => (current) =>
  current !== null &&
  current !== undefined &&
  JSON.stringify(current) === JSON.stringify(next)
    ? current
    : next;
