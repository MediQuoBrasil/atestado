/**
 * @file WhatsApp Telessaúde (Rotas 1 e 2), visto pelo secretário: conversa direta com o colaborador
 * para combinar a consulta. O horário combinado é registrado no MediQuo Pro, e a confirmação volta por aqui.
 * Representação genérica para o protótipo, sem logotipos de terceiros.
 */

import { delegate, esc, icon } from '../core/dom.js';
import { createLogger } from '../core/logger.js';
import { fmtSlot, fmtTelefone, initials } from '../core/format.js';
import {
  getColaborador, getFocusCase, iniciarContato, proximoDiaUtil, registrarAgendamento,
} from '../core/store.js';
import { APPS_CONSULTA_FRASE, HORARIO_SUGERIDO } from '../data/rules.js';
import { GESTOR_SAUDE, MEDICA_PROGRAMA } from '../data/seed.js';

const log = createLogger('whatsapp');

/** Status em que a conversa já começou. */
const COM_CONVERSA = new Set(['em_contato', 'agendado', 'em_consulta', 'em_acompanhamento', 'concluido', 'encaminhado']);

/**
 * Balão de mensagem.
 * @param {'in'|'out'} lado in = colaborador, out = secretário.
 * @param {string} html  Conteúdo já escapado.
 * @param {string} hora
 * @returns {string}
 */
const msg = (lado, html, hora) => `<div class="wa-msg ${lado}"><div class="wa-txt">${html}</div><span class="wa-time">${esc(hora)}${lado === 'out' ? ' ✓✓' : ''}</span></div>`;

/**
 * App da consulta conforme a etapa (usado antes de existir agendamento).
 * @param {import('../journey/navigator.js').ScreenCtx} ctx
 * @returns {import('../core/store.js').AppConsulta}
 */
const appDaRota = (ctx) => (ctx.rota.id === 'app' ? 'mediquo_saude' : 'white_label');

/**
 * Primeira mensagem do secretário (gestor de saúde). Não cita diagnóstico.
 * @param {string} nome Primeiro nome do colaborador.
 * @returns {string} HTML escapado.
 */
const abertura = (nome) => `Olá, ${esc(nome)}! Meu nome é ${esc(GESTOR_SAUDE.nome)}, sou gestor de saúde do seu aplicativo de telessaúde, tudo bem? Recebemos seu atestado pela sua empresa e queremos acompanhar seu estado de saúde e recuperação de forma mais próxima em uma consulta médica com nossos especialistas. Poderíamos agendar? Que dia e horário ficam bons para você?`;

/**
 * Confirmação enviada depois do registro no MediQuo Pro, com o caminho para a consulta.
 * @param {import('../core/store.js').Agendamento} ag
 * @returns {string} HTML escapado.
 */
const confirmacao = (ag) => {
  const quando = `<b>${esc(fmtSlot(ag.slot ?? ''))}</b>`;
  const comoEntrar = ag.app === 'mediquo_saude'
    ? `Na hora, o ${esc(APPS_CONSULTA_FRASE.mediquo_saude)} te lembra e você entra pelo botão <b>Iniciar consulta</b>.`
    : `No horário, abra o ${esc(APPS_CONSULTA_FRASE.white_label)}, procure a <b>${esc(MEDICA_PROGRAMA.nome)}</b> nas conversas e toque na câmera para iniciar a videochamada.`;
  return `Consulta marcada para ${quando}. ${comoEntrar}<br><br>É sigiloso: sua empresa não vê o conteúdo da consulta.`;
};

/**
 * Conversa entre secretário e colaborador.
 * @param {import('../core/store.js').Caso} caso
 * @returns {string}
 */
