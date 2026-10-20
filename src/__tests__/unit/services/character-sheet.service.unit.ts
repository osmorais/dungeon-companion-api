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
import {ImageCleanupService} from '../../../services/image-cleanup.service';
import {XP_THRESHOLDS} from '../../../services/character-sheet/rules';
import {CharacterRawData} from '../../../models/character-sheet-types';
import {armour, characterInput, rawCharacter, skill, spell} from '../fixtures';

describe('CharacterSheetService', () => {
  let repository: StubbedInstanceWithSinonAccessor<CharacterRepository>;
  let gameSessionRepository: StubbedInstanceWithSinonAccessor<GameSessionRepository>;
  let optionsRepository: StubbedInstanceWithSinonAccessor<CharacterOptionsRepository>;
  let storage: StubbedInstanceWithSinonAccessor<SupabaseStorageService>;
  let imageCleanup: StubbedInstanceWithSinonAccessor<ImageCleanupService>;
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
    storage = createStubInstance(SupabaseStorageService);
    imageCleanup = createStubInstance(ImageCleanupService);
    service = new CharacterSheetService(
      repository,
      gameSessionRepository,
      optionsRepository,
      storage,
      createStubInstance(CombatRepository),
      imageCleanup,
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

      describe('Habilidoso (3 perícias e/ou ferramentas)', () => {
        const skill = (
          id_skill: number,
          name: string,
          is_trained: boolean,
        ) => ({
          id_skill,
          name,
          id_attribute: 1,
          attribute_name: 'FOR',
          description: '',
          is_trained,
          is_expert: false,
          level_value: 3,
          total_skill_value: 0,
        });
        beforeEach(() =>
          givenCharacter({
            character: {level: 3, id_subclass: 'campeao'},
            skills: [
              skill(1, 'Atletismo', true),
              skill(2, 'Acrobacia', false),
              skill(3, 'Furtividade', false),
              skill(5, 'Arcanismo', false),
            ],
          }),
        );
        const skilled = (skill_ids?: number[], tools?: string[]) =>
          service.confirmLevelUp(1, 'owner', {
            hit_die_roll: 5,
            asi_or_feat: {
              type: 'feat',
              feat_id: 'afiar-habilidades',
              skill_ids,
              tools,
            },
          });

        it('preview avisa que o talento escolhe 3 com a lista de ferramentas', async () => {
          const preview = await service.getLevelUpPreview(1, 'owner');
          const option = preview.feat_options.find(
            f => f.id_feat === 'afiar-habilidades',
          )!;
          expect(option.proficiency_choice!.count).to.equal(3);
          expect(option.proficiency_choice!.tool_options).to.containEql(
            'Ferramentas de Ladrão',
          );
          expect(
            preview.feat_options.find(f => f.id_feat === 'duro')!
              .proficiency_choice,
          ).to.be.null();
        });

        it('2 perícias + 1 ferramenta: treina as perícias e guarda tudo no histórico', async () => {
          await skilled([2, 3], ['Ferramentas de Ladrão']);
          const payload = repository.stubs.applyLevelUp.lastCall.args[1];
          expect(payload.featSkillIds).to.eql([2, 3]);
          expect(payload.choiceData).to.eql({
            feat_proficiencies: {
              feat_id: 'afiar-habilidades',
              skill_ids: [2, 3],
              tools: ['Ferramentas de Ladrão'],
            },
          });
        });

        it('quantidade errada, repetida, já treinada, inexistente ou ferramenta fora da lista', async () => {
          await expect(skilled([2, 3])).to.be.rejectedWith(/exactly 3/);
          await expect(skilled([2, 2, 3])).to.be.rejectedWith(/Duplicate/);
          await expect(skilled([1, 2, 3])).to.be.rejectedWith(
            /already trained/,
          );
          await expect(skilled([2, 3, 99])).to.be.rejectedWith(/Unknown skill/);
          await expect(skilled([2, 3], ['Varinha'])).to.be.rejectedWith(
            /Unknown tool/,
          );
          await expect(skilled()).to.be.rejectedWith(/exactly 3/);
        });

        it('outro talento não aceita perícias', async () => {
          await expect(
            service.confirmLevelUp(1, 'owner', {
              hit_die_roll: 5,
              asi_or_feat: {type: 'feat', feat_id: 'duro', skill_ids: [2]},
            }),
          ).to.be.rejectedWith(/does not grant/);
        });

        it('ferramenta do talento aparece nas proficiências da ficha', async () => {
          repository.stubs.findChosenFeats.resolves([
            {level: 4, feat_id: 'afiar-habilidades'},
          ]);
          repository.stubs.findChoiceData.resolves([
            {
              level: 4,
              choice_data: {
                feat_proficiencies: {
                  feat_id: 'afiar-habilidades',
                  skill_ids: [2],
                  tools: ['Kit de Herbalismo', 'Ferramentas de Ladrão'],
                },
              },
            },
          ]);
          const sheet = await service.loadCharacter(1, 'owner');
          expect(
            sheet!.character_sheet.proficiencies_and_languages.tools,
          ).to.containEql('Kit de Herbalismo');
          expect(
            sheet!.character_sheet.proficiencies_and_languages.tools,
          ).to.containEql('Ferramentas de Ladrão');
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

    it('descanso curto do grupo: recarrega só os recursos de descanso curto, sem mexer em PV', async () => {
      givenCharacter({
        character: {
          level: 14,
          id_subclass: 'campeao',
          current_hit_points: 120,
          max_hit_points: 120,
          resource_uses_expended: {'Surto de Ação': 1, Indomável: 2},
        },
      });
      await service.shortRest(1, 'owner');
      expect(
        repository.stubs.updateResourceUsesExpended.firstCall.args[1],
      ).to.eql({Indomável: 2});
      sinon.assert.notCalled(repository.stubs.updateHitDiceAndHp);
    });

    it('descanso curto devolve os espaços da Magia de Pacto do bruxo (e só do bruxo)', async () => {
      givenCharacter({character: {id_class: 3, spell_slots_expended: {level_1: 1}}});
      expect((await service.shortRest(1, 'owner')).slots_expended).to.eql({});
      expect(repository.stubs.updateSpellSlotsExpended.calledOnceWith(1, {})).to.be.true();

      repository.stubs.updateSpellSlotsExpended.resetHistory();
      sinon.stub(Math, 'random').returns(0);
      givenCharacter({character: {id_class: 3, current_hit_points: 5}});
      expect((await service.rollHitDie(1, 'owner')).slots_expended).to.eql({});
      expect(repository.stubs.updateSpellSlotsExpended.calledOnceWith(1, {})).to.be.true();

      repository.stubs.updateSpellSlotsExpended.resetHistory();
      givenCharacter({character: {id_class: 7}});
      expect((await service.shortRest(1, 'owner')).slots_expended).to.be.undefined();
      sinon.assert.notCalled(repository.stubs.updateSpellSlotsExpended);
    });

    it('descanso longo encerra os efeitos ativos (Fúria, Arma Sagrada)', async () => {
      givenCharacter({
        character: {active_effects: {active: ['Fúria'], turn_uses: {}}},
      });
      await service.longRest(1, 'owner');
      expect(
        repository.stubs.updateActiveEffects.calledOnceWith(1, null),
      ).to.be.true();
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
  describe('rolagem das magias na ficha', () => {
    it('conjurador: magias com mecânica ganham a rolagem pronta, as outras não', async () => {
      // Mago nv5, INT 16 (+3), prof 3 → ataque de magia +6
      repository.stubs.findCharacterById.resolves(
        rawCharacter({
          character: {
            id_class: 9,
            level: 5,
            proficiency_bonus: 3,
            chosen_fighting_style: null,
          },
          scores: {INT: 16},
          spells: [
            {...spell(287, 'Raio de Fogo', 0), is_prepared: false},
            {...spell(222, 'Mísseis Mágicos', 1), is_prepared: true},
            {...spell(1, 'Luz', 0), is_prepared: false},
            {...spell(44, 'Bola de Fogo', 3), is_prepared: true},
          ],
        }),
      );
      const sheet = (await service.loadCharacter(1, 'owner'))!.character_sheet;
      const byName = new Map(sheet.spells.map(s => [s.name, s]));
      expect(byName.get('Raio de Fogo')!.roll).to.containDeep({
        kind: 'attack',
        attack_bonus: 6,
        by_slot: {
          '0': {instances: 1, dice_count: 2, dice_sides: 10, modifier: 0},
        },
      });
      expect(byName.get('Mísseis Mágicos')!.roll!.by_slot['3']).to.eql({
        instances: 5,
        dice_count: 1,
        dice_sides: 4,
        modifier: 1,
        extra_dice: [],
      });
      expect(byName.get('Luz')!.roll).to.be.undefined();
      // CD = 8 + prof 3 + INT 3
      expect(byName.get('Bola de Fogo')!.roll).to.containDeep({
        kind: 'save',
        save_ability: 'DEX',
        save_dc: 14,
        save_on_success: 'half',
      });
    });

    it('classe não conjuradora (truque racial) fica sem rolagem', async () => {
      repository.stubs.findCharacterById.resolves(
        rawCharacter({
          spells: [{...spell(288, 'Raio de Gelo', 0), is_prepared: false}],
        }),
      );
      const sheet = (await service.loadCharacter(1, 'owner'))!.character_sheet;
      expect(sheet.spells[0].roll).to.be.undefined();
    });
  });

  // -------------------------------------------------------------------------
  describe('habilidades ativáveis na ficha', () => {
    it('Guerreiro: Retomar o Fôlego com a cura pronta; Surto de Ação sem rolagem', async () => {
      repository.stubs.findCharacterById.resolves(
        rawCharacter({character: {level: 3, proficiency_bonus: 2}}),
      );
      const sheet = (await service.loadCharacter(1, 'owner'))!.character_sheet;
      const second = sheet.class_abilities.find(
        a => a.name === 'Retomar o Fôlego',
      )!;
      expect(second.roll!.by_slot['0']).to.containDeep({
        dice_count: 1,
        dice_sides: 10,
        modifier: 3,
      });
      const surge = sheet.class_abilities.find(
        a => a.name === 'Surto de Ação',
      )!;
      expect(surge).to.containDeep({
        roll: null,
        variable_cost: false,
        restores_slot: null,
      });
    });

    it('Monge Mão Aberta nv6 ganha Integridade Corporal (3 × nível)', async () => {
      repository.stubs.findCharacterById.resolves(
        rawCharacter({
          character: {
            id_class: 10,
            id_subclass: 'mao-aberta',
            level: 6,
            proficiency_bonus: 3,
            chosen_fighting_style: null,
          },
        }),
      );
      const sheet = (await service.loadCharacter(1, 'owner'))!.character_sheet;
      const wholeness = sheet.class_abilities.find(
        a => a.name === 'Integridade Corporal',
      )!;
      expect(wholeness.roll!.by_slot['0'].modifier).to.equal(18);
    });
  });

  // -------------------------------------------------------------------------
  describe('efeitos ativos e usos por turno', () => {
    beforeEach(() => {
      repository.stubs.findCharacterById.resolves(
        rawCharacter({character: {id_class: 1, chosen_fighting_style: null}}),
      );
    });

    it('liga e desliga um efeito (Fúria) e guarda no personagem', async () => {
      const on = await service.updateActiveEffects(
        1,
        {effect: 'Fúria', active: true},
        'owner',
      );
      expect(on.active_effects).to.eql({active: ['Fúria'], turn_uses: {}});
      expect(repository.stubs.updateActiveEffects.firstCall.args).to.eql([
        1,
        on.active_effects,
      ]);

      repository.stubs.findCharacterById.resolves(
        rawCharacter({
          character: {
            id_class: 1,
            chosen_fighting_style: null,
            active_effects: {active: ['Fúria'], turn_uses: {}},
          },
        }),
      );
      const off = await service.updateActiveEffects(
        1,
        {effect: 'Fúria', active: false},
        'owner',
      );
      expect(off.active_effects.active).to.eql([]);
    });

    it('marca uma soma 1×/turno na vez do combate', async () => {
      const result = await service.updateActiveEffects(
        1,
        {turn_use: 'Ataque Furtivo', turn_key: 'enc:2:p1'},
        'owner',
      );
      expect(result.active_effects.turn_uses).to.eql({
        'Ataque Furtivo': 'enc:2:p1',
      });
    });

    it('usar a Inspiração Bárdica guardada apaga o dado', async () => {
      repository.stubs.findCharacterById.resolves(
        rawCharacter({
          character: {
            active_effects: {
              active: [],
              turn_uses: {},
              bardic_inspiration: {sides: 8, from: 'Lyra'},
            },
          },
        }),
      );
      const result = await service.updateActiveEffects(
        1,
        {consume_inspiration: true},
        'owner',
      );
      expect(result.active_effects.bardic_inspiration).to.be.null();
      repository.stubs.findCharacterById.resolves(rawCharacter());
      await expect(
        service.updateActiveEffects(1, {consume_inspiration: true}, 'owner'),
      ).to.be.rejectedWith(/Sem Inspiração/);
    });

    it('valida efeito, soma, vez e permissão', async () => {
      await expect(
        service.updateActiveEffects(1, {effect: 'Voo', active: true}, 'owner'),
      ).to.be.rejectedWith(/Efeito inválido/);
      await expect(
        service.updateActiveEffects(1, {effect: 'Fúria'}, 'owner'),
      ).to.be.rejectedWith(/Efeito inválido/);
      await expect(
        service.updateActiveEffects(
          1,
          {turn_use: 'Surto de Ação', turn_key: 'x'},
          'owner',
        ),
      ).to.be.rejectedWith(/Uso por turno inválido/);
      await expect(
        service.updateActiveEffects(
          1,
          {turn_use: 'Ataque Furtivo', turn_key: ' '},
          'owner',
        ),
      ).to.be.rejectedWith(/Uso por turno inválido/);
      await expect(
        service.updateActiveEffects(1, {}, 'owner'),
      ).to.be.rejectedWith(/Informe/);
      await expect(
        service.updateActiveEffects(
          1,
          {effect: 'Fúria', active: true},
          'outro',
        ),
      ).to.be.rejected();
      expect(repository.stubs.updateActiveEffects.called).to.be.false();
    });

    it('a ficha traz os traços de ataque com os efeitos ativos', async () => {
      repository.stubs.findCharacterById.resolves(
        rawCharacter({
          character: {
            id_class: 1,
            level: 9,
            chosen_fighting_style: null,
            active_effects: {active: ['Fúria'], turn_uses: {}},
          },
        }),
      );
      const sheet = (await service.loadCharacter(1, 'owner'))!.character_sheet;
      expect(sheet.combat_features).to.containDeep({
        melee_crit_extra_dice: 1,
        active_effects: {active: ['Fúria']},
      });
      expect(sheet.combat_features!.riders[0]).to.containDeep({
        key: 'Fúria',
        flat: 3,
      });
      expect(
        sheet.class_abilities.find(a => a.name === 'Fúria')!.activates,
      ).to.equal('Fúria');
    });
  });

  // -------------------------------------------------------------------------
  describe('recursos de raça e de talento', () => {
    it('Draconato: Arma de Sopro como recurso e habilidade; Meio-Orc: Resistência Implacável', async () => {
      repository.stubs.findCharacterById.resolves(
        rawCharacter({
          character: {id_race: 4, level: 6, proficiency_bonus: 3},
          scores: {CON: 14},
        }),
      );
      const sheet = (await service.loadCharacter(1, 'owner'))!.character_sheet;
      expect(sheet.resource_trackers).to.containDeep([
        {name: 'Arma de Sopro', max: 1, used: 0, recharge_on: 'short_rest'},
      ]);
      const breath = sheet.class_abilities.find(
        a => a.name === 'Arma de Sopro',
      )!;
      // CD 8 + CON 2 + prof 3; nv6 → 3d6
      expect(breath.roll).to.containDeep({
        save_dc: 13,
        by_slot: {'0': {dice_count: 3}},
      });

      repository.stubs.findCharacterById.resolves(
        rawCharacter({character: {id_race: 7}}),
      );
      const orc = (await service.loadCharacter(1, 'owner'))!.character_sheet;
      expect(orc.resource_trackers.map(r => r.name)).to.containEql(
        'Resistência Implacável',
      );
    });

    it('talento Sortudo: 3 Pontos de Sorte, gastos pelo mesmo endpoint dos recursos', async () => {
      repository.stubs.findChosenFeats.resolves([
        {feat_id: 'sortudo', level: 4},
      ]);
      repository.stubs.findCharacterById.resolves(
        rawCharacter({character: {level: 4}}),
      );
      const result = await service.expendResourceUse(
        1,
        'Pontos de Sorte',
        1,
        'owner',
      );
      expect(result.resource_trackers).to.containDeep([
        {name: 'Pontos de Sorte', max: 3, used: 1, recharge_on: 'long_rest'},
      ]);
      // não passa do máximo
      repository.stubs.findCharacterById.resolves(
        rawCharacter({
          character: {level: 4, resource_uses_expended: {'Pontos de Sorte': 3}},
        }),
      );
      const capped = await service.expendResourceUse(
        1,
        'Pontos de Sorte',
        1,
        'owner',
      );
      expect(
        capped.resource_trackers.find(r => r.name === 'Pontos de Sorte')!.used,
      ).to.equal(3);
    });

    it('recurso de raça que o personagem não tem é recusado', async () => {
      repository.stubs.findCharacterById.resolves(rawCharacter());
      await expect(
        service.expendResourceUse(1, 'Arma de Sopro', 1, 'owner'),
      ).to.be.rejectedWith(/não possui/);
    });

    it('descanso curto recarrega a Arma de Sopro; o longo, Sortudo e Resistência Implacável', async () => {
      repository.stubs.findChosenFeats.resolves([
        {feat_id: 'sortudo', level: 4},
      ]);
      repository.stubs.findCharacterById.resolves(
        rawCharacter({
          character: {
            id_race: 4,
            level: 4,
            hit_dice_spent: 0,
            current_hit_points: 5,
            resource_uses_expended: {'Arma de Sopro': 1, 'Pontos de Sorte': 2},
          },
        }),
      );
      await service.rollHitDie(1, 'owner');
      expect(
        repository.stubs.updateResourceUsesExpended.firstCall.args[1],
      ).to.eql({
        'Pontos de Sorte': 2,
      });
      await service.longRest(1, 'owner');
      expect(
        repository.stubs.updateResourceUsesExpended.secondCall.args[1],
      ).to.eql({});
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

  // -------------------------------------------------------------------------
  describe('imagem do personagem (limpeza do storage)', () => {
    it('trocar a imagem salva a nova e limpa a antiga', async () => {
      givenCharacter({character: {image_url: 'https://x/antiga.png'}});
      storage.stubs.uploadImage.resolves('https://x/nova.png');
      const result = await service.updateCharacterImage(
        1,
        'owner',
        Buffer.from('img'),
        'image/png',
      );
      expect(result).to.eql({image_url: 'https://x/nova.png'});
      sinon.assert.calledWith(
        storage.stubs.uploadImage,
        sinon.match.any,
        'image/png',
      );
      sinon.assert.calledWith(
        repository.stubs.updateImage,
        1,
        'https://x/nova.png',
      );
      sinon.assert.calledWith(imageCleanup.stubs.deleteIfUnreferenced, [
        'https://x/antiga.png',
      ]);
      // Limpa só depois de gravar a nova no banco.
      sinon.assert.callOrder(
        repository.stubs.updateImage,
        imageCleanup.stubs.deleteIfUnreferenced,
      );
    });

    it('outro usuário não troca a imagem nem sobe arquivo', async () => {
      givenCharacter();
      await expect(
        service.updateCharacterImage(
          1,
          'outro',
          Buffer.from('img'),
          'image/png',
        ),
      ).to.be.rejectedWith(/não pode alterar a imagem/);
      expect(storage.stubs.uploadImage.called).to.be.false();
      expect(imageCleanup.stubs.deleteIfUnreferenced.called).to.be.false();
    });

    it('excluir o personagem limpa a imagem dele depois do DELETE', async () => {
      givenCharacter({character: {image_url: 'https://x/foto.png'}});
      expect(await service.deleteCharacter(1, 'owner')).to.eql({success: true});
      sinon.assert.callOrder(
        repository.stubs.deleteCharacter,
        imageCleanup.stubs.deleteIfUnreferenced,
      );
      sinon.assert.calledWith(imageCleanup.stubs.deleteIfUnreferenced, [
        'https://x/foto.png',
      ]);
    });

    it('outro usuário não exclui o personagem', async () => {
      givenCharacter();
      await expect(service.deleteCharacter(1, 'outro')).to.be.rejectedWith(
        'Unauthorized',
      );
      expect(repository.stubs.deleteCharacter.called).to.be.false();
      expect(imageCleanup.stubs.deleteIfUnreferenced.called).to.be.false();
    });
  });
});
