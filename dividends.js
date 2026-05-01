function calcularDadosProvento(ticker, dataCom, valorIndividual) { const posicoesNaData = gerarPosicaoDetalhada(dataCom); const posicaoDoAtivo = posicoesNaData[ticker]; if (!posicaoDoAtivo || posicaoDoAtivo.quantidade <= 0) { return { quantidadeNaDataCom: 0, valorTotalRecebido: 0, precoMedioNaDataCom: 0, yieldOnCost: 0, posicaoPorCorretora: {} }; } const quantidadeTotal = posicaoDoAtivo.quantidade; const precoMedio = posicaoDoAtivo.precoMedio; const valorTotal = quantidadeTotal * valorIndividual; const yieldOnCost = precoMedio > 0 ? (valorIndividual / precoMedio) : 0; let posPorCorretoraCalculada = {}; for (const corretora in posicaoDoAtivo.porCorretora) { const qtd = posicaoDoAtivo.porCorretora[corretora]; if (qtd > 0) { posPorCorretoraCalculada[corretora] = { quantidade: qtd, valorRecebido: qtd * valorIndividual }; } } return { quantidadeNaDataCom: quantidadeTotal, valorTotalRecebido: valorTotal, precoMedioNaDataCom: precoMedio, yieldOnCost: yieldOnCost, posicaoPorCorretora: posPorCorretoraCalculada }; }
function calcularProjecaoProventosNegociacao(ativosSnapshot = null) {
    // Se nenhum snapshot for fornecido, usa a posição atual da carteira.
    const posicoesParaCalculo = ativosSnapshot ? ativosSnapshot : gerarPosicaoDetalhada();

    let totalRendimentoAtualFIIs = 0;
    let totalRendimentoAtualAcoes = 0;

    // Itera sobre os tickers da carteira (atual ou do snapshot)
    for (const ticker in posicoesParaCalculo) {
        const ativoInfo = todosOsAtivos.find(a => a.ticker === ticker);
        if (!ativoInfo) continue;

        const posicao = posicoesParaCalculo[ticker];
        if (!posicao || posicao.quantidade <= 0) continue;

        if (ativoInfo.tipo === 'FII') {
            const ultimoProvento = getUltimoProvento(ticker);
            totalRendimentoAtualFIIs += ultimoProvento * posicao.quantidade;
        } else if (ativoInfo.tipo === 'Ação') {
            const projecaoAnualUnitaria = calcularProjecaoAnualUnitaria(ticker, { limiteAnos: 5 });
            totalRendimentoAtualAcoes += (projecaoAnualUnitaria * posicao.quantidade) / 12;
        }
    }

    return {
        acoes: totalRendimentoAtualAcoes,
        fiis: totalRendimentoAtualFIIs
    };
}
function calcularProjecaoAnualUnitaria(ticker, options = {}) {
    const hoje = new Date().toISOString().split('T')[0];
    const dataFim = options.dataLimite || hoje;

    let dataInicio = options.dataInicio || getInicioInvestimento([ticker], dataFim);
    
    if (!dataInicio) {
        return 0;
    }

    if (options.limiteAnos) {
        let dataCorte5Anos = new Date(dataFim);
        dataCorte5Anos.setFullYear(dataCorte5Anos.getFullYear() - options.limiteAnos);
        const dataCorte5AnosStr = dataCorte5Anos.toISOString().split('T')[0];

        if (new Date(dataInicio) < new Date(dataCorte5AnosStr)) {
            dataInicio = dataCorte5AnosStr;
        }
    }

    const diasDeHistorico = calcularDiffDias(dataInicio, dataFim);
    if (diasDeHistorico <= 0) {
        return 0;
    }
    
    const fonteDeProventos = options.proventosParaCalculo || todosOsProventos;
    
    const proventosNoPeriodo = fonteDeProventos.filter(p =>
        p.ticker === ticker &&
        p.dataCom >= dataInicio &&
        p.dataCom <= dataFim
    );

    const somaTotalPeriodo = proventosNoPeriodo.reduce((acc, p) => acc + p.valorIndividual, 0);

    return (somaTotalPeriodo / diasDeHistorico) * 365.25;
}
function getUltimoProvento(ticker, dataLimite = null) {
    const hoje = new Date().toISOString().split('T')[0];
    const dataFinal = dataLimite || hoje;

    const proventosDoAtivo = todosOsProventos
        .filter(p => p.ticker === ticker && p.valorIndividual > 0 && p.dataCom && p.dataCom <= dataFinal)
        .sort((a, b) => new Date(b.dataCom) - new Date(a.dataCom));

    return proventosDoAtivo.length > 0 ? proventosDoAtivo[0].valorIndividual : 0;
}
function calcularTotalProventosProvisionados() {
    const hojeStr = new Date().toISOString().split('T')[0];
    const proventosProvisionados = todosOsProventos.filter(p =>
        p.dataCom && p.dataPagamento &&
        p.dataCom < hojeStr &&
        p.dataPagamento > hojeStr
    );
    return proventosProvisionados.reduce((soma, p) => soma + (p.valorTotalRecebido || 0), 0);
}
function abrirModalLancamentoProvento(proventoParaEditar = null, tickerPreenchido = '') {
    const form = document.getElementById('form-lancamento-provento');
    form.reset();
    const tituloModal = document.getElementById('provento-modal-titulo');
    
    if (proventoParaEditar) {
        // Tradução: Título
        tituloModal.textContent = 'Edit Income';
        document.getElementById('provento-id').value = proventoParaEditar.id;
        document.getElementById('provento-ativo').value = proventoParaEditar.ticker;
        document.getElementById('provento-data-com').value = proventoParaEditar.dataCom;
        document.getElementById('provento-data-pagamento').value = proventoParaEditar.dataPagamento;
        document.getElementById('provento-tipo').value = proventoParaEditar.tipo;

        const valorBruto = proventoParaEditar.valorBrutoIndividual !== undefined 
            ? proventoParaEditar.valorBrutoIndividual 
            : (proventoParaEditar.tipo === 'JCP' ? (proventoParaEditar.valorIndividual / 0.85) : proventoParaEditar.valorIndividual);
        
        const irPercent = proventoParaEditar.percentualIR !== undefined 
            ? proventoParaEditar.percentualIR 
            : (proventoParaEditar.tipo === 'JCP' ? 15 : 0);

        document.getElementById('provento-valor-individual').value = formatarDecimalParaInput(valorBruto);
        document.getElementById('provento-ir').value = irPercent > 0 ? formatarDecimalParaInput(irPercent) : ''; 
        // Tradução
        document.getElementById('provento-valor-individual').previousElementSibling.textContent = 'Gross Value per Unit (£)';

    } else {
        // Tradução
        tituloModal.textContent = 'Record Income';
        document.getElementById('provento-id').value = '';
        document.getElementById('provento-ativo').value = tickerPreenchido.toUpperCase(); 
        document.getElementById('provento-valor-individual').previousElementSibling.textContent = 'Gross Value per Unit (£)';
    }
    
    abrirModal('modal-lancamento-provento');
    
    if (tickerPreenchido) {
        document.getElementById('provento-tipo').focus();
    } else {
        document.getElementById('provento-ativo').focus();
    }
}
function abrirModalDetalhesProventos() {
    const hoje = new Date().toISOString().split('T')[0];
    const proventosProvisionados = todosOsProventos.filter(p => p.dataCom && p.dataPagamento && p.dataCom < hoje && p.dataPagamento > hoje);

    let conteudoHtml = '';

    if (proventosProvisionados.length > 0) {
        const proventosPorCorretora = {};
        proventosProvisionados.forEach(p => {
            for (const corretora in p.posicaoPorCorretora) {
                if (!proventosPorCorretora[corretora]) {
                    proventosPorCorretora[corretora] = [];
                }
                const dadosCorretora = p.posicaoPorCorretora[corretora];
                proventosPorCorretora[corretora].push({
                    ticker: p.ticker, tipo: p.tipo, dataCom: p.dataCom, dataPagamento: p.dataPagamento, valor: dadosCorretora.valorRecebido
                });
            }
        });

        Object.keys(proventosPorCorretora).sort().forEach(corretora => {
            const dados = proventosPorCorretora[corretora];
            const totalCorretora = dados.reduce((soma, item) => soma + item.valor, 0);
            
            conteudoHtml += `
                <h4 style="margin-top: 20px;">${corretora} - Total: ${formatarMoeda(totalCorretora)}</h4>
                <table><thead><tr><th>Asset</th><th>Type</th><th>Ex-Date</th><th>Pay Date</th><th class="numero">Value (£)</th></tr></thead><tbody>
            `;
            dados.sort((a, b) => new Date(a.dataPagamento) - new Date(b.dataPagamento)).forEach(detalhe => {
                const dataComFmt = new Date(detalhe.dataCom + 'T12:00:00').toLocaleDateString('en-GB');
                const dataPagFmt = new Date(detalhe.dataPagamento + 'T12:00:00').toLocaleDateString('en-GB');
                
                let tipoProvFmt = detalhe.tipo;
                if (detalhe.tipo === 'Rendimento') tipoProvFmt = 'Yield';
                if (detalhe.tipo === 'Dividendo') tipoProvFmt = 'Dividend';
                if (detalhe.tipo === 'Bonificação') tipoProvFmt = 'Bonus';
                if (detalhe.tipo === 'Outros') tipoProvFmt = 'Others';

                conteudoHtml += `
                    <tr>
                        <td>${detalhe.ticker}</td>
                        <td>${tipoProvFmt}</td>
                        <td>${dataComFmt}</td>
                        <td>${dataPagFmt}</td>
                        <td class="numero">${formatarMoeda(detalhe.valor)}</td>
                    </tr>
                `;
            });
            conteudoHtml += '</tbody></table>';
        });

    } else {
        conteudoHtml = '<p style="text-align:center;">No provisioned income to receive.</p>';
    }

    document.getElementById('modal-dashboard-detalhes-titulo').textContent = 'Provisioned Income Details';
    document.getElementById('modal-dashboard-detalhes-conteudo').innerHTML = conteudoHtml;
    abrirModal('modal-dashboard-detalhes');
}
function abrirModalResumoDividendos(ticker, precoMedioAtual = 0, precoAtual = 0) {
    const modal = document.getElementById('modal-resumo-dividendos-ativo');
    modal.dataset.ticker = ticker; // Armazena o ticker para ser usado pela ordenação

    const proventosDoAtivo = todosOsProventos.filter(p => p.ticker === ticker);
    const dataInicioInvestimento = getInicioIninterrupto(ticker);
    const dataFim = getFimInvestimento([ticker]);
    
    const resumoPessoal = calcularResumoProventosParaMultiplosAtivos(proventosDoAtivo, [ticker], dataInicioInvestimento, dataFim);
    
    const ativoInfo = todosOsAtivos.find(a => a.ticker === ticker);
    const projecaoAnualMercado = (ativoInfo.tipo === 'Ação') 
        ? calcularProjecaoAnualUnitaria(ticker, { limiteAnos: 5 }) 
        : (getUltimoProvento(ticker) * 12);

    const posicoesAtuais = gerarPosicaoDetalhada();
    const posicao = posicoesAtuais[ticker];
    const dadosMercado = dadosDeMercado.cotacoes[ticker] || {};
    
    const container = document.getElementById('resumo-dividendos-container');
    document.getElementById('modal-resumo-dividendos-titulo').textContent = `${ticker}`;

    const hojeStr = new Date().toISOString().split('T')[0];
    const hojeMeiaNoite = new Date(hojeStr + 'T00:00:00');

    const totalProventosPagos = proventosDoAtivo
        .filter(p => p.dataPagamento && p.dataPagamento <= hojeStr)
        .reduce((acc, p) => acc + p.valorTotalRecebido, 0);
    
    const dataInicioFmt = dataInicioInvestimento 
        ? new Date(dataInicioInvestimento + 'T12:00:00').toLocaleDateString('en-GB') 
        : 'Inception';
    
    const textoProventosPagos = `<strong>Paid Income from ${dataInicioFmt} to Today:</strong>`;

    if (!resumoPessoal && totalProventosPagos === 0) {
        container.innerHTML = '<p>No income or position found for this asset.</p>';
        abrirModal('modal-resumo-dividendos-ativo');
        return;
    }
    
    // --- INÍCIO DA ALTERAÇÃO ---
    // 1. Buscar dados de balanceamento
    const dadosBalanceamento = gerarDadosBalanceamento('todos');
    const tipoCategoria = ativoInfo.tipo === 'Ação' ? 'Ações' : ativoInfo.tipo === 'FII' ? 'FIIs' : 'ETF';
    const dadosDoAtivoNoBalanceamento = dadosBalanceamento.categorias[tipoCategoria]?.ativos.find(a => a.ticker === ticker);

    let alocacaoHtml = '';
    if (dadosDoAtivoNoBalanceamento) {
        const valorIdeal = dadosDoAtivoNoBalanceamento.ideal.valor;
        const valorDeMercado = posicao ? (posicao.quantidade * (dadosMercado.valor || 0)) : 0;
        
        let progressoPercentual = 0;
        if (valorIdeal > 0) {
            progressoPercentual = (valorDeMercado / valorIdeal) * 100;
        } else if (valorDeMercado > 0) {
            progressoPercentual = 100; // Se o ideal é 0, mas tem valor, está 100% (ou mais) "acima"
        }

        // 2. Lógica para o estilo da barra (gradiente ou cor sólida)
        let barStyle = '';
        if (progressoPercentual <= 100) {
            // Abaixo ou no ideal: Barra verde simples
            barStyle = `width: ${progressoPercentual}%; background-color: var(--success-color);`;
        } else {
            // Acima do ideal: Barra 100% cheia com gradiente
            // Calcula a proporção que o "ideal" (100%) ocupa do "total" (progressoPercentual)
            const idealPercentOfTotal = (100 / progressoPercentual) * 100;
            barStyle = `
                width: 100%; 
                background: linear-gradient(to right, 
                    var(--success-color) ${idealPercentOfTotal}%, 
                    var(--danger-color) ${idealPercentOfTotal}%
                );
            `;
        }

        alocacaoHtml = `
            <div class="meta-card-body" style="margin-top: 20px; background-color: #f8f9fa; border-radius: 6px; padding: 15px;">
                <div class="meta-progresso-info" style="margin-bottom: 8px;">
                    <span>Target Allocation Progress: <strong>${progressoPercentual.toFixed(2)}%</strong></span>
                </div>
                <div class="meta-progresso-barra-container" style="height: 12px; background-color: #e9ecef; border-radius: 6px; overflow: hidden;">
                    <div class="meta-progresso-barra" style="${barStyle}"></div>
                </div>
                <div class="meta-valores" style="margin-top: 10px; border-top: none; padding-top: 0;">
                    <div class="meta-valor-item">
                        <label>Current Position</label>
                        <span>${formatarMoeda(valorDeMercado)}</span>
                    </div>
                    <div class="meta-valor-item">
                        <label>Target Position</label>
                        <span>${formatarMoeda(valorIdeal)}</span>
                    </div>
                </div>
            </div>
        `;
    }
    // --- FIM DA ALTERAÇÃO ---
    
    let projectionHtml = '<p>No income projection available (no current position or recent income).</p>';
    if(posicao && posicao.quantidade > 0) {
        const yocAnualPessoal = resumoPessoal ? resumoPessoal.yocCustoAnual : 0;
        const yieldAnualMercado = (dadosMercado.valor > 0) ? projecaoAnualMercado / dadosMercado.valor : 0;

        projectionHtml = `
            <div class="summary-columns-container">
                <div class="summary-column">
                    <h4>My Performance (Personal)</h4>
                    <div class="summary-data-point"><label>Current Avg Price</label><span>${formatarMoeda(precoMedioAtual)}</span></div>
                    <div class="summary-data-point">
                        <label>Annual Projection (Current Pos.)</label>
                        <span>${formatarMoeda(resumoPessoal.projecaoAnualTotal)}</span>
                    </div>
                    <div class="summary-data-point">
                        <label>Monthly Average (Current Pos.)</label>
                        <span>${formatarMoeda(resumoPessoal.mediaMensalTotal)}</span>
                    </div>
                    <div class="summary-data-point">
                        <label>Yield on Cost (Annualized)</label>
                        <span>${formatarPercentual(yocAnualPessoal)}</span>
                    </div>
                </div>
                <div class="summary-column">
                    <h4>Market View (Current)</h4>
                     <div class="summary-data-point"><label>Market Price</label><span>${formatarMoeda(precoAtual)}</span></div>
                     <div class="summary-data-point">
                        <label>Annual Projection (per Unit)</label>
                        <span>${formatarMoeda(projecaoAnualMercado)}</span>
                    </div>
                    <div class="summary-data-point">
                        <label>Monthly Average (per Unit)</label>
                        <span>${formatarMoeda(projecaoAnualMercado / 12)}</span>
                    </div>
                    <div class="summary-data-point">
                        <label>Dividend Yield (Annualized)</label>
                        <span>${formatarPercentual(yieldAnualMercado)}</span>
                    </div>
                </div>
            </div>
        `;
    }
    
    let frequenciaHtml = '';
    if (proventosDoAtivo.length > 0) {
        const frequenciaPorAno = {};
        proventosDoAtivo.forEach(p => {
            if (!p.dataPagamento || !p.dataCom) return;
            const anoPagamento = new Date(p.dataPagamento + 'T12:00:00').getUTCFullYear();
            if (!frequenciaPorAno[anoPagamento]) {
                frequenciaPorAno[anoPagamento] = { com: new Set(), pag: new Set() };
            }
            frequenciaPorAno[anoPagamento].com.add(new Date(p.dataCom + 'T12:00:00').getUTCMonth());
            frequenciaPorAno[anoPagamento].pag.add(new Date(p.dataPagamento + 'T12:00:00').getUTCMonth());
        });

        frequenciaHtml += '<hr style="margin: 20px 0;"><h4 class="frequencia-titulo">Income Frequency</h4>';
        const mesesAbrev = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const anos = Object.keys(frequenciaPorAno).sort((a, b) => b - a);

        anos.forEach(ano => {
            const dadosAno = frequenciaPorAno[ano];
            const mesesCom = [...dadosAno.com].sort((a,b) => a - b).map(m => mesesAbrev[m]).join(', ');
            const mesesPag = [...dadosAno.pag].sort((a,b) => a - b).map(m => mesesAbrev[m]).join(', ');
            frequenciaHtml += `<div class="frequencia-ano-bloco">
                                <strong>${ano}</strong>
                                <div class="frequencia-linha"><span>Ex-Date:</span> ${mesesCom}</div>
                                <div class="frequencia-linha"><span>Pay Date:</span> ${mesesPag}</div>
                           </div>`;
        });
    }

    const historicoMovimentacoes = gerarHistoricoCompletoParaAtivo(ticker);
    let historicoHtml = `
        <hr style="margin: 20px 0;">
        <h4>Transaction History</h4>
    `;

    if (historicoMovimentacoes.length === 0) {
        historicoHtml += '<p>No transactions found for this asset.</p>';
    } else {
        historicoHtml += `
            <div class="tabela-projecao-wrapper" style="max-height: 250px; overflow-y: auto; margin-top: 10px;">
                <table class="dashboard-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Transaction</th>
                            <th class="numero">Unit Price</th>
                            <th class="numero">Consolidated Qty.</th>
                            <th class="numero">Avg Price</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        historicoMovimentacoes.slice().reverse().forEach(item => {
            const dataFormatada = item.data ? new Date(item.data + 'T12:00:00').toLocaleDateString('en-GB') : 'N/A';
            const precoUnitarioFmt = (item.precoUnitario !== null && typeof item.precoUnitario === 'number' && item.precoUnitario > 0) ? formatarMoeda(item.precoUnitario) : '-';
            
            // Tradução do termo de transação, se houver um dicionário aplicável
            let descTransacao = item.descricaoTransacao;
            if(descTransacao.includes('Compra')) descTransacao = descTransacao.replace('Compra', 'Buy');
            if(descTransacao.includes('Venda')) descTransacao = descTransacao.replace('Venda', 'Sell');
            if(descTransacao.includes('Saldo Inicial')) descTransacao = descTransacao.replace('Saldo Inicial', 'Initial Balance');

            historicoHtml += `
                <tr>
                    <td>${dataFormatada}</td>
                    <td>${descTransacao}</td>
                    <td class="numero">${precoUnitarioFmt}</td>
                    <td class="numero">${Math.round(item.qtdConsolidada)}</td>
                    <td class="numero">${formatarPrecoMedio(item.precoMedio)}</td>
                </tr>
            `;
        });
        historicoHtml += `</tbody></table></div>`;
    }

    let proventosTabelaHtml = `
        <hr style="margin: 20px 0;">
        <h4>Income History</h4>
    `;

    if (proventosDoAtivo.length === 0) {
        proventosTabelaHtml += '<p>No income records found for this asset.</p>';
    } else {
        proventosTabelaHtml += `
            <div class="tabela-projecao-wrapper" style="max-height: 250px; overflow-y: auto; margin-top: 10px;">
                <table class="dashboard-table">
                    <thead>
                        <tr>
                            <th class="sortable" data-key="dataCom">Ex-Date</th>
                            <th class="sortable" data-key="dataPagamento">Pay Date</th>
                            <th>Type</th>
                            <th class="numero">Unit Value/YoC</th>
                            <th class="numero">Base Qty.</th>
                            <th class="numero">Net Value Paid</th>
                        </tr>
                    </thead>
                    <tbody>`;
        
        proventosDoAtivo.sort((a, b) => {
            const key = sortConfigModalProventos.key;
            const direction = sortConfigModalProventos.direction === 'ascending' ? 1 : -1;
            const dataA = a[key] || a.dataCom;
            const dataB = b[key] || b.dataCom;
            return (new Date(dataA) - new Date(dataB)) * direction;
        }).forEach(p => {
            const dataComObj = p.dataCom ? new Date(p.dataCom + 'T12:00:00') : null;
            const precoMedioParaCalculo = (dataComObj && dataComObj < hojeMeiaNoite) ? p.precoMedioNaDataCom : precoMedioAtual;
            const yocNoPeriodo = (precoMedioParaCalculo > 0) ? (p.valorIndividual || 0) / precoMedioParaCalculo : 0;
            
            // Tradução do tipo abreviado
            let tipoProv = p.tipo || 'N/A';
            if (tipoProv === 'Rendimento') tipoProv = 'Yield';
            if (tipoProv === 'Dividendo') tipoProv = 'Div';
            if (tipoProv === 'Bonificação') tipoProv = 'Bonus';
            if (tipoProv === 'Outros') tipoProv = 'Other';
            const tipoAbreviado = tipoProv.substring(0, 5);

            const dataComFmt = p.dataCom ? dataComObj.toLocaleDateString('en-GB') : 'Invalid';
            const dataPagFmt = p.dataPagamento ? new Date(p.dataPagamento + 'T12:00:00').toLocaleDateString('en-GB') : 'Invalid';
            const qtdBaseFmt = Math.round(p.quantidadeNaDataCom || 0);
            const valorPagoFmt = formatarMoeda(p.valorTotalRecebido || 0);

            proventosTabelaHtml += `
                <tr>
                    <td>${dataComFmt}</td>
                    <td>${dataPagFmt}</td>
                    <td>${tipoAbreviado}</td>
                    <td class="numero">
                        <span class="valor-principal">${formatarDecimal(p.valorIndividual || 0, 5)}</span>
                        <span class="valor-secundario ${yocNoPeriodo >= 0 ? 'valor-positivo' : 'valor-negativo'}">${formatarPercentual(yocNoPeriodo)}</span>
                    </td>
                    <td class="numero">${qtdBaseFmt}</td>
                    <td class="numero">${valorPagoFmt}</td>
                </tr>
            `;
        });

        proventosTabelaHtml += `</tbody></table></div>`;
    }

    container.innerHTML = `
        <div class="form-grid" style="grid-template-columns: 1fr; gap: 15px;">
             <div style="background-color: #e9ecef; padding: 10px; border-radius: 4px;">
                ${textoProventosPagos}
                <span style="font-size: 1.1em; font-weight: bold;">${formatarMoeda(totalProventosPagos)}</span>
            </div>
        </div>
        
        ${alocacaoHtml}

        <hr style="margin: 20px 0;">
        ${projectionHtml}
        ${historicoHtml} 

        <hr style="margin: 20px 0;">
        <h4>Price vs. Avg Price (Snapshots History)</h4>
        <div class="grafico-barras-container" style="height: 300px; margin-top: 10px;">
            <canvas id="grafico-preco-vs-pm-modal-canvas"></canvas>
        </div>

        ${proventosTabelaHtml}
        <div style="margin-top: 25px;">
            <h4>Annual Evolution of Paid Income</h4>
            <div class="grafico-barras-container" style="height: 300px;">
                <canvas id="grafico-resumo-proventos-anual"></canvas>
            </div>
        </div>
        ${frequenciaHtml} 
    `;
    
    const ctx = document.getElementById('grafico-resumo-proventos-anual')?.getContext('2d');
    if (ctx) {
        const dadosGrafico = { labels: [], valores: [], yields: [] };
        const proventosPorAno = proventosDoAtivo
            .filter(p => p.dataPagamento && p.dataPagamento <= hojeStr)
            .reduce((acc, p) => {
                const ano = new Date(p.dataPagamento + 'T12:00:00').getUTCFullYear();
                if (!acc[ano]) {
                    acc[ano] = [];
                }
                acc[ano].push(p);
                return acc;
            }, {});
        Object.keys(proventosPorAno).sort().forEach(ano => {
            const proventosDoAno = proventosPorAno[ano];
            const valorTotalAno = proventosDoAno.reduce((soma, p) => soma + p.valorTotalRecebido, 0);
            let somaPonderadaCusto = 0;
            let somaPesos = 0;
            proventosDoAno.forEach(p => {
                const custoNaDataCom = p.quantidadeNaDataCom * p.precoMedioNaDataCom;
                if (custoNaDataCom > 0) {
                    somaPonderadaCusto += custoNaDataCom * p.valorTotalRecebido;
                    somaPesos += p.valorTotalRecebido;
                }
            });
            const custoMedioPonderadoAno = somaPesos > 0 ? somaPonderadaCusto / somaPesos : 0;
            const yocAnual = custoMedioPonderadoAno > 0 ? (valorTotalAno / custoMedioPonderadoAno) : 0;
            dadosGrafico.labels.push(ano);
            dadosGrafico.valores.push(valorTotalAno);
            dadosGrafico.yields.push(yocAnual);
        });

        if (resumoProventosChartInstance) {
            resumoProventosChartInstance.destroy();
        }
        resumoProventosChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: dadosGrafico.labels,
                datasets: [{
                    label: 'Total Received (R$)',
                    data: dadosGrafico.valores,
                    backgroundColor: 'rgba(52, 152, 219, 0.7)',
                    borderColor: 'rgba(52, 152, 219, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const valor = context.parsed.y;
                                return `Value: ${formatarMoeda(valor)}`;
                            },
                            afterLabel: function(context) {
                                const index = context.dataIndex;
                                const yoc = dadosGrafico.yields[index];
                                return `YOC in Year: ${formatarPercentual(yoc)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) { return formatarMoeda(value); }
                        }
                    }
                }
            }
        });
        
        setTimeout(() => {
            const btnImprimir = document.getElementById('btn-imprimir-resumo-ativo');
            if (btnImprimir) {
                const novoBtn = btnImprimir.cloneNode(true);
                btnImprimir.parentNode.replaceChild(novoBtn, btnImprimir);
                
                // ATUALIZAÇÃO AQUI: Passa ambas as instâncias de gráfico para a função de impressão
                novoBtn.addEventListener('click', () => {
                    imprimirResumoAtivo(ticker, resumoProventosChartInstance, graficoPrecoVsPmModalInstance);
                });
            }
        }, 200);
    }

    // --- INÍCIO DA NOVA LÓGICA PARA O GRÁFICO DE LINHA ---
    const ctxLinha = document.getElementById('grafico-preco-vs-pm-modal-canvas')?.getContext('2d');
    if (ctxLinha) {
        if (graficoPrecoVsPmModalInstance) {
            graficoPrecoVsPmModalInstance.destroy();
        }

        const dadosHistorico = [];
        historicoCarteira.forEach(snapshot => {
            if (snapshot.detalhesCarteira && snapshot.detalhesCarteira.ativos && snapshot.detalhesCarteira.ativos[ticker]) {
                const dadosAtivo = snapshot.detalhesCarteira.ativos[ticker];
                if (dadosAtivo.quantidade > 0) { // Apenas inclui se havia posição
                    dadosHistorico.push({
                        data: snapshot.data,
                        cotacao: dadosAtivo.precoAtual,
                        precoMedio: dadosAtivo.precoMedio
                    });
                }
            }
        });

        if (dadosHistorico.length > 0) {
            graficoPrecoVsPmModalInstance = new Chart(ctxLinha, {
                type: 'line',
                data: {
                    labels: dadosHistorico.map(d => new Date(d.data + 'T12:00:00').toLocaleDateString('en-GB', {day: '2-digit', month: '2-digit', year: '2-digit'})),
                    datasets: [
                        {
                            label: 'Price (R$)',
                            data: dadosHistorico.map(d => d.cotacao),
                            borderColor: 'rgba(52, 152, 219, 1)',
                            backgroundColor: 'rgba(52, 152, 219, 0.1)',
                            fill: false,
                            tension: 0.1
                        },
                        {
                            label: 'Avg Price (R$)',
                            data: dadosHistorico.map(d => d.precoMedio),
                            borderColor: 'rgba(46, 204, 113, 1)',
                            backgroundColor: 'rgba(46, 204, 113, 0.1)',
                            fill: false,
                            tension: 0.1,
                            borderDash: [5, 5]
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return `${context.dataset.label}: ${formatarMoeda(context.parsed.y)}`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            ticks: {
                                callback: function(value) {
                                    return formatarMoeda(value);
                                }
                            }
                        }
                    }
                }
            });
        } else {
             ctxLinha.font = "14px 'Segoe UI'";
             ctxLinha.fillStyle = "#888";
             ctxLinha.textAlign = "center";
             ctxLinha.fillText("No snapshot data found for this asset.", ctxLinha.canvas.width / 2, ctxLinha.canvas.height / 2);
        }
    }
    // --- FIM DA NOVA LÓGICA PARA O GRÁFICO DE LINHA ---

    const modalTableHeaders = document.querySelectorAll('#modal-resumo-dividendos-ativo .sortable');
    modalTableHeaders.forEach(header => {
        header.classList.remove('ascending', 'descending');
        if (header.dataset.key === sortConfigModalProventos.key) {
            header.classList.add(sortConfigModalProventos.direction);
        }
    });

    abrirModal('modal-resumo-dividendos-ativo');
}
function calcularProventosProvisionados(tipoAtivoFiltro) {
    const hojeStr = new Date().toISOString().split('T')[0];
    const tickersDaCategoria = new Set(todosOsAtivos.filter(a => a.tipo === tipoAtivoFiltro).map(a => a.ticker));

    const proventosFiltrados = todosOsProventos.filter(p => {
        return tickersDaCategoria.has(p.ticker) &&
               p.dataCom && p.dataPagamento &&
               p.dataCom < hojeStr &&
               p.dataPagamento > hojeStr;
    });

    const total = proventosFiltrados.reduce((soma, p) => soma + p.valorTotalRecebido, 0);

    proventosFiltrados.sort((a, b) => new Date(a.dataPagamento) - new Date(b.dataPagamento));
    
    return {
        total: total,
        detalhes: proventosFiltrados
    };
}

