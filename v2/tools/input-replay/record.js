// Records what a person does on a page — pointer, wheel, clicks, keys, with their times — and how the page keeps up:
// frames that came late (requestAnimationFrame gaps), long tasks, and each canvas upload into a texture (CPU and GPU ms).
// Load it in the page (DevTools or the agent's javascript tool):
//   const m = await import('/v2/tools/input-replay/record.js'); m.arm();
// arm() survives reloads: the view pages (generate, evolution, import .html) start a new session on every load while
// localStorage.__recArm is set, so the page's own loading is measured too. Each session (one per page load) is kept in
// localStorage.__recs, saved every 2 s and on leaving; disarm() stops it, sessions() reads them back.
// window.__rec holds the live session (replay.js plays one back); summary() sums up how the page kept up.
// metricsOnly: the page's timing only, no input (for a replay's own measurement).

const KEY = '__recs';
export function arm() { localStorage.setItem('__recArm', '1'); localStorage.setItem(KEY, '[]'); return startRecording({ persist: true }); }
export function disarm() { localStorage.removeItem('__recArm'); return stopRecording(); }
export function sessions() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }

function persist(R) {
    const save = () => {
        const all = sessions().filter(s => s.t0Wall !== R.t0Wall);
        all.push({ ...R, now: undefined, obs: undefined, end: R.now() });
        try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* full: keep the older sessions */ }
    };
    setInterval(() => { if (R.on) save(); }, 2000);
    addEventListener('pagehide', save);
}

