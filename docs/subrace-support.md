# Suporte a Sub-raças na Criação de Personagem

## Situação atual

O backend já tem **metade do suporte implementado**:

- `SUBRACES` em `rules.ts` tem 8 sub-raças mapeadas por slug
- `CharacterInput.core_build.subrace?: string` já existe no tipo
- `resolveSubrace()` já busca e aplica os bônus/traços da sub-raça no cálculo da ficha
- **O problema**: a sub-raça nunca é persistida no banco (sem coluna na tabela `character`), e o endpoint `/api/character-options` não expõe quais sub-raças existem para cada raça — o frontend não sabe o que oferecer ao usuário

---

## Mapeamento raça → sub-raças (regras D&D 5e)

| id_race | Raça     | Sub-raças disponíveis                        | Obrigatório? |
|---------|----------|----------------------------------------------|--------------|
| 1       | Anão     | Anão da Colina, Anão da Montanha             | Sim          |
| 2       | Elfo     | Alto Elfo, Elfo da Floresta                  | Sim          |
| 3       | Halfling | Halfling Pés-Leves, Halfling Robusto         | Sim          |
| 5       | Gnomo    | Gnomo das Rochas, Gnomo das Florestas        | Sim          |
| 4, 6–9  | demais   | —                                            | Não          |

---

## Alterações necessárias

### 1. Banco de dados (migração)

Apenas uma coluna nova na tabela `character`:

```sql
ALTER TABLE character ADD COLUMN IF NOT EXISTS subrace VARCHAR(100);
```

Não vale criar uma tabela `subrace` no banco porque as sub-raças são regras hardcoded em `rules.ts`, igual às classes e antecedentes — mantém a consistência da arquitetura.

---

### 2. `src/services/character-sheet/rules.ts`

**a) Adicionar `displayName` ao `SubraceRule`** e atualizar os dados:

```typescript
export interface SubraceRule {
  displayName: string;   // ← novo
  bonuses: Partial<Record<StatKeyEn, number>>;
  traits: Trait[];
  weaponProficiencies?: string[];
}

export const SUBRACES: Record<string, SubraceRule> = {
  'anao-da-colina':       { displayName: 'Anão da Colina',       bonuses: {WIS: 1}, ... },
  'anao-da-montanha':     { displayName: 'Anão da Montanha',     bonuses: {STR: 2}, ... },
  'alto-elfo':            { displayName: 'Alto Elfo',            bonuses: {INT: 1}, ... },
  'elfo-da-floresta':     { displayName: 'Elfo da Floresta',     bonuses: {WIS: 1}, ... },
  'halfling-pes-leves':   { displayName: 'Halfling Pés-Leves',   bonuses: {CHA: 1}, ... },
  'halfling-robusto':     { displayName: 'Halfling Robusto',     bonuses: {CON: 1}, ... },
  'gnomo-das-rochas':     { displayName: 'Gnomo das Rochas',     bonuses: {CON: 1}, ... },
  'gnomo-das-florestas':  { displayName: 'Gnomo das Florestas',  bonuses: {DEX: 1}, ... },
};
```

**b) Adicionar `subraces?: string[]` ao `RaceRule`** e vincular nas raças:

```typescript
export interface RaceRule {
  // ...campos existentes...
  subraces?: string[];  // ← novo: chaves do SUBRACES
}

export const RACES: Record<number, RaceRule> = {
  1: { subraces: ['anao-da-colina', 'anao-da-montanha'], ... },
  2: { subraces: ['alto-elfo', 'elfo-da-floresta'], ... },
  3: { subraces: ['halfling-pes-leves', 'halfling-robusto'], ... },
  5: { subraces: ['gnomo-das-rochas', 'gnomo-das-florestas'], ... },
  // demais sem subraces
};
```

---

### 3. `src/models/character-options-types.ts`

Adicionar interface `Subrace` e enriquecer `Race`:

