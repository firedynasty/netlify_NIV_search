const fs = require('fs');
const path = require('path');

// Load ESV Bible data
let bibleData = null;

function loadData() {
  if (!bibleData) {
    const dataPath = path.join(__dirname, '../../data/bible_esv.json');
    const raw = fs.readFileSync(dataPath, 'utf-8');
    bibleData = JSON.parse(raw);
  }
  return bibleData;
}

// ESV books currently available (add more as you scrape them)
const AVAILABLE_BOOKS = {
  'ephesians': { name: 'Ephesians', chapters: 6 },
  'philippians': { name: 'Philippians', chapters: 4 },
  'psalms': { name: 'Psalms', chapters: 150 },
};

// Book name normalization
function normalizeBookName(bookName) {
  if (!bookName) return null;
  const lower = bookName.toLowerCase().trim();

  if (AVAILABLE_BOOKS[lower]) return lower;

  for (const [key, info] of Object.entries(AVAILABLE_BOOKS)) {
    if (info.name.toLowerCase() === lower) return key;
  }

  const underscored = lower.replace(/\s+/g, '_');
  if (AVAILABLE_BOOKS[underscored]) return underscored;

  for (const key of Object.keys(AVAILABLE_BOOKS)) {
    if (key.startsWith(lower) || key.startsWith(underscored) || lower.startsWith(key)) {
      return key;
    }
  }

  return null;
}

function getCanonicalBookName(bookKey) {
  const info = AVAILABLE_BOOKS[bookKey];
  if (!info) return bookKey;
  return info.name;
}

function getContext(text, keyword, contextChars = 40) {
  const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const contexts = [];
  const seen = new Set();
  let match;

  while ((match = regex.exec(text)) !== null && contexts.length < 3) {
    let start = Math.max(0, match.index - contextChars);
    let end = Math.min(text.length, match.index + match[0].length + contextChars);

    if (start > 0) {
      const spacePos = text.lastIndexOf(' ', start);
      if (spacePos !== -1 && spacePos > start - 20) start = spacePos + 1;
    }

    if (end < text.length) {
      const spacePos = text.indexOf(' ', end);
      if (spacePos !== -1 && spacePos < end + 20) end = spacePos;
    }

    let context = text.slice(start, end).trim();
    if (seen.has(context)) continue;
    seen.add(context);

    const prefix = start > 0 ? '...' : '';
    const suffix = end < text.length ? '...' : '';
    const highlighted = context.replace(regex, '<mark>$&</mark>');
    contexts.push(`${prefix}${highlighted}${suffix}`);
  }

  return contexts;
}

function search(keyword, bookFilter, maxResults = 50) {
  const data = loadData();

  keyword = keyword.replace(/\s*[\r\n]+\s*[\s\S]*?Kindle Edition\.?\s*$/i, '');
  keyword = keyword.replace(/^["'\u201C\u201D\u2018\u2019]+|["'\u201C\u201D\u2018\u2019]+$/g, '');
  keyword = keyword.trim();

  const normalizedBook = normalizeBookName(bookFilter);
  const booksToSearch = normalizedBook
    ? [normalizedBook]
    : Object.keys(AVAILABLE_BOOKS);

  const words = keyword.split(/\s+/);
  const attempts = [];
  for (let len = words.length; len >= Math.min(3, words.length); len--) {
    attempts.push(words.slice(0, len).join(' '));
  }

  for (const attempt of attempts) {
    const results = [];
    const regex = new RegExp(attempt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');

    for (const bookKey of booksToSearch) {
      const canonicalName = getCanonicalBookName(bookKey);
      const bookData = data[canonicalName];

      if (!bookData || !bookData.chapters) continue;

      for (const [chapterNum, chapterText] of Object.entries(bookData.chapters)) {
        const matches = chapterText.match(regex);
        if (matches && matches.length > 0) {
          results.push({
            book: AVAILABLE_BOOKS[bookKey].name,
            bookKey: bookKey,
            chapter: parseInt(chapterNum),
            count: matches.length,
            contexts: getContext(chapterText, attempt)
          });

          if (results.length >= maxResults) break;
        }
      }

      if (results.length >= maxResults) break;
    }

    if (results.length > 0) {
      keyword = attempt;
      const bookOrder = Object.keys(AVAILABLE_BOOKS);
      results.sort((a, b) => {
        const orderA = bookOrder.indexOf(a.bookKey);
        const orderB = bookOrder.indexOf(b.bookKey);
        if (orderA !== orderB) return orderA - orderB;
        return a.chapter - b.chapter;
      });
      return { keyword, results };
    }
  }

  return { keyword, results: [] };
}

function getChapter(bookFilter, chapter) {
  const data = loadData();
  const normalizedBook = normalizeBookName(bookFilter);

  if (!normalizedBook) return { error: 'Invalid book' };

  const canonicalName = getCanonicalBookName(normalizedBook);
  const bookData = data[canonicalName];

  if (!bookData || !bookData.chapters) return { error: 'Book not found' };

  const chapterText = bookData.chapters[chapter.toString()];
  if (!chapterText) return { error: 'Chapter not found' };

  return {
    book: AVAILABLE_BOOKS[normalizedBook].name,
    bookKey: normalizedBook,
    chapter: parseInt(chapter),
    text: chapterText
  };
}

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const params = event.queryStringParameters || {};
    const action = params.action || 'search';

    if (action === 'chapter') {
      const book = params.b || params.book || '';
      const chapter = params.c || params.chapter || '';

      if (!book || !chapter) {
        return {
          statusCode: 400, headers,
          body: JSON.stringify({ error: 'Book and chapter required' })
        };
      }

      const result = getChapter(book, chapter);
      if (result.error) {
        return { statusCode: 404, headers, body: JSON.stringify(result) };
      }

      return { statusCode: 200, headers, body: JSON.stringify(result) };
    }

    // Default: keyword search
    const keyword = params.q || params.keyword || '';
    const book = params.b || params.book || '';
    const maxResults = parseInt(params.max) || 50;

    if (!keyword) {
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ books: AVAILABLE_BOOKS })
      };
    }

    const searchResult = search(keyword, book, maxResults);
    const totalMatches = searchResult.results.reduce((sum, r) => sum + r.count, 0);

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        keyword: searchResult.keyword,
        book: book || 'all',
        totalMatches,
        chapterCount: searchResult.results.length,
        results: searchResult.results
      })
    };
  } catch (error) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
