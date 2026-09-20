/**
 * Observatory main — assembles renderer, world data and every system,
 * then runs the render loop. Everything lives in a shared `ctx`.
 */

import * as THREE from "three";
import { OrbitCam } from "./controls.js";
import { Terrain } from "./terrain.js";
import { Sky } from "./sky.js";
import { Effects } from "./effects.js";
import { AgentSystem } from "./agents.js";
import { Director } from "./director.js";
import { Sound } from "./sound.js";
import { UI } from "./ui.js";
import { translateEvent } from "./narrative.js";

export async function startObservatory() {
  const canvas = document.getElementById("obs-canvas");

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (error) {
    throw new Error("WebGL non disponibile su questo dispositivo.");
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 900);
  camera.position.set(40, 26, 46);

  const ctx = {
    canvas,
    renderer,
    scene,
    camera,
    world: null,
    time: 0,
    paused: false,
    speed: 1
  };

  let ui;
  const sound = new Sound();

  const actions = {
    togglePause: () => {
      ctx.paused = !ctx.paused;
      ui.setPaused(ctx.paused);
    },
    setMode: (mode, options) => ctx.director.setMode(mode, options),
    toggleSound: async () => {
      const on = await sound.toggle();
      ui.setSound(on);
    },
    cycleSpeed: () => {
      ctx.speed = ctx.speed === 1 ? 2 : ctx.speed === 2 ? 4 : 1;
      ui.setSpeed(ctx.speed);
    },
    focusSpecies: (species) => ctx.director.focusSpecies(species),
    focusAgent: (agent) => {
      ui.showAgentCard(agent);
      ctx.director.focusAgent(agent);
    },
    focusCell: (cell) => ctx.director.focusCell(cell),
    focusFossil: (extinct) => {
      ui.showFossilCard(extinct);
      const memorial = ctx.terrain.memorials.find((m) => m.extinct.species === extinct.species);
      if (memorial) {
        ctx.director.setShot({
          target: memorial.pos.clone(),
          radius: 8,
          elevation: 0.25,
          until: ctx.time + 12
        });
      }
    }
  };

  ui = new UI(ctx, actions);
  ctx.ui = ui;
  ctx.sound = sound;
  ui.setLoading("Carico lo stato del mondo…");

  let world;
  try {
    world = await loadWorld();
  } catch (error) {
    ui.showError("Non riesco a leggere data/world.json. Avvia un server locale (npm run serve) e ricarica.");
    return;
  }
  ctx.world = world;
  ui.setLoading("Ricostruisco l'isola dai dati…");

  ctx.terrain = new Terrain(ctx);
  ui.setLoading("Accendo il cielo e il clima…");
  ctx.sky = new Sky(ctx);
  ctx.effects = new Effects(ctx);
  ctx.agents = new AgentSystem(ctx);
  ctx.director = new Director(ctx);
  ctx.controls = new OrbitCam(camera, renderer.domElement, () => {
    if (ctx.director.mode !== "free") ctx.director.setMode("free");
  });

  ctx.chronicle = (entry) => {
    ui.addChronicle(entry);
    if (entry.icon === "🐣" || entry.icon === "✨") sound.chime(880, 0.05);
  };

  ui.setLoading("Sveglio le creature…");
  ctx.agents.spawnForWorld();
  ui.buildPanels();
  ui.setWorldSummary(world);
  ui.setMode("cinema");
  ui.hideLoading();
  ui.showHint();

  // Welcome chronicle: the world's own latest event, then a greeting.
  const latest = [...(world.events ?? [])].sort((a, b) => b.tick - a.tick)[0];
  if (latest) {
    const entry = translateEvent(latest, world);
    entry.text = `Ultimo avvenimento (tick ${latest.tick}) · ${entry.text}`;
    ui.addChronicle(entry);
  }
  const living = world.species.filter((s) => s.population > 0);
  ui.addChronicle({
    icon: "🌌",
    text: `Benvenuto nell'Osservatorio. Questo mondo vive da ${world.tick} tick (${Math.round(world.tick * (world.tickIntervalHours ?? 6) / 24)} giorni) e si evolve da solo, commit dopo commit. Ora guarda: ha una vita tutta sua.`
  });
  ui.addChronicle({
    icon: "🕯️",
    text: `${world.extinctions?.length ?? 0} specie riposano nel Memoriale lungo il bordo dell'isola: clicca una pietra per conoscerne la storia.`
  });

  setupPicking(ctx, ui);
  setupResize(ctx);
  setupLoop(ctx, ui, sound);

  return ctx;
}

