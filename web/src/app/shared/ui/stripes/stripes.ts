import { Component, computed, input } from '@angular/core';
import { generateStripes } from './stripes.generator';

/** "Trake": seeded band of narrow brand-color bars, the alternative to the Bauhaus pattern. Decoration only. */
@Component({
  selector: 'app-stripes',
  host: {
    class: 'stripes',
    'aria-hidden': 'true',
    '[style.--cols]': 'stripes().cols',
    '[style.--rows]': 'stripes().rows',
  },
  template: `
    @for (column of stripes().cells; track $index) {
      @for (color of column; track $index) {
        <span class="stripes__cell" [style.--bg]="color ?? 'transparent'"></span>
      }
    }
  `,
})
export class AppStripes {
  /** Always app data (venue name), never random per load. */
  readonly seed = input.required<string>();
  readonly cols = input(28);
  readonly rows = input(4);

  protected readonly stripes = computed(() =>
    generateStripes(this.seed(), this.cols(), this.rows()),
  );
}
