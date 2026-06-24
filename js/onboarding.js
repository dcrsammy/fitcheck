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
    if (!data.session) { window.location.href = "wardrobe.html"; return; }
    currentUser = data.session.user;
  }

  /* ---------- STEP NAVIGATION ---------- */

  let currentStep = 0;

  function goToStep(n) {
    document.getElementById("step" + currentStep).classList.remove("active");
    document.getElementById("dot" + currentStep).classList.remove("active");
    document.getElementById("dot" + currentStep).classList.add("done");
    currentStep = n;
    document.getElementById("step" + currentStep).classList.add("active");
    document.getElementById("dot" + currentStep).classList.add("active");
  }

  document.getElementById("next0").addEventListener("click", () => goToStep(1));
  document.getElementById("next1").addEventListener("click", () => goToStep(2));

  /* ---------- GENDER ---------- */

  document.querySelectorAll(".gender-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".gender-chip").forEach((c) => c.classList.remove("selected"));
      chip.classList.add("selected");
      selectedGender = chip.dataset.val;
      document.getElementById("next0").disabled = false;
    });
  });

  /* ---------- VIBES ---------- */

  document.querySelectorAll(".vibe-tile").forEach((tile) => {
    tile.addEventListener("click", () => {
      const val = tile.dataset.val;
      if (tile.classList.contains("selected")) {
        tile.classList.remove("selected");
        selectedVibes = selectedVibes.filter((v) => v !== val);
      } else {
        if (selectedVibes.length >= 2) {
          const firstSelected = document.querySelector(".vibe-tile.selected");
          if (firstSelected) {
            selectedVibes = selectedVibes.filter((v) => v !== firstSelected.dataset.val);
            firstSelected.classList.remove("selected");
          }
        }
        tile.classList.add("selected");
        selectedVibes.push(val);
      }
      document.getElementById("next1").disabled = selectedVibes.length === 0;
    });
  });

  /* ---------- OCCASIONS ---------- */

  document.querySelectorAll(".occ-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const val = chip.dataset.val;
      if (chip.classList.contains("selected")) {
        chip.classList.remove("selected");
        selectedOccasions = selectedOccasions.filter((o) => o !== val);
      } else {
        chip.classList.add("selected");
        selectedOccasions.push(val);
      }
      document.getElementById("saveBtn").disabled = selectedOccasions.length === 0;
    });
  });

  /* ---------- SAVE ---------- */

  document.getElementById("saveBtn").addEventListener("click", async () => {
    await saveProfile();
  });

  document.getElementById("skipBtn").addEventListener("click", async () => {
    await supabase.from("profiles")
      .update({ onboarded: true })
      .eq("id", currentUser.id);
    window.location.href = "wardrobe.html";
  });

  async function saveProfile() {
    const btn = document.getElementById("saveBtn");
    btn.disabled = true;
    btn.textContent = "Saving...";

    const { error } = await supabase.from("profiles").update({
      gender: selectedGender,
      vibes: selectedVibes,
      dress_occasions: selectedOccasions,
      onboarded: true,
    }).eq("id", currentUser.id);

    if (error) {
      console.error(error);
      btn.disabled = false;
      btn.textContent = "Save my style \u2192";
      alert("Couldn't save — try again.");
      return;
    }

    window.location.href = "wardrobe.html";
  }

  init();
})();
