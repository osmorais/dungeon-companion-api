/* eslint-disable @typescript-eslint/naming-convention */
import {isDeepStrictEqual} from 'util';
import {
  createStubInstance,
  expect,
  sinon,
  StubbedInstanceWithSinonAccessor,
} from '@loopback/testlab';
import {CharacterSheetService} from '../../../services/character-sheet.service';
import {CharacterRepository} from '../../../repositories/character.repository';
import {GameSessionRepository} from '../../../repositories/game-session.repository';
import {CharacterOptionsRepository} from '../../../repositories/character-options.repository';
import {CombatRepository} from '../../../repositories/combat.repository';
import {SupabaseStorageService} from '../../../services/supabase-storage.service';
import {ImageCleanupService} from '../../../services/image-cleanup.service';
import {
  BACKGROUNDS,
  CLASSES,
  RACES,
  SUBCLASSES,
  SUBRACES,
} from '../../../services/character-sheet/rules';
import {
  getMod,
  normalizeKey,
} from '../../../services/character-sheet/calculator';
import {
  CharacterInput,
  CharacterRawData,
  CharacterSheet,
  CharacterSkillInsert,
  StatKeyEn,
} from '../../../models/character-sheet-types';
import {Spell} from '../../../models/character-options-types';
import {
  armour,
  characterInput,
  DB_SKILLS,
  dbSkill,
  persistedFromCreation,
  spell,
  SPELL_LEVELS,
  weapon,
} from '../fixtures';

/**
 * Criação de personagem de ponta a ponta, sem banco: o payload que o wizard manda passa por
 * `createCharacter`, o que seria gravado (`persistedFromCreation`, espelho dos INSERTs do
 * repositório) volta por `loadCharacter`, e a ficha carregada é conferida contra as escolhas
 * feitas e contra a ficha calculada no momento da criação (`build`).
 */
