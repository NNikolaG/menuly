import { Component, inject, signal } from '@angular/core';
import { email, form, FormField, required, submit } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthApi } from '../../core/auth/auth-api';
import { AppButton, AppField, AppInput } from '../../shared/ui';
import { AuthLayout } from './auth-layout';

/** `/zaboravljena-lozinka`: asks for a reset link by email. */
@Component({
  selector: 'app-forgot-password-page',
  imports: [FormField, RouterLink, AppButton, AppField, AppInput, AuthLayout],
  template: `
    <app-auth-layout i18n-heading="@@auth.forgot.heading" heading="Zaboravljena lozinka">
      @if (sent()) {
        <div class="stack" data-gap="3" role="status">
          <p i18n="@@auth.forgot.sent">
            Ako postoji nalog za {{ form.email().value() }}, poslali smo link za novu lozinku. Link
            važi sat vremena.
          </p>
          <p class="meta" i18n="@@auth.forgot.spam">
            Ne vidite email? Proverite i neželjenu poštu.
          </p>
        </div>
      } @else {
        <form class="stack" novalidate (submit)="onSubmit($event)">
          <p class="meta" i18n="@@auth.forgot.intro">
            Unesite email naloga i poslaćemo vam link za novu lozinku.
          </p>
          <app-field
            i18n-label="@@auth.email"
            label="Email"
            controlId="forgot-email"
            [field]="form.email"
          >
            <input
              appInput
              id="forgot-email"
              type="email"
              autocomplete="email"
              [formField]="form.email"
            />
          </app-field>
          @if (error()) {
            <p class="alert" role="alert">{{ error() }}</p>
          }
          <button
            appButton
            size="lg"
            type="submit"
            [disabled]="form().submitting()"
            [loading]="form().submitting()"
            i18n="@@auth.forgot.submit"
          >
            Pošalji link
          </button>
        </form>
      }
      <p class="switch-link">
        <a routerLink="/prijava" i18n="@@auth.backToLogin">Nazad na prijavu</a>
      </p>
    </app-auth-layout>
  `,
  styles: `
    .switch-link {
      color: var(--color-text-muted);
    }
  `,
})
export default class ForgotPasswordPage {
  private readonly api = inject(AuthApi);

  protected readonly form = form(signal({ email: '' }), (path) => {
    required(path.email);
    email(path.email);
  });
  protected readonly sent = signal(false);
  protected readonly error = signal('');

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.error.set('');
    await submit(this.form, async (field) => {
      try {
        await firstValueFrom(this.api.forgotPassword(field.email().value().trim()));
        this.sent.set(true);
      } catch {
        this.error.set($localize`:@@auth.unknownError:Nešto nije u redu. Pokušajte ponovo.`);
      }
      return undefined;
    });
  }
}
