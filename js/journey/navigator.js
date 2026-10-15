/**
 * @file Navegação da jornada: seletor de rotas, trilha clicável, nota da etapa, transições e frames.
 */

import { delegate, esc, icon, qs } from '../core/dom.js';
import { createLogger } from '../core/logger.js';
import { subscribe } from '../core/store.js';
import { toast } from '../ui/feedback.js';
import { ROTAS, getRota } from './routes.js';

const log = createLogger('journey');

/**
 * @typedef {import('./routes.js').Rota} Rota
 * @typedef {import('./routes.js').Etapa} Etapa
 */

/**
 * @typedef {Object} ScreenCtx
 * @property {Rota} rota
 * @property {Etapa} etapa
 * @property {number} index
 * @property {Object<string, string>} params
 * @property {function(): void} next          Avança para a próxima etapa.
 * @property {function(string): void} goTo     Vai para a etapa com o id informado.
 * @property {function(string, ('info'|'success'|'error')=): void} toast
 */

/**
 * @typedef {Object} Screen
 * @property {'desktop'|'phone'} frame
 * @property {function(ScreenCtx): string} [url]   URL exibida na barra do navegador.
 * @property {function(ScreenCtx): string} render  Markup interno do frame.
 * @property {function(ScreenCtx): string} [side]  Cartão lateral (frames de celular).
 * @property {function(HTMLElement, ScreenCtx): (void|function(): void)} [bind]
 */

/** @type {Object<string, Screen>} */
const registry = {};

const nav = { rotaId: 'meet', index: 0, cleanup: /** @type {null|function(): void} */ (null) };

/**
 * Registra uma tela.
 * @param {string} key
 * @param {Screen} screen
 */
export const registerScreen = (key, screen) => { registry[key] = screen; };

/** @returns {Rota} */
const rotaAtual = () => getRota(nav.rotaId);

/** Atualiza o hash para permitir link direto (formato rota-etapa). */
const syncHash = () => {
  const hash = `#${nav.rotaId}-${nav.index + 1}`;
  if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
};

/** Lê o hash inicial. */
const readHash = () => {
  const match = /^#([a-z]+)-(\d{1,2})$/.exec(window.location.hash);
  if (!match) return;
  const rota = ROTAS.find((r) => r.id === match[1]);
  if (!rota) return;
  nav.rotaId = rota.id;
  nav.index = Math.min(Math.max(Number(match[2]) - 1, 0), rota.etapas.length - 1);
};

const renderRouteSwitch = () => {
  qs('#routeSwitch').innerHTML = ROTAS.map((r) => `
    <button type="button" class="route-btn ${r.id === nav.rotaId ? 'active' : ''}" data-action="rota" data-rota="${esc(r.id)}" aria-pressed="${r.id === nav.rotaId}" title="${esc(r.resumo)}">
      <span class="rk">${esc(r.chave)}</span><span class="rn">${esc(r.nome)}</span>
    </button>`).join('');
};

/** Rola a trilha horizontalmente para manter a etapa atual centralizada. */
const centerCurrentStep = () => {
  const cur = /** @type {HTMLElement|null} */ (qs('#stepper').querySelector('.step.current'));
  const track = /** @type {HTMLElement} */ (qs('#stepper').parentElement);
  if (cur) track.scrollLeft = cur.offsetLeft - track.clientWidth / 2 + cur.offsetWidth / 2;
};

const renderStepper = () => {
  const { etapas } = rotaAtual();
  qs('#stepper').innerHTML = etapas.map((e, i) => {
    let state = '';
    if (i < nav.index) state = 'done';
    else if (i === nav.index) state = 'current';
    return `
      <li class="step actor-${esc(e.actor)} ${state}">
        <button type="button" class="step-btn" data-action="step" data-index="${i}" aria-current="${i === nav.index ? 'step' : 'false'}" title="${esc(e.produto)} · ${esc(e.label)}">
          <span class="step-dot">${i < nav.index ? '✓' : i + 1}</span>
          <span class="step-prod">${esc(e.produto)}</span>
          <span class="step-label">${esc(e.label)}</span>
        </button>
      </li>`;
  }).join('');
  centerCurrentStep();
};

