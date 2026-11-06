import { CdkDialogContainer, DialogRef } from '@angular/cdk/dialog';
import { Component, DestroyRef, inject, input } from '@angular/core';

let nextId = 0;

/**
 * Frame for content opened with the CDK `Dialog` service: title, body, and actions from `[dialog-actions]`.
 * Focus trap, Escape and backdrop come from the CDK; the title labels the dialog.
 */
@Component({
  selector: 'app-dialog',
  template: `
    <h2 class="title" [id]="titleId">{{ title() }}</h2>
    <div class="body"><ng-content /></div>
    <div class="actions"><ng-content select="[dialog-actions]" /></div>
  `,
  styles: `
    /* Tall content (an item with many allergens) scrolls inside; title and actions stay put. */
    :host {
      display: flex;
      flex-direction: column;
      inline-size: var(--dialog-width);
      max-inline-size: 100%;
      max-block-size: calc(100dvh - 2 * var(--space-4));
      overflow: hidden;
      background: var(--color-surface-raised);
      color: var(--color-text);
      border: var(--stroke-hairline) solid var(--color-border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg);
    }

    .title {
      padding: var(--space-5) var(--space-6) 0;
      font: var(--type-dialog-title);
      letter-spacing: var(--tracking-h3);
    }

    .body {
      flex: 1 1 auto;
      min-block-size: 0;
      overflow-y: auto;
      padding: var(--space-2) var(--space-6) var(--space-5);
      color: var(--color-text-muted);
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
      padding: var(--space-4) var(--space-6);
      background: var(--color-surface-sunken);
      border-block-start: var(--stroke-hairline) solid var(--color-border);
    }

    .actions:empty {
      display: none;
    }
  `,
})
export class AppDialog {
  readonly title = input.required<string>();

  protected readonly titleId = `app-dialog-title-${nextId++}`;

  constructor() {
    const container = inject(DialogRef, { optional: true })?.containerInstance;
    if (container instanceof CdkDialogContainer) {
      // Same hook Material's dialog title uses to set aria-labelledby on the container.
      container._addAriaLabelledBy(this.titleId);
      inject(DestroyRef).onDestroy(() => container._removeAriaLabelledBy(this.titleId));
    }
  }
}
