import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { form, FormField, pattern, submit } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { LucideArrowLeft, LucideCheck } from '@lucide/angular';
import { firstValueFrom } from 'rxjs';
import { toApiError } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth-store';
import type { MenuTree } from '../../core/menus/menu';
import {
  DEFAULT_MENU_THEME,
  MENU_ACCENTS,
  MENU_COLOR_MODES,
  MENU_FONTS,
  MENU_TEMPLATES,
  type MenuTemplate,
  type MenuTheme,
} from '../../core/menus/menu-theme';
import { MenusApi } from '../../core/menus/menus-api';
import type { Venue } from '../../core/venues/venue';
import { VenuesApi } from '../../core/venues/venues-api';
import { AppButton, AppField, AppInput, AppSegmented, AppSwitch } from '../../shared/ui';
import type { PublicMenu } from '../../core/public-menu/public-menu';
import { PublicMenuView } from '../../core/public-menu/public-menu-view';

const URL_PATTERN = /^(https?:\/\/\S+)?$/;

/** `/meniji/:menuId/dizajn`: pick the menu's template, accent, font and options with a live preview. */
@Component({
  selector: 'app-menu-design-page',
  imports: [
    FormField,
    RouterLink,
    AppButton,
    AppField,
    AppInput,
    AppSegmented,
    AppSwitch,
    PublicMenuView,
    LucideArrowLeft,
    LucideCheck,
  ],
  template: `
    @if (menu.value(); as tree) {
      <div class="stack" data-gap="6">
        <div class="stack" data-gap="2">
          <a appButton variant="ghost" size="sm" [routerLink]="['/meniji', tree.id]" class="back">
            <svg lucideArrowLeft aria-hidden="true"></svg>
            {{ tree.name }}
          </a>
          <div class="row" data-justify="between">
            <h1 i18n="@@menuDesign.heading">Dizajn menija</h1>
            @if (canEdit()) {
              <div class="row" data-gap="3">
                @if (saved() && !dirty()) {
                  <span class="meta saved" role="status">
                    <svg lucideCheck aria-hidden="true" [size]="16"></svg>
                    <ng-container i18n="@@menuDesign.saved">Sačuvano</ng-container>
                  </span>
                }
                <button
                  appButton
                  variant="ghost"
                  type="button"
                  [disabled]="!dirty()"
                  (click)="reset()"
                  i18n="@@menuDesign.reset"
                >
                  Poništi izmene
                </button>
                <button
                  appButton
                  type="submit"
                  form="design-form"
                  [disabled]="!dirty() || themeForm().submitting()"
                  i18n="@@common.save"
                >
                  Sačuvaj
                </button>
              </div>
            }
          </div>
          @if (error()) {
            <p role="alert" class="error">{{ error() }}</p>
          }
        </div>

        <div class="layout">
          <form
            id="design-form"
            class="stack controls"
            data-gap="8"
            novalidate
            (submit)="save($event)"
          >
            <fieldset class="stack" data-gap="3" [disabled]="!canEdit()">
              <legend class="card__title" i18n="@@menuDesign.template">Šablon</legend>
              <div class="templates">
                @for (option of templates; track option.value) {
                  <label class="option">
                    <input
                      type="radio"
                      name="template"
                      [value]="option.value"
                      [checked]="draft().template === option.value"
                      (change)="pickTemplate(option.value)"
                    />
                    <span class="option__name">{{ option.label }}</span>
                    <span class="option__body">{{ option.description }}</span>
                  </label>
                }
              </div>
            </fieldset>

            <fieldset class="stack" data-gap="3" [disabled]="!canEdit()">
              <legend class="card__title" i18n="@@menuDesign.accent">Boja lokala</legend>
              <p class="card__body" i18n="@@menuDesign.accentHint">
                Vidi se samo u akcentima: aktivna kategorija, bedževi i kombo ponude.
              </p>
              <div class="swatches">
                @for (option of accents; track option.value) {
                  <label class="swatch" [attr.data-tenant]="option.value" [title]="option.label">
                    <input
                      type="radio"
                      name="accent"
                      [value]="option.value"
                      [checked]="draft().accent === option.value"
                      (change)="patch({ accent: option.value })"
                    />
                    <span class="swatch__dot" aria-hidden="true"></span>
                    <span class="swatch__label">{{ option.label }}</span>
                  </label>
                }
              </div>
            </fieldset>

            <div class="row" data-gap="8">
              <div class="stack" data-gap="2">
                <span class="card__title" i18n="@@menuDesign.font">Font</span>
                <app-segmented
                  i18n-label="@@menuDesign.font"
                  label="Font"
                  [options]="fonts"
                  [value]="draft().font"
                  (valueChange)="patch({ font: $any($event) })"
                />
              </div>
              <div class="stack" data-gap="2">
                <span class="card__title" i18n="@@menuDesign.mode">Tema</span>
                <app-segmented
                  i18n-label="@@menuDesign.mode"
                  label="Tema"
                  [options]="modes"
                  [value]="draft().color_mode"
                  (valueChange)="patch({ color_mode: $any($event) })"
                />
              </div>
            </div>

            <fieldset class="stack" data-gap="3" [disabled]="!canEdit()">
              <legend class="card__title" i18n="@@menuDesign.show">Prikaz</legend>
              <label class="row" data-gap="3">
                <input type="checkbox" appSwitch [formField]="themeForm.show_images" />
                <span i18n="@@menuDesign.showImages">Slike stavki i naslovna slika</span>
              </label>
              <label class="row" data-gap="3">
                <input type="checkbox" appSwitch [formField]="themeForm.show_descriptions" />
                <span i18n="@@menuDesign.showDescriptions">Opisi stavki i kategorija</span>
              </label>
              <label class="row" data-gap="3">
                <input type="checkbox" appSwitch [formField]="themeForm.show_pattern" />
                <span i18n="@@menuDesign.showPattern">Bauhaus uzorak lokala u zaglavlju</span>
              </label>
            </fieldset>

            <fieldset class="stack" data-gap="4" [disabled]="!canEdit()">
              <legend class="card__title" i18n="@@menuDesign.images">Logo i naslovna slika</legend>
              <app-field
                i18n-label="@@menuDesign.logoUrl"
                label="Logo (URL slike)"
                controlId="design-logo"
                i18n-hint="@@menuDesign.urlHint"
                hint="Link na sliku, npr. https://…/logo.png"
                [field]="themeForm.logo_url"
              >
                <input appInput id="design-logo" type="url" [formField]="themeForm.logo_url" />
              </app-field>
              <app-field
                i18n-label="@@menuDesign.coverUrl"
                label="Naslovna slika (URL)"
                controlId="design-cover"
                i18n-hint="@@menuDesign.coverHint"
                hint="Zamenjuje uzorak u zaglavlju kada su slike uključene."
                [field]="themeForm.cover_url"
              >
                <input appInput id="design-cover" type="url" [formField]="themeForm.cover_url" />
              </app-field>
            </fieldset>
          </form>

          <section class="preview-wrap" aria-labelledby="preview-title">
            <div class="row" data-justify="between">
              <h2 class="eyebrow" id="preview-title" i18n="@@menuDesign.preview">Pregled</h2>
              <span class="meta" i18n="@@menuDesign.previewHint"
                >Ovako gost vidi meni na telefonu</span
              >
            </div>
            <div class="phone">
              @if (preview(); as data) {
                <app-public-menu-view [menu]="data" [theme]="draft()" [preview]="true" />
              }
            </div>
          </section>
        </div>
      </div>
    } @else if (menu.error()) {
      <p role="alert" i18n="@@menu.notFound">Meni nije pronađen.</p>
    } @else {
      <p class="meta" i18n="@@common.loading">Učitavanje…</p>
    }
  `,
  styles: `
    .back {
      align-self: flex-start;
    }

    .error {
      color: var(--color-danger);
    }

    .saved {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      color: var(--color-success);
    }

    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, var(--size-phone-width));
      align-items: start;
      gap: var(--space-8);
    }

    @media (max-width: 720px) {
      .layout {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    fieldset {
      min-inline-size: 0;
      margin: 0;
      padding: 0;
      border: 0;
    }

    legend {
      padding: 0;
    }

    .templates {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--size-option-min)), 1fr));
      gap: var(--space-3);
    }

    .option {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      padding: var(--space-4);
      border: var(--stroke-hairline) solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      cursor: pointer;
    }

    .option:has(:checked) {
      border-color: var(--color-text);
      box-shadow: inset 0 0 0 var(--stroke-hairline) var(--color-text);
    }

    .option:has(:focus-visible) {
      outline: var(--stroke-focus) solid var(--color-focus);
      outline-offset: var(--focus-offset);
    }

    .option input,
    .swatch input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }

    .option__name {
      font: var(--type-h4);
    }

    .option__body {
      font: var(--type-body-sm);
      color: var(--color-text-muted);
    }

    .swatches {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .swatch {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      block-size: var(--control-md);
      padding-inline: var(--space-2) var(--space-3);
      border: var(--stroke-hairline) solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      font: var(--type-label);
      cursor: pointer;
    }

    .swatch:has(:checked) {
      border-color: var(--color-text);
      box-shadow: inset 0 0 0 var(--stroke-hairline) var(--color-text);
    }

    .swatch:has(:focus-visible) {
      outline: var(--stroke-focus) solid var(--color-focus);
      outline-offset: var(--focus-offset);
    }

    .swatch__dot {
      inline-size: var(--size-swatch);
      block-size: var(--size-swatch);
      border-radius: var(--radius-pill);
      background: var(--color-accent);
    }

    .preview-wrap {
      position: sticky;
      inset-block-start: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .phone {
      block-size: min(var(--size-phone-height), 80dvh);
      overflow-y: auto;
      border: var(--stroke-phone) solid var(--color-text);
      border-radius: var(--radius-phone);
      background: var(--color-bg);
      overscroll-behavior: contain;
    }
  `,
})
export default class MenuDesignPage {
  private readonly api = inject(MenusApi);
  private readonly auth = inject(AuthStore);

