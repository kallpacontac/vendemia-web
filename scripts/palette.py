#!/usr/bin/env python3
"""
Genera la paleta de Vendemia a partir de los dos colores muestreados del logo.

Por qué OKLab y no interpolar en sRGB: mezclar en sRGB hace que los pasos
medios se apaguen y aparezcan grises sucios (el clásico "azul que al aclarar
se vuelve lavanda muerta"). En OKLab la luminosidad es perceptual, así que los
peldaños de la rampa se ven igual de separados entre sí.

  python3 scripts/palette.py            # imprime tokens CSS
  python3 scripts/palette.py --check    # + tabla de contraste WCAG
"""
import sys, math

BRAND = (0x01, 0x67, 0xF9)   # azul plano del avatar — el valor autoritativo
INK   = (0x02, 0x09, 0x1C)   # navy del wordmark "vende"

# ── sRGB ⇄ OKLab ───────────────────────────────────────────
def s2l(c):
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def l2s(c):
    c = 0.0 if c < 0 else (1.0 if c > 1 else c)
    v = c * 12.92 if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055
    return round(v * 255)

def to_oklab(rgb):
    r, g, b = (s2l(v) for v in rgb)
    l = 0.4122214708*r + 0.5363325363*g + 0.0514459929*b
    m = 0.2119034982*r + 0.6806995451*g + 0.1073969566*b
    s = 0.0883024619*r + 0.2817188376*g + 0.6299787005*b
    l_, m_, s_ = (math.copysign(abs(v) ** (1/3), v) for v in (l, m, s))
    return (0.2104542553*l_ + 0.7936177850*m_ - 0.0040720468*s_,
            1.9779984951*l_ - 2.4285922050*m_ + 0.4505937099*s_,
            0.0259040371*l_ + 0.7827717662*m_ - 0.8086757660*s_)

def to_rgb(lab):
    L, a, b = lab
    l_ = L + 0.3963377774*a + 0.2158037573*b
    m_ = L - 0.1055613458*a - 0.0638541728*b
    s_ = L - 0.0894841775*a - 1.2914855480*b
    l, m, s = l_**3, m_**3, s_**3
    return (l2s( 4.0767416621*l - 3.3077115913*m + 0.2309699292*s),
            l2s(-1.2684380046*l + 2.6097574011*m - 0.3413193965*s),
            l2s(-0.0041960863*l - 0.7034186147*m + 1.7076147010*s))

hexs = lambda rgb: '#%02X%02X%02X' % rgb

# ── Contraste WCAG ─────────────────────────────────────────
def luminance(rgb):
    r, g, b = (s2l(v) for v in rgb)
    return 0.2126*r + 0.7152*g + 0.0722*b

def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)

