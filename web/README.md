# Study Lab

Local web interface for the repository's problem inventories and study progress.

## Run

```sh
npm install
npm run dev
```

Open `http://localhost:3000`. The app refreshes `public/problems.json` from the
tracked CSV inventories each time it starts. Solutions and statuses are saved in
the local D1 development database under `.wrangler/`.

## AI grading

Copy the example environment file and add an OpenAI API key:

```sh
cp .env.example .env
```

```text
OPENAI_API_KEY=your-key-here
```

Restart the development server after adding the key. The **Grade · Luna High**
button evaluates the current answer with `gpt-5.6-luna` and high reasoning
effort. It saves structured feedback and sets the problem to `Complete` or
`Needs review`; you can still override that status manually.

Use **Grade current** for the selected problem or **Grade all** to process every
problem with a non-empty answer sequentially. Batch grading stops on the first
error or when the local Sol cap blocks the next request; completed feedback is
kept.

The model menu also offers `gpt-5.6-sol` with high reasoning. Study Lab enforces
a local 250,000-token daily Sol cap, counts each request before sending it, and
resets its counter at 00:00 UTC. The on-screen budget only tracks requests made
by Study Lab; OpenAI's complimentary-token allowance is shared across eligible
models and projects in your API organization. Eligibility and data sharing must
be enabled separately by an organization owner in OpenAI Platform data controls.

## Existing notebook progress

With the development server running, import non-placeholder Markdown answers
from generated notebooks with:

```sh
npm run import:notebooks
```

The importer marks recovered answers as `In progress` and leaves untouched
problems as `Not started`.

## Useful commands

```sh
npm run sync:data
npm run build
npm test
```
