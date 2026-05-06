// Trading Simulator // Simulador de Compras
function atualizarResumoAporte() {
    // O aporte total agora pode ser negativo (ex: dinheiro da venda pagando RF)
    // ParseDecimal precisa lidar com negativos corretamente, mas geralmente remove o sinal se não for cuidadoso.
    // Como parseDecimal usa regex [^0-9,-], ele deve aceitar negativos.
    const aporteTotal = parseDecimal(document.getElementById('negociar-aporte-valor').value);

    let totalComprasFiis = 0;
    let totalVendasFiis = 0; // Novo acumulador

    for (const ticker in dadosSimulacaoNegociar.fiis) {
        const sim = dadosSimulacaoNegociar.fiis[ticker];
        if (sim.qtd && sim.preco) {
            const valorOperacao = sim.qtd * sim.preco;
            if (sim.qtd > 0) {
                totalComprasFiis += valorOperacao;
            } else {
                totalVendasFiis += Math.abs(valorOperacao); // Soma vendas
            }
        }
    }

    let totalComprasAcoes = 0;
    let totalVendasAcoes = 0; // Novo acumulador

    for (const ticker in dadosSimulacaoNegociar.acoes) {
        const sim = dadosSimulacaoNegociar.acoes[ticker];
        if (sim.qtd && sim.preco) {
            const valorOperacao = sim.qtd * sim.preco;
            if (sim.qtd > 0) {
                totalComprasAcoes += valorOperacao;
            } else {
                totalVendasAcoes += Math.abs(valorOperacao); // Soma vendas
            }
        }
    }

    // Saldo = (Dinheiro que eu coloquei) + (Dinheiro que ganhei vendendo) - (Dinheiro que gastei comprando)
    const saldoDisponivel = aporteTotal + totalVendasFiis + totalVendasAcoes - totalComprasFiis - totalComprasAcoes;

    document.getElementById('negociar-total-compras-fiis').textContent = formatarMoeda(totalComprasFiis);
    document.getElementById('negociar-total-compras-acoes').textContent = formatarMoeda(totalComprasAcoes);

    const elSaldoDisponivel = document.getElementById('negociar-saldo-disponivel');
    elSaldoDisponivel.textContent = formatarMoeda(saldoDisponivel);

    if (saldoDisponivel < -0.01) {
        elSaldoDisponivel.classList.add('valor-negativo');
        elSaldoDisponivel.classList.remove('valor-positivo');
    } else {
        elSaldoDisponivel.classList.remove('valor-negativo');
        elSaldoDisponivel.classList.add('valor-positivo');
    }
}
function gerarDadosBalanceamento(tipoAtivoFiltro = 'todos', aporteAdicional = 0) {
    const hoje = new Date().toISOString().split('T')[0];
    const posicoesAtuais = gerarPosicaoDetalhada(hoje);
    const valorTotalInvestidoAtual = calcularValorTotalCarteira(hoje);    
    const valorBaseParaCalculo = valorTotalInvestidoAtual + aporteAdicional;
    
    const categorias = {
        'Ações': { idealPercentual: 0, idealValor: 0, atual: 0, ativos: [] },
        'FIIs': { idealPercentual: 0, idealValor: 0, atual: 0, ativos: [] },
        'ETF': { idealPercentual: 0, idealValor: 0, atual: 0, ativos: [] },
        'Renda Fixa': { idealPercentual: 0, idealValor: 0, atual: 0, ativos: [] }
    };

    // --- INÍCIO DA CORREÇÃO ---
    // Passo 1: Calcular os valores IDEAIS primeiro, iterando sobre o plano de alocação.
    for (const ticker in dadosAlocacao.ativos) {
        const ativoInfo = todosOsAtivos.find(a => a.ticker === ticker);
        if (ativoInfo) {
            const tipoMapeado = ativoInfo.tipo === 'Ação' ? 'Ações' : ativoInfo.tipo === 'FII' ? 'FIIs' : ativoInfo.tipo;
            if (categorias[tipoMapeado]) {
                const percIdealAtivo = dadosAlocacao.ativos[ticker] || 0;
                categorias[tipoMapeado].idealValor += valorBaseParaCalculo * percIdealAtivo;
            }
        }
    }
    // Adiciona o valor ideal da Renda Fixa.
    const percIdealGlobalRF = dadosAlocacao.categorias['Renda Fixa'] || 0;
    categorias['Renda Fixa'].idealValor = valorBaseParaCalculo * percIdealGlobalRF;

    // Recalcula o percentual ideal da categoria com base na soma dos ativos.
    for (const nomeCat in categorias) {
        if (valorBaseParaCalculo > 0) {
            categorias[nomeCat].idealPercentual = categorias[nomeCat].idealValor / valorBaseParaCalculo;
        }
    }
    // --- FIM DA CORREÇÃO ---

    // Passo 2: Construir a lista completa de ativos a serem processados (em carteira + planejados).
    const todosOsTickersRelevantes = new Set(Object.keys(posicoesAtuais));
    Object.keys(dadosAlocacao.ativos).forEach(t => todosOsTickersRelevantes.add(t));
    
    // Passo 3: Processar cada ativo para preencher os dados atuais e de ajuste.
    todosOsTickersRelevantes.forEach(ticker => {
        const ativoInfo = todosOsAtivos.find(a => a.ticker === ticker);
        const posicao = posicoesAtuais[ticker];
        const tipoAtivoCorrigido = ativoInfo ? (ativoInfo.tipo === 'Ação' ? 'Ações' : ativoInfo.tipo === 'FII' ? 'FIIs' : ativoInfo.tipo) : null;
        
        if (tipoAtivoCorrigido && categorias[tipoAtivoCorrigido]) {
            const quantidade = posicao ? posicao.quantidade : 0;
            if (quantidade < 0.000001 && !(ticker in dadosAlocacao.ativos)) return;

            const cotacao = dadosDeMercado.cotacoes[ticker];
            const valorDeMercado = (cotacao?.valor > 0) ? quantidade * cotacao.valor : 0;
            categorias[tipoAtivoCorrigido].atual += valorDeMercado;

            const projecaoAnual = (ativoInfo.tipo === 'Ação') 
                ? calcularProjecaoAnualUnitaria(ticker, { limiteAnos: 5 })
                : getUltimoProvento(ticker) * 12;
            
            const yieldOnMarket = (cotacao?.valor > 0) ? projecaoAnual / cotacao.valor : 0;
            const variation = (posicao?.precoMedio > 0 && cotacao?.valor > 0) ? (cotacao.valor - posicao.precoMedio) / posicao.precoMedio : 0;
            // --- ALTERAÇÃO: Leitura unificada de VPA ---
            const vpaParaCalculo = (cotacao) ? (cotacao.vpa || 0) : 0;
            
            const percGlobalIdealAtivo = dadosAlocacao.ativos[ticker] || 0;
            const valorIdealAtivo = valorBaseParaCalculo * percGlobalIdealAtivo;

            categorias[tipoAtivoCorrigido].ativos.push({ 
                ticker, 
                valorDeMercado, 
                quantidade, 
                cotacao: cotacao ? cotacao.valor : 0,
                precoMedio: posicao ? posicao.precoMedio : 0,
                yieldOnMarket: yieldOnMarket,
                variation: variation,
                vpa: vpaParaCalculo,
                percGlobalIdeal: percGlobalIdealAtivo,
                valorIdeal: valorIdealAtivo
            });
        }
    });

    todosOsAtivosRF.forEach(ativoRF => {
        if ((ativoRF.descricao || '').toLowerCase().includes('(inativa)')) return;
        const saldosAtivoRF = calcularSaldosRFEmData(ativoRF, hoje);
        if (saldosAtivoRF.saldoLiquido <= 0) return;
        
        categorias['Renda Fixa'].atual += saldosAtivoRF.saldoLiquido;
    });

    const categoriasParaProcessar = tipoAtivoFiltro === 'todos' 
        ? Object.keys(categorias) 
        : [tipoAtivoFiltro === 'Ação' ? 'Ações' : tipoAtivoFiltro === 'FII' ? 'FIIs' : tipoAtivoFiltro];

    const resultado = {
        valorTotalCarteira: valorTotalInvestidoAtual, 
        valorTotalCarteiraFuturo: valorBaseParaCalculo, 
        categorias: {}
    };

    categoriasParaProcessar.forEach(nomeCategoria => {
        const categoria = categorias[nomeCategoria];
        const valorIdealCategoria = categoria.idealValor;
        const valorAtualCategoria = categoria.atual;
        const diffCategoria = valorIdealCategoria - valorAtualCategoria;
        const percentualAtualCategoria = valorTotalInvestidoAtual > 0 ? valorAtualCategoria / valorTotalInvestidoAtual : 0;
        
        resultado.categorias[nomeCategoria] = {
            ideal: { percentual: categoria.idealPercentual, valor: valorIdealCategoria },
            atual: { percentual: percentualAtualCategoria, valor: valorAtualCategoria },
            ajuste: { valor: diffCategoria },
            ativos: []
        };
        if (!Array.isArray(categoria.ativos)) return;

        categoria.ativos.sort((a,b) => a.ticker.localeCompare(b.ticker)).forEach(ativo => {
            const qtdIdeal = ativo.cotacao > 0 ? ativo.valorIdeal / ativo.cotacao : 0;
            
            const percIdealGlobal = ativo.percGlobalIdeal || 0;
            const percAtualGlobal = valorTotalInvestidoAtual > 0 ? ativo.valorDeMercado / valorTotalInvestidoAtual : 0;
            
            const diffValor = ativo.valorIdeal - ativo.valorDeMercado;
            const diffQtd = qtdIdeal - ativo.quantidade;
            
            let status = (Math.abs(diffValor) < (ativo.valorDeMercado * 0.005)) ? 'OK' : (diffValor > 0 ? 'Aportar' : 'Reduzir');
            
            resultado.categorias[nomeCategoria].ativos.push({
                ticker: ativo.ticker,
                status: status,
                precoMedio: ativo.precoMedio,
                yieldOnMarket: ativo.yieldOnMarket,
                variation: ativo.variation,
                vpa: ativo.vpa,
                ideal: {
                    valor: ativo.valorIdeal,
                    quantidade: qtdIdeal,
                    percentualGlobal: percIdealGlobal
                },
                atual: {
                    valor: ativo.valorDeMercado,
                    quantidade: ativo.quantidade,
                    cotacao: ativo.cotacao,
                    percentualGlobal: percAtualGlobal
                },
                ajuste: {
                    percentual: percIdealGlobal - percAtualGlobal, 
                    valor: diffValor,
                    quantidade: diffQtd
                }
            });
        });
    });

    return resultado;
}
function processarRebalanceamento(dadosCategorias, modo = 'categoria') {
    const resultado = {
        listaAportar: [],
        listaReduzir: [],
        totalRemanejar: 0
    };

    if (!dadosCategorias) {
        console.error("processarRebalanceamento foi chamada com dados de categoria indefinidos.");
        return resultado; 
    }

    // Leitura das configurações
    // Se undefined, assume true (seguro).
    const respeitarRegrasAlocacao = configuracoesFiscais.considerarRegrasVenda !== undefined 
        ? configuracoesFiscais.considerarRegrasVenda 
        : true;
        
    // Busca a margem configurada (ex: 0.10 para 10%). Se não houver, assume 0.
    const margemAlvo = configuracoesFiscais.margemLucroVenda || 0;

    for (const nomeCategoria in dadosCategorias) {
        if (dadosCategorias[nomeCategoria] && Array.isArray(dadosCategorias[nomeCategoria].ativos)) {
            
            const categoriaEstaSuperalocada = dadosCategorias[nomeCategoria]?.ajuste.valor < 0;

            dadosCategorias[nomeCategoria].ativos.forEach(ativo => {
                
                // Lógica de Aporte (Mantida)
                if (ativo.ajuste.valor > 1) {
                    resultado.listaAportar.push({
                        ticker: ativo.ticker,
                        valor: ativo.ajuste.valor,
                        cotacao: ativo.atual.cotacao,
                        yieldOnMarket: ativo.yieldOnMarket,
                        variation: ativo.variation,
                        alocacaoAtual: ativo.atual.percentualGlobal,
                        alocacaoIdeal: ativo.ideal.percentualGlobal
                    });
                } 
                // Lógica de Redução (Venda)
                else if (ativo.ajuste.quantidade <= -1) { 
                    
                    let deveSugerirVenda = false;

                    // --- PASSO 1: O sistema DEVE sugerir venda pela alocação? ---
                    if (!respeitarRegrasAlocacao) {
                        // Modo Oportunista: Se tem excesso matemático, sugere venda
                        deveSugerirVenda = true;
                    } else {
                        // Modo Seguro: Respeita tolerâncias e saúde da categoria
                        if (modo === 'categoria') {
                            if (categoriaEstaSuperalocada) deveSugerirVenda = true;
                        } else {
                            const toleranciaRelativa = ativo.ideal.percentualGlobal * 0.30;
                            if (ativo.ajuste.percentual < -toleranciaRelativa) deveSugerirVenda = true;
                        }
                    }

                    if (deveSugerirVenda) {
                        const quantidadeASerVendida = Math.floor(Math.abs(ativo.ajuste.quantidade));
                        const valorAReduzir = -(quantidadeASerVendida * ativo.atual.cotacao);
                        
                        // --- PASSO 2: É financeiramente viável vender? (Trava de Prejuízo/Margem) ---
                        
                        let vendavelComLucro = false;
                        const lucroPorCota = ativo.atual.cotacao - ativo.precoMedio;

                        if (respeitarRegrasAlocacao) {
                            // MODO SEGURO: A prioridade é rebalancear (reduzir risco).
                            // Basta não ter prejuízo (Preço > PM). Ignora a margem de 10% para não travar a segurança.
                            vendavelComLucro = ativo.atual.cotacao > ativo.precoMedio;
                        } else {
                            // MODO OPORTUNISTA: A prioridade é lucro alto.
                            // Só vende se o lucro superar a margem configurada (ex: > 10%).
                            const precoMinimoComMargem = ativo.precoMedio * (1 + margemAlvo);
                            vendavelComLucro = ativo.atual.cotacao >= precoMinimoComMargem;
                        }
                        
                        // Trava de FIIs (P/VP)
                        let atendeCriterioPVP = true;
                        let pvpValorCalculado = 0;
                        let subtipoFii = null; 

                        if (nomeCategoria === 'FIIs') {
                            const pvp = (ativo.vpa > 0) ? (ativo.atual.cotacao / ativo.vpa) : 0;
                            pvpValorCalculado = pvp;
                            
                            const cadastroAtivo = todosOsAtivos.find(a => a.ticker === ativo.ticker);
                            subtipoFii = cadastroAtivo ? cadastroAtivo.subtipoFii : null;

                            // Regra: Papel e Híbrido não vende se P/VP < 0.99
                            if (subtipoFii === 'Papel' || subtipoFii === 'Hibrido') {
                                if (pvp > 0 && pvp < 0.99) {
                                    atendeCriterioPVP = false;
                                }
                            }
                        }
                        
                        const isActionable = vendavelComLucro && atendeCriterioPVP;
                        const lucroPrejuizo = lucroPorCota * quantidadeASerVendida;

                        // Mensagem de erro personalizada para explicar por que não vendeu
                        let motivoBloqueio = '';
                        if (!vendavelComLucro) {
                            if (respeitarRegrasAlocacao) {
                                motivoBloqueio = 'Com prejuízo (Modo Seguro)';
                            } else {
                                // Mostra quanto falta para atingir a margem
                                const margemAtual = (lucroPorCota / ativo.precoMedio) * 100;
                                motivoBloqueio = `Abaixo da margem (${margemAtual.toFixed(2)}% < ${(margemAlvo*100).toFixed(0)}%)`;
                            }
                        }

                        resultado.listaReduzir.push({
                            ticker: ativo.ticker,
                            valor: valorAReduzir, 
                            cotacao: ativo.atual.cotacao,
                            isActionable: isActionable,
                            yieldOnMarket: ativo.yieldOnMarket,
                            variation: ativo.variation,
                            lucroPrejuizo: lucroPrejuizo,
                            motivoLucro: vendavelComLucro,
                            motivoBloqueioTexto: motivoBloqueio, // Passamos o texto para o renderizador usar se quiser
                            motivoPVP: atendeCriterioPVP,
                            pvp: pvpValorCalculado,
                            subtipoFii: subtipoFii,
                            alocacaoAtual: ativo.atual.percentualGlobal,
                            alocacaoIdeal: ativo.ideal.percentualGlobal
                        });
                    }
                }
            });
        }
    }

    resultado.totalRemanejar = resultado.listaReduzir
        .filter(item => item.isActionable)
        .reduce((soma, item) => soma + Math.abs(item.valor), 0);

    resultado.listaAportar.sort((a, b) => b.valor - a.valor);
    
    resultado.listaReduzir.sort((a, b) => {
        if (a.isActionable && !b.isActionable) return -1;
        if (!a.isActionable && b.isActionable) return 1;
        return a.valor - b.valor;
    });

    return resultado;
}

