#!/usr/bin/env python3
"""
Préparation des logos BâtiPlus à partir des fichiers originaux du client.

Entrées (dossier sources-logos/) :
  - batiplus-sur-fond-blanc.jpg  (logo couleur posé sur fond blanc)
  - batiplus-sur-fond-noir.png   (logo couleur posé sur fond noir)
  - brg-electro.png              (logo BRG Électro+, déjà transparent)

Sorties (dossier www/images/logo/) :
  - batiplus-couleur.webp    logo détouré (transparent), pour fonds clairs
  - batiplus-fond-noir.webp  logo détouré (transparent), pour fonds sombres
  - batiplus-blanc.webp      version blanche (éclair jaune conservé), fonds violets
  - batiplus-blanc-sans-eclair.webp + batiplus-eclair.webp
                             mêmes dimensions, superposables : l'éclair s'anime seul
  - icon-192.png, icon-512.png, icon-maskable-512.png  (provisoires, affinées à l'étape 4)
Sorties (dossier www/images/brg/) :
  - brg-couleur.webp         fonds clairs
  - brg-blanc.webp           fonds sombres (bleu passé en blanc, rouge et jaune conservés)

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


def masque_jaune(rgb: np.ndarray) -> np.ndarray:
    """Pixels de l'éclair jaune (rouge ET vert élevés, bleu faible)."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return (r > 0.75) & (g > 0.55) & (b < 0.45) & (g > b + 0.3)


def version_blanche(img: Image.Image):
    """Renvoie (logo blanc complet, logo blanc sans éclair, éclair seul)."""
    a = np.asarray(img).astype(np.float32) / 255.0
    rgb, alpha = a[..., :3], a[..., 3]
    jaune = masque_jaune(rgb)
    # Blanc ombré : les zones sombres d'origine (faces du cube) deviennent
    # lavande clair, pour garder le relief au lieu d'un aplat blanc.
    v = rgb.max(axis=2)
    t = np.clip((0.95 - v) / 0.45, 0.0, 1.0)[..., None]
    lavande = np.array([0.80, 0.70, 0.98], dtype=np.float32)
    blanc = (1.0 - t) * 1.0 + t * lavande
    complet = np.where(jaune[..., None], rgb, blanc)
    sans = np.dstack([blanc, np.where(jaune, 0.0, alpha)])
    eclair = np.dstack([rgb, np.where(jaune, alpha, 0.0)])
    vers = lambda t: Image.fromarray((t * 255).round().astype(np.uint8), "RGBA")
    return vers(np.dstack([complet, alpha])), vers(sans), vers(eclair)


def brg_blanc(img: Image.Image) -> Image.Image:
    """Logo BRG pour fond sombre : le bleu devient blanc, rouge et jaune restent."""
    a = np.asarray(img).astype(np.float32) / 255.0
    rgb = a[..., :3]
    bleu = (rgb[..., 2] > rgb[..., 0] + 0.15) & (rgb[..., 2] > rgb[..., 1] + 0.15)
    rgb = np.where(bleu[..., None], 1.0, rgb)
    return Image.fromarray((np.dstack([rgb, a[..., 3]]) * 255).round().astype(np.uint8), "RGBA")


def enregistrer(img: Image.Image, chemin: Path, largeur: int) -> None:
    redimensionner(img, largeur).save(chemin, "WEBP", quality=88, method=6)


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

    complet, sans, eclair = version_blanche(couleur)
    enregistrer(complet, SORTIE / "batiplus-blanc.webp", LARGEUR_LOGO)
    enregistrer(sans, SORTIE / "batiplus-blanc-sans-eclair.webp", LARGEUR_LOGO)
    enregistrer(eclair, SORTIE / "batiplus-eclair.webp", LARGEUR_LOGO)
    boite = eclair.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
    if boite:
        cx = (boite[0] + boite[2]) / 2 / eclair.width * 100
        cy = (boite[1] + boite[3]) / 2 / eclair.height * 100
        print(f"centre de l'éclair : {cx:.1f} % / {cy:.1f} %  (à reporter dans charte.css)")

    dossier_brg = RACINE / "www" / "images" / "brg"
    dossier_brg.mkdir(parents=True, exist_ok=True)
    brg = rogner(Image.open(SOURCES / "brg-electro.png").convert("RGBA"))
    enregistrer(brg, dossier_brg / "brg-couleur.webp", 640)
    enregistrer(brg_blanc(brg), dossier_brg / "brg-blanc.webp", 640)

    for dossier in (SORTIE, dossier_brg):
        for f in sorted(dossier.iterdir()):
            print(f"{f.name:34s} {f.stat().st_size / 1024:7.1f} Ko")


if __name__ == "__main__":
    main()
