// Accounts and Currencies // Contas e Moedas
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
function abrirModalCadastroConta(contaParaEditar = null, tipoItem = 'conta') {
    const form = document.getElementById('form-cadastro-conta');
    form.reset();
    const tituloModal = document.getElementById('modal-conta-titulo');
    
    // Reseta o estado do modal
    const moedaSelect = document.getElementById('conta-moeda');
    moedaSelect.value = 'BRL';
    
    // Lógica para popular o Dropdown de Bancos DINAMICAMENTE
    const bancoSelect = document.getElementById('conta-banco');
    
    // 1. Pega a lista de bancos já utilizados em contas ativas
    const bancosExistentes = new Set(getTodasInstituicoesAtivas());
    
    // 2. Se estiver editando, garante que o banco atual da conta esteja na lista (mesmo se for único ou de conta inativa)
    if (contaParaEditar && contaParaEditar.banco) {
        bancosExistentes.add(contaParaEditar.banco);
    }

    // 3. Ordena e cria o HTML
    const bancosOrdenados = Array.from(bancosExistentes).sort();
    let optionsHtml = '<option value="">Selecione...</option>';
    
    bancosOrdenados.forEach(b => {
        optionsHtml += `<option value="${b}">${b}</option>`;
    });
    
    // 4. Adiciona a opção de criar novo
    optionsHtml += '<option value="Adicionar" style="font-weight: bold; color: var(--accent-color);">+ Adicionar Novo</option>';
    
    bancoSelect.innerHTML = optionsHtml;

    // Dispara evento para garantir que a interface (campos BRL vs Moeda) esteja correta
    moedaSelect.dispatchEvent(new Event('change'));

    if (contaParaEditar) {
        tituloModal.textContent = 'Editar Conta / Ativo em Moeda';
        document.getElementById('conta-id').value = contaParaEditar.id;
        document.getElementById('conta-tipo-original').value = tipoItem;

        const moeda = contaParaEditar.moeda || (tipoItem === 'conta' ? 'BRL' : '');
        moedaSelect.value = moeda;
        
        if (moeda === 'BRL') {
            // Verifica se o banco da conta está na lista gerada
            const isBancoNaLista = Array.from(bancoSelect.options).some(opt => opt.value === contaParaEditar.banco);
            
            if (isBancoNaLista) {
                bancoSelect.value = contaParaEditar.banco;
                document.getElementById('container-outro-banco').style.display = 'none';
            } else {
                // Fallback caso algo muito atípico ocorra
                bancoSelect.value = 'Adicionar'; 
                document.getElementById('container-outro-banco').style.display = 'block'; 
                document.getElementById('conta-outro-banco').value = contaParaEditar.banco; 
            }

            document.getElementById('conta-tipo').value = contaParaEditar.tipo;
            document.getElementById('conta-numero-banco').value = contaParaEditar.numeroBanco;
            document.getElementById('conta-agencia').value = contaParaEditar.agencia;
            document.getElementById('conta-numero').value = contaParaEditar.numero;
            document.getElementById('conta-pix').value = contaParaEditar.pix;
        } else {
            document.getElementById('conta-nome-ativo').value = contaParaEditar.nomeAtivo;
        }
        
        document.getElementById('conta-saldo-inicial').value = formatarDecimalParaInput(contaParaEditar.saldoInicial);
        document.getElementById('conta-data-saldo-inicial').value = contaParaEditar.dataSaldoInicial;
        document.getElementById('conta-notas').value = contaParaEditar.notas || '';
        
        moedaSelect.disabled = true; 
    } else {
        tituloModal.textContent = 'Cadastrar Nova Conta / Ativo em Moeda';
        document.getElementById('conta-id').value = '';
        document.getElementById('conta-tipo-original').value = '';
        document.getElementById('conta-data-saldo-inicial').value = new Date().toISOString().split('T')[0];
        moedaSelect.disabled = false;
        
        document.getElementById('container-outro-banco').style.display = 'none';
    }

    moedaSelect.dispatchEvent(new Event('change'));
    abrirModal('modal-cadastro-conta');
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

function calcularSaldoEmData(conta, dataLimite) {
    if (!dataLimite) return 0;
    const todosOsEventos = obterTodosOsEventosDeCaixa();
    const eventosFiltrados = todosOsEventos.filter(e =>
        e.tipo === 'conta' &&
        String(e.idAlvo) === String(conta.id) &&
        e.source !== 'recorrente_futura' && // Ignora lançamentos futuros não confirmados
        new Date(e.data + 'T12:00:00') <= new Date(dataLimite + 'T12:00:00') &&
        new Date(e.data + 'T12:00:00') >= new Date(conta.dataSaldoInicial + 'T12:00:00')
    );

    // Começa com o saldo inicial e soma cada evento, arredondando-o antes da soma.
    const saldoFinal = eventosFiltrados.reduce((acc, evento) => {
        return acc + arredondarMoeda(evento.valor);
    }, conta.saldoInicial);
    
    return arredondarMoeda(saldoFinal); // Retorna o saldo final também arredondado.
}
function calcularSaldoProjetado(item, dataLimite, tipoItem = 'conta') {
    if (!item || !dataLimite) return 0;
    
    const todosOsEventos = obterTodosOsEventosDeCaixa();
    const hojeStr = new Date().toISOString().split('T')[0];
    const transacoesAtuaisEPassadas = todosOsEventos.filter(e =>
        e.tipo === tipoItem &&
        String(e.idAlvo) === String(item.id) &&
        e.source !== 'recorrente_futura' &&
        new Date(e.data + 'T12:00:00') <= new Date(hojeStr + 'T12:00:00') &&
        new Date(e.data + 'T12:00:00') >= new Date(item.dataSaldoInicial + 'T12:00:00')
    );
    const saldoAtual = transacoesAtuaisEPassadas.reduce((acc, t) => acc + arredondarMoeda(t.valor), item.saldoInicial);
    const eventosFuturosFiltrados = todosOsEventos.filter(e => 
        e.tipo === tipoItem &&
        String(e.idAlvo) === String(item.id) &&
        new Date(e.data + 'T12:00:00') > new Date(hojeStr + 'T12:00:00') && // Data maior que hoje
        new Date(e.data + 'T12:00:00') <= new Date(dataLimite + 'T12:00:00') // Data até o limite da projeção
    );
    const saldoProjetado = eventosFuturosFiltrados.reduce((acc, t) => acc + arredondarMoeda(t.valor), saldoAtual);
    
    return arredondarMoeda(saldoProjetado);
}

async function deletarMovimentacao(id, tipoAlvo) {
    const movIndex = todasAsMovimentacoes.findIndex(m => m.id === id);
    if (movIndex === -1) return;

    const movimentacao = todasAsMovimentacoes[movIndex];
    let confirmMessage = 'Tem certeza que deseja excluir esta movimentação?';
    
    // --- INÍCIO DA LÓGICA DE CORREÇÃO (EXCLUSÃO) ---
    const idsParaExcluirLocalmente = new Set();
    const idsParaExcluirRemotamente = new Set();
    
    idsParaExcluirLocalmente.add(movimentacao.id);
    if (movimentacao.idLancamentoCasa) {
        idsParaExcluirRemotamente.add(movimentacao.idLancamentoCasa);
    }

    if (movimentacao.transferenciaId) {
        confirmMessage = 'Esta é uma movimentação de transferência. Excluir este lançamento também excluirá o lançamento correspondente na outra conta/ativo. Deseja continuar?';
        
        const idPar = movimentacao.transferenciaId;
        const movimentacaoPar = todasAsMovimentacoes.find(m => m.id === idPar);
        
        if (movimentacaoPar) {
            idsParaExcluirLocalmente.add(movimentacaoPar.id);
            if (movimentacaoPar.idLancamentoCasa) {
                idsParaExcluirRemotamente.add(movimentacaoPar.idLancamentoCasa);
            }
        }
    }
    // --- FIM DA LÓGICA DE CORREÇÃO (EXCLUSÃO) ---

    if (confirm(confirmMessage)) {
        // Lógica de Sincronização de Exclusão com Finanças da Casa
        if (currentUser && idCasaAssociada && idsParaExcluirRemotamente.size > 0) {
            try {
                const { doc, deleteDoc, writeBatch } = window.dbFunctions;
                const batch = writeBatch(window.db);
                
                idsParaExcluirRemotamente.forEach(idRemoto => {
                    const docRef = doc(window.db, "Casas", idCasaAssociada, "Lancamentos", idRemoto);
                    batch.delete(docRef);
                });
                
                await batch.commit();
                console.log(`${idsParaExcluirRemotamente.size} lançamento(s) correspondente(s) excluído(s) do Sistema de Finanças.`);
            } catch (error) {
                console.error("Erro ao excluir lançamento(s) do Sistema de Finanças:", error);
                alert("Não foi possível excluir o(s) lançamento(s) correspondente(s) no sistema de finanças. A exclusão local foi cancelada para manter a consistência.");
                return; // Aborta a exclusão local se a remota falhar
            }
        }

        // Remove todos os IDs locais marcados (seja 1 ou 2)
        todasAsMovimentacoes = todasAsMovimentacoes.filter(m => !idsParaExcluirLocalmente.has(m.id));
        
        await salvarMovimentacoes();
        
        // Atualiza a tela visível
        if (telas.caixaGlobal.style.display === 'block') {
            renderizarTelaCaixaGlobal(true);
        }
    }
}
function obterTodosOsEventosDeCaixa() {
    const eventos = [];

    // 1. Processa todas as movimentações já unificadas
    todasAsMovimentacoes.forEach(mov => {
        // --- CORREÇÃO AQUI ---
        // Alterado para NÃO filtrar mais 'provento' e 'provento_editado'
        if (mov.source !== 'nota') { 
            eventos.push({
                id: mov.id,
                data: mov.data,
                valor: mov.valor,
                descricao: mov.descricao,
                tipo: mov.tipoAlvo,
                idAlvo: String(mov.idAlvo),
                moeda: mov.moeda,
                source: mov.source,
                sourceId: mov.sourceId, // Mantém para rastreabilidade
                transferenciaId: mov.transferenciaId,
                enviarParaFinancas: mov.enviarParaFinancas // <-- Propriedade mantida
            });
        }
        // --- FIM DA CORREÇÃO ---
    });

    // 2. Lançamentos de Notas de Negociação (Gerados a partir da fonte original)
    todasAsNotas.forEach(n => {
        if (!n.data) return;
        const contaInvestimento = todasAsContas.find(c => c.banco === n.corretora && c.tipo === 'Conta Investimento');
        if (contaInvestimento) {
            const totalCompras = n.operacoes.filter(op => op.tipo === 'compra').reduce((acc, op) => acc + op.valor, 0);
            const totalVendas = n.operacoes.filter(op => op.tipo === 'venda').reduce((acc, op) => acc + op.valor, 0);
            const valorLiquido = arredondarMoeda(totalVendas - totalCompras - (n.custos || 0) - (n.irrf || 0));
            
            if (valorLiquido !== 0) {
                const dataLiquidacao = calcularDataLiquidacao(n.data, 2).toISOString().split('T')[0];
                const dataFormatadaNota = new Date(n.data + 'T12:00:00').toLocaleDateString('pt-BR');
                eventos.push({
                    id: `nota_${n.id}`,
                    data: dataLiquidacao,
                    valor: valorLiquido,
                    descricao: `Liq. Nota Neg. ${n.corretora} nro. ${n.numero} de ${dataFormatadaNota}`,
                    tipo: 'conta',
                    idAlvo: String(contaInvestimento.id),
                    moeda: 'BRL',
                    source: 'nota'
                });
            }
        }
    });

    // --- CORREÇÃO: O LOOP DE PROVENTOS ABAIXO FOI REMOVIDO ---
    // (O loop que começava com "todosOsProventos.forEach(p => { ... })" foi excluído)

    // 4. Lançamentos Recorrentes (gerados pela função filho)
    gerarTransacoesFilhas().forEach(filha => {
        let eventoRecorrente = {
            id: filha.id,
            data: filha.data,
            valor: filha.valor,
            descricao: filha.descricao,
            tipo: filha.targetType,
            idAlvo: String(filha.targetId),
            source: 'recorrente_futura',
            maeId: filha.sourceId
        };
        if (filha.targetType === 'moeda') {
            const ativoMoeda = todosOsAtivosMoedas.find(a => String(a.id) === String(filha.targetId));
            eventoRecorrente.moeda = ativoMoeda ? ativoMoeda.moeda : '';
        } else {
            eventoRecorrente.moeda = 'BRL';
        }
        eventos.push(eventoRecorrente);
    });

    return eventos;
}
function gerarTransacoesFilhas() {
    const transacoesGeradas = [];

    todasAsTransacoesRecorrentes.forEach(mae => {
        if (!mae.dataInicio || !mae.recorrencia || !mae.termino) return;

        let ocorrenciasGeradas = 0;
        let dataCandidata = new Date(mae.dataInicio + 'T12:00:00');

        if (mae.recorrencia.frequencia === 'mensal') {
            const diaDaRegra = mae.recorrencia.dia;
            dataCandidata.setDate(1); // Reseta para o primeiro dia do mês para evitar bugs de virada de mês
            dataCandidata.setDate(diaDaRegra);
            
            // Ajuste para o último dia do mês, se necessário
            if (dataCandidata.getMonth() !== new Date(mae.dataInicio + 'T12:00:00').getMonth()) {
                 dataCandidata = new Date(dataCandidata.getFullYear(), dataCandidata.getMonth(), 0, 12, 0, 0);
            }
        }
        
        while (true) {
            if (ocorrenciasGeradas >= 240) { // Limite de segurança
                console.warn(`Regra de recorrência para "${mae.descricao}" excedeu o limite de 240 ocorrências e foi interrompida.`);
                break;
            }
            if (mae.termino.tipo === 'data' && dataCandidata > new Date(mae.termino.valor + 'T12:00:00')) {
                break;
            }
            if (mae.termino.tipo === 'ocorrencias' && (ocorrenciasGeradas + (mae.datasProcessadas?.length || 0)) >= mae.termino.valor) {
                break;
            }

            const dataCandidataStr = dataCandidata.toISOString().split('T')[0];

            // Apenas gera a "filha" se ela ainda não foi confirmada/pulada
            if (!mae.datasProcessadas || !mae.datasProcessadas.includes(dataCandidataStr)) {
                const filha = {
                    id: `${mae.id}_${dataCandidataStr}`,
                    data: dataCandidataStr,
                    descricao: `(Recorrente) ${mae.descricao}`,
                    valor: mae.valor,
                    source: 'recorrente_futura',
                    sourceId: mae.id,
                    targetType: mae.targetType,
                    targetId: mae.targetId,
                    contaId: mae.targetType === 'conta' ? mae.targetId : undefined,
                    ativoMoedaId: mae.targetType === 'moeda' ? mae.targetId : undefined
                };
                transacoesGeradas.push(filha);
            }
            
            ocorrenciasGeradas++;
            
            switch (mae.recorrencia.frequencia) {
                case 'mensal':
                    const diaParaSetar = mae.recorrencia.dia;
                    dataCandidata.setMonth(dataCandidata.getMonth() + 1);
                    dataCandidata.setDate(diaParaSetar);
                     if (dataCandidata.getDate() !== diaParaSetar) {
                       dataCandidata = new Date(dataCandidata.getFullYear(), dataCandidata.getMonth() + 1, 0, 12, 0, 0);
                    }
                    break;
                case 'quinzenal':
                    dataCandidata.setDate(dataCandidata.getDate() + 14);
                    break;
                case 'semanal':
                    dataCandidata.setDate(dataCandidata.getDate() + 7);
                    break;
            }
        }
    });
    return transacoesGeradas;
}
async function executarAcaoRecorrente(idMae, dataOcorrencia, acao) {
    const maeIndex = todasAsTransacoesRecorrentes.findIndex(m => String(m.id) === String(idMae));
    if (maeIndex === -1) {
        alert('Erro [executar acao]: Regra de recorrência não encontrada.');
        return;
    }
    const mae = todasAsTransacoesRecorrentes[maeIndex];
    
    const gerarIdUnico = () => Date.now() + Math.random();

    if (!mae.datasProcessadas) {
        mae.datasProcessadas = [];
    }

    switch (acao) {
        case 'CONFIRMAR_OCORRENCIA': {
            const moedaAlvo = mae.targetType === 'moeda' ? todosOsAtivosMoedas.find(a => String(a.id) === String(mae.targetId))?.moeda : 'BRL';
            const valorFormatado = (moedaAlvo === 'BRL') ? formatarMoeda(mae.valor) : formatarMoedaEstrangeira(mae.valor, moedaAlvo);
            
            if (!confirm(`Confirmar a transação "${mae.descricao}" no valor de ${valorFormatado}?`)) return;
            
            const loadingOverlay = document.getElementById('loading-overlay');
            loadingOverlay.style.display = 'flex';

            try {
                // A intenção é sempre 'true' para recorrentes confirmados.
                const enviarParaFinancas = true;
                let casaDocId = null;

                // O sistema verifica se PODE enviar (regras de negócio)
                const isDateValid = dataInicioIntegracaoFinancas && new Date(dataOcorrencia) >= new Date(dataInicioIntegracaoFinancas);
                if (enviarParaFinancas && isDateValid) {
                    casaDocId = await enviarLancamentoParaFinancas({
                        descricao: `⇄ ${mae.descricao}`,
                        data: dataOcorrencia,
                        valor: mae.valor,
                        moeda: moedaAlvo,
                        tipoOrigem: 'recorrente',
                        idOrigem: mae.id
                    });
                }
                
                const novaMovimentacao = {
                    id: gerarIdUnico(),
                    data: dataOcorrencia,
                    descricao: mae.descricao,
                    valor: mae.valor,
                    tipoAlvo: mae.targetType,
                    idAlvo: mae.targetId,
                    moeda: moedaAlvo,
                    source: 'recorrente_confirmada',
                    sourceId: mae.id,
                    transferenciaId: null,
                    enviarParaFinancas: enviarParaFinancas, // Salva a INTENÇÃO
                    idLancamentoCasa: casaDocId || null     // Salva a CONSEQUÊNCIA
                };
                todasAsMovimentacoes.push(novaMovimentacao);

                const maeAtualizada = { ...mae, datasProcessadas: [...mae.datasProcessadas, dataOcorrencia] };
                todasAsTransacoesRecorrentes[maeIndex] = maeAtualizada;

                await Promise.all([salvarMovimentacoes(), salvarTransacoesRecorrentes()]);
                
                alert('Transação confirmada com sucesso!');

            } catch (error) {
                console.error("Erro ao confirmar recorrência:", error);
                alert("Ocorreu um erro ao processar a transação. Verifique o console para mais detalhes.");
            } finally {
                loadingOverlay.style.display = 'none';
                if (telas.caixaGlobal.style.display === 'block') {
                    renderizarTelaCaixaGlobal(true);
                }
                if (modalProjecaoFutura.style.display === 'block') {
                    renderizarModalProjecaoFutura();
                }
            }
            break;
        }
        case 'EDITAR_OCORRENCIA': {
            const transacaoTemporaria = {
                descricao: mae.descricao,
                data: dataOcorrencia,
                valor: mae.valor,
                targetType: mae.targetType,
                targetId: mae.targetId,
                sourceMaeId: mae.id,
                sourceOcorrenciaData: dataOcorrencia
            };
            abrirModalNovaTransacaoMoeda(transacaoTemporaria);
            break;
        }
        case 'EDITAR_SERIE':
            abrirModalNovaTransacaoMoeda(mae);
            break;
        case 'EXCLUIR_SERIE':
            if (confirm(`Você tem certeza que deseja excluir PERMANENTEMENTE a regra de recorrência "${mae.descricao}"?`)) {
                todasAsTransacoesRecorrentes.splice(maeIndex, 1);
                await salvarTransacoesRecorrentes();
                alert('Regra de recorrência excluída com sucesso.');
                if (telas.caixaGlobal.style.display === 'block') {
                    renderizarTelaCaixaGlobal(true);
                }
                if (modalProjecaoFutura.style.display === 'block') {
                    renderizarModalProjecaoFutura();
                }
            }
            break;
        case 'PULAR_OCORRENCIA':
             if (confirm('Tem certeza que deseja pular esta ocorrência? Ela não será mais exibida.')) {
                mae.datasProcessadas.push(dataOcorrencia);
                await salvarTransacoesRecorrentes();
                alert('Ocorrência pulada com sucesso.');
                if(telas.caixaGlobal.style.display === 'block') {
                    renderizarTelaCaixaGlobal(true);
                }
                if (modalProjecaoFutura.style.display === 'block') {
                    renderizarModalProjecaoFutura();
                }
            }
            break;
    }
}
async function salvarMovimentacaoUniversal(event) {
    event.preventDefault(); 

    const saveButton = event.target.querySelector('button[type="submit"]');
    const originalButtonText = saveButton.innerHTML;
    saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    saveButton.disabled = true;

    try {
        const id = document.getElementById('transacao-moeda-id').value;
        const transferenciaId = document.getElementById('transacao-moeda-transferencia-id').value;
        const sourceMaeId = document.getElementById('transacao-moeda-source-mae-id').value;
        const sourceOcorrenciaData = document.getElementById('transacao-moeda-source-ocorrencia-data').value;
        
        const data = document.getElementById('transacao-moeda-data').value;
        const descricao = document.getElementById('transacao-moeda-descricao').value;
        const valorDebito = parseDecimal(document.getElementById('transacao-moeda-valor-debito').value);
        const enviarParaFinancas = document.getElementById('enviar-para-financas-casa').checked;

        const tipoLancamento = document.querySelector('input[name="tipo-transacao-moeda"]:checked').value;

        if (tipoLancamento === 'recorrente') {
            // --- LÓGICA PARA SALVAR UMA REGRA DE RECORRÊNCIA ---
            const tipoMovimento = document.getElementById('transacao-moeda-tipo-recorrente').value;
            const valorFinal = tipoMovimento === 'saida' ? -valorDebito : valorDebito;
            const idAlvoCompleto = document.getElementById('transacao-moeda-ativo-recorrente').value;
            
            if (!idAlvoCompleto) {
                alert('Você deve selecionar um Ativo (Conta ou Moeda) para a recorrência.');
                return;
            }
            
            const [tipoAlvoPrefix, idAlvo] = idAlvoCompleto.split('_');
            const targetType = tipoAlvoPrefix === 'brl' ? 'conta' : 'moeda';

            const frequencia = document.getElementById('recorrencia-moeda-frequencia').value;
            const dia = (frequencia === 'mensal') ? parseInt(document.getElementById('recorrencia-moeda-dia-mes').value) : parseInt(document.getElementById('recorrencia-moeda-dia-semana').value);
            
            const tipoTermino = document.querySelector('input[name="tipo-termino-moeda"]:checked').value;
            const valorTermino = (tipoTermino === 'ocorrencias') ? parseInt(document.getElementById('termino-moeda-ocorrencias-valor').value) : document.getElementById('termino-moeda-data-valor').value;

            const regra = {
                id: id ? parseFloat(id) : Date.now(),
                descricao: descricao,
                valor: valorFinal,
                dataInicio: data,
                targetType: targetType,
                targetId: idAlvo,
                recorrencia: { frequencia: frequencia, dia: dia },
                termino: { tipo: tipoTermino, valor: valorTermino },
                datasProcessadas: id ? todasAsTransacoesRecorrentes.find(m => m.id === parseFloat(id))?.datasProcessadas || [] : []
            };

            const index = todasAsTransacoesRecorrentes.findIndex(m => m.id === regra.id);
            if (index > -1) {
                todasAsTransacoesRecorrentes[index] = regra;
            } else {
                todasAsTransacoesRecorrentes.push(regra);
            }
            await salvarTransacoesRecorrentes();

        } else {
            // --- LÓGICA PARA SALVAR LANÇAMENTO ÚNICO OU TRANSFERÊNCIA ---
            const debitoSelectValue = document.getElementById('transacao-moeda-conta-debito').value;
            const creditoSelectValue = document.getElementById('transacao-moeda-conta-credito').value;
            
            if (!debitoSelectValue && !creditoSelectValue) {
                alert('Você deve selecionar uma conta de débito ou crédito.');
                return;
            }

            const isTransferencia = debitoSelectValue && creditoSelectValue;

            if (isTransferencia) {
                // --- Salvar Transferência ---
                const [tipoDebitoPrefix, idDebito] = debitoSelectValue.split('_');
                const [tipoCreditoPrefix, idCredito] = creditoSelectValue.split('_');
                const tipoAlvoDebito = tipoDebitoPrefix === 'brl' ? 'conta' : 'moeda';
                const tipoAlvoCredito = tipoCreditoPrefix === 'brl' ? 'conta' : 'moeda';
                const itemDebito = (tipoAlvoDebito === 'conta' ? todasAsContas : todosOsAtivosMoedas).find(c => String(c.id) === idDebito);
                const itemCredito = (tipoAlvoCredito === 'conta' ? todasAsContas : todosOsAtivosMoedas).find(c => String(c.id) === idCredito);
                const valorCredito = parseDecimal(document.getElementById('transacao-moeda-valor-credito').value) || valorDebito;
                
                // --- INÍCIO DA CORREÇÃO (DESCRIÇÃO) ---
                // Usa a descrição digitada, ou cria uma padrão se estiver vazia.
                const descFinal = descricao || `Transf. entre ${itemDebito.nomeAtivo || itemDebito.banco} e ${itemCredito.nomeAtivo || itemCredito.banco}`;
                // --- FIM DA CORREÇÃO (DESCRIÇÃO) ---

                const idTransferenciaBase = id ? parseFloat(id) : Date.now(); // Usa o ID do débito como base
                const idCreditoDaBase = transferenciaId ? parseFloat(transferenciaId) : idTransferenciaBase + 1;

                // --- INÍCIO DA CORREÇÃO (EDIÇÃO) ---
                // Remove movimentações antigas (ambos os lados) se estiver editando
                if (id) {
                    const idDebitoAntigo = parseFloat(id);
                    const idCreditoAntigo = parseFloat(transferenciaId);
                    todasAsMovimentacoes = todasAsMovimentacoes.filter(m => m.id !== idDebitoAntigo && m.id !== idCreditoAntigo);
                }
                // --- FIM DA CORREÇÃO (EDIÇÃO) ---

                const movDebito = {
                    id: idTransferenciaBase, data: data, tipoAlvo: tipoAlvoDebito, idAlvo: idDebito,
                    moeda: itemDebito.moeda || 'BRL', 
                    // --- CORREÇÃO (DESCRIÇÃO) ---
                    descricao: descFinal,
                    // --- FIM DA CORREÇÃO ---
                    valor: -valorDebito, source: 'manual', transferenciaId: idCreditoDaBase,
                    enviarParaFinancas: false, idLancamentoCasa: null
                };
                const movCredito = {
                    id: idCreditoDaBase, data: data, tipoAlvo: tipoAlvoCredito, idAlvo: idCredito,
                    moeda: itemCredito.moeda || 'BRL', 
                    // --- CORREÇÃO (DESCRIÇÃO) ---
                    descricao: descFinal,
                    // --- FIM DA CORREÇÃO ---
                    valor: valorCredito, source: 'manual', transferenciaId: idTransferenciaBase,
                    enviarParaFinancas: false, idLancamentoCasa: null
                };
                todasAsMovimentacoes.push(movDebito, movCredito);

            } else {
                // --- Salvar Lançamento Único ---
                const valorFinal = debitoSelectValue ? -valorDebito : valorDebito;
                const idAlvoCompleto = debitoSelectValue || creditoSelectValue;
                const [tipoAlvoPrefix, idAlvo] = idAlvoCompleto.split('_');
                const tipoAlvo = tipoAlvoPrefix === 'brl' ? 'conta' : 'moeda';
                const itemAlvo = (tipoAlvo === 'conta' ? todasAsContas : todosOsAtivosMoedas).find(a => String(a.id) === idAlvo);
                const moeda = itemAlvo ? (itemAlvo.moeda || 'BRL') : 'BRL';

                let source = 'manual';
                let sourceId = null;
                if(sourceMaeId && sourceOcorrenciaData) {
                    source = 'recorrente_confirmada';
                    sourceId = parseFloat(sourceMaeId); 
                    const maeIndex = todasAsTransacoesRecorrentes.findIndex(m => String(m.id) === sourceMaeId);
                    if (maeIndex > -1) {
                        if (!todasAsTransacoesRecorrentes[maeIndex].datasProcessadas) {
                            todasAsTransacoesRecorrentes[maeIndex].datasProcessadas = [];
                        }
                        // Adiciona a data apenas se ela não existir (evita duplicatas ao re-salvar)
                        if (!todasAsTransacoesRecorrentes[maeIndex].datasProcessadas.includes(sourceOcorrenciaData)) {
                             todasAsTransacoesRecorrentes[maeIndex].datasProcessadas.push(sourceOcorrenciaData);
                             await salvarTransacoesRecorrentes();
                        }
                    }
                }

                const movimentacao = {
                    id: id ? parseFloat(id) : Date.now(), data: data, tipoAlvo: tipoAlvo,
                    idAlvo: idAlvo, moeda: moeda, descricao: descricao, valor: valorFinal,
                    source: source, sourceId: sourceId,
                    enviarParaFinancas: enviarParaFinancas,
                    idLancamentoCasa: id ? todasAsMovimentacoes.find(m => m.id === parseFloat(id))?.idLancamentoCasa : null
                };

                const idCasa = await sincronizarLancamentoFinancasCasa(movimentacao, enviarParaFinancas);
                movimentacao.idLancamentoCasa = idCasa;

                if (id) {
                    const index = todasAsMovimentacoes.findIndex(m => m.id === movimentacao.id);
                    if (index > -1) todasAsMovimentacoes[index] = movimentacao;
                } else {
                    todasAsMovimentacoes.push(movimentacao);
                }
            }
        }
        
        await salvarMovimentacoes();
        fecharModal('modal-nova-transacao-moeda');
        
        if (telas.caixaGlobal.style.display === 'block') {
            renderizarTelaCaixaGlobal(true);
        }
        if (modalProjecaoFutura.style.display === 'block') {
            renderizarModalProjecaoFutura();
        }

    } catch (error) {
        console.error("Erro ao salvar movimentação universal:", error);
        alert("Ocorreu um erro ao salvar: " + error.message);
    } finally {
        saveButton.innerHTML = originalButtonText;
        saveButton.disabled = false;
    }
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
const setupUniversalTransactionModal = () => {
    const debitoSelect = document.getElementById('transacao-moeda-conta-debito');
    const creditoSelect = document.getElementById('transacao-moeda-conta-credito');
    const valorCreditoContainer = document.getElementById('container-valor-credito');
    const simboloDebito = document.getElementById('transacao-moeda-simbolo-debito');
    const simboloCredito = document.getElementById('transacao-moeda-simbolo-credito');
    const infoCambio = document.getElementById('info-cambio');
    const valorCreditoInput = document.getElementById('transacao-moeda-valor-credito');
    const valorDebitoInput = document.getElementById('transacao-moeda-valor-debito');
    const labelValor = document.querySelector('#form-nova-transacao-moeda label[for="transacao-moeda-valor-debito"]');

    const getMoedaInfo = (value) => {
        if (!value) return { tipo: null, moeda: 'BRL' };
        const [tipo, id] = value.split('_');
        if (tipo === 'brl') return { tipo: 'brl', moeda: 'BRL' };
        const ativo = todosOsAtivosMoedas.find(a => a.id == id);
        return { tipo: 'moeda', moeda: ativo ? ativo.moeda : '???' };
    };

    const getSimbolo = (moeda) => {
        switch(moeda) {
            case 'USD': return '$';
            case 'EUR': return '€';
            case 'GBP': return '£';
            default: return 'R$';
        }
    };

    const updateUI = () => {
        const isEditing = document.getElementById('transacao-moeda-transferencia-id').value !== '';
        const infoDebito = getMoedaInfo(debitoSelect.value);
        const infoCredito = getMoedaInfo(creditoSelect.value);

        labelValor.textContent = 'Valor do Lançamento';
        if (debitoSelect.value) {
            simboloDebito.textContent = getSimbolo(infoDebito.moeda);
            simboloDebito.style.display = 'inline';
        } else if (creditoSelect.value) {
            simboloDebito.textContent = getSimbolo(infoCredito.moeda);
            simboloDebito.style.display = 'inline';
        } else {
            simboloDebito.textContent = '';
            simboloDebito.style.display = 'none';
        }
        if (debitoSelect.value && creditoSelect.value) {
            labelValor.textContent = 'Valor do Débito';
        }
        
        simboloCredito.textContent = getSimbolo(infoCredito.moeda);

        if (infoDebito.moeda !== infoCredito.moeda && debitoSelect.value && creditoSelect.value) {
            valorCreditoContainer.style.display = 'block';
            const cotacaoDebito = infoDebito.moeda === 'BRL' ? 1 : (dadosMoedas.cotacoes[infoDebito.moeda] || 0);
            const cotacaoCredito = infoCredito.moeda === 'BRL' ? 1 : (dadosMoedas.cotacoes[infoCredito.moeda] || 0);
            
            if (cotacaoCredito > 0 && cotacaoDebito > 0) {
                const valorDebitoEmBRL = parseDecimal(valorDebitoInput.value) * cotacaoDebito;
                
                if (!isEditing) {
                    const valorCreditoSugerido = parseFloat((valorDebitoEmBRL / cotacaoCredito).toFixed(2));
                    if(document.activeElement !== valorCreditoInput) {
                        valorCreditoInput.value = formatarDecimalParaInput(valorCreditoSugerido);
                    }
                }

                infoCambio.textContent = `Cotação Sugerida: 1 ${infoDebito.moeda} ≈ ${formatarMoedaEstrangeira(cotacaoDebito / cotacaoCredito, infoCredito.moeda)}`;
            } else {
                 infoCambio.textContent = `Cotação para ${infoCredito.moeda} ou ${infoDebito.moeda} não encontrada.`;
            }

        } else {
            valorCreditoContainer.style.display = 'none';
            valorCreditoInput.value = '';
            infoCambio.textContent = '';
        }
    };

    debitoSelect.addEventListener('change', updateUI);
    creditoSelect.addEventListener('change', updateUI);
    valorDebitoInput.addEventListener('input', updateUI);
};
function deletarAtivoMoeda(id) {
    if (confirm('Tem certeza que deseja excluir este ativo e todas as suas movimentações? Esta ação é irreversível.')) {
        todosOsAtivosMoedas = todosOsAtivosMoedas.filter(a => String(a.id) !== String(id));
        // Agora filtra o array unificado
        todasAsMovimentacoes = todasAsMovimentacoes.filter(t => !(t.tipoAlvo === 'moeda' && String(t.idAlvo) === String(id)));
        
        salvarAtivosMoedas();
        salvarMovimentacoes();
        
        // --- INÍCIO DA ALTERAÇÃO ---
        // Substitui a chamada da função obsoleta pela correta
        if (telas.caixaGlobal.style.display === 'block') {
            renderizarTelaCaixaGlobal(true); // O 'true' mantém o estado minimizado das colunas
        }
        // Adiciona uma verificação para a tela de cadastros também
        if (telas.cadastroContas.style.display === 'block') {
            renderizarTabelaContas();
        }
        // --- FIM DA ALTERAÇÃO ---
    }
}

function abrirModalNovaTransacaoMoeda(transacaoOuRegra = null) {
    const form = document.getElementById('form-nova-transacao-moeda');
    form.reset();
    popularDropdownsUniversais('transacao-moeda-conta-debito', 'transacao-moeda-conta-credito');
    popularDropdownAtivoRecorrente(); 

    document.getElementById('modal-transacao-moeda-titulo').textContent = 'Nova Movimentação';
    document.getElementById('transacao-moeda-id').value = '';
    document.getElementById('transacao-moeda-transferencia-id').value = '';
    document.getElementById('transacao-moeda-source-mae-id').value = '';
    document.getElementById('transacao-moeda-source-ocorrencia-data').value = '';
    document.getElementById('transacao-moeda-data').value = new Date().toISOString().split('T')[0];
    
    document.getElementById('tipo-transacao-moeda-unica').checked = true;
    document.getElementById('tipo-transacao-moeda-unica').dispatchEvent(new Event('change'));

    const containerCheckbox = document.getElementById('container-integracao-financas');
    const checkboxFinancas = document.getElementById('enviar-para-financas-casa');
    checkboxFinancas.checked = false;
    containerCheckbox.style.display = 'block';

    if (transacaoOuRegra) {
        if (transacaoOuRegra.recorrencia) { 
            // Lógica para editar REGRAS RECORRENTES (que não é uma transferência)
            const regra = transacaoOuRegra;
            document.getElementById('modal-transacao-moeda-titulo').textContent = 'Editar Movimentação Recorrente';
            document.getElementById('transacao-moeda-id').value = regra.id;
            const tipoRecorrenteRadio = document.getElementById('tipo-transacao-moeda-recorrente');
            tipoRecorrenteRadio.checked = true;
            tipoRecorrenteRadio.dispatchEvent(new Event('change'));
            const proximaOcorrencia = gerarTransacoesFilhas().find(f => String(f.sourceId) === String(regra.id));
            document.getElementById('transacao-moeda-data').value = proximaOcorrencia ? proximaOcorrencia.data : regra.dataInicio;
            document.getElementById('transacao-moeda-data').previousElementSibling.textContent = 'Data do Próximo Lançamento';
            document.getElementById('transacao-moeda-descricao').value = regra.descricao;
            document.getElementById('transacao-moeda-valor-debito').value = formatarDecimalParaInput(Math.abs(regra.valor));
            document.getElementById('transacao-moeda-tipo-recorrente').value = regra.valor > 0 ? 'entrada' : 'saida';
            const targetPrefix = regra.targetType === 'conta' ? 'brl_' : 'moeda_';
            document.getElementById('transacao-moeda-ativo-recorrente').value = `${targetPrefix}${regra.targetId}`;
            document.getElementById('recorrencia-moeda-frequencia').value = regra.recorrencia.frequencia;
            document.getElementById('recorrencia-moeda-frequencia').dispatchEvent(new Event('change'));
            if (regra.recorrencia.frequencia === 'mensal') {
                document.getElementById('recorrencia-moeda-dia-mes').value = regra.recorrencia.dia;
            } else {
                document.getElementById('recorrencia-moeda-dia-semana').value = regra.recorrencia.dia;
            }
            const tipoTerminoRadio = document.querySelector(`input[name="tipo-termino-moeda"][value="${regra.termino.tipo}"]`);
            if(tipoTerminoRadio) {
                tipoTerminoRadio.checked = true;
                tipoTerminoRadio.dispatchEvent(new Event('change'));
            }
            if (regra.termino.tipo === 'ocorrencias') {
                document.getElementById('termino-moeda-ocorrencias-valor').value = regra.termino.valor;
            } else {
                document.getElementById('termino-moeda-data-valor').value = regra.termino.valor;
            }
            containerCheckbox.style.display = 'none';
        
        } else if (transacaoOuRegra.sourceMaeId) { 
            // Lógica para editar UMA OCORRÊNCIA de uma regra recorrente
            const ocorrencia = transacaoOuRegra;
            document.getElementById('modal-transacao-moeda-titulo').textContent = 'Editar Ocorrência de Transação';
            document.getElementById('tipo-transacao-moeda-unica').checked = true;
            document.getElementById('tipo-transacao-moeda-unica').dispatchEvent(new Event('change'));
            document.getElementById('transacao-moeda-data').value = ocorrencia.data;
            document.getElementById('transacao-moeda-descricao').value = ocorrencia.descricao;
            document.getElementById('transacao-moeda-valor-debito').value = formatarDecimalParaInput(Math.abs(ocorrencia.valor));
            const prefixo = ocorrencia.targetType === 'conta' ? 'brl_' : 'moeda_';
            const idAlvo = `${prefixo}${ocorrencia.targetId}`;
            if (ocorrencia.valor > 0) {
                document.getElementById('transacao-moeda-conta-credito').value = idAlvo;
            } else {
                document.getElementById('transacao-moeda-conta-debito').value = idAlvo;
            }
            document.getElementById('transacao-moeda-source-mae-id').value = ocorrencia.sourceMaeId;
            document.getElementById('transacao-moeda-source-ocorrencia-data').value = ocorrencia.sourceOcorrenciaData;
            checkboxFinancas.checked = !!ocorrencia.enviarParaFinancas;
            containerCheckbox.style.display = 'block';

        } else if (transacaoOuRegra.transferenciaId) { 
            // --- INÍCIO DA LÓGICA DE CORREÇÃO PARA TRANSFERÊNCIAS ---
            document.getElementById('modal-transacao-moeda-titulo').textContent = 'Editar Transferência';
            
            const movimentacaoClicada = transacaoOuRegra;
            const idPar = movimentacaoClicada.transferenciaId;
            const movimentacaoPar = todasAsMovimentacoes.find(m => m.id === idPar);

            if (!movimentacaoPar) {
                alert('Erro crítico: O par desta transferência não foi encontrado. A exclusão não é segura.');
                return;
            }

            const debito = movimentacaoClicada.valor < 0 ? movimentacaoClicada : movimentacaoPar;
            const credito = movimentacaoClicada.valor > 0 ? movimentacaoClicada : movimentacaoPar;

            document.getElementById('transacao-moeda-id').value = debito.id; 
            document.getElementById('transacao-moeda-transferencia-id').value = credito.id;
            
            document.getElementById('transacao-moeda-data').value = debito.data;
            document.getElementById('transacao-moeda-valor-debito').value = formatarDecimalParaInput(Math.abs(debito.valor));
            document.getElementById('transacao-moeda-valor-credito').value = formatarDecimalParaInput(Math.abs(credito.valor));

            // Extrai a descrição base (o que o usuário digitou)
            const descBase = debito.descricao.replace(/Transf\. para .*?: /, '') || credito.descricao.replace(/Transf\. de .*?: /, '');
            document.getElementById('transacao-moeda-descricao').value = descBase;

            const tipoDebitoPrefix = debito.tipoAlvo === 'conta' ? 'brl' : 'moeda';
            const tipoCreditoPrefix = credito.tipoAlvo === 'conta' ? 'brl' : 'moeda';
            document.getElementById('transacao-moeda-conta-debito').value = `${tipoDebitoPrefix}_${debito.idAlvo}`;
            document.getElementById('transacao-moeda-conta-credito').value = `${tipoCreditoPrefix}_${credito.idAlvo}`;
            
            containerCheckbox.style.display = 'none'; // Transferências não são sincronizáveis por padrão
            // --- FIM DA LÓGICA DE CORREÇÃO ---

        } else { 
            // Lógica para editar Movimentação Manual Simples
            document.getElementById('modal-transacao-moeda-titulo').textContent = 'Editar Movimentação';
            document.getElementById('transacao-moeda-id').value = transacaoOuRegra.id;
            document.getElementById('transacao-moeda-data').value = transacaoOuRegra.data;
            document.getElementById('transacao-moeda-descricao').value = transacaoOuRegra.descricao;
            document.getElementById('transacao-moeda-valor-debito').value = formatarDecimalParaInput(Math.abs(transacaoOuRegra.valor));
            const prefixo = transacaoOuRegra.tipoAlvo === 'conta' ? 'brl_' : 'moeda_';
            const idAlvoCompleto = `${prefixo}${transacaoOuRegra.idAlvo}`;
            if (transacaoOuRegra.valor < 0) {
                document.getElementById('transacao-moeda-conta-debito').value = idAlvoCompleto;
            } else {
                document.getElementById('transacao-moeda-conta-credito').value = idAlvoCompleto;
            }
            checkboxFinancas.checked = !!transacaoOuRegra.enviarParaFinancas;
            containerCheckbox.style.display = 'block'; 
        }
    }
    
    document.getElementById('transacao-moeda-conta-debito').dispatchEvent(new Event('change'));
    document.getElementById('transacao-moeda-conta-credito').dispatchEvent(new Event('change'));

    abrirModal('modal-nova-transacao-moeda');
}
