// Financial Mathematics and Performance // Matemática Financeira e Performance
function calcularCrescimentoPatrimonial(tipoSaldo, intervaloValor) {
    // 1. Preparar a série temporal de dados com base na seleção do usuário.
    const timeSeries = [];
    historicoCarteira.forEach(snapshot => {
        let valorSnapshot = 0;
        switch (tipoSaldo) {
            case 'patrimonioTotal':
                valorSnapshot = snapshot.patrimonioTotal || 0;
                break;
            case 'valorTotalInvestimentos':
                valorSnapshot = snapshot.valorTotalInvestimentos || 0;
                break;
            case 'FIIs':
                valorSnapshot = snapshot.detalhesCarteira?.valorPorClasse?.['FIIs'] || 0;
                break;
            case 'Ações':
                valorSnapshot = snapshot.detalhesCarteira?.valorPorClasse?.['Ações'] || 0;
                break;
            case 'ETF':
                valorSnapshot = snapshot.detalhesCarteira?.valorPorClasse?.['ETF'] || 0;
                break;
            case 'Renda Fixa':
                valorSnapshot = snapshot.detalhesCarteira?.valorPorClasse?.['Renda Fixa'] || 0;
                break;
        }
        timeSeries.push({ data: snapshot.data, valor: valorSnapshot });
    });
    let startIndex = timeSeries.findIndex(item => item.valor > 0);
    if (startIndex === -1) return null; // Não há dados positivos para analisar.

    const resultados = [];
    // Define o ponto de partida (baseline) com o primeiro snapshot válido.
    let dataReferencia = timeSeries[startIndex].data;
    let saldoReferencia = timeSeries[startIndex].valor;
    resultados.push({ data: dataReferencia, saldo: saldoReferencia, tempo: '-', diffValor: 0 });

    // 3. Iterar sobre os snapshots restantes aplicando a lógica de intervalo relativo ao último marco registrado.
    for (let i = startIndex + 1; i < timeSeries.length; i++) {
        const snapshotAtual = timeSeries[i];
        
        // Condição: O saldo atual deve ser maior ou igual ao saldo do último marco + o intervalo definido.
        if (snapshotAtual.valor >= saldoReferencia + intervaloValor) {
            const diasDecorridos = calcularDiffDias(dataReferencia, snapshotAtual.data);
            const crescimentoReal = snapshotAtual.valor - saldoReferencia;

            resultados.push({
                data: snapshotAtual.data,
                saldo: snapshotAtual.valor,
                tempo: formatarIntervaloDias(diasDecorridos),
                diffValor: crescimentoReal
            });
            
            // Atualiza a base de referência para o próximo cálculo.
            dataReferencia = snapshotAtual.data;
            saldoReferencia = snapshotAtual.valor;
        }
    }
    return resultados;
}
function calcularCrescimentoPorPeriodo(tipoSaldo, periodo, dataInicioUsuario) {
    const timeSeriesAll = historicoCarteira.map(snapshot => {
        let valorSnapshot = 0;
        switch (tipoSaldo) {
            case 'patrimonioTotal': valorSnapshot = snapshot.patrimonioTotal || 0; break;
            case 'valorTotalInvestimentos': valorSnapshot = snapshot.valorTotalInvestimentos || 0; break;
            case 'FIIs': valorSnapshot = snapshot.detalhesCarteira?.valorPorClasse?.['FIIs'] || 0; break;
            case 'Ações': valorSnapshot = snapshot.detalhesCarteira?.valorPorClasse?.['Ações'] || 0; break;
            case 'ETF': valorSnapshot = snapshot.detalhesCarteira?.valorPorClasse?.['ETF'] || 0; break;
            case 'Renda Fixa': valorSnapshot = snapshot.detalhesCarteira?.valorPorClasse?.['Renda Fixa'] || 0; break;
        }
        return { data: snapshot.data, valor: valorSnapshot };
    });

    const timeSeriesValida = timeSeriesAll.slice(timeSeriesAll.findIndex(item => item.valor > 0));
    if (timeSeriesValida.length < 1) return null;

    const getSaldoNaData = (dataAlvoStr, series) => {
        let ultimoSnapshotValido = null;
        for (const snapshot of series) {
            if (snapshot.data <= dataAlvoStr) {
                ultimoSnapshotValido = snapshot;
            } else {
                break;
            }
        }
        return ultimoSnapshotValido;
    };

    let dataDePartida = new Date(dataInicioUsuario + 'T12:00:00');
    const primeiraDataSnapshotValida = new Date(timeSeriesValida[0].data + 'T12:00:00');
    if (dataDePartida < primeiraDataSnapshotValida) {
        dataDePartida = primeiraDataSnapshotValida;
    }

    const resultados = [];
    let dataMarcoAnterior = new Date(dataDePartida);
    const hoje = new Date();
    const dataUltimoSnapshot = new Date(timeSeriesValida[timeSeriesValida.length - 1].data + 'T12:00:00');

    while (dataMarcoAnterior <= dataUltimoSnapshot && dataMarcoAnterior < hoje) {
        let dataMarcoAtual = new Date(dataMarcoAnterior);
        switch (periodo) {
            case 'mensal': dataMarcoAtual.setUTCMonth(dataMarcoAtual.getUTCMonth() + 1); break;
            case 'trimestral': dataMarcoAtual.setUTCMonth(dataMarcoAtual.getUTCMonth() + 3); break;
            case 'semestral': dataMarcoAtual.setUTCMonth(dataMarcoAtual.getUTCMonth() + 6); break;
            case 'anual': dataMarcoAtual.setUTCFullYear(dataMarcoAtual.getUTCFullYear() + 1); break;
            case 'semanal': dataMarcoAtual.setUTCDate(dataMarcoAtual.getUTCDate() + 7); break;
        }

        const snapshotInicioPeriodo = getSaldoNaData(dataMarcoAnterior.toISOString().split('T')[0], timeSeriesValida);
        const snapshotFimPeriodo = getSaldoNaData(dataMarcoAtual.toISOString().split('T')[0], timeSeriesValida);

        if (!snapshotInicioPeriodo || !snapshotFimPeriodo || snapshotInicioPeriodo.data === snapshotFimPeriodo.data) {
            dataMarcoAnterior = dataMarcoAtual;
            if (dataMarcoAtual > hoje) break;
            continue;
        }

        resultados.push({
            dataInicioPeriodo: new Date(snapshotInicioPeriodo.data + 'T12:00:00'),
            dataFimPeriodo: new Date(snapshotFimPeriodo.data + 'T12:00:00'),
            saldoInicial: snapshotInicioPeriodo.valor,
            saldoFinal: snapshotFimPeriodo.valor
        });

        dataMarcoAnterior = dataMarcoAtual;
    }
    
    return resultados.length > 0 ? resultados : null;
}
function calcularPrecoTetoBazin(dividendoAnual, metaYield) {
    if (metaYield <= 0) return 0;
    return dividendoAnual / metaYield;
}
function calcularPrecoTetoGraham(lpa, vpa) {
    if (lpa <= 0 || vpa <= 0) return 0;
    const valor = 22.5 * lpa * vpa;
    return Math.sqrt(valor);
}
function calcularTIR(fluxosDeCaixa, datas) {
    if (fluxosDeCaixa.length < 2 || !fluxosDeCaixa.some(v => v > 0) || !fluxosDeCaixa.some(v => v < 0)) {
        return NaN;
    }

    const calcularVPL = (taxa) => {
        let vpl = 0;
        const dataInicial = new Date(datas[0] + 'T12:00:00').getTime();
        for (let i = 0; i < fluxosDeCaixa.length; i++) {
            const dataFluxo = new Date(datas[i] + 'T12:00:00').getTime();
            const dias = (dataFluxo - dataInicial) / (1000 * 60 * 60 * 24);
            vpl += fluxosDeCaixa[i] / Math.pow(1 + taxa, dias / 365.25);
        }
        return vpl;
    };
    
    let taxaMin = -0.999;
    let taxaMax = 5.0;
    const precisao = 1.0e-7;
    const maxIteracoes = 100;
    let taxaMedia, vplMedio;

    for (let i = 0; i < maxIteracoes; i++) {
        taxaMedia = (taxaMin + taxaMax) / 2;
        vplMedio = calcularVPL(taxaMedia);

        if (Math.abs(vplMedio) < precisao) {
            return taxaMedia;
        }

        if (calcularVPL(taxaMin) * vplMedio < 0) {
            taxaMax = taxaMedia;
        } else {
            taxaMin = taxaMedia;
        }
    }
    return NaN; 
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
function construirFluxoDeCaixa(tickers, dataFinal) {
    const fluxos = [];
    const datas = [];
    const tickerSet = new Set(tickers);

    // Saídas de Caixa (Compras)
    todasAsNotas.forEach(n => {
        n.operacoes.filter(op => tickerSet.has(op.ativo) && op.tipo === 'compra' && n.data <= dataFinal).forEach(op => {
            // --- INÍCIO DA CORREÇÃO ---
            // A lógica de rateio de custos foi corrigida para usar os custos corretos da nota
            const totalOperacoesNota = n.operacoes.reduce((soma, op) => soma + op.valor, 0);
            const custoRateado = totalOperacoesNota > 0 ? (op.valor / totalOperacoesNota) * (n.custos + n.irrf) : 0;
            // --- FIM DA CORREÇÃO ---
            fluxos.push(-(op.valor + custoRateado));
            datas.push(n.data);
        });
    });
    posicaoInicial.filter(p => tickerSet.has(p.ticker) && p.transacao && p.transacao.toLowerCase() === 'compra' && p.data <= dataFinal).forEach(p => {
        fluxos.push(-(p.precoMedio * p.quantidade));
        datas.push(p.data);
    });
    
    posicaoInicial.filter(p => p.tipoRegistro === 'SUMARIO_MANUAL' && tickerSet.has(p.ticker) && p.data <= dataFinal).forEach(p => {
        const quantidadeTotal = p.posicoesPorCorretora.reduce((soma, pc) => soma + pc.quantidade, 0);
        const custoTotal = quantidadeTotal * p.precoMedio;
        if (custoTotal > 0) {
            fluxos.push(-custoTotal);
            datas.push(p.data);
        }
    });

    todosOsAjustes.filter(a => a.tipoAjuste === 'evento_ativo' && a.tipoEvento === 'entrada' && tickerSet.has(a.ticker) && a.data <= dataFinal).forEach(a => {
        const qtdEntrada = a.detalhes.reduce((soma, d) => soma + d.quantidade, 0);
        fluxos.push(-(qtdEntrada * (a.precoMedio || 0)));
        datas.push(a.data);
    });

    // Entradas de Caixa (Vendas)
    todasAsNotas.forEach(n => {
        n.operacoes.filter(op => tickerSet.has(op.ativo) && op.tipo === 'venda' && n.data <= dataFinal).forEach(op => {
             const totalOperacoesNota = n.operacoes.reduce((soma, op) => soma + op.valor, 0);
            const custoRateado = totalOperacoesNota > 0 ? (op.valor / totalOperacoesNota) * n.custos : 0;
            fluxos.push(op.valor - custoRateado);
            datas.push(n.data);
        });
    });
     posicaoInicial.filter(p => tickerSet.has(p.ticker) && p.transacao && p.transacao.toLowerCase() === 'venda' && p.data <= dataFinal).forEach(p => {
        fluxos.push(p.valorVenda || 0);
        datas.push(p.data);
    });

    todosOsAjustes.filter(a => a.tipoAjuste === 'evento_ativo' && a.tipoEvento === 'saida' && tickerSet.has(a.ticker) && a.data <= dataFinal).forEach(a => {
        const dataAnterior = new Date(a.data + 'T12:00:00');
        dataAnterior.setDate(dataAnterior.getDate() - 1);
        const posAnterior = gerarPosicaoDetalhada(dataAnterior.toISOString().split('T')[0]);
        const pmNaSaida = posAnterior[a.ticker]?.precoMedio || 0;
        const qtdSaida = a.detalhes.reduce((soma, d) => soma + d.quantidade, 0);
        fluxos.push(qtdSaida * pmNaSaida);
        datas.push(a.data);
    });

    // Entradas de Caixa (Proventos)
    todosOsProventos.filter(p => tickerSet.has(p.ticker) && p.dataPagamento && p.dataPagamento <= dataFinal).forEach(p => {
        fluxos.push(p.valorTotalRecebido);
        datas.push(p.dataPagamento);
    });

    const fluxosCombinados = fluxos.map((valor, i) => ({ valor, data: datas[i] }))
        .sort((a, b) => new Date(a.data) - new Date(b.data));
    
    return {
        fluxos: fluxosCombinados.map(f => f.valor),
        datas: fluxosCombinados.map(f => f.data)
    };
}
function calcularScoreDeQualidade(ativoInfo, dadosMercadoAtivo) {
    const componentes = { final: 0, yield: 0, bazin: 0, payout: 0, pvp: 0, dataCom: 0 };
    if (!ativoInfo || !dadosMercadoAtivo) return componentes;

    // Garante leitura segura dos pesos (Fallback para padrão se der erro)
    const pesosAcoes = configuracoesFiscais.pesosScore?.acoes || { dy: 45, bazin: 35, payout: 5, datacom: 15 };
    const pesosFiis = configuracoesFiscais.pesosScore?.fiis || { dy: 60, pvp: 40 };

    // Lógica para ativos planejados
    const posicoesAtuais = gerarPosicaoDetalhada();
    const posicaoDoAtivo = posicoesAtuais[ativoInfo.ticker];
    if (!posicaoDoAtivo || posicaoDoAtivo.quantidade < 0.000001) {
        componentes.final = 50; 
        return componentes;
    }

    const precoAtual = dadosMercadoAtivo.valor || 0;

    if (ativoInfo.tipo === 'Ação') {
        const dataInicioIninterrupto = getInicioIninterrupto(ativoInfo.ticker);
        const projecaoAnual = calcularProjecaoAnualUnitaria(ativoInfo.ticker, { limiteAnos: 5, dataInicio: dataInicioIninterrupto });
        const metaYieldAlvo = ativoInfo.metaYieldBazin || 0.06;

        if (projecaoAnual > 0 && precoAtual > 0) {
            const yieldProjetado = projecaoAnual / precoAtual;
            componentes.yield = Math.min((yieldProjetado / metaYieldAlvo), 1) * 100;

            if (metaYieldAlvo > 0) {
                const precoTetoBazin = calcularPrecoTetoBazin(projecaoAnual, metaYieldAlvo);
                if (precoTetoBazin > 0 && precoAtual < precoTetoBazin) {
                    componentes.bazin = Math.min(((precoTetoBazin - precoAtual) / precoTetoBazin) * 200, 100); 
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

        // CÁLCULO DINÂMICO USANDO OS PESOS CONFIGURADOS (Divisão por 100 pois vem inteiro)
        componentes.final = 
            (componentes.yield * (pesosAcoes.dy / 100)) + 
            (componentes.bazin * (pesosAcoes.bazin / 100)) + 
            (componentes.payout * (pesosAcoes.payout / 100)) + 
            (componentes.dataCom * (pesosAcoes.datacom / 100));

    } else if (ativoInfo.tipo === 'FII') {
        const ultimoProvento = getUltimoProvento(ativoInfo.ticker);
        const metaYieldFII = 0.12; 

        if (ultimoProvento > 0 && precoAtual > 0) {
            const yieldProjetado = (ultimoProvento * 12) / precoAtual;
            componentes.yield = Math.min((yieldProjetado / metaYieldFII), 1) * 100;
        } else {
            componentes.yield = 30;
        }

        const vpa = dadosMercadoAtivo.vpa || 0;
        if (vpa > 0 && precoAtual > 0) {
            const pvp = precoAtual / vpa;
            if (pvp < 1) {
                componentes.pvp = Math.min(((1 - pvp) / 0.3), 1) * 100;
            }
        }
        
        // CÁLCULO DINÂMICO USANDO OS PESOS CONFIGURADOS
        componentes.final = 
            (componentes.yield * (pesosFiis.dy / 100)) + 
            (componentes.pvp * (pesosFiis.pvp / 100));
    }
    
    componentes.final = Math.max(0, componentes.final);
    return componentes;
}
function ativarCalculadoraSimulacao() {
    const inputMeta = document.getElementById('input-meta-simulador');
    const tbody = document.querySelector('#tabela-simulador-resultados tbody');
    const radios = document.querySelectorAll('input[name="modo-simulador"]');
    
    // Elementos de UI
    const labelInstrucao = document.getElementById('label-simulador-instrucao');
    const spanPrefixo = document.getElementById('simulador-prefixo');
    const spanSufixo = document.getElementById('simulador-sufixo');
    const pLegenda = document.getElementById('simulador-legenda');
    const lblRenda = document.getElementById('lbl-modo-renda');
    const lblQtd = document.getElementById('lbl-modo-qtd');

    let sortConfig = { key: 'faltaComprar', direction: 'desc' };
    let modoAtual = 'renda';

    // 1. PREPARAÇÃO DOS DADOS
    const posicoes = gerarPosicaoDetalhada(); 
    
    const dadosBase = Object.keys(posicoes)
        .filter(ticker => posicoes[ticker].quantidade > 0)
        .map(ticker => {
            const ativoInfo = todosOsAtivos.find(a => a.ticker === ticker);
            const dadosMercado = dadosDeMercado.cotacoes[ticker] || {};
            const precoAtual = dadosMercado.valor || 0;
            
            let mediaMensalUnit = 0;
            if (ativoInfo && ativoInfo.tipo === 'FII') {
                mediaMensalUnit = getUltimoProvento(ticker); 
            } else {
                const projecaoAnual = calcularProjecaoAnualUnitaria(ticker, { limiteAnos: 5 });
                mediaMensalUnit = projecaoAnual > 0 ? projecaoAnual / 12 : 0;
            }

            return {
                ticker,
                mediaMensalUnit,
                precoAtual,
                qtdAtual: posicoes[ticker].quantidade,
                rendaAtual: posicoes[ticker].quantidade * mediaMensalUnit
            };
        })
        .filter(ativo => ativo.mediaMensalUnit > 0 && ativo.precoAtual > 0);

    // 2. RENDERIZAÇÃO
    const renderizarTabela = () => {
        const valorInput = parseFloat(inputMeta.value);
        
        if (!valorInput || valorInput <= 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px; color: #999;">Digite um valor acima para simular.</td></tr>';
            return;
        }

        const dadosCompletos = dadosBase.map(ativo => {
            let metaRendaMensal = 0;
            let metaQtdCotas = 0;

            if (modoAtual === 'renda') {
                metaRendaMensal = valorInput;
                metaQtdCotas = Math.ceil(valorInput / ativo.mediaMensalUnit);
            } else {
                const custoReinvestimento = valorInput * ativo.precoAtual;
                metaRendaMensal = custoReinvestimento;
                metaQtdCotas = Math.ceil(metaRendaMensal / ativo.mediaMensalUnit);
            }

            return {
                ...ativo,
                qtdNecessaria: metaQtdCotas,
                rendaMeta: metaQtdCotas * ativo.mediaMensalUnit,
                faltaComprar: metaQtdCotas - ativo.qtdAtual
            };
        });

        dadosCompletos.sort((a, b) => {
            const valA = a[sortConfig.key];
            const valB = b[sortConfig.key];
            const direction = sortConfig.direction === 'asc' ? 1 : -1;
            if (typeof valA === 'string') return valA.localeCompare(valB) * direction;
            return (valA - valB) * direction;
        });

        let html = '';
        dadosCompletos.forEach(ativo => {
            const atingiuMeta = ativo.faltaComprar <= 0;
            const corFalta = atingiuMeta ? '#2ecc71' : '#e74c3c';
            const textoFalta = atingiuMeta 
                ? '<i class="fas fa-check-circle"></i> Batida!' 
                : `<strong>${formatarDecimal(ativo.faltaComprar, 0)}</strong>`;

            html += `
                <tr>
                    <td style="text-align: left; font-weight: 600;">${ativo.ticker}</td>
                    <td class="numero" style="color: #555;">${formatarMoeda(ativo.precoAtual)}</td>
                    <td class="numero" style="color: #555;">${formatarMoeda(ativo.mediaMensalUnit)}</td>
                    <td class="numero">${formatarDecimal(ativo.qtdAtual, 0)}</td>
                    <td class="numero" style="color: #555; font-weight: 600;">${formatarMoeda(ativo.rendaAtual)}</td>
                    <td class="numero" style="background: #f0f8ff; font-weight: bold; color: #2980b9; text-align: right;">${formatarDecimal(ativo.qtdNecessaria, 0)}</td>
                    <td class="numero" style="background: #f0f8ff; font-weight: bold; color: #2980b9; text-align: right;">${formatarMoeda(ativo.rendaMeta)}</td>
                    <td class="numero" style="color: ${corFalta}; text-align: right;">${textoFalta}</td>
                </tr>
            `;
        });

        if (html === '') {
            html = '<tr><td colspan="8" style="text-align: center; padding: 20px;">Dados insuficientes (preço ou proventos) para calcular a simulação.</td></tr>';
        }
        tbody.innerHTML = html;
        atualizarIconesOrdenacao();
    };

    // 3. UI LÓGICA
    const atualizarInterfaceModo = () => {
        if (modoAtual === 'renda') {
            lblRenda.classList.add('active'); 
            lblRenda.style.background = '#e8f5e9'; 
            lblRenda.style.borderColor = '#2ecc71';
            lblRenda.style.color = '#2c3e50';

            lblQtd.classList.remove('active'); 
            lblQtd.style.background = '#fff'; 
            lblQtd.style.borderColor = '#ddd';
            lblQtd.style.color = '#2c3e50';
            
            labelInstrucao.innerHTML = 'Quanto você quer receber <strong>por mês</strong>?';
            spanPrefixo.style.display = 'block';
            spanSufixo.style.display = 'none';
            inputMeta.placeholder = '0,00';
            
            // AJUSTE DO STEP PARA MOEDA
            inputMeta.step = '10'; 

            pLegenda.textContent = '* Calcula quantas cotas você precisa ter para receber esse valor mensalmente.';
        } else {
            lblQtd.classList.add('active'); 
            lblQtd.style.background = '#e3f2fd'; 
            lblQtd.style.borderColor = '#3498db';
            lblQtd.style.color = '#2c3e50';

            lblRenda.classList.remove('active'); 
            lblRenda.style.background = '#fff'; 
            lblRenda.style.borderColor = '#ddd';
            lblRenda.style.color = '#2c3e50';
            
            labelInstrucao.innerHTML = 'Quantas <strong>novas cotas</strong> você quer que o dividendo compre?';
            spanPrefixo.style.display = 'none';
            spanSufixo.style.display = 'block';
            inputMeta.placeholder = '0';
            
            // AJUSTE DO STEP PARA UNIDADE
            inputMeta.step = '1';

            pLegenda.textContent = '* "Magic Number": Calcula quantas cotas você precisa ter para que o rendimento mensal pague essa quantidade de novas cotas.';
        }
        
        inputMeta.value = '';
        renderizarTabela(); 
        inputMeta.focus();
    };

    const atualizarIconesOrdenacao = () => {
        document.querySelectorAll('.sortable-sim i').forEach(icon => {
            icon.className = 'fas fa-sort text-muted small';
            icon.style.opacity = '0.3';
        });
        const activeHeader = document.querySelector(`.sortable-sim[data-key="${sortConfig.key}"]`);
        if (activeHeader) {
            const icon = activeHeader.querySelector('i');
            icon.className = sortConfig.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
            icon.style.opacity = '1';
            icon.style.color = '#3498db';
        }
    };

    // 4. LISTENERS
    radios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            modoAtual = e.target.value;
            atualizarInterfaceModo();
        });
    });

    inputMeta.addEventListener('input', renderizarTabela);
    
    document.querySelectorAll('.sortable-sim').forEach(header => {
        header.addEventListener('click', () => {
            const key = header.dataset.key;
            if (sortConfig.key === key) {
                sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
            } else {
                sortConfig.key = key;
                sortConfig.direction = 'desc';
            }
            renderizarTabela();
        });
    });

    atualizarInterfaceModo();
}
function gerarDadosComparativosModal(tipoFiltro, dataInicio) {
    // 1. Filtra o histórico
    const historicoFiltrado = historicoCarteira
        .filter(s => s.data >= dataInicio)
        .sort((a, b) => new Date(a.data) - new Date(b.data));

    if (historicoFiltrado.length < 2) return null;

    // 2. Identifica quais ativos estão EM CARTEIRA HOJE para essa categoria
    const posicoesAtuais = gerarPosicaoDetalhada();
    const ativosParaExibir = Object.keys(posicoesAtuais).filter(ticker => {
        if (posicoesAtuais[ticker].quantidade < 0.000001) return false; // Só quem tem saldo
        const info = todosOsAtivos.find(a => a.ticker === ticker);
        if (!info) return false;
        if (tipoFiltro === 'todos') return ['Ação', 'FII', 'ETF'].includes(info.tipo);
        return info.tipo === (tipoFiltro === 'FII' ? 'FII' : (tipoFiltro === 'Ação' ? 'Ação' : 'ETF')); // Mapeamento simples
    });

    if (ativosParaExibir.length === 0) return null;

    // 3. Inicializa Séries
    const series = {};
    ativosParaExibir.forEach(ticker => {
        series[ticker] = { dados: [], acumulado: 1, iniciado: false, ultimoValorValido: 0 };
    });

    const memoriaAtivos = {}; 

    // 4. Loop de Cálculo (Snapshot a Snapshot)
    for (let i = 0; i < historicoFiltrado.length; i++) {
        const snapAtual = historicoFiltrado[i];
        const snapAnterior = i > 0 ? historicoFiltrado[i - 1] : null;

        // Reconstrói valores do dia
        const ativosNoSnap = snapAtual.detalhesCarteira?.ativos || {};
        
        // Itera apenas sobre os ativos que queremos exibir
        ativosParaExibir.forEach(ticker => {
            const serie = series[ticker];
            const dadosSnap = ativosNoSnap[ticker];
            
            let valAtivo = 0;
            if (dadosSnap) {
                valAtivo = dadosSnap.valorDeMercado || (dadosSnap.quantidade * dadosSnap.precoAtual);
            }
            
            // Proteção de memória (igual ao dashboard)
            const valMemoria = memoriaAtivos[ticker] || 0;
            if (valAtivo <= 1 && valMemoria > 10) {
                if (!dadosSnap && snapAnterior) {
                    // Verifica venda real no período
                    const houveVenda = todasAsNotas.some(n => n.data > snapAnterior.data && n.data <= snapAtual.data && n.operacoes.some(op => op.ativo === ticker && op.tipo === 'venda'));
                    if (!houveVenda) valAtivo = valMemoria;
                    else delete memoriaAtivos[ticker];
                } else {
                    valAtivo = valMemoria;
                }
            }
            if (valAtivo > 0) memoriaAtivos[ticker] = valAtivo;

            // Cálculo TWR
            if (!serie.iniciado) {
                if (valAtivo > 0) {
                    serie.iniciado = true;
                    serie.dados.push(0); // Ponto zero
                    serie.ultimoValorValido = valAtivo;
                } else {
                    serie.dados.push(null);
                }
                return;
            }

            const valorAnterior = serie.ultimoValorValido;
            if (valAtivo <= 0.01) {
                serie.dados.push(null); // Ativo saiu da carteira ou dados falharam
                serie.ultimoValorValido = 0;
                return;
            }

            const fluxoLiquido = calcularFluxoLiquidoPeriodo(ticker, 'ativo', snapAnterior.data, snapAtual.data);
            const proventos = calcularProventosRecebidosPeriodo(ticker, 'ativo', snapAnterior.data, snapAtual.data);

            const lucroPeriodo = valAtivo - valorAnterior - fluxoLiquido + proventos;
            const denominador = valorAnterior > 1 ? valorAnterior : (fluxoLiquido > 0 ? fluxoLiquido : 1);
            const rentabilidadeDia = lucroPeriodo / denominador;

            serie.acumulado = serie.acumulado * (1 + rentabilidadeDia);
            serie.dados.push(serie.acumulado - 1);
            serie.ultimoValorValido = valAtivo;
        });
    }

    // 5. Prepara datasets do Chart.js
    const labels = historicoFiltrado.map(s => new Date(s.data + 'T12:00:00').toLocaleDateString('pt-BR'));
    const datasets = [];
    let colorIndex = 0;

    ativosParaExibir.forEach(ticker => {
        const serie = series[ticker];
        if (serie.dados.some(v => v !== null)) {
            const cor = obterCor(colorIndex++);
            datasets.push({
                label: ticker,
                data: serie.dados,
                borderColor: cor,
                backgroundColor: cor,
                fill: false,
                tension: 0.1,
                pointRadius: 0,
                pointHoverRadius: 4,
                borderWidth: 2
            });
        }
    });

    return { labels, datasets };
}
function gerarDadosGraficoAportesProventos() {
    const dadosMensais = {};
    const mesesAbrev = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    const initMes = (chaveMes) => {
        if (!dadosMensais[chaveMes]) {
            dadosMensais[chaveMes] = { proventos: 0, compras: 0, vendas: 0, aportesRF: 0, resgatesRF: 0 };
        }
    };

    todosOsProventos.forEach(p => {
        if (p.dataPagamento) {
            const chaveMes = p.dataPagamento.substring(0, 7);
            initMes(chaveMes);
            dadosMensais[chaveMes].proventos += p.valorTotalRecebido;
        }
    });

    const rendimentosRFPorAtivo = {};
    todosOsRendimentosRFNaoRealizados.forEach(r => {
        if (!rendimentosRFPorAtivo[r.ativoId]) rendimentosRFPorAtivo[r.ativoId] = {};
        const chaveMes = r.data.substring(0, 7);
        if (!rendimentosRFPorAtivo[r.ativoId][chaveMes]) rendimentosRFPorAtivo[r.ativoId][chaveMes] = [];
        rendimentosRFPorAtivo[r.ativoId][chaveMes].push(r.rendimento);
    });

    for (const ativoId in rendimentosRFPorAtivo) {
        let ultimoRendimento = 0;
        const chavesMeses = Object.keys(rendimentosRFPorAtivo[ativoId]).sort();
        chavesMeses.forEach(chaveMes => {
            const ano = parseInt(chaveMes.substring(0, 4));
            const rendimentosDoMes = rendimentosRFPorAtivo[ativoId][chaveMes];
            const rendimentoFinalMes = rendimentosDoMes[rendimentosDoMes.length - 1];
            const rendimentoIncremental = rendimentoFinalMes - ultimoRendimento;

            if (rendimentoIncremental > 0) {
                initMes(chaveMes);
                dadosMensais[chaveMes].proventos += rendimentoIncremental;
            }
            ultimoRendimento = rendimentoFinalMes;
        });
    }

    todasAsNotas.forEach(n => {
        const chaveMes = n.data.substring(0, 7);
        initMes(chaveMes);
        n.operacoes.forEach(op => {
            if (op.tipo === 'compra') {
                dadosMensais[chaveMes].compras += op.valor;
            } else if (op.tipo === 'venda') {
                dadosMensais[chaveMes].vendas += op.valor;
            }
        });
    });
    posicaoInicial.forEach(p => {
        if (p.tipoRegistro === 'TRANSACAO_HISTORICA' && p.transacao.toLowerCase() === 'venda' && p.valorVenda) {
            const chaveMes = p.data.substring(0, 7);
            initMes(chaveMes);
            dadosMensais[chaveMes].vendas += p.valorVenda;
        }
    });

    todosOsAtivosRF.forEach(ativo => {
        const chaveMesInicial = ativo.dataAplicacao.substring(0, 7);
        initMes(chaveMesInicial);
    });

    todasAsMovimentacoes.forEach(t => {
        if (t.source === 'aporte_rf' || t.source === 'resgate_rf') {
            const chaveMes = t.data.substring(0, 7);
            initMes(chaveMes);
            if (t.source === 'aporte_rf') {
                dadosMensais[chaveMes].aportesRF += (-t.valor);
            } else {
                dadosMensais[chaveMes].resgatesRF += t.valor;
            }
        }
    });

    if (Object.keys(dadosMensais).length === 0) {
        return null;
    }

    const chavesOrdenadas = Object.keys(dadosMensais).sort();
    const labels = [];
    const dadosProventos = [];
    const dadosAportes = [];

    chavesOrdenadas.forEach(chave => {
        const dadosDoMes = dadosMensais[chave];
        const [ano, mesStr] = chave.split('-');
        const mes = parseInt(mesStr, 10) - 1;

        labels.push(`${mesesAbrev[mes]}/${ano.slice(-2)}`);

        const totalAplicado = dadosDoMes.compras + dadosDoMes.aportesRF;
        const capitalInterno = dadosDoMes.vendas + dadosDoMes.resgatesRF + dadosDoMes.proventos;
        const aporteExterno = totalAplicado - capitalInterno;

        dadosProventos.push(arredondarMoeda(dadosDoMes.proventos));
        dadosAportes.push(arredondarMoeda(Math.max(0, aporteExterno)));
    });

    return {
        labels,
        datasets: [
            {
                label: 'Proventos Gerados (RV + RF)',
                data: dadosProventos,
                backgroundColor: '#2ecc71',
                borderColor: '#27ae60',
            },
            {
                label: 'Aportes Externos (Estimado)',
                data: dadosAportes,
                backgroundColor: '#3498db',
                borderColor: '#2980b9',
            }
        ]
    };
}
function calcularProjecaoHistoricaParaSnapshot(snapshot) {
    if (!snapshot || !snapshot.detalhesCarteira || !snapshot.detalhesCarteira.ativos) {
        return 0;
    }

    let projecaoAnualTotal = 0;
    const dataSnapshot = snapshot.data;

    for (const ticker in snapshot.detalhesCarteira.ativos) {
        const ativoSnapshot = snapshot.detalhesCarteira.ativos[ticker];
        const ativoInfo = todosOsAtivos.find(a => a.ticker === ticker);

        if (!ativoInfo || ativoSnapshot.quantidade <= 0) continue;

        let projecaoUnitaria = 0;
        if (ativoInfo.tipo === 'FII') {
            projecaoUnitaria = getUltimoProvento(ticker, dataSnapshot) * 12;
        } else if (ativoInfo.tipo === 'Ação') {
            projecaoUnitaria = calcularProjecaoAnualUnitaria(ticker, { dataLimite: dataSnapshot, limiteAnos: 5 });
        }

        projecaoAnualTotal += projecaoUnitaria * ativoSnapshot.quantidade;
    }

    return projecaoAnualTotal / 12; // Retorna a projeção mensal
}
function calcularValorTotalInvestimentosAtual() {
    const hoje = new Date().toISOString().split('T')[0];
    
    // A função calcularValorTotalCarteira já soma RV + RF, que é exatamente o que queremos.
    const valorCarteira = calcularValorTotalCarteira(hoje);

    return arredondarMoeda(valorCarteira);
}
function gerarDadosGraficoDesempenho(dataInicio) {
    if (!dataInicio) return null;

    // 1. Filtra e ordena o histórico pela data solicitada
    const historicoFiltrado = historicoCarteira
        .filter(s => s.data >= dataInicio)
        .sort((a, b) => new Date(a.data) - new Date(b.data));

    if (historicoFiltrado.length < 2) return null;

    const dataRealInicio = historicoFiltrado[0].data;

    // 2. Identifica TODOS os ativos presentes no período
    const ativosNoPeriodo = new Set();
    historicoFiltrado.forEach(snap => {
        if (snap.detalhesCarteira && snap.detalhesCarteira.ativos) {
            Object.keys(snap.detalhesCarteira.ativos).forEach(ticker => {
                const dados = snap.detalhesCarteira.ativos[ticker];
                if (dados.quantidade > 0.0001 || dados.valorDeMercado > 1) {
                    ativosNoPeriodo.add(ticker);
                }
            });
        }
    });

    // 3. Inicializa as Séries
    const series = {
        'IBOV': { tipo: 'indice', dados: [], acumulado: 1, iniciado: false, base: 0, ultimoValorValido: 0 },
        'IFIX': { tipo: 'indice', dados: [], acumulado: 1, iniciado: false, base: 0, ultimoValorValido: 0 },
        'SELIC': { tipo: 'benchmark_fixa', dados: [], acumulado: 1, iniciado: true, base: 1, ultimoValorValido: 1 }, 
        'Carteira RV': { tipo: 'categoria', dados: [], acumulado: 1, iniciado: false, ultimoValorValido: 0 },
        'Ações': { tipo: 'categoria', dados: [], acumulado: 1, iniciado: false, ultimoValorValido: 0 },
        'FIIs': { tipo: 'categoria', dados: [], acumulado: 1, iniciado: false, ultimoValorValido: 0 }
    };

    ativosNoPeriodo.forEach(ticker => {
        series[ticker] = { tipo: 'ativo', dados: [], acumulado: 1, iniciado: false, ultimoValorValido: 0 };
    });

    const memoriaAtivos = {}; 
    let selicAcumuladaBruta = 1.0; 
    let ultimaDataSelicCalculada = new Date(dataRealInicio + 'T12:00:00'); 
    const dbSelic = dadosDeMercado.historicoSelic || [];

    const getTaxaSelicDia = (dataRef) => {
        if (dbSelic.length === 0) return 10.0; 
        const dataStr = dataRef.toISOString().split('T')[0];
        let taxaEncontrada = dbSelic.find(d => d.data === dataStr);
        if (!taxaEncontrada) {
            const anteriores = dbSelic.filter(d => d.data <= dataStr);
            if (anteriores.length > 0) taxaEncontrada = anteriores[anteriores.length - 1];
        }
        return taxaEncontrada ? taxaEncontrada.valor : 10.0;
    };

    const getAliquotaIR = (diasCorridos) => {
        if (diasCorridos <= 180) return 0.225;
        if (diasCorridos <= 360) return 0.20; 
        if (diasCorridos <= 720) return 0.175;
        return 0.15;
    };

    // 4. Loop Principal: Processa dia a dia
    for (let i = 0; i < historicoFiltrado.length; i++) {
        const snapAtual = historicoFiltrado[i];
        const snapAnterior = i > 0 ? historicoFiltrado[i - 1] : null;
        const dataSnapAtualObj = new Date(snapAtual.data + 'T12:00:00');

        // --- CÁLCULO DA SELIC ENTRE SNAPSHOTS ---
        let iteradorData = new Date(ultimaDataSelicCalculada);
        iteradorData.setDate(iteradorData.getDate() + 1); 

        if (i > 0) {
            while (iteradorData <= dataSnapAtualObj) {
                if (isDiaUtil(iteradorData)) {
                    const taxaAnual = getTaxaSelicDia(iteradorData);
                    const fatorDiario = Math.pow(1 + (taxaAnual / 100), 1 / 252);
                    selicAcumuladaBruta *= fatorDiario;
                }
                iteradorData.setDate(iteradorData.getDate() + 1);
            }
            ultimaDataSelicCalculada = new Date(dataSnapAtualObj); 
        }

        const diffTempo = Math.abs(dataSnapAtualObj - new Date(dataRealInicio + 'T12:00:00'));
        const diasCorridosDesdeInicio = Math.ceil(diffTempo / (1000 * 60 * 60 * 24)); 
        const aliquota = getAliquotaIR(diasCorridosDesdeInicio);
        
        const lucroBruto = selicAcumuladaBruta - 1;
        const lucroLiquido = lucroBruto * (1 - aliquota);
        const selicResultadoLiquido = lucroLiquido; 

        series['SELIC'].dados.push(selicResultadoLiquido);
        series['SELIC'].ultimoValorValido = selicResultadoLiquido;

        // --- A. RECONSTRUÇÃO DOS VALORES DO DIA ---
        let valIBOV = snapAtual.ibov || 0;
        if (valIBOV <= 0 && series['IBOV'].ultimoValorValido > 0) valIBOV = series['IBOV'].ultimoValorValido;
        if (valIBOV > 0) series['IBOV'].ultimoValorValido = valIBOV;

        let valIFIX = snapAtual.ifix || 0;
        if (valIFIX <= 0 && series['IFIX'].ultimoValorValido > 0) valIFIX = series['IFIX'].ultimoValorValido;
        if (valIFIX > 0) series['IFIX'].ultimoValorValido = valIFIX;

        const valoresCorrigidosHoje = {};
        const totaisCategoriaHoje = { 'Ações': 0, 'FIIs': 0, 'Carteira RV': 0 };

        const ativosNoSnap = snapAtual.detalhesCarteira?.ativos || {};
        const todosTickersLoop = new Set([...Object.keys(ativosNoSnap), ...Object.keys(memoriaAtivos)]);

        todosTickersLoop.forEach(ticker => {
            const dadosSnap = ativosNoSnap[ticker];
            let valAtivo = 0;
            let quantidade = 0;

            if (dadosSnap) {
                valAtivo = dadosSnap.valorDeMercado || (dadosSnap.quantidade * dadosSnap.precoAtual);
                quantidade = dadosSnap.quantidade;
            }

            const valMemoria = memoriaAtivos[ticker] || 0;

            if (quantidade <= 0.0001) {
                valAtivo = 0;
                delete memoriaAtivos[ticker]; 
            } else if (valAtivo <= 1 && valMemoria > 10) {
                valAtivo = valMemoria;
            }

            if (valAtivo > 0) {
                memoriaAtivos[ticker] = valAtivo;
                valoresCorrigidosHoje[ticker] = valAtivo;

                const cadastro = todosOsAtivos.find(a => a.ticker === ticker);
                if (cadastro) {
                    totaisCategoriaHoje['Carteira RV'] += valAtivo;
                    const cat = cadastro.tipo === 'Ação' ? 'Ações' : (cadastro.tipo === 'FII' ? 'FIIs' : null);
                    if (cat && totaisCategoriaHoje[cat] !== undefined) {
                        totaisCategoriaHoje[cat] += valAtivo;
                    }
                }
            }
        });

        // --- B. CÁLCULO DA RENTABILIDADE (Séries RV) ---
        Object.keys(series).forEach(nomeSerie => {
            if (nomeSerie === 'SELIC') return;

            const serie = series[nomeSerie];
            let valorAtual = 0;

            if (serie.tipo === 'indice') {
                valorAtual = nomeSerie === 'IBOV' ? valIBOV : valIFIX;
            } else if (serie.tipo === 'categoria') {
                valorAtual = totaisCategoriaHoje[nomeSerie];
            } else {
                valorAtual = valoresCorrigidosHoje[nomeSerie] || 0;
            }

            if (!serie.iniciado) {
                if (valorAtual > 0) {
                    serie.iniciado = true;
                    serie.base = valorAtual;
                    serie.dados.push(0);
                    serie.ultimoValorValido = valorAtual;
                } else {
                    serie.dados.push(null);
                }
                return;
            }

            const valorAnterior = serie.ultimoValorValido;

            if (valorAtual <= 0.01 && valorAnterior <= 0.01) {
                serie.dados.push(null);
                serie.ultimoValorValido = 0; 
                return;
            }

            if (serie.tipo === 'indice') {
                const rentabilidadeTotal = (valorAtual / serie.base) - 1;
                serie.dados.push(rentabilidadeTotal);
                serie.ultimoValorValido = valorAtual;
                return;
            }

            const fluxoLiquido = calcularFluxoLiquidoPeriodo(nomeSerie, serie.tipo, snapAnterior.data, snapAtual.data);
            const proventosRecebidos = calcularProventosRecebidosPeriodo(nomeSerie, serie.tipo, snapAnterior.data, snapAtual.data);

            let rentabilidadeDia = 0;

            if (valorAnterior <= 1 && Math.abs(fluxoLiquido) <= 0.01) {
                rentabilidadeDia = 0;
            } else {
                // A SOLUÇÃO: O capital que sofre a variação do mercado é o saldo inicial somado ao aporte do dia.
                let denominador = valorAnterior + (fluxoLiquido > 0 ? fluxoLiquido : 0);
                
                // Trava de segurança extra contra divisões por zero absolutas
                if (denominador < 1) denominador = 1;

                const lucroPeriodo = valorAtual - valorAnterior - fluxoLiquido + proventosRecebidos;
                rentabilidadeDia = lucroPeriodo / denominador;

                // --- OS 3 FILTROS DE SANIDADE MATEMÁTICA ---
                if (proventosRecebidos > (denominador * 0.10)) {
                    rentabilidadeDia = 0;
                } 
                else if (serie.tipo === 'categoria') {
                    if (rentabilidadeDia > 0.25 || rentabilidadeDia < -0.25) {
                        rentabilidadeDia = 0;
                    }
                }
                else if (serie.tipo === 'ativo') {
                    if (rentabilidadeDia > 0.80 || rentabilidadeDia < -0.80) {
                        rentabilidadeDia = 0;
                    }
                }
            }

            serie.acumulado = serie.acumulado * (1 + rentabilidadeDia);
            serie.dados.push(serie.acumulado - 1);
            serie.ultimoValorValido = valorAtual;
        });
    }

    // 5. Prepara dados para o Chart.js
    const labels = historicoFiltrado.map(s => new Date(s.data + 'T12:00:00').toLocaleDateString('pt-BR'));
    const datasets = [];
    let colorIndex = 0;
    
    const prioridade = ['Carteira RV', 'SELIC', 'IBOV', 'IFIX', 'Ações', 'FIIs'];

    const chavesOrdenadas = Object.keys(series).sort((a, b) => {
        const idxA = prioridade.indexOf(a); const idxB = prioridade.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1; if (idxB !== -1) return 1;
        return a.localeCompare(b);
    });

    chavesOrdenadas.forEach(nome => {
        const serie = series[nome];
        if (serie.dados.some(v => v !== null)) {
            let cor;
            let width = 1.5;
            let dash = [];

            if (nome === 'SELIC') {
                cor = '#34495e'; 
                width = 2.5;
                dash = [5, 5]; 
            } else {
                cor = obterCor(colorIndex++);
                width = prioridade.includes(nome) ? 3 : 1.5;
            }

            datasets.push({
                label: nome,
                data: serie.dados,
                borderColor: cor,
                backgroundColor: cor,
                fill: false,
                tension: 0.1,
                pointRadius: 0,
                pointHoverRadius: 4,
                borderWidth: width,
                borderDash: dash 
            });
        }
    });

    return { labels, datasets };
}
function calcularValorMercadoSnapshot(snapshot, alvo, tipo) {
    let total = 0;

    if (tipo === 'categoria') {
        if (alvo === 'Renda Fixa') {
            if (snapshot.detalhesCarteira && snapshot.detalhesCarteira.rendaFixa) {
                snapshot.detalhesCarteira.rendaFixa.forEach(rf => total += (rf.saldoLiquido || 0));
            } else {
                // Compatibilidade com snapshots antigos
                total = snapshot.detalhesCarteira?.valorPorClasse?.['Renda Fixa'] || 0;
            }
        } else {
            // Categorias de RV
            if (snapshot.detalhesCarteira && snapshot.detalhesCarteira.ativos) {
                for (const ticker in snapshot.detalhesCarteira.ativos) {
                    const ativoSnap = snapshot.detalhesCarteira.ativos[ticker];
                    const ativoCadastro = todosOsAtivos.find(a => a.ticker === ticker);
                    const tipoMapeado = ativoCadastro ? (ativoCadastro.tipo === 'Ação' ? 'Ações' : ativoCadastro.tipo === 'FII' ? 'FIIs' : 'ETFs') : null;

                    if (tipoMapeado === alvo) {
                        total += (ativoSnap.valorDeMercado || (ativoSnap.quantidade * ativoSnap.precoAtual));
                    }
                }
            }
        }
    } else if (tipo === 'ativo') {
        // Ativo Individual
        if (snapshot.detalhesCarteira && snapshot.detalhesCarteira.ativos && snapshot.detalhesCarteira.ativos[alvo]) {
            const ativoSnap = snapshot.detalhesCarteira.ativos[alvo];
            total = (ativoSnap.valorDeMercado || (ativoSnap.quantidade * ativoSnap.precoAtual));
        }
    }
    return total;
}

