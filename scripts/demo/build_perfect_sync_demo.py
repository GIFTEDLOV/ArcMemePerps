import asyncio
import os
import time
import json
import subprocess
import shutil
import edge_tts
import imageio_ffmpeg
from playwright.sync_api import sync_playwright

ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()

# ==============================================================================
# 1. Granular Sentence Script: Every single action has its own voice line!
# ==============================================================================
SCRIPT_DATA = [
    # --- SCENE 1: LANDING PAGE ---
    {
        "id": "s1_1_welcome",
        "scene": "Landing",
        "text": "Welcome to CLUSTER, the premier decentralized perpetual futures protocol built natively on Arc Mainnet, settled entirely in USDC.",
        "action": "s1_welcome"
    },
    {
        "id": "s1_2_nav",
        "scene": "Landing",
        "text": "We begin on our official landing page. Notice the floating header with direct links to our trading environments.",
        "action": "s1_nav"
    },
    {
        "id": "s1_3_hero",
        "scene": "Landing",
        "text": "In the center, our hero highlights sub-second discovery and physically backed clearing.",
        "action": "s1_hero"
    },
    {
        "id": "s1_4_scroll_stats",
        "scene": "Landing",
        "text": "Below, the live ticker displays real-time trending pairs and verified on-chain metrics.",
        "action": "s1_scroll_stats"
    },
    {
        "id": "s1_5_cta_click",
        "scene": "Landing",
        "text": "Let's click 'Launch Memes Terminal' to enter the live floor.",
        "action": "s1_cta_click"
    },

    # --- SCENE 2: MEMES TRENCHES TAB ---
    {
        "id": "s2_1_memes_intro",
        "scene": "Memes",
        "text": "Here on the Memes tab, traders get instant access to the trenches.",
        "action": "s2_memes_intro"
    },
    {
        "id": "s2_2_mempool_cols",
        "scene": "Memes",
        "text": "CLUSTER continuously monitors mempools across Solana, Base, and Arc, displaying raw deployments with live liquidity, age, and 24-hour volume.",
        "action": "s2_mempool_cols"
    },
    {
        "id": "s2_3_scroll_mempool",
        "scene": "Memes",
        "text": "You can scan newly deployed tokens before they hit major trackers.",
        "action": "s2_scroll_mempool"
    },
    {
        "id": "s2_4_click_trending",
        "scene": "Memes",
        "text": "Now let's explore our top navigation tabs by clicking 'Trending'.",
        "action": "s2_click_trending"
    },

    # --- SCENE 3: TRENDING TAB ---
    {
        "id": "s3_1_trending_table",
        "scene": "Trending",
        "text": "On the Trending tab, the terminal highlights the strongest volume and momentum leaders on Arc with dynamic price change indicators.",
        "action": "s3_trending_table"
    },
    {
        "id": "s3_2_click_markets",
        "scene": "Trending",
        "text": "Next, let's click into the Markets tab, where tokens undergo full institutional qualification before unlocking perpetual leverage.",
        "action": "s3_click_markets"
    },

    # --- SCENE 4: INTERACTIVE ONBOARDING TOUR ---
    {
        "id": "s4_1_tour_launch",
        "scene": "Tour",
        "text": "Whenever a new trader arrives, CLUSTER launches an interactive visual onboarding tour.",
        "action": "s4_tour_launch"
    },
    {
        "id": "s4_2_step1_hub",
        "scene": "Tour",
        "text": "The terminal spotlights critical areas: first, our Chain Identity and Solvency Hub.",
        "action": "s4_step1_hub"
    },
    {
        "id": "s4_3_step2_nav",
        "scene": "Tour",
        "text": "Let's click 'Next' to spotlight the navigation bar.",
        "action": "s4_step2_nav"
    },
    {
        "id": "s4_4_step3_search",
        "scene": "Tour",
        "text": "Clicking 'Next' again highlights our live search tool.",
        "action": "s4_step3_search"
    },
    {
        "id": "s4_5_step4_rail",
        "scene": "Tour",
        "text": "And clicking 'Next' takes us straight into the live order rail.",
        "action": "s4_step4_rail"
    },
    {
        "id": "s4_6_complete_tour",
        "scene": "Tour",
        "text": "Let's click 'Start Trading' to complete the tour.",
        "action": "s4_complete_tour"
    },

    # --- SCENE 5: MARKETS DIRECTORY ---
    {
        "id": "s5_1_directory_intro",
        "scene": "Markets",
        "text": "Now on the Markets directory, you can filter through all qualified perpetual assets.",
        "action": "s5_directory_intro"
    },
    {
        "id": "s5_2_instant_search",
        "scene": "Markets",
        "text": "Let's test the instant search: typing 'BSW' filters matching tokens in milliseconds.",
        "action": "s5_instant_search"
    },
    {
        "id": "s5_3_filters",
        "scene": "Markets",
        "text": "We also have category quick-filters: Hot and Gainers.",
        "action": "s5_filters"
    },
    {
        "id": "s5_4_anti_rug_score",
        "scene": "Markets",
        "text": "Notice the 5-Gate Anti-Rug badges verifying on-chain liquidity floors.",
        "action": "s5_anti_rug_score"
    },
    {
        "id": "s5_5_click_arcpup",
        "scene": "Markets",
        "text": "Let's click into ARCPUP to analyze its live terminal.",
        "action": "s5_click_arcpup"
    },

    # --- SCENE 6: TOKEN DETAIL & RISK PASSPORT ---
    {
        "id": "s6_1_detail_intro",
        "scene": "Detail",
        "text": "Inside the Token Detail workspace, we have a high-density GMGN-style terminal.",
        "action": "s6_detail_intro"
    },
    {
        "id": "s6_2_copy_chip",
        "scene": "Detail",
        "text": "At the top, click the contract chip to copy the contract address with instant visual confirmation.",
        "action": "s6_copy_chip"
    },
    {
        "id": "s6_3_chart_explore",
        "scene": "Detail",
        "text": "In the center is the real-time DexScreener candlestick chart.",
        "action": "s6_chart_explore"
    },
    {
        "id": "s6_4_risk_passport",
        "scene": "Detail",
        "text": "Scrolling down reveals the Anti-Rug Risk Passport, showing verified liquidity floors, zero percent tax honeypot checks, and real USDC custody proof.",
        "action": "s6_risk_passport"
    },

    # --- SCENE 7: TRADE EXECUTION & PNL BRAG CARD ---
    {
        "id": "s7_1_select_long",
        "scene": "Trade",
        "text": "Executing a trade is fast and non-custodial. On the right rail, we select Long...",
        "action": "s7_select_long"
    },
    {
        "id": "s7_2_select_leverage",
        "scene": "Trade",
        "text": "...choose 5x leverage...",
        "action": "s7_select_leverage"
    },
    {
        "id": "s7_3_enter_collateral",
        "scene": "Trade",
        "text": "...and enter 50 USDC collateral.",
        "action": "s7_enter_collateral"
    },
    {
        "id": "s7_4_toggle_tpsl",
        "scene": "Trade",
        "text": "We toggle Take-Profit and Stop-Loss triggers with dynamic liquidation pricing...",
        "action": "s7_toggle_tpsl"
    },
    {
        "id": "s7_5_click_execute",
        "scene": "Trade",
        "text": "...and click 'Open Position'.",
        "action": "s7_click_execute"
    },
    {
        "id": "s7_6_pnl_brag_card",
        "scene": "Trade",
        "text": "Looking at our active position below, we click 'Share' to pop up the cyberpunk PnL brag card, complete with our avatar and scan-able QR code.",
        "action": "s7_pnl_brag_card"
    },

    # --- SCENE 8: COMPETITIONS & PROTOCOL PROOF ---
    {
        "id": "s8_1_competitions",
        "scene": "Competitions",
        "text": "Now let's explore our platform tabs. Clicking Competitions opens the Arc Season 1 Meme Perps Championship with a 25,000 dollar USDC prize pool and live trader rankings.",
        "action": "s8_competitions"
    },
    {
        "id": "s8_2_proof",
        "scene": "Competitions",
        "text": "Next, clicking Protocol Proof opens our cryptographic Solvency Ledger, displaying verified USDC margin custody and insurance fund coverage.",
        "action": "s8_proof"
    },

    # --- SCENE 9: PUBLIC LP VAULT & PROFILE ---
    {
        "id": "s9_1_earn_intro",
        "scene": "VaultProfile",
        "text": "Finally, clicking ALP Earn opens the Public LP Vault.",
        "action": "s9_earn_intro"
    },
    {
        "id": "s9_2_earn_deposit",
        "scene": "VaultProfile",
        "text": "CLUSTER enforces donation-immune ERC-4626 accounting with loss-aware netting, ensuring LP capital is never drained by liquidation bad debt.",
        "action": "s9_earn_deposit"
    },
    {
        "id": "s9_3_profile_avatars",
        "scene": "VaultProfile",
        "text": "Lastly, clicking Profile lets you select from 12 cyberpunk avatars and customize trading defaults.",
        "action": "s9_profile_avatars"
    },
    {
        "id": "s9_4_conclusion",
        "scene": "VaultProfile",
        "text": "That is CLUSTER—the future of meme perpetuals on Arc.",
        "action": "s9_conclusion"
    }
]

