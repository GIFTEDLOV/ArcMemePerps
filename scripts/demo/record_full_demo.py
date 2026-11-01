import os
import time
import subprocess
import imageio_ffmpeg
from playwright.sync_api import sync_playwright

CURSOR_SCRIPT = """
(() => {
  function setup() {
    if (document.getElementById('virtual-cursor')) return;
    const cursor = document.createElement('div');
    cursor.id = 'virtual-cursor';
    cursor.innerHTML = `
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.85));">
        <path d="M4 2L10.5 19L13.5 12.5L20 9.5L4 2Z" fill="#ffffff" stroke="#050709" stroke-width="1.8" stroke-linejoin="round"/>
      </svg>
      <div id="virtual-cursor-ripple" style="position: absolute; top: -6px; left: -6px; width: 28px; height: 28px; border-radius: 50%; border: 2.5px solid #00f5a0; opacity: 0; transform: scale(0.5); pointer-events: none;"></div>
    `;
    cursor.style.position = 'fixed';
    cursor.style.zIndex = '99999999';
    cursor.style.pointerEvents = 'none';
    cursor.style.transition = 'left 0.28s cubic-bezier(0.25, 1, 0.5, 1), top 0.28s cubic-bezier(0.25, 1, 0.5, 1)';
    cursor.style.left = '300px';
    cursor.style.top = '150px';
    document.documentElement.appendChild(cursor);
  }

  window.__moveCursor = (x, y) => {
    setup();
    const c = document.getElementById('virtual-cursor');
    if (c) {
      c.style.left = Math.round(x) + 'px';
      c.style.top = Math.round(y) + 'px';
    }
  };

  window.__clickCursor = () => {
    setup();
    const ripple = document.getElementById('virtual-cursor-ripple');
    if (ripple) {
      ripple.style.transition = 'none';
      ripple.style.opacity = '1';
      ripple.style.transform = 'scale(0.4)';
      setTimeout(() => {
        ripple.style.transition = 'transform 0.35s ease-out, opacity 0.35s ease-out';
        ripple.style.transform = 'scale(2.2)';
        ripple.style.opacity = '0';
      }, 20);
    }
  };

  try {
    window.localStorage.setItem('arcmemeperps.risk.accepted', 'true');
  } catch (e) {}

  if (document.body) setup();
  else window.addEventListener('DOMContentLoaded', setup);
})();
"""

def move_cursor_to_coords(page, x, y, wait_ms=300):
    page.evaluate(f"window.__moveCursor({x}, {y})")
    page.wait_for_timeout(wait_ms)

def move_cursor_to_element(page, selector, click=False, wait_ms=300, timeout=1500):
    try:
        el = page.wait_for_selector(selector, state="visible", timeout=timeout)
        if el:
            box = el.bounding_box()
            if box:
                cx = box['x'] + box['width'] / 2
                cy = box['y'] + box['height'] / 2
                page.evaluate(f"window.__moveCursor({cx}, {cy})")
                page.wait_for_timeout(250)
                if click:
                    page.evaluate("window.__clickCursor()")
                    try:
                        el.click(timeout=1000)
                    except:
                        pass
                    page.wait_for_timeout(wait_ms)
                return True
    except Exception as e:
        pass
    return False

def smooth_scroll(page, delta_y, steps=8, interval=40):
    step_y = delta_y / steps
    for _ in range(steps):
        page.evaluate(f"window.scrollBy(0, {step_y})")
        page.wait_for_timeout(interval)

def sync_scene_time(scene_name, start_time, target_duration, page):
    elapsed = time.time() - start_time
    remaining = target_duration - elapsed
    print(f"[{scene_name}] Elapsed: {elapsed:.2f}s, Target: {target_duration:.2f}s, Remaining: {remaining:.2f}s")
    if remaining > 0:
        page.wait_for_timeout(int(remaining * 1000))

