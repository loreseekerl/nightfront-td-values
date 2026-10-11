// Nightfront market extras: local watchlist, on-page value notifications,
// real-data leaderboards, and separate confirmed releases vs. site additions.
// No private database keys; never publish guesses as values or release dates.
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? "").replace(/[&<>"']/g,
    ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const fmt = v => Number(v).toLocaleString("en-US",{maximumFractionDigits:2});
  const known = v => v !== null && v !== undefined && v !== "" &&
    Number.isFinite(Number(v));
  const tickets = v => known(v) ? fmt(v)+" tickets" : "N/A";
  const demand = v => {
    const s=String(v ?? "").trim();
    return !s || /^(?:unknown|n\/?a)$/i.test(s) ? "N/A" : s;
  };
  const score = v => {
    const m=demand(v).match(/^(10(?:\.0+)?|[0-9](?:\.[0-9]+)?)\s*\/\s*10$/);
    return m ? Number(m[1]) : null;
  };
  const publishedStatus = (u,variant) => {
    const value=variant==="shiny"?u.shiny_value:u.value;
    if (!known(value)) return "N/A";
    return (variant==="shiny"?u.shiny_value_status:u.normal_value_status)==="Verified" ?
      "Verified" : "Estimated";
  };
  const rarityOrder=["Glitched","Secret","Mythic","Epic","Rare","Uncommon","Common"];
  const root=()=>typeof SUPABASE_URL==="string" ? SUPABASE_URL : "";
  const pub=()=>typeof SUPABASE_PUBLISHABLE_KEY==="string" ? SUPABASE_PUBLISHABLE_KEY : "";
  const keys={
    favorites:"nightfront-watchlist-v1",
    baseline:"nightfront-watch-baseline-v1",
    notices:"nightfront-watch-notices-v1"
  };
  function read(key,fallback){
    try{const value=JSON.parse(localStorage.getItem(key)||"null");return value===null?fallback:value;}
    catch{return fallback;}
  }
  function store(key,data){try{localStorage.setItem(key,JSON.stringify(data));}catch{/* Browsing remains usable with blocked storage. */}}
  const initialFavorites=read(keys.favorites,[]);
  const initialNotices=read(keys.notices,[]);
  const state={
    favorites:new Set(Array.isArray(initialFavorites)?
      initialFavorites.filter(v=>typeof v==="string").slice(0,250):[]),
    baselines:read(keys.baseline,{}),
    notices:Array.isArray(initialNotices)?initialNotices.slice(0,40):[],
    units:[],history:[],loaded:false,loading:false,lastChecked:0,
    desktopEnabled:false
  };
  if(!state.baselines || typeof state.baselines!=="object" ||
      Array.isArray(state.baselines)) state.baselines={};
  function unitPrice(u,variant){return variant==="shiny"?u.shiny_value:u.value;}
  function unitDemand(u,variant){return variant==="shiny"?u.shiny_demand:u.demand;}
  function currentView(u){return{
    normal:u.value == null ? null : String(u.value),
    shiny:u.shiny_value == null ? null : String(u.shiny_value),
    normalDemand:demand(u.demand),
    shinyDemand:demand(u.shiny_demand)
  }}
  function sendDesktop(message) {
    if(!state.desktopEnabled || !("Notification" in window) ||
      window.Notification.permission!=="granted")return;
    try{new window.Notification("Nightfront Values",{
      body:message,tag:"nightfront-watched-change",silent:true
    });}catch{/* UI alerts still work */}
  }
  function examineChanges(units){
    const lookup=new Map(units.map(u=>[String(u.id),u]));
    const changes=[];
    for(const id of state.favorites){
      const unit=lookup.get(id);
      if(!unit)continue;
      const now=currentView(unit),before=state.baselines[id];
      if(before && typeof before==="object"){
        for(const [field,label] of [
          ["normal","Normal value"],["shiny","Shiny value"],
          ["normalDemand","Normal demand"],["shinyDemand","Shiny demand"]
        ]){
          if(!Object.prototype.hasOwnProperty.call(before,field))continue;
          const oldValue=before[field],next=now[field];
          if(oldValue===next)continue;
          const show=x=>field.endsWith("Demand") ? demand(x) : tickets(x);
          const sentence=unit.name+" · "+label+" changed from "+show(oldValue)+
            " to "+show(next)+".";
          const change={id:String(unit.id)+":"+field+":"+Date.now(),
            unitId:String(unit.id),name:unit.name,text:sentence,at:new Date().toISOString()};
          changes.push(change);
        }
      }
      state.baselines[id]=now;
    }
    if(changes.length){
      state.notices=[...changes.reverse(),...state.notices].slice(0,40);
      store(keys.notices,state.notices);
      sendDesktop(changes[0].text+(changes.length>1?" + "+(changes.length-1)+" more change(s).":""));
    }
    store(keys.baseline,state.baselines);
  }
  async function load(force=false){
    if(state.loading)return;
    if(state.loaded && !force){renderAll();return;}
    state.loading=true;
    for(const id of ["watchlistRefresh","rankingsRefresh"])if($(id))$(id).disabled=true;
    const status=$("watchlistStatus");
    if(status)status.textContent="Checking Nightfront's live values…";
    try{
      const headers={apikey:pub()};
      const base=root()+"/rest/v1/";
      const [unitResult,histResult]=await Promise.all([
        fetch(base+"units?select=id,name,rarity,value,shiny_value,demand,shiny_demand,image_url,shiny_image_url,normal_value_status,shiny_value_status,created_at,released_on,updated_at&order=created_at.desc&limit=1000",
          {headers,cache:"no-store"}),
        fetch(base+"unit_value_history?select=unit_id,event_type,old_value,new_value,old_shiny_value,new_shiny_value,changed_at&order=changed_at.desc&limit=1500",
          {headers,cache:"no-store"})
      ]);
      if(!unitResult.ok)throw Error("Unit data unavailable ("+unitResult.status+")");
      const units=await unitResult.json();
      if(!Array.isArray(units))throw Error("Invalid unit list");
      await window.NightfrontArt?.hydrate?.(units);
      const history=histResult.ok?await histResult.json().catch(()=>[]):[];
      state.units=units;
      state.history=Array.isArray(history)?history:[];
      examineChanges(units);
      state.loaded=true;state.lastChecked=Date.now();
      renderAll();
      if(status)status.textContent="Checked "+units.length+" live units · "+
        state.favorites.size+" watched · "+state.notices.length+" saved alert(s).";
    }catch(error){
      if(status)status.textContent="Couldn't refresh values: "+(error.message||error)+
        ". Existing saved units are still on this device.";
      if($("rankingsStatus"))$("rankingsStatus").textContent="Could not refresh leaderboards. Try again.";
      if($("releasesStatus"))$("releasesStatus").textContent="Could not refresh new units. Try again.";
      if(state.loaded)renderAll();
    }finally{
      state.loading=false;
      for(const id of ["watchlistRefresh","rankingsRefresh"])if($(id))$(id).disabled=false;
    }
  }
  function save(id){
    const str=String(id||"");
    const u=state.units.find(u=>String(u.id)===str) ||
      (typeof state!=="undefined"&&Array.isArray(state.units) ? null : null);
    if(!u && state.loaded)return;
    if(state.favorites.has(str)){
      state.favorites.delete(str);
      delete state.baselines[str];
    } else {
      state.favorites.add(str);
      if(u)state.baselines[str]=currentView(u);
    }
    store(keys.favorites,[...state.favorites]);
    store(keys.baseline,state.baselines);
    renderAll();
    // Main All Units renders from its own state; redraw to update save icons.
    if(typeof renderUnits==="function")renderUnits();
  }
  const isSaved=id=>state.favorites.has(String(id));
  function unitArt(u){
    const raw=u?.image_url;
    if(typeof raw==="string" && /^(https:\/\/|\.\/)/i.test(raw))
      return '<img src="'+esc(raw)+'" alt="'+esc(u.name)+' artwork" loading="lazy">';
    return '<span class="nf-mini-noart" aria-label="Unit artwork pending">✦</span>';
  }
  function miniCard(u,subtitle,detail,controls=false){
    const label=demand(u.demand),shinyLabel=demand(u.shiny_demand);
    return '<article class="nf-mini-unit">'+
      '<div class="nf-mini-art">'+unitArt(u)+'</div>'+
      '<div class="nf-mini-details"><div class="nf-mini-top"><strong>'+esc(u.name)+'</strong>'+
       '<span class="nf-mini-rarity nf-rarity-'+esc(u.rarity.toLowerCase())+'">'+esc(u.rarity)+'</span>'+
       (typeof upcomingBadge === "function" ? upcomingBadge(u) : '')+'</div>'+
      (typeof isUpcomingUnit === "function" && isUpcomingUnit(u) ?
        '<p class="unit-release-note">Release date not confirmed. Listed values are estimates.</p>' : '')+
      '<p class="nf-mini-subtitle">'+esc(subtitle)+'</p>'+
      '<div class="nf-mini-stats"><span>Normal <b>'+esc(tickets(u.value))+'</b><small>'+
        esc(demand(u.demand))+' demand</small></span>'+
        '<span>Shiny ★ <b>'+esc(tickets(u.shiny_value))+'</b><small>'+
        esc(shinyLabel)+' demand</small></span></div>'+
      (detail?'<p class="nf-mini-extra">'+esc(detail)+'</p>':'')+
      (controls?'<button class="nf-tool-button nf-mini-remove" type="button" data-watch-toggle="'+esc(u.id)+
        '">★ REMOVE FROM WATCHLIST</button>':'')+
      '</div></article>';
  }
  function renderWatchlist(){
    if(!$("watchlistUnits"))return;
    const items=[...state.favorites].map(id=>state.units.find(u=>String(u.id)===id)).filter(Boolean);
    $("watchlistUnits").innerHTML=items.length ?
      items.map(u=>miniCard(u,"WATCHED UNIT",
        "Normal "+publishedStatus(u,"normal")+" · Shiny "+publishedStatus(u,"shiny"),true)).join("") :
      '<div class="nf-tool-empty">No units saved yet. Go to <a href="#units">All Units</a> and press ☆ SAVE on any unit.</div>';
    $("watchlistAlerts").innerHTML=state.notices.length ?
      state.notices.map(n=>'<div class="nf-change-notice"><span>CHANGE DETECTED · '+
        esc(new Date(n.at).toLocaleString())+'</span><p>'+esc(n.text)+'</p></div>').join("") :
      '<div class="nf-tool-empty">No watched-unit changes recorded in this browser yet.</div>';
    $("watchlistNotify").textContent=state.desktopEnabled?
      "DESKTOP ALERTS ON":"ENABLE DESKTOP ALERTS (WHILE OPEN)";
  }
  function latestMovers(variant,direction){
    const keyOld=variant==="shiny"?"old_shiny_value":"old_value";
    const keyNew=variant==="shiny"?"new_shiny_value":"new_value";
    const cutoff=Date.now()-30*86400000;
    const group=new Map();
    for(const entry of state.history){
      if(entry.event_type!=="updated" ||
        !entry.unit_id || !known(entry[keyOld]) || !known(entry[keyNew]) ||
        Number(entry[keyOld])===Number(entry[keyNew]) ||
        Date.parse(entry.changed_at)<cutoff)continue;
      const id=String(entry.unit_id);
      if(!group.has(id))group.set(id,[]);
      group.get(id).push(entry);
    }
    const output=[];
    for(const u of state.units){
      const rows=group.get(String(u.id));
      if(!rows?.length || !known(unitPrice(u,variant)))continue;
      rows.sort((a,b)=>Date.parse(a.changed_at)-Date.parse(b.changed_at));
      const delta=Number(rows[rows.length-1][keyNew])-Number(rows[0][keyOld]);
      if(direction==="rise"&&delta<=0 || direction==="fall"&&delta>=0)continue;
      output.push({unit:u,metric:Math.abs(delta),delta});
    }
    return output.sort((a,b)=>b.metric-a.metric || a.unit.name.localeCompare(b.unit.name)).slice(0,10);
  }
  function rankingRecords(){
    const kind=$("rankingCategory").value,variant=$("rankingVariant").value;
    if(kind==="rise"||kind==="fall")return latestMovers(variant,kind);
    return state.units.map(u=>{
      const raw=kind==="value"?unitPrice(u,variant):unitDemand(u,variant);
      const metric=kind==="value"?(known(raw)?Number(raw):null):score(raw);
      return {unit:u,metric};
    }).filter(x=>x.metric!==null).sort((a,b)=>b.metric-a.metric ||
      rarityOrder.indexOf(a.unit.rarity)-rarityOrder.indexOf(b.unit.rarity) ||
      a.unit.name.localeCompare(b.unit.name)).slice(0,10);
  }
  function renderRankings(){
    if(!$("rankingsList"))return;
    const variant=$("rankingVariant").value,kind=$("rankingCategory").value;
    const items=rankingRecords();
    $("rankingsStatus").textContent=kind==="rise"||kind==="fall"?
      "Based on actual changes recorded during the last 30 days. Missing prices and baseline entries are excluded.":
      "Based on the live "+variant+" "+(kind==="demand"?"demand rating":"ticket value")+
        ". Only published numbers can be ranked.";
    $("rankingsList").innerHTML=items.length?
      items.map((entry,i)=>'<article class="nf-ranked-entry">'+
        '<span class="nf-rank-number">'+String(i+1).padStart(2,"0")+'</span>'+
        '<div class="nf-ranked-art">'+unitArt(entry.unit)+'</div>'+
        '<div class="nf-ranked-info"><strong>'+esc(entry.unit.name)+'</strong>'+
        '<small>'+esc(entry.unit.rarity)+' · '+variant.toUpperCase()+' · '+
        esc(publishedStatus(entry.unit,variant))+'</small></div>'+
        '<strong class="nf-rank-value">'+esc(kind==="value"?fmt(entry.metric)+" tickets":
          kind==="demand"?fmt(entry.metric)+"/10":
          (entry.delta>0?"+":"−")+fmt(entry.metric)+" tickets")+'</strong>'+
        '</article>').join(""):
      '<div class="nf-tool-empty">No qualified units or verified history yet for this leaderboard. N/A values are excluded.</div>';
  }
  function renderReleases(){
    if(!$("releasesListings"))return;
    const trueReleases=state.units.filter(u=>/^\d{4}-\d{2}-\d{2}$/.test(u.released_on||"") &&
      !(typeof isUpcomingUnit === "function" && isUpcomingUnit(u)))
      .sort((a,b)=>b.released_on.localeCompare(a.released_on)).slice(0,18);
    $("releasesConfirmed").innerHTML=trueReleases.length ?
      trueReleases.map(u=>miniCard(u,"CONFIRMED IN-GAME RELEASE",
        "Game release: "+u.released_on)).join("") :
      '<div class="nf-tool-empty">No owner-confirmed in-game release dates are listed yet. This section will fill in when actual dates are entered.</div>';
    const latest=state.units.filter(u=>Number.isFinite(Date.parse(u.created_at)))
      .sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)).slice(0,18);
    $("releasesListings").innerHTML=latest.length?
      latest.map(u=>miniCard(u,"ADDED TO THIS WEBSITE",
        "Listed: "+new Date(u.created_at).toLocaleDateString())).join(""):
      '<div class="nf-tool-empty">No dated unit listings yet.</div>';
    $("releasesStatus").textContent=state.units.length+
      " website listings · "+trueReleases.length+" displayed confirmed releases · "+
      latest.length+" recent site additions.";
  }
  function renderAll(){
    renderWatchlist();renderRankings();renderReleases();
    const count=$("nfWatchedCount");
    if(count)count.textContent=String(state.favorites.size);
  }
  document.addEventListener("click",event=>{
    const button=event.target.closest("[data-watch-toggle]");
    if(button){
      event.preventDefault();
      save(button.dataset.watchToggle);
    }
  });
  $("watchlistRefresh").addEventListener("click",()=>load(true));
  $("rankingsRefresh").addEventListener("click",()=>load(true));
  $("rankingCategory").addEventListener("change",renderRankings);
  $("rankingVariant").addEventListener("change",renderRankings);
  $("watchlistClearAlerts").addEventListener("click",()=>{
    state.notices=[];store(keys.notices,[]);renderWatchlist();
  });
  $("watchlistNotify").addEventListener("click",async()=>{
    if(!("Notification" in window)){
      $("watchlistStatus").textContent="Desktop notifications aren't supported here. On-page alerts still work.";
      return;
    }
    if(window.Notification.permission==="granted"){
      state.desktopEnabled=!state.desktopEnabled;renderWatchlist();return;
    }
    try{
      const permission=await window.Notification.requestPermission();
      state.desktopEnabled=permission==="granted";
      renderWatchlist();
      $("watchlistStatus").textContent=state.desktopEnabled?
        "Desktop notifications enabled while this website is open.":
        "Desktop notification permission wasn't granted. On-page alerts remain available.";
    }catch{$("watchlistStatus").textContent="On-page alerts remain available.";}
  });
  window.addEventListener("hashchange",()=>{
    if(["#watchlist","#rankings","#releases"].includes(location.hash))load();
  });
  window.addEventListener("focus",()=>{
    if(state.loaded&&Date.now()-state.lastChecked>5*60*1000)load(true);
  });
  window.NightfrontExtras={
    isSaved,toggleSaved:save,refresh:()=>load(true),valueStatus:publishedStatus,
    onUnitData:units=>{if(Array.isArray(units)&&units.length && !state.loaded){
      state.units=units;renderAll();
    }}
  };
  renderAll();
  // Reflect saved stars immediately if the All Units script loaded before this one.
  if(typeof renderUnits==="function")renderUnits();
  load();
})();
