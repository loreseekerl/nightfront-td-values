// Nightfront TD owner dashboard. Admin rights are enforced by Supabase RLS.
// No admin keys, claim codes, or private credentials are included in this file.
(() => {
  "use strict";
  if (new URLSearchParams(location.search).get("admin") !== "1") return;

  const $ = (id) => document.getElementById(id);
  const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[char]));
  const rarities = ["Common","Uncommon","Rare","Epic","Mythic","Secret","Glitched"];
  const mimeExt = {"image/png":"png","image/jpeg":"jpg","image/webp":"webp","image/gif":"gif"};
  const maxFileSize = 5 * 1024 * 1024;
  const state = {
    client:null, authorized:false, units:[], enchants:[], homeArt:[], suggestions:[],
    editUnitId:null, busy:false, sessionCheck:0, previews:{normal:null,shiny:null},
    coverPreviews:{}, bulkArtworkFiles:[], bulkArtworkMatches:[],
    otpEmail:null, nextEmailAt:0, emailSending:false, verifyingOtp:false
  };

  function status(message, error=false) {
    $("adminStatus").textContent = message;
    $("adminStatus").classList.toggle("admin-error", Boolean(error));
  }
  function ownerUI(mode) {
    $("adminLoginBox").hidden = mode !== "login";
    $("adminDeniedBox").hidden = mode !== "denied";
    $("adminDashboard").hidden = mode !== "owner";
    if (mode !== "owner") {
      state.authorized = false;
      $("adminUnitForm").hidden = true;
    }
  }
  function requireOwner() {
    if (!state.authorized || !state.client) throw Error("Owner login required.");
  }
  async function refreshData() {
    requireOwner();
    const [u,e,covers,suggestions] = await Promise.all([
      state.client.from("units")
        .select("id,name,rarity,value,shiny_value,demand,shiny_demand,normal_value_status,shiny_value_status,normal_value_evidence,shiny_value_evidence,released_on,image_url,shiny_image_url,updated_at")
        .order("name", {ascending:true}),
      state.client.from("enchants")
        .select("id,name,bonus_tickets,sort_order")
        .order("sort_order", {ascending:true}),
      state.client.from("homepage_rarity_artwork")
        .select("rarity,image_url")
        .order("rarity", {ascending:true}),
      state.client.from("unit_value_suggestions")
        .select("id,unit_id,unit_name,unit_rarity,kind,variant,proposed_value,value_at_submission,reason,status,created_at,reviewed_at,owner_note")
        .order("created_at", {ascending:false}).limit(300)
    ]);
    if (u.error) throw u.error;
    if (e.error) throw e.error;
    if (covers.error) throw covers.error;
    if (suggestions.error) throw suggestions.error;
    state.units = u.data || [];
    state.enchants = e.data || [];
    state.homeArt = covers.data || [];
    state.suggestions = suggestions.data || [];
    renderUnits();
    renderBulkArtwork();
    renderEnchants();
    renderHomeArt();
    renderSuggestions();
    status("Owner verified · " + state.units.length + " units · " + state.enchants.length + " enchants");
  }
  async function checkSession(session) {
    const check = ++state.sessionCheck;
    state.authorized = false;
    ownerUI("none");
    if (!session?.user) {
      ownerUI("login");
      status("Private dashboard · sign in as the Q&A owner.");
      return;
    }
    status("Checking owner access…");
    try {
      const {data,error} = await state.client.from("qa_editors")
        .select("user_id").eq("user_id",session.user.id).maybeSingle();
      if (check !== state.sessionCheck) return;
      if (error) throw error;
      if (!data) {
        ownerUI("denied");
        const claimed = await state.client.rpc("qa_owner_claimed");
        if (check !== state.sessionCheck) return;
        const message = claimed.data === false ?
          "No owner has claimed the Q&A yet. Claim ownership using the link below, then return here." :
          "Only the claimed Q&A owner can use this dashboard. This account is not the owner.";
        $("adminDeniedBox").querySelector("p").textContent = message;
        status("Owner account required.",true);
        return;
      }
      state.authorized = true;
      ownerUI("owner");
      $("adminOwnerEmail").textContent = session.user.email || "Verified owner";
      await refreshData();
    } catch (error) {
      if (check !== state.sessionCheck) return;
      ownerUI("denied");
      status("Couldn't verify owner permissions: " + error.message, true);
    }
  }
  async function signOut() {
    if (!state.client) return;
    status("Signing out…");
    const {error} = await state.client.auth.signOut();
    if (error) return status("Sign-out failed: " + error.message,true);
    await checkSession(null);
  }

  function imageURL(value) {
    const url = String(value ?? "").trim();
    if (!url) return null;
    if (url.startsWith("//")) throw Error("Use an HTTPS image URL or a website-relative image path.");
    try {
      const parsed = new URL(url, location.href);
      if (parsed.protocol !== "https:") throw Error("HTTPS required");
      return url;
    } catch {
      throw Error("Invalid image link: use an HTTPS URL or ./assets/image.webp");
    }
  }
  function revokePreview(kind) {
    if (state.previews[kind]) URL.revokeObjectURL(state.previews[kind]);
    state.previews[kind] = null;
  }
  function preview(kind) {
    const fileInput = $(kind === "normal" ? "adminNormalFile" : "adminShinyFile");
    const urlInput = $(kind === "normal" ? "adminUnitImage" : "adminUnitShinyImage");
    const previewNode = $(kind === "normal" ? "adminNormalPreview" : "adminShinyPreview");
    revokePreview(kind);
    let url;
    if (fileInput.files?.length) {
      url = URL.createObjectURL(fileInput.files[0]);
      state.previews[kind] = url;
    } else {
      try { url = imageURL(urlInput.value); } catch { url = null; }
    }
    previewNode.replaceChildren();
    if (!url) {
      previewNode.textContent = "NO IMAGE";
      return;
    }
    const img = document.createElement("img");
    img.src = url;
    img.alt = (kind === "normal" ? "Normal" : "Shiny") + " preview";
    img.onerror = () => { previewNode.textContent = "IMAGE NOT AVAILABLE"; };
    previewNode.append(img);
  }
  function renderUnits() {
    const query = $("adminSearch").value.toLowerCase().trim();
    const missingTotal = state.units.filter(unit => !String(unit.image_url || "").trim()).length;
    $("adminMissingArtworkCount").textContent = missingTotal + " PENDING";
    const missingOnly = $("adminMissingArtworkOnly").checked;
    const units = state.units.filter(unit =>
      unit.name.toLowerCase().includes(query) &&
      (!missingOnly || !String(unit.image_url || "").trim()));
    $("adminUnitsList").innerHTML = units.map(unit => (
      '<div class="admin-unit-row">' +
      '<span class="admin-list-art">' + (unit.image_url ?
        '<img alt="" loading="lazy" src="' + safe(unit.image_url) + '">' :
        '<span class="admin-no-art" aria-label="Unit portrait not uploaded">ART PENDING</span>') + '</span>' +
      '<div class="admin-list-description"><strong>' + safe(unit.name) + '</strong>' +
      '<small>' + safe(unit.rarity) + ' · ' +
      (unit.value == null ? 'N/A' : Number(unit.value).toLocaleString() + ' tickets') +
      ' · Normal demand ' + safe(unit.demand?.trim() || "N/A") +
      ' · Shiny demand ' + safe(unit.shiny_demand?.trim() || "N/A") +
      (!unit.image_url ? ' · PORTRAIT PENDING' : '') + '</small></div>' +
      '<button type="button" class="admin-outline" data-edit-unit="' + safe(unit.id) + '">EDIT</button></div>'
    )).join("") || '<p class="admin-help">No matching units. Try another search or disable the missing-artwork filter.</p>';
  }
  // Bulk artwork uploads accept real owner-provided files only. Matching a filename
  // to a known game unit never changes price, rarity, demand or any existing art.
  function normaliseArtworkName(name) {
    return String(name || "").normalize("NFKC")
      .replace(/\.[a-z0-9]{2,5}$/i, "")
      .toLocaleLowerCase("en-US")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim().replace(/\s+/g, " ");
  }
  function matchedBulkArtwork() {
    const unitsByName=new Map();
    for(const unit of state.units) {
      const key=normaliseArtworkName(unit.name);
      const matches=unitsByName.get(key) || [];
      matches.push(unit);
      unitsByName.set(key,matches);
    }
    const used=new Set();
    return state.bulkArtworkFiles.map(file=>{
      const key=normaliseArtworkName(file.name);
      const possible=unitsByName.get(key) || [];
      const unit=possible.length===1 ? possible[0] : null;
      let stateName="ready", reason="";
      if(!Object.hasOwn(mimeExt,file.type) || !file.size || file.size>maxFileSize) {
        stateName="skip"; reason="Unsupported format or file larger than 5 MB";
      } else if(!unit) {
        stateName="skip"; reason=possible.length>1 ?
          "More than one unit matches this filename" : "No matching unit in the value list";
      } else if(String(unit.image_url || "").trim()) {
        stateName="skip"; reason="Already has artwork — won't overwrite";
      } else if(used.has(unit.id)) {
        stateName="skip"; reason="Duplicate image for this unit";
      } else {
        used.add(unit.id);
      }
      return {file,unit,state:stateName,reason};
    });
  }
  function renderBulkArtwork() {
    const items=matchedBulkArtwork();
    state.bulkArtworkMatches=items;
    const ready=items.filter(x=>x.state==="ready");
    const skipped=items.length-ready.length;
    const target=$("adminBulkArtPreview");
    if(!items.length){
      target.textContent="Choose PNG, JPG, WebP or GIF files (5 MB max each) to check their unit names before upload.";
    } else {
      target.innerHTML='<div class="admin-bulk-art-count">'+ready.length+
        ' MATCHED MISSING PORTRAIT'+(ready.length===1?"":"S")+
        (skipped?' · '+skipped+' skipped':'')+'</div>'+
        '<div class="admin-bulk-art-match-list">'+items.map(({file,unit,state,reason})=>
        '<div class="admin-bulk-art-match '+(state==="ready"?"valid":"skipped")+'">'+
        '<strong>'+safe(file.name)+'</strong>'+
        '<span>'+(state==="ready"?'✓ '+safe(unit.name)+' · '+safe(unit.rarity):
          'SKIP · '+safe(reason))+'</span></div>').join("")+'</div>';
    }
    $("adminBulkArtSave").disabled = !ready.length || state.busy;
  }
  function clearBulkArtwork() {
    state.bulkArtworkFiles=[];
    state.bulkArtworkMatches=[];
    $("adminBulkArtFiles").value="";
    renderBulkArtwork();
  }
  async function uploadBulkArtwork() {
    requireOwner();
    if(state.busy)return;
    // Recompute at click time: skip already-filled or duplicate portraits.
    const candidates=matchedBulkArtwork().filter(row=>row.state==="ready");
    if(!candidates.length){
      $("adminBulkArtStatus").textContent="No missing portraits matched. Check the filenames.";
      return;
    }
    if(!window.confirm("Upload "+candidates.length+" matched real unit portraits? Only missing normal artwork will be filled; existing art and values stay unchanged."))
      return;
    state.busy=true;
    $("adminSaveUnit").disabled=true;
    $("adminBulkArtSave").disabled=true;
    let added=0,skipped=0,failed=0;
    const errors=[];
    try{
      for(let i=0;i<candidates.length;i++){
        const {file,unit}=candidates[i];
        $("adminBulkArtStatus").textContent="Uploading "+(i+1)+"/"+
          candidates.length+": "+file.name+"…";
        try{
          // An atomic UPDATE ... WHERE image_url IS NULL prevents overwriting
          // an owner portrait saved from another device during this operation.
          const url=await uploadImage(file);
          const {data,error}=await state.client.from("units")
            .update({image_url:url}).eq("id",unit.id)
            .is("image_url",null).select("id").maybeSingle();
          if(error)throw error;
          if(data)added++;
          else skipped++;
        }catch(error){
          failed++;
          errors.push(file.name+": "+String(error?.message||error));
        }
      }
      try{await refreshData();}
      catch(error){errors.push("List refresh: "+String(error?.message||error));}
      if(typeof window.loadUnits==="function")window.loadUnits();
      clearBulkArtwork();
      const summary=added+" portraits saved"+(skipped?" · "+skipped+" already set":"")+
        (failed?" · "+failed+" failed":"")+".";
      $("adminBulkArtStatus").textContent=summary+
        (errors.length?" "+errors.slice(0,3).join(" | "):"");
      status("Bulk unit artwork: "+summary,Boolean(failed));
    }finally{
      state.busy=false;
      $("adminSaveUnit").disabled=false;
      $("adminBulkArtSave").disabled=true;
    }
  }

  function renderEnchants() {
    $("adminEnchantsList").innerHTML = state.enchants.map(enchant => (
      '<form class="admin-enchant-row" data-enchant-form="' + safe(enchant.id) + '">' +
      '<div class="admin-enchant-name"><strong>' + safe(enchant.name) +
      '</strong><small>Existing enchant ID: ' + safe(enchant.id) + '</small></div>' +
      '<label>Bonus tickets per unit<input name="bonus" type="number" min="0" max="1000000000" step="any" required value="' +
      safe(enchant.bonus_tickets) + '"></label>' +
      '<button class="admin-primary" type="submit">SAVE</button></form>'
    )).join("") || '<p class="admin-help">No enchantments found.</p>';
  }
  function renderHomeArt() {
    // One configurable hero cover per official rarity. Blank = real unit
    // portrait of that rarity, or a styled abstract emblem until a unit exists.
    for (const url of Object.values(state.coverPreviews)) if (url) URL.revokeObjectURL(url);
    state.coverPreviews = {};
    $("adminHomeArtList").innerHTML = rarities.map(rarity=>{
      const saved = state.homeArt.find(item=>item.rarity===rarity);
      const fallback = state.units.find(u=>u.rarity===rarity && u.image_url);
      const path=saved?.image_url || "";
      const image=path || fallback?.image_url || "";
      const label=path ? "CUSTOM COVER" : fallback ? "USING UNIT ART: "+fallback.name : "AWAITING ARTWORK";
      return '<form class="admin-home-art-row" data-cover-form="'+safe(rarity)+'">' +
        '<div class="admin-home-art-top"><h3>'+safe(rarity.toUpperCase())+
        '</h3><small>'+safe(label)+'</small></div>' +
        '<div class="admin-home-art-preview" data-cover-preview="'+safe(rarity)+'">' +
        (image?'<img loading="lazy" src="'+safe(image)+'" alt="'+safe(rarity)+' cover preview">':
          '<span>RARITY COVER PENDING</span>')+'</div>' +
        '<label>Cover image URL<input name="cover_url" type="text" maxlength="2048" placeholder="https://… or ./assets/…" value="'+safe(path)+'"></label>' +
        '<label>Or upload from PC<input name="cover_file" type="file" accept=".png,.jpg,.jpeg,.webp,.gif,image/png,image/jpeg,image/webp,image/gif"></label>' +
        '<div class="admin-home-art-actions">' +
        '<button class="admin-primary" type="submit">SAVE COVER</button>' +
        '<button class="admin-outline" type="button" data-cover-auto="'+safe(rarity)+'">USE AUTO</button>' +
        '</div></form>';
    }).join("");
  }
  function coverFormPreview(form) {
    const rarity=form.dataset.coverForm;
    const urlField=form.elements.cover_url;
    const file=form.elements.cover_file.files?.[0];
    const panel=form.querySelector('[data-cover-preview]');
    if(state.coverPreviews[rarity]) URL.revokeObjectURL(state.coverPreviews[rarity]);
    state.coverPreviews[rarity] = null;
    let src="";
    if(file) {
      src=URL.createObjectURL(file);
      state.coverPreviews[rarity]=src;
    } else {
      try {src=imageURL(urlField.value) || "";} catch {src="";}
      if(!src) src=state.units.find(u=>u.rarity===rarity && u.image_url)?.image_url || "";
    }
    panel.replaceChildren();
    if(!src) {panel.textContent="RARITY COVER PENDING";return;}
    const img=document.createElement("img");
    img.src=src;
    img.alt=rarity+" cover preview";
    img.onerror=()=>{panel.textContent="IMAGE NOT AVAILABLE";};
    panel.append(img);
  }
  async function saveHomeCover(event) {
    const form=event.target.closest("[data-cover-form]");
    if(!form) return;
    event.preventDefault();
    await withBusy(async()=>{
      const rarity=form.dataset.coverForm;
      if(!rarities.includes(rarity)) throw Error("Invalid rarity cover");
      const file=form.elements.cover_file.files?.[0];
      let url=file ? null : imageURL(form.elements.cover_url.value);
      status("Saving "+rarity+" cover…");
      if(file) url=await uploadImage(file);
      const {data,error}=await state.client.from("homepage_rarity_artwork")
        .update({image_url:url}).eq("rarity",rarity).select("rarity").single();
      if(error || !data) throw error || Error("Rarity cover update was not authorized");
      await refreshData();
      if(typeof window.loadHomeArtwork==="function") window.loadHomeArtwork();
      status(rarity+" homepage artwork saved.");
    });
  }
  function openUnit(unitId=null) {
    const unit = state.units.find(u => u.id === unitId) || null;
    state.editUnitId = unit?.id || null;
    $("adminUnitForm").reset();
    $("adminNormalFile").value = "";
    $("adminShinyFile").value = "";
    $("adminUnitFormTitle").textContent = unit ? "EDIT " + unit.name.toUpperCase() : "ADD A NEW UNIT";
    $("adminUnitName").value = unit?.name || "";
    $("adminUnitRarity").value = unit?.rarity || "Common";
    $("adminUnitValue").value = unit?.value ?? "";
    $("adminUnitShinyValue").value = unit?.shiny_value ?? "";
    $("adminUnitDemand").value = unit?.demand ?? "";
    $("adminUnitShinyDemand").value = unit?.shiny_demand ?? "";
    $("adminNormalValueStatus").value = unit?.normal_value_status || "Estimated";
    $("adminShinyValueStatus").value = unit?.shiny_value_status || "Estimated";
    $("adminNormalEvidence").value = unit?.normal_value_evidence || "";
    $("adminShinyEvidence").value = unit?.shiny_value_evidence || "";
    $("adminUnitReleaseDate").value = unit?.released_on || "";
    $("adminUnitImage").value = unit?.image_url || "";
    $("adminUnitShinyImage").value = unit?.shiny_image_url || "";
    $("adminDeleteUnit").hidden = !unit;
    $("adminUnitForm").hidden = false;
    preview("normal"); preview("shiny");
    $("adminUnitForm").scrollIntoView({behavior:"smooth",block:"start"});
  }
  function closeUnit() {
    state.editUnitId = null;
    $("adminUnitForm").hidden = true;
    for (const kind of ["normal","shiny"]) revokePreview(kind);
  }
  async function uploadImage(file) {
    if (!file) return null;
    if (!Object.hasOwn(mimeExt,file.type)) throw Error("Image must be PNG, JPG, WebP or GIF.");
    if (file.size === 0 || file.size > maxFileSize) throw Error("Images must be nonempty and 5 MB or smaller.");
    const path = "units/" + crypto.randomUUID() + "." + mimeExt[file.type];
    const {error} = await state.client.storage.from("nightfront-unit-art")
      .upload(path,file,{contentType:file.type,cacheControl:"3600",upsert:false});
    if (error) throw error;
    const {data} = state.client.storage.from("nightfront-unit-art").getPublicUrl(path);
    if (!data?.publicUrl) throw Error("Couldn't get the uploaded image URL.");
    return data.publicUrl;
  }
  function unitFields() {
    const name = $("adminUnitName").value.trim();
    const rarity = $("adminUnitRarity").value;
    const rawValue = $("adminUnitValue").value.trim();
    const value = rawValue === "" ? null : Number(rawValue);
    const rawShiny = $("adminUnitShinyValue").value.trim();
    const shinyValue = rawShiny === "" ? null : Number(rawShiny);
    const demand = $("adminUnitDemand").value.trim() || null;
    const shinyDemand = $("adminUnitShinyDemand").value.trim() || null;
    const normalStatus = $("adminNormalValueStatus").value;
    const shinyStatus = $("adminShinyValueStatus").value;
    const normalEvidence = $("adminNormalEvidence").value.trim() || null;
    const shinyEvidence = $("adminShinyEvidence").value.trim() || null;
    const releaseDate = $("adminUnitReleaseDate").value.trim() || null;
    if (!name || name.length > 100) throw Error("Enter a unit name (up to 100 characters).");
    if (!rarities.includes(rarity)) throw Error("Select a valid rarity.");
    if (rawValue !== "" && (!Number.isFinite(value) || value < 0 || value > 1e9))
      throw Error("Normal value must be blank (N/A) or between 0 and 1 billion.");
    if (rawShiny !== "" && (!Number.isFinite(shinyValue) || shinyValue < 0 || shinyValue > 1e9))
      throw Error("Shiny value must be blank or between 0 and 1 billion.");
    if (!["Estimated","Verified"].includes(normalStatus) ||
        !["Estimated","Verified"].includes(shinyStatus))
      throw Error("Choose Estimated or Verified for each unit version.");
    if (normalStatus === "Verified" && (value === null || !normalEvidence || normalEvidence.length < 8))
      throw Error("Verified normal values require a listed ticket amount and evidence (at least 8 characters).");
    if (shinyStatus === "Verified" && (shinyValue === null || !shinyEvidence || shinyEvidence.length < 8))
      throw Error("Verified shiny values require a listed ticket amount and evidence (at least 8 characters).");
    if (releaseDate && (!/^\d{4}-\d{2}-\d{2}$/.test(releaseDate) ||
      Number.isNaN(Date.parse(releaseDate)) || releaseDate > new Date().toISOString().slice(0,10)))
      throw Error("Enter a real confirmed release date that is not in the future.");
    return {
      name, rarity, value, shiny_value:shinyValue, demand, shiny_demand:shinyDemand,
      normal_value_status:normalStatus, shiny_value_status:shinyStatus,
      normal_value_evidence:normalEvidence, shiny_value_evidence:shinyEvidence,
      released_on:releaseDate,
      image_url:imageURL($("adminUnitImage").value),
      shiny_image_url:imageURL($("adminUnitShinyImage").value)
    };
  }
  async function withBusy(action) {
    if (state.busy) return;
    state.busy = true;
    $("adminSaveUnit").disabled = true;
    try { requireOwner(); await action(); }
    catch (error) { status("Save failed: " + (error.message || String(error)),true); }
    finally { state.busy = false; $("adminSaveUnit").disabled = false; }
  }
  async function saveUnit(event) {
    event.preventDefault();
    await withBusy(async () => {
      const fields = unitFields();
      const editId = state.editUnitId;
      status("Saving unit and images…");
      if ($("adminNormalFile").files?.[0])
        fields.image_url = await uploadImage($("adminNormalFile").files[0]);
      if ($("adminShinyFile").files?.[0])
        fields.shiny_image_url = await uploadImage($("adminShinyFile").files[0]);
      let query = editId
        ? state.client.from("units").update(fields).eq("id",editId)
        : state.client.from("units").insert(fields);
      const {data,error} = await query.select("id").single();
      if (error || !data) throw error || Error("Unit write was not authorized.");
      closeUnit();
      await refreshData();
      if (typeof window.loadUnits === "function") window.loadUnits();
      status((editId ? "Updated " : "Created ") + fields.name + ". Changes are live.");
    });
  }
  async function deleteUnit() {
    if (!state.editUnitId) return;
    const unit = state.units.find(u => u.id === state.editUnitId);
    if (!unit || !window.confirm('Permanently delete "' + unit.name + '"? This cannot be undone.')) return;
    await withBusy(async () => {
      status("Deleting " + unit.name + "…");
      const {data,error} = await state.client.from("units")
        .delete().eq("id",unit.id).select("id").single();
      if (error || !data) throw error || Error("Delete was not authorized.");
      closeUnit();
      await refreshData();
      if (typeof window.loadUnits === "function") window.loadUnits();
      status("Deleted " + unit.name + ".");
    });
  }
  async function saveEnchant(event) {
    const form = event.target.closest("[data-enchant-form]");
    if (!form) return;
    event.preventDefault();
    await withBusy(async () => {
      const id = form.dataset.enchantForm;
      const rawValue = form.elements.bonus.value.trim();
      const bonus = Number(rawValue);
      if (rawValue === "" || !Number.isFinite(bonus) || bonus < 0 || bonus > 1e9)
        throw Error("Enter an enchant bonus between 0 and 1 billion.");
      status("Saving enchant bonus…");
      const {data,error} = await state.client.from("enchants")
        .update({bonus_tickets:bonus}).eq("id",id).select("id").single();
      if (error || !data) throw error || Error("Enchant write was not authorized.");
      const name = state.enchants.find(e => e.id === id)?.name || "Enchantment";
      await refreshData();
      if (typeof window.loadEnchants === "function") window.loadEnchants();
      status("Updated " + name + " to +" + bonus.toLocaleString() + " tickets.");
    });
  }
  const listedTicketValue = value => value == null ? "N/A" :
    Number(value).toLocaleString("en-US",{maximumFractionDigits:2}) + " tickets";
  function hasChangedValue(before,after) {
    return (before == null ? null : Number(before)) !== (after == null ? null : Number(after));
  }
  function renderSuggestions() {
    const pending=state.suggestions.filter(s=>s.status==="pending").length;
    $("adminSuggestionsBadge").textContent=pending ? " ("+pending+")" : "";
    const filter=$("adminSuggestionFilter").value;
    const query=$("adminSuggestionSearch").value.trim().toLowerCase();
    const filtered=state.suggestions.filter(s=>
      (filter==="all"||s.status===filter) &&
      (!query||s.unit_name.toLowerCase().includes(query)));
    $("adminSuggestionsStatus").textContent=pending+" waiting for review · "+
      filtered.length+" matching submissions"+(state.suggestions.length===300?" · newest 300 displayed":"");
    if(!filtered.length) {
      $("adminSuggestionsList").innerHTML='<div class="admin-suggestions-empty">'+
        (state.suggestions.length?"No matching submissions for this filter.":
          "No player suggestions yet. They will appear here automatically.")+'</div>';
      return;
    }
    $("adminSuggestionsList").innerHTML=filtered.map(s=>{
      const unit=state.units.find(u=>u.id===s.unit_id);
      const oldValue=listedTicketValue(s.value_at_submission);
      const live=unit ? (s.variant==="shiny" ? unit.shiny_value : unit.value) : null;
      const stale=Boolean(unit) && hasChangedValue(live,s.value_at_submission);
      const missing=(!unit);
      const proposed=s.proposed_value === null ? null : s.proposed_value;
      const pending=s.status==="pending";
      const canApproveValue=pending && proposed !== null && !stale && !missing;
      const canApproveReport=pending && proposed===null;
      const note=s.owner_note?'<p class="admin-review-note">Owner note: '+safe(s.owner_note)+'</p>':"";
      const time=Number.isFinite(Date.parse(s.created_at)) ?
        new Date(s.created_at).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"}):
        "Date unknown";
      return '<article class="admin-suggestion-card" data-suggestion-id="'+safe(s.id)+'">'+
        '<div class="admin-suggestion-top"><span class="admin-suggestion-status status-'+safe(s.status)+'">'+
        safe(s.status.toUpperCase())+'</span><span>'+safe(time)+'</span></div>'+
        '<div class="admin-suggestion-title"><h3>'+safe(s.unit_name)+'</h3><small>'+
        safe(s.unit_rarity)+' · '+safe(s.variant.toUpperCase())+' · '+
        (s.kind==="value_suggestion"?"VALUE SUGGESTION":"INCORRECT VALUE REPORT")+'</small></div>'+
        '<div class="admin-suggestion-values">'+
          '<div><span>WHEN SUBMITTED</span><strong>'+safe(oldValue)+'</strong></div>'+
          '<div><span>SUGGESTED</span><strong>'+safe(proposed===null?"No price provided":listedTicketValue(proposed))+'</strong></div>'+
          '<div><span>LIVE RIGHT NOW</span><strong>'+
            safe(missing?"UNIT REMOVED":listedTicketValue(live))+'</strong></div>'+
        '</div>'+
        '<p class="admin-suggestion-reason">'+safe(s.reason)+'</p>'+
        (pending && stale?'<p class="admin-suggestion-warning">⚠ The live value changed after this was submitted. Review manually or reject it to avoid overwriting a newer price.</p>':"")+
        (pending && missing?'<p class="admin-suggestion-warning">⚠ Unit no longer exists. A proposed price cannot be applied.</p>':"")+
        note+
        (pending ?
          '<label class="admin-suggestion-note-label">REVIEW NOTE (OPTIONAL)'+
            '<input type="text" data-review-note maxlength="300" placeholder="Only visible in the admin dashboard"></label>'+
          '<div class="admin-suggestion-buttons">'+
            '<button type="button" class="admin-suggestion-approve" data-review-decision="approved"'+
              ((canApproveValue||canApproveReport)?"":' disabled title="Cannot apply to an updated or missing unit"')+'>'+
              (proposed===null?"MARK REVIEWED":"APPROVE & APPLY")+'</button>'+
            '<button type="button" class="admin-suggestion-reject" data-review-decision="rejected">REJECT</button></div>'
          :'<p class="admin-suggestion-reviewed">Reviewed'+
            (s.reviewed_at?" · "+safe(new Date(s.reviewed_at).toLocaleDateString()):"")+'</p>')+
        '</article>';
    }).join("");
  }
  async function reviewSuggestion(event) {
    const button=event.target.closest("[data-review-decision]");
    if(!button || button.disabled || state.busy)return;
    const card=button.closest("[data-suggestion-id]");
    const id=card?.dataset.suggestionId;
    const suggestion=state.suggestions.find(s=>s.id===id);
    if(!suggestion || suggestion.status!=="pending")return;
    const decision=button.dataset.reviewDecision;
    if(!["approved","rejected"].includes(decision))return;
    const text=decision==="approved" ?
      (suggestion.proposed_value===null ?
       "Mark this report as reviewed? No ticket values will change.":
       "Approve "+suggestion.unit_name+" ("+suggestion.variant+") at "+
         listedTicketValue(suggestion.proposed_value)+"? This updates the live value list.") :
      "Reject this submission? It will not change any value.";
    if(!window.confirm(text))return;
    const note=card.querySelector("[data-review-note]")?.value.trim()||null;
    await withBusy(async()=>{
      status(decision==="approved"?"Approving suggestion…":"Rejecting suggestion…");
      const {data,error}=await state.client.rpc("review_unit_value_suggestion",{
        p_suggestion_id:id,p_decision:decision,p_owner_note:note
      });
      if(error)throw error;
      await refreshData();
      if(data?.applied) {
        if(typeof window.loadUnits==="function")window.loadUnits();
        window.NightfrontTrends?.refresh();
      }
      status(data?.applied ? "Approved and updated "+suggestion.unit_name+" to "+
        listedTicketValue(suggestion.proposed_value)+"." :
        decision==="approved" ? "Report marked reviewed. No ticket values changed." :
          "Submission rejected. No ticket values changed.");
    });
  }

  function setTab(tab) {
    $("adminUnitsPanel").hidden = tab !== "units";
    $("adminEnchantsPanel").hidden = tab !== "enchants";
    $("adminHomeArtPanel").hidden = tab !== "homeArt";
    $("adminSuggestionsPanel").hidden = tab !== "suggestions";
    for (const [id,active] of [["adminUnitsTab",tab==="units"],["adminEnchantsTab",tab==="enchants"],["adminHomeArtTab",tab==="homeArt"],["adminSuggestionsTab",tab==="suggestions"]]) {
      $(id).classList.toggle("active",active);
      $(id).setAttribute("aria-selected",String(active));
    }
  }

  $("adminUnitsTab").addEventListener("click",()=>setTab("units"));
  $("adminEnchantsTab").addEventListener("click",()=>setTab("enchants"));
  $("adminHomeArtTab").addEventListener("click",()=>setTab("homeArt"));
  $("adminSuggestionsTab").addEventListener("click",()=>setTab("suggestions"));
  $("adminSuggestionFilter").addEventListener("change",renderSuggestions);
  $("adminSuggestionSearch").addEventListener("input",renderSuggestions);
  $("adminSuggestionsList").addEventListener("click",reviewSuggestion);
  $("adminSuggestionsReload").addEventListener("click",()=>
    refreshData().catch(e=>status("Could not reload suggestions: "+e.message,true)));
  $("adminHomeArtList").addEventListener("submit",saveHomeCover);
  $("adminHomeArtList").addEventListener("input",(event)=>{
    const form=event.target.closest("[data-cover-form]");
    if(form && event.target.name==="cover_url") coverFormPreview(form);
  });
  $("adminHomeArtList").addEventListener("change",(event)=>{
    const form=event.target.closest("[data-cover-form]");
    if(form && event.target.name==="cover_file") coverFormPreview(form);
  });
  $("adminHomeArtList").addEventListener("click",(event)=>{
    const button=event.target.closest("[data-cover-auto]");
    if(!button) return;
    const form=button.closest("[data-cover-form]");
    if(!form) return;
    form.elements.cover_url.value="";
    form.elements.cover_file.value="";
    coverFormPreview(form);
    form.requestSubmit();
  });
  $("adminNewUnit").addEventListener("click",()=>openUnit());
  $("adminCancelUnit").addEventListener("click",closeUnit);
  $("adminSaveUnit").addEventListener("click",()=>{});
  $("adminUnitForm").addEventListener("submit",saveUnit);
  $("adminDeleteUnit").addEventListener("click",deleteUnit);
  $("adminSearch").addEventListener("input",renderUnits);
  $("adminMissingArtworkOnly").addEventListener("change",renderUnits);
  $("adminBulkArtFiles").addEventListener("change",()=>{
    state.bulkArtworkFiles=[...($("adminBulkArtFiles").files || [])];
    renderBulkArtwork();
    $("adminBulkArtStatus").textContent="Review the name matches before uploading. Existing portraits are protected.";
  });
  $("adminBulkArtClear").addEventListener("click",clearBulkArtwork);
  $("adminBulkArtSave").addEventListener("click",()=>{
    uploadBulkArtwork().catch(error=>{
      $("adminBulkArtStatus").textContent="Bulk upload failed: "+String(error?.message||error);
      status("Bulk artwork upload failed: "+String(error?.message||error),true);
    });
  });
  $("adminUnitsList").addEventListener("click",(event)=>{
    const button = event.target.closest("[data-edit-unit]");
    if (button) openUnit(button.dataset.editUnit);
  });
  $("adminEnchantsList").addEventListener("submit",saveEnchant);
  $("adminUnitImage").addEventListener("input",()=>preview("normal"));
  $("adminUnitShinyImage").addEventListener("input",()=>preview("shiny"));
  $("adminNormalFile").addEventListener("change",()=>preview("normal"));
  $("adminShinyFile").addEventListener("change",()=>preview("shiny"));
  $("adminReload").addEventListener("click",()=>refreshData().catch(e=>status(e.message,true)));
  $("adminLogout").addEventListener("click",signOut);
  $("adminDeniedLogout").addEventListener("click",signOut);
  function readableAuthError(error) {
    const raw = String(error?.message || "Please try again.");
    if (/rate limit|too many requests|429/i.test(raw))
      return "Email limit reached. Wait before asking for another message (often around an hour), or use your saved owner password.";
    if (/token.*(expired|invalid)|otp.*(expired|invalid)/i.test(raw))
      return "That code has expired or was already used. Request a fresh email once the limit allows, then use only its newest code.";
    return raw;
  }
  $("adminLoginForm").addEventListener("submit",async(event)=>{
    event.preventDefault();
    if (!state.client) return;
    const email = $("adminEmail").value.trim();
    const password = $("adminLoginPassword").value;
    if (!email) return;
    if (!password) {
      status("Enter your password, or choose EMAIL A SIGN-IN CODE for your first login.",true);
      $("adminLoginPassword").focus();
      return;
    }
    const button = $("adminPasswordLoginButton");
    button.disabled = true;
    status("Signing in with password…");
    try {
      const {data,error} = await state.client.auth.signInWithPassword({email,password});
      if (error) throw error;
      $("adminLoginPassword").value = "";
      if (data?.session) await checkSession(data.session);
    } catch(error) { status("Password sign-in failed: " + readableAuthError(error),true); }
    finally {button.disabled = false;}
  });
  $("adminEmailCodeButton").addEventListener("click",async()=>{
    if (!state.client || state.emailSending) return;
    const emailInput=$("adminEmail");
    if (!emailInput.reportValidity()) return;
    if (Date.now() < state.nextEmailAt) {
      status("Wait before sending another email. Use the newest message already sent.",true);
      return;
    }
    const email=emailInput.value.trim();
    const button=$("adminEmailCodeButton");
    state.emailSending=true;
    button.disabled=true;
    status("Requesting one sign-in email…");
    try {
      const {error}=await state.client.auth.signInWithOtp({
        email,options:{
          emailRedirectTo:"https://loreseekerl.github.io/nightfront-td-values/?qa=edit",
          shouldCreateUser:true
        }
      });
      if (error) throw error;
      state.otpEmail=email;
      state.nextEmailAt=Date.now()+60000;
      $("adminEmailCodeForm").hidden=false;
      $("adminEmailCode").value="";
      status("Email requested. Enter the six-digit code from your latest email, or click its sign-in link once. Links return through the Q&A owner page.");
      $("adminEmailCode").focus();
    } catch(error) {status("Could not send email: "+readableAuthError(error),true);}
    finally {
      state.emailSending=false;
      if(state.nextEmailAt>Date.now())setTimeout(()=>{button.disabled=false;},state.nextEmailAt-Date.now());
      else button.disabled=false;
    }
  });
  $("adminEmailCodeForm").addEventListener("submit",async(event)=>{
    event.preventDefault();
    if(!state.client || !state.otpEmail || state.verifyingOtp)return;
    const token=$("adminEmailCode").value.trim();
    if(!/^\d{6}$/.test(token)){
      status("Enter all six digits from the newest email.",true);
      return;
    }
    const button=event.target.querySelector('button[type="submit"]');
    button.disabled=true;
    state.verifyingOtp=true;
    status("Verifying your email code…");
    try {
      const {data,error}=await state.client.auth.verifyOtp({
        email:state.otpEmail,token,type:"email"
      });
      if(error)throw error;
      state.otpEmail=null;
      $("adminEmailCode").value="";
      $("adminEmailCodeForm").hidden=true;
      if(data?.session)await checkSession(data.session);
    } catch(error) {status("Email code failed: "+readableAuthError(error),true);}
    finally {state.verifyingOtp=false;button.disabled=false;}
  });
  $("adminPasswordForm").addEventListener("submit",async(event)=>{
    event.preventDefault();
    if(!state.authorized || !state.client)return;
    const password=$("adminNewPassword").value;
    if(password.length<12 || password!==$("adminConfirmPassword").value){
      status("Password must be at least 12 characters and both entries must match.",true);
      return;
    }
    const button=event.target.querySelector('button[type="submit"]');
    button.disabled=true;
    status("Saving your owner password…");
    try {
      const {error}=await state.client.auth.updateUser({password});
      if(error)throw error;
      event.target.reset();
      status("Owner password saved! Your next login can use email + password without a new link.");
    } catch(error) {status("Password setup failed: "+readableAuthError(error),true);}
    finally {button.disabled=false;}
  });

  async function init() {
    ownerUI("none");
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      ownerUI("login");
      status("Supabase sign-in didn't load. Refresh and try again.",true);
      return;
    }
    state.client = window.__nightfrontAuthClient ||
      (window.__nightfrontAuthClient = window.supabase.createClient(
        SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,
        {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}
      ));
    state.client.auth.onAuthStateChange((_event,session)=>{
      Promise.resolve().then(()=>checkSession(session))
        .catch(error=>status(error.message,true));
    });
    const {data,error} = await state.client.auth.getSession();
    if (error) throw error;
    await checkSession(data?.session || null);
  }
  init().catch(error=>{ ownerUI("login"); status("Couldn't load dashboard: " + error.message,true); });
})();
