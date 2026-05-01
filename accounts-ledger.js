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

function gerarHtmlExtratoParaConta(conta, dataInicio, dataFim) {
    const todosOsEventos = obterTodosOsEventosDeCaixa();
    const hojeStr = new Date().toISOString().split('T')[0];
    const dataInicioObj = new Date(dataInicio + 'T00:00:00');

    const eventosPassados = todosOsEventos.filter(e => e.tipo === 'conta' && String(e.idAlvo) === String(conta.id) && e.source !== 'recorrente_futura' && new Date(e.data + 'T12:00:00') < dataInicioObj && new Date(e.data + 'T12:00:00') >= new Date(conta.dataSaldoInicial + 'T12:00:00'));
    const saldoInicialDaLinha = eventosPassados.reduce((acc, t) => acc + arredondarMoeda(t.valor), conta.saldoInicial);
    
    const transacoesParaExibicao = todosOsEventos.filter(e => e.tipo === 'conta' && String(e.idAlvo) === String(conta.id) && e.data >= dataInicio && e.data <= dataFim && e.data >= conta.dataSaldoInicial).sort((a, b) => new Date(a.data + 'T12:00:00') - new Date(b.data + 'T12:00:00'));

    let saldoCorrente = arredondarMoeda(saldoInicialDaLinha);
    // Formatação en-GB e Tradução: Saldo em...
    let corpoTabela = `<tr><td>${new Date(dataInicio + 'T12:00:00').toLocaleDateString('en-GB')}</td><td>Balance on ${new Date(dataInicio + 'T12:00:00').toLocaleDateString('en-GB')}</td><td class="numero"></td><td class="numero ${saldoCorrente < 0 ? 'valor-negativo' : ''}">${formatarMoeda(saldoCorrente)}</td><td class="controles-col"></td></tr>`;

    transacoesParaExibicao.forEach(evento => {
        saldoCorrente = arredondarMoeda(saldoCorrente + evento.valor);
        
        let controles = '', linhaClasse = evento.data === hojeStr ? 'data-hoje-bg' : '';

        // Traduções de botões 
        if (evento.source === 'recorrente_futura') {
            linhaClasse += ' transacao-futura';
            controles = `
                <i class="fas fa-check-circle acao-btn-recorrente" title="Confirm this occurrence" data-mae-id="${evento.maeId}" data-ocorrencia-data="${evento.data}" data-action="CONFIRMAR_OCORRENCIA"></i>
                <i class="fas fa-pencil-alt acao-btn-recorrente" title="Actions for this occurrence/series" data-mae-id="${evento.maeId}" data-ocorrencia-data="${evento.data}" data-action="ABRIR_MODAL_ACOES_RECORRENTE"></i>
                <i class="fas fa-times-circle acao-btn-recorrente" title="Skip this occurrence" data-mae-id="${evento.maeId}" data-ocorrencia-data="${evento.data}" data-action="PULAR_OCORRENCIA"></i>
            `;
        } else {
            
            if (evento.source === 'manual' || evento.source === 'recorrente_confirmada' || evento.transferenciaId) {
                controles += `<i class="fas fa-edit acao-btn edit" title="Edit Transaction" data-id="${evento.id}" data-type="conta"></i>`;
                controles += `<i class="fas fa-trash acao-btn delete" title="Delete Transaction" data-id="${evento.id}" data-type="conta"></i>`;
            
            } else if (evento.source === 'provento' || evento.source === 'provento_editado') {
                controles += `<i class="fas fa-edit acao-btn edit" title="Edit Income Value" data-transacao-provento-id="${evento.id}"></i>`;
            
            } else if (evento.source === 'aporte_rf' || evento.source === 'resgate_rf') {
                controles += `<i class="fas fa-edit acao-btn edit" title="Edit Fixed Income Move" data-mov-rf-id="${evento.id}"></i>`;
                controles += `<i class="fas fa-trash acao-btn delete" title="Delete Fixed Income Move" data-mov-rf-id="${evento.id}"></i>`;
            
            } else if (evento.source === 'nota') {
                controles += `<i class="fas fa-lock" title="Trading Note transaction. Edit the Note directly."></i>`;
            }
        }

        corpoTabela += `<tr class="${linhaClasse.trim()}">
            <td>${new Date(evento.data + 'T12:00:00').toLocaleDateString('en-GB')}</td>
            <td>${evento.descricao}</td> 
            <td class="numero ${evento.valor < 0 ? 'valor-negativo' : 'valor-positivo'}">${formatarMoeda(evento.valor)}</td>
            <td class="numero coluna-saldo ${saldoCorrente < 0 ? 'valor-negativo' : ''}">${formatarMoeda(saldoCorrente)}</td>
            <td class="controles-col">${controles}</td>
        </tr>`;
    });

    const saldoRealHoje = calcularSaldoEmData(conta, hojeStr);
    const temMovimentoHoje = todosOsEventos.some(t => t.tipo === 'conta' && String(t.idAlvo) === String(conta.id) && t.source !== 'recorrente_futura' && t.data === hojeStr);

    return { html: corpoTabela, saldoFinal: saldoRealHoje, temMovimentoHoje };
}