# ==============================================================================
# 2. Audio Generation & Duration Probing
# ==============================================================================
async def generate_sentence_audios():
    audio_dir = "scripts/demo/demo_audio/granular"
    os.makedirs(audio_dir, exist_ok=True)
    voice = "en-US-ChristopherNeural"
    durations = {}

    print(f"Generating {len(SCRIPT_DATA)} granular audio snippets...")
    concat_list_path = os.path.join(audio_dir, "concat_list.txt")
    with open(concat_list_path, "w", encoding="utf-8") as concat_f:
        for idx, item in enumerate(SCRIPT_DATA):
            filename = f"{idx:02d}_{item['id']}.mp3"
            filepath = os.path.join(audio_dir, filename)
            
            # Generate edge-tts audio if not already generated
            if not os.path.exists(filepath) or os.path.getsize(filepath) == 0:
                comm = edge_tts.Communicate(item["text"], voice, rate="+2%")
                await comm.save(filepath)

            # Probe exact duration
            res = subprocess.run([ffmpeg_exe, "-i", filepath], capture_output=True, text=True, errors="ignore")
            dur = 0.0
            for line in res.stderr.splitlines():
                if "Duration:" in line:
                    part = line.split("Duration:")[1].split(",")[0].strip()
                    h, m, s = part.split(":")
                    dur = float(h)*3600 + float(m)*60 + float(s)
                    break
            durations[item["id"]] = round(dur, 2)
            item["duration"] = round(dur, 2)
            print(f"[{idx+1:02d}/{len(SCRIPT_DATA)}] {item['id']} ({dur:.2f}s): {item['text'][:45]}...")
            
            # Add to concat list
            concat_f.write(f"file '{os.path.abspath(filepath)}'\n")

    # Build master audio
    master_audio = os.path.abspath("scripts/demo/demo_audio/master_narration.mp3")
    subprocess.run([
        ffmpeg_exe, "-y", "-f", "concat", "-safe", "0", "-i", concat_list_path, "-c", "copy", master_audio
    ], capture_output=True)

    total_sec = sum(durations.values())
    print(f"\nMaster narration compiled: {master_audio}")
    print(f"Total Duration: {total_sec:.2f}s ({int(total_sec//60)}m {total_sec%60:.1f}s)")
    return SCRIPT_DATA

