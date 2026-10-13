/**
 * @file Dados fictícios do protótipo. Nenhum nome, CPF ou CNPJ corresponde a pessoa ou empresa real.
 * CPFs e CNPJs têm dígitos verificadores válidos apenas para exercitar as validações.
 */

/**
 * @typedef {Object} Empresa
 * @property {string} id
 * @property {string} razao Razão social.
 * @property {string} cnpj  14 dígitos.
 */

/**
 * @typedef {Object} Colaborador
 * @property {string} id
 * @property {string} nome
 * @property {string} cpf       11 dígitos.
 * @property {string} empresaId
 * @property {string} cargo
 * @property {string} telefone  Formato exibível.
 */

/** @type {ReadonlyArray<Empresa>} */
export const EMPRESAS = Object.freeze([
  { id: 'emp-1', razao: 'Vértice Logística S.A.', cnpj: '12345678000195' },
  { id: 'emp-2', razao: 'Nuvem Azul Tecnologia Ltda.', cnpj: '45871236000131' },
  { id: 'emp-3', razao: 'Granja Bom Sabor Alimentos Ltda.', cnpj: '30219877000139' },
  { id: 'emp-4', razao: 'Atlântica Varejo e Serviços Ltda.', cnpj: '77104523000102' },
]);

/** @type {ReadonlyArray<Colaborador>} */
export const COLABORADORES = Object.freeze([
  { id: 'col-01', nome: 'Mariana Teixeira Duarte', cpf: '52998224725', empresaId: 'emp-1', cargo: 'Analista de expedição', telefone: '(11) 9****-4471' },
  { id: 'col-02', nome: 'Rafael Monteiro Lins', cpf: '15350946056', empresaId: 'emp-1', cargo: 'Operador de empilhadeira', telefone: '(11) 9****-2208' },
  { id: 'col-03', nome: 'Juliana Prado Assunção', cpf: '28471639050', empresaId: 'emp-1', cargo: 'Coordenadora de frota', telefone: '(11) 9****-9013' },
  { id: 'col-04', nome: 'Diego Albuquerque Rocha', cpf: '39053344705', empresaId: 'emp-1', cargo: 'Motorista', telefone: '(11) 9****-6620' },
  { id: 'col-05', nome: 'Camila Fontes Viana', cpf: '61720495858', empresaId: 'emp-2', cargo: 'Desenvolvedora', telefone: '(21) 9****-1187' },
  { id: 'col-06', nome: 'Thiago Barreto Nunes', cpf: '74218503680', empresaId: 'emp-2', cargo: 'Analista de suporte', telefone: '(21) 9****-3354' },
  { id: 'col-07', nome: 'Larissa Moura Campos', cpf: '80536127921', empresaId: 'emp-2', cargo: 'Product designer', telefone: '(21) 9****-7742' },
  { id: 'col-08', nome: 'Bruno Cardoso Lemos', cpf: '93648201506', empresaId: 'emp-2', cargo: 'Customer success', telefone: '(21) 9****-0569' },
  { id: 'col-09', nome: 'Patrícia Gomes Ribeiro', cpf: '11827364599', empresaId: 'emp-3', cargo: 'Auxiliar de produção', telefone: '(19) 9****-8820' },
  { id: 'col-10', nome: 'Eduardo Siqueira Paes', cpf: '24739058197', empresaId: 'emp-3', cargo: 'Supervisor de linha', telefone: '(19) 9****-1406' },
  { id: 'col-11', nome: 'Aline Rezende Castro', cpf: '36581270903', empresaId: 'emp-3', cargo: 'Técnica de qualidade', telefone: '(19) 9****-5578' },
  { id: 'col-12', nome: 'Vinícius Araújo Pinto', cpf: '47392516809', empresaId: 'emp-3', cargo: 'Auxiliar de produção', telefone: '(19) 9****-2931' },
  { id: 'col-13', nome: 'Fernanda Lopes Brandão', cpf: '58163042753', empresaId: 'emp-4', cargo: 'Gerente de loja', telefone: '(31) 9****-6047' },
  { id: 'col-14', nome: 'Gustavo Henrique Melo', cpf: '69284715300', empresaId: 'emp-4', cargo: 'Operador de caixa', telefone: '(31) 9****-3915' },
  { id: 'col-15', nome: 'Renata Queiroz Farias', cpf: '70451839684', empresaId: 'emp-4', cargo: 'Repositora', telefone: '(31) 9****-7260' },
  { id: 'col-16', nome: 'Lucas Ventura Dias', cpf: '81629347078', empresaId: 'emp-4', cargo: 'Estoquista', telefone: '(31) 9****-4182' },
]);

