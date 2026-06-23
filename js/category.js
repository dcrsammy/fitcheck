/* =========================================================
   FITCHECK — category.js
   Single category grid page with item selection + combo check.
   Cross-page outfit builder using sessionStorage.
   ========================================================= */

(function () {
  "use strict";

  const cfg = window.FITCHECK_CONFIG;
  const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const params = new URLSearchParams(window.location.search);
  const catKey = params.get("cat") || "top";
  const catLabel = params.get("label") || "Items";

  document.getElementById("categoryTitle").textContent = catLabel;
  document.title = catLabel + " — FitCheck";

  const categoryGrid = document.getElementById("categoryGrid");
  const buildOutfitBar = document.getElementById("buildOutfitBar");
  const comboCheckBtn = document.getElementById("comboCheckBtn");
  const comboResult = document.getElementById("comboResult");
  const comboPromptInput = document.getElementById("comboPromptInput");
  const dayPicker = document.getElementById("dayPicker");
  const itemFileInput = document.getElementById("itemFileInput");
  const addItemsBtn = document.getElementById("addItemsBtn");

  let currentUser = null;
  let userPlan = "free";
  let unlimitedItems = false;
  let categoryItems = [];
  let allItems = [];
  let selectedItemIds = new Set();
  let selectedDay = null;

  /* ---------- OUTFIT SESSION STORAGE ---------- */

  function getOutfitCart() {
    try { return JSON.parse(sessionStorage.getItem("fitcheck_outfit") || "[]"); }
    catch (e) { return []; }
  }

  function saveOutfitCart(ids) {
    sessionStorage.setItem("fitcheck_outfit", JSON.stringify([...ids]));
  }

  function clearOutfitCart() {
    sessionStorage.removeItem("fitcheck_outfit");
  }

  /* ---------- AUTH ---------- */

  async function init() {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      currentUser = data.session.user;
      await loadProfile();
      await loadItems();
      return;
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        subscription.unsubscribe();
        if (!session) { window.location.href = "wardrobe.html"; return; }
        currentUser = session.user;
        await loadProfile();
        await loadItems();
      }
    );
    setTimeout(() => { window.location.href = "wardrobe.html"; }, 3000);
  }

  /* ---------- PROFILE ---------- */

  async function loadProfile() {
    const { data, error } = await supabase
      .from("profiles").select("plan, plan_expires_at").eq("id", currentUser.id).single();
    userPlan = "free";
    if (!error && data) {
      const notExpired = !data.plan_expires_at || new Date(data.plan_expires_at) > new Date();
      userPlan = notExpired ? (data.plan || "free") : "free";
    }
    unlimitedItems = userPlan === "closet";
    buildOutfitBar.style.display = "block";
  }

  /* ---------- ITEMS ---------- */

  async function loadItems() {
    const { data, error } = await supabase
      .from("wardrobe_items").select("*").eq("user_id", currentUser.id)
      .order("created_at", { ascending: false });
    allItems = error ? [] : data;
    categoryItems = allItems.filter((it) => (it.category || "other").toLowerCase() === catKey);

    const saved = getOutfitCart();
    selectedItemIds = new Set(saved);

    renderGrid();
    updateOutfitBar();
  }

  function renderGrid() {
    categoryGrid.innerHTML = "";
    if (!categoryItems.length) {
      categoryGrid.innerHTML = '<p style="color:var(--muted);padding:24px 0;">No items here yet. Add some below.</p>';
      return;
    }
    categoryItems.forEach((item) => {
      const card = document.createElement("div");
      card.className = "item-card" + (selectedItemIds.has(item.id) ? " selected" : "");
      card.dataset.id = item.id;
      card.innerHTML =
        '<img src="' + item.image_url + '" alt="' + escapeHtml(item.category || "item") + '">' +
        '<div class="item-meta"></div>' +
        '<div class="check">\u2713</div>';
      card.addEventListener("click", () => toggleSelect(item.id, card));
      categoryGrid.appendChild(card);
    });
  }

  function toggleSelect(id, card) {
    if (selectedItemIds.has(id)) {
      selectedItemIds.delete(id);
      card.classList.remove("selected");
    } else {
      selectedItemIds.add(id);
      card.classList.add("selected");
    }
    saveOutfitCart(selectedItemIds);
    updateOutfitBar();
    comboResult.style.display = "none";
  }

  function updateOutfitBar() {
    const total = selectedItemIds.size;
    comboCheckBtn.disabled = total < 2;
    comboCheckBtn.textContent = total > 0 ? "Check combo (" + total + ") \u2192" : "Check combo \u2192";

    const outfitBar = document.getElementById("outfitBar");
    const outfitBarCount = document.getElementById("outfitBarCount");
    const outfitCheckBtn = document.getElementById("outfitCheckBtn");

    if (outfitBar) {
      if (total > 0) {
        outfitBar.style.display = "flex";
        if (outfitBarCount) outfitBarCount.textContent = total + " item" + (total === 1 ? "" : "s") + " in outfit";
      } else {
        outfitBar.style.display = "none";
      }
    }

    if (outfitCheckBtn) {
      outfitCheckBtn.onclick = async () => {
        const selectedItems = allItems.filter((it) => selectedItemIds.has(it.id));
        if (selectedItems.length < 2) {
          alert("Select at least 2 items to check a combo.");
          return;
        }
        outfitCheckBtn.disabled = true;
        outfitCheckBtn.textContent = "Checking...";
        try {
          const res = await fetch("/.netlify/functions/combo-verdict", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: selectedItems.map((it) => ({
                category: it.category, color: it.color,
                tags: it.tags, description: it.ai_description,
              })),
              userPrompt: "",
            }),
          });
          if (!res.ok) throw new Error("Failed");
          const data = await res.json();
          const thumbsHtml = selectedItems
            .map((it) => '<img src="' + it.image_url + '" alt="" class="combo-thumb">').join("");
          comboResult.style.display = "block";
          comboResult.innerHTML =
            '<div class="combo-thumbs">' + thumbsHtml + "</div>" +
            "<h4>" + escapeHtml((data.rating || "").toUpperCase()) + "</h4>" +
            "<p>" + escapeHtml(data.verdict || "") + "</p>" +
            (data.tweak ? '<p style="color:var(--lime);">' + escapeHtml(data.tweak) + "</p>" : "") +
            '<button class="btn" id="clearOutfitBtn" style="margin-top:16px;">Clear outfit</button>';
          comboResult.scrollIntoView({ behavior: "smooth" });
          document.getElementById("clearOutfitBtn").addEventListener("click", () => {
            clearOutfitCart();
            selectedItemIds.clear();
            comboResult.style.display = "none";
            renderGrid();
            updateOutfitBar();
          });
          await supabase.from("outfits").insert([{
            user_id: currentUser.id,
            item_ids: [...selectedItemIds],
            assigned_day: selectedDay,
            ai_verdict: data.verdict,
          }]);
        } catch (err) {
          console.error(err);
          alert("Couldn't check that combo — try again.");
        } finally {
          outfitCheckBtn.disabled = false;
          outfitCheckBtn.textContent = "Check outfit";
        }
      };
    }
  }

  /* ---------- DAY PICKER ---------- */

  dayPicker.addEventListener("click", (e) => {
    const chip = e.target.closest(".day-chip");
    if (!chip) return;
    const wasActive = chip.classList.contains("active");
    [...dayPicker.children].forEach((c) => c.classList.remove("active"));
    if (!wasActive) { chip.classList.add("active"); selectedDay = chip.dataset.day; }
    else { selectedDay = null; }
  });

  /* ---------- IN-PAGE COMBO CHECK ---------- */

  comboCheckBtn.addEventListener("click", async () => {
    const selectedItems = allItems.filter((it) => selectedItemIds.has(it.id));
    if (selectedItems.length < 2) return;
    const note = comboPromptInput ? comboPromptInput.value.trim().slice(0, 300) : "";
    comboCheckBtn.disabled = true;
    comboCheckBtn.textContent = "Checking...";
    try {
      const res = await fetch("/.netlify/functions/combo-verdict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: selectedItems.map((it) => ({
            category: it.category, color: it.color,
            tags: it.tags, description: it.ai_description,
          })),
          userPrompt: note,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      const thumbsHtml = selectedItems
        .map((it) => '<img src="' + it.image_url + '" alt="" class="combo-thumb">').join("");
      comboResult.style.display = "block";
      comboResult.innerHTML =
        '<div class="combo-thumbs">' + thumbsHtml + "</div>" +
        "<h4>" + escapeHtml((data.rating || "").toUpperCase()) + "</h4>" +
        "<p>" + escapeHtml(data.verdict || "") + "</p>" +
        (data.tweak ? '<p style="color:var(--lime);">' + escapeHtml(data.tweak) + "</p>" : "") +
        '<button class="btn" id="clearOutfitBtn2" style="margin-top:16px;">Clear outfit</button>';
      document.getElementById("clearOutfitBtn2").addEventListener("click", () => {
        clearOutfitCart();
        selectedItemIds.clear();
        comboResult.style.display = "none";
        renderGrid();
        updateOutfitBar();
      });
      await supabase.from("outfits").insert([{
        user_id: currentUser.id,
        item_ids: [...selectedItemIds],
        assigned_day: selectedDay,
        ai_verdict: data.verdict,
      }]);
      if (comboPromptInput) comboPromptInput.value = "";
    } catch (err) {
      console.error(err);
      alert("Couldn't check that combo — try again.");
    } finally {
      comboCheckBtn.disabled = false;
      comboCheckBtn.textContent = "Check combo \u2192";
      updateOutfitBar();
    }
  });

  /* ---------- ADD ITEMS ---------- */

  addItemsBtn.addEventListener("click", () => itemFileInput.click());

  itemFileInput.addEventListener("change", async (e) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    itemFileInput.value = "";
    if (!files.length) return;
    const FREE_ITEM_LIMIT = cfg.FREE_CLOSET_ITEM_LIMIT || 10;
    const remaining = unlimitedItems ? files.length : Math.max(0, FREE_ITEM_LIMIT - allItems.length);
    const toUpload = files.slice(0, remaining);
    if (toUpload.length < files.length) alert("Free trial limit reached — upgrade to Closet for unlimited.");
    for (const file of toUpload) await addItem(file);
    await loadItems();
  });

  async function addItem(file) {
    const reader = new FileReader();
    const dataUrl = await new Promise((resolve) => {
      reader.onload = (ev) => resolve(ev.target.result);
      reader.readAsDataURL(file);
    });
    const base64 = dataUrl.split(",")[1];
    try {
      const tagRes = await fetch("/.netlify/functions/tag-item", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mediaType: file.type }),
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
      if (!uploadRes.ok) throw new Error("Upload failed");
      const uploadData = await uploadRes.json();
      const { error } = await supabase.from("wardrobe_items").insert([{
        user_id: currentUser.id,
        image_url: uploadData.secure_url,
        category: tagData.category,
        color: tagData.color,
        tags: tagData.tags,
        ai_description: tagData.description,
      }]);
      if (error) throw error;
    } catch (err) {
      console.error(err);
      alert("Couldn't add one item — try again.");
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  init();
})();