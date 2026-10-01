import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Row = Record<string, string>;

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_RANGE = process.env.GOOGLE_SHEET_RANGE || "BD!A:CG";

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(/,/g, "").replace(/%/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function text(v: unknown): string {
  return String(v ?? "").trim();
}

function service() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (!SHEET_ID || !email || !key) {
    throw new Error("Missing Google Sheets environment variables.");
  }
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: email,
      private_key: key.replace(/\\n/g, "\n")
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });
  return google.sheets({ version: "v4", auth });
}

async function loadRows(): Promise<Row[]> {
  const sheets = service();
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: SHEET_RANGE,
    majorDimension: "ROWS",
    valueRenderOption: "FORMATTED_VALUE"
  });
  const values = result.data.values || [];
  if (!values.length) return [];
  const headers = values[0].map((h) => text(h));
  return values.slice(1).filter((r) => r.some((x) => text(x) !== "")).map((r) => {
    const row: Row = {};
    headers.forEach((h, i) => { if (h) row[h] = text(r[i]); });
    return row;
  });
}

function groupCount(rows: Row[], key: string) {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = text(r[key]) || "Blank";
    map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.entries()].sort((a,b) => b[1]-a[1]).slice(0, 20)
    .map(([name, count]) => ({ name, count }));
}

function parseDate(s: string): Date | null {
  const v = text(s);
  if (!v) return null;
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d;
  const m = v.match(/^(\d{1,2})[\\/-](\d{1,2})[\\/-](\d{4})$/);
  if (m) {
    const d2 = new Date(Number(m[3]), Number(m[2])-1, Number(m[1]));
    return Number.isNaN(d2.getTime()) ? null : d2;
  }
  return null;
}

function dateKey(s: string) {
  const d = parseDate(s);
  if (!d) return null;
  return d.toISOString().slice(0,10);
}

function filterRows(rows: Row[], req: NextRequest) {
  const grid = req.nextUrl.searchParams.get("grid");
  const feeder = req.nextUrl.searchParams.get("feeder");
  const voltage = req.nextUrl.searchParams.get("voltage");
  const subdiv = req.nextUrl.searchParams.get("subdivision");
  return rows.filter(r =>
    (!grid || text(r.GRID) === grid) &&
    (!feeder || text(r.FEEDER) === feeder) &&
    (!voltage || text(r.VOLTAGE) === voltage) &&
    (!subdiv || text(r["Fault Pertains to SUBDIVISION"]) === subdiv)
  );
}

function metrics(rows: Row[]) {
  const consumers = rows.reduce((s,r) => s + num(r.CONSUMERS), 0);
  const consumerHours = rows.reduce((s,r) => s + num(r["CONSUMERS HOURS AFFECTED"]), 0);
  const duration = rows.reduce((s,r) => s + num(r.DURATION || r["AFF DURATION"]), 0);
  const saifi = rows.reduce((s,r) => s + num(r.SAIFI), 0);
  const saidi = rows.reduce((s,r) => s + num(r.SAIDI), 0);
  const caidi = rows.reduce((s,r) => s + num(r.CAIDI), 0);
  const asaiVals = rows.map(r => num(r.ASAI)).filter(Boolean);
  const pending = rows.filter(r => /pending|open|ongoing/i.test(text(r.STATUS) + " " + text(r["CLOSING STATUS"]))).length;
  const closed = rows.filter(r => /closed|complete|completed|done/i.test(text(r.STATUS) + " " + text(r["CLOSING STATUS"]))).length;
  return {
    breakdowns: rows.length,
    consumers,
    consumerHours,
    duration,
    pending,
    closed,
    saifi,
    saidi,
    caidi,
    asai: asaiVals.length ? asaiVals.reduce((a,b)=>a+b,0)/asaiVals.length : 0
  };
}

