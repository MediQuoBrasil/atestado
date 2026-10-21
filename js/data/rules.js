/**
 * @file Regras de negócio puras da esteira de absenteísmo.
 * No produto real essas regras vivem no servidor; aqui rodam no navegador apenas para simulação.
 */

import { addDays, diffDays } from '../core/format.js';
import { lookupCid } from './cid.js';

/**
 * @typedef {Object} AtestadoBase
 * @property {string} colaboradorId
 * @property {string} cid
 * @property {number} dias
 * @property {string} dataInicio ISO.
 */

/**
 * @typedef {Object} Triagem
 * @property {boolean} elegivel     Entra na esteira de acompanhamento clínico.
 * @property {'alta'|'media'|'baixa'} prioridade
 * @property {string[]} motivos     Critérios objetivos que dispararam a regra.
 * @property {number} reincidencia  Atestados do mesmo colaborador nos últimos 90 dias (inclui o atual).
 */

/** Critérios de entrada (configuráveis por empresa no produto real). */
export const CRITERIOS = Object.freeze({
  diasMinimos: 3,
  janelaReincidenciaDias: 90,
  reincidenciaMinima: 3,
  diasAlta: 10,
});

/** Status de caso e rótulos exibidos. */
export const STATUS = Object.freeze({
  registrado: { label: 'Registrado', tone: 'neutral' },
  em_analise: { label: 'Em análise médica', tone: 'info' },
  validado: { label: 'Documento validado', tone: 'ok' },
  contato_pendente: { label: 'Contato pendente', tone: 'warn' },
  em_contato: { label: 'Em contato pelo WhatsApp', tone: 'info' },
  agendado: { label: 'Consulta agendada', tone: 'info' },
  em_consulta: { label: 'Em consulta', tone: 'primary' },
  em_acompanhamento: { label: 'Em acompanhamento', tone: 'primary' },
  encaminhado: { label: 'Encaminhado · Med. do Trabalho', tone: 'alert' },
  concluido: { label: 'Concluído', tone: 'ok' },
});

/**
 * Conta atestados de um colaborador dentro da janela que termina na data de referência.
 * @param {ReadonlyArray<AtestadoBase>} atestados Todos os atestados conhecidos.
 * @param {string} colaboradorId
 * @param {string} refIso Data de referência (início do atestado avaliado).
 * @param {number} [janela=CRITERIOS.janelaReincidenciaDias]
 * @returns {number}
 */
export const contarReincidencia = (atestados, colaboradorId, refIso, janela = CRITERIOS.janelaReincidenciaDias) => (
  atestados.filter((a) => {
    if (a.colaboradorId !== colaboradorId) return false;
    const delta = diffDays(a.dataInicio, refIso);
    return delta >= 0 && delta <= janela;
  }).length
);

/**
 * Aplica a regra de elegibilidade e prioridade a um atestado.
 * Critérios objetivos e iguais para todos, para evitar abordagem arbitrária.
 * @param {AtestadoBase} atestado
 * @param {ReadonlyArray<AtestadoBase>} historico Todos os atestados (incluindo o atual).
 * @returns {Triagem}
 */
export const triar = (atestado, historico) => {
  const reincidencia = contarReincidencia(historico, atestado.colaboradorId, atestado.dataInicio);
  const cidInfo = lookupCid(atestado.cid);
  /** @type {string[]} */
  const motivos = [];

  if (atestado.dias >= CRITERIOS.diasMinimos) motivos.push(`Afastamento de ${atestado.dias} dias (≥ ${CRITERIOS.diasMinimos})`);
  if (reincidencia >= CRITERIOS.reincidenciaMinima) motivos.push(`${reincidencia} atestados em ${CRITERIOS.janelaReincidenciaDias} dias`);
  if (cidInfo?.special) motivos.push(`Grupo com condução diferenciada (${cidInfo.chapter.toLowerCase()})`);

  const elegivel = motivos.length > 0;
  let prioridade = 'baixa';
  if (atestado.dias >= CRITERIOS.diasAlta || (reincidencia >= CRITERIOS.reincidenciaMinima && atestado.dias >= CRITERIOS.diasMinimos)) {
    prioridade = 'alta';
  } else if (elegivel) {
    prioridade = 'media';
  }

  return { elegivel, prioridade: /** @type {'alta'|'media'|'baixa'} */ (prioridade), motivos, reincidencia };
};

/**
 * Dias restantes de afastamento em relação a hoje.
 * @param {string} inicioIso
 * @param {number} dias
 * @param {string} hojeIso
 * @returns {number} Dias restantes a partir de hoje (negativo = já terminou).
 */
export const diasRestantes = (inicioIso, dias, hojeIso) => dias - diffDays(inicioIso, hojeIso);

