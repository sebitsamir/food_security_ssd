"""End-to-end smoke test against a running stack (API on :8000, web on :3000).

    pip install playwright && playwright install chromium
    python scripts/e2e_smoke.py [base_url]

Drives every screen and feature in a real browser, including PDF/CSV downloads, and fails
loudly on any console error or horizontal overflow.
"""
import re
import sys

from playwright.sync_api import Page, expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
errors: list[str] = []
passed = 0


def check(name: str, ok: bool, detail: str = "") -> None:
    global passed
    if not ok:
        raise AssertionError(f"FAIL: {name} {detail}")
    passed += 1
    print(f"  ok  {name}")


def new_page(browser, w=1366, h=900, scheme="dark") -> Page:
    ctx = browser.new_context(viewport={"width": w, "height": h}, color_scheme=scheme, accept_downloads=True)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"console: {m.text}") if m.type == "error" else None)
    return page


def visit(page: Page, path: str, ready: str) -> None:
    """Pages stream in (loading skeleton first), so wait for real content, not just `load`."""
    page.goto(BASE + path)
    page.wait_for_selector(ready, timeout=15000)


def download(page: Page, click) -> bytes:
    with page.expect_download() as d:
        click()
    with open(d.value.path(), "rb") as f:
        return f.read()


def run() -> None:
    with sync_playwright() as p:
        b = p.chromium.launch()

        print("Overview")
        pg = new_page(b)
        visit(pg, "/", "[data-testid^=area-]")
        check("10 states drawn", pg.locator("[data-testid^=area-]").count() == 10)
        check("hero heading", "South Sudan food security intelligence" in pg.locator("h1").inner_text())
        check("state card shown", pg.get_by_role("complementary", name=re.compile("summary")).count() == 1)
        stats = pg.get_by_role("list").first
        check("metrics strip", pg.get_by_text("Expanding window").count() == 1 and pg.get_by_text("ROC-AUC").count() >= 1)
        pg.locator("[data-testid^=area-]").nth(2).click()
        check("selecting a state updates the card", pg.get_by_role("link", name=re.compile(r"^All \d+ counties")).count() == 1)
        pg.get_by_role("link", name=re.compile(r"^All \d+ counties")).click()
        pg.wait_for_url(re.compile(r"/forecasts\?state="))
        check("state link filters forecasts", pg.locator("select[aria-label=State]").input_value().startswith("DEV"))

        print("Theme")
        visit(pg, "/", "[data-testid^=area-]")
        pg.get_by_role("button", name="Switch to light theme").click()
        pg.reload()
        check("theme persists across reload", pg.evaluate("document.documentElement.dataset.theme") == "light")
        pg.get_by_role("button", name="Switch to dark theme").click()

        print("Predict")
        visit(pg, "/predict", "#f-population")
        check("form prefilled from county", pg.get_by_label("Population").input_value() != "")
        pg.get_by_label("Population").fill("0")
        pg.get_by_role("button", name="Run prediction").click()
        check("inline validation", pg.get_by_role("alert").filter(has_text="between 1").count() == 1)
        pg.get_by_label("State").select_option(index=2)
        pg.get_by_role("button", name="Run prediction").click()
        pg.get_by_role("region", name="Prediction result").get_by_role("img").first.wait_for()
        pg.wait_for_timeout(1300)
        res = pg.get_by_role("region", name="Prediction result")
        check("result with gauge", re.search(r"Risk probability \d+\.\d%", res.get_by_role("img").first.get_attribute("aria-label")) is not None)
        check("model comparison", res.get_by_text("C = 100").count() == 1)
        res.get_by_role("button", name=re.compile("Export")).click()
        pdf = download(pg, lambda: pg.get_by_role("menuitem", name=re.compile("PDF")).click())
        check("prediction PDF downloads", pdf.startswith(b"%PDF-1.4") and pdf.rstrip().endswith(b"%%EOF"), str(len(pdf)))
        pg.get_by_role("button", name="Run prediction").click()
        pg.wait_for_timeout(1500)
        check("session history lists runs", pg.get_by_role("region", name="Runs this session").get_by_role("row").count() == 3)
        pg.get_by_role("region", name="Runs this session").get_by_role("button", name=re.compile("Export")).click()
        csv = download(pg, lambda: pg.get_by_role("menuitem", name=re.compile("CSV")).click())
        check("history CSV downloads", csv.startswith(b"\xef\xbb\xbfprediction_id,") and csv.count(b"\r\n") == 3)

        print("Forecasts")
        visit(pg, "/forecasts", "tbody tr")
        check("10 rows per page", pg.locator("tbody tr").count() == 10)
        pg.get_by_role("button", name="High").click()
        pg.wait_for_url(re.compile("band=high"))
        check("band filter is in the URL", "band=high" in pg.url)
        pg.get_by_role("button", name="All", exact=True).click()
        pg.get_by_label("Search county").fill("akob")
        pg.wait_for_url(re.compile("q=akob"))
        check("search filters", pg.locator("tbody tr").count() == 1)
        pg.get_by_label("Search county").fill("")
        pg.wait_for_url(re.compile(r"/forecasts(\?period=.*)?$"))
        pg.get_by_role("button", name="Next").click()
        pg.wait_for_url(re.compile("page=2"))
        check("pagination", "11–20" in pg.get_by_label("Pagination").inner_text())
        pg.get_by_role("button", name=re.compile("^County")).click()
        pg.wait_for_url(re.compile("sort=county"))
        pg.get_by_role("button", name=re.compile("Export")).click()
        csv = download(pg, lambda: pg.get_by_role("menuitem", name=re.compile("CSV")).click())
        check("forecast CSV has all 79 rows", csv.count(b"\r\n") == 80)
        pg.get_by_role("button", name=re.compile("Export")).click()
        pdf = download(pg, lambda: pg.get_by_role("menuitem", name=re.compile("PDF")).click())
        m = re.search(rb"/Count (\d+)", pdf)
        check("forecast PDF spans several pages", m is not None and int(m.group(1)) >= 3 and pdf.rstrip().endswith(b"%%EOF"))
        pg.get_by_role("button", name="Map").click()
        pg.wait_for_selector("[data-testid^=area-]")
        check("map view", pg.locator("[data-testid^=area-]").count() == 10)

        print("Counties")
        visit(pg, "/counties", "ul[aria-label=Counties] a")
        check("county list", pg.get_by_role("list", name="Counties").get_by_role("link").count() == 79)
        pg.get_by_role("list", name="Counties").get_by_role("link").nth(3).click()
        pg.wait_for_url(re.compile(r"/counties/DEV"))
        check("county has its own URL and profile", pg.locator("h2").first.inner_text() != "" and "Rank" in pg.content())
        check("history chart", pg.get_by_role("img", name=re.compile("Observed Phase 3")).count() == 1)
        pg.get_by_role("link", name="Open in Predict").click()
        pg.wait_for_url(re.compile(r"/predict\?county=DEV"))
        check("Open in Predict preselects the county", pg.get_by_label("County").input_value().startswith("DEV"))
        pg.goto(f"{BASE}/counties/NOPE")
        pg.wait_for_selector("text=Page not found", timeout=15000)
        check("unknown county -> not found page", pg.get_by_text("Page not found").count() == 1)

        print("Model + Methodology")
        visit(pg, "/model", "text=Mean AUC")
        check("model stats", pg.get_by_text("Mean AUC").count() == 1)
        check("fold chart", pg.get_by_role("img", name=re.compile("ROC-AUC across 9")).count() == 1)
        visit(pg, "/methodology", "details")
        check("methodology accordion", pg.locator("details").count() == 11)

        print("Responsive: no horizontal overflow, nav usable")
        routes = ["/", "/predict", "/forecasts", "/counties", "/counties/DEV0301", "/model", "/methodology"]
        for w, h in [(320, 640), (390, 844), (430, 932), (768, 1024), (820, 1180), (1024, 768), (1366, 768), (1920, 1080)]:
            page = new_page(b, w, h)
            for r in routes:
                page.goto(BASE + r)
                page.wait_for_selector("main h1, main h2", timeout=15000)
                page.wait_for_timeout(300)
                over = page.evaluate("document.documentElement.scrollWidth - innerWidth")
                check(f"{w}px {r}", over <= 0, f"overflow {over}px")
            page.context.close()

        pm = new_page(b, 390, 844)
        visit(pm, "/", "[data-testid^=area-]")
        pm.get_by_role("button", name="Menu").click()
        pm.locator("#mobile-nav").get_by_role("link", name="Forecasts").click()
        pm.wait_for_url(re.compile("/forecasts"))
        check("mobile menu navigates", True)
        visit(pm, "/counties", "ul[aria-label=Counties] a")
        check("phone shows list first", pm.get_by_role("list", name="Counties").is_visible())
        pm.get_by_role("list", name="Counties").get_by_role("link").first.click()
        pm.wait_for_url(re.compile(r"/counties/DEV"))
        check("phone shows detail, list hidden", not pm.get_by_role("list", name="Counties").is_visible())
        pm.get_by_role("link", name="Counties").first.click()

        b.close()

    check("no console or page errors", not errors, "; ".join(errors[:3]))
    print(f"\nALL {passed} CHECKS PASSED")


if __name__ == "__main__":
    run()
