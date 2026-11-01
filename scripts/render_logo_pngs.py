import os
import shutil
from playwright.sync_api import sync_playwright

with open('docs/assets/cluster/logo.svg', 'r', encoding='utf-8') as f:
    svg_content = f.read()

# 1. Transparent clean logo
html_transparent = f'''<!DOCTYPE html>
<html>
<head>
<style>
  body {{ margin: 0; padding: 0; background: transparent; display: flex; align-items: center; justify-content: center; width: 512px; height: 512px; }}
  svg {{ width: 512px; height: 512px; }}
</style>
</head>
<body>{svg_content}</body>
</html>'''

# 2. White plate card logo (ideal for App Icon on DoraHacks / Discord / Twitter)
html_card = f'''<!DOCTYPE html>
<html>
<head>
<style>
  body {{ margin: 0; padding: 16px; background: transparent; display: flex; align-items: center; justify-content: center; width: 480px; height: 480px; }}
  svg {{ width: 480px; height: 480px; filter: drop-shadow(0 14px 28px rgba(0,0,0,0.3)); }}
</style>
</head>
<body>{svg_content}</body>
</html>'''

# 3. Cyberpunk dark logo with emerald neon glow
svg_dark = svg_content.replace('fill="#FFFFFF"', 'fill="#0c0e14" stroke="#00f5a0" stroke-width="2"')
svg_dark = svg_dark.replace('stroke="#000000"', 'stroke="#00f5a0"')
svg_dark = svg_dark.replace('fill="#000000"', 'fill="#00f5a0"')

html_dark = f'''<!DOCTYPE html>
<html>
<head>
<style>
  body {{ margin: 0; padding: 16px; background: transparent; display: flex; align-items: center; justify-content: center; width: 480px; height: 480px; }}
  svg {{ width: 480px; height: 480px; filter: drop-shadow(0 0 35px rgba(0,245,160,0.4)); }}
</style>
</head>
<body>{svg_dark}</body>
</html>'''

out_dir = 'docs/assets/cluster'
os.makedirs(out_dir, exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', headless=True)
    page = b.new_page(viewport={'width': 512, 'height': 512})
    
    # 512x512 transparent
    page.set_content(html_transparent)
    p_trans = os.path.join(out_dir, 'cluster-logo.png')
    page.screenshot(path=p_trans, omit_background=True)
    
    # 512x512 white card
    page.set_content(html_card)
    p_card = os.path.join(out_dir, 'cluster-logo-card.png')
    page.screenshot(path=p_card, omit_background=True)
    
    # 512x512 cyberpunk dark
    page.set_content(html_dark)
    p_dark = os.path.join(out_dir, 'cluster-logo-dark.png')
    page.screenshot(path=p_dark, omit_background=True)
    
    # 1024x1024 high-res
    page.set_viewport_size({'width': 1024, 'height': 1024})
    html_1024 = html_card.replace('480px', '960px').replace('16px', '32px')
    page.set_content(html_1024)
    p_1024 = os.path.join(out_dir, 'cluster-logo-1024.png')
    page.screenshot(path=p_1024, omit_background=True)
    
    b.close()
    print('Rendered all logo PNGs successfully!')

# Also copy to root and public for convenience
for fname in ['cluster-logo.png', 'cluster-logo-card.png', 'cluster-logo-dark.png']:
    src = os.path.join(out_dir, fname)
    shutil.copyfile(src, fname)
    shutil.copyfile(src, os.path.join('apps/frontend/public', fname))
    infra_dest = os.path.join(r'C:\Users\DELL\ArcMemePerps-infra\docs\assets\cluster', fname)
    os.makedirs(os.path.dirname(infra_dest), exist_ok=True)
    shutil.copyfile(src, infra_dest)

print('Copied to project roots and frontend public.')