```typescript
export interface Subrace {
  key: string;   // slug (ex: 'anao-da-colina') — é o valor que vai em core_build.subrace
  name: string;  // display (ex: 'Anão da Colina')
}

export interface Race {
  id_race: number;
  name: string;
  movement: string;
  subraces: Subrace[];  // ← novo: array vazio se a raça não tem sub-raças
}
```

---

### 4. `src/services/character-options.service.ts`

Após buscar as raças do banco, enriquecer com os dados de `rules.ts`:

```typescript
const races = (await this.repository.getRaces()).map(r => {
  const rule = RACES[r.id_race];
  const subraces = (rule?.subraces ?? []).map(key => ({
    key,
    name: SUBRACES[key].displayName,
  }));
  return { ...r, subraces };
});
```

---

### 5. `src/repositories/character.repository.ts`

**a) INSERT em `createCharacter`** — incluir a coluna `subrace`:

```typescript
INSERT INTO character (
  ..., subrace, ...
) VALUES (
  ..., ${core_build.subrace ?? null}, ...
)
```

**b) SELECT em `findCharacterById`** — retornar a coluna:

```typescript
SELECT c.id_character, ..., c.subrace, ...
FROM character c ...
```

---

### 6. `src/services/character-sheet.service.ts` — validação

Ao criar personagem, validar que a sub-raça foi informada quando obrigatória:

```typescript
const raceRule = resolveRace(core_build.id_race);
if (raceRule.subraces?.length && !core_build.subrace) {
  throw new HttpErrors.UnprocessableEntity('Esta raça requer seleção de sub-raça');
}
if (core_build.subrace && !raceRule.subraces?.includes(normalizeKey(core_build.subrace))) {
  throw new HttpErrors.UnprocessableEntity('Sub-raça inválida para a raça selecionada');
}
```

---

## Instruções para o frontend

### Contrato novo do `GET /api/character-options`

O campo `races` passa a incluir um array `subraces` em cada raça:

```json
{
  "races": [
    {
      "id_race": 1,
      "name": "Anão",
      "movement": "7,5m",
      "subraces": [
        { "key": "anao-da-colina",   "name": "Anão da Colina" },
        { "key": "anao-da-montanha", "name": "Anão da Montanha" }
      ]
    },
    {
      "id_race": 2,
      "name": "Elfo",
      "movement": "9m",
      "subraces": [
        { "key": "alto-elfo",        "name": "Alto Elfo" },
        { "key": "elfo-da-floresta", "name": "Elfo da Floresta" }
      ]
    },
    {
      "id_race": 3,
      "name": "Halfling",
      "movement": "7,5m",
      "subraces": [
        { "key": "halfling-pes-leves", "name": "Halfling Pés-Leves" },
        { "key": "halfling-robusto",   "name": "Halfling Robusto" }
      ]
    },
    {
      "id_race": 5,
      "name": "Gnomo",
      "movement": "7,5m",
      "subraces": [
        { "key": "gnomo-das-rochas",    "name": "Gnomo das Rochas" },
        { "key": "gnomo-das-florestas", "name": "Gnomo das Florestas" }
      ]
    },
    {
      "id_race": 9,
      "name": "Humano",
      "movement": "9m",
      "subraces": []
    }
  ]
}
```

### Mudanças no formulário de criação

- Quando o usuário selecionar uma raça, verificar se `race.subraces.length > 0`
- Se sim, exibir um seletor de sub-raça (campo obrigatório para prosseguir)
- Se não, ocultar o seletor
- Ao redefinir a raça, limpar a sub-raça selecionada
- Enviar no body do `POST /api/character-sheet`: `core_build.subrace = <key selecionado>` (ex: `"anao-da-colina"`)
- Para raças sem sub-raça, omitir o campo ou enviar `null`

**Raças com sub-raça obrigatória:** Anão (1), Elfo (2), Halfling (3), Gnomo (5)
