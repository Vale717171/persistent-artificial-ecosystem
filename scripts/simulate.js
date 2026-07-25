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
const MAX_SPECIES = 12;
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
const BIOME_CLIMATE = {
  forest: { temperature: 0.55, moisture: 0.72 },
  grassland: { temperature: 0.62, moisture: 0.48 },
  wetland: { temperature: 0.58, moisture: 0.88 },
  mountain: { temperature: 0.28, moisture: 0.46 },
  desert: { temperature: 0.82, moisture: 0.16 }
};
const INNOVATIONS = [
  { id: "flight", label: "flight", speed: 2, metabolism: 1 },
  { id: "nocturnal", label: "nocturnal activity", resilience: 1 },
  { id: "venom", label: "venom", predator: true },
  { id: "photosynthesis", label: "photosynthesis", metabolism: -2 },
  { id: "burrowing", label: "burrowing", resilience: 2, speed: -1 },
  { id: "cooperation", label: "cooperative colonies", fertility: 1, resilience: 1 },
  { id: "dormancy", label: "seasonal dormancy", resilience: 2, metabolism: -1 }
];
const ERA_NAMES = {
  warm: ["Age of Heat", "Long Summer", "Ember Era"],
  cold: ["Long Winter", "Age of Frost", "Pale Era"],
  wet: ["Age of Rains", "Green Expansion", "Flooded Era"],
  dry: ["Great Drying", "Dust Era", "Age of Thirst"],
  stable: ["Temperate Equilibrium", "Quiet Bloom", "Balanced Era"]
};

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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cellKey(x, y) {
  return `${x},${y}`;
}

function getCell(world, x, y) {
  return world.map.cells.find((cell) => cell.x === x && cell.y === y);
}

function neighboringCells(world, cell) {
  return [
    getCell(world, cell.x - 1, cell.y),
    getCell(world, cell.x + 1, cell.y),
    getCell(world, cell.x, cell.y - 1),
    getCell(world, cell.x, cell.y + 1)
  ].filter(Boolean);
}

function defaultDiet(species) {
  if (species.traits.size >= 6) return "predator";
  if (species.traits.size >= 4) return "omnivore";
  return "grazer";
}

function distributePopulation(world, species) {
  const preferred = world.map.cells.filter((cell) => cell.biome === species.traits.preferredBiome);
  const candidates = preferred.length > 0 ? preferred : world.map.cells;
  const occupied = candidates
    .slice()
    .sort((a, b) => b.food - a.food || a.y - b.y || a.x - b.x)
    .slice(0, Math.min(3, candidates.length));
  const base = Math.floor(species.population / occupied.length);
  let remainder = species.population - base * occupied.length;

  return occupied.map((cell) => ({
    x: cell.x,
    y: cell.y,
    population: base + (remainder-- > 0 ? 1 : 0)
  }));
}

function ensureOpenEndedSchema(world) {
  let migrated = false;

  if (!world.environment) {
    world.environment = {
      temperature: 0.55,
      moisture: 0.55,
      volatility: 0.16,
      temperatureTrend: 0,
      moistureTrend: 0,
      era: {
        name: "Temperate Equilibrium",
        kind: "stable",
        sinceTick: world.tick
      },
      eraHistory: []
    };
    migrated = true;
  }

  world.environment.temperature = clamp(world.environment.temperature ?? 0.55, 0, 1);
  world.environment.moisture = clamp(world.environment.moisture ?? 0.55, 0, 1);
  world.environment.volatility = clamp(world.environment.volatility ?? 0.16, 0.04, 0.5);
  world.environment.temperatureTrend = world.environment.temperatureTrend ?? 0;
  world.environment.moistureTrend = world.environment.moistureTrend ?? 0;
  world.environment.eraHistory = world.environment.eraHistory ?? [];

  for (const species of world.species) {
    if (!species.range) {
      species.range = distributePopulation(world, species);
      migrated = true;
    }
    if (!species.ecology) {
      species.ecology = { diet: defaultDiet(species) };
      migrated = true;
    }
    species.capabilities = species.capabilities ?? [];
    species.lineage = species.lineage ?? {
      parent: null,
      generation: 0,
      bornAt: species.origin?.tick ?? 0
    };
    species.divergence = species.divergence ?? 0;
  }

  world.milestones = world.milestones ?? [];
  world.schemaVersion = 2;
  return migrated;
}

