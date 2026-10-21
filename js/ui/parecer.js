/**
 * @file Parecer da consulta: montagem do PDF a partir do caso e download no navegador.
 */

import { createLogger } from '../core/logger.js';
import { addDays, fmtSlot } from '../core/format.js';
import { TODAY, empresaDoCaso, getColaborador } from '../core/store.js';
import { MEDICA_PROGRAMA } from '../data/seed.js';
import { gerarParecerPdf } from '../pdf/parecer.js';

const log = createLogger('ui.parecer');

/** @type {Map<string, Uint8Array>} PDFs gerados sob demanda para os casos da semente. */
const gerados = new Map();

/**
 * Gera o PDF do parecer do caso a partir do texto escrito pelo médico.
 * @param {import('../core/store.js').Caso} caso
 * @param {string} texto Parecer médico em texto livre.
 * @returns {Uint8Array}
 */
export const gerarParecerDoCaso = (caso, texto) => {
  if (typeof texto !== 'string' || texto.trim() === '') throw new Error('Parecer sem texto');
  return gerarParecerPdf({
    casoId: caso.id,
    colaborador: getColaborador(caso.colaboradorId)?.nome ?? 'Colaborador',
    empresa: empresaDoCaso(caso)?.razao ?? '—',
    dataInicio: caso.dataInicio,
    dataFim: addDays(caso.dataInicio, caso.dias - 1),
    dias: caso.dias,
    dataConsulta: caso.agendamento?.slot ? fmtSlot(caso.agendamento.slot) : '—',
    parecer: texto.trim(),
    emitidoEm: caso.desfecho?.registradoEm ?? TODAY,
    medico: MEDICA_PROGRAMA.nome,
    crm: MEDICA_PROGRAMA.crm,
  });
};

/**
 * Bytes do parecer: o PDF do médico ou, na semente e na simulação, um PDF gerado a partir do texto.
 * @param {import('../core/store.js').Caso} caso
 * @returns {Uint8Array|null} null quando o caso ainda não tem parecer.
 */
export const bytesDoParecer = (caso) => {
  if (!caso.parecer) return null;
  if (caso.parecer.bytes) return caso.parecer.bytes;
  const cached = gerados.get(caso.id);
  if (cached) return cached;
  if (!caso.desfecho) return null;
  const bytes = gerarParecerDoCaso(caso, caso.desfecho.texto);
  gerados.set(caso.id, bytes);
  return bytes;
};

/**
 * Dispara o download de um PDF no navegador.
 * @param {Uint8Array} bytes
 * @param {string} nome
 * @returns {void}
 */
const baixarPdf = (bytes, nome) => {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoga depois do clique para não cancelar o download em navegadores mais lentos.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};

/**
 * Baixa o parecer do caso.
 * @param {import('../core/store.js').Caso} caso
 * @returns {boolean} false quando não há parecer ou a geração falhou.
 */
export const baixarParecer = (caso) => {
  try {
    const bytes = bytesDoParecer(caso);
    if (!bytes || !caso.parecer) return false;
    baixarPdf(bytes, caso.parecer.arquivoNome);
    log.info('Parecer baixado', { caso: caso.id, origem: caso.parecer.origem });
    return true;
  } catch (err) {
    log.error('Falha ao baixar parecer', { caso: caso.id, message: err.message });
    return false;
  }
};
