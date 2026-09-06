const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector(".nav-links");
const currentPage = document.body.dataset.page;

navToggle?.addEventListener("click", () => {
  const isOpen = navLinks.classList.toggle("open");
  navToggle.setAttribute("aria-expanded", String(isOpen));
});

navLinks?.querySelectorAll("a").forEach((link) => {
  const href = link.getAttribute("href") || "";
  const linkPage = href.replace(".html", "").replace("index", "home");

  if (linkPage === currentPage) {
    link.classList.add("active");
    link.setAttribute("aria-current", "page");
  }

  link.addEventListener("click", () => {
    navLinks.classList.remove("open");
    navToggle?.setAttribute("aria-expanded", "false");
  });
});

let equipmentTimer = null;

function initEquipmentCycle() {
  const root = document.querySelector(".equipment-cycle");
  if (equipmentTimer) {
    clearInterval(equipmentTimer);
    equipmentTimer = null;
  }
  if (!root) return;

  const slides = [...root.querySelectorAll(".equipment-slide")];
  if (!slides.length) return;

  let current = Math.max(0, slides.findIndex((slide) => slide.classList.contains("is-active")));
  if (current < 0) current = 0;

  let dots = root.querySelector(".equipment-dots");
  if (!dots) {
    dots = document.createElement("div");
    dots.className = "equipment-dots";
    dots.setAttribute("role", "tablist");
    root.appendChild(dots);
  }
  dots.innerHTML = slides
    .map((_, index) => `<button type="button" class="equipment-dot${index === current ? " is-active" : ""}" aria-label="Show equipment ${index + 1}"></button>`)
    .join("");

  function show(index) {
    current = (index + slides.length) % slides.length;
    slides.forEach((slide, slideIndex) => slide.classList.toggle("is-active", slideIndex === current));
    dots.querySelectorAll(".equipment-dot").forEach((dot, dotIndex) => {
      dot.classList.toggle("is-active", dotIndex === current);
    });
  }

  dots.querySelectorAll(".equipment-dot").forEach((dot, index) => {
    dot.addEventListener("click", () => show(index));
  });

  if (slides.length < 2) return;

  const start = () => {
    if (equipmentTimer) return;
    equipmentTimer = setInterval(() => show(current + 1), 7000);
  };
  const stop = () => {
    clearInterval(equipmentTimer);
    equipmentTimer = null;
  };

  root.addEventListener("mouseenter", stop);
  root.addEventListener("mouseleave", start);
  start();
}

window.AMGT = { initEquipmentCycle };
initEquipmentCycle();

document.querySelectorAll(".footer-nav a").forEach((link) => {
  const href = link.getAttribute("href") || "";
  const linkPage = href.replace(".html", "").replace("index", "home");

  if (linkPage === currentPage) {
    link.classList.add("active");
  }
});
