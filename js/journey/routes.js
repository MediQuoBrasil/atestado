/**
 * @file Definição das rotas (versões) da jornada e suas etapas.
 * Cada etapa aponta para uma tela e parâmetros; a navegação é livre entre etapas.
 */

/** @typedef {'rh'|'medico'|'secretario'|'colaborador'|'sistema'} Ator */

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
  label: 'Médico e secretário recebem o caso',
  titulo: 'Painel de absenteísmo no MediQuo Pro',
  nota: 'O atestado e o contato chegam para o médico e para o secretário. O caso enviado aparece no topo da lista, com o WhatsApp informado pelo RH. Teste os filtros por paciente, CNPJ, CID, quantidade de atestados e reincidência. Clique no PDF para abrir o atestado original.',
  ...over,
});

/**
 * Conversa do secretário com o colaborador pelo WhatsApp (Rotas 1 e 2).
 * @param {string} complemento Como a consulta acontece no app da rota.
 * @returns {Etapa}
 */
const contatoWhatsapp = (complemento) => ({
  id: 'whatsapp',
  screen: 'whatsapp',
  actor: 'secretario',
  produto: 'WhatsApp Telessaúde',
  label: 'Secretário chama no WhatsApp',
  titulo: 'Secretário combina a consulta pelo WhatsApp',
  nota: `Você está no WhatsApp do secretário. Envie a primeira mensagem para o celular informado pelo RH; a conversa é direta e o colaborador responde com o dia e horário que prefere. ${complemento}`,
});

/**
 * Registro do horário combinado no MediQuo Pro (Rotas 1 e 2).
 * @param {import('../core/store.js').AppConsulta} modo
 * @returns {Etapa}
 */
const registroHorario = (modo) => ({
  id: 'registro',
  screen: 'pro-caso',
  params: { modo },
  actor: 'secretario',
  produto: 'MediQuo Pro',
  label: 'Secretário registra o horário',
  titulo: 'Horário combinado registrado no MediQuo Pro',
  nota: 'Informe a data e o horário que o colaborador escolheu. A consulta entra na agenda do médico, a confirmação sai no WhatsApp e o status muda no ID.',
});

