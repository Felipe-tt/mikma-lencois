interface ActionEmailInput {
  greetingName: string;
  /** Texto explicando o que aconteceu e o que o botão faz */
  introText: string;
  buttonLabel: string;
  actionUrl: string;
  /** Texto de aviso de segurança (ex: "se você não pediu isso...") */
  securityNote: string;
  /** Texto pequeno embaixo, em geral mencionando o tempo de validade */
  expiryNote: string;
}

interface DeliveryStatusEmailInput {
  greetingName: string;
  headline: string;
  bodyText: string;
  buttonLabel: string;
  actionUrl: string;
}

/**
 * E-mail curto de atualização de status de entrega (saiu para entrega,
 * entregue, etc). Mesmo layout do actionButtonEmailHtml, só que sem o
 * bloco de "security note" (não é uma ação sensível, é só um aviso).
 */
export function deliveryStatusEmailHtml({
  greetingName,
  headline,
  bodyText,
  buttonLabel,
  actionUrl,
}: DeliveryStatusEmailInput): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F5;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#ffffff;border:1px solid #E6DFD5;">
        <tr><td style="background:#1E1208;padding:32px;text-align:center;">
          <p style="margin:0;color:#FAF8F5;font-size:22px;font-style:italic;letter-spacing:1px;">Mikma Lençóis</p>
        </td></tr>
        <tr><td style="padding:40px 36px;">
          <p style="margin:0 0 4px;font-size:13px;color:#C4714A;font-weight:bold;text-transform:uppercase;letter-spacing:0.06em;">${headline}</p>
          <p style="margin:0 0 8px;font-size:18px;color:#1E1208;font-weight:bold;">Olá, ${greetingName}!</p>
          <p style="margin:0 0 28px;font-size:15px;color:#705A48;line-height:1.6;">${bodyText}</p>

          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:0 0 8px;">
              <a href="${actionUrl}" target="_blank" style="display:inline-block;background:#C4714A;color:#ffffff;
                font-family:Georgia,serif;font-size:16px;font-weight:bold;text-decoration:none;
                padding:16px 40px;border-radius:4px;">
                ${buttonLabel}
              </a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="background:#FAF8F5;border-top:1px solid #E6DFD5;padding:20px 36px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#B09C8C;">Mikma Lençóis · Blumenau, SC</p>
          <p style="margin:4px 0 0;font-size:11px;color:#C8BAB0;">Este é um e-mail automático — não responda.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * E-mail com botão de ação central — usado tanto para confirmar e-mail no
 * cadastro quanto para redefinir senha. Em vez de pedir para o usuário
 * digitar um código de 6 dígitos, o botão já leva para a página certa com
 * o token de verificação na URL, sem nenhuma digitação manual.
 *
 * Inclui o link em texto puro como alternativa, para clientes de e-mail
 * que bloqueiam botões/HTML rico (raro, mas existe).
 */
export function actionButtonEmailHtml({
  greetingName,
  introText,
  buttonLabel,
  actionUrl,
  securityNote,
  expiryNote,
}: ActionEmailInput): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F5;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#ffffff;border:1px solid #E6DFD5;">
        <!-- Header -->
        <tr><td style="background:#1E1208;padding:32px;text-align:center;">
          <p style="margin:0;color:#FAF8F5;font-size:22px;font-style:italic;letter-spacing:1px;">Mikma Lençóis</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:40px 36px;">
          <p style="margin:0 0 8px;font-size:18px;color:#1E1208;font-weight:bold;">Olá, ${greetingName}!</p>
          <p style="margin:0 0 28px;font-size:15px;color:#705A48;line-height:1.6;">${introText}</p>

          <!-- Botão -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:0 0 24px;">
              <a href="${actionUrl}" target="_blank" style="display:inline-block;background:#C4714A;color:#ffffff;
                font-family:Georgia,serif;font-size:16px;font-weight:bold;text-decoration:none;
                padding:16px 40px;border-radius:4px;">
                ${buttonLabel}
              </a>
            </td></tr>
          </table>

          <p style="margin:0 0 24px;font-size:12px;color:#B09C8C;text-align:center;">${expiryNote}</p>

          <!-- Fallback: link em texto puro -->
          <p style="margin:0 0 24px;font-size:12px;color:#B09C8C;line-height:1.6;">
            Se o botão não funcionar, copie e cole este link no navegador:<br>
            <a href="${actionUrl}" style="color:#C4714A;word-break:break-all;">${actionUrl}</a>
          </p>

          <div style="background:#FFF8F0;border-left:3px solid #C4714A;padding:12px 16px;">
            <p style="margin:0;font-size:13px;color:#705A48;">${securityNote}</p>
          </div>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#FAF8F5;border-top:1px solid #E6DFD5;padding:20px 36px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#B09C8C;">Mikma Lençóis · Blumenau, SC</p>
          <p style="margin:4px 0 0;font-size:11px;color:#C8BAB0;">Este é um e-mail automático — não responda.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
