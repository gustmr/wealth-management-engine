// Persistence, Database and Synchronisation // Persistência, Banco de Dados e Sincronização
async function registrarAlteracao() {
    // Incrementa na memória local
    alteracoesDesdeUltimoBackup++;
    
    // Atualiza visualmente na hora
    verificarStatusBackup();

    // PERSISTÊNCIA: Salva apenas o contador na nuvem (leve e rápido)
    if (currentUser) {
        try {
            const { doc, updateDoc } = window.dbFunctions;
            const userDocRef = doc(window.db, 'carteiras', currentUser.uid);
            
            // Atualiza apenas o campo específico
            await updateDoc(userDocRef, { 
                contadorAlteracoes: alteracoesDesdeUltimoBackup 
            });
        } catch (error) {
            console.error("Erro ao persistir contador de alterações:", error);
            // Não bloqueia o uso se falhar, apenas loga
        }
    } else {
        // Fallback para modo offline
        localStorage.setItem('carteira_alteracoes_pendentes', alteracoesDesdeUltimoBackup);
    }
}

function carregarContadorAlteracoes() {
    if (currentUser) {
        const local = parseInt(localStorage.getItem('carteira_alteracoes_pendentes')) || 0;
    } else {
        alteracoesDesdeUltimoBackup = parseInt(localStorage.getItem('carteira_alteracoes_pendentes')) || 0;
    }   
    verificarStatusBackup();
}
async function carregarSalarioMinimo() {
    if (currentUser) {
        const { doc, getDoc } = window.dbFunctions;
        const userDocRef = doc(window.db, 'carteiras', currentUser.uid);
        try {
            const docSnap = await getDoc(userDocRef);
            salarioMinimo = docSnap.exists() ? (docSnap.data().salarioMinimo || 1518.00) : 1518.00;
        } catch (error) {
            console.error("Erro ao carregar salário mínimo:", error);
            salarioMinimo = 1518.00;
        }
    } else {
        const data = localStorage.getItem('carteira_salario_minimo_offline');
        salarioMinimo = data ? parseFloat(data) : 1518.00;
    }
}
function limparDadosLocais() {
    console.log("Limpando dados locais (variáveis e localStorage)...");
    // Reseta todas as variáveis de estado para o padrão inicial
    todosOsAtivos = []; todasAsNotas = []; posicaoInicial = []; todosOsAjustes = [];
    todosOsProventos = []; todasAsContas = []; todosOsFeriados = []; todosOsAjustesIR = [];
    todosOsAtivosRF = []; todosOsRendimentosRealizadosRF = []; todosOsRendimentosRFNaoRealizados = [];
    dadosMoedas = { cotacoes: {} }; todosOsAtivosMoedas = []; todasAsMovimentacoes = [];
    todasAsTransacoesRecorrentes = []; dadosAlocacao = { categorias: {}, ativos: {} };
    dadosSimulacaoNegociar = { fiis: {}, acoes: {}, aporteTotal: '' };
    historicoCarteira = []; todasAsMetas = [];
    userName = '';

    // Remove todos os itens do localStorage relacionados à carteira
    Object.keys(localStorage)
        .filter(key => key.startsWith('carteira_'))
        .forEach(key => localStorage.removeItem(key));

    alteracoesDesdeUltimoBackup = 0; // Reseta o contador de alterações
}
function iniciarListenerDaCarteira() {
    if (unsubcribeFirestoreListener) {
        console.log("Listener do Firestore já está ativo. Desligando o anterior antes de iniciar um novo.");
        unsubcribeFirestoreListener();
    }

    if (currentUser) {
        const { doc, onSnapshot } = window.dbFunctions;
        const userDocRef = doc(window.db, 'carteiras', currentUser.uid);
        const loadingOverlay = document.getElementById('loading-overlay');
        
        const handleError = (error) => {
            console.error("Erro no listener do Firestore: ", error);
            if (loadingOverlay) loadingOverlay.style.display = 'none';
            alert("Erro ao sincronizar com a nuvem. Verifique sua conexão.");
        };

        unsubcribeFirestoreListener = onSnapshot(userDocRef, (docSnap) => {
            if (isNavigating) {
                console.log("Navegação em andamento, listener pausado temporariamente.");
                return;
            }
            
            console.log("Sincronização da nuvem recebida.");
            
            if (docSnap.exists()) {
                const dadosDaNuvem = docSnap.data();
        
                // --- DADOS ESTRUTURAIS ---
                todosOsAtivos = dadosDaNuvem.ativos || [];
                todasAsContas = dadosDaNuvem.contas || [];
                todosOsFeriados = dadosDaNuvem.feriados || [];
                todosOsAjustes = dadosDaNuvem.ajustes || [];
                posicaoInicial = dadosDaNuvem.posicoes || [];
                todasAsNotas = dadosDaNuvem.notas || [];
                todosOsProventos = dadosDaNuvem.proventos || [];
                todasAsMovimentacoes = dadosDaNuvem.movimentacoes || [];
                todosOsAtivosRF = dadosDaNuvem.todosOsAtivosRF || [];
                todosOsRendimentosRealizadosRF = dadosDaNuvem.todosOsRendimentosRealizadosRF || [];
                todosOsRendimentosRFNaoRealizados = dadosDaNuvem.todosOsRendimentosRFNaoRealizados || [];
                dadosMoedas = dadosDaNuvem.dadosMoedas || { cotacoes: {} };
                todosOsAtivosMoedas = dadosDaNuvem.todosOsAtivosMoedas || [];
                todasAsTransacoesRecorrentes = dadosDaNuvem.todasAsTransacoesRecorrentes || [];
                todasAsMetas = dadosDaNuvem.metas || [];
                todosOsAjustesIR = dadosDaNuvem.ajustesIR || [];
                dadosAlocacao = dadosDaNuvem.dadosAlocacao || { categorias: {}, ativos: {} };
                historicoCarteira = dadosDaNuvem.historicoCarteira || [];
                
                if(dadosDaNuvem.dadosComparacao) dadosComparacao = dadosDaNuvem.dadosComparacao;

                // --- LÓGICA DE DADOS DE MERCADO ---
                const mercadoNuvem = dadosDaNuvem.mercado || { timestamp: null, cotacoes: {}, ifix: 0, ibov: 0 };
                const tsNuvem = mercadoNuvem.timestamp ? new Date(mercadoNuvem.timestamp).getTime() : 0;
                const tsLocal = (dadosDeMercado && dadosDeMercado.timestamp) ? new Date(dadosDeMercado.timestamp).getTime() : 0;

                if (tsNuvem > tsLocal) {
                    dadosDeMercado = mercadoNuvem;
                }

                // --- CONFIGURAÇÕES E PREFERÊNCIAS (Merge Inteligente) ---
                // Padrão robusto para evitar undefined
                const padraoFiscal = {
                    aliquotaAcoes: 0.15,
                    aliquotaFiisDt: 0.20,
                    limiteIsencaoAcoes: 20000,
                    tabelaRegressivaIR: { 180: 0.225, 360: 0.200, 720: 0.175, 9999: 0.150 },
                    margemLucroModoSeguro: 0.02, 
                    margemLucroVenda: 0.10,
                    toleranciaRebalanceamento: 0.30,
                    considerarRegrasVenda: true
                };

                const dadosFiscaisNuvem = dadosDaNuvem.configuracoesFiscais || {};
                
                // MERGE: Padrão < Memória < Nuvem
                configuracoesFiscais = { ...padraoFiscal, ...configuracoesFiscais, ...dadosFiscaisNuvem };

                if (!configuracoesFiscais.pesosScore) configuracoesFiscais.pesosScore = { acoes: {}, fiis: {} };
                
                const pesosAcoesNuvem = (dadosFiscaisNuvem.pesosScore && dadosFiscaisNuvem.pesosScore.acoes) ? dadosFiscaisNuvem.pesosScore.acoes : {};
                configuracoesFiscais.pesosScore.acoes = { dy: 45, bazin: 35, payout: 5, datacom: 15, ...configuracoesFiscais.pesosScore.acoes, ...pesosAcoesNuvem };

                const pesosFiisNuvem = (dadosFiscaisNuvem.pesosScore && dadosFiscaisNuvem.pesosScore.fiis) ? dadosFiscaisNuvem.pesosScore.fiis : {};
                configuracoesFiscais.pesosScore.fiis = { dy: 60, pvp: 40, ...configuracoesFiscais.pesosScore.fiis, ...pesosFiisNuvem };

                // Legacy
                if (dadosDaNuvem.aliquotaAcoes !== undefined) configuracoesFiscais.aliquotaAcoes = Number(dadosDaNuvem.aliquotaAcoes);
                if (dadosDaNuvem.limiteIsencaoAcoes !== undefined) configuracoesFiscais.limiteIsencaoAcoes = Number(dadosDaNuvem.limiteIsencaoAcoes);
                if (dadosDaNuvem.tabelaRegressivaIR) configuracoesFiscais.tabelaRegressivaIR = dadosDaNuvem.tabelaRegressivaIR;

                if(dadosDaNuvem.configuracoesGraficos) configuracoesGraficos = dadosDaNuvem.configuracoesGraficos;
                if(dadosDaNuvem.linksExternos) linksExternos = { ...linksExternos, ...dadosDaNuvem.linksExternos };
                if(dadosDaNuvem.urlCotacoesCSV) urlCotacoesCSV = dadosDaNuvem.urlCotacoesCSV;
                if(dadosDaNuvem.dadosSimulacaoNegociar) dadosSimulacaoNegociar = dadosDaNuvem.dadosSimulacaoNegociar;
                if(dadosDaNuvem.userName) userName = dadosDaNuvem.userName;
                if(dadosDaNuvem.salarioMinimo) salarioMinimo = dadosDaNuvem.salarioMinimo;
                if(typeof dadosDaNuvem.autoUpdateEnabled !== 'undefined') autoUpdateEnabled = dadosDaNuvem.autoUpdateEnabled;
                if(dadosDaNuvem.dataInicioIntegracaoFinancas) dataInicioIntegracaoFinancas = dadosDaNuvem.dataInicioIntegracaoFinancas;
                if(dadosDaNuvem.timestampUltimoBackup) timestampUltimoBackup = dadosDaNuvem.timestampUltimoBackup;

                // =========================================================================
                // ATUALIZAÇÃO DOS INPUTS (EXECUTA SEMPRE QUE CHEGA DADO, VISÍVEL OU NÃO)
                // =========================================================================
                
                const fmt = (val) => (typeof formatarDecimal === 'function') ? formatarDecimal(val) : (val).toFixed(2).replace('.', ',');

                const inputMargemSeguro = document.getElementById('config-margem-modo-seguro');
                if(inputMargemSeguro) inputMargemSeguro.value = fmt(configuracoesFiscais.margemLucroModoSeguro * 100);

                const inputMargemVenda = document.getElementById('config-margem-venda');
                if(inputMargemVenda) inputMargemVenda.value = fmt(configuracoesFiscais.margemLucroVenda * 100);
            
                const inputTolerancia = document.getElementById('config-tolerancia-rebalanceamento');
                if(inputTolerancia) inputTolerancia.value = fmt(configuracoesFiscais.toleranciaRebalanceamento * 100);

                const inputSwing = document.getElementById('config-aliquota-swing');
                if(inputSwing) inputSwing.value = fmt(configuracoesFiscais.aliquotaAcoes * 100);
                
                const inputDayTrade = document.getElementById('config-aliquota-daytrade');
                if(inputDayTrade) inputDayTrade.value = fmt(configuracoesFiscais.aliquotaFiisDt * 100);
                
                const inputIsencao = document.getElementById('config-limite-isencao');
                if(inputIsencao) inputIsencao.value = formatarMoeda(configuracoesFiscais.limiteIsencaoAcoes).replace('R$ ', '');
                
                const inputRendFIIs = document.getElementById('config-aliquota-rend-fiis');
                if(inputRendFIIs) inputRendFIIs.value = fmt(configuracoesFiscais.aliquotaRendimentosFIIs * 100);
                
                const inputRendGeral = document.getElementById('config-aliquota-rend-geral');
                if(inputRendGeral) inputRendGeral.value = fmt(configuracoesFiscais.aliquotaRendimentosGeral * 100);
                
                const inputDivGeral = document.getElementById('config-aliquota-div-geral');
                if(inputDivGeral) inputDivGeral.value = fmt(configuracoesFiscais.aliquotaDividendosGeral * 100);
                
                const inputJCPGeral = document.getElementById('config-aliquota-jcp-geral');
                if(inputJCPGeral) inputJCPGeral.value = fmt(configuracoesFiscais.aliquotaJCPGeral * 100);
                
                const inputBonifGeral = document.getElementById('config-aliquota-bonif-geral');
                if(inputBonifGeral) inputBonifGeral.value = fmt(configuracoesFiscais.aliquotaBonificacoesGeral * 100);

                const checkRegras = document.getElementById('config-considerar-regras-venda');
                if(checkRegras) checkRegras.checked = configuracoesFiscais.considerarRegrasVenda;

                if(document.getElementById('config-link-acoes')) document.getElementById('config-link-acoes').value = linksExternos.acoes || '';
                if(document.getElementById('config-link-fiis')) document.getElementById('config-link-fiis').value = linksExternos.fiis || '';
                if(document.getElementById('config-link-etfs')) document.getElementById('config-link-etfs').value = linksExternos.etfs || '';

                if(configuracoesFiscais.pesosScore && configuracoesFiscais.pesosScore.acoes) {
                    const pAcoes = configuracoesFiscais.pesosScore.acoes;
                    if(document.getElementById('config-peso-acoes-dy')) document.getElementById('config-peso-acoes-dy').value = pAcoes.dy;
                    if(document.getElementById('config-peso-acoes-bazin')) document.getElementById('config-peso-acoes-bazin').value = pAcoes.bazin;
                    if(document.getElementById('config-peso-acoes-payout')) document.getElementById('config-peso-acoes-payout').value = pAcoes.payout;
                    if(document.getElementById('config-peso-acoes-datacom')) document.getElementById('config-peso-acoes-datacom').value = pAcoes.datacom;
                }

                if(configuracoesFiscais.pesosScore && configuracoesFiscais.pesosScore.fiis) {
                    const pFiis = configuracoesFiscais.pesosScore.fiis;
                    if(document.getElementById('config-peso-fiis-dy')) document.getElementById('config-peso-fiis-dy').value = pFiis.dy;
                    if(document.getElementById('config-peso-fiis-pvp')) document.getElementById('config-peso-fiis-pvp').value = pFiis.pvp;
                }

                const inputsRegressiva = document.querySelectorAll('.config-ir-fixa-faixa');
                if (inputsRegressiva.length > 0 && configuracoesFiscais.tabelaRegressivaIR) {
                    inputsRegressiva.forEach(input => {
                        const dias = input.getAttribute('data-faixa');
                        if (configuracoesFiscais.tabelaRegressivaIR[dias] !== undefined) {
                            input.value = fmt(configuracoesFiscais.tabelaRegressivaIR[dias] * 100);
                        }
                    });
                }
                // =========================================================================

            } else {
                console.log("Nenhum dado na nuvem. Iniciando carteira vazia.");
                todosOsAtivos = []; todasAsNotas = []; posicaoInicial = []; todosOsAjustes = [];
                todosOsProventos = []; todasAsContas = []; todosOsFeriados = []; todosOsAjustesIR = [];
                todosOsAtivosRF = []; todosOsRendimentosRealizadosRF = []; todosOsRendimentosRFNaoRealizados = [];
                dadosMoedas = { cotacoes: {} }; todosOsAtivosMoedas = []; todasAsMovimentacoes = [];
                todasAsTransacoesRecorrentes = []; dadosAlocacao = { categorias: {}, ativos: {} };
                historicoCarteira = []; todasAsMetas = [];
                dadosComparacao = null;
                dadosDeMercado = { timestamp: null, cotacoes: {}, ifix: 0, ibov: 0 };
            }

            // Normalização de datas
            todasAsContas.forEach(r => r.dataSaldoInicial = normalizarDataParaInput(r.dataSaldoInicial));
            todosOsFeriados.forEach(r => r.data = normalizarDataParaInput(r.data));
            todosOsAjustes.forEach(r => r.data = normalizarDataParaInput(r.data));
            posicaoInicial.forEach(r => r.data = normalizarDataParaInput(r.data));
            todasAsNotas.forEach(r => r.data = normalizarDataParaInput(r.data));
            todosOsProventos.forEach(r => {
                r.dataCom = normalizarDataParaInput(r.dataCom);
                r.dataPagamento = normalizarDataParaInput(r.dataPagamento);
            });
            todasAsMovimentacoes.forEach(r => r.data = normalizarDataParaInput(r.data));

            // --- GESTÃO DA ATUALIZAÇÃO AUTOMÁTICA ---
            const assinaturaAtual = todosOsAtivos.map(a => a.ticker).sort().join('|');

            if (autoUpdateEnabled) {
                if (assinaturaAtual !== ultimaAssinaturaAtivos || !autoUpdateIntervalId) {
                    console.log("Iniciando/Reiniciando atualização de cotações...");
                    if (typeof pararAutoUpdate === 'function') pararAutoUpdate();
                    iniciarAutoUpdate();
                    ultimaAssinaturaAtivos = assinaturaAtual;
                } 
            } else {
                if (typeof pararAutoUpdate === 'function') pararAutoUpdate();
            }

            // --- REDESENHA A TELA ATUAL ---
            const visibleScreen = Object.values(telas).find(tela => tela.style.display === 'block');
            
            if (visibleScreen) {
                let renderFunction = null;
                switch (visibleScreen.id) {
                    case 'tela-dashboard': renderFunction = renderizarDashboard; break;
                    case 'tela-renda-variavel': renderFunction = renderizarTelaRendaVariavel; break;
                    case 'tela-renda-fixa': renderFunction = renderizarPosicaoRF; break;
                    case 'tela-caixa-global': renderFunction = () => renderizarTelaCaixaGlobal(true); break;
                    case 'tela-proventos': renderFunction = renderizarTabelaProventos; break;
                    case 'tela-calendario-geral': renderFunction = renderizarCalendarioGeral; break;
                    case 'tela-calendario-acoes': renderFunction = renderizarCalendarioAcoes; break;
                    case 'tela-calculadora-ir': renderFunction = renderizarCalculadoraIR; break;
                    case 'tela-lista-notas': renderFunction = renderizarListaNotas; break;
                    case 'tela-cadastro-rf': renderFunction = renderizarTabelaAtivosRF; break;
                    case 'tela-cadastro-contas': renderizarTabelaContas; break;
                    case 'tela-cadastro-ativos': renderFunction = renderizarTabelaAtivos; break;
                    case 'tela-feriados': renderizarTabelaFeriados; break;
                    case 'tela-posicao-inicial': renderizarTabelaPosicaoInicial; break;
                    case 'tela-posicoes-zeradas': renderizarPosicoesZeradas; break;
                    case 'tela-consulta-balanceamento': renderFunction = renderizarTelaConsultaBalanceamento; break; 
                    case 'tela-posicao-corretora': renderizarTelaPosicaoPorCorretora; break;
                    case 'tela-historico-movimentacao': renderizarTelaHistoricoMovimentacao; break;
                    case 'tela-negociar': renderizarTelaNegociar; break;
                    case 'tela-metas': renderizarTelaMetas; break;
                    case 'tela-performanceRV': renderizarTelaPerformanceRV; break;
                    case 'tela-ajustes-transferencia': renderizarTabelaTransferencias; break;
                    case 'tela-eventos-corporativos': renderizarTabelaEventosCorporativos; break;
                    case 'tela-eventos-ativos': renderizarTelaEventosAtivos; break;
                    case 'tela-historico-snapshots': renderizarTelaHistoricoSnapshots; break; 
                }
    
                if (renderFunction) {
                    setTimeout(() => renderFunction(), 0);
                } else if (!visibleScreen || visibleScreen.id === 'tela-dashboard') {
                    renderizarDashboard();
                }
            } else {
                renderizarDashboard();
            }

            renderizarInfoBackup();
            renderizarInfoAtualizacaoMercado(); 
            atualizarIconeDeAlertasGlobal(); 
            
            if (loadingOverlay) loadingOverlay.style.display = 'none';

        }, handleError);
    }
}
async function carregarDadosDoFirestore() {
    if (!currentUser) {
        console.log("Nenhum usuário logado.");
        return null;
    }

    const { doc, getDoc } = window.dbFunctions;
    const userDocRef = doc(window.db, 'carteiras', currentUser.uid);
    
    try {
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
            const dadosNuvem = docSnap.data();
            console.log("Dados recebidos:", dadosNuvem);

            // =================================================================
            // PARTE 1: RESGATE E MERGE DOS DADOS
            // =================================================================
            
            // 1. Define o Padrão do Sistema (Igual ao LocalStorage)
            const padraoFiscal = { 
                aliquotaAcoes: 0.15, 
                aliquotaFiisDt: 0.20, 
                limiteIsencaoAcoes: 20000, 
                tabelaRegressivaIR: { 180: 0.225, 360: 0.200, 720: 0.175, 9999: 0.150 },
                margemLucroModoSeguro: 0.02,
                margemLucroVenda: 0.10
            };

            const dadosModernos = dadosNuvem.configuracoesFiscais || {};
            
            // 2. Mescla: Padrão < Global Atual < Dados da Nuvem
            // Isso garante que campos novos da nuvem sobrescrevam, mas campos faltantes usem o padrão
            Object.assign(configuracoesFiscais, padraoFiscal, configuracoesFiscais, dadosModernos);

            // Resgate manual de campos soltos antigos (Legacy Support)
            if (dadosNuvem.aliquotaAcoes !== undefined) configuracoesFiscais.aliquotaAcoes = Number(dadosNuvem.aliquotaAcoes);
            if (dadosNuvem.limiteIsencaoAcoes !== undefined) configuracoesFiscais.limiteIsencaoAcoes = Number(dadosNuvem.limiteIsencaoAcoes);
            if (dadosNuvem.tabelaRegressivaIR) configuracoesFiscais.tabelaRegressivaIR = dadosNuvem.tabelaRegressivaIR;

            // Pesos Score (Merge Profundo)
            if (!configuracoesFiscais.pesosScore) configuracoesFiscais.pesosScore = { acoes: {}, fiis: {} };
            
            const pesosAcoesNuvem = (dadosModernos.pesosScore && dadosModernos.pesosScore.acoes) ? dadosModernos.pesosScore.acoes : {};
            configuracoesFiscais.pesosScore.acoes = { dy: 45, bazin: 35, payout: 5, datacom: 15, ...configuracoesFiscais.pesosScore.acoes, ...pesosAcoesNuvem };

            const pesosFiisNuvem = (dadosModernos.pesosScore && dadosModernos.pesosScore.fiis) ? dadosModernos.pesosScore.fiis : {};
            configuracoesFiscais.pesosScore.fiis = { dy: 60, pvp: 40, ...configuracoesFiscais.pesosScore.fiis, ...pesosFiisNuvem };

            // Links e Variáveis Avulsas
            const linksModernos = dadosNuvem.linksExternos || {};
            Object.assign(linksExternos, linksModernos);
            if (dadosNuvem.linkAcoes) linksExternos.acoes = dadosNuvem.linkAcoes;

            if (dadosNuvem.salarioMinimo !== undefined) salarioMinimo = Number(dadosNuvem.salarioMinimo);
            if (dadosNuvem.dataInicioIntegracaoFinancas) dataInicioIntegracaoFinancas = dadosNuvem.dataInicioIntegracaoFinancas;
            if (dadosNuvem.urlCotacoesCSV) urlCotacoesCSV = dadosNuvem.urlCotacoesCSV;
            if (dadosNuvem.hasOwnProperty('autoUpdateEnabled')) autoUpdateEnabled = dadosNuvem.autoUpdateEnabled;

            // --- CORREÇÃO CRÍTICA: Carregamento do Histórico de Snapshots ---
            if (dadosNuvem.historicoCarteira && Array.isArray(dadosNuvem.historicoCarteira)) {
                historicoCarteira = dadosNuvem.historicoCarteira;
                // Garante ordenação cronológica para evitar erros nos gráficos
                historicoCarteira.sort((a, b) => new Date(a.data) - new Date(b.data));
                console.log(`Histórico carregado com sucesso: ${historicoCarteira.length} registros.`);
            } else {
                console.warn("Nenhum histórico de carteira encontrado na nuvem.");
            }
            // ---------------------------------------------------------------

            // =================================================================
            // PARTE 2: ATUALIZAÇÃO DOS INPUTS NA TELA
            // =================================================================
            
            const fmt = (val) => (typeof formatarDecimal === 'function') ? formatarDecimal(val) : (val).toFixed(2).replace('.', ',');

            // 1. MARGENS
            if (document.getElementById('config-margem-modo-seguro')) {
                document.getElementById('config-margem-modo-seguro').value = fmt(configuracoesFiscais.margemLucroModoSeguro * 100);
            }

            if (document.getElementById('config-margem-venda')) {
                document.getElementById('config-margem-venda').value = fmt(configuracoesFiscais.margemLucroVenda * 100);
            }
            
            if (document.getElementById('config-tolerancia-rebalanceamento')) 
                document.getElementById('config-tolerancia-rebalanceamento').value = fmt(configuracoesFiscais.toleranciaRebalanceamento * 100);

            // 2. Links
            if (document.getElementById('config-link-acoes')) document.getElementById('config-link-acoes').value = linksExternos.acoes || '';
            if (document.getElementById('config-link-fiis')) document.getElementById('config-link-fiis').value = linksExternos.fiis || '';
            if (document.getElementById('config-link-etfs')) document.getElementById('config-link-etfs').value = linksExternos.etfs || '';

            // 3. Checkbox Regras
            const checkRegras = document.getElementById('config-considerar-regras-venda');
            if (checkRegras) checkRegras.checked = configuracoesFiscais.considerarRegrasVenda;

            // 4. Pesos Score
            if (document.getElementById('config-peso-acoes-dy')) document.getElementById('config-peso-acoes-dy').value = configuracoesFiscais.pesosScore.acoes.dy;
            if (document.getElementById('config-peso-acoes-bazin')) document.getElementById('config-peso-acoes-bazin').value = configuracoesFiscais.pesosScore.acoes.bazin;
            if (document.getElementById('config-peso-acoes-payout')) document.getElementById('config-peso-acoes-payout').value = configuracoesFiscais.pesosScore.acoes.payout;
            if (document.getElementById('config-peso-acoes-datacom')) document.getElementById('config-peso-acoes-datacom').value = configuracoesFiscais.pesosScore.acoes.datacom;
            
            if (document.getElementById('config-peso-fiis-dy')) document.getElementById('config-peso-fiis-dy').value = configuracoesFiscais.pesosScore.fiis.dy;
            if (document.getElementById('config-peso-fiis-pvp')) document.getElementById('config-peso-fiis-pvp').value = configuracoesFiscais.pesosScore.fiis.pvp;

            // 5. Impostos
            if (document.getElementById('config-aliquota-swing')) document.getElementById('config-aliquota-swing').value = fmt(configuracoesFiscais.aliquotaAcoes * 100);
            if (document.getElementById('config-aliquota-daytrade')) document.getElementById('config-aliquota-daytrade').value = fmt(configuracoesFiscais.aliquotaFiisDt * 100);
            if (document.getElementById('config-limite-isencao')) document.getElementById('config-limite-isencao').value = fmt(configuracoesFiscais.limiteIsencaoAcoes);
            
            // 6. Proventos
            if (document.getElementById('config-aliquota-rend-fiis')) document.getElementById('config-aliquota-rend-fiis').value = fmt(configuracoesFiscais.aliquotaRendimentosFIIs * 100);
            if (document.getElementById('config-aliquota-jcp-geral')) document.getElementById('config-aliquota-jcp-geral').value = fmt(configuracoesFiscais.aliquotaJCPGeral * 100);
            if (document.getElementById('config-aliquota-div-geral')) document.getElementById('config-aliquota-div-geral').value = fmt(configuracoesFiscais.aliquotaDividendosGeral * 100);
            if (document.getElementById('config-aliquota-bonif-geral')) document.getElementById('config-aliquota-bonif-geral').value = fmt(configuracoesFiscais.aliquotaBonificacoesGeral * 100);
            if (document.getElementById('config-aliquota-rend-geral')) document.getElementById('config-aliquota-rend-geral').value = fmt(configuracoesFiscais.aliquotaRendimentosGeral * 100);

            // 7. Renda Fixa
            const inputsRegressiva = document.querySelectorAll('.config-ir-fixa-faixa');
            if (inputsRegressiva.length > 0 && configuracoesFiscais.tabelaRegressivaIR) {
                inputsRegressiva.forEach(input => {
                    const dias = input.getAttribute('data-faixa');
                    if (configuracoesFiscais.tabelaRegressivaIR[dias] !== undefined) {
                        input.value = fmt(configuracoesFiscais.tabelaRegressivaIR[dias] * 100);
                    }
                });
            }

            return dadosNuvem;
        } else {
            console.log("Usuário novo.");
            return {}; 
        }
    } catch (error) {
        console.error("ERRO CRÍTICO ao carregar do Firestore:", error);
        return null; 
    }
}
async function carregarLinksExternos() {
    if (currentUser) {
        const { doc, getDoc } = window.dbFunctions;
        const userDocRef = doc(window.db, 'carteiras', currentUser.uid);
        try {
            const docSnap = await getDoc(userDocRef);
            linksExternos = docSnap.exists() ? (docSnap.data().linksExternos || { acoes: '', fiis: '', etfs: '' }) : { acoes: '', fiis: '', etfs: '' };
        } catch (error) {
            console.error("Erro ao carregar links externos:", error);
            linksExternos = { acoes: '', fiis: '', etfs: '' };
        }
    } else {
        const data = localStorage.getItem('carteira_links_externos_offline');
        linksExternos = data ? JSON.parse(data) : { acoes: '', fiis: '', etfs: '' };
    }
}
async function carregarConfiguracoesGraficos() {
    const defaultConfig = { evolucao: { hidden: [] }, desempenho: { hidden: [] } };
    if (currentUser) {
        const { doc, getDoc } = window.dbFunctions;
        const userDocRef = doc(window.db, 'carteiras', currentUser.uid);
        try {
            const docSnap = await getDoc(userDocRef);
            configuracoesGraficos = docSnap.exists() ? (docSnap.data().configuracoesGraficos || defaultConfig) : defaultConfig;
        } catch (error) {
            console.error("Erro ao carregar configs de gráficos:", error);
            configuracoesGraficos = defaultConfig;
        }
    } else {
        const data = localStorage.getItem('carteira_config_graficos_offline');
        configuracoesGraficos = data ? JSON.parse(data) : defaultConfig;
    }
}
async function carregarUrlCotacoes() {
    if (currentUser) {
        const { doc, getDoc } = window.dbFunctions;
        const userDocRef = doc(window.db, 'carteiras', currentUser.uid);
        try {
            const docSnap = await getDoc(userDocRef);
            urlCotacoesCSV = docSnap.exists() ? (docSnap.data().urlCotacoesCSV || '') : '';
        } catch (error) {
            console.error("Erro ao carregar URL de cotações:", error);
            urlCotacoesCSV = '';
        }
    } else {
        urlCotacoesCSV = localStorage.getItem('carteira_url_cotacoes_csv_offline') || '';
    }
}
async function carregarConfiguracaoAutoUpdate() {
    // Tenta carregar do LocalStorage primeiro para velocidade
    const salvoOffline = localStorage.getItem('carteira_auto_update_enabled_offline');
    if (salvoOffline !== null) {
        autoUpdateEnabled = salvoOffline === 'true';
    }

    // Se tiver usuário, confirma com a nuvem em background
    if (currentUser) {
        try {
            const { doc, getDoc } = window.dbFunctions;
            const userDocRef = doc(window.db, 'carteiras', currentUser.uid);
            getDoc(userDocRef).then(docSnap => {
                if (docSnap.exists()) {
                    const nuvemEnabled = docSnap.data().autoUpdateEnabled === true;
                    // Só atualiza se for diferente para evitar re-renderizações
                    if (autoUpdateEnabled !== nuvemEnabled) {
                        autoUpdateEnabled = nuvemEnabled;
                        localStorage.setItem('carteira_auto_update_enabled_offline', autoUpdateEnabled);
                        // Reinicia o timer se mudou o estado
                        if (autoUpdateEnabled) iniciarAutoUpdate();
                        else if (autoUpdateIntervalId) clearInterval(autoUpdateIntervalId);
                    }
                }
            });
        } catch (error) {
            console.error("Erro background auto-update:", error);
        }
    }
}
function carregarHistoricoCarteira() { // Renomeado
    const data = localStorage.getItem('carteira_historico_carteira'); // Chave renomeada
    historicoCarteira = data ? JSON.parse(data) : [];
}
async function carregarAjustesIR() {
    if (currentUser) {
        const { doc, getDoc } = window.dbFunctions;
        const userDocRef = doc(window.db, 'carteiras', currentUser.uid);
        try {
            const docSnap = await getDoc(userDocRef);
            if (docSnap.exists()) {
                todosOsAjustesIR = docSnap.data().ajustesIR || [];
            } else {
                todosOsAjustesIR = [];
            }
        } catch (error) {
            console.error("Erro ao carregar ajustes de IR do Firestore:", error);
            todosOsAjustesIR = [];
        }
    } else {
        const data = localStorage.getItem('carteira_ajustes_ir_offline');
        todosOsAjustesIR = data ? JSON.parse(data) : [];
    }
}
async function carregarUserName() {
    if (currentUser) {
        const { doc, getDoc } = window.dbFunctions;
        const userDocRef = doc(window.db, 'carteiras', currentUser.uid);
        try {
            const docSnap = await getDoc(userDocRef);
            userName = docSnap.exists() ? (docSnap.data().userName || '') : '';
        } catch (error) {
            console.error("Erro ao carregar nome do usuário:", error);
            userName = '';
        }
    } else {
        userName = localStorage.getItem('carteira_user_name_offline') || '';
    }
}
async function carregarDadosComparacao() {
    if (currentUser) {
        const { doc, getDoc } = window.dbFunctions;
        const userDocRef = doc(window.db, 'carteiras', currentUser.uid);
        try {
            const docSnap = await getDoc(userDocRef);
            dadosComparacao = docSnap.exists() ? (docSnap.data().dadosComparacao || null) : null;
        } catch (error) {
            console.error("Erro ao carregar dados de comparação:", error);
            dadosComparacao = null;
        }
    } else {
        const data = localStorage.getItem('carteira_dados_comparacao_offline');
        dadosComparacao = data ? JSON.parse(data) : null;
    }
}
function carregarDadosDeMercado() {
    const data = localStorage.getItem('carteira_dados_mercado');
    // Adicionado ifix e ibov à estrutura padrão
    dadosDeMercado = data ? JSON.parse(data) : { timestamp: null, cotacoes: {}, ifix: 0, ibov: 0 };
}
async function carregarDadosSimulacaoNegociar() {
    if (currentUser) {
        const { doc, getDoc } = window.dbFunctions;
        const userDocRef = doc(window.db, 'carteiras', currentUser.uid);
        try {
            const docSnap = await getDoc(userDocRef);
            dadosSimulacaoNegociar = docSnap.exists() ? (docSnap.data().dadosSimulacaoNegociar || { fiis: {}, acoes: {}, aporteTotal: '' }) : { fiis: {}, acoes: {}, aporteTotal: '' };
        } catch (error) {
            console.error("Erro ao carregar dados de simulação:", error);
            dadosSimulacaoNegociar = { fiis: {}, acoes: {}, aporteTotal: '' };
        }
    } else {
        const data = localStorage.getItem('carteira_simulacao_negociar_offline');
        dadosSimulacaoNegociar = data ? JSON.parse(data) : { fiis: {}, acoes: {}, aporteTotal: '' };
    }
}
function salvarTimestampBackup(timestamp = null) {
    const dataParaSalvar = timestamp ? timestamp : new Date().toISOString();
    localStorage.setItem('carteira_ultimo_backup', dataParaSalvar);
    timestampUltimoBackup = dataParaSalvar;
    salvarDadosNaFonte({ timestampUltimoBackup: timestampUltimoBackup });
    renderizarInfoBackup();
}

