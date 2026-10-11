// Public, read-only Supabase connection. Never put a service_role or secret key here.
const SUPABASE_URL = "https://edmijiqrwtuakmpqnepw.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fz8-97xMhNiBYgSr346Akw_HFK9Gul0";

// Official Nightfront TD rarity tiers.
// Highest-tier rarities come first throughout the unit list, filters and gallery.
const RARITIES = ["Glitched", "Secret", "Mythic", "Epic", "Rare", "Uncommon", "Common"];
const rarityClass = (rarity) => RARITIES.includes(rarity) ? "rarity-" + rarity.toLowerCase() : "rarity-unknown";
const rarityBadge = (rarity) =>
  '<span class="rarity-badge ' + rarityClass(rarity) + '">' + escapeHtml(rarity || "Unknown") + '</span>';

function renderRarityLegend() {
  const container = $("rarityLegend");
  if (!container) return;
  container.innerHTML = RARITIES.map((rarity) =>
    '<button type="button" class="rarity-badge rarity-filter ' + rarityClass(rarity) +
    '" data-rarity-filter="' + rarity + '" aria-pressed="' +
    (state.rarity === rarity) + '">' + rarity + '</button>'
  ).join("");
}

const state = {
  units: [], loading: true, error: "", search: "",
  rarity: "", sort: "rarity", shinyCards: new Set(),
  offers: { yours: [], theirs: [] }, nextItemId: 1,
  enchants: [], enchantsLoading: true, enchantsError: "",
  homeArt: {}, fetchingUnits:false, hasLoadedUnits:false, animateCards:false, unitsShown:60
};

const $ = (id) => document.getElementById(id);
// Broken or blocked image URLs show a clean placeholder instead of an image error.
document.addEventListener("error", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLImageElement) || !target.closest(".unit-art, .category-art, .gallery-portrait, .home-feature-unit, .spotlight-art, .picker-unit-art, .offer-unit-art, .recent-unit-image")) return;
  const placeholder = document.createElement("span");
  placeholder.className = "placeholder-art";
  placeholder.textContent = "★";
  placeholder.setAttribute("aria-hidden", "true");
  target.replaceWith(placeholder);
}, true);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));
const fmt = (number) => Number(number).toLocaleString("en-US", {maximumFractionDigits:2});
const validImage = (url) => {
  if (!url || typeof url !== "string") return "";
  try {
    const parsed = new URL(url, location.href);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch { return ""; }
};
const hasValue = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
const demandLabel = value => {
  const label = String(value ?? "").trim();
  return !label || /^(unknown|n\/?a)$/i.test(label) ? "N/A" : label;
};
// Shiny visuals are separate from any future enchantment system.
// Previewing the shiny style must work even when the shiny price is N/A.
// W/F/L trading remains restricted by canTradeShiny, which needs a real value.
const canPreviewShiny = (unit) => !!unit;
const canTradeShiny = (unit) => hasValue(unit?.shiny_value);
const rarityCoverForUnit = (unit, shiny=false) => {
  // Rarity covers are owner-uploaded gallery illustrations, not verified portraits
  // of this particular unit. Keep the real unit image database field untouched.
  if (!unit || (shiny && validImage(unit.shiny_image_url)) || validImage(unit.image_url)) return "";
  return validImage(state.homeArt[unit.rarity]);
};
const imageHtml = (unit, placeholder="★", shiny=false) => {
  const exactImage = (shiny && validImage(unit?.shiny_image_url)) || validImage(unit?.image_url);
  const coverImage = exactImage ? "" : rarityCoverForUnit(unit,shiny);
  const image = exactImage || coverImage;
  const alt = exactImage
    ? (unit?.name || "Unit artwork") + (shiny ? " (shiny)" : "")
    : (unit?.rarity || "Unit") + " rarity cover (unit-specific artwork pending)";
  return image
    ? '<img loading="lazy" decoding="async"' + (coverImage ? ' class="rarity-cover-art"' : '') +
      ' src="' + escapeHtml(image) + '" alt="' + escapeHtml(alt) + '">'
    : '<span class="placeholder-art" aria-hidden="true">' + escapeHtml(placeholder) + '</span>';
};
const shinyOverlay = (shiny) => shiny
  ? '<span class="shiny-icon" aria-hidden="true">✦</span><span class="shiny-label">SHINY</span>'
  : '';

function setUnitLoading(loading) {
  const bar = $("siteLoadingStrip");
  if (bar) {
    bar.hidden = !loading;
    if (loading) $("siteLoadingText").textContent = state.units.length ?
      "Checking the latest ticket values…" : "Loading Nightfront unit values…";
  }
  $("refreshUnits").disabled = loading;
  $("refreshUnits").setAttribute("aria-busy",String(loading));
}
async function loadUnits() {
  if (state.fetchingUnits) return;
  state.fetchingUnits = true;
  state.loading = true;
  state.error = "";
  setUnitLoading(true);
  renderUnits();
  try {
    const res = await fetch(SUPABASE_URL + "/rest/v1/units?select=id,name,rarity,value,shiny_value,demand,shiny_demand,image_url,shiny_image_url,created_at,updated_at&order=created_at.desc&limit=1000", {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY }, cache:"no-store"
    });
    if (!res.ok) throw new Error("Database request failed (" + res.status + ")");
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Unexpected database response");
    state.units = data;
    state.animateCards = !state.hasLoadedUnits;
    state.hasLoadedUnits = true;
  } catch (err) {
    state.error = "Couldn't load the value list. Please try again. " + (err?.message || "");
  } finally {
    state.loading = false;
    state.fetchingUnits = false;
    setUnitLoading(false);
    renderCategories();
    renderFeatured();
    renderHomeHero();
    renderUnits();
    state.animateCards = false;
    renderCalculator();
    renderLastUpdated();
    if (!$("unitPickerModal").hidden) renderPicker();
  }
}

// Read enchant bonuses from Supabase; no enchant values are hardcoded in the browser.
// Anyone can view these values, but public website visitors cannot edit them.
async function loadEnchants() {
  state.enchantsLoading = true;
  state.enchantsError = "";
  try {
    const res = await fetch(SUPABASE_URL +
      "/rest/v1/enchants?select=id,name,bonus_tickets,sort_order&order=sort_order.asc&limit=100", {
      headers: {apikey: SUPABASE_PUBLISHABLE_KEY}
    });
    if (!res.ok) throw new Error("Enchantments unavailable (" + res.status + ")");
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Unexpected enchantment response");
    state.enchants = data.filter((item) => item && /^[a-z0-9_-]{2,40}$/.test(item.id) &&
      hasValue(item.bonus_tickets) && Number(item.bonus_tickets) >= 0);
  } catch (error) {
    state.enchantsError = error.message || "Could not load enchantments";
    // Keep the last successfully fetched bonuses when refresh is temporarily down.
  } finally {
    state.enchantsLoading = false;
    if (!$("unitPickerModal").hidden) renderPicker();
    renderCalculator();
  }
}

