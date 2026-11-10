import { randomUUID } from "node:crypto";
import { APP_CONFIG } from "@/config/brand";
import { prisma } from "@/lib/prisma";
import {
  EmailDeliveryLogItem,
  EmailEvento,
  EnviarEmailInput,
  EnviarEmailInputSchema,
} from "@/server/schemas/email.schema";

const inMemoryDeliveryLogs: EmailDeliveryLogItem[] = [];

export interface ResultadoEnvioEmail {
  ok: boolean;
  skipped: boolean;
  status: "ENVIADO" | "FALHA" | "IGNORADO_SEM_CHAVE";
  providerMessageId?: string | null;
  logId: string;
  reason?: string;
  error?: string;
}

export function resetInMemoryDeliveryLogs(): void {
  inMemoryDeliveryLogs.length = 0;
}

export function listarLogsEntregaEmail(options?: {
  tenantId?: string | null;
  canal?: "EMAIL" | "WHATSAPP";
  limite?: number;
}): EmailDeliveryLogItem[] {
  const filtrados = inMemoryDeliveryLogs.filter((item) => {
    if (options?.tenantId && item.tenantId !== options.tenantId) return false;
    if (options?.canal && item.canal !== options.canal) return false;
    return true;
  });

  const limite = options?.limite ?? 50;
  return filtrados.slice(-limite).reverse();
}

export async function registrarDeliveryLog(params: {
  canal: "EMAIL" | "WHATSAPP";
  evento: string;
  destinatario: string;
  assunto?: string | null;
  status: "ENVIADO" | "FALHA" | "IGNORADO_SEM_CHAVE" | "PAUSADO_OPT_OUT";
  providerMessageId?: string | null;
  erro?: string | null;
  tenantId?: string | null;
  userId?: string | null;
}): Promise<EmailDeliveryLogItem> {
  const item: EmailDeliveryLogItem = {
    id: `dlv_${randomUUID().slice(0, 12)}`,
    canal: params.canal,
    evento: params.evento,
    destinatario: params.destinatario,
    assunto: params.assunto ?? null,
    status: params.status,
    providerMessageId: params.providerMessageId ?? null,
    erro: params.erro ?? null,
    tenantId: params.tenantId ?? null,
    userId: params.userId ?? null,
    criadoEm: new Date(),
  };

  inMemoryDeliveryLogs.push(item);

  try {
    await (prisma as any).notificationDeliveryLog.create({
      data: {
        id: item.id,
        canal: item.canal,
        evento: item.evento,
        destinatario: item.destinatario,
        assunto: item.assunto,
        status: item.status,
        providerMessageId: item.providerMessageId,
        erro: item.erro,
        tenantId: item.tenantId,
        userId: item.userId,
        criadoEm: item.criadoEm,
      },
    });
  } catch {
    // Fallback em memória quando PostgreSQL não estiver ativo
  }

  return item;
}

function escapeHtml(text: string): string {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resolverAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ||
    process.env.NEXTAUTH_URL?.replace(/\/+$/, "") ||
    "http://localhost:3010"
  );
}

/**
 * Monta e-mail corporativo alinhado ao IBM Carbon Design System (geometria limpa,
 * contraste alto e sem tonalidades roxas/violetas).
 */