/* ------------------------------------------------------------------ */

async function loadWorld() {
  const response = await fetch(`data/world.json?v=${Date.now()}`, {
    cache: "no-store",
    headers: { "cache-control": "no-cache" }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function setupPicking(ctx, ui) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downX = 0;
  let downY = 0;
  let downTime = 0;

  ctx.canvas.addEventListener("pointerdown", (event) => {
    downX = event.clientX;
    downY = event.clientY;
    downTime = performance.now();
  });

  ctx.canvas.addEventListener("pointerup", (event) => {
    const moved = Math.hypot(event.clientX - downX, event.clientY - downY);
    if (moved > 7 || performance.now() - downTime > 400) return;

    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, ctx.camera);

    const targets = [
      ...ctx.agents.hitMeshes,
      ...ctx.terrain.memorialHitMeshes,
      ...ctx.terrain.tileMeshes
    ];
    const hits = raycaster.intersectObjects(targets, false);
    ctx.terrain.highlightCell(null);
    if (!hits.length) {
      ui.hideCard();
      return;
    }

    const hit = hits[0].object;
    if (hit.userData.agent) {
      const agent = hit.userData.agent;
      if (agent.hidden || agent.state === "dead") return;
      ui.showAgentCard(agent);
      ctx.effects.ring(agent.pos, 0xffe9a8, 2, 0.9);
      return;
    }
    if (hit.userData.memorial) {
      ui.showFossilCard(hit.userData.memorial.extinct);
      const memorial = ctx.terrain.memorials.find((m) => m.extinct.species === hit.userData.memorial.extinct.species);
      if (memorial) {
        ctx.effects.beam(memorial.pos, 0xa8e4ff, 2.5);
        ctx.director.setShot({
          target: memorial.pos.clone(),
          radius: 8,
          elevation: 0.3,
          until: ctx.time + 10
        });
      }
      return;
    }
    if (hit.userData.cell) {
      const cell = hit.userData.cell;
      ui.showCellCard(cell);
      ctx.terrain.highlightCell(cell);
      return;
    }
  });
}

function setupResize(ctx) {
  window.addEventListener("resize", () => {
    ctx.camera.aspect = window.innerWidth / window.innerHeight;
    ctx.camera.updateProjectionMatrix();
    ctx.renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function setupLoop(ctx, ui, sound) {
  const clock = new THREE.Clock();
  let fpsAccum = 0;
  let fpsFrames = 0;
  let fpsChecked = 0;
  let degraded = false;
  let panelRefreshAt = 8;

  function frame() {
    requestAnimationFrame(frame);
    const rawDt = Math.min(0.05, clock.getDelta());
    const dt = ctx.paused ? 0 : rawDt * ctx.speed;

    ctx.time += dt;
    ctx.director.update(dt);
    ctx.agents.update(dt);
    ctx.effects.update(dt);
    sound.update(rawDt, {
      dayFactor: ctx.sky.dayFactor,
      nightFactor: ctx.sky.nightFactor,
      weather: ctx.director.weather
    });

    // Keep the "N in scena" counters honest.
    if (ctx.time > panelRefreshAt) {
      panelRefreshAt = ctx.time + 8;
      ui.refreshAgentCounts();
    }

    // In free mode the orbit camera owns the view.
    if (ctx.director.mode === "free") {
      ctx.controls.update(rawDt);
    }

    // Adaptive quality: drop shadows on struggling devices.
    fpsAccum += rawDt;
    fpsFrames += 1;
    if (fpsAccum - fpsChecked > 5) {
      const fps = fpsFrames / (fpsAccum - fpsChecked);
      fpsChecked = fpsAccum;
      fpsFrames = 0;
      if (!degraded && fps < 30 && ctx.time > 8) {
        degraded = true;
        ctx.renderer.setPixelRatio(1);
        ctx.renderer.shadowMap.enabled = false;
        ctx.sky.sunLight.castShadow = false;
        ctx.scene.traverse((object) => {
          if (object.material) {
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            for (const material of materials) material.needsUpdate = true;
          }
        });
      }
    }

    ctx.renderer.render(ctx.scene, ctx.camera);
  }

  frame();
}
