/**
 * @file Estado em memória do protótipo (simula o backend compartilhado entre ID, MediQuo Pro e App).
 * Validações aqui representam as que, em produção, rodariam no servidor.
 */

import { createLogger } from './logger.js';
import {
  addDays, brToIso, digits, parseIsoDate,
} from './format.js';
import { COLABORADORES, EMPRESAS, MEDICOS_EMISSORES, SEED_ROWS, TODAY } from '../data/seed.js';
import { lookupCid } from '../data/cid.js';
import { DESFECHOS, STATUS, triar } from '../data/rules.js';

const log = createLogger('store');

/**
 * @typedef {import('../data/seed.js').Colaborador} Colaborador
 * @typedef {import('../data/seed.js').Empresa} Empresa
 * @typedef {import('../data/rules.js').Triagem} Triagem
 */

/** @typedef {'white_label'|'mediquo_saude'} AppConsulta App em que o colaborador recebe a consulta. */

/**
 * @typedef {Object} Agendamento
 * @property {'whatsapp'} canal        O horário é combinado pelo WhatsApp Telessaúde.
 * @property {AppConsulta} app
 * @property {string[]} slotsSugeridos Horários oferecidos ('AAAA-MM-DDTHH:mm').
 * @property {string|null} slot        Horário confirmado pelo colaborador.
 */

/**
 * @typedef {Object} Desfecho
 * @property {'manter'|'retorno_antecipado'|'encaminhar_mt'|'acompanhamento'} tipo
 * @property {string} recomendacaoRH Texto administrativo permitido ao RH (sem dado clínico).
 * @property {string} registradoEm   ISO date.
 */

/**
 * @typedef {Object} Parecer
 * @property {string} arquivoNome
 * @property {Uint8Array|null} bytes  PDF anexado pelo médico; null nos casos da semente (gerado sob demanda).
 * @property {'upload'|'gerado'|'seed'} origem
 * @property {string} anexadoEm       ISO date.
 */

/**
 * @typedef {Object} TimelineEntry
 * @property {string} ts    'AAAA-MM-DD HH:mm'.
 * @property {'rh'|'medico'|'colaborador'|'sistema'} actor
 * @property {string} text
 */

/**
 * @typedef {Object} Caso
 * @property {string} id
 * @property {string} colaboradorId
 * @property {string} telefone        Celular com WhatsApp informado pelo RH (só dígitos).
 * @property {string} cid
 * @property {number} dias
 * @property {string} dataInicio      ISO.
 * @property {string} dataEmissao     ISO.
 * @property {string} medicoEmissor
 * @property {string} crm
 * @property {'seed'|'upload'|'exemplo'} origem
 * @property {string} arquivoNome
 * @property {Uint8Array|null} pdfBytes Bytes originais quando enviados pelo RH.
 * @property {Object<string, number>|null} confianca Confiança por campo extraído (0–1).
 * @property {keyof STATUS} status
 * @property {Triagem} triagem
 * @property {Agendamento|null} agendamento
 * @property {Desfecho|null} desfecho
 * @property {Parecer|null} parecer   Parecer anexado pelo médico, disponível para download no ID.
 * @property {TimelineEntry[]} timeline
 * @property {string} criadoEm ISO.
 * @property {string} enviadoPor
 */

/**
 * @typedef {Object} NovoCasoInput
 * @property {string} colaboradorId
 * @property {string} telefone        Celular com WhatsApp, com ou sem máscara.
 * @property {string} cid
 * @property {number|string} dias
 * @property {string} dataInicio      ISO ou DD/MM/AAAA.
 * @property {string} [dataEmissao]
 * @property {string} [medicoEmissor]
 * @property {string} [crm]
 * @property {'upload'|'exemplo'} origem
 * @property {string} arquivoNome
 * @property {Uint8Array|null} pdfBytes
 * @property {Object<string, number>|null} [confianca]
 */

/** @type {{ casos: Caso[], focusId: string|null, seq: number, flags: Object<string, boolean> }} */
const state = { casos: [], focusId: null, seq: 0, flags: {} };

/** @type {Set<function(): void>} */
const listeners = new Set();

const COLAB_MAP = new Map(COLABORADORES.map((c) => [c.id, c]));
const EMP_MAP = new Map(EMPRESAS.map((e) => [e.id, e]));

/** @returns {string} */
const nextId = () => {
  state.seq += 1;
  return `ABS-2026-${String(state.seq).padStart(4, '0')}`;
};

