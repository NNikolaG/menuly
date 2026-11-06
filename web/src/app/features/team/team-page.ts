import { Dialog } from '@angular/cdk/dialog';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { email, form, FormField, required, submit } from '@angular/forms/signals';
import { LucideSend, LucideTrash2, LucideX } from '@lucide/angular';
import { firstValueFrom, type Observable } from 'rxjs';
import { toApiError } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth-store';
import { ROLE_LABEL } from '../../core/auth/role-labels';
import {
  TeamApi,
  type InvitableRole,
  type Invitation,
  type Member,
} from '../../core/team/team-api';
import {
  AppButton,
  AppField,
  AppInput,
  AppSelect,
  ConfirmDialog,
  type ConfirmDialogData,
} from '../../shared/ui';

/** `/tim`: who works in the business, with what role, and email invitations for new people. */
@Component({
  selector: 'app-team-page',
  imports: [
    DatePipe,
    FormField,
    AppButton,
    AppField,
    AppInput,
    AppSelect,
    LucideSend,
    LucideTrash2,
    LucideX,
  ],
  template: `
    <div class="stack" data-gap="8">
      <div class="stack" data-gap="1">
        <h1 i18n="@@team.heading">Tim</h1>
        <p class="meta" i18n="@@team.intro">
          Menadžer uređuje menije i objekte, osoblje menja samo dostupnost stavki. Vlasnik menja
          uloge.
        </p>
      </div>

      @if (error()) {
        <p role="alert" class="error">{{ error() }}</p>
      }

      <section class="stack" data-gap="3" aria-labelledby="members-heading">
        <h2 id="members-heading" i18n="@@team.members">Članovi</h2>
        @if (members(); as items) {
          <table class="table">
            <thead>
              <tr>
                <th i18n="@@team.col.person">Osoba</th>
                <th i18n="@@team.col.role">Uloga</th>
                <th class="wide-only" i18n="@@team.col.joined">Od</th>
                @if (isOwner()) {
                  <th><span class="visually-hidden" i18n="@@common.actions">Akcije</span></th>
                }
              </tr>
            </thead>
            <tbody>
              @for (member of items; track member.user_id) {
                <tr>
                  <td>
                    <strong>{{ member.name }}</strong>
                    <span class="table__sub">{{ member.email }}</span>
                  </td>
                  <td>
                    @if (isOwner() && member.role !== 'owner') {
                      <app-select
                        class="role"
                        [label]="roleOf(member)"
                        [options]="roleOptions()"
                        [value]="member.role"
                        [disabled]="busy() === member.user_id"
                        (valueChange)="setRole(member, $event)"
                      />
                    } @else {
                      <span
                        class="badge"
                        [attr.data-tone]="member.role === 'owner' ? 'accent' : 'info'"
                        >{{ roleLabel[member.role] }}</span
                      >
                    }
                  </td>
                  <td class="wide-only">{{ member.created_at | date: 'dd.MM.y.' }}</td>
                  @if (isOwner()) {
                    <td data-num>
                      @if (member.role !== 'owner') {
                        <button
                          appButton
                          variant="ghost"
                          size="sm"
                          type="button"
                          [attr.aria-label]="removeLabel(member.name)"
                          [disabled]="busy() === member.user_id"
                          (click)="remove(member)"
                        >
                          <svg lucideTrash2 aria-hidden="true"></svg>
                        </button>
                      }
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        } @else if (membersRes.error()) {
          <p role="alert" i18n="@@team.loadError">Tim nije učitan.</p>
        } @else {
          <p class="meta" i18n="@@common.loading">Učitavanje…</p>
        }
      </section>

      <section class="stack" data-gap="3" aria-labelledby="invite-heading">
        <h2 id="invite-heading" i18n="@@team.invite">Pozovi u tim</h2>
        <form class="row invite" data-gap="3" novalidate (submit)="invite($event)">
          <app-field
            i18n-label="@@auth.email"
            label="Email"
            controlId="invite-email"
            [field]="inviteForm.email"
          >
            <input
              appInput
              id="invite-email"
              type="email"
              autocomplete="off"
              [formField]="inviteForm.email"
            />
          </app-field>
          <app-field
            i18n-label="@@team.col.role"
            label="Uloga"
            controlId="invite-role"
            [field]="inviteForm.role"
          >
            <app-select
              controlId="invite-role"
              [options]="roleOptions()"
              [formField]="inviteForm.role"
            />
          </app-field>
          <button appButton type="submit" [disabled]="inviteForm().submitting()">
            <svg lucideSend aria-hidden="true"></svg>
            <ng-container i18n="@@team.send">Pošalji poziv</ng-container>
          </button>
        </form>
        @if (sentTo()) {
          <p role="status" class="notice" i18n="@@team.sent">
            Poziv je poslat na {{ sentTo() }}. Link važi 7 dana.
          </p>
        }

        @if (invitations(); as items) {
          @if (items.length) {
            <table class="table">
              <thead>
                <tr>
                  <th i18n="@@team.col.invited">Pozvan</th>
                  <th i18n="@@team.col.role">Uloga</th>
                  <th class="wide-only" i18n="@@team.col.expires">Važi do</th>
                  <th><span class="visually-hidden" i18n="@@common.actions">Akcije</span></th>
                </tr>
              </thead>
              <tbody>
                @for (inv of items; track inv.id) {
                  <tr>
                    <td>{{ inv.email }}</td>
                    <td>{{ roleLabel[inv.role] }}</td>
                    <td class="wide-only">{{ inv.expires_at | date: 'dd.MM.y.' }}</td>
                    <td data-num>
                      <button
                        appButton
                        variant="ghost"
                        size="sm"
                        type="button"
                        [disabled]="busy() === inv.id"
                        (click)="revoke(inv)"
                      >
                        <svg lucideX aria-hidden="true"></svg>
                        <ng-container i18n="@@team.revoke">Povuci</ng-container>
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          } @else {
            <p class="meta" i18n="@@team.noInvites">Nema poziva na čekanju.</p>
          }
        }
      </section>
    </div>
  `,
  styles: `
    .error {
      color: var(--color-danger);
    }

    .notice {
      color: var(--color-success);
    }

    .invite {
      align-items: flex-end;
      flex-wrap: wrap;
    }

    .role {
      min-inline-size: 10rem;
    }

    @media (max-width: 720px) {
      .wide-only {
        display: none;
      }
    }

    .visually-hidden {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `,
})
export default class TeamPage {
  private readonly api = inject(TeamApi);
  private readonly auth = inject(AuthStore);
  private readonly dialog = inject(Dialog);

