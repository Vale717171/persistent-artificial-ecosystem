/**
 * Creatures — procedural anatomy built from each species' real traits.
 *
 * size → body scale        speed → legs and stride
 * fertility → tail bloom   resilience → back plates
 * diet → silhouette        capabilities → wings, stingers, glow
 *
 * Every individual is a small puppet: named parts that the agent system
 * animates (legs, tail, head, wings, eyes, glow).
 */

import * as THREE from "three";
import { makeRng, randRange, pick } from "./rng.js";
import { speciesPalette, characterName } from "./narrative.js";
import { texture } from "./effects.js";

export function creatureScale(traits) {
  return 0.52 + (traits?.size ?? 4) * 0.082;
}

export function buildCreature(species, options = {}) {
  const rng = options.rng ?? makeRng(1);
  const palette = speciesPalette(species);
  const diet = species.ecology?.diet ?? "grazer";
  const capabilities = species.capabilities ?? [];
  const traits = species.traits ?? {};

  const group = new THREE.Group();
  const parts = { palette, diet, capabilities };

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.body),
    roughness: 0.82,
    flatShading: true
  });
  const bellyMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.belly),
    roughness: 0.85,
    flatShading: true
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.accent),
    roughness: 0.7,
    flatShading: true
  });

  const legLength = 0.26 + (traits.speed ?? 5) * 0.028;
  const bodyRadius = 0.5;

  // Rig lifts everything above the feet.
  const rig = new THREE.Group();
  rig.position.y = legLength + 0.14;
  group.add(rig);
  parts.rig = rig;
  parts.baseRigY = rig.position.y;

  /* Body ---------------------------------------------------------- */
  let body;
  if (diet === "predator") {
    body = new THREE.Mesh(new THREE.IcosahedronGeometry(bodyRadius, 0), bodyMaterial);
    body.scale.set(1.02, 0.82, 1.52);
  } else if (diet === "omnivore") {
    body = new THREE.Mesh(new THREE.SphereGeometry(bodyRadius, 8, 7), bodyMaterial);
    body.scale.set(1.02, 0.86, 1.4);
  } else {
    body = new THREE.Mesh(new THREE.SphereGeometry(bodyRadius, 9, 8), bodyMaterial);
    body.scale.set(1.08, 0.9, 1.34);
  }
  body.castShadow = true;
  rig.add(body);
  parts.body = body;
  parts.bodyScale = body.scale.clone();

  const belly = new THREE.Mesh(new THREE.SphereGeometry(bodyRadius * 0.86, 8, 7), bellyMaterial);
  belly.scale.set(1.02, 0.72, 1.3);
  belly.position.y = -0.12;
  rig.add(belly);

  /* Head ---------------------------------------------------------- */
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.34, 0.62);
  rig.add(headGroup);
  parts.head = headGroup;

  const head = diet === "predator"
    ? new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), bodyMaterial)
    : new THREE.Mesh(new THREE.SphereGeometry(0.29, 9, 8), bodyMaterial);
  head.castShadow = true;
  headGroup.add(head);
  parts.headMesh = head;

  if (diet === "predator") {
    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.34, 6), bellyMaterial);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, -0.03, 0.32);
    headGroup.add(snout);
  }

  const eyeMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.eye),
    roughness: 0.35,
    emissive: new THREE.Color(capabilities.includes("nocturnal") ? 0x51e8ff : 0x000000),
    emissiveIntensity: 0
  });
  parts.eyeMaterial = eyeMaterial;
  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), eyeMaterial);
    eye.position.set(side * 0.14, 0.1, 0.21);
    headGroup.add(eye);
    eyes.push(eye);
    const glint = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    glint.position.set(side * 0.15, 0.12, 0.26);
    headGroup.add(glint);
  }
  parts.eyes = eyes;

  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 5), bodyMaterial);
    ear.position.set(side * 0.16, 0.26, -0.02);
    ear.rotation.z = -side * 0.35;
    headGroup.add(ear);
  }

  /* Tail ---------------------------------------------------------- */
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, 0.22, -0.68);
  rig.add(tailGroup);
  parts.tail = tailGroup;

  if (capabilities.includes("venom")) {
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.62, 6), accentMaterial);
    tail.rotation.x = -Math.PI / 2.3;
    tail.position.z = -0.26;
    tailGroup.add(tail);
    const stinger = new THREE.Mesh(
      new THREE.ConeGeometry(0.07, 0.2, 5),
      new THREE.MeshStandardMaterial({
        color: 0x8dff5a,
        emissive: new THREE.Color(0x4dff2a),
        emissiveIntensity: 0.9,
        roughness: 0.4
      })
    );
    stinger.rotation.x = -Math.PI / 2.3;
    stinger.position.set(0, 0.16, -0.6);
    tailGroup.add(stinger);
    parts.stinger = stinger;
  } else {
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.5, 6), accentMaterial);
    tail.rotation.x = -Math.PI / 2.2;
    tail.position.z = -0.2;
    tailGroup.add(tail);
    const bloom = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.08, 0),
      new THREE.MeshStandardMaterial({
        color: 0xffa8c8,
        roughness: 0.6,
        flatShading: true
      })
    );
    bloom.position.set(0, 0.14, -0.44);
    tailGroup.add(bloom);
    parts.tailBloom = bloom;
  }

  /* Legs ---------------------------------------------------------- */
  const legs = [];
  const legMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.belly).multiplyScalar(0.9),
    roughness: 0.9,
    flatShading: true
  });
  const legGeometry = new THREE.CylinderGeometry(0.05, 0.062, legLength, 5);
  legGeometry.translate(0, -legLength / 2, 0);
  const hipPositions = [
    [-0.26, 0.4], [0.26, 0.4], [-0.26, -0.4], [0.26, -0.4]
  ];
  for (const [hipX, hipZ] of hipPositions) {
    const leg = new THREE.Group();
    leg.position.set(hipX, 0.02, hipZ);
    const limb = new THREE.Mesh(legGeometry, legMaterial);
    // Legs skip shadow casting: the body already grounds the creature and
    // this halves the shadow-pass draw calls of the whole cast.
    limb.castShadow = false;
    leg.add(limb);
    rig.add(leg);
    legs.push(leg);
  }
  parts.legs = legs;
  parts.legLength = legLength;

  /* Spikes (predators look dangerous) ------------------------------- */
  if (diet === "predator" || capabilities.includes("venom")) {
    for (let i = 0; i < 4; i += 1) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2 + (diet === "predator" ? 0.06 : 0), 4), accentMaterial);
      spike.position.set(0, 0.42 - i * 0.02, 0.35 - i * 0.26);
      rig.add(spike);
    }
  }

  /* Armour plates (resilient species) ------------------------------- */
  if ((traits.resilience ?? 0) >= 7) {
    for (let i = 0; i < 3; i += 1) {
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.09, 0.3),
        new THREE.MeshStandardMaterial({ color: 0xb8b2a6, roughness: 0.6, flatShading: true })
      );
      plate.position.set(0, 0.46, 0.3 - i * 0.34);
      plate.rotation.x = 0.16;
      rig.add(plate);
    }
  }

  /* Photosynthesis glow spots --------------------------------------- */
  if (capabilities.includes("photosynthesis")) {
    const glowMaterial = new THREE.MeshStandardMaterial({
      color: 0x9dffb0,
      emissive: new THREE.Color(0x54ff88),
      emissiveIntensity: 0.35,
      roughness: 0.5
    });
    parts.glowMaterial = glowMaterial;
    for (let i = 0; i < 5; i += 1) {
      const spot = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), glowMaterial);
      spot.position.set((i % 2 === 0 ? -0.14 : 0.14), 0.34, 0.3 - i * 0.16);
      rig.add(spot);
    }
  }

  /* Wings ----------------------------------------------------------- */
  if (capabilities.includes("flight")) {
    const wingMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(palette.accent),
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      roughness: 0.6,
      flatShading: true
    });
    parts.wings = [];
    for (const side of [-1, 1]) {
      const wingGeometry = new THREE.PlaneGeometry(0.78, 0.42);
      wingGeometry.translate(0.39, 0, 0);
      const wing = new THREE.Mesh(wingGeometry, wingMaterial);
      wing.position.set(side * 0.34, 0.4, 0.05);
      wing.rotation.y = side > 0 ? -0.5 : Math.PI + 0.5;
      rig.add(wing);
      parts.wings.push(wing);
    }
  }

  /* Champion regalia ------------------------------------------------ */
  if (options.champion) {
    const gold = new THREE.MeshStandardMaterial({
      color: 0xf5c542,
      emissive: new THREE.Color(0x664400),
      emissiveIntensity: 0.35,
      roughness: 0.35,
      metalness: 0.55,
      flatShading: true
    });
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.34, 6), gold);
    horn.position.set(0, 0.3, 0.12);
    horn.rotation.x = -0.25;
    headGroup.add(horn);
    const crown = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.028, 6, 14), gold);
    crown.position.set(0, 0.24, 0);
    crown.rotation.x = Math.PI / 2;
    headGroup.add(crown);

    const aura = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture("soft"),
      color: 0xf5c542,
      transparent: true,
      opacity: 0.28,
      depthWrite: false
    }));
    aura.scale.set(2.4, 1.1, 1);
    aura.position.y = 0.35;
    group.add(aura);
    parts.aura = aura;
  }

  /* Name label ------------------------------------------------------ */
  const label = makeLabel(options.name ?? species.name, options.champion, options.epithet ?? null);
  label.position.y = 1.5;
  group.add(label);
  parts.label = label;

  /* Hit sphere for picking ------------------------------------------ */
  const hitbox = new THREE.Mesh(
    new THREE.SphereGeometry(0.95, 8, 6),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, visible: false })
  );
  hitbox.position.y = 0.6;
  group.add(hitbox);
  parts.hitbox = hitbox;

  const scale = creatureScale(traits) * (options.scaleMultiplier ?? 1);
  group.scale.setScalar(scale);
  parts.scale = scale;

  return { group, parts };
}

/* ------------------------------------------------------------------ */

export function makeLabel(name, champion = false, epithet = null) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 96;
  const g = canvas.getContext("2d");
  g.clearRect(0, 0, 320, 96);

  g.font = `bold 34px Georgia, 'Times New Roman', serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = champion ? "#f5c542" : "#f2f5fa";
  g.strokeStyle = "rgba(8,12,22,0.9)";
  g.lineWidth = 6;
  g.strokeText(name, 160, champion && epithet ? 30 : 48);
  g.fillText(name, 160, champion && epithet ? 30 : 48);
  if (champion && epithet) {
    g.font = "italic 24px Georgia, serif";
    g.fillStyle = "#ffd98a";
    g.lineWidth = 5;
    g.strokeText(epithet, 160, 66);
    g.fillText(epithet, 160, 66);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: champion ? 0.95 : 0,
    depthWrite: false
  }));
  sprite.scale.set(2.6, 0.78, 1);
  sprite.renderOrder = 5;
  return sprite;
}
