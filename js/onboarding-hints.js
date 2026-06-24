/* =========================================================
   FITCHECK — onboarding-hints.js
   First-run contextual guidance. All state in localStorage.
   Include on every page that needs hints.
   ========================================================= */

(function () {
  "use strict";

  const KEY = "ftc_hints";

  function getState() {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}"); }
    catch (e) { return {}; }
  }

  function setState(updates) {
    const state = Object.assign(getState(), updates);
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function seen(key) { return !!getState()[key]; }
  function markSeen(key) { setState({ [key]: true }); }

  /* ---------- OVERLAY BUILDER ---------- */

  function createOverlay(centered) {
    const el = document.createElement("div");
    el.className = "ftc-overlay" + (centered ? " center" : "");
    return el;
  }

  function createSheet(tag, title, body, steps, buttons) {
    const sheet = document.createElement("div");
    sheet.className = "ftc-sheet";
    let html = '<span class="ftc-tag">' + tag + "</span><h2>" + title + "</h2>";
    if (body) html += "<p>" + body + "</p>";
    if (steps && steps.length) {
      html += '<ul class="ftc-steps">';
      steps.forEach((s, i) => {
        html += '<li><span class="step-num">0' + (i + 1) + "</span><span>" + s + "</span></li>";
      });
      html += "</ul>";
    }
    html += '<div class="ftc-btn-row">';
    buttons.forEach((btn) => {
      html += '<button class="btn ' + (btn.primary ? "btn-solid" : "") + '" id="ftc-btn-' + btn.id + '">' + btn.label + "</button>";
    });
    html += "</div>";
    sheet.innerHTML = html;
    return sheet;
  }

  /* ---------- TOOLTIP ---------- */

  function showTooltip(message, key) {
    if (seen(key)) return;
    const el = document.createElement("div");
    el.className = "ftc-tooltip";
    el.innerHTML = message + ' <button id="ftc-tip-close" title="Got it">&#10005;</button>';
    document.body.appendChild(el);
    document.getElementById("ftc-tip-close").addEventListener("click", () => {
      el.remove();
      markSeen(key);
    });
    setTimeout(() => { if (el.parentNode) { el.remove(); markSeen(key); } }, 6000);
  }

  /* ---------- WARDROBE LANDING ---------- */

  window.ftcHintWardrobe = function () {
    if (seen("wardrobe_intro")) return;

    const overlay = createOverlay(false);
    const sheet = createSheet(
      "// welcome to your closet",
      "This is where your style lives.",
      "Upload your clothes once — FitCheck tags them automatically and sorts them by category. Then build outfits, check combos, and plan your whole week.",
      [
        "Tap a category tile to browse or add items to that category",
        "Select items across categories to build a full outfit",
        "Tap \"Check outfit\" to get an AI verdict on your combo",
        "Use Plan My Week to get styled outfits for Mon-Wed automatically",
      ],
      [
        { id: "skip", label: "Skip", primary: false },
        { id: "go", label: "Got it, let's go →", primary: true },
      ]
    );
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    function dismiss() { overlay.remove(); markSeen("wardrobe_intro"); }
    document.getElementById("ftc-btn-go").addEventListener("click", dismiss);
    document.getElementById("ftc-btn-skip").addEventListener("click", dismiss);
  };

  /* ---------- CATEGORY PAGE ---------- */

  window.ftcHintCategory = function (categoryName) {
    if (seen("category_intro")) return;

    const overlay = createOverlay(false);
    const sheet = createSheet(
      "// building an outfit",
      "Pick your " + categoryName.toLowerCase() + ".",
      "Tap any item to add it to your current outfit. The outfit bar at the bottom tracks everything you've selected across categories — go back and pick from other categories to complete the look.",
      null,
      [
        { id: "got", label: "Got it →", primary: true },
      ]
    );
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    function dismiss() { overlay.remove(); markSeen("category_intro"); }
    document.getElementById("ftc-btn-got").addEventListener("click", dismiss);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) dismiss(); });
  };

  /* ---------- STYLE MY FIT ---------- */

  window.ftcHintStyle = function () {
    if (seen("style_intro")) return;

    const overlay = createOverlay(true);
    const sheet = createSheet(
      "// style my fit",
      "Get a real read on your outfit.",
      null,
      [
        "Upload a photo of any fit — full outfit or a single piece",
        "Tell us the occasion and add any context (\"is the belt too much?\")",
        "We'll read the colors, silhouette, and vibe — then give you a verdict",
        "Free users get 5 fit-checks per month. Upgrade for unlimited.",
      ],
      [
        { id: "got", label: "Got it →", primary: true },
      ]
    );
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    function dismiss() { overlay.remove(); markSeen("style_intro"); }
    document.getElementById("ftc-btn-got").addEventListener("click", dismiss);
  };

  /* ---------- PLAN MY WEEK ---------- */

  window.ftcHintPlan = function () {
    if (seen("plan_intro")) return;

    const overlay = createOverlay(false);
    const sheet = createSheet(
      "// plan my week",
      "Your wardrobe, planned.",
      null,
      [
        "Set your occasion for each day — office, casual, evening out, home",
        "Each day gets two outfits: one for out, one for home",
        "We plan Mon-Wed first — tap \"Plan the rest\" when you're ready for Thu-Sun",
        "The AI uses your style profile and avoids repeating tops across days",
        "Save any plan you like to your history",
      ],
      [
        { id: "got", label: "Let's plan →", primary: true },
      ]
    );
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    function dismiss() { overlay.remove(); markSeen("plan_intro"); }
    document.getElementById("ftc-btn-got").addEventListener("click", dismiss);
  };

  /* ---------- OUTFIT BAR TOOLTIP ---------- */

  window.ftcHintOutfitBar = function () {
    showTooltip("Tap items from other categories to complete your outfit", "outfit_bar_tip");
  };

  /* ---------- EMPTY CLOSET HINT ---------- */

  window.ftcHintEmptyCloset = function () {
    if (seen("empty_closet")) return;
    showTooltip("Start by uploading your clothes — tap + Add items", "empty_closet");
    markSeen("empty_closet");
  };

  /* ---------- RESET (for testing) ---------- */
  window.ftcResetHints = function () {
    localStorage.removeItem(KEY);
    console.log("FitCheck hints reset — reload to see them again.");
  };

})();
