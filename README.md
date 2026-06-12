# Persistent Artificial Ecosystem

A tiny GitHub-native artificial ecosystem. The app is static, the world state is JSON, and GitHub Actions can evolve the simulation on a schedule by committing updated files back to the repository.

## MVP Features

- Static web app deployable with GitHub Pages.
- No backend server or database.
- Persistent world state stored in [`data/world.json`](data/world.json).
- Local and GitHub Actions simulation runner.
- Grid map with biomes and food values.
- Species with simple traits: preferred biome, size, speed, fertility, resilience, and metabolism.
- Reproduction, mutation, death, and extinction events.
- Browser UI for the map, species list, recent events, and population trends.

## Local Setup

Run one simulation tick:

```bash
npm run simulate
```

Run seven ticks:

```bash
npm run simulate:week
```

Serve the static app locally:

```bash
npm run serve
```

You can also use any static file server. A server is recommended because browsers may block `fetch("data/world.json")` from local `file://` pages.

## GitHub Pages Deployment

1. Push this repository to GitHub.
2. Open the repository settings.
3. Go to **Pages**.
4. Select **Deploy from a branch**.
5. Choose the default branch and the repository root.
6. Save.

The app will load `data/world.json` directly from the published Pages site.

## Scheduled Evolution

The workflow at [`.github/workflows/evolve-world.yml`](.github/workflows/evolve-world.yml) runs every six hours and can also be started manually with **workflow_dispatch**.

Each run:

1. Checks out the repository.
2. Runs `node scripts/simulate.js`.
3. Commits the changed `data/world.json` file back to the branch.

This makes GitHub itself the persistence layer. The commit history becomes a durable timeline of ecosystem changes.

## Architecture

```text
.
├── index.html                  Static app shell
├── styles.css                  UI styling
├── app.js                      Reads JSON state and renders the UI
├── data/
│   └── world.json              Persistent world state
├── scripts/
│   └── simulate.js             Node-based simulation tick runner
└── .github/workflows/
    └── evolve-world.yml        Scheduled world evolution
```

The simulation is intentionally simple:

- Food regrows by biome each tick.
- Species consume food from their preferred biome.
- Births are affected by fertility, food availability, and size.
- Deaths are affected by scarcity, metabolism, and resilience.
- Mutations occasionally nudge numeric traits up or down.
- Random events can reduce food, create blooms, or cause disease.
- Any species reaching zero population is recorded as extinct.

## Data Model

`data/world.json` contains:

- `tick`: current simulation tick.
- `updatedAt`: last evolution timestamp.
- `map`: grid dimensions and cells.
- `species`: living or extinct species and their traits.
- `events`: recent event log.
- `history`: population snapshots for trend rendering.
- `extinctions`: permanent extinction records.

## Future Roadmap

- Add species positions and movement between cells.
- Add predator/prey relationships and trophic levels.
- Add seeded randomness for reproducible simulation runs.
- Split world data into multiple JSON files once the ecosystem grows.
- Add visual overlays for population density and food pressure.
- Add branch-based experiments for alternate evolutionary histories.
- Add GitHub issue generation for major ecological events.
- Add import/export tools for user-created species and maps.
