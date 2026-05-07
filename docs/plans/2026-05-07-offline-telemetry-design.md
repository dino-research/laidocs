# Offline Telemetry System Design

## Overview
A lightweight telemetry tracking system designed for fully offline, air-gapped environments. LAIDocs will track internal usage (app launches, document indexing, chat usage) and send these logs to a dedicated, standalone Python telemetry API running on the internal LAN.

## Architecture

The system consists of two parts:
1. **The Telemetry Server:** A standalone `telemetry_server.py` script running FastAPI + SQLite on the internal network alongside the LLM server.
2. **The Client (LAIDocs):** Background tasks in the Python backend that fire-and-forget telemetry events to the Telemetry Server.

### Component 1: Telemetry Server
- **Tech Stack:** FastAPI, SQLite (via `sqlite3` or SQLAlchemy), Uvicorn.
- **Data Model:**
  - `id` (INTEGER PRIMARY KEY)
  - `machine_id` (TEXT)
  - `event_type` (TEXT)
  - `metadata` (JSON TEXT)
  - `timestamp` (DATETIME)
- **Endpoint:** `POST /api/v1/track`
  - Accepts JSON: `{"machine_id": "uuid", "event_type": "chat_sent", "metadata": {"llm_model": "..."}}`

### Component 2: Client Tracking (LAIDocs Backend)
- **Machine ID Generation:** On startup, if `~/.laidocs/machine_id.txt` does not exist, generate a UUID4 and save it. This acts as a persistent, anonymous identifier for DAU/MAU tracking.
- **Telemetry Client:** A background module `backend/core/telemetry.py`.
- **Async Fire-and-Forget:** All network requests to the Telemetry Server must be wrapped in `asyncio.create_task` or run in a background thread with a short timeout to ensure the main application never blocks if the telemetry server is down.

### Events to Track
1. **app_launched:** Triggered when the FastAPI backend starts.
2. **document_indexed:** Triggered in `converter.py` or tree indexing when a document is fully processed.
3. **chat_sent:** Triggered in `agent.py` when a user sends a query to the document agent.

## Future Considerations
- The Telemetry Server can later be expanded to serve a simple HTML dashboard using Jinja2 templates or a small React app to visualize DAU, MAU, and feature usage.
