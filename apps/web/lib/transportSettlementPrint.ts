// Captura solamente los anexos ya autorizados y renderizados en esta vista.
export async function captureSettlementAnnexes(root: HTMLElement, signal: AbortSignal) {
  const aborted = () => { if (signal.aborted) throw new DOMException("Cancelado", "AbortError"); };
  const started = Date.now();
  while (Array.from(root.querySelectorAll("[data-rate-capture]")).some(stage => !stage.querySelector('[data-cost-panel="route"]'))) {
    aborted();
    if (Date.now() - started > 45000) throw Error("Los tarifarios no se cargaron.");
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await document.fonts.ready;
  aborted();
  const { toJpeg } = await import("html-to-image");
  const images: Record<string, string> = {};
  for (const stage of Array.from(root.querySelectorAll<HTMLElement>("[data-rate-capture]"))) {
    aborted();
    const mapStarted = Date.now();
    while ((!stage.querySelector('.leaflet-container[data-route-map-ready="true"]') || !stage.querySelector('.leaflet-tile')) && Date.now() - mapStarted < 4000) {
      aborted();
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    // Las teselas pueden faltar por conectividad; no se omiten silenciosamente.
    const tiles = Array.from(stage.querySelectorAll<HTMLImageElement>(".leaflet-tile"));
    await Promise.all(tiles.map(tile => Promise.race([tile.decode().catch(() => undefined), new Promise(resolve => setTimeout(resolve, 10000))])));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (stage.querySelector('.leaflet-container') && (!tiles.length || tiles.some(tile => !tile.complete || !tile.naturalWidth))) {
      const note = document.createElement("p");
      note.textContent = "Mapa base no disponible. Se conserva el recorrido y los valores del tarifario.";
      note.style.cssText = "padding:8px;color:#193342;background:#fff";
      stage.appendChild(note);
    }
    images[stage.dataset.rateCapture!] = await toJpeg(stage, { quality: 0.94, pixelRatio: 1, backgroundColor: "#ffffff", skipFonts: true });
  }
  aborted();
  return images;
}
