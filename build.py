#!/usr/bin/env python3
"""AMGT website builder and content editor.

Usage:
  python build.py           Open the local website editor
  python build.py --build   Rebuild HTML from content/*.json
  python build.py --gui     Open the local website editor
"""

from __future__ import annotations

import argparse
import html
import json
import mimetypes
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import uuid
import webbrowser
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent
CONTENT_DIR = ROOT / "content"
UPLOADS_DIR = ROOT / "images" / "uploads"
EVENTS_FILE = CONTENT_DIR / "events.json"
EQUIPMENT_FILE = CONTENT_DIR / "equipment.json"
SPONSORS_FILE = CONTENT_DIR / "sponsors.json"
PAGES_FILE = CONTENT_DIR / "pages.json"

EDITOR_DIR = ROOT / "editor"
DEFAULT_PORT = 8765
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
BLOCKED_PREFIXES = (".git", "__pycache__", "editor")

DEFAULT_EQUIPMENT = {
    "intro": {"eyebrow": "", "heading": "", "description": ""},
    "hero_image": {"src": "", "alt": ""},
    "features": [],
    "gallery": {"eyebrow": "", "heading": "", "lead": "", "images": []},
}

DEFAULT_SPONSORS = {
    "page": {
        "eyebrow": "Sponsorship",
        "heading": "Help us equip the next generation of aerospace makers",
        "lead": "Your partnership funds tools, workshops, and community events.",
    },
    "stats": [],
    "why": {
        "eyebrow": "Why Sponsor",
        "heading": "Your support becomes hardware, skills, and community",
        "description": "",
        "points": [],
    },
    "sponsors": {
        "eyebrow": "Our Partners",
        "heading": "Powered by partners who believe in makers",
        "lead": "",
        "items": [],
    },
    "cta": {
        "text": "Interested in supporting the next generation of aerospace engineers?",
        "email": "contact@amgt.gatech.edu",
        "link_label": "Email us",
    },
}


def escape(text: str) -> str:
    return html.escape(text or "", quote=True)


def load_json(path: Path, default: dict) -> dict:
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(default, indent=2) + "\n", encoding="utf-8")
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def render_event_card(event: dict) -> str:
    return f"""          <article class="event-card">
            <img src="{escape(event['image'])}" alt="{escape(event.get('alt', event['title']))}">
            <div class="event-card-body">
              <span class="tag">{escape(event['tag'])}</span>
              <h3>{escape(event['title'])}</h3>
              <p>{escape(event['description'])}</p>
            </div>
          </article>"""


def render_feature(feature: dict, index: int) -> str:
    number = f"{index:02d}"
    return f"""            <div class="feature">
              <span class="feature-icon">{number}</span>
              <div>
                <h4>{escape(feature['title'])}</h4>
                <p>{escape(feature['description'])}</p>
              </div>
            </div>"""


def render_gallery_image(image: dict) -> str:
    return f"""          <img src="{escape(image['src'])}" alt="{escape(image.get('alt', ''))}">"""


def render_impact_stat(stat: dict) -> str:
    return f"""          <div class="impact-stat">
            <strong class="impact-value">{escape(stat.get('value', ''))}</strong>
            <span class="impact-label">{escape(stat.get('label', ''))}</span>
            <p class="impact-detail">{escape(stat.get('detail', ''))}</p>
          </div>"""


def render_sponsor_slot(sponsor: dict) -> str:
    alt = sponsor.get("alt") or sponsor.get("name") or "Sponsor"
    img = f'<img src="{escape(sponsor.get("logo", ""))}" alt="{escape(alt)}">'
    url = (sponsor.get("url") or "").strip()
    if url:
        inner = f'<a href="{escape(url)}" target="_blank" rel="noopener noreferrer">{img}</a>'
    else:
        inner = img
    return f"""          <div class="sponsor-slot">
            {inner}
          </div>"""


def render_why_block(why: dict) -> str:
    points = why.get("points") or []
    items = "\n".join(f"            <li>{escape(point)}</li>" for point in points)
    return f"""          <p class="eyebrow">{escape(why.get('eyebrow', ''))}</p>
          <h2>{escape(why.get('heading', ''))}</h2>
          <p>
            {escape(why.get('description', ''))}
          </p>
          <ul class="check-list">
{items}
          </ul>"""


