import { Dialog } from '@angular/cdk/dialog';
import { createGlobalPositionStrategy } from '@angular/cdk/overlay';
import { CurrencyPipe, DOCUMENT, NgTemplateOutlet } from '@angular/common';
import {
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  LOCALE_ID,
  signal,
  viewChildren,
} from '@angular/core';
import {
  LucideMapPin,
  LucideMoon,
  LucidePhone,
  LucideSearch,
  LucideSlidersHorizontal,
  LucideSun,
  LucideX,
} from '@lucide/angular';
import { ALLERGENS, DIET_TAGS, isHighlight, labelOf } from '../menus/menu-labels';
import { DEFAULT_MENU_THEME, MENU_FONTS, type MenuTheme } from '../menus/menu-theme';
import { AppButton, AppChipGroup, AppPattern } from '../../shared/ui';
import {
  activeFilterCount,
  filterMenu,
  isFiltering,
  labelsInMenu,
  NO_FILTER,
  type MenuFilter,
} from './menu-filter';
import { ItemSheet, type ItemSheetData } from './item-sheet';
import type { PublicCategory, PublicItem, PublicMenu, PublicPromotion } from './public-menu';

type Mode = 'light' | 'dark';

/** Unique ids for the stamp's text path when several menus render (editor preview). */
let stampCount = 0;

/**
 * A published menu drawn with its theme: template, accent, font, light/dark, plus what a printed menu
 * can't do (search, diet and allergen filters, item detail, combos, sold-out state, language and theme
 * switch). Used by the guest page and, with `preview`, by the theme editor.
 */
