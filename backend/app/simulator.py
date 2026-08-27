"""
Generates raw sensor readings per UAV. This is a placeholder physics
model (ported from the frontend's old in-browser demo generator) — swap
the body of `_raw_telemetry` for a real physics-based engine model
whenever that's ready. It only produces RAW sensor fields; status /
anomaly_score / rul_hours / confidence come from ml_interface.predict,
not from here.
"""

import math
import time
from datetime import datetime, timezone

TICK_SECONDS = 0.9  # matches the frontend's polling cadence


class _UavSimState:
    def __init__(self, start_cycle: int = 742):
        self.cycle = start_cycle
        self.fault: dict | None = None  # {"severity": "soft"|"hard", "start_cycle": int}
        self.last_advanced_at = time.time()

    def resume_from(self, last_packet: dict) -> None:
        """Resume from the last known packet instead of starting at cycle 742
        after a backend restart."""
        self.cycle = last_packet["cycle"]
        self.fault = {"severity": "hard", "start_cycle": self.cycle} if last_packet["fault_injected"] else None


_states: dict[str, _UavSimState] = {}


def _state_for(uav_id: str) -> _UavSimState:
    if uav_id not in _states:
        _states[uav_id] = _UavSimState()
    return _states[uav_id]


def seed_from_history(uav_id: str, last_packet: dict | None) -> None:
    if last_packet is not None:
        _state_for(uav_id).resume_from(last_packet)


def inject_fault(uav_id: str, severity: str) -> None:
    state = _state_for(uav_id)
    state.fault = {"severity": severity, "start_cycle": state.cycle}


def reset(uav_id: str) -> None:
    _states[uav_id] = _UavSimState()


def _raw_telemetry(uav_id: str, cycle: int) -> dict:
    state = _state_for(uav_id)
    progress = min(cycle / 900, 1)
    fault_progress = 0.0
    fault_severity = None
    if state.fault:
        fault_progress = min(max((cycle - state.fault["start_cycle"]) / 24, 0), 1)
        fault_severity = state.fault["severity"]
    degradation = progress * 0.55 + fault_progress * (1.8 if fault_severity == "hard" else 1.0)
    oscillation = math.sin(cycle / 7)

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "cycle": cycle,
        "cylinder_head_temp": round(178 + degradation * 34 + oscillation * 2.4, 1),
        "oil_pressure": round(58 - degradation * 23 + math.cos(cycle / 9) * 1.2, 1),
        "vibration": round(0.18 + degradation * 1.32 + abs(oscillation) * 0.04, 2),
        "rpm": round(2380 - degradation * 430 + math.sin(cycle / 11) * 18, 1),
        "fuel_flow": round(8.6 + degradation * 2.8 + math.cos(cycle / 13) * 0.16, 2),
        "exhaust_gas_temp": round(645 + degradation * 175 + oscillation * 6, 1),
    }


def tick(uav_id: str) -> dict:
    """Advance this UAV by one cycle (if enough wall-clock time passed since
    the last tick) and return the raw telemetry for the current cycle."""
    state = _state_for(uav_id)
    now = time.time()
    if now - state.last_advanced_at >= TICK_SECONDS:
        state.cycle += 1
        state.last_advanced_at = now
    return _raw_telemetry(uav_id, state.cycle)


def fault_active(uav_id: str) -> bool:
    return _state_for(uav_id).fault is not None
