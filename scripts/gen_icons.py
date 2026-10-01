from PIL import Image, ImageDraw
import os
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "src-tauri", "icons")
os.makedirs(OUT, exist_ok=True)

def make(size):
    scale = size / 512
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # dark rounded background
    r = int(size * 0.22)
    d.rounded_rectangle([0, 0, size-1, size-1], radius=r, fill=(24, 26, 32, 255), outline=(52, 58, 70, 255), width=max(1, int(size*0.008)))
    # accent: two overlapping rounded squares (workspace layers)
    # back layer (blue)
    m = size * 0.24
    d.rounded_rectangle([m, m*0.85, size-m*0.7, size-m*1.05], radius=int(size*0.07), fill=(59, 110, 246, 255))
    # front layer (lighter slate)
    d.rounded_rectangle([m*1.35, m*1.35, size-m*0.55, size-m*0.55], radius=int(size*0.07), fill=(38, 42, 54, 255), outline=(96, 110, 140, 255), width=max(1, int(size*0.01)))
    # small accent dot
    dot_r = size * 0.045
    cx, cy = size*0.5, size*0.5
    d.ellipse([cx-dot_r, cy-dot_r, cx+dot_r, cy+dot_r], fill=(96, 165, 250, 255))
    return img

for name, size in [("32x32.png", 32), ("128x128.png", 128), ("128x128@2x.png", 256), ("icon.png", 512)]:
    make(size).save(os.path.join(OUT, name))
    print("wrote", name)

# .ico with multiple sizes (save from largest image)
big = make(256)
big.save(os.path.join(OUT, "icon.ico"), sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
print("wrote icon.ico")
# .icns: tauri accepts png; copy 512 as icns placeholder (mac build not primary)
try:
    make(512).save(os.path.join(OUT, "icon.icns"))
    print("wrote icon.icns")
except Exception as e:
    print("icns skip", e)
# tray icon
make(32).save(os.path.join(OUT, "tray.png"))
print("done")
