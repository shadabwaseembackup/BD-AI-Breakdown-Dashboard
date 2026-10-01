# BD AI Breakdown Dashboard

Static, read-only dashboard for the private Google Sheet master.

## Architecture

- GitHub repository + GitHub Pages
- Browser-side Google OAuth
- Google Sheets API read-only access
- No BD master dataset stored in GitHub
- No write access to the master Sheet

## Data source

- Sheet tab: BD
- Range: A:CG (85 columns)
- The browser reads the latest Sheet contents after Google authorization.

## Setup

1. Enable Google Sheets API in Google Cloud.
2. Create a Web OAuth Client ID.
3. Add the GitHub Pages site origin to Authorized JavaScript origins.
4. Open the deployed dashboard and enter the OAuth Client ID.
5. Sign in with a Google account that has Viewer access to the master Sheet.

## Local development

```bash
npm install
npm run dev
```

## Current dashboard

- Management KPI cards
- Grid / feeder / voltage filters
- Feeder and cause distributions
- Consumer impact and reliability indicators
- Read-only natural-language analyst
- Direct refresh from the Google Sheet
