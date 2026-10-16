#!/usr/bin/env python3
"""
Sources des icônes et de l'écran de démarrage Android, pour @capacitor/assets.

Entrées : sources-logos/ (logos originaux du client), via les fonctions de preparer_logos.py.
Sorties (dossier assets/, lu par `npx capacitor-assets generate --android`) :
  - icon-only.png        1024×1024 : pictogramme sur fond blanc (icônes classiques et rondes)
  - icon-foreground.png  1024×1024 transparent : pictogramme dans les 76 % centraux.
                         @capacitor/assets l'encadre d'une marge de 16,7 % : il occupe alors
                         ~51 % des 108 dp et reste dans le cercle sûr de 66 dp (jamais rogné).
  - icon-background.png  1024×1024 blanc
  - splash.png, splash-dark.png  2732×2732 : logo blanc centré sur #4E0A80

Usage : python3 src/scripts/preparer_icones.py   (depuis le dossier batiplus/)
Puis   : npx capacitor-assets generate --android --assetPath assets \\
           --iconBackgroundColor "#FFFFFF" --splashBackgroundColor "#4E0A80"
Dépendances : pillow, numpy
"""
from pathlib import Path

from PIL import Image

from preparer_logos import BLANC, SOURCES, detourer, embleme, rogner, version_blanche

RACINE = Path(__file__).resolve().parents[2]
SORTIE = RACINE / "assets"
VIOLET_PROFOND = (78, 10, 128)   # #4E0A80
COTE_ICONE = 1024
COTE_SPLASH = 2732


def poser(picto: Image.Image, cote: int, part: float, fond) -> Image.Image:
    """Centre `picto` dans un carré de `cote` px, sans le déformer, sur `fond` (None = transparent)."""
    toile = Image.new("RGBA", (cote, cote), (fond + (255,)) if fond else (0, 0, 0, 0))
    p = picto.copy()
    p.thumbnail((int(cote * part), int(cote * part)), Image.LANCZOS)
    toile.alpha_composite(p, ((cote - p.width) // 2, (cote - p.height) // 2))
    return toile


def main() -> None:
    SORTIE.mkdir(exist_ok=True)
    picto = embleme(detourer(SOURCES / "batiplus-sur-fond-blanc.jpg", BLANC))

    poser(picto, COTE_ICONE, 0.72, BLANC).convert("RGB").save(SORTIE / "icon-only.png", optimize=True)
    poser(picto, COTE_ICONE, 0.76, None).save(SORTIE / "icon-foreground.png", optimize=True)
    Image.new("RGB", (COTE_ICONE, COTE_ICONE), BLANC).save(SORTIE / "icon-background.png", optimize=True)

    couleur = rogner(detourer(SOURCES / "batiplus-sur-fond-blanc.jpg", BLANC))
    blanc, _, _ = version_blanche(couleur)
    # Le logo occupe 34 % de la largeur : il reste entier même quand Android recadre le splash.
    splash = poser(blanc, COTE_SPLASH, 0.34, VIOLET_PROFOND).convert("RGB")
    splash.save(SORTIE / "splash.png", optimize=True)
    splash.save(SORTIE / "splash-dark.png", optimize=True)

    for f in sorted(SORTIE.iterdir()):
        with Image.open(f) as im:
            print(f"{f.name:22s} {im.width}x{im.height:<6d} {f.stat().st_size / 1024:7.1f} Ko")


if __name__ == "__main__":
    main()
