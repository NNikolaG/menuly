import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';
import { AppButton } from '../button/button';
import { AppDialog } from '../dialog/dialog';

export interface ConfirmDialogData {
  title: string;
  body: string;
  /** Label of the destructive button, e.g. "Obriši meni". */
  confirm: string;
}

/** Yes/no question before a destructive action. Open with `Dialog.open(ConfirmDialog, { data })`; closes with `true` to go ahead. */
@Component({
  selector: 'app-confirm-dialog',
  imports: [AppDialog, AppButton],
  template: `
    <app-dialog [title]="data.title">
      {{ data.body }}
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
      <button dialog-actions appButton variant="danger" type="button" (click)="ref.close(true)">
        {{ data.confirm }}
      </button>
    </app-dialog>
  `,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
}
