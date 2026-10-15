/**
 * @file MediQuo Pro · Absenteísmo — painel do médico com indicadores, filtros e lista de atestados.
 */

import { delegate, esc, icon } from '../core/dom.js';
import {
  addDays, diffDays, fmtCnpj, fmtDate, fmtMonth, fmtTelefone, initials, normalize, plural,
} from '../core/format.js';
import {
  STATUS, TODAY, empresaDoCaso, getColaborador, getFocusCase, listarCasos, setFocusCase,
} from '../core/store.js';
import { EMPRESAS } from '../data/seed.js';
import { lookupCid } from '../data/cid.js';
import { CRITERIOS, contarReincidencia } from '../data/rules.js';
import { abrirAtestado } from '../ui/pdf-viewer.js';
import { proCaseStep, proShell } from './pro-shell.js';

/**
 * @typedef {Object} Filtros
 * @property {string} busca
 * @property {string} empresa   id ou ''.
 * @property {string} grupo     capítulo CID ou ''.
 * @property {string} minAtestados '' | '2' | '3' | '4'
 * @property {boolean} reincidentes
 * @property {string} status    chave de STATUS, 'abertos' ou ''.
 * @property {boolean} comConsulta
 * @property {string} de        ISO
 * @property {string} ate       ISO
 * @property {'recentes'|'dias'|'reincidencia'|'prioridade'} ordem
 */

/** @type {Filtros} */
const filtros = {
  busca: '', empresa: '', grupo: '', minAtestados: '', reincidentes: false, status: '', comConsulta: false, de: '2026-06-01', ate: '2026-10-31', ordem: 'recentes',
};

const CONSULTADOS = new Set(['em_acompanhamento', 'encaminhado', 'concluido', 'em_consulta']);
const PRIO_ORDER = Object.freeze({ alta: 0, media: 1, baixa: 2 });

/**
 * @typedef {Object} Linha
 * @property {import('../core/store.js').Caso} caso
 * @property {import('../data/seed.js').Colaborador} colab
 * @property {import('../data/seed.js').Empresa} emp
 * @property {import('../data/cid.js').CidInfo|null} cid
 * @property {number} totalAtestados
 * @property {number} consultas
 * @property {number} reinc90
 */

/**
 * Enriquecimento com contagens por colaborador (em memória, uma passada).
 * @returns {Linha[]}
 */
const montarLinhas = () => {
  const casos = listarCasos();
  /** @type {Map<string, {total: number, consultas: number}>} */
  const porColab = new Map();
  casos.forEach((c) => {
    const acc = porColab.get(c.colaboradorId) ?? { total: 0, consultas: 0 };
    acc.total += 1;
    if (CONSULTADOS.has(c.status)) acc.consultas += 1;
    porColab.set(c.colaboradorId, acc);
  });
  return casos.map((c) => ({
    caso: c,
    colab: getColaborador(c.colaboradorId),
    emp: empresaDoCaso(c),
    cid: c.cid ? lookupCid(c.cid) : null,
    totalAtestados: porColab.get(c.colaboradorId)?.total ?? 1,
    consultas: porColab.get(c.colaboradorId)?.consultas ?? 0,
    reinc90: contarReincidencia(casos, c.colaboradorId, TODAY),
  }));
};

/**
 * Aplica filtros e ordenação.
 * @param {Linha[]} linhas
 * @returns {Linha[]}
 */
const filtrar = (linhas) => {
  const q = normalize(filtros.busca.trim());
  const out = linhas.filter((l) => {
    if (q && !normalize(`${l.colab?.nome} ${l.caso.id} ${l.caso.cid}`).includes(q)) return false;
    if (filtros.empresa && l.emp?.id !== filtros.empresa) return false;
    if (filtros.grupo && (l.cid?.chapter ?? 'Não informado') !== filtros.grupo) return false;
    if (filtros.minAtestados && l.totalAtestados < Number(filtros.minAtestados)) return false;
    if (filtros.reincidentes && l.reinc90 < CRITERIOS.reincidenciaMinima) return false;
    if (filtros.comConsulta && !CONSULTADOS.has(l.caso.status)) return false;
    if (filtros.status === 'abertos' && ['concluido', 'registrado', 'validado'].includes(l.caso.status)) return false;
    if (filtros.status && filtros.status !== 'abertos' && l.caso.status !== filtros.status) return false;
    if (filtros.de && l.caso.dataInicio < filtros.de) return false;
    if (filtros.ate && l.caso.dataInicio > filtros.ate) return false;
    return true;
  });
  const sorters = {
    recentes: (a, b) => (b.caso.criadoEm + b.caso.id).localeCompare(a.caso.criadoEm + a.caso.id),
    dias: (a, b) => b.caso.dias - a.caso.dias,
    reincidencia: (a, b) => b.reinc90 - a.reinc90 || b.totalAtestados - a.totalAtestados,
    prioridade: (a, b) => PRIO_ORDER[a.caso.triagem.prioridade] - PRIO_ORDER[b.caso.triagem.prioridade] || b.caso.dias - a.caso.dias,
  };
  return out.sort(sorters[filtros.ordem] ?? sorters.recentes);
};

