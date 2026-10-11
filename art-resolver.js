// Automatically use only genuine, successfully exported Roblox unit images.
// Never overwrite portraits the owner uploaded, unit identity, rarity, or values.
(() => {
  "use strict";
  let manifestPromise;
  const SAFE_ASSET_ID = /^[0-9]{8,20}$/;
  const SAFE_IMAGE_PATH = /^assets\/roblox-units\/([0-9]{8,20})\.(png|jpg|jpeg|webp|gif)$/;
  const RARITIES = new Set(["Common","Uncommon","Rare","Epic","Mythic","Secret","Glitched"]);

  async function loadManifest() {
    if (!manifestPromise) {
      manifestPromise = Promise.all([
        fetch("./roblox-art-sync.json", {cache:"no-store"}),
        fetch("./roblox-art-result.json", {cache:"no-store"})
      ]).then(async ([sourceResponse,exportResponse])=>{
        if (!sourceResponse.ok || !exportResponse.ok) return new Map();
        const [source,exported] = await Promise.all([
          sourceResponse.json(),exportResponse.json()
        ]);
        if (source.schemaVersion !== 1 ||
            String(source.snapshotId) !== String(exported.sourceSnapshotId) ||
            !Array.isArray(source.units) || !exported.assets) return new Map();
        const lookup = new Map();
        for (const item of source.units) {
          if (typeof item?.name !== "string" || !RARITIES.has(item.rarity)) continue;
          const record = {rarity:item.rarity};
          for (const [field,key] of [
            ["image_asset_id","normal"],["shiny_image_asset_id","shiny"]
          ]) {
            const id = item[field];
            if (typeof id !== "string" || !SAFE_ASSET_ID.test(id)) continue;
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
      }).catch(()=>new Map());
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
