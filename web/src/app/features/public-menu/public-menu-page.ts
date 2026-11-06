import { CurrencyPipe, DOCUMENT } from '@angular/common';
import {
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  LOCALE_ID,
  signal,
  viewChildren,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { toApiError } from '../../core/api/api-error';
import { APP_HOST } from '../../core/host/app-host';
import { AppPattern } from '../../shared/ui';
import type { PublicCategory } from './public-menu';
import { PublicMenuApi } from './public-menu-api';

/** Guest view of a venue's published menu at `{tenant}.menuly.app/{venue}`. */
@Component({
  selector: 'app-public-menu-page',
  imports: [CurrencyPipe, AppPattern],
  template: `
    <main class="page">
      @if (data(); as data) {
        <header class="head">
          <div class="art">
            <app-pattern [seed]="data.venue.name" [cols]="8" [rows]="2" [fluid]="true" />
          </div>
          <div class="stack" data-gap="1">
            <h1 class="venue">{{ data.venue.name }}</h1>
            @if (data.venue.address) {
              <p class="meta">{{ data.venue.address }}</p>
            }
          </div>
        </header>

        @if (categories().length > 1) {
          <nav
            class="chips sticky"
            i18n-aria-label="@@publicMenu.categories"
            aria-label="Kategorije"
          >
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

        @for (category of categories(); track category.id) {
          <section
            class="stack category"
            data-gap="0"
            [attr.aria-labelledby]="'cat-' + category.id"
            #section
            [attr.data-id]="category.id"
          >
            <div class="menu-cat">
              <h2 class="menu-cat__title" [id]="'cat-' + category.id">{{ category.name }}</h2>
              <span
                class="menu-cat__count"
                i18n="@@publicMenu.itemCount"
                >{category.items.length, plural,
                  one {{{ category.items.length }} stavka}
                  few {{{ category.items.length }} stavke}
                  other {{{ category.items.length }} stavki}
                }</span
              >
            </div>
            @if (category.description) {
              <p class="cat-desc">{{ category.description }}</p>
            }
            @for (item of category.items; track item.id) {
              <article
                class="menu-item"
                [attr.data-status]="item.is_available ? null : 'unavailable'"
              >
                <h3 class="menu-item__name">{{ item.name }}</h3>
                <span class="menu-item__price">
                  @for (variant of item.variants; track variant.id) {
                    <span class="price-line">
                      @if (variant.label) {
                        <span class="variant">{{ variant.label }}</span>
                      }
                      {{
                        variant.price_minor / 100 | currency: data.venue.currency : 'code' : '1.0-2'
                      }}
                    </span>
                  }
                </span>
                @if (item.description) {
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
                      <span class="tag">{{ tag }}</span>
                    }
                    @for (allergen of item.allergens; track allergen) {
                      <span class="tag">{{ allergen }}</span>
                    }
                  </div>
                }
              </article>
            }
          </section>
        } @empty {
          <p class="meta" i18n="@@publicMenu.empty">Meni je trenutno prazan.</p>
        }

        <footer class="foot">
          <span class="meta" i18n="@@publicMenu.poweredBy">Meni pokreće Menuly</span>
          <a class="meta" [href]="otherLanguage.href" [attr.hreflang]="otherLanguage.code">{{
            otherLanguage.label
          }}</a>
        </footer>
      } @else if (menu.error()) {
        <div class="stack missing" data-gap="2" role="alert">
          @if (notFound()) {
            <h1 i18n="@@publicMenu.notFound">Meni nije dostupan</h1>
            <p class="meta" i18n="@@publicMenu.notFoundBody">
              Proveri adresu ili pitaj osoblje za novi QR kod.
            </p>
          } @else {
            <h1 i18n="@@publicMenu.loadError">Meni nije učitan</h1>
            <button class="chip" type="button" (click)="menu.reload()" i18n="@@common.retry">
              Pokušaj ponovo
            </button>
          }
        </div>
      } @else {
        <p class="meta" i18n="@@common.loading">Učitavanje…</p>
      }
    </main>
  `,
  styles: `
    :host {
      display: block;
      min-block-size: 100dvh;
      background: var(--color-bg);
    }

    .page {
      display: flex;
      flex-direction: column;
      gap: var(--space-8);
      inline-size: 100%;
      max-inline-size: var(--menu-max-width);
      margin-inline: auto;
      padding: var(--space-4) var(--space-4) var(--space-12);
    }

    .head {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
    }

    /* Pattern never sits behind text: its own band, name below it. */
    .art {
      display: grid;
      /* Same ratio as the 8×2 pattern, so it fills the band at any width. */
      aspect-ratio: 4 / 1;
      container-type: size;
      overflow: hidden;
      border-radius: var(--radius-lg);
      background: var(--color-brand-ink);
    }

    .venue {
      font: var(--type-display-md);
      letter-spacing: var(--tracking-display-md);
    }

    .sticky {
      position: sticky;
      inset-block-start: 0;
      z-index: var(--z-sticky);
      margin-inline: calc(-1 * var(--space-4));
      padding-inline: var(--space-4);
      padding-block: var(--space-2);
      background: var(--color-bg);
    }

    .category {
      scroll-margin-block-start: calc(var(--control-md) + var(--space-6));
    }

    .cat-desc {
      padding-block-start: var(--space-1);
      color: var(--color-text-muted);
    }

    .price-line {
      display: block;
    }

    .variant {
      font: var(--type-meta);
      color: var(--color-text-muted);
    }

    .foot {
      display: flex;
      justify-content: space-between;
      gap: var(--space-4);
      padding-block-start: var(--space-6);
    }

    .foot a {
      color: inherit;
    }

    .missing {
      padding-block: var(--space-16);
    }
  `,
})
export default class PublicMenuPage {
  private readonly host = inject(APP_HOST);
  private readonly document = inject(DOCUMENT);
  private readonly title = inject(Title);
  private readonly locale = inject(LOCALE_ID);

  readonly venueSlug = input.required<string>();

  protected readonly menu = inject(PublicMenuApi).menuResource(
    () => (this.host.kind === 'tenant' ? this.host.tenantSlug : undefined),
    this.venueSlug,
  );

  /** Undefined while loading or failed (reading `value()` of a failed resource throws). */
  protected readonly data = computed(() => (this.menu.hasValue() ? this.menu.value() : undefined));

  /** Available items first, unavailable at the bottom of their category (spec decision 1). */
  protected readonly categories = computed<PublicCategory[]>(() =>
    (this.data()?.menu.categories ?? []).map((category) => ({
      ...category,
      items: [
        ...category.items.filter((item) => item.is_available),
        ...category.items.filter((item) => !item.is_available),
      ],
    })),
  );

  protected readonly notFound = computed(() => toApiError(this.menu.error()).status === 404);
  protected readonly active = signal<string | null>(null);

  private readonly sections = viewChildren<ElementRef<HTMLElement>>('section');

  protected readonly otherLanguage = this.locale.startsWith('sr')
    ? { code: 'en', label: 'English', href: `/en/${this.slugPath()}` }
    : { code: 'sr', label: 'Srpski', href: `/${this.slugPath()}` };

  constructor() {
    effect(() => {
      const venue = this.data()?.venue.name;
      if (venue) this.title.setTitle(`${venue} · Menuly`);
    });

    // Scroll-spy: the chip of the category nearest the top is current.
    const destroyRef = inject(DestroyRef);
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

  protected jump(event: Event, id: string): void {
    event.preventDefault();
    this.active.set(id);
    this.document
      .getElementById(`cat-${id}`)
      ?.closest('section')
      ?.scrollIntoView({ behavior: 'smooth' });
  }

  private slugPath(): string {
    return this.document.location.pathname.replace(/^\/en(?=\/|$)/, '').replace(/^\//, '');
  }
}
