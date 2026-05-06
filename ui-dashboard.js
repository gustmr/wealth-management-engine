// Dashboard Summary // Resumo do Dashboard
function abrirModalInvestimentosDetalhes() {
    const container = document.getElementById('modal-investimentos-detalhes-conteudo');
    container.innerHTML = '<h4><i class="fas fa-spinner fa-spin"></i> Calculando posições...</h4>';

    // Adiciona a data e hora atuais ao elemento de timestamp para impressão
    const agora = new Date();
    const dataFormatada = agora.toLocaleDateString('pt-BR');
    const horaFormatada = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const timestampCompleto = `Posição em ${dataFormatada} às ${horaFormatada}`;
    document.getElementById('print-timestamp').textContent = timestampCompleto;

    abrirModal('modal-investimentos-detalhes');

    setTimeout(() => {
        const hoje = new Date().toISOString().split('T')[0];
        const posicoesRV = gerarPosicaoDetalhada(hoje);
        const ativosRFAtivos = todosOsAtivosRF.filter(a => !(a.descricao || '').toLowerCase().includes('inativa'));

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
                    htmlModal += `<h4>Renda Fixa</h4>`;
                    cabecalhoTabela = '<tr><th>Ativo</th><th class="numero">Saldo Líquido Atual</th></tr>';
                    ativos.sort((a, b) => a.descricao.localeCompare(b.descricao));
                    ativos.forEach(ativo => {
                        corpoTabela += `<tr><td>${ativo.descricao}</td><td class="numero">${formatarMoeda(ativo.saldoLiquido)}</td></tr>`;
                        subtotalCategoria += ativo.saldoLiquido;
                    });
                } else {
                    htmlModal += `<h4>${categoria}</h4>`;
                    cabecalhoTabela = '<tr><th>Ativo</th><th class="numero">Quantidade</th><th class="numero">Preço de Mercado</th><th class="numero">Valor Total</th></tr>';
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

                htmlModal += `<table><thead>${cabecalhoTabela}</thead><tbody>${corpoTabela}</tbody>
                    <tfoot><tr>
                        <td colspan="${categoria === 'Renda Fixa' ? 1 : 3}" style="text-align: right;"><strong>Subtotal ${categoria}:</strong></td>
                        <td class="numero"><strong>${formatarMoeda(subtotalCategoria)}</strong></td>
                    </tr></tfoot>
                </table>`;
                totalGeral += subtotalCategoria;
            }
        });

        htmlModal += `<h3 id="modal-investimentos-detalhes-total-geral">Total Geral Investido: ${formatarMoeda(totalGeral)}</h3>`;
        container.innerHTML = htmlModal;

    }, 50);
}
function abrirModalDetalhesContas() {
    const hoje = new Date().toISOString().split('T')[0];
    const contasAtivas = getTodasContasAtivas();
    
    let conteudoHtml = '<table><thead><tr><th>Conta</th><th class="numero">Saldo Atual</th></tr></thead><tbody>';
    
    if (contasAtivas.length > 0) {
        contasAtivas.sort((a, b) => a.banco.localeCompare(b.banco)).forEach(conta => {
            const saldoConta = calcularSaldoEmData(conta, hoje);
            conteudoHtml += `
                <tr>
                    <td>${conta.banco} (${conta.tipo})</td>
                    <td class="numero">${formatarMoeda(saldoConta)}</td>
                </tr>`;
        });
    } else {
        conteudoHtml += '<tr><td colspan="2" style="text-align:center;">Nenhuma conta BRL ativa cadastrada.</td></tr>';
    }
    
    conteudoHtml += '</tbody></table>';

    document.getElementById('modal-dashboard-detalhes-titulo').textContent = 'Detalhes do Saldo em Contas (BRL)';
    document.getElementById('modal-dashboard-detalhes-conteudo').innerHTML = conteudoHtml;
    abrirModal('modal-dashboard-detalhes');
}


