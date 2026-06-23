import { useState, useEffect, useCallback, useRef } from "react";

// ── UPDATE THIS URL SETIAP KALI RESTART VPS ──────────────────────────────
const API = "https://leisure-jar-listprice-intelligent.trycloudflare.com";
// ─────────────────────────────────────────────────────────────────────────

const SCAN_PAIRS  = ["EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD","USDCHF","NZDUSD"]; // XAUUSD excluded — not traded
const TIMEFRAMES  = ["M1","M5","M15","M30","H1","H4","D1"];

const C = {
  bg:"#080c14",panel:"#0d1320",card:"#111827",border:"#1a2438",
  accent:"#f59e0b",buy:"#10b981",sell:"#ef4444",muted:"#4b5563",
  dim:"#6b7280",text:"#e2e8f0",csr:"#8b5cf6", // purple for Bot 3
  csr2:"#06b6d4", // cyan for Bot 4 (CSR100 v2)
  mono:"'JetBrains Mono','Fira Code','Courier New',monospace",
  sans:"'Inter',system-ui,sans-serif",
};

const fmt    = (n,d=5)=>(n==null||isNaN(Number(n)))?"—":Number(n).toFixed(d);
const fmtPnl = (n)=>{const v=Number(n);return(v>=0?"+":"")+v.toFixed(2);};
const sigCol = (s)=>{
  if(!s)return C.muted;
  if(s.includes("STRONG BUY"))return C.buy;
  if(s.includes("BUY"))return "#34d399";
  if(s.includes("STRONG SELL"))return C.sell;
  if(s.includes("SELL"))return "#f87171";
  if(s.includes("CSR"))return C.csr;
  return C.muted;
};

function Spark({data=[],color=C.accent,w=110,h=34}){
  if(data.length<2)return <svg width={w} height={h}/>;
  const vals=data.map(Number);
  const lo=Math.min(...vals),hi=Math.max(...vals),rng=hi-lo||1;
  const pts=vals.map((v,i)=>`${(i/(vals.length-1))*w},${h-((v-lo)/rng)*(h-2)-1}`).join(" ");
  return(<svg width={w} height={h}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/></svg>);
}

function Pill({label}){
  const c=sigCol(label);
  return(<span style={{fontFamily:C.mono,fontSize:10,fontWeight:700,background:c+"1a",color:c,border:`1px solid ${c}40`,padding:"2px 7px",borderRadius:3,letterSpacing:0.8,whiteSpace:"nowrap"}}>{label||"NEUTRAL"}</span>);
}

