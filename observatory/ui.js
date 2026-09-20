/**
 * UI — the overlay of the observatory: HUD, species panel, fossil archive,
 * living chronicle, spectacles banners, camera controls and detail cards.
 * All in Italian: this page is the storytelling lens over the world.
 */

import {
  speciesPalette,
  DIET_IT,
  CAPABILITY_IT,
  traitBars,
  lineageText,
  fossilStory,
  personalityLabel,
  ageLabel,
  stateLabel,
  translateEraName,
  BIOME_IT
} from "./narrative.js";

export class UI {
  constructor(ctx, actions) {
    this.ctx = ctx;
    this.actions = actions;
    this.el = {};
    const ids = [
      "obs-loading", "loading-status", "obs-error", "error-message", "error-retry",
      "hud", "hud-tick", "hud-era", "hud-phase", "hud-phase-icon", "hud-weather",
      "bar-temp", "bar-moist", "hud-pop", "hud-species",
      "species-panel", "species-list", "fossil-list", "panel-toggle",
      "chronicle", "chronicle-list",
      "controls", "btn-pause", "btn-free", "btn-cinema", "btn-doc", "btn-sound", "btn-speed",
      "banner", "banner-icon", "banner-title", "banner-subtitle",
      "letterbox-top", "letterbox-bottom", "toast", "flash", "cut",
      "card", "card-content", "card-close", "hint"
    ];
    for (const id of ids) this.el[id] = document.getElementById(id);

    this._wire();
    this._hideLetterbox();
  }

  _wire() {
    const { el, actions } = this;
    el["error-retry"]?.addEventListener("click", () => window.location.reload());
    el["card-close"]?.addEventListener("click", () => this.hideCard());
    el["panel-toggle"]?.addEventListener("click", () => {
      el["species-panel"].classList.toggle("collapsed");
    });
    el["btn-pause"]?.addEventListener("click", () => actions.togglePause());
    el["btn-free"]?.addEventListener("click", () => actions.setMode("free"));
    el["btn-cinema"]?.addEventListener("click", () => actions.setMode("cinema"));
    el["btn-doc"]?.addEventListener("click", () => actions.setMode("doc"));
    el["btn-sound"]?.addEventListener("click", async () => actions.toggleSound());
    el["btn-speed"]?.addEventListener("click", () => actions.cycleSpeed());

    document.addEventListener("keydown", (event) => {
      // Ignore keys that belong to a focused control, or Space would both
      // toggle the pause and activate the focused button.
      const target = event.target;
      if (target && typeof target.closest === "function"
        && target.closest("button, a, input, textarea, select")) return;
      if (event.key === "Escape") this.hideCard();
      if (event.key === " ") {
        event.preventDefault();
        actions.togglePause();
      }
    });
  }

  /* ------------------------------ loading --------------------------- */

  setLoading(text) {
    if (this.el["loading-status"]) this.el["loading-status"].textContent = text;
  }

  hideLoading() {
    this.el["obs-loading"]?.classList.add("hidden");
  }

  showError(message) {
    this.el["obs-loading"]?.classList.add("hidden");
    if (this.el["error-message"]) this.el["error-message"].textContent = message;
    this.el["obs-error"]?.classList.remove("hidden");
  }

  /* ------------------------------- HUD ------------------------------ */

  setWorldSummary(world) {
    const living = world.species.filter((s) => s.population > 0);
    const population = living.reduce((sum, s) => sum + s.population, 0);
    this.el["hud-tick"].textContent = `Tick ${world.tick}`;
    this.el["hud-era"].textContent = translateEraName(world.environment?.era?.name ?? "");
    this.el["hud-pop"].textContent = `${population.toLocaleString("it-IT")} creature`;
    this.el["hud-species"].textContent = `${living.length} specie vive · ${world.extinctions?.length ?? 0} estinte`;
    this.setClimate(world.environment);
  }

