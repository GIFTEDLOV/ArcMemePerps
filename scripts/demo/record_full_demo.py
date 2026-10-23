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
    cursor.style.transition = 'left 0.26s cubic-bezier(0.25, 1, 0.5, 1), top 0.26s cubic-bezier(0.25, 1, 0.5, 1)';
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
    video_dir = os.path.abspath("demo_video_raw")
    os.makedirs(video_dir, exist_ok=True)
    
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
        # SCENE 1: LANDING PAGE (29.23s)
        # ==========================================
        s1_start = time.time()
        print("Starting Scene 1: Landing Page (29.23s)...")
        page.goto("https://cluster-terminal.vercel.app", wait_until="domcontentloaded")
        page.wait_for_timeout(1000)
        
        # Cursor explores header navigation
        move_cursor_to_coords(page, 200, 45, wait_ms=400)
        move_cursor_to_coords(page, 750, 45, wait_ms=500)
        move_cursor_to_coords(page, 900, 45, wait_ms=500)
        move_cursor_to_coords(page, 1750, 45, wait_ms=600)

        # Move to Hero Title & Tagline
        move_cursor_to_coords(page, 480, 320, wait_ms=800)
        move_cursor_to_coords(page, 420, 440, wait_ms=800)

        # Move to ticker section
        move_cursor_to_coords(page, 960, 520, wait_ms=800)

        # Smooth scroll down to explore features & stats
        smooth_scroll(page, 420, steps=8, interval=50)
        page.wait_for_timeout(800)
        move_cursor_to_coords(page, 600, 400, wait_ms=600)
        move_cursor_to_coords(page, 1200, 420, wait_ms=600)

        smooth_scroll(page, 480, steps=8, interval=50)
        page.wait_for_timeout(800)
        move_cursor_to_coords(page, 800, 500, wait_ms=800)

        # Scroll back to hero CTA
        smooth_scroll(page, -900, steps=10, interval=45)
        page.wait_for_timeout(600)
        
        # Move to CTA button and click
        move_cursor_to_coords(page, 420, 530, wait_ms=500)
        page.evaluate("window.__clickCursor()")
        page.wait_for_timeout(400)
        
        sync_scene_time("Scene 1", s1_start, 29.23, page)

        # ==========================================
        # SCENE 2: FIRST-TIME WALLET & TOUR (24.02s)
        # ==========================================
        s2_start = time.time()
        print("Starting Scene 2: Interactive Visual Tour (24.02s)...")
        page.goto("https://cluster-terminal.vercel.app/markets", wait_until="domcontentloaded")
        page.wait_for_timeout(800)

        # Connect wallet button
        move_cursor_to_coords(page, 1750, 35, wait_ms=500)
        page.evaluate("window.__clickCursor()")
        page.wait_for_timeout(600)
        
        # Trigger the visual onboarding tour
        page.evaluate("window.triggerAppTour ? window.triggerAppTour() : null")
        page.wait_for_timeout(1200)

        # Point to Spotlight Card 1 (Navigation & Ticker)
        move_cursor_to_coords(page, 960, 360, wait_ms=1200)
        move_cursor_to_coords(page, 960, 420, wait_ms=1000)
        
        # Click "Next" in the Tour Modal
        move_cursor_to_element(page, ".tour-modal button:has-text('Next'), button:has-text('Next')", click=True, wait_ms=1200)
        
        # Point to Spotlight Card 2 (Chart / Risk Passport)
        move_cursor_to_coords(page, 650, 480, wait_ms=1400)
        move_cursor_to_coords(page, 720, 540, wait_ms=1000)

        # Click "Next" again
        move_cursor_to_element(page, ".tour-modal button:has-text('Next'), button:has-text('Next')", click=True, wait_ms=1200)
        
        # Point to Spotlight Card 3 (Order Rail)
        move_cursor_to_coords(page, 1500, 350, wait_ms=1200)
        
        # Click "Start Trading" or "Skip" to complete tour
        move_cursor_to_element(page, ".tour-modal button:has-text('Start'), .tour-modal button:has-text('Done'), .tour-modal button:has-text('Skip')", click=True, wait_ms=1200)
        
        sync_scene_time("Scene 2", s2_start, 24.02, page)

        # ==========================================
        # SCENE 3: MARKETS TERMINAL (23.38s)
        # ==========================================
        s3_start = time.time()
        print("Starting Scene 3: Markets Terminal (23.38s)...")
        page.goto("https://cluster-terminal.vercel.app/markets", wait_until="domcontentloaded")
        page.wait_for_timeout(1000)

        # Move to Search Input
        move_cursor_to_element(page, "input[placeholder*='Search'], .global-search input, .toolbar-search input", click=True, wait_ms=300)
        page.keyboard.type("BSW", delay=100)
        page.wait_for_timeout(1000)

        # Backspace search
        for _ in range(3):
            page.keyboard.press("Backspace")
            page.wait_for_timeout(80)
        page.wait_for_timeout(600)

        # Click Category Filters
        move_cursor_to_element(page, "button:has-text('Hot'), .category-bar button:nth-child(2)", click=True, wait_ms=800)
        move_cursor_to_element(page, "button:has-text('Gainers'), .category-bar button:nth-child(3)", click=True, wait_ms=800)

        # Move across market rows to highlight volume & anti-rug safety
        move_cursor_to_coords(page, 450, 260, wait_ms=600)
        move_cursor_to_coords(page, 800, 260, wait_ms=600)
        move_cursor_to_coords(page, 1200, 260, wait_ms=600)

        # Click the first token row to enter Token Detail
        move_cursor_to_element(page, ".market-row-link:first-child, tr.token-row:first-child, table tbody tr:first-child, a[href*='/markets/']", click=True, wait_ms=1200)

        sync_scene_time("Scene 3", s3_start, 23.38, page)

        # ==========================================
        # SCENE 4: TOKEN DETAIL & CHART & RISK PASSPORT (29.06s)
        # ==========================================
        s4_start = time.time()
        print("Starting Scene 4: Token Detail & Chart (29.06s)...")
        if "/markets/arc-1" not in page.url:
            page.goto("https://cluster-terminal.vercel.app/markets/arc-1", wait_until="domcontentloaded")
        page.wait_for_timeout(1200)

        # Highlight GMGN Header
        move_cursor_to_coords(page, 240, 85, wait_ms=800)
        
        # Click copy contract chip
        move_cursor_to_element(page, ".token-bar-copy, .copy-button", click=True, wait_ms=800)

        # Hover social badges
        move_cursor_to_coords(page, 380, 85, wait_ms=600)
        move_cursor_to_coords(page, 460, 85, wait_ms=600)

        # Explore DexScreener Chart area
        move_cursor_to_coords(page, 550, 220, wait_ms=1000)
        move_cursor_to_coords(page, 750, 320, wait_ms=1000)
        move_cursor_to_coords(page, 320, 440, wait_ms=800)

        # Scroll down to Risk Passport
        smooth_scroll(page, 350, steps=8, interval=40)
        page.wait_for_timeout(800)

        # Highlight unjammed Risk Passport rows
        move_cursor_to_coords(page, 320, 380, wait_ms=800)
        move_cursor_to_coords(page, 320, 440, wait_ms=800)
        move_cursor_to_coords(page, 320, 500, wait_ms=800)
        
        # Click to expand detail evidence
        move_cursor_to_element(page, ".passport-row:first-child, .passport-head", click=True, wait_ms=1000)

        # Highlight Evidence Coverage 2-column grid
        move_cursor_to_coords(page, 280, 580, wait_ms=800)
        move_cursor_to_coords(page, 520, 580, wait_ms=800)

        # Scroll back up to trading rail
        smooth_scroll(page, -350, steps=8, interval=40)
        page.wait_for_timeout(800)

        sync_scene_time("Scene 4", s4_start, 29.06, page)

        # ==========================================
        # SCENE 5: HIGH-SPEED TRADE RAIL (24.65s)
        # ==========================================
        s5_start = time.time()
        print("Starting Scene 5: High-Speed Trade Execution (24.65s)...")
        # Move to Trade Rail on the right
        move_cursor_to_coords(page, 1650, 140, wait_ms=600)

        # Click Long button
        move_cursor_to_element(page, "button:has-text('Long'), .side-btn.long, button:has-text('LONG')", click=True, wait_ms=600)

        # Select 5x Leverage
        move_cursor_to_element(page, "button:has-text('5x'), .leverage-btn:has-text('5x')", click=True, wait_ms=600)

        # Enter Margin amount ($50)
        move_cursor_to_element(page, ".field input, input[type='number']", click=True, wait_ms=300)
        page.keyboard.type("50", delay=80)
        page.wait_for_timeout(600)

        # Toggle Take-Profit & Stop-Loss
        move_cursor_to_element(page, "button:has-text('+50%'), button:has-text('50%')", click=True, wait_ms=600)
        move_cursor_to_element(page, "button:has-text('-20%'), button:has-text('20%')", click=True, wait_ms=600)

        # Hover dynamic liquidation breakdown
        move_cursor_to_coords(page, 1650, 440, wait_ms=800)

        # Click "Open Long Position"
        move_cursor_to_element(page, ".trade-action-btn, button:has-text('Open Long'), button:has-text('Submit')", click=True, wait_ms=1500)

        sync_scene_time("Scene 5", s5_start, 24.65, page)

        # ==========================================
        # SCENE 6: ACTIVE POSITIONS & PNL SHARE (23.23s)
        # ==========================================
        s6_start = time.time()
        print("Starting Scene 6: Open Positions & PnL Brag Card (23.23s)...")
        # Move to Positions Tab in bottom terminal
        smooth_scroll(page, 300, steps=6, interval=40)
        page.wait_for_timeout(600)

        move_cursor_to_element(page, "button:has-text('Positions'), .panel-heading button:has-text('Open Positions')", click=True, wait_ms=800)

        # Highlight position row, collateral, and green PnL
        move_cursor_to_coords(page, 280, 500, wait_ms=800)
        move_cursor_to_coords(page, 620, 500, wait_ms=1000)

        # Click Share PnL Card button
        move_cursor_to_element(page, "button:has-text('Share'), .share-pnl-btn, button[title*='Share']", click=True, wait_ms=1200)
        page.wait_for_timeout(800)

        # Explore the PnL Share Card Modal
        move_cursor_to_coords(page, 960, 360, wait_ms=1000)
        move_cursor_to_coords(page, 960, 500, wait_ms=800)
        move_cursor_to_coords(page, 850, 660, wait_ms=600)

        # Close Share Modal
        move_cursor_to_element(page, ".modal-close, button:has-text('✕'), button:has-text('Close')", click=True, wait_ms=800)
        smooth_scroll(page, -300, steps=6, interval=40)
        page.wait_for_timeout(800)

        sync_scene_time("Scene 6", s6_start, 23.23, page)

        # ==========================================
        # SCENE 7: PROFILE & CYBERPUNK AVATARS (28.97s)
        # ==========================================
        s7_start = time.time()
        print("Starting Scene 7: Profile & Cyberpunk Avatars (28.97s)...")
        page.goto("https://cluster-terminal.vercel.app/profile", wait_until="domcontentloaded")
        page.wait_for_timeout(1000)

        # Highlight compact profile hero bar
        move_cursor_to_coords(page, 240, 65, wait_ms=800)
        move_cursor_to_coords(page, 450, 65, wait_ms=800)
        move_cursor_to_coords(page, 1750, 65, wait_ms=800)

        # Highlight the 6-card institutional metrics strip
        move_cursor_to_coords(page, 200, 140, wait_ms=600)
        move_cursor_to_coords(page, 520, 140, wait_ms=600)
        move_cursor_to_coords(page, 840, 140, wait_ms=600)
        move_cursor_to_coords(page, 1160, 140, wait_ms=600)
        move_cursor_to_coords(page, 1480, 140, wait_ms=600)
        move_cursor_to_coords(page, 1780, 140, wait_ms=600)

        # Switch to "Avatars & Persona" Tab
        move_cursor_to_element(page, "button:has-text('Avatars'), .profile-tab-btn:nth-child(2)", click=True, wait_ms=1000)
        page.wait_for_timeout(800)

        # Browse through avatars
        move_cursor_to_coords(page, 220, 260, wait_ms=600)
        move_cursor_to_coords(page, 420, 260, wait_ms=600)
        move_cursor_to_coords(page, 620, 260, wait_ms=600)
        
        # Select an avatar
        move_cursor_to_coords(page, 420, 260, wait_ms=400)
        page.evaluate("window.__clickCursor()")
        page.wait_for_timeout(1000)

        # Switch to "Trading Defaults" Tab
        move_cursor_to_element(page, "button:has-text('Defaults'), .profile-tab-btn:nth-child(4)", click=True, wait_ms=1000)
        page.wait_for_timeout(800)

        # Click default leverage "5x" and Save
        move_cursor_to_element(page, ".profile-content-panel button:has-text('5x')", click=True, wait_ms=600)
        move_cursor_to_element(page, "button:has-text('Save Preferences')", click=True, wait_ms=1200)

        # Final celebratory mouse wave
        move_cursor_to_coords(page, 960, 300, wait_ms=600)
        move_cursor_to_coords(page, 1020, 280, wait_ms=500)
        move_cursor_to_coords(page, 900, 280, wait_ms=500)
        move_cursor_to_coords(page, 960, 290, wait_ms=1000)

        sync_scene_time("Scene 7", s7_start, 28.97, page)

        print("Recording complete! Closing context...")
        context.close()
        browser.close()

    print("Raw video recorded successfully!")

if __name__ == "__main__":
    record_demo()
