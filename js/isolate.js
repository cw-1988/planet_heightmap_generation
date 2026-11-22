// The cross-origin isolation toggle (docs/shared-memory.md), loaded by support-check.js on the app's pages. ?isolate=1
// turns it on, ?isolate=0 off; this browser remembers it. On, the service worker isolate-sw.js serves the site with the
// isolation headers (one reload, the first time), and the workers share memory instead of copying it
// (v2/js/core/shared-memory.js). Off, that worker is unregistered and everything is as before.
(function () {
    var KEY = 'orogen.isolate', RELOADED = 'orogen.isolate.reloaded';
    var asked = new URLSearchParams(location.search).get('isolate'), on = false;
    try {
        if (asked === '1') localStorage.setItem(KEY, '1');
        else if (asked === '0') localStorage.removeItem(KEY);
        on = localStorage.getItem(KEY) === '1';
    } catch (e) { on = asked === '1'; }
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    var sw = new URL('../isolate-sw.js', document.currentScript.src).href;
    var reloadOnce = function () {
        // (once a session: a browser that won't isolate even so doesn't reload for ever)
        try { if (sessionStorage.getItem(RELOADED)) return; sessionStorage.setItem(RELOADED, '1'); } catch (e) { return; }
        location.reload();
    };
    if (on) {
        if (window.crossOriginIsolated) { try { sessionStorage.removeItem(RELOADED); } catch (e) { /* none */ } return; }
        navigator.serviceWorker.register(sw).then(function () {
            if (navigator.serviceWorker.controller) reloadOnce();          // (served by it already, but before it was on)
            else navigator.serviceWorker.addEventListener('controllerchange', reloadOnce);
        }, function (err) { console.warn('Isolation toggle: the service worker did not register', err); });
    } else {
        navigator.serviceWorker.getRegistrations().then(function (regs) {
            regs.forEach(function (reg) {
                var w = reg.active || reg.waiting || reg.installing;
                if (w && w.scriptURL === sw) reg.unregister().then(function () { if (window.crossOriginIsolated) location.reload(); });
            });
        });
    }
})();
