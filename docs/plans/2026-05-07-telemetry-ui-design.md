# Telemetry UI Design

## Overview
A lightweight, server-side rendered dashboard for the Telemetry Server. It uses Jinja2 to render HTML directly from FastAPI, keeping the server as a single container.

## Architecture
- **Templating Engine:** `jinja2`
- **Styling:** Vanilla CSS (embedded) to ensure it works in fully offline/air-gapped environments without relying on external CDNs (like Tailwind or Bootstrap).
- **Endpoint:** `GET /` - Queries the `events` table to calculate key metrics and renders `templates/index.html`.

## Key Metrics to Display
1. **Total Unique Users (DAU):** Count of distinct `machine_id`s today and all-time.
2. **Total Events:** Aggregate count of all tracked events.
3. **Event Breakdown:** Counts for `app_launched`, `chat_sent`, and `document_indexed`.
4. **Recent Activity Log:** A table showing the 50 most recent events with timestamps.

## Implementation Details
- Add `jinja2` to the `Dockerfile` dependencies.
- Create `telemetry_server/templates/index.html`.
- Modify `telemetry_server/main.py` to include a `Jinja2Templates` router for the root `/` path.
