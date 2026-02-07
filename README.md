# Rubric Checker

A lightweight rubric checker to quickly audit scores, verdicts, and grammar/spelling. Built with Next.js 14 for easy Vercel deployment.

## Features
- Paste rubric text and auto-parse into items (score / verdict / justification).
- Totals and quick stats (item count, wrong verdicts, grammar flags).
- Grammar checking via LanguageTool public HTTP endpoint.
- Sample rubric data included for fast testing.

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. No API key needed. The app uses the public LanguageTool HTTP endpoint at `https://api.languagetool.org/v2/check`.
   - If you want to switch to your own self-hosted LT server, change `DEFAULT_API_URL` in `app/api/grammar/route.ts`.
3. Run locally:
   ```bash
   npm run dev
   ```

## Deploying to Vercel
- Push this repo to GitHub, then import into Vercel.
- No env vars required for the default public LT endpoint.
- Build command: `npm run build`. Output: Next.js default.

## How parsing works
- Lines formatted as `some_key: value` are collected.
- Keys ending in `_score`, `_verdict`, `_justification` are grouped by their prefix (e.g., `Q2_A_1`).
- Totals sum every parsed `*_score` value; verdict stats count items containing `WRONG` (case-insensitive).

## Notes
- Grammar requests are proxied through `/api/grammar` to avoid CORS issues; the route always targets the public LT HTTP endpoint.
- All UI logic lives in `app/page.tsx`; parsing helper in `app/lib/parseRubric.ts`.
