import {injectable, BindingScope, service} from '@loopback/core';
import {CharacterOptionsRepository} from './character-options/character-options.repository';
import {Alignment, Background, CharacterClass, CharacterOptions, Race, WeaponOption} from './character-options/types';
import {WEAPONS} from './character-sheet/rules';

@injectable({scope: BindingScope.TRANSIENT})
export class CharacterOptionsService {
  constructor(
    @service(CharacterOptionsRepository)
    private repository: CharacterOptionsRepository,
  ) {}

  async getCharacterOptions(): Promise<CharacterOptions> {
    const [attributes, skills, races, classes, backgrounds, alignments] = await Promise.all([
      this.repository.findAttributes(),
      this.repository.findSkills(),
      this.repository.findRaces(),
      this.repository.findClasses(),
      this.repository.findBackgrounds(),
      this.repository.findAlignments(),
    ]);

    const weapons: WeaponOption[] = Object.values(WEAPONS).map(w => ({
      name: w.displayName,
      damage: `${w.damageDie} ${w.damageType}`,
      properties: w.properties,
      isRanged: w.isRanged,
    }));

    return {attributes, skills, weapons, races, classes, backgrounds, alignments};
  }
}
