import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Role } from '../../core/api/api-types';
import { signInAs } from '../../core/auth/auth.testing';
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

  async function render(role: Role) {
    await signInAs(http, role);
    const fixture = TestBed.createComponent(TeamPage);
    fixture.detectChanges();
    await tick();
    http.expectOne('/api/v1/members').flush({
      items: [
        {
          user_id: 'u1',
          name: 'Ana',
          email: 'a@b.rs',
          role: 'owner',
          created_at: '2026-10-01T10:00:00Z',
        },
        {
          user_id: 'u2',
          name: 'Marko',
          email: 'm@b.rs',
          role: 'staff',
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
    expect(request.request.body).toEqual({ email: 'nova@b.rs', role: 'staff' });
    request.flush({
      id: 'i1',
      email: 'nova@b.rs',
      role: 'staff',
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
  });
});
