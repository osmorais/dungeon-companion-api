import {injectable, BindingScope, service} from '@loopback/core';
import {CharacterOptionsRepository} from '../repositories/character-options.repository';
import {Alignment, Armour, Background, CharacterClass, CharacterOptions, Race, Spell, WeaponOption} from '../models/character-options-types';

@injectable({scope: BindingScope.TRANSIENT})
export class CharacterOptionsService {
  constructor(
    @service(CharacterOptionsRepository)
    private repository: CharacterOptionsRepository,
  ) {}

  async getCharacterOptions(): Promise<CharacterOptions> {
    const [attributes, skills, races, classes, backgrounds, alignments, weapons, spells, armours] = await Promise.all([
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

    // const weapons: WeaponOption[] = weaponRows.map(w => {
    //   const props = w.properties ? w.properties.split(', ') : [];
    //   return {
    //     name: w.name,
    //     damage: w.damage_die && w.damage_type ? `${w.damage_die} ${w.damage_type}` : '-',
    //     properties: props,
    //     isRanged: props.some(p => p.toLowerCase().startsWith('munição')),
    //   };
    // });

    return {attributes, skills, weapons, races, classes, backgrounds, alignments, spells, armours};
  }
}