function renderizarPlanoDeResgate(valorResgate, container) {
    planoDeAcaoAtual = { compras: [], vendas: [] };
    const hoje = new Date().toISOString().split('T')[0];

    let valorAindaNecessario = valorResgate;
    const sugestoesDeResgate = [];
    const vendasParaSimulacao = []; 

    // Prioridade 1: Renda Fixa
    const ativosRF = todosOsAtivosRF.filter(a => !(a.descricao || '').toLowerCase().includes('inativa'));
    let saldoTotalRF = 0;
    ativosRF.forEach(ativo => {
        saldoTotalRF += calcularSaldosRFEmData(ativo, hoje).saldoLiquido;
    });

    if (valorAindaNecessario > 0 && saldoTotalRF > 0) {
        const resgateDaRF = Math.min(valorAindaNecessario, saldoTotalRF);
        sugestoesDeResgate.push({
            ticker: 'Renda Fixa',
            valor: resgateDaRF,
            detalhes: `Resgate de liquidez em Renda Fixa.`
        });
        valorAindaNecessario -= resgateDaRF;
    }

    // Prioridade 2: Renda Variável (Lucro)
    if (valorAindaNecessario > 0) {
        const posicoesRV = gerarPosicaoDetalhada();
        const ativosComLucro = [];

        Object.keys(posicoesRV).forEach(ticker => {
            const pos = posicoesRV[ticker];
            if (pos.quantidade > 0) {
                const cotacao = dadosDeMercado.cotacoes[ticker]?.valor || 0;
                if (cotacao > pos.precoMedio) {
                    ativosComLucro.push({
                        ticker,
                        lucroPorCota: cotacao - pos.precoMedio,
                        cotacao,
                        quantidade: pos.quantidade
                    });
                }
            }
        });

        ativosComLucro.sort((a, b) => b.lucroPorCota - a.lucroPorCota);

        for (const ativo of ativosComLucro) {
            if (valorAindaNecessario <= 0) break;
            const valorTotalAtivo = ativo.quantidade * ativo.cotacao;
            const valorVendaNecessario = Math.min(valorAindaNecessario, valorTotalAtivo);
            const qtdVenda = Math.ceil(valorVendaNecessario / ativo.cotacao);
            const valorVendaReal = qtdVenda * ativo.cotacao;

            sugestoesDeResgate.push({
                ticker: ativo.ticker,
                valor: valorVendaReal,
                detalhes: `Vender ${qtdVenda} un. a ${formatarMoeda(ativo.cotacao)} (Com Lucro)`
            });
            vendasParaSimulacao.push({ ticker: ativo.ticker, qtd: qtdVenda, preco: ativo.cotacao });
            valorAindaNecessario -= valorVendaReal;
        }
    }
    
    planoDeAcaoAtual.vendas = vendasParaSimulacao;
    
    // --- HTML Visual Moderno (Plano de Resgate) ---
    let html = `
    <div class="dash-card border-danger mb-4">
        <div class="dash-header bg-danger text-white">
            <h3><i class="fas fa-exclamation-circle"></i> Modo de Resgate Ativado</h3>
        </div>
        <div class="dash-body p-4 text-center">
            <h4 class="text-danger mb-3">Você precisa resgatar ${formatarMoeda(valorResgate)}</h4>
            
            <div class="form-group d-inline-block">
                <label>Ajustar Valor do Resgate (Negativo):</label>
                <input type="text" id="balanceamento-aporte-valor" class="form-control text-center form-control-lg text-danger font-weight-bold" 
                       value="${formatarDecimalParaInput(-valorResgate)}" onchange="renderizarTelaConsultaBalanceamento();" style="width: 200px; margin: 0 auto;">
            </div>
        </div>
    </div>

    <div class="dash-card">
        <div class="dash-header">
            <h3>Sugestões para levantar o capital</h3>
        </div>
        <div class="dash-body p-0">
            <ul class="list-group list-group-flush">`;

    sugestoesDeResgate.forEach(item => {
        html += `
        <li class="list-group-item d-flex justify-content-between align-items-center">
            <div>
                <strong style="font-size: 1.1em;">${item.ticker}</strong>
                <div class="text-muted small">${item.detalhes}</div>
            </div>
            <span class="badge badge-danger p-2" style="font-size: 1em;">- ${formatarMoeda(item.valor)}</span>
        </li>`;
    });

    html += `</ul></div></div>`;

    if (valorAindaNecessario > 0) {
        html += `
        <div class="alert alert-warning mt-3">
            <i class="fas fa-exclamation-triangle"></i> 
            <strong>Atenção:</strong> Faltam <strong>${formatarMoeda(valorAindaNecessario)}</strong>. Não há mais ativos com lucro ou liquidez imediata identificados.
        </div>`;
    }

    container.innerHTML = html;
}


