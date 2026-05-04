"""Placeholder routers — will be implemented in subsequent tasks."""

from fastapi import APIRouter

documents_router = APIRouter(prefix="/api/documents", tags=["documents"])

@documents_router.get("/")
async def list_documents():
    return {"message": "Documents API — not yet implemented"}

folders_router = APIRouter(prefix="/api/folders", tags=["folders"])

@folders_router.get("/")
async def list_folders():
    return {"message": "Folders API — not yet implemented"}

search_router = APIRouter(prefix="/api/search", tags=["search"])

@search_router.get("/")
async def search():
    return {"message": "Search API — not yet implemented"}

chat_router = APIRouter(prefix="/api/chat", tags=["chat"])

@chat_router.post("/")
async def chat():
    return {"message": "Chat API — not yet implemented"}