export function startRecording({ metricsOnly = false, persist: keep = false } = {}) {
    if (window.__rec?.on) return window.__rec;
    const t0 = performance.now();
    // (t0Load: ms since the page began loading, so a session started at load lines up with the load's own frames)
    const R = window.__rec = { on: true, url: location.href, w: innerWidth, h: innerHeight, dpr: devicePixelRatio, t0Wall: Date.now(), t0Load: Math.round(t0), ev: [], gaps: [], long: [], up: [] };
    const T = () => Math.round((performance.now() - t0) * 10) / 10;
    R.now = T;
    if (!metricsOnly) {
        const label = el => {
            const b = el?.closest?.('button, a, [role=button], input, select, label');
            return b ? (b.textContent || b.value || b.ariaLabel || b.tagName).trim().slice(0, 40) : el?.tagName || '';
        };
        const mods = e => (e.ctrlKey ? 'c' : '') + (e.shiftKey ? 's' : '') + (e.altKey ? 'a' : '') + (e.metaKey ? 'm' : '');
        const on = (type, f) => window.addEventListener(type, e => { if (e.isTrusted) f(e); }, { capture: true, passive: true });
        for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'])
            on(type, e => R.ev.push({ t: T(), type, x: e.clientX, y: e.clientY, button: e.button, buttons: e.buttons, id: e.pointerId, pt: e.pointerType, m: mods(e), l: type === 'pointerdown' ? label(e.target) : undefined }));
        on('wheel', e => R.ev.push({ t: T(), type: 'wheel', x: e.clientX, y: e.clientY, dx: e.deltaX, dy: e.deltaY, dm: e.deltaMode, m: mods(e) }));
        on('click', e => R.ev.push({ t: T(), type: 'click', x: e.clientX, y: e.clientY, button: e.button, m: mods(e), l: label(e.target) }));
        on('keydown', e => R.ev.push({ t: T(), type: 'keydown', key: e.key, code: e.code, m: mods(e) }));
        on('keyup', e => R.ev.push({ t: T(), type: 'keyup', key: e.key, code: e.code, m: mods(e) }));
    }
    // (late frames: at 60 Hz a frame is 16.7 ms; over 34 ms one or more were dropped)
    let last = performance.now();
    const frame = () => { if (!R.on) return; const n = performance.now(); if (n - last > 34) R.gaps.push({ t: T(), ms: Math.round(n - last) }); last = n; requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
    try {
        R.obs = new PerformanceObserver(l => { for (const e of l.getEntries()) R.long.push({ t: Math.round(e.startTime - t0), ms: Math.round(e.duration) }); });
        R.obs.observe({ type: 'longtask', buffered: false });
    } catch { /* no long-task timing here */ }
    hookUploads(R, T);
    hookWorkers(R, T);
    if (keep) persist(R);
    return R;
}

/** The page's milestones: each message a worker sends (its type or cmd), and when the main thread got it (R.msg). */
function hookWorkers(R, T) {
    if (window.Worker.__rec) return;
    R.msg = [];
    const W = window.Worker;
    window.Worker = class extends W {
        constructor(url, opts) {
            super(url, opts);
            const name = String(url).split('/').pop();
            let label = null;
            this.addEventListener('message', ({ data }) => {
                const k = data?.type ?? data?.cmd ?? data?.kind, l = data?.label ?? data?.stage;
                if (k === 'progress' && l === label) return;
                label = l;
                window.__rec?.msg?.push({ t: T(), w: name, k: String(k), l });
            });
        }
    };
    window.Worker.__rec = true;
}

/** Times each canvas upload into a texture (texSubImage2D / texImage2D with a canvas): CPU ms, and GPU ms by a timer query. */
function hookUploads(R, T) {
    const P = WebGL2RenderingContext.prototype;
    if (P.__recHooked) return;
    P.__recHooked = true;
    const pending = [];
    for (const name of ['texSubImage2D', 'texImage2D']) {
        const orig = P[name];
        P[name] = function (...a) {
            const img = a[a.length - 1];
            if (!(img instanceof HTMLCanvasElement || img instanceof OffscreenCanvas || img instanceof ImageBitmap)) return orig.apply(this, a);
            const ext = this.__recTq ?? (this.__recTq = this.getExtension('EXT_disjoint_timer_query_webgl2'));
            let q = null;
            if (ext && !this.__recQ) { q = this.createQuery(); this.beginQuery(ext.TIME_ELAPSED_EXT, q); this.__recQ = true; }
            const s = performance.now(), r = orig.apply(this, a), e = { t: T(), fn: name, w: img.width, h: img.height, cpu: +(performance.now() - s).toFixed(2), gpu: null };
            R.up.push(e);
            if (q) { this.endQuery(ext.TIME_ELAPSED_EXT); this.__recQ = false; pending.push([this, q, e]); }
            return r;
        };
    }
    setInterval(() => {
        for (let i = pending.length - 1; i >= 0; i--) {
            const [gl, q, e] = pending[i];
            if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) continue;
            e.gpu = +(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6).toFixed(2);
            gl.deleteQuery(q); pending.splice(i, 1);
        }
    }, 250);
}

export function stopRecording() { if (window.__rec) { window.__rec.on = false; window.__rec.obs?.disconnect(); } return window.__rec; }

/** How the page kept up over the recording (or from `from` ms on). */
export function summary(R = window.__rec, from = 0) {
    const st = a => a.length ? { n: a.length, avg: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2), max: +Math.max(...a).toFixed(1), sum: Math.round(a.reduce((x, y) => x + y, 0)) } : { n: 0 };
    const g = R.gaps.filter(x => x.t >= from), u = R.up.filter(x => x.t >= from), ev = R.ev.filter(x => x.t >= from);
    const kinds = {}; for (const e of ev) kinds[e.type] = (kinds[e.type] || 0) + 1;
    return {
        seconds: Math.round((R.now() - from) / 1000), input: kinds,
        lateFrames: st(g.map(x => x.ms)), over100: g.filter(x => x.ms > 100).map(x => [Math.round(x.t), x.ms]),
        longTasks: st(R.long.filter(x => x.t >= from).map(x => x.ms)),
        uploadsCpu: st(u.map(x => x.cpu)), uploadsGpu: st(u.filter(x => x.gpu != null).map(x => x.gpu)),
    };
}