function salvarDadosNaFonte(dadosParaSalvar) {
    // 1. Incrementa o contador na memória (variável global)
    registrarAlteracao();

    if (currentUser) {
        const { doc, setDoc } = window.dbFunctions;
        const userDocRef = doc(window.db, 'carteiras', currentUser.uid);
        
        // 2. CORREÇÃO: Cria um novo objeto contendo os dados + o contador atual
        // O "...dadosParaSalvar" copia tudo que já existia.
        const pacoteCompleto = {
            ...dadosParaSalvar, 
            contadorAlteracoes: alteracoesDesdeUltimoBackup 
        };

        // Salva tudo junto, garantindo que o contador esteja sincronizado
        return setDoc(userDocRef, pacoteCompleto, { merge: true });
    } else {
        // Modo Offline
        
        // Garante que o contador seja salvo no LocalStorage
        localStorage.setItem('carteira_alteracoes_pendentes', alteracoesDesdeUltimoBackup);

        for (const key in dadosParaSalvar) {
            const dados = dadosParaSalvar[key];
            const chaveLocalStorage = `carteira_${key.replace(/([A-Z])/g, '_$1').toLowerCase()}_offline`;
            localStorage.setItem(chaveLocalStorage, JSON.stringify(dados));
        }
        return Promise.resolve();
    }
}
function salvarDadosNaFonteSemContar(dadosParaSalvar) {
    if (currentUser) {
        const { doc, setDoc } = window.dbFunctions;
        const userDocRef = doc(window.db, 'carteiras', currentUser.uid);

        // CORREÇÃO: Mesmo sem incrementar, enviamos o valor atual do contador
        // para garantir consistência no banco de dados.
        const pacoteCompleto = {
            ...dadosParaSalvar, 
            contadorAlteracoes: alteracoesDesdeUltimoBackup 
        };

        return setDoc(userDocRef, pacoteCompleto, { merge: true });
    } else {
        // Modo Offline
        for (const key in dadosParaSalvar) {
            const dados = dadosParaSalvar[key];
            const chaveLocalStorage = `carteira_${key.replace(/([A-Z])/g, '_$1').toLowerCase()}_offline`;
            localStorage.setItem(chaveLocalStorage, JSON.stringify(dados));
        }
        return Promise.resolve();
    }
}
function salvarAtivos() { return salvarDadosNaFonte({ ativos: todosOsAtivos }); }
function salvarNotas() { return salvarDadosNaFonte({ notas: todasAsNotas }); }
function salvarPosicaoInicial() { return salvarDadosNaFonte({ posicoes: posicaoInicial }); }
function salvarAjustes() { return salvarDadosNaFonte({ ajustes: todosOsAjustes }); }
function salvarProventos() { return salvarDadosNaFonte({ proventos: todosOsProventos }); }
function salvarContas() { return salvarDadosNaFonte({ contas: todasAsContas }); }
function salvarFeriados() { return salvarDadosNaFonte({ feriados: todosOsFeriados }); }
function salvarMovimentacoes() { return salvarDadosNaFonte({ movimentacoes: todasAsMovimentacoes }); }
function salvarAjustesIR() { return salvarDadosNaFonte({ ajustesIR: todosOsAjustesIR }); }
function salvarAtivosRF() { return salvarDadosNaFonte({ todosOsAtivosRF: todosOsAtivosRF }); }
function salvarRendimentosRFNaoRealizados() { return salvarDadosNaFonte({ todosOsRendimentosRFNaoRealizados: todosOsRendimentosRFNaoRealizados }); }
function salvarDadosMoedas() { return salvarDadosNaFonteSemContar({ dadosMoedas: dadosMoedas }); }
function salvarAtivosMoedas() { return salvarDadosNaFonte({ todosOsAtivosMoedas: todosOsAtivosMoedas }); }
function salvarDadosAlocacao() { return salvarDadosNaFonte({ dadosAlocacao: dadosAlocacao }); }
function salvarHistoricoCarteira() { return salvarDadosNaFonteSemContar({ historicoCarteira: historicoCarteira }); }
function salvarTransacoesRecorrentes() { return salvarDadosNaFonte({ todasAsTransacoesRecorrentes: todasAsTransacoesRecorrentes }); }
function salvarMetas() { return salvarDadosNaFonte({ metas: todasAsMetas }); }
function salvarUserName() { return salvarDadosNaFonte({ userName: userName }); }
function salvarDadosComparacao() { return salvarDadosNaFonte({ dadosComparacao: dadosComparacao }); }
function salvarConfiguracoesGraficos() { return salvarDadosNaFonteSemContar({ configuracoesGraficos: configuracoesGraficos }); }
function salvarLinksExternos() { return salvarDadosNaFonte({ linksExternos: linksExternos }); }
function salvarSalarioMinimo() { return salvarDadosNaFonte({ salarioMinimo: salarioMinimo }); }
function salvarConfiguracaoAutoUpdate() { return salvarDadosNaFonte({ autoUpdateEnabled: autoUpdateEnabled }); }
function salvarUrlCotacoes() { return salvarDadosNaFonte({ urlCotacoesCSV: urlCotacoesCSV }); }
function salvarConfiguracoesFiscais() { return salvarDadosNaFonte({ configuracoesFiscais: configuracoesFiscais }); }
function salvarDadosSimulacaoNegociar() { return salvarDadosNaFonte({ dadosSimulacaoNegociar: dadosSimulacaoNegociar }); }
function salvarDadosDeMercado() { 
    return salvarDadosNaFonteSemContar({ mercado: dadosDeMercado }); 
}
function salvarParametroFiscalIndividualmente(e) {
    const input = e.target;
    const valorRaw = input.value;
    
    // Helper de conversão
    const getValor = (dividePor100 = true) => {
        let v;
        if (typeof parseDecimal === 'function') {
            v = parseDecimal(valorRaw);
        } else {
            v = parseFloat(valorRaw.replace(/\./g, '').replace(',', '.'));
        }
        if (isNaN(v)) return 0;
        return dividePor100 ? v / 100 : v;
    };

    // 1. CHECKBOX
    if (input.type === 'checkbox') {
        if (input.id === 'config-considerar-regras-venda') {
            configuracoesFiscais.considerarRegrasVenda = input.checked;
            salvarConfiguracoesFiscais(); 
        }
        if (typeof atualizarIconeDeAlertasGlobal === 'function') atualizarIconeDeAlertasGlobal();
        return;
    }

    // 2. LINKS EXTERNOS
    if (input.id.startsWith('config-link-')) {
        if (input.id === 'config-link-acoes') linksExternos.acoes = valorRaw;
        if (input.id === 'config-link-fiis') linksExternos.fiis = valorRaw;
        if (input.id === 'config-link-etfs') linksExternos.etfs = valorRaw;
        
        if (typeof salvarLinksExternos === 'function') {
            salvarLinksExternos();
        } else {
            if (typeof salvarDadosNaFonte === 'function') salvarDadosNaFonte({ linksExternos: linksExternos });
        }
        return;
    }

    // 3. PESOS DO SCORE
    if (input.classList.contains('input-peso-score')) {
        const valorPeso = (typeof parseDecimal === 'function') ? parseDecimal(valorRaw) : parseFloat(valorRaw);
        
        if (!configuracoesFiscais.pesosScore) configuracoesFiscais.pesosScore = { acoes: {}, fiis: {} };

        if (input.id === 'config-peso-acoes-dy') configuracoesFiscais.pesosScore.acoes.dy = valorPeso;
        if (input.id === 'config-peso-acoes-bazin') configuracoesFiscais.pesosScore.acoes.bazin = valorPeso;
        if (input.id === 'config-peso-acoes-payout') configuracoesFiscais.pesosScore.acoes.payout = valorPeso;
        
        const pAcoes = configuracoesFiscais.pesosScore.acoes;
        const somaAcoes = (pAcoes.dy || 0) + (pAcoes.bazin || 0) + (pAcoes.payout || 0);
        const restoAcoes = 100 - somaAcoes;
        configuracoesFiscais.pesosScore.acoes.datacom = restoAcoes;
        const inputRestoAcoes = document.getElementById('config-peso-acoes-datacom');
        if(inputRestoAcoes) { inputRestoAcoes.value = restoAcoes; inputRestoAcoes.style.color = restoAcoes < 0 ? 'red' : 'var(--primary-color)'; }

        if (input.id === 'config-peso-fiis-dy') configuracoesFiscais.pesosScore.fiis.dy = valorPeso;
        const pFiis = configuracoesFiscais.pesosScore.fiis;
        const somaFiis = (pFiis.dy || 0);
        const restoFiis = 100 - somaFiis;
        configuracoesFiscais.pesosScore.fiis.pvp = restoFiis;
        const inputRestoFiis = document.getElementById('config-peso-fiis-pvp');
        if(inputRestoFiis) { inputRestoFiis.value = restoFiis; inputRestoFiis.style.color = restoFiis < 0 ? 'red' : 'var(--primary-color)'; }

        salvarConfiguracoesFiscais();
        if (typeof atualizarIconeDeAlertasGlobal === 'function') atualizarIconeDeAlertasGlobal();
        return;
    }

    // 4. PARÂMETROS FISCAIS E ESTRATÉGIA
    if (input.id.startsWith('config-')) {
        const valorDecimal = (typeof parseDecimal === 'function') ? parseDecimal(valorRaw) : parseFloat(valorRaw.replace(/\./g, '').replace(',', '.'));

        switch (input.id) {
            // --- CAMPOS DE MARGEM (CRÍTICOS) ---
            case 'config-margem-modo-seguro': 
                if (valorDecimal < 0) { input.value = ''; return; }
                configuracoesFiscais.margemLucroModoSeguro = valorDecimal / 100; 
                break;

            case 'config-margem-venda': 
                if (valorDecimal <= 0) { input.value = ''; return; }
                configuracoesFiscais.margemLucroVenda = valorDecimal / 100; 
                break;

            case 'config-tolerancia-rebalanceamento': 
                if (valorDecimal <= 0) { input.value = ''; return; }
                configuracoesFiscais.toleranciaRebalanceamento = valorDecimal / 100; 
                break;

            // ... Impostos ...
            case 'config-aliquota-swing': configuracoesFiscais.aliquotaAcoes = valorDecimal / 100; break;
            case 'config-aliquota-daytrade': configuracoesFiscais.aliquotaFiisDt = valorDecimal / 100; break;
            case 'config-limite-isencao': configuracoesFiscais.limiteIsencaoAcoes = valorDecimal; break; 
            case 'config-aliquota-rend-fiis': configuracoesFiscais.aliquotaRendimentosFIIs = valorDecimal / 100; break;
            case 'config-aliquota-rend-geral': configuracoesFiscais.aliquotaRendimentosGeral = valorDecimal / 100; break;
            case 'config-aliquota-div-geral': configuracoesFiscais.aliquotaDividendosGeral = valorDecimal / 100; break;
            case 'config-aliquota-jcp-geral': configuracoesFiscais.aliquotaJCPGeral = valorDecimal / 100; break;
            case 'config-aliquota-bonif-geral': configuracoesFiscais.aliquotaBonificacoesGeral = valorDecimal / 100; break;
        }
    } else if (input.classList.contains('config-ir-fixa-faixa')) {
        const faixa = input.getAttribute('data-faixa');
        const v = (typeof parseDecimal === 'function') ? parseDecimal(valorRaw) : parseFloat(valorRaw.replace(',', '.'));
        if (faixa && configuracoesFiscais.tabelaRegressivaIR) {
            configuracoesFiscais.tabelaRegressivaIR[faixa] = v / 100;
        }
    }
    
    salvarConfiguracoesFiscais();
    if (typeof atualizarIconeDeAlertasGlobal === 'function') atualizarIconeDeAlertasGlobal();
}
// async function enviarLancamentoParaFinancas(lancamento) {
//     if (!currentUser || !idCasaAssociada || !dataInicioIntegracaoFinancas) {
//         return null; // Não faz nada e retorna nulo se não estiver apto a sincronizar
//     }
//     if (new Date(lancamento.data) < new Date(dataInicioIntegracaoFinancas)) {
//         return null; // Ignora lançamentos anteriores à data de corte
//     }

