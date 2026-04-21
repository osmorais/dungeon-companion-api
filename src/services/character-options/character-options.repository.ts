import {inject, injectable, BindingScope} from '@loopback/core';
import {PostgresDatasource} from '../../datasources';
import {Alignment, AttributeType, Background, CharacterClass, Race, Skill} from './types';

@injectable({scope: BindingScope.TRANSIENT})
export class CharacterOptionsRepository {
  constructor(
    @inject('db.Postgres')
    private db: PostgresDatasource,
  ) {}

  async findAttributes(): Promise<AttributeType[]> {
    return this.db.sql<AttributeType[]>`SELECT id_attribute, name, full_name FROM attribute_type`;
  }

  async findSkills(): Promise<Skill[]> {
    return this.db.sql<Skill[]>`SELECT id_skill, name, id_attribute FROM skill`;
  }

  async findRaces(): Promise<Race[]> {
    return this.db.sql<Race[]>`SELECT id_race, name, movement FROM race`;
  }

  async findClasses(): Promise<CharacterClass[]> {
    return this.db.sql<CharacterClass[]>`SELECT id_class, name, starting_gold_po FROM class`;
  }

  async findBackgrounds(): Promise<Background[]> {
    return this.db.sql<Background[]>`SELECT id_background, name, starting_gold_po, languages_number FROM background`;
  }

  async findAlignments(): Promise<Alignment[]> {
    return this.db.sql<Alignment[]>`SELECT id_alignment, name, description FROM alignment`;
  }
}
