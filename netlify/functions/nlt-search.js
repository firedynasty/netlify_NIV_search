const fs = require('fs');
const path = require('path');

// Load NLT Bible data
let bibleData = null;

function loadData() {
  if (!bibleData) {
    const dataPath = path.join(__dirname, '../../data/bible_nlt.json');
    const raw = fs.readFileSync(dataPath, 'utf-8');
    bibleData = JSON.parse(raw);
  }
  return bibleData;
}

// All 66 books with chapter counts
const AVAILABLE_BOOKS = {
  'genesis': { name: 'Genesis', chapters: 50 },
  'exodus': { name: 'Exodus', chapters: 40 },
  'leviticus': { name: 'Leviticus', chapters: 27 },
  'numbers': { name: 'Numbers', chapters: 36 },
  'deuteronomy': { name: 'Deuteronomy', chapters: 34 },
  'joshua': { name: 'Joshua', chapters: 24 },
  'judges': { name: 'Judges', chapters: 21 },
  'ruth': { name: 'Ruth', chapters: 4 },
  '1_samuel': { name: '1 Samuel', chapters: 31 },
  '2_samuel': { name: '2 Samuel', chapters: 24 },
  '1_kings': { name: '1 Kings', chapters: 22 },
  '2_kings': { name: '2 Kings', chapters: 25 },
  '1_chronicles': { name: '1 Chronicles', chapters: 29 },
  '2_chronicles': { name: '2 Chronicles', chapters: 36 },
  'ezra': { name: 'Ezra', chapters: 10 },
  'nehemiah': { name: 'Nehemiah', chapters: 13 },
  'esther': { name: 'Esther', chapters: 10 },
  'job': { name: 'Job', chapters: 42 },
  'psalms': { name: 'Psalms', chapters: 150 },
  'proverbs': { name: 'Proverbs', chapters: 31 },
  'ecclesiastes': { name: 'Ecclesiastes', chapters: 12 },
  'song_of_solomon': { name: 'Song of Solomon', chapters: 8 },
  'isaiah': { name: 'Isaiah', chapters: 66 },
  'jeremiah': { name: 'Jeremiah', chapters: 52 },
  'lamentations': { name: 'Lamentations', chapters: 5 },
  'ezekiel': { name: 'Ezekiel', chapters: 48 },
  'daniel': { name: 'Daniel', chapters: 12 },
  'hosea': { name: 'Hosea', chapters: 14 },
  'joel': { name: 'Joel', chapters: 3 },
  'amos': { name: 'Amos', chapters: 9 },
  'obadiah': { name: 'Obadiah', chapters: 1 },
  'jonah': { name: 'Jonah', chapters: 4 },
  'micah': { name: 'Micah', chapters: 7 },
  'nahum': { name: 'Nahum', chapters: 3 },
  'habakkuk': { name: 'Habakkuk', chapters: 3 },
  'zephaniah': { name: 'Zephaniah', chapters: 3 },
  'haggai': { name: 'Haggai', chapters: 2 },
  'zechariah': { name: 'Zechariah', chapters: 14 },
  'malachi': { name: 'Malachi', chapters: 4 },
  'matthew': { name: 'Matthew', chapters: 28 },
  'mark': { name: 'Mark', chapters: 16 },
  'luke': { name: 'Luke', chapters: 24 },
  'john': { name: 'John', chapters: 21 },
  'acts': { name: 'Acts', chapters: 28 },
  'romans': { name: 'Romans', chapters: 16 },
  '1_corinthians': { name: '1 Corinthians', chapters: 16 },
  '2_corinthians': { name: '2 Corinthians', chapters: 13 },
  'galatians': { name: 'Galatians', chapters: 6 },
  'ephesians': { name: 'Ephesians', chapters: 6 },
  'philippians': { name: 'Philippians', chapters: 4 },
  'colossians': { name: 'Colossians', chapters: 4 },
  '1_thessalonians': { name: '1 Thessalonians', chapters: 5 },
  '2_thessalonians': { name: '2 Thessalonians', chapters: 3 },
  '1_timothy': { name: '1 Timothy', chapters: 6 },
  '2_timothy': { name: '2 Timothy', chapters: 4 },
  'titus': { name: 'Titus', chapters: 3 },
  'philemon': { name: 'Philemon', chapters: 1 },
  'hebrews': { name: 'Hebrews', chapters: 13 },
  'james': { name: 'James', chapters: 5 },
  '1_peter': { name: '1 Peter', chapters: 5 },
  '2_peter': { name: '2 Peter', chapters: 3 },
  '1_john': { name: '1 John', chapters: 5 },
  '2_john': { name: '2 John', chapters: 1 },
  '3_john': { name: '3 John', chapters: 1 },
  'jude': { name: 'Jude', chapters: 1 },
  'revelation': { name: 'Revelation', chapters: 22 },
};

// Book name normalization
function normalizeBookName(bookName) {
  if (!bookName) return null;
  const lower = bookName.toLowerCase().trim();

  // Direct match
  if (AVAILABLE_BOOKS[lower]) {
    return lower;
  }

  // Match by display name (e.g. "1 samuel" -> "1_samuel")
  for (const [key, info] of Object.entries(AVAILABLE_BOOKS)) {
    if (info.name.toLowerCase() === lower) {
      return key;
    }
  }

  // Try with spaces replaced by underscores (e.g. "1 john" -> "1_john")
  const underscored = lower.replace(/\s+/g, '_');
  if (AVAILABLE_BOOKS[underscored]) {
    return underscored;
  }

  // Partial match (against keys and underscore variant)
  for (const key of Object.keys(AVAILABLE_BOOKS)) {
    if (key.startsWith(lower) || key.startsWith(underscored) || lower.startsWith(key)) {
      return key;
    }
  }

  return null;
}

// Get the canonical book name from the JSON key format
// JSON uses folder names like "1_Samuel", we need to match that
function getCanonicalBookName(bookKey) {
  const info = AVAILABLE_BOOKS[bookKey];
  if (!info) return bookKey;
  // The JSON keys use folder-style names with underscores
  return info.name.replace(/ /g, '_');
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

    // Skip duplicate context windows
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
  const results = [];

  const normalizedBook = normalizeBookName(bookFilter);
  const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');

  const booksToSearch = normalizedBook
    ? [normalizedBook]
    : Object.keys(AVAILABLE_BOOKS);

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
  const bookOrder = Object.keys(AVAILABLE_BOOKS);
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
    book: AVAILABLE_BOOKS[normalizedBook].name,
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
        name: info.name,
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

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const params = event.queryStringParameters || {};
    const action = params.action || 'search';

    if (action === 'structure') {
      const structure = getBookStructure();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ bookStructure: structure })
      };
    }

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