//     try {
//         const { collection, addDoc, serverTimestamp } = window.dbFunctions;
//         const lancamentosRef = collection(window.db, "Casas", idCasaAssociada, "Lancamentos");

//         const docRef = await addDoc(lancamentosRef, {
//             descricao: lancamento.descricao,
//             data: lancamento.data,
//             valor: lancamento.valor,
//             moeda: lancamento.moeda || 'BRL',
//             criadoPorUID: currentUser.uid, // <--- ADIÇÃO IMPORTANTE
//             criadoEm: new Date().toISOString(),
//             origemSistema: "investimentos",
//             tipoOrigem: lancamento.tipoOrigem,
//             idOrigem: lancamento.idOrigem
//         });
//         console.log(`Lançamento de ${lancamento.tipoOrigem} enviado para o Sistema de Finanças com ID: ${docRef.id}.`);
//         return docRef.id; // <--- RETORNO IMPORTANTE
//     } catch (error) {
//         console.error("Erro ao enviar lançamento para o Sistema de Finanças da Casa:", error);
//         return null; // Retorna nulo em caso de erro
//     }
// }
// async function sincronizarAlteracoesComFinancas(dataFiltro = null) {
//     if (!currentUser || !idCasaAssociada || !dataInicioIntegracaoFinancas) {
//         console.log("Sincronização externa abortada: sem usuário, casa ou data de integração.");
//         return;
//     }