# ==============================================================================
# 3. Interactive Browser Automation
# ==============================================================================
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
    window.localStorage.setItem('arcmemeperps.risk_ack_agreed', 'true');
    window.localStorage.setItem('arcmemeperps.active_email_session', JSON.stringify({
      email: 'trader@cluster.arc',
      address: '0x7a250d5630b4cf539739df2c5dacb4c659f2488d'
    }));
    window.localStorage.setItem('arcmemeperps.tour_done.0x7a250d5630b4cf539739df2c5dacb4c659f2488d', 'true');
    window.localStorage.setItem('arcmemeperps.tour_done.null', 'true');
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
                page.wait_for_timeout(200)
                if click:
                    page.evaluate("window.__clickCursor()")
                    try:
                        el.click(timeout=1000)
                    except:
                        pass
                    page.wait_for_timeout(wait_ms)
                return True
    except Exception:
        pass
    return False

def smooth_scroll(page, delta_y, steps=8, interval=30):
    step_y = delta_y / steps
    for _ in range(steps):
        page.evaluate(f"window.scrollBy(0, {step_y})")
        page.wait_for_timeout(interval)

def pace_action(start_time, target_sec, page):
    elapsed = time.time() - start_time
    rem = target_sec - elapsed
    if rem > 0:
        page.wait_for_timeout(int(rem * 1000))

