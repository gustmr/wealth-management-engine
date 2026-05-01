function registrarAlteracao() {
    alteracoesDesdeUltimoBackup++;
    localStorage.setItem('carteira_alteracoes_pendentes', alteracoesDesdeUltimoBackup);
    verificarStatusBackup();
}

function abrirModalInvestimentosDetalhes() {
    const container = document.getElementById('modal-investimentos-detalhes-conteudo');
    container.innerHTML = '<h4><i class="fas fa-spinner fa-spin"></i> Calculating positions...</h4>';

    const agora = new Date();
    const dataFormatada = agora.toLocaleDateString('en-GB');
    const horaFormatada = agora.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const timestampCompleto = `Position on ${dataFormatada} at ${horaFormatada}`;
    document.getElementById('print-timestamp').textContent = timestampCompleto;

    abrirModal('modal-investimentos-detalhes');

    setTimeout(() => {
        const hoje = new Date().toISOString().split('T')[0];
        const posicoesRV = gerarPosicaoDetalhada(hoje);
        const ativosRFAtivos = todosOsAtivosRF.filter(a => !(a.descricao || '').toLowerCase().includes('inactive'));

        const dadosAgrupados = {
            'FIIs': [],
            'Ações': [],
            'ETFs': [],
            'Renda Fixa': []
        };

        for (const ticker in posicoesRV) {
            const posicao = posicoesRV[ticker];
            if (posicao.quantidade > 0.000001) {
                const ativoInfo = todosOsAtivos.find(a => a.ticker === ticker);
                if (ativoInfo && ativoInfo.tipo) {
                    const tipoMapeado = ativoInfo.tipo === 'Ação' ? 'Ações' : ativoInfo.tipo === 'FII' ? 'FIIs' : ativoInfo.tipo;
                    const cotacao = dadosDeMercado.cotacoes[ticker] || {};
                    const precoAtual = cotacao.valor || 0;
                    
                    if (dadosAgrupados[tipoMapeado]) {
                        dadosAgrupados[tipoMapeado].push({
                            ticker: ticker,
                            quantidade: posicao.quantidade,
                            precoAtual: precoAtual,
                            valorDeMercado: posicao.quantidade * precoAtual
                        });
                    }
                }
            }
        }

        ativosRFAtivos.forEach(ativo => {
            const saldo = calcularSaldosRFEmData(ativo, hoje).saldoLiquido;
            if (saldo > 0.01) {
                dadosAgrupados['Renda Fixa'].push({
                    descricao: ativo.descricao,
                    saldoLiquido: saldo
                });
            }
        });

        let htmlModal = '';
        let totalGeral = 0;
        const ordemCategorias = ['FIIs', 'Ações', 'ETFs', 'Renda Fixa'];

        ordemCategorias.forEach(categoria => {
            const ativos = dadosAgrupados[categoria];
            if (ativos.length > 0) {
                let subtotalCategoria = 0;
                let cabecalhoTabela = '';
                let corpoTabela = '';

                if (categoria === 'Renda Fixa') {
                    htmlModal += `<h4>Fixed Income</h4>`;
                    cabecalhoTabela = '<tr><th>Asset</th><th class="numero">Current Net Balance</th></tr>';
                    ativos.sort((a, b) => a.descricao.localeCompare(b.descricao));
                    ativos.forEach(ativo => {
                        corpoTabela += `<tr><td>${ativo.descricao}</td><td class="numero">${formatarMoeda(ativo.saldoLiquido)}</td></tr>`;
                        subtotalCategoria += ativo.saldoLiquido;
                    });
                } else {
                    let tituloCategoria = categoria;
                    if (categoria === 'Ações') tituloCategoria = 'Shares';
                    htmlModal += `<h4>${tituloCategoria}</h4>`;
                    cabecalhoTabela = '<tr><th>Asset</th><th class="numero">Quantity</th><th class="numero">Market Price</th><th class="numero">Total Value</th></tr>';
                    ativos.sort((a, b) => b.valorDeMercado - a.valorDeMercado);
                    ativos.forEach(ativo => {
                        corpoTabela += `<tr>
                            <td>${ativo.ticker}</td>
                            <td class="numero">${Math.round(ativo.quantidade)}</td>
                            <td class="numero">${formatarMoeda(ativo.precoAtual)}</td>
                            <td class="numero">${formatarMoeda(ativo.valorDeMercado)}</td>
                        </tr>`;
                        subtotalCategoria += ativo.valorDeMercado;
                    });
                }

                let tituloSubtotal = categoria;
                if (categoria === 'Renda Fixa') tituloSubtotal = 'Fixed Income';
                if (categoria === 'Ações') tituloSubtotal = 'Shares';

                htmlModal += `<table><thead>${cabecalhoTabela}</thead><tbody>${corpoTabela}</tbody>
                    <tfoot><tr>
                        <td colspan="${categoria === 'Renda Fixa' ? 1 : 3}" style="text-align: right;"><strong>Subtotal ${tituloSubtotal}:</strong></td>
                        <td class="numero"><strong>${formatarMoeda(subtotalCategoria)}</strong></td>
                    </tr></tfoot>
                </table>`;
                totalGeral += subtotalCategoria;
            }
        });

        htmlModal += `<h3 id="modal-investimentos-detalhes-total-geral">Total Amount Invested: ${formatarMoeda(totalGeral)}</h3>`;
        container.innerHTML = htmlModal;

    }, 50);
}

function renderizarTelaPerformanceRV() {
    const container = document.getElementById('container-tabela-performance');
    container.innerHTML = '<h4><i class="fas fa-spinner fa-spin"></i> Calculating performance for all investment cycles...</h4>';

    setTimeout(() => {
        const filtroTipo = document.getElementById('performance-filtro-tipo').value;
        const filtroPeriodo = document.getElementById('performance-filtro-periodo').value;
        const hoje = new Date().toISOString().split('T')[0];
        
        let dadosParaTabela = [];

        // --- PARTE 1: Processar Ciclos Atuais (Abertos) ---
        const posicoesAtuais = gerarPosicaoDetalhada();
        for (const ticker in posicoesAtuais) {
            const posicao = posicoesAtuais[ticker];
            if (posicao.quantidade < 0.000001) continue;

            const ativoInfo = todosOsAtivos.find(a => a.ticker === ticker);
            if (!ativoInfo || (filtroTipo !== 'todos' && ativoInfo.tipo !== filtroTipo)) continue;

            const dataInicioCiclo = getInicioIninterrupto(ticker);
            if (!dataInicioCiclo) continue; // Pula se não encontrar um início claro

            // Filtra os eventos para o ciclo atual
            const proventosDoCiclo = todosOsProventos.filter(p => p.ticker === ticker && p.dataPagamento && p.dataPagamento >= dataInicioCiclo);
            const resultadosRealizadosMap = calcularResultadosRealizados([ticker], new Map([[ticker, dataInicioCiclo]]));

            const dadosMercado = dadosDeMercado.cotacoes[ticker] || {};
            const precoAtual = dadosMercado.valor || 0;
            const custoTotal = posicao.quantidade * posicao.precoMedio;
            const valorDeMercado = posicao.quantidade * precoAtual;
            
            const proventosRecebidos = proventosDoCiclo.reduce((soma, p) => soma + p.valorTotalRecebido, 0);
            const projecaoAnual = (ativoInfo.tipo === 'Ação') ? calcularProjecaoAnualUnitaria(ticker, {limiteAnos: 5}) : (getUltimoProvento(ticker) * 12);
            
            const variacaoNaoRealizada = valorDeMercado - custoTotal;
            const resultadoRealizado = resultadosRealizadosMap.get(ticker) || 0;
            const retornoTotal = variacaoNaoRealizada + resultadoRealizado + proventosRecebidos;
            const variacaoPercentual = custoTotal > 0 ? variacaoNaoRealizada / custoTotal : 0;

            let { fluxos, datas } = construirFluxoDeCaixa([ticker], hoje);
            if (fluxos.length > 0) {
                fluxos.push(valorDeMercado); // Adiciona o valor de mercado como última entrada de caixa
                datas.push(hoje);
            }
            const tir = calcularTIR(fluxos, datas);

            const vp = dadosMercado.vpa || 0;
            const yieldSobreVP = (vp > 0 && projecaoAnual > 0) ? projecaoAnual / vp : 0;

            dadosParaTabela.push({
                ticker: ticker, tipo: ativoInfo.tipo === 'Ação' ? 'Share' : ativoInfo.tipo, status: 'In Portfolio',
                periodo: `${new Date(dataInicioCiclo + 'T12:00:00').toLocaleDateString('en-GB')} - Present`,
                quantidade: posicao.quantidade, precoMedio: posicao.precoMedio, custoTotal: custoTotal, valorDeMercado: valorDeMercado,
                variacaoNaoRealizada, variacaoPercentual, resultadoRealizado, proventosRecebidos, retornoTotal, tir,
                yocProjetado: posicao.precoMedio > 0 ? projecaoAnual / posicao.precoMedio : 0,
                dyProjetado: precoAtual > 0 ? projecaoAnual / precoAtual : 0,
                pl: (ativoInfo.tipo === 'Ação' && dadosMercado.lpa_acao > 0 && precoAtual > 0) ? precoAtual / dadosMercado.lpa_acao : 0,
                pvp: (vp > 0 && precoAtual > 0) ? precoAtual / vp : 0, // P/VP unificado
                yieldSobreVP: yieldSobreVP
            });
        }

        // --- PARTE 2: Processar Ciclos Encerrados (Zerados) ---
        const ciclosEncerrados = gerarRelatorioPosicoesZeradas();
        ciclosEncerrados.forEach(ciclo => {
            const ativoInfo = todosOsAtivos.find(a => a.ticker === ciclo.ticker);
            if (!ativoInfo || (filtroTipo !== 'todos' && ativoInfo.tipo !== filtroTipo)) return;

            let { fluxos, datas } = construirFluxoDeCaixa([ciclo.ticker], ciclo.dataEncerramento);
            
            const fluxosFiltrados = [], datasFiltradas = [];
            for(let i = 0; i < datas.length; i++) {
                if (datas[i] >= ciclo.dataInicio && datas[i] <= ciclo.dataEncerramento) {
                    fluxosFiltrados.push(fluxos[i]);
                    datasFiltradas.push(datas[i]);
                }
            }
            
            if (fluxosFiltrados.length === 0) return;
            
            const custoTotalCiclo = -fluxosFiltrados.filter(v => v < 0).reduce((soma, v) => soma + v, 0);
            const proventosRecebidos = fluxosFiltrados.filter((v, i) => v > 0 && todosOsProventos.some(p => p.dataPagamento === datasFiltradas[i] && p.valorTotalRecebido === v)).reduce((soma, v) => soma + v, 0);
            const valorTotalVendas = fluxosFiltrados.filter(v => v > 0).reduce((soma, v) => soma + v, 0) - proventosRecebidos;
            
            const resultadoRealizado = valorTotalVendas - custoTotalCiclo;
            const retornoTotal = resultadoRealizado + proventosRecebidos;
            const tir = calcularTIR(fluxosFiltrados, datasFiltradas);
            
            dadosParaTabela.push({
                ticker: ciclo.ticker, tipo: ativoInfo.tipo === 'Ação' ? 'Share' : ativoInfo.tipo, status: 'Zeroed',
                periodo: `${new Date(ciclo.dataInicio + 'T12:00:00').toLocaleDateString('en-GB')} - ${new Date(ciclo.dataEncerramento + 'T12:00:00').toLocaleDateString('en-GB')}`,
                quantidade: 0, precoMedio: 0, custoTotal: custoTotalCiclo, valorDeMercado: valorTotalVendas,
                variacaoNaoRealizada: 0, variacaoPercentual: 0, resultadoRealizado, proventosRecebidos, retornoTotal, tir,
                yocProjetado: 0, dyProjetado: 0, pl: 0, pvp: 0,
                yieldSobreVP: 0
            });
        });
        
        if (filtroPeriodo === 'atuais') {
            dadosParaTabela = dadosParaTabela.filter(d => d.status === 'In Portfolio');
        } else if (filtroPeriodo === 'encerrados') {
            dadosParaTabela = dadosParaTabela.filter(d => d.status === 'Zeroed');
        }

        const sortKey = sortConfigPerformanceRV.key;
        const sortDirection = sortConfigPerformanceRV.direction === 'ascending' ? 1 : -1;
        dadosParaTabela.sort((a, b) => {
            let valA = a[sortKey] || 0;
            let valB = b[sortKey] || 0;
            if (typeof valA === 'string') {
                return valA.localeCompare(valB) * sortDirection;
            }
            return (valA - valB) * sortDirection;
        });

        const headers = `
            <tr>
                <th rowspan="2" class="sortable" data-key="ticker">Asset</th>
                <th rowspan="2" class="sortable" data-key="periodo">Period</th>
                <th colspan="4" class="group-header group-1">Portfolio Position</th>
                <th colspan="4" class="group-header group-2">Personal Performance</th>
                <th colspan="5" class="group-header group-3">Market Indicators</th> 
            </tr>
            <tr>
                <th class="numero sortable group-1" data-key="quantidade">Qty</th>
                <th class="numero sortable group-1" data-key="precoMedio">Avg Price</th>
                <th class="numero sortable group-1" data-key="custoTotal">Total Cost</th>
                <th class="numero sortable group-1" data-key="valorDeMercado">Market Value / Final</th>
                <th class="numero sortable group-2" data-key="resultadoRealizado">Var. / Result</th>
                <th class="numero sortable group-2" data-key="proventosRecebidos">Income</th>
                <th class="numero sortable group-2 col-retorno-total" data-key="retornoTotal">Total Return</th>
                <th class="percentual sortable group-2" data-key="tir">Ann. IRR</th>
                <th class="percentual sortable group-3" data-key="yocProjetado">Proj. YoC</th>
                <th class="percentual sortable group-3" data-key="dyProjetado">Proj. DY</th>
                <th class="numero sortable group-3" data-key="pvp">P/BV</th>
                <th class="numero sortable group-3" data-key="pl">P/E</th> 
                <th class="percentual sortable group-3" data-key="yieldSobreVP">Yield on BV</th>
            </tr>`;

        let corpoTabela = '';
        dadosParaTabela.forEach(d => {
            const isEmCarteira = d.status === 'In Portfolio';
            const valorPrincipalVariacao = isEmCarteira ? d.variacaoNaoRealizada : d.resultadoRealizado;
            const percentualVariacao = d.custoTotal > 0 ? valorPrincipalVariacao / d.custoTotal : 0;
            const labelVariacao = isEmCarteira ? 'Variation (Unrealized)' : 'Realized Result';

            const classeRetorno = d.retornoTotal >= 0 ? 'valor-positivo' : 'valor-negativo';
            const classeVariacao = valorPrincipalVariacao >= 0 ? 'valor-positivo' : 'valor-negativo';
            const classeTir = d.tir >= 0 ? 'valor-positivo' : 'valor-negativo';
            
            const pvpFormatado = (d.pvp > 0 && isEmCarteira) ? formatarDecimal(d.pvp) : 'N/A';
            const plFormatado = (d.tipo === 'Share' && d.pl > 0 && isEmCarteira) ? formatarDecimal(d.pl) : 'N/A';

            corpoTabela += `<tr class="row-clickable" data-ticker="${d.ticker}" data-custo-total="${d.custoTotal}" data-proventos="${d.proventosRecebidos}" data-realizado="${d.resultadoRealizado}">
                <td><strong>${d.ticker}</strong><small style="display: block;">${d.tipo} / ${d.status}</small></td>
                <td class="col-posicao-desde">${d.periodo}</td>
                <td class="numero group-1">${isEmCarteira ? Math.round(d.quantidade) : '-'}</td>
                <td class="numero group-1">${isEmCarteira ? formatarPrecoMedio(d.precoMedio) : '-'}</td>
                <td class="numero group-1">${formatarMoeda(d.custoTotal)}</td>
                <td class="numero group-1">${formatarMoeda(d.valorDeMercado)}</td>
                <td class="numero group-2 ${classeVariacao}">
                    <span class="valor-principal" title="${labelVariacao}">${formatarMoeda(valorPrincipalVariacao)}</span>
                    <span class="valor-secundario ${classeVariacao}">${formatarPercentual(percentualVariacao)}</span>
                </td>
                <td class="numero group-2 valor-positivo">${formatarMoeda(d.proventosRecebidos)}</td>
                <td class="numero group-2 col-retorno-total ${classeRetorno}">
                    <span class="valor-principal">${formatarMoeda(d.retornoTotal)}</span>
                </td>
                <td class="percentual group-2 ${classeTir}">${isNaN(d.tir) ? 'N/A' : formatarPercentual(d.tir)}</td>
                <td class="percentual group-3">${isEmCarteira ? formatarPercentual(d.yocProjetado) : '-'}</td>
                <td class="percentual group-3">${isEmCarteira ? formatarPercentual(d.dyProjetado) : '-'}</td>
                <td class="numero group-3">${pvpFormatado}</td>
                <td class="numero group-3">${plFormatado}</td>
                <td class="percentual group-3">${isEmCarteira ? formatarPercentual(d.yieldSobreVP) : '-'}</td>
            </tr>`;
        });
        
        container.innerHTML = `<table id="tabela-performance"><thead>${headers}</thead><tbody>${corpoTabela}</tbody></table>`;
        
        document.querySelectorAll('#tabela-performance .sortable').forEach(header => {
            header.classList.remove('ascending', 'descending');
            if (header.dataset.key === sortConfigPerformanceRV.key) {
                header.classList.add(sortConfigPerformanceRV.direction);
            }
        });

    }, 50);
}
function abrirModalGraficoBreakEven(ticker, custoTotal, proventosRecebidos, resultadoRealizado) {
    if (custoTotal <= 0) {
        alert(`Cannot generate the chart for ${ticker} because the total cost is zero or negative.`);
        return;
    }

    const modal = document.getElementById('modal-performance-ativo-grafico');
    const tituloModal = document.getElementById('modal-performance-ativo-titulo');
    const infoModal = document.getElementById('modal-performance-ativo-info');
    const ctx = document.getElementById('grafico-comparativo-preco').getContext('2d');

    const totalRetornado = proventosRecebidos + resultadoRealizado;
    const valorRestante = Math.max(0, custoTotal - totalRetornado);
    const percentualPago = (totalRetornado / custoTotal);

    const percProventos = (proventosRecebidos / custoTotal) * 100;
    const percRealizado = (resultadoRealizado / custoTotal) * 100;
    const percRestante = (valorRestante / custoTotal) * 100;

    tituloModal.textContent = `Break-Even Point - ${ticker}`;
    infoModal.innerHTML = `Payback progress: <strong class="${percentualPago >= 1 ? 'valor-positivo' : ''}">${formatarPercentual(percentualPago)}</strong>`;

    if (graficoBreakEvenInstance) {
        graficoBreakEvenInstance.destroy();
    }
    
    graficoBreakEvenInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [ticker],
            datasets: [
                {
                    label: 'Received Income',
                    data: [percProventos],
                    backgroundColor: 'rgba(46, 204, 113, 0.7)', // Verde
                    borderColor: 'rgba(46, 204, 113, 1)',
                    borderWidth: 1
                },
                {
                    label: 'Realized Results',
                    data: [percRealizado],
                    backgroundColor: 'rgba(52, 152, 219, 0.7)', // Azul
                    borderColor: 'rgba(52, 152, 219, 1)',
                    borderWidth: 1
                },
                {
                    label: 'Remaining to Payback',
                    data: [percRestante],
                    backgroundColor: 'rgba(149, 165, 166, 0.7)', // Cinza
                    borderColor: 'rgba(149, 165, 166, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `Total Cost: ${formatarMoeda(custoTotal)}`
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.dataset.label || '';
                            const perc = context.raw;
                            const valorAbsoluto = (perc / 100) * custoTotal;
                            return `${label}: ${formatarMoeda(valorAbsoluto)} (${perc.toFixed(1)}%)`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    max: 100, // Força a escala a ir sempre até 100%
                    ticks: {
                        callback: function(value) {
                            return value + '%'; // Adiciona o símbolo de % no eixo
                        }
                    }
                },
                y: {
                    stacked: true
                }
            }
        }
    });

    abrirModal('modal-performance-ativo-grafico');
}


function verificarStatusBackup() {
    const backupButtons = document.querySelectorAll('#btn-dashboard-backup, #btn-backup');
    const footer = document.querySelector('.sidebar-footer');
    let alertElement = document.getElementById('backup-alert-footer');

    if (alteracoesDesdeUltimoBackup >= BACKUP_PROMPT_THRESHOLD) {
        if (!alertElement) {
            alertElement = document.createElement('div');
            alertElement.id = 'backup-alert-footer';
            alertElement.className = 'footer-info backup-alerta-ativo';
            alertElement.innerHTML = '<span><i class="fas fa-exclamation-triangle"></i> Attention: Backup Required</span>';
            if (footer) {
                footer.prepend(alertElement);
            }
        }
    } else {
        if (alertElement) {
            alertElement.remove();
        }
    }

    backupButtons.forEach(btn => {
        btn.innerHTML = `<i class="fas fa-save"></i> Backup Now`;
    });
}
function toggleSelecaoVenda(ticker) {
    // Se não estiver definido, assume que estava 'true' (padrão) e vira 'false'
    if (estadoSelecaoVendas[ticker] === undefined) {
        estadoSelecaoVendas[ticker] = false;
    } else {
        // Inverte o estado atual
        estadoSelecaoVendas[ticker] = !estadoSelecaoVendas[ticker];
    }
    renderizarTelaConsultaBalanceamento();
}
function formatarIntervaloDias(totalDias) {
    if (isNaN(totalDias) || totalDias <= 0) return "-";

    const diasPorMesMedio = 365.25 / 12;
    
    const anos = Math.floor(totalDias / 365.25);
    const diasRestantesAposAnos = totalDias % 365.25;
    const meses = Math.floor(diasRestantesAposAnos / diasPorMesMedio);
    const dias = Math.round(diasRestantesAposAnos % diasPorMesMedio);

    let partes = [];
    if (anos > 0) partes.push(`${anos} ano${anos > 1 ? 's' : ''}`);
    if (meses > 0) partes.push(`${meses} mes${meses > 1 ? 'es' : ''}`);
    // Mostra dias se for a única unidade ou se houver anos/meses. Evita mostrar "0 dias" se for exatamente X meses.
    if (dias > 0 || partes.length === 0) partes.push(`${dias} dia${dias !== 1 ? 's' : ''}`);
    
    return partes.join(', ');
}
function renderizarResultadoCrescimento(resultados, intervaloValor) {
    const container = document.getElementById('container-resultado-crescimento');
    if (!resultados || resultados.length <= 1) {
        container.innerHTML = '<p>Não foi possível encontrar marcos de crescimento suficientes com o intervalo de valor fornecido.</p>';
        container.style.display = 'block';
        return;
    }

    let tableHtml = `
        <h4>Marcos de Crescimento (Intervalo de R$ ${formatarDecimal(intervaloValor)})</h4>
        <table>
            <thead>
                <tr>
                    <th>Data do Marco</th>
                    <th class="numero">Saldo Atingido</th>
                    <th class="numero">Crescimento Realizado</th>
                    <th>Tempo desde o Marco Anterior</th>
                </tr>
            </thead>
            <tbody>
    `;

    for (let i = 0; i < resultados.length; i++) {
        const item = resultados[i];
        const dataFormatada = new Date(item.data + 'T12:00:00').toLocaleDateString('pt-BR');
        tableHtml += `
            <tr>
                <td>${dataFormatada}</td>
                <td class="numero">${formatarMoeda(item.saldo)}</td>
                <td class="numero">${i === 0 ? '-' : formatarMoeda(item.diffValor)}</td>
                <td>${item.tempo}</td>
            </tr>
        `;
    }

    tableHtml += `</tbody></table>`;
    container.innerHTML = tableHtml;
    container.style.display = 'block';
}



function renderizarResultadoCrescimentoPorPeriodo(resultados) {
    const container = document.getElementById('container-resultado-crescimento');
    if (!resultados || resultados.length === 0) {
        container.innerHTML = '<p>Não foi possível encontrar dados de crescimento para o período e filtros selecionados.</p>';
        container.style.display = 'block';
        return;
    }

    let tableHtml = `
        <h4>Performance por Período</h4>
        <table>
            <thead>
                <tr>
                    <th>Período</th>
                    <th class="numero">Saldo Inicial</th>
                    <th class="numero">Saldo Final</th>
                    <th class="numero">Crescimento (R$)</th>
                    <th class="percentual">Crescimento (%)</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    let saldoPeriodoAnterior = resultados[0].saldoInicial;

    resultados.forEach((item, index) => {
        const dataInicioFmt = item.dataInicioPeriodo.toLocaleDateString('pt-BR');
        const dataFimFmt = item.dataFimPeriodo.toLocaleDateString('pt-BR');
        
        let crescimentoValor, crescimentoPercentual, classeResultado, saldoInicialFmt;

        if (index === 0) {
            crescimentoValor = '-';
            crescimentoPercentual = '-';
            classeResultado = '';
            saldoInicialFmt = '-';
        } else {
            const crescimento = item.saldoFinal - saldoPeriodoAnterior;
            classeResultado = crescimento >= 0 ? 'valor-positivo' : 'valor-negativo';
            crescimentoValor = formatarMoeda(crescimento);
            crescimentoPercentual = saldoPeriodoAnterior > 0 ? formatarPercentual(crescimento / saldoPeriodoAnterior) : 'Infinity%';
            saldoInicialFmt = formatarMoeda(saldoPeriodoAnterior);
        }
        
        tableHtml += `
            <tr>
                <td>${dataInicioFmt} - ${dataFimFmt}</td>
                <td class="numero">${saldoInicialFmt}</td>
                <td class="numero">${formatarMoeda(item.saldoFinal)}</td>
                <td class="numero ${classeResultado}">${crescimentoValor}</td>
                <td class="percentual ${classeResultado}">${crescimentoPercentual}</td>
            </tr>
        `;
        
        saldoPeriodoAnterior = item.saldoFinal;
    });

    tableHtml += `</tbody></table>`;
    container.innerHTML = tableHtml;
    container.style.display = 'block';
}
function getCorretorasAtivasParaNotas() {
    const nomesCorretorasAtivas = new Set();
    const contasInvestimentoAtivas = todasAsContas.filter(conta => {
        const notas = (conta.notas || '').toLowerCase();
        const isAtiva = !notas.includes('inativa') && !notas.includes('encerrada');
        // Filtra especificamente por contas de investimento ativas
        return conta.tipo === 'Conta Investimento' && isAtiva;
    });

    contasInvestimentoAtivas.forEach(conta => {
        if (conta.banco) {
            nomesCorretorasAtivas.add(conta.banco.trim());
        }
    });
    return [...nomesCorretorasAtivas].sort();
}
function getTodasCorretoras() {
    const nomesInstituicoes = new Set();
    const contasAtivas = todasAsContas.filter(conta => {
        const notas = (conta.notas || '').toLowerCase();
        return !notas.includes('inativa') && !notas.includes('encerrada');
    });
    contasAtivas.forEach(conta => {
        if (conta.banco) {
            nomesInstituicoes.add(conta.banco.trim());
        }
    });
    todosOsAtivosRF.forEach(ativoRF => {
        if (ativoRF.instituicao) {
            nomesInstituicoes.add(ativoRF.instituicao.trim());
        }
    });
    const posicoesRV = gerarPosicaoDetalhada();
    Object.values(posicoesRV).forEach(posicao => {
        Object.keys(posicao.porCorretora).forEach(corretora => {
            nomesInstituicoes.add(corretora.trim());
        });
    });

    return [...nomesInstituicoes].sort();
}

function getTodasInstituicoesAtivas() {
    const nomesDeBancos = new Set();
    
    // Filtra as contas para considerar qualquer tipo, desde que não esteja inativa/encerrada.
    const contasAtivas = todasAsContas.filter(conta => {
        const notas = (conta.notas || '').toLowerCase();
        return !notas.includes('inativa') && !notas.includes('encerrada');
    });

    contasAtivas.forEach(conta => {
        if (conta.banco) {
            nomesDeBancos.add(conta.banco.trim());
        }
    });

    return [...nomesDeBancos].sort();
}
function getTodasContasAtivas() {
    return todasAsContas.filter(conta => {
        const notas = (conta.notas || '').toLowerCase();
        return !notas.includes('inativa') && !notas.includes('encerrada');
    });
}
function getCorretorasComPosicaoNaData(data) {
    const nomesCorretoras = new Set();
    const posicoesRV = gerarPosicaoDetalhada(data);

    Object.values(posicoesRV).forEach(posicao => {
        for (const corretora in posicao.porCorretora) {
            if (posicao.porCorretora[corretora] > 0.000001) {
                nomesCorretoras.add(corretora.trim());
            }
        }
    });

    return [...nomesCorretoras].sort();
}
function popularFiltrosCorretora() {
    const corretoras = getTodasCorretoras();
    const corretorasHtml = corretoras.map(c => `<option value="${c}">${c}</option>`).join('');
    document.querySelectorAll('.broker-filter').forEach(select => {
        select.innerHTML = '<option value="consolidado">Consolidado</option>' + corretorasHtml;
    });
}
function getPrimeiraData() { const datas = []; todasAsNotas.forEach(n => datas.push(new Date(n.data))); posicaoInicial.forEach(p => { if(p.data) datas.push(new Date(p.data)) }); todosOsAjustes.forEach(a => datas.push(new Date(a.data))); if (datas.length === 0) return null; const dataMaisAntiga = new Date(Math.min.apply(null, datas)); return dataMaisAntiga.toLocaleDateString('pt-BR', {timeZone: 'UTC'}); }

function renderizarInfoBackup() {
    const container = document.getElementById('backup-info');
    if (!container) return;

    const timestamp = timestampUltimoBackup || localStorage.getItem('carteira_ultimo_backup');

    if (timestamp) {
        const data = new Date(timestamp);
        // Formato Inglês Britânico (en-GB)
        const dataFormatada = data.toLocaleDateString('en-GB');
        const horaFormatada = data.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        // Tradução: Último backup
        container.innerHTML = `<span>Last backup: ${dataFormatada} at ${horaFormatada}</span>`;
    } else {
        // Tradução: Nunca
        container.innerHTML = `<span>Last backup: Never</span>`;
    }
}

function abrirModalCorrecaoContasSemMoeda() {
    const container = document.getElementById('lista-contas-sem-moeda-container');
    const contasParaCorrigir = todasAsContas.filter(c => typeof c.moeda === 'undefined');

    if (contasParaCorrigir.length === 0) {
        alert('Nenhuma conta para corrigir!');
        return;
    }

    let tableHtml = `<table class="tabela-correcao-orfaos">
        <thead>
            <tr>
                <th>Conta</th>
                <th>Moeda</th>
                <th>Detalhes (Apenas para BRL)</th>
            </tr>
        </thead>
        <tbody>`;
    
    contasParaCorrigir.forEach(conta => {
        tableHtml += `
            <tr class="conta-correcao-row" data-conta-id="${conta.id}">
                <td><strong>${conta.banco} - ${conta.tipo}</strong></td>
                <td>
                    <select class="conta-correcao-moeda" data-conta-id="${conta.id}">
                        <option value="">Selecione...</option>
                        <option value="BRL">Real (BRL)</option>
                        <option value="USD">Dólar (USD)</option>
                        <option value="EUR">Euro (EUR)</option>
                        <option value="GBP">Libra (GBP)</option>
                    </select>
                </td>
                <td>
                    <div class="detalhes-brl-container" id="detalhes-brl-${conta.id}" style="display: none;">
                        <input type="text" class="conta-correcao-agencia" placeholder="Agência" value="${conta.agencia || ''}">
                        <input type="text" class="conta-correcao-numero" placeholder="Conta" value="${conta.numero || ''}">
                        <input type="text" class="conta-correcao-pix" placeholder="Chave Pix" value="${conta.pix || ''}">
                    </div>
                </td>
            </tr>
        `;
    });
    
    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
    abrirModal('modal-corrigir-contas-sem-moeda');
}



function abrirModalValoresVenda() {
    const container = document.getElementById('lista-vendas-historicas-container');
    
    let tableHtml = `<table>
                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Ativo</th>
                                <th class="numero">Quantidade</th>
                                <th class="venda-input-col numero">Valor Total da Venda (R$)</th>
                            </tr>
                        </thead>
                        <tbody>`;
    
    let hasVendas = false;
    posicaoInicial.forEach((p, index) => {
        if (p.tipoRegistro === 'TRANSACAO_HISTORICA' && p.transacao.toLowerCase() === 'venda' && (p.valorVenda === null || typeof p.valorVenda === 'undefined')) {
            hasVendas = true;
            tableHtml += `<tr>
                            <td>${new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                            <td>${p.ticker}</td>
                            <td class="numero">${p.quantidade}</td>
                            <td class="venda-input-col">
                                <input type="text" class="venda-historica-valor" data-index="${index}" placeholder="Ex: 1.234,56">
                            </td>
                          </tr>`;
        }
    });

    if (!hasVendas) {
        alert("Nenhuma venda histórica para corrigir!");
        return;
    }

    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
    modalInformarValoresVenda.style.display = 'block';
}



function abrirModalCorrecaoData(recordType, recordId) {
    document.getElementById('corrigir-data-record-type').value = recordType;
    document.getElementById('corrigir-data-record-id').value = recordId;
    document.getElementById('form-corrigir-data').reset();
    
    let arrayFonte, nomeDescricao, registro;
    const id = parseFloat(recordId);

    switch(recordType) {
        case 'nota': arrayFonte = todasAsNotas; nomeDescricao = 'Nota de Negociação'; break;
        case 'provento-com':
        case 'provento-pag': arrayFonte = todosOsProventos; nomeDescricao = 'Provento'; break;
        case 'ajuste': arrayFonte = todosOsAjustes; nomeDescricao = 'Ajuste'; break;
        case 'posicao': arrayFonte = posicaoInicial; nomeDescricao = 'Posição Inicial'; break;
        case 'transacao': arrayFonte = todasAsMovimentacoes; nomeDescricao = 'Transação Manual'; break;
        default: return;
    }

    registro = arrayFonte.find(r => r.id === id);
    if(registro) {
        let nomeCampo = recordType.includes('provento') ? (recordType.endsWith('-com') ? 'Data Com' : 'Data Pagamento') : 'Data';
        document.getElementById('modal-corrigir-data-descricao').textContent = `Corrigindo ${nomeCampo} para: ${nomeDescricao} (${registro.ticker || registro.numero || registro.descricao || ''})`;
    }

    modalCorrigirData.style.display = 'block';
    document.getElementById('corrigir-data-input').focus();
}


function abrirModalEventoAtivo(ajusteParaEditar = null) {
    const form = document.getElementById('form-evento-ativo');
    form.reset();
    const tituloModal = document.getElementById('modal-evento-ativo-titulo');
    const idInput = document.getElementById('evento-ativo-id');
    const saveButton = form.querySelector('button[type="submit"]');

    document.getElementById('container-evento-entrada-fields').style.display = 'none';
    document.getElementById('container-evento-saida-fields').style.display = 'none';

    if (ajusteParaEditar) {
        tituloModal.textContent = 'Editar Evento de Ativo';
        idInput.value = ajusteParaEditar.id;
        document.getElementById('evento-ativo-tipo').value = ajusteParaEditar.tipoEvento;
        document.getElementById('evento-ativo-data').value = ajusteParaEditar.data;
        document.getElementById('evento-ativo-ticker').value = ajusteParaEditar.ticker;

        // Mostra o botão imediatamente se estiver editando
        saveButton.style.display = 'block';

        setTimeout(() => {
            document.getElementById('evento-ativo-tipo').dispatchEvent(new Event('change'));
            document.getElementById('evento-ativo-ticker').dispatchEvent(new Event('change'));
            
            if (ajusteParaEditar.tipoEvento === 'entrada') {
                document.getElementById('evento-ativo-pm').value = formatarDecimalParaInput(ajusteParaEditar.precoMedio);
                ajusteParaEditar.detalhes.forEach(detalhe => {
                    const inputQtd = document.querySelector(`#evento-entrada-corretoras-container .evento-entrada-qtd[data-corretora="${detalhe.corretora}"]`);
                    if (inputQtd) inputQtd.value = detalhe.quantidade;
                });
            } else if (ajusteParaEditar.tipoEvento === 'saida') {
                ajusteParaEditar.detalhes.forEach(detalhe => {
                    const inputQtd = document.querySelector(`#evento-saida-posicao-container .qtd-saida-input[data-corretora="${detalhe.corretora}"]`);
                    if (inputQtd) inputQtd.value = detalhe.quantidade;
                });
            }
        }, 150);
        
    } else {
        tituloModal.textContent = 'Registrar Evento de Ativo';
        idInput.value = '';
    }

    modalEventoAtivo.style.display = 'block';
    document.getElementById('evento-ativo-tipo').focus();
}

function renderizarTabelaFeriados() {
    const container = document.getElementById('lista-de-feriados');
    container.innerHTML = `<table><thead><tr><th>Data</th><th>Descrição</th><th class="controles-col">Controles</th></tr></thead><tbody></tbody></table>`;
    const body = container.querySelector('tbody');
    body.innerHTML = '';
    if (todosOsFeriados.length === 0) {
        body.innerHTML = '<tr><td colspan="3" style="text-align:center;">Nenhum feriado cadastrado.</td></tr>';
        return;
    }
    todosOsFeriados.sort((a,b) => new Date(a.data) - new Date(b.data)).forEach(feriado => {
        const tr = document.createElement('tr');
        const dataFormatada = new Date(feriado.data + 'T12:00:00').toLocaleDateString('pt-BR');
        tr.innerHTML = `<td>${dataFormatada}</td><td>${feriado.descricao}</td><td class="controles-col"><i class="fas fa-edit acao-btn edit" title="Editar Feriado" data-feriado-id="${feriado.id}"></i><i class="fas fa-trash acao-btn delete" title="Excluir Feriado" data-feriado-id="${feriado.id}"></i></td>`;
        body.appendChild(tr);
    });
}
function abrirModalFeriado(feriadoParaEditar = null) {
    const form = document.getElementById('form-cadastro-feriado');
    form.reset();
    if (feriadoParaEditar) {
        document.getElementById('modal-feriado-titulo').textContent = 'Editar Feriado';
        document.getElementById('feriado-id').value = feriadoParaEditar.id;
        document.getElementById('feriado-data').value = feriadoParaEditar.data;
        document.getElementById('feriado-descricao').value = feriadoParaEditar.descricao;
    } else {
        document.getElementById('modal-feriado-titulo').textContent = 'Cadastrar Novo Feriado';
        document.getElementById('feriado-id').value = '';
    }
    modalCadastroFeriado.style.display = 'block';
    document.getElementById('feriado-data').focus();
}

