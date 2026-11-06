import { Component, computed, inject, input, signal } from '@angular/core';
import { form, FormField, minLength, required, submit } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { toApiError } from '../../core/api/api-error';
import { AuthApi } from '../../core/auth/auth-api';
import { AuthStore } from '../../core/auth/auth-store';
import { AppButton, AppField, AppInput } from '../../shared/ui';
import { AuthLayout } from './auth-layout';
import { ROLE_LABEL } from '../../core/auth/role-labels';

/**
 * `/invite?token=` (the emailed link). Existing account: sign in as the invited email, then accept. New person:
 * pick a name and password. Either way the session switches to the inviting business.
 */
@Component({
  selector: 'app-invite-page',
  imports: [FormField, RouterLink, AppButton, AppField, AppInput, AuthLayout],
  template: `
    <app-auth-layout i18n-heading="@@invite.heading" heading="Poziv u tim">
      @if (info(); as inv) {
        <p class="lead" i18n="@@invite.lead">
          <strong>{{ inv.tenant_name }}</strong> vas poziva kao
          <strong>{{ roleLabel(inv.role) }}</strong
          >.
        </p>

        @if (inv.status !== 'pending') {
          <p class="alert" role="alert">{{ statusText(inv.status) }}</p>
        } @else if (inv.has_account || loginRequired()) {
          @if (signedInAs(); as current) {
            @if (current === inv.email) {
              <button
                appButton
                size="lg"
                type="button"
                [disabled]="busy()"
                (click)="acceptSignedIn()"
                i18n="@@invite.accept"
              >
                Prihvati poziv
              </button>
            } @else {
              <p class="alert" role="alert" i18n="@@invite.otherAccount">
                Prijavljeni ste kao {{ current }}, a poziv je za {{ inv.email }}.
              </p>
              <button
                appButton
                variant="secondary"
                type="button"
                (click)="signOut()"
                i18n="@@invite.signOut"
              >
                Odjavi se
              </button>
            }
          } @else {
            <p i18n="@@invite.signInFirst">
              Prijavite se kao {{ inv.email }} da biste prihvatili poziv.
            </p>
            <a
              appButton
              size="lg"
              routerLink="/prijava"
              [queryParams]="{ returnUrl: returnUrl() }"
              i18n="@@invite.toLogin"
            >
              Prijavi se
            </a>
          }
        } @else if (signedInAs()) {
          <p i18n="@@invite.newAccountSignedIn">
            Poziv je za novi nalog ({{ inv.email }}). Odjavite se da biste ga napravili.
          </p>
          <button
            appButton
            variant="secondary"
            type="button"
            (click)="signOut()"
            i18n="@@invite.signOut"
          >
            Odjavi se
          </button>
        } @else {
          <form class="stack" novalidate (submit)="register($event)">
            <p class="for"><span class="meta" i18n="@@auth.email">Email</span> {{ inv.email }}</p>
            <app-field
              i18n-label="@@auth.name"
              label="Ime i prezime"
              controlId="invite-name"
              [field]="form.name"
            >
              <input appInput id="invite-name" autocomplete="name" [formField]="form.name" />
            </app-field>
            <app-field
              i18n-label="@@auth.password"
              label="Lozinka"
              controlId="invite-password"
              i18n-hint="@@auth.passwordHint"
              hint="Najmanje 8 znakova."
              [field]="form.password"
            >
              <input
                appInput
                id="invite-password"
                type="password"
                autocomplete="new-password"
                [formField]="form.password"
              />
            </app-field>
            <button
              appButton
              size="lg"
              type="submit"
              [disabled]="form().submitting()"
              i18n="@@invite.join"
            >
              Napravi nalog i pridruži se
            </button>
          </form>
        }
        @if (error()) {
          <p class="alert" role="alert">{{ error() }}</p>
        }
      } @else if (!token() || invitation.error()) {
        <p class="alert" role="alert" i18n="@@invite.invalid">Link poziva nije važeći.</p>
      } @else {
        <p class="meta" i18n="@@common.loading">Učitavanje…</p>
      }
    </app-auth-layout>
  `,
  styles: `
    .lead {
      font: var(--type-body);
    }

    .alert {
      padding: var(--space-3);
      border-radius: var(--radius-sm);
      background: var(--color-danger-subtle);
      color: var(--color-danger);
      font: var(--type-body-sm);
    }
  `,
})
export default class InvitePage {
  private readonly api = inject(AuthApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  readonly token = input<string>();

  protected readonly invitation = this.api.invitationResource(this.token);
  protected readonly info = computed(() =>
    this.invitation.hasValue() ? this.invitation.value() : undefined,
  );
  protected readonly signedInAs = computed(() =>
    this.auth.isAuthenticated() ? (this.auth.me.value()?.user.email ?? null) : null,
  );
  protected readonly returnUrl = computed(
    () => `/invite?token=${encodeURIComponent(this.token() ?? '')}`,
  );
  /** The server said the email already has an account (409 `login_required`). */
  protected readonly loginRequired = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly form = form(signal({ name: '', password: '' }), (path) => {
    required(path.name);
    required(path.password);
    minLength(path.password, 8, {
      message: $localize`:@@auth.passwordMin:Lozinka mora imati najmanje 8 znakova.`,
    });
  });

  protected roleLabel(role: 'manager' | 'staff'): string {
    return ROLE_LABEL[role].toLocaleLowerCase();
  }

  protected statusText(status: string): string {
    switch (status) {
      case 'accepted':
        return $localize`:@@invite.used:Ovaj poziv je već prihvaćen.`;
      case 'revoked':
        return $localize`:@@invite.revoked:Ovaj poziv je povučen. Zatražite novi.`;
      default:
        return $localize`:@@invite.expired:Ovaj poziv je istekao. Zatražite novi.`;
    }
  }

  protected async acceptSignedIn(): Promise<void> {
    this.busy.set(true);
    await this.accept({ token: this.token() ?? '' });
    this.busy.set(false);
  }

  protected async register(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.form, async (field) => {
      const { name, password } = field().value();
      await this.accept({ token: this.token() ?? '', name: name.trim(), password });
      return undefined;
    });
  }

  protected signOut(): void {
    this.auth.forget();
  }

  private async accept(request: {
    token: string;
    name?: string;
    password?: string;
  }): Promise<void> {
    this.error.set('');
    try {
      await this.auth.acceptInvite(request);
      await this.router.navigateByUrl('/');
    } catch (error) {
      const code = toApiError(error).code;
      if (code === 'login_required') this.loginRequired.set(true);
      else this.error.set(acceptError(code));
    }
  }
}

function acceptError(code: string): string {
  switch (code) {
    case 'invalid_token':
      return $localize`:@@invite.invalid:Link poziva nije važeći.`;
    case 'already_member':
      return $localize`:@@invite.alreadyMember:Već ste član ovog tima.`;
    case 'invite_email_mismatch':
      return $localize`:@@invite.mismatch:Poziv je za drugu email adresu.`;
    default:
      return $localize`:@@auth.unknownError:Nešto nije u redu. Pokušajte ponovo.`;
  }
}
