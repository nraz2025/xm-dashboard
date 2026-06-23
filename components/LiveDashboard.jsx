import { useState, useEffect, useCallback } from "react";

// ── UPDATE THIS URL SETIAP KALI RESTART VPS — same backend, same tunnel
// as TradingDashboard.jsx (this dashboard just talks to account=5/bot_id=5
// on the same FastAPI server) ────────────────────────────────────────────
const API = "https://assessed-period-bufing-merry.trycloudflare.com";
// ─────────────────────────────────────────────────────────────────────────

const LIVE_ACCOUNT = 5;
const LIVE_BOT_ID  = 5;
const LIVE_MAGIC   = 55555;

// Distinct palette from the demo dashboard's amber/blue scheme — this
// dashboard controls REAL MONEY, so it should never be visually
// confusable with the demo Quad Bot dashboard at a glance.
const C = {
  bg:"#0a0707",panel:"#140d0d",card:"#1a1010",border:"#3a1a1a",
  live:"#ff3b3b",liveDim:"#7a1f1f",buy:"#10b981",sell:"#ef4444",
  muted:"#8a6b6b",dim:"#6b5555",text:"#f5e8e8",
  mono:"'JetBrains Mono','Fira Code','Courier New',monospace",
  sans:"'Inter',system-ui,sans-serif",
};

const fmt    = (n,d=5)=>(n==null||isNaN(Number(n)))?"—":Number(n).toFixed(d);
const fmtPnl = (n)=>{const v=Number(n);return(v>=0?"+":"")+v.toFixed(2);};

