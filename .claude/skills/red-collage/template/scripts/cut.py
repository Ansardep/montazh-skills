"""Фото -> вырезка в стиле «Красного коллажа».
   python scripts/cut.py media/фото.jpg a/img/имя.png [--mode dots|photo|clean] [--keep-bg]
                         [--crop л,в,п,н] [--contrast 1.2] [--cell 9] [--size 1000]

   dots  (по умолчанию) — ч/б полутон точками, как газетная печать (лица-«гравюры», предметы)
   photo — реалистичное ч/б фото, приглушённое, с зерном (главное «живое» лицо)
   clean — без обработки цвета, только вырезка (логотипы, свои картинки)
   --keep-bg — не убирать фон (прямоугольная вырезка)
Фон убирается через rembg (если установлен). PNG с прозрачностью режется по своей прозрачности.
Вокруг вырезки — тонкая кремовая кайма и мягкая тень.
"""
import argparse, math, sys
sys.stdout.reconfigure(encoding="utf-8")
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

CREAM = (236, 226, 208)
INK = (18, 14, 14)

ap = argparse.ArgumentParser()
ap.add_argument("src"); ap.add_argument("dst")
ap.add_argument("--mode", default="dots", choices=["dots", "photo", "clean"])
ap.add_argument("--keep-bg", action="store_true")
ap.add_argument("--crop"); ap.add_argument("--contrast", type=float, default=1.15)
ap.add_argument("--cell", type=int, default=0); ap.add_argument("--size", type=int, default=1000)
ap.add_argument("--border", type=int, default=7)
a = ap.parse_args()

src = ImageOps.exif_transpose(Image.open(a.src))
if a.crop:
    l, t, r, b = [float(v) for v in a.crop.split(",")]
    src = src.crop((int(l * src.width), int(t * src.height), int(r * src.width), int(b * src.height)))
s = a.size / max(src.size)
src = src.resize((max(1, int(src.width * s)), max(1, int(src.height * s))), Image.LANCZOS)
w, h = src.size
rgba = src.convert("RGBA")

# --- маска
if a.keep_bg:
    mask = Image.new("L", (w, h), 255)
elif rgba.getchannel("A").getextrema()[0] < 128:
    mask = rgba.getchannel("A").point(lambda v: 255 if v > 127 else 0)
else:
    try:
        from rembg import new_session, remove
    except ImportError:
        raise SystemExit("Нужен rembg для удаления фона: pip install rembg  (или дай PNG без фона, или --keep-bg)")
    m = remove(src.convert("RGB"), session=new_session("isnet-general-use"), only_mask=True)
    mask = m.convert("L").point(lambda v: 255 if v > 110 else 0)
mask = mask.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
M = np.asarray(mask) > 127

# --- тон
g = ImageOps.grayscale(rgba.convert("RGB"))
g = ImageOps.autocontrast(g, cutoff=2, mask=mask)
g = g.filter(ImageFilter.UnsharpMask(radius=5, percent=70, threshold=2))
ga = np.asarray(g, np.float32) / 255
ga = np.clip(0.5 + (ga - 0.5) * a.contrast, 0, 1)

if a.mode == "dots":
    ga = 0.08 + (ga ** 0.75) * 0.92
    cell = a.cell or max(6, round(a.size / 120))
    sup = 3; W, H = w * sup, h * sup
    im = Image.new("L", (W, H), 255); d = ImageDraw.Draw(im)
    ang = math.radians(45); ca, sa = math.cos(ang), math.sin(ang); c = cell * sup
    diag = int(math.hypot(W, H)) + c
    for v in range(-diag // 2, diag // 2, c):
        for u in range(-diag // 2, diag // 2, c):
            x = W / 2 + u * ca - v * sa; y = H / 2 + u * sa + v * ca
            if 0 <= x < W and 0 <= y < H:
                px, py = int(x / sup), int(y / sup)
                if not M[py, px]:
                    continue
                r = c * 0.72 * math.sqrt(max(0.0, 1 - ga[py, px]))
                if r > 0.6:
                    d.ellipse([x - r, y - r, x + r, y + r], fill=0)
    ht = np.asarray(im.resize((w, h), Image.LANCZOS), np.float32)[..., None] / 255
    rgb = np.array(INK, np.float32) * (1 - ht) + np.array(CREAM, np.float32) * ht
elif a.mode == "photo":
    ga = ga ** 0.9
    noise = np.random.default_rng(3).normal(0, 0.035, ga.shape)
    v = np.clip(ga + noise, 0, 1)[..., None]
    rgb = np.array((14, 12, 12), np.float32) * (1 - v) + np.array((232, 224, 214), np.float32) * v
else:
    rgb = np.asarray(rgba.convert("RGB"), np.float32)

# --- холст с каймой и тенью
pad = a.border + 30
W, H = w + pad * 2, h + pad * 2
inner = Image.new("L", (W, H), 0); inner.paste(mask, (pad, pad))
border = inner.filter(ImageFilter.MaxFilter(a.border * 2 + 1)) if a.border and not a.keep_bg else inner
out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
shadow.putalpha(border.filter(ImageFilter.GaussianBlur(14)).point(lambda v: int(v * 0.55)))
out = Image.alpha_composite(out, Image.fromarray(np.roll(np.asarray(shadow), (10, 6), (0, 1))))
edge = Image.new("RGBA", (W, H), CREAM + (255,)); edge.putalpha(border)
out = Image.alpha_composite(out, edge)
pic = Image.new("RGBA", (W, H), (0, 0, 0, 0))
pic.paste(Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).convert("RGBA"), (pad, pad))
pic.putalpha(inner)
out = Image.alpha_composite(out, pic)
out = out.crop(out.getbbox())
out.save(a.dst)
print("готово:", a.dst, out.size)
