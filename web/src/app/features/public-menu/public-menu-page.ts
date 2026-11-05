import { Component, input } from '@angular/core';

/** Guest view of a venue's published menu at `{tenant}.menuly.app/{venue}`. */
@Component({
  selector: 'app-public-menu-page',
  template: `<h1 i18n="@@publicMenu.heading">Meni: {{ venueSlug() }}</h1>`,
})
export default class PublicMenuPage {
  readonly venueSlug = input.required<string>();
}