export function renderizarTemplateEmailCarbon(params: {
  titulo: string;
  subtitulo?: string;
  corpoHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  rodapeExtra?: string;
}): string {
  const marca = escapeHtml(APP_CONFIG.brandName);
  const titulo = escapeHtml(params.titulo);
  const subtitulo = params.subtitulo ? escapeHtml(params.subtitulo) : "";
  const ctaBlock =
    params.ctaLabel && params.ctaUrl
      ? `
        <div style="margin: 24px 0 8px 0;">
          <a
            href="${escapeHtml(params.ctaUrl)}"
            style="display: inline-block; background-color: #0f62fe; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 20px; border-radius: 2px;"
          >
            ${escapeHtml(params.ctaLabel)}
          </a>
        </div>
      `
      : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${titulo}</title>
</head>
<body style="margin: 0; padding: 24px; background-color: #f4f4f4; font-family: 'IBM Plex Sans', Arial, sans-serif; color: #161616;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 620px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e0e0e0; border-top: 4px solid #0f62fe;">
    <tr>
      <td style="padding: 20px 24px; background-color: #161616; color: #ffffff;">
        <div style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #a8a8a8; margin-bottom: 4px;">
          ${marca}
        </div>
        <h1 style="margin: 0; font-size: 20px; font-weight: 600; color: #ffffff;">
          ${titulo}
        </h1>
        ${subtitulo ? `<p style="margin: 6px 0 0 0; font-size: 13px; color: #c6c6c6;">${subtitulo}</p>` : ""}
      </td>
    </tr>
    <tr>
      <td style="padding: 24px; font-size: 14px; line-height: 1.6; color: #161616;">
        ${params.corpoHtml}
        ${ctaBlock}
      </td>
    </tr>
    <tr>
      <td style="padding: 16px 24px; background-color: #f4f4f4; border-top: 1px solid #e0e0e0; font-size: 12px; color: #525252;">
        <div>Mensagem automática enviada pelo ${marca}.</div>
        ${params.rodapeExtra ? `<div style="margin-top: 4px;">${escapeHtml(params.rodapeExtra)}</div>` : ""}
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Envia e-mail transacional via API oficial da Resend com fallback seguro caso
 * RESEND_API_KEY ainda não esteja configurada.
 */
export async function enviarEmailTransacional(
  rawInput: EnviarEmailInput,
): Promise<ResultadoEnvioEmail> {
  const parsed = EnviarEmailInputSchema.parse(rawInput);
  const destinatarios = Array.isArray(parsed.para) ? parsed.para : [parsed.para];
  const destinatarioLog = destinatarios.join(", ");
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.EMAIL_FROM?.trim() || `${APP_CONFIG.brandName} <noreply@apontatech.com.br>`;

  if (!apiKey) {
    const log = await registrarDeliveryLog({
      canal: "EMAIL",
      evento: parsed.evento,
      destinatario: destinatarioLog,
      assunto: parsed.assunto,
      status: "IGNORADO_SEM_CHAVE",
      erro: "RESEND_API_KEY não configurada",
      tenantId: parsed.tenantId,
      userId: parsed.userId,
    });

    if (process.env.VITEST !== "true") {
      console.info(
        `[ResendFallback] E-mail '${parsed.assunto}' para '${destinatarioLog}' registrado em modo simulado (sem RESEND_API_KEY).`,
      );
    }

    return {
      ok: false,
      skipped: true,
      status: "IGNORADO_SEM_CHAVE",
      reason: "MISSING_RESEND_API_KEY",
      logId: log.id,
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: destinatarios,
        subject: parsed.assunto,
        html: parsed.html,
        ...(parsed.texto ? { text: parsed.texto } : {}),
        ...(parsed.replyTo ? { reply_to: parsed.replyTo } : {}),
      }),
    });

    const json = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      error?: string;
    };

    if (!response.ok) {
      const erroMsg = json.message || json.error || `HTTP ${response.status} ao enviar e-mail Resend`;
      const log = await registrarDeliveryLog({
        canal: "EMAIL",
        evento: parsed.evento,
        destinatario: destinatarioLog,
        assunto: parsed.assunto,
        status: "FALHA",
        erro: erroMsg,
        tenantId: parsed.tenantId,
        userId: parsed.userId,
      });

      return {
        ok: false,
        skipped: false,
        status: "FALHA",
        error: erroMsg,
        logId: log.id,
      };
    }

    const log = await registrarDeliveryLog({
      canal: "EMAIL",
      evento: parsed.evento,
      destinatario: destinatarioLog,
      assunto: parsed.assunto,
      status: "ENVIADO",
      providerMessageId: json.id ?? null,
      tenantId: parsed.tenantId,
      userId: parsed.userId,
    });

    return {
      ok: true,
      skipped: false,
      status: "ENVIADO",
      providerMessageId: json.id ?? null,
      logId: log.id,
    };
  } catch (err: any) {
    const erroMsg = err?.message || "Erro de rede ao comunicar com API Resend";
    const log = await registrarDeliveryLog({
      canal: "EMAIL",
      evento: parsed.evento,
      destinatario: destinatarioLog,
      assunto: parsed.assunto,
      status: "FALHA",
      erro: erroMsg,
      tenantId: parsed.tenantId,
      userId: parsed.userId,
    });

    return {
      ok: false,
      skipped: false,
      status: "FALHA",
      error: erroMsg,
      logId: log.id,
    };
  }
}

