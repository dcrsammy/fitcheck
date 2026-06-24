(function () {
  "use strict";

  const cfg = window.FITCHECK_CONFIG;
  const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const DAYS = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
  const BATCH1 = ["monday","tuesday","wednesday"];
  const BATCH2 = ["thursday","friday","saturday","sunday"];

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
  let lastGeneratedPlan = {};
  let lastOccasions = {};
  let batch1Done = false;

  /* ---------- BUILD OCCASION GRID ---------- */

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

    const defaults = {
      monday: ["office","home"], tuesday: ["office","home"],
      wednesday: ["office","home"], thursday: ["office","home"],
      friday: ["office","evening"], saturday: ["casual","none"], sunday: ["home","none"],
    };
    DAYS.forEach((day) => {
      const [o1, o2] = defaults[day] || ["casual","none"];
      const s1 = document.getElementById("occ1-" + day);
      const s2 = document.getElementById("occ2-" + day);
      if (s1) s1.value = o1;
      if (s2) s2.value = o2;
    });
  }

  function getOccasions() {
    const occasions = {};
    DAYS.forEach((day) => {
      const s1 = document.getElementById("occ1-" + day);
      const s2 = document.getElementById("occ2-" + day);
      occasions[day] = {
        outfit1: s1 ? s1.value : "casual",
        outfit2: s2 && s2.value !== "none" ? s2.value : null,
      };
    });
    return occasions;
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
    if (window.ftcHintPlan) window.ftcHintPlan();
    await loadWardrobe();
  }

  async function loadWardrobe() {
    const { data } = await supabase.from("wardrobe_items").select("*").eq("user_id", currentUser.id);
    wardrobeItems = data || [];
  }

  async function getStyleProfile() {
    try {
      const { data } = await supabase
        .from("profiles").select("gender, vibes, dress_occasions")
        .eq("id", currentUser.id).single();
      return data || null;
    } catch (e) { return null; }
  }

  /* ---------- WARDROBE PAYLOAD ---------- */

  function buildPayload() {
    return wardrobeItems.map((it) => ({
      id: it.id,
      category: it.category,
      subcategory: it.subcategory,
      color: it.color,
    }));
  }

  /* ---------- PLAN SINGLE DAY ---------- */

  async function planDay(day, occasions, styleProfile, usedItemIds) {
    const res = await fetch("/.netlify/functions/plan-week", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wardrobe: buildPayload(),
        occasions: { [day]: occasions[day] },
        styleProfile,
        usedItemIds: [...usedItemIds],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data[day] || null;
  }

  /* ---------- GENERATE BATCH 1 (Mon-Wed) ---------- */

  planBtn.addEventListener("click", async () => {
    if (!wardrobeItems.length) { alert("Add some items to your closet first."); return; }

    lastOccasions = getOccasions();
    lastGeneratedPlan = {};
    batch1Done = false;

    planBtn.disabled = true;
    planBtn.textContent = "Planning Mon-Wed...";
    loadingState.style.display = "block";
    weekResult.style.display = "none";
    weekResult.innerHTML = "";

    try {
      const styleProfile = await getStyleProfile();
      const usedIds = new Set();

      // Plan sequentially so each day avoids items already used
      for (const day of BATCH1) {
        const result = await planDay(day, lastOccasions, styleProfile, usedIds);
        lastGeneratedPlan[day] = result;
        if (result) {
          ["outfit1","outfit2"].forEach((slot) => {
            if (result[slot]) {
              (result[slot].items || []).forEach((id) => {
                const item = wardrobeItems.find((it) => it.id === id);
                if (item && item.category !== "bottom" && item.category !== "shoes") {
                  usedIds.add(id);
                }
              });
            }
          });
        }
      }

      batch1Done = true;
      renderWeek(lastGeneratedPlan, lastOccasions, false);

    } catch (err) {
      console.error(err);
      alert("Couldn't plan Mon-Wed — try again.");
    } finally {
      planBtn.disabled = false;
      planBtn.textContent = "Plan my week \u2192";
      loadingState.style.display = "none";
    }
  });

  /* ---------- GENERATE BATCH 2 (Thu-Sun) ---------- */

  async function planBatch2() {
    const btn = document.getElementById("planRestBtn");
    if (btn) { btn.disabled = true; btn.textContent = "Planning Thu-Sun..."; }

    try {
      const styleProfile = await getStyleProfile();

      // Collect items already used in batch 1
      const usedIds = new Set();
      BATCH1.forEach((day) => {
        const dayPlan = lastGeneratedPlan[day];
        if (!dayPlan) return;
        ["outfit1","outfit2"].forEach((slot) => {
          if (dayPlan[slot]) (dayPlan[slot].items || []).forEach((id) => usedIds.add(id));
        });
      });

      // Plan sequentially so each day avoids items already used
      for (const day of BATCH2) {
        const result = await planDay(day, lastOccasions, styleProfile, usedIds);
        lastGeneratedPlan[day] = result;
        if (result) {
          ["outfit1","outfit2"].forEach((slot) => {
            if (result[slot]) {
              (result[slot].items || []).forEach((id) => {
                const item = wardrobeItems.find((it) => it.id === id);
                if (item && item.category !== "bottom" && item.category !== "shoes") {
                  usedIds.add(id);
                }
              });
            }
          });
        }
      }

      renderWeek(lastGeneratedPlan, lastOccasions, true);

    } catch (err) {
      console.error(err);
      alert("Couldn't plan Thu-Sun — try again.");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Plan the rest of the week \u2192"; }
    }
  }

  /* ---------- RENDER ---------- */

  function isDayPast(day) {
    const now = new Date();
    const todayIndex = now.getDay();
    const dayIndex = { monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6, sunday:0 };
    return dayIndex[day] < todayIndex;
  }

  function renderWeek(plan, occasions, batch2Complete) {
    weekResult.style.display = "block";
    weekResult.innerHTML = "";

    // Render batch 1
    BATCH1.forEach((day) => renderDayCard(day, plan[day], occasions, weekResult));

    // Batch 2 section
    const batch2Section = document.createElement("div");

    if (!batch2Complete) {
      // Show "Plan rest of week" prompt
      const promptCard = document.createElement("div");
      promptCard.style.cssText = "border:1px solid var(--line);padding:28px;text-align:center;margin-top:1px;";
      promptCard.innerHTML =
        '<p class="tag" style="color:var(--muted);margin-bottom:16px;">Mon \u2013 Wed planned. Ready for the rest?</p>' +
        '<button class="btn btn-solid" id="planRestBtn" style="width:100%;">Plan the rest of the week \u2192</button>';
      batch2Section.appendChild(promptCard);
    } else {
      BATCH2.forEach((day) => renderDayCard(day, plan[day], occasions, batch2Section));
    }

    weekResult.appendChild(batch2Section);

    // Action row
    const actionRow = document.createElement("div");
    actionRow.className = "action-row";
    actionRow.innerHTML =
      '<button class="btn btn-solid" id="savePlanBtn">Save this plan \u2193</button>' +
      '<button class="btn" id="regenBtn">Regenerate Mon\u2013Wed \u8635</button>';
    weekResult.appendChild(actionRow);

    // Wire buttons
    const planRestBtn = document.getElementById("planRestBtn");
    if (planRestBtn) planRestBtn.addEventListener("click", planBatch2);

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
        setTimeout(() => { btn.textContent = "Save this plan \u2193"; btn.disabled = false; }, 3000);
      } else {
        btn.textContent = "\u2713 Saved";
        setTimeout(() => { btn.textContent = "Save this plan \u2193"; btn.disabled = false; }, 3000);
      }
    });

    document.getElementById("regenBtn").addEventListener("click", () => planBtn.click());
  }

  function renderDayCard(day, dayPlan, occasions, container) {
    const past = isDayPast(day);
    const card = document.createElement("div");

    if (!dayPlan) {
      card.className = "day-card empty" + (past ? " past" : "");
      card.innerHTML =
        '<div class="day-label">' + day.charAt(0).toUpperCase() + day.slice(1) +
        (past ? '<span class="past-tag">Done</span>' : "") + "</div>" +
        "<p>Couldn't plan this day — not enough variety.</p>";
    } else {
      card.className = "day-card" + (past ? " past" : "");
      let html =
        '<div class="day-label">' + day.charAt(0).toUpperCase() + day.slice(1) +
        (past ? '<span class="past-tag">Done</span>' : "") + "</div>";

      ["outfit1","outfit2"].forEach((slot) => {
        if (!dayPlan[slot]) return;
        const items = (dayPlan[slot].items || [])
          .map((id) => wardrobeItems.find((it) => it.id === id))
          .filter(Boolean);
        if (!items.length) return;
        const occ = occasions[day] && occasions[day][slot] ? occasions[day][slot] : slot;
        html +=
          '<div class="outfit-slot">' +
          '<div class="slot-label">' + occ.charAt(0).toUpperCase() + occ.slice(1) + "</div>" +
          '<div class="day-thumbs">' +
          items.map((it) => '<img src="' + it.image_url + '" alt="" class="day-thumb">').join("") +
          "</div>" +
          '<p class="day-note">' + escapeHtml(dayPlan[slot].note || "") + "</p>" +
          "</div>";
      });

      card.innerHTML = html;
    }

    container.appendChild(card);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  init();
})();
