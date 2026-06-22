const fs = require('fs');
const path = require('path');

// Load commentary data
let commentaryData = null;

function loadData() {
  if (!commentaryData) {
    const dataPath = path.join(__dirname, '../../data/commentary.json');
    const raw = fs.readFileSync(dataPath, 'utf-8');
    commentaryData = JSON.parse(raw);
  }
  return commentaryData;
}

// Book code lookup (name/abbreviation -> code)
const BOOK_CODES = {
  'preface': '00',
  'genesis': '01', 'gen': '01',
  'exodus': '02', 'ex': '02', 'exod': '02',
  'leviticus': '03', 'lev': '03',
  'numbers': '04', 'num': '04',
  'deuteronomy': '05', 'deut': '05',
  'joshua': '06', 'josh': '06',
  'judges': '07', 'judg': '07',
  'ruth': '08',
  '1 samuel': '09', '1samuel': '09', '1sam': '09',
  '2 samuel': '10', '2samuel': '10', '2sam': '10',
  '1 kings': '11', '1kings': '11', '1ki': '11',
  '2 kings': '12', '2kings': '12', '2ki': '12',
  '1 chronicles': '13', '1chronicles': '13', '1chr': '13',
  '2 chronicles': '14', '2chronicles': '14', '2chr': '14',
  'ezra': '15',
  'nehemiah': '16', 'neh': '16',
  'esther': '17', 'est': '17',
  'job': '18',
  'psalms': '19', 'psalm': '19', 'ps': '19',
  'proverbs': '20', 'prov': '20',
  'ecclesiastes': '21', 'eccl': '21',
  'song of solomon': '22', 'song': '22', 'sos': '22',
  'isaiah': '23', 'isa': '23',
  'jeremiah': '24', 'jer': '24',
  'lamentations': '25', 'lam': '25',
  'ezekiel': '26', 'ezek': '26',
  'daniel': '27', 'dan': '27',
  'hosea': '28', 'hos': '28',
  'joel': '29',
  'amos': '30',
  'obadiah': '31', 'ob': '31',
  'jonah': '32',
  'micah': '33', 'mic': '33',
  'nahum': '34', 'nah': '34',
  'habakkuk': '35', 'hab': '35',
  'zephaniah': '36', 'zeph': '36',
  'haggai': '37', 'hag': '37',
  'zechariah': '38', 'zech': '38',
  'malachi': '39', 'mal': '39',
  'matthew': '40', 'matt': '40', 'mt': '40',
  'mark': '41', 'mk': '41',
  'luke': '42', 'lk': '42',
  'john': '43', 'jn': '43',
  'acts': '44',
  'romans': '45', 'rom': '45',
  '1 corinthians': '46', '1corinthians': '46', '1cor': '46',
  '2 corinthians': '47', '2corinthians': '47', '2cor': '47',
  'galatians': '48', 'gal': '48',
  'ephesians': '49', 'eph': '49',
  'philippians': '50', 'phil': '50',
  'colossians': '51', 'col': '51',
  '1 thessalonians': '52', '1thessalonians': '52', '1thess': '52',
  '2 thessalonians': '53', '2thessalonians': '53', '2thess': '53',
  '1 timothy': '54', '1timothy': '54', '1tim': '54',
  '2 timothy': '55', '2timothy': '55', '2tim': '55',
  'titus': '56', 'tit': '56',
  'philemon': '57', 'phm': '57',
  'hebrews': '58', 'heb': '58',
  'james': '59', 'jas': '59',
  '1 peter': '60', '1peter': '60', '1pet': '60',
  '2 peter': '61', '2peter': '61', '2pet': '61',
  '1 john': '62', '1john': '62', '1jn': '62',
  '2 john': '63', '2john': '63', '2jn': '63',
  '3 john': '64', '3john': '64', '3jn': '64',
  'jude': '65',
  'revelation': '66', 'rev': '66',
};

function getBookCode(bookName) {
  if (!bookName) return null;
  const lower = bookName.toLowerCase().trim();

  // Direct code match (e.g., "01", "40")
  if (/^\d{2}$/.test(lower)) {
    return lower;
  }

  // Name or abbreviation match
  if (BOOK_CODES[lower]) {
    return BOOK_CODES[lower];
  }

  // Partial match
  for (const [name, code] of Object.entries(BOOK_CODES)) {
    if (name.startsWith(lower) || lower.includes(name)) {
      return code;
    }
  }

  return null;
}

function getContext(text, keyword, contextChars = 150) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
  const contexts = [];
  let match;

  while ((match = regex.exec(text)) !== null && contexts.length < 3) {
    let start = Math.max(0, match.index - contextChars);
    let end = Math.min(text.length, match.index + match[0].length + contextChars);

    // Adjust to word boundaries
    if (start > 0) {
      const spacePos = text.lastIndexOf(' ', start);
      if (spacePos !== -1 && spacePos > start - 20) {
        start = spacePos + 1;
      }
    }

    if (end < text.length) {
      const spacePos = text.indexOf(' ', end);
      if (spacePos !== -1 && spacePos < end + 20) {
        end = spacePos;
      }
    }

    let context = text.slice(start, end).trim();
    const prefix = start > 0 ? '...' : '';
    const suffix = end < text.length ? '...' : '';

    contexts.push(`${prefix}${context}${suffix}`);
  }

  return contexts;
}

function search(keyword, bookFilter, maxResults = 50) {
  const data = loadData();
  const results = [];

  const bookCode = getBookCode(bookFilter);
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'gi');

  for (const doc of data.documents) {
    // Filter by book if specified
    if (bookCode && doc.book_code !== bookCode) {
      continue;
    }

    const matches = doc.text.match(regex);
    if (matches && matches.length > 0) {
      results.push({
        id: doc.id,
        title: doc.title,
        book: doc.book,
        book_code: doc.book_code,
        count: matches.length,
        contexts: getContext(doc.text, keyword)
      });

      if (results.length >= maxResults) {
        break;
      }
    }
  }

  return results;
}

function getReferences(bookFilter, chapter) {
  const data = loadData();
  const bookCode = getBookCode(bookFilter);

  if (!bookCode) {
    return { error: 'Invalid book' };
  }

  // Find the document for this book/chapter
  const doc = data.documents.find(d =>
    d.book_code === bookCode && d.chapter === parseInt(chapter)
  );

  if (!doc) {
    return { error: 'Chapter not found' };
  }

  return {
    id: doc.id,
    title: doc.title,
    book: doc.book,
    chapter: doc.chapter,
    references: doc.references || []
  };
}

function getBookStructure() {
  const data = loadData();
  return data.bookStructure || {};
}

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const params = event.queryStringParameters || {};
    const action = params.action || 'search';

    // Get book structure (for browse mode)
    if (action === 'structure') {
      const structure = getBookStructure();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ bookStructure: structure })
      };
    }

    // Get references for a specific book/chapter
    if (action === 'references') {
      const book = params.b || params.book || '';
      const chapter = params.c || params.chapter || '';

      if (!book || !chapter) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Book and chapter required' })
        };
      }

      const result = getReferences(book, chapter);
      if (result.error) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify(result)
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(result)
      };
    }

    // Default: keyword search
    const keyword = params.q || params.keyword || '';
    const book = params.b || params.book || '';
    const maxResults = parseInt(params.max) || 50;

    if (!keyword) {
      // Return book list if no keyword
      const data = loadData();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ books: data.books })
      };
    }

    const results = search(keyword, book, maxResults);
    const totalMatches = results.reduce((sum, r) => sum + r.count, 0);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        keyword,
        book: book || 'all',
        totalMatches,
        fileCount: results.length,
        results
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
