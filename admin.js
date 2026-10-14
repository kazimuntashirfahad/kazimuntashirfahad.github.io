/* Admin panel for the GitHub Pages edition.
   Edits data/*.json and uploads files straight to your GitHub repository
   through the GitHub API, using a personal access token kept in this browser. */
(function () {
  "use strict";

  var app = document.getElementById("app");
  var STORE = "portfolio-admin";
  var API = "https://api.github.com";
  var cfg = null;          // {owner, repo, token, branch}
  var DATA = {};           // name -> parsed JSON

  /* ------------------------------------------------------------ helpers */
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function slugify(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60); }
  function rid() { return Math.random().toString(36).slice(2, 10); }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmtDate(d) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ""); return m ? MONTHS[+m[2] - 1] + " " + m[3] + ", " + m[1] : (d || ""); }
  var UI_ICONS = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>',
    "log-out": '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>'
  };
  function icon(name) {
    if (UI_ICONS[name]) return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + UI_ICONS[name] + "</svg>";
    var I = window.ICONS || { stroke: {}, filled: {} };
    if (I.filled[name]) return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + I.filled[name] + "</svg>";
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (I.stroke[name] || I.stroke.sparkles || "") + "</svg>";
  }
  function siteUrl(p) {
    p = String(p || "");
    if (/^https?:\/\//i.test(p)) return p;
    return "../" + p.replace(/^\/+/, "");
  }
  function b64ToText(b64) {
    var bin = atob(String(b64).replace(/\s/g, "")), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  }
  function bytesToB64(bytes) {
    var s = "", CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  function textToB64(t) { return bytesToB64(new TextEncoder().encode(t)); }

  var toastTimer;
  function toast(msg, kind) {
    var el = document.querySelector(".toast");
    if (!el) { el = document.createElement("div"); document.body.appendChild(el); }
    el.className = "toast " + (kind || "ok");
    el.setAttribute("role", kind === "err" ? "alert" : "status");
    el.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.remove(); }, kind === "err" ? 9000 : 4500);
  }
  function busy(msg) {
    var el = document.querySelector(".busy");
    if (msg === false) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement("div"); el.className = "busy"; el.innerHTML = "<span></span>"; document.body.appendChild(el); }
    el.firstChild.textContent = msg || "Saving…";
  }

  /* ------------------------------------------------------------ GitHub API */
  function gh(method, path, body) {
    return fetch(API + path, {
      method: method,
      cache: "no-store",
      headers: {
        "Authorization": "Bearer " + cfg.token,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
        if (!r.ok) {
          var err = new Error(friendly(r.status, j && j.message));
          err.status = r.status; throw err;
        }
        return j;
      });
    }, function () { throw new Error("Can't reach GitHub. Check your internet connection."); });
  }
  function friendly(status, msg) {
    if (status === 401) return "GitHub didn't accept the token. It may be wrong or expired. Log out and connect again with a new token.";
    if (status === 403) return "The token isn't allowed to change this repository. Give it \"Contents: Read and write\" access. (" + (msg || "forbidden") + ")";
    if (status === 404) return "Not found on GitHub. Check the username and repository name, and that the token can see this repository.";
    if (status === 409 || status === 422) return "Someone else changed this file at the same time. Please try again. (" + (msg || status) + ")";
    return "GitHub error " + status + (msg ? ": " + msg : "");
  }
  function repoPath(p) { return "/repos/" + encodeURIComponent(cfg.owner) + "/" + encodeURIComponent(cfg.repo) + p; }
  function contentsPath(file) { return repoPath("/contents/" + file.split("/").map(encodeURIComponent).join("/")); }

  function getFile(file) {
    return gh("GET", contentsPath(file) + "?ref=" + encodeURIComponent(cfg.branch) + "&t=" + Date.now());
  }
  function putFile(file, b64, message, sha) {
    var body = { message: message, content: b64, branch: cfg.branch };
    if (sha) body.sha = sha;
    return gh("PUT", contentsPath(file), body);
  }
  function deleteFile(file, sha, message) {
    return gh("DELETE", contentsPath(file), { message: message, sha: sha, branch: cfg.branch });
  }
  function readJson(name) {
    return getFile("data/" + name + ".json").then(function (f) {
      return { value: JSON.parse(b64ToText(f.content)), sha: f.sha };
    }, function (e) {
      if (e.status === 404) return { value: name === "settings" ? {} : [], sha: null };
      throw e;
    });
  }
  /* Always works on the newest copy: read, change, write; retry once on a clash. */
  function saveJson(name, change, message, tries) {
    tries = tries || 0;
    return readJson(name).then(function (cur) {
      var next = change(JSON.parse(JSON.stringify(cur.value)));
      var text = JSON.stringify(next, null, 2) + "\n";
      return putFile("data/" + name + ".json", textToB64(text), message, cur.sha).then(function () {
        DATA[name] = next; return next;
      });
    }).catch(function (e) {
      if ((e.status === 409 || e.status === 422) && tries < 2) return saveJson(name, change, message, tries + 1);
      throw e;
    });
  }

  /* ------------------------------------------------------------ schema */
  var COVER_STYLES = { "art-violet": "Violet waves", "art-teal": "Teal shapes", "art-orange": "Orange blocks", "art-lime": "Lime grid", "art-blue": "Blue glow", "art-rose": "Rose glow" };
  function focusOptions() { var o = {}; (DATA.focus || []).forEach(function (f) { o[f.id] = f.title; }); return o; }
  function F(key, label, type, opt) { return { key: key, label: label, type: type, opt: opt || {} }; }
  function join() { return Array.prototype.filter.call(arguments, Boolean).join(" · "); }

  var COLLECTIONS = {
    posts: {
      label: "Blog posts", singular: "post", icon: "file", title: "title",
      subtitle: function (i) { return join(fmtDate(i.date), i.category, i.published ? "" : "DRAFT", i.featured ? "featured" : ""); },
      sort: function (a, b) { return String(b.date || "").localeCompare(String(a.date || "")); },
      fields: [
        F("title", "Title", "text", { required: true }),
        F("slug", "Web address", "text", { help: "Leave empty to create it from the title. Letters, numbers and dashes only." }),
        F("date", "Date", "date", { required: true }),
        F("category", "Category", "text", { required: true, help: "e.g. Deep Learning, NLP, Research" }),
        F("read_time", "Reading time", "text", { help: "e.g. 8 min" }),
        F("excerpt", "Short summary", "textarea", { required: true }),
        F("cover_image", "Cover image", "image", { help: "Optional. Wide images work best (about 1600×700)." }),
        F("cover_style", "Cover artwork (if no image)", "select", { options: COVER_STYLES }),
        F("body", "Article", "markdown", { help: "Write normally. Blank line = new paragraph. ## Heading · **bold** · *italic* · - list item · > quote · [link](https://…) · ![caption](uploads/…) for images (copy the address from Media). Put code between lines of ```" }),
        F("published", "Published", "checkbox", { "default": true, help: "Untick to keep it as a draft." }),
        F("featured", "Featured on Blog page", "checkbox")
      ]
    },
    publications: {
      label: "Publications", singular: "publication", icon: "book", title: "title",
      subtitle: function (i) { return join((i.venue || "") + " " + (i.year || ""), i.featured ? "on homepage" : ""); },
      fields: [
        F("title", "Title", "text", { required: true }),
        F("authors", "Authors", "text", { help: "Put your own name in **double stars** to highlight it, e.g. **Kazi Fahad**, A. Researcher" }),
        F("venue", "Venue (short)", "text", { required: true, help: "Shown on the coloured badge, e.g. CVPR, ICML, arXiv" }),
        F("venue_color", "Badge colour", "color", { "default": "#3b6fd8" }),
        F("year", "Year", "text", { required: true, max: 4 }),
        F("type", "Type", "select", { options: { conference: "Conference", journal: "Journal", workshop: "Workshop", preprint: "Preprint" } }),
        F("topics", "Research areas", "multi", { options: focusOptions, help: "The paper is listed under these areas on the Research page." }),
        F("full_venue", "Full venue name", "text"),
        F("abstract", "Short summary", "textarea"),
        F("award", "Award (optional)", "text", { help: "e.g. Best Paper, Oral, Highlight" }),
        F("pdf", "Paper PDF (upload)", "file", { help: "Upload the PDF, or use the paper link below instead." }),
        F("paper_url", "Paper link", "url"),
        F("code_url", "Code link", "url"),
        F("slides_url", "Slides link", "url"),
        F("featured", "Show on homepage", "checkbox", { help: "The first 3 ticked publications appear on the homepage." })
      ]
    },
    projects: {
      label: "Projects", singular: "project", icon: "code", title: "name",
      subtitle: function (i) { return join(i.stars ? "★ " + i.stars : "", i.featured ? "on homepage" : "", i.spotlight ? "spotlight" : ""); },
      fields: [
        F("name", "Name", "text", { required: true }),
        F("description", "Description", "textarea", { required: true }),
        F("logo_icon", "Logo icon", "icon", { extra: { letter: "First letter (square badge)" }, "default": "code" }),
        F("logo_letter", "Logo letter", "text", { max: 2, help: "Used when the logo icon is \"First letter\"." }),
        F("color", "Logo colour", "color", { "default": "#c6f31c" }),
        F("logo_image", "Logo image (optional)", "image", { help: "Upload your own logo. It replaces the icon." }),
        F("stars", "GitHub stars", "text", { max: 10, help: "e.g. 1.2k" }),
        F("categories", "Categories", "text", { help: "Comma separated, e.g. library, computer vision. Used for the filter buttons." }),
        F("tech", "Technologies", "text", { help: "Comma separated, e.g. PyTorch, Python" }),
        F("github_url", "GitHub link", "url"),
        F("docs_url", "Documentation link", "url"),
        F("featured", "Show on homepage", "checkbox", { help: "The first 4 ticked projects appear on the homepage." }),
        F("spotlight", "Spotlight on Projects page", "checkbox", { help: "The first ticked project gets the big featured card." }),
        F("spotlight_text", "Spotlight extra text", "textarea")
      ]
    },
    focus: {
      label: "Research areas", singular: "research area", icon: "layers", title: "title",
      subtitle: function (i) { return i.short || ""; },
      fields: [
        F("title", "Title", "text", { required: true }),
        F("icon", "Icon", "icon", { "default": "scan" }),
        F("short", "Short description (homepage card)", "textarea", { required: true }),
        F("detail", "Longer description (Research page)", "textarea"),
        F("questions", "Open questions", "lines", { help: "One question per line." })
      ]
    },
    research_projects: {
      label: "Current research", singular: "research project", icon: "sparkles", title: "title", group: "Research page",
      subtitle: function (i) { return join(i.when, i.role); },
      fields: [F("title", "Title", "text", { required: true }), F("when", "When", "text", { help: "e.g. 2024 — Now" }), F("role", "Your role", "text"), F("description", "Description", "textarea")]
    },
    collaborations: {
      label: "Collaborations", singular: "collaboration", icon: "users", title: "name", group: "Research page",
      fields: [F("name", "Name", "text", { required: true })]
    },
    education: {
      label: "Education", singular: "education entry", icon: "cap", title: "title", group: "About page",
      subtitle: function (i) { return join(i.when, i.org); },
      fields: [F("title", "Degree", "text", { required: true }), F("org", "University", "text"), F("when", "When", "text"), F("description", "Description", "textarea")]
    },
    experience: {
      label: "Experience", singular: "experience entry", icon: "briefcase", title: "title", group: "About page",
      subtitle: function (i) { return join(i.when, i.org); },
      fields: [F("title", "Role", "text", { required: true }), F("org", "Organisation", "text"), F("when", "When", "text"), F("description", "Description", "textarea")]
    },
    skills: {
      label: "Skills", singular: "skill group", icon: "cpu", title: "group", group: "About page",
      subtitle: function (i) { return i.items || ""; },
      fields: [F("group", "Group name", "text", { required: true }), F("items", "Skills", "textarea", { help: "Comma separated." })]
    },
    awards: {
      label: "Awards", singular: "award", icon: "award", title: "title", group: "About page",
      subtitle: function (i) { return join(i.year, i.detail); },
      fields: [F("title", "Award", "text", { required: true }), F("year", "Year", "text", { max: 10 }), F("detail", "Detail", "text")]
    },
    talks: {
      label: "Talks & service", singular: "talk or service item", icon: "mic", title: "title", group: "About page",
      subtitle: function (i) { return join(i.year, i.detail); },
      fields: [F("title", "Title", "text", { required: true }), F("year", "Year", "text", { max: 10 }), F("detail", "Detail", "text")]
    },
    faqs: {
      label: "FAQ", singular: "question", icon: "message", title: "question", group: "Contact page",
      fields: [F("question", "Question", "text", { required: true }), F("answer", "Answer", "textarea", { required: true })]
    }
  };

  var SETTINGS = [
    ["Profile & photos", [
      F("site_name", "Your name", "text", { required: true }),
      F("portrait", "Profile photo", "image", { help: "Used on the homepage, About page and blog. A tall or square photo with a dark background works best." }),
      F("cv", "CV (PDF)", "file"),
      F("email", "Public email", "email", { required: true }),
      F("location", "Location", "text"),
      F("github", "GitHub link", "url"),
      F("linkedin", "LinkedIn link", "url"),
      F("x", "X (Twitter) link", "url"),
      F("scholar", "Google Scholar link", "url")
    ]],
    ["Homepage", [
      F("hero_eyebrow", "Small line above the title", "text"),
      F("hero_title", "Big title", "lines", { help: "One line per row. A lime dot is added at the end." }),
      F("hero_lead", "Intro text", "textarea"),
      F("interests", "Research interests", "text", { help: "Comma separated." }),
      F("meta_description", "Google description", "textarea", { help: "The short text search engines show under your site name." })
    ]],
    ["Page intros & numbers", [
      F("research_intro", "Research page intro", "textarea"),
      F("research_stats", "Research page numbers", "lines", { help: "One per line as number|label, e.g. 09+|Publications" }),
      F("publications_intro", "Publications page intro", "textarea"),
      F("publications_stats", "Publications page numbers", "lines"),
      F("projects_intro", "Projects page intro", "textarea"),
      F("projects_stats", "Projects page numbers", "lines"),
      F("blog_intro", "Blog page intro", "textarea")
    ]],
    ["About page", [
      F("about_intro", "Intro text", "textarea"),
      F("about_eyebrow", "Small line above heading", "text"),
      F("about_heading", "Heading", "text"),
      F("about_bio", "Biography", "markdown", { help: "Blank line = new paragraph. **bold**, *italic*." }),
      F("about_status", "Photo badge", "text", { help: "e.g. Open to collaborations. Leave empty to hide." }),
      F("about_stats", "Numbers", "lines", { help: "One per line as number|label." })
    ]],
    ["Contact & email", [
      F("contact_intro", "Contact page intro", "textarea"),
      F("response_time", "Response time", "text"),
      F("contact_topics", "Form topics", "text", { help: "Comma separated." }),
      F("formspree_id", "Formspree form ID", "text", { max: 40, help: "Makes the contact form send messages to your inbox. Sign up free at formspree.io, create a form, and paste the code after /f/ (e.g. xyzabcde). Leave empty and the form opens the visitor's email app instead." }),
      F("cta_eyebrow", "Bottom section small line", "text"),
      F("cta_title", "Bottom section title", "text"),
      F("cta_text", "Bottom section text", "textarea")
    ]]
  ];

  /* ------------------------------------------------------------ form fields */
  function fieldHtml(f, value) {
    var id = "f-" + f.key, o = f.opt, req = o.required ? ' <span class="req">*</span>' : "";
    var v = value == null ? (o["default"] != null ? o["default"] : "") : value;
    var help = o.help ? '<p class="help">' + esc(o.help).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>") + "</p>" : "";
    var max = o.max ? ' maxlength="' + o.max + '"' : "";
    var r = o.required ? " required" : "";
    var input;
    switch (f.type) {
      case "checkbox":
        return '<div class="field check"><label><input type="checkbox" name="' + f.key + '"' + (v ? " checked" : "") + "> " + esc(f.label) + "</label>" + help + "</div>";
      case "textarea": case "lines":
        input = '<textarea id="' + id + '" name="' + f.key + '" rows="4"' + r + ">" + esc(v) + "</textarea>"; break;
      case "markdown":
        input = '<textarea class="md" id="' + id + '" name="' + f.key + '"' + r + ">" + esc(v) + "</textarea>"; break;
      case "color":
        input = '<div class="row"><input type="color" id="' + id + '" name="' + f.key + '" value="' + esc(/^#[0-9a-f]{6}$/i.test(v) ? v : (o["default"] || "#c6f31c")) + '"></div>'; break;
      case "select":
        input = '<select id="' + id + '" name="' + f.key + '">' + Object.keys(o.options).map(function (k) {
          return '<option value="' + esc(k) + '"' + (k === v ? " selected" : "") + ">" + esc(o.options[k]) + "</option>";
        }).join("") + "</select>"; break;
      case "icon":
        var names = Object.keys((window.ICONS || {}).stroke || {}).concat(Object.keys((window.ICONS || {}).filled || {})).sort();
        var opts = Object.assign({}, o.extra || {});
        names.forEach(function (n) { opts[n] = n; });
        input = '<div class="row"><span class="icon-preview" data-icon-preview>' + (v === "letter" ? "" : icon(v)) + '</span><select id="' + id + '" name="' + f.key + '" data-icon-select>' +
          Object.keys(opts).map(function (k) { return '<option value="' + esc(k) + '"' + (k === v ? " selected" : "") + ">" + esc(opts[k]) + "</option>"; }).join("") + "</select></div>"; break;
      case "multi":
        var options = typeof o.options === "function" ? o.options() : o.options, cur = Array.isArray(v) ? v : [];
        input = '<div class="pills">' + (Object.keys(options).length ? Object.keys(options).map(function (k) {
          return '<label class="pill"><input type="checkbox" name="' + f.key + '" value="' + esc(k) + '"' + (cur.indexOf(k) !== -1 ? " checked" : "") + "> " + esc(options[k]) + "</label>";
        }).join("") : '<span class="muted small">Add research areas first.</span>') + "</div>"; break;
      case "image": case "file":
        var isImg = f.type === "image";
        var current = v ? '<div class="current">' + (isImg ? '<img src="' + esc(siteUrl(v)) + '" alt="" data-preview>' : icon("file")) +
          '<a href="' + esc(siteUrl(v)) + '" target="_blank" rel="noopener">' + esc(String(v).split("/").pop()) + '</a><label class="remove"><input type="checkbox" name="' + f.key + '__remove"> Remove</label></div>' : "";
        input = current + '<input type="file" id="' + id + '" name="' + f.key + '__file" accept="' + (isImg ? "image/jpeg,image/png,image/webp,image/gif" : ".pdf,application/pdf") + '">' +
          '<input type="hidden" name="' + f.key + '" value="' + esc(v) + '">'; break;
      default:
        var t = { email: "email", url: "url", date: "date" }[f.type] || "text";
        input = '<input type="' + t + '" id="' + id + '" name="' + f.key + '" value="' + esc(v) + '"' + max + r + (t === "url" ? ' placeholder="https://…"' : "") + ">";
    }
    return '<div class="field"><label for="' + id + '">' + esc(f.label) + req + "</label>" + input + help + "</div>";
  }

  var ALLOWED = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "application/pdf": "pdf" };
  var MAX_BYTES = 10 * 1024 * 1024;

  function checkFile(file, isImg) {
    var ext = ALLOWED[file.type];
    if (!ext || (isImg && ext === "pdf") || (!isImg && ext !== "pdf")) return isImg ? "Please choose a JPG, PNG, WEBP or GIF image." : "Please choose a PDF file.";
    if (file.size > MAX_BYTES) return "That file is bigger than 10 MB. Please make it smaller first.";
    return "";
  }
  function uploadFile(file) {
    var ext = ALLOWED[file.type];
    var base = slugify(file.name.replace(/\.[^.]+$/, "")) || "file";
    var path = "uploads/" + new Date().getFullYear() + "/" + base + "-" + rid().slice(0, 6) + "." + ext;
    return file.arrayBuffer().then(function (buf) {
      return putFile(path, bytesToB64(new Uint8Array(buf)), "Upload " + file.name);
    }).then(function () { return path; });
  }

  /* Reads the form into a plain object, uploading any chosen files first. */
  function collect(form, fields) {
    var out = {}, uploads = [], problems = [];
    fields.forEach(function (f) {
      var el = form.elements[f.key];
      switch (f.type) {
        case "checkbox": out[f.key] = !!(el && el.checked); break;
        case "multi": out[f.key] = Array.prototype.map.call(form.querySelectorAll('input[name="' + f.key + '"]:checked'), function (c) { return c.value; }); break;
        case "image": case "file":
          var fileEl = form.elements[f.key + "__file"], rm = form.elements[f.key + "__remove"];
          out[f.key] = rm && rm.checked ? "" : (el ? el.value : "");
          if (fileEl && fileEl.files && fileEl.files[0]) {
            var file = fileEl.files[0], bad = checkFile(file, f.type === "image");
            if (bad) problems.push(f.label + ": " + bad);
            else uploads.push(uploadFile(file).then(function (p) { out[f.key] = p; }));
          }
          break;
        default:
          var v = el ? String(el.value) : "";
          if (f.type !== "markdown" && f.type !== "textarea" && f.type !== "lines") v = v.replace(/\s*\n\s*/g, " ");
          if (f.type === "lines") v = v.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean).join("\n");
          else if (f.type !== "markdown") v = v.trim();
          if (f.type === "url" && v && !/^(https?:\/\/|mailto:)/i.test(v) && !/^[a-z0-9._\/-]+$/i.test(v)) problems.push(f.label + ": please enter a full link starting with https://");
          if (f.type === "url" && /^[a-z][a-z0-9+.-]*:/i.test(v) && !/^(https?:|mailto:)/i.test(v)) problems.push(f.label + ": only https:// or mailto: links are allowed.");
          out[f.key] = v;
      }
      if (f.opt.required && f.type !== "checkbox" && !String(out[f.key] || "").trim() && f.type !== "image" && f.type !== "file") problems.push(f.label + " is required.");
    });
    if (problems.length) return Promise.reject(new Error(problems.join(" ")));
    if (uploads.length) busy("Uploading file…");
    return Promise.all(uploads).then(function () { return out; });
  }

  /* ------------------------------------------------------------ layout */
  function shell(active, inner) {
    var groups = {}, order = [];
    Object.keys(COLLECTIONS).forEach(function (k) {
      var g = COLLECTIONS[k].group || "Content";
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(k);
    });
    var nav = '<a href="#/"' + (active === "dash" ? ' class="active"' : "") + ">" + icon("grid") + "<span>Dashboard</span></a>" +
      '<a href="#/settings"' + (active === "settings" ? ' class="active"' : "") + ">" + icon("user") + "<span>Site settings</span></a>" +
      '<a href="#/media"' + (active === "media" ? ' class="active"' : "") + ">" + icon("image") + "<span>Media</span></a>";
    order.forEach(function (g) {
      nav += '<div class="nav-group">' + esc(g) + "</div>";
      groups[g].forEach(function (k) {
        nav += '<a href="#/c/' + k + '"' + (active === k ? ' class="active"' : "") + ">" + icon(COLLECTIONS[k].icon) + "<span>" + esc(COLLECTIONS[k].label) + "</span></a>";
      });
    });
    app.innerHTML = '<div class="shell"><aside class="side"><div class="brand">Admin <span>panel</span></div><div class="who">' + esc(cfg.owner + "/" + cfg.repo) + "</div><nav>" + nav + "</nav>" +
      '<div class="side-foot"><a class="btn ghost" href="../index.html" target="_blank" rel="noopener">' + icon("arrow-up-right") + " View site</a>" +
      '<button class="btn ghost" type="button" data-action="logout">' + icon("log-out") + " Log out</button></div></aside>" +
      '<main class="main">' + inner + "</main></div>";
    window.scrollTo(0, 0);
  }
  var LIVE_NOTE = '<p class="notice">Saved changes go live on your website in about 1–2 minutes. You can watch the progress on <a href="#" data-actions-link target="_blank" rel="noopener">GitHub → Actions</a>. If you don\'t see a change, refresh the page with Ctrl+Shift+R.</p>';
  function fixLinks() {
    document.querySelectorAll("[data-actions-link]").forEach(function (a) { a.href = "https://github.com/" + encodeURIComponent(cfg.owner) + "/" + encodeURIComponent(cfg.repo) + "/actions"; });
  }

  /* ------------------------------------------------------------ views */
  function viewDash() {
    var tiles = ["posts", "publications", "projects", "focus"].map(function (k) {
      return '<a class="tile" href="#/c/' + k + '"><strong>' + (DATA[k] || []).length + "</strong><span>" + esc(COLLECTIONS[k].label) + "</span></a>";
    }).join("");
    shell("dash", "<h1>Welcome back" + (DATA.settings && DATA.settings.site_name ? ", " + esc(String(DATA.settings.site_name).split(" ")[0]) : "") + "</h1>" +
      '<p class="muted">Everything on your website can be changed from here. Pick a section on the left.</p>' + LIVE_NOTE +
      '<div class="tiles">' + tiles + "</div><h2>Quick actions</h2>" +
      '<div class="quick"><a class="btn primary" href="#/c/posts/new">' + icon("plus") + ' New blog post</a><a class="btn" href="#/c/publications/new">' + icon("plus") + ' New publication</a><a class="btn" href="#/c/projects/new">' + icon("plus") + ' New project</a><a class="btn" href="#/settings">' + icon("user") + ' Edit profile & photo</a><a class="btn" href="#/media">' + icon("upload") + " Upload files</a></div>" +
      "<h2>Contact form messages</h2>" +
      '<div class="card"><p style="margin:0">' + (DATA.settings && DATA.settings.formspree_id
        ? 'Messages from your contact form arrive in your email inbox. You can also see them at <a href="https://formspree.io/forms" target="_blank" rel="noopener" style="color:var(--accent)">formspree.io</a>.'
        : 'Your contact form currently opens the visitor\'s email app. To receive messages directly, add a free Formspree form ID under <a href="#/settings/4" style="color:var(--accent)">Site settings → Contact &amp; email</a>.') + "</p></div>");
    fixLinks();
  }

  function viewSettings(tab) {
    tab = Math.max(0, Math.min(SETTINGS.length - 1, parseInt(tab, 10) || 0));
    var s = DATA.settings || {}, fields = SETTINGS[tab][1];
    shell("settings", "<h1>Site settings</h1>" + LIVE_NOTE +
      '<div class="tabs">' + SETTINGS.map(function (g, i) { return '<a href="#/settings/' + i + '"' + (i === tab ? ' class="active"' : "") + ">" + esc(g[0]) + "</a>"; }).join("") + "</div>" +
      '<form class="form" id="edit" novalidate>' + fields.map(function (f) { return fieldHtml(f, s[f.key]); }).join("") +
      '<div class="actions"><button class="btn primary" type="submit">' + icon("check") + " Save changes</button></div></form>");
    fixLinks();
    var form = document.getElementById("edit");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      busy("Saving…");
      collect(form, fields).then(function (vals) {
        busy("Saving…");
        return saveJson("settings", function (cur) { return Object.assign(cur || {}, vals); }, "Update " + SETTINGS[tab][0] + " settings");
      }).then(function () { busy(false); toast("Saved! Your website will update in about a minute."); viewSettings(tab); })
        .catch(function (err) { busy(false); toast(err.message, "err"); });
    });
  }

  function listItems(name) {
    var c = COLLECTIONS[name], items = (DATA[name] || []).map(function (it, i) { return { it: it, i: i }; });
    if (c.sort) items.sort(function (a, b) { return c.sort(a.it, b.it); });
    return items;
  }

  function viewList(name) {
    var c = COLLECTIONS[name], items = listItems(name), total = items.length;
    var rows = items.map(function (x, n) {
      var it = x.it, sub = c.subtitle ? c.subtitle(it) : "";
      var view = name === "posts" && it.slug ? '<a class="icon-btn" title="View" href="../post.html?slug=' + encodeURIComponent(it.slug) + '" target="_blank" rel="noopener" style="display:grid;place-items:center">' + icon("arrow-up-right") + "</a>" : "";
      var move = c.sort ? "" : '<button class="icon-btn" type="button" title="Move up" data-move="-1" data-id="' + esc(it.id) + '"' + (n === 0 ? " disabled" : "") + ">↑</button>" +
        '<button class="icon-btn" type="button" title="Move down" data-move="1" data-id="' + esc(it.id) + '"' + (n === total - 1 ? " disabled" : "") + ">↓</button>";
      return '<div class="row-item"><div class="ri-main"><a class="ri-title" href="#/c/' + name + "/" + encodeURIComponent(it.id) + '">' + esc(it[c.title] || "(untitled)") + "</a>" +
        (sub ? '<div class="ri-sub">' + esc(sub) + "</div>" : "") + '</div><div class="ri-actions">' + view + move +
        '<a class="btn small" href="#/c/' + name + "/" + encodeURIComponent(it.id) + '">Edit</a><button class="btn small danger" type="button" data-delete="' + esc(it.id) + '">Delete</button></div></div>';
    }).join("");
    shell(name, '<div class="head-row"><div><h1>' + esc(c.label) + '</h1><p class="muted" style="margin:0">' + total + " " + (total === 1 ? esc(c.singular) : "items") + (c.sort ? " · newest first" : " · shown on the site in this order") + "</p></div>" +
      '<a class="btn primary" href="#/c/' + name + '/new">' + icon("plus") + " Add " + esc(c.singular) + "</a></div>" + LIVE_NOTE +
      (total ? '<div class="list">' + rows + "</div>" : '<div class="card empty">Nothing here yet. Click “Add ' + esc(c.singular) + '” to create the first one.</div>'));
    fixLinks();
    app.querySelectorAll("[data-delete]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-delete"), it = (DATA[name] || []).filter(function (x) { return x.id === id; })[0];
        if (!window.confirm("Delete “" + ((it && it[c.title]) || "this item") + "”? This can't be undone here.")) return;
        busy("Deleting…");
        saveJson(name, function (arr) { return (arr || []).filter(function (x) { return x.id !== id; }); }, "Delete " + c.singular + ": " + ((it && it[c.title]) || id))
          .then(function () { busy(false); toast("Deleted."); viewList(name); })
          .catch(function (err) { busy(false); toast(err.message, "err"); });
      });
    });
    app.querySelectorAll("[data-move]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-id"), d = +b.getAttribute("data-move");
        busy("Saving order…");
        saveJson(name, function (arr) {
          var i = arr.findIndex(function (x) { return x.id === id; }), j = i + d;
          if (i < 0 || j < 0 || j >= arr.length) return arr;
          var t = arr[i]; arr[i] = arr[j]; arr[j] = t; return arr;
        }, "Reorder " + c.label.toLowerCase())
          .then(function () { busy(false); viewList(name); })
          .catch(function (err) { busy(false); toast(err.message, "err"); });
      });
    });
  }

  function viewEdit(name, id) {
    var c = COLLECTIONS[name], isNew = id === "new";
    var item = isNew ? null : (DATA[name] || []).filter(function (x) { return x.id === id; })[0];
    if (!isNew && !item) { location.hash = "#/c/" + name; return; }
    if (isNew && name === "posts") item = { date: new Date().toISOString().slice(0, 10) };
    shell(name, '<a class="crumb" href="#/c/' + name + '">← ' + esc(c.label) + "</a><h1>" + (isNew ? "Add " + esc(c.singular) : "Edit " + esc(c.singular)) + "</h1>" +
      '<form class="form" id="edit" novalidate>' + c.fields.map(function (f) { return fieldHtml(f, item ? item[f.key] : null); }).join("") +
      '<div class="actions"><button class="btn primary" type="submit">' + icon("check") + (isNew ? " Create" : " Save changes") + '</button><a class="btn ghost" href="#/c/' + name + '">Cancel</a></div></form>');
    var form = document.getElementById("edit");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      busy("Saving…");
      collect(form, c.fields).then(function (vals) {
        busy("Saving…");
        var newId = isNew ? (name === "focus" ? slugify(vals.title) || rid() : rid()) : id;
        return saveJson(name, function (arr) {
          arr = arr || [];
          if (name === "posts") {
            var base = slugify(vals.slug || vals.title) || "post", slug = base, n = 2;
            var taken = function (s) { return arr.some(function (x) { return x.slug === s && x.id !== newId; }); };
            while (taken(slug)) slug = base + "-" + n++;
            vals.slug = slug;
          }
          if (isNew) {
            if (name === "focus") { var b = newId, k = 2; while (arr.some(function (x) { return x.id === newId; })) newId = b + "-" + k++; }
            var rec = Object.assign({ id: newId }, vals);
            if (name === "posts") arr.unshift(rec); else arr.push(rec);
            return arr;
          }
          var i = arr.findIndex(function (x) { return x.id === id; });
          if (i < 0) throw new Error("This item was deleted somewhere else. Please go back to the list.");
          arr[i] = Object.assign({}, arr[i], vals);
          return arr;
        }, (isNew ? "Add " : "Update ") + c.singular + ": " + (vals[c.title] || ""));
      }).then(function () {
        busy(false); toast(isNew ? "Created! It will appear on your website in about a minute." : "Saved! Your website will update in about a minute.");
        location.hash = "#/c/" + name;
      }).catch(function (err) { busy(false); toast(err.message, "err"); });
    });
  }

  function listUploads(dir) {
    return gh("GET", contentsPath(dir) + "?ref=" + encodeURIComponent(cfg.branch) + "&t=" + Date.now()).then(function (items) {
      if (!Array.isArray(items)) return [];
      return Promise.all(items.map(function (it) { return it.type === "dir" ? listUploads(it.path) : [it]; }))
        .then(function (parts) { return [].concat.apply([], parts); });
    }, function (e) { if (e.status === 404) return []; throw e; });
  }

  function viewMedia() {
    shell("media", '<h1>Media</h1><p class="muted">Upload images and PDFs here, then copy their address into a blog post (e.g. <code>![caption](uploads/2026/photo.jpg)</code>) or a link field. Max 10 MB each.</p>' +
      '<form class="form upload card" id="up"><input type="file" name="file" accept="image/jpeg,image/png,image/webp,image/gif,.pdf,application/pdf" multiple required><button class="btn primary" type="submit">' + icon("upload") + " Upload</button></form>" +
      '<div id="media"><p class="loading">Loading files…</p></div>');
    document.getElementById("up").addEventListener("submit", function (e) {
      e.preventDefault();
      var files = Array.prototype.slice.call(e.target.elements.file.files);
      if (!files.length) return;
      for (var i = 0; i < files.length; i++) {
        var bad = checkFile(files[i], files[i].type !== "application/pdf");
        if (bad) { toast(files[i].name + ": " + bad, "err"); return; }
      }
      busy("Uploading…");
      files.reduce(function (p, f) { return p.then(function () { return uploadFile(f); }); }, Promise.resolve())
        .then(function () { busy(false); toast("Uploaded! Files are usable on the website in about a minute."); viewMedia(); })
        .catch(function (err) { busy(false); toast(err.message, "err"); });
    });
    listUploads("uploads").then(function (files) {
      files = files.filter(function (f) { return !/\/\.gitkeep$|^uploads\/\.gitkeep$/.test(f.path); }).sort(function (a, b) { return b.path.localeCompare(a.path); });
      var box = document.getElementById("media");
      if (!box) return;
      if (!files.length) { box.innerHTML = '<div class="card empty" style="margin-top:20px">No files uploaded yet.</div>'; return; }
      box.innerHTML = '<div class="media-grid">' + files.map(function (f) {
        var img = /\.(jpe?g|png|webp|gif)$/i.test(f.path);
        return '<div class="media"><a class="thumb" href="' + esc(f.download_url || siteUrl(f.path)) + '" target="_blank" rel="noopener">' +
          (img ? '<img src="' + esc(f.download_url || siteUrl(f.path)) + '" alt="" loading="lazy">' : "<span>PDF</span>") + "</a>" +
          '<input class="copy" type="text" readonly value="' + esc(f.path) + '" data-copy title="Click to copy">' +
          '<div class="meta"><span>' + Math.max(1, Math.round(f.size / 1024)) + ' KB</span><button class="link danger" type="button" data-del-file="' + esc(f.path) + '" data-sha="' + esc(f.sha) + '">Delete</button></div></div>';
      }).join("") + "</div>";
      box.querySelectorAll("[data-del-file]").forEach(function (b) {
        b.addEventListener("click", function () {
          var p = b.getAttribute("data-del-file");
          var used = JSON.stringify(DATA).indexOf(p) !== -1;
          if (!window.confirm("Delete " + p + "?" + (used ? "\n\nWarning: this file is used on your website right now. It will show as broken." : ""))) return;
          busy("Deleting…");
          deleteFile(p, b.getAttribute("data-sha"), "Delete " + p)
            .then(function () { busy(false); toast("Deleted."); viewMedia(); })
            .catch(function (err) { busy(false); toast(err.message, "err"); });
        });
      });
    }).catch(function (err) {
      var box = document.getElementById("media");
      if (box) box.innerHTML = '<div class="flash err" style="margin-top:20px">' + esc(err.message) + "</div>";
    });
  }

  /* ------------------------------------------------------------ connect */
  function guess() {
    var h = location.hostname, m = /^([a-z0-9-]+)\.github\.io$/i.exec(h);
    if (!m) return { owner: "", repo: "" };
    var segs = location.pathname.split("/").filter(Boolean);
    return { owner: m[1], repo: segs.length && segs[0] !== "admin" ? segs[0] : m[1] + ".github.io" };
  }
  function viewConnect(msg, prev) {
    var g = guess(), saved = prev || {};
    if (!prev) try { saved = JSON.parse(localStorage.getItem(STORE) || "{}") || {}; } catch (e) {}
    var owner = saved.owner || g.owner, repo = saved.repo || g.repo;
    var known = !!(owner && repo);
    document.body.className = "auth";
    app.innerHTML = '<form class="auth-card" id="connect" autocomplete="off"><div class="brand">Admin <span>panel</span></div><h1>Connect to GitHub</h1>' +
      '<p class="muted">Paste your GitHub access token to start editing. It stays only in this browser.</p>' +
      (msg ? '<div class="flash err">' + esc(msg) + "</div>" : "") +
      '<label>Access token<input type="password" name="token" required placeholder="github_pat_…" spellcheck="false"></label>' +
      "<details" + (known ? "" : " open") + "><summary>Repository: " + (known ? esc(owner + "/" + repo) : "not set") + '</summary><div class="grid2">' +
      '<label>GitHub username<input type="text" name="owner" value="' + esc(owner) + '" required spellcheck="false"></label>' +
      '<label>Repository name<input type="text" name="repo" value="' + esc(repo) + '" required spellcheck="false"></label></div></details>' +
      '<label style="flex-direction:row;display:flex;gap:8px;align-items:center;text-transform:none;letter-spacing:0;font-weight:600;font-size:13px"><input type="checkbox" name="remember" checked style="accent-color:var(--accent)"> Remember me on this computer</label>' +
      '<button class="btn primary" type="submit">Connect</button>' +
      "<details><summary>How do I get a token?</summary><ol class=\"steps\">" +
      '<li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a></li>' +
      "<li>Name: <b>Portfolio admin</b>. Expiration: up to 1 year.</li>" +
      "<li>Repository access: <b>Only select repositories</b> → pick your website repository.</li>" +
      "<li>Permissions → Repository permissions → <b>Contents: Read and write</b>.</li>" +
      "<li>Click <b>Generate token</b>, copy it, and paste it above.</li></ol></details>" +
      '<a class="back" href="../index.html">← Back to website</a></form>';
    document.getElementById("connect").addEventListener("submit", function (e) {
      e.preventDefault();
      var f = e.target;
      var c = { owner: f.owner.value.trim(), repo: f.repo.value.trim(), token: f.token.value.trim() };
      if (!c.owner || !c.repo || !c.token) { viewConnect("Please fill in the token, username and repository.", c); return; }
      var btn = f.querySelector("button"); btn.disabled = true; btn.textContent = "Connecting…";
      cfg = c;
      gh("GET", repoPath("")).then(function (r) {
        if (!r.permissions || !r.permissions.push) throw new Error("This token can read the repository but can't change it. Give it \"Contents: Read and write\" permission.");
        cfg.branch = r.default_branch || "main";
        var keep = { owner: c.owner, repo: c.repo };
        if (f.remember.checked) { keep.token = c.token; try { sessionStorage.removeItem(STORE); } catch (x) {} }
        else { try { sessionStorage.setItem(STORE, c.token); } catch (x) {} }
        try { localStorage.setItem(STORE, JSON.stringify(keep)); } catch (x) {}
        return start();
      }).catch(function (err) { cfg = null; viewConnect(err.message, c); });
    });
  }

  function loadAll() {
    var names = ["settings"].concat(Object.keys(COLLECTIONS));
    return Promise.all(names.map(function (n) { return readJson(n).then(function (r) { DATA[n] = r.value; }); }));
  }

  function route() {
    if (!cfg) return;
    var p = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    if (p[0] === "settings") return viewSettings(p[1]);
    if (p[0] === "media") return viewMedia();
    if (p[0] === "c" && COLLECTIONS[p[1]]) return p[2] ? viewEdit(p[1], p[2]) : viewList(p[1]);
    viewDash();
  }

  function start() {
    document.body.className = "";
    app.innerHTML = '<p class="loading" style="text-align:center">Loading your content from GitHub…</p>';
    return loadAll().then(function () {
      window.addEventListener("hashchange", route);
      route();
    });
  }

  /* global UI helpers */
  document.addEventListener("click", function (e) {
    var out = e.target.closest('[data-action="logout"]');
    if (out) {
      if (!window.confirm("Log out and forget the token on this computer?")) return;
      try { localStorage.setItem(STORE, JSON.stringify({ owner: cfg.owner, repo: cfg.repo })); sessionStorage.removeItem(STORE); } catch (x) {}
      cfg = null; DATA = {}; location.hash = ""; viewConnect();
      return;
    }
    var el = e.target.closest("[data-copy]");
    if (el) {
      el.select();
      if (navigator.clipboard) navigator.clipboard.writeText(el.value).then(function () {
        var v = el.value; el.value = "Copied!"; setTimeout(function () { el.value = v; }, 1000);
      }).catch(function () {});
    }
  });
  document.addEventListener("change", function (e) {
    var sel = e.target;
    if (sel.matches && sel.matches("[data-icon-select]")) {
      var prev = sel.parentNode.querySelector("[data-icon-preview]");
      if (prev) prev.innerHTML = sel.value === "letter" ? "" : icon(sel.value);
    }
    if (sel.type === "file" && sel.name && /__file$/.test(sel.name) && sel.files && sel.files[0] && /^image\//.test(sel.files[0].type)) {
      var cur = sel.parentNode.querySelector("[data-preview]");
      if (cur) cur.src = URL.createObjectURL(sel.files[0]);
    }
  });
  window.addEventListener("beforeunload", function (e) {
    if (document.querySelector(".busy")) { e.preventDefault(); e.returnValue = ""; }
  });

  /* boot */
  (function boot() {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORE) || "{}") || {}; } catch (e) {}
    var token = saved.token;
    try { token = token || sessionStorage.getItem(STORE); } catch (e) {}
    if (!saved.owner || !saved.repo || !token) { viewConnect(); return; }
    cfg = { owner: saved.owner, repo: saved.repo, token: token };
    gh("GET", repoPath("")).then(function (r) {
      cfg.branch = r.default_branch || "main";
      return start();
    }).catch(function (err) { cfg = null; viewConnect(err.message); });
  })();
})();
