# Design System

The design system is the single source of truth for the extension popup and options UI. Code is canonical; a Claude Design artifact is an optional mirror.

## Structure

- `tokens.css` defines color, spacing, type, radius, and shadow tokens.
- `components/` holds reusable components and stories.
- `index.html` is a static token showcase.

## Rules

- Do not hard-code colors, spacing, or font sizes outside `tokens.css`.
- Add a story when creating a reusable UI component.
- Maintain WCAG 2.1 AA contrast in light and dark contexts.
- Document visible token changes in `CHANGELOG.md`.

## Storybook

```sh
pnpm run storybook
pnpm run build-storybook
```
