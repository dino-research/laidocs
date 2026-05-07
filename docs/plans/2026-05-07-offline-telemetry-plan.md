# Offline Telemetry System Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Implement a standalone telemetry server and integrate a background tracking client in LAIDocs to record DAU and feature usage in a fully offline environment.

**Architecture:** A standalone FastAPI/SQLite server `telemetry_server.py` receives `POST /api/v1/track` events. The LAIDocs backend generates a persistent `machine_id` and fires asynchronous HTTP requests on key events (app launch, doc index, chat sent) without blocking the UI.

**Tech Stack:** FastAPI, SQLite, httpx

---

### Task 1: Create the Telemetry Server

**Files:**
- Create: `backend/telemetry_server.py`
- Modify: None
- Test: Manual or via a quick python script

**Step 1: Write the server code**

```python
import sqlite3
from datetime import datetime
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
from typing import Dict, Any, Optional
import json
import os

app = FastAPI(title="LAIDocs Telemetry Server")

DB_PATH = "telemetry.db"

def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                machine_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                metadata TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')

init_db()

class EventPayload(BaseModel):
    machine_id: str
    event_type: str
    metadata: Optional[Dict[str, Any]] = None

def save_event(event: EventPayload):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "INSERT INTO events (machine_id, event_type, metadata) VALUES (?, ?, ?)",
            (event.machine_id, event.event_type, json.dumps(event.metadata or {}))
        )

@app.post("/api/v1/track")
async def track_event(event: EventPayload, background_tasks: BackgroundTasks):
    background_tasks.add_task(save_event, event)
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
```

**Step 2: Commit**

```bash
git add backend/telemetry_server.py
git commit -m "feat: add standalone telemetry server"
```

### Task 2: Create Client Telemetry Core

**Files:**
- Create: `backend/core/telemetry.py`
- Modify: `backend/core/config.py`

**Step 1: Update settings to include telemetry URL**

```python
# In backend/core/config.py, add to Settings class:
class Settings(BaseSettings):
    # ... existing fields ...
    telemetry_url: str = "http://localhost:8001/api/v1/track"
    telemetry_enabled: bool = True
```

**Step 2: Create the telemetry client**

```python
# backend/core/telemetry.py
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
    if not settings.telemetry_enabled:
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
```

**Step 3: Commit**

```bash
git add backend/core/telemetry.py backend/core/config.py
git commit -m "feat: add client telemetry module with machine_id generation"
```

### Task 3: Integrate Tracking Triggers

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/services/agent.py`
- Modify: `backend/services/converter.py`

**Step 1: Track App Launch**

```python
# In backend/main.py, add to startup event or lifespan:
from .core.telemetry import track_event_sync

@app.on_event("startup")
async def startup_event():
    # ... existing code ...
    track_event_sync("app_launched")
```

**Step 2: Track Chat Sent**

```python
# In backend/services/agent.py
from ..core.telemetry import track_event_sync

# Find where the user message is received (e.g., in the API route or deepagents invoke)
# Add:
# track_event_sync("chat_sent", {"doc_id": doc_id})
```

**Step 3: Track Document Indexed**

```python
# In backend/services/converter.py
from ..core.telemetry import track_event_sync

# Find where document processing finishes successfully
# Add:
# track_event_sync("document_indexed", {"file_type": "... "})
```

**Step 4: Commit**

```bash
git add backend/main.py backend/services/agent.py backend/services/converter.py
git commit -m "feat: integrate telemetry triggers for launch, chat, and index"
```
