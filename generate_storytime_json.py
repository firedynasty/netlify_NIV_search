"""
Combines Story Time markdown files into a single JSON file for the Vercel Bible app.

Usage:
    python generate_storytime_json.py

Optional flags:
    --input     Input directory (default: ./storytime_output)
    --output    Output JSON path (default: ./storytime.json)

Output format:
    {
        "Genesis 1": "# Story Time — Genesis 1\\n\\n...",
        "Genesis 2": "...",
        ...
    }
"""

import argparse
import json
import re
from pathlib import Path

BOOKS = ["genesis", "exodus", "leviticus", "numbers", "deuteronomy"]
BOOK_NAMES = {
    "genesis": "Genesis",
    "exodus": "Exodus",
    "leviticus": "Leviticus",
    "numbers": "Numbers",
    "deuteronomy": "Deuteronomy",
}


def main():
    parser = argparse.ArgumentParser(description="Combine Story Time files into JSON")
    parser.add_argument("--input",  default="./storytime_output", help="Input directory")
    parser.add_argument("--output", default="./storytime.json",   help="Output JSON path")
    args = parser.parse_args()

    input_dir = Path(args.input)
    result = {}
    count = 0

    for book_key in BOOKS:
        book_dir = input_dir / book_key
        if not book_dir.exists():
            print(f"  Skipping {book_key}/ (not found)")
            continue

        book_name = BOOK_NAMES[book_key]

        # Find all markdown files and sort by chapter number
        files = sorted(book_dir.glob("*.md"),
                       key=lambda f: int(re.search(r'(\d+)', f.stem).group(1))
                       if re.search(r'(\d+)', f.stem) else 0)

        for filepath in files:
            # Extract chapter number from filename like "genesis_03.md"
            match = re.search(r'(\d+)', filepath.stem)
            if not match:
                continue
            chapter = int(match.group(1))
            key = f"{book_name} {chapter}"
            content = filepath.read_text(encoding="utf-8").strip()
            result[key] = content
            count += 1

    output_path = Path(args.output)
    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2),
                           encoding="utf-8")

    print(f"Written {count} chapters to {output_path}")
    print(f"Copy to your Vercel app: cp {output_path} /path/to/vercel_bible_current/public/storytime.json")


if __name__ == "__main__":
    main()
