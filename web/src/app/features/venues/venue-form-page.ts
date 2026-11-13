import {
  Component,
  computed,
  inject,
  Injector,
  input,
  linkedSignal,
  LOCALE_ID,
  signal,
} from '@angular/core';
import {
  applyEach,
  applyWhen,
  form,
  FormField,
  maxLength,
  pattern,
  required,
  submit,
  validate,
} from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { LucideArrowLeft, LucidePlus, LucideX } from '@lucide/angular';
import { firstValueFrom } from 'rxjs';
import { toApiError } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth-store';
import {
  AppButton,
  AppField,
  AppInput,
  AppSegmented,
  type AppSegmentedOption,
  AppSelect,
  type AppSelectOption,
  AppSwitch,
  Toaster,
} from '../../shared/ui';
import { weekdayNames } from '../../core/venues/opening-hours';
import {
  type OpeningHours,
  type Venue,
  VENUE_TYPES,
  type VenueInput,
  type VenueType,
  type Weekday,
  WEEKDAYS,
} from '../../core/venues/venue';
import { venuePublicUrl } from '../../core/venues/venue-public-url';
import { VenuesApi } from '../../core/venues/venues-api';
import { VenuesStore } from '../../core/venues/venues-store';

interface IntervalModel {
  from: string;
  to: string;
}

interface DayModel {
  day: Weekday;
  open: boolean;
  /** Kept when the day is switched off, so switching it back on restores them. */
  intervals: IntervalModel[];
}

interface VenueModel {
  name: string;
  slug: string;
  address: string;
  city: string;
  postal_code: string;
  country: string;
  phone: string;
  currency: string;
  venue_type: string;
  /** Comma-separated. */
  cuisine: string;
  description: string;
  /** "44.8176, 20.4569", as Google Maps copies it; empty = not set. */
  coordinates: string;
  days: DayModel[];
  wifi_available: boolean;
  wifi_ssid: string;
  wifi_password: string;
  wifi_access: string;
}

/** The API allows 3 intervals a day (e.g. breakfast, lunch, dinner). */
const MAX_INTERVALS = 3;
const DEFAULT_INTERVAL: IntervalModel = { from: '08:00', to: '22:00' };
/** 802.11 limit on the network name, in bytes. */
const MAX_SSID_BYTES = 32;

/** Currencies of the region first; a venue's existing other code is kept in the list. */
const CURRENCIES = ['RSD', 'EUR', 'BAM', 'MKD', 'HUF', 'RON', 'BGN', 'ALL', 'CHF', 'USD', 'GBP'];

/** Countries of the region first; a venue's existing other code is kept in the list. */
const COUNTRIES = ['RS', 'ME', 'BA', 'HR', 'MK', 'SI', 'HU', 'RO', 'BG', 'AL', 'GR', 'AT', 'DE'];
const MAX_CUISINES = 5;
const MAX_CUISINE_LENGTH = 40;

const SLUG = /^([a-z0-9]+(-[a-z0-9]+)*)?$/;

/** "44.8176, 20.4569" → both numbers; `null` when empty; `undefined` when it is not a place on Earth. */
function parseCoordinates(text: string): [number, number] | null | undefined {
  if (!text.trim()) return null;
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
  if (!match) return undefined;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? [latitude, longitude] : undefined;
}

