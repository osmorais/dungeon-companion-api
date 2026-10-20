---
name: create-repository
description: Create a new LoopBack 4 repository class for the dungeon-companion-api and wire it into the service layer. Use this whenever a service needs a dedicated data-access layer, a new domain needs DB queries, or you want to separate SQL from business logic following the repository pattern used across src/repositories/.
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

Path: `src/repositories/<domain>.repository.ts`

```typescript
/* eslint-disable @typescript-eslint/naming-convention */
import {inject, injectable, BindingScope} from '@loopback/core';
import {PostgresDatasource} from '../datasources';
import {SomeType} from '../models/<domain>-types';

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
- Return types live in `src/models/<domain>-types.ts` (types only, no ORM models). Add new types there — never inline them.
- Only the datasource is injected here. No business logic, no rules imports — that belongs in the service.
- `db.Postgres` is bound in `application.ts` (`this.bind('db.Postgres')`).
- Database structure: `docs/database/database.sql`. A new table or column follows `.claude/rules/banco-de-dados.md`.

---

## Step 2 — Do NOT register it by hand

The boot component discovers every `src/repositories/*.repository.ts` automatically (`bootOptions.repositories` in `application.ts`). Do not add `this.repository(...)` or `this.service(...)` for it in `application.ts`.

> **Why:** a second registration creates a second binding for the same class, and `@service(Class)` then fails with "More than one bindings found". The few `this.repository(...)` / `this.service(..., 'services.X')` lines still in `application.ts` are legacy; leave them as they are. See the comment above `this.service(SessionSocketGateway)` and `~/projects/docs/dungeon-companion/gotchas.md` (API section).

---

## Step 3 — Inject the repository into the service

In the service that owns this domain (e.g. `src/services/spell-catalog.service.ts`):

```typescript
import {injectable, BindingScope, service} from '@loopback/core';
import {<Domain>Repository} from '../repositories/<domain>.repository';

@injectable({scope: BindingScope.TRANSIENT})
export class <Domain>Service {
  constructor(
    @service(<Domain>Repository)
    private repository: <Domain>Repository,
  ) {}
```

Replace any `this.db.sql<...>` calls in the service with repository method calls:
```typescript
const items = await this.repository.findXxx();
```

> **Why `@service()`?** It resolves by class reference and is the idiomatic LoopBack 4 pattern. The exception is the four services registered by hand in `application.ts` (`AiAgentService`, `CharacterSheetService`, `CharacterOptionsService`, `GameSessionService`): those are injected with `@inject('services.<ClassName>')`.

---

## Step 4 — Tests and build

- Service tests stub the repository with `createStubInstance` (never connect to Postgres) — see `.claude/rules/testes.md`.
- Run `npm run test:unit` and `npm run build`. Fix any TypeScript errors before finishing. Common issues:
  - Missing type imports (add to `src/models/<domain>-types.ts`)
  - Forgetting the `service` import from `@loopback/core`
  - Unused `@inject` import left in the service

---

## Reference — existing implementation

The canonical example is `SpellCatalogRepository`:

| File | Role |
|---|---|
| `src/repositories/spell-catalog.repository.ts` | Repository with `findPaged()` |
| `src/models/spell-catalog-types.ts` | `SpellCatalogEntry`, `SpellCatalogPagedList` |
| `src/services/spell-catalog.service.ts` | Service injecting the repository via `@service()` |
| `docs/database/database.sql` | Structure of all tables |