function renderizarTabelaContas() { 
    const container = document.getElementById('lista-de-contas-cadastradas'); 
    container.innerHTML = `<table><thead><tr><th>Nome</th><th>Tipo/Moeda</th><th>Agência</th><th>Conta</th><th class="numero">Saldo Inicial</th><th>Data Saldo</th><th class="controles-col">Controles</th></tr></thead><tbody></tbody></table>`; 
    const body = container.querySelector('tbody'); 
    body.innerHTML = ''; 
    
    const todosOsItens = [
        ...todasAsContas.map(c => ({...c, tipoItem: 'conta'})),
        ...todosOsAtivosMoedas.map(a => ({...a, tipoItem: 'moeda'}))
    ];

    if (todosOsItens.length === 0) { 
        body.innerHTML = '<tr><td colspan="7" style="text-align:center;">Nenhuma conta ou ativo em moeda cadastrado.</td></tr>'; 
        return; 
    } 
    
    todosOsItens.sort((a,b) => (a.banco || a.nomeAtivo).localeCompare(b.banco || b.nomeAtivo)).forEach(item => { 
        const tr = document.createElement('tr'); 
        const dataFormatada = new Date(item.dataSaldoInicial + 'T12:00:00').toLocaleDateString('pt-BR');
        
        if(item.tipoItem === 'conta') {
            tr.innerHTML = `<td>${item.banco}</td><td>${item.tipo} (BRL)</td><td>${item.agencia}</td><td>${item.numero}</td><td class="numero">${formatarMoeda(item.saldoInicial)}</td><td>${dataFormatada}</td><td class="controles-col"><i class="fas fa-edit acao-btn edit" title="Editar Conta" data-conta-id="${item.id}"></i></td>`; 
        } else {
            tr.innerHTML = `<td>${item.nomeAtivo}</td><td>Ativo em Moeda (${item.moeda})</td><td>-</td><td>-</td><td class="numero">${formatarMoedaEstrangeira(item.saldoInicial, item.moeda)}</td><td>${dataFormatada}</td><td class="controles-col"><i class="fas fa-edit acao-btn edit" title="Editar Ativo" data-ativo-moeda-id="${item.id}"></i></td>`;
        }
        body.appendChild(tr); 
    }); 
}


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
function abrirModalAtivosPorCNPJ(cnpj) {
    if (!cnpj) return;

    const ativosDoMesmoGrupo = todosOsAtivos.filter(a => a.cnpj === cnpj);
    if (ativosDoMesmoGrupo.length <= 1) return; // Não abre o modal se houver apenas 1 ativo

    const primeiroAtivo = ativosDoMesmoGrupo[0];
    const nomeEmpresa = primeiroAtivo.nome || primeiroAtivo.nomePregao || `CNPJ: ${formatarCNPJ(cnpj)}`;

    document.getElementById('modal-cnpj-titulo').textContent = `Ativos de: ${nomeEmpresa}`;
    
    let listaHtml = '<ul>';
    ativosDoMesmoGrupo.forEach(ativo => {
        listaHtml += `<li>${ativo.ticker}</li>`;
    });
    listaHtml += '</ul>';

    document.getElementById('modal-cnpj-conteudo').innerHTML = listaHtml;
    abrirModal('modal-lista-ativos-cnpj');
}
function renderizarTabelaAtivos() {
    const container = document.getElementById('lista-de-ativos-cadastrados');
    // Tradução dos cabeçalhos
    const tableHeaders = `
        <th class="sortable" data-key="ticker">Asset</th>
        <th class="sortable" data-key="nomePregao">Trading Name</th>
        <th class="sortable" data-key="nome">Name</th>
        <th class="sortable" data-key="tipo">Type</th>
        <th class="sortable" data-key="metaYieldBazin">Yield Goal (Bazin) (%)</th>
        <th class="sortable" data-key="cnpj">Tax ID (CNPJ)</th>
        <th class="controles-col">Actions</th>`;
    container.innerHTML = `<table><thead><tr>${tableHeaders}</tr></thead><tbody id="tabela-ativos-body"></tbody></table>`;
    
    const body = document.getElementById('tabela-ativos-body');
    body.innerHTML = '';
    
    const sortedAtivos = [...todosOsAtivos].sort((a, b) => {
        const key = sortConfigAtivos.key;
        const direction = sortConfigAtivos.direction === 'ascending' ? 1 : -1;
        const valA = a[key] || '';
        const valB = b[key] || '';
        if (typeof valA === 'string' && typeof valB === 'string') {
            return valA.localeCompare(valB) * direction;
        }
        if (valA < valB) return -1 * direction;
        if (valA > valB) return 1 * direction;
        return 0;
    });

    sortedAtivos.forEach(ativo => {
        const tr = document.createElement('tr');
        tr.dataset.id = ativo.id;
        // Tradução do tooltip de aviso
        const warningIcon = !ativo.tipo ? `<i class="fas fa-exclamation-triangle warning-icon" title="Incomplete registration: Asset Type is required"></i>` : '';
        
        const metaYieldBazinFmt = (ativo.tipo === 'Ação' && typeof ativo.metaYieldBazin === 'number') 
            ? formatarDecimal(ativo.metaYieldBazin * 100) 
            : 'N/A';

        if (isAtivosEditMode) {
            const campoYield = (ativo.tipo === 'Ação')
                ? `<input type="text" class="edit-field numero" data-field="metaYieldBazin" value="${metaYieldBazinFmt}">`
                : '<span>N/A</span>';

            tr.innerHTML = `
                <td><input type="text" class="edit-field" data-field="ticker" value="${ativo.ticker || ''}"></td>
                <td><input type="text" class="edit-field" data-field="nomePregao" value="${ativo.nomePregao || ''}"></td>
                <td><input type="text" class="edit-field" data-field="nome" value="${ativo.nome || ''}"></td>
                <td>
                    <select class="edit-field" data-field="tipo">
                        <option value="">Select...</option>
                        <option value="Ação" ${ativo.tipo === 'Ação' ? 'selected' : ''}>Share</option>
                        <option value="FII" ${ativo.tipo === 'FII' ? 'selected' : ''}>REIT</option>
                        <option value="ETF" ${ativo.tipo === 'ETF' ? 'selected' : ''}>ETF</option>
                    </select>
                </td>
                <td>${campoYield}</td>
                <td><input type="text" class="edit-field" data-field="cnpj" value="${formatarCNPJ(ativo.cnpj)}"></td>
                <td></td>`;
        } else {
            // Tradução dos tooltips dos botões
            tr.innerHTML = `
                <td>${ativo.ticker} ${warningIcon}</td>
                <td>${ativo.nomePregao || ''}</td>
                <td>${ativo.nome || ''}</td>
                <td>${ativo.tipo || ''}</td>
                <td class="numero">${metaYieldBazinFmt}</td>
                <td class="cnpj-clicavel" data-cnpj="${ativo.cnpj}">${formatarCNPJ(ativo.cnpj)}</td>
                <td class="controles-col">
                    <i class="fas fa-edit acao-btn edit" title="Edit Asset" data-ativo-id="${ativo.id}"></i>
                    <i class="fas fa-trash acao-btn delete" title="Delete Asset" data-ativo-id="${ativo.id}"></i>
                </td>`;
        }
        body.appendChild(tr);
    });

    document.querySelectorAll('#lista-de-ativos-cadastrados .sortable').forEach(header => {
        header.classList.remove('ascending', 'descending');
        if (header.dataset.key === sortConfigAtivos.key) {
            header.classList.add(sortConfigAtivos.direction);
        }
    });
}
function verificarTickerExistente(event) {
    const tickerInput = event.target;
    const ticker = tickerInput.value.toUpperCase().trim();
    if (!ticker) return;

    const ativoExistente = todosOsAtivos.find(a => a.ticker === ticker);

    if (ativoExistente) {
        // Tradução: Alerta de existência
        alert(`The asset ${ticker} is already registered. Loading data for editing.`);
        
        // Tradução: Título do modal
        document.getElementById('modal-ativo-titulo').textContent = 'Edit Asset';
        document.getElementById('ativo-id').value = ativoExistente.id;
        document.getElementById('ativo-tipo').value = ativoExistente.tipo;
        document.getElementById('ativo-nome-pregao').value = ativoExistente.nomePregao || '';
        document.getElementById('ativo-nome').value = ativoExistente.nome;
        document.getElementById('ativo-cnpj').value = formatarCNPJ(ativoExistente.cnpj);
        document.getElementById('ativo-tipo-acao').value = ativoExistente.tipoAcao || '';
        document.getElementById('ativo-admin-nome').value = ativoExistente.adminNome || '';
        document.getElementById('ativo-admin-cnpj').value = formatarCNPJ(ativoExistente.adminCnpj);

        if (ativoExistente.tipo === 'Ação') {
            document.getElementById('ativo-meta-yield-bazin').value = ativoExistente.metaYieldBazin ? formatarDecimal(ativoExistente.metaYieldBazin * 100) : '6.00';
        }
        
        document.getElementById('ativo-tipo').dispatchEvent(new Event('change'));

    } else {
        const radical = ticker.substring(0, 4);
        const ativoSemelhante = todosOsAtivos.find(a => a.ticker.startsWith(radical));

        if (ativoSemelhante) {
            document.getElementById('ativo-nome-pregao').value = ativoSemelhante.nomePregao || '';
            document.getElementById('ativo-nome').value = ativoSemelhante.nome || '';
            document.getElementById('ativo-cnpj').value = formatarCNPJ(ativoSemelhante.cnpj);
        }
    }
}
function abrirModalCadastroAtivo(ativoParaEditar = null, tickerPreenchido = '') {
    const form = document.getElementById('form-cadastro-ativo');
    form.reset();
    document.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
    const tituloModal = document.getElementById('modal-ativo-titulo');
    const tipoSelect = document.getElementById('ativo-tipo');
    const tickerInput = document.getElementById('ativo-ticker');

    const novoTickerInput = tickerInput.cloneNode(true);
    tickerInput.parentNode.replaceChild(novoTickerInput, tickerInput);
    
    novoTickerInput.addEventListener('blur', verificarTickerExistente);

    if (ativoParaEditar) {
        // Tradução: Título
        tituloModal.textContent = 'Edit Asset';
        document.getElementById('ativo-id').value = ativoParaEditar.id;
        novoTickerInput.value = ativoParaEditar.ticker;
        tipoSelect.value = ativoParaEditar.tipo;
        document.getElementById('ativo-nome-pregao').value = ativoParaEditar.nomePregao || '';
        document.getElementById('ativo-nome').value = ativoParaEditar.nome;
        document.getElementById('ativo-cnpj').value = formatarCNPJ(ativoParaEditar.cnpj);
        document.getElementById('ativo-tipo-acao').value = ativoParaEditar.tipoAcao || '';
        document.getElementById('ativo-admin-nome').value = ativoParaEditar.adminNome || '';
        document.getElementById('ativo-admin-cnpj').value = formatarCNPJ(ativoParaEditar.adminCnpj);
        
        if (ativoParaEditar.tipo === 'Ação') {
            document.getElementById('ativo-meta-yield-bazin').value = ativoParaEditar.metaYieldBazin ? formatarDecimal(ativoParaEditar.metaYieldBazin * 100) : '6.00';
        }
    } else {
        // Tradução: Título
        tituloModal.textContent = 'Register New Asset';
        document.getElementById('ativo-id').value = '';
        novoTickerInput.value = tickerPreenchido.toUpperCase();
        tipoSelect.value = '';
    }

    tipoSelect.dispatchEvent(new Event('change'));
    abrirModal('modal-cadastro-ativo');
    (tickerPreenchido ? document.getElementById('ativo-nome-pregao') : novoTickerInput).focus();
}

function buscarEcadastrarAtivosAusentes(silencioso = false) {
    const tickersCadastrados = new Set(todosOsAtivos.map(a => a.ticker));
    const todosOsTickersUsados = new Set();
    todasAsNotas.forEach(n => n.operacoes.forEach(op => todosOsTickersUsados.add(op.ativo)));
    posicaoInicial.forEach(p => todosOsTickersUsados.add(p.ticker));
    todosOsProventos.forEach(p => todosOsTickersUsados.add(p.ticker));
    todosOsAjustes.forEach(a => {
        if (a.tipoAjuste === 'transferencia') {
            a.ativosTransferidos.forEach(at => todosOsTickersUsados.add(at.ticker));
        } else if (a.ticker) {
            todosOsTickersUsados.add(a.ticker);
        }
    });

    const novosAtivos = [];
    todosOsTickersUsados.forEach(ticker => {
        if (ticker && !tickersCadastrados.has(ticker)) {
            const novoAtivoMinimo = {
                id: Date.now() + Math.random(),
                ticker: ticker,
                tipo: '', 
                nome: '', 
                nomePregao: '', 
                tipoAcao: '', 
                cnpj: '', 
                adminNome: '', 
                adminCnpj: '',
                statusAporte: 'Ativo'
            };
            novosAtivos.push(novoAtivoMinimo);
        }
    });

    if (novosAtivos.length > 0) {
        todosOsAtivos.push(...novosAtivos);
        salvarAtivos();
        if (!silencioso) {
            renderizarTabelaAtivos();
            // Tradução: Mensagem de sucesso
            alert(`${novosAtivos.length} new asset(s) were found and registered successfully! Please complete their registration details if necessary.`);
        }
    } else {
        if (!silencioso) {
            // Tradução: Mensagem de nada encontrado
            alert('No new assets found. All assets used in records are already registered.');
        }
    }
}

function abrirModalEdicaoMovimentacaoRF(transacaoId) {
    const transacaoParaEditar = todasAsMovimentacoes.find(t => t.id === transacaoId);
    
    if (!transacaoParaEditar) {
        alert('Erro: Transação não encontrada.');
        return;
    }
    abrirModalNovaTransacaoMoeda(transacaoParaEditar);
}
function gerarLinhaPosicaoMassaHTML() {
    const corretorasOptions = getTodasCorretoras().map(c => `<option value="${c}">${c}</option>`).join('');

    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="text" class="pos-massa-ticker ticker-input" placeholder="ITSA4"></td>
        <td><input type="date" class="pos-massa-data"></td>
        <td><input type="text" class="pos-massa-pm" placeholder="Ex: 10,123456"></td>
        <td><input type="number" class="pos-massa-qtd" min="1" step="1" placeholder="100"></td>
        <td>
            <select class="pos-massa-corretora">
                <option value="">Selecione...</option>
                ${corretorasOptions}
            </select>
        </td>
        <td><button type="button" class="btn btn-danger btn-sm" onclick="this.closest('tr').remove()" title="Remover Linha"><i class="fas fa-trash"></i></button></td>
    `;
    return tr;
}

function renderizarTelaPosicaoMassa() {
    const tbody = document.getElementById('tabela-posicao-massa-body');
    tbody.innerHTML = '';
    for (let i = 0; i < 20; i++) {
        tbody.appendChild(gerarLinhaPosicaoMassaHTML());
    }
}
function gerarLinhaProventoMassaHTML() {
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="text" class="prov-massa-ticker ticker-input" placeholder="ITSA4"></td>
        <td>
            <select class="prov-massa-tipo">
                <option value="Rendimento">Rendimento</option>
                <option value="Dividendo">Dividendo</option>
                <option value="JCP">JCP</option>
                <option value="Bonificação">Bonificação</option>
                <option value="Outros">Outros</option>
            </select>
        </td>
        <td><input type="date" class="prov-massa-data-com"></td>
        <td><input type="date" class="prov-massa-data-pag"></td>
        <td><input type="text" class="prov-massa-valor-bruto numero" placeholder="Ex: 0,158562"></td>
        <td><input type="text" class="prov-massa-ir numero" placeholder="Digite o percentual aqui"></td>
        <td><button type="button" class="btn btn-danger btn-sm" onclick="this.closest('tr').remove()" title="Remover Linha"><i class="fas fa-trash"></i></button></td>
    `;
    return tr;
}

function renderizarTelaProventosMassa() {
    const tbody = document.getElementById('tabela-proventos-massa-body');
    tbody.innerHTML = '';
    for (let i = 0; i < 20; i++) { // Começa com 20 linhas vazias
        tbody.appendChild(gerarLinhaProventoMassaHTML());
    }
}

function renderizarTabelaPosicaoInicial() {
    const container = document.getElementById('lista-de-posicoes-iniciais');
    container.innerHTML = `<table><thead><tr><th>Tipo</th><th>Data</th><th>Ativo</th><th>Detalhes</th><th class="numero">Preço Médio</th><th class="controles-col">Controles</th></tr></thead><tbody></tbody></table>`;
    const body = container.querySelector('tbody');
    body.innerHTML = '';
    
    posicaoInicial.sort((a, b) => {
        const tickerComparison = (a.ticker || '').localeCompare(b.ticker || '');
        if (tickerComparison !== 0) {
            return tickerComparison;
        }
        return new Date(a.data) - new Date(b.data);
    }).forEach(pos => {
        const tr = document.createElement('tr');
        let detalhes = '';
        let tipoRegistroLabel = '';
        let controlesHtml = `<i class="fas fa-trash acao-btn delete" title="Excluir Registro" data-posicao-id="${pos.id}"></i>`; // Botão de excluir padrão

        switch(pos.tipoRegistro) {
            case 'SUMARIO_MANUAL':
                tipoRegistroLabel = 'Manual';
                detalhes = pos.posicoesPorCorretora.map(pc => `${pc.corretora}: ${pc.quantidade}`).join(', ');
                // Adiciona o botão de editar apenas para este tipo
                controlesHtml = `<i class="fas fa-edit acao-btn edit" title="Editar Registro" data-edit-posicao-id="${pos.id}"></i>` + controlesHtml;
                break;
            case 'TRANSACAO_HISTORICA':
                tipoRegistroLabel = 'Histórico';
                detalhes = `${pos.transacao.charAt(0).toUpperCase() + pos.transacao.slice(1)} ${pos.quantidade} @ ${pos.corretora}`;
                break;
            default:
                tipoRegistroLabel = 'Histórico (Legado)';
                detalhes = `${pos.transacao} ${pos.quantidade} @ ${pos.corretora}`;
                break;
        }
        const dataFormatada = pos.data ? new Date(pos.data + 'T12:00:00').toLocaleDateString('pt-BR') : 'Data Inválida';
        tr.innerHTML = `<td>${tipoRegistroLabel}</td><td>${dataFormatada}</td><td>${pos.ticker}</td><td>${detalhes}</td><td class="numero">${formatarPrecoMedio(pos.precoMedio)}</td><td class="controles-col">${controlesHtml}</td>`;
        body.appendChild(tr);
    });
}
function adicionarLinhaCorretora(corretora = '', quantidade = '') { const container = document.getElementById('posicoes-corretoras-container'); const div = document.createElement('div'); div.className = 'corretora-row'; div.innerHTML = `<div class="form-group"><label>Corretora</label><input type="text" class="posicao-corretora" value="${corretora}" required></div><div class="form-group"><label>Quantidade</label><input type="number" step="1" class="posicao-quantidade" value="${quantidade}" required></div><button type="button" class="btn btn-danger" onclick="this.parentElement.remove()"><i class="fas fa-trash"></i></button>`; container.appendChild(div); }

function iniciarAdicaoHistorico() {
    containerListaPosicoes.style.display = 'none';
    containerAdicionarHistorico.style.display = 'block';
    containerTabelaHistorico.style.display = 'none';
    document.getElementById('form-buscar-ativo-historico').reset();
    document.getElementById('tabela-historico-body').innerHTML = '';
    
    const corretoras = getTodasCorretoras();
    dropdownCorretorasCache = `<option value="">Selecione</option>` + corretoras.map(c => `<option value="${c}">${c}</option>`).join('');
}

function cancelarAdicaoHistorico() {
    containerListaPosicoes.style.display = 'block';
    containerAdicionarHistorico.style.display = 'none';
    mostrarTela('posicaoInicial');
}

