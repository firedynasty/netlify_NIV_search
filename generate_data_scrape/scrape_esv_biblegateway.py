#!/usr/bin/env python3
"""
Scrape ESV Bible chapters from BibleGateway using Chrome remote debugging.
Outputs JSON matching the bible_nlt.json format used by the search function.

Prerequisites:
    pip install selenium webdriver-manager beautifulsoup4

Start Chrome first:
    /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
        --remote-debugging-port=9222 --user-data-dir=/tmp/chrome_debug_profile

Usage:
    python scrape_esv_biblegateway.py
    python scrape_esv_biblegateway.py --output ../data/bible_esv.json
    python scrape_esv_biblegateway.py --delay 8
    python scrape_esv_biblegateway.py --add Romans Romans 16
    python scrape_esv_biblegateway.py --rebuild
"""

import json
import re
import socket
import sys
import time
import argparse
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service as ChromeService
from webdriver_manager.chrome import ChromeDriverManager
from bs4 import BeautifulSoup

# Books to scrape: (display_name, url_name, chapter_count)
BOOKS = [
    ("Ephesians", "Ephesians", 6),
    ("Philippians", "Philippians", 4),
    ("Psalms", "Psalm", 150),
]

VERSION = "ESV"
DEFAULT_DELAY = 5  # seconds between requests


# ─── Chrome Connection ──────────────────────────────────────────────────────

