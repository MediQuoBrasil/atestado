/**
 * @file MediQuo Pro · Consulta de absenteísmo e parecer (Rotas 1 e 2).
 * Lista de agendamentos e atendimento pelo MediQuo Pro (Espanha), o PEP onde a videochamada acontece hoje.
 * Depois da consulta, o médico anexa o parecer em PDF, que o RH baixa no ID.
 * A nota clínica fica no prontuário; ao RH vão apenas o parecer e um texto administrativo padronizado.
 */

import { delegate, esc, icon } from '../core/dom.js';
import { createLogger } from '../core/logger.js';
import {
  addDays, fmtDate, fmtSlot, plural,
} from '../core/format.js';
import {
  STATUS, TODAY, atualizarCaso, getColaborador, getFlag, getFocusCase, listarCasos, registrarParecer, setFlag,
} from '../core/store.js';
import { lookupCid } from '../data/cid.js';
import { APPS_CONSULTA, DESFECHOS } from '../data/rules.js';
import { PdfError, lerArquivoPdf } from '../pdf/extract.js';
import { abrirAtestado } from '../ui/pdf-viewer.js';
import { gerarParecerDoCaso } from '../ui/parecer.js';
import { goProHome, proShell } from './pro-shell.js';

const log = createLogger('pro.consulta');

/**
 * @typedef {Object} AnexoParecer
 * @property {string} nome
 * @property {Uint8Array} bytes
 * @property {'upload'|'gerado'} origem
 */

/** Estado local do formulário de parecer (por caso). */
const form = {
  casoId: '', tipo: 'acompanhamento', nota: '', /** @type {AnexoParecer|null} */ anexo: null, erro: '',
};

const AGENDADOS = new Set(['agendado', 'em_consulta']);

/** Endereço do MediQuo Pro (Espanha), o PEP onde a videochamada acontece. */
const PEP_HOST = 'web.mediquo.com/chat';

/** Horários de exibição para agendamentos da semente, que não têm horário salvo. */
const HORAS_SEMENTE = Object.freeze(['09:00', '10:30', '16:30']);

/**
 * @typedef {Object} ItemAgenda
 * @property {import('../core/store.js').Caso} caso
 * @property {string} slot 'AAAA-MM-DDTHH:mm'.
 */

/**
 * Chave da flag de sessão que marca o atendimento aberto no PEP.
 * @param {string} casoId
 * @returns {string}
 */
const flagPep = (casoId) => `pep:${casoId}`;

/**
 * Agendamentos de absenteísmo do médico, em ordem de horário.
 * O caso em foco sempre entra quando tem horário confirmado.
 * @param {import('../core/store.js').Caso} foco
 * @returns {ItemAgenda[]}
 */
const montarAgenda = (foco) => {
  let semHorario = 0;
  return listarCasos()
    .filter((c) => (c.id === foco.id && Boolean(c.agendamento?.slot)) || AGENDADOS.has(c.status))
    .map((c) => {
      if (c.agendamento?.slot) return { caso: c, slot: c.agendamento.slot };
      const hora = HORAS_SEMENTE[semHorario % HORAS_SEMENTE.length];
      semHorario += 1;
      return { caso: c, slot: `${TODAY}T${hora}` };
    })
    .sort((a, b) => a.slot.localeCompare(b.slot));
};

/**
 * Lista de agendamentos no MediQuo Pro (Rota 2).
 * @param {import('../core/store.js').Caso} foco
 * @returns {string}
 */