async function executarAcaoRecorrente(idMae, dataOcorrencia, acao) {
    const maeIndex = todasAsTransacoesRecorrentes.findIndex(m => String(m.id) === String(idMae));
    if (maeIndex === -1) {
        // Tradução: Erro
        alert('Error [execute action]: Recurring rule not found.');
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
            
            // Tradução: Confirmação
            if (!confirm(`Confirm the transaction "${mae.descricao}" with a value of ${valorFormatado}?`)) return;
            
            const loadingOverlay = document.getElementById('loading-overlay');
            loadingOverlay.style.display = 'flex';

            try {
                // Versão Offline: Apenas cria o lançamento local
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
                    enviarParaFinancas: false, // Desativado no modo offline
                    idLancamentoCasa: null
                };
                todasAsMovimentacoes.push(novaMovimentacao);

                const maeAtualizada = { ...mae, datasProcessadas: [...mae.datasProcessadas, dataOcorrencia] };
                todasAsTransacoesRecorrentes[maeIndex] = maeAtualizada;

                await Promise.all([salvarMovimentacoes(), salvarTransacoesRecorrentes()]);
                
                // Tradução: Sucesso
                alert('Transaction confirmed successfully!');

            } catch (error) {
                console.error("Erro ao confirmar recorrência:", error);
                // Tradução: Erro
                alert("An error occurred while processing the transaction. Check the console for details.");
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
            // Tradução: Confirmação de exclusão permanente
            if (confirm(`Are you sure you want to PERMANENTLY delete the recurring rule "${mae.descricao}"?`)) {
                todasAsTransacoesRecorrentes.splice(maeIndex, 1);
                await salvarTransacoesRecorrentes();
                // Tradução: Sucesso
                alert('Recurring rule deleted successfully.');
                if (telas.caixaGlobal.style.display === 'block') {
                    renderizarTelaCaixaGlobal(true);
                }
                if (modalProjecaoFutura.style.display === 'block') {
                    renderizarModalProjecaoFutura();
                }
            }
            break;
        case 'PULAR_OCORRENCIA':
             // Tradução: Pular ocorrência
             if (confirm('Are you sure you want to skip this occurrence? It will no longer be displayed.')) {
                mae.datasProcessadas.push(dataOcorrencia);
                await salvarTransacoesRecorrentes();
                // Tradução: Sucesso
                alert('Occurrence skipped successfully.');
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
function calcularSaldoEmData(conta, dataLimite) {
    if (!dataLimite) return 0;

    // --- INÍCIO DA ALTERAÇÃO ---
    // Agora, esta função usa a mesma fonte de dados que o extrato detalhado.
    const todosOsEventos = obterTodosOsEventosDeCaixa();

    // Filtra todos os eventos relevantes para a conta até a data limite.
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
    // --- FIM DA ALTERAÇÃO ---
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
async function salvarMovimentacaoUniversal(event) {
    event.preventDefault(); 

    const saveButton = event.target.querySelector('button[type="submit"]');
    const originalButtonText = saveButton.innerHTML;
    // Tradução: Salvando
    saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    saveButton.disabled = true;

    try {
        const id = document.getElementById('transacao-moeda-id').value;
        const transferenciaId = document.getElementById('transacao-moeda-transferencia-id').value;
        const sourceMaeId = document.getElementById('transacao-moeda-source-mae-id').value;
        const sourceOcorrenciaData = document.getElementById('transacao-moeda-source-ocorrencia-data').value;
        
        const data = document.getElementById('transacao-moeda-data').value;
        const descricao = document.getElementById('transacao-moeda-descricao').value;
        const valorDebito = parseDecimal(document.getElementById('transacao-moeda-valor-debito').value);
        
        // LIMPEZA: Não lemos mais o checkbox de "enviar para finanças"

        const tipoLancamento = document.querySelector('input[name="tipo-transacao-moeda"]:checked').value;

        if (tipoLancamento === 'recorrente') {
            // --- LÓGICA PARA SALVAR UMA REGRA DE RECORRÊNCIA ---
            const tipoMovimento = document.getElementById('transacao-moeda-tipo-recorrente').value;
            const valorFinal = tipoMovimento === 'saida' ? -valorDebito : valorDebito;
            const idAlvoCompleto = document.getElementById('transacao-moeda-ativo-recorrente').value;
            
            if (!idAlvoCompleto) {
                // Tradução: Alerta
                alert('You must select a Target Asset (Account or Currency) for the recurrence.');
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
                // Tradução: Alerta
                alert('You must select a debit or credit account.');
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
                
                // Tradução: Transf.
                const descFinal = descricao || `Transfer between ${itemDebito.nomeAtivo || itemDebito.banco} and ${itemCredito.nomeAtivo || itemCredito.banco}`;
                
                const idTransferenciaBase = id ? parseFloat(id) : Date.now(); // Usa o ID do débito como base
                const idCreditoDaBase = transferenciaId ? parseFloat(transferenciaId) : idTransferenciaBase + 1;

                // Remove movimentações antigas (ambos os lados) se estiver editando
                if (id) {
                    const idDebitoAntigo = parseFloat(id);
                    const idCreditoAntigo = parseFloat(transferenciaId);
                    todasAsMovimentacoes = todasAsMovimentacoes.filter(m => m.id !== idDebitoAntigo && m.id !== idCreditoAntigo);
                }

                const movDebito = {
                    id: idTransferenciaBase, data: data, tipoAlvo: tipoAlvoDebito, idAlvo: idDebito,
                    moeda: itemDebito.moeda || 'BRL', 
                    descricao: descFinal,
                    valor: -valorDebito, source: 'manual', transferenciaId: idCreditoDaBase,
                    enviarParaFinancas: false, idLancamentoCasa: null
                };
                const movCredito = {
                    id: idCreditoDaBase, data: data, tipoAlvo: tipoAlvoCredito, idAlvo: idCredito,
                    moeda: itemCredito.moeda || 'BRL', 
                    descricao: descFinal,
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
                    enviarParaFinancas: false, // LIMPEZA: Sempre falso no modo offline
                    idLancamentoCasa: null
                };

                // LIMPEZA: Removida a chamada de sincronização externa

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
        // Tradução: Erro
        alert("An error occurred while saving: " + error.message);
    } finally {
        saveButton.innerHTML = originalButtonText;
        saveButton.disabled = false;
    }
}
async function deletarMovimentacao(id, tipoAlvo) {
    const movIndex = todasAsMovimentacoes.findIndex(m => m.id === id);
    if (movIndex === -1) return;

    const movimentacao = todasAsMovimentacoes[movIndex];
    let confirmMessage = 'Tem certeza que deseja excluir esta movimentação?';

    if (movimentacao.transferenciaId) {
        confirmMessage = 'Esta é uma movimentação de transferência. Excluir este lançamento também excluirá o lançamento correspondente na outra conta/ativo. Deseja continuar?';
    }

    if (confirm(confirmMessage)) {
        // Lógica de Sincronização de Exclusão com Finanças da Casa
        if (currentUser && idCasaAssociada && movimentacao.idLancamentoCasa) {
            try {
                const { doc, deleteDoc } = window.dbFunctions;
                const docRef = doc(window.db, "Casas", idCasaAssociada, "Lancamentos", movimentacao.idLancamentoCasa);
                await deleteDoc(docRef);
                console.log("Lançamento correspondente excluído do Sistema de Finanças.");
            } catch (error) {
                console.error("Erro ao excluir lançamento do Sistema de Finanças:", error);
                alert("Não foi possível excluir o lançamento correspondente no sistema de finanças. A exclusão local foi cancelada para manter a consistência.");
                return; // Aborta a exclusão local se a remota falhar
            }
        }

        if (movimentacao.transferenciaId) {
            // Nova lógica: Filtra para manter apenas o que NÃO faz parte da transferência
            const idAlvoStr = String(movimentacao.transferenciaId);
            todasAsMovimentacoes = todasAsMovimentacoes.filter(m => String(m.transferenciaId) !== idAlvoStr);
        } else {
            // Lógica antiga para transações únicas (já funcionava)
            todasAsMovimentacoes = todasAsMovimentacoes.filter(m => m.id !== id);
        }
        
        await salvarMovimentacoes();
        
        // Atualiza a tela visível
        if (telas.caixaGlobal.style.display === 'block') {
            renderizarTelaCaixaGlobal(true);
        }
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

    // LIMPEZA: Checkbox de integração removido da lógica (não precisa mais ser exibido/ocultado)

    if (transacaoOuRegra) {
        if (transacaoOuRegra.recorrencia) { 
            // Lógica para editar REGRAS RECORRENTES
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
        
        } else if (transacaoOuRegra.sourceMaeId) { 
            // Lógica para editar OCORRÊNCIA
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

        } else if (transacaoOuRegra.transferenciaId) { 
            // Lógica para editar TRANSFERÊNCIA
            document.getElementById('modal-transacao-moeda-titulo').textContent = 'Editar Transferência';
            const movimentacaoClicada = transacaoOuRegra;
            const idPar = movimentacaoClicada.transferenciaId;
            const movimentacaoPar = todasAsMovimentacoes.find(m => m.id === idPar);
            if (!movimentacaoPar) { alert('Erro crítico: Par não encontrado.'); return; }
            const debito = movimentacaoClicada.valor < 0 ? movimentacaoClicada : movimentacaoPar;
            const credito = movimentacaoClicada.valor > 0 ? movimentacaoClicada : movimentacaoPar;
            document.getElementById('transacao-moeda-id').value = debito.id; 
            document.getElementById('transacao-moeda-transferencia-id').value = credito.id;
            document.getElementById('transacao-moeda-data').value = debito.data;
            document.getElementById('transacao-moeda-valor-debito').value = formatarDecimalParaInput(Math.abs(debito.valor));
            document.getElementById('transacao-moeda-valor-credito').value = formatarDecimalParaInput(Math.abs(credito.valor));
            const descBase = debito.descricao.replace(/Transf\. para .*?: /, '') || credito.descricao.replace(/Transf\. de .*?: /, '');
            document.getElementById('transacao-moeda-descricao').value = descBase;
            const tipoDebitoPrefix = debito.tipoAlvo === 'conta' ? 'brl' : 'moeda';
            const tipoCreditoPrefix = credito.tipoAlvo === 'conta' ? 'brl' : 'moeda';
            document.getElementById('transacao-moeda-conta-debito').value = `${tipoDebitoPrefix}_${debito.idAlvo}`;
            document.getElementById('transacao-moeda-conta-credito').value = `${tipoCreditoPrefix}_${credito.idAlvo}`;

        } else { 
            // Lógica manual simples
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
        }
    }
    
    document.getElementById('transacao-moeda-conta-debito').dispatchEvent(new Event('change'));
    document.getElementById('transacao-moeda-conta-credito').dispatchEvent(new Event('change'));

    abrirModal('modal-nova-transacao-moeda');
}
function abrirModalCadastroConta(contaParaEditar = null, tipoItem = 'conta') {
    const form = document.getElementById('form-cadastro-conta');
    form.reset();
    const tituloModal = document.getElementById('modal-conta-titulo');
    
    // Reseta o estado do modal
    document.getElementById('conta-moeda').value = 'BRL';
    document.getElementById('conta-moeda').dispatchEvent(new Event('change'));

    if (contaParaEditar) {
        tituloModal.textContent = 'Editar Conta / Ativo em Moeda';
        document.getElementById('conta-id').value = contaParaEditar.id;
        document.getElementById('conta-tipo-original').value = tipoItem;

        const moeda = contaParaEditar.moeda || (tipoItem === 'conta' ? 'BRL' : '');
        document.getElementById('conta-moeda').value = moeda;
        
        if (moeda === 'BRL') {
            const bancoSelect = document.getElementById('conta-banco');
            const isStandardBank = [...bancoSelect.options].some(opt => opt.value === contaParaEditar.banco);
            if (isStandardBank) { bancoSelect.value = contaParaEditar.banco; }
            else { bancoSelect.value = 'Outro'; document.getElementById('container-outro-banco').style.display = 'block'; document.getElementById('conta-outro-banco').value = contaParaEditar.banco; }
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
        
        document.getElementById('conta-moeda').disabled = true; // Não permite mudar a moeda na edição
    } else {
        tituloModal.textContent = 'Cadastrar Nova Conta / Ativo em Moeda';
        document.getElementById('conta-id').value = '';
        document.getElementById('conta-tipo-original').value = '';
        document.getElementById('conta-data-saldo-inicial').value = new Date().toISOString().split('T')[0];
        document.getElementById('conta-moeda').disabled = false;
    }

    document.getElementById('conta-moeda').dispatchEvent(new Event('change'));
    abrirModal('modal-cadastro-conta');
}
function abrirModalDetalhesContas() {
    const hoje = new Date().toISOString().split('T')[0];
    const contasAtivas = getTodasContasAtivas();
    
    let conteudoHtml = '<table><thead><tr><th>Account</th><th class="numero">Current Balance</th></tr></thead><tbody>';
    
    if (contasAtivas.length > 0) {
        contasAtivas.sort((a, b) => a.banco.localeCompare(b.banco)).forEach(conta => {
            const saldoConta = calcularSaldoEmData(conta, hoje);
            let tipoContaFmt = conta.tipo;
            if (conta.tipo === 'Conta Corrente') tipoContaFmt = 'Current Account';
            if (conta.tipo === 'Conta Investimento') tipoContaFmt = 'Investment Account';
            if (conta.tipo === 'Poupança') tipoContaFmt = 'Savings';
            
            conteudoHtml += `
                <tr>
                    <td>${conta.banco} (${tipoContaFmt})</td>
                    <td class="numero">${formatarMoeda(saldoConta)}</td>
                </tr>`;
        });
    } else {
        conteudoHtml += '<tr><td colspan="2" style="text-align:center;">No active BRL accounts registered.</td></tr>';
    }
    
    conteudoHtml += '</tbody></table>';

    document.getElementById('modal-dashboard-detalhes-titulo').textContent = 'Account Balance Details (BRL)';
    document.getElementById('modal-dashboard-detalhes-conteudo').innerHTML = conteudoHtml;
    abrirModal('modal-dashboard-detalhes');
}
function abrirModalDetalhesMoedas() {
    const hoje = new Date().toISOString().split('T')[0];
    const todosOsEventosCaixa = obterTodosOsEventosDeCaixa();

    let conteudoHtml = '<table><thead><tr><th>Asset</th><th class="numero">Original Balance</th><th class="numero">Converted Balance (BRL)</th></tr></thead><tbody>';
    
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
        conteudoHtml += '<tr><td colspan="3" style="text-align:center;">No foreign currency assets registered.</td></tr>';
    }

    conteudoHtml += '</tbody></table>';

    document.getElementById('modal-dashboard-detalhes-titulo').textContent = 'Foreign Currencies Details';
    document.getElementById('modal-dashboard-detalhes-conteudo').innerHTML = conteudoHtml;
    abrirModal('modal-dashboard-detalhes');
}
function gerarHtmlExtratoParaAtivoMoeda(ativo, dataInicio, dataFim) {
    const todosOsEventos = obterTodosOsEventosDeCaixa();
    const hojeStr = new Date().toISOString().split('T')[0];

    const dataAnteriorAoInicio = new Date(dataInicio + 'T00:00:00');
    dataAnteriorAoInicio.setDate(dataAnteriorAoInicio.getDate() - 1);
    const dataAnteriorAoInicioStr = dataAnteriorAoInicio.toISOString().split('T')[0];

    const transacoesPassadas = todosOsEventos.filter(e =>
        e.tipo === 'moeda' &&
        String(e.idAlvo) === String(ativo.id) &&
        e.source !== 'recorrente_futura' &&
        e.data <= dataAnteriorAoInicioStr &&
        e.data >= ativo.dataSaldoInicial
    );
    const saldoInicialLinha = transacoesPassadas.reduce((acc, t) => acc + arredondarMoeda(t.valor), ativo.saldoInicial);
    const labelSaldoInicialDaLinha = `Saldo em ${new Date(dataAnteriorAoInicioStr + 'T12:00:00').toLocaleDateString('pt-BR')}`;

    const transacoesParaExibicao = todosOsEventos.filter(e =>
        e.tipo === 'moeda' &&
        String(e.idAlvo) === String(ativo.id) &&
        e.data >= dataInicio &&
        e.data <= dataFim &&
        e.data >= ativo.dataSaldoInicial
    ).sort((a, b) => new Date(a.data + 'T12:00:00') - new Date(b.data + 'T12:00:00'));

    let saldoCorrente = arredondarMoeda(saldoInicialLinha);

    let corpoTabela = `<tr>
        <td>${new Date(dataInicio + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
        <td>${labelSaldoInicialDaLinha}</td>
        <td class="numero"></td>
        <td class="numero ${saldoCorrente < 0 ? 'valor-negativo' : ''}">${formatarMoedaEstrangeira(saldoCorrente, ativo.moeda)}</td>
        <td class="controles-col"></td>
    </tr>`;

    transacoesParaExibicao.forEach(evento => {
        const valorArredondado = arredondarMoeda(evento.valor);
        saldoCorrente += valorArredondado;
        saldoCorrente = arredondarMoeda(saldoCorrente);

        const valorFmt = formatarMoedaEstrangeira(valorArredondado, ativo.moeda);
        const valorClasse = valorArredondado < 0 ? 'valor-negativo' : 'valor-positivo';
        const saldoClasse = saldoCorrente < 0 ? 'valor-negativo' : '';

        // LIMPEZA: Ícone visual de sincronia removido
        let linhaClasse = '';
        let controles = '';

        if (evento.data === hojeStr) {
            linhaClasse = 'data-hoje-bg';
        }

        if (evento.source === 'recorrente_futura') {
            linhaClasse += ' transacao-futura';
            controles = `
                <i class="fas fa-check-circle acao-btn-recorrente" title="Confirmar esta ocorrência" data-mae-id="${evento.maeId}" data-ocorrencia-data="${evento.data}" data-action="CONFIRMAR_OCORRENCIA"></i>
                <i class="fas fa-pencil-alt acao-btn-recorrente" title="Ações para esta ocorrência/série" data-mae-id="${evento.maeId}" data-ocorrencia-data="${evento.data}" data-action="ABRIR_MODAL_ACOES_RECORRENTE"></i>
                <i class="fas fa-times-circle acao-btn-recorrente" title="Pular esta ocorrência" data-mae-id="${evento.maeId}" data-ocorrencia-data="${evento.data}" data-action="PULAR_OCORRENCIA"></i>
            `;
        } else if (evento.source === 'manual' || evento.source === 'recorrente_confirmada' || evento.transferenciaId) { 
            // LIMPEZA: Toggle sync removido
            controles = `<i class="fas fa-edit acao-btn edit" title="Editar Movimentação" data-id="${evento.id}" data-type="moeda"></i>
                         <i class="fas fa-trash acao-btn delete" title="Excluir Movimentação" data-id="${evento.id}" data-type="moeda"></i>`;
        } else {
            controles = `<i class="fas fa-lock" title="Transação automática."></i>`;
        }

        corpoTabela += `<tr class="${linhaClasse.trim()}">
            <td>${new Date(evento.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
            <td>${evento.descricao}</td>
            <td class="numero ${valorClasse}">${valorFmt}</td>
            <td class="numero coluna-saldo ${saldoClasse}">${formatarMoedaEstrangeira(saldoCorrente, ativo.moeda)}</td>
            <td class="controles-col">${controles}</td>
        </tr>`;
    });

    const transacoesHoje = todosOsEventos.filter(e =>
        e.tipo === 'moeda' &&
        String(e.idAlvo) === String(ativo.id) &&
        e.source !== 'recorrente_futura' &&
        e.data <= hojeStr &&
        e.data >= ativo.dataSaldoInicial
    );
    const saldoFinalHoje = transacoesHoje.reduce((soma, t) => soma + arredondarMoeda(t.valor), ativo.saldoInicial);
    const temMovimentoHoje = todosOsEventos.some(t => t.tipo === 'moeda' && String(t.idAlvo) === String(ativo.id) && t.source !== 'recorrente_futura' && t.data === hojeStr);

    return { html: corpoTabela, saldoFinal: saldoFinalHoje, temMovimentoHoje };
}
