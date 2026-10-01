import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

declare global {
  interface Window {
    google?: any;
  }
}

const SHEET_ID = "1zd0So3--DA2VizDkA7ZLfGrO-k2g0JCpm8lIXfSnpKs";
const SHEET_RANGE = "BD!A:CG";
const CLIENT_ID_KEY = "bd_google_client_id";

type Row = Record<string,string>;

const n = (v:string|undefined) => {
  const x = Number(String(v??"").replace(/,/g,"").replace(/%/g,""));
  return Number.isFinite(x) ? x : 0;
};
const clean = (v:string|undefined) => String(v??"").trim();

function group(rows:Row[], key:string) {
  const m = new Map<string,number>();
  rows.forEach(r => { const k=clean(r[key])||"Blank"; m.set(k,(m.get(k)||0)+1); });
  return [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12);
}

function dateOf(r:Row) {
  const s=clean(r["Date ONLY"]||r.Date||r["OPEN TIME"]);
  if(!s) return null;
  const d=new Date(s);
  if(!Number.isNaN(d.getTime())) return d;
  const m=s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  return m ? new Date(+m[3],+m[2]-1,+m[1]) : null;
}

function metrics(rows:Row[]) {
  const pending=rows.filter(r=>/pending|open|ongoing/i.test(clean(r.STATUS)+" "+clean(r["CLOSING STATUS"]))).length;
  const closed=rows.filter(r=>/closed|complete|completed|done/i.test(clean(r.STATUS)+" "+clean(r["CLOSING STATUS"]))).length;
  return {
    rows:rows.length,
    consumers:rows.reduce((a,r)=>a+n(r.CONSUMERS),0),
    hours:rows.reduce((a,r)=>a+n(r["CONSUMERS HOURS AFFECTED"]),0),
    duration:rows.reduce((a,r)=>a+n(r.DURATION||r["AFF DURATION"]),0),
    pending,closed,
    saifi:rows.reduce((a,r)=>a+n(r.SAIFI),0),
    saidi:rows.reduce((a,r)=>a+n(r.SAIDI),0),
    caidi:rows.reduce((a,r)=>a+n(r.CAIDI),0)
  };
}

async function loadGIS() {
  if(window.google?.accounts?.oauth2) return;
  await new Promise<void>((resolve,reject)=>{
    const s=document.createElement("script");
    s.src="https://accounts.google.com/gsi/client";
    s.onload=()=>resolve(); s.onerror=()=>reject(new Error("Google sign-in library could not load."));
    document.head.appendChild(s);
  });
}

async function getToken(clientId:string, force=false):Promise<string> {
  await loadGIS();
  return new Promise((resolve,reject)=>{
    const client=window.google.accounts.oauth2.initTokenClient({
      client_id:clientId,
      scope:"https://www.googleapis.com/auth/spreadsheets.readonly",
      callback:(resp:any)=>resp?.access_token ? resolve(resp.access_token) : reject(new Error(resp?.error_description||"Google authorization failed."))
    });
    client.requestAccessToken({prompt:force?"consent":""});
  });
}

async function readSheet(token:string):Promise<Row[]> {
  const url="https://sheets.googleapis.com/v4/spreadsheets/"+SHEET_ID+"/values/"+encodeURIComponent(SHEET_RANGE)+"?valueRenderOption=FORMATTED_VALUE";
  const r=await fetch(url,{headers:{Authorization:"Bearer "+token}});
  const j=await r.json();
  if(!r.ok) throw new Error(j.error?.message||"Google Sheets read failed.");
  const values=j.values||[];
  if(!values.length) return [];
  const headers=values[0].map((x:any)=>clean(x));
  return values.slice(1).filter((x:any[])=>x.some(v=>clean(v))).map((x:any[])=>{
    const row:Row={}; headers.forEach((h:string,i:number)=>{if(h) row[h]=clean(x[i])}); return row;
  });
}

