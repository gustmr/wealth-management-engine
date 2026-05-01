function identificarOperacoes() {
    const todasAsOperacoes = [];

    todasAsNotas.forEach(n => {
        if (!n.data) return; 
        n.operacoes.forEach(op => {
            const ativoInfo = todosOsAtivos.find(a => a.ticker === op.ativo);
            todasAsOperacoes.push({
                ...op,
                data: n.data,
                custosNota: n.custos || 0,
                irrfNota: n.irrf || 0,
                totalOperacoesNota: n.operacoes.reduce((soma, op) => soma + op.valor, 0),
                assetType: ativoInfo ? ativoInfo.tipo : 'Desconhecido',
                fonte: 'Nota de Negociação'
            });
        });
    });

    posicaoInicial.forEach(p => {
        if (p.tipoRegistro === 'TRANSACAO_HISTORICA' && p.data) {
            const ativoInfo = todosOsAtivos.find(a => a.ticker === p.ticker);
            
            let valorTransacao = 0;
            if (p.transacao.toLowerCase() === 'venda') {
                valorTransacao = (typeof p.valorVenda === 'number') ? p.valorVenda : 0;
            }

            todasAsOperacoes.push({
                id: p.id,
                ativo: p.ticker,
                tipo: p.transacao.toLowerCase(),
                quantidade: p.quantidade,
                valor: valorTransacao, 
                data: p.data,
                custosNota: 0, 
                irrfNota: 0,
                totalOperacoesNota: valorTransacao,
                assetType: ativoInfo ? ativoInfo.tipo : 'Desconhecido',
                fonte: 'Histórico de Ativo',
                precoMedioHistorico: p.precoMedio 
            });
        }
    });

    todasAsOperacoes.sort((a,b) => new Date(a.data) - new Date(b.data));

    const operacoesPorDia = todasAsOperacoes.reduce((acc, op) => {
        const key = `${op.data}_${op.ativo}`;
        if (!acc[key]) acc[key] = [];
        acc[key].push(op);
        return acc;
    }, {});

    const operacoesClassificadas = [];
    Object.values(operacoesPorDia).forEach(opsDoDia => {
        const compras = opsDoDia.filter(op => op.tipo === 'compra');
        const vendas = opsDoDia.filter(op => op.tipo === 'venda');

        if (compras.length > 0 && vendas.length > 0) {
            let qtdDayTrade = Math.min(
                compras.reduce((sum, op) => sum + op.quantidade, 0),
                vendas.reduce((sum, op) => sum + op.quantidade, 0)
            );

            opsDoDia.forEach(op => {
                let qtdOp = op.quantidade;
                if (qtdDayTrade > 0 && (op.tipo === 'compra' || op.tipo === 'venda')) {
                    const qtdAplicada = Math.min(qtdOp, qtdDayTrade);
                    operacoesClassificadas.push({ ...op, quantidade: qtdAplicada, tradeType: 'Day Trade' });
                    qtdDayTrade -= qtdAplicada;
                    qtdOp -= qtdAplicada;
                }
                if (qtdOp > 0) {
                    operacoesClassificadas.push({ ...op, quantidade: qtdOp, tradeType: 'Swing Trade' });
                }
            });
        } else {
            opsDoDia.forEach(op => operacoesClassificadas.push({ ...op, tradeType: 'Swing Trade' }));
        }
    });
    return operacoesClassificadas;
}
function apurarResultadosDoPeriodo(operacoesDoPeriodo) {
    const resultados = {
        fiis: { totalVendas: 0, resultado: 0, operacoes: [] },
        geral_rv: { totalVendas: 0, resultado: 0, operacoes: [] },
        daytrade: { totalVendas: 0, resultado: 0, operacoes: [] }
    };

    operacoesDoPeriodo.forEach(op => {
        const ativoInfo = todosOsAtivos.find(a => a.ticker === op.ativo);
        let categoria;

        if (op.tradeType === 'Day Trade') {
            categoria = 'daytrade';
        } else if (op.assetType === 'FII') {
            categoria = 'fiis';
        } else {
            categoria = 'geral_rv';
        }

        const opDetalhada = { 
            tipo: op.tipo, 
            ativo: op.ativo, 
            data: op.data, 
            quantidade: op.quantidade,
            valor: op.valor,
            tipoAcao: ativoInfo ? (ativoInfo.tipoAcao || '') : ''
        };

        if (op.tipo === 'venda') {
            const dataVenda = new Date(op.data + 'T12:00:00');
            dataVenda.setDate(dataVenda.getDate() - 1);
            const dataAnterior = dataVenda.toISOString().split('T')[0];
            const posicaoAnterior = gerarPosicaoDetalhada(dataAnterior);
            const pmNaVenda = posicaoAnterior[op.ativo] ? posicaoAnterior[op.ativo].precoMedio : 0;
            
            const custoRateado = (op.fonte === 'Nota de Negociação' && op.totalOperacoesNota > 0) 
                ? (op.valor / op.totalOperacoesNota) * (op.custosNota || 0) 
                : 0;

            opDetalhada.valorVendaLiquida = op.valor - custoRateado;
            opDetalhada.custoAquisicao = op.quantidade * pmNaVenda;
            opDetalhada.resultado = opDetalhada.valorVendaLiquida - opDetalhada.custoAquisicao;
            
            resultados[categoria].totalVendas += op.valor;
            resultados[categoria].resultado += opDetalhada.resultado;
        } else { // Compra
            if (op.fonte === 'Histórico de Ativo') {
                opDetalhada.valorCompra = op.precoMedioHistorico * op.quantidade;
            } else {
                const custoRateadoCompra = (op.totalOperacoesNota > 0) 
                    ? (op.valor / op.totalOperacoesNota) * (op.custosNota || 0) 
                    : 0;
                opDetalhada.valorCompra = op.valor + custoRateadoCompra;
            }
        }
        
        resultados[categoria].operacoes.push(opDetalhada);
    });

    return resultados;
}
function calcularImpostoRendaAnual(ano) {
    const operacoesClassificadas = identificarOperacoes();
    const resultadosAnuais = {};

    const prejuizosAcumulados = {
        fiis: 0,
        geral_rv: 0,
        daytrade: 0
    };

    const prejuizoAnoAnteriorCalculado = calcularPrejuizoAnoAnterior(String(ano - 1));
    Object.keys(prejuizosAcumulados).forEach(cat => {
        const chaveOverride = `${ano}-00_${cat}`;
        const ajusteOverride = todosOsAjustesIR.find(a => a.chave === chaveOverride);

        if (ajusteOverride !== undefined) {
            prejuizosAcumulados[cat] = ajusteOverride.valor;
        } else {
            prejuizosAcumulados[cat] = prejuizoAnoAnteriorCalculado[cat];
        }
    });

    for (let mes = 0; mes < 12; mes++) {
        const mesStr = String(mes + 1).padStart(2, '0');
        const chaveMes = `${ano}-${mesStr}`;
        const opsDoMes = operacoesClassificadas.filter(op => op.data.startsWith(chaveMes));
        
        const totaisMes = apurarResultadosDoPeriodo(opsDoMes);
        resultadosAnuais[chaveMes] = {};

        // Processamento para FIIs e Day Trade (lógica inalterada)
        ['fiis', 'daytrade'].forEach(cat => {
            let baseDeCalculo = 0;
            let impostoDevido = 0;
            const resultadoMesOriginal = totaisMes[cat].resultado;
            const prejuizoAnterior = prejuizosAcumulados[cat];
            const ajusteManual = todosOsAjustesIR.find(a => a.chave === `${chaveMes}_${cat}`)?.valor || 0;
            const resultadoAjustado = resultadoMesOriginal + ajusteManual;
            const resultadoAposComp = resultadoAjustado + prejuizoAnterior;

            if (resultadoAposComp > 0) {
                baseDeCalculo = resultadoAposComp;
                prejuizosAcumulados[cat] = 0;
            } else {
                prejuizosAcumulados[cat] = resultadoAposComp;
            }
            
            if (baseDeCalculo > 0) {
                impostoDevido = baseDeCalculo * configuracoesFiscais.aliquotaFiisDt;
            }

            totaisMes[cat].operacoes.sort((a, b) => new Date(a.data) - new Date(b.data));
            resultadosAnuais[chaveMes][cat] = {
                totalVendas: totaisMes[cat].totalVendas,
                resultadoMes: resultadoMesOriginal,
                ajusteManual: ajusteManual,
                prejuizoAnterior: prejuizoAnterior,
                baseDeCalculo: baseDeCalculo,
                impostoDevido: impostoDevido,
                operacoes: totaisMes[cat].operacoes
            };
        });

        // Processamento para a nova categoria "Geral RV" (Ações e ETFs)
        const cat = 'geral_rv';
        const dadosMesGeral = totaisMes[cat];
        const prejuizoAnteriorGeral = prejuizosAcumulados[cat];
        const ajusteManualGeral = todosOsAjustesIR.find(a => a.chave === `${chaveMes}_${cat}`)?.valor || 0;

        const vendasOps = dadosMesGeral.operacoes.filter(op => op.tipo === 'venda');
        const vendasUnits = vendasOps.filter(op => op.tipoAcao === 'Unit');
        const vendasOutrasAcoes = vendasOps.filter(op => op.tipoAcao !== 'Unit' && todosOsAtivos.find(a => a.ticker === op.ativo)?.tipo === 'Ação');
        const vendasETFs = vendasOps.filter(op => todosOsAtivos.find(a => a.ticker === op.ativo)?.tipo === 'ETF');

        const totalVendasOutrasAcoesBruto = vendasOutrasAcoes.reduce((sum, op) => sum + op.valor, 0);

        let resultadoTributavelDoMes = 0;
        let prejuizoGeradoNoMes = 0;
        let resultadoIsento = 0;

        const somarResultados = (operacoes) => operacoes.reduce((sum, op) => sum + op.resultado, 0);

        // ETFs e Units: Lucro é sempre tributável, prejuízo sempre compensável.
        [...vendasETFs, ...vendasUnits].forEach(op => {
            if (op.resultado >= 0) {
                resultadoTributavelDoMes += op.resultado;
            } else {
                prejuizoGeradoNoMes += op.resultado;
            }
        });
        
        // Ações ON/PN: Verifica a regra de isenção.
        const resultadoOutrasAcoes = somarResultados(vendasOutrasAcoes);
        if (totalVendasOutrasAcoesBruto > configuracoesFiscais.limiteIsencaoAcoes) {
            // Se as vendas ultrapassam 20k, todo o resultado entra na apuração.
            if (resultadoOutrasAcoes >= 0) {
                resultadoTributavelDoMes += resultadoOutrasAcoes;
            } else {
                prejuizoGeradoNoMes += resultadoOutrasAcoes;
            }
        } else {
            // Se as vendas são isentas, o lucro é ignorado, mas o prejuízo é registrado.
            if (resultadoOutrasAcoes >= 0) {
                resultadoIsento += resultadoOutrasAcoes;
            } else {
                prejuizoGeradoNoMes += resultadoOutrasAcoes;
            }
        }

        const resultadoMesOriginal = resultadoTributavelDoMes + prejuizoGeradoNoMes + resultadoIsento;
        const resultadoAjustado = resultadoTributavelDoMes + ajusteManualGeral;
        const resultadoAposComp = resultadoAjustado + prejuizoAnteriorGeral;

        const baseDeCalculo = Math.max(0, resultadoAposComp);
        const impostoDevido = baseDeCalculo * configuracoesFiscais.aliquotaAcoes;
        
        const prejuizoRestanteAposComp = Math.min(0, resultadoAposComp);
        prejuizosAcumulados[cat] = prejuizoGeradoNoMes + prejuizoRestanteAposComp;

        dadosMesGeral.operacoes.sort((a, b) => new Date(a.data) - new Date(b.data));
        resultadosAnuais[chaveMes][cat] = {
            totalVendas: dadosMesGeral.totalVendas,
            resultadoMes: resultadoMesOriginal,
            ajusteManual: ajusteManualGeral,
            prejuizoAnterior: prejuizoAnteriorGeral,
            baseDeCalculo: baseDeCalculo,
            impostoDevido: impostoDevido,
            operacoes: dadosMesGeral.operacoes
        };
    }
    return resultadosAnuais;
}
function calcularPrejuizoAnoAnterior(anoAnterior) {
    const anoAnteriorNum = parseInt(anoAnterior, 10);

    const primeiroAnoDeRegistros = 2023; 
    if (anoAnteriorNum < primeiroAnoDeRegistros) {
        return { fiis: 0, geral_rv: 0, daytrade: 0 };
    }

    let prejuizoFinal = calcularPrejuizoAnoAnterior(String(anoAnteriorNum - 1));

    const operacoesClassificadas = identificarOperacoes();
    const opsAnoAnterior = operacoesClassificadas.filter(op => op.data.startsWith(anoAnterior));

    if (opsAnoAnterior.length === 0) {
        return prejuizoFinal;
    }
    
    for (let mes = 0; mes < 12; mes++) {
        const mesStr = String(mes + 1).padStart(2, '0');
        const chaveMes = `${anoAnterior}-${mesStr}`;
        const opsDoMes = opsAnoAnterior.filter(op => op.data.startsWith(chaveMes));
        
        if(opsDoMes.length === 0) continue;

        const totaisMes = apurarResultadosDoPeriodo(opsDoMes);
        
        Object.keys(prejuizoFinal).forEach(cat => {
            const ajusteManual = todosOsAjustesIR.find(a => a.chave === `${chaveMes}_${cat}`)?.valor || 0;
            let resultadoMesApurado = totaisMes[cat].resultado;

            if (cat === 'geral_rv') {
                const vendasOps = totaisMes.geral_rv.operacoes.filter(op => op.tipo === 'venda');
                const vendasOutrasAcoes = vendasOps.filter(op => op.tipoAcao !== 'Unit' && todosOsAtivos.find(a => a.ticker === op.ativo)?.tipo === 'Ação');
                const totalVendasOutrasAcoesBruto = vendasOutrasAcoes.reduce((sum, op) => sum + op.valor, 0);
                
                if (totalVendasOutrasAcoesBruto <= configuracoesFiscais.limiteIsencaoAcoes) {
                    const lucroIsento = vendasOutrasAcoes.reduce((sum, op) => op.resultado > 0 ? sum + op.resultado : sum, 0);
                    resultadoMesApurado -= lucroIsento;
                }
            }

            const resultadoComAjuste = resultadoMesApurado + ajusteManual;
            const resultadoComPrejuizo = resultadoComAjuste + prejuizoFinal[cat];
            prejuizoFinal[cat] = Math.min(0, resultadoComPrejuizo);
        });
    }

    return prejuizoFinal;
}
function gerarRelatorioIR(ano) {
    const container = document.getElementById('container-impressao-ir');
    const anoNum = parseInt(ano, 10);
    const dataFimAno = `${ano}-12-31`;
    let html = '';

    const agora = new Date();
    const dataFormatada = agora.toLocaleDateString('en-GB');
    const horaFormatada = agora.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    html += `<h1>Auxiliary Tax Report ${ano}</h1>`;
    html += `<p class="print-timestamp">Generated by: ${userName || 'User'} on ${dataFormatada} at ${horaFormatada}</p>`;

    // --- PARTE 1: BENS E DIREITOS (PATRIMÔNIO) ---
    html += `<div class="secao-patrimonio"><h2>Assets and Rights (Position on 31/12/${ano})</h2>`;

    const posicoesFimAno = gerarPosicaoDetalhada(dataFimAno);
    
    const tickersDoAno = new Set();
    const anoStr = String(ano);
    todasAsNotas.forEach(n => { if (n.data.startsWith(anoStr)) n.operacoes.forEach(op => tickersDoAno.add(op.ativo)); });
    posicaoInicial.forEach(p => { if (p.data.startsWith(anoStr)) tickersDoAno.add(p.ticker); });
    todosOsAjustes.forEach(a => { 
        if (a.data.startsWith(anoStr)) {
            if (a.ticker) tickersDoAno.add(a.ticker);
            if (a.tipoAjuste === 'transferencia') a.ativosTransferidos.forEach(at => tickersDoAno.add(at.ticker));
            if (a.tipoAjuste === 'evento_ativo') tickersDoAno.add(a.ticker);
        }
    });
    Object.keys(gerarPosicaoDetalhada(`${ano}-01-01`)).forEach(t => tickersDoAno.add(t));
    
    const ativosAgrupados = { 'Ação': [], 'FII': [], 'ETF': [] };
    
    tickersDoAno.forEach(ticker => {
        const ativoInfo = todosOsAtivos.find(a => a.ticker === ticker);
        if (!ativoInfo || !ativoInfo.tipo || !ativosAgrupados[ativoInfo.tipo]) return;

        const posicao = posicoesFimAno[ticker];
        const tipoAcao = (ativoInfo.tipoAcao && ativoInfo.tipoAcao !== 'N/A') ? `${ativoInfo.tipoAcao}, ` : '';
        const nome = ativoInfo.nome || ativoInfo.nomePregao || 'Name not registered';
        const cnpj = formatarCNPJ(ativoInfo.cnpj) || 'Tax ID not registered';
        
        let textoAtivo = '';
        if (posicao && posicao.quantidade > 0.0001) {
            textoAtivo = `<strong>${ticker}</strong> - ${tipoAcao}${nome}, CNPJ ${cnpj}, average price R$ ${formatarPrecoMedio(posicao.precoMedio)} per unit. Quantity: ${Math.round(posicao.quantidade)}.`;
        } else {
            textoAtivo = `<strong>${ticker}</strong> - ${tipoAcao}${nome}, CNPJ ${cnpj}, position closed in year ${ano}.`;
        }
        ativosAgrupados[ativoInfo.tipo].push(textoAtivo);
    });

    ['Ação', 'FII', 'ETF'].forEach(tipo => {
        const listaAtivos = ativosAgrupados[tipo];
        if (listaAtivos.length > 0) {
            const tituloTipo = tipo === 'Ação' ? 'Shares' : (tipo === 'FII' ? 'Real Estate Investment Trusts' : 'ETFs');
            html += `<h3>${tituloTipo}</h3><ul>`;
            listaAtivos.sort().forEach(itemTexto => {
                html += `<li>${itemTexto}</li>`;
            });
            html += `</ul>`;
        }
    });
    html += `</div>`; 

    // --- PARTE 2: RENDIMENTOS ---
    html += `<div class="secao-rendimentos"><h2>Income Received in ${ano}</h2>`;

    const declaradosAnoAnteriorPagosAno = todosOsProventos.filter(p => p.dataCom && p.dataPagamento && p.dataCom.startsWith(String(anoNum - 1)) && p.dataPagamento.startsWith(String(anoNum)));
    const declaradosEPagosAno = todosOsProventos.filter(p => p.dataCom && p.dataPagamento && p.dataCom.startsWith(String(anoNum)) && p.dataPagamento.startsWith(String(anoNum)));
    const declaradosAnoPagosFuturo = todosOsProventos.filter(p => p.dataCom && p.dataPagamento && p.dataCom.startsWith(String(anoNum)) && new Date(p.dataPagamento + 'T12:00:00').getUTCFullYear() > anoNum);

    const agruparProventos = (listaProventos) => {
        const agrupado = new Map();
        listaProventos.forEach(p => {
            if (!agrupado.has(p.ticker)) {
                agrupado.set(p.ticker, { JCP: 0, Dividendo: 0, Rendimento: 0, Outros: 0 });
            }
            const tipos = agrupado.get(p.ticker);
            const tipoNormalizado = p.tipo === 'JCP' ? 'JCP' : (p.tipo === 'Dividendo' ? 'Dividendo' : (p.tipo === 'Rendimento' ? 'Rendimento' : 'Outros'));
            tipos[tipoNormalizado] += p.valorTotalRecebido;
        });
        return agrupado;
    };

    const mapa1 = agruparProventos(declaradosAnoAnteriorPagosAno);
    const mapa2 = agruparProventos(declaradosEPagosAno);
    const mapa3 = agruparProventos(declaradosAnoPagosFuturo);

    const todosTickersDeRendimento = new Set([...mapa1.keys(), ...mapa2.keys(), ...mapa3.keys()]);
    if (todosTickersDeRendimento.size === 0) {
        html += '<p>No income received or provisioned found for this year.</p>';
    }

    [...todosTickersDeRendimento].sort().forEach(ticker => {
        const d1 = mapa1.get(ticker) || { JCP: 0, Dividendo: 0, Rendimento: 0, Outros: 0 };
        const d2 = mapa2.get(ticker) || { JCP: 0, Dividendo: 0, Rendimento: 0, Outros: 0 };
        const d3 = mapa3.get(ticker) || { JCP: 0, Dividendo: 0, Rendimento: 0, Outros: 0 };
        
        html += `<div class="ativo-bloco"><h3>${ticker}</h3>`;
        html += `<table>
            <thead><tr><th>Income Category</th><th>Type</th><th class="numero">Value (R$)</th></tr></thead>
            <tbody>
                <tr>
                    <td rowspan="4" style="vertical-align: middle; text-align: center;"><strong>Declared in ${anoNum-1}, Paid in ${anoNum}</strong></td>
                    <td>Dividends</td><td class="numero">${formatarMoeda(d1.Dividendo)}</td>
                </tr>
                <tr><td>Interest on Equity (JCP)</td><td class="numero">${formatarMoeda(d1.JCP)}</td></tr>
                <tr><td>Yields (REITs/Others)</td><td class="numero">${formatarMoeda(d1.Rendimento)}</td></tr>
                <tr><td class="total-label">Subtotal</td><td class="numero"><strong>${formatarMoeda(d1.Dividendo + d1.JCP + d1.Rendimento + d1.Outros)}</strong></td></tr>
                
                <tr>
                    <td rowspan="4" style="vertical-align: middle; text-align: center;"><strong>Declared and Paid in ${anoNum}</strong></td>
                    <td>Dividends</td><td class="numero">${formatarMoeda(d2.Dividendo)}</td>
                </tr>
                <tr><td>Interest on Equity (JCP)</td><td class="numero">${formatarMoeda(d2.JCP)}</td></tr>
                <tr><td>Yields (REITs/Others)</td><td class="numero">${formatarMoeda(d2.Rendimento)}</td></tr>
                <tr><td class="total-label">Subtotal</td><td class="numero"><strong>${formatarMoeda(d2.Dividendo + d2.JCP + d2.Rendimento + d2.Outros)}</strong></td></tr>

                <tr>
                    <td rowspan"4" style="vertical-align: middle; text-align: center;"><strong>Declared in ${anoNum}, Paid in the Future</strong></td>
                    <td>Dividends</td><td class="numero">${formatarMoeda(d3.Dividendo)}</td>
                </tr>
                <tr><td>Interest on Equity (JCP)</td><td class="numero">${formatarMoeda(d3.JCP)}</td></tr>
                <tr><td>Yields (REITs/Others)</td><td class="numero">${formatarMoeda(d3.Rendimento)}</td></tr>
                <tr><td class="total-label">Subtotal</td><td class="numero"><strong>${formatarMoeda(d3.Dividendo + d3.JCP + d3.Rendimento + d3.Outros)}</strong></td></tr>
            </tbody>
        </table></div>`;
    });

    html += `</div>`; 
    container.innerHTML = html;

    const body = document.body;
    body.classList.add('imprimindo-ir');
    container.classList.add('imprimindo');

    window.print();

    setTimeout(() => {
        body.classList.remove('imprimindo-ir');
        container.classList.remove('imprimindo');
    }, 500);
}