  readonly menuId = input.required<string>();

  protected readonly menu = this.api.menuResource(this.menuId);
  protected readonly venue = inject(VenuesApi).venueResource(() => this.menu.value()?.venue_id);
  private readonly theme = this.api.themeResource(this.menuId);

  protected readonly templates = MENU_TEMPLATES;
  protected readonly accents = MENU_ACCENTS;
  protected readonly fonts = MENU_FONTS.map(({ value, label }) => ({ value, label }));
  protected readonly modes = MENU_COLOR_MODES;

  /** Last saved theme (from the API, then from each save). */
  private readonly savedTheme = linkedSignal<MenuTheme>(
    () => (this.theme.hasValue() ? this.theme.value() : undefined) ?? DEFAULT_MENU_THEME,
  );
  /** The unsaved draft the preview shows. */
  protected readonly draft = linkedSignal<MenuTheme>(() => this.savedTheme());
  protected readonly themeForm = form(this.draft, (path) => {
    const message = $localize`:@@menuDesign.urlInvalid:Unesi link koji počinje sa https://`;
    pattern(path.logo_url, URL_PATTERN, { message });
    pattern(path.cover_url, URL_PATTERN, { message });
  });

  protected readonly dirty = computed(
    () => JSON.stringify(this.draft()) !== JSON.stringify(this.savedTheme()),
  );
  protected readonly saved = signal(false);
  protected readonly error = signal('');
  protected readonly canEdit = computed(() => {
    const role = this.auth.role();
    return role === 'owner' || role === 'manager';
  });

