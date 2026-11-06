import { Component, DestroyRef, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { LucideExternalLink, LucideFileText } from '@lucide/angular';
import { map } from 'rxjs';
import type { ImportPage } from '../../core/imports/import';
import { ImportsApi } from '../../core/imports/imports-api';

/** The uploaded photo (or a link to the PDF) of one import page, loaded as a blob since it needs auth. */
@Component({
  selector: 'app-page-original',
  imports: [LucideExternalLink, LucideFileText],
  template: `
    @if (file.value(); as url) {
      @if (page().mime.startsWith('image/')) {
        <a [href]="url" target="_blank" rel="noopener" class="zoom" [attr.aria-label]="openLabel">
          <img [src]="url" [alt]="altText()" />
        </a>
      } @else {
        <a [href]="url" target="_blank" rel="noopener" class="pdf">
          <svg lucideFileText aria-hidden="true"></svg>
          <span>{{ page().filename }}</span>
          <svg lucideExternalLink aria-hidden="true"></svg>
        </a>
      }
    } @else if (file.error()) {
      <p class="meta" role="alert" i18n="@@import.originalError">Original nije učitan.</p>
    } @else {
      <span class="placeholder" aria-hidden="true"></span>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .zoom {
      display: block;
      cursor: zoom-in;
    }

    img,
    .placeholder {
      display: block;
      inline-size: 100%;
      max-block-size: 80dvh;
      object-fit: contain;
      border-radius: var(--radius-md);
      background: var(--color-surface-sunken);
    }

    .placeholder {
      aspect-ratio: 3 / 4;
    }

    .pdf {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-4);
      border: var(--stroke-hairline) solid var(--color-border);
      border-radius: var(--radius-md);
      color: inherit;
    }

    .pdf svg {
      flex: none;
      inline-size: var(--size-icon-sm);
      block-size: var(--size-icon-sm);
    }
  `,
})
export class PageOriginal {
  readonly importId = input.required<string>();
  readonly page = input.required<ImportPage>();

  protected readonly openLabel = $localize`:@@import.openOriginal:Otvori original u punoj veličini`;
  private readonly api = inject(ImportsApi);
  private url: string | undefined;

  /** Reloads when the page's file changes (a retake bumps `attempts`). */
  protected readonly file = rxResource({
    // A string, so a poll that returns the same page again does not refetch the file.
    params: () => `${this.importId()}|${this.page().id}|${this.page().attempts}`,
    stream: ({ params }) =>
      this.api.pageFile(...(params.split('|') as [string, string])).pipe(
        map((blob) => {
          this.revoke();
          this.url = URL.createObjectURL(blob);
          return this.url;
        }),
      ),
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.revoke());
  }

  protected altText(): string {
    const n = this.page().page_index + 1;
    return $localize`:@@import.originalAlt:Original, stranica ${n}:number:`;
  }

  private revoke(): void {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = undefined;
  }
}
