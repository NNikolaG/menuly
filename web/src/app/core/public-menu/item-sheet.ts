import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { LucideX } from '@lucide/angular';
import { isHighlight, labelOf } from '../menus/menu-labels';
import type { PublicItem } from './public-menu';

export interface ItemSheetData {
  item: PublicItem;
  currency: string;
  /** Theme attributes of the menu, so the sheet (rendered in the overlay) matches it. */
  attrs: { tenant: string; font: string; theme: string | null };
}

let nextId = 0;

/** Item detail as a bottom sheet: big photo, full description, all sizes, allergens in words. */
@Component({
  selector: 'app-item-sheet',
  imports: [CurrencyPipe, LucideX],
  host: {
    '[attr.data-tenant]': 'data.attrs.tenant',
    '[attr.data-font]': 'data.attrs.font',
    '[attr.data-theme]': 'data.attrs.theme',
    '[attr.aria-labelledby]': 'titleId',
  },
  template: `
    @let item = data.item;
    <button
      type="button"
      class="pill-btn close"
      i18n-aria-label="@@common.close"
      aria-label="Zatvori"
      (click)="ref.close()"
    >
      <svg lucideX aria-hidden="true"></svg>
    </button>
    @if (item.image_url) {
      <img class="photo" [src]="item.image_url" alt="" />
    }
    <div class="body">
      <div class="stack" data-gap="2">
        @if (highlights.length || !item.is_available) {
          <div class="row" data-gap="1">
            @if (!item.is_available) {
              <span class="badge" data-tone="danger" i18n="@@publicMenu.unavailable"
                >Nema danas</span
              >
            }
            @for (tag of highlights; track tag) {
              <span class="badge" data-tone="accent" data-plain>{{ labelOf(tag) }}</span>
            }
          </div>
        }
        <h2 class="name" [id]="titleId">{{ item.name }}</h2>
        @if (item.description) {
          <p class="desc">{{ item.description }}</p>
        }
      </div>

      <dl class="prices">
        @for (variant of item.variants; track variant.id) {
          <div class="price-row">
            <dt>
              @if (variant.label) {
                {{ variant.label }}
              } @else {
                <ng-container i18n="@@publicMenu.price">Cena</ng-container>
              }
            </dt>
            <dd class="price" data-size="lg">
              {{ variant.price_minor / 100 | currency: data.currency : 'code' : '1.0-2' }}
            </dd>
          </div>
        }
      </dl>

      @if (others.length) {
        <div class="stack" data-gap="2">
          <p class="eyebrow" i18n="@@publicMenu.tags">Oznake</p>
          <div class="row" data-gap="1">
            @for (tag of others; track tag) {
              <span class="tag">{{ labelOf(tag) }}</span>
            }
          </div>
        </div>
      }
      <div class="stack" data-gap="2">
        <p class="eyebrow" i18n="@@publicMenu.allergens">Alergeni</p>
        @if (item.allergens.length) {
          <div class="row" data-gap="1">
            @for (allergen of item.allergens; track allergen) {
              <span class="tag">{{ labelOf(allergen) }}</span>
            }
          </div>
        } @else {
          <p class="meta" i18n="@@publicMenu.noAllergens">
            Lokal nije naveo alergene. Pitaj osoblje ako nisi siguran.
          </p>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      inline-size: 100%;
      max-block-size: 88dvh;
      overflow-y: auto;
      background: var(--color-surface-raised);
      color: var(--color-text);
      font: var(--type-body);
      border-start-start-radius: var(--radius-lg);
      border-start-end-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      overscroll-behavior: contain;
    }

    .close {
      position: absolute;
      inset-block-start: var(--space-3);
      inset-inline-end: var(--space-3);
      z-index: 1;
    }

    .photo {
      display: block;
      inline-size: 100%;
      aspect-ratio: 4 / 3;
      object-fit: cover;
    }

    .body {
      display: flex;
      flex-direction: column;
      gap: var(--space-6);
      padding: var(--space-6) var(--space-5) var(--space-8);
    }

    .name {
      font: var(--type-h1);
      letter-spacing: var(--tracking-h1);
      padding-inline-end: var(--space-12);
    }

    .desc {
      font: var(--type-body-lg);
      color: var(--color-text-muted);
    }

    .prices {
      display: flex;
      flex-direction: column;
    }

    .price-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: var(--space-4);
      padding-block: var(--space-3);
      border-block-end: var(--stroke-hairline) dashed var(--color-border);
    }
  `,
})
export class ItemSheet {
  protected readonly ref = inject(DialogRef);
  protected readonly data = inject<ItemSheetData>(DIALOG_DATA);
  protected readonly labelOf = labelOf;
  protected readonly titleId = `item-sheet-title-${nextId++}`;
  protected readonly highlights = this.data.item.tags.filter(isHighlight);
  protected readonly others = this.data.item.tags.filter((tag) => !isHighlight(tag));
}