  protected readonly preview = computed(() => {
    const tree = this.menu.value();
    const venue = this.venue.value();
    return tree && venue ? toPublicMenu(tree, venue) : undefined;
  });

  protected patch(change: Partial<MenuTheme>): void {
    this.draft.update((theme) => ({ ...theme, ...change }));
    this.saved.set(false);
  }

  /** The board reads best dark in a bar, so picking it switches an "auto" menu to dark. */
  protected pickTemplate(template: MenuTemplate): void {
    const mode = this.draft().color_mode;
    this.patch({
      template,
      color_mode: template === 'tabla' && mode === 'auto' ? 'dark' : mode,
    });
  }

  protected reset(): void {
    this.draft.set(this.savedTheme());
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    this.error.set('');
    await submit(this.themeForm, async (field) => {
      try {
        const saved = await firstValueFrom(this.api.saveTheme(this.menuId(), field().value()));
        this.savedTheme.set(saved);
        this.saved.set(true);
      } catch (error) {
        this.error.set(
          toApiError(error).code === 'forbidden'
            ? $localize`:@@common.forbidden:Nemaš dozvolu za ovu radnju.`
            : $localize`:@@menuDesign.saveError:Dizajn nije sačuvan. Proveri linkove i pokušaj ponovo.`,
        );
      }
      return undefined;
    });
  }
}

/** The editor's tree as the guest would get it: visible content only, current draft included. */
export function toPublicMenu(tree: MenuTree, venue: Venue): PublicMenu {
  return {
    lang: 'sr',
    tenant: { name: '', slug: '' },
    venue: {
      name: venue.name,
      slug: venue.slug,
      address: venue.address,
      phone: venue.phone,
      currency: venue.currency,
      timezone: venue.timezone,
    },
    menu: {
      id: tree.id,
      name: tree.name,
      published_at: tree.published_at,
      categories: tree.categories
        .filter((category) => category.is_visible)
        .map((category) => ({
          id: category.id,
          name: category.name,
          description: category.description,
          items: category.items
            .filter((item) => item.is_visible)
            .map((item) => ({
              id: item.id,
              name: item.name,
              description: item.description,
              tags: item.tags,
              allergens: item.allergens,
              image_url: item.image_url,
              is_available: item.is_available,
              variants: item.variants.map((v) => ({
                id: v.id,
                label: v.label,
                price_minor: v.price_minor,
              })),
            })),
        })),
    },
  };
}
