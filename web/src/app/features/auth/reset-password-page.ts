import { Component, inject, input, signal } from '@angular/core';
import { form, FormField, minLength, required, submit, validate } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { toApiError } from '../../core/api/api-error';
import { AuthApi } from '../../core/auth/auth-api';
import { AuthStore } from '../../core/auth/auth-store';
import { AppButton, AppField, AppInput } from '../../shared/ui';
import { AuthLayout } from './auth-layout';

/** `/reset-password?token=` (the emailed link): sets a new password, then sends the user to log in. */
@Component({
  selector: 'app-reset-password-page',
  imports: [FormField, RouterLink, AppButton, AppField, AppInput, AuthLayout],
  template: `
    <app-auth-layout i18n-heading="@@auth.reset.heading" heading="Nova lozinka">
      @if (!token() || invalid()) {
        <div class="stack" data-gap="3" role="alert">
          <p i18n="@@auth.reset.invalid">Link za novu lozinku nije važeći ili je istekao.</p>
          <a routerLink="/zaboravljena-lozinka" i18n="@@auth.reset.again">Pošalji novi link</a>
        </div>
      } @else {
        <form class="stack" novalidate (submit)="onSubmit($event)">
          <app-field
            i18n-label="@@auth.reset.password"
            label="Nova lozinka"
            controlId="reset-password"
            i18n-hint="@@auth.passwordHint"
            hint="Najmanje 8 znakova."
            [field]="form.password"
          >
            <input
              appInput
              id="reset-password"
              type="password"
              autocomplete="new-password"
              [formField]="form.password"
            />
          </app-field>
          <app-field
            i18n-label="@@auth.reset.confirm"
            label="Ponovite lozinku"
            controlId="reset-confirm"
            [field]="form.confirm"
          >
            <input
              appInput
              id="reset-confirm"
              type="password"
              autocomplete="new-password"
              [formField]="form.confirm"
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
            i18n="@@auth.reset.submit"
          >
            Sačuvaj lozinku
          </button>
        </form>
      }
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
  `,
})
export default class ResetPasswordPage {
  private readonly api = inject(AuthApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  readonly token = input<string>();

  protected readonly form = form(signal({ password: '', confirm: '' }), (path) => {
    required(path.password);
    minLength(path.password, 8, {
      message: $localize`:@@auth.passwordMin:Lozinka mora imati najmanje 8 znakova.`,
    });
    validate(path.confirm, ({ value, valueOf }) =>
      value() !== valueOf(path.password)
        ? { kind: 'mismatch', message: $localize`:@@auth.reset.mismatch:Lozinke se ne poklapaju.` }
        : undefined,
    );
  });
  protected readonly invalid = signal(false);
  protected readonly error = signal('');

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.error.set('');
    await submit(this.form, async (field) => {
      try {
        await firstValueFrom(this.api.resetPassword(this.token() ?? '', field.password().value()));
        // Every session was revoked by the reset; drop ours too.
        this.auth.forget();
        await this.router.navigate(['/prijava'], { queryParams: { lozinka: 'promenjena' } });
      } catch (error) {
        if (toApiError(error).code === 'invalid_token') this.invalid.set(true);
        else this.error.set($localize`:@@auth.unknownError:Nešto nije u redu. Pokušajte ponovo.`);
      }
      return undefined;
    });
  }
}
