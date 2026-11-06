import { Component, computed, inject, input, linkedSignal, LOCALE_ID, signal } from '@angular/core';
import { form, FormField, maxLength, pattern, required, submit } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { LucideArrowLeft } from '@lucide/angular';
import { firstValueFrom } from 'rxjs';
import { toApiError } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth-store';
import { AppButton, AppField, AppInput, AppSelect, type AppSelectOption } from '../../shared/ui';
import type { Venue, VenueInput } from '../../core/venues/venue';
import { venuePublicUrl } from '../../core/venues/venue-public-url';
import { VenuesApi } from '../../core/venues/venues-api';

interface VenueModel {
  name: string;
  slug: string;
  address: string;
  phone: string;
  currency: string;
}

/** Currencies of the region first; a venue's existing other code is kept in the list. */
const CURRENCIES = ['RSD', 'EUR', 'BAM', 'MKD', 'HUF', 'RON', 'BGN', 'ALL', 'CHF', 'USD', 'GBP'];

const SLUG = /^([a-z0-9]+(-[a-z0-9]+)*)?$/;

function toModel(venue: Venue | undefined): VenueModel {
  return {
    name: venue?.name ?? '',
    slug: venue?.slug ?? '',
    address: venue?.address ?? '',
    phone: venue?.phone ?? '',
    currency: venue?.currency ?? 'RSD',
  };
}

/** Create (`/objekti/novi`) and edit (`/objekti/:venueId/izmena`) a venue. */
@Component({
  selector: 'app-venue-form-page',
  imports: [FormField, RouterLink, AppButton, AppField, AppInput, AppSelect, LucideArrowLeft],
  template: `
    <div class="stack" data-gap="6">
      <div class="stack" data-gap="2">
        <a appButton variant="ghost" size="sm" routerLink="/objekti" class="back">
          <svg lucideArrowLeft aria-hidden="true"></svg>
          <ng-container i18n="@@venues.backToList">Objekti</ng-container>
        </a>
        <h1>{{ heading() }}</h1>
      </div>

      @if (venue.error()) {
        <p role="alert" i18n="@@venues.notFound">Objekat nije pronađen.</p>
      } @else if (isEdit() && !venue.hasValue()) {
        <p class="meta" i18n="@@common.loading">Učitavanje…</p>
      } @else {
        <form class="card stack" data-gap="5" novalidate (submit)="onSubmit($event)">
          <app-field
            i18n-label="@@venues.field.name"
            label="Naziv"
            controlId="venue-name"
            [field]="form.name"
          >
            <input appInput id="venue-name" autocomplete="organization" [formField]="form.name" />
          </app-field>
          <app-field
            i18n-label="@@venues.field.slug"
            label="Slug"
            controlId="venue-slug"
            [hint]="slugHint()"
            [field]="form.slug"
          >
            <input appInput id="venue-slug" [formField]="form.slug" />
          </app-field>
          <app-field
            i18n-label="@@venues.field.address"
            label="Adresa"
            controlId="venue-address"
            [field]="form.address"
          >
            <input
              appInput
              id="venue-address"
              autocomplete="street-address"
              [formField]="form.address"
            />
          </app-field>
          <div class="row" data-gap="4">
            <app-field
              i18n-label="@@venues.field.phone"
              label="Telefon"
              controlId="venue-phone"
              [field]="form.phone"
            >
              <input
                appInput
                id="venue-phone"
                type="tel"
                autocomplete="tel"
                [formField]="form.phone"
              />
            </app-field>
            <app-field
              i18n-label="@@venues.field.currency"
              label="Valuta"
              controlId="venue-currency"
              [field]="form.currency"
            >
              <app-select
                controlId="venue-currency"
                [options]="currencies()"
                [formField]="form.currency"
              />
            </app-field>
          </div>
          @if (error()) {
            <p role="alert" class="error">{{ error() }}</p>
          }
          <div class="row">
            <button appButton type="submit" [disabled]="form().submitting()">
              {{ submitLabel() }}
            </button>
            <a appButton variant="ghost" routerLink="/objekti" i18n="@@common.cancel">Otkaži</a>
          </div>
        </form>
      }
    </div>
  `,
  styles: `
    .back {
      align-self: flex-start;
    }

    .error {
      color: var(--color-danger);
    }
  `,
})
export default class VenueFormPage {
  private readonly api = inject(VenuesApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  /** Route param; absent on `/objekti/novi`. */
  readonly venueId = input<string>();

  protected readonly isEdit = computed(() => this.venueId() !== undefined);
  protected readonly venue = this.api.venueResource(this.venueId);

  private readonly model = linkedSignal<VenueModel>(() => toModel(this.venue.value()));
  protected readonly form = form(this.model, (path) => {
    required(path.name);
    maxLength(path.slug, 60);
    pattern(path.slug, SLUG, {
      message: $localize`:@@venues.field.slugPattern:Samo mala slova, brojevi i crtice, npr. centar-1.`,
    });
    required(path.currency);
    maxLength(path.currency, 3);
    pattern(path.currency, /^[A-Z]{3}$/, {
      message: $localize`:@@venues.field.currencyPattern:Unesi troslovnu oznaku, npr. RSD.`,
    });
  });
  protected readonly error = signal('');

  private readonly currencyNames = new Intl.DisplayNames([inject(LOCALE_ID)], { type: 'currency' });
  protected readonly currencies = computed<AppSelectOption[]>(() => {
    const current = this.model().currency;
    const codes = current && !CURRENCIES.includes(current) ? [current, ...CURRENCIES] : CURRENCIES;
    return codes.map((code) => ({ value: code, label: code, hint: this.currencyNames.of(code) }));
  });

  protected readonly heading = computed(() =>
    this.isEdit()
      ? (this.venue.value()?.name ?? $localize`:@@venues.editHeading:Izmena objekta`)
      : $localize`:@@venues.newHeading:Novi objekat`,
  );
  protected readonly submitLabel = computed(() =>
    this.isEdit() ? $localize`:@@common.save:Sačuvaj` : $localize`:@@venues.create:Dodaj objekat`,
  );
  protected readonly slugHint = computed(() => {
    const slug = this.form.slug().value();
    if (!slug)
      return $localize`:@@venues.field.slugEmptyHint:Ostavi prazno i napravićemo ga od naziva.`;
    const url = venuePublicUrl(this.auth.me.value()?.tenant.slug ?? '…', slug);
    return $localize`:@@venues.field.slugHint:Javni link: ${url}:url:`;
  });

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.error.set('');
    await submit(this.form, async (field) => {
      const value = field().value();
      const input: VenueInput = { ...value, slug: value.slug || undefined };
      const id = this.venueId();
      try {
        const saved = await firstValueFrom(
          id ? this.api.update(id, input) : this.api.create({ ...input, name: value.name }),
        );
        await this.router.navigate(['/objekti', saved.id]);
      } catch (error) {
        this.error.set(errorMessage(toApiError(error).code));
      }
      return undefined;
    });
  }
}

function errorMessage(code: string): string {
  switch (code) {
    case 'slug_taken':
      return $localize`:@@venues.slugTaken:Ovaj slug već koristi drugi objekat.`;
    case 'forbidden':
      return $localize`:@@common.forbidden:Nemaš dozvolu za ovu radnju.`;
    case 'validation_failed':
      return $localize`:@@venues.validationFailed:Proveri unete podatke.`;
    default:
      return $localize`:@@auth.unknownError:Nešto nije u redu. Pokušajte ponovo.`;
  }
}
