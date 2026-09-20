/**
 * Sky — the atmosphere of the observatory.
 *
 * Gradient dome, travelling sun and moon, stars, drifting clouds, weather
 * particles (rain / snow / dust), fireflies at dusk, and circling birds.
 * All colors are driven by the world's real climate (temperature, moisture)
 * and by the current weather chosen by the director.
 */

import * as THREE from "three";
import { makeRng, randRange } from "./rng.js";

const DAY_TOP = new THREE.Color(0x5d93c9);
const DAY_BOTTOM = new THREE.Color(0xc9dfe6);
const DUSK_TOP = new THREE.Color(0x3b3f70);
const DUSK_BOTTOM = new THREE.Color(0xf2a05f);
const NIGHT_TOP = new THREE.Color(0x070b1d);
const NIGHT_BOTTOM = new THREE.Color(0x141c33);
const HOT_TINT = new THREE.Color(0xd9a06b);
const DRY_TINT = new THREE.Color(0xdcc39a);
const WET_TINT = new THREE.Color(0x8fa3ad);
const STORM_TOP = new THREE.Color(0x2e3540);
const STORM_BOTTOM = new THREE.Color(0x4a525c);
const CLOUD_DAY = new THREE.Color(0xffffff);
const CLOUD_DUSK = new THREE.Color(0xffc9a8);
const CLOUD_STORM = new THREE.Color(0x2a313c);

/* Scratch colors: sky.update() runs every frame and must not allocate. */
const _top = new THREE.Color();
const _bottom = new THREE.Color();
const _cloud = new THREE.Color();

export class Sky {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = ctx.scene;
    this.rng = makeRng(0x5d17b);

    this._buildLights();
    this._buildDome();
    this._buildStars();
    this._buildSunMoon();
    this._buildClouds();
    this._buildWeatherParticles();
    this._buildFireflies();
    this._buildBirds();

