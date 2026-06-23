/* =========================================================
   FITCHECK — category.js
   Single category grid page with item selection + combo check.
   ========================================================= */

(function () {
  "use strict";

  const cfg = window.FITCHECK_CONFIG;
  const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const params = new URLSearchParams(window.location.search);
  const catKey = params.get("cat") || "top";
  const catLabel = params.get("label") || "Items";

  document.getElementById("categoryTitle").textContent = catLabel;
  document.title = catLabel + " \u2014 FitCheck";

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

  async function init() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) { window.location.href = "wardrobe.html?signin=1"; return; }
    currentUser = data.session.user;
    await loadProfile();
    await loadItems();
  }

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

  async function loadItems() {
    const { data, error } = await supabase
      .from("wardrobe_items").select("*").eq("user_id", currentUser.id).order("created_at", { ascending: false });
    allItems = error ? [] : data;
    categoryItems = allItems.filter((it) => (it.category || "other").toLowerCase() === catKey);
    renderGrid();
  }

  function renderGrid() {
    categoryGrid.innerHTML = "";
    if (!categoryItems.length) {
      categoryGrid.innerHTML = '<p style="color:var(--muted);">No items in this category yet. Add some above.</p>';
      return;
    }
    categoryItems.forEach((item) => {
      const card = document.createElement("div");
      card.className = "item-card";
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
    if (selectedItemIds.has(id)) { selectedItemIds.delete(id); card.classList.remove("selected"); }
    else { selectedItemIds.add(id); card.classList.add("selected"); }
    comboCheckBtn.disabled = selectedItemIds.size < 2;
    const outfitBar = document.getElementById("outfitBar");
    const outfitBarCount = document.getElementById("outfitBarCount");
    const outfitCheckBtn2 = document.getElementById("outfitCheckBtn");
    const total = selectedItemIds.size;
    if (total > 0) {
      outfitBar.style.display = "flex";
      outfitBarCount.textContent = total + " item" + (total === 1 ? "" : "s") + " in outfit";
    } else {
      outfitBar.style.display = "none";
    }
    comboCheckBtn.disabled = total < 2;
    comboResult.style.display = "none";
  }

  document.getElementById("outfitCheckBtn").addEventListener("click", async () => {
    const selectedItems = allItems.filter((it) => selectedItemIds.has(it.id));
    if (selectedItems.length < 2) {
      alert("Select at least 2 items from your closet to check a combo.");
      return;
    }
    const btn = document.getElementById("outfitCheckBtn");
    btn.disabled = true;
    btn.textContent = "Checking...";
    try {
      const res = await fetch("/.netlify/functions/combo-verdict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: selectedItems.map((it) => ({
            category: it.category,
            color: it.color,
            tags: it.tags,
            description: it.ai_description,
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
        "<h4>" + (data.rating || "").toUpperCase() + "</h4>" +
        "<p>" + (data.verdict || "") + "</p>" +
        (data.tweak ? '<p style="color:var(--lime);">' + data.tweak + "</p>" : "") +
        '<button class="btn" id="clearOutfitBtn" style="margin-top:16px;">Clear outfit</button>';
      comboResult.scrollIntoView({ behavior: "smooth" });
      document.getElementById("clearOutfitBtn").addEventListener("click", () => {
        clearOutfitCart();
        selectedItemIds.clear();
        comboResult.style.display = "none";
        renderGrid();
        document.getElementById("outfitBar").style.display = "none";
      });
      await supabase.from("outfits").insert([{
        user_id: currentUser.id,
        item_ids: [...selectedItemIds],
        assigned_day: selectedDay,
        ai_verdict: data.verdict,
      }]);
    } catch (err) {
      console.error(err);
      alert("Couldn't check that combo.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Check outfit";
    }
  });
  dayPicker.addEventListener("click", (e) => {
    const chip = e.target.closest(".day-chip");
    if (!chip) return;
    const wasActive = chip.classList.contains("active");
    [...dayPicker.children].forEach((c) => c.classList.remove("active"));
    if (!wasActive) { chip.classList.add("active"); selectedDay = chip.dataset.day; }
    else { selectedDay = null; }
  });

  comboCheckBtn.addEventListener("click", async () => {
    const selectedItems = allItems.filter((it) => selectedItemIds.has(it.id));
    if (selectedItems.length < 2) return;
    const note = comboPromptInput ? comboPromptInput.value.trim().slice(0, 300) : "";
    comboCheckBtn.disabled = true; comboCheckBtn.textContent = "Checking...";

    try {
      const res = await fetch("/.netlify/functions/combo-verdict", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: selectedItems.map((it) => ({ category: it.category, color: it.color, tags: it.tags, description: it.ai_description })),
          userPrompt: note,
        }),
      });
      if (!res.ok) throw new Error("Combo check failed");
      const data = await res.json();

      const thumbsHtml = selectedItems
        .map((it) => '<img src="' + it.image_url + '" alt="" class="combo-thumb">').join("");

      comboResult.style.display = "block";
      comboResult.innerHTML =
        '<div class="combo-thumbs">' + thumbsHtml + "</div>" +
        "<h4>" + escapeHtml((data.rating || "").toUpperCase()) + "</h4>" +
        "<p>" + escapeHtml(data.verdict || "") + "</p>" +
        (data.tweak ? '<p style="color:var(--lime);">' + escapeHtml(data.tweak) + "</p>" : "");

      await supabase.from("outfits").insert([{
        user_id: currentUser.id,
        item_ids: [...selectedItemIds],
        assigned_day: selectedDay,
        ai_verdict: data.verdict,
      }]);
      if (comboPromptInput) comboPromptInput.value = "";
    } catch (err) {
      console.error(err);
      alert("Couldn't check that combo \u2014 try again.");
    } finally {
      comboCheckBtn.disabled = false;
      comboCheckBtn.textContent = "Check combo \u2192";
    }
  });

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
    const dataUrl = await new Promise((resolve) => { reader.onload = (ev) => resolve(ev.target.result); reader.readAsDataURL(file); });
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
      const uploadRes = await fetch("https://api.cloudinary.com/v1_1/" + cfg.CLOUDINARY_CLOUD_NAME + "/image/upload", { method: "POST", body: formData });
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
      alert("Couldn't add one item \u2014 try again.");
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  init();
})();