export async function enviarEmailBoasVindas(params: {
  nome: string;
  email: string;
  razaoSocial: string;
  cnpj: string;
  diasTrial?: number;
  tenantId?: string | null;
  userId?: string | null;
}): Promise<ResultadoEnvioEmail> {
  const dias = params.diasTrial ?? 14;
  const appUrl = resolverAppUrl();
  const html = renderizarTemplateEmailCarbon({
    titulo: "Boas-vindas ao plano Grátis - Pro",
    subtitulo: `${params.razaoSocial} • CNPJ ${params.cnpj}`,
    corpoHtml: `
      <p>Olá, <strong>${escapeHtml(params.nome)}</strong>!</p>
      <p>
        Sua empresa <strong>${escapeHtml(params.razaoSocial)}</strong> foi cadastrada com sucesso no
        <strong>${escapeHtml(APP_CONFIG.brandName)}</strong> e já conta com acesso liberado em modo
        <strong>Grátis - Pro</strong> por <strong>${dias} dias</strong>.
      </p>
      <ul style="padding-left: 18px; color: #393939;">
        <li>Importe seu Cartão CNPJ em <em>Configurações</em> para preencher sua empresa automaticamente.</li>
        <li>Suba suas certidões em <em>Documentação</em> para o Raio-X IA validar habilitação.</li>
        <li>Acompanhe oportunidades diárias selecionadas para seus segmentos e CNAEs.</li>
      </ul>
    `,
    ctaLabel: "Acessar Meu Painel",
    ctaUrl: `${appUrl}/dashboard`,
  });

  return enviarEmailTransacional({
    para: params.email,
    assunto: `Boas-vindas ao ${APP_CONFIG.brandName} — ${dias} dias Grátis - Pro`,
    html,
    evento: "BOAS_VINDAS",
    tenantId: params.tenantId,
    userId: params.userId,
  });
}

export async function enviarEmailRecuperacaoSenha(params: {
  nome?: string | null;
  email: string;
  token?: string | null;
  userId?: string | null;
}): Promise<ResultadoEnvioEmail> {
  const appUrl = resolverAppUrl();
  const linkReset = params.token
    ? `${appUrl}/esqueci-senha?token=${encodeURIComponent(params.token)}`
    : `${appUrl}/esqueci-senha`;
  const saudacao = params.nome?.trim() ? escapeHtml(params.nome.trim()) : "Usuário";

  const html = renderizarTemplateEmailCarbon({
    titulo: "Recuperação de Senha",
    subtitulo: "Solicitação de redefinição de acesso",
    corpoHtml: `
      <p>Olá, <strong>${saudacao}</strong>.</p>
      <p>
        Recebemos uma solicitação de recuperação de senha para a conta associada a este e-mail.
        Caso não tenha sido você, nenhuma ação adicional é necessária.
      </p>
      ${
        params.token
          ? `<p style="padding: 12px; background: #f4f4f4; border-left: 3px solid #0f62fe;">Código de validação temporário: <strong>${escapeHtml(params.token)}</strong> (válido por 30 minutos)</p>`
          : ""
      }
    `,
    ctaLabel: "Redefinir Senha",
    ctaUrl: linkReset,
    rodapeExtra: "Por segurança, nunca compartilhe este link ou código com terceiros.",
  });

  return enviarEmailTransacional({
    para: params.email,
    assunto: `Recuperação de Senha — ${APP_CONFIG.brandName}`,
    html,
    evento: "RECUPERACAO_SENHA",
    userId: params.userId,
  });
}

