import asyncio
import edge_tts
import json
import os
import subprocess
import imageio_ffmpeg

SCENES = [
    {
        "id": "scene1_landing",
        "text": "Welcome to CLUSTER, the premier decentralized perpetual futures protocol built natively on Arc Mainnet, settled entirely in USDC. We begin on our official landing page. Notice the floating header with direct links to our trading environments. In the center, our hero highlights sub-second discovery and physically backed clearing. Below, the live ticker displays real-time trending pairs. Let's click 'Launch Memes Terminal' to enter the live floor."
    },
    {
        "id": "scene2_memes",
        "text": "Here on the Memes tab, traders get instant access to the trenches. CLUSTER continuously monitors mempools across Solana, Base, and Arc, displaying raw deployments with live liquidity, age, and 24-hour volume. You can scan newly deployed tokens before they hit major trackers. Now let's explore our top navigation tabs by clicking 'Trending'."
    },
    {
        "id": "scene3_trending",
        "text": "On the Trending tab, the terminal highlights the strongest volume and momentum leaders on Arc with dynamic price change indicators. Next, let's click into the Markets tab, where tokens undergo full institutional qualification before unlocking perpetual leverage."
    },
    {
        "id": "scene4_tour",
        "text": "Whenever a new trader arrives, CLUSTER launches an interactive visual onboarding tour. The terminal spotlights critical areas: first, our Chain Identity and Solvency Hub. Let's click 'Next' to spotlight the navigation bar. Clicking 'Next' again highlights our live search tool. And clicking 'Next' takes us straight into the live order rail. Let's click 'Start Trading' to complete the tour."
    },
    {
        "id": "scene5_markets",
        "text": "Now on the Markets directory, you can filter through all qualified perpetual assets. Let's test the instant search: typing 'BSW' filters matching tokens in milliseconds. We also have category quick-filters: Hot and Gainers. Notice the 5-Gate Anti-Rug badges verifying on-chain liquidity floors. Let's click into ARCPUP to analyze its live terminal."
    },
    {
        "id": "scene6_chart_passport",
        "text": "Inside the Token Detail workspace, we have a high-density GMGN-style terminal. At the top, click the contract chip to copy the contract address with instant visual confirmation. In the center is the real-time DexScreener candlestick chart. Scrolling down reveals the Anti-Rug Risk Passport, showing verified liquidity floors, zero percent tax honeypot checks, and real USDC custody proof."
    },
    {
        "id": "scene7_trade_positions",
        "text": "Executing a trade is fast and non-custodial. On the right rail, we select Long, choose 5x leverage, and enter 50 USDC collateral. We toggle Take-Profit and Stop-Loss triggers with dynamic liquidation pricing, and click 'Open Position'. Looking at our active position below, we click 'Share' to pop up the cyberpunk PnL brag card, complete with our avatar and scan-able QR code."
    },
    {
        "id": "scene8_competitions_proof",
        "text": "Now let's explore our platform tabs. Clicking Competitions opens the Arc Season 1 Meme Perps Championship with a 25,000 dollar USDC prize pool and live trader rankings. Next, clicking Protocol Proof opens our cryptographic Solvency Ledger, displaying verified USDC margin custody and insurance fund coverage."
    },
    {
        "id": "scene9_vault_profile",
        "text": "Finally, clicking ALP Earn opens the Public LP Vault. CLUSTER enforces donation-immune ERC-4626 accounting with loss-aware netting, ensuring LP capital is never drained by liquidation bad debt. Lastly, clicking Profile lets you select from 12 cyberpunk avatars and customize trading defaults. That is CLUSTER—the future of meme perpetuals on Arc."
    }
]

async def main():
    audio_dir = "scripts/demo/demo_audio"
    os.makedirs(audio_dir, exist_ok=True)
    voice = "en-US-ChristopherNeural"
    
    scene_durations = {}
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    
    for scene in SCENES:
        out_path = os.path.join(audio_dir, f"{scene['id']}.mp3")
        comm = edge_tts.Communicate(scene['text'], voice, rate="+2%")
        await comm.save(out_path)
        
        # probe duration
        res = subprocess.run([ffmpeg, "-i", out_path], capture_output=True, text=True, errors="ignore")
        dur = 0.0
        for line in res.stderr.splitlines():
            if "Duration:" in line:
                part = line.split("Duration:")[1].split(",")[0].strip()
                h, m, s = part.split(":")
                dur = float(h)*3600 + float(m)*60 + float(s)
                break
        scene_durations[scene['id']] = round(dur, 2)
        print(f"Generated {out_path} -> {dur:.2f}s")
        
    total_sec = sum(scene_durations.values())
    print(f"\nTotal Audio Duration: {total_sec:.2f}s ({int(total_sec//60)}m {total_sec%60:.1f}s)")
    with open(os.path.join(audio_dir, "scene_durations.json"), "w") as f:
        json.dump(scene_durations, f, indent=2)

if __name__ == "__main__":
    asyncio.run(main())