function renderizarTelaConsultaBalanceamento() {
    planoDeAcaoAtual = { compras: [], vendas: [] };

    const container = document.getElementById('container-consulta-balanceamento');
    
    // Inicialização Segura
    if (!dadosAlocacao) dadosAlocacao = { categorias: {}, ativos: {} };
    if (!dadosAlocacao.statusAporteRendaFixa) dadosAlocacao.statusAporteRendaFixa = 'Ativo';
    
    // --- LÓGICA DE CONFIGURAÇÃO ATUALIZADA ---
    const isModoSeguro = configuracoesFiscais.considerarRegrasVenda !== undefined ? configuracoesFiscais.considerarRegrasVenda : true;
    
    // Captura as duas margens disponíveis
    const margemSeguroAtual = (configuracoesFiscais.margemLucroModoSeguro !== undefined) ? configuracoesFiscais.margemLucroModoSeguro * 100 : 2;
    const margemOportunistaAtual = (configuracoesFiscais.margemLucroVenda || 0) * 100;

    // --- DECISÃO CRÍTICA: Qual margem o cálculo matemático deve usar? ---
    // Se Modo Seguro estiver ON, usamos a margem segura para filtrar as vendas.
    // Se Modo Seguro estiver OFF, usamos a margem oportunista.
    // Importante: Isso precisa ser passado ou configurado globalmente para o 'processarRebalanceamento'
    // Como 'processarRebalanceamento' geralmente lê a global 'configuracoesFiscais.margemLucroVenda', 
    // nós vamos fazer um override temporário apenas visual ou de lógica aqui se necessário. 
    // *Assumindo que sua função processarRebalanceamento foi ajustada para aceitar um parametro ou ler a global.*
    // *Para garantir funcionamento sem mexer no motor agora:* vamos deixar a lógica padrão rodar, e filtrar visualmente se precisar, 
    // mas o ideal é que o cálculo de 'isActionable' considere isso.
    
    const modoAtual = dadosAlocacao.modoRebalanceamento || 'categoria';
    const isModoAtivo = modoAtual === 'ativo';
    const isRFPausada = dadosAlocacao.statusAporteRendaFixa === 'Pausado';

    const aporteInput = document.getElementById('balanceamento-aporte-valor');
    const aporteEmDinheiro = parseDecimal(aporteInput?.value || '0');

    // Desvio para Modo Resgate
    if (aporteEmDinheiro < 0) {
        renderizarPlanoDeResgate(Math.abs(aporteEmDinheiro), container);
        return;
    }

    // --- CÁLCULOS MATEMÁTICOS ---
    const dadosAtuais = gerarDadosBalanceamento('todos');
    const dadosFuturos = gerarDadosBalanceamento('todos', aporteEmDinheiro);
    
    // A função processarRebalanceamento gera a lista de vendas.
    // IMPORTANTE: Ela usa a margem global para definir 'isActionable'.
    // Para que o Modo Seguro respeite a "Nova Margem Segura", precisamos garantir que o sistema saiba disso.
    // Como não alteramos 'processarRebalanceamento' agora, vamos confiar que ele marca o ativo como 'venda sugerida' 
    // e nós aplicamos o filtro fino aqui ou exibimos os bloqueios.
    let dadosProcessadosVenda = processarRebalanceamento(dadosFuturos.categorias, modoAtual);
    
    const posicoesAtuais = gerarPosicaoDetalhada();

    if (dadosAtuais.valorTotalCarteira === 0) {
        container.innerHTML = '<div class="alert alert-info">Não há posições na carteira para analisar.</div>';
        return;
    }

    // --- FILTRAGEM FINAL DE VENDAS (Ajuste para a nova lógica) ---
    // Aqui aplicamos a regra da margem correta sobre o resultado processado
    const margemEfetivaDecimal = isModoSeguro ? (margemSeguroAtual / 100) : (margemOportunistaAtual / 100);

    dadosProcessadosVenda.listaReduzir.forEach(item => {
        if (item.ticker !== 'Renda Fixa' && item.isActionable) {
            // Recalcula se deve ser actionable baseado na margem do modo atual
            const lucroPercentual = item.lucroPrejuizo / (Math.abs(item.valor) - item.lucroPrejuizo); // Aproximação do yield sobre custo da parcela vendida
            // Ou mais simples, se temos o yieldOnMarket ou variation no objeto item:
            // Vamos usar o variation que já vem no objeto (variação sobre PM)
            if (item.variation < margemEfetivaDecimal) {
                item.isActionable = false;
                item.motivoBloqueioTexto = `Abaixo da Margem (${(margemEfetivaDecimal * 100).toFixed(1)}%)`;
            }
        }
    });


    // Renda Fixa (Venda)
    const ajusteRF = dadosFuturos.categorias['Renda Fixa']?.ajuste.valor || 0;
    const percentualAjusteRF = dadosFuturos.categorias['Renda Fixa']?.ajuste.percentual || 0;
    const idealRF = dadosFuturos.categorias['Renda Fixa']?.ideal.percentual || 0;
    const toleranciaRF = idealRF * 0.30; 
    const deveVenderRF = isModoAtivo ? (percentualAjusteRF < -toleranciaRF) : (ajusteRF < -1);

    if (deveVenderRF && ajusteRF < -1) {
        dadosProcessadosVenda.listaReduzir.unshift({ ticker: 'Renda Fixa', valor: ajusteRF, isActionable: true, yieldOnMarket: 0, variation: 0, lucroPrejuizo: 0, motivoLucro: true, motivoPVP: true, pvp: 0, cotacao: 1 });
    }

    const vendasSelecionadas = dadosProcessadosVenda.listaReduzir.filter(item => item.isActionable && estadoSelecaoVendas[item.ticker] !== false);
    const totalRemanejarSelecionado = vendasSelecionadas.reduce((soma, item) => soma + Math.abs(item.valor), 0);
    const capitalDisponivelInicial = totalRemanejarSelecionado + aporteEmDinheiro;
    
    // --- DECISÃO DE COMPRA ---
    const sugestoesDeCompra = {};
    const valorTotalFuturo = dadosAtuais.valorTotalCarteira + aporteEmDinheiro;
    const mapaValorAtual = new Map();
    const mapaDadosAtuais = new Map();
    Object.values(dadosAtuais.categorias).flatMap(c => c.ativos).forEach(a => { mapaValorAtual.set(a.ticker, a.atual.valor); mapaDadosAtuais.set(a.ticker, a); });

    const todosOsCandidatos = [];
    const mapaTickerParaCategoria = new Map();
    todosOsAtivos.forEach(a => mapaTickerParaCategoria.set(a.ticker, a.tipo.replace(/Ação/g, 'Ações').replace(/FII/g, 'FIIs')));

    todosOsAtivos.forEach(ativoInfo => {
        const percIdeal = dadosAlocacao.ativos[ativoInfo.ticker] || 0;
        if (percIdeal <= 0 && (!posicoesAtuais[ativoInfo.ticker] || posicoesAtuais[ativoInfo.ticker].quantidade < 0.000001)) return;
        
        const dadosMercadoAtivo = dadosDeMercado.cotacoes[ativoInfo.ticker] || {};
        if (!dadosMercadoAtivo.valor || dadosMercadoAtivo.valor <= 0) return;
        
        if (ativoInfo.tipo === 'Ação') {
            const projecaoAnual = calcularProjecaoAnualUnitaria(ativoInfo.ticker, { limiteAnos: 5 });
            const precoTetoBazin = calcularPrecoTetoBazin(projecaoAnual, ativoInfo.metaYieldBazin || 0.06);
            if (precoTetoBazin > 0 && dadosMercadoAtivo.valor > precoTetoBazin) return;
        }
        if (ativoInfo.tipo === 'FII') {
            const pvp = (dadosMercadoAtivo.vpa > 0) ? (dadosMercadoAtivo.valor / dadosMercadoAtivo.vpa) : 0;
            if ((ativoInfo.subtipoFii === 'Papel' || ativoInfo.subtipoFii === 'Hibrido') && pvp > 1.01) return;
        }
        
        const valorAtualDoAtivo = mapaValorAtual.get(ativoInfo.ticker) || 0;
        const valorIdealFuturo = valorTotalFuturo * percIdeal;
        const necessidadeReal = Math.max(0, valorIdealFuturo - valorAtualDoAtivo);

        if (necessidadeReal > 0.01) {
             todosOsCandidatos.push({
                ticker: ativoInfo.ticker, tipo: ativoInfo.tipo, cotacao: dadosMercadoAtivo.valor,
                necessidadeRealDeAporte: necessidadeReal, scores: calcularScoreDeQualidade(ativoInfo, dadosMercadoAtivo),
                dadosOriginais: mapaDadosAtuais.get(ativoInfo.ticker) || {}, categoria: mapaTickerParaCategoria.get(ativoInfo.ticker)
            });
        }
    });

    if (isModoAtivo) {
        todosOsCandidatos.forEach(c => { c.scoreFinalAlocacao = (todosOsAtivos.find(a => a.ticker === c.ticker)?.statusAporte !== 'Ativo') ? 0 : c.necessidadeRealDeAporte * (1 + (c.scores.final / 100)); });
        const valorPossivelRF = (!isRFPausada && ajusteRF > 0) ? Math.min(ajusteRF, capitalDisponivelInicial) : 0;
        sugestoesDeCompra['Renda Fixa'] = { valor: valorPossivelRF, qtd: 0 };
        let capitalRV = Math.max(0, capitalDisponivelInicial - valorPossivelRF);
        const candidatosValidos = todosOsCandidatos.filter(c => c.scoreFinalAlocacao > 0).sort((a, b) => b.scoreFinalAlocacao - a.scoreFinalAlocacao);
        let iter = 0;
        while (capitalRV > 10 && iter < 1000) { 
            let comprou = false;
            for (const cand of candidatosValidos) {
                if (capitalRV < cand.cotacao) continue;
                const jaAlocado = (sugestoesDeCompra[cand.ticker]?.qtd || 0) * cand.cotacao;
                if (jaAlocado < cand.necessidadeRealDeAporte) {
                     if (!sugestoesDeCompra[cand.ticker]) sugestoesDeCompra[cand.ticker] = { ticker: cand.ticker, qtd: 0, preco: cand.cotacao };
                    sugestoesDeCompra[cand.ticker].qtd += 1; capitalRV -= cand.cotacao; comprou = true;
                }
            }
            if (!comprou) break;
            iter++;
        }
    } else {
        const orcamentoPorCategoria = {};
        const necessidadeTotal = Object.values(dadosFuturos.categorias).reduce((s, cat) => s + Math.max(0, cat.ajuste.valor), 0);
        if (necessidadeTotal > 0) {
            for (const cat in dadosFuturos.categorias) {
                const nec = Math.max(0, dadosFuturos.categorias[cat].ajuste.valor);
                if (nec > 0) orcamentoPorCategoria[cat] = capitalDisponivelInicial * (nec / necessidadeTotal);
            }
        }
        sugestoesDeCompra['Renda Fixa'] = { valor: (!isRFPausada && orcamentoPorCategoria['Renda Fixa'] > 0) ? orcamentoPorCategoria['Renda Fixa'] : 0, qtd: 0 };
        
        const alocar = (nomeCat, cap) => {
            let cands = todosOsCandidatos.filter(c => c.categoria === nomeCat);
            cands.forEach(c => { c.scoreFinalAlocacao = (todosOsAtivos.find(a => a.ticker === c.ticker)?.statusAporte !== 'Ativo') ? 0 : c.necessidadeRealDeAporte * (1 + (c.scores.final / 100)); });
            cands = cands.filter(c => c.scoreFinalAlocacao > 0).sort((a, b) => b.scoreFinalAlocacao - a.scoreFinalAlocacao);
            let capRest = cap; let it = 0;
            while (capRest > 10 && it < 500) {
                let comprou = false;
                for (const cand of cands) {
                    if (capRest >= cand.cotacao) {
                        const ja = (sugestoesDeCompra[cand.ticker]?.qtd || 0) * cand.cotacao;
                        if (ja < cand.necessidadeRealDeAporte) {
                            if (!sugestoesDeCompra[cand.ticker]) sugestoesDeCompra[cand.ticker] = { ticker: cand.ticker, qtd: 0, preco: cand.cotacao };
                            sugestoesDeCompra[cand.ticker].qtd += 1; capRest -= cand.cotacao; comprou = true;
                        }
                    }
                }
                if (!comprou) break;
                it++;
            }
        };
        if (orcamentoPorCategoria['Ações'] > 0) alocar('Ações', orcamentoPorCategoria['Ações']);
        if (orcamentoPorCategoria['FIIs'] > 0) alocar('FIIs', orcamentoPorCategoria['FIIs']);
    }

    // =========================================================
    // CÁLCULO DOS TOTAIS BASEADO NA SELEÇÃO
    // =========================================================
    
    const mapaTickerParaCategoria2 = new Map();
    todosOsAtivos.forEach(a => mapaTickerParaCategoria2.set(a.ticker, a.tipo.replace(/Ação/g, 'Ações').replace(/FII/g, 'FIIs')));

    const vendasPorCategoria = { 'Ações': 0, 'FIIs': 0, 'ETFs': 0, 'Renda Fixa': 0 };
    vendasSelecionadas.forEach(item => {
        const categoria = mapaTickerParaCategoria2.get(item.ticker);
        if (categoria && vendasPorCategoria.hasOwnProperty(categoria)) {
            vendasPorCategoria[categoria] += Math.abs(item.valor);
        } else if (item.ticker === 'Renda Fixa') {
            vendasPorCategoria['Renda Fixa'] += Math.abs(item.valor);
        }
    });

    const aportePorCategoria = { 'Ações': 0, 'FIIs': 0, 'ETFs': 0, 'Renda Fixa': 0 };
    if (!isRFPausada && sugestoesDeCompra['Renda Fixa']) {
        aportePorCategoria['Renda Fixa'] += sugestoesDeCompra['Renda Fixa'].valor;
    }

    for (const ticker in sugestoesDeCompra) {
        if (ticker === 'Renda Fixa') continue; 

        const ativo = todosOsAtivos.find(a => a.ticker === ticker);
        if (ativo && ativo.statusAporte !== 'Pausado') {
            const categoria = mapaTickerParaCategoria2.get(ticker);
            if (categoria && aportePorCategoria.hasOwnProperty(categoria)) {
                aportePorCategoria[categoria] += (sugestoesDeCompra[ticker].qtd || 0) * (sugestoesDeCompra[ticker].preco || 0);
            }
        }
    }

    const valorRealAportado = Object.values(aportePorCategoria).reduce((s, v) => s + v, 0);
    const valorRealVendido = Object.values(vendasPorCategoria).reduce((s, v) => s + v, 0);
    const sobra = capitalDisponivelInicial - valorRealAportado;

    let valorTotalCarteiraProjetado = 0;
    const projecaoPorCategoria = {};

    for (const nomeCategoria in dadosAtuais.categorias) {
        const valorAtual = dadosAtuais.categorias[nomeCategoria].atual.valor;
        const compras = aportePorCategoria[nomeCategoria] || 0;
        const vendas = vendasPorCategoria[nomeCategoria] || 0;
        
        const valorProjetado = valorAtual + compras - vendas;
        projecaoPorCategoria[nomeCategoria] = valorProjetado;
        valorTotalCarteiraProjetado += valorProjetado;
    }

    // =========================================================
    // 1. VISÃO GERAL (TABELA DINÂMICA)
    // =========================================================
    let visaoGeralHtml = `
    <div class="dash-card mb-4">
        <div class="dash-header bg-light">
            <h3 class="text-dark m-0" style="font-size: 1.1em;"><i class="fas fa-chart-pie"></i> Diagnóstico das Categorias (Simulação Real)</h3>
        </div>
        <div class="dash-body table-responsive p-0">
            <table class="table table-hover mb-0" style="font-size: 0.95em;">
                <thead class="thead-light">
                    <tr>
                        <th class="pl-4">Categoria</th>
                        <th class="text-center">Ideal %</th>
                        <th class="text-center">Atual %</th>
                        <th class="text-right">Valor Atual</th>
                        <th class="text-center" style="border-left: 1px solid #dee2e6;">Pós Aporte %</th>
                        <th class="text-right">Valor Pós-Aporte</th>
                        <th class="text-right pr-4" style="border-left: 1px solid #dee2e6;">Movimentação</th>
                    </tr>
                </thead>
                <tbody>`;

    for (const nomeCategoria in dadosAtuais.categorias) {
        const cat = dadosAtuais.categorias[nomeCategoria];
        const valorProjetado = projecaoPorCategoria[nomeCategoria] || 0;
        const percentualProjetado = valorTotalCarteiraProjetado > 0 ? (valorProjetado / valorTotalCarteiraProjetado) : 0;
        const compras = aportePorCategoria[nomeCategoria] || 0;
        const vendas = vendasPorCategoria[nomeCategoria] || 0;
        const movimentacaoLiquida = compras - vendas;

        if (cat.ideal.percentual > 0 || cat.atual.valor > 0) {
            const isPositivo = movimentacaoLiquida > 0.01;
            const isNegativo = movimentacaoLiquida < -0.01;
            let classeLinha = 'text-muted';
            let bgCelula = '#fff';
            let icone = '<i class="fas fa-minus" style="font-size: 0.8em; opacity: 0.5;"></i>';
            let textoAjuste = '';

            if (isPositivo) {
                classeLinha = 'text-success';
                bgCelula = 'rgba(46, 204, 113, 0.1)';
                icone = '<i class="fas fa-plus-circle"></i>';
            } else if (isNegativo) {
                classeLinha = 'text-danger';
                bgCelula = 'rgba(231, 76, 60, 0.1)';
                icone = '<i class="fas fa-arrow-down"></i>';
            }

            visaoGeralHtml += `
            <tr>
                <td class="font-weight-bold pl-4 text-dark">${nomeCategoria}</td>
                <td class="text-center text-muted">${formatarPercentual(cat.ideal.percentual)}</td>
                <td class="text-center text-dark font-weight-bold">${formatarPercentual(cat.atual.percentual)}</td>
                <td class="text-right text-dark">${formatarMoeda(cat.atual.valor)}</td>
                <td class="text-center" style="border-left: 1px solid #dee2e6;"><strong>${formatarPercentual(percentualProjetado)}</strong></td>
                <td class="text-right"><strong>${formatarMoeda(valorProjetado)}</strong></td>
                <td class="text-right pr-4 font-weight-bold ${classeLinha}" style="background-color: ${bgCelula}; border-left: 1px solid #dee2e6;">
                    ${icone} ${textoAjuste} ${formatarMoeda(Math.abs(movimentacaoLiquida))}
                </td>
            </tr>`;
        }
    }
    visaoGeralHtml += `</tbody></table></div></div>`;


    // =========================================================
    // 2. CARD DE CONTROLE (ATUALIZADO COM NOVA BARRA E MARGENS)
    // =========================================================
    const valorInputValue = aporteEmDinheiro !== 0 ? formatarDecimalParaInput(aporteEmDinheiro) : '';
    const valSeguroDisplay = formatarDecimal((configuracoesFiscais.margemLucroModoSeguro || 0) * 100);
    const valOportunistaDisplay = formatarDecimal((configuracoesFiscais.margemLucroVenda || 0) * 100);

    const cardControleHtml = `
    <div class="dash-card mb-3" style="border-left: 6px solid #2980b9;">
        <div class="dash-body p-3">
            
            <div class="d-flex align-items-center" style="white-space: nowrap; overflow-x: auto; padding-bottom: 5px;">
                <div class="d-inline-flex flex-column mr-4">
                    <label style="font-weight: 800; color: #2980b9; text-transform: uppercase; font-size: 0.7em; margin-bottom: 0;">
                        <i class="fas fa-wallet"></i> Valor do Aporte (R$)
                    </label>
                    <input type="text" id="balanceamento-aporte-valor" class="form-control border-0 p-0 h-auto font-weight-bold" 
                           style="color: #2c3e50; font-size: 1.8em; background: transparent; width: 220px;" 
                           placeholder="0,00" 
                           value="${valorInputValue}" 
                           onchange="renderizarTelaConsultaBalanceamento();">
                </div>

                <div class="d-inline-flex align-items-end pb-2">
                    <span class="text-muted text-uppercase font-weight-bold small mr-1">Vendas:</span>
                    <span class="text-danger" style="font-size: 1.3em; font-weight: 900;">${formatarMoeda(totalRemanejarSelecionado)}</span>
                    <span style="display: inline-block; width: 40px;"></span>
                    <span class="text-primary text-uppercase font-weight-bold small mr-1">Disp:</span>
                    <span class="text-primary" style="font-size: 1.3em; font-weight: 900;">${formatarMoeda(capitalDisponivelInicial)}</span>
                    <span style="display: inline-block; width: 40px;"></span>
                    <span class="text-success text-uppercase font-weight-bold small mr-1">Alocado:</span>
                    <span class="text-success" style="font-size: 1.3em; font-weight: 900;">${formatarMoeda(valorRealAportado)}</span>
                    <span style="display: inline-block; width: 40px;"></span>
                    <span class="text-secondary text-uppercase font-weight-bold small mr-1">Sobra:</span>
                    <span class="text-secondary" style="font-size: 1.3em; font-weight: 900;">${formatarMoeda(sobra)}</span>
                </div>
            </div>
            
            <hr class="my-2">
            
            <div class="d-flex align-items-center justify-content-between" style="gap: 10px;">
                
                <div class="btn-group btn-group-sm btn-group-toggle" data-toggle="buttons">
                    <label class="btn ${!isModoAtivo ? 'btn-primary' : 'btn-outline-secondary border-0'} font-weight-bold shadow-none py-1" style="font-size: 0.85em;">
                        <input type="radio" name="modo-alocacao" value="categoria" ${!isModoAtivo ? 'checked' : ''}> Priorizar Categorias
                    </label>
                    <label class="btn ${isModoAtivo ? 'btn-primary' : 'btn-outline-secondary border-0'} font-weight-bold shadow-none py-1" style="font-size: 0.85em;">
                        <input type="radio" name="modo-alocacao" value="ativo" ${isModoAtivo ? 'checked' : ''}> Priorizar Ativos
                    </label>
                </div>

                <div class="d-flex align-items-center bg-light rounded px-2 py-1 border">
                    
                    <div class="custom-control custom-switch mr-3 pr-3 border-right">
                        <input type="checkbox" class="custom-control-input" id="config-modo-seguro" ${isModoSeguro ? 'checked' : ''}>
                        <label class="custom-control-label small font-weight-bold text-dark" 
                            for="config-modo-seguro" 
                            style="cursor: pointer; line-height: 2; font-weight: bold !important;"> Modo Seguro (Respeita Alocação)
                        </label>
                    </div>

                    <div class="d-flex align-items-center mr-3" style="transition: opacity 0.3s; ${!isModoSeguro ? 'opacity: 0.4;' : ''}" title="Margem exigida no Modo Seguro">
                        <label class="mb-0 mr-1 small font-weight-bold text-muted" for="config-margem-seguro" style="font-size: 0.75em;">Marg. Segura:</label>
                        <input type="text" id="config-margem-seguro" inputmode="decimal"
                               class="form-control form-control-sm border-0 p-0 text-center font-weight-bold bg-transparent" 
                               style="width: 70px; height: auto; color:rgb(11, 66, 18); font-size: 1.1em;" 
                               value="${valSeguroDisplay}"
                               ${!isModoSeguro ? 'disabled' : ''}>
                        <span class="small font-weight-bold text-muted">%</span>
                    </div>

                    <div class="d-flex align-items-center" style="transition: opacity 0.3s; ${isModoSeguro ? 'opacity: 0.4;' : ''}" title="Margem exigida no Modo Oportunista">
                        <label class="mb-0 mr-1 small font-weight-bold text-muted" for="config-margem-lucro" style="font-size: 0.75em;">Marg. Oport.:</label>
                        <input type="text" id="config-margem-lucro" inputmode="decimal"
                               class="form-control form-control-sm border-0 p-0 text-center font-weight-bold bg-transparent" 
                               style="width: 70px; height: auto; color:rgb(15, 17, 93); font-size: 1.1em;" 
                               value="${valOportunistaDisplay}"
                               ${isModoSeguro ? 'disabled' : ''}>
                        <span class="small font-weight-bold text-muted">%</span>
                    </div>

                </div>
            </div>
        </div>
    </div>`;


    // =========================================================
    // 3. SUGESTÕES (LAYOUT FLEXBOX ROW)
    // =========================================================
    let colunasHtml = `<div class="row" style="display: flex; flex-wrap: wrap;">`;
    const exibirReduzir = dadosProcessadosVenda.listaReduzir.length > 0;
    
    // --- COLUNA 1: VENDAS (Esquerda) ---
    if (exibirReduzir) {
        colunasHtml += `
        <div class="col-md-6 col-12 mb-4" style="flex: 0 0 50%; max-width: 50%;"> 
            <div class="dash-card border-danger h-100">
                <div class="dash-header bg-danger text-white d-flex justify-content-between align-items-center">
                    <h3 class="m-0 font-weight-bold" style="font-size: 1.1em;"><i class="fas fa-arrow-down"></i> VENDER / REDUZIR</h3>
                    <span class="badge badge-light text-danger font-weight-bold">Gerar Caixa</span>
                </div>
                <div class="dash-body p-3" style="background: #fff5f5;">`;
        
        dadosProcessadosVenda.listaReduzir.forEach(item => {
            const isChecked = item.isActionable && estadoSelecaoVendas[item.ticker] !== false;
            const isDisabled = !item.isActionable;
            const opacidade = isDisabled ? '0.6' : '1';
            
            // Layout Renda Fixa (Venda)
            if(item.ticker === 'Renda Fixa') {
                colunasHtml += `
                <div class="card mb-2 shadow-sm" style="border-left: 5px solid #e74c3c; opacity: ${opacidade};">
                    <div class="card-body p-3" style="display: flex; align-items: center; justify-content: space-between;">
                        <div style="display: flex; align-items: center;">
                            <div style="margin-right: 15px;">
                                <input type="checkbox" id="venda-${item.ticker}" class="scale-checkbox" ${isChecked ? 'checked' : ''} onchange="toggleSelecaoVenda('${item.ticker}')">
                            </div>
                            <span class="font-weight-bold text-danger" style="font-size: 1.1em;">Resgatar Renda Fixa</span>
                        </div>
                        <span class="font-weight-bold text-danger" style="font-size: 1.2em;">${formatarMoeda(item.valor)}</span>
                    </div>
                </div>`;
                return;
            }

            let motivoBloqueioHtml = '';
            if (!item.isActionable) {
                // 1. Tenta usar o motivo detalhado
                let msg = item.motivoBloqueioTexto;
                // 2. Fallbacks
                if (!msg) {
                    if (!item.motivoLucro) msg = 'Prejuízo';
                    else if (item.motivoLucro && !item.motivoPVP) msg = 'P/VP Baixo';
                    else if (!isModoAtivo) msg = 'Na tolerância';
                }
                motivoBloqueioHtml = `<div class="small text-danger mt-1 font-weight-bold"><i class="fas fa-ban"></i> Bloqueado: ${msg}</div>`;
            }

            // --- CÁLCULO DE DADOS EXTRAS PARA VENDAS ---
            const qtdVenda = Math.round(Math.abs(item.valor) / item.cotacao);
            const isLucro = item.lucroPrejuizo >= 0;
            const corResultado = isLucro ? '#27ae60' : '#c0392b';
            const sinal = isLucro ? '+' : '';

            colunasHtml += `
            <div class="card mb-2 shadow-sm" style="border-left: 5px solid ${item.isActionable ? '#e74c3c' : '#bdc3c7'}; opacity: ${opacidade};">
                <div class="card-body p-3" style="display: flex; flex-direction: row; align-items: flex-start;">
                    
                    <div style="flex: 0 0 30px; margin-right: 10px; margin-top: 3px;">
                        <input type="checkbox" id="venda-${item.ticker}" class="scale-checkbox" ${isChecked ? 'checked' : ''} onchange="toggleSelecaoVenda('${item.ticker}')" ${isDisabled ? 'disabled' : ''}>
                    </div>

                    <div style="flex: 1; min-width: 0; width: 100%;"> 
                        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                            <span class="ticker-rebalanceamento" data-ticker="${item.ticker}" style="cursor: pointer; font-size: 1.2em; font-weight: 800; color: #2c3e50;">
                                ${item.ticker}
                            </span>
                            <span class="font-weight-bold text-danger" style="font-size: 1.2em; white-space: nowrap;">
                                ${formatarMoeda(item.valor)}
                            </span>
                        </div>
                        
                        <div style="display: flex; justify-content: space-between; margin-top: 4px; color: #6c757d; font-size: 0.8em;">
                            <span>${formatarMoeda(item.cotacao)}</span>
                            <span>Qtd: <strong>${qtdVenda}</strong></span>
                            <span style="color: ${corResultado}; font-weight: bold;">
                                ${sinal}${formatarMoeda(item.lucroPrejuizo)} (${formatarPercentual(item.variation)})
                            </span>
                        </div>

                        ${motivoBloqueioHtml}
                    </div>
                </div>
            </div>`;
        });
        colunasHtml += `</div></div></div>`; 
    }

    // --- COLUNA 2: COMPRAS (Direita) ---
    const estiloColCompra = exibirReduzir ? 'flex: 0 0 50%; max-width: 50%;' : 'flex: 0 0 100%; max-width: 100%;';
    const classeColCompra = exibirReduzir ? 'col-md-6 col-12' : 'col-12';
    
    colunasHtml += `
        <div class="${classeColCompra} mb-4" style="${estiloColCompra}"> 
            <div class="dash-card border-success h-100">
                <div class="dash-header bg-success text-white d-flex justify-content-between align-items-center">
                    <h3 class="m-0 font-weight-bold" style="font-size: 1.1em;"><i class="fas fa-arrow-up"></i> COMPRAR / APORTAR</h3>
                    <span class="badge badge-light text-success font-weight-bold">Alocação</span>
                </div>
                <div class="dash-body p-3" style="background: #f0fff4;">`;

    // Layout Renda Fixa (Compra)
    if ((sugestoesDeCompra['Renda Fixa'] && sugestoesDeCompra['Renda Fixa'].valor > 0) || isRFPausada) {
        const valorRF = isRFPausada ? 0 : sugestoesDeCompra['Renda Fixa']?.valor || 0;
        const opacidadeRF = isRFPausada ? '0.6' : '1';
        
        colunasHtml += `
        <div class="card mb-2 shadow-sm" style="border-left: 5px solid #2ecc71; opacity: ${opacidadeRF};">
            <div class="card-body p-3" style="display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center;">
                    <div style="margin-right: 15px;">
                        <input type="checkbox" class="scale-checkbox checkbox-compra-rf" ${!isRFPausada ? 'checked' : ''}>
                    </div>
                    <span class="font-weight-bold text-success" style="font-size: 1.1em;">Renda Fixa</span>
                </div>
                <span class="font-weight-bold text-success" style="font-size: 1.2em;">${formatarMoeda(valorRF)}</span>
            </div>
        </div>`;
    }

    const listaCompras = todosOsCandidatos
        .filter(c => sugestoesDeCompra[c.ticker] || (todosOsAtivos.find(a => a.ticker === c.ticker)?.statusAporte === 'Pausado'))
        .sort((a, b) => b.scoreFinalAlocacao - a.scoreFinalAlocacao);

    if (listaCompras.length > 0) {
        listaCompras.forEach(candidato => {
            const ativo = todosOsAtivos.find(a => a.ticker === candidato.ticker);
            const isPaused = ativo.statusAporte === 'Pausado';
            const sugestao = sugestoesDeCompra[candidato.ticker];
            
            const opacidade = isPaused ? '0.6' : '1';
            const valorSugerido = sugestao ? sugestao.qtd * sugestao.preco : 0;
            const qtdSugerida = sugestao ? sugestao.qtd : 0;

            const precoTetoGraham = calcularPrecoTetoGraham(dadosDeMercado.cotacoes[ativo.ticker]?.lpa_acao, dadosDeMercado.cotacoes[ativo.ticker]?.vpa);
            const alertaGraham = (precoTetoGraham > 0 && candidato.cotacao > precoTetoGraham) 
                ? `<div class="mt-1 small text-warning font-weight-bold"><i class="fas fa-exclamation-triangle"></i> Graham Excedido</div>` 
                : '';

            // Layout ATIVOS (Compra)
            colunasHtml += `
            <div class="card mb-2 shadow-sm" style="border-left: 5px solid ${isPaused ? '#95a5a6' : '#2ecc71'}; opacity: ${opacidade};">
                <div class="card-body p-3" style="display: flex; flex-direction: row; align-items: flex-start;">
                    
                    <div style="flex: 0 0 30px; margin-right: 10px; margin-top: 3px;">
                         <input type="checkbox" class="scale-checkbox checkbox-compra-ativo" data-ticker="${candidato.ticker}" ${!isPaused ? 'checked' : ''}>
                    </div>

                    <div style="flex: 1; min-width: 0; width: 100%;">
                        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                             <span class="ticker-rebalanceamento" data-ticker="${candidato.ticker}" style="cursor: pointer; font-size: 1.2em; font-weight: 800; color: #2c3e50;">
                                ${candidato.ticker}
                            </span>
                            <span class="font-weight-bold text-success" style="font-size: 1.2em; white-space: nowrap;">
                                ${formatarMoeda(valorSugerido)}
                            </span>
                        </div>

                        <div style="display: flex; justify-content: space-between; margin-top: 4px; color: #6c757d; font-size: 0.8em;">
                            <span>${formatarMoeda(candidato.cotacao)}</span>
                            <span>Score: <strong>${candidato.scores.final.toFixed(1)}</strong></span>
                            <span>Qtd: <strong>${qtdSugerida}</strong></span>
                        </div>
                        ${alertaGraham}
                    </div>
                </div>
            </div>`;
        });
    } else if (!sugestoesDeCompra['Renda Fixa']) {
        colunasHtml += `<div class="text-center p-4 text-muted font-italic">Nenhum aporte sugerido.</div>`;
    }

    colunasHtml += `</div></div>`; 

    container.innerHTML = visaoGeralHtml + cardControleHtml + colunasHtml;

    // --- LISTENERS (ATUALIZADOS) ---
    
    // 1. Alternar Modo de Alocação (Compra)
    document.querySelectorAll('input[name="modo-alocacao"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            dadosAlocacao.modoRebalanceamento = e.target.value;
            salvarDadosAlocacao();
            renderizarTelaConsultaBalanceamento();
        });
    });

    // 2. Toggle Modo Seguro (Venda)
    const ckModoSeguro = document.getElementById('config-modo-seguro');
    if (ckModoSeguro) {
        ckModoSeguro.addEventListener('change', (e) => {
            configuracoesFiscais.considerarRegrasVenda = e.target.checked;
            salvarConfiguracoesFiscais(); 
            renderizarTelaConsultaBalanceamento();
        });
    }

    // 3. Listener: Margem Modo Seguro (Sincronização Bidirecional)
    const inputMargemSegura = document.getElementById('config-margem-seguro');
    if (inputMargemSegura) {
        inputMargemSegura.addEventListener('change', (e) => {
            // Substitui vírgula por ponto para o JS entender
            let valorTexto = e.target.value.replace(',', '.');
            let val = parseFloat(valorTexto);
            
            if (isNaN(val) || val < 0) val = 0;
            
            // Salva na global (dividido por 100 pois é percentual)
            configuracoesFiscais.margemLucroModoSeguro = val / 100;
            salvarConfiguracoesFiscais();
            
            // Sincroniza Configurações (Formatado)
            const inputConfigTelaConfig = document.getElementById('config-margem-modo-seguro');
            if (inputConfigTelaConfig) {
                inputConfigTelaConfig.value = formatarDecimal(val);
            }

            renderizarTelaConsultaBalanceamento();
        });
    }

    // 4. Listener: Margem Oportunista (Já existente, apenas confirmando a lógica)
    const inputMargem = document.getElementById('config-margem-lucro');
    if (inputMargem) {
        inputMargem.addEventListener('change', (e) => {
            // Substitui vírgula por ponto
            let valorTexto = e.target.value.replace(',', '.');
            let val = parseFloat(valorTexto);
            
            if (isNaN(val) || val < 0) val = 0;
            
            configuracoesFiscais.margemLucroVenda = val / 100; 
            salvarConfiguracoesFiscais();

            // Sincroniza Configurações (Formatado)
            const inputConfigVendaTelaConfig = document.getElementById('config-margem-venda');
            if (inputConfigVendaTelaConfig) {
                inputConfigVendaTelaConfig.value = formatarDecimal(val);
            }

            renderizarTelaConsultaBalanceamento();
        });
    }

    // 5. Checkbox Renda Fixa (Compra)
    const ckRF = container.querySelector('.checkbox-compra-rf');
    if(ckRF) {
        ckRF.addEventListener('change', (e) => {
            dadosAlocacao.statusAporteRendaFixa = e.target.checked ? 'Ativo' : 'Pausado';
            salvarDadosAlocacao(); 
            renderizarTelaConsultaBalanceamento();
        });
    }

    // 6. Checkbox Ativos Individuais (Compra)
    container.querySelectorAll('.checkbox-compra-ativo').forEach(ck => {
        ck.addEventListener('change', (e) => {
            const ticker = e.target.dataset.ticker;
            const ativo = todosOsAtivos.find(a => a.ticker === ticker);
            if (ativo) {
                ativo.statusAporte = e.target.checked ? 'Ativo' : 'Pausado';
                salvarAtivos(); 
                renderizarTelaConsultaBalanceamento();
            }
        });
    });

    planoDeAcaoAtual.compras = Object.values(sugestoesDeCompra).filter(s => s.ticker);
    planoDeAcaoAtual.vendas = dadosProcessadosVenda.listaReduzir
        .filter(item => item.isActionable && item.ticker !== 'Renda Fixa')
        .map(item => {
            const cotacaoAtual = dadosDeMercado.cotacoes[item.ticker]?.valor || 0;
            return {
                ticker: item.ticker,
                qtd: cotacaoAtual > 0 ? Math.round(Math.abs(item.valor) / cotacaoAtual) : 0,
                preco: cotacaoAtual
            };
        }).filter(item => item.qtd > 0);
}

