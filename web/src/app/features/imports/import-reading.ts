import { DatePipe, DecimalPipe } from '@angular/common';
import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { LucideArrowRight } from '@lucide/angular';
import type { ImportPage } from '../../core/imports/import';
import { AppButton } from '../../shared/ui';
import type { EditDraft } from './import-draft';
import { PAGE_STATUS } from './import-labels';
import { PageOriginal } from './page-original';

/** One printed line on the receipt: a category heading or an item with its price. */
type Line =
  | { kind: 'cat'; key: string; name: string }
  | {
      kind: 'item';
      key: string;
      name: string;
      price: number | null;
      priceText: string;
      unsure: boolean;
    };

/** Gap between two printed lines when a page's items arrive at once. */
const LINE_MS = 110;

/**
 * The reading "show": the page being read under a scanner beam, and a receipt that prints what was read, line by
 * line, as pages come back from the server. Ends with a stamp and a button into the review.
 */
@Component({
  selector: 'app-import-reading',
  imports: [DatePipe, DecimalPipe, AppButton, PageOriginal, LucideArrowRight],
  template: `
    <div class="show">
      <section class="scanner stack" data-gap="3" aria-labelledby="scanner-heading">
        <div class="strip-head">
          <h2 id="scanner-heading" class="eyebrow">
            @if (current(); as page) {
              <ng-container i18n="@@import.scan.page"
                >Skener · stranica {{ page.page_index + 1 }} od {{ pages().length }}</ng-container
              >
            } @else {
              <ng-container i18n="@@import.scan.title">Skener</ng-container>
            }
          </h2>
          <span class="eyebrow" i18n="@@import.scan.found">{{ found() }} pronađeno</span>
        </div>

        <div class="bed" [attr.data-done]="done() || null">
          @if (current(); as page) {
            <div class="photo">
              <app-page-original [importId]="importId()" [page]="page" />
            </div>
          }
          <span class="corner" data-at="tl" aria-hidden="true"></span>
          <span class="corner" data-at="tr" aria-hidden="true"></span>
          <span class="corner" data-at="bl" aria-hidden="true"></span>
          <span class="corner" data-at="br" aria-hidden="true"></span>
          @if (!done()) {
            <span class="beam" aria-hidden="true"></span>
          }
          <p class="bed__note">
            @if (done()) {
              <ng-container i18n="@@import.scan.allDone">Sve stranice pročitane</ng-container>
            } @else {
              <ng-container i18n="@@import.scan.working">Prepoznajem stavke i cene…</ng-container>
            }
          </p>
        </div>

        <ol class="film" [attr.aria-label]="pagesLabel">
          @for (page of pages(); track page.id) {
            <li class="frame" [attr.data-status]="page.status">
              <span class="frame__thumb" aria-hidden="true">{{ page.page_index + 1 }}</span>
              <span class="stack" data-gap="0">
                <strong class="frame__name">{{ pageLabel(page) }}</strong>
                <span class="frame__state">{{ pageStatus[page.status].label }}</span>
              </span>
            </li>
          }
        </ol>
      </section>

      <section class="slot" aria-labelledby="receipt-heading">
        <span class="slot__mouth" aria-hidden="true"></span>
        <div class="tape">
          <div class="receipt__head">
            <h2 id="receipt-heading" class="receipt__title" i18n="@@import.receipt.title">Meni</h2>
            <span class="receipt__id">#{{ shortId() }}</span>
          </div>
          <p class="receipt__meta">
            @if (venueName()) {
              {{ venueName() }} ·
            }
            {{ createdAt() | date: 'dd.MM.yyyy · HH:mm' }}
          </p>
          <hr class="receipt__rule" />

          <!-- Lines print in one by one; screen readers get the totals below instead of every line. -->
          <div class="lines" aria-hidden="true">
            @for (line of printed(); track line.key) {
              @if (line.kind === 'cat') {
                <p class="cat" animate.enter="printing">{{ line.name }}</p>
              } @else {
                <p class="line" animate.enter="printing">
                  <span class="line__name">{{ line.name }}</span>
                  <span class="line__dots"></span>
                  @if (line.price !== null) {
                    <span class="line__price" [attr.data-unsure]="line.unsure || null"
                      >{{ line.price | number: '1.0-2' }}{{ line.unsure ? '?' : '' }}</span
                    >
                  } @else {
                    <span class="line__price" data-unsure>{{ line.priceText || '?' }}</span>
                  }
                </p>
              }
            }
            @if (!done()) {
              <p class="typing">
                @if (current(); as page) {
                  <ng-container i18n="@@import.receipt.reading"
                    >čitam stranicu {{ page.page_index + 1 }}</ng-container
                  >
                }
                <span class="cursor">▌</span>
              </p>
            }
          </div>

          <hr class="receipt__rule" />
          <dl class="totals" aria-live="polite">
            <div>
              <dt i18n="@@import.sum.categories">Kategorije</dt>
              <dd>{{ counts().categories }}</dd>
            </div>
            <div [attr.data-tone]="counts().toCheck ? 'warning' : null">
              <dt i18n="@@import.sum.toCheck">Za proveru</dt>
              <dd>{{ counts().toCheck }}</dd>
            </div>
            <div class="grand">
              <dt i18n="@@import.sum.items">Stavke</dt>
              <dd>{{ counts().items }}</dd>
            </div>
          </dl>

          @if (done()) {
            <span class="stamp" animate.enter="stamping" aria-hidden="true" i18n="@@import.stamp"
              >Pročitano</span
            >
          }
        </div>

        @if (done()) {
          <button appButton type="button" class="go" (click)="review.emit()">
            <ng-container i18n="@@import.toReview">Pregledaj i ispravi</ng-container>
            <svg lucideArrowRight aria-hidden="true"></svg>
          </button>
        } @else {
          <p class="meta" i18n="@@import.leaveHint">
            Možeš da napustiš stranicu, nastavljamo u pozadini.
          </p>
        }
      </section>
    </div>
  `,
  styles: `
    .show {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 23rem);
      align-items: start;
      gap: var(--space-8);
    }

    @media (max-width: 900px) {
      .show {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    .strip-head {
      display: flex;
      justify-content: space-between;
      gap: var(--space-3);
    }

    .strip-head h2 {
      margin: 0;
    }

    /* ---------- Scanner bed: the photo on a dark bed with a sweeping beam ---------- */
    .bed {
      position: relative;
      display: grid;
      place-items: center;
      min-block-size: 22rem;
      padding: var(--space-6) var(--space-6) var(--space-10);
      overflow: hidden;
      border: var(--stroke-hairline) solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-brand-ink);
    }

    .photo {
      inline-size: min(100%, 26rem);
      rotate: -1.2deg;
      filter: drop-shadow(0 18px 30px rgb(0 0 0 / 0.5));
      transition: rotate var(--duration-slow) ease;
    }

    .bed[data-done] .photo {
      rotate: 0deg;
    }

    .photo ::ng-deep img {
      max-block-size: 60dvh;
    }

    .corner {
      position: absolute;
      inline-size: 1.75rem;
      block-size: 1.75rem;
      border: 0 solid var(--color-brand-paper);
    }

    .corner[data-at='tl'] {
      inset: var(--space-4) auto auto var(--space-4);
      border-inline-start-width: 2px;
      border-block-start-width: 2px;
    }

    .corner[data-at='tr'] {
      inset: var(--space-4) var(--space-4) auto auto;
      border-inline-end-width: 2px;
      border-block-start-width: 2px;
    }

    .corner[data-at='bl'] {
      inset: auto auto var(--space-4) var(--space-4);
      border-inline-start-width: 2px;
      border-block-end-width: 2px;
    }

    .corner[data-at='br'] {
      inset: auto var(--space-4) var(--space-4) auto;
      border-inline-end-width: 2px;
      border-block-end-width: 2px;
    }

    .beam {
      position: absolute;
      inset-inline: 0;
      inset-block-start: 4%;
      block-size: 2px;
      background: var(--color-brand-orange);
      box-shadow:
        0 0 18px 6px color-mix(in srgb, var(--color-brand-orange) 45%, transparent),
        0 -48px 64px color-mix(in srgb, var(--color-brand-orange) 12%, transparent);
      animation: sweep 3.6s ease-in-out infinite;
    }

    @keyframes sweep {
      50% {
        inset-block-start: 92%;
      }
    }

    .bed__note {
      position: absolute;
      inset: auto var(--space-12) var(--space-5);
      text-align: center;
      margin: 0;
      font: var(--type-meta-xs);
      letter-spacing: var(--tracking-receipt);
      text-transform: uppercase;
      color: var(--color-pos-text-disabled);
    }

    /* ---------- Film strip: one frame per page with its state ---------- */
    .film {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .frame {
      display: flex;
      align-items: center;
      gap: var(--space-2-5);
      padding: var(--space-2-5);
      border: var(--stroke-hairline) solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      transition: border-color var(--duration-base) ease;
    }

    .frame[data-status='processing'] {
      border-color: var(--color-text);
    }

    .frame__thumb {
      flex: none;
      display: grid;
      place-items: center;
      inline-size: 2.125rem;
      block-size: 2.75rem;
      border-radius: var(--radius-sm);
      background: var(--color-surface-sunken);
      box-shadow: inset 0 0 0 var(--stroke-hairline) var(--color-border);
      font: var(--type-meta-sm);
      color: var(--color-text-subtle);
    }

    .frame[data-status='processing'] .frame__thumb {
      background: var(--color-brand-orange);
      color: var(--color-on-brand-tile);
      box-shadow: none;
    }

    .frame__name {
      font: var(--type-label);
      font-weight: 600;
    }

    .frame__state {
      font: var(--type-meta-xs);
      letter-spacing: var(--tracking-receipt);
      text-transform: uppercase;
      color: var(--color-text-subtle);
    }

    .frame[data-status='done'] .frame__state {
      color: var(--color-success);
    }

    .frame[data-status='processing'] .frame__state {
      color: var(--color-text);
    }

    .frame[data-status='failed'] .frame__state {
      color: var(--color-danger);
    }

    /* ---------- The receipt coming out of a printer slot ---------- */
    .slot {
      position: relative;
      display: grid;
      gap: var(--space-4);
      padding-block-start: var(--space-4);
    }

    .slot__mouth {
      position: absolute;
      inset-block-start: 0;
      inset-inline-start: 50%;
      translate: -50% 0;
      z-index: 1;
      inline-size: 62%;
      block-size: 0.875rem;
      border-radius: var(--radius-pill);
      background: var(--color-text);
    }

    .tape {
      position: relative;
      padding: var(--space-8) var(--space-6) var(--space-8);
      background: var(--color-brand-paper);
      color: var(--color-paper-text);
      box-shadow: var(--shadow-lg);
      /* Torn edge at the bottom. */
      --tooth: 0.5rem;
      mask:
        linear-gradient(#000 0 0) top / 100% calc(100% - var(--tooth)) no-repeat,
        conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) bottom /
          calc(2 * var(--tooth)) var(--tooth) repeat-x;
    }

    .receipt__head {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }

    .receipt__title {
      margin: 0;
      font: var(--type-receipt-title);
      letter-spacing: var(--tracking-tight);
    }

    .receipt__id {
      font: var(--type-meta-sm);
      color: var(--color-paper-text-subtle);
    }

    .receipt__meta {
      margin: 0;
      padding-block-start: var(--space-2-5);
      font: var(--type-meta-xs);
      letter-spacing: var(--tracking-receipt);
      text-transform: uppercase;
      color: var(--color-paper-text-muted);
    }

    .receipt__rule {
      border: 0;
      border-block-start: var(--stroke-hairline) dashed var(--color-paper-rule);
      margin-block: var(--space-4) var(--space-2);
    }

    .lines p {
      margin: 0;
    }

    .cat {
      padding-block: var(--space-3) var(--space-1);
      font: var(--type-meta-xs);
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--color-paper-text-muted);
    }

    .line {
      display: flex;
      align-items: baseline;
      gap: var(--space-2);
      padding-block: var(--space-1);
      font: var(--type-receipt-line);
    }

    .line__name {
      min-inline-size: 0;
      overflow-wrap: anywhere;
    }

    .line__dots {
      flex: 1 1 1rem;
      translate: 0 -0.25rem;
      border-block-end: var(--stroke-hairline) dotted var(--color-paper-rule);
    }

    .line__price {
      flex: none;
      font: var(--type-price);
      font-variant-numeric: tabular-nums;
    }

    .line__price[data-unsure] {
      /* Paper is light in both themes, so the light-theme ramp, not the themed token. */
      color: var(--amber-700);
    }

    .printing {
      animation: print 420ms steps(12) both;
    }

    @keyframes print {
      from {
        clip-path: inset(0 100% 0 0);
        opacity: 0.3;
      }
    }

    .typing {
      display: flex;
      gap: var(--space-1-5);
      padding-block: var(--space-2);
      font: var(--type-meta-sm);
      color: var(--color-paper-text-subtle);
    }

    .cursor {
      animation: blink 1s steps(1) infinite;
    }

    @keyframes blink {
      50% {
        opacity: 0;
      }
    }

    .totals {
      display: grid;
      gap: var(--space-1);
      margin: 0;
    }

    .totals > div {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font: var(--type-meta-sm);
      letter-spacing: var(--tracking-receipt);
      text-transform: uppercase;
      color: var(--color-paper-text-muted);
    }

    .totals dd {
      margin: 0;
      font-variant-numeric: tabular-nums;
    }

    .totals [data-tone='warning'] {
      /* Paper is light in both themes, so the light-theme ramp, not the themed token. */
      color: var(--amber-700);
    }

    .totals .grand {
      padding-block-start: var(--space-2);
    }

    .totals .grand dd {
      font: var(--type-receipt-total);
      letter-spacing: var(--tracking-display-lg);
      color: var(--color-paper-text);
    }

    .stamp {
      position: absolute;
      inset: auto auto var(--space-7) 28%;
      padding: var(--space-1-5) var(--space-3);
      border: 3px solid var(--green-700);
      border-radius: var(--radius-md);
      color: var(--green-700);
      font: 600 1.25rem/1 var(--font-mono);
      letter-spacing: 0.16em;
      text-transform: uppercase;
      rotate: -14deg;
      opacity: 0.85;
      pointer-events: none;
    }

    .stamping {
      animation: thump 480ms cubic-bezier(0.2, 0.8, 0.3, 1.2) both;
    }

    @keyframes thump {
      from {
        scale: 1.8;
        opacity: 0;
      }
      70% {
        scale: 0.94;
      }
    }

    .go {
      justify-self: stretch;
    }

    @media (prefers-reduced-motion: reduce) {
      .beam,
      .cursor,
      .printing,
      .stamping {
        animation: none;
      }
    }
  `,
})
export class ImportReading {
  readonly importId = input.required<string>();
  readonly pages = input.required<ImportPage[]>();
  readonly draft = input.required<EditDraft>();
  readonly venueName = input('');
  readonly createdAt = input('');
  /** Every page is done or failed. */
  readonly done = input(false);
  /** The user wants to go on to the review. */
  readonly review = output();

