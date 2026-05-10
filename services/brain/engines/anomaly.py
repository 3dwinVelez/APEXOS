import numpy as np
from sklearn.ensemble import IsolationForest


def detect_anomalies(series: list[float], contamination: float = 0.05) -> list[int]:
    if len(series) < 10:
        return []
    values = np.array(series).reshape(-1, 1)
    classifier = IsolationForest(contamination=contamination, random_state=42)
    predictions = classifier.fit_predict(values)
    return [index for index, prediction in enumerate(predictions) if prediction == -1]


def check_thresholds(readings: list[dict], thresholds: dict) -> list[dict]:
    alerts = []
    for reading in readings:
        threshold = thresholds.get(reading["sensor"])
        if not threshold:
            continue
        if threshold.get("max") is not None and reading["value"] > threshold["max"]:
            alerts.append({**reading, "alert": "above_max", "threshold": threshold["max"]})
        if threshold.get("min") is not None and reading["value"] < threshold["min"]:
            alerts.append({**reading, "alert": "below_min", "threshold": threshold["min"]})
    return alerts