//     console.log(`Iniciando sincronização inteligente com Finanças da Casa a partir de ${dataFiltro || 'todo o período'}.`);
    
//     const dataEfetivaInicio = dataFiltro ? (dataFiltro > dataInicioIntegracaoFinancas ? dataFiltro : dataInicioIntegracaoFinancas) : dataInicioIntegracaoFinancas;

//     const { collection, query, where, getDocs, doc, setDoc, deleteDoc, writeBatch } = window.dbFunctions;
//     const lancamentosRef = collection(window.db, "Casas", idCasaAssociada, "Lancamentos");
    
//     const q = query(lancamentosRef, 
//         where("origemSistema", "==", "investimentos"), 
//         where("criadoPorUID", "==", currentUser.uid),
//         where("data", ">=", dataEfetivaInicio)
//     );
//     const querySnapshot = await getDocs(q);

//     const lancamentosRemotosMap = new Map();
//     const lancamentosRemotosPorOrigemMap = new Map();
//     querySnapshot.forEach(doc => {
//         const data = doc.data();
//         lancamentosRemotosMap.set(doc.id, data);
//         if (data.tipoOrigem && data.idOrigem) {
//             const tipoOrigemNormalizado = data.tipoOrigem === 'provento_editado' ? 'provento' : data.tipoOrigem;
//             const chaveOrigem = `${tipoOrigemNormalizado}_${data.idOrigem}`;
//             if (!lancamentosRemotosPorOrigemMap.has(chaveOrigem)) {
//                 lancamentosRemotosPorOrigemMap.set(chaveOrigem, []);
//             }
//             lancamentosRemotosPorOrigemMap.get(chaveOrigem).push({ id: doc.id, ...data });
//         }
//     });

