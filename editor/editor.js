(() => {
  const page = document.body.dataset.page || "";

  let content = {
    events: { events: [] },
    equipment: { features: [], gallery: { images: [] } },
    sponsors: { stats: [], sponsors: { items: [] }, why: { points: [] } },
    pages: {},
  };
  let dirty = false;
  let saveTimer = null;
  let current = null;
  let savedSnapshot = null;

  document.body.classList.add("amgt-editor-on");

  const bar = document.createElement("div");
  bar.className = "amgt-bar";
  bar.innerHTML = `
    <div class="amgt-bar-brand">
      <span class="amgt-bar-mark">AMGT</span>
      <strong>Website Editor</strong>
    </div>
    <span class="amgt-bar-hint" id="amgt-hint">Click a highlighted block to edit it</span>
    <div class="amgt-bar-actions" id="amgt-page-actions"></div>
    <span class="amgt-bar-status" id="amgt-status">Loading…</span>
    <button type="button" class="amgt-btn-ghost" id="amgt-revert" disabled>Revert</button>
    <button type="button" class="amgt-btn" id="amgt-save">Save</button>
    <button type="button" class="amgt-btn" id="amgt-deploy">Deploy</button>
  `;
  document.body.prepend(bar);

  const drawer = document.createElement("aside");
  drawer.className = "amgt-drawer";
  drawer.innerHTML = `<div class="amgt-drawer-inner" id="amgt-drawer-inner"></div>`;
  document.body.appendChild(drawer);

  const statusEl = document.getElementById("amgt-status");
  const hintEl = document.getElementById("amgt-hint");
  const actionsEl = document.getElementById("amgt-page-actions");
  const drawerInner = document.getElementById("amgt-drawer-inner");

  function setStatus(message) {
    statusEl.textContent = message;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function eventsList() {
    return content.events.events || (content.events.events = []);
  }

  function featuresList() {
    const equipment = content.equipment;
    return equipment.features || (equipment.features = []);
  }

  function galleryList() {
    const gallery = content.equipment.gallery || (content.equipment.gallery = { images: [] });
    return gallery.images || (gallery.images = []);
  }

  function statsList() {
    return content.sponsors.stats || (content.sponsors.stats = []);
  }

  function sponsorItems() {
    const section = content.sponsors.sponsors || (content.sponsors.sponsors = { items: [] });
    return section.items || (section.items = []);
  }

  function pagesRoot() {
    return content.pages || (content.pages = {});
  }

  function ensure(obj, key, fallback) {
    if (obj[key] == null) obj[key] = fallback;
    return obj[key];
  }

  const COPY_BLOCKS = {
    "home-hero": ["home", "hero"],
    "home-welcome": ["home", "welcome"],
    "home-events-head": ["home", "events"],
    "events-hero": ["events", "hero"],
    "equipment-page-hero": ["equipment", "hero"],
    "about-hero": ["about", "hero"],
    "about-mission": ["about", "mission"],
    "about-team-head": ["about", "team_head"],
    "contact-hero": ["contact", "hero"],
    "contact-intro": ["contact", "intro"],
    "contact-sponsors-head": ["contact", "sponsors_head"],
    "contact-note": ["contact", "note"],
  };

  const COPY_FIELDS = {
    "home-hero": [
      ["Eyebrow", "eyebrow"],
      ["Title", "heading"],
      ["Highlighted word", "highlight"],
      ["Description", "lead", "textarea"],
      ["First button", "primary_cta"],
      ["Second button", "secondary_cta"],
    ],
    "home-welcome": [
      ["Eyebrow", "eyebrow"],
      ["Title", "heading"],
      ["Description", "description", "textarea"],
      ["Button", "cta"],
    ],
    "home-events-head": [
      ["Eyebrow", "eyebrow"],
      ["Title", "heading"],
      ["Description", "lead", "textarea"],
      ["Button", "cta"],
    ],
    "events-hero": [
      ["Eyebrow", "eyebrow"],
      ["Title", "heading"],
      ["Description", "lead", "textarea"],
    ],
    "equipment-page-hero": [
      ["Eyebrow", "eyebrow"],
      ["Title", "heading"],
      ["Description", "lead", "textarea"],
    ],
    "about-hero": [
      ["Eyebrow", "eyebrow"],
      ["Title", "heading"],
      ["Description", "lead", "textarea"],
    ],
    "about-mission": [
      ["Eyebrow", "eyebrow"],
      ["Title", "heading"],
      ["First paragraph", "description", "textarea"],
      ["Second paragraph", "description2", "textarea"],
      ["Bullet points (one per line)", "points", "textarea"],
    ],
    "about-team-head": [
      ["Eyebrow", "eyebrow"],
      ["Title", "heading"],
      ["Description", "lead", "textarea"],
    ],
    "contact-hero": [
      ["Eyebrow", "eyebrow"],
      ["Title", "heading"],
      ["Description", "lead", "textarea"],
    ],
    "contact-intro": [
      ["Eyebrow", "eyebrow"],
      ["Title", "heading"],
      ["Description", "description", "textarea"],
    ],
    "contact-sponsors-head": [
      ["Eyebrow", "eyebrow"],
      ["Title", "heading"],
      ["Description", "lead", "textarea"],
    ],
    "contact-note": [
      ["Text", "text", "textarea"],
      ["Impact link label", "impact_label"],
      ["Email link label", "email_label"],
    ],
  };

  function copyObject(type) {
    const path = COPY_BLOCKS[type];
    if (!path) return null;
    let node = pagesRoot();
    for (const key of path) node = ensure(node, key, {});
    return node;
  }

  function homeStatsList() {
    return ensure(ensure(pagesRoot(), "home", {}), "stats", []);
  }

  function homeBandsList() {
    return ensure(ensure(pagesRoot(), "home", {}), "bands", []);
  }

  function teamList() {
    return ensure(ensure(pagesRoot(), "about", {}), "team", []);
  }

  function contactLinksList() {
    return ensure(ensure(pagesRoot(), "contact", {}), "links", []);
  }

  function homeIndexes() {
    const events = eventsList();
    const shown = [];
    events.forEach((event, index) => {
      if (event.show_on_home) shown.push(index);
    });
    if (!shown.length) return events.slice(0, 2).map((_, index) => index);
    return shown;
  }

  function cloneContent(data) {
    return JSON.parse(JSON.stringify(data));
  }

  function setDirty(value) {
    dirty = value;
    const revertBtn = document.getElementById("amgt-revert");
    if (revertBtn) revertBtn.disabled = !dirty;
  }

  function markDirty() {
    setDirty(true);
    setStatus("Unsaved changes");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => autosave(), 2000);
  }

  async function autosave() {
    try {
      await putContent();
      setStatus("Draft saved — Save to update the website");
    } catch (error) {
      setStatus(error.message || "Autosave failed");
    }
  }

  async function revertChanges() {
    if (!dirty || !savedSnapshot) return;
    if (!confirm("Discard unsaved changes and restore the last saved website?")) return;
    clearTimeout(saveTimer);
    content = cloneContent(savedSnapshot);
    closeDrawer();
    refreshPage();
    try {
      await putContent();
      setDirty(false);
      setStatus("Changes discarded");
    } catch (error) {
      setDirty(true);
      setStatus(error.message || "Could not revert");
    }
  }

  async function putContent() {
    const response = await fetch("/__api/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(content),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Save failed");
    return data;
  }

  async function uploadFile(file) {
    const response = await fetch("/__api/upload", {
      method: "POST",
      headers: {
        "X-Filename": file.name,
        "Content-Type": file.type || "application/octet-stream",
      },
      body: await file.arrayBuffer(),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Upload failed");
    return data.path;
  }

  function eventCardHTML(event, index) {
    return `<article class="event-card amgt-editable" data-edit="event" data-index="${index}">
      <img src="${escapeHtml(event.image || "")}" alt="${escapeHtml(event.alt || event.title || "")}">
      <div class="event-card-body">
        <span class="tag">${escapeHtml(event.tag || "")}</span>
        <h3>${escapeHtml(event.title || "")}</h3>
        <p>${escapeHtml(event.description || "")}</p>
      </div>
    </article>`;
  }

  function featureHTML(feature, index) {
    const number = String(index + 1).padStart(2, "0");
    return `<div class="feature amgt-editable" data-edit="feature" data-index="${index}">
      <span class="feature-icon">${number}</span>
      <div>
        <h4>${escapeHtml(feature.title || "")}</h4>
        <p>${escapeHtml(feature.description || "")}</p>
      </div>
    </div>`;
  }

  function sponsorSlotHTML(sponsor, index) {
    const img = `<img src="${escapeHtml(sponsor.logo || "")}" alt="${escapeHtml(sponsor.alt || sponsor.name || "Sponsor")}">`;
    const inner = (sponsor.url || "").trim()
      ? `<a href="${escapeHtml(sponsor.url)}" target="_blank" rel="noopener noreferrer">${img}</a>`
      : img;
    return `<div class="sponsor-slot amgt-editable" data-edit="sponsor" data-index="${index}">${inner}</div>`;
  }

  function renderEvents() {
    const grid = document.querySelector(".card-grid");
    if (!grid) return;
    if (page === "events") {
      grid.innerHTML = eventsList().map((event, index) => eventCardHTML(event, index)).join("");
      return;
    }
    if (page === "home") {
      grid.innerHTML = homeIndexes().map((index) => eventCardHTML(eventsList()[index], index)).join("");
    }
  }

  function renderEquipment() {
    if (page !== "equipment") return;
    const equipment = content.equipment;
    const intro = equipment.intro || {};
    const copy = document.querySelector(".split-copy");
    if (copy) {
      const eyebrow = copy.querySelector(":scope > .eyebrow");
      const heading = copy.querySelector(":scope > h2");
      const description = copy.querySelector(":scope > p");
      if (eyebrow) eyebrow.textContent = intro.eyebrow || "";
      if (heading) heading.textContent = intro.heading || "";
      if (description) description.textContent = intro.description || "";
      copy.classList.add("amgt-editable");
      copy.dataset.edit = "intro";
    }

    const featureList = document.querySelector(".feature-list");
    if (featureList) {
      featureList.innerHTML = featuresList().map((feature, index) => featureHTML(feature, index)).join("");
    }

    const hero = equipment.hero_image || {};
    const heroImg = document.querySelector(".split-media img");
    if (heroImg) {
      heroImg.src = hero.src || "";
      heroImg.alt = hero.alt || "";
      heroImg.classList.add("amgt-editable");
      heroImg.dataset.edit = "hero";
    }

    const gallery = equipment.gallery || {};
    const head = document.querySelector(".section-head");
    if (head) {
      const eyebrow = head.querySelector(".eyebrow");
      const heading = head.querySelector("h2");
      const lead = head.querySelector(".section-lead");
      if (eyebrow) eyebrow.textContent = gallery.eyebrow || "";
      if (heading) heading.textContent = gallery.heading || "";
      if (lead) lead.textContent = gallery.lead || "";
      head.classList.add("amgt-editable");
      head.dataset.edit = "gallery-head";
    }

    const galleryGrid = document.querySelector(".gallery-grid");
    if (galleryGrid) {
      galleryGrid.innerHTML = galleryList()
        .map((image, index) => `<img class="amgt-editable" data-edit="gallery" data-index="${index}" src="${escapeHtml(image.src || "")}" alt="${escapeHtml(image.alt || "")}">`)
        .join("");
    }
  }

  function renderSponsors() {
    if (page !== "sponsors") return;
    const pageCopy = content.sponsors.page || {};
    const hero = document.querySelector(".page-hero .container");
    if (hero) {
      const eyebrow = hero.querySelector(".eyebrow");
      const heading = hero.querySelector("h1");
      const lead = hero.querySelector(".page-hero-lead");
      if (eyebrow) eyebrow.textContent = pageCopy.eyebrow || "";
      if (heading) heading.textContent = pageCopy.heading || "";
      if (lead) lead.textContent = pageCopy.lead || "";
      hero.classList.add("amgt-editable");
      hero.dataset.edit = "sponsors-hero";
    }

    const statsGrid = document.querySelector(".impact-grid");
    if (statsGrid) {
      statsGrid.innerHTML = statsList()
        .map((stat, index) => `<div class="impact-stat amgt-editable" data-edit="stat" data-index="${index}">
          <strong class="impact-value">${escapeHtml(stat.value || "")}</strong>
          <span class="impact-label">${escapeHtml(stat.label || "")}</span>
          <p class="impact-detail">${escapeHtml(stat.detail || "")}</p>
        </div>`)
        .join("");
    }

    const why = content.sponsors.why || {};
    const whyCopy = document.querySelector(".split-copy");
    if (whyCopy) {
      const points = (why.points || []).map((point) => `<li>${escapeHtml(point)}</li>`).join("");
      whyCopy.innerHTML = `
        <p class="eyebrow">${escapeHtml(why.eyebrow || "")}</p>
        <h2>${escapeHtml(why.heading || "")}</h2>
        <p>${escapeHtml(why.description || "")}</p>
        <ul class="check-list">${points}</ul>`;
      whyCopy.classList.add("amgt-editable");
      whyCopy.dataset.edit = "why";
    }

    const partners = content.sponsors.sponsors || {};
    const head = document.querySelector(".section-head");
    if (head) {
      const eyebrow = head.querySelector(".eyebrow");
      const heading = head.querySelector("h2");
      const lead = head.querySelector(".section-lead");
      if (eyebrow) eyebrow.textContent = partners.eyebrow || "";
      if (heading) heading.textContent = partners.heading || "";
      if (lead) lead.textContent = partners.lead || "";
      head.classList.add("amgt-editable");
      head.dataset.edit = "partners-head";
    }

    const grid = document.querySelector(".sponsor-grid");
    if (grid) {
      grid.innerHTML = sponsorItems().map((sponsor, index) => sponsorSlotHTML(sponsor, index)).join("");
    }

    const cta = content.sponsors.cta || {};
    const note = document.querySelector(".sponsor-note");
    if (note) {
      note.innerHTML = `${escapeHtml(cta.text || "")}
        <a href="mailto:${escapeHtml(cta.email || "contact@amgt.gatech.edu")}">${escapeHtml(cta.link_label || "Email us")}</a> to learn about sponsorship opportunities.`;
      note.classList.add("amgt-editable");
      note.dataset.edit = "cta";
    }
  }

  function hasText(data) {
    if (!data || typeof data !== "object") return false;
    return Object.values(data).some((value) => {
      if (Array.isArray(value)) return value.length > 0;
      return String(value || "").trim().length > 0;
    });
  }

  function fillText(root, selector, value) {
    const node = root.querySelector(selector);
    if (node) node.textContent = value || "";
    return node;
  }

  function markCopy(node, type) {
    if (!node) return;
    node.classList.add("amgt-editable");
    node.dataset.edit = type;
    delete node.dataset.index;
  }

  function fillPageHero(container, data, type) {
    if (!container || !data || !hasText(data)) return;
    fillText(container, ".eyebrow", data.eyebrow);
    const heading = container.querySelector("h1");
    if (heading) {
      if (data.highlight) {
        heading.innerHTML = `${escapeHtml(data.heading || "")}<br><span class="highlight">${escapeHtml(data.highlight)}</span>`;
      } else {
        heading.textContent = data.heading || "";
      }
    }
    fillText(container, ".page-hero-lead, .hero-lead", data.lead);
    const primary = container.querySelector(".btn-primary");
    const secondary = container.querySelector(".btn-secondary");
    if (primary && data.primary_cta != null) primary.textContent = data.primary_cta;
    if (secondary && data.secondary_cta != null) secondary.textContent = data.secondary_cta;
    markCopy(container, type);
  }

  function fillSectionHead(head, data, type) {
    if (!head || !data || !hasText(data)) return;
    fillText(head, ".eyebrow", data.eyebrow);
    fillText(head, "h2", data.heading);
    fillText(head, ".section-lead", data.lead);
    markCopy(head, type);
  }

  function renderPageCopy() {
    if (page === "home") {
      const hero = copyObject("home-hero");
      fillPageHero(document.querySelector(".hero-content"), hero, "home-hero");
      const statsGrid = document.querySelector(".stats-grid");
      if (statsGrid && homeStatsList().length) {
        statsGrid.innerHTML = homeStatsList().map((stat, index) => `<div class="stat amgt-editable" data-edit="home-stat" data-index="${index}">
          <strong>${escapeHtml(stat.title || "")}</strong>
          <span>${escapeHtml(stat.text || "")}</span>
        </div>`).join("");
      }
      const welcome = copyObject("home-welcome");
      const copy = document.querySelector(".split-copy");
      if (copy && hasText(welcome)) {
        fillText(copy, ":scope > .eyebrow", welcome.eyebrow);
        fillText(copy, "h2", welcome.heading);
        fillText(copy, ":scope > p:not(.eyebrow)", welcome.description);
        const button = copy.querySelector(".btn");
        if (button) button.textContent = welcome.cta || "";
        markCopy(copy, "home-welcome");
      }
      fillSectionHead(document.querySelector(".section-head"), copyObject("home-events-head"), "home-events-head");
      const eventsCta = document.querySelector(".section-cta .btn");
      if (eventsCta) {
        eventsCta.textContent = (copyObject("home-events-head") || {}).cta || "";
        markCopy(document.querySelector(".section-cta"), "home-events-head");
      }
      const bandGrid = document.querySelector(".cta-band-grid");
      const hrefs = ["equipment.html", "about.html", "sponsors.html"];
      if (bandGrid && homeBandsList().length) {
        bandGrid.innerHTML = homeBandsList().map((band, index) => `<a href="${hrefs[index] || "#"}" class="cta-band-card amgt-editable" data-edit="home-band" data-index="${index}">
          <span class="cta-band-label">${escapeHtml(band.label || "")}</span>
          <strong>${escapeHtml(band.title || "")}</strong>
          <span>${escapeHtml(band.text || "")}</span>
        </a>`).join("");
      }
    }

    if (page === "events") {
      fillPageHero(document.querySelector(".page-hero .container"), copyObject("events-hero"), "events-hero");
    }

    if (page === "equipment") {
      fillPageHero(document.querySelector(".page-hero .container"), copyObject("equipment-page-hero"), "equipment-page-hero");
    }

    if (page === "about") {
      fillPageHero(document.querySelector(".page-hero .container"), copyObject("about-hero"), "about-hero");
      const mission = copyObject("about-mission");
      const copy = document.querySelector(".split-copy");
      if (copy && hasText(mission)) {
        const points = (mission.points || []).map((point) => `<li>${escapeHtml(point)}</li>`).join("");
        copy.innerHTML = `<p class="eyebrow">${escapeHtml(mission.eyebrow || "")}</p>
          <h2>${escapeHtml(mission.heading || "")}</h2>
          <p>${escapeHtml(mission.description || "")}</p>
          <p>${escapeHtml(mission.description2 || "")}</p>
          <ul class="check-list">${points}</ul>`;
        markCopy(copy, "about-mission");
      }
      fillSectionHead(document.querySelector(".section-head"), copyObject("about-team-head"), "about-team-head");
      const grid = document.querySelector(".team-grid");
      if (grid && teamList().length) {
        grid.innerHTML = teamList().map((member, index) => `<article class="team-card amgt-editable" data-edit="about-team" data-index="${index}">
          <div class="team-photo">
            <img src="${escapeHtml(member.image || "")}" alt="${escapeHtml(member.alt || member.name || "")}">
          </div>
          <h3>${escapeHtml(member.role || "")}</h3>
          <p class="team-name">${escapeHtml(member.name || "")}</p>
          <p class="team-role">${escapeHtml(member.description || "")}</p>
        </article>`).join("");
      }
    }

    if (page === "contact") {
      fillPageHero(document.querySelector(".page-hero .container"), copyObject("contact-hero"), "contact-hero");
      const intro = copyObject("contact-intro");
      const copy = document.querySelector(".contact-copy");
      if (copy && hasText(intro)) {
        fillText(copy, ":scope > .eyebrow", intro.eyebrow);
        fillText(copy, "h2", intro.heading);
        fillText(copy, ":scope > p", intro.description);
        markCopy(copy, "contact-intro");
      }
      const links = document.querySelector(".contact-links");
      if (links && contactLinksList().length) {
        links.innerHTML = contactLinksList().map((link, index) => {
          const extra = (link.href || "").startsWith("http") ? ' target="_blank" rel="noopener noreferrer"' : "";
          return `<a href="${escapeHtml(link.href || "")}" class="contact-card amgt-editable" data-edit="contact-link" data-index="${index}"${extra}>
            <span class="contact-label">${escapeHtml(link.label || "")}</span>
            <span class="contact-value">${escapeHtml(link.value || "")}</span>
          </a>`;
        }).join("");
      }
      fillSectionHead(document.querySelector(".section-head"), copyObject("contact-sponsors-head"), "contact-sponsors-head");
      const note = copyObject("contact-note");
      const noteEl = document.querySelector(".sponsor-note");
      if (noteEl && hasText(note)) {
        const email = (content.sponsors.cta || {}).email || "contact@amgt.gatech.edu";
        noteEl.innerHTML = `${escapeHtml(note.text || "")}
          <a href="sponsors.html">${escapeHtml(note.impact_label || "See our impact")}</a> or
          <a href="mailto:${escapeHtml(email)}">${escapeHtml(note.email_label || "email us")}</a> about sponsorship opportunities.`;
        markCopy(noteEl, "contact-note");
      }
    }
  }

  function renderContactSponsors() {
    if (page !== "contact") return;
    const grid = document.querySelector(".sponsor-grid");
    if (grid) {
      grid.innerHTML = sponsorItems().map((sponsor, index) => sponsorSlotHTML(sponsor, index)).join("");
    }
  }

  function refreshPage() {
    renderPageCopy();
    renderEvents();
    renderEquipment();
    renderSponsors();
    renderContactSponsors();
    highlightCurrent();
  }

  function highlightCurrent() {
    document.querySelectorAll(".amgt-selected").forEach((node) => node.classList.remove("amgt-selected"));
    if (!current) return;
    const selector = current.index == null
      ? `[data-edit="${current.type}"]`
      : `[data-edit="${current.type}"][data-index="${current.index}"]`;
    document.querySelector(selector)?.classList.add("amgt-selected");
  }

  function closeDrawer() {
    current = null;
    drawer.classList.remove("open");
    highlightCurrent();
  }

  function fieldHTML(label, name, value, kind = "text") {
    if (kind === "textarea") {
      return `<label class="amgt-field">${label}<textarea name="${name}">${escapeHtml(value || "")}</textarea></label>`;
    }
    if (kind === "checkbox") {
      return `<label class="amgt-check"><input type="checkbox" name="${name}" ${value ? "checked" : ""}>${label}</label>`;
    }
    return `<label class="amgt-field">${label}<input type="${kind}" name="${name}" value="${escapeHtml(value || "")}"></label>`;
  }

  function imageFieldHTML(src) {
    const thumb = src
      ? `<img class="amgt-thumb" src="${escapeHtml(src)}" alt="">`
      : `<div class="amgt-thumb empty">No photo yet</div>`;
    return `${thumb}<label class="amgt-field">Replace photo<input type="file" name="image" accept="image/*"></label>`;
  }

  function itemActions() {
    return `<div class="amgt-drawer-row">
      <button type="button" class="amgt-btn-ghost" data-action="up">Move up</button>
      <button type="button" class="amgt-btn-ghost" data-action="down">Move down</button>
      <button type="button" class="amgt-btn-danger" data-action="delete">Delete</button>
    </div>`;
  }

  function openEditor(type, index) {
    current = { type, index };
    const schemas = {
      event: () => {
        const event = eventsList()[index] || {};
        return {
          title: "Edit event",
          lead: "This card appears on Events, and on Home if you check the box.",
          body: fieldHTML("Title", "title", event.title)
            + fieldHTML("Tag", "tag", event.tag)
            + fieldHTML("Description", "description", event.description, "textarea")
            + fieldHTML("Photo description", "alt", event.alt)
            + imageFieldHTML(event.image)
            + fieldHTML("Show on home page", "show_on_home", event.show_on_home, "checkbox")
            + (page === "events" ? itemActions() : ""),
        };
      },
      feature: () => {
        const feature = featuresList()[index] || {};
        return {
          title: "Edit equipment block",
          lead: "These short blocks sit beside the large workshop photo.",
          body: fieldHTML("Title", "title", feature.title)
            + fieldHTML("Description", "description", feature.description, "textarea")
            + itemActions(),
        };
      },
      gallery: () => {
        const image = galleryList()[index] || {};
        return {
          title: "Edit gallery photo",
          body: fieldHTML("Photo description", "alt", image.alt)
            + imageFieldHTML(image.src)
            + itemActions(),
        };
      },
      hero: () => {
        const hero = content.equipment.hero_image || {};
        return {
          title: "Edit large photo",
          body: fieldHTML("Photo description", "alt", hero.alt) + imageFieldHTML(hero.src),
        };
      },
      intro: () => {
        const intro = content.equipment.intro || {};
        return {
          title: "Edit equipment intro",
          body: fieldHTML("Eyebrow", "eyebrow", intro.eyebrow)
            + fieldHTML("Heading", "heading", intro.heading)
            + fieldHTML("Description", "description", intro.description, "textarea"),
        };
      },
      "gallery-head": () => {
        const gallery = content.equipment.gallery || {};
        return {
          title: "Edit gallery text",
          body: fieldHTML("Eyebrow", "eyebrow", gallery.eyebrow)
            + fieldHTML("Heading", "heading", gallery.heading)
            + fieldHTML("Description", "lead", gallery.lead, "textarea"),
        };
      },
      "sponsors-hero": () => {
        const pageCopy = content.sponsors.page || {};
        return {
          title: "Edit sponsors intro",
          body: fieldHTML("Eyebrow", "eyebrow", pageCopy.eyebrow)
            + fieldHTML("Heading", "heading", pageCopy.heading)
            + fieldHTML("Lead", "lead", pageCopy.lead, "textarea"),
        };
      },
      stat: () => {
        const stat = statsList()[index] || {};
        return {
          title: "Edit statistic",
          body: fieldHTML("Big number", "value", stat.value)
            + fieldHTML("Label", "label", stat.label)
            + fieldHTML("Short description", "detail", stat.detail, "textarea")
            + itemActions(),
        };
      },
      why: () => {
        const why = content.sponsors.why || {};
        return {
          title: "Edit why sponsor",
          body: fieldHTML("Eyebrow", "eyebrow", why.eyebrow)
            + fieldHTML("Heading", "heading", why.heading)
            + fieldHTML("Description", "description", why.description, "textarea")
            + fieldHTML("Benefits (one per line)", "points", (why.points || []).join("\n"), "textarea"),
        };
      },
      "partners-head": () => {
        const partners = content.sponsors.sponsors || {};
        return {
          title: "Edit partners heading",
          body: fieldHTML("Eyebrow", "eyebrow", partners.eyebrow)
            + fieldHTML("Heading", "heading", partners.heading)
            + fieldHTML("Description", "lead", partners.lead, "textarea"),
        };
      },
      sponsor: () => {
        const sponsor = sponsorItems()[index] || {};
        return {
          title: "Edit sponsor",
          body: fieldHTML("Name", "name", sponsor.name)
            + fieldHTML("Website (optional)", "url", sponsor.url, "url")
            + fieldHTML("Logo description", "alt", sponsor.alt)
            + imageFieldHTML(sponsor.logo)
            + (page === "sponsors" ? itemActions() : ""),
        };
      },
      cta: () => {
        const cta = content.sponsors.cta || {};
        return {
          title: "Edit call to action",
          body: fieldHTML("Text", "text", cta.text)
            + fieldHTML("Email", "email", cta.email, "email")
            + fieldHTML("Link label", "link_label", cta.link_label),
        };
      },
      "home-stat": () => {
        const stat = homeStatsList()[index] || {};
        return {
          title: "Edit highlight",
          body: fieldHTML("Title", "title", stat.title)
            + fieldHTML("Description", "text", stat.text),
        };
      },
      "home-band": () => {
        const band = homeBandsList()[index] || {};
        return {
          title: "Edit shortcut card",
          body: fieldHTML("Label", "label", band.label)
            + fieldHTML("Title", "title", band.title)
            + fieldHTML("Description", "text", band.text),
        };
      },
      "about-team": () => {
        const member = teamList()[index] || {};
        return {
          title: "Edit board member",
          body: fieldHTML("Role", "role", member.role)
            + fieldHTML("Name", "name", member.name)
            + fieldHTML("Description", "description", member.description, "textarea")
            + fieldHTML("Photo description", "alt", member.alt)
            + imageFieldHTML(member.image)
            + itemActions(),
        };
      },
      "contact-link": () => {
        const link = contactLinksList()[index] || {};
        return {
          title: "Edit contact link",
          body: fieldHTML("Label", "label", link.label)
            + fieldHTML("Display text", "value", link.value)
            + fieldHTML("Link (email or URL)", "href", link.href),
        };
      },
    };

    if (COPY_FIELDS[type] && !schemas[type]) {
      schemas[type] = () => {
        const data = copyObject(type) || {};
        const body = COPY_FIELDS[type].map(([label, name, kind]) => {
          let value = data[name];
          if (name === "points" && Array.isArray(value)) value = value.join("\n");
          return fieldHTML(label, name, value, kind || "text");
        }).join("");
        return {
          title: "Edit text",
          lead: "This title and description appear on the page.",
          body,
        };
      };
    }

    const schema = schemas[type];
    if (!schema) return;
    const view = schema();
    drawerInner.innerHTML = `<h2>${escapeHtml(view.title)}</h2>
      <p class="amgt-drawer-lead">${escapeHtml(view.lead || "Changes show on the page as you type.")}</p>
      ${view.body}`;
    drawer.classList.add("open");
    highlightCurrent();
    bindDrawer();
  }

  function applyField(name, value) {
    if (!current) return;
    const { type, index } = current;
    if (type === "event") eventsList()[index][name] = value;
    else if (type === "feature") featuresList()[index][name] = value;
    else if (type === "gallery") galleryList()[index][name] = value;
    else if (type === "hero") {
      content.equipment.hero_image = content.equipment.hero_image || {};
      content.equipment.hero_image[name] = value;
    } else if (type === "intro") {
      content.equipment.intro = content.equipment.intro || {};
      content.equipment.intro[name] = value;
    } else if (type === "gallery-head") {
      content.equipment.gallery = content.equipment.gallery || { images: [] };
      content.equipment.gallery[name] = value;
    } else if (type === "sponsors-hero") {
      content.sponsors.page = content.sponsors.page || {};
      content.sponsors.page[name] = value;
    } else if (type === "stat") statsList()[index][name] = value;
    else if (type === "why") {
      content.sponsors.why = content.sponsors.why || { points: [] };
      content.sponsors.why[name] = name === "points"
        ? value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
        : value;
    } else if (type === "partners-head") {
      content.sponsors.sponsors = content.sponsors.sponsors || { items: [] };
      content.sponsors.sponsors[name] = value;
    } else if (type === "sponsor") sponsorItems()[index][name] = value;
    else if (type === "cta") {
      content.sponsors.cta = content.sponsors.cta || {};
      content.sponsors.cta[name] = value;
    } else if (COPY_BLOCKS[type]) {
      const target = copyObject(type);
      target[name] = name === "points"
        ? value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
        : value;
    } else if (type === "home-stat") homeStatsList()[index][name] = value;
    else if (type === "home-band") homeBandsList()[index][name] = value;
    else if (type === "about-team") teamList()[index][name] = value;
    else if (type === "contact-link") contactLinksList()[index][name] = value;
    markDirty();
    updateLiveElement();
    highlightCurrent();
  }

  function selectedNode() {
    if (!current) return null;
    return current.index == null
      ? document.querySelector(`[data-edit="${current.type}"]`)
      : document.querySelector(`[data-edit="${current.type}"][data-index="${current.index}"]`);
  }

  function updateLiveElement() {
    if (!current) {
      refreshPage();
      return;
    }
    const { type, index } = current;
    const node = selectedNode();

    if (type === "event") {
      const event = eventsList()[index];
      if (!event) {
        refreshPage();
        return;
      }
      if (page === "home" && !homeIndexes().includes(index)) {
        refreshPage();
        return;
      }
      if (!node) {
        refreshPage();
        return;
      }
      const img = node.querySelector("img");
      if (img) {
        if (img.getAttribute("src") !== (event.image || "")) img.src = event.image || "";
        img.alt = event.alt || event.title || "";
      }
      const tag = node.querySelector(".tag");
      const title = node.querySelector("h3");
      const desc = node.querySelector("p");
      if (tag) tag.textContent = event.tag || "";
      if (title) title.textContent = event.title || "";
      if (desc) desc.textContent = event.description || "";
      return;
    }

    if (type === "feature" && node) {
      const feature = featuresList()[index] || {};
      const title = node.querySelector("h4");
      const desc = node.querySelector("p");
      if (title) title.textContent = feature.title || "";
      if (desc) desc.textContent = feature.description || "";
      return;
    }

    if ((type === "gallery" || type === "hero") && node) {
      const image = type === "hero" ? (content.equipment.hero_image || {}) : (galleryList()[index] || {});
      if (node.getAttribute("src") !== (image.src || "")) node.src = image.src || "";
      node.alt = image.alt || "";
      return;
    }

    if (type === "intro") {
      const intro = content.equipment.intro || {};
      const copy = document.querySelector(".split-copy");
      if (!copy) return;
      const eyebrow = copy.querySelector(":scope > .eyebrow");
      const heading = copy.querySelector(":scope > h2");
      const description = copy.querySelector(":scope > p");
      if (eyebrow) eyebrow.textContent = intro.eyebrow || "";
      if (heading) heading.textContent = intro.heading || "";
      if (description) description.textContent = intro.description || "";
      return;
    }

    if (type === "gallery-head" || type === "partners-head") {
      const data = type === "gallery-head" ? (content.equipment.gallery || {}) : (content.sponsors.sponsors || {});
      const head = document.querySelector(".section-head");
      if (!head) return;
      const eyebrow = head.querySelector(".eyebrow");
      const heading = head.querySelector("h2");
      const lead = head.querySelector(".section-lead");
      if (eyebrow) eyebrow.textContent = data.eyebrow || "";
      if (heading) heading.textContent = data.heading || "";
      if (lead) lead.textContent = data.lead || "";
      return;
    }

    if (type === "sponsors-hero") {
      const pageCopy = content.sponsors.page || {};
      const hero = document.querySelector(".page-hero .container");
      if (!hero) return;
      const eyebrow = hero.querySelector(".eyebrow");
      const heading = hero.querySelector("h1");
      const lead = hero.querySelector(".page-hero-lead");
      if (eyebrow) eyebrow.textContent = pageCopy.eyebrow || "";
      if (heading) heading.textContent = pageCopy.heading || "";
      if (lead) lead.textContent = pageCopy.lead || "";
      return;
    }

    if (type === "stat" && node) {
      const stat = statsList()[index] || {};
      const value = node.querySelector(".impact-value");
      const label = node.querySelector(".impact-label");
      const detail = node.querySelector(".impact-detail");
      if (value) value.textContent = stat.value || "";
      if (label) label.textContent = stat.label || "";
      if (detail) detail.textContent = stat.detail || "";
      return;
    }

    if (type === "why") {
      renderSponsors();
      return;
    }

    if (type === "sponsor") {
      const grid = document.querySelector(".sponsor-grid");
      if (grid) {
        grid.innerHTML = sponsorItems().map((sponsor, i) => sponsorSlotHTML(sponsor, i)).join("");
      }
      return;
    }

    if (type === "cta") {
      const cta = content.sponsors.cta || {};
      const note = document.querySelector(".sponsor-note");
      if (note) {
        note.innerHTML = `${escapeHtml(cta.text || "")}
        <a href="mailto:${escapeHtml(cta.email || "contact@amgt.gatech.edu")}">${escapeHtml(cta.link_label || "Email us")}</a> to learn about sponsorship opportunities.`;
        note.classList.add("amgt-editable");
        note.dataset.edit = "cta";
      }
      return;
    }

    if (COPY_BLOCKS[type] || type === "home-stat" || type === "home-band" || type === "about-team" || type === "contact-link") {
      renderPageCopy();
      return;
    }

    refreshPage();
  }

  function bindDrawer() {
    drawerInner.querySelectorAll("input, textarea").forEach((field) => {
      if (field.type === "file") {
        field.addEventListener("change", async () => {
          const file = field.files && field.files[0];
          if (!file) return;
          try {
            setStatus("Uploading photo…");
            const path = await uploadFile(file);
            const key = current.type === "event" || current.type === "about-team"
              ? "image"
              : current.type === "sponsor" ? "logo" : "src";
            applyField(key, path);
            if (current.type === "event" && !eventsList()[current.index].alt) {
              applyField("alt", file.name.replace(/\.[^.]+$/, "").replace(/_/g, " "));
            }
            openEditor(current.type, current.index);
            setStatus("Photo added");
          } catch (error) {
            setStatus(error.message || "Upload failed");
          }
        });
        return;
      }
      if (field.type === "checkbox") {
        field.addEventListener("change", () => applyField(field.name, field.checked));
        return;
      }
      field.addEventListener("input", () => applyField(field.name, field.value));
    });

    drawerInner.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", () => runItemAction(button.dataset.action));
    });
  }

  function listForCurrent() {
    if (!current) return null;
    if (current.type === "event") return eventsList();
    if (current.type === "feature") return featuresList();
    if (current.type === "gallery") return galleryList();
    if (current.type === "stat") return statsList();
    if (current.type === "sponsor") return sponsorItems();
    if (current.type === "about-team") return teamList();
    return null;
  }

  function runItemAction(action) {
    const list = listForCurrent();
    if (!list || current.index == null) return;
    const index = current.index;
    if (action === "delete") {
      if (!confirm("Remove this item from the website?")) return;
      list.splice(index, 1);
      markDirty();
      closeDrawer();
      refreshPage();
      return;
    }
    const next = action === "up" ? index - 1 : index + 1;
    if (next < 0 || next >= list.length) return;
    [list[index], list[next]] = [list[next], list[index]];
    current.index = next;
    markDirty();
    refreshPage();
    openEditor(current.type, next);
  }

  function addEvent() {
    eventsList().push({
      title: "New event",
      tag: "Workshop",
      description: "Describe what happened at this event.",
      image: "",
      alt: "",
      show_on_home: false,
    });
    markDirty();
    refreshPage();
    openEditor("event", eventsList().length - 1);
  }

  function addFeature() {
    featuresList().push({
      title: "New equipment",
      description: "Describe this tool or capability.",
    });
    markDirty();
    refreshPage();
    openEditor("feature", featuresList().length - 1);
  }

  function addGallery() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        const path = await uploadFile(file);
        galleryList().push({
          src: path,
          alt: file.name.replace(/\.[^.]+$/, "").replace(/_/g, " "),
        });
        markDirty();
        refreshPage();
        openEditor("gallery", galleryList().length - 1);
      } catch (error) {
        setStatus(error.message || "Upload failed");
      }
    });
    input.click();
  }

  function addStat() {
    statsList().push({
      value: "0",
      label: "New statistic",
      detail: "Describe this impact number.",
    });
    markDirty();
    refreshPage();
    openEditor("stat", statsList().length - 1);
  }

  function addSponsor() {
    sponsorItems().push({
      name: "New sponsor",
      logo: "",
      alt: "",
      url: "",
    });
    markDirty();
    refreshPage();
    openEditor("sponsor", sponsorItems().length - 1);
  }

  function addTeamMember() {
    teamList().push({
      role: "New role",
      name: "Name Here",
      description: "Describe what this board member does.",
      image: "",
      alt: "",
    });
    markDirty();
    refreshPage();
    openEditor("about-team", teamList().length - 1);
  }

  function setupActions() {
    const buttons = {
      events: [["Add event", addEvent]],
      equipment: [["Add equipment block", addFeature], ["Add photo", addGallery]],
      sponsors: [["Add statistic", addStat], ["Add sponsor", addSponsor]],
      about: [["Add board member", addTeamMember]],
    };
    (buttons[page] || []).forEach(([label, handler]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "amgt-btn-ghost";
      button.textContent = label;
      button.addEventListener("click", handler);
      actionsEl.appendChild(button);
    });

    hintEl.textContent = "Click a title, description, photo, or card to edit it";
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest(".amgt-bar, .amgt-drawer")) return;
    const target = event.target.closest(".amgt-editable");
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    const index = target.dataset.index === undefined ? null : Number(target.dataset.index);
    openEditor(target.dataset.edit, Number.isNaN(index) ? null : index);
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDrawer();
  });

  document.getElementById("amgt-revert").addEventListener("click", () => {
    revertChanges();
  });

  async function saveWebsite() {
    const response = await fetch("/__api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(content),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Save failed");
    savedSnapshot = cloneContent(content);
    setDirty(false);
    return data;
  }

  document.getElementById("amgt-save").addEventListener("click", async () => {
    try {
      setStatus("Saving website…");
      await saveWebsite();
      setStatus("Website saved");
    } catch (error) {
      setStatus(error.message || "Save failed");
    }
  });

  document.getElementById("amgt-deploy").addEventListener("click", async () => {
    if (!confirm("Publish the saved website to GitHub now?")) return;
    const deployBtn = document.getElementById("amgt-deploy");
    deployBtn.disabled = true;
    try {
      setStatus("Saving website…");
      await saveWebsite();
      setStatus("Publishing to GitHub…");
      const response = await fetch("/__api/deploy", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Deploy failed");
      setStatus(data.message || "Published to GitHub");
    } catch (error) {
      setStatus(error.message || "Deploy failed");
    } finally {
      deployBtn.disabled = false;
    }
  });

  setupActions();

  fetch("/__api/content")
    .then((response) => response.json())
    .then((data) => {
      content = data;
      savedSnapshot = cloneContent(content);
      setDirty(false);
      refreshPage();
      setStatus("Ready");
    })
    .catch(() => setStatus("Could not load content"));
})();
