import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { VenuesApi } from './venues-api';

@Component({
  selector: 'app-venues-page',
  imports: [DatePipe],
  template: `
    <h1 i18n="@@venues.heading">Objekti</h1>
    @if (venues.isLoading()) {
      <p i18n="@@common.loading">Učitavanje…</p>
    } @else if (venues.error()) {
      <p role="alert" i18n="@@venues.loadError">Objekti nisu učitani.</p>
      <button type="button" (click)="venues.reload()" i18n="@@common.retry">Pokušaj ponovo</button>
    } @else {
      @for (venue of venues.value()?.items; track venue.id) {
        <article>
          <h2>{{ venue.name }}</h2>
          <p>{{ venue.address }}</p>
          <p i18n="@@venues.createdAt">Dodat {{ venue.created_at | date: 'mediumDate' }}</p>
        </article>
      } @empty {
        <p i18n="@@venues.empty">Još nema objekata.</p>
      }
    }
  `,
})
export default class VenuesPage {
  protected readonly venues = inject(VenuesApi).listResource();
}