function adicionarLinhaHistorico(tbody, data = '', transacao = '', quantidade = '', corretora = '', precoMedio = '') {
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="date" class="hist-data" value="${data}" required></td>
        <td>
            <select class="hist-transacao" required>
                <option value="">Selecione</option>
                <option value="Compra" ${transacao.toLowerCase() === 'compra' ? 'selected' : ''}>Compra</option>
                <option value="Venda" ${transacao.toLowerCase() === 'venda' ? 'selected' : ''}>Venda</option>
            </select>
        </td>
        <td><input type="number" step="1" min="1" class="hist-qtd numero" value="${quantidade}" required></td>
        <td>
            <select class="hist-corretora" required>
                ${dropdownCorretorasCache}
            </select>
        </td>
        <td><input type="text" class="hist-pm numero" value="${precoMedio}" required></td>
        <td class="controles-col">
            <i class="fas fa-trash acao-btn delete" title="Excluir Linha" onclick="this.closest('tr').remove()"></i>
        </td>
    `;
    tbody.appendChild(tr);
    if(corretora) {
        tr.querySelector('.hist-corretora').value = corretora;
    }
}

function buscarAtivoParaHistorico(event) {
    event.preventDefault();
    const tickerInput = document.getElementById('historico-ativo-ticker');
    const ticker = tickerInput.value.toUpperCase();
    if (!ticker) return;

    if (!todosOsAtivos.some(a => a.ticker === ticker)) {
        alert(`O ativo "${ticker}" não está cadastrado. Por favor, cadastre-o primeiro.`);
        abrirModalCadastroAtivo(null, ticker);
        return;
    }

    document.getElementById('historico-ativo-selecionado').textContent = ticker;
    containerTabelaHistorico.style.display = 'block';
    const tbody = document.getElementById('tabela-historico-body');
    tbody.innerHTML = '';
    adicionarLinhaHistorico(tbody);
}



function renderizarTelaImportacaoHistorico(dadosAgrupados) {
    mostrarTela('importacaoHistorico');
    const container = document.getElementById('container-revisao-historico');
    container.innerHTML = '';
    const corretoras = getTodasCorretoras();
    dropdownCorretorasCache = `<option value="">Selecione</option>` + corretoras.map(c => `<option value="${c}">${c}</option>`).join('');

    for (const ticker in dadosAgrupados) {
        const ativoDiv = document.createElement('div');
        ativoDiv.className = 'import-review-container';
        if (dadosAgrupados[ticker].isNew) {
            ativoDiv.classList.add('new-asset');
        }
        ativoDiv.dataset.ticker = ticker;
        
        let tableRows = '';
        dadosAgrupados[ticker].registros.forEach(reg => {
            const dataNormalizada = normalizarDataParaInput(reg.data);
            tableRows += `
                <tr>
                    <td><input type="date" class="hist-data" value="${dataNormalizada}" required></td>
                    <td>
                        <select class="hist-transacao" required>
                            <option value="">Selecione</option>
                            <option value="Compra" ${reg.transacao.toLowerCase() === 'compra' ? 'selected' : ''}>Compra</option>
                            <option value="Venda" ${reg.transacao.toLowerCase() === 'venda' ? 'selected' : ''}>Venda</option>
                        </select>
                    </td>
                    <td><input type="number" step="1" min="1" class="hist-qtd numero" value="${reg.quantidade}" required></td>
                    <td>
                        <select class="hist-corretora" required>
                            ${dropdownCorretorasCache}
                        </select>
                    </td>
                    <td><input type="text" class="hist-pm numero" value="${reg.precoMedio}" required></td>
                    <td><input type="text" class="hist-valor-total numero" value="${reg.valorTotal || ''}" placeholder="Obrigatório p/ Venda"></td>
                    <td class="controles-col">
                        <i class="fas fa-trash acao-btn delete" title="Excluir Linha" onclick="this.closest('tr').remove()"></i>
                    </td>
                </tr>
            `;
        });
        
        // --- ALTERAÇÃO: Adiciona o cabeçalho para a nova coluna ---
        ativoDiv.innerHTML = `
            <h3>Histórico para ${ticker}</h3>
            <table>
                <thead>
                    <tr>
                        <th>Data</th><th>Transação</th><th class="numero">Quantidade</th>
                        <th>Corretora</th><th class="numero">Preço Médio Resultante</th>
                        <th class="numero">Valor Total (R$)</th>
                        <th class="controles-col">Ações</th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
            </table>
        `;
        container.appendChild(ativoDiv);
        
        const rows = ativoDiv.querySelectorAll('tbody tr');
        rows.forEach((row, index) => {
            const corretora = dadosAgrupados[ticker].registros[index].corretora;
            if (corretora) {
                row.querySelector('.hist-corretora').value = corretora;
            }
        });
    }
}


function getProventosTransferiveis(corretoraOrigem, dataTransferencia) {
    if (!corretoraOrigem || !dataTransferencia) {
        return [];
    }

    return todosOsProventos.filter(p => {
        const temPosicaoNaOrigem = p.posicaoPorCorretora && p.posicaoPorCorretora[corretoraOrigem] && p.posicaoPorCorretora[corretoraOrigem].valorRecebido > 0;
        
        return temPosicaoNaOrigem &&
               p.dataCom && p.dataCom <= dataTransferencia &&
               p.dataPagamento && p.dataPagamento > dataTransferencia;
    });
}
function renderizarTabelaTransferencias() {
    const container = document.getElementById('lista-de-transferencias');
    const transferencias = todosOsAjustes.filter(a => a.tipoAjuste === 'transferencia');
    
    if (transferencias.length === 0) {
        container.innerHTML = '<p>Nenhum histórico de transferências encontrado.</p>';
        return;
    }

    let tableHtml = `<table><thead><tr><th>Data</th><th>Origem</th><th>Destino</th><th>Itens Transferidos</th><th class="controles-col">Controles</th></tr></thead><tbody>`;
    transferencias.sort((a,b) => new Date(b.data) - new Date(a.data)).forEach(transf => {
        const dataFormatada = new Date(transf.data + 'T12:00:00').toLocaleDateString('pt-BR');
        
        let detalhesHtml = '<div class="detalhes-transferencia-historico">';
        if (transf.ativosTransferidos && transf.ativosTransferidos.length > 0) {
            detalhesHtml += '<strong>Ativos:</strong><br>' + transf.ativosTransferidos.map(at => `${at.ticker}: ${at.quantidade} un.`).join('<br>');
        }
        if (transf.proventosTransferidos && transf.proventosTransferidos.length > 0) {
            if (transf.ativosTransferidos && transf.ativosTransferidos.length > 0) detalhesHtml += '<br><br>';
            const proventosInfo = transf.proventosTransferidos.map(id => {
                const p = todosOsProventos.find(prov => prov.id === id);
                return p ? `${p.ticker} - ${p.tipo}` : `Provento ID ${id} (não encontrado)`;
            }).join('<br>');
            detalhesHtml += `<strong>Proventos (${transf.proventosTransferidos.length}):</strong><br>${proventosInfo}`;
        }
        detalhesHtml += '</div>';

        tableHtml += `
            <tr>
                <td>${dataFormatada}</td>
                <td>${transf.corretoraOrigem}</td>
                <td>${transf.corretoraDestino}</td>
                <td>${detalhesHtml}</td>
                <td class="controles-col">
                    <i class="fas fa-edit acao-btn edit" title="Editar Transferência" data-transferencia-id="${transf.id}"></i>
                    <i class="fas fa-trash acao-btn delete" title="Excluir Transferência" data-transferencia-id="${transf.id}"></i>
                </td>
            </tr>
        `;
    });
    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
}

function popularAtivosParaTransferencia(corretoraOrigem, dataTransferencia, transferenciaParaEditar = null) {
    const containerAtivos = document.getElementById('transferencia-ativos-disponiveis');
    const containerProventos = document.getElementById('transferencia-proventos-disponiveis');
    document.getElementById('transferencia-ativos-container').style.display = 'block';

    if (!corretoraOrigem || !dataTransferencia) {
        containerAtivos.innerHTML = '<p>Selecione uma corretora de origem e uma data.</p>';
        containerProventos.innerHTML = '';
        return;
    }

    const posicoes = gerarPosicaoDetalhada(dataTransferencia);
    const ativosDisponiveis = Object.entries(posicoes)
        .filter(([ticker, dados]) => (dados.porCorretora[corretoraOrigem] || 0) > 0.000001)
        .map(([ticker, dados]) => ({ ticker, quantidade: dados.porCorretora[corretoraOrigem] }));

    if (transferenciaParaEditar && transferenciaParaEditar.ativosTransferidos) {
        transferenciaParaEditar.ativosTransferidos.forEach(ativoT => {
            const ativoNaLista = ativosDisponiveis.find(a => a.ticker === ativoT.ticker);
            if (ativoNaLista) {
                ativoNaLista.quantidade += ativoT.quantidade;
            } else {
                ativosDisponiveis.push({ ticker: ativoT.ticker, quantidade: ativoT.quantidade });
            }
        });
    }

    ativosDisponiveis.sort((a,b) => a.ticker.localeCompare(b.ticker));

    if (ativosDisponiveis.length === 0) {
        containerAtivos.innerHTML = `<p>Nenhum ativo encontrado na corretora ${corretoraOrigem} na data selecionada.</p>`;
    } else {
        containerAtivos.innerHTML = ativosDisponiveis.map(ativo => `
            <div class="ativo-item">
                <input type="checkbox" id="transfer-ativo-${ativo.ticker}" name="transfer-ativo" value="${ativo.ticker}">
                <label for="transfer-ativo-${ativo.ticker}">${ativo.ticker} (Disponível: ${Math.round(ativo.quantidade)})</label>
                <input type="number" class="transfer-quantidade" placeholder="Qtd" min="1" max="${Math.round(ativo.quantidade)}" style="width: 100px;">
            </div>
        `).join('');
    }

    const proventosJaTransferidosIds = new Set(transferenciaParaEditar?.proventosTransferidos || []);
    
    let proventosDisponiveis = getProventosTransferiveis(corretoraOrigem, dataTransferencia);

    if (transferenciaParaEditar) {
        proventosJaTransferidosIds.forEach(id => {
            if (!proventosDisponiveis.some(p => p.id === id)) {
                const proventoAntigo = todosOsProventos.find(p => p.id === id);
                if (proventoAntigo) proventosDisponiveis.push(proventoAntigo);
            }
        });
    }

    proventosDisponiveis.sort((a,b) => a.ticker.localeCompare(b.ticker));

    if (proventosDisponiveis.length === 0) {
        containerProventos.innerHTML = `<p>Nenhum provento pendente encontrado para transferência nesta data.</p>`;
    } else {
        containerProventos.innerHTML = proventosDisponiveis.map(provento => {
            const isAlreadyTransferred = proventosJaTransferidosIds.has(provento.id);
            const valorNaCorretora = (provento.posicaoPorCorretora[corretoraOrigem] || provento.posicaoPorCorretora[transferenciaParaEditar?.corretoraDestino] || {valorRecebido: 0}).valorRecebido;
            const dataPagFmt = new Date(provento.dataPagamento + 'T12:00:00').toLocaleDateString('pt-BR');
            
            const checkboxHtml = `<input type="checkbox" id="transfer-provento-${provento.id}" name="transfer-provento" value="${provento.id}" ${isAlreadyTransferred ? 'checked disabled' : ''}>`;
            const labelHtml = `<label for="transfer-provento-${provento.id}">${provento.ticker} - ${provento.tipo} de ${formatarMoeda(valorNaCorretora)} (Paga em ${dataPagFmt})</label>`;
            const infoHtml = isAlreadyTransferred ? `<span class="transferencia-item-info">(Já transferido ✔️)</span>` : '';
            const revertBtnHtml = isAlreadyTransferred ? `<i class="fas fa-undo reverter-btn" title="Reverter transferência deste provento" data-provento-id="${provento.id}"></i>` : '';

            return `<div class="transferencia-item">${checkboxHtml}${labelHtml}${infoHtml}${revertBtnHtml}</div>`;
        }).join('');
    }

    if (transferenciaParaEditar) {
        setTimeout(() => {
            if (transferenciaParaEditar.ativosTransferidos) {
                transferenciaParaEditar.ativosTransferidos.forEach(ativoT => {
                    const checkbox = document.querySelector(`#transferencia-ativos-disponiveis input[value="${ativoT.ticker}"]`);
                    if (checkbox) {
                        checkbox.checked = true;
                        checkbox.parentElement.querySelector('.transfer-quantidade').value = ativoT.quantidade;
                    }
                });
            }
            if (transferenciaParaEditar.proventosTransferidos) {
                transferenciaParaEditar.proventosTransferidos.forEach(provId => {
                    const checkbox = document.querySelector(`#transferencia-proventos-disponiveis input[value="${provId}"]`);
                    if (checkbox) checkbox.checked = true;
                });
            }
        }, 50);
    }
}
function abrirModalEdicaoTransferencia(transferenciaId) {
    // A comparação agora é robusta, como corrigimos antes.
    const transferencia = todosOsAjustes.find(a => parseFloat(a.id) === parseFloat(transferenciaId));

    if (!transferencia) {
        console.error("Erro ao editar transferência: Não foi possível encontrar a transferência com o ID:", transferenciaId);
        alert("Ocorreu um erro ao tentar carregar os dados desta transferência.");
        return;
    }

    document.getElementById('transferencia-form-titulo').textContent = 'Editar Transferência de Custódia';
    
    const form = document.getElementById('form-transferencia-custodia');
    form.reset();
    document.getElementById('transferencia-id').value = transferencia.id;
    document.getElementById('transferencia-data').value = transferencia.data;
    document.getElementById('transferencia-corretora-origem').value = transferencia.corretoraOrigem;
    document.getElementById('transferencia-corretora-destino').value = transferencia.corretoraDestino;

    // A MUDANÇA PRINCIPAL ESTÁ AQUI: Passamos o objeto 'transferencia' para a função seguinte.
    popularAtivosParaTransferencia(transferencia.corretoraOrigem, transferencia.data, transferencia);

    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function renderizarTabelaEventosCorporativos() {
    const container = document.getElementById('lista-de-eventos-corporativos');
    const eventos = todosOsAjustes.filter(a => a.tipoAjuste === 'split_grupamento');

    if (eventos.length === 0) {
        container.innerHTML = '<p>Nenhum evento de split ou grupamento registrado.</p>';
        return;
    }

    let tableHtml = `<table><thead><tr>
        <th>Data-Ex</th>
        <th>Ativo</th>
        <th>Evento</th>
        <th class="numero">Proporção</th>
        <th class="controles-col">Controles</th>
    </tr></thead><tbody>`;

    eventos.sort((a,b) => new Date(b.data) - new Date(a.data)).forEach(evento => {
        const dataFormatada = new Date(evento.data + 'T12:00:00').toLocaleDateString('pt-BR');
        const tipoEventoLabel = evento.tipoEvento === 'split' ? 'Desdobramento (Split)' : 'Grupamento (Inplit)';
        const proporcaoLabel = `${evento.proporcaoDe} para ${evento.proporcaoPara}`;

        tableHtml += `
            <tr>
                <td>${dataFormatada}</td>
                <td>${evento.ticker}</td>
                <td>${tipoEventoLabel}</td>
                <td class="numero">${proporcaoLabel}</td>
                <td class="controles-col">
                    <i class="fas fa-edit acao-btn edit" title="Editar Evento" data-evento-corp-id="${evento.id}"></i>
                    <i class="fas fa-trash acao-btn delete" title="Excluir Evento" data-evento-corp-id="${evento.id}"></i>
                </td>
            </tr>
        `;
    });
    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
}

function abrirModalEventoCorporativo(ajusteParaEditar = null) {
    const form = document.getElementById('form-evento-corporativo');
    form.reset();

    if (ajusteParaEditar) {
        document.getElementById('modal-evento-titulo').textContent = 'Editar Evento Corporativo';
        document.getElementById('evento-id').value = ajusteParaEditar.id;
        document.getElementById('evento-ticker').value = ajusteParaEditar.ticker;
        document.getElementById('evento-data').value = ajusteParaEditar.data;
        document.getElementById('evento-tipo').value = ajusteParaEditar.tipoEvento;
        document.getElementById('evento-proporcao-de').value = ajusteParaEditar.proporcaoDe;
        document.getElementById('evento-proporcao-para').value = ajusteParaEditar.proporcaoPara;
    } else {
        document.getElementById('modal-evento-titulo').textContent = 'Registrar Novo Evento Corporativo';
        document.getElementById('evento-id').value = '';
    }
    modalEventoCorporativo.style.display = 'block';
    document.getElementById('evento-ticker').focus();
}

function abrirModalPosicaoInicial(posicaoParaEditar = null) {
    const form = document.getElementById('form-posicao-inicial');
    form.reset();
    document.getElementById('posicoes-corretoras-container').innerHTML = '';
    
    if (posicaoParaEditar) {
        // MODO EDIÇÃO
        document.getElementById('posicao-modal-titulo').textContent = 'Editar Posição Inicial';
        document.getElementById('posicao-id').value = posicaoParaEditar.id;
        document.getElementById('posicao-ativo').value = posicaoParaEditar.ticker;
        document.getElementById('posicao-data').value = normalizarDataParaInput(posicaoParaEditar.data);
        document.getElementById('posicao-preco-medio').value = formatarDecimalParaInput(posicaoParaEditar.precoMedio);

        posicaoParaEditar.posicoesPorCorretora.forEach(pc => {
            adicionarLinhaCorretora(pc.corretora, pc.quantidade);
        });

    } else {
        // MODO CRIAÇÃO
        document.getElementById('posicao-modal-titulo').textContent = 'Adicionar Posição Inicial';
        document.getElementById('posicao-id').value = '';
        adicionarLinhaCorretora(); // Adiciona uma linha de corretora em branco para começar
    }
    
    modalPosicaoInicial.style.display = 'block';
    document.getElementById('posicao-ativo').focus();
}


function renderizarListaNotas() {
    const container = document.getElementById('lista-de-notas-salvas');
    // Tradução dos cabeçalhos
    container.innerHTML = `<table style="font-size: 1em;"><thead><tr><th>Date</th><th>Broker</th><th>Note #</th><th>Operations</th><th>Settlement Date</th><th class="numero">Net Value</th><th class="controles-col">Actions</th></tr></thead><tbody></tbody></table>`;
    
    const body = container.querySelector('tbody');
    body.innerHTML = '';

    const filtroAtivoInput = document.getElementById('filtro-nota-ativo');
    const filtroTexto = filtroAtivoInput ? filtroAtivoInput.value.toUpperCase().trim() : '';
    const notasParaRenderizar = todasAsNotas.filter(nota => {
        if (!filtroTexto) {
            return true;
        }
        return nota.operacoes.some(op => op.ativo.toUpperCase().includes(filtroTexto));
    });
    
    if (notasParaRenderizar.length === 0) {
        // Tradução: Estado vazio
        body.innerHTML = `<tr><td colspan="7" style="text-align:center;">No notes found${filtroTexto ? ' for filter "' + filtroTexto + '"' : ''}.</td></tr>`;
        return;
    }

    notasParaRenderizar.sort((a,b) => new Date(b.data) - new Date(a.data)).forEach(nota => {
        // Tradução do tooltip detalhado
        let tooltipText = `Broker: ${nota.corretora}\n` +
                          `Note: ${nota.numero}\n` +
                          `Costs: ${formatarMoeda(nota.custos || 0)}\n` +
                          `WHT (IRRF): ${formatarMoeda(nota.irrf || 0)}\n\n` +
                          `Operations:\n`;

        if (nota.operacoes && nota.operacoes.length > 0) {
            nota.operacoes.forEach(op => {
                // Tradução: Compra/Venda -> Buy/Sell
                const tipoOp = op.tipo.toLowerCase() === 'compra' ? 'Buy' : 'Sell';
                tooltipText += ` - ${tipoOp}: ${op.quantidade} ${op.ativo} @ ${formatarMoeda(op.valor)}\n`;
            });
        } else {
            tooltipText += " - No operations in this note.\n";
        }

        const tr = document.createElement('tr');
        tr.setAttribute('data-tooltip', tooltipText.trim());

        // Formatação de data em en-GB
        const dataFormatada = nota.data ? new Date(nota.data).toLocaleDateString('en-GB') : 'Invalid Date';

        const totalCompras = nota.operacoes.filter(op => op.tipo === 'compra').reduce((acc, op) => acc + op.valor, 0);
        const totalVendas = nota.operacoes.filter(op => op.tipo === 'venda').reduce((acc, op) => acc + op.valor, 0);
        const totalCustos = (nota.custos || 0) + (nota.irrf || 0);
        const valorLiquido = totalVendas - totalCompras - totalCustos;
        
        // Formatação de data de liquidação em en-GB
        const dataLiquidacao = nota.data ? calcularDataLiquidacao(nota.data, 2).toLocaleDateString('en-GB') : 'N/A';
        
        // Tradução dos tooltips dos botões
        tr.innerHTML = `
            <td>${dataFormatada}</td>
            <td>${nota.corretora}</td>
            <td>${nota.numero}</td>
            <td>${nota.operacoes.length}</td>
            <td>${dataLiquidacao}</td>
            <td class="numero">${formatarValorComCeD(valorLiquido)}</td>
            <td class="controles-col">
                <i class="fas fa-edit acao-btn edit" title="Edit Note" data-note-id="${nota.id}"></i>
                <i class="fas fa-trash acao-btn delete" title="Delete Note" data-note-id="${nota.id}"></i>
            </td>
        `;
        body.appendChild(tr);
    });
}
function renderizarTabelaOperacoes() { const tabelaOperacoesBody = document.getElementById('tabela-operacoes-body'); tabelaOperacoesBody.innerHTML = ''; if (!notaAtual || !notaAtual.operacoes) return; const custosNota = parseDecimal(document.getElementById('nota-custos').value) || 0; const irrfNota = parseDecimal(document.getElementById('nota-irrf').value) || 0; const valorTotalOperacoes = notaAtual.operacoes.reduce((acc, op) => acc + op.valor, 0); notaAtual.operacoes.forEach(op => { const tr = document.createElement('tr'); const valorOp = op.valor; const precoUnitario = op.quantidade > 0 ? valorOp / op.quantidade : 0; const custoRateado = valorTotalOperacoes > 0 ? (valorOp / valorTotalOperacoes) * (custosNota + irrfNota) : 0; const custoUnitarioRateado = op.quantidade > 0 ? custoRateado / op.quantidade : 0; const precoComCustos = op.tipo === 'compra' ? precoUnitario + custoUnitarioRateado : precoUnitario - custoUnitarioRateado; tr.innerHTML = `<td>${op.ativo}</td><td>${op.tipo.charAt(0).toUpperCase() + op.tipo.slice(1)}</td><td class="numero">${op.quantidade}</td><td class="numero">${formatarMoeda(precoUnitario)}</td><td class="numero">${formatarMoeda(valorOp)}</td><td class="numero">${formatarPrecoMedio(precoComCustos)}</td><td class="controles-col"><i class="fas fa-edit acao-btn edit" title="Editar" data-op-id="${op.id}"></i><i class="fas fa-trash acao-btn delete" title="Excluir" data-op-id="${op.id}"></i></td>`; tabelaOperacoesBody.appendChild(tr); }); }
function atualizarTotais() { if (!notaAtual) return; notaAtual.custos = parseDecimal(document.getElementById('nota-custos').value) || 0; notaAtual.irrf = parseDecimal(document.getElementById('nota-irrf').value) || 0; const totalCompras = notaAtual.operacoes.filter(op => op.tipo === 'compra').reduce((acc, op) => acc + op.valor, 0); const totalVendas = notaAtual.operacoes.filter(op => op.tipo === 'venda').reduce((acc, op) => acc + op.valor, 0); const totalCustos = notaAtual.custos + notaAtual.irrf; const valorLiquido = totalVendas - totalCompras - totalCustos; document.getElementById('subtotal-compras').textContent = formatarMoeda(totalCompras); document.getElementById('subtotal-vendas').textContent = formatarMoeda(totalVendas); document.getElementById('subtotal-custos').textContent = formatarMoeda(totalCustos); document.getElementById('subtotal-liquido').textContent = formatarValorComCeD(valorLiquido); const dataNota = document.getElementById('nota-data').value; if(dataNota) { const dataLiquidacao = calcularDataLiquidacao(dataNota, 2); document.getElementById('subtotal-liquidacao').textContent = dataLiquidacao.toLocaleDateString('pt-BR'); } else { document.getElementById('subtotal-liquidacao').textContent = '--/--/----'; } }
function iniciarNovaNota() {
    notaAtual = { id: null, corretora: 'XP', data: '', numero: '', custos: null, irrf: null, operacoes: [] };
    const formNotaGeral = document.getElementById('form-nota-geral');
    formNotaGeral.reset();
    
    // Garante que os campos de custos e IRRF fiquem vazios para mostrar o placeholder
    document.getElementById('nota-custos').value = '';
    document.getElementById('nota-irrf').value = '';

    const selectCorretora = document.getElementById('nota-corretora');
    const corretorasAtivas = getCorretorasAtivasParaNotas();
    // --- ALTERAÇÃO AQUI: Adiciona a opção "Selecione..." ---
    selectCorretora.innerHTML = '<option value="">Selecione...</option>' + corretorasAtivas.map(c => `<option value="${c}">${c}</option>`).join('');
    selectCorretora.value = ""; // Garante que "Selecione..." seja a opção padrão
    // --- FIM DA ALTERAÇÃO ---
    selectCorretora.disabled = false; // Garante que o dropdown esteja habilitado.
    const tituloTela = document.querySelector('#tela-lancamento-nota h1');
    if (tituloTela) {
        tituloTela.textContent = 'Lançamento de Nota de Negociação';
    }
    inicializarIconesCalculadora();
    renderizarTabelaOperacoes();
    atualizarTotais();
    mostrarTela('lancamentoNota');
}


function iniciarEdicaoOperacao(opId) {
    const op = notaAtual.operacoes.find(o => o.id === opId);
    if (!op) return;
    modalEdicaoOperacao.style.display = 'block';
    document.getElementById('edit-op-id').value = op.id;
    document.getElementById('edit-op-ativo').value = op.ativo;
    document.getElementById('edit-op-tipo').value = op.tipo;
    document.getElementById('edit-op-quantidade').value = op.quantidade;
    document.getElementById('edit-op-valor').value = formatarDecimalParaInput(op.valor);
}





function renderizarTelaEventosAtivos() {
    const container = document.getElementById('lista-de-eventos-ativos');
    const eventos = todosOsAjustes.filter(a => a.tipoAjuste === 'evento_ativo');

    if (eventos.length === 0) {
        container.innerHTML = '<p>Nenhum evento de entrada ou saída registrado.</p>';
        return;
    }

    let tableHtml = `<table><thead><tr>
        <th>Data</th>
        <th>Ativo</th>
        <th>Evento</th>
        <th>Detalhes</th>
        <th class="controles-col">Controles</th>
    </tr></thead><tbody>`;

    eventos.sort((a,b) => new Date(b.data) - new Date(a.data)).forEach(evento => {
        const dataFormatada = new Date(evento.data + 'T12:00:00').toLocaleDateString('pt-BR');
        const tipoEventoLabel = evento.tipoEvento === 'entrada' ? 'Entrada de Ativo' : 'Saída de Ativo';
        const detalhes = evento.detalhes.map(d => `${d.corretora}: ${d.quantidade} un.`).join('<br>');

        tableHtml += `
            <tr>
                <td>${dataFormatada}</td>
                <td>${evento.ticker}</td>
                <td>${tipoEventoLabel}</td>
                <td>${detalhes}</td>
                <td class="controles-col">
                    <i class="fas fa-edit acao-btn edit" title="Editar Evento" data-evento-ativo-id="${evento.id}"></i>
                    <i class="fas fa-trash acao-btn delete" title="Excluir Evento" data-evento-ativo-id="${evento.id}"></i>
                </td>
            </tr>
        `;
    });
    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
}

function renderizarTelaImportacaoNotas(notas) {
    mostrarTela('importacaoNotas');
    const container = document.getElementById('container-revisao-notas');
    container.innerHTML = '';

    const corretorasOptions = getTodasCorretoras().map(c => `<option value="${c}">${c}</option>`).join('');

    notas.forEach(nota => {
        const notaDiv = document.createElement('div');
        notaDiv.className = 'import-review-container';
        notaDiv.dataset.notaId = nota.id;

        let operacoesHtml = '';
        nota.operacoes.forEach(op => {
            operacoesHtml += `
                <tr data-op-id="${op.id}">
                    <td><input type="text" class="op-ativo ticker-input" value="${op.ativo}"></td>
                    <td>
                        <select class="op-tipo">
                            <option value="compra" ${op.tipo === 'compra' ? 'selected' : ''}>Compra</option>
                            <option value="venda" ${op.tipo === 'venda' ? 'selected' : ''}>Venda</option>
                        </select>
                    </td>
                    <td class="numero"><input type="number" class="op-quantidade" value="${op.quantidade}"></td>
                    <td class="numero"><input type="text" class="op-valor" value="${formatarDecimalParaInput(op.valor)}"></td>
                    <td class="controles-col"><i class="fas fa-trash acao-btn delete" title="Excluir" onclick="this.closest('tr').remove()"></i></td>
                </tr>
            `;
        });

        notaDiv.innerHTML = `
            <h3>Nota Nº ${nota.numero}</h3>
            <div class="form-grid">
                <div class="form-group">
                    <label>Corretora</label>
                    <select class="nota-corretora">
                        ${corretorasOptions}
                    </select>
                </div>
                <div class="form-group"><label>Número da Nota</label><input type="text" class="nota-numero" value="${nota.numero}"></div>
                <div class="form-group"><label>Data da Nota</label><input type="date" class="nota-data" value="${nota.data}"></div>
                <div class="form-group"><label>Custos</label><input type="text" class="nota-custos" value="${formatarDecimalParaInput(nota.custos)}"></div>
                <div class="form-group"><label>IRRF</label><input type="text" class="nota-irrf" value="${formatarDecimalParaInput(nota.irrf)}"></div>
            </div>
            <h4 style="margin-top:20px;">Operações da Nota</h4>
            <table>
                <thead>
                    <tr>
                        <th>Ativo</th><th>Operação</th><th class="numero">Qtd</th>
                        <th class="numero">Valor Total (R$)</th><th class="controles-col">Ações</th>
                    </tr>
                </thead>
                <tbody>${operacoesHtml}</tbody>
            </table>
        `;
        container.appendChild(notaDiv);
        if (nota.corretora) {
            notaDiv.querySelector('.nota-corretora').value = nota.corretora;
        }
    });
}
function popularDropdownsUniversais(selectDebitoId, selectCreditoId) {
    const selectDebito = document.getElementById(selectDebitoId);
    const selectCredito = document.getElementById(selectCreditoId);

    // Tradução: Nenhuma
    let optionsHtml = '<option value="">None</option>';
    
    // Tradução: Contas
    optionsHtml += '<optgroup label="Accounts (BRL)">';
    getTodasContasAtivas()
        .sort((a,b) => a.banco.localeCompare(b.banco))
        .forEach(c => {
            // Tradução do tipo de conta embutido
            let tipoContaFmt = c.tipo;
            if (c.tipo === 'Conta Corrente') tipoContaFmt = 'Current Account';
            if (c.tipo === 'Conta Investimento') tipoContaFmt = 'Investment Account';
            if (c.tipo === 'Poupança') tipoContaFmt = 'Savings';
            optionsHtml += `<option value="brl_${c.id}">${c.banco} - ${tipoContaFmt}</option>`;
        });
    optionsHtml += '</optgroup>';

    const ativosPorMoeda = todosOsAtivosMoedas.reduce((acc, a) => {
        if (!acc[a.moeda]) acc[a.moeda] = [];
        acc[a.moeda].push(a);
        return acc;
    }, {});

    Object.keys(ativosPorMoeda).sort().forEach(moeda => {
        // Tradução: Ativos
        optionsHtml += `<optgroup label="Assets (${moeda})">`;
        ativosPorMoeda[moeda].forEach(a => {
            optionsHtml += `<option value="moeda_${a.id}">${a.nomeAtivo}</option>`;
        });
        optionsHtml += '</optgroup>';
    });

    selectDebito.innerHTML = optionsHtml;
    selectCredito.innerHTML = optionsHtml;
}

function popularDropdownAtivoRecorrente() {
    const selectAtivo = document.getElementById('transacao-moeda-ativo-recorrente');
    // Tradução: Selecione
    let optionsHtml = '<option value="">Select target...</option>';
    
    // Tradução: Contas
    optionsHtml += '<optgroup label="Accounts (BRL)">';
    getTodasContasAtivas()
        .sort((a,b) => a.banco.localeCompare(b.banco))
        .forEach(c => {
            let tipoContaFmt = c.tipo;
            if (c.tipo === 'Conta Corrente') tipoContaFmt = 'Current Account';
            if (c.tipo === 'Conta Investimento') tipoContaFmt = 'Investment Account';
            if (c.tipo === 'Poupança') tipoContaFmt = 'Savings';
            optionsHtml += `<option value="brl_${c.id}">${c.banco} - ${tipoContaFmt}</option>`;
        });
    optionsHtml += '</optgroup>';

    const ativosPorMoeda = todosOsAtivosMoedas.reduce((acc, a) => {
        if (!acc[a.moeda]) acc[a.moeda] = [];
        acc[a.moeda].push(a);
        return acc;
    }, {});

    Object.keys(ativosPorMoeda).sort().forEach(moeda => {
        // Tradução: Ativos
        optionsHtml += `<optgroup label="Assets (${moeda})">`;
        ativosPorMoeda[moeda].forEach(a => {
            optionsHtml += `<option value="moeda_${a.id}">${a.nomeAtivo}</option>`;
        });
        optionsHtml += '</optgroup>';
    });

    selectAtivo.innerHTML = optionsHtml;
}


function abrirModalEdicaoTransacaoProvento(transacaoId = null, eventoIdProvento = null) {
    let transacao, proventoOriginal;
    
    // Lógica para encontrar a transação correta
    if (transacaoId) { // Chamado com ID de transação existente (manual, editada, etc.)
        transacao = todasAsMovimentacoes.find(t => t.id === transacaoId);
    } else if (eventoIdProvento) { // Chamado para um provento original (automático)
        const proventoId = parseFloat(String(eventoIdProvento).split('_')[1]);
        const corretora = String(eventoIdProvento).split('_')[2];
        
        // Tenta encontrar uma transação já existente para este provento/corretora
        transacao = todasAsMovimentacoes.find(t => {
            if (t.source !== 'provento' && t.source !== 'provento_editado') return false;
            if (t.sourceId !== proventoId) return false;
            const contaAssociada = todasAsContas.find(c => String(c.id) === String(t.idAlvo));
            return contaAssociada && contaAssociada.banco === corretora;
        });
    }

    // Tradução: Erros
    if (!transacao) { alert("Error: Income transaction not found."); return; }
    
    proventoOriginal = todosOsProventos.find(p => p.id === transacao.sourceId);
    if (!proventoOriginal) { alert("Error: Original income record not found."); return; }
    
    document.getElementById('edit-trans-provento-id').value = transacao.id;
    document.getElementById('edit-trans-provento-ticker').value = proventoOriginal.ticker;
    // Tradução dos tipos
    let tipoProvFmt = proventoOriginal.tipo;
    if (proventoOriginal.tipo === 'Rendimento') tipoProvFmt = 'Yield';
    if (proventoOriginal.tipo === 'Dividendo') tipoProvFmt = 'Dividend';
    if (proventoOriginal.tipo === 'Bonificação') tipoProvFmt = 'Bonus';
    if (proventoOriginal.tipo === 'Outros') tipoProvFmt = 'Others';
    document.getElementById('edit-trans-provento-tipo').value = tipoProvFmt;
    // Data no padrão britânico
    document.getElementById('edit-trans-provento-data').value = new Date(proventoOriginal.dataPagamento + 'T12:00:00').toLocaleDateString('en-GB');
    document.getElementById('edit-trans-provento-valor').value = formatarDecimalParaInput(transacao.valor);
    
    abrirModal('modal-edicao-transacao-provento');
    document.getElementById('edit-trans-provento-valor').focus();
}



function renderizarTelaCaixaGlobal(manterEstadoMinimizado = false) {
    if (!telas.caixaGlobal || telas.caixaGlobal.style.display !== 'block') return;

    const dataInicioInput = document.getElementById('filtro-caixa-data-inicio');
    const dataFimInput = document.getElementById('filtro-caixa-data-fim');

    if (!dataInicioInput.value) {
        dataInicioInput.value = new Date().toISOString().split('T')[0];
    }
    if (!dataFimInput.value) {
        const hoje = new Date();
        const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
        const y = ultimoDia.getFullYear();
        const m = String(ultimoDia.getMonth() + 1).padStart(2, '0');
        const d = String(ultimoDia.getDate()).padStart(2, '0');
        dataFimInput.value = `${y}-${m}-${d}`;
    }

    const dataInicio = dataInicioInput.value;
    const dataFim = dataFimInput.value;

    const container = document.getElementById('container-caixa-global');
    const hojeStr = new Date().toISOString().split('T')[0];
    
    let estadosMinimizados = new Set();
    if (manterEstadoMinimizado) {
        container.querySelectorAll('.conta-coluna.minimized').forEach(col => {
            estadosMinimizados.add(col.dataset.idItem);
        });
    }

    container.innerHTML = '';
    const todosOsItens = [...getTodasContasAtivas(), ...todosOsAtivosMoedas];
    
    const itensAgrupados = todosOsItens.reduce((acc, item) => {
        const moeda = item.moeda || 'BRL';
        if (!acc[moeda]) acc[moeda] = [];
        acc[moeda].push(item);
        return acc;
    }, {});
    
    Object.keys(itensAgrupados).sort().forEach(moeda => {
        const grupoContainer = document.createElement('div');
        grupoContainer.className = 'grupo-moeda-container';
        
        let saldoAtualGrupo = 0;
        let saldoFuturoGrupo = 0;
        const dataFuturaD2 = calcularDataLiquidacao(hojeStr, 2);
        const dataFuturaD2Str = dataFuturaD2.toISOString().split('T')[0];

        itensAgrupados[moeda].forEach(item => {
            const isBRL = (item.moeda || 'BRL') === 'BRL';
            saldoAtualGrupo += isBRL ? calcularSaldoEmData(item, hojeStr) : gerarHtmlExtratoParaAtivoMoeda(item, dataInicio, dataFim).saldoFinal;
            if (isBRL) {
                saldoFuturoGrupo += calcularSaldoProjetado(item, dataFuturaD2Str, 'conta');
            }
        });

        // Tradução: Saldo Atual
        let tituloSaldoHtml = `<span class="saldo-titulo">(Current Balance: ${formatarValor(saldoAtualGrupo, moeda)})</span>`;
        if (moeda === 'BRL') {
            // Tradução: Saldo Atual / Saldo D+2
            tituloSaldoHtml = `<span class="saldo-titulo">(Current Balance: ${formatarValor(saldoAtualGrupo, 'BRL')} | D+2 Balance: ${formatarMoeda(saldoFuturoGrupo)})</span>`;
        }
        
        // Tradução: Contas em...
        grupoContainer.innerHTML = `<h2 style="margin: 20px 0 10px 0;">Accounts in ${moeda} ${tituloSaldoHtml}</h2>`;
        
        const colunasContainer = document.createElement('div');
        colunasContainer.className = 'colunas-view';
        
        itensAgrupados[moeda].sort((a,b) => (a.banco || a.nomeAtivo).localeCompare(b.banco || b.nomeAtivo)).forEach(item => {
            const isBRL = (item.moeda || 'BRL') === 'BRL';
            const { html, saldoFinal: saldoAtual, temMovimentoHoje } = isBRL 
                ? gerarHtmlExtratoParaConta(item, dataInicio, dataFim) 
                : gerarHtmlExtratoParaAtivoMoeda(item, dataInicio, dataFim);

            const saldoFuturo = calcularSaldoProjetado(item, dataFuturaD2Str, isBRL ? 'conta' : 'moeda');

            const cotacao = dadosMoedas.cotacoes[moeda] || 1;
            const saldoEmReais = saldoAtual * cotacao;
            const saldoClasse = saldoAtual < 0 ? 'valor-negativo' : '';
            const headerClasse = temMovimentoHoje ? 'hoje' : '';
            const itemId = `${isBRL ? 'conta' : 'moeda'}_${item.id}`;
            
            let minimizedClass = manterEstadoMinimizado ? (estadosMinimizados.has(itemId) ? 'minimized' : '') : (temMovimentoHoje ? '' : 'minimized');
            
            // Tradução de tipo conta para inglês no header
            let tipoContaFmt = item.tipo;
            if (item.tipo === 'Conta Corrente') tipoContaFmt = 'Current Account';
            if (item.tipo === 'Conta Investimento') tipoContaFmt = 'Investment Account';
            if (item.tipo === 'Poupança') tipoContaFmt = 'Savings';
            const nomeExibicao = isBRL ? `${item.banco} - ${tipoContaFmt}` : item.nomeAtivo;
            
            const nomeEsaldoMinimizado = `${nomeExibicao} <span class='saldo-minimizado'>${formatarValor(saldoAtual, moeda)}</span> <span class='saldo-futuro-minimizado'>D+2: ${formatarValor(saldoFuturo, moeda)}</span>`;
            
            let controlesHeader = '';
            if(!isBRL){
                 controlesHeader = `<i class="fas fa-edit acao-btn edit" title="Edit Asset" data-ativo-moeda-id="${item.id}"></i>
                                    <i class="fas fa-trash acao-btn delete" title="Delete Asset" data-ativo-moeda-id="${item.id}"></i>`;
            } else {
                 controlesHeader = `<i class="fas fa-edit acao-btn edit" title="Edit Account" data-conta-id="${item.id}"></i>`;
            }

            let headerDetailsHtml = '';
            if (isBRL && (item.agencia || item.numero || item.pix)) {
                // Tradução no cabeçalho das infos BRL
                headerDetailsHtml += '<div class="conta-header-details">';
                if (item.agencia) headerDetailsHtml += `<span>Branch: <strong>${item.agencia}</strong></span>`;
                if (item.numero) headerDetailsHtml += `<span>Account: <strong>${item.numero}</strong></span>`;
                if (item.pix) headerDetailsHtml += `<span>Pix: <strong>${item.pix}</strong></span>`;
                headerDetailsHtml += '</div>';
            }

            const coluna = document.createElement('div');
            coluna.className = `conta-coluna ${minimizedClass}`;
            coluna.dataset.idItem = itemId;
            
            coluna.innerHTML = `
                <div class="conta-header ${headerClasse}">
                    <div>
                        <h4>${nomeEsaldoMinimizado}</h4>
                        ${headerDetailsHtml}
                    </div>
                    <div>
                        <span class="saldo-header ${saldoClasse}" title="Balance in BRL: ${formatarMoeda(saldoEmReais)}">${formatarValor(saldoAtual, moeda)}</span>
                        <span class="saldo-futuro-header">D+2 (${dataFuturaD2.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })}): ${formatarValor(saldoFuturo, moeda)}</span>
                        ${controlesHeader}
                    </div>
                </div>
                <table>
                    <thead><tr><th>Date</th><th>Description</th><th class="numero">Value</th><th class="numero">Balance</th><th class="controles-col"></th></tr></thead>
                    <tbody>${html}</tbody>
                </table>
            `;
            colunasContainer.appendChild(coluna);
        });
        
        grupoContainer.appendChild(colunasContainer);
        container.appendChild(grupoContainer);
    });
}

function calcularResumoProventosParaMultiplosAtivos(proventosFiltrados, tickers, dataInicioFiltro, dataFimFiltro) {
    let projecaoAnualTotalAgregada = 0;
    let custoTotalAgregado = 0;
    let valorMercadoTotalAgregado = 0;

    const hoje = new Date().toISOString().split('T')[0];
    const posicoesAtuais = gerarPosicaoDetalhada();

    tickers.forEach(ticker => {
        const posicaoAtualAtivo = posicoesAtuais[ticker];
        if (!posicaoAtualAtivo || posicaoAtualAtivo.quantidade <= 0) return;

        // --- CORREÇÃO APLICADA AQUI ---
        // A data de início e fim agora é calculada para CADA ticker, individualmente,
        // dentro do loop, em vez de uma vez só para o grupo todo.
        const dataInicioTicker = dataInicioFiltro || getInicioInvestimento([ticker]);
        const dataFimTicker = dataFimFiltro || getFimInvestimento([ticker]);
        // --- FIM DA CORREÇÃO ---

        const projecaoAnualUnitaria = calcularProjecaoAnualUnitaria(ticker, {
            dataInicio: dataInicioTicker,
            dataFim: dataFimTicker,
            proventosParaCalculo: proventosFiltrados
        });

        const projecaoAnualTotal = projecaoAnualUnitaria * posicaoAtualAtivo.quantidade;

        projecaoAnualTotalAgregada += projecaoAnualTotal;
        custoTotalAgregado += posicaoAtualAtivo.quantidade * posicaoAtualAtivo.precoMedio;

        const cotacao = dadosDeMercado.cotacoes[ticker];
        valorMercadoTotalAgregado += (cotacao && cotacao.valor > 0) ? posicaoAtualAtivo.quantidade * cotacao.valor : 0;
    });

    const mediaMensalTotalAgregada = projecaoAnualTotalAgregada / 12;
    const yocCustoAnualAgregado = custoTotalAgregado > 0 ? projecaoAnualTotalAgregada / custoTotalAgregado : 0;
    const yieldMercadoAnualAgregado = valorMercadoTotalAgregado > 0 ? projecaoAnualTotalAgregada / valorMercadoTotalAgregado : 0;

    const dividendoTotalPeriodo = proventosFiltrados.reduce((acc, p) => acc + p.valorTotalRecebido, 0);
    
    const mediaMensalPorUnidade = (tickers.length === 1 && posicoesAtuais[tickers[0]]?.quantidade > 0) ? mediaMensalTotalAgregada / posicoesAtuais[tickers[0]].quantidade : 0;

    return {
        dividendoTotalPeriodo,
        projecaoAnualTotal: projecaoAnualTotalAgregada,
        mediaMensalTotal: mediaMensalTotalAgregada,
        yocCustoAnual: yocCustoAnualAgregado,
        yocCustoMensal: yocCustoAnualAgregado / 12,
        yieldMercadoAnual: yieldMercadoAnualAgregado,
        yieldMercadoMensal: yieldMercadoAnualAgregado / 12,
        mediaMensalPorUnidade: mediaMensalPorUnidade
    };
}

function renderizarTabelaProventos() {
    const container = document.getElementById('lista-de-proventos');
    const summaryContainer = document.getElementById('proventos-summary-container');
    const summaryTitulo = document.getElementById('proventos-summary-titulo');
    
    const tableHeaders = `
        <th class="sortable" data-key="ticker">Ativo</th>
        <th class="sortable" data-key="tipo">Tipo</th>
        <th class="sortable" data-key="dataCom">Data Com</th>
        <th class="sortable" data-key="dataPagamento">Data Pag.</th>
        <th class="numero sortable col-provento-valor" data-key="valorIndividual">Provento por Unidade</th>
        <th class="numero col-provento-qtd">Qtd. Na Data</th>
        <th class="numero col-provento-valor">Preço Médio (Data Com)</th>
        <th class="numero col-provento-valor">Total Recebido</th>
        <th class="percentual col-provento-yoc">YOC</th>
        <th>Detalhes</th>
        <th class="controles-col">Controles</th>`;
    container.innerHTML = `<table><thead><tr>${tableHeaders}</tr></thead><tbody></tbody></table>`;
    
    const body = container.querySelector('tbody');
    const hojeStr = new Date().toISOString().split('T')[0];
    const hojeMeiaNoite = new Date(hojeStr + 'T00:00:00');

    const proventosFiltrados = obterProventosFiltrados();

    const filtroAtivo = document.getElementById('provento-filtro-ativo').value;
    const filtroTipo = document.getElementById('provento-filtro-tipo').value;
    const filtroStatus = document.getElementById('provento-filtro-status').value;
    const filtroDataDe = document.getElementById('provento-filtro-data-de').value;
    const filtroDataAte = document.getElementById('provento-filtro-data-ate').value;
    
    let tooltipTitle = `Exportar ${proventosFiltrados.length} proventos exibidos.`;
    const filtrosAtivos = [];
    const statusMap = { receber: 'A Receber', recebido: 'Recebidos' };
    
    if (filtroDataDe || filtroDataAte) filtrosAtivos.push(`Período: ${filtroDataDe || 'Início'} a ${filtroDataAte || 'Fim'}`);
    if (filtroAtivo) filtrosAtivos.push(`Ativo: ${filtroAtivo.toUpperCase()}`);
    if (filtroTipo !== 'todos') filtrosAtivos.push(`Tipo: ${filtroTipo}`);
    if (filtroStatus !== 'todos') filtrosAtivos.push(`Status: ${statusMap[filtroStatus]}`);

    if (filtrosAtivos.length > 0) {
        tooltipTitle += "\n\nFiltros Ativos:\n- " + filtrosAtivos.join('\n- ');
    }
    
    const btnExportar = document.getElementById('btn-exportar-proventos');
    if (btnExportar) {
        btnExportar.setAttribute('data-tooltip', tooltipTitle);
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

    summaryContainer.style.display = 'block';
    const tickersUnicos = [...new Set(sortedProventos.map(p => p.ticker))];
    if (tickersUnicos.length > 0) {
        const resumo = calcularResumoProventosParaMultiplosAtivos(proventosFiltrados, tickersUnicos, filtroDataDe, filtroDataAte);        
        const dataInicio = filtroDataDe || getInicioInvestimento(tickersUnicos);
        const dataFim = filtroDataAte || getFimInvestimento(tickersUnicos);
        const dataInicioFmt = dataInicio ? new Date(dataInicio + 'T12:00:00').toLocaleDateString('pt-BR') : 'Início';
        const dataFimFmt = dataFim ? new Date(dataFim + 'T12:00:00').toLocaleDateString('pt-BR') : 'Fim';
        
        summaryTitulo.textContent = `Resumo do Período de ${dataInicioFmt} até ${dataFimFmt}`;        
        document.getElementById('summary-dividendo-total').textContent = formatarMoeda(resumo.dividendoTotalPeriodo);
        document.getElementById('summary-projecao-anual').textContent = formatarMoeda(resumo.projecaoAnualTotal);
        document.getElementById('summary-media-mensal').textContent = formatarMoeda(resumo.mediaMensalTotal);
        document.getElementById('summary-yoc-anual').textContent = formatarPercentual(resumo.yocCustoAnual);
        document.getElementById('summary-yoc-mensal').textContent = formatarPercentual(resumo.yocCustoMensal);
        document.getElementById('summary-yield-mercado-anual').textContent = formatarPercentual(resumo.yieldMercadoAnual);
        document.getElementById('summary-yield-mercado-mensal').textContent = formatarPercentual(resumo.yieldMercadoMensal);

        // --- INÍCIO DA ALTERAÇÃO ---
        if (tickersUnicos.length === 1) {
            // Calcula o total pago por unidade no período filtrado
            const totalPagoPorUnidade = proventosFiltrados.reduce((acc, p) => acc + p.valorIndividual, 0);
            
            // Exibe o container e preenche os dois valores
            const containerUnidade = document.getElementById('summary-media-unidade-container');
            containerUnidade.style.display = 'flex'; // Usar 'flex' para alinhar os itens
            document.getElementById('summary-media-unidade-valor').textContent = formatarMoeda(resumo.mediaMensalPorUnidade);
            document.getElementById('summary-total-unidade-valor').textContent = formatarMoeda(totalPagoPorUnidade);
        } else {
             document.getElementById('summary-media-unidade-container').style.display = 'none';
        }
        // --- FIM DA ALTERAÇÃO ---
    } else {
        summaryTitulo.textContent = `Resumo do Período`;
        document.getElementById('summary-dividendo-total').textContent = formatarMoeda(0);
        document.getElementById('summary-projecao-anual').textContent = formatarMoeda(0);
        document.getElementById('summary-media-mensal').textContent = formatarMoeda(0);
        document.getElementById('summary-yoc-anual').textContent = formatarPercentual(0);
        document.getElementById('summary-yoc-mensal').textContent = formatarPercentual(0);
        document.getElementById('summary-yield-mercado-anual').textContent = formatarPercentual(0);
        document.getElementById('summary-yield-mercado-mensal').textContent = formatarPercentual(0);
        document.getElementById('summary-media-unidade-container').style.display = 'none';
    }

    if (sortedProventos.length === 0) {
        body.innerHTML = '<tr><td colspan="11" style="text-align:center;">Nenhum provento encontrado para os filtros selecionados.</td></tr>';
        return;
    }

    sortedProventos.forEach(p => {
        const tr = document.createElement('tr');
        tr.dataset.id = p.id;
        if (new Date(p.dataPagamento + 'T12:00:00') >= hojeMeiaNoite) tr.classList.add('pagamento-futuro');
        
        if(isProventosEditMode) {
             tr.innerHTML = `
                <td><input type="text" class="ticker-input edit-field" style="width: 80px;" data-field="ticker" value="${p.ticker}"></td>
                <td>${p.tipo}</td>
                <td><input type="date" class="edit-field" style="width: 130px;" data-field="dataCom" value="${p.dataCom}"></td>
                <td><input type="date" class="edit-field" style="width: 130px;" data-field="dataPagamento" value="${p.dataPagamento}"></td>
                <td class="numero"><input type="text" style="width: 100px;" class="numero edit-field" data-field="valorIndividual" value="${formatarDecimalParaInput(p.valorIndividual)}"></td>
                <td class="numero">${Math.round(p.quantidadeNaDataCom)}</td>
                <td class="numero">${formatarPrecoMedio(p.precoMedioNaDataCom)}</td>
                <td class="numero">${formatarMoeda(p.valorTotalRecebido)}</td>
                <td class="percentual">${formatarPercentual(p.yieldOnCost)}</td>
                <td>-</td>
                <td class="controles-col"><i class="fas fa-lock" title="Saia do modo de edição para excluir"></i></td>
             `;
        } else {
             let dataComFmt = p.dataCom ? new Date(p.dataCom + 'T12:00:00').toLocaleDateString('pt-BR') : 'Data Inválida';
             if (p.dataCom === hojeStr) dataComFmt = `<span class="data-hoje">${dataComFmt}</span>`;
             let dataPagFmt = p.dataPagamento ? new Date(p.dataPagamento + 'T12:00:00').toLocaleDateString('pt-BR') : 'Data Inválida';
             if (p.dataPagamento === hojeStr) dataPagFmt = `<span class="data-hoje">${dataPagFmt}</span>`;
             let detalhesCorretoras = Object.entries(p.posicaoPorCorretora).map(([nome, dados]) => `${nome}: ${Math.round(dados.quantidade)} / ${formatarMoeda(dados.valorRecebido)}`).join('<br>');
             if (!detalhesCorretoras) detalhesCorretoras = 'N/A';
             const warningIcon = !todosOsAtivos.find(a => a.ticker === p.ticker)?.tipo ? `<i class="fas fa-exclamation-triangle warning-icon" title="Ativo com cadastro incompleto."></i>` : '';
             
             tr.innerHTML = `
                <td>${p.ticker} ${warningIcon}</td>
                <td>${p.tipo}</td>
                <td>${dataComFmt}</td>
                <td>${dataPagFmt}</td>
                <td class="numero col-provento-valor">${formatarPrecoMedio(p.valorIndividual)}</td>
                <td class="numero col-provento-qtd">${Math.round(p.quantidadeNaDataCom)}</td>
                <td class="numero col-provento-valor">${formatarPrecoMedio(p.precoMedioNaDataCom)}</td>
                <td class="numero col-provento-valor">${formatarMoeda(p.valorTotalRecebido)}</td>
                <td class="percentual col-provento-yoc">${formatarPercentual(p.yieldOnCost)}</td>
                <td class="provento-details">${detalhesCorretoras}</td>
                <td class="controles-col">
                    <i class="fas fa-edit acao-btn edit" title="Editar Provento" data-provento-id="${p.id}"></i>
                    <i class="fas fa-trash acao-btn delete" title="Excluir Provento" data-provento-id="${p.id}"></i>
                </td>`;
        }
        body.appendChild(tr);
    });

    document.querySelectorAll('#lista-de-proventos .sortable').forEach(header => {
        header.classList.remove('ascending', 'descending');
        if (header.dataset.key === sortConfigProventos.key) {
            header.classList.add(sortConfigProventos.direction);
        }
    });
}


function abrirModalCorrecaoProventosOrfaos(proventosOrfaos) {
    const container = document.getElementById('lista-proventos-orfaos-container');
    const corretorasOptions = getTodasCorretoras().map(c => `<option value="${c}">${c}</option>`).join('');

    let tableHtml = `
        <table class="tabela-correcao-orfaos">
            <thead>
                <tr>
                    <th class="col-ativo-correcao">Ativo</th>
                    <th class="col-data-correcao">Data Com</th>
                    <th class="col-pm-correcao">Preço Médio (R$)</th>
                    <th class="col-posicoes-correcao">Posições por Corretora</th>
                </tr>
            </thead>
            <tbody>
    `;

    proventosOrfaos.forEach(provento => {
        tableHtml += `
            <tr class="provento-correcao-row" data-provento-id="${provento.id}" data-ticker="${provento.ticker}" data-datacom="${provento.dataCom}">
                <td class="correcao-ativo-container"><strong>${provento.ticker}</strong></td>
                <td class="correcao-ativo-container">${new Date(provento.dataCom + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td>
                    <div class="correcao-pm-container">
                        <input type="text" class="provento-correcao-pm" placeholder="Ex: 25,50">
                    </div>
                </td>
                <td>
                    <div class="posicoes-por-corretora-wrapper">
                        </div>
                    <button type="button" class="btn btn-primary btn-sm btn-add-corretora-provento" style="margin-top: 10px;">+ Add Corretora</button>
                </td>
            </tr>
        `;
    });

    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
    modalCorrigirProventosOrfaos.style.display = 'block';
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

function gerarHtmlTabelaAtivos(tipoAtivo, posicoesDetalhadas, filtroCorretora, valorTotalCarteira) {
    // 1. Inicia com os tickers que o usuário possui na carteira para esta categoria.
    const tickersEmPosicao = new Set(
        Object.keys(posicoesDetalhadas).filter(ticker => {
            const ativoInfo = todosOsAtivos.find(a => a.ticker === ticker);
            return ativoInfo && ativoInfo.tipo === tipoAtivo && posicoesDetalhadas[ticker].quantidade > 0.000001;
        })
    );

    // 2. Adiciona os tickers que estão no plano de alocação para esta categoria.
    const tickersPlanejados = new Set(
        Object.keys(dadosAlocacao.ativos).filter(ticker => {
            const ativoInfo = todosOsAtivos.find(a => a.ticker === ticker);
            return ativoInfo && ativoInfo.tipo === tipoAtivo;
        })
    );

    // 3. Combina as duas listas para ter a lista final de ativos a exibir.
    const tickersParaExibir = [...new Set([...tickersEmPosicao, ...tickersPlanejados])];

    // 4. Busca os objetos completos dos ativos que serão exibidos.
    const ativosParaProcessar = tickersParaExibir.map(ticker => todosOsAtivos.find(a => a.ticker === ticker)).filter(Boolean);


    // Pré-calcula os resultados realizados para todos os ativos de uma vez para otimização
    const tickersDaCategoria = ativosParaProcessar.map(a => a.ticker);
    const resultadosRealizadosMap = calcularResultadosRealizados(tickersDaCategoria);

    let dadosParaTabela = ativosParaProcessar.map(ativo => {
        if (!ativo) return null;

        const posTicker = posicoesDetalhadas[ativo.ticker];
        const quantidadeAtual = posTicker ? posTicker.quantidade : 0;
        
        const quantidadeFiltrada = (filtroCorretora === 'consolidado') 
            ? quantidadeAtual 
            : (posTicker ? (posTicker.porCorretora[filtroCorretora] || 0) : 0);
        
        // --- INÍCIO DA ALTERAÇÃO CORRIGIDA ---
        if (filtroCorretora !== 'consolidado') {
            // Se um filtro de corretora estiver ativo, esconde QUALQUER ativo que não tenha posição nela.
            if (quantidadeFiltrada < 0.000001) {
                return null;
            }
        } else {
            // Se estiver no "Consolidado", aplica a regra correta:
            if (quantidadeFiltrada < 0.000001) {
                const percIdeal = dadosAlocacao.ativos[ativo.ticker];
                // Esconde *APENAS SE* o ativo não estiver no plano de alocação.
                // Se ele estiver (mesmo com percIdeal === 0), ele deve ser exibido.
                if (percIdeal === undefined) {
                    return null;
                }
            }
        }
        // --- FIM DA ALTERAÇÃO CORRIGIDA ---

        const cotacao = dadosDeMercado.cotacoes[ativo.ticker];
        const precoAtual = cotacao ? cotacao.valor : 0;
        const valorDeMercado = quantidadeFiltrada * precoAtual;
        
        const projecaoAnual = (ativo.tipo === 'Ação') ? calcularProjecaoAnualUnitaria(ativo.ticker, { limiteAnos: 5 }) : getUltimoProvento(ativo.ticker) * 12;
        
        const precoMedio = posTicker ? posTicker.precoMedio : 0;
        const custoTotal = quantidadeFiltrada * precoMedio;
        
        const dataInicioCiclo = getInicioIninterrupto(ativo.ticker);
        const proventosRecebidos = todosOsProventos
            .filter(p => p.ticker === ativo.ticker && p.dataPagamento && (!dataInicioCiclo || p.dataPagamento >= dataInicioCiclo))
            .reduce((soma, p) => soma + p.valorTotalRecebido, 0);
        const resultadoRealizado = resultadosRealizadosMap.get(ativo.ticker) || 0;
        const totalRetornado = proventosRecebidos + resultadoRealizado;
        const progressoBreakEven = custoTotal > 0 ? Math.min(1, totalRetornado / custoTotal) : 0;

        return {
            ticker: ativo.ticker,
            // Tradução: fallback do nome
            nome: ativo.nome || 'Name not registered',
            quantidade: quantidadeFiltrada,
            precoMedio: precoMedio,
            precoAtual: precoAtual,
            custoTotal: custoTotal,
            valorDeMercado: valorDeMercado,
            variacaoPercentual: precoMedio > 0 ? (precoAtual - precoMedio) / precoMedio : 0,
            yoc: precoMedio > 0 ? projecaoAnual / precoMedio : 0,
            dy: precoAtual > 0 ? projecaoAnual / precoAtual : 0,
            pl: (ativo.tipo === 'Ação' && cotacao?.lpa_acao > 0 && precoAtual > 0) ? precoAtual / cotacao.lpa_acao : 0,
            pvp: (ativo.tipo === 'FII' && cotacao?.vpa > 0 && precoAtual > 0) ? precoAtual / cotacao.vpa : 0,
            alocacaoIdeal: dadosAlocacao.ativos[ativo.ticker] || 0,
            alocacaoAtual: valorTotalCarteira > 0 ? valorDeMercado / valorTotalCarteira : 0,
            progressoBreakEven: progressoBreakEven
        };
    }).filter(d => d !== null);

    if (dadosParaTabela.length === 0) {
        return { html: null, custoTotal: 0, valorMercado: 0 };
    }
    
    const sortConfig = sortConfigRendaVariavel[tipoAtivo];
    dadosParaTabela.sort((a, b) => {
        const valA = a[sortConfig.key] || '';
        const valB = b[sortConfig.key] || '';
        const direction = sortConfig.direction === 'ascending' ? 1 : -1;
        if (typeof valA === 'string') return valA.localeCompare(valB) * direction;
        if (valA < valB) return -1 * direction;
        if (valA > valB) return 1 * direction;
        return 0;
    });

    const custoTotalCategoria = dadosParaTabela.reduce((soma, item) => soma + item.custoTotal, 0);
    const valorMercadoCategoria = dadosParaTabela.reduce((soma, item) => soma + item.valorDeMercado, 0);
    const alocacaoIdealTotalCategoria = dadosParaTabela.reduce((soma, item) => soma + item.alocacaoIdeal, 0);
    const alocacaoAtualTotalCategoria = dadosParaTabela.reduce((soma, item) => soma + item.alocacaoAtual, 0);
    
    let additionalHeaders = '';
    if (tipoAtivo === 'Ação') { additionalHeaders = '<th class="percentual sortable" data-key="yoc">YoC %</th><th class="percentual sortable" data-key="dy">DY %</th><th class="numero sortable" data-key="pl">P/E</th>'; } 
    else if (tipoAtivo === 'FII') { additionalHeaders = '<th class="percentual sortable" data-key="yoc">YoC %</th><th class="percentual sortable" data-key="dy">DY %</th><th class="numero sortable" data-key="pvp">P/BV</th>'; }
    
    // Tradução dos Cabeçalhos
    const headers = `<th class="sortable" data-key="ticker">Asset</th><th class="numero sortable" data-key="quantidade">Qty</th><th class="numero sortable" data-key="precoMedio">Avg Price</th><th class="numero sortable" data-key="precoAtual">Current Price</th><th class="percentual col-variacao sortable" data-key="variacaoPercentual">Var. %</th><th class="numero sortable" data-key="custoTotal">Total Cost</th><th class="numero sortable" data-key="valorDeMercado">Market Value</th>${additionalHeaders}<th class="coluna-alocacao sortable" data-key="alocacaoIdeal">Target Allocation (% Global)</th><th class="coluna-alocacao sortable" data-key="alocacaoAtual">Current Allocation (% Global)</th>`;
    
    let corpoTabela = '';
    dadosParaTabela.forEach(item => {
        const nomeAbreviado = truncarTexto(item.nome, 15);
        const valorAlocacaoIdeal = valorTotalCarteira * item.alocacaoIdeal;
        const diffPercent = item.variacaoPercentual;
        let classePreco = '', desempenhoHtml = '-';
        if (diffPercent > 0.0001) { classePreco = 'preco-maior'; desempenhoHtml = `<span class="preco-maior">↑ ${formatarPercentual(diffPercent)}</span>`; } 
        else if (diffPercent < -0.0001) { classePreco = 'preco-menor'; desempenhoHtml = `<span class="preco-menor">↓ ${formatarPercentual(Math.abs(diffPercent))}</span>`; }

        let additionalCells = '';
        if (tipoAtivo === 'Ação') {
            additionalCells = `<td class="percentual">${formatarPercentual(item.yoc)}</td><td class="percentual">${formatarPercentual(item.dy)}</td><td class="numero">${item.pl > 0 ? formatarDecimal(item.pl) : 'N/A'}</td>`;
        } else if (tipoAtivo === 'FII') {
            additionalCells = `<td class="percentual">${formatarPercentual(item.yoc)}</td><td class="percentual">${formatarPercentual(item.dy)}</td><td class="numero">${item.pvp > 0 ? formatarDecimal(item.pvp) : 'N/A'}</td>`;
        }
        
        const progressoPercentual = item.progressoBreakEven * 100;
        const corProgresso = '#d4edda';
        const estiloFundo = `background: linear-gradient(to right, ${corProgresso} ${progressoPercentual}%, transparent ${progressoPercentual}%);`;
        
        const isPlannedAsset = item.quantidade < 0.000001;
        // Tradução tooltip de exclusão do ativo planejado
        const deleteIcon = isPlannedAsset ? `<i class="fas fa-times-circle acao-btn delete excluir-ativo-planejado" data-ticker="${item.ticker}" title="Remove from planned allocation"></i>` : '';

        corpoTabela += `<tr class="ativo-row" data-ticker="${item.ticker}" style="${estiloFundo}" title="Progress to Break-Even: ${progressoPercentual.toFixed(1)}%">
            <td class="ativo-row-clickable" title="${item.nome}">${item.ticker} - ${nomeAbreviado} ${deleteIcon}</td>
            <td class="numero">${Math.round(item.quantidade)}</td><td class="numero">${formatarPrecoMedio(item.precoMedio)}</td>
            <td class="numero ${classePreco}">${formatarMoeda(item.precoAtual)}</td><td class="percentual col-variacao">${desempenhoHtml}</td>
            <td class="numero">${formatarMoeda(item.custoTotal)}</td><td class="numero ${item.valorDeMercado >= item.custoTotal ? 'valor-positivo' : 'valor-negativo'}">${formatarMoeda(item.valorDeMercado)}</td>
            ${additionalCells}
            <td class="percentual coluna-alocacao"><input type="text" class="alocacao-ativo-input" data-ativo-ticker="${item.ticker}" value="${formatarDecimal(item.alocacaoIdeal * 100)}"><span class="alocacao-valor-real">${formatarMoeda(valorAlocacaoIdeal)}</span></td>
            <td class="percentual coluna-alocacao">${formatarPercentual(item.alocacaoAtual)}<span class="alocacao-valor-real">${formatarMoeda(item.valorDeMercado)}</span></td>
        </tr>`;
    });
    
    let peTabelaHtml = '';
    let rodape = '<tr>';
    // Tradução Total
    rodape += '<td colspan="5" style="text-align: right;"><strong>TOTALS:</strong></td>';
    rodape += `<td class="numero"><strong>${formatarMoeda(custoTotalCategoria)}</strong></td>`;
    rodape += `<td class="numero"><strong>${formatarMoeda(valorMercadoCategoria)}</strong></td>`;

    if (tipoAtivo === 'Ação' || tipoAtivo === 'FII') {
        rodape += '<td></td><td></td><td></td>';
    }

    if (filtroCorretora === 'consolidado') {
        rodape += `<td class="numero coluna-alocacao"><strong>${formatarPercentual(alocacaoIdealTotalCategoria)}</strong></td>`;
        rodape += `<td class="numero coluna-alocacao"><strong>${formatarPercentual(alocacaoAtualTotalCategoria)}</strong></td>`;
    }
    rodape += '</tr>';
    peTabelaHtml = `<tfoot>${rodape}</tfoot>`;

    const classeTabela = filtroCorretora !== 'consolidado' ? 'filtro-corretora-ativo' : '';
    // --- INÍCIO DA ALTERAÇÃO TAREFA 2 ---
    // Adiciona a classe CSS e o data-attribute ao título <h2>
    // Tradução dos Tipos
    const tituloSecao = tipoAtivo === 'FII' ? 'Real Estate Investment Trusts' : (tipoAtivo === 'Ação' ? 'Shares' : tipoAtivo + 's');
    const tituloHtml = `<h2 class="titulo-clicavel-grafico" data-tipo-ativo="${tipoAtivo}" title="Click to view the ${tituloSecao} price chart">${tituloSecao}</h2>`;
    // --- FIM DA ALTERAÇÃO TAREFA 2 ---

    const tabelaCompletaHtml = `<table class="${classeTabela}" data-tipo-ativo="${tipoAtivo}">
        <thead><tr>${headers}</tr></thead>
        <tbody>${corpoTabela}</tbody>
        ${peTabelaHtml}
    </table>`;
    
    // --- ALTERAÇÃO TAREFA 2: Retorna o título junto com o HTML da tabela ---
    return { html: tituloHtml + tabelaCompletaHtml, custoTotal: custoTotalCategoria, valorMercado: valorMercadoCategoria };
}
function abrirModalCalendariosUnificados(vistaInicial = 'fiis') {
    const container = document.getElementById('calendario-container');
    const titulo = document.getElementById('modal-calendario-titulo');
    
    // Tradução: Rendimentos/Dividendos
    container.innerHTML = `
        <div class="page-subheader" id="seletor-vista-calendario-unificado">
            <h2 class="subtitulo-calendario" data-vista="fiis">Yields (REITs)</h2>
            <h2 class="subtitulo-calendario" data-vista="acoes">Dividends (Shares/ETFs)</h2>
        </div>
        <div id="conteudo-calendario-unificado"></div>
    `;

    const renderizarVista = (vista) => {
        const conteudoContainer = document.getElementById('conteudo-calendario-unificado');
        document.querySelector('[data-vista="fiis"]').classList.toggle('ativo', vista === 'fiis');
        document.querySelector('[data-vista="acoes"]').classList.toggle('ativo', vista === 'acoes');
        
        conteudoContainer.innerHTML = (vista === 'fiis') ? gerarHtmlCalendarioFIIs() : gerarHtmlCalendarioAcoes();

        conteudoContainer.querySelectorAll('.provento-item-container').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const target = e.target;
                const acoesDiv = item.querySelector('.provento-acoes');

                if (target.closest('.acao-btn')) {
                    const proventoId = parseFloat(item.dataset.proventoId);
                    const provento = todosOsProventos.find(p => p.id === proventoId);
                    if (provento) {
                        const tipoAtivo = todosOsAtivos.find(a => a.ticker === provento.ticker)?.tipo;
                        retornoModalProvento = `unificado-${tipoAtivo === 'FII' ? 'fiis' : 'acoes'}`;
                        if (target.closest('.edit')) {
                            abrirModalLancamentoProvento(provento);
                        } else if (target.closest('.delete')) {
                            deletarProvento(provento.id);
                        }
                    }
                } else {
                    document.querySelectorAll('.provento-acoes').forEach(el => {
                        if (el !== acoesDiv) el.style.display = 'none';
                    });
                    acoesDiv.style.display = acoesDiv.style.display === 'flex' ? 'none' : 'flex';
                }
            });
        });
    };

    document.getElementById('seletor-vista-calendario-unificado').addEventListener('click', (e) => {
        const target = e.target.closest('.subtitulo-calendario');
        if (target && !target.classList.contains('ativo')) {
            renderizarVista(target.dataset.vista);
        }
    });

    // Tradução: Título
    titulo.textContent = 'Income Calendars';
    renderizarVista(vistaInicial); 
    abrirModal('modal-proventos-calendario');
}

