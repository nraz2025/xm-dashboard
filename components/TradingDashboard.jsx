import { useState, useEffect, useCallback, useRef } from "react";

const API = "https://rays-acres-diffs-heath.trycloudflare.com";

// ── Palette ────────────────────────────────────────────────────────────────
// Deep navy terminal + amber accent + signal green/red
// Monospace data, sans-serif labels
const S = {
  bg:       "#0a0e1a",
  surface:  "#111827",
  card:     "#141c2e",
  border:   "#1e2d45",
  accent:   "#f59e0b",   // amber
  buy:      "#10b981",   // emerald
  sell:     "#ef4444",   // red
  neutral:  "#6b7280",
  text:     "#e2e8f0",
  muted:    "#64748b",
  mono:     "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
  sans:     "'Inter', system-ui, sans-serif",
};

// ── Utility ────────────────────────────────────────────────────────────────
const fmt = (n, d = 5) => Number(n).toFixed(d);
const fmtPnl = (n) => {
  const v = Number(n);
  return (v >= 0 ? "+" : "") + v.toFixed(2);
};
const signalColor = (s) => {
  if (s?.includes("STRONG BUY"))  return S.buy;
  if (s?.includes("BUY"))         return "#34d399";
  if (s?.includes("STRONG SELL")) return S.sell;
  if (s?.includes("SELL"))        return "#f87171";
  return S.neutral;
};

// ── Mini Sparkline ─────────────────────────────────────────────────────────
function Sparkline({ data = [], color = S.accent, height = 36, width = 120 }) {
  if (!data.length) return null;
  const vals = data.map(Number);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── Pill Badge ─────────────────────────────────────────────────────────────
function Signal({ label }) {
  const c = signalColor(label);
  return (
    <span style={{
      fontFamily: S.mono, fontSize: 11, fontWeight: 700,
      background: c + "22", color: c,
      border: `1px solid ${c}44`,
      padding: "2px 8px", borderRadius: 4, letterSpacing: 1,
      whiteSpace: "nowrap",
    }}>{label || "—"}</span>
  );
}

// ── Stat Cell ──────────────────────────────────────────────────────────────
function Stat({ label, value, color, mono = true }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontFamily: S.sans, fontSize: 10, color: S.muted, textTransform: "uppercase", letterSpacing: 1 }}>
        {label}
      </span>
      <span style={{
        fontFamily: mono ? S.mono : S.sans,
        fontSize: 15, fontWeight: 600,
        color: color || S.text,
      }}>{value ?? "—"}</span>
    </div>
  );
}

// ── Section Card ──────────────────────────────────────────────────────────
function Card({ title, children, action, style = {} }) {
  return (
    <div style={{
      background: S.card, border: `1px solid ${S.border}`,
      borderRadius: 8, overflow: "hidden", ...style,
    }}>
      {title && (
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "10px 16px", borderBottom: `1px solid ${S.border}`,
          background: S.surface,
        }}>
          <span style={{ fontFamily: S.sans, fontSize: 11, fontWeight: 600,
            color: S.muted, textTransform: "uppercase", letterSpacing: 1.5 }}>
            {title}
          </span>
          {action}
        </div>
      )}
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}

// ── Btn ───────────────────────────────────────────────────────────────────
function Btn({ onClick, children, color = S.accent, disabled, small }) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        fontFamily: S.sans, fontSize: small ? 11 : 12, fontWeight: 700,
        padding: small ? "4px 10px" : "8px 18px",
        background: disabled ? S.border : hover ? color : color + "dd",
        color: disabled ? S.muted : "#000",
        border: "none", borderRadius: 5, cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.15s", letterSpacing: 0.5,
        textTransform: "uppercase",
      }}>
      {children}
    </button>
  );
}