// Browse the actual Nightfront rarity tiers. Character portraits appear when
// an image-backed unit for that rarity exists in the shared Supabase table.
// Covers are owner-editable. If no custom art exists, feature a real unit
// portrait of the matching rarity. Other rarities show an abstract emblem,
// never fabricated or incorrectly labeled character artwork.
function renderCategories() {
  const grid = $("categories");
  grid.innerHTML = RARITIES.map((rarity) => {
    const matching = state.units.filter(unit => unit.rarity === rarity);
    const featured = matching.find(unit => validImage(unit.image_url));
    const override = validImage(state.homeArt[rarity]);
    const art = override || validImage(featured?.image_url);
    const slug = rarity.toLowerCase();
    const media = art
      ? '<span class="gallery-portrait"><img loading="lazy" src="' +
        escapeHtml(art) + '" alt="' + escapeHtml(rarity) +
        ' rarity cover artwork"></span>'
      : '<span class="gallery-empty-mark" aria-hidden="true">✦</span>' +
        '<span class="gallery-lettering" aria-hidden="true">' + escapeHtml(rarity) + '</span>';
    const count = matching.length;
    return '<button type="button" class="gallery-tile" data-gallery-rarity="' +
      escapeHtml(rarity) + '" aria-label="Browse ' + escapeHtml(rarity) +
      ' rarity, ' + count + ' listed units">' +
      '<span class="gallery-media gallery-' + slug + '">' +
      '<span class="gallery-art-top">' + (art ? (override ? 'CUSTOM COVER' : 'FROM THE UNIT LIST') : 'RARITY FILE') + '</span>' +
      media + '<span class="gallery-art-bottom">' +
      (count ? count + (count === 1 ? ' UNIT LISTED' : ' UNITS LISTED') : 'NO UNITS YET') +
      '</span></span>' +
      '<span class="gallery-caption"><span class="gallery-rarity-label rarity-' +
      slug + '">' + escapeHtml(rarity) + '</span>' +
      '<span class="gallery-caption-arrow" aria-hidden="true">↗</span></span></button>';
  }).join("");
}

function renderHomeHero() {
  const portrait = $("homeHeroUnit");
  if (!portrait) return;
  $("homeTotalUnits").textContent = state.loading ? "—" : fmt(state.units.length);
  const unit = state.units.find(item => validImage(item.image_url));
  if (!unit) {
    portrait.innerHTML = '<img src="./assets/nftd-brand.webp" width="250" height="250" alt="Nightfront TD logo">';
    $("homeFeaturedLabel").textContent = "NIGHTFRONT TD / VALUE BOARD";
    return;
  }
  portrait.innerHTML = imageHtml(unit);
  $("homeFeaturedLabel").textContent = 'SPOTLIGHT / ' + unit.name.toUpperCase() +
    ' · ' + (hasValue(unit.value) ? fmt(unit.value) + ' TICKETS' : 'N/A');
}

async function loadHomeArtwork() {
  try {
    const result = await fetch(SUPABASE_URL +
      "/rest/v1/homepage_rarity_artwork?select=rarity,image_url",{
        headers:{apikey:SUPABASE_PUBLISHABLE_KEY}
      });
    if (!result.ok) throw Error("Homepage cover request failed (" + result.status + ")");
    const items = await result.json();
    if (!Array.isArray(items)) throw Error("Invalid cover response");
    const map = {};
    for (const item of items) {
      if (RARITIES.includes(item.rarity)) map[item.rarity] = item.image_url || "";
    }
    state.homeArt = map;
  } catch(error) {
    // A temporary cover-art error should not stop public unit values loading.
    console.warn("Homepage rarity covers unavailable; using unit portraits.", error);
  } finally {
    renderCategories();
    renderHomeHero();
    // Covers and unit data load independently. Refresh cards if rarity art arrives later.
    if (state.units.length) {
      renderUnits();
      renderFeatured();
      renderLastUpdated();
      renderCalculator();
      if (!$("unitPickerModal").hidden) renderPicker();
    }
  }
}

function syncRarityDropdown() {
  const label = $("raritySelected");
  const dropdown = $("rarityDropdown");
  if (!label || !dropdown) return;
  label.textContent = state.rarity || "All rarities";
  dropdown.querySelectorAll("[data-filter-rarity]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.filterRarity === state.rarity));
  });
}
function closeRarityDropdown() {
  $("rarityChoices").hidden = true;
  $("rarityTrigger").setAttribute("aria-expanded", "false");
}

function renderFeatured() {
  const section = $("spotlightSection");
  const grid = $("spotlightGrid");
  if (!section || !grid) return;
  // Show only database-backed units. An empty database should not create blank cards.
  section.hidden = !state.units.length || !!state.error;
  if (section.hidden) {
    grid.innerHTML = "";
    return;
  }
  grid.innerHTML = state.units.slice(0, 4).map((unit) => (
    '<a href="#units" class="spotlight-card" data-spotlight-id="' + escapeHtml(unit.id) + '">' +
      '<span class="spotlight-art">' + imageHtml(unit) + '</span>' +
      '<span class="spotlight-details"><strong>' + escapeHtml(unit.name) + '</strong>' +
      '<span class="spotlight-meta">' + rarityBadge(unit.rarity) +
      '<small>' + escapeHtml(demandLabel(unit.demand)) + ' normal demand</small></span>' +
      '<b>' + (hasValue(unit.value) ? fmt(unit.value) + ' tickets' : 'N/A') + '</b></span></a>'
  )).join("");
}


function unitCardSkeletons() {
  return Array.from({length:8},(_,i)=>
    '<div class="unit-skeleton" aria-hidden="true" style="--sk-index:' + i + '">' +
      '<div class="unit-skeleton-art"><span class="unit-skeleton-stamp"></span></div>' +
      '<div class="unit-skeleton-body"><span class="unit-skeleton-line name"></span>' +
        '<span class="unit-skeleton-line rarity"></span>' +
        '<div class="unit-skeleton-details"><span class="unit-skeleton-line price"></span>' +
        '<span class="unit-skeleton-line demand"></span></div>' +
        '<span class="unit-skeleton-line footer"></span></div>' +
    '</div>').join("");
}
function unitLoadStatus() {
  const status=$("unitsLoadStatus");
  if (!status) return;
  if (state.loading) {
    status.hidden=false;
    status.textContent = state.units.length ?
      "CHECKING FOR NEW VALUES · You can keep browsing the list." :
      "LOADING THE NIGHTFRONT UNIT LIST…";
  } else if (state.error && state.units.length) {
    status.hidden=false;
    status.textContent="Couldn't check for new values. Showing the last loaded list.";
  } else {
    status.hidden=true;
    status.textContent="";
  }
}

