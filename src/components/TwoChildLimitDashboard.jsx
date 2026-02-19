import { useState, useEffect, useRef } from "react";
import "./TwoChildLimitDashboard.css";

const COLORS = {
  negative: "#DC2626",
};

const sections = [
  { id: "budgetary", label: "Budget" },
  { id: "headcounts", label: "Headcounts" },
  { id: "distributional", label: "Deciles" },
  { id: "poverty", label: "Poverty" },
  { id: "inequality", label: "Inequality" },
  { id: "constituency", label: "Map" },
  { id: "conclusion", label: "Conclusion" },
];

/* ── CSV parser (handles quoted fields with commas) ─────────────── */
function splitCSVLine(line) {
  const cols = [];
  let cur = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === "," && !inQuotes) { cols.push(cur); cur = ""; }
    else { cur += ch; }
  }
  cols.push(cur);
  return cols;
}

function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = splitCSVLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = splitCSVLine(line);
    const row = {};
    headers.forEach((h, i) => {
      const v = (values[i] || "").trim();
      row[h] = v !== "" && !isNaN(v) ? parseFloat(v) : v;
    });
    return row;
  });
}

/* ── Formatting helpers ─────────────────────────────────────────── */
function fmtBn(v) {
  return `£${Math.abs(v).toFixed(1)}bn`;
}

function fmtBnLong(v) {
  return `£${Math.abs(v).toFixed(1)} billion`;
}

function fmtCount(v) {
  const abs = Math.abs(v);
  return `${(abs / 1e6).toFixed(1)}m`;
}

function fmtCountLong(v) {
  const abs = Math.abs(v);
  return `${(abs / 1e6).toFixed(1)} million`;
}

function fmtPct(v) {
  return `${v.toFixed(1)}%`;
}

function fmtGbp(v) {
  return `£${Math.abs(v).toFixed(0)}`;
}

function roundedChange(baseline, reform) {
  const b = parseFloat(baseline.toFixed(1));
  const r = parseFloat(reform.toFixed(1));
  return (r - b).toFixed(1);
}

function ordinal(n) {
  const words = [
    "first", "second", "third", "fourth", "fifth",
    "sixth", "seventh", "eighth", "ninth", "tenth",
  ];
  return words[n - 1] || `${n}th`;
}

