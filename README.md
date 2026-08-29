# Haber

Haber is a privacy-minded personal-finance interface for keeping PEN and USD activity separate, reviewing imported transactions, setting budgets, and exploring simple reports.

The public demo uses synthetic transactions only. It contains no bank statements, account identifiers, customer names, private spreadsheets, API keys, or deployment secrets. Files imported in the demo are processed in the visitor's browser and saved to that browser's local storage.

## Local development

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

## Checks

```bash
npm run lint
npm run build
```

The `main` branch is deployed automatically to GitHub Pages by the workflow in `.github/workflows/pages.yml`.

## Privacy rules

- Never commit `.env` files, credentials, bank statements, transaction exports, or real customer data.
- Keep public fixtures synthetic and clearly labeled as demo data.
- Treat any imported financial file as sensitive, even when it contains redacted values.

See [SECURITY.md](SECURITY.md) before publishing changes.
