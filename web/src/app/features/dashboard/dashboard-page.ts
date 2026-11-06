import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideArrowRight, LucidePlus } from '@lucide/angular';
import { AuthStore } from '../../core/auth/auth-store';
import { venuePublicUrl } from '../../core/venues/venue-public-url';
import { VenuesApi } from '../../core/venues/venues-api';
import { VenuesStore } from '../../core/venues/venues-store';
import { AppButton, AppSelect } from '../../shared/ui';
import { ViewsChart } from './views-chart';

/** Start screen: who is signed in, how many venues, and the next step. */
@Component({
  selector: 'app-dashboard-page',
  imports: [DatePipe, RouterLink, AppButton, AppSelect, ViewsChart, LucidePlus, LucideArrowRight],
  template: `
    <div class="stack" data-gap="6">
      <div class="stack" data-gap="1">
        <p class="eyebrow">{{ today | date: 'EEE dd MMM, y' }}</p>
        @if (auth.me.value(); as me) {
          <h1 i18n="@@dashboard.welcome">Dobro došli, {{ me.user.name }}.</h1>
        } @else {
          <h1 i18n="@@dashboard.heading">Pregled</h1>
        }
      </div>

      <div class="bento">
        <div class="card count-card" data-rows="2">
          <div class="stat">
            <span class="stat__label" i18n="@@dashboard.venuesStat">Objekti</span>
            <span class="stat__value">{{ venueCount() ?? '—' }}</span>
          </div>
        </div>

        @if (venueCount() === 0) {
          <div class="card stack link-card" data-variant="inverse" data-rows="2" data-gap="3">
            <p class="card__eyebrow" i18n="@@dashboard.firstStep">Prvi korak</p>
            <p class="card__title" i18n="@@dashboard.addVenueTitle">Dodaj svoj prvi objekat</p>
            <p class="card__body" i18n="@@dashboard.addVenueBody">
              Objekat dobija svoj javni link i meni koji gosti otvaraju preko QR koda.
            </p>
            @if (isOwner()) {
              <div>
                <a appButton variant="inverse" routerLink="/objekti/novi">
                  <svg lucidePlus aria-hidden="true"></svg>
                  <ng-container i18n="@@venues.add">Dodaj objekat</ng-container>
                </a>
              </div>
            }
          </div>
        } @else if (firstVenue(); as venue) {
          <div class="card stack link-card" data-rows="2" data-gap="3">
            <p class="card__eyebrow" i18n="@@dashboard.publicLink">Javni link</p>
            <p class="card__title">{{ venue.name }}</p>
            <p class="meta">{{ venueUrl() }}</p>
            <div>
              @if (venueCount() === 1) {
                <a appButton variant="secondary" [routerLink]="['/objekti', venue.id]">
                  <ng-container i18n="@@dashboard.openVenue">Otvori objekat</ng-container>
                  <svg lucideArrowRight aria-hidden="true"></svg>
                </a>
              } @else {
                <a appButton variant="secondary" routerLink="/objekti">
                  <ng-container i18n="@@dashboard.allVenues">Svi objekti</ng-container>
                  <svg lucideArrowRight aria-hidden="true"></svg>
                </a>
              }
            </div>
          </div>
        }

        @if (statsVenue(); as venue) {
          <section
            class="card stack views"
            data-rows="2"
            data-gap="3"
            aria-labelledby="views-title"
          >
            <div class="row" data-justify="between">
              <div class="stat">
                <span class="stat__label" id="views-title" i18n="@@dashboard.views"
                  >Otvaranja menija, 30 dana</span
                >
                <span class="stat__value">{{ stats.value()?.total ?? '—' }}</span>
              </div>
              @if (venueOptions().length > 1) {
                <app-select
                  [label]="venueLabel"
                  [options]="venueOptions()"
                  [value]="venue.id"
                  (valueChange)="pickedVenue.set($event)"
                />
              }
            </div>
            @if (stats.value(); as s) {
              <app-views-chart [days]="s.days" [caption]="venue.name" />
            } @else if (stats.error()) {
              <p class="meta" i18n="@@dashboard.viewsError">Statistika nije učitana.</p>
            }
          </section>
        }
      </div>
    </div>
  `,
  styles: `
    /* Fills the row next to the venue count, so no column is left empty on wide screens. */
    .link-card {
      grid-column: span 3;
    }

    @media (max-width: 720px) {
      .link-card {
        grid-column: 1 / -1;
      }

      .count-card {
        grid-column: 1 / -1;
        grid-row: auto;
      }
    }

    .views {
      grid-column: 1 / -1;
      justify-content: flex-start;
    }

    .views app-views-chart {
      flex: 1;
    }

    .views app-select {
      min-inline-size: 12rem;
    }
  `,
})
export default class DashboardPage {
  protected readonly auth = inject(AuthStore);
  private readonly venuesApi = inject(VenuesApi);
  private readonly venues = inject(VenuesStore).list;

  protected readonly venueLabel = $localize`:@@dashboard.viewsVenue:Objekat`;
  protected readonly pickedVenue = signal<string | null>(null);
  protected readonly venueOptions = computed(() =>
    (this.venues.value()?.items ?? []).map((venue) => ({ value: venue.id, label: venue.name })),
  );
  /** Venue whose opens the chart shows: the picked one, else the first. */
  protected readonly statsVenue = computed(() => {
    const items = this.venues.value()?.items ?? [];
    return items.find((venue) => venue.id === this.pickedVenue()) ?? items[0];
  });
  protected readonly stats = this.venuesApi.statsResource(() => this.statsVenue()?.id);

  protected readonly today = new Date();

  protected readonly venueCount = computed(() => this.venues.value()?.items.length);
  protected readonly firstVenue = computed(() => this.venues.value()?.items[0]);
  protected readonly isOwner = computed(() => this.auth.role() === 'owner');
  protected readonly venueUrl = computed(() => {
    const venue = this.firstVenue();
    const tenant = this.auth.me.value()?.tenant.slug;
    return venue && tenant ? venuePublicUrl(tenant, venue.slug) : '';
  });
}