/**
 * Tipos de desfecho e o texto administrativo que pode ir ao RH (sem dado clínico).
 * @type {Readonly<Object<string, {label: string, rh: string, status: string}>>}
 */
export const DESFECHOS = Object.freeze({
  manter: { label: 'Manter afastamento conforme atestado', rh: 'Afastamento mantido conforme o atestado apresentado. Retorno previsto na data final.', status: 'concluido' },
  acompanhamento: { label: 'Seguir em acompanhamento clínico', rh: 'Colaborador em acompanhamento clínico pela MediQuo. Nova devolutiva em até 7 dias.', status: 'em_acompanhamento' },
  encaminhar_mt: { label: 'Encaminhar à Medicina do Trabalho', rh: 'Encaminhado à Medicina do Trabalho para avaliação de aptidão ao retorno.', status: 'encaminhado' },
});

/**
 * Dias do afastamento que caem dentro do período filtrado (interseção inclusiva).
 * @param {string} inicioIso Início do afastamento.
 * @param {number} dias      Duração do afastamento.
 * @param {string} deIso     Início do período.
 * @param {string} ateIso    Fim do período.
 * @returns {number} 0 quando não há interseção.
 */
export const diasNoPeriodo = (inicioIso, dias, deIso, ateIso) => {
  if (dias < 1 || deIso > ateIso) return 0;
  const fimIso = addDays(inicioIso, dias - 1);
  const ini = inicioIso > deIso ? inicioIso : deIso;
  const fim = fimIso < ateIso ? fimIso : ateIso;
  return ini > fim ? 0 : diffDays(ini, fim) + 1;
};

/** Tamanho aceito para o parecer médico em texto livre (vai ao RH e ao PDF de uma página). */
export const PARECER_TEXTO = Object.freeze({ min: 20, max: 1200 });

/** Parecer usado quando o protótipo simula o envio pelo médico (sem dado clínico). */
export const PARECER_SIMULADO = 'Colaborador avaliado em teleconsulta de acompanhamento. A condição atual é compatível com o período de afastamento informado no atestado, sem necessidade de prolongamento. Retorno às atividades previsto para o dia seguinte ao fim do atestado, sem restrições. Seguimos à disposição para nova avaliação, se necessário.';

/** Código no formato CID-10 (ex.: M54.5) ou a sigla CID: não podem ir ao RH. */
const CID_NO_TEXTO = /\bCID\b|\b[A-Z]\d{2}(?:\.\d{1,2})?\b/;

/**
 * Valida o parecer em texto livre que o RH recebe. Não detecta diagnóstico escrito por extenso,
 * por isso o formulário também lembra o médico de não incluir dado clínico.
 * @param {string} texto
 * @returns {{ok: true, value: string} | {ok: false, error: string}}
 */
export const validarTextoParecer = (texto) => {
  // Mantém as quebras de parágrafo do médico; só normaliza espaços e linhas em branco repetidas.
  const value = String(texto ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (value.length < PARECER_TEXTO.min) return { ok: false, error: `Escreva o parecer médico (mínimo de ${PARECER_TEXTO.min} caracteres).` };
  if (value.length > PARECER_TEXTO.max) return { ok: false, error: `O parecer pode ter até ${PARECER_TEXTO.max} caracteres.` };
  if (CID_NO_TEXTO.test(value)) return { ok: false, error: 'O parecer vai ao RH: retire o CID ou o código de diagnóstico.' };
  return { ok: true, value };
};

/** Divisor do custo mensal para chegar ao custo por dia corrido de afastamento. */
export const DIAS_CUSTO_MES = 30;

/**
 * Custo estimado de um afastamento: custo mensal ÷ 30 × dias corridos.
 * @param {number} custoMensal R$.
 * @param {number} dias
 * @returns {number} R$.
 */
export const custoAfastamento = (custoMensal, dias) => (custoMensal > 0 && dias > 0 ? (custoMensal / DIAS_CUSTO_MES) * dias : 0);

/** Janela de horários em que o secretário pode registrar consultas na agenda do médico. */
export const JANELA_AGENDA = Object.freeze({ inicio: '08:00', fim: '18:00' });

/** Apps em que o colaborador faz a videochamada (rótulos exibidos). */
export const APPS_CONSULTA = Object.freeze({
  white_label: 'App de telessaúde da empresa',
  mediquo_saude: 'App MediQuo Saúde',
});

/** Como o app aparece no meio de uma frase dirigida ao colaborador. */
export const APPS_CONSULTA_FRASE = Object.freeze({
  white_label: 'app de telessaúde da sua empresa',
  mediquo_saude: 'app MediQuo Saúde',
});
