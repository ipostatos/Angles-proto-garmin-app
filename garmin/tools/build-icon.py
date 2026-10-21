# Draws the launcher icon: a circular saw blade with hooked teeth.
# Rendered large and downsampled so the 60 px icon stays smooth.
#   python garmin/tools/build-icon.py
import math
from pathlib import Path
from PIL import Image, ImageDraw

S = 600                      # work size
OUT = 60                     # Instinct 3 AMOLED launcher size (smaller devices are scaled by the compiler)
TEETH = 18
GREEN = (0, 192, 64, 255)
WHITE = (255, 255, 255, 255)
BLACK = (0, 0, 0, 255)

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
c = S / 2
d.ellipse([0, 0, S - 1, S - 1], fill=BLACK)

# blade outline: each tooth = straight rise to the tip, then a hooked gullet back down
r_tip, r_root = S * 0.44, S * 0.35
pts = []
for i in range(TEETH):
    a0 = 2 * math.pi * i / TEETH
    step = 2 * math.pi / TEETH
    for t, r in ((0.00, r_root), (0.08, r_root), (0.62, r_tip), (0.70, r_tip * 0.97), (0.80, r_root * 1.02)):
        a = a0 + t * step
        pts.append((c + r * math.cos(a), c + r * math.sin(a)))
d.polygon(pts, fill=WHITE)

# expansion slots cut in from the rim, green arbor
for i in range(4):
    a = math.pi / 4 + i * math.pi / 2
    x1, y1 = c + S * 0.22 * math.cos(a), c + S * 0.22 * math.sin(a)
    x2, y2 = c + S * 0.36 * math.cos(a), c + S * 0.36 * math.sin(a)
    d.line([x1, y1, x2, y2], fill=BLACK, width=int(S * 0.03))
    d.ellipse([x1 - S * 0.025, y1 - S * 0.025, x1 + S * 0.025, y1 + S * 0.025], fill=BLACK)
d.ellipse([c - S * 0.11, c - S * 0.11, c + S * 0.11, c + S * 0.11], fill=GREEN)
d.ellipse([c - S * 0.05, c - S * 0.05, c + S * 0.05, c + S * 0.05], fill=BLACK)

dest = Path(__file__).resolve().parent.parent / "resources" / "drawables" / "launcher_icon.png"
img.resize((OUT, OUT), Image.LANCZOS).save(dest)
print(f"wrote {dest}")