function renderUnits() {
  if (!$("unitsGrid")) return;
  renderRarityLegend();
  const grid = $("unitsGrid");
  $("loadMoreUnits").hidden = true;
  $("search").value = state.search;
  syncRarityDropdown();
  $("sort").value = state.sort;
  unitLoadStatus();
  grid.setAttribute("aria-busy",String(state.loading));
  if (state.loading && !state.units.length) {
    grid.innerHTML = unitCardSkeletons();
    $("resultCount").textContent = "Loading units…";
    return;
  }
  if (state.error && !state.units.length) {
    grid.innerHTML = '<div class="error unit-load-error"><strong>THE LIST DIDN\'T LOAD</strong>' +
      '<p>' + escapeHtml(state.error) + '</p>' +
      '<button type="button" data-retry-units>TRY AGAIN ↻</button></div>';
    $("resultCount").textContent = "Unable to load units";
    return;
  }
  const filtered = state.units.filter((unit) => {
    return (!state.search || unit.name.toLowerCase().includes(state.search.toLowerCase())) &&
      (!state.rarity || unit.rarity === state.rarity);
  }).sort((a,b) => {
    if (state.sort === "rarity") {
      const aRank = RARITIES.indexOf(a.rarity);
      const bRank = RARITIES.indexOf(b.rarity);
      const rankDiff = (aRank < 0 ? RARITIES.length : aRank) -
                       (bRank < 0 ? RARITIES.length : bRank);
      return rankDiff || a.name.localeCompare(b.name);
    }
    if (state.sort === "name") return a.name.localeCompare(b.name);
    // Unknown values stay after priced units in either numeric sort.
    const aKnown = hasValue(a.value), bKnown = hasValue(b.value);
    if (aKnown !== bKnown) return aKnown ? -1 : 1;
    if (!aKnown) return a.name.localeCompare(b.name);
    const difference = state.sort === "highest"
      ? Number(b.value) - Number(a.value) : Number(a.value) - Number(b.value);
    return difference || a.name.localeCompare(b.name);
  });
  const countVisible = Math.min(state.unitsShown,filtered.length);
  $("resultCount").textContent = filtered.length > countVisible ?
    "Showing " + countVisible + " of " + filtered.length + " units" :
    filtered.length + " unit" + (filtered.length === 1 ? "" : "s") +
      (state.loading ? " · refreshing…" : " found");
  $("loadMoreUnits").hidden = filtered.length <= countVisible;
  $("loadMoreUnits").textContent = "SHOW " + Math.min(60,filtered.length-countVisible) +
    " MORE UNITS ↓";
  if (!filtered.length) {
    grid.innerHTML = '<div class="empty">' + (state.units.length ? "No matching units. Try another filter." : "No units listed yet. Add your first unit in the Supabase Table Editor.") + '</div>';
    return;
  }
  grid.innerHTML = filtered.slice(0,state.unitsShown).map((unit,index) => {
    const shiny = state.shinyCards.has(unit.id);
    const value = shiny ? unit.shiny_value : unit.value;
    const shownDemand = shiny ? unit.shiny_demand : unit.demand;
    const shinyAvailable = canPreviewShiny(unit);
    const enter = state.animateCards && index < 8 ? ' card-enter' : '';
    const order = state.animateCards && index < 8 ? ' style="--card-delay:' + index + '"' : '';
    return '<article class="unit-card' + (shiny ? ' is-shiny' : '') + enter + '"' + order + '>' +
      '<div class="unit-art"><span class="unit-art-file" aria-hidden="true">NF / UNIT FILE</span>' +
      imageHtml(unit, "★", shiny) + shinyOverlay(shiny) +
      (rarityCoverForUnit(unit,shiny) ? '<span class="unit-art-credit" title="This is a rarity cover, not the unit-specific portrait">RARITY ART</span>' : '') +
      '<button type="button" class="shiny-button ' + (shiny ? 'active' : '') +
      '" data-shiny-id="' + escapeHtml(unit.id) + '" title="' +
      (shinyAvailable ? "Toggle shiny appearance" : "Shiny appearance not listed yet") + '" aria-label="' +
      (shinyAvailable ? ("Show " + (shiny ? "normal" : "shiny") + " appearance for ") : "Shiny not available for ") +
      escapeHtml(unit.name) + '" aria-pressed="' + shiny + '"' +
      (shinyAvailable ? '' : ' disabled') +
      '>★</button></div>' +
      '<div class="unit-details"><div class="unit-name-row"><h3>' + escapeHtml(unit.name) + '</h3>' +
      '<span class="unit-variant">' + (shiny ? 'SHINY' : 'NORMAL') + '</span></div>' +
      '<div class="unit-sub">' + rarityBadge(unit.rarity) + '</div>' +
      '<div class="unit-stat-row"><div class="unit-price-block">' +
      '<span class="unit-stat-label">VALUE</span><div class="unit-value">' +
      (hasValue(value) ? fmt(value) + ' <small>tickets</small>' : 'N/A') +
      '</div></div>' +
      '<div class="unit-demand"><span class="unit-stat-label">DEMAND</span><b>' +
      escapeHtml(demandLabel(shownDemand)) + '</b></div></div>' +
      (window.NightfrontTrends?.cardBadges(unit,shiny) || '') +
      '<div class="unit-card-actions"><button type="button" class="unit-history-link" data-history-id="' +
      escapeHtml(unit.id) + '">↗ History</button>' +
      '<button type="button" class="unit-suggestion-link" data-suggest-unit="' +
      escapeHtml(unit.id) + '">Suggest value ↗</button></div></div></article>';
  }).join("");
}

// The website only reads publicly listed data; trade offers live in memory in the visitor's browser.
let pickerSide = "yours";
let pickerUnitId = null;
let pickerReturnFocus = null;
let pickerEnchantId = "";
let pickerEditingId = null;

const getUnit = (id) => state.units.find((unit) => String(unit.id) === String(id));
const getEntryUnit = (entry) => getUnit(entry.unitId);
const getEnchant = (id) => state.enchants.find((enchant) => enchant.id === id);
const enchantBonus = (id) => Number(getEnchant(id)?.bonus_tickets || 0);
const entryCost = (entry) => {
  const unit = getEntryUnit(entry);
  if (!unit) return null;
  const base = entry.shiny ? unit.shiny_value : unit.value;
  // Enchants cannot turn an unknown unit value into a known total.
  if (!hasValue(base)) return null;
  return (Number(base) + enchantBonus(entry.enchantId)) * entry.qty;
};
const shortEnchant = (name) => String(name).split(/\s+/).map((part) => part[0]).join("").slice(0,3).toUpperCase();

function renderEnchantPicker() {
  const list = $("enchantOptions");
  const current = getEnchant(pickerEnchantId);
  if (pickerEnchantId && !current) pickerEnchantId = "";
  const selected = current || null;
  $("enchantCurrentName").textContent = selected ? selected.name.toUpperCase() : "NO ENCHANTMENT";
  $("enchantCurrentBonus").textContent = selected ? "+" + fmt(selected.bonus_tickets) + " TICKETS / UNIT" : "BASE VALUE";
  const row = (id, name, bonus, active, symbol) =>
    '<button type="button" data-select-enchant="' + escapeHtml(id) +
    '" class="enchant-option' + (active ? ' selected' : '') +
    '" aria-pressed="' + active + '">' +
    '<span class="enchant-symbol ' + (id ? 'enchant-' + escapeHtml(id) : 'enchant-none') + '">' +
    '<span class="enchant-symbol-label">' + escapeHtml(symbol) + '</span></span>' +
    '<span class="enchant-copy"><strong>' + escapeHtml(name.toUpperCase()) + '</strong><small>' +
    (id ? '+' + fmt(bonus) + ' TICKETS' : 'BASE VALUE') +
    '</small></span><span class="enchant-selected-icon" aria-hidden="true">' +
    (active ? '✓' : '') + '</span></button>';
  list.innerHTML = row("", "No Enchantment", 0, !pickerEnchantId, "–") +
    state.enchants.map((e) => row(e.id, e.name, e.bonus_tickets,
      pickerEnchantId === e.id, shortEnchant(e.name))).join("");
  const status = $("enchantLoadStatus");
  status.hidden = !(state.enchantsLoading || state.enchantsError);
  status.textContent = state.enchantsLoading ? "Loading enchants…" :
    state.enchantsError ? "Couldn't refresh enchant bonuses. Try Refresh values." : "";
  const symbol = $("enchantToggle").querySelector(".enchant-symbol");
  if (symbol) {
    const label = symbol.querySelector(".enchant-symbol-label");
    if (label) label.textContent = selected ? shortEnchant(selected.name) : "–";
    symbol.className = "enchant-symbol " + (selected ? "enchant-" + selected.id : "enchant-none");
  }
}

