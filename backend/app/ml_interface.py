"""
Contract for the ML model. Your teammate replaces the BODY of `predict`
with the real anomaly-detection + RUL model — the signature (a window
of recent TelemetryPoint dicts in, this exact dict shape out) must stay
the same, since main.py and the frontend both depend on it.

Placeholder implementation below is a simple degradation heuristic just
so the pipeline runs end-to-end before the real model is ready.
"""


def predict(window: list[dict]) -> dict:
    """
    window: recent raw telemetry points for one UAV, oldest first, each a
            dict with cylinder_head_temp, oil_pressure, vibration, rpm,
            fuel_flow, exhaust_gas_temp, cycle, timestamp.

    Returns: {"status": "nominal"|"watch"|"critical", "anomaly_score": float 0-1,
              "rul_hours": float, "confidence": float 0-1}
    """
    current = window[-1]
    cht_over = max(0.0, current["cylinder_head_temp"] - 200) / 40
    oil_under = max(0.0, 40 - current["oil_pressure"]) / 30
    vib_over = max(0.0, current["vibration"] - 0.4) / 1.2

    anomaly_score = round(min(0.99, (cht_over + oil_under + vib_over) / 3), 2)
    status = "critical" if anomaly_score >= 0.72 else "watch" if anomaly_score >= 0.42 else "nominal"

    return {
        "status": status,
        "anomaly_score": anomaly_score,
        "rul_hours": round(max(0.0, (1 - anomaly_score) * 34), 1),
        "confidence": round(max(0.71, 0.96 - anomaly_score * 0.18), 2),
    }