// ── MAIN DASHBOARD ────────────────────────────────────────────────────────
export default function TradingDashboard() {
  const [account, setAccount]     = useState(null);
  const [scan, setScan]           = useState([]);
  const [analysis, setAnalysis]   = useState(null);
  const [positions, setPositions] = useState([]);
  const [history, setHistory]     = useState([]);
  const [symbol, setSymbol]       = useState("EURUSD");
  const [timeframe, setTimeframe] = useState("H1");
  const [loading, setLoading]     = useState({});
  const [toast, setToast]         = useState(null);
  const [autoMode, setAutoMode]   = useState(true);
  const [tab, setTab]             = useState("positions");
  const [candles, setCandles]     = useState([]);
  const [orderForm, setOrderForm] = useState({ lot: 0.01, sl: 20, tp: 40 });
  const autoRef = useRef(null);
  const [autoLog, setAutoLog]           = useState([]);
  const [lastTradeTime, setLastTradeTime] = useState(null);
  const [botMode, setBotMode]           = useState("bot1");

  const MAX_POSITIONS = 3;
  const COOLDOWN_HOURS = 4;
  const SCAN_PAIRS = ["EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD","USDCHF","NZDUSD","XAUUSD"];

  const addAutoLog = (msg) => {
    const time = new Date().toLocaleTimeString("en-MY", { hour12: false });
    setAutoLog(prev => [`[${time}] ${msg}`, ...prev].slice(0, 20));
  };

  const setLoad = (k, v) => setLoading(p => ({ ...p, [k]: v }));
  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchAccount = useCallback(async () => {
    try {
      const r = await fetch(`${API}/account`);
      setAccount(await r.json());
    } catch { showToast("Cannot connect to backend", "err"); }
  }, []);

  const fetchScan = useCallback(async () => {
    setLoad("scan", true);
    try {
      const r = await fetch(`${API}/scan?timeframe=${timeframe}`);
      setScan(await r.json());
    } catch {}
    setLoad("scan", false);
  }, [timeframe]);

  const fetchAnalysis = useCallback(async (sym = symbol, tf = timeframe) => {
    setLoad("analysis", true);
    try {
      const [aRes, cRes] = await Promise.all([
        fetch(`${API}/analyze/${sym}?timeframe=${tf}`),
        fetch(`${API}/candles/${sym}?timeframe=${tf}&count=60`),
      ]);
      setAnalysis(await aRes.json());
      setCandles(await cRes.json());
    } catch {}
    setLoad("analysis", false);
  }, [symbol, timeframe]);

  const fetchPositions = useCallback(async () => {
    try {
      const r = await fetch(`${API}/positions`);
      setPositions(await r.json());
    } catch {}
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const r = await fetch(`${API}/history?days=14`);
      setHistory(await r.json());
    } catch {}
  }, []);

  const placeOrder = async (action) => {
    setLoad("order", true);
    try {
      const r = await fetch(`${API}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol, action,
          lot: orderForm.lot,
          sl_pips: orderForm.sl,
          tp_pips: orderForm.tp,
          comment: "XM-Dashboard",
        }),
      });
      const data = await r.json();
      if (data.ticket) {
        showToast(`✅ ${action.toUpperCase()} ${symbol} @ ${data.price} — Ticket #${data.ticket}`);
        fetchPositions();
      } else {
        showToast(data.detail || "Order failed", "err");
      }
    } catch (e) { showToast("Order failed: " + e.message, "err"); }
    setLoad("order", false);
  };

  const closePosition = async (ticket) => {
    try {
      const r = await fetch(`${API}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket }),
      });
      const data = await r.json();
      if (data.status === "closed") {
        showToast(`✅ Position #${ticket} closed`);
        fetchPositions(); fetchHistory();
      }
    } catch (e) { showToast("Close failed: " + e.message, "err"); }
  };

  // Auto trade loop — scan ALL pairs
  useEffect(() => {
    if (!autoMode) { clearInterval(autoRef.current); return; }
    const run = async () => {
      try {
        // ── Check max positions ──────────────────────────────
        const posRes = await fetch(`${API}/positions`);
        const openPos = await posRes.json();
        if (openPos.length >= MAX_POSITIONS) {
          addAutoLog(`⏸ Max positions (${MAX_POSITIONS}) reached — skipping`);
          return;
        }

        // ── Check cooldown ───────────────────────────────────
        if (lastTradeTime) {
          const hoursSince = (Date.now() - lastTradeTime) / 3600000;
          if (hoursSince < COOLDOWN_HOURS) {
            const remaining = (COOLDOWN_HOURS - hoursSince).toFixed(1);
            addAutoLog(`⏳ Cooldown: ${remaining}h remaining`);
            return;
          }
        }

        // ── Scan all pairs ───────────────────────────────────
        addAutoLog(`🔍 Scanning ${SCAN_PAIRS.length} pairs...`);
        const endpoint = botMode === "bot2" ? "analyze-vp" : "analyze";
        const signals = [];

        for (const pair of SCAN_PAIRS) {
          try {
            const r = await fetch(`${API}/${endpoint}/${pair}?timeframe=${timeframe}`);
            const data = await r.json();
            const sig  = data?.signal?.direction;
            const conf = data?.signal?.confidence || 0;
            if (conf >= 60 && (sig === "STRONG BUY" || sig === "STRONG SELL")) {
              signals.push({ pair, sig, conf, data });
            }
          } catch {}
        }

        if (signals.length === 0) {
          addAutoLog(`😴 No strong signals found`);
          return;
        }

        // ── Pick strongest signal ─────────────────────────────
        signals.sort((a, b) => b.conf - a.conf);
        const best = signals[0];
        addAutoLog(`🎯 Best signal: ${best.sig} ${best.pair} (${best.conf}%)`);

        // ── Check not already in this pair ───────────────────
        const alreadyIn = openPos.some(p => p.symbol === best.pair);
        if (alreadyIn) {
          addAutoLog(`⚠️ Already have open position in ${best.pair} — skip`);
          return;
        }

        // ── Execute trade ─────────────────────────────────────
        const action = best.sig === "STRONG BUY" ? "buy" : "sell";
        const r = await fetch(`${API}/order`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol:   best.pair,
            action,
            lot:      orderForm.lot,
            sl_pips:  orderForm.sl,
            tp_pips:  orderForm.tp,
            comment:  `Auto-${botMode}`,
          }),
        });
        const result = await r.json();
        if (result.ticket) {
          setLastTradeTime(Date.now());
          addAutoLog(`✅ ${action.toUpperCase()} ${best.pair} @ ${result.price} #${result.ticket}`);
          showToast(`⚡ AUTO: ${action.toUpperCase()} ${best.pair} @ ${result.price} — #${result.ticket}`);
          fetchPositions();
          fetchHistory();
        } else {
          addAutoLog(`❌ Order failed: ${result.detail}`);
        }
      } catch (e) {
        addAutoLog(`❌ Error: ${e.message}`);
      }
    };
    run(); // run immediately on start
    autoRef.current = setInterval(run, 30000);
    return () => clearInterval(autoRef.current);
  }, [autoMode, timeframe, botMode, orderForm, lastTradeTime]);

  // Initial + periodic refresh
  useEffect(() => {
    fetchAccount(); fetchScan(); fetchAnalysis(); fetchPositions(); fetchHistory();
    const t = setInterval(() => { fetchAccount(); fetchPositions(); }, 10000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { fetchAnalysis(); }, [symbol, timeframe]);
  useEffect(() => { fetchScan(); }, [timeframe]);

  const sig = analysis?.signal;
  const ind = analysis?.indicators;
  const rm  = analysis?.risk_management;
  const closePrices = Array.isArray(candles) ? candles.map(c => c.close) : [];
  const totalPnl = positions.reduce((s, p) => s + p.profit, 0);
  const historyPnl = history.reduce((s, h) => s + (h.profit || 0), 0);

  const TIMEFRAMES = ["M1","M5","M15","M30","H1","H4","D1"];
  const PAIRS = ["EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD","USDCHF","NZDUSD","XAUUSD","GBPJPY","EURJPY"];

  return (
    <div style={{
      fontFamily: S.sans, background: S.bg, minHeight: "100vh",
      color: S.text, padding: "0", margin: 0,
    }}>
      {/* ── TOPBAR ── */}
      <div style={{
        background: S.surface, borderBottom: `1px solid ${S.border}`,
        padding: "0 24px", display: "flex", alignItems: "center",
        justifyContent: "space-between", height: 52, position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: S.accent, display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 900, fontSize: 14, color: "#000",
          }}>X</div>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: 0.5 }}>XM Trading</span>
          <span style={{ color: S.muted, fontSize: 12 }}>Dashboard</span>
        </div>

        {/* Account strip */}
        {account && (
          <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
            {[
              ["Balance", `$${account.balance?.toFixed(2)}`],
              ["Equity",  `$${account.equity?.toFixed(2)}`],
              ["P&L",     fmtPnl(account.profit), account.profit >= 0 ? S.buy : S.sell],
              ["Free Margin", `$${account.free_margin?.toFixed(2)}`],
            ].map(([l, v, c]) => (
              <div key={l} style={{ textAlign: "right" }}>
                <div style={{ fontSize: 9, color: S.muted, textTransform: "uppercase", letterSpacing: 1 }}>{l}</div>
                <div style={{ fontFamily: S.mono, fontSize: 13, fontWeight: 600, color: c || S.text }}>{v}</div>
              </div>
            ))}
            <div style={{
              width: 8, height: 8, borderRadius: "50%", background: S.buy,
              boxShadow: `0 0 6px ${S.buy}`,
            }} />
          </div>
        )}

        {/* Auto mode toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: autoMode ? S.accent : S.muted, fontWeight: 600 }}>
            {autoMode ? "⚡ AUTO ON" : "AUTO OFF"}
          </span>
          <div onClick={() => setAutoMode(p => !p)} style={{
            width: 42, height: 22, borderRadius: 11, cursor: "pointer",
            background: autoMode ? S.accent : S.border,
            position: "relative", transition: "background 0.2s",
          }}>
            <div style={{
              position: "absolute", top: 3, left: autoMode ? 23 : 3,
              width: 16, height: 16, borderRadius: "50%", background: "#fff",
              transition: "left 0.2s",
            }} />
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr 320px", gap: 0, height: "calc(100vh - 52px)" }}>

        {/* ── LEFT: Market Scanner ── */}
        <div style={{
          background: S.surface, borderRight: `1px solid ${S.border}`,
          overflowY: "auto", display: "flex", flexDirection: "column",
        }}>
          <div style={{
            padding: "12px 16px", borderBottom: `1px solid ${S.border}`,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: S.muted, textTransform: "uppercase", letterSpacing: 1.5 }}>
              Market Scanner
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              {["H1","H4","D1"].map(tf => (
                <button key={tf} onClick={() => setTimeframe(tf)} style={{
                  fontFamily: S.mono, fontSize: 10, padding: "2px 7px",
                  background: timeframe === tf ? S.accent : "transparent",
                  color: timeframe === tf ? "#000" : S.muted,
                  border: `1px solid ${timeframe === tf ? S.accent : S.border}`,
                  borderRadius: 4, cursor: "pointer", fontWeight: 600,
                }}>{tf}</button>
              ))}
            </div>
          </div>

          {loading.scan && (
            <div style={{ padding: 16, color: S.muted, fontSize: 12, textAlign: "center" }}>Scanning...</div>
          )}

          {scan.map(row => (
            <div key={row.symbol} onClick={() => setSymbol(row.symbol)}
              style={{
                padding: "10px 16px", cursor: "pointer", borderBottom: `1px solid ${S.border}`,
                background: symbol === row.symbol ? S.card : "transparent",
                transition: "background 0.1s",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontFamily: S.mono, fontSize: 13, fontWeight: 700,
                  color: symbol === row.symbol ? S.accent : S.text }}>
                  {row.symbol}
                </span>
                <span style={{ fontFamily: S.mono, fontSize: 11, color: S.muted }}>
                  {fmt(row.bid, row.symbol.includes("JPY") ? 3 : 5)}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                <Signal label={row.signal} />
                <span style={{ fontSize: 10, color: S.muted }}>{row.confidence}%</span>
              </div>
            </div>
          ))}

          {!scan.length && !loading.scan && (
            <div style={{ padding: 24, color: S.muted, fontSize: 12, textAlign: "center" }}>
              Connect backend to see signals
            </div>
          )}
        </div>

        {/* ── CENTER: Chart + Analysis ── */}
        <div style={{ overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Symbol selector + timeframe */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select value={symbol} onChange={e => setSymbol(e.target.value)} style={{
              fontFamily: S.mono, fontSize: 14, fontWeight: 700,
              background: S.card, color: S.text, border: `1px solid ${S.border}`,
              borderRadius: 6, padding: "6px 12px", cursor: "pointer",
            }}>
              {PAIRS.map(p => <option key={p}>{p}</option>)}
            </select>

            <div style={{ display: "flex", gap: 4 }}>
              {TIMEFRAMES.map(tf => (
                <button key={tf} onClick={() => setTimeframe(tf)} style={{
                  fontFamily: S.mono, fontSize: 11, padding: "5px 10px",
                  background: timeframe === tf ? S.accent : S.card,
                  color: timeframe === tf ? "#000" : S.muted,
                  border: `1px solid ${timeframe === tf ? S.accent : S.border}`,
                  borderRadius: 5, cursor: "pointer", fontWeight: 600,
                }}>{tf}</button>
              ))}
            </div>

            {loading.analysis && (
              <span style={{ fontSize: 11, color: S.muted, marginLeft: 8 }}>Analyzing...</span>
            )}
          </div>

          {/* Price + Signal hero */}
          {analysis && (
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                    <span style={{
                      fontFamily: S.mono, fontSize: 32, fontWeight: 900,
                      color: S.text, letterSpacing: -1,
                    }}>{fmt(analysis.tick?.bid, 5)}</span>
                    <span style={{ fontFamily: S.mono, fontSize: 14, color: S.muted }}>
                      Ask: {fmt(analysis.tick?.ask, 5)}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Signal label={sig?.direction} />
                    <span style={{ fontSize: 12, color: S.muted }}>
                      Confidence: <span style={{ color: S.text, fontWeight: 600 }}>{sig?.confidence}%</span>
                    </span>
                    <span style={{ fontSize: 12, color: S.muted }}>
                      Score: <span style={{ color: S.accent, fontFamily: S.mono }}>
                        {sig?.score > 0 ? "+" : ""}{sig?.score}
                      </span>
                    </span>
                  </div>
                </div>

                {/* Sparkline */}
                <div style={{ opacity: 0.8 }}>
                  <Sparkline data={closePrices} color={signalColor(sig?.direction)} width={160} height={50} />
                  <div style={{ fontSize: 9, color: S.muted, textAlign: "center", marginTop: 2 }}>
                    Last {closePrices.length} candles
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Indicators grid */}
          {ind && (
            <Card title="Indicators">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                <Stat label="RSI (14)" value={ind.rsi}
                  color={ind.rsi < 30 ? S.buy : ind.rsi > 70 ? S.sell : S.text} />
                <Stat label="MACD" value={ind.macd} color={ind.macd > 0 ? S.buy : S.sell} />
                <Stat label="MACD Signal" value={ind.macd_signal} />
                <Stat label="MACD Hist" value={ind.macd_hist}
                  color={ind.macd_hist > 0 ? S.buy : S.sell} />
                <Stat label="EMA 20" value={fmt(ind.ema20)} />
                <Stat label="EMA 50" value={fmt(ind.ema50)} />
                <Stat label="EMA 200" value={fmt(ind.ema200)} />
                <Stat label="ATR (14)" value={fmt(ind.atr)} />
                <Stat label="BB Upper" value={fmt(ind.bb_upper)} />
                <Stat label="BB Mid" value={fmt(ind.bb_mid)} />
                <Stat label="BB Lower" value={fmt(ind.bb_lower)} />
                <Stat label="Spread" value={fmt(analysis.tick?.spread, 5)} />
              </div>
            </Card>
          )}

          {/* Signal reasons */}
          {sig?.reasons?.length > 0 && (
            <Card title="Signal Breakdown">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {sig.reasons.map((r, i) => (
                  <div key={i} style={{
                    fontFamily: S.mono, fontSize: 12, color: S.text,
                    padding: "6px 10px", background: S.surface,
                    borderRadius: 5, borderLeft: `3px solid ${signalColor(sig.direction)}`,
                  }}>{r}</div>
                ))}
              </div>
            </Card>
          )}

          {/* Open Positions / History tabs */}
          <Card
            title={
              <div style={{ display: "flex", gap: 0 }}>
                {["positions","history"].map(t => (
                  <button key={t} onClick={() => setTab(t)} style={{
                    fontFamily: S.sans, fontSize: 11, fontWeight: 600,
                    padding: "4px 14px", border: "none", cursor: "pointer",
                    background: tab === t ? S.accent : "transparent",
                    color: tab === t ? "#000" : S.muted,
                    textTransform: "uppercase", letterSpacing: 1,
                    borderRadius: 4,
                  }}>{t === "positions" ? `Positions (${positions.length})` : "History"}</button>
                ))}
              </div>
            }
            action={
              tab === "positions" && totalPnl !== 0 && (
                <span style={{
                  fontFamily: S.mono, fontSize: 12, fontWeight: 700,
                  color: totalPnl >= 0 ? S.buy : S.sell,
                }}>Float: {fmtPnl(totalPnl)}</span>
              )
            }
          >
            {tab === "positions" ? (
              positions.length === 0 ? (
                <div style={{ color: S.muted, fontSize: 12, textAlign: "center", padding: "16px 0" }}>
                  No open positions
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: S.muted }}>
                      {["Ticket","Symbol","Type","Lot","Open","Current","SL","TP","P&L",""].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "4px 8px", fontWeight: 500,
                          fontFamily: S.sans, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map(p => (
                      <tr key={p.ticket} style={{ borderTop: `1px solid ${S.border}` }}>
                        <td style={{ fontFamily: S.mono, padding: "6px 8px", color: S.muted }}>{p.ticket}</td>
                        <td style={{ fontFamily: S.mono, padding: "6px 8px", fontWeight: 700 }}>{p.symbol}</td>
                        <td style={{ fontFamily: S.mono, padding: "6px 8px",
                          color: p.type === "BUY" ? S.buy : S.sell, fontWeight: 700 }}>{p.type}</td>
                        <td style={{ fontFamily: S.mono, padding: "6px 8px" }}>{p.lot}</td>
                        <td style={{ fontFamily: S.mono, padding: "6px 8px" }}>{fmt(p.open_price)}</td>
                        <td style={{ fontFamily: S.mono, padding: "6px 8px" }}>{fmt(p.current_price)}</td>
                        <td style={{ fontFamily: S.mono, padding: "6px 8px", color: S.sell }}>{fmt(p.sl)}</td>
                        <td style={{ fontFamily: S.mono, padding: "6px 8px", color: S.buy }}>{fmt(p.tp)}</td>
                        <td style={{ fontFamily: S.mono, padding: "6px 8px",
                          color: p.profit >= 0 ? S.buy : S.sell, fontWeight: 700 }}>
                          {fmtPnl(p.profit)}
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          <Btn small color={S.sell} onClick={() => closePosition(p.ticket)}>Close</Btn>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : (
              history.length === 0 ? (
                <div style={{ color: S.muted, fontSize: 12, textAlign: "center", padding: "16px 0" }}>
                  No recent trades
                </div>
              ) : (
                <div>
                  <div style={{ marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, color: S.muted }}>Last 14 days ({history.length} trades)</span>
                    <span style={{ fontFamily: S.mono, fontWeight: 700,
                      color: historyPnl >= 0 ? S.buy : S.sell }}>
                      Total: {fmtPnl(historyPnl)}
                    </span>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: S.muted }}>
                        {["Time","Symbol","Type","Lot","Price","P&L"].map(h => (
                          <th key={h} style={{ textAlign: "left", padding: "4px 8px", fontSize: 10,
                            textTransform: "uppercase", letterSpacing: 1 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {history.slice(0, 20).map((h, i) => (
                        <tr key={i} style={{ borderTop: `1px solid ${S.border}` }}>
                          <td style={{ fontFamily: S.mono, padding: "5px 8px", color: S.muted, fontSize: 11 }}>
                            {h.time?.slice(0,16).replace("T"," ")}
                          </td>
                          <td style={{ fontFamily: S.mono, padding: "5px 8px", fontWeight: 700 }}>{h.symbol}</td>
                          <td style={{ fontFamily: S.mono, padding: "5px 8px",
                            color: h.type === "BUY" ? S.buy : S.sell, fontWeight: 700 }}>{h.type}</td>
                          <td style={{ fontFamily: S.mono, padding: "5px 8px" }}>{h.lot}</td>
                          <td style={{ fontFamily: S.mono, padding: "5px 8px" }}>{fmt(h.price)}</td>
                          <td style={{ fontFamily: S.mono, padding: "5px 8px",
                            color: h.profit >= 0 ? S.buy : S.sell, fontWeight: 700 }}>
                            {fmtPnl(h.profit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </Card>
        </div>

        {/* ── RIGHT: Trade Panel ── */}
        <div style={{
          background: S.surface, borderLeft: `1px solid ${S.border}`,
          overflowY: "auto", display: "flex", flexDirection: "column", gap: 0,
        }}>
          {/* Order panel */}
          <div style={{ padding: 16, borderBottom: `1px solid ${S.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: S.muted,
              textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 14 }}>
              Place Order — {symbol}
            </div>

            {/* Lot size */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 10, color: S.muted, textTransform: "uppercase",
                letterSpacing: 1, display: "block", marginBottom: 4 }}>Lot Size</label>
              <div style={{ display: "flex", gap: 4 }}>
                {[0.01, 0.05, 0.1, 0.5].map(v => (
                  <button key={v} onClick={() => setOrderForm(p => ({...p, lot: v}))} style={{
                    flex: 1, fontFamily: S.mono, fontSize: 11,
                    background: orderForm.lot === v ? S.accent : S.card,
                    color: orderForm.lot === v ? "#000" : S.muted,
                    border: `1px solid ${orderForm.lot === v ? S.accent : S.border}`,
                    borderRadius: 4, padding: "5px 0", cursor: "pointer", fontWeight: 600,
                  }}>{v}</button>
                ))}
                <input type="number" step="0.01" min="0.01" value={orderForm.lot}
                  onChange={e => setOrderForm(p => ({...p, lot: parseFloat(e.target.value)}))}
                  style={{
                    flex: 1, fontFamily: S.mono, fontSize: 11,
                    background: S.card, color: S.text,
                    border: `1px solid ${S.border}`, borderRadius: 4,
                    padding: "5px 6px", width: "100%",
                  }} />
              </div>
            </div>

            {/* SL / TP */}
            {[["Stop Loss (pips)", "sl"], ["Take Profit (pips)", "tp"]].map(([lbl, key]) => (
              <div key={key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 10, color: S.muted, textTransform: "uppercase",
                  letterSpacing: 1, display: "block", marginBottom: 4 }}>{lbl}</label>
                <div style={{ display: "flex", gap: 4 }}>
                  {(key === "sl" ? [20,50,100] : [50,100,200]).map(v => (
                    <button key={v} onClick={() => setOrderForm(p => ({...p, [key]: v}))} style={{
                      flex: 1, fontFamily: S.mono, fontSize: 11,
                      background: orderForm[key] === v ? (key === "sl" ? S.sell : S.buy) + "33" : S.card,
                      color: orderForm[key] === v ? (key === "sl" ? S.sell : S.buy) : S.muted,
                      border: `1px solid ${orderForm[key] === v ? (key === "sl" ? S.sell : S.buy) : S.border}`,
                      borderRadius: 4, padding: "5px 0", cursor: "pointer", fontWeight: 600,
                    }}>{v}</button>
                  ))}
                  <input type="number" min="1" value={orderForm[key]}
                    onChange={e => setOrderForm(p => ({...p, [key]: parseInt(e.target.value)}))}
                    style={{
                      flex: 1, fontFamily: S.mono, fontSize: 11,
                      background: S.card, color: S.text,
                      border: `1px solid ${S.border}`, borderRadius: 4, padding: "5px 6px",
                    }} />
                </div>
              </div>
            ))}

            {/* Suggested SL/TP from ATR */}
            {rm && (
              <div style={{
                fontSize: 11, color: S.muted, background: S.card,
                padding: "8px 10px", borderRadius: 6, marginBottom: 12,
                border: `1px solid ${S.border}`,
              }}>
                <div style={{ marginBottom: 3, color: S.accent, fontWeight: 600 }}>💡 ATR-based suggestion</div>
                <div>SL: <span style={{ fontFamily: S.mono, color: S.sell }}>{rm.suggested_sl_pips} pips</span>
                  {"  "}TP: <span style={{ fontFamily: S.mono, color: S.buy }}>{rm.suggested_tp_pips} pips</span>
                  {"  "}RR: <span style={{ fontFamily: S.mono }}>{rm.risk_reward}</span>
                </div>
              </div>
            )}

            {/* BUY / SELL buttons */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button onClick={() => placeOrder("buy")} disabled={loading.order} style={{
                fontFamily: S.sans, fontSize: 13, fontWeight: 700, padding: "12px 0",
                background: S.buy, color: "#fff", border: "none",
                borderRadius: 6, cursor: "pointer", letterSpacing: 0.5,
                opacity: loading.order ? 0.5 : 1,
              }}>▲ BUY</button>
              <button onClick={() => placeOrder("sell")} disabled={loading.order} style={{
                fontFamily: S.sans, fontSize: 13, fontWeight: 700, padding: "12px 0",
                background: S.sell, color: "#fff", border: "none",
                borderRadius: 6, cursor: "pointer", letterSpacing: 0.5,
                opacity: loading.order ? 0.5 : 1,
              }}>▼ SELL</button>
            </div>
          </div>

          {/* Auto mode info */}
          <div style={{ padding: 16, borderBottom: `1px solid ${S.border}` }}>
            <div style={{
              padding: "10px 12px", borderRadius: 6,
              background: autoMode ? S.accent + "11" : S.card,
              border: `1px solid ${autoMode ? S.accent : S.border}`,
              marginBottom: 10,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: autoMode ? S.accent : S.muted,
                marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                {autoMode ? "⚡ Auto Trade Active" : "Auto Trade"}
              </div>
              <div style={{ fontSize: 11, color: S.muted, lineHeight: 1.6 }}>
                {autoMode
                  ? `Scanning all ${SCAN_PAIRS.length} pairs every 30s. Max ${MAX_POSITIONS} positions. ${COOLDOWN_HOURS}h cooldown.`
                  : "Toggle the switch in the header to enable auto trading on strong signals."}
              </div>
            </div>

            {/* Bot selector */}
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {[["bot1","Bot 1 Standard"],["bot2","Bot 2 + VP"]].map(([k,l]) => (
                <button key={k} onClick={() => setBotMode(k)} style={{
                  flex: 1, fontFamily: S.sans, fontSize: 11, fontWeight: 600,
                  padding: "5px 0", borderRadius: 5, cursor: "pointer",
                  background: botMode === k ? S.accent : S.card,
                  color: botMode === k ? "#000" : S.muted,
                  border: `1px solid ${botMode === k ? S.accent : S.border}`,
                }}>{l}</button>
              ))}
            </div>

            {/* Auto trade log */}
            {autoMode && autoLog.length > 0 && (
              <div style={{
                background: S.bg, borderRadius: 5, padding: 8,
                border: `1px solid ${S.border}`, maxHeight: 120, overflowY: "auto",
              }}>
                {autoLog.map((log, i) => (
                  <div key={i} style={{
                    fontFamily: S.mono, fontSize: 10, color: S.muted,
                    padding: "1px 0", borderBottom: i < autoLog.length-1 ? `1px solid ${S.border}` : "none",
                  }}>{log}</div>
                ))}
              </div>
            )}
          </div>

          {/* Quick stats */}
          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: S.muted,
              textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>
              Session Stats
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Stat label="Open Trades" value={positions.length} mono={false} />
              <Stat label="Float P&L" value={fmtPnl(totalPnl)}
                color={totalPnl >= 0 ? S.buy : S.sell} />
              <Stat label="14-Day Trades" value={history.length} mono={false} />
              <Stat label="14-Day P&L" value={fmtPnl(historyPnl)}
                color={historyPnl >= 0 ? S.buy : S.sell} />
              {account && <>
                <Stat label="Leverage" value={`1:${account.leverage}`} />
                <Stat label="Currency" value={account.currency} mono={false} />
              </>}
            </div>
          </div>
        </div>
      </div>

      {/* ── TOAST ── */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: toast.type === "err" ? S.sell : S.buy,
          color: "#fff", padding: "10px 20px", borderRadius: 8, zIndex: 999,
          fontFamily: S.sans, fontSize: 13, fontWeight: 600,
          boxShadow: "0 4px 20px rgba(0,0,0,0.4)", maxWidth: 500, textAlign: "center",
        }}>{toast.msg}</div>
      )}
    </div>
  );
}
