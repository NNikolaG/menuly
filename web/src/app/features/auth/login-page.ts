import { Component, inject, input, signal } from '@angular/core';
import { email, form, FormField, required, submit } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { apiErrorCode } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth-store';
import { AppButton, AppField, AppInput } from '../../shared/ui';

@Component({
  selector: 'app-login-page',
  imports: [FormField, RouterLink, AppButton, AppField, AppInput],
  template: `
    <h1 i18n="@@auth.login.heading">Prijava</h1>
    <form novalidate (submit)="onSubmit($event)">
      <app-field
        i18n-label="@@auth.email"
        label="Email"
        controlId="login-email"
        [field]="form.email"
      >
        <input
          appInput
          id="login-email"
          type="email"
          autocomplete="email"
          [formField]="form.email"
        />
      </app-field>
      <app-field
        i18n-label="@@auth.password"
        label="Lozinka"
        controlId="login-password"
        [field]="form.password"
      >
        <input
          appInput
          id="login-password"
          type="password"
          autocomplete="current-password"
          [formField]="form.password"
        />
      </app-field>
      @if (error()) {
        <p role="alert">{{ error() }}</p>
      }
      <button appButton type="submit" [disabled]="form().submitting()" i18n="@@auth.login.submit">
        Prijavi se
      </button>
    </form>
    <p>
      <span i18n="@@auth.login.noAccount">Nemate nalog?</span>
      <a routerLink="/registracija" i18n="@@auth.login.toRegister">Registrujte se</a>
    </p>
  `,
})
export default class LoginPage {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  readonly returnUrl = input<string>();

  protected readonly form = form(signal({ email: '', password: '' }), (path) => {
    required(path.email);
    email(path.email);
    required(path.password);
  });
  protected readonly error = signal('');

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.error.set('');
    await submit(this.form, async (field) => {
      try {
        await this.auth.login(field().value());
        await this.router.navigateByUrl(this.returnUrl() ?? '/');
      } catch (error) {
        this.error.set(loginErrorMessage(apiErrorCode(error)));
      }
      return undefined;
    });
  }
}

function loginErrorMessage(code: string | null): string {
  switch (code) {
    case 'invalid_credentials':
      return $localize`:@@auth.login.invalidCredentials:Pogrešan email ili lozinka.`;
    case 'tenant_suspended':
      return $localize`:@@auth.tenantSuspended:Nalog je suspendovan.`;
    default:
      return $localize`:@@auth.unknownError:Nešto nije u redu. Pokušajte ponovo.`;
  }
}