/**
 * Indicador de reincidência (barrinhas até 5).
 * @param {number} n
 * @returns {string}
 */
const recur = (n) => `<span class="recur ${n >= CRITERIOS.reincidenciaMinima ? 'hot' : ''}" title="${n} atestado(s) nos últimos ${CRITERIOS.janelaReincidenciaDias} dias">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}<b>${n}</b></span>`;

/**
 * Barras por grupo de CID.
 * @param {Linha[]} linhas
 * @returns {string}
 */
const chartGrupos = (linhas) => {
  /** @type {Map<string, number>} */
  const m = new Map();
  linhas.forEach((l) => { const k = l.cid?.chapter ?? 'Não informado'; m.set(k, (m.get(k) ?? 0) + 1); });
  const rows = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
  if (!rows.length) return '<p class="pro-empty">Sem dados para os filtros atuais.</p>';
  const max = Math.max(...rows.map((r) => r[1]));
  return `<div class="hbars">${rows.map(([k, v]) => `<div class="hbar" title="${esc(k)}: ${v} atestado(s)"><span class="lab">${esc(k)}</span><span class="track"><span class="fill" style="width:${(v / max) * 100}%"></span></span><span class="val">${v}</span></div>`).join('')}</div>`;
};

/**
 * Colunas por mês (dias de afastamento iniciados no mês).
 * @param {Linha[]} linhas
 * @returns {string}
 */
const chartMeses = (linhas) => {
  const meses = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  const vals = meses.map((ym) => linhas.filter((l) => l.caso.dataInicio.startsWith(ym)).reduce((acc, l) => acc + l.caso.dias, 0));
  const max = Math.max(1, ...vals);
  return `
    <div class="vbars" style="--n:${meses.length}">${meses.map((ym, i) => `<div class="vbar" title="${esc(fmtMonth(ym))}: ${vals[i]} dias"><span class="col" style="height:${Math.max(2, (vals[i] / max) * 100)}%"><span class="num">${vals[i]}</span></span></div>`).join('')}</div>
    <div class="vlabels" style="--n:${meses.length}">${meses.map((ym) => `<span>${esc(fmtMonth(ym))}</span>`).join('')}</div>`;
};

/**
 * Painel de absenteísmo do médico.
 * @returns {string}
 */
