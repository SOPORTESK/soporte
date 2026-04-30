/**
 * Sekunet Widget — script embebible
 * Uso: <script src="https://TU-DOMINIO/widget.js" data-color="#1d4ed8" data-label="Contactar soporte"></script>
 */
(function () {
  "use strict";

  var WIDGET_URL = (function () {
    var s = document.currentScript || (function () {
      var scripts = document.getElementsByTagName("script");
      return scripts[scripts.length - 1];
    })();
    var src = s ? s.getAttribute("src") : "";
    var origin = "";
    try {
      var u = new URL(src, window.location.href);
      origin = u.origin;
    } catch (e) {
      origin = window.location.origin;
    }
    return origin + "/widget/chat";
  })();

  var script = document.currentScript || (function () {
    var scripts = document.getElementsByTagName("script");
    return scripts[scripts.length - 1];
  })();

  var COLOR = (script && script.getAttribute("data-color")) || "#1d4ed8";
  var LABEL = (script && script.getAttribute("data-label")) || "Contactar soporte";
  var POSITION = (script && script.getAttribute("data-position")) || "bottom-right";

  /* ── Estilos ─────────────────────────────────────────────── */
  var style = document.createElement("style");
  style.textContent = [
    "#sek-widget-btn{position:fixed;z-index:999999;width:52px;height:52px;border-radius:50%;background:" + COLOR + ";border:none;cursor:pointer;box-shadow:0 4px 24px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;transition:transform .2s,box-shadow .2s;}",
    "#sek-widget-btn:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(0,0,0,.32);}",
    "#sek-widget-btn svg{width:26px;height:26px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}",
    "#sek-widget-label{position:fixed;z-index:999998;background:" + COLOR + ";color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;font-weight:600;padding:6px 14px;border-radius:20px;box-shadow:0 2px 12px rgba(0,0,0,.2);white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .2s;}",
    "#sek-widget-btn:hover + #sek-widget-label,#sek-widget-label.show{opacity:1;}",
    "#sek-widget-frame{position:fixed;z-index:999997;width:370px;max-width:calc(100vw - 24px);height:580px;max-height:calc(100vh - 90px);border:none;border-radius:18px;box-shadow:0 8px 48px rgba(0,0,0,.22);transform-origin:bottom right;transform:scale(0) translateY(10px);transition:transform .25s cubic-bezier(.34,1.56,.64,1),opacity .2s;opacity:0;background:#fff;overflow:hidden;}",
    "#sek-widget-frame.open{transform:scale(1) translateY(0);opacity:1;}",
    ".sek-badge{position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:#ef4444;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;display:none;}",
  ].join("");
  document.head.appendChild(style);

  /* ── Posicionamiento ─────────────────────────────────────── */
  var isLeft = POSITION.indexOf("left") !== -1;
  var isTop = POSITION.indexOf("top") !== -1;
  var posBtn = { bottom: isTop ? "" : "20px", top: isTop ? "20px" : "", left: isLeft ? "20px" : "", right: isLeft ? "" : "20px" };
  var posFrame = { bottom: isTop ? "" : "80px", top: isTop ? "80px" : "", left: isLeft ? "20px" : "", right: isLeft ? "" : "20px" };

  function applyPos(el, pos) {
    Object.keys(pos).forEach(function (k) { if (pos[k]) el.style[k] = pos[k]; });
  }

  /* ── Botón ───────────────────────────────────────────────── */
  var btn = document.createElement("button");
  btn.id = "sek-widget-btn";
  btn.setAttribute("aria-label", LABEL);
  btn.setAttribute("title", LABEL);
  btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>';
  applyPos(btn, posBtn);

  /* ── Label tooltip ───────────────────────────────────────── */
  var label = document.createElement("div");
  label.id = "sek-widget-label";
  label.textContent = LABEL;
  applyPos(label, {
    bottom: isTop ? "" : "82px",
    top: isTop ? "82px" : "",
    left: isLeft ? "20px" : "",
    right: isLeft ? "" : "20px",
  });

  /* ── iframe ──────────────────────────────────────────────── */
  var frame = document.createElement("iframe");
  frame.id = "sek-widget-frame";
  frame.src = WIDGET_URL;
  frame.title = "Sekunet Chat";
  frame.allow = "clipboard-write";
  applyPos(frame, posFrame);

  document.body.appendChild(btn);
  document.body.appendChild(label);
  document.body.appendChild(frame);

  /* ── Toggle ──────────────────────────────────────────────── */
  var isOpen = false;
  btn.addEventListener("click", function () {
    isOpen = !isOpen;
    frame.classList.toggle("open", isOpen);
    btn.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) {
      btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>';
    } else {
      btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>';
    }
  });

  /* ── Hover label ─────────────────────────────────────────── */
  btn.addEventListener("mouseenter", function () { label.classList.add("show"); });
  btn.addEventListener("mouseleave", function () { label.classList.remove("show"); });
})();