def record_demo():
    video_dir = os.path.abspath("scripts/demo/demo_video_raw")
    os.makedirs(video_dir, exist_ok=True)
    for old_file in os.listdir(video_dir):
        try:
            os.remove(os.path.join(video_dir, old_file))
        except:
            pass
    
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            headless=True
        )
        context = browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            record_video_dir=video_dir,
            record_video_size={'width': 1920, 'height': 1080}
        )
        context.add_init_script(CURSOR_SCRIPT)
        page = context.new_page()

        # ==========================================
        # SCENE 1: OFFICIAL LANDING PAGE (30.14s)
        # ==========================================
        s1_start = time.time()
        print("Starting Scene 1: Official Landing Page (/landing) (30.14s)...")
        page.goto("https://cluster-terminal.vercel.app/landing", wait_until="domcontentloaded")
        page.wait_for_timeout(1000)
        
        # 0s - 5s: Gliding across floating navigation
        move_cursor_to_coords(page, 240, 28, wait_ms=600)
        move_cursor_to_coords(page, 380, 28, wait_ms=600)
        move_cursor_to_coords(page, 450, 28, wait_ms=600)
        move_cursor_to_coords(page, 520, 28, wait_ms=600)
        move_cursor_to_coords(page, 640, 28, wait_ms=800)

        # 5s - 14s: Tracing Hero Headline & Subtitle
        move_cursor_to_coords(page, 960, 220, wait_ms=1200)
        move_cursor_to_coords(page, 960, 290, wait_ms=1200)
        move_cursor_to_coords(page, 960, 390, wait_ms=1200)

        # 14s - 22s: Smooth scroll down to explore live preview cards & stats
        smooth_scroll(page, 480, steps=10, interval=40)
        page.wait_for_timeout(800)
        move_cursor_to_coords(page, 500, 420, wait_ms=800)
        move_cursor_to_coords(page, 800, 420, wait_ms=800)
        move_cursor_to_coords(page, 1100, 420, wait_ms=800)

        # 22s - 26s: Smooth scroll back up to hero
        smooth_scroll(page, -480, steps=10, interval=35)
        page.wait_for_timeout(600)
        
        # 26s - 30.14s: Move to "Launch Memes Terminal" CTA and click
        move_cursor_to_coords(page, 860, 520, wait_ms=800)
        page.evaluate("window.__clickCursor()")
        page.wait_for_timeout(400)
        page.evaluate("""(() => {
            const btn = document.querySelector('a[href="/memes"], a[href="/markets"], .launch-btn');
            if (btn) btn.click();
        })()""")
        page.wait_for_timeout(600)
        
        sync_scene_time("Scene 1", s1_start, 30.14, page)

        # ==========================================
        # SCENE 2: MEMES TRENCHES TAB (23.81s)
        # ==========================================
        s2_start = time.time()
        print("Starting Scene 2: Memes Trenches Tab (/memes) (23.81s)...")
        if "/memes" not in page.url:
            page.goto("https://cluster-terminal.vercel.app/memes", wait_until="domcontentloaded")
        page.wait_for_timeout(800)

        # 0s - 5s: Highlight active "Memes" nav pill & feed header
        move_cursor_to_coords(page, 220, 25, wait_ms=800)
        move_cursor_to_coords(page, 450, 80, wait_ms=800)

        # 5s - 13s: Sweeping across live meme rows & liquidity badges
        move_cursor_to_coords(page, 450, 160, wait_ms=1000)
        move_cursor_to_coords(page, 850, 160, wait_ms=1000)
        move_cursor_to_coords(page, 1250, 160, wait_ms=1000)
        move_cursor_to_coords(page, 450, 240, wait_ms=1000)

        # 13s - 19s: Scroll down to reveal mempool depth, then scroll back up
        smooth_scroll(page, 280, steps=8, interval=40)
        page.wait_for_timeout(800)
        move_cursor_to_coords(page, 850, 350, wait_ms=1000)
        smooth_scroll(page, -280, steps=8, interval=35)
        page.wait_for_timeout(600)

        # 19s - 23.81s: Move to "Trending" tab in header and click
        move_cursor_to_element(page, "nav a[href='/trending'], header a:has-text('Trending')", click=True, wait_ms=1000)
        
        sync_scene_time("Scene 2", s2_start, 23.81, page)

        # ==========================================
        # SCENE 3: TRENDING TAB -> MARKETS (15.96s)
        # ==========================================
        s3_start = time.time()
        print("Starting Scene 3: Trending Tab -> Markets (15.96s)...")
        if "/trending" not in page.url:
            page.goto("https://cluster-terminal.vercel.app/trending", wait_until="domcontentloaded")
        page.wait_for_timeout(800)

        # 0s - 5s: Highlight active Trending tab
        move_cursor_to_coords(page, 280, 25, wait_ms=600)
        move_cursor_to_coords(page, 450, 150, wait_ms=800)

        # 5s - 11s: Sweep over top gainers & volume columns
        move_cursor_to_coords(page, 850, 150, wait_ms=800)
        move_cursor_to_coords(page, 1250, 150, wait_ms=800)
        move_cursor_to_coords(page, 450, 220, wait_ms=800)

        # 11s - 15.96s: Move to "Markets" tab in header and click
        move_cursor_to_element(page, "nav a[href='/markets'], header a:has-text('Markets')", click=True, wait_ms=1000)

        sync_scene_time("Scene 3", s3_start, 15.96, page)

        # ==========================================
        # SCENE 4: INTERACTIVE ONBOARDING TOUR (27.50s)
        # ==========================================
        s4_start = time.time()
        print("Starting Scene 4: Interactive Onboarding Tour (27.50s)...")
        if "/markets" not in page.url:
            page.goto("https://cluster-terminal.vercel.app/markets", wait_until="domcontentloaded")
        page.wait_for_timeout(800)

        # Dispatch tour trigger event
        page.evaluate('window.dispatchEvent(new CustomEvent("arcmemeperps:start_tour"))')
        page.wait_for_timeout(1000)

        # 0s - 6s: Spotlight on Step 1 (Chain Identity & Solvency Hub)
        move_cursor_to_coords(page, 150, 25, wait_ms=1000)
        move_cursor_to_coords(page, 320, 240, wait_ms=1200)

        # 6s - 12s: Click "Next →" to advance to Step 2 (Navigation Bar)
        move_cursor_to_element(page, ".tour-next-btn, .tour-card button:has-text('Next')", click=True, wait_ms=1000)
        page.wait_for_timeout(600)
        move_cursor_to_coords(page, 320, 25, wait_ms=1000)
        move_cursor_to_coords(page, 320, 260, wait_ms=1200)

        # 12s - 18s: Click "Next →" to advance to Step 3 (Quick Search)
        move_cursor_to_element(page, ".tour-next-btn, .tour-card button:has-text('Next')", click=True, wait_ms=1000)
        page.wait_for_timeout(600)
        move_cursor_to_coords(page, 720, 25, wait_ms=1000)
        move_cursor_to_coords(page, 720, 260, wait_ms=1200)

        # 18s - 23s: Click "Next →" to advance to Step 4 (Order Rail)
        move_cursor_to_element(page, ".tour-next-btn, .tour-card button:has-text('Next')", click=True, wait_ms=1000)
        page.wait_for_timeout(600)
        move_cursor_to_coords(page, 1600, 300, wait_ms=1200)

        # 23s - 27.50s: Click "Start Trading" or "Skip" to complete tour cleanly
        move_cursor_to_element(page, ".tour-card button:has-text('Start'), .tour-card button:has-text('Skip'), .tour-next-btn", click=True, wait_ms=1000)

        sync_scene_time("Scene 4", s4_start, 27.50, page)

        # ==========================================
        # SCENE 5: MARKETS DIRECTORY & ANTI-RUG (25.42s)
        # ==========================================
        s5_start = time.time()
        print("Starting Scene 5: Markets Directory & Anti-Rug (25.42s)...")
        if "/markets" not in page.url:
            page.goto("https://cluster-terminal.vercel.app/markets", wait_until="domcontentloaded")
        page.wait_for_timeout(800)

        # 0s - 7s: Instant search typing "BSW" and clearing
        move_cursor_to_element(page, "input[placeholder*='Search'], .global-search input, .toolbar-search input", click=True, wait_ms=300)
        page.keyboard.type("BSW", delay=90)
        page.wait_for_timeout(1000)
        for _ in range(3):
            page.keyboard.press("Backspace")
            page.wait_for_timeout(70)
        page.wait_for_timeout(500)

        # 7s - 13s: Quick-filters "Hot" and "Gainers"
        move_cursor_to_element(page, "button:has-text('Hot'), .category-bar button:nth-child(2)", click=True, wait_ms=800)
        move_cursor_to_element(page, "button:has-text('Gainers'), .category-bar button:nth-child(3)", click=True, wait_ms=800)

        # 13s - 19s: Sweep across row metrics and 5-Gate Anti-Rug status
        move_cursor_to_coords(page, 450, 260, wait_ms=700)
        move_cursor_to_coords(page, 800, 260, wait_ms=700)
        move_cursor_to_coords(page, 1200, 260, wait_ms=700)

        # 19s - 25.42s: Click first token row link to enter Token Detail
        move_cursor_to_element(page, ".market-row-link:first-child, tr.token-row:first-child, table tbody tr:first-child, a[href*='/markets/']", click=True, wait_ms=1200)

        sync_scene_time("Scene 5", s5_start, 25.42, page)

        # ==========================================
        # SCENE 6: TOKEN DETAIL & RISK PASSPORT (26.66s)
        # ==========================================
        s6_start = time.time()
        print("Starting Scene 6: Token Detail & Risk Passport (26.66s)...")
        if "/markets/0x4152433a" not in page.url and "/markets/arc-1" not in page.url:
            page.goto("https://cluster-terminal.vercel.app/markets/0x4152433a30783939393939393939393939393939393939393939393939393939", wait_until="domcontentloaded")
        page.wait_for_timeout(1000)

        # 0s - 6s: Token header chip & copy address
        move_cursor_to_coords(page, 240, 85, wait_ms=800)
        move_cursor_to_element(page, ".token-bar-copy, .copy-button", click=True, wait_ms=800)
        move_cursor_to_coords(page, 450, 85, wait_ms=600)

        # 6s - 13s: Candlestick chart exploration
        move_cursor_to_coords(page, 550, 240, wait_ms=1000)
        move_cursor_to_coords(page, 750, 320, wait_ms=1000)
        move_cursor_to_coords(page, 350, 420, wait_ms=1000)

        # 13s - 19s: Scroll down to Anti-Rug Risk Passport
        smooth_scroll(page, 400, steps=8, interval=40)
        page.wait_for_timeout(800)
        move_cursor_to_coords(page, 320, 340, wait_ms=800)
        move_cursor_to_coords(page, 320, 400, wait_ms=800)

        # 19s - 23s: Highlight Rule 1, 4, 5 (USDC Custody)
        move_cursor_to_coords(page, 320, 460, wait_ms=800)
        move_cursor_to_coords(page, 320, 520, wait_ms=800)

        # 23s - 26.66s: Scroll back up to trading rail
        smooth_scroll(page, -400, steps=8, interval=35)
        page.wait_for_timeout(800)

        sync_scene_time("Scene 6", s6_start, 26.66, page)

        # ==========================================
        # SCENE 7: TRADE EXECUTION & PNL BRAG CARD (26.83s)
        # ==========================================
        s7_start = time.time()
        print("Starting Scene 7: Trade Execution & PnL Brag Card (26.83s)...")
        # 0s - 5s: Move to trade rail & select LONG
        move_cursor_to_coords(page, 1650, 140, wait_ms=600)
        move_cursor_to_element(page, "button:has-text('Long'), .side-btn.long, button:has-text('LONG')", click=True, wait_ms=600)

        # 5s - 9s: 5x leverage & input 50 USDC
        move_cursor_to_element(page, "button:has-text('5x'), .leverage-btn:has-text('5x')", click=True, wait_ms=600)
        move_cursor_to_element(page, ".field input, input[type='number']", click=True, wait_ms=300)
        page.keyboard.type("50", delay=80)
        page.wait_for_timeout(600)

        # 9s - 14s: TP (+50%) & SL (-20%) toggles & liquidation price
        move_cursor_to_element(page, "button:has-text('+50%'), button:has-text('50%')", click=True, wait_ms=600)
        move_cursor_to_element(page, "button:has-text('-20%'), button:has-text('20%')", click=True, wait_ms=600)
        move_cursor_to_coords(page, 1650, 440, wait_ms=800)

        # 14s - 18s: Click "Open Long Position"
        move_cursor_to_element(page, ".trade-action-btn, button:has-text('Open Long'), button:has-text('Submit')", click=True, wait_ms=1200)

        # 18s - 22s: Scroll down to active position & click "Share"
        smooth_scroll(page, 280, steps=6, interval=40)
        page.wait_for_timeout(600)
        move_cursor_to_element(page, "button:has-text('Positions'), .panel-heading button:has-text('Open Positions')", click=True, wait_ms=600)
        move_cursor_to_coords(page, 350, 480, wait_ms=800)
        move_cursor_to_element(page, "button:has-text('Share'), .share-pnl-btn, button[title*='Share']", click=True, wait_ms=1000)
        page.wait_for_timeout(600)

        # 22s - 26.83s: Explore PnL Brag Card Modal & Close
        move_cursor_to_coords(page, 960, 360, wait_ms=800)
        move_cursor_to_coords(page, 960, 500, wait_ms=800)
        move_cursor_to_element(page, ".modal-close, button:has-text('✕'), button:has-text('Close')", click=True, wait_ms=600)
        smooth_scroll(page, -280, steps=6, interval=35)
        page.wait_for_timeout(600)

        sync_scene_time("Scene 7", s7_start, 26.83, page)

        # ==========================================
        # SCENE 8: COMPETITIONS & PROTOCOL PROOF TABS (21.65s)
        # ==========================================
        s8_start = time.time()
        print("Starting Scene 8: Competitions & Protocol Proof Tabs (21.65s)...")
        # 0s - 4s: Click Competitions tab in top nav
        page.goto("https://cluster-terminal.vercel.app/competitions", wait_until="domcontentloaded")
        page.wait_for_timeout(800)

        # 4s - 10s: Highlight Championship title, $25,000 prize pool, & leaderboard
        move_cursor_to_coords(page, 500, 100, wait_ms=800)
        move_cursor_to_coords(page, 850, 100, wait_ms=800)
        move_cursor_to_coords(page, 500, 220, wait_ms=800)
        move_cursor_to_coords(page, 850, 220, wait_ms=800)

        # 10s - 14s: Move to "Proof" tab in header and click
        page.goto("https://cluster-terminal.vercel.app/proof", wait_until="domcontentloaded")
        page.wait_for_timeout(800)

        # 14s - 21.65s: Highlight Solvency Ledger & USDC physical custody
        move_cursor_to_coords(page, 450, 100, wait_ms=800)
        move_cursor_to_coords(page, 850, 100, wait_ms=800)
        move_cursor_to_coords(page, 450, 220, wait_ms=800)
        move_cursor_to_coords(page, 850, 220, wait_ms=800)

        sync_scene_time("Scene 8", s8_start, 21.65, page)

        # ==========================================
        # SCENE 9: PUBLIC LP VAULT & PROFILE (25.82s)
        # ==========================================
        s9_start = time.time()
        print("Starting Scene 9: Public LP Vault & Profile (25.82s)...")
        # 0s - 4s: Click ALP Earn / Vault in top nav
        page.goto("https://cluster-terminal.vercel.app/vault", wait_until="domcontentloaded")
        page.wait_for_timeout(800)

        # 4s - 11s: Highlight ALP NAV, 18.4% APY, and capital split
        move_cursor_to_coords(page, 320, 80, wait_ms=800)
        move_cursor_to_coords(page, 550, 80, wait_ms=800)
        move_cursor_to_coords(page, 260, 160, wait_ms=800)
        move_cursor_to_coords(page, 650, 160, wait_ms=800)
        move_cursor_to_coords(page, 1050, 160, wait_ms=800)

        # 11s - 15s: Move to Profile in top nav
        page.goto("https://cluster-terminal.vercel.app/profile", wait_until="domcontentloaded")
        page.wait_for_timeout(800)

        # 15s - 20s: Switch to "Avatars & Persona" tab and select an avatar
        move_cursor_to_element(page, "button:has-text('Avatars'), .profile-tab-btn:nth-child(2)", click=True, wait_ms=800)
        page.wait_for_timeout(600)
        move_cursor_to_coords(page, 220, 260, wait_ms=500)
        move_cursor_to_coords(page, 420, 260, wait_ms=400)
        page.evaluate("window.__clickCursor()")
        page.wait_for_timeout(600)

        # 20s - 25.82s: Switch to "Trading Defaults", select 5x, & final wave
        move_cursor_to_element(page, "button:has-text('Defaults'), .profile-tab-btn:nth-child(4)", click=True, wait_ms=800)
        page.wait_for_timeout(600)
        move_cursor_to_element(page, ".profile-content-panel button:has-text('5x')", click=True, wait_ms=500)
        move_cursor_to_coords(page, 960, 300, wait_ms=500)
        move_cursor_to_coords(page, 1020, 280, wait_ms=400)
        move_cursor_to_coords(page, 900, 280, wait_ms=400)
        move_cursor_to_coords(page, 960, 290, wait_ms=800)

        sync_scene_time("Scene 9", s9_start, 25.82, page)

        print("Recording complete! Closing context...")
        context.close()
        browser.close()

    print("Raw video recorded successfully!")

if __name__ == "__main__":
    record_demo()
