# UI

## Order for the first design

tokens → `base.css` + `utilities.css` → theme → primitives → patterns → `/design`, each step green.

## Where things go

| Thing                                           | Place                              |
| ----------------------------------------------- | ---------------------------------- |
| Value                                           | `src/styles/tokens.css`            |
| Native element default                          | `src/styles/base.css`              |
| Layout helper                                   | `src/styles/utilities.css`         |
| Behaviorless visual pattern (tag, stat, card)   | `src/styles/patterns.css`          |
| Keyboard, overlay, focus or form-value behavior | primitive in `shared/ui/<name>/`   |
| Screen or domain piece                          | component in `features/<feature>/` |

## CSS rules

`src/styles.css` is the only global entry, and every layer has its file:

```css
@layer reset, tokens, base, ui, patterns, utilities;

@import './styles/reset.css' layer(reset);
@import './styles/tokens.css' layer(tokens);
@import './styles/base.css' layer(base);
/* one per directive primitive: @import './app/shared/ui/input/input.css' layer(ui); */
@import './styles/patterns.css' layer(patterns);
@import './styles/utilities.css' layer(utilities);
```

- Component styles are unlayered. No `::ng-deep`, `ViewEncapsulation.None` or `!important`.
- Raw values only in `tokens.css`; everything else uses semantic tokens.
- State via ARIA attributes or native pseudo-classes, not state classes.
- No outer margin on a component; parents use `gap`.

## Tokens

Ramps (raw) → semantic tokens by role (`--color-surface`, not `--color-red`), using `light-dark()`, with `color-scheme` per `[data-theme]`. A missing value becomes a new semantic token, never a literal.

```css
:root {
  --gray-50: oklch(98% 0 0);
  --gray-900: oklch(20% 0 0);

  --color-surface: light-dark(var(--gray-50), var(--gray-900));
  --color-text: light-dark(var(--gray-900), var(--gray-50));
}

[data-theme='light'] {
  color-scheme: light;
}
[data-theme='dark'] {
  color-scheme: dark;
}
```

## Theme

`ThemeStore` in `core/` (`light | dark | system`, persisted) sets `data-theme` on `<html>`; an inline script in `index.html` applies it before first paint. No `prefers-color-scheme` outside tokens.

## Global layers

- `base`: element selectors only.
- `utilities`: `gap` layout helpers; no margin or color utilities.
- `patterns`: one class per pattern, variants via `data-*`.
- Layer order decides conflicts.

## Primitives

- Built the first time a page needs one. Class `App<Name>`, selector `app<Name>` (directive) or `app-<name>` (component).
- Pages import from the barrel; eager code imports the file directly.
- Never `window.confirm`, `alert` or `location.reload()`.
- Native element → attribute directive (`button[appButton]`) with CSS next to it, imported with `layer(ui)`.
- Composite widget → component on `@angular/aria`. Overlay or dialog → `@angular/cdk`.
- Form value → `FormValueControl<T>` (`value = model<T>()`) or `FormCheckboxControl`.
- Variants are a typed `input()` mapped to `data-variant`. Only the inputs a page uses.
- Test behavior: keyboard, ARIA, value.
- Done means: in the barrel, a row in `shared/ui/README.md`, and all variants on `/design`.

Directive primitive example:

```ts
import { Directive, input } from '@angular/core';

@Directive({
  selector: 'button[appButton]',
  host: { '[attr.data-variant]': 'variant()' },
})
export class AppButton {
  readonly variant = input<'primary' | 'secondary'>('primary');
}
```

```css
/* shared/ui/button/button.css, imported in styles.css with layer(ui) */
[appButton] {
  background: var(--color-action);
  color: var(--color-on-action);
}

[appButton][data-variant='secondary'] {
  background: var(--color-surface);
  color: var(--color-text);
}
```

## `/design`

A lazy page with every token (both themes), pattern and primitive variant. Nothing new is done until it is there.

## Feature components

Compose primitives, patterns and utilities; style only what is screen-specific, with semantic tokens. Reused elsewhere → move it down a layer.
