/**
 * Bootstrap — resolves three.js from the first reachable CDN, injects the
 * import map, then starts the observatory. No build step, no bundler.
 */

(function () {
  "use strict";

  const CDNS = [
    "https://cdn.jsdelivr.net/npm/three@0.169.0",
    "https://unpkg.com/three@0.169.0",
    "https://esm.sh/three@0.169.0"
  ];

  const status = document.getElementById("loading-status");
  const errorPanel = document.getElementById("obs-error");
  const errorMessage = document.getElementById("error-message");

  function setStatus(text) {
    if (status) status.textContent = text;
  }

  function fail(message) {
    const loading = document.getElementById("obs-loading");
    if (loading) loading.classList.add("hidden");
    if (errorMessage) errorMessage.textContent = message;
    if (errorPanel) errorPanel.classList.remove("hidden");
  }

  async function pickCdn() {
    for (const base of CDNS) {
      try {
        const response = await fetch(`${base}/package.json`, { cache: "no-store" });
        if (response.ok) return base;
      } catch (error) {
        /* try the next CDN */
      }
    }
    return null;
  }

  async function boot() {
    setStatus("Cerco il motore grafico (three.js)…");
    const base = await pickCdn();
    if (!base) {
      fail("Non riesco a scaricare three.js da nessuna CDN. Controlla la connessione e ricarica la pagina.");
      return;
    }

    setStatus("Preparo il motore 3D…");
    const importMap = document.createElement("script");
    importMap.type = "importmap";
    importMap.textContent = JSON.stringify({
      imports: { three: `${base}/build/three.module.js` }
    });
    document.head.appendChild(importMap);

    // Dynamic import() inside a classic script resolves relative to the
    // document, not to this file — so build the module URL explicitly.
    const scriptUrl = (document.currentScript && document.currentScript.src)
      || new URL("observatory/bootstrap.js", document.baseURI).href;
    const mainUrl = new URL("main.js", scriptUrl).href;

    try {
      const main = await import(mainUrl);
      setStatus("Genero il mondo…");
      await main.startObservatory();
    } catch (error) {
      console.error(error);
      fail(`Qualcosa è andato storto avviando il mondo: ${error?.message ?? error}`);
    }
  }

  boot();
})();
