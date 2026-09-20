/**
 * Custom orbit camera — drag to rotate, wheel/pinch to zoom.
 * Written by hand (instead of OrbitControls) so the cinematic director and
 * the user can share the same camera state seamlessly.
 */

import * as THREE from "three";

const MIN_POLAR = 0.18;
const MAX_POLAR = 1.52;
const MIN_RADIUS = 9;
const MAX_RADIUS = 150;

export class OrbitCam {
  constructor(camera, domElement, onUserInteract) {
    this.camera = camera;
    this.dom = domElement;
    this.onUserInteract = onUserInteract ?? (() => {});

    this.azimuth = 0.9;
    this.polar = 1.05;
    this.radius = 62;
    this.target = new THREE.Vector3(0, 1.5, 0);

    this.goalAzimuth = this.azimuth;
    this.goalPolar = this.polar;
    this.goalRadius = this.radius;
    this.goalTarget = this.target.clone();
    this.tween = 0;

    this.enabled = true;
    this.pointers = new Map();
    this.pinchDistance = 0;
    this.dragDistance = 0;
    this.dragTime = 0;

    this._bind();
  }

  _bind() {
    const dom = this.dom;
    dom.style.touchAction = "none";

    dom.addEventListener("pointerdown", (event) => {
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      this.dragDistance = 0;
      this.dragTime = performance.now();
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });

    dom.addEventListener("pointermove", (event) => {
      const previous = this.pointers.get(event.pointerId);
      if (!previous) return;
      const dx = event.clientX - previous.x;
      const dy = event.clientY - previous.y;
      previous.x = event.clientX;
      previous.y = event.clientY;
      this.dragDistance += Math.abs(dx) + Math.abs(dy);

      if (this.pointers.size === 1 && this.enabled) {
        this.goalAzimuth -= dx * 0.0042;
        this.goalPolar = clamp(this.goalPolar - dy * 0.0038, MIN_POLAR, MAX_POLAR);
        if (Math.abs(dx) + Math.abs(dy) > 2) this.onUserInteract("drag");
      } else if (this.pointers.size === 2 && this.enabled) {
        const [a, b] = [...this.pointers.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinchDistance > 0) {
          this.goalRadius = clamp(this.goalRadius * (this.pinchDistance / distance), MIN_RADIUS, MAX_RADIUS);
        }
        this.pinchDistance = distance;
        this.onUserInteract("pinch");
      }
    });

    const release = (event) => {
      this.pointers.delete(event.pointerId);
      this.pinchDistance = 0;
    };
    dom.addEventListener("pointerup", release);
    dom.addEventListener("pointercancel", release);
    dom.addEventListener("pointerleave", release);

    dom.addEventListener("wheel", (event) => {
      event.preventDefault();
      if (!this.enabled) return;
      this.goalRadius = clamp(this.goalRadius * Math.exp(event.deltaY * 0.0011), MIN_RADIUS, MAX_RADIUS);
      this.onUserInteract("wheel");
    }, { passive: false });

    dom.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  /** Smoothly moves the orbit pivot (used by focus actions). */
  focusOn(target, radius = 18, azimuth = null) {
    this.goalTarget.copy(target);
    if (radius) this.goalRadius = clamp(radius, MIN_RADIUS, MAX_RADIUS);
    if (azimuth !== null) this.goalAzimuth = azimuth;
    this.tween = 1;
  }

  /** Reads current camera transform back into the orbit state (after cinematic moves). */
  syncFromCamera() {
    const offset = this.camera.position.clone().sub(this.target);
    this.radius = clamp(offset.length(), MIN_RADIUS, MAX_RADIUS);
    this.goalRadius = this.radius;
    this.polar = clamp(Math.acos(clamp(offset.y / this.radius, -1, 1)), MIN_POLAR, MAX_POLAR);
    this.goalPolar = this.polar;
    this.azimuth = Math.atan2(offset.x, offset.z);
    this.goalAzimuth = this.azimuth;
  }

  update(dt) {
    const k = 1 - Math.exp(-dt * 6.5);
    this.azimuth += (this.goalAzimuth - this.azimuth) * k;
    this.polar += (this.goalPolar - this.polar) * k;
    this.radius += (this.goalRadius - this.radius) * k;
    this.target.lerp(this.goalTarget, Math.min(1, k * 1.4));

    const sinPolar = Math.sin(this.polar);
    this.camera.position.set(
      this.target.x + this.radius * sinPolar * Math.sin(this.azimuth),
      this.target.y + this.radius * Math.cos(this.polar),
      this.target.z + this.radius * sinPolar * Math.cos(this.azimuth)
    );
    this.camera.lookAt(this.target);
  }

  wasDrag() {
    return this.dragDistance > 7 && performance.now() - this.dragTime < 450;
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
