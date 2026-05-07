"""Custom Docling picture serializer — saves images to vault and emits Markdown refs."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Optional

from docling_core.transforms.serializer.base import BaseDocSerializer, SerializationResult
from docling_core.transforms.serializer.common import create_ser_result
from docling_core.transforms.serializer.markdown import MarkdownPictureSerializer
from docling_core.types.doc.document import DoclingDocument, PictureItem
from typing_extensions import override


class VaultPictureSerializer(MarkdownPictureSerializer):
    """Save each picture to disk and emit ![img](/assets/...) + optional VLM description.

    Used with MarkdownDocSerializer to produce vault-local image references.
    Images are saved as ``<doc_id>_<N>.png`` inside ``assets_dir``.
    The resulting Markdown URL is ``/assets/<filename>`` so the FastAPI
    StaticFiles mount at ``/assets`` can serve them directly.
    """

    def __init__(self, assets_dir: Path, doc_id: str) -> None:
        self.assets_dir = assets_dir
        self.doc_id = doc_id
        self._counter = 0

    @override
    def serialize(
        self,
        *,
        item: PictureItem,
        doc_serializer: BaseDocSerializer,
        doc: DoclingDocument,
        separator: Optional[str] = None,
        **kwargs: Any,
    ) -> SerializationResult:
        parts: list[str] = []

        img = item.get_image(doc)
        if img is not None:
            # Increment first so filename and alt text share the same 1-based number.
            self._counter += 1
            filename = f"{self.doc_id}_{self._counter}.png"
            img.save(self.assets_dir / filename)
            parts.append(f"![Image {self._counter}](/assets/{filename})")
        else:
            parts.append("<!-- image not available -->")

        # Description is only populated for PDF + VLM path (PictureDescriptionApiOptions)
        if item.meta is not None and item.meta.description is not None:
            desc = item.meta.description.text
            if desc:
                parts.append(f"\n> **Description:** {desc}")

        return create_ser_result(
            text="\n".join(parts),
            span_source=item,
        )