def render_sponsors_cta(cta: dict) -> str:
    email = (cta.get("email") or "contact@amgt.gatech.edu").strip()
    label = (cta.get("link_label") or "Email us").strip()
    return f"""        <p class="sponsor-note">
          {escape(cta.get('text', ''))}
          <a href="mailto:{escape(email)}">{escape(label)}</a> to learn about sponsorship opportunities.
        </p>"""


def render_page_hero(block: dict) -> str:
    return f"""          <p class="eyebrow">{escape(block.get("eyebrow", ""))}</p>
          <h1>{escape(block.get("heading", ""))}</h1>
          <p class="page-hero-lead">
            {escape(block.get("lead", ""))}
          </p>"""


def render_section_head(block: dict) -> str:
    return f"""          <p class="eyebrow">{escape(block.get("eyebrow", ""))}</p>
          <h2>{escape(block.get("heading", ""))}</h2>
          <p class="section-lead">
            {escape(block.get("lead", ""))}
          </p>"""


def render_home_hero(hero: dict) -> str:
    heading = escape(hero.get("heading", ""))
    highlight = escape(hero.get("highlight", ""))
    title = f'{heading}<br><span class="highlight">{highlight}</span>' if highlight else heading
    return f"""        <p class="eyebrow">{escape(hero.get("eyebrow", ""))}</p>
        <h1>{title}</h1>
        <p class="hero-lead">
          {escape(hero.get("lead", ""))}
        </p>
        <div class="hero-actions">
          <a href="events.html" class="btn btn-primary">{escape(hero.get("primary_cta", "See Our Work"))}</a>
          <a href="contact.html" class="btn btn-secondary">{escape(hero.get("secondary_cta", "Join the Community"))}</a>
        </div>"""


def render_home_stats(stats: list) -> str:
    return "\n".join(
        f"""        <div class="stat">
          <strong>{escape(stat.get("title", ""))}</strong>
          <span>{escape(stat.get("text", ""))}</span>
        </div>"""
        for stat in stats
    )


def render_home_welcome(welcome: dict) -> str:
    return f"""          <p class="eyebrow">{escape(welcome.get("eyebrow", ""))}</p>
          <h2>{escape(welcome.get("heading", ""))}</h2>
          <p>
            {escape(welcome.get("description", ""))}
          </p>
          <a href="about.html" class="btn btn-dark">{escape(welcome.get("cta", "Meet the Team"))}</a>"""


def render_home_bands(bands: list) -> str:
    hrefs = ["equipment.html", "about.html", "sponsors.html"]
    parts = []
    for index, band in enumerate(bands):
        href = hrefs[index] if index < len(hrefs) else "#"
        parts.append(
            f"""        <a href="{href}" class="cta-band-card">
          <span class="cta-band-label">{escape(band.get("label", ""))}</span>
          <strong>{escape(band.get("title", ""))}</strong>
          <span>{escape(band.get("text", ""))}</span>
        </a>"""
        )
    return "\n".join(parts)


def render_about_mission(mission: dict) -> str:
    points = "\n".join(f"            <li>{escape(point)}</li>" for point in (mission.get("points") or []))
    return f"""          <p class="eyebrow">{escape(mission.get("eyebrow", ""))}</p>
          <h2>{escape(mission.get("heading", ""))}</h2>
          <p>
            {escape(mission.get("description", ""))}
          </p>
          <p>
            {escape(mission.get("description2", ""))}
          </p>
          <ul class="check-list">
{points}
          </ul>"""


def render_team_card(member: dict) -> str:
    return f"""          <article class="team-card">
            <div class="team-photo">
              <img src="{escape(member.get("image", ""))}" alt="{escape(member.get("alt", member.get("name", "")))}">
            </div>
            <h3>{escape(member.get("role", ""))}</h3>
            <p class="team-name">{escape(member.get("name", ""))}</p>
            <p class="team-role">{escape(member.get("description", ""))}</p>
          </article>"""


