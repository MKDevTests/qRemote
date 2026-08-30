"""Re-draw the qRemote mark at vector quality, and emit every asset size.

The shipped artwork was one 800x800 opaque RGB file reused for the iOS icon,
the Android adaptive foreground, the splash and the favicon. Three problems
came with that: no alpha (so the adaptive background colour was dead and the
launcher masked a baked-in black square), the disc filled 68% of the canvas
where Android only guarantees the middle 61%, and 800px is below the 1024 iOS
wants.

So the mark is redrawn from primitives at 4x supersampling instead. Measuring
the original turned up the reason it can be: the mark is point-symmetric. The
"q" is the "b" rotated 180 degrees about the disc centre, drawn in white at low
opacity instead of solid. Every proportion below is a fraction of the disc
diameter, read off the original with a pixel probe.
"""

from PIL import Image, ImageDraw, ImageFilter

SS = 4  # supersampling factor; all drawing happens at SS x target, then LANCZOS down

# --- palette, sampled from the original -------------------------------------
RIM = (11, 58, 140)
GRAD_TOP = (56, 124, 246)
GRAD_BOTTOM = (3, 62, 240)
SHADOW = (4, 32, 96)
GROUND = (10, 10, 10)  # the app's dark background, for the opaque iOS icon

# --- geometry, as fractions of the disc diameter ----------------------------
RIM_W = 0.022
STROKE = 0.050
BOWL_D = 0.290
BOWL_C = (0.686, 0.522)  # the 'b' bowl centre
STEM_X = 0.540           # the 'b' stem's left edge
STEM_TOP = 0.188
Q_ALPHA = 72             # the 'q' is white at ~20%, which is what makes it read blue


def _gradient(size, top, bottom):
    col = Image.new("RGB", (1, size))
    px = col.load()
    for y in range(size):
        t = y / max(size - 1, 1)
        px[0, y] = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return col.resize((size, size), Image.NEAREST)


def _glyph_mask(s, stroke=STROKE):
    """The 'b': a vertical stem with a ring hung off its foot, as an L mask."""
    m = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(m)

    cx, cy = BOWL_C[0] * s, BOWL_C[1] * s
    r_out = BOWL_D * s / 2
    r_in = r_out - stroke * s
    d.ellipse((cx - r_out, cy - r_out, cx + r_out, cy + r_out), fill=255)
    d.ellipse((cx - r_in, cy - r_in, cx + r_in, cy + r_in), fill=0)

    # The stem shares the bowl's left edge and runs up from the bowl centre.
    d.rectangle((STEM_X * s, STEM_TOP * s, (STEM_X + stroke) * s, cy), fill=255)
    return m


def _letters(s):
    """Both glyphs on transparency: solid 'b', plus the same shape turned over."""
    b_mask = _glyph_mask(s)
    q_mask = b_mask.rotate(180)  # point symmetry about the disc centre

    layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    layer.paste((255, 255, 255, Q_ALPHA), (0, 0), q_mask)
    layer.paste((255, 255, 255, 255), (0, 0), b_mask)

    shadow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    # Masking by the layer's own alpha means the faint 'q' casts a faint shadow.
    shadow.paste(SHADOW + (110,), (0, 0), layer.getchannel("A"))
    shadow = shadow.filter(ImageFilter.GaussianBlur(s * 0.010))
    out = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    off = int(s * 0.010)
    out.alpha_composite(shadow, (off, off))
    out.alpha_composite(layer)
    return out


def render_mark(size):
    """The disc plus both glyphs, on transparency, filling the whole canvas."""
    s = size * SS

    disc = Image.new("L", (s, s), 0)
    ImageDraw.Draw(disc).ellipse((0, 0, s - 1, s - 1), fill=255)
    rw = RIM_W * s
    inner = Image.new("L", (s, s), 0)
    ImageDraw.Draw(inner).ellipse((rw, rw, s - 1 - rw, s - 1 - rw), fill=255)

    body = Image.new("RGBA", (s, s), RIM + (255,))
    body.paste(_gradient(s, GRAD_TOP, GRAD_BOTTOM).convert("RGBA"), (0, 0), inner)
    body.alpha_composite(_letters(s))

    out = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    out.paste(body, (0, 0), disc)
    return out.resize((size, size), Image.LANCZOS)


def place(mark, size, scale, background=None):
    """Scale the mark to `scale` of a `size` canvas and centre it."""
    canvas = Image.new("RGBA", (size, size), (background + (255,)) if background else (0, 0, 0, 0))
    d = int(round(size * scale))
    canvas.alpha_composite(mark.resize((d, d), Image.LANCZOS), ((size - d) // 2, (size - d) // 2))
    return canvas


def notification_icon(size):
    """A white silhouette for the Android status bar.

    Android throws away every channel but alpha here and repaints the result in
    the accent colour, so the shape has to survive at 24dp with no colour to
    help it: a solid disc with both glyphs punched out. The knockout is drawn
    30% heavier than the real mark because at that size a hairline counter
    closes up and the badge turns back into the blob this file exists to avoid.
    """
    s = size * SS
    pad = s * 0.04  # notification icons are not drawn edge to edge
    disc = Image.new("L", (s, s), 0)
    ImageDraw.Draw(disc).ellipse((pad, pad, s - 1 - pad, s - 1 - pad), fill=255)

    heavy = STROKE * 1.3
    holes = Image.new("L", (s, s), 0)
    holes.paste(255, (0, 0), _glyph_mask(s, heavy))
    holes.paste(255, (0, 0), _glyph_mask(s, heavy).rotate(180))

    alpha = Image.composite(Image.new("L", (s, s), 0), disc, holes)
    out = Image.new("RGBA", (s, s), (255, 255, 255, 255))
    out.putalpha(alpha)
    return out.resize((size, size), Image.LANCZOS)


# --- outputs ----------------------------------------------------------------
#
# Every role gets its own file, because their requirements contradict each
# other: iOS wants opaque with no alpha, Android's adaptive foreground wants
# transparency and a safe zone, and the status bar wants alpha only.
OUTPUTS = [
    # (filename, pixels, mark scale, opaque ground)
    ("icon.png", 1024, 0.68, GROUND),
    ("adaptive-icon.png", 1024, 0.60, None),
    ("splash-icon.png", 1024, 0.55, None),
    ("favicon.png", 64, 0.86, GROUND),
]

if __name__ == "__main__":
    import os
    import sys

    out_dir = sys.argv[1] if len(sys.argv) > 1 else "assets"
    mark = render_mark(2048)

    for name, size, scale, ground in OUTPUTS:
        img = place(mark, size, scale, ground)
        if ground is not None:
            # iOS rejects an alpha channel on the app icon outright.
            img = img.convert("RGB")
        img.save(os.path.join(out_dir, name))
        print("wrote", name, size)

    notification_icon(96).save(os.path.join(out_dir, "notification-icon.png"))
    print("wrote notification-icon.png 96")
