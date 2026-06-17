#!/usr/bin/env python3
"""Render ignored local problem statements as SVG images."""

from __future__ import annotations

import argparse
import csv
import html
import re
import textwrap
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_STATEMENTS_FILE = ROOT / "notebooks" / "problem-statements.local.csv"
DEFAULT_OUTPUT_DIR = ROOT / "notebooks" / "problem-images.local"


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "untitled"


def wrap_statement(statement: str, width: int) -> list[str]:
    lines: list[str] = []
    for paragraph in statement.splitlines() or [statement]:
        paragraph = paragraph.strip()
        if not paragraph:
            lines.append("")
            continue
        lines.extend(textwrap.wrap(paragraph, width=width, break_long_words=False) or [""])
    return lines


def render_svg(title: str, statement: str) -> str:
    body_lines = wrap_statement(statement, width=96)
    width = 1080
    margin = 36
    line_height = 24
    title_y = margin + 4
    body_start_y = title_y + 42
    height = body_start_y + max(1, len(body_lines)) * line_height + margin

    tspans = []
    for index, line in enumerate(body_lines):
        y = body_start_y + index * line_height
        tspans.append(f'<text x="{margin}" y="{y}" class="body">{html.escape(line)}</text>')

    return "\n".join(
        [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
            "<style>",
            "  .title { font: 700 20px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; fill: #111827; }",
            "  .body { font: 16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; fill: #111827; }",
            "</style>",
            f'<rect x="0" y="0" width="{width}" height="{height}" rx="8" fill="#ffffff"/>',
            f'<rect x="0.5" y="0.5" width="{width - 1}" height="{height - 1}" rx="8" fill="none" stroke="#d1d5db"/>',
            f'<text x="{margin}" y="{title_y}" class="title">{html.escape(title)}</text>',
            *tspans,
            "</svg>",
            "",
        ]
    )


def render_images(statements_file: Path, output_dir: Path) -> list[Path]:
    written: list[Path] = []
    with statements_file.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            subject_slug = (row.get("subject_slug") or "").strip()
            problem_id = (row.get("problem_id") or "").strip()
            statement = (row.get("statement") or "").strip()
            if not subject_slug or not problem_id or not statement:
                continue

            subject_dir = output_dir / slugify(subject_slug)
            subject_dir.mkdir(parents=True, exist_ok=True)
            path = subject_dir / f"{slugify(problem_id)}.svg"
            title = f"{subject_slug} {problem_id}"
            path.write_text(render_svg(title, statement), encoding="utf-8")
            written.append(path)
    return written


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--statements-file", type=Path, default=DEFAULT_STATEMENTS_FILE)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    args = parser.parse_args()

    if not args.statements_file.exists():
        raise SystemExit(f"Local statements file not found: {args.statements_file}")

    written = render_images(args.statements_file, args.output_dir)
    for path in written:
        print(path.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
