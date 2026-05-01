function obterCor(index) {
    const cores = [
        '#e6194B', '#3cb44b', '#ffe119', '#4363d8', '#f58231', 
        '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#fabed4', 
        '#469990', '#dcbeff', '#9A6324', '#fffac8', '#800000', 
        '#aaffc3', '#808000', '#ffd8b1', '#000075', '#a9a9a9'
    ];
    return cores[index % cores.length];
}
function gerarDadosGraficoDesempenho(dataInicio) {
    if (!dataInicio) return null;

    // 1. Filtra e ordena o histórico pela data
    const historicoFiltrado = historicoCarteira
        .filter(s => s.data >= dataInicio)
        .sort((a, b) => new Date(a.data) - new Date(b.data));

    if (historicoFiltrado.length < 2) return null;

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
    // Substituída 'Renda Fixa' por 'Carteira RV'
    const series = {
        'IBOV': { tipo: 'indice', dados: [], acumulado: 1, iniciado: false, base: 0, ultimoValorValido: 0 },
        'IFIX': { tipo: 'indice', dados: [], acumulado: 1, iniciado: false, base: 0, ultimoValorValido: 0 },
        'Carteira RV': { tipo: 'categoria', dados: [], acumulado: 1, iniciado: false, ultimoValorValido: 0 },
        'Ações': { tipo: 'categoria', dados: [], acumulado: 1, iniciado: false, ultimoValorValido: 0 },
        'FIIs': { tipo: 'categoria', dados: [], acumulado: 1, iniciado: false, ultimoValorValido: 0 }
    };

    // Adiciona uma série para cada ativo encontrado
    ativosNoPeriodo.forEach(ticker => {
        series[ticker] = { tipo: 'ativo', dados: [], acumulado: 1, iniciado: false, ultimoValorValido: 0 };
    });

    const memoriaAtivos = {}; 
    // memoriaRF foi removida pois não é mais usada neste gráfico

    // 4. Loop Principal: Processa dia a dia
    for (let i = 0; i < historicoFiltrado.length; i++) {
        const snapAtual = historicoFiltrado[i];
        const snapAnterior = i > 0 ? historicoFiltrado[i - 1] : null;

        // --- A. RECONSTRUÇÃO DOS VALORES DO DIA ---
        
        // 1. Índices
        let valIBOV = snapAtual.ibov || 0;
        if (valIBOV <= 0 && series['IBOV'].ultimoValorValido > 0) valIBOV = series['IBOV'].ultimoValorValido;
        if (valIBOV > 0) series['IBOV'].ultimoValorValido = valIBOV;

        let valIFIX = snapAtual.ifix || 0;
        if (valIFIX <= 0 && series['IFIX'].ultimoValorValido > 0) valIFIX = series['IFIX'].ultimoValorValido;
        if (valIFIX > 0) series['IFIX'].ultimoValorValido = valIFIX;

        // 2. Ativos e Categorias
        const valoresCorrigidosHoje = {};
        // Inicializa os totais de categorias, incluindo a nova Carteira RV
        const totaisCategoriaHoje = { 'Ações': 0, 'FIIs': 0, 'Carteira RV': 0 };

        // Renda Variável (Ativo por Ativo)
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

            // Proteção contra zeros
            if (valAtivo <= 1 && valMemoria > 10) {
                if (!dadosSnap && snapAnterior) {
                    const houveVendaOuSaida = 
                        todasAsNotas.some(n => n.data > snapAnterior.data && n.data <= snapAtual.data && n.operacoes.some(op => op.ativo === ticker && op.tipo === 'venda')) ||
                        posicaoInicial.some(p => p.tipoRegistro === 'TRANSACAO_HISTORICA' && p.ticker === ticker && p.transacao.toLowerCase() === 'venda' && p.data > snapAnterior.data && p.data <= snapAtual.data) ||
                        todosOsAjustes.some(a => a.tipoAjuste === 'evento_ativo' && a.tipoEvento === 'saida' && a.ticker === ticker && a.data > snapAnterior.data && a.data <= snapAtual.data);

                    if (!houveVendaOuSaida) {
                        valAtivo = valMemoria;
                    } else {
                        delete memoriaAtivos[ticker];
                    }
                } else if (quantidade > 0) {
                    valAtivo = valMemoria;
                }
            }

            if (valAtivo > 0) {
                memoriaAtivos[ticker] = valAtivo;
                valoresCorrigidosHoje[ticker] = valAtivo;

                // Soma na categoria específica e na Carteira RV Consolidada
                const cadastro = todosOsAtivos.find(a => a.ticker === ticker);
                if (cadastro) {
                    // Adiciona ao total consolidado
                    totaisCategoriaHoje['Carteira RV'] += valAtivo;

                    // Adiciona à categoria específica (se aplicável)
                    const cat = cadastro.tipo === 'Ação' ? 'Ações' : (cadastro.tipo === 'FII' ? 'FIIs' : null);
                    if (cat && totaisCategoriaHoje[cat] !== undefined) {
                        totaisCategoriaHoje[cat] += valAtivo;
                    }
                }
            } else {
                if ((dadosSnap && dadosSnap.quantidade === 0) || (!dadosSnap && !memoriaAtivos[ticker])) {
                     delete memoriaAtivos[ticker];
                }
            }
        });

        // --- B. CÁLCULO DA RENTABILIDADE (Séries) ---
        
        Object.keys(series).forEach(nomeSerie => {
            const serie = series[nomeSerie];
            let valorAtual = 0;

            if (serie.tipo === 'indice') {
                valorAtual = nomeSerie === 'IBOV' ? valIBOV : valIFIX;
            } else if (serie.tipo === 'categoria') {
                valorAtual = totaisCategoriaHoje[nomeSerie];
            } else {
                valorAtual = valoresCorrigidosHoje[nomeSerie] || 0;
            }

            // Lógica de Início da Série
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

            if (valorAtual <= 0.01) {
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

            const lucroPeriodo = valorAtual - valorAnterior - fluxoLiquido + proventosRecebidos;
            const denominador = valorAnterior > 1 ? valorAnterior : (fluxoLiquido > 0 ? fluxoLiquido : 1);
            const rentabilidadeDia = lucroPeriodo / denominador;

            serie.acumulado = serie.acumulado * (1 + rentabilidadeDia);
            serie.dados.push(serie.acumulado - 1);
            
            serie.ultimoValorValido = valorAtual;
        });
    }

    // 5. Prepara dados para o Chart.js
    const labels = historicoFiltrado.map(s => new Date(s.data + 'T12:00:00').toLocaleDateString('pt-BR'));
    const datasets = [];
    let colorIndex = 0;
    // Atualizada a lista de prioridade para o novo padrão
    const prioridade = ['Carteira RV', 'IBOV', 'IFIX', 'Ações', 'FIIs'];

    const chavesOrdenadas = Object.keys(series).sort((a, b) => {
        const idxA = prioridade.indexOf(a); const idxB = prioridade.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1; if (idxB !== -1) return 1;
        return a.localeCompare(b);
    });

    chavesOrdenadas.forEach(nome => {
        const serie = series[nome];
        if (serie.dados.some(v => v !== null)) {
            const cor = obterCor(colorIndex++);
            datasets.push({
                label: nome,
                data: serie.dados,
                borderColor: cor,
                backgroundColor: cor,
                fill: false,
                tension: 0.1,
                pointRadius: 0,
                pointHoverRadius: 4,
                borderWidth: prioridade.includes(nome) ? 3 : 1.5
            });
        }
    });

    return { labels, datasets };
}
function renderizarGraficoDesempenho() {
    const canvasElement = document.getElementById('grafico-desempenho-canvas');
    if (!canvasElement) return;

    const ctx = canvasElement.getContext('2d');
    
    if (!configuracoesGraficos.desempenho) configuracoesGraficos.desempenho = {};
    
    if (!configuracoesGraficos.desempenho.periodo) {
        configuracoesGraficos.desempenho.periodo = '1M';
    }
    const periodoSelecionado = configuracoesGraficos.desempenho.periodo;

    const radioParaMarcar = document.querySelector(`input[name="periodo-desempenho-dash"][value="${periodoSelecionado}"]`);
    if (radioParaMarcar) {
        radioParaMarcar.checked = true;
    }

    const hoje = new Date();
    let dataInicioObj = new Date();
    
    switch (periodoSelecionado) {
        case '1M':
            dataInicioObj.setMonth(hoje.getMonth() - 1);
            break;
        case 'YTD':
            dataInicioObj = new Date(hoje.getFullYear(), 0, 1);
            break;
        case '1A':
            dataInicioObj.setFullYear(hoje.getFullYear() - 1);
            break;
        case '5A':
            dataInicioObj.setFullYear(hoje.getFullYear() - 5);
            break;
        default:
            dataInicioObj.setMonth(hoje.getMonth() - 1);
    }
    
    const dataInicioStr = dataInicioObj.toISOString().split('T')[0];

    if (graficoDesempenhoInstance) {
        graficoDesempenhoInstance.destroy();
    }

    let dadosGrafico = gerarDadosGraficoDesempenho(dataInicioStr);

    if (!dadosGrafico) {
        ctx.font = "16px 'Segoe UI'";
        ctx.fillStyle = "#888";
        ctx.textAlign = "center";
        ctx.fillText("Not enough data for comparison in the selected period.", ctx.canvas.width / 2, ctx.canvas.height / 2);
        return;
    }
    
    const prioridade = ['Carteira RV', 'IBOV', 'IFIX', 'Ações', 'FIIs'];
    const hiddenLabelsSaved = configuracoesGraficos.desempenho?.hidden || [];
    const hiddenSet = new Set(hiddenLabelsSaved);

    const userHasInteracted = configuracoesGraficos.desempenho && 'hidden' in configuracoesGraficos.desempenho;

    dadosGrafico.datasets.forEach(ds => {
        if (userHasInteracted) {
            ds.hidden = hiddenSet.has(ds.label);
        } else {
            ds.hidden = !prioridade.includes(ds.label);
        }
    });
    
    graficoDesempenhoInstance = new Chart(ctx, {
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
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'rectRounded',
                        boxWidth: 15,
                        padding: 15
                    },
                    onClick: (e, legendItem, legend) => {
                        const index = legendItem.datasetIndex;
                        const ci = legend.chart;
                        
                        if (ci.isDatasetVisible(index)) {
                            ci.hide(index);
                            legendItem.hidden = true;
                        } else {
                            ci.show(index);
                            legendItem.hidden = false;
                        }

                        const label = legendItem.text;
                        if (!configuracoesGraficos.desempenho) configuracoesGraficos.desempenho = { hidden: [] };
                        
                        const currentHiddenSet = new Set(configuracoesGraficos.desempenho.hidden || []);

                        if (legendItem.hidden) {
                            currentHiddenSet.add(label);
                        } else {
                            currentHiddenSet.delete(label);
                        }
                        
                        configuracoesGraficos.desempenho.hidden = Array.from(currentHiddenSet);
                        salvarConfiguracoesGraficos();
                    }
                },
                tooltip: {
                    enabled: true,
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
function renderizarGraficoAportesProventos() {
    const container = document.getElementById('grafico-aportes-proventos-canvas');
    if (!container) return;
    const ctx = container.getContext('2d');

    if (graficoAportesInstance) {
        graficoAportesInstance.destroy();
    }

    const dadosGrafico = gerarDadosGraficoAportesProventos();

    if (!dadosGrafico) {
        ctx.font = "16px 'Segoe UI'";
        ctx.fillStyle = "#888";
        ctx.textAlign = "center";
        ctx.fillText("Não há dados suficientes de aportes e proventos para gerar o gráfico.", ctx.canvas.width / 2, ctx.canvas.height / 2);
        return;
    }

    const config = {
        data: dadosGrafico,
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
                x: {},
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) { return formatarMoeda(value); }
                    }
                }
            }
        }
    };

    // Configuração específica para cada tipo de gráfico
    if (tipoGraficoAportes === 'barras') {
        config.type = 'bar';
        config.options.scales.x.stacked = true;
        config.options.scales.y.stacked = true;
    } else { // 'linhas'
        config.type = 'line';
        config.data.datasets.forEach(ds => {
            ds.borderWidth = 2;
            ds.fill = false;
            ds.tension = 0.1;
        });
    }

    graficoAportesInstance = new Chart(ctx, config);

    // Atualiza o estado visual dos botões de toggle
    document.querySelectorAll('#toggle-aportes-grafico .chart-toggle-btn').forEach(btn => {
        if (btn.dataset.tipo === tipoGraficoAportes) {
            btn.classList.add('ativo');
        } else {
            btn.classList.remove('ativo');
        }
    });
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
function renderizarGraficoCarteira() {
    const ctx = document.getElementById('grafico-carteira-canvas')?.getContext('2d');
    if (!ctx) return;

    if (graficoCarteiraInstance) {
        graficoCarteiraInstance.destroy();
        graficoCarteiraInstance = null;
    }

    if (!historicoCarteira || historicoCarteira.length < 2) {
        ctx.font = "16px 'Segoe UI'";
        ctx.fillStyle = "#888";
        ctx.textAlign = "center";
        ctx.fillText("Insufficient data. Save at least 2 snapshots to generate the chart.", ctx.canvas.width / 2, ctx.canvas.height / 2);
        return;
    }

    const historicoOrdenado = [...historicoCarteira].sort((a, b) => new Date(a.data) - new Date(b.data));

    const labels = [];
    const dadosBRL = [], dadosUSD = [], dadosEUR = [], dadosGBP = [];

    const memoriaAtivos = {}; 
    let memoriaRF = 0;
    
    let encontrouPrimeiroInvestimento = false;

    historicoOrdenado.forEach(snapshot => {
        let totalRVCorrigido = 0;
        const ativosNoSnapshot = snapshot.detalhesCarteira?.ativos || {};
        const todosTickers = new Set([...Object.keys(ativosNoSnapshot), ...Object.keys(memoriaAtivos)]);

        todosTickers.forEach(ticker => {
            const dadosSnap = ativosNoSnapshot[ticker];
            let valorAtivo = 0;
            let quantidade = 0;

            if (dadosSnap) {
                valorAtivo = dadosSnap.valorDeMercado || (dadosSnap.quantidade * dadosSnap.precoAtual);
                quantidade = dadosSnap.quantidade;
            }

            const valorMemoria = memoriaAtivos[ticker] || 0;
            
            if (valorAtivo <= 1 && valorMemoria > 10) {
                if (quantidade > 0 || !dadosSnap) {
                    valorAtivo = valorMemoria; 
                }
            }

            if (valorAtivo > 0) {
                memoriaAtivos[ticker] = valorAtivo;
                totalRVCorrigido += valorAtivo;
            }
            
            if (dadosSnap && dadosSnap.quantidade === 0) {
                delete memoriaAtivos[ticker];
            }
        });

        let totalRF = 0;
        if (snapshot.detalhesCarteira?.rendaFixa) {
            snapshot.detalhesCarteira.rendaFixa.forEach(rf => totalRF += (rf.saldoLiquido || 0));
        } else {
            totalRF = snapshot.detalhesCarteira?.valorPorClasse?.['Renda Fixa'] || 0;
        }
        if (totalRF < 1 && memoriaRF > 100) {
            totalRF = memoriaRF;
        }
        if (totalRF > 0) memoriaRF = totalRF;

        const valorInvestimentosCorrigido = totalRVCorrigido + totalRF;

        if (valorInvestimentosCorrigido > 1) {
            encontrouPrimeiroInvestimento = true;
        }

        if (!encontrouPrimeiroInvestimento) {
            return; 
        }

        const dataObj = new Date(snapshot.data + 'T12:00:00');
        const labelData = dataObj.toLocaleDateString('en-GB'); 
        labels.push(labelData);

        dadosBRL.push(valorInvestimentosCorrigido);

        const cotacoes = snapshot.cotacoesMoedas || { USD: 0, EUR: 0, GBP: 0 };
        const converter = (val, taxa) => (taxa > 0 ? val / taxa : 0);
        
        const pushSafe = (array, val) => {
            if (val === 0 && array.length > 0 && array[array.length - 1] > 0) {
                array.push(array[array.length - 1]);
            } else {
                array.push(val);
            }
        };

        pushSafe(dadosUSD, converter(valorInvestimentosCorrigido, cotacoes.USD));
        pushSafe(dadosEUR, converter(valorInvestimentosCorrigido, cotacoes.EUR));
        pushSafe(dadosGBP, converter(valorInvestimentosCorrigido, cotacoes.GBP));
    });

    const datasets = [
        { 
            label: 'Value in BRL', 
            data: dadosBRL, 
            borderColor: 'rgba(46, 204, 113, 1)', 
            backgroundColor: 'rgba(46, 204, 113, 0.1)', 
            fill: true, 
            tension: 0.1, 
            borderWidth: 3, 
            pointRadius: 0, 
            pointHoverRadius: 4
        },
        { 
            label: 'Value in USD', 
            data: dadosUSD, 
            borderColor: 'rgba(52, 152, 219, 0.9)', 
            fill: false, 
            tension: 0.1, 
            borderWidth: 1.5,
            pointRadius: 0, 
            pointHoverRadius: 4
        },
        { 
            label: 'Value in EUR', 
            data: dadosEUR, 
            borderColor: 'rgba(241, 196, 15, 0.9)', 
            fill: false, 
            tension: 0.1, 
            borderWidth: 1.5,
            pointRadius: 0, 
            pointHoverRadius: 4
        },
        { 
            label: 'Value in GBP', 
            data: dadosGBP, 
            borderColor: 'rgba(155, 89, 182, 0.9)', 
            fill: false, 
            tension: 0.1, 
            borderWidth: 1.5,
            pointRadius: 0, 
            pointHoverRadius: 4
        }
    ];

    const hiddenLabels = configuracoesGraficos.evolucao?.hidden || [];
    datasets.forEach(ds => {
        if (hiddenLabels.includes(ds.label)) {
            ds.hidden = true;
        }
    });

    graficoCarteiraInstance = new Chart(ctx, {
        type: 'line',
        data: { labels: labels, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'rectRounded',
                        boxWidth: 15
                    },
                    onClick: (e, legendItem, legend) => {
                        const index = legendItem.datasetIndex;
                        const ci = legend.chart;
                        if (ci.isDatasetVisible(index)) {
                            ci.hide(index);
                            legendItem.hidden = true;
                        } else {
                            ci.show(index);
                            legendItem.hidden = false;
                        }
                        const label = legendItem.text;
                        const isHidden = legendItem.hidden;
                        
                        if (!configuracoesGraficos.evolucao) configuracoesGraficos.evolucao = { hidden: [] };
                        const hiddenSet = new Set(configuracoesGraficos.evolucao.hidden || []);

                        if (isHidden) hiddenSet.add(label);
                        else hiddenSet.delete(label);
                        
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
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                        }
                    }
                }
            }
        }
    });
}
function renderizarGraficoAlocacao(resumoCarteira, categoriasOrdenadas) {
    // Agora que a variável foi declarada, esta verificação funcionará corretamente.
    if (graficoAlocacaoInstance) {
        graficoAlocacaoInstance.destroy();
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
    if (chartData.length > 0) {
        const mapaDeCores = { 'FIIs': '#3498db', 'Ações': '#2ecc71', 'ETFs': '#f39c12', 'Renda Fixa': '#e74c3c' };
        const coresDoGrafico = chartLabels.map(label => mapaDeCores[label] || '#95a5a6'); 
        const ctx = document.getElementById('grafico-alocacao-canvas').getContext('2d');
        
        // A nova instância do gráfico é atribuída à variável que agora tem o escopo correto.
        graficoAlocacaoInstance = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: chartLabels, datasets: [{ label: 'Patrimônio de Investimentos', data: chartData, backgroundColor: coresDoGrafico, borderColor: '#ffffff', borderWidth: 2 }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' },
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

                        switch (label) {
                            case 'Ações':
                            case 'FIIs':
                            case 'ETFs':
                                mostrarTela('rendaVariavel');
                                renderizarTelaRendaVariavel();
                                setTimeout(() => {
                                    const container = document.getElementById('posicao-rv-container');
                                    let searchText = label;
                                    if (label === 'FIIs') searchText = 'Fundos Imobiliários';
                                    
                                    const h2Elements = container.querySelectorAll('h2');
                                    const targetHeader = Array.from(h2Elements).find(h2 => h2.textContent.includes(searchText));
                                    
                                    if (targetHeader) {
                                        targetHeader.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    }
                                }, 100);
                                break;
                            case 'Renda Fixa':
                                mostrarTela('rendaFixa');
                                renderizarPosicaoRF();
                                break;
                        }
                    }
                }
            }
        });
    }
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