//     const movimentacoesElegiveis = todasAsMovimentacoes.filter(mov => {
//         return mov.enviarParaFinancas === true && mov.data >= dataEfetivaInicio;
//     });
    
//     const idsRemotosProcessados = new Set();
//     let alteracoesLocaisFeitas = false; // Flag para salvar alterações locais

//     for (const mov of movimentacoesElegiveis) {
//         let tipoOrigem;
//         switch(mov.source) {
//             case 'recorrente_confirmada': tipoOrigem = 'recorrente'; break;
//             case 'nota': tipoOrigem = mov.valor < 0 ? 'aporte_rv' : 'resgate_rv'; break;
//             case 'provento_editado': case 'provento': tipoOrigem = 'provento'; break;
//             default: tipoOrigem = mov.source;
//         }

//         const idOrigem = mov.sourceId || mov.id;
//         const dadosParaSalvar = {
//             descricao: `⇄ ${mov.descricao}`, data: mov.data, valor: mov.valor, moeda: mov.moeda,
//             criadoPorUID: currentUser.uid, origemSistema: "investimentos", tipoOrigem: tipoOrigem, idOrigem: idOrigem
//         };

//         let idRemotoEncontrado = mov.idLancamentoCasa;
        
//         if (!idRemotoEncontrado) {
//             const chaveOrigem = `${tipoOrigem}_${idOrigem}`;
//             const candidatos = lancamentosRemotosPorOrigemMap.get(chaveOrigem);
//             if (candidatos) {
//                 // --- INÍCIO DA CORREÇÃO (BUG 2: DUPLICIDADE NOTAS/PROVENTOS) ---
//                 // Lógica de correspondência robusta:
//                 // Encontra um par remoto APENAS pela chave de origem (sem verificar valor/data)
//                 // Pega o primeiro que ainda não foi "reivindicado" por outro lançamento local.
//                 const match = candidatos.find(c => !idsRemotosProcessados.has(c.id));
//                 if (match) {
//                     idRemotoEncontrado = match.id;
//                 }
//                 // --- FIM DA CORREÇÃO (BUG 2) ---
//             }
//         }

//         if (idRemotoEncontrado && lancamentosRemotosMap.has(idRemotoEncontrado)) {
//             // Caminho de ATUALIZAÇÃO
//             const docRef = doc(window.db, "Casas", idCasaAssociada, "Lancamentos", idRemotoEncontrado);
//             await setDoc(docRef, dadosParaSalvar, { merge: true });
            
//             // --- INÍCIO DA CORREÇÃO (BUG 1: DUPLICIDADE MANUAIS) ---
//             // Rastreia se o ID local precisa ser atualizado
//             if (mov.idLancamentoCasa !== idRemotoEncontrado) {
//                 mov.idLancamentoCasa = idRemotoEncontrado;
//                 alteracoesLocaisFeitas = true;
//             }
//             // --- FIM DA CORREÇÃO (BUG 1) ---
//             idsRemotosProcessados.add(idRemotoEncontrado);

//         } else {
//             // Caminho de CRIAÇÃO
//             const novoId = await enviarLancamentoParaFinancas(dadosParaSalvar);
//             if (novoId) {
//                 // --- INÍCIO DA CORREÇÃO (BUG 1) ---
//                 // Rastreia a adição do novo ID
//                 mov.idLancamentoCasa = novoId;
//                 alteracoesLocaisFeitas = true;
//                 // --- FIM DA CORREÇÃO (BUG 1) ---
//                 idsRemotosProcessados.add(novoId);
//             }
//         }
//     }

//     // Deleta lançamentos remotos que não estão mais marcados como 'elegíveis'
//     const batch = writeBatch(window.db);
//     let exclusoes = 0;
//     for (const idRemoto of lancamentosRemotosMap.keys()) {
//         if (!idsRemotosProcessados.has(idRemoto)) {
//             const docRef = doc(window.db, "Casas", idCasaAssociada, "Lancamentos", idRemoto);
//             batch.delete(docRef);
//             exclusoes++;
//         }
//     }
//     if (exclusoes > 0) await batch.commit();

//     // Limpa o ID local de qualquer movimentação que tenha sido desmarcada (não elegível)
//     todasAsMovimentacoes.forEach(mov => {
//         const elegivel = movimentacoesElegiveis.some(e => e.id === mov.id);
//         if (!elegivel && mov.idLancamentoCasa && mov.data >= dataEfetivaInicio) {
//             // --- INÍCIO DA CORREÇÃO (BUG 1) ---
//             // Rastreia a remoção do ID (definindo como null)
//             mov.idLancamentoCasa = null;
//             alteracoesLocaisFeitas = true;
//             // --- FIM DA CORREÇÃO (BUG 1) ---
//         }
//     });

//     // --- INÍCIO DA CORREÇÃO (BUG 1) ---
//     // Se qualquer idLancamentoCasa foi alterado, salva o array `todasAsMovimentacoes`
//     if (alteracoesLocaisFeitas) {
//         await salvarMovimentacoes();
//         console.log("Sincronização: Referências de idLancamentoCasa foram atualizadas localmente.");
//     }
//     // --- FIM DA CORREÇÃO (BUG 1) ---

//     console.log("Sincronização inteligente com Finanças da Casa concluída.");
// }
// async function sincronizarFinancasComCarteira() {
//     if (!currentUser || !idCasaAssociada) {
//         alert("Você precisa estar logado e associado a uma casa para sincronizar os dados.");
//         return;
//     }

//     if (!confirm("Esta ação irá apagar e recriar todos os SEUS lançamentos de investimentos no sistema de finanças da casa a partir da data de integração. Deseja continuar?")) {
//         return;
//     }
    
//     const loadingOverlay = document.getElementById('loading-overlay');
//     loadingOverlay.style.display = 'flex';

