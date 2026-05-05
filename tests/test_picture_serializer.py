# tests/test_picture_serializer.py
from pathlib import Path
from unittest.mock import MagicMock, patch
from backend.services.picture_serializer import VaultPictureSerializer


def test_serializer_saves_image_and_emits_markdown(tmp_path):
    """When get_image returns a PIL image, save PNG and emit markdown ref."""
    serializer = VaultPictureSerializer(assets_dir=tmp_path, doc_id="doc1")

    # Mock PictureItem with no description
    item = MagicMock()
    item.meta = None

    # Mock PIL image returned by get_image
    mock_img = MagicMock()
    item.get_image.return_value = mock_img

    doc = MagicMock()
    doc_serializer = MagicMock()

    result = serializer.serialize(item=item, doc_serializer=doc_serializer, doc=doc)

    # Image should be saved (1-based filename to match alt text)
    mock_img.save.assert_called_once_with(tmp_path / "doc1_1.png")
    # Markdown should contain image reference (filename and alt number are consistent)
    assert "![Image 1](/assets/doc1_1.png)" in result.text
    # No description blockquote
    assert "> **Description:**" not in result.text


def test_serializer_appends_description_when_present(tmp_path):
    """When item.meta.description is set, append blockquote description."""
    serializer = VaultPictureSerializer(assets_dir=tmp_path, doc_id="doc1")

    item = MagicMock()
    item.meta.description.text = "A bar chart showing revenue."
    item.get_image.return_value = MagicMock()

    result = serializer.serialize(
        item=item, doc_serializer=MagicMock(), doc=MagicMock()
    )

    assert "> **Description:** A bar chart showing revenue." in result.text


def test_serializer_handles_no_image(tmp_path):
    """When get_image returns None, emit placeholder, save nothing."""
    serializer = VaultPictureSerializer(assets_dir=tmp_path, doc_id="doc1")

    item = MagicMock()
    item.meta = None
    item.get_image.return_value = None

    result = serializer.serialize(
        item=item, doc_serializer=MagicMock(), doc=MagicMock()
    )

    assert "<!-- image not available -->" in result.text
    assert list(tmp_path.iterdir()) == []  # nothing saved


def test_serializer_counter_increments_across_calls(tmp_path):
    """Each successive call uses an incremented counter for unique filenames."""
    serializer = VaultPictureSerializer(assets_dir=tmp_path, doc_id="docX")

    def make_item():
        item = MagicMock()
        item.meta = None
        item.get_image.return_value = MagicMock()
        return item

    r1 = serializer.serialize(item=make_item(), doc_serializer=MagicMock(), doc=MagicMock())
    r2 = serializer.serialize(item=make_item(), doc_serializer=MagicMock(), doc=MagicMock())

    assert "docX_1.png" in r1.text
    assert "docX_2.png" in r2.text
    assert "Image 1" in r1.text
    assert "Image 2" in r2.text
