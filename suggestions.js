// Nightfront community submissions. Visitors only invoke the restricted
// submit RPC: no public suggestion feed, direct database edits, or secret keys.
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? "").replace(/[&<>"']/g,
    char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const fmt = v => Number(v).toLocaleString("en-US",{maximumFractionDigits:2});
  const valueLabel = v => v === null || v === undefined || v === "" ? "N/A" : fmt(v) + " tickets";
  const state = {units:[],loaded:false,loading:false,sending:false,targetId:null,lastSent:0};

  function status(message,error=false,success=false) {
    const target=$("suggestionStatus");
    target.textContent=message;
    target.classList.toggle("suggestion-error",error);
    target.classList.toggle("suggestion-success",success);
  }
  function selectedUnit() {
    return state.units.find(u=>u.id===$("suggestUnit").value) || null;
  }
  function renderSelected() {
    const unit=selectedUnit();
    const wrapper=$("suggestionUnitPreview");
    if(!unit){
      wrapper.textContent="Choose a unit to see its current values.";
      return;
    }
    const variant=$("suggestVariant").value;
    const chosen=variant==="shiny" ? unit.shiny_value : unit.value;
    wrapper.innerHTML='<div class="suggestion-unit-head"><strong>'+esc(unit.name)+
      '</strong><small>'+esc(unit.rarity)+' · '+(variant==="shiny"?"SHINY":"NORMAL")+'</small></div>'+
      '<div class="suggestion-unit-numbers"><span>LISTED VALUE <b>'+
      esc(valueLabel(chosen))+'</b></span><span>DEMAND <b>'+
      esc(unit.demand || "Unknown")+'</b></span></div>';
  }
  function renderOptions() {
    const select=$("suggestUnit");
    const before=state.targetId || select.value;
    const term=$("suggestUnitSearch").value.toLowerCase().trim();
    let candidates=state.units.filter(u=>u.name.toLowerCase().includes(term));
    const chosen=state.units.find(u=>u.id===before);
    // Keep the selected item in the dropdown even while searching another name.
    if(chosen && !candidates.some(u=>u.id===chosen.id)) candidates=[chosen,...candidates];
    select.innerHTML='<option value="">CHOOSE A UNIT</option>'+
      candidates.map(u=>'<option value="'+esc(u.id)+'">'+
        esc(u.name)+' · '+esc(u.rarity)+'</option>').join("");
    if(chosen)select.value=chosen.id;
    state.targetId=null;
    renderSelected();
  }
  async function load(force=false) {
    if(state.loading || (state.loaded && !force)) {
      if(state.loaded && state.targetId) renderOptions();
      return;
    }
    state.loading=true;
    $("suggestSend").disabled=true;
    $("suggestUnit").disabled=true;
    status("Loading units from the Nightfront value list…");
    try{
      const response=await fetch(SUPABASE_URL+
        "/rest/v1/units?select=id,name,rarity,value,shiny_value,demand&order=name.asc&limit=1000",{
          headers:{apikey:SUPABASE_PUBLISHABLE_KEY},cache:"no-store"
        });
      if(!response.ok)throw Error("Unit list request failed ("+response.status+")");
      const units=await response.json();
      if(!Array.isArray(units))throw Error("Invalid unit list");
      state.units=units;
      state.loaded=true;
      renderOptions();
      status("Choose a unit and send your suggestion. Only the owner sees submissions.");
    }catch(error){
      status("Couldn't load the unit list. "+(error?.message||"")+" Refresh this page and try again.",true);
      $("suggestUnit").innerHTML='<option value="">UNIT LIST UNAVAILABLE</option>';
    }finally{
      state.loading=false;
      $("suggestSend").disabled=!state.loaded;
      $("suggestUnit").disabled=!state.loaded;
    }
  }
  function setKind(){
    const required=$("suggestKind").value==="value_suggestion";
    const amount=$("suggestProposedValue");
    amount.required=required;
    $("suggestPriceLabel").classList.toggle("suggestion-optional",!required);
    amount.placeholder=required ? "e.g. 250" : "Optional — leave blank if unsure";
  }
  async function send(event){
    event.preventDefault();
    if(state.sending || !state.loaded)return;
    const unit=selectedUnit();
    if(!unit) return status("Choose a unit from the list first.",true);
    const proposedRaw=$("suggestProposedValue").value.trim();
    const reason=$("suggestReason").value.trim();
    const kind=$("suggestKind").value;
    const variant=$("suggestVariant").value;
    if(!["value_suggestion","incorrect_value"].includes(kind) ||
       !["normal","shiny"].includes(variant))
      return status("Choose a valid suggestion type and version.",true);
    if(proposedRaw==="" && kind==="value_suggestion")
      return status("Enter a suggested ticket value, or select Report an incorrect value instead.",true);
    const proposed=proposedRaw===""?null:Number(proposedRaw);
    if(proposed!==null && (!Number.isFinite(proposed)||proposed<0||proposed>1000000000))
      return status("Ticket values must be between 0 and 1 billion, or left blank on a report.",true);
    if(reason.length<12 || reason.length>500)
      return status("Give a reason between 12 and 500 characters.",true);
    if(Date.now()-state.lastSent<60000)
      return status("Your last suggestion was sent. Please wait a minute before sending another.",true);
    state.sending=true;
    $("suggestSend").disabled=true;
    $("suggestSend").textContent="SENDING…";
    status("Submitting for private review…");
    try{
      const response=await fetch(SUPABASE_URL+"/rest/v1/rpc/submit_unit_value_suggestion",{
        method:"POST",
        headers:{apikey:SUPABASE_PUBLISHABLE_KEY,"Content-Type":"application/json"},
        body:JSON.stringify({
          p_unit_id:unit.id,p_kind:kind,p_variant:variant,
          p_proposed_value:proposed,p_reason:reason,
          p_website:$("suggestWebsite").value
        })
      });
      if(!response.ok){
        const error=await response.json().catch(()=>({}));
        const serverMessage=String(error.message||"");
        if(/too many suggestions/i.test(serverMessage))
          throw Error("Too many suggestions from this connection. Try again later.");
        if(/unit.*not found|choose a unit/i.test(serverMessage))
          throw Error("This unit is no longer on the list. Refresh and choose another.");
        if(/check the suggestion|ticket value|could not be accepted/i.test(serverMessage))
          throw Error("Check your ticket value and explanation, then try again.");
        throw Error("Submission could not be saved ("+response.status+"). Try again later.");
      }
      state.lastSent=Date.now();
      $("suggestReason").value="";
      $("suggestProposedValue").value="";
      $("suggestReasonCount").textContent="0 / 500 characters";
      status("✓ Submitted! Your suggestion is waiting for the owner to review it. No live values were changed.",false,true);
    }catch(error){
      status(error?.message || "Submission failed. Please try again later.",true);
    }finally{
      state.sending=false;
      $("suggestSend").disabled=false;
      $("suggestSend").textContent="SEND FOR REVIEW ↗";
    }
  }
  $("suggestUnitSearch").addEventListener("input",renderOptions);
  $("suggestUnit").addEventListener("change",renderSelected);
  $("suggestKind").addEventListener("change",setKind);
  $("suggestVariant").addEventListener("change",renderSelected);
  $("suggestReason").addEventListener("input",()=>{
    $("suggestReasonCount").textContent=$("suggestReason").value.length+" / 500 characters";
  });
  $("valueSuggestionForm").addEventListener("submit",send);
  setKind();
  function openUnit(unitId) {
    state.targetId=unitId;
    $("suggestUnitSearch").value="";
    if(location.hash!=="#suggestions")location.hash="#suggestions";
    else {if(typeof window.route==="function")window.route();load();}
  }
  window.NightfrontSuggestions={openUnit,reload:()=>load(true)};
  window.addEventListener("hashchange",()=>{
    if(location.hash==="#suggestions")load();
  });
  if(location.hash==="#suggestions")load();
})();
