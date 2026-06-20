/* =========================================================
   FITCHECK — wardrobe.js
   Auth (Supabase magic link), wardrobe items, outfit combos,
   day assignment, paywall gating.
   ========================================================= */

(function () {
  "use strict";

  const cfg = window.FITCHECK_CONFIG;
  const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const FREE_ITEM_LIMIT = cfg.FREE_CLOSET_ITEM_LIMIT || 10;

  const authGate = document.getElementById("authGate");
  const closetApp = document.getElementById("closetApp");
  const authEmail = document.getElementById("authEmail");
  const authSendBtn = document.getElementById("authSendBtn");
  const authMsg = document.getElementById("authMsg");
  const signOutBtn = document.getElementById("signOutBtn");
  const planPill = document.getElementById("planPill");
  const itemGrid = document.getElementById("itemGrid");
  const paywallNote = document.getElementById("paywallNote");
  const itemFileInput = document.getElementById("itemFileInput");
  const comboLocked = document.getElementById("comboLocked");
  const comboUnlocked = document.getElementById("comboUnlocked");
  const comboCheckBtn = document.getElementById("comboCheckBtn");
  const comboResult = document.getElementById("comboResult");
  const dayPicker = document.getElementById("dayPicker");

  let currentUser = null;
  let userPlan = "free"; // "free" | "pro" | "closet"
  let closetUnlocked = false; // only true plan === "closet"
  let wardrobeItems = [];
  let selectedItemIds = new Set();
  let selectedDay = null;

  /* ---------- AUTH ---------- */

  authSendBtn.addEventListener("click", async () => {
    const email = authEmail.value.trim();
    if (!email) return;
    authSendBtn.disabled = true;
    authSendBtn.textContent = "Sending...";

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href },
    });

    authSendBtn.disabled = false;
    authSendBtn.textContent = "Send magic link →";
    authMsg.style.display = "block";
    authMsg.textContent = error
      ? "Couldn't send that — check the email and try again."
      : "Check your inbox — tap the link to come back here signed in.";
  });

  signOutBtn.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.reload();
  });

  async function initAuth() {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      currentUser = data.session.user;
      authGate.style.display = "none";
      closetApp.style.display = "block";
      await loadProfile();
      await loadItems();
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
    closetUnlocked = userPlan === "closet";

    const planLabels = { free: "Free plan", pro: "Style Pro ✓", closet: "Closet plan ✓" };
    planPill.textContent = planLabels[userPlan];
    planPill.classList.toggle("active", userPlan !== "free");

    comboLocked.style.display = closetUnlocked ? "none" : "block";
    comboUnlocked.style.display = closetUnlocked ? "block" : "none";
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
      card.innerHTML = `
        <img src="${item.image_url}" alt="${escapeHtml(item.description || item.category || "item")}">
        <div class="item-meta">
          <div class="cat">${escapeHtml(item.category || "")}</div>
          <div class="desc">${escapeHtml(item.ai_description || "")}</div>
        </div>
        <div class="check">✓</div>
      `;
      if (closetUnlocked) {
        card.addEventListener("click", () => toggleSelect(item.id, card));
      }
      itemGrid.appendChild(card);
    });

    const atLimit = !closetUnlocked && wardrobeItems.length >= FREE_ITEM_LIMIT;
    if (!atLimit) {
      const addCard = document.createElement("div");
      addCard.className = "add-item-card";
      addCard.innerHTML = "+ Add item";
      addCard.addEventListener("click", () => itemFileInput.click());
      itemGrid.appendChild(addCard);
    }

    paywallNote.style.display = !closetUnlocked ? "block" : "none";
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
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    itemFileInput.value = "";
    await addItem(file);
  });

  async function addItem(file) {
    const reader = new FileReader();
    const dataUrl = await new Promise((resolve) => {
      reader.onload = (ev) => resolve(ev.target.result);
      reader.readAsDataURL(file);
    });
    const base64 = dataUrl.split(",")[1];

    try {
      // 1. Tag the item via Claude vision
      const tagRes = await fetch("/.netlify/functions/tag-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mediaType: file.type }),
      });
      if (!tagRes.ok) throw new Error("Tagging failed");
      const tagData = await tagRes.json();

      // 2. Upload the image to Cloudinary (unsigned preset)
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", cfg.CLOUDINARY_UPLOAD_PRESET);
      const uploadRes = await fetch(
        `https://api.cloudinary.com/v1_1/${cfg.CLOUDINARY_CLOUD_NAME}/image/upload`,
        { method: "POST", body: formData }
      );
      if (!uploadRes.ok) throw new Error("Image upload failed");
      const uploadData = await uploadRes.json();

      // 3. Save to Supabase
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
      alert("Couldn't add that item — try again.");
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
        }),
      });
      if (!res.ok) throw new Error("Combo check failed");
      const data = await res.json();

      comboResult.style.display = "block";
      comboResult.innerHTML = `
        <h4>${escapeHtml((data.rating || "").toUpperCase())}</h4>
        <p>${escapeHtml(data.verdict || "")}</p>
        ${data.tweak ? `<p style="color:var(--lime);">${escapeHtml(data.tweak)}</p>` : ""}
      `;

      // Save the outfit (with day assignment if picked)
      await supabase.from("outfits").insert([
        {
          user_id: currentUser.id,
          item_ids: [...selectedItemIds],
          assigned_day: selectedDay,
          ai_verdict: data.verdict,
        },
      ]);
    } catch (err) {
      console.error(err);
      alert("Couldn't check that combo — try again.");
    } finally {
      comboCheckBtn.disabled = false;
      comboCheckBtn.textContent = "Check this combo →";
    }
  });

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  initAuth();
})();
