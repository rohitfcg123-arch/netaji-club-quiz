/* Lightweight mobile pull-to-refresh shared by all pages.
   Only activates when the page is already at the top; does not intercept form controls. */
(() => {
  if (window.__ncPullRefreshInstalled) return;
  window.__ncPullRefreshInstalled = true;

  const style = document.createElement("style");
  style.textContent = `
    #nc-pull-refresh {
      position: fixed; z-index: 2147483000; top: 0; left: 50%;
      transform: translate(-50%, -115%); opacity: 0; pointer-events: none;
      display: flex; align-items: center; gap: 9px; padding: 10px 16px;
      border: 1px solid rgba(16,47,93,.12); border-radius: 0 0 18px 18px;
      background: rgba(255,255,255,.97); color: #102f5d;
      box-shadow: 0 5px 18px rgba(16,47,93,.16);
      font: 600 13px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;
      white-space: nowrap; transition: transform .18s ease, opacity .18s ease;
      backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    }
    #nc-pull-refresh.nc-visible { opacity: 1; }
    #nc-pull-refresh.nc-refreshing { transform: translate(-50%, 0); opacity: 1; }
    #nc-pull-refresh .nc-arrow { display:inline-block; font-size:17px; line-height:1; transition:transform .15s ease; }
    #nc-pull-refresh.nc-ready .nc-arrow { transform: rotate(180deg); }
    #nc-pull-refresh.nc-refreshing .nc-arrow { animation:nc-pull-spin .8s linear infinite; }
    @keyframes nc-pull-spin { to { transform:rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) {
      #nc-pull-refresh, #nc-pull-refresh .nc-arrow { transition:none; animation:none !important; }
    }`;
  document.head.appendChild(style);

  const indicator = document.createElement("div");
  indicator.id = "nc-pull-refresh";
  indicator.setAttribute("role", "status");
  indicator.setAttribute("aria-live", "polite");
  indicator.innerHTML = '<span class="nc-arrow" aria-hidden="true">↓</span><span class="nc-label">खींचकर रिफ्रेश करें</span>';
  document.body.appendChild(indicator);

  let startX = 0, startY = 0, distance = 0, tracking = false, refreshing = false;
  const threshold = 82;
  const label = indicator.querySelector(".nc-label");

  function isInteractive(target) {
    return !!target.closest('input,textarea,select,button,[contenteditable="true"],.no-pull-refresh,[data-no-pull-refresh]');
  }
  function reset() {
    tracking = false; distance = 0;
    indicator.classList.remove("nc-visible", "nc-ready");
    indicator.style.transform = "";
  }
  document.addEventListener("touchstart", event => {
    if (refreshing || event.touches.length !== 1 || window.scrollY > 2 || isInteractive(event.target)) {
      tracking = false; return;
    }
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
    distance = 0; tracking = true;
  }, { passive: true });

  document.addEventListener("touchmove", event => {
    if (!tracking || refreshing || event.touches.length !== 1) return;
    const dx = event.touches[0].clientX - startX;
    const dy = event.touches[0].clientY - startY;
    if (dy < 0 || Math.abs(dx) > Math.abs(dy) * .8 || window.scrollY > 2) {
      if (dy < -8 || Math.abs(dx) > Math.abs(dy)) reset();
      return;
    }
    if (dy < 8) return;
    distance = Math.min(120, Math.max(0, dy * .62));
    indicator.classList.add("nc-visible");
    indicator.style.transform = 'translate(-50%, ' + Math.max(-12, distance - 48) + 'px)';
    const ready = distance >= threshold;
    indicator.classList.toggle("nc-ready", ready);
    label.textContent = ready ? "छोड़ें और रिफ्रेश करें" : "खींचकर रिफ्रेश करें";
    // Prevent the browser's overscroll only once the pull gesture is clearly intentional.
    if (dy > 14 && event.cancelable) event.preventDefault();
  }, { passive: false });

  document.addEventListener("touchend", () => {
    if (!tracking || refreshing) { reset(); return; }
    const shouldRefresh = distance >= threshold;
    tracking = false;
    if (!shouldRefresh) { reset(); return; }
    refreshing = true;
    indicator.classList.remove("nc-ready");
    indicator.classList.add("nc-visible", "nc-refreshing");
    indicator.style.transform = "translate(-50%, 0)";
    label.textContent = "रिफ्रेश हो रहा है…";
    // Small delay lets the user see feedback; browser reload refreshes live Firebase state.
    setTimeout(() => window.location.reload(), 180);
  }, { passive: true });

  document.addEventListener("touchcancel", reset, { passive: true });
})();