const painelAgenda = (foco) => {
  const itens = montarAgenda(foco);
  const linhas = itens.map(({ caso, slot }) => {
    const col = getColaborador(caso.colaboradorId);
    const [data, hora] = slot.split('T');
    const [, mes, dia] = data.split('-');
    return `
      <li class="${caso.id === foco.id ? 'cur' : ''}">
        <span class="d"><b>${esc(hora)}</b><br>${esc(`${dia}/${mes}`)}</span>
        <span>${esc(col?.nome ?? '')}<br><small class="pro-label">Avaliação de afastamento · <span style="white-space:nowrap">${esc(caso.id)}</span></small></span>
        <span class="badge ${STATUS[caso.status].tone}">${esc(STATUS[caso.status].label)}</span>
      </li>`;
  }).join('');
  return `
    <div class="pro-card">
      <div class="pro-card-head"><div><h3 class="pro-card-title">Agendamentos</h3><p class="pro-card-sub">Consultas de absenteísmo marcadas pelo WhatsApp</p></div><span class="badge neutral">${icon('calendar', 'ic-sm')} ${itens.length}</span></div>
      <div class="pro-card-body">${linhas ? `<ul class="pro-history">${linhas}</ul>` : '<p class="pro-empty">Nenhuma consulta agendada.</p>'}</div>
    </div>`;
};

/**
 * Pedido para atender pelo MediQuo Pro (Espanha). A videochamada não acontece neste painel.
 * @param {import('../core/store.js').Caso} caso
 * @param {import('../core/store.js').AppConsulta} app
 * @returns {string}
 */
const painelAtendimentoPep = (caso, app) => {
  const col = getColaborador(caso.colaboradorId);
  const ladoPaciente = app === 'mediquo_saude'
    ? 'O colaborador entra pelo botão "Iniciar consulta" do app MediQuo Saúde, depois do push de lembrete.'
    : 'O colaborador recebe a chamada no chat do app de telessaúde da empresa (white label, sem push e sem botão de consulta).';
  const quando = caso.agendamento?.slot ? fmtSlot(caso.agendamento.slot) : 'horário a definir';
  const aberto = getFlag(flagPep(caso.id));
  let badge = `<span class="badge ${STATUS[caso.status].tone}">${esc(STATUS[caso.status].label)}</span>`;
  if (aberto) badge = '<span class="badge ok">Atendimento aberto</span>';
  else if (caso.status === 'em_consulta') badge = '<span class="badge primary">Paciente aguardando</span>';
  const acao = aberto
    ? `<div class="pro-mini"><span>Atendimento aberto no MediQuo Pro (Espanha)</span><b>Ao terminar a videochamada, anexe o parecer ao lado.</b></div>
       <button type="button" class="pro-btn outline" data-action="atender-pep">${icon('video', 'ic-sm')} Abrir o MediQuo Pro (Espanha) de novo</button>`
    : `<button type="button" class="pro-btn" data-action="atender-pep">${icon('video', 'ic-sm')} Atender pelo MediQuo Pro (Espanha)</button>`;
  return `
    <div class="pro-card">
      <div class="pro-card-head"><div><h3 class="pro-card-title">Atender pelo MediQuo Pro (Espanha)</h3><p class="pro-card-sub">${esc(quando)}</p></div>${badge}</div>
      <div class="pro-card-body pro-stack">
        <div class="pro-callout">${icon('messageCircle')}<span>A videochamada acontece no MediQuo Pro (Espanha), no chat de <b>${esc(col?.nome ?? 'paciente')}</b>, como nos atendimentos de hoje. Este painel não abre vídeo.</span></div>
        <div class="pro-mini"><span>Onde atender</span><b>${esc(PEP_HOST)}</b><span>Abra o chat do paciente e inicie a videochamada no horário marcado.</span></div>
        <div class="pro-mini"><span>Lado do colaborador · ${esc(APPS_CONSULTA[app])}</span><span>${esc(ladoPaciente)}</span></div>
        ${acao}
      </div>
    </div>`;
};

/**
 * Arquivo do parecer anexado (ou ações para anexar).
 * @returns {string}
 */
const blocoAnexo = () => {
  if (form.anexo) {
    return `
      <div class="pro-pdf-thumb"><span class="doc">PDF</span><div class="meta"><b>${esc(form.anexo.nome)}</b>${(form.anexo.bytes.byteLength / 1024).toFixed(1)} KB · ${form.anexo.origem === 'gerado' ? 'parecer padrão gerado' : 'enviado do seu computador'}</div><button type="button" class="pro-btn outline sm" data-action="remover-anexo">${icon('x', 'ic-sm')} Remover</button></div>`;
  }
  return `
    <div class="pro-split">
      <label class="pro-btn outline" for="parecerInput">${icon('paperclip', 'ic-sm')} Anexar PDF</label>
      <input id="parecerInput" type="file" accept="application/pdf,.pdf" hidden>
      <button type="button" class="pro-btn outline" data-action="gerar-parecer">${icon('sparkles', 'ic-sm')} Gerar parecer padrão</button>
    </div>`;
};

