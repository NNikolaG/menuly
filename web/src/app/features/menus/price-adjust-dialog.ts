import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { form, FormField, max, min, required, submit, validate } from '@angular/forms/signals';
import type { MenuTree, PriceAdjustment } from '../../core/menus/menu';
import { AppButton, AppDialog, AppField, AppInput, AppSegmented, AppSelect } from '../../shared/ui';
import { toMajor, toMinor } from './price';

export interface PriceAdjustDialogData {
  menu: MenuTree;
  currency: string;
}

interface PriceAdjustModel {
  /** Category id, or '' for the whole menu. */
  scope: string;
  mode: 'percent' | 'amount';
  value: number | null;
  /** Rounding step in major units, as a string for the select; '0' = none. */
  round: string;
}

/** Shows this many example prices before/after. */
const PREVIEW = 5;

/** Bulk price change: whole menu or one category, by percent or a fixed amount, with rounding. */
@Component({
  selector: 'app-price-adjust-dialog',
  imports: [
    CurrencyPipe,
    FormField,
    AppDialog,
    AppButton,
    AppField,
    AppInput,
    AppSegmented,
    AppSelect,
  ],
  template: `
    <form novalidate (submit)="onSubmit($event)">
      <app-dialog [title]="title">
        <div class="stack" data-gap="4">
          <app-field
            i18n-label="@@prices.field.scope"
            label="Šta menjaš"
            controlId="price-scope"
            [field]="form.scope"
          >
            <app-select controlId="price-scope" [options]="scopes()" [formField]="form.scope" />
          </app-field>

          <div class="stack" data-gap="2">
            <span class="label" i18n="@@prices.field.mode">Kako</span>
            <app-segmented [label]="modeLabel" [options]="modes" [formField]="form.mode" />
          </div>

          <div class="pair">
            <app-field
              [label]="model().mode === 'percent' ? percentLabel : amountLabel"
              controlId="price-value"
              [suffix]="model().mode === 'percent' ? '%' : data.currency"
              i18n-hint="@@prices.field.valueHint"
              hint="Negativan broj snižava cene."
              [field]="form.value"
            >
              <input
                appInput
                variant="price"
                type="number"
                step="any"
                inputmode="decimal"
                id="price-value"
                [formField]="form.value"
              />
            </app-field>
            <app-field
              i18n-label="@@prices.field.round"
              label="Zaokruži na"
              controlId="price-round"
              [field]="form.round"
            >
              <app-select controlId="price-round" [options]="rounding()" [formField]="form.round" />
            </app-field>
          </div>

          <section class="preview stack" data-gap="2" aria-live="polite">
            @if (preview().changed) {
              <p class="label">
                <span i18n="@@prices.preview">{preview().changed, plural,
                  one {Menja se {{ preview().changed }} cena}
                  few {Menja se {{ preview().changed }} cene}
                  other {Menja se {{ preview().changed }} cena}
                }</span>
              </p>
              <ul class="stack" data-gap="1">
                @for (row of preview().rows; track $index) {
                  <li class="row" data-justify="between">
                    <span>{{ row.name }}</span>
                    <span class="nums">
                      <s>{{ toMajor(row.before) | currency: data.currency : 'code' : '1.0-2' }}</s>
                      →
                      <strong>{{
                        toMajor(row.after) | currency: data.currency : 'code' : '1.0-2'
                      }}</strong>
                    </span>
                  </li>
                }
              </ul>
              <p class="meta" i18n="@@prices.previewNote">
                Pregled je približan; tačne cene računa server. Svaka promena ide u istoriju cena.
              </p>
            } @else {
              <p class="meta" i18n="@@prices.previewEmpty">
                Unesi iznos da vidiš kako se cene menjaju.
              </p>
            }
          </section>
        </div>
        <button
          dialog-actions
          appButton
          variant="secondary"
          type="button"
          (click)="ref.close()"
          i18n="@@common.cancel"
        >
          Otkaži
        </button>
        <button
          dialog-actions
          appButton
          type="submit"
          [disabled]="!preview().changed"
          i18n="@@prices.apply"
        >
          Promeni cene
        </button>
      </app-dialog>
    </form>
  `,
  styles: `
    .label {
      font: var(--type-label);
      color: var(--color-text);
    }

    .pair {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: var(--space-3);
    }

    .pair {
      align-items: start;
    }

    .pair app-field,
    .pair app-select {
      min-inline-size: 0;
    }

    .preview {
      padding: var(--space-3);
      border-radius: var(--radius-sm);
      background: var(--color-surface-sunken);
    }

    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .nums {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    s {
      color: var(--color-text-subtle);
    }
  `,
})
export class PriceAdjustDialog {
  protected readonly ref = inject<DialogRef<PriceAdjustment>>(DialogRef);
  protected readonly data = inject<PriceAdjustDialogData>(DIALOG_DATA);
  protected readonly toMajor = toMajor;

