function verificarInconsistencias() {
    const resultadosDiv = document.getElementById('resultados-inconsistencias');
    // Tradução: Verificando...
    resultadosDiv.innerHTML = '<h4>Checking...</h4>';
    let htmlResultados = '';
    let totalInconsistencias = 0;

    const isDataInvalida = (data) => !data || isNaN(new Date(data).getTime());

    const ativosIncompletos = todosOsAtivos.filter(a => !a.tipo);
    if (ativosIncompletos.length > 0) {
        totalInconsistencias += ativosIncompletos.length;
        // Tradução: Cadastro incompleto
        htmlResultados += `<div><h4>Incomplete Asset Registrations (${ativosIncompletos.length})</h4><p>The following assets do not have a defined Type (Share, REIT, ETF), which is crucial for calculations.</p><ul>${ativosIncompletos.map(a => `<li>${a.ticker}</li>`).join('')}</ul></div>`;
    }

    const proventosOrfaos = todosOsProventos.filter(p => !p.quantidadeNaDataCom || p.quantidadeNaDataCom <= 0);
    if (proventosOrfaos.length > 0) {
        totalInconsistencias += proventosOrfaos.length;
        // Tradução: Proventos Órfãos
        htmlResultados += `<div style="margin-top: 20px;"><h4>Orphaned Income Records (${proventosOrfaos.length})</h4><p>The following income records were launched, but no position was found on the "Ex-Date". Check the asset history or the income date.</p><ul>${proventosOrfaos.map(p => `<li>${p.tipo} from <strong>${p.ticker}</strong> payable on ${new Date(p.dataPagamento + 'T12:00:00').toLocaleDateString('en-GB')}</li>`).join('')}</ul><button class="btn btn-primary" id="btn-corrigir-proventos-orfaos" style="margin-top: 15px;">Fix Orphaned Positions</button></div>`;
    }

    const posicoesAtuais = gerarPosicaoDetalhada();
    const posicoesNegativas = Object.entries(posicoesAtuais).filter(([_, dados]) => dados.quantidade < -0.000001);
    if (posicoesNegativas.length > 0) {
        totalInconsistencias += posicoesNegativas.length;
        // Tradução: Posições Negativas
        htmlResultados += `<div style="margin-top: 20px;"><h4>Negative Positions Found (${posicoesNegativas.length})</h4><p>The following assets have a negative quantity, indicating a possible sale exceeding ownership. Check your transaction history.</p><ul>${posicoesNegativas.map(([ticker, dados]) => `<li><strong>${ticker}</strong> (Current Qty: ${Math.round(dados.quantidade)})</li>`).join('')}</ul></div>`;
    }
    
    const registrosDataCorrigivel = [];
    todasAsNotas.filter(r => isDataInvalida(r.data)).forEach(r => registrosDataCorrigivel.push({ tipo: 'nota', id: r.id, nome: `Trading Note #${r.numero}`}));
    todasAsAjustes.filter(r => isDataInvalida(r.data)).forEach(r => registrosDataCorrigivel.push({ tipo: 'ajuste', id: r.id, nome: `Adjustment (${r.tipoAjuste})`}));
    posicaoInicial.filter(r => isDataInvalida(r.data)).forEach(r => registrosDataCorrigivel.push({ tipo: 'posicao', id: r.id, nome: `Initial Position for ${r.ticker}`}));
    todasAsMovimentacoes.filter(r => r.source === 'manual' && isDataInvalida(r.data)).forEach(r => registrosDataCorrigivel.push({ tipo: 'transacao', id: r.id, nome: `Manual Transaction: ${r.descricao}`}));
    todosOsProventos.forEach(r => {
        if(isDataInvalida(r.dataCom)) registrosDataCorrigivel.push({ tipo: 'provento-com', id: r.id, nome: `Income (Ex-Date) for ${r.ticker}`});
        if(isDataInvalida(r.dataPagamento)) registrosDataCorrigivel.push({ tipo: 'provento-pag', id: r.id, nome: `Income (Pay Date) for ${r.ticker}`});
    });

    if (registrosDataCorrigivel.length > 0) {
        totalInconsistencias += registrosDataCorrigivel.length;
        // Tradução: Data Inválida
        htmlResultados += `<div style="margin-top: 20px;"><h4>Records with Invalid Dates (${registrosDataCorrigivel.length})</h4><p>The following manually entered records need a valid date.</p><ul>${registrosDataCorrigivel.map(r => `<li>${r.nome} <button class="btn btn-sm btn-primary btn-corrigir-data" data-record-type="${r.tipo}" data-record-id="${r.id}">Fix Date</button></li>`).join('')}</ul></div>`;
    }

    const vendasHistoricasSemValor = posicaoInicial.filter(p => p.tipoRegistro === 'TRANSACAO_HISTORICA' && p.transacao.toLowerCase() === 'venda' && (p.valorVenda === null || typeof p.valorVenda === 'undefined'));
    if (vendasHistoricasSemValor.length > 0) {
        totalInconsistencias += vendasHistoricasSemValor.length;
        // Tradução: Vendas sem valor
        htmlResultados += `<div style="margin-top: 20px;">
            <h4>Historical Sales Missing Value (${vendasHistoricasSemValor.length})</h4>
            <p>For accurate Tax calculations, you must provide the total sale value for these historical operations.</p>
            <button class="btn btn-primary" id="btn-corrigir-vendas-historicas" style="margin-top: 10px;">Fix Sales Now</button>
        </div>`;
    }

    const contasSemMoeda = todasAsContas.filter(c => typeof c.moeda === 'undefined');
    if (contasSemMoeda.length > 0) {
        totalInconsistencias += contasSemMoeda.length;
        // Tradução: Contas sem moeda
        htmlResultados += `<div style="margin-top: 20px;">
            <h4>Accounts without Currency Defined (${contasSemMoeda.length})</h4>
            <p>These accounts need a currency defined to work in the new unified system. Click the button to fix.</p>
            <button class="btn btn-primary" type="button" id="btn-iniciar-correcao-contas-sem-moeda" style="margin-top: 10px;">Fix Accounts Now</button>
        </div>`;
    }

    if (totalInconsistencias === 0) {
        // Tradução: Nenhuma inconsistência
        resultadosDiv.innerHTML = '<p class="no-issues"><i class="fas fa-check-circle"></i> No inconsistencies found!</p>';
    } else {
        resultadosDiv.innerHTML = htmlResultados;
    }
}
function salvarCorrecaoContasSemMoeda(event) {
    event.preventDefault();
    const linhas = document.querySelectorAll('.conta-correcao-row');
    let correcoesFeitas = 0;

    linhas.forEach(linha => {
        const contaId = parseFloat(linha.dataset.contaId);
        const moedaSelecionada = linha.querySelector('.conta-correcao-moeda').value;
        const conta = todasAsContas.find(c => c.id === contaId);

        if (conta && moedaSelecionada) {
            conta.moeda = moedaSelecionada;
            if (moedaSelecionada === 'BRL') {
                conta.agencia = linha.querySelector('.conta-correcao-agencia').value;
                conta.numero = linha.querySelector('.conta-correcao-numero').value;
                conta.pix = linha.querySelector('.conta-correcao-pix').value;
            }
            correcoesFeitas++;
        }
    });

    if (correcoesFeitas > 0) {
        salvarContas();
        alert(`${correcoesFeitas} conta(s) atualizada(s) com sucesso!`);
        fecharModal('modal-corrigir-contas-sem-moeda');
        verificarInconsistencias();
    } else {
        alert('Nenhuma moeda foi selecionada. Nenhuma alteração foi salva.');
    }
}
function adicionarLinhaCorrecaoProvento(button) {
    const container = button.closest('td').querySelector('.posicoes-por-corretora-wrapper');
    const corretorasOptions = getTodasCorretoras().map(c => `<option value="${c}">${c}</option>`).join('');
    
    const div = document.createElement('div');
    div.className = 'linha-corretora-correcao';
    div.innerHTML = `
        <select class="provento-correcao-corretora">
            <option value="">Selecione...</option>
            ${corretorasOptions}
        </select>
        <input type="number" min="1" step="1" class="provento-correcao-qtd" placeholder="Qtd.">
        <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">
            <i class="fas fa-trash"></i>
        </button>
    `;
    container.appendChild(div);
}
function salvarCorrecaoProventosOrfaos(event) {
    event.preventDefault();
    const linhasDeProventos = document.querySelectorAll('#lista-proventos-orfaos-container .provento-correcao-row');
    const novosRegistrosPosicao = [];

    linhasDeProventos.forEach(row => {
        const precoMedioInput = row.querySelector('.provento-correcao-pm');
        const precoMedio = precoMedioInput ? parseDecimal(precoMedioInput.value) : 0;
        const posicoesPorCorretora = [];
        
        row.querySelectorAll('.linha-corretora-correcao').forEach(corretoraRow => {
            const corretora = corretoraRow.querySelector('.provento-correcao-corretora').value;
            const quantidadeInput = corretoraRow.querySelector('.provento-correcao-qtd');
            const quantidade = quantidadeInput ? parseInt(quantidadeInput.value, 10) : 0;
            
            if (corretora && quantidade > 0) {
                posicoesPorCorretora.push({ corretora, quantidade });
            }
        });

        if (precoMedio > 0 && posicoesPorCorretora.length > 0) {
            novosRegistrosPosicao.push({
                id: Date.now() + Math.random(),
                tipoRegistro: 'SUMARIO_MANUAL',
                ticker: row.dataset.ticker,
                data: row.dataset.datacom,
                precoMedio: precoMedio,
                posicoesPorCorretora: posicoesPorCorretora
            });
        }
    });

    if (novosRegistrosPosicao.length === 0) {
        alert('Nenhum dado válido preenchido. Nenhuma posição foi salva.');
        return;
    }

    posicaoInicial.push(...novosRegistrosPosicao);
    salvarPosicaoInicial();

    let proventosCorrigidosCount = 0;
    todosOsProventos.forEach(provento => {
        const isAffected = novosRegistrosPosicao.some(newPos =>
            newPos.ticker === provento.ticker && newPos.data === provento.dataCom
        );

        if (isAffected && (!provento.quantidadeNaDataCom || provento.quantidadeNaDataCom <= 0)) {
            const dadosRecalculados = calcularDadosProvento(provento.ticker, provento.dataCom, provento.valorIndividual);
            Object.assign(provento, dadosRecalculados);
            sincronizarProventoComTransacao(provento.id);
            proventosCorrigidosCount++;
        }
    });

    salvarProventos();
    salvarMovimentacoes(); // CORREÇÃO AQUI

    alert(`${novosRegistrosPosicao.length} registro(s) de posição foram criados e ${proventosCorrigidosCount} provento(s) foram corrigidos e sincronizados automaticamente!`);
    
    modalCorrigirProventosOrfaos.style.display = 'none';
    
    if (telas.configuracoes.style.display === 'block') {
        verificarInconsistencias();
    }
}