@Component({
  selector: 'app-public-menu-view',
  imports: [
    CurrencyPipe,
    NgTemplateOutlet,
    AppButton,
    AppChipGroup,
    AppPattern,
    LucideMapPin,
    LucideMoon,
    LucidePhone,
    LucideSearch,
    LucideSlidersHorizontal,
    LucideSun,
    LucideX,
  ],
  host: {
    '[attr.data-template]': 'theme().template',
    '[attr.data-tenant]': 'theme().accent',
    '[attr.data-font]': 'theme().font',
    '[attr.data-theme]': 'themeAttr()',
  },
  template: `
    @let data = menu();
    @let t = theme();
    <div class="page">
      <header class="head">
        @if (t.show_images && t.cover_url) {
          <img class="cover" [src]="t.cover_url" alt="" />
        } @else if (t.show_pattern) {
          <div class="art">
            <app-pattern [seed]="data.venue.name" [cols]="8" [rows]="2" [fluid]="true" />
          </div>
        }
        <div class="title-row">
          @if (t.logo_url) {
            <img class="logo" [src]="t.logo_url" alt="" />
          }
          <h1 class="venue">{{ data.venue.name }}</h1>
          <div class="tools">
            @if (preview()) {
              <span class="pill-btn" aria-disabled="true">{{ otherLanguage.short }}</span>
            } @else {
              <a
                class="pill-btn"
                [href]="otherLanguage.href"
                [attr.hreflang]="otherLanguage.code"
                [attr.aria-label]="otherLanguage.label"
                >{{ otherLanguage.short }}</a
              >
            }
            <button
              type="button"
              class="pill-btn"
              [attr.aria-label]="modeLabel()"
              [attr.aria-pressed]="effectiveMode() === 'dark'"
              (click)="toggleMode()"
            >
              @if (effectiveMode() === 'dark') {
                <svg lucideSun aria-hidden="true"></svg>
              } @else {
                <svg lucideMoon aria-hidden="true"></svg>
              }
            </button>
          </div>
        </div>
        @if (data.venue.address || data.venue.phone) {
          <div class="row info" data-gap="4">
            @if (data.venue.address) {
              <a class="info-link" [href]="mapHref()" target="_blank" rel="noopener">
                <svg lucideMapPin aria-hidden="true" [size]="16"></svg>
                {{ data.venue.address }}
              </a>
            }
            @if (data.venue.phone) {
              <a class="info-link" [href]="telHref()">
                <svg lucidePhone aria-hidden="true" [size]="16"></svg>
                {{ data.venue.phone }}
              </a>
            }
          </div>
        }
      </header>

      @for (promo of featured(); track promo.id) {
        <ng-container
          *ngTemplateOutlet="promoCard; context: { $implicit: promo, featured: true }"
        />
      }

      <div class="bar" role="search">
        <div class="search-row">
          <label class="search">
            <svg lucideSearch aria-hidden="true"></svg>
            <span class="visually-hidden" i18n="@@publicMenu.search">Pretraga</span>
            <input
              type="search"
              enterkeyhint="search"
              autocomplete="off"
              i18n-placeholder="@@publicMenu.searchPlaceholder"
              placeholder="Pretraži meni"
              [value]="filter().query"
              (input)="setQuery($any($event.target).value)"
            />
            @if (filter().query) {
              <button
                type="button"
                class="clear"
                i18n-aria-label="@@publicMenu.clearSearch"
                aria-label="Obriši pretragu"
                (click)="setQuery('')"
              >
                <svg lucideX aria-hidden="true" [size]="16"></svg>
              </button>
            }
          </label>
          @if (hasFilters()) {
            <button
              type="button"
              class="pill-btn filter-btn"
              aria-controls="menu-filters"
              [attr.aria-expanded]="filtersOpen()"
              (click)="filtersOpen.set(!filtersOpen())"
            >
              <svg lucideSlidersHorizontal aria-hidden="true"></svg>
              <span class="visually-hidden" i18n="@@publicMenu.filters">Filteri</span>
              @if (filterCount()) {
                <span class="count">{{ filterCount() }}</span>
              }
            </button>
          }
        </div>

        @if (filtersOpen() && hasFilters()) {
          <div class="filters" id="menu-filters">
            @if (dietOptions().length) {
              <div class="stack" data-gap="2">
                <p class="eyebrow" i18n="@@publicMenu.filter.diet">Ishrana</p>
                <app-chip-group
                  size="lg"
                  [label]="dietLabel"
                  [options]="dietOptions()"
                  [value]="filter().diets"
                  (valueChange)="setList('diets', $event)"
                />
              </div>
            }
            @if (allergenOptions().length) {
              <div class="stack" data-gap="2">
                <p class="eyebrow" i18n="@@publicMenu.filter.without">Bez alergena</p>
                <app-chip-group
                  size="lg"
                  [label]="withoutLabel"
                  [options]="allergenOptions()"
                  [value]="filter().withoutAllergens"
                  (valueChange)="setList('withoutAllergens', $event)"
                />
              </div>
            }
            @if (hasSoldOut()) {
              <div class="row" data-gap="2">
                <button
                  type="button"
                  class="chip"
                  [attr.aria-pressed]="filter().availableOnly"
                  (click)="setFilter({ availableOnly: !filter().availableOnly })"
                  i18n="@@publicMenu.filter.available"
                >
                  Samo dostupno danas
                </button>
              </div>
            }
          </div>
        }

        @if (!filtering() && categories().length > 1) {
          <nav class="chips" i18n-aria-label="@@publicMenu.categories" aria-label="Kategorije">
            @for (category of categories(); track category.id) {
              <a
                class="chip"
                [href]="'#cat-' + category.id"
                [attr.aria-current]="active() === category.id ? 'true' : null"
                (click)="jump($event, category.id)"
                >{{ category.name }}</a
              >
            }
          </nav>
        }
      </div>

      @if (filtering()) {
        <div class="row" data-justify="between">
          <p class="meta" aria-live="polite">
            <span i18n="@@publicMenu.resultCount">{resultCount(), plural,
              one {{{ resultCount() }} stavka}
              few {{{ resultCount() }} stavke}
              other {{{ resultCount() }} stavki}
            }</span>
          </p>
          <button
            appButton
            variant="ghost"
            size="sm"
            type="button"
            (click)="clearFilters()"
            i18n="@@publicMenu.clearAll"
          >
            Poništi filtere
          </button>
        </div>
      }

      @if (!filtering() && regularPromos().length) {
        <section class="stack" data-gap="3" aria-labelledby="promos-title">
          <div class="menu-cat">
            <h2 class="menu-cat__title" id="promos-title" i18n="@@publicMenu.combos">
              Kombo ponude
            </h2>
          </div>
          @for (promo of regularPromos(); track promo.id) {
            <ng-container
              *ngTemplateOutlet="promoCard; context: { $implicit: promo, featured: false }"
            />
          }
        </section>
      }

      @for (category of shown(); track category.id) {
        @let columns = t.template === 'tabla' ? variantColumns(category) : null;
        @let label = t.template === 'etiketa';
        <section
          class="category"
          [attr.aria-labelledby]="'cat-' + category.id"
          #section
          [attr.data-id]="category.id"
          [attr.data-stripe]="label ? labels().stripes.get(category.id) : null"
        >
          <div class="menu-cat">
            @if (label) {
              <span class="menu-cat__stripes" aria-hidden="true"></span>
            }
            <h2 class="menu-cat__title" [id]="'cat-' + category.id">{{ category.name }}</h2>
            @if (columns) {
              <span class="menu-cat__cols" aria-hidden="true">
                @for (column of columns; track column) {
                  <span>{{ column }}</span>
                }
              </span>
            } @else {
              <span
                class="menu-cat__count"
                i18n="@@publicMenu.itemCount"
                >{category.items.length, plural,
                  one {{{ category.items.length }} stavka}
                  few {{{ category.items.length }} stavke}
                  other {{{ category.items.length }} stavki}
                }</span
              >
            }
          </div>
          @if (category.description && t.show_descriptions) {
            <p class="cat-desc">{{ category.description }}</p>
          }
          <div class="menu-items">
            @for (item of category.items; track item.id) {
              <article
                class="menu-item"
                [attr.data-status]="item.is_available ? null : 'unavailable'"
                [attr.data-photo]="showPhoto(item) ? '' : null"
              >
                @if (label) {
                  <span class="menu-item__code" aria-hidden="true"
                    >№ {{ labels().codes.get(item.id) }}</span
                  >
                }
                @if (showPhoto(item)) {
                  <img class="menu-item__photo" [src]="item.image_url" alt="" loading="lazy" />
                }
                <div class="menu-item__text">
                  <h3 class="menu-item__name">
                    <button type="button" class="menu-item__open" (click)="open(item)">
                      {{ item.name }}
                    </button>
                  </h3>
                  @if (item.description && t.show_descriptions) {
                    <p class="menu-item__desc">{{ item.description }}</p>
                  }
                  @if (!item.is_available || item.tags.length || item.allergens.length) {
                    <div class="menu-item__meta">
                      @if (!item.is_available) {
                        <span class="badge" data-tone="danger" i18n="@@publicMenu.unavailable"
                          >Nema danas</span
                        >
                      }
                      @for (tag of item.tags; track tag) {
                        @if (isHighlight(tag)) {
                          <span class="badge" data-tone="accent" data-plain>{{
                            labelOf(tag)
                          }}</span>
                        } @else {
                          <span class="tag">{{ labelOf(tag) }}</span>
                        }
                      }
                      @if (t.template !== 'tabla') {
                        @for (allergen of item.allergens; track allergen) {
                          <span class="tag" data-kind="allergen">{{ labelOf(allergen) }}</span>
                        }
                      }
                    </div>
                  }
                </div>
                <div class="menu-item__price" [attr.data-cols]="columns ? columns.length : null">
                  @if (columns) {
                    @for (column of columns; track column) {
                      @let price = priceFor(item, column, columns);
                      <span class="menu-item__cell"
                        >{{
                          price === null
                            ? '–'
                            : (price / 100 | currency: data.venue.currency : 'code' : '1.0-2')
                        }}<span class="visually-hidden"> {{ column }}</span></span
                      >
                    }
                  } @else {
                    @for (variant of item.variants; track variant.id) {
                      <span class="menu-item__line">
                        @if (variant.label) {
                          <span class="menu-item__variant">{{ variant.label }}</span>
                        }
                        {{
                          variant.price_minor / 100
                            | currency: data.venue.currency : 'code' : '1.0-2'
                        }}
                      </span>
                    }
                  }
                </div>
              </article>
            }
          </div>
        </section>
      } @empty {
        @if (filtering()) {
          <div class="stack empty" data-gap="3">
            <p class="empty__title" i18n="@@publicMenu.noResults">Ništa ne odgovara pretrazi.</p>
            <div>
              <button
                type="button"
                class="chip"
                (click)="clearFilters()"
                i18n="@@publicMenu.clearAll"
              >
                Poništi filtere
              </button>
            </div>
          </div>
        } @else {
          <p class="meta" i18n="@@publicMenu.empty">Meni je trenutno prazan.</p>
        }
      }

      @if (t.template === 'racun') {
        <!-- The receipt's sign-off: a rubber stamp with the venue's name. -->
        <svg class="stamp" viewBox="0 0 120 120" aria-hidden="true">
          <defs>
            <path [attr.id]="stampId" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" />
          </defs>
          <circle class="stamp__ring" cx="60" cy="60" r="56" />
          <circle class="stamp__ring" cx="60" cy="60" r="33" />
          <text class="stamp__ring-text">
            <textPath [attr.href]="'#' + stampId" textLength="272" lengthAdjust="spacing">
              {{ stampText() }}
            </textPath>
          </text>
          <text class="stamp__initial" x="60" y="66" text-anchor="middle">
            {{ stampInitial() }}
          </text>
          <text class="stamp__year" x="60" y="82" text-anchor="middle">{{ year }}</text>
        </svg>
      }

      <footer class="foot">
        <span class="meta" i18n="@@publicMenu.poweredBy">Meni pokreće Menuly</span>
        @if (preview()) {
          <span class="meta">{{ otherLanguage.label }}</span>
        } @else {
          <a class="meta" [href]="otherLanguage.href" [attr.hreflang]="otherLanguage.code">{{
            otherLanguage.label
          }}</a>
        }
      </footer>
    </div>

    <ng-template #promoCard let-promo let-featured="featured">
      <article
        class="promo"
        [attr.data-featured]="featured ? '' : null"
        [attr.data-status]="promo.is_available ? null : 'unavailable'"
      >
        @if (promo.image_url && t.show_images) {
          <img class="promo__photo" [src]="promo.image_url" alt="" loading="lazy" />
        } @else if (t.template === 'etiketa') {
          <!-- Two items overlap into one combo: the shared part is striped. -->
          <svg class="promo__venn" viewBox="0 0 120 80" aria-hidden="true">
            <defs>
              <clipPath [attr.id]="'venn-' + promo.id">
                <circle cx="46" cy="40" r="32" />
              </clipPath>
              <pattern
                [attr.id]="'venn-lines-' + promo.id"
                width="4"
                height="5"
                patternUnits="userSpaceOnUse"
              >
                <rect class="promo__venn-line" width="4" height="2.5" />
              </pattern>
            </defs>
            <circle class="promo__venn-a" cx="46" cy="40" r="32" />
            <circle class="promo__venn-b" cx="74" cy="40" r="32" />
            <circle
              cx="74"
              cy="40"
              r="32"
              [attr.fill]="'url(#venn-lines-' + promo.id + ')'"
              [attr.clip-path]="'url(#venn-' + promo.id + ')'"
            />
          </svg>
        }
        <div class="promo__body">
          <div class="row" data-gap="2">
            <span class="badge" data-tone="accent" data-plain i18n="@@publicMenu.combo">Kombo</span>
            @if (!promo.is_available) {
              <span class="badge" data-tone="danger" i18n="@@publicMenu.unavailable"
                >Nema danas</span
              >
            }
          </div>
          <div class="promo__top">
            <h3 class="promo__name">{{ promo.name }}</h3>
            <span class="price" data-size="lg">{{
              promo.price_minor / 100 | currency: data.venue.currency : 'code' : '1.0-2'
            }}</span>
          </div>
          @if (promo.description && t.show_descriptions) {
            <p class="menu-item__desc">{{ promo.description }}</p>
          }
          <ul class="promo__slots">
            @for (slot of promo.slots; track $index) {
              <li>
                <span class="meta">{{ slot.quantity }}×</span>
                @if (slot.options.length === 1) {
                  {{ slot.options[0].name }}
                  @if (slot.options[0].variant_label) {
                    <span class="menu-item__variant">{{ slot.options[0].variant_label }}</span>
                  }
                } @else {
                  <span>
                    <ng-container i18n="@@publicMenu.slotChoice">po izboru:</ng-container>
                    {{ optionNames(slot) }}
                  </span>
                }
              </li>
            }
          </ul>
          @if (promo.savings_minor > 0) {
            <p class="promo__savings">
              <span class="promo__strike">{{
                promo.regular_price_minor / 100 | currency: data.venue.currency : 'code' : '1.0-2'
              }}</span>
              <span i18n="@@publicMenu.savings"
                >Ušteda
                {{
                  promo.savings_minor / 100 | currency: data.venue.currency : 'code' : '1.0-2'
                }}</span
              >
            </p>
          }
        </div>
      </article>
    </ng-template>
  `,
  styleUrl: './public-menu-view.css',
})
export class PublicMenuView {
  private readonly document = inject(DOCUMENT);
  private readonly locale = inject(LOCALE_ID);
  private readonly dialog = inject(Dialog);
  private readonly injector = inject(Injector);