    this.sunDirection = new THREE.Vector3(0.5, 0.8, 0.3);
    this.nightFactor = 0;
    this.dayFactor = 1;
    this.eclipse = 0;
  }

  _buildLights() {
    this.hemi = new THREE.HemisphereLight(0xcfe5f2, 0x8a7a5c, 0.55);
    this.scene.add(this.hemi);

    this.sunLight = new THREE.DirectionalLight(0xffe8c0, 2.4);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 10;
    // The light sits ~200 units away at low sun angles: a short far plane
    // would clip the island's shadows at dawn and dusk.
    this.sunLight.shadow.camera.far = 360;
    this.sunLight.shadow.camera.left = -40;
    this.sunLight.shadow.camera.right = 40;
    this.sunLight.shadow.camera.top = 34;
    this.sunLight.shadow.camera.bottom = -34;
    this.sunLight.shadow.bias = -0.0006;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.moonLight = new THREE.DirectionalLight(0x9fb6e8, 0);
    this.scene.add(this.moonLight);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.16);
    this.scene.add(this.ambient);
  }

  _buildDome() {
    this.domeUniforms = {
      topColor: { value: new THREE.Color(0x5d93c9) },
      bottomColor: { value: new THREE.Color(0xc9dfe6) }
    };
    const material = new THREE.ShaderMaterial({
      uniforms: this.domeUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */`
        varying vec3 vWorldPosition;
        void main() {
          vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition).y;
          float power = pow(max(h, 0.0), 0.55);
          gl_FragColor = vec4(mix(bottomColor, topColor, power), 1.0);
        }
      `
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(420, 20, 14), material);
    this.dome.frustumCulled = false;
    this.scene.add(this.dome);

    this.scene.fog = new THREE.FogExp2(0xc9dfe6, 0.0035);
  }

  _buildStars() {
    const count = 700;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const theta = this.rng() * Math.PI * 2;
      const phi = Math.acos(randRange(this.rng, -0.05, 1));
      const radius = 395;
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi);
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.starMaterial = new THREE.PointsMaterial({
      color: 0xd8e4ff,
      size: 1.7,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false
    });
    this.stars = new THREE.Points(geometry, this.starMaterial);
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  _buildSunMoon() {
    const makeDisc = (inner, outer, size) => {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const g = canvas.getContext("2d");
      const gradient = g.createRadialGradient(32, 32, 4, 32, 32, 30);
      gradient.addColorStop(0, inner);
      gradient.addColorStop(0.4, inner);
      gradient.addColorStop(1, outer);
      g.fillStyle = gradient;
      g.fillRect(0, 0, 64, 64);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, fog: false, depthWrite: false
      }));
      sprite.scale.set(size, size, 1);
      this.scene.add(sprite);
      return sprite;
    };
    this.sun = makeDisc("rgba(255,238,190,1)", "rgba(255,190,90,0)", 58);
    this.moon = makeDisc("rgba(226,236,255,1)", "rgba(150,170,220,0)", 26);
  }

  _buildClouds() {
    this.clouds = [];
    const material = () => new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1,
      flatShading: true,
      transparent: true,
      opacity: 0.82,
      fog: false
    });
    for (let i = 0; i < 9; i += 1) {
      const group = new THREE.Group();
      const puffs = Math.floor(randRange(this.rng, 3, 6));
      for (let p = 0; p < puffs; p += 1) {
        const mesh = new THREE.Mesh(
          new THREE.IcosahedronGeometry(randRange(this.rng, 1.6, 3.2), 1),
          material()
        );
        mesh.position.set(randRange(this.rng, -3, 3), randRange(this.rng, -0.6, 0.6), randRange(this.rng, -1.6, 1.6));
        mesh.scale.y = 0.55;
        group.add(mesh);
      }
      group.userData = {
        angle: this.rng() * Math.PI * 2,
        radius: randRange(this.rng, 38, 66),
        height: randRange(this.rng, 24, 40),
        speed: randRange(this.rng, 0.006, 0.016),
      };
      this.scene.add(group);
      this.clouds.push(group);
    }
  }

  _buildWeatherParticles() {
    this.fields = {};

    this.fields.rain = this._particleField(1300, {
      color: 0xa8cbe8,
      size: 0.09,
      opacity: 0,
      area: { x: 60, y: 34, z: 44 },
      speed: { x: 2, y: -30, z: 0 }
    });
    this.fields.snow = this._particleField(650, {
      color: 0xffffff,
      size: 0.22,
      opacity: 0,
      area: { x: 60, y: 34, z: 44 },
      speed: { x: 1.2, y: -2.6, z: 0.6 }
    });
    this.fields.dust = this._particleField(520, {
      color: 0xd8b98a,
      size: 0.3,
      opacity: 0,
      area: { x: 70, y: 8, z: 44 },
      speed: { x: 15, y: 0.4, z: 1.5 }
    });
  }

  _particleField(count, options) {
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = randRange(this.rng, -options.area.x / 2, options.area.x / 2);
      positions[i * 3 + 1] = randRange(this.rng, 0.5, options.area.y);
      positions[i * 3 + 2] = randRange(this.rng, -options.area.z / 2, options.area.z / 2);
      phases[i] = this.rng() * Math.PI * 2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: options.color,
      size: options.size,
      transparent: true,
      opacity: options.opacity,
      depthWrite: false
    });
    const points = new THREE.Points(geometry, material);
    points.visible = false;
    points.frustumCulled = false;
    this.scene.add(points);
    return { points, material, positions, phases, options, count, level: 0, target: 0 };
  }

  _buildFireflies() {
    const cells = this.ctx.world.map.cells.filter((cell) => cell.biome === "forest" || cell.biome === "wetland");
    const count = Math.min(90, cells.length * 6);
    const positions = new Float32Array(count * 3);
    this.fireflyAnchors = [];
    for (let i = 0; i < count; i += 1) {
      const cell = cells[Math.floor(this.rng() * cells.length)];
      const anchor = this.ctx.terrain
        ? new THREE.Vector3()
        : new THREE.Vector3();
      const gx = this.ctx.terrain ? this.ctx.terrain.x0 + cell.x * 4 : 0;
      const gz = this.ctx.terrain ? this.ctx.terrain.z0 + cell.y * 4 : 0;
      anchor.set(gx + randRange(this.rng, -1.6, 1.6), 1.2, gz + randRange(this.rng, -1.6, 1.6));
      this.fireflyAnchors.push({ anchor, phase: this.rng() * 10, range: randRange(this.rng, 0.8, 2.4) });
      positions[i * 3] = anchor.x;
      positions[i * 3 + 1] = anchor.y;
      positions[i * 3 + 2] = anchor.z;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.fireflyMaterial = new THREE.PointsMaterial({
      color: 0xc8ff9a,
      size: 0.34,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending
    });
    this.fireflies = new THREE.Points(geometry, this.fireflyMaterial);
    this.fireflies.frustumCulled = false;
    this.scene.add(this.fireflies);
  }

  _buildBirds() {
    this.flocks = [];
    const material = new THREE.MeshBasicMaterial({ color: 0x33302c, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
    for (let f = 0; f < 2; f += 1) {
      const flock = { birds: [], center: new THREE.Vector3(randRange(this.rng, -8, 8), randRange(this.rng, 17, 23), randRange(this.rng, -6, 6)), radius: randRange(this.rng, 9, 14), speed: randRange(this.rng, 0.14, 0.2) * (f === 0 ? 1 : -1), phase: this.rng() * 10 };
      for (let b = 0; b < 6; b += 1) {
        const bird = new THREE.Group();
        const wingGeometry = new THREE.PlaneGeometry(0.85, 0.28);
        wingGeometry.translate(0.42, 0, 0);
        const left = new THREE.Mesh(wingGeometry, material);
        const right = new THREE.Mesh(wingGeometry, material);
        right.rotation.y = Math.PI;
        bird.add(left);
        bird.add(right);
        bird.userData = { left, right, offset: (b / 6) * Math.PI * 2, height: randRange(this.rng, -1, 1), radial: randRange(this.rng, 0.7, 1.25), flap: randRange(this.rng, 8, 11) };
        this.scene.add(bird);
        flock.birds.push(bird);
      }
      this.flocks.push(flock);
    }
  }

  /* ------------------------------------------------------------------ */

  setWeather(weather) {
    this.fields.rain.target = weather === "rain" || weather === "storm" ? (weather === "storm" ? 0.85 : 0.6) : 0;
    this.fields.snow.target = weather === "snow" ? 0.8 : 0;
    this.fields.dust.target = weather === "dust" ? 0.55 : weather === "storm" ? 0.2 : 0;
    this.stormy = weather === "storm";
  }

  update(dt, tDay, environment, timeScale = 1) {
    const angle = tDay * Math.PI * 2;
    const elevation = Math.sin(angle);
    const horizon = Math.cos(angle);

    this.dayFactor = smoothstep(-0.14, 0.14, elevation);
    this.nightFactor = 1 - this.dayFactor;

    // Sun and moon travel on opposite sides of the sky.
    const sunPos = new THREE.Vector3(horizon * 300, elevation * 260, -110);
    const moonPos = sunPos.clone().multiplyScalar(-1);
    moonPos.z = 110;
    this.sun.position.copy(sunPos);
    this.moon.position.copy(moonPos);
    this.sunDirection.copy(sunPos).normalize();

    const lightScale = 1 - this.eclipse * 0.94;
    this.sunLight.position.copy(sunPos).multiplyScalar(0.5);
    this.sunLight.target.position.set(0, 0, 0);
    // The sun must go dark below the horizon, or it would uplight the
    // island from underneath at night.
    this.sunLight.intensity = this.dayFactor * 2.6 * lightScale;
    this.sunLight.color.setHSL(0.09, 0.55 * (1 - this.dayFactor * 0.6), 0.72);
    this.moonLight.position.copy(moonPos).multiplyScalar(0.5);
    this.moonLight.intensity = this.nightFactor * 0.5 * lightScale;
    this.hemi.intensity = 0.22 + this.dayFactor * 0.46 * lightScale;
    this.ambient.intensity = 0.1 + this.dayFactor * 0.12 + this.nightFactor * 0.05;

    // Sky palette: night/dusk/day, then climate tinting.
    if (elevation > 0.12) {
      _top.copy(DAY_TOP);
      _bottom.copy(DAY_BOTTOM);
    } else if (elevation > -0.12) {
      const duskAmount = 1 - Math.abs(elevation) / 0.12;
      _top.copy(DAY_TOP).lerp(DUSK_TOP, 0.6 + duskAmount * 0.4);
      _bottom.copy(DAY_BOTTOM).lerp(DUSK_BOTTOM, duskAmount);
    } else {
      _top.copy(NIGHT_TOP);
      _bottom.copy(NIGHT_BOTTOM);
    }
    const temperature = environment?.temperature ?? 0.55;
    const moisture = environment?.moisture ?? 0.55;
    if (temperature > 0.68) {
      _top.lerp(HOT_TINT, (temperature - 0.68) * 0.9 * this.dayFactor);
      _bottom.lerp(HOT_TINT, (temperature - 0.68) * 1.1 * this.dayFactor);
    }
    if (moisture < 0.3) _bottom.lerp(DRY_TINT, (0.3 - moisture) * 0.9 * this.dayFactor);
    if (moisture > 0.72) {
      _top.lerp(WET_TINT, (moisture - 0.72) * 0.7);
      _bottom.lerp(WET_TINT, (moisture - 0.72) * 0.7);
    }
    if (this.stormy) {
      _top.lerp(STORM_TOP, 0.5);
      _bottom.lerp(STORM_BOTTOM, 0.5);
    }
    _top.multiplyScalar(lightScale * 0.9 + 0.1);
    _bottom.multiplyScalar(lightScale * 0.9 + 0.1);

    this.domeUniforms.topColor.value.copy(_top);
    this.domeUniforms.bottomColor.value.copy(_bottom);
    this.scene.fog.color.copy(_bottom);
    this.scene.fog.density = 0.0032
      + (this.stormy ? 0.004 : 0)
      + (this.fields.rain.level > 0.1 ? 0.0035 : 0)
      + (this.fields.dust.level > 0.1 ? 0.0055 : 0)
      + (this.fields.snow.level > 0.1 ? 0.004 : 0);

    this.starMaterial.opacity = this.nightFactor * (0.65 + 0.35 * Math.sin((this.ctx.time ?? 0) * 2.2)) * lightScale;
    this.sun.material.opacity = this.dayFactor;
    this.moon.material.opacity = this.nightFactor;

    // Clouds
    _cloud.copy(CLOUD_DAY)
      .lerp(CLOUD_DUSK, (1 - this.dayFactor) * 0.75)
      .lerp(CLOUD_STORM, this.stormy ? 0.62 : 0)
      .multiplyScalar(lightScale * 0.85 + 0.15);
    for (const cloud of this.clouds) {
      const data = cloud.userData;
      data.angle += data.speed * dt * (this.stormy ? 2.4 : 1);
      cloud.position.set(
        Math.cos(data.angle) * data.radius,
        data.height - (this.stormy ? 9 : 0),
        Math.sin(data.angle) * data.radius
      );
      for (const puff of cloud.children) {
        puff.material.color.copy(_cloud);
        puff.material.opacity = this.stormy ? 0.94 : 0.8;
      }
    }

    // Weather particle fields
    for (const field of Object.values(this.fields)) {
      field.level += (field.target - field.level) * Math.min(1, dt * 0.8);
      const visible = field.level > 0.02;
      field.points.visible = visible;
      field.material.opacity = Math.min(0.85, field.level);
      if (!visible) continue;
      const { positions, phases, count, options } = field;
      for (let i = 0; i < count; i += 1) {
        const index = i * 3;
        positions[index] += (options.speed.x + Math.sin(phases[i]) * 0.8) * dt;
        positions[index + 1] += options.speed.y * dt;
        positions[index + 2] += (options.speed.z + Math.cos(phases[i] * 0.7) * 0.6) * dt;
        if (options.speed.y < 0 && positions[index + 1] < 0.3) {
          positions[index + 1] = options.area.y;
          positions[index] = randRange(this.rng, -options.area.x / 2, options.area.x / 2);
        }
        if (options.speed.y >= 0 && positions[index + 1] > options.area.y) {
          positions[index + 1] = 0.4;
        }
        if (positions[index] > options.area.x / 2) positions[index] -= options.area.x;
        if (positions[index] < -options.area.x / 2) positions[index] += options.area.x;
        if (positions[index + 2] > options.area.z / 2) positions[index + 2] -= options.area.z;
        if (positions[index + 2] < -options.area.z / 2) positions[index + 2] += options.area.z;
      }
      field.points.geometry.attributes.position.needsUpdate = true;
    }

    // Fireflies at dusk and night
    const fireflyLevel = this.nightFactor * (this.stormy ? 0 : 1);
    this.fireflyMaterial.opacity = fireflyLevel * 0.9;
    if (fireflyLevel > 0.03) {
      this.fireflies.visible = true;
      const positions = this.fireflies.geometry.attributes.position.array;
      const t = this.ctx.time ?? 0;
      this.fireflyAnchors.forEach((fly, i) => {
        positions[i * 3] = fly.anchor.x + Math.sin(t * 0.5 + fly.phase) * fly.range;
        positions[i * 3 + 1] = (this.ctx.terrain ? this.ctx.terrain.heightAt(fly.anchor.x, fly.anchor.z) : 0)
          + 0.55 + Math.sin(t * 0.8 + fly.phase * 2) * 0.45;
        positions[i * 3 + 2] = fly.anchor.z + Math.cos(t * 0.4 + fly.phase) * fly.range;
      });
      this.fireflies.geometry.attributes.position.needsUpdate = true;
    } else {
      this.fireflies.visible = false;
    }

    // Birds fly by day only.
    const birdVisible = this.dayFactor > 0.25 && !this.stormy;
    for (const flock of this.flocks) {
      const t = (this.ctx.time ?? 0) * flock.speed + flock.phase;
      flock.birds.forEach((bird, index) => {
        bird.visible = birdVisible;
        if (!birdVisible) return;
        const data = bird.userData;
        const angle = t + data.offset;
        bird.position.set(
          flock.center.x + Math.cos(angle) * flock.radius * data.radial,
          flock.center.y + data.height + Math.sin(angle * 2 + data.offset) * 1.2,
          flock.center.z + Math.sin(angle) * flock.radius * data.radial * 0.7
        );
        bird.rotation.y = -angle + (flock.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
        const flap = Math.sin((this.ctx.time ?? 0) * data.flap + data.offset) * 0.55;
        data.left.rotation.z = flap;
        data.right.rotation.z = -flap;
      });
    }
  }
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