async function aplicarPlanoDeAcaoParaSimulacao() {
    const btn = document.getElementById('btn-levar-plano-para-negociar');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando...';
    btn.disabled = true;
    isNavigating = true; 

    try {
        // --- CORREÇÃO DO BUG DE DUPLICIDADE ---
        // Antes: Pegava o capital TOTAL (Vendas + Aporte).
        // Agora: Pega apenas o APORTE NOVO (Dinheiro do bolso).
        // O dinheiro das vendas será gerado naturalmente na tela de negociação ao incluir os ativos de venda.
        const aporteDinheiroNovo = parseDecimal(document.getElementById('balanceamento-aporte-valor').value || '0');

        // Encontra o valor reservado para Renda Fixa
        const elementoAporteRF = document.querySelector('#plano-de-acao-container .ticker-aporte');
        let valorAporteRF = 0;
        if (elementoAporteRF) {
            const containerItem = elementoAporteRF.closest('.rebalanceamento-item');
            // Verifica se é um item de Renda Fixa (pelo texto do ticker) e se não está pausado
            if (elementoAporteRF.textContent.includes('Renda Fixa') && !containerItem.classList.contains('item-pausado')) {
                const elementoValor = containerItem.querySelector('strong.valor-positivo');
                if (elementoValor) {
                    valorAporteRF = parseDecimal(elementoValor.textContent);
                }
            }
        }
        
        // O Aporte para a simulação de RV é: (Dinheiro Novo - O que vai para a RF)
        // Se for negativo (ex: Venda paga a RF), o saldo inicial da simulação começa negativo, 
        // e será coberto pelas vendas que também estão indo para lá.
        const aporteLiquidoParaRV = aporteDinheiroNovo - valorAporteRF;

        dadosSimulacaoNegociar = { fiis: {}, acoes: {}, aporteTotal: '' };
        
        planoDeAcaoAtual.vendas.forEach(item => {
            if (estadoSelecaoVendas[item.ticker] !== false) {
                const ativoInfo = todosOsAtivos.find(a => a.ticker === item.ticker);
                if (!ativoInfo) return;
                const tipo = ativoInfo.tipo === 'Ação' ? 'acoes' : 'fiis';
                dadosSimulacaoNegociar[tipo][item.ticker] = {
                    qtd: -item.qtd, // Quantidade negativa para venda
                    preco: item.preco
                };
            }
        });

        planoDeAcaoAtual.compras.forEach(item => {
            const ativoInfo = todosOsAtivos.find(a => a.ticker === item.ticker);
            if (!ativoInfo) return;
            
            if (ativoInfo.tipo === 'Ação' || ativoInfo.tipo === 'FII' || ativoInfo.tipo === 'ETF') {
                const tipo = ativoInfo.tipo === 'Ação' ? 'acoes' : 'fiis';

                if (!dadosSimulacaoNegociar[tipo][item.ticker]) {
                    const dadosParaSalvar = {
                        qtd: item.qtd,
                        preco: item.preco
                    };
                    if (tipo === 'acoes') {
                        dadosParaSalvar.bazinYield = ativoInfo.metaYieldBazin || 0.06;
                    }
                    dadosSimulacaoNegociar[tipo][item.ticker] = dadosParaSalvar;
                }
            }
        });

        dadosSimulacaoNegociar.aporteTotal = formatarDecimalParaInput(aporteLiquidoParaRV);

        await salvarDadosSimulacaoNegociar();

        mostrarTela('negociar');
        renderizarTelaNegociar();
        
        alert('Plano de ação carregado na tela de simulação!');

    } catch (error) {
        console.error("Erro ao levar plano para simulação:", error);
        alert("Ocorreu um erro ao carregar o plano. Tente novamente.");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
        isNavigating = false; 
    }
}
function abrirModalBalanceamento(tipoAtivo) {
    const modal = document.getElementById('modal-balanceamento-detalhes');
    const titulo = document.getElementById('modal-balanceamento-titulo');
    const container = document.getElementById('modal-balanceamento-container');
    
    titulo.textContent = `Análise de Balanceamento - ${tipoAtivo}`;
    container.innerHTML = '<h4>Calculando...</h4>';
    abrirModal('modal-balanceamento-detalhes');

    const dados = gerarDadosBalanceamento('todos'); 
    let categoria;
    let ativosParaTabela = [];
    let dadosParaProcessar = {};

    if (tipoAtivo === 'Renda Variável') {
        const catAcoes = dados.categorias['Ações'];
        const catFIIs = dados.categorias['FIIs'];
        const catETFs = dados.categorias['ETF'];

        categoria = {
            ideal: { 
                valor: (catAcoes?.ideal.valor || 0) + (catFIIs?.ideal.valor || 0) + (catETFs?.ideal.valor || 0),
                percentual: (catAcoes?.ideal.percentual || 0) + (catFIIs?.ideal.percentual || 0) + (catETFs?.ideal.percentual || 0)
            },
            atual: { 
                valor: (catAcoes?.atual.valor || 0) + (catFIIs?.atual.valor || 0) + (catETFs?.atual.valor || 0)
            },
            ajuste: {
                valor: ((catAcoes?.ideal.valor || 0) + (catFIIs?.ideal.valor || 0) + (catETFs?.ideal.valor || 0)) - ((catAcoes?.atual.valor || 0) + (catFIIs?.atual.valor || 0) + (catETFs?.atual.valor || 0))
            }
        };
        ativosParaTabela = [...(catAcoes?.ativos || []), ...(catFIIs?.ativos || []), ...(catETFs?.ativos || [])];
        
        // --- INÍCIO DA ALTERAÇÃO ---
        // Monta o objeto na estrutura correta que a função 'processarRebalanceamento' espera.
        dadosParaProcessar = {
            'Renda Variável': {
                ajuste: categoria.ajuste,
                ativos: ativosParaTabela
            }
        };
        // --- FIM DA ALTERAÇÃO ---

    } else {
        const chaveCategoria = tipoAtivo === 'Ação' ? 'Ações' : tipoAtivo === 'FII' ? 'FIIs' : tipoAtivo;
        categoria = dados.categorias[chaveCategoria];
        ativosParaTabela = categoria ? categoria.ativos : [];

        // --- INÍCIO DA ALTERAÇÃO ---
        // Monta o objeto na estrutura correta também para categorias individuais.
        if (categoria) {
            dadosParaProcessar = { [chaveCategoria]: categoria };
        }
        // --- FIM DA ALTERAÇÃO ---
    }

    if (!categoria || ativosParaTabela.length === 0) {
        container.innerHTML = `<p>Nenhuma posição ou alocação ideal definida para ${tipoAtivo}.</p>`;
    } else {
        // --- INÍCIO DA ALTERAÇÃO ---
        // A chamada agora usa o objeto 'dadosParaProcessar' que foi montado corretamente.
        const dadosProcessados = processarRebalanceamento(dadosParaProcessar);
        // --- FIM DA ALTERAÇÃO ---
        
        const rebalanceamentoHtml = `
            <div class="balanceamento-categoria-summary">
                <div><label>Valor Atual da Categoria</label><span>${formatarMoeda(categoria.atual.valor)}</span></div>
                <div><label>Valor Ideal da Categoria</label><span>${formatarMoeda(categoria.ideal.valor)}</span></div>
                <div class="remanejamento-valor"><label>Valor a Remanejar</label><span>${formatarMoeda(dadosProcessados.totalRemanejar)}</span></div>
            </div>
            <div class="rebalanceamento-container">
                <div class="rebalanceamento-coluna">
                    <h4><i class="fas fa-arrow-down" style="color: var(--danger-color);"></i> Reduzir</h4>
                     ${dadosProcessados.listaReduzir.map(item => `<div class="rebalanceamento-item"><span>${item.ticker}</span><strong class="valor-negativo">${formatarMoeda(item.valor)}</strong></div>`).join('')}
                </div>
                <div class="rebalanceamento-coluna">
                    <h4><i class="fas fa-arrow-up" style="color: var(--success-color);"></i> Aportar</h4>
                     ${dadosProcessados.listaAportar.map(item => `<div class="rebalanceamento-item"><span>${item.ticker}</span><strong class="valor-positivo">${formatarMoeda(item.valor)}</strong></div>`).join('')}
                </div>
            </div>
            <hr style="margin: 25px 0;">
            <h4 style="text-align: center; margin-bottom: 15px;">Visão Detalhada</h4>
        `;
        const tabelaDetalhadaHtml = gerarTabelaBalanceamentoHtml(ativosParaTabela);
        container.innerHTML = rebalanceamentoHtml + tabelaDetalhadaHtml;
    }
}
function gerarTabelaBalanceamentoHtml(dadosAtivos) {
    let tabelaHtml = `
        <table class="balanceamento-tabela" style="font-size: 0.9em;">
            <thead>
                <tr>
                    <th rowspan="2">Ativo</th>
                    <th rowspan="2">Status</th>
                    <th colspan="3" class="group-header group-1">Posição Ideal</th>
                    <th colspan="3" class="group-header group-2">Posição Atual</th>
                    <th colspan="3" class="group-header group-3">Ajuste Necessário</th>
                </tr>
                <tr>
                    <th class="percentual group-1">% Global</th>
                    <th class="numero group-1">Valor (R$)</th>
                    <th class="numero group-1">Qtd.</th>
                    <th class="percentual group-2">% Global</th>
                    <th class="numero group-2">Valor (R$)</th>
                    <th class="numero group-2">Qtd.</th>
                    <th class="percentual group-3">Ajuste %</th>
                    <th class="numero group-3">Ajuste (R$)</th>
                    <th class="numero group-3">Ajuste Qtd.</th>
                </tr>
            </thead>
            <tbody>
    `;

    dadosAtivos.forEach(ativo => {
        const statusLabel = ativo.status;
        let classeStatus = '';
        if (statusLabel === 'OK') {
            classeStatus = 'status-ok';
        } else if (statusLabel === 'Aportar') {
            classeStatus = 'status-aportar';
        } else {
            classeStatus = 'status-reduzir';
        }

        // <<< ALTERAÇÃO APLICADA AQUI: A classe de status agora está na tag <tr> >>>
        tabelaHtml += `
            <tr class="${classeStatus}">
                <td>${ativo.ticker}</td>
                <td><strong class="${classeStatus}">${statusLabel}</strong></td>
                <td class="percentual group-1">${formatarPercentual(ativo.ideal.percentualGlobal)}</td>
                <td class="numero group-1">${formatarMoeda(ativo.ideal.valor)}</td>
                <td class="numero group-1">${Math.round(ativo.ideal.quantidade)}</td>
                <td class="percentual group-2">${formatarPercentual(ativo.atual.percentualGlobal)}</td>
                <td class="numero group-2">${formatarMoeda(ativo.atual.valor)}</td>
                <td class="numero group-2">${Math.round(ativo.atual.quantidade)}</td>
                <td class="percentual group-3">${formatarPercentual(ativo.ajuste.percentual)}</td>
                <td class="numero group-3">${formatarMoeda(ativo.ajuste.valor)}</td>
                <td class="numero group-3">${Math.round(ativo.ajuste.quantidade)}</td>
            </tr>
        `;
    });

    tabelaHtml += `</tbody></table>`;
    return tabelaHtml;
}
function resetarSimulacaoNegociacao() {
    if (!confirm('Tem certeza que deseja limpar toda a simulação? As quantidades serão zeradas e os preços serão atualizados para os valores de mercado.')) {
        return;
    }

    ['#negociar-fiis-tbody', '#negociar-acoes-tbody'].forEach(tbodyId => {
        const tbody = document.querySelector(tbodyId);
        if (tbody) {
            tbody.querySelectorAll('tr').forEach(tr => {
                const inputQtd = tr.querySelector('.negociar-input-qtd');
                const inputPreco = tr.querySelector('.negociar-input-preco');
                // Pega o preço atual da célula (índice 2, pois 0 é nome, 1 é PM)
                const precoAtual = parseDecimal(tr.cells[2].textContent);

                if (inputQtd) inputQtd.value = '';
                if (inputPreco) inputPreco.value = formatarDecimalParaInput(precoAtual);
                
                // Dispara o evento para forçar o recálculo da linha e dos totais
                if (inputPreco) {
                     inputPreco.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        }
    });

    // --- CORREÇÃO: Limpa também o valor do aporte ---
    dadosSimulacaoNegociar.aporteTotal = '';
    const inputAporte = document.getElementById('negociar-aporte-valor');
    if (inputAporte) {
        inputAporte.value = '';
    }
    
    // Reseta os dados internos de simulação
    dadosSimulacaoNegociar.fiis = {};
    dadosSimulacaoNegociar.acoes = {};

    atualizarResumoAporte();
    salvarDadosSimulacaoNegociar();
    alert('Simulação resetada!');
}

function abrirModalResumoNegociacao() {
    const compras = [];
    const vendas = [];

    for (const tipo in dadosSimulacaoNegociar) {
        if (tipo === 'fiis' || tipo === 'acoes') {
            for (const ticker in dadosSimulacaoNegociar[tipo]) {
                const sim = dadosSimulacaoNegociar[tipo][ticker];
                if (sim.qtd && sim.qtd > 0) {
                    compras.push({
                        ticker: ticker,
                        quantidade: sim.qtd,
                        preco: sim.preco || 0,
                        total: sim.qtd * (sim.preco || 0)
                    });
                } else if (sim.qtd && sim.qtd < 0) {
                    vendas.push({
                        ticker: ticker,
                        quantidade: Math.abs(sim.qtd),
                        preco: sim.preco || 0,
                        total: Math.abs(sim.qtd) * (sim.preco || 0)
                    });
                }
            }
        }
    }

    if (compras.length === 0 && vendas.length === 0) {
        alert('Nenhuma compra ou venda simulada para visualizar. Preencha a coluna "Qtd" de pelo menos um ativo.');
        return;
    }

    const container = document.getElementById('modal-resumo-negociacao-conteudo');
    let conteudoHtml = '';

    if (vendas.length > 0) {
        vendas.sort((a, b) => b.total - a.total);
        conteudoHtml += `<h4>Vendas Simuladas</h4><table><thead>
            <tr><th>Ativo</th><th class="numero">Quantidade</th><th class="numero">Preço de Venda</th><th class="numero">Valor Total</th></tr>
        </thead><tbody>`;
        vendas.forEach(venda => {
            conteudoHtml += `
                <tr>
                    <td>${venda.ticker}</td>
                    <td class="numero">${venda.quantidade}</td>
                    <td class="numero">${formatarMoeda(venda.preco)}</td>
                    <td class="numero">${formatarMoeda(venda.total)}</td>
                </tr>`;
        });
        conteudoHtml += '</tbody></table>';
    }

    if (compras.length > 0) {
        compras.sort((a, b) => b.total - a.total);
        conteudoHtml += `<h4 style="margin-top: 20px;">Compras Simuladas</h4><table><thead>
            <tr><th>Ativo</th><th class="numero">Quantidade</th><th class="numero">Preço de Compra</th><th class="numero">Valor Total</th></tr>
        </thead><tbody>`;
        compras.forEach(compra => {
            conteudoHtml += `
                <tr>
                    <td>${compra.ticker}</td>
                    <td class="numero">${compra.quantidade}</td>
                    <td class="numero">${formatarMoeda(compra.preco)}</td>
                    <td class="numero">${formatarMoeda(compra.total)}</td>
                </tr>`;
        });
        conteudoHtml += '</tbody></table>';
    }

    const totalCompra = compras.reduce((soma, item) => soma + item.total, 0);
    const totalVenda = vendas.reduce((soma, item) => soma + item.total, 0);
    const valorLiquido = totalVenda - totalCompra;
    const classeLiquido = valorLiquido >= 0 ? 'valor-positivo' : 'valor-negativo';

    const rendimentoAtualFiis = parseDecimal(document.getElementById('total-rend-atual-fiis').textContent);
    const rendimentoPosCompraFiis = parseDecimal(document.getElementById('total-rend-pos-compra-fiis').textContent);
    const rendimentoAtualAcoes = parseDecimal(document.getElementById('total-rend-atual-acoes').textContent);
    const rendimentoPosCompraAcoes = parseDecimal(document.getElementById('total-rend-pos-compra-acoes').textContent);
    
    const rendimentoTotalAtual = rendimentoAtualFiis + rendimentoAtualAcoes;
    const rendimentoTotalPosCompra = rendimentoPosCompraFiis + rendimentoPosCompraAcoes;
    const acrescimoRendimento = rendimentoTotalPosCompra - rendimentoTotalAtual;

    const percentualAcrescimo = (rendimentoTotalAtual > 0) ? (acrescimoRendimento / rendimentoTotalAtual) : (acrescimoRendimento > 0 ? Infinity : 0);
    const sinal = acrescimoRendimento > 0.005 ? '+' : '';
    
    const totaisHtml = `
        <div class="resumo-negociacao-totais">
            <div>
                <span>Total das Vendas:</span>
                <span>${formatarMoeda(totalVenda)}</span>
            </div>
            <div>
                <span>Total das Compras:</span>
                <span>${formatarMoeda(totalCompra)}</span>
            </div>
            <div class="total-compra">
                <strong>Líquido da Operação:</strong>
                <strong class="${classeLiquido}">${formatarMoeda(valorLiquido)}</strong>
            </div>
            <hr style="border: none; border-top: 1px solid #eee; margin: 10px 0;">
            <div>
                <span>Rendimento Mensal (Antes):</span>
                <span>${formatarMoeda(rendimentoTotalAtual)}</span>
            </div>
            <div>
                <span>Rendimento Mensal (Depois):</span>
                <span>${formatarMoeda(rendimentoTotalPosCompra)}</span>
            </div>
            <div>
                <strong>Acréscimo no Rendimento:</strong>
                <div class="valor-agrupado-direita">
                    <strong>${formatarMoeda(acrescimoRendimento)}</strong>
                    <small>${sinal}${formatarPercentual(percentualAcrescimo)}</small>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = conteudoHtml + totaisHtml;
    abrirModal('modal-resumo-negociacao');
}
function criarNotaAPartirDaSimulacao() {
    const operacoesSimuladas = [];
    ['fiis', 'acoes'].forEach(tipo => {
        if (dadosSimulacaoNegociar[tipo]) {
            for (const ticker in dadosSimulacaoNegociar[tipo]) {
                const sim = dadosSimulacaoNegociar[tipo][ticker];
                if (sim.qtd && sim.qtd !== 0) {
                    const tipoOperacao = sim.qtd > 0 ? 'compra' : 'venda';
                    const quantidade = Math.abs(sim.qtd);
                    const preco = sim.preco || 0;
                    operacoesSimuladas.push({
                        id: Date.now() + Math.random(),
                        ativo: ticker,
                        tipo: tipoOperacao,
                        quantidade: quantidade,
                        valor: arredondarMoeda(quantidade * preco)
                    });
                }
            }
        }
    });

    if (operacoesSimuladas.length === 0) {
        alert("Não há negociações simuladas para criar uma nota. Preencha a coluna 'Qtd' de pelo menos um ativo.");
        return;
    }

    if (!confirm(`Você deseja criar uma nova nota de negociação com ${operacoesSimuladas.length} operação(ões) a partir da sua simulação atual?`)) {
        return;
    }

    iniciarNovaNota(); // Prepara a tela de lançamento com uma nota em branco (e com "Selecione...")

    // --- INÍCIO DAS NOVAS LINHAS ---
    const hoje = new Date().toISOString().split('T')[0];
    notaAtual.numero = '---';
    notaAtual.data = hoje;
    
    // Atualiza a interface
    document.getElementById('nota-numero').value = '---';
    document.getElementById('nota-data').value = hoje;
    // --- FIM DAS NOVAS LINHAS ---

    notaAtual.operacoes = operacoesSimuladas; // Substitui as operações vazias pelas simuladas

    // Atualiza a tabela de operações e os totais (incluindo data de liquidação)
    renderizarTabelaOperacoes();
    atualizarTotais();

    // Avisa ao usuário para completar o preenchimento
    setTimeout(() => {
        alert(`Operações carregadas! Por favor, selecione a Corretora, confirme a Data e o Número da Nota, e preencha os Custos antes de salvar.`);
    }, 100);
}
