/* =========================================================
   FITCHECK — wardrobe.js
   Landing page: auth + category tile navigation.
   ========================================================= */

(function () {
  "use strict";

  const cfg = window.FITCHECK_CONFIG;
  const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const FREE_ITEM_LIMIT = cfg.FREE_CLOSET_ITEM_LIMIT || 10;

  const CATEGORIES = [
    { key: "top", label: "Tops" },
    { key: "bottom", label: "Bottoms" },
    { key: "shoes", label: "Shoes" },
    { key: "outerwear", label: "Outerwear" },
    { key: "accessory", label: "Accessories" },
    { key: "chain", label: "Chains" },
    { key: "ring", label: "Rings" },
    { key: "wristband", label: "Wristbands" },
    { key: "bag", label: "Bags" },
    { key: "other", label: "Other" },
  ];

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
  const itemCount = document.getElementById("itemCount");
  const categoryNav = document.getElementById("categoryNav");
  const paywallNote = document.getElementById("paywallNote");
  const itemFileInput = document.getElementById("itemFileInput");
  const addItemsBtn = document.getElementById("addItemsBtn");
  const planMyWeekBtn = document.getElementById("planMyWeekBtn");

  let currentUser = null;
  let userPlan = "free";
  let unlimitedItems = false;
  let wardrobeItems = [];

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
    signUpBtn.textContent = "Create account";
    if (error) { showAuthMsg(error.message || "Couldn't create that account."); return; }
    if (data.session) { currentUser = data.session.user; showApp(); }
    else { showAuthMsg("Account created. Check your email to confirm, then sign in."); }
  });

  signInBtn.addEventListener("click", async () => {
    const email = signInEmail.value.trim();
    const password = signInPassword.value;
    if (!email || !password) { showAuthMsg("Enter your email and password."); return; }
    signInBtn.disabled = true;
    signInBtn.textContent = "Signing in...";
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    signInBtn.disabled = false;
    signInBtn.textContent = "Sign in";
    if (error) { showAuthMsg(error.message || "Couldn't sign in."); return; }
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

  async function checkOnboarding() {
    const { data } = await supabase
      .from("profiles").select("onboarded").eq("id", currentUser.id).single();
    if (data && !data.onboarded) {
      window.location.href = "onboarding.html";
    }
  }


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
    const planLabels = { free: "Free plan", pro: "Style Pro", closet: "Closet plan" };
    planPill.textContent = planLabels[userPlan];
    planPill.classList.toggle("active", userPlan !== "free");
    if (unlimitedItems) planMyWeekBtn.style.display = "block";
    checkOnboarding();
  }

  async function loadItems() {
    const { data, error } = await supabase
      .from("wardrobe_items")
      .select("*")
      .eq("user_id", currentUser.id);
    wardrobeItems = error ? [] : data;
    renderCategoryNav();
  }

  function renderCategoryNav() {
    categoryNav.innerHTML = "";
    const total = wardrobeItems.length;
    itemCount.textContent = total + "/" + (unlimitedItems ? "unlimited" : FREE_ITEM_LIMIT) + " items";

    const grouped = {};
    wardrobeItems.forEach((item) => {
      const cat = (item.category || "other").toLowerCase();
      grouped[cat] = (grouped[cat] || 0) + 1;
    });

    CATEGORIES.forEach(({ key, label }) => {
      const count = grouped[key] || 0;
      const tile = document.createElement("div");
      tile.className = "category-tile" + (count === 0 ? " empty" : "");
      tile.style.cursor = "pointer";
      const tileLabel = document.createElement("span");
      tileLabel.className = "tile-label";
      tileLabel.textContent = label;
      const tileCount = document.createElement("span");
      tileCount.className = "tile-count";
      tileCount.textContent = count;
      tile.appendChild(tileLabel);
      tile.appendChild(tileCount);
      tile.addEventListener("click", () => {
        window.location.href = "category.html?cat=" + encodeURIComponent(key) + "&label=" + encodeURIComponent(label);
      });
      categoryNav.appendChild(tile);
    });

    const atLimit = !unlimitedItems && total >= FREE_ITEM_LIMIT;
    paywallNote.style.display = !unlimitedItems ? "block" : "none";
    if (!unlimitedItems) {
      paywallNote.textContent = "Free trial: " + total + "/" + FREE_ITEM_LIMIT + " used.";
    }
    addItemsBtn.style.display = atLimit ? "none" : "block";
  }

  addItemsBtn.addEventListener("click", () => itemFileInput.click());

  itemFileInput.addEventListener("change", async (e) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    itemFileInput.value = "";
    if (!files.length) return;
    const remaining = unlimitedItems
      ? files.length
      : Math.max(0, FREE_ITEM_LIMIT - wardrobeItems.length);
    const toUpload = files.slice(0, remaining);
    if (toUpload.length < files.length) {
      alert("Only " + toUpload.length + " of " + files.length + " photos added — free trial limit reached.");
    }
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  initAuth();
})();