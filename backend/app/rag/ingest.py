"""
Run once to ingest clinical guidelines into Supabase pgvector store.
Usage: python -m app.rag.ingest
"""
from pathlib import Path

import tiktoken
from openai import OpenAI
from supabase import create_client

from app.config import settings

GUIDELINES_DIR = Path(__file__).parent.parent.parent / "data" / "guidelines"
CHUNK_MAX_TOKENS = 512
CHUNK_OVERLAP = 50

CONDITION_TAG_MAP: dict[str, list[str]] = {
    "diabetes_guidelines.txt": ["diabetes"],
    "hypertension_guidelines.txt": ["hypertension"],
    "dietary_guidelines.txt": ["diabetes", "hypertension", "dietary"],
    "hawker_food_guide.txt": ["diabetes", "dietary"],
}

_openai = OpenAI(api_key=settings.openai_api_key)


def _count_tokens(text: str, enc: tiktoken.Encoding) -> int:
    return len(enc.encode(text))


def _chunk_text(text: str, max_tokens: int, overlap: int, enc: tiktoken.Encoding) -> list[str]:
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: list[str] = []
    current: list[str] = []
    current_tokens = 0

    for para in paragraphs:
        pt = _count_tokens(para, enc)
        if current_tokens + pt > max_tokens and current:
            chunks.append("\n\n".join(current))
            # Keep trailing paragraphs for overlap
            overlap_paras: list[str] = []
            overlap_tokens = 0
            for p in reversed(current):
                t = _count_tokens(p, enc)
                if overlap_tokens + t <= overlap:
                    overlap_paras.insert(0, p)
                    overlap_tokens += t
                else:
                    break
            current = overlap_paras
            current_tokens = overlap_tokens
        current.append(para)
        current_tokens += pt

    if current:
        chunks.append("\n\n".join(current))

    return chunks


def ingest() -> None:
    sb = create_client(settings.supabase_url, settings.supabase_secret_key)
    enc = tiktoken.get_encoding("cl100k_base")

    for filename, condition_tags in CONDITION_TAG_MAP.items():
        filepath = GUIDELINES_DIR / filename
        if not filepath.exists():
            print(f"Warning: {filepath} not found — skipping")
            continue

        text = filepath.read_text(encoding="utf-8")
        source = filename.replace(".txt", "")
        chunks = _chunk_text(text, CHUNK_MAX_TOKENS, CHUNK_OVERLAP, enc)
        print(f"Processing {filename}: {len(chunks)} chunks")

        for i, chunk in enumerate(chunks):
            embedding = _openai.embeddings.create(
                model="text-embedding-3-small",
                input=chunk,
            ).data[0].embedding

            sb.table("guideline_chunks").upsert(
                {
                    "source": source,
                    "section": f"chunk_{i + 1}",
                    "content": chunk,
                    "condition_tags": condition_tags,
                    "embedding": embedding,
                }
            ).execute()
            print(f"  [{i + 1}/{len(chunks)}] upserted")

    print("Ingestion complete.")


if __name__ == "__main__":
    ingest()
