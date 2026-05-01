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
function calcularPrecoTetoBazin(dividendoAnual, metaYield) {
    if (metaYield <= 0) return 0;
    return dividendoAnual / metaYield;
}

/**
 * Calcula o Preço Teto pela fórmula de Graham.
 */
function calcularPrecoTetoGraham(lpa, vpa) {
    if (lpa <= 0 || vpa <= 0) return 0;
    const valor = 22.5 * lpa * vpa;
    return Math.sqrt(valor);
}
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