import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { tokenPair } from '../../core/auth/auth.testing';
import { AuthStore } from '../../core/auth/auth-store';
import InvitePage from './invite-page';

describe('InvitePage', () => {
  let http: HttpTestingController;
  const tick = () => new Promise((resolve) => setTimeout(resolve));

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });

  afterEach(() => {
    http.match('/api/v1/me').forEach((req) => req.flush({}));
    http.verify();
    localStorage.clear();
  });

  async function render(hasAccount: boolean) {
    const fixture = TestBed.createComponent(InvitePage);
    fixture.componentRef.setInput('token', 'tok1');
    fixture.detectChanges();
    await tick();
    http.expectOne('/api/v1/public/invitations/tok1').flush({
      email: 'novi@b.rs',
      role: 'staff',
      tenant_name: 'Kafana Zora',
      expires_at: '2026-11-13T10:00:00Z',
      status: 'pending',
      has_account: hasAccount,
    });
    await fixture.whenStable();
    return fixture;
  }

  it('creates the account, joins the business and opens the app', async () => {
    const fixture = await render(false);
    const root: HTMLElement = fixture.nativeElement;
    expect(root.textContent).toContain('Kafana Zora vas poziva kao osoblje');
    for (const [id, value] of [
      ['#invite-name', 'Novi Konobar'],
      ['#invite-password', 'tajna1234'],
    ]) {
      const input = root.querySelector(id) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    await tick();
    const request = http.expectOne('/api/v1/auth/accept-invite');
    expect(request.request.body).toEqual({
      token: 'tok1',
      name: 'Novi Konobar',
      password: 'tajna1234',
    });
    request.flush({ ...tokenPair({ role: 'staff' }), user: {} });
    await tick();
    expect(TestBed.inject(AuthStore).role()).toBe('staff');
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('asks an existing account to sign in first and comes back to the link', async () => {
    const fixture = await render(true);
    const link = fixture.nativeElement.querySelector('a[href^="/prijava"]') as HTMLAnchorElement;
    expect(decodeURIComponent(link.getAttribute('href')!)).toBe(
      '/prijava?returnUrl=/invite?token=tok1',
    );
  });
});