function abrirModalDetalhesAtivo(ticker) {
    const ativo = todosOsAtivos.find(a => a.ticker === ticker);
    const posicao = gerarPosicaoDetalhada()[ticker];
    const dadosMercado = dadosDeMercado.cotacoes[ticker] || {};
    
    if (!ativo) return;

    // 1. Busca dados de balanceamento
    const dadosBalanceamento = gerarDadosBalanceamento('todos');
    const tipoCategoria = ativo.tipo === 'Ação' ? 'Ações' : ativo.tipo === 'FII' ? 'FIIs' : 'ETF';
    const dadosDoAtivoNoBalanceamento = dadosBalanceamento.categorias[tipoCategoria]?.ativos.find(a => a.ticker === ticker);
    
    const dadosBal = dadosDoAtivoNoBalanceamento || { 
        ideal: { percentualGlobal: 0, valor: 0 }, 
        atual: { percentualGlobal: 0, valor: 0 },
        ajuste: { valor: 0, percentual: 0 }
    };

    // 2. Determina o contexto
    const isCompra = dadosBal.ajuste.valor > 0;
    const isVenda = dadosBal.ajuste.valor < 0;
    
    const modalTitulo = document.getElementById('modal-ativo-detalhes-titulo');
    const modalConteudo = document.getElementById('modal-ativo-detalhes-conteudo');
    const modalFooter = document.querySelector('#modal-ativo-detalhes .form-actions'); 

    // Tradução dos Títulos de Análise de Rebalanceamento
    let tituloAcao = isCompra ? 'Opportunity (Buy)' : (isVenda ? 'Rebalancing (Sell)' : 'In Equilibrium');
    modalTitulo.textContent = `${tituloAcao} Analysis - ${ativo.ticker}`;
    
    // --- CONSTRUÇÃO DO CONTEÚDO ---
    let conteudoHtml = '';

    // SEÇÃO 1: DIAGNÓSTICO DE ALOCAÇÃO
    const percIdeal = dadosBal.ideal.percentualGlobal;
    const percAtual = dadosBal.atual.percentualGlobal;
    const desvio = dadosBal.ajuste.percentual; 
    const classeDesvio = desvio > 0 ? 'valor-positivo' : 'valor-negativo';
    
    const tolerancia = 0.02; 
    const modoAtual = dadosAlocacao.modoRebalanceamento || 'categoria';
    // Tradução: Modos de Alocação
    const textoModo = modoAtual === 'ativo' ? 'By Asset (Individual)' : 'By Category (Hierarchical)';

    conteudoHtml += `
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
            <h4 style="margin-top: 0; color: #495057;">Allocation Diagnostics (${textoModo})</h4>
            <div class="form-grid" style="grid-template-columns: repeat(3, 1fr); gap: 10px; text-align: center;">
                <div><label style="display:block; font-size:0.8em; color:#666;">Target Allocation</label><strong>${formatarPercentual(percIdeal)}</strong></div>
                <div><label style="display:block; font-size:0.8em; color:#666;">Current Allocation</label><strong>${formatarPercentual(percAtual)}</strong></div>
                <div><label style="display:block; font-size:0.8em; color:#666;">Deviation</label><strong class="${classeDesvio}">${formatarPercentual(Math.abs(desvio))} ${desvio > 0 ? '(Below)' : '(Above)'}</strong></div>
            </div>
            <p style="margin-top: 10px; font-size: 0.9em; text-align: center;">
                ${isCompra ? `Capital Required: <strong>${formatarMoeda(dadosBal.ajuste.valor)}</strong>` : `Excess Capital: <strong>${formatarMoeda(Math.abs(dadosBal.ajuste.valor))}</strong>`}
            </p>
        </div>
    `;

    // SEÇÃO 2: LÓGICA ESPECÍFICA
    if (isCompra || (!isCompra && !isVenda)) {
        // --- LÓGICA DE COMPRA ---
        const scores = calcularScoreDeQualidade(ativo, dadosMercado);
        
        conteudoHtml += `
            <h4 style="color: var(--success-color); border-bottom: 2px solid var(--success-color); padding-bottom: 5px;">Prioritization Rationale (Score: ${scores.final.toFixed(0)}/100)</h4>
            <p style="font-size: 0.9em; color: #555; margin-bottom: 15px;">Criteria defining the priority of this asset in the buy queue.</p>
            <table class="dashboard-table">
                <thead><tr><th>Criterion</th><th class="numero">Current Data</th><th class="numero">Score</th></tr></thead>
                <tbody>
        `;

        if (ativo.tipo === 'Ação') {
            const projecaoAnual = calcularProjecaoAnualUnitaria(ticker, { limiteAnos: 5 });
            const yieldProj = (dadosMercado.valor > 0) ? projecaoAnual / dadosMercado.valor : 0;
            const tetoBazin = calcularPrecoTetoBazin(projecaoAnual, ativo.metaYieldBazin || 0.06);
            const payout = (dadosMercado.lpa_acao > 0) ? projecaoAnual / dadosMercado.lpa_acao : 0;
            
            const tipYield = `Projected Yield (${formatarPercentual(yieldProj)}):\nThis value represents the expected return in dividends. Values above 6% earn more points.`;
            const tipBazin = `Bazin Method:\nThe calculated Ceiling Price is ${formatarMoeda(tetoBazin)}. Since the current price is ${formatarMoeda(dadosMercado.valor)}, the margin of safety defines the score.`;
            
            conteudoHtml += `
                <tr><td>Projected Yield <i class="fas fa-question-circle info-icon" data-tooltip="${tipYield}"></i></td><td class="numero">${formatarPercentual(yieldProj)}</td><td class="numero"><strong>${scores.yield.toFixed(0)}</strong> pts</td></tr>
                <tr><td>Bazin Ceiling Price <i class="fas fa-question-circle info-icon" data-tooltip="${tipBazin}"></i></td><td class="numero">Ceiling: ${formatarMoeda(tetoBazin)}</td><td class="numero"><strong>${scores.bazin.toFixed(0)}</strong> pts</td></tr>
                <tr><td>Payout (5%)</td><td class="numero">${formatarPercentual(payout)}</td><td class="numero"><strong>${scores.payout.toFixed(0)}</strong> pts</td></tr>
                <tr><td>Next Ex-Date (15%)</td><td class="numero">${scores.dataCom > 0 ? 'Yes' : 'No'}</td><td class="numero"><strong>${scores.dataCom.toFixed(0)}</strong> pts</td></tr>
            `;
        } else if (ativo.tipo === 'FII') {
            const ultimoProv = getUltimoProvento(ticker);
            const yieldProj = (dadosMercado.valor > 0 && ultimoProv > 0) ? (ultimoProv * 12) / dadosMercado.valor : 0;
            const pvp = (dadosMercado.vpa > 0 && dadosMercado.valor > 0) ? dadosMercado.valor / dadosMercado.vpa : 0;
            
            const tipPVP = `P/BV (${formatarDecimal(pvp)}):\nIndicates if the fund is cheap (below 1.0) or expensive. The system prioritizes discounted funds.`;

            conteudoHtml += `
                <tr><td>Dividend Yield <i class="fas fa-question-circle info-icon" data-tooltip="Annualized projected yield: ${formatarPercentual(yieldProj)}"></i></td><td class="numero">${formatarPercentual(yieldProj)}</td><td class="numero"><strong>${scores.yield.toFixed(0)}</strong> pts</td></tr>
                <tr><td>P/BV <i class="fas fa-question-circle info-icon" data-tooltip="${tipPVP}"></i></td><td class="numero">${formatarDecimal(pvp)}</td><td class="numero"><strong>${scores.pvp.toFixed(0)}</strong> pts</td></tr>
            `;
        }
        conteudoHtml += `</tbody></table>`;

    } else {
        // --- LÓGICA DE VENDA: TOOLTIPS INTELIGENTES ---
        const precoMedio = posicao ? posicao.precoMedio : 0;
        const precoAtual = dadosMercado.valor || 0;
        
        // 1. Análise da Banda de Tolerância
        const estourouTolerancia = Math.abs(desvio) > tolerancia;
        let statusTolerancia = '';
        let tipTolerancia = '';

        if (modoAtual === 'categoria' && !estourouTolerancia) {
             statusTolerancia = '<span style="color:var(--warning-color); font-weight:bold;">IGNORED (Category Rule)</span>';
             tipTolerancia = `Suggestion Reason:\nAlthough the individual deviation (${formatarPercentual(Math.abs(desvio))}) is within the ${formatarPercentual(tolerancia)} band, this asset belongs to a Category (${tipoCategoria}) that exceeded the global target. The system suggests reducing it to rebalance the category.`;
        } else if (estourouTolerancia) {
             statusTolerancia = '<span style="color:var(--danger-color); font-weight:bold;">ABOVE LIMIT</span>';
             tipTolerancia = `Excess Detected:\nThe asset exceeded the tolerance band of ${formatarPercentual(tolerancia)}. Current deviation: ${formatarPercentual(Math.abs(desvio))}. Selling is suggested for rebalancing.`;
        } else {
             statusTolerancia = '<span style="color:var(--success-color); font-weight:bold;">WITHIN BAND</span>';
             tipTolerancia = `Normal Situation:\nThe deviation is within the acceptable limit of ${formatarPercentual(tolerancia)}.`;
        }

        // 2. Análise da Trava de Prejuízo
        const isLucro = precoAtual >= precoMedio;
        const statusLucro = isLucro 
            ? `<span style="color:var(--success-color); font-weight:bold;">CLEARED (Profit)</span>` 
            : `<span style="color:var(--danger-color); font-weight:bold;">BLOCKED (Loss)</span>`;
        
        let tipLucro = '';
        if (!isLucro) {
            tipLucro = `PROTECTION LOCK:\nCurrent Price (${formatarMoeda(precoAtual)}) is LOWER than Average Price (${formatarMoeda(precoMedio)}).\nThe system blocks the sale to avoid realizing financial loss, ignoring the need for rebalancing at this time.`;
        } else {
            tipLucro = `Sale Permitted:\nCurrent Price (${formatarMoeda(precoAtual)}) is HIGHER than Average Price (${formatarMoeda(precoMedio)}).\nThe sale will generate a taxable or exempt profit.`;
        }

        // 3. Trava de Valuation (FIIs)
        let htmlPVP = '';
        if (ativo.tipo === 'FII') {
            const vpa = dadosMercado.vpa || 0;
            const pvp = (vpa > 0 && precoAtual > 0) ? precoAtual / vpa : 0;
            const isPvpOk = pvp >= 1.0; 
            
            const statusPvp = isPvpOk 
                ? `<span style="color:var(--success-color); font-weight:bold;">CLEARED (Premium)</span>` 
                : `<span style="color:var(--warning-color); font-weight:bold;">WARNING (Discount)</span>`;
            
            let tipPVPVenda = '';
            if (!isPvpOk) {
                tipPVPVenda = `Valuation Warning:\nThe fund is trading below its asset value (P/BV ${formatarDecimal(pvp)}). Selling now means giving up assets at a discount.`;
            } else {
                tipPVPVenda = `Adequate Valuation:\nThe fund is trading at a premium (P/BV ${formatarDecimal(pvp)}). Sale cleared from a value perspective.`;
            }
            
            htmlPVP = `<tr>
                <td>Valuation Lock <i class="fas fa-question-circle info-icon" data-tooltip="${tipPVPVenda}"></i></td>
                <td class="numero">P/BV: ${formatarDecimal(pvp)}</td>
                <td class="numero">${statusPvp}</td>
            </tr>`;
        }

        conteudoHtml += `
            <h4 style="color: var(--danger-color); border-bottom: 2px solid var(--danger-color); padding-bottom: 5px;">Sale Audit (Safety Locks)</h4>
            <p style="font-size: 0.9em; color: #555; margin-bottom: 15px;">Detailed analysis of the rules that allow or block the sale.</p>
            
            <table class="dashboard-table">
                <thead><tr><th>Criterion / Rule</th><th class="numero">Asset Data</th><th class="numero">Status</th></tr></thead>
                <tbody>
                    <tr>
                        <td>Tolerance Band <i class="fas fa-question-circle info-icon" data-tooltip="${tipTolerancia}"></i></td>
                        <td class="numero">Excess: ${formatarPercentual(Math.abs(desvio))}</td>
                        <td class="numero">${statusTolerancia}</td>
                    </tr>
                    <tr>
                        <td>Loss Lock <i class="fas fa-question-circle info-icon" data-tooltip="${tipLucro}"></i></td>
                        <td class="numero">Avg: <strong>${formatarMoeda(precoMedio)}</strong> <br> Cur: <strong>${formatarMoeda(precoAtual)}</strong></td>
                        <td class="numero">${statusLucro}</td>
                    </tr>
                    ${htmlPVP}
                </tbody>
            </table>
        `;
    }

    modalConteudo.innerHTML = conteudoHtml;
    
    if (modalFooter) {
        modalFooter.innerHTML = '<p class="info-esc" style="margin: 0; width: 100%; text-align: center;">Click outside to close</p>';
    }

    document.getElementById('modal-ativo-detalhes').style.display = 'block';
}


function abrirModalPerformance(tipoAtivo) {
    const modal = document.getElementById('modal-performance-detalhes');
    const tituloModal = modal.querySelector('h3');
    const container = modal.querySelector('div[id^="modal-"]');
    
    // Tradução dos Títulos do Modal
    let tituloFormatado = tipoAtivo;
    if (tipoAtivo === 'Renda Variável') tituloFormatado = 'Variable Income';
    if (tipoAtivo === 'Ação') tituloFormatado = 'Shares';
    if (tipoAtivo === 'FII') tituloFormatado = 'REITs';
    if (tipoAtivo === 'ETF') tituloFormatado = 'ETFs';

    const titulo = tipoAtivo === 'Renda Variável' ? tituloFormatado : `${tituloFormatado}`;
    tituloModal.textContent = `Performance Analysis - ${titulo}`;
    container.innerHTML = '<h4>Calculating...</h4>';
    abrirModal('modal-performance-detalhes');

    const hoje = new Date().toISOString().split('T')[0];
    const posicoesAtuais = gerarPosicaoDetalhada();
    
    const tiposConsiderados = (tipoAtivo === 'Renda Variável') ? ['Ação', 'FII', 'ETF'] : [tipoAtivo];
    const ativosAtuaisNaCategoria = todosOsAtivos
        .filter(a => tiposConsiderados.includes(a.tipo) && posicoesAtuais[a.ticker]?.quantidade > 0.000001)
        .map(a => a.ticker);

    if (ativosAtuaisNaCategoria.length === 0) {
        container.innerHTML = `<p>No positions in ${titulo} to analyze.</p>`;
        return;
    }

    const datasInicioMap = new Map();
    ativosAtuaisNaCategoria.forEach(ticker => {
        datasInicioMap.set(ticker, getInicioIninterrupto(ticker));
    });

    const resultadosRealizadosMap = calcularResultadosRealizados(ativosAtuaisNaCategoria, datasInicioMap);
    
    const proventosCategoria = todosOsProventos.filter(p => ativosAtuaisNaCategoria.includes(p.ticker) && new Date(p.dataPagamento) >= new Date(datasInicioMap.get(p.ticker)));
    const totalDividendosCategoria = proventosCategoria.reduce((soma, p) => soma + p.valorTotalRecebido, 0);

    const custoTotalCategoria = ativosAtuaisNaCategoria.reduce((soma, ticker) => soma + (posicoesAtuais[ticker].quantidade * posicoesAtuais[ticker].precoMedio), 0);
    const mercadoTotalCategoria = ativosAtuaisNaCategoria.reduce((soma, ticker) => {
        const cotacao = dadosDeMercado.cotacoes[ticker]?.valor || posicoesAtuais[ticker].precoMedio;
        return soma + (posicoesAtuais[ticker].quantidade * cotacao);
    }, 0);

    const ganhoCapitalCategoria = mercadoTotalCategoria - custoTotalCategoria;
    const realizadosTotalCategoria = Array.from(resultadosRealizadosMap.values()).reduce((soma, v) => soma + v, 0);
    const retornoTotalCategoria = ganhoCapitalCategoria + realizadosTotalCategoria + totalDividendosCategoria;
    
    let fluxosAgregados = [], datasAgregadas = [];
    ativosAtuaisNaCategoria.forEach(ticker => {
        const dataInicio = datasInicioMap.get(ticker);
        let { fluxos, datas } = construirFluxoDeCaixa([ticker], hoje);
        if (dataInicio) {
            for (let i = 0; i < datas.length; i++) {
                if (new Date(datas[i]) >= new Date(dataInicio)) {
                    fluxosAgregados.push(fluxos[i]);
                    datasAgregadas.push(datas[i]);
                }
            }
        }
    });
    
    if(fluxosAgregados.length > 0) {
        fluxosAgregados.push(mercadoTotalCategoria);
        datasAgregadas.push(hoje);
    }
    const tirAgregada = calcularTIR(fluxosAgregados, datasAgregadas);

    let htmlFinal = `
        <h4>Consolidated Category Performance</h4>
        <table class="dashboard-table">
            <thead>
                <tr>
                    <th>Metric</th>
                    <th class="numero">Value (R$)</th>
                    <th class="percentual">% over Cost</th>
                </tr>
            </thead>
            <tbody>
                <tr><td>Total Contribution Cost</td><td class="numero">${formatarMoeda(custoTotalCategoria)}</td><td class="percentual"></td></tr>
                <tr><td>Capital Gain/Loss (Unrealized)</td><td class="numero ${ganhoCapitalCategoria >= 0 ? 'valor-positivo' : 'valor-negativo'}">${formatarMoeda(ganhoCapitalCategoria)}</td><td class="percentual ${ganhoCapitalCategoria >= 0 ? 'valor-positivo' : 'valor-negativo'}">${formatarPercentual(ganhoCapitalCategoria / custoTotalCategoria)}</td></tr>
                <tr><td>Realized Results (in period)</td><td class="numero ${realizadosTotalCategoria >= 0 ? 'valor-positivo' : 'valor-negativo'}">${formatarMoeda(realizadosTotalCategoria)}</td><td class="percentual ${realizadosTotalCategoria >= 0 ? 'valor-positivo' : 'valor-negativo'}">${formatarPercentual(realizadosTotalCategoria / custoTotalCategoria)}</td></tr>
                <tr><td>Dividends/Yields Received</td><td class="numero valor-positivo">${formatarMoeda(totalDividendosCategoria)}</td><td class="percentual valor-positivo">${formatarPercentual(totalDividendosCategoria / custoTotalCategoria)}</td></tr>
                <tr class="total-row"><td>Total Return</td><td class="numero ${retornoTotalCategoria >= 0 ? 'valor-positivo' : 'valor-negativo'}">${formatarMoeda(retornoTotalCategoria)}</td><td class="percentual ${retornoTotalCategoria >= 0 ? 'valor-positivo' : 'valor-negativo'}">${formatarPercentual(retornoTotalCategoria / custoTotalCategoria)}</td></tr>
                <tr><td>Annualized IRR (MWRR)</td><td colspan="2" class="percentual ${tirAgregada >= 0 ? 'valor-positivo' : 'valor-negativo'}">${!isNaN(tirAgregada) ? formatarPercentual(tirAgregada) : 'N/A'}</td></tr>
            </tbody>
        </table>
        <hr style="margin: 25px 0;">
        <h4>Individual Asset Performance</h4>
        <table class="dashboard-table">
            <thead>
                <tr>
                    <th>Asset</th>
                    <th class="numero">Total Cost</th>
                    <th class="numero">Market Value</th>
                    <th class="numero">Var. (R$)</th>
                    <th class="numero">Realized Res.</th>
                    <th class="numero">Dividends</th>
                    <th class="numero">Total Return</th>
                    <th class="percentual">Ann. IRR</th>
                </tr>
            </thead>
            <tbody>`;

    const resultadosIndividuais = [];
    ativosAtuaisNaCategoria.forEach(ticker => {
        const posicao = posicoesAtuais[ticker];
        const cotacao = dadosDeMercado.cotacoes[ticker]?.valor || posicao.precoMedio;
        
        const custoTotal = posicao.quantidade * posicao.precoMedio;
        const valorMercado = posicao.quantidade * cotacao;
        const ganhoCapital = valorMercado - custoTotal;
        const dataInicio = datasInicioMap.get(ticker);

        const dividendosAtivo = todosOsProventos
            .filter(p => p.ticker === ticker && new Date(p.dataPagamento) >= new Date(dataInicio))
            .reduce((soma, p) => soma + p.valorTotalRecebido, 0);
        
        const resultadoRealizado = resultadosRealizadosMap.get(ticker) || 0;
        const retornoTotal = ganhoCapital + resultadoRealizado + dividendosAtivo;
        
        let { fluxos, datas } = construirFluxoDeCaixa([ticker], hoje);
        if (dataInicio) {
            const fluxosFiltrados = [], datasFiltradas = [];
            for (let i = 0; i < datas.length; i++) {
                if (new Date(datas[i]) >= new Date(dataInicio)) {
                    fluxosFiltrados.push(fluxos[i]);
                    datasFiltradas.push(datas[i]);
                }
            }
            fluxos = fluxosFiltrados;
            datas = datasFiltradas;
        }

        if(fluxos.length > 0) {
            fluxos.push(valorMercado);
            datas.push(hoje);
        }
        const tir = calcularTIR(fluxos, datas);
        
        resultadosIndividuais.push({ ticker, custoTotal, valorMercado, ganhoCapital, resultadoRealizado, dividendosAtivo, retornoTotal, tir });
    });

    resultadosIndividuais.sort((a,b) => b.valorMercado - a.valorMercado).forEach(res => {
        const classeGanhoCapital = res.ganhoCapital >= 0 ? 'valor-positivo' : 'valor-negativo';
        const classeRealizado = res.resultadoRealizado >= 0 ? 'valor-positivo' : 'valor-negativo';
        const classeRetorno = res.retornoTotal >= 0 ? 'valor-positivo' : 'valor-negativo';
        const classeTir = res.tir >= 0 ? 'valor-positivo' : 'valor-negativo';

        htmlFinal += `
            <tr>
                <td>${res.ticker}</td>
                <td class="numero">${formatarMoeda(res.custoTotal)}</td>
                <td class="numero">${formatarMoeda(res.valorMercado)}</td>
                <td class="numero ${classeGanhoCapital}">${formatarMoeda(res.ganhoCapital)}</td>
                <td class="numero ${classeRealizado}">${formatarMoeda(res.resultadoRealizado)}</td>
                <td class="numero">${formatarMoeda(res.dividendosAtivo)}</td>
                <td class="numero ${classeRetorno}">${formatarMoeda(res.retornoTotal)}</td>
                <td class="percentual ${classeTir}">${!isNaN(res.tir) ? formatarPercentual(res.tir) : 'N/A'}</td>
            </tr>`;
    });

    htmlFinal += `</tbody></table>`;
    container.innerHTML = htmlFinal;
}