function offerBreakdown(side) {
  return state.offers[side].reduce((sum, entry) => {
    const unit = getEntryUnit(entry);
    if (!unit) { sum.unknown++; return sum; }
    const qty = Number(entry.qty);
    const base = entry.shiny ? unit.shiny_value : unit.value;
    if (!hasValue(base)) { sum.unknown++; return sum; }
    sum.base += Number(base) * qty;
    sum.enchants += enchantBonus(entry.enchantId) * qty;
    sum.count += qty;
    return sum;
  }, {base:0, enchants:0, count:0, unknown:0});
}
function totalFor(side) {
  const {base, enchants, unknown} = offerBreakdown(side);
  return unknown ? null : base + enchants;
}
const formatTicketTotal = value => value == null ? "N/A" : fmt(value) + " tickets";

// Demand is an independent 0–10 community rating, never a ticket multiplier.
// Unset or non-standard text remains unrated; N/A is NOT a 0/10 rating.
const demandScore = raw => {
  const match=String(raw ?? "").trim().match(/^(10|[0-9])\s*\/\s*10$/);
  return match ? Number(match[1]) : null;
};
const demandForEntry = entry => {
  const unit=getEntryUnit(entry);
  return unit ? (entry.shiny ? unit.shiny_demand : unit.demand) : null;
};
function demandSummary(side) {
  const result={average:null,ratedQty:0,unknownQty:0,totalQty:0,
    weightedTotal:0,weight:0,lowQty:0,lowUnits:[]};
  for(const entry of state.offers[side]) {
    const unit=getEntryUnit(entry);
    const qty=Number(entry.qty);
    if(!Number.isFinite(qty) || qty<=0) continue;
    result.totalQty+=qty;
    const rating=demandScore(demandForEntry(entry));
    if(rating===null){result.unknownQty+=qty;continue;}
    // Weight by the unit's BASE ticket value and quantity. Enchants don't
    // influence demand; minimum weight 1 keeps zero-ticket units represented.
    const base=unit ? (entry.shiny ? unit.shiny_value : unit.value) : null;
    const weight=Math.max(1,hasValue(base) ? Number(base) : 1)*qty;
    result.ratedQty+=qty;
    result.weightedTotal+=rating*weight;
    result.weight+=weight;
    if(rating<=3){
      result.lowQty+=qty;
      result.lowUnits.push({
        label:(unit?.name||"Unavailable unit")+(entry.shiny?" ★":""),
        rating,qty
      });
    }
  }
  if(result.weight>0) result.average=result.weightedTotal/result.weight;
  result.complete=result.totalQty>0 && result.unknownQty===0;
  return result;
}
const demandDisplay=summary=>summary.average===null ? "N/A" :
  summary.average.toFixed(1)+"/10"+(summary.unknownQty>0?" · PARTIAL":"");
