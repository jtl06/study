#!/usr/bin/env python3
"""Generate Jupyter study notebooks from CSV problem inventories."""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INVENTORY_DIR = ROOT / "notebooks" / "problem-inventories"
DEFAULT_OUTPUT_DIR = ROOT / "notebooks" / "generated"


REQUIRED_COLUMNS = {
    "subject_slug",
    "subject_title",
    "source",
    "chapter",
    "chapter_title",
    "problem_id",
    "problem_label",
    "kind",
    "difficulty",
    "page_ref",
    "status",
    "tags",
}


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "untitled"


def markdown_cell(source: str) -> dict:
    return {
        "cell_type": "markdown",
        "metadata": {},
        "source": source.splitlines(keepends=True),
    }


def code_cell(source: str = "") -> dict:
    return {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": source.splitlines(keepends=True),
    }


def load_rows(paths: Iterable[Path]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for path in paths:
        with path.open(newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            columns = set(reader.fieldnames or [])
            missing = REQUIRED_COLUMNS - columns
            if missing:
                missing_list = ", ".join(sorted(missing))
                raise ValueError(f"{path} is missing columns: {missing_list}")
            for row in reader:
                if row.get("subject_slug") and row.get("problem_id"):
                    rows.append({key: (value or "").strip() for key, value in row.items()})
    return rows


def notebook_for(group_rows: list[dict[str, str]]) -> dict:
    first = group_rows[0]
    subject_title = first["subject_title"]
    chapter = first["chapter"]
    chapter_title = first["chapter_title"]

    cells = [
        markdown_cell(
            f"# {subject_title}: Chapter {chapter} - {chapter_title}\n\n"
            "Use this notebook for original notes, solutions, code experiments, and proof attempts. "
            "Keep copied textbook text out of committed cells.\n"
        ),
        markdown_cell(
            "## Chapter Notes\n\n"
            "### Main Ideas\n\n"
            "- \n\n"
            "### Definitions\n\n"
            "| Term | Meaning |\n"
            "| --- | --- |\n"
            "| | |\n\n"
            "### Open Questions\n\n"
            "- \n"
        ),
    ]

    for row in group_rows:
        problem_label = row["problem_label"] or "Add exercise title or short cue"
        metadata = [
            f"- Source: {row['source']}",
            f"- Problem: {row['problem_id']}",
            f"- Kind: {row['kind'] or 'exercise'}",
            f"- Status: {row['status'] or 'Not started'}",
        ]
        if row["page_ref"]:
            metadata.append(f"- Page/ref: {row['page_ref']}")
        if row["difficulty"]:
            metadata.append(f"- Difficulty: {row['difficulty']}")
        if row["tags"]:
            metadata.append(f"- Tags: {row['tags']}")

        cells.extend(
            [
                markdown_cell(
                    f"## {row['problem_id']}: {problem_label}\n\n"
                    + "\n".join(metadata)
                    + "\n\n"
                    "### Problem Reference\n\n"
                    "Add a short reference or your own paraphrase. Do not paste copied problem text into committed notebooks.\n"
                ),
                markdown_cell(
                    "### Response\n\n"
                    "Write the main reasoning, proof, or solution attempt here.\n"
                ),
                code_cell(
                    "# Use this cell for experiments, checks, or implementations.\n"
                    "# Add more code cells as needed.\n"
                ),
                markdown_cell(
                    "### Verification and Reflection\n\n"
                    "- Checks performed:\n"
                    "- Mistakes or revisions:\n"
                    "- Follow-up:\n"
                ),
            ]
        )

    return {
        "cells": cells,
        "metadata": {
            "kernelspec": {
                "display_name": "Python 3",
                "language": "python",
                "name": "python3",
            },
            "language_info": {
                "codemirror_mode": {"name": "ipython", "version": 3},
                "file_extension": ".py",
                "mimetype": "text/x-python",
                "name": "python",
                "nbconvert_exporter": "python",
                "pygments_lexer": "ipython3",
            },
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }


def write_notebooks(rows: list[dict[str, str]], output_dir: Path) -> list[Path]:
    grouped: dict[tuple[str, str, str], list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        key = (row["subject_slug"], row["chapter"], row["chapter_title"])
        grouped[key].append(row)

    written: list[Path] = []
    for (subject_slug, chapter, chapter_title), group_rows in sorted(grouped.items()):
        subject_dir = output_dir / slugify(subject_slug)
        subject_dir.mkdir(parents=True, exist_ok=True)
        filename = f"ch{chapter}-{slugify(chapter_title)}.ipynb"
        path = subject_dir / filename
        notebook = notebook_for(group_rows)
        path.write_text(json.dumps(notebook, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        written.append(path)
    return written


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--inventory-dir",
        type=Path,
        default=DEFAULT_INVENTORY_DIR,
        help="Directory containing CSV problem inventories.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Directory where notebooks should be generated.",
    )
    args = parser.parse_args()

    inventory_paths = sorted(args.inventory_dir.glob("*.csv"))
    if not inventory_paths:
        raise SystemExit(f"No CSV inventories found in {args.inventory_dir}")

    rows = load_rows(inventory_paths)
    written = write_notebooks(rows, args.output_dir)

    for path in written:
        print(path.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

