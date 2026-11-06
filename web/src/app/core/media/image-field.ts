import { Component, inject, input, model, signal } from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import { LucideImageUp, LucideLoaderCircle, LucideTrash2 } from '@lucide/angular';
import { firstValueFrom } from 'rxjs';
import { AppButton } from '../../shared/ui';
import { toApiError } from '../api/api-error';
import { MediaApi, type ImagePurpose } from './media-api';

/** Types the server takes; listing them (not `image/*`) makes iPhone Safari send JPEG instead of HEIC. */
const ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * An image URL field that uploads: pick or photograph a picture, it goes to `/v1/media/images` and the field holds
 * the returned public URL. Works with Signal Forms: `<app-image-field purpose="item" [formField]="form.image_url" />`.
 */
@Component({
  selector: 'app-image-field',
  imports: [AppButton, LucideImageUp, LucideLoaderCircle, LucideTrash2],
  template: `
    <div class="field" [attr.data-shape]="purpose()">
      @if (value()) {
        <img class="preview" [src]="value()" alt="" />
      } @else {
        <span class="preview empty" aria-hidden="true"></span>
      }
      <div class="stack" data-gap="2">
        <div class="row" data-gap="2">
          <label
            class="upload"
            data-variant="secondary"
            data-size="sm"
            appButton
            [attr.aria-disabled]="busy() || disabled() || null"
          >
            @if (busy()) {
              <svg lucideLoaderCircle class="spin" aria-hidden="true"></svg>
              <ng-container i18n="@@image.uploading">Otpremam…</ng-container>
            } @else {
              <svg lucideImageUp aria-hidden="true"></svg>
              @if (value()) {
                <ng-container i18n="@@image.replace">Zameni sliku</ng-container>
              } @else {
                <ng-container i18n="@@image.upload">Dodaj sliku</ng-container>
              }
            }
            <input
              type="file"
              class="visually-hidden"
              [id]="controlId() || null"
              [accept]="accept"
              [disabled]="busy() || disabled()"
              (change)="upload($event)"
            />
          </label>
          @if (value() && !busy()) {
            <button
              appButton
              variant="ghost"
              size="sm"
              type="button"
              [disabled]="disabled()"
              (click)="clear()"
              i18n-aria-label="@@image.remove"
              aria-label="Ukloni sliku"
            >
              <svg lucideTrash2 aria-hidden="true"></svg>
            </button>
          }
        </div>
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        } @else {
          <p class="meta" i18n="@@image.hint">JPEG, PNG ili WebP, do 10 MB.</p>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .field {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }

    .preview {
      flex: none;
      inline-size: 4.5rem;
      block-size: 4.5rem;
      object-fit: cover;
      border: var(--stroke-hairline) solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-surface-sunken);
    }

    [data-shape='cover'] .preview {
      inline-size: 8rem;
    }

    [data-shape='logo'] .preview {
      object-fit: contain;
    }

    .upload {
      cursor: pointer;
    }

    .upload[aria-disabled='true'] {
      opacity: 0.6;
      pointer-events: none;
    }

    .upload:has(input:focus-visible) {
      outline: var(--stroke-focus) solid var(--color-focus);
      outline-offset: var(--stroke-focus);
    }

    .spin {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to {
        rotate: 360deg;
      }
    }

    .error {
      font: var(--type-meta);
      color: var(--color-danger);
    }

    .visually-hidden {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `,
})
export class AppImageField implements FormValueControl<string> {
  readonly value = model('');
  readonly touched = model(false);
  readonly disabled = input(false);
  readonly purpose = input<ImagePurpose>('item');
  /** Id of the file input, for `<app-field controlId>`. */
  readonly controlId = input('');

  protected readonly accept = ACCEPT;
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  private readonly api = inject(MediaApi);

  protected async upload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.error.set('');
    this.touched.set(true);
    if (!ACCEPT.split(',').includes(file.type))
      return this.error.set(errorText('unsupported_file'));
    if (file.size > MAX_BYTES) return this.error.set(errorText('validation_failed'));
    this.busy.set(true);
    try {
      const image = await firstValueFrom(this.api.uploadImage(file, this.purpose()));
      this.value.set(image.url);
    } catch (error) {
      const apiError = toApiError(error);
      this.error.set(errorText(apiError.status === 415 ? 'unsupported_file' : apiError.code));
    } finally {
      this.busy.set(false);
    }
  }

  protected clear(): void {
    this.value.set('');
    this.touched.set(true);
    this.error.set('');
  }
}

function errorText(code: string): string {
  switch (code) {
    case 'unsupported_file':
      return $localize`:@@image.error.type:Pošalji JPEG, PNG ili WebP sliku (na iPhone-u izaberi „Najkompatibilnije“).`;
    case 'validation_failed':
    case 'invalid_upload':
      return $localize`:@@image.error.size:Slika je veća od 10 MB.`;
    case 'imports_unavailable':
      return $localize`:@@image.error.unavailable:Otpremanje slika trenutno nije dostupno.`;
    case 'forbidden':
      return $localize`:@@common.forbidden:Nemaš dozvolu za ovu radnju.`;
    default:
      return $localize`:@@image.error.unknown:Slika nije otpremljena. Pokušaj ponovo.`;
  }
}
