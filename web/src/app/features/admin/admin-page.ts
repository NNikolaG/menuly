import { Dialog } from '@angular/cdk/dialog';
import { Tab, TabContent, TabList, TabPanel, Tabs } from '@angular/aria/tabs';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { LucideSearch } from '@lucide/angular';
import { firstValueFrom } from 'rxjs';
import { AdminApi, type AdminTenantSummary } from '../../core/admin/admin-api';
import { toApiError } from '../../core/api/api-error';
import {
  AppButton,
  AppInput,
  AppSegmented,
  ConfirmDialog,
  type ConfirmDialogData,
} from '../../shared/ui';

/** `/admin`: every business on the platform, suspend/reactivate, import limits per venue, OCR spend. */
@Component({
  selector: 'app-admin-page',
  imports: [
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    FormField,
    Tabs,
    TabList,
    Tab,
    TabPanel,
    TabContent,
    AppButton,
    AppInput,
    AppSegmented,
    LucideSearch,
  ],
  template: `
    <div class="stack" data-gap="6">
      <div class="stack" data-gap="1">
        <h1 i18n="@@admin.heading">Administracija</h1>
        <p class="meta" i18n="@@admin.intro">
          Sve firme na platformi. Vidljivo samo administratorima platforme.
        </p>
      </div>

      @if (error()) {
        <p role="alert" class="error">{{ error() }}</p>
      }

      <div ngTabs class="stack" data-gap="4">
        <div ngTabList class="tabs" [(selectedTab)]="tab" [attr.aria-label]="sectionsLabel">
          <div ngTab class="tab" value="tenants" i18n="@@admin.tenants">Firme</div>
          <div ngTab class="tab" value="ocr" i18n="@@admin.ocr">OCR potrošnja</div>
        </div>

        <div ngTabPanel value="tenants">
          <ng-template ngTabContent>
            <div class="stack" data-gap="4">
              <div class="filters">
                <form class="search" role="search" (submit)="search($event)">
                  <svg lucideSearch aria-hidden="true"></svg>
                  <input
                    appInput
                    type="search"
                    [attr.aria-label]="searchLabel"
                    [placeholder]="searchLabel"
                    [formField]="searchForm.q"
                  />
                </form>
                <app-segmented
                  [label]="statusFilterLabel"
                  [options]="statusFilters"
                  [(value)]="statusFilter"
                />
              </div>

              @if (tenants(); as items) {
                <table class="table">
                  <thead>
                    <tr>
                      <th i18n="@@admin.col.tenant">Firma</th>
                      <th i18n="@@venue.col.status">Status</th>
                      <th data-num i18n="@@admin.col.venues">Objekti</th>
                      <th data-num class="wide-only" i18n="@@admin.col.members">Članovi</th>
                      <th data-num class="wide-only" i18n="@@admin.col.imports">Uvozi</th>
                      <th data-num class="wide-only" i18n="@@admin.col.views">Pregledi 30d</th>
                      <th data-num i18n="@@admin.col.ocr">OCR</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (t of shownTenants(items); track t.id) {
                      <tr [attr.data-selected]="selected() === t.id ? '' : null">
                        <td>
                          <button
                            type="button"
                            class="link"
                            [attr.aria-expanded]="selected() === t.id"
                            [attr.aria-controls]="'tenant-' + t.id"
                            (click)="toggle(t.id)"
                          >
                            <strong>{{ t.name }}</strong>
                          </button>
                          <span class="table__sub"
                            >{{ t.slug }} · {{ t.created_at | date: 'dd.MM.y.' }}</span
                          >
                        </td>
                        <td>
                          <span
                            class="badge"
                            [attr.data-tone]="t.status === 'active' ? 'success' : 'danger'"
                            >{{ statusLabel(t.status) }}</span
                          >
                        </td>
                        <td data-num>{{ t.venues }}</td>
                        <td data-num class="wide-only">{{ t.members }}</td>
                        <td data-num class="wide-only">{{ t.imports }}</td>
                        <td data-num class="wide-only">{{ t.views_30d | number }}</td>
                        <td data-num>
                          {{ t.ocr_cost_micros / 1e6 | currency: 'USD' : 'symbol' : '1.2-2' }}
                        </td>
                      </tr>
                      @if (selected() === t.id) {
                        <tr class="detail-row">
                          <td colspan="7" [id]="'tenant-' + t.id">
                            @if (detail(); as d) {
                              <div class="detail">
                                <div class="stack" data-gap="2">
                                  <p class="label" i18n="@@admin.owners">Vlasnici</p>
                                  @for (owner of d.owners; track owner.id) {
                                    <p>
                                      {{ owner.name }} <span class="meta">{{ owner.email }}</span>
                                    </p>
                                  }
                                  <div>
                                    @if (t.status === 'active') {
                                      <button
                                        appButton
                                        variant="danger"
                                        size="sm"
                                        type="button"
                                        [disabled]="busy()"
                                        (click)="setStatus(t, 'suspended')"
                                        i18n="@@admin.suspend"
                                      >
                                        Suspenduj
                                      </button>
                                    } @else {
                                      <button
                                        appButton
                                        variant="secondary"
                                        size="sm"
                                        type="button"
                                        [disabled]="busy()"
                                        (click)="setStatus(t, 'active')"
                                        i18n="@@admin.activate"
                                      >
                                        Aktiviraj
                                      </button>
                                    }
                                  </div>
                                </div>
                                <div class="stack" data-gap="2">
                                  <p class="label" i18n="@@admin.importLimits">
                                    Uvozi po objektu (iskorišćeno / limit)
                                  </p>
                                  @for (venue of d.venues; track venue.id) {
                                    <div class="limit">
                                      <label [for]="'limit-' + venue.id">{{ venue.name }}</label>
                                      <span class="meta">{{ venue.imports_used }} /</span>
                                      <input
                                        appInput
                                        type="number"
                                        min="0"
                                        max="1000"
                                        inputmode="numeric"
                                        class="limit__input"
                                        [id]="'limit-' + venue.id"
                                        [value]="venue.ocr_import_limit"
                                        #limit
                                      />
                                      <button
                                        appButton
                                        variant="ghost"
                                        size="sm"
                                        type="button"
                                        [disabled]="busy()"
                                        (click)="saveLimit(venue.id, limit.valueAsNumber)"
                                        i18n="@@common.save"
                                      >
                                        Sačuvaj
                                      </button>
                                    </div>
                                  } @empty {
                                    <p class="meta" i18n="@@admin.noVenues">Nema objekata.</p>
                                  }
                                </div>
                              </div>
                            } @else {
                              <p class="meta" i18n="@@common.loading">Učitavanje…</p>
                            }
                          </td>
                        </tr>
                      }
                    } @empty {
                      <tr>
                        <td colspan="7" class="meta" i18n="@@common.noMatches">Nema rezultata.</td>
                      </tr>
                    }
                  </tbody>
                </table>
              } @else if (tenantsRes.error()) {
                <p role="alert" i18n="@@admin.loadError">Podaci nisu učitani.</p>
              } @else {
                <p class="meta" i18n="@@common.loading">Učitavanje…</p>
              }
            </div>
          </ng-template>
        </div>

        <div ngTabPanel value="ocr">
          <ng-template ngTabContent>
            <div class="stack" data-gap="4">
              <div class="row" data-justify="between">
                <app-segmented
                  [label]="periodLabel"
                  [options]="periods"
                  [value]="days()"
                  (valueChange)="days.set($event)"
                />
                @if (usage(); as u) {
                  <p class="total">
                    <span class="meta" i18n="@@admin.ocrTotal">Ukupno</span>
                    <strong>{{
                      u.total_cost_micros / 1e6 | currency: 'USD' : 'symbol' : '1.2-2'
                    }}</strong>
                  </p>
                }
              </div>
              @if (usage(); as u) {
                <table class="table">
                  <thead>
                    <tr>
                      <th i18n="@@admin.col.tenant">Firma</th>
                      <th class="wide-only" i18n="@@admin.col.model">Model</th>
                      <th data-num i18n="@@admin.col.pages">Stranice</th>
                      <th data-num class="wide-only" i18n="@@admin.col.tokens">
                        Tokeni (ulaz / izlaz)
                      </th>
                      <th data-num i18n="@@admin.col.cost">Trošak</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of u.items; track row.tenant_id + row.model) {
                      <tr>
                        <td>{{ row.tenant_name }}</td>
                        <td class="wide-only">
                          <code>{{ row.model }}</code>
                        </td>
                        <td data-num>{{ row.pages | number }}</td>
                        <td data-num class="wide-only">
                          {{ row.input_tokens | number }} / {{ row.output_tokens | number }}
                        </td>
                        <td data-num>
                          {{ row.cost_micros / 1e6 | currency: 'USD' : 'symbol' : '1.2-4' }}
                        </td>
                      </tr>
                    } @empty {
                      <tr>
                        <td colspan="5" class="meta" i18n="@@admin.noUsage">
                          Nema OCR potrošnje u ovom periodu.
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              } @else if (usageRes.error()) {
                <p role="alert" i18n="@@admin.loadError">Podaci nisu učitani.</p>
              }
            </div>
          </ng-template>
        </div>
      </div>
    </div>
  `,
  styles: `
    .error {
      color: var(--color-danger);
    }

    .tabs {
      display: flex;
      gap: var(--space-1);
      border-block-end: var(--stroke-hairline) solid var(--color-border);
    }

    .tab {
      padding: var(--space-2) var(--space-3);
      border-block-end: 2px solid transparent;
      color: var(--color-text-muted);
      font: var(--type-label);
      cursor: pointer;
    }

    .tab[aria-selected='true'] {
      border-color: var(--color-text);
      color: var(--color-text);
    }

    .tab:focus-visible {
      outline: var(--stroke-focus) solid var(--color-focus);
      outline-offset: calc(-1 * var(--stroke-focus));
    }

    .search {
      position: relative;
      flex: 1 1 14rem;
      max-inline-size: 24rem;
    }

    .search svg {
      position: absolute;
      inset-inline-start: var(--space-3);
      inset-block-start: 50%;
      translate: 0 -50%;
      inline-size: var(--size-icon-sm);
      block-size: var(--size-icon-sm);
      color: var(--color-text-subtle);
    }

    .search input {
      padding-inline-start: calc(var(--space-3) * 2 + var(--size-icon-sm));
    }

    .link {
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: pointer;
    }

    .link:hover {
      text-decoration: underline;
    }

    tr[data-selected] > td {
      background: var(--color-surface-hover);
    }

    .detail-row > td {
      background: var(--color-surface-sunken);
    }

    .detail {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
      gap: var(--space-6);
      padding-block: var(--space-2);
    }

    @media (max-width: 720px) {
      .detail {
        grid-template-columns: minmax(0, 1fr);
      }

      .wide-only {
        display: none;
      }
    }

    .label {
      font: var(--type-label);
    }

    .limit {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto 5rem auto;
      align-items: center;
      gap: var(--space-2);
    }

    .limit__input {
      min-inline-size: 0;
    }

    .total {
      display: flex;
      align-items: baseline;
      gap: var(--space-2);
      font-variant-numeric: tabular-nums;
    }
  `,
})
export default class AdminPage {
  private readonly api = inject(AdminApi);
  private readonly dialog = inject(Dialog);

