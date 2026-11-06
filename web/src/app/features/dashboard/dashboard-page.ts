import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideArrowRight, LucidePlus } from '@lucide/angular';
import { AuthStore } from '../../core/auth/auth-store';
import { venuePublicUrl } from '../../core/venues/venue-public-url';
import { VenuesApi } from '../../core/venues/venues-api';
import { AppButton } from '../../shared/ui';

/** Start screen: who is signed in, how many venues, and the next step. */
@Component({
  selector: 'app-dashboard-page',
  imports: [DatePipe, RouterLink, AppButton, LucidePlus, LucideArrowRight],
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
        <div class="card">
          <div class="stat">
            <span class="stat__label" i18n="@@dashboard.venuesStat">Objekti</span>
            <span class="stat__value">{{ venueCount() ?? '—' }}</span>
          </div>
        </div>

        @if (venueCount() === 0) {
          <div class="card stack" data-variant="inverse" data-span="2" data-rows="2" data-gap="3">
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
          <div class="card stack" data-span="2" data-rows="2" data-gap="3">
            <p class="card__eyebrow" i18n="@@dashboard.publicLink">Javni link</p>
            <p class="card__title">{{ venue.name }}</p>
            <p class="meta">{{ venueUrl() }}</p>
            <div>
              <a appButton variant="secondary" routerLink="/objekti">
                <ng-container i18n="@@dashboard.allVenues">Svi objekti</ng-container>
                <svg lucideArrowRight aria-hidden="true"></svg>
              </a>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export default class DashboardPage {
  protected readonly auth = inject(AuthStore);
  private readonly venues = inject(VenuesApi).listResource();

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
