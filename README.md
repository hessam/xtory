# Xtory

**An interactive history atlas of Greater Iran — 4,000 years, no database, fully open source.**

🌍 **Live at [xtory.sbs](https://xtory.sbs)**

---

## What it is

Greater Iran — or Irānzamin — is a civilisational region stretching across modern Iran, Afghanistan, Tajikistan, Uzbekistan, parts of Iraq, Turkey, the Caucasus, and Central Asia. For four millennia it produced language, philosophy, art, and governance that shaped the world. No single tool showed this complexity honestly.

Xtory is an interactive map and timeline that lets anyone explore who ruled, who built, who fought, and what survived — across that entire region and that entire span of time. Not a textbook. Not a political argument. Just an honest, navigable record.

---

## How the data works

Historical data at this scale can't be entered by hand. Xtory uses AI to extract structured historical events from sources, then populates them into a flat JSON format that the frontend reads directly.

No database. No server. Every event, ruler, dynasty, and boundary is stored in JSON files — which means:
- Zero infrastructure cost to host
- Anyone can fork it, correct it, or extend it
- The entire dataset is auditable and version-controlled in git

Getting complex relational historical data — rulers, territories, overlapping dynasties, contested borders — to work at acceptable performance without a backend was the main architectural challenge.

---

## Stack

- **TypeScript** — 92.7% of the codebase
- **CSS** — custom styling, no framework
- **Data** — flat JSON, AI-assisted extraction
- **Hosting** — static, deployable anywhere

---

## Running locally

```bash
git clone https://github.com/hessam/xtory
cd xtory
npm install
npm run dev
```

---

## Contributing

The data is the heart of it. If you find an event that's wrong, missing, or misrepresented — open a PR. The curated dynasty-to-region data lives in `docs/historical_data/` (one JSON file per period, entries shaped like `{ region_id, dynasty_name, approximate_years_active, confidence }`), and the typed rulers, events, figures and regions are in `src/data/`.

All perspectives are welcome. The project has one rule: claims need a source.

---

## License

Open source. See `LICENSE` for details.

---

*Built by [Hessam](https://github.com/hessam) · Istanbul, Turkey*
