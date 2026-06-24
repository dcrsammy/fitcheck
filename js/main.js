/* =========================================================
   FITCHECK — main.js
   Handles: upload+style tool (style.html), booking form (book.html),
   mobile nav toggle (every page)
   ========================================================= */

(function () {
  "use strict";

  /* ---------------- MOBILE NAV TOGGLE (every page) ---------------- */
  const navToggle = document.getElementById("navToggle");
  const navLinks = document.getElementById("navLinks");
  if (navToggle && navLinks) {
    navToggle.addEventListener("click", () => {
      const isOpen = navLinks.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
    navLinks.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        navLinks.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---------------- STYLE TOOL (style.html) ---------------- */
  const uploadZone = document.getElementById("uploadZone");
  if (uploadZone) {
    const fileInput = document.getElementById("fileInput");
    const uploadDefault = document.getElementById("uploadDefault");
    const uploadPreviewWrap = document.getElementById("uploadPreviewWrap");
    const previewImg = document.getElementById("previewImg");
    const previewCap = document.getElementById("previewCap");
    const analyzeBtn = document.getElementById("analyzeBtn");
    const occasionChips = document.getElementById("occasionChips");
    const userPrompt = document.getElementById("userPrompt");
    const resultEmpty = document.getElementById("resultEmpty");
    const resultLoading = document.getElementById("resultLoading");
    const resultContent = document.getElementById("resultContent");
    const resultError = document.getElementById("resultError");
    const errorMsg = document.getElementById("errorMsg");

    let currentBase64 = null;
    let currentMediaType = null;
    let selectedOccasion = "everyday";

    uploadZone.addEventListener("click", () => fileInput.click());
    uploadZone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fileInput.click();
      }
    });
    uploadZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      uploadZone.classList.add("drag");
    });
    uploadZone.addEventListener("dragleave", () => uploadZone.classList.remove("drag"));
    uploadZone.addEventListener("drop", (e) => {
      e.preventDefault();
      uploadZone.classList.remove("drag");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFile(e.dataTransfer.files[0]);
      }
    });
    fileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
    });

    function handleFile(file) {
      if (!file.type.startsWith("image/")) return;
      currentMediaType = file.type;
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        currentBase64 = dataUrl.split(",")[1];
        uploadDefault.style.display = "none";
        uploadPreviewWrap.style.display = "block";
        previewImg.src = dataUrl;
        previewImg.classList.remove("developing");
        void previewImg.offsetWidth;
        previewImg.classList.add("developing");
        previewCap.textContent = file.name.slice(0, 24);
        analyzeBtn.disabled = false;
        resetResult();
      };
      reader.readAsDataURL(file);
    }

    occasionChips.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      [...occasionChips.children].forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      selectedOccasion = chip.dataset.val;
    });

    function resetResult() {
      resultEmpty.style.display = "none";
      resultLoading.style.display = "none";
      resultContent.style.display = "none";
      resultError.style.display = "none";
    }

    analyzeBtn.addEventListener("click", async () => {
      if (!currentBase64) return;
      resetResult();
      resultLoading.style.display = "block";

    async function getStyleProfile() {
      try {
        const cfg = window.FITCHECK_CONFIG;
        const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
        const { data: session } = await sb.auth.getSession();
        if (!session.session) return null;
        const { data } = await sb.from("profiles")
          .select("gender, vibes, dress_occasions")
          .eq("id", session.session.user.id)
          .single();
        return data || null;
      } catch (e) {
        return null;
      }
    }

      analyzeBtn.disabled = true;

      try {
        const res = await fetch("/.netlify/functions/style-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: currentBase64,
            mediaType: currentMediaType,
            occasion: selectedOccasion,
            userPrompt: userPrompt ? userPrompt.value.trim() : "",
            styleProfile: await getStyleProfile(),
            userId: (await (async () => { const { data } = await window.supabase.createClient(window.FITCHECK_CONFIG.SUPABASE_URL, window.FITCHECK_CONFIG.SUPABASE_ANON_KEY).auth.getSession(); return data.session ? data.session.user.id : null; })()),
          }),
        });

        if (!res.ok) throw new Error("Request failed");
        const data = await res.json();
        if (data.capped) { resultLoading.style.display = "none"; resultError.style.display = "block"; errorMsg.textContent = data.message || "Monthly limit reached. Upgrade to continue."; return; }
        renderResult(data);
      } catch (err) {
        resultLoading.style.display = "none";
        errorMsg.textContent =
          "Couldn't read that photo right now. Try again, or book Olawale direct for the real eye.";
        resultError.style.display = "block";
      } finally {
        analyzeBtn.disabled = false;
      }
    });

    function renderResult(data) {
      resultLoading.style.display = "none";
      resultContent.style.display = "block";

      const pieces = (data.pieces || [])
        .map((p) => `<span class="piece-tag">${escapeHtml(p)}</span>`)
        .join("");

      let html = `
        <div class="result-card">
          <h4>What we see</h4>
          <p>${escapeHtml(data.read || "")}</p>
          <div class="tag-list">${pieces}</div>
        </div>
        <div class="result-card">
          <h4>The verdict</h4>
          <p>${escapeHtml(data.verdict || "")}</p>
        </div>
        <div class="result-card">
          <h4>What we'd change</h4>
          <p>${escapeHtml(data.suggestions || "")}</p>
        </div>
      `;

      if (data.complex) {
        html += `
          <div class="complex-flag">
            <p>This one's got a lot going on — here's our best read, but you might want Olawale's eye on it directly.</p>
            <a href="book.html" class="btn btn-lime">Book Olawale</a>
          </div>
        `;
      }

      resultContent.innerHTML = html;
    }

    function escapeHtml(str) {
      const div = document.createElement("div");
      div.textContent = str;
      return div.innerHTML;
    }
  }

  /* ---------------- BOOKING FORM (book.html) ---------------- */
  const bookingForm = document.getElementById("bookingForm");
  if (bookingForm) {
    const svcOptions = document.querySelectorAll(".svc-option");
    const selectedService = document.getElementById("selectedService");
    const selectedPrice = document.getElementById("selectedPrice");
    const bookSubmit = document.getElementById("bookSubmit");
    const bookConfirm = document.getElementById("bookConfirm");

    svcOptions.forEach((opt) => {
      opt.addEventListener("click", () => {
        svcOptions.forEach((o) => o.classList.remove("active"));
        opt.classList.add("active");
        selectedService.value = opt.dataset.svc;
        selectedPrice.value = opt.dataset.price;
      });
    });

    bookingForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      bookSubmit.disabled = true;
      bookSubmit.textContent = "Sending...";

      const payload = {
        name: document.getElementById("name").value,
        phone: document.getElementById("phone").value,
        email: document.getElementById("email").value,
        date: document.getElementById("date").value,
        notes: document.getElementById("notes").value,
        service: selectedService.value,
        price: selectedPrice.value,
      };

      try {
        const res = await fetch("/.netlify/functions/book-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Request failed");

        bookingForm.style.display = "none";
        bookConfirm.style.display = "block";
      } catch (err) {
        bookSubmit.disabled = false;
        bookSubmit.textContent = "Request booking \u2192";
        alert("Couldn't send that — check your connection and try again, or WhatsApp Olawale direct.");
      }
    });
  }
})();
