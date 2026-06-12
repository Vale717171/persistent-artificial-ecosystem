#!/usr/bin/env node

/**
 * Runs multi-seed stability analysis without touching data/world.json.
 */

const fs = require("node:fs");
const path = require("node:path");
const { analyze, clone, classificationText } = require("./long-run-report.js");

const ROOT = path.resolve(__dirname, "..");
const WORLD_PATH = path.join(ROOT, "data", "world.json");
const DEFAULT_SEEDS = 30;
const DEFAULT_TICKS = 1000;

function parseArgs() {
  const seedCount = Number.parseInt(process.argv[2] ?? String(DEFAULT_SEEDS), 10);
  const ticks = Number.parseInt(process.argv[3] ?? String(DEFAULT_TICKS), 10);
  if (!Number.isInteger(seedCount) || seedCount < 1 || !Number.isInteger(ticks) || ticks < 1) {
    throw new Error("Usage: node scripts/stability-summary.js [seed_count] [ticks_per_seed]");
  }
  return { seedCount, ticks };
}

function seedForIndex(index) {
  return (0x9e3779b9 + index * 0x6d2b79f5) >>> 0;
}

function withSeed(sourceWorld, seed) {
  const world = clone(sourceWorld);
  world.rng = {
    algorithm: "xorshift32",
    seed,
    state: seed
  };
  return world;
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / Math.max(1, values.length),
    median: sorted[Math.floor(sorted.length / 2)]
  };
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function summarizeRuns(runs, seedCount, ticks) {
  const outcomeDistribution = runs.reduce((counts, run) => {
    counts[run.classification] = (counts[run.classification] ?? 0) + 1;
    return counts;
  }, {});

  const byWorst = [...runs].sort(
    (a, b) =>
      a.finalLivingSpecies - b.finalLivingSpecies ||
      a.finalBiodiversity - b.finalBiodiversity ||
      a.finalTotalPopulation - b.finalTotalPopulation
  );
  const byBest = [...runs].sort(
    (a, b) =>
      b.finalBiodiversity - a.finalBiodiversity ||
      b.finalLivingSpecies - a.finalLivingSpecies ||
      b.finalTotalPopulation - a.finalTotalPopulation
  );

  return {
    generatedAt: new Date().toISOString(),
    source: "data/world.json",
    seedCount,
    ticksPerSeed: ticks,
    outcomeDistribution,
    statistics: {
      finalLivingSpecies: stats(runs.map((run) => run.finalLivingSpecies)),
      finalBiodiversity: stats(runs.map((run) => run.finalBiodiversity)),
      finalTotalPopulation: stats(runs.map((run) => run.finalTotalPopulation)),
      immigrationEvents: stats(runs.map((run) => run.immigrationEvents)),
      speciationEvents: stats(runs.map((run) => run.speciationEvents)),
      extinctionEvents: stats(runs.map((run) => run.extinctionEvents))
    },
    notableRuns: {
      worst: byWorst.slice(0, 5),
      best: byBest.slice(0, 5)
    },
    classificationCriteria: {
      collapsed: "No living population, or severe unreplenished diversity loss.",
      stagnated: "Low population movement and no ecological turnover.",
      exploded: "Runaway population growth.",
      dynamic: "None of the above; the run keeps population and turnover activity."
    },
    runs
  };
}

function htmlTable(headers, rows) {
  return `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

function statRows(summary) {
  return Object.entries(summary.statistics).map(([name, value]) => [
    name.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`),
    formatNumber(value.min),
    formatNumber(value.median),
    formatNumber(value.mean),
    formatNumber(value.max)
  ]);
}

function runRows(runs) {
  return runs.map((run) => [
    run.seed,
    classificationText(run.classification),
    run.finalLivingSpecies,
    run.finalBiodiversity.toFixed(3),
    formatNumber(run.finalTotalPopulation),
    run.immigrationEvents,
    run.speciationEvents,
    run.extinctionEvents
  ]);
}

