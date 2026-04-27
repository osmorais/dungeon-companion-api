---
name: create-repository
description: Create a new LoopBack 4 repository class for the dungeon-companion-api and wire it into the service layer. Use this whenever a service needs a dedicated data-access layer, a new domain needs DB queries, or you want to separate SQL from business logic following the repository pattern established in CharacterOptionsRepository.
---

Create a new repository file for the dungeon-companion-api following the project's established pattern.

## What to ask the user

If not already clear from context, ask:
1. **Domain name** — e.g. "character-options", "monster", "campaign" (used for the file and class names)
2. **Queries needed** — what data does it fetch? (e.g. "find all races", "find skills by attribute")
3. **Which service will use it** — so you can wire the injection correctly

Then carry out all steps below without further interruption.

---

## Step 1 — Create the repository file

Path: `dungeon-companion-api/src/repositories/<domain>.repository.ts`

```typescript
import {inject, injectable, BindingScope} from '@loopback/core';
import {PostgresDatasource} from '../../datasources';
import {SomeType} from './types';

@injectable({scope: BindingScope.TRANSIENT})
export class <Domain>Repository {
  constructor(
    @inject('db.Postgres')
    private db: PostgresDatasource,
  ) {}

  async findXxx(): Promise<SomeType[]> {
    return this.db.sql<SomeType[]>`SELECT ... FROM ...`;
  }
}
```

Rules:
- One method per logical query — never combine unrelated queries in one method.
- Method names use the `find` prefix (e.g. `findAttributes`, `findSkillsByAttribute`).
- Return types come from `types.ts` in the same directory. Add new types there if needed — never inline them.
- Only the datasource is injected here. No business logic, no WEAPONS/rules imports — that belongs in the service.
- The `@inject('db.Postgres')` key is the binding registered in `application.ts` via `this.bind('db.Postgres')`.

---

## Step 2 — Register the repository in application.ts

Open `dungeon-companion-api/src/application.ts` and:

1. Add the import at the top:
   ```typescript
   import {<Domain>Repository} from './services/<domain>/<domain>.repository';
   ```

2. Register it with `this.service()` — use the class name only, no second argument:
   ```typescript
   this.service(<Domain>Repository);
   ```
   Place this line **before** the service that depends on it.

> **Why no second argument?** Passing a string like `'services.Foo'` to `this.service()` sets it as the binding `name`, and LoopBack then prepends the `services` namespace, producing `services.services.Foo`. Omitting the second argument lets LoopBack derive the key as `services.<ClassName>` from the class name — which is what `@service()` resolves against.

---

## Step 3 — Inject the repository into the service

In the service that owns this domain (e.g. `character-options.service.ts`):

1. Replace the direct `PostgresDatasource` injection with the repository:
   ```typescript
   import {injectable, BindingScope, service} from '@loopback/core';
   import {<Domain>Repository} from './<domain>/<domain>.repository';

   @injectable({scope: BindingScope.TRANSIENT})
   export class <Domain>Service {
     constructor(
       @service(<Domain>Repository)
       private repository: <Domain>Repository,
     ) {}
   ```

2. Replace any `this.db.sql<...>` calls in the service with repository method calls:
   ```typescript
   const items = await this.repository.findXxx();
   ```

> **Why `@service()` instead of `@inject('services.X')`?** `@service(ClassName)` resolves by the class reference — it's immune to the key-naming issue described above and is the idiomatic LoopBack 4 pattern for service-to-service injection.

---

## Step 4 — Build and verify

```bash
cd dungeon-companion-api && npm run build
```

Fix any TypeScript errors before finishing. Common issues:
- Missing type imports in the repository (add to `types.ts`)
- Forgetting the `@service` import from `@loopback/core`
- Service importing `@inject` but no longer needing it (clean up unused imports)

---

## Reference — existing implementation

The canonical example in this project is `CharacterOptionsRepository`:

| File | Role |
|---|---|
| `src/services/character-options/character-options.repository.ts` | Repository with `findAttributes()` and `findSkills()` |
| `src/services/character-options/types.ts` | `AttributeType`, `Skill`, `WeaponOption`, `CharacterOptions` |
| `src/services/character-options.service.ts` | Service injecting the repository via `@service()` |
| `src/application.ts` | `this.service(CharacterOptionsRepository)` registered before the service |
| `../../docs/database/database.sql` | Have the database structure of all tables |
