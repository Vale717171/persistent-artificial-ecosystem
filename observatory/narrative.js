/**
 * Narrative layer of the 3D observatory — pure logic, no three.js.
 *
 * Turns the committed world.json (English, aggregate, ecological) into an
 * Italian living chronicle: named individual characters with personalities
 * and epithets, translated events, and invented micro-stories.
 */

import { pick, randInt, randRange } from "./rng.js";

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

const MASCULINE_NAMES = [
  "Falco", "Bosco", "Ginepro", "Lupo", "Rovo", "Zefiro", "Cardo", "Tasso",
  "Ghiro", "Riccio", "Ciottolo", "Duno", "Ontano", "Ramo", "Muschio",
  "Pietrame", "Vento", "Sasso", "Ginevrino", "Brace", "Lichene", "Giunco",
  "Corvo", "Faggio", "Lampo", "Tarlo", "Cardello", "Salino", "Frassino"
];

const FEMININE_NAMES = [
  "Brina", "Ambra", "Duna", "Fiamma", "Gemma", "Luna", "Mora", "Nebbia",
  "Onda", "Perla", "Quercia", "Rugiada", "Spiga", "Stella", "Terra",
  "Viola", "Zolla", "Ghiaia", "Iris", "Foglia", "Cerbiatta", "Tramontana",
  "Salvia", "Lichenia", "Brezza", "Roccia", "Cenere", "Mirra", "Edera",
  "Vulpia"
];

const SURNAMES = [
  "delle Dune", "del Gelo", "dell'Alba", "del Bosco", "delle Paludi",
  "delle Braci", "della Tempesta", "delle Stelle", "del Silenzio",
  "delle Radici", "del Lampo", "della Neve", "del Deserto",
  "della Montagna", "del Crepuscolo", "dei Laghi", "della Sabbia",
  "del Tuono", "delle Rocce", "dei Sussurri", "del Mattino",
  "delle Ombre", "del Fiume", "dei Venti", "delle Meraviglie"
];

const EPITHETS = {
  masculine: [
    "il Grande", "il Vecchio", "il Silenzioso", "il Magnanimo",
    "il Coraggioso", "il Saggio", "il Primo", "l'Indomabile", "il Paziente"
  ],
  feminine: [
    "la Grande", "la Vecchia", "la Silenziosa", "la Magnanima",
    "la Coraggiosa", "la Saggia", "la Prima", "l'Indomabile", "la Paziente"
  ]
};

const PERSONALITIES = [
  {
    id: "curioso", masculine: "Curioso", feminine: "Curiosa",
    mods: { speedMul: 1.05, sleepiness: 0.8, sociability: 1.1, curiosity: 1.8, bravery: 1.2, restlessness: 1.2 }
  },
  {
    id: "pigro", masculine: "Pigro", feminine: "Pigra",
    mods: { speedMul: 0.72, sleepiness: 2.0, sociability: 0.9, curiosity: 0.6, bravery: 0.9, restlessness: 0.5 }
  },
  {
    id: "coraggioso", masculine: "Coraggioso", feminine: "Coraggiosa",
    mods: { speedMul: 1.0, sleepiness: 0.9, sociability: 1.0, curiosity: 1.3, bravery: 2.2, restlessness: 0.9 }
  },
  {
    id: "sognatore", masculine: "Sognatore", feminine: "Sognatrice",
    mods: { speedMul: 0.85, sleepiness: 1.4, sociability: 0.7, curiosity: 1.1, bravery: 0.8, restlessness: 0.6 }
  },
  {
    id: "solitario", masculine: "Solitario", feminine: "Solitaria",
    mods: { speedMul: 1.05, sleepiness: 1.0, sociability: 0.35, curiosity: 0.8, bravery: 1.1, restlessness: 0.9 }
  },
  {
    id: "socievole", masculine: "Socievole", feminine: "Socievole",
    mods: { speedMul: 0.95, sleepiness: 0.85, sociability: 2.2, curiosity: 1.2, bravery: 0.9, restlessness: 1.0 }
  },
  {
    id: "inquieto", masculine: "Inquieto", feminine: "Inquieta",
    mods: { speedMul: 1.3, sleepiness: 0.5, sociability: 1.0, curiosity: 1.4, bravery: 1.0, restlessness: 2.2 }
  },
  {
    id: "paziente", masculine: "Paziente", feminine: "Paziente",
    mods: { speedMul: 0.8, sleepiness: 1.1, sociability: 1.0, curiosity: 0.9, bravery: 1.3, restlessness: 0.4 }
  }
];