  readonly menu = input.required<PublicMenu>();
  /** Defaults to the menu's own theme; the theme editor passes its unsaved draft. */
  readonly themeOverride = input<MenuTheme | undefined>(undefined, { alias: 'theme' });
  /** Inside the editor: links don't navigate. */
  readonly preview = input(false);

  protected readonly theme = computed(
    () => this.themeOverride() ?? this.menu().theme ?? DEFAULT_MENU_THEME,
  );
  protected readonly labelOf = labelOf;
  protected readonly isHighlight = isHighlight;

  // ---- Light / dark: the menu's setting, until the guest switches ----
  private readonly guestMode = signal<Mode | null>(null);
  private readonly systemDark = signal(
    typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches,
  );
  protected readonly themeAttr = computed<Mode | null>(() => {
    const mode = this.theme().color_mode;
    return this.guestMode() ?? (mode === 'auto' ? null : mode);
  });
  protected readonly effectiveMode = computed<Mode>(
    () => this.themeAttr() ?? (this.systemDark() ? 'dark' : 'light'),
  );
  protected readonly modeLabel = computed(() =>
    this.effectiveMode() === 'dark'
      ? $localize`:@@publicMenu.lightMode:Svetla tema`
      : $localize`:@@publicMenu.darkMode:Tamna tema`,
  );

