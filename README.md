# Restoring the Two-Child Benefit Limit: Impact Analysis

**[Live Dashboard](https://uk-two-child-limit-reintroduction.vercel.app)**

This repository contains a PolicyEngine analysis of Reform UK's proposal to restore the two-child benefit cap from 2029-30. The cap, originally introduced in 2017, limits Universal Credit and Child Tax Credit child elements to a family's first two children. It was removed from April 2026 as part of the Autumn Budget 2025.

## What it covers

- **Budgetary impact** — estimated Treasury savings from restoring the cap
- **Affected households and children** — headcounts and share of population affected
- **Distributional impact** — income changes by household income decile
- **Poverty impact** — changes in absolute child and overall poverty rates (BHC and AHC)
- **Inequality impact** — Gini index changes
- **Constituency impact** — interactive map of average income changes by parliamentary constituency

## How it works

1. **`reintroduce_two_child_limit.py`** runs a microsimulation using [PolicyEngine UK](https://github.com/PolicyEngine/policyengine-uk), comparing current law (no two-child limit) against a reform that reintroduces it from 2029. It outputs CSV files to `public/data/`.

2. **The React dashboard** (`src/`) fetches those CSV files at runtime and renders all tables, charts, and narrative text dynamically. Re-running the Python script and pushing updated CSVs is all that's needed to refresh the dashboard.

## Running the analysis

```bash
# Install Python dependencies
pip install policyengine-uk microdf h5py

# Run the microsimulation (outputs to public/data/)
python reintroduce_two_child_limit.py
```

## Running the dashboard locally

```bash
npm install
npm run dev
```

## Deployment

The dashboard is deployed on [Vercel](https://uk-two-child-limit-reintroduction.vercel.app) and auto-deploys when changes are pushed to the `main` branch.
