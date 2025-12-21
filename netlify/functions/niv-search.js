const fs = require('fs');
const path = require('path');

// Load NIV Bible data
let bibleData = null;

function loadData() {
  if (!bibleData) {
    const dataPath = path.join(__dirname, '../../data/bible_niv.json');
    const raw = fs.readFileSync(dataPath, 'utf-8');
    bibleData = JSON.parse(raw);
  }
  return bibleData;
}

// Available books with their chapter counts
const AVAILABLE_BOOKS = {
  'genesis': { name: 'Genesis', chapters: 50 },
  'psalms': { name: 'Psalms', chapters: 150 },
  'john': { name: 'John', chapters: 21 },
  'romans': { name: 'Romans', chapters: 15 }
};

// Book name normalization
function normalizeBookName(bookName) {
  if (!bookName) return null;
  const lower = bookName.toLowerCase().trim();

  // Direct match
  if (AVAILABLE_BOOKS[lower]) {
    return lower;
  }

  // Partial match
  for (const key of Object.keys(AVAILABLE_BOOKS)) {
    if (key.startsWith(lower) || lower.startsWith(key)) {
      return key;
    }
  }

  return null;
}

// Get the canonical book name (with proper casing) from the JSON
function getCanonicalBookName(bookKey) {
  const keyMap = {
    'genesis': 'Genesis',
    'psalms': 'Psalms',
    'john': 'John',
    'romans': 'Romans'
  };
  return keyMap[bookKey] || bookKey;
}

function getContext(text, keyword, contextChars = 150) {
  const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
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

    // Highlight the match
    const highlighted = context.replace(regex, '<mark>$&</mark>');
    contexts.push(`${prefix}${highlighted}${suffix}`);
  }

  return contexts;
}

function search(keyword, bookFilter, maxResults = 50) {
  const data = loadData();
  const results = [];

  const normalizedBook = normalizeBookName(bookFilter);
  const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');

  // Determine which books to search
  const booksToSearch = normalizedBook
    ? [normalizedBook]
    : Object.keys(AVAILABLE_BOOKS);

  for (const bookKey of booksToSearch) {
    const canonicalName = getCanonicalBookName(bookKey);
    const bookData = data[canonicalName];

    if (!bookData || !bookData.chapters) continue;

    // Search each chapter
    for (const [chapterNum, chapterText] of Object.entries(bookData.chapters)) {
      const matches = chapterText.match(regex);
      if (matches && matches.length > 0) {
        results.push({
          book: canonicalName,
          bookKey: bookKey,
          chapter: parseInt(chapterNum),
          count: matches.length,
          contexts: getContext(chapterText, keyword)
        });

        if (results.length >= maxResults) {
          break;
        }
      }
    }

    if (results.length >= maxResults) {
      break;
    }
  }

  // Sort by book order, then chapter
  const bookOrder = ['genesis', 'psalms', 'john', 'romans'];
  results.sort((a, b) => {
    const orderA = bookOrder.indexOf(a.bookKey);
    const orderB = bookOrder.indexOf(b.bookKey);
    if (orderA !== orderB) return orderA - orderB;
    return a.chapter - b.chapter;
  });

  return results;
}

function getChapter(bookFilter, chapter) {
  const data = loadData();
  const normalizedBook = normalizeBookName(bookFilter);

  if (!normalizedBook) {
    return { error: 'Invalid book' };
  }

  const canonicalName = getCanonicalBookName(normalizedBook);
  const bookData = data[canonicalName];

  if (!bookData || !bookData.chapters) {
    return { error: 'Book not found' };
  }

  const chapterText = bookData.chapters[chapter.toString()];
  if (!chapterText) {
    return { error: 'Chapter not found' };
  }

  return {
    book: canonicalName,
    bookKey: normalizedBook,
    chapter: parseInt(chapter),
    text: chapterText
  };
}

function getBookStructure() {
  const data = loadData();
  const structure = {};

  for (const [bookKey, info] of Object.entries(AVAILABLE_BOOKS)) {
    const canonicalName = getCanonicalBookName(bookKey);
    const bookData = data[canonicalName];

    if (bookData && bookData.chapters) {
      const chapters = Object.keys(bookData.chapters)
        .map(n => parseInt(n))
        .sort((a, b) => a - b);

      structure[bookKey] = {
        name: canonicalName,
        chapters: chapters,
        chapterCount: chapters.length
      };
    }
  }

  return structure;
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

    // Get chapter text
    if (action === 'chapter') {
      const book = params.b || params.book || '';
      const chapter = params.c || params.chapter || '';

      if (!book || !chapter) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Book and chapter required' })
        };
      }

      const result = getChapter(book, chapter);
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
      // Return available books if no keyword
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ books: AVAILABLE_BOOKS })
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
        chapterCount: results.length,
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
