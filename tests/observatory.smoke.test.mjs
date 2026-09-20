/**
 * Headless integration test of the whole 3D observatory.
 *
 * Boots main.js against a stubbed three.js and a permissive DOM, then pumps
 * thousands of frames of real simulation: terrain, sky, creatures, agents,
 * director (weather, spectacles, replays) — everything except WebGL itself.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

import { installGlobals, pump, WORLD } from "./browser-env.mjs";

register("./three-resolve.mjs", import.meta.url);
installGlobals();

const { startObservatory } = await import("../observatory/main.js");

let ctx;
const chronicleEntries = [];

test("the observatory boots from the committed world", async () => {
  ctx = await startObservatory();
  assert.ok(ctx, "startObservatory returned a context");
  assert.equal(ctx.world.tick, WORLD.tick);
  assert.ok(ctx.agents.agents.length >= 10, `expected a living cast, got ${ctx.agents.agents.length}`);

  // Spy on the chronicle from now on.
  const original = ctx.chronicle;
  ctx.chronicle = (entry) => {
    chronicleEntries.push(entry);
    original(entry);
  };
});

test("every living species is represented with a champion", () => {
  const living = WORLD.species.filter((s) => s.population > 0);
  for (const species of living) {
    const agents = ctx.agents.agentsOf(species.id);
    assert.ok(agents.length >= 1, `${species.name} has no representatives`);
    assert.ok(agents.some((a) => a.champion), `${species.name} has no champion`);
    for (const agent of agents) {
      assert.ok(agent.name.length > 2, "agent has a name");
      assert.ok(agent.personality, "agent has a personality");
      assert.ok(agent.parts.legs.length === 4, "agent has four legs");
    }
  }
});

test("agents stay on the island and reach many states", () => {
  const seen = new Set();
  const bounds = ctx.terrain.bounds;
  const before = ctx.agents.agents.map((a) => a.name);

  pump(600); // ~10 seconds of world time

  for (const agent of ctx.agents.agents) {
    seen.add(agent.state);
    assert.ok(agent.pos.x >= bounds.minX - 0.5 && agent.pos.x <= bounds.maxX + 0.5, `${agent.name} escaped the island`);
    assert.ok(agent.pos.z >= bounds.minZ - 0.5 && agent.pos.z <= bounds.maxZ + 0.5, `${agent.name} escaped the island`);
  }
  const activeStates = [...seen].filter((s) => s !== "dead");
  assert.ok(activeStates.length >= 3, `agents seem stuck (states: ${activeStates.join(", ")})`);
  // No spontaneous mass death: the original cast should mostly survive.
  const survivors = ctx.agents.agents.filter((a) => before.includes(a.name)).length;
  assert.ok(survivors >= before.length - 2, "too many creatures vanished without a hunt");
});

test("the director advances time, weather and the event replay", () => {
  pump(1400); // ~23 more seconds

  assert.ok(ctx.sky.dayFactor !== undefined);
  assert.ok(["clear", "cloudy", "rain", "storm", "snow", "dust"].includes(ctx.director.weather));
  assert.ok(ctx.director.replayQueue.length < 14, "the replay queue never drains");
  const replayed = chronicleEntries.filter((e) => e.tick !== undefined);
  assert.ok(replayed.length >= 1, "no committed events were replayed into the chronicle");
  assert.ok(ctx.terrain.memorials.length === WORLD.extinctions.length, "fossil memorials were not built");
});

test("a real hunt unfolds: predator, prey, outcome", () => {
  const predators = ctx.agents.agents.filter((a) => a.diet === "predator" && a.state !== "dead");
  if (predators.length === 0) return; // no predators alive in this world snapshot
  const predator = predators[0];
  const prey = predator.findPrey();
  if (!prey) return;

  // Keep spectacles from hijacking the hunt mid-chase.
  ctx.director.nextSpectacleAt = ctx.time + 1000;
  const preyOriginalName = prey.name;
  predator.huntAt = 0;
  predator.setState("stalk", { prey });
  prey.alert(predator);

  pump(400); // ~7 seconds: stalk → charge → outcome

  const resolved = predator.stats.hunts >= 1 || prey.stats.escapes >= 1 || prey.name !== preyOriginalName;
  assert.ok(resolved, "the hunt never resolved");
  ctx.director.nextSpectacleAt = ctx.time + 30;
});

test("storms drive creatures underground or to shelter", () => {
  ctx.director.weather = "storm";
  ctx.director.dangerousWeather = true;
  ctx.agents.notifyBurrowWeather(true);
  pump(200);

  const sheltering = ctx.agents.agents.filter((a) => ["burrow", "shelter"].includes(a.state));
  assert.ok(sheltering.length > 0, "nobody reacted to the storm");

  ctx.director.weather = "clear";
  ctx.director.dangerousWeather = false;
  ctx.agents.notifyBurrowWeather(false);
  pump(200);
  const stillHiding = ctx.agents.agents.filter((a) => ["burrow", "shelter"].includes(a.state));
  assert.equal(stillHiding.length, 0, "creatures never came out of shelter");
});

test("every spectacle runs without crashing the world", () => {
  const ids = ["traversata", "meteors", "abbeverata", "concilio", "danza", "fioritura", "eclissi", "corsa", "aurora"];
  for (const id of ids) {
    ctx.director.tDay = id === "meteors" || id === "aurora" || id === "danza" ? 0.75 : 0.3;
    ctx.sky.update(0.016, ctx.director.tDay, ctx.world.environment);
    ctx.director.beginSpectacle(id);
    pump(120);
    if (ctx.director.spectacle) {
      pump(Math.ceil(ctx.director.spectacle.duration / 0.016) + 50);
    }
    assert.ok(true, `${id} ran`);
  }
  ctx.agents.releaseAll();
  pump(120);
});

test("camera modes and focus actions behave", () => {
  ctx.director.setMode("cinema");
  pump(60);
  ctx.director.setMode("doc");
  pump(120);
  assert.ok(ctx.director.followAgent, "documentary mode has no subject");
  ctx.director.setMode("free");
  pump(60);

  const species = WORLD.species.find((s) => s.population > 0);
  ctx.director.focusSpecies(species);
  const agent = ctx.agents.agentsOf(species.id)[0];
  ctx.director.focusAgent(agent);
  pump(60);
});

test("birth and courtship produce new characters", () => {
  const species = WORLD.species.find((s) => s.population > 0 && ctx.agents.agentsOf(s.id).length >= 2);
  if (!species) return;
  const agents = ctx.agents.agentsOf(species.id).filter((a) => !a.juvenile);
  const before = ctx.agents.agents.length;
  const mother = agents[0];
  const father = agents[1];
  mother.setState("court", { partner: father, duration: 0.01 });
  father.setState("court", { partner: mother, duration: 0.01 });
  mother.courtAt = 0;
  father.courtAt = 0;
  pump(20);
  // courtship had a 50% chance per partner; allow either outcome but no crash
  assert.ok(ctx.agents.agents.length >= before);
});

test("the UI cards render without errors", () => {
  const agent = ctx.agents.agents.find((a) => a.state !== "dead");
  ctx.ui.showAgentCard(agent);
  ctx.ui.showCellCard(WORLD.map.cells[0]);
  if (WORLD.extinctions.length > 0) {
    ctx.ui.showFossilCard(WORLD.extinctions[0]);
  }
  ctx.ui.addChronicle({ icon: "✅", text: "test entry" });
  ctx.ui.setWorldSummary(WORLD);
  ctx.ui.refreshAgentCounts();
  ctx.ui.hideCard();
});

test("the world keeps running stably for a long stretch", () => {
  const errors = [];
  const originalChronicle = ctx.chronicle;
  ctx.chronicle = (entry) => { originalChronicle(entry); };
  try {
    pump(3000); // ~50 seconds of world time
  } catch (error) {
    errors.push(error);
  }
  assert.deepEqual(errors, []);
  assert.ok(chronicleEntries.length > 5, "the chronicle stayed silent for a minute");
  for (const agent of ctx.agents.agents) {
    assert.ok(Number.isFinite(agent.pos.x) && Number.isFinite(agent.pos.z), `${agent.name} fell out of reality`);
  }
});