/** Notifica assinantes (re-render das telas). */
const emit = () => listeners.forEach((fn) => {
  try {
    fn();
  } catch (err) {
    log.error('Falha em assinante do store', { message: err.message });
  }
});

/**
 * Hora atual do protótipo no formato da timeline.
 * @returns {string}
 */
const nowStamp = () => {
  const d = new Date();
  return `${TODAY} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Desfecho atribuído aos casos da semente que já passaram por consulta. */
const DESFECHO_SEMENTE = Object.freeze({ concluido: 'manter', em_acompanhamento: 'acompanhamento', encaminhado: 'encaminhar_mt' });

/**
 * Desfecho e parecer dos casos da semente (o PDF é gerado só quando o RH baixa).
 * @param {string} id
 * @param {string} status
 * @param {string} dataInicio
 * @returns {{desfecho: Desfecho|null, parecer: Parecer|null}}
 */
const parecerSemente = (id, status, dataInicio) => {
  const tipo = DESFECHO_SEMENTE[status];
  if (!tipo) return { desfecho: null, parecer: null };
  const quando = addDays(dataInicio, 2) < TODAY ? addDays(dataInicio, 2) : TODAY;
  return {
    desfecho: { tipo, recomendacaoRH: DESFECHOS[tipo].rh, registradoEm: quando },
    parecer: {
      arquivoNome: `parecer_${id.toLowerCase()}.pdf`, bytes: null, origem: 'seed', anexadoEm: quando,
    },
  };
};

/** Recalcula triagem de todos os casos (reincidência depende do conjunto). */
const retriarTodos = () => {
  state.casos.forEach((c) => { c.triagem = triar(c, state.casos); });
};

/**
 * Popula o estado com a semente.
 * @returns {void}
 */
const seed = () => {
  state.casos = SEED_ROWS.map(([colaboradorId, cid, dias, dataInicio, status, medIdx]) => {
    const medico = MEDICOS_EMISSORES[medIdx];
    const criadoEm = addDays(dataInicio, 1);
    const id = nextId();
    return {
      id,
      colaboradorId,
      telefone: COLAB_MAP.get(colaboradorId)?.telefone ?? '',
      cid,
      dias,
      dataInicio,
      dataEmissao: dataInicio,
      medicoEmissor: medico.nome,
      crm: medico.crm,
      origem: 'seed',
      arquivoNome: `atestado_${dataInicio}.pdf`,
      pdfBytes: null,
      confianca: null,
      status: /** @type {keyof STATUS} */ (status),
      triagem: /** @type {Triagem} */ ({}),
      agendamento: null,
      ...parecerSemente(id, status, dataInicio),
      timeline: [{ ts: `${criadoEm} 09:12`, actor: 'rh', text: 'Atestado enviado pelo RH no ID' }],
      criadoEm,
      enviadoPor: 'RH · Joana Mendes',
    };
  });
  retriarTodos();
  log.info('Semente carregada', { casos: state.casos.length });
};

/**
 * Normaliza um celular brasileiro para 11 dígitos (DDD + 9 + 8 dígitos). Aceita prefixo 55.
 * @param {string} value
 * @returns {string|null} Dígitos ou null quando inválido.
 */
export const normalizarCelular = (value) => {
  let d = digits(value);
  if (d.length === 13 && d.startsWith('55')) d = d.slice(2);
  if (!/^[1-9][1-9]9\d{8}$/.test(d)) return null;
  return d;
};

/**
 * Validação de entrada (equivalente à validação server-side).
 * @param {NovoCasoInput} input
 * @returns {{ok: true, value: {colaboradorId: string, telefone: string, cid: string, dias: number, dataInicio: string, dataEmissao: string}} | {ok: false, errors: Object<string, string>}}
 */
export const validarNovoCaso = (input) => {
  /** @type {Object<string, string>} */
  const errors = {};
  if (!COLAB_MAP.has(input.colaboradorId)) errors.colaboradorId = 'Selecione o colaborador do atestado.';

  const celular = normalizarCelular(String(input.telefone ?? ''));
  if (!celular) errors.telefone = 'Informe o celular com WhatsApp no formato (11) 98765-4321.';

  // CID é opcional no envio: o RH não deve digitá-lo; a equipe médica completa na análise.
  const cidRaw = String(input.cid ?? '').trim();
  const cidInfo = cidRaw ? lookupCid(cidRaw) : null;
  if (cidRaw && !cidInfo) errors.cid = 'O CID identificado no PDF é inválido.';

  const dias = Number.parseInt(String(input.dias), 10);
  if (!Number.isInteger(dias) || dias < 1 || dias > 365) errors.dias = 'Informe de 1 a 365 dias.';

  const dataInicio = parseIsoDate(input.dataInicio) ? input.dataInicio : brToIso(input.dataInicio);
  if (!dataInicio) errors.dataInicio = 'Informe a data de início do afastamento.';

  if (input.pdfBytes !== null && !(input.pdfBytes instanceof Uint8Array)) errors.arquivo = 'Arquivo inválido.';

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const dataEmissao = (input.dataEmissao && (parseIsoDate(input.dataEmissao) ? input.dataEmissao : brToIso(input.dataEmissao))) || dataInicio;
  return {
    ok: true,
    value: {
      colaboradorId: input.colaboradorId, telefone: /** @type {string} */ (celular), cid: cidInfo ? cidInfo.code : '', dias, dataInicio, dataEmissao,
    },
  };
};

/**
 * Cria um caso a partir do envio do RH.
 * @param {NovoCasoInput} input
 * @param {{silent?: boolean}} [opts] silent evita notificar assinantes (uso durante render).
 * @returns {{ok: true, caso: Caso} | {ok: false, errors: Object<string, string>}}
 */
export const criarCaso = (input, opts = {}) => {
  const result = validarNovoCaso(input);
  if (!result.ok) {
    log.warn('Caso rejeitado na validação', { campos: Object.keys(result.errors).join(',') });
    return result;
  }
  /** @type {Caso} */
  const caso = {
    id: nextId(),
    ...result.value,
    medicoEmissor: String(input.medicoEmissor ?? '').slice(0, 120),
    crm: String(input.crm ?? '').slice(0, 40),
    origem: input.origem,
    arquivoNome: String(input.arquivoNome ?? 'atestado.pdf').slice(0, 120),
    pdfBytes: input.pdfBytes,
    confianca: input.confianca ?? null,
    status: 'registrado',
    triagem: /** @type {Triagem} */ ({}),
    agendamento: null,
    desfecho: null,
    parecer: null,
    timeline: [{ ts: nowStamp(), actor: 'rh', text: 'Atestado enviado pelo RH no ID com o celular do colaborador' }],
    criadoEm: TODAY,
    enviadoPor: 'RH · Joana Mendes',
  };
  state.casos.push(caso);
  retriarTodos();
  state.focusId = caso.id;
  log.info('Caso criado', {
    id: caso.id, origem: caso.origem, dias: caso.dias, elegivel: caso.triagem.elegivel, telefone: caso.telefone,
  });
  if (!opts.silent) emit();
  return { ok: true, caso };
};

/**
 * Atualiza um caso e registra entrada na timeline.
 * @param {string} id
 * @param {Partial<Caso>} patch
 * @param {Omit<TimelineEntry, 'ts'>} [evento]
 * @returns {Caso|null}
 */
export const atualizarCaso = (id, patch, evento) => {
  const caso = state.casos.find((c) => c.id === id);
  if (!caso) {
    log.warn('Atualização de caso inexistente', { id });
    return null;
  }
  Object.assign(caso, patch);
  if (evento) caso.timeline.push({ ts: nowStamp(), ...evento });
  log.info('Caso atualizado', { id, status: caso.status });
  emit();
  return caso;
};

/**
 * @typedef {Object} ParecerInput
 * @property {string} tipo                 Chave de DESFECHOS.
 * @property {string} arquivoNome
 * @property {Uint8Array} bytes            PDF do parecer.
 * @property {'upload'|'gerado'} origem
 */

/**
 * Registra o desfecho e anexa o parecer que o RH baixa no ID (validação equivalente à do servidor).
 * @param {string} id
 * @param {ParecerInput} input
 * @returns {{ok: true, caso: Caso} | {ok: false, error: string}}
 */
export const registrarParecer = (id, input) => {
  const caso = state.casos.find((c) => c.id === id);
  if (!caso) return { ok: false, error: 'Caso não encontrado.' };
  const def = DESFECHOS[input.tipo];
  if (!def) return { ok: false, error: 'Escolha o desfecho da consulta.' };
  if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength === 0) return { ok: false, error: 'Anexe o parecer em PDF.' };
  if (String.fromCharCode(...input.bytes.slice(0, 5)) !== '%PDF-') return { ok: false, error: 'O parecer precisa ser um PDF válido.' };
  if (!['upload', 'gerado'].includes(input.origem)) return { ok: false, error: 'Origem do parecer inválida.' };
  const arquivoNome = String(input.arquivoNome ?? '').replace(/[^\w.\-À-ÿ ]/g, '').slice(0, 120) || `parecer_${id.toLowerCase()}.pdf`;

  caso.status = /** @type {keyof STATUS} */ (def.status);
  caso.desfecho = { tipo: /** @type {Desfecho['tipo']} */ (input.tipo), recomendacaoRH: def.rh, registradoEm: TODAY };
  caso.parecer = {
    arquivoNome, bytes: input.bytes, origem: input.origem, anexadoEm: TODAY,
  };
  caso.timeline.push({ ts: nowStamp(), actor: 'medico', text: `Parecer anexado no MediQuo Pro e disponível no ID (${def.label})` });
  log.info('Parecer registrado', {
    id, tipo: input.tipo, origem: input.origem, bytes: input.bytes.byteLength,
  });
  emit();
  return { ok: true, caso };
};

/**
 * @param {string} id
 * @returns {Caso|undefined}
 */
export const getCaso = (id) => state.casos.find((c) => c.id === id);

/** @returns {ReadonlyArray<Caso>} */
export const listarCasos = () => state.casos;

/**
 * @param {string} id
 * @returns {Colaborador|undefined}
 */
export const getColaborador = (id) => COLAB_MAP.get(id);

/**
 * @param {string} id
 * @returns {Empresa|undefined}
 */
export const getEmpresa = (id) => EMP_MAP.get(id);

/**
 * Empresa de um caso.
 * @param {Caso} caso
 * @returns {Empresa|undefined}
 */
export const empresaDoCaso = (caso) => getEmpresa(getColaborador(caso.colaboradorId)?.empresaId ?? '');

/**
 * Caso que a jornada acompanha. Cria um caso de exemplo se o RH ainda não enviou nenhum.
 * @returns {Caso}
 */
export const getFocusCase = () => {
  const existing = state.focusId ? getCaso(state.focusId) : undefined;
  if (existing) return existing;
  const result = criarCaso({
    colaboradorId: 'col-02',
    telefone: COLAB_MAP.get('col-02')?.telefone ?? '',
    cid: 'M54.5',
    dias: 6,
    dataInicio: '2026-10-12',
    dataEmissao: '2026-10-12',
    medicoEmissor: MEDICOS_EMISSORES[3].nome,
    crm: MEDICOS_EMISSORES[3].crm,
    origem: 'exemplo',
    arquivoNome: 'atestado_rafael_lins.pdf',
    pdfBytes: null,
  }, { silent: true });
  if (!result.ok) throw new Error('Falha ao criar caso de exemplo');
  state.flags.autoCriado = true;
  return result.caso;
};

/** @returns {boolean} */
export const hasFocusCase = () => Boolean(state.focusId && getCaso(state.focusId));

/**
 * Define o caso acompanhado pela jornada.
 * @param {string} id
 */
export const setFocusCase = (id) => {
  if (!getCaso(id)) return;
  state.focusId = id;
  emit();
};

/**
 * Flags de sessão (ex.: push já entregue).
 * @param {string} key
 * @returns {boolean}
 */
export const getFlag = (key) => Boolean(state.flags[key]);

/**
 * @param {string} key
 * @param {boolean} value
 */
export const setFlag = (key, value) => {
  state.flags[key] = value;
  emit();
};

/**
 * Assina mudanças de estado.
 * @param {function(): void} fn
 * @returns {function(): void} Cancela a assinatura.
 */
export const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/**
 * Restaura o estado inicial do protótipo.
 * @returns {void}
 */
export const resetStore = () => {
  state.seq = 0;
  state.focusId = null;
  state.flags = {};
  seed();
  emit();
};

/**
 * Horários livres sugeridos a partir de amanhã (agenda simulada do médico).
 * @param {number} [quantidade=6]
 * @returns {string[]} 'AAAA-MM-DDTHH:mm'
 */
export const horariosDisponiveis = (quantidade = 6) => {
  const horas = ['08:00', '09:30', '11:00', '14:00', '15:30', '17:00'];
  /** @type {string[]} */
  const out = [];
  let offset = 1;
  while (out.length < quantidade && offset < 10) {
    const dia = addDays(TODAY, offset);
    const weekday = parseIsoDate(dia).getDay();
    if (weekday !== 0 && weekday !== 6) {
      horas.filter((_, i) => (i + offset) % 2 === 0).forEach((h) => {
        if (out.length < quantidade) out.push(`${dia}T${h}`);
      });
    }
    offset += 1;
  }
  return out;
};

export { STATUS, TODAY };

seed();