export const BIOME_IT = {
  forest: { singular: "foresta", plural: "foreste", article: "la" },
  grassland: { singular: "prateria", plural: "praterie", article: "la" },
  wetland: { singular: "palude", plural: "paludi", article: "la" },
  mountain: { singular: "montagna", plural: "montagne", article: "la" },
  desert: { singular: "deserto", plural: "deserti", article: "il" }
};

export const DIET_IT = {
  grazer: { label: "erbivoro", noun: "un erbivoro" },
  omnivore: { label: "onnivoro", noun: "un onnivoro" },
  predator: { label: "predatore", noun: "un predatore" }
};

export const CAPABILITY_IT = {
  flight: { label: "volo", icon: "🪽", description: "Può librarsi sopra ogni ostacolo" },
  nocturnal: { label: "attività notturna", icon: "🌙", description: "Vive soprattutto di notte" },
  venom: { label: "veleno", icon: "☠️", description: "Il suo morso è temuto da tutti" },
  photosynthesis: { label: "fotosintesi", icon: "🌿", description: "Assorbe la luce delle stelle" },
  burrowing: { label: "scavo", icon: "🕳️", description: "Si nasconde sotto la sabbia" },
  cooperation: { label: "colonie cooperative", icon: "🤝", description: "Non lascia mai indietro i suoi" },
  dormancy: { label: "dormienza stagionale", icon: "😴", description: "Sa aspettare tempi migliori" }
};

const TRAIT_IT = {
  size: "la taglia",
  speed: "la velocità",
  fertility: "la fecondità",
  resilience: "la resilienza",
  metabolism: "il metabolismo",
  preferredBiome: "il bioma preferito"
};

const TRAIT_LABEL = {
  size: "Taglia",
  speed: "Velocità",
  fertility: "Fecondità",
  resilience: "Resilienza",
  metabolism: "Metabolismo"
};

const CATASTROPHE_IT = {
  wildfire: "un incendio",
  "flash flood": "un'alluvione",
  "toxic bloom": "una fioritura tossica",
  landslide: "una frana"
};

const ERA_IT = {
  "Age of Heat": "Età del Calore",
  "Long Summer": "Lunga Estate",
  "Ember Era": "Era delle Braci",
  "Long Winter": "Lungo Inverno",
  "Age of Frost": "Età del Gelo",
  "Pale Era": "Era Pallida",
  "Age of Rains": "Età delle Piogge",
  "Green Expansion": "Espansione Verde",
  "Flooded Era": "Era delle Inondazioni",
  "Great Drying": "Grande Siccità",
  "Dust Era": "Era della Polvere",
  "Age of Thirst": "Era della Sete",
  "Temperate Equilibrium": "Equilibrio Temperato",
  "Quiet Bloom": "Fioritura Quieta",
  "Balanced Era": "Era dell'Equilibrio"
};

const MILESTONE_IT = {
  "first-predator": "La predazione è diventata una forza permanente dell'ecosistema.",
  "first-innovation": "La prima grande innovazione evolutiva ha fatto la sua comparsa."
};

/* ------------------------------------------------------------------ */
/* Characters                                                          */
/* ------------------------------------------------------------------ */

/** Generates a named individual. gender: "m" | "f". */
export function characterName(rng, gender = null) {
  const chosenGender = gender ?? (rng() < 0.5 ? "m" : "f");
  const base = chosenGender === "m"
    ? pick(rng, MASCULINE_NAMES)
    : pick(rng, FEMININE_NAMES);
  const usesSurname = rng() < 0.55;
  const name = usesSurname ? `${base} ${pick(rng, SURNAMES)}` : base;
  return { name, gender: chosenGender, base };
}

export function personalityFor(rng) {
  return pick(rng, PERSONALITIES);
}

