/* eslint-disable @typescript-eslint/naming-convention */
import {createStubInstance, expect} from '@loopback/testlab';
import {CharacterOptionsService} from '../../../services/character-options.service';
import {CharacterOptionsRepository} from '../../../repositories/character-options.repository';
import {BACKGROUNDS} from '../../../services/character-sheet/rules';
import {DB_SKILLS} from '../fixtures';

describe('CharacterOptionsService', () => {
  function givenOptions() {
    const repository = createStubInstance(CharacterOptionsRepository);
    repository.stubs.findAttributes.resolves([]);
    repository.stubs.findSkills.resolves(
      DB_SKILLS.map(s => ({
        ...s,
        description: '',
        is_trained: false,
        is_expert: false,
        level_value: 0,
        total_skill_value: 0,
      })),
    );
    repository.stubs.findRaces.resolves([]);
    repository.stubs.findClasses.resolves([]);
    repository.stubs.findBackgrounds.resolves(
      Object.values(BACKGROUNDS).map(b => ({
        id_background: b.id_background,
        name: b.displayName,
        starting_gold_po: b.startingGold,
        languages_number: b.languages,
      })) as never,
    );
    repository.stubs.findAlignments.resolves([]);
    repository.stubs.findWeapons.resolves([]);
    repository.stubs.findSpells.resolves([]);
    repository.stubs.findArmours.resolves([]);
    return new CharacterOptionsService(repository).getCharacterOptions();
  }

  it('perícias do antecedente vêm com o nome e o id da tabela skill', async () => {
    const {backgrounds} = await givenOptions();
    const soldier = backgrounds.find(b => b.id_background === 13)!;
    expect(soldier.skills).to.eql(['Atletismo', 'Intimidação']);
    expect(soldier.skill_ids).to.eql([1, 17]);
    // Artista: "performance" casa com "Atuação"
    const entertainer = backgrounds.find(b => b.id_background === 3)!;
    expect(entertainer.skills).to.eql(['Acrobacia', 'Atuação']);
  });

  it('todo antecedente tem as 2 perícias resolvidas', async () => {
    const {backgrounds} = await givenOptions();
    for (const b of backgrounds) {
      expect({name: b.name, ids: b.skill_ids.length}).to.eql({
        name: b.name,
        ids: 2,
      });
    }
  });
});
