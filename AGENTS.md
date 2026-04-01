# Repository Guidelines

## Project Structure & Module Organization

Core logic lives in `source/`. `cli.tsx` boots the CLI, `app.tsx` orchestrates the Ink interface, and feature modules are grouped by concern: reusable UI in `source/components/`, long-running logic in `source/services/`, shared values in `source/constants/`, and types in `source/types/`. Utilities that do not belong to a feature sit in `source/utils/`. Builds emit to `dist/`, and brand assets stay in `public/`. Delete the generated `debug.log` before committing.

## Build, Test, and Development Commands

- `npm run build`: Compile TypeScript to `dist/` with the project `tsconfig.json`.
- `npm run dev`: Run `tsc --watch` for incremental rebuilds while editing.
- `npm start`: Launch the CLI through `tsx source/start.tsx` to manually exercise flows.
- `npm test`: Execute `prettier --check .`, `xo`, and the Ava suite; treat any failure as a blocker.
  Install dependencies with `npm install` and stay on Node.js ≥16, matching the `engines` field.

## Coding Style & Naming Conventions

Prettier (via `@vdemedes/prettier-config`) and XO React linting define the canonical style—always format with Prettier instead of hand-tuning indentation or quotes. Write React components and exported types in PascalCase (`SettingsDialog`, `EmailAccount`), functions and locals in camelCase (`fetchMessages`, `cacheService`), and keep filenames aligned with their main export. Prefer named exports for shared helpers, and colocate feature-specific hooks or utilities beside their consuming component.

## Testing Guidelines

Ava provides testing with ESM support through `ts-node/esm`. The existing `test.tsx` shows the minimal pattern; add new specs either alongside it or near the feature as `*.test.ts`/`*.test.tsx`. Every feature or fix should earn at least one assertion, and Ink components are easiest to cover with `ink-testing-library` render helpers. Run `npm test` before pushing and keep tests deterministic—avoid depending on live email servers without mocks.

## Commit & Pull Request Guidelines

Git history follows a conventional-commit style (`feat:`, `fix:`, `chore:`). Make focused commits, reference related issues in the body, and avoid committing build artifacts. A PR should describe the user impact, list the commands you ran (e.g., `npm test`), and include terminal screenshots whenever UI output changes. Ensure reviewers for the touched modules are tagged and respond quickly to their comments.

## Configuration & Security Tips

Secrets and tokens remain local; services like `SettingsService` and `EmailService` integrate with secure storage (`keytar`). Never commit credentials, API responses, or `debug.log`. Document new environment variables in `readme.md`, and strip sensitive payloads from any additional logging you introduce.
