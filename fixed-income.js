function calcularSaldosRFEmData(ativoRF, dataLimite) {
    // --- INÍCIO DA ALTERAÇÃO ---
    // Descobre dinamicamente a data de início do ciclo de investimento atual.
    const dataDeCorte = getDataInicioCicloAtualRF(ativoRF);

    // 1. Usa a função auxiliar para obter o capital investido APENAS no ciclo atual.
    const capitalInvestidoTotal = getCapitalInvestidoNoCicloAtual(ativoRF, dataLimite);

    // 2. Filtra as movimentações de resgate APENAS do ciclo atual.
    const resgatesNoCiclo = todasAsMovimentacoes.filter(t =>
        t.source === 'resgate_rf' &&
        t.sourceId === ativoRF.id &&
        t.data <= dataLimite &&
        t.data > dataDeCorte
    );
    
    // 3. Calcula o capital retornado e o total resgatado a partir do filtro acima.
    const capitalRetornadoTotal = resgatesNoCiclo.reduce((sum, m) => sum + (m.devolucaoCapital || 0), 0);
    const resgatesTotais = resgatesNoCiclo.reduce((sum, m) => sum + Math.abs(m.valor), 0);

    const capitalInvestidoRestante = capitalInvestidoTotal - capitalRetornadoTotal;

    // 4. Encontra o último rendimento bruto registrado APENAS no ciclo atual.
    const rendimentosPassados = todosOsRendimentosRFNaoRealizados
        .filter(r => 
            r.ativoId === ativoRF.id && 
            r.data <= dataLimite &&
            r.data > dataDeCorte
        )
        .sort((a, b) => new Date(b.data) - new Date(a.data));
    
    const rendimentoAcumuladoTotal = rendimentosPassados.length > 0 ? rendimentosPassados[0].rendimento : 0;

    // 5. A lógica de cálculo do saldo e rendimento permanece a mesma, mas agora com dados filtrados.
    const saldoLiquidoNaData = (capitalInvestidoTotal + rendimentoAcumuladoTotal) - resgatesTotais;
    const rendimentoBrutoRestante = saldoLiquidoNaData - capitalInvestidoRestante;

    return {
        valorInvestido: arredondarMoeda(capitalInvestidoRestante),
        saldoLiquido: arredondarMoeda(saldoLiquidoNaData),
        rendimentoBruto: arredondarMoeda(rendimentoBrutoRestante)
    };
    // --- FIM DA ALTERAÇÃO ---
}
function atualizarSaldosCacheAtivoRF(ativoId) {
    const ativo = todosOsAtivosRF.find(a => a.id === ativoId);
    if (!ativo) return;

    const hojeStr = new Date().toISOString().split('T')[0];
    const saldosAtuais = calcularSaldosRFEmData(ativo, hojeStr);
    
    // CORREÇÃO DEFINITIVA: Apenas o saldo líquido, que é um cache, deve ser atualizado.
    // O `valorInvestido` do objeto principal é o valor de aporte inicial e NUNCA deve ser modificado aqui.
    ativo.saldoLiquido = saldosAtuais.saldoLiquido;
    
    salvarAtivosRF();
}
function getDataInicioCicloAtualRF(ativo) {
    const eventos = [];

    // Adiciona o aporte inicial
    eventos.push({ data: ativo.dataAplicacao, valor: ativo.valorInvestido, tipo: 'aporte' });

    // Adiciona todos os aportes e resgates do histórico de movimentações
    todasAsMovimentacoes
        .filter(t => t.sourceId === ativo.id && (t.source === 'aporte_rf' || t.source === 'resgate_rf'))
        .forEach(t => {
            eventos.push({
                data: t.data,
                valor: t.source === 'aporte_rf' ? Math.abs(t.valor) : -Math.abs(t.valor), // Resgate é negativo
                tipo: t.source
            });
        });

    // Ordena todos os eventos cronologicamente
    eventos.sort((a, b) => new Date(a.data) - new Date(b.data));

    let capitalAcumulado = 0;
    let dataUltimoEncerramento = '1970-01-01';

    // Simula o fluxo de capital para encontrar a data do último zeramento
    eventos.forEach(evento => {
        if (evento.tipo === 'aporte' || evento.tipo === 'aporte_rf') {
            capitalAcumulado += evento.valor;
        } else if (evento.tipo === 'resgate_rf') {
            // Para zerar o ciclo, o resgate precisa consumir todo o capital
            // A lógica de `devolucaoCapital` é complexa de simular aqui, então usamos uma aproximação:
            // Se o resgate zera o saldo total (capital + rendimento), consideramos o ciclo encerrado.
            // Para simplificar e ser robusto, vamos assumir que se o capital ficou próximo de zero, o ciclo fechou.
            // A forma mais segura é simular o saldo líquido. Para isso precisamos dos rendimentos.
            // Vamos simplificar a lógica para o capital.
            
            // Re-lendo a função de resgate, ela já calcula a devolução de capital. Vamos usar isso.
            const movimentacaoOriginal = todasAsMovimentacoes.find(m => m.data === evento.data && m.valor === -evento.valor && m.sourceId === ativo.id);
            if(movimentacaoOriginal){
                capitalAcumulado -= (movimentacaoOriginal.devolucaoCapital || 0);
            }
        }
        
        // Se o capital acumulado ficou zerado ou negativo, marca esta data
        if (capitalAcumulado < 0.01) {
            dataUltimoEncerramento = evento.data;
        }
    });

    // A data de início do ciclo atual é a data do último zeramento
    return dataUltimoEncerramento;
}
function getCapitalInvestidoNoCicloAtual(ativo, dataLimite) {
    // --- INÍCIO DA ALTERAÇÃO ---
    // Agora, a data de corte é descoberta dinamicamente, analisando todo o histórico.
    const dataDeCorte = getDataInicioCicloAtualRF(ativo);
    // --- FIM DA ALTERAÇÃO ---
    let capitalTotalCiclo = 0;

    if (ativo.dataAplicacao <= dataLimite && ativo.dataAplicacao > dataDeCorte) {
        capitalTotalCiclo += ativo.valorInvestido;
    }

    todasAsMovimentacoes
        .filter(t =>
            t.source === 'aporte_rf' &&
            t.sourceId === ativo.id &&
            t.data <= dataLimite &&
            t.data > dataDeCorte
        )
        .forEach(aporte => {
            capitalTotalCiclo += Math.abs(aporte.valor);
        });

    return capitalTotalCiclo;
}
function salvarAtivoRF(event) {
    event.preventDefault();
    const id = document.getElementById('ativo-rf-id').value;
    const descricao = document.getElementById('ativo-rf-descricao').value;
    const instituicao = document.getElementById('ativo-rf-instituicao').value;
    const valorInvestido = parseDecimal(document.getElementById('ativo-rf-valor-investido').value);
    const dataAplicacao = document.getElementById('ativo-rf-data-aplicacao').value;
    const dataVencimento = document.getElementById('ativo-rf-data-vencimento').value;
    const isentoIR = document.getElementById('ativo-rf-isento-ir').checked;

    if (!descricao || !instituicao || !dataAplicacao || !dataVencimento) {
        alert('Por favor, preencha todos os campos obrigatórios.');
        return;
    }

    if (id) {
        const index = todosOsAtivosRF.findIndex(a => a.id === parseFloat(id));
        if (index > -1) {
            // MODO EDIÇÃO: Atualiza todos os campos do ativo existente.
            const ativoExistente = todosOsAtivosRF[index];
            ativoExistente.descricao = descricao;
            ativoExistente.instituicao = instituicao;
            ativoExistente.valorInvestido = valorInvestido; // CORREÇÃO APLICADA
            ativoExistente.dataAplicacao = dataAplicacao;   // CORREÇÃO APLICADA
            ativoExistente.dataVencimento = dataVencimento;
            ativoExistente.isentoIR = isentoIR;

            // --- INÍCIO DA ALTERAÇÃO ---
            // Medida de segurança: Se o usuário edita dados fundamentais do ativo,
            // removemos a marca de encerramento para forçar uma reavaliação completa do histórico.
            if (ativoExistente.ultimoEncerramento) {
                delete ativoExistente.ultimoEncerramento;
                console.log(`Marca de encerramento removida do ativo "${ativoExistente.descricao}" devido à edição.`);
            }
            // --- FIM DA ALTERAÇÃO ---

        }
    } else {
        // MODO CRIAÇÃO: Cria um novo ativo.
        const novoAtivoRF = {
            id: Date.now(),
            descricao,
            instituicao,
            valorInvestido: valorInvestido,
            saldoLiquido: valorInvestido, // Saldo inicial é igual ao valor investido
            dataAplicacao,
            dataVencimento,
            isentoIR
        };
        todosOsAtivosRF.push(novoAtivoRF);
    }
    
    salvarAtivosRF();
    // Renderiza a tela que estiver visível para o usuário.
    if (telas.cadastroRF.style.display === 'block') {
        renderizarTabelaAtivosRF();
    }
    if (telas.rendaFixa.style.display === 'block') {
        renderizarPosicaoRF();
    }
    fecharModal('modal-cadastro-ativo-rf');
}
function salvarAporteRF(event) {
    event.preventDefault();
    const ativoId = parseFloat(document.getElementById('aporte-rf-id').value);
    const valorAporte = parseDecimal(document.getElementById('aporte-rf-valor').value);
    const dataAporte = document.getElementById('aporte-rf-data').value;
    const contaOrigemId = document.getElementById('aporte-rf-conta-origem').value;

    const ativo = todosOsAtivosRF.find(a => a.id === ativoId);
    if (!ativo) {
        alert('Erro: Ativo de Renda Fixa não encontrado.');
        return;
    }

    const contaOrigem = todasAsContas.find(c => String(c.id) === contaOrigemId);
    const moedaTransacao = contaOrigem ? (contaOrigem.moeda || 'BRL') : 'BRL';

    const novaMovimentacao = {
        id: Date.now(), data: dataAporte, tipoAlvo: 'conta', idAlvo: contaOrigemId,
        moeda: moedaTransacao, descricao: `Aporte em RF: ${ativo.descricao}`,
        valor: -valorAporte, source: 'aporte_rf', sourceId: ativoId,
        enviarParaFinancas: true, // Define como true por padrão
        idLancamentoCasa: null
    };
    
    todasAsMovimentacoes.push(novaMovimentacao);
    salvarMovimentacoes();
    fecharModal('modal-aporte-rf');
    
    atualizarSaldosCacheAtivoRF(ativoId);
    
    renderizarPosicaoRF();
    if (telas.caixaGlobal.style.display === 'block') {
        renderizarTelaCaixaGlobal(true);
    }
}
function salvarResgateRF(event) {
    event.preventDefault();
    const ativoId = parseFloat(document.getElementById('resgate-rf-id').value);
    const valorResgate = parseDecimal(document.getElementById('resgate-rf-valor').value);
    const dataResgate = document.getElementById('resgate-rf-data').value;
    const contaDestinoId = document.getElementById('resgate-rf-conta-destino').value;

    const ativo = todosOsAtivosRF.find(a => a.id === ativoId);
    if (!ativo) {
        alert('Erro: Ativo de Renda Fixa não encontrado.');
        return;
    }
    
    const contaDestino = todasAsContas.find(c => String(c.id) === contaDestinoId);
    const moedaTransacao = contaDestino ? (contaDestino.moeda || 'BRL') : 'BRL';

    const saldosNaDataDoResgate = calcularSaldosRFEmData(ativo, dataResgate);
    
    if (valorResgate > saldosNaDataDoResgate.saldoLiquido) {
        alert('O valor do resgate não pode ser maior que o saldo líquido na data selecionada.');
        return;
    }

    const rendimentoDisponivel = saldosNaDataDoResgate.rendimentoBruto;
    const valorRetiradoDoCapital = Math.max(0, valorResgate - rendimentoDisponivel);

    const novaMovimentacao = {
        id: Date.now(), data: dataResgate, tipoAlvo: 'conta', idAlvo: contaDestinoId,
        moeda: moedaTransacao, descricao: `Resgate de RF: ${ativo.descricao}`,
        valor: valorResgate, source: 'resgate_rf', sourceId: ativoId,
        devolucaoCapital: arredondarMoeda(valorRetiradoDoCapital),
        enviarParaFinancas: true, // Define como true por padrão
        idLancamentoCasa: null
    };
    
    todasAsMovimentacoes.push(novaMovimentacao);
    
    atualizarSaldosCacheAtivoRF(ativoId);
    
    salvarMovimentacoes();
    fecharModal('modal-resgate-rf');
    
    renderizarPosicaoRF();
    if (telas.caixaGlobal.style.display === 'block') {
        renderizarTelaCaixaGlobal(true);
    }

    alert(`Resgate de ${formatarMoeda(valorResgate)} registrado com sucesso!`);
}
function salvarEdicaoSaldoLiquidoRF(ativoRFId, novoSaldoStr) {
    const novoSaldo = parseDecimal(novoSaldoStr);
    const ativo = todosOsAtivosRF.find(a => a.id === ativoRFId);
    
    if (ativo && !isNaN(novoSaldo)) {
        const dataEdicao = new Date().toISOString().split('T')[0];
        
        // --- INÍCIO DA ALTERAÇÃO ---
        // Agora, usa a nova função auxiliar para obter o capital investido APENAS no ciclo atual.
        const valorInvestidoTotalAtual = getCapitalInvestidoNoCicloAtual(ativo, dataEdicao);
        // --- FIM DA ALTERAÇÃO ---

        const rendimentoTotalBruto = novoSaldo - valorInvestidoTotalAtual;

        const indexExistente = todosOsRendimentosRFNaoRealizados.findIndex(
            r => r.ativoId === ativo.id && r.data === dataEdicao
        );

        if (indexExistente > -1) {
            todosOsRendimentosRFNaoRealizados[indexExistente].rendimento = rendimentoTotalBruto;
        } else {
            todosOsRendimentosRFNaoRealizados.push({
                id: Date.now(),
                ativoId: ativo.id,
                data: dataEdicao,
                rendimento: rendimentoTotalBruto
            });
        }
        
        ativo.saldoLiquido = novoSaldo;
        salvarAtivosRF();
        salvarRendimentosRFNaoRealizados();
    }
    renderizarPosicaoRF();
}
function abrirModalCadastroAtivoRF(ativoRFParaEditar = null) {
    const form = document.getElementById('form-cadastro-ativo-rf');
    form.reset();
    const modalTitulo = document.getElementById('modal-ativo-rf-titulo');
    const valorInvestidoInput = document.getElementById('ativo-rf-valor-investido');
    const dataAplicacaoInput = document.getElementById('ativo-rf-data-aplicacao');
    const instituicaoSelect = document.getElementById('ativo-rf-instituicao');

    // Tradução: Select...
    instituicaoSelect.innerHTML = '<option value="">Select...</option>' + getTodasInstituicoesAtivas().map(c => `<option value="${c}">${c}</option>`).join('');

    if (ativoRFParaEditar) {
        // Tradução: Título Edição
        modalTitulo.textContent = 'Edit Fixed Income Investment';
        document.getElementById('ativo-rf-id').value = ativoRFParaEditar.id;
        document.getElementById('ativo-rf-descricao').value = ativoRFParaEditar.descricao;
        instituicaoSelect.value = ativoRFParaEditar.instituicao;
        valorInvestidoInput.value = formatarDecimalParaInput(ativoRFParaEditar.valorInvestido);
        dataAplicacaoInput.value = ativoRFParaEditar.dataAplicacao;
        document.getElementById('ativo-rf-data-vencimento').value = ativoRFParaEditar.dataVencimento;
        document.getElementById('ativo-rf-isento-ir').checked = ativoRFParaEditar.isentoIR;

        valorInvestidoInput.readOnly = false;
        dataAplicacaoInput.readOnly = false;
    } else {
        // Tradução: Título Cadastro
        modalTitulo.textContent = 'New Fixed Income Investment';
        document.getElementById('ativo-rf-id').value = '';
        dataAplicacaoInput.value = new Date().toISOString().split('T')[0]; 
        
        valorInvestidoInput.readOnly = false;
        dataAplicacaoInput.readOnly = false;
    }
    
    modalCadastroAtivoRF.style.display = 'block';
    document.getElementById('ativo-rf-descricao').focus();
}
function abrirModalAporteRF(ativoRFId) {
    const ativo = todosOsAtivosRF.find(a => a.id === ativoRFId);
    if (!ativo) return;

    document.getElementById('form-aporte-rf').reset();
    document.getElementById('aporte-rf-id').value = ativo.id;
    document.getElementById('aporte-rf-descricao').textContent = ativo.descricao;
    
    const selectConta = document.getElementById('aporte-rf-conta-origem');
    selectConta.innerHTML = '<option value="">Selecione a conta de débito...</option>' + todasAsContas
        .filter(c => c.tipo === 'Conta Corrente' || c.tipo === 'Conta Investimento')
        .map(c => `<option value="${c.id}">${c.banco} - ${c.tipo}</option>`).join('');

    modalAporteRF.style.display = 'block';
    document.getElementById('aporte-rf-valor').focus();
}
function abrirModalResgateRF(ativoRFId) {
    const ativo = todosOsAtivosRF.find(a => a.id === ativoRFId);
    if (!ativo) return;

    // --- CORREÇÃO ---
    // Calcula o saldo líquido atual em tempo real para garantir precisão no modal
    const hoje = new Date().toISOString().split('T')[0];
    const saldosAtuais = calcularSaldosRFEmData(ativo, hoje);
    // --- FIM DA CORREÇÃO ---

    document.getElementById('form-resgate-rf').reset();
    document.getElementById('resgate-rf-id').value = ativo.id;
    document.getElementById('resgate-rf-descricao').textContent = ativo.descricao;
    
    // CORREÇÃO: Exibe o saldo líquido total correto e atualizado
    document.getElementById('resgate-rf-saldo-atual').textContent = formatarMoeda(saldosAtuais.saldoLiquido);

    const selectConta = document.getElementById('resgate-rf-conta-destino');
    selectConta.innerHTML = '<option value="">Selecione a conta de crédito...</option>' + getTodasContasAtivas()
        .filter(c => c.tipo === 'Conta Corrente' || c.tipo === 'Conta Investimento')
        .map(c => `<option value="${c.id}">${c.banco} - ${c.tipo}</option>`).join('');
    
    abrirModal('modal-resgate-rf');
    document.getElementById('resgate-rf-valor').focus();
}
function abrirModalHistoricoRF(ativoRFId) {
    const ativo = todosOsAtivosRF.find(a => a.id === ativoRFId);
    if (!ativo) return;

    const modal = document.getElementById('modal-historico-rf');
    document.getElementById('historico-rf-descricao').textContent = ativo.descricao;
    
    renderizarHistoricoRF(ativoRFId);

    modal.style.display = 'block';
}
function renderizarHistoricoRF(ativoRFId) {
    const container = document.getElementById('historico-rf-container');
    const ativo = todosOsAtivosRF.find(a => a.id === ativoRFId);
    if (!ativo) {
        container.innerHTML = '<p style="text-align: center;">Erro: Ativo de Renda Fixa não encontrado.</p>';
        return;
    }
    
    const movimentacoes = todasAsMovimentacoes
        .filter(t => t.sourceId === ativoRFId && (t.source === 'aporte_rf' || t.source === 'resgate_rf'))
        .map(mov => {
            const conta = todasAsContas.find(c => String(c.id) === String(mov.idAlvo));
            return {
                id: mov.id,
                data: mov.data,
                tipo: mov.source === 'aporte_rf' ? 'Aporte' : 'Resgate',
                valor: Math.abs(mov.valor),
                conta: conta ? `${conta.banco} - ${conta.tipo}` : 'N/A',
                isInitial: false
            };
        });

    const historicoCompleto = [...movimentacoes];
    
    historicoCompleto.push({
        id: `inicial_${ativo.id}`,
        data: ativo.dataAplicacao,
        tipo: 'Investimento Inicial',
        valor: ativo.valorInvestido,
        conta: 'Aplicação Direta',
        isInitial: true
    });
    
    historicoCompleto.sort((a, b) => new Date(b.data) - new Date(a.data));

    if (historicoCompleto.length === 0) {
        container.innerHTML = '<p style="text-align: center; margin-top: 20px;">Nenhuma movimentação encontrada para esta aplicação.</p>';
        return;
    }

    let tableHtml = `<table>
                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Tipo</th>
                                <th class="numero">Valor (R$)</th>
                                <th>Conta</th>
                                <th class="controles-col">Ações</th>
                            </tr>
                        </thead>
                        <tbody>`;
    
    historicoCompleto.forEach(item => {
        const classe = item.tipo === 'Resgate' ? 'mov-resgate' : 'mov-aporte';
        const controlesHtml = item.isInitial
            ? `<i class="fas fa-lock" title="O aporte inicial é editado no cadastro do ativo."></i>`
            : `<i class="fas fa-edit acao-btn edit" title="Editar Movimentação" data-mov-rf-id="${item.id}"></i>
               <i class="fas fa-trash acao-btn delete" title="Excluir Movimentação" data-mov-rf-id="${item.id}"></i>`;
        
        tableHtml += `<tr class="${classe}">
                        <td>${new Date(item.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                        <td>${item.tipo}</td>
                        <td class="numero">${formatarMoeda(item.valor)}</td>
                        <td>${item.conta}</td>
                        <td class="controles-col" style="width: 90px;">${controlesHtml}</td>
                      </tr>`;
    });

    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
}
function renderizarPosicaoRF() {
    const container = document.getElementById('posicao-rf-container');
    const summaryContainer = document.getElementById('summary-rf');
    const filtroDataInput = document.querySelector('#tela-renda-fixa .date-filter');
    const filtroData = filtroDataInput.value || new Date().toISOString().split('T')[0];

    const ativosParaExibir = [];
    todosOsAtivosRF.forEach(ativo => {
        const descricao = (ativo.descricao || '').toLowerCase();
        // Tradução: inactive em vez de inativa
        const isInativa = descricao.includes('inactive') || descricao.includes('encerrada') || descricao.includes('inativa');
        
        const existeNaData = ativo.dataAplicacao <= filtroData;
        
        if (isInativa || !existeNaData) {
            return;
        }

        const saldosNaData = calcularSaldosRFEmData(ativo, filtroData);
        
        if (ativo.dataVencimento >= filtroData || saldosNaData.saldoLiquido > 0.001) {
            ativosParaExibir.push({ ...ativo, saldosCalculados: saldosNaData });
        }
    });
    
    if (ativosParaExibir.length === 0) {
        // Tradução do estado vazio
        container.innerHTML = '<p style="text-align: center;">No Fixed Income investments found for the selected date.</p>';
        summaryContainer.innerHTML = '';
        return;
    }
    
    let custoTotalRF = 0;
    let valorLiquidoRF = 0;
    let corpoTabela = '';
    
    ativosParaExibir.sort((a,b) => a.descricao.localeCompare(b.descricao)).forEach(ativo => {
        const saldos = ativo.saldosCalculados;
        custoTotalRF += saldos.valorInvestido;
        valorLiquidoRF += saldos.saldoLiquido;

        const diasCorridos = calcularDiffDias(ativo.dataAplicacao, filtroData);
        const rentabilidade = saldos.valorInvestido > 0 ? (saldos.rendimentoBruto / saldos.valorInvestido) : 0;

        const ultimoSnapshot = todosOsRendimentosRFNaoRealizados
            .filter(r => r.ativoId === ativo.id)
            .sort((a,b) => new Date(b.data) - new Date(a.data))[0];
        
        // Tradução: Atualizado em / Nunca atualizado
        const dataUltimoSnapshot = ultimoSnapshot 
            ? `Updated on: ${new Date(ultimoSnapshot.data + 'T12:00:00').toLocaleDateString('en-GB')}` 
            : 'Never updated';

        corpoTabela += `
            <tr>
                <td>${ativo.descricao}</td>
                <td>${ativo.instituicao}</td>
                <td class="numero">${new Date(ativo.dataAplicacao + 'T12:00:00').toLocaleDateString('en-GB')}</td>
                <td class="numero">${new Date(ativo.dataVencimento + 'T12:00:00').toLocaleDateString('en-GB')}</td>
                <td class="numero">${diasCorridos}</td>
                <td class="numero">${formatarMoeda(saldos.valorInvestido)}</td>
                <td class="numero editable-cell-container">
                    <div contenteditable="true" class="editable-saldo-rf" data-rf-id="${ativo.id}" title="Click to edit the net balance">${formatarMoeda(saldos.saldoLiquido)}</div>
                    <small class="snapshot-date">${dataUltimoSnapshot}</small>
                </td>
                <td class="numero ${saldos.rendimentoBruto >= 0 ? 'valor-positivo' : 'valor-negativo'}">${formatarMoeda(saldos.rendimentoBruto)}</td>
                <td class="percentual ${rentabilidade >= 0 ? 'valor-positivo' : 'valor-negativo'}">${formatarPercentual(rentabilidade)}</td>
                <td class="controles-col">
                    <button class="btn btn-sm btn-success btn-aportar-rf btn-acao-rf" data-rf-id="${ativo.id}" title="Contribute">+</button>
                    <button class="btn btn-sm btn-danger btn-resgatar-rf btn-acao-rf" data-rf-id="${ativo.id}" title="Redeem">-</button>
                    <button class="btn btn-sm btn-secondary btn-historico-rf btn-acao-rf" data-rf-id="${ativo.id}" title="History"><i class="fas fa-history"></i></button>
                    <i class="fas fa-trash acao-btn delete" title="Inactivate Investment" data-ativo-rf-id="${ativo.id}"></i>
                    </td>
            </tr>
        `;
    });

    const rendimentoTotal = valorLiquidoRF - custoTotalRF;
    const rentabilidadeTotal = custoTotalRF > 0 ? rendimentoTotal / custoTotalRF : 0;
    const classeResultado = rendimentoTotal >= 0 ? 'valor-positivo' : 'valor-negativo';

    // Tradução sumário RF
    summaryContainer.innerHTML = `
        <div class="summary-item">Total Cost (Contributions) <span>${formatarMoeda(custoTotalRF)}</span></div>
        <div class="summary-item">Current Net Balance <span>${formatarMoeda(valorLiquidoRF)}</span></div>
        <div class="summary-item">Total Yield <span class="${classeResultado}">${formatarMoeda(rendimentoTotal)} (${formatarPercentual(rentabilidadeTotal)})</span></div>
    `;
    const headers = `
        <th>Description</th>
        <th>Institution</th>
        <th class="numero">Invest. Date</th>
        <th class="numero">Maturity</th>
        <th class="numero">Days Elapsed</th>
        <th class="numero">Invested Amount</th>
        <th class="numero">Current Net Balance</th>
        <th class="numero">Net Yield</th>
        <th class="percentual">Profitability</th>
        <th class="controles-col">Actions</th>`;

    container.innerHTML = `<table><thead><tr>${headers}</tr></thead><tbody>${corpoTabela}</tbody></table>`;
}
function renderizarTabelaAtivosRF() {
    const container = document.getElementById('lista-de-ativos-rf');
    // Tradução dos cabeçalhos
    const tableHeaders = `
        <th>Description</th>
        <th>Institution</th>
        <th>Investment Date</th>
        <th>Maturity Date</th>
        <th class="numero">Invested Amount</th>
        <th class="numero">Net Balance</th>
        <th class="controles-col">Actions</th>`;
    container.innerHTML = `<table><thead><tr>${tableHeaders}</tr></thead><tbody></tbody></table>`;
    
    const body = container.querySelector('tbody');
    body.innerHTML = '';
    
    if (todosOsAtivosRF.length === 0) {
        // Tradução: Estado vazio
        body.innerHTML = '<tr><td colspan="7" style="text-align:center;">No Fixed Income investments registered.</td></tr>';
        return;
    }

    todosOsAtivosRF.sort((a,b) => a.descricao.localeCompare(b.descricao)).forEach(ativo => {
        const tr = document.createElement('tr');
        tr.dataset.rfId = ativo.id;
        
        // Usa formatarData (criada no bloco 1) ou toLocaleDateString('en-GB')
        const dataAplicacao = new Date(ativo.dataAplicacao + 'T12:00:00').toLocaleDateString('en-GB');
        const dataVencimento = new Date(ativo.dataVencimento + 'T12:00:00').toLocaleDateString('en-GB');

        // Tradução dos tooltips
        tr.innerHTML = `
            <td>${ativo.descricao}</td>
            <td>${ativo.instituicao}</td>
            <td>${dataAplicacao}</td>
            <td>${dataVencimento}</td>
            <td class="numero">${formatarMoeda(ativo.valorInvestido)}</td>
            <td class="numero">${formatarMoeda(ativo.saldoLiquido)}</td>
            <td class="controles-col">
                <i class="fas fa-edit acao-btn edit" title="Edit Investment" data-ativo-rf-id="${ativo.id}"></i>
                <i class="fas fa-trash acao-btn delete" title="Delete Investment" data-ativo-rf-id="${ativo.id}"></i>
            </td>`;
        body.appendChild(tr);
    });
}
function deletarAtivoRF(id) {
    const ativo = todosOsAtivosRF.find(a => a.id === id);
    if (!ativo) return;

    // Tradução: Confirmação de inativação
    // NOTA: Mantive a string "(inativa)" no código para não quebrar a lógica de filtro existente
    if (confirm(`Are you sure you want to INACTIVATE this fixed income investment?\n\n"${ativo.descricao}"\n\nIt will be hidden from the position screen, but its history will be kept.`)) {
        
        if (!ativo.descricao.trim().toLowerCase().endsWith('(inativa)')) {
            ativo.descricao = `${ativo.descricao.trim()} (inativa)`;
        }

        salvarAtivosRF();
        
        if (telas.cadastroRF.style.display === 'block') {
            renderizarTabelaAtivosRF();
        }
        if(telas.rendaFixa.style.display === 'block') {
            renderizarPosicaoRF();
        }
        // Tradução: Sucesso
        alert('Investment successfully inactivated!');
    }
}