  // ---- Content ----
  /** Available items first, unavailable at the bottom of their category (spec decision 1). */
  protected readonly categories = computed<PublicCategory[]>(() =>
    this.menu().menu.categories.map((category) => ({
      ...category,
      items: [
        ...category.items.filter((item) => item.is_available),
        ...category.items.filter((item) => !item.is_available),
      ],
    })),
  );
  /**
   * "Etiketa": a stable code per item (category.item, "02.05") and a stripe color per category,
   * both from the menu's order, so filtering never renumbers what a guest might quote to staff.
   */
  protected readonly labels = computed(() => {
    const codes = new Map<string, string>();
    const stripes = new Map<string, number>();
    const pad = (n: number) => String(n).padStart(2, '0');
    this.menu().menu.categories.forEach((category, c) => {
      stripes.set(category.id, (c % 4) + 1);
      category.items.forEach((item, i) => codes.set(item.id, `${pad(c + 1)}.${pad(i + 1)}`));
    });
    return { codes, stripes };
  });
  // ---- "Racun" stamp ----
  protected readonly stampId = `menu-stamp-${++stampCount}`;
  protected readonly year = new Date().getFullYear();
  /** Name and "MENI" around the ring, repeated to fill it; very long names are cut to fit. */
  protected readonly stampText = computed(() => {
    const name = [...this.menu().venue.name.trim().toUpperCase()].slice(0, 26).join('');
    const unit = `${name} · ${$localize`:@@publicMenu.stampWord:MENI`} · `;
    return unit.repeat(Math.max(1, Math.floor(36 / unit.length)));
  });
  protected readonly stampInitial = computed(
    () => [...this.menu().venue.name.trim()][0]?.toUpperCase() ?? '',
  );

