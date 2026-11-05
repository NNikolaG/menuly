import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { Role } from '../api/api-types';
import { AuthStore } from './auth-store';
import { tokenPair } from './auth.testing';
import { authGuard, guestGuard, roleGuard } from './auth.guards';

@Component({ template: 'page' })
class Page {}

describe('auth guards', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'prijava', component: Page, canActivate: [guestGuard] },
          { path: 'tim', component: Page, canActivate: [roleGuard('owner')] },
          { path: '', canMatch: [authGuard], children: [{ path: '**', component: Page }] },
        ]),
      ],
    });
  });

  afterEach(() => localStorage.clear());

  async function signIn(role: Role): Promise<void> {
    const done = TestBed.inject(AuthStore).login({ email: 'a@b.rs', password: 'secret123' });
    TestBed.inject(HttpTestingController)
      .expectOne('/api/v1/auth/login')
      .flush(tokenPair({ role }));
    await done;
  }

  it('sends signed-out users to login with the page they asked for', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/pregled/nesto');
    expect(TestBed.inject(Router).url).toBe('/prijava?returnUrl=%2Fpregled%2Fnesto');
  });

  it('lets signed-in users in and keeps them off login', async () => {
    await signIn('staff');
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/pregled');
    expect(TestBed.inject(Router).url).toBe('/pregled');
    await harness.navigateByUrl('/prijava');
    expect(TestBed.inject(Router).url).toBe('/');
  });

  it('allows only the listed roles', async () => {
    await signIn('staff');
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/tim');
    expect(TestBed.inject(Router).url).toBe('/');
  });

  it('allows a listed role', async () => {
    await signIn('owner');
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/tim');
    expect(TestBed.inject(Router).url).toBe('/tim');
  });
});