export function personalityLabel(personality, gender) {
  return gender === "f" ? personality.feminine : personality.masculine;
}

/** The champion of a species earns a title from its traits and its plight. */
export function championEpithet(rng, species) {
  const gender = rng() < 0.5 ? "m" : "f";
  if ((species.population ?? 0) <= 4) {
    return gender === "m" ? "l'Ultimo della Stirpe" : "l'Ultima della Stirpe";
  }
  if ((species.traits?.speed ?? 0) >= 8) {
    return gender === "m" ? "il Fulmine" : "la Fulminea";
  }
  if ((species.traits?.resilience ?? 0) >= 8) {
    return gender === "m" ? "il Monolite" : "la Roccia";
  }
  return pick(rng, EPITHETS[gender === "f" ? "feminine" : "masculine"]);
}

export function agentMood(state) {
  const moods = {
    idle: "pace interiore",
    wander: "curiosità dolce",
    graze: "gusto puro",
    drink: "gocce di gioia",
    sleep: "sonno profondo",
    stargaze: "stupore",
    play: "euforia",
    court: "tenerezza",
    follow: "fiducia",
    flee: "panico puro",
    stalk: "pazienza di caccia",
    charge: "fame cieca",
    victory: "orgoglio",
    sulk: "malumore",
    burrow: "silenzio sotterraneo",
    shelter: "attesa nervosa",
    gather: "meraviglia collettiva",
    migrate: "cuore in marcia",
    race: "sfrenatezza",
    proclaim: "grandezza"
  };
  return moods[state] ?? "umore indecifrabile";
}

export function ageLabel(ageSeconds) {
  if (ageSeconds < 90) return "giovane cucciolo";
  if (ageSeconds < 300) return "adolescente";
  if (ageSeconds < 900) return "adulto nel fiore degli anni";
  return "anziano e venerando";
}

/* ------------------------------------------------------------------ */
/* Palette (pure, shared by creatures and UI chips)                    */
/* ------------------------------------------------------------------ */

const BIOME_HUE = {
  forest: 0.32,
  grassland: 0.15,
  wetland: 0.48,
  mountain: 0.6,
  desert: 0.09
};

export function speciesPalette(species) {
  const diet = species.ecology?.diet ?? "grazer";
  const hueBase = BIOME_HUE[species.traits?.preferredBiome] ?? 0.4;
  const hue = (hueBase + 0.04 * ((species.name?.length ?? 3) % 5) - 0.08) % 1;
  const saturation = diet === "predator" ? 0.52 : diet === "omnivore" ? 0.42 : 0.36;
  const lightness = diet === "predator" ? 0.36 : diet === "omnivore" ? 0.46 : 0.52;
  return {
    hue,
    saturation,
    lightness,
    body: hsl(hue, saturation, lightness),
    belly: hsl(hue, saturation * 0.75, Math.min(0.82, lightness + 0.2)),
    accent: hsl((hue + 0.5) % 1, 0.55, 0.55),
    eye: diet === "predator" ? "#ff5a3c" : "#2b2233"
  };
}

