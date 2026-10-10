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
  if (!(target instanceof HTMLImageElement) || !target.closest(".unit-art, .category-art, .spotlight-art")) return;
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
    const res = await fetch(SUPABASE_URL + "/rest/v1/units?select=id,name,rarity,category,value,shiny_value,demand,image_url,created_at&order=created_at.desc&limit=1000", {
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
  }
}

function renderCategories() {
  const grid = $("categories");
  grid.innerHTML = CATEGORIES.map((category) => {
    const representative = state.units.find((unit) => categoryOf(unit) === category.name && validImage(unit.image_url));
    return '<button type="button" class="category-tile" data-category="' + escapeHtml(category.name) + '">' +
      '<span class="category-art" style="--accent:' + category.accent + ';--glow:' + category.glow + '">' +
      (representative ? imageHtml(representative) : '<span class="category-symbol" aria-hidden="true">' + category.symbol + '</span><span class="mini-stars" aria-hidden="true">✧</span>') +
      '</span><span class="category-name">' + escapeHtml(category.name) + '</span></button>';
  }).join("");
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
  $("categoryFilter").value = state.category;
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

function renderCalculator() {
  for (const side of ["yours", "theirs"]) {
    const select = $("pick-" + side);
    const selected = select.value;
    select.innerHTML = '<option value="">Choose a unit…</option>' +
      state.units.map((unit) => '<option value="' + escapeHtml(unit.id) + '">' + escapeHtml(unit.name) + '</option>').join("");
    if (state.units.some((unit) => String(unit.id) === selected)) select.value = selected;
    $("add-" + side).disabled = !state.units.length;
    const lines = $("items-" + side);
    const entries = state.offers[side];
    lines.innerHTML = entries.length ? entries.map((entry) => {
      const unit = state.units.find((u) => u.id === entry.unitId);
      if (!unit) return "";
      const value = Number(entry.shiny ? unit.shiny_value : unit.value) * entry.qty;
      return '<li class="trade-line"><div><strong>' + escapeHtml(unit.name) + (entry.shiny ? ' ★' : '') +
        ' × ' + entry.qty + '</strong><small>' + fmt(value) + ' tickets</small></div>' +
        '<button type="button" class="remove-btn" data-remove="' + entry.id +
        '" data-side="' + side + '" aria-label="Remove ' + escapeHtml(unit.name) + '">Remove</button></li>';
    }).join("") : '<li style="color:#8791a5;font-size:13px;padding:18px 0">No units added yet.</li>';
    $("total-" + side).textContent = fmt(totalFor(side));
  }
  const yours = totalFor("yours"), theirs = totalFor("theirs");
  const panel = $("tradeResult");
  if (!state.offers.yours.length || !state.offers.theirs.length) {
    panel.className = "trade-result";
    panel.innerHTML = '<h2>READY TO COMPARE</h2><p>Add at least one unit to each side to check the trade.</p>';
    return;
  }
  const diff = Math.abs(theirs - yours);
  const result = theirs > yours ? ["WIN", "win", "You gain " + fmt(diff) + " tickets."] :
    theirs < yours ? ["LOSS", "loss", "You give " + fmt(diff) + " more tickets."] :
    ["FAIR", "fair", "Both sides have the same ticket value."];
  panel.className = "trade-result " + result[1];
  panel.innerHTML = '<span class="eyebrow">Trade outcome</span><h2>' + result[0] +
    '</h2><p>' + escapeHtml(result[2]) + ' Values are estimates; demand matters too.</p>';
}

function totalFor(side) {
  return state.offers[side].reduce((total, entry) => {
    const unit = state.units.find((u) => u.id === entry.unitId);
    if (!unit) return total;
    return total + Number(entry.shiny ? unit.shiny_value : unit.value) * entry.qty;
  }, 0);
}
function addTradeItem(side) {
  const id = $("pick-" + side).value;
  const unit = state.units.find((u) => String(u.id) === id);
  const qty = Number($("qty-" + side).value);
  const shiny = $("shiny-" + side).checked;
  if (!unit) return alert("Choose a unit first.");
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) return alert("Quantity must be between 1 and 99.");
  if (!hasValue(shiny ? unit.shiny_value : unit.value)) return alert("This unit doesn't have a listed " + (shiny ? "shiny " : "") + "value yet.");
  state.offers[side].push({ id: state.nextItemId++, unitId: unit.id, qty, shiny });
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
  const spotlightButton = event.target.closest("[data-spotlight-id]");
  if (spotlightButton) {
    const unit = state.units.find((item) => String(item.id) === spotlightButton.dataset.spotlightId);
    if (unit) {
      state.search = unit.name;
      state.category = "";
      state.rarity = "";
    }
  }
  const rarityFilterButton = event.target.closest("[data-rarity-filter]");
  if (rarityFilterButton) {
    const chosen = rarityFilterButton.dataset.rarityFilter;
    state.rarity = state.rarity === chosen ? "" : chosen;
    renderUnits();
  }
  const categoryButton = event.target.closest("[data-category]");
  if (categoryButton) {
    state.category = categoryButton.dataset.category;
    location.hash = "#units";
    route();
  }
  const shinyButton = event.target.closest("[data-shiny-id]");
  if (shinyButton && !shinyButton.disabled) {
    const id = shinyButton.dataset.shinyId;
    if (state.shinyCards.has(id)) state.shinyCards.delete(id);
    else state.shinyCards.add(id);
    renderUnits();
  }
  const remove = event.target.closest("[data-remove]");
  if (remove && ["yours","theirs"].includes(remove.dataset.side)) {
    state.offers[remove.dataset.side] = state.offers[remove.dataset.side].filter((entry) => String(entry.id) !== remove.dataset.remove);
    renderCalculator();
  }
  if (event.target.closest("[data-all-units]")) {
    state.category = "";
    state.search = "";
    state.rarity = "";
    if (location.hash === "#units") renderUnits();
  }
});
$("search").addEventListener("input", (e) => { state.search = e.target.value; renderUnits(); });
$("rarity").addEventListener("change", (e) => { state.rarity = e.target.value; renderUnits(); });
$("categoryFilter").addEventListener("change", (e) => { state.category = e.target.value; renderUnits(); });
$("sort").addEventListener("change", (e) => { state.sort = e.target.value; renderUnits(); });
$("clearFilters").addEventListener("click", () => {
  state.search = ""; state.rarity = ""; state.category = ""; state.sort = "name"; renderUnits();
});
$("refreshUnits").addEventListener("click", loadUnits);
for (const side of ["yours", "theirs"]) {
  $("add-" + side).addEventListener("click", () => addTradeItem(side));
}
$("menuToggle").addEventListener("click", () => {
  const open = $("nav").classList.toggle("open");
  $("menuToggle").setAttribute("aria-expanded", String(open));
});
window.addEventListener("hashchange", route);
renderCategories();
route();
loadUnits();