export async function enviarEmailConviteEquipe(params: {
  destinatarioEmail: string;
  role: string;
  razaoSocial: string;
  convidadoPor: string;
  token: string;
  tenantId?: string | null;
}): Promise<ResultadoEnvioEmail> {
  const appUrl = resolverAppUrl();
  const acceptUrl = `${appUrl}/cadastro?convite=${encodeURIComponent(params.token)}`;

  const html = renderizarTemplateEmailCarbon({
    titulo: "Convite para Equipe",
    subtitulo: params.razaoSocial,
    corpoHtml: `
      <p>Você foi convidado por <strong>${escapeHtml(params.convidadoPor)}</strong> para colaborar na empresa <strong>${escapeHtml(params.razaoSocial)}</strong>.</p>
      <p>Perfil atribuído: <strong>${escapeHtml(params.role)}</strong></p>
      <p>Token de acesso: <code style="background:#f4f4f4;padding:2px 6px;">${escapeHtml(params.token)}</code></p>
    `,
    ctaLabel: "Aceitar Convite",
    ctaUrl: acceptUrl,
    rodapeExtra: "Este convite expira em 7 dias.",
  });

  return enviarEmailTransacional({
    para: params.destinatarioEmail,
    assunto: `Convite para equipe — ${params.razaoSocial}`,
    html,
    evento: "CONVITE_EQUIPE",
    tenantId: params.tenantId,
  });
}

export async function enviarEmailProtocoloSuporte(params: {
  destinatarioEmail: string;
  protocolo: string;
  autorNome: string;
  assunto: string;
  categoria?: string;
  urgencia?: string;
  mensagem: string;
  isAtualizacao?: boolean;
  isEquipeInterna?: boolean;
  tenantId?: string | null;
  userId?: string | null;
}): Promise<ResultadoEnvioEmail> {
  const appUrl = resolverAppUrl();
  const evento: EmailEvento = params.isAtualizacao ? "SUPORTE_ATUALIZACAO" : "SUPORTE_PROTOCOLO";
  const titulo = params.isEquipeInterna
    ? `Novo Chamado ${params.protocolo}`
    : params.isAtualizacao
      ? `Atualização no Protocolo ${params.protocolo}`
      : `Protocolo Aberto: ${params.protocolo}`;

  const html = renderizarTemplateEmailCarbon({
    titulo,
    subtitulo: `${params.assunto} • Urgência: ${params.urgencia || "MEDIA"}`,
    corpoHtml: `
      <p><strong>Protocolo:</strong> ${escapeHtml(params.protocolo)}</p>
      <p><strong>Solicitante:</strong> ${escapeHtml(params.autorNome)}</p>
      ${params.categoria ? `<p><strong>Categoria:</strong> ${escapeHtml(params.categoria)}</p>` : ""}
      <div style="margin-top: 12px; padding: 14px; background: #f4f4f4; border-left: 3px solid #0f62fe;">
        ${escapeHtml(params.mensagem)}
      </div>
    `,
    ctaLabel: "Acompanhar no Sistema",
    ctaUrl: `${appUrl}/dashboard`,
  });

  return enviarEmailTransacional({
    para: params.destinatarioEmail,
    assunto: `[${params.protocolo}] ${params.assunto}`,
    html,
    evento,
    tenantId: params.tenantId,
    userId: params.userId,
  });
}

