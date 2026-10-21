/**
 * @file Gera o parecer da consulta de acompanhamento em PDF (jsPDF).
 * O parecer vai ao RH, então traz apenas dados administrativos: sem CID, sintomas ou conduta clínica.
 */

import { createLogger } from '../core/logger.js';
import { fmtDate } from '../core/format.js';
import { getJsPdf } from './generate.js';

const log = createLogger('pdf.parecer');

/**
 * @typedef {Object} DadosParecer
 * @property {string} casoId
 * @property {string} colaborador     Nome completo.
 * @property {string} empresa         Razão social.
 * @property {string} dataInicio      ISO, início do afastamento.
 * @property {string} dataFim         ISO, fim do afastamento.
 * @property {number} dias
 * @property {string} dataConsulta    Texto já formatado (ex.: "qua., 14 de outubro · 09:30 – 10:00") ou "—".
 * @property {string} parecer         Parecer médico em texto livre, destinado ao RH.
 * @property {string} emitidoEm       ISO.
 * @property {string} medico
 * @property {string} crm
 */

/**
 * Linha rótulo/valor.
 * @param {any} doc
 * @param {string} label
 * @param {string} value
 * @param {number} y
 */
const linha = (doc, label, value, y) => {
  doc.setFont('helvetica', 'bold');
  doc.text(label, 20, y);
  doc.setFont('helvetica', 'normal');
  doc.text(value, 72, y);
  doc.setDrawColor(225, 225, 232);
  doc.line(20, y + 3, 190, y + 3);
};

/**
 * Gera o PDF do parecer.
 * @param {DadosParecer} d
 * @returns {Uint8Array}
 */
export const gerarParecerPdf = (d) => {
  const done = log.time('gerarParecerPdf');
  const JsPdf = getJsPdf();
  const doc = new JsPdf({ unit: 'mm', format: 'a4' });
  doc.setProperties({ title: `Parecer ${d.casoId} (fictício)`, creator: 'Protótipo Absenteísmo MediQuo' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('MediQuo · Telessaúde', 20, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Programa de acompanhamento de afastamentos · Documento fictício gerado para protótipo', 20, 26);
  doc.setDrawColor(180, 180, 190);
  doc.setLineWidth(0.4);
  doc.line(20, 30, 190, 30);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('PARECER DE ACOMPANHAMENTO', 105, 46, { align: 'center' });

  doc.setFontSize(10.5);
  [
    ['Caso:', d.casoId],
    ['Colaborador:', d.colaborador],
    ['Empresa:', d.empresa],
    ['Afastamento:', `${fmtDate(d.dataInicio)} a ${fmtDate(d.dataFim)} (${d.dias} dias)`],
    ['Consulta:', d.dataConsulta],
  ].forEach(([label, value], i) => linha(doc, label, value, 62 + i * 10));

  doc.setFont('helvetica', 'bold');
  doc.text('Parecer médico', 20, 120);
  doc.setFont('helvetica', 'normal');
  // O texto é livre (até 1.200 caracteres); o restante da página se posiciona depois dele.
  const linhas = doc.splitTextToSize(d.parecer, 170);
  doc.text(linhas, 20, 128, { lineHeightFactor: 1.5 });
  let y = 128 + linhas.length * 5.6 + 10;

  doc.setFontSize(8.5);
  doc.setTextColor(90, 90, 100);
  doc.text(doc.splitTextToSize('Este parecer não contém diagnóstico, CID ou informações clínicas. O registro clínico da consulta permanece no prontuário da MediQuo, conforme a LGPD (dado de saúde é dado pessoal sensível).', 170), 20, y);
  doc.setTextColor(0, 0, 0);

  y += 20;
  doc.setFontSize(10);
  doc.text(`Emitido em ${fmtDate(d.emitidoEm)}`, 20, y);
  y += 26;
  doc.setDrawColor(60, 60, 70);
  doc.line(65, y, 145, y);
  doc.setFont('helvetica', 'bold');
  doc.text(d.medico, 105, y + 6, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text(d.crm, 105, y + 11, { align: 'center' });

  const bytes = new Uint8Array(doc.output('arraybuffer'));
  done();
  log.info('Parecer gerado', { caso: d.casoId, bytes: bytes.byteLength });
  return bytes;
};
