/**
 * @file Estrutura do ID (sidebar + área principal), com o novo menu "Absenteísmo".
 */

import { esc, icon } from '../core/dom.js';
import { listarCasos } from '../core/store.js';

/** @typedef {'enviar'|'casos'} IdSub */

/**
 * Item de menu existente (estático, igual ao ID atual).
 * @param {string} ic
 * @param {string} label
 * @param {boolean} [expand=false]
 * @returns {string}
 */
const item = (ic, label, expand = false) => `<div class="id-nav-item">${icon(ic)}<span>${esc(label)}</span>${expand ? icon('chevronDown', 'chev') : ''}</div>`;

/**
 * Sidebar + conteúdo.
 * @param {IdSub} active
 * @param {string} content Markup já escapado.
 * @returns {string}
 */
export const idShell = (active, content) => {
  const pendentes = listarCasos().filter((c) => c.status === 'aguardando_rh').length;
  const sub = (key, label, extra = '') => `<button type="button" class="id-sub-item ${active === key ? 'active' : ''}" data-action="id-sub" data-sub="${key}"><span class="dot"></span><span>${esc(label)}</span>${extra}</button>`;
  return `
  <div class="id-app">
    <aside class="id-aside">
      <div class="id-aside-head">
        <span class="id-logo">mediquo <span>ID</span></span>
        <span class="id-collapse">${icon('chevronLeft', 'ic-sm')}</span>
      </div>
      <div class="id-user">
        <div class="id-avatar">${icon('user', 'ic')}</div>
        <div><p class="n">Joana Mendes</p><p class="r">RH corporativo · 4 CNPJs</p></div>
      </div>
      <nav class="id-nav">
        ${item('dashboard', 'Dashboard')}
        ${item('users', 'Usuários')}
        ${item('ticket', 'Cupons')}
        ${item('userCheck', 'Pacientes')}
        ${item('briefcase', 'Gestão de Negócio', true)}
        ${item('radar', 'Radar+', true)}
        <div class="id-nav-item is-new open">${icon('fileHeart')}<span>Absenteísmo</span><span class="id-new-tag">novo</span></div>
        <div class="id-sub">
          ${sub('enviar', 'Enviar atestado')}
          ${sub('casos', 'Casos', pendentes ? `<span class="count">${pendentes}</span>` : '')}
        </div>
        ${item('chart', 'Analytics', true)}
        ${item('settings', 'Configurações', true)}
      </nav>
      <div class="id-aside-foot">${item('logout', 'Sair')}</div>
    </aside>
    <main class="id-main" data-scroll-key="id-main">
      <div class="id-page">${content}</div>
    </main>
  </div>`;
};

/**
 * Cabeçalho de página no padrão do ID.
 * @param {string} title
 * @param {string} lead
 * @returns {string}
 */
export const idHeader = (title, lead) => `<div><h1 class="id-h1">${icon('fileHeart')}${esc(title)}</h1><p class="id-lead">${esc(lead)}</p></div>`;