export async function enviarEmailAlertaVencimento(params: {
  destinatarioEmail: string;
  nomeItem: string;
  tipoItem: "DOCUMENTO" | "PORTAL" | "LICITACAO";
  diasRestantes: number;
  descricao: string;
  linkDestino?: string;
  tenantId?: string | null;
  userId?: string | null;
}): Promise<ResultadoEnvioEmail> {
  const appUrl = resolverAppUrl();
  const evento: EmailEvento =
    params.tipoItem === "PORTAL" ? "VENCIMENTO_PORTAL" : "VENCIMENTO_DOCUMENTO";
  const labelPrazo =
    params.diasRestantes < 0
      ? `Vencido há ${Math.abs(params.diasRestantes)} dia(s)`
      : params.diasRestantes === 0
        ? "Vence hoje"
        : `Expira em ${params.diasRestantes} dia(s)`;

  const html = renderizarTemplateEmailCarbon({
    titulo: `Alerta de Vencimento: ${params.nomeItem}`,
    subtitulo: labelPrazo,
    corpoHtml: `
      <p>Identificamos uma pendência crítica que exige atenção imediata:</p>
      <div style="padding: 14px; background: #f4f4f4; border-left: 3px solid #da1e28;">
        <strong>${escapeHtml(params.nomeItem)}</strong> — ${escapeHtml(labelPrazo)}<br />
        <span style="color: #525252;">${escapeHtml(params.descricao)}</span>
      </div>
    `,
    ctaLabel: "Regularizar Agora",
    ctaUrl: `${appUrl}${params.linkDestino || "/documentacao"}`,
  });

  return enviarEmailTransacional({
    para: params.destinatarioEmail,
    assunto: `[Alerta] ${params.nomeItem} (${labelPrazo})`,
    html,
    evento,
    tenantId: params.tenantId,
    userId: params.userId,
  });
}

export async function enviarEmailFaturamento(params: {
  destinatarioEmail: string;
  tipo: "CHECKOUT" | "CONFIRMADO" | "ATRASO" | "CANCELADO";
  razaoSocial: string;
  plano: string;
  valor?: number | null;
  invoiceUrl?: string | null;
  tenantId?: string | null;
}): Promise<ResultadoEnvioEmail> {
  const appUrl = resolverAppUrl();
  const valorFmt =
    typeof params.valor === "number"
      ? params.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : null;

  const textos = {
    CHECKOUT: {
      evento: "FATURAMENTO_CHECKOUT" as EmailEvento,
      titulo: `Assinatura Plano ${params.plano} — Fatura Gerada`,
      resumo: `Sua solicitação de assinatura do plano ${params.plano}${valorFmt ? ` (${valorFmt}/mês)` : ""} foi registrada no Asaas.`,
    },
    CONFIRMADO: {
      evento: "FATURAMENTO_CONFIRMADO" as EmailEvento,
      titulo: `Pagamento Confirmado — Plano ${params.plano}`,
      resumo: `Confirmamos o pagamento da assinatura da empresa ${params.razaoSocial}. Seu acesso está 100% ativo por mais 30 dias.`,
    },
    ATRASO: {
      evento: "FATURAMENTO_ATRASO" as EmailEvento,
      titulo: `Aviso de Fatura em Aberto — ${params.razaoSocial}`,
      resumo: `Identificamos atraso na cobrança do plano ${params.plano}. Regularize dentro do período de tolerância para evitar suspensão.`,
    },
    CANCELADO: {
      evento: "FATURAMENTO_CANCELADO" as EmailEvento,
      titulo: `Assinatura Cancelada — ${params.razaoSocial}`,
      resumo: `Sua assinatura do plano ${params.plano} foi cancelada conforme notificação do gateway de pagamentos.`,
    },
  }[params.tipo];

  const normalizedInvoiceUrl =
    params.invoiceUrl && params.invoiceUrl.startsWith("/")
      ? `${appUrl}${params.invoiceUrl}`
      : params.invoiceUrl;

  const html = renderizarTemplateEmailCarbon({
    titulo: textos.titulo,
    subtitulo: params.razaoSocial,
    corpoHtml: `
      <p>${escapeHtml(textos.resumo)}</p>
      ${valorFmt ? `<p><strong>Valor:</strong> ${escapeHtml(valorFmt)}</p>` : ""}
    `,
    ctaLabel: normalizedInvoiceUrl ? "Acessar Fatura / Cobrança" : "Ver Meu Plano",
    ctaUrl: normalizedInvoiceUrl || `${appUrl}/planos`,
  });

  return enviarEmailTransacional({
    para: params.destinatarioEmail,
    assunto: `${textos.titulo} — ${APP_CONFIG.brandName}`,
    html,
    evento: textos.evento,
    tenantId: params.tenantId,
  });
}

