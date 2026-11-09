import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Role } from '../../core/api/api-types';
import { signInAs } from '../../core/auth/auth.testing';
import { venueFixture } from '../../core/venues/venue.testing';
import TeamPage from './team-page';

describe('TeamPage', () => {
  let http: HttpTestingController;
  const tick = () => new Promise((resolve) => setTimeout(resolve));

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  const venues = [venueFixture(), venueFixture({ id: 'v2', name: 'Bašta' })];

  async function render(role: Role, scope: string[] = [], shown = venues) {
    await signInAs(http, role, {}, scope);
    const fixture = TestBed.createComponent(TeamPage);
    fixture.detectChanges();
    await tick();
    http.expectOne('/api/v1/venues').flush({ items: shown });
    http.expectOne('/api/v1/members').flush({
      items: [
        {
          user_id: 'u1',
          name: 'Ana',
          email: 'a@b.rs',
          role: 'owner',
          venue_ids: [],
          created_at: '2026-10-01T10:00:00Z',
        },
        {
          user_id: 'u2',
          name: 'Marko',
          email: 'm@b.rs',
          role: 'staff',
          venue_ids: ['v2'],
          created_at: '2026-10-02T10:00:00Z',
        },
      ],
    });
    http.expectOne('/api/v1/invitations').flush({ items: [] });
    await fixture.whenStable();
    return fixture;
  }

  it('lets the owner invite a manager and lists the pending invitation', async () => {
    const fixture = await render('owner');
    const root: HTMLElement = fixture.nativeElement;
    expect(root.textContent).toContain('Vlasnik');
    // The owner can change Marko's role and remove him, not their own.
    expect(root.querySelectorAll('tbody app-select')).toHaveLength(1);

    const input = root.querySelector('#invite-email') as HTMLInputElement;
    input.value = 'nova@b.rs';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    await tick();
    await tick();
    const request = http.expectOne('/api/v1/invitations');
    expect(request.request.body).toEqual({ email: 'nova@b.rs', role: 'staff', venue_ids: [] });
    request.flush({
      id: 'i1',
      email: 'nova@b.rs',
      role: 'staff',
      venue_ids: [],
      expires_at: '2026-11-13T10:00:00Z',
      created_at: '',
    });
    await tick();
    fixture.detectChanges();
    await tick();
    http.expectOne('/api/v1/invitations').flush({
      items: [
        {
          id: 'i1',
          email: 'nova@b.rs',
          role: 'staff',
          venue_ids: [],
          expires_at: '2026-11-13T10:00:00Z',
          created_at: '',
        },
      ],
    });
    await fixture.whenStable();
    expect(root.textContent).toContain('Poziv je poslat na nova@b.rs');
    expect(root.textContent).toContain('Povuci');
  });

  it('shows roles read-only to a manager, who may invite staff only', async () => {
    const fixture = await render('manager');
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelectorAll('tbody app-select')).toHaveLength(0);
    expect(root.querySelector('button[aria-label^="Ukloni"]')).toBeNull();
    const roles = fixture.componentInstance as unknown as { roleOptions(): { value: string }[] };
    expect(roles.roleOptions().map((option) => option.value)).toEqual(['staff']);
    // Venues are shown, not editable.
    expect(root.querySelector('tbody button.venues')).toBeNull();
    expect(root.textContent).toContain('Bašta');
  });

  it('shows the venues of each member and lets the owner change them', async () => {
    const fixture = await render('owner');
    const root: HTMLElement = fixture.nativeElement;
    const rows = root.querySelectorAll('tbody tr');
    expect(rows[0].textContent).toContain('Svi objekti');
    const button = rows[1].querySelector('button.venues') as HTMLButtonElement;
    expect(button.textContent).toContain('Bašta');

    button.click();
    await tick();
    fixture.detectChanges();
    // The dialog starts on Marko's one venue; switching to "all" sends [].
    const toggle = document.querySelector(
      'app-venue-access-dialog input[type=checkbox]',
    ) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await tick();
    const save = [...document.querySelectorAll('app-venue-access-dialog button')].find((b) =>
      b.textContent?.includes('Sačuvaj'),
    ) as HTMLButtonElement;
    save.click();
    await tick();
    await tick();
    const request = http.expectOne('/api/v1/members/u2');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ venue_ids: [] });
    request.flush(null);
    await tick();
    TestBed.tick();
    http.expectOne('/api/v1/members').flush({ items: [] });
  });

  it('makes a limited manager invite to their own venues', async () => {
    const fixture = await render('manager', ['v1', 'v2']);
    const root: HTMLElement = fixture.nativeElement;
    // No "all venues" switch: they pick from their venues.
    expect(root.querySelector('fieldset input[type=checkbox]')).toBeNull();
    expect(root.querySelector('fieldset app-chip-group')).not.toBeNull();

    const input = root.querySelector('#invite-email') as HTMLInputElement;
    input.value = 'nova@b.rs';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    await tick();
    fixture.detectChanges();
    http.expectNone('/api/v1/invitations');
    expect(root.textContent).toContain('Izaberi bar jedan objekat.');

    const page = fixture.componentInstance as unknown as {
      invitePicked: { set(v: string[]): void };
    };
    page.invitePicked.set(['v2']);
    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    await tick();
    await tick();
    const request = http.expectOne('/api/v1/invitations');
    expect(request.request.body).toEqual({ email: 'nova@b.rs', role: 'staff', venue_ids: ['v2'] });
  });

  it('sends the only venue of a manager limited to one', async () => {
    const fixture = await render('manager', ['v1'], [venues[0]]);
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('fieldset')).toBeNull();
    const input = root.querySelector('#invite-email') as HTMLInputElement;
    input.value = 'nova@b.rs';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    await tick();
    await tick();
    const request = http.expectOne('/api/v1/invitations');
    expect(request.request.body).toEqual({ email: 'nova@b.rs', role: 'staff', venue_ids: ['v1'] });
  });
});
