#!/usr/bin/env python3
"""
Préparation des photos BâtiPlus.

Entrées (dossier sources-photos/) :
  - fondateur.jpg          photo réelle du fondateur de BRG Électro+ (fond blanc)
  - elec-tableau.jpg, elec-cables.jpg, elec-devis.jpg,
    equipe-chantier.jpg, profil-defaut.jpg   visuels d'illustration générés par IA

Sorties (dossier www/images/equipe/) : WebP de moins de 150 Ko chacun.
  - recadrage au format demandé (vertical 3:4, horizontal 4:3, carré)
  - jamais d'agrandissement (on ne fabrique pas de faux détails)
  - fondateur.webp : fond blanc retiré (transparence), pour être posé sur un fond violet

Le voile en dégradé violet qui garantit la lisibilité des textes est appliqué en CSS,
pas dans les fichiers : une seule photo sert ainsi en mode clair et en mode sombre.

Usage : python3 src/scripts/preparer_photos.py   (depuis le dossier batiplus/)
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

RACINE = Path(__file__).resolve().parents[2]
SOURCES = RACINE / "sources-photos"
SORTIE = RACINE / "www" / "images" / "equipe"
POIDS_MAX = 150 * 1024

# nom : (ratio largeur/hauteur, largeur maximale, position verticale du recadrage 0=haut 0.5=centre)
PHOTOS = {
    "elec-tableau": (3 / 4, 1200, 0.35),
    "elec-cables": (3 / 4, 1200, 0.35),
    "elec-devis": (4 / 3, 1600, 0.5),
    "equipe-chantier": (4 / 3, 1600, 0.5),
    "profil-defaut": (1.0, 600, 0.3),
}


def recadrer(img: Image.Image, ratio: float, position: float) -> Image.Image:
    l, h = img.size
    if l / h > ratio:
        nl = round(h * ratio)
        x = (l - nl) // 2
        return img.crop((x, 0, x + nl, h))
    nh = round(l / ratio)
    y = round((h - nh) * position)
    return img.crop((0, y, l, y + nh))


def reduire(img: Image.Image, largeur_max: int) -> Image.Image:
    if img.width <= largeur_max:
        return img
    return img.resize((largeur_max, round(img.height * largeur_max / img.width)), Image.LANCZOS)


def enregistrer_leger(img: Image.Image, chemin: Path) -> None:
    """Baisse la qualité puis la taille jusqu'à passer sous 150 Ko."""
    courante = img
    while True:
        for qualite in (84, 78, 72, 66, 60):
            courante.save(chemin, "WEBP", quality=qualite, method=6)
            if chemin.stat().st_size <= POIDS_MAX:
                return
        courante = courante.resize((round(courante.width * 0.85), round(courante.height * 0.85)), Image.LANCZOS)


def detourer_fond_blanc(img: Image.Image) -> Image.Image:
    """Retire le fond blanc relié aux bords (remplissage depuis le pourtour),
    sans toucher aux zones claires à l'intérieur du sujet."""
    rgb = img.convert("RGB")
    marque = (255, 0, 255)
    travail = rgb.copy()
    l, h = travail.size
    graines = [(x, 0) for x in range(0, l, 24)] + [(x, h - 1) for x in range(0, l, 24)] \
        + [(0, y) for y in range(0, h, 24)] + [(l - 1, y) for y in range(0, h, 24)]
    for x, y in graines:
        r, g, b = travail.getpixel((x, y))
        if min(r, g, b) > 225:
            ImageDraw.floodfill(travail, (x, y), marque, thresh=38)
    a = np.asarray(travail)
    fond = (a[..., 0] == 255) & (a[..., 1] == 0) & (a[..., 2] == 255)
    alpha = Image.fromarray(np.where(fond, 0, 255).astype(np.uint8), "L")
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    resultat = rgb.convert("RGBA")
    resultat.putalpha(alpha)
    return resultat


def main() -> None:
    SORTIE.mkdir(parents=True, exist_ok=True)
    for nom, (ratio, largeur, position) in PHOTOS.items():
        img = Image.open(SOURCES / f"{nom}.jpg").convert("RGB")
        enregistrer_leger(reduire(recadrer(img, ratio, position), largeur), SORTIE / f"{nom}.webp")

    fondateur = detourer_fond_blanc(Image.open(SOURCES / "fondateur.jpg"))
    boite = fondateur.getchannel("A").getbbox()
    if boite:
        fondateur = fondateur.crop(boite)
    enregistrer_leger(reduire(fondateur, 900), SORTIE / "fondateur.webp")

    for f in sorted(SORTIE.iterdir()):
        with Image.open(f) as im:
            print(f"{f.name:24s} {im.width}x{im.height:<6d} {f.stat().st_size / 1024:6.1f} Ko")


if __name__ == "__main__":
    main()
