// Dev only: a relay so an agent outside the browser (curl) can ask the open generate page for region-pick pictures.
// The agent's GET /__job?cmd=… is held open until the page (tuning/region-agent.js, polling /__job/next) has run the
// job and POSTed its JSON answer to /__job/done?id=…; that answer is the agent's reply. Commands: see region-agent.js.

const queue = [], pollers = [], jobs = new Map();
let next = 1;

const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const feed = () => { while (queue.length && pollers.length) json(pollers.shift(), 200, queue.shift()); };

/** Handles the relay's routes; false if the request is not one of them. */
export function relay(req, res) {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/__job') {
        const id = next++, t = setTimeout(() => {
            jobs.delete(id);
            json(res, 504, { error: 'no page answered in 180 s: is generate.html open in the browser pane with a finished planet?' });
        }, 180000);
        jobs.set(id, { res, t }); queue.push({ id, params: Object.fromEntries(url.searchParams) }); feed();
        return true;
    }
    if (url.pathname === '/__job/next') {
        pollers.push(res); feed();
        // (an idle poll ends after 25 s so the browser never drops it; the page asks again)
        const t = setTimeout(() => { const i = pollers.indexOf(res); if (i >= 0) { pollers.splice(i, 1); res.writeHead(204); res.end(); } }, 25000);
        res.on('close', () => { clearTimeout(t); const i = pollers.indexOf(res); if (i >= 0) pollers.splice(i, 1); });
        return true;
    }
    if (url.pathname === '/__job/done' && req.method === 'POST') {
        const parts = [];
        req.on('data', (d) => parts.push(d));
        req.on('end', () => {
            const j = jobs.get(+url.searchParams.get('id'));
            if (j) { clearTimeout(j.t); jobs.delete(+url.searchParams.get('id')); j.res.writeHead(200, { 'Content-Type': 'application/json' }); j.res.end(Buffer.concat(parts)); }
            res.writeHead(200); res.end();
        });
        return true;
    }
    return false;
}