function abrirModalDetalhesMoedas() {
    const hoje = new Date().toISOString().split('T')[0];
    const todosOsEventosCaixa = obterTodosOsEventosDeCaixa();

    let conteudoHtml = '<table><thead><tr><th>Ativo</th><th class="numero">Saldo Original</th><th class="numero">Saldo Convertido (BRL)</th></tr></thead><tbody>';
    
    if (todosOsAtivosMoedas.length > 0) {
        todosOsAtivosMoedas.sort((a, b) => a.nomeAtivo.localeCompare(b.nomeAtivo)).forEach(ativo => {
            const transacoesPassadasEPresentes = todosOsEventosCaixa.filter(e =>
                e.tipo === 'moeda' && String(e.idAlvo) === String(ativo.id) && e.source !== 'recorrente_futura' && e.data <= hoje
            );
            const saldoAtivoAtual = transacoesPassadasEPresentes.reduce((soma, t) => soma + arredondarMoeda(t.valor), ativo.saldoInicial);
            const cotacao = dadosMoedas.cotacoes[ativo.moeda] || 0;
            const valorEmBRL = saldoAtivoAtual * cotacao;
            
            conteudoHtml += `
                <tr>
                    <td>${ativo.nomeAtivo} (${ativo.moeda})</td>
                    <td class="numero">${formatarMoedaEstrangeira(saldoAtivoAtual, ativo.moeda)}</td>
                    <td class="numero">${formatarMoeda(valorEmBRL)}</td>
                </tr>`;
        });
    } else {
        conteudoHtml += '<tr><td colspan="3" style="text-align:center;">Nenhum ativo em moeda estrangeira cadastrado.</td></tr>';
    }

    conteudoHtml += '</tbody></table>';

    document.getElementById('modal-dashboard-detalhes-titulo').textContent = 'Detalhes de Moedas Estrangeiras';
    document.getElementById('modal-dashboard-detalhes-conteudo').innerHTML = conteudoHtml;
    abrirModal('modal-dashboard-detalhes');
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
    return `
        <div class="rebalanceamento-item" style="flex-direction: column; align-items: flex-start; background-color: #fffaf0; border: 1px solid #ffeeba; padding: 10px; border-radius: 6px;">
            <strong style="color: #856404;"><i class="fas fa-exclamation-triangle"></i> Análise de Concentração (Renda Variável)</strong>
            <small style="display: block; margin-top: 5px; line-height: 1.5;">
                Seus <strong data-tooltip="${tickersTop3}" style="cursor: help; text-decoration: underline dotted;">3 maiores</strong> ativos representam <strong>${percTop3}</strong> da carteira.<br>
                Seus <strong data-tooltip="${tickersTop5}" style="cursor: help; text-decoration: underline dotted;">5 maiores</strong> ativos representam <strong>${percTop5}</strong> da carteira.<br>
                Seus <strong data-tooltip="${tickersTop10}" style="cursor: help; text-decoration: underline dotted;">10 maiores</strong> ativos representam <strong>${percTop10}</strong> da carteira.
            </small>
        </div>
    `;
}
function verificarAlertasDashboard(posicoesRV = null, dadosBalanceamento = null) {
    if (!posicoesRV) posicoesRV = gerarPosicaoDetalhada(new Date().toISOString().split('T')[0]);
    if (!dadosBalanceamento) dadosBalanceamento = gerarDadosBalanceamento('todos');

    if (!dadosAlocacao) {
        const data = localStorage.getItem('carteira_dados_alocacao_offline');
        dadosAlocacao = data ? JSON.parse(data) : { categorias: {}, ativos: {} };
    }
    const modoAtual = dadosAlocacao.modoRebalanceamento || 'categoria';

    // Parâmetros Globais
    const MARGEM_LUCRO_VENDA = configuracoesFiscais.margemLucroVenda || 0;
    const TOLERANCIA_REBALANCEAMENTO = configuracoesFiscais.toleranciaRebalanceamento || 0.05;
    const CONSIDERAR_REGRAS_ALOCACAO = configuracoesFiscais.considerarRegrasVenda; 

    const resultado = { oportunidades: [], rebalanceamento: [], mercado: [] };

    if (!historicoCarteira || historicoCarteira.length < 2) return resultado;

    // --- 1. Alerta de Alta Volatilidade Intradiária (> 5%) ---
    const ultimoSnapshot = historicoCarteira[historicoCarteira.length - 1];
    const cotacoesAtuais = dadosDeMercado.cotacoes;

    if (ultimoSnapshot && ultimoSnapshot.detalhesCarteira && ultimoSnapshot.detalhesCarteira.ativos) {
        for (const ticker in cotacoesAtuais) {
            if (posicoesRV[ticker] && posicoesRV[ticker].quantidade > 0.0001) {
                const dadosSnapPassado = ultimoSnapshot.detalhesCarteira.ativos[ticker];
                const precoOntem = dadosSnapPassado ? dadosSnapPassado.precoAtual : 0;
                const precoHoje = cotacoesAtuais[ticker].valor;

                if (precoOntem > 0 && precoHoje > 0) {
                    const variacaoHoje = (precoHoje / precoOntem) - 1;
                    if (Math.abs(variacaoHoje) >= 0.05) {
                        const tipoVol = variacaoHoje > 0 ? 'Explosão' : 'Queda Brusca';
                        const corIcone = variacaoHoje > 0 ? 'var(--success-color)' : 'var(--danger-color)';
                        const seta = variacaoHoje > 0 ? 'fa-rocket' : 'fa-meteor';
                        resultado.mercado.push({
                            tipo: 'volatilidade-hoje',
                            texto: `<strong style="color:${corIcone}"><i class="fas ${seta}"></i> ${tipoVol} Hoje:</strong> O ativo <strong>${ticker}</strong> variou <strong>${formatarPercentual(variacaoHoje)}</strong> em relação ao último fechamento.`
                        });
                    }
                }
            }
        }
    }

    // --- 2. Lógica de Tendência de Mercado (3 Dias Úteis) ---
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
        resultado.mercado.push({ tipo: 'grupo-alta-3d', texto: `<strong>Tendência de Alta (3 pregões):</strong> ${ativosEmAlta3Dias.join(', ')}` });
    }
    if (ativosEmBaixa3Dias.length > 0) {
        resultado.mercado.push({ tipo: 'grupo-baixa-3d', texto: `<strong>Tendência de Baixa (3 pregões):</strong> ${ativosEmBaixa3Dias.join(', ')}` });
    }

    // --- 3. Alertas de Desbalanceamento ---
    for (const nomeCategoria in dadosBalanceamento.categorias) {
        if (dadosBalanceamento.categorias[nomeCategoria].ativos) {
            dadosBalanceamento.categorias[nomeCategoria].ativos.forEach(ativo => {
                const toleranciaRelativa = ativo.ideal.percentualGlobal * TOLERANCIA_REBALANCEAMENTO;
                if (Math.abs(ativo.ajuste.percentual) > toleranciaRelativa) {
                    const direcao = ativo.ajuste.percentual > 0 ? 'subalocado' : 'superalocado';
                    const classeDirecao = direcao === 'subalocado' ? 'valor-positivo' : 'valor-negativo';
                    resultado.rebalanceamento.push({ 
                        tipo: 'desbalanceamento', 
                        texto: `<strong>${ativo.ticker}</strong>: <span class="${classeDirecao}">${direcao}</span> (${formatarPercentual(ativo.atual.percentualGlobal)} vs Ideal ${formatarPercentual(ativo.ideal.percentualGlobal)})`
                    });
                }
            });
        }
    }

    // --- 4. Alerta de Oportunidade de Venda (PADRONIZADO) ---
    // Agora usa estritamente a mesma lógica do Plano de Rebalanceamento:
    // Preço Médio vs Margem de Lucro Configurada.
    
    let listaCandidatos = [];

    // Define a lista de candidatos com base no checkbox (Regras de Alocação)
    if (CONSIDERAR_REGRAS_ALOCACAO) {
        // Se respeita regras, só alerta se o plano de rebalanceamento já indicou venda (Superalocação)
        const dadosVenda = processarRebalanceamento(dadosBalanceamento.categorias, modoAtual);
        // Filtra apenas os que são vendáveis E não são Renda Fixa
        listaCandidatos = dadosVenda.listaReduzir.filter(item => item.ticker !== 'Renda Fixa');
    } else {
        // Modo Oportunista: Verifica TODOS os ativos da carteira
        Object.keys(posicoesRV).forEach(ticker => {
            if (posicoesRV[ticker].quantidade > 0.0001) {
                listaCandidatos.push({ ticker: ticker });
            }
        });
    }

    listaCandidatos.forEach(item => {
        const cotacaoAtual = dadosDeMercado.cotacoes[item.ticker]?.valor || 0;
        const posicao = posicoesRV[item.ticker];
        
        // Verifica se temos Preço Médio válido
        if (posicao && posicao.precoMedio > 0 && cotacaoAtual > 0) {
            
            // Cálculo Padronizado: Lucro sobre PM
            const lucroPercentual = (cotacaoAtual / posicao.precoMedio) - 1;

            // Se o lucro superar a margem configurada, dispara o alerta
            if (lucroPercentual >= MARGEM_LUCRO_VENDA) {
                
                // Texto explicativo alinhado com a lógica
                resultado.oportunidades.push({
                    tipo: 'oportunidade-venda',
                    texto: `<strong>${item.ticker}</strong>: Oportunidade! Lucro de <strong>${formatarPercentual(lucroPercentual)}</strong> (acima da margem de ${formatarPercentual(MARGEM_LUCRO_VENDA)}).`
                });
            }
        }
    });

    return resultado;
}

