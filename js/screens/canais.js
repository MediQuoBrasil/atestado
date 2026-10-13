/**
 * @file Canais externos simulados: videochamada no Google Meet (Rota 1) e convite por WhatsApp (Rota 3).
 * São representações genéricas para o protótipo, sem logotipos de terceiros.
 */

import { delegate, esc, icon, ICONS } from '../core/dom.js';
import { createLogger } from '../core/logger.js';
import { fmtSlot, initials } from '../core/format.js';
import {
  atualizarCaso, empresaDoCaso, getColaborador, getFocusCase, horariosDisponiveis,
} from '../core/store.js';

const log = createLogger('canais');

/* ─── Videochamada (Meet) ───────────────────────────────── */

/**
 * Tela da videochamada externa.
 * @returns {string}
 */
const renderMeet = () => {
  const caso = getFocusCase();
  const col = getColaborador(caso.colaboradorId);
  const link = caso.agendamento?.canal === 'meet' ? caso.agendamento.link : null;
  if (!link) {
    return `<div class="meet"><div class="meet-empty"><p>O RH ainda não informou o link do Meet para este caso.</p><button type="button" data-action="goto" data-step="agenda-rh">Ir para a agenda do RH</button></div></div>`;
  }
  return `
    <div class="meet">
      <div class="meet-stage">
        <div class="meet-tiles">
          <div class="meet-tile speaking"><span class="face" style="background:#7b5cd6">BS</span><span class="name">Dra. Beatriz Sampaio</span></div>
          <div class="meet-tile"><span class="face" style="background:#c2410c">${esc(initials(col?.nome))}</span><span class="name">${esc(col?.nome ?? '')}</span></div>
        </div>
        <div class="meet-bar">
          <span class="code">16:12 · ${esc(link.replace('https://meet.google.com/', ''))}</span>
          <div class="meet-ctrls"><span>${icon('mic')}</span><span>${icon('video')}</span><button type="button" class="end" data-action="encerrar">${icon('phoneOff')} Encerrar e registrar desfecho</button></div>
          <span class="code">Videochamada externa (simulada)</span>
        </div>
      </div>
      <aside class="meet-side">
        <h3>Detalhes da reunião</h3>
        <div class="link">${esc(link)}</div>
        <p>${esc(fmtSlot(caso.agendamento?.slot ?? ''))}</p>
        <p>Convidados: Dra. Beatriz Sampaio, ${esc(col?.nome ?? '')}</p>
        <div class="tip">Nesta rota a chamada não fica registrada na MediQuo. O desfecho é preenchido manualmente no Pro.</div>
      </aside>
    </div>`;
};

/** @type {import('../journey/navigator.js').Screen} */
export const meetScreen = {
  frame: 'desktop',
  url: () => {
    const link = getFocusCase().agendamento?.link;
    return link ? link.replace('https://', '') : 'meet.google.com';
  },
  render: renderMeet,
  bind: (root, ctx) => delegate(root, 'click', {
    encerrar: () => {
      const caso = getFocusCase();
      if (caso.status === 'agendado') atualizarCaso(caso.id, { status: 'em_consulta' }, { actor: 'sistema', text: 'Consulta realizada por Google Meet' });
      ctx.next();
    },
    goto: (el) => ctx.goTo(el.dataset.step),
  }),
};

/* ─── Convite por WhatsApp ─────────────────────────────── */

/** Horários oferecidos no chat (fixados na primeira renderização). */
const chat = { slots: /** @type {string[]} */ ([]) };

/**
 * @param {string} text
 * @param {'in'|'out'} dir
 * @param {string} hora
 * @returns {string}
 */
const bubble = (text, dir, hora) => `<div class="bubble ${dir}">${esc(text)}<span class="t">${esc(hora)}${dir === 'out' ? ' ✓✓' : ''}</span></div>`;

/**
 * @returns {string}
 */
