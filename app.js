// Public, read-only Supabase connection. Never put a service_role or secret key here.
const SUPABASE_URL = "https://edmijiqrwtuakmpqnepw.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fz8-97xMhNiBYgSr346Akw_HFK9Gul0";

// Official Nightfront TD rarity tiers.
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
  units: [], loading: true, error: "", search: "",
  rarity: "", sort: "name", shinyCards: new Set(),
  offers: { yours: [], theirs: [] }, nextItemId: 1,
  enchants: [], enchantsLoading: true, enchantsError: ""
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
// Shiny visuals are separate from any future enchantment system.
const canPreviewShiny = (unit) => hasValue(unit?.shiny_value) || !!validImage(unit?.shiny_image_url);
const canTradeShiny = (unit) => hasValue(unit?.shiny_value);
const imageHtml = (unit, placeholder="★", shiny=false) => {
  const image = (shiny && validImage(unit?.shiny_image_url)) || validImage(unit?.image_url);
  return image
    ? '<img loading="lazy" src="' + escapeHtml(image) + '" alt="' + escapeHtml(unit?.name || "Unit artwork") + (shiny ? ' (shiny)' : '') + '">'
    : '<span class="placeholder-art" aria-hidden="true">' + escapeHtml(placeholder) + '</span>';
};
const shinyOverlay = (shiny) => shiny
  ? '<span class="shiny-icon" aria-hidden="true">✦</span><span class="shiny-label">SHINY</span>'
  : '';

