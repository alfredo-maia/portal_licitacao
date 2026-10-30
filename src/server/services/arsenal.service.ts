import {
  AlertaChatPregoeiro,
  calcularLanceMinimoEBdi,
  canUseArsenalFeature,
  consultarInteligenciaPrecosConcorrentes,
  gerarMinutaImpugnacaoIA,
  gerarPropostaComercialTimbrada,
  gerarRelatorioExecutivoMensal,
  MonitorChatPregoeiroInput,
  MonitorChatPregoeiroOutput,
  monitorChatPregoeiroSchema,
} from "@/server/schemas/arsenal.schema";
import { enfileirarMensagemWhatsApp } from "@/server/services/whatsapp.service";

export {
  calcularLanceMinimoEBdi,
  gerarPropostaComercialTimbrada,
  gerarMinutaImpugnacaoIA,
  consultarInteligenciaPrecosConcorrentes,
  gerarRelatorioExecutivoMensal,
};

/**
 * Monitor de Chat do Pregoeiro com Alertas WhatsApp (Exclusivo Plano ENTERPRISE)
 */
export async function analisarMensagensChatPregoeiro(
  rawInput: MonitorChatPregoeiroInput,
): Promise<MonitorChatPregoeiroOutput> {
  const input = monitorChatPregoeiroSchema.parse(rawInput);

  if (!canUseArsenalFeature(input.planoTenant, "MONITOR_CHAT_PREGOEIRO")) {
    throw new Error(
      "O Monitor de Chat do Pregoeiro com alertas no WhatsApp é exclusivo do Plano ENTERPRISE.",
    );
  }

  const cnpjDigitos = input.cnpjMonitorado.replace(/\D/g, "");
  const razaoUpper = input.razaoSocialMonitorada.trim().toUpperCase();
  const alertasCriticos: AlertaChatPregoeiro[] = [];

  for (const msg of input.mensagens) {
    const textoUpper = msg.texto.toUpperCase();
    const textoDigitos = msg.texto.replace(/\D/g, "");

    const mencionouCnpj =
      cnpjDigitos.length >= 11 && textoDigitos.includes(cnpjDigitos);
    const mencionouRazao = textoUpper.includes(razaoUpper);
    const mencionouEmpresa = mencionouCnpj || mencionouRazao;

    const temConvocacao =
      textoUpper.includes("CONVOCO") ||
      textoUpper.includes("CONVOCADA") ||
      textoUpper.includes("CONVOCAÇÃO");
    const temPropostaReadequada =
      textoUpper.includes("PROPOSTA READEQUADA") ||
      textoUpper.includes("PROPOSTA AJUSTADA") ||
      textoUpper.includes("NEGOCIAÇÃO");
    const temAnexo =
      textoUpper.includes("ANEXO") ||
      textoUpper.includes("HABILITAÇÃO") ||
      textoUpper.includes("DOCUMENTOS COMPLEMENTARES");
    const temRecurso =
      textoUpper.includes("INTENÇÃO DE RECURSO") ||
      textoUpper.includes("FASE RECURSAL") ||
      textoUpper.includes("PRAZO RECURSAL");

    if (
      mencionouEmpresa ||
      temConvocacao ||
      temPropostaReadequada ||
      temAnexo ||
      temRecurso
    ) {
      let tipoEvento: AlertaChatPregoeiro["tipoEvento"] = "SOLICITACAO_ANEXO";
      let acaoRecomendada =
        "Verifique imediatamente a sala de disputa e responda ao pregoeiro dentro do prazo.";

      if (mencionouEmpresa && (temConvocacao || temPropostaReadequada)) {
        tipoEvento = "CONVOCACAO_DIRETA";
        acaoRecomendada =
          "URGENTE: Sua empresa foi convocada nominalmente! Envie a proposta readequada timbrada e os documentos solicitados antes do encerramento do prazo fatal.";
      } else if (temPropostaReadequada) {
        tipoEvento = "PRAZO_PROPOSTA_READEQUADA";
        acaoRecomendada =
          "Atenção ao prazo de envio da proposta readequada no sistema de compras.";
      } else if (temRecurso) {
        tipoEvento = "FASE_RECURSAL";
        acaoRecomendada =
          "Abertura de janela para manifestação de intenção de recurso (Art. 165 da Lei 14.133/2021).";
      }

      alertasCriticos.push({
        horario: msg.horario,
        autor: msg.autor,
        textoOriginal: msg.texto,
        mencionouEmpresa,
        tipoEvento,
        acaoRecomendada,
      });
    }
  }

  let whatsappEnfileirado = false;
  if (alertasCriticos.length > 0 && input.telefoneAlerta) {
    const principal = alertasCriticos[0]!;
    await enfileirarMensagemWhatsApp({
      destinatario: input.telefoneAlerta,
      tipo: "URGENTE",
      mensagem: `🚨 *ALERTA DE SALA DE DISPUTA (${input.numeroEdital} - ${input.orgaoNome})*\n\nHorário: ${principal.horario}\nMensagem do Pregoeiro: "${principal.textoOriginal}"\n\n⚡ Ação: ${principal.acaoRecomendada}`,
    });
    whatsappEnfileirado = true;
  }

  return {
    numeroEdital: input.numeroEdital,
    totalMensagensAnalisadas: input.mensagens.length,
    alertasCriticos,
    alertaSonoroAtivo: alertasCriticos.some((a) => a.mencionouEmpresa),
    whatsappEnfileirado,
  };
}
