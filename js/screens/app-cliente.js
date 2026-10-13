/**
 * @file App MediQuo (colaborador): notificação push, agendamento e "Iniciar consulta".
 * Segue o padrão visual da tela Agendamento atual do app.
 */

import { delegate, esc, icon } from '../core/dom.js';
import { fmtDateLong, fmtSlot, initials } from '../core/format.js';
import {
  atualizarCaso, getColaborador, getFocusCase, getFlag, setFlag,
} from '../core/store.js';

const MEDICA = 'Dra. Beatriz Sampaio';

/** Estado local. */
const ui = { slot: '' };

/**
 * Moldura de status/navegação do celular.
 * @param {string} content
 * @param {{light?: boolean}} [opts]
 * @returns {string}
 */
const phone = (content, opts = {}) => `
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
const cardProxima = (caso, comBotao) => {
  const viaWhats = caso.timeline.some((t) => t.text.includes('WhatsApp') && t.actor === 'colaborador');
  return `
    <p class="app-section">Próximos</p>
    <div class="app-card">
      <div class="row"><span class="doc">${esc(MEDICA)}</span><span class="app-pill ${comBotao ? 'green' : 'purple'}">${comBotao ? 'Começa agora' : 'Agendada'}</span></div>
      <div class="when">${icon('calendar', 'ic-sm')} ${esc(fmtSlot(caso.agendamento?.slot ?? ''))}</div>
      <div class="reason">Avaliação de afastamento · Clínica geral${viaWhats ? ' · confirmada pelo WhatsApp' : ''}</div>
      ${comBotao ? `<button type="button" class="app-btn go" data-action="iniciar">${icon('video', 'ic-sm')} Iniciar consulta</button>` : `<div class="app-note">${icon('bell', 'ic-sm')}<span>Você recebe um lembrete 1 hora antes. O botão para entrar aparece no horário.</span></div>`}
    </div>`;
};

/**
 * Convite pendente com escolha de horário.
 * @param {import('../core/store.js').Caso} caso
 * @returns {string}
 */
const cardConvite = (caso) => {
  const nome = (getColaborador(caso.colaboradorId)?.nome ?? '').split(' ')[0];
  const slots = caso.agendamento?.slotsSugeridos ?? [];
  if (!ui.slot || !slots.includes(ui.slot)) [ui.slot] = slots;
  return `
    <div class="app-invite">
      <span class="tag">${icon('stethoscope', 'ic-sm')} Convite da equipe médica</span>
      <h2>Avaliação de afastamento</h2>
      <p>${esc(nome)}, recebemos seu atestado pela sua empresa. Queremos acompanhar sua recuperação numa conversa rápida por vídeo. É sigiloso: sua empresa não vê o conteúdo da consulta.</p>
      <div class="app-slots">${slots.map((s) => `<button type="button" class="app-slot ${s === ui.slot ? 'on' : ''}" data-action="slot" data-slot="${esc(s)}"><span>${esc(fmtSlot(s))}</span><span class="r"></span></button>`).join('')}</div>
      <button type="button" class="app-btn" data-action="confirmar">Confirmar horário</button>
    </div>`;
};

/**
 * Tela de agendamento.
 * @param {import('../core/store.js').Caso} caso
 * @param {boolean} modoConsulta Etapa de iniciar consulta.
 * @returns {string}
 */
const telaAgenda = (caso, modoConsulta) => {
  let topo = '';
  if (caso.status === 'convite_enviado') topo = cardConvite(caso);
  else if (caso.agendamento?.slot && ['agendado', 'em_consulta'].includes(caso.status)) topo = cardProxima(caso, modoConsulta);
  else if (caso.desfecho) topo = `<div class="app-note">${icon('check', 'ic-sm')}<span>Consulta realizada. Obrigado por conversar com a equipe médica.</span></div>`;
  else topo = '<div class="app-empty"><p>Nenhum convite pendente. Volte à etapa em que o médico libera a agenda.</p><button type="button" class="app-btn" data-action="voltar-convite">Ir para o convite</button></div>';
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
const telaChamada = () => phone(`
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
  slot: (el) => {
    ui.slot = el.dataset.slot ?? '';
    root.querySelectorAll('.app-slot').forEach((b) => b.classList.toggle('on', b.dataset.slot === ui.slot));
  },
  confirmar: () => {
    const caso = getFocusCase();
    if (!caso.agendamento?.slotsSugeridos.includes(ui.slot)) {
      ctx.toast('Escolha um dos horários.', 'error');
      return;
    }
    atualizarCaso(caso.id, { status: 'agendado', agendamento: { ...caso.agendamento, slot: ui.slot } }, { actor: 'colaborador', text: `Colaborador agendou pelo app para ${fmtSlot(ui.slot)}` });
    ctx.toast('Consulta agendada.', 'success');
  },
  iniciar: () => {
    const caso = getFocusCase();
    atualizarCaso(caso.id, { status: 'em_consulta' }, { actor: 'colaborador', text: 'Colaborador entrou na videoconsulta pelo app' });
  },
  encerrar: () => ctx.next(),
  'abrir-push': () => {
    setFlag('pushAberto', true);
    ctx.next();
  },
  'voltar-convite': () => {
    const step = ctx.rota.etapas.find((e) => e.screen === 'pro-caso' || e.screen === 'whatsapp');
    if (step) ctx.goTo(step.id);
  },
});