export async function GET(req: NextRequest) {
  try {
    const rows = await loadRows();
    const filtered = filterRows(rows, req);
    const m = metrics(filtered);
    const dates = filtered.map(r => dateKey(r.Date || r["Date ONLY"] || r["OPEN TIME"])).filter(Boolean) as string[];
    const latestDate = dates.sort().at(-1) || null;
    return NextResponse.json({
      source: "Google Sheets",
      readonly: true,
      rowCount: filtered.length,
      latestDate,
      metrics: m,
      dimensions: {
        grids: groupCount(filtered, "GRID"),
        feeders: groupCount(filtered, "FEEDER"),
        substations: groupCount(filtered, "SUBSTATION"),
        voltage: groupCount(filtered, "VOLTAGE"),
        status: groupCount(filtered, "STATUS"),
        subdivision: groupCount(filtered, "Fault Pertains to SUBDIVISION")
      }
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const q = text(body.query).toLowerCase();
    const rows = await loadRows();
    const m = metrics(rows);

    const top = (key: string, n = 10) => groupCount(rows, key).slice(0,n);
    let answer = "";

    if (q.includes("today")) {
      const today = new Date().toISOString().slice(0,10);
      const todayRows = rows.filter(r => dateKey(r.Date || r["Date ONLY"] || r["OPEN TIME"]) === today);
      answer = `Today's records: ${todayRows.length}. Consumers affected: ${Math.round(metrics(todayRows).consumers).toLocaleString("en-IN")}. Pending/open: ${metrics(todayRows).pending}. Closed: ${metrics(todayRows).closed}.`;
    } else if (q.includes("pending") || q.includes("open")) {
      const pendingRows = rows.filter(r => /pending|open|ongoing/i.test(text(r.STATUS) + " " + text(r["CLOSING STATUS"])));
      answer = `Pending/open records: ${pendingRows.length}. Top feeders: ${top("FEEDER", 8).map(x => x.name + " (" + x.count + ")").join(", ")}.`;
    } else if (q.includes("voltage")) {
      answer = "Voltage-wise breakdown records: " + top("VOLTAGE", 10).map(x => `${x.name}: ${x.count}`).join(" | ");
    } else if (q.includes("substation")) {
      answer = "Top substations by recorded breakdown rows: " + top("SUBSTATION", 10).map(x => `${x.name}: ${x.count}`).join(" | ");
    } else if (q.includes("grid")) {
      answer = "Top grids by recorded breakdown rows: " + top("GRID", 10).map(x => `${x.name}: ${x.count}`).join(" | ");
    } else if (q.includes("feeder")) {
      answer = "Top feeders by recorded breakdown rows: " + top("FEEDER", 15).map(x => `${x.name}: ${x.count}`).join(" | ");
    } else if (q.includes("saidi") || q.includes("saifi") || q.includes("caidi") || q.includes("asai")) {
      answer = `Recorded reliability-index totals across the current Sheet: SAIFI ${m.saifi.toFixed(3)}, SAIDI ${m.saidi.toFixed(3)}, CAIDI ${m.caidi.toFixed(3)}, average non-zero ASAI ${m.asai.toFixed(5)}. These are row-level aggregates and should be interpreted according to your organization's KPI methodology.`;
    } else if (q.includes("consumer")) {
      answer = `Recorded consumer impact: ${Math.round(m.consumers).toLocaleString("en-IN")} consumers and ${Math.round(m.consumerHours).toLocaleString("en-IN")} consumer-hours affected across ${m.breakdowns.toLocaleString("en-IN")} rows.`;
    } else if (q.includes("summary") || q.includes("management")) {
      answer = `Management summary: ${m.breakdowns.toLocaleString("en-IN")} breakdown records, ${m.pending} pending/open, ${m.closed} closed/completed, ${Math.round(m.consumers).toLocaleString("en-IN")} consumers recorded affected, and ${Math.round(m.consumerHours).toLocaleString("en-IN")} consumer-hours affected. Top feeder: ${top("FEEDER",1)[0]?.name || "N/A"}.`;
    } else {
      answer = "I can answer questions about today's summary, pending/open work, feeder/grid/substation rankings, voltage-wise status, consumer impact, and SAIFI/SAIDI/CAIDI/ASAI using the current Google Sheet.";
    }

    return NextResponse.json({ answer, sourceRows: rows.length, readonly: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
