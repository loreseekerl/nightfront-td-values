// Nightfront public changelog. All events come from Supabase triggers.
// No website visitor can publish or modify an update from this page.
(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g,
    ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const fmt = value => Number(value).toLocaleString("en-US",{maximumFractionDigits:2});
  const tickets = value => value == null ? "Not listed" : fmt(value) + " tickets";
  const numberChanged = (a,b) => a === null || b === null
    ? a !== b : Number(a) !== Number(b);
  const labels = {
    "unit-added":{name:"NEW UNIT",style:"unit-added",symbol:"+"},
    "unit-value":{name:"VALUE CHANGE",style:"unit-value",symbol:"↗"},
    "unit-demand":{name:"DEMAND CHANGE",style:"unit-demand",symbol:"↗"},
    "enchant-added":{name:"NEW ENCHANT",style:"enchant-added",symbol:"+"},
    "enchant":{name:"ENCHANT UPDATED",style:"enchant",symbol:"✦"},
    "baseline":{name:"TRACKING STARTED",style:"baseline",symbol:"·"}
  };
  const limitPerSource = {units:400,enchants:250};
  const state = {events:[],loaded:false,loading:false,error:"",visible:18,capped:false,updatedAt:null};

  function category(entry) {
    if (entry.event_type === "baseline") return "baseline";
    if (entry.kind === "enchant") return entry.event_type === "created" ? "enchant-added" : "enchant";
    if (entry.event_type === "created") return "unit-added";
    return numberChanged(entry.old_value,entry.new_value) ||
      numberChanged(entry.old_shiny_value,entry.new_shiny_value) ? "unit-value" : "unit-demand";
  }
  const changesDemand = entry => entry.kind === "unit" && entry.event_type === "updated" &&
    entry.old_demand !== entry.new_demand;
  const changesValue = entry => entry.kind === "unit" && entry.event_type === "updated" &&
    (numberChanged(entry.old_value,entry.new_value) ||
     numberChanged(entry.old_shiny_value,entry.new_shiny_value));
  const asNumber = v => v === null || v === undefined || v === "" ? null : Number(v);

  function ticketDifference(before,after) {
    if (before == null || after == null) return "";
    const diff=Number(after)-Number(before);
    if(!diff) return "";
    return '<span class="updates-diff '+(diff>0?"up":"down")+'">'+
      (diff>0?"+":"")+esc(fmt(diff))+'</span>';
  }
  function valueRow(title,before,after,showChange=true,suffix="") {
    const previous=before==null ? "Not listed" : suffix ? String(before)+suffix : tickets(before);
    const next=after==null ? "Not listed" : suffix ? String(after)+suffix : tickets(after);
    return '<div class="updates-delta-row"><span class="updates-delta-label">'+esc(title)+'</span>'+
      (showChange?'<span class="updates-previous">'+esc(previous)+'</span><span class="updates-to">→</span>':'')+
      '<strong>'+esc(next)+'</strong>'+
      (showChange && !suffix ? ticketDifference(before,after):"")+'</div>';
  }
  // Demand and enchant names are text, not ticket amounts.
  // Render those separately from numeric ticket rows.
  function changeRows(event) {
    if(event.kind==="unit") {
      const start=event.event_type!=="updated";
      const parts=[];
      if(start || numberChanged(event.old_value,event.new_value))
        parts.push(valueRow("Normal value",event.old_value,event.new_value,!start));
      if((start && event.new_shiny_value!==null) ||
        (!start && numberChanged(event.old_shiny_value,event.new_shiny_value)))
        parts.push(valueRow("Shiny value",event.old_shiny_value,event.new_shiny_value,!start));
      if(start || changesDemand(event))
        parts.push('<div class="updates-delta-row"><span class="updates-delta-label">Demand</span>'+
          (start?"":'<span class="updates-previous">'+esc(event.old_demand||"Unknown")+
           '</span><span class="updates-to">→</span>')+
          '<strong>'+esc(event.new_demand||"Unknown")+'</strong></div>');
      return parts.join("");
    }
    const start=event.event_type!=="updated";
    const parts=[];
    if(!start && event.old_name !== event.enchant_name) {
      parts.push('<div class="updates-delta-row"><span class="updates-delta-label">Name</span>'+
        '<span class="updates-previous">'+esc(event.old_name||"Unknown")+'</span>'+
        '<span class="updates-to">→</span><strong>'+esc(event.enchant_name)+'</strong></div>');
    }
    if(start || numberChanged(event.old_bonus_tickets,event.new_bonus_tickets)) {
      const oldVal=event.old_bonus_tickets;
      const newVal=event.new_bonus_tickets;
      parts.push(valueRow("Bonus per unit",oldVal,newVal,!start));
    }
    return parts.join("");
  }
  function dayLabel(iso) {
    const date=new Date(iso);
    return Number.isNaN(date.getTime())?"Date unknown":
      date.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"});
  }
  function timeLabel(iso) {
    const date=new Date(iso);
    return Number.isNaN(date.getTime())?"Time unknown":
      date.toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"});
  }
  function renderEvent(event) {
    const type=category(event);
    const label=labels[type]||labels.baseline;
    const title=event.kind==="unit"?event.unit_name:event.enchant_name;
    const sub=event.kind==="unit" ? esc(event.rarity)+" · UNIT" : "ENCHANTMENT";
    const start=type==="baseline";
    const link=event.kind==="unit" && event.unit_id ?
      '<button type="button" class="updates-history-link" data-update-unit="'+esc(event.unit_id)+'">Unit value history ↗</button>' : "";
    return '<article class="updates-entry '+label.style+'">'+
      '<div class="updates-entry-marker" aria-hidden="true">'+esc(label.symbol)+'</div>'+
      '<div class="updates-entry-body">'+
      '<div class="updates-entry-top"><span class="updates-type '+label.style+'">'+
      esc(label.name)+'</span><time datetime="'+esc(event.changed_at)+'">'+
      esc(timeLabel(event.changed_at))+'</time></div>'+
      '<h3>'+esc(title)+'</h3><p class="updates-entry-meta">'+sub+'</p>'+
      '<div class="updates-deltas">'+changeRows(event)+'</div>'+
      (start?'<p class="updates-baseline">First recorded snapshot — not a past change.</p>':"")+
      link+'</div></article>';
  }
  function isVisible(event,filter) {
    const kind=category(event);
    if(filter==="all") return true;
    if(filter==="unit-added") return kind==="unit-added";
    if(filter==="unit-value") return changesValue(event);
    if(filter==="unit-demand") return changesDemand(event);
    if(filter==="enchant") return kind==="enchant"||kind==="enchant-added";
    if(filter==="baseline") return kind==="baseline";
    return true;
  }
  function filtered() {
    const filter=$("updatesFilter").value;
    const term=$("updatesSearch").value.trim().toLocaleLowerCase();
    return state.events.filter(e=>isVisible(e,filter) &&
      (!term || String(e.kind==="unit"?e.unit_name:e.enchant_name).toLocaleLowerCase().includes(term)));
  }
  function render() {
    if(!state.loaded) return;
    const events=filtered();
    $("updatesCount").textContent=events.length+" matching "+(events.length===1?"entry":"entries");
    $("updatesNewCount").textContent=fmt(state.events.filter(e=>category(e)==="unit-added").length);
    $("updatesValueCount").textContent=fmt(state.events.filter(e=>e.kind==="unit" && e.event_type==="updated").length);
    $("updatesEnchantCount").textContent=fmt(state.events.filter(e=>e.kind==="enchant" && e.event_type!=="baseline").length);
    const shown=events.slice(0,state.visible);
    $("updatesShowMore").hidden=events.length<=state.visible;
    if(!shown.length) {
      $("updatesFeed").innerHTML='<div class="updates-empty">'+
        (state.events.length ? 'Nothing recorded for this filter yet. Try another category.' :
         'No recorded updates yet. New units and changes will appear here automatically.')+
        '</div>';
      return;
    }
    const groups=[];
    for(const event of shown) {
      const day=dayLabel(event.changed_at);
      let group=groups[groups.length-1];
      if(!group || group.day!==day) {
        group={day,items:[]};
        groups.push(group);
      }
      group.items.push(event);
    }
    $("updatesFeed").innerHTML=groups.map(group=>
      '<section class="updates-day"><h3 class="updates-day-label">'+esc(group.day)+
      '<span>'+group.items.length+' '+(group.items.length===1?"ENTRY":"ENTRIES")+'</span></h3>'+
      '<div class="updates-day-events">'+group.items.map(renderEvent).join("")+
      '</div></section>'
    ).join("");
  }
  async function load() {
    if(state.loading) return;
    state.loading=true;
    $("updatesRefresh").disabled=true;
    $("updatesStatus").textContent="Checking the latest updates…";
    const headers={apikey:SUPABASE_PUBLISHABLE_KEY};
    try {
      const base=SUPABASE_URL+"/rest/v1/";
      const [uResponse,eResponse]=await Promise.all([
        fetch(base+"unit_value_history?select=id,unit_id,unit_name,rarity,event_type,old_value,new_value,old_shiny_value,new_shiny_value,old_demand,new_demand,changed_at&order=changed_at.desc&limit="+limitPerSource.units,
          {headers,cache:"no-store"}),
        fetch(base+"enchant_change_history?select=id,enchant_id,enchant_name,event_type,old_name,old_bonus_tickets,new_bonus_tickets,changed_at&order=changed_at.desc&limit="+limitPerSource.enchants,
          {headers,cache:"no-store"})
      ]);
      if(!uResponse.ok||!eResponse.ok)
        throw Error("History service returned "+(!uResponse.ok?uResponse.status:eResponse.status));
      const [unitRows,enchantRows]=await Promise.all([uResponse.json(),eResponse.json()]);
      if(!Array.isArray(unitRows)||!Array.isArray(enchantRows))throw Error("Invalid history response");
      state.events=[
        ...unitRows.map(e=>({...e,kind:"unit"})),
        ...enchantRows.map(e=>({...e,kind:"enchant"}))
      ].sort((a,b)=>Date.parse(b.changed_at)-Date.parse(a.changed_at) ||
        String(b.id).localeCompare(String(a.id)));
      state.capped=unitRows.length===limitPerSource.units ||
        enchantRows.length===limitPerSource.enchants;
      state.loaded=true;
      state.error="";
      state.updatedAt=new Date();
      $("updatesStatus").textContent="Pulled from the live value list · "+state.events.length+
        " recorded entries"+(state.capped?" · showing the newest available entries":"")+
        " · refreshed "+state.updatedAt.toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"});
      render();
    }catch(error){
      state.error=error?.message||"Changelog unavailable";
      $("updatesStatus").textContent="Couldn't load updates: "+state.error+". Try Refresh.";
      if(!state.loaded){
        $("updatesFeed").innerHTML='<div class="updates-empty">The changelog could not be loaded right now. Please try again shortly.</div>';
        $("updatesCount").textContent="Unavailable";
      }
    }finally{
      state.loading=false;
      $("updatesRefresh").disabled=false;
    }
  }
  function resetAndRender(){
    state.visible=18;
    render();
  }
  $("updatesFilter").addEventListener("change",resetAndRender);
  $("updatesSearch").addEventListener("input",resetAndRender);
  $("updatesRefresh").addEventListener("click",load);
  $("updatesShowMore").addEventListener("click",()=>{
    state.visible+=18;
    render();
  });
  $("updatesFeed").addEventListener("click",event=>{
    const button=event.target.closest("[data-update-unit]");
    if(button){
      if(window.NightfrontHistory?.openUnit)window.NightfrontHistory.openUnit(button.dataset.updateUnit);
      else location.hash="#history";
    }
  });
  window.addEventListener("hashchange",()=>{
    if(location.hash==="#updates")load();
  });
  if(location.hash==="#updates")load();
})();