/**
 * Retrai ou expande as barras de rotas e etapas.
 * Retraído: rotas mostram só a chave ("Rota 1") e etapas só o número.
 * @param {boolean} collapsed
 */
const setCollapsed = (collapsed) => {
  const btn = qs('#btnCollapse');
  const label = collapsed ? 'Expandir rotas e etapas' : 'Retrair rotas e etapas';
  qs('#shell').classList.toggle('is-collapsed', collapsed);
  btn.setAttribute('aria-expanded', String(!collapsed));
  btn.setAttribute('aria-label', label);
  btn.title = label;
  centerCurrentStep();
};

const ATOR_LABEL = Object.freeze({ rh: 'RH · ID', medico: 'Médico · Pro', colaborador: 'Colaborador · App', externo: 'Canal externo', sistema: 'Sistema' });

const renderNote = () => {
  const rota = rotaAtual();
  const etapa = rota.etapas[nav.index];
  const last = nav.index === rota.etapas.length - 1;
  qs('#stepNote').innerHTML = `
    <span class="note-actor actor-${esc(etapa.actor)}">${esc(ATOR_LABEL[etapa.actor])}</span>
    <div class="note-text">
      <p class="note-title">${esc(etapa.titulo)}</p>
      <p class="note-desc">${esc(etapa.nota)}</p>
    </div>
    <div class="note-nav">
      <button type="button" class="nav-btn" data-action="prev" ${nav.index === 0 ? 'disabled' : ''}>${icon('chevronLeft', 'ic-sm')} Anterior</button>
      <span class="nav-count">${nav.index + 1} / ${rota.etapas.length}</span>
      <button type="button" class="nav-btn primary" data-action="next" ${last ? 'disabled' : ''}>Próxima ${icon('chevronRight', 'ic-sm')}</button>
    </div>`;
};

/**
 * Monta o contexto entregue à tela.
 * @returns {ScreenCtx}
 */
const buildCtx = () => {
  const rota = rotaAtual();
  const etapa = rota.etapas[nav.index];
  return {
    rota,
    etapa,
    index: nav.index,
    params: etapa.params ?? {},
    // eslint-disable-next-line no-use-before-define
    next: () => goToIndex(nav.index + 1),
    // eslint-disable-next-line no-use-before-define
    goTo: (id) => goToIndex(rota.etapas.findIndex((e) => e.id === id)),
    toast,
  };
};

/**
 * Envolve o markup da tela no frame do dispositivo.
 * @param {Screen} screen
 * @param {ScreenCtx} ctx
 * @returns {string}
 */
const wrapFrame = (screen, ctx) => {
  const inner = screen.render(ctx);
  if (screen.frame === 'phone') {
    const side = screen.side ? `<aside class="side-card">${screen.side(ctx)}</aside>` : '';
    return `<div class="phone-row"><div class="device-phone"><div class="phone-screen">${inner}</div></div>${side}</div>`;
  }
  const url = screen.url ? screen.url(ctx) : '';
  const [host, ...path] = url.split('/');
  return `
    <div class="device-desktop">
      <div class="browser-bar">
        <span class="browser-dots" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="browser-url">${icon('lock', 'ic-xs')} <b>${esc(host)}</b>/${esc(path.join('/'))}</span>
        <span class="browser-tag">simulação</span>
      </div>
      <div class="device-scroll"><div class="device-viewport">${inner}</div></div>
    </div>`;
};

/**
 * Renderiza a tela atual. Preserva a rolagem de contêineres marcados com data-scroll-key.
 * @param {'fwd'|'back'|null} direction
 */