def render_contact_links(links: list) -> str:
    parts = []
    for link in links:
        href = link.get("href") or ""
        extra = ' target="_blank" rel="noopener noreferrer"' if href.startswith("http") else ""
        parts.append(
            f"""            <a href="{escape(href)}" class="contact-card"{extra}>
              <span class="contact-label">{escape(link.get("label", ""))}</span>
              <span class="contact-value">{escape(link.get("value", ""))}</span>
            </a>"""
        )
    return "\n".join(parts)


def render_contact_note(note: dict, email: str) -> str:
    return f"""        <p class="sponsor-note">
          {escape(note.get("text", ""))}
          <a href="sponsors.html">{escape(note.get("impact_label", "See our impact"))}</a> or
          <a href="mailto:{escape(email)}">{escape(note.get("email_label", "email us"))}</a> about sponsorship opportunities.
        </p>"""


def replace_marker(page: Path, marker_name: str, content: str) -> None:
    text = page.read_text(encoding="utf-8")
    block = f"<!-- BUILD:{marker_name} START -->\n{content}\n        <!-- BUILD:{marker_name} END -->"
    pattern = re.compile(
        rf"<!--\s*BUILD:{marker_name}\s*START\s*-->.*?<!--\s*BUILD:{marker_name}\s*END\s*-->",
        re.DOTALL,
    )
    if not pattern.search(text):
        raise ValueError(f"Marker BUILD:{marker_name} not found in {page.name}")
    updated = pattern.sub(block, text, count=1)
    page.write_text(updated, encoding="utf-8")