export default function LiveDashboard(){
  const [account,setAccount]   = useState(null);
  const [connected,setConnected] = useState(false);
  const [positions,setPositions] = useState([]);
  const [history,setHistory]   = useState([]);
  const [autoOn,setAutoOn]     = useState(false);
  const [maxPos,setMaxPos]     = useState(2);
  const [autoLog,setAutoLog]   = useState([]);
  const [lastTrade,setLastTrade] = useState(null);
  const [toast,setToast]       = useState(null);
  const [loading,setLoading]   = useState(false);
  const [confirmArm,setConfirmArm] = useState(false); // require a deliberate second click to flip auto ON

  const showToast = (msg,type="ok") => { setToast({msg,type}); setTimeout(()=>setToast(null), 4000); };

  const fetchAll = useCallback(async () => {
    try {
      const [accRes, posRes, histRes, statusRes, capRes] = await Promise.all([
        fetch(`${API}/account?acc=${LIVE_ACCOUNT}`),
        fetch(`${API}/positions?account=${LIVE_ACCOUNT}&magic=${LIVE_MAGIC}`),
        fetch(`${API}/history?days=30&account=${LIVE_ACCOUNT}&magic=${LIVE_MAGIC}`),
        fetch(`${API}/auto-status`),
        fetch(`${API}/live-max-positions`),
      ]);
      if (accRes.ok) { setAccount(await accRes.json()); setConnected(true); }
      else { setConnected(false); }
      if (posRes.ok) setPositions(await posRes.json());
      if (histRes.ok) setHistory(await histRes.json());
      if (statusRes.ok) {
        const data = await statusRes.json();
        const bot5 = data[LIVE_BOT_ID];
        if (bot5) {
          setAutoOn(bot5.enabled);
          setAutoLog(bot5.log || []);
          setLastTrade(bot5.last_trade);
        }
      }
      if (capRes.ok) setMaxPos((await capRes.json()).max_positions);
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 10000);
    return () => clearInterval(t);
  }, [fetchAll]);

  const toggleAuto = async () => {
    const turningOn = !autoOn;
    // Extra deliberate-click guard ONLY when turning ON — turning off
    // should always be instant and frictionless, never gated.
    if (turningOn && !confirmArm) {
      setConfirmArm(true);
      showToast("Tap sekali lagi untuk SAHKAN — ini akan letak REAL MONEY order");
      setTimeout(() => setConfirmArm(false), 5000);
      return;
    }
    setConfirmArm(false);
    setLoading(true);
    try {
      const r = await fetch(`${API}/auto-toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot_id: LIVE_BOT_ID, enabled: turningOn }),
      });
      if (!r.ok) throw new Error("toggle failed");
      setAutoOn(turningOn);
      showToast(turningOn ? "🔴 LIVE AUTO-TRADE ENABLED — real orders will be placed" : "Auto-trade disabled");
    } catch (e) {
      showToast(`Toggle failed: ${e.message}`, "err");
    }
    setLoading(false);
  };

  const setLiveMaxPositions = async (n) => {
    try {
      const r = await fetch(`${API}/live-max-positions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_positions: n }),
      });
      if (!r.ok) throw new Error("set cap failed");
      setMaxPos(n);
      showToast(`Max concurrent positions set to ${n}`);
    } catch (e) {
      showToast(`Failed: ${e.message}`, "err");
    }
  };

  const closePosition = async (ticket) => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket, account: LIVE_ACCOUNT }),
      });
      const d = await r.json();
      if (d.status === "closed") { showToast(`Closed #${ticket} @${d.price}`); fetchAll(); }
      else throw new Error(d.detail || "close failed");
    } catch (e) {
      showToast(`Close failed: ${e.message}`, "err");
    }
    setLoading(false);
  };

  const totalFloatPnl = positions.reduce((s,p)=>s+(p.profit||0),0);
  const histPnl       = history.reduce((s,h)=>s+(h.profit||0),0);
  const slotsUsed      = positions.length;
  const funded         = account != null && Number(account.balance) > 0;

  return (
    <div style={{fontFamily:C.sans,background:C.bg,minHeight:"100vh",color:C.text,padding:0}}>

      {/* Top warning bar — always visible, unmistakable */}
      <div style={{background:`linear-gradient(90deg, ${C.liveDim}, ${C.live}22)`,borderBottom:`2px solid ${C.live}`,padding:"10px 20px",display:"flex",alignItems:"center",gap:10,position:"sticky",top:0,zIndex:100}}>
        <div style={{width:9,height:9,borderRadius:"50%",background:C.live,boxShadow:`0 0 8px ${C.live}`,animation:"pulse 1.6s infinite"}}/>
        <span style={{fontWeight:900,fontSize:14,letterSpacing:0.5,color:C.live}}>LIVE TRADING — REAL MONEY</span>
        <span style={{fontSize:11,color:C.muted,marginLeft:8}}>Bot 5 · CSR100 v2 · min_retest=2 · Magic {LIVE_MAGIC}</span>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:connected?C.buy:C.sell}}/>
          <span style={{fontSize:11,fontFamily:C.mono,color:connected?C.buy:C.sell}}>{connected?"CONNECTED":"OFFLINE"}</span>
        </div>
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>

      <div style={{padding:16,display:"flex",flexDirection:"column",gap:14,maxWidth:760,margin:"0 auto"}}>

        {!funded && (
          <div style={{background:C.card,border:`1px solid ${C.live}55`,borderRadius:8,padding:14}}>
            <div style={{fontSize:12,fontWeight:700,color:C.live,marginBottom:4}}>⚠️ Account belum funded</div>
            <div style={{fontSize:12,color:C.muted}}>
              Balance tunjuk $0 atau tak connect — deposit modal $5 ke akaun live ni dulu (login {LIVE_ACCOUNT} kat .env)
              sebelum hidupkan auto-trade. Auto-trade toggle di bawah selamat ditekan-tekan sekarang sebab takkan ada
              order placed tanpa balance.
            </div>
          </div>
        )}

        {/* Account stats */}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:16}}>
          <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1.5,marginBottom:12,fontWeight:600}}>Live Account</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            {[
              ["Balance", account?`$${Number(account.balance).toFixed(2)}`:"—"],
              ["Equity",  account?`$${Number(account.equity).toFixed(2)}`:"—"],
              ["Floating P&L", fmtPnl(totalFloatPnl), totalFloatPnl>=0?C.buy:C.sell],
              ["Free Margin", account?`$${Number(account.free_margin).toFixed(2)}`:"—"],
            ].map(([l,v,col])=>(
              <div key={l}>
                <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>{l}</div>
                <div style={{fontFamily:C.mono,fontSize:18,fontWeight:700,color:col||C.text}}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Master control */}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div>
              <div style={{fontSize:13,fontWeight:700}}>Auto-Trade</div>
              <div style={{fontSize:11,color:C.muted,marginTop:2}}>
                {autoOn ? "Bot akan letak order automatik bila valid setup jumpa" : "Disabled — scanning je, takkan letak order"}
              </div>
            </div>
            <button
              onClick={toggleAuto}
              disabled={loading}
              style={{
                fontFamily:C.sans,fontSize:12,fontWeight:800,padding:"10px 18px",borderRadius:6,
                border:`2px solid ${autoOn?C.live:C.border}`,
                background:autoOn?C.live:"transparent",
                color:autoOn?"#000":(confirmArm?C.live:C.muted),
                cursor:loading?"not-allowed":"pointer",
                letterSpacing:0.5,
              }}>
              {autoOn ? "🔴 LIVE ON — TAP TO STOP" : confirmArm ? "TAP LAGI UNTUK SAHKAN" : "OFF — TAP TO ENABLE"}
            </button>
          </div>

          <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14}}>
            <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>
              Max concurrent positions (global, semua pair)
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              {[1,2].map(n=>(
                <button key={n} onClick={()=>setLiveMaxPositions(n)}
                  style={{fontFamily:C.mono,fontSize:13,fontWeight:700,padding:"6px 16px",borderRadius:5,
                    background:maxPos===n?C.live:"transparent",
                    color:maxPos===n?"#000":C.dim,
                    border:`1px solid ${maxPos===n?C.live:C.border}`,cursor:"pointer"}}>
                  {n}
                </button>
              ))}
              <div style={{marginLeft:12,flex:1}}>
                <div style={{fontSize:9,color:C.muted,marginBottom:4}}>Slots used</div>
                <div style={{display:"flex",gap:3}}>
                  {Array.from({length:maxPos}).map((_,i)=>(
                    <div key={i} style={{flex:1,height:8,borderRadius:3,
                      background:i<slotsUsed?C.live:C.border}}/>
                  ))}
                </div>
              </div>
              <span style={{fontFamily:C.mono,fontSize:13,fontWeight:700,color:slotsUsed>=maxPos?C.live:C.text}}>
                {slotsUsed}/{maxPos}
              </span>
            </div>
          </div>
        </div>

        {/* Open positions */}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:16}}>
          <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1.5,marginBottom:12,fontWeight:600}}>
            Open Positions ({positions.length})
          </div>
          {positions.length===0 ? (
            <div style={{fontSize:12,color:C.muted,textAlign:"center",padding:"14px 0"}}>No open positions</div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {positions.map(p=>(
                <div key={p.ticket} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <span style={{fontFamily:C.mono,fontSize:13,fontWeight:700}}>{p.symbol}</span>
                      <span style={{fontFamily:C.mono,fontSize:11,fontWeight:700,color:p.type==="BUY"?C.buy:C.sell}}>{p.type}</span>
                      <span style={{fontFamily:C.mono,fontSize:11,color:C.muted}}>{p.lot}L</span>
                    </div>
                    <div style={{fontSize:10,color:C.muted,fontFamily:C.mono,marginTop:2}}>#{p.ticket} · {fmt(p.open_price)}</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontFamily:C.mono,fontSize:14,fontWeight:700,color:p.profit>=0?C.buy:C.sell}}>{fmtPnl(p.profit)}</span>
                    <button onClick={()=>closePosition(p.ticket)} disabled={loading}
                      style={{fontFamily:C.sans,fontSize:10,fontWeight:700,background:C.sell+"22",color:C.sell,border:`1px solid ${C.sell}66`,borderRadius:4,padding:"4px 10px",cursor:"pointer"}}>
                      CLOSE
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* History */}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:16}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
            <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1.5,fontWeight:600}}>History (30d)</div>
            <span style={{fontFamily:C.mono,fontSize:13,fontWeight:700,color:histPnl>=0?C.buy:C.sell}}>{fmtPnl(histPnl)}</span>
          </div>
          {history.length===0 ? (
            <div style={{fontSize:12,color:C.muted,textAlign:"center",padding:"10px 0"}}>No trades yet</div>
          ) : (
            history.slice(0,15).map((h,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderTop:i>0?`1px solid ${C.border}`:"none",fontSize:11}}>
                <div style={{display:"flex",gap:8,fontFamily:C.mono}}>
                  <span style={{fontWeight:700}}>{h.symbol}</span>
                  <span style={{color:h.type==="BUY"?C.buy:C.sell}}>{h.type}</span>
                  <span style={{color:C.muted}}>{h.lot}L</span>
                </div>
                <span style={{fontFamily:C.mono,fontWeight:700,color:h.profit>=0?C.buy:C.sell}}>{fmtPnl(h.profit)}</span>
              </div>
            ))
          )}
        </div>

        {/* Auto log */}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:8}}>
            <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1.5,fontWeight:600}}>Auto Log</div>
            {lastTrade && <span style={{fontSize:10,color:C.dim,fontFamily:C.mono}}>last trade: {lastTrade}</span>}
          </div>
          <div style={{background:C.bg,borderRadius:5,padding:8,border:`1px solid ${C.border}`,maxHeight:160,overflowY:"auto"}}>
            {autoLog.length===0 ? (
              <div style={{fontFamily:C.mono,fontSize:10,color:C.muted}}>Waiting for scan...</div>
            ) : autoLog.map((log,i)=>(
              <div key={i} style={{fontFamily:C.mono,fontSize:10,color:C.dim,padding:"2px 0",borderBottom:i<autoLog.length-1?`1px solid ${C.border}`:"none"}}>{log}</div>
            ))}
          </div>
        </div>

      </div>

      {toast && (
        <div style={{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",
          background:toast.type==="err"?C.sell:C.live,color:"#000",padding:"10px 20px",borderRadius:8,
          zIndex:999,fontFamily:C.sans,fontSize:12,fontWeight:700,boxShadow:"0 4px 24px rgba(0,0,0,0.6)",
          maxWidth:480,textAlign:"center"}}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}