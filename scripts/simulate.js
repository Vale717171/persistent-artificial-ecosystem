#!/usr/bin/env node

/**
 * Evolves the ecosystem by one or more ticks.
 *
 * Persistence is intentionally GitHub-native: this script reads and writes
 * JSON files under /data so scheduled Actions can commit the new state.
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const WORLD_PATH = process.env.ECOSYSTEM_WORLD_PATH || path.join(ROOT, "data", "world.json");
const MAX_FOOD = 10;
const MAX_HISTORY = 80;
const MAX_EVENTS = 80;
const MAX_SPECIES = 9;
const TICK_INTERVAL_HOURS = 6;
const BIOME_GROWTH = {
  forest: 2,
  grassland: 2,
  wetland: 3,
  mountain: 1,
  desert: 1
};
const SPECIES_PREFIXES = ["Amber", "Blue", "Cinder", "Dawn", "Frost", "Lumen", "Rust", "Silver", "Thorn"];
const SPECIES_SUFFIXES = ["grazer", "mote", "runner", "singer", "skipper", "sprout", "weaver", "back", "ling"];

function createRng(state) {
  let current = (state >>> 0) || 0x6d2b79f5;

  return {
    next() {
      current ^= current << 13;
      current ^= current >>> 17;
      current ^= current << 5;
      return (current >>> 0) / 4294967296;
    },
    state() {
      return current >>> 0;
    }
  };
}

function ensureRng(world) {
  if (!world.rng) {
    const seed = world.seed ?? 0x1a2b3c4d;
    world.rng = {
      algorithm: "xorshift32",
      seed: seed >>> 0,
      state: seed >>> 0
    };
    delete world.seed;
  }

  world.rng.algorithm = "xorshift32";
  world.rng.seed = (world.rng.seed ?? world.rng.state ?? 0x1a2b3c4d) >>> 0;
  world.rng.state = (world.rng.state ?? world.rng.seed) >>> 0;
}

function randomInt(rng, min, max) {
  return Math.floor(rng.next() * (max - min + 1)) + min;
}

function chance(rng, probability) {
  return rng.next() < probability;
}

function choose(rng, items) {
  return items[randomInt(rng, 0, items.length - 1)];
}

function shuffle(rng, items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(rng, 0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function probabilisticRound(rng, value) {
  const base = Math.floor(value);
  return base + (chance(rng, value - base) ? 1 : 0);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function loadWorld() {
  return JSON.parse(fs.readFileSync(WORLD_PATH, "utf8"));
}

function saveWorld(world) {
  fs.writeFileSync(WORLD_PATH, `${JSON.stringify(world, null, 2)}\n`);
}

function averageFoodForBiome(world, biome) {
  const cells = world.map.cells.filter((cell) => cell.biome === biome);
  if (cells.length === 0) return 0;
  return cells.reduce((sum, cell) => sum + cell.food, 0) / cells.length;
}

function consumeFood(world, species, amount) {
  const preferredCells = world.map.cells
    .filter((cell) => cell.biome === species.traits.preferredBiome && cell.food > 0)
    .sort((a, b) => b.food - a.food);

  let remaining = amount;
  for (const cell of preferredCells) {
    if (remaining <= 0) break;
    const eaten = Math.min(cell.food, remaining);
    cell.food -= eaten;
    remaining -= eaten;
  }

  return amount - remaining;
}

function mutateSpecies(rng, species, events, tick) {
  if (!chance(rng, 0.12)) return;

  const traitNames = ["size", "speed", "fertility", "resilience", "metabolism"];
  const trait = choose(rng, traitNames);
  const delta = chance(rng, 0.5) ? -1 : 1;
  species.traits[trait] = clamp(species.traits[trait] + delta, 1, 10);

  events.push({
    tick,
    type: "mutation",
    message: `${species.name} mutation shifted ${trait} ${delta > 0 ? "up" : "down"}.`,
    impact: { species: species.id, trait, delta }
  });
}

function applyRandomEvent(rng, world, events) {
  if (!chance(rng, 0.18)) return;

  const tick = world.tick;
  const roll = rng.next();

  if (roll < 0.4) {
    const biome = choose(rng, Object.keys(BIOME_GROWTH));
    let changed = 0;
    for (const cell of world.map.cells) {
      if (cell.biome === biome) {
        cell.food = clamp(cell.food - randomInt(rng, 1, 3), 0, MAX_FOOD);
        changed += 1;
      }
    }
    events.push({
      tick,
      type: "disturbance",
      message: `A harsh season reduced food across ${biome} cells.`,
      impact: { biome, cells: changed }
    });
    return;
  }

  if (roll < 0.75) {
    const cell = choose(rng, world.map.cells);
    cell.food = clamp(cell.food + randomInt(rng, 3, 5), 0, MAX_FOOD);
    events.push({
      tick,
      type: "bloom",
      message: `A food bloom appeared in the ${cell.biome} at (${cell.x}, ${cell.y}).`,
      impact: { x: cell.x, y: cell.y, biome: cell.biome }
    });
    return;
  }

  const livingSpecies = world.species.filter((species) => species.population > 0);
  if (livingSpecies.length === 0) return;

  const target = choose(rng, livingSpecies);
  const losses = probabilisticRound(rng, target.population * 0.18);
  target.population = Math.max(0, target.population - losses);
  events.push({
    tick,
    type: "disease",
    message: `${target.name} lost ${losses} individuals to disease.`,
    impact: { species: target.id, losses }
  });
}

function evolveSpecies(rng, world, species, events) {
  const tick = world.tick;
  const biomeFood = averageFoodForBiome(world, species.traits.preferredBiome);
  const carryingSignal = biomeFood / MAX_FOOD;
  const foodNeeded = Math.ceil(species.population * species.traits.metabolism * 0.12);
  const foodEaten = consumeFood(world, species, foodNeeded);
  const scarcity = foodNeeded === 0 ? 0 : 1 - foodEaten / foodNeeded;

  // Birth rate is the expected offspring per individual this tick before rounding.
  const birthRate =
    (species.traits.fertility * 0.028 + carryingSignal * 0.055) *
    (1 - species.traits.size * 0.025) *
    (1 - scarcity * 0.6);
  // Death rate is the expected mortality per individual this tick before rounding.
  const deathRate =
    scarcity * 0.16 +
    species.traits.metabolism * 0.01 +
    Math.max(0, 5 - species.traits.resilience) * 0.018;

  const births = probabilisticRound(rng, species.population * clamp(birthRate, 0, 0.45));
  const deaths = Math.min(species.population, probabilisticRound(rng, species.population * clamp(deathRate, 0, 0.5)));

  species.population = Math.max(0, species.population + births - deaths);

  if (births > 0 || deaths > 0) {
    events.push({
      tick,
      type: "population",
      message: `${species.name} changed by +${births} births and -${deaths} deaths.`,
      impact: { species: species.id, births, deaths, population: species.population }
    });
  }

  mutateSpecies(rng, species, events, tick);
}

function regrowFood(rng, world) {
  for (const cell of world.map.cells) {
    const growth = BIOME_GROWTH[cell.biome] ?? 1;
    const noise = chance(rng, 0.2) ? 1 : 0;
    cell.food = clamp(cell.food + growth + noise, 0, MAX_FOOD);
  }
}

function createNovelSpecies(rng, world, source) {
  const preferredBiome = choose(rng, Object.keys(BIOME_GROWTH));
  const name = `${choose(rng, SPECIES_PREFIXES)}${choose(rng, SPECIES_SUFFIXES)}`;
  const idBase = slugify(name);
  let id = idBase;
  let suffix = 2;
  while (world.species.some((species) => species.id === id)) {
    id = `${idBase}-${suffix}`;
    suffix += 1;
  }

  return {
    id,
    name,
    population: randomInt(rng, 6, 16),
    traits: {
      preferredBiome,
      size: randomInt(rng, 1, 6),
      speed: randomInt(rng, 1, 8),
      fertility: randomInt(rng, 3, 8),
      resilience: randomInt(rng, 3, 8),
      metabolism: randomInt(rng, 2, 6)
    },
    origin: {
      tick: world.tick,
      type: source
    }
  };
}

function applyNovelty(rng, world, events) {
  const livingSpecies = world.species.filter((species) => species.population > 0);
  if (livingSpecies.length >= MAX_SPECIES || !chance(rng, 0.025)) return;

  const source = livingSpecies.length < 3 || chance(rng, 0.55) ? "immigration" : "speciation";
  const newcomer = createNovelSpecies(rng, world, source);
  world.species.push(newcomer);

  events.push({
    tick: world.tick,
    type: source,
    message:
      source === "immigration"
        ? `${newcomer.name} immigrated into the ${newcomer.traits.preferredBiome}.`
        : `${newcomer.name} speciated into the ${newcomer.traits.preferredBiome}.`,
    impact: { species: newcomer.id, population: newcomer.population, biome: newcomer.traits.preferredBiome }
  });
}

function recordHistory(world) {
  const populations = {};
  for (const species of world.species) {
    populations[species.id] = species.population;
  }

  world.history.push({ tick: world.tick, populations });
  world.history = world.history.slice(-MAX_HISTORY);
}

function recordExtinctions(world, events) {
  const known = new Set(world.extinctions.map((entry) => entry.species));

  for (const species of world.species) {
    if (species.population === 0 && !known.has(species.id)) {
      const extinction = {
        tick: world.tick,
        species: species.id,
        name: species.name,
        message: `${species.name} went extinct at tick ${world.tick}.`
      };
      world.extinctions.push(extinction);
      events.push({
        tick: world.tick,
        type: "extinction",
        message: extinction.message,
        impact: { species: species.id }
      });
    }
  }
}

function nextTickTimestamp(world) {
  const base = new Date(world.latestTickAt ?? world.updatedAt);
  const baseTime = Number.isNaN(base.getTime()) ? Date.UTC(2026, 0, 1) : base.getTime();
  return new Date(baseTime + TICK_INTERVAL_HOURS * 60 * 60 * 1000).toISOString();
}

function simulateTick(rng, world) {
  world.tick += 1;
  const events = [];

  regrowFood(rng, world);

  for (const species of shuffle(rng, world.species)) {
    if (species.population > 0) {
      evolveSpecies(rng, world, species, events);
    }
  }

  applyRandomEvent(rng, world, events);
  applyNovelty(rng, world, events);
  recordExtinctions(world, events);
  recordHistory(world);

  const updatedAt = nextTickTimestamp(world);
  world.updatedAt = updatedAt;
  world.latestTickAt = updatedAt;
  world.tickIntervalHours = TICK_INTERVAL_HOURS;
  world.events = [...events, ...world.events].slice(0, MAX_EVENTS);
}

function main() {
  const ticks = Number.parseInt(process.argv[2] ?? "1", 10);
  if (!Number.isInteger(ticks) || ticks < 1) {
    throw new Error("Usage: node scripts/simulate.js [positive_tick_count]");
  }

  const world = loadWorld();
  ensureRng(world);
  const rng = createRng(world.rng.state);
  for (let i = 0; i < ticks; i += 1) {
    simulateTick(rng, world);
  }
  world.rng.state = rng.state();
  saveWorld(world);
  console.log(`Evolved world to tick ${world.tick}.`);
}

main();
