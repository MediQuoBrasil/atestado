/**
 * @file Regras de negócio puras da esteira de absenteísmo.
 * No produto real essas regras vivem no servidor; aqui rodam no navegador apenas para simulação.
 */

import { diffDays } from '../core/format.js';
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
  aguardando_rh: { label: 'Aguardando agenda do RH', tone: 'warn' },
  convite_enviado: { label: 'Convite enviado', tone: 'info' },
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
