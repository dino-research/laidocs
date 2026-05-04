"""Chat API endpoints for document Q&A via RAG."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..services.rag import get_rag_pipeline

router = APIRouter(prefix="/api/chat", tags=["chat"])


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class ChatRequest(BaseModel):
    doc_id: str
    question: str


class ChatResponse(BaseModel):
    doc_id: str
    question: str
    answer: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/")
async def chat(body: ChatRequest) -> ChatResponse:
    """Ask a question about a document (non-streaming).

    The backend retrieves relevant context from the document and asks
    the configured LLM to produce a grounded answer.
    """
    pipeline = get_rag_pipeline()
    cfg = pipeline._settings.llm
    if not cfg.model or not cfg.base_url:
        raise HTTPException(
            status_code=503,
            detail="LLM is not configured. Please set the LLM endpoint in Settings.",
        )
    try:
        answer = pipeline.query(body.doc_id, body.question)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM call failed: {exc}") from exc

    return ChatResponse(
        doc_id=body.doc_id,
        question=body.question,
        answer=answer,
    )


@router.post("/stream")
async def chat_stream(body: ChatRequest):
    """Ask a question about a document (Server-Sent Events stream).

    Each SSE event contains a text delta.  The stream ends when the
    LLM finishes generating.
    """
    pipeline = get_rag_pipeline()
    cfg = pipeline._settings.llm
    if not cfg.model or not cfg.base_url:
        raise HTTPException(
            status_code=503,
            detail="LLM is not configured. Please set the LLM endpoint in Settings.",
        )

    async def _event_generator():
        try:
            async for token in pipeline.query_stream(body.doc_id, body.question):
                # SSE format: "data: <payload>\n\n"
                escaped = token.replace("\n", "\\n")
                yield f"data: {escaped}\n\n"
        except Exception as exc:
            yield f"data: [ERROR] {exc}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
