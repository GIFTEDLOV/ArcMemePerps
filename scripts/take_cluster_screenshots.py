import os
import shutil
from playwright.sync_api import sync_playwright

OUT_DIR = os.path.abspath("docs/assets/cluster")
os.makedirs(OUT_DIR, exist_ok=True)

# Copy logo
shutil.copyfile("apps/frontend/public/favicon.svg", os.path.join(OUT_DIR, "logo.svg"))
print("Copied logo to docs/assets/cluster/logo.svg", flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path=r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        headless=True
    )
    context = browser.new_context(
        viewport={'width': 1540, 'height': 920},
        device_scale_factor=1.5
    )
    
    context.add_init_script("""
        try {
            window.localStorage.setItem('arcmemeperps.risk.accepted', 'true');
            window.localStorage.setItem('arcmemeperps.risk_ack_agreed', 'true');
            window.localStorage.setItem('arcmemeperps.tour_done.default', 'true');
            window.localStorage.setItem('arcmemeperps.tour_done.0xb65685037041ff56574a53fc49b1f5db88abe043', 'true');
        } catch(e) {}
    """)

    page = context.new_page()
    BASE_URL = "https://cluster-terminal.vercel.app"

    scenes = [
        ("landing.png", f"{BASE_URL}/landing", 2000, "1. Landing Page"),
        ("trenches.png", f"{BASE_URL}/", 2500, "2. Trenches & Discovery"),
        ("markets.png", f"{BASE_URL}/markets", 2500, "3. Markets Explorer Table"),
        ("terminal.png", f"{BASE_URL}/markets/arc-arc", 4000, "4. Token Trading Terminal"),
        ("portfolio.png", f"{BASE_URL}/portfolio", 2500, "5. Portfolio Management"),
        ("profile.png", f"{BASE_URL}/profile", 2500, "6. Trader Profile Page"),
        ("proof.png", f"{BASE_URL}/proof", 2500, "7. Proof & Solvency Ledger"),
        ("activity.png", f"{BASE_URL}/activity", 2500, "8. Activity Ledger"),
        ("counterparty-vault.png", f"{BASE_URL}/earn", 2500, "9. Counterparty ALP Vault (Earn)"),
    ]

    for filename, url, wait_ms, label in scenes:
        print(f"Capturing {label} ({filename})...", flush=True)
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=20000)
            page.wait_for_timeout(wait_ms)
            page.screenshot(path=os.path.join(OUT_DIR, filename))
            print(f"  [OK] Saved {filename}", flush=True)
        except Exception as e:
            print(f"  Error on {filename}: {e}", flush=True)

    # Now capture Risk Passport specifically on the terminal page
    print("Capturing Risk Passport tab (risk-passport.png)...", flush=True)
    try:
        page.goto(f"{BASE_URL}/markets/arc-arc", wait_until="domcontentloaded", timeout=20000)
        page.wait_for_timeout(2500)
        # Click on "Risk" or "Overview" tab in the evidence section
        risk_tab = page.query_selector("button:has-text('Risk')")
        if risk_tab:
            risk_tab.click()
            page.wait_for_timeout(1500)
        page.screenshot(path=os.path.join(OUT_DIR, "risk-passport.png"))
        print("  [OK] Saved risk-passport.png", flush=True)
    except Exception as e:
        print(f"  Error on risk-passport: {e}", flush=True)

    browser.close()
    print("ALL SCREENSHOTS CAPTURED PERFECTLY!", flush=True)
