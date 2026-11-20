// When a build, import or export fails (out of memory at high Detail, a climate error, a crashed worker), the build
// overlay becomes a message with a Close button instead of spinning over the page until a reload. Shared by Generate
// (js/main.js) and Import (js/import-main.js); js/generate.js announces failures as the 'orogen:build-failed' event.
// While a build runs the overlay sits behind the page's controls, over the planet only; the controls stay in view but
// are held (inert), since a job started mid-build (a code loaded, a climate slider or tab) would cross it; the view
// strip stays live (LIVE below).

const HELD = ['ui', 'layerBar', 'mobileViewSwitch', 'editToggle', 'refreshFab', 'rebuildFab'];

const OUT_OF_MEMORY = /out of memory|allocation failed|invalid array length|array buffer|rangeerror/i;

/** A short, plain explanation of what went wrong, for the overlay. */
export function describeFailure(message, action = 'build this planet') {
    if (OUT_OF_MEMORY.test(message || '')) return `This device ran out of memory trying to ${action}. Try a lower Detail.`;
    return `Something went wrong trying to ${action}. Try again, or reload the page if it keeps happening.`;
}

/** Show the failure in the build overlay; Close hides it. */
export function showBuildError(text, detail = '') {
    const overlay = document.getElementById('buildOverlay');
    if (!overlay) return;
    let box = overlay.querySelector('.build-error');
    if (!box) {
        box = document.createElement('div');
        box.className = 'build-error';
        box.setAttribute('role', 'alert');
        box.innerHTML = '<p class="build-error-text"></p><p class="build-error-detail"></p><button type="button" class="build-error-close">Close</button>';
        overlay.querySelector('.build-overlay-inner').appendChild(box);
        box.querySelector('.build-error-close').addEventListener('click', () => {
            overlay.classList.remove('failed', 'initial');
            overlay.classList.add('hidden');
        });
    }
    box.querySelector('.build-error-text').textContent = text;
    box.querySelector('.build-error-detail').textContent = detail ? `(${detail})` : '';
    overlay.classList.add('failed');
    overlay.classList.remove('hidden');
    box.querySelector('.build-error-close').focus();
}

// Live on every page mid-build, wherever they sit (the layer bar, or the panel's bottom sheet on a phone): the view strip
// and its fold arrow. They only change how the picture is drawn (globe or map, grid, hillshade, clouds, rivers), never
// start a job (owner, 2026-11-20: "i also want those option to be adjustable WHILE generating"; docs/view-memory.md).
const LIVE = ['viewStrip', 'viewFold'];
let held = [];

/** `el` held, or — where a live control sits inside it — each of its children down to that control's path. */
function hold(el, live) {
    if (live.includes(el)) return;
    if (!live.some(l => el.contains(l))) { el.setAttribute('inert', ''); held.push(el); return; }
    for (const child of el.children) hold(child, live);
}

/** Hold the controls while a build runs (true), release them after (false); `keep`: those a page leaves live (Generate's
 *  panel: a setting changed mid-build restarts the build, js/main.js). The view strip always stays live (LIVE). */
export function holdControls(on, keep = []) {
    for (const el of held) el.removeAttribute('inert');
    held = [];
    if (!on) return;
    const live = LIVE.map(id => document.getElementById(id)).filter(Boolean);
    for (const id of HELD) if (!keep.includes(id)) { const el = document.getElementById(id); if (el) hold(el, live); }
}

/** Back to the ordinary progress overlay (a new build starting). */
export function clearBuildError() {
    document.getElementById('buildOverlay')?.classList.remove('failed');
}
