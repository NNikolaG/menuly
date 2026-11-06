import { Component, inject, input, signal } from '@angular/core';
import { email, form, FormField, required, submit } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { toApiError } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth-store';
import { AppButton, AppField, AppInput } from '../../shared/ui';
import { AuthLayout } from './auth-layout';

@Component({
  selector: 'app-login-page',
  imports: [FormField, RouterLink, AppButton, AppField, AppInput, AuthLayout],
  template: `
    <app-auth-layout i18n-heading="@@auth.login.heading" heading="Prijava">
      <form class="stack" novalidate (submit)="onSubmit($event)">
        @if (lozinka() === 'promenjena') {
          <p class="alert" data-tone="success" role="status" i18n="@@auth.reset.done">
            Lozinka je promenjena. Prijavite se novom lozinkom.
          </p>
        }
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
        <a class="forgot" routerLink="/zaboravljena-lozinka" i18n="@@auth.login.forgot"
          >Zaboravili ste lozinku?</a
        >
        @if (error()) {
          <p class="alert" role="alert">{{ error() }}</p>
        }
        <button
          appButton
          size="lg"
          type="submit"
          [disabled]="form().submitting()"
          [loading]="form().submitting()"
          i18n="@@auth.login.submit"
        >
          Prijavi se
        </button>
      </form>
      <p class="switch-link">
        <span i18n="@@auth.login.noAccount">Nemate nalog?</span>
        <a routerLink="/registracija" i18n="@@auth.login.toRegister">Registrujte se</a>
      </p>
    </app-auth-layout>
  `,
  styles: `
    .forgot {
      align-self: flex-start;
      font: var(--type-body-sm);
    }

    .switch-link {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1);
      color: var(--color-text-muted);
    }
  `,
})
export default class LoginPage {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  readonly returnUrl = input<string>();
  /** `promenjena` after a password reset. */
  readonly lozinka = input<string>();

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
        this.error.set(loginErrorMessage(toApiError(error).code));
      }
      return undefined;
    });
  }
}

function loginErrorMessage(code: string): string {
  switch (code) {
    case 'invalid_credentials':
      return $localize`:@@auth.login.invalidCredentials:Pogrešan email ili lozinka.`;
    case 'tenant_suspended':
      return $localize`:@@auth.tenantSuspended:Nalog je suspendovan.`;
    default:
      return $localize`:@@auth.unknownError:Nešto nije u redu. Pokušajte ponovo.`;
  }
}
