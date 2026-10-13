/**
 * @file Estrutura do MediQuo Pro (sidebar branca + cabeçalho), com o novo menu "Absenteísmo".
 */

import { esc, icon } from '../core/dom.js';
import { listarCasos } from '../core/store.js';

/**
 * @param {string} ic
 * @param {string} label
 * @returns {string}
 */
const item = (ic, label) => `<div class="pro-nav-item">${icon(ic)}${esc(label)}</div>`;

/**
 * Sidebar + cabeçalho + conteúdo.
 * @param {{title: string, subtitle: string, actions?: string, content: string}} page Markup já escapado em actions/content.
 * @returns {string}
 */
export const proShell = (page) => {
  const abertos = listarCasos().filter((c) => !['concluido', 'registrado', 'validado'].includes(c.status)).length;
  return `
  <div class="pro-app">
    <aside class="pro-aside">
      <div class="pro-aside-head"><span class="pro-logo" aria-hidden="true"></span><p class="pro-brand">MediQuo Pro</p></div>
      <nav class="pro-nav">
        ${item('dashboard', 'Dashboard')}
        ${item('users', 'Profissionais')}
        ${item('stethoscope', 'Especialidades')}
        ${item('notepad', 'Anamneses')}
        ${item('clipboard', 'Consultas')}
        <button type="button" class="pro-nav-item active" data-action="pro-home">${icon('fileHeart')}Absenteísmo<span class="badge-new">${abertos}</span></button>
        ${item('calendarDays', 'Feriados')}
        ${item('bell', 'Notificações')}
      </nav>
      <div class="pro-aside-foot">
        <div class="pro-role">${icon('stethoscope', 'ic-sm')}Equipe médica</div>
        <div class="pro-user"><span class="pro-avatar">BS</span><div style="min-width:0"><p class="n">Dra. Beatriz Sampaio</p><p class="e">Clínica geral · CRM-SP 214587</p></div></div>
      </div>
    </aside>
    <main class="pro-main" data-scroll-key="pro-main">
      <div class="pro-header"><div><h1>${esc(page.title)}</h1><p>${esc(page.subtitle)}</p></div>${page.actions ?? ''}</div>
      <div class="pro-content">${page.content}</div>
    </main>
  </div>`;
};

/**
 * Vai ao passo do painel do Pro, se existir na rota.
 * @param {import('../journey/navigator.js').ScreenCtx} ctx
 */
export const goProHome = (ctx) => {
  const step = ctx.rota.etapas.find((e) => e.screen === 'pro-dashboard');
  if (step) ctx.goTo(step.id);
};

/**
 * Passo que abre o caso no Pro (detalhe ou consulta, conforme a rota).
 * @param {import('../journey/navigator.js').ScreenCtx} ctx
 * @returns {string|null}
 */
export const proCaseStep = (ctx) => (ctx.rota.etapas.find((e) => e.screen === 'pro-caso') ?? ctx.rota.etapas.find((e) => e.screen === 'pro-consulta'))?.id ?? null;
