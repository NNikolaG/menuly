import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import { ApiClient } from '../api/api-client';
import type { Role } from '../api/api-types';

export interface Member {
  user_id: string;
  name: string;
  email: string;
  role: Role;
  /** When they joined. */
  created_at: string;
}

export type InvitableRole = 'manager' | 'staff';

export interface Invitation {
  id: string;
  email: string;
  role: InvitableRole;
  expires_at: string;
  created_at: string;
}

/** Members and invitations of the current tenant (owner, manager). */
@Injectable({ providedIn: 'root' })
export class TeamApi {
  private readonly api = inject(ApiClient);

  membersResource() {
    return this.api.resource<{ items: Member[] }>(() => '/v1/members');
  }

  /** Pending only. */
  invitationsResource() {
    return this.api.resource<{ items: Invitation[] }>(() => '/v1/invitations');
  }

  /** Owner only; applies from the member's next login or token refresh. */
  setRole(userId: string, role: InvitableRole): Observable<void> {
    return this.api.patch(`/v1/members/${encodeURIComponent(userId)}`, { role });
  }

  /** Owner only; also signs them out of this tenant. */
  removeMember(userId: string): Observable<void> {
    return this.api.delete(`/v1/members/${encodeURIComponent(userId)}`);
  }

  /** Owners invite managers or staff, managers staff only. Replaces a pending one for the same email. */
  invite(email: string, role: InvitableRole): Observable<Invitation> {
    return this.api.post('/v1/invitations', { email, role });
  }

  revoke(invitationId: string): Observable<void> {
    return this.api.delete(`/v1/invitations/${encodeURIComponent(invitationId)}`);
  }
}