/**
 * Formulário de desfecho e parecer.
 * @param {import('../core/store.js').Caso} caso
 * @returns {string}
 */
const painelParecer = (caso) => {
  if (caso.parecer && caso.desfecho) {
    return `
      <div class="pro-card">
        <div class="pro-card-head"><div><h3 class="pro-card-title">Parecer enviado ao RH</h3><p class="pro-card-sub">${esc(fmtDate(caso.parecer.anexadoEm))}</p></div><span class="badge ${STATUS[caso.status].tone}">${esc(STATUS[caso.status].label)}</span></div>
        <div class="pro-card-body pro-stack">
          <div class="pro-pdf-thumb"><span class="doc">PDF</span><div class="meta"><b>${esc(caso.parecer.arquivoNome)}</b>Disponível para download no ID</div></div>
          <div class="pro-mini"><span>Recomendação ao RH</span><b>${esc(DESFECHOS[caso.desfecho.tipo]?.label ?? '')}</b><span>${esc(caso.desfecho.recomendacaoRH)}</span></div>
          <button type="button" class="pro-btn" data-action="next">Ver painel do RH no ID ${icon('chevronRight', 'ic-sm')}</button>
        </div>
      </div>`;
  }
  const tipos = ['acompanhamento', 'manter', 'encaminhar_mt'];
  const desc = {
    manter: 'Condição clínica compatível com o período do atestado.',
    acompanhamento: 'Nova conversa ou especialidade antes de concluir.',
    encaminhar_mt: 'Questão de aptidão, homologação ou retorno ocupacional.',
  };
  if (!tipos.includes(form.tipo)) [form.tipo] = tipos;
  return `
    <div class="pro-card">
      <div class="pro-card-head"><div><h3 class="pro-card-title">Desfecho e parecer</h3><p class="pro-card-sub">O parecer vai para o RH no ID; a nota clínica fica no prontuário</p></div></div>
      <form class="pro-card-body pro-stack" data-form="parecer" novalidate>
        <div class="pro-radio">${tipos.map((t) => `<label><input type="radio" name="tipo" value="${t}" data-field="tipo" ${form.tipo === t ? 'checked' : ''}><span><b>${esc(DESFECHOS[t].label)}</b><small>${esc(desc[t])}</small></span></label>`).join('')}</div>
        <div><label class="pro-label" for="nota">Nota clínica (prontuário, não vai ao RH)</label><textarea id="nota" class="pro-textarea" data-field="nota" maxlength="2000" placeholder="Evolução, sintomas atuais, capacidade funcional, sinais de alerta, conduta…">${esc(form.nota)}</textarea></div>
        <div class="pro-stack" style="gap:.5rem">
          <p class="pro-label">Parecer para o RH (PDF)</p>
          ${blocoAnexo()}
          <div class="pro-callout warn">${icon('lock')}<span>O RH baixa este arquivo no ID. Não inclua diagnóstico, CID ou detalhes clínicos.</span></div>
          ${form.erro ? `<p class="pro-err" role="alert">${esc(form.erro)}</p>` : ''}
        </div>
        <div class="pro-mini"><span>Recomendação que acompanha o parecer</span><b>${esc(DESFECHOS[form.tipo].label)}</b><span>${esc(DESFECHOS[form.tipo].rh)}</span></div>
        <button type="submit" class="pro-btn">${icon('send', 'ic-sm')} Enviar parecer ao RH</button>
      </form>
    </div>`;
};

/**
 * Resumo do paciente.
 * @param {import('../core/store.js').Caso} caso
 * @returns {string}
 */
