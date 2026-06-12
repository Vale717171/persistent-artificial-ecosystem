#!/usr/bin/env node

/**
 * Runs long-term ecosystem analysis without touching data/world.json.
 *
 * The script clones the current world in memory, evolves the clone, and writes
 * a Markdown report. It imports the same simulator used by GitHub Actions.
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

  const outputPath =
    process.argv[3] ?? path.join(ROOT, "reports", `long-run-${ticks}.md`);

  return { ticks, outputPath: path.resolve(outputPath) };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function livingSpecies(world) {
  return world.species.filter((species) => species.population > 0);
}

function totalPopulation(world) {
  return world.species.reduce((sum, species) => sum + species.population, 0);
}

function extinctSpeciesCount(world) {
  const extinctInSpeciesList = world.species.filter((species) => species.population === 0).length;
  return Math.max(extinctInSpeciesList, world.extinctions.length);
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
  return "remained dynamic";
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

function renderReport({ sourceWorld, simulatedWorld, ticks, metrics, samples, classification }) {
  const initial = metrics.initial;
  const final = metrics.final;
  const generatedAt = new Date().toISOString();

  const sampleTable = samples
    .map(
      (sample) =>
        `| ${sample.offset} | ${sample.tick} | ${sample.livingSpecies} | ${sample.extinctSpecies} | ${formatNumber(sample.totalPopulation)} | ${sample.biodiversity.toFixed(3)} |`
    )
    .join("\n");

  return `# Long-Run Ecosystem Report (${ticks} ticks)

Generated at: ${generatedAt}

Source state: \`data/world.json\`

Important: this report was generated from an in-memory copy of the world. The live \`data/world.json\` file was not evolved or overwritten by this analysis script.

## Verdict

The world **${classification}** over ${ticks} simulated ticks.

## Summary

| Metric | Initial | Final |
| --- | ---: | ---: |
| Tick | ${initial.tick} | ${final.tick} |
| Living species | ${initial.livingSpecies} | ${final.livingSpecies} |
| Extinct species | ${initial.extinctSpecies} | ${final.extinctSpecies} |
| Total population | ${formatNumber(initial.totalPopulation)} | ${formatNumber(final.totalPopulation)} |
| Biodiversity index | ${initial.biodiversity.toFixed(3)} | ${final.biodiversity.toFixed(3)} |

## Event Counts

| Event type | Count |
| --- | ---: |
| Immigration | ${metrics.immigrationEvents} |
| Speciation | ${metrics.speciationEvents} |
| Extinction | ${metrics.extinctionEvents} |

## Population Range

| Metric | Value |
| --- | ---: |
| Minimum total population reached | ${formatNumber(metrics.minPopulation)} |
| Maximum total population reached | ${formatNumber(metrics.maxPopulation)} |
| Minimum biodiversity reached | ${metrics.minBiodiversity.toFixed(3)} |
| Maximum biodiversity reached | ${metrics.maxBiodiversity.toFixed(3)} |

## Trend Samples

| Simulated tick offset | World tick | Living species | Extinct species | Total population | Biodiversity |
| ---: | ---: | ---: | ---: | ---: | ---: |
${sampleTable}

## Final Species

| Species | Population | Preferred biome | Origin |
| --- | ---: | --- | --- |
${simulatedWorld.species
  .map((species) => {
    const origin = species.origin ? `${species.origin.type} at tick ${species.origin.tick}` : "seed";
    return `| ${species.name} | ${formatNumber(species.population)} | ${species.traits.preferredBiome} | ${origin} |`;
  })
  .join("\n")}

## Notes

- Initial RNG state: \`${JSON.stringify(sourceWorld.rng ?? null)}\`
- Final RNG state: \`${JSON.stringify(simulatedWorld.rng ?? null)}\`
- Classification rule: collapsed means no living population or severe unreplenished diversity loss; stagnated means low movement and no ecological turnover; exploded means runaway population growth; otherwise the run is considered dynamic.
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

  return {
    simulatedWorld: world,
    metrics,
    samples: sampleRows(snapshots, ticks),
    classification
  };
}

function main() {
  const { ticks, outputPath } = parseArgs();
  const sourceWorld = JSON.parse(fs.readFileSync(WORLD_PATH, "utf8"));
  const analysis = analyze(sourceWorld, ticks);
  const report = renderReport({ sourceWorld, ticks, ...analysis });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, report);
  process.stdout.write(report);
}

if (require.main === module) {
  main();
}
