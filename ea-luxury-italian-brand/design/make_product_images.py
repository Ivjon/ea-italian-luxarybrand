"""Cut clean product shots out of editorial-catalog.png and normalise them
onto identical 4:5 canvases so every product card fits the same way.

Usage (needs Pillow + numpy):
    python design/make_product_images.py design/editorial-catalog.png frontend/assets/products
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

SRC = Path(sys.argv[1])
OUT = Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)

CANVAS = (600, 750)                 # 4:5, matches .product-image aspect-ratio
BG = np.array([238, 235, 231.0])    # shared backdrop, also used in CSS (#eeebe7)
FILL_W, FILL_H = 0.84, 0.80         # max share of canvas the product may use

im = np.asarray(Image.open(SRC).convert("RGB")).astype(float)

TILE_W, TILE_H = 166, 128
COLS = [26, 207, 389, 571, 752]
ROWS = {"new": 779, "best": 1031}

PRODUCTS = [
    ("blazer-ivory",     "new",  0),
    ("handbag-black",    "new",  1),
    ("sandal-black",     "new",  2),
    ("knit-cashmere",    "new",  3),
    ("sunglasses-black", "new",  4),
    ("jacket-black",     "best", 0),
    ("sneaker-white",    "best", 1),
    ("hobo-bag-black",   "best", 2),
    ("polo-black",       "best", 3),
    ("trench-coat",      "best", 4),
]


def overlay_mask(row, col):
    """Pixels covered by UI chrome (wishlist heart, NEW badge)."""
    m = np.zeros((TILE_H, TILE_W), bool)
    m[0:24, TILE_W - 26:] = True            # heart
    if row == "new":
        # the blazer's shoulder starts right next to the badge
        m[3:22, 4:37 if col == 0 else 42] = True
    return m


def fit_background(tile, ignore):
    """Least-squares quadratic surface per channel over background pixels,
    so the tile's soft lighting gradient can be removed."""
    h, w, _ = tile.shape
    yy, xx = np.mgrid[0:h, 0:w]
    x, y = xx / w, yy / h
    basis = np.stack([np.ones_like(x), x, y, x * x, y * y, x * y], -1)
    rough_bg = np.median(tile[~ignore], axis=0)
    product = np.abs(tile - rough_bg).sum(-1) > 24
    # grow the product mask so soft shadows don't skew the fit
    grown = np.asarray(Image.fromarray(product.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(9))) > 0
    use = ~grown & ~ignore
    A = basis[use]
    field = np.zeros_like(tile)
    for c in range(3):
        coef, *_ = np.linalg.lstsq(A, tile[..., c][use], rcond=None)
        field[..., c] = basis @ coef
    return field


def feather(size, edge):
    w, h = size
    m = np.ones((h, w))
    ramp = np.linspace(0, 1, edge)
    m[:edge] *= ramp[:, None]
    m[-edge:] *= ramp[::-1][:, None]
    m[:, :edge] *= ramp[None, :]
    m[:, -edge:] *= ramp[::-1][None, :]
    return Image.fromarray((m * 255).astype(np.uint8))


for name, row, col in PRODUCTS:
    x0, y0 = COLS[col], ROWS[row]
    tile = im[y0:y0 + TILE_H, x0:x0 + TILE_W].copy()
    chrome = overlay_mask(row, col)

    field = fit_background(tile, chrome)
    flat = np.clip(tile - field + BG, 0, 255)
    flat[chrome] = BG                        # erase badge + heart

    diff = np.abs(flat - BG).sum(-1)
    ys, xs = np.nonzero(diff > 30)
    pad = 6
    l, t = max(0, xs.min() - pad), max(0, ys.min() - pad)
    r, b = min(TILE_W, xs.max() + pad + 1), min(TILE_H, ys.max() + pad + 1)
    product = Image.fromarray(flat[t:b, l:r].astype(np.uint8))

    scale = min(CANVAS[0] * FILL_W / product.width, CANVAS[1] * FILL_H / product.height)
    size = (round(product.width * scale), round(product.height * scale))
    product = product.resize(size, Image.LANCZOS)
    product = product.filter(ImageFilter.UnsharpMask(radius=2.2, percent=70, threshold=2))

    canvas = Image.new("RGB", CANVAS, tuple(int(v) for v in BG))
    pos = ((CANVAS[0] - size[0]) // 2, (CANVAS[1] - size[1]) // 2)
    canvas.paste(product, pos, feather(size, max(10, round(pad * scale))))
    canvas.save(OUT / f"{name}.jpg", quality=90, optimize=True, progressive=True)
    print(f"{name:18} crop={r - l}x{b - t} scale={scale:.2f}")
