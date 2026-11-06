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
      phone: '',
      currency: 'RSD',
    });
    request.flush(venueFixture());
    await tick();
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/objekti', 'v1']);
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
});
