# UI primitives

| Primitive   | Selector                            | Snippet                                                                                                                              |
| ----------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `AppButton` | `button[appButton]`, `a[appButton]` | `<button appButton variant="secondary">…</button>`                                                                                   |
| `AppField`  | `app-field`                         | `<app-field label="Email" controlId="email" [field]="form.email"><input appInput id="email" [formField]="form.email" /></app-field>` |
| `AppInput`  | `input[appInput]`                   | `<input appInput [formField]="form.name" />`                                                                                         |
| `AppMenu`   | `app-menu`                          | `<app-menu label="Nalog" [items]="items" (selected)="run($event)" />`                                                                |
