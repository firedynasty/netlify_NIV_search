"""
Story Time — The Pentateuch
Generates narrative devotional content for every chapter in the first five books
of the Bible using the OpenAI API, incorporating Matthew Henry Commentary
summaries from torah_prompts/ files.

Usage:
    pip install openai
    python storytime_pentateuch.py --key YOUR_OPENAI_API_KEY

Optional flags:
    --book      Only run one book (e.g. --book Genesis)
    --start     Chapter to start from (e.g. --start 3)
    --model     OpenAI model to use (default: gpt-4o)
    --output    Output directory (default: ./storytime_output)
    --delay     Seconds to wait between API calls (default: 1)
    --prompts   Directory with commentary .txt files (default: ./torah_prompts)
"""

import argparse
import os
import re
import time
from pathlib import Path
from openai import OpenAI

# ── Bible data ────────────────────────────────────────────────────────────────

BOOKS = {
    "Genesis":     50,
    "Exodus":      40,
    "Leviticus":   27,
    "Numbers":     36,
    "Deuteronomy": 34,
}

SYSTEM_PROMPT = """You are a gifted Bible teacher and storyteller. Your job is to bring
Scripture alive with the "Story Time" format: narrative, accessible, theologically rich,
and deeply human.

You will receive the chapter reference AND a summary of Matthew Henry's Commentary
for that chapter. Use the commentary insights to enrich your narrative — weave in
Henry's theological observations, typological connections, and practical applications
naturally into the storytelling. Don't just repeat the commentary; let it deepen the
narrative.

For each chapter, you will:
1. Set the scene — what just happened, what's the mood, who's there
2. Walk through the chapter's key moments with vivid narrative prose
3. Slow down on the most important verse or moment and let it breathe
4. Weave in Matthew Henry's key insights where they illuminate the story
5. Close with a short reflection: what this chapter is REALLY about

Rules:
- Write in present tense for narrative sections to create immediacy
- Use short punchy paragraphs. White space is your friend.
- Bold key phrases sparingly for emphasis
- Ask rhetorical questions to pull the reader in
- End with a thematic summary of 2-4 sentences
- Do not use academic jargon or commentary-speak
- Keep the tone warm, honest, and alive — like a friend who loves this book
- Format in clean Markdown with a title, section breaks, and a closing line
- When drawing from the commentary, make it feel organic — not quoted or cited"""


def parse_commentary_file(filepath: Path) -> dict:
    """Parse a torah_prompts .txt file into {chapter_number: commentary_text}."""
    chapters = {}
    current_chapter = None
    current_text = []

    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            # Match chapter headers like "Chapter 1: The Creation" or "Chapter 1"
            match = re.match(r'^Chapter\s+(\d+)', line)
            if match:
                # Save previous chapter
                if current_chapter is not None:
                    chapters[current_chapter] = "\n".join(current_text).strip()
                current_chapter = int(match.group(1))
                current_text = [line.strip()]
            elif line.startswith("=" * 10) or line.startswith("BOOK:"):
                # Skip header lines
                continue
            elif line.startswith("Introduction"):
                # Capture introduction as chapter 0
                if current_chapter is not None:
                    chapters[current_chapter] = "\n".join(current_text).strip()
                current_chapter = 0
                current_text = [line.strip()]
            elif current_chapter is not None:
                current_text.append(line.rstrip())

    # Save last chapter
    if current_chapter is not None:
        chapters[current_chapter] = "\n".join(current_text).strip()

    return chapters


def load_all_commentary(prompts_dir: Path) -> dict:
    """Load all commentary files into {book_name: {chapter: text}}."""
    commentary = {}
    for book in BOOKS:
        filepath = prompts_dir / f"{book.lower()}.txt"
        if filepath.exists():
            commentary[book] = parse_commentary_file(filepath)
            print(f"  Loaded commentary for {book}: {len(commentary[book])} chapters")
        else:
            print(f"  No commentary file found for {book} at {filepath}")
            commentary[book] = {}
    return commentary


def build_prompt(book: str, chapter: int, commentary: str | None) -> str:
    prompt = f"Story Time — {book} chapter {chapter}. Walk me through it."
    if commentary:
        prompt += f"\n\nHere is Matthew Henry's Commentary summary for this chapter to draw from:\n\n{commentary}"
    return prompt


def generate_story(client: OpenAI, book: str, chapter: int,
                   model: str, commentary: str | None) -> str:
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": build_prompt(book, chapter, commentary)},
        ],
        temperature=0.85,
    )
    return response.choices[0].message.content


def slugify(book: str, chapter: int) -> str:
    return f"{book.lower()}_{chapter:02d}"


def run(args):
    client = OpenAI(api_key=args.key)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load commentary
    prompts_dir = Path(args.prompts)
    print("Loading Matthew Henry Commentary summaries...")
    commentary = load_all_commentary(prompts_dir)

    books_to_run = (
        {args.book: BOOKS[args.book]}
        if args.book
        else BOOKS
    )

    combined_path = output_dir / "storytime_pentateuch_combined.md"
    combined = open(combined_path, "w", encoding="utf-8")
    combined.write("# Story Time — The Pentateuch\n\n")

    total_chapters = sum(books_to_run.values())
    done = 0

    for book, total in books_to_run.items():
        book_dir = output_dir / book.lower()
        book_dir.mkdir(exist_ok=True)

        start = args.start if (args.book == book or not args.book) else 1

        for chapter in range(start, total + 1):
            done += 1
            label = f"{book} {chapter}"
            print(f"[{done}/{total_chapters}] Generating {label}...", end=" ", flush=True)

            # Get commentary for this chapter
            chapter_commentary = commentary.get(book, {}).get(chapter)

            try:
                story = generate_story(client, book, chapter, args.model,
                                       chapter_commentary)
            except Exception as e:
                print(f"ERROR: {e}")
                continue

            # Individual file
            filepath = book_dir / f"{slugify(book, chapter)}.md"
            filepath.write_text(story, encoding="utf-8")

            # Append to combined
            combined.write(f"\n\n---\n\n{story}\n")
            combined.flush()

            print(f"saved to {filepath.name}")

            if done < total_chapters:
                time.sleep(args.delay)

    combined.close()
    print(f"\nDone. {done} chapters written.")
    print(f"Individual files → {output_dir}/")
    print(f"Combined file   → {combined_path}")


def main():
    parser = argparse.ArgumentParser(description="Story Time — Pentateuch generator")
    parser.add_argument("--key",     required=True,                help="OpenAI API key")
    parser.add_argument("--book",    default=None,                 help="Single book to run",
                        choices=list(BOOKS.keys()))
    parser.add_argument("--start",   type=int, default=1,          help="Starting chapter (default 1)")
    parser.add_argument("--model",   default="gpt-4o",             help="OpenAI model (default gpt-4o)")
    parser.add_argument("--output",  default="./storytime_output", help="Output directory")
    parser.add_argument("--delay",   type=float, default=1.0,      help="Delay between calls in seconds")
    parser.add_argument("--prompts", default="./torah_prompts",    help="Directory with commentary .txt files")
    args = parser.parse_args()

    if args.book and args.book not in BOOKS:
        print(f"Unknown book '{args.book}'. Choose from: {', '.join(BOOKS)}")
        return

    run(args)


if __name__ == "__main__":
    main()
