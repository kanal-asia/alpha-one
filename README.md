# Alpha Workspace

Alpha Workspace — a unified local-first workspace for AI tools, automation, and Google integrations. Built with Vite, React, and ShadcnUI. Responsive, accessible, and production-ready.

## Features

- Light/dark mode
- Responsive
- Accessible
- Built-in Sidebar component
- Global search command
- AI agents: OpenCode and Kilo Code
- Streaming chat with real-time SSE
- Provider management (OpenCode, Kilo Code, Google Workspace)
- Automation tools (browser, PDF, PPT, task runner)
- Prompt library
- Activity history

## Tech Stack

**UI:** [ShadcnUI](https://ui.shadcn.com) (TailwindCSS + RadixUI)

**Build Tool:** [Vite](https://vitejs.dev/)

**Routing:** [TanStack Router](https://tanstack.com/router/latest)

**State:** [Zustand](https://zustand.docs.pmnd.rs/)

**Runtime:** Node.js + [Express](https://expressjs.com/) (embedded API server)

**Type Checking:** [TypeScript](https://www.typescriptlang.org/)

**Linting/Formatting:** [ESLint](https://eslint.org/) & [Prettier](https://prettier.io/)

**Icons:** [Lucide Icons](https://lucide.dev/icons/)

**Testing:** [Vitest](https://vitest.dev/) + Playwright browser tests

## Run Locally

Go to the project directory

```bash
  cd alpha-one
```

Install dependencies

```bash
  pnpm install
```

Start the frontend

```bash
  pnpm run dev
```

Start the API server

```bash
  pnpm run dev:server
```

Start both (frontend + API server)

```bash
  pnpm run dev:all
```

The Vite dev server proxies `/api` requests to the Express API server on port 3001.

## Production Build

```bash
  pnpm run build
```

## Scripts

| Script | Description |
| --- | --- |
| `dev` | Start the Vite dev server |
| `dev:server` | Start the Express API server (tsx) |
| `dev:all` | Start frontend and API server concurrently |
| `build` | Type-check and build for production |
| `lint` | Run ESLint |
| `format` / `format:check` | Format with Prettier |
| `knip` | Detect unused files and dependencies |
| `test` | Run Vitest browser tests (headless) |
| `preview` | Preview the production build |

## License

Licensed under the [MIT License](https://choosealicense.com/licenses/mit/)
