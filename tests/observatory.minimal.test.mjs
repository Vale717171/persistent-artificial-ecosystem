/**
 * Minimal-world integration test.
 *
 * Boots the observatory against a synthetic world with none of the features
 * the committed world takes for granted: a single species, no wetlands, no
 * predators, no extinctions, no capabilities. Anything that silently assumed
 * those features exist will crash here.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

import { installGlobals, pump, setWorld } from "./browser-env.mjs";

register("./three-resolve.mjs", import.meta.url);

const MINIMAL_WORLD = {
  version: 1,
  tick: 5,
  updatedAt: "2026-09-20T00:00:00.000Z",
  latestTickAt: "2026-09-20T00:00:00.000Z",
  tickIntervalHours: 6,
  schemaVersion: 2,
  map: {
    width: 4,
    height: 3,
    cells: [
      { x: 0, y: 0, biome: "grassland", food: 6 },
      { x: 1, y: 0, biome: "grassland", food: 4 },
      { x: 2, y: 0, biome: "forest", food: 8 },
      { x: 3, y: 0, biome: "forest", food: 7 },
      { x: 0, y: 1, biome: "grassland", food: 5 },
      { x: 1, y: 1, biome: "mountain", food: 2 },
      { x: 2, y: 1, biome: "mountain", food: 3 },
      { x: 3, y: 1, biome: "desert", food: 1 },
      { x: 0, y: 2, biome: "desert", food: 2 },
      { x: 1, y: 2, biome: "desert", food: 1 },
      { x: 2, y: 2, biome: "grassland", food: 9 },
      { x: 3, y: 2, biome: "grassland", food: 6 }
    ]
  },
  species: [
    {
      id: "lonesome",
      name: "Lonesome",
      population: 6,
      traits: {
        preferredBiome: "grassland",
        size: 4,
        speed: 5,
        fertility: 5,
        resilience: 5,
        metabolism: 5
      },
      range: [{ x: 0, y: 0, population: 4 }, { x: 2, y: 2, population: 2 }],
      ecology: { diet: "grazer" },
      capabilities: [],
      lineage: { parent: null, generation: 0, bornAt: 0 },
      divergence: 0
    }
  ],
  events: [
    { tick: 4, type: "population", message: "Lonesome changed by +2 births and -0 deaths.", impact: { species: "lonesome", births: 2, deaths: 0, population: 6 } },
    { tick: 2, type: "bloom", message: "A food bloom appeared in the grassland at (2, 2).", impact: { x: 2, y: 2, biome: "grassland" } }
  ],
  history: [{ tick: 4, populations: { lonesome: 6 } }],
  extinctions: [],
  rng: { algorithm: "xorshift32", seed: 12345, state: 12345 },
  environment: {
    temperature: 0.5,
    moisture: 0.5,
    volatility: 0.16,
    temperatureTrend: 0,
    moistureTrend: 0,
    era: { name: "Quiet Bloom", kind: "stable", sinceTick: 0 },
    eraHistory: []
  },
  milestones: []
};

setWorld(MINIMAL_WORLD);
installGlobals();

const { startObservatory } = await import("../observatory/main.js");

let ctx;

test("boots on a minimal world with no wetlands, predators or fossils", async () => {
  ctx = await startObservatory();
  assert.ok(ctx);
  assert.equal(ctx.world.tick, 5);

  // No wetlands → no pools, no memorials, no predators.
  assert.equal(ctx.terrain.waterPools.length, 0);
  assert.equal(ctx.terrain.memorials.length, 0);

  const agents = ctx.agents.agentsOf("lonesome");
  assert.ok(agents.length >= 3, "the single species is represented");
  assert.ok(agents.some((a) => a.champion));
});

test("agents live on a minimal world without falling off or crashing", () => {
  pump(900); // ~15 seconds of world time

  const bounds = ctx.terrain.bounds;
  for (const agent of ctx.agents.agents) {
    assert.ok(agent.pos.x >= bounds.minX - 0.5 && agent.pos.x <= bounds.maxX + 0.5);
    assert.ok(agent.pos.z >= bounds.minZ - 0.5 && agent.pos.z <= bounds.maxZ + 0.5);
  }
  const states = new Set(ctx.agents.agents.map((a) => a.state));
  assert.ok(states.size >= 2, `agents frozen in a single state: ${[...states]}`);
});

test("spectacles degrade gracefully on a minimal world", () => {
  for (const id of ["concilio", "abbeverata", "corsa", "traversata", "meteors"]) {
    ctx.director.tDay = 0.3;
    ctx.sky.update(0.016, ctx.director.tDay, ctx.world.environment);
    ctx.director.beginSpectacle(id);
    pump(150);
    if (ctx.director.spectacle) {
      pump(Math.ceil(ctx.director.spectacle.duration / 0.016) + 40);
    }
  }
  ctx.agents.releaseAll();
  pump(120);
  assert.ok(true);
});
