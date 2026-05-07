import sqlite3
from datetime import datetime
from fastapi import FastAPI, BackgroundTasks, Request
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from typing import Dict, Any, Optional
import json
import os
from pathlib import Path

app = FastAPI(title="LAIDocs Telemetry Server")

templates = Jinja2Templates(directory="templates")

DATA_DIR = Path("data")
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "telemetry.db"

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

@app.get("/")
async def dashboard(request: Request):
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        
        # Total Unique Users
        users_count_row = conn.execute("SELECT COUNT(DISTINCT machine_id) as c FROM events").fetchone()
        users_count = users_count_row["c"] if users_count_row else 0
        
        # Event Breakdown
        breakdown_rows = conn.execute("SELECT event_type, COUNT(*) as count FROM events GROUP BY event_type").fetchall()
        breakdown = {row["event_type"]: row["count"] for row in breakdown_rows}
        
        # Recent 50 events
        recent_events = conn.execute("SELECT * FROM events ORDER BY timestamp DESC LIMIT 50").fetchall()
        recent_events = [dict(row) for row in recent_events]
        
    return templates.TemplateResponse(
        request,
        "index.html",
        {
            "users_count": users_count,
            "breakdown": breakdown,
            "recent_events": recent_events,
            "total_events": sum(breakdown.values())
        }
    )

@app.post("/api/v1/track")
async def track_event(event: EventPayload, background_tasks: BackgroundTasks):
    background_tasks.add_task(save_event, event)
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