// ── Bot Panel (reusable) ──────────────────────────────────────────────────
function BotPanel({botId,botName,botColor,account,positions,history,autoLog,autoMode,onToggleAuto,botMode,onBotMode,orderForm,setOrderForm,symbol,onPlaceOrder,onClosePos,loading,isBot2,isBot3,isBot4,liveSignal,lastTrade}){
  const totalPnl=positions.reduce((s,p)=>s+(p.profit||0),0);
  const histPnl=history.reduce((s,h)=>s+(h.profit||0),0);
  const [tab,setTab]=useState("positions");

  const modeOptions = isBot3
    ? [["snrA","Mode A (H4+M15)"],["snrB","Mode B (D1+H1)"]]
    : isBot4
    ? [["retest2","Min 2nd Retest"],["retest3","Min 3rd Retest"]]
    : []; // Bot 1 (Standard) and Bot 2 (Price Break Through) no longer use a mode toggle

  return(
    <div style={{display:"flex",flexDirection:"column",background:C.panel,borderLeft:`1px solid ${C.border}`,height:"100%",overflow:"hidden"}}>
      {/* Bot Header */}
      <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,background:C.card,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:22,height:22,borderRadius:5,background:botColor||C.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900,color:"#000"}}>{botId}</div>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:C.text}}>{botName}</div>
            <div style={{fontSize:10,color:C.muted,fontFamily:C.mono}}>{account?`#${account.login}`:"Connecting..."}</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:10,color:autoMode?botColor||C.accent:C.muted,fontWeight:600}}>{autoMode?"AUTO ON":"AUTO OFF"}</span>
          <div onClick={onToggleAuto} style={{width:36,height:19,borderRadius:10,cursor:"pointer",background:autoMode?botColor||C.accent:C.border,position:"relative",transition:"background .2s"}}>
            <div style={{position:"absolute",top:2,left:autoMode?19:2,width:15,height:15,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
          </div>
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column"}}>
        {/* Account Stats */}
        {account?(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:1,borderBottom:`1px solid ${C.border}`,background:C.border}}>
            {[["Balance",`$${Number(account.balance).toFixed(2)}`],["Equity",`$${Number(account.equity).toFixed(2)}`],["P&L",fmtPnl(account.profit),account.profit>=0?C.buy:C.sell],["Free Margin",`$${Number(account.free_margin).toFixed(2)}`]].map(([l,v,col])=>(
              <div key={l} style={{background:C.card,padding:"8px 12px"}}>
                <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:2}}>{l}</div>
                <div style={{fontFamily:C.mono,fontSize:13,fontWeight:700,color:col||C.text}}>{v}</div>
              </div>
            ))}
          </div>
        ):(
          <div style={{padding:"12px 14px",borderBottom:`1px solid ${C.border}`}}>
            <div style={{fontSize:11,color:C.muted}}>⏳ Connecting to MT5...</div>
          </div>
        )}

        {/* Bot Mode */}
        {modeOptions.length>0&&(
          <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",gap:6}}>
            {modeOptions.map(([k,l])=>(
              <button key={k} onClick={()=>onBotMode(k)} style={{flex:1,fontFamily:C.sans,fontSize:10,fontWeight:600,padding:"4px 0",borderRadius:4,cursor:"pointer",background:botMode===k?botColor||C.accent:C.card,color:botMode===k?"#000":C.dim,border:`1px solid ${botMode===k?botColor||C.accent:C.border}`}}>{l}</button>
            ))}
          </div>
        )}

        {/* Bot 3 Info Banner */}
        {isBot3&&(
          <div style={{padding:"8px 14px",borderBottom:`1px solid ${C.border}`,background:C.csr+"11",border:`1px solid ${C.csr}33`}}>
            <div style={{fontSize:10,color:C.csr,fontWeight:700,marginBottom:3}}>⚡ SNR Advance Strategy</div>
            <div style={{fontSize:9,color:C.muted}}>Magic: 33333 · Account 2 · Engulfing CRS @ SNR Zone</div>
            <div style={{fontSize:9,color:C.muted,marginTop:2}}>Mode A: H4 trend + M15 entry · Mode B: Daily + H1</div>
          </div>
        )}

        {/* Bot 4 Info Banner */}
        {isBot4&&(
          <div style={{padding:"8px 14px",borderBottom:`1px solid ${C.border}`,background:C.csr2+"11",border:`1px solid ${C.csr2}33`}}>
            <div style={{fontSize:10,color:C.csr2,fontWeight:700,marginBottom:3}}>🎯 TEKNIK CSR100 v2</div>
            <div style={{fontSize:9,color:C.muted}}>Magic: 44444 · Account 3 · Pure Price Action — NO indicators</div>
            <div style={{fontSize:9,color:C.muted,marginTop:2}}>SBR/RBS zone + retest counting · Trade-with-trend only</div>
            {liveSignal&&(
              <div style={{marginTop:6,paddingTop:6,borderTop:`1px solid ${C.csr2}33`,display:"flex",flexDirection:"column",gap:3}}>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:9,color:C.muted}}>Trend</span>
                  <span style={{fontSize:9,fontFamily:C.mono,fontWeight:700,color:C.text}}>{liveSignal.trend||"—"}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:9,color:C.muted}}>Zone Role</span>
                  <span style={{fontSize:9,fontFamily:C.mono,fontWeight:700,color:C.text}}>{liveSignal.zone?.role||"—"}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:9,color:C.muted}}>Retest Count</span>
                  <span style={{fontSize:9,fontFamily:C.mono,fontWeight:700,color:(liveSignal.retest_count||0)>=2?C.buy:C.dim}}>{liveSignal.retest_count??"—"}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:9,color:C.muted}}>Valid Setup</span>
                  <span style={{fontSize:9,fontFamily:C.mono,fontWeight:700,color:liveSignal.valid_setup?C.buy:C.dim}}>{liveSignal.valid_setup?"YES":"NO"}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Manual Order */}
        <div style={{padding:"12px 14px",borderBottom:`1px solid ${C.border}`}}>
          <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Place Order — {symbol}</div>
          <div style={{marginBottom:8}}>
            <div style={{fontSize:9,color:C.muted,marginBottom:4,textTransform:"uppercase",letterSpacing:1}}>Lot Size</div>
            <div style={{display:"flex",gap:3}}>
              {[0.01,0.05,0.1,0.5].map(v=>(
                <button key={v} onClick={()=>setOrderForm(p=>({...p,lot:v}))} style={{flex:1,fontFamily:C.mono,fontSize:10,background:orderForm.lot===v?botColor||C.accent:C.card,color:orderForm.lot===v?"#000":C.dim,border:`1px solid ${orderForm.lot===v?botColor||C.accent:C.border}`,borderRadius:3,padding:"4px 0",cursor:"pointer",fontWeight:700}}>{v}</button>
              ))}
            </div>
          </div>
          {[["sl","Stop Loss (pips)",[20,50,100]],["tp","Take Profit (pips)",[50,100,200]]].map(([key,lbl,opts])=>(
            <div key={key} style={{marginBottom:8}}>
              <div style={{fontSize:9,color:C.muted,marginBottom:4,textTransform:"uppercase",letterSpacing:1}}>{lbl}</div>
              <div style={{display:"flex",gap:3}}>
                {opts.map(v=>(
                  <button key={v} onClick={()=>setOrderForm(p=>({...p,[key]:v}))} style={{flex:1,fontFamily:C.mono,fontSize:10,background:orderForm[key]===v?(key==="sl"?C.sell:C.buy)+"33":C.card,color:orderForm[key]===v?(key==="sl"?C.sell:C.buy):C.dim,border:`1px solid ${orderForm[key]===v?(key==="sl"?C.sell:C.buy):C.border}`,borderRadius:3,padding:"4px 0",cursor:"pointer",fontWeight:700}}>{v}</button>
                ))}
                <input type="number" value={orderForm[key]} onChange={e=>setOrderForm(p=>({...p,[key]:parseInt(e.target.value)||0}))} style={{width:44,fontFamily:C.mono,fontSize:10,background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:3,padding:"4px 5px",textAlign:"center"}}/>
              </div>
            </div>
          ))}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginTop:10}}>
            <button onClick={()=>onPlaceOrder("buy",botId)} disabled={loading} style={{fontFamily:C.sans,fontSize:12,fontWeight:700,padding:"10px 0",background:loading?C.border:C.buy,color:loading?C.muted:"#fff",border:"none",borderRadius:5,cursor:loading?"not-allowed":"pointer"}}>▲ BUY</button>
            <button onClick={()=>onPlaceOrder("sell",botId)} disabled={loading} style={{fontFamily:C.sans,fontSize:12,fontWeight:700,padding:"10px 0",background:loading?C.border:C.sell,color:loading?C.muted:"#fff",border:"none",borderRadius:5,cursor:loading?"not-allowed":"pointer"}}>▼ SELL</button>
          </div>
        </div>

        {/* Positions / History */}
        <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`}}>
          <div style={{display:"flex",gap:4,marginBottom:10,alignItems:"center"}}>
            {["positions","history"].map(t=>(
              <button key={t} onClick={()=>setTab(t)} style={{fontFamily:C.sans,fontSize:10,fontWeight:600,padding:"3px 10px",borderRadius:4,cursor:"pointer",background:tab===t?botColor||C.accent:"transparent",color:tab===t?"#000":C.dim,border:`1px solid ${tab===t?botColor||C.accent:C.border}`,textTransform:"capitalize"}}>
                {t==="positions"?`Positions (${positions.length})`:"History"}
              </button>
            ))}
            {tab==="positions"&&totalPnl!==0&&(
              <span style={{marginLeft:"auto",fontFamily:C.mono,fontSize:11,fontWeight:700,color:totalPnl>=0?C.buy:C.sell}}>{fmtPnl(totalPnl)}</span>
            )}
          </div>

          {tab==="positions"?(
            positions.length===0?(
              <div style={{fontSize:11,color:C.muted,textAlign:"center",padding:"10px 0"}}>No open positions</div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {positions.map(p=>(
                  <div key={p.ticket} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:5,padding:"8px 10px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{display:"flex",flexDirection:"column",gap:2}}>
                      <div style={{display:"flex",gap:6,alignItems:"center"}}>
                        <span style={{fontFamily:C.mono,fontSize:12,fontWeight:700}}>{p.symbol}</span>
                        <span style={{fontFamily:C.mono,fontSize:10,fontWeight:700,color:p.type==="BUY"?C.buy:C.sell}}>{p.type}</span>
                        <span style={{fontFamily:C.mono,fontSize:10,color:C.muted}}>{p.lot}L</span>
                      </div>
                      <div style={{fontSize:10,color:C.muted,fontFamily:C.mono}}>#{p.ticket} · {fmt(p.open_price)}</div>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                      <span style={{fontFamily:C.mono,fontSize:12,fontWeight:700,color:p.profit>=0?C.buy:C.sell}}>{fmtPnl(p.profit)}</span>
                      <button onClick={()=>onClosePos(p.ticket,botId)} style={{fontFamily:C.sans,fontSize:9,fontWeight:700,background:C.sell+"22",color:C.sell,border:`1px solid ${C.sell}44`,borderRadius:3,padding:"2px 8px",cursor:"pointer"}}>CLOSE</button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ):(
            history.length===0?(
              <div style={{fontSize:11,color:C.muted,textAlign:"center",padding:"10px 0"}}>No recent trades</div>
            ):(
              <div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.muted,marginBottom:6}}>
                  <span>{history.length} trades (14d)</span>
                  <span style={{fontFamily:C.mono,color:histPnl>=0?C.buy:C.sell,fontWeight:700}}>{fmtPnl(histPnl)}</span>
                </div>
                {history.slice(0,15).map((h,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",borderTop:`1px solid ${C.border}`,fontSize:10}}>
                    <div style={{display:"flex",gap:8,fontFamily:C.mono}}>
                      <span style={{fontWeight:700}}>{h.symbol}</span>
                      <span style={{color:h.type==="BUY"?C.buy:C.sell,fontWeight:700}}>{h.type}</span>
                      <span style={{color:C.muted}}>{h.lot}L</span>
                    </div>
                    <span style={{fontFamily:C.mono,fontWeight:700,color:h.profit>=0?C.buy:C.sell}}>{fmtPnl(h.profit)}</span>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Auto Log — sourced from backend /auto-status, reflects the
            server-side auto_trader.py engine regardless of this tab's
            connection state */}
        {autoMode&&(
          <div style={{padding:"10px 14px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6}}>
              <span style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:1}}>Auto Log (backend)</span>
              {lastTrade&&<span style={{fontSize:8,color:C.dim,fontFamily:C.mono}}>last trade: {lastTrade}</span>}
            </div>
            <div style={{background:C.bg,borderRadius:4,padding:6,border:`1px solid ${C.border}`,maxHeight:110,overflowY:"auto"}}>
              {autoLog.length===0?(
                <div style={{fontFamily:C.mono,fontSize:9,color:C.muted}}>Waiting for scan...</div>
              ):autoLog.map((log,i)=>(
                <div key={i} style={{fontFamily:C.mono,fontSize:9,color:C.dim,padding:"1px 0",borderBottom:i<autoLog.length-1?`1px solid ${C.border}`:"none"}}>{log}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── MAIN DASHBOARD ────────────────────────────────────────────────────────
export default function TradingDashboard(){
  const [symbol,setSymbol]=useState("EURUSD");
  const [timeframe,setTF]=useState("H1");
  const [scan,setScan]=useState([]);
  const [analysis,setAnalysis]=useState(null);
  const [candles,setCandles]=useState([]);
  const [orderForm,setOrderForm]=useState({lot:0.01,sl:20,tp:50});
  const [toast,setToast]=useState(null);
  const [loadOrder,setLoadOrder]=useState(false);
  const [loadScan,setLoadScan]=useState(false);
  const [dailyPnl,setDailyPnl]=useState([]);
  const [showDailyPnl,setShowDailyPnl]=useState(false);

  // Per-bot state
  const [acc1,setAcc1]=useState(null); // Bot 1
  const [acc2,setAcc2]=useState(null); // Bot 2 — now its own dedicated account (345599137)
  const [acc3,setAcc3]=useState(null); // Bot 3 — account 2 in backend (168865742), no longer shared with Bot 2
  const [acc4,setAcc4]=useState(null); // Bot 4 — account 3 in backend (1301627547)
  const [pos1,setPos1]=useState([]);
  const [pos2,setPos2]=useState([]);
  const [pos3,setPos3]=useState([]); // Bot 3 shares account 2 positions filtered by magic
  const [pos4,setPos4]=useState([]); // Bot 4 — own account, no magic filter needed
  const [hist1,setHist1]=useState([]);
  const [hist2,setHist2]=useState([]);
  const [hist3,setHist3]=useState([]);
  const [hist4,setHist4]=useState([]);

  // Auto-trade toggle state — these now just mirror the backend's
  // auto_trader.py BOT_ENABLED flags. Actual trade execution happens
  // server-side via the asyncio background loop, NOT in this browser.
  const [auto1,setAuto1]=useState(true);
  const [auto2,setAuto2]=useState(true);
  const [auto3,setAuto3]=useState(true);
  const [auto4,setAuto4]=useState(true);

  const [bot1Mode,setBot1Mode]=useState("bot1");
  const [bot2Mode,setBot2Mode]=useState("bot2");
  const [bot3Mode,setBot3Mode]=useState("snrA");
  const [bot4Mode,setBot4Mode]=useState("retest2");
  const [bot4Signal,setBot4Signal]=useState(null); // live signal info for Bot 4 banner

  // Auto-status pulled from backend (replaces local log1..4 state + the
  // old browser-side setInterval loops entirely)
  const [autoStatus,setAutoStatus]=useState({});

  const showToast=(msg,type="ok")=>{setToast({msg,type});setTimeout(()=>setToast(null),3500);};

  const fetchAcc=useCallback(async()=>{
    try{
      const[r1,r2,r3,r4]=await Promise.all([fetch(`${API}/account?acc=1`),fetch(`${API}/account?acc=2`),fetch(`${API}/account?acc=3`),fetch(`${API}/account?acc=4`)]);
      if(r1.ok)setAcc1(await r1.json());
      if(r2.ok)setAcc3(await r2.json()); // ACCOUNTS[2] in backend = Bot 3's account
      if(r3.ok)setAcc4(await r3.json()); // ACCOUNTS[3] in backend = Bot 4's account
      if(r4.ok)setAcc2(await r4.json()); // ACCOUNTS[4] in backend = Bot 2's NEW dedicated account
    }catch{}
  },[]);

  const fetchPos=useCallback(async()=>{
    try{
      const[r1,r2,r3,r4]=await Promise.all([
        fetch(`${API}/positions?account=1`),  // Bot 1
        fetch(`${API}/positions?account=2`),  // Bot 3 (no longer shared with Bot 2)
        fetch(`${API}/positions?account=3`),  // Bot 4
        fetch(`${API}/positions?account=4`),  // Bot 2's new dedicated account
      ]);
      if(r1.ok)setPos1(await r1.json());
      if(r2.ok)setPos3(await r2.json()); // Bot 3 has the account to itself now, no magic filter needed
      if(r3.ok)setPos4(await r3.json());
      if(r4.ok)setPos2(await r4.json()); // Bot 2 has its own account now too
    }catch{}
  },[]);

  const fetchHist=useCallback(async()=>{
    try{
      const[r1,r2,r3,r4]=await Promise.all([
        fetch(`${API}/history?days=14&account=1`),
        fetch(`${API}/history?days=14&account=2`),
        fetch(`${API}/history?days=14&account=3`),
        fetch(`${API}/history?days=14&account=4`),
      ]);
      if(r1.ok)setHist1(await r1.json());
      if(r2.ok)setHist3(await r2.json());
      if(r3.ok)setHist4(await r3.json());
      if(r4.ok)setHist2(await r4.json());
    }catch{}
  },[]);

  const fetchScan=useCallback(async()=>{
    setLoadScan(true);
    try{const r=await fetch(`${API}/scan?timeframe=${timeframe}`);if(r.ok)setScan(await r.json());}catch{}
    setLoadScan(false);
  },[timeframe]);

  const fetchAnalysis=useCallback(async(sym=symbol,tf=timeframe)=>{
    try{
      const[ar,cr]=await Promise.all([fetch(`${API}/analyze/${sym}?timeframe=${tf}`),fetch(`${API}/candles/${sym}?timeframe=${tf}&count=60`)]);
      if(ar.ok)setAnalysis(await ar.json());
      if(cr.ok)setCandles(await cr.json());
    }catch{}
  },[symbol,timeframe]);

  // Fetch Bot 4 live signal for the currently selected symbol (for the info banner)
  const fetchBot4Signal=useCallback(async(sym=symbol,tf=timeframe,mode=bot4Mode)=>{
    const minRetest=mode==="retest3"?3:2;
    try{
      const r=await fetch(`${API}/analyze-csr100v2/${sym}?tf=${tf}&min_retest=${minRetest}`);
      if(r.ok)setBot4Signal(await r.json());
    }catch{}
  },[symbol,timeframe,bot4Mode]);

  // Fetch backend auto-trade status — enabled flags, last-trade time, and
  // recent log per bot. This is what now powers the "Auto Log" panel and
  // keeps the toggle switches in sync with the actual server-side state
  // (e.g. if you toggled a bot from another device/tab).
  const fetchAutoStatus=useCallback(async()=>{
    try{
      const r=await fetch(`${API}/auto-status`);
      if(r.ok){
        const data=await r.json();
        setAutoStatus(data);
        if(data[1])setAuto1(data[1].enabled);
        if(data[2])setAuto2(data[2].enabled);
        if(data[3])setAuto3(data[3].enabled);
        if(data[4])setAuto4(data[4].enabled);
      }
    }catch{}
  },[]);

  // Toggle a bot's auto-trade on the backend. Optimistic UI update with
  // revert-on-failure so the switch never lies about actual server state.
  const toggleBotAuto=async(botId,currentState,setter)=>{
    const newState=!currentState;
    setter(newState);
    try{
      const r=await fetch(`${API}/auto-toggle`,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({bot_id:botId,enabled:newState})});
      if(!r.ok)throw new Error("toggle failed");
      showToast(`Bot${botId} auto-trade ${newState?"ENABLED":"DISABLED"}`);
    }catch(e){
      setter(currentState); // revert optimistic update
      showToast(`Toggle failed: ${e.message}`,"err");
    }
  };

  // NOTE: Auto-trade execution no longer happens in this browser.
  // The old 4x useEffect(setInterval(...)) blocks that scanned pairs and
  // called /order directly have been removed — that logic now runs
  // server-side in auto_trader.py as an asyncio background task inside
  // the FastAPI process, so trades execute 24/7 regardless of whether
  // this dashboard tab is open. This component is now pure monitoring +
  // manual override (toggle on/off, manual BUY/SELL/CLOSE).

  useEffect(()=>{
    fetchAcc();fetchPos();fetchHist();fetchScan();fetchAnalysis();fetchBot4Signal();fetchAutoStatus();
    const t=setInterval(()=>{fetchAcc();fetchPos();fetchAutoStatus();},10000);
    const s=setInterval(()=>{fetchScan();},60000);
    const b4=setInterval(()=>{fetchBot4Signal();},30000);
    return()=>{clearInterval(t);clearInterval(s);clearInterval(b4);};
  },[]);

  useEffect(()=>{fetchAnalysis();fetchBot4Signal();},[symbol,timeframe]);
  useEffect(()=>{fetchScan();},[timeframe]);
  useEffect(()=>{fetchBot4Signal();},[bot4Mode]);

  const placeOrder=async(action,botId)=>{
    setLoadOrder(true);
    const accountId=botId===1?1:botId===2?4:botId===4?3:2; // Bot1->1, Bot2->4(new), Bot3->2, Bot4->3
    const magic=botId===1?11111:botId===2?22222:botId===4?44444:33333;
    try{
      const r=await fetch(`${API}/order`,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({symbol,action,lot:orderForm.lot,sl_pips:orderForm.sl,tp_pips:orderForm.tp,comment:`Manual-Bot${botId}`,account:accountId,magic})});
      const d=await r.json();
      if(d.ticket){showToast(`✅ Bot${botId}: ${action.toUpperCase()} ${symbol} @ ${d.price} #${d.ticket}`);fetchPos();fetchHist();}
      else showToast(d.detail||"Order failed","err");
    }catch(e){showToast("Error: "+e.message,"err");}
    setLoadOrder(false);
  };

  const closePos=async(ticket,botId)=>{
    const accountId=botId===1?1:botId===2?4:botId===4?3:2; // same mapping as placeOrder
    try{
      const r=await fetch(`${API}/close`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ticket,account:accountId})});
      const d=await r.json();
      if(d.status==="closed"){showToast(`✅ Closed #${ticket}`);fetchPos();fetchHist();}
    }catch{showToast("Close failed","err");}
  };

  const sig=analysis?.signal;
  const ind=analysis?.indicators;
  const prices=Array.isArray(candles)?candles.map(c=>c.close):[];
  const connected=acc1!==null;
  const allPos=[...pos1,...pos2,...pos3,...pos4];
  const allHist=[...hist1,...hist2,...hist3,...hist4];

  // Performance stats per strategy
  const calcPerf=(hist)=>{
    if(!hist.length)return{wins:0,losses:0,winRate:0,pnl:0,trades:0,best:0,worst:0,avgPips:0};
    const wins=hist.filter(h=>h.profit>0).length;
    const losses=hist.filter(h=>h.profit<=0).length;
    const pnl=hist.reduce((s,h)=>s+(h.profit||0),0);
    const best=Math.max(...hist.map(h=>h.profit||0));
    const worst=Math.min(...hist.map(h=>h.profit||0));
    const winRate=hist.length>0?Math.round(wins/hist.length*100):0;
    return{wins,losses,winRate,pnl:parseFloat(pnl.toFixed(2)),trades:hist.length,best:parseFloat(best.toFixed(2)),worst:parseFloat(worst.toFixed(2))};
  };
  const perf1=calcPerf(hist1);
  const perf2=calcPerf(hist2);
  const perf3=calcPerf(hist3);
  const perf4=calcPerf(hist4);

  // Daily P&L snapshot — save to localStorage every time history updates.
  //
  // BUGFIX (20 Jun 2026): h.time from mt5_service.py's get_history_with_creds()
  // is a "YYYY-MM-DD HH:MM:SS" STRING (via to_my_time()), not a Unix timestamp.
  // The old code did `h.close_time*1000 || h.time*1000 || Date.now()` — but
  // close_time doesn't exist on this object at all, and a string times 1000
  // evaluates to NaN in JS, which is falsy — so BOTH terms failed silently
  // and every single trade fell through to Date.now(), meaning "today's P&L"
  // was silently computed as the FULL 14-day history total, every day. That's
  // why two different days showed the exact same P&L figure. Fix: parse the
  // "YYYY-MM-DD HH:MM:SS" string directly (replace the space with "T" so the
  // JS Date constructor parses it reliably across browsers).
  const parseHistTime = (timeStr) => {
    if(!timeStr) return new Date(); // last-resort fallback, but should rarely hit
    const iso = timeStr.includes("T") ? timeStr : timeStr.replace(" ", "T");
    const d = new Date(iso);
    return isNaN(d.getTime()) ? new Date() : d;
  };

  useEffect(()=>{
    if(!allHist.length)return;
    const today=new Date().toLocaleDateString("en-MY",{day:"2-digit",month:"short",year:"numeric"});
    const todayPnl=allHist
      .filter(h=>{
        const d=parseHistTime(h.time);
        return d.toLocaleDateString("en-MY",{day:"2-digit",month:"short",year:"numeric"})===today;
      })
      .reduce((s,h)=>s+(h.profit||0),0);

    const stored=JSON.parse(localStorage.getItem("xm_daily_pnl")||"[]");
    const exists=stored.findIndex(x=>x.date===today);
    if(exists>=0){stored[exists].pnl=parseFloat(todayPnl.toFixed(2));}
    else{stored.unshift({date:today,pnl:parseFloat(todayPnl.toFixed(2))});}
    const trimmed=stored.slice(0,30); // keep 30 days
    localStorage.setItem("xm_daily_pnl",JSON.stringify(trimmed));
    setDailyPnl(trimmed);
  },[allHist]);

  // Load daily PnL from localStorage on mount
  useEffect(()=>{
    const stored=JSON.parse(localStorage.getItem("xm_daily_pnl")||"[]");
    setDailyPnl(stored);
  },[]);

  // Reset the Daily P&L Tracker — clears the localStorage cache only.
  // This does NOT touch real MT5 trade history/balance; it just clears
  // the tracker's own running display so it rebuilds fresh going forward.
  const resetDailyPnl=()=>{
    if(!window.confirm("Reset Daily P&L Tracker? This clears the tracker display only — it won't affect your actual MT5 account balance or trade history."))return;
    localStorage.removeItem("xm_daily_pnl");
    setDailyPnl([]);
    showToast("Daily P&L Tracker reset");
  };

  // Recalculate the Daily P&L Tracker from REAL MT5 history, fixing any
  // past entries that were corrupted by the close_time/Date.now() bug
  // (every trade was mis-dated as "today", so every day showed the same
  // full-history total instead of that day's actual P&L). This re-fetches
  // 30 days of history across all 4 bot accounts, groups it by the
  // correct date using parseHistTime(), and overwrites localStorage with
  // the accurate per-day figures.
  const [recalculating,setRecalculating]=useState(false);
  const recalculateDailyPnl=async()=>{
    if(!window.confirm("Recalculate Daily P&L from real MT5 history? This will replace the existing daily figures with correct ones (fixes the bug where every day showed the same total)."))return;
    setRecalculating(true);
    try{
      const[r1,r2,r3,r4]=await Promise.all([
        fetch(`${API}/history?days=30&account=1`),
        fetch(`${API}/history?days=30&account=2`),
        fetch(`${API}/history?days=30&account=3`),
        fetch(`${API}/history?days=30&account=4`),
      ]);
      const h1=r1.ok?await r1.json():[];
      const h2all=r2.ok?await r2.json():[];
      const h3=r3.ok?await r3.json():[];
      const h4=r4.ok?await r4.json():[];
      const allRealHist=[...h1,...h2all,...h3,...h4];

      if(!allRealHist.length){
        showToast("No history found to recalculate from","err");
        setRecalculating(false);
        return;
      }

      const byDay={};
      allRealHist.forEach(h=>{
        const d=parseHistTime(h.time);
        const key=d.toLocaleDateString("en-MY",{day:"2-digit",month:"short",year:"numeric"});
        byDay[key]=(byDay[key]||0)+(h.profit||0);
      });

      const rebuilt=Object.entries(byDay)
        .map(([date,pnl])=>({date,pnl:parseFloat(pnl.toFixed(2))}))
        .sort((a,b)=>new Date(b.date)-new Date(a.date)) // newest first
        .slice(0,30);

      localStorage.setItem("xm_daily_pnl",JSON.stringify(rebuilt));
      setDailyPnl(rebuilt);
      showToast(`Recalculated ${rebuilt.length} day(s) from real history`);
    }catch(e){
      showToast("Recalculate failed: "+e.message,"err");
    }
    setRecalculating(false);
  };

  const [activeBot,setActiveBot]=useState(1);

  const botConfigs=[
    {id:1,name:"Bot 1",color:C.accent,account:acc1,positions:pos1,history:hist1,auto:auto1,setAuto:setAuto1,mode:bot1Mode,setMode:setBot1Mode},
    {id:2,name:"Bot 2 — Price Break Through",color:"#6366f1",account:acc2,positions:pos2,history:hist2,auto:auto2,setAuto:setAuto2,mode:bot2Mode,setMode:setBot2Mode,isBot2:true},
    {id:3,name:"Bot 3",color:C.csr,account:acc3,positions:pos3,history:hist3,auto:auto3,setAuto:setAuto3,mode:bot3Mode,setMode:setBot3Mode,isBot3:true},
    {id:4,name:"Bot 4",color:C.csr2,account:acc4,positions:pos4,history:hist4,auto:auto4,setAuto:setAuto4,mode:bot4Mode,setMode:setBot4Mode,isBot4:true,liveSignal:bot4Signal},
  ];
  const activeCfg=botConfigs.find(b=>b.id===activeBot)||botConfigs[0];

  return(
    <div style={{fontFamily:C.sans,background:C.bg,minHeight:"100vh",color:C.text,margin:0,display:"flex",flexDirection:"column"}}>
      {/* Topbar */}
      <div style={{background:C.panel,borderBottom:`1px solid ${C.border}`,padding:"0 20px",display:"flex",alignItems:"center",justifyContent:"space-between",height:48,flexShrink:0,position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:26,height:26,borderRadius:5,background:C.accent,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:13,color:"#000"}}>X</div>
          <span style={{fontWeight:700,fontSize:14,letterSpacing:0.3}}>XM Trading</span>
          <span style={{fontSize:10,color:C.muted,background:C.card,border:`1px solid ${C.border}`,padding:"2px 8px",borderRadius:3}}>Quad Bot v4 · Backend Auto-Trade</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:connected?C.buy:C.sell,boxShadow:connected?`0 0 6px ${C.buy}`:"none"}}/>
          <span style={{fontSize:11,color:connected?C.buy:C.sell,fontFamily:C.mono}}>{connected?"CONNECTED":"OFFLINE"}</span>
        </div>
        <div style={{display:"flex",gap:3}}>
          {["M15","M30","H1","H4","D1"].map(tf=>(
            <button key={tf} onClick={()=>setTF(tf)} style={{fontFamily:C.mono,fontSize:10,padding:"3px 8px",background:timeframe===tf?C.accent:"transparent",color:timeframe===tf?"#000":C.muted,border:`1px solid ${timeframe===tf?C.accent:C.border}`,borderRadius:3,cursor:"pointer",fontWeight:700}}>{tf}</button>
          ))}
        </div>
      </div>

      {/* Scanner Bar — horizontal */}
      <div style={{background:C.panel,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",overflowX:"auto",flexShrink:0,padding:"0 10px",gap:4,height:64}}>
        <span style={{fontSize:9,fontWeight:600,color:loadScan?C.accent:C.muted,textTransform:"uppercase",letterSpacing:1.5,whiteSpace:"nowrap",marginRight:4,paddingRight:8,borderRight:`1px solid ${C.border}`}}>
          {loadScan?"SCANNING...":"SCANNER"}
        </span>
        {scan.map(row=>(
          <div key={row.symbol} onClick={()=>{setSymbol(row.symbol);fetchAnalysis(row.symbol,timeframe);fetchBot4Signal(row.symbol,timeframe);}}
            style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:2,padding:"5px 10px",cursor:"pointer",borderRadius:5,border:`1px solid ${symbol===row.symbol?C.accent:C.border}`,background:symbol===row.symbol?C.card:C.bg,minWidth:105,flexShrink:0,transition:"all .1s"}}>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <span style={{fontFamily:C.mono,fontSize:11,fontWeight:700,color:symbol===row.symbol?C.accent:C.text}}>{row.symbol}</span>
              <Pill label={row.signal}/>
            </div>
            <div style={{display:"flex",gap:8}}>
              <span style={{fontFamily:C.mono,fontSize:9,color:C.muted}}>{fmt(row.bid,row.symbol.includes("JPY")?2:5)}</span>
              <span style={{fontSize:9,color:sigCol(row.signal),fontWeight:700}}>{row.confidence}%</span>
            </div>
          </div>
        ))}
        {!scan.length&&!loadScan&&<span style={{fontSize:11,color:C.muted,padding:"0 12px"}}>No data</span>}
      </div>

      {/* Main: Center + Bot Tab Panel */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 320px",flex:1,overflow:"hidden"}}>

        {/* Center: Chart + Analysis + Stats */}
        <div style={{overflowY:"auto",padding:14,display:"flex",flexDirection:"column",gap:10}}>
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            <select value={symbol} onChange={e=>{setSymbol(e.target.value);fetchAnalysis(e.target.value,timeframe);fetchBot4Signal(e.target.value,timeframe);}}
              style={{fontFamily:C.mono,fontSize:13,fontWeight:700,background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:5,padding:"5px 10px",cursor:"pointer"}}>
              {SCAN_PAIRS.map(p=><option key={p}>{p}</option>)}
            </select>
            <div style={{display:"flex",gap:3}}>
              {TIMEFRAMES.map(tf=>(
                <button key={tf} onClick={()=>{setTF(tf);fetchAnalysis(symbol,tf);fetchBot4Signal(symbol,tf);}} style={{fontFamily:C.mono,fontSize:10,padding:"4px 8px",background:timeframe===tf?C.accent:C.card,color:timeframe===tf?"#000":C.dim,border:`1px solid ${timeframe===tf?C.accent:C.border}`,borderRadius:4,cursor:"pointer",fontWeight:700}}>{tf}</button>
              ))}
            </div>
          </div>

          {/* Price Hero */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <div style={{display:"flex",alignItems:"baseline",gap:10,marginBottom:8}}>
                  <span style={{fontFamily:C.mono,fontSize:28,fontWeight:900,letterSpacing:-1}}>
                    {analysis?.tick?.bid!=null?fmt(analysis.tick.bid,symbol.includes("JPY")||symbol==="XAUUSD"?2:5):"—"}
                  </span>
                  <span style={{fontFamily:C.mono,fontSize:12,color:C.muted}}>
                    Ask: {analysis?.tick?.ask!=null?fmt(analysis.tick.ask,symbol.includes("JPY")||symbol==="XAUUSD"?2:5):"—"}
                  </span>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <Pill label={sig?.direction}/>
                  {sig?.confidence!=null&&<span style={{fontSize:11,color:C.muted}}>Confidence: <span style={{color:C.text,fontWeight:700}}>{sig.confidence}%</span></span>}
                  {sig?.score!=null&&<span style={{fontSize:11,color:C.muted}}>Score: <span style={{fontFamily:C.mono,color:C.accent}}>{sig.score>0?"+":""}{sig.score}</span></span>}
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <Spark data={prices} color={sigCol(sig?.direction)} w={130} h={40}/>
                <div style={{fontSize:9,color:C.muted,marginTop:2}}>Last {prices.length} candles</div>
              </div>
            </div>
          </div>

          {/* Indicators */}
          {ind&&(
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:14}}>
              <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1.5,marginBottom:12,fontWeight:600}}>Indicators</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14}}>
                {[["RSI (14)",ind.rsi,ind.rsi<30?C.buy:ind.rsi>70?C.sell:C.text,1],["MACD",ind.macd,ind.macd>0?C.buy:C.sell,4],["MACD Sig",ind.macd_signal,null,4],["MACD Hist",ind.macd_hist,ind.macd_hist>0?C.buy:C.sell,4],["EMA 20",ind.ema20,null,5],["EMA 50",ind.ema50,null,5],["EMA 200",ind.ema200,null,5],["ATR",ind.atr,null,5]].map(([lbl,val,col,dec])=>(
                  <div key={lbl}>
                    <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>{lbl}</div>
                    <div style={{fontFamily:C.mono,fontSize:13,fontWeight:700,color:col||C.text}}>{fmt(val,dec)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Signal Breakdown */}
          {sig?.reasons?.length>0&&(
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:14}}>
              <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1.5,marginBottom:10,fontWeight:600}}>Signal Breakdown</div>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {sig.reasons.map((r,i)=>(
                  <div key={i} style={{fontFamily:C.mono,fontSize:11,color:C.text,padding:"5px 10px",background:C.panel,borderRadius:4,borderLeft:`3px solid ${sigCol(sig.direction)}`}}>{r}</div>
                ))}
              </div>
            </div>
          )}

          {/* Combined Stats */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:14}}>
            <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1.5,marginBottom:12,fontWeight:600}}>Combined — All 4 Bots</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:14}}>
              {[["Total Positions",allPos.length],["Float P&L",fmtPnl(allPos.reduce((s,p)=>s+(p.profit||0),0)),allPos.reduce((s,p)=>s+(p.profit||0),0)>=0?C.buy:C.sell],["14d Trades",allHist.length],["14d P&L",fmtPnl(allHist.reduce((s,h)=>s+(h.profit||0),0)),allHist.reduce((s,h)=>s+(h.profit||0),0)>=0?C.buy:C.sell]].map(([lbl,val,col])=>(
                <div key={lbl}>
                  <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>{lbl}</div>
                  <div style={{fontFamily:C.mono,fontSize:15,fontWeight:700,color:col||C.text}}>{val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Strategy Performance */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:14}}>
            <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1.5,marginBottom:12,fontWeight:600}}>📊 Strategy Performance (14d)</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:2,background:C.border,borderRadius:6,overflow:"hidden"}}>
              {[
                {label:"Bot 1 — Standard",color:C.accent,perf:perf1},
                {label:"Bot 2 — Price Break Through",color:"#6366f1",perf:perf2},
                {label:"Bot 3 — SNR Advance",color:C.csr,perf:perf3},
                {label:"Bot 4 — CSR100 v2",color:C.csr2,perf:perf4},
              ].map(({label,color,perf})=>(
                <div key={label} style={{background:C.card,padding:"10px 12px"}}>
                  <div style={{fontSize:9,color:color,fontWeight:700,marginBottom:8,letterSpacing:0.5}}>{label}</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
                    {[
                      ["Trades",perf.trades,C.text],
                      ["Win Rate",perf.trades>0?`${perf.winRate}%`:"—",perf.winRate>=50?C.buy:"#f87171"],
                      ["Wins",perf.wins,C.buy],
                      ["Losses",perf.losses,perf.losses>0?C.sell:C.muted],
                    ].map(([l,v,c])=>(
                      <div key={l}>
                        <div style={{fontSize:8,color:C.muted,textTransform:"uppercase",letterSpacing:0.8,marginBottom:2}}>{l}</div>
                        <div style={{fontFamily:C.mono,fontSize:12,fontWeight:700,color:c}}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{borderTop:`1px solid ${C.border}`,paddingTop:8,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:4}}>
                    {[
                      ["P&L",fmtPnl(perf.pnl),perf.pnl>=0?C.buy:C.sell],
                      ["Best",perf.best>0?`+${perf.best}`:perf.best,C.buy],
                      ["Worst",perf.worst,perf.worst<0?C.sell:C.muted],
                    ].map(([l,v,c])=>(
                      <div key={l}>
                        <div style={{fontSize:8,color:C.muted,textTransform:"uppercase",letterSpacing:0.8,marginBottom:2}}>{l}</div>
                        <div style={{fontFamily:C.mono,fontSize:11,fontWeight:700,color:c}}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Daily P&L Tracker */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:14,marginTop:4}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:showDailyPnl?12:0}}>
              <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1.5,fontWeight:600}}>📅 Daily P&L Tracker</div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={recalculateDailyPnl} disabled={recalculating} style={{fontFamily:C.mono,fontSize:9,padding:"2px 8px",background:"transparent",color:recalculating?C.muted:C.buy,border:`1px solid ${recalculating?C.border:C.buy}44`,borderRadius:3,cursor:recalculating?"not-allowed":"pointer"}}>{recalculating?"...":"RECALCULATE"}</button>
                <button onClick={resetDailyPnl} style={{fontFamily:C.mono,fontSize:9,padding:"2px 8px",background:"transparent",color:C.sell,border:`1px solid ${C.sell}44`,borderRadius:3,cursor:"pointer"}}>RESET</button>
                <button onClick={()=>setShowDailyPnl(p=>!p)} style={{fontFamily:C.mono,fontSize:9,padding:"2px 8px",background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:3,cursor:"pointer"}}>{showDailyPnl?"HIDE":"SHOW"}</button>
              </div>
            </div>
            {showDailyPnl&&(
              dailyPnl.length===0?(
                <div style={{fontSize:11,color:C.muted,textAlign:"center",padding:"10px 0"}}>No data yet — trades will be recorded here daily</div>
              ):(
                <div style={{maxHeight:200,overflowY:"auto"}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:0,marginBottom:6}}>
                    {["Date","P&L","Status"].map(h=>(
                      <div key={h} style={{fontSize:8,color:C.muted,textTransform:"uppercase",letterSpacing:1,padding:"4px 6px",borderBottom:`1px solid ${C.border}`}}>{h}</div>
                    ))}
                  </div>
                  {dailyPnl.map((d,i)=>(
                    <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:0,borderBottom:`1px solid ${C.border}`,padding:"5px 0"}}>
                      <div style={{fontFamily:C.mono,fontSize:10,color:C.text,padding:"0 6px"}}>{d.date}</div>
                      <div style={{fontFamily:C.mono,fontSize:10,fontWeight:700,color:d.pnl>=0?C.buy:C.sell,padding:"0 6px"}}>{d.pnl>=0?"+":""}{d.pnl}</div>
                      <div style={{padding:"0 6px"}}>
                        <span style={{fontSize:9,fontWeight:700,color:d.pnl>=0?C.buy:C.sell,background:(d.pnl>=0?C.buy:C.sell)+"22",padding:"1px 6px",borderRadius:3}}>{d.pnl>=0?"PROFIT":"LOSS"}</span>
                      </div>
                    </div>
                  ))}
                  <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:9,color:C.muted}}>Total ({dailyPnl.length} days)</span>
                    <span style={{fontFamily:C.mono,fontSize:11,fontWeight:700,color:dailyPnl.reduce((s,d)=>s+d.pnl,0)>=0?C.buy:C.sell}}>{fmtPnl(dailyPnl.reduce((s,d)=>s+d.pnl,0))}</span>
                  </div>
                </div>
              )
            )}
          </div>
        </div>

        {/* Right: Bot Tab Panel */}
        <div style={{display:"flex",flexDirection:"column",background:C.panel,borderLeft:`1px solid ${C.border}`,overflow:"hidden"}}>
          {/* Bot Tabs */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
            {botConfigs.map(b=>(
              <button key={b.id} onClick={()=>setActiveBot(b.id)}
                style={{fontFamily:C.sans,fontSize:11,fontWeight:700,padding:"10px 0",cursor:"pointer",
                  background:activeBot===b.id?C.card:"transparent",
                  color:activeBot===b.id?b.color:C.muted,
                  border:"none",borderBottom:`2px solid ${activeBot===b.id?b.color:"transparent"}`,
                  transition:"all .15s",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                <span style={{fontSize:13}}>{b.id}</span>
                <span style={{fontSize:8,letterSpacing:0.5}}>{b.name.split("—")[0].trim()}</span>
                {/* Live position indicator dot */}
                {b.positions.length>0&&<div style={{width:5,height:5,borderRadius:"50%",background:b.color,boxShadow:`0 0 4px ${b.color}`}}/>}
              </button>
            ))}
          </div>

          {/* Active Bot Panel */}
          <div style={{flex:1,overflow:"hidden"}}>
            <BotPanel
              botId={activeCfg.id}
              botName={activeCfg.name}
              botColor={activeCfg.color}
              account={activeCfg.account}
              positions={activeCfg.positions}
              history={activeCfg.history}
              autoLog={autoStatus[activeCfg.id]?.log||[]}
              lastTrade={autoStatus[activeCfg.id]?.last_trade}
              autoMode={activeCfg.auto}
              onToggleAuto={()=>toggleBotAuto(activeCfg.id,activeCfg.auto,activeCfg.setAuto)}
              botMode={activeCfg.mode}
              onBotMode={activeCfg.setMode}
              orderForm={orderForm}
              setOrderForm={setOrderForm}
              symbol={symbol}
              onPlaceOrder={placeOrder}
              onClosePos={closePos}
              loading={loadOrder}
              isBot2={activeCfg.isBot2||false}
              isBot3={activeCfg.isBot3||false}
              isBot4={activeCfg.isBot4||false}
              liveSignal={activeCfg.liveSignal||null}
            />
          </div>
        </div>
      </div>

      {toast&&(
        <div style={{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",background:toast.type==="err"?C.sell:C.buy,color:"#fff",padding:"10px 20px",borderRadius:8,zIndex:999,fontFamily:C.sans,fontSize:12,fontWeight:700,boxShadow:"0 4px 20px rgba(0,0,0,0.5)",maxWidth:480,textAlign:"center"}}>{toast.msg}</div>
      )}
    </div>
  );
}