function reconcileRange(world, species) {
  const valid = (species.range ?? [])
    .filter((entry) => entry.population > 0 && getCell(world, entry.x, entry.y))
    .map((entry) => ({ ...entry, population: Math.max(0, Math.round(entry.population)) }));
  const rangeTotal = valid.reduce((sum, entry) => sum + entry.population, 0);

  if (species.population <= 0) {
    species.range = [];
    return;
  }
  if (rangeTotal === 0) {
    species.range = distributePopulation(world, species);
    return;
  }

  const scaled = valid.map((entry) => ({
    ...entry,
    population: Math.floor((entry.population / rangeTotal) * species.population)
  }));
  let remainder = species.population - scaled.reduce((sum, entry) => sum + entry.population, 0);
  scaled.sort((a, b) => b.population - a.population);
  for (let index = 0; remainder > 0; index = (index + 1) % scaled.length) {
    scaled[index].population += 1;
    remainder -= 1;
  }
  species.range = scaled.filter((entry) => entry.population > 0);
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

function localClimate(world, cell) {
  const latitude = world.map.height <= 1 ? 0.5 : cell.y / (world.map.height - 1);
  const altitudeCooling = cell.biome === "mountain" ? 0.16 : 0;
  return {
    temperature: clamp(world.environment.temperature + (0.5 - latitude) * 0.18 - altitudeCooling, 0, 1),
    moisture: clamp(
      world.environment.moisture + (cell.biome === "wetland" ? 0.16 : 0) - (cell.biome === "desert" ? 0.18 : 0),
      0,
      1
    )
  };
}

function habitatSuitability(world, species, cell) {
  const ideal = BIOME_CLIMATE[species.traits.preferredBiome] ?? BIOME_CLIMATE.grassland;
  const climate = localClimate(world, cell);
  const climateFit = 1 - (Math.abs(climate.temperature - ideal.temperature) + Math.abs(climate.moisture - ideal.moisture)) / 2;
  const biomeFit = cell.biome === species.traits.preferredBiome ? 0.34 : 0;
  const foodFit = cell.food / MAX_FOOD;
  const innovationBonus =
    (species.capabilities.includes("flight") ? 0.05 : 0) +
    (species.capabilities.includes("burrowing") && (cell.biome === "desert" || cell.biome === "mountain") ? 0.1 : 0) +
    (species.capabilities.includes("dormancy") ? 0.04 : 0);
  return clamp(climateFit * 0.48 + foodFit * 0.24 + biomeFit + innovationBonus, 0, 1.15);
}

function evolveClimate(rng, world, events) {
  const environment = world.environment;
  const volatility = environment.volatility;

  if (chance(rng, 0.035)) {
    environment.temperatureTrend = clamp(environment.temperatureTrend + (chance(rng, 0.5) ? -0.006 : 0.006), -0.018, 0.018);
  }
  if (chance(rng, 0.035)) {
    environment.moistureTrend = clamp(environment.moistureTrend + (chance(rng, 0.5) ? -0.007 : 0.007), -0.02, 0.02);
  }

  environment.temperature = clamp(
    environment.temperature +
      environment.temperatureTrend +
      (0.55 - environment.temperature) * 0.006 +
      (rng.next() - 0.5) * volatility * 0.04,
    0.04,
    0.96
  );
  environment.moisture = clamp(
    environment.moisture +
      environment.moistureTrend +
      (0.55 - environment.moisture) * 0.006 +
      (rng.next() - 0.5) * volatility * 0.05,
    0.04,
    0.96
  );
  environment.temperatureTrend *= 0.985;
  environment.moistureTrend *= 0.985;

  if (chance(rng, 0.008)) {
    environment.temperatureTrend = (rng.next() - 0.5) * 0.03;
    environment.moistureTrend = (rng.next() - 0.5) * 0.035;
    environment.volatility = clamp(environment.volatility + (rng.next() - 0.35) * 0.1, 0.06, 0.42);
    events.push({
      tick: world.tick,
      type: "climate",
      message: "The climate entered an unstable transition.",
      impact: {
        temperatureTrend: environment.temperatureTrend,
        moistureTrend: environment.moistureTrend,
        volatility: environment.volatility
      }
    });
  }

  const previousEra = environment.era;
  const age = world.tick - (previousEra?.sinceTick ?? world.tick);
  let kind = "stable";
  if (environment.temperature > 0.72) kind = "warm";
  else if (environment.temperature < 0.34) kind = "cold";
  else if (environment.moisture > 0.72) kind = "wet";
  else if (environment.moisture < 0.32) kind = "dry";

  if (!previousEra || (kind !== previousEra.kind && age >= 12)) {
    if (previousEra) {
      environment.eraHistory.push({ ...previousEra, endedAt: world.tick });
      environment.eraHistory = environment.eraHistory.slice(-20);
    }
    environment.era = {
      name: choose(rng, ERA_NAMES[kind]),
      kind,
      sinceTick: world.tick
    };
    events.push({
      tick: world.tick,
      type: "era",
      message: `${environment.era.name} began.`,
      impact: { kind, temperature: environment.temperature, moisture: environment.moisture }
    });
  }
}

function migrateSpecies(rng, world, species, events) {
  reconcileRange(world, species);
  const movements = [];
  const byCell = new Map(species.range.map((entry) => [cellKey(entry.x, entry.y), { ...entry }]));
  const mobility = clamp(0.04 + species.traits.speed * 0.018 + (species.capabilities.includes("flight") ? 0.12 : 0), 0.05, 0.34);

  for (const entry of [...byCell.values()]) {
    const origin = getCell(world, entry.x, entry.y);
    if (!origin || entry.population < 3) continue;
    const candidates = neighboringCells(world, origin);
    if (species.capabilities.includes("flight")) {
      candidates.push(...world.map.cells.filter((cell) => Math.abs(cell.x - origin.x) + Math.abs(cell.y - origin.y) === 2));
    }
    if (candidates.length === 0) continue;

    const currentFit = habitatSuitability(world, species, origin);
    const destination = candidates
      .map((cell) => ({ cell, fit: habitatSuitability(world, species, cell) + rng.next() * 0.08 }))
      .sort((a, b) => b.fit - a.fit)[0];
    if (!destination || destination.fit < currentFit - 0.06) continue;

    const migrants = Math.min(entry.population - 1, probabilisticRound(rng, entry.population * mobility));
    if (migrants <= 0) continue;
    entry.population -= migrants;
    byCell.set(cellKey(entry.x, entry.y), entry);
    const targetKey = cellKey(destination.cell.x, destination.cell.y);
    const target = byCell.get(targetKey) ?? { x: destination.cell.x, y: destination.cell.y, population: 0 };
    target.population += migrants;
    byCell.set(targetKey, target);
    movements.push({ from: { x: entry.x, y: entry.y }, to: { x: target.x, y: target.y }, population: migrants });
  }

  species.range = [...byCell.values()].filter((entry) => entry.population > 0);
  const colonization = movements.find((movement) => movement.population >= Math.max(4, species.population * 0.08));
  if (colonization && chance(rng, 0.15)) {
    events.push({
      tick: world.tick,
      type: "migration",
      message: `${species.name} established a new population at (${colonization.to.x}, ${colonization.to.y}).`,
      impact: { species: species.id, ...colonization }
    });
  }
}

function consumeFood(world, species, amount) {
  const accessible = new Map();
  for (const entry of species.range) {
    const occupied = getCell(world, entry.x, entry.y);
    if (!occupied) continue;
    accessible.set(cellKey(occupied.x, occupied.y), occupied);
    if (species.capabilities.includes("flight") || species.traits.speed >= 7) {
      for (const neighbor of neighboringCells(world, occupied)) {
        accessible.set(cellKey(neighbor.x, neighbor.y), neighbor);
      }
    }
  }
  const preferredCells = [...accessible.values()]
    .filter((cell) => cell.food > 0)
    .sort(
      (a, b) =>
        habitatSuitability(world, species, b) - habitatSuitability(world, species, a) ||
        b.food - a.food
    );

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
  if (chance(rng, 0.007)) {
    const available = INNOVATIONS.filter((innovation) => !species.capabilities.includes(innovation.id));
    if (available.length > 0) {
      const innovation = choose(rng, available);
      species.capabilities.push(innovation.id);
      for (const trait of ["speed", "fertility", "resilience", "metabolism"]) {
        if (innovation[trait]) {
          species.traits[trait] = clamp(species.traits[trait] + innovation[trait], 1, 10);
        }
      }
      if (innovation.predator) species.ecology.diet = "predator";
      species.divergence += 3;
      events.push({
        tick,
        type: "innovation",
        message: `${species.name} evolved ${innovation.label}.`,
        impact: { species: species.id, capability: innovation.id }
      });
      return;
    }
  }

  if (!chance(rng, 0.12)) return;

  const traitNames = ["size", "speed", "fertility", "resilience", "metabolism"];
  const trait = choose(rng, traitNames);
  const delta = chance(rng, 0.5) ? -1 : 1;
  const before = species.traits[trait];
  const after = clamp(before + delta, 1, 10);
  if (after === before) return;

  species.traits[trait] = after;
  species.divergence += 1;

  events.push({
    tick,
    type: "mutation",
    message: `${species.name} mutation shifted ${trait} ${after > before ? "up" : "down"}.`,
    impact: { species: species.id, trait, delta: after - before, before, after }
  });
}

function applyRandomEvent(rng, world, events) {
  if (!chance(rng, 0.18)) return;

  const tick = world.tick;
  const roll = rng.next();

  if (roll < 0.045) {
    const center = choose(rng, world.map.cells);
    const affected = world.map.cells.filter(
      (cell) => Math.abs(cell.x - center.x) + Math.abs(cell.y - center.y) <= randomInt(rng, 1, 2)
    );
    const eventName = choose(rng, ["wildfire", "flash flood", "toxic bloom", "landslide"]);
    for (const cell of affected) {
      cell.food = Math.max(0, cell.food - randomInt(rng, 5, 9));
    }
    for (const species of world.species) {
      let losses = 0;
      for (const entry of species.range ?? []) {
        if (!affected.some((cell) => cell.x === entry.x && cell.y === entry.y)) continue;
        const resilience = species.traits.resilience + (species.capabilities.includes("dormancy") ? 2 : 0);
        const cellLosses = probabilisticRound(rng, entry.population * clamp(0.3 - resilience * 0.02, 0.07, 0.28));
        entry.population = Math.max(0, entry.population - cellLosses);
        losses += cellLosses;
      }
      species.population = Math.max(0, species.population - losses);
    }
    events.push({
      tick,
      type: "catastrophe",
      message: `A ${eventName} transformed ${affected.length} cells around (${center.x}, ${center.y}).`,
      impact: { event: eventName, x: center.x, y: center.y, cells: affected.length }
    });
    return;
  }

  if (roll < 0.42) {
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

  if (roll < 0.76) {
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
  removeFromRange(world, target, losses);
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
  const occupiedSuitability =
    species.range.reduce((sum, entry) => {
      const cell = getCell(world, entry.x, entry.y);
      return sum + (cell ? habitatSuitability(world, species, cell) * entry.population : 0);
    }, 0) / Math.max(1, species.population);
  const dietFoodFactor = species.ecology.diet === "predator" ? 0.42 : species.ecology.diet === "omnivore" ? 0.72 : 1;
  const photosynthesisFactor = species.capabilities.includes("photosynthesis") ? 0.58 : 1;
  const foodNeeded = Math.ceil(species.population * species.traits.metabolism * 0.075 * dietFoodFactor * photosynthesisFactor);
  const foodEaten = consumeFood(world, species, foodNeeded);
  const scarcity = foodNeeded === 0 ? 0 : 1 - foodEaten / foodNeeded;
  const habitatStress = clamp(0.72 - occupiedSuitability, 0, 0.6);
  const crowding = Math.max(0, species.population / Math.max(1, species.range.length * 90) - 1);

  // Birth rate is the expected offspring per individual this tick before rounding.
  const birthRate =
    (species.traits.fertility * 0.025 + carryingSignal * 0.045 + occupiedSuitability * 0.025) *
    (1 - species.traits.size * 0.025) *
    (1 - scarcity * 0.6) /
    (1 + crowding * 0.8);
  // Death rate is the expected mortality per individual this tick before rounding.
  const deathRate =
    scarcity * 0.16 +
    species.traits.metabolism * 0.01 +
    Math.max(0, 5 - species.traits.resilience) * 0.018 +
    habitatStress * 0.09 +
    crowding * 0.055;

  const births = probabilisticRound(rng, species.population * clamp(birthRate, 0, 0.45));
  const deaths = Math.min(species.population, probabilisticRound(rng, species.population * clamp(deathRate, 0, 0.5)));

  species.population = Math.max(0, species.population + births - deaths);
  reconcileRange(world, species);

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

function overlapPopulation(predator, prey) {
  const preyByCell = new Map(prey.range.map((entry) => [cellKey(entry.x, entry.y), entry.population]));
  return predator.range.reduce(
    (sum, entry) => sum + Math.min(entry.population, preyByCell.get(cellKey(entry.x, entry.y)) ?? 0),
    0
  );
}

function removeFromRange(world, species, amount) {
  let remaining = Math.min(amount, species.population);
  const range = [...species.range].sort((a, b) => b.population - a.population);
  for (const entry of range) {
    if (remaining <= 0) break;
    const removed = Math.min(entry.population, remaining);
    entry.population -= removed;
    remaining -= removed;
  }
  species.range = range.filter((entry) => entry.population > 0);
  species.population = species.range.reduce((sum, entry) => sum + entry.population, 0);
  reconcileRange(world, species);
}

function applyTrophicInteractions(rng, world, events) {
  const predators = shuffle(
    rng,
    world.species.filter(
      (species) => species.population > 0 && (species.ecology.diet === "predator" || species.ecology.diet === "omnivore")
    )
  );

  for (const predator of predators) {
    const preyCandidates = world.species
      .filter(
        (prey) =>
          prey.id !== predator.id &&
          prey.population > 0 &&
          prey.traits.size <= predator.traits.size + (predator.capabilities.includes("venom") ? 2 : 0)
      )
      .map((prey) => ({ prey, overlap: overlapPopulation(predator, prey) }))
      .filter((candidate) => candidate.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap);
    if (preyCandidates.length === 0) continue;

    const { prey, overlap } = preyCandidates[0];
    const huntingPower =
      predator.traits.speed * 0.006 +
      predator.traits.size * 0.004 +
      (predator.capabilities.includes("venom") ? 0.035 : 0);
    const defense = prey.traits.resilience * 0.004 + prey.traits.speed * 0.002;
    const kills = Math.min(prey.population, probabilisticRound(rng, overlap * clamp(huntingPower - defense, 0.006, 0.075)));
    if (kills <= 0) continue;

    removeFromRange(world, prey, kills);
    const predatorGain = probabilisticRound(rng, kills * (predator.ecology.diet === "predator" ? 0.16 : 0.07));
    predator.population += predatorGain;
    reconcileRange(world, predator);

    if (kills >= 2 || chance(rng, 0.08)) {
      events.push({
        tick: world.tick,
        type: "predation",
        message: `${predator.name} hunted ${kills} ${prey.name}${predatorGain ? ` and gained ${predatorGain}` : ""}.`,
        impact: { predator: predator.id, prey: prey.id, kills, predatorGain }
      });
    }
  }
}

function regrowFood(rng, world) {
  for (const cell of world.map.cells) {
    const growth = BIOME_GROWTH[cell.biome] ?? 1;
    const ideal = BIOME_CLIMATE[cell.biome] ?? BIOME_CLIMATE.grassland;
    const climate = localClimate(world, cell);
    const climateFit = clamp(1 - Math.abs(climate.temperature - ideal.temperature) - Math.abs(climate.moisture - ideal.moisture), 0, 1);
    const noise = chance(rng, 0.2) ? 1 : 0;
    const climateGrowth = probabilisticRound(rng, growth * climateFit);
    cell.food = clamp(cell.food + climateGrowth + noise, 0, MAX_FOOD);
  }
}

function uniqueSpeciesIdentity(rng, world) {
  const baseName = `${choose(rng, SPECIES_PREFIXES)}${choose(rng, SPECIES_SUFFIXES)}`;
  const idBase = slugify(baseName);
  const usedIds = new Set([
    ...world.species.map((species) => species.id),
    ...world.extinctions.map((entry) => entry.species)
  ]);
  const usedNames = new Set([
    ...world.species.map((species) => species.name),
    ...world.extinctions.map((entry) => entry.name)
  ]);
  let name = baseName;
  let id = idBase;
  let suffix = 2;
  while (usedIds.has(id) || usedNames.has(name)) {
    id = `${idBase}-${suffix}`;
    name = `${baseName} ${suffix}`;
    suffix += 1;
  }
  return { id, name };
}

function createImmigrantSpecies(rng, world) {
  const preferredBiome = choose(rng, Object.keys(BIOME_GROWTH));
  const identity = uniqueSpeciesIdentity(rng, world);
  const species = {
    ...identity,
    population: randomInt(rng, 8, 18),
    traits: {
      preferredBiome,
      size: randomInt(rng, 1, 7),
      speed: randomInt(rng, 1, 8),
      fertility: randomInt(rng, 3, 8),
      resilience: randomInt(rng, 3, 8),
      metabolism: randomInt(rng, 2, 7)
    },
    origin: { tick: world.tick, type: "immigration" },
    capabilities: [],
    lineage: { parent: null, generation: 0, bornAt: world.tick },
    divergence: 0
  };
  species.ecology = { diet: defaultDiet(species) };
  species.range = distributePopulation(world, species);
  return species;
}

function createDescendantSpecies(rng, world, parent) {
  const identity = uniqueSpeciesIdentity(rng, world);
  const isolatedRange = [...parent.range].sort(
    (a, b) =>
      habitatSuitability(world, parent, getCell(world, a.x, a.y)) -
        habitatSuitability(world, parent, getCell(world, b.x, b.y)) ||
      b.population - a.population
  )[0];
  const sourceCell = getCell(world, isolatedRange.x, isolatedRange.y);
  const splitPopulation = Math.min(
    isolatedRange.population,
    Math.max(6, probabilisticRound(rng, parent.population * clamp(0.1 + parent.divergence * 0.008, 0.1, 0.24)))
  );
  isolatedRange.population -= splitPopulation;
  parent.population -= splitPopulation;
  parent.range = parent.range.filter((entry) => entry.population > 0);
  parent.divergence = Math.max(0, parent.divergence - 4);

  const traits = clone(parent.traits);
  traits.preferredBiome = sourceCell.biome;
  const changedTrait = choose(rng, ["size", "speed", "fertility", "resilience", "metabolism"]);
  traits[changedTrait] = clamp(traits[changedTrait] + (chance(rng, 0.5) ? -1 : 1), 1, 10);

  return {
    ...identity,
    population: splitPopulation,
    traits,
    origin: { tick: world.tick, type: "speciation", parent: parent.id },
    ecology: clone(parent.ecology),
    capabilities: [...parent.capabilities],
    lineage: {
      parent: parent.id,
      generation: (parent.lineage?.generation ?? 0) + 1,
      bornAt: world.tick
    },
    divergence: 0,
    range: [{ x: sourceCell.x, y: sourceCell.y, population: splitPopulation }]
  };
}

function createNovelSpecies(rng, world, source, parent) {
  if (source === "speciation" && parent) return createDescendantSpecies(rng, world, parent);
  return createImmigrantSpecies(rng, world);
}

function applyNovelty(rng, world, events) {
  const livingSpecies = world.species.filter((species) => species.population > 0);
  if (livingSpecies.length >= MAX_SPECIES) return;

  const candidates = livingSpecies.filter(
    (species) => species.population >= 45 && species.range.length >= 2 && species.divergence >= 2
  );
  const canSpeciate = candidates.length > 0 && chance(rng, 0.022 + Math.min(0.035, candidates.length * 0.004));
  const shouldImmigrate = (livingSpecies.length < 3 && chance(rng, 0.12)) || chance(rng, 0.006);
  if (!canSpeciate && !shouldImmigrate) return;

  const source = canSpeciate ? "speciation" : "immigration";
  const parent = canSpeciate
    ? choose(
        rng,
        candidates.sort((a, b) => b.divergence - a.divergence)
      )
    : null;
  const newcomer = createNovelSpecies(rng, world, source, parent);
  world.species.push(newcomer);

  events.push({
    tick: world.tick,
    type: source,
    message:
      source === "immigration"
        ? `${newcomer.name} immigrated into the ${newcomer.traits.preferredBiome}.`
        : `${newcomer.name} diverged from ${parent.name} in the ${newcomer.traits.preferredBiome}.`,
    impact: {
      species: newcomer.id,
      parent: parent?.id ?? null,
      population: newcomer.population,
      biome: newcomer.traits.preferredBiome
    }
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
  const livingSpecies = [];

  for (const species of world.species) {
    if (species.population > 0) {
      livingSpecies.push(species);
      continue;
    }

    if (!known.has(species.id)) {
      const extinction = {
        tick: world.tick,
        species: species.id,
        name: species.name,
        traits: clone(species.traits),
        ecology: clone(species.ecology),
        capabilities: clone(species.capabilities),
        lineage: clone(species.lineage),
        lastRange: clone(species.range),
        origin: species.origin ?? { tick: 0, type: "seed" },
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

  world.species = livingSpecies;
}

function recordMilestones(world, events) {
  const totalPopulation = world.species.reduce((sum, species) => sum + species.population, 0);
  const innovationCount = world.species.reduce((sum, species) => sum + species.capabilities.length, 0);
  const checks = [
    {
      id: "first-predator",
      reached: world.species.some((species) => species.ecology.diet === "predator"),
      message: "Predation became a permanent force in the ecosystem."
    },
    {
      id: "first-innovation",
      reached: innovationCount > 0,
      message: "The first major evolutionary innovation appeared."
    },
    {
      id: "high-diversity",
      reached: world.species.length >= 9,
      message: "The world entered its first high-diversity radiation."
    },
    {
      id: "population-thousand",
      reached: totalPopulation >= 1000,
      message: "The living population crossed one thousand individuals."
    },
    {
      id: "ten-extinctions",
      reached: world.extinctions.length >= 10,
      message: "Ten species now exist only in the fossil record."
    }
  ];

  const known = new Set(world.milestones.map((milestone) => milestone.id));
  for (const check of checks) {
    if (!check.reached || known.has(check.id)) continue;
    const milestone = { id: check.id, tick: world.tick, message: check.message };
    world.milestones.push(milestone);
    events.push({ tick: world.tick, type: "milestone", message: check.message, impact: { milestone: check.id } });
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

  evolveClimate(rng, world, events);
  regrowFood(rng, world);

  for (const species of shuffle(rng, world.species)) {
    if (species.population > 0) {
      migrateSpecies(rng, world, species, events);
      evolveSpecies(rng, world, species, events);
    }
  }

  applyTrophicInteractions(rng, world, events);
  applyRandomEvent(rng, world, events);
  applyNovelty(rng, world, events);
  recordExtinctions(world, events);
  recordMilestones(world, events);
  recordHistory(world);

  const updatedAt = nextTickTimestamp(world);
  world.updatedAt = updatedAt;
  world.latestTickAt = updatedAt;
  world.tickIntervalHours = TICK_INTERVAL_HOURS;
  world.events = [...events, ...world.events].slice(0, MAX_EVENTS);
}

function evolveWorld(world, ticks) {
  ensureRng(world);
  const rng = createRng(world.rng.state);
  const migrated = ensureOpenEndedSchema(world);
  if (migrated) {
    world.events = [
      {
        tick: world.tick,
        type: "migration",
        message: "The ecosystem entered its spatial and open-ended evolutionary phase.",
        impact: { schemaVersion: 2 }
      },
      ...world.events
    ].slice(0, MAX_EVENTS);
  }
  for (let i = 0; i < ticks; i += 1) {
    simulateTick(rng, world);
  }
  world.rng.state = rng.state();
  return world;
}

function main() {
  const ticks = Number.parseInt(process.argv[2] ?? "1", 10);
  if (!Number.isInteger(ticks) || ticks < 1) {
    throw new Error("Usage: node scripts/simulate.js [positive_tick_count]");
  }

  const world = loadWorld();
  evolveWorld(world, ticks);
  saveWorld(world);
  console.log(`Evolved world to tick ${world.tick}.`);
}

if (require.main === module) {
  main();
}

module.exports = {
  evolveWorld
};
