// Taxes and Income Tax // Impostos e IR
function calcularValorIRSugerido(ticker, tipoEvento) {
    if (!ticker || !tipoEvento) return 0;

    const tickerUpper = ticker.toUpperCase().trim();
    
    // --- 1. BUSCA DE ATIVOS ---
    // Removemos o 'window.' e acessamos a variável global diretamente.
    // Usamos 'typeof' para evitar erro caso a variável nem tenha sido criada ainda.
    let listaAtivos = [];
    if (typeof todosOsAtivos !== 'undefined') {
        listaAtivos = todosOsAtivos;
    }

    // Busca o ativo na lista para verificar se é FII
    const ativo = listaAtivos.find(a => a.ticker === tickerUpper);
    const ehFII = ativo && (ativo.tipo === 'FII' || ativo.tipo === 'Fundo Imobiliário');
    
    // --- 2. BUSCA DAS CONFIGURAÇÕES FISCAIS ---
    // Removemos o 'window.' e acessamos a variável global diretamente.
    let fiscais = null;
    
    if (typeof configuracoesFiscais !== 'undefined') {
        fiscais = configuracoesFiscais;
    }

    // Se a variável global estiver vazia (dados da nuvem ainda não chegaram),
    // definimos o objeto padrão aqui para evitar tela branca ou erro.
    if (!fiscais) {
        fiscais = {
            aliquotaRendimentosFIIs: 0,
            aliquotaRendimentosGeral: 0, 
            aliquotaDividendosGeral: 0, 
            aliquotaJCPGeral: 0.15, 
            aliquotaBonificacoesGeral: 0
        };
        // Opcional: Log para avisar que está usando padrão (ajuda a saber se a nuvem demorou)
        // console.log('Aviso: Configurações fiscais não carregadas. Usando padrão.');
    }

    let aliquota = 0;

    switch (tipoEvento) {
        case 'Rendimento':
            // Se for FII usa regra de FII, senão usa regra Geral
            aliquota = ehFII ? fiscais.aliquotaRendimentosFIIs : fiscais.aliquotaRendimentosGeral;
            break;
        case 'Dividendo':
            aliquota = fiscais.aliquotaDividendosGeral;
            break;
        case 'JCP':
            aliquota = fiscais.aliquotaJCPGeral;
            break;
        case 'Bonificação':
            aliquota = fiscais.aliquotaBonificacoesGeral;
            break;
        case 'Amortização':
            aliquota = 0; 
            break;
        default:
            aliquota = 0;
    }

    // Retorna o valor decimal
    return parseFloat(aliquota);
}
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
function salvarAjusteIR(target) {
    const isPrejuizo = target.classList.contains('editable-prejudice-cell');
    const chaveAjuste = isPrejuizo ? target.dataset.chaveAjustePrejuizo : target.dataset.chaveAjuste;
    const novoValorExibido = parseDecimal(target.textContent);

    let valorParaSalvar;

    if (isPrejuizo) {
        // --- INÍCIO DA CORREÇÃO DEFINITIVA ---
        // Pega o valor exato digitado pelo usuário e o armazena como negativo (pois é um prejuízo).
        // Não calcula mais a diferença, tratando este valor como a "verdade absoluta" para o início do ano.
        valorParaSalvar = -Math.abs(novoValorExibido);
        // --- FIM DA CORREÇÃO DEFINITIVA ---
    } else {
        // Lógica original para ajustes de resultado do mês (que já está correta).
        const valorCalculado = parseFloat(target.dataset.resultadoCalculado);
        valorParaSalvar = novoValorExibido - valorCalculado;
    }

    const index = todosOsAjustesIR.findIndex(a => a.chave === chaveAjuste);

    // Condição ajustada: Salva se o valor for diferente de zero, ou se for um prejuízo inicial (mesmo que seja zero).
    if (Math.abs(valorParaSalvar) > 0.001 || isPrejuizo) {
         if (index > -1) {
            todosOsAjustesIR[index].valor = valorParaSalvar;
        } else {
            todosOsAjustesIR.push({ chave: chaveAjuste, valor: valorParaSalvar });
        }
    } else {
        // Se o ajuste for zero (e não for um prejuízo inicial), remove o registro.
        if (index > -1) {
            todosOsAjustesIR.splice(index, 1);
        }
    }
    
    salvarAjustesIR();
    renderizarCalculadoraIR();
}
function atualizarStatusBotaoIR() {
    const anoSelecionado = document.getElementById('ir-filtro-ano').value;
    const anoAtual = new Date().getFullYear();
    const btnImprimir = document.getElementById('btn-imprimir-ir');
    
    if (parseInt(anoSelecionado, 10) === anoAtual) {
        btnImprimir.classList.add('icone-titulo-desabilitado');
        btnImprimir.title = "Não é possível emitir o relatório para o ano corrente.";
    } else {
        btnImprimir.classList.remove('icone-titulo-desabilitado');
        btnImprimir.title = "Imprimir Relatório para IR";
    }
}
function gerarRelatorioIR(ano) {
    const container = document.getElementById('container-impressao-ir');
    const anoNum = parseInt(ano, 10);
    const dataFimAno = `${ano}-12-31`;
    let html = '';

    const agora = new Date();
    const dataFormatada = agora.toLocaleDateString('pt-BR');
    const horaFormatada = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // --- ESTILOS DE IMPRESSÃO ---
    html += `
    <style>
        @media print {
            @page { margin: 1.5cm; size: A4; }
            /* Removemos estilos globais de body para não afetar Bens e Direitos */
            
            h1 { font-size: 22px; margin-bottom: 5px; color: #000; border-bottom: 2px solid #000; padding-bottom: 5px; font-family: sans-serif; }
            h2 { font-size: 16px; margin-top: 20px; background-color: #f0f0f0; padding: 5px; border-left: 5px solid #444; font-family: sans-serif; }
            h3 { font-size: 14px; margin: 15px 0 5px 0; color: #000; font-weight: bold; border-bottom: 1px solid #ccc; text-transform: uppercase; font-family: sans-serif; }
            .print-timestamp { font-size: 10px; color: #777; margin-bottom: 20px; font-family: sans-serif; }
            
            /* --- ESTILOS EXCLUSIVOS PARA A SEÇÃO DE RENDIMENTOS (Compacta) --- */
            .secao-rendimentos {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                font-size: 11px; /* Fonte menor apenas aqui */
            }

            .grid-rendimentos { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; width: 100%; margin-bottom: 10px; }
            .ativo-card { break-inside: avoid; margin-bottom: 10px; border: 1px solid #eee; padding: 8px; border-radius: 4px; }
            .ativo-titulo { font-weight: bold; font-size: 12px; margin-bottom: 5px; color: #000; }
            
            .tabela-clean { width: 100%; border-collapse: collapse; font-size: 10px; }
            .tabela-clean th { text-align: right; border-bottom: 1px solid #000; padding: 3px; font-weight: bold; color: #444; }
            .tabela-clean th.text-left { text-align: left; }
            .tabela-clean td { text-align: right; border-bottom: 1px solid #ddd; padding: 3px; }
            .tabela-clean td.text-left { text-align: left; color: #555; }
            .tabela-clean tr:last-child td { border-bottom: none; }
            .valor-zero { color: #ccc; }
            .valor-total { font-weight: bold; color: #000; }
            
            /* A lista de bens e direitos usará o estilo padrão do navegador (maior) */
        }
    </style>
    `;

    html += `<h1>Relatório Auxiliar - Imposto de Renda ${ano}</h1>`;
    html += `<p class="print-timestamp">Gerado por: ${userName || 'Usuário'} em ${dataFormatada} às ${horaFormatada}</p>`;

    // ==========================================================================================
    // PARTE 1: BENS E DIREITOS (ORIGINAL - Sem estilos forçados)
    // ==========================================================================================
    html += `<div class="secao-patrimonio"><h2>1. Bens e Direitos (Posição em 31/12/${ano})</h2>`;

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
        const tipo = (ativoInfo && ativoInfo.tipo && ativosAgrupados[ativoInfo.tipo]) ? ativoInfo.tipo : 'ETF';
        
        const posicao = posicoesFimAno[ticker];
        const nome = (ativoInfo && (ativoInfo.nome || ativoInfo.nomePregao)) ? (ativoInfo.nome || ativoInfo.nomePregao) : 'Nome não cadastrado';
        const tipoAcao = (ativoInfo && ativoInfo.tipoAcao && ativoInfo.tipoAcao !== 'N/A') ? `${ativoInfo.tipoAcao}, ` : '';
        const cnpj = (ativoInfo && formatarCNPJ(ativoInfo.cnpj)) ? formatarCNPJ(ativoInfo.cnpj) : 'CNPJ não cadastrado';
        
        let textoAtivo = '';
        if (posicao && posicao.quantidade > 0.0001) {
            textoAtivo = `<strong>${ticker}</strong> - ${tipoAcao}${nome}, CNPJ ${cnpj}, preço médio R$ ${formatarPrecoMedio(posicao.precoMedio)} por unidade. Quantidade: ${Math.round(posicao.quantidade)}.`;
        } else {
            textoAtivo = `<strong>${ticker}</strong> - ${tipoAcao}${nome}, CNPJ ${cnpj}, posição encerrada no ano ${ano}.`;
        }
        
        if(ativosAgrupados[tipo]) ativosAgrupados[tipo].push(textoAtivo);
        else ativosAgrupados['ETF'].push(textoAtivo);
    });

    ['Ação', 'FII', 'ETF'].forEach(tipo => {
        const listaAtivos = ativosAgrupados[tipo];
        if (listaAtivos.length > 0) {
            const tituloTipo = tipo === 'Ação' ? 'Ações' : (tipo === 'FII' ? 'Fundos Imobiliários' : 'ETFs');
            html += `<h3>${tituloTipo}</h3><ul>`; // Retirado estilo inline de lista para usar padrão
            listaAtivos.sort().forEach(itemTexto => {
                html += `<li>${itemTexto}</li>`;
            });
            html += `</ul>`;
        }
    });
    html += `</div>`; 

    // ==========================================================================================
    // PARTE 2: RENDIMENTOS (LAYOUT COMPACTO & CATEGORIZADO)
    // ==========================================================================================
    // Adicionada classe .secao-rendimentos para aplicar a fonte menor
    html += `<div class="secao-rendimentos" style="margin-top: 20px;"><h2>2. Rendimentos Recebidos</h2>`;

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
        html += '<p>Nenhum rendimento encontrado para este período.</p>';
    } else {
        const proventosPorCategoria = { 'Ação': [], 'FII': [], 'ETF': [] };
        
        [...todosTickersDeRendimento].sort().forEach(ticker => {
            const ativoInfo = todosOsAtivos.find(a => a.ticker === ticker);
            const tipo = (ativoInfo && ativoInfo.tipo && proventosPorCategoria[ativoInfo.tipo]) ? ativoInfo.tipo : 'ETF';
            proventosPorCategoria[tipo].push(ticker);
        });

        ['Ação', 'FII', 'ETF'].forEach(tipo => {
            const listaTickers = proventosPorCategoria[tipo];
            
            if (listaTickers.length > 0) {
                const tituloTipo = tipo === 'Ação' ? 'Rendimentos de Ações' : (tipo === 'FII' ? 'Rendimentos de Fundos Imobiliários' : 'Outros Rendimentos');
                html += `<h3>${tituloTipo}</h3>`;
                html += `<div class="grid-rendimentos">`; 

                listaTickers.forEach(ticker => {
                    const d1 = mapa1.get(ticker) || { JCP: 0, Dividendo: 0, Rendimento: 0, Outros: 0 };
                    const d2 = mapa2.get(ticker) || { JCP: 0, Dividendo: 0, Rendimento: 0, Outros: 0 };
                    const d3 = mapa3.get(ticker) || { JCP: 0, Dividendo: 0, Rendimento: 0, Outros: 0 };

                    const fmtCell = (val) => val > 0 ? formatarMoeda(val) : '<span class="valor-zero">-</span>';
                    
                    const totalD1 = d1.Dividendo + d1.JCP + d1.Rendimento + d1.Outros;
                    const totalD2 = d2.Dividendo + d2.JCP + d2.Rendimento + d2.Outros;
                    const totalD3 = d3.Dividendo + d3.JCP + d3.Rendimento + d3.Outros;

                    html += `<div class="ativo-card">
                        <div class="ativo-titulo">${ticker}</div>
                        <table class="tabela-clean">
                            <thead>
                                <tr>
                                    <th class="text-left" style="width: 35%;">Situação</th>
                                    <th style="width: 15%;">Div.</th>
                                    <th style="width: 15%;">JCP</th>
                                    <th style="width: 15%;">Rend.</th>
                                    <th style="width: 20%;">Total</th>
                                </tr>
                            </thead>
                            <tbody>`;
                    
                    if (totalD1 > 0) {
                        html += `<tr>
                            <td class="text-left">Decl. ${anoNum-1} / Pago ${anoNum}</td>
                            <td>${fmtCell(d1.Dividendo)}</td>
                            <td>${fmtCell(d1.JCP)}</td>
                            <td>${fmtCell(d1.Rendimento + d1.Outros)}</td>
                            <td class="valor-total">${formatarMoeda(totalD1)}</td>
                        </tr>`;
                    }
                    if (totalD2 > 0) {
                        html += `<tr>
                            <td class="text-left">Decl. e Pago ${anoNum}</td>
                            <td>${fmtCell(d2.Dividendo)}</td>
                            <td>${fmtCell(d2.JCP)}</td>
                            <td>${fmtCell(d2.Rendimento + d2.Outros)}</td>
                            <td class="valor-total">${formatarMoeda(totalD2)}</td>
                        </tr>`;
                    }
                    if (totalD3 > 0) {
                        html += `<tr>
                            <td class="text-left">Créd. Trânsito (Pago ${anoNum+1}...)</td>
                            <td>${fmtCell(d3.Dividendo)}</td>
                            <td>${fmtCell(d3.JCP)}</td>
                            <td>${fmtCell(d3.Rendimento + d3.Outros)}</td>
                            <td class="valor-total">${formatarMoeda(totalD3)}</td>
                        </tr>`;
                    }
                    html += `</tbody></table></div>`; 
                });

                html += `</div>`; 
            }
        });
    }

    html += `</div>`; // Fim Seção
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
function abrirModalDetalhesIR(ano, mes) {
    const dadosIR = calcularImpostoRendaAnual(ano);
    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const chaveMes = `${ano}-${String(mes + 1).padStart(2, '0')}`;
    
    if (!dadosIR[chaveMes]) {
        alert('Dados não encontrados para este mês.');
        return;
    }

    const dadosGeral = dadosIR[chaveMes]['geral_rv'];
    const dadosFiis = dadosIR[chaveMes]['fiis'];
    const dadosDT = dadosIR[chaveMes]['daytrade'];

    const titulo = `Detalhamento do IR - ${meses[mes]} de ${ano}`;
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
                <h4>Geral (Ações, ETFs, etc.) - SWING TRADE</h4>
                <table class="ir-detalhes-tabela">
                    <tbody>
                        <tr><td>Resultado do Mês (Bruto)</td><td class="numero">${formatarMoeda(dadosGeral.resultadoMes)}</td></tr>
                        <tr><td>&nbsp;&nbsp;&nbsp;↳ Resultado Isento (Ações ON/PN)</td><td class="numero">${formatarMoeda(resultadoIsento)}</td></tr>
                        <tr><td>&nbsp;&nbsp;&nbsp;↳ Lucro Tributável (Ações ON/PN)</td><td class="numero">${formatarMoeda(resultadoTributavelAcoes)}</td></tr>
                        <tr><td>&nbsp;&nbsp;&nbsp;↳ Lucro Tributável (Units)</td><td class="numero">${formatarMoeda(resultadoTributavelUnits)}</td></tr>
                        <tr><td>&nbsp;&nbsp;&nbsp;↳ Lucro Tributável (ETFs)</td><td class="numero">${formatarMoeda(resultadoTributavelETFs)}</td></tr>
                        <tr><td>(-) Prejuízo a Compensar</td><td class="numero valor-negativo">${formatarMoeda(dadosGeral.prejuizoAnterior)}</td></tr>
                        <tr><td>(+/-) Ajuste Manual</td><td class="numero">${formatarMoeda(dadosGeral.ajusteManual)}</td></tr>
                        <tr class="ir-detalhes-linha-subtotal"><td>(=) Base de Cálculo / Prejuízo a Compensar</td><td class="numero">${formatarMoeda(dadosGeral.baseDeCalculo > 0 ? dadosGeral.baseDeCalculo : (dadosGeral.prejuizoAnterior + dadosGeral.resultadoMes + dadosGeral.ajusteManual))}</td></tr>
                        <tr><td>Imposto Devido (${formatarPercentual(configuracoesFiscais.aliquotaAcoes)})</td><td class="numero">${formatarMoeda(dadosGeral.impostoDevido)}</td></tr>
                    </tbody>
                </table>
            </div>

            <div class="ir-detalhes-secao">
                <h4>FIIs</h4>
                <table class="ir-detalhes-tabela">
                    <tbody>
                        <tr><td>Base de Cálculo / Prejuízo a Compensar</td><td class="numero">${formatarMoeda(dadosFiis.baseDeCalculo > 0 ? dadosFiis.baseDeCalculo : (dadosFiis.prejuizoAnterior + dadosFiis.resultadoMes + dadosFiis.ajusteManual))}</td></tr>
                        <tr><td>Imposto Devido (${formatarPercentual(configuracoesFiscais.aliquotaFiisDt)})</td><td class="numero">${formatarMoeda(dadosFiis.impostoDevido)}</td></tr>
                    </tbody>
                </table>
            </div>

            <div class="ir-detalhes-secao">
                <h4>Operações Day Trade</h4>
                <table class="ir-detalhes-tabela">
                     <tbody>
                        <tr><td>Base de Cálculo / Prejuízo a Compensar</td><td class="numero">${formatarMoeda(dadosDT.baseDeCalculo > 0 ? dadosDT.baseDeCalculo : (dadosDT.prejuizoAnterior + dadosDT.resultadoMes + dadosDT.ajusteManual))}</td></tr>
                        <tr><td>Imposto Devido (${formatarPercentual(configuracoesFiscais.aliquotaFiisDt)})</td><td class="numero">${formatarMoeda(dadosDT.impostoDevido)}</td></tr>
                    </tbody>
                </table>
            </div>
            
            <div class="ir-detalhes-secao">
                <h4>Resumo Final</h4>
                 <table class="ir-detalhes-tabela">
                    <tbody>
                        <tr><td>Total do Imposto Mensal</td><td class="numero">${formatarMoeda(impostoTotalGeral)}</td></tr>
                        <tr><td>(-) IRRF a Deduzir ("Dedo-duro")</td><td class="numero valor-negativo">${formatarMoeda(irrfDoMes)}</td></tr>
                        <tr class="ir-detalhes-linha-total"><td>(=) Imposto Devido (DARF)</td><td class="numero">${formatarMoeda(impostoFinal)}</td></tr>
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

    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    const gerarTabelaHtml = (dados, tipo) => {
        let tableHtml = `<table><thead><tr>
            <th>Mês</th>
            <th class="right-aligned-header">Total Vendas</th>
            <th class="right-aligned-header">Prejuízo a Compensar</th>
            <th class="right-aligned-header">Resultado do Mês</th>
            <th class="right-aligned-header">Prejuízo a Compensar (pós-resultado)</th>
            <th class="right-aligned-header">Base de Cálculo</th>
            <th class="right-aligned-header">Imposto Devido</th>
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
                                        title="Prejuízo acumulado de anos anteriores. Clique para definir um valor inicial para este ano.">${formatarMoeda(prejuizoDoMes)}</td>`;
            } else {
                prejuizoCellHtml = `<td class="numero">${formatarMoeda(prejuizoDoMes)}</td>`;
            }

            const classeAjustado = dadosMes.ajusteManual !== 0 ? 'adjusted' : '';
            const tooltipAjuste = dadosMes.ajusteManual !== 0 ? `title="Valor Original: ${formatarMoeda(dadosMes.resultadoMes)} | Ajuste: ${formatarMoeda(dadosMes.ajusteManual)}"` : '';
            
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
                <th>Operação</th><th>Ativo</th><th>Data</th>
                <th class="numero">Qtd.</th><th class="numero">Valor Líquido</th>
                <th class="numero">Custo Aquisição</th><th class="numero">Resultado</th>
            </tr></thead><tbody>`;
            
            operacoes.forEach(op => {
                if(op.tipo === 'venda') {
                     detailsHtml += `<tr>
                        <td>Venda</td><td>${op.ativo}</td>
                        <td>${new Date(op.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                        <td class="numero">${op.quantidade}</td>
                        <td class="numero">${formatarMoeda(op.valorVendaLiquida)}</td>
                        <td class="numero">${formatarMoeda(op.custoAquisicao)}</td>
                        <td class="numero ${op.resultado >= 0 ? 'lucro' : 'prejuizo'}">${formatarMoeda(op.resultado)}</td>
                    </tr>`;
                } else {
                     detailsHtml += `<tr style="background-color: #f0f9ff;">
                        <td>Compra</td><td>${op.ativo}</td>
                        <td>${new Date(op.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
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