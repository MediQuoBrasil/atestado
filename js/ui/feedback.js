/**
 * @file Toast e controle genérico de overlays do shell.
 */

import { qs } from '../core/dom.js';

let toastTimer = 0;

/**
 * Exibe uma mensagem curta.
 * @param {string} message Texto já seguro (atribuído via textContent).
 * @param {'info'|'success'|'error'} [kind='info']
 */
export const toast = (message, kind = 'info') => {
  const el = qs('#toast');
  el.textContent = message;
  el.className = `toast show ${kind === 'info' ? '' : kind}`;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { el.className = 'toast'; }, 3600);
};

/**
 * Abre um overlay pelo id.
 * @param {string} id
 */
export const openOverlay = (id) => {
  const el = qs(`#${id}`);
  el.hidden = false;
  el.querySelector('[data-close]')?.focus();
};

/**
 * Fecha um overlay pelo id.
 * @param {string} id
 */
export const closeOverlay = (id) => {
  qs(`#${id}`).hidden = true;
};

/**
 * Liga fechamento por botão, clique no fundo e tecla Esc.
 * @returns {void}
 */
export const initOverlays = () => {
  document.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const closer = target.closest('[data-close]');
    if (closer) {
      closeOverlay(/** @type {HTMLElement} */ (closer).dataset.close);
      return;
    }
    if (target.classList.contains('overlay')) target.hidden = true;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    document.querySelectorAll('.overlay:not([hidden])').forEach((el) => { /** @type {HTMLElement} */ (el).hidden = true; });
  });
};
