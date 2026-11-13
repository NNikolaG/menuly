import { Component, inject, RESPONSE_INIT } from '@angular/core';
import { Meta } from '@angular/platform-browser';

@Component({
  selector: 'app-not-found-page',
  template: `
    <h1 i18n="@@notFound.heading">Stranica nije pronađena</h1>
    <p i18n="@@notFound.body">Proverite adresu ili se vratite na početnu stranu.</p>
  `,
})
export default class NotFoundPage {
  constructor() {
    // Server-rendered (tenant host): a real 404, so search engines drop the URL.
    const response = inject(RESPONSE_INIT, { optional: true });
    if (response) response.status = 404;
    inject(Meta).updateTag({ name: 'robots', content: 'noindex, nofollow' });
  }
}
