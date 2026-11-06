# UI primitives

| Primitive       | Selector                                | Snippet                                                                                                                                                                   |
| --------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppButton`     | `button[appButton]`, `a[appButton]`     | `<button appButton variant="secondary" size="sm">…</button>` (variants: primary, secondary, ghost, inverse, danger; sizes: sm, md, lg)                                    |
| `AppDialog`     | `app-dialog`                            | `dialog.open(MyDialog)`; template: `<app-dialog title="Obriši stavku">…<button appButton dialog-actions>Obriši</button></app-dialog>`                                     |
| `AppField`      | `app-field`                             | `<app-field label="Cena" controlId="price" hint="…" suffix="RSD" [field]="form.price"><input appInput variant="price" id="price" [formField]="form.price" /></app-field>` |
| `AppInput`      | `input[appInput]`, `textarea[appInput]` | `<input appInput [formField]="form.name" />` (variants: text, price)                                                                                                      |
| `AppMenu`       | `app-menu`                              | `<app-menu label="Nalog" [items]="items" (selected)="run($event)" />` (item: `{ value, label, icon? }`, icon is a Lucide component)                                       |
| `AppPattern`    | `app-pattern`                           | `<app-pattern [seed]="venue.name" [cols]="4" [rows]="2" [fluid]="true" />` (seed is app data; `cell`, `big`, `fluid`; fluid needs a size-container parent)                |
| `AppSegmented`  | `app-segmented`                         | `<app-segmented label="Tema" [options]="options" [(value)]="theme" />` or `[formField]`                                                                                   |
| `AppSwitch`     | `input[type=checkbox][appSwitch]`       | `<label><input type="checkbox" appSwitch [formField]="form.available" /> Dostupno</label>`                                                                                |
| `ConfirmDialog` | `app-confirm-dialog`                    | `dialog.open<boolean, ConfirmDialogData>(ConfirmDialog, { data: { title, body, confirm } }).closed` → `true` to go ahead                                                  |
