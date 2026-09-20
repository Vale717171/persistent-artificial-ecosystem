/**
 * Terrain — the floating island diorama.
 *
 * The 12×8 biome grid from data/world.json becomes a beveled sky-island:
 * extruded tiles, instanced flora, water pools, a fossil memorial ring for
 * every extinct species, and drifting rock shards.
 */

import * as THREE from "three";
import { rngFrom, randRange, randInt, pick } from "./rng.js";
import { texture } from "./effects.js";

export const TILE = 4;

const BIOME_HEIGHT = {
  wetland: 0.55,
  desert: 0.9,
  grassland: 1.05,
  forest: 1.3,
  mountain: 2.5
};

const BIOME_COLORS = {
  forest: { barren: 0x2e5e3c, lush: 0x49a05e },
  grassland: { barren: 0x8d9040, lush: 0xb8c04f },
  wetland: { barren: 0x4c6e52, lush: 0x5f9464 },
  mountain: { barren: 0x7c766d, lush: 0x948d80 },
  desert: { barren: 0xc09a52, lush: 0xd8b268 }
};

const MEMORIAL_STONE = 0x9aa3ad;

export class Terrain {
  constructor(ctx) {
    this.ctx = ctx;
    this.world = ctx.world;
    this.map = this.world.map;
    this.group = new THREE.Group();
    ctx.scene.add(this.group);

    this.x0 = -((this.map.width - 1) / 2) * TILE;
    this.z0 = -((this.map.height - 1) / 2) * TILE;
    this.tiles = new Map();
    this.tileMeshes = [];
    this.waterPools = [];
    this.memorials = [];
    this.memorialHitMeshes = [];
    this.floatingRocks = [];
    this.heights = new Map();

    this._buildBase();
    this._buildTiles();
    this._buildDecorations();
    this._buildWater();
    this._buildMemorials();
    this._buildFloatingRocks();
    this._buildHighlight();

    this.time = 0;
  }

  /* -------------------------------------------------------------- */

  cellCenter(x, y, yOffset = 0) {
    const height = this.heights.get(`${x},${y}`) ?? 1;
    return new THREE.Vector3(this.x0 + x * TILE, height + yOffset, this.z0 + y * TILE);
  }

  heightAt(x, z) {
    const gx = Math.round((x - this.x0) / TILE);
    const gz = Math.round((z - this.z0) / TILE);
    if (gx >= 0 && gx < this.map.width && gz >= 0 && gz < this.map.height) {
      const centerX = this.x0 + gx * TILE;
      const centerZ = this.z0 + gz * TILE;
      if (Math.abs(x - centerX) < TILE / 2 && Math.abs(z - centerZ) < TILE / 2) {
        return this.heights.get(`${gx},${gz}`) ?? 1;
      }
    }
    return 0.1;
  }

  cellAt(x, z) {
    const gx = Math.round((x - this.x0) / TILE);
    const gz = Math.round((z - this.z0) / TILE);
    if (gx < 0 || gx >= this.map.width || gz < 0 || gz >= this.map.height) return null;
    return this.map.cells.find((cell) => cell.x === gx && cell.y === gz) ?? null;
  }

  get bounds() {
    return {
      minX: this.x0 - TILE * 0.5 + 0.9,
      maxX: this.x0 + (this.map.width - 1) * TILE + TILE * 0.5 - 0.9,
      minZ: this.z0 - TILE * 0.5 + 0.9,
      maxZ: this.z0 + (this.map.height - 1) * TILE + TILE * 0.5 - 0.9
    };
  }

  cellsOfBiome(biome) {
    return this.map.cells.filter((cell) => cell.biome === biome);
  }

  randomPointInCell(rng, cell, margin = 1.35) {
    const center = this.cellCenter(cell.x, cell.y);
    return new THREE.Vector3(
      center.x + randRange(rng, -margin, margin),
      center.y,
      center.z + randRange(rng, -margin, margin)
    );
  }

  /* -------------------------------------------------------------- */

