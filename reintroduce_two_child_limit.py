"""
Reintroducing the two-child benefit cap in 2029: impact analysis

Reform UK's Robert Jenrick announced that a Reform government would
"restore the cap in full". This script calculates the impact of
reintroducing the two-child limit on Universal Credit from 2029-30.

Baseline: Current law (two-child limit removed from April 2026,
          as per Autumn Budget 2025 / policyengine-uk 2.63+)
Reform:   Reintroduce two-child limit (child_count = 2) from 2029

Outputs:
    - Budgetary impact (savings to Treasury)
    - Distributional impact by income decile (relative + absolute)
    - Poverty impact (child + overall, BHC + AHC, absolute + relative)
    - Inequality (Gini index change)
    - Constituency impacts (top/bottom 20)

Usage:
    python scripts/reintroduce_two_child_limit.py
"""

from pathlib import Path

import h5py
import numpy as np
import pandas as pd
from microdf import MicroSeries
from policyengine_uk import Microsimulation

# Years to analyse - 2029 and 2030 represent fiscal years 2029-30 and 2030-31
YEARS = [2029, 2030]

# Output directory – write straight into the dashboard's public/data folder
# so that running this script is all that's needed to refresh the dashboard.
OUTPUT_DIR = Path(__file__).resolve().parent / "public" / "data"


def create_simulations():
    """Create baseline (current law) and reform (reintroduce cap) simulations.

    Baseline: Current law - two-child limit removed (policyengine-uk default)
    Reform: Reintroduce two-child limit (child_count = 2)
    """
    print("Creating simulations...")

    # Baseline: current law (no two-child limit from April 2026)
    baseline = Microsimulation()

    # Reform: reintroduce two-child limit from 2029
    # Also turn off the Scottish Two Child Limit Payment, since the Scottish
    # Government said it "is no longer needed" after the UK-wide abolition.
    # If the two-child limit is reintroduced, we assume the TCLP stays off.
    reform = Microsimulation(
        reform={
            "gov.dwp.universal_credit.elements.child.limit.child_count": {
                "2029-01-01": 2,
                "2030-01-01": 2,
            },
            "gov.dwp.tax_credits.child_tax_credit.limit.child_count": {
                "2029-01-01": 2,
                "2030-01-01": 2,
            },
            "gov.social_security_scotland.two_child_limit_payment.in_effect": {
                "2029-01-01": False,
                "2030-01-01": False,
            },
        }
    )

    return baseline, reform


def calculate_budgetary_impact(baseline, reform):
    """Calculate budgetary impact (change in government balance)."""
    print("\nCalculating budgetary impact...")
    results = []

    for year in YEARS:
        baseline_balance = baseline.calculate("gov_balance", year).sum()
        reform_balance = reform.calculate("gov_balance", year).sum()
        impact_bn = (reform_balance - baseline_balance) / 1e9

        results.append({
            "year": f"{year}-{str(year + 1)[-2:]}",
            "budgetary_impact_bn": round(impact_bn, 2),
        })
        print(f"  {year}-{str(year + 1)[-2:]}: £{impact_bn:+.2f}bn")

    return pd.DataFrame(results)