function App() {
  const [clientId,setClientId]=useState(localStorage.getItem(CLIENT_ID_KEY)||"");
  const [rows,setRows]=useState<Row[]>([]);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const [grid,setGrid]=useState("");
  const [feeder,setFeeder]=useState("");
  const [voltage,setVoltage]=useState("");
  const [query,setQuery]=useState("");
  const [answer,setAnswer]=useState("");

  async function connect() {
    setError(""); setLoading(true);
    try {
      if(!clientId.trim()) throw new Error("Enter your Google OAuth Web Client ID first.");
      localStorage.setItem(CLIENT_ID_KEY,clientId.trim());
      const token=await getToken(clientId.trim());
      const data=await readSheet(token);
      setRows(data);
    } catch(e:any) { setError(e?.message||"Unable to connect."); }
    finally { setLoading(false); }
  }

  const filtered=useMemo(()=>rows.filter(r=>
    (!grid||clean(r.GRID)===grid)&&(!feeder||clean(r.FEEDER)===feeder)&&(!voltage||clean(r.VOLTAGE)===voltage)
  ),[rows,grid,feeder,voltage]);

  const m=metrics(filtered);
  const grids=group(rows,"GRID"), feeders=group(filtered,"FEEDER"), volts=group(filtered,"VOLTAGE"), causes=group(filtered,"CAUSE");
  const latest=[...filtered.map(dateOf).filter(Boolean) as Date[]].sort((a,b)=>b.getTime()-a.getTime())[0];

  function ask() {
    const q=query.toLowerCase();
    let text="";
    if(q.includes("today")){
      const key=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
      const x=filtered.filter(r=>{const d=dateOf(r);return d&&d.toISOString().slice(0,10)===key});
      const z=metrics(x); text=`Today: ${z.rows} records, ${z.pending} pending/open, ${z.closed} closed, ${Math.round(z.consumers).toLocaleString("en-IN")} consumers affected.`;
    } else if(q.includes("cause")) text="Top causes: "+causes.map(x=>x[0]+" ("+x[1]+")").join(", ");
    else if(q.includes("voltage")) text="Voltage-wise: "+volts.map(x=>x[0]+": "+x[1]).join(" | ");
    else if(q.includes("feeder")) text="Top feeders: "+feeders.map(x=>x[0]+" ("+x[1]+")").join(", ");
    else if(q.includes("grid")) text="Top grids: "+grids.map(x=>x[0]+" ("+x[1]+")").join(", ");
    else if(q.includes("pending")||q.includes("open")) text=`Pending/open records: ${filtered.filter(r=>/pending|open|ongoing/i.test(clean(r.STATUS)+" "+clean(r["CLOSING STATUS"]))).length}.`;
    else if(q.includes("consumer")) text=`Consumers affected: ${Math.round(m.consumers).toLocaleString("en-IN")}; consumer-hours: ${Math.round(m.hours).toLocaleString("en-IN")}.`;
    else if(q.includes("saifi")||q.includes("saidi")||q.includes("caidi")) text=`Recorded aggregates — SAIFI: ${m.saifi.toFixed(3)}, SAIDI: ${m.saidi.toFixed(3)}, CAIDI: ${m.caidi.toFixed(3)}.`;
    else text=`Current filtered data: ${m.rows} records, ${m.pending} pending/open, ${m.closed} closed. Ask about feeder, grid, voltage, cause, consumers, pending work or reliability indices.`;
    setAnswer(text);
  }

  return <main className="wrap">
    <header><div><h1>BD AI Breakdown Dashboard</h1><p>GitHub Pages + Google Sheets • Read-only • 85-column BD master</p></div><span className={rows.length?"ok":"badge"}>{rows.length?"● CONNECTED":"● NOT CONNECTED"}</span></header>

    {!rows.length && <section className="setup card">
      <h2>Connect your private Google Sheet</h2>
      <p>Enter the <b>Google OAuth Web Client ID</b>. The app reads the Sheet directly from your browser and never writes to it.</p>
      <input value={clientId} onChange={e=>setClientId(e.target.value)} placeholder="xxxxx.apps.googleusercontent.com"/>
      <button onClick={connect} disabled={loading}>{loading?"Connecting…":"Connect Google Sheet"}</button>
      {error&&<div className="error">{error}</div>}
      <small>Google Cloud must have the Google Sheets API enabled and this GitHub Pages origin added to the OAuth client's Authorized JavaScript origins.</small>
    </section>}

    {rows.length>0 && <>
      <section className="filters card">
        <select value={grid} onChange={e=>{setGrid(e.target.value);setFeeder("")}}><option value="">All Grids</option>{[...new Set(rows.map(r=>clean(r.GRID)).filter(Boolean))].sort().map(x=><option key={x}>{x}</option>)}</select>
        <select value={feeder} onChange={e=>setFeeder(e.target.value)}><option value="">All Feeders</option>{[...new Set(rows.filter(r=>!grid||clean(r.GRID)===grid).map(r=>clean(r.FEEDER)).filter(Boolean))].sort().map(x=><option key={x}>{x}</option>)}</select>
        <select value={voltage} onChange={e=>setVoltage(e.target.value)}><option value="">All Voltages</option>{[...new Set(rows.map(r=>clean(r.VOLTAGE)).filter(Boolean))].sort().map(x=><option key={x}>{x}</option>)}</select>
        <button onClick={()=>connect()}>Refresh Sheet</button>
      </section>
      <section className="kpis">
        {[["Records",m.rows],["Consumers",Math.round(m.consumers).toLocaleString("en-IN")],["Consumer Hours",Math.round(m.hours).toLocaleString("en-IN")],["Pending/Open",m.pending],["Closed",m.closed],["Avg Duration",m.rows?(m.duration/m.rows).toFixed(1):"0"]].map(x=><div className="card" key={x[0] as string}><small>{x[0]}</small><strong>{x[1]}</strong></div>)}
      </section>
      <section className="two">
        <div className="card"><h2>Top Feeders</h2><table><tbody>{feeders.map(x=><tr key={x[0]}><td>{x[0]}</td><td>{x[1]}</td></tr>)}</tbody></table></div>
        <div className="card"><h2>Top Causes</h2><table><tbody>{causes.map(x=><tr key={x[0]}><td>{x[0]}</td><td>{x[1]}</td></tr>)}</tbody></table></div>
      </section>
      <section className="two">
        <div className="card"><h2>AI Breakdown Analyst</h2><div className="answer">{answer||"Ask a question below."}</div><div className="ask"><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&ask()} placeholder="Show feeder-wise pending work"/><button onClick={ask}>Ask</button></div></div>
        <div className="card"><h2>Reliability</h2><p>SAIFI <b>{m.saifi.toFixed(3)}</b></p><p>SAIDI <b>{m.saidi.toFixed(3)}</b></p><p>CAIDI <b>{m.caidi.toFixed(3)}</b></p><p>Latest record <b>{latest?latest.toLocaleDateString("en-IN"):"—"}</b></p></div>
      </section>
      <footer>Master source: Google Sheet • Application: GitHub Pages • No write access • No BD dataset stored in GitHub</footer>
    </>}
    {error&&rows.length>0&&<div className="error">{error}</div>}
  </main>
}

createRoot(document.getElementById("root")!).render(<App/>);