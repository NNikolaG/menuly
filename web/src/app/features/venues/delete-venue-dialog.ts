import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';
import { AppButton, AppDialog } from '../../shared/ui';
import type { Venue } from '../../core/venues/venue';

/** Asks before deleting a venue; closes with `true` to confirm. */
@Component({
  selector: 'app-delete-venue-dialog',
  imports: [AppDialog, AppButton],
  template: `
    <app-dialog i18n-title="@@venues.delete.title" title="Obriši objekat?">
      <ng-container i18n="@@venues.delete.body"
        >Objekat „{{ venue.name }}“ i njegovi meniji se brišu. Gosti više neće moći da otvore njegov
        meni.</ng-container
      >
      <button
        dialog-actions
        appButton
        variant="secondary"
        type="button"
        (click)="ref.close(false)"
        i18n="@@common.cancel"
      >
        Otkaži
      </button>
      <button
        dialog-actions
        appButton
        variant="danger"
        type="button"
        (click)="ref.close(true)"
        i18n="@@venues.delete.confirm"
      >
        Obriši objekat
      </button>
    </app-dialog>
  `,
})
export class DeleteVenueDialog {
  protected readonly venue = inject<Venue>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
}
