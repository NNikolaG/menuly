import { Dialog } from '@angular/cdk/dialog';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, signal, type TemplateRef } from '@angular/core';
import { form, FormField, minLength, required } from '@angular/forms/signals';
import {
  LucideArrowLeftRight,
  LucideChartColumn,
  LucideLayoutGrid,
  LucideLogOut,
  LucideQrCode,
  LucideSettings,
  LucideUtensils,
} from '@lucide/angular';
import { ThemeStore, type ThemePreference } from '../../core/theme/theme-store';
import {
  AppButton,
  AppDialog,
  AppField,
  AppInput,
  AppMenu,
  AppPattern,
  AppSegmented,
  AppSwitch,
  type AppMenuItem,
  type AppSegmentedOption,
} from '../../shared/ui';

const SEMANTIC_COLORS = [
  'bg',
  'surface',
  'surface-sunken',
  'surface-raised',
  'surface-hover',
  'surface-inverse',
  'border',
  'border-strong',
  'text',
  'text-muted',
  'text-subtle',
  'text-inverse',
  'text-disabled',
  'accent',
  'accent-hover',
  'on-accent',
  'accent-text',
  'accent-subtle',
  'focus',
  'info',
  'info-subtle',
  'success',
  'success-subtle',
  'warning',
  'warning-subtle',
  'danger',
  'danger-subtle',
  'on-danger',
];
const BRAND_COLORS = ['orange', 'amber', 'periwinkle', 'cobalt', 'pink', 'ink', 'paper'];
const TENANTS = [
  'tinta',
  'narandza',
  'espresso',
  'bordo',
  'maslina',
  'teget',
  'kobalt',
  'smaragd',
  'senf',
  'roze',
];
const TYPE_STYLES: { name: string; tracking?: string }[] = [
  { name: 'display-xl', tracking: 'display-xl' },
  { name: 'display-lg', tracking: 'display-lg' },
  { name: 'display-md', tracking: 'display-md' },
  { name: 'h1', tracking: 'h1' },
  { name: 'h2', tracking: 'h2' },
  { name: 'h3', tracking: 'h3' },
  { name: 'h4' },
  { name: 'body-lg' },
  { name: 'body' },
  { name: 'body-strong' },
  { name: 'body-sm' },
  { name: 'eyebrow', tracking: 'eyebrow' },
  { name: 'meta', tracking: 'meta' },
  { name: 'price' },
  { name: 'price-lg' },
];
const SPACES = ['1', '2', '3', '4', '5', '6', '8', '10', '12', '16', '24'];
const RADII = ['xs', 'sm', 'md', 'lg', 'pill'];

