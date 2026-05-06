// Fixed Income Engine // Motor de Renda Fixa
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
function deletarAtivoRF(id) {
    const ativo = todosOsAtivosRF.find(a => a.id === id);
    if (!ativo) return;
    if (confirm(`Tem certeza que deseja INATIVAR esta aplicação de renda fixa?\n\n"${ativo.descricao}"\n\nEla será ocultada da tela de posição, mas seu histórico será mantido.`)) {
        // Verifica se a descrição já não termina com (inativa) para não duplicar
        if (!ativo.descricao.trim().toLowerCase().endsWith('(inativa)')) {
            ativo.descricao = `${ativo.descricao.trim()} (inativa)`;
        }

        salvarAtivosRF();
        
        // Atualiza ambas as telas para refletir a mudança
        if (telas.cadastroRF.style.display === 'block') {
            renderizarTabelaAtivosRF();
        }
        if(telas.rendaFixa.style.display === 'block') {
            renderizarPosicaoRF();
        }
        alert('Aplicação inativada com sucesso!');
    }
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
function abrirModalCadastroAtivoRF(ativoRFParaEditar = null) {
    const form = document.getElementById('form-cadastro-ativo-rf');
    form.reset();
    const modalTitulo = document.getElementById('modal-ativo-rf-titulo');
    const valorInvestidoInput = document.getElementById('ativo-rf-valor-investido');
    const dataAplicacaoInput = document.getElementById('ativo-rf-data-aplicacao');
    const instituicaoSelect = document.getElementById('ativo-rf-instituicao');

    instituicaoSelect.innerHTML = '<option value="">Selecione...</option>' + getTodasInstituicoesAtivas().map(c => `<option value="${c}">${c}</option>`).join('');

    if (ativoRFParaEditar) {
        modalTitulo.textContent = 'Editar Aplicação em Renda Fixa';
        document.getElementById('ativo-rf-id').value = ativoRFParaEditar.id;
        document.getElementById('ativo-rf-descricao').value = ativoRFParaEditar.descricao;
        instituicaoSelect.value = ativoRFParaEditar.instituicao;
        valorInvestidoInput.value = formatarDecimalParaInput(ativoRFParaEditar.valorInvestido);
        dataAplicacaoInput.value = ativoRFParaEditar.dataAplicacao;
        document.getElementById('ativo-rf-data-vencimento').value = ativoRFParaEditar.dataVencimento;
        document.getElementById('ativo-rf-isento-ir').checked = ativoRFParaEditar.isentoIR;

        // CORREÇÃO: Campos de valor e data inicial agora são editáveis
        valorInvestidoInput.readOnly = false;
        dataAplicacaoInput.readOnly = false;
    } else {
        modalTitulo.textContent = 'Nova Aplicação em Renda Fixa';
        document.getElementById('ativo-rf-id').value = '';
        dataAplicacaoInput.value = new Date().toISOString().split('T')[0]; // Data padrão
        
        valorInvestidoInput.readOnly = false;
        dataAplicacaoInput.readOnly = false;
    }
    
    modalCadastroAtivoRF.style.display = 'block';
    document.getElementById('ativo-rf-descricao').focus();
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

function abrirModalEdicaoMovimentacaoRF(transacaoId) {
    const transacaoParaEditar = todasAsMovimentacoes.find(t => t.id === transacaoId);
    
    if (!transacaoParaEditar) {
        alert('Erro: Transação não encontrada.');
        return;
    }
    abrirModalNovaTransacaoMoeda(transacaoParaEditar);
}
function renderizarTabelaAtivosRF() {
    const container = document.getElementById('lista-de-ativos-rf');
    const tableHeaders = `
        <th>Descrição</th>
        <th>Instituição</th>
        <th>Data Aplicação</th>
        <th>Data Vencimento</th>
        <th class="numero">Valor Investido</th>
        <th class="numero">Saldo Líquido</th>
        <th class="controles-col">Controles</th>`;
    container.innerHTML = `<table><thead><tr>${tableHeaders}</tr></thead><tbody></tbody></table>`;
    
    const body = container.querySelector('tbody');
    body.innerHTML = '';
    
    if (todosOsAtivosRF.length === 0) {
        body.innerHTML = '<tr><td colspan="7" style="text-align:center;">Nenhuma aplicação de Renda Fixa cadastrada.</td></tr>';
        return;
    }

    todosOsAtivosRF.sort((a,b) => a.descricao.localeCompare(b.descricao)).forEach(ativo => {
        const tr = document.createElement('tr');
        tr.dataset.rfId = ativo.id;
        tr.innerHTML = `
            <td>${ativo.descricao}</td>
            <td>${ativo.instituicao}</td>
            <td>${new Date(ativo.dataAplicacao + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
            <td>${new Date(ativo.dataVencimento + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
            <td class="numero">${formatarMoeda(ativo.valorInvestido)}</td>
            <td class="numero">${formatarMoeda(ativo.saldoLiquido)}</td>
            <td class="controles-col">
                <i class="fas fa-edit acao-btn edit" title="Editar Aplicação" data-ativo-rf-id="${ativo.id}"></i>
                <i class="fas fa-trash acao-btn delete" title="Excluir Aplicação" data-ativo-rf-id="${ativo.id}"></i>
            </td>`;
        body.appendChild(tr);
    });
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
function renderizarPosicaoRF() {
    const container = document.getElementById('posicao-rf-container');
    const summaryContainer = document.getElementById('summary-rf');
    
    // Seletores dos Filtros (Estáticos no HTML)
    const filtroDataInput = document.getElementById('rf-filtro-data');
    const filtroInstituicaoSelect = document.getElementById('rf-filtro-instituicao');

    // Define data padrão se vazia
    if (!filtroDataInput.value) {
        filtroDataInput.value = new Date().toISOString().split('T')[0];
    }
    const filtroData = filtroDataInput.value;

    // --- Lógica de População do Select de Instituições ---
    // Pega a instituição selecionada atualmente para manter a seleção após o render
    const instituicaoSelecionadaAnteriormente = filtroInstituicaoSelect.value;
    
    // Extrai instituições únicas dos ativos ativos
    const instituicoesUnicas = [...new Set(todosOsAtivosRF
        .filter(a => !(a.descricao || '').toLowerCase().includes('encerrada'))
        .map(a => a.instituicao))].sort();

    // Reconstrói as opções do select mantendo a estrutura estática
    let optionsHtml = '<option value="consolidado">Consolidado (Todas)</option>';
    optionsHtml += instituicoesUnicas.map(inst => `<option value="${inst}">${inst}</option>`).join('');
    filtroInstituicaoSelect.innerHTML = optionsHtml;

    // Restaura seleção anterior se ainda existir
    if (instituicaoSelecionadaAnteriormente && (instituicaoSelecionadaAnteriormente === 'consolidado' || instituicoesUnicas.includes(instituicaoSelecionadaAnteriormente))) {
        filtroInstituicaoSelect.value = instituicaoSelecionadaAnteriormente;
    }
    const filtroInstituicao = filtroInstituicaoSelect.value;


    // --- Filtragem e Cálculo dos Dados ---
    const ativosParaExibir = [];
    
    todosOsAtivosRF.forEach(ativo => {
        const descricao = (ativo.descricao || '').toLowerCase();
        const isInativa = descricao.includes('inativa') || descricao.includes('encerrada');
        const existeNaData = ativo.dataAplicacao <= filtroData;
        
        // Filtro de Instituição
        const pertenceInstituicao = filtroInstituicao === 'consolidado' || ativo.instituicao === filtroInstituicao;

        if (isInativa || !existeNaData || !pertenceInstituicao) {
            return;
        }

        const saldosNaData = calcularSaldosRFEmData(ativo, filtroData);
        
        if (ativo.dataVencimento >= filtroData || saldosNaData.saldoLiquido > 0.001) {
            ativosParaExibir.push({ ...ativo, saldosCalculados: saldosNaData });
        }
    });
    
    // --- Renderização: Caso Sem Dados ---
    if (ativosParaExibir.length === 0) {
        container.innerHTML = `
            <div class="dash-card">
                <div class="dash-body" style="text-align: center; padding: 40px; color: #666;">
                    <i class="fas fa-university" style="font-size: 2rem; margin-bottom: 15px; display: block; color: #bdc3c7;"></i>
                    Nenhuma aplicação de Renda Fixa encontrada para os filtros selecionados.
                </div>
            </div>`;
        summaryContainer.innerHTML = '';
        return;
    }
    
    // --- Renderização: Cálculos Totais ---
    let custoTotalRF = 0;
    let valorLiquidoRF = 0;
    let corpoTabela = '';
    
    // Ordenação e Construção das Linhas
    ativosParaExibir.sort((a,b) => a.descricao.localeCompare(b.descricao)).forEach(ativo => {
        const saldos = ativo.saldosCalculados;
        custoTotalRF += saldos.valorInvestido;
        valorLiquidoRF += saldos.saldoLiquido;

        const diasCorridos = calcularDiffDias(ativo.dataAplicacao, filtroData);
        const rentabilidade = saldos.valorInvestido > 0 ? (saldos.rendimentoBruto / saldos.valorInvestido) : 0;

        // Lógica de Snapshot (Mantida do original)
        const ultimoSnapshot = todosOsRendimentosRFNaoRealizados
            .filter(r => r.ativoId === ativo.id)
            .sort((a,b) => new Date(b.data) - new Date(a.data))[0];
        
        const dataUltimoSnapshot = ultimoSnapshot 
            ? `Atualizado: ${new Date(ultimoSnapshot.data + 'T12:00:00').toLocaleDateString('pt-BR')}` 
            : 'Sem atualização';

        corpoTabela += `
            <tr>
                <td style="font-weight: 500;">
                    ${ativo.descricao}
                    <div style="font-size: 0.8em; color: #7f8c8d;">${ativo.instituicao}</div>
                </td>
                <td class="numero">${new Date(ativo.dataAplicacao + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td class="numero">${new Date(ativo.dataVencimento + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td class="numero">${diasCorridos}</td>
                <td class="numero">${formatarMoeda(saldos.valorInvestido)}</td>
                
                <td class="numero editable-cell-container" style="background-color: #fcfcfc;">
                    <div contenteditable="true" class="editable-saldo-rf" data-rf-id="${ativo.id}" title="Clique para editar o saldo líquido" style="font-weight: bold; color: #2c3e50;">
                        ${formatarMoeda(saldos.saldoLiquido)}
                    </div>
                    <small class="snapshot-date" style="display: block; font-size: 0.7em; color: #95a5a6;">${dataUltimoSnapshot}</small>
                </td>
                
                <td class="numero ${saldos.rendimentoBruto >= 0 ? 'valor-positivo' : 'valor-negativo'}">
                    ${formatarMoeda(saldos.rendimentoBruto)}
                </td>
                <td class="percentual ${rentabilidade >= 0 ? 'valor-positivo' : 'valor-negativo'}">
                    ${formatarPercentual(rentabilidade)}
                </td>
                
                <td class="controles-col text-right">
                    <div class="btn-group" role="group">
                        <button class="btn btn-sm btn-success btn-aportar-rf btn-acao-rf" data-rf-id="${ativo.id}" title="Aportar" style="color: white;">
                            <i class="fas fa-plus"></i>
                        </button>
                        <button class="btn btn-sm btn-danger btn-resgatar-rf btn-acao-rf" data-rf-id="${ativo.id}" title="Resgatar" style="color: white;">
                            <i class="fas fa-minus"></i>
                        </button>
                        <button class="btn btn-sm btn-info btn-historico-rf btn-acao-rf" data-rf-id="${ativo.id}" title="Histórico" style="color: white;">
                            <i class="fas fa-history"></i>
                        </button>
                        <button class="btn btn-sm btn-secondary delete" data-ativo-rf-id="${ativo.id}" title="Excluir/Inativar" style="color: white;">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    const rendimentoTotal = valorLiquidoRF - custoTotalRF;
    const rentabilidadeTotal = custoTotalRF > 0 ? rendimentoTotal / custoTotalRF : 0;
    const isPositivo = rendimentoTotal >= 0;
    const corResultado = isPositivo ? '#27ae60' : '#e74c3c'; // Verde ou Vermelho
    const iconeResultado = isPositivo ? 'fa-arrow-up' : 'fa-arrow-down';

    // --- Renderização: Cards de Resumo (Topo) ---
    summaryContainer.innerHTML = `
        <div class="dash-summary-card card-invest">
            <div class="dash-card-title">Total Aplicado</div>
            <div class="dash-card-value">${formatarMoeda(custoTotalRF)}</div>
        </div>
        <div class="dash-summary-card card-patrimonio">
            <div class="dash-card-title">Saldo Líquido</div>
            <div class="dash-card-value">${formatarMoeda(valorLiquidoRF)}</div>
        </div>
        <div class="dash-summary-card" style="border-bottom: 4px solid ${corResultado}">
            <div class="dash-card-title">Rendimento</div>
            <div class="dash-card-value" style="color: ${corResultado}">
                ${formatarMoeda(rendimentoTotal)}
            </div>
        </div>
        <div class="dash-summary-card">
            <div class="dash-card-title">Rentabilidade Média</div>
            <div class="dash-card-value" style="color: ${corResultado}">
                <i class="fas ${iconeResultado}" style="font-size: 0.6em;"></i> ${formatarPercentual(rentabilidadeTotal)}
            </div>
        </div>
    `;

    // --- Renderização: Tabela Principal (Card) ---
    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-header" style="background-color: #27ae60; color: white; padding: 15px;">
                <h3 style="margin: 0; font-size: 1.1em;"><i class="fas fa-list"></i> Detalhamento dos Ativos</h3>
            </div>
            <div class="dash-body table-responsive">
                <table class="table table-hover table-striped">
                    <thead>
                        <tr>
                            <th>Descrição</th>
                            <th class="numero">Aplicação</th>
                            <th class="numero">Vencimento</th>
                            <th class="numero">Dias</th>
                            <th class="numero">Valor Investido</th>
                            <th class="numero">Saldo Líquido</th>
                            <th class="numero">Rendimento</th>
                            <th class="percentual">Rentabilidade</th>
                            <th class="text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${corpoTabela}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    // Atualiza texto informativo no card de filtros
    const infoFiltroElement = document.getElementById('filtro-info-rf');
    if(infoFiltroElement) {
        infoFiltroElement.innerText = filtroInstituicao === 'consolidado' ? 'Visualizando Todas as Instituições' : `Filtro: ${filtroInstituicao}`;
    }
}
