"""Captures README screenshots and a demo GIF from the dev server in demo mode (?demo)."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image

BASE = "http://localhost:5173"
OUT = Path(__file__).resolve().parent.parent / "docs" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)
DEMO = "?demo=1"

def shot(page, name):
    page.wait_for_timeout(600)
    page.screenshot(path=str(OUT / f"{name}.png"))
    print("saved", name)

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1, color_scheme="dark")
    page = ctx.new_page()
    page.goto(BASE + "/")
    page.wait_for_selector("text=Welcome back")
    shot(page, "login")

    page.goto(BASE + "/" + DEMO)
    page.wait_for_selector("article")
    shot(page, "library")

    page.goto(BASE + "/group/Frontend" + DEMO)
    page.wait_for_selector("article")
    shot(page, "group")

    page.goto(BASE + "/s/s1" + DEMO)
    page.wait_for_timeout(800)
    shot(page, "detail")

    page.goto(BASE + "/admin" + DEMO)
    page.wait_for_timeout(800)
    shot(page, "admin")

    # multi-select flow (also the GIF)
    page.goto(BASE + "/" + DEMO)
    page.wait_for_selector("article")
    frames = []
    def frame(name, ms=900):
        page.wait_for_timeout(300)
        path = OUT / f"_{name}.png"
        page.screenshot(path=str(path))
        frames.append((path, ms))

    frame("g1", 700)
    page.get_by_role("button", name="Select", exact=True).click()
    frame("g2", 700)
    page.locator('article[role="checkbox"]').nth(0).click()
    page.locator('article[role="checkbox"]').nth(2).click()
    page.locator('article[role="checkbox"]').nth(4).click()
    frame("g3", 1200)
    page.goto(BASE + "/group/Frontend" + DEMO)
    page.wait_for_selector("article")
    page.get_by_role("button", name="Select", exact=True).click()
    page.locator('article[role="checkbox"]').nth(0).click()
    frame("g4", 1000)
    shot(page, "selecting")

    page.goto(BASE + "/" + DEMO)
    page.wait_for_selector("article")
    page.get_by_role("button", name="New group").first.click()
    page.wait_for_selector("text=Add existing snippets")
    page.get_by_placeholder("Sorting algorithms").fill("Sorting algorithms")
    page.locator('input[type="checkbox"]').nth(0).check()
    page.locator('input[type="checkbox"]').nth(1).check()
    shot(page, "new-group")

    page.goto(BASE + "/" + DEMO)
    page.wait_for_selector("article")
    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(500)
    shot(page, "mobile")

    browser.close()

# GIF: the multi-select flow, scaled down
gif_frames = []
for path, ms in frames:
    im = Image.open(path).convert("RGB").resize((960, 600))
    gif_frames.append((im, ms))
first, *rest = [f for f, _ in gif_frames]
first.save(OUT / "multi-select.gif", save_all=True, append_images=rest,
           duration=[ms for _, ms in gif_frames], loop=0, optimize=True)
for path, _ in frames:
    path.unlink()
print("saved multi-select.gif")