//     try {
//         // --- INÍCIO DA CORREÇÃO ---
//         // Etapa de Saneamento com a lista de tipos corrigida
//         let alteracoesSaneamento = 0;
//         todasAsMovimentacoes.forEach(mov => {
//             const deveSincronizarPorRegra = ['nota', 'provento', 'provento_editado', 'aporte_rf', 'resgate_rf'].includes(mov.source);
//             if (deveSincronizarPorRegra && mov.enviarParaFinancas !== true) {
//                 mov.enviarParaFinancas = true;
//                 alteracoesSaneamento++;
//             }
//         });
//         if (alteracoesSaneamento > 0) {
//             console.log(`Saneamento: ${alteracoesSaneamento} movimentações foram marcadas para sincronização para corrigir o histórico.`);
//             await salvarMovimentacoes(); // Garante que as alterações sejam salvas antes de prosseguir
//         }
//         // --- FIM DA CORREÇÃO ---

//         const { collection, query, where, getDocs, writeBatch } = window.dbFunctions;
//         const lancamentosRef = collection(window.db, "Casas", idCasaAssociada, "Lancamentos");
        
//         console.log("Sincronização: Apagando lançamentos antigos...");
//         const q = query(lancamentosRef, where("origemSistema", "==", "investimentos"), where("criadoPorUID", "==", currentUser.uid));
//         const querySnapshot = await getDocs(q);
        
//         if (!querySnapshot.empty) {
//             const batch = writeBatch(window.db);
//             querySnapshot.forEach((doc) => {
//                 batch.delete(doc.ref);
//             });
//             await batch.commit();
//             console.log(`${querySnapshot.size} lançamento(s) antigo(s) DESTE USUÁRIO foram removidos.`);
//         }

//         console.log("Sincronização: Recriando base de movimentações locais e reenviando...");
        
//         todasAsMovimentacoes.forEach(mov => { mov.idLancamentoCasa = null; });
//         // A lógica de recriação de notas e proventos já define o estado correto de 'enviarParaFinancas', então a confiança é total.
//         todasAsMovimentacoes = todasAsMovimentacoes.filter(t => t.source !== 'nota' && t.source !== 'provento');

//         for (const nota of todasAsNotas) {
//             await sincronizarNotaComTransacao(nota.id);
//         }
//         for (const provento of todosOsProventos) {
//             await sincronizarProventoComTransacao(provento.id);
//         }
        
//         let contador = 0;
//         for (const mov of todasAsMovimentacoes) {
//             const isDateValid = dataInicioIntegracaoFinancas && new Date(mov.data) >= new Date(dataInicioIntegracaoFinancas);
//             const deveEnviar = mov.enviarParaFinancas === true;

//             if (isDateValid && deveEnviar) {
//                 let moedaCorreta = 'BRL';
//                 if (mov.tipoAlvo === 'conta') {
//                     const conta = todasAsContas.find(c => String(c.id) === String(mov.idAlvo));
//                     moedaCorreta = conta?.moeda || 'BRL';
//                 } else if (mov.tipoAlvo === 'moeda') {
//                     const ativoMoeda = todosOsAtivosMoedas.find(a => String(a.id) === String(mov.idAlvo));
//                     moedaCorreta = ativoMoeda?.moeda || 'N/D';
//                 }
//                 mov.moeda = moedaCorreta;

//                 let tipoOrigem;
//                 switch(mov.source) {
//                     case 'recorrente_confirmada': tipoOrigem = 'recorrente'; break;
//                     case 'nota': tipoOrigem = mov.valor < 0 ? 'aporte_rv' : 'resgate_rv'; break;
//                     case 'provento_editado': tipoOrigem = 'provento'; break;
//                     default: tipoOrigem = mov.source;
//                 }
                
//                 const idCasa = await enviarLancamentoParaFinancas({
//                     descricao: `⇄ ${mov.descricao}`, data: mov.data, valor: mov.valor,
//                     moeda: mov.moeda, tipoOrigem: tipoOrigem, idOrigem: mov.sourceId || mov.id
//                 });

//                 if (idCasa) {
//                     mov.idLancamentoCasa = idCasa;
//                     contador++;
//                 }
//             }
//         }

//         await salvarMovimentacoes();

//         alert(`Sincronização concluída! ${contador} lançamento(s) foram (re)enviados para o Sistema de Finanças da Casa.`);

//     } catch (error) {
//         console.error("Erro CATASTRÓFICO durante a sincronização:", error);
//         alert("Ocorreu um erro grave durante a sincronização. Verifique o console.");
//     } finally {
//         loadingOverlay.style.display = 'none';
//         if (telas.caixaGlobal.style.display === 'block') {
//             renderizarTelaCaixaGlobal(true);
//         }
//     }
// }
async function sincronizarTodosOsRegistros(callback, silencioso = false) {
    // --- FUNÇÕES AUXILIARES DO TERMINAL ---
    const terminalOverlay = document.getElementById('terminal-overlay');
    const terminalOutput = document.getElementById('terminal-output');

    const abrirTerminal = () => {
        if (terminalOverlay && terminalOutput) {
            terminalOutput.innerHTML = ''; // Limpa logs anteriores
            terminalOverlay.style.display = 'flex';
        }
    };

    const fecharTerminal = () => {
        if (terminalOverlay) {
            terminalOverlay.style.display = 'none';
        }
    };

    // Função para escrever no terminal e rolar a tela
    const logTerminal = async (mensagem, tipo = 'info') => {
        if (terminalOutput) {
            const linha = document.createElement('div');
            linha.classList.add('log-line');
            linha.textContent = `> ${mensagem}`;
            
            if (tipo === 'success') linha.classList.add('log-success');
            else if (tipo === 'error') linha.classList.add('log-error');
            else if (tipo === 'warning') linha.classList.add('log-warning');
            else linha.classList.add('log-info');

            terminalOutput.appendChild(linha);
            terminalOutput.scrollTop = terminalOutput.scrollHeight;
            
            // Pequena pausa para garantir que o navegador renderize o texto
            await new Promise(r => setTimeout(r, 10)); 
        }
    };

    if (!silencioso) {
        // --- MODO MANUAL (COM TELA DE TERMINAL) ---
        
        if (!confirm("Você deseja rodar a Sincronização Interna (para recalcular proventos, notas e atualizar regras)?")) {
            return;
        }

        // INICIA O TERMINAL
        abrirTerminal();

        try {
            await logTerminal("INICIANDO SINCRONIZAÇÃO INTERNA...", 'success');
            await logTerminal("Analisando regras de recorrência...");

            const totalRecorrentesAntes = todasAsTransacoesRecorrentes.length;
            let contasPixLimpas = 0;

            todasAsTransacoesRecorrentes = todasAsTransacoesRecorrentes.filter(regra => {
                if (regra.targetType === 'conta') return todasAsContas.some(conta => String(conta.id) === String(regra.targetId));
                if (regra.targetType === 'moeda') return todosOsAtivosMoedas.some(moeda => String(moeda.id) === String(regra.targetId));
                return false;
            });
            const recorrentesRemovidas = totalRecorrentesAntes - todasAsTransacoesRecorrentes.length;
            if (recorrentesRemovidas > 0) await logTerminal(`Removidas ${recorrentesRemovidas} regras de recorrência órfãs.`, 'warning');

            await logTerminal("Verificando configurações de contas...");
            todasAsContas.forEach(conta => {
                if (conta.tipo === 'Conta Investimento' && conta.pix) {
                    conta.pix = '';
                    contasPixLimpas++;
                }
            });
            if (contasPixLimpas > 0) await logTerminal(`Removidas chaves PIX de ${contasPixLimpas} contas de investimento.`, 'warning');

            await logTerminal("Limpando movimentações virtuais antigas...");
            todasAsMovimentacoes = todasAsMovimentacoes.filter(t => t.source !== 'nota' && t.source !== 'provento');

            await logTerminal(`Recalculando e sincronizando ${todosOsProventos.length} proventos...`);
            for (const provento of todosOsProventos) {
                if (!provento.pagamentoRedirecionadoManualmente) {
                    const dadosRecalculados = calcularDadosProvento(provento.ticker, provento.dataCom, provento.valorIndividual);
                    Object.assign(provento, dadosRecalculados);
                }
                await sincronizarProventoComTransacao(provento.id);
                await logTerminal(`> Provento ${provento.ticker} (${provento.dataCom}) OK`); 
            }

            await logTerminal(`Sincronizando ${todasAsNotas.length} notas de negociação...`);
            for (const nota of todasAsNotas) {
                await sincronizarNotaComTransacao(nota.id);
                await logTerminal(`> Nota ${nota.numero} (${nota.corretora}) OK`);
            }

            await logTerminal("Verificando ativos ausentes...");
            const numeroAtivosAntes = todosOsAtivos.length;
            buscarEcadastrarAtivosAusentes(true);
            const novosAtivosEncontrados = todosOsAtivos.length - numeroAtivosAntes;
            if (novosAtivosEncontrados > 0) await logTerminal(`Cadastrados ${novosAtivosEncontrados} novos ativos automaticamente.`, 'success');
            
            await logTerminal("Salvando dados internos na nuvem...");
            
            await salvarDadosNaFonte({
                todasAsTransacoesRecorrentes, 
                contas: todasAsContas, 
                proventos: todosOsProventos, 
                movimentacoes: todasAsMovimentacoes, 
                todosOsAtivos,
                historicoCarteira
            });

            invalidarCacheInicios();

            localStorage.setItem('carteira_sync_needed', 'false');
            
            await logTerminal("------------------------------------------------");
            await logTerminal("SINCRONIZAÇÃO INTERNA CONCLUÍDA COM SUCESSO.", 'success');
            await logTerminal("Atualizando interface...");
            
            if (typeof callback === 'function') {
                callback();
            } else {
                const telaVisivel = document.querySelector('.main-content > div[style*="display: block"]');
                if(telaVisivel && telaVisivel.id === 'tela-configuracoes') {
                    verificarInconsistencias();
                }
            }

            // Aguarda um pouco para o usuário ler o final e fecha
            await new Promise(r => setTimeout(r, 2000));
            fecharTerminal();
            alert("Sincronização Finalizada com Sucesso!");

        } catch (error) {
            console.error("Erro durante a sincronização total:", error);
            await logTerminal("ERRO FATAL: " + error.message, 'error');
            alert("Ocorreu um erro durante a sincronização. Verifique o log.");
            // Não fecha o terminal automaticamente em caso de erro para permitir leitura
        }

    } else {
        // --- MODO SILENCIOSO (PÓS-SALVAMENTO) - SEM ALTERAÇÕES VISUAIS ---
        try {
            // Etapa 1: Sincronização Interna
            todasAsMovimentacoes = todasAsMovimentacoes.filter(t => t.source !== 'nota' && t.source !== 'provento');
            for (const provento of todosOsProventos) {
                if (!provento.pagamentoRedirecionadoManualmente) {
                    const dadosRecalculados = calcularDadosProvento(provento.ticker, provento.dataCom, provento.valorIndividual);
                    Object.assign(provento, dadosRecalculados);
                }
                await sincronizarProventoComTransacao(provento.id);
            }
            for (const nota of todasAsNotas) {
                await sincronizarNotaComTransacao(nota.id);
            }
            
            await salvarDadosNaFonte({ 
                proventos: todosOsProventos, 
                movimentacoes: todasAsMovimentacoes,
                historicoCarteira
            });

            invalidarCacheInicios();

            if (typeof callback === 'function') {
                callback();
            }
        } catch (error) {
            console.error("Erro durante a sincronização silenciosa:", error);
        }
    }
}
async function carregarDadosAlocacao() {
    if (currentUser) {
        const { doc, getDoc } = window.dbFunctions;
        const userDocRef = doc(window.db, 'carteiras', currentUser.uid);
        try {
            const docSnap = await getDoc(userDocRef);
            if (docSnap.exists()) {
                const userData = docSnap.data();
                dadosAlocacao = userData.dadosAlocacao || { categorias: {}, ativos: {} };
            } else {
                dadosAlocacao = { categorias: {}, ativos: {} };
            }
        } catch (error) {
            console.error("Erro ao carregar dados de alocação do Firestore:", error);
            dadosAlocacao = { categorias: {}, ativos: {} };
        }
    } else {
        const data = localStorage.getItem('carteira_dados_alocacao_offline');
        dadosAlocacao = data ? JSON.parse(data) : { categorias: {}, ativos: {} };
    }

    // Garante valor padrão para o modo de rebalanceamento se não existir
    if (!dadosAlocacao.modoRebalanceamento) {
        dadosAlocacao.modoRebalanceamento = 'categoria';
    }
}
async function sincronizarLancamentoFinancasCasa(movimentacao, intencaoDeEnviar) {
    if (!currentUser || !idCasaAssociada) {
        return movimentacao.idLancamentoCasa || null; // Retorna o ID que já tinha, se houver
    }

    const { doc, setDoc, addDoc, deleteDoc, collection, serverTimestamp } = window.dbFunctions;
    const isDateValid = dataInicioIntegracaoFinancas && new Date(movimentacao.data) >= new Date(dataInicioIntegracaoFinancas);
    const idLancamentoExistente = movimentacao.idLancamentoCasa || null;
    let tipoOrigem = 'manual';
    if (movimentacao.source === 'recorrente_confirmada') tipoOrigem = 'recorrente';

    try {
        if (intencaoDeEnviar && isDateValid) {
            // INTENÇÃO: ENVIAR (Criar ou Atualizar)
            const dadosParaEnviar = {
                descricao: `⇄ ${movimentacao.descricao}`,
                data: movimentacao.data,
                valor: movimentacao.valor,
                moeda: movimentacao.moeda || 'BRL',
                origemSistema: "investimentos",
                tipoOrigem: tipoOrigem,
                idOrigem: movimentacao.sourceId || movimentacao.id // Usa sourceId se for recorrente confirmada
            };
            if (idLancamentoExistente) {
                const docRef = doc(window.db, "Casas", idCasaAssociada, "Lancamentos", idLancamentoExistente);
                await setDoc(docRef, dadosParaEnviar, { merge: true });
                return idLancamentoExistente;
            } else {
                // CRIAR um novo vínculo
                dadosParaEnviar.criadoPorUID = currentUser.uid;
                dadosParaEnviar.criadoEm = new Date().toISOString();
                const lancamentosRef = collection(window.db, "Casas", idCasaAssociada, "Lancamentos");
                const docRef = await addDoc(lancamentosRef, dadosParaEnviar);
                return docRef.id; // Retorna o NOVO ID
            }
        } else if (idLancamentoExistente) {
            // INTENÇÃO: NÃO ENVIAR (Excluir se existir) OU Data Inválida
            const docRef = doc(window.db, "Casas", idCasaAssociada, "Lancamentos", idLancamentoExistente);
            await deleteDoc(docRef);
            return null; // Retorna null pois não há mais vínculo
        } else {
             return null; // Nenhuma ação, retorna null
        }
    } catch (error) {
        return idLancamentoExistente; 
    }
}
// async function toggleSincronizacaoFinancas(id) {
//     const movimentacaoIndex = todasAsMovimentacoes.findIndex(m => m.id === id);
//     if (movimentacaoIndex === -1) {
//         alert('Erro: Não foi possível encontrar a movimentação para sincronizar.');
//         return;
//     }