function gerarHtmlCalendarioFIIs() {
    const tickersFIIs = todosOsAtivos.filter(a => a.tipo === 'FII').map(a => a.ticker);
    const proventosFIIs = todosOsProventos.filter(p => tickersFIIs.includes(p.ticker));

    if (proventosFIIs.length === 0) {
        return '<p>No REIT yield records found.</p>';
    }

    const proventosPorAno = proventosFIIs.reduce((acc, provento) => {
        const ano = new Date(provento.dataPagamento + 'T12:00:00').getUTCFullYear();
        if (!acc[ano]) acc[ano] = [];
        acc[ano].push(provento);
        return acc;
    }, {});

    const anosOrdenados = Object.keys(proventosPorAno).sort((a, b) => b - a);
    let htmlFinal = '';

    anosOrdenados.forEach(ano => {
        const proventosDoAno = proventosPorAno[ano];
        const tickersDoAno = [...new Set(proventosDoAno.map(p => p.ticker))].sort();
        const totaisMensais = Array(12).fill(0);
        
        htmlFinal += `<div class="calendario-ano"><h4>${ano}</h4><div class="tabela-projecao-wrapper"><table>`;
        htmlFinal += `<thead><tr><th class="col-ativo">Asset</th>`;
        const meses = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        meses.forEach(mes => htmlFinal += `<th class="col-mes">${mes.toUpperCase()}</th>`);
        htmlFinal += `</tr></thead><tbody>`;

        tickersDoAno.forEach(ticker => {
            const link = linksExternos.fiis ? `<a href="${linksExternos.fiis}${ticker}" target="_blank" class="ticker-link">${ticker}</a>` : ticker;
            htmlFinal += `<tr><td class="col-ativo">
                    ${link}
                    <i class="fas fa-plus-circle acao-btn btn-adicionar-provento-ticker" 
                       data-ticker="${ticker}" 
                       title="Record income for ${ticker}"></i>
                  </td>`;

            for (let mes = 0; mes < 12; mes++) {
                const proventosDoMes = proventosDoAno.filter(p => p.ticker === ticker && new Date(p.dataPagamento + 'T12:00:00').getUTCMonth() === mes);
                htmlFinal += `<td>`;
                if (proventosDoMes.length > 0) {
                    proventosDoMes.forEach(provento => {
                        totaisMensais[mes] += provento.valorTotalRecebido;
                        htmlFinal += `
                            <div class="provento-item-container" data-provento-id="${provento.id}">
                                <div class="provento-item">
                                    <div class="provento-valor-total">${formatarMoeda(provento.valorTotalRecebido)}</div>
                                    <div class="provento-detalhe" title="Share quantity and yield per share">(${Math.round(provento.quantidadeNaDataCom)} x ${formatarMoeda(provento.valorIndividual)})</div>
                                    <div class="provento-detalhe" title="Yield on Cost">YOC: ${formatarPercentual(provento.yieldOnCost)}</div>
                                </div>
                                <div class="provento-acoes" style="display: none;">
                                    <i class="fas fa-edit acao-btn edit" title="Edit Income"></i>
                                    <i class="fas fa-trash acao-btn delete" title="Delete Income"></i>
                                </div>
                            </div>
                        `;
                    });
                }
                htmlFinal += `</td>`;
            }
            htmlFinal += `</tr>`;
        });
        
        htmlFinal += `<tr class="calendario-total-row"><td class="col-ativo">TOTAL</td>`;
        for (let mes = 0; mes < 12; mes++) {
            htmlFinal += `<td class="numero">${totaisMensais[mes] > 0 ? formatarMoeda(totaisMensais[mes]) : ''}</td>`;
        }
        htmlFinal += `</tr></tbody></table></div></div>`;
    });

    return htmlFinal;
}
function gerarHtmlCalendarioAcoes() {
    const tickersRelevantes = todosOsAtivos.filter(a => a.tipo === 'Ação' || a.tipo === 'ETF').map(a => a.ticker);
    const proventosRelevantes = todosOsProventos.filter(p => tickersRelevantes.includes(p.ticker));

    if (proventosRelevantes.length === 0) {
        return '<p>No Share or ETF dividend records found for the calendar.</p>';
    }

    const proventosPorAno = proventosRelevantes.reduce((acc, provento) => {
        const ano = new Date(provento.dataPagamento + 'T12:00:00').getUTCFullYear();
        if (!acc[ano]) acc[ano] = [];
        acc[ano].push(provento);
        return acc;
    }, {});

    const anosOrdenados = Object.keys(proventosPorAno).sort((a, b) => b - a);
    let htmlFinal = '';

    anosOrdenados.forEach(ano => {
        const proventosDoAno = proventosPorAno[ano];
        const tickersDoAno = [...new Set(proventosDoAno.map(p => p.ticker))].sort();
        const totaisMensais = Array(12).fill(0);

        htmlFinal += `<div class="calendario-ano"><h4>${ano}</h4><div class="tabela-projecao-wrapper"><table>`;
        htmlFinal += `<thead><tr><th class="col-ativo">Asset</th>`;
        const meses = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        meses.forEach(mes => htmlFinal += `<th class="col-mes">${mes.toUpperCase()}</th>`);
        htmlFinal += `</tr></thead><tbody>`;

        tickersDoAno.forEach(ticker => {
            const link = linksExternos.acoes ? `<a href="${linksExternos.acoes}${ticker}" target="_blank" class="ticker-link">${ticker}</a>` : ticker;
            htmlFinal += `<tr><td class="col-ativo">
                    ${link}
                    <i class="fas fa-plus-circle acao-btn btn-adicionar-provento-ticker" 
                       data-ticker="${ticker}" 
                       title="Record income for ${ticker}"></i>
                  </td>`;

            for (let mes = 0; mes < 12; mes++) {
                const proventosDoMes = proventosDoAno.filter(p => p.ticker === ticker && new Date(p.dataPagamento + 'T12:00:00').getUTCMonth() === mes);
                htmlFinal += `<td>`;
                if (proventosDoMes.length > 0) {
                    proventosDoMes.forEach(provento => {
                        totaisMensais[mes] += provento.valorTotalRecebido;
                        
                        let tipoProvFmt = provento.tipo;
                        if (provento.tipo === 'Rendimento') tipoProvFmt = 'Yield';
                        if (provento.tipo === 'Dividendo') tipoProvFmt = 'Dividend';
                        if (provento.tipo === 'Bonificação') tipoProvFmt = 'Bonus';
                        if (provento.tipo === 'Outros') tipoProvFmt = 'Others';

                        htmlFinal += `
                            <div class="provento-item-container" data-provento-id="${provento.id}">
                                <div class="provento-item">
                                    <div class="provento-valor-total">${tipoProvFmt}: ${formatarMoeda(provento.valorTotalRecebido)}</div>
                                    <div class="provento-detalhe" title="Share quantity and yield per share">(${Math.round(provento.quantidadeNaDataCom)} x ${formatarMoeda(provento.valorIndividual)})</div>
                                    <div class="provento-detalhe" title="Yield on Cost">YOC: ${formatarPercentual(provento.yieldOnCost)}</div>
                                </div>
                                <div class="provento-acoes" style="display: none;">
                                    <i class="fas fa-edit acao-btn edit" title="Edit Income"></i>
                                    <i class="fas fa-trash acao-btn delete" title="Delete Income"></i>
                                </div>
                            </div>
                        `;
                    });
                }
                htmlFinal += `</td>`;
            }
            htmlFinal += `</tr>`;
        });

        htmlFinal += `<tr class="calendario-total-row"><td class="col-ativo">TOTAL</td>`;
        for (let mes = 0; mes < 12; mes++) {
            htmlFinal += `<td class="numero">${totaisMensais[mes] > 0 ? formatarMoeda(totaisMensais[mes]) : ''}</td>`;
        }
        htmlFinal += `</tr></tbody></table></div></div>`;
    });
    return htmlFinal;
}

function renderizarTelaRendaVariavel() {
    mostrarTela('rendaVariavel');
    const container = document.getElementById('posicao-rv-container');
    const summaryContainer = document.getElementById('summary-rv');
    
    const filtroCorretoraSelect = document.getElementById('rv-filtro-corretora');
    const filtroDataInput = document.getElementById('rv-filtro-data');

    if (!filtroDataInput.value) {
        filtroDataInput.value = new Date().toISOString().split('T')[0];
    }
    const filtroData = filtroDataInput.value;

    // --- Início da Nova Lógica ---
    const corretoraSelecionadaAnteriormente = filtroCorretoraSelect.value;
    const corretorasDaData = getCorretorasComPosicaoNaData(filtroData);
    
    let optionsHtml = '<option value="consolidado">Consolidated</option>';
    optionsHtml += corretorasDaData.map(c => `<option value="${c}">${c}</option>`).join('');
    filtroCorretoraSelect.innerHTML = optionsHtml;

    // Tenta preservar a seleção anterior
    const novaListaDeOpcoes = Array.from(filtroCorretoraSelect.options).map(opt => opt.value);
    if (novaListaDeOpcoes.includes(corretoraSelecionadaAnteriormente)) {
        filtroCorretoraSelect.value = corretoraSelecionadaAnteriormente;
    }
    const filtroCorretora = filtroCorretoraSelect.value;
    // --- Fim da Nova Lógica ---

    const posicoesDetalhadas = gerarPosicaoDetalhada(filtroData);
    const valorTotalCarteira = calcularValorTotalCarteira(filtroData);
    
    let htmlGerado = '';
    let custoTotalRV = 0;
    let valorMercadoRV = 0;

    ['FII', 'Ação', 'ETF'].forEach(tipo => {
        const dadosTabela = gerarHtmlTabelaAtivos(tipo, posicoesDetalhadas, filtroCorretora, valorTotalCarteira);
        if (dadosTabela.html) {
            htmlGerado += dadosTabela.html; // AQUI ESTÁ A CORREÇÃO
            
            custoTotalRV += dadosTabela.custoTotal;
            valorMercadoRV += dadosTabela.valorMercado;
        }
    });

    if (htmlGerado === '') {
        container.innerHTML = '<p style="text-align: center;">No Variable Income position found for the selected filters.</p>';
        summaryContainer.innerHTML = '';
    } else {
        container.innerHTML = htmlGerado;
        const desempenhoValor = valorMercadoRV - custoTotalRV;
        const desempenhoPercentual = custoTotalRV > 0 ? desempenhoValor / custoTotalRV : 0;
        const classeDesempenho = desempenhoValor >= 0 ? 'valor-positivo' : 'valor-negativo';
        const setaDesempenho = desempenhoValor >= 0 ? '↑' : '↓';
        
        const alocacaoRVPercentual = valorTotalCarteira > 0 ? valorMercadoRV / valorTotalCarteira : 0;

        summaryContainer.innerHTML = `
            <div class="summary-item">Total Cost (VI) <span>${formatarMoeda(custoTotalRV)}</span></div>
            <div class="summary-item">Market Value (VI) <span>${formatarMoeda(valorMercadoRV)}</span></div>
            <div class="summary-item">Portfolio Allocation <span>${formatarPercentual(alocacaoRVPercentual)}</span></div>
            <div class="summary-item">Performance (VI) <span class="${classeDesempenho}">${formatarMoeda(desempenhoValor)} <span class="desempenho-percentual">${formatarPercentual(desempenhoPercentual)} ${setaDesempenho}</span></span></div>
        `;
        
        container.querySelectorAll('th.sortable').forEach(header => {
            const table = header.closest('table');
            if (table) {
                const tipoAtivo = table.dataset.tipoAtivo;
                const sortConfig = sortConfigRendaVariavel[tipoAtivo];
                if (sortConfig && header.dataset.key === sortConfig.key) {
                    header.classList.add(sortConfig.direction);
                }
            }
        });
    }

    renderizarFiltroAtivoInfo(filtroCorretora, 'filtro-info-rv');
}

function renderizarFiltroAtivoInfo(filtroCorretora, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = ''; // Limpa o container

    const textoElement = document.createElement('span');
    textoElement.className = 'logo-texto'; // Mantemos a classe por enquanto

    if (filtroCorretora === 'consolidado') {
        textoElement.textContent = 'Consolidated';
    } else {
        textoElement.textContent = filtroCorretora;
    }

    container.appendChild(textoElement);
}

function abrirModalCalendarioProventos() {
    const container = document.getElementById('calendario-container');
    container.innerHTML = '<h4>Carregando calendário...</h4>';
    
    // Agora apenas chama a função auxiliar para gerar o HTML
    const htmlFinal = gerarHtmlCalendarioFIIs();
    container.innerHTML = htmlFinal;

    container.querySelectorAll('.provento-item-container').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const target = e.target;
            const acoesDiv = item.querySelector('.provento-acoes');

            if (target.closest('.acao-btn')) {
                const proventoId = parseFloat(item.dataset.proventoId);
                if (target.closest('.edit')) {
                    const provento = todosOsProventos.find(p => p.id === proventoId);
                    if (provento) {
                        retornoModalProvento = 'calendario-fiis';
                        abrirModalLancamentoProvento(provento);
                    }
                } else if (target.closest('.delete')) {
                    deletarProvento(proventoId);
                }
            } else { 
                document.querySelectorAll('.provento-acoes').forEach(el => {
                    if (el !== acoesDiv) el.style.display = 'none';
                });
                acoesDiv.style.display = acoesDiv.style.display === 'flex' ? 'none' : 'flex';
            }
        });
    });
    
    abrirModal('modal-proventos-calendario');
}
function abrirModalCalendarioProventosAcoes() {
    const container = document.getElementById('calendario-container-acoes');
    container.innerHTML = '<h4>Carregando calendário...</h4>';

    // Agora apenas chama a função auxiliar para gerar o HTML
    const htmlFinal = gerarHtmlCalendarioAcoes();
    container.innerHTML = htmlFinal;
    
    container.querySelectorAll('.provento-item-container').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const target = e.target;
            const acoesDiv = item.querySelector('.provento-acoes');

            if (target.closest('.acao-btn')) {
                const proventoId = parseFloat(item.dataset.proventoId);
                const provento = todosOsProventos.find(p => p.id === proventoId);
                if (provento) {
                    if (target.closest('.edit')) {
                        retornoModalProvento = 'calendario-acoes';
                        abrirModalLancamentoProvento(provento);
                    } else if (target.closest('.delete')) {
                        deletarProvento(provento.id);
                    }
                }
            } else {
                document.querySelectorAll('.provento-acoes').forEach(el => {
                    if (el !== acoesDiv) el.style.display = 'none';
                });
                acoesDiv.style.display = acoesDiv.style.display === 'flex' ? 'none' : 'flex';
            }
        });
    });

    abrirModal('modal-proventos-calendario-acoes');
}

