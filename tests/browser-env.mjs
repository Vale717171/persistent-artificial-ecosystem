/**
 * Browser globals for the headless observatory test: a permissive DOM,
 * a rAF pump and a fetch that serves the real committed world.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORLD = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "world.json"), "utf8"));

/** The world served by the stubbed fetch — tests can swap in a synthetic one. */
let servedWorld = WORLD;

export function setWorld(world) {
  servedWorld = world;
}

export const rafQueue = [];

function make2D() {
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "createRadialGradient" || prop === "createLinearGradient") {
        return () => ({ addColorStop() {} });
      }
      if (typeof target[prop] !== "undefined") return target[prop];
      return () => {};
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    }
  });
}

export function makeElement(tag = "div") {
  const children = [];
  const el = {
    tagName: tag.toUpperCase(),
    children,
    style: {},
    dataset: {},
    classList: {
      add() {}, remove() {}, toggle() {}, contains() { return false; }
    },
    textContent: "",
    innerHTML: "",
    title: "",
    hidden: false,
    appendChild(child) { children.push(child); return child; },
    prepend(child) { children.unshift(child); return child; },
    removeChild(child) {
      const index = children.indexOf(child);
      if (index >= 0) children.splice(index, 1);
      return child;
    },
    get lastChild() { return children[children.length - 1] ?? null; },
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return makeElement("div"); },
    querySelectorAll() { return []; },
    get offsetWidth() { return 0; },
    getContext() { return make2D(); },
    width: 64,
    height: 64
  };
  return el;
}

const elementsById = new Map();

export function installGlobals() {
  globalThis.window = {
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 1,
    addEventListener() {},
    location: { reload() {} }
  };
  globalThis.document = {
    getElementById(id) {
      if (!elementsById.has(id)) elementsById.set(id, makeElement("div"));
      return elementsById.get(id);
    },
    createElement(tag) {
      if (tag === "canvas") {
        const canvas = makeElement("canvas");
        canvas.getContext = () => make2D();
        return canvas;
      }
      return makeElement(tag);
    },
    addEventListener() {},
    head: makeElement("head"),
    body: makeElement("body")
  };
  globalThis.requestAnimationFrame = (callback) => {
    rafQueue.push(callback);
    return rafQueue.length;
  };
  globalThis.fetch = async (url) => {
    if (String(url).includes("world.json")) {
      return { ok: true, status: 200, json: async () => servedWorld };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  globalThis.setTimeout = () => 0;
  globalThis.clearTimeout = () => {};
}

/** Runs `frames` animation frames of the observatory loop. */
export function pump(frames) {
  for (let i = 0; i < frames; i += 1) {
    const callback = rafQueue.shift();
    if (!callback) throw new Error("rAF queue empty: the render loop stopped");
    callback();
  }
}

export { WORLD };
