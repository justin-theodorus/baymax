from openai import OpenAI
from supabase import create_client

from app.config import settings

_openai = OpenAI(api_key=settings.openai_api_key)


def embed(text: str) -> list[float]:
    response = _openai.embeddings.create(
        model="text-embedding-3-small",
        input=text,
    )
    return response.data[0].embedding


def retrieve_guidelines(query: str, condition_tags: list[str], top_k: int = 5) -> list[dict]:
    """Retrieve relevant guideline chunks via pgvector cosine similarity."""
    if not query or not condition_tags:
        return []

    query_embedding = embed(query)
    sb = create_client(settings.supabase_url, settings.supabase_secret_key)

    try:
        result = sb.rpc(
            "match_guideline_chunks",
            {
                "query_embedding": query_embedding,
                "match_count": top_k,
                "filter_tags": condition_tags,
            },
        ).execute()
        return result.data or []
    except Exception as e:
        print(f"RAG retrieval error (non-critical): {e}")
        return []
