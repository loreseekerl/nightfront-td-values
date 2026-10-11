// Automatically use only genuine, successfully exported Roblox unit images.
// Never overwrite portraits the owner uploaded, unit identity, rarity, or values.
(() => {
  "use strict";
  let manifestPromise;
  const MANIFEST_TIMEOUT_MS = 4000;
  const SAFE_ASSET_ID = /^[0-9]{8,20}$/;
  const SAFE_IMAGE_PATH = /^assets\/roblox-units\/([0-9]{8,20})\.(png|jpg|jpeg|webp|gif)$/;
  const RARITIES = new Set(["Common","Uncommon","Rare","Epic","Mythic","Secret","Glitched"]);

  async function fetchManifest() {
    const controller = new AbortController();
    let timeoutId;
    const timeout = new Promise((resolve,reject)=>{
      timeoutId = setTimeout(()=>{
        controller.abort();
        reject(new Error("Artwork manifest timed out"));
      },MANIFEST_TIMEOUT_MS);
    });
    try {
      const request = Promise.all([
        fetch("./roblox-art-sync.json", {cache:"no-store",signal:controller.signal}),
        fetch("./roblox-art-result.json", {cache:"no-store",signal:controller.signal})
      ]).then(async ([sourceResponse,exportResponse])=>{
        if (!sourceResponse.ok || !exportResponse.ok)
          throw new Error("Artwork manifest unavailable");
        const [source,exported] = await Promise.all([
          sourceResponse.json(),exportResponse.json()
        ]);
        if (source.schemaVersion !== 1 ||
            String(source.snapshotId) !== String(exported.sourceSnapshotId) ||
            !Array.isArray(source.units) || !exported.assets)
          throw new Error("Artwork manifest does not match its export");
        const lookup = new Map();
        for (const item of source.units) {
          if (typeof item?.name !== "string" || !RARITIES.has(item.rarity)) continue;
          const record = {rarity:item.rarity};
          for (const [field,key] of [
            ["image_asset_id","normal"],["shiny_image_asset_id","shiny"]
          ]) {
            const id = item[field];
            if (typeof id !== "string" || !SAFE_ASSET_ID.test(id)) continue;
            // Same asset for normal and shiny is not distinct shiny artwork.
            // The normal portrait is already reused with the shiny outline.
            if (key === "shiny" && id === item.image_asset_id) continue;
            const asset = exported.assets[id];
            const path = asset?.path;
            const match = typeof path === "string" ? path.match(SAFE_IMAGE_PATH) : null;
            if (!asset || asset.state !== "ready" || !match || match[1] !== id) continue;
            record[key] = "./"+path;
          }
          // Exact unit-name matching, so "Toy Bonnie" cannot borrow art from
          // "Jester Toy Bonnie" or from another inventory category.
          if (record.normal || record.shiny) lookup.set(item.name,record);
        }
        return lookup;
      });
      // Bound both response fetches and JSON body reads. Optional artwork
      // must not leave the already-fetched unit list waiting indefinitely.
      return await Promise.race([request,timeout]);
    } finally {
      clearTimeout(timeoutId);
      controller.abort();
    }
  }

  async function loadManifest() {
    if (!manifestPromise) {
      const pending = fetchManifest().catch(()=>{
        // A subsequent Refresh values can retry a temporary failure while
        // concurrent callers continue sharing the same pending request.
        if (manifestPromise === pending) manifestPromise = undefined;
        return new Map();
      });
      manifestPromise = pending;
    }
    return manifestPromise;
  }

  async function hydrate(units) {
    if (!Array.isArray(units) || !units.length) return units;
    const lookup = await loadManifest();
    for (const unit of units) {
      const art = lookup.get(unit?.name);
      if (!art || art.rarity !== unit.rarity) continue;
      if ((!unit.image_url || !String(unit.image_url).trim()) && art.normal)
        unit.image_url=art.normal;
      if ((!unit.shiny_image_url || !String(unit.shiny_image_url).trim()) && art.shiny)
        unit.shiny_image_url=art.shiny;
    }
    return units;
  }

  window.NightfrontArt={hydrate};
})();

