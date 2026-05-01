// ********** PARTE 1 - Estado Global, Funções Utilitárias e Configurações
// --- ESTADO DA APLICAÇÃO ---
// --- ESTADO DE AUTENTICAÇÃO ---
let currentUser = null;
const APP_VERSION = 35;
const BACKUP_ALERT_THRESHOLD = 10; // Número de alterações para o alerta visual
const BACKUP_PROMPT_THRESHOLD = 100;  // Número de alterações para o pop-up
let mainContent, sidebar;
let alteracoesDesdeUltimoBackup = 0;
let todasAsMetas = [];
let sortConfigRendaVariavel = { 'FII': { key: 'ticker', direction: 'ascending' }, 'Ação': { key: 'ticker', direction: 'ascending' }, 'ETF': { key: 'ticker', direction: 'ascending' } };
let sortConfigModalProventos = { key: 'dataPagamento', direction: 'descending' };
let sortConfigPerformanceRV = { key: 'valorDeMercado', direction: 'descending' };
let userName = '';
let autoUpdateEnabled = false;
let autoUpdateIntervalId = null;
let dadosComparacao = null;
let configuracoesGraficos = { evolucao: { hidden: [] }, desempenho: { hidden: [] } };
let linksExternos = { acoes: '', fiis: '', etfs: '' };
let notaAtual = null, todasAsNotas = [], todosOsAtivos = [], posicaoInicial = [], todosOsAjustes = [], todosOsProventos = [], todasAsContas = [], todosOsFeriados = [], todosOsAjustesIR = [];
let todosOsAtivosRF = [], todosOsRendimentosRealizadosRF = [], todosOsRendimentosRFNaoRealizados = [];
let dadosMoedas = { cotacoes: {} };
let todosOsAtivosMoedas = [];
let todasAsMovimentacoes = [];
let todasAsTransacoesRecorrentes = [];
let dadosAlocacao = { categorias: {}, ativos: {} };
let dadosDeMercado = { timestamp: null, cotacoes: {} };
let dadosSimulacaoNegociar = { fiis: {}, acoes: {} };
let configuracoesFiscais = { 
    aliquotaAcoes: 0.15, 
    aliquotaFiisDt: 0.20, 
    limiteIsencaoAcoes: 20000,
    tabelaRegressivaIR: {
        180: 0.225,
        360: 0.200,
        720: 0.175,
        9999: 0.150
    }
};
let urlCotacoesCSV = '';
let telas = {}, modalCadastroAtivo, modalResumoNegociacao, modalEdicaoOperacao, modalPosicaoInicial, modalLancamentoProvento, modalCadastroConta, modalCadastroFeriado, modalNovaTransacao, modalEdicaoTransacaoProvento, modalCorrigirData, modalResumoDividendosAtivo, modalInformarValoresVenda, modalPerformanceDetalhes, modalProventosCalendario, modalProventosCalendarioAcoes, modalEventoCorporativo, modalBalanceamentoDetalhes, modalEventoAtivo, modalCorrigirProventosOrfaos, modalDetalhesIRMes, modalDashboardAlertas;
let graficoAlocacaoInstance = null;
let graficoProventosInstance = null;
let graficoCarteiraInstance = null;
let graficoDesempenhoInstance = null;
let graficoComparativoPrecoInstance = null;
let graficoBreakEvenInstance = null;
let graficoPrecoVsPmInstance = null;
let graficoPrecoVsPmModalInstance = null;
let modalGraficoCotacoes;
let graficoHistoricoCotacoesInstance = null;
let historicoCarteira = [];      
let modalCadastroAtivoRF, modalAporteRF, modalResgateRF;
let modalCadastroAtivoMoeda, modalNovaTransacaoMoeda; // Novos modais para Moedas
let modalCalendarioRecorrentes; // Adicione a nova variável aqui
let modalProjecaoFutura;
let modalDetalhesRendimento;
let planoDeAcaoAtual = { compras: [], vendas: [] };
let telaImportacaoNotas, telaImportacaoHistorico;
let containerListaPosicoes, containerAdicionarHistorico, containerTabelaHistorico;
let dropdownCorretorasCache = '';
let tipoVistaCalendarioAcoes = 'dataCom'; // Controla a visão do calendário de ações
let isAtivosEditMode = false;
let isProventosEditMode = false;
let sortConfigAtivos = { key: 'ticker', direction: 'ascending' };
let sortConfigProventos = { key: 'dataPagamento', direction: 'descending' };
let sortConfigTransacoes = { key: 'data', direction: 'descending' };
let estadoSelecaoVendas = {};
let resumoProventosChartInstance = null;
let graficoAportesInstance = null;
let tipoGraficoAportes = 'barras'; // Pode ser 'barras' ou 'linhas'
let timestampUltimoBackup = null;
let isNavigating = false; // Flag para controlar o listener durante a navegação
let graficoHistoricoAtivoInstance = null;
let calculatorTargetInput = null;
let calculatorDisplay;
let salarioMinimo = 1518.00; // Valor padrão para 2025, pode ser ajustado pelo usuário
let unsubcribeFirestoreListener = null; // Variável global para guardar a função de desligar o listener



