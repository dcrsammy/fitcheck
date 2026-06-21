/* =========================================================
   FITCHECK — wardrobe.js
   Email/password auth, wardrobe items, outfit combos,
   day assignment, optional context prompts, multi-upload.
   ========================================================= */

(function () {
  "use strict";

  const cfg = window.FITCHECK_CONFIG;
  const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const FREE_ITEM_LIMIT = cfg.FREE_CLOSET_ITEM_LIMIT || 10;

  const authGate = document.getElementById("authGate");
  const closetApp = document.getElementById("closetApp");
  const tabSignIn = document.getElementById("tabSignIn");
  const tabSignUp = document.getElementById("tabSignUp");
  const signInForm = document.getElementById("signInForm");
  const signUpForm = document.getElementById("signUpForm");
  const signInEmail = document.getElementById("signInEmail");
  const signInPassword = document.getElementById("signInPassword");
  const signInBtn = document.getElementById("signInBtn");
  const signUpEmail = document.getElementById("signUpEmail");
  const signUpPassword = document.getElementById("signUpPassword");
  const signUpBtn = document.getElementById("signUpBtn");
  const authMsg = document.getElementById("authMsg");
  const signOutBtn = document.getElementById("signOutBtn");
  const planPill = document.getElementById("planPill");
  const itemGrid = document.getElementById("itemGrid");
  const itemPromptInput = document.getElementById("itemPromptInput");
  const paywallNote = document.getElementById("paywallNote");
  const itemFileInput = document.getElementById("itemFileInput");
  const comboUnlocked = document.getElementById("comboUnlocked");
  const comboPromptInput = document.getElementById("comboPromptInput");
  const comboCheckBtn = document.getElementById("comboCheckBtn");
  const comboResult = document.getElementById("comboResult");
  const dayPicker = document.getElementById("dayPicker");

  let currentUser = null;
  let userPlan = "free";
  let unlimitedItems = false;
  let wardrobeItems = [];
  let selectedItemIds = new Set();
  let selectedDay = null;

  /* ---------- AUTH TABS ---------- */

  tabSignIn.addEventListener("click", () => {
    tabSignIn.classList.add("active");
    tabSignUp.classList.remove("active");
    signInForm.style.display = "block";
    signUpForm.style.display = "none";
    authMsg.style.display = "none";
  });

  tabSignUp.addEventListener("click", () => {
    tabSignUp.classList.add("active");
    tabSignIn.classList.remove("active");
    signUpForm.style.display = "block";
    signInForm.style.display = "none";
    authMsg.style.display = "none";
  });

  signUpBtn.addEventListener("click", async () => {
    const email = signUpEmail.value.trim();
    const password = signUpPassword.value;
    if (!email || password.length < 6) {
      showAuthMsg("Enter a valid email and a password of at least 6 characters.");
      return;
    }
    signUpBtn.disabled = true;
    signUpBtn.textContent = "Creating...";

    const { data, error } = await supabase.auth.signUp({ email, password });

    signUpBtn.disabled = false;
    signUpBtn.textContent = "Create account \u2192";

    if (error) {
      showAuthMsg(error.message || "Couldn't create that account — try again.");
      return;
    }

    if (data.session) {
      currentUser = data.session.user;
      showApp();
    } else {
      showAuthMsg("Account created. Check your email to confirm, then sign in.");
    }
  });

  signInBtn.addEventListener("click", async () => {
    const email = signInEmail.value.trim();
    const password = signInPassword.value;
    if (!email || !password) {
      showAuthMsg("Enter your email and password.");
      return;
    }
    signInBtn.disabled = true;
    signInBtn.textContent = "Signing in...";

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    signInBtn.disabled = false;
    signInBtn.textContent = "Sign in \u2192";

    if (error) {
      showAuthMsg(error.message || "Couldn't sign in — check your email and password.");
      return;
    }

    currentUser = data.session.user;
    showApp();
  });

  function showAuthMsg(text) {
    authMsg.style.display = "block";
    authMsg.textContent = text;
  }

  signOutBtn.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.reload();
  });

  async function showApp() {
    authGate.style.display = "none";
    closetApp.style.display = "block";
    await loadProfile();
    await loadItems();
  }

  async function initAuth() {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      currentUser = data.session.user;
      await showApp();
    } else {
      authGate.style.display = "block";
      closetApp.style.display = "none";
    }
  }

  /* ---------- PROFILE / PLAN ---------- */

  async function loadProfile() {
    const { data, error } = await supabase
      .from("profiles")
      .select("plan, plan_expires_at")
      .eq("id", currentUser.id)
      .single();

    userPlan = "free";
    if (!error && data) {
      const notExpired = !data.plan_expires_at || new Date(data.plan_expires_at) > new Date();
      userPlan = notExpired ? (data.plan || "free") : "free";
    }
    unlimitedItems = userPlan === "closet";

    const planLabels = { free: "Free plan", pro: "Style Pro \u2713", closet: "Closet plan \u2713" };
    planPill.textContent = planLabels[userPlan];
    planPill.classList.toggle("active", userPlan !== "free");

    comboUnlocked.style.display = "block";
  }

  /* ---------- WARDROBE ITEMS ---------- */

  async function loadItems() {
    const { data, error } = await supabase
      .from("wardrobe_items")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false });

    wardrobeItems = error ? [] : data;
    renderGrid();
  }

  function renderGrid() {
    itemGrid.innerHTML = "";

    wardrobeItems.forEach((item) => {
      const card = document.createElement("div");
      card.className = "item-card";
      card.dataset.id = item.id;
      card.innerHTML =
        '<img src="' + item.image_url + '" alt="' + escapeHtml(item.category || "item") + '">' +
        '<div class="item-meta">' +
        '<div class="cat">' + escapeHtml(item.category || "") + "</div>" +
        "</div>" +
        '<div class="check">\u2713</div>';
      card.addEventListener("click", () => toggleSelect(item.id, card));
      itemGrid.appendChild(card);
    });

    const atLimit = !unlimitedItems && wardrobeItems.length >= FREE_ITEM_LIMIT;
    if (!atLimit) {
      const addCard = document.createElement("div");
      addCard.className = "add-item-card";
      addCard.innerHTML = "+ Add item";
      addCard.addEventListener("click", () => itemFileInput.click());
      itemGrid.appendChild(addCard);
    }

    paywallNote.style.display = !unlimitedItems ? "block" : "none";
    if (!unlimitedItems) {
      paywallNote.innerHTML =
        "Free trial: " + wardrobeItems.length + "/" + FREE_ITEM_LIMIT +
        ' items used. <a href="pricing.html" style="color:var(--lime);text-decoration:underline;">Go unlimited with Closet \u2014 \u20a650,000/month.</a>';
    }
  }

  function toggleSelect(id, card) {
    if (selectedItemIds.has(id)) {
      selectedItemIds.delete(id);
      card.classList.remove("selected");
    } else {
      selectedItemIds.add(id);
      card.classList.add("selected");
    }
    comboCheckBtn.disabled = selectedItemIds.size < 2;
    comboResult.style.display = "none";
  }

  itemFileInput.addEventListener("change", async (e) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    itemFileInput.value = "";
    if (!files.length) return;

    // Respect the free-tier item cap — only upload as many as fit
    const remaining = unlimitedItems ? files.length : Math.max(0, FREE_ITEM_LIMIT - wardrobeItems.length);
    const toUpload = files.slice(0, remaining);

    if (toUpload.length < files.length) {
      alert(
        "Only " + toUpload.length + " of " + files.length +
        " photos were added — that's your free trial limit. Upgrade to Closet for unlimited."
      );
    }

    for (const file of toUpload) {
      await addItem(file);
    }
  });

  async function addItem(file) {
    const note = itemPromptInput ? itemPromptInput.value.trim().slice(0, 300) : "";

    const reader = new FileReader();
    const dataUrl = await new Promise((resolve) => {
      reader.onload = (ev) => resolve(ev.target.result);
      reader.readAsDataURL(file);
    });
    const base64 = dataUrl.split(",")[1];

    try {
      const tagRes = await fetch("/.netlify/functions/tag-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mediaType: file.type, userPrompt: note }),
      });
      if (!tagRes.ok) throw new Error("Tagging failed");
      const tagData = await tagRes.json();

      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", cfg.CLOUDINARY_UPLOAD_PRESET);
      const uploadRes = await fetch(
        "https://api.cloudinary.com/v1_1/" + cfg.CLOUDINARY_CLOUD_NAME + "/image/upload",
        { method: "POST", body: formData }
      );
      if (!uploadRes.ok) throw new Error("Image upload failed");
      const uploadData = await uploadRes.json();

      const { error } = await supabase.from("wardrobe_items").insert([
        {
          user_id: currentUser.id,
          image_url: uploadData.secure_url,
          category: tagData.category,
          color: tagData.color,
          tags: tagData.tags,
          ai_description: tagData.description,
        },
      ]);
      if (error) throw error;

      await loadItems();
    } catch (err) {
      console.error(err);
      alert("Couldn't add one of those items \u2014 try again.");
    }
  }

  /* ---------- DAY PICKER ---------- */

  dayPicker.addEventListener("click", (e) => {
    const chip = e.target.closest(".day-chip");
    if (!chip) return;
    const wasActive = chip.classList.contains("active");
    [...dayPicker.children].forEach((c) => c.classList.remove("active"));
    if (!wasActive) {
      chip.classList.add("active");
      selectedDay = chip.dataset.day;
    } else {
      selectedDay = null;
    }
  });

  /* ---------- COMBO CHECK ---------- */

  comboCheckBtn.addEventListener("click", async () => {
    const items = wardrobeItems.filter((it) => selectedItemIds.has(it.id));
    if (items.length < 2) return;

    const note = comboPromptInput ? comboPromptInput.value.trim().slice(0, 300) : "";

    comboCheckBtn.disabled = true;
    comboCheckBtn.textContent = "Checking...";

    try {
      const res = await fetch("/.netlify/functions/combo-verdict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((it) => ({
            category: it.category,
            color: it.color,
            tags: it.tags,
            description: it.ai_description,
          })),
          userPrompt: note,
        }),
      });
      if (!res.ok) throw new Error("Combo check failed");
      const data = await res.json();

      comboResult.style.display = "block";
      comboResult.innerHTML =
        "<h4>" + escapeHtml((data.rating || "").toUpperCase()) + "</h4>" +
        "<p>" + escapeHtml(data.verdict || "") + "</p>" +
        (data.tweak ? '<p style="color:var(--lime);">' + escapeHtml(data.tweak) + "</p>" : "");

      await supabase.from("outfits").insert([
        {
          user_id: currentUser.id,
          item_ids: [...selectedItemIds],
          assigned_day: selectedDay,
          ai_verdict: data.verdict,
        },
      ]);

      if (comboPromptInput) comboPromptInput.value = "";
    } catch (err) {
      console.error(err);
      alert("Couldn't check that combo \u2014 try again.");
    } finally {
      comboCheckBtn.disabled = false;
      comboCheckBtn.textContent = "Check this combo \u2192";
    }
  });

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  initAuth();
})();
