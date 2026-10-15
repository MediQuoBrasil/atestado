/**
 * @file Definição das rotas (versões) da jornada e suas etapas.
 * Cada etapa aponta para uma tela e parâmetros; a navegação é livre entre etapas.
 */

/** @typedef {'rh'|'medico'|'colaborador'|'sistema'} Ator */

/**
 * @typedef {Object} Etapa
 * @property {string} id       Identificador único dentro da rota.
 * @property {string} screen   Chave da tela registrada no navegador.
 * @property {Object<string, string>} [params]
 * @property {Ator} actor
 * @property {string} produto  Produto/canal exibido na trilha.
 * @property {string} label    Rótulo curto da etapa.
 * @property {string} titulo   Título da nota da etapa.
 * @property {string} nota     O que acontece e o que testar.
 */

/**
 * @typedef {Object} Rota
 * @property {string} id
 * @property {string} chave    Rótulo curto ("Rota 1").
 * @property {string} nome
 * @property {1|2|3|4|5} esforco Escala de esforço de desenvolvimento.
 * @property {string} prazo    Estimativa grosseira.
 * @property {string} resumo
 * @property {string[]} construir   O que precisa ser desenvolvido.
 * @property {string[]} reaproveita O que já existe.
 * @property {string[]} riscos
 * @property {Etapa[]} etapas
 */

/** Etapa de envio, comum a todas as rotas. */
const ENVIO = Object.freeze({
  id: 'envio',
  screen: 'id-upload',
  actor: 'rh',
  produto: 'ID',
  label: 'RH envia atestado e celular',
  titulo: 'RH anexa o atestado e o celular do colaborador no ID',
  nota: 'Arraste um PDF ou gere um atestado de exemplo. O PDF.js lê o texto do arquivo e o parser preenche colaborador, CID, dias e datas. O RH confirma o celular com WhatsApp do colaborador, que vem da base. O CID fica oculto para o RH.',
});

/**
 * @param {Partial<Etapa> & {id: string}} over
 * @returns {Etapa}
 */
const painelPro = (over) => ({
  screen: 'pro-dashboard',
  actor: 'medico',
  produto: 'MediQuo Pro',
  label: 'Médico e gestão veem o painel',
  titulo: 'Painel de absenteísmo no MediQuo Pro',
  nota: 'O atestado e o contato chegam para o médico e para a gestão. O caso enviado aparece no topo da lista, com o WhatsApp informado pelo RH. Teste os filtros por paciente, CNPJ, CID, quantidade de atestados e reincidência. Clique no PDF para abrir o atestado original.',
  ...over,
});