document.addEventListener('DOMContentLoaded', async () => {
    mainContent = document.querySelector('.main-content');
    sidebar = document.querySelector('.sidebar');
    const dadosInjetados = await inicializarDadosDeDemonstracao();
    if (dadosInjetados) {
        window.location.reload();
        return; 
    }
  
    carregarContadorAlteracoes();
    verificarStatusBackup();
    renderizarInfoBackup();
    setupCalculator();
    // Gerenciador de Tooltips...
    const tooltipEl = document.getElementById('custom-tooltip');
    if (tooltipEl) {
        document.body.addEventListener('mouseover', (e) => {
            const target = e.target.closest('[data-tooltip]');
            if (target) {
                tooltipEl.innerHTML = target.dataset.tooltip.replace(/\n/g, '<br>');
                tooltipEl.style.display = 'block';
            }
        });
        document.body.addEventListener('mouseout', (e) => {
            const target = e.target.closest('[data-tooltip]');
            if (target) {
                tooltipEl.style.display = 'none';
            }
        });
        document.body.addEventListener('mousemove', (e) => {
            if (tooltipEl.style.display === 'block') {
                const tooltipWidth = tooltipEl.offsetWidth;
                const windowWidth = window.innerWidth;
                const margin = 15;
                let leftPos = e.pageX + margin;
                if ((leftPos + tooltipWidth + margin) > windowWidth) {
                    leftPos = e.pageX - tooltipWidth - margin;
                }
                tooltipEl.style.left = leftPos + 'px';
                tooltipEl.style.top = e.pageY + margin + 'px';
            }
        });
    }

    telas = {
        dashboard: document.getElementById('tela-dashboard'),
        rendaVariavel: document.getElementById('tela-renda-variavel'), // ADICIONADO
        listaNotas: document.getElementById('tela-lista-notas'),
        lancamentoNota: document.getElementById('tela-lancamento-nota'),
        cadastroAtivos: document.getElementById('tela-cadastro-ativos'),
        posicaoInicial: document.getElementById('tela-posicao-inicial'),
        posicaoInicialMassa: document.getElementById('tela-posicao-inicial-massa'),
        configuracoes: document.getElementById('tela-configuracoes'),
        ajustesTransferencia: document.getElementById('tela-ajustes-transferencia'),
        eventosCorporativos: document.getElementById('tela-eventos-corporativos'),
        eventosAtivos: document.getElementById('tela-eventos-ativos'),
        ajustePM: document.getElementById('tela-ajuste-pm'),
        proventos: document.getElementById('tela-proventos'),
        proventosMassa: document.getElementById('tela-proventos-massa'),
        calendarioGeral: document.getElementById('tela-calendario-geral'),
        cadastroContas: document.getElementById('tela-cadastro-contas'),
        feriados: document.getElementById('tela-feriados'),
        caixaGlobal: document.getElementById('tela-caixa-global'),
        calculadoraIR: document.getElementById('tela-calculadora-ir'),
        importacaoNotas: document.getElementById('tela-importacao-notas'),
        importacaoHistorico: document.getElementById('tela-importacao-historico'),
        posicoesZeradas: document.getElementById('tela-posicoes-zeradas'),
        historicoMovimentacao: document.getElementById('tela-historico-movimentacao'),
        consultaBalanceamento: document.getElementById('tela-consulta-balanceamento'),
        posicaoCorretora: document.getElementById('tela-posicao-corretora'),
        cadastroRF: document.getElementById('tela-cadastro-rf'),
        rendaFixa: document.getElementById('tela-renda-fixa'),
        calendarioAcoes: document.getElementById('tela-calendario-acoes'),
        negociar: document.getElementById('tela-negociar'),
        metas: document.getElementById('tela-metas'),
        historicoSnapshots: document.getElementById('tela-historico-snapshots'),
        performanceRV: document.getElementById('tela-performanceRV'),
        crescimentoPatrimonial: document.getElementById('tela-crescimento-patrimonial')
    };
    modalDashboardAlertas = document.getElementById('modal-dashboard-alertas');
    modalResumoNegociacao = document.getElementById('modal-resumo-negociacao');
    modalDetalhesIRMes = document.getElementById('modal-detalhes-ir-mes');
    modalDetalhesRendimento = document.getElementById('modal-detalhes-rendimento');
    modalCadastroAtivo = document.getElementById('modal-cadastro-ativo');
    modalEdicaoOperacao = document.getElementById('modal-edicao-operacao');
    modalPosicaoInicial = document.getElementById('modal-posicao-inicial');
    modalLancamentoProvento = document.getElementById('modal-lancamento-provento');
    modalCadastroConta = document.getElementById('modal-cadastro-conta');
    modalCadastroFeriado = document.getElementById('modal-cadastro-feriado');
    modalEdicaoTransacaoProvento = document.getElementById('modal-edicao-transacao-provento');
    modalCorrigirData = document.getElementById('modal-corrigir-data');
    modalResumoDividendosAtivo = document.getElementById('modal-resumo-dividendos-ativo');
    modalInformarValoresVenda = document.getElementById('modal-informar-valores-venda');
    modalPerformanceDetalhes = document.getElementById('modal-performance-detalhes');
    modalProventosCalendario = document.getElementById('modal-proventos-calendario');
    modalProventosAnuais = document.getElementById('modal-proventos-anuais');
    modalProventosCalendarioAcoes = document.getElementById('modal-proventos-calendario-acoes');
    modalEventoCorporativo = document.getElementById('modal-evento-corporativo');
    modalEventoAtivo = document.getElementById('modal-evento-ativo');
    modalCorrigirProventosOrfaos = document.getElementById('modal-corrigir-proventos-orfaos');
    modalCalendarioRecorrentes = document.getElementById('modal-calendario-recorrentes');
    modalBalanceamentoDetalhes = document.getElementById('modal-balanceamento-detalhes');
    modalCadastroAtivoRF = document.getElementById('modal-cadastro-ativo-rf');
    modalAporteRF = document.getElementById('modal-aporte-rf');
    modalResgateRF = document.getElementById('modal-resgate-rf');
    modalNovaTransacaoMoeda = document.getElementById('modal-nova-transacao-moeda');
    modalProjecaoFutura = document.getElementById('modal-projecao-futura');
    modalCadastroMeta = document.getElementById('modal-cadastro-meta');
    modalCorrigirContasSemMoeda = document.getElementById('modal-corrigir-contas-sem-moeda');
    containerListaPosicoes = document.getElementById('lista-de-posicoes-iniciais');
    containerAdicionarHistorico = document.getElementById('container-adicionar-historico');
    containerTabelaHistorico = document.getElementById('container-tabela-historico');
    
    setupUniversalTransactionModal();
    document.querySelector('.sidebar').addEventListener('click', (e) => {
        // Intercepta o clique no ícone de alerta ANTES de processar a navegação
        const alertIconClicado = e.target.closest('#dashboard-alert-icon-container');
        if (alertIconClicado) {
            e.preventDefault(); // Impede a navegação do link <a> pai
            abrirModalAlertasDashboard();
            return;
        }
        
        const linkClicado = e.target.closest('a');
        const menuPaiClicado = e.target.closest('.menu-parent');

        if (linkClicado && linkClicado.dataset.tela) {
            const telaId = linkClicado.dataset.tela;
            mostrarTela(telaId);
            const submenuPaiDoLink = linkClicado.closest('.submenu');
            document.querySelectorAll('.submenu').forEach(s => { if (s !== submenuPaiDoLink) s.style.display = 'none'; });

            // --- INÍCIO DA ALTERAÇÃO ---
            // Adiciona a chamada da função global no final de CADA case
            switch (telaId) {
                case 'dashboard': window.scrollTo(0, 0); renderizarDashboard(); break; // O dashboard já chama a função no final
                case 'rendaVariavel': renderizarTelaRendaVariavel(); atualizarIconeDeAlertasGlobal(); break;
                case 'rendaFixa': renderizarPosicaoRF(); atualizarIconeDeAlertasGlobal(); break;
                case 'caixaGlobal': renderizarTelaCaixaGlobal(); atualizarIconeDeAlertasGlobal(); break;
                case 'historicoSnapshots': renderizarTelaHistoricoSnapshots(); atualizarIconeDeAlertasGlobal(); break;
                case 'proventos':
                    isProventosEditMode = false;
                    document.getElementById('botoes-proventos-padrao').style.display = 'flex';
                    document.getElementById('botoes-proventos-edicao').style.display = 'none';
                    document.getElementById('provento-filtro-tipo').value = 'todos';
                    document.getElementById('provento-filtro-status').value = 'todos';
                    document.getElementById('provento-filtro-posicao').value = 'todos';
                    renderizarTabelaProventos();
                    atualizarIconeDeAlertasGlobal();
                    break;
                case 'calendarioGeral': popularFiltrosCorretora(); renderizarCalendarioGeral(); atualizarIconeDeAlertasGlobal(); break;
                case 'calendarioAcoes': renderizarCalendarioAcoes(); atualizarIconeDeAlertasGlobal(); break;
                case 'calculadoraIR': {
                    const anoAtual = new Date().getFullYear();
                    const anos = new Set();
                    todasAsNotas.forEach(n => { if(n.data) anos.add(n.data.substring(0, 4)); });
                    posicaoInicial.forEach(p => { if(p.data) anos.add(p.data.substring(0, 4)); });
                    anos.add(String(anoAtual));
                    const anoSelect = document.getElementById('ir-filtro-ano');
                    anoSelect.innerHTML = [...anos].sort((a,b) => b-a).map(ano => `<option value="${ano}" ${ano == anoAtual ? 'selected' : ''}>${ano}</option>`).join('');
                    if(anoSelect.value) {
                        renderizarCalculadoraIR();
                    }
                    atualizarStatusBotaoIR();
                    atualizarIconeDeAlertasGlobal();
                    break;
                }
                case 'listaNotas': renderizarListaNotas(); atualizarIconeDeAlertasGlobal(); break;
                case 'cadastroRF': renderizarTabelaAtivosRF(); atualizarIconeDeAlertasGlobal(); break;
                case 'cadastroContas': renderizarTabelaContas(); atualizarIconeDeAlertasGlobal(); break;
                case 'cadastroAtivos': isAtivosEditMode = false; document.getElementById('botoes-ativos-padrao').style.display = 'flex'; document.getElementById('botoes-ativos-edicao').style.display = 'none'; renderizarTabelaAtivos(); atualizarIconeDeAlertasGlobal(); break;
                case 'feriados': renderizarTabelaFeriados(); atualizarIconeDeAlertasGlobal(); break;
                case 'posicaoInicialMassa': renderizarTelaPosicaoMassa(); atualizarIconeDeAlertasGlobal(); break;
                case 'posicaoInicial': renderizarTabelaPosicaoInicial(); cancelarAdicaoHistorico(); atualizarIconeDeAlertasGlobal(); break;
                case 'posicoesZeradas': renderizarPosicoesZeradas(); atualizarIconeDeAlertasGlobal(); break;
                case 'consultaBalanceamento': renderizarTelaConsultaBalanceamento(); atualizarIconeDeAlertasGlobal(); break;
                case 'posicaoCorretora': renderizarTelaPosicaoPorCorretora(); atualizarIconeDeAlertasGlobal(); break;
                case 'historicoMovimentacao': renderizarTelaHistoricoMovimentacao(); atualizarIconeDeAlertasGlobal(); break;
                case 'negociar': renderizarTelaNegociar(); atualizarIconeDeAlertasGlobal(); break;
                case 'metas': renderizarTelaMetas(); atualizarIconeDeAlertasGlobal(); break;
                case 'ajustesTransferencia': {
                    const corretorasAtivas = getCorretorasAtivasParaNotas();
                    const corretorasHtml = corretorasAtivas.map(c => `<option value="${c}">${c}</option>`).join('');
                    document.getElementById('transferencia-corretora-origem').innerHTML = '<option value="">Selecione...</option>' + corretorasHtml;
                    document.getElementById('transferencia-corretora-destino').innerHTML = '<option value="">Selecione...</option>' + corretorasHtml;
                    document.getElementById('form-transferencia-custodia').reset();
                    document.getElementById('transferencia-id').value = '';
                    document.getElementById('transferencia-form-titulo').textContent = 'Registrar Nova Transferência de Custódia';
                    document.getElementById('transferencia-ativos-container').style.display = 'none';
                    renderizarTabelaTransferencias();
                    atualizarIconeDeAlertasGlobal();
                    break;
                }
                case 'eventosCorporativos': renderizarTabelaEventosCorporativos(); atualizarIconeDeAlertasGlobal(); break;
                case 'eventosAtivos': renderizarTelaEventosAtivos(); atualizarIconeDeAlertasGlobal(); break;
                case 'ajustePM': document.getElementById('container-ajuste-pm-lista').style.display = 'none'; document.getElementById('form-buscar-posicao-pm').reset(); atualizarIconeDeAlertasGlobal(); break;
                case 'configuracoes':
                    // --- LEITURA FORÇADA DIRETO DO STORAGE (Correção do Bug) ---
                    // Isso garante que o campo mostre o que está salvo, mesmo se a variável global falhar
                    
                    // 1. URL Cotações
                    let urlSalva = localStorage.getItem('carteira_url_cotacoes_csv_offline');
                    if (urlSalva) { 
                        try { urlSalva = JSON.parse(urlSalva); } catch(e){} // Remove aspas se houver
                        urlCotacoesCSV = urlSalva; // Atualiza global
                    }
                    document.getElementById('config-cotacoes-url').value = urlSalva || '';

                    // 2. Configurações Fiscais
                    let fiscalSalvo = localStorage.getItem('carteira_configuracoes_fiscais_offline');
                    let fiscalObj = { aliquotaAcoes: 0.15, aliquotaFiisDt: 0.20, limiteIsencaoAcoes: 20000, tabelaRegressivaIR: { 180: 0.225, 360: 0.20, 720: 0.175, 9999: 0.15 } };
                    if (fiscalSalvo) {
                        try { fiscalObj = { ...fiscalObj, ...JSON.parse(fiscalSalvo) }; configuracoesFiscais = fiscalObj; } catch(e){}
                    }
                    
                    document.getElementById('config-aliquota-swing').value = formatarDecimal(fiscalObj.aliquotaAcoes * 100);
                    document.getElementById('config-aliquota-daytrade').value = formatarDecimal(fiscalObj.aliquotaFiisDt * 100);
                    document.getElementById('config-limite-isencao').value = formatarMoeda(fiscalObj.limiteIsencaoAcoes).replace('R$ ', '');
                    
                    const tabIR = fiscalObj.tabelaRegressivaIR || {};
                    document.querySelector('.config-ir-fixa-faixa[data-faixa="180"]').value = formatarDecimal((tabIR[180] || 0.225) * 100);
                    document.querySelector('.config-ir-fixa-faixa[data-faixa="360"]').value = formatarDecimal((tabIR[360] || 0.20) * 100);
                    document.querySelector('.config-ir-fixa-faixa[data-faixa="720"]').value = formatarDecimal((tabIR[720] || 0.175) * 100);
                    document.querySelector('.config-ir-fixa-faixa[data-faixa="9999"]').value = formatarDecimal((tabIR[9999] || 0.15) * 100);

                    // 3. Links Externos
                    let linksSalvos = localStorage.getItem('carteira_links_externos_offline');
                    let linksObj = { acoes: '', fiis: '', etfs: '' };
                    if (linksSalvos) {
                         try { linksObj = { ...linksObj, ...JSON.parse(linksSalvos) }; linksExternos = linksObj; } catch(e){}
                    }
                    document.getElementById('config-link-acoes').value = linksObj.acoes || '';
                    document.getElementById('config-link-fiis').value = linksObj.fiis || '';
                    document.getElementById('config-link-etfs').value = linksObj.etfs || '';

                    // 4. Auto Update e Outros
                    const autoUpdateRaw = localStorage.getItem('carteira_auto_update_enabled_offline');
                    let autoUpdateVal = false;
                    try { autoUpdateVal = JSON.parse(autoUpdateRaw) === true; } catch(e) { autoUpdateVal = autoUpdateRaw === 'true'; }
                    document.getElementById('config-auto-update-toggle').checked = autoUpdateVal;
                    autoUpdateEnabled = autoUpdateVal;

                    document.getElementById('config-user-name').value = userName || '';
                    document.getElementById('config-salario-minimo').value = formatarDecimalParaInput(salarioMinimo);
                    document.getElementById('resultados-inconsistencias').innerHTML = '';
                    
                    atualizarIconeDeAlertasGlobal();
                    break;
                case 'crescimentoPatrimonial':
                    document.getElementById('container-resultado-crescimento').style.display = 'none';
                    atualizarIconeDeAlertasGlobal();
                    break;
                case 'performanceRV': renderizarTelaPerformanceRV(); atualizarIconeDeAlertasGlobal(); break;
            }
            // --- FIM DA ALTERAÇÃO ---
        } else if (menuPaiClicado) {
            const itemPai = menuPaiClicado.closest('.menu-item');
            if (itemPai) {
                const submenu = itemPai.querySelector('.submenu');
                if (submenu) {
                    const estaAberto = submenu.style.display === 'block';
                    document.querySelectorAll('.sidebar .submenu').forEach(s => { if (s !== submenu) s.style.display = 'none'; });
                    submenu.style.display = estaAberto ? 'none' : 'block';
                }
            }
        }
    });
    document.getElementById('modal-snapshot-detalhes-conteudo').addEventListener('click', (e) => {
        const linhaAtivoSnapshot = e.target.closest('.row-clickable');
        if (linhaAtivoSnapshot) {
            const ticker = linhaAtivoSnapshot.dataset.ticker;
            if (ticker) {
                abrirModalHistoricoAtivoSnapshot(ticker);
            }
        }
    });
    document.getElementById('btn-levar-plano-para-negociar').addEventListener('click', aplicarPlanoDeAcaoParaSimulacao);
    document.getElementById('input-arquivo-proventos').addEventListener('change', importarProventosCSV);
    document.getElementById('input-arquivo-cotacoes').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const csvText = event.target.result;
            processarArquivoCotacoes(csvText);
        };
        reader.onerror = (error) => {
            alert('Erro ao ler o arquivo.');
            console.error(error);
        };
        reader.readAsText(file);
        e.target.value = ''; // Limpa para permitir reimportar o mesmo arquivo
    });
    
    document.getElementById('restore-file-input').addEventListener('change', restaurarBackup);
    document.getElementById('input-arquivo-historico').addEventListener('change', processarArquivoHistorico);
    document.getElementById('input-cadastros-csv').addEventListener('change', (e) => importarCadastrosCSV(e));
    document.getElementById('card-investimentos').addEventListener('click', abrirModalInvestimentosDetalhes);
    document.getElementById('btn-imprimir-investimentos').addEventListener('click', () => {
        const body = document.body;
        const modal = document.getElementById('modal-investimentos-detalhes');
        body.classList.add('imprimindo-investimentos');
        modal.classList.add('imprimindo');
    
        window.print();
    
        // Usa setTimeout para garantir que a classe seja removida após a janela de impressão ser processada
        setTimeout(() => {
            body.classList.remove('imprimindo-investimentos');
            modal.classList.remove('imprimindo');
        }, 500);
    });
    document.getElementById('container-historico-snapshots').addEventListener('click', (e) => {
        const target = e.target.closest('.btn-detalhes-snapshot');
        if (target) {
            abrirModalDetalhesSnapshot(target.dataset.data);
        }
    });
    document.getElementById('card-contas').addEventListener('click', abrirModalDetalhesContas);
    document.getElementById('card-moedas').addEventListener('click', abrirModalDetalhesMoedas);
    document.getElementById('card-proventos').addEventListener('click', abrirModalDetalhesProventos);
    document.getElementById('btn-abrir-calendario-recorrentes-caixa').addEventListener('click', () => renderizarModalCalendarioRecorrentes());
    document.getElementById('btn-abrir-projecao-caixa').addEventListener('click', () => renderizarModalProjecaoFutura());    document.getElementById('btn-adicionar-conta-universal').addEventListener('click', () => abrirModalCadastroConta(null));
    document.getElementById('btn-nova-transacao-universal').addEventListener('click', () => abrirModalNovaTransacaoMoeda(null));
    document.getElementById('btn-backup-caixa').addEventListener('click', fazerBackup);
    document.getElementById('import-backup-comparacao-input').addEventListener('change', importarResumoCarteira);
    document.querySelectorAll('input[name="tipo-transacao-moeda"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const containerRecorrencia = document.getElementById('recorrencia-moeda-options');
            const containerTransferencia = document.getElementById('container-contas-transferencia-moeda');
            const containerRecorrente = document.getElementById('container-contas-recorrente-moeda');
            const labelValor = document.querySelector('label[for="transacao-moeda-valor-debito"]');
            
            if (e.target.value === 'recorrente') {
                containerRecorrencia.style.display = 'block';
                containerTransferencia.style.display = 'none';
                containerRecorrente.style.display = 'flex';
                document.getElementById('transacao-moeda-data').previousElementSibling.textContent = 'Data do Primeiro Lançamento';
                labelValor.textContent = 'Valor';
                popularDropdownAtivoRecorrente(); 
            } else {
                containerRecorrencia.style.display = 'none';
                containerTransferencia.style.display = 'flex';
                containerRecorrente.style.display = 'none';
                document.getElementById('transacao-moeda-data').previousElementSibling.textContent = 'Data';
                labelValor.textContent = 'Valor do Débito';
            }
        });
    });
    document.getElementById('config-auto-update-toggle').addEventListener('change', (e) => {
        autoUpdateEnabled = e.target.checked;
        salvarConfiguracaoAutoUpdate();
        if (autoUpdateEnabled) {
            iniciarAutoUpdate();
            alert('Atualização automática de cotações ATIVADA.');
        } else {
            pararAutoUpdate();
            alert('Atualização automática de cotações DESATIVADA.');
        }
    });
    document.getElementById('input-arquivo-cotacoes').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const csvText = event.target.result;
            processarArquivoCotacoes(csvText);
        };
        reader.onerror = (error) => {
            alert('Erro ao ler o arquivo.');
            console.error(error);
        };
        reader.readAsText(file);
        e.target.value = ''; // Limpa para permitir reimportar o mesmo arquivo
    });
    document.getElementById('import-backup-comparacao-input').addEventListener('change', importarResumoCarteira);
    document.getElementById('seletor-vista-calendario-acoes').addEventListener('click', (e) => {
        const target = e.target.closest('.subtitulo-calendario');
        if (target && target.dataset.vista) {
            tipoVistaCalendarioAcoes = target.dataset.vista;
            renderizarCalendarioAcoes();
        }
    });

    document.getElementById('recorrencia-moeda-frequencia').addEventListener('change', (e) => {
        const diaMesGroup = document.getElementById('recorrencia-moeda-dia-mes-group');
        const diaSemanaGroup = document.getElementById('recorrencia-moeda-dia-semana-group');
        if (e.target.value === 'mensal') { diaMesGroup.style.display = 'block'; diaSemanaGroup.style.display = 'none'; } 
        else { diaMesGroup.style.display = 'none'; diaSemanaGroup.style.display = 'block'; }
    });

    document.querySelectorAll('input[name="tipo-termino-moeda"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const ocorrenciasGroup = document.getElementById('termino-moeda-ocorrencias-valor-group');
            const dataGroup = document.getElementById('termino-moeda-data-valor-group');
            if (e.target.value === 'ocorrencias') { ocorrenciasGroup.style.display = 'block'; dataGroup.style.display = 'none'; } 
            else { ocorrenciasGroup.style.display = 'none'; dataGroup.style.display = 'block'; }
        });
    });

    document.body.addEventListener('click', (e) => {
        const target = e.target;
        if (target.closest('#backup-alert-footer')) {
            fazerBackup();
            return;
        }
        if (target.id === 'btn-iniciar-correcao-contas-sem-moeda') {
            abrirModalCorrecaoContasSemMoeda();
            return;
        }
        const btnAddProventoTicker = e.target.closest('.btn-adicionar-provento-ticker');
        if (btnAddProventoTicker) {
            const ticker = btnAddProventoTicker.dataset.ticker;
            const ativo = todosOsAtivos.find(a => a.ticker === ticker);
            const tipoAtivo = ativo ? ativo.tipo : 'FII';

            // CORREÇÃO: Verifica se o modal unificado está aberto
            const modalUnificadoAberto = document.getElementById('modal-proventos-calendario').style.display === 'block' && document.getElementById('seletor-vista-calendario-unificado');

            if (modalUnificadoAberto) {
                // Se veio do modal unificado, define um retorno específico
                retornoModalProvento = `unificado-${tipoAtivo === 'FII' ? 'fiis' : 'acoes'}`;
            } else {
                // Lógica antiga para outros locais do sistema
                retornoModalProvento = (tipoAtivo === 'FII') ? 'calendario-fiis' : 'calendario-acoes';
            }
            
            abrirModalLancamentoProvento(null, ticker);
            return;
        }
        const proventoContainer = target.closest('.provento-item-container');
        if (proventoContainer) {
            document.querySelectorAll('.provento-acoes').forEach(el => {
                if (el.parentElement !== proventoContainer) {
                    el.style.display = 'none';
                }
            });
            const acoesDiv = proventoContainer.querySelector('.provento-acoes');
            if (acoesDiv) {
                const isVisible = acoesDiv.style.display === 'flex';
                acoesDiv.style.display = isVisible ? 'none' : 'flex';
            }
            e.stopPropagation();
            return;
        }
        const acaoProventoBtn = target.closest('.provento-acoes .acao-btn');
        if (acaoProventoBtn) {
            const container = acaoProventoBtn.closest('.provento-item-container');
            const proventoId = parseFloat(container.dataset.proventoId);
            const provento = todosOsProventos.find(p => p.id === proventoId);
            if (provento) {
                const ativo = todosOsAtivos.find(a => a.ticker === provento.ticker);
                const tipoAtivo = ativo ? ativo.tipo : 'FII';
                if (acaoProventoBtn.classList.contains('edit')) {
                    retornoModalProvento = (tipoAtivo === 'FII') ? 'calendario-fiis' : 'calendario-acoes';
                    abrirModalLancamentoProvento(provento);
                } else if (acaoProventoBtn.classList.contains('delete')) {
                    deletarProvento(provento.id);
                }
            }
            return;
        }
        if (!target.closest('.provento-item-container')) {
            document.querySelectorAll('.provento-acoes').forEach(el => el.style.display = 'none');
        }
        const salvarParametroFiscalIndividualmente = (e) => {
            const input = e.target;
            const valor = parseDecimal(input.value);
            if (input.id.startsWith('config-')) {
                switch (input.id) {
                    case 'config-aliquota-swing': configuracoesFiscais.aliquotaAcoes = valor / 100; break;
                    case 'config-aliquota-daytrade': configuracoesFiscais.aliquotaFiisDt = valor / 100; break;
                    case 'config-limite-isencao': configuracoesFiscais.limiteIsencaoAcoes = valor; break;
                }
            } else if (input.classList.contains('config-ir-fixa-faixa')) {
                const faixa = input.dataset.faixa;
                if (faixa && configuracoesFiscais.tabelaRegressivaIR.hasOwnProperty(faixa)) {
                    configuracoesFiscais.tabelaRegressivaIR[faixa] = valor / 100;
                }
            }
            salvarConfiguracoesFiscais();
        };
        document.querySelectorAll('#config-aliquota-swing, #config-aliquota-daytrade, #config-limite-isencao, .config-ir-fixa-faixa').forEach(input => {
            input.addEventListener('change', salvarParametroFiscalIndividualmente);
        });
        const navLink = target.closest('a[data-tela]');
        if (navLink && !navLink.closest('.sidebar')) {
            const telaId = navLink.dataset.tela;
            mostrarTela(telaId);
            if (telaId === 'consultaBalanceamento') {
                renderizarTelaConsultaBalanceamento();
            }
            e.preventDefault();
            return;
        }
        const tickerReb = target.closest('.ticker-rebalanceamento');
        if (tickerReb) {
            abrirModalDetalhesAtivo(tickerReb.dataset.ticker);
            return;
        }
        const cnpjClicavel = target.closest('.cnpj-clicavel');
        if (cnpjClicavel && cnpjClicavel.dataset.cnpj) {
            abrirModalAtivosPorCNPJ(cnpjClicavel.dataset.cnpj);
            return;
        }
        const acaoBtn = target.closest('button, i[id], i.acao-btn');
        if (acaoBtn) {
            const id = acaoBtn.id;
            const data = acaoBtn.dataset;
            const classList = acaoBtn.classList;
            if (id) {
                switch(id) {
                    case 'btn-cadastrar-novo-ativo': abrirModalCadastroAtivo(null); break;
                    case 'btn-novo-lancamento': iniciarNovaNota(); break;
                    case 'btn-criar-nota-simulacao': criarNotaAPartirDaSimulacao(); break;
                    case 'btn-nova-conta': abrirModalCadastroConta(null); break;
                    case 'btn-novo-feriado': abrirModalFeriado(null); break;
                    case 'btn-novo-provento': abrirModalLancamentoProvento(null); break;
                    case 'btn-adicionar-posicao-massa': mostrarTela('posicaoInicialMassa'); renderizarTelaPosicaoMassa(); break;
                    case 'btn-add-historico-ativo': iniciarAdicaoHistorico(); break;
                    case 'btn-novo-evento-corporativo': abrirModalEventoCorporativo(null); break;
                    case 'btn-novo-evento-ativo': abrirModalEventoAtivo(null); break;
                    case 'btn-buscar-ativos-nao-cadastrados': buscarEcadastrarAtivosAusentes(); break;
                    case 'btn-salvar-correcao-proventos': salvarCorrecaoProventosOrfaos(e); break;
                    case 'btn-salvar-nota': {
                        const btnSalvar = acaoBtn; // O botão que foi clicado
                        const originalText = btnSalvar.innerHTML;
                        btnSalvar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aguarde...';
                        btnSalvar.disabled = true;

                        notaAtual.corretora = document.getElementById('nota-corretora').value;
                        notaAtual.numero = document.getElementById('nota-numero').value;
                        notaAtual.data = document.getElementById('nota-data').value;
                        notaAtual.custos = parseDecimal(document.getElementById('nota-custos').value);
                        notaAtual.irrf = parseDecimal(document.getElementById('nota-irrf').value);

                        if (!notaAtual.corretora || !notaAtual.numero || !notaAtual.data) {
                            alert('Corretora, Número e Data da Nota são obrigatórios.');
                            btnSalvar.innerHTML = originalText;
                            btnSalvar.disabled = false;
                            return; // Retorna para sair do case
                        }
                        if (notaAtual.operacoes.length === 0) {
                            alert('Adicione pelo menos uma operação à nota.');
                            btnSalvar.innerHTML = originalText;
                            btnSalvar.disabled = false;
                            return; // Retorna para sair do case
                        }

                        if (!notaAtual.id) {
                            notaAtual.id = Date.now();
                            todasAsNotas.push(notaAtual);
                        } else {
                            const index = todasAsNotas.findIndex(n => n.id === notaAtual.id);
                            if (index > -1) todasAsNotas[index] = notaAtual;
                        }

                        sincronizarNotaComTransacao(notaAtual.id);

                        const dadosParaSalvar = {
                            notas: todasAsNotas,
                            movimentacoes: todasAsMovimentacoes
                        };

                        salvarDadosNaFonte(dadosParaSalvar).then(() => {
                            alert('Nota salva com sucesso!');
                            sincronizarTodosOsRegistros(null, true);
                            mostrarTela('listaNotas');
                            renderizarListaNotas();
                        }).catch(error => {
                            console.error("Erro ao salvar a nota:", error);
                            alert("Ocorreu um erro ao salvar a nota. Verifique o console para mais detalhes.");
                        }).finally(() => {
                            // Este bloco garante que o botão seja restaurado, não importa o que aconteça.
                            btnSalvar.innerHTML = originalText;
                            btnSalvar.disabled = false;
                        });
                        break; // Mantém o break do switch case
                    }
                    case 'btn-cancelar-nota': notaAtual = null; mostrarTela('listaNotas'); renderizarListaNotas(); break;
                    case 'btn-sync-needed-alert': sincronizarTodosOsRegistros(renderizarDashboard); break;
                    case 'btn-salvar-snapshot-carteira': salvarSnapshotCarteira(); registrarAlteracao(); break;
                    case 'btn-baixar-cotacoes-link': if(urlCotacoesCSV) window.open(urlCotacoesCSV, '_blank'); else alert('Nenhuma URL de cotações configurada.'); break;
                    case 'btn-restaurar': document.getElementById('restore-file-input').click(); break;
                    case 'btn-exportar-cadastros': exportarCadastrosCSV(); break;
                    case 'btn-importar-cadastros': document.getElementById('input-cadastros-csv').click(); break;
                    case 'btn-importar-notas-csv': document.getElementById('input-arquivo-notas').click(); break;
                    case 'btn-importar-historico-csv': document.getElementById('input-arquivo-historico').click(); break;
                    case 'btn-sincronizar-registros': sincronizarTodosOsRegistros(); break;
                    case 'btn-verificar-inconsistencias': verificarInconsistencias(); break;
                    case 'btn-apagar-tudo': apagarTodosOsDados(); break;
                    case 'btn-corrigir-vendas-historicas': abrirModalValoresVenda(); break;
                    case 'btn-corrigir-proventos-orfaos': {
                        const proventosOrfaos = todosOsProventos.filter(p => !p.quantidadeNaDataCom || p.quantidadeNaDataCom <= 0);
                        if(proventosOrfaos.length > 0) abrirModalCorrecaoProventosOrfaos(proventosOrfaos); else alert('Nenhum provento órfão encontrado.');
                        break;
                    }
                    case 'btn-importar-resumo-painel':
                        if (confirm('Isto irá substituir os dados de comparação atuais por um novo backup. Deseja continuar?')) {
                            document.getElementById('import-backup-comparacao-input').click();
                        }
                        break;
                    case 'btn-atualizar-cotacoes-api': atualizarCotacoesComAPI(); break;
                    case 'btn-testar-salvar-url-cotacoes': 
                        urlCotacoesCSV = document.getElementById('config-cotacoes-url').value.trim();
                        salvarUrlCotacoes();
                        atualizarCotacoesComAPI();
                        break;
                    case 'btn-imprimir-proventos': {
                        const proventosFiltrados = obterProventosFiltrados();
                        if (proventosFiltrados.length === 0) {
                            alert("Não há proventos para imprimir com os filtros selecionados.");
                            break;
                        }

                        const sortedProventos = [...proventosFiltrados].sort((a, b) => {
                            const key = sortConfigProventos.key;
                            const direction = sortConfigProventos.direction === 'ascending' ? 1 : -1;
                            const valA = key.includes('data') ? new Date(a[key]) : (a[key] || '');
                            const valB = key.includes('data') ? new Date(b[key]) : (b[key] || '');
                            if (valA < valB) return -1 * direction;
                            if (valA > valB) return 1 * direction;
                            return 0;
                        });

                        const agora = new Date();
                        const dataFormatada = agora.toLocaleDateString('pt-BR');
                        const horaFormatada = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                        document.getElementById('impressao-timestamp').textContent = `Gerado em ${dataFormatada} às ${horaFormatada}`;

                        const filtroAtivo = document.getElementById('provento-filtro-ativo').value;
                        const filtroTipo = document.getElementById('provento-filtro-tipo').value;
                        const filtroStatus = document.getElementById('provento-filtro-status').value;
                        const filtroPosicao = document.getElementById('provento-filtro-posicao').value;
                        let filtrosTexto = 'Filtros aplicados: ';
                        const filtrosAtivos = [];
                        if (filtroAtivo) filtrosAtivos.push(`Ativo: ${filtroAtivo.toUpperCase()}`);
                        if (filtroTipo !== 'todos') filtrosAtivos.push(`Tipo: ${filtroTipo}`);
                        if (filtroStatus !== 'todos') filtrosAtivos.push(`Status: ${filtroStatus === 'receber' ? 'A Receber' : 'Recebidos'}`);
                        if (filtroPosicao !== 'todos') filtrosAtivos.push(`Posição: ${filtroPosicao === 'em_carteira' ? 'Em Carteira' : 'Zerados'}`);
                        document.getElementById('impressao-filtros').textContent = filtrosAtivos.length > 0 ? filtrosTexto + filtrosAtivos.join('; ') : 'Filtros aplicados: Nenhum';

                        const resumoContainer = document.getElementById('proventos-summary-container');
                        const resumoTitulo = resumoContainer.querySelector('#proventos-summary-titulo').textContent;
                        const dividendoTotal = resumoContainer.querySelector('#summary-dividendo-total').textContent;
                        const projecaoAnual = resumoContainer.querySelector('#summary-projecao-anual').textContent;
                        const mediaMensal = resumoContainer.querySelector('#summary-media-mensal').textContent;

                        const resumoHtml = `
                            <div class="impressao-resumo-container">
                                <h3>${resumoTitulo}</h3>
                                <div class="impressao-resumo-grid">
                                    <div><strong>Dividendo Total no Período:</strong> ${dividendoTotal}</div>
                                    <div><strong>Projeção Anual:</strong> ${projecaoAnual}</div>
                                    <div><strong>Média Mensal:</strong> ${mediaMensal}</div>
                                </div>
                            </div>
                        `;
                        document.getElementById('impressao-resumo').innerHTML = resumoHtml;

                        let tabelaHtml = `<table>
                            <thead>
                                <tr>
                                    <th>Ativo</th><th>Tipo</th><th>Data Com</th><th>Data Pag.</th>
                                    <th class="numero">Valor/Un.</th><th class="numero">Qtd.</th>
                                    <th class="numero">Total Recebido</th><th class="percentual">YOC</th>
                                </tr>
                            </thead>
                            <tbody>`;
                        sortedProventos.forEach(p => {
                            tabelaHtml += `
                                <tr>
                                    <td>${p.ticker}</td>
                                    <td>${p.tipo}</td>
                                    <td>${new Date(p.dataCom + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                                    <td>${new Date(p.dataPagamento + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                                    <td class="numero">${formatarPrecoMedio(p.valorIndividual)}</td>
                                    <td class="numero">${Math.round(p.quantidadeNaDataCom)}</td>
                                    <td class="numero">${formatarMoeda(p.valorTotalRecebido)}</td>
                                    <td class="percentual">${formatarPercentual(p.yieldOnCost)}</td>
                                </tr>`;
                        });
                        tabelaHtml += `</tbody></table>`;
                        document.getElementById('impressao-tabela').innerHTML = tabelaHtml;

                        const body = document.body;
                        const container = document.getElementById('container-impressao-proventos');
                        body.classList.add('imprimindo-proventos');
                        container.classList.add('imprimindo');

                        window.print();

                        setTimeout(() => {
                            body.classList.remove('imprimindo-proventos');
                            container.classList.remove('imprimindo');
                        }, 500);
                        break;
                    }
                    case 'btn-importar-cotacoes-manual-config': document.getElementById('input-arquivo-cotacoes').click(); break;
                    case 'btn-exportar-proventos': exportarProventosCSV(); break;
                    case 'btn-importar-proventos': document.getElementById('input-arquivo-proventos').click(); break;
                    case 'btn-imprimir-balanceamento': {
                        const body = document.body;
                        const container = document.getElementById('tela-consulta-balanceamento');
                        body.classList.add('imprimindo-balanceamento');
                        container.classList.add('imprimindo');
                    
                        window.print();
                    
                        setTimeout(() => {
                            body.classList.remove('imprimindo-balanceamento');
                            container.classList.remove('imprimindo');
                        }, 500);
                        break;
                    }
                    case 'btn-importar-cotacoes-dashboard': document.getElementById('input-arquivo-cotacoes').click(); break;
                    case 'btn-reset-simulacao': resetarSimulacaoNegociacao(); break;
                    case 'btn-visualizar-simulacao': abrirModalResumoNegociacao(); break;
                }
            }
            if (classList.contains('btn-atualizar-cotacoes-api')) {
                acaoBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Atualizando...';
                acaoBtn.disabled = true;
                atualizarCotacoesComAPI().finally(() => {
                    document.querySelectorAll('.btn-atualizar-cotacoes-api').forEach(b => {
                        b.innerHTML = 'Atualizar Cotações (API)'; b.disabled = false;
                    });
                });
            } else if (classList.contains('btn-importar-cotacoes-csv')) {
                document.getElementById('input-arquivo-cotacoes').click();
            } else if (classList.contains('btn-abrir-modal-performance')) {
                abrirModalPerformance(data.tipoAtivo);
            } else if (classList.contains('btn-abrir-modal-rf')) {
                abrirModalCadastroAtivoRF(null);
            } else if (classList.contains('btn-abrir-calendario-proventos')) {
                abrirModalCalendarioProventos();
            } else if (classList.contains('btn-abrir-calendario-proventos-acoes')) {
                abrirModalCalendarioProventosAcoes();
            } else if (classList.contains('btn-abrir-modal-balanceamento')) {
                abrirModalBalanceamento(data.tipoAtivo);
            } else if (classList.contains('btn-aportar-rf')) {
                abrirModalAporteRF(parseFloat(data.rfId));
            } else if (classList.contains('btn-resgatar-rf')) {
                abrirModalResgateRF(parseFloat(data.rfId));
            } else if (classList.contains('btn-historico-rf')) {
                abrirModalHistoricoRF(parseFloat(data.rfId));
            } else if (classList.contains('btn-corrigir-data')) {
                abrirModalCorrecaoData(data.recordType, data.recordId);
            } else if (classList.contains('toggle-sync')) {
                const id = parseFloat(data.id);
                if (!isNaN(id)) {
                    toggleSincronizacaoFinancas(id);
                }
            }
            const isEdit = classList.contains('edit');
            const isDelete = classList.contains('delete');
            const idAcao = data.id || data.noteId || data.movRfId || data.ativoId || data.ativoRfId || data.ativoMoedaId || data.posicaoId || data.editPosicaoId || data.opId || data.proventoId || data.contaId || data.feriadoId || data.transferenciaId || data.eventoCorpId || data.eventoAtivoId || data.transacaoProventoId || data.transacaoId;
            if (idAcao) {
                const parsedId = !isNaN(parseFloat(idAcao)) && isFinite(idAcao) ? parseFloat(idAcao) : idAcao;
                if (data.ativoId) { 
                    if (isEdit) abrirModalCadastroAtivo(todosOsAtivos.find(x=>x.id===parsedId)); 
                    else if (isDelete) deletarAtivo(parsedId); 
                } else if (data.noteId) { 
                    if (isEdit) carregarNotaParaEdicao(parsedId); 
                    else if (isDelete) deletarNota(parsedId); 
                } else if (data.opId) { 
                    if (isEdit) iniciarEdicaoOperacao(parsedId); 
                    else if (isDelete) deletarOperacao(parsedId); 
                } else if (data.proventoId) { 
                    if (isEdit) { retornoModalProvento = 'lista-proventos'; abrirModalLancamentoProvento(todosOsProventos.find(x=>x.id===parsedId)); }
                    else if (isDelete) { deletarProvento(parsedId); }
                } else if (data.contaId) { 
                    if (isEdit) abrirModalCadastroConta(todasAsContas.find(x=>x.id===parsedId), 'conta'); 
                } else if (data.feriadoId) { 
                    if (isEdit) abrirModalFeriado(todosOsFeriados.find(x=>x.id===parsedId)); 
                    else if (isDelete) deletarFeriado(parsedId); 
                } else if (data.id && (data.type === 'conta' || data.type === 'moeda')) {
                    if (isEdit) {
                        const movimentacaoParaEditar = todasAsMovimentacoes.find(m => String(m.id) === String(parsedId));
                        if (movimentacaoParaEditar) abrirModalNovaTransacaoMoeda(movimentacaoParaEditar);
                    } else if (isDelete) {
                        deletarMovimentacao(parsedId, data.type); // Chama a nova função unificada
                    }
                } else if (data.transferenciaId) { 
                    if (isEdit) abrirModalEdicaoTransferencia(parsedId); 
                    else if (isDelete) deletarTransferencia(parsedId); 
                } else if (data.eventoCorpId) { 
                    if (isEdit) abrirModalEventoCorporativo(todosOsAjustes.find(x=>x.id===parsedId)); 
                    else if (isDelete) deletarEventoCorporativo(parsedId); 
                } else if (data.eventoAtivoId) { 
                    if(isEdit) abrirModalEventoAtivo(todosOsAjustes.find(x => x.id === parsedId)); 
                    else if(isDelete) deletarEventoAtivo(parsedId); 
                } else if (data.transacaoProventoId) { 
                    if(isEdit) abrirModalEdicaoTransacaoProvento(parsedId); 
                } else if (data.movRfId) { 
                    if (isEdit) abrirModalEdicaoMovimentacaoRF(parsedId); 
                    else if(isDelete) deletarMovimentacaoRF(parsedId); 
                } else if (data.ativoRfId) { 
                    if (isEdit) abrirModalCadastroAtivoRF(todosOsAtivosRF.find(x => x.id === parsedId));
                    else if (isDelete) deletarAtivoRF(parsedId);
                } else if (data.ativoMoedaId) {
                    if (isEdit) abrirModalCadastroConta(todosOsAtivosMoedas.find(x => String(x.id) === String(parsedId)), 'moeda');
                    else if (isDelete) deletarAtivoMoeda(parsedId);
                } else if (data.posicaoId) { 
                    if (isDelete) deletarPosicao(parsedId); 
                } else if (data.editPosicaoId) { 
                    if(isEdit) abrirModalPosicaoInicial(posicaoInicial.find(x=>x.id===parsedId)); 
                }
            }
        }
        const btnAddCorretoraProvento = target.closest('.btn-add-corretora-provento');
        if (btnAddCorretoraProvento) {
            adicionarLinhaCorrecaoProvento(btnAddCorretoraProvento);
            return;
        }
        const revertBtn = target.closest('.reverter-btn');
        if (revertBtn) {
            const proventoId = revertBtn.dataset.proventoId;
            const checkbox = document.getElementById(`transfer-provento-${proventoId}`);
            if (checkbox) {
                checkbox.checked = false;
                checkbox.disabled = false;
            }
            const itemInfo = revertBtn.closest('.transferencia-item').querySelector('.transferencia-item-info');
            if (itemInfo) itemInfo.style.display = 'none';
            revertBtn.style.display = 'none';
            return; 
        }
        if (target.classList.contains('modal')) { fecharModal(target.id); return; }
        const closeBtn = target.closest('.close-btn');
        if (closeBtn) { fecharModal(closeBtn.closest('.modal').id); return; }
        const iconePausa = target.closest('.icone-pausa-aporte');
        if (iconePausa) {
            const ticker = iconePausa.dataset.ticker;
            if (ticker) {
                const ativo = todosOsAtivos.find(a => a.ticker === ticker);
                if (ativo) {
                    ativo.statusAporte = ativo.statusAporte === 'Pausado' ? 'Ativo' : 'Pausado';
                    salvarAtivos();
                }
            } else if (iconePausa.id === 'icone-pausa-rf') {
                dadosAlocacao.statusAporteRendaFixa = dadosAlocacao.statusAporteRendaFixa === 'Pausado' ? 'Ativo' : 'Pausado';
                salvarDadosAlocacao();
            }
            renderizarTelaConsultaBalanceamento();
            return;
        }
        const btnAddAtivoAlocacao = target.closest('#btn-adicionar-ativo-alocacao');
        if (btnAddAtivoAlocacao) {
            const ticker = prompt('Digite o ticker do ativo que você deseja adicionar à sua estratégia de alocação (Ex: ITSA4):');
            if (!ticker) return;

            const tickerUpper = ticker.toUpperCase();
            
            // Validação 1: Verificar se o ativo está cadastrado
            const ativoInfo = todosOsAtivos.find(a => a.ticker === tickerUpper);
            if (!ativoInfo) {
                alert(`O ativo "${tickerUpper}" não foi encontrado no seu cadastro. Por favor, cadastre-o primeiro na tela de "Cadastro de Ativos".`);
                return;
            }

            // Validação 2: Verificar se o ativo já tem posição em carteira
            const posicoes = gerarPosicaoDetalhada();
            if (posicoes[tickerUpper] && posicoes[tickerUpper].quantidade > 0.000001) {
                alert(`O ativo "${tickerUpper}" já está na sua carteira e não pode ser adicionado novamente.`);
                return;
            }

            // Validação 3: Verificar se já não está na alocação
            if (dadosAlocacao.ativos[tickerUpper] !== undefined) {
                 alert(`O ativo "${tickerUpper}" já foi adicionado à sua alocação planejada.`);
                 return;
            }

            // Adiciona o ativo à alocação com 0%
            dadosAlocacao.ativos[tickerUpper] = 0;
            salvarDadosAlocacao();
            renderizarTelaRendaVariavel(); // Redesenha a tela para mostrar a nova linha
            alert(`Ativo "${tickerUpper}" adicionado à sua estratégia! Agora você pode definir um percentual de alocação ideal para ele.`);
            return;
        }
        const btnAbrirProvento = target.closest('.btn-abrir-modal-provento');
        if (btnAbrirProvento) {
            retornoModalProvento = btnAbrirProvento.dataset.origem;
            abrirModalLancamentoProvento();
            return;
        }
        const iconeRecorrente = target.closest('i.acao-btn-recorrente');
        if (iconeRecorrente) {
            const data = iconeRecorrente.dataset;
            const maeId = data.maeId;
            const ocorrenciaData = data.ocorrenciaData;
            const acaoEspecifica = data.action;
            const mae = todasAsTransacoesRecorrentes.find(r => String(r.id) === maeId);
            if (!mae) { alert('Erro: Regra de recorrência não encontrada.'); return; }
            switch (acaoEspecifica) {
                case 'CONFIRMAR_OCORRENCIA': executarAcaoRecorrente(mae.id, ocorrenciaData, 'CONFIRMAR_OCORRENCIA'); return;
                case 'PULAR_OCORRENCIA': executarAcaoRecorrente(mae.id, ocorrenciaData, 'PULAR_OCORRENCIA'); return;
                case 'ABRIR_MODAL_ACOES_RECORRENTE':
                    document.getElementById('recorrente-info-descricao').textContent = mae.descricao;
                    document.getElementById('recorrente-info-data').textContent = new Date(ocorrenciaData + 'T12:00:00').toLocaleDateString('pt-BR');
                    const tipoMovimentacao = mae.valor > 0 ? 'Entrada' : 'Saída';
                    const valorFormatado = (mae.targetType === 'moeda') ? formatarMoedaEstrangeira(Math.abs(mae.valor), todosOsAtivosMoedas.find(a => String(a.id) === mae.targetId)?.moeda || '') : formatarMoeda(Math.abs(mae.valor));
                    document.getElementById('recorrente-info-valor').textContent = `${tipoMovimentacao} de ${valorFormatado}`;
                    const containerBotoes = document.getElementById('recorrente-botoes-acao');
                    containerBotoes.innerHTML = `<div class="acao-recorrente-grid"><button class="btn acao-recorrente-btn btn-primario" onclick="executarAcaoRecorrente('${mae.id}', '${ocorrenciaData}', 'EDITAR_OCORRENCIA'); fecharModal('modal-acao-recorrente');"><i class="fas fa-pencil-alt"></i><span>Editar Apenas Esta Ocorrência</span><small>Cria uma transação permanente para esta data e abre o formulário para alteração. A regra original não será alterada.</small></button><button class="btn acao-recorrente-btn btn-secundario" onclick="executarAcaoRecorrente('${mae.id}', '${ocorrenciaData}', 'EDITAR_SERIE'); fecharModal('modal-acao-recorrente');"><i class="fas fa-cogs"></i><span>Editar Toda a Série</span><small>Abre o formulário para alterar a regra de recorrência (valor, frequência, etc.) para esta e todas as futuras ocorrências.</small></button><button class="btn acao-recorrente-btn btn-perigo" onclick="executarAcaoRecorrente('${mae.id}', '${ocorrenciaData}', 'EXCLUIR_SERIE'); fecharModal('modal-acao-recorrente');"><i class="fas fa-trash-alt"></i><span>Excluir Toda a Série</span><small>Apaga permanentemente a regra de recorrência para esta e todas as futuras ocorrências.</small></button></div>`;
                    abrirModal('modal-acao-recorrente');
                    return;
            }
        }
        const lancamentoProjetado = target.closest('.lancamento-projetado-clicavel');
        if (lancamentoProjetado) {
            const data = lancamentoProjetado.dataset;
            const source = data.lancamentoSource;
            const id = data.lancamentoId;
            const maeId = data.lancamentoMaeId;
            const ocorrenciaData = data.lancamentoData;
            switch (source) {
                case 'manual':
                case 'recorrente_confirmada':
                case 'provento_editado': // Unificado aqui
                case 'aporte_rf':
                case 'resgate_rf': {
                    const movimentacaoParaEditar = todasAsMovimentacoes.find(t => String(t.id) === id);
                    if (movimentacaoParaEditar) {
                        if(source === 'provento_editado') {
                            abrirModalEdicaoTransacaoProvento(movimentacaoParaEditar.id);
                        } else {
                            abrirModalNovaTransacaoMoeda(movimentacaoParaEditar);
                        }
                    }
                    break;
                }
                case 'recorrente_futura':
                    const acaoRecorrenteBtn = document.querySelector(`.acao-btn-recorrente[data-mae-id="${maeId}"][data-ocorrencia-data="${ocorrenciaData}"][data-action="ABRIR_MODAL_ACOES_RECORRENTE"]`);
                    if(acaoRecorrenteBtn) acaoRecorrenteBtn.click();
                    break;
                case 'nota': alert("Esta transação foi gerada por uma Nota de Negociação e não pode ser editada diretamente. Por favor, edite a nota original na tela 'Notas de Negociação'."); break;
                case 'provento':
                    // Para proventos originais, a edição do valor ainda é feita através de um modal específico
                    abrirModalEdicaoTransacaoProvento(null, id); // Passa o ID do evento para a função encontrar a transação
                    break;
                default: alert("Esta é uma transação automática e não pode ser editada diretamente."); break;
            }
            return;
        }
        const lancamentoMultiplo = target.closest('.lancamento-projetado-multiplo');
        if (lancamentoMultiplo) {
            alert('Este valor representa a soma de múltiplas transações no mesmo dia. Para editar ou excluir, por favor, acesse os lançamentos individualmente na tela de Extrato de Contas.');
            return;
        }
        if (e.target.closest('.btn-restaurar-backup')) {
            document.getElementById('restore-file-input').click();
        }

        // Lógica para os ícones da calculadora
        const icon = e.target.closest('.calculator-icon');
        if (icon) {
            const targetInputId = icon.dataset.targetInput;
            if (targetInputId) {
                openCalculator(targetInputId);
            }
        }
    });

    document.querySelector('.main-content').addEventListener('change', (e) => {
        const target = e.target;
        if (target.classList.contains('alocacao-categoria-input')) {
            const categoria = target.dataset.categoria;
            const novoValor = parseDecimal(target.value) / 100;
            if (!dadosAlocacao.categorias) { dadosAlocacao.categorias = {}; }
            dadosAlocacao.categorias[categoria] = isNaN(novoValor) ? 0 : novoValor;
            salvarDadosAlocacao();
            renderizarDashboard();
        }
        if (target.classList.contains('alocacao-ativo-input')) {
            const ticker = target.dataset.ativoTicker;
            const novoValor = parseDecimal(target.value) / 100;
            if (!dadosAlocacao.ativos) { dadosAlocacao.ativos = {}; }
            dadosAlocacao.ativos[ticker] = isNaN(novoValor) ? 0 : novoValor;
            salvarDadosAlocacao();
            
            const telaAtiva = target.closest('.main-content > div[style*="display: block"]');
            if (telaAtiva && telaAtiva.id === 'tela-renda-variavel') {
                renderizarTelaRendaVariavel();
            }
        }
        const btnAbrirProvento = target.closest('.btn-abrir-modal-provento');
        if (btnAbrirProvento) {
            retornoModalProvento = btnAbrirProvento.dataset.origem;
            abrirModalLancamentoProvento();
            return;
        }
    });
    document.getElementById('btn-dashboard-backup').addEventListener('click', fazerBackup);
    document.getElementById('btn-backup').addEventListener('click', fazerBackup);
    document.getElementById('config-link-acoes').addEventListener('change', (e) => { linksExternos.acoes = e.target.value.trim(); salvarLinksExternos(); });
    document.getElementById('config-link-fiis').addEventListener('change', (e) => { linksExternos.fiis = e.target.value.trim(); salvarLinksExternos(); });
    document.getElementById('config-link-etfs').addEventListener('change', (e) => { linksExternos.etfs = e.target.value.trim(); salvarLinksExternos(); });
    document.getElementById('filtro-caixa-data-inicio').addEventListener('change', () => renderizarTelaCaixaGlobal(true));
    document.getElementById('filtro-caixa-data-fim').addEventListener('change', () => renderizarTelaCaixaGlobal(true));
    document.getElementById('config-cotacoes-url').addEventListener('change', (e) => { urlCotacoesCSV = e.target.value.trim(); salvarUrlCotacoes(); });
    document.getElementById('form-nova-transacao-moeda').addEventListener('submit', (e) => { 
        e.preventDefault(); 
        salvarMovimentacaoUniversal(e); // <-- CORREÇÃO: Passa o evento (e)
    });
    document.getElementById('titulo-tela-rv').addEventListener('click', () => {
        abrirModalGraficoCotacoesHistoricas('todos');
    });
    document.getElementById('form-add-operacao').addEventListener('submit', adicionarOperacao);
    document.getElementById('form-edicao-operacao').addEventListener('submit', salvarEdicaoOperacao);
    document.getElementById('form-cadastro-ativo').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('ativo-id').value;
        const cnpjInput = document.getElementById('ativo-cnpj').value.replace(/[^\d]+/g,'');
        const adminCnpjInput = document.getElementById('ativo-admin-cnpj').value.replace(/[^\d]+/g,'');

        if (cnpjInput && !validarCNPJ(cnpjInput)) { alert('O CNPJ do Ativo informado é inválido.'); document.getElementById('ativo-cnpj').classList.add('is-invalid'); return; }
        document.getElementById('ativo-cnpj').classList.remove('is-invalid');
        if (document.getElementById('ativo-tipo').value === 'FII' && adminCnpjInput && !validarCNPJ(adminCnpjInput)) { alert('O CNPJ da Administradora informado é inválido.'); document.getElementById('ativo-admin-cnpj').classList.add('is-invalid'); return; }
        document.getElementById('ativo-admin-cnpj').classList.remove('is-invalid');

        const novoTicker = document.getElementById('ativo-ticker').value.toUpperCase();
        const tipoAtivo = document.getElementById('ativo-tipo').value;
        const metaYield = tipoAtivo === 'Ação' ? parseDecimal(document.getElementById('ativo-meta-yield-bazin').value) / 100 : 0;
        
        if (id) { // --- MODO EDIÇÃO ---
            const ativoOriginal = todosOsAtivos.find(a => a.id === parseFloat(id));
            if (!ativoOriginal) {
                alert("Erro: Ativo original não encontrado para edição.");
                return;
            }
            const tickerAntigo = ativoOriginal.ticker;

            if (tickerAntigo !== novoTicker) {
                // --- INÍCIO DA NOVA LÓGICA DE RENOMEAÇÃO ---
                if (!confirm(`Você alterou o ticker de "${tickerAntigo}" para "${novoTicker}".\n\nATENÇÃO: Esta ação irá atualizar TODOS os registros históricos (notas, proventos, posição inicial, etc.) associados a este ativo.\n\nDeseja continuar com a renomeação completa?`)) {
                    return; // Aborta a operação se o usuário cancelar
                }

                // 1. Atualizar todas as Notas
                todasAsNotas.forEach(nota => {
                    nota.operacoes.forEach(op => {
                        if (op.ativo === tickerAntigo) op.ativo = novoTicker;
                    });
                });

                // 2. Atualizar todos os Proventos
                todosOsProventos.forEach(provento => {
                    if (provento.ticker === tickerAntigo) provento.ticker = novoTicker;
                });

                // 3. Atualizar Posição Inicial e Histórico
                posicaoInicial.forEach(pos => {
                    if (pos.ticker === tickerAntigo) pos.ticker = novoTicker;
                });

                // 4. Atualizar Ajustes (Transferências, etc.)
                todosOsAjustes.forEach(ajuste => {
                    if (ajuste.ticker === tickerAntigo) ajuste.ticker = novoTicker;
                    if (ajuste.tipoAjuste === 'transferencia') {
                        ajuste.ativosTransferidos.forEach(at => {
                            if (at.ticker === tickerAntigo) at.ticker = novoTicker;
                        });
                    }
                });

                // 5. Atualizar Metas
                todasAsMetas.forEach(meta => {
                    if (meta.tipo === 'posicao_ativo' && meta.ativoAlvo === tickerAntigo) {
                        meta.ativoAlvo = novoTicker;
                    }
                });
                
                // 6. Atualizar estruturas que usam ticker como chave
                const renomearChaveObjeto = (obj) => {
                    if (obj && obj[tickerAntigo]) {
                        obj[novoTicker] = obj[tickerAntigo];
                        delete obj[tickerAntigo];
                    }
                };
                renomearChaveObjeto(dadosAlocacao.ativos);
                renomearChaveObjeto(dadosDeMercado.cotacoes);
                renomearChaveObjeto(dadosSimulacaoNegociar.acoes);
                renomearChaveObjeto(dadosSimulacaoNegociar.fiis);

                // 7. Atualizar Histórico de Snapshots
                historicoCarteira.forEach(snapshot => {
                    renomearChaveObjeto(snapshot.detalhesCarteira?.ativos);
                });

                // Salvar todas as estruturas de dados modificadas
                await Promise.all([
                    salvarNotas(),
                    salvarProventos(),
                    salvarPosicaoInicial(),
                    salvarAjustes(),
                    salvarMetas(),
                    salvarDadosAlocacao(),
                    salvarDadosDeMercado(),
                    salvarDadosSimulacaoNegociar(),
                    salvarHistoricoCarteira()
                ]);
                 // --- FIM DA NOVA LÓGICA DE RENOMEAÇÃO ---
            }

            // Atualiza os dados do ativo em si (seja o ticker novo ou o antigo)
            const index = todosOsAtivos.findIndex(a => a.id === parseFloat(id));
            if (index > -1) {
                todosOsAtivos[index].ticker = novoTicker;
                todosOsAtivos[index].tipo = tipoAtivo;
                todosOsAtivos[index].nomePregao = document.getElementById('ativo-nome-pregao').value;
                todosOsAtivos[index].nome = document.getElementById('ativo-nome').value;
                todosOsAtivos[index].cnpj = cnpjInput;
                todosOsAtivos[index].tipoAcao = document.getElementById('ativo-tipo-acao').value;
                todosOsAtivos[index].adminNome = document.getElementById('ativo-admin-nome').value;
                todosOsAtivos[index].adminCnpj = adminCnpjInput;
                todosOsAtivos[index].metaYieldBazin = metaYield;
            }

        } else { // --- MODO CRIAÇÃO ---
            const ativo = {
                id: Date.now(), ticker: novoTicker, tipo: tipoAtivo,
                nomePregao: document.getElementById('ativo-nome-pregao').value, nome: document.getElementById('ativo-nome').value,
                cnpj: cnpjInput, tipoAcao: document.getElementById('ativo-tipo-acao').value, adminNome: document.getElementById('ativo-admin-nome').value,
                adminCnpj: adminCnpjInput, metaYieldBazin: metaYield, statusAporte: 'Ativo'
            };
            todosOsAtivos.push(ativo);
        }
        
        salvarAtivos().then(() => {
            renderizarTabelaAtivos(); 
            fecharModal('modal-cadastro-ativo');
        });
    });
    document.getElementById('crescimento-tipo-analise').addEventListener('change', (e) => {
        const tipoAnalise = e.target.value;
        document.getElementById('container-analise-valor').style.display = tipoAnalise === 'valor' ? 'block' : 'none';
        document.getElementById('container-analise-periodo').style.display = tipoAnalise === 'periodo' ? 'flex' : 'none';
        document.getElementById('container-resultado-crescimento').style.display = 'none';
        document.getElementById('container-resultado-crescimento').innerHTML = '';
    });
    
    document.getElementById('form-crescimento-patrimonial').addEventListener('submit', (e) => {
        e.preventDefault();
        const tipoSaldo = document.getElementById('crescimento-tipo-saldo').value;
        const tipoAnalise = document.getElementById('crescimento-tipo-analise').value;
    
        if (tipoAnalise === 'valor') {
            const intervaloValor = parseDecimal(document.getElementById('crescimento-intervalo-valor').value);
            if (intervaloValor <= 0) {
                alert("O intervalo de valor deve ser maior que zero.");
                return;
            }
            const resultados = calcularCrescimentoPatrimonial(tipoSaldo, intervaloValor);
            renderizarResultadoCrescimento(resultados, intervaloValor);
        } else {
            const periodo = document.getElementById('crescimento-periodo').value;
            let dataInicioUsuario = document.getElementById('crescimento-data-inicio').value;
    
            if (!dataInicioUsuario && historicoCarteira.length > 0) {
                dataInicioUsuario = historicoCarteira[0].data;
                document.getElementById('crescimento-data-inicio').value = dataInicioUsuario;
            } else if (!dataInicioUsuario) {
                alert("Não há histórico de snapshots para analisar.");
                return;
            }
            
            const resultados = calcularCrescimentoPorPeriodo(tipoSaldo, periodo, dataInicioUsuario);
            renderizarResultadoCrescimentoPorPeriodo(resultados);
        }
    });
    document.getElementById('ativo-tipo').addEventListener('change', (e) => {
        const tipo = e.target.value;
        document.getElementById('fii-admin-fields').style.display = tipo === 'FII' ? 'block' : 'none';
        document.getElementById('acao-tipo-fields').style.display = tipo === 'Ação' ? 'block' : 'none';
    });
    document.getElementById('ativo-tipo').dispatchEvent(new Event('change'));
    document.getElementById('form-posicao-inicial').addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('posicao-id').value;
        const ticker = document.getElementById('posicao-ativo').value.toUpperCase();
        if (!todosOsAtivos.some(a => a.ticker === ticker)) { alert(`O ativo "${ticker}" não está cadastrado. Por favor, cadastre-o primeiro.`); abrirModalCadastroAtivo(null, ticker); return; }
        const precoMedio = parseDecimal(document.getElementById('posicao-preco-medio').value);
        const posicoesPorCorretora = []; let quantidadeTotal = 0;
        document.querySelectorAll('.corretora-row').forEach(row => {
            const corretora = row.querySelector('.posicao-corretora').value;
            const quantidade = parseInt(row.querySelector('.posicao-quantidade').value);
            if (corretora && quantidade > 0) { posicoesPorCorretora.push({ corretora, quantidade }); quantidadeTotal += quantidade; }
        });
        if (posicoesPorCorretora.length === 0) { alert('Adicione pelo menos uma corretora e quantidade.'); return; }
        const novaPosicao = { id: id ? parseFloat(id) : Date.now(), tipoRegistro: 'SUMARIO_MANUAL', ticker: ticker, data: document.getElementById('posicao-data').value, precoMedio: precoMedio, posicoesPorCorretora: posicoesPorCorretora };
        if (id) { const index = posicaoInicial.findIndex(p => p.id === novaPosicao.id); if (index > -1) { posicaoInicial[index] = novaPosicao; } }
        else { posicaoInicial.push(novaPosicao); }
        
        salvarPosicaoInicial().then(() => {
            renderizarTabelaPosicaoInicial(); 
            fecharModal('modal-posicao-inicial');
        });
    });
    document.getElementById('btn-add-corretora-row').addEventListener('click', () => { adicionarLinhaCorretora(); });
    document.getElementById('form-lancamento-provento').addEventListener('submit', async (e) => {
        e.preventDefault();
        const saveButton = e.target.querySelector('button[type="submit"]');
        const originalButtonText = saveButton.innerHTML;
        saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
        saveButton.disabled = true;
        
        try {
            const id = document.getElementById('provento-id').value;
            const ticker = document.getElementById('provento-ativo').value.toUpperCase();
            const ativoInfo = todosOsAtivos.find(a => a.ticker === ticker);
            if (!ativoInfo) { alert(`O ativo "${ticker}" não está cadastrado. Por favor, cadastre-o primeiro.`); abrirModalCadastroAtivo(null, ticker); return; }
            const valorIndividualBruto = parseDecimal(document.getElementById('provento-valor-individual').value);
            const aliquotaIRPercent = parseDecimal(document.getElementById('provento-ir').value) || 0;
            const aliquotaIR = aliquotaIRPercent / 100;
            const valorIndividualLiquido = valorIndividualBruto * (1 - aliquotaIR);

            const provento = { 
                id: id ? parseFloat(id) : Date.now(), ticker: ticker, tipo: document.getElementById('provento-tipo').value, 
                dataCom: document.getElementById('provento-data-com').value, dataPagamento: document.getElementById('provento-data-pagamento').value, 
                valorIndividual: valorIndividualLiquido, valorBrutoIndividual: valorIndividualBruto, percentualIR: aliquotaIRPercent
            };
            const dadosCalculados = calcularDadosProvento(provento.ticker, provento.dataCom, provento.valorIndividual);
            Object.assign(provento, dadosCalculados);
            const index = todosOsProventos.findIndex(p => p.id === provento.id);
            if (index > -1) { todosOsProventos[index] = provento; } else { todosOsProventos.push(provento); }
            const alertas = sincronizarProventoComTransacao(provento.id);
            
            await Promise.all([salvarProventos(), salvarMovimentacoes()]);
            
            // DISPARA A SINCRONIZAÇÃO SILENCIOSA
            sincronizarTodosOsRegistros(null, true);
            
            fecharModal('modal-lancamento-provento');

            if (retornoModalProvento && retornoModalProvento.startsWith('unificado-')) {
                const vista = retornoModalProvento.split('-')[1];
                abrirModalCalendariosUnificados(vista);
            } else if (retornoModalProvento === 'lista-proventos') {
                renderizarTabelaProventos();
            }
            retornoModalProvento = null; 
            if (alertas.length > 0) alert('Atenção:\n' + alertas.join('\n'));

        } finally {
            saveButton.innerHTML = originalButtonText;
            saveButton.disabled = false;
        }
    });
    document.getElementById('form-cadastro-conta').addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('conta-id').value;
        const tipoOriginal = document.getElementById('conta-tipo-original').value;
        const moeda = document.getElementById('conta-moeda').value;
        let savePromise;
        
        if (moeda === 'BRL') {
            let bancoNome = document.getElementById('conta-banco').value;
            if (bancoNome === 'Outro') { bancoNome = document.getElementById('conta-outro-banco').value; }
            if (!bancoNome) { alert('O nome do banco é obrigatório.'); return; }

            const conta = {
                id: id ? parseFloat(id) : Date.now(),
                banco: bancoNome,
                tipo: document.getElementById('conta-tipo').value,
                moeda: 'BRL',
                numeroBanco: document.getElementById('conta-numero-banco').value,
                agencia: document.getElementById('conta-agencia').value,
                numero: document.getElementById('conta-numero').value,
                pix: document.getElementById('conta-pix').value,
                saldoInicial: parseDecimal(document.getElementById('conta-saldo-inicial').value),
                dataSaldoInicial: document.getElementById('conta-data-saldo-inicial').value,
                notas: document.getElementById('conta-notas').value
            };

            let index = -1;
            if(id) index = todasAsContas.findIndex(c => String(c.id) === String(id));
            
            if (index > -1) {
                todasAsContas[index] = conta;
            } else {
                todasAsContas.push(conta);
            }
            savePromise = salvarContas();

        } else { // Moeda estrangeira
            const nomeAtivo = document.getElementById('conta-nome-ativo').value;
            if (!nomeAtivo) { alert('O nome da conta/ativo é obrigatório.'); return; }
            
            const ativoMoeda = {
                id: id ? parseFloat(id) : Date.now(),
                nomeAtivo: nomeAtivo,
                moeda: moeda,
                descricao: '',
                saldoInicial: parseDecimal(document.getElementById('conta-saldo-inicial').value),
                dataSaldoInicial: document.getElementById('conta-data-saldo-inicial').value,
                notas: document.getElementById('conta-notas').value
            };

            let index = -1;
            if(id) index = todosOsAtivosMoedas.findIndex(a => String(a.id) === String(id));

            if (index > -1) {
                todosOsAtivosMoedas[index] = ativoMoeda;
            } else {
                todosOsAtivosMoedas.push(ativoMoeda);
            }
            
            if (tipoOriginal === 'conta' && id) {
                todasAsContas = todasAsContas.filter(c => String(c.id) !== String(id));
                salvarContas(); // Salva a remoção da conta antiga
            }
            
            savePromise = salvarAtivosMoedas();
        }
        
        savePromise.then(() => {
            renderizarTabelaContas();
            if(telas.caixaGlobal.style.display === 'block'){ renderizarTelaCaixaGlobal(true); }
            fecharModal('modal-cadastro-conta');
        });
    });
    document.getElementById('conta-banco').addEventListener('change', (e) => { document.getElementById('container-outro-banco').style.display = e.target.value === 'Outro' ? 'block' : 'none'; });
    document.getElementById('conta-banco').dispatchEvent(new Event('change'));
    document.getElementById('conta-tipo').addEventListener('change', (e) => { document.getElementById('conta-pix').disabled = (e.target.value !== 'Conta Corrente'); });
    document.getElementById('conta-tipo').dispatchEvent(new Event('change'));
    document.getElementById('form-cadastro-feriado').addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('feriado-id').value;
        const feriado = { id: id ? parseFloat(id) : Date.now(), data: document.getElementById('feriado-data').value, descricao: document.getElementById('feriado-descricao').value };
        const index = todosOsFeriados.findIndex(f => f.id === feriado.id);
        if (index > -1) { todosOsFeriados[index] = feriado; } else { todosOsFeriados.push(feriado); }
        salvarFeriados().then(() => {
            renderizarTabelaFeriados(); 
            fecharModal('modal-cadastro-feriado');
        });
    });

    document.getElementById('form-evento-ativo').addEventListener('submit', (e) => {
        salvarEventoAtivo(e); // A função salvarEventoAtivo já foi corrigida para usar .then()
    });

    document.getElementById('form-edicao-transacao-provento').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // --- INÍCIO DA LÓGICA DO BOTÃO ---
        const saveButton = e.target.querySelector('button[type="submit"]');
        const originalButtonText = saveButton.innerHTML;
        saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
        saveButton.disabled = true;

        try {
            // Espera a função (corrigida no passo 2) terminar
            await salvarEdicaoTransacaoProvento(); 
        
        } catch (error) {
            console.error("Erro ao salvar provento editado:", error);
            alert("Ocorreu um erro ao salvar a alteração.");
        
        } finally {
            // Restaura o botão
            saveButton.innerHTML = originalButtonText;
            saveButton.disabled = false;
        }
        // --- FIM DA LÓGICA DO BOTÃO ---
    });
    document.getElementById('form-valores-venda').addEventListener('submit', salvarValoresVenda);
    document.getElementById('form-evento-corporativo').addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('evento-id').value;
        const ticker = document.getElementById('evento-ticker').value.toUpperCase();
        if (!todosOsAtivos.some(a => a.ticker === ticker)) { alert(`O ativo "${ticker}" não está cadastrado. Por favor, cadastre-o primeiro.`); abrirModalCadastroAtivo(null, ticker); return; }
        const novoEvento = {
            id: id ? parseFloat(id) : Date.now(), tipoAjuste: 'split_grupamento', ticker: ticker, data: document.getElementById('evento-data').value,
            tipoEvento: document.getElementById('evento-tipo').value, proporcaoDe: parseFloat(document.getElementById('evento-proporcao-de').value),
            proporcaoPara: parseFloat(document.getElementById('evento-proporcao-para').value)
        };
        if (isNaN(novoEvento.proporcaoDe) || isNaN(novoEvento.proporcaoPara) || novoEvento.proporcaoDe <= 0 || novoEvento.proporcaoPara <= 0) { alert('As proporções devem ser números positivos.'); return; }
        const index = todosOsAjustes.findIndex(a => a.id === novoEvento.id);
        if (index > -1) { todosOsAjustes[index] = novoEvento; } else { todosOsAjustes.push(novoEvento); }
        
        salvarAjustes().then(() => {
            renderizarTabelaEventosCorporativos(); 
            fecharModal('modal-evento-corporativo'); 
            alert('Evento corporativo salvo com sucesso!');
        });
    });
    document.getElementById('form-corrigir-data').addEventListener('submit', salvarCorrecaoData);
    document.getElementById('form-cadastro-ativo-rf').addEventListener('submit', (e) => {
        salvarAtivoRF(e); // A função salvarAtivoRF já foi corrigida
    });

    document.getElementById('form-aporte-rf').addEventListener('submit', (e) => {
        salvarAporteRF(e); // A função salvarAporteRF já foi corrigida
    });

    document.getElementById('form-resgate-rf').addEventListener('submit', (e) => {
        salvarResgateRF(e); // A função salvarResgateRF já foi corrigida
    });
    document.getElementById('evento-ativo-tipo').addEventListener('change', (e) => {
        const tipo = e.target.value;
        const saveButton = document.querySelector('#form-evento-ativo button[type="submit"]');
        const precoMedioInput = document.getElementById('evento-ativo-pm');
        precoMedioInput.required = (tipo === 'entrada');
        document.getElementById('container-evento-entrada-fields').style.display = tipo === 'entrada' ? 'block' : 'none';
        document.getElementById('container-evento-saida-fields').style.display = tipo === 'saida' ? 'block' : 'none';
    
        saveButton.style.display = tipo ? 'block' : 'none';
    
        document.getElementById('evento-ativo-ticker').dispatchEvent(new Event('change'));
    });
    document.getElementById('evento-ativo-tipo').dispatchEvent(new Event('change'));
    document.getElementById('evento-ativo-ticker').addEventListener('change', (e) => {
        const ticker = e.target.value.toUpperCase();
        const tipoEvento = document.getElementById('evento-ativo-tipo').value;
        const dataEvento = document.getElementById('evento-ativo-data').value;
        
        // Pega a referência do botão de salvar
        const saveButton = document.querySelector('#form-evento-ativo button[type="submit"]');
        
        const containerEntrada = document.getElementById('evento-entrada-corretoras-container');
        const containerSaida = document.getElementById('evento-saida-posicao-container');

        containerEntrada.innerHTML = '';
        containerSaida.innerHTML = '';
        
        // CORREÇÃO: Esconde o botão novamente se o ticker for apagado ou inválido
        saveButton.style.display = 'none';

        if (!ticker || !dataEvento) {
            containerEntrada.innerHTML = '<p>Informe o ticker e a data do evento para carregar as corretoras.</p>';
            containerSaida.innerHTML = '<p>Informe o ticker e a data do evento para carregar a posição.</p>';
            return;
        }
        
        const posicoesNaData = gerarPosicaoDetalhada(dataEvento);
        const posDoAtivo = posicoesNaData[ticker];

        // CORREÇÃO: Mostra o botão de salvar somente APÓS a lógica de exibição de quantidades ser concluída
        saveButton.style.display = 'block';

        if (!posDoAtivo || posDoAtivo.quantidade === 0) {
            if (tipoEvento === 'saida') {
                containerSaida.innerHTML = '<p>Nenhuma posição encontrada para este ativo na data selecionada.</p>';
                saveButton.style.display = 'none'; // Esconde se não há o que retirar
                return;
            } else if (tipoEvento === 'entrada') {
                const corretoras = getTodasCorretoras();
                if (corretoras.length === 0) {
                    containerEntrada.innerHTML = '<p>Nenhuma corretora cadastrada. Cadastre suas corretoras primeiro.</p>';
                    saveButton.style.display = 'none'; // Esconde se não há onde entrar
                } else {
                    containerEntrada.innerHTML = corretoras.map(c => `
                        <div class="form-row">
                            <div class="form-group"><label>${c}</label></div>
                            <div class="form-group"><input type="number" class="evento-entrada-qtd" data-corretora="${c}" min="1" placeholder="Qtd."></div>
                        </div>
                    `).join('');
                }
                return;
            }
        }
        
        if (tipoEvento === 'entrada') {
            const corretorasDisponiveis = new Set(getTodasCorretoras());
            for (const corretora in posDoAtivo.porCorretora) {
                if (posDoAtivo.porCorretora[corretora] > 0) {
                    corretorasDisponiveis.add(corretora);
                }
            }
            containerEntrada.innerHTML = [...corretorasDisponiveis].sort().map(c => `
                <div class="form-row">
                    <div class="form-group"><label>${c}</label></div>
                    <div class="form-group"><input type="number" class="evento-entrada-qtd" data-corretora="${c}" min="1" placeholder="Qtd."></div>
                </div>
            `).join('');
        } else if (tipoEvento === 'saida') {
            let tableHtml = `<table><thead><tr><th>Corretora</th><th>Qtd. Atual</th><th>Qtd. a Retirar</th></tr></thead><tbody>`;
            let hasPositions = false;
            for (const corretora in posDoAtivo.porCorretora) {
                const qtd = posDoAtivo.porCorretora[corretora];
                if (qtd > 0) {
                    hasPositions = true;
                    tableHtml += `<tr>
                        <td>${corretora}</td>
                        <td class="numero">${Math.round(qtd)}</td>
                        <td><input type="number" class="qtd-saida-input" data-corretora="${corretora}" min="0" max="${Math.round(qtd)}" value="0"></td>
                    </tr>`;
                }
            }
            tableHtml += `</tbody></table>`;
            if (hasPositions) {
                containerSaida.innerHTML = tableHtml;
            } else {
                containerSaida.innerHTML = '<p>Nenhuma posição encontrada para este ativo na data selecionada para retirada.</p>';
                saveButton.style.display = 'none'; // Esconde se não há posições para retirar
            }
        }
    });
    document.getElementById('posicao-rf-container').addEventListener('blur', (e) => {
        const target = e.target;
        if (target.classList.contains('editable-saldo-rf')) {
            const ativoRFId = parseFloat(target.dataset.rfId);
            const novoSaldoStr = target.textContent;
            salvarEdicaoSaldoLiquidoRF(ativoRFId, novoSaldoStr);
        }
    }, true);
    
    document.getElementById('posicao-rf-container').addEventListener('keydown', (e) => {
        const target = e.target;
        if (e.key === 'Enter' && target.classList.contains('editable-saldo-rf')) {
            e.preventDefault(); 
            target.blur();      
        }
    });
    document.getElementById('evento-ativo-ticker').dispatchEvent(new Event('change'));
    document.getElementById('evento-ativo-data').addEventListener('change', (e) => { document.getElementById('evento-ativo-ticker').dispatchEvent(new Event('change')); });
    document.getElementById('select-ativo-historico').addEventListener('change', (e) => { const ticker = e.target.value; renderizarTabelaHistoricoParaAtivo(ticker); });
    document.getElementById('ir-filtro-ano').addEventListener('change', () => {
        renderizarCalculadoraIR();
        atualizarStatusBotaoIR(); // <-- ADICIONADO AQUI
    });
    document.getElementById('btn-imprimir-ir').addEventListener('click', () => {
        const anoSelecionado = document.getElementById('ir-filtro-ano').value;
        const anoAtual = new Date().getFullYear();
        
        if (parseInt(anoSelecionado, 10) === anoAtual) {
            alert("Não é possível emitir o relatório para Imposto de Renda do ano corrente. Por favor, selecione um ano anterior.");
            return;
        }
        
        gerarRelatorioIR(anoSelecionado);
    });
    document.getElementById('lista-de-proventos').addEventListener('click', (e) => {
        const header = e.target.closest('th.sortable');
        if (header) {
            const key = header.dataset.key;
            if (sortConfigProventos.key === key) {
                sortConfigProventos.direction = sortConfigProventos.direction === 'ascending' ? 'descending' : 'ascending';
            } else {
                sortConfigProventos.key = key;
                sortConfigProventos.direction = 'ascending';
            }
            renderizarTabelaProventos();
        }
    });
    document.getElementById('lista-de-ativos-cadastrados').addEventListener('click', (e) => {
        const header = e.target.closest('th.sortable');
        if (header) {
            const key = header.dataset.key;
            if (sortConfigAtivos.key === key) {
                sortConfigAtivos.direction = sortConfigAtivos.direction === 'ascending' ? 'descending' : 'ascending';
            } else {
                sortConfigAtivos.key = key;
                sortConfigAtivos.direction = 'ascending'; // Padrão para nova coluna é ascendente
            }
            renderizarTabelaAtivos();
        }
    });
    document.getElementById('container-caixa-global').addEventListener('click', (e) => {
        const header = e.target.closest('.conta-header');
        if (header) {
            header.closest('.conta-coluna').classList.toggle('minimized');
        }
    });
    document.getElementById('rv-filtro-corretora').addEventListener('change', renderizarTelaRendaVariavel);
    document.getElementById('rv-filtro-data').addEventListener('change', renderizarTelaRendaVariavel);
    document.getElementById('info-buttons-rv').addEventListener('click', (e) => {
        const targetButton = e.target.closest('.info-button'); // ALTERAÇÃO AQUI
        if (!targetButton) return; // Se o clique não foi em um botão, sai da função

        const action = targetButton.dataset.action; // ALTERAÇÃO AQUI
        if (action === 'performance') {
            abrirModalPerformance('Renda Variável');
        } else if (action === 'proventos') {
            abrirModalCalendariosUnificados();
        } else if (action === 'alocacao') {
            abrirModalBalanceamento('Renda Variável');
        }
    });
    document.getElementById('calendario-geral-filtro-corretora').addEventListener('change', renderizarCalendarioGeral);
    document.getElementById('titulo-calendario-geral').addEventListener('click', abrirModalProventosAnuais);
    document.querySelectorAll('.cotacao-moeda-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const moeda = e.target.dataset.moeda;
            const valor = parseDecimal(e.target.value);
            if (moeda) {
                dadosMoedas.cotacoes[moeda] = valor;
                salvarDadosMoedas();
                if (telas.caixaGlobal.style.display === 'block') {
                    renderizarTelaCaixaGlobal(true);
                }
            }
        });
    });
    document.getElementById('negociar-aporte-valor').addEventListener('input', (e) => { dadosSimulacaoNegociar.aporteTotal = e.target.value; atualizarResumoAporte(); });
    document.getElementById('negociar-aporte-valor').addEventListener('change', (e) => { salvarDadosSimulacaoNegociar(); });
    document.getElementById('posicao-rv-container').addEventListener('click', (e) => {
        const h2Header = e.target.closest('h2.titulo-clicavel-grafico');
        if (h2Header) {
            const tipoAtivo = h2Header.dataset.tipoAtivo;
            if (tipoAtivo) {
                abrirModalGraficoCotacoesHistoricas(tipoAtivo);
            }
            return;
        }
        
        const header = e.target.closest('th.sortable');
        if (header) {
            const table = header.closest('table');
            if (!table) return;
            
            const tipoAtivo = table.dataset.tipoAtivo;
            const key = header.dataset.key;
            if (!tipoAtivo || !key) return;

            if (sortConfigRendaVariavel[tipoAtivo].key === key) {
                sortConfigRendaVariavel[tipoAtivo].direction = sortConfigRendaVariavel[tipoAtivo].direction === 'ascending' ? 'descending' : 'ascending';
            } else {
                sortConfigRendaVariavel[tipoAtivo].key = key;
                sortConfigRendaVariavel[tipoAtivo].direction = 'ascending';
            }
            renderizarTelaRendaVariavel();
            return;
        }

        const btnExcluirAtivoPlanejado = e.target.closest('.excluir-ativo-planejado');
        if (btnExcluirAtivoPlanejado) {
            e.stopPropagation(); 
            const ticker = btnExcluirAtivoPlanejado.dataset.ticker;
            
            if (confirm(`Tem certeza de que deseja remover o ativo "${ticker}" da sua alocação planejada?`)) {
                delete dadosAlocacao.ativos[ticker]; 

                if (currentUser) {
                    const { doc, updateDoc, deleteField } = window.dbFunctions;
                    const userDocRef = doc(window.db, 'carteiras', currentUser.uid);
                    const campoParaDeletar = `dadosAlocacao.ativos.${ticker}`;
                    
                    updateDoc(userDocRef, { [campoParaDeletar]: deleteField() })
                        .then(() => {
                            console.log(`Ativo planejado ${ticker} removido com sucesso do Firestore.`);
                            renderizarTelaRendaVariavel();
                        })
                        .catch(error => {
                            console.error("Erro ao remover ativo planejado do Firestore:", error);
                            dadosAlocacao.ativos[ticker] = 0; 
                            alert("Ocorreu um erro ao sincronizar a remoção com a nuvem.");
                        });
                } else {
                    salvarDadosAlocacao();
                    renderizarTelaRendaVariavel();
                }
            }
            return;
        }

        const ativoRow = e.target.closest('.ativo-row-clickable');
        if (ativoRow) {
            const tr = ativoRow.closest('tr');
            const ticker = tr.dataset.ticker;
            if (ticker) {
                const precoMedio = parseDecimal(tr.cells[2].textContent);
                const precoAtual = parseDecimal(tr.cells[3].textContent);
                abrirModalResumoDividendos(ticker, precoMedio, precoAtual);
            }
            return;
        }
    });
    document.querySelectorAll('#ir-tabela-fiis, #ir-tabela-acoes, #ir-tabela-etfs, #ir-tabela-daytrade').forEach(tableContainer => {
        tableContainer.addEventListener('blur', (e) => {
            const target = e.target;
            if (target.classList.contains('editable-result')) {
                const chaveAjuste = target.dataset.chaveAjuste;
                const resultadoCalculado = parseFloat(target.dataset.resultadoCalculado);
                const novoValorExibido = parseDecimal(target.textContent);

                const ajusteNecessario = novoValorExibido - resultadoCalculado;

                const index = todosOsAjustesIR.findIndex(a => a.chave === chaveAjuste);
                if (ajusteNecessario !== 0) {
                    if (index > -1) {
                        todosOsAjustesIR[index].valor = ajusteNecessario;
                    } else {
                        todosOsAjustesIR.push({ chave: chaveAjuste, valor: ajusteNecessario });
                    }
                } else {
                    if (index > -1) {
                        todosOsAjustesIR.splice(index, 1);
                    }
                }
                salvarAjustesIR();
                renderizarCalculadoraIR();
            }
        }, true);
    });
    
    document.getElementById('btn-add-5-linhas-posicao').addEventListener('click', () => {
        const tbody = document.getElementById('tabela-posicao-massa-body');
        for (let i = 0; i < 5; i++) {
            tbody.appendChild(gerarLinhaPosicaoMassaHTML());
        }
    });

    document.getElementById('btn-salvar-posicao-massa').addEventListener('click', salvarPosicoesEmMassa);

    document.getElementById('btn-voltar-lista-posicao').addEventListener('click', () => {
        mostrarTela('posicaoInicial');
        renderizarTabelaPosicaoInicial();
    });

    document.getElementById('btn-edicao-rapida-ativos').addEventListener('click', () => {
        isAtivosEditMode = true;
        document.getElementById('botoes-ativos-padrao').style.display = 'none';
        document.getElementById('botoes-ativos-edicao').style.display = 'flex';
        renderizarTabelaAtivos();
    });

    document.getElementById('btn-cancelar-edicao-rapida-ativos').addEventListener('click', () => {
        isAtivosEditMode = false;
        document.getElementById('botoes-ativos-padrao').style.display = 'flex';
        document.getElementById('botoes-ativos-edicao').style.display = 'none';
        renderizarTabelaAtivos();
    });

    document.getElementById('btn-salvar-edicao-rapida-ativos').addEventListener('click', () => {
        const rows = document.querySelectorAll('#tabela-ativos-body tr');
        rows.forEach(row => {
            const id = parseFloat(row.dataset.id);
            const ativo = todosOsAtivos.find(a => a.id === id);
            if (ativo) {
                row.querySelectorAll('.edit-field').forEach(input => {
                    const field = input.dataset.field;
                    let value = input.value;
                    if (field === 'ticker') value = value.toUpperCase();
                    if (field === 'cnpj') value = value.replace(/\D/g, '');
                    if (field === 'metaYieldBazin') {
                        value = parseDecimal(value) / 100;
                        if(ativo.tipo !== 'Ação') return;
                    }
                    ativo[field] = value;
                });
            }
        });
        salvarAtivos();
        isAtivosEditMode = false;
        document.getElementById('botoes-ativos-padrao').style.display = 'flex';
        document.getElementById('botoes-ativos-edicao').style.display = 'none';
        renderizarTabelaAtivos();
        alert('Alterações salvas com sucesso!');
    });
    document.getElementById('btn-edicao-rapida-proventos').addEventListener('click', () => {
        isProventosEditMode = true;
        document.getElementById('botoes-proventos-padrao').style.display = 'none';
        document.getElementById('botoes-proventos-edicao').style.display = 'flex';
        renderizarTabelaProventos();
    });

    document.getElementById('btn-cancelar-edicao-rapida-proventos').addEventListener('click', () => {
        isProventosEditMode = false;
        document.getElementById('botoes-proventos-padrao').style.display = 'flex';
        document.getElementById('botoes-proventos-edicao').style.display = 'none';
        renderizarTabelaProventos();
    });

    document.getElementById('btn-salvar-edicao-rapida-proventos').addEventListener('click', () => {
        const rows = document.querySelectorAll('#lista-de-proventos tbody tr');
        rows.forEach(row => {
            const id = parseFloat(row.dataset.id);
            const provento = todosOsProventos.find(p => p.id === id);
            if (provento) {
                row.querySelectorAll('.edit-field').forEach(input => {
                    const field = input.dataset.field;
                    let value = input.value;
                    if (field === 'ticker') value = value.toUpperCase();
                    if (field === 'valorIndividual') value = parseDecimal(value);
                    
                    // --- INÍCIO DA ALTERAÇÃO ---
                    // Garante que a edição rápida atualize o valor líquido, mas também recalcule o bruto
                    if (field === 'valorIndividual') {
                        const aliquotaIR = (provento.percentualIR || 0) / 100;
                        const valorLiquido = parseDecimal(value);
                        provento.valorIndividual = valorLiquido;
                        provento.valorBrutoIndividual = (aliquotaIR > 0) ? valorLiquido / (1 - aliquotaIR) : valorLiquido;
                    } else {
                        provento[field] = value;
                    }
                    // --- FIM DA ALTERAÇÃO ---
                });
                const dadosCalculados = calcularDadosProvento(provento.ticker, provento.dataCom, provento.valorIndividual);
                Object.assign(provento, dadosCalculados);
                sincronizarProventoComTransacao(provento.id);
            }
        });
        salvarProventos();
        salvarMovimentacoes();
        
        // DISPARA A SINCRONIZAÇÃO SILENCIOSA
        sincronizarTodosOsRegistros(null, true);

        isProventosEditMode = false;
        document.getElementById('botoes-proventos-padrao').style.display = 'flex';
        document.getElementById('botoes-proventos-edicao').style.display = 'none';
        renderizarTabelaProventos();
        alert('Alterações salvas com sucesso!');
    });

    document.getElementById('provento-filtro-data-de').addEventListener('change', renderizarTabelaProventos);
    document.getElementById('provento-filtro-data-ate').addEventListener('change', renderizarTabelaProventos);
    document.getElementById('provento-filtro-ativo').addEventListener('input', renderizarTabelaProventos);
    document.getElementById('provento-filtro-tipo').addEventListener('change', renderizarTabelaProventos);
    document.getElementById('provento-filtro-status').addEventListener('change', renderizarTabelaProventos);
    document.getElementById('provento-filtro-posicao').addEventListener('change', renderizarTabelaProventos);
    document.getElementById('btn-adicionar-proventos-massa').addEventListener('click', () => { mostrarTela('proventosMassa'); renderizarTelaProventosMassa(); });
    const btnAddLinhasProvento = document.getElementById('btn-add-5-linhas-provento');
    if (btnAddLinhasProvento) {
        btnAddLinhasProvento.addEventListener('click', () => {
            const tbody = document.getElementById('tabela-proventos-massa-body');
            for (let i = 0; i < 5; i++) {
                tbody.appendChild(gerarLinhaProventoMassaHTML());
            }
        });
    }
    document.getElementById('btn-salvar-proventos-massa').addEventListener('click', salvarProventosEmMassa);
    document.getElementById('btn-voltar-lista-proventos').addEventListener('click', () => { mostrarTela('proventos'); renderizarTabelaProventos(); });
    document.getElementById('form-buscar-ativo-historico').addEventListener('submit', buscarAtivoParaHistorico);
    document.getElementById('btn-add-linha-historico').addEventListener('click', () => { adicionarLinhaHistorico(document.getElementById('tabela-historico-body')); });
    document.getElementById('form-salvar-historico').addEventListener('submit', salvarHistoricoAtivo);
    document.getElementById('btn-cancelar-historico').addEventListener('click', cancelarAdicaoHistorico);
    document.getElementById('transferencia-corretora-origem').addEventListener('change', (e) => {
        const corretoraOrigem = e.target.value;
        const dataTransferencia = document.getElementById('transferencia-data').value;
        if (corretoraOrigem && dataTransferencia) {
            popularAtivosParaTransferencia(corretoraOrigem, dataTransferencia);
        } else {
            document.getElementById('transferencia-ativos-container').style.display = 'none';
        }
    });
    document.getElementById('transferencia-data').addEventListener('change', (e) => {
        const corretoraOrigem = document.getElementById('transferencia-corretora-origem').value;
        const dataTransferencia = e.target.value;
        if (corretoraOrigem && dataTransferencia) {
            popularAtivosParaTransferencia(corretoraOrigem, dataTransferencia);
        } else {
            document.getElementById('transferencia-ativos-container').style.display = 'none';
        }
    });
    document.getElementById('form-transferencia-custodia').addEventListener('submit', async (e) => {
        e.preventDefault();
        const saveButton = e.target.querySelector('button[type="submit"]');
        const originalButtonText = saveButton.innerHTML;
        saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
        saveButton.disabled = true;

        try {
            const id = document.getElementById('transferencia-id').value;
            const corretoraOrigem = document.getElementById('transferencia-corretora-origem').value;
            const corretoraDestino = document.getElementById('transferencia-corretora-destino').value;
            const dataTransferencia = document.getElementById('transferencia-data').value;
            
            const transferenciaOriginal = id ? todosOsAjustes.find(a => a.id === parseFloat(id)) : null;
            const proventosOriginaisIds = new Set(transferenciaOriginal?.proventosTransferidos || []);

            const proventosSelecionadosAtualIds = new Set();
            document.querySelectorAll('#transferencia-proventos-disponiveis input[name="transfer-provento"]').forEach(checkbox => {
                if (checkbox.checked) {
                    proventosSelecionadosAtualIds.add(parseFloat(checkbox.value));
                }
            });

            const proventosParaAdicionar = [...proventosSelecionadosAtualIds].filter(id => !proventosOriginaisIds.has(id));
            const proventosParaReverter = [...proventosOriginaisIds].filter(id => !proventosSelecionadosAtualIds.has(id));
            
            let proventosModificados = false;

            for (const provId of proventosParaReverter) {
                const provento = todosOsProventos.find(p => p.id === provId);
                if (provento && provento.posicaoPorCorretora[corretoraDestino]) {
                    provento.posicaoPorCorretora[corretoraOrigem] = provento.posicaoPorCorretora[corretoraDestino];
                    delete provento.posicaoPorCorretora[corretoraDestino];
                    delete provento.pagamentoRedirecionadoManualmente;
                    proventosModificados = true;
                }
            }
            
            for (const provId of proventosParaAdicionar) {
                const provento = todosOsProventos.find(p => p.id === provId);
                if (provento && provento.posicaoPorCorretora[corretoraOrigem]) {
                    const dadosOrigem = provento.posicaoPorCorretora[corretoraOrigem];
                    if (provento.posicaoPorCorretora[corretoraDestino]) {
                        provento.posicaoPorCorretora[corretoraDestino].quantidade += dadosOrigem.quantidade;
                        provento.posicaoPorCorretora[corretoraDestino].valorRecebido += dadosOrigem.valorRecebido;
                    } else {
                        provento.posicaoPorCorretora[corretoraDestino] = dadosOrigem;
                    }
                    delete provento.posicaoPorCorretora[corretoraOrigem];
                    provento.pagamentoRedirecionadoManualmente = true;
                    proventosModificados = true;
                }
            }

            if (proventosModificados) {
                await salvarProventos();
                proventosParaAdicionar.forEach(sincronizarProventoComTransacao);
                proventosParaReverter.forEach(sincronizarProventoComTransacao);
            }

            const ativosTransferir = [];
            document.querySelectorAll('#transferencia-ativos-disponiveis input[name="transfer-ativo"]:checked').forEach(checkbox => {
                const ticker = checkbox.value;
                const quantidade = parseInt(checkbox.parentElement.querySelector('.transfer-quantidade').value, 10);
                if (quantidade > 0) ativosTransferir.push({ ticker, quantidade });
            });

            if (ativosTransferir.length === 0 && proventosSelecionadosAtualIds.size === 0) {
                alert('Selecione pelo menos um ativo ou um provento para transferir.');
                return;
            }

            const novaTransferencia = {
                id: id ? parseFloat(id) : Date.now(), tipoAjuste: 'transferencia',
                corretoraOrigem, corretoraDestino, data: dataTransferencia,
                ativosTransferidos: ativosTransferir,
                proventosTransferidos: Array.from(proventosSelecionadosAtualIds)
            };

            if (id) {
                const index = todosOsAjustes.findIndex(a => a.id === novaTransferencia.id);
                if (index > -1) todosOsAjustes[index] = novaTransferencia;
            } else {
                todosOsAjustes.push(novaTransferencia);
            }

            await salvarAjustes();
            if (proventosModificados) {
                await salvarMovimentacoes();
            }

            renderizarTabelaTransferencias();
            document.getElementById('form-transferencia-custodia').reset();
            document.getElementById('transferencia-id').value = '';
            document.getElementById('transferencia-form-titulo').textContent = 'Registrar Nova Transferência de Custódia';
            document.getElementById('transferencia-ativos-container').style.display = 'none';
            alert('Transferência registrada com sucesso!');

        } finally {
            saveButton.innerHTML = originalButtonText;
            saveButton.disabled = false;
        }
    });

    document.getElementById('form-buscar-posicao-pm').addEventListener('submit', (e) => {
        e.preventDefault();
        const data = document.getElementById('ajuste-pm-data').value;
        if (!data) return;

        const posicoesNaData = gerarPosicaoDetalhada(data);
        const ativosEmPosicao = Object.entries(posicoesNaData).filter(([_, p]) => p.quantidade > 0.000001);

        const containerAjustePM = document.getElementById('container-ajuste-pm-lista');
        const tabelaAjustePMBody = document.getElementById('tabela-ajuste-pm');
        document.getElementById('ajuste-pm-data-selecionada').textContent = new Date(data + 'T12:00:00').toLocaleDateString('pt-BR');
        tabelaAjustePMBody.innerHTML = '';

        if (ativosEmPosicao.length === 0) {
            tabelaAjustePMBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhuma posição encontrada nesta data.</td></tr>';
            containerAjustePM.style.display = 'block';
            return;
        }

        ativosEmPosicao.sort((a,b) => a[0].localeCompare(b[0])).forEach(([ticker, dados]) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${ticker}</td>
                <td class="numero">${Math.round(dados.quantidade)}</td>
                <td class="numero">${formatarPrecoMedio(dados.precoMedio)}</td>
                <td><input type="text" class="ajuste-pm-input" data-ticker="${ticker}" data-data="${data}" value="${formatarDecimalParaInput(dados.precoMedio)}"></td>
            `;
            tabelaAjustePMBody.appendChild(tr);
        });
        containerAjustePM.style.display = 'block';
    });

    document.getElementById('form-salvar-ajuste-pm').addEventListener('submit', (e) => {
        e.preventDefault();
        const inputsAjuste = document.querySelectorAll('.ajuste-pm-input');
        let ajustesSalvos = 0;

        inputsAjuste.forEach(input => {
            const ticker = input.dataset.ticker;
            const data = input.dataset.data;
            const novoPrecoMedio = parseDecimal(input.value);

            const ajusteExistenteIndex = todosOsAjustes.findIndex(a => 
                a.tipoAjuste === 'ajuste_pm' && a.ticker === ticker && a.data === data
            );

            if (novoPrecoMedio > 0) {
                if (ajusteExistenteIndex > -1) {
                    todosOsAjustes[ajusteExistenteIndex].novoPrecoMedio = novoPrecoMedio;
                } else {
                    todosOsAjustes.push({
                        id: Date.now() + Math.random(),
                        tipoAjuste: 'ajuste_pm',
                        ticker: ticker,
                        data: data,
                        novoPrecoMedio: novoPrecoMedio
                    });
                }
                ajustesSalvos++;
            } else {
                if (ajusteExistenteIndex > -1) {
                    todosOsAjustes.splice(indexExistente, 1);
                }
            }
        });
        salvarAjustes();
        alert(`${ajustesSalvos} ajuste(s) de preço médio salvo(s) com sucesso!`);
        document.getElementById('container-ajuste-pm-lista').style.display = 'none';
        document.getElementById('form-buscar-posicao-pm').reset();
    });

    document.getElementById('btn-excluir-todos-ativos').addEventListener('click', () => {
        if (confirm('Tem certeza que deseja EXCLUIR TODOS OS ATIVOS? Esta ação é irreversível.')) {
            todosOsAtivos = [];
            salvarAtivos();
            renderizarTabelaAtivos();
            alert('Todos os ativos foram excluídos.');
        }
    });
    document.getElementById('toggle-aportes-grafico').addEventListener('click', (e) => {
        const btn = e.target.closest('.chart-toggle-btn');
        if (btn && !btn.classList.contains('ativo')) {
            tipoGraficoAportes = btn.dataset.tipo;
            renderizarGraficoAportesProventos();
        }
    });
    document.getElementById('btn-excluir-todos-feriados').addEventListener('click', () => {
        if (confirm('Tem certeza que deseja EXCLUIR TODOS OS FERIADOS? Esta ação é irreversível.')) {
            todosOsFeriados = [];
            salvarFeriados();
            renderizarTabelaFeriados();
            alert('Todos os feriados foram excluídos.');
        }
    });

    document.getElementById('btn-excluir-todas-posicoes').addEventListener('click', () => {
        if (confirm('Tem certeza que deseja EXCLUIR TODAS AS POSIÇÕES INICIAIS E HISTÓRICAS? Esta ação é irreversível.')) {
            posicaoInicial = [];
            salvarPosicaoInicial();
            renderizarTabelaPosicaoInicial();
            alert('Todas as posições iniciais foram excluídas.');
        }
    });
    
    document.getElementById('btn-excluir-todos-ativos-rf').addEventListener('click', () => {
        if (confirm('Tem certeza que deseja EXCLUIR TODAS AS APLICAÇÕES DE RENDA FIXA? Esta ação é irreversível.')) {
            todosOsAtivosRF = [];
            todosOsRendimentosRealizadosRF = [];
            todosOsRendimentosRFNaoRealizados = [];
            salvarAtivosRF();
            salvarRendimentosRealizadosRF();
            salvarRendimentosRFNaoRealizados();
            renderizarTabelaAtivosRF();
            alert('Todas as aplicações de Renda Fixa foram excluídas.');
        }
    });

    document.getElementById('btn-excluir-todas-notas').addEventListener('click', () => {
        if (confirm('Tem certeza que deseja EXCLUIR TODAS AS NOTAS DE NEGOCIAÇÃO? Esta ação é irreversível.')) {
            todasAsNotas = [];
            salvarNotas();
            renderizarListaNotas();
            alert('Todas as notas de negociação foram excluídas.');
        }
    });
    document.getElementById('btn-cancelar-importacao-notas').addEventListener('click', () => {
        if (confirm('Deseja cancelar a importação de notas? Os dados não serão salvos.')) {
            mostrarTela('listaNotas');
            renderizarListaNotas();
        }
    });
    document.getElementById('btn-salvar-notas-importadas').addEventListener('click', salvarNotasImportadas);

    document.getElementById('btn-cancelar-importacao-historico').addEventListener('click', () => {
        if (confirm('Deseja cancelar a importação do histórico? Os dados não serão salvos.')) {
            mostrarTela('posicaoInicial');
            renderizarTabelaPosicaoInicial();
        }
    });
    document.getElementById('btn-salvar-historico-importado').addEventListener('click', salvarHistoricoImportado);
    document.getElementById('form-cadastro-meta').addEventListener('submit', async (e) => {
        e.preventDefault();
        const saveButton = e.target.querySelector('button[type="submit"]');
        const originalButtonText = saveButton.innerHTML;
        saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
        saveButton.disabled = true;

        try {
            const id = document.getElementById('meta-id').value;
            const tipo = document.getElementById('meta-tipo').value;
            let valorAlvo = parseDecimal(document.getElementById('meta-valor-alvo').value);
            
            if (tipo === 'posicao_ativo' || tipo === 'renda_passiva_sm') {
                valorAlvo = parseInt(valorAlvo, 10);
            }

            const meta = {
                id: id ? parseFloat(id) : Date.now(), nome: document.getElementById('meta-nome').value,
                tipo: tipo, valorAlvo: valorAlvo,
                ativoAlvo: tipo === 'posicao_ativo' ? document.getElementById('meta-ativo-alvo').value.toUpperCase() : null,
                moedaAlvo: (tipo === 'patrimonio_moeda' || tipo === 'renda_passiva_moeda') ? document.getElementById('meta-moeda-alvo').value : null,
                fonteProventos: (tipo === 'renda_passiva_moeda' || tipo === 'renda_passiva_sm') ? document.getElementById('meta-fonte-proventos').value : null
            };

            const index = todasAsMetas.findIndex(m => m.id === meta.id);
            if (index > -1) {
                todasAsMetas[index] = meta;
            } else {
                todasAsMetas.push(meta);
            }
            
            await salvarMetas();
            renderizarTelaMetas();
            if(telas.dashboard.style.display === 'block'){
                renderizarPainelResumoMetasDashboard();
            }
            fecharModal('modal-cadastro-meta');

        } finally {
            saveButton.innerHTML = originalButtonText;
            saveButton.disabled = false;
        }
    });
    document.getElementById('meta-tipo').addEventListener('change', e => {
        const tipo = e.target.value;
        const isPosicaoAtivo = tipo === 'posicao_ativo';
        const isPatrimonioMoeda = tipo === 'patrimonio_moeda';
        const isRendaPassivaMoeda = tipo === 'renda_passiva_moeda';
        const isRendaPassivaSM = tipo === 'renda_passiva_sm';

        // Controla a visibilidade dos campos extras
        document.getElementById('meta-ativo-alvo-group').style.display = isPosicaoAtivo ? 'block' : 'none';
        document.getElementById('meta-moeda-group').style.display = (isPatrimonioMoeda || isRendaPassivaMoeda) ? 'block' : 'none';
        document.getElementById('meta-fonte-proventos-group').style.display = (isRendaPassivaMoeda || isRendaPassivaSM) ? 'block' : 'none';

        // Controla o texto da etiqueta (label) e o placeholder do valor alvo
        const labelPadrao = document.getElementById('meta-label-alvo-padrao');
        const labelSM = document.getElementById('meta-label-alvo-sm');
        const valorAlvoInput = document.getElementById('meta-valor-alvo');

        if (isRendaPassivaSM) {
            labelPadrao.style.display = 'none';
            labelSM.style.display = 'block';
            valorAlvoInput.placeholder = 'Ex: 2';
        } else {
            labelPadrao.style.display = 'block';
            labelSM.style.display = 'none';
            valorAlvoInput.placeholder = isPosicaoAtivo ? 'Ex: 100' : 'Ex: 10000,00';
            labelPadrao.textContent = isPosicaoAtivo ? 'Quantidade Alvo' : 'Valor Alvo';
        }
    });
    document.getElementById('container-metas').addEventListener('click', e => {
        const editBtn = e.target.closest('.acao-btn.edit');
        const deleteBtn = e.target.closest('.acao-btn.delete');
        if (editBtn) {
            const metaId = parseFloat(editBtn.dataset.metaId);
            const meta = todasAsMetas.find(m => m.id === metaId);
            if (meta) abrirModalCadastroMeta(meta);
        }
        if (deleteBtn) {
            const metaId = parseFloat(deleteBtn.dataset.metaId);
            deletarMeta(metaId);
        }
    });
    document.getElementById('form-correcao-contas-sem-moeda').addEventListener('submit', salvarCorrecaoContasSemMoeda);
    document.body.addEventListener('change', e => {
        if (e.target.classList.contains('conta-correcao-moeda')) {
            const contaId = e.target.dataset.contaId;
            const detalhesContainer = document.getElementById(`detalhes-brl-${contaId}`);
            if (detalhesContainer) {
                detalhesContainer.style.display = e.target.value === 'BRL' ? 'block' : 'none';
            }
        }
    });
    document.getElementById('conta-moeda').addEventListener('change', (e) => {
        const moeda = e.target.value;
        const isBRL = moeda === 'BRL';
        document.getElementById('container-detalhes-brl').style.display = isBRL ? 'block' : 'none';
        document.getElementById('container-nome-ativo-moeda').style.display = isBRL ? 'none' : 'block';
        document.getElementById('label-saldo-inicial').textContent = `Saldo Inicial (${moeda})`;
        document.getElementById('conta-banco').required = isBRL;
        document.getElementById('conta-tipo').required = isBRL;
        document.getElementById('conta-nome-ativo').required = !isBRL;
    });
    document.getElementById('btn-baixar-cotacoes-link').addEventListener('click', () => {
        if (urlCotacoesCSV && urlCotacoesCSV.startsWith('http')) {
            window.open(urlCotacoesCSV, '_blank');
        } else {
            alert('A URL da planilha de cotações não está configurada. Por favor, configure na caixa de texto acima e salve antes de baixar.');
        }
    });
    renderizarInfoAtualizacaoMercado();
    popularFiltrosCorretora();
    const hojeISO = new Date().toISOString().split('T')[0];
    document.querySelectorAll('.date-filter').forEach(input => input.value = hojeISO);
    document.getElementById('config-link-acoes').value = linksExternos.acoes;
    document.getElementById('config-link-fiis').value = linksExternos.fiis;
    document.getElementById('config-link-etfs').value = linksExternos.etfs;
    renderizarDashboard();
    mostrarTela('dashboard');

    document.getElementById('config-salario-minimo').addEventListener('change', (e) => {
        salarioMinimo = parseDecimal(e.target.value);
        salvarSalarioMinimo();
        // Se a tela de metas estiver visível, atualiza-a para refletir o novo valor
        if (telas.metas.style.display === 'block') {
            renderizarTelaMetas();
        }
    });
    document.getElementById('config-user-name').addEventListener('change', (e) => {
        userName = e.target.value.trim();
        salvarUserName();
    });
    document.getElementById('snapshot-currency-filter').addEventListener('change', renderizarTelaHistoricoSnapshots);
    document.getElementById('config-link-acoes').addEventListener('change', (e) => { linksExternos.acoes = e.target.value.trim(); salvarLinksExternos(); });
    document.getElementById('config-link-fiis').addEventListener('change', (e) => { linksExternos.fiis = e.target.value.trim(); salvarLinksExternos(); });
    document.getElementById('config-link-etfs').addEventListener('change', (e) => { linksExternos.etfs = e.target.value.trim(); salvarLinksExternos(); });
    if(document.getElementById('filtro-nota-ativo')) {
        document.getElementById('filtro-nota-ativo').addEventListener('input', renderizarListaNotas);
    }
    document.getElementById('performance-filtro-tipo').addEventListener('change', renderizarTelaPerformanceRV);
    document.getElementById('performance-filtro-periodo').addEventListener('change', renderizarTelaPerformanceRV); // ADICIONE ESTA LINHA
    
    document.getElementById('container-tabela-performance').addEventListener('click', (e) => {
        const header = e.target.closest('th.sortable');
        const row = e.target.closest('tr.row-clickable');

        if (header) {
            // Lógica de Ordenação
            const key = header.dataset.key;
            if (sortConfigPerformanceRV.key === key) {
                sortConfigPerformanceRV.direction = sortConfigPerformanceRV.direction === 'ascending' ? 'descending' : 'ascending';
            } else {
                sortConfigPerformanceRV.key = key;
                sortConfigPerformanceRV.direction = 'descending';
            }
            renderizarTelaPerformanceRV();

        } else if (row) {
            // Lógica de Abrir Modal
            const ticker = row.dataset.ticker;
            const custoTotal = parseFloat(row.dataset.custoTotal);
            const proventos = parseFloat(row.dataset.proventos);
            const realizado = parseFloat(row.dataset.realizado);
            abrirModalGraficoBreakEven(ticker, custoTotal, proventos, realizado);
        }
    });
    document.getElementById('modal-resumo-dividendos-ativo').addEventListener('click', (e) => {
        const header = e.target.closest('th.sortable');
        if (header) {
            const key = header.dataset.key;
            const modal = header.closest('.modal');
            const ticker = modal.dataset.ticker;

            if (sortConfigModalProventos.key === key) {
                sortConfigModalProventos.direction = sortConfigModalProventos.direction === 'ascending' ? 'descending' : 'ascending';
            } else {
                sortConfigModalProventos.key = key;
                sortConfigModalProventos.direction = 'descending';
            }
            
            if (ticker) {
                abrirModalResumoDividendos(ticker); // Redesenha o modal com os dados ordenados
            }
        }
    });
    document.getElementById('container-posicao-por-corretora').addEventListener('click', (e) => {
        const header = e.target.closest('.acordeao-header');
        if (header) {
            const conteudo = header.nextElementSibling;
            if (!conteudo) return;

            const alturaConteudo = conteudo.scrollHeight;

            // Lógica para recalcular a altura dos pais
            const reajustarPais = (elemento, alturaDelta) => {
                let paiConteudo = elemento.closest('.acordeao-conteudo');
                while (paiConteudo) {
                    // Garante que o maxHeight tenha um valor numérico para o cálculo
                    const alturaAtualPai = paiConteudo.style.maxHeight ? parseInt(paiConteudo.style.maxHeight, 10) : 0;
                    paiConteudo.style.maxHeight = (alturaAtualPai + alturaDelta) + 'px';
                    paiConteudo = paiConteudo.parentElement.closest('.acordeao-conteudo');
                }
            };

            // Verifica se o acordeão está aberto para decidir se vai abrir ou fechar
            const estaAberto = header.classList.contains('ativo');

            if (estaAberto) {
                // Fechando
                reajustarPais(conteudo, -alturaConteudo);
                conteudo.style.maxHeight = null;
            } else {
                // Abrindo
                conteudo.style.maxHeight = alturaConteudo + 'px';
                reajustarPais(conteudo, alturaConteudo);
            }
            
            header.classList.toggle('ativo');
        }
    });
    // --- INICIALIZAÇÃO OFFLINE (Substitui a lógica de autenticação) ---
    
    // Carrega os dados imediatamente ao iniciar
    carregarTodosOsDados().then(() => {
        renderizarInfoBackup();
        
        if (autoUpdateEnabled) {
            iniciarAutoUpdate();
        }

        // Configura a interface para modo logado/ativo
        mainContent.style.display = 'block';
        sidebar.style.display = 'flex';
        
        // Esconde elementos de login que não serão usados
        const loginForm = document.getElementById('sidebar-login-form');
        const userInfo = document.getElementById('user-info');
        if (loginForm) loginForm.style.display = 'none';
        if (userInfo) userInfo.style.display = 'none';

        // Remove o overlay de carregamento
        const loading = document.getElementById('loading-overlay');
        if (loading) loading.style.display = 'none';

        renderizarDashboard();
        mostrarTela('dashboard');
    });

    // Remove listener de logout pois não há sessão
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.style.display = 'none';
    }
    
    // --- FIM DA INICIALIZAÇÃO OFFLINE ---
    // --- LISTENERS DOS GRÁFICOS (CORREÇÃO DEFINITIVA) ---

    // 1. Proteção Geral: Impede que cliques nos controles fechem qualquer modal
    document.querySelectorAll('.chart-period-controls').forEach(container => {
        container.addEventListener('click', (e) => {
            e.stopPropagation(); // A mágica acontece aqui: o clique morre aqui e não fecha o modal
        });
    });

    // 2. Lógica do Modal (Minha Posição)
    const radiosPeriodoModal = document.querySelectorAll('input[name="periodo-grafico-modal"]');
    radiosPeriodoModal.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const modal = document.getElementById('modal-grafico-cotacoes');
            const tipoAtual = modal.dataset.tipoAtual || 'todos';
            const novoPeriodo = e.target.value;
            
            // Salva a preferência
            configuracoesGraficos.modalHistoricoPeriodo = novoPeriodo;
            salvarConfiguracoesGraficos();
            
            atualizarGraficoModal(tipoAtual, novoPeriodo);
        });
    });

    // 3. Lógica do Dashboard (Isso estava faltando no seu arquivo)
    const radiosPeriodoDash = document.querySelectorAll('input[name="periodo-desempenho-dash"]');
    radiosPeriodoDash.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const novoPeriodo = e.target.value;
            
            if (!configuracoesGraficos.desempenho) configuracoesGraficos.desempenho = {};
            configuracoesGraficos.desempenho.periodo = novoPeriodo;
            salvarConfiguracoesGraficos();
            
            renderizarGraficoDesempenho();
        });
    });

    // --- INÍCIO: SINCRONIZAÇÃO AUTOMÁTICA ENTRE ABAS (VERSÃO COMPLETA) ---
    window.addEventListener('storage', (event) => {
        // Verifica se a alteração foi em uma das chaves do nosso sistema
        if (event.key && event.key.startsWith('carteira_')) {
            console.log(`Sincronização entre abas acionada pela chave: ${event.key}`);

            // 1. Recarrega todos os dados do localStorage para as variáveis da aba atual
            carregarTodosOsDados();

            // 2. Encontra a tela que está visível no momento
            const visibleScreen = Object.values(telas).find(tela => tela.style.display === 'block');

            // 3. Chama a função de renderização específica para a tela visível
            if (visibleScreen) {
                switch (visibleScreen.id) {
                    // Telas Principais e Dashboards
                    case 'tela-dashboard': renderizarDashboard(); break;
                    case 'tela-renda-variavel': renderizarTelaRendaVariavel(); break;
                    case 'tela-renda-fixa': renderizarPosicaoRF(); break;
                    case 'tela-caixa-global': renderizarTelaCaixaGlobal(true); break;
                    case 'tela-metas': renderizarTelaMetas(); break;

                    // Telas de Proventos
                    case 'tela-proventos': renderizarTabelaProventos(); break;
                    case 'tela-calendario-geral': renderizarCalendarioGeral(); break;
                    case 'tela-calendario-acoes': renderizarCalendarioAcoes(); break;

                    // Telas de Cadastros e Listas
                    case 'tela-lista-notas': renderizarListaNotas(); break;
                    case 'tela-cadastro-ativos': renderizarTabelaAtivos(); break;
                    case 'tela-cadastro-contas': renderizarTabelaContas(); break;
                    case 'tela-cadastro-rf': renderizarTabelaAtivosRF(); break;
                    case 'tela-feriados': renderizarTabelaFeriados(); break;
                    case 'tela-posicao-inicial': renderizarTabelaPosicaoInicial(); break;
                    
                    // Telas de Consultas
                    case 'tela-posicao-corretora': renderizarTelaPosicaoPorCorretora(); break;
                    case 'tela-posicoes-zeradas': renderizarPosicoesZeradas(); break;
                    case 'tela-historico-movimentacao': renderizarTelaHistoricoMovimentacao(); break;
                    case 'tela-performanceRV': renderizarTelaPerformanceRV(); break;
                    // A tela 'crescimentoPatrimonial' é reativa ao submit do formulário, então uma atualização automática da tela inteira não é ideal.

                    // Telas de Ajustes
                    case 'tela-ajustes-transferencia': renderizarTabelaTransferencias(); break;
                    case 'tela-eventos-corporativos': renderizarTabelaEventosCorporativos(); break;
                    case 'tela-eventos-ativos': renderizarTelaEventosAtivos(); break;

                    // Ferramentas
                    case 'tela-calculadora-ir': renderizarCalculadoraIR(); break;
                    case 'tela-negociar': renderizarTelaNegociar(); break;
                    case 'tela-consulta-balanceamento': renderizarTelaConsultaBalanceamento(); break;
                }
            }
        }
    });
    // --- FIM: SINCRONIZAÇÃO AUTOMÁTICA ENTRE ABAS (VERSÃO COMPLETA) ---

    // --- INÍCIO: LÓGICA PARA CÁLCULO INLINE EM CAMPOS DE VALOR ---
    const handleInlineCalculation = (event) => {
        if (event.key !== 'Enter') return;

        const input = event.target;
        const expression = input.value;

        // Verifica se há operadores matemáticos
        if (!/[\+\-\*\/]/.test(expression)) return;

        event.preventDefault(); 

        try {
            // Removemos a substituição de vírgula por ponto, pois o input já deve estar com ponto
            const sanitizedExpression = expression.replace(/[^\d\.\+\-\*\/]/g, '');
            const result = new Function('return ' + sanitizedExpression)();
            
            if (isNaN(result) || !isFinite(result)) {
                throw new Error('Invalid calculation');
            }

            input.value = formatarDecimalParaInput(result);
            input.dispatchEvent(new Event('change', { bubbles: true }));

        } catch (error) {
            console.error("Inline calculation error:", error);
            alert("The entered mathematical expression is invalid.");
            input.focus(); 
        }
    };

    ['nota-custos', 'op-valor', 'edit-op-valor'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('keydown', handleInlineCalculation);
        }
    });
    // --- FIM: LÓGICA PARA CÁLCULO INLINE ---
    // Ativa a formatação de moeda para os campos de valor das notas
});