function parseCuisine(text: string): string[] {
  return text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function toModel(venue: Venue | undefined): VenueModel {
  return {
    name: venue?.name ?? '',
    slug: venue?.slug ?? '',
    address: venue?.address ?? '',
    city: venue?.city ?? '',
    postal_code: venue?.postal_code ?? '',
    country: venue?.country ?? 'RS',
    phone: venue?.phone ?? '',
    currency: venue?.currency ?? 'RSD',
    venue_type: venue?.venue_type ?? 'other',
    cuisine: venue?.cuisine.join(', ') ?? '',
    description: venue?.description ?? '',
    coordinates:
      venue && venue.latitude !== null && venue.longitude !== null
        ? `${venue.latitude}, ${venue.longitude}`
        : '',
    days: WEEKDAYS.map((day) => {
      const intervals = venue?.opening_hours[day] ?? [];
      return {
        day,
        open: intervals.length > 0,
        intervals: intervals.length
          ? intervals.map(([from, to]) => ({ from, to }))
          : [{ ...DEFAULT_INTERVAL }],
      };
    }),
    wifi_available: venue?.wifi_available ?? false,
    wifi_ssid: venue?.wifi_ssid ?? '',
    wifi_password: venue?.wifi_password ?? '',
    wifi_access: venue?.wifi_access ?? 'staff',
  };
}

/** Open days only; all closed is `{}`, which guests read as "hours not set". */
function toOpeningHours(days: DayModel[]): OpeningHours {
  const hours: OpeningHours = {};
  for (const day of days) {
    if (day.open) hours[day.day] = day.intervals.map(({ from, to }) => [from, to]);
  }
  return hours;
}

/** Create (`/objekti/novi`) and edit (`/objekti/:venueId/izmena`) a venue. */
@Component({
  selector: 'app-venue-form-page',
  imports: [
    FormField,
    RouterLink,
    AppButton,
    AppField,
    AppInput,
    AppSegmented,
    AppSelect,
    AppSwitch,
    LucideArrowLeft,
    LucidePlus,
    LucideX,
  ],
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
        <p class="loading" role="status" i18n="@@common.loading">Učitavanje…</p>
      } @else {
        <form class="stack" data-gap="6" novalidate (submit)="onSubmit($event)">
          <section class="card stack" data-gap="5" aria-labelledby="venue-basics">
            <h2 id="venue-basics" class="card__title" i18n="@@venues.section.basics">Osnovno</h2>
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
            <div class="row place" data-gap="4">
              <app-field
                i18n-label="@@venues.field.city"
                label="Grad"
                controlId="venue-city"
                [field]="form.city"
              >
                <input
                  appInput
                  id="venue-city"
                  autocomplete="address-level2"
                  [formField]="form.city"
                />
              </app-field>
              <app-field
                i18n-label="@@venues.field.postalCode"
                label="Poštanski broj"
                controlId="venue-postal-code"
                [field]="form.postal_code"
              >
                <input
                  appInput
                  id="venue-postal-code"
                  autocomplete="postal-code"
                  [formField]="form.postal_code"
                />
              </app-field>
              <app-field
                i18n-label="@@venues.field.country"
                label="Država"
                controlId="venue-country"
                [field]="form.country"
              >
                <app-select
                  controlId="venue-country"
                  [options]="countries()"
                  [formField]="form.country"
                />
              </app-field>
            </div>
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
          </section>

          <section class="card stack" data-gap="5" aria-labelledby="venue-search">
            <div class="stack" data-gap="1">
              <h2 id="venue-search" class="card__title" i18n="@@venues.section.search">
                Vidljivost u pretrazi
              </h2>
              <p class="meta" i18n="@@venues.search.hint">
                Po ovome Google i AI asistenti znaju šta je objekat i gde se nalazi.
              </p>
            </div>
            <div class="row place" data-gap="4">
              <app-field
                i18n-label="@@venues.field.type"
                label="Tip objekta"
                controlId="venue-type"
                [field]="form.venue_type"
              >
                <app-select
                  controlId="venue-type"
                  [options]="venueTypes"
                  [formField]="form.venue_type"
                />
              </app-field>
              <app-field
                i18n-label="@@venues.field.cuisine"
                label="Kuhinja"
                controlId="venue-cuisine"
                i18n-hint="@@venues.field.cuisineHint"
                hint="Do 5, odvojeno zarezom, npr. Srpska kuhinja, Roštilj."
                [field]="form.cuisine"
              >
                <input appInput id="venue-cuisine" [formField]="form.cuisine" />
              </app-field>
            </div>
            <app-field
              i18n-label="@@venues.field.description"
              label="Kratak opis"
              controlId="venue-description"
              i18n-hint="@@venues.field.descriptionHint"
              hint="Jedna ili dve rečenice, do 300 znakova. Prikazuje se u rezultatima pretrage."
              [field]="form.description"
            >
              <textarea
                appInput
                id="venue-description"
                rows="3"
                [formField]="form.description"
              ></textarea>
            </app-field>
            <app-field
              i18n-label="@@venues.field.coordinates"
              label="Koordinate"
              controlId="venue-coordinates"
              i18n-hint="@@venues.field.coordinatesHint"
              hint="U Google mapama desni klik na objekat, pa klik na brojeve da ih kopiraš."
              [field]="form.coordinates"
            >
              <input
                appInput
                id="venue-coordinates"
                inputmode="text"
                placeholder="44.8176, 20.4569"
                autocomplete="off"
                [formField]="form.coordinates"
              />
            </app-field>
          </section>

          <section class="card stack" data-gap="4" aria-labelledby="venue-hours">
            <div class="section-head">
              <div class="stack" data-gap="1">
                <h2 id="venue-hours" class="card__title" i18n="@@venues.section.hours">
                  Radno vreme
                </h2>
                <p class="meta" i18n="@@venues.hours.hint">
                  Gosti ga vide na meniju. Rad posle ponoći upiši kao npr. 17:00 – 01:00.
                </p>
              </div>
              <button
                appButton
                variant="ghost"
                size="sm"
                type="button"
                [disabled]="!model().days[0].open"
                (click)="copyMondayToAll()"
                i18n="@@venues.hours.copyMonday"
              >
                Kao ponedeljak, svaki dan
              </button>
            </div>
            <ul class="days" role="list">
              @for (day of model().days; track day.day; let d = $index) {
                <li class="day">
                  <label class="row day__name" data-gap="2">
                    <input type="checkbox" appSwitch [formField]="form.days[d].open" />
                    <span>{{ dayNames[day.day] }}</span>
                  </label>
                  @if (day.open) {
                    <div class="stack" data-gap="2">
                      @for (interval of day.intervals; track $index; let i = $index) {
                        <div class="interval">
                          <input
                            appInput
                            type="time"
                            [attr.aria-label]="intervalLabel(day.day, i, 'from')"
                            [formField]="form.days[d].intervals[i].from"
                          />
                          <span class="interval__dash" aria-hidden="true">–</span>
                          <input
                            appInput
                            type="time"
                            [attr.aria-label]="intervalLabel(day.day, i, 'to')"
                            [formField]="form.days[d].intervals[i].to"
                          />
                          @if (day.intervals.length > 1) {
                            <button
                              appButton
                              variant="ghost"
                              size="sm"
                              type="button"
                              [attr.aria-label]="removeIntervalLabel(day.day, i)"
                              (click)="removeInterval(d, i)"
                            >
                              <svg lucideX aria-hidden="true"></svg>
                            </button>
                          }
                        </div>
                      }
                      @if (form.days[d]().invalid() && form.days[d]().touched()) {
                        <p class="error" i18n="@@venues.hours.invalid">
                          Upiši početak i kraj; ne smeju biti isti.
                        </p>
                      }
                      @if (day.intervals.length < maxIntervals) {
                        <button
                          appButton
                          variant="ghost"
                          size="sm"
                          type="button"
                          class="add-interval"
                          (click)="addInterval(d)"
                        >
                          <svg lucidePlus aria-hidden="true"></svg>
                          <ng-container i18n="@@venues.hours.addInterval"
                            >Još jedan termin</ng-container
                          >
                        </button>
                      }
                    </div>
                  } @else {
                    <span class="meta closed" i18n="@@venues.hours.closed">Zatvoreno</span>
                  }
                </li>
              }
            </ul>
          </section>

          <section class="card stack" data-gap="4" aria-labelledby="venue-wifi">
            <h2 id="venue-wifi" class="card__title" i18n="@@venues.section.wifi">Wi-Fi</h2>
            <label class="row" data-gap="2">
              <input
                type="checkbox"
                appSwitch
                id="venue-wifi-available"
                [formField]="form.wifi_available"
              />
              <span i18n="@@venues.wifi.available">Objekat ima Wi-Fi za goste</span>
            </label>
            @if (model().wifi_available) {
              <div class="row wifi-fields" data-gap="4">
                <app-field
                  i18n-label="@@venues.wifi.ssid"
                  label="Naziv mreže"
                  controlId="venue-wifi-ssid"
                  [field]="form.wifi_ssid"
                >
                  <input
                    appInput
                    id="venue-wifi-ssid"
                    autocomplete="off"
                    spellcheck="false"
                    [formField]="form.wifi_ssid"
                  />
                </app-field>
                <app-field
                  i18n-label="@@venues.wifi.password"
                  label="Lozinka"
                  controlId="venue-wifi-password"
                  i18n-hint="@@venues.wifi.passwordHint"
                  hint="Prazno ako je mreža otvorena."
                  [field]="form.wifi_password"
                >
                  <input
                    appInput
                    id="venue-wifi-password"
                    autocomplete="off"
                    spellcheck="false"
                    [formField]="form.wifi_password"
                  />
                </app-field>
              </div>
              <div class="stack" data-gap="2">
                <span class="label" i18n="@@venues.wifi.access">Kako gosti dobijaju lozinku</span>
                <app-segmented
                  [label]="wifiAccessLabel"
                  [options]="wifiAccessOptions"
                  [formField]="form.wifi_access"
                />
                <p class="meta">{{ wifiAccessHint() }}</p>
              </div>
            }
          </section>

          @if (error()) {
            <p class="alert" role="alert">{{ error() }}</p>
          }
          <div class="row">
            <button
              appButton
              type="submit"
              [disabled]="form().submitting()"
              [loading]="form().submitting()"
            >
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

    /* Full-width pages, but a form stays at a readable line length. */
    form {
      max-inline-size: 48rem;
    }

    .place {
      flex-wrap: wrap;
      align-items: start;
    }

    .place > * {
      flex: 1 1 12rem;
    }

    .section-head {
      display: flex;
      flex-wrap: wrap;
      align-items: start;
      justify-content: space-between;
      gap: var(--space-3);
    }

    .days {
      display: grid;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .day {
      display: grid;
      grid-template-columns: 11rem minmax(0, 1fr);
      align-items: start;
      gap: var(--space-3);
      padding-block: var(--space-3);
      border-block-start: var(--stroke-hairline) solid var(--color-border);
    }

    .day:first-child {
      border-block-start: 0;
      padding-block-start: 0;
    }

    .day__name {
      min-block-size: var(--touch-min);
      font: var(--type-label);
    }

    .closed {
      align-self: center;
    }

    .interval {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .interval input {
      inline-size: 8rem;
    }

    .interval__dash {
      color: var(--color-text-subtle);
    }

    .add-interval {
      align-self: flex-start;
    }

    .error {
      font: var(--type-body-sm);
      color: var(--color-danger);
    }

    .label {
      font: var(--type-label);
    }

    .wifi-fields {
      align-items: start;
    }

    @media (max-width: 560px) {
      .day {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export default class VenueFormPage {
  private readonly api = inject(VenuesApi);
  private readonly injector = inject(Injector);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly toaster = inject(Toaster);

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
    maxLength(path.city, 80);
    maxLength(path.postal_code, 16);
    maxLength(path.description, 300);
    validate(path.cuisine, ({ value }) => {
      const cuisines = parseCuisine(value());
      return cuisines.length > MAX_CUISINES ||
        cuisines.some((cuisine) => cuisine.length > MAX_CUISINE_LENGTH)
        ? {
            kind: 'cuisine',
            message: $localize`:@@venues.field.cuisineInvalid:Najviše 5 kuhinja, svaka do 40 znakova.`,
          }
        : undefined;
    });
    validate(path.coordinates, ({ value }) =>
      parseCoordinates(value()) === undefined
        ? {
            kind: 'coordinates',
            message: $localize`:@@venues.field.coordinatesInvalid:Upiši širinu i dužinu, npr. 44.8176, 20.4569.`,
          }
        : undefined,
    );
    applyEach(path.days, (day) => {
      applyWhen(
        day,
        ({ value }) => value().open,
        (open) => {
          applyEach(open.intervals, (interval) => {
            required(interval.from);
            required(interval.to);
            validate(interval.to, ({ value, valueOf }) =>
              value() && value() === valueOf(interval.from)
                ? { kind: 'same', message: '' }
                : undefined,
            );
          });
        },
      );
    });
    applyWhen(
      path,
      ({ value }) => value().wifi_available,
      (wifi) => {
        required(wifi.wifi_ssid, {
          message: $localize`:@@venues.wifi.ssidRequired:Upiši naziv mreže.`,
        });
        validate(wifi.wifi_ssid, ({ value }) =>
          new TextEncoder().encode(value().trim()).length > MAX_SSID_BYTES
            ? {
                kind: 'maxBytes',
                message: $localize`:@@venues.wifi.ssidTooLong:Naziv mreže može imati najviše 32 znaka.`,
              }
            : undefined,
        );
        maxLength(wifi.wifi_password, 63, {
          message: $localize`:@@venues.wifi.passwordTooLong:Lozinka može imati najviše 63 znaka.`,
        });
      },
    );
  });
  protected readonly maxIntervals = MAX_INTERVALS;
  protected readonly dayNames = weekdayNames(inject(LOCALE_ID));
  protected readonly wifiAccessLabel = $localize`:@@venues.wifi.access:Kako gosti dobijaju lozinku`;
  protected readonly wifiAccessOptions: AppSegmentedOption[] = [
    { value: 'menu', label: $localize`:@@venues.wifi.accessMenu:Piše u meniju` },
    { value: 'staff', label: $localize`:@@venues.wifi.accessStaff:Pitaju osoblje` },
  ];
  protected readonly wifiAccessHint = computed(() =>
    this.model().wifi_access === 'menu'
      ? $localize`:@@venues.wifi.accessMenuHint:Gosti vide naziv mreže i lozinku, uz dugme za kopiranje.`
      : $localize`:@@venues.wifi.accessStaffHint:Gosti vide naziv mreže i poruku da lozinku traže od osoblja.`,
  );
  protected readonly error = signal('');

  private readonly currencyNames = new Intl.DisplayNames([inject(LOCALE_ID)], { type: 'currency' });
  protected readonly currencies = computed<AppSelectOption[]>(() => {
    const current = this.model().currency;
    const codes = current && !CURRENCIES.includes(current) ? [current, ...CURRENCIES] : CURRENCIES;
    return codes.map((code) => ({ value: code, label: code, hint: this.currencyNames.of(code) }));
  });

  private readonly regionNames = new Intl.DisplayNames([inject(LOCALE_ID)], { type: 'region' });
  protected readonly countries = computed<AppSelectOption[]>(() => {
    const current = this.model().country;
    const codes = current && !COUNTRIES.includes(current) ? [current, ...COUNTRIES] : COUNTRIES;
    return codes.map((code) => ({ value: code, label: this.regionNames.of(code) ?? code }));
  });
  protected readonly venueTypes: AppSelectOption[] = VENUE_TYPES.map((value) => ({
    value,
    label: venueTypeLabel(value),
  }));

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
      const { days, coordinates, cuisine, venue_type, ...value } = field().value();
      const [latitude, longitude] = parseCoordinates(coordinates) ?? [null, null];
      const input: VenueInput = {
        ...value,
        slug: value.slug || undefined,
        venue_type: venue_type as VenueType,
        cuisine: parseCuisine(cuisine),
        latitude,
        longitude,
        wifi_access: value.wifi_access === 'menu' ? 'menu' : 'staff',
        opening_hours: toOpeningHours(days),
      };
      const id = this.venueId();
      try {
        const saved = await firstValueFrom(
          id ? this.api.update(id, input) : this.api.create({ ...input, name: value.name }),
        );
        // Lazily: the form itself doesn't need the list, only the pages after it.
        this.injector.get(VenuesStore).list.reload();
        await this.router.navigate(['/objekti', saved.id]);
        this.toaster.show(
          id
            ? $localize`:@@venues.toast.saved:Objekat je sačuvan.`
            : $localize`:@@venues.toast.created:Objekat je napravljen.`,
        );
      } catch (error) {
        this.error.set(errorMessage(toApiError(error).code));
      }
      return undefined;
    });
  }

  protected intervalLabel(day: Weekday, index: number, edge: 'from' | 'to'): string {
    const name = this.dayNames[day];
    const n = index + 1;
    return edge === 'from'
      ? $localize`:@@venues.hours.fromLabel:${name}:day:, termin ${n}:n:, od`
      : $localize`:@@venues.hours.toLabel:${name}:day:, termin ${n}:n:, do`;
  }

  protected removeIntervalLabel(day: Weekday, index: number): string {
    const name = this.dayNames[day];
    const n = index + 1;
    return $localize`:@@venues.hours.removeInterval:Ukloni termin ${n}:n: (${name}:day:)`;
  }

  protected addInterval(dayIndex: number): void {
    this.updateDay(dayIndex, (day) => {
      // Starts where the last one ends; the owner sets the close.
      const from = day.intervals.at(-1)?.to ?? '';
      return { ...day, intervals: [...day.intervals, { from, to: '' }] };
    });
  }

  protected removeInterval(dayIndex: number, index: number): void {
    this.updateDay(dayIndex, (day) => ({
      ...day,
      intervals: day.intervals.filter((_, i) => i !== index),
    }));
  }

  protected copyMondayToAll(): void {
    this.model.update((value) => {
      const monday = value.days[0];
      return {
        ...value,
        days: value.days.map((day) => ({
          ...day,
          open: monday.open,
          intervals: monday.intervals.map((interval) => ({ ...interval })),
        })),
      };
    });
  }

  private updateDay(index: number, change: (day: DayModel) => DayModel): void {
    this.model.update((value) => ({
      ...value,
      days: value.days.map((day, i) => (i === index ? change(day) : day)),
    }));
  }
}

function venueTypeLabel(type: VenueType): string {
  switch (type) {
    case 'restaurant':
      return $localize`:@@venues.type.restaurant:Restoran`;
    case 'cafe':
      return $localize`:@@venues.type.cafe:Kafić`;
    case 'bar':
      return $localize`:@@venues.type.bar:Bar ili pab`;
    case 'fast_food':
      return $localize`:@@venues.type.fastFood:Brza hrana`;
    case 'bakery':
      return $localize`:@@venues.type.bakery:Pekara`;
    case 'pastry_shop':
      return $localize`:@@venues.type.pastryShop:Poslastičarnica`;
    case 'other':
      return $localize`:@@venues.type.other:Drugo`;
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