/** Every token, pattern and primitive variant. A primitive is done only when it is shown here. */
@Component({
  selector: 'app-design-page',
  imports: [
    DatePipe,
    DecimalPipe,
    FormField,
    AppButton,
    AppDialog,
    AppField,
    AppInput,
    AppMenu,
    AppPattern,
    AppSegmented,
    AppSwitch,
    LucideChartColumn,
    LucideLayoutGrid,
    LucideQrCode,
    LucideSettings,
    LucideUtensils,
  ],
  template: `
    <div class="page stack" data-gap="12" [attr.data-tenant]="tenant()">
      <header class="row" data-justify="between">
        <div class="stack" data-gap="1">
          <p class="eyebrow">Receipt · Menuly</p>
          <h1 i18n="@@design.heading">Dizajn sistem</h1>
        </div>
        <app-segmented
          label="Tema"
          [options]="themeOptions"
          [value]="theme.preference()"
          (valueChange)="setTheme($event)"
        />
      </header>

      <section class="stack">
        <h2>Tenant preset</h2>
        <p class="meta">data-tenant na omotaču menja samo 5 tokena akcenta.</p>
        <div class="chips">
          <button
            type="button"
            class="chip"
            [attr.aria-current]="!tenant()"
            (click)="tenant.set(null)"
          >
            podrazumevano
          </button>
          @for (key of tenants; track key) {
            <button
              type="button"
              class="chip"
              [attr.aria-current]="tenant() === key"
              (click)="tenant.set(key)"
            >
              {{ key }}
            </button>
          }
        </div>
      </section>

      <section class="stack">
        <h2>Boje</h2>
        <div class="themes">
          @for (mode of modes; track mode) {
            <div class="theme-panel stack" [attr.data-theme]="mode">
              <p class="eyebrow">{{ mode }}</p>
              <div class="swatches">
                @for (name of semanticColors; track name) {
                  <div class="swatch">
                    <span
                      class="chip-color"
                      [style.background]="'var(--color-' + name + ')'"
                    ></span>
                    <code class="meta">{{ name }}</code>
                  </div>
                }
              </div>
            </div>
          }
        </div>
        <p class="eyebrow">Brend (iste u obe teme)</p>
        <div class="swatches">
          @for (name of brandColors; track name) {
            <div class="swatch">
              <span
                class="chip-color"
                [style.background]="'var(--color-brand-' + name + ')'"
              ></span>
              <code class="meta">brand-{{ name }}</code>
            </div>
          }
        </div>
      </section>

      <section class="stack">
        <h2>Tipografija</h2>
        <div class="type-scale">
          @for (style of typeStyles; track style.name) {
            <code class="meta">{{ style.name }}</code>
            <span
              [style.font]="'var(--type-' + style.name + ')'"
              [style.letter-spacing]="
                style.tracking ? 'var(--tracking-' + style.tracking + ')' : null
              "
              [style.text-transform]="style.name === 'eyebrow' ? 'uppercase' : null"
              >Ćevapi i šopska · 1.250 RSD</span
            >
          }
        </div>
      </section>

      <section class="stack">
        <h2>Razmak, radijusi, senke</h2>
        <div class="stack" data-gap="2">
          @for (step of spaces; track step) {
            <div class="row">
              <code class="meta token-name">space-{{ step }}</code>
              <span class="space-bar" [style.inline-size]="'var(--space-' + step + ')'"></span>
            </div>
          }
        </div>
        <div class="row" data-gap="6">
          @for (radius of radii; track radius) {
            <div class="stack" data-gap="2">
              <span
                class="radius-box"
                [style.border-radius]="'var(--radius-' + radius + ')'"
              ></span>
              <code class="meta">radius-{{ radius }}</code>
            </div>
          }
          <div class="stack" data-gap="2">
            <span class="radius-box shadow-sm"></span>
            <code class="meta">shadow-sm</code>
          </div>
          <div class="stack" data-gap="2">
            <span class="radius-box shadow-lg"></span>
            <code class="meta">shadow-lg</code>
          </div>
        </div>
      </section>

      <section class="stack">
        <h2>Ikonice (Lucide, 1.5px)</h2>
        <div class="row" data-gap="6">
          @for (size of [16, 18, 20]; track size) {
            <div class="row" data-gap="2">
              <svg lucideLayoutGrid [size]="size"></svg>
              <svg lucideUtensils [size]="size"></svg>
              <svg lucideQrCode [size]="size"></svg>
              <svg lucideChartColumn [size]="size"></svg>
              <svg lucideSettings [size]="size"></svg>
              <code class="meta">{{ size }}px</code>
            </div>
          }
        </div>
      </section>

      <section class="stack">
        <h2>AppButton</h2>
        @for (size of buttonSizes; track size) {
          <div class="row">
            @for (variant of buttonVariants; track variant) {
              <button appButton type="button" [variant]="variant" [size]="size">
                {{ variant }} {{ size }}
              </button>
            }
          </div>
        }
        <div class="row">
          <button appButton type="button" disabled>Disabled</button>
          <a appButton variant="secondary" href="#">Link</a>
          <button appButton type="button"><svg lucideUtensils></svg> Dodaj stavku</button>
        </div>
      </section>

      <section class="stack">
        <h2>AppField + AppInput</h2>
        <div class="fields">
          <app-field label="Naziv" controlId="design-valid" [field]="sample.valid">
            <input appInput id="design-valid" [formField]="sample.valid" />
          </app-field>
          <app-field
            label="Naziv lokala"
            controlId="design-hint"
            hint="Gost vidi ovaj naziv u meniju."
            [field]="sample.hinted"
          >
            <input appInput id="design-hint" [formField]="sample.hinted" />
          </app-field>
          <app-field label="Invalid (touched)" controlId="design-invalid" [field]="sample.invalid">
            <input appInput id="design-invalid" [formField]="sample.invalid" />
          </app-field>
          <app-field label="Cena" controlId="design-price" suffix="RSD" [field]="sample.price">
            <input appInput variant="price" id="design-price" [formField]="sample.price" />
          </app-field>
          <app-field label="Opis" controlId="design-desc" [field]="sample.description">
            <textarea appInput id="design-desc" [formField]="sample.description"></textarea>
          </app-field>
        </div>
      </section>

      <section class="stack">
        <h2>AppSwitch</h2>
        <div class="row" data-gap="6">
          <label><input type="checkbox" appSwitch [formField]="sample.available" /> Dostupno</label>
          <label><input type="checkbox" appSwitch [formField]="sample.featured" /> Preporuka</label>
        </div>
      </section>

      <section class="stack">
        <h2>AppSegmented</h2>
        <app-segmented label="Period" [options]="periodOptions" [(value)]="period" />
        <p class="meta">Izabrano: {{ period() }}</p>
      </section>

      <section class="stack">
        <h2>AppMenu</h2>
        <div class="row">
          <app-menu
            label="Nikola Gutić"
            [items]="menuItems"
            (selected)="lastSelected.set($event)"
          />
          <p class="meta">Izabrano: {{ lastSelected() }}</p>
        </div>
      </section>

      <section class="stack">
        <h2>AppDialog</h2>
        <div class="row">
          <button appButton variant="secondary" type="button" (click)="openDialog(confirm)">
            Otvori dijalog
          </button>
        </div>
        <ng-template #confirm let-ref="dialogRef">
          <app-dialog title="Obriši stavku?">
            „Ćevapi (10 kom)" nestaje iz svih menija. Ovo ne može da se poništi.
            <button
              dialog-actions
              appButton
              variant="secondary"
              type="button"
              (click)="ref.close()"
            >
              Otkaži
            </button>
            <button dialog-actions appButton variant="danger" type="button" (click)="ref.close()">
              Obriši
            </button>
          </app-dialog>
        </ng-template>
      </section>

      <section class="stack">
        <h2>Badge + Tag</h2>
        <div class="row">
          <span class="badge" data-tone="success">Dostupno</span>
          <span class="badge" data-tone="warning">Uskoro nestaje</span>
          <span class="badge" data-tone="danger">Nema</span>
          <span class="badge" data-tone="info">Nacrt</span>
          <span class="badge" data-tone="accent">Novo</span>
          <span class="badge">Arhivirano</span>
          <span class="badge" data-plain>Bez tačke</span>
        </div>
        <div class="row" data-gap="1">
          <span class="tag">gluten</span>
          <span class="tag">laktoza</span>
          <span class="tag">orašasti plodovi</span>
          <span class="tag">vegan</span>
        </div>
      </section>

      <section class="stack">
        <h2>Card + Bento + Stat</h2>
        <div class="bento">
          <div class="card" data-span="2" data-rows="2">
            <div class="stat">
              <span class="stat__label">Skeniranja danas</span>
              <span class="stat__value">{{ 1284 | number }}</span>
              <span class="stat__delta" data-trend="up">+12% od juče</span>
            </div>
          </div>
          <div class="card" data-variant="inverse">
            <p class="card__eyebrow">Meni</p>
            <p class="card__title">Objavljen</p>
          </div>
          <div class="card" data-variant="accent">
            <p class="card__eyebrow">Akcent lokala</p>
            <p class="card__title">Promo kombo</p>
          </div>
          <div class="card" data-span="2">
            <div class="stat">
              <span class="stat__label">Nedostupno</span>
              <span class="stat__delta" data-trend="down">3 stavke</span>
            </div>
          </div>
        </div>
        <div class="card">
          <p class="card__eyebrow">Kartica</p>
          <p class="card__title">Topli napici</p>
          <p class="card__body">Kafa, čaj i kakao. 12 stavki, 2 nedostupne.</p>
        </div>
      </section>

      <section class="stack">
        <h2>Table</h2>
        <table class="table">
          <thead>
            <tr>
              <th>Stavka</th>
              <th>Status</th>
              <th data-num>Cena</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Espresso <span class="table__sub">Topli napici</span></td>
              <td><span class="badge" data-tone="success">Dostupno</span></td>
              <td data-num>{{ 220 | number }} RSD</td>
            </tr>
            <tr>
              <td>Ćevapi (10 kom) <span class="table__sub">Roštilj</span></td>
              <td><span class="badge" data-tone="danger">Nema</span></td>
              <td data-num>{{ 1250 | number }} RSD</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="stack">
        <h2>Javni meni: Chips + MenuItem</h2>
        <div class="menu-demo stack" data-gap="4">
          <nav class="chips" aria-label="Kategorije">
            <a class="chip" href="#" aria-current="true">Topli napici</a>
            <a class="chip" href="#">Roštilj</a>
            <a class="chip" href="#">Salate</a>
            <a class="chip" href="#">Deserti</a>
          </nav>
          <div>
            <div class="menu-cat">
              <h3 class="menu-cat__title">Roštilj</h3>
              <span class="menu-cat__count">3 STAVKE</span>
            </div>
            <article class="menu-item">
              <h4 class="menu-item__name">Pljeskavica</h4>
              <span class="menu-item__price">{{ 890 | number }} RSD</span>
              <p class="menu-item__desc">Junetina, kajmak, luk, lepinja iz krušne peći.</p>
              <div class="menu-item__meta">
                <span class="badge" data-tone="accent">Preporuka</span>
                <span class="tag">gluten</span>
                <span class="tag">laktoza</span>
              </div>
            </article>
            <article class="menu-item">
              <h4 class="menu-item__name">Šopska salata</h4>
              <span class="menu-item__price">{{ 450 | number }} RSD</span>
              <div class="menu-item__meta"><span class="tag">vegetarijansko</span></div>
            </article>
            <article class="menu-item" data-status="unavailable">
              <h4 class="menu-item__name">Ćevapi (10 kom)</h4>
              <span class="menu-item__price">{{ 1250 | number }} RSD</span>
              <div class="menu-item__meta">
                <span class="badge" data-tone="danger">Nema danas</span>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section class="stack">
        <h2>Sidebar</h2>
        <nav class="sidebar" aria-label="Dashboard">
          <div class="sidebar__venue">
            <span class="sidebar__mark">Z</span>
            <div>
              <div class="sidebar__venue-name">Kafana Zora</div>
              <div class="sidebar__venue-plan">BESPLATNO</div>
            </div>
          </div>
          <a class="nav-item" href="#" aria-current="page"><svg lucideLayoutGrid></svg> Pregled</a>
          <a class="nav-item" href="#"
            ><svg lucideUtensils></svg> Meniji <span class="nav-item__count">3</span></a
          >
          <a class="nav-item" href="#"><svg lucideQrCode></svg> QR kodovi</a>
          <div class="sidebar__section">Lokal</div>
          <a class="nav-item" href="#"><svg lucideSettings></svg> Podešavanja</a>
        </nav>
      </section>

      <section class="stack">
        <h2>Brend: Ticket, BrandTile, Pattern</h2>
        <div class="brand brand-demo stack">
          <div class="brand-grid">
            <div class="brand-tile" data-color="cobalt" data-span="2">
              <span class="brand-label">Menuly</span>
              <h3 class="brand-tile__headline">Meni koji se sam ažurira</h3>
            </div>
            <div class="brand-tile" data-color="amber">
              <span class="brand-label">Lokala</span>
              <span class="brand-tile__number">{{ 312 | number }}</span>
            </div>
            <div class="brand-tile" data-color="pink">
              <span class="brand-label">Skeniranja</span>
              <span class="brand-tile__caption">dnevno, prosečno po lokalu</span>
            </div>
            <div class="brand-tile" data-color="periwinkle">
              <span class="brand-label">OCR</span>
              <span class="brand-tile__caption">Slikaj meni, mi ga prepišemo.</span>
            </div>
            <div class="brand-tile" data-color="paper">
              <span class="brand-label">Paper</span>
              <span class="brand-tile__caption">Bela pločica za formu.</span>
            </div>
          </div>
          <div class="row" data-gap="6">
            <div class="ticket">
              <div class="ticket__art">
                <app-pattern seed="Kafana Zora" [cols]="4" [rows]="2" [fluid]="true" />
                <span class="ticket__punch"></span>
              </div>
              <div class="ticket__body">
                <div class="ticket__top">
                  <p class="ticket__title">Kafana Zora</p>
                  <span class="ticket__id">#0412</span>
                </div>
                <hr class="ticket__rule" />
                <div class="ticket__meta"><span>Sto</span><span>12</span></div>
                <div class="ticket__meta">
                  <span>Datum</span><span>{{ sampleDate | date: 'dd.MM.yyyy' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="stack">
        <h2>AppPattern</h2>
        <div class="brand brand-demo pattern-demo">
          <app-pattern seed="Kafana Mornar" />
          <app-pattern seed="Bar Dva Jelena" />
          <app-pattern seed="Kafana Mornar" [cols]="4" [rows]="2" [cell]="80" />
          <app-pattern seed="0412" [cols]="8" [rows]="1" [cell]="24" [big]="false" />
          <app-pattern seed="Kafa" [cols]="1" [rows]="1" [cell]="24" [big]="false" />
        </div>
      </section>

      <section class="stack">
        <h2>POS: PosTile + Receipt</h2>
        <div class="brand brand-demo pos-demo">
          <nav class="pos-nav" aria-label="Kategorije">
            <button type="button" class="pos-cat" data-color="amber" aria-current="true">
              <app-pattern
                class="pos-cat__swatch"
                seed="Kafa"
                [cols]="1"
                [rows]="1"
                [big]="false"
              />
              Kafa
            </button>
            <button type="button" class="pos-cat" data-color="periwinkle">
              <app-pattern
                class="pos-cat__swatch"
                seed="Sokovi"
                [cols]="1"
                [rows]="1"
                [big]="false"
              />
              Sokovi
            </button>
            <button type="button" class="pos-cat" data-color="pink">
              <app-pattern
                class="pos-cat__swatch"
                seed="Deserti"
                [cols]="1"
                [rows]="1"
                [big]="false"
              />
              Deserti
            </button>
            <button type="button" class="pos-cat" data-color="cobalt">
              <app-pattern
                class="pos-cat__swatch"
                seed="Roštilj"
                [cols]="1"
                [rows]="1"
                [big]="false"
              />
              Roštilj
            </button>
          </nav>
          <div class="pos-grid">
            <button type="button" class="pos-tile" data-color="amber">
              <span class="pos-tile__qty">2</span>
              <span class="pos-tile__name">Espresso</span>
              <span class="pos-tile__price">{{ 220 | number }}</span>
            </button>
            <button type="button" class="pos-tile" data-color="amber">
              <span class="pos-tile__name">Kapućino</span>
              <span class="pos-tile__price">{{ 280 | number }}</span>
            </button>
            <button type="button" class="pos-tile" data-color="cobalt">
              <span class="pos-tile__qty">1</span>
              <span class="pos-tile__name">Pljeskavica</span>
              <span class="pos-tile__price">{{ 890 | number }}</span>
            </button>
            <button type="button" class="pos-tile" data-color="amber" disabled>
              <span class="pos-tile__name">Ledena kafa</span>
              <span class="pos-tile__price">{{ 320 | number }}</span>
            </button>
          </div>
          <div class="receipt">
            <div class="receipt__head">
              <p class="receipt__title">Sto 12</p>
              <span class="receipt__id">#0412</span>
            </div>
            <p class="receipt__meta">{{ sampleDate | date: 'EEE dd MMM, yyyy · HH:mm' }}</p>
            <hr class="receipt__rule" />
            <div class="receipt__line">
              <span class="receipt__qty">2×</span>
              <span class="receipt__name"
                >Espresso <span class="receipt__note">bez šećera</span></span
              >
              <span class="receipt__sum">{{ 440 | number }}</span>
            </div>
            <div class="receipt__line">
              <span class="receipt__qty">1×</span>
              <span class="receipt__name">Pljeskavica</span>
              <span class="receipt__sum">{{ 890 | number }}</span>
            </div>
            <hr class="receipt__rule" />
            <div class="receipt__total-label"><span>Ukupno</span><span>3 stavke</span></div>
            <div class="receipt__total">
              <strong>{{ 1330 | number }}</strong
              ><span>RSD</span>
            </div>
            <div class="receipt__actions">
              <button appButton type="button" data-action="pay">Naplati</button>
              <button appButton type="button" data-action="send">Pošalji</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  `,
  styles: `
    .page {
      max-inline-size: var(--content-max-width);
      margin-inline: auto;
      padding: var(--space-8) var(--space-4);
    }

    .themes {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--dialog-width)), 1fr));
      gap: var(--space-4);
    }

    .theme-panel {
      padding: var(--space-4);
      background: var(--color-bg);
      color: var(--color-text);
      border: var(--stroke-hairline) solid var(--color-border);
      border-radius: var(--radius-md);
    }

    .swatches {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(var(--size-ticket-art), 1fr));
      gap: var(--space-2) var(--space-4);
    }

    .swatch {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .chip-color {
      flex: none;
      inline-size: var(--space-6);
      block-size: var(--space-6);
      border: var(--stroke-hairline) solid var(--color-border);
      border-radius: var(--radius-xs);
    }

    .type-scale {
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      align-items: baseline;
      gap: var(--space-4);
      overflow: hidden;
    }

    .token-name {
      inline-size: var(--space-24);
    }

    .space-bar {
      block-size: var(--space-3);
      background: var(--color-accent);
      border-radius: var(--radius-xs);
    }

    .radius-box {
      inline-size: var(--space-16);
      block-size: var(--space-16);
      background: var(--color-surface);
      border: var(--stroke-hairline) solid var(--color-border-strong);
    }

    .shadow-sm {
      border-radius: var(--radius-md);
      border-color: var(--color-border);
      box-shadow: var(--shadow-sm);
    }

    .shadow-lg {
      border-radius: var(--radius-md);
      border-color: var(--color-border);
      box-shadow: var(--shadow-lg);
    }

    .fields {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(var(--field-min-width), 1fr));
      gap: var(--space-4);
    }

    .menu-demo {
      max-inline-size: var(--menu-max-width);
    }

    .brand-demo {
      padding: var(--space-6);
      border-radius: var(--radius-lg);
      overflow-x: auto;
    }

    .pattern-demo {
      display: flex;
      flex-wrap: wrap;
      align-items: start;
      gap: var(--space-4);
    }

    .pos-demo {
      display: flex;
      align-items: flex-start;
      gap: var(--space-4);
    }

    .pos-grid {
      flex: 1 1 auto;
      min-inline-size: 0;
    }
  `,
})
export default class DesignPage {
  protected readonly theme = inject(ThemeStore);
  private readonly dialog = inject(Dialog);

