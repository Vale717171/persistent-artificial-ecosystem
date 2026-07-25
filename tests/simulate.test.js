const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { evolveWorld } = require("../scripts/simulate.js");

const SOURCE_WORLD = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "world.json"), "utf8")
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertWorldInvariants(world) {
  assert.equal(world.schemaVersion, 2);
  assert.ok(world.environment.temperature >= 0 && world.environment.temperature <= 1);
  assert.ok(world.environment.moisture >= 0 && world.environment.moisture <= 1);
  assert.ok(world.species.length <= 12);

  for (const species of world.species) {
    assert.ok(species.population > 0);
    assert.ok(["grazer", "omnivore", "predator"].includes(species.ecology.diet));
    assert.ok(Array.isArray(species.capabilities));
    assert.ok(Array.isArray(species.range));
    assert.ok(species.range.length > 0);
    assert.equal(
      species.range.reduce((sum, entry) => sum + entry.population, 0),
      species.population
    );
    for (const entry of species.range) {
      assert.ok(entry.x >= 0 && entry.x < world.map.width);
      assert.ok(entry.y >= 0 && entry.y < world.map.height);
      assert.ok(entry.population > 0);
    }
  }
}

test("version 1 worlds migrate without losing their fossil record", () => {
  const world = clone(SOURCE_WORLD);
  const startingTick = world.tick;
  const startingExtinctions = clone(world.extinctions);

  evolveWorld(world, 1);

  assert.equal(world.tick, startingTick + 1);
  assert.deepEqual(world.extinctions.slice(0, startingExtinctions.length), startingExtinctions);
  assertWorldInvariants(world);
});

test("the same seed and state produce the same future", () => {
  const first = clone(SOURCE_WORLD);
  const second = clone(SOURCE_WORLD);

  evolveWorld(first, 80);
  evolveWorld(second, 80);

  assert.deepEqual(first, second);
});

test("long histories retain valid spatial populations and produce novelty", () => {
  const world = clone(SOURCE_WORLD);
  evolveWorld(world, 600);

  assertWorldInvariants(world);
  assert.ok(world.environment.eraHistory.length > 0);
  assert.ok(world.milestones.some((milestone) => milestone.id === "first-predator"));
  assert.ok(
    world.species.some((species) => species.capabilities.length > 0) ||
      world.extinctions.some((species) => species.capabilities?.length > 0)
  );
  assert.ok(
    world.species.some((species) => species.lineage?.parent) ||
      world.extinctions.some((species) => species.origin?.type === "speciation")
  );
});
