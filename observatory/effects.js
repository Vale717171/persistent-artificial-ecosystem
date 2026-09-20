/**
 * Effects — every particle, ghost, ring, beam, meteor and aurora of the
 * observatory. Canvas-generated textures, pooled sprites, zero assets.
 */

import * as THREE from "three";
import { makeRng, pick, randRange } from "./rng.js";

const MAX_SPRITES = 260;

/* ------------------------------------------------------------------ */
/* Canvas textures                                                     */
/* ------------------------------------------------------------------ */

const textureCache = new Map();

export function texture(name) {
  if (textureCache.has(name)) return textureCache.get(name);
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext("2d");
  switch (name) {
    case "glow": radialGlow(g, "rgba(255,255,255,1)", "rgba(255,255,255,0)"); break;
    case "soft": radialGlow(g, "rgba(255,255,255,0.9)", "rgba(255,255,255,0)", 0.42); break;
    case "star": drawStar(g); break;
    case "heart": drawHeart(g); break;
    case "zzz": drawZ(g); break;
    case "petal": drawPetal(g); break;
    case "butterfly": drawButterfly(g); break;
    default: radialGlow(g, "rgba(255,255,255,1)", "rgba(255,255,255,0)");
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(name, tex);
  return tex;
}

function radialGlow(g, inner, outer, mid = 0.25) {
  const gradient = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(mid, inner.replace(/[\d.]+\)$/, "0.55)"));
  gradient.addColorStop(1, outer);
  g.fillStyle = gradient;
  g.fillRect(0, 0, 64, 64);
}

function drawStar(g) {
  g.fillStyle = "#ffffff";
  g.translate(32, 32);
  g.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const radius = i % 2 === 0 ? 30 : 8;
    const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.fill();
}

function drawHeart(g) {
  g.fillStyle = "#ff7ba8";
  g.translate(32, 30);
  g.beginPath();
  g.moveTo(0, 14);
  g.bezierCurveTo(-26, -4, -14, -24, 0, -10);
  g.bezierCurveTo(14, -24, 26, -4, 0, 14);
  g.fill();
}

function drawZ(g) {
  g.fillStyle = "#eaf2ff";
  g.font = "bold 44px Georgia, serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("Z", 32, 34);
}

