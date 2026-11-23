const form = document.getElementById('search-form');
const drugEl = document.getElementById('drug');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const titleEl = document.getElementById('result-title');
const recallListEl = document.getElementById('recall-list');
const recallCountEl = document.getElementById('recall-count');
const effectsPanel = document.getElementById('panel-effects');
const labelPanel = document.getElementById('panel-label');
const filterEl = document.getElementById('recall-filter');
const classEl = document.getElementById('class-filter');
const statusFilterEl = document.getElementById('status-filter');
const sortEl = document.getElementById('sort');

let recalls = [];

function setStatus(msg, isError = false) {
    statusEl.textContent = msg;
    statusEl.className = isError ? 'error' : '';
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

async function getJson(url) {
    let res;
    try{
        res = await fetch(url);
    } catch {
        throw new Error('Cannot reach the server. Check your internet connection.');
    }
    let data;
    try {
        data = await res.json();
    } catch {
        throw new Error('The server sent an unexpected response.');
    }
    if (!res.ok) throw new Error(data.error || 'Request failed.');
    return data;
}

function formatDate(d) {
    if (!d || d.length !== 8) return 'Unknown date';
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
}

function classCss(c) {
    if (c === 'Class I') return 'c1';
    if (c === 'Class II') return 'c2';
    if (c === 'Class III') return 'c3';
    return '';
}

async function search(name) {
    name = name.trim();
    if (name.length < 2) {
        setStatus('Please type at least 2 characters.', true);
        return;
    }
    drugEl.value = name;
    resultsEl.classList.add('hidden');
    setStatus(`Searching FDA data for "${name}"...`);

    const q = encodeURIComponent(name);
    const [rec, eff, lab] = await Promise.allSettled([
      getJson(`/api/recalls?drug=${q}`),
      getJson(`/api/side-effects?drug=${q}`),
      getJson(`/api/label?drug=${q}`),
    ]);

    if (rec.status === 'rejected' && eff.status === 'rejected' && lab.status === 'rejected') {
      setStatus(`⚠️ ${rec.reason.message}`, true);
      return;
    }

    setStatus('');
    titleEl.textContent = `Results for "${name}"`;
    resultsEl.classList.remove('hidden');

    if (rec.status === 'fulfilled') {
        recalls = rec.value.recalls;
        renderRecalls();
    } else {
        recalls = [];
        recallListEl.replaceChildren(el('p', 'muted', `⚠️ ${rec.reason.message}`));
        recallCountEl.textContent = '';
    }

    if (eff.status === 'fulfilled') renderEffects(eff.value.effects);
    else effectsPanel.replaceChildren(el('p', 'muted', `⚠️ ${eff.reason.message}`));


    if (lab.status === 'fulfilled') renderLabel(lab.value);
    else labelPanel.replaceChildren(el('p', 'muted', `⚠️ ${lab.reason.message}`));
}

function renderRecalls() {
    const q = filterEl.value.trim().toLowerCase();
    const cls = classEl.value;
    const st = statusFilterEl.value;

    let list = recalls.filter((r) => {
        if (cls && r.classification !== cls) return false;
        if (st && r.status !== st) return false;
        if (!q) return true;
        return [r.reason, r.firm, r.product].join(' ').toLowerCase().includes(q);
    });

    const sorters = {
        'date-desc': (a, b) => (b.date || '').localeCompare(a.date || ''),
        'date-asc': (a, b) => (a.date || '').localeCompare(b.date || ''),
        class: (a, b) => (a.classification || '').localeCompare(b.classification || ''),
        firm: (a, b) => (a.firm || '').localeCompare(b.firm || ''),
    };
    list.sort(sorters[sortEl.value]);

    recallListEl.replaceChildren();

    if (recalls.length === 0) {
        recallCountEl.textContent = '';
        recallListEl.appendChild(el('p', null, '✅ No FDA recalls found for this medicine name.'));
        return;
    }
    recallCountEl.textContent = `Showing ${list.length} of ${recalls.length} recalls`;
    if (list.length === 0) {
        recallListEl.appendChild(el('p', 'muted', 'No recalls match your filters. Try clearing them.'));
        return;
    }

    list.forEach((r) => {
        const card = el('article', `recall ${classCss(r.classification)}`);

        const top = el('p');
        top.append(
            el('span', `badge ${classCss(r.classification)}`, r.classification || 'Unclassified'),
            el('span', 'badge status', r.status || 'Unknown'),
            el('span', 'muted', formatDate(r.date))
        );

        card.append(
            top,
            el('h3', null, r.firm || 'Unknown company'),
            el('p', null, `Reason: ${r.reason || 'Not given'}`)
        );

        const details = el('details');
        details.appendChild(el('summary', null, 'Product and distribution'));
        details.appendChild(el('p', null, `Product: ${r.product || 'N/A'}`));
        details.appendChild(el('p', null, `Distribution: ${r.distribution || 'N/A'}`));
        details.appendChild(el('p', 'muted', `Recall number: ${r.recallNumber || 'N/A'}`));
        card.appendChild(details);

        recallListEl.appendChild(card);
    });
}

function renderEffects(effects) {
    effectsPanel.replaceChildren();
    if (!effects || effects.length === 0) {
        effectsPanel.appendChild(el('p', null, 'No side-effect reports found for this medicine name.'));
        return;
    }
    effectsPanel.appendChild(
        el('p', 'muted', 'Most frequently reported reactions (FDA adverse event reports). A report does not prove the medicine caused the reaction.')  
    );
    const max = Math.max(...effects.map((e) => e.count));
    effects.forEach((e) => {
        const row = el('div', 'bar-row');
        const track = el('div', 'bar-track');
        const fill = el('div', 'bar-fill');
        fill.style.width = `${Math.round((e.count / max) * 100)}%`;
        track.appendChild(fill);
        row.append(el('span', null, e.term), track, el('span', 'bar-count', e.count.toLocaleString()));
        effectsPanel.appendChild(row);
    });
}

function renderLabel(label) {
    labelPanel.replaceChildren();
    if (!label.found) {
        labelPanel.appendChild(el('p', null, 'No official label found for this medicine name.'));
        return;
    }
    labelPanel.appendChild(
        el('p', 'muted', `Label found for: ${label.brandName || 'N/A'} (${label.genericName || 'N/A'}). Text is shortened; read the full label on the package.`)
    );
    const sections = [
        ['⚠️ Boxed warning', label.boxedWarning, true],
        ['Warnings', label.warnings, false],
        ['Uses', label.uses, false],
    ];
    sections.forEach(([heading, text, boxed]) => {
        if (!text) return;
        const box = el('div', boxed ? 'warn-box boxed' : 'warn-box');
        box.append(el('h3', null, heading), el('p', null, text));
        labelPanel.appendChild(box);
    });
}
form.addEventListener('submit', (e) => {
    e.preventDefault();
    search(drugEl.value);
});

document.querySelectorAll('.chip').forEach((chip) =>
    chip.addEventListener('click', () => search(chip.textContent))
);

[filterEl, classEl, statusFilterEl, sortEl].forEach((c) =>c.addEventListener('input', renderRecalls));

document.querySelectorAll('.tab').forEach((tab) => 
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        ['recalls', 'effects', 'label'].forEach((name) =>
            document.getElementById(`panel-${name}`).classList.toggle('hidden', name !== tab.dataset.tab)
        );
    })
);
    