  private readonly promotions = computed(() => this.menu().promotions ?? []);
  protected readonly featured = computed(() => this.promotions().filter((p) => p.is_featured));
  protected readonly regularPromos = computed(() =>
    this.promotions().filter((p) => !p.is_featured),
  );

  // ---- Search and filters ----
  protected readonly filter = signal<MenuFilter>(NO_FILTER);
  protected readonly filtersOpen = signal(false);
  protected readonly filtering = computed(() => isFiltering(this.filter()));
  protected readonly filterCount = computed(() => activeFilterCount(this.filter()));
  protected readonly shown = computed(() => filterMenu(this.categories(), this.filter()));
  protected readonly resultCount = computed(() =>
    this.shown().reduce((sum, category) => sum + category.items.length, 0),
  );

  private readonly present = computed(() => labelsInMenu(this.categories()));
  /** Only the diets and allergens this menu actually uses. */
  protected readonly dietOptions = computed(() =>
    DIET_TAGS.filter((known) => this.present().tags.has(known.key)),
  );
  protected readonly allergenOptions = computed(() => {
    const present = this.present().allergens;
    const known = ALLERGENS.filter((allergen) => present.has(allergen.key));
    const unknown = [...present]
      .filter(([key]) => !ALLERGENS.some((allergen) => allergen.key === key))
      .map(([key, label]) => ({ key, label }));
    return [...known, ...unknown];
  });
  protected readonly hasSoldOut = computed(() =>
    this.categories().some((category) => category.items.some((item) => !item.is_available)),
  );
  protected readonly hasFilters = computed(
    () => this.dietOptions().length > 0 || this.allergenOptions().length > 0 || this.hasSoldOut(),
  );