/** Etapa final, comum às Rotas 1 e 2. */
const PAINEL_RH = Object.freeze({
  id: 'painel-rh',
  screen: 'id-painel',
  actor: 'rh',
  produto: 'ID',
  label: 'RH baixa o parecer médico',
  titulo: 'Parecer médico para download no ID',
  nota: 'Baixe o parecer médico do caso em PDF. Troque o período para ver dias de atestado e custo estimado por colaborador. Sem CID nem dado clínico.',
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
    resumo: 'O RH envia o atestado e o contato no ID; o caso chega no MediQuo Pro para o médico e para o secretário. O secretário marca a consulta em conversa direta pelo WhatsApp e registra o horário no Pro. No horário, o colaborador procura o médico no chat do app de telessaúde da empresa (white label) e inicia a videochamada; o médico atende pelo MediQuo Pro (Espanha) e emite o parecer, que o RH baixa no ID.',
    construir: ['Tudo da Rota 0, com o celular do colaborador no envio', 'Perfil de secretário no Pro, com acesso ao contato e à agenda (sem dado clínico)', 'Registro do horário combinado no Pro, com confirmação pelo WhatsApp', 'Anexo do parecer médico em PDF no Pro', 'Painel no ID: download do parecer e custo e dias de atestado por período'],
    reaproveita: ['Número de WhatsApp Telessaúde', 'Chat com videochamada do app de telessaúde e do MediQuo Pro (Espanha)', 'Agenda de profissionais do Pro'],
    riscos: ['Agendamento manual pelo secretário (gargalo com volume alto)', 'Sem lembrete no app, mais risco de o colaborador não procurar o médico no horário', 'Custo depende do custo mensal cadastrado no ID'],
    etapas: [
      ENVIO,
      painelPro({ id: 'painel' }),
      contatoWhatsapp('Depois, registre o horário no MediQuo Pro.'),
      registroHorario('white_label'),
      {
        id: 'chamada', screen: 'app-whitelabel', actor: 'colaborador', produto: 'App de telessaúde',
        label: 'Colaborador procura o médico', titulo: 'Colaborador procura o médico no chat do app',
        nota: 'Sem push e sem botão "Iniciar consulta". No horário, toque na conversa com a médica e depois na câmera para iniciar a videochamada. Encerre para seguir.',
      },
      {
        id: 'parecer', screen: 'pro-consulta', params: { app: 'white_label' }, actor: 'medico', produto: 'MediQuo Pro',
        label: 'Médico atende e emite o parecer', titulo: 'Atendimento pelo MediQuo Pro (Espanha) e parecer médico',
        nota: 'A consulta está na agenda do Pro e o paciente chama pelo chat; o atendimento acontece no MediQuo Pro (Espanha). Depois, escolha o desfecho e anexe o parecer médico em PDF (ou gere o padrão). A nota clínica fica no prontuário.',
      },
      PAINEL_RH,
    ],
  },
  {
    id: 'app',
    chave: 'Rota 2',
    nome: 'WhatsApp + MediQuo Saúde',
    esforco: 3,
    prazo: '6–9 semanas',
    resumo: 'O mesmo agendamento pelo secretário no WhatsApp, registrado no MediQuo Pro. No app MediQuo Saúde, a consulta aparece na agenda, o push lembra no horário e o colaborador inicia pelo botão "Iniciar consulta". O médico atende pelo MediQuo Pro (Espanha) e emite o parecer, que o RH baixa no ID.',
    construir: ['Tudo da Rota 1', 'Consulta registrada pelo secretário aparecendo no app MediQuo Saúde', 'Push de lembrete, complementar ao WhatsApp', 'Botão "Iniciar consulta" no horário'],
    reaproveita: ['Tela Agendamento do app MediQuo Saúde', 'Videoconsulta existente do app', 'Agenda de profissionais do Pro'],
    riscos: ['Só vale para o app MediQuo Saúde (white labels seguem a Rota 1)', 'Permissão de push negada (o lembrete segue pelo WhatsApp)', 'Agendamento manual pelo secretário em picos de atestados'],
    etapas: [
      ENVIO,
      painelPro({ id: 'painel' }),
      contatoWhatsapp('Depois, registre o horário no MediQuo Pro. O app MediQuo Saúde complementa com push e botão de consulta.'),
      registroHorario('mediquo_saude'),
      {
        id: 'push', screen: 'app-push', actor: 'colaborador', produto: 'App MediQuo Saúde',
        label: 'Colaborador recebe o push', titulo: 'Push de lembrete na tela bloqueada',
        nota: 'O push complementa o WhatsApp: lembra a consulta no horário. Toque na notificação para abrir o app.',
      },
      {
        id: 'iniciar', screen: 'app-consulta', actor: 'colaborador', produto: 'App MediQuo Saúde',
        label: 'Colaborador inicia consulta', titulo: 'Botão "Iniciar consulta" no app MediQuo Saúde',
        nota: 'A consulta registrada pelo secretário aparece na tela Agendamento. No horário, toque em "Iniciar consulta".',
      },
      {
        id: 'parecer', screen: 'pro-consulta', params: { app: 'mediquo_saude' }, actor: 'medico', produto: 'MediQuo Pro',
        label: 'Médico atende e emite o parecer', titulo: 'Atendimento pelo MediQuo Pro (Espanha) e parecer médico',
        nota: 'A consulta aparece na lista de agendamentos do MediQuo Pro e a videochamada acontece no MediQuo Pro (Espanha), no chat do paciente. Depois, escolha o desfecho e anexe o parecer médico em PDF (ou gere o padrão).',
      },
      PAINEL_RH,
    ],
  },
]);

/**
 * @param {string} id
 * @returns {Rota}
 */
export const getRota = (id) => ROTAS.find((r) => r.id === id) ?? ROTAS[1];
