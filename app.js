// Public, read-only Supabase connection. Never put a service_role or secret key here.
const SUPABASE_URL = "https://edmijiqrwtuakmpqnepw.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fz8-97xMhNiBYgSr346Akw_HFK9Gul0";

const CATEGORIES = [
  { name: "Developer / ARG", symbol: "◈", accent: "#ff769b", glow: "#752943" },
  { name: "Forgottens", symbol: "▣", accent: "#8eb6ff", glow: "#2a4477" },
  { name: "Apexes", symbol: "✷", accent: "#ffe59b", glow: "#68572e" },
  { name: "Evolutions", symbol: "♛", accent: "#fbc56c", glow: "#7d5420" },
  { name: "Nightmares", symbol: "✦", accent: "#e3ecac", glow: "#59672c" },
  { name: "Secrets", symbol: "☄", accent: "#a37cff", glow: "#4b2f83" },
  { name: "Mythic and+", symbol: "★", accent: "#ffe382", glow: "#926835" },
  { name: "Items", symbol: "⚔", accent: "#d28bff", glow: "#612a86" }
];

// Rarities are separate from the homepage categories.
const RARITIES = ["Common", "Uncommon", "Rare", "Epic", "Mythic", "Secret", "Glitched"];
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
  units: [], loading: true, error: "", category: "", search: "",
  rarity: "", sort: "name", shinyCards: new Set(),
  offers: { yours: [], theirs: [] }, nextItemId: 1
};

const $ = (id) => document.getElementById(id);
// Broken or blocked image URLs show a clean placeholder instead of an image error.
document.addEventListener("error", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLImageElement) || !target.closest(".unit-art, .category-art, .spotlight-art, .picker-unit-art, .offer-unit-art, .recent-unit-image")) return;
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
const categoryOf = (unit) => CATEGORIES.find((c) => c.name.toLowerCase() === String(unit.category).toLowerCase())?.name || "Other";
const imageHtml = (unit, placeholder="★") => {
  const image = validImage(unit?.image_url);
  return image
    ? '<img loading="lazy" src="' + escapeHtml(image) + '" alt="' + escapeHtml(unit?.name || "Unit artwork") + '">'
    : '<span class="placeholder-art" aria-hidden="true">' + escapeHtml(placeholder) + '</span>';
};

async function loadUnits() {
  state.loading = true;
  state.error = "";
  renderUnits();
  try {
    const res = await fetch(SUPABASE_URL + "/rest/v1/units?select=id,name,rarity,category,value,shiny_value,demand,image_url,created_at,updated_at&order=created_at.desc&limit=1000", {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY }
    });
    if (!res.ok) throw new Error("Database request failed (" + res.status + ")");
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Unexpected database response");
    state.units = data;
  } catch (err) {
    state.error = "Couldn't load the value list. Please try again. " + (err?.message || "");
  } finally {
    state.loading = false;
    renderCategories();
    renderFeatured();
    renderUnits();
    renderCalculator();
    renderLastUpdated();
    if (!$("unitPickerModal").hidden) renderPicker();
  }
}

// Browse the actual Nightfront rarity tiers. Character portraits appear when
// an image-backed unit for that rarity exists in the shared Supabase table.
function renderCategories() {
  const grid = $("categories");
  const names = RARITIES;
  grid.innerHTML = names.map((rarity) => {
    const unitsInRarity = state.units.filter((unit) => unit.rarity === rarity);
    const featured = unitsInRarity.find((unit) => validImage(unit.image_url));
    const slug = rarity.toLowerCase();
    const media = featured
      ? '<span class="gallery-portrait">' + imageHtml(featured) + '</span>'
      : '<span class="gallery-lettering" aria-hidden="true">' + escapeHtml(rarity) + '</span>';
    return '<button type="button" class="gallery-tile" data-gallery-rarity="' +
      escapeHtml(rarity) + '" aria-label="Browse ' + escapeHtml(rarity) + ' units">' +
      '<span class="gallery-media gallery-' + slug + '">' + media + '</span>' +
      '<span class="gallery-caption"><span class="gallery-rarity-label rarity-' +
      slug + '">' + escapeHtml(rarity) + '</span>' +
      '</span></button>';
  }).join("");
}

function syncCategoryDropdown() {
  const label = $("categorySelected");
  const dropdown = $("categoryDropdown");
  if (!label || !dropdown) return;
  label.textContent = state.category || "All categories";
  dropdown.querySelectorAll("[data-filter-category]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.filterCategory === state.category));
  });
}
function closeCategoryDropdown() {
  $("categoryChoices").hidden = true;
  $("categoryTrigger").setAttribute("aria-expanded", "false");
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
      '<small>' + escapeHtml(unit.demand || "Unknown") + ' demand</small></span>' +
      '<b>' + (hasValue(unit.value) ? fmt(unit.value) : "Not listed") + ' tickets</b></span></a>'
  )).join("");
}