  protected readonly modes = ['light', 'dark'] as const;
  protected readonly semanticColors = SEMANTIC_COLORS;
  protected readonly brandColors = BRAND_COLORS;
  protected readonly tenants = TENANTS;
  protected readonly typeStyles = TYPE_STYLES;
  protected readonly spaces = SPACES;
  protected readonly radii = RADII;
  protected readonly buttonVariants = [
    'primary',
    'secondary',
    'ghost',
    'inverse',
    'danger',
  ] as const;
  protected readonly buttonSizes = ['sm', 'md', 'lg'] as const;
  protected readonly sampleDate = new Date(2026, 10, 5, 12, 4);

  protected readonly tenant = signal<string | null>(null);
  protected readonly themeOptions: AppSegmentedOption[] = [
    { value: 'system', label: 'Sistem' },
    { value: 'light', label: 'Svetla' },
    { value: 'dark', label: 'Tamna' },
  ];
  protected readonly periodOptions: AppSegmentedOption[] = [
    { value: 'day', label: 'Dan' },
    { value: 'week', label: 'Nedelja' },
    { value: 'month', label: 'Mesec' },
  ];
  protected readonly period = signal('week');

  protected readonly sample = form(
    signal({
      valid: 'Kafana Zora',
      hinted: '',
      invalid: 'ab',
      price: '1250',
      description: 'Junetina, kajmak, luk.',
      available: true,
      featured: false,
    }),
    (path) => {
      required(path.valid);
      minLength(path.invalid, 8);
    },
  );
  protected readonly menuItems: AppMenuItem[] = [
    { value: 'switch', label: 'Pređi na Bistro Dunav', icon: LucideArrowLeftRight },
    { value: 'logout', label: 'Odjava', icon: LucideLogOut },
  ];
  protected readonly lastSelected = signal('');

  constructor() {
    this.sample.invalid().markAsTouched();
  }

  protected setTheme(value: string): void {
    this.theme.preference.set(value as ThemePreference);
  }

  protected openDialog(template: TemplateRef<unknown>): void {
    this.dialog.open(template);
  }
}