//     const movimentacao = { ...todasAsMovimentacoes[movimentacaoIndex] };
//     const podeAlternar = ['manual', 'recorrente_confirmada'].includes(movimentacao.source) || !!movimentacao.transferenciaId;

//     if (!podeAlternar) {
//         alert('Apenas lançamentos manuais, recorrentes ou transferências podem ter a sincronização alterada por aqui.');
//         return;
//     }

//     // --- INÍCIO DA CORREÇÃO ---
//     // Lógica simplificada e direta para determinar a ação
//     const estadoAtual = movimentacao.enviarParaFinancas === true;
//     const novaIntencao = !estadoAtual;
//     const acao = novaIntencao ? "INCLUIR" : "REMOVER";
//     // --- FIM DA CORREÇÃO ---

//     if (!confirm(`Deseja ${acao} este lançamento ("${movimentacao.descricao}") do sistema "Finanças da Casa"?`)) {
//         return;
//     }

//     isNavigating = true; 
//     const loadingOverlay = document.getElementById('loading-overlay');
//     loadingOverlay.style.display = 'flex';

//     let idOriginalCasa = movimentacao.idLancamentoCasa;
//     const intencaoOriginal = movimentacao.enviarParaFinancas;

//     try {
//         let moedaCorreta = 'BRL';
//         if (movimentacao.tipoAlvo === 'conta') {
//             const conta = todasAsContas.find(c => String(c.id) === String(movimentacao.idAlvo));
//             moedaCorreta = conta?.moeda || 'BRL';
//         } else if (movimentacao.tipoAlvo === 'moeda') {
//             const ativoMoeda = todosOsAtivosMoedas.find(a => String(a.id) === String(movimentacao.idAlvo));
//             moedaCorreta = ativoMoeda?.moeda || 'N/D';
//         }
//         movimentacao.moeda = moedaCorreta;

//         movimentacao.enviarParaFinancas = novaIntencao;
//         const idRetornadoFirestore = await sincronizarLancamentoFinancasCasa(movimentacao, novaIntencao);
//         movimentacao.idLancamentoCasa = idRetornadoFirestore;
        
//         todasAsMovimentacoes[movimentacaoIndex] = { ...movimentacao };
        
//         await salvarMovimentacoes();
//     } catch (error) {
//         console.error("[toggleSync] Erro ao alternar sincronização:", error);
//         alert("Ocorreu um erro ao atualizar a sincronização. Verifique o console.");
        
//         if (todasAsMovimentacoes[movimentacaoIndex]) {
//              todasAsMovimentacoes[movimentacaoIndex].enviarParaFinancas = intencaoOriginal;
//              todasAsMovimentacoes[movimentacaoIndex].idLancamentoCasa = idOriginalCasa;
//         }
//         try { await salvarMovimentacoes(); } catch (saveError) { console.error("Erro ao tentar reverter salvamento:", saveError); }

//     } finally {
//         loadingOverlay.style.display = 'none';
        
//         if (telas.caixaGlobal.style.display === 'block') {
//             renderizarTelaCaixaGlobal(true);
//         }
//         if (modalProjecaoFutura.style.display === 'block') {
//             renderizarModalProjecaoFutura();
//         }
        