function renderUnits() {
  if (!$("unitsGrid")) return;
  renderRarityLegend();
  const grid = $("unitsGrid");
  $("search").value = state.search;
  $("rarity").value = state.rarity;
  syncCategoryDropdown();
  $("sort").value = state.sort;
  if (state.loading) {
    grid.innerHTML = '<div class="empty">Loading unit values…</div>';
    $("resultCount").textContent = "Loading…";
    return;
  }
  if (state.error) {
    grid.innerHTML = '<div class="error">' + escapeHtml(state.error) + '</div>';
    $("resultCount").textContent = "Unable to load units";
    return;
  }
  const filtered = state.units.filter((unit) => {
    return (!state.search || unit.name.toLowerCase().includes(state.search.toLowerCase())) &&
      (!state.rarity || unit.rarity === state.rarity) &&
      (!state.category || categoryOf(unit) === state.category);
  }).sort((a,b) => state.sort === "highest" ? Number(b.value) - Number(a.value) :
                  state.sort === "lowest" ? Number(a.value) - Number(b.value) :
                  a.name.localeCompare(b.name));
  $("resultCount").textContent = filtered.length + " unit" + (filtered.length === 1 ? "" : "s") + " found";
  if (!filtered.length) {
    grid.innerHTML = '<div class="empty">' + (state.units.length ? "No matching units. Try another filter." : "No units listed yet. Add your first unit in the Supabase Table Editor.") + '</div>';
    return;
  }
  grid.innerHTML = filtered.map((unit) => {
    const shiny = state.shinyCards.has(unit.id);
    const value = shiny ? unit.shiny_value : unit.value;
    const shinyAvailable = hasValue(unit.shiny_value);
    return '<article class="unit-card"><div class="unit-art">' + imageHtml(unit) +
      '<button type="button" class="shiny-button ' + (shiny ? 'active' : '') +
      '" data-shiny-id="' + escapeHtml(unit.id) + '" title="' +
      (shinyAvailable ? "Toggle shiny value" : "Shiny value not listed yet") + '" aria-label="' +
      (shinyAvailable ? ("Show " + (shiny ? "normal" : "shiny") + " value for ") : "Shiny value unavailable for ") +
      escapeHtml(unit.name) + '" aria-pressed="' + shiny + '"' +
      (shinyAvailable ? '' : ' disabled') +
      '>★</button></div><div class="unit-details"><h3>' +
      escapeHtml(unit.name) + '</h3><div class="unit-sub">' +
      rarityBadge(unit.rarity) + '<span class="unit-category">' + escapeHtml(categoryOf(unit)) + '</span></div><div class="unit-value">' +
      (hasValue(value) ? fmt(value) : 'Not listed') +
      ' <small>' + (shiny ? 'shiny tickets' : 'tickets') + '</small></div><div class="unit-demand">Demand: <b>' +
      escapeHtml(unit.demand || "Unknown") + '</b></div></div></article>';
  }).join("");
}

// The website only reads publicly listed data; trade offers live in memory in the visitor's browser.
let pickerSide = "yours";
let pickerUnitId = null;
let pickerReturnFocus = null;

const getUnit = (id) => state.units.find((unit) => String(unit.id) === String(id));
const getEntryUnit = (entry) => getUnit(entry.unitId);

