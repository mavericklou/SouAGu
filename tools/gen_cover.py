#!/usr/bin/env python3
"""Generate 1200x630 OG cover image for SouAGu + 持仓助手"""
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1200, 630
OUT = os.path.expanduser('~/SouAGu/cover.png')

# Clean dark-blue theme
BG = '#0f172a'      # slate-900
ACCENT = '#1a73e8'  # blue-600
TEXT = '#f1f5f9'    # slate-100
MUTED = '#64748b'   # slate-500

img = Image.new('RGB', (W, H), BG)
draw = ImageDraw.Draw(img)

# --- Accent bar top ---
draw.rectangle([(0, 0), (W, 6)], fill=ACCENT)

# --- Try to find a good CJK font ---
font_paths = [
    '/System/Library/Fonts/PingFang.ttc',
    '/System/Library/Fonts/STHeiti Light.ttc',
    '/System/Library/Fonts/Helvetica.ttc',
    '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
]
title_font = subtitle_font = None
for fp in font_paths:
    if os.path.exists(fp):
        try:
            title_font = ImageFont.truetype(fp, 72)
            subtitle_font = ImageFont.truetype(fp, 30)
            break
        except:
            continue

if not title_font:
    title_font = ImageFont.load_default()
    subtitle_font = ImageFont.load_default()

# --- Title ---
title = '📊 持仓助手'
bbox = draw.textbbox((0, 0), title, font=title_font)
tw = bbox[2] - bbox[0]
th = bbox[3] - bbox[1]
tx, ty = (W - tw) // 2, 170
draw.text((tx, ty), title, fill=TEXT, font=title_font)

# --- Subtitle ---
sub = 'A股实时行情 · 代码/名称/拼音搜索 · 自动刷新'
bbox2 = draw.textbbox((0, 0), sub, font=subtitle_font)
sw = bbox2[2] - bbox2[0]
sx, sy = (W - sw) // 2, ty + th + 30
draw.text((sx, sy), sub, fill=MUTED, font=subtitle_font)

# --- Decorative element: search bar mockup ---
bar_x, bar_y = (W - 400) // 2, sy + 70
bar_h = 48
draw.rounded_rectangle([(bar_x, bar_y), (bar_x + 400, bar_y + bar_h)],
                       radius=24, fill='#1e293b', outline=ACCENT, width=1)

search_icon = '🔍'
search_title_font = ImageFont.truetype(font_paths[0], 20) if os.path.exists(font_paths[0]) else title_font
draw.text((bar_x + 20, bar_y + 12), search_icon, fill=MUTED, font=search_title_font)
draw.text((bar_x + 55, bar_y + 12), '159928  消费ETF汇添富', fill=MUTED, font=search_title_font)

# --- Bottom left: logo + domain ---
draw.text((40, H - 50), 'mavericklou.github.io/SouAGu', fill=MUTED, font=subtitle_font)

# --- Bottom right: badge ---
badge_text = 'MIT License'
draw.text((W - 40 - 120, H - 50), badge_text, fill='#334155', font=subtitle_font)

img.save(OUT, 'PNG')
print(f'Cover saved: {OUT} ({W}x{H})')
print(f'File size: {os.path.getsize(OUT) / 1024:.0f}KB')
