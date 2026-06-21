const fs = require('fs');
const path = require('path');

let strongsData = null;

function loadData() {
  if (!strongsData) {
    const dataPath = path.join(__dirname, '../../data/strongs_hebrew.json');
    strongsData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  }
  return strongsData;
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  const params = event.queryStringParameters || {};
  const query = (params.q || '').trim().toLowerCase();

  if (!query) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing search query' }) };
  }

  const data = loadData();

  // If query looks like a Strong's number (e.g. "H1" or "1"), do exact lookup
  const numMatch = query.match(/^h?(\d+)$/i);
  if (numMatch) {
    const id = 'H' + numMatch[1];
    const entry = data.find(e => e.id === id);
    if (entry) {
      return { statusCode: 200, headers, body: JSON.stringify({ results: [entry], total: 1 }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ results: [], total: 0 }) };
  }

  // Search by definition and KJV usage (word-boundary matching)
  // Prefix a keyword with - to exclude it (e.g. "rough -through")
  const keywords = query.split(/\s+/);
  const includes = [];
  const excludes = [];
  for (const kw of keywords) {
    if (kw.startsWith('-') && kw.length > 1) {
      const word = kw.slice(1);
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      excludes.push(new RegExp(`\\b${escaped}\\b`, 'i'));
    } else {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      includes.push(new RegExp(`\\b${escaped}\\b`, 'i'));
    }
  }
  const results = data.filter(entry => {
    const combined = entry.def + ' ' + entry.kjv;
    return includes.every(re => re.test(combined)) && !excludes.some(re => re.test(combined));
  });

  // Cap at 100 results
  const capped = results.slice(0, 100);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ results: capped, total: results.length })
  };
};