function totalFor(side) {
  return state.offers[side].reduce((sum, entry) => {
    const unit = getEntryUnit(entry);
    if (!unit) return sum;
    const value = entry.shiny ? unit.shiny_value : unit.value;
    return sum + (hasValue(value) ? Number(value) * entry.qty : 0);
  }, 0);
}
function offerText(side) {
  const names = state.offers[side].map((entry) => {
    const unit = getEntryUnit(entry);
    if (!unit) return "";
    return unit.name + (entry.shiny ? " ★" : "") + " x" + entry.qty;
  }).filter(Boolean);
  return names.length ? names.join(", ") : "None";
}
function getTradeText() {
  return "Trading:\n" + offerText("yours") + "\n\nLooking for:\n" + offerText("theirs");
}
function renderCalculator() {
  for (const side of ["yours", "theirs"]) {
    const entries = state.offers[side];
    const list = $("items-" + side);
    const html = entries.map((entry) => {
      const unit = getEntryUnit(entry);
      if (!unit) return "";
      const cost = Number(entry.shiny ? unit.shiny_value : unit.value) * entry.qty;
      return '<li class="offer-item">' +
        '<div class="offer-unit-art">' + imageHtml(unit) + '</div>' +
        '<div class="offer-unit-info"><strong>' + escapeHtml(unit.name) + (entry.shiny ? ' ★' : '') + '</strong>' +
        '<span>' + escapeHtml(unit.rarity) + ' · x' + entry.qty + '</span>' +
        '<small>' + fmt(cost) + ' tickets</small></div>' +
        '<button type="button" class="offer-remove" data-remove="' + entry.id +
        '" data-side="' + side + '" title="Remove unit" aria-label="Remove ' +
        escapeHtml(unit.name) + ' from offer">×</button></li>';
    }).filter(Boolean).join("");
    list.innerHTML = html || '<li class="offer-empty">Press + to add units</li>';
    $("total-" + side).textContent = fmt(totalFor(side));
    $("open-" + side).disabled = state.loading || !!state.error || !state.units.length;
    $("open-" + side).title = state.loading ? "Loading units" : !state.units.length ? "Add units to the database first" : "Add a unit";
  }
  $("tradingText").textContent = offerText("yours");
  $("lookingForText").textContent = offerText("theirs");
  const panel = $("tradeResult");
  panel.className = "trade-outcome-bar";
  if (!state.offers.yours.length || !state.offers.theirs.length) {
    panel.textContent = "ADD UNITS TO BOTH SIDES";
    return;
  }
  const yours = totalFor("yours");
  const theirs = totalFor("theirs");
  const difference = Math.abs(yours - theirs);
  if (theirs > yours) {
    panel.classList.add("win");
    panel.textContent = "W — YOU GAIN " + fmt(difference) + " TICKETS";
  } else if (yours > theirs) {
    panel.classList.add("loss");
    panel.textContent = "L — YOU OVERPAY BY " + fmt(difference) + " TICKETS";
  } else {
    panel.classList.add("fair");
    panel.textContent = "F — FAIR TRADE BY TICKET VALUE";
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
function openPicker(side) {
  pickerSide = side;
  pickerUnitId = null;
  pickerReturnFocus = document.activeElement;
  $("pickerTitle").textContent = side === "yours" ? "ADD TO ME" : "ADD TO YOU";
  $("pickerSearch").value = "";
  $("pickerRarity").value = "";
  $("pickerQty").value = "1";
  $("pickerShiny").checked = false;
  $("unitPickerModal").hidden = false;
  document.body.classList.add("picker-open");
  renderPicker();
  $("pickerSearch").focus();
}
function closePicker() {
  if ($("unitPickerModal").hidden) return;
  $("unitPickerModal").hidden = true;
  document.body.classList.remove("picker-open");
  pickerUnitId = null;
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
    return '<button type="button" class="picker-unit ' + (selected ? 'selected' : '') +
      '" data-pick-unit="' + escapeHtml(unit.id) + '" aria-pressed="' + selected + '">' +
      '<span class="picker-unit-art">' + imageHtml(unit) + '</span>' +
      '<strong>' + escapeHtml(unit.name) + '</strong>' +
      rarityBadge(unit.rarity) + '<small>' + fmt(unit.value) + ' tickets</small></button>';
  }).join("") : '<div class="picker-no-results">' +
    (state.units.length ? "No matching units found." : "No units available yet.") + '</div>';
  const unit = getUnit(pickerUnitId);
  const shiny = $("pickerShiny");
  const availableShiny = unit && hasValue(unit.shiny_value);
  shiny.disabled = !availableShiny;
  if (!availableShiny) shiny.checked = false;
  $("pickerUnitName").textContent = unit ? unit.name : "Choose a unit above";
  $("pickerUnitValue").textContent = unit ?
    (shiny.checked ? fmt(unit.shiny_value) + " shiny tickets each" :
    fmt(unit.value) + " tickets each" + (availableShiny ? " · shiny available" : "")) :
    "Select a unit to add it to your trade.";
  $("pickerConfirm").disabled = !unit;
  $("pickerConfirm").textContent = "ADD TO " + (pickerSide === "yours" ? "ME" : "YOU");
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
  state.offers[pickerSide].push({id:state.nextItemId++,unitId:unit.id,qty:amount,shiny});
  closePicker();
  renderCalculator();
}
function route() {
  const hash = location.hash.split("?")[0];
  const page = ["#units", "#calculator", "#about"].includes(hash) ? hash.slice(1) : "home";
  document.querySelectorAll(".view").forEach((view) => view.hidden = view.id !== "view-" + page);
  document.querySelectorAll(".nav a").forEach((link) => link.classList.toggle("active", link.getAttribute("href") === "#" + page));
  $("nav").classList.remove("open");
  $("menuToggle").setAttribute("aria-expanded", "false");
  if (page === "units") renderUnits();
  if (page === "calculator") renderCalculator();
  window.scrollTo({top:0,behavior:"instant"});
}