  protected readonly pageStatus = PAGE_STATUS;
  protected readonly pagesLabel = $localize`:@@import.pages:Stranice`;
  protected readonly shortId = computed(() => this.importId().slice(-6).toUpperCase());

  protected pageLabel(page: ImportPage): string {
    const n = page.page_index + 1;
    return $localize`:@@import.pageN:Stranica ${n}:number:`;
  }

  /** The page under the beam: the one being read, else the next in line, else the last one. */
  protected readonly current = computed(() => {
    const pages = this.pages();
    return (
      pages.find((page) => page.status === 'processing') ??
      pages.find((page) => page.status === 'queued') ??
      pages.at(-1)
    );
  });

  private readonly lines = computed<Line[]>(() => {
    const out: Line[] = [];
    this.draft().categories.forEach((category, c) => {
      if (!category.items.length) return;
      out.push({ kind: 'cat', key: `c${c}`, name: category.name });
      category.items.forEach((item, i) => {
        const unsure = item.uncertain.length > 0;
        const variants = item.variants.length ? item.variants : [null];
        variants.forEach((variant, v) =>
          out.push({
            kind: 'item',
            key: `c${c}i${i}v${v}`,
            name: variant?.label ? `${item.name} ${variant.label}` : item.name,
            price: variant?.price ?? null,
            priceText: variant?.price_text ?? '',
            unsure,
          }),
        );
      });
    });
    return out;
  });

  protected readonly counts = computed(() => {
    const categories = this.draft().categories.filter((category) => category.items.length);
    const items = categories.flatMap((category) => category.items);
    return {
      categories: categories.length,
      items: items.length,
      toCheck: items.filter(
        (item) => item.uncertain.length || item.variants.some((variant) => variant.price === null),
      ).length,
    };
  });

  protected readonly found = computed(() => this.counts().items);

  /** How many lines are on paper; catches up with `lines` one line at a time. */
  private readonly shown = signal(0);
  protected readonly printed = computed(() => this.lines().slice(0, this.shown()));

  constructor() {
    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => {
      clearInterval(timer);
      timer = undefined;
    };
    inject(DestroyRef).onDestroy(stop);

    effect(() => {
      const total = this.lines().length;
      if (reduced || this.shown() > total) {
        this.shown.set(total);
        return;
      }
      if (this.shown() === total || timer) return;
      timer = setInterval(() => {
        if (this.shown() >= this.lines().length) stop();
        else this.shown.update((n) => n + 1);
      }, LINE_MS);
    });
  }
}
