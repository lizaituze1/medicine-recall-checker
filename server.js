require('dotenv').config();
const express = require('express');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
const FDA_KEY = process.env.OPENFDA_API_KEY;
const BASE = 'https://api.fda.gov/drug';

app.use((req, res, next) => {
  res.set('X-Served-By', os.hostname());
  next();
});

app.use(express.static('public'));

const cache = new Map();
const TTL = 10 * 60 * 1000;

async function fdaGet(endpoint, params) {
    const url = new URL(`${BASE}/${endpoint}.json`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
    if (FDA_KEY) url.searchParams.set('api_key', FDA_KEY);

    const cacheKey = url.toString();
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.time < TTL) return hit.data;

    const r = await fetch(url);
    if (r.status === 404) return { results: [] };
    if (r.status === 429) throw new Error('RATE_LIMIT');
    if (!r.ok) throw new Error(`Upstream status ${r.status}`);

    const data = await r.json();
    cache.set(cacheKey, { data, time: Date.now() });
    return data;
}

function cleanDrug(raw) {
    const drug = String(raw || '').replace(/["\\]/g, '').trim();
    if (drug.length < 2 || drug.length > 60) return null;
    return drug;
}

function handleError(err, res) {
    console.error(err.message);
    if (err.message === 'RATE_LIMIT') {
        return res.status(429).json({ error: 'Too many requests right now. Please wait a minute and try again.' });
    }
    res.status(502).json({ error: 'The FDA data service is unavailable right now. Please try again later.' });
}

app.get('/api/recalls', async (req, res) => {
    const drug = cleanDrug(req.query.drug);
    if (!drug) return res.status(400).json({ error: 'Please enter a medicine name (2 to 60 characters).' });
    try {
        const data = await fdaGet('enforcement', {
            search: `product_description:"${drug}" OR  openfda.generic_name:"${drug}" OR openfda.brand_name:"${drug}"`,
            sort: 'report_date:desc',
            limit: '100',
        });
        const recalls = (data.results || []).map((x) => ({
            recallNumber: x.recall_number,
            firm: x.recalling_firm,
            reason: x.reason_for_recall,
            classification: x.classification,
            status: x.status,
            product: x.product_description,
            date: x.recall_initiation_date,
            distribution: x.distribution_pattern,
        }));
        res.json({ drug, recalls });
    } catch (err) {
        handleError(err, res);
    }
});

app.get('/api/side-effects', async (req, res) => {
    const drug = cleanDrug(req.query.drug);
    if (!drug) return res.status(400).json({ error: 'Please enter a medicine name (2 to 60 characters).' });
    try {
        const data = await fdaGet('event', {
            search: `patient.drug.openfda.brand_name:"${drug}" OR patient.drug.openfda.generic_name:"${drug}"`,
            count: 'patient.reaction.reactionmeddrapt.exact',
            limit: '10',
        });
        res.json({ drug, effects: data.results || [] });
    } catch (err) {
        handleError(err, res);
    }
});

app.get('/api/label', async (req, res) => {
    const drug = cleanDrug(req.query.drug);
    if (!drug) return res.status(400).json({ error: 'Please enter a medicine name (2 to 60 characters).' });
    try {
        const data = await fdaGet('label', {
            search: `openfda.brand_name:"${drug}" OR openfda.generic_name:"${drug}"`,
            limit: '1',
        });
        const l = (data.results || [])[0];
        if (!l) return res.json({ drug, found: false });
        const short = (arr) => (arr && arr[0] ? String(arr[0]).slice(0, 1500) : null);
        res.json({
            drug,
            found: true,
            brandName: (l.openfda?.brand_name || [])[0] || null,
            genericName: (l.openfda?.generic_name || [])[0] || null,
            boxedWarning: short(l.boxed_warning),
            warnings: short(l.warnings),
            uses: short(l.indications_and_usage),
        });
    } catch (err) {
        handleError(err, res);
    }
});

app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));