function renderHtml(summary) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Multi-Seed Stability Summary</title>
    <style>
      body { margin: 0; padding: 32px; background: #f7f6ef; color: #18201b; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.5; }
      main { max-width: 1120px; margin: 0 auto; }
      h1 { font-size: clamp(2rem, 5vw, 4rem); line-height: 1; margin: 0 0 12px; }
      h2 { margin-top: 32px; }
      .lede, .note { color: #5c675f; }
      table { width: 100%; border-collapse: collapse; margin: 12px 0 24px; background: #fff; border: 1px solid #d9ded5; border-radius: 8px; overflow: hidden; }
      th, td { padding: 10px 12px; border-bottom: 1px solid #d9ded5; text-align: left; vertical-align: top; }
      th { color: #5c675f; font-size: 0.78rem; letter-spacing: 0.04em; text-transform: uppercase; }
      tr:last-child td { border-bottom: 0; }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      @media (max-width: 700px) { body { padding: 18px; } table { display: block; overflow-x: auto; } }
    </style>
  </head>
  <body>
    <main>
      <p class="lede">Generated at ${escapeHtml(summary.generatedAt)} from <code>${escapeHtml(summary.source)}</code></p>
      <h1>Multi-Seed Stability Summary</h1>
      <p class="note">${summary.seedCount} seeds x ${summary.ticksPerSeed} ticks. This report uses in-memory copies only and does not modify <code>data/world.json</code>.</p>

      <h2>Outcome Distribution</h2>
      ${htmlTable(
        ["Outcome", "Runs"],
        ["dynamic", "collapsed", "stagnated", "exploded"].map((outcome) => [
          classificationText(outcome),
          summary.outcomeDistribution[outcome] ?? 0
        ])
      )}

      <h2>Statistics</h2>
      ${htmlTable(["Metric", "Min", "Median", "Mean", "Max"], statRows(summary))}

      <h2>Worst Runs</h2>
      ${htmlTable(["Seed", "Outcome", "Living species", "Biodiversity", "Population", "Immigration", "Speciation", "Extinction"], runRows(summary.notableRuns.worst))}

      <h2>Best Runs</h2>
      ${htmlTable(["Seed", "Outcome", "Living species", "Biodiversity", "Population", "Immigration", "Speciation", "Extinction"], runRows(summary.notableRuns.best))}

      <h2>Classification Criteria</h2>
      <ul>
        ${Object.entries(summary.classificationCriteria)
          .map(([key, value]) => `<li><strong>${escapeHtml(classificationText(key))}:</strong> ${escapeHtml(value)}</li>`)
          .join("")}
      </ul>
    </main>
  </body>
</html>
`;
}

function main() {
  const { seedCount, ticks } = parseArgs();
  const sourceWorld = JSON.parse(fs.readFileSync(WORLD_PATH, "utf8"));
  const runs = [];

  for (let index = 0; index < seedCount; index += 1) {
    const seed = seedForIndex(index);
    const seededWorld = withSeed(sourceWorld, seed);
    const analysis = analyze(seededWorld, ticks);
    const summary = analysis.summary;
    runs.push({
      seed,
      classification: summary.classification,
      finalLivingSpecies: summary.final.livingSpecies,
      finalBiodiversity: summary.final.biodiversity,
      finalTotalPopulation: summary.final.totalPopulation,
      immigrationEvents: summary.turnover.immigrationEvents,
      speciationEvents: summary.turnover.speciationEvents,
      extinctionEvents: summary.turnover.extinctionEvents
    });
  }

  const summary = summarizeRuns(runs, seedCount, ticks);
  const jsonPath = path.join(ROOT, "reports", "stability-summary.json");
  const htmlPath = path.join(ROOT, "reports", "stability-summary.html");
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(htmlPath, renderHtml(summary));
  process.stdout.write(JSON.stringify(summary, null, 2));
  process.stderr.write(`\nWrote ${jsonPath} and ${htmlPath}\n`);
}

if (require.main === module) {
  main();
}