const renderWhats = () => {
  const caso = getFocusCase();
  const col = getColaborador(caso.colaboradorId);
  const emp = empresaDoCaso(caso);
  const nome = (col?.nome ?? '').split(' ')[0];
  if (chat.slots.length === 0) chat.slots = horariosDisponiveis(3);
  const escolhido = caso.agendamento?.slot ?? null;
  let body = '<div class="chat-day">HOJE</div>';
  if (!caso.triagem.elegivel) {
    body += '<div class="chat-day">Caso fora dos critérios de entrada: nenhum convite enviado</div>';
  } else {
    body += bubble(`Olá, ${nome}! Aqui é a MediQuo, parceira de saúde da ${emp?.razao.replace(/ (S\.A\.|Ltda\.)$/, '') ?? 'sua empresa'}.\n\nRecebemos seu atestado e queremos acompanhar sua recuperação numa conversa rápida por vídeo com a equipe médica. A conversa é sigilosa: sua empresa não vê o conteúdo.`, 'in', '16:05');
    body += bubble('Qual horário fica melhor para você?', 'in', '16:05');
    if (escolhido) {
      body += bubble(fmtSlot(escolhido), 'out', '16:09');
      body += bubble(`Pronto, ${nome}! Consulta confirmada para ${fmtSlot(escolhido)} com a Dra. Beatriz Sampaio.\n\nA consulta acontece no app MediQuo. Vamos te lembrar 1 hora antes.`, 'in', '16:09');
    } else {
      body += `<div class="quick">${chat.slots.map((s) => `<button type="button" data-action="wa-slot" data-slot="${esc(s)}">${esc(fmtSlot(s))}</button>`).join('')}<button type="button" data-action="wa-outro">Outro horário</button></div>`;
    }
  }
  return `
    <div class="phone-status light" style="background:#0c4a3f"><span>16:12</span><span class="ps-icons">5G <i></i> 51%</span></div>
    <div class="chat">
      <div class="chat-head">${icon('arrowLeft', 'ic-sm')}<span class="av" aria-hidden="true"></span><div><b>MediQuo Saúde</b><span>conta comercial verificada</span></div></div>
      <div class="chat-body" data-scroll-key="chat">${body}</div>
      <div class="chat-input"><span>Mensagem</span><i aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">${ICONS.mic}</svg></i></div>
    </div>
    <div class="phone-nav" aria-hidden="true"><span></span><span></span><span></span></div>`;
};

/** @type {import('../journey/navigator.js').Screen} */
export const whatsappScreen = {
  frame: 'phone',
  render: renderWhats,
  side: () => {
    const caso = getFocusCase();
    return `
      <h3>Convite clínico automático</h3>
      <ul>
        <li>Disparado pela triagem: ${esc(caso.triagem.elegivel ? `prioridade ${caso.triagem.prioridade}` : 'caso não elegível')}.</li>
        <li>SLA de primeiro contato: 24h úteis. Tentativa 1 de 3; sem resposta, nova tentativa em 4h e depois aviso ao RH.</li>
        <li>Mensagem aprovada como template (WhatsApp Business), sem diagnóstico.</li>
        <li>Resposta por botão vira reserva na agenda do Pro.</li>
      </ul>`;
  },
  bind: (root, ctx) => delegate(root, 'click', {
    'wa-slot': (el) => {
      const slot = el.dataset.slot ?? '';
      if (!chat.slots.includes(slot)) return;
      const caso = getFocusCase();
      atualizarCaso(caso.id, { status: 'agendado', agendamento: { canal: 'app', slotsSugeridos: chat.slots, slot, link: null } }, { actor: 'colaborador', text: `Colaborador escolheu ${fmtSlot(slot)} pelo WhatsApp` });
      log.info('Horário escolhido pelo WhatsApp');
      ctx.toast('Horário reservado na agenda da médica.', 'success');
    },
    'wa-outro': () => ctx.toast('No produto real, o bot oferece mais horários ou transfere para um atendente.'),
  }),
};
