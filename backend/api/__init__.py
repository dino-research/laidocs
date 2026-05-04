"""LAIDocs API -- all routers."""

from .chat import router as chat_router
from .folders import router as folders_router
from .settings import router as settings_router
from .search import router as search_router
from .documents import documents_router

__all__ = [
    "settings_router",
    "documents_router",
    "folders_router",
    "search_router",
    "chat_router",
]
