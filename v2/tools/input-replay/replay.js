// Plays a recording from record.js back on the page at the same times and places: the same seed's page, the same
// window size, loaded fresh as the recording was. Synthetic events: pointer capture is emulated (the moves and the
// release go to the element pressed, as a real capture sends them).
//   const p = await import('/v2/tools/input-replay/replay.js'); p.replay(rec, { onDone });
// window.__replay: { at (ms into the recording), done }.

export function replay(rec, { speed = 1, from = 0 } = {}) {
    const E = Element.prototype;
    for (const n of ['setPointerCapture', 'releasePointerCapture']) {
        const orig = E[n];
        if (!orig.__safe) { E[n] = function (id) { try { return orig.call(this, id); } catch { /* a synthetic pointer */ } }; E[n].__safe = true; }
    }
    const S = window.__replay = { at: 0, done: false, n: 0, skipped: 0 };
    const ev = rec.ev.filter(e => e.t >= from), start = performance.now() - from / speed;
    let captured = null, i = 0;
    const mods = m => ({ ctrlKey: m?.includes('c'), shiftKey: m?.includes('s'), altKey: m?.includes('a'), metaKey: m?.includes('m') });
    const fire = e => {
        const at = document.elementFromPoint(e.x, e.y);
        if (e.type.startsWith('pointer')) {
            const target = captured || at;
            if (!target) { S.skipped++; return; }
            const o = { bubbles: true, cancelable: true, composed: true, clientX: e.x, clientY: e.y, button: e.button, buttons: e.buttons,
                pointerId: 1, pointerType: 'mouse', isPrimary: true, view: window, ...mods(e.m) };
            target.dispatchEvent(new PointerEvent(e.type, o));
            const mouse = { pointerdown: 'mousedown', pointermove: 'mousemove', pointerup: 'mouseup' }[e.type];
            if (mouse) target.dispatchEvent(new MouseEvent(mouse, o));
            if (e.type === 'pointerdown') captured = at;
            if (e.type === 'pointerup' || e.type === 'pointercancel') captured = null;
        } else if (e.type === 'wheel') {
            (at || document.body).dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, composed: true, clientX: e.x, clientY: e.y, deltaX: e.dx, deltaY: e.dy, deltaMode: e.dm, view: window, ...mods(e.m) }));
        } else if (e.type === 'click') {
            if (at) at.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, clientX: e.x, clientY: e.y, button: e.button, view: window, ...mods(e.m) }));
        } else if (e.type === 'keydown' || e.type === 'keyup') {
            (document.activeElement || document.body).dispatchEvent(new KeyboardEvent(e.type, { bubbles: true, cancelable: true, key: e.key, code: e.code, ...mods(e.m) }));
        }
        S.n++;
    };
    const tick = () => {
        const now = (performance.now() - start) * speed;
        S.at = Math.round(now);
        while (i < ev.length && ev[i].t <= now) fire(ev[i++]);
        if (i < ev.length) setTimeout(tick, 2); else S.done = true;
    };
    tick();
    return S;
}
