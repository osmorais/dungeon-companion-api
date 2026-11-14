import {expect} from '@loopback/testlab';
import {
  LANGUAGES,
  TOOL_CHOICES,
  choiceSlots,
  sheetLanguages,
  sheetTools,
  validateLanguageToolChoices,
} from '../../../services/character-sheet/language-tool-choices';
import {
  resolveBackground,
  resolveRace,
} from '../../../services/character-sheet/calculator';
import {BACKGROUNDS} from '../../../services/character-sheet/rules';

describe('idiomas e ferramentas à escolha (1.24.0)', () => {
  // Humano (1 idioma) + Nobre (1 idioma, um kit de jogo).
  const humanNoble = choiceSlots(resolveRace(9), resolveBackground(10));

  it('vagas: idiomas da raça e do antecedente, ferramentas genéricas do antecedente', () => {
    expect(humanNoble.languages).to.equal(2);
    expect(humanNoble.fixed_languages).to.eql(['Comum']);
    expect(humanNoble.tools.map(t => t.placeholder)).to.eql([
      'Um tipo de kit de jogo',
    ]);
    // Anão Soldado de antes, sem idioma à escolha: nenhuma vaga de idioma.
    expect(
      choiceSlots(resolveRace(1), resolveBackground(1)).languages,
    ).to.equal(resolveBackground(1).languages);
  });

  it('aceita escolhas válidas e nada escolhido', () => {
    expect(
      validateLanguageToolChoices(humanNoble, ['Élfico', 'Dracônico'], {
        'Um tipo de kit de jogo': 'Dados',
      }),
    ).to.eql({
      languages: ['Élfico', 'Dracônico'],
      tools: {'Um tipo de kit de jogo': 'Dados'},
    });
    expect(validateLanguageToolChoices(humanNoble, undefined, null)).to.eql({
      languages: [],
      tools: {},
    });
  });

  it('recusa idioma demais, repetido, desconhecido ou que já fala; ferramenta fora da lista', () => {
    const v =
      (langs: unknown, tools: unknown = {}) =>
      () =>
        validateLanguageToolChoices(humanNoble, langs, tools);
    expect(v(['Élfico', 'Anão', 'Orc'])).to.throw(/limite é 2/);
    expect(v(['Élfico', 'Élfico'])).to.throw(/repetido/);
    expect(v(['Klingon'])).to.throw(/desconhecido/);
    expect(v(['Comum'])).to.throw(/já fala/);
    expect(v('Élfico')).to.throw(/inválidos/);
    expect(v([], {'Um tipo de kit de jogo': 'Alaúde'})).to.throw(
      /Opção inválida/,
    );
    expect(v([], {'Kit de Disfarce': 'Dados'})).to.throw(/inesperada/);
  });

  it('a ficha mostra o escolhido e "Idioma à escolha" no que faltar', () => {
    expect(sheetLanguages(humanNoble, null)).to.eql([
      'Comum',
      'Idioma à escolha 1',
      'Idioma à escolha 2',
    ]);
    expect(sheetLanguages(humanNoble, ['Élfico'])).to.eql([
      'Comum',
      'Élfico',
      'Idioma à escolha 1',
    ]);
    expect(
      sheetTools(['Um tipo de kit de jogo', 'Ferramentas de Ladrão'], {
        'Um tipo de kit de jogo': 'Dados',
      }),
    ).to.eql(['Dados', 'Ferramentas de Ladrão']);
    expect(sheetTools(['Um tipo de kit de jogo'], null)).to.eql([
      'Um tipo de kit de jogo',
    ]);
  });

  it('toda ferramenta genérica dos antecedentes tem opções', () => {
    const generic = Object.values(BACKGROUNDS)
      .flatMap(b => b.tools)
      .filter(t => /^Um tipo de|^Ferramentas de Artesão$/.test(t));
    for (const t of generic)
      expect(TOOL_CHOICES[t]?.length ?? 0).to.be.above(3);
    expect(TOOL_CHOICES['Ferramentas de Artesão']).to.containEql(
      'Ferramentas de Ferreiro',
    );
    expect(TOOL_CHOICES['Ferramentas de Artesão']).to.not.containEql(
      'Ferramentas de Ladrão',
    );
    expect(LANGUAGES).to.containEql('Subcomum');
  });
});