function abrirModalAlertasDashboard() {
    const hoje = new Date().toISOString().split('T')[0];
    const posicoesRV = gerarPosicaoDetalhada(hoje);
    const dadosBalanceamento = gerarDadosBalanceamento('todos');

    const margemVenda = configuracoesFiscais.margemLucroVenda;
    const toleranciaRebalanceamento = configuracoesFiscais.toleranciaRebalanceamento;
    const consideraRegras = configuracoesFiscais.considerarRegrasVenda; // Checkbox

    const alertas = verificarAlertasDashboard(posicoesRV, dadosBalanceamento);
    const modoAtual = dadosAlocacao.modoRebalanceamento || 'categoria';
    const container = document.getElementById('modal-dashboard-alertas-conteudo');
    let html = '';

    // 1. Oportunidades
    if (alertas.oportunidades.length > 0) {
        html += `<h4 style="color: var(--success-color);"><i class="fas fa-star"></i> Oportunidades de Realização</h4>`;
        
        // Mensagem de Contexto Dinâmica
        const contexto = consideraRegras 
            ? `Respeitando regras de alocação (Modo Seguro)` 
            : `<span style="color: var(--danger-color)">Ignorando alocação (Modo Oportunista)</span>`;

        html += `<p style="font-size: 0.85em; color: #666; margin-bottom: 10px;">
                    Margem Configurada: <strong>> ${formatarPercentual(margemVenda)}</strong> | ${contexto}
                 </p>`;

        alertas.oportunidades.forEach(alerta => {
            html += `<div class="alerta-item tipo-oportunidade"><i class="fas fa-dollar-sign"></i> ${alerta.texto}</div>`;
        });
    } else {
        html += `<h4>Oportunidades de Realização</h4><p style="font-style: italic; color: #888;">Nenhuma oportunidade acima da margem de ${formatarPercentual(margemVenda)} detectada.</p>`;
    }

    // 2. Mercado e Volatilidade
    html += '<hr style="margin: 15px 0;">';
    html += '<h4><i class="fas fa-chart-line"></i> Mercado e Volatilidade</h4>';
    if (alertas.mercado.length > 0) {
        alertas.mercado.forEach(alerta => {
            let icone = 'fa-info-circle'; let cor = '#333';
            if (alerta.tipo === 'volatilidade-hoje') {
                html += `<div class="alerta-item">${alerta.texto}</div>`;
            } else {
                if (alerta.tipo.includes('alta')) { icone = 'fa-arrow-circle-up'; cor = 'var(--success-color)'; }
                if (alerta.tipo.includes('baixa')) { icone = 'fa-arrow-circle-down'; cor = 'var(--danger-color)'; }
                html += `<div class="alerta-item" style="color: ${cor};"><i class="fas ${icone}"></i> ${alerta.texto}</div>`;
            }
        });
    } else { html += '<p>Nenhuma tendência significativa.</p>'; }
    
    // 3. Rebalanceamento
    html += '<hr style="margin: 15px 0;">';
    html += `<h4><i class="fas fa-balance-scale"></i> Atenção ao Rebalanceamento (> ${formatarPercentual(toleranciaRebalanceamento)})</h4>`;
    if (alertas.rebalanceamento.length > 0) {
        alertas.rebalanceamento.forEach(alerta => { html += `<div class="alerta-item"><i class="fas fa-exclamation-circle" style="color: var(--accent-color);"></i> ${alerta.texto}</div>`; });
    } else { html += `<p>Sua carteira está dentro da tolerância.</p>`; }

    // 4. Lucros e Prejuízos Top 3
    html += '<h4>Lucros e Prejuízos (Não Realizados)</h4>';
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
        html += '<div class="form-grid" style="grid-template-columns: 1fr 1fr; gap: 30px;"><div><h5>Maiores Lucros</h5>';
        top3.forEach(item => { html += `<div class="alerta-item tipo-preco-alta"><i class="fas fa-arrow-up"></i><strong>${item.ticker}:</strong> ${formatarPercentual(item.variacao)}</div>`; });
        html += '</div><div><h5>Maiores Prejuízos</h5>';
        bottom3.forEach(item => { html += `<div class="alerta-item tipo-preco-baixa"><i class="fas fa-arrow-down"></i><strong>${item.ticker}:</strong> ${formatarPercentual(item.variacao)}</div>`; });
        html += '</div></div>';
    } else { html += '<p>Sem dados suficientes.</p>'; }

    container.innerHTML = html;
    abrirModal('modal-dashboard-alertas');
}