async function loadUnits() {
  state.loading = true;
  state.error = "";
  renderUnits();
  try {
    const res = await fetch(SUPABASE_URL + "/rest/v1/units?select=id,name,rarity,value,shiny_value,demand,image_url,shiny_image_url,created_at,updated_at&order=created_at.desc&limit=1000", {
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
      '<small>' + escapeHtml(unit.demand || "Unknown") + ' demand</small></span>' +
      '<b>' + (hasValue(unit.value) ? fmt(unit.value) : "Not listed") + ' tickets</b></span></a>'
  )).join("");
}

function renderUnits() {
  if (!$("unitsGrid")) return;
  renderRarityLegend();
  const grid = $("unitsGrid");
  $("search").value = state.search;
  syncRarityDropdown();
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
      (!state.rarity || unit.rarity === state.rarity);
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
    const shinyAvailable = canPreviewShiny(unit);
    return '<article class="unit-card' + (shiny ? ' is-shiny' : '') + '"><div class="unit-art">' +
      imageHtml(unit, "★", shiny) + shinyOverlay(shiny) +
      '<button type="button" class="shiny-button ' + (shiny ? 'active' : '') +
      '" data-shiny-id="' + escapeHtml(unit.id) + '" title="' +
      (shinyAvailable ? "Toggle shiny appearance" : "Shiny appearance not listed yet") + '" aria-label="' +
      (shinyAvailable ? ("Show " + (shiny ? "normal" : "shiny") + " appearance for ") : "Shiny not available for ") +
      escapeHtml(unit.name) + '" aria-pressed="' + shiny + '"' +
      (shinyAvailable ? '' : ' disabled') +
      '>★</button></div><div class="unit-details"><h3>' +
      escapeHtml(unit.name) + '</h3><div class="unit-sub">' +
      rarityBadge(unit.rarity) + '</div><div class="unit-value">' +
      (hasValue(value) ? fmt(value) : 'Not listed') +
      ' <small>tickets</small></div><div class="unit-demand">Demand: <b>' +
      escapeHtml(unit.demand || "Unknown") + '</b></div>' +
      '<button type="button" class="unit-history-link" data-history-id="' +
      escapeHtml(unit.id) + '">↗ Value history</button></div></article>';
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
  if (!unit) return 0;
  const base = entry.shiny ? unit.shiny_value : unit.value;
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
    if (!unit) return sum;
    const qty = Number(entry.qty);
    const unitBase = Number(entry.shiny ? unit.shiny_value : unit.value) || 0;
    sum.base += unitBase * qty;
    sum.enchants += enchantBonus(entry.enchantId) * qty;
    sum.count += qty;
    return sum;
  }, {base:0, enchants:0, count:0});
}
function totalFor(side) {
  const {base, enchants} = offerBreakdown(side);
  return base + enchants;
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
  const yours = totalFor("yours"), theirs = totalFor("theirs");
  return "Trading:\n" + offerText("yours") + "\nTotal: " + fmt(yours) +
    " tickets\n\nLooking for:\n" + offerText("theirs") +
    "\nTotal: " + fmt(theirs) + " tickets" +
    (state.offers.yours.length && state.offers.theirs.length ?
      "\n\nDifference: " + fmt(Math.abs(yours - theirs)) + " tickets (" +
      (theirs > yours ? "W" : theirs < yours ? "L" : "F") + ")" : "");
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
        '<small>' + fmt(cost) + ' tickets</small></div>' +
        '<div class="offer-item-actions">' +
        '<button type="button" class="offer-edit" data-edit="' + entry.id +
        '" data-side="' + side + '" title="Edit unit, amount, shiny and enchant" aria-label="Edit ' +
        escapeHtml(unit.name) + ' in offer">Edit</button>' +
        '<button type="button" class="offer-remove" data-remove="' + entry.id +
        '" data-side="' + side + '" title="Remove unit" aria-label="Remove ' +
        escapeHtml(unit.name) + ' from offer">×</button></div></li>';
    }).filter(Boolean).join("");
    list.innerHTML = html || '<li class="offer-empty">Press + to add units</li>';
    $("total-" + side).textContent = fmt(totalFor(side));
    $("clear-" + side).disabled = !entries.length;
    $("open-" + side).disabled = state.loading || !!state.error || !state.units.length;
    $("open-" + side).title = state.loading ? "Loading units" : !state.units.length ? "Add units to the database first" : "Add a unit";
  }
  $("tradingText").textContent = offerText("yours");
  $("lookingForText").textContent = offerText("theirs");
  const yoursInfo = offerBreakdown("yours");
  const theirsInfo = offerBreakdown("theirs");
  const yours = yoursInfo.base + yoursInfo.enchants;
  const theirs = theirsInfo.base + theirsInfo.enchants;
  $("comparisonYours").textContent = fmt(yours) + " tickets";
  $("comparisonTheirs").textContent = fmt(theirs) + " tickets";
  $("breakdownYours").textContent = "Base " + fmt(yoursInfo.base) + " + Enchants " +
    fmt(yoursInfo.enchants) + " = " + fmt(yours) + " tickets";
  $("breakdownTheirs").textContent = "Base " + fmt(theirsInfo.base) + " + Enchants " +
    fmt(theirsInfo.enchants) + " = " + fmt(theirs) + " tickets";
  const scale = Math.max(yours,theirs,1);
  $("compareBarYours").style.width = (100 * yours / scale).toFixed(2) + "%";
  $("compareBarTheirs").style.width = (100 * theirs / scale).toFixed(2) + "%";
  $("compareBarYours").setAttribute("aria-label", "Your offer: " + fmt(yours) + " tickets");
  $("compareBarTheirs").setAttribute("aria-label", "Their offer: " + fmt(theirs) + " tickets");
  const anyOffers = !!(state.offers.yours.length || state.offers.theirs.length);
  $("resetTrade").disabled = !anyOffers;
  $("swapOffers").disabled = !anyOffers;
  const panel = $("tradeResult");
  const differenceText = $("tradeDifference");
  panel.className = "trade-outcome-bar";
  if (!state.offers.yours.length || !state.offers.theirs.length) {
    panel.textContent = "ADD UNITS TO BOTH SIDES";
    differenceText.textContent = "Add at least one unit to both sides for a W/F/L result.";
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
      rarityBadge(unit.rarity) + '<small>' + fmt(unit.value) + ' tickets</small></button>';
  }).join("") : '<div class="picker-no-results">' +
    (state.units.length ? "No matching units found." : "No units available yet.") + '</div>';
  const unit = getUnit(pickerUnitId);
  const shiny = $("pickerShiny");
  const availableShiny = unit && canTradeShiny(unit);
  shiny.disabled = !availableShiny;
  if (!availableShiny) shiny.checked = false;
  $("pickerUnitName").textContent = unit ? unit.name : "Choose a unit above";
  const bonus = enchantBonus(pickerEnchantId);
  const base = unit ? Number(shiny.checked ? unit.shiny_value : unit.value) : 0;
  $("pickerUnitValue").textContent = unit ?
    (bonus > 0 ? fmt(base) + " base + " + fmt(bonus) + " enchant = " +
      fmt(base + bonus) + " tickets each" :
      fmt(base) + " tickets each" + (availableShiny ? " · shiny available" : "")) :
    "Select a unit to add it to your trade.";
  const quantity = Number($("pickerQty").value);
  $("pickerExtendedTotal").textContent = unit && Number.isInteger(quantity) && quantity >= 1 && quantity <= 99 ?
    "TOTAL: " + fmt((base + bonus) * quantity) + " tickets for x" + quantity :
    (unit ? "Enter a quantity from 1 to 99." : "");
  renderEnchantPicker();
  $("pickerConfirm").disabled = !unit || state.enchantsLoading ||
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
    ["#units", "#calculator", "#about", "#qa", "#history"].includes(hash) ? hash.slice(1) :
    (loginExpired ? "qa" : privateAdmin ? "admin" : params.get("qa") === "edit" ? "qa" : "home");
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
    renderUnits(); return;
  }
  const dropdownOption = event.target.closest("[data-filter-rarity]");
  if (dropdownOption) {
    state.rarity = dropdownOption.dataset.filterRarity;
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
    state.search = "";
    if (location.hash === "#units") renderUnits();
    else { location.hash = "#units"; route(); }
    return;
  }
  const shinyButton = event.target.closest("[data-shiny-id]");
  if (shinyButton && !shinyButton.disabled) {
    const id = shinyButton.dataset.shinyId;
    if (state.shinyCards.has(id)) state.shinyCards.delete(id);
    else state.shinyCards.add(id);
    renderUnits(); return;
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
    state.search = ""; state.rarity = "";
    if (location.hash === "#units") renderUnits();
  }
});
$("search").addEventListener("input", (e) => { state.search = e.target.value; renderUnits(); });
$("sort").addEventListener("change", (e) => { state.sort = e.target.value; renderUnits(); });
$("clearFilters").addEventListener("click", () => {
  state.search = ""; state.rarity = ""; state.sort = "name"; renderUnits();
});
$("refreshUnits").addEventListener("click", () => { loadUnits(); loadEnchants(); });
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
loadEnchants();
