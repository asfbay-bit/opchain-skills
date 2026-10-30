// Pure aggregate builder for the local telemetry SQLite store. It deliberately
// receives only grouped query results: callers never pass raw runs to an export.

export const TELEMETRY_AGGREGATE_SCHEMA = "opchain-usage-aggregate/1.0";
export const TELEMETRY_K_ANONYMITY = 5;

function foldSmallCells(rows, key) {
  const visible = [];
  let other = 0;
  for (const row of rows) {
    if (row.runs < TELEMETRY_K_ANONYMITY) other += row.runs;
    else visible.push({ [key]: row[key], runs: row.runs });
  }
  if (other) visible.push({ [key]: "other", runs: other });
  return { rows: visible, suppressed: other };
}

export function buildTelemetryAggregate(db, { shippedFeatures = null, generatedAt = new Date().toISOString() } = {}) {
  const skillRuns = db.prepare("SELECT COUNT(*) AS n FROM runs").get().n;
  const pipelinesRun = db.prepare(
    "SELECT COUNT(DISTINCT handle || ':' || substr(started_at, 1, 10)) AS n FROM runs",
  ).get().n;
  const bySkill = foldSmallCells(
    db.prepare("SELECT skill, COUNT(*) AS runs FROM runs GROUP BY skill ORDER BY runs DESC, skill ASC").all(),
    "skill",
  );
  const tierRows = db.prepare(
    "SELECT model_tier AS tier, COUNT(*) AS runs FROM runs WHERE model_tier IS NOT NULL GROUP BY model_tier ORDER BY runs DESC, model_tier ASC",
  ).all();
  const tiers = foldSmallCells(tierRows, "tier");
  const tierTotal = tierRows.reduce((sum, row) => sum + row.runs, 0);
  const tierDistribution = tiers.rows.map((row) => ({
    tier: row.tier,
    share: tierTotal === 0 ? 0 : Number((row.runs / tierTotal).toFixed(6)),
  }));

  // The exporter receives only weekly grouped rows. `%W` is SQLite's UTC,
  // Monday-first week rule, retained in the artifact's documented week key.
  const weeks = db.prepare(
    "SELECT strftime('%Y-W%W', at) AS week, COUNT(*) AS runs, AVG(score) AS avg " +
    "FROM events WHERE kind = 'eval' AND score IS NOT NULL " +
    "GROUP BY strftime('%Y-W%W', at) ORDER BY week ASC",
  ).all();
  const evalScoreTrend = [];
  let suppressedEvalEvents = 0;
  for (const row of weeks) {
    if (row.runs < TELEMETRY_K_ANONYMITY) suppressedEvalEvents += row.runs;
    else evalScoreTrend.push({ week: row.week, avg: Number(row.avg.toFixed(6)), runs: row.runs });
  }

  const denominatorAvailable = Number.isSafeInteger(shippedFeatures) && shippedFeatures > 0;
  const totalCost = db.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS n FROM runs WHERE cost_usd IS NOT NULL").get().n;
  return {
    schema: TELEMETRY_AGGREGATE_SCHEMA,
    generated_at: generatedAt,
    privacy: { k_anonymity: TELEMETRY_K_ANONYMITY, raw_rows_exported: false, handles_exported: false },
    denominator: denominatorAvailable
      ? { name: "shipped_features", value: shippedFeatures, status: "provided" }
      : { name: "shipped_features", value: null, status: "unavailable" },
    totals: {
      pipelines_run: pipelinesRun,
      skill_runs: skillRuns,
      avg_cost_per_feature_usd: denominatorAvailable ? Number((totalCost / shippedFeatures).toFixed(6)) : null,
    },
    by_skill: bySkill.rows,
    model_tier_distribution: tierDistribution,
    eval_score_trend: evalScoreTrend,
    suppressed: {
      by_skill_runs: bySkill.suppressed,
      model_tier_runs: tiers.suppressed,
      eval_events: suppressedEvalEvents,
    },
  };
}
