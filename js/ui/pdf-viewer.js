/**
 * @file Visualizador de atestados: renderiza o PDF original (ou o PDF gerado para casos de exemplo).
 */

import { esc, qs } from '../core/dom.js';
import { createLogger } from '../core/logger.js';
import { fmtDate } from '../core/format.js';
import { getColaborador } from '../core/store.js';
import { MEDICOS_EMISSORES } from '../data/seed.js';
import { gerarAtestadoPdf } from '../pdf/generate.js';
import { PdfError, renderizarPaginas } from '../pdf/extract.js';
import { openOverlay } from './feedback.js';

const log = createLogger('pdf.viewer');

/** @type {Map<string, Uint8Array>} Cache de PDFs gerados por caso. */
const generated = new Map();

/** @type {ReadonlyArray<import('../pdf/generate.js').LayoutAtestado>} */
const LAYOUTS = ['corrido', 'upa', 'receituario'];

/**
 * Bytes do atestado de um caso: o arquivo original do RH ou um PDF gerado a partir dos dados.
 * @param {import('../core/store.js').Caso} caso
 * @returns {Uint8Array}
 */
export const bytesDoCaso = (caso) => {
  if (caso.pdfBytes) return caso.pdfBytes;
  const cached = generated.get(caso.id);
  if (cached) return cached;
  const colab = getColaborador(caso.colaboradorId);
  const medico = MEDICOS_EMISSORES.find((m) => m.crm === caso.crm) ?? MEDICOS_EMISSORES[0];
  const layout = LAYOUTS[Number(caso.id.slice(-1)) % LAYOUTS.length];
  const bytes = gerarAtestadoPdf({
    nome: colab?.nome ?? 'Paciente', cpf: colab?.cpf ?? '00000000000', cid: caso.cid, dias: caso.dias,
    dataInicio: caso.dataInicio, medico: caso.medicoEmissor || medico.nome, crm: caso.crm || medico.crm, local: medico.local,
  }, layout);
  generated.set(caso.id, bytes);
  return bytes;
};

/**
 * Abre o overlay com o PDF do caso.
 * @param {import('../core/store.js').Caso} caso
 * @returns {Promise<void>}
 */
export const abrirAtestado = async (caso) => {
  const body = qs('#pdfBody');
  const colab = getColaborador(caso.colaboradorId);
  qs('#pdfTitle').textContent = `${caso.arquivoNome} · ${colab?.nome ?? ''}`;
  body.innerHTML = `<p class="pdf-meta"><span>Caso ${esc(caso.id)}</span><span>Enviado em ${esc(fmtDate(caso.criadoEm))} por ${esc(caso.enviadoPor)}</span><span>${caso.pdfBytes ? 'Arquivo original do RH' : 'PDF de exemplo gerado a partir dos dados do caso'}</span></p><div class="pdf-pages" id="pdfPages"><p>Carregando atestado…</p></div>`;
  openOverlay('pdfOverlay');
  try {
    const pages = qs('#pdfPages', body);
    const width = Math.min(640, body.clientWidth - 36);
    await renderizarPaginas(bytesDoCaso(caso), pages, width);
  } catch (err) {
    log.error('Falha ao renderizar atestado', { id: caso.id, code: err.code ?? 'UNKNOWN', message: err.message });
    qs('#pdfPages', body).textContent = err instanceof PdfError ? err.message : 'Não foi possível abrir o atestado.';
  }
};
