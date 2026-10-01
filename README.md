# BD AI Breakdown Dashboard

Read-only Next.js dashboard for the master Google Sheet.

## Data source

The production app reads the Sheet server-side through the Google Sheets API. The full BD dataset is **not stored in this repository**.

Default range:
- Sheet tab: BD
- Columns: A:CG (85 columns)

## Required Vercel environment variables

- GOOGLE_SHEET_ID
- GOOGLE_SHEET_RANGE
- GOOGLE_SERVICE_ACCOUNT_EMAIL
- GOOGLE_PRIVATE_KEY

Share the master Google Sheet with the service-account email as **Viewer**. The application requests the readonly Sheets scope only.

## Local development

```bash
npm install
npm run dev
```

## Current implementation

- Live read-only Google Sheets ingestion
- Management KPI cards
- Feeder and voltage distribution
- Reliability indicators
- Natural-language analyst endpoint
- No master-data files committed to GitHub

Next implementation stages:
1. authentication/private access
2. management filters
3. trend charts and FY/month comparison
4. feeder watchlist and repeat-breakdown analytics
5. advanced AI query layer
6. Vercel deployment and verification