const conversa = (caso) => {
  const nome = (getColaborador(caso.colaboradorId)?.nome ?? '').split(' ')[0];
  const ag = caso.agendamento;
  if (!ag || !COM_CONVERSA.has(caso.status)) {
    return `
      <div class="wa-day">Contato informado pelo RH no ID</div>
      <div class="wa-msg out draft"><div class="wa-txt">${abertura(nome)}</div><span class="wa-time">rascunho</span></div>
      <button type="button" class="wa-btn wa-send" data-action="enviar">${icon('send', 'ic-sm')} Enviar mensagem</button>`;
  }
  const inicio = `<div class="wa-day">Hoje</div>${msg('out', abertura(nome), '16:05')}${msg('in', 'Oi! Pode ser amanhã à tarde, depois das 14h?', '16:09')}`;
  if (!ag.slot) {
    return `${inicio}${msg('out', 'Combinado! Vou reservar na agenda médica e já te confirmo por aqui.', '16:10')}
      <div class="wa-hint">${icon('calendar', 'ic-sm')}<span>Registre no MediQuo Pro o horário combinado (${esc(fmtSlot(`${proximoDiaUtil()}T${HORARIO_SUGERIDO}`))}). A confirmação sai por aqui.</span><button type="button" class="wa-btn" data-action="registrar">Registrar no MediQuo Pro</button></div>`;
  }
  return `${inicio}${msg('out', confirmacao(ag), '16:12')}${msg('in', 'Perfeito, obrigado!', '16:13')}`;
};

/**
 * @returns {string}
 */
const render = () => {
  const caso = getFocusCase();
  const nome = getColaborador(caso.colaboradorId)?.nome ?? 'Colaborador';
  return `
    <div class="phone-status wa-bar"><span>16:13</span><span class="ps-icons">5G <i></i> 51%</span></div>
    <div class="wa">
      <div class="wa-head">${icon('arrowLeft')}<span class="wa-avatar" aria-hidden="true">${esc(initials(nome))}</span><div><b>${esc(nome)}</b><small>${esc(fmtTelefone(caso.telefone))}</small></div></div>
      <div class="wa-chat" data-scroll-key="wa">${conversa(caso)}</div>
      <div class="wa-input"><span>Mensagem</span><span class="wa-mic">${icon('mic', 'ic-sm')}</span></div>
    </div>
    <div class="phone-nav" aria-hidden="true"><span></span><span></span><span></span></div>`;
};

/**
 * @param {HTMLElement} root
 * @param {import('../journey/navigator.js').ScreenCtx} ctx
 * @returns {function(): void}
 */
const bind = (root, ctx) => {
  const chat = root.querySelector('.wa-chat');
  if (chat) chat.scrollTop = chat.scrollHeight;
  return delegate(root, 'click', {
    enviar: () => {
      const result = iniciarContato(getFocusCase().id, appDaRota(ctx));
      if (!result.ok) {
        log.warn('Contato recusado', { motivo: result.error });
        ctx.toast(result.error, 'error');
        return;
      }
      ctx.toast('Mensagem enviada. O status no ID mudou para "Em contato".', 'success');
    },
    registrar: () => {
      const result = registrarAgendamento(getFocusCase().id, { data: proximoDiaUtil(), hora: HORARIO_SUGERIDO });
      if (!result.ok) {
        log.warn('Registro de horário recusado', { motivo: result.error });
        ctx.toast(result.error, 'error');
        return;
      }
      ctx.toast('Consulta na agenda do médico. Confirmação enviada e status atualizado no ID.', 'success');
    },
  });
};

/** @type {import('../journey/navigator.js').Screen} */
export const whatsappScreen = {
  frame: 'phone',
  render,
  side: () => {
    const caso = getFocusCase();
    return `
      <h3>WhatsApp do secretário</h3>
      <ul>
        <li>O secretário vê o caso no MediQuo Pro e chama o colaborador no celular informado pelo RH: <b>${esc(fmtTelefone(caso.telefone))}</b>.</li>
        <li>A conversa é direta, sem horários pré-definidos. A mensagem não cita diagnóstico.</li>
        <li>Combinado o horário, o secretário registra data e hora no MediQuo Pro: a consulta entra na agenda do médico e o status muda no ID.</li>
        <li>A consulta nunca acontece no WhatsApp nem no Meet: no horário, o colaborador procura o médico no app de telessaúde.</li>
      </ul>`;
  },
  bind,
};
