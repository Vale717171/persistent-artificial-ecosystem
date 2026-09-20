/**
 * Director — the invisible hand that makes the world worth watching.
 *
 * Runs the day/night cycle, a climate-driven weather machine, a scheduler of
 * invented spectacles (the Great Crossing, the Truce at the Pond, the
 * Champions' Council…), a replay of the world's real committed events, and
 * the cinematic/documentary camera.
 */

import * as THREE from "three";
import { makeRng, pick, randRange, randInt, chance } from "./rng.js";
import { translateEvent, translateEraName, describeWorldClock, microStory, SPECTACLES } from "./narrative.js";

const DAY_LENGTH = 150;
const WEATHER_FLAVOR = {
  clear: ["Il cielo è terso: una giornata perfetta per esistere."],
  cloudy: ["Nuvole pigre attraversano il cielo come mandrie al pascolo."],
  rain: ["La pioggia tamburella dolce sulle foglie.", "Gocce di pioggia ricuciono il cielo alla terra."],
  storm: ["Un tuono rotola oltre l'orizzonte.", "I lampi accendono il mondo per un battito di ciglia."],
  snow: ["Fiocchi di neve scendono come pensieri lenti."],
  dust: ["Il vento solleva polvere dorata dalle dune.", "Una cortina di sabbia confonde i contorni del mondo."]
};
const ERA_FLAVOR = {
  warm: ["Il calore tremola sopra le dune.", "L'aria è densa come miele caldo."],
  cold: ["Il gelo disegna fiori di brina sulle pietre."],
  wet: ["Le piogge non smettono di sussurrare."],
  dry: ["La polvere sa di tempo antico.", "Ogni crepa del terreno racconta di sete."],
  stable: ["Il mondo respira piano, in perfetto equilibrio."]
};

