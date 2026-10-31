import asyncio
import edge_tts
import json
import os
import subprocess
import imageio_ffmpeg

SCENES = [
    {
        "id": "scene1_landing",
        "text": "Welcome to CLUSTER, the institutional perpetual futures exchange engineered specifically for volatile meme assets, settling natively in USDC on Arc Network. In this walkthrough, we will explore the complete application—from real-time multichain market discovery to leveraged trade execution, our institutional Anti-Rug Risk Passport, and donation-immune LP vault accounting. Let's launch the terminal and step inside."
    },
    {
        "id": "scene2_tour",
        "text": "When connecting your wallet for the first time, CLUSTER presents an interactive onboarding tour. Notice how the spotlight gracefully guides new traders through critical interfaces: top-level market health, live candlestick charting, real-time risk scores, and the isolated perpetual order rail. You can step through each spotlight or jump straight into the terminal."
    },
    {
        "id": "scene3_markets",
        "text": "On the Markets Discovery Terminal, CLUSTER continuously indexes over two hundred and sixty meme markets across Solana, Arc, Base, and BNB. Users can filter by trending gainers, 24-hour volume, or liquidity depth. Most importantly, CLUSTER enforces a mathematical 5-Gate qualification engine. While discovery is open to all tokens, only mathematically verified tokens can unlock leveraged trading."
    },
    {
        "id": "scene4_chart",
        "text": "Now inside the Token Trading Terminal, you see a compact, high-density layout inspired by GMGN. At the top, traders get instant contract copy tools, verification tags, and direct links to ArcScan. In the center is the real-time candlestick chart powered by DexScreener, paired directly with our institutional Risk Passport below, which inspects holder concentration, liquidity floors, and mint authority in real time."
    },
    {
        "id": "scene5_trade",
        "text": "Executing a trade is completely non-custodial and instantaneous. On the right execution rail, choose Long or Short, select leverage up to 5x, and input your margin collateral in native Arc USDC. Notice the real-time liquidation price breakdown, borrowing cost calculations, and integrated Take-Profit and Stop-Loss triggers. Clicking 'Open Position' sends the transaction directly to Arc's high-speed blockspace."
    },
    {
        "id": "scene6_positions",
        "text": "Once executed, your open position is tracked live in the bottom console with sub-second mark price updates, dynamic margin ratios, and real-time unrealized PnL. Traders can celebrate their wins by clicking Share, instantly generating a high-resolution cyberpunk PnL brag card complete with their custom avatar, entry details, and scan-able QR code ready for X and Telegram."
    },
    {
        "id": "scene7_vault",
        "text": "Next, let's explore the Public LP Vault. CLUSTER solves the classic vulnerability where toxic meme liquidations drain LP pools. Our vault implements donation-immune ERC-4626 share pricing with two-phase queued withdrawals and loss-aware accounting. Trading losses and liquidation bad debt are segregated without double-counting, ensuring the LP net asset value remains mathematically solvent at all times."
    },
    {
        "id": "scene8_profile",
        "text": "Finally, the Trader Profile dashboard displays your verified Arc identity, physical USDC custody balances, and platform activity. Here you can personalize your trading terminal with twelve custom cyberpunk avatars, configure default leverage and slippage limits, and view our cryptographic solvency ledger. That is CLUSTER—fail-closed safety and lightning speed for meme perps on Arc."
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
