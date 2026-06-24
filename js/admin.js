(function () {
  "use strict";

  const ADMIN_PASSWORD = "A12dcmoney";
  const cfg = window.FITCHECK_CONFIG;
  const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const adminGate = document.getElementById("adminGate");
  const adminShell = document.getElementById("adminShell");
  const adminPass = document.getElementById("adminPass");
  const adminLoginBtn = document.getElementById("adminLoginBtn");
  const adminErr = document.getElementById("adminErr");
  const refreshBtn = document.getElementById("refreshBtn");

  /* ---------- AUTH ---------- */

  function checkSession() {
    return sessionStorage.getItem("fitcheck_admin") === "true";
  }

  if (checkSession()) {
    showAdmin();
  }

  adminLoginBtn.addEventListener("click", () => {
    if (adminPass.value === ADMIN_PASSWORD) {
      sessionStorage.setItem("fitcheck_admin", "true");
      adminErr.style.display = "none";
      showAdmin();
    } else {
      adminErr.style.display = "block";
    }
  });

  adminPass.addEventListener("keydown", (e) => {
    if (e.key === "Enter") adminLoginBtn.click();
  });

  function showAdmin() {
    adminGate.style.display = "none";
    adminShell.style.display = "block";
    loadAll();
  }

  refreshBtn.addEventListener("click", loadAll);

  /* ---------- LOAD ALL ---------- */

  async function loadAll() {
    await Promise.all([loadStats(), loadBookings(), loadUsers()]);
  }

  /* ---------- STATS ---------- */

  async function loadStats() {
    const { data: profiles } = await supabase.from("profiles").select("plan, plan_expires_at");
    const { count: bookingCount } = await supabase.from("bookings").select("*", { count: "exact", head: true });

    const now = new Date();
    const total = profiles ? profiles.length : 0;
    const closet = profiles ? profiles.filter((p) => {
      const notExpired = !p.plan_expires_at || new Date(p.plan_expires_at) > now;
      return p.plan === "closet" && notExpired;
    }).length : 0;
    const pro = profiles ? profiles.filter((p) => {
      const notExpired = !p.plan_expires_at || new Date(p.plan_expires_at) > now;
      return p.plan === "pro" && notExpired;
    }).length : 0;

    document.getElementById("statTotal").textContent = total;
    document.getElementById("statCloset").textContent = closet;
    document.getElementById("statPro").textContent = pro;
    document.getElementById("statBookings").textContent = bookingCount || 0;
  }

  /* ---------- BOOKINGS ---------- */

  async function loadBookings() {
    const { data, error } = await supabase
      .from("bookings").select("*").order("created_at", { ascending: false });

    const tbody = document.getElementById("bookingRows");
    tbody.innerHTML = "";

    if (error || !data) {
      tbody.innerHTML = '<tr><td colspan="6" style="color:var(--muted);">No bookings yet.</td></tr>';
      return;
    }

    document.getElementById("bookingCount").textContent = data.length + " total";

    data.forEach((b) => {
      const status = b.status || "pending";
      const tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + escHtml(b.name || "") + "</td>" +
        "<td>" + escHtml(b.service || "") + "</td>" +
        "<td>" + escHtml(b.date || "") + "</td>" +
        "<td>" +
          "<div>" + escHtml(b.phone || "") + "</div>" +
          "<div style='color:var(--muted);font-size:0.8rem;'>" + escHtml(b.email || "") + "</div>" +
        "</td>" +
        "<td><span class='status-badge " + status + "'>" + status + "</span></td>" +
        "<td>" +
          "<select class='plan-select' data-booking-id='" + b.id + "' onchange='window._updateBookingStatus(this)'>" +
          "<option value='pending'" + (status === "pending" ? " selected" : "") + ">Pending</option>" +
          "<option value='confirmed'" + (status === "confirmed" ? " selected" : "") + ">Confirmed</option>" +
          "<option value='completed'" + (status === "completed" ? " selected" : "") + ">Completed</option>" +
          "<option value='cancelled'" + (status === "cancelled" ? " selected" : "") + ">Cancelled</option>" +
          "</select>" +
        "</td>";
      tbody.appendChild(tr);
    });
  }

  window._updateBookingStatus = async (sel) => {
    const id = sel.dataset.bookingId;
    const status = sel.value;
    const { error } = await supabase.from("bookings").update({ status }).eq("id", id);
    if (error) { alert("Couldn't update status."); return; }
    await loadBookings();
  };

  /* ---------- USERS ---------- */

  async function loadUsers() {
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, email, plan, plan_expires_at, free_checks_used_this_month")
      .order("created_at", { ascending: false });

    const tbody = document.getElementById("userRows");
    tbody.innerHTML = "";

    if (error || !profiles) {
      tbody.innerHTML = '<tr><td colspan="6" style="color:var(--muted);">No users yet.</td></tr>';
      return;
    }

    document.getElementById("userCount").textContent = profiles.length + " total";

    // Get item counts per user
    const { data: items } = await supabase.from("wardrobe_items").select("user_id");
    const itemCounts = {};
    (items || []).forEach((it) => {
      itemCounts[it.user_id] = (itemCounts[it.user_id] || 0) + 1;
    });

    const now = new Date();

    profiles.forEach((p) => {
      const notExpired = !p.plan_expires_at || new Date(p.plan_expires_at) > now;
      const plan = notExpired ? (p.plan || "free") : "free";
      const expires = p.plan_expires_at ? new Date(p.plan_expires_at).toLocaleDateString("en-NG") : "—";
      const itemCount = itemCounts[p.id] || 0;
      const checksUsed = p.free_checks_used_this_month || 0;

      const tr = document.createElement("tr");
      tr.innerHTML =
        "<td style='font-size:0.82rem;'>" + escHtml(p.email || p.id.slice(0, 8)) + "</td>" +
        "<td><span class='plan-badge " + plan + "'>" + plan + "</span></td>" +
        "<td style='color:var(--muted);font-size:0.8rem;'>" + expires + "</td>" +
        "<td>" + itemCount + "</td>" +
        "<td>" + checksUsed + "/5</td>" +
        "<td>" +
          "<select class='plan-select' data-user-id='" + p.id + "' onchange='window._updateUserPlan(this)'>" +
          "<option value='free'" + (plan === "free" ? " selected" : "") + ">Free</option>" +
          "<option value='pro'" + (plan === "pro" ? " selected" : "") + ">Style Pro</option>" +
          "<option value='closet'" + (plan === "closet" ? " selected" : "") + ">Closet</option>" +
          "</select>" +
        "</td>";
      tbody.appendChild(tr);
    });
  }

  window._updateUserPlan = async (sel) => {
    const id = sel.dataset.userId;
    const plan = sel.value;
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1);

    const { error } = await supabase.from("profiles").update({
      plan,
      plan_expires_at: plan === "free" ? null : expires.toISOString(),
    }).eq("id", id);

    if (error) { alert("Couldn't update plan."); return; }
    await loadAll();
  };

  function escHtml(str) {
    const d = document.createElement("div");
    d.textContent = str || "";
    return d.innerHTML;
  }

  // Add status column to bookings table if it doesn't exist
  supabase.from("bookings").select("status").limit(1).then(({ error }) => {
    if (error && error.message.includes("status")) {
      console.log("Status column may not exist yet — run: ALTER TABLE bookings ADD COLUMN IF NOT EXISTS status text default 'pending';");
    }
  });

})();