function calcularFluxoLiquidoPeriodo(alvo, tipo, dataInicio, dataFim) {
    let fluxoLiquido = 0;

    // Se fosse Renda Fixa
    if (alvo === 'Renda Fixa') {
        todasAsMovimentacoes.forEach(mov => {
            if (mov.data > dataInicio && mov.data <= dataFim) {
                if (mov.source === 'aporte_rf') fluxoLiquido += Math.abs(mov.valor);
                else if (mov.source === 'resgate_rf') fluxoLiquido -= Math.abs(mov.valor);
            }
        });
        return fluxoLiquido;
    }

    // Helper para processar valores
    const processarTransacao = (ticker, valorTransacao, tipoOp, custosOp) => {
        let pertence = false;
        const ativoCadastro = todosOsAtivos.find(a => a.ticker === ticker);
        
        if (alvo === 'Carteira RV') {
            pertence = ativoCadastro && ['Ação', 'FII', 'ETF'].includes(ativoCadastro.tipo);
        } else if (tipo === 'ativo') {
            pertence = (ticker === alvo);
        } else {
            const tipoMapeado = ativoCadastro ? (ativoCadastro.tipo === 'Ação' ? 'Ações' : ativoCadastro.tipo === 'FII' ? 'FIIs' : 'ETFs') : null;
            pertence = (tipoMapeado === alvo);
        }

        if (pertence) {
            if (tipoOp === 'compra') {
                fluxoLiquido += (valorTransacao + custosOp);
            } else if (tipoOp === 'venda') {
                fluxoLiquido -= (valorTransacao - custosOp);
            }
        }
    };

    // 1. Notas de Negociação (Dinheiro Real saindo/entrando do bolso)
    todasAsNotas.forEach(nota => {
        if (nota.data > dataInicio && nota.data <= dataFim) {
            const totalNota = nota.operacoes.reduce((sum, o) => sum + o.valor, 0);
            nota.operacoes.forEach(op => {
                const custosOp = totalNota > 0 ? (op.valor / totalNota) * (nota.custos + nota.irrf) : 0;
                processarTransacao(op.ativo, op.valor, op.tipo, custosOp);
            });
        }
    });

    // 2. Posição Inicial (Histórico legado conta como fluxo inicial)
    posicaoInicial.forEach(p => {
        if (p.tipoRegistro === 'TRANSACAO_HISTORICA' && p.data > dataInicio && p.data <= dataFim) {
            const val = p.transacao.toLowerCase() === 'compra' ? (p.quantidade * p.precoMedio) : (p.valorVenda || (p.quantidade * p.precoMedio));
            processarTransacao(p.ticker, val, p.transacao.toLowerCase(), 0);
        }
    });

    // 3. Eventos de Ativo (Bonificações, Cisões, etc.)
    // --- ALTERAÇÃO: IGNORAMOS ESTES EVENTOS NO CÁLCULO DE FLUXO ---
    // Como são eventos corporativos (ex: ganho de ações por bonificação), 
    // não houve desembolso financeiro (fluxo de caixa do investidor = 0).
    // Ao ignorar aqui, o aumento de patrimônio gerado por essas novas ações 
    // será interpretado matematicamente pelo gráfico como RENTABILIDADE (Lucro).
    
    /* todosOsAjustes.forEach(a => {
        if (a.tipoAjuste === 'evento_ativo' ... ) {
           // Lógica removida para garantir que Bonificação gere alta no gráfico
        }
    }); 
    */

    return fluxoLiquido;
}

