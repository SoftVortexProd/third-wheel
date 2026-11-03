"""Generate a flat app icon (no gradients): dark rounded square + three circles, the third offset."""
from pathlib import Path

from PIL import Image, ImageDraw

S = 512
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle((0, 0, S - 1, S - 1), radius=110, fill="#0f1115")
r = 78
d.ellipse((110, 250 - r, 110 + 2 * r, 250 + r), fill="#7c8cff")
d.ellipse((200, 250 - r, 200 + 2 * r, 250 + r), fill="#e8eaf2")
d.ellipse((290, 330 - r, 290 + 2 * r, 330 + r), fill="#ff7a90")
out = Path(__file__).parent / "app.ico"
img.save(out, sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print(out)
