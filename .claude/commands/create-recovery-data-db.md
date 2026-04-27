Add a new list to the endpoint — backend query + frontend integration.

## What to do

Ask the user for:
1. **Entity name** — e.g. "Race", "CharacterClass", "Background" (used to name files, types, and SQL table)
2. **Table name** — the exact PostgreSQL table name, e.g. `race`, `character_class`
3. **Columns to select** — the column names to return, e.g. `id_race`, `name`, or by pattern all columns
4. **Where it appears in frontend** — e.g. which step (1–6) and under which `<legend>` label the list should be rendered in the frontend

Then perform all steps below without further interruption.

## Steps

### 1. Add the SQL type to the API

You can find the database structure on `dungeon-companion/docs/database.sql`
Edit `dungeon-companion-api/src/services/character-options/types.ts`:
- Add a new exported interface matching the columns in the database, e.g.:
```ts
export interface Race {
  id_race: number;
  name: string;
  movement: string;
}
```
- Add the new field to the `CharacterOptions` interface:
```ts
export interface CharacterOptions {
  attributes: AttributeType[];
  skills: Skill[];
  races: Race[]; // new entry
}
```

### 2. Add the DB query to the service

Edit `dungeon-companion-api/src/services/character-options.service.ts`:
- Add the new query inside the existing `Promise.all([...])` array, following the same tagged-template pattern:
```ts
this.repository.findSkills(),
```
- Destructure the result and include it in the returned object:
```ts
const [attributes, skills, races] = await Promise.all([...]);
return { attributes, skills, races };
```
- Create the repository to execute the query that you want:
follow the instructions on `dungeon-companion/.claude/commands/create-repository.md`

### 3. Build and verify the API

Run `npm run build` from `dungeon-companion-api/`. Fix any TypeScript errors before proceeding.

### 4. Add the interface to the frontend model

Edit `dungeon-companion-web/src/app/models/character-options.interface.ts` or the interface responsible about the entity requested (if there isn't any, create following the `dungeon-companion-web/src/app/models/character-options.interface.ts` example):
- Add the new interface matching the API type, e.g.:
```ts
export interface Race {
  id_race: number;
  name: string;
  movement: string;
}
```
- Add the new field to `CharacterOptions`, or the interface responsible if is another entity requested:
```ts
export interface CharacterOptions {
  attributes: AttributeType[];
  skills: Skill[];
  races: Race[]; // new entry
}
```

### 5. Expose the new list in the component

Edit `dungeon-companion-web/src/app/character-wizard/character-wizard.component.ts`:
- Add a typed property for the new list:
```ts
availableRaces: Race[] = [];
```
- Populate it inside the existing `ngOnInit` subscription:
```ts
this.availableRaces = options.races;
```

### 6. Render the list in the template

Edit `dungeon-companion-web/src/app/character-wizard/character-wizard.component.html` in the step and `<legend>` or the part of frontend identified by the user.

- For **checkbox lists** (multi-select, e.g. skills):
```html
@for (item of availableRaces; track item.id_race) {
  <label>
    <input type="checkbox" class="retro-checkbox"
           (change)="toggleArrayItem('races', item.name, $event)">
    {{ item.name }}
  </label>
}
```

- For **select dropdowns** (single-select, e.g. race):
```html
<select [(ngModel)]="characterData.core_build.race">
  @for (item of availableRaces; track item.id_race) {
    <option [value]="item.name">{{ item.name }}</option>
  }
</select>
```

### 6.1. Fix async select display (dropdowns only)

When options are loaded asynchronously, Angular's `SelectControlValueAccessor` writes the model value to the DOM before the `<option>` elements exist, leaving the dropdown visually empty until user interaction. Fix this by calling `detectChanges()` right after setting the data in `ngOnInit`.

In `character-wizard.component.ts`, inject `ChangeDetectorRef` and call it at the end of the `next` callback:

```ts
import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';

private cdr = inject(ChangeDetectorRef);

ngOnInit(): void {
  this.loadingOverlay.show();
  this.charService.getCharacterOptions().subscribe({
    next: (options) => {
      this.availableRaces = options.races ?? [];
      // ... other assignments ...
      this.loadingOverlay.hide();
      this.cdr.detectChanges(); // forces DOM sync after async options are set
    },
  });
}
```

This only applies to `<select [(ngModel)]>` with async options. Checkbox lists (`@for` + `input[type=checkbox]`) are not affected.

### 7. Verify the frontend build

Run `npm start` from `dungeon-companion-web/` (or the running dev server will reload). Fix any TypeScript template errors before finishing.

### 8. Report to the user

Tell the user:
- Which files were changed in the API and frontend
- The new field name added to `CharacterOptions`
- The curl to test the updated endpoint:
```
curl http://localhost:3000/api/character-options
```