function tradeInsights(){
  const yours=demandSummary("yours");
  const theirs=demandSummary("theirs");
  const yoursTickets=totalFor("yours"),theirsTickets=totalFor("theirs");
  const both=state.offers.yours.length>0 && state.offers.theirs.length>0;
  const allRated=yours.complete && theirs.complete;
  const gap=allRated ? theirs.average-yours.average : null;
  const alerts=[];
  if(theirs.lowQty>0){
    const names=theirs.lowUnits.slice(0,3).map(u=>u.label+" ("+u.rating+"/10)").join(", ");
    alerts.push({kind:"warning",text:"LOW-DEMAND ALERT — You would receive "+names+
      (theirs.lowUnits.length>3?" and other low-demand units":"")+
      ". These may be harder to trade again."});
  }
  if(yours.lowQty>0){
    const names=yours.lowUnits.slice(0,3).map(u=>u.label+" ("+u.rating+"/10)").join(", ");
    alerts.push({kind:"note",text:"Your offer contains low-demand units: "+names+
      (yours.lowUnits.length>3?" and others":"")+
      ". Consider whether the units you receive are easier to trade."});
  }
  if(both && (yours.unknownQty>0 || theirs.unknownQty>0)){
    alerts.push({kind:"note",text:"DEMAND DATA INCOMPLETE — "+
      (yours.unknownQty+theirs.unknownQty)+" of "+
      (yours.totalQty+theirs.totalQty)+" unit(s) have N/A or unrecognized demand. "+
      "Unknown demand is not counted as low demand; a full comparison isn't possible."});
  }
  let title="ADD UNITS TO BOTH SIDES";
  let description="Build both offers to see demand warnings and a recommendation.";
  let status="neutral";
  if(both && (yoursTickets===null || theirsTickets===null)){
    title="CANNOT RECOMMEND — VALUE N/A";
    description="At least one unit's ticket value is N/A. "+
      "Demand warnings may still help, but the trade's ticket result is unknown.";
    status="caution";
  }else if(both){
    const difference=Math.abs(theirsTickets-yoursTickets);
    if(theirsTickets>yoursTickets){
      if(theirs.lowQty>0){
        title="TICKET WIN · LOW-DEMAND RISK";
        description="You gain "+fmt(difference)+
          " tickets by listed value, but you would receive low-demand units. "+
          "Consider requesting stronger-demand units instead of accepting based only on tickets.";
        status="caution";
      }else if(!allRated){
        title="TICKET WIN · VERIFY DEMAND";
        description="You gain "+fmt(difference)+
          " tickets, but demand data is incomplete. "+
          "Check how easy the incoming units are to trade before deciding.";
        status="caution";
      }else if(gap<=-1.5){
        title="TICKET WIN · WEAKER DEMAND";
        description="You gain "+fmt(difference)+" tickets, but incoming demand averages "+
          demandDisplay(theirs)+" versus "+demandDisplay(yours)+" for your offer. "+
          "The higher ticket total may be harder to re-trade.";
        status="caution";
      }else if(gap>=1.5){
        title="FAVORABLE · VALUE + DEMAND";
        description="You gain "+fmt(difference)+" tickets and the incoming offer has "+
          "higher rated demand ("+demandDisplay(theirs)+" vs "+demandDisplay(yours)+"). "+
          "Check current trading conditions before confirming.";
        status="favorable";
      }else{
        title="FAVORABLE BY LISTED DATA";
        description="You gain "+fmt(difference)+" tickets, and the incoming units "+
          "have similar demand with no low-demand flags. "+
          "That supports the ticket win, but doesn't guarantee an easy future trade.";
        status="favorable";
      }
    }else if(theirsTickets<yoursTickets){
      if(theirs.lowQty>0){
        title="AVOID · VALUE + DEMAND RISK";
        description="You give "+fmt(difference)+
          " more tickets and receive low-demand units. "+
          "You may be overpaying for items that are harder to move.";
        status="risk";
      }else if(!allRated){
        title="TICKET LOSS · CHECK DEMAND";
        description="You give "+fmt(difference)+
          " more tickets. Demand is incomplete, so there isn't enough evidence "+
          "to justify that overpay on tradability.";
        status="caution";
      }else if(gap>=1.5){
        title="VALUE LOSS · DEMAND UPSIDE";
        description="You give "+fmt(difference)+
          " more tickets, but incoming demand is higher ("+
          demandDisplay(theirs)+" vs "+demandDisplay(yours)+"). "+
          "Only consider that tradeoff if better tradability matters to you.";
        status="caution";
      }else{
        title="LIKELY OVERPAY";
        description="You give "+fmt(difference)+
          " more tickets without a meaningful demand advantage in return. "+
          "Consider asking for additional value or changing the offer.";
        status="risk";
      }
    }else{
      if(theirs.lowQty>0){
        title="FAIR TICKETS · LOW-DEMAND RISK";
        description="Ticket values match, but you receive low-demand units. "+
          "A fair ticket total doesn't make that trade equally easy to re-trade.";
        status="caution";
      }else if(!allRated){
        title="FAIR TICKETS · DEMAND UNKNOWN";
        description="Both sides have equal listed tickets, but at least one "+
          "demand rating is missing. Compare tradability before calling it fair overall.";
        status="caution";
      }else if(gap>=1.5){
        title="FAIR VALUE · BETTER DEMAND";
        description="Tickets are equal, but your incoming offer has stronger "+
          "demand ("+demandDisplay(theirs)+" vs "+demandDisplay(yours)+"). "+
          "That could make it easier to trade later.";
        status="favorable";
      }else if(gap<=-1.5){
        title="FAIR VALUE · WEAKER DEMAND";
        description="Tickets are equal, but incoming demand is weaker ("+
          demandDisplay(theirs)+" vs "+demandDisplay(yours)+"). "+
          "Consider requesting units with stronger demand.";
        status="caution";
      }else{
        title="FAIR VALUE · SIMILAR DEMAND";
        description="Both sides have equal ticket totals and broadly similar "+
          "rated demand. Other factors and changing trading conditions still matter.";
        status="neutral";
      }
    }
  }
  return {yours,theirs,alerts,title,description,status,both,allRated,
    yoursTickets,theirsTickets};
}
function renderTradeDemand(){
  const insight=tradeInsights();
  for(const [side,data] of [["Yours",insight.yours],["Theirs",insight.theirs]]){
    $("tradeDemand"+side).textContent=demandDisplay(data);
    $("tradeDemand"+side+"Detail").textContent=data.totalQty===0 ?
      "Add units to see demand." :
      data.ratedQty+" / "+data.totalQty+" unit(s) rated"+
      (data.unknownQty>0?" · incomplete":" · complete");
    const meter=$("tradeDemand"+side+"Meter");
    const fill=$("tradeDemand"+side+"Fill");
    const coverage=data.totalQty>0 ? data.ratedQty+"/"+data.totalQty+" rated" : "no units";
    meter.setAttribute("aria-label",(side==="Yours"?"Your offer: ":"Their offer: ")+
      demandDisplay(data)+" demand; "+coverage);
    fill.style.width=data.average===null?"0%":
      Math.max(0,Math.min(100,data.average*10)).toFixed(1)+"%";
    meter.classList.toggle("is-unknown",data.average===null);
  }
  const warningBox=$("tradeDemandAlerts");
  warningBox.innerHTML=insight.alerts.map(w=>
    '<div class="trade-demand-alert '+escapeHtml(w.kind)+'">'+
      '<span aria-hidden="true">'+(w.kind==="warning"?"!":"i")+'</span>'+
      '<p>'+escapeHtml(w.text)+'</p></div>').join("");
  if(insight.both && !insight.alerts.length){
    warningBox.innerHTML='<div class="trade-demand-alert clear">'+
      '<span aria-hidden="true">✓</span>'+
      '<p>No low-demand flags in the listed ratings on either side.</p></div>';
  }
  const recommendation=$("tradeRecommendation");
  recommendation.className="trade-recommendation "+insight.status;
  $("tradeRecommendationLabel").textContent="TRADE RECOMMENDATION · COMMUNITY DATA";
  $("tradeRecommendationTitle").textContent=insight.title;
  $("tradeRecommendationText").textContent=insight.description;
}

