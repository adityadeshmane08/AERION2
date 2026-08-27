# Engine Digital Twin — FastAPI backend

## Run locally

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Visit http://localhost:8000/docs for interactive API docs (auto-generated
by FastAPI — good for testing endpoints without the frontend).

## What's here

- `app/database.py` — SQLite persistence. Two tables: `uavs` (drone list)
  and `telemetry` (every packet, tagged by `uav_id`). On startup, each
  UAV's simulation resumes from its last saved packet instead of
  restarting at cycle zero.
- `app/simulator.py` — generates raw sensor readings each tick. This is
  a placeholder formula ported from the old frontend demo — swap it for
  a real physics-based model whenever that's ready. It does NOT decide
  status/anomaly_score/rul_hours — that's the ML model's job.
- `app/ml_interface.py` — **this is what your teammate edits.** The
  `predict(window)` function signature must stay the same; only the
  body (currently a simple threshold heuristic) gets replaced with the
  real trained model.
- `app/schemas.py` — Pydantic models. Field names match the frontend's
  `EngineState` / `TelemetryPoint` types in `src/App.tsx` exactly.
  Don't rename fields here without updating the frontend types too.
- `app/main.py` — routes. Matches the contract the frontend already
  expects:
  - `GET /healthz`
  - `GET /uavs`
  - `GET /uavs/{uav_id}/state`
  - `GET /uavs/{uav_id}/history?limit=60`
  - `POST /uavs/{uav_id}/fault` `{"severity": "soft"|"hard"}`
  - `POST /uavs/{uav_id}/reset`

## Before deploying

Edit `ALLOWED_ORIGINS` in `app/main.py` to match your actual GitHub
Pages URL (CORS will silently block the frontend otherwise).

## Adding a UAV

Insert a row into the `uavs` table (or add to `DEFAULT_UAVS` in
`database.py` before the first run) — no code changes needed elsewhere.