const painelPaciente = (caso) => {
  const col = getColaborador(caso.colaboradorId);
  const cid = caso.cid ? lookupCid(caso.cid) : null;
  return `
    <div class="pro-card">
      <div class="pro-card-head"><div><h3 class="pro-card-title">${esc(col?.nome ?? '')}</h3><p class="pro-card-sub">${esc(col?.cargo ?? '')} · ${esc(caso.id)}</p></div><button type="button" class="pro-btn outline sm" data-action="ver-pdf">${icon('fileText', 'ic-sm')} Atestado</button></div>
      <div class="pro-card-body"><dl class="pro-kv">
        <dt>CID-10</dt><dd>${esc(cid ? `${cid.code} · ${cid.desc}` : 'Não informado')}</dd>
        <dt>Afastamento</dt><dd>${esc(plural(caso.dias, 'dia', 'dias'))} · até ${esc(fmtDate(addDays(caso.dataInicio, caso.dias - 1)))}</dd>
        <dt>Reincidência</dt><dd>${esc(plural(caso.triagem.reincidencia, 'atestado', 'atestados'))} em 90 dias</dd>
        <dt>Triagem</dt><dd>${esc(caso.triagem.motivos.join(' · ') || 'Fora dos critérios automáticos')}</dd>
      </dl></div>
    </div>`;
};

/**
 * App da consulta: o do agendamento ou, sem agendamento, o da rota.
 * @param {import('../core/store.js').Caso} caso
 * @param {import('../journey/navigator.js').ScreenCtx} ctx
 * @returns {import('../core/store.js').AppConsulta}
 */
const appDaConsulta = (caso, ctx) => caso.agendamento?.app ?? (ctx.params.app === 'mediquo_saude' ? 'mediquo_saude' : 'white_label');

/**
 * @param {import('../journey/navigator.js').ScreenCtx} ctx
 * @returns {string}
 */
const render = (ctx) => {
  const caso = getFocusCase();
  if (form.casoId !== caso.id) Object.assign(form, { casoId: caso.id, anexo: null, erro: '' });
  const pendente = !AGENDADOS.has(caso.status) && !caso.desfecho;
  const aviso = pendente ? `
    <div class="pro-callout warn">${icon('alert')}<span>Este caso ainda não tem consulta confirmada (${esc(STATUS[caso.status].label.toLowerCase())}). Volte às etapas anteriores da jornada ou atenda mesmo assim para seguir a simulação.</span>
      <button type="button" class="pro-btn outline sm" data-action="forcar" style="margin-left:auto">Atender mesmo assim</button></div>` : '';
  return proShell({
    title: 'Consulta de acompanhamento',
    subtitle: 'Absenteísmo · atendimento pelo MediQuo Pro (Espanha) e parecer ao RH',
    actions: `<button type="button" class="pro-btn outline" data-action="voltar">${icon('arrowLeft', 'ic-sm')} Painel</button>`,
    content: `${aviso}<div class="pro-case"><div class="pro-stack">${painelAgenda(caso)}${painelAtendimentoPep(caso, appDaConsulta(caso, ctx))}${painelPaciente(caso)}</div><div class="pro-stack">${painelParecer(caso)}</div></div>`,
  });
};

/**
 * @param {HTMLElement} root
 * @param {import('../journey/navigator.js').ScreenCtx} ctx
 * @returns {function(): void}
 */
