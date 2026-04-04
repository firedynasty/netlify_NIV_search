const fs = require('fs');
const path = require('path');

let hymnsData = null;
let similarityIndex = null;

function loadHymns() {
  if (!hymnsData) {
    hymnsData = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/hymns.json'), 'utf-8'));
  }
  return hymnsData;
}

function loadIndex() {
  if (!similarityIndex) {
    const p = path.join(__dirname, '../../data/hymn_similarities.json');
    if (fs.existsSync(p)) {
      similarityIndex = JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
  }
  return similarityIndex;
}

// Find hymns whose title contains the query, or match by number
function findHymn(query) {
  const hymns = loadHymns();
  const q = query.toLowerCase().trim();

  // Exact hymn number match first
  const numMatch = hymns.find(h => h.num.replace('#', '') === q || h.num.toLowerCase() === q);
  if (numMatch) return { type: 'exact', hymn: numMatch };

  // Title substring matches
  const titleMatches = hymns.filter(h => h.title.toLowerCase().includes(q));
  if (titleMatches.length === 1) return { type: 'exact', hymn: titleMatches[0] };
  if (titleMatches.length > 1) return { type: 'multiple', hymns: titleMatches };

  return { type: 'none' };
}

// Fallback: topic-overlap similarity when no AI index available
function topicOverlapSimilar(targetHymn, top = 15) {
  const hymns = loadHymns();
  const targetTopics = new Set(targetHymn.topics);

  const scores = hymns
    .filter(h => h.num !== targetHymn.num)
    .map(h => {
      const hTopics = new Set(h.topics);
      const shared = [...targetTopics].filter(t => hTopics.has(t));
      const union = new Set([...targetTopics, ...hTopics]);
      const score = shared.length / union.size;
      return { hymn: h.num, title: h.title, score: parseFloat(score.toFixed(4)), shared_topics: shared };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, top);

  return scores;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const params = event.queryStringParameters || {};
    let query = (params.q || '').trim();
    query = query.replace(/^["'\u201C\u201D\u2018\u2019]+|["'\u201C\u201D\u2018\u2019]+$/g, '').trim();

    if (!query) {
      return { statusCode: 200, headers, body: JSON.stringify({ status: 'empty' }) };
    }

    const found = findHymn(query);

    // Multiple title matches — return list for user to pick from
    if (found.type === 'multiple') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: 'multiple',
          matches: found.hymns.map(h => ({ num: h.num, title: h.title })),
        }),
      };
    }

    if (found.type === 'none') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ status: 'not_found', query }),
      };
    }

    // Single match — look up similar hymns
    const hymn = found.hymn;
    const index = loadIndex();
    let similar, aiIndex;

    if (index && index[hymn.num]) {
      similar = index[hymn.num].similar;
      aiIndex = true;
    } else {
      similar = topicOverlapSimilar(hymn);
      aiIndex = false;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: 'found',
        aiIndex,
        hymn: { num: hymn.num, title: hymn.title, topics: hymn.topics },
        similar,
      }),
    };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
