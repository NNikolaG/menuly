import { Component, computed, DestroyRef, inject, input, LOCALE_ID, signal } from '@angular/core';
import {
  LucideCheck,
  LucideChevronDown,
  LucideClock,
  LucideCopy,
  LucideWifi,
} from '@lucide/angular';
import { hasOpeningHours, openStatus, venueClock, weekdayNames } from '../venues/opening-hours';
import { WEEKDAYS } from '../venues/venue';
import type { PublicMenu } from './public-menu';

/** How often "open now" is re-checked while the menu stays open. */
const TICK_MS = 60_000;

/**
 * Opening hours (open now or not, and the week on request) and Wi-Fi for the guest menu header.
 * Renders nothing for what the venue has not set.
 */
@Component({
  selector: 'app-venue-info',
  imports: [LucideCheck, LucideChevronDown, LucideClock, LucideCopy, LucideWifi],
  template: `
    @if (week(); as week) {
      <details class="hours">
        <summary class="line">
          <svg lucideClock aria-hidden="true" [size]="16"></svg>
          <span class="status" [attr.data-open]="status()?.open ? '' : null">{{
            statusLabel()
          }}</span>
          <svg lucideChevronDown class="chevron" aria-hidden="true" [size]="16"></svg>
        </summary>
        <dl class="week">
          @for (row of week; track row.day) {
            <div class="week__row" [attr.aria-current]="row.today ? 'date' : null">
              <dt>{{ row.name }}</dt>
              <dd>{{ row.hours }}</dd>
            </div>
          }
        </dl>
      </details>
    }
    @if (venue().wifi; as wifi) {
      <div class="line wifi">
        <svg lucideWifi aria-hidden="true" [size]="16"></svg>
        <span i18n="@@publicMenu.wifi.label">Wi-Fi:</span>
        <span class="ssid">{{ wifi.ssid }}</span>
        @if (wifi.password) {
          <span class="sep" aria-hidden="true">·</span>
          <span class="nowrap">
            <span i18n="@@publicMenu.wifi.password">lozinka:</span>
            <code class="password">{{ wifi.password }}</code>
            <button
              type="button"
              class="copy"
              [attr.aria-label]="copyLabel"
              (click)="copy(wifi.password)"
            >
              @if (copied()) {
                <svg lucideCheck aria-hidden="true" [size]="16"></svg>
              } @else {
                <svg lucideCopy aria-hidden="true" [size]="16"></svg>
              }
            </button>
          </span>
          <span class="live" aria-live="polite">{{ copied() ? copiedLabel : '' }}</span>
        } @else if (wifi.access === 'staff') {
          <span class="sep" aria-hidden="true">·</span>
          <span i18n="@@publicMenu.wifi.askStaff">Lozinku pitaj osoblje</span>
        } @else {
          <span class="sep" aria-hidden="true">·</span>
          <span i18n="@@publicMenu.wifi.open">Otvorena mreža</span>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: start;
      column-gap: var(--space-4);
      color: var(--color-text-muted);
      font: var(--type-body-sm);
    }

    .line {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-1-5);
      min-block-size: var(--touch-min);
    }

    summary {
      cursor: pointer;
      list-style: none;
    }

    summary::-webkit-details-marker {
      display: none;
    }

    summary:focus-visible,
    .copy:focus-visible {
      outline: var(--stroke-focus) solid var(--color-focus);
      outline-offset: var(--focus-offset);
      border-radius: var(--radius-sm);
    }

    .status {
      text-decoration: underline;
      text-decoration-color: var(--color-border-strong);
      text-underline-offset: var(--underline-offset);
    }

    .status[data-open] {
      color: var(--color-success);
    }

    .chevron {
      transition: transform var(--duration-fast) var(--ease-out);
    }

    details[open] .chevron {
      transform: rotate(180deg);
    }

    .week {
      display: grid;
      gap: var(--space-1);
      margin: 0 0 var(--space-2);
      padding-inline-start: calc(16px + var(--space-1-5));
    }

    .week__row {
      display: grid;
      grid-template-columns: 8rem auto;
      gap: var(--space-3);
    }

    .week__row[aria-current] {
      color: var(--color-text);
      font-weight: 600;
    }

    dt,
    dd {
      margin: 0;
    }

    dd {
      font: var(--type-meta);
      font-weight: inherit;
    }

    .ssid {
      color: var(--color-text);
    }

    .sep {
      color: var(--color-text-subtle);
    }

    .password {
      font: var(--type-meta);
      color: var(--color-text);
      user-select: all;
    }

    .nowrap {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1-5);
      white-space: nowrap;
    }

    /* Read out by screen readers only. */
    .live {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }

    .copy {
      display: inline-grid;
      place-items: center;
      inline-size: var(--touch-min);
      block-size: var(--touch-min);
      margin-block: calc(-1 * var(--space-2));
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      cursor: pointer;
    }
  `,
})
export class VenueInfo {
  readonly venue = input.required<PublicMenu['venue']>();

  private readonly locale = inject(LOCALE_ID);
  private readonly names = weekdayNames(this.locale);
  private readonly now = signal(new Date());
  protected readonly copied = signal(false);

  protected readonly copyLabel = $localize`:@@publicMenu.wifi.copy:Kopiraj lozinku`;
  protected readonly copiedLabel = $localize`:@@publicMenu.wifi.copied:Lozinka je kopirana.`;

  private readonly hours = computed(() => {
    const hours = this.venue().opening_hours;
    return hasOpeningHours(hours) ? hours : null;
  });

  protected readonly status = computed(() => {
    const hours = this.hours();
    return hours ? openStatus(hours, this.venue().timezone, this.now()) : null;
  });

  protected readonly statusLabel = computed(() => {
    const status = this.status();
    if (!status) return '';
    if (status.open)
      return $localize`:@@publicMenu.hours.openUntil:Otvoreno · do ${status.until}:time:`;
    const next = status.next;
    if (!next) return $localize`:@@publicMenu.hours.closed:Zatvoreno`;
    if (next.today)
      return $localize`:@@publicMenu.hours.opensAt:Zatvoreno · otvara u ${next.time}:time:`;
    const day = this.names[next.day];
    return $localize`:@@publicMenu.hours.opensOn:Zatvoreno · otvara ${day}:day: u ${next.time}:time:`;
  });

  /** Monday first, the venue's today marked; closed days say so. */
  protected readonly week = computed(() => {
    const hours = this.hours();
    if (!hours) return null;
    const today = venueClock(this.now(), this.venue().timezone).day;
    const closed = $localize`:@@publicMenu.hours.closedDay:Zatvoreno`;
    return WEEKDAYS.map((day) => ({
      day,
      name: this.names[day],
      today: day === today,
      hours: hours[day]?.length
        ? hours[day].map(([from, to]) => `${from} – ${to}`).join(', ')
        : closed,
    }));
  });

  private copiedTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), TICK_MS);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      clearTimeout(this.copiedTimer);
    });
  }

  protected async copy(password: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(password);
      this.copied.set(true);
      clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // Clipboard blocked: the password is on screen and selectable.
    }
  }
}