function offerText(side) {
  const names = state.offers[side].map((entry) => {
    const unit = getEntryUnit(entry);
    if (!unit) return "";
    const enchant = getEnchant(entry.enchantId);
    return unit.name + (entry.shiny ? " ★" : "") +
      (enchant ? " [" + enchant.name + "]" : "") + " x" + entry.qty;
  }).filter(Boolean);
  return names.length ? names.join(", ") : "None";
}
function getTradeText() {
  const insight=tradeInsights();
  const yours=insight.yoursTickets,theirs=insight.theirsTickets;
  return "Trading:\n" + offerText("yours") + "\nTotal: " + formatTicketTotal(yours) +
    "\nDemand: " + demandDisplay(insight.yours) +
    "\n\nLooking for:\n" + offerText("theirs") +
    "\nTotal: " + formatTicketTotal(theirs) +
    "\nDemand: " + demandDisplay(insight.theirs) +
    (insight.both ?
      (yours === null || theirs === null ?
        "\n\nResult: N/A — a unit value is not available." :
        "\n\nDifference: " + fmt(Math.abs(yours - theirs)) + " tickets (" +
        (theirs > yours ? "W" : theirs < yours ? "L" : "F") + ")") +
      "\nRecommendation: " + insight.title +
      "\n" + insight.description +
      (insight.alerts.length ? "\nWarnings: " +
        insight.alerts.map(item=>item.text).join(" ") : "") :
      "");
}
function renderCalculator() {
  for (const side of ["yours", "theirs"]) {
    const entries = state.offers[side];
    const list = $("items-" + side);
    const html = entries.map((entry) => {
      const unit = getEntryUnit(entry);
      if (!unit) return "";
      const cost = entryCost(entry);
      const enchant = getEnchant(entry.enchantId);
      return '<li class="offer-item' + (entry.shiny ? ' offer-shiny' : '') + '">' +
        '<div class="offer-unit-art">' + imageHtml(unit, "★", entry.shiny) + shinyOverlay(entry.shiny) + '</div>' +
        '<div class="offer-unit-info"><strong>' + escapeHtml(unit.name) + (entry.shiny ? ' ★' : '') + '</strong>' +
        '<span>' + escapeHtml(unit.rarity) + ' · x' + entry.qty + '</span>' +
        (enchant ? '<span class="offer-enchant">✧ ' + escapeHtml(enchant.name) +
        ' (+' + fmt(enchant.bonus_tickets) + '/unit)</span>' : '') +
        '<span class="offer-item-demand">Demand: '+
        escapeHtml(demandScore(demandForEntry(entry))===null ?
          demandLabel(demandForEntry(entry)) + ' · UNRATED' :
          demandLabel(demandForEntry(entry))) +
        (demandScore(demandForEntry(entry))!==null &&
          demandScore(demandForEntry(entry))<=3 ?
          ' <b class="trade-low-chip">LOW DEMAND</b>' : '') +
        '</span>' +
        '<small>' + formatTicketTotal(cost) + '</small></div>' +
        '<div class="offer-item-actions">' +
        '<button type="button" class="offer-edit" data-edit="' + entry.id +
        '" data-side="' + side + '" title="Edit unit, amount, shiny and enchant" aria-label="Edit ' +
        escapeHtml(unit.name) + ' in offer">Edit</button>' +
        '<button type="button" class="offer-remove" data-remove="' + entry.id +
        '" data-side="' + side + '" title="Remove unit" aria-label="Remove ' +
        escapeHtml(unit.name) + ' from offer">×</button></div></li>';
    }).filter(Boolean).join("");
    list.innerHTML = html || '<li class="offer-empty">Press + to add units</li>';
    const total = totalFor(side);
    $("total-" + side).textContent = total === null ? "N/A" : fmt(total);
    $("clear-" + side).disabled = !entries.length;
    $("open-" + side).disabled = state.loading || !!state.error || !state.units.length;
    $("open-" + side).title = state.loading ? "Loading units" : !state.units.length ? "Add units to the database first" : "Add a unit";
  }
  $("tradingText").textContent = offerText("yours");
  $("lookingForText").textContent = offerText("theirs");
  const yoursInfo = offerBreakdown("yours");
  const theirsInfo = offerBreakdown("theirs");
  const yours = totalFor("yours");
  const theirs = totalFor("theirs");
  $("comparisonYours").textContent = formatTicketTotal(yours);
  $("comparisonTheirs").textContent = formatTicketTotal(theirs);
  $("breakdownYours").textContent = yoursInfo.unknown ? "N/A — a unit value is missing." :
    "Base " + fmt(yoursInfo.base) + " + Enchants " + fmt(yoursInfo.enchants) +
    " = " + formatTicketTotal(yours);
  $("breakdownTheirs").textContent = theirsInfo.unknown ? "N/A — a unit value is missing." :
    "Base " + fmt(theirsInfo.base) + " + Enchants " + fmt(theirsInfo.enchants) +
    " = " + formatTicketTotal(theirs);
  const scale = Math.max(yours ?? 0,theirs ?? 0,1);
  $("compareBarYours").style.width = yours === null ? "0%" : (100 * yours / scale).toFixed(2) + "%";
  $("compareBarTheirs").style.width = theirs === null ? "0%" : (100 * theirs / scale).toFixed(2) + "%";
  $("compareBarYours").setAttribute("aria-label", "Your offer: " + formatTicketTotal(yours));
  $("compareBarTheirs").setAttribute("aria-label", "Their offer: " + formatTicketTotal(theirs));
  const anyOffers = !!(state.offers.yours.length || state.offers.theirs.length);
  $("resetTrade").disabled = !anyOffers;
  $("swapOffers").disabled = !anyOffers;
  const panel = $("tradeResult");
  const differenceText = $("tradeDifference");
  panel.className = "trade-outcome-bar";
  renderTradeDemand();
  if (!state.offers.yours.length || !state.offers.theirs.length) {
    panel.textContent = "ADD UNITS TO BOTH SIDES";
    differenceText.textContent = "Add at least one unit to both sides for a W/F/L result.";
    return;
  }
  if (yours === null || theirs === null) {
    panel.textContent = "N/A — VALUE UNAVAILABLE";
    differenceText.textContent = "A unit in this trade has an N/A ticket value. Remove it or wait for a listed value before comparing.";
    return;
  }
  const difference = Math.abs(yours - theirs);
  const percentage = yours > 0 ? " (" + fmt(difference / yours * 100) + "% of your offer)" : "";
  if (theirs > yours) {
    panel.classList.add("win");
    panel.textContent = "W — YOU GAIN " + fmt(difference) + " TICKETS";
    differenceText.textContent = "You receive " + fmt(difference) + " more tickets" + percentage +
      ". This is a win by listed ticket value.";
  } else if (yours > theirs) {
    panel.classList.add("loss");
    panel.textContent = "L — YOU OVERPAY BY " + fmt(difference) + " TICKETS";
    differenceText.textContent = "You give " + fmt(difference) + " more tickets" + percentage +
      ". This is a loss by listed ticket value.";
  } else {
    panel.classList.add("fair");
    panel.textContent = "F — FAIR TRADE BY TICKET VALUE";
    differenceText.textContent = "Both offers total " + fmt(yours) +
      " tickets. Equal value doesn't guarantee equal demand.";
  }
}
function renderLastUpdated() {
  const grid = $("lastUpdatedUnits");
  if (!grid) return;
  if (state.error) {
    grid.innerHTML = '<p class="recent-empty">Could not load recent units.</p>';
    return;
  }
  if (!state.units.length) {
    grid.innerHTML = '<p class="recent-empty">No units added yet.</p>';
    return;
  }
  const recent = [...state.units]
    .sort((a,b) => Date.parse(b.updated_at || b.created_at || 0) - Date.parse(a.updated_at || a.created_at || 0))
    .slice(0,6);
  grid.innerHTML = recent.map((unit) => {
    const rawDate = unit.updated_at || unit.created_at;
    const parsed = rawDate ? new Date(rawDate) : null;
    const niceDate = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleDateString() : "Recently";
    return '<button type="button" class="recent-unit" data-recent-unit="' + escapeHtml(unit.id) +
      '" title="See ' + escapeHtml(unit.name) + ' in the value list">' +
      '<span class="recent-unit-image">' + imageHtml(unit) + '</span>' +
      '<span class="recent-unit-details"><strong>' + escapeHtml(unit.name) + '</strong>' +
      rarityBadge(unit.rarity) + '<small>' + niceDate + '</small></span></button>';
  }).join("");
}
function openPicker(side, editId=null) {
  const editing = editId === null ? null :
    state.offers[side].find((entry) => String(entry.id) === String(editId));
  if (editId !== null && !editing) return;
  pickerSide = side;
  pickerEditingId = editing ? editing.id : null;
  pickerUnitId = editing ? editing.unitId : null;
  pickerEnchantId = editing?.enchantId || "";
  $("enchantOptions").hidden = true;
  $("enchantToggle").setAttribute("aria-expanded", "false");
  pickerReturnFocus = document.activeElement;
  $("pickerModeLabel").textContent = editing ? "EDIT YOUR TRADE" : "SELECT UNITS";
  $("pickerTitle").textContent = (editing ? "EDIT " : "ADD TO ") +
    (side === "yours" ? "ME" : "YOU");
  $("pickerSearch").value = "";
  $("pickerRarity").value = "";
  $("pickerQty").value = editing ? String(editing.qty) : "1";
  $("pickerShiny").checked = Boolean(editing?.shiny);
  $("unitPickerModal").hidden = false;
  document.body.classList.add("picker-open");
  renderPicker();
  if (editing) $("pickerQty").focus();
  else $("pickerSearch").focus();
}
function closePicker() {
  if ($("unitPickerModal").hidden) return;
  $("unitPickerModal").hidden = true;
  $("enchantOptions").hidden = true;
  document.body.classList.remove("picker-open");
  pickerUnitId = null;
  pickerEditingId = null;
  if (pickerReturnFocus && typeof pickerReturnFocus.focus === "function") pickerReturnFocus.focus();
}
function renderPicker() {
  const query = $("pickerSearch").value.trim().toLowerCase();
  const rarity = $("pickerRarity").value;
  const filtered = state.units.filter((unit) =>
    unit.name.toLowerCase().includes(query) && (!rarity || unit.rarity === rarity));
  const visible = filtered.slice(0,120);
  $("pickerResults").innerHTML = visible.length ? visible.map((unit) => {
    const selected = String(unit.id) === String(pickerUnitId);
    const displayShiny = selected && $("pickerShiny").checked && canTradeShiny(unit);
    return '<button type="button" class="picker-unit ' + (selected ? 'selected' : '') +
      (displayShiny ? ' picker-unit-shiny' : '') +
      '" data-pick-unit="' + escapeHtml(unit.id) + '" aria-pressed="' + selected + '">' +
      '<span class="picker-unit-art">' + imageHtml(unit, "★", displayShiny) + shinyOverlay(displayShiny) + '</span>' +
      '<strong>' + escapeHtml(unit.name) + '</strong>' +
      rarityBadge(unit.rarity) + '<small>' +
      (hasValue(unit.value) ? fmt(unit.value) + ' tickets' : 'N/A') + '</small></button>';
  }).join("") : '<div class="picker-no-results">' +
    (state.units.length ? "No matching units found." : "No units available yet.") + '</div>';
  const unit = getUnit(pickerUnitId);
  const shiny = $("pickerShiny");
  const availableShiny = unit && canTradeShiny(unit);
  shiny.disabled = !availableShiny;
  if (!availableShiny) shiny.checked = false;
  $("pickerUnitName").textContent = unit ? unit.name : "Choose a unit above";
  const selectedDemand = unit ? (shiny.checked ? unit.shiny_demand : unit.demand) : null;
  const parsedDemand = demandScore(selectedDemand);
  $("pickerDemand").textContent = unit ?
    "DEMAND: "+demandLabel(selectedDemand) +
      (parsedDemand===null ? " · UNRATED" :
       parsedDemand<=3 ? " · LOW-DEMAND ALERT" :
       parsedDemand>=7 ? " · HIGHER DEMAND" : " · MODERATE DEMAND") :
    "Demand will appear here when you choose a unit.";
  $("pickerDemand").className="picker-demand"+
    (parsedDemand!==null && parsedDemand<=3?" low":"");
  const bonus = enchantBonus(pickerEnchantId);
  const value = unit ? (shiny.checked ? unit.shiny_value : unit.value) : null;
  const known = hasValue(value);
  const base = known ? Number(value) : null;
  $("pickerUnitValue").textContent = !unit ?
    "Select a unit to add it to your trade." : !known ?
    "N/A — this variant does not have a listed ticket value yet." :
    (bonus > 0 ? fmt(base) + " base + " + fmt(bonus) + " enchant = " +
      fmt(base + bonus) + " tickets each" :
      fmt(base) + " tickets each" + (availableShiny ? " · shiny available" : ""));
  const quantity = Number($("pickerQty").value);
  $("pickerExtendedTotal").textContent = !unit ? "" : !known ?
    "TOTAL: N/A — a ticket value is needed for this trade." :
    Number.isInteger(quantity) && quantity >= 1 && quantity <= 99 ?
      "TOTAL: " + fmt((base + bonus) * quantity) + " tickets for x" + quantity :
      "Enter a quantity from 1 to 99.";
  renderEnchantPicker();
  $("pickerConfirm").disabled = !unit || !known || state.enchantsLoading ||
    !Number.isInteger(quantity) || quantity < 1 || quantity > 99;
  $("pickerConfirm").textContent = pickerEditingId === null ? "ADD TO " +
    (pickerSide === "yours" ? "ME" : "YOU") : "SAVE CHANGES";
}
function confirmPicker() {
  const unit = getUnit(pickerUnitId);
  const amount = Number($("pickerQty").value);
  const shiny = $("pickerShiny").checked;
  if (!unit) return;
  if (!Number.isInteger(amount) || amount < 1 || amount > 99) {
    $("pickerQty").focus();
    return alert("Enter an amount between 1 and 99.");
  }
  if (!hasValue(shiny ? unit.shiny_value : unit.value)) return alert("This value is not available yet.");
  if (state.enchantsLoading) return alert("Wait for the enchantments to load.");
  if (pickerEnchantId && !getEnchant(pickerEnchantId)) return alert("That enchantment is unavailable. Refresh values.");
  if (pickerEditingId !== null) {
    const existing = state.offers[pickerSide].find((entry) =>
      String(entry.id) === String(pickerEditingId));
    if (!existing) return alert("That trade item no longer exists.");
    Object.assign(existing,{unitId:unit.id, qty:amount, shiny, enchantId:pickerEnchantId});
  } else {
    state.offers[pickerSide].push({
      id:state.nextItemId++, unitId:unit.id, qty:amount, shiny, enchantId:pickerEnchantId
    });
  }
  closePicker();
  renderCalculator();
}
function route() {
  const hash = location.hash.split("?")[0];
  const params = new URLSearchParams(location.search);
  const privateAdmin = params.get("admin") === "1";
  // Supabase puts an expired-login error in the URL fragment. Show the owner
  // sign-in page so the user can request a new email instead of landing on Home.
  const loginExpired = new URLSearchParams(location.hash.slice(1)).get("error_code") === "otp_expired";
  const page = (hash === "#admin" && privateAdmin) ? "admin" :
    ["#units", "#calculator", "#about", "#qa", "#history", "#trends", "#updates", "#suggestions"].includes(hash) ? hash.slice(1) :
    (loginExpired ? "qa" : privateAdmin ? "admin" : params.get("qa") === "edit" ? "qa" : "home");
  document.querySelectorAll(".view").forEach((view) => view.hidden = view.id !== "view-" + page);
  document.querySelectorAll(".nav a").forEach((link) => link.classList.toggle("active", link.getAttribute("href") === "#" + page));
  $("nav").classList.remove("open");
  $("menuToggle").setAttribute("aria-expanded", "false");
  if ($("moreMenu")) {
    $("moreMenu").hidden = true;
    $("moreToggle").setAttribute("aria-expanded","false");
  }
  if (page === "units") renderUnits();
  if (page === "calculator") renderCalculator();
  window.scrollTo({top:0,behavior:"instant"});
}

