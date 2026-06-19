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
DEFAULT_LOCAL_OUTPUT_DIR = ROOT / "notebooks" / "local"
DEFAULT_STATEMENTS_FILE = ROOT / "notebooks" / "problem-statements.local.csv"
LOCAL_IMAGE_DIR_NAME = "problem-images.local"
DEFAULT_IMAGE_DIR = ROOT / "notebooks" / LOCAL_IMAGE_DIR_NAME


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


STATEMENT_COLUMNS = {"subject_slug", "problem_id", "statement"}
WORK_MODES = {"python", "cpp", "c++", "text", "mixed"}


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


def work_mode(row: dict[str, str]) -> str:
    mode = (row.get("work_mode") or "mixed").strip().lower()
    if mode not in WORK_MODES:
        return "mixed"
    return "cpp" if mode == "c++" else mode


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


def load_statements(path: Path) -> dict[tuple[str, str], str]:
    if not path.exists():
        raise FileNotFoundError(f"Local statements file not found: {path}")

    statements: dict[tuple[str, str], str] = {}
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        columns = set(reader.fieldnames or [])
        missing = STATEMENT_COLUMNS - columns
        if missing:
            missing_list = ", ".join(sorted(missing))
            raise ValueError(f"{path} is missing columns: {missing_list}")
        for row in reader:
            subject_slug = (row.get("subject_slug") or "").strip()
            problem_id = (row.get("problem_id") or "").strip()
            statement = (row.get("statement") or "").strip()
            if subject_slug and problem_id and statement:
                statements[(subject_slug, problem_id)] = statement
    return statements


def local_image_path(row: dict[str, str], image_dir: Path) -> Path:
    return image_dir / slugify(row["subject_slug"]) / f"{slugify(row['problem_id'])}.svg"


def local_image_reference(row: dict[str, str]) -> str:
    subject_slug = slugify(row["subject_slug"])
    problem_slug = slugify(row["problem_id"])
    image_path = f"../../{LOCAL_IMAGE_DIR_NAME}/{subject_slug}/{problem_slug}.svg"
    return (
        "### Problem Reference\n\n"
        f"![Problem {row['problem_id']} statement]({image_path})\n"
    )


def problem_reference(
    row: dict[str, str],
    statements: dict[tuple[str, str], str],
    reference_local_images: bool,
    image_dir: Path,
) -> str:
    statement = statements.get((row["subject_slug"], row["problem_id"]))
    if statement:
        return (
            "### Local Problem Statement\n\n"
            "This cell was generated from an ignored local file. Do not commit the local notebook output if it contains copied textbook text.\n\n"
            f"{statement}\n"
        )

    if reference_local_images and local_image_path(row, image_dir).exists():
        return local_image_reference(row)

    return (
        "### Problem Reference\n\n"
        "Add a short reference or your own paraphrase. Do not paste copied problem text into committed notebooks.\n"
    )


def markdown_response_cell() -> dict:
    return markdown_cell(
        "Write the main reasoning, proof, notes, or solution attempt here.\n"
    )


def python_cell() -> dict:
    return code_cell(
        "# Python scratch / solution cell.\n"
        "\n"
        "def solve():\n"
        "    pass\n"
        "\n"
        "\n"
        "if __name__ == \"__main__\":\n"
        "    solve()\n"
    )


def cpp_cell(row: dict[str, str]) -> dict:
    subject_slug = slugify(row["subject_slug"])
    problem_slug = slugify(row["problem_id"])
    source_path = f"/tmp/{subject_slug}-{problem_slug}.cpp"
    binary_path = f"/tmp/{subject_slug}-{problem_slug}"
    return code_cell(
        "%%bash\n"
        f"cat > {source_path} <<'CPP'\n"
        "#include <bits/stdc++.h>\n"
        "using namespace std;\n"
        "\n"
        "int main() {\n"
        "    ios::sync_with_stdio(false);\n"
        "    cin.tie(nullptr);\n"
        "\n"
        "    return 0;\n"
        "}\n"
        "CPP\n"
        f"g++ -std=c++20 -O2 -Wall -Wextra -pedantic {source_path} -o {binary_path}\n"
        f"{binary_path}\n"
    )


def work_cells(row: dict[str, str]) -> list[dict]:
    mode = work_mode(row)
    cells = [markdown_response_cell()]
    if mode == "text":
        return cells
    if mode == "python":
        return cells + [python_cell()]
    if mode == "cpp":
        return cells + [cpp_cell(row)]
    return cells + [
        python_cell(),
        cpp_cell(row),
    ]


def notebook_for(
    group_rows: list[dict[str, str]],
    statements: dict[tuple[str, str], str],
    reference_local_images: bool,
    image_dir: Path,
) -> dict:
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
                    + problem_reference(row, statements, reference_local_images, image_dir)
                ),
                *work_cells(row),
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


def write_notebooks(
    rows: list[dict[str, str]],
    output_dir: Path,
    statements: dict[tuple[str, str], str],
    reference_local_images: bool,
    image_dir: Path,
) -> list[Path]:
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
        notebook = notebook_for(group_rows, statements, reference_local_images, image_dir)
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
        default=None,
        help="Directory where notebooks should be generated.",
    )
    parser.add_argument(
        "--include-local-statements",
        action="store_true",
        help="Read copied problem statements from the ignored local statements CSV.",
    )
    parser.add_argument(
        "--statements-file",
        type=Path,
        default=DEFAULT_STATEMENTS_FILE,
        help="Ignored CSV file containing local problem statements.",
    )
    parser.add_argument(
        "--image-dir",
        type=Path,
        default=DEFAULT_IMAGE_DIR,
        help="Ignored directory containing local question images.",
    )
    parser.add_argument(
        "--no-local-image-references",
        action="store_true",
        help="Do not add markdown image references to ignored local question images.",
    )
    args = parser.parse_args()

    inventory_paths = sorted(args.inventory_dir.glob("*.csv"))
    if not inventory_paths:
        raise SystemExit(f"No CSV inventories found in {args.inventory_dir}")

    rows = load_rows(inventory_paths)
    statements = load_statements(args.statements_file) if args.include_local_statements else {}
    output_dir = args.output_dir
    if output_dir is None:
        output_dir = DEFAULT_LOCAL_OUTPUT_DIR if args.include_local_statements else DEFAULT_OUTPUT_DIR
    written = write_notebooks(
        rows,
        output_dir,
        statements,
        reference_local_images=not args.no_local_image_references,
        image_dir=args.image_dir,
    )

    for path in written:
        print(path.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