//         isNavigating = false; 
//     }
// }
function salvarSnapshotCarteira(silencioso = false) {
    const hoje = new Date().toISOString().split('T')[0];
    
    const posicoesRV = gerarPosicaoDetalhada(hoje);
    
    const detalhesCarteira = {
        valorPorClasse: { 'Ações': 0, 'FIIs': 0, 'ETFs': 0, 'Renda Fixa': 0 },
        ativos: {},
        rendaFixa: []
    };

    for (const ticker in posicoesRV) {
        const posicao = posicoesRV[ticker];
        if (posicao.quantidade <= 0.000001) continue;

        const ativoInfo = todosOsAtivos.find(a => a.ticker === ticker);
        const tipoMapeado = ativoInfo ? (ativoInfo.tipo === 'Ação' ? 'Ações' : ativoInfo.tipo === 'FII' ? 'FIIs' : 'ETFs') : null;
        const cotacao = dadosDeMercado.cotacoes[ticker];
        const precoAtual = cotacao ? cotacao.valor : 0;
        const valorDeMercado = posicao.quantidade * precoAtual;

        if (tipoMapeado) {
            detalhesCarteira.valorPorClasse[tipoMapeado] += valorDeMercado;
        }

        detalhesCarteira.ativos[ticker] = {
            quantidade: posicao.quantidade,
            precoMedio: posicao.precoMedio,
            precoAtual: precoAtual,
            valorDeMercado: valorDeMercado
        };
    }

    todosOsAtivosRF.forEach(ativo => {
        if ((ativo.descricao || '').toLowerCase().includes('(inativa)')) {
            return;
        }
        const saldosNaData = calcularSaldosRFEmData(ativo, hoje);
        detalhesCarteira.valorPorClasse['Renda Fixa'] += saldosNaData.saldoLiquido;
        detalhesCarteira.rendaFixa.push({
            descricao: ativo.descricao,
            valorInvestido: saldosNaData.valorInvestido, 
            saldoLiquido: saldosNaData.saldoLiquido   
        });
    });

    let saldoTotalContas = 0;
    todasAsContas.forEach(conta => {
        saldoTotalContas += calcularSaldoEmData(conta, hoje);
    });

    let valorTotalMoedas = 0;
    const todosOsEventosCaixa = obterTodosOsEventosDeCaixa();
    const hojeStr = new Date().toISOString().split('T')[0];

    todosOsAtivosMoedas.forEach(ativo => {
        const transacoesPassadasEPresentes = todosOsEventosCaixa.filter(e =>
            e.tipo === 'moeda' &&
            String(e.idAlvo) === String(ativo.id) &&
            e.source !== 'recorrente_futura' &&
            e.data <= hojeStr
        );
        const saldoAtivoAtual = transacoesPassadasEPresentes.reduce((soma, t) => soma + arredondarMoeda(t.valor), ativo.saldoInicial);
        const cotacao = dadosMoedas.cotacoes[ativo.moeda] || 0;
        valorTotalMoedas += saldoAtivoAtual * cotacao;
    });
    
    const valorTotalInvestimentos = Object.values(detalhesCarteira.valorPorClasse).reduce((soma, v) => soma + v, 0);
    const totalProventosProvisionados = calcularTotalProventosProvisionados();
    const patrimonioTotal = valorTotalInvestimentos + saldoTotalContas + valorTotalMoedas + totalProventosProvisionados;

    const novoSnapshot = {
        data: hoje,
        patrimonioTotal: patrimonioTotal,
        valorTotalInvestimentos: valorTotalInvestimentos,
        valorTotalContas: saldoTotalContas,
        valorTotalMoedas: valorTotalMoedas,
        valorTotalProventosProvisionados: totalProventosProvisionados,
        cotacoesMoedas: {
            USD: dadosMoedas.cotacoes['USD'] || 0,
            EUR: dadosMoedas.cotacoes['EUR'] || 0,
            GBP: dadosMoedas.cotacoes['GBP'] || 0
        },
        ifix: dadosDeMercado.ifix || 0,
        ibov: dadosDeMercado.ibov || 0,
        detalhesCarteira: detalhesCarteira
    };

    const indexExistente = historicoCarteira.findIndex(s => s.data === hoje);

    if (indexExistente > -1) {
        if (!silencioso) { 
            if (confirm(`Já existe um snapshot de ${formatarMoeda(historicoCarteira[indexExistente].patrimonioTotal)} para hoje. Deseja atualizá-lo para ${formatarMoeda(novoSnapshot.patrimonioTotal)}?`)) {
                historicoCarteira[indexExistente] = novoSnapshot;
            } else {
                return; 
            }
        } else { 
            historicoCarteira[indexExistente] = novoSnapshot;
        }
    } else {
        historicoCarteira.push(novoSnapshot);
    }

    historicoCarteira.sort((a, b) => new Date(a.data) - new Date(b.data));
    
    salvarHistoricoCarteira();

    if (!silencioso) {
        const dataFormatada = new Date(hoje + 'T12:00:00').toLocaleDateString('pt-BR');
        const mensagem = `Snapshot salvo com sucesso!\n\nData: ${dataFormatada}\n-----------------------------------\nPatrimônio Total: ${formatarMoeda(novoSnapshot.patrimonioTotal)}\nTotal Investimentos: ${formatarMoeda(novoSnapshot.valorTotalInvestimentos)}\nSaldo em Contas: ${formatarMoeda(novoSnapshot.valorTotalContas)}\nSaldo em Moedas: ${formatarMoeda(novoSnapshot.valorTotalMoedas)}\nProventos a Receber: ${formatarMoeda(novoSnapshot.valorTotalProventosProvisionados)}\n-----------------------------------\nIFIX: ${formatarDecimal(novoSnapshot.ifix, 2)}\nIBOV: ${formatarDecimal(novoSnapshot.ibov, 2)}\n`;
        alert(mensagem);
    } 
    
    if (telas.dashboard.style.display === 'block') {
        renderizarDashboard();
    }
}
async function carregarTodosOsDados() {
    const dadosDaNuvem = await carregarDadosDoFirestore();

    // 1. Carrega dados brutos do banco
    todosOsAtivos = dadosDaNuvem?.ativos || [];
    todasAsContas = dadosDaNuvem?.contas || [];
    todosOsFeriados = dadosDaNuvem?.feriados || [];
    todosOsAjustes = dadosDaNuvem?.ajustes || [];
    posicaoInicial = dadosDaNuvem?.posicoes || [];
    todasAsNotas = dadosDaNuvem?.notas || [];
    todosOsProventos = dadosDaNuvem?.proventos || [];
    todasAsMovimentacoes = dadosDaNuvem?.movimentacoes || [];
    todosOsAtivosRF = dadosDaNuvem?.todosOsAtivosRF || [];
    todosOsRendimentosRealizadosRF = dadosDaNuvem?.todosOsRendimentosRealizadosRF || [];
    todosOsRendimentosRFNaoRealizados = dadosDaNuvem?.todosOsRendimentosRFNaoRealizados || [];
    dadosMoedas = dadosDaNuvem?.dadosMoedas || { cotacoes: {} };
    todosOsAtivosMoedas = dadosDaNuvem?.todosOsAtivosMoedas || [];
    todasAsTransacoesRecorrentes = dadosDaNuvem?.todasAsTransacoesRecorrentes || [];
    todasAsMetas = dadosDaNuvem?.metas || [];
    todosOsAjustesIR = dadosDaNuvem?.ajustesIR || [];
    dadosAlocacao = dadosDaNuvem?.dadosAlocacao || { categorias: {}, ativos: {} };
    historicoCarteira = dadosDaNuvem?.historicoCarteira || [];
    urlCotacoesCSV = dadosDaNuvem?.urlCotacoesCSV || '';
    configuracoesFiscais = dadosDaNuvem?.configuracoesFiscais || { aliquotaAcoes: 0.15, aliquotaFiisDt: 0.20, limiteIsencaoAcoes: 20000, tabelaRegressivaIR: { 180: 0.225, 360: 0.200, 720: 0.175, 9999: 0.150 } };
    dadosSimulacaoNegociar = dadosDaNuvem?.dadosSimulacaoNegociar || { fiis: {}, acoes: {}, aporteTotal: '' };
    userName = dadosDaNuvem?.userName || '';
    dadosComparacao = dadosDaNuvem?.dadosComparacao || null;
    configuracoesGraficos = dadosDaNuvem?.configuracoesGraficos || { evolucao: { hidden: [] }, desempenho: { hidden: [] } };
    linksExternos = dadosDaNuvem?.linksExternos || { acoes: '', fiis: '', etfs: '' };
    salarioMinimo = dadosDaNuvem?.salarioMinimo || 1518.00;
    autoUpdateEnabled = dadosDaNuvem?.autoUpdateEnabled || false;
    timestampUltimoBackup = dadosDaNuvem?.timestampUltimoBackup || null;
    alteracoesDesdeUltimoBackup = dadosDaNuvem?.contadorAlteracoes || 0;
    // dataInicioIntegracaoFinancas removida daqui.

    // 2. Normaliza Datas
    todasAsContas.forEach(r => r.dataSaldoInicial = normalizarDataParaInput(r.dataSaldoInicial));
    todosOsFeriados.forEach(r => r.data = normalizarDataParaInput(r.data));
    todosOsAjustes.forEach(r => r.data = normalizarDataParaInput(r.data));
    posicaoInicial.forEach(r => r.data = normalizarDataParaInput(r.data));
    todasAsNotas.forEach(r => r.data = normalizarDataParaInput(r.data));
    todosOsProventos.forEach(r => {
        r.dataCom = normalizarDataParaInput(r.dataCom);
        r.dataPagamento = normalizarDataParaInput(r.dataPagamento);
    });
    todasAsMovimentacoes.forEach(r => r.data = normalizarDataParaInput(r.data));

    // 3. MUDANÇA CRÍTICA: Carrega Mercado ANTES de gerar snapshot ou gráficos
    // Precisamos das cotações para que o snapshot tenha valores reais e os gráficos funcionem.
    console.log("Carregando dados de mercado...");
    if (typeof carregarDadosDeMercado === 'function') {
        try {
            await carregarDadosDeMercado(); 
        } catch (e) {
            console.warn("Erro ou timeout ao carregar dados de mercado (pode não ser async):", e);
        }
    }

    // 4. Migrações e Atualizações
    verificarEMigrarDadosNaInicializacao();

    if (autoUpdateEnabled && typeof iniciarAutoUpdate === 'function') {
        iniciarAutoUpdate();
    }

    // 5. Gera snapshot inicial (AGORA COM COTAÇÕES VÁLIDAS)
    // Se gerássemos antes do passo 3, o snapshot teria valor 0 em tudo.
    if (historicoCarteira.length === 0 && (todosOsAtivos.length > 0 || todosOsAtivosRF.length > 0)) {
        console.log("Histórico vazio detectado. Gerando snapshot inicial...");
        if (typeof salvarSnapshotCarteira === 'function') {
            await salvarSnapshotCarteira(true); // true = silencioso
        }
    }

    // 6. Renderiza Gráficos (Agora que temos dados + cotações + snapshot válido)
    console.log("Dados prontos. Renderizando Dashboard...");
    if (typeof renderizarGraficoProventos === 'function') renderizarGraficoProventos(); 
    if (typeof renderizarGraficoCarteira === 'function') renderizarGraficoCarteira();
    if (typeof renderizarGraficoAportesProventos === 'function') renderizarGraficoAportesProventos();
    
    // true força ignorar o bloqueio de tempo na inicialização
    if (typeof renderizarGraficoDesempenho === 'function') renderizarGraficoDesempenho(true);
}

async function carregarDadosDoLocalStorage() {

    const carregarItem = (chave, valorPadrao = []) => {
        const dados = localStorage.getItem(`carteira_${chave}_offline`);
        return dados ? JSON.parse(dados) : valorPadrao;
    };

    todosOsAtivos = carregarItem('ativos');
    todasAsContas = carregarItem('contas');
    todosOsFeriados = carregarItem('feriados');
    todosOsAjustes = carregarItem('ajustes');
    posicaoInicial = carregarItem('posicoes');
    todasAsNotas = carregarItem('notas');
    todosOsProventos = carregarItem('proventos');
    todasAsMovimentacoes = carregarItem('movimentacoes');
    todosOsAtivosRF = carregarItem('todos_os_ativos_r_f');
    todosOsRendimentosRealizadosRF = carregarItem('todos_os_rendimentos_realizados_r_f');
    todosOsRendimentosRFNaoRealizados = carregarItem('todos_os_rendimentos_r_f_nao_realizados');
    dadosMoedas = carregarItem('dados_moedas', { cotacoes: {} });
    todosOsAtivosMoedas = carregarItem('todos_os_ativos_moedas');
    todasAsTransacoesRecorrentes = carregarItem('todas_as_transacoes_recorrentes');
    todasAsMetas = carregarItem('metas');
    todosOsAjustesIR = carregarItem('ajustes_ir');
    dadosAlocacao = carregarItem('dados_alocacao', { categorias: {}, ativos: {} });
    historicoCarteira = carregarItem('historico_carteira');
    urlCotacoesCSV = localStorage.getItem('carteira_url_cotacoes_csv_offline') || '';

    // --- CORREÇÃO: Definição de Padrões Fiscais Robustos ---
    const padraoFiscal = {
        aliquotaAcoes: 0.15,
        aliquotaFiisDt: 0.20,
        limiteIsencaoAcoes: 20000,
        tabelaRegressivaIR: { 180: 0.225, 360: 0.200, 720: 0.175, 9999: 0.150 },
        // Novos campos (Garantia de existência)
        margemLucroModoSeguro: 0.02, 
        margemLucroVenda: 0.10,
        toleranciaRebalanceamento: 0.30,
        considerarRegrasVenda: true
    };
    
    // Carrega o que existe e mescla com o padrão (Padrão < Salvo)
    const dadosSalvos = carregarItem('configuracoes_fiscais', {});
    configuracoesFiscais = { ...padraoFiscal, ...dadosSalvos };

    dadosSimulacaoNegociar = carregarItem('dados_simulacao_negociar', { fiis: {}, acoes: {}, aporteTotal: '' });
    userName = localStorage.getItem('carteira_user_name_offline') || '';
    dadosComparacao = carregarItem('dados_comparacao', null);
    configuracoesGraficos = carregarItem('configuracoes_graficos', { evolucao: { hidden: [] }, desempenho: { hidden: [] } });
    linksExternos = carregarItem('links_externos', { acoes: '', fiis: '', etfs: '' });
    salarioMinimo = parseFloat(localStorage.getItem('carteira_salario_minimo_offline')) || 1518.00;
    autoUpdateEnabled = localStorage.getItem('carteira_auto_update_enabled_offline') === 'true';
    timestampUltimoBackup = localStorage.getItem('carteira_timestamp_ultimo_backup_offline') || null;
    alteracoesDesdeUltimoBackup = parseInt(localStorage.getItem('carteira_alteracoes_pendentes')) || 0;
    // dataInicioIntegracaoFinancas removida daqui.

    console.log("Carregando dados de mercado (Local)...");
    if (typeof carregarDadosDeMercado === 'function') {
        try { await carregarDadosDeMercado(); } catch (e) { console.warn(e); }
    }

    verificarEMigrarDadosNaInicializacao();

    if (autoUpdateEnabled && typeof iniciarAutoUpdate === 'function') {
        iniciarAutoUpdate();
    }

    if (historicoCarteira.length === 0 && (todosOsAtivos.length > 0 || todosOsAtivosRF.length > 0)) {
        console.log("Histórico vazio detectado. Gerando snapshot inicial...");
        if (typeof salvarSnapshotCarteira === 'function') {
            await salvarSnapshotCarteira(true);
        }
    }

    console.log("Dados locais prontos. Renderizando Dashboard...");
    if (typeof renderizarGraficoProventos === 'function') renderizarGraficoProventos();
    if (typeof renderizarGraficoCarteira === 'function') renderizarGraficoCarteira();
    if (typeof renderizarGraficoAportesProventos === 'function') renderizarGraficoAportesProventos();
    if (typeof renderizarGraficoDesempenho === 'function') renderizarGraficoDesempenho(true);
}