function drawPetal(g) {
  g.fillStyle = "#ffd7e8";
  g.translate(32, 32);
  for (let i = 0; i < 5; i += 1) {
    g.rotate(Math.PI * 2 / 5);
    g.beginPath();
    g.ellipse(0, -14, 8, 15, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = "#ffe9a8";
  g.beginPath();
  g.arc(0, 0, 7, 0, Math.PI * 2);
  g.fill();
}

function drawButterfly(g) {
  g.fillStyle = "#f2b6ff";
  g.beginPath();
  g.ellipse(20, 22, 12, 16, -0.5, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(44, 22, 12, 16, 0.5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#7a4f9e";
  g.fillRect(30, 14, 4, 36);
}

function auroraTexture() {
  if (textureCache.has("aurora")) return textureCache.get("aurora");
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  const gradient = g.createLinearGradient(0, 0, 0, 128);
  gradient.addColorStop(0, "rgba(120,255,214,0)");
  gradient.addColorStop(0.35, "rgba(110,240,200,0.55)");
  gradient.addColorStop(0.7, "rgba(140,120,255,0.4)");
  gradient.addColorStop(1, "rgba(90,70,220,0)");
  g.fillStyle = gradient;
  g.fillRect(0, 0, 256, 128);
  const fade = g.createLinearGradient(0, 0, 256, 0);
  fade.addColorStop(0, "rgba(0,0,0,1)");
  fade.addColorStop(0.2, "rgba(0,0,0,0)");
  fade.addColorStop(0.8, "rgba(0,0,0,0)");
  fade.addColorStop(1, "rgba(0,0,0,1)");
  g.globalCompositeOperation = "destination-out";
  g.fillStyle = fade;
  g.fillRect(0, 0, 256, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  textureCache.set("aurora", tex);
  return tex;
}

/* ------------------------------------------------------------------ */
/* The system                                                          */
/* ------------------------------------------------------------------ */

export class Effects {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = ctx.scene;
    this.rng = makeRng(0xfab1e);
    this.time = 0;

    this.pool = [];
    this.free = [];
    for (let i = 0; i < MAX_SPRITES; i += 1) {
      const material = new THREE.SpriteMaterial({
        map: texture("glow"),
        transparent: true,
        depthWrite: false
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      this.scene.add(sprite);
      this.pool.push(sprite);
      this.free.push(sprite);
    }

    this.rings = [];
    this.beams = [];
    this.meteors = [];
    this.butterflies = [];
    this.miasmas = [];
    this.auroraRibbons = [];
    this.lightningLight = new THREE.PointLight(0xeaf2ff, 0, 220, 1.6);
    this.scene.add(this.lightningLight);

    this._buildAurora();
    this._buildMeteors();
    this._buildButterflies();
  }

  _buildAurora() {
    for (let i = 0; i < 3; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        map: auroraTexture(),
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(150, 26, 24, 1), material);
      mesh.position.set(randRange(this.rng, -20, 20), 46 + i * 9, -70 - i * 16);
      mesh.rotation.x = -0.35;
      mesh.rotation.z = randRange(this.rng, -0.12, 0.12);
      mesh.visible = false;
      this.scene.add(mesh);
      this.auroraRibbons.push({ mesh, phase: this.rng() * 10, baseX: mesh.position.x });
    }
    this.auroraTarget = 0;
    this.auroraLevel = 0;
  }

  _buildMeteors() {
    for (let i = 0; i < 6; i += 1) {
      const group = new THREE.Group();
      const material = new THREE.MeshBasicMaterial({
        color: 0xfff2c8,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending
      });
      const streak = new THREE.Mesh(new THREE.PlaneGeometry(7, 0.22), material);
      streak.position.x = 3.5;
      group.add(streak);
      const head = new THREE.Sprite(new THREE.SpriteMaterial({
        map: texture("glow"),
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending
      }));
      head.scale.set(2.2, 2.2, 1);
      group.add(head);
      group.visible = false;
      this.scene.add(group);
      this.meteors.push({ group, material, head, active: false, life: 0, velocity: new THREE.Vector3() });
    }
  }

  _buildButterflies() {
    for (let i = 0; i < 14; i += 1) {
      const material = new THREE.SpriteMaterial({
        map: texture("butterfly"),
        transparent: true,
        opacity: 0,
        depthWrite: false
      });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(0.6, 0.6, 1);
      sprite.visible = false;
      this.scene.add(sprite);
      this.butterflies.push({
        sprite, material, active: false, life: 0,
        anchor: new THREE.Vector3(), phase: this.rng() * 10
      });
    }
  }

  /* ------------------------- sprite particles ------------------------ */

  _spawn(mapName, pos, options = {}) {
    const sprite = this.free.pop();
    if (!sprite) return null;
    const material = sprite.material;
    material.map = texture(mapName);
    material.color.set(options.color ?? 0xffffff);
    material.opacity = options.opacity ?? 1;
    material.rotation = options.rotation ?? 0;
    material.needsUpdate = true;

    sprite.position.copy(pos);
    sprite.position.x += randRange(this.rng, -0.2, 0.2);
    sprite.position.z += randRange(this.rng, -0.2, 0.2);
    sprite.visible = true;
    sprite.scale.setScalar(options.size ?? 0.5);

    const particle = {
      sprite,
      vel: new THREE.Vector3(
        randRange(this.rng, -1, 1) * (options.spread ?? 1),
        randRange(this.rng, 0.3, 1) * (options.up ?? 1.5),
        randRange(this.rng, -1, 1) * (options.spread ?? 1)
      ),
      life: options.life ?? 1.2,
      maxLife: options.life ?? 1.2,
      size0: options.size ?? 0.5,
      size1: options.endSize ?? (options.size ?? 0.5) * 2.2,
      gravity: options.gravity ?? 0,
      drag: options.drag ?? 0.6,
      spin: options.spin ?? 0,
      drift: options.driftX ?? 0
    };
    this.active ??= new Set();
    this.active.add(particle);
    return particle;
  }

  sparkleBurst(pos, color = 0xffe9a8, count = 8, options = {}) {
    for (let i = 0; i < count; i += 1) {
      this._spawn("star", pos, {
        color,
        size: randRange(this.rng, 0.28, 0.55),
        life: randRange(this.rng, 0.7, 1.3),
        up: options.up ?? 2.4,
        spread: options.spread ?? 1.1,
        gravity: 1.2,
        spin: randRange(this.rng, -3, 3)
      });
    }
  }

  heartBurst(pos, count = 4) {
    for (let i = 0; i < count; i += 1) {
      this._spawn("heart", pos, {
        size: randRange(this.rng, 0.4, 0.7),
        life: randRange(this.rng, 1.1, 1.7),
        up: 1.4,
        spread: 0.7,
        gravity: -0.4,
        endSize: 0.85
      });
    }
  }

  puffBurst(pos, color = 0xcfc4b0, count = 6, options = {}) {
    for (let i = 0; i < count; i += 1) {
      this._spawn("soft", pos, {
        color,
        size: randRange(this.rng, 0.5, 0.9),
        endSize: randRange(this.rng, 1.4, 2.2),
        life: randRange(this.rng, 0.8, 1.4),
        up: options.up ?? 0.9,
        spread: options.spread ?? 1.4,
        gravity: options.gravity ?? -0.25,
        opacity: 0.55
      });
    }
  }

  deathPuff(pos, color = 0xffffff) {
    this.puffBurst(pos, 0xf0e6d8, 9, { up: 1.6, spread: 1.8 });
    this.sparkleBurst(pos, color, 6, { up: 2.6 });
  }

  digPuff(pos) {
    this.puffBurst(pos, 0xc9ab82, 7, { up: 1.2, spread: 1.6 });
  }

  zzz(pos) {
    for (let i = 0; i < 2; i += 1) {
      this._spawn("zzz", pos, {
        size: 0.32,
        endSize: 0.55,
        life: 1.8,
        up: 0.55,
        spread: 0.12,
        gravity: -0.15,
        driftX: 0.3
      });
    }
  }

  foodPick(pos) {
    this._spawn("star", pos, {
      color: 0x9fe870,
      size: 0.22,
      life: 0.6,
      up: 1.6,
      spread: 0.5
    });
  }

  birthSparkle(pos) {
    this.sparkleBurst(pos, 0xffd7e8, 12, { up: 2.8 });
    this.ring(pos, 0xffd7e8, 2.4, 1.2);
  }

  waterSplash(pos) {
    for (let i = 0; i < 8; i += 1) {
      this._spawn("glow", pos, {
        color: 0x9fd8f2,
        size: randRange(this.rng, 0.2, 0.4),
        life: randRange(this.rng, 0.6, 1),
        up: 3,
        spread: 0.8,
        gravity: 5.5
      });
    }
    this.ring(pos, 0xbfe8f5, 1.6, 0.9);
  }

  /* --------------------------- mesh effects -------------------------- */

  ring(pos, color = 0xffffff, maxRadius = 3, duration = 1.2) {
    let entry = this.rings.find((r) => !r.active);
    if (!entry) {
      const material = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.8,
        side: THREE.DoubleSide, depthWrite: false, fog: false
      });
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.48, 0.62, 40), material);
      mesh.rotation.x = -Math.PI / 2;
      this.scene.add(mesh);
      entry = { mesh, material, active: false, life: 0, duration: 1, maxRadius: 3 };
      this.rings.push(entry);
    }
    entry.active = true;
    entry.life = duration;
    entry.duration = duration;
    entry.maxRadius = maxRadius;
    entry.material.color.set(color);
    entry.mesh.visible = true;
    entry.mesh.position.copy(pos);
    entry.mesh.position.y += 0.06;
    entry.mesh.scale.setScalar(0.2);
  }

  beam(pos, color = 0xffd780, duration = 3.2) {
    let entry = this.beams.find((b) => !b.active);
    if (!entry) {
      const material = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.5,
        depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.6, 7, 14, 1, true), material);
      this.scene.add(mesh);
      entry = { mesh, material, active: false, life: 0, duration: 3 };
      this.beams.push(entry);
    }
    entry.active = true;
    entry.life = duration;
    entry.duration = duration;
    entry.material.color.set(color);
    entry.mesh.visible = true;
    entry.mesh.position.copy(pos);
    entry.mesh.position.y += 3.4;
  }

  miasma(center, duration = 6) {
    let group = this.miasmas.find((m) => !m.active);
    if (!group) {
      const meshes = [];
      const material = new THREE.MeshBasicMaterial({
        color: 0x6fd66f, transparent: true, opacity: 0.2, depthWrite: false
      });
      for (let i = 0; i < 5; i += 1) {
        const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(randRange(this.rng, 0.7, 1.5), 0), material);
        this.scene.add(mesh);
        meshes.push(mesh);
      }
      group = { meshes, material, active: false, life: 0, duration: 6, center: new THREE.Vector3(), seeds: meshes.map(() => this.rng() * 10) };
      this.miasmas.push(group);
    }
    group.active = true;
    group.life = duration;
    group.duration = duration;
    group.center.copy(center);
    for (const mesh of group.meshes) mesh.visible = true;
  }

  meteorShower(count = 5) {
    let spawned = 0;
    for (const meteor of this.meteors) {
      if (spawned >= count) break;
      if (meteor.active) continue;
      meteor.active = true;
      meteor.life = 0;
      meteor.group.visible = true;
      meteor.group.position.set(randRange(this.rng, -70, 70), randRange(this.rng, 55, 85), randRange(this.rng, -70, 30));
      const angle = randRange(this.rng, -0.9, -0.5);
      meteor.velocity.set(Math.cos(angle) * 34, Math.sin(angle) * 30, randRange(this.rng, -4, 4));
      meteor.group.rotation.z = Math.atan2(meteor.velocity.y, meteor.velocity.x) + Math.PI;
      spawned += 1;
    }
  }

  butterfliesAround(center, count = 8, duration = 30) {
    let spawned = 0;
    for (const butterfly of this.butterflies) {
      if (spawned >= count) break;
      if (butterfly.active) continue;
      butterfly.active = true;
      butterfly.life = duration;
      butterfly.sprite.visible = true;
      butterfly.anchor.set(
        center.x + randRange(this.rng, -4, 4),
        0,
        center.z + randRange(this.rng, -4, 4)
      );
      butterfly.anchor.y = this.ctx.terrain.heightAt(butterfly.anchor.x, butterfly.anchor.z) + randRange(this.rng, 0.8, 2);
      spawned += 1;
    }
  }

  setAurora(active) {
    this.auroraTarget = active ? 1 : 0;
  }

  lightning() {
    this.lightningLight.position.set(randRange(this.rng, -26, 26), 46, randRange(this.rng, -18, 18));
    this.lightningLight.intensity = 260;
    this.ctx.ui?.flash();
    this.ctx.sound?.thunder();
  }

  /* ----------------------------- update ------------------------------ */

  update(dt) {
    this.time += dt;

    if (this.active) {
      // Deleting while iterating a Set is safe and avoids a per-frame copy.
      for (const particle of this.active) {
        particle.life -= dt;
        if (particle.life <= 0) {
          particle.sprite.visible = false;
          this.active.delete(particle);
          this.free.push(particle.sprite);
          continue;
        }
        const t = 1 - particle.life / particle.maxLife;
        particle.vel.y -= particle.gravity * dt;
        particle.vel.multiplyScalar(Math.max(0, 1 - particle.drag * dt));
        particle.sprite.position.addScaledVector(particle.vel, dt);
        particle.sprite.position.x += particle.drift * dt;
        particle.sprite.scale.setScalar(particle.size0 + (particle.size1 - particle.size0) * t);
        particle.sprite.material.opacity = Math.min(1, (1 - t) * 1.6);
        particle.sprite.material.rotation += particle.spin * dt;
      }
    }

    for (const entry of this.rings) {
      if (!entry.active) continue;
      entry.life -= dt;
      const t = 1 - entry.life / entry.duration;
      if (entry.life <= 0) {
        entry.active = false;
        entry.mesh.visible = false;
        continue;
      }
      entry.mesh.scale.setScalar(0.2 + entry.maxRadius * t);
      entry.material.opacity = 0.8 * (1 - t);
    }

    for (const entry of this.beams) {
      if (!entry.active) continue;
      entry.life -= dt;
      if (entry.life <= 0) {
        entry.active = false;
        entry.mesh.visible = false;
        continue;
      }
      const t = entry.life / entry.duration;
      entry.material.opacity = 0.55 * Math.min(1, t * 2) * (0.8 + 0.2 * Math.sin(this.time * 6));
    }

    for (const group of this.miasmas) {
      if (!group.active) continue;
      group.life -= dt;
      if (group.life <= 0) {
        group.active = false;
        for (const mesh of group.meshes) mesh.visible = false;
        continue;
      }
      const t = 1 - group.life / group.duration;
      group.material.opacity = 0.22 * Math.sin(Math.min(1, t * 1.4) * Math.PI);
      group.meshes.forEach((mesh, i) => {
        const seed = group.seeds[i];
        mesh.position.set(
          group.center.x + Math.sin(this.time * 0.6 + seed) * 2.4,
          this.ctx.terrain.heightAt(group.center.x, group.center.z) + 1 + t * 5 + Math.sin(this.time + seed) * 0.3,
          group.center.z + Math.cos(this.time * 0.5 + seed * 1.3) * 2.4
        );
        mesh.rotation.y += dt * 0.4;
      });
    }

    for (const meteor of this.meteors) {
      if (!meteor.active) continue;
      meteor.life += dt;
      if (meteor.life > 1.5 || meteor.group.position.y < 4) {
        meteor.active = false;
        meteor.group.visible = false;
        continue;
      }
      meteor.group.position.addScaledVector(meteor.velocity, dt);
      const fade = Math.sin(Math.min(1, meteor.life / 1.5) * Math.PI);
      meteor.material.opacity = fade;
      meteor.head.material.opacity = fade;
    }

    for (const butterfly of this.butterflies) {
      if (!butterfly.active) continue;
      butterfly.life -= dt;
      if (butterfly.life <= 0) {
        butterfly.active = false;
        butterfly.sprite.visible = false;
        continue;
      }
      const p = butterfly.phase + this.time;
      const x = butterfly.anchor.x + Math.sin(p * 0.9) * 2.6;
      const z = butterfly.anchor.z + Math.cos(p * 0.7) * 2.6;
      const y = butterfly.anchor.y + Math.sin(p * 2.2) * 0.5;
      butterfly.sprite.position.set(x, y, z);
      butterfly.material.opacity = Math.min(1, butterfly.life / 3) * 0.95;
      butterfly.sprite.scale.set(0.6 * (0.7 + 0.3 * Math.sin(p * 14)), 0.6, 1);
    }

    this.auroraLevel += (this.auroraTarget - this.auroraLevel) * Math.min(1, dt * 0.6);
    for (const ribbon of this.auroraRibbons) {
      ribbon.mesh.visible = this.auroraLevel > 0.02;
      if (!ribbon.mesh.visible) continue;
      ribbon.mesh.material.opacity = this.auroraLevel * 0.5;
      ribbon.mesh.position.x = ribbon.baseX + Math.sin(this.time * 0.14 + ribbon.phase) * 9;
      ribbon.mesh.rotation.z = Math.sin(this.time * 0.1 + ribbon.phase) * 0.14;
    }

    this.lightningLight.intensity *= Math.exp(-dt * 9);
  }
}
