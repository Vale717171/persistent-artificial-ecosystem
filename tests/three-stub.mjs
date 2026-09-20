/**
 * A faithful-enough three.js stub for headless integration tests.
 *
 * It implements the vector math, the scene graph and the APIs the
 * observatory actually uses, so the whole simulation (terrain, sky,
 * creatures, agents, director) can run under `node --test` without
 * WebGL. Rendering itself is a no-op.
 */

export const SRGBColorSpace = "srgb";
export const PCFSoftShadowMap = 1;
export const ACESFilmicToneMapping = 2;
export const AdditiveBlending = 2;
export const DoubleSide = 2;
export const BackSide = 1;

export class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  setScalar(s) { this.x = s; this.y = s; this.z = s; return this; }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  subVectors(a, b) { return this.copy(a).sub(b); }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  divideScalar(s) { return this.multiplyScalar(1 / s); }
  length() { return Math.hypot(this.x, this.y, this.z); }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  normalize() { const l = this.length() || 1; return this.divideScalar(l); }
  lerp(v, t) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
  setY(y) { this.y = y; return this; }
  setX(x) { this.x = x; return this; }
  setZ(z) { this.z = z; return this; }
}

export class Vector2 {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  set(x, y) { this.x = x; this.y = y; return this; }
}

const CHANNELS = { r: "r", g: "g", b: "b" };

export class Color {
  constructor(...args) { this.r = 0; this.g = 0; this.b = 0; if (args.length) this.set(...args); }
  set(value) {
    if (typeof value === "string") {
      const parsed = parseColorString(value);
      this.r = parsed[0]; this.g = parsed[1]; this.b = parsed[2];
    } else if (value instanceof Color) {
      this.copy(value);
    } else if (typeof value === "number") {
      this.r = ((value >> 16) & 255) / 255;
      this.g = ((value >> 8) & 255) / 255;
      this.b = (value & 255) / 255;
    }
    return this;
  }
  copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; }
  clone() { return new Color().copy(this); }
  lerp(c, t) {
    for (const key of Object.keys(CHANNELS)) this[key] += (c[key] - this[key]) * t;
    return this;
  }
  lerpColors(a, b, t) { this.copy(a).lerp(b, t); return this; }
  multiplyScalar(s) { this.r *= s; this.g *= s; this.b *= s; return this; }
  setHSL(h, s, l) {
    h = ((h % 1) + 1) % 1;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h * 6;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let rgb;
    if (hp < 1) rgb = [c, x, 0];
    else if (hp < 2) rgb = [x, c, 0];
    else if (hp < 3) rgb = [0, c, x];
    else if (hp < 4) rgb = [0, x, c];
    else if (hp < 5) rgb = [x, 0, c];
    else rgb = [c, 0, x];
    const m = l - c / 2;
    this.r = rgb[0] + m; this.g = rgb[1] + m; this.b = rgb[2] + m;
    return this;
  }
  getHex() {
    return (Math.round(this.r * 255) << 16) | (Math.round(this.g * 255) << 8) | Math.round(this.b * 255);
  }
}

function parseColorString(value) {
  const hex = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (hex) {
    const int = parseInt(hex[1], 16);
    return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
  }
  const hsl = /^hsl\(\s*([\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%\s*\)$/i.exec(value.trim());
  if (hsl) {
    const color = new Color().setHSL(Number(hsl[1]) / 360, Number(hsl[2]) / 100, Number(hsl[3]) / 100);
    return [color.r, color.g, color.b];
  }
  return [1, 1, 1];
}

export class Euler {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(e) { this.x = e.x; this.y = e.y; this.z = e.z; return this; }
  clone() { return new Euler(this.x, this.y, this.z); }
}

export class Object3D {
  constructor() {
    this.position = new Vector3();
    this.rotation = new Euler();
    this.scale = new Vector3(1, 1, 1);
    this.children = [];
    this.parent = null;
    this.visible = true;
    this.castShadow = false;
    this.receiveShadow = false;
    this.frustumCulled = true;
    this.renderOrder = 0;
    this.userData = {};
    this.material = null;
    this.geometry = null;
    this.matrix = { elements: new Array(16).fill(0) };
  }
  add(child) {
    child.parent = this;
    this.children.push(child);
    return this;
  }
  remove(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parent = null;
    return this;
  }
  traverse(callback) {
    callback(this);
    for (const child of [...this.children]) child.traverse(callback);
  }
  updateMatrix() { return this; }
  lookAt() { return this; }
  copy(source) {
    this.position.copy(source.position);
    this.rotation.copy(source.rotation);
    this.scale.copy(source.scale);
    return this;
  }
}

export class Group extends Object3D {}
export class Scene extends Object3D {
  constructor() { super(); this.fog = null; }
}

export class Mesh extends Object3D {
  constructor(geometry = new BufferGeometry(), material = null) {
    super();
    this.geometry = geometry;
    this.material = material;
  }
}

export class InstancedMesh extends Mesh {
  constructor(geometry, material, count) {
    super(geometry, material);
    this.count = count;
    this.instanceMatrix = { needsUpdate: false, array: [] };
    this.instanceColor = null;
    this._matrices = [];
    this._colors = [];
  }
  setMatrixAt(index, matrix) { this._matrices[index] = matrix; this.instanceMatrix.needsUpdate = true; }
  setColorAt(index, color) {
    this._colors[index] = color.clone();
    if (!this.instanceColor) this.instanceColor = { needsUpdate: true, array: [] };
    this.instanceColor.needsUpdate = true;
  }
}

export class Sprite extends Object3D {
  constructor(material = null) { super(); this.material = material; }
}

export class Points extends Object3D {
  constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; }
}

export class BufferAttribute {
  constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.needsUpdate = false; }
  set() {}
}

