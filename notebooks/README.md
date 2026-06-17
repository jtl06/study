# Notebook Workflows

This folder contains generated Jupyter notebooks for self-study work.

The notebooks are designed to be safe to commit:

- they identify textbook exercises by source, chapter, and problem number;
- they leave space for your own paraphrase, reasoning, solution, code, and reflection;
- they do not copy textbook problem statements into the repository.

## Generate Notebooks

Edit the CSV inventories under `problem-inventories/`, then run:

```sh
python3 scripts/generate_notebooks.py
```

By default, notebooks are written to `notebooks/generated/`.

## Work Modes

Inventory rows can include an optional `work_mode` column:

- `mixed`: text response plus Python and C++ cells. This is the default.
- `text`: text response only.
- `python`: Python code cell only.
- `cpp`: C++ compile-and-run cell using the Python notebook kernel's `%%bash` magic.

If the column is omitted or blank, the generator uses `mixed`.

## Local Problem Statements

The committed notebooks intentionally use placeholders instead of copied problem statements. If you want full statements on your own machine, copy `problem-statements.example.csv` to `problem-statements.local.csv`, paste statements there, and generate local notebooks:

```sh
python3 scripts/generate_notebooks.py --include-local-statements
```

That writes notebooks to `notebooks/local/`. Both `notebooks/local/` and `problem-statements.local.csv` are ignored by git, so other checkouts see only the placeholders.

## Local Question Images

Tracked notebooks also reference ignored local SVG images for each problem. Render those images from your local statement CSV with:

```sh
python3 scripts/render_problem_images.py
```

Images are written to `notebooks/problem-images.local/`, which is ignored by git. When those files exist locally, the generated notebooks can display the question in the problem reference area without storing copied statement text in the repository.

## Local Text Sources

If you want to keep local paths to books, copy `sources.example.json` to `sources.local.json` and edit the paths. `sources.local.json` is ignored by git.
