import {inject, injectable, BindingScope} from '@loopback/core';
import {PostgresDatasource} from '../datasources';
import {AttributeType, CharacterOptions, Skill} from './character-options/types';

@injectable({scope: BindingScope.TRANSIENT})
export class CharacterOptionsService {
  constructor(
    @inject('db.Postgres')
    private db: PostgresDatasource,
  ) {}

  async getCharacterOptions(): Promise<CharacterOptions> {
    const [attributes, skills] = await Promise.all([
      this.db.sql<AttributeType[]>`SELECT id_attribute, name, full_name FROM attribute_type`,
      this.db.sql<Skill[]>`SELECT id_skill, name, id_attribute FROM skill`,
    ]);

    return {attributes, skills};
  }
}
