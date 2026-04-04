"""
Build Hymn Similarity Index
Generates embeddings for every hymn, computes cosine similarity,
and saves the top-N similar hymns per hymn to hymn_similarities.json.

Run once (or whenever the CSV changes):
  python build_hymn_index.py                      # uses OpenAI (requires OPENAI_API_KEY)
  python build_hymn_index.py --provider ollama    # uses local Ollama
  python build_hymn_index.py --top 20             # store top 20 per hymn (default 15)
"""

import csv
import json
import os
import sys
import argparse
import time
from collections import defaultdict

import numpy as np


# ── Data loading ─────────────────────────────────────────────────────────────

def load_hymns(csv_path):
    hymn_topics = defaultdict(set)
    hymn_title = {}
    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            num = row["Hymn #"].strip()
            topic = row["Topic"].strip()
            subtopic = row["Sub-Topic"].strip()
            title = row["First Line"].strip()
            hymn_topics[num].add((topic, subtopic))
            if num not in hymn_title:
                hymn_title[num] = title
    return hymn_topics, hymn_title


def build_hymn_text(num, title, topics):
    """Create a rich text description for embedding."""
    topic_parts = []
    for t, s in sorted(topics):
        topic_parts.append(f"{t}" + (f" - {s}" if s else ""))
    return f'"{title}". Themes: {", ".join(topic_parts)}.'


# ── Embedding providers ───────────────────────────────────────────────────────

def embed_openai(texts, model="text-embedding-3-small"):
    from openai import OpenAI
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        sys.exit("Set OPENAI_API_KEY environment variable to use OpenAI embeddings.")
    client = OpenAI(api_key=api_key)

    all_embeddings = []
    batch_size = 100
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        print(f"  Embedding batch {i // batch_size + 1}/{-(-len(texts) // batch_size)} ({len(batch)} hymns)...")
        response = client.embeddings.create(input=batch, model=model)
        all_embeddings.extend([d.embedding for d in response.data])
        time.sleep(0.2)  # be gentle
    return all_embeddings


def embed_ollama(texts, model="nomic-embed-text"):
    import urllib.request
    url = "http://localhost:11434/api/embed"
    all_embeddings = []
    for i, text in enumerate(texts):
        if i % 50 == 0:
            print(f"  Embedding {i}/{len(texts)}...")
        payload = json.dumps({"model": model, "input": text}).encode()
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
        all_embeddings.append(data["embeddings"][0])
    return all_embeddings


# ── Similarity computation ────────────────────────────────────────────────────

def cosine_similarity_matrix(embeddings):
    mat = np.array(embeddings, dtype=np.float32)
    norms = np.linalg.norm(mat, axis=1, keepdims=True)
    mat = mat / np.maximum(norms, 1e-9)
    return mat @ mat.T  # shape: (N, N)


def build_index(hymn_nums, hymn_title, hymn_topics, embeddings, top_n):
    sim_matrix = cosine_similarity_matrix(embeddings)
    index = {}
    for i, num in enumerate(hymn_nums):
        row = sim_matrix[i]
        # Get top_n most similar (excluding self)
        top_indices = np.argsort(-row)
        similar = []
        for j in top_indices:
            if j == i:
                continue
            other_num = hymn_nums[j]
            shared = hymn_topics[num] & hymn_topics[other_num]
            shared_labels = [t + (f"/{s}" if s else "") for t, s in sorted(shared)]
            similar.append({
                "hymn": other_num,
                "title": hymn_title[other_num],
                "score": round(float(row[j]), 4),
                "shared_topics": shared_labels,
            })
            if len(similar) >= top_n:
                break
        index[num] = {
            "title": hymn_title[num],
            "topics": [t + (f"/{s}" if s else "") for t, s in sorted(hymn_topics[num])],
            "similar": similar,
        }
    return index


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", default="/Users/stanleytan/Documents/technical/python/53-webpage_scraper/hymnary_h1955_merged.csv")
    parser.add_argument("--out", default="/Users/stanleytan/documents/technical/github/netlify_niv_search/data/hymn_similarities.json")
    parser.add_argument("--provider", choices=["openai", "ollama"], default="openai")
    parser.add_argument("--model", default=None, help="Override embedding model name")
    parser.add_argument("--top", type=int, default=15, help="Top N similar hymns to store per hymn")
    args = parser.parse_args()

    print(f"Loading hymns from {args.csv}...")
    hymn_topics, hymn_title = load_hymns(args.csv)
    hymn_nums = sorted(hymn_topics.keys())
    print(f"Found {len(hymn_nums)} unique hymns.")

    texts = [build_hymn_text(n, hymn_title[n], hymn_topics[n]) for n in hymn_nums]

    print(f"\nGenerating embeddings via {args.provider}...")
    if args.provider == "openai":
        model = args.model or "text-embedding-3-small"
        embeddings = embed_openai(texts, model=model)
    else:
        model = args.model or "nomic-embed-text"
        embeddings = embed_ollama(texts, model=model)

    print(f"\nComputing similarity matrix ({len(hymn_nums)}×{len(hymn_nums)})...")
    index = build_index(hymn_nums, hymn_title, hymn_topics, embeddings, args.top)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)

    print(f"\nDone. Saved to {args.out}")
    print(f"  {len(index)} hymns indexed, up to {args.top} similar hymns each.")


if __name__ == "__main__":
    main()
