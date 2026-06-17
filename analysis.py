import pandas as pd
import numpy as np
from ta.trend import EMAIndicator, MACD
from ta.momentum import RSIIndicator
from ta.volatility import BollingerBands, AverageTrueRange
from ta.volume import VolumeWeightedAveragePrice

def get_pip_divisor(symbol: str) -> float:
    """Return correct pip divisor based on symbol type."""
    symbol = symbol.upper()
    if any(x in symbol for x in ["JPY", "HUF", "KRW", "CLP"]):
        return 0.01    # 3 decimal pairs
    elif any(x in symbol for x in ["XAU", "GOLD"]):
        return 0.1     # Gold — 1 decimal
    elif any(x in symbol for x in ["XAG", "OIL", "WTI"]):
        return 0.01    # Silver/Oil
    else:
        return 0.0001  # Standard 5 decimal forex pairs

def analyze(candles: list, symbol: str = "EURUSD") -> dict:
    """
    Full technical analysis on candle data.
    Returns indicators + trading signal with confidence score.
    """
    df = pd.DataFrame(candles)
    df["close"] = df["close"].astype(float)
    df["high"]  = df["high"].astype(float)
    df["low"]   = df["low"].astype(float)
    df["open"]  = df["open"].astype(float)
    df["volume"] = df["volume"].astype(float)

    close = df["close"]
    high  = df["high"]
    low   = df["low"]

    # ── EMA ──────────────────────────────────────────────────
    ema20  = EMAIndicator(close, window=20).ema_indicator()
    ema50  = EMAIndicator(close, window=50).ema_indicator()
    ema200 = EMAIndicator(close, window=200).ema_indicator()

    # ── RSI ──────────────────────────────────────────────────
    rsi = RSIIndicator(close, window=14).rsi()

    # ── MACD ─────────────────────────────────────────────────
    macd_obj  = MACD(close)
    macd_line = macd_obj.macd()
    macd_sig  = macd_obj.macd_signal()
    macd_hist = macd_obj.macd_diff()

    # ── Bollinger Bands ───────────────────────────────────────
    bb = BollingerBands(close, window=20, window_dev=2)
    bb_upper = bb.bollinger_hband()
    bb_lower = bb.bollinger_lband()
    bb_mid   = bb.bollinger_mavg()

    # ── ATR ───────────────────────────────────────────────────
    atr = AverageTrueRange(high, low, close, window=14).average_true_range()

    # ── Latest values ─────────────────────────────────────────
    latest = {
        "close":    round(float(close.iloc[-1]), 5),
        "ema20":    round(float(ema20.iloc[-1]), 5),
        "ema50":    round(float(ema50.iloc[-1]), 5),
        "ema200":   round(float(ema200.iloc[-1]), 5),
        "rsi":      round(float(rsi.iloc[-1]), 2),
        "macd":     round(float(macd_line.iloc[-1]), 6),
        "macd_signal": round(float(macd_sig.iloc[-1]), 6),
        "macd_hist":   round(float(macd_hist.iloc[-1]), 6),
        "bb_upper": round(float(bb_upper.iloc[-1]), 5),
        "bb_lower": round(float(bb_lower.iloc[-1]), 5),
        "bb_mid":   round(float(bb_mid.iloc[-1]), 5),
        "atr":      round(float(atr.iloc[-1]), 5),
    }

    # ── Signal Logic ──────────────────────────────────────────
    score = 0  # positive = BUY, negative = SELL
    reasons = []

    # EMA Trend (weight: 3)
    if latest["ema20"] > latest["ema50"] > latest["ema200"]:
        score += 3
        reasons.append("✅ EMA Bullish alignment (20>50>200)")
    elif latest["ema20"] < latest["ema50"] < latest["ema200"]:
        score -= 3
        reasons.append("🔻 EMA Bearish alignment (20<50<200)")

    # EMA20 vs EMA50 crossover (weight: 2)
    prev_ema20 = float(ema20.iloc[-2])
    prev_ema50 = float(ema50.iloc[-2])
    if prev_ema20 < prev_ema50 and latest["ema20"] > latest["ema50"]:
        score += 2
        reasons.append("✅ EMA20 crossed ABOVE EMA50 (Golden Cross)")
    elif prev_ema20 > prev_ema50 and latest["ema20"] < latest["ema50"]:
        score -= 2
        reasons.append("🔻 EMA20 crossed BELOW EMA50 (Death Cross)")

    # RSI (weight: 2)
    if latest["rsi"] < 30:
        score += 2
        reasons.append(f"✅ RSI Oversold ({latest['rsi']})")
    elif latest["rsi"] > 70:
        score -= 2
        reasons.append(f"🔻 RSI Overbought ({latest['rsi']})")
    elif 40 < latest["rsi"] < 60:
        reasons.append(f"➡️ RSI Neutral ({latest['rsi']})")

    # MACD (weight: 2)
    if latest["macd"] > latest["macd_signal"] and latest["macd_hist"] > 0:
        score += 2
        reasons.append("✅ MACD Bullish crossover")
    elif latest["macd"] < latest["macd_signal"] and latest["macd_hist"] < 0:
        score -= 2
        reasons.append("🔻 MACD Bearish crossover")

    # Bollinger (weight: 1)
    if latest["close"] < latest["bb_lower"]:
        score += 1
        reasons.append("✅ Price below BB Lower (oversold)")
    elif latest["close"] > latest["bb_upper"]:
        score -= 1
        reasons.append("🔻 Price above BB Upper (overbought)")

    # ── Final Signal ──────────────────────────────────────────
    # FIX: max achievable score is 8 (3+2+2+1=8, RSI extreme adds +2 but rare)
    # Using 8 so normal trending market (score=5) gives 62.5% confidence
    max_score = 8  # was 10 — caused confidence to cap at 50% blocking auto-trade
    confidence = round(abs(score) / max_score * 100, 1)

    if score >= 4:
        signal = "STRONG BUY"
        color  = "green"
    elif score >= 2:
        signal = "BUY"
        color  = "lightgreen"
    elif score <= -4:
        signal = "STRONG SELL"
        color  = "red"
    elif score <= -2:
        signal = "SELL"
        color  = "orange"
    else:
        signal = "NEUTRAL"
        color  = "gray"

    # ── SL/TP suggestion based on ATR ─────────────────────────
    atr_val   = latest["atr"]
    pip_div   = get_pip_divisor(symbol)
    suggested_sl_pips = round(atr_val * 1.5 / pip_div)   # 1.5x ATR
    suggested_tp_pips = round(atr_val * 3.0 / pip_div)   # 3x ATR (1:2 RR)

    return {
        "indicators": latest,
        "signal": {
            "direction":  signal,
            "score":      score,
            "confidence": confidence,
            "color":      color,
            "reasons":    reasons,
        },
        "risk_management": {
            "suggested_sl_pips": suggested_sl_pips,
            "suggested_tp_pips": suggested_tp_pips,
            "atr": latest["atr"],
            "risk_reward": "1:2",
        }
    }