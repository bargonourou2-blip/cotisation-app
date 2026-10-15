#!/usr/bin/env python3
"""
Préparation des logos BâtiPlus à partir des fichiers originaux du client.

Entrées (dossier sources-logos/) :
  - batiplus-sur-fond-blanc.jpg  (logo couleur posé sur fond blanc)
  - batiplus-sur-fond-noir.png   (logo couleur posé sur fond noir)

Sorties (dossier www/images/logo/) :
  - batiplus-couleur.webp    logo détouré (transparent), pour fonds clairs
  - batiplus-fond-noir.webp  logo détouré (transparent), pour fonds sombres
  - icon-192.png, icon-512.png, icon-maskable-512.png  (provisoires, affinées à l'étape 4)

Détourage : l'opacité de chaque pixel est calculée à partir de son écart avec la
couleur du fond, puis la couleur est « dé-mélangée » du fond. On obtient des bords
propres, sans liseré blanc ni carré noir.

Usage : python3 src/scripts/preparer_logos.py   (depuis le dossier batiplus/)
Dépendances : pillow, numpy
"""
from pathlib import Path

import numpy as np
from PIL import Image

RACINE = Path(__file__).resolve().parents[2]
SOURCES = RACINE / "sources-logos"
SORTIE = RACINE / "www" / "images" / "logo"

LARGEUR_LOGO = 720          # assez pour un affichage net à 240 px en écran x3
SEUIL_PLEIN = 0.22          # écart au fond au-delà duquel le pixel est 100 % opaque
ZONE_MORTE = 0.05           # en dessous : bruit de compression du fond, rendu transparent
VIOLET = (106, 13, 173)     # #6A0DAD
BLANC = (255, 255, 255)


def detourer(chemin: Path, fond: tuple) -> Image.Image:
    """Rend transparent le fond uni (blanc ou noir) d'un logo."""
    img = np.asarray(Image.open(chemin).convert("RGB")).astype(np.float32) / 255.0
    f = np.array(fond, dtype=np.float32) / 255.0
    ecart = np.abs(img - f).max(axis=2)
    alpha = np.clip((ecart - ZONE_MORTE) / (SEUIL_PLEIN - ZONE_MORTE), 0.0, 1.0)
    a = np.maximum(alpha, 1e-4)[..., None]
    couleur = np.clip((img - f * (1.0 - a)) / a, 0.0, 1.0)
    rgba = np.dstack([couleur, alpha]) * 255.0
    return Image.fromarray(rgba.round().astype(np.uint8), "RGBA")


def rogner(img: Image.Image, marge: int = 24) -> Image.Image:
    """Retire les zones transparentes autour du logo en gardant une petite marge."""
    boite = img.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if not boite:
        return img
    g, h, d, b = boite
    return img.crop((max(g - marge, 0), max(h - marge, 0),
                     min(d + marge, img.width), min(b + marge, img.height)))


def redimensionner(img: Image.Image, largeur: int) -> Image.Image:
    hauteur = round(img.height * largeur / img.width)
    return img.resize((largeur, hauteur), Image.LANCZOS)


def embleme(img_detouree: Image.Image) -> Image.Image:
    """Isole le pictogramme (le « B » + la boîte), sans le mot BATIPLUS."""
    w, h = img_detouree.size
    # Le pictogramme occupe la partie haute et centrale du fichier original :
    # on coupe à 68 % de hauteur et à 76 % de largeur pour exclure l'éclair jaune.
    haut = img_detouree.crop((0, 0, int(w * 0.76), int(h * 0.68)))
    return rogner(haut, marge=8)


def icone(picto: Image.Image, taille: int, part: float, fond: tuple) -> Image.Image:
    """Pose le pictogramme centré sur un fond plein ; `part` = fraction occupée."""
    toile = Image.new("RGBA", (taille, taille), fond + (255,))
    cote = int(taille * part)
    p = picto.copy()
    p.thumbnail((cote, cote), Image.LANCZOS)
    toile.alpha_composite(p, ((taille - p.width) // 2, (taille - p.height) // 2))
    return toile.convert("RGB")


def main() -> None:
    SORTIE.mkdir(parents=True, exist_ok=True)

    couleur = rogner(detourer(SOURCES / "batiplus-sur-fond-blanc.jpg", BLANC))
    sombre = rogner(detourer(SOURCES / "batiplus-sur-fond-noir.png", (0, 0, 0)))

    redimensionner(couleur, LARGEUR_LOGO).save(
        SORTIE / "batiplus-couleur.webp", "WEBP", quality=88, method=6)
    redimensionner(sombre, LARGEUR_LOGO).save(
        SORTIE / "batiplus-fond-noir.webp", "WEBP", quality=88, method=6)

    picto = embleme(detourer(SOURCES / "batiplus-sur-fond-blanc.jpg", BLANC))
    icone(picto, 192, 0.80, BLANC).save(SORTIE / "icon-192.png", optimize=True)
    icone(picto, 512, 0.80, BLANC).save(SORTIE / "icon-512.png", optimize=True)
    # Maskable : le pictogramme reste dans les 60 % centraux (zone sûre Android).
    icone(picto, 512, 0.60, BLANC).save(SORTIE / "icon-maskable-512.png", optimize=True)

    for f in sorted(SORTIE.iterdir()):
        print(f"{f.name:28s} {f.stat().st_size / 1024:7.1f} Ko")


if __name__ == "__main__":
    main()
