import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { tokenPair } from '../../core/auth/auth.testing';
import LoginPage from './login-page';

describe('LoginPage', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  afterEach(() => localStorage.clear());

  function fill(root: HTMLElement, selector: string, value: string): void {
    const input = root.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  const tick = () => new Promise((resolve) => setTimeout(resolve));

  it('does not call the API while the form is invalid', async () => {
    const fixture = TestBed.createComponent(LoginPage);
    await fixture.whenStable();
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    TestBed.inject(HttpTestingController).expectNone('/api/v1/auth/login');
    expect(fixture.nativeElement.textContent).toContain('Obavezno polje.');
  });

  it('signs in and returns to the requested page', async () => {
    const fixture = TestBed.createComponent(LoginPage);
    fixture.componentRef.setInput('returnUrl', '/pregled');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await fixture.whenStable();
    fill(fixture.nativeElement, '#login-email', 'vlasnik@zora.rs');
    fill(fixture.nativeElement, '#login-password', 'secret123');
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    await tick();

    const request = TestBed.inject(HttpTestingController).expectOne('/api/v1/auth/login');
    expect(request.request.body).toEqual({ email: 'vlasnik@zora.rs', password: 'secret123' });
    request.flush(tokenPair());
    await tick();
    expect(navigate).toHaveBeenCalledWith('/pregled');
  });

  it('shows the API error for wrong credentials', async () => {
    const fixture = TestBed.createComponent(LoginPage);
    await fixture.whenStable();
    fill(fixture.nativeElement, '#login-email', 'vlasnik@zora.rs');
    fill(fixture.nativeElement, '#login-password', 'pogresna');
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    await tick();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/v1/auth/login')
      .flush(
        { error: { code: 'invalid_credentials', message: '' } },
        { status: 401, statusText: 'Unauthorized' },
      );
    await tick();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Pogrešan email ili lozinka.',
    );
  });
});
