import { useState, useEffect, useCallback, useRef } from "react";

// ── UPDATE THIS URL SETIAP KALI RESTART VPS ──────────────────────────────
const API = "https://finished-container-responsible-photograph.trycloudflare.com";
// ─────────────────────────────────────────────────────────────────────────

const SCAN_PAIRS  = ["EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD","USDCHF","NZDUSD","XAUUSD"];
const TIMEFRAMES  = ["M1","M5","M15","M30","H1","H4","D1"];
const MAX_POS     = 1; // max 1 position per bot
const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours

const C = {
  bg:"#080c14",panel:"#0d1320",card:"#111827",border:"#1a2438",
  accent:"#f59e0b",buy:"#10b981",sell:"#ef4444",muted:"#4b5563",
  dim:"#6b7280",text:"#e2e8f0",csr:"#8b5cf6", // purple for Bot 3
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
function BotPanel({botId,botName,botColor,account,positions,history,autoLog,autoMode,onToggleAuto,botMode,onBotMode,orderForm,setOrderForm,symbol,onPlaceOrder,onClosePos,loading,isBot3}){
  const totalPnl=positions.reduce((s,p)=>s+(p.profit||0),0);
  const histPnl=history.reduce((s,h)=>s+(h.profit||0),0);
  const [tab,setTab]=useState("positions");

  const modeOptions = isBot3
    ? [["snrA","Mode A (H4+M15)"],["snrB","Mode B (D1+H1)"]]
    : [["bot1","Standard"],["bot2","+ Vol Profile"]];

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
        <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",gap:6}}>
          {modeOptions.map(([k,l])=>(
            <button key={k} onClick={()=>onBotMode(k)} style={{flex:1,fontFamily:C.sans,fontSize:10,fontWeight:600,padding:"4px 0",borderRadius:4,cursor:"pointer",background:botMode===k?botColor||C.accent:C.card,color:botMode===k?"#000":C.dim,border:`1px solid ${botMode===k?botColor||C.accent:C.border}`}}>{l}</button>
          ))}
        </div>

        {/* Bot 3 Info Banner */}
        {isBot3&&(
          <div style={{padding:"8px 14px",borderBottom:`1px solid ${C.border}`,background:C.csr+"11",border:`1px solid ${C.csr}33`}}>
            <div style={{fontSize:10,color:C.csr,fontWeight:700,marginBottom:3}}>⚡ SNR Advance Strategy</div>
            <div style={{fontSize:9,color:C.muted}}>Magic: 33333 · Account 2 · Engulfing CRS @ SNR Zone</div>
            <div style={{fontSize:9,color:C.muted,marginTop:2}}>Mode A: H4 trend + M15 entry · Mode B: Daily + H1</div>
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

        {/* Auto Log */}
        {autoMode&&(
          <div style={{padding:"10px 14px"}}>
            <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Auto Log</div>
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

  // Per-bot state
  const [acc1,setAcc1]=useState(null);
  const [acc2,setAcc2]=useState(null);
  const [pos1,setPos1]=useState([]);
  const [pos2,setPos2]=useState([]);
  const [pos3,setPos3]=useState([]); // Bot 3 shares account 2 positions filtered by magic
  const [hist1,setHist1]=useState([]);
  const [hist2,setHist2]=useState([]);
  const [hist3,setHist3]=useState([]);
  const [auto1,setAuto1]=useState(true);
  const [auto2,setAuto2]=useState(true);
  const [auto3,setAuto3]=useState(true); // SNR Advance ready
  const [bot1Mode,setBot1Mode]=useState("bot1");
  const [bot2Mode,setBot2Mode]=useState("bot2");
  const [bot3Mode,setBot3Mode]=useState("snrA");
  const [log1,setLog1]=useState([]);
  const [log2,setLog2]=useState([]);
  const [log3,setLog3]=useState([]);
  const [last1,setLast1]=useState(null);
  const [last2,setLast2]=useState(null);
  const [last3,setLast3]=useState(null);
  const autoRef1=useRef(null);
  const autoRef2=useRef(null);
  const autoRef3=useRef(null);

  const addLog=(setter,msg)=>{
    const t=new Date().toLocaleTimeString("en-MY",{hour12:false});
    setter(p=>[`[${t}] ${msg}`,...p].slice(0,25));
  };
  const showToast=(msg,type="ok")=>{setToast({msg,type});setTimeout(()=>setToast(null),3500);};

  const fetchAcc=useCallback(async()=>{
    try{
      const[r1,r2]=await Promise.all([fetch(`${API}/account?acc=1`),fetch(`${API}/account?acc=2`)]);
      if(r1.ok)setAcc1(await r1.json());
      if(r2.ok)setAcc2(await r2.json());
    }catch{}
  },[]);

  const fetchPos=useCallback(async()=>{
    try{
      const[r1,r2]=await Promise.all([fetch(`${API}/positions?account=1`),fetch(`${API}/positions?account=2`)]);
      if(r1.ok)setPos1(await r1.json());
      if(r2.ok){
        const all=await r2.json();
        // Filter by magic number
        setPos2(all.filter(p=>!p.magic||p.magic===22222));
        setPos3(all.filter(p=>p.magic===33333));
      }
    }catch{}
  },[]);

  const fetchHist=useCallback(async()=>{
    try{
      const[r1,r2]=await Promise.all([fetch(`${API}/history?days=14&account=1`),fetch(`${API}/history?days=14&account=2`)]);
      if(r1.ok)setHist1(await r1.json());
      if(r2.ok){
        const all=await r2.json();
        setHist2(all.filter(h=>!h.magic||h.magic===22222));
        setHist3(all.filter(h=>h.magic===33333));
      }
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

  const makeAutoRun=(botId,bMode,positions,lastTime,setLast,addLogFn,magic)=>async()=>{
    if(positions.length>=MAX_POS){addLogFn(`⏸ Max ${MAX_POS} positions reached`);return;}
    if(lastTime&&Date.now()-lastTime<COOLDOWN_MS){
      const rem=((COOLDOWN_MS-(Date.now()-lastTime))/60000).toFixed(0);
      addLogFn(`⏳ Cooldown: ${rem}min remaining`);return;
    }
    addLogFn(`🔍 Scanning ${SCAN_PAIRS.length} pairs...`);
    const endpoint=bMode==="bot2"?"analyze-vp":bMode==="snrA"?"analyze-snr":bMode==="snrB"?"analyze-snr":"analyze";
    const modeParam=bMode==="snrA"?"?mode=A&":bMode==="snrB"?"?mode=B&":"?";
    const signals=[];
    for(const pair of SCAN_PAIRS){
      try{
        const r=await fetch(`${API}/${endpoint}/${pair}${modeParam}timeframe=${timeframe}`);
        if(!r.ok)continue;
        const data=await r.json();
        const sig=data?.signal?.direction;
        const conf=data?.signal?.confidence||0;
        if(conf>=60&&(sig==="STRONG BUY"||sig==="STRONG SELL"))signals.push({pair,sig,conf});
      }catch{}
    }
    if(!signals.length){addLogFn("😴 No strong signals");return;}
    signals.sort((a,b)=>b.conf-a.conf);
    const best=signals[0];
    addLogFn(`🎯 ${best.sig} ${best.pair} (${best.conf}%)`);
    if(positions.some(p=>p.symbol===best.pair)){addLogFn(`⚠️ Already in ${best.pair}`);return;}
    const action=best.sig==="STRONG BUY"?"buy":"sell";
    const accountId=botId===1?1:2;
    try{
      const r=await fetch(`${API}/order`,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({symbol:best.pair,action,lot:orderForm.lot,sl_pips:orderForm.sl,tp_pips:orderForm.tp,comment:`Auto-Bot${botId}`,account:accountId,magic:magic})});
      const res=await r.json();
      if(res.ticket){
        setLast(Date.now());
        addLogFn(`✅ ${action.toUpperCase()} ${best.pair} @${res.price} #${res.ticket}`);
        showToast(`⚡ Bot${botId}: ${action.toUpperCase()} ${best.pair} — #${res.ticket}`);
        fetchPos();fetchHist();
      }else{addLogFn(`❌ ${res.detail||"Order failed"}`);}
    }catch(e){addLogFn(`❌ Error: ${e.message}`);}
  };

  // Auto intervals
  useEffect(()=>{
    if(!auto1){clearInterval(autoRef1.current);return;}
    const run=makeAutoRun(1,bot1Mode,pos1,last1,setLast1,(msg)=>addLog(setLog1,msg),11111);
    run();autoRef1.current=setInterval(run,30000);
    return()=>clearInterval(autoRef1.current);
  },[auto1,bot1Mode,pos1,last1,timeframe,orderForm]);

  useEffect(()=>{
    if(!auto2){clearInterval(autoRef2.current);return;}
    const run=makeAutoRun(2,bot2Mode,pos2,last2,setLast2,(msg)=>addLog(setLog2,msg),22222);
    run();autoRef2.current=setInterval(run,30000);
    return()=>clearInterval(autoRef2.current);
  },[auto2,bot2Mode,pos2,last2,timeframe,orderForm]);

  useEffect(()=>{
    if(!auto3){clearInterval(autoRef3.current);return;}
    const run=makeAutoRun(3,bot3Mode,pos3,last3,setLast3,(msg)=>addLog(setLog3,msg),33333);
    run();autoRef3.current=setInterval(run,30000);
    return()=>clearInterval(autoRef3.current);
  },[auto3,bot3Mode,pos3,last3,timeframe,orderForm]);

  useEffect(()=>{
    fetchAcc();fetchPos();fetchHist();fetchScan();fetchAnalysis();
    const t=setInterval(()=>{fetchAcc();fetchPos();},10000);
    const s=setInterval(()=>{fetchScan();},60000);
    return()=>{clearInterval(t);clearInterval(s);};
  },[]);

  useEffect(()=>{fetchAnalysis();},[symbol,timeframe]);
  useEffect(()=>{fetchScan();},[timeframe]);

  const placeOrder=async(action,botId)=>{
    setLoadOrder(true);
    const accountId=botId===1?1:2;
    const magic=botId===1?11111:botId===2?22222:33333;
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
    const accountId=botId===1?1:2;
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
  const allPos=[...pos1,...pos2,...pos3];
  const allHist=[...hist1,...hist2,...hist3];

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

  return(
    <div style={{fontFamily:C.sans,background:C.bg,minHeight:"100vh",color:C.text,margin:0}}>
      {/* Topbar */}
      <div style={{background:C.panel,borderBottom:`1px solid ${C.border}`,padding:"0 20px",display:"flex",alignItems:"center",justifyContent:"space-between",height:48,position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:26,height:26,borderRadius:5,background:C.accent,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:13,color:"#000"}}>X</div>
          <span style={{fontWeight:700,fontSize:14,letterSpacing:0.3}}>XM Trading</span>
          <span style={{fontSize:10,color:C.muted,background:C.card,border:`1px solid ${C.border}`,padding:"2px 8px",borderRadius:3}}>Triple Bot v3</span>
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

      {/* Main Grid: Scanner | Center | Bot1 | Bot2 | Bot3 */}
      <div style={{display:"grid",gridTemplateColumns:"180px 1fr 260px 260px 260px",height:"calc(100vh - 48px)",overflow:"hidden"}}>

        {/* Scanner */}
        <div style={{background:C.panel,borderRight:`1px solid ${C.border}`,overflowY:"auto",display:"flex",flexDirection:"column"}}>
          <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,background:C.panel,zIndex:1}}>
            <span style={{fontSize:10,fontWeight:600,color:C.muted,textTransform:"uppercase",letterSpacing:1.5}}>Scanner</span>
            {loadScan&&<span style={{fontSize:9,color:C.dim}}>updating...</span>}
          </div>
          {scan.map(row=>(
            <div key={row.symbol} onClick={()=>{setSymbol(row.symbol);fetchAnalysis(row.symbol,timeframe);}}
              style={{padding:"9px 14px",cursor:"pointer",borderBottom:`1px solid ${C.border}`,background:symbol===row.symbol?C.card:"transparent",transition:"background .1s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <span style={{fontFamily:C.mono,fontSize:12,fontWeight:700,color:symbol===row.symbol?C.accent:C.text}}>{row.symbol}</span>
                <Pill label={row.signal}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{fontFamily:C.mono,fontSize:10,color:C.muted}}>{fmt(row.bid,row.symbol.includes("JPY")||row.symbol==="XAUUSD"?2:5)}</span>
                <span style={{fontSize:10,color:C.dim}}>{row.confidence}%</span>
              </div>
            </div>
          ))}
          {!scan.length&&!loadScan&&(
            <div style={{padding:20,fontSize:11,color:C.muted,textAlign:"center"}}>No data</div>
          )}
        </div>

        {/* Center: Chart + Analysis */}
        <div style={{overflowY:"auto",padding:14,display:"flex",flexDirection:"column",gap:10}}>
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            <select value={symbol} onChange={e=>{setSymbol(e.target.value);fetchAnalysis(e.target.value,timeframe);}}
              style={{fontFamily:C.mono,fontSize:13,fontWeight:700,background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:5,padding:"5px 10px",cursor:"pointer"}}>
              {SCAN_PAIRS.map(p=><option key={p}>{p}</option>)}
            </select>
            <div style={{display:"flex",gap:3}}>
              {TIMEFRAMES.map(tf=>(
                <button key={tf} onClick={()=>{setTF(tf);fetchAnalysis(symbol,tf);}} style={{fontFamily:C.mono,fontSize:10,padding:"4px 8px",background:timeframe===tf?C.accent:C.card,color:timeframe===tf?"#000":C.dim,border:`1px solid ${timeframe===tf?C.accent:C.border}`,borderRadius:4,cursor:"pointer",fontWeight:700}}>{tf}</button>
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

          {/* Combined Stats — All 3 Bots */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:14,marginBottom:12}}>
            <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1.5,marginBottom:12,fontWeight:600}}>Combined — All 3 Bots</div>
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
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:2,background:C.border,borderRadius:6,overflow:"hidden"}}>
              {[
                {label:"Bot 1 — Standard",color:C.accent,perf:perf1},
                {label:"Bot 2 — Vol Profile",color:"#6366f1",perf:perf2},
                {label:"Bot 3 — SNR Advance",color:C.csr,perf:perf3},
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
        </div>

        {/* Bot 1 Panel */}
        <BotPanel botId={1} botName="Bot 1 — Standard" botColor={C.accent}
          account={acc1} positions={pos1} history={hist1} autoLog={log1}
          autoMode={auto1} onToggleAuto={()=>setAuto1(p=>!p)}
          botMode={bot1Mode} onBotMode={setBot1Mode}
          orderForm={orderForm} setOrderForm={setOrderForm}
          symbol={symbol} onPlaceOrder={placeOrder} onClosePos={closePos} loading={loadOrder}/>

        {/* Bot 2 Panel */}
        <BotPanel botId={2} botName="Bot 2 — Vol Profile" botColor="#6366f1"
          account={acc2} positions={pos2} history={hist2} autoLog={log2}
          autoMode={auto2} onToggleAuto={()=>setAuto2(p=>!p)}
          botMode={bot2Mode} onBotMode={setBot2Mode}
          orderForm={orderForm} setOrderForm={setOrderForm}
          symbol={symbol} onPlaceOrder={placeOrder} onClosePos={closePos} loading={loadOrder}/>

        {/* Bot 3 Panel — CSR100 + HNS */}
        <BotPanel botId={3} botName="Bot 3 — CSR100+HNS" botColor={C.csr} isBot3={true}
          account={acc2} positions={pos3} history={hist3} autoLog={log3}
          autoMode={auto3} onToggleAuto={()=>setAuto3(p=>!p)}
          botMode={bot3Mode} onBotMode={setBot3Mode}
          orderForm={orderForm} setOrderForm={setOrderForm}
          symbol={symbol} onPlaceOrder={placeOrder} onClosePos={closePos} loading={loadOrder}/>
      </div>

      {toast&&(
        <div style={{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",background:toast.type==="err"?C.sell:C.buy,color:"#fff",padding:"10px 20px",borderRadius:8,zIndex:999,fontFamily:C.sans,fontSize:12,fontWeight:700,boxShadow:"0 4px 20px rgba(0,0,0,0.5)",maxWidth:480,textAlign:"center"}}>{toast.msg}</div>
      )}
    </div>
  );
}