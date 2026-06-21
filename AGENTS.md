# Repository Guidelines

## Project Structure & Module Organization
This repository contains a React + Vite frontend in the root and a separate Express backend in `backend/`. The frontend is a POS interface with SUPABASE auth, cash register pages, product management, digital transaction support, dashboard reports, and thermal receipt printing.

The backend is a distinct Node service under `backend/server.js` with its own `package.json` and runtime scripts. Frontend assets are handled by Vite, Tailwind CSS, and React, while the backend uses Express, MySQL driver support, and dotenv for environment configuration.

## Build, Test, and Development Commands
Use the root package for frontend development and production build:
- `npm install`
- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run lint`

Run backend commands from the root with `--prefix backend` or inside `backend/`:
- `npm --prefix backend run dev`
- `npm --prefix backend start`

The README documents local setup using `.env` values for `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` and points to SQL migrations in `supabase/migrations/`.

## Coding Style & Naming Conventions
Linting is enforced by ESLint with React and React Hooks recommended rules plus the `react-refresh` plugin. The root `package.json` script `npm run lint` runs `eslint . --ext js,jsx --report-unused-disable-directives --max-warnings 0`.

ESLint configuration includes:
- `eslint:recommended`
- `plugin:react/recommended`
- `plugin:react-hooks/recommended`
- `react-refresh/only-export-components` enabled globally
- `react/prop-types` disabled
- `react/react-in-jsx-scope` disabled for modern JSX
- `no-unused-vars` errors with exceptions for `React` and underscore-prefixed args

Project code uses ECMAScript modules (`type: module`) in both root and backend.

## Commit & Pull Request Guidelines
Recent commits follow a conventional commit-style prefix, e.g. `feat: add professional financial report generator...`.

No PR template file was found in the repository, so keep pull requests focused and aligned with the existing scoped feature commits.
