"use client";

import { useEffect, useState } from "react";

type ApiData = {
  source: string;
  readonly: boolean;
  rowCount: number;
  latestDate: string | null;
  metrics: {
    breakdowns: number;
    consumers: number;
    consumerHours: number;
    duration: number;
    pending: number;
    closed: number;
    saifi: number;
    saidi: number;
    caidi: number;
    asai: number;
  };
  dimensions: Record<string, {name:string;count:number}[]>;
  error?: string;
};

const fmt = (n: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n || 0);

export default function Home() {
  const [data, setData] = useState<ApiData | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<{role:"user"|"assistant";text:string}[]>([
    { role: "assistant", text: "Ask me about breakdowns, feeders, grids, substations, pending work, consumer impact or SAIFI/SAIDI." }
  ]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setError("");
    try {
      const r = await fetch("/api/data", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Unable to read Google Sheet.");
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load data.");
    }
  }

  async function ask() {
    const q = query.trim();
    if (!q || loading) return;
    setMessages(m => [...m, { role: "user", text: q }]);
    setQuery("");
    setLoading(true);
    try {
      const r = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q })
      });
      const j = await r.json();
      setMessages(m => [...m, { role: "assistant", text: j.answer || j.error || "No response." }]);
    } catch {
      setMessages(m => [...m, { role: "assistant", text: "Unable to query the Sheet right now." }]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const m = data?.metrics;

  return (
    <main className="container">
      <header className="header">
        <div>
          <h1 className="title">BD AI Breakdown Dashboard</h1>
          <p className="subtitle">Live read-only analytics from the master Google Sheet • 85-column BD schema</p>
        </div>
        <div className="badge">● {data ? "Google Sheet connected" : "Connecting…"}</div>
      </header>

      {error && <div className="card section"><strong>Connection error</strong><div className="muted" style={{marginTop:6}}>{error}</div><button className="primary" style={{marginTop:12}} onClick={load}>Retry</button></div>}

      <section className="grid">
        {[
          ["Breakdown Records", fmt(m?.breakdowns || 0), "Current Sheet rows"],
          ["Consumers Affected", fmt(m?.consumers || 0), "Recorded consumer impact"],
          ["Consumer Hours", fmt(m?.consumerHours || 0), "Recorded consumer-hours"],
          ["Pending / Open", fmt(m?.pending || 0), "Status / closing status"],
          ["Closed / Complete", fmt(m?.closed || 0), "Status / closing status"],
          ["Latest Data", data?.latestDate || "—", "Detected from Date / Date ONLY"]
        ].map(([a,b,c]) => <div className="card" key={a}><div className="kpi-label">{a}</div><div className="kpi-value">{b}</div><div className="kpi-note">{c}</div></div>)}
      </section>

      <section className="card section">
        <h2 className="section-title">Breakdown Distribution</h2>
        <div className="chat" style={{gridTemplateColumns:"1fr 1fr"}}>
          <div>
            <div className="kpi-label" style={{marginBottom:8}}>Top Feeders</div>
            <table><thead><tr><th>Feeder</th><th>Records</th></tr></thead><tbody>
              {(data?.dimensions.feeders || []).slice(0,10).map(x => <tr key={x.name}><td>{x.name}</td><td>{x.count}</td></tr>)}
            </tbody></table>
          </div>
          <div>
            <div className="kpi-label" style={{marginBottom:8}}>Voltage</div>
            <table><thead><tr><th>Voltage</th><th>Records</th></tr></thead><tbody>
              {(data?.dimensions.voltage || []).slice(0,10).map(x => <tr key={x.name}><td>{x.name}</td><td>{x.count}</td></tr>)}
            </tbody></table>
          </div>
        </div>
      </section>

      <section className="chat section">
        <div className="card chatbox">
          <h2 className="section-title">AI Breakdown Analyst</h2>
          <div className="messages">
            {messages.map((msg, i) => <div key={i} className={"msg " + msg.role}>{msg.text}</div>)}
            {loading && <div className="msg">Analysing current Sheet…</div>}
          </div>
          <div className="chatrow">
            <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")ask();}} placeholder="e.g. Show feeder-wise pending work" />
            <button className="primary" onClick={ask}>Ask</button>
          </div>
        </div>

        <div className="card">
          <h2 className="section-title">Reliability Indicators</h2>
          <table>
            <tbody>
              <tr><td>SAIFI (recorded total)</td><td>{(m?.saifi || 0).toFixed(3)}</td></tr>
              <tr><td>SAIDI (recorded total)</td><td>{(m?.saidi || 0).toFixed(3)}</td></tr>
              <tr><td>CAIDI (recorded total)</td><td>{(m?.caidi || 0).toFixed(3)}</td></tr>
              <tr><td>ASAI (avg. non-zero)</td><td>{(m?.asai || 0).toFixed(5)}</td></tr>
              <tr><td>Data rows read</td><td>{fmt(data?.rowCount || 0)}</td></tr>
            </tbody>
          </table>
          <p className="muted" style={{fontSize:11, lineHeight:1.5, marginTop:12}}>
            The app is read-only. It never writes to the master Google Sheet. Reliability values are shown as row-level aggregates and should follow your organization's KPI calculation methodology.
          </p>
        </div>
      </section>

      <footer className="muted" style={{fontSize:11, marginTop:16}}>
        Master source: Google Sheet • Repository contains application code only, not the BD dataset.
      </footer>
    </main>
  );
}
