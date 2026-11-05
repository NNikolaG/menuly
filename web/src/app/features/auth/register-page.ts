import { Component, inject, signal } from '@angular/core';
import {
  email,
  form,
  FormField,
  minLength,
  pattern,
  required,
  submit,
} from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { toApiError } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth-store';
import { AppButton, AppField, AppInput } from '../../shared/ui';
import { AuthLayout } from './auth-layout';

@Component({
  selector: 'app-register-page',
  imports: [FormField, RouterLink, AppButton, AppField, AppInput, AuthLayout],
  template: `
    <app-auth-layout i18n-heading="@@auth.register.heading" heading="Registracija">
      <form class="stack" novalidate (submit)="onSubmit($event)">
        <app-field
          i18n-label="@@auth.name"
          label="Ime i prezime"
          controlId="register-name"
          [field]="form.name"
        >
          <input appInput id="register-name" autocomplete="name" [formField]="form.name" />
        </app-field>
        <app-field
          i18n-label="@@auth.email"
          label="Email"
          controlId="register-email"
          [field]="form.email"
        >
          <input
            appInput
            id="register-email"
            type="email"
            autocomplete="email"
            [formField]="form.email"
          />
        </app-field>
        <app-field
          i18n-label="@@auth.password"
          label="Lozinka"
          controlId="register-password"
          [field]="form.password"
        >
          <input
            appInput
            id="register-password"
            type="password"
            autocomplete="new-password"
            [formField]="form.password"
          />
        </app-field>
        <app-field
          i18n-label="@@auth.register.businessName"
          label="Naziv biznisa"
          controlId="register-business"
          [field]="form.business_name"
        >
          <input
            appInput
            id="register-business"
            autocomplete="organization"
            [formField]="form.business_name"
          />
        </app-field>
        <app-field
          i18n-label="@@auth.register.tenantSlug"
          label="Poddomen (opciono)"
          controlId="register-slug"
          [field]="form.tenant_slug"
        >
          <input appInput id="register-slug" [formField]="form.tenant_slug" />
        </app-field>
        @if (error()) {
          <p class="alert" role="alert">{{ error() }}</p>
        }
        <button
          appButton
          size="lg"
          type="submit"
          [disabled]="form().submitting()"
          i18n="@@auth.register.submit"
        >
          Napravi nalog
        </button>
      </form>
      <p class="switch-link">
        <span i18n="@@auth.register.haveAccount">Već imate nalog?</span>
        <a routerLink="/prijava" i18n="@@auth.register.toLogin">Prijavite se</a>
      </p>
    </app-auth-layout>
  `,
  styles: `
    .alert {
      padding: var(--space-3);
      border-radius: var(--radius-sm);
      background: var(--color-danger-subtle);
      color: var(--color-danger);
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
export default class RegisterPage {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly form = form(
    signal({ name: '', email: '', password: '', business_name: '', tenant_slug: '' }),
    (path) => {
      required(path.name);
      required(path.email);
      email(path.email);
      required(path.password);
      minLength(path.password, 8);
      required(path.business_name);
      pattern(path.tenant_slug, /^([a-z0-9]+(-[a-z0-9]+)*)?$/, {
        message: $localize`:@@auth.register.tenantSlugPattern:Samo mala slova, brojevi i crtice.`,
      });
    },
  );
  protected readonly error = signal('');

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.error.set('');
    await submit(this.form, async (field) => {
      const { tenant_slug, ...rest } = field().value();
      try {
        await this.auth.register({
          ...rest,
          ...(tenant_slug ? { tenant_slug } : {}),
          locale: $localize.locale,
        });
        await this.router.navigateByUrl('/');
      } catch (error) {
        this.error.set(registerErrorMessage(toApiError(error).code));
      }
      return undefined;
    });
  }
}

function registerErrorMessage(code: string): string {
  switch (code) {
    case 'email_taken':
      return $localize`:@@auth.register.emailTaken:Nalog sa ovim emailom već postoji.`;
    case 'tenant_slug_taken':
      return $localize`:@@auth.register.tenantSlugTaken:Ovaj poddomen je zauzet.`;
    default:
      return $localize`:@@auth.unknownError:Nešto nije u redu. Pokušajte ponovo.`;
  }
}
