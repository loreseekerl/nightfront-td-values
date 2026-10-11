// Nightfront value and demand trends. Uses recorded Supabase events only.
// Values and demand remain separate; snapshots alone never imply movement.
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (text) => String(text ?? "").replace(/[&<>"']/g, character => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[character]));
  const fmt = n => Number(n).toLocaleString("en-US",{maximumFractionDigits:2});
  const numeric = value => value === null || value === undefined || value === ""
    ? null : Number.isFinite(Number(value)) ? Number(value) : null;
  const ticketLabel = value => numeric(value) === null ? "N/A" : fmt(value) + " tickets";
  const demandScore = raw => {
    const match = String(raw ?? "").trim().match(/^(10|[1-9])\s*\/\s*10$/);
    return match ? Number(match[1]) : null;
  };
  const image = raw => {
    if (typeof raw !== "string" || !raw.trim()) return "";
    try {
      const parsed = new URL(raw,location.href);
      return ["https:","http:"].includes(parsed.protocol) ? parsed.href : "";
    } catch {return "";}
  };
  const dateText = value => {
    if (!value) return "";
    const parsed = new Date(value);
    return Number.isNaN(parsed.valueOf()) ? "" : parsed.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"});
  };
  const status = {
    up:{text:"Rising",icon:"↗",className:"up"},
    down:{text:"Dropping",icon:"↘",className:"down"},
    stable:{text:"Stable",icon:"→",className:"stable"},
    unknown:{text:"Not enough history",icon:"·",className:"unknown"}
  };
  const days = 30;
  const latestLimit = 1000;
  const state = {
    units:[], history:[], loaded:false,loading:false,error:"",
    startDate:null, map:new Map(), fetched:0
  };
  const classify = delta => delta > 0 ? "up" : delta < 0 ? "down" : "stable";

  function calculateTrend(events,kind,now,currentValue) {
    const cutoff = now - days * 86400000;
    // Start new units at Stable as an initial display status, not as a claimed
    // historical price movement. Genuine recorded updates override that label.
    const hasStartingRecord = events.some(event =>
      event.event_type === "baseline" || event.event_type === "created");
    const validCurrent = kind === "demand" ?
      demandScore(currentValue) !== null : numeric(currentValue) !== null;
    // A currently unavailable value has no meaningful current price direction.
    if (!validCurrent) return {status:"unknown",delta:null,lastChanged:null};
    const startingStatus = hasStartingRecord && validCurrent ?
      {status:"stable",delta:0,lastChanged:null,defaultStable:true} :
      {status:"unknown",delta:null,lastChanged:null};
    const updates = events.filter(event =>
      event.event_type === "updated" &&
      Number.isFinite(Date.parse(event.changed_at)) &&
      Date.parse(event.changed_at) >= cutoff &&
      Date.parse(event.changed_at) <= now);
    if (!updates.length) return startingStatus;
    let delta=0,observed=false,lastChanged=null;
    for(const entry of updates) {
      const oldValue = kind==="demand" ? demandScore(entry.old_demand) :
        numeric(kind==="shiny" ? entry.old_shiny_value : entry.old_value);
      const newValue = kind==="demand" ? demandScore(entry.new_demand) :
        numeric(kind==="shiny" ? entry.new_shiny_value : entry.new_value);
      if (oldValue===null || newValue===null) continue;
      observed=true;
      delta+=newValue-oldValue;
      if (oldValue!==newValue && (!lastChanged || entry.changed_at>lastChanged)) lastChanged=entry.changed_at;
    }
    return observed ? {status:classify(delta),delta,lastChanged,defaultStable:false} :
      startingStatus;
  }
  function compute() {
    const now=Date.now();
    const eventsById=new Map();
    for(const record of state.history) {
      if(!record.unit_id) continue;
      const id=String(record.unit_id);
      if(!eventsById.has(id)) eventsById.set(id,[]);
      eventsById.get(id).push(record);
    }
    const trends = new Map();
    for(const unit of state.units) {
      const events=eventsById.get(String(unit.id)) || [];
      trends.set(String(unit.id),{
        normal:calculateTrend(events,"normal",now,unit.value),
        shiny:calculateTrend(events,"shiny",now,unit.shiny_value),
        demand:calculateTrend(events,"demand",now,unit.demand),
        rating:demandScore(unit.demand),
        latest:events.length ? events[0]?.changed_at : null
      });
    }
    state.map=trends;
  }
  function badge(kind,trend) {
    const display=status[trend?.status || "unknown"];
    const label=kind==="value"?"Value":kind==="demand"?"Demand":"Shiny";
    const delta=trend?.delta;
    const changes=delta === null || !Number.isFinite(delta) ? "" :
      (delta===0 ? "" : " " + (delta>0?"+":"") + fmt(delta) + (kind==="demand"?"/10":""));
    const tooltip=(trend?.defaultStable ?
      "Starting status: Stable until a recorded change establishes movement" :
      display.text==="Not enough history" ?
      "No usable starting value or recorded history yet" :
      "Net recorded change over the last 30 days") + (changes ? " ("+changes+")":"");
    return '<span class="market-trend '+display.className+'" title="'+esc(tooltip)+'">' +
      '<span aria-hidden="true">'+display.icon+'</span> ' +
      esc(label)+": "+esc(display.text)+esc(changes)+'</span>';
  }
  // App.js uses this only to display trend badges on unit cards.
  function cardBadges(unit,shiny=false) {
    if(state.error && !state.loaded) return '<div class="unit-market-badges"><span class="market-trend unknown">· Trends unavailable</span></div>';
    if(!state.loaded) return '<div class="unit-market-badges"><span class="market-trend unknown">· Trends loading…</span></div>';
    const data=state.map.get(String(unit.id));
    return '<div class="unit-market-badges">' +
      badge(shiny?"shiny":"value",shiny?data?.shiny:data?.normal) +
      badge("demand",data?.demand) + "</div>";
  }
  const countOf=(field,which)=>state.units.filter(u=>
    state.map.get(String(u.id))?.[field]?.status===which).length;
  function renderStats() {
    $("trendsStats").innerHTML=[
      ["↗",countOf("normal","up"),"Rising values","up"],
      ["→",countOf("normal","stable"),"Stable values","stable"],
      ["↘",countOf("normal","down"),"Dropping values","down"],
      ["·",countOf("normal","unknown"),"Need more history","unknown"]
    ].map(([symbol,count,label,kind])=>
      '<div class="trends-stat '+kind+'"><span>'+symbol+'</span><strong>'+count+'</strong><small>'+label+'</small></div>'
    ).join("");
  }
  function render() {
    if(!state.loaded) return;
    renderStats();
    const query=$("trendsSearch").value.toLowerCase().trim();
    const valueFilter=$("trendsValueFilter").value;
    const demandFilter=$("trendsDemandFilter").value;
    const sort=$("trendsSort").value;
    const items=state.units.filter(unit=>{
      const trend=state.map.get(String(unit.id));
      return unit.name.toLowerCase().includes(query) &&
        (!valueFilter || trend?.normal.status === valueFilter) &&
        (!demandFilter || trend?.demand.status === demandFilter);
    });
    items.sort((a,b)=>{
      const av=state.map.get(String(a.id));
      const bv=state.map.get(String(b.id));
      if(sort==="demand") return (bv?.rating??-1)-(av?.rating??-1) || a.name.localeCompare(b.name);
      if(sort==="value") {
        const aa=numeric(a.value), bb=numeric(b.value);
        if(aa===null || bb===null) return aa===null && bb===null ?
          a.name.localeCompare(b.name) : aa===null ? 1 : -1;
        return bb-aa || a.name.localeCompare(b.name);
      }
      if(sort==="movement") return (bv?.normal.delta??-Infinity)-(av?.normal.delta??-Infinity) ||
        a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
    $("trendsCount").textContent=items.length+" unit"+(items.length===1?"":"s");
    const displayed=items.slice(0,80);
    if(!displayed.length) {
      $("trendsGrid").innerHTML='<div class="trends-empty">No units match these filters. Try another search or trend.</div>';
      return;
    }
    $("trendsGrid").innerHTML=displayed.map(unit=>{
      const trend=state.map.get(String(unit.id));
      const pic=image(unit.image_url);
      const score=trend?.rating;
      const demandPercent=score===null?0:Math.max(0,Math.min(100,score*10));
      return '<article class="trends-unit-card">' +
        '<div class="trends-unit-head">' +
        '<div class="trends-portrait">'+(pic?'<img loading="lazy" src="'+esc(pic)+'" alt="'+esc(unit.name)+' artwork">':'<span aria-hidden="true">★</span>')+'</div>' +
        '<div class="trends-unit-title"><strong>'+esc(unit.name)+'</strong><small>'+esc(unit.rarity)+'</small></div></div>' +
        '<div class="trends-ticket-values"><div><small>Normal</small><strong>'+ticketLabel(unit.value)+'</strong></div>'+
        '<div><small>Shiny</small><strong>'+ticketLabel(unit.shiny_value)+'</strong></div></div>' +
        '<div class="trends-demand-info"><div><span>DEMAND</span><strong>'+esc(unit.demand||"Unknown")+'</strong></div>' +
        '<div class="trends-demand-meter" role="img" aria-label="'+
        esc(score===null?"Demand score not rated from 1 to 10":"Demand rating "+score+" out of 10")+
        '"><span style="width:'+demandPercent+'%"></span></div></div>' +
        '<div class="trends-badges">'+badge("value",trend?.normal)+badge("shiny",trend?.shiny)+badge("demand",trend?.demand)+'</div>' +
        '<div class="trends-card-footer"><small>Last recorded: '+esc(dateText(trend?.latest)||"No history yet")+'</small>' +
        '<button type="button" data-trend-history="'+esc(unit.id)+'">View history ↗</button></div>' +
        '</article>';
    }).join("") + (items.length>displayed.length?'<p class="trends-more">Showing the first 80 matching units. Refine filters to see more.</p>':"");
  }
  function refreshCards() {
    if(typeof window.renderUnits === "function") window.renderUnits();
    if(typeof window.renderFeatured === "function") window.renderFeatured();
  }
  async function load() {
    if(state.loading) return;
    state.loading=true;
    $("trendsRefresh").disabled=true;
    $("trendsStatus").textContent="Loading value & demand trends…";
    $("trendsStatus").classList.add("is-loading");
    if(!state.loaded) $("trendsGrid").innerHTML =
      Array.from({length:6},()=>'<div class="trends-unit-skeleton" aria-hidden="true"></div>').join("");
    try {
      const base=SUPABASE_URL+"/rest/v1/";
      const headers={apikey:SUPABASE_PUBLISHABLE_KEY};
      const [unitResponse,histResponse]=await Promise.all([
        fetch(base+"units?select=id,name,rarity,value,shiny_value,demand,image_url&order=name.asc&limit=1000",{headers}),
        fetch(base+"unit_value_history?select=id,unit_id,event_type,old_value,new_value,old_shiny_value,new_shiny_value,old_demand,new_demand,changed_at&order=changed_at.desc&limit="+latestLimit,{headers})
      ]);
      if(!unitResponse.ok || !histResponse.ok) throw new Error("Supabase response "+(unitResponse.ok?histResponse.status:unitResponse.status));
      const [units,history]=await Promise.all([unitResponse.json(),histResponse.json()]);
      if(!Array.isArray(units)||!Array.isArray(history)) throw new Error("Invalid trends data");
      state.units=units;state.history=history;state.error="";
      state.loaded=true;state.fetched=history.length;
      compute();
      const partial=history.length>=latestLimit?" · newest "+latestLimit+" events only":"";
      $("trendsStatus").textContent="Live from Supabase · last 30 days · "+units.length+
        " units · "+history.length+" recorded history entries"+partial;
    } catch(e) {
      state.error=e?.message||"Could not load trends";
      $("trendsStatus").textContent="Couldn't refresh trends: "+state.error;
    } finally {
      state.loading=false;
      $("trendsRefresh").disabled=false;
      $("trendsStatus").classList.remove("is-loading");
      if(state.loaded) render();
      refreshCards();
    }
  }
  $("trendsSearch").addEventListener("input",render);
  $("trendsValueFilter").addEventListener("change",render);
  $("trendsDemandFilter").addEventListener("change",render);
  $("trendsSort").addEventListener("change",render);
  $("trendsRefresh").addEventListener("click",load);
  $("trendsGrid").addEventListener("click",event=>{
    const b=event.target.closest("[data-trend-history]");
    if (b) window.NightfrontHistory?.openUnit(b.dataset.trendHistory);
  });
  window.addEventListener("hashchange",()=>{
    if(location.hash==="#trends"&&!state.loaded) load();
    else if(location.hash==="#trends") render();
  });
  window.NightfrontTrends={cardBadges,refresh:load,getUnitTrend:id=>state.map.get(String(id)),_status:()=>state.loaded};
  // Always initialize once, so unit cards show accurate badges on first visit.
  load();
})();
