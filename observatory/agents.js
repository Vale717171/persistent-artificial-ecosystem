/**
 * Agents — the living cast of the observatory.
 *
 * Each visible creature is an individual: a name, a gender, a personality
 * archetype and a memory (meals, hunts, escapes, friendships). Populations
 * and ranges come from the committed world; everything the individuals *do*
 * is invented here, client-side, forever.
 */

import * as THREE from "three";
import { makeRng, hashString, randRange, pick } from "./rng.js";
import {
  characterName,
  personalityFor,
  championEpithet,
  countRepresentatives,
  microStory,
  agentMood
} from "./narrative.js";
import { buildCreature, makeLabel } from "./creatures.js";

export { stateLabel } from "./narrative.js";

export class AgentSystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.agents = [];
    this.time = 0;
    this.nextIndex = 0;
  }

  get hitMeshes() {
    return this.agents.filter((agent) => !agent.hidden).map((agent) => agent.parts.hitbox);
  }

  spawnForWorld() {
    const speciesList = this.ctx.world.species.filter((s) => s.population > 0);
    for (const species of speciesList) {
      this.spawnSpecies(species);
    }
  }

  spawnSpecies(species) {
    const count = countRepresentatives(species.population);
    const range = species.range?.length ? species.range : [];
    for (let i = 0; i < count; i += 1) {
      const entry = range.length
        ? range[Math.min(range.length - 1, Math.floor((i / count) * range.length))]
        : null;
      const cell = entry
        ? { x: entry.x, y: entry.y }
        : { x: Math.floor(this.ctx.world.map.width / 2), y: Math.floor(this.ctx.world.map.height / 2) };
      this.spawnAgent(species, cell, { champion: i === 0, juvenile: false });
    }
  }

  spawnAgent(species, cell, options = {}) {
    const index = this.nextIndex;
    this.nextIndex += 1;
    const agent = new Agent(this, species, cell, index, options);
    this.agents.push(agent);
    return agent;
  }

  agentsOf(speciesId) {
    return this.agents.filter((agent) => agent.speciesId === speciesId);
  }

  agentByName(name) {
    return this.agents.find((agent) => agent.name === name) ?? null;
  }

  centroidOf(speciesId) {
    const list = this.agentsOf(speciesId);
    if (list.length === 0) return new THREE.Vector3(0, 1, 0);
    const center = new THREE.Vector3();
    for (const agent of list) center.add(agent.pos);
    center.divideScalar(list.length);
    return center;
  }

  update(dt) {
    this.time += dt;

    for (const agent of this.agents) {
      agent.update(dt);
    }

    // Gentle separation so creatures never merge into one blob.
    const grounded = this.agents.filter((a) => !a.hidden && !a.flying && a.state !== "burrow");
    for (let i = 0; i < grounded.length; i += 1) {
      for (let j = i + 1; j < grounded.length; j += 1) {
        const a = grounded[i];
        const b = grounded[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const distanceSq = dx * dx + dz * dz;
        const minDistance = (a.radius + b.radius) * 0.85;
        if (distanceSq > 0.0001 && distanceSq < minDistance * minDistance) {
          const distance = Math.sqrt(distanceSq);
          const push = (minDistance - distance) * 0.5;
          const nx = dx / distance;
          const nz = dz / distance;
          a.pos.x -= nx * push;
          a.pos.z -= nz * push;
          b.pos.x += nx * push;
          b.pos.z += nz * push;
        }
      }
    }
  }

  /* ----------------------- spectacle hooks ------------------------- */

  beginGathering(agents, center, radius = 4.5) {
    agents.forEach((agent, index) => {
      if (agent.state === "dead") return;
      const angle = (index / Math.max(1, agents.length)) * Math.PI * 2;
      const slot = new THREE.Vector3(
        center.x + Math.cos(angle) * radius,
        center.y,
        center.z + Math.sin(angle) * radius
      );
      agent.setState("gather", { slot, center, until: this.time + 26 });
    });
  }

  beginMigration(species, destinationCell) {
    const list = this.agentsOf(species.id).filter((a) => a.state !== "dead");
    const destination = this.ctx.terrain.cellCenter(destinationCell.x, destinationCell.y);
    list.forEach((agent, index) => {
      const offset = new THREE.Vector3(
        Math.sin(index * 2.4) * 1.4,
        0,
        Math.cos(index * 1.7) * 1.4
      );
      agent.setState("migrate", {
        target: destination.clone().add(offset),
        until: this.time + 40
      });
      agent.homeCell = { x: destinationCell.x, y: destinationCell.y };
    });
    return list;
  }

  beginRace(agents, from, to) {
    this.raceWinner = null;
    agents.forEach((agent, index) => {
      const lane = (index - (agents.length - 1) / 2) * 1.1;
      agent.setState("race", {
        from: from.clone().add(new THREE.Vector3(lane, 0, 0)),
        to: to.clone().add(new THREE.Vector3(lane, 0, 0)),
        leg: 0,
        progress: 0,
        finished: false,
        until: this.time + 30
      });
    });
  }

  championsProclaim(agents) {
    for (const agent of agents) {
      if (agent.state === "dead") continue;
      agent.setState("proclaim", { until: this.time + 6 });
    }
  }

  releaseAll() {
    for (const agent of this.agents) {
      if (["gather", "migrate", "race", "proclaim"].includes(agent.state)) {
        agent.think();
      }
    }
  }

  notifyBurrowWeather(dangerous) {
    for (const agent of this.agents) {
      if (agent.state === "dead") continue;
      if (dangerous) {
        if (agent.capabilities.includes("burrowing")) {
          if (!["burrow", "shelter"].includes(agent.state)) agent.setState("burrow", { until: this.time + 30 });
        } else if (!["shelter", "burrow", "sleep"].includes(agent.state)) {
          agent.setState("shelter", {});
        }
      } else if (agent.state === "burrow" || agent.state === "shelter") {
        agent.think();
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* The individual                                                      */
/* ------------------------------------------------------------------ */

const _tmpA = new THREE.Vector3();
const _tmpB = new THREE.Vector3();

class Agent {
  constructor(system, species, cell, index, options = {}) {
    this.system = system;
    this.ctx = system.ctx;
    this.species = species;
    this.speciesId = species.id;
    this.speciesName = species.name;
    this.traits = species.traits ?? {};
    this.capabilities = species.capabilities ?? [];
    this.diet = species.ecology?.diet ?? "grazer";
    this.flying = this.capabilities.includes("flight");
    this.nocturnal = this.capabilities.includes("nocturnal");

    this.id = `${species.id}-${index}`;
    this.rng = makeRng(hashString(this.id) ^ 0x5f3a);

    const identity = characterName(this.rng);
    this.gender = identity.gender;
    this.name = identity.name;
    this.champion = !!options.champion;
    this.epithet = this.champion ? championEpithet(this.rng, species) : null;
    this.personality = personalityFor(this.rng);
    this.juvenile = !!options.juvenile;
    this.ageSec = options.juvenile ? 0 : randRange(this.rng, 120, 2400);

    // Home: the species' committed range cells.
    this.rangeCells = (species.range ?? []).map((entry) => ({ x: entry.x, y: entry.y }));
    this.homeCell = { x: cell.x, y: cell.y };

    const terrain = this.ctx.terrain;
    const spawnPos = terrain.randomPointInCell(this.rng, cell);
    this.pos = spawnPos;
    this.heading = this.rng() * Math.PI * 2;
    this.radius = 0.55 * (0.6 + (this.traits.size ?? 4) * 0.08);

    this.state = "idle";
    this.stateT = 0;
    this.stateData = {};
    this.thinkAt = 0;
    this.hunger = this.rng() * 0.5;
    this.walkPhase = this.rng() * 10;
    this.moveFactor = 0;
    this.hopY = 0;
    this.hopV = 0;
    this.hidden = false;
    this.respawnAt = 0;
    this.huntAt = 0;
    this.courtAt = 0;
    this.playAt = 0;
    this.proclaimAt = 60 + this.rng() * 120;
    this.zzzAt = 0;
    this.storyAt = 6 + this.rng() * 30;
    this.dangerAware = false;
    this.stats = { meals: 0, hunts: 0, huntsWon: 0, escapes: 0, friends: 0 };

    const built = buildCreature(species, {
      rng: this.rng,
      champion: this.champion,
      name: this.name,
      epithet: this.epithet,
      scaleMultiplier: 1
    });
    this.group = built.group;
    this.parts = built.parts;
    this.parts.hitbox.userData.agent = this;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
    this.ctx.scene.add(this.group);
  }

  get isGrown() {
    return !this.juvenile;
  }

  growth() {
    if (!this.juvenile) return 1;
    return Math.min(1, 0.5 + this.ageSec / 300);
  }

  baseSpeed() {
    const traitSpeed = this.traits.speed ?? 5;
    return (1.05 + traitSpeed * 0.24) * (this.personality.mods.speedMul ?? 1);
  }

  mood() {
    return agentMood(this.state);
  }

  story(kind, params = {}) {
    this.ctx.chronicle({
      icon: "✒️",
      text: microStory(kind, {
        name: this.name,
        species: this.speciesName,
        roll: this.rng(),
        ...params
      }),
      agent: this
    });
  }

  /* -------------------------- state machine ------------------------ */

  setState(state, data = {}) {
    this.state = state;
    this.stateData = data;
    this.stateT = 0;

    switch (state) {
      case "graze":
        this.stateData.duration = data.duration ?? randRange(this.rng, 3, 5.5);
        break;
      case "sleep":
        this.stateData.duration = data.duration ?? randRange(this.rng, 20, 45);
        break;
      case "stalk":
        this.stateData.duration = randRange(this.rng, 3.5, 6);
        break;
      case "charge":
        this.stateData.duration = randRange(this.rng, 3.2, 4.6);
        break;
      case "flee":
        this.stateData.duration = data.duration ?? randRange(this.rng, 3.5, 5);
        break;
      case "court":
        this.stateData.duration = 4.5;
        break;
      case "play":
        this.stateData.duration = randRange(this.rng, 5, 8);
        break;
      case "victory":
        this.stateData.duration = 3;
        break;
      case "sulk":
        this.stateData.duration = randRange(this.rng, 4, 6);
        break;
      case "shelter":
        this.stateData.duration = 60;
        break;
      case "burrow":
        this.stateData.duration = data.until ? data.until - this.system.time : 30;
        break;
      default:
        this.stateData.duration = data.duration ?? randRange(this.rng, 2, 4);
    }
  }

  think() {
    const now = this.system.time;
    const night = this.ctx.sky.nightFactor > 0.55;
    const dangerous = this.ctx.director?.dangerousWeather;

    if (dangerous) {
      if (this.capabilities.includes("burrowing")) {
        this.setState("burrow", { until: now + 30 });
      } else {
        this.setState("shelter", {});
      }
      return;
    }

    // Babies follow their elders.
    if (this.juvenile) {
      const elder = this.nearestKin(true);
      if (elder && this.rng() < 0.75) {
        this.setState("follow", { target: elder, duration: randRange(this.rng, 4, 8) });
        return;
      }
    }

    // Night behaviour
    if (night && !this.nocturnal) {
      const sleepy = 0.55 + this.personality.mods.sleepiness * 0.25 - this.hunger * 0.3;
      if (this.rng() < sleepy) {
        this.setState("sleep");
        return;
      }
      if (this.personality.id === "sognatore" && this.rng() < 0.45) {
        this.setState("stargaze", { duration: randRange(this.rng, 8, 18) });
        return;
      }
    }

    // Hunger first
    if (this.diet !== "predator" && this.hunger > 0.45 && this.rng() < 0.8) {
      this.setState("graze");
      return;
    }
    if (this.diet === "predator" && this.hunger > 0.5 && now > this.huntAt) {
      const prey = this.findPrey();
      if (prey) {
        this.huntAt = now + randRange(this.rng, 30, 60);
        // Silent approach: the prey notices only when the charge begins.
        this.setState("stalk", { prey });
        return;
      }
    }

    // Champions occasionally proclaim their glory.
    if (this.champion && now > this.proclaimAt && !night && this.rng() < 0.5) {
      this.proclaimAt = now + randRange(this.rng, 120, 260);
      this.setState("proclaim", { until: now + 5 });
      return;
    }

    // Play
    if (now > this.playAt && (this.juvenile || this.personality.mods.sociability > 1.3) && this.rng() < 0.45) {
      const partner = this.findPlayPartner();
      if (partner) {
        this.playAt = now + randRange(this.rng, 40, 80);
        partner.playAt = this.playAt;
        partner.setState("play", { partner: this, duration: randRange(this.rng, 5, 8) });
        this.setState("play", { partner });
        return;
      }
    }

    // Courtship
    if (this.isGrown && now > this.courtAt && !this.juvenile && this.hunger < 0.55 && this.rng() < 0.18) {
      const partner = this.findCourtPartner();
      if (partner) {
        this.courtAt = now + randRange(this.rng, 90, 180);
        partner.courtAt = this.courtAt;
        partner.setState("court", { partner: this, duration: 4.5 });
        this.setState("court", { partner });
        return;
      }
    }

    // Drinking at the wetlands
    if (this.rng() < 0.12 && this.ctx.terrain.waterPools.length > 0) {
      this.setState("drink");
      return;
    }

    // Default: wander or idle
    if (this.rng() < 0.45 + this.personality.mods.restlessness * 0.2) {
      this.setState("wander", { target: this.wanderTarget() });
    } else {
      this.setState("idle");
    }
  }

  wanderTarget() {
    const terrain = this.ctx.terrain;
    const cells = this.rangeCells.length ? this.rangeCells : [this.homeCell];
    let cell = pick(this.rng, cells);
    if (this.rng() < 0.25) {
      // Occasional exploration into a neighbouring cell of the same species.
      const other = pick(this.rng, cells);
      cell = { x: clampInt(other.x + randRange(this.rng, -1, 1), 0, terrain.map.width - 1), y: clampInt(other.y + randRange(this.rng, -1, 1), 0, terrain.map.height - 1) };
    }
    let point = terrain.randomPointInCell(this.rng, cell);

    // Personality shaping
    if (this.personality.mods.sociability > 1.4) {
      const kin = this.nearestKin(false);
      if (kin && this.rng() < 0.5) {
        point = new THREE.Vector3(
          kin.pos.x + randRange(this.rng, -2, 2),
          kin.pos.y,
          kin.pos.z + randRange(this.rng, -2, 2)
        );
      }
    } else if (this.personality.mods.sociability < 0.5) {
      const kin = this.nearestKin(false);
      if (kin) {
        const away = _tmpA.copy(this.pos).sub(kin.pos).normalize().multiplyScalar(3);
        point = this.pos.clone().add(away);
      }
    }
    if (this.personality.mods.curiosity > 1.5 && this.rng() < 0.25) {
      const stranger = pick(this.rng, this.system.agents.filter((a) => a !== this && !a.hidden));
      if (stranger) {
        point = new THREE.Vector3(
          stranger.pos.x + randRange(this.rng, -2, 2),
          stranger.pos.y,
          stranger.pos.z + randRange(this.rng, -2, 2)
        );
      }
    }
    return point;
  }

  nearestKin(adultsOnly) {
    let best = null;
    let bestDistance = Infinity;
    for (const other of this.system.agents) {
      if (other === this || other.speciesId !== this.speciesId || other.hidden) continue;
      if (adultsOnly && other.juvenile) continue;
      const distance = other.pos.distanceTo(this.pos);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = other;
      }
    }
    return best;
  }

  findPrey() {
    const candidates = this.system.agents.filter((agent) => {
      if (agent === this || agent.hidden || agent.state === "dead") return false;
      if (agent.diet === "predator") return false;
      if (agent.state === "burrow") return false;
      return agent.pos.distanceTo(this.pos) < 16;
    });
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.pos.distanceTo(this.pos) - b.pos.distanceTo(this.pos));
    const target = candidates[0];
    if (target.juvenile && this.rng() < 0.6) {
      const alternative = candidates.find((c) => !c.juvenile);
      return alternative ?? target;
    }
    return target;
  }

  findPlayPartner() {
    const candidates = this.system.agents.filter((agent) => {
      if (agent === this || agent.hidden) return false;
      if (["sleep", "burrow", "charge", "stalk", "flee", "dead", "shelter"].includes(agent.state)) return false;
      if (!agent.juvenile && agent.personality.mods.sociability < 1.1) return false;
      return agent.pos.distanceTo(this.pos) < 9;
    });
    return candidates.length ? pick(this.rng, candidates) : null;
  }

  findCourtPartner() {
    if (this.juvenile) return null;
    const sameSpecies = this.system.agents.filter((agent) => {
      if (agent === this || agent.speciesId !== this.speciesId) return false;
      if (agent.juvenile || agent.hidden) return false;
      if (["sleep", "burrow", "charge", "stalk", "flee", "dead"].includes(agent.state)) return false;
      return agent.pos.distanceTo(this.pos) < 12;
    });
    return sameSpecies.length ? pick(this.rng, sameSpecies) : null;
  }

  alert(predator) {
    if (["sleep", "burrow", "dead"].includes(this.state)) return;
    if (this.state === "flee") {
      this.stateData.threat = predator;
      return;
    }
    const brave = this.personality.mods.bravery ?? 1;
    const delay = brave > 1.6 ? 0.8 : 0.1;
    this.setState("flee", { threat: predator, duration: 4.5 + delay });
  }

  /* ---------------------------- update ----------------------------- */

  update(dt) {
    const now = this.system.time;
    this.ageSec += dt;
    this.hunger = Math.min(1.4, this.hunger + dt * (0.006 + (this.traits.metabolism ?? 3) * 0.0022));

    if (this.juvenile && this.ageSec > 300) {
      this.juvenile = false;
      if (this.rng() < 0.5) {
        this.story("grownup");
      }
    }

    if (this.state === "dead") {
      if (now >= this.respawnAt) this.respawn();
      return;
    }

    this.stateT += dt;

    switch (this.state) {
      case "idle":
        this.moveFactor = 0;
        if (this.stateT > (this.stateData.duration ?? 3)) this.think();
        break;

      case "wander":
        this.moveToward(this.stateData.target, dt, 0.55);
        if (this.arrived(this.stateData.target) || this.stateT > 9) this.think();
        break;

      case "graze":
        this.moveFactor = 0;
        if (Math.floor(this.stateT * 1.4) !== Math.floor((this.stateT - dt) * 1.4)) {
          this.ctx.effects.foodPick(_tmpA.copy(this.pos).add(_tmpB.set(0, 0.4, 0.4)));
        }
        if (this.stateT > (this.stateData.duration ?? 4)) {
          this.hunger = Math.max(0, this.hunger - 0.55);
          this.stats.meals += 1;
          if (this.rng() < 0.08) this.story("meal", { biome: this.currentBiome() });
          this.think();
        }
        break;

      case "drink": {
        const pool = this.nearestPool();
        if (!pool) {
          this.think();
          break;
        }
        this.moveToward(pool, dt, 0.6);
        if (this.arrived(pool, 1.4)) {
          this.moveFactor = 0;
          if (this.stateT > 3) {
            this.hunger = Math.max(0, this.hunger - 0.15);
            if (this.rng() < 0.15) this.story("drink");
            this.think();
          }
        } else if (this.stateT > 12) this.think();
        break;
      }

      case "sleep":
        this.moveFactor = 0;
        if (now > this.zzzAt) {
          this.zzzAt = now + 3;
          this.ctx.effects.zzz(_tmpA.copy(this.pos).add(_tmpB.set(0, 1.1, 0)));
        }
        if (this.stateT > (this.stateData.duration ?? 30) || this.hunger > 1.1) this.think();
        break;

      case "stargaze":
        this.moveFactor = 0;
        if (this.stateT > (this.stateData.duration ?? 10)) {
          if (this.rng() < 0.25) this.story("stargaze");
          this.think();
        }
        break;

      case "stalk": {
        const prey = this.stateData.prey;
        if (!prey || prey.state === "dead" || prey.hidden || this.stateT > (this.stateData.duration ?? 5)) {
          this.think();
          break;
        }
        this.moveToward(prey.pos, dt, 0.4);
        if (prey.pos.distanceTo(this.pos) < 4.6) {
          const catchProb = clamp01(
            0.5 +
            ((this.traits.speed ?? 5) - (prey.traits.speed ?? 5)) * 0.045 +
            ((this.traits.size ?? 4) - (prey.traits.size ?? 4)) * 0.022 +
            (prey.personality.id === "pigro" ? 0.08 : 0)
          );
          this.setState("charge", { prey, willCatch: this.rng() < catchProb });
          prey.alert(this);
        }
        break;
      }

      case "charge": {
        const prey = this.stateData.prey;
        if (!prey || prey.state === "dead" || prey.hidden) {
          this.think();
          break;
        }
        this.moveToward(prey.pos, dt, 1.6, true);
        const catchDistance = 0.85 * (this.radius + prey.radius) + 0.25;
        if (prey.pos.distanceTo(this.pos) < catchDistance && this.stateData.willCatch) {
          this.huntSuccess(prey);
        } else if (this.stateT > (this.stateData.duration ?? 4)) {
          this.huntFailure(prey);
        }
        break;
      }

      case "flee": {
        const threat = this.stateData.threat;
        const away = threat
          ? _tmpA.copy(this.pos).sub(threat.pos).setY(0).normalize()
          : _tmpA.set(Math.sin(this.heading), 0, Math.cos(this.heading));
        if (away.lengthSq() < 0.01) away.set(1, 0, 0);
        const zigzag = Math.sin(this.stateT * 5) * 0.7;
        const dir = _tmpB.set(
          away.x * Math.cos(zigzag) - away.z * Math.sin(zigzag),
          0,
          away.x * Math.sin(zigzag) + away.z * Math.cos(zigzag)
        );
        this.step(dir, dt, 1.75);
        if (this.stateT > (this.stateData.duration ?? 4.5)) {
          this.stats.escapes += 1;
          if (this.rng() < 0.3) this.story("escape");
          this.think();
        }
        break;
      }

      case "victory":
        this.moveFactor = 0;
        if (this.stateT > 3) this.think();
        break;

      case "sulk":
        this.moveFactor = 0;
        if (this.stateT > (this.stateData.duration ?? 5)) this.think();
        break;

      case "court": {
        const partner = this.stateData.partner;
        if (!partner || partner.state === "dead") {
          this.think();
          break;
        }
        this.moveToward(partner.pos, dt, 0.7);
        const distance = partner.pos.distanceTo(this.pos);
        if (distance < 1.8) {
          this.moveFactor = 0;
          if (Math.floor(this.stateT * 2) !== Math.floor((this.stateT - dt) * 2)) {
            this.ctx.effects.heartBurst(_tmpA.copy(this.pos).lerp(partner.pos, 0.5).add(_tmpB.set(0, 1, 0)), 3);
          }
        }
        if (this.stateT > (this.stateData.duration ?? 4.5)) {
          if (this.rng() < 0.5) this.tryBirth(partner);
          this.think();
        }
        break;
      }

      case "play": {
        const partner = this.stateData.partner;
        if (!partner || partner.state === "dead" || partner.hidden) {
          this.think();
          break;
        }
        const midpoint = _tmpA.copy(this.pos).lerp(partner.pos, 0.5);
        if (this.pos.distanceTo(partner.pos) > 2.4) {
          this.moveToward(partner.pos, dt, 1.0);
        } else {
          this.moveFactor = 0.3;
          this.heading += dt * 2.2;
        }
        if (this.hopY <= 0.01 && this.rng() < dt * 1.4) this.hop(2.6);
        if (this.stateT > (this.stateData.duration ?? 6)) {
          if (partner.speciesId !== this.speciesId) {
            this.stats.friends += 1;
            if (this.rng() < 0.4) this.story("friendship", { other: partner.name });
          } else if (this.rng() < 0.25) {
            this.story("play", { other: partner.name });
          }
          this.think();
        }
        break;
      }

      case "follow": {
        const elder = this.stateData.target;
        if (!elder || elder.state === "dead" || elder.hidden) {
          this.think();
          break;
        }
        if (this.pos.distanceTo(elder.pos) > 1.6) {
          this.moveToward(elder.pos, dt, 1.05);
        } else {
          this.moveFactor = 0;
        }
        if (this.stateT > (this.stateData.duration ?? 6)) this.think();
        break;
      }

      case "burrow":
        this.moveFactor = 0;
        if (this.stateT < 0.6 && !this.stateData.dug) {
          this.stateData.dug = true;
          this.ctx.effects.digPuff(this.pos);
        }
        if (this.stateT > (this.stateData.duration ?? 30) || !this.ctx.director?.dangerousWeather) {
          if (this.stateData.dug) this.ctx.effects.digPuff(this.pos);
          this.think();
        }
        break;

      case "shelter": {
        const shelter = this.shelterPoint();
        this.moveToward(shelter, dt, 1.35);
        if (this.arrived(shelter, 1.5)) {
          this.moveFactor = 0;
          this.pos.x += Math.sin(now * 22) * 0.004; // trembling under the storm
        }
        if (!this.ctx.director?.dangerousWeather) this.think();
        break;
      }

      case "gather": {
        const slot = this.stateData.slot;
        if (slot) {
          if (this.pos.distanceTo(slot) > 1.4) {
            this.moveToward(slot, dt, 0.95);
          } else {
            this.moveFactor = 0;
            const center = this.stateData.center;
            if (center) this.heading = dampAngle(this.heading, Math.atan2(center.x - this.pos.x, center.z - this.pos.z), 4, dt);
            if (this.hopY <= 0.01 && this.rng() < dt * 0.4) this.hop(2.2);
          }
        }
        if (this.stateT > (this.stateData.until ? this.stateData.until - this.system.time : 20)) this.think();
        break;
      }

      case "migrate": {
        const target = this.stateData.target;
        if (!target) {
          this.think();
          break;
        }
        this.moveToward(target, dt, 0.85);
        if (this.arrived(target, 1.4) || this.stateT > (this.stateData.until ? this.stateData.until - this.system.time : 30)) {
          this.setState("graze", { duration: randRange(this.rng, 2, 4) });
        }
        break;
      }

      case "race": {
        const data = this.stateData;
        const target = data.leg === 0 ? data.from : data.to;
        if (target) {
          this.moveToward(target, dt, 1.5);
          if (this.arrived(target, 1.1)) {
            if (data.leg === 0) {
              data.leg = 1;
            } else if (!data.finished) {
              data.finished = true;
              if (!this.system.raceWinner) {
                this.system.raceWinner = this;
                this.ctx.effects.sparkleBurst(this.pos, 0xffe9a8, 14);
                this.story("race");
              }
            }
          }
        }
        if (this.stateT > 28 || (data.finished && this.stateT > 10)) this.think();
        break;
      }

      case "proclaim":
        this.moveFactor = 0;
        if (!this.stateData.done) {
          this.stateData.done = true;
          this.ctx.effects.beam(this.pos, 0xf5c542, 3.4);
          this.ctx.effects.sparkleBurst(this.pos, 0xf5c542, 12, { up: 3 });
          this.ctx.sound?.chime(523.25);
          this.ctx.sound?.chime(659.25, 0.12);
          if (this.champion) this.story("champion", { epithet: this.epithet });
        }
        if (this.stateT > 5) this.think();
        break;

      default:
        this.think();
    }

    // Ambient micro-stories
    if (now > this.storyAt) {
      this.storyAt = now + randRange(this.rng, 45, 130);
      if (this.rng() < 0.5) {
        if (this.state === "sleep" && this.rng() < 0.5) this.story("sleep");
        else if (this.personality.id === "curioso") this.story("curious");
      }
    }

    this.integratePhysics(dt);
    this.animate(dt);
  }

  huntSuccess(prey) {
    this.stats.hunts += 1;
    this.stats.huntsWon += 1;
    this.hunger = 0;
    this.ctx.effects.deathPuff(prey.pos, prey.parts.palette.body);
    this.ctx.sound?.chime(196, 0.3);
    prey.die();
    if (this.rng() < 0.75) this.story("huntWin");
    this.setState("victory");
  }

  huntFailure(prey) {
    this.stats.hunts += 1;
    prey.stats.escapes += 1;
    if (this.rng() < 0.5) this.story("huntLose");
    this.setState("sulk");
  }

  tryBirth(partner) {
    const system = this.system;
    const existing = system.agentsOf(this.speciesId).filter((a) => a.state !== "dead").length;
    const cap = countRepresentatives(this.species.population) + 2;
    if (existing >= cap) return;

    // The world paces its own joy: at most one birth every ~50 seconds.
    const nextBirthAt = system.nextBirthAllowedAt ?? 0;
    if (system.time < nextBirthAt) return;
    system.nextBirthAllowedAt = system.time + randRange(this.rng, 50, 95);

    // Hard times (a collapsing committed population) postpone births.
    const history = this.ctx.world.history ?? [];
    if (history.length > 6) {
      const past = history[history.length - 6].populations?.[this.speciesId];
      if (past && this.species.population < past * 0.65) {
        if (this.rng() < 0.5) {
          this.ctx.chronicle({
            icon: "🥀",
            text: `Tempi duri per i ${this.speciesName}: le coppie rimandano la prole.`
          });
        }
        return;
      }
    }

    const baby = system.spawnAgent(this.species, this.homeCell, { juvenile: true });
    baby.pos.copy(this.pos).lerp(partner.pos, 0.5);
    baby.setState("follow", { target: this, duration: 8 });
    this.ctx.effects.birthSparkle(baby.pos);
    this.ctx.sound?.chime(783.99, 0.2);
    this.ctx.chronicle({
      icon: "🐣",
      text: microStory("birth", {
        species: this.speciesName,
        baby: baby.name,
        roll: this.rng()
      }),
      agent: baby
    });
  }

  die() {
    this.state = "dead";
    this.hidden = true;
    this.respawnAt = this.system.time + 3;
    this.group.visible = false;
  }

  respawn() {
    const cells = this.rangeCells.length ? this.rangeCells : [this.homeCell];
    const cell = pick(this.rng, cells);
    const oldName = this.name;
    const identity = characterName(this.rng);
    this.name = identity.name;
    this.gender = identity.gender;
    if (this.champion) this.epithet = championEpithet(this.rng, this.species);
    this.personality = personalityFor(this.rng);
    this.pos.copy(this.ctx.terrain.randomPointInCell(this.rng, cell));
    this.hidden = false;
    this.group.visible = true;
    this.hunger = 0.2;
    this.stats = { meals: 0, hunts: 0, huntsWon: 0, escapes: 0, friends: 0 };

    // A new individual deserves a new nameplate.
    this.group.remove(this.parts.label);
    this.parts.label = makeLabel(this.name, this.champion, this.epithet);
    this.parts.label.position.y = 1.5;
    this.group.add(this.parts.label);

    this.setState("wander", { target: this.ctx.terrain.randomPointInCell(this.rng, cell) });
    this.story("replacement", { oldName });
  }

  /* --------------------------- movement ---------------------------- */

  moveToward(target, dt, speedMul, direct = false) {
    if (!target) return;
    _tmpA.set(target.x - this.pos.x, 0, target.z - this.pos.z);
    const distance = _tmpA.length();
    if (distance < 0.001) {
      this.moveFactor = 0;
      return;
    }
    if (direct) {
      this.heading = dampAngle(this.heading, Math.atan2(_tmpA.x, _tmpA.z), 10, dt);
    } else {
      this.heading = dampAngle(this.heading, Math.atan2(_tmpA.x, _tmpA.z), 5, dt);
    }
    const speed = this.baseSpeed() * speedMul;
    const step = Math.min(distance, speed * dt);
    this.pos.x += Math.sin(this.heading) * step;
    this.pos.z += Math.cos(this.heading) * step;
    this.moveFactor = speedMul;
    this.clampToIsland();
  }

  step(direction, dt, speedMul) {
    const speed = this.baseSpeed() * speedMul;
    this.heading = dampAngle(this.heading, Math.atan2(direction.x, direction.z), 8, dt);
    this.pos.x += Math.sin(this.heading) * speed * dt;
    this.pos.z += Math.cos(this.heading) * speed * dt;
    this.moveFactor = speedMul;
    this.clampToIsland();
  }

  clampToIsland() {
    const bounds = this.ctx.terrain.bounds;
    this.pos.x = Math.max(bounds.minX, Math.min(bounds.maxX, this.pos.x));
    this.pos.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, this.pos.z));
  }

  arrived(target, tolerance = 0.8) {
    if (!target) return true;
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    return dx * dx + dz * dz < tolerance * tolerance;
  }

  hop(strength) {
    this.hopV = strength;
  }

  integratePhysics(dt) {
    if (this.hopV !== 0 || this.hopY > 0) {
      this.hopV -= 9.5 * dt;
      this.hopY = Math.max(0, this.hopY + this.hopV * dt);
      if (this.hopY === 0) this.hopV = 0;
    }

    const ground = this.ctx.terrain.heightAt(this.pos.x, this.pos.z);
    let targetY;
    if (this.state === "burrow") {
      targetY = ground - 0.5;
    } else if (this.flying) {
      targetY = ground + 1.9 + Math.sin(this.system.time * 1.7 + this.walkPhase) * 0.25;
    } else {
      targetY = ground + this.hopY;
    }
    this.pos.y += (targetY - this.pos.y) * Math.min(1, dt * 9);
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;

    const growth = this.growth();
    this.group.scale.setScalar(this.parts.scale * growth);
  }

  /* --------------------------- animation --------------------------- */

  animate(dt) {
    const parts = this.parts;
    const t = this.system.time;
    const moving = this.moveFactor > 0.05;
    const stride = 2.1 + (this.traits.speed ?? 5) * 0.16;
    if (moving) this.walkPhase += dt * stride * (0.6 + this.moveFactor);
    else this.walkPhase += dt * 0.8;

    const amp = moving ? 0.5 * Math.min(1.3, this.moveFactor) : 0;
    parts.legs.forEach((leg, index) => {
      const phase = index === 0 || index === 3 ? this.walkPhase : this.walkPhase + Math.PI;
      leg.rotation.x = Math.sin(phase) * amp;
    });

    parts.rig.position.y = parts.baseRigY
      + (moving ? Math.abs(Math.sin(this.walkPhase)) * 0.05 * Math.min(1.2, this.moveFactor) : 0)
      + (this.state === "sleep" ? -parts.baseRigY * 0.55 : 0)
      + (this.state === "stalk" ? -0.12 : 0)
      + (this.state === "charge" ? -0.06 : 0);

    // Head gestures
    let headPitch = 0;
    if (this.state === "graze" || this.state === "drink") headPitch = 0.85;
    else if (this.state === "stargaze") headPitch = -0.65;
    else if (this.state === "sulk") headPitch = 0.3;
    else if (this.state === "charge" || this.state === "stalk") headPitch = -0.18;
    else headPitch = Math.sin(t * 0.7 + this.walkPhase * 0.13) * 0.08;
    parts.head.rotation.x += (headPitch - parts.head.rotation.x) * Math.min(1, dt * 5);

    // Tail
    const wag = this.state === "play" || this.state === "court" ? 3.2 : moving ? 1.6 : 0.9;
    parts.tail.rotation.y = Math.sin(t * wag + this.walkPhase) * 0.4;

    // Eyes: sleeping creatures close them, nocturnal ones glow at night.
    const sleeping = this.state === "sleep";
    for (const eye of parts.eyes) {
      eye.scale.y += ((sleeping ? 0.12 : 1) - eye.scale.y) * Math.min(1, dt * 6);
    }
    const night = this.ctx.sky?.nightFactor ?? 0;
    parts.eyeMaterial.emissiveIntensity = this.nocturnal ? night * 1.6 : 0;
    if (parts.glowMaterial) {
      parts.glowMaterial.emissiveIntensity = 0.25 + night * 0.9 + Math.sin(t * 2 + this.walkPhase) * 0.1;
    }
    if (parts.stinger) {
      parts.stinger.material.emissiveIntensity = 0.6 + Math.sin(t * 3.2) * 0.3;
    }

    // Wings
    if (parts.wings) {
      const flap = Math.sin(t * 17 + this.walkPhase) * (this.flying ? 0.75 : 0.25);
      parts.wings[0].rotation.z = flap;
      parts.wings[1].rotation.z = -flap;
    }

    // Breathing
    const breathe = 1 + Math.sin(t * 2.3 + this.walkPhase) * 0.02;
    parts.body.scale.set(parts.bodyScale.x * breathe, parts.bodyScale.y, parts.bodyScale.z * breathe);

    // Champion aura pulse
    if (parts.aura) {
      parts.aura.material.opacity = 0.2 + Math.sin(t * 1.8) * 0.08;
    }

    // Label visibility: champions always, others when the camera is close.
    const camera = this.ctx.camera;
    let labelOpacity = this.champion ? 0.9 : 0;
    if (camera) {
      const distance = camera.position.distanceTo(this.pos);
      if (distance < 16) {
        labelOpacity = Math.max(labelOpacity, Math.min(1, (16 - distance) / 7));
      }
    }
    if (this.ctx.director?.followAgent === this) labelOpacity = 1;
    parts.label.material.opacity += (labelOpacity - parts.label.material.opacity) * Math.min(1, dt * 4);
  }

  /* ---------------------------- helpers ---------------------------- */

  currentBiome() {
    const cell = this.ctx.terrain.cellAt(this.pos.x, this.pos.z);
    return cell?.biome ?? "grassland";
  }

  nearestPool() {
    const pools = this.ctx.terrain.waterPools;
    if (!pools.length) return null;
    let best = null;
    let bestDistance = Infinity;
    for (const pool of pools) {
      const distance = pool.mesh.position.distanceTo(this.pos);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = pool;
      }
    }
    return bestDistance < 18 ? best.mesh.position : null;
  }

  shelterPoint() {
    if (!this._shelterPoint) {
      const forests = this.ctx.terrain.cellsOfBiome("forest");
      if (forests.length) {
        const cell = forests.reduce((best, cell) => {
          const center = this.ctx.terrain.cellCenter(cell.x, cell.y);
          const bestCenter = this.ctx.terrain.cellCenter(best.x, best.y);
          return center.distanceTo(this.pos) < bestCenter.distanceTo(this.pos) ? cell : best;
        }, forests[0]);
        this._shelterPoint = this.ctx.terrain.cellCenter(cell.x, cell.y);
      } else {
        this._shelterPoint = this.ctx.terrain.cellCenter(this.homeCell.x, this.homeCell.y);
      }
    }
    return this._shelterPoint;
  }
}

function clamp01(value) {
  return Math.max(0.15, Math.min(0.85, value));
}

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function dampAngle(current, target, lambda, dt) {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * (1 - Math.exp(-lambda * dt));
}
