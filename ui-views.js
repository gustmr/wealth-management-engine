// Tables and Various Screens // Tabelas e Telas Gerais
function renderizarTelaPerformanceRV() {
    const container = document.getElementById('container-tabela-performance');
    container.innerHTML = '<h4><i class="fas fa-spinner fa-spin"></i> Calculando performance de todos os ciclos de investimento...</h4>';

    setTimeout(() => {
        const filtroTipo = document.getElementById('performance-filtro-tipo').value;
        const filtroPeriodo = document.getElementById('performance-filtro-periodo').value;
        const hoje = new Date().toISOString().split('T')[0];
        
        let dadosParaTabela = [];

        // --- PARTE 1: Processar Ciclos Atuais (Abertos) ---
        const posicoesAtuais = gerarPosicaoDetalhada();
        for (const ticker in posicoesAtuais) {
            const posicao = posicoesAtuais[ticker];
            if (posicao.quantidade < 0.000001) continue;

            const ativoInfo = todosOsAtivos.find(a => a.ticker === ticker);
            if (!ativoInfo || (filtroTipo !== 'todos' && ativoInfo.tipo !== filtroTipo)) continue;

            const dataInicioCiclo = getInicioIninterrupto(ticker);
            if (!dataInicioCiclo) continue; // Pula se não encontrar um início claro

            // Filtra os eventos para o ciclo atual
            const proventosDoCiclo = todosOsProventos.filter(p => p.ticker === ticker && p.dataPagamento && p.dataPagamento >= dataInicioCiclo);
            const resultadosRealizadosMap = calcularResultadosRealizados([ticker], new Map([[ticker, dataInicioCiclo]]));

            const dadosMercado = dadosDeMercado.cotacoes[ticker] || {};
            const precoAtual = dadosMercado.valor || 0;
            const custoTotal = posicao.quantidade * posicao.precoMedio;
            const valorDeMercado = posicao.quantidade * precoAtual;
            
            const proventosRecebidos = proventosDoCiclo.reduce((soma, p) => soma + p.valorTotalRecebido, 0);
            const projecaoAnual = (ativoInfo.tipo === 'Ação') ? calcularProjecaoAnualUnitaria(ticker, {limiteAnos: 5}) : (getUltimoProvento(ticker) * 12);
            
            const variacaoNaoRealizada = valorDeMercado - custoTotal;
            const resultadoRealizado = resultadosRealizadosMap.get(ticker) || 0;
            const retornoTotal = variacaoNaoRealizada + resultadoRealizado + proventosRecebidos;
            const variacaoPercentual = custoTotal > 0 ? variacaoNaoRealizada / custoTotal : 0;

            let { fluxos, datas } = construirFluxoDeCaixa([ticker], hoje);
            if (fluxos.length > 0) {
                fluxos.push(valorDeMercado); // Adiciona o valor de mercado como última entrada de caixa
                datas.push(hoje);
            }
            const tir = calcularTIR(fluxos, datas);

            const vp = dadosMercado.vpa || 0;
            const yieldSobreVP = (vp > 0 && projecaoAnual > 0) ? projecaoAnual / vp : 0;

            dadosParaTabela.push({
                ticker: ticker, tipo: ativoInfo.tipo, status: 'Em Carteira',
                periodo: `${new Date(dataInicioCiclo + 'T12:00:00').toLocaleDateString('pt-BR')} - Atual`,
                quantidade: posicao.quantidade, precoMedio: posicao.precoMedio, custoTotal: custoTotal, valorDeMercado: valorDeMercado,
                variacaoNaoRealizada, variacaoPercentual, resultadoRealizado, proventosRecebidos, retornoTotal, tir,
                yocProjetado: posicao.precoMedio > 0 ? projecaoAnual / posicao.precoMedio : 0,
                dyProjetado: precoAtual > 0 ? projecaoAnual / precoAtual : 0,
                pl: (ativoInfo.tipo === 'Ação' && dadosMercado.lpa_acao > 0 && precoAtual > 0) ? precoAtual / dadosMercado.lpa_acao : 0,
                pvp: (vp > 0 && precoAtual > 0) ? precoAtual / vp : 0, // P/VP unificado
                yieldSobreVP: yieldSobreVP
            });
        }

        // --- PARTE 2: Processar Ciclos Encerrados (Zerados) ---
        const ciclosEncerrados = gerarRelatorioPosicoesZeradas();
        ciclosEncerrados.forEach(ciclo => {
            const ativoInfo = todosOsAtivos.find(a => a.ticker === ciclo.ticker);
            if (!ativoInfo || (filtroTipo !== 'todos' && ativoInfo.tipo !== filtroTipo)) return;

            let { fluxos, datas } = construirFluxoDeCaixa([ciclo.ticker], ciclo.dataEncerramento);
            
            const fluxosFiltrados = [], datasFiltradas = [];
            for(let i = 0; i < datas.length; i++) {
                if (datas[i] >= ciclo.dataInicio && datas[i] <= ciclo.dataEncerramento) {
                    fluxosFiltrados.push(fluxos[i]);
                    datasFiltradas.push(datas[i]);
                }
            }
            
            if (fluxosFiltrados.length === 0) return;
            
            const custoTotalCiclo = -fluxosFiltrados.filter(v => v < 0).reduce((soma, v) => soma + v, 0);
            const proventosRecebidos = fluxosFiltrados.filter((v, i) => v > 0 && todosOsProventos.some(p => p.dataPagamento === datasFiltradas[i] && p.valorTotalRecebido === v)).reduce((soma, v) => soma + v, 0);
            const valorTotalVendas = fluxosFiltrados.filter(v => v > 0).reduce((soma, v) => soma + v, 0) - proventosRecebidos;
            
            const resultadoRealizado = valorTotalVendas - custoTotalCiclo;
            const retornoTotal = resultadoRealizado + proventosRecebidos;
            const tir = calcularTIR(fluxosFiltrados, datasFiltradas);
            
            dadosParaTabela.push({
                ticker: ciclo.ticker, tipo: ativoInfo.tipo, status: 'Zerado',
                periodo: `${new Date(ciclo.dataInicio + 'T12:00:00').toLocaleDateString('pt-BR')} - ${new Date(ciclo.dataEncerramento + 'T12:00:00').toLocaleDateString('pt-BR')}`,
                quantidade: 0, precoMedio: 0, custoTotal: custoTotalCiclo, valorDeMercado: valorTotalVendas,
                variacaoNaoRealizada: 0, variacaoPercentual: 0, resultadoRealizado, proventosRecebidos, retornoTotal, tir,
                yocProjetado: 0, dyProjetado: 0, pl: 0, pvp: 0,
                yieldSobreVP: 0
            });
        });
        
        if (filtroPeriodo === 'atuais') {
            dadosParaTabela = dadosParaTabela.filter(d => d.status === 'Em Carteira');
        } else if (filtroPeriodo === 'encerrados') {
            dadosParaTabela = dadosParaTabela.filter(d => d.status === 'Zerado');
        }

        const sortKey = sortConfigPerformanceRV.key;
        const sortDirection = sortConfigPerformanceRV.direction === 'ascending' ? 1 : -1;
        dadosParaTabela.sort((a, b) => {
            let valA = a[sortKey] || 0;
            let valB = b[sortKey] || 0;
            if (typeof valA === 'string') {
                return valA.localeCompare(valB) * sortDirection;
            }
            return (valA - valB) * sortDirection;
        });

        // --- INÍCIO DA ALTERAÇÃO TAREFA 1: Ajuste de Cabeçalhos ---
        const headers = `
            <tr>
                <th rowspan="2" class="sortable" data-key="ticker">Ativo</th>
                <th rowspan="2" class="sortable" data-key="periodo">Período</th>
                <th colspan="4" class="group-header group-1">Posição na Carteira</th>
                <th colspan="4" class="group-header group-2">Performance Pessoal</th>
                <th colspan="5" class="group-header group-3">Indicadores de Mercado</th> 
            </tr>
            <tr>
                <th class="numero sortable group-1" data-key="quantidade">Qtd.</th>
                <th class="numero sortable group-1" data-key="precoMedio">Preço Médio</th>
                <th class="numero sortable group-1" data-key="custoTotal">Custo Total</th>
                <th class="numero sortable group-1" data-key="valorDeMercado">Valor Mercado / Final</th>
                <th class="numero sortable group-2" data-key="resultadoRealizado">Variação / Result.</th>
                <th class="numero sortable group-2" data-key="proventosRecebidos">Proventos</th>
                <th class="numero sortable group-2 col-retorno-total" data-key="retornoTotal">Retorno Total</th>
                <th class="percentual sortable group-2" data-key="tir">TIR Anual</th>
                <th class="percentual sortable group-3" data-key="yocProjetado">YoC Proj.</th>
                <th class="percentual sortable group-3" data-key="dyProjetado">DY Proj.</th>
                <th class="numero sortable group-3" data-key="pvp">P/VP</th>
                <th class="numero sortable group-3" data-key="pl">P/L</th> 
                <th class="percentual sortable group-3" data-key="yieldSobreVP">Yield s/VP</th>
            </tr>`;
        // --- FIM DA ALTERAÇÃO TAREFA 1 ---

        let corpoTabela = '';
        dadosParaTabela.forEach(d => {
            const isEmCarteira = d.status === 'Em Carteira';
            const valorPrincipalVariacao = isEmCarteira ? d.variacaoNaoRealizada : d.resultadoRealizado;
            const percentualVariacao = d.custoTotal > 0 ? valorPrincipalVariacao / d.custoTotal : 0;
            const labelVariacao = isEmCarteira ? 'Variação (Não Realizada)' : 'Resultado Realizado';

            const classeRetorno = d.retornoTotal >= 0 ? 'valor-positivo' : 'valor-negativo';
            const classeVariacao = valorPrincipalVariacao >= 0 ? 'valor-positivo' : 'valor-negativo';
            const classeTir = d.tir >= 0 ? 'valor-positivo' : 'valor-negativo';
            
            // --- INÍCIO DA ALTERAÇÃO TAREFA 1: Separação P/VP e P/L ---
            const pvpFormatado = (d.pvp > 0 && isEmCarteira) ? formatarDecimal(d.pvp) : 'N/A';
            const plFormatado = (d.tipo === 'Ação' && d.pl > 0 && isEmCarteira) ? formatarDecimal(d.pl) : 'N/A';
            // --- FIM DA ALTERAÇÃO TAREFA 1 ---

            corpoTabela += `<tr class="row-clickable" data-ticker="${d.ticker}" data-custo-total="${d.custoTotal}" data-proventos="${d.proventosRecebidos}" data-realizado="${d.resultadoRealizado}">
                <td><strong>${d.ticker}</strong><small style="display: block;">${d.tipo} / ${d.status}</small></td>
                <td class="col-posicao-desde">${d.periodo}</td>
                <td class="numero group-1">${isEmCarteira ? Math.round(d.quantidade) : '-'}</td>
                <td class="numero group-1">${isEmCarteira ? formatarPrecoMedio(d.precoMedio) : '-'}</td>
                <td class="numero group-1">${formatarMoeda(d.custoTotal)}</td>
                <td class="numero group-1">${formatarMoeda(d.valorDeMercado)}</td>
                <td class="numero group-2 ${classeVariacao}">
                    <span class="valor-principal" title="${labelVariacao}">${formatarMoeda(valorPrincipalVariacao)}</span>
                    <span class="valor-secundario ${classeVariacao}">${formatarPercentual(percentualVariacao)}</span>
                </td>
                <td class="numero group-2 valor-positivo">${formatarMoeda(d.proventosRecebidos)}</td>
                <td class="numero group-2 col-retorno-total ${classeRetorno}">
                    <span class="valor-principal">${formatarMoeda(d.retornoTotal)}</span>
                </td>
                <td class="percentual group-2 ${classeTir}">${isNaN(d.tir) ? 'N/A' : formatarPercentual(d.tir)}</td>
                <td class="percentual group-3">${isEmCarteira ? formatarPercentual(d.yocProjetado) : '-'}</td>
                <td class="percentual group-3">${isEmCarteira ? formatarPercentual(d.dyProjetado) : '-'}</td>
                <td class="numero group-3">${pvpFormatado}</td>
                <td class="numero group-3">${plFormatado}</td>
                <td class="percentual group-3">${isEmCarteira ? formatarPercentual(d.yieldSobreVP) : '-'}</td>
            </tr>`;
        });
        
        container.innerHTML = `<table id="tabela-performance"><thead>${headers}</thead><tbody>${corpoTabela}</tbody></table>`;
        
        document.querySelectorAll('#tabela-performance .sortable').forEach(header => {
            header.classList.remove('ascending', 'descending');
            if (header.dataset.key === sortConfigPerformanceRV.key) {
                header.classList.add(sortConfigPerformanceRV.direction);
            }
        });

    }, 50);
}
function renderizarResultadoCrescimento(resultados, intervaloValor) {
    const container = document.getElementById('container-resultado-crescimento');
    if (!resultados || resultados.length <= 1) {
        container.innerHTML = '<p>Não foi possível encontrar marcos de crescimento suficientes com o intervalo de valor fornecido.</p>';
        container.style.display = 'block';
        return;
    }

    let tableHtml = `
        <h4>Marcos de Crescimento (Intervalo de R$ ${formatarDecimal(intervaloValor)})</h4>
        <table>
            <thead>
                <tr>
                    <th>Data do Marco</th>
                    <th class="numero">Saldo Atingido</th>
                    <th class="numero">Crescimento Realizado</th>
                    <th>Tempo desde o Marco Anterior</th>
                </tr>
            </thead>
            <tbody>
    `;

    for (let i = 0; i < resultados.length; i++) {
        const item = resultados[i];
        const dataFormatada = new Date(item.data + 'T12:00:00').toLocaleDateString('pt-BR');
        tableHtml += `
            <tr>
                <td>${dataFormatada}</td>
                <td class="numero">${formatarMoeda(item.saldo)}</td>
                <td class="numero">${i === 0 ? '-' : formatarMoeda(item.diffValor)}</td>
                <td>${item.tempo}</td>
            </tr>
        `;
    }

    tableHtml += `</tbody></table>`;
    container.innerHTML = tableHtml;
    container.style.display = 'block';
}
function renderizarResultadoCrescimentoPorPeriodo(resultados) {
    const container = document.getElementById('container-resultado-crescimento');
    if (!resultados || resultados.length === 0) {
        container.innerHTML = '<p>Não foi possível encontrar dados de crescimento para o período e filtros selecionados.</p>';
        container.style.display = 'block';
        return;
    }

    let tableHtml = `
        <h4>Performance por Período</h4>
        <table>
            <thead>
                <tr>
                    <th>Período</th>
                    <th class="numero">Saldo Inicial</th>
                    <th class="numero">Saldo Final</th>
                    <th class="numero">Crescimento (R$)</th>
                    <th class="percentual">Crescimento (%)</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    let saldoPeriodoAnterior = resultados[0].saldoInicial;

    resultados.forEach((item, index) => {
        const dataInicioFmt = item.dataInicioPeriodo.toLocaleDateString('pt-BR');
        const dataFimFmt = item.dataFimPeriodo.toLocaleDateString('pt-BR');
        
        let crescimentoValor, crescimentoPercentual, classeResultado, saldoInicialFmt;

        if (index === 0) {
            crescimentoValor = '-';
            crescimentoPercentual = '-';
            classeResultado = '';
            saldoInicialFmt = '-';
        } else {
            const crescimento = item.saldoFinal - saldoPeriodoAnterior;
            classeResultado = crescimento >= 0 ? 'valor-positivo' : 'valor-negativo';
            crescimentoValor = formatarMoeda(crescimento);
            crescimentoPercentual = saldoPeriodoAnterior > 0 ? formatarPercentual(crescimento / saldoPeriodoAnterior) : 'Infinity%';
            saldoInicialFmt = formatarMoeda(saldoPeriodoAnterior);
        }
        
        tableHtml += `
            <tr>
                <td>${dataInicioFmt} - ${dataFimFmt}</td>
                <td class="numero">${saldoInicialFmt}</td>
                <td class="numero">${formatarMoeda(item.saldoFinal)}</td>
                <td class="numero ${classeResultado}">${crescimentoValor}</td>
                <td class="percentual ${classeResultado}">${crescimentoPercentual}</td>
            </tr>
        `;
        
        saldoPeriodoAnterior = item.saldoFinal;
    });

    tableHtml += `</tbody></table>`;
    container.innerHTML = tableHtml;
    container.style.display = 'block';
}
function renderizarTabelaFeriados() {
    const container = document.getElementById('lista-de-feriados');
    container.innerHTML = `<table><thead><tr><th>Data</th><th>Descrição</th><th class="controles-col">Controles</th></tr></thead><tbody></tbody></table>`;
    const body = container.querySelector('tbody');
    body.innerHTML = '';
    if (todosOsFeriados.length === 0) {
        body.innerHTML = '<tr><td colspan="3" style="text-align:center;">Nenhum feriado cadastrado.</td></tr>';
        return;
    }
    todosOsFeriados.sort((a,b) => new Date(a.data) - new Date(b.data)).forEach(feriado => {
        const tr = document.createElement('tr');
        const dataFormatada = new Date(feriado.data + 'T12:00:00').toLocaleDateString('pt-BR');
        tr.innerHTML = `<td>${dataFormatada}</td><td>${feriado.descricao}</td><td class="controles-col"><i class="fas fa-edit acao-btn edit" title="Editar Feriado" data-feriado-id="${feriado.id}"></i><i class="fas fa-trash acao-btn delete" title="Excluir Feriado" data-feriado-id="${feriado.id}"></i></td>`;
        body.appendChild(tr);
    });
}
function abrirModalFeriado(feriadoParaEditar = null) {
    const form = document.getElementById('form-cadastro-feriado');
    form.reset();
    if (feriadoParaEditar) {
        document.getElementById('modal-feriado-titulo').textContent = 'Editar Feriado';
        document.getElementById('feriado-id').value = feriadoParaEditar.id;
        document.getElementById('feriado-data').value = feriadoParaEditar.data;
        document.getElementById('feriado-descricao').value = feriadoParaEditar.descricao;
    } else {
        document.getElementById('modal-feriado-titulo').textContent = 'Cadastrar Novo Feriado';
        document.getElementById('feriado-id').value = '';
    }
    modalCadastroFeriado.style.display = 'block';
    document.getElementById('feriado-data').focus();
}
function deletarFeriado(feriadoId) {
    if (confirm('Tem certeza que deseja excluir este feriado?')) {
        todosOsFeriados = todosOsFeriados.filter(f => f.id !== feriadoId);
        salvarFeriados();
        renderizarTabelaFeriados();
    }
}
function abrirModalEventoAtivo(ajusteParaEditar = null) {
    const form = document.getElementById('form-evento-ativo');
    form.reset();
    const tituloModal = document.getElementById('modal-evento-ativo-titulo');
    const idInput = document.getElementById('evento-ativo-id');
    const saveButton = form.querySelector('button[type="submit"]');

    document.getElementById('container-evento-entrada-fields').style.display = 'none';
    document.getElementById('container-evento-saida-fields').style.display = 'none';

    if (ajusteParaEditar) {
        tituloModal.textContent = 'Editar Evento de Ativo';
        idInput.value = ajusteParaEditar.id;
        document.getElementById('evento-ativo-tipo').value = ajusteParaEditar.tipoEvento;
        document.getElementById('evento-ativo-data').value = ajusteParaEditar.data;
        document.getElementById('evento-ativo-ticker').value = ajusteParaEditar.ticker;

        // Mostra o botão imediatamente se estiver editando
        saveButton.style.display = 'block';

        setTimeout(() => {
            document.getElementById('evento-ativo-tipo').dispatchEvent(new Event('change'));
            document.getElementById('evento-ativo-ticker').dispatchEvent(new Event('change'));
            
            if (ajusteParaEditar.tipoEvento === 'entrada') {
                document.getElementById('evento-ativo-pm').value = formatarDecimalParaInput(ajusteParaEditar.precoMedio);
                ajusteParaEditar.detalhes.forEach(detalhe => {
                    const inputQtd = document.querySelector(`#evento-entrada-corretoras-container .evento-entrada-qtd[data-corretora="${detalhe.corretora}"]`);
                    if (inputQtd) inputQtd.value = detalhe.quantidade;
                });
            } else if (ajusteParaEditar.tipoEvento === 'saida') {
                ajusteParaEditar.detalhes.forEach(detalhe => {
                    const inputQtd = document.querySelector(`#evento-saida-posicao-container .qtd-saida-input[data-corretora="${detalhe.corretora}"]`);
                    if (inputQtd) inputQtd.value = detalhe.quantidade;
                });
            }
        }, 150);
        
    } else {
        tituloModal.textContent = 'Registrar Evento de Ativo';
        idInput.value = '';
    }

    modalEventoAtivo.style.display = 'block';
    document.getElementById('evento-ativo-tipo').focus();
}
function toggleSelecaoVenda(ticker) {
    // Se não estiver definido, assume que estava 'true' (padrão) e vira 'false'
    if (estadoSelecaoVendas[ticker] === undefined) {
        estadoSelecaoVendas[ticker] = false;
    } else {
        // Inverte o estado atual
        estadoSelecaoVendas[ticker] = !estadoSelecaoVendas[ticker];
    }
    renderizarTelaConsultaBalanceamento();
}
function gerarLinhaPosicaoMassaHTML() {
    const corretorasOptions = getTodasCorretoras().map(c => `<option value="${c}">${c}</option>`).join('');

    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="text" class="pos-massa-ticker ticker-input" placeholder="ITSA4"></td>
        <td><input type="date" class="pos-massa-data"></td>
        <td><input type="text" class="pos-massa-pm" placeholder="Ex: 10,123456"></td>
        <td><input type="number" class="pos-massa-qtd" min="1" step="1" placeholder="100"></td>
        <td>
            <select class="pos-massa-corretora">
                <option value="">Selecione...</option>
                ${corretorasOptions}
            </select>
        </td>
        <td><button type="button" class="btn btn-danger btn-sm" onclick="this.closest('tr').remove()" title="Remover Linha"><i class="fas fa-trash"></i></button></td>
    `;
    return tr;
}

function renderizarTelaPosicaoMassa() {
    const tbody = document.getElementById('tabela-posicao-massa-body');
    tbody.innerHTML = '';
    for (let i = 0; i < 20; i++) {
        tbody.appendChild(gerarLinhaPosicaoMassaHTML());
    }
}
function gerarLinhaProventoMassaHTML() {
    const tr = document.createElement('tr');
    
    // HTML limpo, sem chamadas a funções inexistentes
    tr.innerHTML = `
        <td>
            <input type="text" class="form-control prov-massa-ticker" placeholder="Ticker" 
                   oninput="this.value = this.value.toUpperCase()" title="Digite um ativo cadastrado">
        </td>
        <td><input type="date" class="form-control prov-massa-data-com"></td>
        <td><input type="date" class="form-control prov-massa-data-pag"></td>
        <td>
            <select class="form-control prov-massa-tipo">
                <option value="Dividendo">Dividendo</option>
                <option value="JCP">JCP</option>
                <option value="Rendimento">Rendimento</option>
                <option value="Bonificação">Bonificação</option>
                <option value="Amortização">Amortização</option>
            </select>
        </td>
        <td><input type="text" class="form-control prov-massa-valor-bruto" placeholder="0,00"></td>
        <td><input type="number" class="form-control prov-massa-ir" placeholder="%" step="0.01"></td>
        <td style="text-align: center;">
            <button class="btn-delete-row" onclick="this.closest('tr').remove()" title="Remover linha">
                <i class="fas fa-trash"></i>
            </button>
        </td>
    `;

    // --- LÓGICA DE VALIDAÇÃO VISUAL E CÁLCULO DE IR ---
    const inputTicker = tr.querySelector('.prov-massa-ticker');
    const selectTipo = tr.querySelector('.prov-massa-tipo');
    const inputIR = tr.querySelector('.prov-massa-ir');

    const validarEPreencher = () => {
        const ticker = inputTicker.value.toUpperCase().trim();
        const tipo = selectTipo.value;

        if (!ticker) {
            inputTicker.classList.remove('input-erro');
            return;
        }

        // Verifica se ativo existe (igual ao código de Posições que você mandou)
        let listaAtivos = (typeof todosOsAtivos !== 'undefined') ? todosOsAtivos : [];
        const ativoExiste = listaAtivos.some(a => a.ticker === ticker);

        if (!ativoExiste) {
            inputTicker.classList.add('input-erro'); // Borda vermelha
            inputTicker.title = "Ativo não encontrado na sua carteira!";
            inputIR.value = ''; 
        } else {
            inputTicker.classList.remove('input-erro');
            inputTicker.title = ""; 

            // Calcula IR (Inteligência nova)
            if (tipo) {
                const aliquotaDecimal = calcularValorIRSugerido(ticker, tipo);
                // Proteção contra NaN
                if (!isNaN(aliquotaDecimal)) {
                    const porcentagem = aliquotaDecimal * 100;
                    inputIR.value = parseFloat(porcentagem.toFixed(2));
                }
            }
        }
    };

    inputTicker.addEventListener('change', validarEPreencher);
    selectTipo.addEventListener('change', validarEPreencher);

    return tr;
}
function renderizarTelaProventosMassa() {
    const tbody = document.getElementById('tabela-proventos-massa-body');
    tbody.innerHTML = '';
    for (let i = 0; i < 20; i++) { // Começa com 20 linhas vazias
        tbody.appendChild(gerarLinhaProventoMassaHTML());
    }
}
function renderizarTabelaPosicaoInicial() {
    const container = document.getElementById('lista-de-posicoes-iniciais');
    container.innerHTML = `<table><thead><tr><th>Tipo</th><th>Data</th><th>Ativo</th><th>Detalhes</th><th class="numero">Preço Médio</th><th class="controles-col">Controles</th></tr></thead><tbody></tbody></table>`;
    const body = container.querySelector('tbody');
    body.innerHTML = '';
    
    posicaoInicial.sort((a, b) => {
        const tickerComparison = (a.ticker || '').localeCompare(b.ticker || '');
        if (tickerComparison !== 0) {
            return tickerComparison;
        }
        return new Date(a.data) - new Date(b.data);
    }).forEach(pos => {
        const tr = document.createElement('tr');
        let detalhes = '';
        let tipoRegistroLabel = '';
        let controlesHtml = `<i class="fas fa-trash acao-btn delete" title="Excluir Registro" data-posicao-id="${pos.id}"></i>`; // Botão de excluir padrão

        switch(pos.tipoRegistro) {
            case 'SUMARIO_MANUAL':
                tipoRegistroLabel = 'Manual';
                detalhes = pos.posicoesPorCorretora.map(pc => `${pc.corretora}: ${pc.quantidade}`).join(', ');
                // Adiciona o botão de editar apenas para este tipo
                controlesHtml = `<i class="fas fa-edit acao-btn edit" title="Editar Registro" data-edit-posicao-id="${pos.id}"></i>` + controlesHtml;
                break;
            case 'TRANSACAO_HISTORICA':
                tipoRegistroLabel = 'Histórico';
                detalhes = `${pos.transacao.charAt(0).toUpperCase() + pos.transacao.slice(1)} ${pos.quantidade} @ ${pos.corretora}`;
                break;
            default:
                tipoRegistroLabel = 'Histórico (Legado)';
                detalhes = `${pos.transacao} ${pos.quantidade} @ ${pos.corretora}`;
                break;
        }
        const dataFormatada = pos.data ? new Date(pos.data + 'T12:00:00').toLocaleDateString('pt-BR') : 'Data Inválida';
        tr.innerHTML = `<td>${tipoRegistroLabel}</td><td>${dataFormatada}</td><td>${pos.ticker}</td><td>${detalhes}</td><td class="numero">${formatarPrecoMedio(pos.precoMedio)}</td><td class="controles-col">${controlesHtml}</td>`;
        body.appendChild(tr);
    });
}
function adicionarLinhaCorretora(corretora = '', quantidade = '') { const container = document.getElementById('posicoes-corretoras-container'); const div = document.createElement('div'); div.className = 'corretora-row'; div.innerHTML = `<div class="form-group"><label>Corretora</label><input type="text" class="posicao-corretora" value="${corretora}" required></div><div class="form-group"><label>Quantidade</label><input type="number" step="1" class="posicao-quantidade" value="${quantidade}" required></div><button type="button" class="btn btn-danger" onclick="this.parentElement.remove()"><i class="fas fa-trash"></i></button>`; container.appendChild(div); }
function iniciarAdicaoHistorico() {
    containerListaPosicoes.style.display = 'none';
    containerAdicionarHistorico.style.display = 'block';
    containerTabelaHistorico.style.display = 'none';
    document.getElementById('form-buscar-ativo-historico').reset();
    document.getElementById('tabela-historico-body').innerHTML = '';
    
    const corretoras = getTodasCorretoras();
    dropdownCorretorasCache = `<option value="">Selecione</option>` + corretoras.map(c => `<option value="${c}">${c}</option>`).join('');
}

function cancelarAdicaoHistorico() {
    containerListaPosicoes.style.display = 'block';
    containerAdicionarHistorico.style.display = 'none';
    mostrarTela('posicaoInicial');
}

function adicionarLinhaHistorico(tbody, data = '', transacao = '', quantidade = '', corretora = '', precoMedio = '') {
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="date" class="hist-data" value="${data}" required></td>
        <td>
            <select class="hist-transacao" required>
                <option value="">Selecione</option>
                <option value="Compra" ${transacao.toLowerCase() === 'compra' ? 'selected' : ''}>Compra</option>
                <option value="Venda" ${transacao.toLowerCase() === 'venda' ? 'selected' : ''}>Venda</option>
            </select>
        </td>
        <td><input type="number" step="1" min="1" class="hist-qtd numero" value="${quantidade}" required></td>
        <td>
            <select class="hist-corretora" required>
                ${dropdownCorretorasCache}
            </select>
        </td>
        <td><input type="text" class="hist-pm numero" value="${precoMedio}" required></td>
        <td class="controles-col">
            <i class="fas fa-trash acao-btn delete" title="Excluir Linha" onclick="this.closest('tr').remove()"></i>
        </td>
    `;
    tbody.appendChild(tr);
    if(corretora) {
        tr.querySelector('.hist-corretora').value = corretora;
    }
}