function formatList(items) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/* ── Component ──────────────────────────────────────────────────── */
export default function TwoChildLimitDashboard() {
  const [activeSection, setActiveSection] = useState("budgetary");
  const [data, setData] = useState(null);
  const sectionRefs = {
    budgetary: useRef(null),
    headcounts: useRef(null),
    distributional: useRef(null),
    poverty: useRef(null),
    inequality: useRef(null),
    constituency: useRef(null),
    conclusion: useRef(null),
  };

  // Fetch all CSV data on mount
  useEffect(() => {
    async function fetchAll() {
      const urls = {
        budgetary: "/data/budgetary.csv",
        headcounts: "/data/headcounts.csv",
        distributional: "/data/distributional.csv",
        poverty: "/data/poverty.csv",
        inequality: "/data/inequality.csv",
        constituency: "/data/constituency.csv",
      };
      const results = {};
      await Promise.all(
        Object.entries(urls).map(async ([key, url]) => {
          try {
            const resp = await fetch(url);
            if (resp.ok) results[key] = parseCSV(await resp.text());
          } catch (e) {
            console.error(`Failed to load ${key}:`, e);
          }
        })
      );
      setData(results);
    }
    fetchAll();
  }, []);

  // Scroll spy – re-attach when data loads so section refs are in the DOM
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { root: null, rootMargin: "-20% 0px -60% 0px", threshold: 0 }
    );
    Object.values(sectionRefs).forEach((ref) => {
      if (ref.current) observer.observe(ref.current);
    });
    return () => observer.disconnect();
  }, [data]);

  /* ── Loading state ──────────────────────────────────────────── */
  if (!data || !data.budgetary) {
    return (
      <div className="narrative-container">
        <header className="narrative-hero">
          <h1>Restoring the two-child benefit limit</h1>
        </header>
        <p className="api-loading">Loading data…</p>
      </div>
    );
  }

  /* ── Derived data ───────────────────────────────────────────── */
  const { budgetary, headcounts, distributional, poverty, inequality, constituency } = data;
  const years = budgetary.map((r) => r.year);
  const firstYear = years[0];
  const lastYear = years[years.length - 1];

  const b0 = budgetary[0];
  const h0 = headcounts?.[0];
  const iq0 = inequality?.[0];

  // Poverty grouped by demographic
  const childPov = poverty?.filter((r) => r.group === "Children") || [];
  const allPov = poverty?.filter((r) => r.group === "All") || [];

  // First-year child poverty rows
  const childBhcFirst = childPov.find((r) => r.year === firstYear && r.measure === "Absolute BHC");
  const childAhcFirst = childPov.find((r) => r.year === firstYear && r.measure === "Absolute AHC");
  const childAhcLast = childPov.find((r) => r.year === lastYear && r.measure === "Absolute AHC");

  // Distributional: hardest-hit decile for first year
  const firstYearDist = distributional?.filter((r) => r.year === firstYear) || [];
  const worstDecile = firstYearDist.reduce(
    (worst, r) => (r.relative_change_pct < (worst?.relative_change_pct ?? 0) ? r : worst),
    null
  );
  const worstDecileLast = distributional?.find(
    (r) => r.year === lastYear && r.decile === worstDecile?.decile
  );

  // Deciles with near-zero change
  const zeroDeciles = firstYearDist
    .filter((r) => Math.abs(r.avg_change_gbp) < 1)
    .map((r) => r.decile)
    .sort((a, b) => a - b);
  const zeroDecilesText =
    zeroDeciles.length > 1
      ? `deciles ${zeroDeciles[0]} to ${zeroDeciles[zeroDeciles.length - 1]}`
      : zeroDeciles.length === 1
        ? `decile ${zeroDeciles[0]}`
        : "";

  const affectedDecileCount = firstYearDist.filter((r) => Math.abs(r.avg_change_gbp) >= 1).length;

  // Top constituencies (biggest losses)
  const topConst = constituency
    ? constituency
        .filter((r) => r.year === firstYear)
        .sort((a, b) => a.avg_change_gbp - b.avg_change_gbp)
        .slice(0, 5)
    : [];

  // Summary strings
  const budgetSummary = budgetary
    .map((r) => `${fmtBnLong(r.budgetary_impact_bn)} in ${r.year}`)
    .join(" and ");
  const ineqSummary = inequality
    ? inequality.map((r) => `${r.gini_change_pct.toFixed(1)}% in ${r.year}`).join(" and ")
    : "";

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <div className="narrative-container">
      {/* Hero Section */}
      <header className="narrative-hero">
        <h1>Restoring the two-child benefit limit</h1>
      </header>

      {/* Introduction */}
      <section className="narrative-section">
        <h2>Introduction</h2>
        <p>
          Robert Jenrick, Reform UK's economy spokesperson,{" "}
          <a href="https://www.lbc.co.uk/article/reform-restore-two-child-benefit-cap-jenrick-5HjdSWh_2/">
            announced
          </a>{" "}
          on 18 February 2026 that Reform UK would restore the two-child benefit
          cap, citing an estimated cost of around £3 billion a year by 2029. The
          cap, originally introduced in 2017, limits Universal Credit and Child
          Tax Credit child elements to a family's first two children born after
          April 2017. Chancellor Rachel Reeves removed the cap from April 2026
          as part of the{" "}
          <a href="https://www.policyengine.org/uk/autumn-budget-2025">
            Autumn Budget 2025
          </a>
          .
        </p>
        <p>
          In this analysis, we{" "}
          <a href="https://gist.github.com/vahid-ahmadi/e1910e3120bbae130584dfcf221ec461">
            examine
          </a>{" "}
          the impact of restoring the two-child limit on government spending,
          income distribution, poverty rates, income inequality, and geographic
          variation across parliamentary constituencies.
        </p>
      </section>

      {/* ── Budgetary impact ──────────────────────────────────── */}
      <section
        id="budgetary"
        ref={sectionRefs.budgetary}
        className="narrative-section"
      >
        <h2>Budgetary impact</h2>
        <p>
          PolicyEngine{" "}
          <a href="https://gist.github.com/vahid-ahmadi/e1910e3120bbae130584dfcf221ec461">
            estimates
          </a>{" "}
          that restoring the two-child limit would save the government{" "}
          {budgetSummary}.
        </p>
        <p className="table-caption">Table 1: Budgetary impact</p>
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Year</th>
                <th>Government savings</th>
              </tr>
            </thead>
            <tbody>
              {budgetary.map((r) => (
                <tr key={r.year}>
                  <td>{r.year}</td>
                  <td>{fmtBn(r.budgetary_impact_bn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Affected households and children ───────────────────── */}
      {headcounts && (
        <section
          id="headcounts"
          ref={sectionRefs.headcounts}
          className="narrative-section"
        >
          <h2>Affected households and children</h2>
          <p>
            The reform would affect {fmtCountLong(h0.affected_households)}{" "}
            households and {fmtCountLong(h0.affected_children)} children (
            {fmtPct(h0.pct_children_affected)} of all children) in {h0.year}.
            Affected children are those beyond the second child in each
            household — the ones who directly lose benefit entitlement under
            the cap.
          </p>
          <p className="table-caption">
            Table 2: Affected households and children
          </p>
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Affected households</th>
                  <th>Affected children</th>
                  <th>Share of all children (%)</th>
                </tr>
              </thead>
              <tbody>
                {headcounts.map((r) => (
                  <tr key={r.year}>
                    <td>{r.year}</td>
                    <td>{fmtCount(r.affected_households)}</td>
                    <td>{fmtCount(r.affected_children)}</td>
                    <td>{fmtPct(r.pct_children_affected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Distributional impact ──────────────────────────────── */}
      {distributional && worstDecile && (
        <section
          id="distributional"
          ref={sectionRefs.distributional}
          className="narrative-section"
        >
          <h2>Distributional impact</h2>
          <p>
            By income decile, restoring the two-child limit would cause the
            largest income losses for the {ordinal(worstDecile.decile)} decile.
            In relative terms, the {ordinal(worstDecile.decile)} decile loses{" "}
            {fmtPct(Math.abs(worstDecile.relative_change_pct))} of household
            income in {firstYear}. In absolute terms, this amounts to{" "}
            {fmtGbp(worstDecile.avg_change_gbp)} per year. Figure 1 shows both
            relative and absolute changes by decile, with a toggle to switch
            between views and year buttons to compare {years.join(" and ")}.
          </p>

          <p className="figure-caption">
            Figure 1: Change in household income by income decile
          </p>
          <iframe
            src="/distributional-impact.html"
            width="100%"
            height="530"
            frameBorder="0"
            style={{ border: "none" }}
            title="Distributional impact chart"
          />

          <p>
            The losses decline for higher deciles
            {zeroDecilesText && `, with ${zeroDecilesText} seeing no change`}.
            {worstDecileLast && years.length > 1 && (
              <>
                {" "}
                By {lastYear}, the {ordinal(worstDecile.decile)} decile's loss{" "}
                {Math.abs(worstDecileLast.avg_change_gbp) >
                Math.abs(worstDecile.avg_change_gbp)
                  ? "increases"
                  : "changes"}{" "}
                to {fmtGbp(worstDecileLast.avg_change_gbp)} per year.
              </>
            )}
          </p>
        </section>
      )}

      {/* ── Poverty impact ─────────────────────────────────────── */}
      {poverty && poverty.length > 0 && (
        <section
          id="poverty"
          ref={sectionRefs.poverty}
          className="narrative-section"
        >
          <h2>Poverty impact</h2>
          <p>
            Restoring the two-child limit would increase absolute poverty rates,
            with the largest effect on children. We measure poverty both before
            housing costs (BHC) and after housing costs (AHC).
          </p>

          <p className="table-caption">
            Table 3: Change in absolute child poverty rates
          </p>
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Measure</th>
                  <th>Baseline</th>
                  <th>Reform</th>
                  <th>Change (pp)</th>
                </tr>
              </thead>
              <tbody>
                {childPov.map((r, i) => (
                  <tr key={i}>
                    <td>{r.year}</td>
                    <td>{r.measure.replace("Absolute ", "")}</td>
                    <td>{fmtPct(r.baseline_rate_pct)}</td>
                    <td>{fmtPct(r.reform_rate_pct)}</td>
                    <td
                      style={{
                        color: r.change_pp > 0 ? COLORS.negative : undefined,
                        fontWeight: 600,
                      }}
                    >
                      {r.change_pp > 0 ? "+" : ""}
                      {roundedChange(r.baseline_rate_pct, r.reform_rate_pct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="table-caption">
            Table 4: Change in absolute poverty rates (all people)
          </p>
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Measure</th>
                  <th>Baseline</th>
                  <th>Reform</th>
                  <th>Change (pp)</th>
                </tr>
              </thead>
              <tbody>
                {allPov.map((r, i) => (
                  <tr key={i}>
                    <td>{r.year}</td>
                    <td>{r.measure.replace("Absolute ", "")}</td>
                    <td>{fmtPct(r.baseline_rate_pct)}</td>
                    <td>{fmtPct(r.reform_rate_pct)}</td>
                    <td
                      style={{
                        color: r.change_pp > 0 ? COLORS.negative : undefined,
                        fontWeight: 600,
                      }}
                    >
                      {r.change_pp > 0 ? "+" : ""}
                      {roundedChange(r.baseline_rate_pct, r.reform_rate_pct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {childBhcFirst && (
            <p>
              In {firstYear}, absolute child poverty (BHC) would increase by{" "}
              {roundedChange(childBhcFirst.baseline_rate_pct, childBhcFirst.reform_rate_pct)} percentage points, from{" "}
              {fmtPct(childBhcFirst.baseline_rate_pct)} to{" "}
              {fmtPct(childBhcFirst.reform_rate_pct)}.
              {childAhcFirst &&
                ` After housing costs, child poverty would increase by ${roundedChange(childAhcFirst.baseline_rate_pct, childAhcFirst.reform_rate_pct)} percentage points, from ${fmtPct(childAhcFirst.baseline_rate_pct)} to ${fmtPct(childAhcFirst.reform_rate_pct)}.`}
              {childAhcLast &&
                years.length > 1 &&
                ` By ${lastYear}, the after housing costs child poverty increase grows to ${roundedChange(childAhcLast.baseline_rate_pct, childAhcLast.reform_rate_pct)} percentage points.`}
            </p>
          )}
        </section>
      )}

      {/* ── Inequality impact ──────────────────────────────────── */}
      {inequality && inequality.length > 0 && (
        <section
          id="inequality"
          ref={sectionRefs.inequality}
          className="narrative-section"
        >
          <h2>Inequality impact</h2>
          <p>
            Restoring the two-child limit would increase income inequality. The
            Gini index would rise by {ineqSummary}.
          </p>

          <p className="table-caption">Table 5: Change in Gini index</p>
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {inequality.map((r) => (
                  <tr key={r.year}>
                    <td>{r.year}</td>
                    <td
                      style={{
                        color:
                          r.gini_change_pct > 0 ? COLORS.negative : undefined,
                        fontWeight: 600,
                      }}
                    >
                      {r.gini_change_pct > 0 ? "+" : ""}
                      {r.gini_change_pct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Constituency impact ────────────────────────────────── */}
      <section
        id="constituency"
        ref={sectionRefs.constituency}
        className="narrative-section"
      >
        <h2>Constituency impact</h2>
        <p>
          The impact of restoring the two-child limit varies across
          parliamentary constituencies, as shown in Figure 2.
        </p>

        <p className="figure-caption">
          Figure 2: Average income change by parliamentary constituency
        </p>
        <iframe
          src="/constituency_map.html"
          width="100%"
          height="600"
          frameBorder="0"
          style={{ border: "none" }}
          title="Constituency impact map"
        />

        {topConst.length > 0 && (
          <p>
            The constituencies experiencing the largest average income losses
            include{" "}
            {topConst.map((c, i) => {
              const part = `${c.constituency_name} (${fmtGbp(c.avg_change_gbp)})`;
              if (topConst.length === 1) return part;
              if (topConst.length === 2) {
                return i === 0 ? `${part} ` : `and ${part}`;
              }
              if (i === topConst.length - 1) return `and ${part}`;
              return `${part}, `;
            })}
            . Scottish constituencies show smaller impacts because
            the{" "}
            <a
              href="https://www.socialsecurity.gov.scot/scottish-child-payment"
              target="_blank"
              rel="noopener noreferrer"
            >
              Scottish Child Payment
            </a>{" "}
            — paid for every eligible child with no two-child limit —
            genuinely reduces the impact of the cap for Scottish families.
          </p>
        )}
      </section>

      {/* ── Conclusion ─────────────────────────────────────────── */}
      <section
        id="conclusion"
        ref={sectionRefs.conclusion}
        className="narrative-section"
      >
        <h2>Conclusion</h2>
        <p>
          PolicyEngine estimates that restoring the two-child benefit cap would
          save the government {fmtBnLong(b0.budgetary_impact_bn)} in {b0.year}
          {h0 && (
            <>
              , affecting {fmtCountLong(h0.affected_households)} households and{" "}
              {fmtCountLong(h0.affected_children)} children beyond the second
              child ({fmtPct(h0.pct_children_affected)} of all children)
            </>
          )}
          .
          {childBhcFirst && (
            <>
              {" "}
              Absolute child poverty (BHC) would increase by{" "}
              {roundedChange(childBhcFirst.baseline_rate_pct, childBhcFirst.reform_rate_pct)} percentage points, from{" "}
              {fmtPct(childBhcFirst.baseline_rate_pct)} to{" "}
              {fmtPct(childBhcFirst.reform_rate_pct)}
            </>
          )}
          {iq0 && <>, and the Gini index would rise by {iq0.gini_change_pct.toFixed(1)}%</>}
          .
          {worstDecile && (
            <>
              {" "}
              The reform would reduce incomes for the lowest{" "}
              {affectedDecileCount} income deciles, with the{" "}
              {ordinal(worstDecile.decile)} decile losing{" "}
              {fmtPct(Math.abs(worstDecile.relative_change_pct))} of household
              income on average.
            </>
          )}
          {topConst.length >= 3 && (
            <>
              {" "}
              {formatList(topConst.slice(0, 3).map((c) => c.constituency_name))}{" "}
              would be the most affected constituencies.
            </>
          )}
        </p>
      </section>

      {/* Scroll Spy Navigation */}
      <nav className="scroll-spy">
        {sections.map((section) => (
          <button
            key={section.id}
            className={`scroll-spy-item ${activeSection === section.id ? "active" : ""}`}
            onClick={() =>
              document
                .getElementById(section.id)
                ?.scrollIntoView({ behavior: "smooth" })
            }
            aria-label={`Go to ${section.label}`}
          >
            <span className="scroll-spy-label">{section.label}</span>
            <span className="scroll-spy-dot" />
          </button>
        ))}
      </nav>
    </div>
  );
}
