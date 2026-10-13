/**
 * @file Tabela comparativa das rotas (esforço, prazo, o que construir, riscos).
 */

import { esc } from '../core/dom.js';
import { ROTAS } from './routes.js';

/**
 * @param {number} n 1–5
 * @returns {string}
 */
const effortBar = (n) => `<span class="effort" aria-label="Esforço ${n} de 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;

/**
 * @param {string[]} items
 * @returns {string}
 */
const list = (items) => `<ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;

/**
 * Markup do comparativo.
 * @param {string} rotaAtualId
 * @returns {string}
 */
export const renderCompare = (rotaAtualId) => {
  const cls = (r) => (r.id === rotaAtualId ? ' class="current-col"' : '');
  const row = (label, fn) => `<tr><th scope="row">${label}</th>${ROTAS.map((r) => `<td${cls(r)}>${fn(r)}</td>`).join('')}</tr>`;
  return `
    <div class="compare-wrap">
      <table class="compare">
        <thead><tr><th></th>${ROTAS.map((r) => `<th scope="col"${cls(r)}>${esc(r.chave)} · ${esc(r.nome)}</th>`).join('')}</tr></thead>
        <tbody>
          ${row('Resumo', (r) => esc(r.resumo))}
          ${row('Esforço', (r) => `${effortBar(r.esforco)} ${esc(r.prazo)}`)}
          ${row('Etapas', (r) => `${r.etapas.length} etapas · ${esc([...new Set(r.etapas.map((e) => e.produto))].join(', '))}`)}
          ${row('Construir', (r) => list(r.construir))}
          ${row('Reaproveita', (r) => list(r.reaproveita))}
          ${row('Riscos', (r) => list(r.riscos))}
        </tbody>
      </table>
    </div>
    <p class="compare-note">Prazos são ordens de grandeza para um time pequeno, partindo do ID e do MediQuo Pro atuais. Todas as rotas mantêm a separação entre dado clínico (só equipe médica) e status administrativo (RH), conforme a LGPD.</p>`;
};
