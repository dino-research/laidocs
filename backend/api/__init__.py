"""LAIDocs API — all routers."""

from .folders import router as folders_router
from .settings import router as settings_router
from .documents import (
    documents_router,
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