# ==============================================================================
# 4. Perfectly Synced Execution Engine
# ==============================================================================
def record_synced_video(script_data):
    raw_video_dir = os.path.abspath("scripts/demo/demo_video_raw")
    os.makedirs(raw_video_dir, exist_ok=True)
    for old_file in os.listdir(raw_video_dir):
        try:
            os.remove(os.path.join(raw_video_dir, old_file))
        except:
            pass

    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            headless=True
        )
        context = browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            record_video_dir=raw_video_dir,
            record_video_size={'width': 1920, 'height': 1080}
        )
        context.add_init_script(CURSOR_SCRIPT)
        page = context.new_page()

        print("\nStarting perfectly synchronized video recording...")

        for idx, item in enumerate(script_data):
            act = item["action"]
            dur = item["duration"]
            t0 = time.time()
            print(f"\n[Step {idx+1:02d}/{len(script_data)}] ({dur:.2f}s) {act}: \"{item['text'][:50]}...\"")

            # ----------------------------------------------------
            # SCENE 1: LANDING PAGE
            # ----------------------------------------------------
            if act == "s1_welcome":
                page.goto("https://cluster-terminal.vercel.app/landing", wait_until="domcontentloaded")
                page.wait_for_timeout(400)
                move_cursor_to_coords(page, 960, 220, wait_ms=800)
                move_cursor_to_coords(page, 960, 290, wait_ms=800)

            elif act == "s1_nav":
                move_cursor_to_coords(page, 240, 28, wait_ms=450)
                move_cursor_to_coords(page, 380, 28, wait_ms=450)
                move_cursor_to_coords(page, 450, 28, wait_ms=450)
                move_cursor_to_coords(page, 520, 28, wait_ms=450)

            elif act == "s1_hero":
                move_cursor_to_coords(page, 960, 390, wait_ms=800)
                move_cursor_to_coords(page, 960, 440, wait_ms=800)

            elif act == "s1_scroll_stats":
                smooth_scroll(page, 450, steps=8, interval=30)
                move_cursor_to_coords(page, 500, 420, wait_ms=600)
                move_cursor_to_coords(page, 800, 420, wait_ms=600)
                smooth_scroll(page, -450, steps=8, interval=25)

            elif act == "s1_cta_click":
                move_cursor_to_coords(page, 860, 520, wait_ms=700)
                page.evaluate("window.__clickCursor()")
                page.wait_for_timeout(300)

            # ----------------------------------------------------
            # SCENE 2: MEMES TRENCHES TAB
            # ----------------------------------------------------
            elif act == "s2_memes_intro":
                page.goto("https://cluster-terminal.vercel.app/memes", wait_until="domcontentloaded")
                page.wait_for_timeout(400)
                move_cursor_to_coords(page, 130, 25, wait_ms=600)
                move_cursor_to_coords(page, 200, 80, wait_ms=600)

            elif act == "s2_mempool_cols":
                move_cursor_to_coords(page, 200, 180, wait_ms=700)
                move_cursor_to_coords(page, 520, 180, wait_ms=700)
                move_cursor_to_coords(page, 850, 180, wait_ms=700)
                move_cursor_to_coords(page, 200, 270, wait_ms=700)
                move_cursor_to_coords(page, 520, 270, wait_ms=700)

            elif act == "s2_scroll_mempool":
                smooth_scroll(page, 260, steps=6, interval=30)
                move_cursor_to_coords(page, 520, 340, wait_ms=600)
                smooth_scroll(page, -260, steps=6, interval=25)

            elif act == "s2_click_trending":
                move_cursor_to_element(page, "nav a[href='/trending'], a:has-text('Trending')", click=True, wait_ms=800)

            # ----------------------------------------------------
            # SCENE 3: TRENDING TAB
            # ----------------------------------------------------
            elif act == "s3_trending_table":
                if "/trending" not in page.url:
                    page.goto("https://cluster-terminal.vercel.app/trending", wait_until="domcontentloaded")
                    page.wait_for_timeout(400)
                move_cursor_to_coords(page, 180, 25, wait_ms=500)
                move_cursor_to_coords(page, 320, 150, wait_ms=700)
                move_cursor_to_coords(page, 650, 220, wait_ms=700)
                move_cursor_to_coords(page, 950, 220, wait_ms=700)
                move_cursor_to_coords(page, 1250, 220, wait_ms=700)

            elif act == "s3_click_markets":
                move_cursor_to_element(page, "nav a[href='/markets'], a:has-text('Markets')", click=True, wait_ms=800)

            # ----------------------------------------------------
            # SCENE 4: INTERACTIVE ONBOARDING TOUR
            # ----------------------------------------------------
            elif act == "s4_tour_launch":
                if "/markets" not in page.url:
                    page.goto("https://cluster-terminal.vercel.app/markets", wait_until="domcontentloaded")
                    page.wait_for_timeout(400)
                page.evaluate('window.dispatchEvent(new CustomEvent("arcmemeperps:start_tour"))')
                page.wait_for_timeout(600)
                move_cursor_to_coords(page, 200, 180, wait_ms=800)

            elif act == "s4_step1_hub":
                move_cursor_to_coords(page, 80, 25, wait_ms=700)
                move_cursor_to_coords(page, 120, 180, wait_ms=800)

            elif act == "s4_step2_nav":
                move_cursor_to_element(page, ".tour-card button:has-text('Next'), .tour-next-btn", click=True, wait_ms=600)
                move_cursor_to_coords(page, 320, 25, wait_ms=700)
                move_cursor_to_coords(page, 320, 220, wait_ms=800)

            elif act == "s4_step3_search":
                move_cursor_to_element(page, ".tour-card button:has-text('Next'), .tour-next-btn", click=True, wait_ms=600)
                move_cursor_to_coords(page, 720, 25, wait_ms=700)
                move_cursor_to_coords(page, 720, 220, wait_ms=800)

            elif act == "s4_step4_rail":
                move_cursor_to_element(page, ".tour-card button:has-text('Next'), .tour-next-btn", click=True, wait_ms=600)
                move_cursor_to_coords(page, 1600, 260, wait_ms=900)

            elif act == "s4_complete_tour":
                move_cursor_to_element(page, ".tour-card button:has-text('Start'), .tour-card button:has-text('Skip'), .tour-card button:has-text('Next')", click=True, wait_ms=600)
                page.wait_for_timeout(400)

            # ----------------------------------------------------
            # SCENE 5: MARKETS DIRECTORY
            # ----------------------------------------------------
            elif act == "s5_directory_intro":
                if "/markets" not in page.url:
                    page.goto("https://cluster-terminal.vercel.app/markets", wait_until="domcontentloaded")
                    page.wait_for_timeout(400)
                move_cursor_to_coords(page, 320, 110, wait_ms=600)
                move_cursor_to_coords(page, 650, 110, wait_ms=600)

            elif act == "s5_instant_search":
                move_cursor_to_element(page, "input[placeholder*='Search'], .global-search input, .toolbar-search input", click=True, wait_ms=300)
                page.keyboard.type("BSW", delay=80)
                page.wait_for_timeout(600)
                for _ in range(3):
                    page.keyboard.press("Backspace")
                    page.wait_for_timeout(50)

            elif act == "s5_filters":
                move_cursor_to_element(page, "button:has-text('Hot'), .category-bar button:nth-child(2)", click=True, wait_ms=600)
                move_cursor_to_element(page, "button:has-text('Gainers'), .category-bar button:nth-child(3)", click=True, wait_ms=600)

            elif act == "s5_anti_rug_score":
                move_cursor_to_coords(page, 450, 260, wait_ms=600)
                move_cursor_to_coords(page, 800, 260, wait_ms=600)
                move_cursor_to_coords(page, 1200, 260, wait_ms=600)

            elif act == "s5_click_arcpup":
                move_cursor_to_element(page, ".market-row-link:first-child, tr.token-row:first-child, table tbody tr:first-child, a[href*='/markets/']", click=True, wait_ms=1000)

            # ----------------------------------------------------
            # SCENE 6: TOKEN DETAIL & RISK PASSPORT
            # ----------------------------------------------------
            elif act == "s6_detail_intro":
                if "/markets/0x4152433a" not in page.url and "/markets/arc-1" not in page.url:
                    page.goto("https://cluster-terminal.vercel.app/markets/0x4152433a30783939393939393939393939393939393939393939393939393939", wait_until="domcontentloaded")
                    page.wait_for_timeout(600)
                move_cursor_to_coords(page, 240, 85, wait_ms=600)
                move_cursor_to_coords(page, 450, 85, wait_ms=600)

            elif act == "s6_copy_chip":
                move_cursor_to_element(page, ".token-bar-copy, .copy-button", click=True, wait_ms=700)

            elif act == "s6_chart_explore":
                move_cursor_to_coords(page, 550, 240, wait_ms=700)
                move_cursor_to_coords(page, 750, 320, wait_ms=700)
                move_cursor_to_coords(page, 350, 420, wait_ms=700)

            elif act == "s6_risk_passport":
                smooth_scroll(page, 400, steps=8, interval=30)
                move_cursor_to_coords(page, 320, 340, wait_ms=600)
                move_cursor_to_coords(page, 320, 420, wait_ms=600)
                move_cursor_to_coords(page, 320, 500, wait_ms=600)
                smooth_scroll(page, -400, steps=8, interval=25)

            # ----------------------------------------------------
            # SCENE 7: TRADE EXECUTION & PNL BRAG CARD
            # ----------------------------------------------------
            elif act == "s7_select_long":
                move_cursor_to_coords(page, 1650, 140, wait_ms=400)
                move_cursor_to_element(page, "button:has-text('Buy / Long'), .gmgn-btn-buy, button:has-text('Long')", click=True, wait_ms=500)

            elif act == "s7_select_leverage":
                move_cursor_to_element(page, ".leverage-presets button:has-text('5x'), button:has-text('5x')", click=True, wait_ms=500)

            elif act == "s7_enter_collateral":
                input_el = page.wait_for_selector(".field input")
                if input_el:
                    box = input_el.bounding_box()
                    if box:
                        move_cursor_to_coords(page, box['x'] + box['width']/2, box['y'] + box['height']/2, wait_ms=250)
                        page.evaluate("window.__clickCursor()")
                    input_el.fill("50")
                page.wait_for_timeout(400)

            elif act == "s7_toggle_tpsl":
                move_cursor_to_element(page, ".tpsl-pills button:has-text('50%'), button:has-text('+50%')", click=True, wait_ms=400)
                move_cursor_to_element(page, ".tpsl-pills button:has-text('20%'), button:has-text('-20%')", click=True, wait_ms=400)
                move_cursor_to_coords(page, 1650, 520, wait_ms=500)

            elif act == "s7_click_execute":
                move_cursor_to_element(page, ".trade-action-btn", click=True, wait_ms=800)

            elif act == "s7_pnl_brag_card":
                move_cursor_to_coords(page, 960, 340, wait_ms=700)
                move_cursor_to_coords(page, 960, 480, wait_ms=700)
                page.evaluate("document.querySelector('.pnl-modal-backdrop')?.click()")
                page.wait_for_timeout(400)
                move_cursor_to_coords(page, 960, 600, wait_ms=600)

            # ----------------------------------------------------
            # SCENE 8: COMPETITIONS & PROTOCOL PROOF
            # ----------------------------------------------------
            elif act == "s8_competitions":
                page.goto("https://cluster-terminal.vercel.app/competitions", wait_until="domcontentloaded")
                page.wait_for_timeout(500)
                move_cursor_to_coords(page, 450, 95, wait_ms=700)
                move_cursor_to_coords(page, 850, 95, wait_ms=700)
                move_cursor_to_coords(page, 450, 220, wait_ms=700)
                move_cursor_to_coords(page, 850, 220, wait_ms=700)
                move_cursor_to_coords(page, 450, 320, wait_ms=700)

            elif act == "s8_proof":
                page.goto("https://cluster-terminal.vercel.app/proof", wait_until="domcontentloaded")
                page.wait_for_timeout(500)
                move_cursor_to_coords(page, 450, 100, wait_ms=700)
                move_cursor_to_coords(page, 850, 100, wait_ms=700)
                move_cursor_to_coords(page, 450, 220, wait_ms=700)
                move_cursor_to_coords(page, 850, 220, wait_ms=700)

            # ----------------------------------------------------
            # SCENE 9: PUBLIC LP VAULT & PROFILE
            # ----------------------------------------------------
            elif act == "s9_earn_intro":
                page.goto("https://cluster-terminal.vercel.app/earn", wait_until="domcontentloaded")
                page.wait_for_timeout(500)
                move_cursor_to_coords(page, 320, 140, wait_ms=600)
                move_cursor_to_coords(page, 550, 140, wait_ms=600)

            elif act == "s9_earn_deposit":
                dep_input = page.wait_for_selector("input[type='number']")
                if dep_input:
                    box = dep_input.bounding_box()
                    if box:
                        move_cursor_to_coords(page, box['x'] + box['width']/2, box['y'] + box['height']/2, wait_ms=250)
                        page.evaluate("window.__clickCursor()")
                    dep_input.fill("250")
                page.wait_for_timeout(400)
                move_cursor_to_element(page, "button:has-text('Deposit'), button:has-text('Deposit USDC')", click=True, wait_ms=700)
                page.wait_for_timeout(500)

            elif act == "s9_profile_avatars":
                page.goto("https://cluster-terminal.vercel.app/profile", wait_until="domcontentloaded")
                page.wait_for_timeout(500)
                move_cursor_to_element(page, "button:has-text('Avatars'), .profile-tab-btn:nth-child(2)", click=True, wait_ms=500)
                move_cursor_to_coords(page, 220, 260, wait_ms=400)
                move_cursor_to_coords(page, 420, 260, wait_ms=400)
                page.evaluate("window.__clickCursor()")
                page.wait_for_timeout(400)
                move_cursor_to_element(page, "button:has-text('Defaults'), .profile-tab-btn:nth-child(4)", click=True, wait_ms=500)
                move_cursor_to_element(page, ".profile-content-panel button:has-text('5x')", click=True, wait_ms=400)

            elif act == "s9_conclusion":
                move_cursor_to_coords(page, 960, 300, wait_ms=300)
                move_cursor_to_coords(page, 1020, 280, wait_ms=250)
                move_cursor_to_coords(page, 900, 280, wait_ms=250)
                move_cursor_to_coords(page, 960, 290, wait_ms=500)

            # Exact sentence-level pacing: holds until the voice line finishes
            pace_action(t0, dur, page)

        print("\nRecording loop complete. Closing browser context...")
        page.close()
        context.close()
        browser.close()
        print("Raw synchronized video recorded successfully!")