  protected readonly sectionsLabel = $localize`:@@admin.sections:Delovi administracije`;
  protected readonly searchLabel = $localize`:@@admin.search:Traži po nazivu ili poddomenu`;
  protected readonly periodLabel = $localize`:@@admin.period:Period`;
  protected readonly periods = [
    { value: '7', label: $localize`:@@admin.days7:7 dana` },
    { value: '30', label: $localize`:@@admin.days30:30 dana` },
    { value: '90', label: $localize`:@@admin.days90:90 dana` },
  ];

  protected readonly statusFilterLabel = $localize`:@@venue.col.status:Status`;
  protected readonly statusFilters = [
    { value: 'all', label: $localize`:@@common.filter.allItems:Sve` },
    { value: 'active', label: $localize`:@@admin.filter.active:Aktivne` },
    { value: 'suspended', label: $localize`:@@admin.filter.suspended:Suspendovane` },
  ];
  protected readonly statusFilter = signal('all');

  protected readonly tab = signal<string | undefined>('tenants');
  protected readonly searchForm = form(signal({ q: '' }));
  private readonly query = signal('');
  protected readonly tenantsRes = this.api.tenantsResource(this.query);
  protected readonly tenants = computed(() =>
    this.tenantsRes.hasValue() ? this.tenantsRes.value()?.items : undefined,
  );
  protected readonly selected = signal<string | undefined>(undefined);
  private readonly detailRes = this.api.tenantResource(this.selected);
  protected readonly detail = computed(() =>
    this.detailRes.hasValue() && !this.detailRes.isLoading() ? this.detailRes.value() : undefined,
  );

