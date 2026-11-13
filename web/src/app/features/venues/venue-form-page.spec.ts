import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { venueFixture } from '../../core/venues/venue.testing';
import VenueFormPage from './venue-form-page';

describe('VenueFormPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  const tick = () => new Promise((resolve) => setTimeout(resolve));

  function fill(root: HTMLElement, selector: string, value: string): void {
    const input = root.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function submit(root: HTMLElement): void {
    root.querySelector('form')!.dispatchEvent(new Event('submit'));
  }

  it('creates a venue and leaves the slug to the API when empty', async () => {
    const fixture = TestBed.createComponent(VenueFormPage);
    await fixture.whenStable();
    fill(fixture.nativeElement, '#venue-name', 'Kafana Zora');
    submit(fixture.nativeElement);
    await tick();

    const request = http.expectOne('/api/v1/venues');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      name: 'Kafana Zora',
      slug: undefined,
      address: '',
      city: '',
      postal_code: '',
      country: 'RS',
      phone: '',
      currency: 'RSD',
      description: '',
      venue_type: 'other',
      cuisine: [],
      latitude: null,
      longitude: null,
      opening_hours: {},
      wifi_available: false,
      wifi_ssid: '',
      wifi_password: '',
      wifi_access: 'staff',
    });
    request.flush(venueFixture());
    await tick();
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/objekti', 'v1']);
  });

  it('sends cuisine as a list and coordinates as two numbers, and clears them when emptied', async () => {
    const fixture = TestBed.createComponent(VenueFormPage);
    fixture.componentRef.setInput('venueId', 'v1');
    fixture.detectChanges();
    http
      .expectOne('/api/v1/venues/v1')
      .flush(venueFixture({ latitude: 44.8176, longitude: 20.4569, cuisine: ['Roštilj'] }));
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector<HTMLInputElement>('#venue-coordinates')!.value).toBe(
      '44.8176, 20.4569',
    );

    fill(root, '#venue-coordinates', 'kod mosta');
    submit(root);
    await tick();
    http.expectNone('/api/v1/venues/v1');

    fill(root, '#venue-coordinates', '');
    fill(root, '#venue-cuisine', 'Srpska kuhinja,  Roštilj, ');
    fill(root, '#venue-city', 'Beograd');
    submit(root);
    await tick();
    const request = http.expectOne('/api/v1/venues/v1');
    expect(request.request.body).toMatchObject({
      city: 'Beograd',
      cuisine: ['Srpska kuhinja', 'Roštilj'],
      latitude: null,
      longitude: null,
    });
    request.flush(venueFixture());
  });

  it('does not submit an invalid slug', async () => {
    const fixture = TestBed.createComponent(VenueFormPage);
    await fixture.whenStable();
    fill(fixture.nativeElement, '#venue-name', 'Zora');
    fill(fixture.nativeElement, '#venue-slug', 'Centar 1');
    submit(fixture.nativeElement);
    await fixture.whenStable();
    http.expectNone('/api/v1/venues');
    expect(fixture.nativeElement.textContent).toContain('Samo mala slova, brojevi i crtice');
  });

  it('loads the venue, saves changes and shows a taken slug', async () => {
    const fixture = TestBed.createComponent(VenueFormPage);
    fixture.componentRef.setInput('venueId', 'v1');
    fixture.detectChanges();
    http.expectOne('/api/v1/venues/v1').flush(venueFixture());
    await fixture.whenStable();
    const name = fixture.nativeElement.querySelector('#venue-name') as HTMLInputElement;
    expect(name.value).toBe('Kafana Zora');

    fill(fixture.nativeElement, '#venue-slug', 'novi-sad');
    submit(fixture.nativeElement);
    await tick();
    const request = http.expectOne('/api/v1/venues/v1');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body.slug).toBe('novi-sad');
    request.flush(
      { error: { code: 'slug_taken', message: '' } },
      { status: 409, statusText: 'Conflict' },
    );
    await tick();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Ovaj slug već koristi drugi objekat.',
    );
  });

  it('edits opening hours and Wi-Fi', async () => {
    const fixture = TestBed.createComponent(VenueFormPage);
    fixture.componentRef.setInput('venueId', 'v1');
    fixture.detectChanges();
    http
      .expectOne('/api/v1/venues/v1')
      .flush(venueFixture({ opening_hours: { mon: [['08:00', '23:00']] } }));
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;

    // Monday is open; copy it to every day, then close Sunday.
    const copy = [...root.querySelectorAll('button')].find((b) =>
      b.textContent!.includes('Kao ponedeljak'),
    )!;
    copy.click();
    await fixture.whenStable();
    const switches = root.querySelectorAll<HTMLInputElement>('.day input[type="checkbox"]');
    expect(switches).toHaveLength(7);
    switches[6].click();
    await fixture.whenStable();

    // Wi-Fi on without a name does not submit.
    root.querySelector<HTMLInputElement>('#venue-wifi-available')!.click();
    await fixture.whenStable();
    submit(root);
    await fixture.whenStable();
    http.expectNone('/api/v1/venues/v1');
    expect(root.textContent).toContain('Upiši naziv mreže.');

    fill(root, '#venue-wifi-ssid', 'Zora-Gost');
    fill(root, '#venue-wifi-password', 'kafa123');
    submit(root);
    await tick();
    const request = http.expectOne('/api/v1/venues/v1');
    const week = Object.fromEntries(
      ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((day) => [day, [['08:00', '23:00']]]),
    );
    expect(request.request.body).toEqual(
      expect.objectContaining({
        opening_hours: week,
        wifi_available: true,
        wifi_ssid: 'Zora-Gost',
        wifi_password: 'kafa123',
        wifi_access: 'staff',
      }),
    );
    request.flush(venueFixture());
  });
});
