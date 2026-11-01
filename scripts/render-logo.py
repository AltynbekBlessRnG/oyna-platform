#!/usr/bin/env python3
"""Перерисовывает иконки Vence из SVG. Запускать из корня репозитория: python3 scripts/render-logo.py

Нужен rsvg-convert (пакет librsvg)."""
import subprocess, pathlib

OUT = pathlib.Path("apps/mobile/assets")
OUT.mkdir(parents=True, exist_ok=True)

# Знак: незамкнутое кольцо и геометрическая V внутри.
V_POINTS = "397,387 463,387 512,541 561,387 627,387 549,637 475,637"

def mark(scale: float) -> str:
    return f"""
  <g transform="translate(512 512) scale({scale}) translate(-512 -512)">
    <circle cx="512" cy="512" r="300" fill="none" stroke="url(#accent)" stroke-width="78"
            stroke-linecap="round" stroke-dasharray="1620 265" transform="rotate(-58 512 512)"/>
    <polygon points="{V_POINTS}" fill="url(#accent)"/>
  </g>"""

DEFS = """
  <defs>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFD86B"/>
      <stop offset="100%" stop-color="#FFB81F"/>
    </linearGradient>
  </defs>"""

def svg(body: str, background: str | None) -> str:
    plate = f'<rect width="1024" height="1024" fill="{background}"/>' if background else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">{DEFS}{plate}{body}</svg>'

files = {
    # Полноразмерная иконка: фон рисуем сами, iOS обрезает углы сам.
    "icon.svg": svg(mark(1.0), "#141414"),
    # Android держит содержимое в центральных 66%, фон задаётся в app.json.
    "adaptive-icon.svg": svg(mark(0.62), None),
    # Заставка: знак на прозрачном фоне, цвет подложки задаёт плагин.
    "splash-icon.svg": svg(mark(0.86), None)
}

for name, content in files.items():
    source = OUT / name
    source.write_text(content)
    target = source.with_suffix(".png")
    subprocess.run(["rsvg-convert", "-w", "1024", "-h", "1024", "-o", str(target), str(source)], check=True)
    print(target, target.stat().st_size)