const renderStage = (direction) => {
  const root = qs('#stageInner');
  const ctx = buildCtx();
  const screen = registry[ctx.etapa.screen];
  if (!screen) {
    log.error('Tela não registrada', { screen: ctx.etapa.screen });
    root.textContent = 'Tela indisponível.';
    return;
  }
  /** @type {Object<string, number>} */
  const scrolls = {};
  if (!direction) root.querySelectorAll('[data-scroll-key]').forEach((el) => { scrolls[el.dataset.scrollKey] = el.scrollTop; });

  if (nav.cleanup) nav.cleanup();
  nav.cleanup = null;
  try {
    root.innerHTML = wrapFrame(screen, ctx);
    const cleanup = screen.bind?.(root, ctx);
    if (typeof cleanup === 'function') nav.cleanup = cleanup;
  } catch (err) {
    log.error('Falha ao renderizar tela', { screen: ctx.etapa.screen, message: err.message });
    root.textContent = 'Algo deu errado ao montar esta tela. Use "Reiniciar" para restaurar os dados.';
    return;
  }
  root.querySelectorAll('[data-scroll-key]').forEach((el) => {
    if (scrolls[el.dataset.scrollKey]) el.scrollTop = scrolls[el.dataset.scrollKey];
  });

  root.classList.remove('enter-fwd', 'enter-back');
  if (direction) {
    // Força reflow para reiniciar a animação de entrada.
    // eslint-disable-next-line no-unused-expressions
    root.offsetWidth;
    root.classList.add(direction === 'fwd' ? 'enter-fwd' : 'enter-back');
    qs('#stage').scrollTop = 0;
  }
};

/**
 * Vai para uma etapa da rota atual.
 * @param {number} index
 */
const goToIndex = (index) => {
  const total = rotaAtual().etapas.length;
  if (!Number.isInteger(index) || index < 0 || index >= total || index === nav.index) return;
  const direction = index > nav.index ? 'fwd' : 'back';
  nav.index = index;
  log.info('Etapa', { rota: nav.rotaId, etapa: rotaAtual().etapas[index].id });
  renderStepper();
  renderNote();
  renderStage(direction);
  syncHash();
};

/**
 * Troca a rota mantendo a etapa equivalente quando existir.
 * @param {string} rotaId
 */
const setRota = (rotaId) => {
  if (rotaId === nav.rotaId) return;
  const atual = rotaAtual().etapas[nav.index]?.id;
  nav.rotaId = getRota(rotaId).id;
  const idx = rotaAtual().etapas.findIndex((e) => e.id === atual);
  nav.index = idx >= 0 ? idx : 0;
  renderRouteSwitch();
  renderStepper();
  renderNote();
  renderStage('fwd');
  syncHash();
};

/**
 * Inicializa a navegação.
 * @param {{onCompare: function(string): void, onReset: function(): void}} hooks
 */
export const initNavigator = (hooks) => {
  readHash();
  renderRouteSwitch();
  renderStepper();
  renderNote();
  renderStage('fwd');
  syncHash();

  const shell = qs('#shell');
  delegate(shell, 'click', {
    rota: (el) => setRota(el.dataset.rota),
    step: (el) => goToIndex(Number(el.dataset.index)),
    prev: () => goToIndex(nav.index - 1),
    next: () => goToIndex(nav.index + 1),
  });
  qs('#btnCompare').addEventListener('click', () => hooks.onCompare(nav.rotaId));
  qs('#btnCollapse').addEventListener('click', () => setCollapsed(!shell.classList.contains('is-collapsed')));
  qs('#btnReset').addEventListener('click', () => {
    hooks.onReset();
    nav.index = 0;
    renderStepper();
    renderNote();
    renderStage('back');
    syncHash();
  });
  document.addEventListener('keydown', (event) => {
    const tag = /** @type {HTMLElement} */ (event.target).tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || event.altKey || event.ctrlKey || event.metaKey) return;
    if (document.querySelector('.overlay:not([hidden])')) return;
    if (event.key === 'ArrowRight') goToIndex(nav.index + 1);
    if (event.key === 'ArrowLeft') goToIndex(nav.index - 1);
  });
  subscribe(() => renderStage(null));
};
