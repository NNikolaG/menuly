import type { Role } from '../api/api-types';

/** Shown names of the tenant roles. */
export const ROLE_LABEL: Record<Role, string> = {
  owner: $localize`:@@role.owner:Vlasnik`,
  manager: $localize`:@@role.manager:Menadžer`,
  staff: $localize`:@@role.staff:Osoblje`,
};