  setClimate(environment) {
    if (!environment) return;
    const temperature = Math.round((environment.temperature ?? 0.5) * 100);
    const moisture = Math.round((environment.moisture ?? 0.5) * 100);
    this.el["bar-temp"].style.width = `${temperature}%`;
    this.el["bar-moist"].style.width = `${moisture}%`;
    this.el["bar-temp"].title = `Temperatura ${temperature}%`;
    this.el["bar-moist"].title = `Umidità ${moisture}%`;
  }

  setClock(phase, weather) {
    if (!phase) return;
    this.el["hud-phase-icon"].textContent = phase.icon;
    this.el["hud-phase"].textContent = phase.label;
    const weatherLabels = {
      clear: "Sereno", cloudy: "Nuvoloso", rain: "Pioggia", storm: "Tempesta", snow: "Neve", dust: "Polvere"
    };
    this.el["hud-weather"].textContent = weatherLabels[weather] ?? "Sereno";
  }

  /* ---------------------------- species ----------------------------- */

  buildPanels() {
    const world = this.ctx.world;
    const speciesList = this.el["species-list"];
    speciesList.innerHTML = "";
    for (const species of world.species.filter((s) => s.population > 0)) {
      speciesList.appendChild(this._speciesRow(species));
    }

    const fossilList = this.el["fossil-list"];
    fossilList.innerHTML = "";
    const extinctions = [...(world.extinctions ?? [])].sort((a, b) => b.tick - a.tick);
    if (!extinctions.length) {
      fossilList.innerHTML = "<p class='fossil-empty'>Nessuna specie si è ancora spenta.</p>";
    }
    for (const extinct of extinctions) {
      const row = document.createElement("button");
      row.className = "fossil-row";
      row.innerHTML = `
        <span class="fossil-icon">🕯️</span>
        <span class="fossil-name">${escapeHtml(extinct.name)}</span>
        <span class="fossil-tick">tick ${extinct.tick}</span>`;
      row.addEventListener("click", () => {
        this.actions.focusFossil(extinct);
      });
      fossilList.appendChild(row);
    }
  }

  _speciesRow(species) {
    const world = this.ctx.world;
    const palette = speciesPalette(species);
    const history = world.history ?? [];
    const recent = history.slice(-6).map((h) => h.populations?.[species.id] ?? null).filter((v) => v !== null);
    let trend = "";
    if (recent.length >= 2) {
      const delta = species.population - recent[0];
      trend = delta > 0 ? `<span class="trend up">▲</span>` : delta < 0 ? `<span class="trend down">▼</span>` : `<span class="trend flat">◆</span>`;
    }
    const diet = DIET_IT[species.ecology?.diet ?? "grazer"]?.label ?? "";
    const caps = (species.capabilities ?? []).map((cap) => CAPABILITY_IT[cap]?.icon ?? "★").join(" ");

    const row = document.createElement("div");
    row.className = "species-row";
    row.innerHTML = `
      <div class="species-main">
        <span class="chip" style="background:${palette.body}"></span>
        <button class="species-name">${escapeHtml(species.name)}</button>
        <span class="species-pop">${species.population} ${trend}</span>
      </div>
      <div class="species-meta">
        <span>${diet}</span>
        <span class="caps">${caps}</span>
        <span class="onstage" data-species="${species.id}"></span>
      </div>`;
    row.querySelector(".species-name").addEventListener("click", () => this.actions.focusSpecies(species));
    return row;
  }

  refreshAgentCounts() {
    const counters = this.el["species-list"].querySelectorAll(".onstage");
    for (const counter of counters) {
      const id = counter.dataset.species;
      const agents = this.ctx.agents.agentsOf(id).filter((a) => a.state !== "dead").length;
      counter.textContent = agents ? `· ${agents} in scena` : "";
    }
  }

  /* ---------------------------- chronicle --------------------------- */

