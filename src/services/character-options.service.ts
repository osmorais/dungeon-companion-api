import {injectable, BindingScope, service} from '@loopback/core';
import {CharacterOptionsRepository} from '../repositories/character-options.repository';
import {Alignment, Armour, Background, CharacterClass, CharacterOptions, Spell, WeaponOption} from '../models/character-options-types';
import {RACES, SUBRACES} from './character-sheet/rules';

@injectable({scope: BindingScope.TRANSIENT})
export class CharacterOptionsService {
  constructor(
    @service(CharacterOptionsRepository)
    private repository: CharacterOptionsRepository,
  ) {}

  async getCharacterOptions(): Promise<CharacterOptions> {
    const [attributes, skills, rawRaces, classes, backgrounds, alignments, weapons, spells, armours] = await Promise.all([
      this.repository.findAttributes(),
      this.repository.findSkills(),
      this.repository.findRaces(),
      this.repository.findClasses(),
      this.repository.findBackgrounds(),
      this.repository.findAlignments(),
      this.repository.findWeapons(),
      this.repository.findSpells(),
      this.repository.findArmours(),
    ]);

    const races = rawRaces.map(r => {
      const rule = RACES[r.id_race];
      const subraces = (rule?.subraces ?? []).map(key => ({key, name: SUBRACES[key].displayName}));
      return {...r, subraces};
    });

    return {attributes, skills, weapons, races, classes, backgrounds, alignments, spells, armours};
  }
}
