import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import ResetPasswordPage from './reset-password-page';

describe('ResetPasswordPage', () => {
  let http: HttpTestingController;
  const tick = () => new Promise((resolve) => setTimeout(resolve));

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => http.verify());

  function fill(root: HTMLElement, password: string, confirm: string): void {
    for (const [id, value] of [
      ['#reset-password', password],
      ['#reset-confirm', confirm],
    ]) {
      const input = root.querySelector(id) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    root.querySelector('form')!.dispatchEvent(new Event('submit'));
  }

  it('sets the new password and sends the user to log in', async () => {
    const fixture = TestBed.createComponent(ResetPasswordPage);
    fixture.componentRef.setInput('token', 'abc');
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;

    fill(root, 'novaLozinka1', 'drugacija1');
    await tick();
    http.expectNone('/api/v1/auth/reset-password');

    fill(root, 'novaLozinka1', 'novaLozinka1');
    await tick();
    const request = http.expectOne('/api/v1/auth/reset-password');
    expect(request.request.body).toEqual({ token: 'abc', password: 'novaLozinka1' });
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush(null, { status: 204, statusText: 'No Content' });
    await tick();
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/prijava'], {
      queryParams: { lozinka: 'promenjena' },
    });
  });

  it('explains an expired link', async () => {
    const fixture = TestBed.createComponent(ResetPasswordPage);
    fixture.componentRef.setInput('token', 'old');
    fixture.detectChanges();
    fill(fixture.nativeElement, 'novaLozinka1', 'novaLozinka1');
    await tick();
    http
      .expectOne('/api/v1/auth/reset-password')
      .flush(
        { error: { code: 'invalid_token', message: '' } },
        { status: 400, statusText: 'Bad Request' },
      );
    await tick();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('nije važeći ili je istekao');
  });
});
