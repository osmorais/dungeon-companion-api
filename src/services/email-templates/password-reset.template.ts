export function passwordResetTemplate(link: string, logoUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Redefinição de Senha</title>
</head>
<body style="margin:0;padding:0;background-color:#0d0d1a;font-family:'Courier New',Courier,monospace;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0d0d1a;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <img src="${logoUrl}" alt="Forja Arcana" width="120" height="120"
                   style="display:block;image-rendering:pixelated;" />
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="
              background-color:#1a1a2e;
              border:3px solid #7c3aed;
              box-shadow:4px 4px 0 #4c1d95;
              padding:36px 40px;
            ">

              <!-- Title -->
              <p style="margin:0 0 8px;font-size:10px;letter-spacing:4px;color:#7c3aed;text-transform:uppercase;">
                ✦ MISSÃO RECEBIDA ✦
              </p>
              <h1 style="margin:0 0 24px;font-size:22px;color:#e2e8f0;letter-spacing:2px;line-height:1.3;">
                REDEFINIÇÃO<br/>DE SENHA
              </h1>

              <!-- Divider -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="border-top:2px solid #7c3aed;font-size:0;">&nbsp;</td>
                </tr>
              </table>

              <!-- Body text -->
              <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;line-height:1.7;">
                Saudações, Aventureiro.
              </p>
              <p style="margin:0 0 24px;font-size:14px;color:#94a3b8;line-height:1.7;">
                Uma solicitação de redefinição de senha foi registrada nos grimórios da Forja Arcana.
                Se foi você, use o feitiço abaixo para forjar uma nova senha. O encantamento expira em
                <strong style="color:#e2e8f0;">1 hora</strong>.
              </p>

              <!-- Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td align="center" style="
                    background-color:#7c3aed;
                    box-shadow:4px 4px 0 #4c1d95;
                  ">
                    <a href="${link}" style="
                      display:inline-block;
                      padding:14px 32px;
                      font-family:'Courier New',Courier,monospace;
                      font-size:13px;
                      font-weight:bold;
                      letter-spacing:3px;
                      text-transform:uppercase;
                      color:#ffffff;
                      text-decoration:none;
                    ">▶ REDEFINIR SENHA</a>
                  </td>
                </tr>
              </table>

              <!-- Fallback link -->
              <p style="margin:0 0 24px;font-size:11px;color:#64748b;line-height:1.6;">
                Se o botão não funcionar, copie e cole o link abaixo no seu navegador:<br/>
                <a href="${link}" style="color:#7c3aed;word-break:break-all;">${link}</a>
              </p>

              <!-- Divider -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                <tr>
                  <td style="border-top:2px solid #2d2d4e;font-size:0;">&nbsp;</td>
                </tr>
              </table>

              <!-- Warning -->
              <p style="margin:0;font-size:11px;color:#64748b;line-height:1.6;">
                ⚠ Se você não solicitou esta redefinição, ignore esta mensagem. Sua senha permanece protegida.
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:11px;color:#4a5568;letter-spacing:2px;">
                FORJA ARCANA © 2025 · TODOS OS DIREITOS RESERVADOS
              </p>
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
