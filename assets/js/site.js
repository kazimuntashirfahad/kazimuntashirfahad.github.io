/* Renders every page from the JSON files in /data.
   Content is edited through /admin/ and saved to GitHub; the site reads it here. */
(function () {
  "use strict";

  var PAGE = document.body.getAttribute("data-page");

  /* ------------------------------------------------------------ helpers */
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function safeUrl(u) {
    u = String(u || "").trim();
    if (!u) return "";
    if (/^(https?:\/\/|mailto:|#)/i.test(u)) return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return "";          // javascript:, data: …
    return u.replace(/^\/+/, "");                            // site-relative path
  }
  function lines(v) { return String(v || "").split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean); }
  function csv(v) { return (Array.isArray(v) ? v : String(v || "").split(",")).map(function (s) { return String(s).trim(); }).filter(Boolean); }
  function slugify(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item"; }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmtDate(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || "");
    return m ? MONTHS[+m[2] - 1] + " " + m[3] + ", " + m[1] : esc(d);
  }
  function color(c, dflt) { return /^#[0-9a-f]{3,8}$/i.test(c || "") ? c : dflt; }

  function icon(name, cls, sw, label) {
    var I = window.ICONS, c = cls ? ' class="' + cls + '"' : "";
    var a = label ? 'role="img" aria-label="' + esc(label) + '"' : 'aria-hidden="true"';
    if (I.filled[name]) return '<svg' + c + ' xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" ' + a + ">" + I.filled[name] + "</svg>";
    return '<svg' + c + ' xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="' + (sw || 1.5) + '" ' + a + ">" + (I.stroke[name] || I.stroke.sparkles) + "</svg>";
  }

  /* Small, safe Markdown subset (same rules as the admin help text). */
  function inline(t) {
    var codes = [];
    t = String(t).replace(/`([^`]+)`/g, function (_, c) { codes.push("<code>" + esc(c) + "</code>"); return "\u0001" + (codes.length - 1) + "\u0001"; });
    t = esc(t);
    t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, txt, href) {
      var h = safeUrl(href.replace(/&amp;/g, "&"));
      if (!h) return txt;
      var ext = /^https?:/i.test(h) ? ' target="_blank" rel="noopener"' : "";
      return '<a href="' + esc(h) + '"' + ext + ' style="color:var(--accent);text-decoration:underline">' + txt + "</a>";
    });
    t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?![*\w])/g, "$1<em>$2</em>");
    return t.replace(/\u0001(\d+)\u0001/g, function (_, i) { return codes[+i]; });
  }
  function markdown(src) {
    var L = String(src || "").replace(/\r\n?/g, "\n").split("\n"), out = [], para = [], list = null;
    function fp() { if (para.length) { out.push("<p>" + inline(para.join(" ")) + "</p>"); para = []; } }
    function fl() { if (list) { out.push("<" + list.tag + ">" + list.items.join("") + "</" + list.tag + ">"); list = null; } }
    for (var i = 0; i < L.length; i++) {
      var line = L[i], t = line.trim(), m;
      if (/^```/.test(line)) {
        fp(); fl(); var code = [];
        for (i++; i < L.length && !/^```/.test(L[i]); i++) code.push(L[i]);
        out.push("<pre><code>" + esc(code.join("\n")) + "</code></pre>"); continue;
      }
      if (!t) { fp(); fl(); continue; }
      if ((m = /^(#{2,4})\s+(.*)$/.exec(t))) { fp(); fl(); out.push("<h" + m[1].length + ">" + inline(m[2]) + "</h" + m[1].length + ">"); }
      else if ((m = /^\$\$(.*)\$\$$/.exec(t))) { fp(); fl(); out.push('<div class="math">' + esc(m[1].trim()) + "</div>"); }
      else if ((m = /^>\s?(.*)$/.exec(t))) { fp(); fl(); out.push("<blockquote>" + inline(m[1]) + "</blockquote>"); }
      else if ((m = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(t))) {
        fp(); fl(); var s = safeUrl(m[2]);
        if (s) out.push('<figure style="margin:32px 0"><img src="' + esc(s) + '" alt="' + esc(m[1]) + '" loading="lazy" style="border-radius:8px;border:1px solid var(--border)"></figure>');
      }
      else if ((m = /^([-*]|\d+\.)\s+(.*)$/.exec(t))) {
        fp(); var tag = /\d/.test(m[1][0]) ? "ol" : "ul";
        if (!list || list.tag !== tag) { fl(); list = { tag: tag, items: [] }; }
        list.items.push("<li>" + inline(m[2]) + "</li>");
      }
      else if (/^(---|\*\*\*)$/.test(t)) { fp(); fl(); out.push('<hr class="rule" style="margin:40px 0">'); }
      else { fl(); para.push(t); }
    }
    fp(); fl();
    return out.join("\n");
  }
  function authors(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); }

  /* -------------------------------------------------------------- data */
  var DATA = {};
  function load(names) {
    return Promise.all(names.map(function (n) {
      return fetch("data/" + n + ".json", { cache: "no-cache" })
        .then(function (r) { return r.ok ? r.json() : (n === "settings" ? {} : []); })
        .catch(function () { return n === "settings" ? {} : []; })
        .then(function (j) { DATA[n] = j; });
    }));
  }
  function S(k) { return (DATA.settings && DATA.settings[k] != null) ? String(DATA.settings[k]) : ""; }

  /* -------------------------------------------------------- components */
  function sectionHead(eyebrow, title, link, label, id) {
    return '<div class="section-head"><div><span class="eyebrow">' + esc(eyebrow) + '</span><h2 class="display h2"' + (id ? ' id="' + id + '"' : "") + ">" + esc(title) + "</h2></div>" +
      (link ? '<a class="link-arrow" href="' + esc(link) + '">' + esc(label) + " " + icon("arrow-up-right", "", 1.8) + "</a>" : "") + "</div>";
  }
  function stats(raw, cols) {
    var items = lines(raw); if (!items.length) return "";
    var h = items.map(function (l) {
      var p = l.split("|"), v = esc((p[0] || "").trim()).replace(/\+$/, "<em>+</em>");
      return '<div class="stat"><strong>' + v + "</strong><span>" + esc((p[1] || "").trim()) + "</span></div>";
    }).join("");
    return '<div class="stats"' + (cols && cols !== 4 ? ' style="grid-template-columns:repeat(' + cols + ',1fr)"' : "") + ">" + h + "</div>";
  }
  function pageHero(crumb, eyebrow, title, leadHtml, extra) {
    return '<section class="page-hero"><div class="container"><nav class="breadcrumb" aria-label="Breadcrumb"><a href="index.html">Home</a><span>/</span><span aria-current="page">' + esc(crumb) + "</span></nav>" +
      '<span class="eyebrow">' + esc(eyebrow) + '</span><h1 class="display h1">' + esc(title) + '<span class="dot">.</span></h1><p class="lead">' + leadHtml + "</p>" + (extra || "") + "</div></section>";
  }
  function chips(opts) {
    var h = '<button class="chip active" type="button" data-filter="all" aria-pressed="true">All</button>';
    Object.keys(opts).forEach(function (k) { h += '<button class="chip" type="button" data-filter="' + esc(k) + '" aria-pressed="false">' + esc(opts[k]) + "</button>"; });
    return h;
  }
  function focusCard(f) {
    return '<article class="card focus-card reveal">' + icon(f.icon || "scan", "icon", 1.3) + "<h3>" + esc(f.title) + "</h3><p>" + esc(f.short) + '</p><a class="mini-link" href="research.html#' + esc(f.id) + '">Explore ' + icon("arrow-up-right", "", 1.8) + "</a></article>";
  }
  function venue(p) { return '<span class="venue" style="background:' + color(p.venue_color, "#374151") + '">' + esc(p.venue) + "<small>" + esc(p.year) + "</small></span>"; }
  function paperHref(p) { return p.pdf ? safeUrl(p.pdf) : safeUrl(p.paper_url); }
  function pubCard(p) {
    var paper = paperHref(p), code = safeUrl(p.code_url);
    return '<article class="card pub-card reveal">' + venue(p) + "<h3>" + esc(p.title) + '</h3><p class="authors">' + authors(p.authors) + '</p><p class="abstract">' + esc(p.abstract) + '</p><div class="card-foot">' +
      (paper ? '<a class="mini-link" href="' + esc(paper) + '" target="_blank" rel="noopener">Paper ' + icon("external", "", 1.6) + "</a>" : "<span></span>") +
      (code ? '<a class="mini-link" href="' + esc(code) + '" target="_blank" rel="noopener">Code ' + icon("github") + "</a>" : "") + "</div></article>";
  }
  function projectLogo(p) {
    var c = color(p.color, "#c6f31c");
    if (p.logo_image) return '<img class="logo" src="' + esc(safeUrl(p.logo_image)) + '" alt="" style="border-radius:6px;object-fit:cover">';
    if (p.logo_icon === "letter") return '<span class="logo" style="display:grid;place-items:center;background:' + c + ';border-radius:4px;color:#fff;font-weight:800;font-size:20px">' + esc((p.logo_letter || p.name || "?").charAt(0).toUpperCase()) + "</span>";
    return '<span class="logo" style="color:' + c + ';display:block">' + icon(p.logo_icon || "code", "", 1.6) + "</span>";
  }
  function projectCard(p, showTags) {
    var tags = csv(p.categories).map(slugify).join(" "), tech = csv(p.tech), gh = safeUrl(p.github_url);
    return '<article class="card project-card reveal" data-tags="' + esc(tags) + '">' + projectLogo(p) + "<h3>" + esc(p.name) + "</h3><p>" + esc(p.description) + "</p>" +
      (showTags && tech.length ? '<ul class="tags">' + tech.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" : "") +
      '<div class="card-foot">' + (gh ? '<a class="mini-link" href="' + esc(gh) + '" target="_blank" rel="noopener">GitHub ' + icon("external", "", 1.6) + "</a>" : "<span></span>") +
      (p.stars ? '<span class="stars">' + icon("star", "", 1.6) + " " + esc(p.stars) + "</span>" : "") + "</div></article>";
  }
  function cover(p) {
    if (p.cover_image) return '<div style="background:url(\'' + esc(safeUrl(p.cover_image)) + '\') center/cover no-repeat"></div>';
    return '<div class="' + (/^art-[a-z]+$/.test(p.cover_style || "") ? p.cover_style : "art-violet") + '"></div>';
  }
  function postUrl(p) { return "post.html?slug=" + encodeURIComponent(p.slug); }
  function postCard(p, showCat) {
    var h = postUrl(p);
    return '<article class="card post-card reveal" id="' + esc(p.slug) + '" data-tags="' + esc(slugify(p.category)) + '"><a class="thumb" href="' + h + '" aria-hidden="true" tabindex="-1">' + cover(p) + '</a><div class="body"><div class="post-meta">' +
      (showCat ? '<span class="cat">' + esc(p.category) + "</span>" : "") + "<span>" + fmtDate(p.date) + "</span>" + (showCat && p.read_time ? "<span>" + esc(p.read_time) + " read</span>" : "") +
      '</div><h3><a href="' + h + '">' + esc(p.title) + "</a></h3><p>" + esc(p.excerpt) + '</p><a class="mini-link" href="' + h + '">Read more ' + icon("arrow-up-right", "", 1.8) + "</a></div></article>";
  }
  function posts() {
    return (DATA.posts || []).filter(function (p) { return p.published; }).sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
  }
  var PIPELINE = [["database", "c-white", "1. Data Collection", "Collect raw data from multiple sources"], ["gear", "c-white", "2. Data Processing", "Clean, transform, and prepare the data"],
    ["brain", "c-lime", "3. Model Training", "Train models using optimized algorithms"], ["bars", "c-teal", "4. Evaluation", "Evaluate performance and generalize"], ["upload-cloud", "c-violet", "5. Deployment", "Deploy to production and monitor"]];
  function pipeline() {
    return '<div class="pipeline">' + PIPELINE.map(function (s) { return '<div class="step reveal">' + icon(s[0], "icon " + s[1], 1.3) + "<h3>" + s[2] + "</h3><p>" + s[3] + "</p></div>"; }).join("") + "</div>" +
      '<div class="loop" aria-hidden="true"><svg viewBox="0 0 1000 46" preserveAspectRatio="none" fill="none" stroke="#a1a5ab" stroke-width="1.3"><path d="M750 2v34H0V6" stroke-dasharray="4 5" vector-effect="non-scaling-stroke"/></svg><svg style="position:absolute;left:-6px;top:-4px;width:12px;height:10px" viewBox="0 0 12 10" fill="none" stroke="#a1a5ab" stroke-width="1.3"><path d="M1 8l5-6 5 6"/></svg></div>';
  }
  function timeline(items, orgKey) {
    return '<ol class="timeline">' + (items || []).map(function (it) { return '<li><span class="when">' + esc(it.when) + "</span><h3>" + esc(it.title) + '</h3><div class="where">' + esc(it[orgKey || "org"]) + "</div><p>" + esc(it.description) + "</p></li>"; }).join("") + "</ol>";
  }
  function yearList(items) {
    return '<ul class="award-list">' + (items || []).map(function (it) { return '<li class="reveal"><span class="yr">' + esc(it.year) + "</span><div><b>" + esc(it.title) + "</b><span>" + esc(it.detail) + "</span></div></li>"; }).join("") + "</ul>";
  }
  function socials() {
    var out = [];
    [["github", "GitHub"], ["linkedin", "LinkedIn"], ["x", "X (Twitter)"]].forEach(function (s) { var u = safeUrl(S(s[0])); if (u) out.push([s[0], s[1], u]); });
    return out;
  }

  /* ------------------------------------------------------------- pages */
  var PAGES = {
    home: function () {
      var titleLines = lines(S("hero_title")).map(esc).join("<br>"), cv = safeUrl(S("cv")), interests = csv(S("interests"));
      var pubs = (DATA.publications || []).filter(function (p) { return p.featured; }).slice(0, 3);
      var projs = (DATA.projects || []).filter(function (p) { return p.featured; }).slice(0, 4);
      var ps = posts().slice(0, 3);
      return '<section class="hero" aria-labelledby="hero-title"><div class="hero-media"><img src="' + esc(safeUrl(S("portrait"))) + '" alt="Portrait of ' + esc(S("site_name")) + '" width="760" height="770" fetchpriority="high"></div>' +
        '<div class="container"><div class="hero-copy"><span class="eyebrow">' + esc(S("hero_eyebrow")) + '</span><h1 class="display h1" id="hero-title">' + titleLines + '<span class="dot">.</span></h1><p class="lead">' + esc(S("hero_lead")) + "</p>" +
        '<div class="hero-actions"><a class="btn btn-primary" href="projects.html">View my work ' + icon("arrow-up-right", "", 2) + "</a>" + (cv ? '<a class="btn btn-outline" href="' + esc(cv) + '" download>Download CV ' + icon("download", "", 1.8) + "</a>" : "") + "</div>" +
        (interests.length ? '<div class="interests"><span class="label">Research interests</span><ul>' + interests.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul></div>" : "") +
        '</div></div><a class="scroll-cue" href="#focus">Scroll to explore</a></section><div class="container"><hr class="rule"></div>' +
        '<section class="section" id="focus"><div class="container">' + sectionHead("Research focus", "Areas of focus", "research.html", "View all research") + '<div class="grid grid-5">' + (DATA.focus || []).map(focusCard).join("") + "</div></div></section>" +
        (pubs.length ? '<section class="section"><div class="container">' + sectionHead("Research contributions", "Featured publications", "publications.html", "View all publications") + '<div class="grid grid-3">' + pubs.map(pubCard).join("") + "</div></div></section>" : "") +
        (projs.length ? '<section class="section"><div class="container">' + sectionHead("Open source impact", "Selected projects", "projects.html", "View all projects") + '<div class="grid grid-4">' + projs.map(function (p) { return projectCard(p); }).join("") + "</div></div></section>" : "") +
        '<section class="section"><div class="container">' + sectionHead("From data to deployment", "ML pipeline & workflow", "research.html#workflow", "View diagrams") + pipeline() + "</div></section>" +
        (ps.length ? '<section class="section"><div class="container">' + sectionHead("Sharing knowledge", "Latest from the blog", "blog.html", "View all posts") + '<div class="grid grid-3">' + ps.map(function (p) { return postCard(p); }).join("") + "</div></div></section>" : "");
    },

    research: function () {
      var pubs = DATA.publications || [];
      var areas = (DATA.focus || []).map(function (f, i) {
        var rel = pubs.filter(function (p) { return (p.topics || []).indexOf(f.id) !== -1; }).slice(0, 4), qs = lines(f.questions);
        return '<article class="area reveal" id="' + esc(f.id) + '"><div class="area-num">' + ("0" + (i + 1)).slice(-2) + "</div><div>" + icon(f.icon || "scan", "icon", 1.3) + '<h2 class="display h3">' + esc(f.title) + "</h2><p>" + esc(f.detail || f.short) + "</p></div><div>" +
          (qs.length ? '<h4 class="label">Open questions</h4><ul class="check-list">' + qs.map(function (q) { return "<li>" + esc(q) + "</li>"; }).join("") + "</ul>" : "") +
          (rel.length ? '<h4 class="label">Related work</h4><div class="related">' + rel.map(function (p) { return '<a href="publications.html#' + esc(p.id) + '">' + esc(p.title) + " <span>" + esc(p.venue + " " + p.year) + "</span></a>"; }).join("") + "</div>" : "") + "</div></article>";
      }).join("");
      return pageHero("Research", "Research focus", "Research", esc(S("research_intro")), stats(S("research_stats"))) +
        '<section class="section"><div class="container">' + areas + "</div></section>" +
        '<section class="section" id="workflow"><div class="container">' + sectionHead("From data to deployment", "How I work") + pipeline() + "</div></section>" +
        '<section class="section"><div class="container two-col"><div>' + sectionHead("Ongoing", "Current projects") + timeline(DATA.research_projects, "role") + "</div><div>" + sectionHead("Together", "Collaborations") +
        '<div class="grid grid-2">' + (DATA.collaborations || []).map(function (c) { return '<div class="card collab reveal" style="padding:22px">' + icon("users", "", 1.4) + '<p style="margin:14px 0 0;font-weight:600">' + esc(c.name) + "</p></div>"; }).join("") + "</div>" +
        '<p class="muted" style="margin-top:24px">Interested in collaborating on one of these directions? <a href="contact.html" style="color:var(--accent)">Get in touch</a>.</p></div></div></section>';
    },

    publications: function () {
      var pubs = (DATA.publications || []).slice().sort(function (a, b) { return String(b.year).localeCompare(String(a.year)); });
      var years = [], by = {};
      pubs.forEach(function (p) { if (!by[p.year]) { by[p.year] = []; years.push(p.year); } by[p.year].push(p); });
      var opts = { conference: "Conference", journal: "Journal", workshop: "Workshop", preprint: "Preprint" };
      (DATA.focus || []).forEach(function (f) { opts[f.id] = f.title; });
      var scholar = safeUrl(S("scholar"));
      var lead = esc(S("publications_intro")) + (scholar ? ' Full list also on <a href="' + esc(scholar) + '" target="_blank" rel="noopener" style="color:var(--accent)">Google Scholar</a>.' : "");
      function bib(p) {
        var kind = { journal: "article", preprint: "misc" }[p.type] || "inproceedings", field = kind === "article" ? "journal" : kind === "misc" ? "howpublished" : "booktitle";
        return "@" + kind + "{" + p.id + ",\n  title     = {" + p.title + "},\n  author    = {" + String(p.authors || "").replace(/\*\*/g, "").split(", ").join(" and ") + "},\n  " + (field + "         ").slice(0, 9) + " = {" + String(p.full_venue || p.venue).split(",")[0] + "},\n  year      = {" + p.year + "}\n}";
      }
      var groups = years.map(function (y) {
        return '<div class="year-group" data-group><h2 class="display h2">' + esc(y) + '</h2><div class="pub-list">' + by[y].map(function (p) {
          var paper = paperHref(p), code = safeUrl(p.code_url), slides = safeUrl(p.slides_url), id = esc(p.id);
          return '<article class="card pub-row reveal" id="' + id + '" data-tags="' + esc(((p.type || "") + " " + (p.topics || []).join(" ")).trim()) + '">' + venue(p) + "<div>" +
            (p.award ? '<div class="award">' + icon("award", "", 1.8) + " " + esc(p.award) + "</div><br>" : "") + "<h3>" + esc(p.title) + '</h3><p class="authors">' + authors(p.authors) + "</p>" +
            (p.full_venue ? '<p class="venue-full">' + esc(p.full_venue) + "</p>" : "") + '<p class="abstract">' + esc(p.abstract) + '</p><div class="pub-links">' +
            (paper ? '<a class="mini-link" href="' + esc(paper) + '" target="_blank" rel="noopener">Paper ' + icon("external", "", 1.6) + "</a>" : "") +
            (code ? '<a class="mini-link" href="' + esc(code) + '" target="_blank" rel="noopener">Code ' + icon("github") + "</a>" : "") +
            (slides ? '<a class="mini-link" href="' + esc(slides) + '" target="_blank" rel="noopener">Slides ' + icon("file", "", 1.6) + "</a>" : "") +
            '<button class="mini-link" type="button" data-bibtex="bib-' + id + '" aria-expanded="false"><span>BibTeX</span> ' + icon("quote", "", 1.6) + '</button></div><pre class="bibtex" id="bib-' + id + '">' + esc(bib(p)) + "</pre></div></article>";
        }).join("") + "</div></div>";
      }).join("");
      return pageHero("Publications", "Research contributions", "Publications", lead, stats(S("publications_stats"))) +
        '<section class="section"><div class="container"><div class="toolbar"><div class="filters" data-filter-target="#pub-groups" data-search="#pub-search" data-empty="#pub-empty" role="group" aria-label="Filter publications">' + chips(opts) + "</div>" +
        '<label class="search">' + icon("search", "", 1.8) + '<span class="sr-only">Search publications</span><input id="pub-search" type="search" placeholder="Search title, author, venue"></label></div>' +
        '<div id="pub-groups">' + groups + '</div><p id="pub-empty" class="muted is-hidden" style="padding:40px 0">No publications match that filter.</p></div></section>';
    },

    projects: function () {
      var projs = DATA.projects || [], cats = {}, spot = null;
      projs.forEach(function (p) { csv(p.categories).forEach(function (c) { cats[slugify(c)] = c.replace(/\b\w/g, function (x) { return x.toUpperCase(); }); }); if (!spot && p.spotlight) spot = p; });
      var spotHtml = "";
      if (spot) {
        var gh = safeUrl(spot.github_url), docs = safeUrl(spot.docs_url), tech = csv(spot.tech);
        spotHtml = '<article class="card featured-post reveal" style="margin-bottom:56px"><div class="thumb"><div class="art-violet"></div><div style="position:absolute;inset:0;display:grid;place-items:center"><div style="transform:scale(2.6)">' + projectLogo(spot) + "</div></div></div>" +
          '<div class="body"><div class="post-meta"><span class="cat">Featured project</span><span>' + esc(tech.slice(0, 2).join(" · ")) + "</span></div><h2>" + esc(spot.name) + "</h2><p>" + esc(spot.description) + " " + esc(spot.spotlight_text) + "</p>" +
          (tech.length ? '<ul class="tags">' + tech.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" : "") + '<div style="display:flex;gap:14px;flex-wrap:wrap">' +
          (gh ? '<a class="btn btn-primary" href="' + esc(gh) + '" target="_blank" rel="noopener">View on GitHub ' + icon("github") + "</a>" : "") +
          (docs ? '<a class="btn btn-outline" href="' + esc(docs) + '" target="_blank" rel="noopener">Documentation ' + icon("book", "", 1.6) + "</a>" : "") + "</div></div></article>";
      }
      return pageHero("Projects", "Open source impact", "Projects", esc(S("projects_intro")), stats(S("projects_stats"))) +
        '<section class="section"><div class="container">' + spotHtml + '<div class="toolbar"><div class="filters" data-filter-target="#project-grid" role="group" aria-label="Filter projects">' + chips(cats) + "</div></div>" +
        '<div class="grid grid-4" id="project-grid">' + projs.map(function (p) { return projectCard(p, true); }).join("") + "</div></div></section>";
    },

    blog: function () {
      var ps = posts(), feat = null, cats = {};
      ps.forEach(function (p) { if (!feat && p.featured) feat = p; if (p.category) cats[slugify(p.category)] = p.category; });
      var fh = "";
      if (feat) {
        var h = postUrl(feat);
        fh = '<article class="card featured-post reveal" style="margin-bottom:56px"><a class="thumb" href="' + h + '" aria-hidden="true" tabindex="-1">' + cover(feat) + '</a><div class="body"><div class="post-meta"><span class="cat">Featured · ' + esc(feat.category) + "</span><span>" + fmtDate(feat.date) + "</span>" +
          (feat.read_time ? "<span>" + esc(feat.read_time) + " read</span>" : "") + '</div><h2><a href="' + h + '">' + esc(feat.title) + "</a></h2><p>" + esc(feat.excerpt) + '</p><a class="link-arrow" href="' + h + '">Read article ' + icon("arrow-up-right", "", 1.8) + "</a></div></article>";
      }
      return pageHero("Blog", "Sharing knowledge", "Blog", esc(S("blog_intro"))) + '<section class="section"><div class="container">' + fh +
        '<div class="toolbar"><div class="filters" data-filter-target="#post-grid" data-search="#post-search" data-empty="#post-empty" role="group" aria-label="Filter posts">' + chips(cats) + "</div>" +
        '<label class="search">' + icon("search", "", 1.8) + '<span class="sr-only">Search posts</span><input id="post-search" type="search" placeholder="Search posts"></label></div>' +
        '<div class="grid grid-3" id="post-grid">' + ps.map(function (p) { return postCard(p, true); }).join("") + '</div><p id="post-empty" class="muted' + (ps.length ? " is-hidden" : "") + '" style="padding:40px 0">No posts yet.</p></div></section>';
    },

    post: function () {
      var slug = new URLSearchParams(location.search).get("slug"), ps = posts(), p = null;
      ps.forEach(function (x) { if (x.slug === slug) p = x; });
      if (!p) return PAGES.notfound();
      document.title = p.title + " — " + S("site_name");
      var others = ps.filter(function (x) { return x.slug !== slug; }).slice(0, 3);
      return '<section class="page-hero" style="padding-bottom:48px;border-bottom:0"><div class="container"><div class="article"><nav class="breadcrumb" aria-label="Breadcrumb"><a href="index.html">Home</a><span>/</span><a href="blog.html">Blog</a><span>/</span><span aria-current="page">' + esc(p.category) + "</span></nav>" +
        '<div class="post-meta"><span class="cat">' + esc(p.category) + "</span><span>" + fmtDate(p.date) + "</span>" + (p.read_time ? "<span>" + esc(p.read_time) + " read</span>" : "") + '</div><h1 class="display h2">' + esc(p.title) + '</h1><p class="lead" style="margin-top:18px">' + esc(p.excerpt) + "</p></div></div></section>" +
        '<section><div class="container"><div class="article"><div class="article-cover">' + cover(p) + "</div>" + markdown(p.body) +
        '<div class="author-box"><img src="' + esc(safeUrl(S("portrait"))) + '" alt="" width="64" height="64"><div><b>' + esc(S("site_name")) + "</b><span>" + esc(S("hero_eyebrow")) + "</span></div></div>" +
        '<p style="margin-top:40px"><a class="link-arrow" href="blog.html">' + icon("arrow-left", "", 1.8) + " Back to all posts</a></p></div></div></section>" +
        (others.length ? '<section class="section"><div class="container">' + sectionHead("Keep reading", "More articles", "blog.html", "View all posts") + '<div class="grid grid-3">' + others.map(function (x) { return postCard(x, true); }).join("") + "</div></div></section>" : "");
    },

    about: function () {
      var cv = safeUrl(S("cv"));
      return pageHero("About", "Get to know me", "About me", esc(S("about_intro"))) +
        '<section class="section"><div class="container about-grid"><figure class="portrait-frame reveal" style="margin:0"><img src="' + esc(safeUrl(S("portrait"))) + '" alt="Portrait of ' + esc(S("site_name")) + '" width="760" height="770">' +
        (S("about_status") ? '<figcaption><span class="status-dot">' + esc(S("about_status")) + "</span></figcaption>" : "") + '</figure><div class="reveal"><span class="eyebrow">' + esc(S("about_eyebrow")) + '</span><h2 class="display h2" style="margin-bottom:24px">' + esc(S("about_heading")) + "</h2>" +
        '<div class="prose">' + markdown(S("about_bio")) + '</div><div class="hero-actions" style="margin-top:32px">' + (cv ? '<a class="btn btn-primary" href="' + esc(cv) + '" download>Download CV ' + icon("download", "", 1.8) + "</a>" : "") +
        '<a class="btn btn-outline" href="contact.html">Get in touch ' + icon("arrow-up-right", "", 1.8) + "</a></div>" + stats(S("about_stats"), 3) + "</div></div></section>" +
        '<section class="section"><div class="container two-col"><div>' + sectionHead("Academic background", "Education") + timeline(DATA.education) + "</div><div>" + sectionHead("Industry & research", "Experience") + timeline(DATA.experience) + "</div></div></section>" +
        '<section class="section"><div class="container">' + sectionHead("Toolbox", "Skills & tools") + '<div class="skills">' + (DATA.skills || []).map(function (s) { return '<div class="card reveal"><h3>' + esc(s.group) + '</h3><ul class="tags">' + csv(s.items).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>"; }).join("") + "</div></div></section>" +
        '<section class="section"><div class="container two-col"><div>' + sectionHead("Recognition", "Awards & honors") + yearList(DATA.awards) + "</div><div>" + sectionHead("Community", "Talks & service") + yearList(DATA.talks) + "</div></div></section>";
    },

    contact: function () {
      var email = S("email"), topics = csv(S("contact_topics")), links = socials(), sch = safeUrl(S("scholar"));
      if (sch) links.push(["scholar", "Google Scholar", sch]);
      var fid = S("formspree_id").replace(/[^A-Za-z0-9]/g, "");
      return pageHero("Contact", "Let’s connect", "Get in touch", esc(S("contact_intro"))) +
        '<section class="section"><div class="container contact-grid"><div class="contact-cards"><div class="card contact-card reveal">' + icon("mail", "icon", 1.4) + '<div><small>Email</small><a href="mailto:' + esc(email) + '">' + esc(email) + "</a></div></div>" +
        (S("location") ? '<div class="card contact-card reveal">' + icon("map-pin", "icon", 1.4) + "<div><small>Based in</small><span>" + esc(S("location")) + "</span></div></div>" : "") +
        (S("response_time") ? '<div class="card contact-card reveal">' + icon("clock", "icon", 1.4) + "<div><small>Response time</small><span>" + esc(S("response_time")) + "</span></div></div>" : "") +
        (links.length ? '<div class="card reveal"><small class="label muted" style="display:block;margin-bottom:16px">Find me online</small><div class="related">' + links.map(function (l) { return '<a href="' + esc(l[2]) + '" target="_blank" rel="noopener">' + esc(l[1]) + " <span>" + icon(l[0], "", 1.6).replace("<svg", '<svg width="16" height="16"') + "</span></a>"; }).join("") + "</div></div>" : "") +
        '</div><div class="card reveal" style="padding:clamp(24px,4vw,40px)"><h2 class="display h3" style="margin-bottom:24px">Send a message</h2>' +
        '<form class="form" id="contact-form" action="' + (fid ? "https://formspree.io/f/" + fid : "") + '" method="post" data-mailto="' + esc(email) + '" novalidate>' +
        (topics.length ? '<div class="field"><label>What’s it about?</label><div class="topic-chips">' + topics.map(function (t, i) { return '<label><input type="radio" name="topic" value="' + esc(t) + '"' + (i ? "" : " checked") + '><span class="chip">' + esc(t) + "</span></label>"; }).join("") + "</div></div>" : "") +
        '<div class="form-row"><div class="field"><label for="f-name">Name</label><input class="input" id="f-name" name="name" autocomplete="name" placeholder="Your name" required maxlength="120"></div><div class="field"><label for="f-email">Email</label><input class="input" id="f-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required maxlength="200"></div></div>' +
        '<div class="field"><label for="f-subject">Subject</label><input class="input" id="f-subject" name="subject" placeholder="What would you like to discuss?" maxlength="160"></div><div class="field"><label for="f-message">Message</label><textarea class="textarea" id="f-message" name="message" placeholder="Tell me a bit about your idea or opportunity…" required maxlength="5000"></textarea></div>' +
        '<input class="hp" type="text" name="_gotcha" tabindex="-1" autocomplete="off" aria-hidden="true"><div class="form-status" role="status" aria-live="polite"></div><div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap"><p class="form-note">Your details are only used to reply to you.</p><button class="btn btn-primary" type="submit">Send message ' + icon("send", "", 1.8) + "</button></div></form></div></div></section>" +
        ((DATA.faqs || []).length ? '<section class="section"><div class="container two-col"><div>' + sectionHead("Before you write", "FAQ") + '</div><div class="faq">' + DATA.faqs.map(function (f) { return "<details><summary>" + esc(f.question) + "</summary><p>" + esc(f.answer) + "</p></details>"; }).join("") + "</div></div></section>" : "");
    },

    notfound: function () {
      return pageHero("404", "Error 404", "Page not found", "The page you’re looking for doesn’t exist or has moved.", '<div class="hero-actions" style="margin-top:32px"><a class="btn btn-primary" href="index.html">Back home ' + icon("arrow-right", "", 2) + "</a></div>");
    }
  };

  var NEEDS = {
    home: ["focus", "publications", "projects", "posts"], research: ["focus", "publications", "research_projects", "collaborations"],
    publications: ["focus", "publications"], projects: ["projects"], blog: ["posts"], post: ["posts"],
    about: ["education", "experience", "skills", "awards", "talks"], contact: ["faqs"], notfound: []
  };

  function cta() {
    var email = S("email"), cv = safeUrl(S("cv"));
    return '<section class="cta"><div class="container cta-grid"><div class="reveal"><span class="eyebrow">' + esc(S("cta_eyebrow")) + '</span><h2 class="display h2">' + esc(S("cta_title")) + "</h2><p>" + esc(S("cta_text")) + "</p></div>" +
      '<div class="reveal"><div class="mail-block">' + icon("mail", "icon", 1.4) + '<div><small>Send me an email</small><a href="mailto:' + esc(email) + '">' + esc(email) + " " + icon("arrow-right", "", 1.8) + "</a></div></div>" +
      (cv ? '<a class="btn btn-outline" href="' + esc(cv) + '" download>Download CV ' + icon("download", "", 1.8) + "</a>" : "") + "</div></div></section>";
  }
  function footer() {
    return '<footer class="site-footer"><div class="container footer-bar"><p style="margin:0">&copy; ' + new Date().getFullYear() + " " + esc(S("site_name")) + '. All rights reserved.</p><div class="socials">' +
      socials().map(function (s) { return '<a href="' + esc(s[2]) + '" target="_blank" rel="noopener">' + icon(s[0], "", 1.5, s[1]) + "</a>"; }).join("") + "</div></div></footer>";
  }

  load(["settings"].concat(NEEDS[PAGE] || [])).then(function () {
    var name = S("site_name") || "Portfolio";
    document.querySelectorAll("[data-site-name]").forEach(function (el) { el.textContent = name; });
    var t = document.body.getAttribute("data-title");
    if (PAGE !== "post") document.title = t ? t + " — " + name : name + " — " + S("hero_eyebrow");
    var d = document.querySelector('meta[name="description"]');
    if (d && S("meta_description")) d.setAttribute("content", S("meta_description"));
    document.getElementById("main").innerHTML = (PAGES[PAGE] || PAGES.notfound)();
    document.getElementById("after-main").innerHTML = (PAGE === "contact" || PAGE === "notfound" ? "" : cta()) + footer();
    var s = document.createElement("script");
    s.src = "assets/js/main.js?v=3";
    document.body.appendChild(s);
  });
})();
