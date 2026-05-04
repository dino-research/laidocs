"""LAIDocs API — all routers."""

from backend.api.settings import router as settings_router
from backend.api.documents import (
    documents_router,
    folders_router,
    search_router,
    chat_router,
)

__all__ = [
    "settings_router",
    "documents_router",
    "folders_router",
    "search_router",
    "chat_router",
]
