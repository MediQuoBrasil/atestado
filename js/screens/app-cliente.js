/**
 * @file App MediQuo Saúde (colaborador, Rota 2): push de lembrete e "Iniciar consulta".
 * O horário é combinado pelo WhatsApp Telessaúde; o push é complementar. Segue o padrão visual da tela Agendamento do app.
 */

import { delegate, esc, icon } from '../core/dom.js';
import { fmtDateLong, fmtSlot, initials } from '../core/format.js';
import {
  atualizarCaso, getColaborador, getFocusCase, getFlag, setFlag,
} from '../core/store.js';
import { MEDICA_PROGRAMA } from '../data/seed.js';

const MEDICA = MEDICA_PROGRAMA.nome;

/**
 * Moldura de status/navegação do celular.
 * @param {string} content
 * @param {{light?: boolean}} [opts]
 * @returns {string}
 */
export const phone = (content, opts = {}) => `
  <div class="phone-status ${opts.light ? 'light' : ''}"><span>16:12</span><span class="ps-icons">5G <i></i> 51%</span></div>
  <div class="phone-body" data-scroll-key="phone">${content}</div>
  <div class="phone-nav" aria-hidden="true"><span></span><span></span><span></span></div>`;

/**
 * Histórico fixo (mesmo formato do print do app).
 * @returns {string}
 */
const historico = () => `
  <p class="app-section">Histórico</p>
  <div class="app-card"><div class="row"><span class="doc">Paula Nogueira</span><span class="app-pill orange">Não compareceu</span></div><div class="when">${icon('calendar', 'ic-sm')} seg., 24 de agosto · 08:00 – 08:30</div></div>
  <div class="app-card"><div class="row"><span class="doc">Renan Okada</span><span class="app-pill red">Cancelada automaticamente</span></div><div class="when">${icon('calendar', 'ic-sm')} ter., 18 de agosto · 07:00 – 07:30</div><div class="reason">Profissional indisponível</div></div>`;

/**
 * Card da consulta marcada.
 * @param {import('../core/store.js').Caso} caso
 * @param {boolean} comBotao Exibe o botão "Iniciar consulta".
 * @returns {string}
 */
const cardProxima = (caso, comBotao) => `
    <p class="app-section">Próximos</p>
    <div class="app-card">
      <div class="row"><span class="doc">${esc(MEDICA)}</span><span class="app-pill ${comBotao ? 'green' : 'purple'}">${comBotao ? 'Começa agora' : 'Agendada'}</span></div>
      <div class="when">${icon('calendar', 'ic-sm')} ${esc(fmtSlot(caso.agendamento?.slot ?? ''))}</div>
      <div class="reason">Avaliação de afastamento · Clínica geral · marcada pelo WhatsApp</div>
      ${comBotao ? `<button type="button" class="app-btn go" data-action="iniciar">${icon('video', 'ic-sm')} Iniciar consulta</button>` : `<div class="app-note">${icon('bell', 'ic-sm')}<span>Você recebe um lembrete 1 hora antes. O botão para entrar aparece no horário.</span></div>`}
    </div>`;

/**
 * Tela de agendamento.
 * @param {import('../core/store.js').Caso} caso
 * @param {boolean} modoConsulta Etapa de iniciar consulta.
 * @returns {string}
 */
const telaAgenda = (caso, modoConsulta) => {
  let topo = '';
  if (caso.agendamento?.slot && ['agendado', 'em_consulta'].includes(caso.status)) topo = cardProxima(caso, modoConsulta);
  else if (caso.desfecho) topo = `<div class="app-note">${icon('check', 'ic-sm')}<span>Consulta realizada. Obrigado por conversar com a equipe médica.</span></div>`;
  else topo = '<div class="app-empty"><p>Nenhuma consulta agendada. O horário é combinado pelo WhatsApp Telessaúde.</p><button type="button" class="app-btn" data-action="voltar-whatsapp">Ir para o WhatsApp</button></div>';
  return phone(`
    <div class="app">
      <div class="app-head">${icon('arrowLeft')}<h1>Agendamento</h1></div>
      ${topo}
      ${historico()}
      <button type="button" class="app-fab" tabindex="-1">${icon('calendar', 'ic-sm')} Novo agendamento</button>
    </div>`);
};

/**
 * Tela de videochamada no app.
 * @returns {string}
 */
