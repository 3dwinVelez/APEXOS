from fastapi import APIRouter
from pydantic import BaseModel
from statsmodels.tsa.arima.model import ARIMA
from sklearn.ensemble import GradientBoostingRegressor
from typing import Literal
import numpy as np
import pandas as pd

router = APIRouter(prefix="/forecast")


class HistPoint(BaseModel):
    date: str
    value: float


class ForecastReq(BaseModel):
    tenant_id: str
    series: list[HistPoint]
    periods: int = 6
    model: Literal["AUTO", "ARIMA", "ML", "MOVING_AVG"] = "AUTO"
    context: dict = {}


@router.post("")
def forecast(req: ForecastReq):
    df = pd.DataFrame([p.model_dump() for p in req.series])
    df["date"] = pd.to_datetime(df["date"])
    monthly = df.set_index("date").resample("ME")["value"].sum()
    if len(monthly) < 3:
        return {"model": "INSUFFICIENT_DATA", "points": []}

    model = req.model
    if model == "AUTO":
        model = "ARIMA" if len(monthly) >= 12 else "MOVING_AVG"
    if model == "ARIMA":
        return _arima(monthly, req.periods)
    if model == "ML":
        return _gradient_boost(monthly, req.periods)
    return _moving_avg(monthly, req.periods)


def _arima(series, periods):
    try:
        fit = ARIMA(series, order=(2, 1, 2)).fit()
        forecast_result = fit.get_forecast(periods)
        ci = forecast_result.conf_int()
        return {
            "model": "ARIMA",
            "mape": _mape(series, fit),
            "points": [
                {
                    "period": str(idx.date()),
                    "value": max(0, round(float(value), 2)),
                    "lower": max(0, round(float(ci.iloc[i, 0]), 2)),
                    "upper": max(0, round(float(ci.iloc[i, 1]), 2)),
                }
                for i, (idx, value) in enumerate(zip(forecast_result.predicted_mean.index, forecast_result.predicted_mean.values))
            ],
        }
    except Exception:
        return _moving_avg(series, periods)


def _moving_avg(series, periods):
    avg = series.rolling(min(3, len(series))).mean().iloc[-1]
    last = series.index[-1]
    return {
        "model": "MOVING_AVG",
        "points": [
            {"period": str((last + pd.DateOffset(months=i + 1)).date()), "value": round(float(avg), 2)}
            for i in range(periods)
        ],
    }


def _gradient_boost(series, periods):
    values = series.values
    X = np.arange(len(values)).reshape(-1, 1)
    model = GradientBoostingRegressor(random_state=42)
    model.fit(X, values)
    future = np.arange(len(values), len(values) + periods).reshape(-1, 1)
    predictions = model.predict(future)
    last = series.index[-1]
    return {
        "model": "ML",
        "points": [
            {"period": str((last + pd.DateOffset(months=i + 1)).date()), "value": max(0, round(float(v), 2))}
            for i, v in enumerate(predictions)
        ],
    }


def _mape(actual, model):
    pred = model.fittedvalues
    mask = actual != 0
    return round(float(np.mean(np.abs((actual[mask] - pred[mask]) / actual[mask]))) * 100, 2)