const render = () => {
  const focusId = getFocusCase().id;
  const todas = montarLinhas();
  const linhas = filtrar(todas);
  const ult30 = todas.filter((l) => diffDays(l.caso.dataInicio, TODAY) <= 30);
  const abertos = todas.filter((l) => !['concluido', 'registrado', 'validado'].includes(l.caso.status)).length;
  const consultas = todas.filter((l) => CONSULTADOS.has(l.caso.status)).length;
  const reincidentes = new Set(todas.filter((l) => l.reinc90 >= CRITERIOS.reincidenciaMinima).map((l) => l.caso.colaboradorId)).size;
  const grupos = [...new Set(todas.map((l) => l.cid?.chapter ?? 'Não informado'))].sort();
  const statusChips = [['', 'Todos'], ['abertos', 'Em aberto'], ['contato_pendente', STATUS.contato_pendente.label], ['agendado', STATUS.agendado.label], ['em_acompanhamento', STATUS.em_acompanhamento.label], ['encaminhado', 'Encaminhados'], ['concluido', 'Concluídos']];

  const kpis = `
    <div class="pro-kpis">
      <div class="pro-card pro-kpi"><p class="l">${icon('clipboard', 'ic-sm')} Casos em aberto</p><p class="v">${abertos}</p><p class="s">de ${todas.length} atestados recebidos</p></div>
      <div class="pro-card pro-kpi"><p class="l">${icon('calendar', 'ic-sm')} Atestados · 30 dias</p><p class="v">${ult30.length}</p><p class="s">${ult30.reduce((a, l) => a + l.caso.dias, 0)} dias de afastamento</p></div>
      <div class="pro-card pro-kpi"><p class="l">${icon('video', 'ic-sm')} Consultas do programa</p><p class="v">${consultas}</p><p class="s">realizadas pela MediQuo</p></div>
      <div class="pro-card pro-kpi"><p class="l">${icon('repeat', 'ic-sm')} Reincidentes</p><p class="v">${reincidentes}</p><p class="s">≥ ${CRITERIOS.reincidenciaMinima} atestados em ${CRITERIOS.janelaReincidenciaDias} dias</p></div>
    </div>`;

  const charts = `
    <div class="pro-charts">
      <div class="pro-card"><div class="pro-card-head"><div><h3 class="pro-card-title">Atestados por grupo de CID</h3><p class="pro-card-sub">Filtrados · ${linhas.length} atestados</p></div></div><div class="pro-card-body">${chartGrupos(linhas)}</div></div>
      <div class="pro-card"><div class="pro-card-head"><div><h3 class="pro-card-title">Dias de afastamento por mês</h3><p class="pro-card-sub">Pela data de início do atestado</p></div></div><div class="pro-card-body">${chartMeses(linhas)}</div></div>
    </div>`;

  const filtrosHtml = `
    <div class="pro-filters">
      <div class="pro-field"><label for="fBusca">Paciente</label><input id="fBusca" class="pro-input search" placeholder="Nome, caso ou CID" data-f="busca" value="${esc(filtros.busca)}" autocomplete="off"></div>
      <div class="pro-field"><label for="fEmp">CNPJ</label><select id="fEmp" class="pro-input" data-f="empresa"><option value="">Todos os CNPJs</option>${EMPRESAS.map((e) => `<option value="${esc(e.id)}" ${filtros.empresa === e.id ? 'selected' : ''}>${esc(fmtCnpj(e.cnpj))} · ${esc(e.razao.split(' ')[0])}</option>`).join('')}</select></div>
      <div class="pro-field"><label for="fGrupo">Grupo de CID</label><select id="fGrupo" class="pro-input" data-f="grupo"><option value="">Todos</option>${grupos.map((g) => `<option ${filtros.grupo === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></div>
      <div class="pro-field"><label for="fMin">Nº de atestados</label><select id="fMin" class="pro-input" data-f="minAtestados"><option value="">Qualquer</option>${['2', '3', '4'].map((n) => `<option value="${n}" ${filtros.minAtestados === n ? 'selected' : ''}>${n} ou mais</option>`).join('')}</select></div>
      <div class="pro-field"><label for="fDe">De</label><input id="fDe" type="date" class="pro-input" data-f="de" value="${esc(filtros.de)}"></div>
      <div class="pro-field"><label for="fAte">Até</label><input id="fAte" type="date" class="pro-input" data-f="ate" value="${esc(filtros.ate)}"></div>
      <div class="pro-field"><label for="fOrdem">Ordenar por</label><select id="fOrdem" class="pro-input" data-f="ordem">${[['recentes', 'Mais recentes'], ['prioridade', 'Prioridade'], ['dias', 'Mais dias'], ['reincidencia', 'Reincidência']].map(([v, l]) => `<option value="${v}" ${filtros.ordem === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    </div>
    <div class="pro-chips">
      ${statusChips.map(([v, l]) => `<button type="button" class="pro-chip ${filtros.status === v ? 'on' : ''}" data-action="chip-status" data-v="${esc(v)}">${esc(l)}</button>`).join('')}
      <button type="button" class="pro-chip ${filtros.reincidentes ? 'on' : ''}" data-action="chip-reinc">${icon('repeat', 'ic-sm')} Reincidentes</button>
      <button type="button" class="pro-chip ${filtros.comConsulta ? 'on' : ''}" data-action="chip-consulta">${icon('video', 'ic-sm')} Com consulta do programa</button>
      <button type="button" class="pro-chip" data-action="limpar">Limpar filtros</button>
    </div>`;

  const rows = linhas.map((l) => {
    const c = l.caso;
    const novo = c.id === focusId;
    return `
      <tr class="${novo ? 'focus' : ''}" data-action="abrir-caso" data-id="${esc(c.id)}" tabindex="0">
        <td><div class="who"><span class="pro-avatar primary">${esc(initials(l.colab?.nome))}</span><div><p class="n">${esc(l.colab?.nome ?? '')} ${novo ? '<span class="badge new">novo</span>' : ''}</p><span class="sub">${esc(l.colab?.cargo ?? '')} · ${esc(c.id)}</span><span class="sub">${icon('messageCircle', 'ic-xs')} ${esc(fmtTelefone(c.telefone))}</span></div></div></td>
        <td class="num">${esc(fmtCnpj(l.emp?.cnpj ?? ''))}<span class="sub">${esc(l.emp?.razao ?? '')}</span></td>
        <td><button type="button" class="pdf-chip" data-action="ver-pdf" data-id="${esc(c.id)}" title="Abrir atestado">${icon('fileText', 'ic-sm')} PDF</button></td>
        <td>${l.cid ? `<span class="cid">${esc(l.cid.code)}</span><span class="sub">${esc(l.cid.desc)}</span>` : '<span class="sub">Não informado</span>'}</td>
        <td class="num"><b>${esc(plural(c.dias, 'dia', 'dias'))}</b><span class="sub">${esc(fmtDate(c.dataInicio))} → ${esc(fmtDate(addDays(c.dataInicio, c.dias - 1)))}</span></td>
        <td class="num">${l.totalAtestados}<span class="sub">${esc(plural(l.consultas, 'consulta', 'consultas'))}</span></td>
        <td>${recur(l.reinc90)}</td>
        <td><span class="badge ${STATUS[c.status].tone}">${esc(STATUS[c.status].label)}</span></td>
      </tr>`;
  }).join('');

  const tabela = `
    <div class="pro-card">
      <div class="pro-table-wrap" data-scroll-key="pro-table">
        <table class="pro-table">
          <thead><tr><th>Paciente</th><th>CNPJ vinculado</th><th>Atestado</th><th>CID</th><th>Tempo de atestado</th><th>Atestados</th><th>Reincidência 90d</th><th>Status</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="8" class="pro-empty">Nenhum atestado para os filtros atuais.</td></tr>'}</tbody>
        </table>
      </div>
      <div class="pro-foot"><span>${linhas.length} de ${todas.length} atestados</span><span>Clique na linha para abrir o caso · no PDF para ver o atestado</span></div>
    </div>`;

  return proShell({
    title: 'Absenteísmo',
    subtitle: 'Atestados e contatos enviados pelo RH dos clientes, recorrência e acompanhamento clínico. Visível para a equipe médica e a gestão.',
    content: `${kpis}${charts}${filtrosHtml}${tabela}`,
  });
};

/**
 * @param {HTMLElement} root
 * @param {import('../journey/navigator.js').ScreenCtx} ctx
 * @returns {function(): void}
 */
const bind = (root, ctx) => {
  const rerender = () => {
    const main = root.querySelector('.pro-main');
    const top = main?.scrollTop ?? 0;
    const active = /** @type {HTMLElement|null} */ (document.activeElement);
    const activeId = active && root.contains(active) ? active.id : '';
    const caret = active instanceof HTMLInputElement && active.type === 'text' ? active.selectionStart : null;
    root.querySelector('.device-viewport').innerHTML = render();
    const nextMain = root.querySelector('.pro-main');
    if (nextMain) nextMain.scrollTop = top;
    if (activeId) {
      const el = /** @type {HTMLInputElement|null} */ (root.querySelector(`#${activeId}`));
      el?.focus();
      if (el && caret !== null) el.setSelectionRange(caret, caret);
    }
  };
  const abrir = (id) => {
    const step = proCaseStep(ctx);
    setFocusCase(id);
    if (step) ctx.goTo(step);
  };
  const offClick = delegate(root, 'click', {
    'chip-status': (el) => { filtros.status = el.dataset.v ?? ''; rerender(); },
    'chip-reinc': () => { filtros.reincidentes = !filtros.reincidentes; rerender(); },
    'chip-consulta': () => { filtros.comConsulta = !filtros.comConsulta; rerender(); },
    limpar: () => {
      Object.assign(filtros, { busca: '', empresa: '', grupo: '', minAtestados: '', reincidentes: false, status: '', comConsulta: false, de: '2026-06-01', ate: '2026-10-31' });
      rerender();
    },
    'ver-pdf': (el, event) => {
      event.stopPropagation();
      const caso = listarCasos().find((c) => c.id === el.dataset.id);
      if (caso) abrirAtestado(caso);
    },
    'abrir-caso': (el, event) => {
      if (/** @type {HTMLElement} */ (event.target).closest('[data-action="ver-pdf"]')) return;
      abrir(el.dataset.id);
    },
  });
  const onField = (event) => {
    const el = /** @type {HTMLInputElement} */ (event.target);
    const key = el.dataset.f;
    if (!key) return;
    filtros[key] = el.value;
    rerender();
  };
  const onKey = (event) => {
    const row = /** @type {HTMLElement} */ (event.target).closest?.('tr[data-id]');
    if (row && event.key === 'Enter') abrir(row.dataset.id);
  };
  root.addEventListener('input', onField);
  root.addEventListener('keydown', onKey);
  return () => {
    offClick();
    root.removeEventListener('input', onField);
    root.removeEventListener('keydown', onKey);
  };
};

/** @type {import('../journey/navigator.js').Screen} */
export const proDashboardScreen = {
  frame: 'desktop',
  url: () => 'pro.mediquo.com.br/admin/absenteismo',
  render,
  bind,
};
