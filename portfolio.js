function gerarPosicaoDetalhada(dataLimite = null) {
    const posicoes = {};
    let eventos = [];

    // Adiciona todos os eventos que podem alterar a posição
    posicaoInicial.forEach(p => eventos.push({ data: p.data, tipo: p.tipoRegistro, payload: p }));
    todasAsNotas.forEach(n => n.operacoes.forEach(op => eventos.push({ data: n.data, tipo: 'OPERACAO_NOTA', payload: {...op, custosNota: n.custos, irrfNota: n.irrf, corretora: n.corretora, totalOperacoesNota: n.operacoes.reduce((soma, op) => soma + op.valor, 0)} })));
    todosOsAjustes.forEach(a => eventos.push({ data: a.data, tipo: a.tipoAjuste, payload: a }));

    eventos.sort((a,b) => new Date(a.data) - new Date(b.data));

    eventos.filter(e => !dataLimite || new Date(e.data) <= new Date(dataLimite + 'T23:59:59')).forEach(evento => {
        const payload = evento.payload;
        const processaTicker = (ticker) => {
            if (!posicoes[ticker]) {
                posicoes[ticker] = { quantidade: 0, precoMedio: 0, porCorretora: {} };
            }
            return posicoes[ticker];
        };

        switch(evento.tipo) {
            case 'SUMARIO_MANUAL': {
                let pos = processaTicker(payload.ticker);
                let qtdTotalSumario = 0;
                payload.posicoesPorCorretora.forEach(pc => {
                    pos.porCorretora[pc.corretora] = (pos.porCorretora[pc.corretora] || 0) + pc.quantidade;
                    qtdTotalSumario += pc.quantidade;
                });
                pos.quantidade += qtdTotalSumario; // CORREÇÃO: Acumula o total
                pos.precoMedio = payload.precoMedio; // ATENÇÃO: Ver observação abaixo
                break;
            }
            case 'TRANSACAO_HISTORICA': {
                let pos = processaTicker(payload.ticker);
                const corretora = payload.corretora;
                const quantidade = payload.quantidade;
                if (payload.transacao.toLowerCase() === 'compra') {
                    pos.quantidade += quantidade;
                    pos.porCorretora[corretora] = (pos.porCorretora[corretora] || 0) + quantidade;
                } else {
                    pos.quantidade -= quantidade;
                    pos.porCorretora[corretora] = (pos.porCorretora[corretora] || 0) - quantidade;
                }
                pos.precoMedio = payload.precoMedio;
                break;
            }
            case 'OPERACAO_NOTA': {
                let pos = processaTicker(payload.ativo);
                const corretora = payload.corretora;
                const qtdAnterior = pos.quantidade;
                const pmAnterior = pos.precoMedio;
                const qtdOperacao = payload.quantidade;

                if (payload.tipo.toLowerCase() === 'compra') {
                    const valorOperacao = payload.valor;
                    const custoRateado = payload.totalOperacoesNota > 0 ? (valorOperacao / payload.totalOperacoesNota) * (payload.custosNota + payload.irrfNota) : 0;
                    const precoCompraComCustos = qtdOperacao > 0 ? (valorOperacao + custoRateado) / qtdOperacao : 0;
                    const novoTotalFinanceiro = (qtdAnterior * pmAnterior) + (qtdOperacao * precoCompraComCustos);
                    pos.quantidade += qtdOperacao;
                    pos.precoMedio = pos.quantidade > 0 ? novoTotalFinanceiro / pos.quantidade : 0;
                    pos.porCorretora[corretora] = (pos.porCorretora[corretora] || 0) + qtdOperacao;
                } else { // Venda
                    pos.quantidade -= qtdOperacao;
                    pos.porCorretora[corretora] = (pos.porCorretora[corretora] || 0) - qtdOperacao;
                }
                if (pos.quantidade < 0.000001) pos.precoMedio = 0;
                break;
            }
            case 'transferencia': {
                payload.ativosTransferidos.forEach(ativoT => {
                    let pos = processaTicker(ativoT.ticker);
                    pos.porCorretora[payload.corretoraOrigem] = (pos.porCorretora[payload.corretoraOrigem] || 0) - ativoT.quantidade;
                    pos.porCorretora[payload.corretoraDestino] = (pos.porCorretora[payload.corretoraDestino] || 0) + ativoT.quantidade;
                });
                break;
            }
            case 'ajuste_pm': {
                let pos = processaTicker(payload.ticker);
                pos.precoMedio = payload.novoPrecoMedio;
                break;
            }
            case 'split_grupamento': {
                let pos = processaTicker(payload.ticker);
                if (pos.quantidade > 0) {
                    const de = payload.proporcaoDe;
                    const para = payload.proporcaoPara;
                    pos.quantidade = (pos.quantidade / de) * para;
                    pos.precoMedio = (pos.precoMedio / para) * de;
                }
                break;
            }
            case 'evento_ativo': {
                let pos = processaTicker(payload.ticker);
                if (payload.tipoEvento === 'entrada') {
                    const qtdAnterior = pos.quantidade;
                    const pmAnterior = pos.precoMedio;
                    
                    let qtdEntradaTotal = 0;
                    payload.detalhes.forEach(detalhe => {
                        pos.porCorretora[detalhe.corretora] = (pos.porCorretora[detalhe.corretora] || 0) + detalhe.quantidade;
                        qtdEntradaTotal += detalhe.quantidade;
                    });
                    
                    const pmEntrada = payload.precoMedio;
                    const novoTotalFinanceiro = (qtdAnterior * pmAnterior) + (qtdEntradaTotal * pmEntrada);
                    
                    pos.quantidade += qtdEntradaTotal;
                    pos.precoMedio = pos.quantidade > 0 ? novoTotalFinanceiro / pos.quantidade : 0;

                } else if (payload.tipoEvento === 'saida') {
                    payload.detalhes.forEach(detalhe => {
                        pos.porCorretora[detalhe.corretora] = (pos.porCorretora[detalhe.corretora] || 0) - detalhe.quantidade;
                        pos.quantidade -= detalhe.quantidade;
                    });
                }
                if (pos.quantidade < 0.000001) pos.precoMedio = 0;
                break;
            }
        }
    });
    return posicoes;
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

    for (const nomeCategoria in dadosCategorias) {
        if (dadosCategorias[nomeCategoria] && Array.isArray(dadosCategorias[nomeCategoria].ativos)) {
            
            // No modo 'categoria', só vende se a categoria inteira estiver estourada.
            // No modo 'ativo', essa trava é ignorada.
            const categoriaEstaSuperalocada = dadosCategorias[nomeCategoria]?.ajuste.valor < 0;

            dadosCategorias[nomeCategoria].ativos.forEach(ativo => {
                
                // Lógica de Aporte (Independe do modo aqui, pois a priorização ocorre na renderização)
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

                    if (modo === 'categoria') {
                        // Lógica Original: Respeita hierarquia da categoria
                        if (categoriaEstaSuperalocada) {
                            deveSugerirVenda = true;
                        }
                    } else {
                        // Lógica Nova (Por Ativo): Banda de Tolerância de 2%
                        // ativo.ajuste.percentual é (Ideal - Atual). 
                        // Ex: Meta 5%, Atual 7.1% -> Diferença -2.1% (-0.021)
                        // A condição é: excedeu 2%? (ou seja, é menor que -0.02?)
                        if (ativo.ajuste.percentual < -0.02) {
                            deveSugerirVenda = true;
                        }
                    }

                    if (deveSugerirVenda) {
                        const quantidadeASerVendida = Math.floor(Math.abs(ativo.ajuste.quantidade));
                        const valorAReduzir = -(quantidadeASerVendida * ativo.atual.cotacao);
                        
                        // Trava de Prejuízo (Sempre Ativa)
                        const vendavelComLucro = ativo.atual.cotacao > ativo.precoMedio;
                        
                        let atendeCriterioPVP = true;
                        let pvpValorCalculado = 0;

                        // Trava de P/VP (Apenas no modo Categoria)
                        if (nomeCategoria === 'FIIs') {
                            const pvp = (ativo.vpa > 0) ? (ativo.atual.cotacao / ativo.vpa) : 0;
                            pvpValorCalculado = pvp;
                            
                            if (modo === 'categoria' && pvp > 0 && pvp < 1) {
                                atendeCriterioPVP = false;
                            }
                        }
                        
                        const isActionable = vendavelComLucro && atendeCriterioPVP;
                        
                        const lucroPrejuizo = (ativo.atual.cotacao - ativo.precoMedio) * quantidadeASerVendida;

                        resultado.listaReduzir.push({
                            ticker: ativo.ticker,
                            valor: valorAReduzir, 
                            cotacao: ativo.atual.cotacao,
                            isActionable: isActionable,
                            yieldOnMarket: ativo.yieldOnMarket,
                            variation: ativo.variation,
                            lucroPrejuizo: lucroPrejuizo,
                            motivoLucro: vendavelComLucro,
                            motivoPVP: atendeCriterioPVP,
                            pvp: pvpValorCalculado,
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
function calcularScoreDeQualidade(ativoInfo, dadosMercadoAtivo) {
    const componentes = { final: 0, yield: 0, bazin: 0, payout: 0, pvp: 0, dataCom: 0 };
    if (!ativoInfo || !dadosMercadoAtivo) return componentes;

    // Lógica para ativos planejados (sem posição)
    const posicoesAtuais = gerarPosicaoDetalhada();
    const posicaoDoAtivo = posicoesAtuais[ativoInfo.ticker];
    if (!posicaoDoAtivo || posicaoDoAtivo.quantidade < 0.000001) {
        componentes.final = 50; // Score fixo e mediano
        return componentes;
    }

    const precoAtual = dadosMercadoAtivo.valor || 0;

    if (ativoInfo.tipo === 'Ação') {
        const pesos = { dy: 0.45, bazin: 0.35, payout: 0.05, dataCom: 0.15 };
        const dataInicioIninterrupto = getInicioIninterrupto(ativoInfo.ticker);
        const projecaoAnual = calcularProjecaoAnualUnitaria(ativoInfo.ticker, { limiteAnos: 5, dataInicio: dataInicioIninterrupto });

        if (projecaoAnual > 0 && precoAtual > 0) {
            const yieldProjetado = projecaoAnual / precoAtual;
            componentes.yield = Math.min((yieldProjetado / 0.12), 1) * 100;

            const metaYieldBazin = ativoInfo.metaYieldBazin || 0.06;
            if (metaYieldBazin > 0) {
                const precoTetoBazin = calcularPrecoTetoBazin(projecaoAnual, metaYieldBazin);
                if (precoTetoBazin > 0 && precoAtual < precoTetoBazin) {
                    componentes.bazin = ((precoTetoBazin - precoAtual) / precoTetoBazin) * 100;
                }
            }
            
            const lpa = dadosMercadoAtivo.lpa_acao || 0;
            if (lpa > 0) {
                const payout = projecaoAnual / lpa;
                if (payout <= 0.60) componentes.payout = 100;
                else if (payout <= 0.90) componentes.payout = 60;
                else componentes.payout = 20;
            }
        } else {
            componentes.yield = 15;
            componentes.bazin = 15;
            componentes.payout = 50;
        }

        const hoje = new Date().toISOString().split('T')[0];
        const proximoProvento = todosOsProventos.find(p => p.ticker === ativoInfo.ticker && p.dataCom >= hoje);
        if (proximoProvento) {
            componentes.dataCom = 100;
        }

        componentes.final = (componentes.yield * pesos.dy) + (componentes.bazin * pesos.bazin) + (componentes.payout * pesos.payout) + (componentes.dataCom * pesos.dataCom);

    } else if (ativoInfo.tipo === 'FII') {
        const pesos = { dy: 0.6, pvp: 0.4 };
        const ultimoProvento = getUltimoProvento(ativoInfo.ticker);
        
        if (ultimoProvento > 0 && precoAtual > 0) {
            const yieldProjetado = (ultimoProvento * 12) / precoAtual;
            componentes.yield = Math.min((yieldProjetado / 0.12), 1) * 100;
        } else {
            componentes.yield = 30;
        }

        // --- ALTERAÇÃO: Leitura unificada de VPA ---
        const vpa = dadosMercadoAtivo.vpa || 0;
        if (vpa > 0 && precoAtual > 0) {
            const pvp = precoAtual / vpa;
            if (pvp < 1) {
                componentes.pvp = Math.min(((1 - pvp) / 0.3), 1) * 100;
            }
        }
        
        componentes.final = (componentes.yield * pesos.dy) + (componentes.pvp * pesos.pvp);
    }
    
    componentes.final = Math.max(0, componentes.final);
    return componentes;
}
function calcularResultadosRealizados(tickers, datasInicioMap = null) {
    const resultadosPorTicker = new Map();
    const tickerSet = new Set(tickers);

    const todasAsVendas = [];
    // 1. Coleta vendas de Notas de Corretagem
    todasAsNotas.forEach(n => {
        n.operacoes.filter(op => op.tipo === 'venda' && tickerSet.has(op.ativo)).forEach(op => {
            const custoRateado = (n.operacoes.reduce((s, o) => s + o.valor, 0) > 0) ? (op.valor / n.operacoes.reduce((s, o) => s + o.valor, 0)) * n.custos : 0;
            todasAsVendas.push({
                ticker: op.ativo,
                data: n.data,
                quantidade: op.quantidade,
                valorLiquidoVenda: op.valor - custoRateado
            });
        });
    });
    // 2. Coleta vendas do Histórico de Posição Inicial
    posicaoInicial.forEach(p => {
        if (p.tipoRegistro === 'TRANSACAO_HISTORICA' && p.transacao.toLowerCase() === 'venda' && tickerSet.has(p.ticker) && p.valorVenda) {
            todasAsVendas.push({
                ticker: p.ticker,
                data: p.data,
                quantidade: p.quantidade,
                valorLiquidoVenda: p.valorVenda
            });
        }
    });
    // 3. Coleta saídas de Eventos de Ativos
    todosOsAjustes.forEach(a => {
        if (a.tipoAjuste === 'evento_ativo' && a.tipoEvento === 'saida' && tickerSet.has(a.ticker)) {
            const dataAnterior = new Date(a.data + 'T12:00:00');
            dataAnterior.setDate(dataAnterior.getDate() - 1);
            const posAnterior = gerarPosicaoDetalhada(dataAnterior.toISOString().split('T')[0]);
            const pmNaSaida = posAnterior[a.ticker]?.precoMedio || 0;
            const qtdSaida = a.detalhes.reduce((soma, d) => soma + d.quantidade, 0);
            
            todasAsVendas.push({
                ticker: a.ticker,
                data: a.data,
                quantidade: qtdSaida,
                valorLiquidoVenda: qtdSaida * pmNaSaida // Valor da saída é baseado no custo
            });
        }
    });

    // Calcula o lucro/prejuízo para cada venda
    todasAsVendas.forEach(venda => {
        const dataInicioCiclo = datasInicioMap ? datasInicioMap.get(venda.ticker) : null;
        if (dataInicioCiclo && new Date(venda.data) < new Date(dataInicioCiclo)) {
            return; // Pula a venda se for anterior ao ciclo de investimento atual
        }
        
        const dataAnteriorVenda = new Date(venda.data + 'T12:00:00');
        dataAnteriorVenda.setDate(dataAnteriorVenda.getDate() - 1);
        const posicoesAnteriores = gerarPosicaoDetalhada(dataAnteriorVenda.toISOString().split('T')[0]);
        
        const pmNaVenda = posicoesAnteriores[venda.ticker]?.precoMedio || 0;
        const custoTotalAquisicao = venda.quantidade * pmNaVenda;
        const resultado = venda.valorLiquidoVenda - custoTotalAquisicao;

        const resultadoAtual = resultadosPorTicker.get(venda.ticker) || 0;
        resultadosPorTicker.set(venda.ticker, resultadoAtual + resultado);
    });

    return resultadosPorTicker;
}
function calcularValorTotalCarteira(dataLimite = null) {
    let valorTotal = 0;
    
    const posicoesRV = gerarPosicaoDetalhada(dataLimite);
    for (const ticker in posicoesRV) {
        const posicao = posicoesRV[ticker];
        const cotacao = dadosDeMercado.cotacoes[ticker];
        if (posicao.quantidade > 0 && cotacao && cotacao.valor > 0) {
            valorTotal += posicao.quantidade * cotacao.valor;
        }
    }

    todosOsAtivosRF.forEach(ativo => {
        if ((ativo.descricao || '').toLowerCase().includes('(inativa)')) {
            return;
        }
        if (!dataLimite || ativo.dataAplicacao <= dataLimite) {
            const saldosNaData = calcularSaldosRFEmData(ativo, dataLimite);
            valorTotal += saldosNaData.saldoLiquido;
        }
    });

    return valorTotal;
}
function getInicioInvestimento(tickers, dataLimite = null) {
    const tickerSet = new Set(tickers);
    let dataMaisAntiga = null;
    const hoje = new Date().toISOString().split('T')[0];
    const dataFinal = dataLimite || hoje;

    const atualizarData = (novaData) => {
        if (novaData > dataFinal) return;
        if (!dataMaisAntiga || new Date(novaData) < new Date(dataMaisAntiga)) {
            dataMaisAntiga = novaData;
        }
    };

    todasAsNotas.forEach(n => {
        n.operacoes.forEach(op => {
            if (op.tipo === 'compra' && tickerSet.has(op.ativo)) {
                atualizarData(n.data);
            }
        });
    });

    posicaoInicial.forEach(p => {
        if (p.tipoRegistro === 'TRANSACAO_HISTORICA' && p.transacao.toLowerCase() === 'compra' && tickerSet.has(p.ticker)) {
             atualizarData(p.data);
        } else if (p.tipoRegistro === 'SUMARIO_MANUAL' && tickerSet.has(p.ticker)) {
            atualizarData(p.data);
        }
    });
    
    return dataMaisAntiga;
}
function getFimInvestimento(tickers) {
    const tickerSet = new Set(tickers);
    const hojeStr = new Date().toISOString().split('T')[0];
    const posicoesAtuais = gerarPosicaoDetalhada();
    
    // Se qualquer um dos tickers ainda está em carteira, a data final é hoje.
    for (const ticker of tickers) {
        if (posicoesAtuais[ticker] && posicoesAtuais[ticker].quantidade > 0.000001) {
            return hojeStr;
        }
    }

    // Se todos foram zerados, encontra a data de encerramento mais recente entre eles.
    const relatorioZeradas = gerarRelatorioPosicoesZeradas();
    let dataMaisRecente = null;

    relatorioZeradas.forEach(r => {
        if (tickerSet.has(r.ticker)) {
            if (!dataMaisRecente || new Date(r.dataEncerramento) > new Date(dataMaisRecente)) {
                dataMaisRecente = r.dataEncerramento;
            }
        }
    });

    return dataMaisRecente || hojeStr; // Se não encontrar, retorna hoje por segurança.
}
function getInicioIninterrupto(ticker) {
    const relatorioZeradas = gerarRelatorioPosicoesZeradas();
    const ultimaVendaTotal = relatorioZeradas
        .filter(r => r.ticker === ticker)
        .sort((a, b) => new Date(b.dataEncerramento) - new Date(a.dataEncerramento))[0];

    const dataUltimoEncerramento = ultimaVendaTotal ? ultimaVendaTotal.dataEncerramento : null;

    let eventosDeCompra = [];
    todasAsNotas.forEach(n => {
        n.operacoes.filter(op => op.ativo === ticker && op.tipo === 'compra')
            .forEach(op => eventosDeCompra.push({ data: n.data }));
    });
    posicaoInicial.filter(p => p.ticker === ticker && (!p.transacao || p.transacao.toLowerCase() === 'compra'))
        .forEach(p => eventosDeCompra.push({ data: p.data }));

    let eventosFiltrados = eventosDeCompra;
    if (dataUltimoEncerramento) {
        eventosFiltrados = eventosDeCompra.filter(e => new Date(e.data) > new Date(dataUltimoEncerramento));
    }

    if (eventosFiltrados.length === 0) return null;

    eventosFiltrados.sort((a, b) => new Date(a.data) - new Date(b.data));
    return eventosFiltrados[0].data;
}
function abrirModalBalanceamento(tipoAtivo) {
    const modal = document.getElementById('modal-balanceamento-detalhes');
    const titulo = document.getElementById('modal-balanceamento-titulo');
    const container = document.getElementById('modal-balanceamento-container');
    
    // Tradução do título dinâmico
    let tituloFormatado = tipoAtivo;
    if (tipoAtivo === 'Renda Variável') tituloFormatado = 'Variable Income';
    if (tipoAtivo === 'Ação') tituloFormatado = 'Shares';
    if (tipoAtivo === 'FII') tituloFormatado = 'REITs';
    
    titulo.textContent = `Rebalancing Analysis - ${tituloFormatado}`;
    container.innerHTML = '<h4>Calculating...</h4>';
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
        
        dadosParaProcessar = {
            'Renda Variável': {
                ajuste: categoria.ajuste,
                ativos: ativosParaTabela
            }
        };

    } else {
        const chaveCategoria = tipoAtivo === 'Ação' ? 'Ações' : tipoAtivo === 'FII' ? 'FIIs' : tipoAtivo;
        categoria = dados.categorias[chaveCategoria];
        ativosParaTabela = categoria ? categoria.ativos : [];

        if (categoria) {
            dadosParaProcessar = { [chaveCategoria]: categoria };
        }
    }

    if (!categoria || ativosParaTabela.length === 0) {
        container.innerHTML = `<p>No position or target allocation defined for ${tituloFormatado}.</p>`;
    } else {
        const dadosProcessados = processarRebalanceamento(dadosParaProcessar);
        
        const rebalanceamentoHtml = `
            <div class="balanceamento-categoria-summary">
                <div><label>Current Category Value</label><span>${formatarMoeda(categoria.atual.valor)}</span></div>
                <div><label>Target Category Value</label><span>${formatarMoeda(categoria.ideal.valor)}</span></div>
                <div class="remanejamento-valor"><label>Value to Reallocate</label><span>${formatarMoeda(dadosProcessados.totalRemanejar)}</span></div>
            </div>
            <div class="rebalanceamento-container">
                <div class="rebalanceamento-coluna">
                    <h4><i class="fas fa-arrow-down" style="color: var(--danger-color);"></i> Reduce</h4>
                     ${dadosProcessados.listaReduzir.map(item => `<div class="rebalanceamento-item"><span>${item.ticker}</span><strong class="valor-negativo">${formatarMoeda(item.valor)}</strong></div>`).join('')}
                </div>
                <div class="rebalanceamento-coluna">
                    <h4><i class="fas fa-arrow-up" style="color: var(--success-color);"></i> Invest</h4>
                     ${dadosProcessados.listaAportar.map(item => `<div class="rebalanceamento-item"><span>${item.ticker}</span><strong class="valor-positivo">${formatarMoeda(item.valor)}</strong></div>`).join('')}
                </div>
            </div>
            <hr style="margin: 25px 0;">
            <h4 style="text-align: center; margin-bottom: 15px;">Detailed View</h4>
        `;
        const tabelaDetalhadaHtml = gerarTabelaBalanceamentoHtml(ativosParaTabela);
        container.innerHTML = rebalanceamentoHtml + tabelaDetalhadaHtml;
    }
}
function renderizarTelaConsultaBalanceamento() {
    planoDeAcaoAtual = { compras: [], vendas: [] };

    const container = document.getElementById('container-consulta-balanceamento');
    const containerAlerta = document.getElementById('container-alerta-concentracao');

    if (!dadosAlocacao) dadosAlocacao = { categorias: {}, ativos: {} };
    if (!dadosAlocacao.statusAporteRendaFixa) dadosAlocacao.statusAporteRendaFixa = 'Ativo';
    
    // Garante o padrão se não estiver definido
    const modoAtual = dadosAlocacao.modoRebalanceamento || 'categoria';
    const isModoAtivo = modoAtual === 'ativo';

    const isRFPausada = dadosAlocacao.statusAporteRendaFixa === 'Pausado';

    const aporteInput = document.getElementById('balanceamento-aporte-valor');
    const aporteEmDinheiro = parseDecimal(aporteInput?.value || '0');

    if (aporteEmDinheiro < 0) {
        renderizarPlanoDeResgate(Math.abs(aporteEmDinheiro), container);
        return;
    }
    
    const dadosAtuais = gerarDadosBalanceamento('todos');
    const dadosFuturos = gerarDadosBalanceamento('todos', aporteEmDinheiro);
    // Passa o modo selecionado para a lógica de processamento de vendas
    let dadosProcessadosVenda = processarRebalanceamento(dadosFuturos.categorias, modoAtual);
    const posicoesAtuais = gerarPosicaoDetalhada();

    const alertaHtml = gerarAlertaDeConcentracaoHtml();
    containerAlerta.style.display = alertaHtml ? 'block' : 'none';
    containerAlerta.innerHTML = alertaHtml;

    if (dadosAtuais.valorTotalCarteira === 0) {
        container.innerHTML = '<p>No portfolio positions available for rebalancing analysis.</p>';
        return;
    }

    const ajusteRF = dadosFuturos.categorias['Renda Fixa']?.ajuste.valor || 0;
    
    const percentualAjusteRF = dadosFuturos.categorias['Renda Fixa']?.ajuste.percentual || 0;
    // CORREÇÃO AQUI: Banda de 2% para Renda Fixa no modo ativo
    const deveVenderRF = isModoAtivo ? (percentualAjusteRF < -0.02) : (ajusteRF < -1);

    if (deveVenderRF && ajusteRF < -1) {
        dadosProcessadosVenda.listaReduzir.unshift({ ticker: 'Fixed Income', valor: ajusteRF, isActionable: true, yieldOnMarket: 0, variation: 0, lucroPrejuizo: 0, motivoLucro: true, motivoPVP: true, pvp: 0, cotacao: 1 });
    }

    const vendasSelecionadas = dadosProcessadosVenda.listaReduzir.filter(item => item.isActionable && estadoSelecaoVendas[item.ticker] !== false);
    const totalRemanejarSelecionado = vendasSelecionadas.reduce((soma, item) => soma + Math.abs(item.valor), 0);

    const capitalDisponivelInicial = totalRemanejarSelecionado + aporteEmDinheiro;
    const sugestoesDeCompra = {};
    const valorTotalFuturo = dadosAtuais.valorTotalCarteira + aporteEmDinheiro;

    const mapaValorAtual = new Map();
    const mapaDadosAtuais = new Map();
    Object.values(dadosAtuais.categorias).flatMap(c => c.ativos).forEach(a => {
        mapaValorAtual.set(a.ticker, a.atual.valor);
        mapaDadosAtuais.set(a.ticker, a);
    });

    // --- LÓGICA DE COMPRA (RAMIFICAÇÃO) ---
    
    const todosOsCandidatos = [];
    
    // Prepara os dados de todos os ativos candidatos (cálculo de Score)
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
        
        const valorAtualDoAtivo = mapaValorAtual.get(ativoInfo.ticker) || 0;
        const valorIdealFuturo = valorTotalFuturo * percIdeal;
        const necessidadeReal = Math.max(0, valorIdealFuturo - valorAtualDoAtivo);

        if (necessidadeReal > 0.01) {
             todosOsCandidatos.push({
                ticker: ativoInfo.ticker, 
                tipo: ativoInfo.tipo, 
                cotacao: dadosMercadoAtivo.valor,
                necessidadeRealDeAporte: necessidadeReal,
                scores: calcularScoreDeQualidade(ativoInfo, dadosMercadoAtivo),
                dadosOriginais: mapaDadosAtuais.get(ativoInfo.ticker) || {},
                categoria: mapaTickerParaCategoria.get(ativoInfo.ticker)
            });
        }
    });

    // --- RAMIFICAÇÃO AQUI ---
    if (isModoAtivo) {
        // === MODO ATIVO: IGNORA CATEGORIAS, PRIORIZA SCORE ===
        
        todosOsCandidatos.forEach(c => {
             if (todosOsAtivos.find(a => a.ticker === c.ticker)?.statusAporte !== 'Ativo') {
                 c.scoreFinalAlocacao = 0;
             } else {
                 c.scoreFinalAlocacao = c.necessidadeRealDeAporte * (1 + (c.scores.final / 100));
             }
        });

        // CORREÇÃO: Renda Fixa limita-se ao capital disponível
        if (!isRFPausada && ajusteRF > 0) {
             const valorPossivelRF = Math.min(ajusteRF, capitalDisponivelInicial);
             sugestoesDeCompra['Renda Fixa'] = { valor: valorPossivelRF, qtd: 0 };
        } else {
             sugestoesDeCompra['Renda Fixa'] = { valor: 0, qtd: 0 };
        }
        
        let capitalDisponivelParaRV = Math.max(0, capitalDisponivelInicial - sugestoesDeCompra['Renda Fixa'].valor);

        // 3. Distribuição do Capital
        const candidatosValidos = todosOsCandidatos.filter(c => c.scoreFinalAlocacao > 0);
        
        candidatosValidos.sort((a, b) => b.scoreFinalAlocacao - a.scoreFinalAlocacao);

        let iteracoes = 0;
        while (capitalDisponivelParaRV > 10 && iteracoes < 1000) { 
            let comprouAlgo = false;
            for (const candidato of candidatosValidos) {
                if (capitalDisponivelParaRV < candidato.cotacao) continue;

                const jaAlocado = (sugestoesDeCompra[candidato.ticker]?.qtd || 0) * candidato.cotacao;
                if (jaAlocado < candidato.necessidadeRealDeAporte) {
                     if (!sugestoesDeCompra[candidato.ticker]) {
                        sugestoesDeCompra[candidato.ticker] = { ticker: candidato.ticker, qtd: 0, preco: candidato.cotacao };
                    }
                    sugestoesDeCompra[candidato.ticker].qtd += 1;
                    capitalDisponivelParaRV -= candidato.cotacao;
                    comprouAlgo = true;
                }
            }
            if (!comprouAlgo) break;
            iteracoes++;
        }

    } else {
        // === MODO CATEGORIA: HIERARQUIA RÍGIDA (LÓGICA ORIGINAL) ===
        
        const orcamentoPorCategoria = {};
        const necessidadeTotalAporte = Object.values(dadosFuturos.categorias).reduce((soma, cat) => soma + Math.max(0, cat.ajuste.valor), 0);

        if (necessidadeTotalAporte > 0) {
            for (const nomeCategoria in dadosFuturos.categorias) {
                const necessidadeCategoria = Math.max(0, dadosFuturos.categorias[nomeCategoria].ajuste.valor);
                if (necessidadeCategoria > 0) {
                    const pesoCategoria = necessidadeCategoria / necessidadeTotalAporte;
                    orcamentoPorCategoria[nomeCategoria] = capitalDisponivelInicial * pesoCategoria;
                }
            }
        }

        if (orcamentoPorCategoria['Renda Fixa'] > 0 && !isRFPausada) {
            sugestoesDeCompra['Renda Fixa'] = { valor: orcamentoPorCategoria['Renda Fixa'], qtd: 0 };
        } else {
            sugestoesDeCompra['Renda Fixa'] = { valor: 0, qtd: 0 };
        }

        const alocarCapitalEmCategoria = (nomeCategoria, capitalAlocado) => {
            let candidatosDaCategoria = todosOsCandidatos.filter(c => c.categoria === nomeCategoria);
            
            candidatosDaCategoria.forEach(c => {
                 if (todosOsAtivos.find(a => a.ticker === c.ticker)?.statusAporte !== 'Ativo') {
                     c.scoreFinalAlocacao = 0;
                 } else {
                     c.scoreFinalAlocacao = c.necessidadeRealDeAporte * (1 + (c.scores.final / 100));
                 }
            });

            const candidatosOrdenados = candidatosDaCategoria.filter(c => c.scoreFinalAlocacao > 0).sort((a, b) => b.scoreFinalAlocacao - a.scoreFinalAlocacao);
            
            let capitalRestante = capitalAlocado;
            let iteracoes = 0;
            
            while (capitalRestante > 10 && iteracoes < 500) {
                let comprou = false;
                for (const candidato of candidatosOrdenados) {
                    if (capitalRestante >= candidato.cotacao) {
                         const jaAlocado = (sugestoesDeCompra[candidato.ticker]?.qtd || 0) * candidato.cotacao;
                         if (jaAlocado < candidato.necessidadeRealDeAporte) {
                            if (!sugestoesDeCompra[candidato.ticker]) {
                                sugestoesDeCompra[candidato.ticker] = { ticker: candidato.ticker, qtd: 0, preco: candidato.cotacao };
                            }
                            sugestoesDeCompra[candidato.ticker].qtd += 1;
                            capitalRestante -= candidato.cotacao;
                            comprou = true;
                         }
                    }
                }
                if (!comprou) break;
                iteracoes++;
            }
        };

        if (orcamentoPorCategoria['Ações'] > 0) alocarCapitalEmCategoria('Ações', orcamentoPorCategoria['Ações']);
        if (orcamentoPorCategoria['FIIs'] > 0) alocarCapitalEmCategoria('FIIs', orcamentoPorCategoria['FIIs']);
        if (orcamentoPorCategoria['ETFs'] > 0) alocarCapitalEmCategoria('ETFs', orcamentoPorCategoria['ETFs']);
    }

    // --- FIM DA LÓGICA DE COMPRA ---

    const aportePorCategoria = { 'Ações': 0, 'FIIs': 0, 'ETFs': 0, 'Renda Fixa': 0 };
    if (sugestoesDeCompra['Renda Fixa']) {
        aportePorCategoria['Renda Fixa'] += sugestoesDeCompra['Renda Fixa'].valor;
    }
    const mapaTickerParaCategoria2 = new Map();
    todosOsAtivos.forEach(a => mapaTickerParaCategoria2.set(a.ticker, a.tipo.replace(/Ação/g, 'Ações').replace(/FII/g, 'FIIs')));
    for (const ticker in sugestoesDeCompra) {
        const categoria = mapaTickerParaCategoria2.get(ticker);
        if (categoria && aportePorCategoria.hasOwnProperty(categoria)) {
            aportePorCategoria[categoria] += (sugestoesDeCompra[ticker].qtd || 0) * (sugestoesDeCompra[ticker].preco || 0);
        }
    }

    const vendasPorCategoria = { 'Ações': 0, 'FIIs': 0, 'ETFs': 0, 'Renda Fixa': 0 };
    vendasSelecionadas.forEach(item => {
        const categoria = mapaTickerParaCategoria2.get(item.ticker);
        if (categoria && vendasPorCategoria.hasOwnProperty(categoria)) {
            vendasPorCategoria[categoria] += Math.abs(item.valor);
        } else if (item.ticker === 'Renda Fixa' || item.ticker === 'Fixed Income') {
            vendasPorCategoria['Renda Fixa'] += Math.abs(item.valor);
        }
    });

    let valorTotalFinalSimulado = 0;
    for (const nomeCategoria in dadosAtuais.categorias) {
        const cat = dadosAtuais.categorias[nomeCategoria];
        const valorVendaCategoria = vendasPorCategoria[nomeCategoria] || 0;
        const valorAporteCategoria = aportePorCategoria[nomeCategoria] || 0;
        const valorPosAporte = cat.atual.valor - valorVendaCategoria + valorAporteCategoria;
        valorTotalFinalSimulado += valorPosAporte;
    }

    // --- RENDERIZAÇÃO HTML ---

    const seletorHtml = `
        <div style="display: flex; justify-content: center; margin-bottom: 20px; align-items: center; gap: 10px;">
            <span style="font-weight: bold; color: #555;">Allocation Method:</span>
            <div class="radio-group" style="background: #fff;">
                <input type="radio" id="modo-alocacao-categoria" name="modo-alocacao" value="categoria" ${!isModoAtivo ? 'checked' : ''}>
                <label for="modo-alocacao-categoria" title="Fulfills the category target (Macro) first, then the assets.">Prioritize Categories</label>
                
                <input type="radio" id="modo-alocacao-ativo" name="modo-alocacao" value="ativo" ${isModoAtivo ? 'checked' : ''}>
                <label for="modo-alocacao-ativo" title="Ignores the category. Buys highest score and sells those exceeding 2% of the target.">Prioritize Assets (Individual)</label>
            </div>
        </div>
    `;

    let totalIdealPerc = 0, totalAtualPerc = 0, totalPosAportePerc = 0;
    let totalIdealValor = 0, totalAtualValor = 0, totalPosAporteValor = 0, totalAjusteValor = 0;

    let visaoGeralHtml = seletorHtml + `
        <div class="container">
            <h3>Category Rebalancing Overview</h3>
            <p style="font-size: 0.9em; color: #555;">Diagnostics of your portfolio and simulation of the contribution's impact.</p>
            <table class="balanceamento-tabela" style="font-size: 1em; margin-top: 15px;">
                <thead><tr>
                    <th>Category</th><th class="percentual header-numero">Ideal %</th><th class="percentual header-numero">Current %</th>
                    <th class="percentual header-numero">Post-Contrib %</th><th class="numero">Ideal Value (R$)</th><th class="numero">Current Value (R$)</th>
                    <th class="numero">Post-Contrib Value (R$)</th><th class="numero">Required Adj. (R$)</th>
                </tr></thead>
                <tbody>`;

    for (const nomeCategoria in dadosAtuais.categorias) {
        const cat = dadosAtuais.categorias[nomeCategoria];
        if (cat.ideal.percentual > 0 || cat.atual.valor > 0) {
            const classeAjuste = cat.ajuste.valor >= 0 ? 'status-aportar' : 'status-reduzir';
            const valorVendaCategoria = vendasPorCategoria[nomeCategoria] || 0;
            const valorAporteCategoria = aportePorCategoria[nomeCategoria] || 0;
            const valorPosAporte = cat.atual.valor - valorVendaCategoria + valorAporteCategoria;
            const percPosAporte = valorTotalFinalSimulado > 0 ? valorPosAporte / valorTotalFinalSimulado : 0;

            let nomeCatFmt = nomeCategoria;
            if (nomeCategoria === 'Ações') nomeCatFmt = 'Shares';
            if (nomeCategoria === 'Renda Fixa') nomeCatFmt = 'Fixed Income';

            visaoGeralHtml += `<tr>
                <td><strong>${nomeCatFmt}</strong></td><td class="percentual numero">${formatarPercentual(cat.ideal.percentual)}</td>
                <td class="percentual numero">${formatarPercentual(cat.atual.percentual)}</td><td class="percentual numero">${formatarPercentual(percPosAporte)}</td>
                <td class="numero">${formatarMoeda(cat.ideal.valor)}</td><td class="numero">${formatarMoeda(cat.atual.valor)}</td>
                <td class="numero">${formatarMoeda(valorPosAporte)}</td><td class="numero ${classeAjuste}">${formatarMoeda(cat.ajuste.valor)}</td>
            </tr>`;

            totalIdealPerc += cat.ideal.percentual;
            totalAtualPerc += cat.atual.percentual;
            totalPosAportePerc += percPosAporte;
            totalIdealValor += cat.ideal.valor;
            totalAtualValor += cat.atual.valor;
            totalPosAporteValor += valorPosAporte;
            totalAjusteValor += cat.ajuste.valor;
        }
    }

    visaoGeralHtml += `</tbody>
        <tfoot style="border-top: 2px solid var(--accent-color);">
            <tr>
                <td><strong>TOTALS</strong></td><td class="percentual numero"><strong>${formatarPercentual(totalIdealPerc)}</strong></td>
                <td class="percentual numero"><strong>${formatarPercentual(totalAtualPerc)}</strong></td><td class="percentual numero"><strong>${formatarPercentual(totalPosAportePerc)}</strong></td>
                <td class="numero"><strong>${formatarMoeda(totalIdealValor)}</strong></td><td class="numero"><strong>${formatarMoeda(totalAtualValor)}</strong></td>
                <td class="numero"><strong>${formatarMoeda(totalPosAporteValor)}</strong></td><td class="numero"><strong>${formatarMoeda(totalAjusteValor)}</strong></td>
            </tr>
        </tfoot>
    </table></div>`;

    let planoAcaoHtml = `
        <div class="container" id="plano-de-acao-container">
            <div class="rebalanceamento-total-header"><h3>Asset Action Plan</h3>
                <div class="aporte-panel">
                    <div class="form-group aporte-input-group">
                        <label for="balanceamento-aporte-valor">Cash Contribution (R$):</label>
                        <input type="text" id="balanceamento-aporte-valor" placeholder="Ex: 1,000.00 or -500.00 to redeem" onchange="estadoSelecaoVendas = {}; renderizarTelaConsultaBalanceamento();">
                    </div>
                    <div class="aporte-summary">
                        <div class="summary-data-point"><label>+ Sales Capital:</label><span id="balanceamento-capital-vendas">R$ 0.00</span></div>
                        <div class="summary-data-point total"><label>= Total Available Capital:</label><span id="balanceamento-capital-total">R$ 0.00</span></div>
                        <div class="summary-data-point"><label>- Invested Value (Suggested):</label><span id="balanceamento-valor-aportado" class="valor-positivo">R$ 0.00</span></div>
                        <div class="summary-data-point"><label>= Remaining Cash:</label><span id="balanceamento-sobra-caixa">R$ 0.00</span></div>
                    </div>
                </div>
            </div>
            <div class="rebalanceamento-container">`;

    const exibirColunaReduzir = dadosProcessadosVenda.listaReduzir.length > 0;

    if (exibirColunaReduzir) {
        planoAcaoHtml += `<div class="rebalanceamento-coluna">
                            <h4><i class="fas fa-arrow-down" style="color: var(--danger-color);"></i> Reduce Assets (Capital Source)</h4>
                            <div class="rebalanceamento-item-header">
                                <span>Asset</span>
                                <div class="item-venda-valores-header" style="width: 280px;">
                                    <span>Allocation (Cur/Tgt)</span>
                                    <span>P/L Sale</span>
                                    <span>Value to Reduce</span>
                                </div>
                            </div>`;
        dadosProcessadosVenda.listaReduzir.forEach(item => {
            if (item.ticker === 'Renda Fixa' || item.ticker === 'Fixed Income') {
                const isChecked = item.isActionable && estadoSelecaoVendas[item.ticker] !== false;
                const isDisabled = !item.isActionable ? 'disabled' : '';
                planoAcaoHtml += `<div class="rebalanceamento-item item-venda"><div class="item-venda-controles"><input type="checkbox" id="venda-${item.ticker}" ${isChecked ? 'checked' : ''} onchange="toggleSelecaoVenda('${item.ticker}')" ${isDisabled}><span class="ticker-rebalanceamento" data-ticker="${item.ticker}">${item.ticker}</span></div><div class="item-venda-valores" style="width: 280px;"><div style="flex: 1.2; text-align: right; font-size: 0.9em;">-</div><div class="item-lucro-prejuizo" style="flex: 1; text-align: right;">-</div><strong class="valor-negativo" title="Value to reduce to reach target">${formatarMoeda(item.valor)}</strong></div></div>`;
                return;
            }
            const isChecked = item.isActionable && estadoSelecaoVendas[item.ticker] !== false;
            const isDisabled = !item.isActionable ? 'disabled' : '';
            const classeItem = item.isActionable ? '' : 'item-desabilitado';
            const classeLucroPrejuizo = item.lucroPrejuizo >= 0 ? 'valor-positivo' : 'valor-negativo';
            const percentualHtml = ` <span style="font-size: 0.9em; font-style: italic;" class="${classeLucroPrejuizo}">(${formatarPercentual(item.variation)})</span>`;
            const lucroPrejuizoHtml = `<div class="item-lucro-prejuizo ${classeLucroPrejuizo}" title="Position Profit/Loss (Value and Percentage)">${formatarMoeda(item.lucroPrejuizo)}${percentualHtml}</div>`;
            let mensagemInativoHtml = '';
            if (!item.isActionable) {
                let razao = !item.motivoLucro ? 'With loss' : (!item.motivoPVP && !isModoAtivo) ? `P/BV < 1.0` : 'Below tolerance';
                if (!item.motivoPVP && isModoAtivo && item.motivoLucro) razao = ""; 

                if (razao) {
                    mensagemInativoHtml = `<div class="mensagem-prejuizo">${razao} - Sale not recommended.</div>`;
                }
            }
            const alocacaoHtml = `<div class="item-alocacao-venda" style="flex: 1.2; text-align: right; font-size: 0.9em;">${formatarPercentual(item.alocacaoAtual)} / ${formatarPercentual(item.alocacaoIdeal)}</div>`;
            planoAcaoHtml += `<div class="rebalanceamento-item item-venda ${classeItem}"><div class="item-venda-controles"><input type="checkbox" id="venda-${item.ticker}" ${isChecked ? 'checked' : ''} onchange="toggleSelecaoVenda('${item.ticker}')" ${isDisabled}><span class="ticker-rebalanceamento" data-ticker="${item.ticker}">${item.ticker} <small class="ticker-cotacao">(${formatarMoeda(item.cotacao)})</small></span></div><div class="item-venda-valores" style="width: 280px;">${alocacaoHtml}${lucroPrejuizoHtml}<strong class="valor-negativo" title="Value to reduce to reach target">${formatarMoeda(item.valor)}</strong></div>${mensagemInativoHtml}</div>`;
        });
        planoAcaoHtml += `</div>`;
    }

    const classeColunaAporte = !exibirColunaReduzir ? 'full-width' : '';
    planoAcaoHtml += `<div class="rebalanceamento-coluna ${classeColunaAporte}"><h4><i class="fas fa-arrow-up" style="color: var(--success-color);"></i> Invest in Assets (Destination)</h4>`;
    
    if ((sugestoesDeCompra['Renda Fixa'] && sugestoesDeCompra['Renda Fixa'].valor > 0) || isRFPausada) {
        const classeItemPausadoRF = isRFPausada ? 'item-pausado' : '';
        const iconePausaRF = isRFPausada ? 'fa-play-circle' : 'fa-pause-circle';
        const tituloIconeRF = isRFPausada ? 'Reactivate suggestion for Fixed Income' : 'Pause suggestion for Fixed Income';
        const valorExibidoRF = isRFPausada ? 0 : sugestoesDeCompra['Renda Fixa']?.valor || 0;
        planoAcaoHtml += `<div class="rebalanceamento-item item-aportar ${classeItemPausadoRF}"><div class="item-aportar-linha-principal"><span class="ticker-aporte">Fixed Income</span><div><strong class="valor-positivo">+ ${formatarMoeda(valorExibidoRF)}</strong><i class="fas ${iconePausaRF} icone-pausa-aporte" id="icone-pausa-rf" title="${tituloIconeRF}"></i></div></div><div class="indicadores-aporte"><span>Contribution to reach allocation target.</span></div></div>`;
    }

    const listaFinalParaExibir = todosOsCandidatos
        .filter(c => sugestoesDeCompra[c.ticker] || (todosOsAtivos.find(a => a.ticker === c.ticker)?.statusAporte === 'Pausado'))
        .sort((a, b) => b.scoreFinalAlocacao - a.scoreFinalAlocacao);

    if (listaFinalParaExibir.length > 0) {
        listaFinalParaExibir.forEach(candidato => {
            const ativo = todosOsAtivos.find(a => a.ticker === candidato.ticker);
            if (!ativo) return;
            const isPaused = ativo.statusAporte === 'Pausado';
            const classeVariacao = (candidato.dadosOriginais?.variation ?? 0) >= 0 ? 'variacao-positiva' : 'variacao-negativa';
            const classeItemPausado = isPaused ? 'item-pausado' : '';
            const iconePausa = isPaused ? 'fa-play-circle' : 'fa-pause-circle';
            const tituloIcone = isPaused ? 'Reactivate suggestion for this asset' : 'Pause suggestion for this asset';
            const sugestao = sugestoesDeCompra[candidato.ticker];

            let textoIndicadores;
            const alocacaoAtual = candidato.dadosOriginais?.atual?.percentualGlobal || 0;
            const alocacaoIdeal = candidato.dadosOriginais?.ideal?.percentualGlobal || 0;
            const alocacaoTexto = `Alloc: ${formatarPercentual(alocacaoAtual)} of ${formatarPercentual(alocacaoIdeal)}`;
            if (candidato.tipo === 'Ação') {
                textoIndicadores = `Score: ${candidato.scores.final.toFixed(1)} (Y:${candidato.scores.yield.toFixed(0)}, B:${candidato.scores.bazin.toFixed(0)}, P:${candidato.scores.payout.toFixed(0)})`;
            } else {
                textoIndicadores = `Score: ${candidato.scores.final.toFixed(1)} (Y:${candidato.scores.yield.toFixed(0)}, P/BV:${candidato.scores.pvp.toFixed(0)})`;
            }
            const tooltipNecessidade = `\nRequired contribution: ${formatarMoeda(candidato.necessidadeRealDeAporte)}`;
            const dadosMercadoAtivo = dadosDeMercado.cotacoes[ativo.ticker] || {};
            const precoTetoGraham = calcularPrecoTetoGraham(dadosMercadoAtivo.lpa_acao, dadosMercadoAtivo.vpa);
            let alertaGraham = '';
            const tooltipAlertaGraham = `Graham Ceiling Price: ${formatarMoeda(precoTetoGraham)}`;
            if (precoTetoGraham > 0 && dadosMercadoAtivo.valor > precoTetoGraham) {
                alertaGraham = `<div class="indicador-alerta-graham" title="${tooltipAlertaGraham}"><i class="fas fa-exclamation-triangle"></i> Above Graham Ceiling</div>`;
            }
            if (sugestao || isPaused) {
                planoAcaoHtml += `<div class="rebalanceamento-item item-aportar ${classeItemPausado}"><div class="item-aportar-linha-principal"><span class="ticker-rebalanceamento" data-ticker="${candidato.ticker}">${candidato.ticker} <small class="ticker-cotacao">(${formatarMoeda(candidato.cotacao)})</small></span><div><strong class="valor-positivo" title="Suggested value for this contribution">+ ${formatarMoeda(sugestao?.qtd * sugestao?.preco || 0)}</strong><i class="fas ${iconePausa} icone-pausa-aporte" data-ticker="${candidato.ticker}" title="${tituloIcone}"></i></div></div><div class="indicadores-aporte" title="${textoIndicadores + tooltipNecessidade}"><span>Score: ${candidato.scores.final.toFixed(1)}</span><span>Yield: ${formatarPercentual(candidato.dadosOriginais?.yieldOnMarket || 0)}</span><span class="${classeVariacao}">Avg P. Var: ${formatarPercentual(candidato.dadosOriginais?.variation || 0)}</span><span>${alocacaoTexto}</span></div>${sugestao && sugestao.qtd > 0 && !isPaused ? `<div class="sugestao-compra">Buy Suggestion: ${sugestao.qtd} unit(s)</div>` : ''}${alertaGraham}</div>`;
            }
        });
    } else if ((!sugestoesDeCompra['Renda Fixa'] || sugestoesDeCompra['Renda Fixa'].valor === 0)) {
        planoAcaoHtml += '<p style="text-align: center; font-style: italic; color: #888;">No eligible assets for contribution.</p>';
    }

    planoAcaoHtml += `</div></div></div>`;

    container.innerHTML = visaoGeralHtml + planoAcaoHtml;

    // Adicionado 'atualizarIconeDeAlertasGlobal()' dentro do listener de mudança de modo
    document.querySelectorAll('input[name="modo-alocacao"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            dadosAlocacao.modoRebalanceamento = e.target.value;
            salvarDadosAlocacao();
            renderizarTelaConsultaBalanceamento();
            atualizarIconeDeAlertasGlobal(); // ATUALIZA O ÍCONE INSTANTANEAMENTE
        });
    });

    const aporteInputEl = document.getElementById('balanceamento-aporte-valor');
    if (aporteInputEl) {
        aporteInputEl.value = formatarDecimalParaInput(aporteEmDinheiro);
    }

    const valorRealAportado = Object.values(aportePorCategoria).reduce((soma, v) => soma + v, 0);
    const sobra = capitalDisponivelInicial - valorRealAportado;

    document.getElementById('balanceamento-capital-vendas').textContent = formatarMoeda(totalRemanejarSelecionado);
    document.getElementById('balanceamento-capital-total').textContent = formatarMoeda(capitalDisponivelInicial);
    document.getElementById('balanceamento-valor-aportado').textContent = formatarMoeda(valorRealAportado);
    document.getElementById('balanceamento-sobra-caixa').textContent = formatarMoeda(sobra);

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
function renderizarPlanoDeResgate(valorResgate, container) {
    planoDeAcaoAtual = { compras: [], vendas: [] };
    const hoje = new Date().toISOString().split('T')[0];

    let valorAindaNecessario = valorResgate;
    const sugestoesDeResgate = [];
    const vendasParaSimulacao = []; 

    // Prioridade 1: Renda Fixa
    const ativosRF = todosOsAtivosRF.filter(a => !(a.descricao || '').toLowerCase().includes('inactive') && !(a.descricao || '').toLowerCase().includes('inativa'));
    let saldoTotalRF = 0;
    ativosRF.forEach(ativo => {
        saldoTotalRF += calcularSaldosRFEmData(ativo, hoje).saldoLiquido;
    });

    if (valorAindaNecessario > 0 && saldoTotalRF > 0) {
        const resgateDaRF = Math.min(valorAindaNecessario, saldoTotalRF);
        sugestoesDeResgate.push({
            ticker: 'Fixed Income',
            valor: resgateDaRF,
            detalhes: `Suggested to redeem from your Fixed Income positions.`
        });
        valorAindaNecessario -= resgateDaRF;
    }

    // Prioridade 2: Renda Variável (ordenado por lucro)
    if (valorAindaNecessario > 0) {
        const posicoesRV = gerarPosicaoDetalhada();
        const ativosComLucro = [];

        Object.keys(posicoesRV).forEach(ticker => {
            const pos = posicoesRV[ticker];
            if (pos.quantidade > 0) {
                const cotacao = dadosDeMercado.cotacoes[ticker]?.valor || 0;
                if (cotacao > pos.precoMedio) {
                    const lucroPorCota = cotacao - pos.precoMedio;
                    ativosComLucro.push({
                        ticker,
                        lucroPorCota,
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
                detalhes: `Sell ${qtdVenda} unit(s) at ${formatarMoeda(ativo.cotacao)}.`
            });
            vendasParaSimulacao.push({
                ticker: ativo.ticker,
                qtd: qtdVenda,
                preco: ativo.cotacao
            });
            valorAindaNecessario -= valorVendaReal;
        }
    }
    
    planoDeAcaoAtual.vendas = vendasParaSimulacao;
    
    let visaoGeralHtml = `
        <div class="container">
            <h3>Redemption Plan</h3>
            <p style="font-size: 0.9em; color: #555;">The system identified a redemption requirement of <strong>${formatarMoeda(valorResgate)}</strong>. The suggestions below prioritize liquidity (Fixed Income) and realizing profits (Variable Income).</p>
        </div>`;

    let planoAcaoHtml = `
        <div class="container" id="plano-de-acao-container">
             <div class="aporte-panel" style="background-color: #fffaf0; border: 1px solid #ffeeba; color: #856404; margin: 15px 0; display: block; text-align: center;">
                <div class="form-group aporte-input-group" style="margin-bottom: 0; justify-content: center;">
                    <label for="balanceamento-aporte-valor" style="color: #856404;">Redemption Value (R$):</label>
                    <input type="text" id="balanceamento-aporte-valor" value="${formatarDecimalParaInput(-valorResgate)}" onchange="renderizarTelaConsultaBalanceamento();">
                </div>
            </div>
            <div class="rebalanceamento-container">
                <div class="rebalanceamento-coluna full-width">
                    <h4><i class="fas fa-hand-holding-usd" style="color: var(--danger-color);"></i> Redemption/Sale Suggestions</h4>`;

    sugestoesDeResgate.forEach(item => {
        planoAcaoHtml += `
            <div class="rebalanceamento-item item-aportar">
                <div class="item-aportar-linha-principal">
                    <span class="ticker-rebalanceamento" data-ticker="${item.ticker}">${item.ticker}</span>
                    <div><strong class="valor-negativo">- ${formatarMoeda(item.valor)}</strong></div>
                </div>
                <div class="indicadores-aporte"><span>${item.detalhes}</span></div>
            </div>`;
    });

    if (valorAindaNecessario > 0) {
        planoAcaoHtml += `<div class="dashboard-alert" style="background-color: #f8d7da; border-color: #f5c6cb; color: #721c24; margin-top: 15px;">
                            <i class="fas fa-exclamation-triangle"></i>
                            <span><strong>Attention:</strong> Could not reach the full redemption value using only Fixed Income and profitable assets. Still need to redeem <strong>${formatarMoeda(valorAindaNecessario)}</strong>.</span>
                        </div>`;
    }

    planoAcaoHtml += `</div></div></div>`;
    
    container.innerHTML = visaoGeralHtml + planoAcaoHtml;
    
    const aporteInputEl = document.getElementById('balanceamento-aporte-valor');
    if(aporteInputEl) {
        aporteInputEl.value = formatarDecimalParaInput(-valorResgate);
    }
}
function gerarTabelaBalanceamentoHtml(dadosAtivos) {
    let tabelaHtml = `
        <table class="balanceamento-tabela" style="font-size: 0.9em;">
            <thead>
                <tr>
                    <th rowspan="2">Asset</th>
                    <th rowspan="2">Status</th>
                    <th colspan="3" class="group-header group-1">Target Position</th>
                    <th colspan="3" class="group-header group-2">Current Position</th>
                    <th colspan="3" class="group-header group-3">Required Adjustment</th>
                </tr>
                <tr>
                    <th class="percentual group-1">% Global</th>
                    <th class="numero group-1">Value (R$)</th>
                    <th class="numero group-1">Qty.</th>
                    <th class="percentual group-2">% Global</th>
                    <th class="numero group-2">Value (R$)</th>
                    <th class="numero group-2">Qty.</th>
                    <th class="percentual group-3">Adj. %</th>
                    <th class="numero group-3">Adj. (R$)</th>
                    <th class="numero group-3">Adj. Qty.</th>
                </tr>
            </thead>
            <tbody>
    `;

    dadosAtivos.forEach(ativo => {
        let statusLabel = ativo.status;
        let classeStatus = '';
        
        // Tradução do Status
        if (statusLabel === 'OK') {
            classeStatus = 'status-ok';
        } else if (statusLabel === 'Aportar') {
            classeStatus = 'status-aportar';
            statusLabel = 'Invest';
        } else {
            classeStatus = 'status-reduzir';
            statusLabel = 'Reduce';
        }

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