  // ---- Category chips + scroll-spy ----
  protected readonly active = signal<string | null>(null);
  private readonly sections = viewChildren<ElementRef<HTMLElement>>('section');

  protected readonly otherLanguage = this.locale.startsWith('sr')
    ? { code: 'en', short: 'EN', label: 'English', href: `/en/${this.slugPath()}` }
    : { code: 'sr', short: 'SR', label: 'Srpski', href: `/${this.slugPath()}` };

  protected readonly mapHref = computed(() => {
    const venue = this.menu().venue;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venue.name}, ${venue.address}`)}`;
  });

  protected readonly telHref = computed(
    () => `tel:${this.menu().venue.phone.replace(/[^\d+]/g, '')}`,
  );

  constructor() {
    // Load the menu's font only when it isn't the default one already in index.html.
    effect(() => this.loadFont(this.theme().font));

    const destroyRef = inject(DestroyRef);
    if (typeof matchMedia === 'function') {
      const query = matchMedia('(prefers-color-scheme: dark)');
      const onChange = (event: MediaQueryListEvent) => this.systemDark.set(event.matches);
      query.addEventListener('change', onChange);
      destroyRef.onDestroy(() => query.removeEventListener('change', onChange));
    }

    // Scroll-spy: the chip of the category nearest the top is current.
    let observer: IntersectionObserver | undefined;
    afterRenderEffect(() => {
      const sections = this.sections();
      observer?.disconnect();
      if (!sections.length || typeof IntersectionObserver === 'undefined') return;
      this.active.update((id) => id ?? sections[0].nativeElement.dataset['id'] ?? null);
      observer = new IntersectionObserver(
        (entries) => {
          const top = entries.filter((entry) => entry.isIntersecting)[0];
          if (top) this.active.set((top.target as HTMLElement).dataset['id'] ?? null);
        },
        { rootMargin: '-20% 0px -70% 0px' },
      );
      for (const section of sections) observer.observe(section.nativeElement);
    });
    destroyRef.onDestroy(() => observer?.disconnect());
  }

  protected toggleMode(): void {
    this.guestMode.set(this.effectiveMode() === 'dark' ? 'light' : 'dark');
  }

  protected setQuery(query: string): void {
    this.setFilter({ query });
  }

  protected setFilter(patch: Partial<MenuFilter>): void {
    this.filter.update((filter) => ({ ...filter, ...patch }));
  }

  protected readonly dietLabel = $localize`:@@publicMenu.filter.diet:Ishrana`;
  protected readonly withoutLabel = $localize`:@@publicMenu.filter.without:Bez alergena`;

  protected setList(key: 'diets' | 'withoutAllergens', values: readonly string[]): void {
    this.setFilter({ [key]: [...values] });
  }

  protected clearFilters(): void {
    this.filter.set(NO_FILTER);
  }

  protected jump(event: Event, id: string): void {
    event.preventDefault();
    this.active.set(id);
    this.document
      .getElementById(`cat-${id}`)
      ?.closest('section')
      ?.scrollIntoView({ behavior: 'smooth' });
  }

  protected showPhoto(item: PublicItem): boolean {
    const t = this.theme();
    return t.show_images && t.template !== 'tabla' && !!item.image_url;
  }

  /**
   * Board template: when every item with sizes uses the same size labels, those labels become
   * columns ("0,3 l | 0,5 l"); otherwise prices stay stacked per item.
   */
  protected variantColumns(category: PublicCategory): string[] | null {
    const sized = category.items.filter((item) => item.variants.length > 1);
    if (!sized.length) return null;
    const labels = sized[0].variants.map((v) => v.label);
    const same = sized.every(
      (item) =>
        item.variants.length === labels.length &&
        item.variants.every((v, i) => v.label === labels[i]),
    );
    return same && labels.every(Boolean) && labels.length <= 3 ? labels : null;
  }

  /** Price in a board column; a single-price item fills the last column. */
  protected priceFor(item: PublicItem, column: string, columns: string[]): number | null {
    if (item.variants.length === 1) {
      return column === columns[columns.length - 1] ? item.variants[0].price_minor : null;
    }
    return item.variants.find((v) => v.label === column)?.price_minor ?? null;
  }

  protected optionNames(slot: PublicPromotion['slots'][number]): string {
    return slot.options
      .map((o) => (o.variant_label ? `${o.name} ${o.variant_label}` : o.name))
      .join(', ');
  }

  protected open(item: PublicItem): void {
    this.dialog.open<void, ItemSheetData>(ItemSheet, {
      data: {
        item,
        currency: this.menu().venue.currency,
        attrs: { tenant: this.theme().accent, font: this.theme().font, theme: this.themeAttr() },
      },
      width: '100%',
      maxWidth: 'var(--menu-max-width)',
      positionStrategy: createGlobalPositionStrategy(this.injector)
        .centerHorizontally()
        .bottom('0'),
      autoFocus: 'dialog',
      restoreFocus: true,
    });
  }

  private loadFont(font: MenuTheme['font']): void {
    const family = MENU_FONTS.find((f) => f.value === font)?.family;
    if (!family || font === 'onest') return;
    const id = `menu-font-${font}`;
    if (this.document.getElementById(id)) return;
    const link = this.document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${family.replaceAll(' ', '+')}:wght@400;500;600;700&display=swap`;
    this.document.head.appendChild(link);
  }

  private slugPath(): string {
    return this.document.location.pathname.replace(/^\/en(?=\/|$)/, '').replace(/^\//, '');
  }
}