function isLeap(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function gerarDadosProventosAnuais() {
    const resultados = {};
    const anoAtual = new Date().getFullYear();
    const hoje = new Date();
    
    // Helper para inicializar um ano no objeto de resultados
    const initAno = (ano) => {
        if (!resultados[ano]) {
            resultados[ano] = { 'Ação': 0, 'FII': 0, 'ETF': 0, 'Renda Fixa': 0, 'Total RV': 0, 'Total Geral': 0, 'MediaDiaria': 0, 'MediaMensal': 0, isProjected: false, isFuture: false };
        }
    };

    // 1. Processa Renda Variável
    todosOsProventos.forEach(p => {
        if (!p.dataPagamento) return;
        const ano = new Date(p.dataPagamento + 'T12:00:00').getUTCFullYear();
        initAno(ano);
        const ativo = todosOsAtivos.find(a => a.ticker === p.ticker);
        if (ativo && ativo.tipo) {
            resultados[ano][ativo.tipo] += p.valorTotalRecebido;
        }
    });

    // 2. Processa Renda Fixa (Incremental)
    const rendimentosRFPorAtivo = {};
    todosOsRendimentosRFNaoRealizados.forEach(r => {
        const ativoRF = todosOsAtivosRF.find(a => a.id === r.ativoId);
        if (!ativoRF) return;
        if (!rendimentosRFPorAtivo[r.ativoId]) rendimentosRFPorAtivo[r.ativoId] = {};
        const chaveMes = r.data.substring(0, 7);
        if (!rendimentosRFPorAtivo[r.ativoId][chaveMes]) rendimentosRFPorAtivo[r.ativoId][chaveMes] = [];
        rendimentosRFPorAtivo[r.ativoId][chaveMes].push(r.rendimento);
    });

    for (const ativoId in rendimentosRFPorAtivo) {
        let ultimoRendimento = 0;
        Object.keys(rendimentosRFPorAtivo[ativoId]).sort().forEach(chaveMes => {
            const ano = parseInt(chaveMes.substring(0, 4));
            const rendimentosDoMes = rendimentosRFPorAtivo[ativoId][chaveMes];
            const rendimentoFinalMes = rendimentosDoMes[rendimentosDoMes.length - 1];
            const rendimentoIncremental = rendimentoFinalMes - ultimoRendimento;
            initAno(ano);
            resultados[ano]['Renda Fixa'] += rendimentoIncremental;
            ultimoRendimento = rendimentoFinalMes;
        });
    }

    // 3. Consolida e calcula as médias
    Object.keys(resultados).sort().forEach(anoStr => {
        const ano = parseInt(anoStr);
        const res = resultados[ano];
        res['Total RV'] = res['Ação'] + res['FII'] + res['ETF'];
        res['Total Geral'] = res['Total RV'] + res['Renda Fixa'];

        const diasNoAno = isLeap(ano) ? 366 : 365;

        if (ano < anoAtual) {
            res['MediaMensal'] = res['Total Geral'] / 12;
            res['MediaDiaria'] = res['Total Geral'] / diasNoAno;
        } else if (ano === anoAtual) {
            const inicioDoAno = new Date(ano, 0, 1);
            const diasPercorridos = Math.ceil((hoje - inicioDoAno) / (1000 * 60 * 60 * 24));
            const totalProjetado = (res['Total Geral'] / diasPercorridos) * diasNoAno;
            res['MediaMensal'] = totalProjetado / 12;
            res['MediaDiaria'] = totalProjetado / diasNoAno;
            res.isProjected = true;
        } else { // ano > anoAtual
             res['MediaMensal'] = res['Total Geral'] / 12;
             res['MediaDiaria'] = res['Total Geral'] / diasNoAno;
             res.isFuture = true;
        }
    });

    return resultados;
}


function obterProventosFiltrados() {
    const filtroAtivo = document.getElementById('provento-filtro-ativo').value.toUpperCase();
    const filtroTipo = document.getElementById('provento-filtro-tipo').value;
    const filtroStatus = document.getElementById('provento-filtro-status').value;
    const filtroDataDe = document.getElementById('provento-filtro-data-de').value;
    let filtroDataAte = document.getElementById('provento-filtro-data-ate').value;
    const filtroPosicao = document.getElementById('provento-filtro-posicao').value;

    if (filtroDataDe && !filtroDataAte) {
        filtroDataAte = new Date().toISOString().split('T')[0];
    }

    let posicoesAtuais;
    if (filtroPosicao !== 'todos') {
        posicoesAtuais = gerarPosicaoDetalhada();
    }

    const proventosFiltrados = todosOsProventos.filter(p => {
        if (filtroDataDe && p.dataCom < filtroDataDe) return false;
        if (filtroDataAte && p.dataCom > filtroDataAte) return false;
        if (filtroAtivo && !p.ticker.toUpperCase().includes(filtroAtivo)) return false;
        if (filtroTipo !== 'todos') {
            const ativo = todosOsAtivos.find(a => a.ticker === p.ticker);
            if (!ativo || ativo.tipo !== filtroTipo) return false;
        }
        if (filtroStatus !== 'todos') {
            const dataPagamento = new Date(p.dataPagamento + 'T12:00:00');
            const hojeMeiaNoite = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00');
            if (filtroStatus === 'receber' && dataPagamento < hojeMeiaNoite) return false;
            if (filtroStatus === 'recebido' && dataPagamento >= hojeMeiaNoite) return false;
        }

        if (filtroPosicao === 'em_carteira') {
            if (!posicoesAtuais[p.ticker] || posicoesAtuais[p.ticker].quantidade < 0.000001) {
                return false;
            }
        } else if (filtroPosicao === 'zerados') {
            if (posicoesAtuais[p.ticker] && posicoesAtuais[p.ticker].quantidade > 0.000001) {
                return false;
            }
        }
        
        return true;
    });
    return proventosFiltrados;
}

function getUltimoProventoHistorico(ticker, dataLimite) {
    const proventosDoAtivo = todosOsProventos
        .filter(p => p.ticker === ticker && p.valorIndividual > 0 && p.dataCom && p.dataCom <= dataLimite)
        .sort((a, b) => new Date(b.dataCom) - new Date(a.dataCom));

    return proventosDoAtivo.length > 0 ? proventosDoAtivo[0].valorIndividual : 0;
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

function gerarRelatorioPosicoesZeradas() {
    const todosOsEventos = [];
    posicaoInicial.forEach(p => todosOsEventos.push({ data: p.data, tipo: p.tipoRegistro, payload: p }));
    todasAsNotas.forEach(n => n.operacoes.forEach(op => todosOsEventos.push({ data: n.data, tipo: 'OPERACAO_NOTA', payload: { ...op, corretora: n.corretora } })));
    // --- INÍCIO DA CORREÇÃO ---
    // Adiciona os ajustes (incluindo eventos de entrada/saída) à lista de eventos a serem processados.
    todosOsAjustes.forEach(a => todosOsEventos.push({ data: a.data, tipo: a.tipoAjuste, payload: a }));
    // --- FIM DA CORREÇÃO ---

    todosOsEventos.sort((a,b) => new Date(a.data) - new Date(b.data));

    const todosOsTickers = [...new Set(todosOsEventos.map(e => e.payload.ticker || e.payload.ativo))].filter(Boolean);
    const relatorio = [];

    todosOsTickers.forEach(ticker => {
        if (!ticker) return;

        const eventosDoAtivo = todosOsEventos.filter(e => (e.payload.ticker || e.payload.ativo) === ticker);
        if (eventosDoAtivo.length === 0) return;

        let quantidade = 0;
        let dataInicioCiclo = null;

        eventosDoAtivo.forEach(evento => {
            const payload = evento.payload;
            let qtdOperacao = 0;
            let tipoOperacao = '';

            switch(evento.tipo) {
                case 'SUMARIO_MANUAL':
                case 'TRANSACAO_HISTORICA':
                    tipoOperacao = payload.transacao ? payload.transacao.toLowerCase() : 'compra';
                    qtdOperacao = payload.quantidade;
                    break;
                case 'OPERACAO_NOTA':
                    tipoOperacao = payload.tipo;
                    qtdOperacao = payload.quantidade;
                    break;
                // --- INÍCIO DA CORREÇÃO ---
                // Adiciona o caso para tratar os eventos de ativo
                case 'evento_ativo':
                    if (payload.tipoEvento === 'saida') {
                        tipoOperacao = 'venda'; // Trata como uma venda para fins de contagem de quantidade
                        qtdOperacao = payload.detalhes.reduce((acc, d) => acc + d.quantidade, 0);
                    } else if (payload.tipoEvento === 'entrada') {
                        tipoOperacao = 'compra';
                        qtdOperacao = payload.detalhes.reduce((acc, d) => acc + d.quantidade, 0);
                    }
                    break;
                // --- FIM DA CORREÇÃO ---
            }

            const qtdAnterior = quantidade;

            if (tipoOperacao === 'compra') {
                quantidade += qtdOperacao;
                // Se a posição anterior era zero, um novo ciclo de investimento começou.
                if (qtdAnterior <= 0.000001 && quantidade > 0.000001) {
                    dataInicioCiclo = evento.data;
                }
            } else if (tipoOperacao === 'venda') {
                quantidade -= qtdOperacao;
                // Se a posição anterior era positiva e agora é zero, o ciclo de investimento encerrou.
                if (qtdAnterior > 0.000001 && quantidade <= 0.000001) {
                    if (dataInicioCiclo) { // Garante que temos um início para este ciclo que está terminando
                        relatorio.push({
                            ticker: ticker,
                            dataInicio: dataInicioCiclo,
                            dataEncerramento: evento.data
                        });
                        dataInicioCiclo = null; // Reseta para o próximo ciclo
                    }
                }
            }
        });
    });

    return relatorio;
}


function renderizarCalendarioAcoes() {
    const subtituloDataCom = document.getElementById('subtitulo-datacom');
    const subtituloDataPag = document.getElementById('subtitulo-datapagamento');
    const container = document.getElementById('calendario-acoes-container');
    
    // Lógica principal: agora lê da nossa variável de estado
    const tipoData = tipoVistaCalendarioAcoes;

    // Atualiza o estilo dos títulos (esta parte da lógica se mantém)
    if (tipoData === 'dataCom') {
        subtituloDataCom.classList.add('ativo');
        subtituloDataPag.classList.remove('ativo');
    } else {
        subtituloDataCom.classList.remove('ativo');
        subtituloDataPag.classList.add('ativo');
    }    
    container.innerHTML = '<h4>Carregando calendário...</h4>';

    const tickersAcoes = new Set(todosOsAtivos.filter(a => a.tipo === 'Ação').map(a => a.ticker));
    const proventosAcoes = todosOsProventos.filter(p => tickersAcoes.has(p.ticker));

    if (proventosAcoes.length === 0) {
        container.innerHTML = '<p>Nenhum provento de Ações encontrado para gerar o calendário.</p>';
        return;
    }

    const proventosPorAnoMes = {};
    proventosAcoes.forEach(provento => {
        const dataDoEvento = provento[tipoData];
        if (!dataDoEvento) return;

        const data = new Date(dataDoEvento + 'T12:00:00');
        const ano = data.getUTCFullYear();
        const mes = data.getUTCMonth();

        if (!proventosPorAnoMes[ano]) proventosPorAnoMes[ano] = Array.from({ length: 12 }, () => ({}));
        
        if (!proventosPorAnoMes[ano][mes][provento.ticker]) {
            proventosPorAnoMes[ano][mes][provento.ticker] = [];
        }
        proventosPorAnoMes[ano][mes][provento.ticker].push(provento);
    });

    const anosOrdenados = Object.keys(proventosPorAnoMes).sort((a, b) => b - a);
    let htmlFinal = '';
    const mesesCabecalho = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    anosOrdenados.forEach(ano => {
        const dadosAno = proventosPorAnoMes[ano];
        const maxEventosPorMes = Math.max(...dadosAno.map(mesObj => Object.keys(mesObj).length));

        htmlFinal += `<div class="calendario-ano-container"><h3>${ano}</h3>`;
        htmlFinal += `<table class="calendario-datacom-table"><thead><tr>`;
        mesesCabecalho.forEach(mes => htmlFinal += `<th>${mes}</th>`);
        htmlFinal += `</tr></thead><tbody>`;

        if (maxEventosPorMes === 0) {
            htmlFinal += '<tr><td colspan="12" style="height: 40px; text-align: center; font-style: italic; color: #888;">Nenhum evento neste ano.</td></tr>';
        } else {
            for (let i = 0; i < maxEventosPorMes; i++) {
                htmlFinal += '<tr>';
                for (let j = 0; j < 12; j++) {
                    const proventosDoMesPorTicker = dadosAno[j] || {};
                    const tickersDoMes = Object.keys(proventosDoMesPorTicker).sort();
                    const ticker = tickersDoMes[i];
                    
                    if (ticker) {
                        const proventosDoAtivoNoMes = proventosDoMesPorTicker[ticker];
                        const totalValor = proventosDoAtivoNoMes.reduce((soma, p) => soma + p.valorTotalRecebido, 0);
                        const totalYoc = proventosDoAtivoNoMes.reduce((soma, p) => soma + p.yieldOnCost, 0);

                        htmlFinal += `<td>
                                        <div class="provento-item-acao">
                                            <div class="provento-ticker-calendario">${ticker}</div>
                                            <div class="provento-detalhe-calendario" title="Valor Total Recebido no Mês">${formatarMoeda(totalValor)}</div>
                                            <div class="provento-detalhe-calendario" title="Yield on Cost no Mês">YOC: ${formatarPercentual(totalYoc)}</div>
                                        </div>
                                      </td>`;
                    } else {
                        htmlFinal += '<td></td>';
                    }
                }
                htmlFinal += '</tr>';
            }
        }
        htmlFinal += '</tbody></table></div>';
    });
    container.innerHTML = htmlFinal;
}
function renderizarTelaPosicaoPorCorretora() {
    const container = document.getElementById('container-posicao-por-corretora');
    container.innerHTML = '<h4>Calculando posições...</h4>';

    const corretoras = getTodasCorretoras();
    const posicoesRV = gerarPosicaoDetalhada();
    const hojeStr = new Date().toISOString().split('T')[0];

    const proventosProvisionados = todosOsProventos.filter(p =>
        p.dataCom && p.dataPagamento &&
        p.dataCom < hojeStr &&
        p.dataPagamento > hojeStr
    );

    let htmlFinal = '';

    corretoras.forEach(corretora => {
        let valorTotalNaInstituicao = 0;
        
        const dadosInstituicao = {
            contasCorrente: { total: 0, itens: [] },
            contaInvestimento: { total: 0, itens: [] },
            proventosProvisionados: { total: 0, itens: [] },
            acoes: { total: 0, itens: [] },
            fiis: { total: 0, itens: [] },
            etfs: { total: 0, itens: [] },
            rendaFixa: { total: 0, itens: [] }
        };

        todasAsContas.filter(c => c.banco === corretora && !c.notas?.toLowerCase().includes('inativa')).forEach(conta => {
            const saldoAtual = calcularSaldoEmData(conta, hojeStr);
            valorTotalNaInstituicao += saldoAtual;
            if (conta.tipo === 'Conta Corrente') {
                dadosInstituicao.contasCorrente.total += saldoAtual;
                dadosInstituicao.contasCorrente.itens.push({ ...conta, saldo: saldoAtual });
            } else {
                dadosInstituicao.contaInvestimento.total += saldoAtual;
                dadosInstituicao.contaInvestimento.itens.push({ ...conta, saldo: saldoAtual });
            }
        });

        Object.entries(posicoesRV).forEach(([ticker, dados]) => {
            const qtdNaCorretora = dados.porCorretora[corretora] || 0;
            if (qtdNaCorretora > 0.000001) {
                const ativoInfo = todosOsAtivos.find(a => a.ticker === ticker) || {};
                const cotacao = dadosDeMercado.cotacoes[ticker];
                const valorMercado = (cotacao?.valor > 0) ? qtdNaCorretora * cotacao.valor : 0;
                valorTotalNaInstituicao += valorMercado;

                const item = { nome: ticker, tipo: ativoInfo.tipo || 'N/D', quantidade: qtdNaCorretora, valor: valorMercado };
                if (ativoInfo.tipo === 'Ação') dadosInstituicao.acoes.itens.push(item);
                else if (ativoInfo.tipo === 'FII') dadosInstituicao.fiis.itens.push(item);
                else if (ativoInfo.tipo === 'ETF') dadosInstituicao.etfs.itens.push(item);
            }
        });
        dadosInstituicao.acoes.total = dadosInstituicao.acoes.itens.reduce((s, a) => s + a.valor, 0);
        dadosInstituicao.fiis.total = dadosInstituicao.fiis.itens.reduce((s, a) => s + a.valor, 0);
        dadosInstituicao.etfs.total = dadosInstituicao.etfs.itens.reduce((s, a) => s + a.valor, 0);

        todosOsAtivosRF.filter(a => a.instituicao === corretora && !(a.descricao || '').toLowerCase().includes('inativa')).forEach(ativo => {
            const saldoAtivo = calcularSaldosRFEmData(ativo, hojeStr).saldoLiquido;
            valorTotalNaInstituicao += saldoAtivo;
            dadosInstituicao.rendaFixa.total += saldoAtivo;
            dadosInstituicao.rendaFixa.itens.push({ nome: ativo.descricao, tipo: 'Renda Fixa', quantidade: null, valor: saldoAtivo });
        });

        proventosProvisionados.forEach(p => {
            if (p.posicaoPorCorretora && p.posicaoPorCorretora[corretora]) {
                const valorNaCorretora = p.posicaoPorCorretora[corretora].valorRecebido || 0;
                valorTotalNaInstituicao += valorNaCorretora;
                dadosInstituicao.proventosProvisionados.total += valorNaCorretora;
                dadosInstituicao.proventosProvisionados.itens.push({
                    nome: p.ticker,
                    dataPagamento: p.dataPagamento,
                    valor: valorNaCorretora
                });
            }
        });
        
        if (valorTotalNaInstituicao > 0) {
            const totalInvestimentos = dadosInstituicao.contaInvestimento.total + dadosInstituicao.proventosProvisionados.total + dadosInstituicao.acoes.total + dadosInstituicao.fiis.total + dadosInstituicao.etfs.total + dadosInstituicao.rendaFixa.total;

            htmlFinal += `<div class="bloco-corretora">
                            <div class="bloco-corretora-header">
                                <h3>${corretora}</h3>
                                <span class="total-corretora">${formatarMoeda(valorTotalNaInstituicao)}</span>
                            </div>
                            <div class="bloco-corretora-conteudo">`;

            if (dadosInstituicao.contasCorrente.itens.length > 0) {
                htmlFinal += `<div class="categoria-acordeao">
                    <div class="acordeao-header">
                        <h4><i class="fas fa-wallet"></i> Contas Correntes</h4>
                        <div><span class="acordeao-valor">${formatarMoeda(dadosInstituicao.contasCorrente.total)}</span> <i class="fas fa-chevron-right acordeao-icone"></i></div>
                    </div>
                    <div class="acordeao-conteudo">
                        <table><tbody>
                            ${dadosInstituicao.contasCorrente.itens.map(c => `
                                <tr>
                                    <td>${c.tipo} (Ag: ${c.agencia || 'N/A'}, C/C: ${c.numero || 'N/A'}, Pix: ${c.pix || 'N/A'})</td>
                                    <td class="numero"><strong>${formatarMoeda(c.saldo)}</strong></td>
                                </tr>
                            `).join('')}
                        </tbody></table>
                    </div>
                </div>`;
            }

            if (totalInvestimentos > 0) {
                htmlFinal += `<div class="categoria-acordeao">
                    <div class="acordeao-header">
                        <h4><i class="fas fa-chart-pie"></i> Investimentos</h4>
                        <div><span class="acordeao-valor">${formatarMoeda(totalInvestimentos)}</span> <i class="fas fa-chevron-right acordeao-icone"></i></div>
                    </div>
                    <div class="acordeao-conteudo">`;
                
                const subcategorias = [
                    { nome: 'Conta Investimento', dados: dadosInstituicao.contaInvestimento, isConta: true },
                    { nome: 'Proventos Provisionados', dados: dadosInstituicao.proventosProvisionados, isConta: false, isProvento: true },
                    { nome: 'Ações', dados: dadosInstituicao.acoes, isConta: false },
                    { nome: 'FIIs', dados: dadosInstituicao.fiis, isConta: false },
                    { nome: 'ETFs', dados: dadosInstituicao.etfs, isConta: false },
                    { nome: 'Renda Fixa', dados: dadosInstituicao.rendaFixa, isConta: false }
                ];

                subcategorias.forEach(sub => {
                    if (sub.dados.itens.length > 0) {
                        let sortedItems = [...sub.dados.itens];
                        if (sub.isProvento) {
                            sortedItems.sort((a, b) => new Date(a.dataPagamento) - new Date(b.dataPagamento));
                        } else {
                            sortedItems.sort((a,b) => (a.nome || a.banco).localeCompare(b.nome || b.banco));
                        }
                        
                        htmlFinal += `<div class="subcategoria-acordeao">
                            <div class="acordeao-header">
                                <h5>${sub.nome}</h5>
                                <div><span class="acordeao-valor">${formatarMoeda(sub.dados.total)}</span> <i class="fas fa-chevron-right acordeao-icone"></i></div>
                            </div>
                            <div class="acordeao-conteudo">
                                 <table><tbody>
                                    ${sortedItems.map(item => {
                                        if (sub.isConta) {
                                            return `<tr>
                                                        <td>${item.tipo} (Ag: ${item.agencia || 'N/A'}, C/C: ${item.numero || 'N/A'})</td>
                                                        <td></td>
                                                        <td class="numero"><strong>${formatarMoeda(item.saldo)}</strong></td>
                                                    </tr>`;
                                        } else if (sub.isProvento) {
                                            return `<tr>
                                                        <td>${item.nome}</td>
                                                        <td class="numero" style="font-size: 0.9em; color: #555;">Paga em: ${new Date(item.dataPagamento + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                                                        <td class="numero"><strong>${formatarMoeda(item.valor)}</strong></td>
                                                    </tr>`;
                                        } else {
                                            return `<tr>
                                                        <td>${item.nome}</td>
                                                        ${item.quantidade ? `<td class="numero">Qtd: ${Math.round(item.quantidade)}</td>` : '<td></td>'}
                                                        <td class="numero"><strong>${formatarMoeda(item.valor)}</strong></td>
                                                    </tr>`;
                                        }
                                    }).join('')}
                                </tbody></table>
                            </div>
                        </div>`;
                    }
                });

                htmlFinal += `</div></div>`;
            }
            
            htmlFinal += `</div></div>`;
        }
    });

    if (htmlFinal === '') {
        container.innerHTML = '<p style="text-align: center;">Nenhuma posição encontrada.</p>';
    } else {
        container.innerHTML = htmlFinal;
    }
}

function calcularValorTotalInvestimentosAtual() {
    const hoje = new Date().toISOString().split('T')[0];
    
    // A função calcularValorTotalCarteira já soma RV + RF, que é exatamente o que queremos.
    const valorCarteira = calcularValorTotalCarteira(hoje);

    return arredondarMoeda(valorCarteira);
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

    // Se fosse Renda Fixa, retornaria aqui. Como foi removida do gráfico, mantemos a lógica 
    // apenas para compatibilidade se chamada de outros lugares, ou removemos se for exclusivo do gráfico.
    // Vou manter a lógica de RF caso seja usada em outro contexto, mas o foco é RV.
    if (alvo === 'Renda Fixa') {
        todasAsMovimentacoes.forEach(mov => {
            if (mov.data > dataInicio && mov.data <= dataFim) {
                if (mov.source === 'aporte_rf') fluxoLiquido += Math.abs(mov.valor);
                else if (mov.source === 'resgate_rf') fluxoLiquido -= Math.abs(mov.valor);
            }
        });
        return fluxoLiquido;
    }

    // Para RV (Varre Notas, Histórico e Eventos)
    const processarTransacao = (ticker, valorTransacao, tipoOp, custosOp) => {
        let pertence = false;
        const ativoCadastro = todosOsAtivos.find(a => a.ticker === ticker);
        
        if (alvo === 'Carteira RV') {
            // Se o alvo é a carteira consolidada, aceita qualquer ativo de RV
            pertence = ativoCadastro && ['Ação', 'FII', 'ETF'].includes(ativoCadastro.tipo);
        } else if (tipo === 'ativo') {
            pertence = (ticker === alvo);
        } else {
            // Se é categoria específica (Ações, FIIs)
            const tipoMapeado = ativoCadastro ? (ativoCadastro.tipo === 'Ação' ? 'Ações' : ativoCadastro.tipo === 'FII' ? 'FIIs' : 'ETFs') : null;
            pertence = (tipoMapeado === alvo);
        }

        if (pertence) {
            if (tipoOp === 'compra') {
                // Compra = Aporte = Fluxo Positivo
                fluxoLiquido += (valorTransacao + custosOp);
            } else if (tipoOp === 'venda') {
                // Venda = Retirada = Fluxo Negativo
                fluxoLiquido -= (valorTransacao - custosOp);
            }
        }
    };

    // 1. Notas de Negociação
    todasAsNotas.forEach(nota => {
        if (nota.data > dataInicio && nota.data <= dataFim) {
            const totalNota = nota.operacoes.reduce((sum, o) => sum + o.valor, 0);
            nota.operacoes.forEach(op => {
                const custosOp = totalNota > 0 ? (op.valor / totalNota) * (nota.custos + nota.irrf) : 0;
                processarTransacao(op.ativo, op.valor, op.tipo, custosOp);
            });
        }
    });

    // 2. Posição Inicial (apenas se data cair no intervalo)
    posicaoInicial.forEach(p => {
        if (p.tipoRegistro === 'TRANSACAO_HISTORICA' && p.data > dataInicio && p.data <= dataFim) {
            const val = p.transacao.toLowerCase() === 'compra' ? (p.quantidade * p.precoMedio) : (p.valorVenda || (p.quantidade * p.precoMedio));
            processarTransacao(p.ticker, val, p.transacao.toLowerCase(), 0);
        }
    });

    // 3. Eventos de Ativo (Entrada/Saída não financeira com custo)
    todosOsAjustes.forEach(a => {
        if (a.tipoAjuste === 'evento_ativo' && a.data > dataInicio && a.data <= dataFim) {
            const qtd = a.detalhes.reduce((sum, d) => sum + d.quantidade, 0);
            const valorEstimado = qtd * (a.precoMedio || 0); 
            
            if (a.tipoEvento === 'entrada') {
                processarTransacao(a.ticker, valorEstimado, 'compra', 0);
            } else {
                processarTransacao(a.ticker, valorEstimado, 'venda', 0);
            }
        }
    });

    return fluxoLiquido;
}

function calcularProventosRecebidosPeriodo(alvo, tipo, dataInicio, dataFim) {
    let totalProventos = 0;

    if (alvo === 'Renda Fixa') return 0; 

    todosOsProventos.forEach(p => {
        // Define qual data usar para o cálculo de performance:
        // Prioridade: Data-Ex (Dia útil após Data-Com) para casar com o ajuste de preço.
        // Fallback: Data de Pagamento (se não houver Data-Com).
        let dataConsiderada = null;
        
        if (p.dataCom) {
            dataConsiderada = getProximaDataUtil(p.dataCom);
        } else {
            dataConsiderada = p.dataPagamento;
        }

        if (dataConsiderada && dataConsiderada > dataInicio && dataConsiderada <= dataFim) {
            let pertence = false;
            const ativoCadastro = todosOsAtivos.find(a => a.ticker === p.ticker);

            if (alvo === 'Carteira RV') {
                // Soma proventos de qualquer ativo de RV
                pertence = ativoCadastro && ['Ação', 'FII', 'ETF'].includes(ativoCadastro.tipo);
            } else if (tipo === 'ativo') {
                pertence = (p.ticker === alvo);
            } else {
                const tipoMapeado = ativoCadastro ? (ativoCadastro.tipo === 'Ação' ? 'Ações' : ativoCadastro.tipo === 'FII' ? 'FIIs' : 'ETFs') : null;
                pertence = (tipoMapeado === alvo);
            }

            if (pertence) {
                totalProventos += p.valorTotalRecebido;
            }
        }
    });

    return totalProventos;
}

function gerarDadosCalendarioRecorrentes(tipo) {
    const dadosAgrupados = new Map();
    const filhos = gerarTransacoesFilhas().filter(f => f.targetType === tipo);
    const items = (tipo === 'conta') ? todasAsContas : todosOsAtivosMoedas;

    filhos.forEach(filho => {
        const itemId = String(filho.targetId);
        const itemInfo = items.find(i => String(i.id) === itemId);
        if (!itemInfo) return; 

        if (!dadosAgrupados.has(itemId)) {
            dadosAgrupados.set(itemId, {
                itemInfo: {
                    nome: tipo === 'conta' ? `${itemInfo.banco} - ${itemInfo.tipo}` : itemInfo.nomeAtivo,
                    moeda: tipo === 'conta' ? 'BRL' : itemInfo.moeda
                },
                regras: new Map() 
            });
        }
        
        const grupoItem = dadosAgrupados.get(itemId);
        const mae = todasAsTransacoesRecorrentes.find(m => String(m.id) === String(filho.sourceId));
        if (!mae) return;

        if (!grupoItem.regras.has(mae.id)) {
            grupoItem.regras.set(mae.id, {
                descricao: mae.descricao,
                datas: new Map()
            });
        }
        
        const grupoRegra = grupoItem.regras.get(mae.id);
        grupoRegra.datas.set(filho.data, filho.valor);
    });

    return dadosAgrupados;
}

function abrirModalDetalhesRendimentoMensal(ano, mes, tipo, dadosCalendario) {
    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const titulo = `Detalhes de ${tipo} - ${meses[mes]} de ${ano}`;
    document.getElementById('modal-detalhes-rendimento-titulo').textContent = titulo;

    const container = document.getElementById('container-detalhes-rendimento');
    const dadosDetalhados = dadosCalendario[ano]?.[mes]?.[tipo] || [];

    if (dadosDetalhados.length === 0) {
        container.innerHTML = '<p>Nenhum detalhe encontrado.</p>';
        abrirModal('modal-detalhes-rendimento');
        return;
    }

    let tableHtml = '';
    // Caso especial para Renda Fixa, que tem uma estrutura de dados diferente
    if (tipo === 'Renda Fixa') {
        tableHtml = `<table class="dashboard-table">
            <thead><tr>
                <th>Descrição do Ativo</th>
                <th class="numero">Rendimento no Mês</th>
            </tr></thead><tbody>`;
        dadosDetalhados.forEach(item => {
            tableHtml += `<tr>
                <td>${item.descricao}</td>
                <td class="numero">${formatarMoeda(item.valor)}</td>
            </tr>`;
        });
        tableHtml += `</tbody></table>`;
    } else { // Caso para Ações, FIIs, ETFs
        tableHtml = `<table class="dashboard-table">
            <thead><tr>
                <th>Ativo</th>
                <th>Data Com</th>
                <th>Data Pag.</th>
                <th class="numero">Valor Unitário</th>
                <th class="numero">Valor Total</th>
            </tr></thead><tbody>`;
        // Ordena para mostrar os maiores valores primeiro
        dadosDetalhados.sort((a, b) => b.valor - a.valor).forEach(item => {
            tableHtml += `<tr>
                <td>${item.ticker}</td>
                <td>${new Date(item.dataCom + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td>${new Date(item.dataPagamento + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td class="numero">${formatarPrecoMedio(item.valorIndividual)}</td>
                <td class="numero"><strong>${formatarMoeda(item.valor)}</strong></td>
            </tr>`;
        });
        tableHtml += `</tbody></table>`;
    }

    container.innerHTML = tableHtml;
    abrirModal('modal-detalhes-rendimento');
}

function renderizarModalCalendarioRecorrentes() {
    const dadosContas = gerarDadosCalendarioRecorrentes('conta');
    const dadosMoedas = gerarDadosCalendarioRecorrentes('moeda');
    const container = document.getElementById('calendario-recorrentes-container');
    const tituloModal = document.getElementById('modal-calendario-recorrentes-titulo');

    tituloModal.textContent = 'Calendário de Lançamentos Recorrentes';

    if (dadosContas.size === 0 && dadosMoedas.size === 0) {
        container.innerHTML = '<p style="text-align:center; padding: 20px;">Nenhum lançamento recorrente futuro encontrado.</p>';
        abrirModal('modal-calendario-recorrentes');
        return;
    }

    let htmlFinal = '';
    const formatarValor = (valor, moeda) => moeda === 'BRL' ? formatarMoeda(valor) : formatarMoedaEstrangeira(valor, moeda);

    // Função auxiliar para renderizar um grupo de dados (seja de contas ou moedas)
    const renderizarGrupo = (dadosAgrupados) => {
        let htmlGrupo = '';
        dadosAgrupados.forEach((dadosItem) => {
            const { itemInfo, regras } = dadosItem;
            let todasAsDatas = new Set();
            regras.forEach(regra => {
                regra.datas.forEach((_, data) => todasAsDatas.add(data));
            });

            if (todasAsDatas.size === 0) return;

            const datasOrdenadas = Array.from(todasAsDatas).sort();
            
            const meses = new Map();
            datasOrdenadas.forEach(data => {
                const mesChave = data.substring(0, 7);
                if (!meses.has(mesChave)) meses.set(mesChave, []);
                meses.get(mesChave).push(data);
            });

            htmlGrupo += `
                <div class="bloco-corretora">
                    <div class="bloco-corretora-header">
                        <h3>${itemInfo.nome} (${itemInfo.moeda})</h3>
                    </div>
                    <div class="tabela-projecao-wrapper">
                        <table class="calendario-recorrentes-table">
                            <thead>
                                <tr><th rowspan="2" class="regra-header">Lançamento Recorrente</th>`;

            let mesIndex = 0;
            meses.forEach((diasDoMes, mesChave) => {
                const dataMes = new Date(mesChave + '-02T12:00:00');
                const nomeMes = dataMes.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
                const classeMes = (mesIndex % 2 === 0) ? 'mes-par' : 'mes-impar';
                htmlGrupo += `<th colspan="${diasDoMes.length}" class="mes-header ${classeMes}">${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)}</th>`;
                mesIndex++;
            });
            htmlGrupo += `</tr><tr>`;

            mesIndex = 0;
            meses.forEach((diasDoMes) => {
                const classeMes = (mesIndex % 2 === 0) ? 'mes-par' : 'mes-impar';
                diasDoMes.forEach(data => {
                    htmlGrupo += `<th class="dia-header ${classeMes}">${new Date(data + 'T12:00:00').getDate()}</th>`;
                });
                mesIndex++;
            });
            htmlGrupo += `</tr></thead><tbody>`;

            regras.forEach(regra => {
                htmlGrupo += `<tr><td>${regra.descricao}</td>`;
                mesIndex = 0;
                meses.forEach((diasDoMes) => {
                    const classeMes = (mesIndex % 2 === 0) ? 'mes-par' : 'mes-impar';
                    diasDoMes.forEach(data => {
                        const valor = regra.datas.get(data) || 0;
                        const classeValor = valor < 0 ? 'valor-negativo' : 'valor-positivo';
                        htmlGrupo += `<td class="numero ${classeMes} ${valor !== 0 ? classeValor : ''}">${valor !== 0 ? formatarValor(valor, itemInfo.moeda) : '-'}</td>`;
                    });
                    mesIndex++;
                });
                htmlGrupo += `</tr>`;
            });

            htmlGrupo += `</tbody><tfoot><tr class="total-row"><td><strong>Total do Mês</strong></td>`;
            mesIndex = 0;
            meses.forEach((diasDoMes) => {
                let totalMes = 0;
                regras.forEach(regra => {
                    diasDoMes.forEach(data => {
                        totalMes += regra.datas.get(data) || 0;
                    });
                });
                const classeMes = (mesIndex % 2 === 0) ? 'mes-par' : 'mes-impar';
                const classeTotal = totalMes < 0 ? 'valor-negativo' : 'valor-positivo';
                htmlGrupo += `<td colspan="${diasDoMes.length}" class="numero total-mes ${classeMes} ${classeTotal}"><strong>${formatarValor(totalMes, itemInfo.moeda)}</strong></td>`;
                mesIndex++;
            });
            htmlGrupo += `</tr></tfoot></table></div></div>`;
        });
        return htmlGrupo;
    };

    // Renderiza primeiro as contas BRL, depois as outras moedas
    htmlFinal += renderizarGrupo(dadosContas);
    htmlFinal += renderizarGrupo(dadosMoedas);

    container.innerHTML = htmlFinal;
    abrirModal('modal-calendario-recorrentes');
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
function renderizarModalProjecaoFutura() {
    const dados = gerarDadosProjecaoFutura();
    const container = document.getElementById('container-projecao-futura');
    const tituloModal = document.getElementById('modal-projecao-titulo');

    tituloModal.textContent = 'Projeção de Saldos Futuros';

    if (!dados) {
        container.innerHTML = '<p style="text-align:center; padding: 20px;">Nenhum lançamento futuro encontrado para gerar a projeção.</p>';
        abrirModal('modal-projecao-futura');
        return;
    }

    const formatarValor = (valor, moeda = 'BRL') => {
        if (valor === 0) return '-';
        return (moeda === 'BRL') ? formatarMoeda(valor) : formatarMoedaEstrangeira(valor, moeda);
    };

    const construirTabela = (titulo, items, moeda = 'BRL') => {
        let tabelaHtml = `<h2>${titulo}</h2><div class="tabela-projecao-wrapper"><table><thead><tr><th>${!moeda || moeda === 'BRL' ? 'Conta' : 'Ativo'}</th>`;
        dados.datas.forEach(data => {
            const d = new Date(data + 'T12:00:00');
            tabelaHtml += `<th class="numero">${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}</th>`;
        });
        tabelaHtml += `</tr></thead><tbody>`;

        items.forEach(item => {
            const itemIdStr = String(item.id);
            const nomeItem = !item.moeda || item.moeda === 'BRL' ? `${item.banco} - ${item.tipo}` : item.nomeAtivo;
            tabelaHtml += `<tr><td>${nomeItem}</td>`;
            
            let saldoCorrenteItem = dados.saldosIniciais.get(itemIdStr) || 0;

            dados.datas.forEach(dataStr => {
                const eventosDoDia = dados.dataMatrix.get(itemIdStr)?.get(dataStr) || [];
                let valorTotalDia = 0;
                let dataAttributes = '';

                if (eventosDoDia.length > 0) {
                    valorTotalDia = eventosDoDia.reduce((soma, ev) => soma + ev.valor, 0);
                    if (eventosDoDia.length === 1) {
                        const evento = eventosDoDia[0];
                        dataAttributes = `
                            data-lancamento-id="${evento.id}"
                            data-lancamento-source="${evento.source}"
                            data-lancamento-mae-id="${evento.maeId || ''}"
                            data-lancamento-data="${evento.data}"
                            data-lancamento-tipo="${evento.tipo}"
                            class="lancamento-projetado-clicavel"
                            title="Clique para editar este lançamento."
                        `;
                    } else if (eventosDoDia.length > 1) {
                        const tooltipText = `Este valor é a soma de ${eventosDoDia.length} transações. Não é possível editar por aqui.`;
                        dataAttributes = `
                            class="lancamento-projetado-multiplo"
                            title="${tooltipText}"
                        `;
                    }
                }
                
                saldoCorrenteItem += valorTotalDia;
                const classe = valorTotalDia < 0 ? 'valor-negativo' : valorTotalDia > 0 ? 'valor-positivo' : '';
                
                const valorLancamentoHtml = `<div ${dataAttributes}>${formatarValor(valorTotalDia, moeda)}</div>`;
                const saldoCelulaHtml = `<div class="saldo-diario-celula">${formatarValor(saldoCorrenteItem, moeda)}</div>`;
                
                tabelaHtml += `<td class="numero ${classe}">${valorLancamentoHtml}${saldoCelulaHtml}</td>`;
            });
            tabelaHtml += `</tr>`;
        });

        tabelaHtml += `</tbody><tfoot><tr class="total-row"><td><strong>Saldo Projetado</strong></td>`;
        let saldoAcumulado = items.reduce((soma, item) => soma + (dados.saldosIniciais.get(String(item.id)) || 0), 0);
        
        dados.datas.forEach(dataStr => {
            const movimentacaoDia = items.reduce((soma, item) => {
                const eventosDoDia = dados.dataMatrix.get(String(item.id))?.get(dataStr) || [];
                return soma + eventosDoDia.reduce((s, ev) => s + ev.valor, 0);
            }, 0);
            saldoAcumulado += movimentacaoDia;
            const classeSaldo = saldoAcumulado < 0 ? 'valor-negativo' : '';
            tabelaHtml += `<td class="numero ${classeSaldo}"><strong>${formatarValor(saldoAcumulado, moeda)}</strong></td>`;
        });
        tabelaHtml += `</tr></tfoot></table></div>`;
        return tabelaHtml;
    };

    let htmlFinal = '';
    const contasBRL = dados.items.filter(item => !item.moeda || item.moeda === 'BRL');
    const itemsMoedasAgrupados = dados.items
        .filter(item => item.moeda && item.moeda !== 'BRL')
        .reduce((acc, item) => {
            if (!acc[item.moeda]) acc[item.moeda] = [];
            acc[item.moeda].push(item);
            return acc;
        }, {});

    if (contasBRL.length > 0) {
        htmlFinal += construirTabela('Projeção Consolidada (BRL)', contasBRL, 'BRL');
    }
    
    Object.keys(itemsMoedasAgrupados).sort().forEach(moeda => {
        htmlFinal += construirTabela(`Projeção para ${moeda}`, itemsMoedasAgrupados[moeda], moeda);
    });

    container.innerHTML = htmlFinal;
    abrirModal('modal-projecao-futura');
}
function renderizarTelaMetas() {
    const container = document.getElementById('container-metas');
    if (todasAsMetas.length === 0) {
        container.innerHTML = '<p class="info-vazio">Nenhuma meta cadastrada ainda. Clique em "Adicionar Nova Meta" para começar.</p>';
        return;
    }

    const metasPendentes = [];
    const metasAtingidas = [];
    const projecao = calcularProjecaoProventosNegociacao();
    const projecaoRF = gerarDadosGraficoAportesProventos()?.datasets[0]?.data.slice(-12).reduce((a, b) => a + b, 0) / 12 || 0;

    todasAsMetas.forEach(meta => {
        let valorAtual = 0;
        let progresso = 0;
        const tipoMeta = meta.tipo;

        // --- INÍCIO DA ALTERAÇÃO ---
        // Lógica de cálculo foi reorganizada para evitar que um cálculo sobrescreva o outro.
        if (tipoMeta.startsWith('patrimonio')) {
            const patrimonioBRL = calcularValorTotalInvestimentosAtual();
            const moeda = meta.moedaAlvo || 'BRL';
            valorAtual = moeda === 'BRL' ? patrimonioBRL : (dadosMoedas.cotacoes[moeda] > 0 ? patrimonioBRL / dadosMoedas.cotacoes[moeda] : 0);
            progresso = meta.valorAlvo > 0 ? (valorAtual / meta.valorAlvo) : 0;
        } else if (tipoMeta.startsWith('renda_passiva')) {
            let proventosBRL = 0;
            const fonte = meta.fonteProventos || 'total_rv';
            
            switch (fonte) {
                case 'total_rv': proventosBRL = projecao.acoes + projecao.fiis; break;
                case 'total_geral': proventosBRL = projecao.acoes + projecao.fiis + projecaoRF; break;
                case 'fiis': proventosBRL = projecao.fiis; break;
                case 'acoes': proventosBRL = projecao.acoes; break;
            }
            
            if (tipoMeta === 'renda_passiva_sm') {
                const valorAlvoMonetario = meta.valorAlvo * salarioMinimo;
                valorAtual = proventosBRL;
                progresso = valorAlvoMonetario > 0 ? (valorAtual / valorAlvoMonetario) : 0;
            } else { // renda_passiva_moeda
                const moeda = meta.moedaAlvo || 'BRL';
                valorAtual = moeda === 'BRL' ? proventosBRL : (dadosMoedas.cotacoes[moeda] > 0 ? proventosBRL / dadosMoedas.cotacoes[moeda] : 0);
                progresso = meta.valorAlvo > 0 ? (valorAtual / meta.valorAlvo) : 0;
            }
        } else if (tipoMeta === 'posicao_ativo') {
            const posicoes = gerarPosicaoDetalhada();
            valorAtual = posicoes[meta.ativoAlvo] ? posicoes[meta.ativoAlvo].quantidade : 0;
            progresso = meta.valorAlvo > 0 ? (valorAtual / meta.valorAlvo) : 0;
        }
        // --- FIM DA ALTERAÇÃO ---

        const metaComProgresso = { ...meta, valorAtual, progresso };

        if (progresso >= 1) {
            metasAtingidas.push(metaComProgresso);
        } else {
            metasPendentes.push(metaComProgresso);
        }
    });

    let htmlMetas = '';

    if (metasPendentes.length > 0) {
        htmlMetas += '<h2 class="metas-secao-titulo">Metas em Andamento</h2>';
        metasPendentes.sort((a, b) => b.progresso - a.progresso).forEach(meta => {
            htmlMetas += gerarHtmlMetaCard(meta);
        });
    }

    if (metasAtingidas.length > 0) {
        htmlMetas += '<h2 class="metas-secao-titulo">Metas Concluídas</h2>';
        metasAtingidas.sort((a, b) => a.nome.localeCompare(b.nome)).forEach(meta => {
            htmlMetas += gerarHtmlMetaCard(meta, true);
        });
    }
    
    container.innerHTML = htmlMetas;

    function gerarHtmlMetaCard(meta, isAtingida = false) {
        let htmlValorAtual = '', htmlValorAlvo = '', htmlPrevisao = '', historico = [];
        const moeda = meta.moedaAlvo || 'BRL';
        
        // --- INÍCIO DA ALTERAÇÃO ---
        // Lógica de exibição e previsão também foi reorganizada e corrigida.
        if (meta.tipo.startsWith('renda_passiva')) {
            const fonte = meta.fonteProventos || 'total_rv';
            if (fonte === 'fiis') historico = historicoCarteira.map(s => ({ data: s.data, valor: s.detalhesCarteira && s.detalhesCarteira.ativos ? calcularProjecaoProventosNegociacao(s.detalhesCarteira.ativos).fiis : 0 }));
            else if (fonte === 'acoes') historico = historicoCarteira.map(s => ({ data: s.data, valor: s.detalhesCarteira && s.detalhesCarteira.ativos ? calcularProjecaoProventosNegociacao(s.detalhesCarteira.ativos).acoes : 0 }));
            else historico = historicoCarteira.map(s => ({ data: s.data, valor: s.detalhesCarteira && s.detalhesCarteira.ativos ? calcularProjecaoProventosNegociacao(s.detalhesCarteira.ativos).fiis + calcularProjecaoProventosNegociacao(s.detalhesCarteira.ativos).acoes : 0 }));

            if (meta.tipo === 'renda_passiva_sm') {
                const valorAlvoMonetario = meta.valorAlvo * salarioMinimo;
                const valorAtualEmSM = salarioMinimo > 0 ? meta.valorAtual / salarioMinimo : 0;
                htmlValorAlvo = `${meta.valorAlvo} SM (${formatarMoeda(valorAlvoMonetario)})`;
                htmlValorAtual = `${formatarDecimal(valorAtualEmSM, 2)} SM (${formatarMoeda(meta.valorAtual)})`;
                previsao = calcularPrevisaoMeta(historico, meta.valorAtual, valorAlvoMonetario);
            } else {
                htmlValorAlvo = formatarValor(meta.valorAlvo, moeda);
                htmlValorAtual = formatarValor(meta.valorAtual, moeda);
                previsao = calcularPrevisaoMeta(historico, meta.valorAtual, meta.valorAlvo);
            }
        } 
        else if (meta.tipo.startsWith('patrimonio')) {
            const historicoFormatado = historicoCarteira.map(s => ({ data: s.data, valor: s.valorTotalInvestimentos || s.valor }));
            previsao = calcularPrevisaoMeta(historicoFormatado, meta.valorAtual, meta.valorAlvo);
            htmlValorAlvo = formatarValor(meta.valorAlvo, moeda);
            htmlValorAtual = formatarValor(meta.valorAtual, moeda);
        } else if (meta.tipo === 'posicao_ativo') {
            htmlValorAlvo = `${meta.valorAlvo} cotas`;
            htmlValorAtual = `${Math.round(meta.valorAtual)} cotas`;
        }
        // --- FIM DA ALTERAÇÃO ---
        
        if (previsao && !isAtingida) {
            htmlPrevisao = `<div class="meta-previsao">Previsão de Conclusão: <strong>${previsao}</strong></div>`;
        }

        const classeAtingida = isAtingida ? 'meta-atingida' : '';
        const progressoPercentual = meta.progresso * 100;

        return `
            <div class="meta-card ${classeAtingida}">
                <div class="meta-card-header">
                    <h3>${meta.nome}</h3>
                    <div class="meta-card-controles">
                        <i class="fas fa-edit acao-btn edit" title="Editar Meta" data-meta-id="${meta.id}"></i>
                        <i class="fas fa-trash acao-btn delete" title="Excluir Meta" data-meta-id="${meta.id}"></i>
                    </div>
                </div>
                <div class="meta-card-body">
                    <div class="meta-progresso-info">
                        <span>Progresso: <strong>${progressoPercentual.toFixed(2)}%</strong></span>
                    </div>
                    <div class="meta-progresso-barra-container">
                        <div class="meta-progresso-barra" style="width: ${Math.min(progressoPercentual, 100)}%;"></div>
                    </div>
                    <div class="meta-valores">
                        <div class="meta-valor-item">
                            <label>Alcançado</label>
                            <span>${htmlValorAtual}</span>
                        </div>
                        <div class="meta-valor-item">
                            <label>Alvo</label>
                            <span>${htmlValorAlvo}</span>
                        </div>
                    </div>
                    ${htmlPrevisao}
                </div>
            </div>
        `;
    }
}
function abrirModalCadastroMeta(metaParaEditar = null) {
    const form = document.getElementById('form-cadastro-meta');
    form.reset();
    document.getElementById('meta-ativo-alvo-group').style.display = 'none';
    document.getElementById('meta-moeda-group').style.display = 'none';
    document.getElementById('meta-fonte-proventos-group').style.display = 'none';

    if (metaParaEditar) {
        document.getElementById('modal-meta-titulo').textContent = 'Editar Meta';
        document.getElementById('meta-id').value = metaParaEditar.id;
        document.getElementById('meta-nome').value = metaParaEditar.nome;
        document.getElementById('meta-valor-alvo').value = formatarDecimalParaInput(metaParaEditar.valorAlvo);
        
        const tipoAntigo = metaParaEditar.tipo;
        const tipoSelect = document.getElementById('meta-tipo');

        // Lógica de compatibilidade com o novo tipo de meta
        if (tipoAntigo === 'posicao_ativo') {
            tipoSelect.value = 'posicao_ativo';
            document.getElementById('meta-ativo-alvo').value = metaParaEditar.ativoAlvo;
        } else if (tipoAntigo.startsWith('patrimonio')) {
            tipoSelect.value = 'patrimonio_moeda';
            document.getElementById('meta-moeda-alvo').value = metaParaEditar.moedaAlvo || 'BRL';
        } else if (tipoAntigo === 'renda_passiva_sm') {
            tipoSelect.value = 'renda_passiva_sm';
            document.getElementById('meta-fonte-proventos').value = metaParaEditar.fonteProventos || 'total_rv';
        } else if (tipoAntigo.startsWith('renda_passiva')) {
            tipoSelect.value = 'renda_passiva_moeda';
            document.getElementById('meta-moeda-alvo').value = metaParaEditar.moedaAlvo || 'BRL';
            let fonte = metaParaEditar.fonteProventos;
            if (!fonte) {
                if (tipoAntigo === 'renda_passiva_fiis') fonte = 'fiis';
                else if (tipoAntigo === 'renda_passiva_acoes') fonte = 'acoes';
                else fonte = 'total_rv';
            }
            document.getElementById('meta-fonte-proventos').value = fonte;
        }

    } else {
        document.getElementById('modal-meta-titulo').textContent = 'Adicionar Nova Meta';
        document.getElementById('meta-id').value = '';
    }
    
    document.getElementById('meta-tipo').dispatchEvent(new Event('change'));
    abrirModal('modal-cadastro-meta');
    document.getElementById('meta-nome').focus();
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
function getUltimoSnapshotPorData(dataStr) {
    // Filtra todos os snapshots daquele dia e pega o último (o mais recente)
    const snapshotsDoDia = historicoCarteira.filter(s => s.data === dataStr);
    if (snapshotsDoDia.length > 0) {
        return snapshotsDoDia[snapshotsDoDia.length - 1];
    }
    return null;
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

function renderizarTelaNegociar() {
    document.getElementById('negociar-aporte-valor').value = dadosSimulacaoNegociar.aporteTotal ? formatarDecimalParaInput(parseDecimal(dadosSimulacaoNegociar.aporteTotal)) : '';

    const posicoesAtuais = gerarPosicaoDetalhada();
    const dadosBalanceamento = gerarDadosBalanceamento('todos');
    
    const projecaoProventos = calcularProjecaoProventosNegociacao();

    const getTickersToDisplay = (tipoSimulacao) => {
        const tickers = new Set();
        const tipoAtivoCorreto = tipoSimulacao === 'acoes' ? 'Ação' : 'FII'; 

        // 1. Adiciona ativos da carteira atual (em posição)
        todosOsAtivos.forEach(a => {
            const tipoAtivo = a.tipo === 'Ação' ? 'acoes' : 'fiis';
            if (tipoAtivo === tipoSimulacao && posicoesAtuais[a.ticker] && posicoesAtuais[a.ticker].quantidade > 0) {
                tickers.add(a.ticker);
            }
        });

        // 2. Adiciona ativos da simulação salva
        if (dadosSimulacaoNegociar[tipoSimulacao]) {
            Object.keys(dadosSimulacaoNegociar[tipoSimulacao]).forEach(ticker => {
                if (dadosSimulacaoNegociar[tipoSimulacao][ticker].qtd !== 0) {
                    tickers.add(ticker);
                }
            });
        }

        // 3. Adiciona ativos do plano de alocação
        Object.keys(dadosAlocacao.ativos).forEach(ticker => {
            const ativoInfo = todosOsAtivos.find(a => a.ticker === ticker);
            if (ativoInfo && ativoInfo.tipo === tipoAtivoCorreto) {
                tickers.add(ticker);
            }
        });

        return Array.from(tickers).sort();
    };

    // --- SEÇÃO DE FIIs ---
    const tbodyFiis = document.getElementById('negociar-fiis-tbody');
    const tfootFiis = document.getElementById('negociar-fiis-tfoot');
    tbodyFiis.innerHTML = '';
    const fiisParaExibir = getTickersToDisplay('fiis');

    if (fiisParaExibir.length === 0) {
        tbodyFiis.innerHTML = '<tr><td colspan="16" style="text-align: center;">Nenhum Fundo Imobiliário em carteira ou no plano de alocação.</td></tr>';
        tfootFiis.style.display = 'none';
    } else {
        tfootFiis.style.display = 'table-footer-group';
        let htmlFiis = '';
        fiisParaExibir.forEach(ticker => {
            const fii = todosOsAtivos.find(a => a.ticker === ticker);
            if (!fii) return;

            const posicao = posicoesAtuais[ticker], dadosMercado = dadosDeMercado.cotacoes[ticker] || {}, dadosSimulacao = dadosSimulacaoNegociar.fiis[ticker] || {}, dadosDoAtivoNoBalanceamento = dadosBalanceamento.categorias['FIIs']?.ativos.find(a => a.ticker === ticker);
            const qtdAtual = posicao ? posicao.quantidade : 0, precoMedio = posicao ? posicao.precoMedio : 0, precoAtual = dadosMercado.valor || 0;
            const vpa = dadosMercado.vpa || 0;
            const ultimoProvento = getUltimoProvento(ticker);
            const metaQtd = dadosDoAtivoNoBalanceamento ? Math.round(dadosDoAtivoNoBalanceamento.ideal.quantidade) : 0;
            const ajusteQtd = dadosDoAtivoNoBalanceamento ? Math.round(dadosDoAtivoNoBalanceamento.ajuste.quantidade) : 0;
            let ajusteQtdHtml = '0';
            if (ajusteQtd > 0) ajusteQtdHtml = `<span class="valor-positivo">+${ajusteQtd}</span>`;
            else if (ajusteQtd < 0) ajusteQtdHtml = `<span class="valor-negativo">${ajusteQtd}</span>`;
            const qtdSimulada = dadosSimulacao.qtd || 0, precoSimulado = dadosSimulacao.preco || precoAtual;
            const rendimentoAtual = ultimoProvento * qtdAtual;
            const yieldProjetado = (precoAtual > 0 && ultimoProvento > 0) ? (ultimoProvento * 12) / precoAtual : 0;
            const diff = precoAtual - precoMedio;
            const diffPercent = precoMedio > 0 ? (diff / precoMedio) : 0;
            let classePreco = '', desempenhoHtml = '-';
            if (diffPercent > 0.0001) { classePreco = 'preco-maior'; desempenhoHtml = `<span class="preco-maior">↑ ${formatarPercentual(diffPercent)}</span>`; } 
            else if (diffPercent < -0.0001) { classePreco = 'preco-menor'; desempenhoHtml = `<span class="preco-menor">↓ ${formatarPercentual(Math.abs(diffPercent))}</span>`; }
            
            const hoje = new Date().toISOString().split('T')[0];
            let proximaDataComHtml = '';
            const proximoProvento = todosOsProventos
                .filter(p => p.ticker === ticker && p.dataCom >= hoje)
                .sort((a, b) => new Date(a.dataCom) - new Date(a.dataCom))[0];

            if (proximoProvento) {
                const dataFmt = new Date(proximoProvento.dataCom + 'T12:00:00').toLocaleDateString('pt-BR');
                proximaDataComHtml = `<small class="next-ex-date"><i class="fas fa-calendar-day"></i> Próx. Data-Com: ${dataFmt}</small>`;
            }

            htmlFiis += `<tr data-ticker="${ticker}" data-qtd-atual="${qtdAtual}" data-ultimo-provento="${ultimoProvento}">
                <td><strong>${ticker}</strong>${proximaDataComHtml}</td>
                <td class="numero">${formatarPrecoMedio(precoMedio)}</td>
                <td class="numero ${classePreco}">${formatarMoeda(precoAtual)}</td>
                <td class="percentual col-variacao">${desempenhoHtml}</td>
                <td class="numero">${vpa > 0 ? formatarDecimal(precoMedio / vpa) : 'N/A'}</td>
                <td class="numero">${vpa > 0 ? formatarDecimal(precoAtual / vpa) : 'N/A'}</td>
                <td class="percentual">${yieldProjetado > 0 ? formatarPercentual(yieldProjetado) : 'N/A'}</td>
                <td class="numero col-qtd">${Math.round(qtdAtual)}</td>
                <td class="numero col-qtd">${metaQtd}</td>
                <td class="numero col-qtd">${ajusteQtdHtml}</td>
                <td class="numero col-qtd"><input type="number" class="input-in-table negociar-input-qtd" placeholder="0" value="${qtdSimulada || ''}"></td>
                <td class="numero"><input type="text" class="input-in-table negociar-input-preco" value="${formatarDecimalParaInput(precoSimulado)}"></td>
                <td class="numero" data-field="totalCompraSimulado">R$ 0,00</td>
                <td class="numero col-qtd" data-field="posicaoFinalSimulada">${Math.round(qtdAtual)}</td>
                <td class="numero" data-field="rendimentoAtual">${formatarMoeda(rendimentoAtual)}</td>
                <td class="numero" data-field="rendimentoPosCompra">${formatarMoeda(rendimentoAtual)}</td>
            </tr>`;
        });
        tbodyFiis.innerHTML = htmlFiis;
    }
    // Nota: O valor inicial aqui é apenas um placeholder, será atualizado pelo evento 'input' no final
    tfootFiis.querySelector('[id^="total-rend-atual-"]').textContent = formatarMoeda(projecaoProventos.fiis);
    
    const tbodyAcoes = document.getElementById('negociar-acoes-tbody');
    const tfootAcoes = document.getElementById('negociar-acoes-tfoot');
    tbodyAcoes.innerHTML = '';
    const acoesParaExibir = getTickersToDisplay('acoes');

    if (acoesParaExibir.length === 0) {
        tbodyAcoes.innerHTML = '<tr><td colspan="19" style="text-align: center;">Nenhuma Ação em carteira ou no plano de alocação.</td></tr>';
        tfootAcoes.style.display = 'none';
    } else {
        tfootAcoes.style.display = 'table-footer-group';
        let htmlAcoes = '';
        acoesParaExibir.forEach(ticker => {
            const acao = todosOsAtivos.find(a => a.ticker === ticker);
            if (!acao) return;

            const posicao = posicoesAtuais[ticker], dadosMercado = dadosDeMercado.cotacoes[ticker] || {}, dadosSimulacao = dadosSimulacaoNegociar.acoes[ticker] || {}, dadosDoAtivoNoBalanceamento = dadosBalanceamento.categorias['Ações']?.ativos.find(a => a.ticker === ticker);
            const qtdAtual = posicao ? posicao.quantidade : 0, precoMedio = posicao ? posicao.precoMedio : 0, precoAtual = dadosMercado.valor || 0, lpa = dadosMercado.lpa_acao || 0;
            const vpa = dadosMercado.vpa || 0;
            const min52 = dadosMercado.min52 || 0, max52 = dadosMercado.max52 || 0;
            const projecaoAnualUnitaria = calcularProjecaoAnualUnitaria(ticker, { limiteAnos: 5 });
            const yieldProjetado = (precoAtual > 0 && projecaoAnualUnitaria > 0) ? projecaoAnualUnitaria / precoAtual : 0;
            const metaYieldBazin = acao.metaYieldBazin || 0.06;
            const precoTetoBazin = calcularPrecoTetoBazin(projecaoAnualUnitaria, metaYieldBazin);
            const precoTetoGraham = calcularPrecoTetoGraham(lpa, vpa);
            const pl = lpa > 0 ? (precoAtual / lpa) : 0;
            const payout = (lpa > 0 && projecaoAnualUnitaria > 0) ? (projecaoAnualUnitaria / lpa) : 0;
            const metaQtd = dadosDoAtivoNoBalanceamento ? Math.round(dadosDoAtivoNoBalanceamento.ideal.quantidade) : 0;
            const ajusteQtd = dadosDoAtivoNoBalanceamento ? Math.round(dadosDoAtivoNoBalanceamento.ajuste.quantidade) : 0;
            let ajusteQtdHtml = '0';
            if (ajusteQtd > 0) ajusteQtdHtml = `<span class="valor-positivo">+${ajusteQtd}</span>`;
            else if (ajusteQtd < 0) ajusteQtdHtml = `<span class="valor-negativo">${ajusteQtd}</span>`;
            const qtdSimulada = dadosSimulacao.qtd || 0, precoSimulado = dadosSimulacao.preco || precoAtual;
            const rendimentoAtual = (projecaoAnualUnitaria * qtdAtual) / 12;
            const diff = precoAtual - precoMedio;
            const diffPercent = precoMedio > 0 ? (diff / precoMedio) : 0;
            let classePreco = '', desempenhoHtml = '-';
            if (diffPercent > 0.0001) { classePreco = 'preco-maior'; desempenhoHtml = `<span class="preco-maior">↑ ${formatarPercentual(diffPercent)}</span>`; } 
            else if (diffPercent < -0.0001) { classePreco = 'preco-menor'; desempenhoHtml = `<span class="preco-menor">↓ ${formatarPercentual(Math.abs(diffPercent))}</span>`; }
            
            const hoje = new Date().toISOString().split('T')[0];
            let proximaDataComHtml = '';
            const proximoProvento = todosOsProventos
                .filter(p => p.ticker === ticker && p.dataCom >= hoje)
                .sort((a, b) => new Date(a.dataCom) - new Date(a.dataCom))[0];

            if (proximoProvento) {
                const dataFmt = new Date(proximoProvento.dataCom + 'T12:00:00').toLocaleDateString('pt-BR');
                proximaDataComHtml = `<small class="next-ex-date"><i class="fas fa-calendar-day"></i> Próx. Data-Com: ${dataFmt}</small>`;
            }

            htmlAcoes += `<tr data-ticker="${ticker}" data-qtd-atual="${qtdAtual}" data-dividendo-anual="${projecaoAnualUnitaria}" data-meta-yield-bazin="${metaYieldBazin}">
                <td><strong>${ticker}</strong>${proximaDataComHtml}</td>
                <td class="numero">${formatarPrecoMedio(precoMedio)}</td>
                <td class="numero ${classePreco}">${formatarMoeda(precoAtual)}</td>
                <td class="numero">${desempenhoHtml}</td>
                <td class="numero col-price-range-vertical"><span>${formatarMoeda(min52)}</span><span>${formatarMoeda(max52)}</span></td>
                <td class="numero">
                    <div class="bazin-cell-container">
                        <span data-field="precoTetoBazin">${formatarMoeda(precoTetoBazin)}</span>
                        <span class="meta-yield-display" title="Meta de Yield (do Cadastro de Ativos)">${formatarPercentual(metaYieldBazin)}</span>
                    </div>
                </td>
                <td class="numero">${formatarMoeda(precoTetoGraham)}</td>
                <td class="numero">${lpa > 0 ? formatarDecimal(pl) : 'N/A'}</td>
                <td class="numero">${lpa > 0 ? formatarPercentual(payout) : 'N/A'}</td>
                <td class="percentual">${yieldProjetado > 0 ? formatarPercentual(yieldProjetado) : 'N/A'}</td>
                <td class="numero col-qtd">${Math.round(qtdAtual)}</td>
                <td class="numero col-qtd">${metaQtd}</td>
                <td class="numero col-qtd">${ajusteQtdHtml}</td>
                <td class="numero col-qtd"><input type="number" class="input-in-table negociar-input-qtd" placeholder="0" value="${qtdSimulada || ''}"></td>
                <td class="numero"><input type="text" class="input-in-table negociar-input-preco" value="${formatarDecimalParaInput(precoSimulado)}"></td>
                <td class="numero" data-field="totalCompraSimulado">R$ 0,00</td>
                <td class="numero col-qtd" data-field="posicaoFinalSimulada">${Math.round(qtdAtual)}</td>
                <td class="numero" data-field="rendimentoAtual">${formatarMoeda(rendimentoAtual)}</td>
                <td class="numero" data-field="rendimentoPosCompra">${formatarMoeda(rendimentoAtual)}</td>
            </tr>`;
        });
        tbodyAcoes.innerHTML = htmlAcoes;
    }
    // Nota: O valor inicial aqui é apenas um placeholder, será atualizado pelo evento 'input' no final
    tfootAcoes.querySelector('[id^="total-rend-atual-"]').textContent = formatarMoeda(projecaoProventos.acoes);

    const containerTela = document.getElementById('tela-negociar');
    if (containerTela._listener) {
        containerTela.removeEventListener('input', containerTela._listener);
        containerTela.removeEventListener('change', containerTela._listener);
    }
    if (containerTela._keydownListener) {
        containerTela.removeEventListener('keydown', containerTela._keydownListener);
    }
    
    const recalcularAoInteragir = (e) => {
        if (!e.target.classList.contains('input-in-table')) return;
        const tr = e.target.closest('tr'); if (!tr) return;
        const ticker = tr.dataset.ticker;
        const tipoAtivo = tr.closest('tbody').id.includes('fiis') ? 'fiis' : 'acoes';
        
        let qtdSimulada = parseInt(tr.querySelector('.negociar-input-qtd').value, 10) || 0;
        const precoSimulado = parseDecimal(tr.querySelector('.negociar-input-preco').value) || 0;
    
        if (qtdSimulada > 0) {
            const aporteTotal = parseDecimal(document.getElementById('negociar-aporte-valor').value);
            let custoOutrasOperacoes = 0;
    
            ['fiis', 'acoes'].forEach(tipo => {
                for (const t in dadosSimulacaoNegociar[tipo]) {
                    if (t !== ticker) { 
                        const sim = dadosSimulacaoNegociar[tipo][t];
                        custoOutrasOperacoes += (sim.qtd || 0) * (sim.preco || 0);
                    }
                }
            });
            
            const saldoDisponivelAntesDestaCompra = aporteTotal - custoOutrasOperacoes;
    
            if (precoSimulado > 0 && (qtdSimulada * precoSimulado > saldoDisponivelAntesDestaCompra + 0.01)) {
                const maxQtdPossivel = Math.floor(saldoDisponivelAntesDestaCompra / precoSimulado);
                alert(`Saldo de aporte insuficiente. Com o saldo restante de ${formatarMoeda(saldoDisponivelAntesDestaCompra)}, você pode comprar no máximo ${maxQtdPossivel} unidade(s) deste ativo.`);
                qtdSimulada = maxQtdPossivel; 
                tr.querySelector('.negociar-input-qtd').value = qtdSimulada > 0 ? qtdSimulada : ''; 
            }
        }
    
        if (!dadosSimulacaoNegociar[tipoAtivo][ticker]) dadosSimulacaoNegociar[tipoAtivo][ticker] = {};
        dadosSimulacaoNegociar[tipoAtivo][ticker].qtd = qtdSimulada;
        dadosSimulacaoNegociar[tipoAtivo][ticker].preco = precoSimulado;
    
        tr.classList.remove('simulacao-compra', 'simulacao-venda');
        if (qtdSimulada > 0) {
            tr.classList.add('simulacao-compra');
        } else if (qtdSimulada < 0) {
            tr.classList.add('simulacao-venda');
        }
    
        const qtdAtual = parseFloat(tr.dataset.qtdAtual);
        tr.querySelector('[data-field="totalCompraSimulado"]').textContent = formatarMoeda(qtdSimulada * precoSimulado);
        tr.querySelector('[data-field="posicaoFinalSimulada"]').textContent = Math.round(qtdAtual + qtdSimulada);
        let totalRendPosCompraGrupo = 0;
        const tbody = tr.closest('tbody');
        
        if (tipoAtivo === 'fiis') {
            const ultimoProvento = parseFloat(tr.dataset.ultimoProvento);
            tr.querySelector('[data-field="rendimentoPosCompra"]').textContent = formatarMoeda(ultimoProvento * (qtdAtual + qtdSimulada));
        } else {
            const metaYieldBazin = parseFloat(tr.dataset.metaYieldBazin);
            delete dadosSimulacaoNegociar.acoes[ticker].bazinYield;
            const dividendoAnual = parseFloat(tr.dataset.dividendoAnual);
            tr.querySelector('[data-field="rendimentoPosCompra"]').textContent = formatarMoeda((dividendoAnual * (qtdAtual + qtdSimulada)) / 12);
            tr.querySelector('[data-field="precoTetoBazin"]').textContent = formatarMoeda(calcularPrecoTetoBazin(dividendoAnual, metaYieldBazin));
        }        
        
        // --- CORREÇÃO PRINCIPAL DE ARREDONDAMENTO ---
        // Recalcula o Total Atual somando os valores JÁ ARREDONDADOS que estão na tabela,
        // para garantir consistência com o Total Pós-Compra.
        let totalRendAtualGrupoRecalculado = 0;
        
        tbody.querySelectorAll('tr').forEach(row => {
            const rendAtualEl = row.querySelector('[data-field="rendimentoAtual"]');
            if (rendAtualEl) totalRendAtualGrupoRecalculado += parseDecimal(rendAtualEl.textContent);
            
            const rendPosCompraEl = row.querySelector('[data-field="rendimentoPosCompra"]');
            if (rendPosCompraEl) totalRendPosCompraGrupo += parseDecimal(rendPosCompraEl.textContent);
        });

        const tfoot = tbody.nextElementSibling;
        
        // Atualiza o label do total atual com a soma visual (para ser consistente)
        tfoot.querySelector(`[id^="total-rend-atual-"]`).textContent = formatarMoeda(totalRendAtualGrupoRecalculado);
        
        const diffRaw = totalRendPosCompraGrupo - totalRendAtualGrupoRecalculado;
        // Aplica tolerância extra para garantir zero limpo
        const diff = Math.abs(diffRaw) < 0.005 ? 0 : diffRaw;
        
        tfoot.querySelector(`[id^="total-rend-pos-compra-"]`).textContent = formatarMoeda(totalRendPosCompraGrupo);
        const diffEl = tfoot.querySelector(`[id^="diff-rend-"]`);
        diffEl.textContent = formatarMoeda(diff);
        diffEl.className = `numero ${diff > 0.005 ? 'valor-positivo' : diff < -0.005 ? 'valor-negativo' : ''}`;
        
        atualizarResumoAporte();
        if (e.type === 'change') { 
            salvarDadosSimulacaoNegociar(); 
        }
    };
    containerTela._listener = recalcularAoInteragir;
    containerTela.addEventListener('input', containerTela._listener);
    containerTela.addEventListener('change', containerTela._listener);

    const handleEnterKey = (e) => {
        if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
            e.preventDefault();
            e.target.blur();
        }
    };
    containerTela._keydownListener = handleEnterKey;
    containerTela.addEventListener('keydown', containerTela._keydownListener);
    
    // Dispara o evento inicial para calcular os totais corretos já na carga
    containerTela.querySelectorAll('tbody tr .input-in-table').forEach(input => {
        input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    });
}
function atualizarIconeDeAlertasGlobal(posicoesRV_opcional, dadosBrutos_opcional) {
    // Garante que os dados existam
    const hoje = new Date().toISOString().split('T')[0];
    const posicoesRV = posicoesRV_opcional || gerarPosicaoDetalhada(hoje);
    const dadosBrutos = dadosBrutos_opcional || gerarDadosBalanceamento('todos');
    
    // Chama o motor de cálculo
    const alertas = verificarAlertasDashboard(posicoesRV, dadosBrutos);
    
    // Conta apenas as oportunidades REAIS (Lucro > 10% + Critério do Modo)
    const count = alertas.oportunidades.length;
    
    // Atualiza o ícone e o contador na interface
    const icon = document.getElementById('dashboard-alert-icon');
    const badge = document.getElementById('dashboard-alert-badge');
    
    if (icon && badge) {
        if (count > 0) {
            icon.classList.add('alerta-ativo');
            badge.textContent = count;
            badge.style.display = 'flex';
            // Tooltip dinâmico
            icon.parentElement.setAttribute('title', `${count} Oportunidade(s) de Realização`);
        } else {
            icon.classList.remove('alerta-ativo');
            badge.style.display = 'none';
            icon.parentElement.setAttribute('title', 'Status da Carteira');
        }
    }
}

async function aplicarPlanoDeAcaoParaSimulacao() {
    const btn = document.getElementById('btn-levar-plano-para-negociar');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
    btn.disabled = true;
    isNavigating = true; 

    try {
        const aporteDinheiroNovo = parseDecimal(document.getElementById('balanceamento-aporte-valor').value || '0');

        const elementoAporteRF = document.querySelector('#plano-de-acao-container .ticker-aporte');
        let valorAporteRF = 0;
        if (elementoAporteRF) {
            const containerItem = elementoAporteRF.closest('.rebalanceamento-item');
            if ((elementoAporteRF.textContent.includes('Renda Fixa') || elementoAporteRF.textContent.includes('Fixed Income')) && !containerItem.classList.contains('item-pausado')) {
                const elementoValor = containerItem.querySelector('strong.valor-positivo');
                if (elementoValor) {
                    valorAporteRF = parseDecimal(elementoValor.textContent);
                }
            }
        }
        
        const aporteLiquidoParaRV = aporteDinheiroNovo - valorAporteRF;

        dadosSimulacaoNegociar = { fiis: {}, acoes: {}, aporteTotal: '' };
        
        planoDeAcaoAtual.vendas.forEach(item => {
            if (estadoSelecaoVendas[item.ticker] !== false) {
                const ativoInfo = todosOsAtivos.find(a => a.ticker === item.ticker);
                if (!ativoInfo) return;
                const tipo = ativoInfo.tipo === 'Ação' ? 'acoes' : 'fiis';
                dadosSimulacaoNegociar[tipo][item.ticker] = {
                    qtd: -item.qtd, 
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
        
        alert('Action plan loaded in the simulation screen!');

    } catch (error) {
        console.error("Erro ao levar plano para simulação:", error);
        alert("An error occurred while loading the plan. Try again.");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
        isNavigating = false; 
    }
}



function renderizarCalendarioGeral() {
    const container = document.getElementById('container-calendario-geral');
    const filtroCorretora = document.getElementById('calendario-geral-filtro-corretora')?.value || 'consolidado';
    
    const calendarioData = {}; 

    const initCalendarioData = (ano, mes, tipo) => {
        if (!calendarioData[ano]) calendarioData[ano] = Array.from({ length: 12 }, () => ({}));
        if (!calendarioData[ano][mes][tipo]) calendarioData[ano][mes][tipo] = [];
    };

    todosOsProventos.forEach(p => {
        if (!p.dataPagamento) return;
        let valorConsiderado = (filtroCorretora === 'consolidado') ? p.valorTotalRecebido : (p.posicaoPorCorretora[filtroCorretora]?.valorRecebido || 0);
        if (valorConsiderado === 0) return;

        const data = new Date(p.dataPagamento + 'T12:00:00');
        const ano = data.getUTCFullYear();
        const mes = data.getUTCMonth();
        const ativoInfo = todosOsAtivos.find(a => a.ticker === p.ticker);
        const tipoAtivo = ativoInfo ? ativoInfo.tipo : 'Outro';

        initCalendarioData(ano, mes, tipoAtivo);
        calendarioData[ano][mes][tipoAtivo].push({
            ticker: p.ticker, dataCom: p.dataCom, dataPagamento: p.dataPagamento,
            valorIndividual: p.valorIndividual, valor: valorConsiderado
        });
    });

    const rendimentosRFPorAtivo = {};
    todosOsRendimentosRFNaoRealizados.forEach(r => {
        const ativoRF = todosOsAtivosRF.find(a => a.id === r.ativoId);
        if (!ativoRF || (filtroCorretora !== 'consolidado' && ativoRF.instituicao !== filtroCorretora)) return;
        const chaveMes = r.data.substring(0, 7);
        if (!rendimentosRFPorAtivo[r.ativoId]) rendimentosRFPorAtivo[r.ativoId] = {};
        if (!rendimentosRFPorAtivo[r.ativoId][chaveMes]) rendimentosRFPorAtivo[r.ativoId][chaveMes] = [];
        rendimentosRFPorAtivo[r.ativoId][chaveMes].push(r.rendimento);
    });

    for (const ativoId in rendimentosRFPorAtivo) {
        let ultimoRendimento = 0;
        Object.keys(rendimentosRFPorAtivo[ativoId]).sort().forEach(chaveMes => {
            const [ano, mes] = chaveMes.split('-').map(Number);
            const rendimentosDoMes = rendimentosRFPorAtivo[ativoId][chaveMes];
            const rendimentoFinalMes = rendimentosDoMes[rendimentosDoMes.length - 1];
            const rendimentoIncremental = rendimentoFinalMes - ultimoRendimento;
            
            if (rendimentoIncremental > 0) {
                 const ativoRF = todosOsAtivosRF.find(a => String(a.id) === ativoId);
                 initCalendarioData(ano, mes - 1, 'Renda Fixa');
                 calendarioData[ano][mes - 1]['Renda Fixa'].push({
                     descricao: ativoRF.descricao, valor: rendimentoIncremental
                 });
            }
            ultimoRendimento = rendimentoFinalMes;
        });
    }
    
    const anosOrdenados = Object.keys(calendarioData).sort((a, b) => b - a);
    if (anosOrdenados.length === 0) {
        container.innerHTML = `<p>No yield found for the selected filter.</p>`;
        return;
    }
    
    let htmlFinal = '';
    const meses = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    anosOrdenados.forEach(ano => {
        htmlFinal += `<div class="calendario-ano-container"><h3>${ano}</h3><table>`;
        htmlFinal += `<thead><tr><th>Asset Class</th>`;
        meses.forEach(mes => htmlFinal += `<th class="header-numero">${mes}</th>`);
        htmlFinal += `<th class="header-numero">Year Total</th></tr></thead><tbody>`;

        const totaisMensais = Array(12).fill(0);

        const tiposDeAtivoComDados = new Set();
        if (calendarioData[ano]) {
            for (let i = 0; i < 12; i++) {
                if (calendarioData[ano][i]) {
                    Object.keys(calendarioData[ano][i]).forEach(tipo => {
                        if (calendarioData[ano][i][tipo].length > 0) {
                            tiposDeAtivoComDados.add(tipo);
                        }
                    });
                }
            }
        }
        const tiposOrdenados = Array.from(tiposDeAtivoComDados).sort();

        tiposOrdenados.forEach(tipo => {
            let tipoFmt = tipo;
            if (tipo === 'Ação') tipoFmt = 'Shares';
            if (tipo === 'FII') tipoFmt = 'REITs';
            if (tipo === 'Renda Fixa') tipoFmt = 'Fixed Income';

            htmlFinal += `<tr><td><strong>${tipoFmt}</strong></td>`;
            let totalTipoNoAno = 0;
            for (let i = 0; i < 12; i++) {
                const dadosDoMes = calendarioData[ano]?.[i]?.[tipo] || [];
                const valorMes = dadosDoMes.reduce((soma, item) => soma + item.valor, 0);

                const classeClicavel = valorMes !== 0 ? 'valor-clicavel' : '';
                const dataAttributes = valorMes !== 0 ? `data-ano="${ano}" data-mes="${i}" data-tipo="${tipo}"` : '';
                
                htmlFinal += `<td class="numero ${classeClicavel}" ${dataAttributes}>${valorMes !== 0 ? formatarMoeda(valorMes) : '-'}</td>`;
                totalTipoNoAno += valorMes;
                totaisMensais[i] += valorMes;
            }
            htmlFinal += `<td class="numero"><strong>${formatarMoeda(totalTipoNoAno)}</strong></td></tr>`;
        });

        htmlFinal += `<tr class="total-row"><td style="text-align: right;"><strong>TOTALS</strong></td>`;
        let totalGeralAno = 0;
        for (let i = 0; i < 12; i++) {
            htmlFinal += `<td class="numero">${formatarMoeda(totaisMensais[i])}</td>`;
            totalGeralAno += totaisMensais[i];
        }
        htmlFinal += `<td class="numero"><strong>${formatarMoeda(totalGeralAno)}</strong></td></tr>`;
        htmlFinal += '</tbody></table></div>';
    });

    container.innerHTML = htmlFinal;

    container.addEventListener('click', (e) => {
        const targetCell = e.target.closest('.valor-clicavel');
        if (targetCell) {
            const { ano, mes, tipo } = targetCell.dataset;
            abrirModalDetalhesRendimentoMensal(ano, mes, tipo, calendarioData);
        }
    });
}

function renderizarTabelaProventosAnuais(dados) {
    const container = document.getElementById('container-proventos-anuais');
    const footnotesContainer = document.getElementById('footnotes-proventos-anuais');
    let hasProjected = false;
    let hasFuture = false;

    let tableHtml = `<table class="dashboard-table">
        <thead>
            <tr>
                <th>Year</th>
                <th class="numero">Shares</th>
                <th class="numero">REITs</th>
                <th class="numero">ETFs</th>
                <th class="numero">Total VI</th>
                <th class="numero">Fixed Income</th>
                <th class="numero">Grand Total</th>
                <th class="numero">Daily Avg</th>
                <th class="numero">Monthly Avg</th>
            </tr>
        </thead>
        <tbody>
    `;

    const anosOrdenados = Object.keys(dados).sort((a, b) => b - a);

    anosOrdenados.forEach(ano => {
        const d = dados[ano];
        let classesMedia = '';
        let footnoteMarker = '';

        if (d.isProjected) {
            classesMedia = 'valor-projetado';
            footnoteMarker = '*';
            hasProjected = true;
        }
        if (d.isFuture) {
            classesMedia = 'valor-projetado';
            footnoteMarker = '**';
            hasFuture = true;
        }
        
        tableHtml += `
            <tr>
                <td><strong>${ano}</strong></td>
                <td class="numero">${formatarMoeda(d['Ação'])}</td>
                <td class="numero">${formatarMoeda(d['FII'])}</td>
                <td class="numero">${formatarMoeda(d['ETF'])}</td>
                <td class="numero"><strong>${formatarMoeda(d['Total RV'])}</strong></td>
                <td class="numero">${formatarMoeda(d['Renda Fixa'])}</td>
                <td class="numero"><strong>${formatarMoeda(d['Total Geral'])}</strong></td>
                <td class="numero ${classesMedia}">${formatarMoeda(d['MediaDiaria'])}${footnoteMarker}</td>
                <td class="numero ${classesMedia}">${formatarMoeda(d['MediaMensal'])}${footnoteMarker}</td>
            </tr>
        `;
    });

    tableHtml += `</tbody></table>`;
    container.innerHTML = tableHtml;

    let footnotesHtml = '';
    if (hasProjected) {
        footnotesHtml += `<p><strong>*</strong> Projected values: Average calculated based on yields received to date and projected for the entire year.</p>`;
    }
    if (hasFuture) {
        footnotesHtml += `<p><strong>**</strong> Values for future years: Calculated based on already announced income with a future pay date.</p>`;
    }
    footnotesContainer.innerHTML = footnotesHtml;
}

function abrirModalProventosAnuais() {
    const modal = document.getElementById('modal-proventos-anuais');
    document.getElementById('container-proventos-anuais').innerHTML = '<h4>Calculating...</h4>';
    modal.style.display = 'block';

    setTimeout(() => {
        const dados = gerarDadosProventosAnuais();
        renderizarTabelaProventosAnuais(dados);
    }, 50);
}

function atualizarStatusBotaoIR() {
    const anoSelecionado = document.getElementById('ir-filtro-ano').value;
    const anoAtual = new Date().getFullYear();
    const btnImprimir = document.getElementById('btn-imprimir-ir');
    
    if (parseInt(anoSelecionado, 10) === anoAtual) {
        btnImprimir.classList.add('icone-titulo-desabilitado');
        btnImprimir.title = "Cannot generate the report for the current year.";
    } else {
        btnImprimir.classList.remove('icone-titulo-desabilitado');
        btnImprimir.title = "Print Tax Report";
    }
}


function abrirModalDetalhesIR(ano, mes) {
    const dadosIR = calcularImpostoRendaAnual(ano);
    const meses = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const chaveMes = `${ano}-${String(mes + 1).padStart(2, '0')}`;
    
    if (!dadosIR[chaveMes]) {
        alert('Data not found for this month.');
        return;
    }

    const dadosGeral = dadosIR[chaveMes]['geral_rv'];
    const dadosFiis = dadosIR[chaveMes]['fiis'];
    const dadosDT = dadosIR[chaveMes]['daytrade'];

    const titulo = `Tax Details - ${meses[mes]} ${ano}`;
    document.getElementById('modal-detalhes-ir-titulo').textContent = titulo;
    const container = document.getElementById('modal-detalhes-ir-conteudo');

    const vendasOpsGeral = dadosGeral.operacoes.filter(op => op.tipo === 'venda');
    const vendasOutrasAcoes = vendasOpsGeral.filter(op => op.tipoAcao !== 'Unit' && todosOsAtivos.find(a => a.ticker === op.ativo)?.tipo === 'Ação');
    const totalVendasOutrasAcoesBruto = vendasOutrasAcoes.reduce((sum, op) => sum + op.valor, 0);

    const resultadoIsento = (totalVendasOutrasAcoesBruto <= configuracoesFiscais.limiteIsencaoAcoes) 
        ? vendasOutrasAcoes.reduce((sum, op) => op.resultado > 0 ? sum + op.resultado : sum, 0)
        : 0;

    const resultadoTributavelAcoes = (totalVendasOutrasAcoesBruto > configuracoesFiscais.limiteIsencaoAcoes)
        ? vendasOutrasAcoes.filter(op => op.resultado > 0).reduce((sum, op) => sum + op.resultado, 0)
        : 0;
        
    const resultadoTributavelUnits = vendasOpsGeral.filter(op => op.tipoAcao === 'Unit' && op.resultado > 0).reduce((sum, op) => sum + op.resultado, 0);
    const resultadoTributavelETFs = vendasOpsGeral.filter(op => todosOsAtivos.find(a => a.ticker === op.ativo)?.tipo === 'ETF' && op.resultado > 0).reduce((sum, op) => sum + op.resultado, 0);
    const resultadoMesTributavel = resultadoTributavelAcoes + resultadoTributavelUnits + resultadoTributavelETFs;

    let irrfDoMes = 0;
    todasAsNotas.filter(n => n.data.startsWith(chaveMes)).forEach(n => {
        irrfDoMes += (n.irrf || 0);
    });

    const impostoTotalGeral = dadosGeral.impostoDevido + dadosFiis.impostoDevido + dadosDT.impostoDevido;
    const impostoFinal = Math.max(0, impostoTotalGeral - irrfDoMes);

    let html = `
        <div class="ir-detalhes-container">
            <div class="ir-detalhes-secao">
                <h4>General (Shares, ETFs, etc.) - SWING TRADE</h4>
                <table class="ir-detalhes-tabela">
                    <tbody>
                        <tr><td>Month Result (Gross)</td><td class="numero">${formatarMoeda(dadosGeral.resultadoMes)}</td></tr>
                        <tr><td>&nbsp;&nbsp;&nbsp;↳ Exempt Result (Shares ON/PN)</td><td class="numero">${formatarMoeda(resultadoIsento)}</td></tr>
                        <tr><td>&nbsp;&nbsp;&nbsp;↳ Taxable Profit (Shares ON/PN)</td><td class="numero">${formatarMoeda(resultadoTributavelAcoes)}</td></tr>
                        <tr><td>&nbsp;&nbsp;&nbsp;↳ Taxable Profit (Units)</td><td class="numero">${formatarMoeda(resultadoTributavelUnits)}</td></tr>
                        <tr><td>&nbsp;&nbsp;&nbsp;↳ Taxable Profit (ETFs)</td><td class="numero">${formatarMoeda(resultadoTributavelETFs)}</td></tr>
                        <tr><td>(-) Loss to Offset</td><td class="numero valor-negativo">${formatarMoeda(dadosGeral.prejuizoAnterior)}</td></tr>
                        <tr><td>(+/-) Manual Adjustment</td><td class="numero">${formatarMoeda(dadosGeral.ajusteManual)}</td></tr>
                        <tr class="ir-detalhes-linha-subtotal"><td>(=) Calculation Base / Loss to Offset</td><td class="numero">${formatarMoeda(dadosGeral.baseDeCalculo > 0 ? dadosGeral.baseDeCalculo : (dadosGeral.prejuizoAnterior + dadosGeral.resultadoMes + dadosGeral.ajusteManual))}</td></tr>
                        <tr><td>Tax Due (${formatarPercentual(configuracoesFiscais.aliquotaAcoes)})</td><td class="numero">${formatarMoeda(dadosGeral.impostoDevido)}</td></tr>
                    </tbody>
                </table>
            </div>

            <div class="ir-detalhes-secao">
                <h4>REITs</h4>
                <table class="ir-detalhes-tabela">
                    <tbody>
                        <tr><td>Calculation Base / Loss to Offset</td><td class="numero">${formatarMoeda(dadosFiis.baseDeCalculo > 0 ? dadosFiis.baseDeCalculo : (dadosFiis.prejuizoAnterior + dadosFiis.resultadoMes + dadosFiis.ajusteManual))}</td></tr>
                        <tr><td>Tax Due (${formatarPercentual(configuracoesFiscais.aliquotaFiisDt)})</td><td class="numero">${formatarMoeda(dadosFiis.impostoDevido)}</td></tr>
                    </tbody>
                </table>
            </div>

            <div class="ir-detalhes-secao">
                <h4>Day Trade Operations</h4>
                <table class="ir-detalhes-tabela">
                     <tbody>
                        <tr><td>Calculation Base / Loss to Offset</td><td class="numero">${formatarMoeda(dadosDT.baseDeCalculo > 0 ? dadosDT.baseDeCalculo : (dadosDT.prejuizoAnterior + dadosDT.resultadoMes + dadosDT.ajusteManual))}</td></tr>
                        <tr><td>Tax Due (${formatarPercentual(configuracoesFiscais.aliquotaFiisDt)})</td><td class="numero">${formatarMoeda(dadosDT.impostoDevido)}</td></tr>
                    </tbody>
                </table>
            </div>
            
            <div class="ir-detalhes-secao">
                <h4>Final Summary</h4>
                 <table class="ir-detalhes-tabela">
                    <tbody>
                        <tr><td>Total Monthly Tax</td><td class="numero">${formatarMoeda(impostoTotalGeral)}</td></tr>
                        <tr><td>(-) WHT to Deduct</td><td class="numero valor-negativo">${formatarMoeda(irrfDoMes)}</td></tr>
                        <tr class="ir-detalhes-linha-total"><td>(=) Tax Due (DARF)</td><td class="numero">${formatarMoeda(impostoFinal)}</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    container.innerHTML = html;
    abrirModal('modal-detalhes-ir-mes');
}

function renderizarCalculadoraIR() {
    const anoSelecionado = document.getElementById('ir-filtro-ano').value;
    if (!anoSelecionado) return;

    document.getElementById('ir-limite-isencao-texto').textContent = formatarMoeda(configuracoesFiscais.limiteIsencaoAcoes);

    const dadosIR = calcularImpostoRendaAnual(anoSelecionado);
    let totalAnual = 0;

    const meses = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    const gerarTabelaHtml = (dados, tipo) => {
        let tableHtml = `<table><thead><tr>
            <th>Month</th>
            <th class="right-aligned-header">Total Sales</th>
            <th class="right-aligned-header">Loss to Offset</th>
            <th class="right-aligned-header">Month Result</th>
            <th class="right-aligned-header">Loss to Offset (post-result)</th>
            <th class="right-aligned-header">Calculation Base</th>
            <th class="right-aligned-header">Tax Due</th>
        </tr></thead><tbody>`;

        for (let i = 0; i < 12; i++) {
            const mesStr = String(i + 1).padStart(2, '0');
            const chaveMes = `${anoSelecionado}-${mesStr}`;
            const dadosMes = dados[chaveMes][tipo];
            
            const resultadoAjustado = dadosMes.resultadoMes + dadosMes.ajusteManual;
            
            let prejuizoPosResultado;

            if (tipo === 'geral_rv') {
                const vendasOps = dadosMes.operacoes.filter(op => op.tipo === 'venda');
                const vendasOutrasAcoes = vendasOps.filter(op => op.tipoAcao !== 'Unit' && todosOsAtivos.find(a => a.ticker === op.ativo)?.tipo === 'Ação');
                const totalVendasOutrasAcoesBruto = vendasOutrasAcoes.reduce((sum, op) => sum + op.valor, 0);

                const resultadoUnits = vendasOps.filter(op => op.tipoAcao === 'Unit').reduce((sum, op) => sum + op.resultado, 0);
                const resultadoETFs = vendasOps.filter(op => todosOsAtivos.find(a => a.ticker === op.ativo)?.tipo === 'ETF').reduce((sum, op) => sum + op.resultado, 0);
                const resultadoOutrasAcoes = vendasOutrasAcoes.reduce((sum, op) => sum + op.resultado, 0);

                let resultadoTributavelDoMes = 0;
                if (resultadoUnits > 0) resultadoTributavelDoMes += resultadoUnits;
                if (resultadoETFs > 0) resultadoTributavelDoMes += resultadoETFs;

                if (totalVendasOutrasAcoesBruto > configuracoesFiscais.limiteIsencaoAcoes && resultadoOutrasAcoes > 0) {
                    resultadoTributavelDoMes += resultadoOutrasAcoes;
                }
                resultadoTributavelDoMes += dadosMes.ajusteManual;
                
                prejuizoPosResultado = Math.min(0, dadosMes.prejuizoAnterior + resultadoTributavelDoMes);

            } else {
                prejuizoPosResultado = Math.min(0, dadosMes.prejuizoAnterior + resultadoAjustado);
            }

            let prejuizoCellHtml;
            const prejuizoDoMes = Math.abs(dadosMes.prejuizoAnterior);
            
            if (i === 0) {
                const chaveAjustePrejuizo = `${anoSelecionado}-00_${tipo}`;
                prejuizoCellHtml = `<td class="numero editable-prejudice-cell" 
                                        contenteditable="true"
                                        data-chave-ajuste-prejuizo="${chaveAjustePrejuizo}"
                                        data-prejuizo-calculado="${prejuizoDoMes}"
                                        title="Accumulated loss from previous years. Click to set an initial value for this year.">${formatarMoeda(prejuizoDoMes)}</td>`;
            } else {
                prejuizoCellHtml = `<td class="numero">${formatarMoeda(prejuizoDoMes)}</td>`;
            }

            const classeAjustado = dadosMes.ajusteManual !== 0 ? 'adjusted' : '';
            const tooltipAjuste = dadosMes.ajusteManual !== 0 ? `title="Original Value: ${formatarMoeda(dadosMes.resultadoMes)} | Adjustment: ${formatarMoeda(dadosMes.ajusteManual)}"` : '';
            
            tableHtml += `
                <tr class="linha-mes-ir" data-mes="${i}" data-tipo="${tipo}">
                    <td>${meses[i]}</td>
                    <td class="numero">${formatarMoeda(dadosMes.totalVendas)}</td>
                    ${prejuizoCellHtml}
                    <td class="numero editable-result ${classeAjustado} ${resultadoAjustado >= 0 ? 'lucro' : 'prejuizo'}" 
                        contenteditable="true" 
                        data-chave-ajuste="${chaveMes}_${tipo}"
                        data-resultado-calculado="${dadosMes.resultadoMes}"
                        ${tooltipAjuste}>${formatarMoeda(resultadoAjustado)}</td>
                    <td class="numero ${prejuizoPosResultado < 0 ? 'prejuizo' : ''}">${formatarMoeda(Math.abs(prejuizoPosResultado))}</td>
                    <td class="numero">${formatarMoeda(dadosMes.baseDeCalculo)}</td>
                    <td class="numero ${dadosMes.impostoDevido > 0 ? 'imposto-clicavel' : ''}" data-ano="${anoSelecionado}" data-mes="${i}">${formatarMoeda(dadosMes.impostoDevido)}</td>
                </tr>
            `;
        }
        tableHtml += '</tbody></table>';
        return tableHtml;
    };
    
    const containerFiis = document.getElementById('ir-tabela-fiis');
    const containerGeralRV = document.getElementById('ir-tabela-geral-rv');
    const containerDaytrade = document.getElementById('ir-tabela-daytrade');

    containerFiis.innerHTML = gerarTabelaHtml(dadosIR, 'fiis');
    containerGeralRV.innerHTML = gerarTabelaHtml(dadosIR, 'geral_rv');
    containerDaytrade.innerHTML = gerarTabelaHtml(dadosIR, 'daytrade');

    ['fiis', 'geral_rv', 'daytrade'].forEach(tipo => {
        for (let i = 0; i < 12; i++) {
            const mesStr = String(i + 1).padStart(2, '0');
            const chaveMes = `${anoSelecionado}-${mesStr}`;
            if (dadosIR[chaveMes] && dadosIR[chaveMes][tipo]) {
                totalAnual += dadosIR[chaveMes][tipo].impostoDevido;
            }
        }
    });
    
    document.getElementById('ir-total-anual').textContent = formatarMoeda(totalAnual);
    
    const attachCellListeners = (containerElement) => {
        if (!containerElement) return;
        containerElement.addEventListener('blur', (e) => {
            const target = e.target;
            if (target.classList.contains('editable-result') || target.classList.contains('editable-prejudice-cell')) {
                salvarAjusteIR(target);
            }
        }, true);

        containerElement.addEventListener('keydown', (e) => {
            const target = e.target;
            if (e.key === 'Enter' && (target.classList.contains('editable-result') || target.classList.contains('editable-prejudice-cell'))) {
                e.preventDefault();
                target.blur();
            }
        });

        containerElement.addEventListener('click', (e) => {
            const target = e.target;
            if (target.classList.contains('imposto-clicavel')) {
                abrirModalDetalhesIR(target.dataset.ano, parseInt(target.closest('tr').dataset.mes));
                return;
            }
            
            if (target.closest('.editable-result, .editable-prejudice-cell')) {
                return;
            }

            const linhaClicada = e.target.closest('.linha-mes-ir');
            if (!linhaClicada) return;

            const proximoElemento = linhaClicada.nextElementSibling;
            
            if (proximoElemento && proximoElemento.classList.contains('ir-details-row')) {
                proximoElemento.remove();
                return;
            }

            document.querySelectorAll('.ir-details-row').forEach(row => row.remove());
            
            const ano = document.getElementById('ir-filtro-ano').value;
            const mes = parseInt(linhaClicada.dataset.mes);
            const tipo = linhaClicada.dataset.tipo;
            const chaveMes = `${ano}-${String(mes + 1).padStart(2, '0')}`;
            const operacoes = dadosIR[chaveMes][tipo].operacoes;
            
            if (operacoes.length === 0) return;

            let detailsHtml = `<table class="ir-details-table"><thead><tr>
                <th>Transaction</th><th>Asset</th><th>Date</th>
                <th class="numero">Qty.</th><th class="numero">Net Value</th>
                <th class="numero">Acquisition Cost</th><th class="numero">Result</th>
            </tr></thead><tbody>`;
            
            operacoes.forEach(op => {
                if(op.tipo === 'venda') {
                     detailsHtml += `<tr>
                        <td>Sale</td><td>${op.ativo}</td>
                        <td>${new Date(op.data + 'T12:00:00').toLocaleDateString('en-GB')}</td>
                        <td class="numero">${op.quantidade}</td>
                        <td class="numero">${formatarMoeda(op.valorVendaLiquida)}</td>
                        <td class="numero">${formatarMoeda(op.custoAquisicao)}</td>
                        <td class="numero ${op.resultado >= 0 ? 'lucro' : 'prejuizo'}">${formatarMoeda(op.resultado)}</td>
                    </tr>`;
                } else {
                     detailsHtml += `<tr style="background-color: #f0f9ff;">
                        <td>Buy</td><td>${op.ativo}</td>
                        <td>${new Date(op.data + 'T12:00:00').toLocaleDateString('en-GB')}</td>
                        <td class="numero">${op.quantidade}</td>
                        <td class="numero">${formatarMoeda(op.valorCompra)}</td>
                        <td class="numero">${formatarMoeda(op.valorCompra)}</td>
                        <td class="numero">-</td>
                    </tr>`;
                }
            });

            detailsHtml += `</tbody></table>`;
            const newRow = document.createElement('tr');
            newRow.className = 'ir-details-row';
            newRow.innerHTML = `<td colspan="7">${detailsHtml}</td>`;
            linhaClicada.parentNode.insertBefore(newRow, linhaClicada.nextElementSibling);
        });
    };

    attachCellListeners(containerFiis);
    attachCellListeners(containerGeralRV);
    attachCellListeners(containerDaytrade);
}

function renderizarPosicoesZeradas() {
    const container = document.getElementById('container-posicoes-zeradas');
    const dados = gerarRelatorioPosicoesZeradas();
    
    if (dados.length === 0) {
        container.innerHTML = "<p>No zeroed positions found in your history.</p>";
        return;
    }

    let tableHtml = `<table><thead><tr>
        <th>Asset</th>
        <th>Position Start Date</th>
        <th>Position End Date</th>
    </tr></thead><tbody>`;

    dados.sort((a,b) => new Date(b.dataEncerramento) - new Date(a.dataEncerramento)).forEach(item => {
        tableHtml += `
            <tr>
                <td>${item.ticker}</td>
                <td>${new Date(item.dataInicio + 'T12:00:00').toLocaleDateString('en-GB')}</td>
                <td>${new Date(item.dataEncerramento + 'T12:00:00').toLocaleDateString('en-GB')}</td>
            </tr>
        `;
    });

    tableHtml += "</tbody></table>";
    container.innerHTML = tableHtml;
}

function gerarHistoricoCompletoParaAtivo(ticker) {
    const historico = [];
    const pos = { quantidade: 0, precoMedio: 0, porCorretora: {} };
    let eventos = [];

    posicaoInicial.filter(p => p.ticker === ticker).forEach(p => eventos.push({ data: p.data, tipo: p.tipoRegistro, payload: p }));
    todasAsNotas.forEach(n => {
        n.operacoes.filter(op => op.ativo === ticker).forEach(op => {
            eventos.push({ data: n.data, tipo: 'OPERACAO_NOTA', payload: { ...op, custosNota: n.custos, irrfNota: n.irrf, corretora: n.corretora, numeroNota: n.numero, totalOperacoesNota: n.operacoes.reduce((soma, op) => soma + op.valor, 0) } });
        });
    });
    todosOsAjustes.forEach(a => {
        if ((a.tipoAjuste === 'transferencia' && a.ativosTransferidos.some(at => at.ticker === ticker)) || (a.ticker === ticker)) {
             eventos.push({ data: a.data, tipo: a.tipoAjuste, payload: a });
        }
    });

    eventos.sort((a,b) => new Date(a.data) - new Date(b.data));

    eventos.forEach(evento => {
        let descricaoTransacao = '';
        let precoUnitario = null;
        const payload = evento.payload;

        switch(evento.tipo) {
            case 'SUMARIO_MANUAL': {
                let qtdTotalSumario = 0;
                payload.posicoesPorCorretora.forEach(pc => {
                    pos.porCorretora[pc.corretora] = (pos.porCorretora[pc.corretora] || 0) + pc.quantidade;
                    qtdTotalSumario += pc.quantidade;
                });
                pos.quantidade = qtdTotalSumario;
                pos.precoMedio = payload.precoMedio;
                descricaoTransacao = 'Initial Manual Position';
                precoUnitario = payload.precoMedio;
                break;
            }
            case 'TRANSACAO_HISTORICA': {
                const corretora = payload.corretora;
                const quantidade = payload.quantidade;
                if (payload.transacao.toLowerCase() === 'compra') {
                    pos.quantidade += quantidade;
                    pos.porCorretora[corretora] = (pos.porCorretora[corretora] || 0) + quantidade;
                    pos.precoMedio = payload.precoMedio;
                    precoUnitario = null;
                } else {
                    pos.quantidade -= quantidade;
                    pos.porCorretora[corretora] = (pos.porCorretora[corretora] || 0) - quantidade;
                    pos.precoMedio = payload.precoMedio;
                    precoUnitario = (payload.valorVenda && quantidade > 0) ? payload.valorVenda / quantidade : 0;
                }
                const txType = payload.transacao.toLowerCase() === 'compra' ? 'Buy' : 'Sell';
                descricaoTransacao = `History: ${txType} of ${payload.quantidade}`;
                break;
            }
            case 'OPERACAO_NOTA': {
                const corretora = payload.corretora;
                const qtdAnterior = pos.quantidade;
                const pmAnterior = pos.precoMedio;
                const qtdOperacao = payload.quantidade;
                const custoRateado = payload.totalOperacoesNota > 0 ? (payload.valor / payload.totalOperacoesNota) * (payload.custosNota + payload.irrfNota) : 0;
                
                if (payload.tipo.toLowerCase() === 'compra') {
                    const precoCompraComCustos = qtdOperacao > 0 ? (payload.valor + custoRateado) / qtdOperacao : 0;
                    const novoTotalFinanceiro = (qtdAnterior * pmAnterior) + (qtdOperacao * precoCompraComCustos);
                    pos.quantidade += qtdOperacao;
                    pos.precoMedio = pos.quantidade > 0 ? novoTotalFinanceiro / pos.quantidade : 0;
                    pos.porCorretora[corretora] = (pos.porCorretora[corretora] || 0) + qtdOperacao;
                    precoUnitario = precoCompraComCustos;
                } else {
                    pos.quantidade -= qtdOperacao;
                    pos.porCorretora[corretora] = (pos.porCorretora[corretora] || 0) - qtdOperacao;
                    precoUnitario = qtdOperacao > 0 ? (payload.valor - custoRateado) / qtdOperacao : 0;
                }
                const txType = payload.tipo.toLowerCase() === 'compra' ? 'Buy' : 'Sell';
                descricaoTransacao = `Note ${payload.numeroNota}: ${txType} of ${payload.quantidade}`;
                break;
            }
            case 'evento_ativo': {
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
                    precoUnitario = pmEntrada;
                } else {
                     payload.detalhes.forEach(detalhe => {
                        pos.porCorretora[detalhe.corretora] -= detalhe.quantidade;
                        pos.quantidade -= detalhe.quantidade;
                    });
                    precoUnitario = 0;
                }
                const evType = payload.tipoEvento === 'entrada' ? 'Inflow' : 'Outflow';
                 descricaoTransacao = `Event: ${evType} of ${payload.detalhes.reduce((acc, d) => acc + d.quantidade, 0)}`;
                if (pos.quantidade < 0.000001) pos.precoMedio = 0;
                break;
            }
            case 'transferencia': {
                const ativoT = payload.ativosTransferidos.find(at => at.ticker === ticker);
                if (ativoT) {
                    pos.porCorretora[payload.corretoraOrigem] = (pos.porCorretora[payload.corretoraOrigem] || 0) - ativoT.quantidade;
                    pos.porCorretora[payload.corretoraDestino] = (pos.porCorretora[payload.corretoraDestino] || 0) + ativoT.quantidade;
                    descricaoTransacao = `Transfer of ${ativoT.quantidade} units from ${payload.corretoraOrigem} to ${payload.corretoraDestino}`;
                } else {
                    descricaoTransacao = `Transfer from ${payload.corretoraOrigem} to ${payload.corretoraDestino}`;
                }
                precoUnitario = null;
                break;
            }
            case 'ajuste_pm':
                pos.precoMedio = payload.novoPrecoMedio;
                descricaoTransacao = `Manual Avg Price Adj.`;
                precoUnitario = null;
                break;
            case 'split_grupamento':
                const de = payload.proporcaoDe;
                const para = payload.proporcaoPara;
                pos.quantidade = (pos.quantidade / de) * para;
                pos.precoMedio = (pos.precoMedio / para) * de;
                const evType = payload.tipoEvento === 'split' ? 'Split' : 'Consolidation';
                descricaoTransacao = `Event: ${evType} ${de} to ${para}`;
                precoUnitario = null;
                break;
        }
        
        const qtdPorCorretoraStr = Object.entries(pos.porCorretora)
            .filter(([_, qtd]) => qtd > 0.0001)
            .map(([nome, qtd]) => `${nome}: ${Math.round(qtd)}`)
            .join('<br>');

        const valorTotalInvestido = pos.quantidade * pos.precoMedio;

        historico.push({
            data: evento.data,
            descricaoTransacao: descricaoTransacao,
            precoUnitario: precoUnitario,
            qtdPorCorretora: qtdPorCorretoraStr,
            qtdConsolidada: pos.quantidade,
            precoMedio: pos.precoMedio,
            valorTotalInvestido: valorTotalInvestido
        });
    });

    return historico;
}

function renderizarTelaHistoricoMovimentacao() {
    mostrarTela('historicoMovimentacao');
    const select = document.getElementById('select-ativo-historico');
    const containerTabela = document.getElementById('container-tabela-movimentacoes');
    containerTabela.innerHTML = '';
    
    const todosOsTickersHistorico = [...new Set(todosOsAtivos.map(a => a.ticker))];
    const posicoesAtuais = gerarPosicaoDetalhada();
    
    const tickersComPosicao = new Set(Object.keys(posicoesAtuais).filter(t => posicoesAtuais[t].quantidade > 0.000001));
    
    let optionsHtml = '<option value="">Select an asset...</option>';
    todosOsTickersHistorico.sort().forEach(ticker => {
        if (!tickersComPosicao.has(ticker)) {
            optionsHtml += `<option value="${ticker}" class="posicao-zerada">${ticker} (zeroed)</option>`;
        } else {
            optionsHtml += `<option value="${ticker}">${ticker}</option>`;
        }
    });

    select.innerHTML = optionsHtml;
}

function renderizarTabelaHistoricoParaAtivo(ticker) {
    const container = document.getElementById('container-tabela-movimentacoes');
    if (!ticker) {
        container.innerHTML = '';
        return;
    }
    const historico = gerarHistoricoCompletoParaAtivo(ticker);

    let tableHtml = `<h4>Transactions for ${ticker}</h4><table><thead><tr>
        <th>Date</th>
        <th>Transaction</th>
        <th class="numero">Unit Price (R$)</th>
        <th>Qty. by Broker</th>
        <th class="numero">Consolidated Qty.</th>
        <th class="numero">Avg Price</th>
        <th class="numero">Invested Amount</th>
    </tr></thead><tbody>`;

    if (historico.length === 0) {
        tableHtml += '<tr><td colspan="7" style="text-align: center;">No transactions found for this asset.</td></tr>';
    } else {
        historico.forEach(item => {
            const dataFormatada = item.data ? new Date(item.data + 'T12:00:00').toLocaleDateString('en-GB') : 'Invalid Date';
            
            const precoUnitarioFmt = (item.precoUnitario !== null && item.precoUnitario > 0) ? formatarMoeda(item.precoUnitario) : 'N/A';
            
            tableHtml += `
                <tr>
                    <td>${dataFormatada}</td>
                    <td>${item.descricaoTransacao}</td>
                    <td class="numero">${precoUnitarioFmt}</td>
                    <td>${item.qtdPorCorretora || 'N/A'}</td>
                    <td class="numero">${Math.round(item.qtdConsolidada)}</td>
                    <td class="numero">${formatarPrecoMedio(item.precoMedio)}</td>
                    <td class="numero">${formatarMoeda(item.valorTotalInvestido)}</td>
                </tr>`;
        });
    }

    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
}





function renderizarTelaHistoricoSnapshots() {
    const container = document.getElementById('container-historico-snapshots');
    
    if (!historicoCarteira || historicoCarteira.length < 2) {
        container.innerHTML = '<p>No snapshot saved. Save your first snapshot on the Dashboard screen.</p>';
        return;
    }

    const moedaSelecionada = document.querySelector('input[name="snapshot-currency"]:checked')?.value || 'BRL';
    const sufixoMoeda = moedaSelecionada === 'BRL' ? '' : ` (${moedaSelecionada})`;

    const cotacoes = historicoCarteira.length > 0 ? historicoCarteira[historicoCarteira.length - 1].cotacoesMoedas : dadosMoedas.cotacoes;
    const taxaCambio = moedaSelecionada === 'BRL' ? 1 : (cotacoes[moedaSelecionada] || 0);

    const formatFunction = moedaSelecionada === 'BRL' ? formatarMoeda : (valor) => formatarMoedaEstrangeira(valor, moedaSelecionada);
    const formatDecimalFunction = moedaSelecionada === 'BRL' ? (valor) => formatarDecimal(valor, 2) : (valor) => formatarDecimal(valor, 4);
    const converterValor = (valor) => (taxaCambio > 0 ? (valor || 0) / taxaCambio : 0);

    const dadosCalculados = [];
    
    const snapshotsValidos = historicoCarteira.filter(s => 
        (s.patrimonioTotal && s.patrimonioTotal > 0) || (s.valorTotalInvestimentos && s.valorTotalInvestimentos > 0)
    ).sort((a, b) => new Date(a.data) - new Date(b.data)); 

    const maxValues = { patrimonioTotal: 0, valorTotalInvestimentos: 0, valorFiis: 0, valorAcoesOutros: 0, valorTotalContas: 0, valorTotalMoedas: 0, proventosProjetadosMensal: 0, ibov: 0, ifix: 0 };
    
    const historicoConvertidoComYield = [];
    let anterior = null;
    
    snapshotsValidos.forEach((snapshot) => {
        const proventosProjetadosMensalBRL = calcularProjecaoHistoricaParaSnapshot(snapshot);
        const valorFiisBRL = snapshot.detalhesCarteira?.valorPorClasse?.['FIIs'] || 0;
        const valorAcoesOutrosBRL = (snapshot.detalhesCarteira?.valorPorClasse?.['Ações'] || 0) + (snapshot.detalhesCarteira?.valorPorClasse?.['ETF'] || 0);
        const valorTotalRVBRL = valorFiisBRL + valorAcoesOutrosBRL;
        
        const yieldProjetado = (valorTotalRVBRL > 0) ? (proventosProjetadosMensalBRL * 12) / valorTotalRVBRL : 0;

        const valoresBRL = {
            patrimonioTotal: snapshot.patrimonioTotal,
            valorTotalInvestimentos: snapshot.valorTotalInvestimentos,
            valorFiis: valorFiisBRL,
            valorAcoesOutros: valorAcoesOutrosBRL,
            valorTotalContas: snapshot.valorTotalContas,
            valorTotalMoedas: snapshot.valorTotalMoedas,
            proventosProjetadosMensal: proventosProjetadosMensalBRL,
            ibov: snapshot.ibov,
            ifix: snapshot.ifix
        };

        const valoresConvertidos = {};
        const variacoes = {};
        
        for (const key in valoresBRL) {
            valoresConvertidos[key] = converterValor(valoresBRL[key]);
            
            if (valoresConvertidos[key] > maxValues[key]) {
                maxValues[key] = valoresConvertidos[key];
            }

            if (anterior) {
                const diff = valoresConvertidos[key] - anterior.valoresConvertidos[key];
                const percent = anterior.valoresConvertidos[key] !== 0 ? diff / anterior.valoresConvertidos[key] : 0;
                variacoes[key] = percent;
            }
        }
        
        historicoConvertidoComYield.push({ 
            data: snapshot.data, 
            valoresConvertidos, 
            yieldProjetado, 
            variacoes 
        });
        
        anterior = { valoresConvertidos };
    });

    dadosCalculados.push(...historicoConvertidoComYield.reverse());


    let tableHtml = `<table>
        <thead>
            <tr>
                <th>Date</th>
                <th class="numero">Total Net Worth${sufixoMoeda}</th>
                <th class="numero">Total Invested${sufixoMoeda}</th>
                <th class="numero">REITs${sufixoMoeda}</th>
                <th class="numero">Shares/Others${sufixoMoeda}</th>
                <th class="numero">Account Balance${sufixoMoeda}</th>
                <th class="numero">Currency Balance${sufixoMoeda}</th>
                <th class="numero">Projected Income${sufixoMoeda}</th>
                <th class="numero">IBOV</th>
                <th class="numero">IFIX</th>
                <th class="controles-col">Actions</th>
            </tr>
        </thead>
        <tbody>`;

    dadosCalculados.forEach((item, index) => {
        const dataFormatada = new Date(item.data + 'T12:00:00').toLocaleDateString('en-GB');
        
        const getCellHtml = (key, isCurrency = true) => {
            const valor = item.valoresConvertidos[key];
            const isMax = Math.abs(valor - maxValues[key]) < 0.005 && valor > 0;
            const classeValor = isMax ? 'snapshot-max-value' : '';
            
            let valorFmt, diffHtml = '';
            
            if (isCurrency) {
                valorFmt = formatFunction(valor);
            } else {
                valorFmt = formatDecimalFunction(valor);
            }

            if (index < dadosCalculados.length - 1) {
                const diff = item.variacoes[key] || 0;
                const classeDiff = diff >= 0 ? 'valor-positivo' : 'valor-negativo';
                const prefixo = "Var:";
                diffHtml = `<span class="valor-secundario ${classeDiff}" style="display: block; font-size: 0.8em; text-align: right;">${prefixo} ${formatarPercentual(diff)}</span>`;
            }

            return `<td class="numero ${classeValor}">
                        <div style="text-align: right;">
                            <span class="valor-principal">${valorFmt}</span>
                            ${diffHtml}
                        </div>
                    </td>`;
        };
        
        const proventoValor = item.valoresConvertidos.proventosProjetadosMensal;
        const isMaxProvento = Math.abs(proventoValor - maxValues.proventosProjetadosMensal) < 0.005 && proventoValor > 0;
        const classeValorProvento = isMaxProvento ? 'snapshot-max-value' : '';
        let proventoDiffHtml = '';

        if (index < dadosCalculados.length - 1) {
            const proventoDiff = item.variacoes.proventosProjetadosMensal || 0;
            const classeDiff = proventoDiff >= 0 ? 'valor-positivo' : 'valor-negativo';
            const prefixo = "Var:";
            proventoDiffHtml = `<span class="valor-secundario ${classeDiff}" style="display: block; font-size: 0.8em; text-align: right;">${prefixo} ${formatarPercentual(proventoDiff)}</span>`;
        }
        
        const proventoHtml = `<td class="numero ${classeValorProvento}">
                                <div style="text-align: right;">
                                    <span class="valor-principal">${formatFunction(proventoValor)}</span>
                                    <small style="display: block; color: #555; font-size: 0.8em; text-align: right;">(${formatarPercentual(item.yieldProjetado)} p.a.)</small>
                                    ${proventoDiffHtml}
                                </div>
                            </td>`;


        tableHtml += `
            <tr class="row-clickable" data-data="${item.data}">
                <td>${dataFormatada}</td>
                ${getCellHtml('patrimonioTotal')}
                ${getCellHtml('valorTotalInvestimentos')}
                ${getCellHtml('valorFiis')}
                ${getCellHtml('valorAcoesOutros')}
                ${getCellHtml('valorTotalContas')}
                ${getCellHtml('valorTotalMoedas')}
                ${proventoHtml}
                ${getCellHtml('ibov', false)}
                ${getCellHtml('ifix', false)}
                <td class="controles-col">
                    <button class="btn btn-primary btn-sm btn-detalhes-snapshot" data-data="${item.data}">Details</button>
                </td>
            </tr>`;
    });

    tableHtml += `</tbody></table>`;
    container.innerHTML = tableHtml;
}

function abrirModalHistoricoAtivoSnapshot(ticker) {
    const modal = document.getElementById('modal-historico-ativo-snapshot');
    const tituloModal = document.getElementById('modal-historico-ativo-snapshot-titulo');
    const containerTabela = document.getElementById('container-historico-ativo-snapshot');
    const ctx = document.getElementById('grafico-historico-ativo-snapshot').getContext('2d');

    tituloModal.textContent = `Price vs Avg Price History - ${ticker}`;

    const dadosHistorico = [];
    historicoCarteira.forEach(snapshot => {
        if (snapshot.detalhesCarteira && snapshot.detalhesCarteira.ativos && snapshot.detalhesCarteira.ativos[ticker]) {
            const dadosAtivo = snapshot.detalhesCarteira.ativos[ticker];
            if (dadosAtivo.quantidade > 0) { 
                dadosHistorico.push({
                    data: snapshot.data,
                    cotacao: dadosAtivo.precoAtual,
                    precoMedio: dadosAtivo.precoMedio
                });
            }
        }
    });

    if (dadosHistorico.length === 0) {
        containerTabela.innerHTML = '<p>No historical data found for this asset in the snapshots.</p>';
        if (graficoHistoricoAtivoInstance) graficoHistoricoAtivoInstance.destroy();
        abrirModal('modal-historico-ativo-snapshot');
        return;
    }
    
    let tabelaHtml = `<table><thead><tr><th>Date</th><th class="numero">Avg Price</th><th class="numero">Price</th></tr></thead><tbody>`;
    [...dadosHistorico].reverse().forEach(item => {
        tabelaHtml += `
            <tr>
                <td>${new Date(item.data + 'T12:00:00').toLocaleDateString('en-GB')}</td>
                <td class="numero">${formatarMoeda(item.precoMedio)}</td>
                <td class="numero">${formatarMoeda(item.cotacao)}</td>
            </tr>
        `;
    });
    tabelaHtml += `</tbody></table>`;
    containerTabela.innerHTML = tabelaHtml;

    if (graficoHistoricoAtivoInstance) {
        graficoHistoricoAtivoInstance.destroy();
    }

    graficoHistoricoAtivoInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dadosHistorico.map(d => new Date(d.data + 'T12:00:00').toLocaleDateString('en-GB')),
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

    abrirModal('modal-historico-ativo-snapshot');
}

function abrirModalDetalhesSnapshot(data) {
    const snapshot = historicoCarteira.find(s => s.data === data);
    if (!snapshot) {
        alert('Error: Snapshot not found for this date.');
        return;
    }

    const modalTitulo = document.getElementById('modal-snapshot-detalhes-titulo');
    const modalConteudo = document.getElementById('modal-snapshot-detalhes-conteudo');
    const dataFormatada = new Date(data + 'T12:00:00').toLocaleDateString('en-GB');
    
    modalTitulo.textContent = `Portfolio Details on ${dataFormatada}`;

    let htmlConteudo = `<div class="snapshot-summary">
        <div class="summary-item"><label>Total Net Worth</label><span>${formatarMoeda(snapshot.patrimonioTotal)}</span></div>
        <div class="summary-item"><label>Total Invested</label><span>${formatarMoeda(snapshot.valorTotalInvestimentos)}</span></div>
        <div class="summary-item"><label>Account Balance</label><span>${formatarMoeda(snapshot.valorTotalContas)}</span></div>
        <div class="summary-item"><label>Currency Balance</label><span>${formatarMoeda(snapshot.valorTotalMoedas)}</span></div>
    </div>`;

    const detalhes = snapshot.detalhesCarteira;

    if (detalhes.ativos && Object.keys(detalhes.ativos).length > 0) {
        htmlConteudo += '<h4>Variable Income Assets</h4><table><thead><tr><th>Asset</th><th class="numero">Qty.</th><th class="numero">Avg Price</th><th class="numero">Current Price</th><th class="numero">Market Value</th></tr></thead><tbody>';
        Object.entries(detalhes.ativos).sort((a,b) => a[0].localeCompare(b[0])).forEach(([ticker, dados]) => {
            if (dados.quantidade > 0.0001) {
                const ativoInfo = todosOsAtivos.find(a => a.ticker === ticker);
                const tipoHtml = ativoInfo ? `<small style="color: #555; margin-left: 8px;">(${ativoInfo.tipo})</small>` : '';
                htmlConteudo += `<tr class="row-clickable" data-ticker="${ticker}" title="Click to see price and avg price history">
                    <td>${ticker}${tipoHtml}</td>
                    <td class="numero">${Math.round(dados.quantidade)}</td>
                    <td class="numero">${formatarMoeda(dados.precoMedio)}</td>
                    <td class="numero">${formatarMoeda(dados.precoAtual)}</td>
                    <td class="numero">${formatarMoeda(dados.valorDeMercado)}</td>
                </tr>`;
            }
        });
        htmlConteudo += `</tbody></table>`;
    }

    if (detalhes.rendaFixa && detalhes.rendaFixa.length > 0) {
        htmlConteudo += '<h4>Fixed Income Investments</h4><table><thead><tr><th>Description</th><th class="numero">Invested Amount</th><th class="numero">Net Balance</th></tr></thead><tbody>';
        detalhes.rendaFixa.forEach(rf => {
            if (rf.saldoLiquido > 0) {
                htmlConteudo += `<tr>
                    <td>${rf.descricao}</td>
                    <td class="numero">${formatarMoeda(rf.valorInvestido)}</td>
                    <td class="numero">${formatarMoeda(rf.saldoLiquido)}</td>
                </tr>`;
            }
        });
        htmlConteudo += `</tbody></table>`;
    }
    
    modalConteudo.innerHTML = htmlConteudo;
    abrirModal('modal-snapshot-detalhes');
}


async function imprimirResumoAtivo(ticker, chartProventosAnuaisInstance, chartPrecoPmInstance) {
    const container = document.getElementById('container-impressao-ativo');
    if (!container || !ticker) return;

    const proventosDoAtivo = todosOsProventos.filter(p => p.ticker === ticker);
    const dataInicioInvestimento = getInicioIninterrupto(ticker);
    const dataFim = getFimInvestimento([ticker]);
    const resumoPessoal = calcularResumoProventosParaMultiplosAtivos(proventosDoAtivo, [ticker], dataInicioInvestimento, dataFim);
    const historicoMovimentacoes = gerarHistoricoCompletoParaAtivo(ticker);

    const agora = new Date();
    const dataFormatada = agora.toLocaleDateString('en-GB');
    const horaFormatada = agora.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    let graficoProventosImgHtml = '';
    if (chartProventosAnuaisInstance && chartProventosAnuaisInstance.canvas) {
        try {
            chartProventosAnuaisInstance.options.animation.duration = 0;
            chartProventosAnuaisInstance.update('none');
            const imgDataUrl = chartProventosAnuaisInstance.toBase64Image();
            graficoProventosImgHtml = `<div class="grafico-impressao-container">
                                <h2>Annual Evolution of Paid Income</h2>
                                <img src="${imgDataUrl}" alt="Annual Income Chart" style="max-width: 90%; height: auto; margin-top: 15px;">
                            </div>`;
            chartProventosAnuaisInstance.options.animation.duration = 1000;
        } catch (e) {
            console.error("Erro ao gerar imagem do gráfico de proventos:", e);
            graficoProventosImgHtml = '<h2>Annual Evolution of Paid Income</h2><p>Could not generate the chart image.</p>';
        }
    }

    let graficoPrecoPmImgHtml = '';
    if (chartPrecoPmInstance && chartPrecoPmInstance.canvas) {
        try {
            chartPrecoPmInstance.options.animation.duration = 0;
            chartPrecoPmInstance.update('none');
            const imgDataUrl = chartPrecoPmInstance.toBase64Image();
            graficoPrecoPmImgHtml = `<div class="grafico-impressao-container">
                                <h2>Price vs. Avg Price (Snapshots History)</h2>
                                <img src="${imgDataUrl}" alt="Price vs Avg Price Chart" style="max-width: 90%; height: auto; margin-top: 15px;">
                            </div>`;
            chartPrecoPmInstance.options.animation.duration = 1000;
        } catch (e) {
            console.error("Erro ao gerar imagem do gráfico de Cotação vs. PM:", e);
            graficoPrecoPmImgHtml = '<h2>Price vs. Avg Price</h2><p>Could not generate the chart image.</p>';
        }
    }

    let proventosTabelaHtml = '<h2>Income History</h2>';
    if (proventosDoAtivo.length > 0) {
        proventosTabelaHtml += '<table><thead><tr><th>Pay Date</th><th>Type</th><th class="numero">Value/Un.</th><th class="numero">Qty.</th><th class="numero">Total</th><th class="percentual">YOC</th></tr></thead><tbody>';
        proventosDoAtivo.sort((a, b) => new Date(b.dataPagamento) - new Date(a.dataPagamento)).forEach(p => {
            let tipoProvFmt = p.tipo || 'N/A';
            if (tipoProvFmt === 'Rendimento') tipoProvFmt = 'Yield';
            if (tipoProvFmt === 'Dividendo') tipoProvFmt = 'Div';
            if (tipoProvFmt === 'Bonificação') tipoProvFmt = 'Bonus';
            if (tipoProvFmt === 'Outros') tipoProvFmt = 'Other';

            proventosTabelaHtml += `<tr>
                <td>${new Date(p.dataPagamento + 'T12:00:00').toLocaleDateString('en-GB')}</td>
                <td>${tipoProvFmt}</td>
                <td class="numero">${formatarDecimal(p.valorIndividual || 0, 5)}</td>
                <td class="numero">${Math.round(p.quantidadeNaDataCom || 0)}</td>
                <td class="numero">${formatarMoeda(p.valorTotalRecebido || 0)}</td>
                <td class="percentual">${formatarPercentual(p.yieldOnCost || 0)}</td>
            </tr>`;
        });
        proventosTabelaHtml += '</tbody></table>';
    } else {
        proventosTabelaHtml += '<p>No income recorded.</p>';
    }

    let movimentacoesHtml = '<h2>Transaction History</h2><table><thead><tr><th>Date</th><th>Transaction</th><th class="numero">Qty.</th><th class="numero">Avg Price</th></tr></thead><tbody>';
    historicoMovimentacoes.slice().reverse().forEach(item => {
        let descTransacao = item.descricaoTransacao;
        if(descTransacao.includes('Compra')) descTransacao = descTransacao.replace('Compra', 'Buy');
        if(descTransacao.includes('Venda')) descTransacao = descTransacao.replace('Venda', 'Sell');
        if(descTransacao.includes('Saldo Inicial')) descTransacao = descTransacao.replace('Saldo Inicial', 'Initial Balance');

        movimentacoesHtml += `<tr>
            <td>${new Date(item.data + 'T12:00:00').toLocaleDateString('en-GB')}</td>
            <td>${descTransacao}</td>
            <td class="numero">${Math.round(item.qtdConsolidada)}</td>
            <td class="numero">${formatarPrecoMedio(item.precoMedio)}</td>
        </tr>`;
    });
    movimentacoesHtml += '</tbody></table>';

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

        frequenciaHtml += '<div class="frequencia-impressao-container"><h2>Income Frequency</h2>';
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
        frequenciaHtml += '</div>';
    }

    container.innerHTML = `
        <h1>Asset Report: ${ticker}</h1>
        <p class="impressao-timestamp">Generated on ${dataFormatada} at ${horaFormatada}</p>
        <h2>Personal Performance (Projected)</h2>
        <table>
            <tr><td>Annual Projection (Current Pos.)</td><td class="numero">${formatarMoeda(resumoPessoal.projecaoAnualTotal)}</td></tr>
            <tr><td>Monthly Average (Current Pos.)</td><td class="numero">${formatarMoeda(resumoPessoal.mediaMensalTotal)}</td></tr>
            <tr><td>Yield on Cost (Annualized)</td><td class="percentual">${formatarPercentual(resumoPessoal.yocCustoAnual)}</td></tr>
        </table>
        ${movimentacoesHtml}
        ${graficoPrecoPmImgHtml} 
        ${proventosTabelaHtml}
        ${graficoProventosImgHtml}
        ${frequenciaHtml}
    `;

    const body = document.body;
    body.classList.add('imprimindo-resumo-ativo');
    container.classList.add('imprimindo');

    setTimeout(() => {
        window.print();

        setTimeout(() => {
            body.classList.remove('imprimindo-resumo-ativo');
            container.classList.remove('imprimindo');
        }, 500);
    }, 250);
}





