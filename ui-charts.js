// Charts // Gráficos
function abrirModalGraficoBreakEven(ticker, custoTotal, proventosRecebidos, resultadoRealizado) {
    if (custoTotal <= 0) {
        alert(`Não é possível gerar o gráfico para ${ticker}, pois o custo total é zero ou negativo.`);
        return;
    }

    const modal = document.getElementById('modal-performance-ativo-grafico');
    const tituloModal = document.getElementById('modal-performance-ativo-titulo');
    const infoModal = document.getElementById('modal-performance-ativo-info');
    const ctx = document.getElementById('grafico-comparativo-preco').getContext('2d');

    const totalRetornado = proventosRecebidos + resultadoRealizado;
    const valorRestante = Math.max(0, custoTotal - totalRetornado);
    const percentualPago = (totalRetornado / custoTotal);

    // Converte os valores absolutos para percentuais para o gráfico
    const percProventos = (proventosRecebidos / custoTotal) * 100;
    const percRealizado = (resultadoRealizado / custoTotal) * 100;
    const percRestante = (valorRestante / custoTotal) * 100;

    tituloModal.textContent = `Ponto de Equilíbrio (Break-Even) - ${ticker}`;
    infoModal.innerHTML = `Progresso para se pagar: <strong class="${percentualPago >= 1 ? 'valor-positivo' : ''}">${formatarPercentual(percentualPago)}</strong>`;

    if (graficoBreakEvenInstance) {
        graficoBreakEvenInstance.destroy();
    }
    
    graficoBreakEvenInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [ticker],
            datasets: [
                {
                    label: 'Proventos Recebidos',
                    data: [percProventos],
                    backgroundColor: 'rgba(46, 204, 113, 0.7)', // Verde
                    borderColor: 'rgba(46, 204, 113, 1)',
                    borderWidth: 1
                },
                {
                    label: 'Resultados Realizados',
                    data: [percRealizado],
                    backgroundColor: 'rgba(52, 152, 219, 0.7)', // Azul
                    borderColor: 'rgba(52, 152, 219, 1)',
                    borderWidth: 1
                },
                {
                    label: 'Falta para se Pagar',
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
                    text: `Custo Total: ${formatarMoeda(custoTotal)}`
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
function abrirModalGraficoCotacoesHistoricas(filtroTipo = 'todos') {
    if (!historicoCarteira || historicoCarteira.length < 2) {
        alert("É necessário ter pelo menos 2 snapshots salvos para gerar o gráfico de desempenho.");
        return;
    }

    const modal = document.getElementById('modal-grafico-cotacoes');
    const tituloModal = document.getElementById('modal-grafico-cotacoes-titulo');
    
    // 1. Define o Título
    let tituloGrafico = '';
    if (filtroTipo === 'todos') {
        tituloGrafico = 'Comparativo de Desempenho - Renda Variável';
    } else {
        const tituloTipo = filtroTipo === 'FII' ? 'Fundos Imobiliários' : (filtroTipo === 'Ação' ? 'Ações' : 'ETFs');
        tituloGrafico = `Comparativo de Desempenho - ${tituloTipo}`;
    }
    tituloModal.textContent = tituloGrafico;

    // 2. Lógica de Persistência (Recupera ou define padrão '1M')
    // Se não houver nada salvo (ex: após restaurar backup antigo), usa '1M'
    if (!configuracoesGraficos.modalHistoricoPeriodo) {
        configuracoesGraficos.modalHistoricoPeriodo = '1M';
    }
    const periodoInicial = configuracoesGraficos.modalHistoricoPeriodo;

    // 3. Atualiza a Interface (Marca o botão correto)
    const radioParaMarcar = document.querySelector(`input[name="periodo-grafico-modal"][value="${periodoInicial}"]`);
    if (radioParaMarcar) {
        radioParaMarcar.checked = true;
    }

    // 4. Armazena o tipo atual no modal para uso no listener
    modal.dataset.tipoAtual = filtroTipo;

    // 5. Renderiza o gráfico com o período salvo
    atualizarGraficoModal(filtroTipo, periodoInicial);

    abrirModal('modal-grafico-cotacoes');
}
function atualizarGraficoModal(tipoAtivo, periodo) {
    const ctx = document.getElementById('grafico-cotacoes-historicas-canvas').getContext('2d');

    // Define a data de início com base no período
    const hoje = new Date();
    let dataInicio = new Date();
    
    switch (periodo) {
        case '1M':
            dataInicio.setMonth(hoje.getMonth() - 1);
            break;
        case 'YTD':
            dataInicio = new Date(hoje.getFullYear(), 0, 1); // 1º de Jan do ano atual
            break;
        case '1A':
            dataInicio.setFullYear(hoje.getFullYear() - 1);
            break;
        case '5A':
            dataInicio.setFullYear(hoje.getFullYear() - 5);
            break;
    }
    
    const dataInicioStr = dataInicio.toISOString().split('T')[0];

    // Gera os dados matemáticos (Mesma lógica do Dashboard - TWR)
    const dadosGrafico = gerarDadosComparativosModal(tipoAtivo, dataInicioStr);

    if (graficoHistoricoCotacoesInstance) {
        graficoHistoricoCotacoesInstance.destroy();
    }

    if (!dadosGrafico || dadosGrafico.datasets.length === 0) {
        // Se não houver dados, exibe mensagem no canvas (tratado via plugin ou texto anterior)
        // Aqui apenas limpamos para não quebrar
        return;
    }

    graficoHistoricoCotacoesInstance = new Chart(ctx, {
        type: 'line',
        data: dadosGrafico,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'nearest',
                intersect: false,
                axis: 'x'
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        boxWidth: 10
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.dataset.label || '';
                            const valor = context.parsed.y;
                            if (valor === null) return null;
                            return `${label}: ${formatarPercentual(valor)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    ticks: {
                        callback: function(value) {
                            return (value * 100).toFixed(0) + '%';
                        }
                    },
                    grid: {
                        color: (context) => context.tick.value === 0 ? '#666' : '#e5e5e5',
                        lineWidth: (context) => context.tick.value === 0 ? 2 : 1
                    }
                }
            }
        }
    });
}
function renderizarGraficoAportesProventos() {
    const container = document.getElementById('grafico-aportes-proventos-canvas');
    if (!container) return;
    const ctx = container.getContext('2d');

    // Verificação Direta (Sem Retry)
    if ((!todasAsMovimentacoes || todasAsMovimentacoes.length === 0) && (!todosOsProventos || todosOsProventos.length === 0)) {
        if (graficoAportesInstance) {
            graficoAportesInstance.destroy();
            graficoAportesInstance = null;
        }
        ctx.clearRect(0, 0, container.width, container.height);
        
        ctx.save();
        ctx.font = "14px 'Segoe UI'";
        ctx.fillStyle = "#888";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Sem dados de aportes ou proventos.", container.width / 2, container.height / 2);
        ctx.restore();
        return;
    }

    const dadosGrafico = gerarDadosGraficoAportesProventos(); // Supomos que esta função é rápida
    if (!dadosGrafico) return;

    const configOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false, // Otimização
        interaction: { mode: 'index', intersect: false },
        plugins: {
            tooltip: {
                callbacks: { label: ctx => `${ctx.dataset.label}: ${formatarMoeda(ctx.parsed.y)}` }
            }
        },
        scales: {
            x: { stacked: tipoGraficoAportes === 'barras' },
            y: { 
                stacked: tipoGraficoAportes === 'barras',
                beginAtZero: true, 
                ticks: { callback: v => formatarMoeda(v) } 
            }
        }
    };

    if (graficoAportesInstance) {
        if (graficoAportesInstance.config.type !== (tipoGraficoAportes === 'barras' ? 'bar' : 'line')) {
            graficoAportesInstance.destroy();
            graficoAportesInstance = new Chart(ctx, {
                type: tipoGraficoAportes === 'barras' ? 'bar' : 'line',
                data: dadosGrafico,
                options: configOptions
            });
        } else {
            graficoAportesInstance.data = dadosGrafico;
            if (tipoGraficoAportes !== 'barras') {
                graficoAportesInstance.data.datasets.forEach(ds => {
                    ds.borderWidth = 2; ds.fill = false; ds.tension = 0.1;
                });
            }
            graficoAportesInstance.update('none');
        }
    } else {
        const config = {
            type: tipoGraficoAportes === 'barras' ? 'bar' : 'line',
            data: dadosGrafico,
            options: configOptions
        };
        if (tipoGraficoAportes !== 'barras') {
            config.data.datasets.forEach(ds => { ds.borderWidth = 2; ds.fill = false; ds.tension = 0.1; });
        }
        graficoAportesInstance = new Chart(ctx, config);
    }

    // Atualiza botões
    const botoes = document.querySelectorAll('#toggle-aportes-grafico .chart-toggle-btn');
    if(botoes) botoes.forEach(b => b.classList.toggle('ativo', b.dataset.tipo === tipoGraficoAportes));
}
function abrirModalHistoricoAtivoSnapshot(ticker) {
    const modal = document.getElementById('modal-historico-ativo-snapshot');
    const tituloModal = document.getElementById('modal-historico-ativo-snapshot-titulo');
    const containerTabela = document.getElementById('container-historico-ativo-snapshot');
    const ctx = document.getElementById('grafico-historico-ativo-snapshot').getContext('2d');

    tituloModal.textContent = `Histórico de Cotações e Preço Médio - ${ticker}`;

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

    if (dadosHistorico.length === 0) {
        containerTabela.innerHTML = '<p>Nenhum dado histórico encontrado para este ativo nos snapshots.</p>';
        if (graficoHistoricoAtivoInstance) graficoHistoricoAtivoInstance.destroy();
        abrirModal('modal-historico-ativo-snapshot');
        return;
    }
    
    let tabelaHtml = `<table><thead><tr><th>Data</th><th class="numero">Preço Médio</th><th class="numero">Cotação</th></tr></thead><tbody>`;
    [...dadosHistorico].reverse().forEach(item => {
        tabelaHtml += `
            <tr>
                <td>${new Date(item.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
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
            labels: dadosHistorico.map(d => new Date(d.data + 'T12:00:00').toLocaleDateString('pt-BR')),
            datasets: [
                {
                    label: 'Cotação (R$)',
                    data: dadosHistorico.map(d => d.cotacao),
                    borderColor: 'rgba(52, 152, 219, 1)',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0, // Remove o ponto visual
                    pointHoverRadius: 5 // Mostra o ponto ao passar o mouse
                },
                {
                    label: 'Preço Médio (R$)',
                    data: dadosHistorico.map(d => d.precoMedio),
                    borderColor: 'rgba(46, 204, 113, 1)',
                    backgroundColor: 'rgba(46, 204, 113, 0.1)',
                    fill: false,
                    tension: 0.1,
                    borderDash: [5, 5], // Linha tracejada para diferenciar
                    pointRadius: 0, // Remove o ponto visual
                    pointHoverRadius: 5 // Mostra o ponto ao passar o mouse
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
function renderizarGraficoCarteira() {
    const canvas = document.getElementById('grafico-carteira-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    // Verificação Simples e Direta (Sem Retry)
    if (!historicoCarteira || historicoCarteira.length < 2) {
        if (graficoCarteiraInstance) {
            graficoCarteiraInstance.destroy();
            graficoCarteiraInstance = null;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Mensagem amigável apenas se realmente não houver dados
        ctx.save();
        ctx.font = "14px 'Segoe UI'";
        ctx.fillStyle = "#888";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Aguardando mais dados históricos...", canvas.width / 2, canvas.height / 2);
        ctx.restore();
        return;
    }

    // 1. Ordenação e Preparação (Mantida a lógica original de leitura)
    // Pequena otimização: Evita clonar o array inteiro se já estiver ordenado, mas mantivemos o sort por segurança
    const historicoOrdenado = [...historicoCarteira].sort((a, b) => new Date(a.data) - new Date(b.data));
    
    const labels = [];
    const dadosBRL = [], dadosUSD = [], dadosEUR = [], dadosGBP = [];

    historicoOrdenado.forEach(snapshot => {
        let valorInvestimentosDoDia = 0;

        if (typeof snapshot.valorTotalInvestimentos === 'number') {
            valorInvestimentosDoDia = snapshot.valorTotalInvestimentos;
        } else if (snapshot.detalhesCarteira && snapshot.detalhesCarteira.valorPorClasse) {
            const vp = snapshot.detalhesCarteira.valorPorClasse;
            valorInvestimentosDoDia = (vp['Ações'] || 0) + (vp['FIIs'] || 0) + (vp['ETFs'] || 0) + (vp['Renda Fixa'] || 0);
        }

        if (valorInvestimentosDoDia <= 1) return;

        const dataObj = new Date(snapshot.data + 'T12:00:00');
        labels.push(dataObj.toLocaleDateString('pt-BR'));
        dadosBRL.push(valorInvestimentosDoDia);

        const cotacoes = snapshot.cotacoesMoedas || { USD: 0, EUR: 0, GBP: 0 };
        const converter = (val, taxa) => (taxa > 0 ? val / taxa : 0);
        
        // Helper inline para preencher gaps
        const last = (arr) => arr.length > 0 ? arr[arr.length - 1] : 0;
        const pushSafe = (arr, val) => arr.push(val === 0 && arr.length > 0 ? last(arr) : val);

        pushSafe(dadosUSD, converter(valorInvestimentosDoDia, cotacoes.USD));
        pushSafe(dadosEUR, converter(valorInvestimentosDoDia, cotacoes.EUR));
        pushSafe(dadosGBP, converter(valorInvestimentosDoDia, cotacoes.GBP));
    });

    const datasets = [
        { label: 'Valor em BRL', data: dadosBRL, borderColor: 'rgba(46, 204, 113, 1)', backgroundColor: 'rgba(46, 204, 113, 0.1)', fill: true, tension: 0.1, borderWidth: 3, pointRadius: 0, pointHoverRadius: 4 },
        { label: 'Valor em USD', data: dadosUSD, borderColor: 'rgba(52, 152, 219, 0.9)', fill: false, tension: 0.1, borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 4 },
        { label: 'Valor em EUR', data: dadosEUR, borderColor: 'rgba(241, 196, 15, 0.9)', fill: false, tension: 0.1, borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 4 },
        { label: 'Valor em GBP', data: dadosGBP, borderColor: 'rgba(155, 89, 182, 0.9)', fill: false, tension: 0.1, borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 4 }
    ];

    const hiddenLabels = configuracoesGraficos.evolucao?.hidden || [];
    datasets.forEach(ds => { if (hiddenLabels.includes(ds.label)) ds.hidden = true; });

    // Renderização Otimizada: Update se existir, New se não
    if (graficoCarteiraInstance) {
        graficoCarteiraInstance.data.labels = labels;
        graficoCarteiraInstance.data.datasets = datasets;
        graficoCarteiraInstance.update('none'); 
    } else {
        graficoCarteiraInstance = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false, // Desliga animação inicial para carregar rápido
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        labels: { usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 15 },
                        onClick: (e, legendItem, legend) => {
                            const index = legendItem.datasetIndex;
                            const ci = legend.chart;
                            if (ci.isDatasetVisible(index)) { ci.hide(index); legendItem.hidden = true; } 
                            else { ci.show(index); legendItem.hidden = false; }
                            
                            const label = legendItem.text;
                            const isHidden = legendItem.hidden;
                            if (!configuracoesGraficos.evolucao) configuracoesGraficos.evolucao = { hidden: [] };
                            const hiddenSet = new Set(configuracoesGraficos.evolucao.hidden || []);
                            if (isHidden) hiddenSet.add(label); else hiddenSet.delete(label);
                            configuracoesGraficos.evolucao.hidden = Array.from(hiddenSet);
                            salvarConfiguracoesGraficos();
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.dataset.label || '';
                                const valor = context.parsed.y;
                                if (label.includes('BRL')) return `${label}: ${formatarMoeda(valor)}`;
                                if (label.includes('USD')) return `${label}: ${formatarMoedaEstrangeira(valor, 'USD')}`;
                                if (label.includes('EUR')) return `${label}: ${formatarMoedaEstrangeira(valor, 'EUR')}`;
                                if (label.includes('GBP')) return `${label}: ${formatarMoedaEstrangeira(valor, 'GBP')}`;
                                return `${label}: ${valor}`;
                            }
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: true, ticks: { callback: v => v.toLocaleString('pt-BR', { minimumFractionDigits: 0 }) } }
                }
            }
        });
    }
}
function renderizarGraficoDesempenho(ignorarEscudo = false) {
    const canvasElement = document.getElementById('grafico-desempenho-canvas');
    if (!canvasElement) return;

    if (!ignorarEscudo && window.lastChartInteractionTime && graficoDesempenhoInstance) {
        const tempoDesdeInteracao = Date.now() - window.lastChartInteractionTime;
        if (tempoDesdeInteracao < 10000) return; 
    }

    // 1. Setup Data
    if (!configuracoesGraficos.desempenho) configuracoesGraficos.desempenho = {};
    if (!configuracoesGraficos.desempenho.periodo) configuracoesGraficos.desempenho.periodo = '1M';
    const periodoSelecionado = configuracoesGraficos.desempenho.periodo;
    
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    let dataInicioSolicitada = new Date(hoje);
    switch (periodoSelecionado) {
        case '1M': dataInicioSolicitada.setMonth(hoje.getMonth() - 1); break;
        case '6M': dataInicioSolicitada.setMonth(hoje.getMonth() - 6); break;
        case 'YTD': dataInicioSolicitada = new Date(hoje.getFullYear(), 0, 1); break;
        case '1A': dataInicioSolicitada.setFullYear(hoje.getFullYear() - 1); break;
        case '2A': dataInicioSolicitada.setFullYear(hoje.getFullYear() - 2); break;
        case '5A': dataInicioSolicitada.setFullYear(hoje.getFullYear() - 5); break;
        case '10A': dataInicioSolicitada.setFullYear(hoje.getFullYear() - 10); break;
        default: dataInicioSolicitada.setMonth(hoje.getMonth() - 1);
    }

    // Helper Cards Simulação
    const atualizarCardsSimulacao = (chartInstance, periodo, dataSolicitadaObj) => {
        const container = document.getElementById('container-simulacao-desempenho');
        if (!container) return;

        let htmlContent = '';
        const labels = chartInstance.data.labels;
        const textosPeriodo = { '1M': 'há 1 mês', '6M': 'há 6 meses', 'YTD': 'no início deste ano', '1A': 'há 1 ano', '2A': 'há 2 anos', '5A': 'há 5 anos', '10A': 'há 10 anos' };

        const converterData = (lbl) => {
            if(!lbl) return null; let d = new Date(lbl + 'T12:00:00'); if(!isNaN(d.getTime())) return d;
            if(lbl.includes('/')) { const p = lbl.split('/'); if(p.length===3) return new Date(p[2], p[1]-1, p[0], 12,0,0); } return null;
        };

        const itens = chartInstance.data.datasets.map((ds, i) => {
            if (!chartInstance.isDatasetVisible(i)) return null;
            const d = ds.data; let ult = 0;
            for(let k=d.length-1; k>=0; k--) { if(d[k]!==null && d[k]!==undefined){ ult=d[k]; break; } }
            return { 
                dataset: ds, 
                ultimoPercentual: ult, // Guardamos o percentual bruto
                valorFinal: 1000*(1+ult) 
            };
        }).filter(x => x !== null).sort((a,b) => b.valorFinal - a.valorFinal);

        itens.forEach(item => {
            const ds = item.dataset; const vf = item.valorFinal;
            let idx = ds.data.findIndex(v => v!==null && v!==undefined); if(idx===-1) idx=0;
            
            const dataReal = converterData(labels[idx]);
            let txtTempo = textosPeriodo[periodo] || 'no período';
            let infoIR = '';

            if (dataReal) {
                const diff = Math.ceil((dataReal - dataSolicitadaObj)/(86400000));
                if (Math.abs(diff) > 15) txtTempo = `desde ${String(dataReal.getDate()).padStart(2,'0')}/${String(dataReal.getMonth()+1).padStart(2,'0')}/${dataReal.getFullYear()}`;
                
                if (ds.label === 'SELIC') {
                    const dias = Math.ceil((new Date() - dataReal)/86400000);
                    const aliq = dias<=180?22.5:dias<=360?20.0:dias<=720?17.5:15.0;
                    infoIR = `<span style="font-size: 0.8em; color: #7f8c8d; background: #f0f2f5; padding: 1px 5px; border-radius: 4px; margin-left: 5px;">IR: ${aliq.toFixed(1).replace('.', ',')}%</span>`;
                }
            }
            
            const corVal = vf >= 1000 ? '#2ecc71' : '#e74c3c';
            const corBorda = ds.borderColor || '#ccc';
            // Formatamos a porcentagem (Ex: +5,00%)
            const txtRendimento = formatarPercentual(item.ultimoPercentual);

            htmlContent += `
                <div style="display: flex; align-items: center; gap: 10px; border-left: 4px solid ${corBorda}; padding-left: 10px; margin-bottom: 10px;">
                    <span style="color: #555;">
                        <strong>R$ 1.000,00</strong> investidos em <strong>${ds.label}</strong>${infoIR} ${txtTempo} valeriam hoje: 
                        <strong style="color: ${corVal}; font-size: 1.1em;">${formatarMoeda(vf)}</strong>, 
                        rendimento de <strong style="color: ${corVal};">${txtRendimento}</strong>.
                    </span>
                </div>
            `;
        });
        if (htmlContent === '') htmlContent = '<span style="color: #999; font-style: italic;">Selecione ativos para ver a simulação.</span>';
        container.innerHTML = htmlContent;
    };

    // Remove botão limpar antigo
    const btnLimpar = document.getElementById('btn-desselecionar-tudo-desempenho');
    if (btnLimpar) btnLimpar.style.display = 'none';

    // Gerar Dados
    const ctx = canvasElement.getContext('2d');
    const radio = document.querySelector(`input[name="periodo-desempenho-dash"][value="${periodoSelecionado}"]`);
    if (radio) radio.checked = true;

    const dadosGrafico = gerarDadosGraficoDesempenho(dataInicioSolicitada.toISOString().split('T')[0]);

    if (!dadosGrafico) {
        if(graficoDesempenhoInstance) { graficoDesempenhoInstance.destroy(); graficoDesempenhoInstance=null; }
        ctx.clearRect(0,0,canvasElement.width, canvasElement.height);
        const ctB = document.getElementById('container-botoes-dinamicos'); if(ctB) ctB.innerHTML='';
        return;
    }

    // Aplica Visibilidade Salva
    const prioridade = ['Carteira RV', 'SELIC', 'IBOV', 'IFIX', 'Ações', 'FIIs']; 
    const hiddenSaved = configuracoesGraficos.desempenho?.hidden || [];
    const hasInteraction = configuracoesGraficos.desempenho && 'hidden' in configuracoesGraficos.desempenho;
    const hiddenSet = new Set(hiddenSaved);

    dadosGrafico.datasets.forEach(ds => {
        if (hasInteraction) {
            ds.hidden = hiddenSet.has(ds.label);
        } else {
            ds.hidden = !prioridade.includes(ds.label);
        }
    });

    // Se TUDO estiver oculto, força padrão
    const tudoOculto = dadosGrafico.datasets.every(d => d.hidden);
    if (tudoOculto) {
        dadosGrafico.datasets.forEach(ds => {
            if (['Carteira RV', 'SELIC'].includes(ds.label)) ds.hidden = false;
        });
    }

    // Render/Update Chart
    if (graficoDesempenhoInstance && document.body.contains(canvasElement)) {
        graficoDesempenhoInstance.data.labels = dadosGrafico.labels;
        graficoDesempenhoInstance.data.datasets = dadosGrafico.datasets;
        graficoDesempenhoInstance.update('none');
        atualizarCardsSimulacao(graficoDesempenhoInstance, periodoSelecionado, dataInicioSolicitada);
        gerarBotoesFiltroDinamico(graficoDesempenhoInstance, dataInicioSolicitada);
    } else {
        if (graficoDesempenhoInstance) graficoDesempenhoInstance.destroy();

        graficoDesempenhoInstance = new Chart(ctx, {
            type: 'line',
            data: dadosGrafico,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'nearest', intersect: false, axis: 'x' },
                plugins: {
                    legend: {
                        display: true,
                        labels: { usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 15, padding: 15 },
                        onClick: (e, legendItem, legend) => {
                            const index = legendItem.datasetIndex;
                            const ci = legend.chart;
                            if (ci.isDatasetVisible(index)) ci.hide(index); else ci.show(index);
                            
                            window.lastChartInteractionTime = Date.now();
                            atualizarCardsSimulacao(ci, configuracoesGraficos.desempenho.periodo, dataInicioSolicitada);
                            gerarBotoesFiltroDinamico(ci, dataInicioSolicitada);

                            const hLabels = [];
                            ci.data.datasets.forEach((ds, i) => { if (!ci.isDatasetVisible(i)) hLabels.push(ds.label); });
                            if (!configuracoesGraficos.desempenho) configuracoesGraficos.desempenho = {};
                            configuracoesGraficos.desempenho.hidden = hLabels;
                            salvarConfiguracoesGraficos();
                        }
                    },
                    tooltip: {
                        enabled: true,
                        callbacks: {
                            label: (ctx) => {
                                const val = ctx.parsed.y; if(val===null) return null;
                                return `${ctx.dataset.label}: ${formatarPercentual(val)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        ticks: { callback: (v) => (v*100).toFixed(0)+'%' },
                        grid: { color: (c) => c.tick.value===0?'#666':'#e5e5e5', lineWidth: (c) => c.tick.value===0?2:1 }
                    }
                }
            }
        });
        atualizarCardsSimulacao(graficoDesempenhoInstance, periodoSelecionado, dataInicioSolicitada);
        gerarBotoesFiltroDinamico(graficoDesempenhoInstance, dataInicioSolicitada);
    }
}

function gerarBotoesFiltroDinamico(chartInstance, dataInicioSolicitada) {
    const container = document.getElementById('container-botoes-dinamicos');
    if (!container || !chartInstance) return;

    container.innerHTML = ''; // Limpa botões anteriores

    // Definições dos Grupos
    const grupos = [
        { nome: 'Índices', filtro: (l) => ['IBOV', 'IFIX'].includes(l) },
        { nome: 'Categorias', filtro: (l) => ['Carteira RV', 'Ações', 'FIIs', 'ETFs'].includes(l) },
        { nome: 'Ações', filtro: (l) => { const a = todosOsAtivos.find(at => at.ticker === l); return a && a.tipo === 'Ação'; } },
        { nome: 'FIIs', filtro: (l) => { const a = todosOsAtivos.find(at => at.ticker === l); return a && a.tipo === 'FII'; } },
        { nome: 'ETFs', filtro: (l) => { const a = todosOsAtivos.find(at => at.ticker === l); return a && a.tipo === 'ETF'; } }
    ];

    const labelsPresentesNoGrafico = chartInstance.data.datasets.map(ds => ds.label);

    // Helper para estilo visual
    const aplicarEstilo = (el, ativo) => {
        if (ativo) {
            el.style.backgroundColor = '#5a6268';
            el.style.color = '#fff';
            el.style.fontWeight = '600';
            el.style.borderColor = '#545b62';
        } else {
            el.style.backgroundColor = '#fff';
            el.style.color = '#555';
            el.style.fontWeight = '400';
            el.style.borderColor = '#ccc';
        }
    };

    grupos.forEach((grupo, index) => {
        // 1. Identificar datasets que pertencem a este grupo NO GRÁFICO ATUAL
        const datasetsDoGrupo = [];
        chartInstance.data.datasets.forEach((ds, i) => {
            if (grupo.filtro(ds.label)) {
                datasetsDoGrupo.push({
                    index: i,
                    label: ds.label,
                    visible: chartInstance.isDatasetVisible(i)
                });
            }
        });

        // Só cria o botão se houver itens desse grupo
        if (datasetsDoGrupo.length > 0) {
            const idUnico = `btn-dyn-filter-${index}`;
            
            // 2. Lógica de Estado (Estrita + Exceção SELIC)
            // O botão só fica ativo se TODOS os itens do grupo (exceto SELIC) estiverem visíveis.
            // A SELIC pode estar oculta ou visível, ela não "derruba" o botão.
            
            // Filtra a lista para ignorar a SELIC na verificação de "Todos Marcados"
            const itensRelevantesParaStatus = datasetsDoGrupo.filter(d => d.label !== 'SELIC');
            
            // Verifica se todos os relevantes estão visíveis
            // Se não houver itens relevantes (ex: grupo vazio ou só SELIC), assume falso para segurança, 
            // mas no seu caso sempre haverá ativos se o grupo existe.
            const grupoCompletoVisivel = itensRelevantesParaStatus.length > 0 && itensRelevantesParaStatus.every(d => d.visible);

            // Input Checkbox
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = idUnico;
            checkbox.checked = grupoCompletoVisivel;
            checkbox.style.display = 'none';

            // Label (Botão Visual)
            const label = document.createElement('label');
            label.htmlFor = idUnico;
            label.innerText = grupo.nome;
            label.className = 'chart-period-btn';
            label.style.cursor = 'pointer';
            label.style.userSelect = 'none';
            label.style.marginRight = '5px';
            label.style.transition = 'all 0.2s';
            
            aplicarEstilo(label, grupoCompletoVisivel);

            // Evento de Click
            checkbox.onchange = () => {
                window.lastChartInteractionTime = Date.now();
                const deveMostrar = checkbox.checked; // Se clicou para ativar, mostra todos. Se desativou, esconde todos.

                // Aplica visibilidade aos itens do grupo
                chartInstance.data.datasets.forEach((ds, i) => {
                    if (grupo.filtro(ds.label)) {
                        chartInstance.setDatasetVisibility(i, deveMostrar);
                    }
                    
                    // REGRA DA SELIC AO CLICAR NO BOTÃO:
                    // Se estamos ATIVANDO o grupo, garantimos que a SELIC apareça (para comparação).
                    // Se estamos DESATIVANDO, não mexemos na SELIC (ela fica como estava, pois pode ser usada por outros).
                    if (deveMostrar && ds.label === 'SELIC') {
                        chartInstance.setDatasetVisibility(i, true);
                    }
                });

                chartInstance.update();
                aplicarEstilo(label, deveMostrar);

                // Persistência
                const hiddenLabels = [];
                chartInstance.data.datasets.forEach((ds, i) => {
                    if (!chartInstance.isDatasetVisible(i)) hiddenLabels.push(ds.label);
                });
                
                if (!configuracoesGraficos.desempenho) configuracoesGraficos.desempenho = {};
                configuracoesGraficos.desempenho.hidden = hiddenLabels;
                salvarConfiguracoesGraficos();
                
                // Atualiza cards
                // Precisamos verificar se a função renderizarGraficoDesempenho está disponível no escopo global
                if (typeof renderizarGraficoDesempenho === 'function') {
                    renderizarGraficoDesempenho(true);
                }
            };

            container.appendChild(checkbox);
            container.appendChild(label);
        }
    });
}
function renderizarGraficoProventos() {
    const dadosGraficoProventos = gerarDadosGraficoProventos();
    const canvas = document.getElementById('grafico-proventos-canvas');
    if (!canvas) return;
    
    const ctxProventos = canvas.getContext('2d');

    // CORREÇÃO CRÍTICA: Destrói instância órfã
    if (graficoProventosInstance && graficoProventosInstance.canvas !== canvas) {
        graficoProventosInstance.destroy();
        graficoProventosInstance = null;
    }

    if (graficoProventosInstance) {
        graficoProventosInstance.data = dadosGraficoProventos;
        graficoProventosInstance.update();
    } else {
        graficoProventosInstance = new Chart(ctxProventos, {
            type: 'bar',
            data: dadosGraficoProventos,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${formatarMoeda(context.raw)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: { stacked: true, grid: { display: false } },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        ticks: { callback: function(value) { return formatarMoeda(value); } }
                    }
                }
            }
        });
    }
}
function renderizarGraficoAlocacao(resumoCarteira, categoriasOrdenadas) {
    const canvas = document.getElementById('grafico-alocacao-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Validação rápida de canvas órfão
    if (graficoAlocacaoInstance && graficoAlocacaoInstance.canvas !== canvas) {
        graficoAlocacaoInstance.destroy();
        graficoAlocacaoInstance = null;
    }

    const valorTotalCarteira = Object.values(resumoCarteira).reduce((soma, cat) => soma + cat.mercado, 0);
    const chartLabels = [];
    const chartData = [];
    
    for (const categoria of categoriasOrdenadas) {
        if (resumoCarteira[categoria].mercado > 0) {
            chartLabels.push(categoria);
            chartData.push(resumoCarteira[categoria].mercado);
        }
    }
    
    // Se não houver dados, limpa e sai
    if (chartData.length === 0) {
        if (graficoAlocacaoInstance) { graficoAlocacaoInstance.destroy(); graficoAlocacaoInstance = null; }
        ctx.clearRect(0,0,canvas.width, canvas.height);
        return;
    }

    const mapaDeCores = { 'FIIs': '#3498db', 'Ações': '#2ecc71', 'ETFs': '#f39c12', 'Renda Fixa': '#e74c3c' };
    const coresDoGrafico = chartLabels.map(label => mapaDeCores[label] || '#95a5a6'); 

    if (graficoAlocacaoInstance) {
        graficoAlocacaoInstance.data.labels = chartLabels;
        graficoAlocacaoInstance.data.datasets[0].data = chartData;
        graficoAlocacaoInstance.data.datasets[0].backgroundColor = coresDoGrafico;
        graficoAlocacaoInstance.update();
    } else {
        graficoAlocacaoInstance = new Chart(ctx, {
            type: 'doughnut',
            data: { 
                labels: chartLabels, 
                datasets: [{ 
                    label: 'Patrimônio', 
                    data: chartData, 
                    backgroundColor: coresDoGrafico, 
                    borderColor: '#ffffff', 
                    borderWidth: 2 
                }] 
            },
            options: {
                responsive: true, 
                maintainAspectRatio: false,
                animation: { animateScale: true, animateRotate: true }, // Mantém animação só aqui que é leve
                layout: { padding: 10 },
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 12, padding: 15 } },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.label || '';
                                const valor = context.parsed;
                                const percentual = (valor / valorTotalCarteira) * 100;
                                return `${label}: ${formatarMoeda(valor)} (${percentual.toFixed(2)}%)`;
                            }
                        }
                    }
                },
                onClick: (event, elements, chart) => {
                    if (elements.length > 0) {
                        const firstElement = elements[0];
                        const label = chart.data.labels[firstElement.index];
                        const mapaTipos = { 'Ações': 'Ação', 'FIIs': 'FII', 'ETFs': 'ETF' };
                        
                        switch (label) {
                            case 'Ações': case 'FIIs': case 'ETFs':
                                mostrarTela('rendaVariavel');
                                if(typeof renderizarTelaRendaVariavel === 'function') renderizarTelaRendaVariavel();
                                const tipoAlvo = mapaTipos[label];
                                if (tipoAlvo) {
                                    setTimeout(() => {
                                        const elementoAlvo = document.querySelector(`#posicao-rv-container [data-tipo-ativo="${tipoAlvo}"]`);
                                        if (elementoAlvo) {
                                            const cardPai = elementoAlvo.closest('.dash-card') || elementoAlvo;
                                            cardPai.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                            cardPai.style.transition = 'box-shadow 0.3s';
                                            cardPai.style.boxShadow = '0 0 15px rgba(52, 152, 219, 0.5)';
                                            setTimeout(() => { cardPai.style.boxShadow = ''; }, 1000);
                                        }
                                    }, 100);
                                }
                                break;
                            case 'Renda Fixa':
                                mostrarTela('rendaFixa');
                                if(typeof renderizarPosicaoRF === 'function') renderizarPosicaoRF();
                                break;
                        }
                    }
                }
            }
        });
    }
}
function gerarDadosGraficoProventos() {
    // 1. Agrupa todos os proventos por mês/ano
    const proventosPorMes = {};
    const todasAsDatasDePagamento = [];

    todosOsProventos.forEach(p => {
        const ativo = todosOsAtivos.find(a => a.ticker === p.ticker);
        const tipo = ativo ? (ativo.tipo === 'Ação' ? 'Ações' : 'FIIs') : null;

        if ((tipo === 'Ações' || tipo === 'FIIs') && p.dataPagamento) {
            todasAsDatasDePagamento.push(new Date(p.dataPagamento + 'T12:00:00'));
            const dataPag = new Date(p.dataPagamento + 'T12:00:00');
            const chaveMes = `${dataPag.getFullYear()}-${String(dataPag.getMonth()).padStart(2, '0')}`;
            
            if (!proventosPorMes[chaveMes]) {
                proventosPorMes[chaveMes] = { Ações: 0, FIIs: 0 };
            }
            proventosPorMes[chaveMes][tipo] += p.valorTotalRecebido;
        }
    });

    if (todasAsDatasDePagamento.length === 0) {
        return { labels: [], datasets: [] }; // Retorna vazio se não houver proventos
    }

    // 2. Encontra a data de início (o primeiro provento já pago)
    const primeiraDataPagamento = new Date(Math.min.apply(null, todasAsDatasDePagamento));
    const dataFinal = new Date();

    // 3. Prepara os arrays para o gráfico, iterando mês a mês desde o início
    const labels = [];
    const dadosAcoes = [];
    const dadosFIIs = [];
    const mesesAbrev = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    let dataCorrente = new Date(primeiraDataPagamento.getFullYear(), primeiraDataPagamento.getMonth(), 1);

    while (dataCorrente <= dataFinal) {
        const ano = dataCorrente.getFullYear();
        const mes = dataCorrente.getMonth();
        
        const chaveMes = `${ano}-${String(mes).padStart(2, '0')}`;
        labels.push(`${mesesAbrev[mes]}/${String(ano).slice(-2)}`);
        
        const dadosDoMes = proventosPorMes[chaveMes] || { Ações: 0, FIIs: 0 };
        dadosAcoes.push(dadosDoMes.Ações);
        dadosFIIs.push(dadosDoMes.FIIs);

        // Avança para o próximo mês
        dataCorrente.setMonth(dataCorrente.getMonth() + 1);
    }

    return {
        labels: labels,
        datasets: [
            {
                label: 'FIIs',
                data: dadosFIIs,
                backgroundColor: '#3498db', // Azul
            },
            {
                label: 'Ações',
                data: dadosAcoes,
                backgroundColor: '#2ecc71', // Verde
            }
        ]
    };
}