export const telaChamada = () => phone(`
  <div class="call">
    <div class="call-top"><b>${esc(MEDICA)}</b><span>Avaliação de afastamento · 00:42</span></div>
    <div class="call-face">${esc(initials(MEDICA.replace('Dra. ', '')))}</div>
    <span class="call-self">Você</span>
    <div class="call-bar"><button type="button" aria-label="Microfone">${icon('mic')}</button><button type="button" aria-label="Câmera">${icon('video')}</button><button type="button" class="end" data-action="encerrar" aria-label="Encerrar">${icon('phoneOff')}</button></div>
  </div>`, { light: true });

/**
 * Atribui handlers comuns às telas do app.
 * @param {HTMLElement} root
 * @param {import('../journey/navigator.js').ScreenCtx} ctx
 * @returns {function(): void}
 */
const bindApp = (root, ctx) => delegate(root, 'click', {
  iniciar: () => {
    const caso = getFocusCase();
    atualizarCaso(caso.id, { status: 'em_consulta' }, { actor: 'colaborador', text: 'Colaborador entrou na videoconsulta pelo app' });
  },
  encerrar: () => ctx.next(),
  'abrir-push': () => {
    setFlag('pushAberto', true);
    ctx.next();
  },
  'voltar-whatsapp': () => {
    const step = ctx.rota.etapas.find((e) => e.screen === 'whatsapp');
    if (step) ctx.goTo(step.id);
  },
});

/** @type {import('../journey/navigator.js').Screen} */
export const appPushScreen = {
  frame: 'phone',
  render: () => {
    const caso = getFocusCase();
    const nome = (getColaborador(caso.colaboradorId)?.nome ?? '').split(' ')[0];
    const temConsulta = Boolean(caso.agendamento?.slot) && caso.status === 'agendado';
    const notif = temConsulta ? `
      <button type="button" class="notif" data-action="abrir-push">
        <span class="appicon" aria-hidden="true"></span>
        <span><span class="top"><span>MediQuo Saúde</span><span>agora</span></span><b>Sua consulta começa agora</b><p>Olá, ${esc(nome)}. A ${esc(MEDICA)} já vai te atender. Toque para entrar na consulta.</p></span>
      </button>` : '';
    return phone(`
      <div class="lock">
        <div class="lock-time">16:12</div>
        <div class="lock-date">${esc(fmtDateLong('2026-10-13').replace('ter.', 'terça-feira'))}</div>
        <div class="lock-notifs">
          ${notif}
          <div class="notif muted"><span class="appicon" style="background:#7a7a86" aria-hidden="true"></span><span><span class="top"><span>Calendário</span><span>15:00</span></span><b>Reunião de equipe</b></span></div>
        </div>
        <div class="lock-hint">${temConsulta ? 'Toque na notificação para abrir' : 'Nenhuma consulta confirmada ainda. O horário é combinado pelo WhatsApp.'}</div>
      </div>`, { light: true });
  },
  side: () => `
    <h3>Push complementar (só no app MediQuo Saúde)</h3>
    <ul>
      <li>O horário já foi combinado pelo WhatsApp Telessaúde. O push só lembra e leva direto à consulta.</li>
      <li>O texto não cita diagnóstico nem a empresa, porque aparece na tela bloqueada.</li>
      <li>Deep link abre o app na consulta: <code>mediquo://agendamento?consulta=${esc(getFocusCase().id)}</code></li>
      <li>Sem permissão de push, o lembrete segue pelo WhatsApp. Apps white label não têm esse push.</li>
    </ul>
    ${getFlag('pushAberto') ? '<p style="margin:10px 0 0">Notificação já aberta nesta sessão.</p>' : ''}`,
  bind: bindApp,
};

/** @type {import('../journey/navigator.js').Screen} */
export const appConsultaScreen = {
  frame: 'phone',
  render: () => {
    const caso = getFocusCase();
    return caso.status === 'em_consulta' ? telaChamada() : telaAgenda(caso, true);
  },
  side: () => `
    <h3>Iniciar consulta no MediQuo Saúde</h3>
    <ul>
      <li>A consulta combinada pelo WhatsApp aparece sozinha na tela Agendamento.</li>
      <li>No horário, o card mostra o botão verde "Iniciar consulta".</li>
      <li>A médica atende pelo MediQuo Pro (Espanha), como nos atendimentos de hoje.</li>
      <li>Ao encerrar, a jornada segue para o médico anexar o parecer.</li>
    </ul>`,
  bind: bindApp,
};
