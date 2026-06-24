(function () {
  "use strict";

  const cfg = window.FITCHECK_CONFIG;
  const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  let currentUser = null;
  let selectedGender = null;
  let selectedVibes = [];
  let selectedOccasions = [];

  async function init() {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      currentUser = data.session.user;
      await loadProfile();
      return;
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      subscription.unsubscribe();
      if (!session) { window.location.href = "wardrobe.html"; return; }
      currentUser = session.user;
      await loadProfile();
    });
    setTimeout(() => { window.location.href = "wardrobe.html"; }, 3000);
  }

  async function loadProfile() {
    const { data, error } = await supabase
      .from("profiles").select("gender, vibes, dress_occasions").eq("id", currentUser.id).single();
    if (error || !data) return;

    selectedGender = data.gender || null;
    selectedVibes = data.vibes || [];
    selectedOccasions = data.dress_occasions || [];

    if (selectedGender) {
      const chip = document.querySelector('.gender-chip[data-val="' + selectedGender + '"]');
      if (chip) chip.classList.add("selected");
    }
    selectedVibes.forEach((v) => {
      const tile = document.querySelector('.vibe-tile[data-val="' + v + '"]');
      if (tile) tile.classList.add("selected");
    });
    selectedOccasions.forEach((o) => {
      const chip = document.querySelector('.occ-chip[data-val="' + o + '"]');
      if (chip) chip.classList.add("selected");
    });
  }

  document.querySelectorAll(".gender-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".gender-chip").forEach((c) => c.classList.remove("selected"));
      chip.classList.add("selected");
      selectedGender = chip.dataset.val;
    });
  });

  document.querySelectorAll(".vibe-tile").forEach((tile) => {
    tile.addEventListener("click", () => {
      const val = tile.dataset.val;
      if (tile.classList.contains("selected")) {
        tile.classList.remove("selected");
        selectedVibes = selectedVibes.filter((v) => v !== val);
      } else {
        if (selectedVibes.length >= 2) {
          const first = document.querySelector(".vibe-tile.selected");
          if (first) { selectedVibes = selectedVibes.filter((v) => v !== first.dataset.val); first.classList.remove("selected"); }
        }
        tile.classList.add("selected");
        selectedVibes.push(val);
      }
    });
  });

  document.querySelectorAll(".occ-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      chip.classList.toggle("selected");
      const val = chip.dataset.val;
      if (chip.classList.contains("selected")) { selectedOccasions.push(val); }
      else { selectedOccasions = selectedOccasions.filter((o) => o !== val); }
    });
  });

  document.getElementById("saveBtn").addEventListener("click", async () => {
    const btn = document.getElementById("saveBtn");
    const msg = document.getElementById("saveMsg");
    btn.disabled = true;
    btn.textContent = "Saving...";

    const { error } = await supabase.from("profiles").update({
      gender: selectedGender,
      vibes: selectedVibes,
      dress_occasions: selectedOccasions,
      onboarded: true,
    }).eq("id", currentUser.id);

    btn.disabled = false;
    btn.textContent = "Save changes \u2192";
    msg.style.display = "block";
    msg.textContent = error ? "Couldn't save — try again." : "Style saved.";
    setTimeout(() => { msg.style.display = "none"; }, 3000);
  });

  init();
})();