def calculate_headcounts(baseline, reform):
    """Calculate headcounts: households and people affected, total population.

    A household is 'affected' if its net income changes by more than £1/year.
    """
    print("\nCalculating headcounts...")
    results = []

    for year in YEARS:
        fiscal_year = f"{year}-{str(year + 1)[-2:]}"

        # sim.calculate() returns MicroSeries with weights - no manual weight handling
        baseline_income = baseline.calculate(
            "household_net_income", period=year, map_to="household"
        )
        reform_income = reform.calculate(
            "household_net_income", period=year, map_to="household"
        )
        hh_count_people = baseline.calculate(
            "household_count_people", period=year, map_to="household"
        )

        # MicroSeries subtraction preserves weights
        income_change = reform_income - baseline_income
        affected = np.abs(np.array(income_change)) > 1  # more than £1/yr

        total_households = income_change.count()
        affected_households = income_change[affected].count()

        total_people = hh_count_people.sum()
        affected_people = hh_count_people[affected].sum()

        # Children in affected households
        num_children = baseline.calculate(
            "num_children", period=year, map_to="household"
        )
        total_children = num_children.sum()

        # Only count children beyond the 2nd in affected households
        # (the ones who directly lose benefit entitlement)
        extra_children = np.maximum(0, np.array(num_children) - 2)
        extra_ms = MicroSeries(extra_children, weights=income_change.weights.values)
        affected_children = extra_ms[affected].sum()

        # Average loss per affected household
        avg_loss_per_affected_hh = (
            income_change[affected].mean() if affected.sum() > 0 else 0
        )

        results.append({
            "year": fiscal_year,
            "total_households": round(total_households),
            "affected_households": round(affected_households),
            "total_people": round(total_people),
            "affected_people": round(affected_people),
            "total_children": round(total_children),
            "affected_children": round(affected_children),
            "pct_households_affected": round(
                affected_households / total_households * 100, 1
            ),
            "pct_people_affected": round(
                affected_people / total_people * 100, 1
            ),
            "pct_children_affected": round(
                affected_children / total_children * 100, 1
            ) if total_children > 0 else 0,
            "avg_loss_per_affected_hh": round(avg_loss_per_affected_hh, 2),
        })

        print(f"  {fiscal_year}:")
        print(f"    Total population: {total_people:,.0f}")
        print(f"    Total households: {total_households:,.0f}")
        print(f"    Total children: {total_children:,.0f}")
        print(f"    Affected households: {affected_households:,.0f} ({affected_households/total_households*100:.1f}%)")
        print(f"    Affected people: {affected_people:,.0f} ({affected_people/total_people*100:.1f}%)")
        print(f"    Affected children: {affected_children:,.0f} ({affected_children/total_children*100:.1f}%)")
        print(f"    Avg loss per affected HH: £{avg_loss_per_affected_hh:,.0f}/yr")

    return pd.DataFrame(results)


def calculate_distributional_impact(baseline, reform):
    """Calculate distributional impact by income decile."""
    print("\nCalculating distributional impact...")
    results = []

    for year in YEARS:
        # sim.calculate() returns MicroSeries with weights
        baseline_income = baseline.calculate(
            "household_net_income", period=year, map_to="household"
        )
        reform_income = reform.calculate(
            "household_net_income", period=year, map_to="household"
        )
        income_decile = baseline.calculate(
            "household_income_decile", period=year, map_to="household"
        )

        # MicroSeries subtraction preserves weights, .mean()/.sum() are weighted
        change = reform_income - baseline_income

        for d in range(1, 11):
            decile_mask = np.array(income_decile) == d
            if not decile_mask.any():
                continue

            avg_change = change[decile_mask].mean()
            avg_baseline = baseline_income[decile_mask].mean()
            rel_change = (
                (avg_change / avg_baseline) * 100
                if avg_baseline > 0
                else 0
            )

            results.append({
                "year": f"{year}-{str(year + 1)[-2:]}",
                "decile": d,
                "avg_change_gbp": round(avg_change, 2),
                "relative_change_pct": round(rel_change, 4),
            })

    return pd.DataFrame(results)


