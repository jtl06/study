# Study

This private repository organizes long-form self-study across operating systems, algorithms, and program proof techniques. It holds exercise statements, durable notes, solution drafts, code experiments, and generated notebooks.

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

[notebooks/](notebooks/) contains the Jupyter workflow. The tracked CSV inventories under `notebooks/problem-inventories/` define chapter and exercise metadata. `scripts/generate_notebooks.py` turns those inventories into `.ipynb` files with problem statements, Markdown responses, and optional code cells.

```sh
python3 scripts/generate_notebooks.py
```

Exercise text is stored in `notebooks/problem-statements.csv` and embedded directly in generated notebooks.

## Local Sources

Textbook PDFs, EPUBs, and extracted chapter text are intentionally ignored. `sources.example.json` documents the expected shape for local source paths; copy it to `sources.local.json` for machine-specific paths.

The repository stores exercise statements only, not full textbook chapters or source books.

## Working Model

Notes and solutions can live directly in subject folders or in notebooks, depending on the format that best fits the material. Algorithm and systems exercises that benefit from experimentation should include code cells or small implementations; proof-heavy work should make assumptions, invariants, and termination arguments explicit.