def unhex(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

# ── Rampa ──────────────────────────────────────────────────
def hue(lab):
    """Matiz OKLab en grados. Sirve para verificar que la rampa no deriva."""
    return math.degrees(math.atan2(lab[2], lab[1])) % 360

def chroma(lab):
    return math.hypot(lab[1], lab[2])

def _linear_rgb(lab):
    """RGB lineal SIN recortar — así se puede saber si el color cabe en sRGB."""
    L, a, b = lab
    l_, m_, s_ = (L + 0.3963377774*a + 0.2158037573*b,
                  L - 0.1055613458*a - 0.0638541728*b,
                  L - 0.0894841775*a - 1.2914855480*b)
    l, m, s = l_**3, m_**3, s_**3
    return ( 4.0767416621*l - 3.3077115913*m + 0.2309699292*s,
            -1.2684380046*l + 2.6097574011*m - 0.3413193965*s,
            -0.0041960863*l - 0.7034186147*m + 1.7076147010*s)

def in_gamut(L, C, h, eps=1e-4):
    a, b = C * math.cos(math.radians(h)), C * math.sin(math.radians(h))
    return all(-eps <= c <= 1 + eps for c in _linear_rgb((L, a, b)))

def fit_gamut(L, C, h):
    """
    Máximo croma que cabe en sRGB para esa L y ese matiz, por bisección.

    Esto es lo que arregla la deriva a cian. Recortar los canales al final
    (que es lo que hace un `clamp` ingenuo) recorta ANTES el azul que el verde,
    así que el color no solo se aclara: cambia de matiz. Aquí el matiz es
    sagrado y lo que cede es el croma — que es justo lo que el ojo perdona.
    """
    if in_gamut(L, C, h):
        return C
    lo, hi = 0.0, C
    for _ in range(24):
        mid = (lo + hi) / 2
        if in_gamut(L, mid, h):
            lo = mid
        else:
            hi = mid
    return lo

def ramp(base, steps):
    """steps: {nombre: L objetivo}. Matiz constante, croma mapeado a gamut."""
    lab0 = to_oklab(base)
    L0, C0, h0 = lab0[0], chroma(lab0), hue(lab0)
    out = {}
    for name, L in steps.items():
        # Curva de croma deseado: máximo en la base, cayendo hacia los extremos.
        t = abs(L - L0) / (1 - L0 if L >= L0 else L0)
        want = C0 * (1 - t) ** (0.55 if L >= L0 else 0.30)
        C = fit_gamut(L, want, h0)
        a, b = C * math.cos(math.radians(h0)), C * math.sin(math.radians(h0))
        out[name] = hexs(to_rgb((L, a, b)))
    return out

BLUE = ramp(BRAND, {
    '50': 0.965, '100': 0.925, '200': 0.855, '300': 0.775,
    '400': 0.685, '500': to_oklab(BRAND)[0], '600': 0.520,
    '700': 0.435, '800': 0.350, '900': 0.270,
})

# Neutros: derivados de la tinta, con una pizca del matiz azul para que las
# superficies oscuras no se vean grises muertos junto al acento.
Li, ai, bi = to_oklab(INK)
NEUTRAL = {}
for name, L in {'950': 0.115, '900': 0.155, '850': 0.195, '800': 0.245,
                '700': 0.320, '600': 0.430, '500': 0.560, '400': 0.680,
                '300': 0.800, '200': 0.890, '100': 0.945, '50': 0.975}.items():
    NEUTRAL[name] = hexs(to_rgb((L, ai * 0.55, bi * 0.55)))

if __name__ == '__main__':
    print(f"/* Muestreado del logo: azul {hexs(BRAND)} · tinta {hexs(INK)} */\n")
    print(":root {")
    print("  /* ── Marca ── */")
    for k, v in BLUE.items():
        mark = '   /* ← azul del logo */' if k == '500' else ''
        print(f"  --blue-{k}: {v};{mark}")
    print("\n  /* ── Neutros (tintados con el matiz de la tinta) ── */")
    for k, v in NEUTRAL.items():
        print(f"  --ink-{k}: {v};")
    print("}")

    if '--check' in sys.argv:
        h0 = hue(to_oklab(BRAND))
        print(f"\n\n── Deriva de matiz (base {h0:.1f}°) ──")
        worst = 0
        for k, v in BLUE.items():
            d = abs(hue(to_oklab(unhex(v))) - h0)
            worst = max(worst, d)
            print(f"  blue-{k:<5} {v}  {hue(to_oklab(unhex(v))):6.1f}°   Δ{d:4.1f}°")
        print(f"  → deriva máxima {worst:.1f}° " +
              ("✓ (por debajo de 4° no se percibe)" if worst < 4 else "✗ REVISAR"))

        print("\n── Contraste WCAG ──")
        bg_dark, bg_light = unhex(NEUTRAL['950']), unhex('#F7F8FB')
        print(f"{'color':12} {'s/ oscuro':>11} {'s/ claro':>10}   uso")
        for k, v in BLUE.items():
            cd, cl = contrast(unhex(v), bg_dark), contrast(unhex(v), bg_light)
            ok = []
            if cd >= 4.5: ok.append('texto en oscuro')
            if cl >= 4.5: ok.append('texto en claro')
            print(f"blue-{k:<7} {cd:>10.2f} {cl:>10.2f}   {', '.join(ok) or 'solo decorativo'}")

        print("\n── Pares críticos ──")
        pairs = [
            ('blanco sobre blue-500 (botón principal)', '#FFFFFF', BLUE['500']),
            ('blanco sobre blue-600 (botón hover)',     '#FFFFFF', BLUE['600']),
            ('blue-500 como texto sobre oscuro',        BLUE['500'], NEUTRAL['950']),
            ('blue-400 como texto sobre oscuro',        BLUE['400'], NEUTRAL['950']),
            ('texto alto sobre --ink-950',              '#FFFFFF', NEUTRAL['950']),
            ('texto medio sobre --ink-950',             NEUTRAL['400'], NEUTRAL['950']),
            ('texto bajo sobre --ink-950',              NEUTRAL['500'], NEUTRAL['950']),
            ('tinta sobre crema',                       INK and hexs(INK), '#F7F8FB'),
        ]
        for label, fg, bg in pairs:
            c = contrast(unhex(fg), unhex(bg))
            flag = '✓ AA' if c >= 4.5 else ('~ AA grande' if c >= 3 else '✗')
            print(f"  {label:<42} {c:5.2f}  {flag}")