def calculate_poverty_impact(baseline, reform):
    """Calculate poverty impact by age group and measure.

    Measures: Absolute and Relative poverty (BHC and AHC).
    Groups: children (age < 18), all.
    """
    print("\nCalculating poverty impact...")

    def add_poverty_rows(results, fiscal_year, measure_name, baseline_pov, reform_pov, is_child):
        """Add Children and All rows for a given poverty measure."""
        for group, mask in [("Children", is_child), ("All", None)]:
            if mask is not None:
                baseline_rate = baseline_pov[mask].mean() * 100
                reform_rate = reform_pov[mask].mean() * 100
            else:
                baseline_rate = baseline_pov.mean() * 100
                reform_rate = reform_pov.mean() * 100

            change_pp = reform_rate - baseline_rate
            change_pct = (
                (change_pp / baseline_rate) * 100
                if baseline_rate > 0
                else 0
            )

            results.append({
                "year": fiscal_year,
                "measure": measure_name,
                "group": group,
                "baseline_rate_pct": round(baseline_rate, 2),
                "reform_rate_pct": round(reform_rate, 2),
                "change_pp": round(change_pp, 2),
                "change_pct": round(change_pct, 1),
            })

    results = []

    for year in YEARS:
        fiscal_year = f"{year}-{str(year + 1)[-2:]}"

        # sim.calculate() returns MicroSeries with weights
        age = baseline.calculate("age", period=year, map_to="person")
        is_child = np.array(age) < 18

        for housing_cost in ["bhc", "ahc"]:
            hc_label = housing_cost.upper()

            for poverty_type in ["absolute", "relative"]:
                # Variable names follow the Scottish MetricsCalculator pattern
                if poverty_type == "absolute":
                    poverty_var = f"in_poverty_{housing_cost}"
                else:
                    poverty_var = f"in_relative_poverty_{housing_cost}"

                measure_name = f"{poverty_type.title()} {hc_label}"
                baseline_pov = baseline.calculate(
                    poverty_var, period=year, map_to="person"
                )
                reform_pov = reform.calculate(
                    poverty_var, period=year, map_to="person"
                )
                add_poverty_rows(
                    results, fiscal_year, measure_name,
                    baseline_pov, reform_pov, is_child,
                )

    return pd.DataFrame(results)


def calculate_inequality_impact(baseline, reform):
    """Calculate Gini index change."""
    print("\nCalculating inequality impact...")
    results = []

    for year in YEARS:
        # sim.calculate() returns MicroSeries with weights
        baseline_equiv = baseline.calculate(
            "equiv_household_net_income", period=year, map_to="household"
        )
        reform_equiv = reform.calculate(
            "equiv_household_net_income", period=year, map_to="household"
        )
        hh_count = baseline.calculate(
            "household_count_people", period=year, map_to="household"
        )

        # Person-weight the household data for Gini (weight by household size)
        adjusted_weights = baseline_equiv.weights.values * np.array(hh_count)

        baseline_gini = MicroSeries(
            np.maximum(np.array(baseline_equiv), 0), weights=adjusted_weights
        ).gini()
        reform_gini = MicroSeries(
            np.maximum(np.array(reform_equiv), 0), weights=adjusted_weights
        ).gini()

        gini_change_pct = (
            (reform_gini - baseline_gini) / baseline_gini
        ) * 100

        fiscal_year = f"{year}-{str(year + 1)[-2:]}"
        results.append({
            "year": fiscal_year,
            "baseline_gini": round(baseline_gini, 6),
            "reform_gini": round(reform_gini, 6),
            "gini_change_pct": round(gini_change_pct, 2),
        })
        print(f"  {fiscal_year}: Gini change {gini_change_pct:+.2f}%")

    return pd.DataFrame(results)


def calculate_constituency_impact(baseline, reform):
    """Calculate constituency-level impacts."""
    print("\nCalculating constituency impacts...")

    weights_path = Path("data/parliamentary_constituency_weights.h5")
    constituencies_path = Path("data_inputs/constituencies_2024.csv")

    if not weights_path.exists() or not constituencies_path.exists():
        print("  Constituency data not found, skipping.")
        return pd.DataFrame()

    with h5py.File(weights_path, "r") as f:
        constituency_weights = f["2025"][...]

    constituency_df = pd.read_csv(constituencies_path)

    results = []

    for year in YEARS:
        baseline_income = baseline.calculate(
            "household_net_income", period=year, map_to="household"
        ).values
        reform_income = reform.calculate(
            "household_net_income", period=year, map_to="household"
        ).values

        fiscal_year = f"{year}-{str(year + 1)[-2:]}"

        for i in range(len(constituency_df)):
            name = constituency_df.iloc[i]["name"]
            code = constituency_df.iloc[i]["code"]
            weight = constituency_weights[i]

            baseline_ms = MicroSeries(baseline_income, weights=weight)
            reform_ms = MicroSeries(reform_income, weights=weight)

            avg_change = (
                reform_ms.sum() - baseline_ms.sum()
            ) / baseline_ms.count()
            avg_baseline = baseline_ms.sum() / baseline_ms.count()
            rel_change = (
                (avg_change / avg_baseline) * 100
                if avg_baseline > 0
                else 0
            )

            results.append({
                "year": fiscal_year,
                "constituency_code": code,
                "constituency_name": name,
                "avg_change_gbp": round(avg_change, 2),
                "relative_change_pct": round(rel_change, 4),
            })

    return pd.DataFrame(results)