  protected readonly roleLabel = ROLE_LABEL;
  protected readonly membersRes = this.api.membersResource();
  private readonly invitationsRes = this.api.invitationsResource();
  protected readonly members = computed(() =>
    this.membersRes.hasValue() ? this.membersRes.value()?.items : undefined,
  );
  protected readonly invitations = computed(() =>
    this.invitationsRes.hasValue() ? this.invitationsRes.value()?.items : undefined,
  );
  protected readonly isOwner = computed(() => this.auth.role() === 'owner');
  /** Managers may only invite staff. */
  protected readonly roleOptions = computed(() => [
    ...(this.isOwner() ? [{ value: 'manager', label: ROLE_LABEL.manager }] : []),
    { value: 'staff', label: ROLE_LABEL.staff },
  ]);

  protected readonly busy = signal<string | null>(null);
  protected readonly error = signal('');
  protected readonly sentTo = signal('');

  protected readonly inviteForm = form(signal({ email: '', role: 'staff' }), (path) => {
    required(path.email);
    email(path.email);
    required(path.role);
  });

  protected roleOf(member: Member): string {
    return $localize`:@@team.roleOf:Uloga: ${member.name}:name:`;
  }

  protected removeLabel(name: string): string {
    return $localize`:@@team.removeLabel:Ukloni ${name}:name: iz tima`;
  }

  protected async setRole(member: Member, role: string): Promise<void> {
    if (role === member.role) return;
    await this.run(member.user_id, this.api.setRole(member.user_id, role as InvitableRole));
    this.membersRes.reload();
  }

  protected async remove(member: Member): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog.open<boolean, ConfirmDialogData>(ConfirmDialog, {
        data: {
          title: $localize`:@@team.remove.title:Ukloni iz tima?`,
          body: $localize`:@@team.remove.body:${member.name}:name: više neće moći da se prijavi u ovaj posao.`,
          confirm: $localize`:@@team.remove.confirm:Ukloni`,
        },
      }).closed,
    );
    if (!confirmed) return;
    await this.run(member.user_id, this.api.removeMember(member.user_id));
    this.membersRes.reload();
  }

  protected async revoke(inv: Invitation): Promise<void> {
    await this.run(inv.id, this.api.revoke(inv.id));
    this.invitationsRes.reload();
  }

  protected async invite(event: Event): Promise<void> {
    event.preventDefault();
    this.error.set('');
    this.sentTo.set('');
    await submit(this.inviteForm, async (field) => {
      const { email, role } = field().value();
      try {
        await firstValueFrom(this.api.invite(email.trim(), role as InvitableRole));
        this.sentTo.set(email.trim());
        field.email().value.set('');
        field.email().reset();
        this.invitationsRes.reload();
      } catch (error) {
        this.error.set(teamError(toApiError(error).code));
      }
      return undefined;
    });
  }

  private async run(id: string, action: Observable<unknown>): Promise<void> {
    this.error.set('');
    this.busy.set(id);
    try {
      await firstValueFrom(action);
    } catch (error) {
      this.error.set(teamError(toApiError(error).code));
    } finally {
      this.busy.set(null);
    }
  }
}

function teamError(code: string): string {
  switch (code) {
    case 'already_member':
      return $localize`:@@team.error.alreadyMember:Ta osoba je već u timu.`;
    case 'forbidden':
      return $localize`:@@common.forbidden:Nemaš dozvolu za ovu radnju.`;
    default:
      return $localize`:@@auth.unknownError:Nešto nije u redu. Pokušajte ponovo.`;
  }
}