# ==============================================================================
# 5. Final Video Mux & Packaging
# ==============================================================================
def render_final():
    raw_dir = "scripts/demo/demo_video_raw"
    webm_files = [f for f in os.listdir(raw_dir) if f.endswith(".webm")]
    if not webm_files:
        raise RuntimeError("No raw webm file found!")
    webm_files.sort(key=lambda x: os.path.getsize(os.path.join(raw_dir, x)), reverse=True)
    raw_video = os.path.join(raw_dir, webm_files[0])
    master_audio = os.path.abspath("scripts/demo/demo_audio/master_narration.mp3")
    out_mp4 = os.path.abspath("arcmemeperps_3min_demo.mp4")

    print(f"\nMerging raw video and master audio into {out_mp4}...")
    cmd = [
        ffmpeg_exe, "-y",
        "-i", raw_video,
        "-i", master_audio,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        out_mp4
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, errors="ignore")
    if res.returncode != 0:
        raise RuntimeError(f"FFmpeg failed: {res.stderr}")

    size_mb = os.path.getsize(out_mp4) / (1024 * 1024)
    print(f"Final MP4 Created: {out_mp4} ({size_mb:.2f} MB)")

    # Copy to artifacts and infra
    artifact_dest = r"C:\Users\DELL\.gemini\antigravity\brain\75966656-aa47-446b-98b6-6357ca8e94a7\arcmemeperps_3min_demo.mp4"
    shutil.copyfile(out_mp4, artifact_dest)
    print(f"Copied to artifacts: {artifact_dest}")

def main():
    script_data = asyncio.run(generate_sentence_audios())
    record_synced_video(script_data)
    render_final()

if __name__ == "__main__":
    main()