describe('Criação de personagem → ficha gravada', () => {
  let repository: StubbedInstanceWithSinonAccessor<CharacterRepository>;
  let optionsRepository: StubbedInstanceWithSinonAccessor<CharacterOptionsRepository>;
  let service: CharacterSheetService;
  let persistedSkills: CharacterSkillInsert[];
  let persisted: CharacterRawData;

  beforeEach(() => {
    repository = createStubInstance(CharacterRepository);
    optionsRepository = createStubInstance(CharacterOptionsRepository);
    const gameSessionRepository = createStubInstance(GameSessionRepository);
    const combatRepository = createStubInstance(CombatRepository);
    repository.stubs.findAllSkills.resolves(DB_SKILLS);
    repository.stubs.findChosenFeats.resolves([]);
    repository.stubs.createCharacter.callsFake(
      async (input, sheet, skills, userId) => {
        persistedSkills = skills;
        persisted = persistedFromCreation(input, sheet, skills, userId);
        repository.stubs.findCharacterById.resolves(persisted);
        return 1;
      },
    );
    optionsRepository.stubs.findSpellsByIdsUpToLevel.resolves([]);
    optionsRepository.stubs.findSpellLevelsByIds.callsFake(async ids =>
      ids.map(id => ({id_spell: id, spell_level: SPELL_LEVELS.get(id) ?? 0})),
    );
    combatRepository.stubs.isCharacterInActiveCombat.resolves(false);
    service = new CharacterSheetService(
      repository,
      gameSessionRepository,
      optionsRepository,
      createStubInstance(SupabaseStorageService),
      combatRepository,
      createStubInstance(ImageCleanupService),
    );
  });

  afterEach(() => sinon.restore());

  async function createAndLoad(input: CharacterInput) {
    const built = service.build(input).character_sheet;
    const loaded = (await service.createCharacter(input, 'owner'))!
      .character_sheet;
    return {built, loaded};
  }

  // -------------------------------------------------------------------------
  // Payload no formato do wizard (dungeon-companion-web/character-wizard)
  // -------------------------------------------------------------------------

  /** Cópia de `CLASS_SKILL_RULES` do web: quantas perícias a classe escolhe e de qual lista (vazia = qualquer). */
  const CLASS_SKILL_CHOICES: Record<number, {count: number; from: number[]}> = {
    1: {count: 2, from: [1, 10, 17, 8, 13, 14]},
    2: {count: 3, from: []},
    3: {count: 2, from: [5, 16, 6, 17, 7, 8, 9]},
    4: {count: 2, from: [6, 11, 12, 18, 9]},
    5: {count: 2, from: [5, 10, 11, 12, 8, 13, 9, 14]},
    6: {count: 2, from: [5, 16, 11, 17, 18, 9]},
    7: {count: 2, from: [2, 10, 1, 6, 11, 17, 13, 14]},
    8: {count: 4, from: [2, 1, 16, 11, 17, 7, 13, 15, 18, 4, 3]},
    9: {count: 2, from: [5, 6, 11, 7, 12, 9]},
    10: {count: 2, from: [2, 1, 6, 11, 9, 3]},
    11: {count: 2, from: [1, 11, 17, 12, 18, 9]},
    12: {count: 3, from: [10, 1, 11, 7, 8, 13, 3, 14]},
  };
  /** Cópia de `RACE_SKILL_RULES` do web: Elfo ganha Percepção, Meio-Orc Intimidação, Meio-Elfo escolhe 2 livres. */
  const RACE_GRANTED_SKILLS: Record<number, number[]> = {2: [13], 7: [17]};
  const RACE_EXTRA_SKILL_CHOICES: Record<number, number> = {6: 2};
  /** Truque racial que o wizard injeta em `choices.spells` (Alto Elfo escolhe um truque de mago). */
  const RACIAL_CANTRIP: Record<string, Spell> = {
    'alto-elfo': spell(902, 'Raio de Gelo', 0),
    'gnomo-das-florestas': spell(901, 'Ilusão Menor', 0),
    tiefling: spell(900, 'Taumaturgia', 0),
  };
  /** id_skill de cada perícia do antecedente (`BackgroundRule.skills`). */
  const SKILL_ID_BY_KEY: Record<string, number> = {
    athletics: 1,
    acrobatics: 2,
    stealth: 3,
    sleight_of_hand: 4,
    arcana: 5,
    history: 6,
    investigation: 7,
    nature: 8,
    religion: 9,
    animal_handling: 10,
    insight: 11,
    medicine: 12,
    perception: 13,
    survival: 14,
    performance: 15,
    deception: 16,
    intimidation: 17,
    persuasion: 18,
  };

  const RACE_VARIANTS: {id_race: number; subrace?: string}[] = Object.values(
    RACES,
  ).flatMap(r =>
    r.subraces?.length
      ? r.subraces.map(subrace => ({id_race: r.id_race, subrace}))
      : [{id_race: r.id_race}],
  );
  const CLASS_VARIANTS: {id_class: number; id_subclass?: string}[] =
    Object.values(CLASSES).flatMap(c =>
      [3, 4, 6].includes(c.id_class)
        ? SUBCLASSES[c.id_class].map(s => ({
            id_class: c.id_class,
            id_subclass: s.id_subclass,
          }))
        : [{id_class: c.id_class}],
    );
  const SPELLCASTERS_WITH_CREATION_SPELLS = [2, 3, 4, 5, 6, 9];
  const KNOWS_LEVELED_SPELLS_AT_CREATION = [2, 3, 6, 9];

  function wizardPayload(opts: {
    id_race: number;
    subrace?: string;
    id_class: number;
    id_subclass?: string;
    id_background: number;
  }): CharacterInput {
    const granted = RACE_GRANTED_SKILLS[opts.id_race] ?? [];
    const classRule = CLASS_SKILL_CHOICES[opts.id_class];
    const pool = (
      classRule.from.length ? classRule.from : DB_SKILLS.map(s => s.id_skill)
    ).filter(id => !granted.includes(id));
    const chosen = pool.slice(0, classRule.count);
    const extra = DB_SKILLS.map(s => s.id_skill)
      .filter(id => !granted.includes(id) && !chosen.includes(id))
      .slice(0, RACE_EXTRA_SKILL_CHOICES[opts.id_race] ?? 0);
    const skillIds = [...granted, ...chosen, ...extra];

    const spells: Spell[] = [];
    const cantripKey =
      opts.subrace ?? normalizeKey(RACES[opts.id_race].displayName);
    if (RACIAL_CANTRIP[cantripKey]) spells.push(RACIAL_CANTRIP[cantripKey]);
    if (SPELLCASTERS_WITH_CREATION_SPELLS.includes(opts.id_class)) {
      spells.push(spell(10, 'Truque da Classe', 0));
    }
    if (KNOWS_LEVELED_SPELLS_AT_CREATION.includes(opts.id_class)) {
      spells.push(spell(20, 'Magia de 1º Círculo', 1));
    }

    let expertise: number[] | undefined;
    if (opts.id_class === 8) expertise = chosen.slice(0, 2);
    if (opts.id_subclass === 'conhecimento') expertise = [5, 6];

    const race = RACES[opts.id_race];
    const bg = BACKGROUNDS[opts.id_background];
    return {
      core_build: {
        level: 1,
        id_race: opts.id_race,
        race: race.displayName,
        subrace: opts.subrace,
        id_class: opts.id_class,
        class: CLASSES[opts.id_class].displayName,
        id_subclass: opts.id_subclass,
        id_background: opts.id_background,
        background: bg.displayName,
      },
      attributes: {
        generation_method: 'standard_array',
        base_values: {FOR: 15, DES: 14, CON: 13, INT: 12, SAB: 10, CAR: 8},
      },
      choices: {
        skills: skillIds.map(dbSkill),
        spells,
        expertise_skill_ids: expertise,
        tool_proficiency: race.toolProficiencyChoice?.options[0],
        fighting_style: opts.id_class === 7 ? 'Defesa' : undefined,
        ability_bonus_choices: opts.id_race === 6 ? ['STR', 'DEX'] : undefined,
      },
      equipment: {
        armour: null,
        weapons: [weapon('Adaga', 'Acuidade, Leve, Arremesso')],
        has_shield: false,
        starting_gold: 40,
      },
      character_details: {
        name: 'Teste',
        id_alignment: 5,
        alignment: 'Neutro (N)',
      },
    };
  }

  // -------------------------------------------------------------------------
  describe('todas as combinações de raça × classe/subclasse × antecedente', () => {
    type Sheet = CharacterSheet['character_sheet'];

    /** Campos que a ficha carregada recalcula e que precisam bater com o que foi calculado na criação. */
    function divergences(built: Sheet, loaded: Sheet): string[] {
      const out: string[] = [];
      const same = (field: string, a: unknown, b: unknown) => {
        if (!isDeepStrictEqual(a, b)) {
          out.push(
            `${field}: criação=${JSON.stringify(a)} carregada=${JSON.stringify(b)}`,
          );
        }
      };
      same('header', built.header, loaded.header);
      same('combat_stats', built.combat_stats, loaded.combat_stats);
      same(
        'attributes_and_saves',
        built.attributes_and_saves,
        loaded.attributes_and_saves,
      );
      same('weapons', built.weapons, loaded.weapons);
      same(
        'features_and_traits',
        built.features_and_traits,
        loaded.features_and_traits,
      );
      same(
        'proficiencies_and_languages',
        built.proficiencies_and_languages,
        loaded.proficiencies_and_languages,
      );
      same('equipment', built.equipment, loaded.equipment);
      same(
        'resource_trackers',
        built.resource_trackers,
        loaded.resource_trackers,
      );
      same('class_abilities', built.class_abilities, loaded.class_abilities);
      same('class_resources', built.class_resources, loaded.class_resources);
      same('avatar_preset', built.avatar_preset, loaded.avatar_preset);
      // A lista de magias carregada é diferente de propósito pra Clérigo/Druida/Paladino (lista
      // cheia da classe); as magias escolhidas são conferidas em `choiceMismatches`.
      same(
        'spellcasting_info',
        built.spellcasting_info && {
          ...built.spellcasting_info,
          spells_known: null,
        },
        loaded.spellcasting_info && {
          ...loaded.spellcasting_info,
          spells_known: null,
        },
      );
      return out;
    }

    /** A ficha carregada reflete cada escolha feita no wizard. */
    function choiceMismatches(input: CharacterInput, loaded: Sheet): string[] {
      const out: string[] = [];
      const check = (ok: boolean, msg: string) => {
        if (!ok) out.push(msg);
      };
      const {core_build: cb, choices} = input;
      const raceRule = RACES[cb.id_race];
      const subraceRule = cb.subrace
        ? SUBRACES[normalizeKey(cb.subrace)]
        : null;
      const classRule = CLASSES[cb.id_class];
      const subclassRule = cb.id_subclass
        ? SUBCLASSES[cb.id_class].find(s => s.id_subclass === cb.id_subclass)!
        : null;
      const bgRule = BACKGROUNDS[cb.id_background];

      // Cabeçalho
      check(
        loaded.header.race ===
          (subraceRule?.displayName ?? raceRule.displayName),
        `raça exibida: ${loaded.header.race}`,
      );
      check(
        loaded.header.background === bgRule.displayName,
        `antecedente exibido: ${loaded.header.background}`,
      );
      check(
        loaded.header.class_and_level ===
          (subclassRule
            ? `${classRule.displayName} (${subclassRule.displayName}) 1`
            : `${classRule.displayName} 1`),
        `classe exibida: ${loaded.header.class_and_level}`,
      );
      check(loaded.header.name === 'Teste', 'nome');
      check(loaded.header.alignment === 'Neutro (N)', 'tendência');

      // Atributos = base + raça + sub-raça, salvaguardas da classe
      const base: Record<StatKeyEn, number> = {
        STR: 15,
        DEX: 14,
        CON: 13,
        INT: 12,
        WIS: 10,
        CHA: 8,
      };
      for (const stat of Object.keys(base) as StatKeyEn[]) {
        const expected =
          base[stat] +
          (raceRule.bonuses[stat] ?? 0) +
          (subraceRule?.bonuses[stat] ?? 0) +
          (choices.ability_bonus_choices?.includes(stat) ? 1 : 0);
        const block = loaded.attributes_and_saves[stat];
        check(
          block.score === expected,
          `${stat}: ${block.score} (esperado ${expected})`,
        );
        check(block.modifier === getMod(expected), `modificador de ${stat}`);
        check(
          block.save_proficiency === classRule.savingThrows.includes(stat),
          `proficiência em salvaguarda de ${stat}`,
        );
      }
      const conMod = loaded.attributes_and_saves.CON.modifier;
      const hpBonus =
        (subraceRule?.hpBonusPerLevel ?? 0) +
        (cb.id_subclass === 'linhagem-draconica' ? 1 : 0);
      check(
        loaded.combat_stats.hit_points.max ===
          classRule.hitDie + conMod + hpBonus,
        `PV máximo: ${loaded.combat_stats.hit_points.max}`,
      );
      check(
        loaded.combat_stats.hit_dice === `1d${classRule.hitDie}`,
        'dado de vida',
      );
      check(
        loaded.combat_stats.speed ===
          (subraceRule?.speedOverride ?? raceRule.speed),
        `deslocamento: ${loaded.combat_stats.speed}`,
      );

      // Perícias escolhidas (inclui as da raça que o wizard já manda) e especialização
      const trained = new Set(
        loaded.skills.filter(s => s.is_trained).map(s => s.id_skill),
      );
      for (const s of choices.skills)
        check(
          trained.has(s.id_skill),
          `perícia escolhida ${s.name} não ficou treinada`,
        );
      for (const key of bgRule.skills)
        check(
          trained.has(SKILL_ID_BY_KEY[key]),
          `perícia do antecedente ${key} não ficou treinada`,
        );
      const expert = loaded.skills
        .filter(s => s.is_expert)
        .map(s => s.id_skill)
        .sort();
      check(
        isDeepStrictEqual(
          expert,
          [...(choices.expertise_skill_ids ?? [])].sort(),
        ),
        `especialização: ${JSON.stringify(expert)}`,
      );
      const prof = loaded.combat_stats.proficiency_bonus;
      for (const s of loaded.skills) {
        const mod =
          loaded.attributes_and_saves[
            (
              {
                FOR: 'STR',
                DES: 'DEX',
                INT: 'INT',
                SAB: 'WIS',
                CAR: 'CHA',
              } as Record<string, StatKeyEn>
            )[s.attribute_name]
          ].modifier;
        const expected =
          mod + (s.is_trained ? prof : 0) + (s.is_expert ? prof : 0);
        check(
          s.total_skill_value === expected,
          `bônus de ${s.name}: ${s.total_skill_value} (esperado ${expected})`,
        );
      }

      // Proficiências, idiomas, ferramenta escolhida
      const profs = loaded.proficiencies_and_languages;
      for (const a of subraceRule?.armorProficiencies ?? [])
        check(profs.armor.includes(a), `armadura da sub-raça ${a}`);
      for (const w of [
        ...(raceRule.weaponProficiencies ?? []),
        ...(subraceRule?.weaponProficiencies ?? []),
      ]) {
        check(profs.weapons.includes(w), `arma da raça ${w}`);
      }
      for (const t of [
        ...bgRule.tools,
        ...(subraceRule?.toolProficiencies ?? []),
      ])
        check(profs.tools.includes(t), `ferramenta ${t}`);
      if (choices.tool_proficiency)
        check(
          profs.tools.includes(choices.tool_proficiency),
          'ferramenta escolhida',
        );
      for (const l of raceRule.languages)
        check(profs.languages.includes(l), `idioma ${l}`);
      check(
        profs.languages.filter(l => l.startsWith('Idioma à escolha')).length ===
          bgRule.languages,
        'idiomas à escolha do antecedente',
      );

      // Traços: raça, sub-raça, classe, subclasse (nível 1), antecedente, estilo de luta
      const traitNames = loaded.features_and_traits.map(t => t.name);
      for (const t of [
        ...raceRule.traits,
        ...(subraceRule?.traits ?? []),
        ...classRule.traits,
        ...(subclassRule?.featuresByLevel[1]?.features ?? []),
        bgRule.feature,
      ]) {
        check(traitNames.includes(t.name), `traço ${t.name}`);
      }
      if (choices.fighting_style) {
        check(
          loaded.features_and_traits.some(t =>
            t.description.startsWith(`Escolhido: ${choices.fighting_style}.`),
          ),
          'estilo de luta escolhido no traço',
        );
      }

      // Magias escolhidas (truque racial + da classe) continuam na ficha
      const loadedSpellIds = new Set(loaded.spells.map(s => s.id_spell));
      for (const s of choices.spells ?? []) {
        if (
          s.spellLevel === 0 ||
          !CLASSES[cb.id_class].preparesSpells ||
          cb.id_class === 9
        ) {
          check(loadedSpellIds.has(s.id_spell), `magia ${s.name} sumiu`);
        }
      }
      if (classRule.isSpellcaster) {
        const ability = classRule.spellcastingAbility!;
        const mod = loaded.attributes_and_saves[ability].modifier;
        check(
          loaded.spellcasting_info?.spellcasting_ability === ability,
          'atributo de conjuração',
        );
        check(
          loaded.spellcasting_info?.spell_save_dc === 8 + prof + mod,
          'CD de magia',
        );
        check(
          loaded.spellcasting_info?.spell_attack_bonus === prof + mod,
          'ataque de magia',
        );
      } else {
        check(
          loaded.spellcasting_info === undefined,
          'não conjurador sem bloco de conjuração',
        );
      }

      // Dinheiro e armas
      check(
        loaded.equipment.currency.gp === 40 + bgRule.startingGold,
        `ouro: ${loaded.equipment.currency.gp}`,
      );
      check(loaded.weapons.map(w => w.name).join() === 'Adaga', 'armas');
      return out;
    }

    for (const cls of CLASS_VARIANTS) {
      const label = `${CLASSES[cls.id_class].displayName}${cls.id_subclass ? ` (${cls.id_subclass})` : ''}`;
      it(`${label}: com cada raça/sub-raça e antecedente`, async () => {
        const problems: string[] = [];
        for (const race of RACE_VARIANTS) {
          for (const id_background of Object.keys(BACKGROUNDS).map(Number)) {
            const input = wizardPayload({...race, ...cls, id_background});
            const {built, loaded} = await createAndLoad(input);
            const combo = `${race.subrace ?? RACES[race.id_race].displayName} / ${BACKGROUNDS[id_background].displayName}`;
            for (const p of [
              ...divergences(built, loaded),
              ...choiceMismatches(input, loaded),
            ]) {
              problems.push(`${combo} → ${p}`);
            }
          }
        }
        expect(problems.slice(0, 10)).to.eql([]);
      }).timeout(20000);
    }

    // Regressão: o wizard não manda as perícias do antecedente em `choices.skills`, e antes da
    // correção elas não eram gravadas como treinadas (Soldado sem Atletismo/Intimidação,
    // Marinheiro com percepção passiva menor depois de gravar).
    it('perícias do antecedente ficam treinadas e a percepção passiva bate com a criação', async () => {
      const problems: string[] = [];
      for (const id_background of Object.keys(BACKGROUNDS).map(Number)) {
        const input = wizardPayload({id_race: 9, id_class: 7, id_background});
        const {built, loaded} = await createAndLoad(input);
        const trained = new Set(
          loaded.skills.filter(s => s.is_trained).map(s => s.id_skill),
        );
        for (const key of BACKGROUNDS[id_background].skills) {
          if (!trained.has(SKILL_ID_BY_KEY[key])) {
            problems.push(
              `${BACKGROUNDS[id_background].displayName}: ${key} não treinada`,
            );
          }
        }
        if (
          built.combat_stats.passive_perception !==
          loaded.combat_stats.passive_perception
        ) {
          problems.push(
            `${BACKGROUNDS[id_background].displayName}: percepção passiva ${built.combat_stats.passive_perception} → ${loaded.combat_stats.passive_perception}`,
          );
        }
      }
      expect(problems).to.eql([]);
    });

    it('percepção passiva bate com a criação quando a percepção vem da raça ou da classe', async () => {
      // Elfo (Percepção da raça, enviada pelo wizard) e Bárbaro (escolhe Percepção da lista)
      for (const input of [
        wizardPayload({
          id_race: 2,
          subrace: 'alto-elfo',
          id_class: 7,
          id_background: 13,
        }),
        wizardPayload({id_race: 9, id_class: 1, id_background: 1}),
      ]) {
        const {built, loaded} = await createAndLoad(input);
        expect(loaded.combat_stats.passive_perception).to.equal(
          built.combat_stats.passive_perception,
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  describe('escolhas específicas refletidas na ficha gravada', () => {
    it('cada Estilo de Luta do Guerreiro fica gravado e aparece no traço', async () => {
      for (const style of CLASSES[7].fightingStyleChoice!.options) {
        const {loaded} = await createAndLoad(
          characterInput({choices: {fighting_style: style}}),
        );
        const trait = loaded.features_and_traits.find(
          t => t.name === 'Estilo de Luta',
        );
        expect(trait?.description).to.startWith(`Escolhido: ${style}.`);
        expect(persisted.character.chosen_fighting_style).to.equal(style);
      }
    });

    it('Defesa: +1 CA com armadura, nada sem armadura', async () => {
      const withArmour = await createAndLoad(
        characterInput({equipment: {armour: armour('Armadura Média', 14, 2)}}),
      );
      // DES 15 (+2): 14 + 2 + 1
      expect(withArmour.loaded.combat_stats.armor_class).to.equal(17);
      const without = await createAndLoad(characterInput());
      expect(without.loaded.combat_stats.armor_class).to.equal(12);
    });

    it('Arqueria: +2 no ataque à distância; Duelo: +2 no dano com uma única arma de uma mão', async () => {
      const bow = weapon('Arco Longo', 'Munição, Pesada, Duas Mãos');
      const sword = weapon('Espada Longa', 'Versátil');
      const archery = await createAndLoad(
        characterInput({
          choices: {fighting_style: 'Arqueria'},
          equipment: {weapons: [bow, sword]},
        }),
      );
      // FOR 16 (+3), DES 15 (+2), prof 2
      expect(
        archery.loaded.weapons.map(w => [
          w.name,
          w.attack_bonus,
          w.damage_modifier,
        ]),
      ).to.eql([
        ['Arco Longo', 2 + 2 + 2, 2],
        ['Espada Longa', 2 + 3, 3],
      ]);
      const dueling = await createAndLoad(
        characterInput({
          choices: {fighting_style: 'Duelo'},
          equipment: {weapons: [sword]},
        }),
      );
      expect(dueling.loaded.weapons[0]).to.containDeep({
        attack_bonus: 5,
        damage_modifier: 5,
      });
    });

    it('cada ferramenta de artesão do Anão fica gravada nas proficiências', async () => {
      for (const tool of RACES[1].toolProficiencyChoice!.options) {
        const {loaded} = await createAndLoad(
          characterInput({
            core_build: {id_race: 1, subrace: 'anao-da-montanha'},
            choices: {tool_proficiency: tool},
          }),
        );
        expect(loaded.proficiencies_and_languages.tools).to.containEql(tool);
        for (const other of RACES[1].toolProficiencyChoice!.options.filter(
          o => o !== tool,
        )) {
          expect(loaded.proficiencies_and_languages.tools).to.not.containEql(
            other,
          );
        }
      }
    });

    it('Ladino: Especialização dobra a proficiência só nas 2 perícias escolhidas', async () => {
      const input = characterInput({
        core_build: {id_class: 8},
        choices: {
          fighting_style: undefined,
          skills: [1, 2, 3, 16].map(dbSkill),
          expertise_skill_ids: [2, 3],
        },
      });
      const {loaded} = await createAndLoad(input);
      const byId = new Map(loaded.skills.map(s => [s.id_skill, s]));
      // DES 15 (+2), FOR 16 (+3), prof 2
      expect(byId.get(2)).to.containDeep({
        is_trained: true,
        is_expert: true,
        total_skill_value: 2 + 4,
      });
      expect(byId.get(3)).to.containDeep({
        is_trained: true,
        is_expert: true,
        total_skill_value: 2 + 4,
      });
      expect(byId.get(1)).to.containDeep({
        is_trained: true,
        is_expert: false,
        total_skill_value: 3 + 2,
      });
      expect(byId.get(4)).to.containDeep({
        is_trained: false,
        is_expert: false,
        total_skill_value: 2,
      });
    });

    it('Especialização inválida não grava nada', async () => {
      const rogue = (expertise: number[] | undefined, skills = [1, 2, 3, 16]) =>
        characterInput({
          core_build: {id_class: 8},
          choices: {
            fighting_style: undefined,
            skills: skills.map(dbSkill),
            expertise_skill_ids: expertise,
          },
        });
      await expect(
        service.createCharacter(rogue([2]), 'owner'),
      ).to.be.rejectedWith(/exactly 2/);
      await expect(
        service.createCharacter(rogue(undefined), 'owner'),
      ).to.be.rejectedWith(/exactly 2/);
      await expect(
        service.createCharacter(rogue([2, 2]), 'owner'),
      ).to.be.rejectedWith(/Duplicate/);
      await expect(
        service.createCharacter(rogue([2, 5]), 'owner'),
      ).to.be.rejectedWith(/already be trained/);
      await expect(
        service.createCharacter(
          characterInput({choices: {expertise_skill_ids: [1, 2]}}),
          'owner',
        ),
      ).to.be.rejectedWith(/not allowed/);
      expect(repository.stubs.createCharacter.called).to.be.false();
    });

    it('Clérigo do Conhecimento: Bênção do Conhecimento treina e dobra 2 perícias da lista', async () => {
      const cleric = (expertise: number[]) =>
        characterInput({
          core_build: {id_class: 4, id_subclass: 'conhecimento'},
          choices: {
            fighting_style: undefined,
            skills: [11, 12].map(dbSkill),
            expertise_skill_ids: expertise,
          },
        });
      const {loaded} = await createAndLoad(cleric([5, 8]));
      const byId = new Map(loaded.skills.map(s => [s.id_skill, s]));
      // INT 13 (+1), prof 2 — Arcanismo e Natureza não estavam entre as escolhidas
      expect(byId.get(5)).to.containDeep({
        is_trained: true,
        is_expert: true,
        total_skill_value: 1 + 4,
      });
      expect(byId.get(8)).to.containDeep({
        is_trained: true,
        is_expert: true,
        total_skill_value: 1 + 4,
      });
      expect(byId.get(6)).to.containDeep({is_trained: false, is_expert: false});
      await expect(
        service.createCharacter(cleric([5, 11]), 'owner'),
      ).to.be.rejectedWith(/not in allowed pool/);
    });

    it('armadura e escudo escolhidos: CA e equipamento gravados', async () => {
      const cases: [CharacterInput['equipment'], number][] = [
        [{armour: null, weapons: [], has_shield: false}, 12],
        [
          {armour: armour('Armadura Leve', 11), weapons: [], has_shield: false},
          11 + 2 + 1,
        ],
        [
          {
            armour: armour('Armadura Média', 15, 2),
            weapons: [],
            has_shield: true,
          },
          15 + 2 + 1 + 2,
        ],
        [
          {
            armour: armour('Armadura Pesada', 18),
            weapons: [],
            has_shield: true,
          },
          18 + 1 + 2,
        ],
      ];
      for (const [equipment, ac] of cases) {
        const {built, loaded} = await createAndLoad(
          characterInput({equipment}),
        );
        expect(loaded.combat_stats.armor_class).to.equal(ac);
        expect(built.combat_stats.armor_class).to.equal(ac);
        expect(loaded.equipment.has_shield).to.equal(equipment.has_shield);
        expect(loaded.equipment.equipped_armour?.armour_type ?? null).to.equal(
          equipment.armour?.armour_type ?? null,
        );
      }
    });

    it('Defesa sem Armadura (Bárbaro com CON, Monge com SAB) continua depois de gravar', async () => {
      const barbarian = await createAndLoad(
        characterInput({
          core_build: {id_class: 1},
          choices: {fighting_style: undefined},
        }),
      );
      expect(barbarian.loaded.combat_stats.armor_class).to.equal(10 + 2 + 2);
      const monk = await createAndLoad(
        characterInput({
          core_build: {id_class: 10},
          base_values: {FOR: 8, DES: 15, CON: 13, INT: 10, SAB: 14, CAR: 12},
          choices: {fighting_style: undefined},
        }),
      );
      // DES 16 (+3), SAB 15 (+2)
      expect(monk.loaded.combat_stats.armor_class).to.equal(10 + 3 + 2);
    });

    it('Mago: truques e magias de 1º círculo escolhidos aparecem por círculo', async () => {
      const {loaded} = await createAndLoad(
        characterInput({
          core_build: {id_class: 9},
          choices: {
            fighting_style: undefined,
            spells: [
              spell(1, 'Luz', 0),
              spell(2, 'Mãos Mágicas', 0),
              spell(3, 'Mísseis Mágicos', 1),
            ],
          },
        }),
      );
      expect(loaded.spellcasting_info?.spells_known).to.eql({
        cantrips: ['Luz', 'Mãos Mágicas'],
        level_1: ['Mísseis Mágicos'],
      });
      expect(loaded.spellcasting_info?.slots_total).to.eql({level_1: 2});
    });

    it('Clérigo: truques escolhidos ficam, magias de círculo vêm da lista da classe sem preparar', async () => {
      optionsRepository.stubs.findSpellsByIdsUpToLevel.resolves([
        spell(42, 'Bênção', 1),
      ]);
      const {loaded} = await createAndLoad(
        characterInput({
          core_build: {id_class: 4, id_subclass: 'vida'},
          choices: {
            fighting_style: undefined,
            spells: [spell(7, 'Chama Sagrada', 0)],
          },
        }),
      );
      expect(loaded.spells.map(s => [s.name, s.is_prepared ?? null])).to.eql([
        ['Chama Sagrada', false],
        ['Bênção', false],
      ]);
    });

    it('truque racial de classe não conjuradora fica na ficha sem bloco de conjuração', async () => {
      const {loaded} = await createAndLoad(
        characterInput({
          core_build: {id_race: 8},
          choices: {spells: [spell(900, 'Taumaturgia', 0)]},
        }),
      );
      expect(loaded.spells.map(s => s.name)).to.eql(['Taumaturgia']);
      expect(loaded.spellcasting_info).to.be.undefined();
    });

    it('avatar escolhido fica gravado', async () => {
      const avatar = {
        race: 'human',
        classKey: 'fighter',
        skinColor: '#c68642',
        hairStyle: 'short',
        hairColor: '#000',
        beardStyle: null,
        beardColor: null,
      };
      const {loaded} = await createAndLoad({
        ...characterInput(),
        avatar_preset: avatar,
      });
      expect(loaded.avatar_preset).to.eql(avatar);
    });

    it('sem nome, a ficha usa "Aventureiro"', async () => {
      const {loaded} = await createAndLoad({
        ...characterInput(),
        character_details: {id_alignment: 1},
      });
      expect(loaded.header.name).to.equal('Aventureiro');
    });
  });

  // -------------------------------------------------------------------------
  describe('validações antes de gravar', () => {
    it('raça com sub-raça exige uma sub-raça válida dela', async () => {
      const dwarf = (subrace?: string) =>
        characterInput({
          core_build: {id_race: 1, subrace},
          choices: {tool_proficiency: 'Ferramentas de Ferreiro'},
        });
      await expect(
        service.createCharacter(dwarf(), 'owner'),
      ).to.be.rejectedWith(/requer seleção de sub-raça/);
      await expect(
        service.createCharacter(dwarf('alto-elfo'), 'owner'),
      ).to.be.rejectedWith(/Sub-raça inválida/);
      await expect(
        service.createCharacter(
          characterInput({core_build: {subrace: 'alto-elfo'}}),
          'owner',
        ),
      ).to.be.rejectedWith(/Sub-raça inválida/);
      expect(repository.stubs.createCharacter.called).to.be.false();
    });

    it('sub-raça aceita tanto a chave quanto o nome de exibição', async () => {
      for (const subrace of ['anao-da-colina', 'Anão da Colina']) {
        const {loaded} = await createAndLoad(
          characterInput({
            core_build: {id_race: 1, subrace},
            choices: {tool_proficiency: 'Ferramentas de Ferreiro'},
          }),
        );
        expect(loaded.header.race).to.equal('Anão da Colina');
      }
    });

    it('raça, classe ou antecedente inexistentes', async () => {
      await expect(
        service.createCharacter(
          characterInput({core_build: {id_race: 99}}),
          'owner',
        ),
      ).to.be.rejectedWith(/raça não encontrado/);
      await expect(
        service.createCharacter(
          characterInput({core_build: {id_class: 99}}),
          'owner',
        ),
      ).to.be.rejectedWith(/classe não encontrado/);
      await expect(
        service.createCharacter(
          characterInput({core_build: {id_background: 99}}),
          'owner',
        ),
      ).to.be.rejectedWith(/antecedente não encontrado/);
    });

    it('subclasse inválida pra classe que escolhe no nível 1', async () => {
      for (const id_class of [3, 4, 6]) {
        await expect(
          service.createCharacter(
            characterInput({
              core_build: {id_class, id_subclass: 'vida-inventada'},
              choices: {fighting_style: undefined},
            }),
            'owner',
          ),
        ).to.be.rejectedWith(/Subclass choice required/);
      }
    });

    it('a ficha é gravada pro usuário que criou', async () => {
      await service.createCharacter(characterInput(), 'dono-da-ficha');
      expect(repository.stubs.createCharacter.firstCall.args[3]).to.equal(
        'dono-da-ficha',
      );
      expect(persistedSkills).to.have.length(DB_SKILLS.length);
    });
  });

  // -------------------------------------------------------------------------
  describe('validação das escolhas (payload fora das regras → 422)', () => {
    const rejects = async (input: CharacterInput, msg: RegExp) => {
      repository.stubs.createCharacter.resetHistory();
      const err = await service.createCharacter(input, 'owner').then(
        () => null,
        (e: {statusCode?: number; message: string}) => e,
      );
      expect(err?.statusCode).to.equal(422);
      expect(err!.message).to.match(msg);
      expect(repository.stubs.createCharacter.called).to.be.false();
    };

    it('Meio-Elfo: +1 nos dois atributos escolhidos; sem escolha é recusado', async () => {
      const halfElf = (ability_bonus_choices?: StatKeyEn[]) =>
        characterInput({
          core_build: {id_race: 6, race: 'Meio-Elfo'},
          choices: {ability_bonus_choices},
        });
      const {loaded} = await createAndLoad(halfElf(['STR', 'CON']));
      expect(loaded.attributes_and_saves.STR.score).to.equal(16);
      expect(loaded.attributes_and_saves.CON.score).to.equal(14);
      expect(loaded.attributes_and_saves.CHA.score).to.equal(10);
      await rejects(halfElf(undefined), /2 atributos diferentes/);
      await rejects(halfElf(['STR', 'CHA']), /inválido/);
    });

    it('perícias demais ou fora da lista da classe', async () => {
      // Guerreiro (2 da lista) com antecedente Soldado (Atletismo, Intimidação já concedidas)
      await rejects(
        characterInput({choices: {skills: [2, 6, 13].map(dbSkill)}}),
        /Perícias demais/,
      );
      await rejects(
        characterInput({choices: {skills: [5, 2].map(dbSkill)}}),
        /fora da lista/,
      );
      // As do antecedente não contam na cota
      await createAndLoad(
        characterInput({choices: {skills: [1, 17, 2, 6].map(dbSkill)}}),
      );
    });

    it('magias além da cota, acima do 1º círculo ou de classe que não conjura', async () => {
      const wizard = (spells: Spell[]) =>
        characterInput({
          core_build: {id_class: 9, class: 'Mago'},
          choices: {
            skills: [5, 6].map(dbSkill),
            spells,
            fighting_style: undefined,
          },
        });
      const cantrips = [1, 2, 3, 4].map(i => spell(950 + i, `Truque ${i}`, 0));
      await rejects(wizard(cantrips), /Truques demais/);
      await rejects(wizard([spell(960, 'Bola de Fogo', 3)]), /círculo/);
      await rejects(
        characterInput({choices: {spells: [spell(961, 'Raio de Fogo', 0)]}}),
        /Truques demais/,
      );
    });

    it('armadura/escudo sem proficiência; Anão da Montanha mago pode usar média', async () => {
      const wizard = (
        core: Partial<CharacterInput['core_build']>,
        equipment: Partial<CharacterInput['equipment']>,
        tool_proficiency?: string,
      ) =>
        characterInput({
          core_build: {id_class: 9, class: 'Mago', ...core},
          choices: {
            skills: [5, 6].map(dbSkill),
            fighting_style: undefined,
            tool_proficiency,
          },
          equipment,
        });
      await rejects(
        wizard({}, {armour: armour('Armadura Leve', 11)}),
        /Sem proficiência em Armadura Leve/,
      );
      await rejects(wizard({}, {has_shield: true}), /escudo/);
      await createAndLoad(
        wizard(
          {id_race: 1, race: 'Anão', subrace: 'anao-da-montanha'},
          {armour: armour('Armadura Média', 14, 2)},
          RACES[1].toolProficiencyChoice!.options[0],
        ),
      );
    });

    it('Clérigo da Vida pode usar armadura pesada; da Luz não', async () => {
      const cleric = (id_subclass: string) =>
        characterInput({
          core_build: {id_class: 4, class: 'Clérigo', id_subclass},
          choices: {skills: [11, 12].map(dbSkill), fighting_style: undefined},
          equipment: {armour: armour('Armadura Pesada', 16)},
        });
      await createAndLoad(cleric('vida'));
      await rejects(cleric('luz'), /Armadura Pesada/);
    });
  });
});
