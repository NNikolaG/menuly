import { DatePipe } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';

export interface DayViews {
  date: string;
  views: number;
}

/**
 * Menu opens per day as thin bars (one series, so no legend; the card title names it). Hover or focus shows the
 * day and count; a hidden table carries the same numbers for screen readers.
 */
@Component({
  selector: 'app-views-chart',
  imports: [DatePipe],
  template: `
    <div class="plot" (mouseleave)="active.set(null)">
      @for (day of days(); track day.date; let i = $index) {
        <div
          class="hit"
          (mouseenter)="active.set(i)"
          [attr.data-active]="active() === i ? '' : null"
        >
          <span class="bar" [style.block-size.%]="height(day.views)"></span>
        </div>
      }
      @if (activeDay(); as day) {
        <div class="tip" role="status" [style.inset-inline-start.%]="tipLeft()">
          <span class="tip__date">{{ day.date | date: 'EEE dd.MM.' }}</span>
          <strong>{{ day.views }}</strong>
        </div>
      }
    </div>
    <div class="axis" aria-hidden="true">
      <span>{{ days()[0]?.date | date: 'dd.MM.' }}</span>
      <span>{{ days()[days().length - 1]?.date | date: 'dd.MM.' }}</span>
    </div>
    <table class="visually-hidden">
      <caption>
        {{
          caption()
        }}
      </caption>
      <tbody>
        @for (day of days(); track day.date) {
          <tr>
            <th scope="row">{{ day.date | date: 'dd.MM.y.' }}</th>
            <td>{{ day.views }}</td>
          </tr>
        }
      </tbody>
    </table>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-1);
      min-block-size: 0;
    }

    .plot {
      position: relative;
      display: flex;
      align-items: flex-end;
      gap: 2px;
      block-size: 100%;
      min-block-size: 5rem;
      border-block-end: var(--stroke-hairline) solid var(--color-border);
    }

    .hit {
      display: flex;
      flex: 1;
      align-items: flex-end;
      block-size: 100%;
    }

    .bar {
      inline-size: 100%;
      min-block-size: 1px;
      border-radius: 4px 4px 0 0;
      background: var(--color-accent);
      opacity: 0.85;
    }

    .hit[data-active] .bar {
      opacity: 1;
    }

    .plot:has([data-active]) .hit:not([data-active]) .bar {
      opacity: 0.45;
    }

    .tip {
      position: absolute;
      inset-block-start: 0;
      translate: -50% 0;
      display: grid;
      padding: var(--space-1) var(--space-2);
      border: var(--stroke-hairline) solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-surface-raised);
      box-shadow: var(--shadow-md);
      font: var(--type-meta);
      color: var(--color-text);
      white-space: nowrap;
      pointer-events: none;
    }

    .tip__date {
      color: var(--color-text-muted);
    }

    .axis {
      display: flex;
      justify-content: space-between;
      font: var(--type-meta);
      color: var(--color-text-subtle);
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
export class ViewsChart {
  readonly days = input.required<readonly DayViews[]>();
  /** Names the hidden table. */
  readonly caption = input('');

  protected readonly active = signal<number | null>(null);
  protected readonly activeDay = computed(() => {
    const index = this.active();
    return index === null ? undefined : this.days()[index];
  });
  private readonly max = computed(() => Math.max(1, ...this.days().map((day) => day.views)));

  protected height(views: number): number {
    return (views / this.max()) * 100;
  }

  /** Keeps the tooltip inside the plot near the edges. */
  protected tipLeft(): number {
    const count = this.days().length;
    const index = this.active() ?? 0;
    return Math.min(90, Math.max(10, ((index + 0.5) / count) * 100));
  }
}