/**
 * Médicos emissores fictícios dos atestados externos.
 * @type {ReadonlyArray<{nome: string, crm: string, local: string}>}
 */
export const MEDICOS_EMISSORES = Object.freeze([
  { nome: 'Dra. Helena Vasconcelos', crm: 'CRM-SP 123456', local: 'Clínica Santa Aurora · São Paulo/SP' },
  { nome: 'Dr. Marcos Antunes Leal', crm: 'CRM-RJ 548721', local: 'Pronto Atendimento Bela Vista · Rio de Janeiro/RJ' },
  { nome: 'Dra. Simone Carvalhaes', crm: 'CRM-MG 87412', local: 'Hospital Monte Claro · Belo Horizonte/MG' },
  { nome: 'Dr. Otávio Pimenta', crm: 'CRM-SP 301874', local: 'UPA Jardim das Flores · Campinas/SP' },
]);

/**
 * Linhas-semente: [colaboradorId, CID, dias, dataInicio, status, índiceMédico].
 * @type {ReadonlyArray<[string, string, number, string, string, number]>}
 */
export const SEED_ROWS = Object.freeze([
  ['col-01', 'J11', 3, '2026-06-08', 'concluido', 0],
  ['col-01', 'R51', 1, '2026-07-21', 'registrado', 0],
  ['col-01', 'G43.9', 2, '2026-09-02', 'concluido', 0],
  ['col-01', 'F41.1', 5, '2026-10-06', 'em_acompanhamento', 3],
  ['col-02', 'M54.5', 7, '2026-06-15', 'concluido', 3],
  ['col-02', 'M54.5', 10, '2026-08-11', 'encaminhado', 3],
  ['col-02', 'M54.5', 5, '2026-10-01', 'contato_pendente', 3],
  ['col-03', 'A09', 2, '2026-07-03', 'registrado', 0],
  ['col-04', 'S93.4', 15, '2026-08-25', 'em_acompanhamento', 0],
  ['col-05', 'F32.1', 14, '2026-07-14', 'concluido', 1],
  ['col-05', 'F32.1', 21, '2026-09-08', 'em_acompanhamento', 1],
  ['col-06', 'J06.9', 2, '2026-06-22', 'registrado', 1],
  ['col-06', 'J06.9', 1, '2026-08-04', 'registrado', 1],
  ['col-06', 'K29.7', 3, '2026-09-15', 'concluido', 1],
  ['col-06', 'J01.9', 2, '2026-10-08', 'agendado', 1],
  ['col-07', 'H10.9', 3, '2026-08-18', 'concluido', 1],
  ['col-08', 'F43.2', 10, '2026-09-29', 'agendado', 1],
  ['col-09', 'M75.1', 12, '2026-07-07', 'encaminhado', 3],
  ['col-09', 'M79.1', 4, '2026-09-21', 'em_analise', 3],
  ['col-10', 'J11', 4, '2026-06-29', 'concluido', 3],
  ['col-11', 'O21.0', 7, '2026-09-10', 'em_acompanhamento', 3],
  ['col-11', 'O21.0', 5, '2026-10-05', 'contato_pendente', 3],
  ['col-12', 'A09', 1, '2026-07-28', 'registrado', 3],
  ['col-12', 'A09', 2, '2026-08-19', 'registrado', 3],
  ['col-12', 'N39.0', 3, '2026-09-24', 'concluido', 3],
  ['col-12', 'R51', 1, '2026-10-09', 'em_analise', 3],
  ['col-13', 'F41.1', 7, '2026-08-03', 'concluido', 2],
  ['col-14', 'J11', 3, '2026-07-16', 'concluido', 2],
  ['col-14', 'J06.9', 2, '2026-10-02', 'registrado', 2],
  ['col-15', 'M54.5', 5, '2026-09-01', 'concluido', 2],
  ['col-16', 'S93.4', 8, '2026-10-07', 'em_analise', 2],
  ['col-16', 'G43.9', 1, '2026-06-12', 'registrado', 2],
]);

/** Data de referência do protótipo ("hoje"). */
export const TODAY = '2026-10-13';
