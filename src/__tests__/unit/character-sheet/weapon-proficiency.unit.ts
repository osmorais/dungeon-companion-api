import {expect} from '@loopback/testlab';
import {
  WEAPON_CATEGORY,
  isProficientWithWeapon,
  weaponProficiencyList,
} from '../../../services/character-sheet/weapon-proficiency';
import {
  CLASSES,
  SUBRACES,
  RACES,
} from '../../../services/character-sheet/rules';

describe('proficiência em armas', () => {
  it('armas simples × marciais', () => {
    expect(
      isProficientWithWeapon('Besta Leve', ['Armas Simples']),
    ).to.be.true();
    expect(
      isProficientWithWeapon('Besta Pesada', ['Armas Simples']),
    ).to.be.false();
    expect(
      isProficientWithWeapon('Besta Pesada', [
        'Armas Simples',
        'Armas Marciais',
      ]),
    ).to.be.true();
  });

  it('proficiência por arma (plural da regra) acha a arma do catálogo', () => {
    const wizard = ['Adagas', 'Dardos', 'Fundas', 'Bastões', 'Bestas Leves'];
    expect(isProficientWithWeapon('Bordão', wizard)).to.be.true();
    expect(isProficientWithWeapon('Besta Leve', wizard)).to.be.true();
    expect(isProficientWithWeapon('Maça', wizard)).to.be.false();
    const druid = CLASSES[5].weaponProficiencies;
    expect(isProficientWithWeapon('Cimitarra', druid)).to.be.true();
    expect(isProficientWithWeapon('Porrete', druid)).to.be.true();
    expect(isProficientWithWeapon('Espada Curta', druid)).to.be.false();
    expect(
      isProficientWithWeapon('Rapieira', CLASSES[11].weaponProficiencies),
    ).to.be.true();
    expect(
      isProficientWithWeapon(
        'Martelo de Guerra',
        RACES[1].weaponProficiencies!,
      ),
    ).to.be.true();
    expect(
      isProficientWithWeapon(
        'Arco Longo',
        SUBRACES['alto-elfo'].weaponProficiencies!,
      ),
    ).to.be.true();
  });

  it('arma fora do catálogo conta como proficiente', () => {
    expect(isProficientWithWeapon('Montante', ['Armas Simples'])).to.be.true();
  });

  it('subclasses que dão armas marciais entram na lista (Guerra, Tempestade, Bravura)', () => {
    expect(weaponProficiencyList([['Armas Simples']], 'guerra')).to.eql([
      'Armas Simples',
      'Armas Marciais',
    ]);
    expect(weaponProficiencyList([['Armas Simples'], null], 'vida')).to.eql([
      'Armas Simples',
    ]);
    expect(
      weaponProficiencyList([['Armas Simples', 'Armas Marciais']], 'bravura'),
    ).to.eql(['Armas Simples', 'Armas Marciais']);
  });

  it('todas as proficiências específicas das regras apontam pra uma arma do catálogo', () => {
    const specific = [
      ...Object.values(CLASSES).flatMap(c => c.weaponProficiencies),
      ...Object.values(RACES).flatMap(r => r.weaponProficiencies ?? []),
      ...Object.values(SUBRACES).flatMap(r => r.weaponProficiencies ?? []),
    ].filter(p => !/^Armas (Simples|Marciais)$/.test(p));
    // Cada uma aponta pra exatamente uma arma do catálogo (nenhuma ficou sem tradução).
    const unmatched = specific.filter(
      p =>
        Object.keys(WEAPON_CATEGORY).filter(n => isProficientWithWeapon(n, [p]))
          .length !== 1,
    );
    expect(unmatched).to.eql([]);
  });
});
