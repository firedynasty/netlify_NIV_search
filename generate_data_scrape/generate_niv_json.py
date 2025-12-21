#!/usr/bin/env python3
"""
Generate a JSON file from the NIV Bible text files.
Reads all book folders and creates a structured JSON output.
"""

import json
import os
import re
from pathlib import Path

def natural_sort_key(filename):
    """Sort files naturally (chapter 2 before chapter 10)."""
    return [int(c) if c.isdigit() else c.lower() for c in re.split(r'(\d+)', filename)]

def extract_chapter_number(filename):
    """Extract chapter number from filename like 'genesis_chapter_01.txt' or 'psalm_001.txt'."""
    match = re.search(r'(\d+)', filename)
    return int(match.group(1)) if match else 0

def read_chapter_content(filepath):
    """Read and return the content of a chapter file."""
    with open(filepath, 'r', encoding='utf-8') as f:
        return f.read().strip()

def generate_json(base_dir='.', output_file='bible_niv.json'):
    """
    Generate JSON from all book folders in the base directory.

    Args:
        base_dir: Directory containing book folders (Genesis, John, etc.)
        output_file: Output JSON filename
    """
    base_path = Path(base_dir)
    bible_data = {}

    # Get all subdirectories (book folders)
    book_folders = sorted([d for d in base_path.iterdir() if d.is_dir()])

    for book_folder in book_folders:
        book_name = book_folder.name
        chapters = {}

        # Get all .txt files in the book folder
        txt_files = sorted(
            [f for f in book_folder.iterdir() if f.suffix == '.txt'],
            key=lambda x: natural_sort_key(x.name)
        )

        for txt_file in txt_files:
            chapter_num = extract_chapter_number(txt_file.name)
            content = read_chapter_content(txt_file)
            chapters[chapter_num] = content

        if chapters:
            bible_data[book_name] = {
                "book": book_name,
                "chapters": chapters,
                "chapter_count": len(chapters)
            }
            print(f"  {book_name}: {len(chapters)} chapters")

    # Write JSON output
    output_path = base_path / output_file
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(bible_data, f, ensure_ascii=False, indent=2)

    print(f"\nGenerated {output_file} with {len(bible_data)} books")
    return output_path

if __name__ == "__main__":
    import sys

    base_directory = sys.argv[1] if len(sys.argv) > 1 else '.'
    output_filename = sys.argv[2] if len(sys.argv) > 2 else 'bible_niv.json'

    print(f"Scanning {base_directory} for Bible books...")
    generate_json(base_directory, output_filename)