export class BufferGeometry {
  constructor() { this.attributes = {}; }
  setAttribute(name, attribute) { this.attributes[name] = attribute; return this; }
  getAttribute(name) { return this.attributes[name]; }
  translate() { return this; }
}

export class Geometry extends BufferGeometry {}

function makeGeometryClass(name) {
  return class extends BufferGeometry {
    constructor(...args) {
      super(...args);
      this.args = args;
      this.type = name;
    }
  };
}

export const BoxGeometry = makeGeometryClass("BoxGeometry");
export const SphereGeometry = makeGeometryClass("SphereGeometry");
export const ConeGeometry = makeGeometryClass("ConeGeometry");
export const CylinderGeometry = makeGeometryClass("CylinderGeometry");
export const IcosahedronGeometry = makeGeometryClass("IcosahedronGeometry");
export const DodecahedronGeometry = makeGeometryClass("DodecahedronGeometry");
export const TorusGeometry = makeGeometryClass("TorusGeometry");
export const PlaneGeometry = makeGeometryClass("PlaneGeometry");
export const CircleGeometry = makeGeometryClass("CircleGeometry");
export const RingGeometry = makeGeometryClass("RingGeometry");
export const CapsuleGeometry = makeGeometryClass("CapsuleGeometry");

let materialCounter = 0;

class Material {
  constructor(options = {}) {
    this.uuid = `mat-${materialCounter += 1}`;
    Object.assign(this, {
      transparent: false,
      opacity: 1,
      visible: true,
      depthWrite: true,
      side: 0,
      blending: 0,
      fog: true,
      flatShading: false,
      roughness: 1,
      metalness: 0,
      map: null,
      rotation: 0,
      needsUpdate: false
    }, options);
    if (options.color !== undefined) this.color = new Color(options.color);
    else if (!(this instanceof ShaderMaterial)) this.color = new Color(0xffffff);
    if (options.emissive !== undefined) this.emissive = new Color(options.emissive);
  }
}

export class MeshStandardMaterial extends Material {}
export class MeshBasicMaterial extends Material {}
export class SpriteMaterial extends Material {}
export class PointsMaterial extends Material {}

export class ShaderMaterial extends Material {
  constructor(options = {}) {
    super(options);
    this.uniforms = options.uniforms ?? {};
    this.vertexShader = options.vertexShader ?? "";
    this.fragmentShader = options.fragmentShader ?? "";
  }
}

export class CanvasTexture {
  constructor(canvas) { this.canvas = canvas; this.colorSpace = ""; this.needsUpdate = false; }
}

export class Light extends Object3D {
  constructor(color = 0xffffff, intensity = 1) {
    super();
    this.color = new Color(color);
    this.intensity = intensity;
  }
}
export class DirectionalLight extends Light {
  constructor(color, intensity) {
    super(color, intensity);
    this.target = new Object3D();
    this.shadow = { mapSize: { set() {} }, camera: { near: 0, far: 0, left: 0, right: 0, top: 0, bottom: 0 }, bias: 0 };
    this.castShadow = false;
  }
}
export class HemisphereLight extends Light {}
export class AmbientLight extends Light {}
export class PointLight extends Light {
  constructor(color, intensity, distance, decay) {
    super(color, intensity);
    this.distance = distance;
    this.decay = decay;
  }
}

export class FogExp2 {
  constructor(color, density) { this.color = new Color(color); this.density = density; }
}

export class PerspectiveCamera extends Object3D {
  constructor(fov, aspect, near, far) {
    super();
    this.fov = fov; this.aspect = aspect; this.near = near; this.far = far;
    this.projectionMatrix = { elements: [] };
  }
  updateProjectionMatrix() {}
}

export class WebGLRenderer {
  constructor() {
    this.shadowMap = { enabled: false, type: 0 };
    this.toneMapping = 0;
    this.toneMappingExposure = 1;
    this.domElement = { style: {}, addEventListener() {}, removeEventListener() {} };
    this.pixelRatio = 1;
  }
  setPixelRatio() {}
  setSize() {}
  render() {}
}

export class Raycaster {
  constructor() { this.ray = null; }
  setFromCamera() {}
  intersectObjects() { return []; }
}

export class Clock {
  constructor() { this.autoStart = true; this._last = 0; }
  getDelta() {
    const delta = 1 / 60;
    this._last += delta;
    return delta;
  }
}

export const MathUtils = {
  lerp: (a, b, t) => a + (b - a) * t,
  clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
  damp: (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt))
};
