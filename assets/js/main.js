/* Kazi Fahad — Portfolio interactions (no dependencies) */
(function () {
  "use strict";

  var root = document.documentElement;
  var header = document.querySelector(".site-header");

  /* Header background on scroll */
  function onScroll() {
    if (header) header.classList.toggle("scrolled", window.scrollY > 24);
  }
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* Mobile navigation */
  var toggle = document.querySelector(".nav-toggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var open = root.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    document.querySelectorAll(".nav-links a").forEach(function (a) {
      a.addEventListener("click", function () {
        root.classList.remove("nav-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && root.classList.contains("nav-open")) {
        root.classList.remove("nav-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.focus();
      }
    });
  }

  /* Reveal on scroll */
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  /* Filter chips + optional search: <div class="filters" data-filter-target="#list"> */
  document.querySelectorAll("[data-filter-target]").forEach(function (group) {
    var target = document.querySelector(group.getAttribute("data-filter-target"));
    if (!target) return;
    var searchInput = document.querySelector(group.getAttribute("data-search") || "#__none");
    var current = "all";

    function apply() {
      var q = searchInput ? searchInput.value.trim().toLowerCase() : "";
      target.querySelectorAll("[data-tags]").forEach(function (item) {
        var tags = item.getAttribute("data-tags").split(" ");
        var matchTag = current === "all" || tags.indexOf(current) !== -1;
        var matchText = !q || item.textContent.toLowerCase().indexOf(q) !== -1;
        item.classList.toggle("is-hidden", !(matchTag && matchText));
      });
      /* hide empty year groups (publications) */
      target.querySelectorAll("[data-group]").forEach(function (g) {
        var visible = g.querySelectorAll("[data-tags]:not(.is-hidden)").length;
        g.classList.toggle("is-hidden", visible === 0);
      });
      var empty = document.querySelector(group.getAttribute("data-empty") || "#__none");
      if (empty) {
        var any = target.querySelectorAll("[data-tags]:not(.is-hidden)").length;
        empty.classList.toggle("is-hidden", any > 0);
      }
    }

    group.querySelectorAll(".chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        group.querySelectorAll(".chip").forEach(function (c) {
          c.classList.remove("active");
          c.setAttribute("aria-pressed", "false");
        });
        chip.classList.add("active");
        chip.setAttribute("aria-pressed", "true");
        current = chip.getAttribute("data-filter");
        apply();
      });
    });
    if (searchInput) searchInput.addEventListener("input", apply);
  });

  /* BibTeX toggle + copy */
  document.querySelectorAll("[data-bibtex]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var pre = document.getElementById(btn.getAttribute("data-bibtex"));
      if (!pre) return;
      var open = pre.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(open));
      if (open && navigator.clipboard) {
        navigator.clipboard.writeText(pre.textContent).then(function () {
          var label = btn.querySelector("span");
          if (!label) return;
          var prev = label.textContent;
          label.textContent = "Copied";
          setTimeout(function () { label.textContent = prev; }, 1600);
        }).catch(function () {});
      }
    });
  });

  /* Contact form: sends through Formspree (set your form ID in the admin panel).
     Without a form ID, or if sending fails, it opens the visitor's email app instead. */
  var form = document.querySelector("#contact-form");
  if (form) {
    var status = form.querySelector(".form-status");
    var submit = form.querySelector("button[type=submit]");
    var mailtoLink = function (data) {
      var to = form.getAttribute("data-mailto");
      var subject = encodeURIComponent(data.get("subject") || "Hello from your website");
      var body = encodeURIComponent((data.get("message") || "") + "\n\n— " + (data.get("name") || "") + " (" + (data.get("email") || "") + ")");
      return "mailto:" + to + "?subject=" + subject + "&body=" + body;
    };
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var data = new FormData(form);
      var action = form.getAttribute("action") || "";
      if (!/^https:\/\/formspree\.io\/f\/[A-Za-z0-9]+$/.test(action)) {
        window.location.href = mailtoLink(data);
        status.textContent = "Your email app should open with the message ready to send.";
        status.className = "form-status ok";
        return;
      }
      submit.disabled = true;
      var original = submit.innerHTML;
      submit.firstChild.textContent = "Sending… ";
      status.className = "form-status";

      fetch(action, { method: "POST", body: data, headers: { "Accept": "application/json" } })
        .then(function (r) {
          if (!r.ok) throw new Error("send failed");
          status.textContent = "Thanks! Your message has been sent. I'll get back to you soon.";
          status.className = "form-status ok";
          form.reset();
        })
        .catch(function () {
          status.innerHTML = "The form couldn't be sent from here. <a href=\"" + mailtoLink(data).replace(/"/g, "&quot;") + "\" style=\"text-decoration:underline\">Send it by email instead</a>.";
          status.className = "form-status err";
        })
        .finally(function () { submit.disabled = false; submit.innerHTML = original; });
    });
  }

  /* Current year in footer */
  document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
