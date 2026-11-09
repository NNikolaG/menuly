import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import type { Venue } from '../../core/venues/venue';
import { AppButton, AppChipGroup, AppDialog, AppSwitch } from '../../shared/ui';

export interface VenueAccessDialogData {
  name: string;
  venues: readonly Venue[];
  /** Current `venue_ids`; empty = every venue. */
  venueIds: readonly string[];
}

/**
 * Which venues a manager or staff member works in. Closes with the new `venue_ids` (`[]` = every venue),
 * or undefined when cancelled.
 */
@Component({
  selector: 'app-venue-access-dialog',
  imports: [AppDialog, AppButton, AppChipGroup, AppSwitch],
  template: `
    <app-dialog [title]="title">
      <div class="stack" data-gap="4">
        <label class="row" data-gap="3">
          <input
            type="checkbox"
            appSwitch
            [checked]="all()"
            (change)="setAll($any($event.target).checked)"
          />
          <span i18n="@@team.venues.allSwitch">Svi objekti, i oni koji tek budu dodati</span>
        </label>
        @if (!all()) {
          <div class="stack" data-gap="2">
            <app-chip-group size="sm" [label]="pickLabel" [options]="options" [(value)]="picked" />
            @if (!picked().length) {
              <p class="meta" role="status" i18n="@@team.venues.pickOne">
                Izaberi bar jedan objekat.
              </p>
            }
          </div>
        }
      </div>
      <button
        dialog-actions
        appButton
        variant="secondary"
        type="button"
        (click)="ref.close()"
        i18n="@@common.cancel"
      >
        Otkaži
      </button>
      <button
        dialog-actions
        appButton
        type="button"
        [disabled]="!valid()"
        (click)="save()"
        i18n="@@common.save"
      >
        Sačuvaj
      </button>
    </app-dialog>
  `,
})
export class VenueAccessDialog {
  protected readonly data = inject<VenueAccessDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<string[]>>(DialogRef);

  protected readonly title = $localize`:@@team.venues.dialogTitle:Objekti: ${this.data.name}:name:`;
  protected readonly pickLabel = $localize`:@@team.venues.pickLabel:Objekti u kojima radi`;
  protected readonly options = this.data.venues.map((venue) => ({
    key: venue.id,
    label: venue.name,
  }));

  /** Ids of deleted venues are dropped; someone whose venues were all deleted has to get new ones. */
  private readonly known = this.data.venueIds.filter((id) =>
    this.data.venues.some((v) => v.id === id),
  );
  protected readonly all = signal(this.data.venueIds.length === 0);
  protected readonly picked = signal<readonly string[]>(this.known);
  protected readonly valid = computed(() => this.all() || this.picked().length > 0);

  protected setAll(all: boolean): void {
    this.all.set(all);
  }

  protected save(): void {
    if (this.valid()) this.ref.close(this.all() ? [] : [...this.picked()]);
  }
}