  protected readonly days = signal('30');
  protected readonly usageRes = this.api.ocrUsageResource(() => Number(this.days()));
  protected readonly usage = computed(() =>
    this.usageRes.hasValue() ? this.usageRes.value() : undefined,
  );

  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected statusLabel(status: 'active' | 'suspended'): string {
    return status === 'active'
      ? $localize`:@@admin.status.active:Aktivna`
      : $localize`:@@admin.status.suspended:Suspendovana`;
  }

  protected shownTenants(items: AdminTenantSummary[]): AdminTenantSummary[] {
    const status = this.statusFilter();
    return status === 'all' ? items : items.filter((tenant) => tenant.status === status);
  }

  protected search(event: Event): void {
    event.preventDefault();
    this.query.set(this.searchForm.q().value().trim());
  }

  protected toggle(id: string): void {
    this.selected.update((current) => (current === id ? undefined : id));
  }

  protected async setStatus(
    tenant: AdminTenantSummary,
    status: 'active' | 'suspended',
  ): Promise<void> {
    if (status === 'suspended') {
      const confirmed = await firstValueFrom(
        this.dialog.open<boolean, ConfirmDialogData>(ConfirmDialog, {
          data: {
            title: $localize`:@@admin.suspend.title:Suspenduj firmu?`,
            body: $localize`:@@admin.suspend.body:Javni meniji firme „${tenant.name}:name:“ prestaju da rade, a korisnici ne mogu da se prijave u nju.`,
            confirm: $localize`:@@admin.suspend:Suspenduj`,
          },
        }).closed,
      );
      if (!confirmed) return;
    }
    if (await this.run(() => firstValueFrom(this.api.setTenantStatus(tenant.id, status)))) {
      this.tenantsRes.reload();
      this.detailRes.reload();
    }
  }

  protected async saveLimit(venueId: string, limit: number): Promise<void> {
    if (!Number.isInteger(limit) || limit < 0 || limit > 1000) {
      this.error.set($localize`:@@admin.limitInvalid:Limit je ceo broj od 0 do 1000.`);
      return;
    }
    if (await this.run(() => firstValueFrom(this.api.setImportLimit(venueId, limit)))) {
      this.detailRes.reload();
    }
  }

  private async run(action: () => Promise<unknown>): Promise<boolean> {
    this.error.set('');
    this.busy.set(true);
    try {
      await action();
      return true;
    } catch (error) {
      this.error.set(
        toApiError(error).code === 'forbidden'
          ? $localize`:@@common.forbidden:Nemaš dozvolu za ovu radnju.`
          : $localize`:@@auth.unknownError:Nešto nije u redu. Pokušajte ponovo.`,
      );
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