async function sincronizarProventoComTransacao(proventoId, corretoraParaLimpar = null) {
    const provento = todosOsProventos.find(p => p.id === proventoId);
    if (!provento || !provento.dataPagamento) return [];

    todasAsMovimentacoes = todasAsMovimentacoes.filter(t => {
        const conta = todasAsContas.find(c => String(c.id) === String(t.idAlvo));
        return !( (t.source === 'provento') && t.sourceId === provento.id && (!corretoraParaLimpar || (conta && conta.banco === corretoraParaLimpar)) )
    });

    let alertas = [];
    for (const corretora in provento.posicaoPorCorretora) {
        const dadosCorretora = provento.posicaoPorCorretora[corretora];
        const contaInvestimento = todasAsContas.find(c => c.banco === corretora && c.tipo === 'Conta Investimento');

        if (contaInvestimento) {
            const transacaoEditadaExiste = todasAsMovimentacoes.some(t =>
                t.source === 'provento_editado' && t.sourceId === provento.id &&
                t.tipoAlvo === 'conta' && String(t.idAlvo) === String(contaInvestimento.id)
            );
            if (transacaoEditadaExiste) continue;

            if (new Date(provento.dataPagamento) >= new Date(contaInvestimento.dataSaldoInicial)) {
                const novaMovimentacao = {
                    id: Date.now() + Math.random(), data: provento.dataPagamento, tipoAlvo: 'conta',
                    idAlvo: contaInvestimento.id, moeda: 'BRL',
                    descricao: `${provento.tipo} de ${provento.ticker} s/${Math.round(dadosCorretora.quantidade)}`,
                    valor: arredondarMoeda(dadosCorretora.valorRecebido), source: 'provento', sourceId: provento.id,
                    enviarParaFinancas: false, // Offline: false
                    idLancamentoCasa: null
                };
                todasAsMovimentacoes.push(novaMovimentacao);
            } else {
                alertas.push(`O pagamento na ${corretora} não foi lançado.`);
            }
        } else {
            alertas.push(`Nenhuma 'Conta Investimento' encontrada para ${corretora}.`);
        }
    }
    return alertas;
}
async function deletarProvento(proventoId) {
    // Tradução
    if (confirm('Are you sure you want to delete this income record?')) {
        const provento = todosOsProventos.find(p => p.id === proventoId);
        if (!provento) return;

        const ativo = todosOsAtivos.find(a => a.ticker === provento.ticker);
        const tipoAtivo = ativo ? ativo.tipo : null;

        todosOsProventos = todosOsProventos.filter(p => p.id !== proventoId);
        // Remove também a movimentação financeira associada
        todasAsMovimentacoes = todasAsMovimentacoes.filter(t => !( (t.source === 'provento' || t.source === 'provento_editado') && t.sourceId === proventoId) );
        
        await salvarProventos();
        await salvarMovimentacoes();

        const modalUnificadoAberto = document.getElementById('modal-proventos-calendario').style.display === 'block' && document.getElementById('seletor-vista-calendario-unificado');

        if (modalUnificadoAberto) {
            const vistaParaRetornar = (tipoAtivo === 'FII') ? 'fiis' : 'acoes';
            abrirModalCalendariosUnificados(vistaParaRetornar);
        } else if (document.getElementById('modal-proventos-calendario-acoes').style.display === 'block') {
            abrirModalCalendarioProventosAcoes();
        } else if (document.getElementById('tela-proventos').style.display === 'block') {
            renderizarTabelaProventos();
        } else if (document.getElementById('modal-resumo-dividendos-ativo').style.display === 'block') {
            // Se o modal de detalhes do ativo estiver aberto, atualize-o
            const ticker = provento.ticker;
            const posicao = gerarPosicaoDetalhada()[ticker] || {};
            const dadosMercado = dadosDeMercado.cotacoes[ticker] || {};
            abrirModalResumoDividendos(ticker, posicao.precoMedio || 0, dadosMercado.valor || 0);
        }
    }
}