function gerarCacheInicioIninterrupto() {
    if (cacheInicioIninterrupto) return cacheInicioIninterrupto;

    // console.time("GerarCacheInicios_Otimizado"); 
    const mapaInicios = {};

    // 1. Pega data de zeragem (Assume-se que esta função já retorna datas em string YYYY-MM-DD)
    const relatorioZeradas = gerarRelatorioPosicoesZeradas();
    const mapaZeradas = {};
    
    // Otimização: Loop simples é mais rápido que forEach em arrays grandes
    for (let i = 0; i < relatorioZeradas.length; i++) {
        const r = relatorioZeradas[i];
        // Comparação de Strings direta (sem new Date)
        if (!mapaZeradas[r.ticker] || r.dataEncerramento > mapaZeradas[r.ticker]) {
            mapaZeradas[r.ticker] = r.dataEncerramento;
        }
    }

    // 2. Coleta operações (Agrupamento)
    const comprasPorAtivo = {};

    // Varredura de Notas
    for (let i = 0; i < todasAsNotas.length; i++) {
        const n = todasAsNotas[i];
        const ops = n.operacoes;
        for (let j = 0; j < ops.length; j++) {
            const op = ops[j];
            if (op.tipo === 'compra') {
                if (!comprasPorAtivo[op.ativo]) comprasPorAtivo[op.ativo] = [];
                comprasPorAtivo[op.ativo].push(n.data);
            }
        }
    }

    // Varredura de Posição Inicial
    for (let i = 0; i < posicaoInicial.length; i++) {
        const p = posicaoInicial[i];
        if (!p.transacao || p.transacao.toLowerCase() === 'compra') {
            if (!comprasPorAtivo[p.ticker]) comprasPorAtivo[p.ticker] = [];
            comprasPorAtivo[p.ticker].push(p.data);
        }
    }

    // 3. Define a data final (Lógica Otimizada: Sem Sort, Sem new Date)
    for (const ticker in comprasPorAtivo) {
        const datasCompras = comprasPorAtivo[ticker];
        const dataUltimaZerada = mapaZeradas[ticker];
        
        let primeiraCompraValida = null;

        // Itera sobre as datas para achar a MENOR que seja maior que a zerada
        for (let k = 0; k < datasCompras.length; k++) {
            const dataCompra = datasCompras[k];

            // Filtro de Zeragem (Comparação de String)
            if (dataUltimaZerada && dataCompra <= dataUltimaZerada) {
                continue; // Ignora compra antiga
            }

            // Busca de Mínimo (Substitui o .sort)
            if (primeiraCompraValida === null || dataCompra < primeiraCompraValida) {
                primeiraCompraValida = dataCompra;
            }
        }

        mapaInicios[ticker] = primeiraCompraValida; // Pode ser a data ou null
    }

    // console.timeEnd("GerarCacheInicios_Otimizado");
    cacheInicioIninterrupto = mapaInicios;
    return mapaInicios;
}
function gerarDadosProjecaoFutura() {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const hojeStr = hoje.toISOString().split('T')[0];
    const hojeMeiaNoite = new Date(hojeStr + 'T00:00:00');

    const todosOsEventos = obterTodosOsEventosDeCaixa();
    const items = [...getTodasContasAtivas(), ...todosOsAtivosMoedas]; // Combina todas as contas e ativos

    // 1. Coleta corretamente as transações a partir de hoje (inclusive) para a projeção
    const transacoesFuturas = todosOsEventos.filter(e => 
        new Date(e.data + 'T12:00:00') >= hojeMeiaNoite
    );
    
    if (transacoesFuturas.length === 0) {
        return null;
    }

    const dataInicioProjecao = hoje;
    const dataFinalProjecao = new Date(Math.max(...transacoesFuturas.map(t => new Date(t.data + 'T12:00:00'))));
    
    const datas = [];
    for (let d = new Date(dataInicioProjecao); d <= dataFinalProjecao; d.setDate(d.getDate() + 1)) {
        datas.push(new Date(d));
    }
    
    if (datas.length === 0 && transacoesFuturas.length > 0) {
        datas.push(hoje);
    }

    const dataMatrix = new Map();
    
    datas.forEach(data => {
        const dataStr = data.toISOString().split('T')[0];
        const transacoesDoDia = transacoesFuturas.filter(t => t.data === dataStr);
        
        transacoesDoDia.forEach(t => {
            const itemIdStr = String(t.idAlvo);
            if (!dataMatrix.has(itemIdStr)) {
                dataMatrix.set(itemIdStr, new Map());
            }
            const eventosAtuais = dataMatrix.get(itemIdStr).get(dataStr) || [];
            eventosAtuais.push(t);
            dataMatrix.get(itemIdStr).set(dataStr, eventosAtuais);
        });
    });

    const saldosIniciais = new Map();

    items.forEach(item => {
        const itemIdStr = String(item.id);
        const tipoAlvo = (!item.moeda || item.moeda === 'BRL') ? 'conta' : 'moeda';
        
        const eventosPassados = todosOsEventos.filter(e =>
            String(e.idAlvo) === itemIdStr &&
            e.tipo === tipoAlvo &&
            e.source !== 'recorrente_futura' &&
            new Date(e.data + 'T12:00:00') < hojeMeiaNoite &&
            new Date(e.data + 'T12:00:00') >= new Date(item.dataSaldoInicial + 'T12:00:00')
        );
        
        const saldoInicialProjecao = eventosPassados.reduce((soma, e) => soma + e.valor, item.saldoInicial);
        saldosIniciais.set(itemIdStr, saldoInicialProjecao);
    });

    return {
        datas: datas.map(d => d.toISOString().split('T')[0]),
        items,
        saldosIniciais,
        dataMatrix
    };
}
function calcularCrescimentoCompostoMensal(historico) {
    if (!historico || historico.length < 2) return null;

    // Filtra o histórico para começar a partir do primeiro valor positivo.
    const primeiroIndiceValido = historico.findIndex(p => p.valor > 0);
    if (primeiroIndiceValido === -1) return null;
    const historicoValido = historico.slice(primeiroIndiceValido);
    if (historicoValido.length < 2) return null;

    const pontoInicial = historicoValido[0];
    const pontoFinal = historicoValido[historicoValido.length - 1];

    const valorInicial = pontoInicial.valor;
    const valorFinal = pontoFinal.valor;
    const dataInicial = new Date(pontoInicial.data);
    const dataFinal = new Date(pontoFinal.data);

    // Calcula o número de meses entre as datas.
    const diffAnos = dataFinal.getFullYear() - dataInicial.getFullYear();
    const nMeses = diffAnos * 12 + (dataFinal.getMonth() - dataInicial.getMonth());

    if (nMeses <= 0) return null; // Precisa de pelo menos um mês de intervalo.

    // Fórmula do CAGR, adaptada para meses: (VF/VI)^(1/n) - 1
    const taxaMensal = Math.pow(valorFinal / valorInicial, 1 / nMeses) - 1;

    // Retorna a taxa apenas se for um número válido e positivo.
    return (isNaN(taxaMensal) || !isFinite(taxaMensal) || taxaMensal <= 0) ? null : taxaMensal;
}

