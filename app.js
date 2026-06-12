const BIOME_COLORS = {
  forest: "#2f7d4f",
  grassland: "#b5b63c",
  wetland: "#3f8f9a",
  mountain: "#8a8075",
  desert: "#d5a64d"
};

async function loadWorld() {
  const response = await fetch("data/world.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load world data: ${response.status}`);
  }
  return response.json();
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function renderMeta(world) {
  document.querySelector("#tick").textContent = world.tick;
  document.querySelector("#updated-at").textContent = formatDate(world.updatedAt);
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

function renderMap(world) {
  const map = document.querySelector("#map");
  map.style.gridTemplateColumns = `repeat(${world.map.width}, minmax(0, 1fr))`;

  map.innerHTML = world.map.cells
    .map((cell) => {
      const foodPercent = `${Math.max(8, cell.food * 10)}%`;
      return `
        <div
          class="cell"
          title="(${cell.x}, ${cell.y}) ${cell.biome}, food ${cell.food}"
          style="background:${BIOME_COLORS[cell.biome]}; --food-level:${foodPercent};"
        >
          ${cell.food}
        </div>
      `;
    })
    .join("");
}

function renderSpecies(world) {
  const list = document.querySelector("#species-list");

  list.innerHTML = world.species
    .map((species) => {
      const traits = Object.entries(species.traits)
        .map(([key, value]) => `<span class="trait"><span>${key}</span><strong>${value}</strong></span>`)
        .join("");

      return `
        <article class="species-card">
          <div class="species-topline">
            <span class="species-name">${species.name}</span>
            <span class="population">${species.population} alive</span>
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
    .slice(0, 12)
    .map(
      (event) => `
        <li class="event">
          <span class="event-type">Tick ${event.tick} · ${event.type}</span>
          ${event.message}
        </li>
      `
    )
    .join("");
}

function pointsForHistory(history, speciesId, width, height, padding) {
  const populations = history.map((entry) => entry.populations[speciesId] ?? 0);
  const maxPopulation = Math.max(1, ...populations);
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

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = `
    <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#cfd6cc" />
    <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="#cfd6cc" />
    ${activeSpecies
      .map((species, index) => {
        const hue = (index * 82 + 24) % 360;
        const color = `hsl(${hue} 58% 42%)`;
        const points = pointsForHistory(world.history, species.id, width, height, padding);
        return `
          <polyline points="${points}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
          <text x="${width - padding}" y="${padding + index * 20}" fill="${color}" text-anchor="end" font-size="14" font-weight="700">${species.name}</text>
        `;
      })
      .join("")}
  `;
}

async function init() {
  try {
    const world = await loadWorld();
    renderMeta(world);
    renderLegend(world);
    renderMap(world);
    renderSpecies(world);
    renderEvents(world);
    renderTrends(world);
  } catch (error) {
    document.body.innerHTML = `<main class="layout"><p>${error.message}</p></main>`;
  }
}

init();