def print_summary(
    budgetary_df,
    headcounts_df,
    distributional_df,
    poverty_df,
    inequality_df,
    constituency_df,
):
    """Print summary results."""
    print("\n" + "=" * 70)
    print("REINTRODUCING THE TWO-CHILD BENEFIT CAP FROM 2029")
    print("=" * 70)

    print("\n--- BUDGETARY IMPACT ---")
    print(budgetary_df.to_string(index=False))

    print("\n--- HEADCOUNTS ---")
    if not headcounts_df.empty:
        print(headcounts_df.to_string(index=False))

    # Use the last year for detailed breakdowns
    last_year = f"{YEARS[-1]}-{str(YEARS[-1] + 1)[-2:]}"

    print(f"\n--- DISTRIBUTIONAL IMPACT ({last_year}) ---")
    year_data = distributional_df[distributional_df["year"] == last_year]
    if not year_data.empty:
        print(year_data[
            ["decile", "avg_change_gbp", "relative_change_pct"]
        ].to_string(index=False))

    print("\n--- POVERTY IMPACT ---")
    if not poverty_df.empty:
        print(poverty_df.to_string(index=False))

    print("\n--- INEQUALITY IMPACT ---")
    if not inequality_df.empty:
        print(inequality_df.to_string(index=False))

    if not constituency_df.empty:
        print(f"\n--- CONSTITUENCY IMPACT ({last_year}, top 20 hardest hit) ---")
        year_const = constituency_df[
            constituency_df["year"] == last_year
        ].sort_values("avg_change_gbp")
        if not year_const.empty:
            print(year_const.head(20)[[
                "constituency_name", "avg_change_gbp", "relative_change_pct"
            ]].to_string(index=False))

        print(f"\n--- CONSTITUENCY IMPACT ({last_year}, 20 least affected) ---")
        print(year_const.tail(20)[[
            "constituency_name", "avg_change_gbp", "relative_change_pct"
        ]].to_string(index=False))


def main():
    print("=" * 70)
    print("Reform UK two-child benefit cap reintroduction analysis")
    print("=" * 70)
    print("\nBaseline: Current law (two-child limit removed, Autumn Budget 2025)")
    print("Reform:   Reintroduce two-child limit (child_count = 2) from 2029")
    print(f"Years:    {', '.join(f'{y}-{str(y + 1)[-2:]}' for y in YEARS)}")
    print()

    # Create output directory
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Create simulations (shared across all calculations)
    baseline, reform = create_simulations()

    # Run all calculations
    budgetary_df = calculate_budgetary_impact(baseline, reform)
    headcounts_df = calculate_headcounts(baseline, reform)
    distributional_df = calculate_distributional_impact(baseline, reform)
    poverty_df = calculate_poverty_impact(baseline, reform)
    inequality_df = calculate_inequality_impact(baseline, reform)
    constituency_df = calculate_constituency_impact(baseline, reform)

    # Print summary
    print_summary(
        budgetary_df,
        headcounts_df,
        distributional_df,
        poverty_df,
        inequality_df,
        constituency_df,
    )

    # Save CSVs
    budgetary_df.to_csv(OUTPUT_DIR / "budgetary.csv", index=False)
    headcounts_df.to_csv(OUTPUT_DIR / "headcounts.csv", index=False)
    distributional_df.to_csv(OUTPUT_DIR / "distributional.csv", index=False)
    poverty_df.to_csv(OUTPUT_DIR / "poverty.csv", index=False)
    inequality_df.to_csv(OUTPUT_DIR / "inequality.csv", index=False)
    if not constituency_df.empty:
        constituency_df.to_csv(
            OUTPUT_DIR / "constituency.csv", index=False
        )

    print(f"\n{'=' * 70}")
    print(f"Results saved to {OUTPUT_DIR}/")
    print(f"{'=' * 70}")


if __name__ == "__main__":
    main()
