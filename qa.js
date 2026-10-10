// Developer Q&A: public Supabase content + restricted owner editing.
// There are NO administrator secrets or passwords in this public file.
(() => {
  "use strict";

  const el = (id) => document.getElementById(id);
  const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[character]));
  const state = { client: null, authorized: false, ownerRows: [], loadingEditor: false };

  function message(text, isError = false) {
    const node = el("qaAuthStatus");
    node.textContent = text;
    node.classList.toggle("qa-message-error", isError);
  }
  function formattedAnswer(value) {
    // Only these four inline color tags are allowed. User content is HTML-escaped first.
    const escaped = safe(value);
    return escaped.replace(/\[(red|green|orange|blue)\]([\s\S]*?)\[\/\1\]/gi,
      (_, color, content) => '<span class="qa-' + color.toLowerCase() + '">' + content + '</span>');
  }
  function renderPublic(entries) {
    if (!entries.length) {
      el("qaItems").innerHTML = '<div class="qa-empty">No published questions yet. Check back soon.</div>';
      return;
    }
    el("qaItems").innerHTML = entries.map((entry) =>
      '<article class="qa-entry"><strong class="qa-question">' + safe(entry.question) +
      '</strong><span class="qa-answer">' + formattedAnswer(entry.answer) + '</span></article>'
    ).join("");
  }
  async function refreshPublicQA() {
    const url = SUPABASE_URL +
      "/rest/v1/qa_entries?select=id,question,answer,sort_order&published=eq.true&order=sort_order.asc,created_at.asc&limit=100";
    try {
      const response = await fetch(url, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY } });
      if (!response.ok) throw new Error("Could not fetch the Q&A (" + response.status + ")");
      const entries = await response.json();
      if (!Array.isArray(entries)) throw new Error("Unexpected Q&A response");
      renderPublic(entries);
    } catch (error) {
      el("qaItems").innerHTML =
        '<div class="qa-empty qa-error">The Q&A could not load. Please refresh the page later.</div>';
    }
  }
  // MORE menu is accessible from mouse and keyboard.
  function closeMore() {
    el("moreMenu").hidden = true;
    el("moreToggle").setAttribute("aria-expanded", "false");
  }
  el("moreToggle").addEventListener("click", () => {
    const next = !el("moreMenu").hidden;
    el("moreMenu").hidden = next;
    el("moreToggle").setAttribute("aria-expanded", String(!next));
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest("#moreWrap")) closeMore();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !el("moreMenu").hidden) {
      closeMore();
      el("moreToggle").focus();
    }
  });
  window.addEventListener("hashchange", closeMore);

  function getFormData(form) {
    const formData = new FormData(form);
    const question = String(formData.get("question") ?? "").trim();
    const answer = String(formData.get("answer") ?? "").trim();
    const sortOrder = Number(formData.get("sort_order"));
    if (question.length < 3 || question.length > 220) throw new Error("Questions must be 3–220 characters.");
    if (!answer || answer.length > 5000) throw new Error("Answers must be 1–5,000 characters.");
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 100000)
      throw new Error("Order must be a number between 0 and 100000.");
    return { question, answer, sort_order: sortOrder, published: formData.has("published") };
  }
  function renderOwnerEditor() {
    const list = el("qaEditorList");
    if (!state.ownerRows.length) {
      list.innerHTML = '<p class="qa-owner-hint">There are no questions yet. Add one below.</p>';
      return;
    }
    list.innerHTML = state.ownerRows.map((entry) =>
      '<form class="qa-edit-form qa-existing-form" data-qa-id="' + safe(entry.id) + '">' +
        '<label>Question<input name="question" required minlength="3" maxlength="220" value="' +
          safe(entry.question) + '"></label>' +
        '<label>Answer<textarea name="answer" rows="4" maxlength="5000" required>' +
          safe(entry.answer) + '</textarea></label>' +
        '<div class="qa-form-actions">' +
          '<label>Order<input name="sort_order" type="number" min="0" max="100000" required value="' +
            safe(entry.sort_order) + '"></label>' +
          '<label class="qa-check"><input type="checkbox" name="published"' +
            (entry.published ? ' checked' : '') + '> Published</label>' +
          '<button type="submit" class="qa-primary-btn">Save changes</button>' +
          '<button type="button" class="qa-delete-btn" data-qa-delete="' +
            safe(entry.id) + '">Delete</button>' +
        '</div>' +
      '</form>'
    ).join("");
  }
  async function refreshOwnerEditor() {
    if (!state.authorized || !state.client) return;
    const { data, error } = await state.client.from("qa_entries")
      .select("id,question,answer,sort_order,published,created_at,updated_at")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    state.ownerRows = data || [];
    renderOwnerEditor();
  }
  async function setSession(session) {
    state.authorized = false;
    el("qaEditorPanel").hidden = true;
    el("qaNotAuthorized").hidden = true;
    el("qaLoginForm").hidden = !!session;
    el("qaSessionTools").hidden = !session;
    if (!session) {
      el("qaLoggedEmail").textContent = "";
      return;
    }
    el("qaLoggedEmail").textContent = "Signed in: " + (session.user?.email || "Account");
    if (!state.client) return;
    try {
      const { data, error } = await state.client.from("qa_editors")
        .select("user_id").eq("user_id", session.user.id).maybeSingle();
      if (error) throw error;
      if (!data) {
        el("qaNotAuthorized").hidden = false;
        message("Signed in. Q&A editing is waiting for owner authorization.");
        return;
      }
      state.authorized = true;
      el("qaEditorPanel").hidden = false;
      await refreshOwnerEditor();
      message("Editor access active. Your updates will appear for everyone.");
    } catch (error) {
      el("qaNotAuthorized").hidden = false;
      message("Could not verify editor access. " + (error.message || "Try again."), true);
    }
  }
  async function initAuth() {
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      message("The sign-in service did not load. Editing is still available in the Supabase Table Editor.", true);
      el("qaLoginForm").hidden = true;
      return;
    }
    state.client = window.supabase.createClient(
      SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
    );
    state.client.auth.onAuthStateChange((_event, session) => {
      // Defer database calls outside the auth change callback to avoid deadlocks.
      Promise.resolve().then(() => setSession(session)).catch((error) => message(error.message, true));
    });
    const { data, error } = await state.client.auth.getSession();
    if (error) { message(error.message, true); return; }
    await setSession(data?.session ?? null);
  }
  el("qaLoginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.client) return;
    const email = el("qaLoginEmail").value.trim();
    if (!email) return;
    const button = event.target.querySelector('button[type="submit"]');
    button.disabled = true;
    message("Sending a secure login link…");
    const redirect = location.origin + location.pathname + "?qa=edit";
    try {
      const { error } = await state.client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirect, shouldCreateUser: true }
      });
      if (error) throw error;
      message("Check your email for a Supabase sign-in link. Open it in this browser.");
    } catch (error) {
      message("Sign-in link failed: " + error.message, true);
    } finally { button.disabled = false; }
  });
  el("qaLogoutButton").addEventListener("click", async () => {
    if (!state.client) return;
    const { error } = await state.client.auth.signOut();
    if (error) return message(error.message, true);
    await setSession(null);
    message("Signed out.");
  });

  async function performWrite(operation) {
    if (!state.authorized || !state.client || state.loadingEditor) return;
    state.loadingEditor = true;
    message("Saving Q&A changes…");
    try {
      await operation();
      await Promise.all([refreshOwnerEditor(), refreshPublicQA()]);
      message("Saved! Your published changes are now shared.");
    } catch (error) {
      message("Could not save: " + (error?.message || "Unknown error"), true);
    } finally {
      state.loadingEditor = false;
    }
  }
  el("qaEditorList").addEventListener("submit", (event) => {
    const form = event.target.closest("form[data-qa-id]");
    if (!form) return;
    event.preventDefault();
    performWrite(async () => {
      const values = getFormData(form);
      const { data, error } = await state.client.from("qa_entries")
        .update(values).eq("id", form.dataset.qaId).select("id").single();
      if (error || !data) throw error || new Error("Edit was not authorized");
    });
  });
  el("qaAddForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target;
    performWrite(async () => {
      const values = getFormData(form);
      const { data, error } = await state.client.from("qa_entries")
        .insert(values).select("id").single();
      if (error || !data) throw error || new Error("Create was not authorized");
      form.reset();
    });
  });
  el("qaEditorList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-qa-delete]");
    if (!button || !state.authorized) return;
    const row = state.ownerRows.find((entry) => entry.id === button.dataset.qaDelete);
    if (!row || !window.confirm('Delete "' + row.question + '" permanently?')) return;
    performWrite(async () => {
      const { data, error } = await state.client.from("qa_entries")
        .delete().eq("id", row.id).select("id").single();
      if (error || !data) throw error || new Error("Delete was not authorized");
    });
  });

  refreshPublicQA();
  initAuth().catch((error) => message("Q&A sign-in could not initialize: " + error.message, true));
})();