def build_site() -> list[str]:
    events_data = load_json(EVENTS_FILE, {"events": []})
    equipment_data = load_json(EQUIPMENT_FILE, {"features": [], "gallery": {"images": []}})
    sponsors_data = load_json(SPONSORS_FILE, DEFAULT_SPONSORS)

    events = events_data.get("events", [])
    home_events = [e for e in events if e.get("show_on_home", False)]
    if not home_events:
        home_events = events[:2]

    all_event_html = "\n".join(render_event_card(e) for e in events)
    home_event_html = "\n".join(render_event_card(e) for e in home_events)

    features = equipment_data.get("features", [])
    feature_html = "\n".join(render_feature(f, i + 1) for i, f in enumerate(features))

    gallery = equipment_data.get("gallery", {})
    gallery_images = gallery.get("images", [])
    gallery_html = "\n".join(render_gallery_image(img) for img in gallery_images)

    intro = equipment_data.get("intro", {})
    hero = equipment_data.get("hero_image", {})

    replace_marker(ROOT / "index.html", "HOME_EVENTS", home_event_html)
    replace_marker(ROOT / "events.html", "ALL_EVENTS", all_event_html)
    replace_marker(ROOT / "equipment.html", "EQUIPMENT_FEATURES", feature_html)
    replace_marker(
        ROOT / "equipment.html",
        "EQUIPMENT_HERO",
        f'          <img src="{escape(hero.get("src", ""))}" alt="{escape(hero.get("alt", ""))}">',
    )
    replace_marker(ROOT / "equipment.html", "EQUIPMENT_GALLERY", gallery_html)

    # Update equipment intro and gallery headings via additional markers
    replace_marker(
        ROOT / "equipment.html",
        "EQUIPMENT_INTRO",
        f"""          <p class="eyebrow">{escape(intro.get('eyebrow', ''))}</p>
          <h2>{escape(intro.get('heading', ''))}</h2>
          <p>
            {escape(intro.get('description', ''))}
          </p>""",
    )
    replace_marker(
        ROOT / "equipment.html",
        "EQUIPMENT_GALLERY_HEAD",
        f"""          <p class="eyebrow">{escape(gallery.get('eyebrow', ''))}</p>
          <h2>{escape(gallery.get('heading', ''))}</h2>
          <p class="section-lead">
            {escape(gallery.get('lead', ''))}
          </p>""",
    )

    page = sponsors_data.get("page", {})
    why = sponsors_data.get("why", {})
    sponsor_section = sponsors_data.get("sponsors", {})
    sponsor_items = sponsor_section.get("items", [])
    stats = sponsors_data.get("stats", [])
    cta = sponsors_data.get("cta", {})

    stats_html = "\n".join(render_impact_stat(stat) for stat in stats)
    sponsor_grid_html = "\n".join(render_sponsor_slot(item) for item in sponsor_items)

    replace_marker(
        ROOT / "sponsors.html",
        "SPONSORS_HERO",
        f"""          <p class="eyebrow">{escape(page.get('eyebrow', ''))}</p>
          <h1>{escape(page.get('heading', ''))}</h1>
          <p class="page-hero-lead">
            {escape(page.get('lead', ''))}
          </p>""",
    )
    replace_marker(ROOT / "sponsors.html", "SPONSORS_STATS", stats_html)
    replace_marker(ROOT / "sponsors.html", "SPONSORS_WHY", render_why_block(why))
    replace_marker(
        ROOT / "sponsors.html",
        "SPONSORS_HEAD",
        f"""          <p class="eyebrow">{escape(sponsor_section.get('eyebrow', ''))}</p>
          <h2>{escape(sponsor_section.get('heading', ''))}</h2>
          <p class="section-lead">
            {escape(sponsor_section.get('lead', ''))}
          </p>""",
    )
    replace_marker(ROOT / "sponsors.html", "SPONSORS_GRID", sponsor_grid_html)
    replace_marker(ROOT / "sponsors.html", "SPONSORS_CTA", render_sponsors_cta(cta))
    replace_marker(ROOT / "contact.html", "CONTACT_SPONSORS", sponsor_grid_html)

    pages_data = load_json(PAGES_FILE, {})
    home = pages_data.get("home", {})
    events_page = pages_data.get("events", {})
    equipment_page = pages_data.get("equipment", {})
    about = pages_data.get("about", {})
    contact = pages_data.get("contact", {})

    replace_marker(ROOT / "index.html", "HOME_HERO", render_home_hero(home.get("hero", {})))
    replace_marker(ROOT / "index.html", "HOME_STATS", render_home_stats(home.get("stats") or []))
    replace_marker(ROOT / "index.html", "HOME_WELCOME", render_home_welcome(home.get("welcome", {})))
    replace_marker(ROOT / "index.html", "HOME_EVENTS_HEAD", render_section_head(home.get("events", {})))
    replace_marker(
        ROOT / "index.html",
        "HOME_EVENTS_CTA",
        f'          <a href="events.html" class="btn btn-dark">{escape((home.get("events") or {}).get("cta", "View All Events"))}</a>',
    )
    replace_marker(ROOT / "index.html", "HOME_BANDS", render_home_bands(home.get("bands") or []))
    replace_marker(ROOT / "events.html", "EVENTS_HERO", render_page_hero(events_page.get("hero", {})))
    replace_marker(ROOT / "equipment.html", "EQUIPMENT_PAGE_HERO", render_page_hero(equipment_page.get("hero", {})))
    replace_marker(ROOT / "about.html", "ABOUT_HERO", render_page_hero(about.get("hero", {})))
    replace_marker(ROOT / "about.html", "ABOUT_MISSION", render_about_mission(about.get("mission", {})))
    replace_marker(ROOT / "about.html", "ABOUT_TEAM_HEAD", render_section_head(about.get("team_head", {})))
    replace_marker(
        ROOT / "about.html",
        "ABOUT_TEAM",
        "\n".join(render_team_card(member) for member in (about.get("team") or [])),
    )
    replace_marker(ROOT / "contact.html", "CONTACT_HERO", render_page_hero(contact.get("hero", {})))
    replace_marker(
        ROOT / "contact.html",
        "CONTACT_INTRO",
        f"""          <p class="eyebrow">{escape((contact.get("intro") or {}).get("eyebrow", ""))}</p>
          <h2>{escape((contact.get("intro") or {}).get("heading", ""))}</h2>
          <p>
            {escape((contact.get("intro") or {}).get("description", ""))}
          </p>""",
    )
    replace_marker(ROOT / "contact.html", "CONTACT_LINKS", render_contact_links(contact.get("links") or []))
    replace_marker(ROOT / "contact.html", "CONTACT_SPONSORS_HEAD", render_section_head(contact.get("sponsors_head", {})))
    replace_marker(
        ROOT / "contact.html",
        "CONTACT_NOTE",
        render_contact_note(contact.get("note") or {}, (cta.get("email") or "contact@amgt.gatech.edu")),
    )

    return [
        f"Updated index.html ({len(home_events)} home events)",
        f"Updated events.html ({len(events)} events)",
        f"Updated equipment.html ({len(features)} features, {len(gallery_images)} gallery images)",
        f"Updated sponsors.html ({len(stats)} stats, {len(sponsor_items)} sponsors)",
        f"Updated about.html ({len(about.get('team') or [])} board members)",
        "Updated contact.html",
    ]


