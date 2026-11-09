import { Dialog } from '@angular/cdk/dialog';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { email, form, FormField, required, submit } from '@angular/forms/signals';
import { LucideSend, LucideStore, LucideTrash2, LucideX } from '@lucide/angular';
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
import { VenuesStore } from '../../core/venues/venues-store';
import {
  AppButton,
  AppChipGroup,
  AppField,
  AppInput,
  AppSearch,
  AppSegmented,
  AppSelect,
  AppSwitch,
  ConfirmDialog,
  type ConfirmDialogData,
} from '../../shared/ui';
import { matchesQuery } from '../../shared/text/fold';
import { VenueAccessDialog, type VenueAccessDialogData } from './venue-access-dialog';

/** `/tim`: who works in the business, with what role, and email invitations for new people. */
@Component({
  selector: 'app-team-page',
  imports: [
    DatePipe,
    FormField,
    AppButton,
    AppChipGroup,
    AppField,
    AppInput,
    AppSearch,
    AppSegmented,
    AppSelect,
    AppSwitch,
    LucideSend,
    LucideStore,
    LucideTrash2,
    LucideX,
  ],
  template: `
    <div class="stack" data-gap="8">
      <div class="stack" data-gap="1">
        <h1 i18n="@@team.heading">Tim</h1>
        <p class="meta" i18n="@@team.intro">
          Menadžer uređuje menije i objekte, osoblje menja samo dostupnost stavki. Vlasnik menja
          uloge i bira u kojim objektima ko radi.
        </p>
      </div>

      @if (error()) {
        <p class="alert" role="alert">{{ error() }}</p>
      }

      <section class="stack" data-gap="3" aria-labelledby="members-heading">
        <h2 id="members-heading" i18n="@@team.members">Članovi</h2>
        @if (members(); as items) {
          <div class="filters">
            <app-search [label]="searchLabel" [(value)]="query" />
            <app-segmented
              [label]="roleFilterLabel"
              [options]="roleFilters"
              [(value)]="roleFilter"
            />
          </div>
          @if (!shownMembers().length) {
            <div class="row" data-gap="3">
              <p class="meta" i18n="@@common.noFilterMatches">Ništa ne odgovara filterima.</p>
              <button
                appButton
                variant="ghost"
                size="sm"
                type="button"
                (click)="clearFilters()"
                i18n="@@common.clearFilters"
              >
                Poništi filtere
              </button>
            </div>
          } @else {
            <table class="table">
              <thead>
                <tr>
                  <th i18n="@@team.col.person">Osoba</th>
                  <th i18n="@@team.col.role">Uloga</th>
                  <th i18n="@@team.col.venues">Objekti</th>
                  <th class="wide-only" i18n="@@team.col.joined">Od</th>
                  @if (isOwner()) {
                    <th><span class="visually-hidden" i18n="@@common.actions">Akcije</span></th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (member of shownMembers(); track member.user_id) {
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
                    <td>
                      @if (isOwner() && member.role !== 'owner') {
                        <button
                          appButton
                          variant="ghost"
                          size="sm"
                          type="button"
                          class="venues"
                          [disabled]="busy() === member.user_id || !venues()"
                          (click)="editVenues(member)"
                        >
                          <svg lucideStore aria-hidden="true"></svg>
                          {{ venueSummary(member.role, member.venue_ids) }}
                          <span class="visually-hidden" i18n="@@team.venues.change"
                            >, promeni objekte</span
                          >
                        </button>
                      } @else {
                        <span class="meta">{{ venueSummary(member.role, member.venue_ids) }}</span>
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
          }
        } @else if (membersRes.error()) {
          <p role="alert" i18n="@@team.loadError">Tim nije učitan.</p>
        } @else {
          <p class="loading" role="status" i18n="@@common.loading">Učitavanje…</p>
        }
      </section>

      <section class="stack" data-gap="3" aria-labelledby="invite-heading">
        <h2 id="invite-heading" i18n="@@team.invite">Pozovi u tim</h2>
        <form class="stack" data-gap="3" novalidate (submit)="invite($event)">
          <div class="row invite" data-gap="3">
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
            <button
              appButton
              type="submit"
              [disabled]="inviteForm().submitting()"
              [loading]="inviteForm().submitting()"
            >
              <svg lucideSend aria-hidden="true"></svg>
              <ng-container i18n="@@team.send">Pošalji poziv</ng-container>
            </button>
          </div>
          @if (venueOptions().length > 1) {
            <fieldset class="stack" data-gap="2">
              <legend class="label" i18n="@@team.venues.inviteLegend">Objekti</legend>
              @if (!limited()) {
                <label class="row" data-gap="3">
                  <input
                    type="checkbox"
                    appSwitch
                    [checked]="inviteAll()"
                    (change)="inviteAll.set($any($event.target).checked)"
                  />
                  <span i18n="@@team.venues.allSwitch"
                    >Svi objekti, i oni koji tek budu dodati</span
                  >
                </label>
              }
              @if (limited() || !inviteAll()) {
                <app-chip-group
                  size="sm"
                  [label]="pickLabel"
                  [options]="venueOptions()"
                  [(value)]="invitePicked"
                />
              }
            </fieldset>
          }
        </form>
        @if (sentTo()) {
          <p class="alert" data-tone="success" role="status" i18n="@@team.sent">
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
                  <th class="wide-only" i18n="@@team.col.venues">Objekti</th>
                  <th class="wide-only" i18n="@@team.col.expires">Važi do</th>
                  <th><span class="visually-hidden" i18n="@@common.actions">Akcije</span></th>
                </tr>
              </thead>
              <tbody>
                @for (inv of items; track inv.id) {
                  <tr>
                    <td>{{ inv.email }}</td>
                    <td>{{ roleLabel[inv.role] }}</td>
                    <td class="wide-only">{{ venueSummary(inv.role, inv.venue_ids) }}</td>
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
    .invite {
      align-items: flex-end;
      flex-wrap: wrap;
    }

    .role {
      min-inline-size: 10rem;
    }

    fieldset {
      min-inline-size: 0;
      margin: 0;
      padding: 0;
      border: 0;
    }

    legend {
      margin-block-end: var(--space-2);
      padding: 0;
    }

    .venues {
      max-inline-size: 16rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
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
  private readonly venuesStore = inject(VenuesStore);

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

  /** The venues the caller can see: all of them, or their own when they are limited. */
  protected readonly venues = computed(() =>
    this.venuesStore.list.hasValue() ? this.venuesStore.list.value()?.items : undefined,
  );
  protected readonly venueOptions = computed(() =>
    (this.venues() ?? []).map((venue) => ({ key: venue.id, label: venue.name })),
  );
  private readonly venueNames = computed(
    () => new Map((this.venues() ?? []).map((venue) => [venue.id, venue.name])),
  );
  /** A manager limited to some venues invites only to those, so they always pick. */
  protected readonly limited = computed(() => this.auth.venueScope() !== null);
  protected readonly inviteAll = signal(true);
  protected readonly invitePicked = signal<readonly string[]>([]);
  protected readonly pickLabel = $localize`:@@team.venues.pickLabel:Objekti u kojima radi`;

  protected readonly searchLabel = $localize`:@@team.search:Traži po imenu ili emailu`;
  protected readonly roleFilterLabel = $localize`:@@team.col.role:Uloga`;
  protected readonly roleFilters = [
    { value: 'all', label: $localize`:@@common.filter.all:Svi` },
    ...(['owner', 'manager', 'staff'] as const).map((role) => ({
      value: role,
      label: ROLE_LABEL[role],
    })),
  ];
  protected readonly query = signal('');
  protected readonly roleFilter = signal('all');
  protected readonly shownMembers = computed(() =>
    (this.members() ?? []).filter(
      (member) =>
        (this.roleFilter() === 'all' || member.role === this.roleFilter()) &&
        matchesQuery(this.query(), member.name, member.email),
    ),
  );

  protected clearFilters(): void {
    this.query.set('');
    this.roleFilter.set('all');
  }

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

  /** "Svi objekti", or the venue names; venues the caller can't see (or deleted ones) count as "+N" when limited. */
  protected venueSummary(role: string, ids: readonly string[]): string {
    if (role === 'owner' || !ids.length) return $localize`:@@team.venues.all:Svi objekti`;
    const names = ids.flatMap((id) => this.venueNames().get(id) ?? []);
    const hidden = this.limited() ? ids.length - names.length : 0;
    const parts = hidden ? [...names, `+${hidden}`] : names;
    return parts.length ? parts.join(', ') : $localize`:@@team.venues.none:Nijedan objekat`;
  }

  protected async editVenues(member: Member): Promise<void> {
    const venues = this.venues();
    if (!venues) return;
    const venueIds = await firstValueFrom(
      this.dialog.open<string[], VenueAccessDialogData>(VenueAccessDialog, {
        data: { name: member.name, venues, venueIds: member.venue_ids },
      }).closed,
    );
    if (!venueIds) return;
    await this.run(member.user_id, this.api.setVenues(member.user_id, venueIds));
    this.membersRes.reload();
  }

  /** The invite's `venue_ids`, or null when a choice is still missing. */
  private inviteVenueIds(): string[] | null {
    const options = this.venueOptions();
    if (this.limited() && options.length === 1) return [options[0].key];
    if (!this.limited() && (this.inviteAll() || options.length <= 1)) return [];
    const picked = this.invitePicked().filter((id) => options.some((o) => o.key === id));
    return picked.length ? picked : null;
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
    const venueIds = this.inviteVenueIds();
    if (!venueIds) {
      this.error.set($localize`:@@team.venues.pickOne:Izaberi bar jedan objekat.`);
      return;
    }
    await submit(this.inviteForm, async (field) => {
      const { email, role } = field().value();
      try {
        await firstValueFrom(this.api.invite(email.trim(), role as InvitableRole, venueIds));
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
    case 'venue_ids_required':
      return $localize`:@@team.error.venuesRequired:Izaberi bar jedan od svojih objekata.`;
    case 'validation_failed':
      return $localize`:@@team.error.venues:Neki od izabranih objekata više ne postoji ili ti nije dostupan.`;
    default:
      return $localize`:@@auth.unknownError:Nešto nije u redu. Pokušajte ponovo.`;
  }
}
