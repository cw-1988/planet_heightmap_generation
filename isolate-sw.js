// The ?isolate=1 toggle's service worker (js/isolate.js registers it, docs/shared-memory.md): GitHub Pages can't send
// headers, so this adds the two that make the site cross-origin isolated to every response it serves, which lets the
// workers share memory (SharedArrayBuffer). Cross-Origin-Opener-Policy keeps other sites' windows out of the page's
// process; Cross-Origin-Embedder-Policy lets in only what agrees to be loaded (same origin, or CORS, as jsDelivr's
// modules are). Off (?isolate=0) it is unregistered.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
    const r = e.request;
    if (r.cache === 'only-if-cached' && r.mode !== 'same-origin') return;   // (a request a worker can't make)
    e.respondWith(fetch(r).then(res => {
        if (res.status === 0) return res;                                    // (opaque: its headers are not ours to set)
        const h = new Headers(res.headers);
        h.set('Cross-Origin-Embedder-Policy', 'require-corp');
        h.set('Cross-Origin-Opener-Policy', 'same-origin');
        h.set('Cross-Origin-Resource-Policy', 'cross-origin');
        return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
    }));
});
