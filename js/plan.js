(function () {
  "use strict";

  const cfg = window.FITCHECK_CONFIG;
  const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

  const lockPanel = document.getElementById("lockPanel");
  const planApp = document.getElementById("planApp");
  const planBtn = document.getElementById("planBtn");
  const loadingState = document.getElementById("loadingState");
  const weekResult = document.getElementById("weekResult");

  let currentUser = null;
  let wardrobeItems = [];

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
    await loadWardrobe();
  }

  async function loadWardrobe() {
    const { data, error } = await supabase
      .from("wardrobe_items").select("*").eq("user_id", currentUser.id);
    wardrobeItems = error ? [] : data;
  }

  planBtn.addEventListener("click", async () => {
    if (!wardrobeItems.length) {
      alert("Add some items to your closet first.");
      return;
    }
    const occasions = {};
    DAYS.forEach((day) => {
      const el = document.getElementById("occ-" + day);
      if (el) occasions[day] = el.value;
    });
    planBtn.disabled = true;
    loadingState.style.display = "block";
    weekResult.style.display = "none";
    weekResult.innerHTML = "";

    try {
      const res = await fetch("/.netlify/functions/plan-week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wardrobe: wardrobeItems.map((it) => ({
            id: it.id,
            category: it.category,
            color: it.color,
            tags: it.tags,
            description: it.ai_description,
          })),
          occasions,
        }),
      });
      if (!res.ok) throw new Error("Planning failed");
      const plan = await res.json();

      weekResult.style.display = "block";
      weekResult.innerHTML = "";

      DAYS.forEach((day) => {
        const dayPlan = plan[day];
        const card = document.createElement("div");
        if (!dayPlan || !dayPlan.items || !dayPlan.items.length) {
          card.className = "day-card empty";
          card.innerHTML =
            '<span class="day-label">' + day.charAt(0).toUpperCase() + day.slice(1) + "</span>" +
            "<p>Not enough items for this day.</p>";
        } else {
          const itemObjs = dayPlan.items
            .map((id) => wardrobeItems.find((it) => it.id === id))
            .filter(Boolean);
          const thumbs = itemObjs
            .map((it) => '<img src="' + it.image_url + '" alt="" class="day-thumb">').join("");
          card.className = "day-card";
          card.innerHTML =
            '<span class="day-label">' + day.charAt(0).toUpperCase() + day.slice(1) + "</span>" +
            '<div class="day-thumbs">' + thumbs + "</div>" +
            '<p class="day-note">' + escapeHtml(dayPlan.note || "") + "</p>";
        }
        weekResult.appendChild(card);
      });

    } catch (err) {
      console.error(err);
      alert("Couldn't plan the week — try again.");
    } finally {
      planBtn.disabled = false;
      loadingState.style.display = "none";
    }
  });

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  init();
})();
