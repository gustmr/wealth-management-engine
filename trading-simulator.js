function adicionarOperacao(event) { event.preventDefault(); if (!notaAtual) return; const tickerInput = document.getElementById('op-ativo'); const ticker = tickerInput.value.toUpperCase(); if(!ticker) return; const ativoExiste = todosOsAtivos.some(a => a.ticker === ticker); if (!ativoExiste) { alert(`O ativo "${ticker}" não está cadastrado. Por favor, cadastre-o primeiro.`); abrirModalCadastroAtivo(null, ticker); return; } const op = { id: Date.now(), ativo: ticker, tipo: document.getElementById('op-tipo').value, quantidade: parseInt(document.getElementById('op-quantidade').value), valor: parseDecimal(document.getElementById('op-valor').value), }; if(isNaN(op.quantidade) || isNaN(op.valor) || op.quantidade <= 0) { alert('Quantidade e Valor devem ser números positivos.'); return; } notaAtual.operacoes.push(op); renderizarTabelaOperacoes(); atualizarTotais(); document.getElementById('form-add-operacao').reset(); tickerInput.focus(); }
function deletarOperacao(opId) { if(!notaAtual) return; notaAtual.operacoes = notaAtual.operacoes.filter(op => op.id !== opId); renderizarTabelaOperacoes(); atualizarTotais(); }
function salvarEdicaoOperacao(event) { event.preventDefault(); const opId = parseFloat(document.getElementById('edit-op-id').value); const opIndex = notaAtual.operacoes.findIndex(o => o.id === opId); if (opIndex === -1) return; notaAtual.operacoes[opIndex].tipo = document.getElementById('edit-op-tipo').value; notaAtual.operacoes[opIndex].quantidade = parseInt(document.getElementById('edit-op-quantidade').value); notaAtual.operacoes[opIndex].valor = parseDecimal(document.getElementById('edit-op-valor').value); modalEdicaoOperacao.style.display = 'none'; renderizarTabelaOperacoes(); atualizarTotais(); }
async function sincronizarNotaComTransacao(notaId) {
    const nota = todasAsNotas.find(n => n.id === notaId);
    if (!nota || !nota.data) return [];
    
    todasAsMovimentacoes = todasAsMovimentacoes.filter(t => t.source !== 'nota' || t.sourceId !== nota.id);

    const totalCompras = nota.operacoes.filter(op => op.tipo === 'compra').reduce((acc, op) => acc + op.valor, 0);
    const totalVendas = nota.operacoes.filter(op => op.tipo === 'venda').reduce((acc, op) => acc + op.valor, 0);
    const valorLiquido = arredondarMoeda(totalVendas - totalCompras - (nota.custos + nota.irrf));
    
    if (Math.abs(valorLiquido) < 0.01) {
        return [];
    }

    const dataLiquidacao = calcularDataLiquidacao(nota.data, 2);
    const contaInvestimento = todasAsContas.find(c => c.banco === nota.corretora && c.tipo === 'Conta Investimento');

    let alertas = [];
    if (contaInvestimento) {
        if (new Date(dataLiquidacao) >= new Date(contaInvestimento.dataSaldoInicial + 'T12:00:00')) {
            const dataFormatadaNota = new Date(nota.data).toLocaleDateString('pt-BR', {timeZone: 'UTC'});
            
            const movimentacao = {
                id: Date.now() + Math.random(), data: dataLiquidacao.toISOString().split('T')[0],
                tipoAlvo: 'conta', idAlvo: contaInvestimento.id, moeda: 'BRL',
                descricao: `Liq. Nota Neg. ${nota.corretora} nro. ${nota.numero} de ${dataFormatadaNota}`,
                valor: valorLiquido, source: 'nota', sourceId: nota.id,
                enviarParaFinancas: false, // Offline: false
                idLancamentoCasa: null
            };
            todasAsMovimentacoes.push(movimentacao);
        } else {
            alertas.push(`A liquidação da nota não foi lançada (data anterior ao saldo inicial da conta).`);
        }
    } else {
        alertas.push(`A nota foi salva, mas o lançamento na conta não foi realizado (conta não encontrada).`);
    }
    return alertas;
}
function criarNotaAPartirDaSimulacao() {
    const operacoesSimuladas = [];
    ['fiis', 'acoes'].forEach(tipo => {
        if (dadosSimulacaoNegociar[tipo]) {
            for (const ticker in dadosSimulacaoNegociar[tipo]) {
                const sim = dadosSimulacaoNegociar[tipo][ticker];
                if (sim.qtd && sim.qtd !== 0) {
                    const tipoOperacao = sim.qtd > 0 ? 'compra' : 'venda';
                    const quantidade = Math.abs(sim.qtd);
                    const preco = sim.preco || 0;
                    operacoesSimuladas.push({
                        id: Date.now() + Math.random(),
                        ativo: ticker,
                        tipo: tipoOperacao,
                        quantidade: quantidade,
                        valor: arredondarMoeda(quantidade * preco)
                    });
                }
            }
        }
    });

    if (operacoesSimuladas.length === 0) {
        alert("Não há negociações simuladas para criar uma nota. Preencha a coluna 'Qtd' de pelo menos um ativo.");
        return;
    }

    if (!confirm(`Você deseja criar uma nova nota de negociação com ${operacoesSimuladas.length} operação(ões) a partir da sua simulação atual?`)) {
        return;
    }

    iniciarNovaNota(); // Prepara a tela de lançamento com uma nota em branco (e com "Selecione...")

    // --- INÍCIO DAS NOVAS LINHAS ---
    const hoje = new Date().toISOString().split('T')[0];
    notaAtual.numero = '---';
    notaAtual.data = hoje;
    
    // Atualiza a interface
    document.getElementById('nota-numero').value = '---';
    document.getElementById('nota-data').value = hoje;
    // --- FIM DAS NOVAS LINHAS ---

    notaAtual.operacoes = operacoesSimuladas; // Substitui as operações vazias pelas simuladas

    // Atualiza a tabela de operações e os totais (incluindo data de liquidação)
    renderizarTabelaOperacoes();
    atualizarTotais();

    // Avisa ao usuário para completar o preenchimento
    setTimeout(() => {
        alert(`Operações carregadas! Por favor, selecione a Corretora, confirme a Data e o Número da Nota, e preencha os Custos antes de salvar.`);
    }, 100);
}
function resetarSimulacaoNegociacao() {
    if (!confirm('Tem certeza que deseja limpar toda a simulação? As quantidades serão zeradas e os preços serão atualizados para os valores de mercado.')) {
        return;
    }

    ['#negociar-fiis-tbody', '#negociar-acoes-tbody'].forEach(tbodyId => {
        const tbody = document.querySelector(tbodyId);
        if (tbody) {
            tbody.querySelectorAll('tr').forEach(tr => {
                const inputQtd = tr.querySelector('.negociar-input-qtd');
                const inputPreco = tr.querySelector('.negociar-input-preco');
                // Pega o preço atual da célula (índice 2, pois 0 é nome, 1 é PM)
                const precoAtual = parseDecimal(tr.cells[2].textContent);

                if (inputQtd) inputQtd.value = '';
                if (inputPreco) inputPreco.value = formatarDecimalParaInput(precoAtual);
                
                // Dispara o evento para forçar o recálculo da linha e dos totais
                if (inputPreco) {
                     inputPreco.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        }
    });

    // --- CORREÇÃO: Limpa também o valor do aporte ---
    dadosSimulacaoNegociar.aporteTotal = '';
    const inputAporte = document.getElementById('negociar-aporte-valor');
    if (inputAporte) {
        inputAporte.value = '';
    }
    
    // Reseta os dados internos de simulação
    dadosSimulacaoNegociar.fiis = {};
    dadosSimulacaoNegociar.acoes = {};

    atualizarResumoAporte();
    salvarDadosSimulacaoNegociar();
    alert('Simulação resetada!');
}
function salvarPosicoesEmMassa() {
    const linhas = document.querySelectorAll('#tabela-posicao-massa-body tr');
    const posicoesAgrupadas = new Map();
    let linhasValidasCount = 0;

    for (const linha of linhas) {
        const ticker = linha.querySelector('.pos-massa-ticker').value.toUpperCase();
        const data = linha.querySelector('.pos-massa-data').value;
        const pmStr = linha.querySelector('.pos-massa-pm').value;
        const qtdStr = linha.querySelector('.pos-massa-qtd').value;
        const corretora = linha.querySelector('.pos-massa-corretora').value;

        // Validação: ignora linha se algum campo estiver vazio
        if (!ticker || !data || !pmStr || !qtdStr || !corretora) {
            continue;
        }

        // Validação: ignora linha se o ativo não estiver cadastrado
        if (!todosOsAtivos.some(a => a.ticker === ticker)) {
            alert(`O ativo "${ticker}" não está cadastrado e será ignorado. Por favor, cadastre-o primeiro na tela de "Cadastro de Ativos".`);
            continue;
        }

        const precoMedio = parseDecimal(pmStr);
        const quantidade = parseInt(qtdStr, 10);

        // Chave de agrupamento: agrupa por ativo, data e PM.
        const chave = `${ticker}|${data}|${precoMedio}`;

        // Se a chave ainda não existe no mapa, cria uma nova entrada
        if (!posicoesAgrupadas.has(chave)) {
            posicoesAgrupadas.set(chave, {
                ticker,
                data,
                precoMedio,
                posicoesPorCorretora: []
            });
        }
        
        // Adiciona a posição da corretora à entrada correspondente
        posicoesAgrupadas.get(chave).posicoesPorCorretora.push({ corretora, quantidade });
        linhasValidasCount++;
    }

    if (linhasValidasCount === 0) {
        alert('Nenhuma linha válida foi preenchida para salvar.');
        return;
    }

    // Converte os dados agrupados do mapa para o formato final de Posição Inicial
    posicoesAgrupadas.forEach(posAgrupada => {
        const novoRegistro = {
            id: Date.now() + Math.random(),
            tipoRegistro: 'SUMARIO_MANUAL',
            ticker: posAgrupada.ticker,
            data: posAgrupada.data,
            precoMedio: posAgrupada.precoMedio,
            posicoesPorCorretora: posAgrupada.posicoesPorCorretora
        };
        posicaoInicial.push(novoRegistro);
    });

    salvarPosicaoInicial();
    alert(`${posicoesAgrupadas.size} registro(s) de posição inicial salvos com sucesso, totalizando ${linhasValidasCount} linhas válidas.`);
    
    // Volta para a tela de lista
    mostrarTela('posicaoInicial');
    renderizarTabelaPosicaoInicial();
}
function salvarHistoricoAtivo(event) {
    event.preventDefault();
    const ticker = document.getElementById('historico-ativo-selecionado').textContent;
    const linhas = document.querySelectorAll('#tabela-historico-body tr');
    const registrosTemporarios = [];
    let linhasIncompletasEncontradas = false;

    for (const linha of linhas) {
        const data = linha.querySelector('.hist-data').value;
        const transacao = linha.querySelector('.hist-transacao').value;
        const quantidade = linha.querySelector('.hist-qtd').value;
        const corretora = linha.querySelector('.hist-corretora').value;
        const precoMedio = linha.querySelector('.hist-pm').value;

        const todosVazios = !data && !transacao && !quantidade && !corretora && !precoMedio;
        const todosPreenchidos = data && transacao && quantidade && corretora && precoMedio;

        if (todosVazios) continue;

        if (!todosPreenchidos) {
            linhasIncompletasEncontradas = true;
            continue; 
        }

        registrosTemporarios.push({ data, transacao, quantidade, corretora, precoMedio });
    }

    if (linhasIncompletasEncontradas) {
        if (!confirm('Existem linhas com preenchimento incompleto. Deseja salvar mesmo assim, descartando as linhas incompletas?')) {
            alert('Ação cancelada. Por favor, complete todas as linhas ou remova as que não deseja salvar.');
            return;
        }
    }
    
    if (registrosTemporarios.length === 0) {
        alert('Nenhuma linha completamente preenchida para salvar.');
        return;
    }

    registrosTemporarios.sort((a, b) => new Date(a.data) - new Date(b.data));

    let newCount = 0;
    let updatedCount = 0;

    registrosTemporarios.forEach(reg => {
        const quantidadeInt = parseInt(reg.quantidade);
        
        const indexExistente = posicaoInicial.findIndex(p =>
            p.tipoRegistro === 'TRANSACAO_HISTORICA' &&
            p.ticker === ticker &&
            p.data === reg.data &&
            p.transacao === reg.transacao &&
            p.quantidade === quantidadeInt &&
            p.corretora === reg.corretora
        );

        if (indexExistente > -1) {
            posicaoInicial[indexExistente].precoMedio = parseDecimal(reg.precoMedio);
            updatedCount++;
        } else {
            const novoRegistroCompleto = {
                id: Date.now() + Math.random(),
                tipoRegistro: 'TRANSACAO_HISTORICA',
                ticker: ticker,
                data: reg.data,
                transacao: reg.transacao,
                quantidade: quantidadeInt,
                corretora: reg.corretora,
                precoMedio: parseDecimal(reg.precoMedio)
            };
            posicaoInicial.push(novoRegistroCompleto);
            newCount++;
        }
    });

    salvarPosicaoInicial();
    alert(`${newCount} novo(s) registo(s) de histórico salvos e ${updatedCount} registo(s) atualizados com sucesso!`);
    
    cancelarAdicaoHistorico();
    renderizarTabelaPosicaoInicial();

    if (confirm("Histórico salvo com sucesso!\n\nDeseja recalcular e sincronizar todos os registos agora para garantir a consistência dos proventos e outros dados?")) {
        sincronizarTodosOsRegistros();
    }
}