  _buildBase() {
    const width = this.map.width * TILE + 6;
    const depth = this.map.height * TILE + 6;

    const earth = new THREE.MeshStandardMaterial({ color: 0x6e5a44, roughness: 0.95, flatShading: true });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(width, 3.4, depth), earth);
    slab.position.y = 0.1 - 1.7;
    slab.receiveShadow = true;
    this.group.add(slab);

    const rock = new THREE.MeshStandardMaterial({ color: 0x5a4c3c, roughness: 1, flatShading: true });
    const tip = new THREE.Mesh(new THREE.ConeGeometry(Math.min(width, depth) * 0.42, 6.5, 4), rock);
    tip.rotation.y = Math.PI / 4;
    tip.position.y = 0.1 - 3.4 - 3.25 + 0.3;
    this.group.add(tip);

    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.7, 0.5, depth + 0.7),
      new THREE.MeshStandardMaterial({ color: 0x7d684f, roughness: 0.9, flatShading: true })
    );
    rim.position.y = 0.1 - 0.32;
    rim.receiveShadow = true;
    this.group.add(rim);

    this.baseTop = 0.12;
  }

  _buildTiles() {
    const sideMaterial = new THREE.MeshStandardMaterial({ color: 0x84684c, roughness: 0.95, flatShading: true });
    const bottomMaterial = sideMaterial;
    const topCache = new Map();

    for (const cell of this.map.cells) {
      const height = BIOME_HEIGHT[cell.biome] ?? 1;
      const key = `${cell.x},${cell.y}`;
      this.heights.set(key, height);

      const foodFactor = Math.min(1, Math.max(0, cell.food / 10));
      const bucket = Math.round(foodFactor * 4) / 4;
      const colorKey = `${cell.biome}:${bucket}`;
      let topMaterial = topCache.get(colorKey);
      if (!topMaterial) {
        const barren = new THREE.Color(BIOME_COLORS[cell.biome]?.barren ?? 0x777777);
        const lush = new THREE.Color(BIOME_COLORS[cell.biome]?.lush ?? 0x999999);
        const color = barren.lerp(lush, bucket);
        topMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.92, flatShading: true });
        topCache.set(colorKey, topMaterial);
      }

      const geometry = new THREE.BoxGeometry(TILE - 0.16, height, TILE - 0.16);
      const mesh = new THREE.Mesh(geometry, [sideMaterial, sideMaterial, topMaterial, bottomMaterial, sideMaterial, sideMaterial]);
      const center = this.cellCenter(cell.x, cell.y);
      mesh.position.set(center.x, height / 2, center.z);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.userData.cell = cell;
      this.group.add(mesh);
      this.tiles.set(key, { mesh, cell, height });
      this.tileMeshes.push(mesh);
    }
  }

  _buildDecorations() {
    const dummy = new THREE.Object3D();
    const items = {
      trunks: { geometry: new THREE.CylinderGeometry(0.09, 0.14, 0.8, 6), material: new THREE.MeshStandardMaterial({ color: 0x6b4a33, roughness: 1, flatShading: true }), list: [] },
      canopies: { geometry: new THREE.ConeGeometry(0.95, 1.9, 6), material: new THREE.MeshStandardMaterial({ color: 0x3f8f52, roughness: 0.9, flatShading: true }), list: [], colored: true },
      bushes: { geometry: new THREE.IcosahedronGeometry(0.34, 0), material: new THREE.MeshStandardMaterial({ color: 0x59945a, roughness: 0.95, flatShading: true }), list: [], colored: true },
      tufts: { geometry: new THREE.ConeGeometry(0.075, 0.5, 4), material: new THREE.MeshStandardMaterial({ color: 0xa8b04a, roughness: 0.95, flatShading: true }), list: [], colored: true },
      flowers: { geometry: new THREE.IcosahedronGeometry(0.1, 0), material: new THREE.MeshStandardMaterial({ roughness: 0.7, flatShading: true }), list: [], colored: true },
      reeds: { geometry: new THREE.CylinderGeometry(0.028, 0.05, 1.05, 4), material: new THREE.MeshStandardMaterial({ color: 0x7fa356, roughness: 1, flatShading: true }), list: [] },
      lilies: { geometry: new THREE.CircleGeometry(0.3, 9), material: new THREE.MeshStandardMaterial({ color: 0x5fae6b, roughness: 0.8, flatShading: true }), list: [] },
      rocks: { geometry: new THREE.DodecahedronGeometry(0.4, 0), material: new THREE.MeshStandardMaterial({ color: 0x8b857b, roughness: 1, flatShading: true }), list: [], colored: true },
      cacti: { geometry: new THREE.CapsuleGeometry(0.17, 0.55, 3, 8), material: new THREE.MeshStandardMaterial({ color: 0x6da55d, roughness: 0.85, flatShading: true }), list: [] },
      snow: { geometry: new THREE.IcosahedronGeometry(0.42, 0), material: new THREE.MeshStandardMaterial({ color: 0xf4f7fa, roughness: 0.6, flatShading: true }), list: [] },
      peaks: { geometry: new THREE.ConeGeometry(1.15, 2.4, 5), material: new THREE.MeshStandardMaterial({ color: 0x8d867b, roughness: 1, flatShading: true }), list: [], colored: true }
    };

    const FLOWER_COLORS = [0xffd7e8, 0xfff0a8, 0xe8c8ff, 0xffb3a0, 0xfdfdfd];
    const GREEN_SHADES = [0x3f8f52, 0x4c9c58, 0x357a45, 0x57a862];

    for (const cell of this.map.cells) {
      const rng = rngFrom("decor", cell.x, cell.y);
      const center = this.cellCenter(cell.x, cell.y);
      const foodFactor = Math.min(1, Math.max(0, cell.food / 10));
      const add = (kind, x, z, y, scale = 1, rotationY = 0, color = null) => {
        items[kind].list.push({ x: center.x + x, y: center.y + y, z: center.z + z, scale, rotationY, color });
      };

      const place = (count, margin = 1.55) =>
        Array.from({ length: count }, () => [randRange(rng, -margin, margin), randRange(rng, -margin, margin)]);

      switch (cell.biome) {
        case "forest": {
          const trees = Math.max(1, Math.round(1 + foodFactor * 3 + rng() * 1.4));
          for (const [x, z] of place(trees)) {
            const scale = randRange(rng, 0.75, 1.3);
            add("trunks", x, z, 0.35 * scale, scale, rng() * Math.PI);
            add("canopies", x, z, 0.85 * scale + 0.4, scale, rng() * Math.PI, pick(rng, GREEN_SHADES));
          }
          const bushes = randInt(rng, 1, 3);
          for (const [x, z] of place(bushes)) add("bushes", x, z, 0.16, randRange(rng, 0.7, 1.4), rng() * 3, pick(rng, GREEN_SHADES));
          if (foodFactor > 0.6) {
            for (const [x, z] of place(3)) add("flowers", x, z, 0.12, randRange(rng, 0.7, 1.2), 0, pick(rng, FLOWER_COLORS));
          }
          break;
        }
        case "grassland": {
          const tufts = Math.round(5 + foodFactor * 9);
          for (const [x, z] of place(tufts)) add("tufts", x, z, 0.22, randRange(rng, 0.7, 1.5), rng() * 3, foodFactor > 0.5 ? 0xb8c04f : 0x9aa040);
          if (foodFactor > 0.55) {
            const flowers = Math.round(foodFactor * 6);
            for (const [x, z] of place(flowers)) add("flowers", x, z, 0.14, randRange(rng, 0.8, 1.4), 0, pick(rng, FLOWER_COLORS));
          }
          if (rng() < 0.3) add("bushes", randRange(rng, -1.4, 1.4), randRange(rng, -1.4, 1.4), 0.16, 0.8, rng() * 3, 0x74904a);
          break;
        }
        case "wetland": {
          const reeds = randInt(rng, 3, 7);
          for (const [x, z] of place(reeds, 1.6)) {
            if (Math.hypot(x, z) < 1.15) continue;
            add("reeds", x, z, 0.42, randRange(rng, 0.8, 1.4), rng() * 3);
          }
          break;
        }
        case "desert": {
          const cacti = rng() < 0.65 ? randInt(rng, 1, 2) : 0;
          for (const [x, z] of place(cacti, 1.5)) add("cacti", x, z, 0.5, randRange(rng, 0.7, 1.25), rng() * 3);
          const rocks = randInt(rng, 1, 3);
          for (const [x, z] of place(rocks, 1.6)) add("rocks", x, z, 0.16, randRange(rng, 0.5, 1.1), rng() * 3, 0xa08c62);
          break;
        }
        case "mountain": {
          const peakScale = randRange(rng, 0.7, 1.5);
          add("peaks", randRange(rng, -0.5, 0.5), randRange(rng, -0.5, 0.5), 0.9 * peakScale, peakScale, rng() * 3, rng() < 0.5 ? 0x8d867b : 0x9c968b);
          if (rng() < 0.55) add("snow", randRange(rng, -0.8, 0.8), randRange(rng, -0.8, 0.8), 2.1 * peakScale, randRange(rng, 0.5, 0.9), rng() * 3);
          const rocks = randInt(rng, 1, 3);
          for (const [x, z] of place(rocks, 1.6)) add("rocks", x, z, 0.1, randRange(rng, 0.4, 0.9), rng() * 3, 0x8b857b);
          break;
        }
        default:
          break;
      }
    }

    for (const { geometry, material, list, colored } of Object.values(items)) {
      if (list.length === 0) continue;
      const mesh = new THREE.InstancedMesh(geometry, material, list.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const color = new THREE.Color();
      list.forEach((item, index) => {
        dummy.position.set(item.x, item.y, item.z);
        dummy.rotation.set(0, item.rotationY ?? 0, 0);
        dummy.scale.setScalar(item.scale ?? 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
        if (colored) {
          if (item.color) color.set(item.color);
          else color.set(0xffffff);
          mesh.setColorAt(index, color);
        }
      });
      if (colored && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);
    }

    this.flowerSpots = items.flowers.list.map((item) => new THREE.Vector3(item.x, item.y, item.z));
  }

  _buildWater() {
    this.waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x3fa9c9,
      transparent: true,
      opacity: 0.82,
      roughness: 0.15,
      metalness: 0.1
    });
    for (const cell of this.cellsOfBiome("wetland")) {
      const rng = rngFrom("water", cell.x, cell.y);
      const center = this.cellCenter(cell.x, cell.y);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(randRange(rng, 1.15, 1.45), 22), this.waterMaterial);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(center.x, center.y + 0.045, center.z);
      this.group.add(pool);
      this.waterPools.push({ mesh: pool, baseScale: 1, phase: rng() * 10, cell });
    }
  }

  _buildMemorials() {
    const extinctions = [...(this.world.extinctions ?? [])].sort((a, b) => a.tick - b.tick);
    const count = extinctions.length;
    const radiusX = (this.map.width * TILE) / 2 + 2.1;
    const radiusZ = (this.map.height * TILE) / 2 + 2.1;

    extinctions.forEach((extinct, index) => {
      const rng = rngFrom("memorial", extinct.species);
      const angle = (index / Math.max(1, count)) * Math.PI * 2 + 0.35;
      const x = Math.cos(angle) * radiusX * 0.96;
      const z = Math.sin(angle) * radiusZ * 0.96;
      const pos = new THREE.Vector3(x, this.baseTop, z);
      const group = this._buildMemorialStone(extinct, pos, rng);
      this.group.add(group);
      this.memorials.push({ group, extinct, pos });
    });
  }

  _buildMemorialStone(extinct, pos, rng) {
    const group = new THREE.Group();
    group.position.copy(pos);

    const stone = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, randRange(rng, 1.0, 1.35), 0.3),
      new THREE.MeshStandardMaterial({ color: MEMORIAL_STONE, roughness: 0.85, flatShading: true })
    );
    stone.position.y = 0.55;
    // The thin side of the stone faces away from the island centre.
    const facing = Math.atan2(pos.x, pos.z);
    stone.rotation.y = facing + randRange(rng, -0.15, 0.15);
    stone.castShadow = true;
    group.add(stone);

    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(0.44, 0.3, 4),
      new THREE.MeshStandardMaterial({ color: 0xb7bfc9, roughness: 0.8, flatShading: true })
    );
    cap.position.y = 1.32;
    cap.rotation.y = Math.PI / 4;
    cap.scale.set(1, 0.8, 0.7);
    group.add(cap);

    // Name plaque — a tiny canvas so every extinct name survives in 3D.
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const g = canvas.getContext("2d");
    g.fillStyle = "rgba(20,28,40,0.55)";
    g.fillRect(0, 0, 256, 64);
    g.strokeStyle = "rgba(160,220,255,0.9)";
    g.strokeRect(3, 3, 250, 58);
    g.fillStyle = "#cfe8ff";
    g.font = "bold 26px Georgia, serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(extinct.name.slice(0, 14), 128, 32);
    const plaqueTexture = new THREE.CanvasTexture(canvas);
    plaqueTexture.colorSpace = THREE.SRGBColorSpace;
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.125),
      new THREE.MeshBasicMaterial({ map: plaqueTexture, transparent: true, opacity: 0.92 })
    );
    plaque.rotation.y = facing;
    plaque.position.set(
      Math.sin(facing) * 0.17,
      0.62,
      Math.cos(facing) * 0.17
    );
    group.add(plaque);

    // Ghost wisp — visible in the deep of night.
    const ghost = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture("soft"),
      color: 0xa8e4ff,
      transparent: true,
      opacity: 0,
      depthWrite: false
    }));
    ghost.scale.set(1.1, 1.4, 1);
    ghost.position.y = 2.1;
    group.add(ghost);

    // Hit target for clicks.
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 2.2, 1.1),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    hit.position.y = 1.05;
    hit.userData.memorial = { extinct, ghost };
    group.add(hit);
    this.memorialHitMeshes.push(hit);

    group.userData.memorial = { extinct, ghost };
    return group;
  }

  _buildFloatingRocks() {
    const rng = rngFrom("rocks", this.world.tick ?? 0);
    const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x6d6257, roughness: 1, flatShading: true });
    for (let i = 0; i < 7; i += 1) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(randRange(rng, 0.45, 1.15), 0), rockMaterial);
      const angle = randRange(rng, 0, Math.PI * 2);
      const distance = randRange(rng, 34, 48);
      rock.position.set(Math.cos(angle) * distance, randRange(rng, 2, 14), Math.sin(angle) * distance);
      rock.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      rock.castShadow = true;
      this.group.add(rock);
      this.floatingRocks.push({ mesh: rock, baseY: rock.position.y, phase: rng() * 10, speed: randRange(rng, 0.15, 0.45) });
    }
  }

  _buildHighlight() {
    this.highlight = new THREE.Mesh(
      new THREE.RingGeometry(1.6, 1.85, 4),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
    );
    this.highlight.rotation.x = -Math.PI / 2;
    this.highlight.visible = false;
    this.group.add(this.highlight);
  }

  highlightCell(cell) {
    if (!cell) {
      this.highlight.visible = false;
      return;
    }
    const center = this.cellCenter(cell.x, cell.y);
    this.highlight.position.set(center.x, center.y + 0.08, center.z);
    this.highlight.visible = true;
    this.highlight.rotation.z = Math.PI / 4;
  }

  /* -------------------------------------------------------------- */

  update(dt, nightFactor) {
    this.time += dt;

    for (const pool of this.waterPools) {
      const shimmer = 1 + Math.sin(this.time * 1.4 + pool.phase) * 0.012;
      pool.mesh.scale.set(shimmer, shimmer, 1);
    }

    for (const rock of this.floatingRocks) {
      rock.mesh.position.y = rock.baseY + Math.sin(this.time * rock.speed + rock.phase) * 0.8;
      rock.mesh.rotation.y += dt * 0.08;
    }

    const ghostOpacity = Math.max(0, nightFactor - 0.45) * 0.5;
    for (const memorial of this.memorials) {
      const ghost = memorial.group.userData.memorial?.ghost;
      if (ghost) {
        ghost.material.opacity = ghostOpacity;
        ghost.position.y = 2.1 + Math.sin(this.time * 0.8 + memorial.pos.x) * 0.15;
      }
    }
  }
}
