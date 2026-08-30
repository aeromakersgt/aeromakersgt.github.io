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

document.querySelectorAll(".footer-nav a").forEach((link) => {
  const href = link.getAttribute("href") || "";
  const linkPage = href.replace(".html", "").replace("index", "home");

  if (linkPage === currentPage) {
    link.classList.add("active");
  }
});
