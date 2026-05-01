async function renderizarDashboard() {
    if (graficoAlocacaoInstance) { graficoAlocacaoInstance.destroy(); }
    if (graficoProventosInstance) { graficoProventosInstance.destroy(); }
    if (graficoCarteiraInstance) { graficoCarteiraInstance.destroy(); }
    if (graficoDesempenhoInstance) { graficoDesempenhoInstance.destroy(); }

    // --- INÍCIO DA CORREÇÃO ---
    // Declarações movidas para o topo para corrigir ReferenceError
    const hoje = new Date().toISOString().split('T')[0];
    const posicoesRV = gerarPosicaoDetalhada(hoje);
    const dadosBrutos = gerarDadosBalanceamento('todos'); // Linha reintroduzida
    // --- FIM DA CORREÇÃO ---

    // --- REMOVIDO: Bloco de atualização do ícone de alerta (movido para a função global) ---

    // Desativa o banner antigo
    const alertaContainer = document.getElementById('dashboard-alerta-rebalanceamento');
    alertaContainer.style.display = 'none'; // Desativado para dar lugar ao novo ícone

    const syncAlertButton = document.getElementById('btn-sync-needed-alert');
    if (syncAlertButton) {
        const syncNeeded = localStorage.getItem('carteira_sync_needed') === 'true';
        syncAlertButton.style.display = syncNeeded ? 'inline-block' : 'none';
    }
    document.getElementById('data-inicio-carteira').textContent = `(Resultados desde ${getPrimeiraData() || 'o início'})`;

    // As declarações de 'hoje' e 'posicoesRV' foram movidas para o topo
    let saldoTotalContas = 0;
    todasAsContas.forEach(conta => {
        saldoTotalContas += calcularSaldoEmData(conta, hoje);
    });

    let valorTotalMoedas = 0;
    const todosOsEventosCaixa = obterTodosOsEventosDeCaixa();
    todosOsAtivosMoedas.forEach(ativo => {
        const transacoesPassadasEPresentes = todosOsEventosCaixa.filter(e =>
            e.tipo === 'moeda' &&
            String(e.idAlvo) === String(ativo.id) &&
            e.source !== 'recorrente_futura' &&
            e.data <= hoje
        );
        const saldoAtivoAtual = transacoesPassadasEPresentes.reduce((soma, t) => soma + arredondarMoeda(t.valor), ativo.saldoInicial);
        const cotacao = dadosMoedas.cotacoes[ativo.moeda] || 0;
        valorTotalMoedas += saldoAtivoAtual * cotacao;
    });

    const resumoCarteira = {
        'Ações': { custo: 0, mercado: 0, tir: 0, proventos: 0, resultadosRealizados: 0 },
        'FIIs': { custo: 0, mercado: 0, tir: 0, proventos: 0, resultadosRealizados: 0 },
        'ETFs': { custo: 0, mercado: 0, tir: 0, proventos: 0, resultadosRealizados: 0 },
        'Renda Fixa': { custo: 0, mercado: 0, tir: NaN, proventos: 0, resultadosRealizados: 0 }
    };

    const todosOsTickersPorCategoria = { 'Ações': new Set(), 'FIIs': new Set(), 'ETFs': new Set() };
    todosOsAtivos.forEach(ativo => {
        const tipoMapeado = ativo.tipo === 'Ação' ? 'Ações' : ativo.tipo === 'FII' ? 'FIIs' : 'ETFs';
        if (todosOsTickersPorCategoria[tipoMapeado]) {
            todosOsTickersPorCategoria[tipoMapeado].add(ativo.ticker);
        }
    });

    const todosOsTickersHistoricosRV = Array.from(new Set([...todosOsTickersPorCategoria['Ações'], ...todosOsTickersPorCategoria['FIIs'], ...todosOsTickersPorCategoria['ETFs']]));
    const ganhosRealizadosMap = calcularResultadosRealizados(todosOsTickersHistoricosRV);

    for (const ticker in posicoesRV) {
        const ativoInfo = todosOsAtivos.find(a => a.ticker === ticker);
        const tipoAtivo = ativoInfo ? (ativoInfo.tipo === 'Ação' ? 'Ações' : ativoInfo.tipo === 'FII' ? 'FIIs' : 'ETFs') : null;
        if (tipoAtivo && resumoCarteira[tipoAtivo]) {
            const posicao = posicoesRV[ticker];
            if (posicao.quantidade > 0) {
                resumoCarteira[tipoAtivo].custo += posicao.quantidade * posicao.precoMedio;
                const cotacao = dadosDeMercado.cotacoes[ticker];
                resumoCarteira[tipoAtivo].mercado += (cotacao?.valor > 0) ? (posicao.quantidade * cotacao.valor) : (posicao.quantidade * posicao.precoMedio);
            }
        }
    }
    todosOsAtivosRF.forEach(ativo => {
        if ((ativo.descricao || '').toLowerCase().includes('(inativa)')) {
            return;
        }
        const saldosAtivoRF = calcularSaldosRFEmData(ativo, hoje);
        resumoCarteira['Renda Fixa'].custo += saldosAtivoRF.valorInvestido;
        resumoCarteira['Renda Fixa'].mercado += saldosAtivoRF.saldoLiquido;
    });

    for (const categoria in resumoCarteira) {
        const tickersHistoricosDaCategoria = todosOsTickersPorCategoria[categoria] || new Set();
        resumoCarteira[categoria].proventos = todosOsProventos
            .filter(p => tickersHistoricosDaCategoria.has(p.ticker))
            .reduce((soma, p) => soma + p.valorTotalRecebido, 0);
        let realizadosSoma = 0;
        tickersHistoricosDaCategoria.forEach(ticker => {
            realizadosSoma += (ganhosRealizadosMap.get(ticker) || 0);
        });
        resumoCarteira[categoria].resultadosRealizados = realizadosSoma;
        if (categoria !== 'Renda Fixa' && resumoCarteira[categoria].mercado > 0) {
            const tickersAtuaisDaCategoria = Object.keys(posicoesRV).filter(t => {
                const info = todosOsAtivos.find(a => a.ticker === t);
                const tipoMapeado = info ? (info.tipo === 'Ação' ? 'Ações' : info.tipo === 'FII' ? 'FIIs' : 'ETFs') : null;
                return tipoMapeado === categoria;
            });
            if (tickersAtuaisDaCategoria.length > 0) {
                let { fluxos, datas } = construirFluxoDeCaixa(tickersAtuaisDaCategoria, hoje);
                fluxos.push(resumoCarteira[categoria].mercado);
                datas.push(hoje);
                resumoCarteira[categoria].tir = calcularTIR(fluxos, datas);
            }
        }
    }

    const valorTotalCarteira = Object.values(resumoCarteira).reduce((soma, cat) => soma + cat.mercado, 0);
    const totalProventosProvisionados = calcularTotalProventosProvisionados();
    const patrimonioTotal = valorTotalCarteira + saldoTotalContas + valorTotalMoedas + totalProventosProvisionados;
    document.getElementById('db-patrimonio-total').textContent = formatarMoeda(patrimonioTotal);
    document.getElementById('db-carteira-total').textContent = formatarMoeda(valorTotalCarteira);
    document.getElementById('db-contas-total').textContent = formatarMoeda(saldoTotalContas);
    document.getElementById('db-moedas-total').textContent = formatarMoeda(valorTotalMoedas);
    document.getElementById('db-proventos-provisionados-total').textContent = formatarMoeda(totalProventosProvisionados);
    document.getElementById('config-user-name').value = userName;

    const cardPatrimonio = document.getElementById('db-patrimonio-total').closest('.summary-card');
    cardPatrimonio.dataset.tooltip = `Detalhes do Patrimônio:\n` +
                                     `- Investimentos: ${formatarMoeda(valorTotalCarteira)}\n` +
                                     `- Saldo em Contas: ${formatarMoeda(saldoTotalContas)}\n` +
                                     `- Moedas: ${formatarMoeda(valorTotalMoedas)}\n` +
                                     `- Proventos a Receber: ${formatarMoeda(totalProventosProvisionados)}`;
    const cardCarteira = document.getElementById('db-carteira-total').closest('.summary-card');
    cardCarteira.dataset.tooltip = `Composição da Carteira:\n` +
                                   `- Ações: ${formatarMoeda(resumoCarteira['Ações'].mercado)}\n` +
                                   `- FIIs: ${formatarMoeda(resumoCarteira['FIIs'].mercado)}\n` +
                                   `- ETFs: ${formatarMoeda(resumoCarteira['ETFs'].mercado)}\n` +
                                   `- Renda Fixa: ${formatarMoeda(resumoCarteira['Renda Fixa'].mercado)}`;

    const containerTabela = document.getElementById('dashboard-table-container');
    let tabelaHtml = `<table class="dashboard-table">
        <thead><tr>
            <th>Classe de Ativo</th>
            <th class="numero">Valor Mercado / Alocação</th>
            <th class="numero">G/P Capital (Não Realizado)</th>
            <th class="numero">Result. Realizados</th>
            <th class="numero">Proventos</th>
            <th class="numero">Retorno Total</th>
            <th class="percentual">TIR Anualizada</th>
        </tr></thead><tbody>`;

    let custoTotalGeral = 0, mercadoTotalGeral = 0, proventosTotalGeral = 0, realizadosTotalGeral = 0;
    const categoriasOrdenadas = Object.keys(resumoCarteira).sort((a, b) => resumoCarteira[b].mercado - resumoCarteira[a].mercado);

    const categoriasVisiveis = categoriasOrdenadas.filter(cat => {
        const dados = resumoCarteira[cat];
        return dados.mercado > 0.001 || dados.custo > 0.001;
    });

    const tickersVisiveisRV = [];
    categoriasVisiveis.forEach(categoria => {
        const dados = resumoCarteira[categoria];

        custoTotalGeral += dados.custo;
        mercadoTotalGeral += dados.mercado;
        proventosTotalGeral += dados.proventos;
        realizadosTotalGeral += dados.resultadosRealizados;

        const alocacao = valorTotalCarteira > 0 ? (dados.mercado / valorTotalCarteira) : 0;
        const varMercadoValor = dados.mercado - dados.custo;
        const varMercadoPercentual = dados.custo > 0 ? (varMercadoValor / dados.custo) : 0;
        const realizadosValor = dados.resultadosRealizados;
        const realizadosPercentual = dados.custo > 0 ? (realizadosValor / dados.custo) : 0;
        const proventosValor = dados.proventos;
        const proventosPercentual = dados.custo > 0 ? (proventosValor / dados.custo) : 0;
        const retornoTotalValor = varMercadoValor + realizadosValor + proventosValor;
        const retornoTotalPercentual = dados.custo > 0 ? (retornoTotalValor / dados.custo) : 0;
        const tirValida = !isNaN(dados.tir);

        const classeVarMercado = varMercadoValor >= 0 ? 'valor-positivo' : 'valor-negativo';
        const classeRealizados = realizadosValor >= 0 ? 'valor-positivo' : 'valor-negativo';
        const classeRetornoTotal = retornoTotalValor >= 0 ? 'valor-positivo' : 'valor-negativo';

        tabelaHtml += `<tr>
            <td>${categoria}</td>
            <td class="numero">
                <span class="valor-principal">${formatarMoeda(dados.mercado)}</span>
                <span class="valor-secundario">${formatarPercentual(alocacao)}</span>
            </td>
            <td class="numero ${classeVarMercado}">
                <span class="valor-principal">${formatarMoeda(varMercadoValor)}</span>
                <span class="valor-secundario ${classeVarMercado}">${formatarPercentual(varMercadoPercentual)}</span>
            </td>
            <td class="numero ${classeRealizados}">
                ${categoria !== 'Renda Fixa' ? `
                <span class="valor-principal">${formatarMoeda(realizadosValor)}</span>
                <span class="valor-secundario ${classeRealizados}">${formatarPercentual(realizadosPercentual)}</span>
                ` : '<span class="valor-secundario">N/A</span>'}
            </td>
            <td class="numero valor-positivo">
                 <span class="valor-principal">${formatarMoeda(proventosValor)}</span>
                <span class="valor-secundario valor-positivo">${formatarPercentual(proventosPercentual)}</span>
            </td>
            <td class="numero ${classeRetornoTotal}">
                <span class="valor-principal">${formatarMoeda(retornoTotalValor)}</span>
                <span class="valor-secundario ${classeRetornoTotal}">${formatarPercentual(retornoTotalPercentual)}</span>
            </td>
            <td class="percentual ${tirValida ? (dados.tir >= 0 ? 'valor-positivo' : 'valor-negativo') : ''}">${tirValida ? formatarPercentual(dados.tir) : 'N/A'}</td>
        </tr>`;

        if (categoria !== 'Renda Fixa') {
            todosOsAtivos.filter(a => (a.tipo === 'Ação' ? 'Ações' : a.tipo === 'FII' ? 'FIIs' : a.tipo) === categoria)
                         .forEach(a => tickersVisiveisRV.push(a.ticker));
        }
    });

    let { fluxos: fluxosTotais, datas: datasTotais } = construirFluxoDeCaixa([...new Set(tickersVisiveisRV)], hoje);
    const mercadoTotalRV = mercadoTotalGeral - resumoCarteira['Renda Fixa'].mercado;
    if (fluxosTotais.length > 0) {
        fluxosTotais.push(mercadoTotalRV);
        datasTotais.push(hoje);
    }
    const tirTotalRV = calcularTIR(fluxosTotais, datasTotais);

    const varMercadoTotalValor = mercadoTotalGeral - custoTotalGeral;
    const varMercadoTotalPercentual = custoTotalGeral > 0 ? (varMercadoTotalValor / custoTotalGeral) : 0;
    const realizadosTotalPercentual = custoTotalGeral > 0 ? (realizadosTotalGeral / custoTotalGeral) : 0;
    const proventosTotalPercentual = custoTotalGeral > 0 ? (proventosTotalGeral / custoTotalGeral) : 0;
    const retornoTotalGeralValor = varMercadoTotalValor + realizadosTotalGeral + proventosTotalGeral;
    const retornoTotalGeralPercentual = custoTotalGeral > 0 ? (retornoTotalGeralValor / custoTotalGeral) : 0;

    const classeVarMercadoTotal = varMercadoTotalValor >= 0 ? 'valor-positivo' : 'valor-negativo';
    const classeRealizadosTotal = realizadosTotalGeral >= 0 ? 'valor-positivo' : 'valor-negativo';
    const classeRetornoTotalGeral = retornoTotalGeralValor >= 0 ? 'valor-positivo' : 'valor-negativo';
    const tirTotalValida = !isNaN(tirTotalRV);

    tabelaHtml += `</tbody><tfoot>
        <tr style="border-top: 2px solid var(--accent-color); font-weight: bold;">
            <td>TOTAIS</td>
            <td class="numero">
                <span class="valor-principal">${formatarMoeda(mercadoTotalGeral)}</span>
                <span class="valor-secundario">${formatarPercentual(1)}</span>
            </td>
            <td class="numero ${classeVarMercadoTotal}">
                <span class="valor-principal">${formatarMoeda(varMercadoTotalValor)}</span>
                <span class="valor-secundario ${classeVarMercadoTotal}">${formatarPercentual(varMercadoTotalPercentual)}</span>
            </td>
            <td class="numero ${classeRealizadosTotal}">
                <span class="valor-principal">${formatarMoeda(realizadosTotalGeral)}</span>
                <span class="valor-secundario ${classeRealizadosTotal}">${formatarPercentual(realizadosTotalPercentual)}</span>
            </td>
            <td class="numero valor-positivo">
                <span class="valor-principal">${formatarMoeda(proventosTotalGeral)}</span>
                <span class="valor-secundario valor-positivo">${formatarPercentual(proventosTotalPercentual)}</span>
            </td>
            <td class="numero ${classeRetornoTotalGeral}">
                <span class="valor-principal">${formatarMoeda(retornoTotalGeralValor)}</span>
                <span class="valor-secundario ${classeRetornoTotalGeral}">${formatarPercentual(retornoTotalGeralPercentual)}</span>
            </td>
            <td class="percentual ${tirTotalValida ? (tirTotalRV >= 0 ? 'valor-positivo' : 'valor-negativo') : ''}">${tirTotalValida ? formatarPercentual(tirTotalRV) : 'N/A'}</td>
        </tr>
    </tfoot></table>`;

    containerTabela.innerHTML = tabelaHtml;

    setTimeout(() => {
        renderizarGraficoAlocacao(resumoCarteira, categoriasVisiveis);
        const dadosGraficoProventos = gerarDadosGraficoProventos();
        if (graficoProventosInstance) {
            graficoProventosInstance.destroy();
        }
        const ctxProventos = document.getElementById('grafico-proventos-canvas').getContext('2d');
        graficoProventosInstance = new Chart(ctxProventos, { type: 'bar', data: dadosGraficoProventos, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: function(context) { return `${context.dataset.label}: ${formatarMoeda(context.raw)}`; } } } }, scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: function(value) { return formatarMoeda(value); } } } } } });
        renderizarGraficoCarteira();
        renderizarGraficoDesempenho();
        renderizarGraficoAportesProventos();
    }, 100); 

    renderizarPainelAlocacao(dadosBrutos);
    renderizarPainelComparativo(resumoCarteira);
    renderizarPainelResumoMetasDashboard();
    renderizarTickerTape();

    // --- INÍCIO DA ALTERAÇÃO ---
    // Chama a nova função global, passando os dados já calculados para otimização
    atualizarIconeDeAlertasGlobal(posicoesRV, dadosBrutos);
    // --- FIM DA ALTERAÇÃO ---
}
function verificarAlertasDashboard(posicoesRV = null, dadosBalanceamento = null) {
    if (!posicoesRV) posicoesRV = gerarPosicaoDetalhada(new Date().toISOString().split('T')[0]);
    if (!dadosBalanceamento) dadosBalanceamento = gerarDadosBalanceamento('todos');

    if (!dadosAlocacao) {
        const data = localStorage.getItem('carteira_dados_alocacao_offline');
        if (data) dadosAlocacao = JSON.parse(data);
        else dadosAlocacao = { categorias: {}, ativos: {} };
    }
    const modoAtual = dadosAlocacao.modoRebalanceamento || 'categoria';

    const resultado = {
        oportunidades: [],      
        rebalanceamento: [],    
        mercado: []             
    };

    if (!historicoCarteira || historicoCarteira.length < 2) {
        return resultado;
    }

    const snapshotsUteis = [];
    let dataAtualBusca = new Date();
    let diasParaTras = 0;
    while (snapshotsUteis.length < 3 && diasParaTras < 15) { 
        if (isDiaUtil(dataAtualBusca)) {
            const dataStr = dataAtualBusca.toISOString().split('T')[0];
            const snap = getUltimoSnapshotPorData(dataStr);
            if (snap) snapshotsUteis.push(snap);
        }
        dataAtualBusca.setDate(dataAtualBusca.getDate() - 1);
        diasParaTras++;
    }

    const ativosEmAlta3Dias = [];
    const ativosEmBaixa3Dias = [];
    const tickersEmCarteira = new Set(Object.keys(posicoesRV).filter(t => posicoesRV[t]?.quantidade > 0.0001));
    const cotacoesAtuais = dadosDeMercado.cotacoes;

    for (const ticker in cotacoesAtuais) {
        if (!tickersEmCarteira.has(ticker)) continue;
        
        if (snapshotsUteis.length === 3) {
            const [snapRecente, snapIntermediario, snapAntigo] = snapshotsUteis;
            const dadosRecente = snapRecente.detalhesCarteira.ativos[ticker];
            const dadosIntermediario = snapIntermediario.detalhesCarteira.ativos[ticker];
            const dadosAntigo = snapAntigo.detalhesCarteira.ativos[ticker];

            if (dadosRecente && dadosIntermediario && dadosAntigo) {
                const p1 = dadosRecente.precoAtual;
                const p2 = dadosIntermediario.precoAtual;
                const p3 = dadosAntigo.precoAtual;

                if (p1 > 0 && p2 > 0 && p3 > 0) {
                    if (p1 > p2 && p2 > p3) ativosEmAlta3Dias.push(ticker);
                    else if (p1 < p2 && p2 < p3) ativosEmBaixa3Dias.push(ticker);
                }
            }
        }
    }

    if (ativosEmAlta3Dias.length > 0) {
        resultado.mercado.push({
            tipo: 'grupo-alta-3d',
            texto: `<strong>Uptrend (3 sessions):</strong> ${ativosEmAlta3Dias.join(', ')}`
        });
    }
    if (ativosEmBaixa3Dias.length > 0) {
        resultado.mercado.push({
            tipo: 'grupo-baixa-3d',
            texto: `<strong>Downtrend (3 sessions):</strong> ${ativosEmBaixa3Dias.join(', ')}`
        });
    }

    for (const nomeCategoria in dadosBalanceamento.categorias) {
        if (dadosBalanceamento.categorias[nomeCategoria].ativos) {
            dadosBalanceamento.categorias[nomeCategoria].ativos.forEach(ativo => {
                if (Math.abs(ativo.ajuste.percentual) > 0.02) {
                    const direcao = ativo.ajuste.percentual > 0 ? 'underallocated' : 'overallocated';
                    const classeDirecao = direcao === 'underallocated' ? 'valor-positivo' : 'valor-negativo';
                    resultado.rebalanceamento.push({ 
                        tipo: 'desbalanceamento', 
                        texto: `<strong>${ativo.ticker}</strong>: <span class="${classeDirecao}">${direcao}</span> (${formatarPercentual(ativo.atual.percentualGlobal)} vs Target ${formatarPercentual(ativo.ideal.percentualGlobal)})`
                    });
                }
            });
        }
    }

    const dadosVenda = processarRebalanceamento(dadosBalanceamento.categorias, modoAtual);
    
    dadosVenda.listaReduzir.forEach(item => {
        if (item.isActionable && item.ticker !== 'Renda Fixa' && item.ticker !== 'Fixed Income') {
            const ativoOriginal = dadosBalanceamento.categorias['Ações']?.ativos.find(a => a.ticker === item.ticker) || 
                                  dadosBalanceamento.categorias['FIIs']?.ativos.find(a => a.ticker === item.ticker) ||
                                  dadosBalanceamento.categorias['ETF']?.ativos.find(a => a.ticker === item.ticker);
            
            if (ativoOriginal && ativoOriginal.precoMedio > 0) {
                const lucroPercentual = (item.cotacao / ativoOriginal.precoMedio) - 1;
                
                if (lucroPercentual >= 0.10) { 
                    resultado.oportunidades.push({
                        tipo: 'oportunidade-venda',
                        texto: `<strong>${item.ticker}</strong>: Sale Opportunity with <strong>${formatarPercentual(lucroPercentual)}</strong> profit.`
                    });
                }
            }
        }
    });

    return resultado;
}
function abrirModalAlertasDashboard() {
    const hoje = new Date().toISOString().split('T')[0];
    const posicoesRV = gerarPosicaoDetalhada(hoje);
    const dadosBalanceamento = gerarDadosBalanceamento('todos');
    
    const alertas = verificarAlertasDashboard(posicoesRV, dadosBalanceamento);
    
    const modoAtual = dadosAlocacao.modoRebalanceamento || 'categoria';
    const textoModo = modoAtual === 'categoria' ? 'By Category' : 'By Asset';
    
    const container = document.getElementById('modal-dashboard-alertas-conteudo');
    let html = '';

    if (alertas.oportunidades.length > 0) {
        html += `<h4 style="color: var(--success-color);"><i class="fas fa-star"></i> Realization Opportunities (Profit > 10%)</h4>`;
        html += `<p style="font-size: 0.85em; color: #666; margin-bottom: 10px;">Current criterion: <strong>${textoModo}</strong></p>`;
        alertas.oportunidades.forEach(alerta => {
            html += `<div class="alerta-item tipo-oportunidade"><i class="fas fa-dollar-sign"></i> ${alerta.texto}</div>`;
        });
    } else {
         html += '<h4>Realization Opportunities</h4><p style="font-style: italic; color: #888;">No sale opportunity with profit above 10% at the moment.</p>';
    }
    
    html += '<hr style="margin: 15px 0;">';

    html += '<h4><i class="fas fa-chart-line"></i> Market Trends (3 Sessions)</h4>';
    if (alertas.mercado.length > 0) {
        alertas.mercado.forEach(alerta => {
            let icone = alerta.tipo.includes('alta') ? 'fa-arrow-circle-up' : 'fa-arrow-circle-down';
            let cor = alerta.tipo.includes('alta') ? 'var(--success-color)' : 'var(--danger-color)';
            html += `<div class="alerta-item" style="color: ${cor};"><i class="fas ${icone}"></i> ${alerta.texto}</div>`;
        });
    } else {
        html += '<p>No 3-day uptrend or downtrend sequence identified.</p>';
    }

    html += '<hr style="margin: 15px 0;">';

    html += '<h4><i class="fas fa-balance-scale"></i> Rebalancing Attention (> 2%)</h4>';
    if (alertas.rebalanceamento.length > 0) {
        alertas.rebalanceamento.forEach(alerta => {
            html += `<div class="alerta-item"><i class="fas fa-exclamation-circle" style="color: var(--accent-color);"></i> ${alerta.texto}</div>`;
        });
    } else {
        html += '<p>Your portfolio is balanced (no deviation above 2%).</p>';
    }

    html += '<hr style="margin: 15px 0;">';

    html += '<h4>Profits and Losses (Unrealized)</h4>';
    const variacoes = [];
    for (const ticker in posicoesRV) {
        const pos = posicoesRV[ticker];
        if (pos.quantidade > 0.0001) {
            const cotacao = dadosDeMercado.cotacoes[ticker]?.valor || 0;
            if (cotacao > 0 && pos.precoMedio > 0) {
                const variacao = (cotacao / pos.precoMedio) - 1;
                variacoes.push({ ticker, variacao });
            }
        }
    }

    if (variacoes.length > 0) {
        variacoes.sort((a, b) => b.variacao - a.variacao);
        const top3 = variacoes.slice(0, 3);
        const bottom3 = variacoes.slice(-3).reverse();

        html += '<div class="form-grid" style="grid-template-columns: 1fr 1fr; gap: 30px;"><div><h5>Top Profits</h5>';
        top3.forEach(item => {
            html += `<div class="alerta-item tipo-preco-alta"><i class="fas fa-arrow-up"></i><strong>${item.ticker}:</strong> ${formatarPercentual(item.variacao)}</div>`;
        });
        html += '</div><div><h5>Top Losses</h5>';
        bottom3.forEach(item => {
            html += `<div class="alerta-item tipo-preco-baixa"><i class="fas fa-arrow-down"></i><strong>${item.ticker}:</strong> ${formatarPercentual(item.variacao)}</div>`;
        });
        html += '</div></div>';
    } else {
        html += '<p>Not enough variation data.</p>';
    }

    container.innerHTML = html;
    abrirModal('modal-dashboard-alertas');
}
function renderizarPainelComparativo(resumoCarteira) {
    const container = document.getElementById('painel-comparativo-container');
    container.style.display = 'block';

    const gerarTabelaHtml = (dados, titulo, isComparisonColumn = false, dadosYoCDY = null) => {
        if (!dados) return '';
        
        let headerHtml;
        if (isComparisonColumn) {
            headerHtml = `
                <h3>
                    <span>${titulo}</span>
                    <i class="fas fa-file-import card-icone" id="btn-importar-resumo-painel" title="Import Another Backup (.json)"></i>
                </h3>`;
        } else {
            headerHtml = `<h3>${titulo}</h3>`;
        }

        const criarLinha = (label, valorBrl, isTotal = false, yoc = null, dy = null) => {
            const valorUsd = dadosMoedas.cotacoes.USD ? valorBrl / dadosMoedas.cotacoes.USD : 0;
            const valorEur = dadosMoedas.cotacoes.EUR ? valorBrl / dadosMoedas.cotacoes.EUR : 0;
            const valorGbp = dadosMoedas.cotacoes.GBP ? valorBrl / dadosMoedas.cotacoes.GBP : 0;
            const totalClass = isTotal ? 'total' : '';

            let yieldHtml = '';
            const yocFmt = (yoc !== null && yoc > 0) ? `YoC: ${formatarPercentual(yoc)}` : null;
            const dyFmt = (dy !== null && dy > 0) ? `DY: ${formatarPercentual(dy)}` : null;
            
            if (yocFmt || dyFmt) {
                yieldHtml = `<small class="yield-info">${[yocFmt, dyFmt].filter(Boolean).join(' | ')}</small>`;
            }

            return `
                <tr class="item-comparativo ${totalClass}">
                    <td class="label">${label}${yieldHtml}</td>
                    <td class="col-moeda-comparativo">${formatarMoedaEstrangeira(valorGbp, 'GBP')}</td>
                    <td class="col-moeda-comparativo">${formatarMoedaEstrangeira(valorEur, 'EUR')}</td>
                    <td class="col-moeda-comparativo">${formatarMoedaEstrangeira(valorUsd, 'USD')}</td>
                    <td class="valor">${formatarMoeda(valorBrl)}</td>
                </tr>
            `;
        };
        
        return `
            <div class="coluna-comparativa">
                ${headerHtml}
                <table>
                    <thead>
                        <tr>
                            <th>Metric</th>
                            <th class="col-moeda-comparativo">GBP</th>
                            <th class="col-moeda-comparativo">EUR</th>
                            <th class="col-moeda-comparativo">USD</th>
                            <th class="valor">BRL</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${criarLinha("Total Net Worth", dados.patrimonioTotal, true)}
                        ${criarLinha("Invest. Portfolio", dados.carteiraInvestimentos)}
                        ${criarLinha("Account Balance", dados.saldoContas || 0)}
                        ${criarLinha("Foreign Currencies", dados.saldoMoedas || 0)}
                        ${criarLinha("Provisioned Income", dados.proventosProvisionados || 0)}
                        ${criarLinha("Monthly Income (Projected)", dados.proventosMensais.total, true, dadosYoCDY?.total?.yoc, dadosYoCDY?.total?.dy)}
                        ${criarLinha("Income (Shares)", dados.proventosMensais.acoes, false, dadosYoCDY?.acoes?.yoc, dadosYoCDY?.acoes?.dy)}
                        ${criarLinha("Income (REITs)", dados.proventosMensais.fiis, false, dadosYoCDY?.fiis?.yoc, dadosYoCDY?.fiis?.dy)}
                    </tbody>
                </table>
            </div>
        `;
    };

    if (!dadosComparacao) {
        container.innerHTML = `
            <div class="painel-comparativo-header"><h2>Comparative Panel</h2></div>
            <div class="painel-comparativo-grid">
                <div class="coluna-comparativa">
                    <h3>My Portfolio</h3>
                     <p style="padding: 15px; text-align: center; font-style: italic; color: #888;">Your data will appear here.</p>
                </div>
                <div class="coluna-comparativa">
                    <h3>
                        <span>Import Portfolio</span>
                        <i class="fas fa-file-import card-icone" id="btn-importar-resumo-painel" title="Import Backup (.json) for Comparison"></i>
                    </h3>
                    <p style="padding: 15px; text-align: center;">Click the icon to load a backup file.</p>
                </div>
            </div>`;
        return;
    }

    const dadosAtuais = {
        nomeUsuario: userName || "My Portfolio",
        patrimonioTotal: parseDecimal(document.getElementById('db-patrimonio-total').textContent),
        carteiraInvestimentos: parseDecimal(document.getElementById('db-carteira-total').textContent),
        saldoContas: parseDecimal(document.getElementById('db-contas-total').textContent),
        saldoMoedas: parseDecimal(document.getElementById('db-moedas-total').textContent),
        proventosProvisionados: parseDecimal(document.getElementById('db-proventos-provisionados-total').textContent),
        proventosMensais: {
            acoes: calcularProjecaoProventosNegociacao().acoes,
            fiis: calcularProjecaoProventosNegociacao().fiis,
            total: 0
        }
    };
    dadosAtuais.proventosMensais.total = dadosAtuais.proventosMensais.acoes + dadosAtuais.proventosMensais.fiis;
    
    const dadosYoCDY_Atuais = { acoes: {}, fiis: {}, total: {} };
    if (resumoCarteira) {
        const custoAcoes = resumoCarteira['Ações']?.custo || 0;
        const mercadoAcoes = resumoCarteira['Ações']?.mercado || 0;
        const proventosAcoesAnual = dadosAtuais.proventosMensais.acoes * 12;
        dadosYoCDY_Atuais.acoes.yoc = custoAcoes > 0 ? proventosAcoesAnual / custoAcoes : 0;
        dadosYoCDY_Atuais.acoes.dy = mercadoAcoes > 0 ? proventosAcoesAnual / mercadoAcoes : 0;

        const custoFIIs = resumoCarteira['FIIs']?.custo || 0;
        const mercadoFIIs = resumoCarteira['FIIs']?.mercado || 0;
        const proventosFIIsAnual = dadosAtuais.proventosMensais.fiis * 12;
        dadosYoCDY_Atuais.fiis.yoc = custoFIIs > 0 ? proventosFIIsAnual / custoFIIs : 0;
        dadosYoCDY_Atuais.fiis.dy = mercadoFIIs > 0 ? proventosFIIsAnual / mercadoFIIs : 0;

        const custoTotalRV = custoAcoes + custoFIIs;
        const mercadoTotalRV = mercadoAcoes + mercadoFIIs;
        const proventosTotalRVAnual = proventosAcoesAnual + proventosFIIsAnual;
        dadosYoCDY_Atuais.total.yoc = custoTotalRV > 0 ? proventosTotalRVAnual / custoTotalRV : 0;
        dadosYoCDY_Atuais.total.dy = mercadoTotalRV > 0 ? proventosTotalRVAnual / mercadoTotalRV : 0;
    }

    const dadosYoCDY_Comparacao = { acoes: {}, fiis: {}, total: {} };
    if (dadosComparacao.valorCustoPorClasse) {
        const custoAcoesComp = dadosComparacao.valorCustoPorClasse['Ações'] || 0;
        const mercadoAcoesComp = dadosComparacao.valorPorClasse['Ações'] || 0;
        const proventosAcoesAnualComp = dadosComparacao.proventosMensais.acoes * 12;
        dadosYoCDY_Comparacao.acoes.yoc = custoAcoesComp > 0 ? proventosAcoesAnualComp / custoAcoesComp : 0;
        dadosYoCDY_Comparacao.acoes.dy = mercadoAcoesComp > 0 ? proventosAcoesAnualComp / mercadoAcoesComp : 0;

        const custoFIIsComp = dadosComparacao.valorCustoPorClasse['FIIs'] || 0;
        const mercadoFIIsComp = dadosComparacao.valorPorClasse['FIIs'] || 0;
        const proventosFIIsAnualComp = dadosComparacao.proventosMensais.fiis * 12;
        dadosYoCDY_Comparacao.fiis.yoc = custoFIIsComp > 0 ? proventosFIIsAnualComp / custoFIIsComp : 0;
        dadosYoCDY_Comparacao.fiis.dy = mercadoFIIsComp > 0 ? proventosFIIsAnualComp / mercadoFIIsComp : 0;
        
        const custoTotalRVComp = custoAcoesComp + custoFIIsComp;
        const mercadoTotalRVComp = mercadoAcoesComp + mercadoFIIsComp;
        const proventosTotalRVAnualComp = proventosAcoesAnualComp + proventosFIIsAnualComp;
        dadosYoCDY_Comparacao.total.yoc = custoTotalRVComp > 0 ? proventosTotalRVAnualComp / custoTotalRVComp : 0;
        dadosYoCDY_Comparacao.total.dy = mercadoTotalRVComp > 0 ? proventosTotalRVAnualComp / mercadoTotalRVComp : 0;
    }

    const patrimonioSomado = dadosAtuais.patrimonioTotal + dadosComparacao.patrimonioTotal;
    const cotacoes = dadosMoedas.cotacoes;
    const totalGbp = cotacoes.GBP ? patrimonioSomado / cotacoes.GBP : 0;
    const totalEur = cotacoes.EUR ? patrimonioSomado / cotacoes.EUR : 0;
    const totalUsd = cotacoes.USD ? patrimonioSomado / cotacoes.USD : 0;
    
    const dataObj = new Date(dadosComparacao.dataExportacao + 'T12:00:00');
    const dataFormatada = dataObj.toLocaleDateString('en-GB');
    const tituloDadosComparacao = `${dadosComparacao.nomeUsuario} <span class="data-comparacao">(${dataFormatada})</span>`;

    container.innerHTML = `
        <div class="painel-comparativo-header">
            <h2>Comparative Panel</h2>
            <div class="total-somado-container" id="painel-comparativo-total-container">
                <span class="patrimonio-somado-brl">Total: ${formatarMoeda(patrimonioSomado)}</span>
                <div class="patrimonio-somado-moedas">
                    <span>${formatarMoedaEstrangeira(totalGbp, 'GBP')}</span>
                    <span>${formatarMoedaEstrangeira(totalEur, 'EUR')}</span>
                    <span>${formatarMoedaEstrangeira(totalUsd, 'USD')}</span>
                </div>
            </div>
        </div>
        <div class="painel-comparativo-grid" id="painel-comparativo-grid-container">
            ${gerarTabelaHtml(dadosAtuais, dadosAtuais.nomeUsuario, false, dadosYoCDY_Atuais)}
            ${gerarTabelaHtml(dadosComparacao, tituloDadosComparacao, true, dadosYoCDY_Comparacao)}
        </div>
    `;
}
function gerarAlertaDeConcentracaoHtml() {
    const posicoesRV = [];
    const posicoesDetalhadas = gerarPosicaoDetalhada();
    const tiposRV = new Set(['Ação', 'FII', 'ETF']);

    for (const ticker in posicoesDetalhadas) {
        const ativoInfo = todosOsAtivos.find(a => a.ticker === ticker);
        if (ativoInfo && tiposRV.has(ativoInfo.tipo)) {
            const posicao = posicoesDetalhadas[ticker];
            const cotacao = dadosDeMercado.cotacoes[ticker];
            if (posicao.quantidade > 0 && cotacao && cotacao.valor > 0) {
                posicoesRV.push({
                    ticker,
                    valorDeMercado: posicao.quantidade * cotacao.valor
                });
            }
        }
    }

    if (posicoesRV.length < 3) return '';

    const valorTotalRV = posicoesRV.reduce((soma, ativo) => soma + ativo.valorDeMercado, 0);
    if (valorTotalRV === 0) return '';
    
    posicoesRV.sort((a, b) => b.valorDeMercado - a.valorDeMercado);

    // <<< ALTERAÇÃO: Captura a lista de tickers para usar no tooltip >>>
    const tickersTop3 = posicoesRV.slice(0, 3).map(p => p.ticker).join(', ');
    const tickersTop5 = posicoesRV.slice(0, 5).map(p => p.ticker).join(', ');
    const tickersTop10 = posicoesRV.slice(0, 10).map(p => p.ticker).join(', ');
    
    const top3 = posicoesRV.slice(0, 3).reduce((soma, ativo) => soma + ativo.valorDeMercado, 0);
    const top5 = posicoesRV.slice(0, 5).reduce((soma, ativo) => soma + ativo.valorDeMercado, 0);
    const top10 = posicoesRV.slice(0, 10).reduce((soma, ativo) => soma + ativo.valorDeMercado, 0);
    
    const percTop3 = formatarPercentual(top3 / valorTotalRV);
    const percTop5 = formatarPercentual(top5 / valorTotalRV);
    const percTop10 = formatarPercentual(top10 / valorTotalRV);

    // <<< ALTERAÇÃO: Adiciona o atributo 'data-tooltip' aos elementos <strong> >>>
    // Tradução dos textos do alerta de concentração
    return `
        <div class="rebalanceamento-item" style="flex-direction: column; align-items: flex-start; background-color: #fffaf0; border: 1px solid #ffeeba; padding: 10px; border-radius: 6px;">
            <strong style="color: #856404;"><i class="fas fa-exclamation-triangle"></i> Concentration Analysis (Variable Income)</strong>
            <small style="display: block; margin-top: 5px; line-height: 1.5;">
                Your <strong data-tooltip="${tickersTop3}" style="cursor: help; text-decoration: underline dotted;">top 3</strong> assets represent <strong>${percTop3}</strong> of the portfolio.<br>
                Your <strong data-tooltip="${tickersTop5}" style="cursor: help; text-decoration: underline dotted;">top 5</strong> assets represent <strong>${percTop5}</strong> of the portfolio.<br>
                Your <strong data-tooltip="${tickersTop10}" style="cursor: help; text-decoration: underline dotted;">top 10</strong> assets represent <strong>${percTop10}</strong> of the portfolio.
            </small>
        </div>
    `;
}
function renderizarPainelResumoMetasDashboard() {
    const container = document.getElementById('dashboard-metas-summary-container');
    
    // CORREÇÃO: Removemos a chamada para a antiga função carregarMetas()
    // A variável 'todasAsMetas' já é carregada corretamente pela função principal carregarTodosOsDados().

    if (!todasAsMetas || todasAsMetas.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    
    let metasPendentesHtml = [];
    let metasAtingidasHtml = [];
    const projecaoProventos = calcularProjecaoProventosNegociacao();
    const projecaoRF = gerarDadosGraficoAportesProventos()?.datasets[0]?.data.slice(-12).reduce((a, b) => a + b, 0) / 12 || 0;

    todasAsMetas.forEach(meta => {
        let valorAtual = 0, progresso = 0, textoAlvo = '', textoAlcancado = '', previsao = null, historico = [];
        const tipoMeta = meta.tipo;
        const moeda = meta.moedaAlvo || 'BRL';

        if (tipoMeta.startsWith('patrimonio')) {
            const patrimonioBRL = calcularValorTotalInvestimentosAtual();
            valorAtual = moeda === 'BRL' ? patrimonioBRL : (dadosMoedas.cotacoes[moeda] > 0 ? patrimonioBRL / dadosMoedas.cotacoes[moeda] : 0);
            progresso = meta.valorAlvo > 0 ? (valorAtual / meta.valorAlvo) * 100 : (valorAtual > 0 ? 100 : 0);
            textoAlvo = formatarValor(meta.valorAlvo, moeda);
            textoAlcancado = formatarValor(valorAtual, moeda);
            
            historico = historicoCarteira.map(s => ({ data: s.data, valor: s.valorTotalInvestimentos || s.valor }));
            previsao = calcularPrevisaoMeta(historico, valorAtual, meta.valorAlvo);
            
        } else if (tipoMeta.startsWith('renda_passiva')) {
            let proventosBRL = 0;
            const fonte = meta.fonteProventos || 'total_rv';
            switch (fonte) {
                case 'total_rv': proventosBRL = projecaoProventos.acoes + projecaoProventos.fiis; break;
                case 'total_geral': proventosBRL = projecaoProventos.acoes + projecaoProventos.fiis + projecaoRF; break;
                case 'fiis': proventosBRL = projecaoProventos.fiis; break;
                case 'acoes': proventosBRL = projecaoProventos.acoes; break;
            }

            let valorAlvoMonetario;
            if (tipoMeta === 'renda_passiva_sm') {
                valorAlvoMonetario = meta.valorAlvo * salarioMinimo;
                valorAtual = proventosBRL;
                textoAlvo = `${meta.valorAlvo} SM (${formatarMoeda(valorAlvoMonetario)})/mês`;
                textoAlcancado = formatarMoeda(valorAtual);
            } else { // renda_passiva_moeda
                valorAlvoMonetario = meta.valorAlvo;
                valorAtual = moeda === 'BRL' ? proventosBRL : (dadosMoedas.cotacoes[moeda] > 0 ? proventosBRL / dadosMoedas.cotacoes[moeda] : 0);
                textoAlvo = `${formatarValor(meta.valorAlvo, moeda)}/mês`;
                textoAlcancado = formatarValor(valorAtual, moeda);
            }

            progresso = valorAlvoMonetario > 0 ? (valorAtual / valorAlvoMonetario) * 100 : (valorAtual > 0 ? 100 : 0);

            if (fonte === 'fiis') historico = historicoCarteira.map(s => ({ data: s.data, valor: s.detalhesCarteira && s.detalhesCarteira.ativos ? calcularProjecaoProventosNegociacao(s.detalhesCarteira.ativos).fiis : 0 }));
            else if (fonte === 'acoes') historico = historicoCarteira.map(s => ({ data: s.data, valor: s.detalhesCarteira && s.detalhesCarteira.ativos ? calcularProjecaoProventosNegociacao(s.detalhesCarteira.ativos).acoes : 0 }));
            else historico = historicoCarteira.map(s => ({ data: s.data, valor: s.detalhesCarteira && s.detalhesCarteira.ativos ? calcularProjecaoProventosNegociacao(s.detalhesCarteira.ativos).fiis + calcularProjecaoProventosNegociacao(s.detalhesCarteira.ativos).acoes : 0 }));
            
            previsao = calcularPrevisaoMeta(historico, valorAtual, valorAlvoMonetario);

        } else if (tipoMeta === 'posicao_ativo') {
            const posicoes = gerarPosicaoDetalhada();
            valorAtual = posicoes[meta.ativoAlvo]?.quantidade || 0;
            progresso = meta.valorAlvo > 0 ? (valorAtual / meta.valorAlvo) * 100 : (valorAtual > 0 ? 100 : 0);
            textoAlvo = `${meta.valorAlvo} cotas de ${meta.ativoAlvo}`;
            textoAlcancado = `${Math.round(valorAtual)} cotas`;
        }
        
        let isAtingida = progresso >= 100;
        let textoPrevisao = '';
        if (previsao && !isAtingida) {
            textoPrevisao = ` A previsão para o alcance do alvo é <strong>${previsao}</strong>.`;
        } else if (isAtingida) {
            textoPrevisao = ' Parabéns, meta alcançada!';
        }

        const icone = isAtingida ? 'fa-check-circle' : 'fa-bullseye';
        const classeAtingida = isAtingida ? 'meta-atingida' : '';

        const htmlItem = `
            <p class="meta-summary-item ${classeAtingida}">
                <i class="fas ${icone}"></i>
                <span>A meta "<strong>${meta.nome}</strong>" para <strong>${textoAlvo}</strong> já alcançou <strong>${textoAlcancado}</strong>, que equivale a <strong>${progresso.toFixed(1)}%</strong> do alvo.${textoPrevisao}</span>
            </p>
        `;

        if (isAtingida) {
            metasAtingidasHtml.push(htmlItem);
        } else {
            metasPendentesHtml.push(htmlItem);
        }
    });

    let htmlFinal = '<h3>Resumo das Metas</h3>';
    if (metasPendentesHtml.length > 0) {
        htmlFinal += metasPendentesHtml.join('');
    }
    
    if (metasAtingidasHtml.length > 0) {
        htmlFinal += `<hr><h4 style="margin-top: 20px; color: var(--success-color);"><i class="fas fa-check-circle"></i> Metas Concluídas</h4>`;
        htmlFinal += metasAtingidasHtml.join('');
    }

    container.innerHTML = htmlFinal;
}
function renderizarTickerTape() {
    const container = document.getElementById('dashboard-ticker-tape');
    if (!container) return;
    const contentContainer = container.querySelector('.ticker-tape-content');
    contentContainer.innerHTML = '';

    if (historicoCarteira.length < 2) {
        contentContainer.innerHTML = '<div class="ticker-item"><span>Dados insuficientes para calcular a variação diária. Salve pelo menos 2 snapshots.</span></div>';
        return;
    }

    const hoje = new Date().toISOString().split('T')[0];
    let snapshotAtual, snapshotAnterior;

    const ultimoSnapshot = historicoCarteira[historicoCarteira.length - 1];
    if (ultimoSnapshot.data === hoje) {
        snapshotAtual = ultimoSnapshot;
        snapshotAnterior = historicoCarteira[historicoCarteira.length - 2];
    } else {
        snapshotAnterior = ultimoSnapshot;
        const valorTotalInvestimentos = calcularValorTotalInvestimentosAtual();
        const saldoTotalContas = getTodasContasAtivas().reduce((soma, conta) => soma + calcularSaldoEmData(conta, hoje), 0);
        const valorTotalMoedas = todosOsAtivosMoedas.reduce((soma, ativo) => {
            const saldoAtivo = calcularSaldoProjetado(ativo, hoje, 'moeda');
            const cotacao = dadosMoedas.cotacoes[ativo.moeda] || 0;
            return soma + (saldoAtivo * cotacao);
        }, 0);
        const totalProventosProvisionados = calcularTotalProventosProvisionados();
        snapshotAtual = {
            patrimonioTotal: valorTotalInvestimentos + saldoTotalContas + valorTotalMoedas + totalProventosProvisionados,
            detalhesCarteira: { ativos: {} }
        };
        const posicoesAtuais = gerarPosicaoDetalhada(hoje);
        for (const ticker in posicoesAtuais) {
            const posicao = posicoesAtuais[ticker];
            const cotacao = dadosDeMercado.cotacoes[ticker];
            snapshotAtual.detalhesCarteira.ativos[ticker] = {
                precoAtual: cotacao ? cotacao.valor : 0,
                quantidade: posicao.quantidade
            };
        }
    }

    const itensTicker = [];

    itensTicker.push(`<div class="ticker-item"><strong>IBOV:</strong> <span>${formatarDecimal(dadosDeMercado.ibov, 2)}</span></div>`);
    itensTicker.push(`<div class="ticker-item"><strong>IFIX:</strong> <span>${formatarDecimal(dadosDeMercado.ifix, 2)}</span></div>`);
    itensTicker.push(`<div class="ticker-item"><strong>USD:</strong> <span>${formatarMoeda(dadosMoedas.cotacoes.USD)}</span></div>`);
    itensTicker.push(`<div class="ticker-item"><strong>EUR:</strong> <span>${formatarMoeda(dadosMoedas.cotacoes.EUR)}</span></div>`);
    itensTicker.push(`<div class="ticker-item"><strong>GBP:</strong> <span>${formatarMoeda(dadosMoedas.cotacoes.GBP)}</span></div>`);

    const variacaoPatrimonio = snapshotAtual.patrimonioTotal - snapshotAnterior.patrimonioTotal;
    const variacaoPercentual = snapshotAnterior.patrimonioTotal > 0 ? variacaoPatrimonio / snapshotAnterior.patrimonioTotal : 0;
    const classeVariacao = variacaoPatrimonio >= 0 ? 'ticker-positive' : 'ticker-negative';
    const iconeVariacao = variacaoPatrimonio >= 0 ? '<i class="fas fa-arrow-up"></i>' : '<i class="fas fa-arrow-down"></i>';
    itensTicker.push(`<div class="ticker-item"><strong>Variação Dia:</strong> <span class="${classeVariacao}">${iconeVariacao} ${formatarMoeda(variacaoPatrimonio)} (${formatarPercentual(variacaoPercentual)})</span></div>`);

    const variacoesAtivos = [];
    if (snapshotAtual.detalhesCarteira && snapshotAnterior.detalhesCarteira) {
        for (const ticker in snapshotAtual.detalhesCarteira.ativos) {
            const ativoAtual = snapshotAtual.detalhesCarteira.ativos[ticker];
            const ativoAnterior = snapshotAnterior.detalhesCarteira.ativos[ticker];
            if (ativoAtual && ativoAnterior && ativoAnterior.precoAtual > 0) {
                const variacao = (ativoAtual.precoAtual / ativoAnterior.precoAtual) - 1;
                variacoesAtivos.push({ ticker, variacao });
            }
        }
    }

    if (variacoesAtivos.length > 0) {
        variacoesAtivos.sort((a, b) => b.variacao - a.variacao);
        const maiorAlta = variacoesAtivos[0];
        const maiorBaixa = variacoesAtivos[variacoesAtivos.length - 1];
        itensTicker.push(`<div class="ticker-item"><strong>Maior Alta:</strong> <span class="ticker-positive">${maiorAlta.ticker} ${formatarPercentual(maiorAlta.variacao)}</span></div>`);
        itensTicker.push(`<div class="ticker-item"><strong>Maior Baixa:</strong> <span class="ticker-negative">${maiorBaixa.ticker} ${formatarPercentual(maiorBaixa.variacao)}</span></div>`);
    }

    let htmlContent = itensTicker.join('<span class="ticker-separator">◆</span>');
    contentContainer.innerHTML = htmlContent + htmlContent; // Duplica para o efeito de loop
}
function renderizarPainelAlocacao(dadosBalanc) {
    const alocacaoContainer = document.getElementById('dashboard-alocacao-container');
    const alocacaoTotalContainer = document.getElementById('dashboard-alocacao-total');
    let alocacaoHtml = '';
    let somaTotalIdeal = 0;
    for (const nomeCategoria in dadosBalanc.categorias) {
        const categoria = dadosBalanc.categorias[nomeCategoria];
        const valorIdeal = categoria.ideal.percentual || 0;
        somaTotalIdeal += valorIdeal;
        const isRF = nomeCategoria === 'Renda Fixa';
        alocacaoHtml += `<div class="form-group">
            <label for="alocacao-ideal-cat-${nomeCategoria.toLowerCase()}">Ideal ${nomeCategoria} (%)</label>
            <input type="text" 
                   id="alocacao-ideal-cat-${nomeCategoria.toLowerCase()}" 
                   class="alocacao-categoria-input" 
                   data-categoria="${nomeCategoria}" 
                   value="${formatarDecimal(valorIdeal * 100)}" 
                   ${isRF ? '' : 'disabled'}>
        </div>`;
    }
    alocacaoContainer.innerHTML = alocacaoHtml;
    const somaInvalida = somaTotalIdeal < 0.999 || somaTotalIdeal > 1.001;
    alocacaoTotalContainer.innerHTML = `<span>Total Ideal Definido:</span><span class="valor-total-alocacao ${somaInvalida ? 'valor-negativo' : 'valor-positivo'}">${formatarPercentual(somaTotalIdeal)}</span>`;
    const inputRF = document.getElementById('alocacao-ideal-cat-renda fixa');
    if(inputRF) {
        inputRF.addEventListener('change', (e) => {
            const novoValor = parseDecimal(e.target.value) / 100;
            dadosAlocacao.categorias['Renda Fixa'] = isNaN(novoValor) ? 0 : novoValor;
            salvarDadosAlocacao();
            renderizarDashboard();
        });
    }
}
