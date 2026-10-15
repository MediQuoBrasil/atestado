/**
 * @file ID · Absenteísmo › Casos (Rota 0): status administrativo dos atestados enviados.
 * O RH nunca vê CID ou nota clínica.
 */

import { delegate, esc } from '../core/dom.js';
import {
  addDays, fmtCnpj, fmtDate, plural,
} from '../core/format.js';
import {
  STATUS, empresaDoCaso, getColaborador, getFocusCase, listarCasos,
} from '../core/store.js';
import { idHeader, idShell } from './id-shell.js';
import { handleIdSub } from './id-nav.js';

/**
 * @param {keyof STATUS} status
 * @returns {string}
 */
export const pill = (status) => `<span class="pill ${STATUS[status].tone}">${esc(STATUS[status].label)}</span>`;

/**
 * Tabela de casos (visão RH, sem diagnóstico).
 * @param {string} focusId
 * @returns {string}
 */
const tabelaCasos = (focusId) => {
  const casos = [...listarCasos()].sort((a, b) => (b.criadoEm + b.id).localeCompare(a.criadoEm + a.id)).slice(0, 10);
  return `
    <div class="id-card">
      <div class="id-card-head"><div><h2 class="id-card-title">Casos recentes</h2><p class="id-card-desc">Status administrativo e datas. Diagnóstico e conversa clínica ficam com a equipe médica.</p></div></div>
      <div class="id-card-body id-table-wrap">
        <table class="id-table">
          <thead><tr><th>Caso</th><th>Colaborador</th><th>CNPJ</th><th>Afastamento</th><th>Status</th></tr></thead>
          <tbody>${casos.map((c) => {
    const col = getColaborador(c.colaboradorId);
    const emp = empresaDoCaso(c);
    return `<tr class="${c.id === focusId ? 'focus' : ''}"><td class="num">${esc(c.id)}</td><td>${esc(col?.nome ?? '')}<span class="sub">${esc(col?.cargo ?? '')}</span></td><td class="num">${esc(fmtCnpj(emp?.cnpj ?? ''))}</td><td class="num">${esc(fmtDate(c.dataInicio))} → ${esc(fmtDate(addDays(c.dataInicio, c.dias - 1)))}<span class="sub">${esc(plural(c.dias, 'dia', 'dias'))}</span></td><td>${pill(c.status)}</td></tr>`;
  }).join('')}</tbody>
        </table>
      </div>
    </div>`;
};

/**
 * Timeline visível ao RH (eventos já redigidos sem dado clínico).
 * @param {import('../core/store.js').Caso} caso
 * @returns {string}
 */
export const timeline = (caso) => `<ol class="id-timeline">${[...caso.timeline].reverse().map((t) => `<li><div><span class="t">${esc(t.ts)}</span><div>${esc(t.text)}</div></div></li>`).join('')}</ol>`;

/**
 * Resumo administrativo do caso em foco.
 * @param {import('../core/store.js').Caso} caso
 * @returns {string}
 */
const resumoCaso = (caso) => {
  const col = getColaborador(caso.colaboradorId);
  const emp = empresaDoCaso(caso);
  return `
    <dl class="id-kv">
      <dt>Caso</dt><dd>${esc(caso.id)}</dd>
      <dt>Colaborador</dt><dd>${esc(col?.nome ?? '')} · ${esc(col?.cargo ?? '')}</dd>
      <dt>Empresa</dt><dd>${esc(emp?.razao ?? '')} · ${esc(fmtCnpj(emp?.cnpj ?? ''))}</dd>
      <dt>Afastamento</dt><dd>${esc(fmtDate(caso.dataInicio))} a ${esc(fmtDate(addDays(caso.dataInicio, caso.dias - 1)))} (${esc(plural(caso.dias, 'dia', 'dias'))})</dd>
      <dt>Status</dt><dd>${pill(caso.status)}</dd>
    </dl>`;
};

/**
 * Modo status (Rota 0).
 * @param {import('../core/store.js').Caso} caso
 * @returns {string}
 */
const modoStatus = (caso) => `
  <div class="id-grid-2">
    <div class="id-card"><div class="id-card-head"><h2 class="id-card-title">Caso acompanhado</h2></div><div class="id-card-body">${resumoCaso(caso)}</div></div>
    <div class="id-card"><div class="id-card-head"><h2 class="id-card-title">Histórico</h2></div><div class="id-card-body">${timeline(caso)}</div></div>
  </div>
  ${tabelaCasos(caso.id)}`;

/**
 * @returns {string}
 */
const render = () => {
  const caso = getFocusCase();
  return idShell('casos', `${idHeader('Casos', 'Acompanhe o status dos atestados enviados.')}${modoStatus(caso)}`);
};

/**
 * @param {HTMLElement} root
 * @param {import('../journey/navigator.js').ScreenCtx} ctx
 * @returns {function(): void}
 */
const bind = (root, ctx) => delegate(root, 'click', {
  'id-sub': (el) => handleIdSub(el.dataset.sub, ctx),
});

/** @type {import('../journey/navigator.js').Screen} */
export const idCasosScreen = {
  frame: 'desktop',
  url: () => 'id.mediquo.com.br/absenteismo/casos',
  render,
  bind,
};