const bind = (root, ctx) => {
  /** Re-render pelo store (mantém o fluxo de assinatura único). */
  const refresh = () => atualizarCaso(getFocusCase().id, {});

  /** Gera o parecer padrão com o desfecho escolhido. */
  const gerar = () => {
    const caso = getFocusCase();
    try {
      form.anexo = { nome: `parecer_${caso.id.toLowerCase()}.pdf`, bytes: gerarParecerDoCaso(caso, form.tipo), origem: 'gerado' };
      form.erro = '';
    } catch (err) {
      log.error('Falha ao gerar parecer', { caso: caso.id, message: err.message });
      form.erro = 'Não foi possível gerar o parecer. Anexe um PDF ou recarregue a página.';
    }
  };

  const offClick = delegate(root, 'click', {
    'ver-pdf': () => abrirAtestado(getFocusCase()),
    voltar: () => goProHome(ctx),
    'pro-home': () => goProHome(ctx),
    next: () => ctx.next(),
    'atender-pep': () => {
      const caso = getFocusCase();
      const key = flagPep(caso.id);
      if (!getFlag(key)) {
        // Atualiza o caso antes da flag: os dois disparam re-render e a flag fecha o fluxo.
        atualizarCaso(caso.id, caso.status === 'agendado' ? { status: 'em_consulta' } : {}, { actor: 'medico', text: 'Atendimento aberto no MediQuo Pro (Espanha)' });
        setFlag(key, true);
        log.info('Atendimento aberto no PEP', { caso: caso.id });
      }
      ctx.toast(`Simulação: no produto real, abre o chat do paciente em ${PEP_HOST}.`);
    },
    forcar: () => {
      const caso = getFocusCase();
      const slot = caso.agendamento?.slot ?? `${TODAY}T15:30`;
      atualizarCaso(caso.id, {
        status: 'em_consulta',
        agendamento: {
          canal: 'whatsapp', app: appDaConsulta(caso, ctx), slotsSugeridos: caso.agendamento?.slotsSugeridos ?? [slot], slot,
        },
      }, { actor: 'sistema', text: 'Consulta iniciada (simulação)' });
    },
    'gerar-parecer': () => { gerar(); refresh(); },
    'remover-anexo': () => { form.anexo = null; refresh(); },
  });
  const onChange = async (event) => {
    const el = /** @type {HTMLInputElement} */ (event.target);
    if (el.id === 'parecerInput' && el.files?.[0]) {
      const file = el.files[0];
      try {
        const bytes = await lerArquivoPdf(file);
        form.anexo = { nome: file.name.slice(0, 120), bytes, origem: 'upload' };
        form.erro = '';
      } catch (err) {
        log.warn('Parecer recusado', { code: err.code ?? 'UNKNOWN' });
        form.erro = err instanceof PdfError ? err.message.replace('o atestado', 'o parecer') : 'Não foi possível ler o arquivo.';
      }
      refresh();
      return;
    }
    if (el.dataset.field === 'tipo') {
      form.tipo = el.value;
      // O parecer padrão reflete o desfecho; regenera se ele já tinha sido gerado.
      if (form.anexo?.origem === 'gerado') gerar();
      refresh();
    }
  };
  const onInput = (event) => {
    const el = /** @type {HTMLTextAreaElement} */ (event.target);
    if (el.dataset.field === 'nota') form.nota = el.value;
  };
  const onSubmit = (event) => {
    if (!/** @type {HTMLElement} */ (event.target).matches('[data-form="parecer"]')) return;
    event.preventDefault();
    const caso = getFocusCase();
    if (!form.anexo) {
      form.erro = 'Anexe o parecer em PDF ou gere o parecer padrão.';
      refresh();
      return;
    }
    const result = registrarParecer(caso.id, {
      tipo: form.tipo, arquivoNome: form.anexo.nome, bytes: form.anexo.bytes, origem: form.anexo.origem,
    });
    if (!result.ok) {
      form.erro = result.error;
      refresh();
      return;
    }
    log.info('Parecer enviado', { tipo: form.tipo, notaChars: form.nota.length });
    ctx.toast('Parecer enviado. O RH já pode baixar no ID.', 'success');
    Object.assign(form, {
      tipo: 'acompanhamento', nota: '', anexo: null, erro: '',
    });
  };
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  root.addEventListener('submit', onSubmit);
  return () => {
    offClick();
    root.removeEventListener('change', onChange);
    root.removeEventListener('input', onInput);
    root.removeEventListener('submit', onSubmit);
  };
};

/** @type {import('../journey/navigator.js').Screen} */
export const proConsultaScreen = {
  frame: 'desktop',
  url: () => `pro.mediquo.com.br/admin/absenteismo/${getFocusCase().id.toLowerCase()}/consulta`,
  render,
  bind,
};
