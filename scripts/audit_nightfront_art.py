#!/usr/bin/env python3
"""Audit visual duplicate Roblox art, even when URLs and PNG bytes differ.

This is a read-only image audit. It never deletes assets or changes live unit
records. The JSON report and contact sheet help verify suspicious lookalikes.
"""
from __future__ import annotations

import hashlib
import itertools
import json
import pathlib
from collections import defaultdict
from datetime import datetime, timezone

from PIL import Image, ImageChops, ImageDraw, ImageOps, ImageStat

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / "roblox-art-sync.json"
RESULT = ROOT / "roblox-art-result.json"
REPORT = ROOT / "roblox-art-visual-audit.json"
CONTACT = ROOT / "assets" / "roblox-art-audit.jpg"


def normalized_image(path: pathlib.Path, background: tuple[int, int, int]) -> Image.Image:
    with Image.open(path) as src:
        src = ImageOps.exif_transpose(src).convert("RGBA")
        backdrop = Image.new("RGBA", src.size, (*background, 255))
        image = Image.alpha_composite(backdrop, src).convert("RGB")
        return image.resize((80, 80), Image.Resampling.LANCZOS)


def grayscale_hash(img: Image.Image) -> int:
    pixels = list(img.convert("L").resize((17, 16), Image.Resampling.LANCZOS).getdata())
    result = 0
    for y in range(16):
        for x in range(16):
            result = (result << 1) | (1 if pixels[y * 17 + x] > pixels[y * 17 + x + 1] else 0)
    return result


def pixel_difference(a: Image.Image, b: Image.Image) -> float:
    return round(sum(ImageStat.Stat(ImageChops.difference(a, b)).mean) / 3, 2)


def main() -> None:
    data = json.loads(SOURCE.read_text("utf-8"))
    result = json.loads(RESULT.read_text("utf-8"))
    owners = defaultdict(list)
    for unit in data["units"]:
        for label, key in (("normal", "image_asset_id"), ("shiny", "shiny_image_asset_id")):
            asset = unit.get(key)
            if asset:
                owners[str(asset)].append({"name": unit["name"], "variant": label})

    artworks = {}
    for asset_id, record in result["assets"].items():
        if record.get("state") != "ready" or not record.get("path"):
            continue
        path = ROOT / record["path"]
        if not path.is_file():
            continue
        black = normalized_image(path, (8, 11, 18))
        white = normalized_image(path, (245, 246, 247))
        content = path.read_bytes()
        artworks[asset_id] = {
            "id": asset_id,
            "path": record["path"],
            "sha256": hashlib.sha256(content).hexdigest(),
            "hash_black": grayscale_hash(black),
            "hash_white": grayscale_hash(white),
            "black": black,
            "white": white,
            "owners": owners[asset_id],
        }

    comparisons = []
    for left, right in itertools.combinations(artworks.values(), 2):
        # Only flag art assigned to different unit names; reusing normal artwork
        # as shiny for the SAME unit is an intended fallback, not an error.
        left_names = {owner["name"] for owner in left["owners"]}
        right_names = {owner["name"] for owner in right["owners"]}
        if not (left_names - right_names or right_names - left_names):
            continue
        black_dhash = (left["hash_black"] ^ right["hash_black"]).bit_count()
        white_dhash = (left["hash_white"] ^ right["hash_white"]).bit_count()
        mean_black = pixel_difference(left["black"], right["black"])
        mean_white = pixel_difference(left["white"], right["white"])
        exact_file = left["sha256"] == right["sha256"]
        if exact_file or (black_dhash <= 15 and white_dhash <= 15 and
                          mean_black <= 35 and mean_white <= 35):
            confidence = "definite" if exact_file or (
                black_dhash <= 4 and white_dhash <= 4 and
                mean_black <= 12 and mean_white <= 12
            ) else ("likely" if black_dhash <= 9 and white_dhash <= 9 and
                     mean_black <= 23 and mean_white <= 23 else "possible")
            comparisons.append({
                "left_id": left["id"], "right_id": right["id"],
                "left_units": left["owners"], "right_units": right["owners"],
                "exact_bytes": exact_file,
                "dhash_distance_black": black_dhash,
                "dhash_distance_white": white_dhash,
                "pixel_mean_difference_black": mean_black,
                "pixel_mean_difference_white": mean_white,
                "confidence": confidence,
            })
    comparisons.sort(key=lambda c: (
        {"definite": 0, "likely": 1, "possible": 2}[c["confidence"]],
        c["dhash_distance_black"] + c["dhash_distance_white"],
        c["pixel_mean_difference_black"],
    ))

    clean_artworks = {}
    for aid, row in artworks.items():
        clean_artworks[aid] = {
            "path": row["path"],
            "owners": row["owners"],
            "sha256": row["sha256"],
        }
    report = {
        "source_snapshot_id": data.get("snapshotId"),
        "audited_at": datetime.now(timezone.utc).isoformat(),
        "total_checked": len(artworks),
        "suspected_cross_unit_copies": comparisons,
        "artworks": clean_artworks,
    }
    REPORT.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    # Contact sheet: original assets are labeled by the game's unit names.
    entries = sorted(artworks.values(), key=lambda a: (
        a["owners"][0]["name"] if a["owners"] else a["id"], a["id"]
    ))
    cell_w, cell_h, columns = 255, 203, 4
    rows = (len(entries) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * cell_w, rows * cell_h), (14, 17, 24))
    draw = ImageDraw.Draw(sheet)
    for index, row in enumerate(entries):
        x = (index % columns) * cell_w
        y = (index // columns) * cell_h
        with Image.open(ROOT / row["path"]) as src:
            src = ImageOps.exif_transpose(src).convert("RGBA")
            src.thumbnail((160, 152), Image.Resampling.LANCZOS)
            tile = Image.new("RGBA", (160, 152), (27, 33, 46, 255))
            tile.alpha_composite(src, ((160 - src.width)//2, (152 - src.height)//2))
            sheet.paste(tile.convert("RGB"), (x + 47, y + 5))
        label = ", ".join(sorted({owner["name"] for owner in row["owners"]}))
        draw.text((x + 8, y + 162), label[:37], fill=(229, 232, 241))
        draw.text((x + 8, y + 181), row["id"], fill=(145, 171, 203))
    CONTACT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(CONTACT, "JPEG", quality=85, optimize=True)
    print(f"Audited {len(artworks)} image assets; "
          f"{len(comparisons)} near-duplicate cross-unit pairs.")
    for pair in comparisons[:30]:
        print(f"  {pair['confidence']}: "
              f"{pair['left_units']} vs {pair['right_units']}; "
              f"dhash={pair['dhash_distance_black']}, "
              f"pixels={pair['pixel_mean_difference_black']}")


if __name__ == "__main__":
    main()