function buscarAtivoParaHistorico(event) {
    event.preventDefault();
    const tickerInput = document.getElementById('historico-ativo-ticker');
    const ticker = tickerInput.value.toUpperCase();
    if (!ticker) return;

    if (!todosOsAtivos.some(a => a.ticker === ticker)) {
        alert(`O ativo "${ticker}" não está cadastrado. Por favor, cadastre-o primeiro.`);
        abrirModalCadastroAtivo(null, ticker);
        return;
    }

    document.getElementById('historico-ativo-selecionado').textContent = ticker;
    containerTabelaHistorico.style.display = 'block';
    const tbody = document.getElementById('tabela-historico-body');
    tbody.innerHTML = '';
    adicionarLinhaHistorico(tbody);
}
function renderizarTelaImportacaoHistorico(dadosAgrupados) {
    mostrarTela('importacaoHistorico');
    const container = document.getElementById('container-revisao-historico');
    container.innerHTML = '';
    const corretoras = getTodasCorretoras();
    dropdownCorretorasCache = `<option value="">Selecione</option>` + corretoras.map(c => `<option value="${c}">${c}</option>`).join('');

    for (const ticker in dadosAgrupados) {
        const ativoDiv = document.createElement('div');
        ativoDiv.className = 'import-review-container';
        if (dadosAgrupados[ticker].isNew) {
            ativoDiv.classList.add('new-asset');
        }
        ativoDiv.dataset.ticker = ticker;
        
        let tableRows = '';
        dadosAgrupados[ticker].registros.forEach(reg => {
            const dataNormalizada = normalizarDataParaInput(reg.data);
            tableRows += `
                <tr>
                    <td><input type="date" class="hist-data" value="${dataNormalizada}" required></td>
                    <td>
                        <select class="hist-transacao" required>
                            <option value="">Selecione</option>
                            <option value="Compra" ${reg.transacao.toLowerCase() === 'compra' ? 'selected' : ''}>Compra</option>
                            <option value="Venda" ${reg.transacao.toLowerCase() === 'venda' ? 'selected' : ''}>Venda</option>
                        </select>
                    </td>
                    <td><input type="number" step="1" min="1" class="hist-qtd numero" value="${reg.quantidade}" required></td>
                    <td>
                        <select class="hist-corretora" required>
                            ${dropdownCorretorasCache}
                        </select>
                    </td>
                    <td><input type="text" class="hist-pm numero" value="${reg.precoMedio}" required></td>
                    <td><input type="text" class="hist-valor-total numero" value="${reg.valorTotal || ''}" placeholder="Obrigatório p/ Venda"></td>
                    <td class="controles-col">
                        <i class="fas fa-trash acao-btn delete" title="Excluir Linha" onclick="this.closest('tr').remove()"></i>
                    </td>
                </tr>
            `;
        });
        
        // --- ALTERAÇÃO: Adiciona o cabeçalho para a nova coluna ---
        ativoDiv.innerHTML = `
            <h3>Histórico para ${ticker}</h3>
            <table>
                <thead>
                    <tr>
                        <th>Data</th><th>Transação</th><th class="numero">Quantidade</th>
                        <th>Corretora</th><th class="numero">Preço Médio Resultante</th>
                        <th class="numero">Valor Total (R$)</th>
                        <th class="controles-col">Ações</th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
            </table>
        `;
        container.appendChild(ativoDiv);
        
        const rows = ativoDiv.querySelectorAll('tbody tr');
        rows.forEach((row, index) => {
            const corretora = dadosAgrupados[ticker].registros[index].corretora;
            if (corretora) {
                row.querySelector('.hist-corretora').value = corretora;
            }
        });
    }
}
function renderizarTabelaTransferencias() {
    const container = document.getElementById('lista-de-transferencias');
    const transferencias = todosOsAjustes.filter(a => a.tipoAjuste === 'transferencia');
    
    if (transferencias.length === 0) {
        container.innerHTML = '<p>Nenhum histórico de transferências encontrado.</p>';
        return;
    }

    let tableHtml = `<table><thead><tr><th>Data</th><th>Origem</th><th>Destino</th><th>Itens Transferidos</th><th class="controles-col">Controles</th></tr></thead><tbody>`;
    transferencias.sort((a,b) => new Date(b.data) - new Date(a.data)).forEach(transf => {
        const dataFormatada = new Date(transf.data + 'T12:00:00').toLocaleDateString('pt-BR');
        
        let detalhesHtml = '<div class="detalhes-transferencia-historico">';
        if (transf.ativosTransferidos && transf.ativosTransferidos.length > 0) {
            detalhesHtml += '<strong>Ativos:</strong><br>' + transf.ativosTransferidos.map(at => `${at.ticker}: ${at.quantidade} un.`).join('<br>');
        }
        if (transf.proventosTransferidos && transf.proventosTransferidos.length > 0) {
            if (transf.ativosTransferidos && transf.ativosTransferidos.length > 0) detalhesHtml += '<br><br>';
            const proventosInfo = transf.proventosTransferidos.map(id => {
                const p = todosOsProventos.find(prov => prov.id === id);
                return p ? `${p.ticker} - ${p.tipo}` : `Provento ID ${id} (não encontrado)`;
            }).join('<br>');
            detalhesHtml += `<strong>Proventos (${transf.proventosTransferidos.length}):</strong><br>${proventosInfo}`;
        }
        detalhesHtml += '</div>';

        tableHtml += `
            <tr>
                <td>${dataFormatada}</td>
                <td>${transf.corretoraOrigem}</td>
                <td>${transf.corretoraDestino}</td>
                <td>${detalhesHtml}</td>
                <td class="controles-col">
                    <i class="fas fa-edit acao-btn edit" title="Editar Transferência" data-transferencia-id="${transf.id}"></i>
                    <i class="fas fa-trash acao-btn delete" title="Excluir Transferência" data-transferencia-id="${transf.id}"></i>
                </td>
            </tr>
        `;
    });
    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
}
function abrirModalEdicaoTransferencia(transferenciaId) {
    // A comparação agora é robusta, como corrigimos antes.
    const transferencia = todosOsAjustes.find(a => parseFloat(a.id) === parseFloat(transferenciaId));

    if (!transferencia) {
        console.error("Erro ao editar transferência: Não foi possível encontrar a transferência com o ID:", transferenciaId);
        alert("Ocorreu um erro ao tentar carregar os dados desta transferência.");
        return;
    }

    document.getElementById('transferencia-form-titulo').textContent = 'Editar Transferência de Custódia';
    
    const form = document.getElementById('form-transferencia-custodia');
    form.reset();
    document.getElementById('transferencia-id').value = transferencia.id;
    document.getElementById('transferencia-data').value = transferencia.data;
    document.getElementById('transferencia-corretora-origem').value = transferencia.corretoraOrigem;
    document.getElementById('transferencia-corretora-destino').value = transferencia.corretoraDestino;

    // A MUDANÇA PRINCIPAL ESTÁ AQUI: Passamos o objeto 'transferencia' para a função seguinte.
    popularAtivosParaTransferencia(transferencia.corretoraOrigem, transferencia.data, transferencia);

    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function renderizarTabelaEventosCorporativos() {
    const container = document.getElementById('lista-de-eventos-corporativos');
    const eventos = todosOsAjustes.filter(a => a.tipoAjuste === 'split_grupamento');

    if (eventos.length === 0) {
        container.innerHTML = '<p>Nenhum evento de split ou grupamento registrado.</p>';
        return;
    }

    let tableHtml = `<table><thead><tr>
        <th>Data-Ex</th>
        <th>Ativo</th>
        <th>Evento</th>
        <th class="numero">Proporção</th>
        <th class="controles-col">Controles</th>
    </tr></thead><tbody>`;

    eventos.sort((a,b) => new Date(b.data) - new Date(a.data)).forEach(evento => {
        const dataFormatada = new Date(evento.data + 'T12:00:00').toLocaleDateString('pt-BR');
        const tipoEventoLabel = evento.tipoEvento === 'split' ? 'Desdobramento (Split)' : 'Grupamento (Inplit)';
        const proporcaoLabel = `${evento.proporcaoDe} para ${evento.proporcaoPara}`;

        tableHtml += `
            <tr>
                <td>${dataFormatada}</td>
                <td>${evento.ticker}</td>
                <td>${tipoEventoLabel}</td>
                <td class="numero">${proporcaoLabel}</td>
                <td class="controles-col">
                    <i class="fas fa-edit acao-btn edit" title="Editar Evento" data-evento-corp-id="${evento.id}"></i>
                    <i class="fas fa-trash acao-btn delete" title="Excluir Evento" data-evento-corp-id="${evento.id}"></i>
                </td>
            </tr>
        `;
    });
    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
}
function abrirModalEventoCorporativo(ajusteParaEditar = null) {
    const form = document.getElementById('form-evento-corporativo');
    form.reset();

    if (ajusteParaEditar) {
        document.getElementById('modal-evento-titulo').textContent = 'Editar Evento Corporativo';
        document.getElementById('evento-id').value = ajusteParaEditar.id;
        document.getElementById('evento-ticker').value = ajusteParaEditar.ticker;
        document.getElementById('evento-data').value = ajusteParaEditar.data;
        document.getElementById('evento-tipo').value = ajusteParaEditar.tipoEvento;
        document.getElementById('evento-proporcao-de').value = ajusteParaEditar.proporcaoDe;
        document.getElementById('evento-proporcao-para').value = ajusteParaEditar.proporcaoPara;
    } else {
        document.getElementById('modal-evento-titulo').textContent = 'Registrar Novo Evento Corporativo';
        document.getElementById('evento-id').value = '';
    }
    modalEventoCorporativo.style.display = 'block';
    document.getElementById('evento-ticker').focus();
}
function abrirModalPosicaoInicial(posicaoParaEditar = null) {
    const form = document.getElementById('form-posicao-inicial');
    form.reset();
    document.getElementById('posicoes-corretoras-container').innerHTML = '';
    
    if (posicaoParaEditar) {
        // MODO EDIÇÃO
        document.getElementById('posicao-modal-titulo').textContent = 'Editar Posição Inicial';
        document.getElementById('posicao-id').value = posicaoParaEditar.id;
        document.getElementById('posicao-ativo').value = posicaoParaEditar.ticker;
        document.getElementById('posicao-data').value = normalizarDataParaInput(posicaoParaEditar.data);
        document.getElementById('posicao-preco-medio').value = formatarDecimalParaInput(posicaoParaEditar.precoMedio);

        posicaoParaEditar.posicoesPorCorretora.forEach(pc => {
            adicionarLinhaCorretora(pc.corretora, pc.quantidade);
        });

    } else {
        // MODO CRIAÇÃO
        document.getElementById('posicao-modal-titulo').textContent = 'Adicionar Posição Inicial';
        document.getElementById('posicao-id').value = '';
        adicionarLinhaCorretora(); // Adiciona uma linha de corretora em branco para começar
    }
    
    modalPosicaoInicial.style.display = 'block';
    document.getElementById('posicao-ativo').focus();
}
function renderizarListaNotas() {
    const tbody = document.getElementById('tbody-notas');
    const summaryContainer = document.getElementById('summary-notas');
    const infoFiltro = document.getElementById('filtro-info-notas');
    
    // --- 1. Preparação do Tooltip Flutuante (Singleton) ---
    let tooltipDiv = document.getElementById('tooltip-flutuante');
    if (!tooltipDiv) {
        tooltipDiv = document.createElement('div');
        tooltipDiv.id = 'tooltip-flutuante';
        document.body.appendChild(tooltipDiv);
    }

    // Filtro
    const filtroAtivoInput = document.getElementById('filtro-nota-ativo');
    const filtroTexto = filtroAtivoInput ? filtroAtivoInput.value.toUpperCase().trim() : '';
    
    // Filtragem de Dados
    const notasParaRenderizar = todasAsNotas.filter(nota => {
        if (!filtroTexto) { return true; }
        return nota.operacoes.some(op => op.ativo.toUpperCase().includes(filtroTexto));
    });

    if (infoFiltro) {
        infoFiltro.innerText = filtroTexto ? `Filtrando por: "${filtroTexto}"` : 'Visualizando Todas as Notas';
    }

    // --- Renderização: Caso Sem Dados ---
    if (notasParaRenderizar.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 40px; color: #7f8c8d;"><i class="fas fa-search" style="font-size: 2rem; margin-bottom: 15px; display: block; opacity: 0.5;"></i>Nenhuma nota encontrada.</td></tr>`;
        summaryContainer.innerHTML = '';
        return;
    }

    // --- Processamento e Renderização ---
    let htmlLinhas = '';
    let totalLiquidoGeral = 0;
    let totalCustosGeral = 0;

    notasParaRenderizar.sort((a,b) => new Date(b.data) - new Date(a.data)).forEach(nota => {
        
        // Cálculos
        const totalCompras = nota.operacoes.filter(op => op.tipo === 'compra').reduce((acc, op) => acc + op.valor, 0);
        const totalVendas = nota.operacoes.filter(op => op.tipo === 'venda').reduce((acc, op) => acc + op.valor, 0);
        const custosNota = (nota.custos || 0) + (nota.irrf || 0);
        const valorLiquido = totalVendas - totalCompras - custosNota;

        totalLiquidoGeral += valorLiquido;
        totalCustosGeral += custosNota;

        const dataFormatada = nota.data ? new Date(nota.data).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : '-';
        const dataLiquidacao = nota.data ? calcularDataLiquidacao(nota.data, 2).toLocaleDateString('pt-BR') : '-';

        // --- Geração do Texto (Conteúdo Rico) ---
        let tooltipContent = `DETALHES DA NOTA ${nota.numero}\n\n`;
        tooltipContent += `Corretora: ${nota.corretora}\n`;
        tooltipContent += `Custos Totais: ${formatarMoeda(custosNota)}\n`;
        tooltipContent += `--------------------------\n`;
        
        if (nota.operacoes && nota.operacoes.length > 0) {
            nota.operacoes.forEach(op => {
                const tipoOp = op.tipo.charAt(0).toUpperCase() + op.tipo.slice(1);
                const precoMedio = op.quantidade > 0 ? op.valor / op.quantidade : 0;
                tooltipContent += `• ${tipoOp} ${op.quantidade} ${op.ativo} a ${formatarMoeda(precoMedio)}\n`;
            });
        } else {
            tooltipContent += "• Sem operações.\n";
        }

        // --- HTML da Linha ---
        // Alteração Principal: Coluna de Ações com Flexbox Horizontal
        htmlLinhas += `
            <tr>
                <td>${dataFormatada}</td>
                <td style="font-weight: 500;">${nota.corretora}</td>
                <td>
                    ${nota.numero}
                    <i class="fas fa-info-circle icone-detalhes-js" 
                       style="color: #3498db; margin-left: 8px; cursor: help;" 
                       data-tooltip-content="${tooltipContent}"></i>
                </td>
                <td class="text-center"><span class="badge badge-light" style="border: 1px solid #ddd;">${nota.operacoes.length}</span></td>
                <td>${dataLiquidacao}</td>
                <td class="numero" style="font-weight: bold;">${formatarValorComCeD(valorLiquido)}</td>
                
                <td class="controles-col">
                    <div style="display: flex; gap: 5px; justify-content: flex-end;">
                        <button class="btn btn-sm btn-info edit" data-note-id="${nota.id}" title="Editar" style="color: white; padding: 2px 8px;">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-secondary delete" data-note-id="${nota.id}" title="Excluir" style="color: white; padding: 2px 8px;">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = htmlLinhas;

    // --- Renderização: Cards de Resumo ---
    const corSaldo = totalLiquidoGeral >= 0 ? '#2ecc71' : '#e74c3c';
    summaryContainer.innerHTML = `
        <div class="dash-summary-card">
            <div class="dash-card-title">Notas Exibidas</div>
            <div class="dash-card-value">${notasParaRenderizar.length}</div>
        </div>
        <div class="dash-summary-card">
            <div class="dash-card-title">Custos Totais</div>
            <div class="dash-card-value" style="color: #e74c3c;">${formatarMoeda(totalCustosGeral)}</div>
        </div>
        <div class="dash-summary-card" style="border-bottom: 4px solid ${corSaldo};">
            <div class="dash-card-title">Fluxo Líquido</div>
            <div class="dash-card-value" style="color: ${corSaldo};">${formatarValorComCeD(totalLiquidoGeral)}</div>
        </div>
    `;

    // --- 2. Ativação dos Eventos do Tooltip ---
    const icones = tbody.querySelectorAll('.icone-detalhes-js');
    
    icones.forEach(icone => {
        icone.addEventListener('mouseenter', (e) => {
            const texto = e.target.getAttribute('data-tooltip-content');
            tooltipDiv.innerText = texto;
            tooltipDiv.style.display = 'block';
            tooltipDiv.style.top = (e.clientY + 15) + 'px';
            tooltipDiv.style.left = (e.clientX + 15) + 'px';
        });

        icone.addEventListener('mousemove', (e) => {
            const larguraTooltip = tooltipDiv.offsetWidth;
            let leftPos = e.clientX + 15;
            if (leftPos + larguraTooltip > window.innerWidth) {
                leftPos = e.clientX - larguraTooltip - 10;
            }
            tooltipDiv.style.top = (e.clientY + 15) + 'px';
            tooltipDiv.style.left = leftPos + 'px';
        });

        icone.addEventListener('mouseleave', () => {
            tooltipDiv.style.display = 'none';
        });
    });
}
function renderizarTabelaOperacoes() { const tabelaOperacoesBody = document.getElementById('tabela-operacoes-body'); tabelaOperacoesBody.innerHTML = ''; if (!notaAtual || !notaAtual.operacoes) return; const custosNota = parseDecimal(document.getElementById('nota-custos').value) || 0; const irrfNota = parseDecimal(document.getElementById('nota-irrf').value) || 0; const valorTotalOperacoes = notaAtual.operacoes.reduce((acc, op) => acc + op.valor, 0); notaAtual.operacoes.forEach(op => { const tr = document.createElement('tr'); const valorOp = op.valor; const precoUnitario = op.quantidade > 0 ? valorOp / op.quantidade : 0; const custoRateado = valorTotalOperacoes > 0 ? (valorOp / valorTotalOperacoes) * (custosNota + irrfNota) : 0; const custoUnitarioRateado = op.quantidade > 0 ? custoRateado / op.quantidade : 0; const precoComCustos = op.tipo === 'compra' ? precoUnitario + custoUnitarioRateado : precoUnitario - custoUnitarioRateado; tr.innerHTML = `<td>${op.ativo}</td><td>${op.tipo.charAt(0).toUpperCase() + op.tipo.slice(1)}</td><td class="numero">${op.quantidade}</td><td class="numero">${formatarMoeda(precoUnitario)}</td><td class="numero">${formatarMoeda(valorOp)}</td><td class="numero">${formatarPrecoMedio(precoComCustos)}</td><td class="controles-col"><i class="fas fa-edit acao-btn edit" title="Editar" data-op-id="${op.id}"></i><i class="fas fa-trash acao-btn delete" title="Excluir" data-op-id="${op.id}"></i></td>`; tabelaOperacoesBody.appendChild(tr); }); }
function renderizarTelaEventosAtivos() {
    const container = document.getElementById('lista-de-eventos-ativos');
    const eventos = todosOsAjustes.filter(a => a.tipoAjuste === 'evento_ativo');

    if (eventos.length === 0) {
        container.innerHTML = '<p>Nenhum evento de entrada ou saída registrado.</p>';
        return;
    }

    let tableHtml = `<table><thead><tr>
        <th>Data</th>
        <th>Ativo</th>
        <th>Evento</th>
        <th>Detalhes</th>
        <th class="controles-col">Controles</th>
    </tr></thead><tbody>`;

    eventos.sort((a,b) => new Date(b.data) - new Date(a.data)).forEach(evento => {
        const dataFormatada = new Date(evento.data + 'T12:00:00').toLocaleDateString('pt-BR');
        const tipoEventoLabel = evento.tipoEvento === 'entrada' ? 'Entrada de Ativo' : 'Saída de Ativo';
        const detalhes = evento.detalhes.map(d => `${d.corretora}: ${d.quantidade} un.`).join('<br>');

        tableHtml += `
            <tr>
                <td>${dataFormatada}</td>
                <td>${evento.ticker}</td>
                <td>${tipoEventoLabel}</td>
                <td>${detalhes}</td>
                <td class="controles-col">
                    <i class="fas fa-edit acao-btn edit" title="Editar Evento" data-evento-ativo-id="${evento.id}"></i>
                    <i class="fas fa-trash acao-btn delete" title="Excluir Evento" data-evento-ativo-id="${evento.id}"></i>
                </td>
            </tr>
        `;
    });
    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
}
function renderizarTelaImportacaoNotas(notas) {
    mostrarTela('importacaoNotas');
    const container = document.getElementById('container-revisao-notas');
    container.innerHTML = '';

    const corretorasOptions = getTodasCorretoras().map(c => `<option value="${c}">${c}</option>`).join('');

    notas.forEach(nota => {
        const notaDiv = document.createElement('div');
        notaDiv.className = 'import-review-container';
        notaDiv.dataset.notaId = nota.id;

        let operacoesHtml = '';
        nota.operacoes.forEach(op => {
            operacoesHtml += `
                <tr data-op-id="${op.id}">
                    <td><input type="text" class="op-ativo ticker-input" value="${op.ativo}"></td>
                    <td>
                        <select class="op-tipo">
                            <option value="compra" ${op.tipo === 'compra' ? 'selected' : ''}>Compra</option>
                            <option value="venda" ${op.tipo === 'venda' ? 'selected' : ''}>Venda</option>
                        </select>
                    </td>
                    <td class="numero"><input type="number" class="op-quantidade" value="${op.quantidade}"></td>
                    <td class="numero"><input type="text" class="op-valor" value="${formatarDecimalParaInput(op.valor)}"></td>
                    <td class="controles-col"><i class="fas fa-trash acao-btn delete" title="Excluir" onclick="this.closest('tr').remove()"></i></td>
                </tr>
            `;
        });

        notaDiv.innerHTML = `
            <h3>Nota Nº ${nota.numero}</h3>
            <div class="form-grid">
                <div class="form-group">
                    <label>Corretora</label>
                    <select class="nota-corretora">
                        ${corretorasOptions}
                    </select>
                </div>
                <div class="form-group"><label>Número da Nota</label><input type="text" class="nota-numero" value="${nota.numero}"></div>
                <div class="form-group"><label>Data da Nota</label><input type="date" class="nota-data" value="${nota.data}"></div>
                <div class="form-group"><label>Custos</label><input type="text" class="nota-custos" value="${formatarDecimalParaInput(nota.custos)}"></div>
                <div class="form-group"><label>IRRF</label><input type="text" class="nota-irrf" value="${formatarDecimalParaInput(nota.irrf)}"></div>
            </div>
            <h4 style="margin-top:20px;">Operações da Nota</h4>
            <table>
                <thead>
                    <tr>
                        <th>Ativo</th><th>Operação</th><th class="numero">Qtd</th>
                        <th class="numero">Valor Total (R$)</th><th class="controles-col">Ações</th>
                    </tr>
                </thead>
                <tbody>${operacoesHtml}</tbody>
            </table>
        `;
        container.appendChild(notaDiv);
        if (nota.corretora) {
            notaDiv.querySelector('.nota-corretora').value = nota.corretora;
        }
    });
}
function popularDropdownsUniversais(selectDebitoId, selectCreditoId) {
    const selectDebito = document.getElementById(selectDebitoId);
    const selectCredito = document.getElementById(selectCreditoId);

    let optionsHtml = '<option value="">Nenhuma</option>';
    
    optionsHtml += '<optgroup label="Contas (BRL)">';
    getTodasContasAtivas()
        .sort((a,b) => a.banco.localeCompare(b.banco))
        .forEach(c => {
            optionsHtml += `<option value="brl_${c.id}">${c.banco} - ${c.tipo}</option>`;
        });
    optionsHtml += '</optgroup>';

    const ativosPorMoeda = todosOsAtivosMoedas.reduce((acc, a) => {
        if (!acc[a.moeda]) acc[a.moeda] = [];
        acc[a.moeda].push(a);
        return acc;
    }, {});

    Object.keys(ativosPorMoeda).sort().forEach(moeda => {
        optionsHtml += `<optgroup label="Ativos (${moeda})">`;
        ativosPorMoeda[moeda].forEach(a => {
            optionsHtml += `<option value="moeda_${a.id}">${a.nomeAtivo}</option>`;
        });
        optionsHtml += '</optgroup>';
    });

    selectDebito.innerHTML = optionsHtml;
    selectCredito.innerHTML = optionsHtml;
}
function popularDropdownAtivoRecorrente() {
    const selectAtivo = document.getElementById('transacao-moeda-ativo-recorrente');
    let optionsHtml = '<option value="">Selecione o alvo...</option>';
    
    optionsHtml += '<optgroup label="Contas (BRL)">';
    getTodasContasAtivas()
        .sort((a,b) => a.banco.localeCompare(b.banco))
        .forEach(c => {
            optionsHtml += `<option value="brl_${c.id}">${c.banco} - ${c.tipo}</option>`;
        });
    optionsHtml += '</optgroup>';

    const ativosPorMoeda = todosOsAtivosMoedas.reduce((acc, a) => {
        if (!acc[a.moeda]) acc[a.moeda] = [];
        acc[a.moeda].push(a);
        return acc;
    }, {});

    Object.keys(ativosPorMoeda).sort().forEach(moeda => {
        optionsHtml += `<optgroup label="Ativos (${moeda})">`;
        ativosPorMoeda[moeda].forEach(a => {
            optionsHtml += `<option value="moeda_${a.id}">${a.nomeAtivo}</option>`;
        });
        optionsHtml += '</optgroup>';
    });

    selectAtivo.innerHTML = optionsHtml;
}

function abrirModalEdicaoTransacaoProvento(transacaoId = null, eventoIdProvento = null) {
    let transacao, proventoOriginal;
    
    // Lógica para encontrar a transação correta
    if (transacaoId) { // Chamado com ID de transação existente (manual, editada, etc.)
        transacao = todasAsMovimentacoes.find(t => t.id === transacaoId);
    } else if (eventoIdProvento) { // Chamado para um provento original (automático)
        const proventoId = parseFloat(String(eventoIdProvento).split('_')[1]);
        const corretora = String(eventoIdProvento).split('_')[2];
        
        // Tenta encontrar uma transação já existente para este provento/corretora
        transacao = todasAsMovimentacoes.find(t => {
            if (t.source !== 'provento' && t.source !== 'provento_editado') return false;
            if (t.sourceId !== proventoId) return false;
            const contaAssociada = todasAsContas.find(c => String(c.id) === String(t.idAlvo));
            return contaAssociada && contaAssociada.banco === corretora;
        });
    }

    if (!transacao) { alert("Erro: Transação do provento não encontrada."); return; }
    
    proventoOriginal = todosOsProventos.find(p => p.id === transacao.sourceId);
    if (!proventoOriginal) { alert("Erro: O registro de provento original não foi encontrado."); return; }
    
    document.getElementById('edit-trans-provento-id').value = transacao.id;
    document.getElementById('edit-trans-provento-ticker').value = proventoOriginal.ticker;
    document.getElementById('edit-trans-provento-tipo').value = proventoOriginal.tipo;
    document.getElementById('edit-trans-provento-data').value = new Date(proventoOriginal.dataPagamento + 'T12:00:00').toLocaleDateString('pt-BR');
    document.getElementById('edit-trans-provento-valor').value = formatarDecimalParaInput(transacao.valor);
    
    abrirModal('modal-edicao-transacao-provento');
    document.getElementById('edit-trans-provento-valor').focus();
}
function gerarHtmlExtratoParaConta(conta, dataInicio, dataFim) {
    const todosOsEventos = obterTodosOsEventosDeCaixa();
    const hojeStr = new Date().toISOString().split('T')[0];
    const dataInicioObj = new Date(dataInicio + 'T00:00:00');

    const eventosPassados = todosOsEventos.filter(e => e.tipo === 'conta' && String(e.idAlvo) === String(conta.id) && e.source !== 'recorrente_futura' && new Date(e.data + 'T12:00:00') < dataInicioObj && new Date(e.data + 'T12:00:00') >= new Date(conta.dataSaldoInicial + 'T12:00:00'));
    const saldoInicialDaLinha = eventosPassados.reduce((acc, t) => acc + arredondarMoeda(t.valor), conta.saldoInicial);
    
    const transacoesParaExibicao = todosOsEventos.filter(e => e.tipo === 'conta' && String(e.idAlvo) === String(conta.id) && e.data >= dataInicio && e.data <= dataFim && e.data >= conta.dataSaldoInicial).sort((a, b) => new Date(a.data + 'T12:00:00') - new Date(b.data + 'T12:00:00'));

    let saldoCorrente = arredondarMoeda(saldoInicialDaLinha);
    let corpoTabela = `<tr><td>${new Date(dataInicio + 'T12:00:00').toLocaleDateString('pt-BR')}</td><td>Saldo em ${new Date(dataInicio + 'T12:00:00').toLocaleDateString('pt-BR')}</td><td class="numero"></td><td class="numero ${saldoCorrente < 0 ? 'valor-negativo' : ''}">${formatarMoeda(saldoCorrente)}</td><td class="controles-col"></td></tr>`;

    transacoesParaExibicao.forEach(evento => {
        saldoCorrente = arredondarMoeda(saldoCorrente + evento.valor);
        let controles = '', linhaClasse = evento.data === hojeStr ? 'data-hoje-bg' : '';

        // Bloco de moedas recorrentes/futuras
        if (evento.source === 'recorrente_futura') {
            linhaClasse += ' transacao-futura';
            controles = `
                <i class="fas fa-check-circle acao-btn-recorrente" title="Confirmar esta ocorrência" data-mae-id="${evento.maeId}" data-ocorrencia-data="${evento.data}" data-action="CONFIRMAR_OCORRENCIA"></i>
                <i class="fas fa-pencil-alt acao-btn-recorrente" title="Ações para esta ocorrência/série" data-mae-id="${evento.maeId}" data-ocorrencia-data="${evento.data}" data-action="ABRIR_MODAL_ACOES_RECORRENTE"></i>
                <i class="fas fa-times-circle acao-btn-recorrente" title="Pular esta ocorrência" data-mae-id="${evento.maeId}" data-ocorrencia-data="${evento.data}" data-action="PULAR_OCORRENCIA"></i>
            `;
        } else {
            if (evento.source === 'manual' || evento.source === 'recorrente_confirmada' || evento.transferenciaId) {
                controles += `<i class="fas fa-edit acao-btn edit" title="Editar Transação" data-id="${evento.id}" data-type="conta"></i>`;
                controles += `<i class="fas fa-trash acao-btn delete" title="Excluir Transação" data-id="${evento.id}" data-type="conta"></i>`;
            
            } else if (evento.source === 'provento' || evento.source === 'provento_editado') {
                controles += `<i class="fas fa-edit acao-btn edit" title="Editar Valor do Provento" data-transacao-provento-id="${evento.id}"></i>`;
            
            } else if (evento.source === 'aporte_rf' || evento.source === 'resgate_rf') {
                controles += `<i class="fas fa-edit acao-btn edit" title="Editar Movimentação de RF" data-mov-rf-id="${evento.id}"></i>`;
                controles += `<i class="fas fa-trash acao-btn delete" title="Excluir Movimentação de RF" data-mov-rf-id="${evento.id}"></i>`;
            
            } else if (evento.source === 'nota') {
                controles += `<i class="fas fa-lock" title="Transação da Nota de Negociação. Edite a nota para alterar."></i>`;
            }
        }

        corpoTabela += `<tr class="${linhaClasse.trim()}">
            <td>${new Date(evento.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
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

function renderizarTelaCaixaGlobal(manterEstadoMinimizado = false) {
    if (!telas.caixaGlobal || telas.caixaGlobal.style.display !== 'block') return;

    const dataInicioInput = document.getElementById('filtro-caixa-data-inicio');
    const dataFimInput = document.getElementById('filtro-caixa-data-fim');

    if (!dataInicioInput.value) {
        dataInicioInput.value = new Date().toISOString().split('T')[0];
    }
    if (!dataFimInput.value) {
        const hoje = new Date();
        const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
        const y = ultimoDia.getFullYear();
        const m = String(ultimoDia.getMonth() + 1).padStart(2, '0');
        const d = String(ultimoDia.getDate()).padStart(2, '0');
        dataFimInput.value = `${y}-${m}-${d}`;
    }

    const dataInicio = dataInicioInput.value;
    const dataFim = dataFimInput.value;

    const container = document.getElementById('container-caixa-global');
    const hojeStr = new Date().toISOString().split('T')[0];
    
    let estadosMinimizados = new Set();
    if (manterEstadoMinimizado) {
        container.querySelectorAll('.conta-coluna.minimized').forEach(col => {
            estadosMinimizados.add(col.dataset.idItem);
        });
    }

    container.innerHTML = '';
    const todosOsItens = [...getTodasContasAtivas(), ...todosOsAtivosMoedas];
    
    const itensAgrupados = todosOsItens.reduce((acc, item) => {
        const moeda = item.moeda || 'BRL';
        if (!acc[moeda]) acc[moeda] = [];
        acc[moeda].push(item);
        return acc;
    }, {});
    
    Object.keys(itensAgrupados).sort().forEach(moeda => {
        const grupoContainer = document.createElement('div');
        grupoContainer.className = 'grupo-moeda-container';
        
        let saldoAtualGrupo = 0;
        let saldoFuturoGrupo = 0;
        const dataFuturaD2 = calcularDataLiquidacao(hojeStr, 2);
        const dataFuturaD2Str = dataFuturaD2.toISOString().split('T')[0];

        itensAgrupados[moeda].forEach(item => {
            const isBRL = (item.moeda || 'BRL') === 'BRL';
            saldoAtualGrupo += isBRL ? calcularSaldoEmData(item, hojeStr) : gerarHtmlExtratoParaAtivoMoeda(item, dataInicio, dataFim).saldoFinal;
            if (isBRL) {
                saldoFuturoGrupo += calcularSaldoProjetado(item, dataFuturaD2Str, 'conta');
            }
        });

        let tituloSaldoHtml = `<span class="saldo-titulo">(Saldo Atual: ${formatarValor(saldoAtualGrupo, moeda)})</span>`;
        if (moeda === 'BRL') {
            tituloSaldoHtml = `<span class="saldo-titulo">(Saldo Atual: ${formatarValor(saldoAtualGrupo, 'BRL')} | Saldo D+2: ${formatarMoeda(saldoFuturoGrupo)})</span>`;
        }

        grupoContainer.innerHTML = `<h2 style="margin: 20px 0 10px 0;">Contas em ${moeda} ${tituloSaldoHtml}</h2>`;
        
        const colunasContainer = document.createElement('div');
        colunasContainer.className = 'colunas-view';
        
        itensAgrupados[moeda].sort((a,b) => (a.banco || a.nomeAtivo).localeCompare(b.banco || b.nomeAtivo)).forEach(item => {
            const isBRL = (item.moeda || 'BRL') === 'BRL';
            const { html, saldoFinal: saldoAtual, temMovimentoHoje } = isBRL 
                ? gerarHtmlExtratoParaConta(item, dataInicio, dataFim) 
                : gerarHtmlExtratoParaAtivoMoeda(item, dataInicio, dataFim);

            const saldoFuturo = calcularSaldoProjetado(item, dataFuturaD2Str, isBRL ? 'conta' : 'moeda');

            const cotacao = dadosMoedas.cotacoes[moeda] || 1;
            const saldoEmReais = saldoAtual * cotacao;
            const saldoClasse = saldoAtual < 0 ? 'valor-negativo' : '';
            const headerClasse = temMovimentoHoje ? 'hoje' : '';
            const itemId = `${isBRL ? 'conta' : 'moeda'}_${item.id}`;
            
            let minimizedClass = manterEstadoMinimizado ? (estadosMinimizados.has(itemId) ? 'minimized' : '') : (temMovimentoHoje ? '' : 'minimized');
            
            const nomeExibicao = isBRL ? `${item.banco} - ${item.tipo}` : item.nomeAtivo;
            const nomeEsaldoMinimizado = `${nomeExibicao} <span class='saldo-minimizado'>${formatarValor(saldoAtual, moeda)}</span> <span class='saldo-futuro-minimizado'>D+2: ${formatarValor(saldoFuturo, moeda)}</span>`;
            
            let controlesHeader = '';
            if(!isBRL){
                 controlesHeader = `<i class="fas fa-edit acao-btn edit" title="Editar Ativo" data-ativo-moeda-id="${item.id}"></i>
                                    <i class="fas fa-trash acao-btn delete" title="Excluir Ativo" data-ativo-moeda-id="${item.id}"></i>`;
            } else {
                 controlesHeader = `<i class="fas fa-edit acao-btn edit" title="Editar Conta" data-conta-id="${item.id}"></i>`;
            }

            let headerDetailsHtml = '';
            if (isBRL && (item.agencia || item.numero || item.pix)) {
                headerDetailsHtml += '<div class="conta-header-details">';
                if (item.agencia) headerDetailsHtml += `<span>Ag: <strong>${item.agencia}</strong></span>`;
                if (item.numero) headerDetailsHtml += `<span>Conta: <strong>${item.numero}</strong></span>`;
                if (item.pix) headerDetailsHtml += `<span>Pix: <strong>${item.pix}</strong></span>`;
                headerDetailsHtml += '</div>';
            }

            const coluna = document.createElement('div');
            coluna.className = `conta-coluna ${minimizedClass}`;
            coluna.dataset.idItem = itemId;
            
            coluna.innerHTML = `
                <div class="conta-header ${headerClasse}">
                    <div>
                        <h4>${nomeEsaldoMinimizado}</h4>
                        ${headerDetailsHtml}
                    </div>
                    <div>
                        <span class="saldo-header ${saldoClasse}" title="Saldo em BRL: ${formatarMoeda(saldoEmReais)}">${formatarValor(saldoAtual, moeda)}</span>
                        <span class="saldo-futuro-header">D+2 (${dataFuturaD2.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}): ${formatarValor(saldoFuturo, moeda)}</span>
                        ${controlesHeader}
                    </div>
                </div>
                <table>
                    <thead><tr><th>Data</th><th>Descrição</th><th class="numero">Valor</th><th class="numero">Saldo</th><th class="controles-col"></th></tr></thead>
                    <tbody>${html}</tbody>
                </table>
            `;
            colunasContainer.appendChild(coluna);
        });
        
        grupoContainer.appendChild(colunasContainer);
        container.appendChild(grupoContainer);
    });
}
function abrirModalLancamentoProvento(proventoParaEditar = null, tickerPreenchido = '') {
    const form = document.getElementById('form-lancamento-provento');
    form.reset();
    const tituloModal = document.getElementById('provento-modal-titulo');
    
    if (proventoParaEditar) {
        tituloModal.textContent = 'Editar Provento';
        document.getElementById('provento-id').value = proventoParaEditar.id;
        document.getElementById('provento-ativo').value = proventoParaEditar.ticker;
        document.getElementById('provento-data-com').value = proventoParaEditar.dataCom;
        document.getElementById('provento-data-pagamento').value = proventoParaEditar.dataPagamento;
        document.getElementById('provento-tipo').value = proventoParaEditar.tipo;

        const valorBruto = proventoParaEditar.valorBrutoIndividual !== undefined 
            ? proventoParaEditar.valorBrutoIndividual 
            : (proventoParaEditar.tipo === 'JCP' ? (proventoParaEditar.valorIndividual / 0.85) : proventoParaEditar.valorIndividual);
        
        const irPercent = proventoParaEditar.percentualIR !== undefined 
            ? proventoParaEditar.percentualIR 
            : (proventoParaEditar.tipo === 'JCP' ? 15 : 0);

        document.getElementById('provento-valor-individual').value = formatarDecimalParaInput(valorBruto);
        document.getElementById('provento-ir').value = irPercent > 0 ? formatarDecimalParaInput(irPercent) : ''; 
        document.getElementById('provento-valor-individual').previousElementSibling.textContent = 'Valor Bruto por Unidade (R$)';

    } else {
        tituloModal.textContent = 'Lançar Provento';
        document.getElementById('provento-id').value = '';
        document.getElementById('provento-ativo').value = tickerPreenchido.toUpperCase(); 
        document.getElementById('provento-valor-individual').previousElementSibling.textContent = 'Valor Bruto por Unidade (R$)';
    }
    
    abrirModal('modal-lancamento-provento');
    
    if (tickerPreenchido) {
        document.getElementById('provento-tipo').focus();
    } else {
        document.getElementById('provento-ativo').focus();
    }
}
function abrirModalCorrecaoProventosOrfaos(proventosOrfaos) {
    const container = document.getElementById('lista-proventos-orfaos-container');
    const corretorasOptions = getTodasCorretoras().map(c => `<option value="${c}">${c}</option>`).join('');

    let tableHtml = `
        <table class="tabela-correcao-orfaos">
            <thead>
                <tr>
                    <th class="col-ativo-correcao">Ativo</th>
                    <th class="col-data-correcao">Data Com</th>
                    <th class="col-pm-correcao">Preço Médio (R$)</th>
                    <th class="col-posicoes-correcao">Posições por Corretora</th>
                </tr>
            </thead>
            <tbody>
    `;

    proventosOrfaos.forEach(provento => {
        tableHtml += `
            <tr class="provento-correcao-row" data-provento-id="${provento.id}" data-ticker="${provento.ticker}" data-datacom="${provento.dataCom}">
                <td class="correcao-ativo-container"><strong>${provento.ticker}</strong></td>
                <td class="correcao-ativo-container">${new Date(provento.dataCom + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td>
                    <div class="correcao-pm-container">
                        <input type="text" class="provento-correcao-pm" placeholder="Ex: 25,50">
                    </div>
                </td>
                <td>
                    <div class="posicoes-por-corretora-wrapper">
                        </div>
                    <button type="button" class="btn btn-primary btn-sm btn-add-corretora-provento" style="margin-top: 10px;">+ Add Corretora</button>
                </td>
            </tr>
        `;
    });

    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
    modalCorrigirProventosOrfaos.style.display = 'block';
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
function gerarHtmlTabelaAtivos(tipoAtivo, posicoesDetalhadas, filtroCorretora, valorTotalCarteira) {
    // 1. Definição de Ativos (Mantida)
    const tickersEmPosicao = new Set(
        Object.keys(posicoesDetalhadas).filter(ticker => {
            const ativoInfo = todosOsAtivos.find(a => a.ticker === ticker);
            return ativoInfo && ativoInfo.tipo === tipoAtivo && posicoesDetalhadas[ticker].quantidade > 0.000001;
        })
    );
    const tickersPlanejados = new Set(
        Object.keys(dadosAlocacao.ativos).filter(ticker => {
            const ativoInfo = todosOsAtivos.find(a => a.ticker === ticker);
            return ativoInfo && ativoInfo.tipo === tipoAtivo;
        })
    );
    const tickersParaExibir = [...new Set([...tickersEmPosicao, ...tickersPlanejados])];
    const ativosParaProcessar = tickersParaExibir.map(ticker => todosOsAtivos.find(a => a.ticker === ticker)).filter(Boolean);

    // Pré-calcula resultados
    const tickersDaCategoria = ativosParaProcessar.map(a => a.ticker);
    const resultadosRealizadosMap = calcularResultadosRealizados(tickersDaCategoria);

    // =================================================================================
    // CORREÇÃO: LÓGICA DE SNAPSHOT ANTERIOR (D-1)
    // =================================================================================
    let precosAnterioresMap = {};
    if (historicoCarteira && historicoCarteira.length > 0) {
        // Usa a data do filtro (hoje) como referência
        // Se filtroCorretora/filtroData estiverem no escopo superior, passamos como argumento, 
        // mas aqui assumimos que 'filtroData' (string YYYY-MM-DD) ou 'new Date()' é a base.
        // O ideal é pegar a data do input, mas para segurança usamos a data atual do sistema se não houver parametro explicito.
        // Nota: A função recebe 'valorTotalCarteira', mas não 'filtroData' explicitamente no código anterior,
        // mas vamos assumir que o cálculo é baseado em HOJE.
        
        const dataReferencia = new Date(); 
        dataReferencia.setHours(0,0,0,0); // Zera hora para comparar apenas datas

        // Filtra snapshots estritamente MENORES que hoje
        const snapshotsPassados = historicoCarteira.filter(s => {
            const dataSnap = new Date(s.data + 'T00:00:00');
            return dataSnap < dataReferencia;
        });

        // Pega o último da lista filtrada (que deve ser ontem ou anteontem)
        const snapshotAnterior = snapshotsPassados.length > 0 
            ? snapshotsPassados[snapshotsPassados.length - 1] 
            : null;

        if (snapshotAnterior && snapshotAnterior.detalhesCarteira && snapshotAnterior.detalhesCarteira.ativos) {
            Object.keys(snapshotAnterior.detalhesCarteira.ativos).forEach(t => {
                precosAnterioresMap[t] = snapshotAnterior.detalhesCarteira.ativos[t].precoAtual || 0;
            });
        }
    }
    // =================================================================================

    // 2. Processamento de Dados
    let dadosParaTabela = ativosParaProcessar.map(ativo => {
        if (!ativo) return null;

        const posTicker = posicoesDetalhadas[ativo.ticker];
        const quantidadeAtual = posTicker ? posTicker.quantidade : 0;
        const quantidadeFiltrada = (filtroCorretora === 'consolidado') 
            ? quantidadeAtual 
            : (posTicker ? (posTicker.porCorretora[filtroCorretora] || 0) : 0);
        
        if (filtroCorretora !== 'consolidado') {
            if (quantidadeFiltrada < 0.000001) return null;
        } else {
            if (quantidadeFiltrada < 0.000001) {
                const percIdeal = dadosAlocacao.ativos[ativo.ticker];
                if (percIdeal === undefined) return null;
            }
        }

        const cotacao = dadosDeMercado.cotacoes[ativo.ticker];
        const precoAtual = cotacao ? cotacao.valor : 0;
        const valorDeMercado = quantidadeFiltrada * precoAtual;
        
        const projecaoAnual = (ativo.tipo === 'Ação') ? calcularProjecaoAnualUnitaria(ativo.ticker, { limiteAnos: 5 }) : getUltimoProvento(ativo.ticker) * 12;
        
        const precoMedio = posTicker ? posTicker.precoMedio : 0;
        const custoTotal = quantidadeFiltrada * precoMedio;
        
        const dataInicioCiclo = getInicioIninterrupto(ativo.ticker);
        const proventosRecebidos = todosOsProventos
            .filter(p => p.ticker === ativo.ticker && p.dataPagamento && (!dataInicioCiclo || p.dataPagamento >= dataInicioCiclo))
            .reduce((soma, p) => soma + p.valorTotalRecebido, 0);
        const resultadoRealizado = resultadosRealizadosMap.get(ativo.ticker) || 0;
        const totalRetornado = proventosRecebidos + resultadoRealizado;
        const progressoBreakEven = custoTotal > 0 ? Math.min(1, totalRetornado / custoTotal) : 0;

        // Variação Diária (Comparando Hoje vs D-1)
        const precoAnterior = precosAnterioresMap[ativo.ticker] || 0;
        let variacaoDiaPercentual = 0;
        // Só calcula se existia preço anterior (evita divisão por zero ou saltos infinitos em ativos novos)
        if (precoAnterior > 0 && precoAtual > 0) {
            variacaoDiaPercentual = (precoAtual - precoAnterior) / precoAnterior;
        }

        return {
            ticker: ativo.ticker,
            nome: ativo.nome || 'Nome não cadastrado',
            quantidade: quantidadeFiltrada,
            precoMedio: precoMedio,
            precoAtual: precoAtual,
            custoTotal: custoTotal,
            valorDeMercado: valorDeMercado,
            variacaoTotalPercentual: precoMedio > 0 ? (precoAtual - precoMedio) / precoMedio : 0,
            variacaoDiaPercentual: variacaoDiaPercentual,
            yoc: precoMedio > 0 ? projecaoAnual / precoMedio : 0,
            dy: precoAtual > 0 ? projecaoAnual / precoAtual : 0,
            pl: (ativo.tipo === 'Ação' && cotacao?.lpa_acao > 0 && precoAtual > 0) ? precoAtual / cotacao.lpa_acao : 0,
            pvp: (ativo.tipo === 'FII' && cotacao?.vpa > 0 && precoAtual > 0) ? precoAtual / cotacao.vpa : 0,
            alocacaoIdeal: dadosAlocacao.ativos[ativo.ticker] || 0,
            alocacaoAtual: valorTotalCarteira > 0 ? valorDeMercado / valorTotalCarteira : 0,
            progressoBreakEven: progressoBreakEven
        };
    }).filter(d => d !== null);

    if (dadosParaTabela.length === 0) {
        return { html: null, custoTotal: 0, valorMercado: 0 };
    }
    
    // Ordenação
    const sortConfig = sortConfigRendaVariavel[tipoAtivo];
    dadosParaTabela.sort((a, b) => {
        const valA = a[sortConfig.key] || '';
        const valB = b[sortConfig.key] || '';
        const direction = sortConfig.direction === 'ascending' ? 1 : -1;
        if (typeof valA === 'string') return valA.localeCompare(valB) * direction;
        if (valA < valB) return -1 * direction;
        if (valA > valB) return 1 * direction;
        return 0;
    });

    // Totais e Headers
    const custoTotalCategoria = dadosParaTabela.reduce((soma, item) => soma + item.custoTotal, 0);
    const valorMercadoCategoria = dadosParaTabela.reduce((soma, item) => soma + item.valorDeMercado, 0);
    const alocacaoIdealTotalCategoria = dadosParaTabela.reduce((soma, item) => soma + item.alocacaoIdeal, 0);
    const alocacaoAtualTotalCategoria = dadosParaTabela.reduce((soma, item) => soma + item.alocacaoAtual, 0);
    
    let additionalHeaders = '';
    if (tipoAtivo === 'Ação') { additionalHeaders = '<th class="percentual sortable" data-key="yoc">YoC %</th><th class="percentual sortable" data-key="dy">DY %</th><th class="numero sortable" data-key="pl">P/L</th>'; } 
    else if (tipoAtivo === 'FII') { additionalHeaders = '<th class="percentual sortable" data-key="yoc">YoC %</th><th class="percentual sortable" data-key="dy">DY %</th><th class="numero sortable" data-key="pvp">P/VP</th>'; }
    
    const headers = `<th class="sortable" data-key="ticker">Ativo</th><th class="numero sortable" data-key="quantidade">Qtd.</th><th class="numero sortable" data-key="precoMedio">PM</th><th class="numero sortable" data-key="precoAtual">Preço</th><th class="percentual col-variacao sortable" data-key="variacaoDiaPercentual">Var. Dia %</th><th class="numero sortable" data-key="custoTotal">Custo</th><th class="numero sortable" data-key="valorDeMercado">Mercado</th>${additionalHeaders}<th class="coluna-alocacao sortable" data-key="alocacaoIdeal">Ideal %</th><th class="coluna-alocacao sortable" data-key="alocacaoAtual">Atual %</th>`;
    
    let corpoTabela = '';
    dadosParaTabela.forEach(item => {
        const valorAlocacaoIdeal = valorTotalCarteira * item.alocacaoIdeal;
        
        // 1. Coluna Var. Dia %
        const diffDia = item.variacaoDiaPercentual;
        let htmlVarDia = '-';
        if (Math.abs(diffDia) > 0.0001) {
            const classeDia = diffDia > 0 ? 'preco-maior' : 'preco-menor';
            const setaDia = diffDia > 0 ? '↑' : '↓';
            htmlVarDia = `<span class="${classeDia}">${setaDia} ${formatarPercentual(Math.abs(diffDia))}</span>`;
        } else if (item.precoAtual > 0 && item.precoMedio > 0) { // Se tem preço mas variação é zero
            htmlVarDia = `<span style="color: #999;">0,00%</span>`;
        }

        // 2. Coluna Preço + Rentabilidade
        const diffTotal = item.variacaoTotalPercentual;
        let htmlRentabilidadeTotal = '';
        let corPrecoPrincipal = '#333'; // Padrão se não houver variação relevante

        if (item.precoMedio > 0 && item.precoAtual > 0) {
            const corTotal = diffTotal >= 0 ? 'blue' : 'red';
            const sinalTotal = diffTotal > 0 ? '+' : '';
            corPrecoPrincipal = corTotal; // O valor principal assume a cor da variação
            htmlRentabilidadeTotal = `<span class="alocacao-valor-real" style="color: ${corTotal};">${sinalTotal}${formatarPercentual(diffTotal)}</span>`;
        }

        // 3. Coluna PM (Visual Solicitado)
        // Linha 1: Moeda (R$ 10,00) em Preto Negrito
        // Linha 2: Decimal (10,005432) em Cinza Menor
        const htmlPM = `
            <strong>${formatarMoeda(item.precoMedio)}</strong>
            <span class="alocacao-valor-real">${formatarDecimal(item.precoMedio, 6)}</span>
        `;

        let additionalCells = '';
        if (tipoAtivo === 'Ação') {
            additionalCells = `<td class="percentual">${formatarPercentual(item.yoc)}</td><td class="percentual">${formatarPercentual(item.dy)}</td><td class="numero">${item.pl > 0 ? formatarDecimal(item.pl) : 'N/A'}</td>`;
        } else if (tipoAtivo === 'FII') {
            additionalCells = `<td class="percentual">${formatarPercentual(item.yoc)}</td><td class="percentual">${formatarPercentual(item.dy)}</td><td class="numero">${item.pvp > 0 ? formatarDecimal(item.pvp) : 'N/A'}</td>`;
        }
        
        const diferencaValor = item.valorDeMercado - item.custoTotal;
        const corDiferenca = diferencaValor >= 0 ? 'blue' : 'red';
        const sinalDiferenca = diferencaValor > 0 ? '+' : '';
        const htmlDiferenca = `<span class="alocacao-valor-real" style="color: ${corDiferenca};">${sinalDiferenca}${formatarMoeda(diferencaValor)}</span>`;

        const progressoPercentual = item.progressoBreakEven * 100;
        const corProgresso = '#d4edda';
        const estiloFundo = `background: linear-gradient(to right, ${corProgresso} ${progressoPercentual}%, transparent ${progressoPercentual}%);`;
        const isPlannedAsset = item.quantidade < 0.000001;
        const deleteIcon = isPlannedAsset ? `<i class="fas fa-times-circle acao-btn delete excluir-ativo-planejado" data-ticker="${item.ticker}" title="Remover da alocação planejada"></i>` : '';

        corpoTabela += `<tr class="ativo-row" data-ticker="${item.ticker}" style="${estiloFundo}" title="Break-Even: ${progressoPercentual.toFixed(1)}%">
            <td class="ativo-row-clickable" title="${item.nome}"><strong>${item.ticker}</strong> ${deleteIcon}</td>
            <td class="numero">${Math.round(item.quantidade)}</td>
            
            <td class="numero">${htmlPM}</td>
            
            <td class="numero">
                <strong style="color: ${corPrecoPrincipal};">${formatarMoeda(item.precoAtual)}</strong>
                ${htmlRentabilidadeTotal}
            </td>
            
            <td class="percentual col-variacao">${htmlVarDia}</td>
            
            <td class="numero">${formatarMoeda(item.custoTotal)}</td>
            <td class="numero ${item.valorDeMercado >= item.custoTotal ? 'valor-positivo' : 'valor-negativo'}">
                <strong>${formatarMoeda(item.valorDeMercado)}</strong>
                ${htmlDiferenca}
            </td>
            
            ${additionalCells}
            <td class="percentual coluna-alocacao"><input type="text" class="alocacao-ativo-input" data-ativo-ticker="${item.ticker}" value="${formatarDecimal(item.alocacaoIdeal * 100)}"><span class="alocacao-valor-real">${formatarMoeda(valorAlocacaoIdeal)}</span></td>
            <td class="percentual coluna-alocacao">${formatarPercentual(item.alocacaoAtual)}<span class="alocacao-valor-real">${formatarMoeda(item.valorDeMercado)}</span></td>
        </tr>`;
    });
    
    // --- RODAPÉ ---
    const diferencaTotalCategoria = valorMercadoCategoria - custoTotalCategoria;
    const corTotalDiff = diferencaTotalCategoria >= 0 ? 'blue' : 'red';
    const sinalTotalDiff = diferencaTotalCategoria > 0 ? '+' : '';
    const htmlTotalDiff = `<span class="alocacao-valor-real" style="color: ${corTotalDiff};">${sinalTotalDiff}${formatarMoeda(diferencaTotalCategoria)}</span>`;

    let peTabelaHtml = '';
    let rodape = '<tr>';
    rodape += '<td colspan="5" style="text-align: right; text-transform: uppercase;"><strong>Totais:</strong></td>';
    rodape += `<td class="numero"><strong>${formatarMoeda(custoTotalCategoria)}</strong></td>`;
    rodape += `<td class="numero"><strong>${formatarMoeda(valorMercadoCategoria)}</strong>${htmlTotalDiff}</td>`;

    if (tipoAtivo === 'Ação' || tipoAtivo === 'FII') {
        rodape += '<td></td><td></td><td></td>';
    }

    if (filtroCorretora === 'consolidado') {
        rodape += `<td class="numero coluna-alocacao"><strong>${formatarPercentual(alocacaoIdealTotalCategoria)}</strong></td>`;
        rodape += `<td class="numero coluna-alocacao"><strong>${formatarPercentual(alocacaoAtualTotalCategoria)}</strong></td>`;
    }
    rodape += '</tr>';
    peTabelaHtml = `<tfoot>${rodape}</tfoot>`;

    const classeTabela = filtroCorretora !== 'consolidado' ? 'filtro-corretora-ativo' : '';
    const tituloSecao = tipoAtivo === 'FII' ? 'Fundos Imobiliários' : (tipoAtivo === 'Ação' ? 'Ações' : tipoAtivo + 's');
    const classeHeader = tipoAtivo === 'Ação' ? 'head-rv-acao' : (tipoAtivo === 'FII' ? 'head-rv-fii' : 'head-rv-etf');
    const iconeHeader = tipoAtivo === 'Ação' ? 'fa-chart-line' : (tipoAtivo === 'FII' ? 'fa-building' : 'fa-globe');

    const htmlFinal = `
        <div class="dash-card">
            <div class="dash-header ${classeHeader}">
                <h3 class="titulo-clicavel-grafico" data-tipo-ativo="${tipoAtivo}" title="Clique para ver o gráfico de cotações" style="cursor: pointer;">
                    <i class="fas ${iconeHeader}"></i> ${tituloSecao}
                </h3>
            </div>
            <div class="dash-body" style="padding: 0;">
                <table class="${classeTabela} dashboard-table" data-tipo-ativo="${tipoAtivo}" style="border: none; margin: 0;">
                    <thead><tr>${headers}</tr></thead>
                    <tbody>${corpoTabela}</tbody>
                    ${peTabelaHtml}
                </table>
            </div>
        </div>
    `;

    return { html: htmlFinal, custoTotal: custoTotalCategoria, valorMercado: valorMercadoCategoria };
}
function abrirModalCalendariosUnificados(vistaInicial = 'fiis') {
    const container = document.getElementById('calendario-container');
    const titulo = document.getElementById('modal-calendario-titulo');
    
    // ATUALIZAÇÃO: Títulos alterados e nova aba 'Simulador' adicionada
    container.innerHTML = `
        <div class="page-subheader" id="seletor-vista-calendario-unificado">
            <h2 class="subtitulo-calendario" data-vista="fiis">Calendário FIIs</h2>
            <h2 class="subtitulo-calendario" data-vista="acoes">Calendário Ações/ETFs</h2>
            <h2 class="subtitulo-calendario" data-vista="simulador"><i class="fas fa-calculator"></i> Simulador de Meta</h2>
        </div>
        <div id="conteudo-calendario-unificado"></div>
    `;

    const renderizarVista = (vista) => {
        const conteudoContainer = document.getElementById('conteudo-calendario-unificado');
        
        // Gerencia classes ativas
        document.querySelectorAll('.subtitulo-calendario').forEach(el => el.classList.remove('ativo'));
        const abaAtiva = document.querySelector(`[data-vista="${vista}"]`);
        if(abaAtiva) abaAtiva.classList.add('ativo');
        
        // Renderiza o conteúdo baseado na escolha
        if (vista === 'fiis') {
            conteudoContainer.innerHTML = gerarHtmlCalendarioFIIs();
            conectarEventosCalendario(conteudoContainer);
        } else if (vista === 'acoes') {
            conteudoContainer.innerHTML = gerarHtmlCalendarioAcoes();
            conectarEventosCalendario(conteudoContainer);
        } else if (vista === 'simulador') {
            // Nova lógica do Simulador
            conteudoContainer.innerHTML = gerarHtmlSimuladorRenda();
            ativarCalculadoraSimulacao();
        }
    };

    // Helper para reconectar os eventos de clique nos itens do calendário (para não repetir código)
    const conectarEventosCalendario = (container) => {
        container.querySelectorAll('.provento-item-container').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const target = e.target;
                const acoesDiv = item.querySelector('.provento-acoes');

                if (target.closest('.acao-btn')) {
                    const proventoId = parseFloat(item.dataset.proventoId);
                    const provento = todosOsProventos.find(p => p.id === proventoId);
                    if (provento) {
                        const tipoAtivo = todosOsAtivos.find(a => a.ticker === provento.ticker)?.tipo;
                        retornoModalProvento = `unificado-${tipoAtivo === 'FII' ? 'fiis' : 'acoes'}`;
                        if (target.closest('.edit')) {
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
    };

    document.getElementById('seletor-vista-calendario-unificado').addEventListener('click', (e) => {
        const target = e.target.closest('.subtitulo-calendario');
        if (target) {
            renderizarVista(target.dataset.vista);
        }
    });

    // ATUALIZAÇÃO: Título principal alterado para 'Proventos'
    titulo.textContent = 'Proventos';
    renderizarVista(vistaInicial); 
    abrirModal('modal-proventos-calendario');
}
function gerarHtmlSimuladorRenda() {
    const thStyle = 'cursor: pointer; user-select: none;';
    
    return `
        <div style="padding: 20px;">
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #e9ecef; margin-bottom: 20px;">
                
                <div style="display: flex; justify-content: center; margin-bottom: 15px;">
                    <div class="btn-group btn-group-toggle" data-toggle="buttons" style="border: 1px solid #ddd; border-radius: 5px; overflow: hidden;">
                        
                        <label class="btn btn-white active" id="lbl-modo-renda" style="border-right: 1px solid #ddd; padding: 8px 20px; cursor: pointer; color: #2c3e50;">
                            <input type="radio" name="modo-simulador" value="renda" checked autocomplete="off"> 
                            <i class="fas fa-dollar-sign text-success"></i> Meta de Renda Mensal (R$)
                        </label>
                        
                        <label class="btn btn-white" id="lbl-modo-qtd" style="padding: 8px 20px; cursor: pointer; color: #2c3e50;">
                            <input type="radio" name="modo-simulador" value="qtd" autocomplete="off"> 
                            <i class="fas fa-sync-alt text-primary"></i> Meta Bola de Neve (Qtd.)
                        </label>
                    </div>
                </div>

                <div style="text-align: center;">
                    <label id="label-simulador-instrucao" style="display: block; font-size: 1.05em; color: #555; margin-bottom: 10px;">
                        Quanto você quer receber <strong>por mês</strong>?
                    </label>
                    
                    <div style="display: flex; justify-content: center; align-items: center; gap: 10px;">
                        <span id="simulador-prefixo" style="font-size: 1.5em; color: #2c3e50; font-weight: bold;">R$</span>
                        <input type="number" id="input-meta-simulador" step="10" placeholder="0,00" 
                            style="font-size: 1.5em; width: 160px; padding: 5px 10px; border: 2px solid #3498db; border-radius: 6px; text-align: center; color: #2c3e50; font-weight: bold;">
                        <span id="simulador-sufixo" style="font-size: 1.2em; color: #7f8c8d; font-weight: 600; display: none;">cotas/mês</span>
                    </div>

                    <p id="simulador-legenda" style="font-size: 0.85em; color: #888; margin-top: 10px;">
                        * Calcula quantas cotas são necessárias para gerar esse valor mensalmente.
                    </p>
                </div>
            </div>

            <div class="dash-card">
                <div class="dash-body table-responsive p-0" style="max-height: 400px; overflow-y: auto;">
                    <table class="dashboard-table" id="tabela-simulador-resultados">
                        <thead>
                            <tr>
                                <th class="sortable-sim" data-key="ticker" style="text-align: left; ${thStyle}">Ativo <i class="fas fa-sort text-muted small"></i></th>
                                <th class="sortable-sim numero" data-key="precoAtual" style="text-align: right; ${thStyle}">Preço Atual <i class="fas fa-sort text-muted small"></i></th>
                                <th class="sortable-sim numero" data-key="mediaMensalUnit" style="text-align: right; ${thStyle}" title="Baseado no histórico recente">Yield Unit. (Mês) <i class="fas fa-sort text-muted small"></i></th>
                                <th class="sortable-sim numero" data-key="qtdAtual" style="text-align: right; ${thStyle}">Qtd. Atual <i class="fas fa-sort text-muted small"></i></th>
                                
                                <th class="sortable-sim numero" data-key="rendaAtual" style="text-align: right; ${thStyle}">Renda Atual <i class="fas fa-sort text-muted small"></i></th>
                                
                                <th class="sortable-sim numero" data-key="qtdNecessaria" style="background: #f0f8ff; text-align: right; ${thStyle}">Qtd. Meta <i class="fas fa-sort text-muted small"></i></th>
                                <th class="sortable-sim numero" data-key="rendaMeta" style="background: #f0f8ff; text-align: right; ${thStyle}">Renda Meta <i class="fas fa-sort text-muted small"></i></th>
                                
                                <th class="sortable-sim numero" data-key="faltaComprar" style="text-align: right; ${thStyle}">Falta Comprar <i class="fas fa-sort text-muted small"></i></th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td colspan="8" style="text-align: center; padding: 20px; color: #999;">Digite um valor acima para simular.</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}
function abrirModalDetalhesAtivo(ticker) {
    const ativo = todosOsAtivos.find(a => a.ticker === ticker);
    const posicao = gerarPosicaoDetalhada()[ticker];
    const dadosMercado = dadosDeMercado.cotacoes[ticker] || {};
    
    // Leitura das Configurações Globais
    const pesosAcoes = configuracoesFiscais.pesosScore?.acoes || { dy: 45, bazin: 35, payout: 5, datacom: 15 };
    const pesosFiis = configuracoesFiscais.pesosScore?.fiis || { dy: 60, pvp: 40 };
    const TOLERANCIA_CONFIG = configuracoesFiscais.toleranciaRebalanceamento || 0.30;
    
    // Configurações de Venda
    const respeitarRegrasAlocacao = configuracoesFiscais.considerarRegrasVenda !== undefined 
        ? configuracoesFiscais.considerarRegrasVenda 
        : true;
    const margemAlvo = configuracoesFiscais.margemLucroVenda || 0;

    if (!ativo) return;

    // 1. Busca dados de balanceamento para o contexto
    const dadosBalanceamento = gerarDadosBalanceamento('todos');
    const tipoCategoria = ativo.tipo === 'Ação' ? 'Ações' : ativo.tipo === 'FII' ? 'FIIs' : ativo.tipo; // Normaliza
    const dadosDoAtivoNoBalanceamento = dadosBalanceamento.categorias[tipoCategoria]?.ativos.find(a => a.ticker === ticker);
    
    const dadosBal = dadosDoAtivoNoBalanceamento || { 
        ideal: { percentualGlobal: 0, valor: 0 }, 
        atual: { percentualGlobal: 0, valor: 0 },
        ajuste: { valor: 0, percentual: 0 }
    };

    // 2. Determina o contexto (Compra ou Venda)
    const isCompra = dadosBal.ajuste.valor > 0;
    const isVenda = dadosBal.ajuste.valor < 0;
    
    const modalTitulo = document.getElementById('modal-ativo-detalhes-titulo');
    const modalConteudo = document.getElementById('modal-ativo-detalhes-conteudo');
    const modalFooter = document.querySelector('#modal-ativo-detalhes .form-actions'); 

    let tituloAcao = isCompra ? 'Oportunidade (Compra)' : (isVenda ? 'Rebalanceamento (Venda)' : 'Em Equilíbrio');
    if (modalTitulo) modalTitulo.textContent = `Análise de ${tituloAcao} - ${ativo.ticker}`;
    
    let conteudoHtml = '';
    const formatarExpl = (texto) => `<div style="margin-top: 5px; font-size: 0.85em; color: #666; line-height: 1.3; font-weight: normal; text-align: left;">${texto}</div>`;

    // --- SEÇÃO 1: DIAGNÓSTICO DE ALOCAÇÃO (Comum a todos) ---
    const percIdeal = dadosBal.ideal.percentualGlobal;
    const percAtual = dadosBal.atual.percentualGlobal;
    const desvio = dadosBal.ajuste.percentual; 
    const classeDesvio = desvio > 0 ? 'valor-positivo' : 'valor-negativo';
    
    // Texto do modo de operação
    const textoModo = dadosAlocacao.modoRebalanceamento === 'ativo' ? 'Por Ativo (Individual)' : 'Por Categoria (Hierárquico)';

    conteudoHtml += `
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 6px; margin-bottom: 20px; border: 1px solid #e9ecef;">
            <h4 style="margin-top: 0; color: #495057; font-size: 1rem; border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-bottom: 10px;">
                Diagnóstico de Alocação <small style="font-weight: normal; color: #777;">(${textoModo})</small>
            </h4>
            <div class="form-grid" style="grid-template-columns: repeat(3, 1fr); gap: 10px; text-align: center;">
                <div><label style="display:block; font-size:0.8em; color:#666;">Alocação Ideal</label><strong>${formatarPercentual(percIdeal)}</strong></div>
                <div><label style="display:block; font-size:0.8em; color:#666;">Alocação Atual</label><strong>${formatarPercentual(percAtual)}</strong></div>
                <div><label style="display:block; font-size:0.8em; color:#666;">Desvio Real</label><strong class="${classeDesvio}">${formatarPercentual(Math.abs(desvio))} ${desvio > 0 ? '(Abaixo)' : '(Acima)'}</strong></div>
            </div>
            <p style="margin-top: 15px; font-size: 0.9em; text-align: center; background: #fff; padding: 8px; border-radius: 4px; border: 1px dashed #ccc;">
                ${isCompra ? `Sugestão Financeira: Aportar <strong>${formatarMoeda(dadosBal.ajuste.valor)}</strong>` : `Excesso Matemático: <strong>${formatarMoeda(Math.abs(dadosBal.ajuste.valor))}</strong>`}
            </p>
        </div>
    `;

    // --- SEÇÃO 2: LÓGICA ESPECÍFICA (COMPRA OU VENDA) ---
    
    if (isCompra || (!isCompra && !isVenda)) {
        // ====================================================================
        // AUDITORIA DE COMPRA (SCORE)
        // ====================================================================
        const scores = calcularScoreDeQualidade(ativo, dadosMercado);
        conteudoHtml += `
            <h4 style="color: var(--success-color); border-bottom: 2px solid var(--success-color); padding-bottom: 5px;">
                <i class="fas fa-check-circle"></i> Racional de Priorização (Score: ${scores.final.toFixed(0)})
            </h4>
            <p style="font-size: 0.9em; color: #555; margin-bottom: 15px;">A nota final define quem deve ser comprado primeiro entre os ativos que precisam de aporte.</p>
            <table class="dashboard-table" style="table-layout: fixed;">
                <colgroup><col style="width: 35%;"><col style="width: 45%;"><col style="width: 20%;"></colgroup>
                <thead><tr><th>Critério (Peso)</th><th>Análise</th><th class="numero">Nota</th></tr></thead>
                <tbody>`;

        if (ativo.tipo === 'Ação') {
            const projecaoAnual = calcularProjecaoAnualUnitaria(ticker, { limiteAnos: 5 });
            const yieldProj = (dadosMercado.valor > 0) ? projecaoAnual / dadosMercado.valor : 0;
            const yieldTarget = ativo.metaYieldBazin || 0.06;
            const tetoBazin = calcularPrecoTetoBazin(projecaoAnual, yieldTarget);
            const payout = (dadosMercado.lpa_acao > 0) ? projecaoAnual / dadosMercado.lpa_acao : 0;
            
            conteudoHtml += `
                <tr><td>Yield (${pesosAcoes.dy}%)</td><td>${formatarExpl(`Proj: <strong>${formatarPercentual(yieldProj)}</strong>. Meta: ${formatarPercentual(yieldTarget)}.`)}</td><td class="numero"><strong>${scores.yield.toFixed(0)}</strong></td></tr>
                <tr><td>Desc. Bazin (${pesosAcoes.bazin}%)</td><td>${formatarExpl(`Teto: <strong>${formatarMoeda(tetoBazin)}</strong>. Atual: ${formatarMoeda(dadosMercado.valor)}`)}</td><td class="numero"><strong>${scores.bazin.toFixed(0)}</strong></td></tr>
                <tr><td>Payout (${pesosAcoes.payout}%)</td><td>${formatarExpl(`Payout Projetado: <strong>${formatarPercentual(payout)}</strong>`)}</td><td class="numero"><strong>${scores.payout.toFixed(0)}</strong></td></tr>
                <tr><td>Data-Com (${pesosAcoes.datacom}%)</td><td>${scores.dataCom > 0 ? 'Próxima' : 'Distante'}</td><td class="numero"><strong>${scores.dataCom.toFixed(0)}</strong></td></tr>`;
        } else if (ativo.tipo === 'FII') {
            const ultimoProv = getUltimoProvento(ticker);
            const yieldProj = (dadosMercado.valor > 0 && ultimoProv > 0) ? (ultimoProv * 12) / dadosMercado.valor : 0;
            const pvp = (dadosMercado.vpa > 0 && dadosMercado.valor > 0) ? dadosMercado.valor / dadosMercado.vpa : 0;
            conteudoHtml += `
                <tr><td>Yield (${pesosFiis.dy}%)</td><td>${formatarExpl(`Yield Anualizado: <strong>${formatarPercentual(yieldProj)}</strong>`)}</td><td class="numero"><strong>${scores.yield.toFixed(0)}</strong></td></tr>
                <tr><td>P/VP (${pesosFiis.pvp}%)</td><td>${formatarExpl(`P/VP Atual: <strong>${formatarDecimal(pvp)}</strong>`)}</td><td class="numero"><strong>${scores.pvp.toFixed(0)}</strong></td></tr>`;
        }
        conteudoHtml += `</tbody></table>`;

    } else {
        // ====================================================================
        // AUDITORIA DE VENDA (TRAVAS E REGRAS)
        // ====================================================================
        const precoMedio = posicao ? posicao.precoMedio : 0;
        const precoAtual = dadosMercado.valor || 0;
        
        // --- 1. Análise da Banda de Tolerância ---
        const toleranciaAbsolutaCarteira = percIdeal * TOLERANCIA_CONFIG; 
        const estourouTolerancia = Math.abs(desvio) > toleranciaAbsolutaCarteira;
        
        let statusTolerancia = '';
        let textoTolerancia = '';
        const desvioFmt = formatarPercentual(Math.abs(desvio));
        const tolFmt = formatarPercentual(toleranciaAbsolutaCarteira);

        if (dadosAlocacao.modoRebalanceamento === 'categoria' && !estourouTolerancia) {
             statusTolerancia = '<span style="color:var(--warning-color); font-weight:bold;">IGNORADO</span>';
             textoTolerancia = `O ativo desviou <strong>${desvioFmt}</strong> (dentro da tolerância de ${tolFmt}), mas a <strong>Categoria inteira excedeu a meta</strong>, forçando a venda.`;
        } else if (estourouTolerancia) {
             statusTolerancia = '<span style="color:var(--danger-color); font-weight:bold;">ESTOUROU</span>';
             textoTolerancia = `O desvio de <strong>${desvioFmt}</strong> é maior que a tolerância permitida de <strong>${tolFmt}</strong>.`;
        } else {
             statusTolerancia = '<span style="color:var(--success-color); font-weight:bold;">DENTRO</span>';
             textoTolerancia = `O desvio de <strong>${desvioFmt}</strong> está dentro da tolerância de <strong>${tolFmt}</strong>.`;
        }

        // --- 2. Análise da Trava de Lucro/Margem (NOVA LÓGICA) ---
        const lucroPorCota = precoAtual - precoMedio;
        const margemAtual = (precoMedio > 0) ? lucroPorCota / precoMedio : 0;
        
        let statusLucro = '';
        let textoLucro = '';
        let isLucroOk = false;

        // Verifica qual regra está ativa
        if (respeitarRegrasAlocacao) {
            // MODO SEGURO: Apenas lucro > 0
            isLucroOk = precoAtual > precoMedio;
            const corStatus = isLucroOk ? 'var(--success-color)' : 'var(--danger-color)';
            statusLucro = `<span style="color:${corStatus}; font-weight:bold;">${isLucroOk ? 'LIBERADO' : 'BLOQUEADO'}</span>`;
            
            if(isLucroOk) {
                textoLucro = `Modo Seguro: Há lucro na operação (${formatarMoeda(lucroPorCota)}/cota). Venda permitida para ajuste de risco.`;
            } else {
                textoLucro = `Modo Seguro: Bloqueado para evitar prejuízo. PM: ${formatarMoeda(precoMedio)}.`;
            }
        } else {
            // MODO OPORTUNISTA: Lucro > Margem Configurada
            isLucroOk = margemAtual >= margemAlvo;
            const corStatus = isLucroOk ? 'var(--success-color)' : 'var(--danger-color)';
            statusLucro = `<span style="color:${corStatus}; font-weight:bold;">${isLucroOk ? 'ALVO ATINGIDO' : 'ABAIXO DA MARGEM'}</span>`;
            
            if(isLucroOk) {
                textoLucro = `Modo Oportunista: Lucro de <strong>${formatarPercentual(margemAtual)}</strong> supera a meta configurada de <strong>${formatarPercentual(margemAlvo)}</strong>.`;
            } else {
                textoLucro = `Modo Oportunista: Lucro atual de <strong>${formatarPercentual(margemAtual)}</strong> é inferior à margem desejada de <strong>${formatarPercentual(margemAlvo)}</strong>.`;
            }
        }

        // --- 3. Análise de P/VP (FIIs) ---
        let htmlPVP = '';
        if (ativo.tipo === 'FII') {
            const vpa = dadosMercado.vpa || 0;
            const pvp = (vpa > 0 && precoAtual > 0) ? precoAtual / vpa : 0;
            let isPvpOk = true;
            let textoRegraFII = '';
            
            if (ativo.subtipoFii === 'Papel' || ativo.subtipoFii === 'Hibrido') {
                if (pvp > 0 && pvp < 0.99) { 
                    isPvpOk = false; 
                    textoRegraFII = 'FII de Papel/Híbrido descontado (P/VP < 0.99). Venda Bloqueada.'; 
                } else { 
                    textoRegraFII = 'P/VP permite venda ou Fundo de Tijolo.'; 
                }
            } else { 
                textoRegraFII = 'FII de Tijolo: Regra de P/VP é flexível.'; 
            }
            
            const statusPvp = isPvpOk ? `<span style="color:var(--success-color); font-weight:bold;">OK</span>` : `<span style="color:var(--danger-color); font-weight:bold;">BLOQUEADO</span>`;
            
            htmlPVP = `<tr><td>Valuation (P/VP)</td><td class="numero">${formatarDecimal(pvp)}</td><td style="text-align: left; vertical-align: top;">${statusPvp}${formatarExpl(textoRegraFII)}</td></tr>`;
        }

        conteudoHtml += `
            <h4 style="color: var(--danger-color); border-bottom: 2px solid var(--danger-color); padding-bottom: 5px;">
                <i class="fas fa-search-dollar"></i> Auditoria de Venda
            </h4>
            <p style="font-size: 0.9em; color: #555; margin-bottom: 15px;">Para vender, o ativo deve passar por todas as travas de segurança ativas.</p>
            <table class="dashboard-table">
                <colgroup><col style="width: 25%;"><col style="width: 25%;"><col style="width: 50%;"></colgroup>
                <thead><tr><th>Critério</th><th class="numero">Valor Ref.</th><th style="text-align: left;">Veredito</th></tr></thead>
                <tbody>
                    <tr><td>Tolerância</td><td class="numero">${tolFmt}</td><td style="text-align: left; vertical-align: top;">${statusTolerancia}${formatarExpl(textoTolerancia)}</td></tr>
                    <tr><td>Lucro / Margem</td><td class="numero">${formatarMoeda(precoMedio)} (PM)</td><td style="text-align: left; vertical-align: top;">${statusLucro}${formatarExpl(textoLucro)}</td></tr>
                    ${htmlPVP}
                </tbody>
            </table>`;
    }

    if (modalConteudo) modalConteudo.innerHTML = conteudoHtml;
    if (modalFooter) modalFooter.innerHTML = '<button type="button" class="btn btn-secondary" onclick="document.getElementById(\'modal-ativo-detalhes\').style.display=\'none\'">Fechar</button>';
    
    const modal = document.getElementById('modal-ativo-detalhes');
    if (modal) modal.style.display = 'block';
}
function abrirModalPerformance(tipoAtivo) {
    const modal = document.getElementById('modal-performance-detalhes');
    const tituloModal = modal.querySelector('h3');
    const container = modal.querySelector('div[id^="modal-"]');
    
    const titulo = tipoAtivo === 'Renda Variável' ? tipoAtivo : `${tipoAtivo}s`;
    tituloModal.textContent = `Análise de Performance - ${titulo}`;
    container.innerHTML = '<h4>Calculando...</h4>';
    abrirModal('modal-performance-detalhes');

    const hoje = new Date().toISOString().split('T')[0];
    const posicoesAtuais = gerarPosicaoDetalhada();
    
    const tiposConsiderados = (tipoAtivo === 'Renda Variável') ? ['Ação', 'FII', 'ETF'] : [tipoAtivo];
    const ativosAtuaisNaCategoria = todosOsAtivos
        .filter(a => tiposConsiderados.includes(a.tipo) && posicoesAtuais[a.ticker]?.quantidade > 0.000001)
        .map(a => a.ticker);

    if (ativosAtuaisNaCategoria.length === 0) {
        container.innerHTML = `<p>Nenhuma posição em ${titulo} para analisar.</p>`;
        return;
    }

    const datasInicioMap = new Map();
    ativosAtuaisNaCategoria.forEach(ticker => {
        datasInicioMap.set(ticker, getInicioIninterrupto(ticker));
    });

    const resultadosRealizadosMap = calcularResultadosRealizados(ativosAtuaisNaCategoria, datasInicioMap);
    
    const proventosCategoria = todosOsProventos.filter(p => ativosAtuaisNaCategoria.includes(p.ticker) && new Date(p.dataPagamento) >= new Date(datasInicioMap.get(p.ticker)));
    const totalDividendosCategoria = proventosCategoria.reduce((soma, p) => soma + p.valorTotalRecebido, 0);

    const custoTotalCategoria = ativosAtuaisNaCategoria.reduce((soma, ticker) => soma + (posicoesAtuais[ticker].quantidade * posicoesAtuais[ticker].precoMedio), 0);
    const mercadoTotalCategoria = ativosAtuaisNaCategoria.reduce((soma, ticker) => {
        const cotacao = dadosDeMercado.cotacoes[ticker]?.valor || posicoesAtuais[ticker].precoMedio;
        return soma + (posicoesAtuais[ticker].quantidade * cotacao);
    }, 0);

    const ganhoCapitalCategoria = mercadoTotalCategoria - custoTotalCategoria;
    const realizadosTotalCategoria = Array.from(resultadosRealizadosMap.values()).reduce((soma, v) => soma + v, 0);
    const retornoTotalCategoria = ganhoCapitalCategoria + realizadosTotalCategoria + totalDividendosCategoria;
    
    let fluxosAgregados = [], datasAgregadas = [];
    ativosAtuaisNaCategoria.forEach(ticker => {
        const dataInicio = datasInicioMap.get(ticker);
        let { fluxos, datas } = construirFluxoDeCaixa([ticker], hoje);
        if (dataInicio) {
            for (let i = 0; i < datas.length; i++) {
                if (new Date(datas[i]) >= new Date(dataInicio)) {
                    fluxosAgregados.push(fluxos[i]);
                    datasAgregadas.push(datas[i]);
                }
            }
        }
    });
    
    if(fluxosAgregados.length > 0) {
        fluxosAgregados.push(mercadoTotalCategoria);
        datasAgregadas.push(hoje);
    }
    const tirAgregada = calcularTIR(fluxosAgregados, datasAgregadas);

    let htmlFinal = `
        <h4>Performance Consolidada da Categoria</h4>
        <table class="dashboard-table">
            <thead>
                <tr>
                    <th>Métrica</th>
                    <th class="numero">Valor (R$)</th>
                    <th class="percentual">% sobre Custo</th>
                </tr>
            </thead>
            <tbody>
                <tr><td>Custo Total dos Aportes</td><td class="numero">${formatarMoeda(custoTotalCategoria)}</td><td class="percentual"></td></tr>
                <tr><td>Ganho/Perda de Capital (Não Realizado)</td><td class="numero ${ganhoCapitalCategoria >= 0 ? 'valor-positivo' : 'valor-negativo'}">${formatarMoeda(ganhoCapitalCategoria)}</td><td class="percentual ${ganhoCapitalCategoria >= 0 ? 'valor-positivo' : 'valor-negativo'}">${formatarPercentual(ganhoCapitalCategoria / custoTotalCategoria)}</td></tr>
                <tr><td>Resultados Realizados (no período)</td><td class="numero ${realizadosTotalCategoria >= 0 ? 'valor-positivo' : 'valor-negativo'}">${formatarMoeda(realizadosTotalCategoria)}</td><td class="percentual ${realizadosTotalCategoria >= 0 ? 'valor-positivo' : 'valor-negativo'}">${formatarPercentual(realizadosTotalCategoria / custoTotalCategoria)}</td></tr>
                <tr><td>Dividendos/Rendimentos Recebidos</td><td class="numero valor-positivo">${formatarMoeda(totalDividendosCategoria)}</td><td class="percentual valor-positivo">${formatarPercentual(totalDividendosCategoria / custoTotalCategoria)}</td></tr>
                <tr class="total-row"><td>Retorno Total</td><td class="numero ${retornoTotalCategoria >= 0 ? 'valor-positivo' : 'valor-negativo'}">${formatarMoeda(retornoTotalCategoria)}</td><td class="percentual ${retornoTotalCategoria >= 0 ? 'valor-positivo' : 'valor-negativo'}">${formatarPercentual(retornoTotalCategoria / custoTotalCategoria)}</td></tr>
                <tr><td>TIR Anualizada (MWRR)</td><td colspan="2" class="percentual ${tirAgregada >= 0 ? 'valor-positivo' : 'valor-negativo'}">${!isNaN(tirAgregada) ? formatarPercentual(tirAgregada) : 'N/A'}</td></tr>
            </tbody>
        </table>
        <hr style="margin: 25px 0;">
        <h4>Performance Individual por Ativo</h4>
        <table class="dashboard-table">
            <thead>
                <tr>
                    <th>Ativo</th>
                    <th class="numero">Custo Total</th>
                    <th class="numero">Valor Mercado</th>
                    <th class="numero">Variação (R$)</th>
                    <th class="numero">Result. Realizado</th>
                    <th class="numero">Dividendos</th>
                    <th class="numero">Retorno Total</th>
                    <th class="percentual">TIR Anual</th>
                </tr>
            </thead>
            <tbody>`;

    const resultadosIndividuais = [];
    ativosAtuaisNaCategoria.forEach(ticker => {
        const posicao = posicoesAtuais[ticker];
        const cotacao = dadosDeMercado.cotacoes[ticker]?.valor || posicao.precoMedio;
        
        const custoTotal = posicao.quantidade * posicao.precoMedio;
        const valorMercado = posicao.quantidade * cotacao;
        const ganhoCapital = valorMercado - custoTotal;
        const dataInicio = datasInicioMap.get(ticker);

        const dividendosAtivo = todosOsProventos
            .filter(p => p.ticker === ticker && new Date(p.dataPagamento) >= new Date(dataInicio))
            .reduce((soma, p) => soma + p.valorTotalRecebido, 0);
        
        const resultadoRealizado = resultadosRealizadosMap.get(ticker) || 0;
        const retornoTotal = ganhoCapital + resultadoRealizado + dividendosAtivo;
        
        let { fluxos, datas } = construirFluxoDeCaixa([ticker], hoje);
        if (dataInicio) {
            const fluxosFiltrados = [], datasFiltradas = [];
            for (let i = 0; i < datas.length; i++) {
                if (new Date(datas[i]) >= new Date(dataInicio)) {
                    fluxosFiltrados.push(fluxos[i]);
                    datasFiltradas.push(datas[i]);
                }
            }
            fluxos = fluxosFiltrados;
            datas = datasFiltradas;
        }

        if(fluxos.length > 0) {
            fluxos.push(valorMercado);
            datas.push(hoje);
        }
        const tir = calcularTIR(fluxos, datas);
        
        resultadosIndividuais.push({ ticker, custoTotal, valorMercado, ganhoCapital, resultadoRealizado, dividendosAtivo, retornoTotal, tir });
    });

    resultadosIndividuais.sort((a,b) => b.valorMercado - a.valorMercado).forEach(res => {
        const classeGanhoCapital = res.ganhoCapital >= 0 ? 'valor-positivo' : 'valor-negativo';
        const classeRealizado = res.resultadoRealizado >= 0 ? 'valor-positivo' : 'valor-negativo';
        const classeRetorno = res.retornoTotal >= 0 ? 'valor-positivo' : 'valor-negativo';
        const classeTir = res.tir >= 0 ? 'valor-positivo' : 'valor-negativo';

        htmlFinal += `
            <tr>
                <td>${res.ticker}</td>
                <td class="numero">${formatarMoeda(res.custoTotal)}</td>
                <td class="numero">${formatarMoeda(res.valorMercado)}</td>
                <td class="numero ${classeGanhoCapital}">${formatarMoeda(res.ganhoCapital)}</td>
                <td class="numero ${classeRealizado}">${formatarMoeda(res.resultadoRealizado)}</td>
                <td class="numero">${formatarMoeda(res.dividendosAtivo)}</td>
                <td class="numero ${classeRetorno}">${formatarMoeda(res.retornoTotal)}</td>
                <td class="percentual ${classeTir}">${!isNaN(res.tir) ? formatarPercentual(res.tir) : 'N/A'}</td>
            </tr>`;
    });

    htmlFinal += `</tbody></table>`;
    container.innerHTML = htmlFinal;
}
function renderizarCalendarioGeral() {
    const container = document.getElementById('container-calendario-geral');
    const selectFiltro = document.getElementById('calendario-geral-filtro-corretora');
    
    // --- 1. POPULAÇÃO DO FILTRO (CORRIGIDO COM SUA FUNÇÃO) ---
    if (selectFiltro && selectFiltro.options.length === 0) {
        // Usa a função central do sistema para garantir consistência
        const listaCorretoras = typeof getTodasCorretoras === 'function' ? getTodasCorretoras() : [];

        let optionsHtml = '<option value="consolidado">Consolidado (Todas)</option>';
        listaCorretoras.forEach(c => {
            optionsHtml += `<option value="${c}">${c}</option>`;
        });
        selectFiltro.innerHTML = optionsHtml;

        // Adiciona evento de mudança para redesenhar a tela
        selectFiltro.addEventListener('change', renderizarCalendarioGeral);
    }

    // Pega o valor selecionado (ou padrão)
    const filtroCorretora = selectFiltro ? selectFiltro.value : 'consolidado';
    
    const calendarioData = {}; 

    // --- CACHE DE POSIÇÕES ---
    const cachePosicoes = {};
    const obterPosicaoNaData = (data) => {
        if (!cachePosicoes[data]) {
            cachePosicoes[data] = gerarPosicaoDetalhada(data);
        }
        return cachePosicoes[data];
    };

    const initCalendarioData = (ano, mes, tipo) => {
        if (!calendarioData[ano]) calendarioData[ano] = {};
        if (!calendarioData[ano][mes]) calendarioData[ano][mes] = {};
        
        if (!calendarioData[ano][mes][tipo]) {
            const arrayHibrido = [];
            arrayHibrido.valorRecebido = 0;
            arrayHibrido.custoTotalFimMes = 0;
            calendarioData[ano][mes][tipo] = arrayHibrido;
        }
    };

    // 1. PRIMEIRA PASSADA: POPULAR LISTA (MODAL) E SOMAR VALORES
    todosOsProventos.forEach(p => {
        if (!p.dataPagamento) return;
        
        // Lógica de Filtro por Corretora
        let valorConsiderado = 0;
        if (filtroCorretora === 'consolidado') {
            valorConsiderado = p.valorTotalRecebido;
        } else {
            // Tenta pegar do detalhamento. Se não existir, é 0.
            valorConsiderado = p.posicaoPorCorretora && p.posicaoPorCorretora[filtroCorretora] 
                ? p.posicaoPorCorretora[filtroCorretora].valorRecebido 
                : 0;
        }
        
        // Fallback de segurança (se valorTotalRecebido for undefined/null)
        if (typeof valorConsiderado === 'undefined') {
            // Se for consolidado, calcula o total. Se for corretora específica e não achou, mantém 0.
            if (filtroCorretora === 'consolidado') {
                valorConsiderado = (p.valorIndividual || 0) * (p.quantidadeNaDataCom || 0);
            }
        }

        if (!valorConsiderado || valorConsiderado === 0) return;

        const data = new Date(p.dataPagamento + 'T12:00:00');
        const ano = data.getUTCFullYear();
        const mes = data.getUTCMonth();
        
        const ativoInfo = todosOsAtivos.find(a => a.ticker === p.ticker);
        const tipoAtivo = ativoInfo ? ativoInfo.tipo : 'Outro';

        initCalendarioData(ano, mes, tipoAtivo);
        
        // Cálculo do Custo para YoC do evento (Modal)
        let custoNoMomentoDataCom = 0;
        if (p.dataCom) {
            const posicaoHistorica = obterPosicaoNaData(p.dataCom);
            const dadosTicker = posicaoHistorica[p.ticker];
            
            if (dadosTicker) {
                if (filtroCorretora === 'consolidado') {
                    custoNoMomentoDataCom = dadosTicker.quantidade * dadosTicker.precoMedio;
                } else {
                    const qtdNaCorretora = dadosTicker.porCorretora[filtroCorretora] || 0;
                    custoNoMomentoDataCom = qtdNaCorretora * dadosTicker.precoMedio;
                }
            }
        }

        calendarioData[ano][mes][tipoAtivo].valorRecebido += valorConsiderado;
        
        calendarioData[ano][mes][tipoAtivo].push({
            ticker: p.ticker,
            dataCom: p.dataCom,
            dataPagamento: p.dataPagamento,
            valorIndividual: p.valorIndividual,
            valor: valorConsiderado,
            custoInvestido: custoNoMomentoDataCom
        });
    });

    // 2. SEGUNDA PASSADA: CUSTO TOTAL FIM DO MÊS (DENOMINADOR TABELA)
    Object.keys(calendarioData).forEach(anoStr => {
        const ano = parseInt(anoStr);
        Object.keys(calendarioData[ano]).forEach(mesStr => {
            const mes = parseInt(mesStr);
            const ultimoDiaDoMes = new Date(ano, mes + 1, 0).toISOString().split('T')[0];
            const posicaoNoFimDoMes = obterPosicaoNaData(ultimoDiaDoMes);

            for (const [ticker, dadosPosicao] of Object.entries(posicaoNoFimDoMes)) {
                if (dadosPosicao.quantidade > 0) {
                    const ativoInfo = todosOsAtivos.find(a => a.ticker === ticker);
                    const tipo = ativoInfo ? ativoInfo.tipo : 'Outro';

                    if (calendarioData[ano][mes][tipo]) {
                        let custoAtivo = 0;
                        if (filtroCorretora === 'consolidado') {
                            custoAtivo = dadosPosicao.quantidade * dadosPosicao.precoMedio;
                        } else {
                            const qtdCorretora = dadosPosicao.porCorretora?.[filtroCorretora] || 0;
                            custoAtivo = qtdCorretora * dadosPosicao.precoMedio;
                        }
                        calendarioData[ano][mes][tipo].custoTotalFimMes += custoAtivo;
                    }
                }
            }
        });
    });

    // 3. RENDA FIXA
    const rendimentosRFPorAtivo = {};
    todosOsRendimentosRFNaoRealizados.forEach(r => {
        const ativoRF = todosOsAtivosRF.find(a => a.id === r.ativoId);
        // Filtra RF pela instituição se necessário
        if (!ativoRF || (filtroCorretora !== 'consolidado' && ativoRF.instituicao !== filtroCorretora)) return;
        
        const chaveMes = r.data.substring(0, 7);
        if (!rendimentosRFPorAtivo[r.ativoId]) rendimentosRFPorAtivo[r.ativoId] = {};
        if (!rendimentosRFPorAtivo[r.ativoId][chaveMes]) rendimentosRFPorAtivo[r.ativoId][chaveMes] = [];
        rendimentosRFPorAtivo[r.ativoId][chaveMes].push(r.rendimento);
    });

    for (const ativoId in rendimentosRFPorAtivo) {
        let ultimoRendimento = 0;
        Object.keys(rendimentosRFPorAtivo[ativoId]).sort().forEach(chaveMes => {
            const [ano, mes] = chaveMes.split('-').map(Number);
            const rendimentosDoMes = rendimentosRFPorAtivo[ativoId][chaveMes];
            const rendimentoFinalMes = rendimentosDoMes[rendimentosDoMes.length - 1];
            const rendimentoIncremental = rendimentoFinalMes - ultimoRendimento;
            
            if (rendimentoIncremental > 0) {
                 initCalendarioData(ano, mes - 1, 'Renda Fixa');
                 calendarioData[ano][mes - 1]['Renda Fixa'].valorRecebido += rendimentoIncremental;
                 const ativoDesc = todosOsAtivosRF.find(a => String(a.id) === ativoId)?.descricao || 'Renda Fixa';
                 calendarioData[ano][mes - 1]['Renda Fixa'].push({
                     descricao: ativoDesc,
                     valor: rendimentoIncremental,
                     custoInvestido: 0 
                 });
            }
            ultimoRendimento = rendimentoFinalMes;
        });
    }
    
    // --- GERAÇÃO HTML ---
    const anosOrdenados = Object.keys(calendarioData).sort((a, b) => b - a);
    
    if (anosOrdenados.length === 0) {
        container.innerHTML = `
            <div class="dash-card">
                <div class="dash-body text-center p-5 text-muted">
                    <i class="fas fa-calendar-times fa-3x mb-3" style="opacity: 0.3;"></i><br>
                    Nenhum rendimento encontrado para o filtro selecionado.
                </div>
            </div>`;
        return;
    }
    
    let htmlFinal = '';
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    anosOrdenados.forEach(ano => {
        htmlFinal += `
        <div class="dash-card mb-4">
            <div class="dash-header" style="background: #f8f9fa; border-left: 5px solid #2c3e50;">
                <h3 style="margin: 0; font-size: 1.3em; color: #2c3e50;">${ano}</h3>
            </div>
            <div class="dash-body table-responsive p-0">
                <table class="table table-bordered table-hover mb-0" style="font-size: 0.85em;">
                    <thead class="thead-light">
                        <tr>
                            <th style="min-width: 150px; background: #fff;">Classe</th>`;
        meses.forEach(mes => htmlFinal += `<th class="text-center" style="min-width: 80px;">${mes}</th>`);
        htmlFinal += `<th class="text-right" style="min-width: 100px; background: #eee;">Total Ano</th></tr></thead><tbody>`;

        const totaisGeraisMes = Array(12).fill(0);
        const totalRVMesValor = Array(12).fill(0);
        const totalRVMesCusto = Array(12).fill(0);

        const tiposDeAtivoComDados = new Set();
        for (let i = 0; i < 12; i++) {
            if (calendarioData[ano][i]) {
                Object.keys(calendarioData[ano][i]).forEach(tipo => tiposDeAtivoComDados.add(tipo));
            }
        }
        
        const listaTiposCompleta = Array.from(tiposDeAtivoComDados).sort();
        const tiposRV = listaTiposCompleta.filter(t => t !== 'Renda Fixa');
        const temRendaFixa = listaTiposCompleta.includes('Renda Fixa');

        // A. RENDA VARIÁVEL
        tiposRV.forEach(tipo => {
            htmlFinal += `<tr><td style="font-weight: 600; color: #34495e;">${tipo}</td>`;
            let acumuladoValorAno = 0;
            let somaYocMensal = 0; 
            for (let i = 0; i < 12; i++) {
                const dados = calendarioData[ano]?.[i]?.[tipo]; 
                const valorMes = dados ? dados.valorRecebido : 0;
                const custoMes = dados ? dados.custoTotalFimMes : 0;
                totalRVMesValor[i] += valorMes;
                totalRVMesCusto[i] += custoMes;
                totaisGeraisMes[i] += valorMes;
                acumuladoValorAno += valorMes;

                const hasValue = valorMes !== 0;
                const classeClicavel = hasValue ? 'valor-clicavel' : '';
                const dataAttributes = hasValue ? `data-ano="${ano}" data-mes="${i}" data-tipo="${tipo}"` : '';
                const bgStyle = hasValue ? 'background-color: #fcfcfc;' : '';
                const cursorStyle = hasValue ? 'cursor: pointer;' : '';

                let conteudoCelular = '-';
                if (hasValue) {
                    conteudoCelular = `<div style="font-weight: bold; color: #2c3e50;">${formatarMoeda(valorMes)}</div>`;
                    if (custoMes > 0) {
                        const yoc = (valorMes / custoMes) * 100;
                        somaYocMensal += yoc;
                        conteudoCelular += `<div style="font-size: 0.85em; color: #7f8c8d; margin-top: 2px;">${yoc.toFixed(2)}%</div>`;
                    }
                }
                htmlFinal += `<td class="text-right ${classeClicavel}" style="${bgStyle} ${cursorStyle}" ${dataAttributes}>${conteudoCelular}</td>`;
            }
            let conteudoTotalAno = formatarMoeda(acumuladoValorAno);
            if (acumuladoValorAno > 0 && somaYocMensal > 0) {
                conteudoTotalAno += `<div style="font-size: 0.85em; color: #7f8c8d;">${somaYocMensal.toFixed(2)}%</div>`;
            }
            htmlFinal += `<td class="text-right" style="background: #f8f9fa;"><strong>${conteudoTotalAno}</strong></td></tr>`;
        });

        // B. SUBTOTAL RV (ALINHAMENTO ESQUERDA)
        if (tiposRV.length > 0) {
            htmlFinal += `<tr style="background-color: #eaf2f8; border-top: 2px solid #bdc3c7;">
                <td style="text-align: left; padding-left: 15px; color: #2980b9; font-weight: bold;">Subtotal RV</td>`;
            
            let totalValorAnoRV = 0;
            let somaYocAnoRV = 0;
            for (let i = 0; i < 12; i++) {
                const valorRV = totalRVMesValor[i];
                const custoRV = totalRVMesCusto[i];
                totalValorAnoRV += valorRV;
                let conteudoRV = '-';
                if (valorRV !== 0) {
                    conteudoRV = `<div style="color: #2980b9; font-weight: bold;">${formatarMoeda(valorRV)}</div>`;
                    if (custoRV > 0) {
                        const yocRV = (valorRV / custoRV) * 100;
                        somaYocAnoRV += yocRV;
                        conteudoRV += `<div style="font-size: 0.85em; color: #5dade2;">${yocRV.toFixed(2)}%</div>`;
                    }
                }
                htmlFinal += `<td class="text-right">${conteudoRV}</td>`;
            }
            let conteudoTotalGeralRV = formatarMoeda(totalValorAnoRV);
            if (totalValorAnoRV > 0 && somaYocAnoRV > 0) {
                conteudoTotalGeralRV += `<div style="font-size: 0.85em; color: #5dade2;">${somaYocAnoRV.toFixed(2)}%</div>`;
            }
            htmlFinal += `<td class="text-right" style="color: #2980b9;"><strong>${conteudoTotalGeralRV}</strong></td></tr>`;
        }

        // C. RENDA FIXA
        if (temRendaFixa) {
            htmlFinal += `<tr><td style="font-weight: 600; color: #27ae60;">Renda Fixa</td>`;
            let totalRFNoAno = 0;
            for (let i = 0; i < 12; i++) {
                const dados = calendarioData[ano]?.[i]?.['Renda Fixa'];
                const valorMes = dados ? dados.valorRecebido : 0;
                totaisGeraisMes[i] += valorMes;
                totalRFNoAno += valorMes;
                const classeClicavel = valorMes !== 0 ? 'valor-clicavel' : '';
                const dataAttributes = valorMes !== 0 ? `data-ano="${ano}" data-mes="${i}" data-tipo="Renda Fixa"` : '';
                const cursorStyle = valorMes !== 0 ? 'cursor: pointer;' : '';
                htmlFinal += `<td class="text-right ${classeClicavel}" style="${cursorStyle} color: #27ae60;" ${dataAttributes}>
                    ${valorMes !== 0 ? formatarMoeda(valorMes) : '-'}
                </td>`;
            }
            htmlFinal += `<td class="text-right" style="background: #f8f9fa; color: #27ae60;"><strong>${formatarMoeda(totalRFNoAno)}</strong></td></tr>`;
        }

        // D. TOTAL GERAL (ALINHAMENTO ESQUERDA)
        htmlFinal += `<tr style="background-color: #2c3e50; color: white;">
            <td style="text-align: left; padding-left: 15px;"><strong>TOTAL MENSAL</strong></td>`;
        let totalGeralAno = 0;
        for (let i = 0; i < 12; i++) {
            htmlFinal += `<td class="text-right">${totaisGeraisMes[i] > 0 ? formatarMoeda(totaisGeraisMes[i]) : '-'}</td>`;
            totalGeralAno += totaisGeraisMes[i];
        }
        htmlFinal += `<td class="text-right" style="background-color: #1a252f;"><strong>${formatarMoeda(totalGeralAno)}</strong></td></tr>`;
        
        htmlFinal += '</tbody></table></div></div>';
    });

    container.innerHTML = htmlFinal;

    container.addEventListener('click', (e) => {
        const targetCell = e.target.closest('.valor-clicavel');
        if (targetCell) {
            const { ano, mes, tipo } = targetCell.dataset;
            if(typeof abrirModalDetalhesRendimentoMensal === 'function') {
                abrirModalDetalhesRendimentoMensal(ano, mes, tipo, calendarioData);
            }
        }
    });
}
function renderizarTelaHistoricoSnapshots() {
    const container = document.getElementById('container-historico-snapshots');
    
    if (!historicoCarteira || historicoCarteira.length < 2) {
        container.innerHTML = '<p>Nenhum snapshot salvo. Salve seu primeiro snapshot na tela do Dashboard.</p>';
        return;
    }

    const moedaSelecionada = document.querySelector('input[name="snapshot-currency"]:checked')?.value || 'BRL';
    const sufixoMoeda = moedaSelecionada === 'BRL' ? '' : ` (${moedaSelecionada})`;

    const cotacoes = historicoCarteira.length > 0 ? historicoCarteira[historicoCarteira.length - 1].cotacoesMoedas : dadosMoedas.cotacoes;
    const taxaCambio = moedaSelecionada === 'BRL' ? 1 : (cotacoes[moedaSelecionada] || 0);

    const formatFunction = moedaSelecionada === 'BRL' ? formatarMoeda : (valor) => formatarMoedaEstrangeira(valor, moedaSelecionada);
    const formatDecimalFunction = moedaSelecionada === 'BRL' ? (valor) => formatarDecimal(valor, 2) : (valor) => formatarDecimal(valor, 4);
    const converterValor = (valor) => (taxaCambio > 0 ? (valor || 0) / taxaCambio : 0);

    // =================================================================================
    // ETAPA 1: PROCESSAMENTO DE TODOS OS DADOS (Conversão e Projeções)
    // =================================================================================
    
    // Filtra snapshots válidos e ordena (Antigo -> Recente) para calcular variações
    const snapshotsValidos = historicoCarteira.filter(s => 
        (s.patrimonioTotal && s.patrimonioTotal > 0) || (s.valorTotalInvestimentos && s.valorTotalInvestimentos > 0)
    ).sort((a, b) => new Date(a.data) - new Date(b.data)); 

    const dadosProcessados = [];
    let anterior = null;
    
    snapshotsValidos.forEach((snapshot) => {
        const proventosProjetadosMensalBRL = calcularProjecaoHistoricaParaSnapshot(snapshot);
        const valorFiisBRL = snapshot.detalhesCarteira?.valorPorClasse?.['FIIs'] || 0;
        const valorAcoesOutrosBRL = (snapshot.detalhesCarteira?.valorPorClasse?.['Ações'] || 0) + (snapshot.detalhesCarteira?.valorPorClasse?.['ETF'] || 0);
        const valorTotalRVBRL = valorFiisBRL + valorAcoesOutrosBRL;
        const yieldProjetado = (valorTotalRVBRL > 0) ? (proventosProjetadosMensalBRL * 12) / valorTotalRVBRL : 0;

        const valoresBRL = {
            patrimonioTotal: snapshot.patrimonioTotal,
            valorTotalInvestimentos: snapshot.valorTotalInvestimentos,
            valorFiis: valorFiisBRL,
            valorAcoesOutros: valorAcoesOutrosBRL,
            valorTotalContas: snapshot.valorTotalContas,
            valorTotalMoedas: snapshot.valorTotalMoedas,
            proventosProjetadosMensal: proventosProjetadosMensalBRL,
            ibov: snapshot.ibov,
            ifix: snapshot.ifix
        };

        const valoresConvertidos = {};
        const variacoes = {};
        
        for (const key in valoresBRL) {
            valoresConvertidos[key] = converterValor(valoresBRL[key]);
            
            if (anterior) {
                const diff = valoresConvertidos[key] - anterior.valoresConvertidos[key];
                const percent = anterior.valoresConvertidos[key] !== 0 ? diff / anterior.valoresConvertidos[key] : 0;
                variacoes[key] = percent;
            }
        }
        
        dadosProcessados.push({ 
            data: snapshot.data, 
            valoresConvertidos, 
            yieldProjetado, 
            variacoes 
        });
        
        anterior = { valoresConvertidos };
    });

    // Inverte para exibir do mais recente para o mais antigo na tabela
    dadosProcessados.reverse();

    // =================================================================================
    // ETAPA 2: FILTRAGEM POR PERÍODO (MESES/ANOS)
    // =================================================================================
    
    let dadosExibicao = [];

    if (filtroPeriodoSnapshot === 'all') {
        dadosExibicao = dadosProcessados;
    } else {
        const dataLimite = new Date();
        // Converte o valor do filtro (string '1', '3', '12') para número e subtrai os meses
        const mesesParaSubtrair = parseInt(filtroPeriodoSnapshot);
        dataLimite.setMonth(dataLimite.getMonth() - mesesParaSubtrair);
        dataLimite.setHours(0, 0, 0, 0);

        dadosExibicao = dadosProcessados.filter(item => {
            const dataItem = new Date(item.data + 'T00:00:00');
            return dataItem >= dataLimite;
        });
    }

    // =================================================================================
    // ETAPA 3: CÁLCULO DE MÁXIMAS E MÍNIMAS (Baseado APENAS no filtro atual)
    // =================================================================================

    const maxValues = { patrimonioTotal: 0, valorTotalInvestimentos: 0, valorFiis: 0, valorAcoesOutros: 0, valorTotalContas: 0, valorTotalMoedas: 0, proventosProjetadosMensal: 0, ibov: 0, ifix: 0 };
    const minValues = { patrimonioTotal: Infinity, valorTotalInvestimentos: Infinity, valorFiis: Infinity, valorAcoesOutros: Infinity, valorTotalContas: Infinity, valorTotalMoedas: Infinity, proventosProjetadosMensal: Infinity, ibov: Infinity, ifix: Infinity };

    if (dadosExibicao.length > 0) {
        dadosExibicao.forEach(item => {
            for (const key in maxValues) {
                const val = item.valoresConvertidos[key];
                
                // Máxima
                if (val > maxValues[key]) maxValues[key] = val;
                
                // Mínima (apenas > 0)
                if (val > 0 && val < minValues[key]) minValues[key] = val;
            }
        });
    }

    // =================================================================================
    // ETAPA 4: MONTAGEM DO HTML
    // =================================================================================

    // Função interna para trocar o filtro
    window.alterarFiltroPeriodo = (valor) => {
        filtroPeriodoSnapshot = valor;
        renderizarTelaHistoricoSnapshots(); // Re-renderiza mantendo a moeda
    };

    let finalHtml = `
        <div class="header-controles-snapshot">
            <div class="titulo-com-filtro">
                <h3>Histórico Diário</h3>
                <select id="filtro-periodo-snapshot" class="select-periodo-snapshot" onchange="alterarFiltroPeriodo(this.value)">
                    <option value="1" ${filtroPeriodoSnapshot === '1' ? 'selected' : ''}>1 Mês</option>
                    <option value="3" ${filtroPeriodoSnapshot === '3' ? 'selected' : ''}>3 Meses</option>
                    <option value="6" ${filtroPeriodoSnapshot === '6' ? 'selected' : ''}>6 Meses</option>
                    <option value="12" ${filtroPeriodoSnapshot === '12' ? 'selected' : ''}>1 Ano</option>
                    <option value="all" ${filtroPeriodoSnapshot === 'all' ? 'selected' : ''}>Tudo</option>
                </select>
            </div>

            <div class="snapshot-legenda">
                <div class="legenda-item">
                    <span class="legenda-box box-max"></span>
                    <span>Máxima</span>
                </div>
                <div class="legenda-item">
                    <span class="legenda-box box-min"></span>
                    <span>Mínima</span>
                </div>
            </div>
        </div>
    `;

    if (dadosExibicao.length === 0) {
        finalHtml += `<div class="alert alert-warning">Nenhum snapshot encontrado para o período selecionado (${filtroPeriodoSnapshot === 'all' ? 'Tudo' : filtroPeriodoSnapshot + ' meses'}).</div>`;
    } else {
        finalHtml += `<table>
            <thead>
                <tr>
                    <th>Data</th>
                    <th class="numero">Patrimônio Total${sufixoMoeda}</th>
                    <th class="numero">Total Investido${sufixoMoeda}</th>
                    <th class="numero">FIIs${sufixoMoeda}</th>
                    <th class="numero">Ações/Outros${sufixoMoeda}</th>
                    <th class="numero">Saldo Contas${sufixoMoeda}</th>
                    <th class="numero">Saldo Moedas${sufixoMoeda}</th>
                    <th class="numero">Proventos Projetados${sufixoMoeda}</th>
                    <th class="numero">IBOV</th>
                    <th class="numero">IFIX</th>
                    <th class="controles-col">Ações</th>
                </tr>
            </thead>
            <tbody id="tbody-snapshots">`;

        dadosExibicao.forEach((item, index) => {
            const dataFormatada = new Date(item.data + 'T12:00:00').toLocaleDateString('pt-BR');
            
            const isSelected = snapshotsSelecionados.includes(item.data);
            const classeSelecionada = isSelected ? 'linha-snapshot-selecionada' : '';
            
            const getCellHtml = (key, isCurrency = true) => {
                const valor = item.valoresConvertidos[key];
                
                // Comparações com os extremos CALCULADOS NESTE PERÍODO
                const isMax = Math.abs(valor - maxValues[key]) < 0.005 && valor > 0;
                // Se o valor for igual à máxima e à mínima (ex: só tem 1 linha), prioriza máxima (verde)
                const isMin = Math.abs(valor - minValues[key]) < 0.005 && valor > 0 && !isMax;

                let classeValor = '';
                if (isMax) classeValor = 'snapshot-max-value';
                else if (isMin) classeValor = 'snapshot-min-recent';
                
                let valorFmt, diffHtml = '';
                if (isCurrency) {
                    valorFmt = formatFunction(valor);
                } else {
                    valorFmt = formatDecimalFunction(valor);
                }

                if (index < dadosExibicao.length - 1) {
                    const diff = item.variacoes[key] || 0;
                    const classeDiff = diff >= 0 ? 'valor-positivo' : 'valor-negativo';
                    const prefixo = "Var:";
                    diffHtml = `<span class="valor-secundario ${classeDiff}" style="display: block; font-size: 0.8em; text-align: right;">${prefixo} ${formatarPercentual(diff)}</span>`;
                }

                return `<td class="numero ${classeValor}">
                            <div style="text-align: right;">
                                <span class="valor-principal">${valorFmt}</span>
                                ${diffHtml}
                            </div>
                        </td>`;
            };
            
            // Coluna Proventos
            const proventoValor = item.valoresConvertidos.proventosProjetadosMensal;
            const isMaxProvento = Math.abs(proventoValor - maxValues.proventosProjetadosMensal) < 0.005 && proventoValor > 0;
            const isMinProvento = Math.abs(proventoValor - minValues.proventosProjetadosMensal) < 0.005 && proventoValor > 0 && !isMaxProvento;
            
            let classeValorProvento = '';
            if (isMaxProvento) classeValorProvento = 'snapshot-max-value';
            else if (isMinProvento) classeValorProvento = 'snapshot-min-recent';

            let proventoDiffHtml = '';
            if (index < dadosExibicao.length - 1) {
                const proventoDiff = item.variacoes.proventosProjetadosMensal || 0;
                const classeDiff = proventoDiff >= 0 ? 'valor-positivo' : 'valor-negativo';
                const prefixo = "Var:";
                proventoDiffHtml = `<span class="valor-secundario ${classeDiff}" style="display: block; font-size: 0.8em; text-align: right;">${prefixo} ${formatarPercentual(proventoDiff)}</span>`;
            }
            
            const proventoHtml = `<td class="numero ${classeValorProvento}">
                                    <div style="text-align: right;">
                                        <span class="valor-principal">${formatFunction(proventoValor)}</span>
                                        <small style="display: block; color: #555; font-size: 0.8em; text-align: right;">(${formatarPercentual(item.yieldProjetado)} a.a.)</small>
                                        ${proventoDiffHtml}
                                    </div>
                                </td>`;

            finalHtml += `
                <tr class="row-clickable ${classeSelecionada}" data-data="${item.data}">
                    <td>${dataFormatada}</td>
                    ${getCellHtml('patrimonioTotal')}
                    ${getCellHtml('valorTotalInvestimentos')}
                    ${getCellHtml('valorFiis')}
                    ${getCellHtml('valorAcoesOutros')}
                    ${getCellHtml('valorTotalContas')}
                    ${getCellHtml('valorTotalMoedas')}
                    ${proventoHtml}
                    ${getCellHtml('ibov', false)}
                    ${getCellHtml('ifix', false)}
                    <td class="controles-col">
                        <button class="btn btn-primary btn-sm btn-detalhes-snapshot" data-data="${item.data}">Detalhes</button>
                    </td>
                </tr>`;
        });

        finalHtml += `</tbody></table>`;
    }

    // BOTÃO COMPARAR (Mantido)
    finalHtml += `
        <button id="btn-comparar-snapshots" onclick="abrirModalComparacaoSnapshots()">
            <i class="fas fa-balance-scale"></i> Comparar (<span id="count-comparar">0</span>)
        </button>
    `;

    container.innerHTML = finalHtml;

    // --- LÓGICA DE INTERAÇÃO ---
    const linhas = container.querySelectorAll('tbody tr');
    const btnComparar = document.getElementById('btn-comparar-snapshots');
    const spanCount = document.getElementById('count-comparar');

    const atualizarInterface = () => {
        const total = snapshotsSelecionados.length;
        if (spanCount) spanCount.textContent = total;
        if (btnComparar) btnComparar.style.display = total >= 2 ? 'block' : 'none';

        linhas.forEach(tr => {
            const dataRow = tr.getAttribute('data-data');
            if (snapshotsSelecionados.includes(dataRow)) {
                tr.classList.add('linha-snapshot-selecionada');
                tr.classList.remove('snapshot-bloqueado');
            } else {
                tr.classList.remove('linha-snapshot-selecionada');
                if (total >= 3) {
                    tr.classList.add('snapshot-bloqueado');
                    tr.title = "Limite de 3 snapshots atingido.";
                } else {
                    tr.classList.remove('snapshot-bloqueado');
                    tr.title = "Clique para selecionar.";
                }
            }
        });
    };

    linhas.forEach(tr => {
        tr.addEventListener('click', (e) => {
            if (e.target.closest('.btn-detalhes-snapshot')) return;
            const data = tr.getAttribute('data-data');
            if (snapshotsSelecionados.includes(data)) {
                snapshotsSelecionados = snapshotsSelecionados.filter(d => d !== data);
            } else {
                if (snapshotsSelecionados.length < 3) {
                    snapshotsSelecionados.push(data);
                } else {
                    tr.classList.add('shake-animation');
                    setTimeout(() => tr.classList.remove('shake-animation'), 500);
                }
            }
            atualizarInterface();
        });
    });

    atualizarInterface();
}
function abrirModalComparacaoSnapshots() {
    // 1. Validação Básica
    if (!snapshotsSelecionados || snapshotsSelecionados.length < 2) {
        alert("Selecione pelo menos 2 datas para comparar.");
        return;
    }

    // 2. Busca e Ordena os Objetos (Do mais antigo para o mais recente)
    const dadosSelecionados = historicoCarteira
        .filter(s => snapshotsSelecionados.includes(s.data))
        .sort((a, b) => new Date(a.data) - new Date(b.data));

    const container = document.getElementById('body-comparacao-snapshots');
    container.innerHTML = ''; 

    // --- FUNÇÕES AUXILIARES DE FORMATAÇÃO ---
    const calcDiff = (atual, anterior) => {
        if (!anterior || anterior === 0) return { abs: 0, pct: 0 };
        const abs = atual - anterior;
        const pct = (abs / anterior) * 100;
        return { abs, pct };
    };

    const renderDiffBadge = (diffObj, isCurrency = true) => {
        if (diffObj.abs === 0 && diffObj.pct === 0) return '<small class="diff-neutral">-</small>';
        const colorClass = diffObj.abs >= 0 ? 'diff-positive' : 'diff-negative';
        const icon = diffObj.abs >= 0 ? '▲' : '▼';
        const absFmt = isCurrency ? formatarMoeda(diffObj.abs) : formatarDecimal(diffObj.abs, 2);
        return `<span class="comp-diff-badge ${colorClass}">
                    ${icon} ${absFmt} <small>(${formatarDecimal(diffObj.pct, 2)}%)</small>
                </span>`;
    };

    // --- CÁLCULO ESTRUTURAL DE RV (Snapshots) ---
    dadosSelecionados.forEach(snap => {
        let custoTotalRV = 0;
        let mercadoTotalRV = 0;

        if (snap.detalhesCarteira && snap.detalhesCarteira.ativos) {
            Object.values(snap.detalhesCarteira.ativos).forEach(ativo => {
                const qtd = ativo.quantidade || 0;
                const pm = ativo.precoMedio || 0;
                const valorMercado = ativo.valorDeMercado || (qtd * (ativo.precoAtual || 0));
                
                custoTotalRV += (qtd * pm);
                mercadoTotalRV += valorMercado;
            });
        }
        snap.statsRV = {
            custo: custoTotalRV,
            mercado: mercadoTotalRV,
            resultadoAcumulado: mercadoTotalRV - custoTotalRV 
        };
    });

    // --- MONTAGEM DO GRID ---
    const gridStyle = `grid-template-columns: 200px repeat(${dadosSelecionados.length}, 1fr);`;
    let html = `<div class="comp-grid-container" style="${gridStyle}">`;

    // Cabeçalho das Datas
    html += `<div class="comp-header-cell">Indicador</div>`;
    dadosSelecionados.forEach(d => {
        const dataFmt = new Date(d.data + 'T12:00:00').toLocaleDateString('pt-BR');
        html += `<div class="comp-header-cell">${dataFmt}</div>`;
    });

    // BLOCO 1: PATRIMÔNIO MACRO
    html += `<div class="comp-section-title">Resumo Patrimonial</div>`;
    
    const gerarLinha = (titulo, valorGetter, isCurrency = true) => {
        html += `<div class="comp-label-cell">${titulo}</div>`;
        let valorAnterior = null;
        dadosSelecionados.forEach((snap, index) => {
            const valorAtual = valorGetter(snap);
            let diffHtml = '';
            if (index > 0) {
                const diff = calcDiff(valorAtual, valorAnterior);
                diffHtml = renderDiffBadge(diff, isCurrency);
            }
            const valorFmt = isCurrency ? formatarMoeda(valorAtual) : formatarDecimal(valorAtual, 2);
            html += `<div class="comp-data-cell">
                        <div style="font-size: 1.1em;">${valorFmt}</div>
                        ${diffHtml}
                     </div>`;
            valorAnterior = valorAtual;
        });
    };

    gerarLinha('Patrimônio Total', s => s.patrimonioTotal);
    gerarLinha('Total Investido', s => s.valorTotalInvestimentos);
    gerarLinha('Caixa (Contas + Moedas)', s => (s.valorTotalContas + s.valorTotalMoedas));

    // BLOCO 2: RAIO-X RV
    html += `<div class="comp-section-title">Raio-X Renda Variável (Ações/FIIs/ETFs)</div>`;
    gerarLinha('Saldo em RV (Mercado)', s => s.statsRV.mercado);
    gerarLinha('Total Aportado (Custo)', s => s.statsRV.custo);
    gerarLinha('Resultado Latente', s => s.statsRV.resultadoAcumulado);

    // --- CÁLCULOS DO CARD DE ANÁLISE (APORTE VS PROVENTOS) ---
    const primeiro = dadosSelecionados[0];
    const ultimo = dadosSelecionados[dadosSelecionados.length - 1];
    
    const deltaTotalRV = ultimo.statsRV.mercado - primeiro.statsRV.mercado;
    const deltaAporte = ultimo.statsRV.custo - primeiro.statsRV.custo; // Isso é o "Dinheiro Novo Total"
    const deltaValorizacao = deltaTotalRV - deltaAporte;

    const textoAporte = deltaAporte >= 0 ? 'Novos Aportes' : 'Vendas/Retiradas';
    const corAporte = deltaAporte >= 0 ? '#198754' : '#dc3545';
    const textoValorizacao = deltaValorizacao >= 0 ? 'Valorização de Ativos' : 'Desvalorização de Ativos';
    const corValorizacao = deltaValorizacao >= 0 ? '#198754' : '#dc3545';

    // -- INTELIGÊNCIA DE PROVENTOS (Corrigida conforme sua função de gráfico) --
    let subItensAporteHtml = '';
    
    // Só detalhamos se houve entrada de dinheiro (Aporte Positivo)
    if (deltaAporte > 0) {
        // 1. Soma os proventos PAGOS no intervalo entre os snapshots
        // Intervalo: (Data Snapshot 1) < Data Pagamento <= (Data Snapshot 2)
        const totalProventosNoPeriodo = todosOsProventos.reduce((acc, prov) => {
            if (prov.dataPagamento) {
                if (prov.dataPagamento > primeiro.data && prov.dataPagamento <= ultimo.data) {
                    return acc + (prov.valorTotalRecebido || 0);
                }
            }
            return acc;
        }, 0);

        // 2. Regra do "Primeiro Dinheiro": 
        // Se Aporte Total = 1000 e Recebi 200 de Proventos -> 200 Proventos, 800 Bolso.
        // Se Aporte Total = 1000 e Recebi 5000 de Proventos -> 1000 Proventos (reinvesti parte), 0 Bolso.
        const aporteViaProventos = Math.min(deltaAporte, totalProventosNoPeriodo);
        const aporteViaExterno = deltaAporte - aporteViaProventos;

        subItensAporteHtml = `
            <div class="comp-sub-item">
                <span>↳ Recursos de Proventos:</span>
                <span title="Total Recebido no período: ${formatarMoeda(totalProventosNoPeriodo)}">${formatarMoeda(aporteViaProventos)}</span>
            </div>
            <div class="comp-sub-item">
                <span>↳ Recursos Externos (Do Bolso):</span>
                <span>${formatarMoeda(aporteViaExterno)}</span>
            </div>
        `;
    }

    html += `</div>`; // Fecha Grid Container

    // CARD DE ANÁLISE FINAL
    html += `
    <div class="comp-analysis-card">
        <h4 style="margin-top:0; color:#007bff">Resumo do Período (${new Date(primeiro.data).toLocaleDateString('pt-BR')} a ${new Date(ultimo.data).toLocaleDateString('pt-BR')})</h4>
        <p>A sua carteira de Renda Variável variou <b>${formatarMoeda(deltaTotalRV)}</b> neste período. Veja a composição:</p>
        
        <div class="comp-analysis-row" style="flex-direction: column; align-items: normal;">
            <div style="display:flex; justify-content:space-between; width:100%;">
                <span>1. Movimentação Financeira (${textoAporte}):</span>
                <span style="color:${corAporte}; font-weight:bold;">${formatarMoeda(deltaAporte)}</span>
            </div>
            ${subItensAporteHtml}
        </div>
        
        <div class="comp-analysis-row">
            <span>2. Efeito de Mercado (${textoValorizacao}):</span>
            <span style="color:${corValorizacao}; font-weight:bold;">${formatarMoeda(deltaValorizacao)}</span>
        </div>
    </div>
    `;

    // BLOCO 3: BENCHMARKS
    html += `<div style="margin-top:20px; border-bottom: 2px solid #007bff; padding-bottom:5px; font-weight:bold; color:#2c3e50;">Indicadores e Benchmarks</div>`;
    html += `<div class="comp-grid-container" style="${gridStyle}; border-bottom:none;">`;
    gerarLinha('Proventos Projetados/Mês', s => calcularProjecaoHistoricaParaSnapshot(s));
    gerarLinha('IBOV (Pontos)', s => s.ibov, false);
    gerarLinha('IFIX (Pontos)', s => s.ifix, false);
    html += `</div>`;

    container.innerHTML = html;
    document.getElementById('modal-comparacao-snapshots').style.display = 'block';
}
function abrirModalDetalhesSnapshot(data) {
    const snapshot = historicoCarteira.find(s => s.data === data);
    if (!snapshot) {
        alert('Erro: Snapshot não encontrado para esta data.');
        return;
    }

    const modalTitulo = document.getElementById('modal-snapshot-detalhes-titulo');
    const modalConteudo = document.getElementById('modal-snapshot-detalhes-conteudo');
    const dataFormatada = new Date(data + 'T12:00:00').toLocaleDateString('pt-BR');
    
    modalTitulo.textContent = `Detalhes da Carteira em ${dataFormatada}`;

    let htmlConteudo = `<div class="snapshot-summary">
        <div class="summary-item"><label>Patrimônio Total</label><span>${formatarMoeda(snapshot.patrimonioTotal)}</span></div>
        <div class="summary-item"><label>Total Investido</label><span>${formatarMoeda(snapshot.valorTotalInvestimentos)}</span></div>
        <div class="summary-item"><label>Saldo em Contas</label><span>${formatarMoeda(snapshot.valorTotalContas)}</span></div>
        <div class="summary-item"><label>Saldo em Moedas</label><span>${formatarMoeda(snapshot.valorTotalMoedas)}</span></div>
    </div>`;

    const detalhes = snapshot.detalhesCarteira;

    if (detalhes.ativos && Object.keys(detalhes.ativos).length > 0) {
        htmlConteudo += '<h4>Ativos de Renda Variável</h4><table><thead><tr><th>Ativo</th><th class="numero">Qtd.</th><th class="numero">Preço Médio</th><th class="numero">Cotação do Dia</th><th class="numero">Valor de Mercado</th></tr></thead><tbody>';
        Object.entries(detalhes.ativos).sort((a,b) => a[0].localeCompare(b[0])).forEach(([ticker, dados]) => {
            if (dados.quantidade > 0.0001) {
                const ativoInfo = todosOsAtivos.find(a => a.ticker === ticker);
                const tipoHtml = ativoInfo ? `<small style="color: #555; margin-left: 8px;">(${ativoInfo.tipo})</small>` : '';
                htmlConteudo += `<tr class="row-clickable" data-ticker="${ticker}" title="Clique para ver o histórico de cotações e preço médio">
                    <td>${ticker}${tipoHtml}</td>
                    <td class="numero">${Math.round(dados.quantidade)}</td>
                    <td class="numero">${formatarMoeda(dados.precoMedio)}</td>
                    <td class="numero">${formatarMoeda(dados.precoAtual)}</td>
                    <td class="numero">${formatarMoeda(dados.valorDeMercado)}</td>
                </tr>`;
            }
        });
        htmlConteudo += `</tbody></table>`;
    }

    if (detalhes.rendaFixa && detalhes.rendaFixa.length > 0) {
        htmlConteudo += '<h4>Aplicações de Renda Fixa</h4><table><thead><tr><th>Descrição</th><th class="numero">Valor Investido</th><th class="numero">Saldo Líquido</th></tr></thead><tbody>';
        detalhes.rendaFixa.forEach(rf => {
            if (rf.saldoLiquido > 0) {
                htmlConteudo += `<tr>
                    <td>${rf.descricao}</td>
                    <td class="numero">${formatarMoeda(rf.valorInvestido)}</td>
                    <td class="numero">${formatarMoeda(rf.saldoLiquido)}</td>
                </tr>`;
            }
        });
        htmlConteudo += `</tbody></table>`;
    }
    
    modalConteudo.innerHTML = htmlConteudo;
    abrirModal('modal-snapshot-detalhes');
}
function renderizarPosicoesZeradas() {
    const container = document.getElementById('container-posicoes-zeradas');
    const dados = gerarRelatorioPosicoesZeradas();
    
    if (dados.length === 0) {
        container.innerHTML = "<p>Nenhuma posição zerada encontrada no seu histórico.</p>";
        return;
    }

    let tableHtml = `<table><thead><tr>
        <th>Ativo</th>
        <th>Data de Início da Posição</th>
        <th>Data de Encerramento da Posição</th>
    </tr></thead><tbody>`;

    dados.sort((a,b) => new Date(b.dataEncerramento) - new Date(a.dataEncerramento)).forEach(item => {
        tableHtml += `
            <tr>
                <td>${item.ticker}</td>
                <td>${new Date(item.dataInicio + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td>${new Date(item.dataEncerramento + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
            </tr>
        `;
    });

    tableHtml += "</tbody></table>";
    container.innerHTML = tableHtml;
}
function renderizarTelaHistoricoMovimentacao() {
    mostrarTela('historicoMovimentacao');
    const select = document.getElementById('select-ativo-historico');
    const containerTabela = document.getElementById('container-tabela-movimentacoes');
    containerTabela.innerHTML = '';
    
    const todosOsTickersHistorico = [...new Set(todosOsAtivos.map(a => a.ticker))];
    const posicoesAtuais = gerarPosicaoDetalhada();
    
    const tickersComPosicao = new Set(Object.keys(posicoesAtuais).filter(t => posicoesAtuais[t].quantidade > 0.000001));
    
    let optionsHtml = '<option value="">Selecione um ativo...</option>';
    todosOsTickersHistorico.sort().forEach(ticker => {
        if (!tickersComPosicao.has(ticker)) {
            optionsHtml += `<option value="${ticker}" class="posicao-zerada">${ticker} (zerada)</option>`;
        } else {
            optionsHtml += `<option value="${ticker}">${ticker}</option>`;
        }
    });

    select.innerHTML = optionsHtml;
}

function renderizarTabelaHistoricoParaAtivo(ticker) {
    const container = document.getElementById('container-tabela-movimentacoes');
    if (!ticker) {
        container.innerHTML = '';
        return;
    }
    const historico = gerarHistoricoCompletoParaAtivo(ticker);

    // --- CABEÇALHO ATUALIZADO ---
    let tableHtml = `<h4>Movimentações para ${ticker}</h4><table><thead><tr>
        <th>Data</th>
        <th>Transação</th>
        <th class="numero">Preço Unit. (R$)</th>
        <th>Qtd. por Corretora</th>
        <th class="numero">Qtd. Consolidada</th>
        <th class="numero">Preço Médio</th>
        <th class="numero">Valor Investido</th>
    </tr></thead><tbody>`;

    if (historico.length === 0) {
        tableHtml += '<tr><td colspan="7" style="text-align: center;">Nenhuma movimentação encontrada para este ativo.</td></tr>';
    } else {
        historico.forEach(item => {
            const dataFormatada = item.data ? new Date(item.data + 'T12:00:00').toLocaleDateString('pt-BR') : 'Data Inválida';
            
            // --- CÉLULA ATUALIZADA PARA EXIBIR O PREÇO UNITÁRIO ---
            const precoUnitarioFmt = (item.precoUnitario !== null && item.precoUnitario > 0) ? formatarMoeda(item.precoUnitario) : 'N/A';
            
            tableHtml += `
                <tr>
                    <td>${dataFormatada}</td>
                    <td>${item.descricaoTransacao}</td>
                    <td class="numero">${precoUnitarioFmt}</td>
                    <td>${item.qtdPorCorretora || 'N/A'}</td>
                    <td class="numero">${Math.round(item.qtdConsolidada)}</td>
                    <td class="numero">${formatarPrecoMedio(item.precoMedio)}</td>
                    <td class="numero">${formatarMoeda(item.valorTotalInvestido)}</td>
                </tr>`;
        });
    }

    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
}
function renderizarModalCalendarioRecorrentes() {
    const dadosContas = gerarDadosCalendarioRecorrentes('conta');
    const dadosMoedas = gerarDadosCalendarioRecorrentes('moeda');
    const container = document.getElementById('calendario-recorrentes-container');
    const tituloModal = document.getElementById('modal-calendario-recorrentes-titulo');

    tituloModal.textContent = 'Calendário de Lançamentos Recorrentes';

    if (dadosContas.size === 0 && dadosMoedas.size === 0) {
        container.innerHTML = '<p style="text-align:center; padding: 20px;">Nenhum lançamento recorrente futuro encontrado.</p>';
        abrirModal('modal-calendario-recorrentes');
        return;
    }

    let htmlFinal = '';
    const formatarValor = (valor, moeda) => moeda === 'BRL' ? formatarMoeda(valor) : formatarMoedaEstrangeira(valor, moeda);

    // Função auxiliar para renderizar um grupo de dados (seja de contas ou moedas)
    const renderizarGrupo = (dadosAgrupados) => {
        let htmlGrupo = '';
        dadosAgrupados.forEach((dadosItem) => {
            const { itemInfo, regras } = dadosItem;
            let todasAsDatas = new Set();
            regras.forEach(regra => {
                regra.datas.forEach((_, data) => todasAsDatas.add(data));
            });

            if (todasAsDatas.size === 0) return;

            const datasOrdenadas = Array.from(todasAsDatas).sort();
            
            const meses = new Map();
            datasOrdenadas.forEach(data => {
                const mesChave = data.substring(0, 7);
                if (!meses.has(mesChave)) meses.set(mesChave, []);
                meses.get(mesChave).push(data);
            });

            htmlGrupo += `
                <div class="bloco-corretora">
                    <div class="bloco-corretora-header">
                        <h3>${itemInfo.nome} (${itemInfo.moeda})</h3>
                    </div>
                    <div class="tabela-projecao-wrapper">
                        <table class="calendario-recorrentes-table">
                            <thead>
                                <tr><th rowspan="2" class="regra-header">Lançamento Recorrente</th>`;

            let mesIndex = 0;
            meses.forEach((diasDoMes, mesChave) => {
                const dataMes = new Date(mesChave + '-02T12:00:00');
                const nomeMes = dataMes.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
                const classeMes = (mesIndex % 2 === 0) ? 'mes-par' : 'mes-impar';
                htmlGrupo += `<th colspan="${diasDoMes.length}" class="mes-header ${classeMes}">${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)}</th>`;
                mesIndex++;
            });
            htmlGrupo += `</tr><tr>`;

            mesIndex = 0;
            meses.forEach((diasDoMes) => {
                const classeMes = (mesIndex % 2 === 0) ? 'mes-par' : 'mes-impar';
                diasDoMes.forEach(data => {
                    htmlGrupo += `<th class="dia-header ${classeMes}">${new Date(data + 'T12:00:00').getDate()}</th>`;
                });
                mesIndex++;
            });
            htmlGrupo += `</tr></thead><tbody>`;

            regras.forEach(regra => {
                htmlGrupo += `<tr><td>${regra.descricao}</td>`;
                mesIndex = 0;
                meses.forEach((diasDoMes) => {
                    const classeMes = (mesIndex % 2 === 0) ? 'mes-par' : 'mes-impar';
                    diasDoMes.forEach(data => {
                        const valor = regra.datas.get(data) || 0;
                        const classeValor = valor < 0 ? 'valor-negativo' : 'valor-positivo';
                        htmlGrupo += `<td class="numero ${classeMes} ${valor !== 0 ? classeValor : ''}">${valor !== 0 ? formatarValor(valor, itemInfo.moeda) : '-'}</td>`;
                    });
                    mesIndex++;
                });
                htmlGrupo += `</tr>`;
            });

            htmlGrupo += `</tbody><tfoot><tr class="total-row"><td><strong>Total do Mês</strong></td>`;
            mesIndex = 0;
            meses.forEach((diasDoMes) => {
                let totalMes = 0;
                regras.forEach(regra => {
                    diasDoMes.forEach(data => {
                        totalMes += regra.datas.get(data) || 0;
                    });
                });
                const classeMes = (mesIndex % 2 === 0) ? 'mes-par' : 'mes-impar';
                const classeTotal = totalMes < 0 ? 'valor-negativo' : 'valor-positivo';
                htmlGrupo += `<td colspan="${diasDoMes.length}" class="numero total-mes ${classeMes} ${classeTotal}"><strong>${formatarValor(totalMes, itemInfo.moeda)}</strong></td>`;
                mesIndex++;
            });
            htmlGrupo += `</tr></tfoot></table></div></div>`;
        });
        return htmlGrupo;
    };

    // Renderiza primeiro as contas BRL, depois as outras moedas
    htmlFinal += renderizarGrupo(dadosContas);
    htmlFinal += renderizarGrupo(dadosMoedas);

    container.innerHTML = htmlFinal;
    abrirModal('modal-calendario-recorrentes');
}
function renderizarModalProjecaoFutura() {
    const dados = gerarDadosProjecaoFutura();
    const container = document.getElementById('container-projecao-futura');
    const tituloModal = document.getElementById('modal-projecao-titulo');

    tituloModal.textContent = 'Projeção de Saldos Futuros';

    if (!dados) {
        container.innerHTML = '<p style="text-align:center; padding: 20px;">Nenhum lançamento futuro encontrado para gerar a projeção.</p>';
        abrirModal('modal-projecao-futura');
        return;
    }

    const formatarValor = (valor, moeda = 'BRL') => {
        if (valor === 0) return '-';
        return (moeda === 'BRL') ? formatarMoeda(valor) : formatarMoedaEstrangeira(valor, moeda);
    };

    const construirTabela = (titulo, items, moeda = 'BRL') => {
        let tabelaHtml = `<h2>${titulo}</h2><div class="tabela-projecao-wrapper"><table><thead><tr><th>${!moeda || moeda === 'BRL' ? 'Conta' : 'Ativo'}</th>`;
        dados.datas.forEach(data => {
            const d = new Date(data + 'T12:00:00');
            tabelaHtml += `<th class="numero">${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}</th>`;
        });
        tabelaHtml += `</tr></thead><tbody>`;

        items.forEach(item => {
            const itemIdStr = String(item.id);
            const nomeItem = !item.moeda || item.moeda === 'BRL' ? `${item.banco} - ${item.tipo}` : item.nomeAtivo;
            tabelaHtml += `<tr><td>${nomeItem}</td>`;
            
            let saldoCorrenteItem = dados.saldosIniciais.get(itemIdStr) || 0;

            dados.datas.forEach(dataStr => {
                const eventosDoDia = dados.dataMatrix.get(itemIdStr)?.get(dataStr) || [];
                let valorTotalDia = 0;
                let dataAttributes = '';

                if (eventosDoDia.length > 0) {
                    valorTotalDia = eventosDoDia.reduce((soma, ev) => soma + ev.valor, 0);
                    if (eventosDoDia.length === 1) {
                        const evento = eventosDoDia[0];
                        dataAttributes = `
                            data-lancamento-id="${evento.id}"
                            data-lancamento-source="${evento.source}"
                            data-lancamento-mae-id="${evento.maeId || ''}"
                            data-lancamento-data="${evento.data}"
                            data-lancamento-tipo="${evento.tipo}"
                            class="lancamento-projetado-clicavel"
                            title="Clique para editar este lançamento."
                        `;
                    } else if (eventosDoDia.length > 1) {
                        const tooltipText = `Este valor é a soma de ${eventosDoDia.length} transações. Não é possível editar por aqui.`;
                        dataAttributes = `
                            class="lancamento-projetado-multiplo"
                            title="${tooltipText}"
                        `;
                    }
                }
                
                saldoCorrenteItem += valorTotalDia;
                const classe = valorTotalDia < 0 ? 'valor-negativo' : valorTotalDia > 0 ? 'valor-positivo' : '';
                
                const valorLancamentoHtml = `<div ${dataAttributes}>${formatarValor(valorTotalDia, moeda)}</div>`;
                const saldoCelulaHtml = `<div class="saldo-diario-celula">${formatarValor(saldoCorrenteItem, moeda)}</div>`;
                
                tabelaHtml += `<td class="numero ${classe}">${valorLancamentoHtml}${saldoCelulaHtml}</td>`;
            });
            tabelaHtml += `</tr>`;
        });

        tabelaHtml += `</tbody><tfoot><tr class="total-row"><td><strong>Saldo Projetado</strong></td>`;
        let saldoAcumulado = items.reduce((soma, item) => soma + (dados.saldosIniciais.get(String(item.id)) || 0), 0);
        
        dados.datas.forEach(dataStr => {
            const movimentacaoDia = items.reduce((soma, item) => {
                const eventosDoDia = dados.dataMatrix.get(String(item.id))?.get(dataStr) || [];
                return soma + eventosDoDia.reduce((s, ev) => s + ev.valor, 0);
            }, 0);
            saldoAcumulado += movimentacaoDia;
            const classeSaldo = saldoAcumulado < 0 ? 'valor-negativo' : '';
            tabelaHtml += `<td class="numero ${classeSaldo}"><strong>${formatarValor(saldoAcumulado, moeda)}</strong></td>`;
        });
        tabelaHtml += `</tr></tfoot></table></div>`;
        return tabelaHtml;
    };

    let htmlFinal = '';
    const contasBRL = dados.items.filter(item => !item.moeda || item.moeda === 'BRL');
    const itemsMoedasAgrupados = dados.items
        .filter(item => item.moeda && item.moeda !== 'BRL')
        .reduce((acc, item) => {
            if (!acc[item.moeda]) acc[item.moeda] = [];
            acc[item.moeda].push(item);
            return acc;
        }, {});

    if (contasBRL.length > 0) {
        htmlFinal += construirTabela('Projeção Consolidada (BRL)', contasBRL, 'BRL');
    }
    
    Object.keys(itemsMoedasAgrupados).sort().forEach(moeda => {
        htmlFinal += construirTabela(`Projeção para ${moeda}`, itemsMoedasAgrupados[moeda], moeda);
    });

    container.innerHTML = htmlFinal;
    abrirModal('modal-projecao-futura');
}
function renderizarTelaMetas() {
    const container = document.getElementById('container-metas');
    if (todasAsMetas.length === 0) {
        container.innerHTML = '<p class="info-vazio">Nenhuma meta cadastrada ainda. Clique em "Adicionar Nova Meta" para começar.</p>';
        return;
    }

    const metasPendentes = [];
    const metasAtingidas = [];
    const projecao = calcularProjecaoProventosNegociacao();
    const projecaoRF = gerarDadosGraficoAportesProventos()?.datasets[0]?.data.slice(-12).reduce((a, b) => a + b, 0) / 12 || 0;

    todasAsMetas.forEach(meta => {
        let valorAtual = 0;
        let progresso = 0;
        const tipoMeta = meta.tipo;

        // --- INÍCIO DA ALTERAÇÃO ---
        // Lógica de cálculo foi reorganizada para evitar que um cálculo sobrescreva o outro.
        if (tipoMeta.startsWith('patrimonio')) {
            const patrimonioBRL = calcularValorTotalInvestimentosAtual();
            const moeda = meta.moedaAlvo || 'BRL';
            valorAtual = moeda === 'BRL' ? patrimonioBRL : (dadosMoedas.cotacoes[moeda] > 0 ? patrimonioBRL / dadosMoedas.cotacoes[moeda] : 0);
            progresso = meta.valorAlvo > 0 ? (valorAtual / meta.valorAlvo) : 0;
        } else if (tipoMeta.startsWith('renda_passiva')) {
            let proventosBRL = 0;
            const fonte = meta.fonteProventos || 'total_rv';
            
            switch (fonte) {
                case 'total_rv': proventosBRL = projecao.acoes + projecao.fiis; break;
                case 'total_geral': proventosBRL = projecao.acoes + projecao.fiis + projecaoRF; break;
                case 'fiis': proventosBRL = projecao.fiis; break;
                case 'acoes': proventosBRL = projecao.acoes; break;
            }
            
            if (tipoMeta === 'renda_passiva_sm') {
                const valorAlvoMonetario = meta.valorAlvo * salarioMinimo;
                valorAtual = proventosBRL;
                progresso = valorAlvoMonetario > 0 ? (valorAtual / valorAlvoMonetario) : 0;
            } else { // renda_passiva_moeda
                const moeda = meta.moedaAlvo || 'BRL';
                valorAtual = moeda === 'BRL' ? proventosBRL : (dadosMoedas.cotacoes[moeda] > 0 ? proventosBRL / dadosMoedas.cotacoes[moeda] : 0);
                progresso = meta.valorAlvo > 0 ? (valorAtual / meta.valorAlvo) : 0;
            }
        } else if (tipoMeta === 'posicao_ativo') {
            const posicoes = gerarPosicaoDetalhada();
            valorAtual = posicoes[meta.ativoAlvo] ? posicoes[meta.ativoAlvo].quantidade : 0;
            progresso = meta.valorAlvo > 0 ? (valorAtual / meta.valorAlvo) : 0;
        }
        // --- FIM DA ALTERAÇÃO ---

        const metaComProgresso = { ...meta, valorAtual, progresso };

        if (progresso >= 1) {
            metasAtingidas.push(metaComProgresso);
        } else {
            metasPendentes.push(metaComProgresso);
        }
    });

    let htmlMetas = '';

    if (metasPendentes.length > 0) {
        htmlMetas += '<h2 class="metas-secao-titulo">Metas em Andamento</h2>';
        metasPendentes.sort((a, b) => b.progresso - a.progresso).forEach(meta => {
            htmlMetas += gerarHtmlMetaCard(meta);
        });
    }

    if (metasAtingidas.length > 0) {
        htmlMetas += '<h2 class="metas-secao-titulo">Metas Concluídas</h2>';
        metasAtingidas.sort((a, b) => a.nome.localeCompare(b.nome)).forEach(meta => {
            htmlMetas += gerarHtmlMetaCard(meta, true);
        });
    }
    
    container.innerHTML = htmlMetas;

    function gerarHtmlMetaCard(meta, isAtingida = false) {
        let htmlValorAtual = '', htmlValorAlvo = '', htmlPrevisao = '', historico = [];
        const moeda = meta.moedaAlvo || 'BRL';
        
        // --- INÍCIO DA ALTERAÇÃO ---
        // Lógica de exibição e previsão também foi reorganizada e corrigida.
        if (meta.tipo.startsWith('renda_passiva')) {
            const fonte = meta.fonteProventos || 'total_rv';
            if (fonte === 'fiis') historico = historicoCarteira.map(s => ({ data: s.data, valor: s.detalhesCarteira && s.detalhesCarteira.ativos ? calcularProjecaoProventosNegociacao(s.detalhesCarteira.ativos).fiis : 0 }));
            else if (fonte === 'acoes') historico = historicoCarteira.map(s => ({ data: s.data, valor: s.detalhesCarteira && s.detalhesCarteira.ativos ? calcularProjecaoProventosNegociacao(s.detalhesCarteira.ativos).acoes : 0 }));
            else historico = historicoCarteira.map(s => ({ data: s.data, valor: s.detalhesCarteira && s.detalhesCarteira.ativos ? calcularProjecaoProventosNegociacao(s.detalhesCarteira.ativos).fiis + calcularProjecaoProventosNegociacao(s.detalhesCarteira.ativos).acoes : 0 }));

            if (meta.tipo === 'renda_passiva_sm') {
                const valorAlvoMonetario = meta.valorAlvo * salarioMinimo;
                const valorAtualEmSM = salarioMinimo > 0 ? meta.valorAtual / salarioMinimo : 0;
                htmlValorAlvo = `${meta.valorAlvo} SM (${formatarMoeda(valorAlvoMonetario)})`;
                htmlValorAtual = `${formatarDecimal(valorAtualEmSM, 2)} SM (${formatarMoeda(meta.valorAtual)})`;
                previsao = calcularPrevisaoMeta(historico, meta.valorAtual, valorAlvoMonetario);
            } else {
                htmlValorAlvo = formatarValor(meta.valorAlvo, moeda);
                htmlValorAtual = formatarValor(meta.valorAtual, moeda);
                previsao = calcularPrevisaoMeta(historico, meta.valorAtual, meta.valorAlvo);
            }
        } 
        else if (meta.tipo.startsWith('patrimonio')) {
            const historicoFormatado = historicoCarteira.map(s => ({ data: s.data, valor: s.valorTotalInvestimentos || s.valor }));
            previsao = calcularPrevisaoMeta(historicoFormatado, meta.valorAtual, meta.valorAlvo);
            htmlValorAlvo = formatarValor(meta.valorAlvo, moeda);
            htmlValorAtual = formatarValor(meta.valorAtual, moeda);
        } else if (meta.tipo === 'posicao_ativo') {
            htmlValorAlvo = `${meta.valorAlvo} cotas`;
            htmlValorAtual = `${Math.round(meta.valorAtual)} cotas`;
        }
        // --- FIM DA ALTERAÇÃO ---
        
        if (previsao && !isAtingida) {
            htmlPrevisao = `<div class="meta-previsao">Previsão de Conclusão: <strong>${previsao}</strong></div>`;
        }

        const classeAtingida = isAtingida ? 'meta-atingida' : '';
        const progressoPercentual = meta.progresso * 100;

        return `
            <div class="meta-card ${classeAtingida}">
                <div class="meta-card-header">
                    <h3>${meta.nome}</h3>
                    <div class="meta-card-controles">
                        <i class="fas fa-edit acao-btn edit" title="Editar Meta" data-meta-id="${meta.id}"></i>
                        <i class="fas fa-trash acao-btn delete" title="Excluir Meta" data-meta-id="${meta.id}"></i>
                    </div>
                </div>
                <div class="meta-card-body">
                    <div class="meta-progresso-info">
                        <span>Progresso: <strong>${progressoPercentual.toFixed(2)}%</strong></span>
                    </div>
                    <div class="meta-progresso-barra-container">
                        <div class="meta-progresso-barra" style="width: ${Math.min(progressoPercentual, 100)}%;"></div>
                    </div>
                    <div class="meta-valores">
                        <div class="meta-valor-item">
                            <label>Alcançado</label>
                            <span>${htmlValorAtual}</span>
                        </div>
                        <div class="meta-valor-item">
                            <label>Alvo</label>
                            <span>${htmlValorAlvo}</span>
                        </div>
                    </div>
                    ${htmlPrevisao}
                </div>
            </div>
        `;
    }
}
function abrirModalCadastroMeta(metaParaEditar = null) {
    const form = document.getElementById('form-cadastro-meta');
    form.reset();
    document.getElementById('meta-ativo-alvo-group').style.display = 'none';
    document.getElementById('meta-moeda-group').style.display = 'none';
    document.getElementById('meta-fonte-proventos-group').style.display = 'none';

    if (metaParaEditar) {
        document.getElementById('modal-meta-titulo').textContent = 'Editar Meta';
        document.getElementById('meta-id').value = metaParaEditar.id;
        document.getElementById('meta-nome').value = metaParaEditar.nome;
        document.getElementById('meta-valor-alvo').value = formatarDecimalParaInput(metaParaEditar.valorAlvo);
        
        const tipoAntigo = metaParaEditar.tipo;
        const tipoSelect = document.getElementById('meta-tipo');

        // Lógica de compatibilidade com o novo tipo de meta
        if (tipoAntigo === 'posicao_ativo') {
            tipoSelect.value = 'posicao_ativo';
            document.getElementById('meta-ativo-alvo').value = metaParaEditar.ativoAlvo;
        } else if (tipoAntigo.startsWith('patrimonio')) {
            tipoSelect.value = 'patrimonio_moeda';
            document.getElementById('meta-moeda-alvo').value = metaParaEditar.moedaAlvo || 'BRL';
        } else if (tipoAntigo === 'renda_passiva_sm') {
            tipoSelect.value = 'renda_passiva_sm';
            document.getElementById('meta-fonte-proventos').value = metaParaEditar.fonteProventos || 'total_rv';
        } else if (tipoAntigo.startsWith('renda_passiva')) {
            tipoSelect.value = 'renda_passiva_moeda';
            document.getElementById('meta-moeda-alvo').value = metaParaEditar.moedaAlvo || 'BRL';
            let fonte = metaParaEditar.fonteProventos;
            if (!fonte) {
                if (tipoAntigo === 'renda_passiva_fiis') fonte = 'fiis';
                else if (tipoAntigo === 'renda_passiva_acoes') fonte = 'acoes';
                else fonte = 'total_rv';
            }
            document.getElementById('meta-fonte-proventos').value = fonte;
        }

    } else {
        document.getElementById('modal-meta-titulo').textContent = 'Adicionar Nova Meta';
        document.getElementById('meta-id').value = '';
    }
    
    document.getElementById('meta-tipo').dispatchEvent(new Event('change'));
    abrirModal('modal-cadastro-meta');
    document.getElementById('meta-nome').focus();
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

        const isSynced = evento.enviarParaFinancas === true; // <<< CORREÇÃO AQUI
        const iconeSync = isSynced ? '⇄ ' : '';
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
        } else if (evento.source === 'manual' || evento.source === 'recorrente_confirmada' || evento.transferenciaId) { // Adicionado 'transferenciaId' aqui
            const syncActive = isSynced ? 'sync-active' : '';
            const syncTitle = isSynced ? "Desativar sincronia com Finanças da Casa" : "Ativar sincronia com Finanças da Casa";
            controles = `<i class="fas fa-sync-alt acao-btn toggle-sync ${syncActive}" title="${syncTitle}" data-id="${evento.id}" data-type="moeda"></i>
                         <i class="fas fa-edit acao-btn edit" title="Editar Movimentação" data-id="${evento.id}" data-type="moeda"></i>
                         <i class="fas fa-trash acao-btn delete" title="Excluir Movimentação" data-id="${evento.id}" data-type="moeda"></i>`;
        } else {
            controles = `<i class="fas fa-lock" title="Transação automática."></i>`;
        }

        corpoTabela += `<tr class="${linhaClasse.trim()}">
            <td>${new Date(evento.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
            <td>${iconeSync}${evento.descricao}</td>
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
function renderizarTelaNegociar() {
    // 1. Configura o Input de Aporte
    const inputAporte = document.getElementById('negociar-aporte-valor');
    if (inputAporte) {
        inputAporte.value = dadosSimulacaoNegociar.aporteTotal ? formatarDecimalParaInput(parseDecimal(dadosSimulacaoNegociar.aporteTotal)) : '';
    }

    // 2. Carrega Dados
    const posicoesAtuais = gerarPosicaoDetalhada();
    const dadosBalanceamento = gerarDadosBalanceamento('todos');
    const projecaoProventos = calcularProjecaoProventosNegociacao();

    const getTickersToDisplay = (tipoSimulacao) => {
        const tickers = new Set();
        const tipoAtivoCorreto = tipoSimulacao === 'acoes' ? 'Ação' : 'FII'; 

        todosOsAtivos.forEach(a => {
            const tipoAtivo = a.tipo === 'Ação' ? 'acoes' : 'fiis';
            if (tipoAtivo === tipoSimulacao && posicoesAtuais[a.ticker] && posicoesAtuais[a.ticker].quantidade > 0) {
                tickers.add(a.ticker);
            }
        });

        if (dadosSimulacaoNegociar[tipoSimulacao]) {
            Object.keys(dadosSimulacaoNegociar[tipoSimulacao]).forEach(ticker => {
                if (dadosSimulacaoNegociar[tipoSimulacao][ticker].qtd !== 0) {
                    tickers.add(ticker);
                }
            });
        }

        Object.keys(dadosAlocacao.ativos).forEach(ticker => {
            const ativoInfo = todosOsAtivos.find(a => a.ticker === ticker);
            if (ativoInfo && ativoInfo.tipo === tipoAtivoCorreto) {
                tickers.add(ticker);
            }
        });

        return Array.from(tickers).sort();
    };

    // --- RENDERIZAÇÃO: FIIs ---
    const tbodyFiis = document.getElementById('negociar-fiis-tbody');
    const tfootFiis = document.getElementById('negociar-fiis-tfoot');
    tbodyFiis.innerHTML = '';
    const fiisParaExibir = getTickersToDisplay('fiis');

    if (fiisParaExibir.length === 0) {
        tbodyFiis.innerHTML = '<tr><td colspan="16" class="text-center text-muted" style="padding: 20px;">Nenhum FII encontrado.</td></tr>';
        tfootFiis.style.display = 'none';
    } else {
        tfootFiis.style.display = 'table-footer-group';
        let htmlFiis = '';
        
        fiisParaExibir.forEach(ticker => {
            const fii = todosOsAtivos.find(a => a.ticker === ticker);
            if (!fii) return;

            const posicao = posicoesAtuais[ticker];
            const dadosMercado = dadosDeMercado.cotacoes[ticker] || {};
            const dadosSimulacao = dadosSimulacaoNegociar.fiis[ticker] || {};
            const dadosDoAtivoNoBalanceamento = dadosBalanceamento.categorias['FIIs']?.ativos.find(a => a.ticker === ticker);
            
            const qtdAtual = posicao ? posicao.quantidade : 0;
            const precoMedio = posicao ? posicao.precoMedio : 0;
            const precoAtual = dadosMercado.valor || 0;
            const vpa = dadosMercado.vpa || 0;
            const ultimoProvento = getUltimoProvento(ticker);
            
            const metaQtd = dadosDoAtivoNoBalanceamento ? Math.round(dadosDoAtivoNoBalanceamento.ideal.quantidade) : 0;
            const ajusteQtd = dadosDoAtivoNoBalanceamento ? Math.round(dadosDoAtivoNoBalanceamento.ajuste.quantidade) : 0;
            
            let ajusteQtdHtml = '<span class="text-muted">-</span>';
            if (ajusteQtd > 0) ajusteQtdHtml = `<span class="badge badge-success" style="font-size: 0.9em;">+${ajusteQtd}</span>`;
            else if (ajusteQtd < 0) ajusteQtdHtml = `<span class="badge badge-danger" style="font-size: 0.9em;">${ajusteQtd}</span>`;

            const qtdSimulada = dadosSimulacao.qtd || 0;
            const precoSimulado = dadosSimulacao.preco || precoAtual;
            const rendimentoAtual = ultimoProvento * qtdAtual;
            const yieldProjetado = (precoAtual > 0 && ultimoProvento > 0) ? (ultimoProvento * 12) / precoAtual : 0;

            const diffPercent = precoMedio > 0 ? ((precoAtual - precoMedio) / precoMedio) : 0;
            let classeVariacao = diffPercent >= 0 ? 'text-success' : 'text-danger';
            let iconeVariacao = diffPercent >= 0 ? '▲' : '▼';
            let variacaoHtml = `<span class="${classeVariacao}" style="font-size: 0.9em;">${iconeVariacao} ${formatarPercentual(Math.abs(diffPercent))}</span>`;

            htmlFiis += `
            <tr data-ticker="${ticker}" data-qtd-atual="${qtdAtual}" data-ultimo-provento="${ultimoProvento}" style="vertical-align: middle;">
                <td style="font-weight: 600;">${ticker}</td>
                <td class="numero">${formatarPrecoMedio(precoMedio)}</td>
                <td class="numero" style="font-weight: bold;">${formatarMoeda(precoAtual)}</td>
                <td class="text-center">${variacaoHtml}</td>
                <td class="numero">${vpa > 0 ? formatarDecimal(precoMedio / vpa) : '-'}</td>
                <td class="numero">${vpa > 0 ? formatarDecimal(precoAtual / vpa) : '-'}</td>
                <td class="percentual text-info">${yieldProjetado > 0 ? formatarPercentual(yieldProjetado) : '-'}</td>
                <td class="numero col-qtd">${Math.round(qtdAtual)}</td>
                <td class="numero col-qtd text-muted">${metaQtd}</td>
                <td class="numero col-qtd text-center">${ajusteQtdHtml}</td>
                <td class="p-1">
                    <input type="number" class="form-control form-control-sm text-center input-in-table negociar-input-qtd" placeholder="0" value="${qtdSimulada || ''}" style="min-width: 60px;">
                </td>
                <td class="p-1">
                    <input type="text" class="form-control form-control-sm text-right input-in-table negociar-input-preco" value="${formatarDecimalParaInput(precoSimulado)}" style="min-width: 80px;">
                </td>
                <td class="numero font-weight-bold" data-field="totalCompraSimulado" style="color: #2c3e50;">R$ 0,00</td>
                <td class="numero col-qtd" data-field="posicaoFinalSimulada" style="font-weight: bold;">${Math.round(qtdAtual)}</td>
                <td class="numero" data-field="rendimentoAtual">${formatarMoeda(rendimentoAtual)}</td>
                <td class="numero text-success" data-field="rendimentoPosCompra">${formatarMoeda(rendimentoAtual)}</td>
            </tr>`;
        });
        tbodyFiis.innerHTML = htmlFiis;
    }
    tfootFiis.querySelector('[id^="total-rend-atual-"]').textContent = formatarMoeda(projecaoProventos.fiis);

    // --- RENDERIZAÇÃO: AÇÕES ---
    const tbodyAcoes = document.getElementById('negociar-acoes-tbody');
    const tfootAcoes = document.getElementById('negociar-acoes-tfoot');
    tbodyAcoes.innerHTML = '';
    const acoesParaExibir = getTickersToDisplay('acoes');

    if (acoesParaExibir.length === 0) {
        tbodyAcoes.innerHTML = '<tr><td colspan="19" class="text-center text-muted" style="padding: 20px;">Nenhuma Ação encontrada.</td></tr>';
        tfootAcoes.style.display = 'none';
    } else {
        tfootAcoes.style.display = 'table-footer-group';
        let htmlAcoes = '';
        
        acoesParaExibir.forEach(ticker => {
            const acao = todosOsAtivos.find(a => a.ticker === ticker);
            if (!acao) return;

            const posicao = posicoesAtuais[ticker];
            const dadosMercado = dadosDeMercado.cotacoes[ticker] || {};
            const dadosSimulacao = dadosSimulacaoNegociar.acoes[ticker] || {};
            const dadosDoAtivoNoBalanceamento = dadosBalanceamento.categorias['Ações']?.ativos.find(a => a.ticker === ticker);
            
            const qtdAtual = posicao ? posicao.quantidade : 0;
            const precoMedio = posicao ? posicao.precoMedio : 0;
            const precoAtual = dadosMercado.valor || 0;
            const lpa = dadosMercado.lpa_acao || 0;
            const vpa = dadosMercado.vpa || 0;
            const min52 = dadosMercado.min52 || 0;
            const max52 = dadosMercado.max52 || 0;
            
            const projecaoAnualUnitaria = calcularProjecaoAnualUnitaria(ticker, { limiteAnos: 5 });
            const yieldProjetado = (precoAtual > 0 && projecaoAnualUnitaria > 0) ? projecaoAnualUnitaria / precoAtual : 0;
            const metaYieldBazin = acao.metaYieldBazin || 0.06;
            const precoTetoBazin = calcularPrecoTetoBazin(projecaoAnualUnitaria, metaYieldBazin);
            const precoTetoGraham = calcularPrecoTetoGraham(lpa, vpa);
            const pl = lpa > 0 ? (precoAtual / lpa) : 0;
            const payout = (lpa > 0 && projecaoAnualUnitaria > 0) ? (projecaoAnualUnitaria / lpa) : 0;

            const metaQtd = dadosDoAtivoNoBalanceamento ? Math.round(dadosDoAtivoNoBalanceamento.ideal.quantidade) : 0;
            const ajusteQtd = dadosDoAtivoNoBalanceamento ? Math.round(dadosDoAtivoNoBalanceamento.ajuste.quantidade) : 0;
            
            let ajusteQtdHtml = '<span class="text-muted">-</span>';
            if (ajusteQtd > 0) ajusteQtdHtml = `<span class="badge badge-success" style="font-size: 0.9em;">+${ajusteQtd}</span>`;
            else if (ajusteQtd < 0) ajusteQtdHtml = `<span class="badge badge-danger" style="font-size: 0.9em;">${ajusteQtd}</span>`;

            const qtdSimulada = dadosSimulacao.qtd || 0;
            const precoSimulado = dadosSimulacao.preco || precoAtual;
            const rendimentoAtual = (projecaoAnualUnitaria * qtdAtual) / 12;
            
            const diffPercent = precoMedio > 0 ? ((precoAtual - precoMedio) / precoMedio) : 0;
            let classeVariacao = diffPercent >= 0 ? 'text-success' : 'text-danger';
            let iconeVariacao = diffPercent >= 0 ? '▲' : '▼';
            let variacaoHtml = `<span class="${classeVariacao}" style="font-size: 0.9em;">${iconeVariacao} ${formatarPercentual(Math.abs(diffPercent))}</span>`;

            htmlAcoes += `
            <tr data-ticker="${ticker}" data-qtd-atual="${qtdAtual}" data-dividendo-anual="${projecaoAnualUnitaria}" data-meta-yield-bazin="${metaYieldBazin}" style="vertical-align: middle;">
                <td style="font-weight: 600;">${ticker}</td>
                <td class="numero">${formatarPrecoMedio(precoMedio)}</td>
                <td class="numero" style="font-weight: bold;">${formatarMoeda(precoAtual)}</td>
                <td class="text-center">${variacaoHtml}</td>
                <td class="numero" style="font-size: 0.85em; color: #7f8c8d;">${formatarMoeda(min52)} - ${formatarMoeda(max52)}</td>
                <td class="numero" style="background-color: #fcfbfd;">
                    <div class="bazin-cell-container" style="display: flex; flex-direction: column; align-items: flex-end;">
                        <span data-field="precoTetoBazin" style="font-weight: bold; color: #6f42c1;">${formatarMoeda(precoTetoBazin)}</span>
                        <span class="meta-yield-display" title="Meta Yield Cadastrada" style="font-size: 0.7em; color: #aaa;">Meta: ${formatarPercentual(metaYieldBazin)}</span>
                    </div>
                </td>
                <td class="numero">${formatarMoeda(precoTetoGraham)}</td>
                <td class="numero">${lpa > 0 ? formatarDecimal(pl) : '-'}</td>
                <td class="numero">${lpa > 0 ? formatarPercentual(payout) : '-'}</td>
                <td class="percentual text-info">${yieldProjetado > 0 ? formatarPercentual(yieldProjetado) : '-'}</td>
                <td class="numero col-qtd">${Math.round(qtdAtual)}</td>
                <td class="numero col-qtd text-muted">${metaQtd}</td>
                <td class="numero col-qtd text-center">${ajusteQtdHtml}</td>
                <td class="p-1">
                    <input type="number" class="form-control form-control-sm text-center input-in-table negociar-input-qtd" placeholder="0" value="${qtdSimulada || ''}" style="min-width: 60px;">
                </td>
                <td class="p-1">
                    <input type="text" class="form-control form-control-sm text-right input-in-table negociar-input-preco" value="${formatarDecimalParaInput(precoSimulado)}" style="min-width: 80px;">
                </td>
                <td class="numero font-weight-bold" data-field="totalCompraSimulado" style="color: #2c3e50;">R$ 0,00</td>
                <td class="numero col-qtd" data-field="posicaoFinalSimulada" style="font-weight: bold;">${Math.round(qtdAtual)}</td>
                <td class="numero" data-field="rendimentoAtual">${formatarMoeda(rendimentoAtual)}</td>
                <td class="numero text-success" data-field="rendimentoPosCompra">${formatarMoeda(rendimentoAtual)}</td>
            </tr>`;
        });
        tbodyAcoes.innerHTML = htmlAcoes;
    }
    tfootAcoes.querySelector('[id^="total-rend-atual-"]').textContent = formatarMoeda(projecaoProventos.acoes);

    // --- LOGICA DE INTERAÇÃO E CÁLCULO ---
    const containerTela = document.getElementById('tela-negociar');
    
    if (containerTela._listener) {
        containerTela.removeEventListener('input', containerTela._listener);
        containerTela.removeEventListener('change', containerTela._listener);
    }
    if (containerTela._keydownListener) {
        containerTela.removeEventListener('keydown', containerTela._keydownListener);
    }
    
    const recalcularAoInteragir = (e) => {
        if (!e.target.classList.contains('input-in-table')) return;
        const tr = e.target.closest('tr'); if (!tr) return;
        const ticker = tr.dataset.ticker;
        const tipoAtivo = tr.closest('tbody').id.includes('fiis') ? 'fiis' : 'acoes';
        
        let qtdSimulada = parseInt(tr.querySelector('.negociar-input-qtd').value, 10) || 0;
        const precoSimulado = parseDecimal(tr.querySelector('.negociar-input-preco').value) || 0;
    
        // Validação de Saldo
        if (qtdSimulada > 0) {
            const inputAporteEl = document.getElementById('negociar-aporte-valor');
            const aporteTotal = inputAporteEl ? parseDecimal(inputAporteEl.value) : 0;
            let custoOutrasOperacoes = 0;
            ['fiis', 'acoes'].forEach(tipo => {
                if(dadosSimulacaoNegociar[tipo]) {
                    for (const t in dadosSimulacaoNegociar[tipo]) {
                        if (t !== ticker) { 
                            const sim = dadosSimulacaoNegociar[tipo][t];
                            custoOutrasOperacoes += (sim.qtd || 0) * (sim.preco || 0);
                        }
                    }
                }
            });
            const saldoDisponivelAntesDestaCompra = aporteTotal - custoOutrasOperacoes;
            if (precoSimulado > 0 && (qtdSimulada * precoSimulado > saldoDisponivelAntesDestaCompra + 0.01)) {
                const maxQtdPossivel = Math.floor(saldoDisponivelAntesDestaCompra / precoSimulado);
                qtdSimulada = maxQtdPossivel; 
                tr.querySelector('.negociar-input-qtd').value = qtdSimulada > 0 ? qtdSimulada : ''; 
            }
        }
    
        if (!dadosSimulacaoNegociar[tipoAtivo]) dadosSimulacaoNegociar[tipoAtivo] = {};
        if (!dadosSimulacaoNegociar[tipoAtivo][ticker]) dadosSimulacaoNegociar[tipoAtivo][ticker] = {};
        dadosSimulacaoNegociar[tipoAtivo][ticker].qtd = qtdSimulada;
        dadosSimulacaoNegociar[tipoAtivo][ticker].preco = precoSimulado;
    
        // --- FEEDBACK VISUAL CORRIGIDO ---
        // Aqui usamos as classes do CSS que acabei de fornecer
        tr.classList.remove('simulacao-compra', 'simulacao-venda');
        if (qtdSimulada > 0) {
            tr.classList.add('simulacao-compra'); // Verde
        } else if (qtdSimulada < 0) {
            tr.classList.add('simulacao-venda'); // Vermelho
        }
    
        const qtdAtual = parseFloat(tr.dataset.qtdAtual);
        tr.querySelector('[data-field="totalCompraSimulado"]').textContent = formatarMoeda(qtdSimulada * precoSimulado);
        tr.querySelector('[data-field="posicaoFinalSimulada"]').textContent = Math.round(qtdAtual + qtdSimulada);
        
        let totalRendPosCompraGrupo = 0;
        const tbody = tr.closest('tbody');
        
        if (tipoAtivo === 'fiis') {
            const ultimoProvento = parseFloat(tr.dataset.ultimoProvento);
            tr.querySelector('[data-field="rendimentoPosCompra"]').textContent = formatarMoeda(ultimoProvento * (qtdAtual + qtdSimulada));
        } else {
            const dividendoAnual = parseFloat(tr.dataset.dividendoAnual);
            tr.querySelector('[data-field="rendimentoPosCompra"]').textContent = formatarMoeda((dividendoAnual * (qtdAtual + qtdSimulada)) / 12);
        }        
        
        let totalRendAtualGrupoRecalculado = 0;
        tbody.querySelectorAll('tr').forEach(row => {
            const rendAtualEl = row.querySelector('[data-field="rendimentoAtual"]');
            if (rendAtualEl) totalRendAtualGrupoRecalculado += parseDecimal(rendAtualEl.textContent);
            const rendPosCompraEl = row.querySelector('[data-field="rendimentoPosCompra"]');
            if (rendPosCompraEl) totalRendPosCompraGrupo += parseDecimal(rendPosCompraEl.textContent);
        });

        const tfoot = tbody.nextElementSibling;
        tfoot.querySelector(`[id^="total-rend-atual-"]`).textContent = formatarMoeda(totalRendAtualGrupoRecalculado);
        
        const diffRaw = totalRendPosCompraGrupo - totalRendAtualGrupoRecalculado;
        const diff = Math.abs(diffRaw) < 0.005 ? 0 : diffRaw;
        
        tfoot.querySelector(`[id^="total-rend-pos-compra-"]`).textContent = formatarMoeda(totalRendPosCompraGrupo);
        const diffEl = tfoot.querySelector(`[id^="diff-rend-"]`);
        diffEl.textContent = diff > 0.005 ? "+" + formatarMoeda(diff) : formatarMoeda(diff);
        diffEl.className = `numero ${diff > 0.005 ? 'text-success' : diff < -0.005 ? 'text-danger' : 'text-muted'}`;
        
        atualizarResumoAporte();
        if (e.type === 'change') salvarDadosSimulacaoNegociar(); 
    };

    containerTela._listener = recalcularAoInteragir;
    containerTela.addEventListener('input', containerTela._listener);
    containerTela.addEventListener('change', containerTela._listener);

    const handleEnterKey = (e) => {
        if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
            e.preventDefault();
            e.target.blur();
        }
    };
    containerTela._keydownListener = handleEnterKey;
    containerTela.addEventListener('keydown', containerTela._keydownListener);
    
    containerTela.querySelectorAll('tbody tr .input-in-table').forEach(input => {
        input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    });
}