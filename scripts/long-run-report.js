#!/usr/bin/env node

/**
 * Runs long-term ecosystem analysis without touching data/world.json.
 *
 * The script clones the current world in memory, evolves the clone, and writes
 * Markdown, HTML, and JSON report artifacts. It imports the same simulator used
 * by GitHub Actions.
 */

const fs = require("node:fs");
const path = require("node:path");
const { evolveWorld } = require("./simulate.js");

const ROOT = path.resolve(__dirname, "..");
const WORLD_PATH = path.join(ROOT, "data", "world.json");

function parseArgs() {
  const ticks = Number.parseInt(process.argv[2] ?? "1000", 10);
  if (!Number.isInteger(ticks) || ticks < 1) {
    throw new Error("Usage: node scripts/long-run-report.js [positive_tick_count] [output_path]");
  }

  const outputPath = process.argv[3] ?? path.join(ROOT, "reports", `long-run-${ticks}.md`);
  return { ticks, outputPath: path.resolve(outputPath) };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function livingSpecies(world) {
  return world.species.filter((species) => species.population > 0);
}

function totalPopulation(world) {
  return livingSpecies(world).reduce((sum, species) => sum + species.population, 0);
}

function extinctSpeciesCount(world) {
  return world.extinctions.length;
}

function biodiversityIndex(world) {
  const total = totalPopulation(world);
  if (total === 0) return 0;

  return livingSpecies(world).reduce((sum, species) => {
    const share = species.population / total;
    return share > 0 ? sum - share * Math.log(share) : sum;
  }, 0);
}

function snapshot(world) {
  return {
    tick: world.tick,
    livingSpecies: livingSpecies(world).length,
    extinctSpecies: extinctSpeciesCount(world),
    totalPopulation: totalPopulation(world),
    biodiversity: biodiversityIndex(world)
  };
}

function eventCountsForTick(world) {
  return world.events
    .filter((event) => event.tick === world.tick)
    .reduce(
      (counts, event) => {
        if (event.type === "immigration") counts.immigration += 1;
        if (event.type === "speciation") counts.speciation += 1;
        if (event.type === "extinction") counts.extinction += 1;
        return counts;
      },
      { immigration: 0, speciation: 0, extinction: 0 }
    );
}

function classify(metrics, initial, final) {
  const populationRatio = final.totalPopulation / Math.max(1, initial.totalPopulation);
  const livingRatio = final.livingSpecies / Math.max(1, initial.livingSpecies);
  const populationRange = metrics.maxPopulation - metrics.minPopulation;

  if (final.livingSpecies === 0 || final.totalPopulation === 0) return "collapsed";
  if (populationRatio > 20 || metrics.maxPopulation > initial.totalPopulation * 50) return "exploded";
  if (
    populationRange < Math.max(12, initial.totalPopulation * 0.1) &&
    metrics.immigrationEvents + metrics.speciationEvents + metrics.extinctionEvents === 0
  ) {
    return "stagnated";
  }
  if (livingRatio < 0.35 && metrics.immigrationEvents + metrics.speciationEvents === 0) return "collapsed";
  return "dynamic";
}

function classificationText(classification) {
  return classification === "dynamic" ? "remained dynamic" : classification;
}

function sampleRows(snapshots, ticks) {
  const wanted = new Set([0, ticks]);
  const interval = Math.max(1, Math.floor(ticks / 10));
  for (let tick = interval; tick < ticks; tick += interval) {
    wanted.add(tick);
  }

  return snapshots.filter((entry) => wanted.has(entry.offset));
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(value);
}

function originText(entity) {
  if (!entity.origin) return "seed";
  return `${entity.origin.type} at tick ${entity.origin.tick}`;
}

function artifactPaths(outputPath) {
  const parsed = path.parse(outputPath);
  const base = parsed.ext ? path.join(parsed.dir, parsed.name) : outputPath;
  return {
    markdown: `${base}.md`,
    html: `${base}.html`,
    json: `${base}.json`
  };
}

function summarizeAnalysis({ sourceWorld, simulatedWorld, ticks, metrics, samples, classification, generatedAt }) {
  const initial = metrics.initial;
  const final = metrics.final;
  const finalLivingSpecies = livingSpecies(simulatedWorld).map((species) => ({
    id: species.id,
    name: species.name,
    population: species.population,
    preferredBiome: species.traits.preferredBiome,
    origin: originText(species)
  }));
  const extinctSpecies = simulatedWorld.extinctions.map((entry) => ({
    id: entry.species,
    name: entry.name,
    tick: entry.tick,
    preferredBiome: entry.traits?.preferredBiome ?? "unknown",
    origin: originText(entry)
  }));

  return {
    generatedAt,
    source: "data/world.json",
    ticks,
    seed: sourceWorld.rng?.seed ?? null,
    initialRngState: sourceWorld.rng ?? null,
    finalRngState: simulatedWorld.rng ?? null,
    classification,
    classificationText: classificationText(classification),
    initial,
    final,
    turnover: {
      totalSpeciesSeen: finalLivingSpecies.length + extinctSpecies.length,
      livingAtEnd: finalLivingSpecies.length,
      extinctAtEnd: extinctSpecies.length,
      immigrationEvents: metrics.immigrationEvents,
      speciationEvents: metrics.speciationEvents,
      extinctionEvents: metrics.extinctionEvents
    },
    ranges: {
      minPopulation: metrics.minPopulation,
      maxPopulation: metrics.maxPopulation,
      minBiodiversity: metrics.minBiodiversity,
      maxBiodiversity: metrics.maxBiodiversity
    },
    samples,
    finalLivingSpecies,
    extinctSpecies
  };
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`)
  ].join("\n");
}

function renderMarkdown(summary) {
  const sampleRowsText = summary.samples.map((sample) => [
    sample.offset,
    sample.tick,
    sample.livingSpecies,
    sample.extinctSpecies,
    formatNumber(sample.totalPopulation),
    sample.biodiversity.toFixed(3)
  ]);

  const livingRows = summary.finalLivingSpecies.map((species) => [
    species.name,
    formatNumber(species.population),
    species.preferredBiome,
    species.origin
  ]);

  const recentExtinctRows = summary.extinctSpecies.slice(-12).map((species) => [
    species.name,
    species.tick,
    species.preferredBiome,
    species.origin
  ]);

  return `# Long-Run Ecosystem Report (${summary.ticks} ticks)

Generated at: ${summary.generatedAt}

Source state: \`${summary.source}\`

Important: this report was generated from an in-memory copy of the world. The live \`data/world.json\` file was not evolved or overwritten by this analysis script.

## Verdict

The world **${summary.classificationText}** over ${summary.ticks} simulated ticks.

## Summary

${markdownTable(["Metric", "Initial", "Final"], [
  ["Tick", summary.initial.tick, summary.final.tick],
  ["Living species", summary.initial.livingSpecies, summary.final.livingSpecies],
  ["Extinct species", summary.initial.extinctSpecies, summary.final.extinctSpecies],
  ["Total population", formatNumber(summary.initial.totalPopulation), formatNumber(summary.final.totalPopulation)],
  ["Biodiversity index", summary.initial.biodiversity.toFixed(3), summary.final.biodiversity.toFixed(3)]
])}

## Turnover

${markdownTable(["Metric", "Value"], [
  ["Total species seen", summary.turnover.totalSpeciesSeen],
  ["Living at end", summary.turnover.livingAtEnd],
  ["Extinct at end", summary.turnover.extinctAtEnd],
  ["Immigration events", summary.turnover.immigrationEvents],
  ["Speciation events", summary.turnover.speciationEvents],
  ["Extinction events", summary.turnover.extinctionEvents]
])}

## Population And Biodiversity Range

${markdownTable(["Metric", "Value"], [
  ["Minimum total population reached", formatNumber(summary.ranges.minPopulation)],
  ["Maximum total population reached", formatNumber(summary.ranges.maxPopulation)],
  ["Minimum biodiversity reached", summary.ranges.minBiodiversity.toFixed(3)],
  ["Maximum biodiversity reached", summary.ranges.maxBiodiversity.toFixed(3)]
])}

## Trend Samples

${markdownTable(
  ["Simulated tick offset", "World tick", "Living species", "Extinct species", "Total population", "Biodiversity"],
  sampleRowsText
)}

## Final Living Species

${livingRows.length ? markdownTable(["Species", "Population", "Preferred biome", "Origin"], livingRows) : "No living species remain."}

## Recently Extinct Species

${recentExtinctRows.length ? markdownTable(["Species", "Extinction tick", "Preferred biome", "Origin"], recentExtinctRows) : "No extinctions occurred."}

## Classification Criteria

- **collapsed:** no living population, or severe unreplenished diversity loss.
- **stagnated:** low population movement and no ecological turnover.
- **exploded:** runaway population growth.
- **dynamic:** none of the above; the run keeps population and turnover activity.

## Notes

- Seed: \`${summary.seed}\`
- Initial RNG state: \`${JSON.stringify(summary.initialRngState)}\`
- Final RNG state: \`${JSON.stringify(summary.finalRngState)}\`
- Extinct species are listed separately from active living species to keep the report readable.
`;
}

function htmlTable(headers, rows) {
  return `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

function renderHtml(summary) {
  const livingRows = summary.finalLivingSpecies.map((species) => [
    species.name,
    formatNumber(species.population),
    species.preferredBiome,
    species.origin
  ]);
  const recentExtinctRows = summary.extinctSpecies.slice(-12).map((species) => [
    species.name,
    species.tick,
    species.preferredBiome,
    species.origin
  ]);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Long-Run Ecosystem Report</title>
    <style>
      body { margin: 0; padding: 32px; background: #f7f6ef; color: #18201b; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.5; }
      main { max-width: 1080px; margin: 0 auto; }
      h1 { font-size: clamp(2rem, 5vw, 4rem); line-height: 1; margin: 0 0 12px; }
      h2 { margin-top: 32px; }
      .lede, .note { color: #5c675f; }
      .verdict { display: inline-block; padding: 10px 12px; border: 1px solid #d9ded5; border-radius: 8px; background: #fff; font-weight: 800; }
      table { width: 100%; border-collapse: collapse; margin: 12px 0 24px; background: #fff; border: 1px solid #d9ded5; border-radius: 8px; overflow: hidden; }
      th, td { padding: 10px 12px; border-bottom: 1px solid #d9ded5; text-align: left; vertical-align: top; }
      th { color: #5c675f; font-size: 0.78rem; letter-spacing: 0.04em; text-transform: uppercase; }
      tr:last-child td { border-bottom: 0; }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      a { color: #325f74; font-weight: 800; }
      @media (max-width: 700px) { body { padding: 18px; } table { display: block; overflow-x: auto; } }
    </style>
  </head>
  <body>
    <main>
      <p class="lede">Generated at ${escapeHtml(summary.generatedAt)} from <code>${escapeHtml(summary.source)}</code></p>
      <h1>Long-Run Ecosystem Report</h1>
      <p class="note">This report was generated from an in-memory copy. The live <code>data/world.json</code> file was not evolved or overwritten.</p>
      <p class="verdict">The world ${escapeHtml(summary.classificationText)} over ${summary.ticks} simulated ticks.</p>

      <h2>Summary</h2>
      ${htmlTable(["Metric", "Initial", "Final"], [
        ["Tick", summary.initial.tick, summary.final.tick],
        ["Living species", summary.initial.livingSpecies, summary.final.livingSpecies],
        ["Extinct species", summary.initial.extinctSpecies, summary.final.extinctSpecies],
        ["Total population", formatNumber(summary.initial.totalPopulation), formatNumber(summary.final.totalPopulation)],
        ["Biodiversity index", summary.initial.biodiversity.toFixed(3), summary.final.biodiversity.toFixed(3)]
      ])}

      <h2>Turnover</h2>
      ${htmlTable(["Metric", "Value"], [
        ["Total species seen", summary.turnover.totalSpeciesSeen],
        ["Living at end", summary.turnover.livingAtEnd],
        ["Extinct at end", summary.turnover.extinctAtEnd],
        ["Immigration events", summary.turnover.immigrationEvents],
        ["Speciation events", summary.turnover.speciationEvents],
        ["Extinction events", summary.turnover.extinctionEvents]
      ])}

      <h2>Population And Biodiversity Range</h2>
      ${htmlTable(["Metric", "Value"], [
        ["Minimum total population reached", formatNumber(summary.ranges.minPopulation)],
        ["Maximum total population reached", formatNumber(summary.ranges.maxPopulation)],
        ["Minimum biodiversity reached", summary.ranges.minBiodiversity.toFixed(3)],
        ["Maximum biodiversity reached", summary.ranges.maxBiodiversity.toFixed(3)]
      ])}

      <h2>Trend Samples</h2>
      ${htmlTable(
        ["Offset", "World tick", "Living species", "Extinct species", "Total population", "Biodiversity"],
        summary.samples.map((sample) => [
          sample.offset,
          sample.tick,
          sample.livingSpecies,
          sample.extinctSpecies,
          formatNumber(sample.totalPopulation),
          sample.biodiversity.toFixed(3)
        ])
      )}

      <h2>Final Living Species</h2>
      ${
        livingRows.length
          ? htmlTable(["Species", "Population", "Preferred biome", "Origin"], livingRows)
          : "<p>No living species remain.</p>"
      }

      <h2>Recently Extinct Species</h2>
      ${
        recentExtinctRows.length
          ? htmlTable(["Species", "Extinction tick", "Preferred biome", "Origin"], recentExtinctRows)
          : "<p>No extinctions occurred.</p>"
      }

      <h2>Classification Criteria</h2>
      <ul>
        <li><strong>collapsed:</strong> no living population, or severe unreplenished diversity loss.</li>
        <li><strong>stagnated:</strong> low population movement and no ecological turnover.</li>
        <li><strong>exploded:</strong> runaway population growth.</li>
        <li><strong>dynamic:</strong> none of the above; the run keeps population and turnover activity.</li>
      </ul>

      <p class="note">Seed: <code>${escapeHtml(summary.seed)}</code>. Extinct species are listed separately from active living species to keep the report readable.</p>
    </main>
  </body>
</html>
`;
}

function analyze(sourceWorld, ticks) {
  const world = clone(sourceWorld);
  const snapshots = [{ offset: 0, ...snapshot(world) }];
  const metrics = {
    initial: snapshot(world),
    final: null,
    immigrationEvents: 0,
    speciationEvents: 0,
    extinctionEvents: 0,
    minPopulation: totalPopulation(world),
    maxPopulation: totalPopulation(world),
    minBiodiversity: biodiversityIndex(world),
    maxBiodiversity: biodiversityIndex(world)
  };

  for (let offset = 1; offset <= ticks; offset += 1) {
    evolveWorld(world, 1);
    const current = snapshot(world);
    const counts = eventCountsForTick(world);

    metrics.immigrationEvents += counts.immigration;
    metrics.speciationEvents += counts.speciation;
    metrics.extinctionEvents += counts.extinction;
    metrics.minPopulation = Math.min(metrics.minPopulation, current.totalPopulation);
    metrics.maxPopulation = Math.max(metrics.maxPopulation, current.totalPopulation);
    metrics.minBiodiversity = Math.min(metrics.minBiodiversity, current.biodiversity);
    metrics.maxBiodiversity = Math.max(metrics.maxBiodiversity, current.biodiversity);
    snapshots.push({ offset, ...current });
  }

  metrics.final = snapshot(world);
  const classification = classify(metrics, metrics.initial, metrics.final);
  const generatedAt = new Date().toISOString();
  const summary = summarizeAnalysis({
    sourceWorld,
    simulatedWorld: world,
    ticks,
    metrics,
    samples: sampleRows(snapshots, ticks),
    classification,
    generatedAt
  });

  return { simulatedWorld: world, metrics, summary };
}

function writeReportFiles(outputPath, summary) {
  const paths = artifactPaths(outputPath);
  fs.mkdirSync(path.dirname(paths.markdown), { recursive: true });
  fs.writeFileSync(paths.markdown, renderMarkdown(summary));
  fs.writeFileSync(paths.html, renderHtml(summary));
  fs.writeFileSync(paths.json, `${JSON.stringify(summary, null, 2)}\n`);
  return paths;
}

function main() {
  const { ticks, outputPath } = parseArgs();
  const sourceWorld = JSON.parse(fs.readFileSync(WORLD_PATH, "utf8"));
  const { summary } = analyze(sourceWorld, ticks);
  const paths = writeReportFiles(outputPath, summary);
  process.stdout.write(renderMarkdown(summary));
  process.stderr.write(`\nWrote ${paths.markdown}, ${paths.html}, and ${paths.json}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  analyze,
  classify,
  classificationText,
  clone,
  livingSpecies,
  totalPopulation,
  biodiversityIndex,
  renderHtml,
  renderMarkdown,
  writeReportFiles
};
