// Dividends // Dividendos e Rendimentos de Renda Variável
function calcularTotalProventosProvisionados() {
    const hojeStr = new Date().toISOString().split('T')[0];
    const proventosProvisionados = todosOsProventos.filter(p =>
        p.dataCom && p.dataPagamento &&
        p.dataCom < hojeStr &&
        p.dataPagamento > hojeStr
    );
    return proventosProvisionados.reduce((soma, p) => soma + (p.valorTotalRecebido || 0), 0);
}
function getUltimoProvento(ticker, dataLimite = null) {
    const hoje = new Date().toISOString().split('T')[0];
    const dataFinal = dataLimite || hoje;

    const proventosDoAtivo = todosOsProventos
        .filter(p => p.ticker === ticker && p.valorIndividual > 0 && p.dataCom && p.dataCom <= dataFinal)
        .sort((a, b) => new Date(b.dataCom) - new Date(a.dataCom));

    return proventosDoAtivo.length > 0 ? proventosDoAtivo[0].valorIndividual : 0;
}
function calcularProjecaoAnualUnitaria(ticker, options = {}) {
    const hoje = new Date().toISOString().split('T')[0];
    const dataFim = options.dataLimite || hoje;

    // ALTERAÇÃO 1: Usa getInicioIninterrupto para respeitar o ciclo atual
    // Se não houver ciclo ativo (ex: nunca comprou), ele pode retornar null, então tratamos.
    let dataInicio = options.dataInicio || getInicioIninterrupto(ticker);
    
    // Se não encontrou data de início (nunca comprou) ou erro, retorna 0
    if (!dataInicio) {
        return 0;
    }

    // Lógica de limite de anos (ex: média de 5 anos)
    // Se o ciclo ininterrupto for MAIOR que 5 anos, cortamos em 5 anos.
    // Se for MENOR (ex: 2 meses), a dataInicio original (de 2 meses atrás) prevalece.
    if (options.limiteAnos) {
        let dataCorteLimitada = new Date(dataFim);
        dataCorteLimitada.setFullYear(dataCorteLimitada.getFullYear() - options.limiteAnos);
        const dataCorteLimitadaStr = dataCorteLimitada.toISOString().split('T')[0];

        // Se o início do ciclo é mais antigo que o limite de 5 anos, usamos o limite.
        if (new Date(dataInicio) < new Date(dataCorteLimitadaStr)) {
            dataInicio = dataCorteLimitadaStr;
        }
    }

    const diasDeHistorico = calcularDiffDias(dataInicio, dataFim);
    
    // Se a data de início for hoje ou futura, evita divisão por zero
    if (diasDeHistorico <= 0) {
        return 0;
    }
    
    const fonteDeProventos = options.proventosParaCalculo || todosOsProventos;
    
    // Filtra proventos APENAS dentro deste ciclo ininterrupto (ou janela de 5 anos)
    const proventosNoPeriodo = fonteDeProventos.filter(p =>
        p.ticker === ticker &&
        p.dataCom >= dataInicio &&
        p.dataCom <= dataFim
    );

    const somaTotalPeriodo = proventosNoPeriodo.reduce((acc, p) => acc + p.valorIndividual, 0);

    // ALTERAÇÃO 2: MÉTODO RAMPA (Conservador)
    // Se o período for menor que 1 ano, NÃO extrapola (não multiplica por 365).
    // Retorna apenas o que de fato entrou (soma absoluta).
    if (diasDeHistorico < 365) {
        return somaTotalPeriodo; 
    }

    // Se tiver mais de 1 ano, faz a média anualizada padrão
    return (somaTotalPeriodo / diasDeHistorico) * 365.25;
}
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
                <table><thead><tr><th>Ativo</th><th>Tipo</th><th>Data Com</th><th>Data Pag.</th><th class="numero">Valor (R$)</th></tr></thead><tbody>
            `;
            dados.sort((a, b) => new Date(a.dataPagamento) - new Date(b.dataPagamento)).forEach(detalhe => {
                const dataComFmt = new Date(detalhe.dataCom + 'T12:00:00').toLocaleDateString('pt-BR');
                const dataPagFmt = new Date(detalhe.dataPagamento + 'T12:00:00').toLocaleDateString('pt-BR');
                conteudoHtml += `
                    <tr>
                        <td>${detalhe.ticker}</td>
                        <td>${detalhe.tipo}</td>
                        <td>${dataComFmt}</td>
                        <td>${dataPagFmt}</td>
                        <td class="numero">${formatarMoeda(detalhe.valor)}</td>
                    </tr>
                `;
            });
            conteudoHtml += '</tbody></table>';
        });

    } else {
        conteudoHtml = '<p style="text-align:center;">Nenhum provento provisionado para receber.</p>';
    }

    document.getElementById('modal-dashboard-detalhes-titulo').textContent = 'Detalhes dos Proventos Provisionados';
    document.getElementById('modal-dashboard-detalhes-conteudo').innerHTML = conteudoHtml;
    abrirModal('modal-dashboard-detalhes');
}
async function salvarProventosEmMassa() {
    const tbody = document.getElementById('tabela-proventos-massa-body');
    const linhas = tbody.querySelectorAll('tr');
    
    // Tenta capturar o botão pelo ID. Se não tiver ID, tenta pegar o botão ativo ou busca genérica
    const btnSalvar = document.getElementById('btn-salvar-proventos-massa') || document.querySelector('#modal-proventos-massa .btn-primary');

    if (linhas.length === 0) {
        alert('Adicione pelo menos uma linha para salvar.');
        return;
    }

    // --- FUNÇÃO LOCAL PARA EFEITO VISUAL NO BOTÃO ---
    const logNoBotao = (texto) => {
        if (btnSalvar) {
            // Se for a primeira vez, adiciona a classe
            if (!btnSalvar.classList.contains('btn-hacker-log')) {
                btnSalvar.classList.add('btn-hacker-log');
                btnSalvar.disabled = true;
            }
            const linhasLog = texto.split('\n');
            const ultimasLinhas = linhasLog.slice(-2).join('\n');
            btnSalvar.innerText = ultimasLinhas;
        }
    };

    // Texto original do botão para restaurar depois
    const textoOriginalBtn = btnSalvar ? btnSalvar.innerHTML : 'Salvar Todos';

    try {
        let novosProventos = [];
        let linhasIgnoradas = 0;
        let ativosNaoEncontrados = [];
        
        // 1. Inicia o Show Visual
        logNoBotao('> Iniciando leitura...\n> Validando dados...');
        await new Promise(r => setTimeout(r, 300)); // Pequena pausa dramática

        // 2. Processamento Linha a Linha (Com visual)
        for (const tr of linhas) {
            const ticker = tr.querySelector('.prov-massa-ticker').value.toUpperCase().trim();
            const dataCom = tr.querySelector('.prov-massa-data-com').value;
            const dataPag = tr.querySelector('.prov-massa-data-pag').value;
            const tipo = tr.querySelector('.prov-massa-tipo').value;
            const valorBrutoInput = tr.querySelector('.prov-massa-valor-bruto').value;
            const irInput = tr.querySelector('.prov-massa-ir').value;

            if (!ticker || !dataCom || !dataPag || !valorBrutoInput) {
                continue; 
            }

            // Atualiza o botão com o ticker atual
            logNoBotao(`> Processando...\n> Ativo: ${ticker}`);
            
            // Pequeno delay para o usuário ler (efeito visual)
            await new Promise(r => setTimeout(r, 100));

            const ativoExiste = todosOsAtivos.some(a => a.ticker === ticker);
            if (!ativoExiste) {
                linhasIgnoradas++;
                if (!ativosNaoEncontrados.includes(ticker)) ativosNaoEncontrados.push(ticker);
                continue; 
            }

            const valorBruto = parseDecimal(valorBrutoInput);
            
            let aliquotaDecimal = 0;
            if (irInput && !isNaN(irInput)) {
                aliquotaDecimal = parseFloat(irInput) / 100;
            }

            const valorLiquido = valorBruto * (1 - aliquotaDecimal);

            const novoProvento = {
                id: Date.now() + Math.random(),
                ticker: ticker,
                dataCom: dataCom,
                dataPagamento: dataPag,
                tipo: tipo,
                valorIndividual: parseFloat(valorLiquido.toFixed(2)),
                valorBrutoIndividual: parseFloat(valorBruto.toFixed(2)),
                percentualIR: parseFloat(irInput) || 0,
                qtd: 0, // Será calculado na sincronização
                total: 0 // Será calculado na sincronização
            };

            novosProventos.push(novoProvento);
        }

        // 3. Validações Pós-Processamento
        if (ativosNaoEncontrados.length > 0) {
            // Se houver erro, paramos o visual "hacker" e mostramos o alert padrão
            alert(`Atenção: ${linhasIgnoradas} linha(s) ignoradas pois os ativos não estão cadastrados: ${ativosNaoEncontrados.join(', ')}`);
        }

        if (novosProventos.length === 0) {
            if (linhasIgnoradas === 0) alert("Nenhum dado válido para salvar.");
            return; 
        }

        // 4. Salva e Inicia Sincronização
        logNoBotao(`> ${novosProventos.length} lidos.\n> Sincronizando Carteira...`);
        
        // Adiciona à lista global
        todosOsProventos = [...todosOsProventos, ...novosProventos];

        // --- O PULO DO GATO: CHAMA O MODO SILENCIOSO CORRETAMENTE ---
        // callback = null, silencioso = true
        if (typeof sincronizarTodosOsRegistros === 'function') {
            await sincronizarTodosOsRegistros(null, true); 
        } else {
            await salvarDadosNaFonte({ proventos: todosOsProventos });
        }

        // 5. Sucesso
        logNoBotao('> SUCESSO!\n> Dados calculados.');
        await new Promise(r => setTimeout(r, 1000)); // Mantém a mensagem de sucesso por 1s

        // Limpa e Fecha
        const modalElement = document.getElementById('modal-proventos-massa');
        if (modalElement) {
            if (typeof $ !== 'undefined' && $(modalElement).modal) {
                $(modalElement).modal('hide');
            } else {
                modalElement.style.display = 'none';
            }
        }
        
        tbody.innerHTML = ''; 
        renderizarTabelaProventos();

    } catch (error) {
        console.error(error);
        logNoBotao('> ERRO CRÍTICO.\n> Veja o Console.');
        alert('Erro ao salvar proventos: ' + error.message);
    } finally {
        // Restaura o botão ao estado original
        if (btnSalvar) {
            btnSalvar.classList.remove('btn-hacker-log');
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = textoOriginalBtn;
        }
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
async function salvarEdicaoTransacaoProvento() {
    // As linhas "event" e "event.preventDefault()" foram REMOVIDAS daqui.

    const transacaoId = document.getElementById('edit-trans-provento-id').value;
    const novoValorTotal = parseDecimal(document.getElementById('edit-trans-provento-valor').value);
    const transacaoIdNum = parseFloat(transacaoId);
    const transacaoIndex = todasAsMovimentacoes.findIndex(t => t.id === transacaoIdNum);

    if (transacaoIndex === -1) {
        alert("Erro: Transação não encontrada para atualizar.");
        return;
    }

    const transacao = todasAsMovimentacoes[transacaoIndex];
    const proventoOriginal = todosOsProventos.find(p => p.id === transacao.sourceId);

    if (!proventoOriginal) {
        alert("Erro: Provento original associado a esta transação não foi encontrado.");
        return;
    }
    transacao.valor = novoValorTotal;
    const contaAssociada = todasAsContas.find(c => String(c.id) === String(transacao.idAlvo));
    let quantidadeNaContaStr = '';
    if (contaAssociada && proventoOriginal.posicaoPorCorretora[contaAssociada.banco]) {
        const quantidade = proventoOriginal.posicaoPorCorretora[contaAssociada.banco].quantidade;
        quantidadeNaContaStr = ` s/${Math.round(quantidade)}`;
    }
    transacao.descricao = `(Valor Editado) ${proventoOriginal.tipo} de ${proventoOriginal.ticker}${quantidadeNaContaStr}`;
    transacao.source = 'provento_editado';
    
    // Adiciona "await" para garantir que o salvamento termine antes de continuar
    await salvarMovimentacoes(); 
    
    // Dispara a sincronização
    sincronizarTodosOsRegistros(null, true);

    // O código de renderização/fechamento continua o mesmo
    if (telas.caixaGlobal.style.display === 'block') {
        renderizarTelaCaixaGlobal(true);
    }
    if (telas.proventos.style.display === 'block') {
        renderizarTabelaProventos();
    }  
    fecharModal('modal-edicao-transacao-provento');
    if (modalProjecaoFutura.style.display === 'block') {
        renderizarModalProjecaoFutura('contas');
    }
}
async function deletarProvento(proventoId) {
    if (confirm('Tem certeza que deseja excluir este lançamento de provento?')) {
        const provento = todosOsProventos.find(p => p.id === proventoId);
        if (!provento) return;

        const movimentacoesVinculadas = todasAsMovimentacoes.filter(t => 
            (t.source === 'provento' || t.source === 'provento_editado') && t.sourceId === proventoId
        );

        if (currentUser && idCasaAssociada && movimentacoesVinculadas.length > 0) {
            try {
                const { writeBatch, doc } = window.dbFunctions;
                const batch = writeBatch(window.db);
                let lancamentosRemotosExcluidos = 0;

                movimentacoesVinculadas.forEach(mov => {
                    if (mov.idLancamentoCasa) {
                        const docRef = doc(window.db, "Casas", idCasaAssociada, "Lancamentos", mov.idLancamentoCasa);
                        batch.delete(docRef);
                        lancamentosRemotosExcluidos++;
                    }
                });

                if (lancamentosRemotosExcluidos > 0) {
                    await batch.commit();
                    console.log(`${lancamentosRemotosExcluidos} lançamento(s) de provento correspondente(s) excluído(s) do Sistema de Finanças.`);
                }
            } catch (error) {
                console.error("Erro ao excluir lançamento(s) de provento do Sistema de Finanças:", error);
                alert("Não foi possível excluir o(s) lançamento(s) correspondente(s) no sistema de finanças. A exclusão local foi cancelada.");
                return;
            }
        }

        const ativo = todosOsAtivos.find(a => a.ticker === provento.ticker);
        const tipoAtivo = ativo ? ativo.tipo : null;

        todosOsProventos = todosOsProventos.filter(p => p.id !== proventoId);
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
function calcularDadosProvento(ticker, dataCom, valorIndividual) { const posicoesNaData = gerarPosicaoDetalhada(dataCom); const posicaoDoAtivo = posicoesNaData[ticker]; if (!posicaoDoAtivo || posicaoDoAtivo.quantidade <= 0) { return { quantidadeNaDataCom: 0, valorTotalRecebido: 0, precoMedioNaDataCom: 0, yieldOnCost: 0, posicaoPorCorretora: {} }; } const quantidadeTotal = posicaoDoAtivo.quantidade; const precoMedio = posicaoDoAtivo.precoMedio; const valorTotal = quantidadeTotal * valorIndividual; const yieldOnCost = precoMedio > 0 ? (valorIndividual / precoMedio) : 0; let posPorCorretoraCalculada = {}; for (const corretora in posicaoDoAtivo.porCorretora) { const qtd = posicaoDoAtivo.porCorretora[corretora]; if (qtd > 0) { posPorCorretoraCalculada[corretora] = { quantidade: qtd, valorRecebido: qtd * valorIndividual }; } } return { quantidadeNaDataCom: quantidadeTotal, valorTotalRecebido: valorTotal, precoMedioNaDataCom: precoMedio, yieldOnCost: yieldOnCost, posicaoPorCorretora: posPorCorretoraCalculada }; }
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
async function sincronizarProventoComTransacao(proventoId, corretoraParaLimpar = null) {
    const provento = todosOsProventos.find(p => p.id === proventoId);
    if (!provento || !provento.dataPagamento) return [];

    todasAsMovimentacoes = todasAsMovimentacoes.filter(t => {
        const conta = todasAsContas.find(c => String(c.id) === String(t.idAlvo));
        // --- CORREÇÃO AQUI: Remove a exclusão de 'provento_editado' ---
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
                    enviarParaFinancas: true, // Define como true por padrão
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
function gerarHtmlCalendarioFIIs() {
    const tickersFIIs = todosOsAtivos.filter(a => a.tipo === 'FII').map(a => a.ticker);
    const proventosFIIs = todosOsProventos.filter(p => tickersFIIs.includes(p.ticker));

    if (proventosFIIs.length === 0) {
        return '<p>Nenhum provento de FII encontrado.</p>';
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
        htmlFinal += `<thead><tr><th class="col-ativo">Ativo</th>`;
        const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
        meses.forEach(mes => htmlFinal += `<th class="col-mes">${mes.toUpperCase()}</th>`);
        htmlFinal += `</tr></thead><tbody>`;

        tickersDoAno.forEach(ticker => {
            const link = linksExternos.fiis ? `<a href="${linksExternos.fiis}${ticker}" target="_blank" class="ticker-link">${ticker}</a>` : ticker;
            htmlFinal += `<tr><td class="col-ativo">
                    ${link}
                    <i class="fas fa-plus-circle acao-btn btn-adicionar-provento-ticker" 
                       data-ticker="${ticker}" 
                       title="Lançar provento para ${ticker}"></i>
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
                                    <div class="provento-detalhe" title="Quantidade de cotas e rendimento por cota">(${Math.round(provento.quantidadeNaDataCom)} x ${formatarMoeda(provento.valorIndividual)})</div>
                                    <div class="provento-detalhe" title="Yield on Cost do provento">YOC: ${formatarPercentual(provento.yieldOnCost)}</div>
                                </div>
                                <div class="provento-acoes" style="display: none;">
                                    <i class="fas fa-edit acao-btn edit" title="Editar Provento"></i>
                                    <i class="fas fa-trash acao-btn delete" title="Excluir Provento"></i>
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
        return '<p>Nenhum provento de Ações ou ETFs encontrado para gerar o calendário.</p>';
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
        htmlFinal += `<thead><tr><th class="col-ativo">Ativo</th>`;
        const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
        meses.forEach(mes => htmlFinal += `<th class="col-mes">${mes.toUpperCase()}</th>`);
        htmlFinal += `</tr></thead><tbody>`;

        tickersDoAno.forEach(ticker => {
            const link = linksExternos.acoes ? `<a href="${linksExternos.acoes}${ticker}" target="_blank" class="ticker-link">${ticker}</a>` : ticker;
            htmlFinal += `<tr><td class="col-ativo">
                    ${link}
                    <i class="fas fa-plus-circle acao-btn btn-adicionar-provento-ticker" 
                       data-ticker="${ticker}" 
                       title="Lançar provento para ${ticker}"></i>
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
                                    <div class="provento-valor-total">${provento.tipo}: ${formatarMoeda(provento.valorTotalRecebido)}</div>
                                    <div class="provento-detalhe" title="Quantidade de ações e provento por ação">(${Math.round(provento.quantidadeNaDataCom)} x ${formatarMoeda(provento.valorIndividual)})</div>
                                    <div class="provento-detalhe" title="Yield on Cost do provento">YOC: ${formatarPercentual(provento.yieldOnCost)}</div>
                                </div>
                                <div class="provento-acoes" style="display: none;">
                                    <i class="fas fa-edit acao-btn edit" title="Editar Provento"></i>
                                    <i class="fas fa-trash acao-btn delete" title="Excluir Provento"></i>
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
        ? new Date(dataInicioInvestimento + 'T12:00:00').toLocaleDateString('pt-BR') 
        : 'Início';
    
    const textoProventosPagos = `<strong>Proventos Pagos de ${dataInicioFmt} até Hoje:</strong>`;

    if (!resumoPessoal && totalProventosPagos === 0) {
        container.innerHTML = '<p>Nenhum provento ou posição encontrados para este ativo.</p>';
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
                    <span>Progresso da Alocação Ideal: <strong>${progressoPercentual.toFixed(2)}%</strong></span>
                </div>
                <div class="meta-progresso-barra-container" style="height: 12px; background-color: #e9ecef; border-radius: 6px; overflow: hidden;">
                    <div class="meta-progresso-barra" style="${barStyle}"></div>
                </div>
                <div class="meta-valores" style="margin-top: 10px; border-top: none; padding-top: 0;">
                    <div class="meta-valor-item">
                        <label>Posição Atual</label>
                        <span>${formatarMoeda(valorDeMercado)}</span>
                    </div>
                    <div class="meta-valor-item">
                        <label>Posição Ideal</label>
                        <span>${formatarMoeda(valorIdeal)}</span>
                    </div>
                </div>
            </div>
        `;
    }
    // --- FIM DA ALTERAÇÃO ---
    
    let projectionHtml = '<p>Não há projeção de proventos (sem posição atual ou proventos recentes).</p>';
    if(posicao && posicao.quantidade > 0) {
        const yocAnualPessoal = resumoPessoal ? resumoPessoal.yocCustoAnual : 0;
        const yieldAnualMercado = (dadosMercado.valor > 0) ? projecaoAnualMercado / dadosMercado.valor : 0;

        projectionHtml = `
            <div class="summary-columns-container">
                <div class="summary-column">
                    <h4>Minha Performance (Pessoal)</h4>
                    <div class="summary-data-point"><label>Preço Médio Atual</label><span>${formatarMoeda(precoMedioAtual)}</span></div>
                    <div class="summary-data-point">
                        <label>Projeção Anual (Pos. Atual)</label>
                        <span>${formatarMoeda(resumoPessoal.projecaoAnualTotal)}</span>
                    </div>
                    <div class="summary-data-point">
                        <label>Média Mensal (Pos. Atual)</label>
                        <span>${formatarMoeda(resumoPessoal.mediaMensalTotal)}</span>
                    </div>
                    <div class="summary-data-point">
                        <label>Yield on Cost (Anualizado)</label>
                        <span>${formatarPercentual(yocAnualPessoal)}</span>
                    </div>
                </div>
                <div class="summary-column">
                    <h4>Visão de Mercado (Atual)</h4>
                     <div class="summary-data-point"><label>Preço de Mercado</label><span>${formatarMoeda(precoAtual)}</span></div>
                     <div class="summary-data-point">
                        <label>Projeção Anual (por Unidade)</label>
                        <span>${formatarMoeda(projecaoAnualMercado)}</span>
                    </div>
                    <div class="summary-data-point">
                        <label>Média Mensal (por Unidade)</label>
                        <span>${formatarMoeda(projecaoAnualMercado / 12)}</span>
                    </div>
                    <div class="summary-data-point">
                        <label>Dividend Yield (Anualizado)</label>
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

        frequenciaHtml += '<hr style="margin: 20px 0;"><h4 class="frequencia-titulo">Frequência de Proventos</h4>';
        const mesesAbrev = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const anos = Object.keys(frequenciaPorAno).sort((a, b) => b - a);

        anos.forEach(ano => {
            const dadosAno = frequenciaPorAno[ano];
            const mesesCom = [...dadosAno.com].sort((a,b) => a - b).map(m => mesesAbrev[m]).join(', ');
            const mesesPag = [...dadosAno.pag].sort((a,b) => a - b).map(m => mesesAbrev[m]).join(', ');
            frequenciaHtml += `<div class="frequencia-ano-bloco">
                                <strong>${ano}</strong>
                                <div class="frequencia-linha"><span>Data-Com:</span> ${mesesCom}</div>
                                <div class="frequencia-linha"><span>Pagamento:</span> ${mesesPag}</div>
                           </div>`;
        });
    }

    const historicoMovimentacoes = gerarHistoricoCompletoParaAtivo(ticker);
    let historicoHtml = `
        <hr style="margin: 20px 0;">
        <h4>Histórico de Movimentações</h4>
    `;

    if (historicoMovimentacoes.length === 0) {
        historicoHtml += '<p>Nenhuma movimentação encontrada para este ativo.</p>';
    } else {
        historicoHtml += `
            <div class="tabela-projecao-wrapper" style="max-height: 250px; overflow-y: auto; margin-top: 10px;">
                <table class="dashboard-table">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Transação</th>
                            <th class="numero">Preço Unit.</th>
                            <th class="numero">Qtd. Consolidada</th>
                            <th class="numero">Preço Médio</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        historicoMovimentacoes.slice().reverse().forEach(item => {
            const dataFormatada = item.data ? new Date(item.data + 'T12:00:00').toLocaleDateString('pt-BR') : 'N/A';
            const precoUnitarioFmt = (item.precoUnitario !== null && typeof item.precoUnitario === 'number' && item.precoUnitario > 0) ? formatarMoeda(item.precoUnitario) : '-';
            
            historicoHtml += `
                <tr>
                    <td>${dataFormatada}</td>
                    <td>${item.descricaoTransacao}</td>
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
        <h4>Histórico de Proventos</h4>
    `;

    if (proventosDoAtivo.length === 0) {
        proventosTabelaHtml += '<p>Nenhum provento encontrado para este ativo.</p>';
    } else {
        proventosTabelaHtml += `
            <div class="tabela-projecao-wrapper" style="max-height: 250px; overflow-y: auto; margin-top: 10px;">
                <table class="dashboard-table">
                    <thead>
                        <tr>
                            <th class="sortable" data-key="dataCom">Data Com</th>
                            <th class="sortable" data-key="dataPagamento">Data Pgto</th>
                            <th>Tipo</th>
                            <th class="numero">Valor Unit/YoC</th>
                            <th class="numero">Qtd. Base</th>
                            <th class="numero">Vlr. Liq. Pago</th>
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
            
            const tipoAbreviado = p.tipo ? p.tipo.substring(0, 4) : 'N/D';
            const dataComFmt = p.dataCom ? dataComObj.toLocaleDateString('pt-BR') : 'Inválida';
            const dataPagFmt = p.dataPagamento ? new Date(p.dataPagamento + 'T12:00:00').toLocaleDateString('pt-BR') : 'Inválida';
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
        <h4>Cotação vs. Preço Médio (Histórico de Snapshots)</h4>
        <div class="grafico-barras-container" style="height: 300px; margin-top: 10px;">
            <canvas id="grafico-preco-vs-pm-modal-canvas"></canvas>
        </div>

        ${proventosTabelaHtml}
        <div style="margin-top: 25px;">
            <h4>Evolução Anual de Proventos Pagos</h4>
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
                    label: 'Total Recebido (R$)',
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
                                return `Valor: ${formatarMoeda(valor)}`;
                            },
                            afterLabel: function(context) {
                                const index = context.dataIndex;
                                const yoc = dadosGrafico.yields[index];
                                return `YOC no Ano: ${formatarPercentual(yoc)}`;
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
                    labels: dadosHistorico.map(d => new Date(d.data + 'T12:00:00').toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit', year: '2-digit'})),
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
                            borderDash: [5, 5],
                            pointRadius: 0, // Remove o ponto visual
                            pointHoverRadius: 5 // Mostra o ponto ao passar o mouse
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
             ctxLinha.fillText("Nenhum dado de snapshot encontrado para este ativo.", ctxLinha.canvas.width / 2, ctxLinha.canvas.height / 2);
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
function gerarDadosProventosAnuais() {
    const resultados = {};
    const anoAtual = new Date().getFullYear();
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    const isLeap = (year) => (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);

    const initAno = (ano) => {
        if (!resultados[ano]) {
            resultados[ano] = { 
                total: { 'Ação': 0, 'FII': 0, 'ETF': 0, 'Renda Fixa': 0, 'Total RV': 0, 'Total Geral': 0 },
                realizado: { 'Ação': 0, 'FII': 0, 'ETF': 0, 'Renda Fixa': 0, 'Total RV': 0, 'Total Geral': 0 },
                // Adicionamos a propriedade 'anual'
                mediasRealizadas: { diaria: 0, mensal: 0, anual: 0 },
                mediasProvisionadas: { diaria: 0, mensal: 0, anual: 0 },
                isProjected: false, 
                isFuture: false 
            };
        }
    };

    // 1. Processa Renda Variável
    todosOsProventos.forEach(p => {
        if (!p.dataPagamento) return;
        const dataPagamentoObj = new Date(p.dataPagamento + 'T12:00:00');
        const ano = dataPagamentoObj.getUTCFullYear();
        const jaFoiPago = dataPagamentoObj <= hoje;

        initAno(ano);
        const ativo = todosOsAtivos.find(a => a.ticker === p.ticker);
        
        if (ativo && ativo.tipo) {
            resultados[ano].total[ativo.tipo] += p.valorTotalRecebido;
            resultados[ano].total['Total RV'] += p.valorTotalRecebido;
            if (jaFoiPago) {
                resultados[ano].realizado[ativo.tipo] += p.valorTotalRecebido;
                resultados[ano].realizado['Total RV'] += p.valorTotalRecebido;
            }
        }
    });

    // 2. Processa Renda Fixa
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
            resultados[ano].total['Renda Fixa'] += rendimentoIncremental;
            resultados[ano].realizado['Renda Fixa'] += rendimentoIncremental;
            ultimoRendimento = rendimentoFinalMes;
        });
    }

    // 3. Consolida Totais e Médias
    Object.keys(resultados).sort().forEach(anoStr => {
        const ano = parseInt(anoStr);
        const res = resultados[ano];
        
        res.total['Total Geral'] = res.total['Total RV'] + res.total['Renda Fixa'];
        res.realizado['Total Geral'] = res.realizado['Total RV'] + res.realizado['Renda Fixa'];

        const diasNoAno = isLeap(ano) ? 366 : 365;

        if (ano < anoAtual) {
            // Passado: Anual é o próprio Total
            res.mediasRealizadas.mensal = res.total['Total RV'] / 12;
            res.mediasRealizadas.diaria = res.total['Total RV'] / diasNoAno;
            res.mediasRealizadas.anual = res.total['Total RV'];
        } 
        else if (ano === anoAtual) {
            const inicioDoAno = new Date(ano, 0, 1);
            const diasPercorridos = Math.max(1, Math.ceil((hoje - inicioDoAno) / (1000 * 60 * 60 * 24)));
            
            // --- Linha Principal (Ritmo) ---
            // A "Projeção Anual" é exatamente o valor que gera as médias diária e mensal
            const totalRvProjetado = (res.realizado['Total RV'] / diasPercorridos) * diasNoAno;
            
            res.mediasRealizadas.mensal = totalRvProjetado / 12;
            res.mediasRealizadas.diaria = totalRvProjetado / diasNoAno;
            res.mediasRealizadas.anual = totalRvProjetado; // A coluna Anual mostra a projeção cheia
            res.isProjected = true;

            // --- Linha Secundária (Absoluta) ---
            res.mediasProvisionadas.mensal = res.total['Total RV'] / 12;
            res.mediasProvisionadas.diaria = res.total['Total RV'] / diasNoAno;
            res.mediasProvisionadas.anual = res.total['Total RV']; // A coluna Anual mostra o Total (Pago+Futuro)

        } else { 
             // Futuro
             res.mediasRealizadas.mensal = res.total['Total RV'] / 12;
             res.mediasRealizadas.diaria = res.total['Total RV'] / diasNoAno;
             res.mediasRealizadas.anual = res.total['Total RV'];
             res.isFuture = true;
        }
    });

    return resultados;
}
function obterProventosFiltrados() {
    // Tenta pegar os elementos do DOM com segurança
    const elAtivo = document.getElementById('provento-filtro-ativo');
    const elTipo = document.getElementById('provento-filtro-tipo');
    const elStatus = document.getElementById('provento-filtro-status');
    const elPosicao = document.getElementById('provento-filtro-posicao');
    const elDataDe = document.getElementById('provento-filtro-data-de');
    const elDataAte = document.getElementById('provento-filtro-data-ate');
    const elDataTipo = document.getElementById('provento-filtro-data-tipo');

    // Pega os valores ou define padrões (fallback) caso o elemento não exista
    const filtroAtivo = elAtivo ? elAtivo.value.toUpperCase() : '';
    const filtroTipo = elTipo ? elTipo.value : 'todos';
    const filtroStatus = elStatus ? elStatus.value : 'todos';
    const filtroPosicao = elPosicao ? elPosicao.value : 'todos';
    const filtroDataDe = elDataDe ? elDataDe.value : '';
    const filtroDataAte = elDataAte ? elDataAte.value : '';
    const filtroDataTipo = elDataTipo ? elDataTipo.value : 'dataCom'; // Padrão: Data Com

    return todosOsProventos.filter(p => {
        // 1. Filtro por Ativo
        if (filtroAtivo && !p.ticker.includes(filtroAtivo)) return false;

        // 2. Filtro por Tipo
        if (filtroTipo !== 'todos') {
            const ativo = todosOsAtivos.find(a => a.ticker === p.ticker);
            const tipoAtivo = ativo ? ativo.tipo : 'Outros';
            
            if (filtroTipo === 'FII') {
                if (tipoAtivo !== 'FII' && tipoAtivo !== 'Fundo Imobiliário') return false;
            } else if (filtroTipo === 'Ação') {
                if (tipoAtivo !== 'Ação' && tipoAtivo !== 'BDR' && tipoAtivo !== 'Ação Internacional') return false;
            } else {
                if (tipoAtivo !== filtroTipo) return false;
            }
        }

        // 3. Filtro por Status
        const hojeStr = new Date().toISOString().split('T')[0];
        if (filtroStatus !== 'todos') {
            const isRecebido = p.dataPagamento <= hojeStr;
            if (filtroStatus === 'recebido' && !isRecebido) return false;
            if (filtroStatus === 'receber' && isRecebido) return false;
        }

        // 4. Filtro por Posição
        if (filtroPosicao !== 'todos') {
            const pos = gerarPosicaoDetalhada ? gerarPosicaoDetalhada() : {}; 
            const qtdAtual = pos[p.ticker] ? pos[p.ticker].quantidade : 0;
            const emCarteira = qtdAtual > 0.000001;

            if (filtroPosicao === 'em_carteira' && !emCarteira) return false;
            if (filtroPosicao === 'zerados' && emCarteira) return false;
        }

        // 5. Filtro de Data
        // Usa a data selecionada ou Data Com como padrão
        const dataReferencia = (filtroDataTipo === 'dataPagamento') ? p.dataPagamento : p.dataCom;

        if (filtroDataDe && dataReferencia < filtroDataDe) return false;
        if (filtroDataAte && dataReferencia > filtroDataAte) return false;

        return true;
    });
}

function renderizarTabelaProventos() {
    const container = document.getElementById('lista-de-proventos');
    const summaryContainer = document.getElementById('summary-proventos');
    
    if (!container) return;

    // --- 1. Obtenção e Filtragem ---
    let proventosFiltrados = [];
    try {
        proventosFiltrados = obterProventosFiltrados(); 
    } catch (e) {
        console.error("Erro ao filtrar proventos:", e);
        proventosFiltrados = todosOsProventos || []; 
    }

    // --- 2. Ordenação ---
    const sortedProventos = [...proventosFiltrados].sort((a, b) => {
        const key = (typeof sortConfigProventos !== 'undefined') ? sortConfigProventos.key : 'dataPagamento';
        const direction = (typeof sortConfigProventos !== 'undefined') && sortConfigProventos.direction === 'ascending' ? 1 : -1;
        
        const valA = key.includes('data') ? new Date(a[key]) : (a[key] || '');
        const valB = key.includes('data') ? new Date(b[key]) : (b[key] || '');
        if (valA < valB) return -1 * direction;
        if (valA > valB) return 1 * direction;
        return 0;
    });

    // --- 3. Cálculos de Resumo ---
    const hojeStr = new Date().toISOString().split('T')[0];
    const hojeMeiaNoite = new Date(hojeStr + 'T00:00:00');

    let totalRecebido = 0;
    let totalAReceber = 0;
    let somaYoC = 0;
    let contadorYoC = 0;

    sortedProventos.forEach(p => {
        const valor = p.valorTotalRecebido || 0;
        const dataRef = new Date(p.dataPagamento + 'T12:00:00');
        
        if (dataRef > hojeMeiaNoite) {
            totalAReceber += valor;
        } else {
            totalRecebido += valor;
        }

        if (p.yieldOnCost > 0) {
            somaYoC += p.yieldOnCost;
            contadorYoC++;
        }
    });

    const mediaYoC = contadorYoC > 0 ? somaYoC / contadorYoC : 0;
    const totalGeral = totalRecebido + totalAReceber;

    // Cards de Resumo
    if (summaryContainer) {
        summaryContainer.innerHTML = `
            <div class="dash-summary-card">
                <div class="dash-card-title">Total Geral (Filtro)</div>
                <div class="dash-card-value">${formatarMoeda(totalGeral)}</div>
            </div>
            <div class="dash-summary-card" style="border-left-color: #2ecc71;">
                <div class="dash-card-title">Já Recebido</div>
                <div class="dash-card-value" style="color: #2ecc71;">${formatarMoeda(totalRecebido)}</div>
            </div>
            <div class="dash-summary-card" style="border-left-color: #f1c40f;">
                <div class="dash-card-title">A Receber (Provisionado)</div>
                <div class="dash-card-value" style="color: #f39c12;">${formatarMoeda(totalAReceber)}</div>
            </div>
            <div class="dash-summary-card">
                <div class="dash-card-title">Yield on Cost (Médio)</div>
                <div class="dash-card-value">${formatarPercentual(mediaYoC)}</div>
            </div>
        `;
    }

    // --- 4. Renderização da Tabela ---
    const emEdicao = (typeof isProventosEditMode !== 'undefined' && isProventosEditMode);
    
    const btnExportar = document.getElementById('btn-exportar-proventos');
    if (btnExportar) btnExportar.setAttribute('title', `Exportar ${proventosFiltrados.length} proventos listados.`);

    if (sortedProventos.length === 0) {
        container.innerHTML = `
            <div class="dash-card">
                <div class="dash-body text-center p-5 text-muted">
                    <i class="fas fa-search fa-3x mb-3" style="opacity: 0.3;"></i><br>
                    Nenhum provento encontrado para os filtros selecionados.
                </div>
            </div>`;
        return;
    }

    let linhasHtml = '';
    
    sortedProventos.forEach(p => {
        const isFuturo = new Date(p.dataPagamento + 'T12:00:00') > hojeMeiaNoite;
        const classeLinha = isFuturo ? 'style="background-color: #fffae6;"' : ''; 
        const badgeFuturo = isFuturo ? '<i class="fas fa-clock text-warning" title="Provisionado / A Receber" style="margin-right: 4px;"></i>' : '';

        if(emEdicao) {
             // MODO EDIÇÃO
             linhasHtml += `
                <tr data-id="${p.id}" ${classeLinha}>
                    <td><input type="text" class="form-control form-control-sm edit-field" style="width: 80px;" data-field="ticker" value="${p.ticker}"></td>
                    <td>${p.tipo}</td>
                    <td><input type="date" class="form-control form-control-sm edit-field" style="width: 135px;" data-field="dataCom" value="${p.dataCom}"></td>
                    <td><input type="date" class="form-control form-control-sm edit-field" style="width: 135px;" data-field="dataPagamento" value="${p.dataPagamento}"></td>
                    <td class="numero"><input type="text" class="form-control form-control-sm text-right edit-field" style="width: 100px;" data-field="valorIndividual" value="${formatarDecimalParaInput(p.valorIndividual)}"></td>
                    <td class="numero">${Math.round(p.quantidadeNaDataCom)}</td>
                    <td class="numero text-muted">${formatarPrecoMedio(p.precoMedioNaDataCom)}</td>
                    <td class="numero font-weight-bold">${formatarMoeda(p.valorTotalRecebido)}</td>
                    <td class="percentual">${formatarPercentual(p.yieldOnCost)}</td> 
                    <td class="text-center"><i class="fas fa-lock text-muted" title="Bloqueado em edição"></i></td>
                    <td class="controles-col text-center"><i class="fas fa-pen text-primary"></i></td>
                </tr>`;
        } else {
             // MODO VISUALIZAÇÃO
             let dataComFmt = p.dataCom ? new Date(p.dataCom + 'T12:00:00').toLocaleDateString('pt-BR') : '-';
             let dataPagFmt = p.dataPagamento ? new Date(p.dataPagamento + 'T12:00:00').toLocaleDateString('pt-BR') : '-';
             
             if (p.dataCom === hojeStr) dataComFmt = `<span class="badge badge-info">${dataComFmt}</span>`;
             if (p.dataPagamento === hojeStr) dataPagFmt = `<span class="badge badge-success">${dataPagFmt}</span>`;

             let detalhesCorretoras = '-';
             if (p.posicaoPorCorretora) {
                 detalhesCorretoras = Object.entries(p.posicaoPorCorretora)
                    .map(([nome, dados]) => {
                        const qtd = Math.round(dados.quantidade);
                        const totalCorretora = qtd * (p.valorIndividual || 0);
                        return `<span style="white-space: nowrap;">
                                    ${nome}: <strong>${qtd}</strong> 
                                    <span style="color: #27ae60; font-size: 0.9em;">(${formatarMoeda(totalCorretora)})</span>
                                </span>`;
                    })
                    .join(' <span style="color:#ccc;">|</span> ');
             }
             
             const ativoCadastrado = todosOsAtivos.find(a => a.ticker === p.ticker);
             const warningIcon = !ativoCadastrado?.tipo ? `<i class="fas fa-exclamation-triangle text-warning ml-1" title="Ativo não cadastrado na base."></i>` : '';
             
             linhasHtml += `
                <tr data-id="${p.id}" ${classeLinha}>
                    <td style="font-weight: 600;">${p.ticker} ${warningIcon}</td>
                    <td><span class="badge badge-light border">${p.tipo}</span></td>
                    <td>${dataComFmt}</td>
                    <td>${dataPagFmt}</td>
                    <td class="numero">${formatarPrecoMedio(p.valorIndividual)}</td>
                    <td class="numero">${Math.round(p.quantidadeNaDataCom)}</td>
                    <td class="numero text-muted">${formatarPrecoMedio(p.precoMedioNaDataCom)}</td>
                    
                    <td class="numero" style="font-weight: bold; color: ${isFuturo ? '#f39c12' : '#27ae60'}; font-size: 1.1em; white-space: nowrap;">
                        ${badgeFuturo}${formatarMoeda(p.valorTotalRecebido)}
                    </td>
                    
                    <td class="percentual">${formatarPercentual(p.yieldOnCost)}</td> 
                    <td class="small text-muted">${detalhesCorretoras}</td>
                    
                    <td class="controles-col">
                        <div style="display: flex; gap: 5px; justify-content: flex-end;">
                            <button class="btn btn-sm btn-secondary edit" data-provento-id="${p.id}" title="Editar" style="color: white; padding: 2px 8px;">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-sm btn-secondary delete" data-provento-id="${p.id}" title="Excluir" style="color: white; padding: 2px 8px;">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                    </td>
                </tr>`;
        }
    });

    // CORREÇÃO: Adicionado style="min-width: 140px;" na coluna Total
    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-header" style="background: #fff; border-bottom: 2px solid #f1c40f;">
                <h3 style="margin: 0; font-size: 1.1em; color: #f39c12;"><i class="fas fa-list-ul"></i> Detalhamento dos Lançamentos</h3>
            </div>
            <div class="dash-body table-responsive p-0">
                <table class="table table-hover table-striped mb-0">
                    <thead class="thead-light">
                        <tr>
                            <th class="sortable" data-key="ticker">Ativo</th>
                            <th class="sortable" data-key="tipo">Tipo</th>
                            <th class="sortable" data-key="dataCom">Data Com</th>
                            <th class="sortable" data-key="dataPagamento">Pagamento</th>
                            <th class="numero sortable" data-key="valorIndividual">Valor/Un</th>
                            <th class="numero">Qtd</th>
                            <th class="numero">PM na Data</th>
                            <th class="numero sortable" data-key="valorTotalRecebido" style="min-width: 140px;">Total</th>
                            <th class="percentual">YoC</th>
                            <th>Corretoras</th>
                            <th class="text-right" style="width: 100px;">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${linhasHtml}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    // Listeners de Ordenação
    const headers = container.querySelectorAll('.sortable');
    if (headers) {
        headers.forEach(header => {
            if (typeof sortConfigProventos !== 'undefined' && header.dataset.key === sortConfigProventos.key) {
                header.classList.add(sortConfigProventos.direction);
            }
        });
    }
}

function abrirModalProventosAnuais() {
    const modal = document.getElementById('modal-proventos-anuais');
    document.getElementById('container-proventos-anuais').innerHTML = '<h4>Calculando...</h4>';
    modal.style.display = 'block';

    // Usar um pequeno timeout para permitir que o modal seja exibido antes do cálculo pesado
    setTimeout(() => {
        const dados = gerarDadosProventosAnuais();
        renderizarTabelaProventosAnuais(dados);
    }, 50);
}

function renderizarTabelaProventosAnuais(dados) {
    const container = document.getElementById('container-proventos-anuais');
    const footnotesContainer = document.getElementById('footnotes-proventos-anuais');
    let hasProjected = false;
    let hasFuture = false;
    const anoAtual = new Date().getFullYear();

    // Estilo diferenciado para o bloco de médias (Fundo Azul Suave)
    const styleMediaHeader = 'background-color: #f4f8fb; color: #2c3e50; border-bottom: 2px solid #ddd;';
    const styleMediaCell = 'background-color: #f4f8fb;';

    let tableHtml = `<table class="dashboard-table">
        <thead>
            <tr>
                <th>Ano</th>
                <th class="numero">Ações</th>
                <th class="numero">FIIs</th>
                <th class="numero">ETFs</th>
                <th class="numero">Total RV</th>
                
                <th class="numero" style="${styleMediaHeader}" title="Ritmo Diário (RV)">Diário</th>
                <th class="numero" style="${styleMediaHeader}" title="Projeção Mensal (RV)">Mensal</th>
                <th class="numero" style="${styleMediaHeader}" title="Projeção Anualizada (RV)">Anual</th>
                
                <th class="numero">Renda Fixa</th>
                <th class="numero">Total Geral</th>
            </tr>
        </thead>
        <tbody>
    `;

    const anosOrdenados = Object.keys(dados).sort((a, b) => b - a);

    anosOrdenados.forEach(anoStr => {
        const ano = parseInt(anoStr);
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

        const fonteDadosPrincipal = (ano === anoAtual) ? d.realizado : d.total;

        // Estilos para remover borda no ano atual
        // Nota: Concatenamos o estilo de background das médias com o estilo de borda, se necessário
        const styleNoBorder = 'border-bottom: none !important; padding-bottom: 2px;';
        
        // Células comuns
        const styleTdPrincipal = (ano === anoAtual) ? styleNoBorder : '';
        // Células de média (precisam manter a cor de fundo E remover a borda se for ano atual)
        const styleTdMediaPrincipal = (ano === anoAtual) 
            ? `${styleMediaCell} ${styleNoBorder}` 
            : styleMediaCell;

        const styleTdAno = (ano === anoAtual) ? styleNoBorder : '';

        tableHtml += `
            <tr>
                <td style="${styleTdAno}"><strong>${ano}</strong></td>
                <td class="numero" style="${styleTdPrincipal}">${formatarMoeda(fonteDadosPrincipal['Ação'])}</td>
                <td class="numero" style="${styleTdPrincipal}">${formatarMoeda(fonteDadosPrincipal['FII'])}</td>
                <td class="numero" style="${styleTdPrincipal}">${formatarMoeda(fonteDadosPrincipal['ETF'])}</td>
                <td class="numero" style="${styleTdPrincipal}"><strong>${formatarMoeda(fonteDadosPrincipal['Total RV'])}</strong></td>
                
                <td class="numero ${classesMedia}" style="${styleTdMediaPrincipal}">${formatarMoeda(d.mediasRealizadas.diaria)}${footnoteMarker}</td>
                <td class="numero ${classesMedia}" style="${styleTdMediaPrincipal}">${formatarMoeda(d.mediasRealizadas.mensal)}${footnoteMarker}</td>
                <td class="numero ${classesMedia}" style="${styleTdMediaPrincipal}">${formatarMoeda(d.mediasRealizadas.anual)}${footnoteMarker}</td>
                
                <td class="numero" style="${styleTdPrincipal}">${formatarMoeda(fonteDadosPrincipal['Renda Fixa'])}</td>
                <td class="numero" style="${styleTdPrincipal}"><strong>${formatarMoeda(fonteDadosPrincipal['Total Geral'])}</strong></td>
            </tr>
        `;

        // --- LINHA SECUNDÁRIA (ANO ATUAL) ---
        if (ano === anoAtual) {
            const fonteDadosSecundaria = d.total;
            
            // Estilos secundários
            const styleSecundarioBase = 'border-top: none !important; padding-top: 0px; color: #7f8c8d; font-size: 0.9em; font-style: italic; background-color: #fafafa;';
            
            // Célula de Média Secundária: Precisa misturar o cinza do secundário com o azul do destaque?
            // Geralmente fica melhor manter o cinza do secundário para indicar que é "outra linha", 
            // mas vamos manter um tom levemente azulado para consistência de coluna.
            // Usaremos um azul bem pálido acinzentado: #eff4f6
            const styleMediaSecundario = 'border-top: none !important; padding-top: 0px; color: #7f8c8d; font-size: 0.9em; font-style: italic; background-color: #eff4f6;';

            tableHtml += `
                <tr>
                    <td style="${styleSecundarioBase} text-align: right;">↳ Total:</td>
                    <td class="numero" style="${styleSecundarioBase}">${formatarMoeda(fonteDadosSecundaria['Ação'])}</td>
                    <td class="numero" style="${styleSecundarioBase}">${formatarMoeda(fonteDadosSecundaria['FII'])}</td>
                    <td class="numero" style="${styleSecundarioBase}">${formatarMoeda(fonteDadosSecundaria['ETF'])}</td>
                    <td class="numero" style="${styleSecundarioBase}">${formatarMoeda(fonteDadosSecundaria['Total RV'])}</td>
                    
                    <td class="numero" style="${styleMediaSecundario}">${formatarMoeda(d.mediasProvisionadas.diaria)}</td>
                    <td class="numero" style="${styleMediaSecundario}">${formatarMoeda(d.mediasProvisionadas.mensal)}</td>
                    <td class="numero" style="${styleMediaSecundario}">${formatarMoeda(d.mediasProvisionadas.anual)}</td>
                    
                    <td class="numero" style="${styleSecundarioBase}">${formatarMoeda(fonteDadosSecundaria['Renda Fixa'])}</td>
                    <td class="numero" style="${styleSecundarioBase}">${formatarMoeda(fonteDadosSecundaria['Total Geral'])}</td>
                </tr>
            `;
        }
    });

    tableHtml += `</tbody></table>`;
    container.innerHTML = tableHtml;

    let footnotesHtml = '';
    if (hasProjected) {
        footnotesHtml += `<p><strong>*</strong> Linha Principal (Ano Atual): Médias e Anual projetam o ritmo do que já foi recebido.</p>`;
    }
    if (hasFuture) {
        footnotesHtml += `<p><strong>**</strong> Valores Futuros: Baseados em proventos anunciados.</p>`;
    }
    footnotesContainer.innerHTML = footnotesHtml;
}
function getUltimoProventoHistorico(ticker, dataLimite) {
    const proventosDoAtivo = todosOsProventos
        .filter(p => p.ticker === ticker && p.valorIndividual > 0 && p.dataCom && p.dataCom <= dataLimite)
        .sort((a, b) => new Date(b.dataCom) - new Date(a.dataCom));

    return proventosDoAtivo.length > 0 ? proventosDoAtivo[0].valorIndividual : 0;
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
                <th class="numero">Qtde</th>
                <th class="numero">Valor Total</th>
                <th class="numero">YoC</th>
            </tr></thead><tbody>`;
        
        // Ordena para mostrar os maiores valores primeiro
        dadosDetalhados.sort((a, b) => b.valor - a.valor).forEach(item => {
            
            // Cálculo da Quantidade (Valor Total / Valor Unitário)
            // Proteção para não dividir por zero caso valorIndividual seja nulo ou 0
            const quantidadeCalculada = (item.valorIndividual && item.valorIndividual > 0) 
                ? Math.round(item.valor / item.valorIndividual) 
                : 0;

            // Cálculo do Yield on Cost (Baseado no custoInvestido salvo anteriormente)
            let yocDisplay = '-';
            if (item.custoInvestido && item.custoInvestido > 0) {
                const yoc = (item.valor / item.custoInvestido) * 100;
                yocDisplay = yoc.toFixed(2) + '%';
            }

            tableHtml += `<tr>
                <td>${item.ticker}</td>
                <td>${new Date(item.dataCom + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td>${new Date(item.dataPagamento + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td class="numero">${formatarPrecoMedio(item.valorIndividual)}</td>
                <td class="numero">${quantidadeCalculada}</td>
                <td class="numero"><strong>${formatarMoeda(item.valor)}</strong></td>
                <td class="numero">${yocDisplay}</td>
            </tr>`;
        });
        tableHtml += `</tbody></table>`;
    }

    container.innerHTML = tableHtml;
    abrirModal('modal-detalhes-rendimento');
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