def check_chrome_running():
    """Check if Chrome is running with remote debugging on port 9222."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.connect(('127.0.0.1', 9222))
        s.close()
        return True
    except Exception:
        s.close()
        return False


def connect_to_chrome():
    """Connect to an already running Chrome instance with remote debugging."""
    options = Options()
    options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")

    try:
        print("Setting up ChromeDriver...")
        driver = webdriver.Chrome(
            service=ChromeService(ChromeDriverManager().install()),
            options=options,
        )
        print("Connected to Chrome.\n")
        return driver
    except Exception as e:
        print(f"Error connecting to Chrome: {e}")
        print("\nStart Chrome with:")
        print("  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome "
              "--remote-debugging-port=9222 --user-data-dir=/tmp/chrome_debug_profile")
        return None


# ─── Verse Extraction ───────────────────────────────────────────────────────

def parse_verses(html):
    """Parse BibleGateway HTML and extract verses as 'num text' lines."""
    soup = BeautifulSoup(html, "html.parser")

    passage = soup.select_one(".passage-text")
    if not passage:
        return ""

    # Remove footnotes, cross-references, footnote/crossref sections
    for tag in passage.select(".footnote, .footnotes, .crossreference, .crossrefs, "
                              ".full-chap-link, .passage-other-trans"):
        tag.decompose()

    # Convert small-caps LORD to uppercase
    for tag in passage.select("span.small-caps"):
        tag.string = tag.get_text().upper()

    verses = {}  # verse_num -> text

    # Find all text spans with verse class like "text Ps-100-3" or "text Eph-1-2"
    text_spans = passage.select("span.text")

    for span in text_spans:
        classes = span.get("class", [])
        verse_class = None
        for cls in classes:
            if cls != "text" and "-" in cls:
                verse_class = cls
                break

        if not verse_class:
            continue

        # Extract verse number from class like "Ps-100-3" -> 3
        parts = verse_class.rsplit("-", 1)
        if len(parts) != 2:
            continue
        try:
            verse_num = int(parts[-1])
        except ValueError:
            continue

        # Skip headings (h3, h4)
        if span.find_parent(["h3", "h4"]):
            continue

        # Get text, stripping out chapternum/versenum markers
        text = ""
        for child in span.children:
            if hasattr(child, 'name'):
                if child.name == 'span' and 'chapternum' in child.get('class', []):
                    continue
                if child.name == 'sup' and 'versenum' in child.get('class', []):
                    continue
                if child.name == 'sup':
                    continue
                text += child.get_text()
            else:
                text += str(child)

        text = text.strip()
        if not text:
            continue

        # Accumulate text for this verse (poetry has multiple spans per verse)
        if verse_num in verses:
            verses[verse_num] += " " + text
        else:
            verses[verse_num] = text

    if not verses:
        return ""

    # Build chapter text: "1 verse text\n2 verse text\n..."
    lines = []
    for num in sorted(verses.keys()):
        text = re.sub(r'\s+', ' ', verses[num]).strip()
        lines.append(f"{num} {text}")

    return "\n".join(lines)


def fetch_chapter(browser, book_url_name, chapter, delay):
    """Navigate to a BibleGateway chapter and extract verse text."""
    url = (f"https://www.biblegateway.com/passage/"
           f"?search={book_url_name}%20{chapter}&version={VERSION}")

    browser.get(url)
    time.sleep(delay)

    html = browser.page_source
    return parse_verses(html)


# ─── Scraping ───────────────────────────────────────────────────────────────

def scrape_books(browser, books, delay, output_path, text_dir):
    """Scrape all specified books and write JSON + individual text files."""
    bible_data = {}
    total_chapters = sum(b[2] for b in books)
    fetched = 0

    for book_name, book_url_name, chapter_count in books:
        print(f"\n{'='*60}")
        print(f"  {book_name} ({chapter_count} chapters)")
        print(f"{'='*60}")

        book_dir = Path(text_dir) / book_name
        book_dir.mkdir(parents=True, exist_ok=True)

        chapters = {}

        for ch in range(1, chapter_count + 1):
            fetched += 1
            print(f"  [{fetched}/{total_chapters}] {book_name} {ch}...", end=" ", flush=True)

            try:
                text = fetch_chapter(browser, book_url_name, ch, delay)
                if text:
                    chapters[str(ch)] = text
                    txt_file = book_dir / f"{book_name.lower()}_chapter_{ch:02d}.txt"
                    txt_file.write_text(text, encoding="utf-8")
                    preview = text[:60].replace("\n", " ")
                    print(f"OK ({len(text):,} chars) - {preview}...")
                else:
                    print("EMPTY")
            except Exception as e:
                print(f"ERROR: {e}")

        if chapters:
            bible_data[book_name] = {
                "book": book_name,
                "chapters": chapters,
                "chapter_count": len(chapters),
            }
            print(f"\n  {book_name}: saved {len(chapters)} chapters")
            print(f"  Text files: {book_dir}/")

    # Write JSON
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    with open(output, "w", encoding="utf-8") as f:
        json.dump(bible_data, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*60}")
    print(f"Done! Wrote {len(bible_data)} books to {output}")
    print(f"Total chapters: {sum(b['chapter_count'] for b in bible_data.values())}")
    print(f"File size: {output.stat().st_size / 1024:.1f} KB")
    print(f"Text files saved to: {text_dir}/")
    print(f"{'='*60}")


# ─── Rebuild from text files ────────────────────────────────────────────────

def build_json_from_text_dir(text_dir, output_path):
    """Rebuild bible_esv.json from all text files in the text directory.
    Use this after manually adding new book folders with text files."""
    text_path = Path(text_dir)
    bible_data = {}

    for book_dir in sorted(text_path.iterdir()):
        if not book_dir.is_dir():
            continue
        book_name = book_dir.name
        chapters = {}
        txt_files = sorted(book_dir.glob("*.txt"),
                           key=lambda f: int(re.search(r'(\d+)', f.stem).group(1))
                           if re.search(r'(\d+)', f.stem) else 0)
        for txt_file in txt_files:
            match = re.search(r'(\d+)', txt_file.stem)
            if match:
                ch_num = str(int(match.group(1)))
                chapters[ch_num] = txt_file.read_text(encoding="utf-8").strip()

        if chapters:
            bible_data[book_name] = {
                "book": book_name,
                "chapters": chapters,
                "chapter_count": len(chapters),
            }
            print(f"  {book_name}: {len(chapters)} chapters")

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    with open(output, "w", encoding="utf-8") as f:
        json.dump(bible_data, f, ensure_ascii=False, indent=2)

    print(f"\nRebuilt {output} with {len(bible_data)} books")
    print(f"File size: {output.stat().st_size / 1024:.1f} KB")


# ─── Main ───────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Scrape ESV from BibleGateway")
    parser.add_argument("--output", default="../data/bible_esv.json",
                        help="Output JSON path (default: ../data/bible_esv.json)")
    parser.add_argument("--text-dir", default="./bible_esv",
                        help="Directory for individual chapter text files (default: ./bible_esv)")
    parser.add_argument("--delay", type=int, default=DEFAULT_DELAY,
                        help=f"Seconds between requests (default: {DEFAULT_DELAY})")
    parser.add_argument("--add", type=str, nargs=3, action="append", metavar=("NAME", "URL_NAME", "CHAPTERS"),
                        help="Add a book: --add Romans Romans 16 (can repeat)")
    parser.add_argument("--rebuild", action="store_true",
                        help="Rebuild JSON from existing text files (no scraping)")
    args = parser.parse_args()

    # Rebuild mode: just regenerate JSON from text files
    if args.rebuild:
        print(f"Rebuilding JSON from text files in {args.text_dir}...")
        build_json_from_text_dir(args.text_dir, args.output)
        return

    # Check Chrome is running
    if not check_chrome_running():
        print("Chrome is not running with remote debugging.\n")
        print("Start it with:")
        print("  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome \\")
        print("      --remote-debugging-port=9222 --user-data-dir=/tmp/chrome_debug_profile")
        sys.exit(1)

    browser = connect_to_chrome()
    if not browser:
        sys.exit(1)

    # Determine which books to scrape
    if args.add:
        books = [(name, url_name, int(count)) for name, url_name, count in args.add]
    else:
        books = BOOKS

    print(f"Scraping ESV from BibleGateway")
    print(f"Books: {', '.join(b[0] for b in books)}")
    print(f"Delay: {args.delay}s between requests")
    print(f"Output: {args.output}")
    print(f"Text dir: {args.text_dir}")
    print(f"Estimated time: ~{sum(b[2] for b in books) * args.delay // 60} minutes")

    try:
        scrape_books(browser, books, args.delay, args.output, args.text_dir)

        # When adding books, rebuild JSON from all text files so everything is included
        if args.add:
            print(f"\nRebuilding full JSON to include all books...")
            build_json_from_text_dir(args.text_dir, args.output)
    finally:
        # Don't quit Chrome — user started it, let them keep it
        pass


if __name__ == "__main__":
    main()
