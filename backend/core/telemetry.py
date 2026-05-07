import uuid
import httpx
import asyncio
import logging
from .config import LAIDOCS_HOME, get_settings

logger = logging.getLogger(__name__)
MACHINE_ID_FILE = LAIDOCS_HOME / "machine_id.txt"

def get_machine_id() -> str:
    if not MACHINE_ID_FILE.exists():
        new_id = str(uuid.uuid4())
        MACHINE_ID_FILE.parent.mkdir(parents=True, exist_ok=True)
        MACHINE_ID_FILE.write_text(new_id)
        return new_id
    return MACHINE_ID_FILE.read_text().strip()

def track_event_sync(event_type: str, metadata: dict = None):
    """Fire and forget telemetry event via asyncio background task."""
    settings = get_settings()
    if not getattr(settings, 'telemetry_enabled', False):
        return
        
    machine_id = get_machine_id()
    payload = {
        "machine_id": machine_id,
        "event_type": event_type,
        "metadata": metadata or {}
    }
    
    async def _send():
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                await client.post(settings.telemetry_url, json=payload)
        except Exception as e:
            logger.debug(f"Telemetry error: {e}")

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_send())
    except RuntimeError:
        # If no event loop, run it synchronously but swallow errors
        try:
            httpx.post(settings.telemetry_url, json=payload, timeout=2.0)
        except Exception:
            pass