  addChronicle(entry) {
    const list = this.el["chronicle-list"];
    const item = document.createElement("li");
    item.className = "chronicle-entry";
    item.innerHTML = `
      <span class="chronicle-icon">${entry.icon ?? "📜"}</span>
      <span class="chronicle-text">${escapeHtml(entry.text)}</span>`;
    if (entry.agent || entry.species || entry.cell) {
      item.classList.add("clickable");
      item.addEventListener("click", () => {
        if (entry.agent) this.actions.focusAgent(entry.agent);
        else if (entry.species) {
          const species = this.ctx.world.species.find((s) => s.id === entry.species);
          if (species) this.actions.focusSpecies(species);
        } else if (entry.cell) {
          this.actions.focusCell(entry.cell);
        }
      });
    }
    list.prepend(item);
    while (list.children.length > 8) list.removeChild(list.lastChild);
    this.el["chronicle"].classList.remove("pulse");
    void this.el["chronicle"].offsetWidth;
    this.el["chronicle"].classList.add("pulse");
  }

  /* ---------------------------- spectacles -------------------------- */

  showBanner({ icon, title, subtitle }) {
    const banner = this.el["banner"];
    this.el["banner-icon"].textContent = icon ?? "✨";
    this.el["banner-title"].textContent = title ?? "";
    this.el["banner-subtitle"].textContent = subtitle ?? "";
    banner.classList.remove("show");
    void banner.offsetWidth;
    banner.classList.add("show");
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => banner.classList.remove("show"), 5200);
  }

  toast(text) {
    const toast = this.el["toast"];
    toast.textContent = text;
    toast.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  flash() {
    const flash = this.el["flash"];
    flash.classList.remove("go");
    void flash.offsetWidth;
    flash.classList.add("go");
  }

  cutFade() {
    const cut = this.el["cut"];
    cut.classList.remove("go");
    void cut.offsetWidth;
    cut.classList.add("go");
  }

  /* ------------------------------ modes ----------------------------- */

  setMode(mode) {
    const map = { free: "btn-free", cinema: "btn-cinema", doc: "btn-doc" };
    for (const [name, id] of Object.entries(map)) {
      this.el[id]?.classList.toggle("active", mode === name);
    }
    this.setLetterbox(mode !== "free");
  }

  setLetterbox(on) {
    this.el["letterbox-top"]?.classList.toggle("show", !!on);
    this.el["letterbox-bottom"]?.classList.toggle("show", !!on);
  }

  _hideLetterbox() {
    this.el["letterbox-top"]?.classList.remove("show");
    this.el["letterbox-bottom"]?.classList.remove("show");
  }

  setPaused(paused) {
    this.el["btn-pause"].textContent = paused ? "▶ Riprendi" : "⏸ Pausa";
    this.el["btn-pause"].classList.toggle("active", paused);
  }

  setSpeed(speed) {
    this.el["btn-speed"].textContent = `⏩ ${speed}×`;
  }

  setSound(on) {
    this.el["btn-sound"].textContent = on ? "🔊 Suono" : "🔈 Suono";
    this.el["btn-sound"].classList.toggle("active", on);
  }

  /* ------------------------------- cards ---------------------------- */

  showAgentCard(agent) {
    const world = this.ctx.world;
    const traits = traitBars(agent.species).map((trait) => `
      <div class="trait">
        <span class="trait-label">${trait.label}</span>
        <span class="trait-bar"><span class="trait-fill" style="width:${trait.value * 10}%"></span></span>
        <span class="trait-value">${trait.value}</span>
      </div>`).join("");
    const capabilities = (agent.capabilities ?? []).map((cap) => {
      const info = CAPABILITY_IT[cap];
      return info ? `<span class="cap-chip" title="${info.description}">${info.icon} ${info.label}</span>` : "";
    }).join(" ");
    const age = ageLabel(agent.ageSec);
    this.el["card-content"].innerHTML = `
      <div class="card-head">
        <span class="card-icon" style="background:${agent.parts.palette.body}"></span>
        <div>
          <h3 class="card-name">${escapeHtml(agent.name)}${agent.champion ? " 👑" : ""}</h3>
          <p class="card-sub">${escapeHtml(agent.speciesName)} · ${DIET_IT[agent.diet]?.label ?? ""}</p>
          ${agent.champion ? `<p class="card-epithet">${escapeHtml(agent.epithet ?? "")}</p>` : ""}
        </div>
      </div>
      <dl class="card-grid">
        <div><dt>Carattere</dt><dd>${escapeHtml(personalityLabel(agent.personality, agent.gender))}</dd></div>
        <div><dt>Età</dt><dd>${age}</dd></div>
        <div><dt>Attività</dt><dd>${escapeHtml(stateLabel(agent.state))}</dd></div>
        <div><dt>Umore</dt><dd>${escapeHtml(agent.mood())}</dd></div>
        <div><dt>Pasti</dt><dd>${agent.stats.meals}</dd></div>
        <div><dt>Cacce</dt><dd>${agent.stats.huntsWon}/${agent.stats.hunts}</dd></div>
        <div><dt>Fughe</dt><dd>${agent.stats.escapes}</dd></div>
        <div><dt>Amicizie</dt><dd>${agent.stats.friends}</dd></div>
      </dl>
      <div class="traits">${traits}</div>
      ${capabilities ? `<div class="caps">${capabilities}</div>` : ""}
      <p class="card-lineage">${escapeHtml(lineageText(agent.species, world))}</p>`;
    this._cardFollow = agent;

    const follow = document.createElement("button");
    follow.className = "ctl-button card-follow";
    follow.textContent = "🎥 Segui questa creatura";
    follow.addEventListener("click", () => this.actions.setMode("doc", { agent }));
    this.el["card-content"].appendChild(follow);

    this.el["card"].classList.add("show");
  }

  showCellCard(cell) {
    const biome = BIOME_IT[cell.biome] ?? { singular: cell.biome };
    const inhabitants = this.ctx.agents.agents.filter(
      (agent) => agent.state !== "dead" && this.ctx.terrain.cellAt(agent.pos.x, agent.pos.z) === cell
    );
    const names = inhabitants.slice(0, 6).map((agent) => escapeHtml(agent.name)).join(", ");
    this.el["card-content"].innerHTML = `
      <div class="card-head">
        <span class="card-icon">🗺️</span>
        <div>
          <h3 class="card-name">Cella (${cell.x}, ${cell.y})</h3>
          <p class="card-sub">${biome.article} ${biome.singular}</p>
        </div>
      </div>
      <dl class="card-grid">
        <div><dt>Cibo</dt><dd>${cell.food}/10</dd></div>
        <div><dt>Abitanti</dt><dd>${inhabitants.length}</dd></div>
      </dl>
      ${names ? `<p class="card-lineage">Qui ora vivono: ${names}${inhabitants.length > 6 ? " e altri…" : ""}</p>` : "<p class='card-lineage'>Nessuna creatura in questo momento.</p>"}`;
    this._cardFollow = null;
    this.el["card"].classList.add("show");
  }

  showFossilCard(extinct) {
    const traits = traitBars(extinct).map((trait) => `
      <div class="trait">
        <span class="trait-label">${trait.label}</span>
        <span class="trait-bar"><span class="trait-fill" style="width:${trait.value * 10}%"></span></span>
      </div>`).join("");
    this.el["card-content"].innerHTML = `
      <div class="card-head">
        <span class="card-icon fossil">🕯️</span>
        <div>
          <h3 class="card-name">${escapeHtml(extinct.name)}</h3>
          <p class="card-sub">Estinta al tick ${extinct.tick}</p>
        </div>
      </div>
      <p class="card-epithet">Ricordata nel Memoriale dell'isola</p>
      <div class="traits">${traits}</div>
      <p class="card-lineage">${escapeHtml(fossilStory(extinct, this.ctx.world))}</p>`;
    this._cardFollow = null;
    this.el["card"].classList.add("show");
  }

  get cardFollowAgent() {
    return this._cardFollow ?? null;
  }

  hideCard() {
    this.el["card"]?.classList.remove("show");
  }

  showHint() {
    this.el["hint"]?.classList.add("show");
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => this.el["hint"]?.classList.remove("show"), 9000);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
