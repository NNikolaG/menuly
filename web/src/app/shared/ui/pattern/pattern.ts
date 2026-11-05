import { Component, computed, input } from '@angular/core';
import { generatePattern } from './pattern.generator';

/** Bauhaus brand pattern generated from a seed (venue, category or order name). Decoration only. */
@Component({
  selector: 'app-pattern',
  host: {
    class: 'pattern',
    'aria-hidden': 'true',
    '[attr.data-fluid]': 'fluid() ? "" : null',
    '[style.--cols]': 'pattern().cols',
    '[style.--rows]': 'pattern().rows',
    '[style.--cell.px]': 'cell()',
  },
  template: `
    @for (c of pattern().cells; track $index) {
      <span
        class="pattern__cell"
        [attr.data-kind]="c.kind"
        [attr.data-rot]="c.rot"
        [style.--bg]="c.bg"
        [style.--fg]="c.fg"
        [style.grid-column]="c.x + 1 + ' / span ' + c.span"
        [style.grid-row]="c.y + 1 + ' / span ' + c.span"
      ></span>
    }
  `,
})
export class AppPattern {
  /** Always app data (venue, category, order number), never random per load. */
  readonly seed = input.required<string>();
  readonly cols = input(8);
  readonly rows = input(4);
  /** Cell size in px; without it the CSS decides (`--size-pattern-cell` or the parent's `--cell`). */
  readonly cell = input<number>();
  /** Two-cell squares; off for one-row strips. */
  readonly big = input(true);
  /** Fill the parent size container with the whole pattern, cells stay square. */
  readonly fluid = input(false);

  protected readonly pattern = computed(() =>
    generatePattern(this.seed(), { cols: this.cols(), rows: this.rows(), big: this.big() }),
  );
}