document.addEventListener("click", (event) => {
  if (event.target === $("unitPickerModal") || event.target.closest("#pickerClose")) {
    closePicker(); return;
  }
  if (event.target.closest("[data-retry-units]")) {
    loadUnits();
    return;
  }
  const pickedUnit = event.target.closest("[data-pick-unit]");
  if (pickedUnit) {
    pickerUnitId = pickedUnit.dataset.pickUnit;
    renderPicker();
    return;
  }
  const suggestButton = event.target.closest("[data-suggest-unit]");
  if (suggestButton) {
    window.NightfrontSuggestions?.openUnit(suggestButton.dataset.suggestUnit);
    return;
  }
  const historyButton = event.target.closest("[data-history-id]");
  if (historyButton) {
    window.NightfrontHistory?.openUnit(historyButton.dataset.historyId);
    return;
  }
  const clickedRecent = event.target.closest("[data-recent-unit]");
  if (clickedRecent) {
    const unit = getUnit(clickedRecent.dataset.recentUnit);
    if (unit) {
      state.search = unit.name;
      state.rarity = ""; location.hash = "#units"; route();
    }
    return;
  }
  const spotlightButton = event.target.closest("[data-spotlight-id]");
  if (spotlightButton) {
    const unit = getUnit(spotlightButton.dataset.spotlightId);
    if (unit) {
      state.search = unit.name;
      state.rarity = "";
    }
  }
  const rarityFilterButton = event.target.closest("[data-rarity-filter]");
  if (rarityFilterButton) {
    const chosen = rarityFilterButton.dataset.rarityFilter;
    state.rarity = state.rarity === chosen ? "" : chosen;
    state.unitsShown=60;
    renderUnits(); return;
  }
  const dropdownOption = event.target.closest("[data-filter-rarity]");
  if (dropdownOption) {
    state.rarity = dropdownOption.dataset.filterRarity;
    state.unitsShown=60;
    closeRarityDropdown();
    renderUnits();
    $("rarityTrigger").focus();
    return;
  }
  if (event.target.closest("#rarityTrigger")) {
    const menu = $("rarityChoices");
    menu.hidden = !menu.hidden;
    $("rarityTrigger").setAttribute("aria-expanded", String(!menu.hidden));
    return;
  }
  if (!event.target.closest("#rarityDropdown")) closeRarityDropdown();
  const galleryButton = event.target.closest("[data-gallery-rarity]");
  if (galleryButton) {
    state.rarity = galleryButton.dataset.galleryRarity;
    state.search = ""; state.unitsShown=60;
    if (location.hash === "#units") renderUnits();
    else { location.hash = "#units"; route(); }
    return;
  }
  const shinyButton = event.target.closest("[data-shiny-id]");
  if (shinyButton && !shinyButton.disabled) {
    const id = shinyButton.dataset.shinyId;
    if (state.shinyCards.has(id)) state.shinyCards.delete(id);
    else state.shinyCards.add(id);
    renderUnits();
    // Re-rendering cards shouldn't throw keyboard focus back to the page.
    const newButton = [...document.querySelectorAll("[data-shiny-id]")].find(button =>
      button.dataset.shinyId === id);
    if (newButton) newButton.focus({preventScroll:true});
    return;
  }
  const selectedEnchant = event.target.closest("[data-select-enchant]");
  if (selectedEnchant) {
    pickerEnchantId = selectedEnchant.dataset.selectEnchant;
    $("enchantOptions").hidden = true;
    $("enchantToggle").setAttribute("aria-expanded", "false");
    renderPicker();
    return;
  }
  if (event.target.closest("#enchantToggle")) {
    const options = $("enchantOptions");
    options.hidden = !options.hidden;
    $("enchantToggle").setAttribute("aria-expanded", String(!options.hidden));
    return;
  }
  const editButton = event.target.closest("[data-edit]");
  if (editButton && ["yours","theirs"].includes(editButton.dataset.side)) {
    openPicker(editButton.dataset.side,editButton.dataset.edit);
    return;
  }
  const remove = event.target.closest("[data-remove]");
  if (remove && ["yours","theirs"].includes(remove.dataset.side)) {
    state.offers[remove.dataset.side] = state.offers[remove.dataset.side].filter((entry) =>
      String(entry.id) !== remove.dataset.remove);
    renderCalculator(); return;
  }
  if (event.target.closest("[data-all-units]")) {
    state.search = ""; state.rarity = ""; state.unitsShown=60;
    if (location.hash === "#units") renderUnits();
  }
});
$("search").addEventListener("input", (e) => { state.search = e.target.value; state.unitsShown=60; renderUnits(); });
$("sort").addEventListener("change", (e) => { state.sort = e.target.value; state.unitsShown=60; renderUnits(); });
$("clearFilters").addEventListener("click", () => {
  state.search = ""; state.rarity = ""; state.sort = "rarity"; state.unitsShown=60; renderUnits();
});
$("refreshUnits").addEventListener("click", () => { loadUnits(); loadEnchants(); window.NightfrontTrends?.refresh(); });
$("loadMoreUnits").addEventListener("click", () => {
  state.unitsShown+=60;
  renderUnits();
});
$("open-yours").addEventListener("click", () => openPicker("yours"));
$("open-theirs").addEventListener("click", () => openPicker("theirs"));
for (const side of ["yours", "theirs"]) {
  $("clear-" + side).addEventListener("click", () => {
    if (!state.offers[side].length) return;
    state.offers[side] = [];
    renderCalculator();
  });
}
$("resetTrade").addEventListener("click", () => {
  state.offers.yours = [];
  state.offers.theirs = [];
  renderCalculator();
});
$("swapOffers").addEventListener("click", () => {
  const oldYours = state.offers.yours;
  state.offers.yours = state.offers.theirs;
  state.offers.theirs = oldYours;
  renderCalculator();
});
$("pickerSearch").addEventListener("input", renderPicker);
$("pickerRarity").addEventListener("change", renderPicker);
$("pickerShiny").addEventListener("change", renderPicker);
$("pickerQty").addEventListener("input", renderPicker);
$("pickerConfirm").addEventListener("click", confirmPicker);
$("pickerQty").addEventListener("keydown", (e) => { if(e.key === "Enter") confirmPicker(); });
$("copyTrade").addEventListener("click", async () => {
  const button = $("copyTrade");
  try {
    await navigator.clipboard.writeText(getTradeText());
    button.querySelector("span").textContent = "Copied!";
    setTimeout(() => {button.querySelector("span").textContent = "Copy";}, 1800);
  } catch {
    button.querySelector("span").textContent = "Copy failed";
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!$("unitPickerModal").hidden) { event.preventDefault(); closePicker(); }
    else if (!$("rarityChoices").hidden) { closeRarityDropdown(); $("rarityTrigger").focus(); }
    else if ($("nav").classList.contains("open")) {
      $("nav").classList.remove("open");
      $("menuToggle").setAttribute("aria-expanded","false");
      $("menuToggle").focus();
    }
    return;
  }
  if (event.key === "Tab" && !$("unitPickerModal").hidden) {
    const modal = $("unitPickerModal");
    const focusables = [...modal.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')];
    if (!focusables.length) return;
    const first = focusables[0], last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      last.focus(); event.preventDefault();
    } else if (!event.shiftKey && document.activeElement === last) {
      first.focus(); event.preventDefault();
    }
  }
});
$("menuToggle").addEventListener("click", () => {
  const open = $("nav").classList.toggle("open");
  $("menuToggle").setAttribute("aria-expanded", String(open));
});
document.addEventListener("click", (event) => {
  if ($("nav").classList.contains("open") &&
      !event.target.closest("#nav") && !event.target.closest("#menuToggle")) {
    $("nav").classList.remove("open");
    $("menuToggle").setAttribute("aria-expanded","false");
  }
});
window.addEventListener("hashchange", route);
renderCategories();
route();
renderHomeHero();
loadUnits();
loadEnchants();
loadHomeArtwork();
