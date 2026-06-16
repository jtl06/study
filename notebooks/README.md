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

## Local Text Sources

If you want to keep local paths to books, copy `sources.example.json` to `sources.local.json` and edit the paths. `sources.local.json` is ignored by git.

