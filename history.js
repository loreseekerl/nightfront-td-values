// Public value history: snapshots are written by Supabase triggers, never by visitors.
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, ch =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const fmt = (value) => Number(value).toLocaleString("en-US",{maximumFractionDigits:2});
  const snapshot = (value) => value === null || value === undefined ? "N/A" : fmt(value) + " tickets";
  const demandText = value => {
    const label=String(value ?? "").trim();
    return !label || /^(unknown|n\/?a)$/i.test(label) ? "N/A" : label;
  };
  const date = (value) => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "Unknown date" :
      parsed.toLocaleString(undefined,{year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
  };
  const state = {rows:[],selected:"",type:"",loaded:false,loading:false,error:""};
  const keyOf = (entry) => entry.unit_id || "name:" + entry.unit_name.toLowerCase();

  function renderOptions() {
    const select = $("historyUnitFilter");
    const names = new Map();
    for (const entry of state.rows) {
      const key = keyOf(entry);
      if (!names.has(key)) names.set(key,entry.unit_name);
    }
    const ordered = [...names].sort((a,b)=>a[1].localeCompare(b[1]));
    select.innerHTML = '<option value="">All units</option>' +
      ordered.map(([id,name])=>'<option value="' + escape(id) + '">' + escape(name) + '</option>').join("");
    if (!names.has(state.selected)) state.selected = "";
    select.value = state.selected;
  }
  function changed(entry,type) {
    if (entry.event_type !== "updated") {
      if (type === "shiny") return entry.new_shiny_value !== null;
      return true;
    }
    if (type === "normal") return entry.old_value !== entry.new_value;
    if (type === "shiny") return entry.old_shiny_value !== entry.new_shiny_value;
    if (type === "demand") return entry.old_demand !== entry.new_demand;
    if (type === "shiny-demand") return entry.old_shiny_demand !== entry.new_shiny_demand;
    return true;
  }
  const filteredRows = () => state.rows.filter(row =>
    (!state.selected || keyOf(row) === state.selected) &&
    (!state.type || changed(row,state.type))
  );
  function transition(oldValue,newValue,base=false) {
    if (base) return '<span class="history-current-value">' + escape(snapshot(newValue)) + '</span>';
    const before = snapshot(oldValue);
    const after = snapshot(newValue);
    const delta = oldValue != null && newValue != null ? Number(newValue) - Number(oldValue) : null;
    const cl = delta === null ? "history-neutral" : delta > 0 ? "history-up" : delta < 0 ? "history-down" : "history-neutral";
    const label = delta === null ? "" : ' <span class="' + cl + '">(' +
      (delta > 0 ? "+" : "") + fmt(delta) + ')</span>';
    return '<span class="history-before">' + escape(before) + '</span><span class="history-arrow">→</span>' +
      '<strong>' + escape(after) + '</strong>' + label;
  }
  function eventChanges(row) {
    const baseline = row.event_type !== "updated";
    const changes = [];
    if (baseline || row.old_value !== row.new_value) {
      changes.push('<div class="history-change-row"><span>Normal tickets</span><div>' +
        transition(row.old_value,row.new_value,baseline) + '</div></div>');
    }
    if ((baseline && row.new_shiny_value !== null) ||
        (!baseline && row.old_shiny_value !== row.new_shiny_value)) {
      changes.push('<div class="history-change-row"><span>Shiny value</span><div>' +
        transition(row.old_shiny_value,row.new_shiny_value,baseline) + '</div></div>');
    }
    if (baseline || row.old_demand !== row.new_demand) {
      const val = baseline
        ? '<span class="history-current-value">' + escape(demandText(row.new_demand)) + '</span>'
        : '<span class="history-before">' + escape(demandText(row.old_demand)) +
          '</span><span class="history-arrow">→</span><strong>' +
          escape(demandText(row.new_demand)) + '</strong>';
      changes.push('<div class="history-change-row"><span>Normal demand</span><div>' + val + '</div></div>');
    }
    if (baseline || row.old_shiny_demand !== row.new_shiny_demand) {
      const val = baseline
        ? '<span class="history-current-value">' + escape(demandText(row.new_shiny_demand)) + '</span>'
        : '<span class="history-before">' + escape(demandText(row.old_shiny_demand)) +
          '</span><span class="history-arrow">→</span><strong>' +
          escape(demandText(row.new_shiny_demand)) + '</strong>';
      changes.push('<div class="history-change-row"><span>Shiny demand ★</span><div>' + val + '</div></div>');
    }
    return changes.join("");
  }
  function renderTimeline(rows) {
    $("historyResultCount").textContent = rows.length + " recorded " + (rows.length === 1 ? "entry" : "entries");
    if (!rows.length) {
      $("historyTimeline").innerHTML = '<div class="history-empty">No recorded changes match these filters.</div>';
      return;
    }
    $("historyTimeline").innerHTML = rows.map(row => {
      const baseline = row.event_type === "baseline";
      const title = baseline ? "TRACKING STARTED" :
        row.event_type === "created" ? "UNIT ADDED" : "VALUE UPDATED";
      return '<article class="history-entry"><div class="history-entry-header">' +
        '<div><button type="button" class="history-unit-name" data-history-select="' +
        escape(keyOf(row)) + '">' + escape(row.unit_name) + '</button>' +
        '<span class="history-rarity">' + escape(row.rarity) + '</span></div>' +
        '<time datetime="' + escape(row.changed_at) + '">' + escape(date(row.changed_at)) + '</time>' +
        '</div><div class="history-event-type ' + (baseline ? "is-baseline" : "") +
        '">' + title + '</div>' +
        '<div class="history-changes">' + eventChanges(row) + '</div>' +
        (baseline ? '<p class="history-baseline-note">This is the first recorded snapshot, not a past price change.</p>' : "") +
        '</article>';
    }).join("");
  }
  function makeChart(rows) {
    const chartSection = $("historyChartSection");
    chartSection.hidden = !state.selected;
    if (!state.selected) return;
    const all = state.rows.filter(r=>keyOf(r)===state.selected).slice().reverse();
    const name = all[0]?.unit_name || "Unit";
    $("historyChartTitle").textContent = name.toUpperCase() + " · TICKET HISTORY";
    if (!all.length) { $("historyChart").textContent = "No recorded history for this unit."; return; }
    const data = all.map(r=>({
      normal:r.new_value == null ? null : Number(r.new_value),
      shiny:r.new_shiny_value == null ? null : Number(r.new_shiny_value),
      date:r.changed_at
    }));
    const allValues = data.flatMap(r => [
      ...(r.normal === null ? [] : [r.normal]),
      ...(r.shiny === null ? [] : [r.shiny])
    ]);
    const max = Math.max(...allValues,1);
    const min = Math.min(0,...allValues);
    const W=800,H=250, left=68,right=24,top=24,bottom=52;
    const x = i => left + (data.length===1 ? (W-left-right)/2 : (W-left-right)*i/(data.length-1));
    const y = v => top + (max-v)/(max-min||1)*(H-top-bottom);
    const yTicks = [0,.25,.5,.75,1].map(t=>{
      const value=min+(max-min)*t;
      return '<line x1="' + left + '" x2="' + (W-right) + '" y1="' + y(value).toFixed(1) +
        '" y2="' + y(value).toFixed(1) + '" stroke="#35405a" stroke-dasharray="4 7"/>' +
        '<text x="' + (left-12) + '" y="' + (y(value)+4).toFixed(1) +
        '" text-anchor="end" fill="#a3b3d1" font-size="13">' + fmt(value) + '</text>';
    }).join("");
    const series = (name,color) => {
      const points = data.map((d,i)=>d[name] === null ? null : {x:x(i),y:y(d[name]),v:d[name],time:d.date});
      // Split both normal and shiny paths where values are N/A rather than inventing zeroes.
      let parts=[],part=[];
      for (const p of points) {
        if (!p) {if(part.length)parts.push(part);part=[];} else part.push(p);
      }
      if (part.length) parts.push(part);
      return parts.map(points=>{
        const line = points.length<2 ? "" :
          '<polyline fill="none" stroke="' + color + '" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="' +
          points.map(p=>p.x.toFixed(1)+","+p.y.toFixed(1)).join(" ") + '"/>';
        return line + points.map(p=>'<circle cx="' + p.x.toFixed(1) +
          '" cy="' + p.y.toFixed(1) + '" r="5" fill="' + color + '" stroke="#080e1c" stroke-width="2">' +
          '<title>' + escape(name==="normal"?"Normal":"Shiny") + ": " + fmt(p.v) +
          ' tickets · ' + escape(date(p.time)) + '</title></circle>').join("");
      }).join("");
    };
    const labels = '<text x="' + left + '" y="' + (H-16) + '" fill="#96a4c0" font-size="13">' +
      escape(date(data[0].date).split(",")[0]) + '</text><text x="' + (W-right) +
      '" y="' + (H-16) + '" text-anchor="end" fill="#96a4c0" font-size="13">' +
      escape(date(data[data.length-1].date).split(",")[0]) + '</text>';
    $("historyChart").innerHTML = '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Recorded ticket values for normal and shiny versions of '+
      escape(name)+'" xmlns="http://www.w3.org/2000/svg">' + yTicks +
      series("normal","#4dd7ff") + series("shiny","#c788ff") + labels + '</svg>';
  }
  function render() {
    renderOptions();
    state.type = $("historyTypeFilter").value;
    const rows = filteredRows();
    $("historyStats").innerHTML =
      '<div class="history-stat"><strong>' + state.rows.length +
      '</strong><small>Latest recorded entries</small></div>' +
      '<div class="history-stat"><strong>' + new Set(state.rows.map(keyOf)).size +
      '</strong><small>Units tracked</small></div>' +
      '<div class="history-stat"><strong>' + state.rows.filter(r=>r.event_type==="updated").length +
      '</strong><small>Actual changes recorded</small></div>';
    renderTimeline(rows);
    makeChart(rows);
  }
  async function load() {
    if (state.loading) return;
    state.loading = true;
    $("historyRefresh").disabled = true;
    $("historyStatus").textContent = "Loading history from Supabase…";
    $("historyStatus").classList.add("is-loading");
    if (!state.loaded) $("historyTimeline").innerHTML = '<div class="history-entry-skeleton" aria-hidden="true"></div><div class="history-entry-skeleton" aria-hidden="true"></div><div class="history-entry-skeleton" aria-hidden="true"></div>';
    try {
      const response = await fetch(SUPABASE_URL +
        "/rest/v1/unit_value_history?select=id,unit_id,unit_name,rarity,event_type,old_value,new_value,old_shiny_value,new_shiny_value,old_demand,new_demand,old_shiny_demand,new_shiny_demand,changed_at" +
        "&order=changed_at.desc&limit=400", {headers: {apikey:SUPABASE_PUBLISHABLE_KEY}});
      if (!response.ok) throw new Error("History request failed (" + response.status + ")");
      const entries = await response.json();
      if (!Array.isArray(entries)) throw new Error("Unexpected history response");
      state.rows = entries;
      state.error = "";
      state.loaded = true;
      $("historyStatus").textContent = "History updated · showing the newest " + entries.length +
        " recorded entries" + (entries.length>=400 ? " (latest 400 only)" : "") + ".";
      render();
    } catch(error) {
      state.error = error.message || "History is unavailable.";
      $("historyStatus").textContent = "Could not load history: " + state.error;
      if (!state.loaded) $("historyTimeline").textContent = "Please try Refresh history.";
    } finally {
      state.loading = false;
      $("historyRefresh").disabled = false;
      $("historyStatus").classList.remove("is-loading");
    }
  }
  function openUnit(id) {
    state.selected = String(id);
    $("historyUnitFilter").value = state.selected;
    if (location.hash !== "#history") location.hash = "#history";
    if (!state.loaded) load();
    else render();
  }
  function openAll() {
    state.selected = "";
    if (location.hash !== "#history") location.hash = "#history";
    if (!state.loaded) load();
    else render();
  }
  $("historyRefresh").addEventListener("click",load);
  $("historyUnitFilter").addEventListener("change",event=>{
    state.selected = event.target.value;
    render();
  });
  $("historyTypeFilter").addEventListener("change",render);
  $("historyTimeline").addEventListener("click",event=>{
    const button = event.target.closest("[data-history-select]");
    if (button) openUnit(button.dataset.historySelect);
  });
  document.addEventListener("click",event=>{
    const link = event.target.closest('a[href="#history"]');
    if (link) openAll();
  });
  window.addEventListener("hashchange",()=>{
    if (location.hash==="#history") {
      if (!state.loaded) load(); else render();
    }
  });
  window.NightfrontHistory = {openUnit,openAll,refresh:load};
  if (location.hash==="#history") load();
})();