export function hsl(h, s, l) {
  return `hsl(${Math.round(((h % 1) + 1) % 1 * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

/* ------------------------------------------------------------------ */
/* Translation of the committed event log                              */
/* ------------------------------------------------------------------ */

function speciesById(world, id) {
  const living = (world.species ?? []).find((s) => s.id === id);
  if (living) return living;
  const extinct = (world.extinctions ?? []).find((s) => s.species === id);
  if (extinct) return { id: extinct.species, name: extinct.name, traits: extinct.traits };
  return { id, name: id };
}

function biomeNoun(biome, plural = false) {
  const entry = BIOME_IT[biome];
  if (!entry) return biome;
  return plural ? entry.plural : `${entry.article} ${entry.singular}`;
}

export function translateEvent(event, world) {
  const impact = event.impact ?? {};
  switch (event.type) {
    case "population": {
      const species = speciesById(world, impact.species);
      const trend = impact.births > impact.deaths ? "— la stirpe cresce" : "— la stirpe si assottiglia";
      return {
        icon: "🐾",
        text: `${species.name}: ${impact.births} nascite, ${impact.deaths} morti ${trend}`,
        species: species.id,
        kind: "population"
      };
    }
    case "mutation": {
      const species = speciesById(world, impact.species);
      return {
        icon: "🧬",
        text: `Una mutazione ha cambiato ${TRAIT_IT[impact.trait] ?? impact.trait} dei ${species.name} (${impact.before} → ${impact.after})`,
        species: species.id,
        kind: "mutation"
      };
    }
    case "bloom":
      return {
        icon: "🌸",
        text: `Una fioritura improvvisa è esplosa in ${biomeNoun(impact.biome)} alla cella (${impact.x}, ${impact.y})`,
        cell: { x: impact.x, y: impact.y },
        kind: "bloom"
      };
    case "disease": {
      const species = speciesById(world, impact.species);
      return {
        icon: "☣️",
        text: `Un'epidemia ha falciato ${impact.losses} ${species.name}`,
        species: species.id,
        kind: "disease"
      };
    }
    case "extinction": {
      const species = speciesById(world, impact.species);
      return {
        icon: "🕯️",
        text: `${species.name} si è spenta per sempre. Il suo nome ora vive nel Memoriale`,
        species: species.id,
        kind: "extinction"
      };
    }
    case "innovation": {
      const species = speciesById(world, impact.species);
      const capability = CAPABILITY_IT[impact.capability];
      return {
        icon: "✨",
        text: `I ${species.name} hanno evoluto una meraviglia: ${capability ? capability.label : impact.capability}`,
        species: species.id,
        kind: "innovation"
      };
    }
    case "predation": {
      const predator = speciesById(world, impact.predator);
      const prey = speciesById(world, impact.prey);
      return {
        icon: "🏹",
        text: `Caccia: ${predator.name} ha abbattuto ${impact.kills} ${prey.name}`,
        species: predator.id,
        kind: "predation"
      };
    }
    case "migration": {
      const species = speciesById(world, impact.species);
      return {
        icon: "🧭",
        text: `${species.name} hanno fondato una nuova colonia alla cella (${impact.to?.x}, ${impact.to?.y})`,
        species: species.id,
        kind: "migration"
      };
    }
    case "speciation": {
      const species = speciesById(world, impact.species);
      const parent = speciesById(world, impact.parent);
      return {
        icon: "🌱",
        text: `${species.name} si è distaccata dai ${parent.name}: una specie interamente nuova è nata`,
        species: species.id,
        kind: "speciation"
      };
    }
    case "immigration": {
      const species = speciesById(world, impact.species);
      return {
        icon: "🍃",
        text: `${species.name} sono approdati in ${biomeNoun(species.traits?.preferredBiome)}`,
        species: species.id,
        kind: "immigration"
      };
    }
    case "catastrophe":
      return {
        icon: "⚡",
        text: `${(CATASTROPHE_IT[impact.event] ?? impact.event).charAt(0).toUpperCase() + (CATASTROPHE_IT[impact.event] ?? impact.event).slice(1)} ha travolto ${impact.cells} celle attorno a (${impact.x}, ${impact.y})`,
        cell: { x: impact.x, y: impact.y },
        kind: "catastrophe"
      };
    case "disturbance":
      return {
        icon: "🍂",
        text: `Una stagione dura ha impoverito il cibo in ${biomeNoun(impact.biome, true)}`,
        kind: "disturbance"
      };
    case "climate":
      return { icon: "🌀", text: "Il clima è scivolato in una transizione instabile", kind: "climate" };
    case "era":
      return {
        icon: "🏛️",
        text: `Inizia una nuova era: ${translateEraName(extractEraName(event.message))}`,
        eraName: extractEraName(event.message),
        kind: "era"
      };
    case "milestone":
      return { icon: "🏆", text: MILESTONE_IT[impact.milestone] ?? event.message, kind: "milestone" };
    case "seed":
      return { icon: "🌍", text: "Il mondo è stato seminato per la prima volta", kind: "seed" };
    default:
      return { icon: "📜", text: event.message ?? event.type, kind: event.type };
  }
}

