/** Escapa texto que entra no HTML do e-mail (nome de usuário, link). */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/*
 * Cores do tema FANTASIA do site (styles.scss do web): fundo, painel, borda, botão, dourado.
 * O e-mail é escuro de propósito e se declara só escuro (color-scheme), pra o app de e-mail não
 * "inverter" as cores no modo escuro do celular. Proteções, uma por família de app:
 * - meta/CSS color-scheme: Apple Mail e iOS respeitam e não mexem;
 * - fundo também em background-image (gradiente de uma cor): o Gmail inverte background-color,
 *   mas não imagem;
 * - classes .gm-screen/.gm-diff (só no Gmail, via "u + .body"): desfazem a inversão do texto;
 * - [data-ogsc]/[data-ogsb] (Outlook): reaplicam as cores originais.
 */
const BG = '#1d0a0a';
const PANEL = '#40190b';
const BORDER = '#99430a';
const BTN = '#6b1616';
const GOLD = '#ccaa44';
const ACCENT = '#ffaa00';
const TEXT = '#efeeeb';
const MUTED = '#b89a86';

const bg = (color: string) =>
  `background-color:${color};background-image:linear-gradient(${color},${color});`;

/** Texto protegido da inversão do Gmail. */
const keep = (html: string, inline = false) => {
  const tag = inline ? 'span' : 'div';
  const display = inline ? 'display:inline-block;' : '';
  return `<${tag} class="gm-screen" style="${display}"><${tag} class="gm-diff" style="${display}">${html}</${tag}></${tag}>`;
};

export function passwordResetTemplate(
  link: string,
  logoUrl: string,
  username?: string | null,
): string {
  const safeLink = escapeHtml(link);
  const greetingName = username ? escapeHtml(username) : 'aventureiro';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>Redefinição de Senha</title>
  <style>
    :root { color-scheme: dark; supported-color-schemes: dark; }
    u + .body .gm-screen { background: #000000; mix-blend-mode: screen; }
    u + .body .gm-diff { background: #000000; mix-blend-mode: difference; }
    [data-ogsc] .c-text { color: ${TEXT} !important; }
    [data-ogsc] .c-gold { color: ${GOLD} !important; }
    [data-ogsc] .c-muted { color: ${MUTED} !important; }
    [data-ogsb] .b-bg { background-color: ${BG} !important; }
    [data-ogsb] .b-panel { background-color: ${PANEL} !important; }
    [data-ogsb] .b-btn { background-color: ${BTN} !important; }
  </style>
</head>
<body class="body" style="margin:0;padding:0;${bg(BG)}font-family:'Courier New',Courier,monospace;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BG}" class="b-bg" style="${bg(BG)}padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:20px;">
              <img src="${logoUrl}" alt="Forja Arcana" width="112" height="112"
                   style="display:block;image-rendering:pixelated;border:0;" />
            </td>
          </tr>

          <!-- Painel -->
          <tr>
            <td bgcolor="${PANEL}" class="b-panel" style="${bg(PANEL)}border:3px solid ${BORDER};box-shadow:4px 4px 0 #000000;padding:32px 32px 28px;">

              ${keep(`<p class="c-gold" style="margin:0 0 10px;font-size:11px;letter-spacing:4px;color:${GOLD};text-transform:uppercase;font-weight:bold;">✦ Missão recebida ✦</p>`)}
              ${keep(`<h1 class="c-text" style="margin:0 0 22px;font-size:22px;color:${TEXT};letter-spacing:2px;line-height:1.35;font-weight:bold;">REDEFINIÇÃO<br/>DE SENHA</h1>`)}

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">
                <tr><td style="border-top:2px solid ${BORDER};font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>

              ${keep(`<p class="c-text" style="margin:0 0 12px;font-size:15px;color:${TEXT};line-height:1.7;">Saudações, <strong class="c-gold" style="color:${GOLD};">${greetingName}</strong>.</p>`)}
              ${keep(`<p class="c-text" style="margin:0 0 26px;font-size:14px;color:${TEXT};line-height:1.7;">Uma solicitação de redefinição de senha foi registrada nos grimórios da Forja Arcana. Se foi você, use o feitiço abaixo para forjar uma nova senha. O encantamento expira em <strong class="c-gold" style="color:${GOLD};">1 hora</strong>.</p>`)}

              <!-- Botão -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 26px;">
                <tr>
                  <td align="center" bgcolor="${BTN}" class="b-btn" style="${bg(BTN)}border:2px solid ${BORDER};box-shadow:3px 3px 0 #000000;">
                    <a href="${safeLink}" style="display:inline-block;padding:14px 28px;font-family:'Courier New',Courier,monospace;font-size:14px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;color:${ACCENT};text-decoration:none;">${keep(`<span style="color:${ACCENT};">▶ Redefinir senha</span>`, true)}</a>
                  </td>
                </tr>
              </table>

              ${keep(`<p class="c-muted" style="margin:0 0 22px;font-size:12px;color:${MUTED};line-height:1.6;">Se o botão não funcionar, copie e cole o link abaixo no seu navegador:<br/><a href="${safeLink}" style="color:${ACCENT};word-break:break-all;">${safeLink}</a></p>`)}

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px;">
                <tr><td style="border-top:2px solid ${BORDER};font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>

              ${keep(`<p class="c-muted" style="margin:0;font-size:12px;color:${MUTED};line-height:1.6;">⚠ Se você não pediu esta redefinição, ignore esta mensagem. Sua senha continua protegida.</p>`)}

            </td>
          </tr>

          <!-- Rodapé -->
          <tr>
            <td align="center" style="padding-top:22px;">
              ${keep(`<p class="c-muted" style="margin:0;font-size:11px;color:${MUTED};letter-spacing:2px;">FORJA ARCANA · forjaarcana.com</p>`)}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}