/** @type {ReadonlyArray<Rota>} */
export const ROTAS = Object.freeze([
  {
    id: 'registro',
    chave: 'Rota 0',
    nome: 'Registro e triagem',
    esforco: 1,
    prazo: '2–3 semanas',
    resumo: 'Centraliza atestados e dá ao médico visão de recorrência. Sem consulta: o médico valida o documento e sinaliza casos para atenção.',
    construir: ['Menu Absenteísmo no ID com upload', 'Extração de campos do PDF', 'Menu Absenteísmo no Pro (lista e filtros)', 'Validação documental e status para o RH'],
    reaproveita: ['Login e permissões do ID e do Pro', 'Componentes de upload do ID (Materiais Radar+)'],
    riscos: ['Não reduz afastamentos por si só', 'Valor percebido pelo RH limitado à organização'],
    etapas: [
      ENVIO,
      painelPro({ id: 'painel' }),
      {
        id: 'revisao', screen: 'pro-caso', params: { modo: 'registro' }, actor: 'medico', produto: 'MediQuo Pro',
        label: 'Médico valida o documento', titulo: 'Revisão documental do atestado',
        nota: 'O médico confere CRM, datas e coerência do período, e marca o documento como validado ou pede reenvio.',
      },
      {
        id: 'status', screen: 'id-casos', params: { modo: 'status' }, actor: 'rh', produto: 'ID',
        label: 'RH acompanha o status', titulo: 'Status do caso no ID',
        nota: 'O RH vê apenas status e datas. Diagnóstico e detalhes clínicos não aparecem.',
      },
    ],
  },
  {
    id: 'whatsapp',
    chave: 'Rota 1',
    nome: 'WhatsApp + app white label',
    esforco: 2,
    prazo: '4–6 semanas',
    resumo: 'A equipe Telessaúde marca a consulta pelo WhatsApp. O colaborador atende a videochamada no app de telessaúde da empresa (white label, sem push e sem botão), o médico atende pelo MediQuo Pro (Espanha) e anexa o parecer, que o RH baixa no ID junto com o painel de custo e dias.',
    construir: ['Tudo da Rota 0, com o celular do colaborador no envio', 'Convite pelo WhatsApp Telessaúde e registro do horário no Pro', 'Agenda de absenteísmo no Pro com atalho para o MediQuo Pro (Espanha)', 'Anexo do parecer em PDF no Pro', 'Painel no ID: custo e dias de atestado por período e download do parecer'],
    reaproveita: ['Número de WhatsApp Telessaúde', 'Videochamada pelo chat do MediQuo Pro (Espanha) e dos apps de telessaúde', 'Agenda de profissionais do Pro'],
    riscos: ['Contato pelo WhatsApp manual no início (escala da equipe)', 'Sem lembrete no app, mais risco de o colaborador não atender', 'Custo depende do custo mensal cadastrado no ID'],
    etapas: [
      ENVIO,
      painelPro({ id: 'painel' }),
      {
        id: 'convite', screen: 'pro-caso', params: { modo: 'white_label' }, actor: 'medico', produto: 'MediQuo Pro',
        label: 'Equipe convida pelo WhatsApp', titulo: 'Convite pelo WhatsApp Telessaúde',
        nota: 'Escolha os horários da agenda e envie a mensagem do número Telessaúde para o celular informado pelo RH. Neste app white label não há push nem botão de consulta.',
      },
      {
        id: 'whatsapp', screen: 'whatsapp', actor: 'colaborador', produto: 'WhatsApp Telessaúde',
        label: 'Colaborador marca no WhatsApp', titulo: 'Horário combinado pelo WhatsApp',
        nota: 'Toque em um dos horários como se fosse o colaborador. A confirmação entra na agenda do Pro e o status muda no ID.',
      },
      {
        id: 'chamada', screen: 'app-whitelabel', actor: 'colaborador', produto: 'App de telessaúde',
        label: 'Colaborador atende a chamada', titulo: 'Videochamada no app white label',
        nota: 'Sem push e sem botão "Iniciar consulta". No horário, o médico liga pelo MediQuo Pro (Espanha) e a chamada chega no chat do app. Toque em atender e depois em encerrar.',
      },
      {
        id: 'parecer', screen: 'pro-consulta', params: { app: 'white_label' }, actor: 'medico', produto: 'MediQuo Pro',
        label: 'Médico anexa o parecer', titulo: 'Atendimento pelo MediQuo Pro (Espanha) e parecer',
        nota: 'A consulta está na agenda do Pro e o atendimento acontece no MediQuo Pro (Espanha). Depois, escolha o desfecho e anexe o parecer em PDF (ou gere o padrão). A nota clínica fica no prontuário.',
      },
      {
        id: 'painel-rh', screen: 'id-painel', actor: 'rh', produto: 'ID',
        label: 'RH vê painel e baixa parecer', titulo: 'Painel de custo, dias e pareceres no ID',
        nota: 'Troque o período para ver dias de atestado e custo estimado por colaborador. Baixe o parecer do caso em PDF. Sem CID nem dado clínico.',
      },
    ],
  },
  {
    id: 'app',
    chave: 'Rota 2',
    nome: 'WhatsApp + MediQuo Saúde',
    esforco: 3,
    prazo: '6–9 semanas',
    resumo: 'O mesmo agendamento pelo WhatsApp Telessaúde. No app MediQuo Saúde, a consulta aparece na agenda, o push lembra no horário e o botão "Iniciar consulta" leva à videochamada. O médico atende pelo MediQuo Pro (Espanha) e anexa o parecer.',
    construir: ['Tudo da Rota 1', 'Consulta marcada pelo WhatsApp aparecendo no app MediQuo Saúde', 'Push de lembrete, complementar ao WhatsApp', 'Botão "Iniciar consulta" no horário'],
    reaproveita: ['Tela Agendamento do app MediQuo Saúde', 'Videoconsulta existente do app', 'Agenda de profissionais do Pro'],
    riscos: ['Só vale para o app MediQuo Saúde (white labels seguem a Rota 1)', 'Permissão de push negada (o lembrete segue pelo WhatsApp)', 'Fila de agenda em picos de atestados'],
    etapas: [
      ENVIO,
      painelPro({ id: 'painel' }),
      {
        id: 'convite', screen: 'pro-caso', params: { modo: 'mediquo_saude' }, actor: 'medico', produto: 'MediQuo Pro',
        label: 'Equipe convida pelo WhatsApp', titulo: 'Convite pelo WhatsApp Telessaúde',
        nota: 'Escolha os horários da agenda e envie a mensagem do número Telessaúde para o celular informado pelo RH. O app MediQuo Saúde complementa com push e botão de consulta.',
      },
      {
        id: 'whatsapp', screen: 'whatsapp', actor: 'colaborador', produto: 'WhatsApp Telessaúde',
        label: 'Colaborador marca no WhatsApp', titulo: 'Horário combinado pelo WhatsApp',
        nota: 'Toque em um dos horários como se fosse o colaborador. A confirmação entra na agenda do Pro, aparece no app MediQuo Saúde e muda o status no ID.',
      },
      {
        id: 'push', screen: 'app-push', actor: 'colaborador', produto: 'App MediQuo Saúde',
        label: 'Colaborador recebe o push', titulo: 'Push de lembrete na tela bloqueada',
        nota: 'O push complementa o WhatsApp: lembra a consulta no horário. Toque na notificação para abrir o app.',
      },
      {
        id: 'iniciar', screen: 'app-consulta', actor: 'colaborador', produto: 'App MediQuo Saúde',
        label: 'Colaborador inicia consulta', titulo: 'Botão "Iniciar consulta" no app MediQuo Saúde',
        nota: 'A consulta marcada pelo WhatsApp aparece na tela Agendamento. No horário, toque em "Iniciar consulta".',
      },
      {
        id: 'parecer', screen: 'pro-consulta', params: { app: 'mediquo_saude' }, actor: 'medico', produto: 'MediQuo Pro',
        label: 'Atende pelo Pro (Espanha) e anexa parecer', titulo: 'Atendimento pelo MediQuo Pro (Espanha) e parecer',
        nota: 'A consulta aparece na lista de agendamentos do MediQuo Pro e a videochamada acontece no MediQuo Pro (Espanha), no chat do paciente. Depois, escolha o desfecho e anexe o parecer em PDF (ou gere o padrão).',
      },
      {
        id: 'painel-rh', screen: 'id-painel', actor: 'rh', produto: 'ID',
        label: 'RH vê painel e baixa parecer', titulo: 'Painel de custo, dias e pareceres no ID',
        nota: 'Troque o período para ver dias de atestado e custo estimado por colaborador. Baixe o parecer do caso em PDF. Sem CID nem dado clínico.',
      },
    ],
  },
]);

/**
 * @param {string} id
 * @returns {Rota}
 */
export const getRota = (id) => ROTAS.find((r) => r.id === id) ?? ROTAS[1];