def copy_image_to_uploads(source: str | Path) -> str:
    source_path = Path(source)
    if not source_path.is_absolute():
        source_path = ROOT / source_path
    if not source_path.exists():
        raise FileNotFoundError(f"Image not found: {source}")

    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    dest_name = f"{uuid.uuid4().hex[:8]}_{source_path.name}"
    dest_path = UPLOADS_DIR / dest_name
    shutil.copy2(source_path, dest_path)
    return str(dest_path.relative_to(ROOT)).replace("\\", "/")


def load_all_content() -> dict:
    return {
        "events": load_json(EVENTS_FILE, {"events": []}),
        "equipment": load_json(EQUIPMENT_FILE, DEFAULT_EQUIPMENT),
        "sponsors": load_json(SPONSORS_FILE, DEFAULT_SPONSORS),
        "pages": load_json(PAGES_FILE, {}),
    }


def run_git(*args: str, timeout: int = 120) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    return subprocess.run(
        ["git", *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=timeout,
        env=env,
    )


def git_error(result: subprocess.CompletedProcess) -> str:
    return (result.stderr or result.stdout or "Git command failed.").strip()


def deploy_site() -> dict:
    status = run_git("status", "--porcelain")
    if status.returncode != 0:
        raise RuntimeError(git_error(status))

    added = run_git("add", "-A")
    if added.returncode != 0:
        raise RuntimeError(git_error(added))

    staged = run_git("diff", "--cached", "--quiet")
    if staged.returncode == 0:
        return {"ok": True, "message": "Nothing new to publish. Save first if you just made edits."}

    commit = run_git("commit", "-m", "Update website content")
    if commit.returncode != 0:
        raise RuntimeError(git_error(commit))

    push = run_git("push", "origin", "HEAD", timeout=180)
    if push.returncode != 0:
        raise RuntimeError(git_error(push))

    return {"ok": True, "message": "Published to GitHub. The live site will update in a minute or two."}


def save_all_content(data: dict) -> None:
    if "events" in data:
        save_json(EVENTS_FILE, data["events"])
    if "equipment" in data:
        save_json(EQUIPMENT_FILE, data["equipment"])
    if "sponsors" in data:
        save_json(SPONSORS_FILE, data["sponsors"])
    if "pages" in data:
        save_json(PAGES_FILE, data["pages"])


def safe_filename(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(name).name)
    return cleaned or "upload.bin"


def save_upload(filename: str, data: bytes) -> str:
    if len(data) > MAX_UPLOAD_BYTES:
        raise ValueError("That photo is too large (20 MB limit).")
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    dest_path = UPLOADS_DIR / f"{uuid.uuid4().hex[:8]}_{safe_filename(filename)}"
    dest_path.write_bytes(data)
    return str(dest_path.relative_to(ROOT)).replace("\\", "/")


def inject_editor(html_text: str) -> str:
    if "/__editor/editor.css" not in html_text:
        html_text = html_text.replace(
            "</head>",
            '  <link rel="stylesheet" href="/__editor/editor.css">\n</head>',
            1,
        )
    if "/__editor/editor.js" not in html_text:
        html_text = html_text.replace(
            "</body>",
            '  <script src="/__editor/editor.js"></script>\n</body>',
            1,
        )
    return html_text


def pick_port(start: int = DEFAULT_PORT, span: int = 20) -> int:
    for port in range(start, start + span):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind(("127.0.0.1", port))
            except OSError:
                continue
            return port
    raise RuntimeError("Could not find a free local port for the editor.")


def resolve_site_path(url_path: str) -> Path | None:
    relative = unquote(url_path.lstrip("/")) or "index.html"
    if relative.endswith("/"):
        relative += "index.html"
    candidate = (ROOT / relative).resolve()
    try:
        candidate.relative_to(ROOT.resolve())
    except ValueError:
        return None
    parts = candidate.relative_to(ROOT.resolve()).parts
    if parts and parts[0] in BLOCKED_PREFIXES:
        return None
    if candidate.suffix.lower() in {".py", ".pyc"}:
        return None
    return candidate


class EditorHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, format: str, *args) -> None:
        sys.stdout.write("%s - %s\n" % (self.address_string(), format % args))

    def send_bytes(self, payload: bytes, content_type: str, status: int = 200) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def send_json(self, data: dict, status: int = 200) -> None:
        self.send_bytes(
            json.dumps(data).encode("utf-8"),
            "application/json; charset=utf-8",
            status,
        )

    def read_body(self, limit: int = MAX_UPLOAD_BYTES) -> bytes:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length > limit:
            raise ValueError("Request is too large.")
        return self.rfile.read(length)

    def serve_editor_asset(self, name: str) -> None:
        if name not in {"editor.css", "editor.js"}:
            self.send_json({"error": "Not found"}, 404)
            return
        path = EDITOR_DIR / name
        if not path.exists():
            self.send_json({"error": f"Missing {name}"}, 404)
            return
        content_type, _ = mimetypes.guess_type(path.name)
        self.send_bytes(path.read_bytes(), content_type or "application/octet-stream")

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/__api/content":
            self.send_json(load_all_content())
            return
        if path.startswith("/__editor/"):
            self.serve_editor_asset(path.removeprefix("/__editor/"))
            return

        target = resolve_site_path(path)
        if target is None or not target.is_file():
            self.send_error(404, "File not found")
            return

        if target.suffix.lower() in {".html", ".htm"}:
            self.send_bytes(inject_editor(target.read_text(encoding="utf-8")).encode("utf-8"), "text/html; charset=utf-8")
            return

        content_type, _ = mimetypes.guess_type(target.name)
        self.send_bytes(target.read_bytes(), content_type or "application/octet-stream")

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        try:
            if path == "/__api/content":
                payload = json.loads(self.read_body(2 * 1024 * 1024).decode("utf-8"))
                save_all_content(payload)
                self.send_json({"ok": True})
                return
            if path == "/__api/save":
                payload = json.loads(self.read_body(2 * 1024 * 1024).decode("utf-8"))
                save_all_content(payload)
                messages = build_site()
                self.send_json({"ok": True, "messages": messages})
                return
            if path == "/__api/upload":
                filename = self.headers.get("X-Filename", "upload.bin")
                rel = save_upload(filename, self.read_body())
                self.send_json({"ok": True, "path": rel})
                return
            if path == "/__api/deploy":
                result = deploy_site()
                self.send_json(result)
                return
        except Exception as exc:
            self.send_json({"error": str(exc)}, 400)
            return
        self.send_json({"error": "Unknown editor action"}, 404)


def launch_editor() -> None:
    port = pick_port()
    url = f"http://127.0.0.1:{port}/index.html"
    server = ThreadingHTTPServer(("127.0.0.1", port), EditorHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(f"AMGT website editor: {url}", flush=True)
    print("Leave this window open. Press Ctrl+C to stop.", flush=True)
    try:
        webbrowser.open(url)
    except Exception:
        print("Open that URL in your browser if it does not launch automatically.", flush=True)
    try:
        thread.join()
    except KeyboardInterrupt:
        print("\nEditor stopped.", flush=True)
    finally:
        server.shutdown()
        server.server_close()


def main() -> int:
    parser = argparse.ArgumentParser(description='AMGT website builder and editor')
    parser.add_argument('--build', action='store_true', help='Rebuild HTML without opening the editor')
    parser.add_argument('--gui', action='store_true', help='Open the local website editor')
    args = parser.parse_args()

    if args.build:
        try:
            messages = build_site()
        except Exception as exc:
            print(f'Build failed: {exc}', file=sys.stderr)
            return 1
        for message in messages:
            print(message)
        return 0

    launch_editor()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
