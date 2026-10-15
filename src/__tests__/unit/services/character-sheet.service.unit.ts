/* eslint-disable @typescript-eslint/naming-convention */
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
import {XP_THRESHOLDS} from '../../../services/character-sheet/rules';
import {CharacterRawData} from '../../../models/character-sheet-types';
import {armour, characterInput, rawCharacter, skill, spell} from '../fixtures';

describe('CharacterSheetService', () => {
  let repository: StubbedInstanceWithSinonAccessor<CharacterRepository>;
  let gameSessionRepository: StubbedInstanceWithSinonAccessor<GameSessionRepository>;
  let optionsRepository: StubbedInstanceWithSinonAccessor<CharacterOptionsRepository>;
  let service: CharacterSheetService;

  beforeEach(() => {
    repository = createStubInstance(CharacterRepository);
    gameSessionRepository = createStubInstance(GameSessionRepository);
    optionsRepository = createStubInstance(CharacterOptionsRepository);
    gameSessionRepository.stubs.isDmOfCharacter.resolves(false);
    repository.stubs.findChosenFeats.resolves([]);
    repository.stubs.applyLevelUp.resolves({
      status: 'ok',
      updatedAttributes: {},
    });
    service = new CharacterSheetService(
      repository,
      gameSessionRepository,
      optionsRepository,
      createStubInstance(SupabaseStorageService),
      createStubInstance(CombatRepository),
    );
  });

  afterEach(() => sinon.restore());

  /** Personagem pronto pra subir do nível `level` pro seguinte (XP exato do próximo nível). */
  function givenCharacter(
    overrides: Parameters<typeof rawCharacter>[0] = {},
  ): CharacterRawData {
    const level = overrides.character?.level ?? 1;
    const raw = rawCharacter({
      ...overrides,
      character: {
        xp_points: XP_THRESHOLDS[Math.min(20, level + 1)],
        ...overrides.character,
      },
    });
    repository.stubs.findCharacterById.resolves(raw);
    return raw;
  }

  // -------------------------------------------------------------------------
  describe('build (criação de personagem)', () => {
    it('Humano Guerreiro nv1: PV, CA, proficiência, ouro, XP e recursos', () => {
      const sheet = service.build(characterInput()).character_sheet;
      expect(sheet.header).to.containDeep({
        class_and_level: 'Guerreiro 1',
        race: 'Humano',
        background: 'Soldado',
        next_level_xp: 300,
      });
      // CON 13+1 = 14 (+2) → 10 + 2; DES 14+1 = 15 (+2) → CA 12 (Defesa não vale sem armadura)
      expect(sheet.combat_stats).to.containDeep({
        proficiency_bonus: 2,
        armor_class: 12,
        initiative: 2,
        speed: '9m',
        hit_points: {max: 12, current: 12, temporary: 0},
        hit_dice: '1d10',
      });
      expect(sheet.attributes_and_saves.STR).to.containDeep({
        score: 16,
        save_proficiency: true,
      });
      expect(sheet.equipment.currency.gp).to.equal(10);
      expect(sheet.resource_trackers).to.eql([
        {name: 'Retomar Fôlego', max: 1, used: 0, recharge_on: 'short_rest'},
      ]);
    });

    it('soma riqueza inicial rolada ao ouro do antecedente e rejeita valor inválido', () => {
      expect(
        service.build(characterInput({equipment: {starting_gold: 50}}))
          .character_sheet.equipment.currency.gp,
      ).to.equal(60);
      expect(() =>
        service.build(characterInput({equipment: {starting_gold: -1}})),
      ).to.throw(/starting_gold/);
      expect(() =>
        service.build(characterInput({equipment: {starting_gold: 1.5}})),
      ).to.throw(/starting_gold/);
    });

    it('criação só aceita nível 1', () => {
      expect(() =>
        service.build(characterInput({core_build: {level: 2}})),
      ).to.throw(/limited to level 1/);
    });

    it('Estilo de Luta obrigatório pro Guerreiro, proibido pra quem não tem no nv1', () => {
      expect(() =>
        service.build(characterInput({choices: {fighting_style: undefined}})),
      ).to.throw(/Fighting style choice required/);
      expect(() =>
        service.build(characterInput({choices: {fighting_style: 'Inventado'}})),
      ).to.throw(/Fighting style choice required/);
      expect(() =>
        service.build(
          characterInput({
            core_build: {id_class: 1},
            choices: {fighting_style: 'Defesa'},
          }),
        ),
      ).to.throw(/Fighting style choice not allowed/);
    });

    it('Anão exige ferramenta de artesão válida e ela entra nas proficiências', () => {
      const dwarf = {core_build: {id_race: 1, subrace: 'Anão da Colina'}};
      expect(() => service.build(characterInput(dwarf))).to.throw(
        /Tool proficiency choice required/,
      );
      const sheet = service.build(
        characterInput({
          ...dwarf,
          choices: {tool_proficiency: 'Ferramentas de Ferreiro'},
        }),
      ).character_sheet;
      expect(sheet.proficiencies_and_languages.tools).to.containEql(
        'Ferramentas de Ferreiro',
      );
      expect(() =>
        service.build(
          characterInput({
            choices: {tool_proficiency: 'Ferramentas de Ferreiro'},
          }),
        ),
      ).to.throw(/Tool proficiency choice not allowed/);
    });

    it('Anão da Colina ganha +1 PV por nível e deslocamento de anão', () => {
      const sheet = service.build(
        characterInput({
          core_build: {id_race: 1, subrace: 'Anão da Colina'},
          choices: {tool_proficiency: 'Ferramentas de Ferreiro'},
        }),
      ).character_sheet;
      // CON 13+2 = 15 (+2) → 10 + 2 + 1
      expect(sheet.combat_stats.hit_points.max).to.equal(13);
      expect(sheet.combat_stats.speed).to.equal('7,5m');
    });

    it('subclasse obrigatória na criação pra Clérigo, proibida pra Bárbaro', () => {
      const cleric = {
        core_build: {id_class: 4},
        choices: {fighting_style: undefined},
      };
      expect(() => service.build(characterInput(cleric))).to.throw(
        /Subclass choice required/,
      );
      const sheet = service.build(
        characterInput({
          ...cleric,
          core_build: {id_class: 4, id_subclass: 'vida'},
        }),
      ).character_sheet;
      expect(sheet.header.class_and_level).to.match(/^Clérigo \(.+\) 1$/);
      expect(() =>
        service.build(
          characterInput({
            core_build: {id_class: 1, id_subclass: 'furioso'},
            choices: {fighting_style: undefined},
          }),
        ),
      ).to.throw(/Subclass choice not allowed/);
    });

    it('Feiticeiro Linhagem Dracônica: +1 PV e CA 13 + DES sem armadura', () => {
      const sheet = service.build(
        characterInput({
          core_build: {id_class: 6, id_subclass: 'linhagem-draconica'},
          choices: {fighting_style: undefined},
        }),
      ).character_sheet;
      expect(sheet.combat_stats.hit_points.max).to.equal(6 + 2 + 1);
      expect(sheet.combat_stats.armor_class).to.equal(15);
      expect(sheet.spellcasting_info).to.containDeep({
        spellcasting_ability: 'CHA',
      });
    });

    it('Bárbaro: Fúrias rastreadas e fora de class_resources; Defesa sem Armadura usa CON', () => {
      const sheet = service.build(
        characterInput({
          core_build: {id_class: 1},
          choices: {fighting_style: undefined},
        }),
      ).character_sheet;
      expect(sheet.resource_trackers).to.eql([
        {name: 'Fúrias', max: 2, used: 0, recharge_on: 'long_rest'},
      ]);
      expect(sheet.class_resources).to.eql({'Dano de Fúria': '+2'});
      expect(sheet.combat_stats.armor_class).to.equal(10 + 2 + 2);
      expect(sheet.class_abilities.map(a => a.name)).to.containEql('Fúria');
    });

    it('Bardo: Inspiração Bárdica = mod. CAR', () => {
      const sheet = service.build(
        characterInput({
          core_build: {id_class: 2},
          base_values: {FOR: 8, DES: 14, CON: 12, INT: 10, SAB: 13, CAR: 15},
          choices: {fighting_style: undefined},
        }),
      ).character_sheet;
      // CAR 15+1 = 16 (+3)
      expect(sheet.resource_trackers).to.eql([
        {
          name: 'Inspiração Bárdica',
          max: 3,
          used: 0,
          recharge_on: 'short_rest',
        },
      ]);
    });

    it('Ladino: Ataque Furtivo aparece em class_resources', () => {
      const sheet = service.build(
        characterInput({
          core_build: {id_class: 8},
          choices: {fighting_style: undefined},
        }),
      ).character_sheet;
      expect(sheet.class_resources).to.eql({'Ataque Furtivo': '1d6'});
      expect(sheet.resource_trackers).to.eql([]);
    });

    it('Monge nv1: sem pontos de chi nem habilidades ainda', () => {
      const sheet = service.build(
        characterInput({
          core_build: {id_class: 10},
          choices: {fighting_style: undefined},
        }),
      ).character_sheet;
      expect(sheet.resource_trackers).to.eql([]);
      expect(sheet.class_abilities).to.eql([]);
    });

    it('percepção passiva soma proficiência quando treinada (Elfo)', () => {
      const elf = service.build(
        characterInput({core_build: {id_race: 2}}),
      ).character_sheet;
      // SAB 10 (+0) + prof 2
      expect(elf.combat_stats.passive_perception).to.equal(12);
      expect(
        service.build(characterInput()).character_sheet.combat_stats
          .passive_perception,
      ).to.equal(10 + 0);
    });

    it('armadura pesada + escudo + Defesa', () => {
      const sheet = service.build(
        characterInput({
          equipment: {armour: armour('Armadura Pesada', 16), has_shield: true},
        }),
      ).character_sheet;
      expect(sheet.combat_stats.armor_class).to.equal(16 + 2 + 1);
    });
  });

  // -------------------------------------------------------------------------
  describe('level-up: travas comuns', () => {
    it('personagem inexistente', async () => {
      repository.stubs.findCharacterById.resolves(null);
      await expect(service.getLevelUpPreview(1, 'owner')).to.be.rejectedWith(
        /Character not found/,
      );
    });

    it('só o dono ou o mestre da sessão podem subir de nível', async () => {
      givenCharacter();
      await expect(service.getLevelUpPreview(1, 'outro')).to.be.rejectedWith(
        /Unauthorized/,
      );
      gameSessionRepository.stubs.isDmOfCharacter.resolves(true);
      await expect(service.getLevelUpPreview(1, 'mestre')).to.be.fulfilled();
    });

    it('trava no nível 20 e sem XP suficiente', async () => {
      givenCharacter({character: {level: 20}});
      await expect(service.getLevelUpPreview(1, 'owner')).to.be.rejectedWith(
        /Max level reached/,
      );
      givenCharacter({character: {xp_points: 299}});
      await expect(service.getLevelUpPreview(1, 'owner')).to.be.rejectedWith(
        /Insufficient XP/,
      );
    });
  });

  // -------------------------------------------------------------------------
  describe('level-up: preview', () => {
    it('Guerreiro 1→2: dado, CON, features novas e sem escolhas', async () => {
      givenCharacter();
      const preview = await service.getLevelUpPreview(1, 'owner');
      expect(preview).to.containDeep({
        current_level: 1,
        next_level: 2,
        hit_die: 10,
        con_modifier: 2,
        proficiency_bonus: 2,
        is_asi_level: false,
      });
      expect(preview.new_features.map(f => f.name)).to.containEql(
        'Surto de Ação (um uso)',
      );
      expect(preview.spell_choices).to.be.null();
      expect(preview.subclass_options).to.be.null();
      expect(preview.feat_options).to.eql([]);
      expect(preview.fighting_style_options).to.be.null();
    });

    it('Guerreiro 2→3: oferece as subclasses', async () => {
      givenCharacter({character: {level: 2}});
      const preview = await service.getLevelUpPreview(1, 'owner');
      expect(preview.subclass_options!.map(s => s.id_subclass)).to.eql([
        'campeao',
        'mestre-de-batalha',
        'cavaleiro-arcano',
      ]);
    });

    it('Guerreiro 3→4: nível de ASI lista o catálogo de talentos', async () => {
      givenCharacter({character: {level: 3, id_subclass: 'campeao'}});
      const preview = await service.getLevelUpPreview(1, 'owner');
      expect(preview.is_asi_level).to.be.true();
      expect(preview.feat_options.length).to.be.above(30);
    });

    it('Cavaleiro Arcano 3→4 vira terço-conjurador (espaços + magias novas)', async () => {
      givenCharacter({character: {level: 3, id_subclass: 'cavaleiro-arcano'}});
      const preview = await service.getLevelUpPreview(1, 'owner');
      expect(preview.spell_slots_total).to.eql({level_1: 3});
      expect(preview.spell_choices).to.containDeep({spells_gained: 1});
      expect(preview.subclass_spellcasting).to.eql({
        spell_list_class_id: 9,
        allowed_schools: ['Evocação', 'Abjuração'],
      });
    });

    it('Paladino 1→2: oferece Estilo de Luta e não aprende magia (lista cheia)', async () => {
      givenCharacter({character: {id_class: 11, chosen_fighting_style: null}});
      const preview = await service.getLevelUpPreview(1, 'owner');
      expect(preview.fighting_style_options).to.eql([
        'Defesa',
        'Duelo',
        'Grande Arma',
        'Proteção',
      ]);
      expect(preview.spell_choices).to.containDeep({
        spells_gained: 0,
        spells_gained_by_circle: {},
      });
      expect(preview.spell_slots_total).to.eql({level_1: 2});
    });

    it('Bardo 2→3: Aptidão (2 perícias) e +1 magia conhecida', async () => {
      givenCharacter({
        character: {id_class: 2, level: 2, chosen_fighting_style: null},
      });
      const preview = await service.getLevelUpPreview(1, 'owner');
      expect(preview.expertise_choice).to.eql({count: 2});
      expect(preview.spell_choices).to.containDeep({
        cantrips_gained: 0,
        spells_gained: 1,
      });
    });

    it('Bardo 9→10: Segredos Mágicos abre magia de qualquer classe', async () => {
      givenCharacter({
        character: {
          id_class: 2,
          level: 9,
          id_subclass: 'bravura',
          chosen_fighting_style: null,
        },
      });
      expect(
        (await service.getLevelUpPreview(1, 'owner')).spell_pool_any_class,
      ).to.be.true();
    });

    it('Mago 1→2: grimório cresce 2 magias e lista as escolas', async () => {
      givenCharacter({
        character: {id_class: 9, chosen_fighting_style: null},
        spells: [{...spell(10, 'Mísseis Mágicos', 1), is_prepared: true}],
      });
      const preview = await service.getLevelUpPreview(1, 'owner');
      expect(preview.spell_choices).to.containDeep({
        spells_gained: 2,
        already_known_spell_ids: [10],
      });
      expect(preview.subclass_options!.length).to.equal(8);
    });

    it('subclasse inválida no preview especulativo é rejeitada', async () => {
      givenCharacter({character: {level: 2}});
      await expect(
        service.getLevelUpPreview(1, 'owner', 'inexistente'),
      ).to.be.rejectedWith(/Unknown subclass/);
    });
  });

  // -------------------------------------------------------------------------
  describe('level-up: confirm', () => {
    it('Guerreiro 1→2: soma PV rolado + CON e grava via applyLevelUp', async () => {
      givenCharacter();
      const result = await service.confirmLevelUp(1, 'owner', {
        hit_die_roll: 6,
      });
      expect(result).to.containDeep({
        level: 2,
        hp_gained: 8,
        max_hit_points: 20,
        current_hit_points: 20,
        hit_dice: '2d10',
        spell_save_dc: null,
      });
      const [, payload] = repository.stubs.applyLevelUp.firstCall.args;
      expect(payload).to.containDeep({
        newLevel: 2,
        hitDieRoll: 6,
        conModifierAtLevel: 2,
        hpGained: 8,
        asiType: null,
        newSpellIds: [],
        idSubclass: null,
      });
    });

    it('rejeita rolagem de dado fora do intervalo', async () => {
      givenCharacter();
      for (const roll of [0, 11, 2.5]) {
        await expect(
          service.confirmLevelUp(1, 'owner', {hit_die_roll: roll}),
        ).to.be.rejectedWith(/Invalid hit die roll/);
      }
    });

    it('level já aplicado (requisição duplicada) é rejeitado', async () => {
      givenCharacter();
      repository.stubs.applyLevelUp.resolves({
        status: 'already_applied',
        updatedAttributes: {},
      });
      await expect(
        service.confirmLevelUp(1, 'owner', {hit_die_roll: 5}),
      ).to.be.rejectedWith(/Level already applied/);
    });

    it('subclasse obrigatória no nível de escolha e proibida fora dele', async () => {
      givenCharacter({character: {level: 2}});
      await expect(
        service.confirmLevelUp(1, 'owner', {hit_die_roll: 5}),
      ).to.be.rejectedWith(/Subclass choice required/);
      await service.confirmLevelUp(1, 'owner', {
        hit_die_roll: 5,
        id_subclass: 'campeao',
      });
      expect(
        repository.stubs.applyLevelUp.firstCall.args[1].idSubclass,
      ).to.equal('campeao');

      givenCharacter();
      await expect(
        service.confirmLevelUp(1, 'owner', {
          hit_die_roll: 5,
          id_subclass: 'campeao',
        }),
      ).to.be.rejectedWith(/Subclass choice not allowed/);
    });

    it('Estilo de Luta obrigatório no nível certo (Paladino 1→2)', async () => {
      givenCharacter({character: {id_class: 11, chosen_fighting_style: null}});
      await expect(
        service.confirmLevelUp(1, 'owner', {hit_die_roll: 5}),
      ).to.be.rejectedWith(/Fighting style choice required/);
      await service.confirmLevelUp(1, 'owner', {
        hit_die_roll: 5,
        fighting_style: 'Duelo',
      });
      expect(
        repository.stubs.applyLevelUp.firstCall.args[1].fightingStyle,
      ).to.equal('Duelo');
    });

    describe('ASI / talento', () => {
      beforeEach(() =>
        givenCharacter({character: {level: 3, id_subclass: 'campeao'}}),
      );

      it('escolha obrigatória no nível de ASI', async () => {
        await expect(
          service.confirmLevelUp(1, 'owner', {hit_die_roll: 5}),
        ).to.be.rejectedWith(/ASI or feat choice required/);
      });

      it('ASI precisa somar exatamente 2, no máximo 2 atributos, 0 a 2 cada', async () => {
        const asi = (increases: Record<string, number>) =>
          service.confirmLevelUp(1, 'owner', {
            hit_die_roll: 5,
            asi_or_feat: {type: 'asi', increases},
          });
        await expect(asi({STR: 1})).to.be.rejectedWith(/total exactly 2/);
        await expect(asi({STR: 3, DEX: -1})).to.be.rejectedWith(
          /between 0 and 2/,
        );
        await expect(asi({STR: 2})).to.be.fulfilled();
        expect(repository.stubs.applyLevelUp.lastCall.args[1]).to.containDeep({
          asiType: 'asi',
          asiStatIncreases: {STR: 2},
        });
      });

      it('talento desconhecido é rejeitado; talento com atributo aplica o aumento', async () => {
        await expect(
          service.confirmLevelUp(1, 'owner', {
            hit_die_roll: 5,
            asi_or_feat: {type: 'feat', feat_id: 'nao-existe'},
          }),
        ).to.be.rejectedWith(/Unknown feat/);
        await service.confirmLevelUp(1, 'owner', {
          hit_die_roll: 5,
          asi_or_feat: {type: 'feat', feat_id: 'atleta'},
        });
        expect(repository.stubs.applyLevelUp.lastCall.args[1]).to.containDeep({
          asiType: 'feat',
          featId: 'atleta',
          asiStatIncreases: {STR: 1},
        });
      });

      it('Vigoroso: bônus retroativo de 2 × novo nível', async () => {
        const result = await service.confirmLevelUp(1, 'owner', {
          hit_die_roll: 5,
          asi_or_feat: {type: 'feat', feat_id: 'duro'},
        });
        expect(result.hp_gained).to.equal(5 + 2 + 2 * 4);
      });
    });

    it('Vigoroso já escolhido antes soma +2 em cada level-up seguinte', async () => {
      givenCharacter({character: {level: 4, id_subclass: 'campeao'}});
      repository.stubs.findChosenFeats.resolves([{level: 4, feat_id: 'duro'}]);
      const result = await service.confirmLevelUp(1, 'owner', {
        hit_die_roll: 5,
      });
      expect(result.hp_gained).to.equal(5 + 2 + 2);
    });

    it('ASI fora do nível de ASI é rejeitado', async () => {
      givenCharacter();
      await expect(
        service.confirmLevelUp(1, 'owner', {
          hit_die_roll: 5,
          asi_or_feat: {type: 'asi', increases: {STR: 2}},
        }),
      ).to.be.rejectedWith(/not allowed/);
    });

    it('Mago com ASI em INT recalcula CD e ataque de magia', async () => {
      givenCharacter({
        character: {
          id_class: 9,
          level: 3,
          id_subclass: 'evocacao',
          chosen_fighting_style: null,
        },
        scores: {INT: 16},
      });
      const result = await service.confirmLevelUp(1, 'owner', {
        hit_die_roll: 3,
        asi_or_feat: {type: 'asi', increases: {INT: 2}},
      });
      // INT 18 (+4), prof 2
      expect([result.spell_save_dc, result.spell_attack_bonus]).to.eql([14, 6]);
    });

    describe('magias novas', () => {
      const known = [{...spell(10, 'Mísseis Mágicos', 1), is_prepared: true}];
      beforeEach(() =>
        givenCharacter({
          character: {id_class: 9, chosen_fighting_style: null},
          spells: known,
        }),
      );
      const confirm = (ids: number[]) =>
        service.confirmLevelUp(1, 'owner', {
          hit_die_roll: 3,
          id_subclass: 'evocacao',
          new_spell_ids: ids,
        });

      it('aceita até o limite do nível', async () => {
        await confirm([20, 21]);
        expect(
          repository.stubs.applyLevelUp.firstCall.args[1].newSpellIds,
        ).to.eql([20, 21]);
      });

      it('rejeita excesso, magia já conhecida e duplicada', async () => {
        await expect(confirm([20, 21, 22])).to.be.rejectedWith(
          /Too many new spells/,
        );
        await expect(confirm([10])).to.be.rejectedWith(/Spell already known/);
        await expect(confirm([20, 20])).to.be.rejectedWith(/Duplicate spell/);
      });

      it('classe não conjuradora não pode mandar magia', async () => {
        givenCharacter();
        await expect(
          service.confirmLevelUp(1, 'owner', {
            hit_die_roll: 3,
            new_spell_ids: [1],
          }),
        ).to.be.rejectedWith(/does not grant new spells/);
      });
    });

    describe('Aptidão (Bardo 2→3)', () => {
      const skills = [
        {...skill(1, 'Atuação'), id_attribute: 6},
        {...skill(2, 'Persuasão')},
        {...skill(3, 'Furtividade', false)},
        {...skill(4, 'Enganação', true, true)},
      ];
      beforeEach(() =>
        givenCharacter({
          character: {id_class: 2, level: 2, chosen_fighting_style: null},
          skills,
        }),
      );
      const confirm = (ids?: number[]) =>
        service.confirmLevelUp(1, 'owner', {
          hit_die_roll: 3,
          id_subclass: 'bravura',
          expertise_skill_ids: ids,
        });

      it('exige exatamente 2 perícias treinadas que ainda não são especialização', async () => {
        await expect(confirm([1])).to.be.rejectedWith(/exactly 2/);
        await expect(confirm([1, 1])).to.be.rejectedWith(/Duplicate skill/);
        await expect(confirm([1, 3])).to.be.rejectedWith(/already be trained/);
        await expect(confirm([1, 4])).to.be.rejectedWith(/already be trained/);
        await confirm([1, 2]);
        expect(
          repository.stubs.applyLevelUp.firstCall.args[1].expertiseSkillIds,
        ).to.eql([1, 2]);
      });
    });
  });

  // -------------------------------------------------------------------------
  describe('recursos consumíveis', () => {
    it('gasta e limita ao máximo / mínimo', async () => {
      givenCharacter({
        character: {resource_uses_expended: {'Retomar Fôlego': 0}},
      });
      const spend = await service.expendResourceUse(
        1,
        'Retomar Fôlego',
        1,
        'owner',
      );
      expect(spend.resource_trackers[0]).to.containDeep({
        name: 'Retomar Fôlego',
        max: 1,
        used: 1,
      });
      expect(
        repository.stubs.updateResourceUsesExpended.firstCall.args[1],
      ).to.eql({'Retomar Fôlego': 1});

      givenCharacter({
        character: {resource_uses_expended: {'Retomar Fôlego': 1}},
      });
      await service.expendResourceUse(1, 'Retomar Fôlego', 5, 'owner');
      expect(
        repository.stubs.updateResourceUsesExpended.lastCall.args[1],
      ).to.eql({'Retomar Fôlego': 1});
      await service.expendResourceUse(1, 'Retomar Fôlego', -5, 'owner');
      expect(
        repository.stubs.updateResourceUsesExpended.lastCall.args[1],
      ).to.eql({'Retomar Fôlego': 0});
    });

    it('rejeita delta zero/fracionário, recurso de outra classe e recurso ainda não liberado', async () => {
      givenCharacter();
      await expect(
        service.expendResourceUse(1, 'Retomar Fôlego', 0, 'owner'),
      ).to.be.rejectedWith(/delta/);
      await expect(
        service.expendResourceUse(1, 'Retomar Fôlego', 0.5, 'owner'),
      ).to.be.rejectedWith(/delta/);
      await expect(
        service.expendResourceUse(1, 'Fúrias', 1, 'owner'),
      ).to.be.rejectedWith(/não possui esse recurso/);
      await expect(
        service.expendResourceUse(1, 'Surto de Ação', 1, 'owner'),
      ).to.be.rejectedWith(/não possui esse recurso/);
    });

    it('Integridade Corporal só existe pro Monge da Mão Aberta', async () => {
      givenCharacter({
        character: {
          id_class: 10,
          level: 6,
          id_subclass: 'mao-aberta',
          chosen_fighting_style: null,
        },
      });
      await expect(
        service.expendResourceUse(1, 'Integridade Corporal', 1, 'owner'),
      ).to.be.fulfilled();
      givenCharacter({
        character: {
          id_class: 10,
          level: 6,
          id_subclass: 'sombra',
          chosen_fighting_style: null,
        },
      });
      await expect(
        service.expendResourceUse(1, 'Integridade Corporal', 1, 'owner'),
      ).to.be.rejectedWith(/não possui esse recurso/);
    });

    it('usuário sem permissão é bloqueado', async () => {
      givenCharacter();
      await expect(
        service.expendResourceUse(1, 'Retomar Fôlego', 1, 'outro'),
      ).to.be.rejectedWith(/Forbidden/);
    });
  });

  // -------------------------------------------------------------------------
  describe('descansos', () => {
    it('descanso curto (dado de vida): cura dado + CON e recarrega só recursos de descanso curto', async () => {
      sinon.stub(Math, 'random').returns(0.5); // d10 → 6
      givenCharacter({
        character: {
          level: 14,
          id_subclass: 'campeao',
          current_hit_points: 50,
          max_hit_points: 120,
          resource_uses_expended: {'Surto de Ação': 1, Indomável: 2},
        },
      });
      const result = await service.rollHitDie(1, 'owner');
      expect(result).to.containDeep({
        roll: 6,
        con_mod: 2,
        healed: 8,
        current_hit_points: 58,
        hit_dice_spent: 1,
        hit_dice_total: 14,
      });
      expect(
        repository.stubs.updateResourceUsesExpended.firstCall.args[1],
      ).to.eql({Indomável: 2});
    });

    it('descanso curto não passa do PV máximo e trava sem dado ou com PV cheio', async () => {
      sinon.stub(Math, 'random').returns(0.99);
      givenCharacter({character: {current_hit_points: 10, max_hit_points: 12}});
      expect(
        (await service.rollHitDie(1, 'owner')).current_hit_points,
      ).to.equal(12);

      givenCharacter({character: {hit_dice_spent: 1, current_hit_points: 5}});
      await expect(service.rollHitDie(1, 'owner')).to.be.rejectedWith(
        /Nenhum Dado de Vida/,
      );
      givenCharacter();
      await expect(service.rollHitDie(1, 'owner')).to.be.rejectedWith(
        /pontos de vida máximos/,
      );
    });

    it('descanso longo: PV cheio, metade dos dados de vida, espaços e todos os recursos zerados', async () => {
      givenCharacter({
        character: {
          level: 14,
          id_subclass: 'campeao',
          current_hit_points: 1,
          max_hit_points: 120,
          hit_dice_spent: 10,
          resource_uses_expended: {'Surto de Ação': 1, Indomável: 2},
        },
      });
      const result = await service.longRest(1, 'owner');
      expect(result).to.containDeep({
        current_hit_points: 120,
        hit_dice_spent: 3,
        slots_expended: {},
      });
      expect(
        repository.stubs.updateSpellSlotsExpended.firstCall.args[1],
      ).to.eql({});
      expect(
        repository.stubs.updateResourceUsesExpended.firstCall.args[1],
      ).to.eql({});
    });

    it('descanso longo recupera no mínimo 1 dado e exige PV > 0', async () => {
      givenCharacter({character: {hit_dice_spent: 1, current_hit_points: 3}});
      expect((await service.longRest(1, 'owner')).hit_dice_spent).to.equal(0);
      givenCharacter({character: {current_hit_points: 0}});
      await expect(service.longRest(1, 'owner')).to.be.rejectedWith(
        /pelo menos 1 ponto de vida/,
      );
    });
  });

  // -------------------------------------------------------------------------
  describe('espaços de magia', () => {
    it('gasta/devolve 1 e limita ao total do nível', async () => {
      givenCharacter({
        character: {
          id_class: 9,
          chosen_fighting_style: null,
          spell_slots_expended: {level_1: 1},
        },
      });
      expect(
        (await service.expendSpellSlot(1, 1, 1, 'owner')).slots_expended,
      ).to.eql({level_1: 2});
      givenCharacter({
        character: {
          id_class: 9,
          chosen_fighting_style: null,
          spell_slots_expended: {level_1: 2},
        },
      });
      expect(
        (await service.expendSpellSlot(1, 1, 1, 'owner')).slots_expended,
      ).to.eql({level_1: 2});
      expect(
        (await service.expendSpellSlot(1, 1, -1, 'owner')).slots_expended,
      ).to.eql({level_1: 1});
    });

    it('rejeita delta diferente de ±1 e círculo sem espaço', async () => {
      givenCharacter({character: {id_class: 9, chosen_fighting_style: null}});
      await expect(
        service.expendSpellSlot(1, 1, 2, 'owner'),
      ).to.be.rejectedWith(/delta/);
      await expect(
        service.expendSpellSlot(1, 2, 1, 'owner'),
      ).to.be.rejectedWith(/não possui espaços/);
      givenCharacter();
      await expect(
        service.expendSpellSlot(1, 1, 1, 'owner'),
      ).to.be.rejectedWith(/não possui espaços/);
    });
  });

  // -------------------------------------------------------------------------
  describe('equipamento', () => {
    it('recalcula a CA ao trocar armadura/escudo', async () => {
      givenCharacter();
      optionsRepository.stubs.findArmourById.resolves(
        armour('Armadura Pesada', 16),
      );
      expect(
        await service.updateEquipment(1, 'owner', {
          id_armour: 5,
          has_shield: true,
        }),
      ).to.eql({armor_class: 16 + 2 + 1});
      expect(
        await service.updateEquipment(1, 'owner', {
          id_armour: null,
          has_shield: false,
        }),
      ).to.eql({armor_class: 12});
    });

    it('bloqueia armadura e escudo sem proficiência', async () => {
      givenCharacter({character: {id_class: 9, chosen_fighting_style: null}});
      optionsRepository.stubs.findArmourById.resolves(
        armour('Armadura Leve', 11),
      );
      await expect(
        service.updateEquipment(1, 'owner', {id_armour: 1, has_shield: false}),
      ).to.be.rejectedWith(/not proficient/);
      await expect(
        service.updateEquipment(1, 'owner', {
          id_armour: null,
          has_shield: true,
        }),
      ).to.be.rejectedWith(/shields/);
      expect(repository.stubs.updateEquipment.called).to.be.false();
    });
  });
});