  protected readonly title = $localize`:@@prices.title:Promena cena`;
  protected readonly modeLabel = $localize`:@@prices.field.mode:Kako`;
  protected readonly percentLabel = $localize`:@@prices.field.percent:Za procenat`;
  protected readonly amountLabel = $localize`:@@prices.field.amount:Za iznos`;
  protected readonly modes = [
    { value: 'percent', label: $localize`:@@prices.mode.percent:Procenat` },
    { value: 'amount', label: $localize`:@@prices.mode.amount:Iznos` },
  ];

  protected readonly scopes = computed(() => [
    { value: '', label: $localize`:@@prices.scope.all:Ceo meni` },
    ...this.data.menu.categories.map((category) => ({ value: category.id, label: category.name })),
  ]);
  protected readonly rounding = computed(() => [
    { value: '0', label: $localize`:@@prices.round.none:Bez zaokruživanja` },
    ...[1, 5, 10, 50, 100].map((step) => ({
      value: String(step),
      label: `${step} ${this.data.currency}`,
    })),
  ]);

  protected readonly model = signal<PriceAdjustModel>({
    scope: '',
    mode: 'percent',
    value: null,
    round: this.data.currency === 'RSD' ? '10' : '0',
  });
  protected readonly form = form(this.model, (path) => {
    required(path.value, {
      message: $localize`:@@prices.field.valueRequired:Unesi procenat ili iznos.`,
    });
    validate(path.value, ({ value }) =>
      value() === 0
        ? {
            kind: 'zero',
            message: $localize`:@@prices.field.valueZero:Unesi broj različit od nule.`,
          }
        : undefined,
    );
    min(path.value, () => (this.model().mode === 'percent' ? -90 : -Infinity));
    max(path.value, () => (this.model().mode === 'percent' ? 500 : Infinity));
  });

  /** Client-side estimate of the result, so the owner sees what happens before saving. */
  protected readonly preview = computed(() => {
    const { scope, mode, value, round } = this.model();
    if (!value) return { changed: 0, rows: [] };
    const step = toMinor(Number(round));
    const rows: { name: string; before: number; after: number }[] = [];
    let changed = 0;
    for (const category of this.data.menu.categories) {
      if (scope && category.id !== scope) continue;
      for (const item of category.items) {
        for (const variant of item.variants) {
          const after = adjust(variant.price_minor, mode, value, step);
          if (after === variant.price_minor) continue;
          changed++;
          if (rows.length < PREVIEW) {
            const name = variant.label ? `${item.name} · ${variant.label}` : item.name;
            rows.push({ name, before: variant.price_minor, after });
          }
        }
      }
    }
    return { changed, rows };
  });

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.form, async (field) => {
      const { scope, mode, value, round } = field().value();
      const result: PriceAdjustment = { round_to_minor: toMinor(Number(round)) };
      if (scope) result.category_id = scope;
      if (mode === 'percent') result.percent = value ?? 0;
      else result.amount_minor = toMinor(value ?? 0);
      this.ref.close(result);
      return undefined;
    });
  }
}

/** Same rule as the server (`adjustPrice`): change, round to a minor unit, then to the nearest `step`; never below 0. */
export function adjust(
  price: number,
  mode: 'percent' | 'amount',
  value: number,
  step: number,
): number {
  let next = Math.round(
    mode === 'percent' ? (price * (100 + value)) / 100 : price + toMinor(value),
  );
  if (step > 1) next = Math.round(next / step) * step;
  return Math.max(0, next);
}