function extractEraName(message) {
  const match = /(.+) began\./.exec(message ?? "");
  return match ? match[1] : message;
}

export function translateEraName(name) {
  return ERA_IT[name] ?? name ?? "un'era senza nome";
}

/* ------------------------------------------------------------------ */
/* Micro-stories — the invented everyday life of individuals           */
/* ------------------------------------------------------------------ */

export function microStory(kind, params = {}) {
  const { name, other, species, baby, oldName, biome = "un luogo segreto" } = params;
  const place = BIOME_IT[biome] ? `${BIOME_IT[biome].article} ${BIOME_IT[biome].singular}` : biome;
  const stories = {
    meal: [
      `${name} ha trovato un boccone prelibato in ${place}.`,
      `${name} ha pascolato con calma in ${place}, senza fretta alcuna.`
    ],
    escape: [
      `${name} è sfuggita a un predatore per un soffio: il cuore batte ancora forte.`,
      `${name} ha finto una corsa a zig-zag e il cacciatore ha perso le staffe.`
    ],
    huntWin: [
      `${name} ha centrato la caccia: ${place} trema.`,
      `${name} torna sazia: la stirpe dei cacciatori sorride.`
    ],
    huntLose: [
      `${name} è tornata a stomaco vuoto: la preda è svanita come un miraggio.`,
      `${name} ha inseguito l'ombra di una preda per tutto il crepuscolo. Invano.`
    ],
    birth: [
      `È nato un cucciolo di ${species}: si chiama ${baby}. Il mondo è un po' più affollato di gioia.`
    ],
    play: [
      `${name} e ${other} hanno giocato fino allo sfinimento.`,
      `${name} e ${other} si sono rincorsi senza motivo, come fanno i cuccioli.`
    ],
    sleep: [
      `${name} russa piano sotto le stelle.`,
      `${name} si è acciambellata e sogna praterie infinite.`
    ],
    drink: [
      `${name} ha placato la sete allo stagno, tra libellule curiose.`
    ],
    champion: [
      `${name} ha lanciato un richiamo che ha attraversato l'intera isola.`,
      `${name} si è eretta sul punto più alto: tutti l'hanno vista.`
    ],
    curious: [
      `${name} ha fissato a lungo l'orizzonte, chiedendosi cosa ci sia oltre il cielo.`,
      `${name} ha annusato una pietra sconosciuta per un'eternità.`
    ],
    stargaze: [
      `${name} ha contato le stelle cadenti e ha perso il conto.`
    ],
    grownup: [
      `${name} è cresciuta: oggi nessuno la prende più in giro.`,
      `${name} ha raggiunto la taglia adulta. Il mondo fa un passo indietro, con rispetto.`
    ],
    friendship: [
      `${name} e ${other}: due specie diverse, una sola amicizia.`,
      `Tra ${name} e ${other} è nata un'amicizia che nessun manuale di ecologia spiega.`
    ],
    replacement: [
      `${name} arriva da lontano a prendere il posto di ${oldName}. Il cerchio della vita continua.`,
      `Dopo ${oldName}, ecco ${name}: il mondo non lascia mai un vuoto a lungo.`
    ],
    race: [
      `${name} ha vinto la corsa dei cuccioli vantando una falcata impeccabile.`,
      `La corsa è finita: ${name} ha tagliato il traguardo per un soffio.`
    ],
    traversata: [
      `La carovana è arrivata: nuove terre, nuove promesse.`,
      `Il popolo in marcia ha raggiunto l'orizzonte che inseguiva.`
    ]
  };
  const pool = stories[kind] ?? stories.curious;
  return pool[Math.floor((params.roll ?? Math.random()) * pool.length) % pool.length];
}

/* ------------------------------------------------------------------ */
/* Spectacles — invented scheduled situations                          */
/* ------------------------------------------------------------------ */

