const BIOME_COLORS = {
  forest: "#2f7d4f",
  grassland: "#b5b63c",
  wetland: "#3f8f9a",
  mountain: "#8a8075",
  desert: "#d5a64d"
};

const EVENT_LABELS = {
  seed: "Seed",
  population: "Population",
  mutation: "Mutation",
  disturbance: "Disturbance",
  bloom: "Food bloom",
  disease: "Disease",
  extinction: "Extinction",
  immigration: "Immigration",
  speciation: "Speciation"
};

async function loadWorld() {
  const dataUrl = `data/world.json?v=${Date.now()}`;
  const response = await fetch(dataUrl, {
    cache: "no-store",
    headers: { "cache-control": "no-cache" }
  });

  if (!response.ok) {
    throw new Error(`Could not load world data: ${response.status}`);
  }

  const world = await response.json();
  world.loadedFrom = dataUrl;
  return world;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(value);
}

function formatTraitName(key) {
  return key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`);
}

function getLatestTickDate(world) {
  return new Date(world.latestTickAt ?? world.updatedAt);
}

function getNextTickDate(world) {
  const intervalHours = world.tickIntervalHours ?? 6;
  return new Date(getLatestTickDate(world).getTime() + intervalHours * 60 * 60 * 1000);
}

function getWorldStats(world) {
  const livingSpecies = world.species.filter((species) => species.population > 0);
  const extinctInSpeciesList = world.species.filter((species) => species.population === 0).length;
  const extinctSpecies = Math.max(extinctInSpeciesList, world.extinctions.length);
  const totalPopulation = world.species.reduce((sum, species) => sum + species.population, 0);
  const proportions = livingSpecies
    .map((species) => species.population / Math.max(1, totalPopulation))
    .filter((share) => share > 0);
  const biodiversity = proportions.reduce((sum, share) => sum - share * Math.log(share), 0);
  const averageFood =
    world.map.cells.reduce((sum, cell) => sum + cell.food, 0) / Math.max(1, world.map.cells.length);

  return {
    livingSpecies: livingSpecies.length,
    extinctSpecies,
    totalPopulation,
    biodiversity,
    averageFood
  };
}

function getWorldMemory(world) {
  const retainedEvents = [...world.events].sort((a, b) => a.tick - b.tick);
  const oldestEvent = retainedEvents[0];
  const newestEvent = retainedEvents[retainedEvents.length - 1];
  const noveltyEvents = world.events.filter((event) => event.type === "immigration" || event.type === "speciation");
  const intervalHours = world.tickIntervalHours ?? 6;
  const ageHours = world.tick * intervalHours;
  const ageDays = ageHours / 24;

  return {
    oldestEvent,
    newestEvent,
    noveltyEvents: noveltyEvents.length,
    ageText: ageDays >= 1 ? `${ageDays.toFixed(1)} days` : `${ageHours} hours`
  };
}

function renderMeta(world) {
  document.querySelector("#tick").textContent = world.tick;
  document.querySelector("#updated-at").textContent = formatDate(world.updatedAt);
  document.querySelector("#data-source").textContent = `cadence: every ${world.tickIntervalHours ?? 6} hours`;
}

function renderWorldMemory(world) {
  const memory = getWorldMemory(world);
  const container = document.querySelector("#world-memory");
  const items = [
    ["Oldest retained event", memory.oldestEvent ? `Tick ${memory.oldestEvent.tick}: ${EVENT_LABELS[memory.oldestEvent.type] ?? memory.oldestEvent.type}` : "none"],
    ["Newest event", memory.newestEvent ? `Tick ${memory.newestEvent.tick}: ${EVENT_LABELS[memory.newestEvent.type] ?? memory.newestEvent.type}` : "none"],
    ["Known extinctions", world.extinctions.length],
    ["Known novelty events", memory.noveltyEvents],
    ["Current tick", world.tick],
    ["Approx age", memory.ageText]
  ];

  container.innerHTML = items
    .map(
      ([label, value]) => `
        <div class="memory-item">
          <span>${label}</span>
          <strong>${value}</strong>
        </div>
      `
    )
    .join("");
}

function renderStatus(world) {
  const stats = getWorldStats(world);
  const status = document.querySelector("#world-status");
  const items = [
    ["Tick", world.tick],
    ["Latest tick", formatDate(getLatestTickDate(world))],
    ["Approx next tick", formatDate(getNextTickDate(world))],
    ["Cadence", `Every ${world.tickIntervalHours ?? 6}h`],
    ["Living species", stats.livingSpecies],
    ["Extinct species", stats.extinctSpecies],
    ["Total population", formatNumber(stats.totalPopulation)],
    ["Biodiversity index", stats.biodiversity.toFixed(3)],
    ["Average food", stats.averageFood.toFixed(1)],
    ["Recent events", world.events.length]
  ];

  status.innerHTML = items
    .map(
      ([label, value]) => `
        <div class="status-item">
          <span>${label}</span>
          <strong>${value}</strong>
        </div>
      `
    )
    .join("");
}

function renderLegend(world) {
  const legend = document.querySelector("#legend");
  const biomes = [...new Set(world.map.cells.map((cell) => cell.biome))].sort();

  legend.innerHTML = biomes
    .map(
      (biome) => `
        <span class="legend-item">
          <span class="swatch" style="background:${BIOME_COLORS[biome]}"></span>
          ${biome}
        </span>
      `
    )
    .join("");
}

function speciesForBiome(world, biome) {
  return world.species
    .filter((species) => species.population > 0 && species.traits.preferredBiome === biome)
    .map((species) => species.name);
}

function renderCellDetails(world, cell) {
  const details = document.querySelector("#cell-details");
  const speciesNames = speciesForBiome(world, cell.biome);

  details.innerHTML = `
    <div>
      <span class="detail-kicker">Selected cell</span>
      <strong>(${cell.x}, ${cell.y}) ${cell.biome}</strong>
    </div>
    <dl>
      <div><dt>Food</dt><dd>${cell.food}/10</dd></div>
      <div><dt>Likely species</dt><dd>${speciesNames.length ? speciesNames.join(", ") : "none currently adapted"}</dd></div>
    </dl>
  `;
}

function renderMap(world) {
  const map = document.querySelector("#map");
  map.style.gridTemplateColumns = `repeat(${world.map.width}, minmax(0, 1fr))`;

  map.innerHTML = world.map.cells
    .map((cell) => {
      const foodPercent = `${Math.max(8, cell.food * 10)}%`;
      const adaptedSpecies = speciesForBiome(world, cell.biome).join(", ") || "none";

      return `
        <button
          type="button"
          class="cell"
          data-x="${cell.x}"
          data-y="${cell.y}"
          aria-label="Cell ${cell.x}, ${cell.y}. ${cell.biome}. Food ${cell.food}. Adapted species: ${adaptedSpecies}."
          title="(${cell.x}, ${cell.y}) ${cell.biome}. Food ${cell.food}/10. Adapted species: ${adaptedSpecies}."
          style="background:${BIOME_COLORS[cell.biome]}; --food-level:${foodPercent};"
        >
          ${cell.food}
        </button>
      `;
    })
    .join("");

  map.addEventListener("click", (event) => {
    const cellButton = event.target.closest(".cell");
    if (!cellButton) return;
    const x = Number(cellButton.dataset.x);
    const y = Number(cellButton.dataset.y);
    const cell = world.map.cells.find((candidate) => candidate.x === x && candidate.y === y);
    if (cell) renderCellDetails(world, cell);
  });

  const richestCell = [...world.map.cells].sort((a, b) => b.food - a.food)[0];
  if (richestCell) renderCellDetails(world, richestCell);
}

function renderSpecies(world) {
  const list = document.querySelector("#species-list");

  list.innerHTML = world.species
    .map((species) => {
      const traits = Object.entries(species.traits)
        .map(([key, value]) => `<span class="trait"><span>${formatTraitName(key)}</span><strong>${value}</strong></span>`)
        .join("");
      const state = species.population > 0 ? "living" : "extinct";

      return `
        <article class="species-card ${state}">
          <div class="species-topline">
            <span class="species-name">${species.name}</span>
            <span class="population">${species.population} alive · ${state}</span>
          </div>
          <div class="traits">${traits}</div>
        </article>
      `;
    })
    .join("");
}

function renderEvents(world) {
  const events = document.querySelector("#events");
  events.innerHTML = world.events
    .slice(0, 20)
    .map(
      (event) => `
        <li class="event event-${event.type}">
          <span class="event-type">${EVENT_LABELS[event.type] ?? event.type}</span>
          <span class="event-tick">Tick ${event.tick}</span>
          ${event.message}
        </li>
      `
    )
    .join("");
}

function pointsForHistory(history, speciesId, width, height, padding, maxPopulation) {
  const populations = history.map((entry) => entry.populations[speciesId] ?? 0);
  const xStep = history.length > 1 ? (width - padding * 2) / (history.length - 1) : 0;

  return populations
    .map((population, index) => {
      const x = padding + index * xStep;
      const y = height - padding - (population / maxPopulation) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");
}

function renderTrends(world) {
  const svg = document.querySelector("#trend-chart");
  const width = 720;
  const height = 260;
  const padding = 28;
  const activeSpecies = world.species.filter((species) =>
    world.history.some((entry) => entry.populations[species.id] !== undefined)
  );
  const maxPopulation = Math.max(
    1,
    ...world.history.flatMap((entry) => Object.values(entry.populations))
  );

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = `
    <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#cfd6cc" />
    <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="#cfd6cc" />
    <text x="${padding}" y="${padding - 8}" fill="#5c675f" font-size="12" font-weight="700">${maxPopulation} individuals</text>
    <text x="${padding}" y="${height - 8}" fill="#5c675f" font-size="12" font-weight="700">0</text>
    ${activeSpecies
      .map((species, index) => {
        const hue = (index * 82 + 24) % 360;
        const color = `hsl(${hue} 58% 42%)`;
        const points = pointsForHistory(world.history, species.id, width, height, padding, maxPopulation);
        return `
          <polyline points="${points}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
          <text x="${width - padding}" y="${padding + index * 20}" fill="${color}" text-anchor="end" font-size="14" font-weight="700">${species.name}</text>
        `;
      })
      .join("")}
  `;
  document.querySelector("#trend-note").textContent =
    `Absolute population counts over the latest ${world.history.length} recorded ticks; all species share one y-axis.`;
}

function renderFossilRecord(world) {
  const fossilRecord = document.querySelector("#fossil-record");
  if (world.extinctions.length === 0) {
    fossilRecord.innerHTML = `
      <p class="empty-state">No species has gone extinct yet. The fossil record is waiting.</p>
    `;
    return;
  }

  fossilRecord.innerHTML = world.extinctions
    .map(
      (entry) => `
        <article class="fossil">
          <span class="event-type">Tick ${entry.tick}</span>
          <strong>${entry.name}</strong>
          <p>${entry.message}</p>
        </article>
      `
    )
    .join("");
}

async function init() {
  try {
    const world = await loadWorld();
    renderMeta(world);
    renderStatus(world);
    renderWorldMemory(world);
    renderLegend(world);
    renderMap(world);
    renderSpecies(world);
    renderEvents(world);
    renderTrends(world);
    renderFossilRecord(world);
  } catch (error) {
    document.body.innerHTML = `<main class="layout"><p>${error.message}</p></main>`;
  }
}

init();
