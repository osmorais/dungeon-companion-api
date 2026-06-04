/* eslint-disable @typescript-eslint/naming-convention */
import {CharacterSheet} from '../models/character-sheet-types';

const STAT_LABEL: Record<string, string> = {
  STR: 'Força', DEX: 'Destreza', CON: 'Constituição',
  INT: 'Inteligência', WIS: 'Sabedoria', CHA: 'Carisma',
};

const ATTR_PT_TO_EN: Record<string, string> = {
  FOR: 'STR', DES: 'DEX', CON: 'CON', INT: 'INT', SAB: 'WIS', CAR: 'CHA',
};

function sign(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function esc(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function dot(filled: boolean): string {
  return `<span class="dot${filled ? ' dot-filled' : ''}">${filled ? '⬤' : '○'}</span>`;
}

const STAT_ORDER = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;

export function buildPrintHtml(sheet: CharacterSheet): string {
  const cs = sheet.character_sheet;
  const h = cs.header;
  const c = cs.combat_stats;
  const attrs = cs.attributes_and_saves;

  // ── Attributes ──────────────────────────────────────────────────────────
  const attrBoxes = STAT_ORDER.map(key => {
    const b = attrs[key];
    return `
      <div class="attr-box">
        <div class="attr-name">${STAT_LABEL[key]}</div>
        <div class="attr-mod">${sign(b.modifier)}</div>
        <div class="attr-score">${b.score}</div>
      </div>`;
  }).join('');

  // ── Saving Throws ───────────────────────────────────────────────────────
  const savingThrows = STAT_ORDER.map(key => {
    const b = attrs[key];
    return `
      <div class="check-row">
        ${dot(b.save_proficiency)}
        <span class="check-val">${sign(b.save)}</span>
        <span class="check-name">${STAT_LABEL[key]}</span>
      </div>`;
  }).join('');

  // ── Skills ───────────────────────────────────────────────────────────────
  const skillRows = cs.skills.map(s => {
    const enKey = ATTR_PT_TO_EN[s.attribute_name] ?? s.attribute_name;
    const abbr = enKey.substring(0, 3);
    return `
      <div class="check-row">
        ${dot(s.is_trained)}
        <span class="check-val">${sign(s.total_skill_value)}</span>
        <span class="check-name">${esc(s.name)} <span class="skill-attr">(${abbr})</span></span>
      </div>`;
  }).join('');

  // ── Weapons ──────────────────────────────────────────────────────────────
  const weaponRows = cs.weapons.map(w => `
    <tr>
      <td>${esc(w.name)}</td>
      <td class="center">${sign(w.attack_bonus)}</td>
      <td class="center">${esc(w.damage_die ?? '—')} ${esc(w.damage_type ?? '')}</td>
      <td class="props">${esc(w.properties ?? '—')}</td>
    </tr>`).join('');

  // ── Equipment / Items ────────────────────────────────────────────────────
  const itemsList = cs.equipment.items.map(i => `<li>${esc(i)}</li>`).join('');

  // ── Currency ─────────────────────────────────────────────────────────────
  const currency = cs.equipment.currency;
  const currencyHtml = [
    {label: 'PC', val: currency.cp},
    {label: 'PP', val: currency.sp},
    {label: 'PE', val: currency.ep},
    {label: 'PO', val: currency.gp},
    {label: 'PL', val: currency.pp},
  ].map(c2 => `<div class="coin"><div class="coin-val">${c2.val}</div><div class="coin-label">${c2.label}</div></div>`).join('');

  // ── Proficiencies & Languages ─────────────────────────────────────────────
  const prof = cs.proficiencies_and_languages;
  const profLines = [
    prof.armor.length ? `<p><strong>Armaduras:</strong> ${esc(prof.armor.join(', '))}</p>` : '',
    prof.weapons.length ? `<p><strong>Armas:</strong> ${esc(prof.weapons.join(', '))}</p>` : '',
    prof.tools.length ? `<p><strong>Ferramentas:</strong> ${esc(prof.tools.join(', '))}</p>` : '',
    prof.languages.length ? `<p><strong>Idiomas:</strong> ${esc(prof.languages.join(', '))}</p>` : '',
  ].filter(Boolean).join('');

  // ── Features & Traits ────────────────────────────────────────────────────
  const traitCards = cs.features_and_traits.map(t => `
    <div class="trait-card">
      <div class="trait-header">
        <span class="trait-name">${esc(t.name)}</span>
        <span class="trait-source">${esc(t.source)}</span>
      </div>
      <p class="trait-desc">${esc(t.description)}</p>
    </div>`).join('');

  // ── Spells ────────────────────────────────────────────────────────────────
  let spellsHtml = '';
  if (cs.spellcasting_info || cs.spells.length) {
    const info = cs.spellcasting_info;
    const spellInfoHtml = info ? `
      <div class="spell-info-row">
        <div class="spell-stat"><div class="spell-stat-val">${esc(info.spellcasting_ability)}</div><div class="spell-stat-label">Habilidade</div></div>
        <div class="spell-stat"><div class="spell-stat-val">${info.spell_save_dc}</div><div class="spell-stat-label">CD de Magia</div></div>
        <div class="spell-stat"><div class="spell-stat-val">${sign(info.spell_attack_bonus)}</div><div class="spell-stat-label">Bônus de Ataque</div></div>
      </div>` : '';

    const byLevel: Record<number, typeof cs.spells> = {};
    for (const sp of cs.spells) {
      if (!byLevel[sp.spellLevel]) byLevel[sp.spellLevel] = [];
      byLevel[sp.spellLevel].push(sp);
    }

    const levelLabels: Record<number, string> = {
      0: 'Truques (Nível 0)', 1: '1º Nível', 2: '2º Nível', 3: '3º Nível',
      4: '4º Nível', 5: '5º Nível', 6: '6º Nível', 7: '7º Nível',
      8: '8º Nível', 9: '9º Nível',
    };

    const spellLevelBlocks = Object.keys(byLevel).sort().map(lvl => {
      const level = Number(lvl);
      const spList = byLevel[level].map(sp => {
        const components = [
          sp.is_verbal ? 'V' : '', sp.is_somatic ? 'S' : '', sp.is_material ? 'M' : '',
        ].filter(Boolean).join(', ');
        return `
          <tr>
            <td>${esc(sp.name)}</td>
            <td class="center">${esc(sp.casting_time ?? '—')}</td>
            <td class="center">${sp.range_distance != null ? `${sp.range_distance}m` : '—'}</td>
            <td class="center">${esc(sp.duration ?? '—')}</td>
            <td class="center">${components || '—'}</td>
            <td class="props">${esc(sp.school ?? '—')}</td>
          </tr>`;
      }).join('');
      return `
        <div class="spell-level-block">
          <div class="spell-level-title">${levelLabels[level] ?? `Nível ${level}`}</div>
          <table class="data-table">
            <thead><tr>
              <th>Nome</th><th>Tempo</th><th>Alcance</th><th>Duração</th><th>Componentes</th><th>Escola</th>
            </tr></thead>
            <tbody>${spList}</tbody>
          </table>
        </div>`;
    }).join('');

    spellsHtml = `
      <section class="sheet-section">
        <div class="section-title">Magias</div>
        ${spellInfoHtml}
        ${spellLevelBlocks}
      </section>`;
  }

  // ── Final HTML ────────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ficha — ${esc(h.name)}</title>
<style>
  :root {
    --parchment: #f5e6c8;
    --parchment-dark: #e8d4a0;
    --ink: #1a0800;
    --red: #8b1a1a;
    --border: #7a3b10;
    --shadow: rgba(0,0,0,.18);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #2a1005;
    font-family: 'Georgia', 'Times New Roman', serif;
    color: var(--ink);
    padding: 24px 12px;
  }
  .sheet {
    max-width: 980px;
    margin: 0 auto;
    background: var(--parchment);
    border: 3px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 8px 40px rgba(0,0,0,.7);
    overflow: hidden;
  }

  /* ── Print button ── */
  .print-bar {
    background: var(--red);
    padding: 10px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .print-bar span { color: #f5e6c8; font-size: 13px; letter-spacing: .5px; }
  .btn-print {
    background: #f5e6c8; color: var(--red); border: none;
    padding: 6px 18px; border-radius: 3px; cursor: pointer;
    font-family: inherit; font-size: 13px; font-weight: bold;
    letter-spacing: .5px;
  }
  .btn-print:hover { background: #fff; }

  /* ── Header ── */
  .sheet-header {
    background: var(--red);
    color: #f5e6c8;
    padding: 18px 24px 14px;
  }
  .char-name {
    font-size: 28px;
    letter-spacing: 1px;
    margin-bottom: 10px;
    border-bottom: 1px solid rgba(245,230,200,.4);
    padding-bottom: 8px;
  }
  .header-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
  }
  .header-field { display: flex; flex-direction: column; gap: 2px; }
  .header-field .hf-val { font-size: 15px; font-weight: bold; }
  .header-field .hf-label {
    font-size: 9px; text-transform: uppercase;
    letter-spacing: .8px; opacity: .75;
    border-top: 1px solid rgba(245,230,200,.3);
    padding-top: 3px;
  }

  /* ── Main 3-column grid ── */
  .main-grid {
    display: grid;
    grid-template-columns: 160px 220px 1fr;
    gap: 0;
    border-bottom: 2px solid var(--border);
  }
  .col { padding: 16px 12px; border-right: 1px solid var(--border); }
  .col:last-child { border-right: none; }

  /* ── Attribute boxes ── */
  .attrs { display: flex; flex-direction: column; gap: 8px; }
  .attr-box {
    border: 2px solid var(--border);
    border-radius: 6px;
    background: var(--parchment-dark);
    text-align: center;
    padding: 5px 4px 4px;
  }
  .attr-name { font-size: 9px; text-transform: uppercase; letter-spacing: .5px; color: var(--red); font-weight: bold; }
  .attr-mod { font-size: 26px; font-weight: bold; line-height: 1; margin: 1px 0; }
  .attr-score {
    font-size: 12px;
    background: var(--parchment);
    border: 1px solid var(--border);
    border-radius: 12px;
    display: inline-block;
    padding: 1px 10px;
    margin-top: 2px;
  }

  /* ── Insp + Prof ── */
  .small-stat-row { display: flex; gap: 6px; margin-bottom: 10px; }
  .small-stat {
    flex: 1; border: 2px solid var(--border); border-radius: 5px;
    background: var(--parchment-dark); text-align: center; padding: 5px 2px;
  }
  .small-stat .ss-val { font-size: 18px; font-weight: bold; }
  .small-stat .ss-label { font-size: 8px; text-transform: uppercase; letter-spacing: .4px; color: var(--red); }

  /* ── Check rows (saves/skills) ── */
  .subsection-title {
    font-size: 9px; text-transform: uppercase; letter-spacing: .8px;
    color: var(--red); font-weight: bold;
    border: 1px solid var(--border); border-radius: 3px;
    background: var(--parchment-dark);
    text-align: center; padding: 3px 4px;
    margin-bottom: 5px; margin-top: 10px;
  }
  .check-row {
    display: flex; align-items: center; gap: 5px;
    padding: 2px 0; font-size: 12px;
  }
  .dot { font-size: 10px; color: #aaa; }
  .dot-filled { color: var(--ink); }
  .check-val { font-weight: bold; min-width: 24px; text-align: right; font-size: 12px; }
  .check-name { font-size: 12px; }
  .skill-attr { font-size: 10px; color: #666; }

  /* ── Combat stats ── */
  .combat-row { display: flex; gap: 6px; margin-bottom: 10px; }
  .combat-stat {
    flex: 1; border: 2px solid var(--border); border-radius: 5px;
    background: var(--parchment-dark); text-align: center; padding: 5px 4px;
  }
  .combat-stat .cs-val { font-size: 20px; font-weight: bold; line-height: 1; }
  .combat-stat .cs-label { font-size: 8px; text-transform: uppercase; letter-spacing: .4px; color: var(--red); margin-top: 2px; }

  .hp-box {
    border: 2px solid var(--border); border-radius: 6px;
    background: var(--parchment-dark); padding: 8px 10px; margin-bottom: 10px;
  }
  .hp-box .hp-label { font-size: 8px; text-transform: uppercase; letter-spacing: .6px; color: var(--red); font-weight: bold; margin-bottom: 4px; }
  .hp-row { display: flex; align-items: baseline; gap: 4px; }
  .hp-current { font-size: 28px; font-weight: bold; }
  .hp-sep { font-size: 18px; color: #888; }
  .hp-max { font-size: 18px; color: #555; }
  .hp-temp { font-size: 11px; color: #666; margin-top: 2px; }

  /* ── Passive + dice ── */
  .dice-passive-row { display: flex; gap: 6px; margin-bottom: 10px; }

  /* ── Lower 2-col ── */
  .lower-grid {
    display: grid;
    grid-template-columns: 1fr 380px;
    border-bottom: 2px solid var(--border);
  }
  .lower-col { padding: 16px 14px; border-right: 1px solid var(--border); }
  .lower-col:last-child { border-right: none; }

  /* ── Generic section ── */
  .sheet-section { padding: 16px 18px; border-bottom: 1px solid var(--border); }
  .sheet-section:last-child { border-bottom: none; }
  .section-title {
    font-size: 10px; text-transform: uppercase; letter-spacing: 1px;
    color: #f5e6c8; background: var(--red);
    padding: 4px 10px; border-radius: 3px;
    margin-bottom: 10px; display: inline-block;
  }

  /* ── Tables ── */
  .data-table {
    width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 4px;
  }
  .data-table th {
    background: var(--parchment-dark); color: var(--red);
    font-size: 9px; text-transform: uppercase; letter-spacing: .5px;
    padding: 4px 6px; border: 1px solid var(--border); text-align: left;
  }
  .data-table td {
    padding: 4px 6px; border: 1px solid #d4b87a; font-size: 12px;
  }
  .data-table tr:nth-child(even) td { background: rgba(0,0,0,.04); }
  .center { text-align: center; }
  .props { font-size: 11px; color: #555; }

  /* ── Currency ── */
  .currency-row { display: flex; gap: 8px; margin-top: 8px; }
  .coin {
    flex: 1; border: 2px solid var(--border); border-radius: 50%;
    background: var(--parchment-dark); text-align: center; padding: 5px 2px;
    aspect-ratio: 1;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  }
  .coin-val { font-size: 14px; font-weight: bold; }
  .coin-label { font-size: 8px; text-transform: uppercase; color: var(--red); }

  /* ── Items ── */
  .items-list { list-style: none; columns: 2; gap: 8px; margin-top: 6px; font-size: 12px; }
  .items-list li { padding: 2px 0; border-bottom: 1px dotted #c8a86a; }
  .items-list li::before { content: '◆ '; color: var(--red); font-size: 8px; }

  /* ── Prof & Lang ── */
  .prof-block { font-size: 12px; line-height: 1.8; }
  .prof-block p + p { border-top: 1px dotted #c8a86a; padding-top: 3px; margin-top: 3px; }

  /* ── Traits ── */
  .trait-card {
    border-left: 3px solid var(--red);
    background: var(--parchment-dark);
    padding: 6px 10px; margin-bottom: 8px; border-radius: 0 4px 4px 0;
  }
  .trait-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 3px; }
  .trait-name { font-size: 13px; font-weight: bold; }
  .trait-source { font-size: 10px; color: var(--red); font-style: italic; }
  .trait-desc { font-size: 11px; line-height: 1.5; color: #333; }

  /* ── Spells ── */
  .spell-info-row { display: flex; gap: 12px; margin-bottom: 14px; }
  .spell-stat {
    border: 2px solid var(--border); border-radius: 5px;
    background: var(--parchment-dark); text-align: center; padding: 6px 14px;
  }
  .spell-stat-val { font-size: 22px; font-weight: bold; }
  .spell-stat-label { font-size: 9px; text-transform: uppercase; letter-spacing: .5px; color: var(--red); }
  .spell-level-block { margin-bottom: 14px; }
  .spell-level-title {
    font-size: 11px; font-weight: bold; color: var(--red);
    border-bottom: 1px solid var(--border); padding-bottom: 3px; margin-bottom: 4px;
  }

  /* ── Page break helper ── */
  .page-break { page-break-before: always; }

  @media print {
    body { background: white; padding: 0; }
    .sheet { box-shadow: none; border: none; max-width: 100%; }
    .print-bar { display: none; }
    .data-table th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .section-title { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sheet-header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="sheet">

  <!-- Print bar -->
  <div class="print-bar">
    <span>🎲 Dungeon Companion — Ficha de Personagem</span>
    <button class="btn-print" onclick="window.print()">Imprimir / Salvar PDF</button>
  </div>

  <!-- Header -->
  <div class="sheet-header">
    <div class="char-name">${esc(h.name)}</div>
    <div class="header-grid">
      <div class="header-field">
        <span class="hf-val">${esc(h.class_and_level)}</span>
        <span class="hf-label">Classe &amp; Nível</span>
      </div>
      <div class="header-field">
        <span class="hf-val">${esc(h.background)}</span>
        <span class="hf-label">Antecedente</span>
      </div>
      <div class="header-field">
        <span class="hf-val">${esc(h.race)}</span>
        <span class="hf-label">Raça</span>
      </div>
      <div class="header-field">
        <span class="hf-val">${esc(h.alignment)}</span>
        <span class="hf-label">Alinhamento</span>
      </div>
      <div class="header-field">
        <span class="hf-val">${h.experience_points.toLocaleString('pt-BR')}</span>
        <span class="hf-label">Experiência</span>
      </div>
    </div>
  </div>

  <!-- Main 3-column -->
  <div class="main-grid">

    <!-- Col 1: Attributes -->
    <div class="col">
      <div class="small-stat-row">
        <div class="small-stat">
          <div class="ss-val">${sign(c.proficiency_bonus)}</div>
          <div class="ss-label">Proficiência</div>
        </div>
        <div class="small-stat">
          <div class="ss-val">${c.passive_perception}</div>
          <div class="ss-label">Perc. Passiva</div>
        </div>
      </div>
      <div class="attrs">${attrBoxes}</div>
    </div>

    <!-- Col 2: Saving Throws + Skills -->
    <div class="col">
      <div class="subsection-title">Testes de Resistência</div>
      ${savingThrows}
      <div class="subsection-title">Perícias</div>
      ${skillRows}
    </div>

    <!-- Col 3: Combat -->
    <div class="col">
      <div class="combat-row">
        <div class="combat-stat">
          <div class="cs-val">${c.armor_class}</div>
          <div class="cs-label">Classe de Armadura</div>
        </div>
        <div class="combat-stat">
          <div class="cs-val">${sign(c.initiative)}</div>
          <div class="cs-label">Iniciativa</div>
        </div>
        <div class="combat-stat">
          <div class="cs-val">${esc(c.speed)}</div>
          <div class="cs-label">Deslocamento</div>
        </div>
      </div>

      <div class="hp-box">
        <div class="hp-label">Pontos de Vida</div>
        <div class="hp-row">
          <span class="hp-current">${c.hit_points.current}</span>
          <span class="hp-sep">/</span>
          <span class="hp-max">${c.hit_points.max}</span>
        </div>
        <div class="hp-temp">Temporários: ${c.hit_points.temporary}</div>
      </div>

      <div class="combat-row">
        <div class="combat-stat">
          <div class="cs-val">${esc(c.hit_dice)}</div>
          <div class="cs-label">Dado de Vida</div>
        </div>
      </div>

      ${weaponRows ? `
      <div class="subsection-title" style="margin-top:12px">Ataques &amp; Ações</div>
      <table class="data-table">
        <thead><tr>
          <th>Arma</th><th>Ataque</th><th>Dano</th><th>Propriedades</th>
        </tr></thead>
        <tbody>${weaponRows}</tbody>
      </table>` : ''}
    </div>

  </div><!-- /main-grid -->

  <!-- Lower 2-column -->
  <div class="lower-grid">

    <!-- Left: Equipment + Proficiencies -->
    <div class="lower-col">
      <div class="section-title">Equipamento</div>
      <div class="currency-row">${currencyHtml}</div>
      ${itemsList ? `<ul class="items-list" style="margin-top:10px">${itemsList}</ul>` : '<p style="font-size:12px;color:#888;margin-top:8px">Nenhum item.</p>'}

      <div class="section-title" style="margin-top:16px">Proficiências &amp; Idiomas</div>
      <div class="prof-block">${profLines || '<p style="font-size:12px;color:#888">—</p>'}</div>
    </div>

    <!-- Right: Features & Traits -->
    <div class="lower-col">
      <div class="section-title">Características &amp; Traços</div>
      ${traitCards || '<p style="font-size:12px;color:#888">Nenhuma característica.</p>'}
    </div>

  </div><!-- /lower-grid -->

  <!-- Spells -->
  ${spellsHtml}

</div><!-- /sheet -->
</body>
</html>`;
}
