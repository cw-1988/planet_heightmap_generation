// A tip's words into its pop-up (js/a11y.js, the Evolution page's own): its data-tip line by line — a line starting
// "- " a point of a list (one after another, one list); a line "{colour}Name: …" a legend line, its Name drawn bold in
// that colour (the By regime tip's river colours); any other a paragraph. Text only, never HTML.

/** Fills el with the tip's text. */
export function fillTip(el, text) {
    el.replaceChildren();
    let list = null;
    for (const line of String(text).split('\n').map(s => s.trim()).filter(Boolean)) {
        if (line.startsWith('- ')) {
            if (!list) list = el.appendChild(document.createElement('ul'));
            list.appendChild(document.createElement('li')).textContent = line.slice(2);
            continue;
        }
        list = null;
        const p = el.appendChild(document.createElement('p')), key = /^\{([^}]+)\}([^:]+):\s*(.*)$/.exec(line);
        if (!key) { p.textContent = line; continue; }
        const name = p.appendChild(document.createElement('b'));
        name.style.color = key[1]; name.textContent = key[2];
        p.append(`: ${key[3]}`);
    }
}