function renderizarPainelComparativo(resumoCarteira) {
    const container = document.getElementById('painel-comparativo-container');
    if (!container) return;

    // Garante estilo de Card e visibilidade
    container.style.display = 'flex'; 
    container.className = 'dash-card'; 

    // --- ESTADO VAZIO (SEM COMPARAÇÃO) ---
    if (!dadosComparacao) {
        container.innerHTML = `
            <div class="dash-header head-comp">
                <h3><i class="fas fa-exchange-alt"></i> Comparativo de Carteiras</h3>
            </div>
            <div class="dash-body" style="text-align: center; padding: 40px;">
                <i class="fas fa-file-import" style="font-size: 3rem; color: #ddd; margin-bottom: 15px;"></i>
                <p style="color: #666; margin-bottom: 20px;">Importe um backup (.json) para comparar com sua carteira atual.</p>
                
                <button class="btn btn-secondary" id="btn-importar-resumo-painel">
                    <i class="fas fa-upload"></i> Carregar Backup para Comparação
                </button>
            </div>
        `;
        
        // --- CORREÇÃO: REMOVIDO O BLOCO SETTIMEOUT QUE CAUSAVA O ERRO ---
        // O botão existe no HTML, mas não tentamos atrelar JS a ele aqui
        // pois a função importarResumoParaPainel não existe.
        
        return;
    }

    // --- DAQUI PARA BAIXO, O CÓDIGO PERMANECE IDÊNTICO AO QUE VOCÊ JÁ TEM ---
    // (Pode manter a lógica de gerar tabelas, YOC e DY que estava funcionando)
    
    // ... [Mantenha o resto da função original igualzinho] ...
    
    const gerarTabelaHtml = (dados, titulo, isComparisonColumn = false, dadosYoCDY = null) => {
        // ... (seu código de gerar tabela)
         if (!dados) return '';
        
        let headerContent;
        if (isComparisonColumn) {
            headerContent = `
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px; border-bottom: 2px solid #34495e; padding-bottom: 8px;">
                    <span style="font-weight: bold; color: #2c3e50; font-size: 1.1em;">${titulo}</span>
                    <i class="fas fa-times" onclick="dadosComparacao = null; renderizarPainelComparativo();" title="Fechar Comparação" style="cursor: pointer; color: #e74c3c;"></i>
                </div>`;
        } else {
            headerContent = `
                <div style="font-weight: bold; color: #2c3e50; margin-bottom: 15px; border-bottom: 2px solid #3498db; padding-bottom: 8px; font-size: 1.1em;">
                    ${titulo}
                </div>`;
        }

        const criarLinha = (label, valorBrl, destaque = false, yoc = null, dy = null) => {
            const valorUsd = dadosMoedas.cotacoes.USD ? valorBrl / dadosMoedas.cotacoes.USD : 0;
            const valorEur = dadosMoedas.cotacoes.EUR ? valorBrl / dadosMoedas.cotacoes.EUR : 0;
            const valorGbp = dadosMoedas.cotacoes.GBP ? valorBrl / dadosMoedas.cotacoes.GBP : 0;
            
            const styleBg = destaque ? 'background-color: #f1f8ff; font-weight: 600;' : '';
            const borderBottom = 'border-bottom: 1px solid #eee;';

            let yieldHtml = '';
            const yocFmt = (yoc !== null && yoc > 0) ? `<span title="Yield on Cost">YoC: ${formatarPercentual(yoc)}</span>` : null;
            const dyFmt = (dy !== null && dy > 0) ? `<span title="Dividend Yield Atual">DY: ${formatarPercentual(dy)}</span>` : null;
            
            if (yocFmt || dyFmt) {
                yieldHtml = `<div style="font-size: 0.8em; color: #666; margin-top: 2px;">${[yocFmt, dyFmt].filter(Boolean).join(' | ')}</div>`;
            }

            return `
                <tr style="${styleBg} ${borderBottom}">
                    <td style="padding: 10px 5px;">
                        <div style="color: #2c3e50;">${label}</div>
                        ${yieldHtml}
                    </td>
                    <td style="padding: 10px 5px; text-align: right; color: #7f8c8d; font-size: 0.9em;">${formatarMoedaEstrangeira(valorGbp, 'GBP')}</td>
                    <td style="padding: 10px 5px; text-align: right; color: #7f8c8d; font-size: 0.9em;">${formatarMoedaEstrangeira(valorEur, 'EUR')}</td>
                    <td style="padding: 10px 5px; text-align: right; color: #7f8c8d; font-size: 0.9em;">${formatarMoedaEstrangeira(valorUsd, 'USD')}</td>
                    <td style="padding: 10px 5px; text-align: right; color: #2c3e50; font-weight: 500;">${formatarMoeda(valorBrl)}</td>
                </tr>
            `;
        };
        
        return `
            <div style="flex: 1; min-width: 350px; background: #fff; padding: 0 10px;">
                ${headerContent}
                <table style="width: 100%; border-collapse: collapse; font-size: 0.95em;">
                    <thead>
                        <tr style="border-bottom: 2px solid #eee; color: #95a5a6; font-size: 0.85em; text-transform: uppercase;">
                            <th style="text-align: left; padding: 5px;">Métrica</th>
                            <th style="text-align: right; padding: 5px;">GBP</th>
                            <th style="text-align: right; padding: 5px;">EUR</th>
                            <th style="text-align: right; padding: 5px;">USD</th>
                            <th style="text-align: right; padding: 5px;">BRL</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${criarLinha("Patrimônio Total", dados.patrimonioTotal, true)}
                        ${criarLinha("Carteira de Invest.", dados.carteiraInvestimentos)}
                        ${criarLinha("Saldo em Contas", dados.saldoContas || 0)}
                        ${criarLinha("Moedas Estrangeiras", dados.saldoMoedas || 0)}
                        ${criarLinha("Proventos Provisionados", dados.proventosProvisionados || 0)}
                        
                        <tr><td colspan="5" style="height: 15px;"></td></tr>

                        ${criarLinha("Proventos Mensais (Proj.)", dados.proventosMensais.total, true, dadosYoCDY?.total?.yoc, dadosYoCDY?.total?.dy)}
                        ${criarLinha("Proventos (Ações)", dados.proventosMensais.acoes, false, dadosYoCDY?.acoes?.yoc, dadosYoCDY?.acoes?.dy)}
                        ${criarLinha("Proventos (FIIs)", dados.proventosMensais.fiis, false, dadosYoCDY?.fiis?.yoc, dadosYoCDY?.fiis?.dy)}
                    </tbody>
                </table>
            </div>
        `;
    };

    const dadosAtuais = {
        nomeUsuario: (typeof userName !== 'undefined' ? userName : "Minha Carteira"),
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
    
    const dadosYoCDY_Atuais = { acoes: {yoc:0, dy:0}, fiis: {yoc:0, dy:0}, total: {yoc:0, dy:0} };
    if (resumoCarteira) {
        const custoAcoes = resumoCarteira['Ações']?.custo || 0;
        const mercadoAcoes = resumoCarteira['Ações']?.mercado || 0;
        const provAnualAcoes = dadosAtuais.proventosMensais.acoes * 12;
        dadosYoCDY_Atuais.acoes.yoc = custoAcoes > 0 ? provAnualAcoes / custoAcoes : 0;
        dadosYoCDY_Atuais.acoes.dy = mercadoAcoes > 0 ? provAnualAcoes / mercadoAcoes : 0;

        const custoFIIs = resumoCarteira['FIIs']?.custo || 0;
        const mercadoFIIs = resumoCarteira['FIIs']?.mercado || 0;
        const provAnualFIIs = dadosAtuais.proventosMensais.fiis * 12;
        dadosYoCDY_Atuais.fiis.yoc = custoFIIs > 0 ? provAnualFIIs / custoFIIs : 0;
        dadosYoCDY_Atuais.fiis.dy = mercadoFIIs > 0 ? provAnualFIIs / mercadoFIIs : 0;

        const custoTotal = custoAcoes + custoFIIs;
        const mercadoTotal = mercadoAcoes + mercadoFIIs;
        const provAnualTotal = provAnualAcoes + provAnualFIIs;
        dadosYoCDY_Atuais.total.yoc = custoTotal > 0 ? provAnualTotal / custoTotal : 0;
        dadosYoCDY_Atuais.total.dy = mercadoTotal > 0 ? provAnualTotal / mercadoTotal : 0;
    }

    const dadosYoCDY_Comp = { acoes: {yoc:0, dy:0}, fiis: {yoc:0, dy:0}, total: {yoc:0, dy:0} };
    if (dadosComparacao.valorCustoPorClasse) {
        const custoAcoes = dadosComparacao.valorCustoPorClasse['Ações'] || 0;
        const mercadoAcoes = dadosComparacao.valorPorClasse['Ações'] || 0;
        const provAnualAcoes = (dadosComparacao.proventosMensais?.acoes || 0) * 12;
        dadosYoCDY_Comp.acoes.yoc = custoAcoes > 0 ? provAnualAcoes / custoAcoes : 0;
        dadosYoCDY_Comp.acoes.dy = mercadoAcoes > 0 ? provAnualAcoes / mercadoAcoes : 0;

        const custoFIIs = dadosComparacao.valorCustoPorClasse['FIIs'] || 0;
        const mercadoFIIs = dadosComparacao.valorPorClasse['FIIs'] || 0;
        const provAnualFIIs = (dadosComparacao.proventosMensais?.fiis || 0) * 12;
        dadosYoCDY_Comp.fiis.yoc = custoFIIs > 0 ? provAnualFIIs / custoFIIs : 0;
        dadosYoCDY_Comp.fiis.dy = mercadoFIIs > 0 ? provAnualFIIs / mercadoFIIs : 0;

        const custoTotal = custoAcoes + custoFIIs;
        const mercadoTotal = mercadoAcoes + mercadoFIIs;
        const provAnualTotal = provAnualAcoes + provAnualFIIs;
        dadosYoCDY_Comp.total.yoc = custoTotal > 0 ? provAnualTotal / custoTotal : 0;
        dadosYoCDY_Comp.total.dy = mercadoTotal > 0 ? provAnualTotal / mercadoTotal : 0;
    }

    const patrimonioSomado = dadosAtuais.patrimonioTotal + dadosComparacao.patrimonioTotal;
    const cotacoes = dadosMoedas.cotacoes;
    const totalGbp = cotacoes.GBP ? patrimonioSomado / cotacoes.GBP : 0;
    const totalEur = cotacoes.EUR ? patrimonioSomado / cotacoes.EUR : 0;
    const totalUsd = cotacoes.USD ? patrimonioSomado / cotacoes.USD : 0;

    const dataObj = new Date(dadosComparacao.dataExportacao + 'T12:00:00');
    const tituloDadosComparacao = `${dadosComparacao.nomeUsuario} <span style="font-weight:normal; font-size:0.8em">(${dataObj.toLocaleDateString('pt-BR')})</span>`;

    container.innerHTML = `
        <div class="dash-header head-comp">
            <h3><i class="fas fa-exchange-alt"></i> Comparativo de Carteiras</h3>
            <div style="text-align: right;">
                <div style="font-size: 1.1em; font-weight: bold; color: #2c3e50;">
                    Total Combinado: ${formatarMoeda(patrimonioSomado)}
                </div>
                <div style="font-size: 0.8em; color: #7f8c8d; margin-top: 3px;">
                    ${formatarMoedaEstrangeira(totalGbp, 'GBP')} | 
                    ${formatarMoedaEstrangeira(totalEur, 'EUR')} | 
                    ${formatarMoedaEstrangeira(totalUsd, 'USD')}
                </div>
            </div>
        </div>
        <div class="dash-body" style="display: flex; flex-wrap: wrap; gap: 30px; padding: 25px;">
            ${gerarTabelaHtml(dadosAtuais, dadosAtuais.nomeUsuario, false, dadosYoCDY_Atuais)}
            <div style="width: 1px; background: #eee; align-self: stretch;"></div> ${gerarTabelaHtml(dadosComparacao, tituloDadosComparacao, true, dadosYoCDY_Comp)}
        </div>
    `;
}
async function renderizarDashboard() {
    const hoje = new Date().toISOString().split('T')[0];
    
    // --- 1. CÁLCULOS CRÍTICOS (Executados Imediatamente) ---
    // Estes cálculos são necessários para os cards e tabela de resumo, que o usuário vê primeiro.
    const posicoesRV = gerarPosicaoDetalhada(hoje);
    
    // Cálculo de Saldos e Resumos (Mantido código original)
    let saldoTotalContas = 0;
    todasAsContas.forEach(conta => { saldoTotalContas += calcularSaldoEmData(conta, hoje); });

    let valorTotalMoedas = 0;
    const todosOsEventosCaixa = obterTodosOsEventosDeCaixa();
    todosOsAtivosMoedas.forEach(ativo => {
        const transacoesPassadasEPresentes = todosOsEventosCaixa.filter(e =>
            e.tipo === 'moeda' && String(e.idAlvo) === String(ativo.id) && e.source !== 'recorrente_futura' && e.data <= hoje
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
        if (todosOsTickersPorCategoria[tipoMapeado]) todosOsTickersPorCategoria[tipoMapeado].add(ativo.ticker);
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
        if ((ativo.descricao || '').toLowerCase().includes('(inativa)')) return;
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
        tickersHistoricosDaCategoria.forEach(ticker => { realizadosSoma += (ganhosRealizadosMap.get(ticker) || 0); });
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
    
    // --- 2. ATUALIZAÇÃO DOM IMEDIATA (Cards e Textos) ---
    document.getElementById('db-patrimonio-total').textContent = formatarMoeda(patrimonioTotal);
    document.getElementById('db-carteira-total').textContent = formatarMoeda(valorTotalCarteira);
    document.getElementById('db-contas-total').textContent = formatarMoeda(saldoTotalContas);
    document.getElementById('db-moedas-total').textContent = formatarMoeda(valorTotalMoedas);
    document.getElementById('db-proventos-provisionados-total').textContent = formatarMoeda(totalProventosProvisionados);
    document.getElementById('data-inicio-carteira').textContent = `(Resultados desde ${getPrimeiraData() || 'o início'})`;

    const alertaContainer = document.getElementById('dashboard-alerta-rebalanceamento');
    alertaContainer.style.display = 'none'; // Esconde inicialmente, reativa no final se precisar

    const syncAlertButton = document.getElementById('btn-sync-needed-alert');
    if (syncAlertButton) {
        const syncNeeded = localStorage.getItem('carteira_sync_needed') === 'true';
        syncAlertButton.style.display = syncNeeded ? 'inline-block' : 'none';
    }
    
    if(document.getElementById('config-user-name')) document.getElementById('config-user-name').value = userName;

    // --- 3. GERAÇÃO HTML TABELA (Rápido) ---
    const containerTabela = document.getElementById('dashboard-table-container');
    let tabelaHtml = `<table class="dashboard-table"><thead><tr><th>Classe</th><th class="numero">Mercado / Aloc.</th><th class="numero">G/P Latente</th><th class="numero">Realizados</th><th class="numero">Proventos</th><th class="numero">Total</th><th class="percentual">TIR</th></tr></thead><tbody>`;

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
        const proventosPercentual = dados.custo > 0 ? (dados.proventos / dados.custo) : 0;
        const retornoTotalValor = varMercadoValor + dados.resultadosRealizados + dados.proventos;
        const retornoTotalPercentual = dados.custo > 0 ? (retornoTotalValor / dados.custo) : 0;

        const classeVar = varMercadoValor >= 0 ? 'valor-positivo' : 'valor-negativo';
        const classeReal = dados.resultadosRealizados >= 0 ? 'valor-positivo' : 'valor-negativo';
        const classeTotal = retornoTotalValor >= 0 ? 'valor-positivo' : 'valor-negativo';

        tabelaHtml += `<tr><td>${categoria}</td><td class="numero"><span class="valor-principal">${formatarMoeda(dados.mercado)}</span><span class="valor-secundario">${formatarPercentual(alocacao)}</span></td><td class="numero ${classeVar}"><span class="valor-principal">${formatarMoeda(varMercadoValor)}</span><span class="valor-secundario ${classeVar}">${formatarPercentual(varMercadoPercentual)}</span></td><td class="numero ${classeReal}"><span class="valor-principal">${formatarMoeda(dados.resultadosRealizados)}</span></td><td class="numero valor-positivo"><span class="valor-principal">${formatarMoeda(dados.proventos)}</span><span class="valor-secundario valor-positivo">${formatarPercentual(proventosPercentual)}</span></td><td class="numero ${classeTotal}"><span class="valor-principal">${formatarMoeda(retornoTotalValor)}</span><span class="valor-secundario ${classeTotal}">${formatarPercentual(retornoTotalPercentual)}</span></td><td class="percentual ${!isNaN(dados.tir) ? (dados.tir >= 0 ? 'valor-positivo' : 'valor-negativo') : ''}">${!isNaN(dados.tir) ? formatarPercentual(dados.tir) : '-'}</td></tr>`;

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
    
    const varMercadoTotal = mercadoTotalGeral - custoTotalGeral;
    const retTotalGeral = varMercadoTotal + realizadosTotalGeral + proventosTotalGeral;
    const classeVarTotal = varMercadoTotal >= 0 ? 'valor-positivo' : 'valor-negativo';
    const classeRetTotal = retTotalGeral >= 0 ? 'valor-positivo' : 'valor-negativo';

    tabelaHtml += `</tbody><tfoot><tr style="border-top: 2px solid var(--accent-color); font-weight: bold;"><td>TOTAIS</td><td class="numero"><span class="valor-principal">${formatarMoeda(mercadoTotalGeral)}</span></td><td class="numero ${classeVarTotal}"><span class="valor-principal">${formatarMoeda(varMercadoTotal)}</span></td><td class="numero"><span class="valor-principal">${formatarMoeda(realizadosTotalGeral)}</span></td><td class="numero valor-positivo"><span class="valor-principal">${formatarMoeda(proventosTotalGeral)}</span></td><td class="numero ${classeRetTotal}"><span class="valor-principal">${formatarMoeda(retTotalGeral)}</span></td><td class="percentual ${!isNaN(tirTotalRV) ? (tirTotalRV >= 0 ? 'valor-positivo' : 'valor-negativo') : ''}">${!isNaN(tirTotalRV) ? formatarPercentual(tirTotalRV) : '-'}</td></tr></tfoot></table>`;
    
    containerTabela.innerHTML = tabelaHtml;

    // --- 4. RENDERIZAÇÃO EM CASCATA (Otimização Principal) ---
    // Usamos setTimeout(..., 0) para quebrar a execução em "frames" distintos,
    // permitindo que o navegador atualize a UI entre cada bloco pesado.

    // Bloco 1: Gráfico de Alocação e Ticker Tape (Leves e Visíveis no topo)
    setTimeout(() => {
        renderizarTickerTape();
        if (typeof renderizarGraficoAlocacao === 'function') renderizarGraficoAlocacao(resumoCarteira, categoriasVisiveis);
        
        // Dados de Balanceamento (Cálculo médio)
        const dadosBrutos = gerarDadosBalanceamento('todos');
        renderizarPainelAlocacao(dadosBrutos);
        atualizarIconeDeAlertasGlobal(posicoesRV, dadosBrutos);

        // Bloco 2: Gráficos Intermediários (Proventos e Comparativo)
        setTimeout(() => {
            renderizarPainelResumoMetasDashboard();
            if (typeof renderizarGraficoProventos === 'function') renderizarGraficoProventos(); 
            if (typeof renderizarPainelComparativo === 'function') renderizarPainelComparativo(resumoCarteira);

            // Bloco 3: Gráficos Pesados (Evolução e Desempenho)
            setTimeout(() => {
                if (typeof renderizarGraficoCarteira === 'function') renderizarGraficoCarteira();
                if (typeof renderizarGraficoAportesProventos === 'function') renderizarGraficoAportesProventos();
                if (typeof renderizarGraficoDesempenho === 'function') renderizarGraficoDesempenho();
                
                // Acorda o layout final
                window.dispatchEvent(new Event('resize'));
            }, 50);
        }, 30);
    }, 10);
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
function renderizarTickerTape() {
    const boardContainer = document.getElementById('dashboard-ticker-content');
    
    // Limpeza de segurança
    const paginationContainer = document.getElementById('board-pagination-dots');
    if (paginationContainer) paginationContainer.style.display = 'none';
    if (typeof boardInterval !== 'undefined' && boardInterval) { clearInterval(boardInterval); boardInterval = null; }

    if (!boardContainer) return;

    if (!dadosDeMercado || (!dadosDeMercado.cotacoes && !dadosDeMercado.ibov)) {
        boardContainer.innerHTML = '<div style="padding: 10px; text-align: center; color: #999; font-size: 0.9em;">Carregando cotações...</div>';
        return;
    }

    // 1. PREPARAR DADOS
    const hoje = new Date().toISOString().split('T')[0];
    const historicoOrdenado = historicoCarteira ? [...historicoCarteira].sort((a, b) => new Date(b.data) - new Date(a.data)) : [];
    const snapshotAnterior = historicoOrdenado.find(s => s.data < hoje);

    const listaItens = [];

    // Helper para converter texto R$ 1.000,00 em float
    const parseCurrency = (str) => {
        if (!str) return 0;
        return parseFloat(str.replace(/[^0-9,-]+/g,"").replace(",","."));
    };

    const adicionarItem = (label, valorAtual, valorAnterior, isIndex = false, isWallet = false) => {
        let variacao = 0;
        
        if (valorAnterior && valorAnterior > 0) {
            variacao = (valorAtual - valorAnterior) / valorAnterior;
        } else if (!isWallet && dadosDeMercado.cotacoes[label]?.variation) {
            variacao = dadosDeMercado.cotacoes[label].variation / 100;
        }
        
        const valorFormatado = isIndex && !isWallet ? formatarDecimal(valorAtual, 2) : formatarMoeda(valorAtual);
        listaItens.push({ label, valor: valorFormatado, variacao, isWallet });
    };

    // --- A. CARTEIRA DE INVESTIMENTOS ---
    const elementoCarteira = document.getElementById('db-carteira-total');
    if (elementoCarteira) {
        const valorCarteiraAtual = parseCurrency(elementoCarteira.textContent);
        let valorCarteiraAnt = 0;

        if (snapshotAnterior) {
            if (snapshotAnterior.valorTotalInvestimentos) {
                valorCarteiraAnt = snapshotAnterior.valorTotalInvestimentos;
            } else if (snapshotAnterior.detalhesCarteira?.valorPorClasse) {
                const v = snapshotAnterior.detalhesCarteira.valorPorClasse;
                valorCarteiraAnt = (v['Ações']||0) + (v['FIIs']||0) + (v['ETFs']||0) + (v['Renda Fixa']||0);
            }
        }

        if (valorCarteiraAtual > 0) {
            adicionarItem('Carteira', valorCarteiraAtual, valorCarteiraAnt, false, true);
        }
    }

    // --- B. ÍNDICES DE MERCADO ---
    const valorIbov = dadosDeMercado.ibov || dadosDeMercado.cotacoes['IBOV']?.valor || 0;
    const ibovAnt = snapshotAnterior ? snapshotAnterior.ibov : 0;
    if (valorIbov > 0) adicionarItem('IBOV', valorIbov, ibovAnt, true);

    const valorIfix = dadosDeMercado.ifix || dadosDeMercado.cotacoes['IFIX']?.valor || 0;
    const ifixAnt = snapshotAnterior ? snapshotAnterior.ifix : 0;
    if (valorIfix > 0) adicionarItem('IFIX', valorIfix, ifixAnt, true);

    // --- C. MOEDAS ---
    ['USD', 'EUR', 'GBP'].forEach(moeda => {
        const valor = dadosMoedas.cotacoes[moeda] || 0;
        const ant = snapshotAnterior && snapshotAnterior.cotacoesMoedas ? snapshotAnterior.cotacoesMoedas[moeda] : 0;
        if (valor > 0) adicionarItem(moeda, valor, ant, true);
    });

    // 2. ESTILIZAÇÃO DO CONTAINER (CORREÇÃO DE DISTRIBUIÇÃO)
    boardContainer.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between; /* Espalha os itens de ponta a ponta */
        flex-wrap: wrap;
        gap: 10px;
        padding: 6px 20px; /* Aumentei o padding lateral para não colar nas bordas */
        width: 100%;
        box-sizing: border-box;
        background-color: #fff;
    `;

    // 3. RENDERIZAÇÃO
    let htmlFinal = '';

    listaItens.forEach(item => {
        const isPositivo = item.variacao >= 0;
        const corTexto = isPositivo ? '#27ae60' : '#c0392b'; 
        const seta = isPositivo ? '▲' : '▼'; 
        const pctTexto = formatarPercentual(item.variacao);
        
        const estiloItem = item.isWallet 
            ? 'font-weight: bold; color: #2c3e50; background: #f8f9fa; padding: 2px 8px; border-radius: 4px; border: 1px solid #eee;' 
            : 'font-weight: 600; color: #555;';

        htmlFinal += `
            <div style="display: flex; align-items: center; gap: 6px; font-size: 0.9rem; ${estiloItem}" title="${item.label}">
                <span>${item.label === 'Carteira' ? '<i class="fas fa-wallet" style="margin-right:4px; color:#3498db;"></i>' : item.label}</span>
                <span style="margin-left: 2px;">${item.valor}</span>
                <span style="color: ${corTexto}; font-size: 0.8rem; margin-left: 4px;">
                    ${seta} ${pctTexto}
                </span>
            </div>
        `;
    });

    boardContainer.innerHTML = htmlFinal;
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
function renderizarPainelResumoMetasDashboard() {
    const container = document.getElementById('dashboard-metas-summary-container');
    
    // Recuperamos a lógica ORIGINAL que funciona
    if (!todasAsMetas || todasAsMetas.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block'; // O CSS .dash-card cuida do visual agora
    
    let metasPendentesHtml = [];
    let metasAtingidasHtml = [];
    const projecaoProventos = calcularProjecaoProventosNegociacao();
    
    // Tenta obter projeção RF, fallback para 0
    let projecaoRF = 0;
    try {
         const dadosGrafico = gerarDadosGraficoAportesProventos();
         if(dadosGrafico?.datasets?.[0]?.data) {
             projecaoRF = dadosGrafico.datasets[0].data.slice(-12).reduce((a, b) => a + b, 0) / 12;
         }
    } catch(e) {}

    todasAsMetas.forEach(meta => {
        let valorAtual = 0, progresso = 0, textoAlvo = '', textoAlcancado = '', previsao = null, historico = [];
        const tipoMeta = meta.tipo;
        const moeda = meta.moedaAlvo || 'BRL';

        // --- CÁLCULOS ORIGINAIS ---
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
                const sm = (typeof salarioMinimo !== 'undefined') ? salarioMinimo : 1412;
                valorAlvoMonetario = meta.valorAlvo * sm;
                valorAtual = proventosBRL;
                textoAlvo = `${meta.valorAlvo} SM (${formatarMoeda(valorAlvoMonetario)})/mês`;
                textoAlcancado = formatarMoeda(valorAtual);
            } else { 
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
        // Estilo inline para garantir visual limpo dentro do novo card
        const estiloItem = 'padding: 10px; border-bottom: 1px solid #eee; display: flex; align-items: flex-start; gap: 10px; color: #555;';
        const corIcone = isAtingida ? 'var(--success-color)' : 'var(--primary-color)';

        const htmlItem = `
            <div style="${estiloItem}" class="${isAtingida ? 'meta-atingida' : ''}">
                <i class="fas ${icone}" style="color: ${corIcone}; margin-top: 3px;"></i>
                <span style="line-height: 1.4;">
                    A meta "<strong>${meta.nome}</strong>" para <strong>${textoAlvo}</strong> já alcançou 
                    <strong>${textoAlcancado}</strong>, que equivale a 
                    <strong>${progresso.toFixed(1)}%</strong> do alvo.${textoPrevisao}
                </span>
            </div>
        `;

        if (isAtingida) {
            metasAtingidasHtml.push(htmlItem);
        } else {
            metasPendentesHtml.push(htmlItem);
        }
    });

    let conteudoInterno = '';
    if (metasPendentesHtml.length > 0) {
        conteudoInterno += metasPendentesHtml.join('');
    }
    
    if (metasAtingidasHtml.length > 0) {
        conteudoInterno += `
            <div style="margin-top: 15px; padding: 10px; background-color: #f0fff4; border-radius: 6px; border: 1px solid #c3e6cb;">
                <h4 style="margin: 0 0 10px 0; color: var(--success-color); font-size: 1rem;">
                    <i class="fas fa-medal"></i> Metas Concluídas
                </h4>
                ${metasAtingidasHtml.join('')}
            </div>`;
    }

    // AQUI ESTÁ A MÁGICA:
    // Usamos o container .dash-card para ficar igual aos outros painéis,
    // mas o conteúdo é o texto simples que sabemos que funciona.
    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-header head-alloc" style="border-left-color: #9b59b6; background-color: #fcf4ff;">
                <h3><i class="fas fa-bullseye"></i> Acompanhamento de Metas</h3>
            </div>
            <div class="dash-body">
                ${conteudoInterno}
            </div>
        </div>
    `;
}