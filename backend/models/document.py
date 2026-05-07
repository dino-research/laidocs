"""Pydantic models for documents and folders."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class DocumentMetadata(BaseModel):
    """Full metadata for a single document."""

    id: str
    folder: str
    filename: str
    title: str = ""
    source_type: Literal["file", "url"] = "file"
    original_path: str = ""
    content: str = ""
    created_at: str = ""
    updated_at: str = ""


class DocumentSummary(BaseModel):
    """Lightweight document info for tree views."""

    id: str
    title: str
    filename: str
    source_type: str = "file"


class FolderNode(BaseModel):
    """A folder entry with optional tree structure."""

    path: str
    name: str
    parent_path: str | None = None
    document_count: int = 0
    children: list[FolderNode] = Field(default_factory=list)
    documents: list[DocumentSummary] = Field(default_factory=list)


class FolderCreate(BaseModel):
    """Request body for creating a folder."""

    path: str
    name: str | None = None


class FolderRename(BaseModel):
    """Request body for renaming a folder."""

    path: str
    new_path: str
