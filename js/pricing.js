/* =========================================================
   FITCHECK — pricing.js
   3-tier Paystack checkout (Pro / Closet) + plan activation
   ========================================================= */

(function () {
  "use strict";

  const cfg = window.FITCHECK_CONFIG;
  const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const billingChips = document.querySelectorAll(".price-chip");
  const proPrice = document.getElementById("proPrice");
  const proPeriod = document.getElementById("proPeriod");
  const closetPrice = document.getElementById("closetPrice");
  const closetPeriod = document.getElementById("closetPeriod");
  const planButtons = document.querySelectorAll("[data-plan]");

  let billing = "monthly"; // "monthly" | "yearly"

  function fmtNaira(kobo) {
    return "₦" + (kobo / 100).toLocaleString("en-NG");
  }

  function renderPrices() {
    proPrice.textContent = fmtNaira(cfg.PRICING.pro[billing]);
    proPeriod.textContent = billing === "yearly" ? "/year" : "/month";
    closetPrice.textContent = fmtNaira(cfg.PRICING.closet[billing]);
    closetPeriod.textContent = billing === "yearly" ? "/year" : "/month";
  }

  billingChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      billingChips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      billing = chip.dataset.billing;
      renderPrices();
    });
  });

  planButtons.forEach((btn) => {
    btn.addEventListener("click", () => startCheckout(btn.dataset.plan, btn));
  });

  async function startCheckout(plan, btn) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      alert("Sign in to My Closet first, then come back here to subscribe.");
      window.location.href = "wardrobe.html";
      return;
    }

    const user = data.session.user;
    const amount = cfg.PRICING[plan][billing];

    const handler = PaystackPop.setup({
      key: cfg.PAYSTACK_PUBLIC_KEY,
      email: user.email,
      amount: amount,
      currency: "NGN",
      ref: `fitcheck_${plan}_${Date.now()}`,
      callback: function (response) {
        verifyAndActivate(response.reference, user.id, plan, billing, btn);
      },
      onClose: function () {},
    });
    handler.openIframe();
  }

  async function verifyAndActivate(reference, userId, plan, billingCycle, btn) {
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Activating...";

    try {
      const res = await fetch("/.netlify/functions/verify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, userId, plan, billing: billingCycle }),
      });
      if (!res.ok) throw new Error("Verification failed");

      alert(`You're in. Welcome to ${plan === "closet" ? "Closet" : "Style Pro"}.`);
      window.location.href = "wardrobe.html";
    } catch (err) {
      console.error(err);
      alert("Payment went through but activation failed — message Olawale and we'll sort it manually.");
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  renderPrices();
})();
