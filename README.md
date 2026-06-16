# Study

This repository organizes long-form self-study across operating systems, algorithms, and program proof techniques. It is intended to hold durable notes, exercise inventories, solution drafts, code experiments, and generated notebooks without storing textbook source files or copied problem text.

## Study Areas

- [Operating Systems: Principles and Practice](subjects/operating-systems-principles-practice/README.md)
- [The Algorithm Design Manual](subjects/algorithm-design-manual/README.md)
- [Program Proofs](subjects/program-proofs/README.md)

## Repository Layout

```text
notebooks/
  problem-inventories/
  generated/
subjects/
  operating-systems-principles-practice/
    notes/
    exercises/
    projects/
  algorithm-design-manual/
    notes/
    exercises/
    implementations/
  program-proofs/
    notes/
    proofs/
    exercises/
templates/
  chapter-notes.md
  exercise-solution.md
  proof-writeup.md
  problem-log.md
```

## Notebook Workflow

[notebooks/](notebooks/) contains the Jupyter workflow. The tracked CSV inventories under `notebooks/problem-inventories/` define chapter, exercise, status, and short reference metadata. `scripts/generate_notebooks.py` turns those inventories into `.ipynb` files with note, response, code, verification, and reflection cells.

```sh
python3 scripts/generate_notebooks.py
```

Generated notebooks under `notebooks/generated/` are commit-safe: they identify exercises by source and problem number but avoid copied problem statements.

For local study, copied statements can be kept outside git in `notebooks/problem-statements.local.csv` and rendered into ignored notebooks under `notebooks/local/`:

```sh
python3 scripts/generate_notebooks.py --include-local-statements
```

## Local Sources

Textbook PDFs, EPUBs, extracted text, and local statement overlays are intentionally ignored. `sources.example.json` documents the expected shape for local source paths; copy it to `sources.local.json` for machine-specific paths.

The repository should remain useful when cloned without access to those local files: tracked inventories and generated notebooks provide the stable structure, while local overlays add convenience for private study.

## Working Model

Notes and solutions can live directly in subject folders or in notebooks, depending on the format that best fits the material. Algorithm and systems exercises that benefit from experimentation should include code cells or small implementations; proof-heavy work should make assumptions, invariants, and termination arguments explicit.
