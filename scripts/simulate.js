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
const WORLD_PATH = path.join(ROOT, "data", "world.json");
const MAX_FOOD = 10;
const MAX_HISTORY = 80;
const MAX_EVENTS = 60;
const BIOME_GROWTH = {
  forest: 2,
  grassland: 2,
  wetland: 3,
  mountain: 1,
  desert: 1
};

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

function mutateSpecies(species, events, tick) {
  if (Math.random() > 0.12) return;

  const traitNames = ["size", "speed", "fertility", "resilience", "metabolism"];
  const trait = traitNames[randomInt(0, traitNames.length - 1)];
  const delta = Math.random() < 0.5 ? -1 : 1;
  species.traits[trait] = clamp(species.traits[trait] + delta, 1, 10);

  events.push({
    tick,
    type: "mutation",
    message: `${species.name} mutation shifted ${trait} ${delta > 0 ? "up" : "down"}.`,
    impact: { species: species.id, trait, delta }
  });
}

function applyRandomEvent(world, events) {
  if (Math.random() > 0.18) return;

  const tick = world.tick;
  const roll = Math.random();

  if (roll < 0.4) {
    const biomes = Object.keys(BIOME_GROWTH);
    const biome = biomes[randomInt(0, biomes.length - 1)];
    let changed = 0;
    for (const cell of world.map.cells) {
      if (cell.biome === biome) {
        cell.food = clamp(cell.food - randomInt(1, 3), 0, MAX_FOOD);
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
    const cell = world.map.cells[randomInt(0, world.map.cells.length - 1)];
    cell.food = clamp(cell.food + randomInt(3, 5), 0, MAX_FOOD);
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

  const target = livingSpecies[randomInt(0, livingSpecies.length - 1)];
  const losses = Math.ceil(target.population * 0.25);
  target.population = Math.max(0, target.population - losses);
  events.push({
    tick,
    type: "disease",
    message: `${target.name} lost ${losses} individuals to disease.`,
    impact: { species: target.id, losses }
  });
}

function evolveSpecies(world, species, events) {
  const tick = world.tick;
  const biomeFood = averageFoodForBiome(world, species.traits.preferredBiome);
  const carryingSignal = biomeFood / MAX_FOOD;
  const foodNeeded = Math.ceil(species.population * species.traits.metabolism * 0.12);
  const foodEaten = consumeFood(world, species, foodNeeded);
  const scarcity = foodNeeded === 0 ? 0 : 1 - foodEaten / foodNeeded;

  const birthRate =
    (species.traits.fertility * 0.035 + carryingSignal * 0.08) *
    (1 - species.traits.size * 0.025);
  const deathRate =
    scarcity * 0.18 +
    species.traits.metabolism * 0.012 +
    Math.max(0, 5 - species.traits.resilience) * 0.02;

  const births = Math.floor(species.population * birthRate * Math.random());
  const deaths = Math.ceil(species.population * deathRate * Math.random());

  species.population = Math.max(0, species.population + births - deaths);

  if (births > 0 || deaths > 0) {
    events.push({
      tick,
      type: "population",
      message: `${species.name} changed by +${births} births and -${deaths} deaths.`,
      impact: { species: species.id, births, deaths, population: species.population }
    });
  }

  mutateSpecies(species, events, tick);
}

function regrowFood(world) {
  for (const cell of world.map.cells) {
    const growth = BIOME_GROWTH[cell.biome] ?? 1;
    const noise = Math.random() < 0.2 ? 1 : 0;
    cell.food = clamp(cell.food + growth + noise, 0, MAX_FOOD);
  }
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

function simulateTick(world) {
  world.tick += 1;
  const events = [];

  regrowFood(world);

  for (const species of world.species) {
    if (species.population > 0) {
      evolveSpecies(world, species, events);
    }
  }

  applyRandomEvent(world, events);
  recordExtinctions(world, events);
  recordHistory(world);

  world.updatedAt = new Date().toISOString();
  world.events = [...events, ...world.events].slice(0, MAX_EVENTS);
}

function main() {
  const ticks = Number.parseInt(process.argv[2] ?? "1", 10);
  if (!Number.isInteger(ticks) || ticks < 1) {
    throw new Error("Usage: node scripts/simulate.js [positive_tick_count]");
  }

  const world = loadWorld();
  for (let i = 0; i < ticks; i += 1) {
    simulateTick(world);
  }
  saveWorld(world);
  console.log(`Evolved world to tick ${world.tick}.`);
}

main();
