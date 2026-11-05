import { Component } from '@angular/core';

@Component({
  selector: 'app-not-found-page',
  template: `
    <h1 i18n="@@notFound.heading">Stranica nije pronađena</h1>
    <p i18n="@@notFound.body">Proverite adresu ili se vratite na početnu stranu.</p>
  `,
})
export default class NotFoundPage {}
