import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { LucideCheck, LucideCopy, LucideDownload } from '@lucide/angular';
import { firstValueFrom, map } from 'rxjs';
import { VenuesApi, type QrFormat } from '../../core/venues/venues-api';
import { AppButton } from '../../shared/ui';

/** QR code of the venue's guest link: preview, copy link, download PNG (print/web) or SVG (any size). */
@Component({
  selector: 'app-venue-qr',
  imports: [AppButton, LucideCheck, LucideCopy, LucideDownload],
  template: `
    <div class="qr">
      @if (preview.value(); as src) {
        <img [src]="src" alt="" width="160" height="160" />
      } @else if (preview.error()) {
        <p class="meta" role="alert" i18n="@@venue.qr.loadError">QR kod nije učitan.</p>
      } @else {
        <span class="placeholder" aria-hidden="true"></span>
      }
    </div>
    @if (url()) {
      <p class="link">
        <span>{{ url() }}</span>
        <button
          appButton
          variant="ghost"
          size="sm"
          type="button"
          [attr.aria-label]="copied() ? copiedLabel : copyLabel"
          (click)="copy()"
        >
          @if (copied()) {
            <svg lucideCheck aria-hidden="true"></svg>
          } @else {
            <svg lucideCopy aria-hidden="true"></svg>
          }
        </button>
      </p>
    }
    <div class="row" data-gap="2">
      <button
        appButton
        variant="secondary"
        size="sm"
        type="button"
        [disabled]="busy()"
        (click)="download('png')"
      >
        <svg lucideDownload aria-hidden="true"></svg>
        PNG
      </button>
      <button
        appButton
        variant="secondary"
        size="sm"
        type="button"
        [disabled]="busy()"
        (click)="download('svg')"
      >
        <svg lucideDownload aria-hidden="true"></svg>
        SVG
      </button>
    </div>
    <p class="meta" i18n="@@venue.qr.hint">SVG je oštar u svakoj veličini, za štampu na stolu.</p>
    @if (error()) {
      <p role="alert" class="error" i18n="@@venue.qr.downloadError">Preuzimanje nije uspelo.</p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-3);
      justify-items: start;
    }

    .qr {
      padding: var(--space-2);
      border-radius: var(--radius-sm);
      background: #fff;
      line-height: 0;
    }

    .qr img,
    .placeholder {
      display: block;
      inline-size: 160px;
      block-size: 160px;
    }

    .link {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      font: var(--type-meta);
      overflow-wrap: anywhere;
    }

    .error {
      color: var(--color-danger);
    }
  `,
})
export class VenueQr {
  readonly venueId = input.required<string>();
  readonly venueSlug = input.required<string>();
  /** Guest URL shown under the code. */
  readonly url = input('');

  private readonly api = inject(VenuesApi);
  private readonly document = inject(DOCUMENT);

  protected readonly busy = signal(false);
  protected readonly error = signal(false);
  protected readonly copied = signal(false);
  protected readonly copyLabel = $localize`:@@venue.qr.copy:Kopiraj link`;
  protected readonly copiedLabel = $localize`:@@venue.qr.copied:Link je kopiran`;

  private previewUrl: string | undefined;
  /** The QR needs the Authorization header, so it is loaded as a blob and shown through an object URL. */
  protected readonly preview = rxResource({
    params: () => this.venueId(),
    stream: ({ params }) =>
      this.api.qr(params, 'svg').pipe(
        map((blob) => {
          this.revoke();
          this.previewUrl = URL.createObjectURL(blob);
          return this.previewUrl;
        }),
      ),
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.revoke());
  }

  protected async download(format: QrFormat): Promise<void> {
    this.busy.set(true);
    this.error.set(false);
    try {
      const blob = await firstValueFrom(
        this.api.qr(this.venueId(), format, format === 'png' ? 1024 : undefined),
      );
      const href = URL.createObjectURL(blob);
      const link = this.document.createElement('a');
      link.href = href;
      link.download = `menuly-${this.venueSlug()}.${format}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch {
      this.error.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  protected async copy(): Promise<void> {
    try {
      const url = this.url();
      await navigator.clipboard.writeText(/^https?:/.test(url) ? url : `https://${url}`);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // Clipboard blocked (insecure context); the link stays visible to copy by hand.
    }
  }

  private revoke(): void {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = undefined;
  }
}