document.addEventListener("click", (event) => {
  if (event.target === $("unitPickerModal") || event.target.closest("#pickerClose")) {
    closePicker(); return;
  }
  const pickedUnit = event.target.closest("[data-pick-unit]");
  if (pickedUnit) {
    pickerUnitId = pickedUnit.dataset.pickUnit;
    renderPicker();
    return;
  }
  const clickedRecent = event.target.closest("[data-recent-unit]");
  if (clickedRecent) {
    const unit = getUnit(clickedRecent.dataset.recentUnit);
    if (unit) {
      state.search = unit.name;
      state.rarity = ""; state.category = "";
      location.hash = "#units"; route();
    }
    return;
  }
  const spotlightButton = event.target.closest("[data-spotlight-id]");
  if (spotlightButton) {
    const unit = getUnit(spotlightButton.dataset.spotlightId);
    if (unit) {
      state.search = unit.name;
      state.category = ""; state.rarity = "";
    }
  }
  const rarityFilterButton = event.target.closest("[data-rarity-filter]");
  if (rarityFilterButton) {
    const chosen = rarityFilterButton.dataset.rarityFilter;
    state.rarity = state.rarity === chosen ? "" : chosen;
    renderUnits(); return;
  }
  const dropdownOption = event.target.closest("[data-filter-category]");
  if (dropdownOption) {
    state.category = dropdownOption.dataset.filterCategory;
    closeCategoryDropdown();
    renderUnits();
    $("categoryTrigger").focus();
    return;
  }
  if (event.target.closest("#categoryTrigger")) {
    const menu = $("categoryChoices");
    menu.hidden = !menu.hidden;
    $("categoryTrigger").setAttribute("aria-expanded", String(!menu.hidden));
    return;
  }
  if (!event.target.closest("#categoryDropdown")) closeCategoryDropdown();
  const galleryButton = event.target.closest("[data-gallery-rarity]");
  if (galleryButton) {
    state.rarity = galleryButton.dataset.galleryRarity;
    state.category = "";
    state.search = "";
    if (location.hash === "#units") renderUnits();
    else { location.hash = "#units"; route(); }
    return;
  }
  const categoryButton = event.target.closest("[data-category]");
  if (categoryButton) {
    state.category = categoryButton.dataset.category;
    location.hash = "#units"; route(); return;
  }
  const shinyButton = event.target.closest("[data-shiny-id]");
  if (shinyButton && !shinyButton.disabled) {
    const id = shinyButton.dataset.shinyId;
    if (state.shinyCards.has(id)) state.shinyCards.delete(id);
    else state.shinyCards.add(id);
    renderUnits(); return;
  }
  const remove = event.target.closest("[data-remove]");
  if (remove && ["yours","theirs"].includes(remove.dataset.side)) {
    state.offers[remove.dataset.side] = state.offers[remove.dataset.side].filter((entry) =>
      String(entry.id) !== remove.dataset.remove);
    renderCalculator(); return;
  }
  if (event.target.closest("[data-all-units]")) {
    state.category = ""; state.search = ""; state.rarity = "";
    if (location.hash === "#units") renderUnits();
  }
});
$("search").addEventListener("input", (e) => { state.search = e.target.value; renderUnits(); });
$("rarity").addEventListener("change", (e) => { state.rarity = e.target.value; renderUnits(); });
$("sort").addEventListener("change", (e) => { state.sort = e.target.value; renderUnits(); });
$("clearFilters").addEventListener("click", () => {
  state.search = ""; state.rarity = ""; state.category = ""; state.sort = "name"; renderUnits();
});
$("refreshUnits").addEventListener("click", loadUnits);
$("open-yours").addEventListener("click", () => openPicker("yours"));
$("open-theirs").addEventListener("click", () => openPicker("theirs"));
$("pickerSearch").addEventListener("input", renderPicker);
$("pickerRarity").addEventListener("change", renderPicker);
$("pickerShiny").addEventListener("change", renderPicker);
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
    else if (!$("categoryChoices").hidden) { closeCategoryDropdown(); $("categoryTrigger").focus(); }
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
window.addEventListener("hashchange", route);
renderCategories();
route();
loadUnits();