export class Director {
  constructor(ctx) {
    this.ctx = ctx;
    this.rng = makeRng(0xd12ec70);

    this.tDay = 0.32; // late morning
    this.dayLength = DAY_LENGTH;
    this.speed = 1;

    this.weather = "clear";
    this.weatherUntil = 35;
    this.dangerousWeather = false;
    this.nextLightningAt = 0;

    this.mode = "cinema";
    this.followAgent = null;
    this.autoDocRotate = true;
    this.docSwitchAt = 0;

    this.spectacle = null;
    this.spectacleId = null;
    this.nextSpectacleAt = 34;
    this.lastSpectacleId = null;

    const events = [...(ctx.world.events ?? [])].sort((a, b) => a.tick - b.tick);
    this.replayQueue = events.slice(-14);
    this.nextReplayAt = 8;

    this.flavorAt = 26;
    this.fishAt = 10;

    this.shot = null;
    this.nextShotAt = 0;
    this.camPos = new THREE.Vector3(40, 26, 46);
    this.camTarget = new THREE.Vector3(0, 1, 0);
    this.desiredPos = this.camPos.clone();
    this.desiredTarget = this.camTarget.clone();
    this.shotAzimuth = 0.8;

    this.eclipse = 0;
    this.clockAt = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Modes and focus                                                     */
  /* ------------------------------------------------------------------ */

  setMode(mode, options = {}) {
    this.mode = mode;
    if (mode === "doc") {
      this.followAgent = options.agent ?? this.pickFollowAgent();
      this.docSwitchAt = this.ctx.time + 24;
    }
    if (mode === "free" && this.ctx.controls) {
      this.ctx.controls.syncFromCamera();
    }
    this.ctx.ui.setMode(mode);
  }

  pickFollowAgent() {
    const champions = this.ctx.agents.agents.filter((a) => a.champion && a.state !== "dead");
    const pool = champions.length ? champions : this.ctx.agents.agents.filter((a) => a.state !== "dead");
    return pool.length ? pick(this.rng, pool) : null;
  }

  focusSpecies(species) {
    const center = this.ctx.agents.centroidOf(species.id);
    center.y = this.ctx.terrain.heightAt(center.x, center.z);
    if (this.mode === "doc") this.setMode("cinema");
    if (this.mode === "free") {
      this.ctx.controls.focusOn(center, 16);
    } else {
      this.setShot({ target: center, radius: 13, elevation: 0.5, until: this.ctx.time + 14, priority: "focus" });
    }
    for (const agent of this.ctx.agents.agentsOf(species.id)) {
      this.ctx.effects.sparkleBurst(agent.pos, 0xffe9a8, 4, { up: 1.6 });
    }
  }

  focusAgent(agent) {
    this.followAgent = agent;
    if (this.mode === "free") {
      const target = agent.pos.clone();
      this.ctx.controls.focusOn(target, 9);
    } else {
      this.setShot({ target: agent.pos.clone(), radius: 7, elevation: 0.35, until: this.ctx.time + 12, priority: "focus", track: agent });
    }
  }

  focusCell(cell) {
    const center = this.ctx.terrain.cellCenter(cell.x, cell.y);
    if (this.mode === "free") {
      this.ctx.controls.focusOn(center, 14);
    } else {
      this.setShot({ target: center, radius: 12, elevation: 0.55, until: this.ctx.time + 10, priority: "focus" });
    }
  }

  setShot(shot) {
    this.shot = shot;
    this.nextShotAt = shot.until ?? this.ctx.time + 14;
  }

  /* ------------------------------------------------------------------ */
  /* Main update                                                         */
  /* ------------------------------------------------------------------ */

  update(dt) {
    const ctx = this.ctx;

    // Time of day
    this.tDay = (this.tDay + dt / this.dayLength) % 1;
    ctx.sky.update(dt, this.tDay, ctx.world.environment);
    ctx.sky.eclipse = this.eclipse;
    ctx.terrain.update(dt, ctx.sky.nightFactor);

    if (this.clockAt < ctx.time) {
      this.clockAt = ctx.time + 1.2;
      ctx.ui.setClock(describeWorldClock(this.tDay), this.weather);
    }

    this.updateWeather(dt);
    this.updateReplays();
    this.updateFlavor();
    this.updateAmbient();
    this.updateSpectacles(dt);
    this.updateCamera(dt);
  }

  /* ------------------------------------------------------------------ */

  updateWeather(dt) {
    const ctx = this.ctx;
    if (ctx.time > this.weatherUntil) {
      const previous = this.weather;
      this.weather = this.pickWeather();
      this.weatherUntil = ctx.time + randRange(this.rng, 50, 120);
      const dangerous = this.weather === "storm" || this.weather === "dust";
      ctx.sky.setWeather(this.weather);
      ctx.agents.notifyBurrowWeather(dangerous);

      if (this.weather !== previous) {
        const flavors = WEATHER_FLAVOR[this.weather] ?? [];
        if (flavors.length) {
          ctx.chronicle({ icon: weatherIcon(this.weather), text: pick(this.rng, flavors) });
        }
        if (dangerous && !this.dangerousWeather) {
          ctx.ui.showBanner({
            icon: this.weather === "storm" ? "⛈️" : "🏜️",
            title: this.weather === "storm" ? "La Tempesta" : "La Tempesta di Polvere",
            subtitle: this.weather === "storm"
              ? "Il cielo si squarcia: tutte le creature corrono al riparo"
              : "Il deserto alza il suo manto: chi può, si seppellisce"
          });
          ctx.sound?.storm(true);
        } else if (!dangerous && this.dangerousWeather) {
          ctx.sound?.storm(false);
        }
        this.dangerousWeather = dangerous;
      }
    }

    if (this.weather === "storm" && ctx.time > this.nextLightningAt) {
      this.nextLightningAt = ctx.time + randRange(this.rng, 3.5, 9);
      ctx.effects.lightning();
    }
  }

  pickWeather() {
    const env = this.ctx.world.environment ?? {};
    const moisture = env.moisture ?? 0.5;
    const temperature = env.temperature ?? 0.5;
    const volatility = env.volatility ?? 0.16;
    const entries = [
      ["clear", Math.max(0.05, 0.5 - moisture * 0.25)],
      ["cloudy", 0.2],
      ["rain", temperature < 0.33 ? 0.04 : moisture * 0.55],
      ["snow", temperature < 0.33 ? moisture * 0.65 : 0],
      ["storm", Math.min(0.3, moisture * volatility * 2.4)],
      ["dust", (1 - moisture) * temperature * 1.15]
    ];
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = this.rng() * total;
    for (const [name, weight] of entries) {
      roll -= weight;
      if (roll <= 0) return name;
    }
    return "clear";
  }

  /* ------------------------------------------------------------------ */

  updateReplays() {
    const ctx = this.ctx;
    if (this.replayQueue.length === 0 || ctx.time < this.nextReplayAt) return;
    this.nextReplayAt = ctx.time + randRange(this.rng, 14, 24);
    const event = this.replayQueue.shift();
    const entry = translateEvent(event, ctx.world);
    entry.text = `Tick ${event.tick} · ${entry.text}`;
    entry.tick = event.tick;
    ctx.chronicle(entry);
    this.dramatizeEvent(event, entry);
  }

  dramatizeEvent(event, entry) {
    const ctx = this.ctx;
    const impact = event.impact ?? {};
    const speciesCenter = (speciesId) => {
      const center = ctx.agents.centroidOf(speciesId);
      center.y = ctx.terrain.heightAt(center.x, center.z);
      return center;
    };

    switch (event.type) {
      case "bloom": {
        const center = ctx.terrain.cellCenter(impact.x, impact.y);
        ctx.effects.ring(center, 0xffb7d9, 4.5, 1.6);
        ctx.effects.sparkleBurst(center, 0xffb7d9, 16, { up: 3 });
        ctx.effects.butterfliesAround(center, 5, 24);
        break;
      }
      case "disease": {
        ctx.effects.miasma(speciesCenter(impact.species), 6);
        ctx.sound?.chime(146.83, 0.25);
        break;
      }
      case "mutation": {
        for (const agent of ctx.agents.agentsOf(impact.species)) {
          ctx.effects.sparkleBurst(agent.pos, 0x9ad8ff, 5);
        }
        break;
      }
      case "innovation": {
        const center = speciesCenter(impact.species);
        ctx.effects.beam(center, 0xffd780, 3.5);
        ctx.effects.ring(center, 0xffd780, 5, 1.8);
        ctx.sound?.chime(659.25);
        ctx.sound?.chime(987.77, 0.15);
        break;
      }
      case "extinction": {
        const memorial = ctx.terrain.memorials.find((m) => m.extinct.species === impact.species);
        if (memorial) {
          ctx.effects.beam(memorial.pos, 0xa8e4ff, 4);
          ctx.effects.sparkleBurst(memorial.pos, 0xa8e4ff, 10);
        }
        ctx.sound?.chime(110, 0.4);
        break;
      }
      case "predation": {
        const predators = ctx.agents.agentsOf(impact.predator).filter((a) => a.state !== "dead");
        const predator = predators.length ? pick(this.rng, predators) : null;
        if (predator) {
          const prey = predator.findPrey();
          if (prey) {
            predator.huntAt = 0;
            predator.setState("stalk", { prey });
            prey.alert(predator);
          }
        }
        break;
      }
      case "catastrophe": {
        const center = ctx.terrain.cellCenter(impact.x, impact.y);
        ctx.effects.lightning();
        ctx.effects.miasma(center, 5);
        break;
      }
      case "population": {
        if ((impact.births ?? 0) > 0) {
          const center = speciesCenter(impact.species);
          ctx.effects.sparkleBurst(center, 0xffd7e8, Math.min(12, impact.births), { up: 2.4 });
        }
        break;
      }
      case "era": {
        ctx.ui.showBanner({
          icon: "🏛️",
          title: translateEraName(entry.eraName ?? ""),
          subtitle: "Una nuova era inizia per il mondo"
        });
        break;
      }
      default:
        break;
    }
  }

  updateFlavor() {
    const ctx = this.ctx;
    if (ctx.time < this.flavorAt) return;
    this.flavorAt = ctx.time + randRange(this.rng, 45, 80);
    const kind = ctx.world.environment?.era?.kind ?? "stable";
    const pool = [...(ERA_FLAVOR[kind] ?? ERA_FLAVOR.stable), ...(WEATHER_FLAVOR[this.weather] ?? [])];
    ctx.chronicle({ icon: "🌬️", text: pick(this.rng, pool) });
  }

  updateAmbient() {
    const ctx = this.ctx;
    if (ctx.time < this.fishAt) return;
    this.fishAt = ctx.time + randRange(this.rng, 7, 16);
    const pools = ctx.terrain.waterPools;
    if (pools.length && this.rng() < 0.75) {
      const pool = pick(this.rng, pools);
      ctx.effects.waterSplash(pool.mesh.position);
      if (this.rng() < 0.3) {
        ctx.chronicle({ icon: "🐟", text: "Un pesce è balzato fuori dallo stagno: le libellule si sono scomposte." });
      }
    }
    if (this.rng() < 0.2) {
      ctx.effects.butterfliesAround(
        new THREE.Vector3(randRange(this.rng, -18, 18), 0, randRange(this.rng, -12, 12)),
        3,
        26
      );
    }
  }

  /* ------------------------------------------------------------------ */
  /* Spectacles                                                          */
  /* ------------------------------------------------------------------ */

  updateSpectacles(dt) {
    const ctx = this.ctx;

    if (this.spectacle) {
      this.spectacle.t += dt;
      if (this.spectacle.update) this.spectacle.update(dt, this.spectacle);
      if (this.spectacle.t > this.spectacle.duration) {
        if (this.spectacle.end) this.spectacle.end();
        this.lastSpectacleId = this.spectacle.id;
        this.spectacle = null;
        this.nextSpectacleAt = ctx.time + randRange(this.rng, 55, 95);
        ctx.agents.releaseAll();
      }
      return;
    }

    if (ctx.time < this.nextSpectacleAt) return;
    const eligible = this.eligibleSpectacles();
    if (!eligible.length) {
      this.nextSpectacleAt = ctx.time + 20;
      return;
    }
    const choice = pick(this.rng, eligible.filter((id) => id !== this.lastSpectacleId).length
      ? eligible.filter((id) => id !== this.lastSpectacleId)
      : eligible);
    this.beginSpectacle(choice);
  }

  eligibleSpectacles() {
    const ctx = this.ctx;
    const night = ctx.sky.nightFactor > 0.6;
    const day = ctx.sky.dayFactor > 0.6;
    const list = [];

    const species = ctx.world.species.filter((s) => s.population > 0);
    const speciesWithGroups = species.filter((s) => ctx.agents.agentsOf(s.id).length >= 3);
    if (speciesWithGroups.length) list.push("traversata");

    if (night) {
      list.push("meteors", "aurora");
      const glowSpecies = species.filter((s) =>
        (s.capabilities ?? []).some((c) => ["photosynthesis", "nocturnal", "venom"].includes(c))
      );
      if (glowSpecies.length) list.push("danza");
    }
    if (day) list.push("fioritura", "corsa", "eclissi");
    if (ctx.terrain.waterPools.length && (day || ctx.sky.dayFactor > 0.2)) list.push("abbeverata");
    const champions = ctx.agents.agents.filter((a) => a.champion && a.state !== "dead");
    if (champions.length >= 2 && day) list.push("concilio");

    return list;
  }

  beginSpectacle(id) {
    const ctx = this.ctx;
    const info = SPECTACLES[id];
    const spectacle = { id, t: 0, duration: 26 };

    switch (id) {
      case "traversata": {
        const candidates = ctx.world.species.filter(
          (s) => s.population > 0 && ctx.agents.agentsOf(s.id).length >= 3
        );
        const species = pick(this.rng, candidates);
        const range = species.range ?? [];
        const from = ctx.agents.centroidOf(species.id);
        let destination = null;
        let bestDistance = -1;
        for (const cell of ctx.world.map.cells) {
          const center = ctx.terrain.cellCenter(cell.x, cell.y);
          const distance = center.distanceTo(from);
          if (distance > bestDistance && cell.biome === species.traits.preferredBiome) {
            bestDistance = distance;
            destination = cell;
          }
        }
        if (!destination) destination = pick(this.rng, ctx.world.map.cells);
        spectacle.duration = 34;
        spectacle.end = () => {
          const leader = ctx.agents.agentsOf(species.id)[0];
          ctx.chronicle({
            icon: "🧭",
            text: microStory("traversata", { name: leader?.name ?? species.name, roll: this.rng() }),
            species: species.id
          });
        };
        ctx.agents.beginMigration(species, destination);
        break;
      }

      case "meteors": {
        spectacle.duration = 22;
        spectacle.nextMeteorAt = 0;
        spectacle.update = (dt, s) => {
          if (s.t > s.nextMeteorAt) {
            s.nextMeteorAt = s.t + randRange(this.rng, 1.2, 3);
            ctx.effects.meteorShower(randInt(this.rng, 1, 3));
            if (chance(this.rng, 0.3)) ctx.sound?.chime(randRange(this.rng, 700, 1100), 0.1);
          }
        };
        break;
      }

      case "abbeverata": {
        const pool = pick(this.rng, ctx.terrain.waterPools);
        const center = pool.mesh.position.clone();
        const delegates = [];
        for (const sp of ctx.world.species.filter((s) => s.population > 0)) {
          const agents = ctx.agents.agentsOf(sp.id).filter((a) => a.state !== "dead");
          if (agents.length) delegates.push(agents[0], ...(agents.length > 1 && this.rng() < 0.5 ? [agents[1]] : []));
        }
        spectacle.duration = 30;
        ctx.agents.beginGathering(delegates, center, 4.2);
        ctx.effects.ring(center, 0x9fd8f2, 5.5, 2.2);
        break;
      }

      case "concilio": {
        const champions = ctx.agents.agents.filter((a) => a.champion && a.state !== "dead");
        // The highest peak hosts the council.
        const mountains = ctx.terrain.cellsOfBiome("mountain");
        const peakCell = mountains.length
          ? mountains.reduce((best, cell) => (cell.food > best.food ? cell : best), mountains[0])
          : pick(this.rng, ctx.world.map.cells);
        const peak = ctx.terrain.cellCenter(peakCell.x, peakCell.y);
        spectacle.duration = 28;
        spectacle.beamed = false;
        spectacle.update = () => {
          if (!spectacle.beamed && spectacle.t > 9) {
            spectacle.beamed = true;
            for (const champion of champions) {
              ctx.effects.beam(champion.pos, 0xf5c542, 3.2);
            }
            ctx.sound?.chime(659.25);
            ctx.sound?.chime(880, 0.16);
          }
        };
        ctx.agents.beginGathering(champions, peak, 2.6);
        break;
      }

      case "danza": {
        const glowAgents = ctx.agents.agents.filter((agent) =>
          agent.capabilities.some((c) => ["photosynthesis", "nocturnal", "venom"].includes(c)) && agent.state !== "dead"
        );
        const center = glowAgents.length
          ? glowAgents[0].pos.clone()
          : new THREE.Vector3(0, 0, 0);
        center.y = ctx.terrain.heightAt(center.x, center.z);
        spectacle.duration = 26;
        spectacle.nextSparkleAt = 0;
        spectacle.update = (dt, s) => {
          if (s.t > s.nextSparkleAt) {
            s.nextSparkleAt = s.t + 0.4;
            for (const agent of glowAgents) {
              const angle = s.t * 0.8 + agent.pos.x;
              agent.pos.x += Math.cos(angle) * 0.02;
              agent.pos.z += Math.sin(angle) * 0.02;
              if (chance(this.rng, 0.2)) ctx.effects.sparkleBurst(agent.pos, 0x9dffb0, 2, { up: 1.2 });
            }
          }
        };
        ctx.effects.setAurora(true);
        spectacle.end = () => ctx.effects.setAurora(false);
        break;
      }

      case "fioritura": {
        const cells = ctx.world.map.cells.filter((c) => c.biome === "grassland" || c.biome === "forest");
        spectacle.duration = 24;
        let burst = 0;
        spectacle.update = () => {
          if (spectacle.t > burst) {
            burst = spectacle.t + 0.7;
            const cell = pick(this.rng, cells);
            const center = ctx.terrain.cellCenter(cell.x, cell.y);
            ctx.effects.sparkleBurst(center, pick(this.rng, [0xffd7e8, 0xfff0a8, 0xe8c8ff]), 8, { up: 2.6 });
            if (chance(this.rng, 0.5)) ctx.effects.butterfliesAround(center, 3, 20);
          }
        };
        break;
      }

      case "eclissi": {
        spectacle.duration = 16;
        spectacle.update = () => {
          const t = spectacle.t / spectacle.duration;
          this.eclipse = t < 0.25 ? t / 0.25 : t > 0.75 ? (1 - t) / 0.25 : 1;
        };
        spectacle.end = () => { this.eclipse = 0; };
        ctx.chronicle({ icon: "🌑", text: "La luna morde il sole: l'isola trattiene il respiro." });
        break;
      }

      case "corsa": {
        const species = ctx.world.species.filter((s) => s.population > 0);
        const smallest = species.length
          ? species.reduce((best, s) => ((s.traits.size ?? 5) < (best.traits.size ?? 5) ? s : best), species[0])
          : null;
        if (!smallest) return;
        const racers = ctx.agents.agentsOf(smallest.id).filter((a) => a.state !== "dead").slice(0, 5);
        if (racers.length < 2) return;
        const mid = ctx.agents.centroidOf(smallest.id);
        const dir = new THREE.Vector3(randRange(this.rng, -1, 1), 0, randRange(this.rng, -1, 1)).normalize();
        const from = mid.clone().addScaledVector(dir, -8);
        const to = mid.clone().addScaledVector(dir, 8);
        from.y = ctx.terrain.heightAt(from.x, from.z);
        to.y = ctx.terrain.heightAt(to.x, to.z);
        spectacle.duration = 26;
        ctx.agents.beginRace(racers, from, to);
        break;
      }

      case "aurora": {
        spectacle.duration = 24;
        ctx.effects.setAurora(true);
        spectacle.end = () => ctx.effects.setAurora(false);
        ctx.chronicle({ icon: "🌌", text: "L'aurora distende i suoi veli: persino i predatori si fermano a guardare." });
        break;
      }

      default:
        return;
    }

    this.spectacle = spectacle;
    ctx.ui.showBanner(info);
    ctx.sound?.chime(523.25);
    ctx.sound?.chime(783.99, 0.18);
  }

  /* ------------------------------------------------------------------ */
  /* Camera                                                              */
  /* ------------------------------------------------------------------ */

  updateCamera(dt) {
    const ctx = this.ctx;
    if (this.mode === "free") {
      // The orbit camera is driven directly by the main loop in free mode.
      return;
    }

    if (this.mode === "doc") {
      if (!this.followAgent || this.followAgent.state === "dead" || this.followAgent.hidden) {
        this.followAgent = this.pickFollowAgent();
      }
      if (ctx.time > this.docSwitchAt && this.autoDocRotate) {
        this.docSwitchAt = ctx.time + 24;
        this.followAgent = this.pickFollowAgent();
        ctx.ui.toast(`Occhio su ${this.followAgent?.name ?? "il mondo"}`);
      }
      if (this.followAgent) {
        const agent = this.followAgent;
        const back = new THREE.Vector3(Math.sin(agent.heading), 0, Math.cos(agent.heading)).multiplyScalar(-6.5);
        this.desiredPos.copy(agent.pos).add(back).add(new THREE.Vector3(0, 3.4, 0));
        this.desiredTarget.copy(agent.pos).add(new THREE.Vector3(0, 0.9, 0));
        const k = 1 - Math.exp(-dt * 2.2);
        this.camPos.lerp(this.desiredPos, k);
        this.camTarget.lerp(this.desiredTarget, Math.min(1, k * 1.5));
        ctx.camera.position.copy(this.camPos);
        ctx.camera.lookAt(this.camTarget);
      }
      ctx.ui.setLetterbox(true);
      return;
    }

    // CINEMA
    if (this.shot && this.shot.until && ctx.time > this.shot.until) this.shot = null;
    if (!this.shot && ctx.time > this.nextShotAt) {
      this.chooseShot();
    }
    if (this.shot?.track) {
      this.desiredTarget.copy(this.shot.track.pos).add(new THREE.Vector3(0, 0.8, 0));
    }
    this.shotAzimuth += dt * 0.018;

    if (this.shot) {
      const { target, radius, elevation } = this.shot;
      if (!this.shot.track) this.desiredTarget.copy(target);
      this.desiredPos.set(
        target.x + Math.sin(this.shotAzimuth) * Math.cos(elevation) * radius,
        target.y + Math.sin(elevation) * radius,
        target.z + Math.cos(this.shotAzimuth) * Math.cos(elevation) * radius
      );
    } else {
      this.desiredPos.set(
        Math.sin(this.shotAzimuth) * 55,
        26,
        Math.cos(this.shotAzimuth) * 55
      );
      this.desiredTarget.set(0, 1, 0);
    }

    const k = 1 - Math.exp(-dt * 0.85);
    this.camPos.lerp(this.desiredPos, k);
    this.camTarget.lerp(this.desiredTarget, Math.min(1, k * 1.4));
    ctx.camera.position.copy(this.camPos);
    ctx.camera.lookAt(this.camTarget);
    ctx.ui.setLetterbox(true);
  }

  chooseShot() {
    const ctx = this.ctx;
    const now = ctx.time;
    this.nextShotAt = now + randRange(this.rng, 11, 18);
    this.shotAzimuth = this.rng() * Math.PI * 2;

    const hunt = ctx.agents.agents.find((a) => a.state === "charge" || a.state === "stalk");
    if (hunt && this.rng() < 0.8) {
      const target = hunt.stateData.prey?.pos ?? hunt.pos;
      this.setShot({
        target: target.clone(),
        radius: randRange(this.rng, 9, 13),
        elevation: randRange(this.rng, 0.2, 0.45),
        until: now + 9,
        track: hunt
      });
      return;
    }

    if (this.spectacle && this.rng() < 0.7) {
      const agents = ctx.agents.agents.filter((a) => ["gather", "migrate", "race", "proclaim"].includes(a.state));
      if (agents.length) {
        const center = new THREE.Vector3();
        agents.forEach((a) => center.add(a.pos));
        center.divideScalar(agents.length);
        center.y = ctx.terrain.heightAt(center.x, center.z);
        this.setShot({
          target: center,
          radius: randRange(this.rng, 14, 20),
          elevation: randRange(this.rng, 0.35, 0.6),
          until: now + 12
        });
        return;
      }
    }

    const roll = this.rng();
    if (roll < 0.3) {
      const champions = ctx.agents.agents.filter((a) => a.champion && a.state !== "dead");
      const champion = champions.length ? pick(this.rng, champions) : null;
      if (champion) {
        this.setShot({
          target: champion.pos.clone(),
          radius: randRange(this.rng, 6, 9),
          elevation: randRange(this.rng, 0.18, 0.4),
          until: now + 10,
          track: champion
        });
        return;
      }
    }

    if (roll < 0.75) {
      const speciesList = ctx.world.species.filter((s) => s.population > 0);
      if (speciesList.length) {
        const species = pick(this.rng, speciesList);
        const center = ctx.agents.centroidOf(species.id);
        center.y = ctx.terrain.heightAt(center.x, center.z);
        this.setShot({
          target: center,
          radius: randRange(this.rng, 12, 18),
          elevation: randRange(this.rng, 0.3, 0.55),
          until: now + 12
        });
        return;
      }
    }

    this.setShot({
      target: new THREE.Vector3(0, 1, 0),
      radius: randRange(this.rng, 48, 66),
      elevation: randRange(this.rng, 0.35, 0.6),
      until: now + 13
    });
  }
}

function weatherIcon(weather) {
  return {
    clear: "☀️", cloudy: "☁️", rain: "🌧️", storm: "⛈️", snow: "❄️", dust: "🏜️"
  }[weather] ?? "🌤️";
}
