import asyncio
import edge_tts
import json
import os
import subprocess

SCENES = [
    {
        "id": "scene1_landing",
        "text": "Hey everyone! Welcome to ArcMemePerps, the high-performance perpetual trading terminal built natively for meme coins on the Arc Mainnet. Today, I'm going to walk you through everything from the landing page to executing your first leveraged perp trade and customizing your trader profile. As you can see on our landing page, we've got a live market ticker, real-time safety sentinels, and zero-slippage execution. Let's hit 'Launch Terminal' and dive right in."
    },
    {
        "id": "scene2_tour",
        "text": "When you connect your wallet for the first time, ArcMemePerps automatically launches an interactive onboarding tour. Notice how the background smoothly blurs while spotlight boxes highlight key functional zones, from the top navigation and market ticker, to the live charting engine and the isolated perpetual order rail. You can click 'Next' to walk through each area or skip directly into the action."
    },
    {
        "id": "scene3_markets",
        "text": "Here on the Markets Terminal, you get instant visibility into every trending meme pair on Arc. You can filter by top gainers, 24-hour volume, or market cap. Every token is paired with real-time risk scores and liquidity metrics, so you know exactly what you're trading before opening a position. Let's select one of our top trending pairs to analyze its chart."
    },
    {
        "id": "scene4_chart",
        "text": "Now we're inside the Token Detail page. Notice the compact, GMGN-inspired layout that maximizes screen space. At the top, you have the token contract chip, quick copy, and direct links to ArcScan and Bubblemaps. Below is the live DexScreener charting interface, and underneath that, our institutional Risk Passport. It checks holder concentration, honeypot safety, and contract solvency in real time."
    },
    {
        "id": "scene5_trade",
        "text": "Executing a trade is lightning-fast. Over on the right rail, choose between Long or Short, dial in your leverage up to 10x, and input your collateral in Arc USDC. We also have integrated Take-Profit and Stop-Loss toggles with dynamic liquidation risk calculations. When you're ready, click 'Open Position' — it executes on-chain with non-custodial speed."
    },
    {
        "id": "scene6_positions",
        "text": "Your open position immediately appears in the active tracker. You can monitor your entry price, real-time unrealized PnL, and margin ratio. Want to share your wins? Click the share icon to generate a high-res cyberpunk PnL brag card complete with your custom trader avatar, QR code, and ROI percentage ready for X and Telegram."
    },
    {
        "id": "scene7_profile",
        "text": "Finally, let's head over to the Profile page. Here you have your verified Arc Mainnet trader identity, your non-custodial wallet balances, and solvency guarantees. You can browse all 12 custom cyberpunk trader avatars, customize your default leverage and slippage, and replay the visual tour anytime. That's ArcMemePerps — trade meme perps faster, safer, and smarter. Thanks for watching, and happy trading!"
    }
]

async def main():
    os.makedirs("demo_audio", exist_ok=True)
    voice = "en-US-ChristopherNeural"
    
    for scene in SCENES:
        out_path = f"demo_audio/{scene['id']}.mp3"
        comm = edge_tts.Communicate(scene['text'], voice, rate="+1%")
        await comm.save(out_path)
        print(f"Generated {out_path}")

if __name__ == "__main__":
    asyncio.run(main())
