/**
 * @file Gera atestados fictícios em PDF real (jsPDF) para alimentar o pipeline de extração.
 * Três layouts diferentes exercitam o parser: texto corrido, formulário de UPA e receituário.
 */

import { createLogger } from '../core/logger.js';
import { fmtDate } from '../core/format.js';

const log = createLogger('pdf.generate');

/**
 * @typedef {Object} DadosAtestado
 * @property {string} nome
 * @property {string} cpf         11 dígitos.
 * @property {string} cid
 * @property {number} dias
 * @property {string} dataInicio  ISO.
 * @property {string} medico
 * @property {string} crm
 * @property {string} local       Estabelecimento · cidade.
 */

/** @typedef {'corrido'|'upa'|'receituario'} LayoutAtestado */

const EXTENSO = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove', 'vinte', 'vinte e um'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/**
 * @param {string} cpf
 * @returns {string}
 */
const fmtCpf = (cpf) => cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');

/**
 * @param {string} iso
 * @returns {string} "12 de outubro de 2026"
 */
const dataExtenso = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${y}`;
};

/**
 * Obtém o construtor do jsPDF carregado via CDN.
 * @returns {any}
 */
const getJsPdf = () => {
  const ctor = window.jspdf?.jsPDF;
  if (typeof ctor !== 'function') throw new Error('jsPDF não carregou');
  return ctor;
};

/**
 * Cabeçalho comum com nome do estabelecimento.
 * @param {any} doc
 * @param {string} local
 */
const header = (doc, local) => {
  const [estab, cidade] = local.split(' · ');
  doc.setDrawColor(180, 180, 190);
  doc.setLineWidth(0.4);
  doc.line(20, 30, 190, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(estab, 20, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`${cidade ?? ''} · Tel. (00) 0000-0000 · Documento fictício gerado para protótipo`, 20, 26);
};

/**
 * Assinatura do médico.
 * @param {any} doc
 * @param {DadosAtestado} d
 * @param {number} y
 */
const assinatura = (doc, d, y) => {
  doc.setDrawColor(60, 60, 70);
  doc.line(65, y, 145, y);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(d.medico, 105, y + 6, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text(d.crm, 105, y + 11, { align: 'center' });
};

/**
 * Layout 1: texto corrido.
 * @param {any} doc
 * @param {DadosAtestado} d
 */
const layoutCorrido = (doc, d) => {
  header(doc, d.local);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('ATESTADO MÉDICO', 105, 50, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11.5);
  const corpo = `Atesto, para os devidos fins, que o(a) Sr(a). ${d.nome}, portador(a) do CPF ${fmtCpf(d.cpf)}, `
    + `esteve sob meus cuidados profissionais nesta data, necessitando de ${String(d.dias).padStart(2, '0')} (${EXTENSO[d.dias] ?? d.dias}) dias `
    + `de afastamento de suas atividades laborais a partir de ${fmtDate(d.dataInicio)}.`;
  doc.text(doc.splitTextToSize(corpo, 170), 20, 68, { lineHeightFactor: 1.6 });
  doc.setFont('helvetica', 'bold');
  doc.text(`CID-10: ${d.cid}`, 20, 104);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('O código CID foi informado com autorização expressa do paciente.', 20, 110);
  doc.setFontSize(11);
  doc.text(`${(d.local.split(' · ')[1] ?? '').split('/')[0]}, ${dataExtenso(d.dataInicio)}.`, 20, 130);
  assinatura(doc, d, 165);
};

/**
 * Layout 2: formulário de pronto atendimento.
 * @param {any} doc
 * @param {DadosAtestado} d
 */
const layoutUpa = (doc, d) => {
  header(doc, d.local);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Declaração de Afastamento', 20, 44);
  const rows = [
    ['Paciente:', d.nome],
    ['CPF:', fmtCpf(d.cpf)],
    ['Data do atendimento:', fmtDate(d.dataInicio)],
    ['Período de afastamento:', `${d.dias} dias`],
    ['Início:', fmtDate(d.dataInicio)],
    ['CID:', d.cid],
  ];
  doc.setFontSize(11);
  rows.forEach(([label, value], i) => {
    const y = 58 + i * 10;
    doc.setFont('helvetica', 'bold');
    doc.text(label, 20, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, 72, y);
    doc.setDrawColor(225, 225, 232);
    doc.line(20, y + 3, 190, y + 3);
  });
  doc.setFontSize(9.5);
  doc.text(doc.splitTextToSize('Paciente orientado(a) quanto a repouso, hidratação e retorno em caso de piora dos sintomas.', 170), 20, 128);
  doc.setFontSize(10);
  doc.text(`Data: ${fmtDate(d.dataInicio)}`, 20, 142);
  assinatura(doc, d, 170);
};

/**
 * Layout 3: receituário com repouso por extenso.
 * @param {any} doc
 * @param {DadosAtestado} d
 */
const layoutReceituario = (doc, d) => {
  header(doc, d.local);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('RECEITUÁRIO · ATESTADO', 20, 44);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Nome do paciente: ${d.nome}`, 20, 58);
  const texto = `Atesto que o(a) paciente acima necessita de repouso por ${EXTENSO[d.dias] ?? d.dias} dias, `
    + `a contar de ${fmtDate(d.dataInicio)}, por motivo de doença (C.I.D. ${d.cid}).`;
  doc.text(doc.splitTextToSize(texto, 170), 20, 72, { lineHeightFactor: 1.6 });
  doc.text(`${(d.local.split(' · ')[1] ?? '').split('/')[0]}, ${dataExtenso(d.dataInicio)}`, 20, 110);
  assinatura(doc, d, 150);
};

const LAYOUTS = Object.freeze({ corrido: layoutCorrido, upa: layoutUpa, receituario: layoutReceituario });

/**
 * Gera o PDF do atestado.
 * @param {DadosAtestado} dados
 * @param {LayoutAtestado} [layout='corrido']
 * @returns {Uint8Array}
 */
export const gerarAtestadoPdf = (dados, layout = 'corrido') => {
  const done = log.time('gerarAtestadoPdf');
  const JsPdf = getJsPdf();
  const doc = new JsPdf({ unit: 'mm', format: 'a4' });
  doc.setProperties({ title: 'Atestado médico (fictício)', creator: 'Protótipo Absenteísmo MediQuo' });
  const render = LAYOUTS[layout] ?? LAYOUTS.corrido;
  render(doc, dados);
  const bytes = new Uint8Array(doc.output('arraybuffer'));
  done();
  log.info('Atestado gerado', { layout, bytes: bytes.byteLength });
  return bytes;
};
