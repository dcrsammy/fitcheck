(function () {
  "use strict";

  const cfg = window.FITCHECK_CONFIG;
  const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const DAYS = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
  const DAY_OCCASIONS = [
    { value: "office", label: "Office" },
    { value: "home", label: "Home / Lounge" },
    { value: "casual", label: "Casual" },
    { value: "evening", label: "Evening out" },
    { value: "gym", label: "Gym" },
    { value: "event", label: "Event / Owambe" },
    { value: "date", label: "Date" },
    { value: "none", label: "Rest day" },
  ];

  const lockPanel = document.getElementById("lockPanel");
  const planApp = document.getElementById("planApp");
  const planBtn = document.getElementById("planBtn");
  const loadingState = document.getElementById("loadingState");
  const weekResult = document.getElementById("weekResult");
  const occasionsGrid = document.getElementById("occasionsGrid");

  let currentUser = null;
  let wardrobeItems = [];
  let lastGeneratedPlan = null;
  let lastOccasions = null;

  /* ---------- BUILD OCCASION SELECTORS ---------- */

  function buildOccasionGrid() {
    occasionsGrid.innerHTML = "";
    DAYS.forEach((day) => {
      const tile = document.createElement("div");
      tile.className = "occasion-tile";

      const optionsHtml = DAY_OCCASIONS.map((o) =>
        '<option value="' + o.value + '">' + o.label + "</option>"
      ).join("");

      tile.innerHTML =
        '<label>' + day.charAt(0).toUpperCase() + day.slice(1) + "</label>" +
        '<span class="occ-label">Outfit 1</span>' +
        '<select id="occ1-' + day + '">' + optionsHtml + "</select>" +
        '<span class="occ-label">Outfit 2 (optional)</span>' +
        '<select id="occ2-' + day + '"><option value="none">None</option>' + optionsHtml + "</select>";

      occasionsGrid.appendChild(tile);
    });

    // Set sensible defaults
    const defaults = {
      monday: ["office", "home"],
      tuesday: ["office", "home"],
      wednesday: ["office", "home"],
      thursday: ["office", "home"],
      friday: ["office", "evening"],
      saturday: ["casual", "none"],
      sunday: ["home", "none"],
    };

    DAYS.forEach((day) => {
      const [occ1, occ2] = defaults[day] || ["casual", "none"];
      const sel1 = document.getElementById("occ1-" + day);
      const sel2 = document.getElementById("occ2-" + day);
      if (sel1) sel1.value = occ1;
      if (sel2) sel2.value = occ2;
    });
  }

  /* ---------- AUTH ---------- */

  async function init() {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      currentUser = data.session.user;
      await checkPlanAndLoad();
      return;
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        subscription.unsubscribe();
        if (!session) { window.location.href = "wardrobe.html"; return; }
        currentUser = session.user;
        await checkPlanAndLoad();
      }
    );
    setTimeout(() => { window.location.href = "wardrobe.html"; }, 3000);
  }

  async function checkPlanAndLoad() {
    const { data, error } = await supabase
      .from("profiles").select("plan, plan_expires_at").eq("id", currentUser.id).single();
    let plan = "free";
    if (!error && data) {
      const notExpired = !data.plan_expires_at || new Date(data.plan_expires_at) > new Date();
      plan = notExpired ? (data.plan || "free") : "free";
    }
    if (plan !== "closet") {
      lockPanel.style.display = "block";
      planApp.style.display = "none";
      return;
    }
    planApp.style.display = "block";
    lockPanel.style.display = "none";
    buildOccasionGrid();
    await loadWardrobe();
  }

  async function loadWardrobe() {
    const { data, error } = await supabase
      .from("wardrobe_items").select("*").eq("user_id", currentUser.id);
    wardrobeItems = error ? [] : data;
  }

  async function getStyleProfile() {
    try {
      const { data } = await supabase
        .from("profiles").select("gender, vibes, dress_occasions")
        .eq("id", currentUser.id).single();
      return data || null;
    } catch (e) { return null; }
  }

  /* ---------- GENERATE PLAN ---------- */

  planBtn.addEventListener("click", async () => {
    if (!wardrobeItems.length) {
      alert("Add some items to your closet first.");
      return;
    }

    const occasions = {};
    DAYS.forEach((day) => {
      const occ1 = document.getElementById("occ1-" + day);
      const occ2 = document.getElementById("occ2-" + day);
      occasions[day] = {
        outfit1: occ1 ? occ1.value : "casual",
        outfit2: occ2 && occ2.value !== "none" ? occ2.value : null,
      };
    });

    lastOccasions = occasions;
    planBtn.disabled = true;
    planBtn.textContent = "Planning...";
    loadingState.style.display = "block";
    weekResult.style.display = "none";
    weekResult.innerHTML = "";

    try {
      const styleProfile = await getStyleProfile();
      const wardrobePayload = wardrobeItems.map((it) => ({
        id: it.id, category: it.category, subcategory: it.subcategory, color: it.color,
      }));

      // One call per day in parallel — each stays well under 10s limit
      const dayResults = await Promise.all(
        DAYS.map((day) =>
          fetch("/.netlify/functions/plan-week", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              wardrobe: wardrobePayload,
              occasions: { [day]: occasions[day] },
              styleProfile,
            }),
          }).then((r) => r.ok ? r.json() : null)
        )
      );

      const plan = {};
      DAYS.forEach((day, i) => { plan[day] = dayResults[i]; });
      lastGeneratedPlan = plan;
      renderWeek(plan, occasions);

    } catch (err) {
      console.error(err);
      alert("Couldn't plan the week — try again.");
    } finally {
      planBtn.disabled = false;
      planBtn.textContent = "Plan my week \u2192";
      loadingState.style.display = "none";
    }
  });

  /* ---------- RENDER WEEK ---------- */

  function isDayPast(day) {
    const now = new Date();
    const todayIndex = now.getDay(); // 0=Sun, 1=Mon...
    const dayIndex = { monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6, sunday:0 };
    return dayIndex[day] < todayIndex || (dayIndex[day] === todayIndex && now.getHours() >= 23);
  }

  function renderWeek(plan, occasions) {
    weekResult.style.display = "block";
    weekResult.innerHTML = "";

    DAYS.forEach((day) => {
      const dayPlan = plan[day];
      const past = isDayPast(day);
      const card = document.createElement("div");

      if (!dayPlan) {
        card.className = "day-card empty" + (past ? " past" : "");
        card.innerHTML =
          '<div class="day-label">' +
          day.charAt(0).toUpperCase() + day.slice(1) +
          (past ? '<span class="past-tag">Done</span>' : "") +
          "</div>" +
          "<p>Not enough variety for this day.</p>";
      } else {
        card.className = "day-card" + (past ? " past" : "");
        let innerHtml =
          '<div class="day-label">' +
          day.charAt(0).toUpperCase() + day.slice(1) +
          (past ? '<span class="past-tag">Done</span>' : "") +
          "</div>";

        // Outfit 1
        if (dayPlan.outfit1) {
          const items1 = (dayPlan.outfit1.items || [])
            .map((id) => wardrobeItems.find((it) => it.id === id))
            .filter(Boolean);
          const occ1Label = occasions[day] && occasions[day].outfit1 ? occasions[day].outfit1 : "Outfit 1";
          innerHtml +=
            '<div class="outfit-slot">' +
            '<div class="slot-label">' + occ1Label.charAt(0).toUpperCase() + occ1Label.slice(1) + "</div>" +
            '<div class="day-thumbs">' +
            items1.map((it) => '<img src="' + it.image_url + '" alt="" class="day-thumb">').join("") +
            "</div>" +
            '<p class="day-note">' + escapeHtml(dayPlan.outfit1.note || "") + "</p>" +
            "</div>";
        }

        // Outfit 2
        if (dayPlan.outfit2) {
          const items2 = (dayPlan.outfit2.items || [])
            .map((id) => wardrobeItems.find((it) => it.id === id))
            .filter(Boolean);
          const occ2Label = occasions[day] && occasions[day].outfit2 ? occasions[day].outfit2 : "Outfit 2";
          innerHtml +=
            '<div class="outfit-slot">' +
            '<div class="slot-label">' + occ2Label.charAt(0).toUpperCase() + occ2Label.slice(1) + "</div>" +
            '<div class="day-thumbs">' +
            items2.map((it) => '<img src="' + it.image_url + '" alt="" class="day-thumb">').join("") +
            "</div>" +
            '<p class="day-note">' + escapeHtml(dayPlan.outfit2.note || "") + "</p>" +
            "</div>";
        }

        card.innerHTML = innerHtml;
      }

      weekResult.appendChild(card);
    });

    // Action row — explicit save only
    const actionRow = document.createElement("div");
    actionRow.className = "action-row";
    actionRow.innerHTML =
      '<button class="btn btn-solid" id="savePlanBtn">Save this plan &#8595;</button>' +
      '<button class="btn" id="regenBtn">Regenerate &#8635;</button>';
    weekResult.appendChild(actionRow);

    document.getElementById("savePlanBtn").addEventListener("click", async () => {
      const btn = document.getElementById("savePlanBtn");
      btn.disabled = true;
      btn.textContent = "Saving...";
      const { error } = await supabase.from("weekly_plans").insert([{
        user_id: currentUser.id,
        plan: lastGeneratedPlan,
        occasions: lastOccasions,
      }]);
      btn.disabled = false;
      if (error) {
        btn.textContent = "Couldn't save — try again.";
        setTimeout(() => { btn.textContent = "Save this plan \u2193"; }, 3000);
      } else {
        btn.textContent = "\u2713 Saved";
        btn.classList.add("btn-lime");
        setTimeout(() => {
          btn.textContent = "Save this plan \u2193";
          btn.classList.remove("btn-lime");
          btn.disabled = false;
        }, 3000);
      }
    });

    document.getElementById("regenBtn").addEventListener("click", () => {
      planBtn.click();
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  init();
})();
