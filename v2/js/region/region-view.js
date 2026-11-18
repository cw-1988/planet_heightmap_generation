// A region's window (fork addition): a flat map over the page, opened while the region builds (its stage and how far)
// and drawn once it is done — the ground (Satellite or Relief), finer where zoomed in (region-tiles.js), the rivers from
// a chosen flow up (region-rivers.js), the chosen valleys' outline once their parts are read (region-mask.js); wheel to
// zoom about the pointer, drag to pan, a readout under the pointer and a scale bar. Esc or Close shuts it.

import { paintGround, regionLines } from './region-paint.js';
import { riverLines, riverClasses } from './region-rivers.js';
import { tileKeeper } from './region-tiles.js';

const RIVER_FROM = [1, 5, 25, 100];

/** The window, empty: { stage(text, f), show(region), mask(parts), close() }; onClose() when it shuts. */
export function regionWindow(title, onClose) {
    const el = document.createElement('div');
    el.className = 'region-view';
    el.innerHTML = `<div class="region-bar"><b class="region-title"></b>
        <span class="region-seg" role="group"><button data-look="satellite" aria-pressed="true">Satellite</button><button data-look="relief" aria-pressed="false">Relief</button></span>
        <label>Rivers from <select data-k="river">${RIVER_FROM.map((q) => `<option value="${q}"${q === 5 ? ' selected' : ''}>${q} m³/s</option>`).join('')}</select></label>
        <button data-close>Close</button></div>
        <canvas></canvas><div class="region-stage"></div><div class="region-readout" hidden></div><div class="region-scale"><i></i><span></span></div>`;
    document.body.append(el);
    const $ = (s) => el.querySelector(s), canvas = $('canvas'), g = canvas.getContext('2d'), stageEl = $('.region-stage'), readout = $('.region-readout');
    $('.region-title').textContent = title;
    let R = null, parts = null, image = null, lines = null, rivers = null, tiles = null, look = 'satellite', s = 1, ox = 0, oy = 0, drag = null;

    function size() {
        const dpr = devicePixelRatio || 1;
        canvas.width = Math.round(canvas.clientWidth * dpr); canvas.height = Math.round(canvas.clientHeight * dpr);
    }
    function fit() {
        const N = R.frame.n, w = canvas.clientWidth, h = canvas.clientHeight;
        s = Math.min(w, h) / N * 0.96; ox = (w - N * s) / 2; oy = (h - N * s) / 2;
    }
    function repaint() {
        image = document.createElement('canvas'); image.width = image.height = R.frame.n;
        image.getContext('2d').putImageData(paintGround(R, look, parts), 0, 0);
        tiles.restyle(look, parts);
    }
    function stroke(seg) {
        g.beginPath();
        for (let k = 0; k < seg.length; k += 4) { g.moveTo(ox + seg[k] * s, oy + seg[k + 1] * s); g.lineTo(ox + seg[k + 2] * s, oy + seg[k + 3] * s); }
        g.stroke();
    }
    function draw() {
        if (!R) return;
        const dpr = devicePixelRatio || 1, N = R.frame.n, W = canvas.clientWidth, H = canvas.clientHeight;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.fillStyle = getComputedStyle(el).backgroundColor; g.fillRect(0, 0, W, H);
        g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
        g.drawImage(image, ox, oy, N * s, N * s);
        tiles.draw(g, ox, oy, s);
        tiles.update(s, -ox / s, -oy / s, (W - ox) / s, (H - oy) / s);
        g.lineCap = g.lineJoin = 'round'; g.strokeStyle = 'rgb(58, 112, 168)';
        rivers.forEach(({ seg }, k) => { if (seg.length) { g.lineWidth = Math.max(0.6, Math.min(s, 1.5) * (0.5 + 0.55 * k)) * (s > 2 ? Math.sqrt(s / 2) : 1); stroke(seg); } });
        if (parts?.outline.length) {
            g.lineWidth = 1.5; g.strokeStyle = getComputedStyle(el).getPropertyValue('--accent') || 'red'; g.setLineDash([6, 4]);
            g.beginPath();
            for (const p of parts.outline) {
                g.moveTo(ox + p[0] * s, oy + p[1] * s);
                for (let k = 2; k < p.length; k += 2) g.lineTo(ox + p[k] * s, oy + p[k + 1] * s);
                g.closePath();
            }
            g.stroke(); g.setLineDash([]);
        }
        // the scale bar: a round length about a tenth of the window
        const kmPx = R.frame.cellKm / s, want = W / 8 * kmPx, p = 10 ** Math.floor(Math.log10(want)), len = [1, 2, 5, 10].map((m) => m * p).filter((v) => v <= want).pop() ?? p;
        $('.region-scale i').style.width = `${len / kmPx}px`;
        $('.region-scale span').textContent = len >= 1 ? `${len} km` : `${Math.round(len * 1000)} m`;
    }
    let queued = false;
    const later = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; draw(); }); } };
    const onResize = () => { size(); later(); };
    addEventListener('resize', onResize);

    el.querySelector('.region-seg').addEventListener('click', (e) => {
        const b = e.target.closest('[data-look]');
        if (!b || !R) return;
        look = b.dataset.look;
        for (const x of el.querySelectorAll('[data-look]')) x.setAttribute('aria-pressed', String(x === b));
        repaint(); later();
    });
    $('[data-k="river"]').addEventListener('change', (e) => { if (R) { rivers = riverClasses(lines, +e.target.value); later(); } });
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (!R) return;
        const k = Math.exp(-e.deltaY * 0.0015), r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
        const ns = Math.min(64, Math.max(Math.min(canvas.clientWidth, canvas.clientHeight) / R.frame.n * 0.5, s * k));
        ox = mx - (mx - ox) * ns / s; oy = my - (my - oy) * ns / s; s = ns;
        later();
    }, { passive: false });
    canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, ox, oy }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointerup', () => { drag = null; });
    canvas.addEventListener('pointermove', (e) => {
        if (drag) { ox = drag.ox + e.clientX - drag.x; oy = drag.oy + e.clientY - drag.y; later(); }
        if (!R) return;
        // (on the zoom tile, its finer cell)
        const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left - ox) / s, y = (e.clientY - r.top - oy) / s, t = tiles.at(x, y);
        const lines = t ? regionLines(t.tile, t.i, t.j, parts) : regionLines(R, Math.floor(x), Math.floor(y), parts);
        readout.hidden = !lines;
        if (lines) readout.innerHTML = lines.join('<br>');
    });
    canvas.addEventListener('pointerleave', () => { readout.hidden = true; });
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    addEventListener('keydown', onKey);
    $('[data-close]').addEventListener('click', () => close());
    function close() {
        tiles?.stop(); el.remove(); removeEventListener('resize', onResize); removeEventListener('keydown', onKey);
        onClose?.();
    }
    size();
    return {
        stage(text, f) { stageEl.hidden = false; stageEl.textContent = f ? `${text} · ${Math.round(100 * f)} %` : `${text}…`; },
        show(region) {
            R = region; stageEl.hidden = true;
            lines = riverLines(R); rivers = riverClasses(lines, +$('[data-k="river"]').value); tiles = tileKeeper(R, lines, later);
            size(); fit(); repaint(); draw();
        },
        /** The chosen valleys' parts (region-mask.js): the ground beyond their border greyed, their outline drawn. */
        mask(m) { parts = m; if (R) { repaint(); later(); } },
        close,
    };
}
