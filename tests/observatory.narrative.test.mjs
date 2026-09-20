import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { makeRng, rngFrom, hashString } from "../observatory/rng.js";
import {
  characterName,
  championEpithet,
  translateEvent,
  translateEraName,
  speciesPalette,
  countRepresentatives,
  microStory,
  personalityFor,
  SPECTACLES
} from "../observatory/narrative.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORLD = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "world.json"), "utf8"));

test("rng is deterministic per seed", () => {
  const a = makeRng(1234);
  const b = makeRng(1234);
  const seqA = [a(), a(), a(), a()];
  const seqB = [b(), b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  assert.ok(seqA.every((v) => v >= 0 && v < 1));
});

test("hashString produces distinct seeds for distinct strings", () => {
  assert.notEqual(hashString("dustskipper"), hashString("cragback"));
  assert.equal(hashString("dustskipper"), hashString("dustskipper"));
  const rng = rngFrom("agent", "dustskipper", 3);
  assert.ok(rng() >= 0);
});

test("character names are stable and gendered lists are respected", () => {
  const rng = makeRng(42);
  const first = characterName(rng, "f");
  const repeat = characterName(makeRng(42), "f");
  assert.equal(first.name, repeat.name);
  assert.equal(first.gender, "f");
  const masculine = characterName(makeRng(7), "m");
  assert.equal(masculine.gender, "m");
  assert.ok(typeof masculine.name === "string" && masculine.name.length > 2);
});

test("champions of dying species earn the last-of-line epithet", () => {
  const dying = { population: 2, traits: { speed: 9, resilience: 9 } };
  assert.match(championEpithet(makeRng(1), dying), /Ultim[oa] della Stirpe/);
  const thriving = { population: 150, traits: { speed: 9, resilience: 3 } };
  const epithet = championEpithet(makeRng(1), thriving);
  assert.ok(!/Ultim/.test(epithet));
  assert.ok(epithet.length > 3);
});

test("every committed event type translates to an Italian entry", () => {
  const types = new Set(WORLD.events.map((event) => event.type));
  for (const type of types) {
    const sample = WORLD.events.find((event) => event.type === type);
    const entry = translateEvent(sample, WORLD);
    assert.equal(typeof entry.text, "string");
    assert.ok(entry.text.length > 10, `event type ${type} produced thin text`);
    assert.ok(entry.icon, `event type ${type} has no icon`);
  }
});

test("known event payloads translate with rich detail", () => {
  const bloom = WORLD.events.find((event) => event.type === "bloom");
  if (bloom) {
    const entry = translateEvent(bloom, WORLD);
    assert.match(entry.text, /fioritura/);
    assert.deepEqual(entry.cell, { x: bloom.impact.x, y: bloom.impact.y });
  }
  const mutation = WORLD.events.find((event) => event.type === "mutation");
  if (mutation) {
    const entry = translateEvent(mutation, WORLD);
    assert.match(entry.text, /mutazione/);
  }
});

test("synthetic event types translate", () => {
  const era = translateEvent({ type: "era", message: "Dust Era began.", impact: {} }, WORLD);
  assert.match(era.text, /Era della Polvere/);
  const extinction = translateEvent(
    { type: "extinction", impact: { species: "mossling" } },
    WORLD
  );
  assert.match(extinction.text, /Mossling/);
  assert.match(extinction.text, /Memoriale/);
  const catastrophe = translateEvent(
    { type: "catastrophe", message: "A wildfire transformed 5 cells around (2, 3).", impact: { event: "wildfire", x: 2, y: 3, cells: 5 } },
    WORLD
  );
  assert.match(catastrophe.text, /incendio/i);
});

test("era names translate", () => {
  assert.equal(translateEraName("Dust Era"), "Era della Polvere");
  assert.equal(translateEraName("Age of Heat"), "Età del Calore");
  assert.equal(translateEraName("Unknown Future Era"), "Unknown Future Era");
});

test("species palettes differ by diet and biome", () => {
  const grazer = speciesPalette({ name: "Dustskipper", ecology: { diet: "grazer" }, traits: { preferredBiome: "desert" } });
  const predator = speciesPalette({ name: "Cragback", ecology: { diet: "predator" }, traits: { preferredBiome: "mountain" } });
  assert.notEqual(grazer.body, predator.body);
  assert.match(grazer.body, /^hsl\(/);
});

test("representative counts scale with population", () => {
  assert.equal(countRepresentatives(0), 0);
  assert.equal(countRepresentatives(1), 1);
  assert.ok(countRepresentatives(154) > countRepresentatives(26));
  assert.ok(countRepresentatives(154) <= 9);
  assert.ok(countRepresentatives(3) >= 1);
});

test("micro stories interpolate character names", () => {
  const story = microStory("play", { name: "Brina", other: "Falco", roll: 0 });
  assert.match(story, /Brina/);
  assert.match(story, /Falco/);
  assert.ok(typeof microStory("meal", { name: "Falco", biome: "desert", roll: 0.5 }) === "string");
});

test("personalities expose behavioral modifiers", () => {
  const rng = makeRng(5);
  for (let i = 0; i < 20; i += 1) {
    const personality = personalityFor(rng);
    assert.ok(personality.mods.speedMul > 0 && personality.mods.speedMul < 2);
    assert.ok(personality.masculine && personality.feminine);
  }
});

test("spectacle catalog is complete and Italian", () => {
  for (const [id, spectacle] of Object.entries(SPECTACLES)) {
    assert.ok(spectacle.title.length > 3, `${id} lacks a title`);
    assert.ok(spectacle.subtitle.length > 3, `${id} lacks a subtitle`);
    assert.ok(spectacle.icon);
  }
});