function calcularPrevisaoMeta(historico, valorAtual, valorAlvo) {
    if (valorAtual >= valorAlvo) return "Meta Atingida!";
    
    const taxaMensal = calcularCrescimentoCompostoMensal(historico);

    if (taxaMensal === null) {
        // Se o histórico for curto, tenta uma média linear como fallback
        if (historico.length >= 2) {
             return "Crescimento negativo ou estagnado.";
        }
        return "Dados insuficientes para previsão.";
    }

    // Fórmula de juros compostos para encontrar o número de meses: n = log(VF / VP) / log(1 + i)
    const mesesParaAtingir = Math.log(valorAlvo / valorAtual) / Math.log(1 + taxaMensal);

    if (isNaN(mesesParaAtingir) || !isFinite(mesesParaAtingir)) {
        return "Não foi possível projetar a data.";
    }
    
    if (mesesParaAtingir > 1200) { // Limite de 100 anos
        return "Mais de 100 anos.";
    }

    const dataPrevista = new Date();
    dataPrevista.setMonth(dataPrevista.getMonth() + Math.ceil(mesesParaAtingir));

    return dataPrevista.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}
function diagnosticarTIR(tipoAtivo) {
    console.log(`--- INÍCIO DO DIAGNÓSTICO DE TIR PARA: ${tipoAtivo} ---`);

    const hoje = new Date().toISOString().split('T')[0];
    const posicoesAtuais = gerarPosicaoDetalhada();
    
    // 1. Identificar os ativos a serem analisados
    const tickersParaAnalisar = todosOsAtivos
        .filter(a => a.tipo === tipoAtivo && posicoesAtuais[a.ticker]?.quantidade > 0.000001)
        .map(a => a.ticker);

    if (tickersParaAnalisar.length === 0) {
        console.log("Nenhum ativo em carteira encontrado para esta categoria.");
        console.log("--- FIM DO DIAGNÓSTICO ---");
        return;
    }
    console.log(`[ETAPA 1] Ativos em carteira encontrados para análise:`, tickersParaAnalisar);

    // 2. Construir o fluxo de caixa
    console.log("\n[ETAPA 2] Construindo o fluxo de caixa...");
    const tickerSet = new Set(tickersParaAnalisar);
    const fluxos = [];
    const datas = [];

    // --- CÓPIA DA LÓGICA DE construirFluxoDeCaixa COM LOGS ---
    console.log("  - Lendo 'Posição Inicial' (SUMARIO_MANUAL)...");
    posicaoInicial.filter(p => p.tipoRegistro === 'SUMARIO_MANUAL' && tickerSet.has(p.ticker)).forEach(p => {
        const qtd = p.posicoesPorCorretora.reduce((soma, pc) => soma + pc.quantidade, 0);
        const custo = qtd * p.precoMedio;
        if (custo > 0) {
            fluxos.push(-custo);
            datas.push(p.data);
            console.log(`    > Encontrado SUMARIO_MANUAL para ${p.ticker} em ${p.data}: Saída de ${formatarMoeda(custo)}`);
        }
    });

    console.log("  - Lendo 'Histórico de Ativo' (TRANSACAO_HISTORICA)...");
    posicaoInicial.filter(p => p.tipoRegistro === 'TRANSACAO_HISTORICA' && tickerSet.has(p.ticker)).forEach(p => {
        if (p.transacao.toLowerCase() === 'compra') {
            const custo = p.precoMedio * p.quantidade;
            fluxos.push(-custo);
            datas.push(p.data);
            console.log(`    > Encontrado Histórico (Compra) para ${p.ticker} em ${p.data}: Saída de ${formatarMoeda(custo)}`);
        } else { // Venda
            fluxos.push(p.valorVenda || 0);
            datas.push(p.data);
            console.log(`    > Encontrado Histórico (Venda) para ${p.ticker} em ${p.data}: Entrada de ${formatarMoeda(p.valorVenda || 0)}`);
        }
    });

    console.log("  - Lendo 'Notas de Negociação'...");
    todasAsNotas.forEach(n => {
        n.operacoes.filter(op => tickerSet.has(op.ativo)).forEach(op => {
            const custoRateado = (n.operacoes.reduce((s, o) => s + o.valor, 0) > 0) ? (op.valor / n.operacoes.reduce((s, o) => s + o.valor, 0)) * (n.custosNota + n.irrfNota) : 0;
            if (op.tipo === 'compra') {
                fluxos.push(-(op.valor + custoRateado));
                datas.push(n.data);
                console.log(`    > Encontrado Nota (Compra) para ${op.ativo} em ${n.data}: Saída de ${formatarMoeda(op.valor + custoRateado)}`);
            } else {
                fluxos.push(op.valor - custoRateado);
                datas.push(n.data);
                console.log(`    > Encontrado Nota (Venda) para ${op.ativo} em ${n.data}: Entrada de ${formatarMoeda(op.valor - custoRateado)}`);
            }
        });
    });

    console.log("  - Lendo 'Eventos de Ativos'...");
    todosOsAjustes.filter(a => a.tipoAjuste === 'evento_ativo' && tickerSet.has(a.ticker)).forEach(a => {
        if (a.tipoEvento === 'entrada') {
            const qtd = a.detalhes.reduce((soma, d) => soma + d.quantidade, 0);
            const custo = qtd * (a.precoMedio || 0);
            fluxos.push(-custo);
            datas.push(a.data);
            console.log(`    > Encontrado Evento (Entrada) para ${a.ticker} em ${a.data}: Saída de ${formatarMoeda(custo)}`);
        } else { // Saída
            const dataAnterior = new Date(a.data + 'T12:00:00');
            dataAnterior.setDate(dataAnterior.getDate() - 1);
            const posAnterior = gerarPosicaoDetalhada(dataAnterior.toISOString().split('T')[0]);
            const pmNaSaida = posAnterior[a.ticker]?.precoMedio || 0;
            const qtd = a.detalhes.reduce((soma, d) => soma + d.quantidade, 0);
            const valorSaida = qtd * pmNaSaida;
            fluxos.push(valorSaida);
            datas.push(a.data);
            console.log(`    > Encontrado Evento (Saída) para ${a.ticker} em ${a.data}: Entrada de ${formatarMoeda(valorSaida)} (baseado no PM)`);
        }
    });

    console.log("  - Lendo 'Proventos'...");
    todosOsProventos.filter(p => tickerSet.has(p.ticker) && p.dataPagamento).forEach(p => {
        fluxos.push(p.valorTotalRecebido);
        datas.push(p.dataPagamento);
        console.log(`    > Encontrado Provento para ${p.ticker} em ${p.dataPagamento}: Entrada de ${formatarMoeda(p.valorTotalRecebido)}`);
    });
    // --- FIM DA CÓPIA DA LÓGICA ---

    // 3. Adicionar o valor de mercado final
    console.log("\n[ETAPA 3] Adicionando o valor de mercado final ao fluxo...");
    const mercadoTotalCategoria = tickersParaAnalisar.reduce((soma, ticker) => {
        const posicao = posicoesAtuais[ticker];
        const cotacao = dadosDeMercado.cotacoes[ticker]?.valor || posicao.precoMedio;
        return soma + (posicao.quantidade * cotacao);
    }, 0);

    if (fluxos.length > 0) {
        fluxos.push(mercadoTotalCategoria);
        datas.push(hoje);
        console.log(`  - Valor de Mercado Final adicionado em ${hoje}: Entrada de ${formatarMoeda(mercadoTotalCategoria)}`);
    } else {
        console.log("  - Nenhum fluxo de caixa inicial encontrado. O valor de mercado não será adicionado.");
    }

    // 4. Exibir o fluxo final e tentar calcular a TIR
    console.log("\n[ETAPA 4] Tentando calcular a TIR com os dados finais...");
    const fluxosCombinados = fluxos.map((valor, i) => ({ valor, data: datas[i] }))
        .sort((a, b) => new Date(a.data) - new Date(b.data));
        
    const fluxosFinais = fluxosCombinados.map(f => f.valor);
    const datasFinais = fluxosCombinados.map(f => f.data);

    console.log("  - Array de Fluxos de Caixa Final:", fluxosFinais);
    console.log("  - Array de Datas Final:", datasFinais);
    
    const tir = calcularTIR(fluxosFinais, datasFinais);

    console.log("\n[ETAPA 5] Resultado Final:");
    if (isNaN(tir)) {
        console.error("  - O cálculo da TIR falhou. Resultado: N/A");
        if (!fluxosFinais.some(v => v > 0)) console.error("    > Motivo Provável: Nenhum fluxo de caixa POSITIVO (entradas) foi encontrado.");
        if (!fluxosFinais.some(v => v < 0)) console.error("    > Motivo Provável: Nenhum fluxo de caixa NEGATIVO (saídas/aportes) foi encontrado.");
    } else {
        console.log(`  - TIR Anualizada Calculada: ${formatarPercentual(tir)}`);
    }

    console.log("--- FIM DO DIAGNÓSTICO ---");
}