// A slider stepped by the mouse wheel (fork addition): the edit tools' brush size and strength, the City size view's
// reach — 15 % a notch, wheel down for more, at least one step so small values still change. A Shift+wheel can come as a
// sideways scroll (deltaX); a page's wheel line-mode notch is 3, a pixel-mode one ~100.

/** Step the range `input` by the wheel event `e` and announce it (an 'input' event). */
export function stepByWheel(input, e) {
    const notch = Math.max(-3, Math.min(3, (e.deltaY || e.deltaX) / (e.deltaMode ? 3 : 100)));
    const step = +input.step || 1, was = +input.value, to = Math.round(was * Math.pow(1.15, notch) / step) * step;
    const next = to !== was ? to : was + Math.sign(notch) * step;
    input.value = String(Math.max(+input.min, Math.min(+input.max, next)));
    input.dispatchEvent(new Event('input'));
}
