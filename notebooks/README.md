# Notebook Workflows

This folder contains generated Jupyter notebooks for self-study work. Because the repository is private, tracked exercise statements are embedded directly in the notebooks.

## Generate Notebooks

Edit the CSV inventories under `problem-inventories/`, then run:

```sh
python3 scripts/generate_notebooks.py
```

By default, notebooks are written to `notebooks/generated/`.

## Work Modes

Inventory rows can include an optional `work_mode` column:

- `mixed`: Markdown response plus Python and C++ cells. This is the default.
- `text`: Markdown response only.
- `python`: Markdown response plus a Python code cell.
- `cpp`: Markdown response plus a C++ compile-and-run cell using the Python notebook kernel's `%%bash` magic.

Every problem gets a Markdown response cell. If the column is omitted or blank, the generator uses `mixed`.

## Exercise Statements

Exercise text is stored in `problem-statements.csv`. The repository intentionally excludes textbook PDFs, EPUBs, and full extracted chapters.

## Local Text Sources

If you want to keep local paths to books, copy `sources.example.json` to `sources.local.json` and edit the paths. `sources.local.json` is ignored by git.