export const SPECTACLES = {
  traversata: {
    title: "La Grande Traversata",
    subtitle: "Un popolo intero si mette in marcia verso nuove terre",
    icon: "🧭"
  },
  meteors: {
    title: "La Notte delle Stelle Cadenti",
    subtitle: "Il cielo regala desideri a chi alza lo sguardo",
    icon: "☄️"
  },
  abbeverata: {
    title: "La Tregua dello Stagno",
    subtitle: "Predatori e prede, fianco a fianco, in una tregua di sete",
    icon: "💧"
  },
  concilio: {
    title: "Il Concilio dei Campioni",
    subtitle: "I grandi di ogni stirpe si riuniscono in cima al mondo",
    icon: "👑"
  },
  danza: {
    title: "La Danza dei Lumi",
    subtitle: "Le creature luminose danzano nel buio",
    icon: "🌟"
  },
  fioritura: {
    title: "Il Festival della Fioritura",
    subtitle: "L'isola esplode di petali e farfalle",
    icon: "🌸"
  },
  eclissi: {
    title: "L'Eclissi",
    subtitle: "Per un istante, il mondo trattiene il respiro",
    icon: "🌑"
  },
  corsa: {
    title: "La Corsa dei Cuccioli",
    subtitle: "Il futuro del mondo corre a perdifiato",
    icon: "🏁"
  },
  aurora: {
    title: "L'Aurora dei Venti",
    subtitle: "Il cielo si accende di veli di luce colorata",
    icon: "🌌"
  }
};

/* ------------------------------------------------------------------ */
/* Misc helpers                                                        */
/* ------------------------------------------------------------------ */

export function traitBars(species) {
  const traits = species.traits ?? {};
  return ["size", "speed", "fertility", "resilience", "metabolism"].map((key) => ({
    key,
    label: TRAIT_LABEL[key] ?? key,
    value: Math.max(0, Math.min(10, traits[key] ?? 0))
  }));
}

export function lineageText(species, world) {
  const lineage = species.lineage;
  if (!lineage || !lineage.parent) {
    return "Stirpe primigenia: era presente quando il mondo è stato seminato.";
  }
  const parent = speciesById(world, lineage.parent);
  const gen = lineage.generation ?? 1;
  return `Discende dai ${parent.name} · generazione ${gen} · nata al tick ${lineage.bornAt ?? "?"}`;
}

export function fossilStory(extinct, world) {
  const span = extinct.tick - (extinct.origin?.tick ?? 0);
  const biome = extinct.traits?.preferredBiome;
  const biomeText = biome ? `Amava ${biomeNoun(biome)}` : "Vagava senza dimora";
  return `${biomeText}. Visse circa ${span} tick e poi il silenzio. Il mondo l'ha dimenticata solo un poco.`;
}

export function describeWorldClock(tDay) {
  const hour = Math.floor(((tDay + 0.25) % 1) * 24);
  if (hour < 5) return { label: "Notte fonda", icon: "🌙" };
  if (hour < 7) return { label: "Alba", icon: "🌅" };
  if (hour < 12) return { label: "Mattino", icon: "🌤️" };
  if (hour < 15) return { label: "Meriggio", icon: "☀️" };
  if (hour < 18) return { label: "Pomeriggio", icon: "🌤️" };
  if (hour < 20) return { label: "Tramonto", icon: "🌇" };
  return { label: "Notte", icon: "🌙" };
}

export function countRepresentatives(population) {
  if (!population || population <= 0) return 0;
  return Math.max(1, Math.min(9, Math.round(Math.sqrt(population) * 1.15)));
}

export function moodRoll(rng) {
  return rng();
}

/* ------------------------------------------------------------------ */
/* What an individual is doing, in Italian                             */
/* ------------------------------------------------------------------ */

const STATE_LABEL = {
  idle: "riposa",
  wander: "vaga",
  graze: "pascue",
  drink: "si disseta",
  sleep: "dorme",
  stargaze: "contempla le stelle",
  play: "gioca",
  court: "corteggia",
  follow: "segue la madre",
  flee: "scappa!",
  stalk: "stanca la preda",
  charge: "carica!",
  victory: "esulta",
  sulk: "rimugina",
  burrow: "si è sepolta",
  shelter: "si ripara",
  gather: "assiste",
  migrate: "è in marcia",
  race: "corre",
  proclaim: "proclama",
  dead: "è svanita"
};

export function stateLabel(state) {
  return STATE_LABEL[state] ?? state;
}
