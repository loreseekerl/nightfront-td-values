// Developer Q&A: public Supabase content + restricted owner editing.
// There are NO administrator secrets or passwords in this public file.
(() => {
  "use strict";

  const el = (id) => document.getElementById(id);
  const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[character]));
  const loginExpired = new URLSearchParams(location.hash.slice(1)).get("error_code") === "otp_expired";
  const privateEditLink = new URLSearchParams(location.search).get("qa") === "edit" || loginExpired;
  const state = {
    client: null, authorized: false, ownerRows: [], loadingEditor: false, sessionVersion: 0,
    otpEmail: null, nextEmailAt: 0, emailSending: false, verifyingOtp: false
  };

  // Visitors never see the editor or its claim form on the public Q&A page.
  // A private ?qa=edit URL is needed for signing in before claiming ownership.
  function syncOwnerVisibility() {
    const tools = el("qaOwnerTools");
    tools.hidden = !(state.authorized || privateEditLink);
    if (tools.hidden) tools.open = false;
    else if (privateEditLink) tools.open = true;
  }
  syncOwnerVisibility();

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
    const version = ++state.sessionVersion;
    state.authorized = false;
    el("qaEditorPanel").hidden = true;
    el("qaNotAuthorized").hidden = true;
    el("qaClaimPanel").hidden = true;
    el("qaLoginForm").hidden = !!session;
    el("qaEmailCodeForm").hidden = !!session || !state.otpEmail;
    el("qaSessionTools").hidden = !session;
    syncOwnerVisibility();

    if (!session) {
      el("qaLoggedEmail").textContent = "";
      if (loginExpired) {
        message("That email sign-in link has expired or has already been used. Request a fresh link below, then open only the newest email link once.", true);
      } else if (privateEditLink) message("Sign in to claim or manage the Q&A.");
      return;
    }
    el("qaLoggedEmail").textContent = "Signed in: " + (session.user?.email || "Account");
    if (!state.client) return;
    try {
      // Supabase RLS lets an account read only its own owner membership.
      const { data, error } = await state.client.from("qa_editors")
        .select("user_id").eq("user_id", session.user.id).maybeSingle();
      if (version !== state.sessionVersion) return;
      if (error) throw error;

      if (!data) {
        if (!privateEditLink) {
          // Non-owners visiting normally should never see admin controls.
          syncOwnerVisibility();
          return;
        }
        // Only an authenticated visitor at the private owner link may see the
        // one-time claim form, and only before the first successful claim.
        const result = await state.client.rpc("qa_owner_claimed");
        if (version !== state.sessionVersion) return;
        if (result.error) throw result.error;
        const isClaimed = result.data === true;
        el("qaClaimPanel").hidden = isClaimed;
        el("qaNotAuthorized").hidden = !isClaimed;
        message(isClaimed
          ? "The Q&A has already been claimed. Only its owner can edit it."
          : "Enter your one-time claim code to secure the Q&A.");
        syncOwnerVisibility();
        return;
      }

      // A confirmed owner alone sees the editing toggle and controls.
      state.authorized = true;
      el("qaClaimPanel").hidden = true;
      el("qaNotAuthorized").hidden = true;
      el("qaEditorPanel").hidden = false;
      syncOwnerVisibility();
      await refreshOwnerEditor();
      if (version !== state.sessionVersion) return;
      message("Owner access active. Your Q&A changes appear for everyone.");
    } catch (error) {
      if (version !== state.sessionVersion) return;
      state.authorized = false;
      el("qaEditorPanel").hidden = true;
      el("qaClaimPanel").hidden = true;
      if (privateEditLink) {
        el("qaNotAuthorized").hidden = false;
        message("Could not verify ownership. " + (error.message || "Try again."), true);
      }
      syncOwnerVisibility();
    }
  }
  async function initAuth() {
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      message("The sign-in service did not load. Editing is still available in the Supabase Table Editor.", true);
      el("qaLoginForm").hidden = true;
      return;
    }
    state.client = window.__nightfrontAuthClient ||
      (window.__nightfrontAuthClient = window.supabase.createClient(
        SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY,
        { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
      ));
    state.client.auth.onAuthStateChange((_event, session) => {
      // Defer database calls outside the auth change callback to avoid deadlocks.
      Promise.resolve().then(() => setSession(session)).catch((error) => message(error.message, true));
    });
    const { data, error } = await state.client.auth.getSession();
    if (error) { message(error.message, true); return; }
    await setSession(data?.session ?? null);
  }
  function readableAuthError(error) {
    const raw = String(error?.message || "Please try again.");
    if (/rate limit|too many requests|429/i.test(raw))
      return "Email rate limit reached. Wait before requesting another code (often about an hour), or sign in with your owner password if you have one.";
    if (/token.*(expired|invalid)|otp.*(expired|invalid)/i.test(raw))
      return "That code expired or was already used. Request a new code when the email limit allows, and use only the latest email.";
    return raw;
  }
  const emailRedirect = "https://loreseekerl.github.io/nightfront-td-values/?qa=edit#qa";
  el("qaLoginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.client) return;
    const email = el("qaLoginEmail").value.trim();
    const password = el("qaLoginPassword").value;
    if (!email) return;
    if (!password) {
      message("Enter your password, or use EMAIL ME A SIGN-IN CODE for your first login.", true);
      el("qaLoginPassword").focus();
      return;
    }
    const button = el("qaPasswordLoginButton");
    button.disabled = true;
    message("Signing in…");
    try {
      const {data,error} = await state.client.auth.signInWithPassword({email,password});
      if (error) throw error;
      el("qaLoginPassword").value = "";
      if (data?.session) await setSession(data.session);
      message("Signed in. Checking owner access…");
    } catch (error) {
      message("Password login failed: " + readableAuthError(error), true);
    } finally { button.disabled = false; }
  });
  el("qaEmailCodeButton").addEventListener("click", async () => {
    if (!state.client || state.emailSending) return;
    const emailInput = el("qaLoginEmail");
    if (!emailInput.reportValidity()) return;
    const now = Date.now();
    if (now < state.nextEmailAt) {
      message("Please wait before requesting another email. Use the newest code or link already sent.", true);
      return;
    }
    const email = emailInput.value.trim();
    state.emailSending = true;
    const button = el("qaEmailCodeButton");
    button.disabled = true;
    message("Requesting one sign-in email…");
    try {
      const {error} = await state.client.auth.signInWithOtp({
        email,
        options: {emailRedirectTo:emailRedirect, shouldCreateUser:true}
      });
      if (error) throw error;
      state.otpEmail = email;
      state.nextEmailAt = Date.now() + 60000;
      el("qaEmailCodeForm").hidden = false;
      el("qaEmailCode").value = "";
      message("Email requested. Enter the six-digit code if one is included, or open the latest sign-in link once. Avoid requesting multiple emails.");
      el("qaEmailCode").focus();
    } catch (error) {
      message("Could not send email: " + readableAuthError(error), true);
    } finally {
      state.emailSending = false;
      // The server has stricter rate limits too; this is just a local guard.
      if (state.nextEmailAt > Date.now()) {
        setTimeout(() => { button.disabled = false; },state.nextEmailAt-Date.now());
      } else button.disabled = false;
    }
  });
  el("qaEmailCodeForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.client || !state.otpEmail || state.verifyingOtp) return;
    const token = el("qaEmailCode").value.trim();
    if (!/^\d{6}$/.test(token)) {
      message("Enter the six digits from your newest sign-in email.", true);
      return;
    }
    const button = event.target.querySelector('button[type="submit"]');
    button.disabled = true;
    state.verifyingOtp = true;
    message("Verifying your email code…");
    try {
      const {data,error} = await state.client.auth.verifyOtp({
        email:state.otpEmail,token,type:"email"
      });
      if (error) throw error;
      state.otpEmail = null;
      el("qaEmailCode").value = "";
      el("qaEmailCodeForm").hidden = true;
      if (data?.session) await setSession(data.session);
    } catch (error) {
      message("Email code failed: " + readableAuthError(error), true);
    } finally {
      state.verifyingOtp = false;
      button.disabled = false;
    }
  });
  el("qaPasswordForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.authorized || !state.client) return;
    const password = el("qaNewPassword").value;
    const confirmPassword = el("qaConfirmPassword").value;
    if (password.length < 12 || password !== confirmPassword) {
      message("Use at least 12 characters and make sure both passwords match.", true);
      return;
    }
    const button = event.target.querySelector('button[type="submit"]');
    button.disabled = true;
    message("Setting your owner password…");
    try {
      const {error} = await state.client.auth.updateUser({password});
      if (error) throw error;
      event.target.reset();
      message("Owner password saved! Next time, use the password sign-in option on the private dashboard.");
    } catch (error) {
      message("Password setup failed: " + readableAuthError(error), true);
    } finally { button.disabled = false; }
  });
  el("qaClaimForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.client || !privateEditLink) return;
    const codeInput = el("qaClaimCode");
    const code = codeInput.value.trim();
    if (!code) return;
    const button = event.target.querySelector('button[type="submit"]');
    button.disabled = true;
    message("Checking your owner claim code…");
    try {
      const { data, error } = await state.client.rpc("claim_qa_owner", { claim_code: code });
      if (error) throw error;
      if (data !== true) {
        // The claim may have been taken by another account since this page opened.
        const status = await state.client.rpc("qa_owner_claimed");
        if (!status.error && status.data === true) {
          el("qaClaimPanel").hidden = true;
          el("qaNotAuthorized").hidden = false;
          message("Ownership is already claimed. Other accounts cannot access the editor.", true);
        } else {
          message("That claim code is incorrect. Check your private code and try again.", true);
        }
        return;
      }
      codeInput.value = ""; // Never keep the used claim secret in the input.
      const sessionResult = await state.client.auth.getSession();
      if (sessionResult.error || !sessionResult.data?.session) {
        throw sessionResult.error || new Error("Please sign in again.");
      }
      await setSession(sessionResult.data.session);
      message("Ownership claimed! Only this account can open the Q&A editor.");
    } catch (error) {
      message("Claim failed: " + (error?.message || "Try again."), true);
    } finally {
      button.disabled = false;
    }
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
