(function () {
  "use strict";

  const cfg = window.FITCHECK_CONFIG;
  const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const DAYS = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
  const container = document.getElementById("plansContainer");

  let currentUser = null;
  let wardrobeItems = [];

  async function init() {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      currentUser = data.session.user;
      await loadWardrobe();
      await loadPlans();
      return;
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      subscription.unsubscribe();
      if (!session) { window.location.href = "wardrobe.html"; return; }
      currentUser = session.user;
      await loadWardrobe();
      await loadPlans();
    });
    setTimeout(() => { window.location.href = "wardrobe.html"; }, 3000);
  }

  async function loadWardrobe() {
    const { data } = await supabase.from("wardrobe_items").select("*").eq("user_id", currentUser.id);
    wardrobeItems = data || [];
  }

  async function loadPlans() {
    const { data, error } = await supabase
      .from("weekly_plans")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false });

    if (error || !data || !data.length) {
      container.innerHTML = '<p style="color:var(--muted);padding:32px 0;">No saved plans yet. Generate and save a plan first.</p>';
      return;
    }

    container.innerHTML = "";

    data.forEach((savedPlan) => {
      const date = new Date(savedPlan.created_at);
      const dateStr = date.toLocaleDateString("en-NG", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

      const card = document.createElement("div");
      card.className = "saved-plan-card";

      let html =
        '<div class="saved-plan-header">' +
        '<span class="saved-plan-date">Saved ' + dateStr + "</span>" +
        '<button class="btn" style="font-size:0.75rem;" data-plan-id="' + savedPlan.id + '" onclick="window._deletePlan(this)">Delete</button>' +
        "</div>";

      const plan = savedPlan.plan || {};

      DAYS.forEach((day) => {
        const dayPlan = plan[day];
        if (!dayPlan) return;

        html += '<div class="day-row"><div class="day-row-label">' + day.charAt(0).toUpperCase() + day.slice(1) + "</div>";

        ["outfit1", "outfit2"].forEach((slot) => {
          if (!dayPlan[slot]) return;
          const items = (dayPlan[slot].items || [])
            .map((id) => wardrobeItems.find((it) => it.id === id))
            .filter(Boolean);
          if (!items.length) return;
          html +=
            '<div class="thumb-strip" style="margin-bottom:6px;">' +
            items.map((it) => '<img src="' + it.image_url + '" alt="" class="day-thumb">').join("") +
            "</div>";
        });

        html += "</div>";
      });

      card.innerHTML = html;
      container.appendChild(card);
    });
  }

  window._deletePlan = async (btn) => {
    if (!confirm("Delete this saved plan?")) return;
    const id = btn.dataset.planId;
    const { error } = await supabase.from("weekly_plans").delete().eq("id", id);
    if (error) { alert("Couldn't delete — try again."); return; }
    await loadPlans();
  };

  init();
})();