/** @type {import('../journey/navigator.js').Screen} */
export const appPushScreen = {
  frame: 'phone',
  render: () => {
    const caso = getFocusCase();
    const nome = (getColaborador(caso.colaboradorId)?.nome ?? '').split(' ')[0];
    const temConvite = caso.status === 'convite_enviado';
    const notif = temConvite ? `
      <button type="button" class="notif" data-action="abrir-push">
        <span class="appicon" aria-hidden="true"></span>
        <span><span class="top"><span>MediQuo</span><span>agora</span></span><b>Avaliação de afastamento</b><p>Olá, ${esc(nome)}. A equipe médica quer acompanhar sua recuperação. Toque para escolher um horário.</p></span>
      </button>` : '';
    return phone(`
      <div class="lock">
        <div class="lock-time">16:12</div>
        <div class="lock-date">${esc(fmtDateLong('2026-10-13').replace('ter.', 'terça-feira'))}</div>
        <div class="lock-notifs">
          ${notif}
          <div class="notif muted"><span class="appicon" style="background:#7a7a86" aria-hidden="true"></span><span><span class="top"><span>Calendário</span><span>15:00</span></span><b>Reunião de equipe</b></span></div>
        </div>
        <div class="lock-hint">${temConvite ? 'Toque na notificação para abrir' : 'Nenhum convite ainda. Envie o convite no MediQuo Pro.'}</div>
      </div>`, { light: true });
  },
  side: () => `
    <h3>Notificação push</h3>
    <ul>
      <li>O texto não cita diagnóstico nem a empresa, porque aparece na tela bloqueada.</li>
      <li>Deep link abre o app direto no convite: <code>mediquo://agendamento?convite=${esc(getFocusCase().id)}</code></li>
      <li>Sem permissão de push ou sem app instalado: fallback por SMS ou WhatsApp.</li>
      <li>Lembretes automáticos: 24h e 1h antes da consulta.</li>
    </ul>
    ${getFlag('pushAberto') ? '<p style="margin:10px 0 0">Notificação já aberta nesta sessão.</p>' : ''}`,
  bind: bindApp,
};

/** @type {import('../journey/navigator.js').Screen} */
export const appAgendaScreen = {
  frame: 'phone',
  render: () => telaAgenda(getFocusCase(), false),
  side: (ctx) => `
    <h3>${ctx.params.origem === 'whatsapp' ? 'Consulta vinda do WhatsApp' : 'Agendamento no app'}</h3>
    <ul>
      <li>Reaproveita a tela Agendamento atual, com um card de convite no topo.</li>
      <li>Horários vêm da agenda do médico no MediQuo Pro, reservados por 24h.</li>
      <li>Ao confirmar, o status muda para "Consulta agendada" no Pro e no ID.</li>
      ${ctx.params.origem === 'whatsapp' ? '<li>O horário escolhido no WhatsApp já aparece aqui, sem novo passo para o colaborador.</li>' : ''}
    </ul>`,
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
    <h3>Iniciar consulta</h3>
    <ul>
      <li>No horário marcado, o card mostra o botão verde "Iniciar consulta".</li>
      <li>A sala abre no próprio app (videoconsulta existente da MediQuo).</li>
      <li>Ao encerrar, a jornada segue para o médico registrar o desfecho.</li>
    </ul>`,
  bind: bindApp,
};
