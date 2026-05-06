// Variable Income Asset Management // Gestão de Ativos de Renda Variável
function abrirModalAtivosPorCNPJ(cnpj) {
    if (!cnpj) return;

    const ativosDoMesmoGrupo = todosOsAtivos.filter(a => a.cnpj === cnpj);
    if (ativosDoMesmoGrupo.length <= 1) return; // Não abre o modal se houver apenas 1 ativo

    const primeiroAtivo = ativosDoMesmoGrupo[0];
    const nomeEmpresa = primeiroAtivo.nome || primeiroAtivo.nomePregao || `CNPJ: ${formatarCNPJ(cnpj)}`;

    document.getElementById('modal-cnpj-titulo').textContent = `Ativos de: ${nomeEmpresa}`;
    
    let listaHtml = '<ul>';
    ativosDoMesmoGrupo.forEach(ativo => {
        listaHtml += `<li>${ativo.ticker}</li>`;
    });
    listaHtml += '</ul>';

    document.getElementById('modal-cnpj-conteudo').innerHTML = listaHtml;
    abrirModal('modal-lista-ativos-cnpj');
}
function renderizarTabelaAtivos() {
    const container = document.getElementById('lista-de-ativos-cadastrados');
    
    // Cabeçalhos da tabela
    // ALTERAÇÃO: Adicionado style="text-align: left;" na coluna Meta Yield Bazin
    const tableHeaders = `
        <th class="sortable" data-key="ticker">Ativo</th>
        <th class="sortable" data-key="nomePregao">Nome Pregão</th>
        <th class="sortable" data-key="nome">Nome</th>
        <th class="sortable" data-key="tipo">Tipo</th>
        <th class="sortable" data-key="subtipoFii">Classificação</th> 
        <th class="sortable" data-key="metaYieldBazin" style="text-align: left;">Meta Yield Bazin (%)</th>
        <th class="sortable" data-key="cnpj">CNPJ</th>
        <th class="controles-col">Controles</th>`;
    
    container.innerHTML = `<table><thead><tr>${tableHeaders}</tr></thead><tbody id="tabela-ativos-body"></tbody></table>`;
    
    const body = document.getElementById('tabela-ativos-body');
    body.innerHTML = '';
    
    // Ordenação dos dados
    const sortedAtivos = [...todosOsAtivos].sort((a, b) => {
        const key = sortConfigAtivos.key;
        const direction = sortConfigAtivos.direction === 'ascending' ? 1 : -1;
        const valA = a[key] || '';
        const valB = b[key] || '';
        if (typeof valA === 'string' && typeof valB === 'string') {
            return valA.localeCompare(valB) * direction;
        }
        if (valA < valB) return -1 * direction;
        if (valA > valB) return 1 * direction;
        return 0;
    });

    sortedAtivos.forEach(ativo => {
        const tr = document.createElement('tr');
        tr.dataset.id = ativo.id;
        
        // Ícone de alerta se faltar o Tipo
        const warningIcon = !ativo.tipo ? `<i class="fas fa-exclamation-triangle warning-icon" title="Cadastro incompleto: Tipo de Ativo é obrigatório"></i>` : '';
        
        // --- LÓGICA DO META YIELD BAZIN ---
        // Padrão para não-ações (FII, ETF): Traço
        let metaYieldBazinDisplay = '-';
        
        if (ativo.tipo === 'Ação') {
            // Se for Ação, verifica se tem número
            if (typeof ativo.metaYieldBazin === 'number') {
                metaYieldBazinDisplay = formatarDecimal(ativo.metaYieldBazin * 100);
            } else {
                metaYieldBazinDisplay = 'N/D';
            }
        }

        // --- LÓGICA DA CLASSIFICAÇÃO (SUBTIPO) ---
        let textoClassificacao = '-';
        if (ativo.tipo === 'FII') {
            textoClassificacao = ativo.subtipoFii || 'N/D';
        }

        if (isAtivosEditMode) {
            // --- MODO EDIÇÃO ---
            
            // Campo Meta Yield (Apenas para Ações)
            // Se o valor for 'N/D', limpamos o input (value="") e usamos placeholder para indicar
            let valorInputYield = metaYieldBazinDisplay;
            if (valorInputYield === 'N/D' || valorInputYield === '-') valorInputYield = '';

            const campoYield = (ativo.tipo === 'Ação')
                ? `<input type="text" class="edit-field" data-field="metaYieldBazin" value="${valorInputYield}" placeholder="N/D" style="width: 60px; text-align: left;">`
                : '<span style="color:#ccc; display:block; text-align:left;">-</span>';

            // Campo Classificação (Apenas para FIIs)
            let campoClassificacao = '';
            if (ativo.tipo === 'FII') {
                campoClassificacao = `
                    <select class="edit-field" data-field="subtipoFii">
                        <option value="">N/D</option>
                        <option value="Tijolo" ${ativo.subtipoFii === 'Tijolo' ? 'selected' : ''}>Tijolo</option>
                        <option value="Papel" ${ativo.subtipoFii === 'Papel' ? 'selected' : ''}>Papel</option>
                        <option value="Hibrido" ${ativo.subtipoFii === 'Hibrido' ? 'selected' : ''}>Híbrido</option>
                    </select>
                `;
            } else {
                campoClassificacao = '<span style="color:#ccc">-</span>';
            }

            // Renderiza linha em modo edição
            tr.innerHTML = `
                <td><input type="text" class="edit-field ticker-input" data-field="ticker" value="${ativo.ticker || ''}" style="width: 80px;"></td>
                <td><input type="text" class="edit-field" data-field="nomePregao" value="${ativo.nomePregao || ''}"></td>
                <td><input type="text" class="edit-field" data-field="nome" value="${ativo.nome || ''}"></td>
                <td>
                    <select class="edit-field" data-field="tipo" style="width: 80px;">
                        <option value="">...</option>
                        <option value="Ação" ${ativo.tipo === 'Ação' ? 'selected' : ''}>Ação</option>
                        <option value="FII" ${ativo.tipo === 'FII' ? 'selected' : ''}>FII</option>
                        <option value="ETF" ${ativo.tipo === 'ETF' ? 'selected' : ''}>ETF</option>
                    </select>
                </td>
                <td>${campoClassificacao}</td>
                <td>${campoYield}</td>
                <td><input type="text" class="edit-field" data-field="cnpj" value="${formatarCNPJ(ativo.cnpj)}" style="width: 130px;"></td>
                <td></td>`;
        } else {
            // --- MODO VISUALIZAÇÃO ---
            // Removemos a classe 'numero' do yield para permitir alinhamento à esquerda customizado
            tr.innerHTML = `
                <td>${ativo.ticker} ${warningIcon}</td>
                <td>${ativo.nomePregao || ''}</td>
                <td>${ativo.nome || ''}</td>
                <td>${ativo.tipo || ''}</td>
                <td>${textoClassificacao}</td> 
                <td style="text-align: left;">${metaYieldBazinDisplay}</td>
                <td class="cnpj-clicavel" data-cnpj="${ativo.cnpj}">${formatarCNPJ(ativo.cnpj)}</td>
                <td class="controles-col">
                    <i class="fas fa-edit acao-btn edit" title="Editar Ativo" data-ativo-id="${ativo.id}"></i>
                    <i class="fas fa-trash acao-btn delete" title="Excluir Ativo" data-ativo-id="${ativo.id}"></i>
                </td>`;
        }
        body.appendChild(tr);
    });

    // Reativa os indicadores visuais de ordenação
    document.querySelectorAll('#lista-de-ativos-cadastrados .sortable').forEach(header => {
        header.classList.remove('ascending', 'descending');
        if (header.dataset.key === sortConfigAtivos.key) {
            header.classList.add(sortConfigAtivos.direction);
        }
    });
}
function verificarTickerExistente(event) {
    const tickerInput = event.target;
    const ticker = tickerInput.value.toUpperCase().trim();
    if (!ticker) return;

    const ativoExistente = todosOsAtivos.find(a => a.ticker === ticker);

    if (ativoExistente) {
        // --- Comportamento 1: Ativo já existe, carrega para edição ---
        alert(`O ativo ${ticker} já está cadastrado. Carregando dados para edição.`);
        
        // Preenche o formulário com os dados do ativo encontrado
        document.getElementById('modal-ativo-titulo').textContent = 'Editar Ativo';
        document.getElementById('ativo-id').value = ativoExistente.id;
        document.getElementById('ativo-tipo').value = ativoExistente.tipo;
        document.getElementById('ativo-nome-pregao').value = ativoExistente.nomePregao || '';
        document.getElementById('ativo-nome').value = ativoExistente.nome;
        document.getElementById('ativo-cnpj').value = formatarCNPJ(ativoExistente.cnpj);
        document.getElementById('ativo-tipo-acao').value = ativoExistente.tipoAcao || '';
        document.getElementById('ativo-admin-nome').value = ativoExistente.adminNome || '';
        document.getElementById('ativo-admin-cnpj').value = formatarCNPJ(ativoExistente.adminCnpj);

        // --- NOVO: Preenche o subtipo se for FII ---
        if (ativoExistente.tipo === 'FII') {
            document.getElementById('ativo-subtipo-fii').value = ativoExistente.subtipoFii || '';
        } else {
            document.getElementById('ativo-subtipo-fii').value = '';
        }
        // ------------------------------------------

        if (ativoExistente.tipo === 'Ação') {
            document.getElementById('ativo-meta-yield-bazin').value = ativoExistente.metaYieldBazin ? formatarDecimal(ativoExistente.metaYieldBazin * 100) : '6,00';
        }
        
        // Dispara o evento 'change' no tipo de ativo para mostrar/esconder os campos corretos
        document.getElementById('ativo-tipo').dispatchEvent(new Event('change'));

    } else {
        // --- Comportamento 2: Ativo é novo, busca por semelhantes ---
        const radical = ticker.substring(0, 4);
        const ativoSemelhante = todosOsAtivos.find(a => a.ticker.startsWith(radical));

        if (ativoSemelhante) {
            // Preenche apenas os campos de nome e CNPJ
            document.getElementById('ativo-nome-pregao').value = ativoSemelhante.nomePregao || '';
            document.getElementById('ativo-nome').value = ativoSemelhante.nome || '';
            document.getElementById('ativo-cnpj').value = formatarCNPJ(ativoSemelhante.cnpj);
        }
    }
}
function abrirModalCadastroAtivo(ativoParaEditar = null, tickerPreenchido = '') {
    const form = document.getElementById('form-cadastro-ativo');
    form.reset();
    document.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
    const tituloModal = document.getElementById('modal-ativo-titulo');
    const tipoSelect = document.getElementById('ativo-tipo');
    const tickerInput = document.getElementById('ativo-ticker');

    // Remove qualquer listener antigo para evitar duplicação
    const novoTickerInput = tickerInput.cloneNode(true);
    tickerInput.parentNode.replaceChild(novoTickerInput, tickerInput);
    
    // Adiciona o novo listener que chamará nossa função de verificação
    novoTickerInput.addEventListener('blur', verificarTickerExistente);

    if (ativoParaEditar) {
        tituloModal.textContent = 'Editar Ativo';
        document.getElementById('ativo-id').value = ativoParaEditar.id;
        novoTickerInput.value = ativoParaEditar.ticker;
        tipoSelect.value = ativoParaEditar.tipo;
        document.getElementById('ativo-nome-pregao').value = ativoParaEditar.nomePregao || '';
        document.getElementById('ativo-nome').value = ativoParaEditar.nome;
        document.getElementById('ativo-cnpj').value = formatarCNPJ(ativoParaEditar.cnpj);
        document.getElementById('ativo-tipo-acao').value = ativoParaEditar.tipoAcao || '';
        document.getElementById('ativo-admin-nome').value = ativoParaEditar.adminNome || '';
        document.getElementById('ativo-admin-cnpj').value = formatarCNPJ(ativoParaEditar.adminCnpj);
        
        // --- INÍCIO DA ALTERAÇÃO (Carregar dado existente) ---
        if (ativoParaEditar.tipo === 'FII') {
            document.getElementById('ativo-subtipo-fii').value = ativoParaEditar.subtipoFii || '';
        } else {
             document.getElementById('ativo-subtipo-fii').value = '';
        }
        // --- FIM DA ALTERAÇÃO ---

        if (ativoParaEditar.tipo === 'Ação') {
            document.getElementById('ativo-meta-yield-bazin').value = ativoParaEditar.metaYieldBazin ? formatarDecimal(ativoParaEditar.metaYieldBazin * 100) : '6,00';
        }
    } else {
        tituloModal.textContent = 'Cadastrar Novo Ativo';
        document.getElementById('ativo-id').value = '';
        novoTickerInput.value = tickerPreenchido.toUpperCase();
        tipoSelect.value = '';
        // Garante que o select comece vazio num cadastro novo
        document.getElementById('ativo-subtipo-fii').value = ''; 
    }

    tipoSelect.dispatchEvent(new Event('change'));
    abrirModal('modal-cadastro-ativo');
    (tickerPreenchido ? document.getElementById('ativo-nome-pregao') : novoTickerInput).focus();
}

function deletarAtivo(ativoId) { if (confirm('Tem certeza que deseja excluir este ativo? Esta ação não pode ser desfeita e pode afetar outros registros que o utilizam.')) { todosOsAtivos = todosOsAtivos.filter(a => a.id !== ativoId); salvarAtivos(); renderizarTabelaAtivos(); } }
function buscarEcadastrarAtivosAusentes(silencioso = false) {
    const tickersCadastrados = new Set(todosOsAtivos.map(a => a.ticker));
    const todosOsTickersUsados = new Set();
    todasAsNotas.forEach(n => n.operacoes.forEach(op => todosOsTickersUsados.add(op.ativo)));
    posicaoInicial.forEach(p => todosOsTickersUsados.add(p.ticker));
    todosOsProventos.forEach(p => todosOsTickersUsados.add(p.ticker));
    todosOsAjustes.forEach(a => {
        if (a.tipoAjuste === 'transferencia') {
            a.ativosTransferidos.forEach(at => todosOsTickersUsados.add(at.ticker));
        } else if (a.ticker) {
            todosOsTickersUsados.add(a.ticker);
        }
    });

    const novosAtivos = [];
    todosOsTickersUsados.forEach(ticker => {
        if (ticker && !tickersCadastrados.has(ticker)) {
            const novoAtivoMinimo = {
                id: Date.now() + Math.random(),
                ticker: ticker,
                tipo: '', 
                nome: '', 
                nomePregao: '', 
                tipoAcao: '', 
                cnpj: '', 
                adminNome: '', 
                adminCnpj: '',
                statusAporte: 'Ativo' // NOVO CAMPO ADICIONADO
            };
            novosAtivos.push(novoAtivoMinimo);
        }
    });

    if (novosAtivos.length > 0) {
        todosOsAtivos.push(...novosAtivos);
        salvarAtivos();
        if (!silencioso) {
            renderizarTabelaAtivos();
            alert(`${novosAtivos.length} novo(s) ativo(s) foram encontrados e cadastrados com sucesso! Complete o cadastro deles se necessário.`);
        }
    } else {
        if (!silencioso) {
            alert('Nenhum novo ativo encontrado. Todos os ativos utilizados já estão cadastrados.');
        }
    }
}
function getCorretorasComPosicaoNaData(data) {
    const nomesCorretoras = new Set();
    const posicoesRV = gerarPosicaoDetalhada(data);

    Object.values(posicoesRV).forEach(posicao => {
        for (const corretora in posicao.porCorretora) {
            if (posicao.porCorretora[corretora] > 0.000001) {
                nomesCorretoras.add(corretora.trim());
            }
        }
    });

    return [...nomesCorretoras].sort();
}
function popularFiltrosCorretora() {
    const corretoras = getTodasCorretoras();
    const corretorasHtml = corretoras.map(c => `<option value="${c}">${c}</option>`).join('');
    document.querySelectorAll('.broker-filter').forEach(select => {
        select.innerHTML = '<option value="consolidado">Consolidado</option>' + corretorasHtml;
    });
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
function deletarTransferencia(transferenciaId) {
    const transferenciaIndex = todosOsAjustes.findIndex(a => a.id === transferenciaId);
    if (transferenciaIndex === -1) return;

    const transferencia = todosOsAjustes[transferenciaIndex];

    if (confirm('Tem certeza que deseja excluir este registro de transferência? As alterações nos proventos também serão revertidas.')) {
        let proventosModificados = false;
        if (transferencia.proventosTransferidos && transferencia.proventosTransferidos.length > 0) {
            transferencia.proventosTransferidos.forEach(provId => {
                const provento = todosOsProventos.find(p => p.id === provId);
                if (provento && provento.posicaoPorCorretora[transferencia.corretoraDestino]) {
                    // Reverte a transferência do provento
                    provento.posicaoPorCorretora[transferencia.corretoraOrigem] = provento.posicaoPorCorretora[transferencia.corretoraDestino];
                    delete provento.posicaoPorCorretora[transferencia.corretoraDestino];
                    delete provento.pagamentoRedirecionadoManualmente; // Remove a flag
                    proventosModificados = true;
                }
            });
        }

        todosOsAjustes.splice(transferenciaIndex, 1);
        
        const promises = [salvarAjustes()];
        if (proventosModificados) {
            promises.push(salvarProventos());
        }

        Promise.all(promises).then(() => {
            renderizarTabelaTransferencias();
            alert('Transferência excluída e proventos revertidos com sucesso!');
        });
    }
}
function popularAtivosParaTransferencia(corretoraOrigem, dataTransferencia, transferenciaParaEditar = null) {
    const containerAtivos = document.getElementById('transferencia-ativos-disponiveis');
    const containerProventos = document.getElementById('transferencia-proventos-disponiveis');
    document.getElementById('transferencia-ativos-container').style.display = 'block';

    if (!corretoraOrigem || !dataTransferencia) {
        containerAtivos.innerHTML = '<p>Selecione uma corretora de origem e uma data.</p>';
        containerProventos.innerHTML = '';
        return;
    }

    const posicoes = gerarPosicaoDetalhada(dataTransferencia);
    let ativosDisponiveis = [];

    if (transferenciaParaEditar && transferenciaParaEditar.ativosTransferidos) {
        // MODO EDIÇÃO: Carrega APENAS os ativos que fazem parte desta transferência específica
        transferenciaParaEditar.ativosTransferidos.forEach(ativoT => {
            // Calcula o saldo restante na origem para compor o limite máximo de edição
            const saldoNaOrigem = (posicoes[ativoT.ticker] && posicoes[ativoT.ticker].porCorretora[corretoraOrigem]) 
                                  ? posicoes[ativoT.ticker].porCorretora[corretoraOrigem] 
                                  : 0;
            ativosDisponiveis.push({ 
                ticker: ativoT.ticker, 
                // A quantidade máxima permitida é o que já foi transferido + o que sobrou na corretora de origem
                quantidade: ativoT.quantidade + saldoNaOrigem 
            });
        });
    } else {
        // MODO CRIAÇÃO: Carrega todos os ativos disponíveis na corretora de origem
        ativosDisponiveis = Object.entries(posicoes)
            .filter(([ticker, dados]) => (dados.porCorretora[corretoraOrigem] || 0) > 0.000001)
            .map(([ticker, dados]) => ({ ticker, quantidade: dados.porCorretora[corretoraOrigem] }));
    }

    ativosDisponiveis.sort((a,b) => a.ticker.localeCompare(b.ticker));

    if (ativosDisponiveis.length === 0) {
        containerAtivos.innerHTML = `<p>Nenhum ativo encontrado na corretora ${corretoraOrigem} na data selecionada.</p>`;
    } else {
        containerAtivos.innerHTML = ativosDisponiveis.map(ativo => `
            <div class="ativo-item">
                <input type="checkbox" id="transfer-ativo-${ativo.ticker}" name="transfer-ativo" value="${ativo.ticker}">
                <label for="transfer-ativo-${ativo.ticker}">${ativo.ticker} (Disponível: ${Math.round(ativo.quantidade)})</label>
                <input type="number" class="transfer-quantidade" placeholder="Qtd" min="1" max="${Math.round(ativo.quantidade)}" style="width: 100px;">
            </div>
        `).join('');
    }

    // LÓGICA DOS PROVENTOS
    const proventosJaTransferidosIds = new Set(transferenciaParaEditar?.proventosTransferidos || []);
    let proventosDisponiveis = getProventosTransferiveis(corretoraOrigem, dataTransferencia);

    if (transferenciaParaEditar) {
        // MODO EDIÇÃO: Filtra os proventos pendentes para mostrar APENAS os vinculados aos ativos desta transferência
        const tickersNaTransferencia = ativosDisponiveis.map(a => a.ticker);
        proventosDisponiveis = proventosDisponiveis.filter(p => tickersNaTransferencia.includes(p.ticker));

        proventosJaTransferidosIds.forEach(id => {
            if (!proventosDisponiveis.some(p => p.id === id)) {
                const proventoAntigo = todosOsProventos.find(p => p.id === id);
                if (proventoAntigo) proventosDisponiveis.push(proventoAntigo);
            }
        });
    }

    proventosDisponiveis.sort((a,b) => a.ticker.localeCompare(b.ticker));

    if (proventosDisponiveis.length === 0) {
        containerProventos.innerHTML = `<p>Nenhum provento pendente encontrado para transferência nesta data.</p>`;
    } else {
        containerProventos.innerHTML = proventosDisponiveis.map(provento => {
            const isAlreadyTransferred = proventosJaTransferidosIds.has(provento.id);
            const valorNaCorretora = (provento.posicaoPorCorretora[corretoraOrigem] || provento.posicaoPorCorretora[transferenciaParaEditar?.corretoraDestino] || {valorRecebido: 0}).valorRecebido;
            const dataPagFmt = new Date(provento.dataPagamento + 'T12:00:00').toLocaleDateString('pt-BR');
            
            const checkboxHtml = `<input type="checkbox" id="transfer-provento-${provento.id}" name="transfer-provento" value="${provento.id}" ${isAlreadyTransferred ? 'checked disabled' : ''}>`;
            const labelHtml = `<label for="transfer-provento-${provento.id}">${provento.ticker} - ${provento.tipo} de ${formatarMoeda(valorNaCorretora)} (Paga em ${dataPagFmt})</label>`;
            const infoHtml = isAlreadyTransferred ? `<span class="transferencia-item-info">(Já transferido ✔️)</span>` : '';
            const revertBtnHtml = isAlreadyTransferred ? `<i class="fas fa-undo reverter-btn" title="Reverter transferência deste provento" data-provento-id="${provento.id}"></i>` : '';

            return `<div class="transferencia-item">${checkboxHtml}${labelHtml}${infoHtml}${revertBtnHtml}</div>`;
        }).join('');
    }

    if (transferenciaParaEditar) {
        setTimeout(() => {
            if (transferenciaParaEditar.ativosTransferidos) {
                transferenciaParaEditar.ativosTransferidos.forEach(ativoT => {
                    const checkbox = document.querySelector(`#transferencia-ativos-disponiveis input[value="${ativoT.ticker}"]`);
                    if (checkbox) {
                        checkbox.checked = true;
                        checkbox.parentElement.querySelector('.transfer-quantidade').value = ativoT.quantidade;
                    }
                });
            }
            if (transferenciaParaEditar.proventosTransferidos) {
                transferenciaParaEditar.proventosTransferidos.forEach(provId => {
                    const checkbox = document.querySelector(`#transferencia-proventos-disponiveis input[value="${provId}"]`);
                    if (checkbox) checkbox.checked = true;
                });
            }
        }, 50);
    }
}
function deletarEventoCorporativo(ajusteId) {
    if (confirm('Tem certeza que deseja excluir este evento? Esta ação recalculará a posição do ativo a partir da data do evento.')) {
        todosOsAjustes = todosOsAjustes.filter(a => a.id !== ajusteId);
        salvarAjustes();
        renderizarTabelaEventosCorporativos();
    }
}

function salvarEventoAtivo(event) {
    event.preventDefault(); // Impede o recarregamento da página

    const id = document.getElementById('evento-ativo-id').value;
    const tipoEvento = document.getElementById('evento-ativo-tipo').value;
    const data = document.getElementById('evento-ativo-data').value;
    const ticker = document.getElementById('evento-ativo-ticker').value.toUpperCase();

    if (!tipoEvento || !data || !ticker) {
        alert('Por favor, preencha todos os campos: Tipo de Evento, Data e Ativo.');
        return;
    }

    const novoEvento = {
        id: id ? parseFloat(id) : Date.now(),
        tipoAjuste: 'evento_ativo', // Identificador para o motor de cálculo
        tipoEvento: tipoEvento,
        data: data,
        ticker: ticker,
        detalhes: []
    };

    if (tipoEvento === 'entrada') {
        novoEvento.precoMedio = parseDecimal(document.getElementById('evento-ativo-pm').value);
        
        document.querySelectorAll('#evento-entrada-corretoras-container .evento-entrada-qtd').forEach(input => {
            const quantidade = parseInt(input.value, 10);
            if (quantidade > 0) {
                novoEvento.detalhes.push({
                    corretora: input.dataset.corretora,
                    quantidade: quantidade
                });
            }
        });

    } else if (tipoEvento === 'saida') {
        document.querySelectorAll('#evento-saida-posicao-container .qtd-saida-input').forEach(input => {
            const quantidade = parseInt(input.value, 10);
            if (quantidade > 0) {
                novoEvento.detalhes.push({
                    corretora: input.dataset.corretora,
                    quantidade: quantidade
                });
            }
        });
    }

    if (novoEvento.detalhes.length === 0) {
        alert('Você precisa informar a quantidade em pelo menos uma corretora.');
        return;
    }

    // Lógica para salvar (criar ou editar)
    const index = todosOsAjustes.findIndex(a => a.id === novoEvento.id);
    if (index > -1) {
        todosOsAjustes[index] = novoEvento; // Atualiza se estiver editando
    } else {
        todosOsAjustes.push(novoEvento); // Adiciona se for novo
    }

    salvarAjustes(); // Salva os dados no localStorage
    renderizarTelaEventosAtivos(); // Atualiza a tabela na tela
    modalEventoAtivo.style.display = 'none'; // Fecha o modal
    alert('Evento de ativo salvo com sucesso!');
}


async function deletarNota(notaId) {
    if (confirm('Tem certeza que deseja excluir esta nota de negociação e todas as suas operações? A movimentação financeira correspondente no extrato da conta também será removida.')) {
        const notaParaExcluir = todasAsNotas.find(n => n.id === notaId);
        if (!notaParaExcluir) return;

        // Acha a movimentação vinculada à nota ANTES de apagar os dados locais
        const movimentacaoVinculada = todasAsMovimentacoes.find(t => t.source === 'nota' && t.sourceId === notaId);

        // Se houver um lançamento remoto, tenta apagá-lo primeiro
        if (currentUser && idCasaAssociada && movimentacaoVinculada && movimentacaoVinculada.idLancamentoCasa) {
            try {
                const { doc, deleteDoc } = window.dbFunctions;
                const docRef = doc(window.db, "Casas", idCasaAssociada, "Lancamentos", movimentacaoVinculada.idLancamentoCasa);
                await deleteDoc(docRef);
                console.log("Lançamento de nota correspondente excluído do Sistema de Finanças.");
            } catch (error) {
                console.error("Erro ao excluir lançamento da nota do Sistema de Finanças:", error);
                alert("Não foi possível excluir o lançamento correspondente no sistema de finanças. A exclusão local foi cancelada.");
                return;
            }
        }

        // Filtra a lista de notas para remover a nota selecionada
        todasAsNotas = todasAsNotas.filter(n => n.id !== notaId);
        
        // Filtra as movimentações para remover a transação gerada por esta nota
        todasAsMovimentacoes = todasAsMovimentacoes.filter(t => t.source !== 'nota' || t.sourceId !== notaId);

        // Salva ambos os arrays atualizados
        salvarDadosNaFonte({
            notas: todasAsNotas,
            movimentacoes: todasAsMovimentacoes
        }).then(() => {
            renderizarListaNotas();
            alert('Nota de negociação e seu lançamento financeiro foram excluídos com sucesso.');
        });
    }
}
function deletarPosicao(posicaoId) {
    if (confirm('Tem certeza que deseja excluir este registro de posição inicial?')) {
        posicaoInicial = posicaoInicial.filter(p => p.id !== posicaoId);
        salvarPosicaoInicial();
        renderizarTabelaPosicaoInicial();
    }
}
function carregarNotaParaEdicao(notaId) {
    const notaParaEditar = todasAsNotas.find(n => n.id === notaId);
    if (!notaParaEditar) return;
    notaAtual = JSON.parse(JSON.stringify(notaParaEditar));

    const selectCorretora = document.getElementById('nota-corretora');
    const corretorasAtivas = getCorretorasAtivasParaNotas();
    const corretoraDaNota = notaAtual.corretora;
    let optionsHtml = '';
    const corretoraEstaAtiva = corretorasAtivas.includes(corretoraDaNota);
    optionsHtml = corretorasAtivas.map(c => `<option value="${c}">${c}</option>`).join('');
    if (!corretoraEstaAtiva) {
        optionsHtml = `<option value="${corretoraDaNota}">${corretoraDaNota} (Inativa)</option>` + optionsHtml;
    }

    selectCorretora.innerHTML = optionsHtml;
    selectCorretora.value = corretoraDaNota; // Define o valor selecionado (seja ativo ou inativo).
    selectCorretora.disabled = false; // Garante que o dropdown esteja habilitado para edição.
    document.getElementById('nota-numero').value = notaAtual.numero;
    document.getElementById('nota-data').value = notaAtual.data;
    document.getElementById('nota-custos').value = formatarDecimalParaInput(notaAtual.custos);
    document.getElementById('nota-irrf').value = formatarDecimalParaInput(notaAtual.irrf);

    const tituloTela = document.querySelector('#tela-lancamento-nota h1');
    if (tituloTela) {
        tituloTela.textContent = 'Editar Nota de Negociação';
    }
    inicializarIconesCalculadora();
    renderizarTabelaOperacoes();
    atualizarTotais();
    mostrarTela('lancamentoNota');
}
function atualizarTotais() { if (!notaAtual) return; notaAtual.custos = parseDecimal(document.getElementById('nota-custos').value) || 0; notaAtual.irrf = parseDecimal(document.getElementById('nota-irrf').value) || 0; const totalCompras = notaAtual.operacoes.filter(op => op.tipo === 'compra').reduce((acc, op) => acc + op.valor, 0); const totalVendas = notaAtual.operacoes.filter(op => op.tipo === 'venda').reduce((acc, op) => acc + op.valor, 0); const totalCustos = notaAtual.custos + notaAtual.irrf; const valorLiquido = totalVendas - totalCompras - totalCustos; document.getElementById('subtotal-compras').textContent = formatarMoeda(totalCompras); document.getElementById('subtotal-vendas').textContent = formatarMoeda(totalVendas); document.getElementById('subtotal-custos').textContent = formatarMoeda(totalCustos); document.getElementById('subtotal-liquido').textContent = formatarValorComCeD(valorLiquido); const dataNota = document.getElementById('nota-data').value; if(dataNota) { const dataLiquidacao = calcularDataLiquidacao(dataNota, 2); document.getElementById('subtotal-liquidacao').textContent = dataLiquidacao.toLocaleDateString('pt-BR'); } else { document.getElementById('subtotal-liquidacao').textContent = '--/--/----'; } }
function iniciarNovaNota() {
    notaAtual = { id: null, corretora: 'XP', data: '', numero: '', custos: null, irrf: null, operacoes: [] };
    const formNotaGeral = document.getElementById('form-nota-geral');
    formNotaGeral.reset();
    
    // Garante que os campos de custos e IRRF fiquem vazios para mostrar o placeholder
    document.getElementById('nota-custos').value = '';
    document.getElementById('nota-irrf').value = '';

    const selectCorretora = document.getElementById('nota-corretora');
    const corretorasAtivas = getCorretorasAtivasParaNotas();
    // --- ALTERAÇÃO AQUI: Adiciona a opção "Selecione..." ---
    selectCorretora.innerHTML = '<option value="">Selecione...</option>' + corretorasAtivas.map(c => `<option value="${c}">${c}</option>`).join('');
    selectCorretora.value = ""; // Garante que "Selecione..." seja a opção padrão
    // --- FIM DA ALTERAÇÃO ---
    selectCorretora.disabled = false; // Garante que o dropdown esteja habilitado.
    const tituloTela = document.querySelector('#tela-lancamento-nota h1');
    if (tituloTela) {
        tituloTela.textContent = 'Lançamento de Nota de Negociação';
    }
    inicializarIconesCalculadora();
    renderizarTabelaOperacoes();
    atualizarTotais();
    mostrarTela('lancamentoNota');
}
function adicionarOperacao(event) { event.preventDefault(); if (!notaAtual) return; const tickerInput = document.getElementById('op-ativo'); const ticker = tickerInput.value.toUpperCase(); if(!ticker) return; const ativoExiste = todosOsAtivos.some(a => a.ticker === ticker); if (!ativoExiste) { alert(`O ativo "${ticker}" não está cadastrado. Por favor, cadastre-o primeiro.`); abrirModalCadastroAtivo(null, ticker); return; } const op = { id: Date.now(), ativo: ticker, tipo: document.getElementById('op-tipo').value, quantidade: parseInt(document.getElementById('op-quantidade').value), valor: parseDecimal(document.getElementById('op-valor').value), }; if(isNaN(op.quantidade) || isNaN(op.valor) || op.quantidade <= 0) { alert('Quantidade e Valor devem ser números positivos.'); return; } notaAtual.operacoes.push(op); renderizarTabelaOperacoes(); atualizarTotais(); document.getElementById('form-add-operacao').reset(); tickerInput.focus(); }
function deletarOperacao(opId) { if(!notaAtual) return; notaAtual.operacoes = notaAtual.operacoes.filter(op => op.id !== opId); renderizarTabelaOperacoes(); atualizarTotais(); }
function iniciarEdicaoOperacao(opId) {
    const op = notaAtual.operacoes.find(o => o.id === opId);
    if (!op) return;
    modalEdicaoOperacao.style.display = 'block';
    document.getElementById('edit-op-id').value = op.id;
    document.getElementById('edit-op-ativo').value = op.ativo;
    document.getElementById('edit-op-tipo').value = op.tipo;
    document.getElementById('edit-op-quantidade').value = op.quantidade;
    document.getElementById('edit-op-valor').value = formatarDecimalParaInput(op.valor);
}
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
                enviarParaFinancas: true, // Define como true por padrão
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



function deletarEventoAtivo(ajusteId) {
    if (confirm('Tem certeza que deseja excluir este evento? Esta ação recalculará a posição do ativo.')) {
        todosOsAjustes = todosOsAjustes.filter(a => a.id !== ajusteId);
        salvarAjustes();
        renderizarTelaEventosAtivos();
    }
}
function gerarPosicaoDetalhada(dataLimite = null) {
    const posicoes = {};
    let eventos = [];

    // Adiciona todos os eventos que podem alterar a posiÃ§Ã£o
    posicaoInicial.forEach(p => eventos.push({ data: p.data, tipo: p.tipoRegistro, payload: p }));
    todasAsNotas.forEach(n => n.operacoes.forEach(op => eventos.push({ data: n.data, tipo: 'OPERACAO_NOTA', payload: {...op, custosNota: n.custos, irrfNota: n.irrf, corretora: n.corretora, totalOperacoesNota: n.operacoes.reduce((soma, op) => soma + op.valor, 0)} })));
    todosOsAjustes.forEach(a => eventos.push({ data: a.data, tipo: a.tipoAjuste, payload: a }));

    eventos.sort((a,b) => new Date(a.data) - new Date(b.data));

    eventos.filter(e => !dataLimite || new Date(e.data) <= new Date(dataLimite + 'T23:59:59')).forEach(evento => {
        const payload = evento.payload;
        const processaTicker = (ticker) => {
            if (!posicoes[ticker]) {
                posicoes[ticker] = { quantidade: 0, precoMedio: 0, porCorretora: {} };
            }
            return posicoes[ticker];
        };

        switch(evento.tipo) {
            case 'SUMARIO_MANUAL': {
                let pos = processaTicker(payload.ticker);
                let qtdTotalSumario = 0;
                payload.posicoesPorCorretora.forEach(pc => {
                    pos.porCorretora[pc.corretora] = (pos.porCorretora[pc.corretora] || 0) + pc.quantidade;
                    qtdTotalSumario += pc.quantidade;
                });
                pos.quantidade += qtdTotalSumario; 
                pos.precoMedio = payload.precoMedio; 
                break;
            }
            case 'TRANSACAO_HISTORICA': {
                let pos = processaTicker(payload.ticker);
                const corretora = payload.corretora;
                const quantidade = payload.quantidade;
                if (payload.transacao.toLowerCase() === 'compra') {
                    pos.quantidade += quantidade;
                    pos.porCorretora[corretora] = (pos.porCorretora[corretora] || 0) + quantidade;
                } else {
                    pos.quantidade -= quantidade;
                    pos.porCorretora[corretora] = (pos.porCorretora[corretora] || 0) - quantidade;
                }
                pos.precoMedio = payload.precoMedio;
                break;
            }
            case 'OPERACAO_NOTA': {
                let pos = processaTicker(payload.ativo);
                const corretora = payload.corretora;
                const qtdAnterior = pos.quantidade;
                const pmAnterior = pos.precoMedio;
                const qtdOperacao = payload.quantidade;

                if (payload.tipo.toLowerCase() === 'compra') {
                    const valorOperacao = payload.valor;
                    const custoRateado = payload.totalOperacoesNota > 0 ? (valorOperacao / payload.totalOperacoesNota) * (payload.custosNota + payload.irrfNota) : 0;
                    const precoCompraComCustos = qtdOperacao > 0 ? (valorOperacao + custoRateado) / qtdOperacao : 0;
                    const novoTotalFinanceiro = (qtdAnterior * pmAnterior) + (qtdOperacao * precoCompraComCustos);
                    pos.quantidade += qtdOperacao;
                    pos.precoMedio = pos.quantidade > 0 ? novoTotalFinanceiro / pos.quantidade : 0;
                    pos.porCorretora[corretora] = (pos.porCorretora[corretora] || 0) + qtdOperacao;
                } else { // Venda
                    pos.quantidade -= qtdOperacao;
                    pos.porCorretora[corretora] = (pos.porCorretora[corretora] || 0) - qtdOperacao;
                }
                if (pos.quantidade < 0.000001) pos.precoMedio = 0;
                break;
            }
            case 'transferencia': {
                payload.ativosTransferidos.forEach(ativoT => {
                    let pos = processaTicker(ativoT.ticker);
                    pos.porCorretora[payload.corretoraOrigem] = (pos.porCorretora[payload.corretoraOrigem] || 0) - ativoT.quantidade;
                    pos.porCorretora[payload.corretoraDestino] = (pos.porCorretora[payload.corretoraDestino] || 0) + ativoT.quantidade;
                });
                break;
            }
            case 'ajuste_pm': {
                let pos = processaTicker(payload.ticker);
                pos.precoMedio = payload.novoPrecoMedio;
                break;
            }
            case 'split_grupamento': {
                let pos = processaTicker(payload.ticker);
                if (pos.quantidade > 0) {
                    const de = payload.proporcaoDe;
                    const para = payload.proporcaoPara;
                    pos.quantidade = (pos.quantidade / de) * para;
                    pos.precoMedio = (pos.precoMedio / para) * de;
                    
                    // CORREÇÃO: Aplica a mesma proporção para o saldo de cada corretora!
                    for (const corretora in pos.porCorretora) {
                        pos.porCorretora[corretora] = (pos.porCorretora[corretora] / de) * para;
                    }
                }
                break;
            }
            case 'evento_ativo': {
                let pos = processaTicker(payload.ticker);
                if (payload.tipoEvento === 'entrada') {
                    const qtdAnterior = pos.quantidade;
                    const pmAnterior = pos.precoMedio;
                    
                    let qtdEntradaTotal = 0;
                    payload.detalhes.forEach(detalhe => {
                        pos.porCorretora[detalhe.corretora] = (pos.porCorretora[detalhe.corretora] || 0) + detalhe.quantidade;
                        qtdEntradaTotal += detalhe.quantidade;
                    });
                    
                    const pmEntrada = payload.precoMedio;
                    const novoTotalFinanceiro = (qtdAnterior * pmAnterior) + (qtdEntradaTotal * pmEntrada);
                    
                    pos.quantidade += qtdEntradaTotal;
                    pos.precoMedio = pos.quantidade > 0 ? novoTotalFinanceiro / pos.quantidade : 0;

                } else if (payload.tipoEvento === 'saida') {
                    payload.detalhes.forEach(detalhe => {
                        pos.porCorretora[detalhe.corretora] = (pos.porCorretora[detalhe.corretora] || 0) - detalhe.quantidade;
                        pos.quantidade -= detalhe.quantidade;
                    });
                }
                if (pos.quantidade < 0.000001) pos.precoMedio = 0;
                break;
            }
        }
    });
    return posicoes;
}
function getInicioInvestimento(tickers, dataLimite = null) {
    const tickerSet = new Set(tickers);
    let dataMaisAntiga = null;
    const hoje = new Date().toISOString().split('T')[0];
    const dataFinal = dataLimite || hoje;

    const atualizarData = (novaData) => {
        if (novaData > dataFinal) return;
        if (!dataMaisAntiga || new Date(novaData) < new Date(dataMaisAntiga)) {
            dataMaisAntiga = novaData;
        }
    };

    todasAsNotas.forEach(n => {
        n.operacoes.forEach(op => {
            if (op.tipo === 'compra' && tickerSet.has(op.ativo)) {
                atualizarData(n.data);
            }
        });
    });

    posicaoInicial.forEach(p => {
        if (p.tipoRegistro === 'TRANSACAO_HISTORICA' && p.transacao.toLowerCase() === 'compra' && tickerSet.has(p.ticker)) {
             atualizarData(p.data);
        } else if (p.tipoRegistro === 'SUMARIO_MANUAL' && tickerSet.has(p.ticker)) {
            atualizarData(p.data);
        }
    });
    
    return dataMaisAntiga;
}
function getFimInvestimento(tickers) {
    const tickerSet = new Set(tickers);
    const hojeStr = new Date().toISOString().split('T')[0];
    const posicoesAtuais = gerarPosicaoDetalhada();
    
    // Se qualquer um dos tickers ainda está em carteira, a data final é hoje.
    for (const ticker of tickers) {
        if (posicoesAtuais[ticker] && posicoesAtuais[ticker].quantidade > 0.000001) {
            return hojeStr;
        }
    }

    // Se todos foram zerados, encontra a data de encerramento mais recente entre eles.
    const relatorioZeradas = gerarRelatorioPosicoesZeradas();
    let dataMaisRecente = null;

    relatorioZeradas.forEach(r => {
        if (tickerSet.has(r.ticker)) {
            if (!dataMaisRecente || new Date(r.dataEncerramento) > new Date(dataMaisRecente)) {
                dataMaisRecente = r.dataEncerramento;
            }
        }
    });

    return dataMaisRecente || hojeStr; // Se não encontrar, retorna hoje por segurança.
}
function getInicioIninterrupto(ticker) {
    // Garante que o cache existe. Se não existir, cria (uma única vez).
    if (!cacheInicioIninterrupto) {
        gerarCacheInicioIninterrupto();
    }
    
    // Retorna o valor do mapa instantaneamente
    return cacheInicioIninterrupto[ticker] || null;
}
function renderizarTelaRendaVariavel() {
    mostrarTela('rendaVariavel');
    const container = document.getElementById('posicao-rv-container');
    const summaryContainer = document.getElementById('summary-rv');
    
    const filtroCorretoraSelect = document.getElementById('rv-filtro-corretora');
    const filtroDataInput = document.getElementById('rv-filtro-data');

    if (!filtroDataInput.value) {
        filtroDataInput.value = new Date().toISOString().split('T')[0];
    }
    const filtroData = filtroDataInput.value;

    // --- Lógica de Filtros ---
    const corretoraSelecionadaAnteriormente = filtroCorretoraSelect.value;
    const corretorasDaData = getCorretorasComPosicaoNaData(filtroData);
    
    // Atualiza apenas as opções do Select, sem destruir o elemento Select em si
    let optionsHtml = '<option value="consolidado">Consolidado</option>';
    optionsHtml += corretorasDaData.map(c => `<option value="${c}">${c}</option>`).join('');
    filtroCorretoraSelect.innerHTML = optionsHtml;

    const novaListaDeOpcoes = Array.from(filtroCorretoraSelect.options).map(opt => opt.value);
    if (novaListaDeOpcoes.includes(corretoraSelecionadaAnteriormente)) {
        filtroCorretoraSelect.value = corretoraSelecionadaAnteriormente;
    }
    const filtroCorretora = filtroCorretoraSelect.value;
    
    // --- Geração de Dados ---
    const posicoesDetalhadas = gerarPosicaoDetalhada(filtroData);
    const valorTotalCarteira = calcularValorTotalCarteira(filtroData);
    
    let htmlGerado = '';
    let custoTotalRV = 0;
    let valorMercadoRV = 0;

    ['Ação', 'FII', 'ETF'].forEach(tipo => {
        const dadosTabela = gerarHtmlTabelaAtivos(tipo, posicoesDetalhadas, filtroCorretora, valorTotalCarteira);
        if (dadosTabela.html) {
            htmlGerado += dadosTabela.html;
            custoTotalRV += dadosTabela.custoTotal;
            valorMercadoRV += dadosTabela.valorMercado;
        }
    });

    // --- Renderização do Conteúdo ---
    if (htmlGerado === '') {
        container.innerHTML = `
            <div class="dash-card">
                <div class="dash-body" style="text-align: center; padding: 40px; color: #666;">
                    <i class="fas fa-search" style="font-size: 2rem; margin-bottom: 15px; display: block;"></i>
                    Nenhuma posição encontrada para os filtros selecionados.
                </div>
            </div>`;
        summaryContainer.innerHTML = '';
    } else {
        container.innerHTML = htmlGerado;
        
        // Cards de Resumo
        const desempenhoValor = valorMercadoRV - custoTotalRV;
        const desempenhoPercentual = custoTotalRV > 0 ? desempenhoValor / custoTotalRV : 0;
        const isPositivo = desempenhoValor >= 0;
        const corDesempenho = isPositivo ? '#2ecc71' : '#e74c3c';
        const iconeDesempenho = isPositivo ? 'fa-arrow-up' : 'fa-arrow-down';
        const alocacaoRVPercentual = valorTotalCarteira > 0 ? valorMercadoRV / valorTotalCarteira : 0;

        summaryContainer.innerHTML = `
            <div class="dash-summary-card card-invest">
                <div class="dash-card-title">Custo Total</div>
                <div class="dash-card-value">${formatarMoeda(custoTotalRV)}</div>
            </div>
            <div class="dash-summary-card card-patrimonio">
                <div class="dash-card-title">Valor de Mercado</div>
                <div class="dash-card-value">${formatarMoeda(valorMercadoRV)}</div>
            </div>
            <div class="dash-summary-card card-contas">
                <div class="dash-card-title">Alocação Global</div>
                <div class="dash-card-value">${formatarPercentual(alocacaoRVPercentual)}</div>
            </div>
            <div class="dash-summary-card" style="border-bottom: 4px solid ${corDesempenho}">
                <div class="dash-card-title">Desempenho</div>
                <div class="dash-card-value" style="color: ${corDesempenho}">
                    ${formatarMoeda(desempenhoValor)}
                    <div style="font-size: 0.5em; font-weight: normal; margin-top: 5px;">
                        <i class="fas ${iconeDesempenho}"></i> ${formatarPercentual(desempenhoPercentual)}
                    </div>
                </div>
            </div>
        `;
        
        // Reativa apenas classes visuais de ordenação (não listeners)
        container.querySelectorAll('th.sortable').forEach(header => {
            const table = header.closest('table');
            if (table) {
                const tipoAtivo = table.dataset.tipoAtivo;
                const sortConfig = sortConfigRendaVariavel[tipoAtivo];
                if (sortConfig && header.dataset.key === sortConfig.key) {
                    header.classList.add(sortConfig.direction);
                }
            }
        });
    }

    renderizarFiltroAtivoInfo(filtroCorretora, 'filtro-info-rv');
}

function renderizarFiltroAtivoInfo(filtroCorretora, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = ''; // Limpa o container

    const textoElement = document.createElement('span');
    textoElement.className = 'logo-texto'; // Mantemos a classe por enquanto

    if (filtroCorretora === 'consolidado') {
        textoElement.textContent = 'Consolidado';
    } else {
        textoElement.textContent = filtroCorretora;
    }

    container.appendChild(textoElement);
}
const gerenciarPesosScore = (e) => {
    const input = e.target;
    const grupo = input.dataset.grupo; // 'acoes' ou 'fiis'
    
    // Valores Padrão para Reset
    const padrao = {
        acoes: { dy: 45, bazin: 35, payout: 5, datacom: 15 },
        fiis: { dy: 60, pvp: 40 }
    };

    if (grupo === 'acoes') {
        const dy = parseInt(document.getElementById('config-peso-acoes-dy').value) || 0;
        const bazin = parseInt(document.getElementById('config-peso-acoes-bazin').value) || 0;
        const payout = parseInt(document.getElementById('config-peso-acoes-payout').value) || 0;
        const elDataCom = document.getElementById('config-peso-acoes-datacom');

        const somaEditaveis = dy + bazin + payout;

        // REGRA DE OURO: Se estourar 100%, reseta tudo para o padrão
        if (somaEditaveis > 100) {
            document.getElementById('config-peso-acoes-dy').value = padrao.acoes.dy;
            document.getElementById('config-peso-acoes-bazin').value = padrao.acoes.bazin;
            document.getElementById('config-peso-acoes-payout').value = padrao.acoes.payout;
            elDataCom.value = padrao.acoes.datacom;
            
            // Salva o padrão
            configuracoesFiscais.pesosScore.acoes = { ...padrao.acoes };
        } else {
            // Calcula o resto
            const resto = 100 - somaEditaveis;
            elDataCom.value = resto;
            
            // Salva o novo estado
            configuracoesFiscais.pesosScore.acoes = { dy, bazin, payout, datacom: resto };
        }

    } else if (grupo === 'fiis') {
        const dy = parseInt(document.getElementById('config-peso-fiis-dy').value) || 0;
        const elPvp = document.getElementById('config-peso-fiis-pvp');

        if (dy > 100) {
            // Reset
            document.getElementById('config-peso-fiis-dy').value = padrao.fiis.dy;
            elPvp.value = padrao.fiis.pvp;
            configuracoesFiscais.pesosScore.fiis = { ...padrao.fiis };
        } else {
            // Calcula resto
            const resto = 100 - dy;
            elPvp.value = resto;
            configuracoesFiscais.pesosScore.fiis = { dy, pvp: resto };
        }
    }
    
    salvarConfiguracoesFiscais();
};
function gerarRelatorioPosicoesZeradas() {
    const todosOsEventos = [];
    posicaoInicial.forEach(p => todosOsEventos.push({ data: p.data, tipo: p.tipoRegistro, payload: p }));
    todasAsNotas.forEach(n => n.operacoes.forEach(op => todosOsEventos.push({ data: n.data, tipo: 'OPERACAO_NOTA', payload: { ...op, corretora: n.corretora } })));
    // --- INÍCIO DA CORREÇÃO ---
    // Adiciona os ajustes (incluindo eventos de entrada/saída) à lista de eventos a serem processados.
    todosOsAjustes.forEach(a => todosOsEventos.push({ data: a.data, tipo: a.tipoAjuste, payload: a }));
    // --- FIM DA CORREÇÃO ---

    todosOsEventos.sort((a,b) => new Date(a.data) - new Date(b.data));

    const todosOsTickers = [...new Set(todosOsEventos.map(e => e.payload.ticker || e.payload.ativo))].filter(Boolean);
    const relatorio = [];

    todosOsTickers.forEach(ticker => {
        if (!ticker) return;

        const eventosDoAtivo = todosOsEventos.filter(e => (e.payload.ticker || e.payload.ativo) === ticker);
        if (eventosDoAtivo.length === 0) return;

        let quantidade = 0;
        let dataInicioCiclo = null;

        eventosDoAtivo.forEach(evento => {
            const payload = evento.payload;
            let qtdOperacao = 0;
            let tipoOperacao = '';

            switch(evento.tipo) {
                case 'SUMARIO_MANUAL':
                case 'TRANSACAO_HISTORICA':
                    tipoOperacao = payload.transacao ? payload.transacao.toLowerCase() : 'compra';
                    qtdOperacao = payload.quantidade;
                    break;
                case 'OPERACAO_NOTA':
                    tipoOperacao = payload.tipo;
                    qtdOperacao = payload.quantidade;
                    break;
                // --- INÍCIO DA CORREÇÃO ---
                // Adiciona o caso para tratar os eventos de ativo
                case 'evento_ativo':
                    if (payload.tipoEvento === 'saida') {
                        tipoOperacao = 'venda'; // Trata como uma venda para fins de contagem de quantidade
                        qtdOperacao = payload.detalhes.reduce((acc, d) => acc + d.quantidade, 0);
                    } else if (payload.tipoEvento === 'entrada') {
                        tipoOperacao = 'compra';
                        qtdOperacao = payload.detalhes.reduce((acc, d) => acc + d.quantidade, 0);
                    }
                    break;
                // --- FIM DA CORREÇÃO ---
            }

            const qtdAnterior = quantidade;

            if (tipoOperacao === 'compra') {
                quantidade += qtdOperacao;
                // Se a posição anterior era zero, um novo ciclo de investimento começou.
                if (qtdAnterior <= 0.000001 && quantidade > 0.000001) {
                    dataInicioCiclo = evento.data;
                }
            } else if (tipoOperacao === 'venda') {
                quantidade -= qtdOperacao;
                // Se a posição anterior era positiva e agora é zero, o ciclo de investimento encerrou.
                if (qtdAnterior > 0.000001 && quantidade <= 0.000001) {
                    if (dataInicioCiclo) { // Garante que temos um início para este ciclo que está terminando
                        relatorio.push({
                            ticker: ticker,
                            dataInicio: dataInicioCiclo,
                            dataEncerramento: evento.data
                        });
                        dataInicioCiclo = null; // Reseta para o próximo ciclo
                    }
                }
            }
        });
    });

    return relatorio;
}
function gerarHistoricoCompletoParaAtivo(ticker) {
    const historico = [];
    const pos = { quantidade: 0, precoMedio: 0, porCorretora: {} };
    let eventos = [];

    // Coleta todos os eventos relevantes para o ativo
    posicaoInicial.filter(p => p.ticker === ticker).forEach(p => eventos.push({ data: p.data, tipo: p.tipoRegistro, payload: p }));
    todasAsNotas.forEach(n => {
        n.operacoes.filter(op => op.ativo === ticker).forEach(op => {
            eventos.push({ data: n.data, tipo: 'OPERACAO_NOTA', payload: { ...op, custosNota: n.custos, irrfNota: n.irrf, corretora: n.corretora, numeroNota: n.numero, totalOperacoesNota: n.operacoes.reduce((soma, op) => soma + op.valor, 0) } });
        });
    });
    todosOsAjustes.forEach(a => {
        if ((a.tipoAjuste === 'transferencia' && a.ativosTransferidos.some(at => at.ticker === ticker)) || (a.ticker === ticker)) {
             eventos.push({ data: a.data, tipo: a.tipoAjuste, payload: a });
        }
    });

    eventos.sort((a,b) => new Date(a.data) - new Date(b.data));

    eventos.forEach(evento => {
        let descricaoTransacao = '';
        let precoUnitario = null;
        const payload = evento.payload;

        switch(evento.tipo) {
            case 'SUMARIO_MANUAL': {
                let qtdTotalSumario = 0;
                payload.posicoesPorCorretora.forEach(pc => {
                    pos.porCorretora[pc.corretora] = (pos.porCorretora[pc.corretora] || 0) + pc.quantidade;
                    qtdTotalSumario += pc.quantidade;
                });
                pos.quantidade = qtdTotalSumario;
                pos.precoMedio = payload.precoMedio;
                descricaoTransacao = 'Posição Manual Inicial';
                precoUnitario = payload.precoMedio;
                break;
            }
            case 'TRANSACAO_HISTORICA': {
                const corretora = payload.corretora;
                const quantidade = payload.quantidade;
                if (payload.transacao.toLowerCase() === 'compra') {
                    pos.quantidade += quantidade;
                    pos.porCorretora[corretora] = (pos.porCorretora[corretora] || 0) + quantidade;
                    pos.precoMedio = payload.precoMedio;
                    precoUnitario = null;
                } else {
                    pos.quantidade -= quantidade;
                    pos.porCorretora[corretora] = (pos.porCorretora[corretora] || 0) - quantidade;
                    pos.precoMedio = payload.precoMedio;
                    precoUnitario = (payload.valorVenda && quantidade > 0) ? payload.valorVenda / quantidade : 0;
                }
                descricaoTransacao = `Histórico: ${payload.transacao} de ${payload.quantidade}`;
                break;
            }
            case 'OPERACAO_NOTA': {
                const corretora = payload.corretora;
                const qtdAnterior = pos.quantidade;
                const pmAnterior = pos.precoMedio;
                const qtdOperacao = payload.quantidade;
                const custoRateado = payload.totalOperacoesNota > 0 ? (payload.valor / payload.totalOperacoesNota) * (payload.custosNota + payload.irrfNota) : 0;
                
                if (payload.tipo.toLowerCase() === 'compra') {
                    const precoCompraComCustos = qtdOperacao > 0 ? (payload.valor + custoRateado) / qtdOperacao : 0;
                    const novoTotalFinanceiro = (qtdAnterior * pmAnterior) + (qtdOperacao * precoCompraComCustos);
                    pos.quantidade += qtdOperacao;
                    pos.precoMedio = pos.quantidade > 0 ? novoTotalFinanceiro / pos.quantidade : 0;
                    pos.porCorretora[corretora] = (pos.porCorretora[corretora] || 0) + qtdOperacao;
                    precoUnitario = precoCompraComCustos;
                } else {
                    pos.quantidade -= qtdOperacao;
                    pos.porCorretora[corretora] = (pos.porCorretora[corretora] || 0) - qtdOperacao;
                    precoUnitario = qtdOperacao > 0 ? (payload.valor - custoRateado) / qtdOperacao : 0;
                }
                descricaoTransacao = `Nota ${payload.numeroNota}: ${payload.tipo.charAt(0).toUpperCase() + payload.tipo.slice(1)} de ${payload.quantidade}`;
                break;
            }
            case 'evento_ativo': {
                if (payload.tipoEvento === 'entrada') {
                    const qtdAnterior = pos.quantidade;
                    const pmAnterior = pos.precoMedio;
                    let qtdEntradaTotal = 0;
                    payload.detalhes.forEach(detalhe => {
                        pos.porCorretora[detalhe.corretora] = (pos.porCorretora[detalhe.corretora] || 0) + detalhe.quantidade;
                        qtdEntradaTotal += detalhe.quantidade;
                    });
                    const pmEntrada = payload.precoMedio;
                    const novoTotalFinanceiro = (qtdAnterior * pmAnterior) + (qtdEntradaTotal * pmEntrada);
                    pos.quantidade += qtdEntradaTotal;
                    pos.precoMedio = pos.quantidade > 0 ? novoTotalFinanceiro / pos.quantidade : 0;
                    precoUnitario = pmEntrada;
                } else {
                     payload.detalhes.forEach(detalhe => {
                        pos.porCorretora[detalhe.corretora] -= detalhe.quantidade;
                        pos.quantidade -= detalhe.quantidade;
                    });
                    precoUnitario = 0;
                }
                 descricaoTransacao = `Evento: ${payload.tipoEvento} de ${payload.detalhes.reduce((acc, d) => acc + d.quantidade, 0)}`;
                if (pos.quantidade < 0.000001) pos.precoMedio = 0;
                break;
            }
            case 'transferencia': {
                const ativoT = payload.ativosTransferidos.find(at => at.ticker === ticker);
                if (ativoT) {
                    pos.porCorretora[payload.corretoraOrigem] = (pos.porCorretora[payload.corretoraOrigem] || 0) - ativoT.quantidade;
                    pos.porCorretora[payload.corretoraDestino] = (pos.porCorretora[payload.corretoraDestino] || 0) + ativoT.quantidade;
                    // --- INÍCIO DA ALTERAÇÃO ---
                    descricaoTransacao = `Transferência de ${ativoT.quantidade} un. de ${payload.corretoraOrigem} para ${payload.corretoraDestino}`;
                    // --- FIM DA ALTERAÇÃO ---
                } else {
                    descricaoTransacao = `Transferência de ${payload.corretoraOrigem} para ${payload.corretoraDestino}`;
                }
                precoUnitario = null;
                break;
            }
            case 'ajuste_pm':
                pos.precoMedio = payload.novoPrecoMedio;
                descricaoTransacao = `Ajuste manual de Preço Médio`;
                precoUnitario = null;
                break;
            case 'split_grupamento':
                const de = payload.proporcaoDe;
                const para = payload.proporcaoPara;
                pos.quantidade = (pos.quantidade / de) * para;
                pos.precoMedio = (pos.precoMedio / para) * de;
                descricaoTransacao = `Evento: ${payload.tipoEvento} ${de} para ${para}`;
                precoUnitario = null;
                break;
        }
        
        const qtdPorCorretoraStr = Object.entries(pos.porCorretora)
            .filter(([_, qtd]) => qtd > 0.0001)
            .map(([nome, qtd]) => `${nome}: ${Math.round(qtd)}`)
            .join('<br>');

        const valorTotalInvestido = pos.quantidade * pos.precoMedio;

        historico.push({
            data: evento.data,
            descricaoTransacao: descricaoTransacao,
            precoUnitario: precoUnitario,
            qtdPorCorretora: qtdPorCorretoraStr,
            qtdConsolidada: pos.quantidade,
            precoMedio: pos.precoMedio,
            valorTotalInvestido: valorTotalInvestido
        });
    });

    return historico;
}
function renderizarTelaPosicaoPorCorretora() {
    const container = document.getElementById('container-posicao-por-corretora');
    container.innerHTML = '<h4>Calculando posições...</h4>';

    const corretoras = getTodasCorretoras();
    const posicoesRV = gerarPosicaoDetalhada();
    const hojeStr = new Date().toISOString().split('T')[0];

    const proventosProvisionados = todosOsProventos.filter(p =>
        p.dataCom && p.dataPagamento &&
        p.dataCom < hojeStr &&
        p.dataPagamento > hojeStr
    );

    let htmlFinal = '';

    corretoras.forEach(corretora => {
        let valorTotalNaInstituicao = 0;
        
        const dadosInstituicao = {
            contasCorrente: { total: 0, itens: [] },
            contaInvestimento: { total: 0, itens: [] },
            proventosProvisionados: { total: 0, itens: [] },
            acoes: { total: 0, itens: [] },
            fiis: { total: 0, itens: [] },
            etfs: { total: 0, itens: [] },
            rendaFixa: { total: 0, itens: [] }
        };

        todasAsContas.filter(c => c.banco === corretora && !c.notas?.toLowerCase().includes('inativa')).forEach(conta => {
            const saldoAtual = calcularSaldoEmData(conta, hojeStr);
            valorTotalNaInstituicao += saldoAtual;
            if (conta.tipo === 'Conta Corrente') {
                dadosInstituicao.contasCorrente.total += saldoAtual;
                dadosInstituicao.contasCorrente.itens.push({ ...conta, saldo: saldoAtual });
            } else {
                dadosInstituicao.contaInvestimento.total += saldoAtual;
                dadosInstituicao.contaInvestimento.itens.push({ ...conta, saldo: saldoAtual });
            }
        });

        Object.entries(posicoesRV).forEach(([ticker, dados]) => {
            const qtdNaCorretora = dados.porCorretora[corretora] || 0;
            if (qtdNaCorretora > 0.000001) {
                const ativoInfo = todosOsAtivos.find(a => a.ticker === ticker) || {};
                const cotacao = dadosDeMercado.cotacoes[ticker];
                const valorMercado = (cotacao?.valor > 0) ? qtdNaCorretora * cotacao.valor : 0;
                valorTotalNaInstituicao += valorMercado;

                const item = { nome: ticker, tipo: ativoInfo.tipo || 'N/D', quantidade: qtdNaCorretora, valor: valorMercado };
                if (ativoInfo.tipo === 'Ação') dadosInstituicao.acoes.itens.push(item);
                else if (ativoInfo.tipo === 'FII') dadosInstituicao.fiis.itens.push(item);
                else if (ativoInfo.tipo === 'ETF') dadosInstituicao.etfs.itens.push(item);
            }
        });
        dadosInstituicao.acoes.total = dadosInstituicao.acoes.itens.reduce((s, a) => s + a.valor, 0);
        dadosInstituicao.fiis.total = dadosInstituicao.fiis.itens.reduce((s, a) => s + a.valor, 0);
        dadosInstituicao.etfs.total = dadosInstituicao.etfs.itens.reduce((s, a) => s + a.valor, 0);

        todosOsAtivosRF.filter(a => a.instituicao === corretora && !(a.descricao || '').toLowerCase().includes('inativa')).forEach(ativo => {
            const saldoAtivo = calcularSaldosRFEmData(ativo, hojeStr).saldoLiquido;
            valorTotalNaInstituicao += saldoAtivo;
            dadosInstituicao.rendaFixa.total += saldoAtivo;
            dadosInstituicao.rendaFixa.itens.push({ nome: ativo.descricao, tipo: 'Renda Fixa', quantidade: null, valor: saldoAtivo });
        });

        proventosProvisionados.forEach(p => {
            if (p.posicaoPorCorretora && p.posicaoPorCorretora[corretora]) {
                const valorNaCorretora = p.posicaoPorCorretora[corretora].valorRecebido || 0;
                valorTotalNaInstituicao += valorNaCorretora;
                dadosInstituicao.proventosProvisionados.total += valorNaCorretora;
                dadosInstituicao.proventosProvisionados.itens.push({
                    nome: p.ticker,
                    dataPagamento: p.dataPagamento,
                    valor: valorNaCorretora
                });
            }
        });
        
        if (valorTotalNaInstituicao > 0) {
            const totalInvestimentos = dadosInstituicao.contaInvestimento.total + dadosInstituicao.proventosProvisionados.total + dadosInstituicao.acoes.total + dadosInstituicao.fiis.total + dadosInstituicao.etfs.total + dadosInstituicao.rendaFixa.total;

            htmlFinal += `<div class="bloco-corretora">
                            <div class="bloco-corretora-header">
                                <h3>${corretora}</h3>
                                <span class="total-corretora">${formatarMoeda(valorTotalNaInstituicao)}</span>
                            </div>
                            <div class="bloco-corretora-conteudo">`;

            if (dadosInstituicao.contasCorrente.itens.length > 0) {
                htmlFinal += `<div class="categoria-acordeao">
                    <div class="acordeao-header">
                        <h4><i class="fas fa-wallet"></i> Contas Correntes</h4>
                        <div><span class="acordeao-valor">${formatarMoeda(dadosInstituicao.contasCorrente.total)}</span> <i class="fas fa-chevron-right acordeao-icone"></i></div>
                    </div>
                    <div class="acordeao-conteudo">
                        <table><tbody>
                            ${dadosInstituicao.contasCorrente.itens.map(c => `
                                <tr>
                                    <td>${c.tipo} (Ag: ${c.agencia || 'N/A'}, C/C: ${c.numero || 'N/A'}, Pix: ${c.pix || 'N/A'})</td>
                                    <td class="numero"><strong>${formatarMoeda(c.saldo)}</strong></td>
                                </tr>
                            `).join('')}
                        </tbody></table>
                    </div>
                </div>`;
            }

            if (totalInvestimentos > 0) {
                htmlFinal += `<div class="categoria-acordeao">
                    <div class="acordeao-header">
                        <h4><i class="fas fa-chart-pie"></i> Investimentos</h4>
                        <div><span class="acordeao-valor">${formatarMoeda(totalInvestimentos)}</span> <i class="fas fa-chevron-right acordeao-icone"></i></div>
                    </div>
                    <div class="acordeao-conteudo">`;
                
                const subcategorias = [
                    { nome: 'Conta Investimento', dados: dadosInstituicao.contaInvestimento, isConta: true },
                    { nome: 'Proventos Provisionados', dados: dadosInstituicao.proventosProvisionados, isConta: false, isProvento: true },
                    { nome: 'Ações', dados: dadosInstituicao.acoes, isConta: false },
                    { nome: 'FIIs', dados: dadosInstituicao.fiis, isConta: false },
                    { nome: 'ETFs', dados: dadosInstituicao.etfs, isConta: false },
                    { nome: 'Renda Fixa', dados: dadosInstituicao.rendaFixa, isConta: false }
                ];

                subcategorias.forEach(sub => {
                    if (sub.dados.itens.length > 0) {
                        let sortedItems = [...sub.dados.itens];
                        if (sub.isProvento) {
                            sortedItems.sort((a, b) => new Date(a.dataPagamento) - new Date(b.dataPagamento));
                        } else {
                            sortedItems.sort((a,b) => (a.nome || a.banco).localeCompare(b.nome || b.banco));
                        }
                        
                        htmlFinal += `<div class="subcategoria-acordeao">
                            <div class="acordeao-header">
                                <h5>${sub.nome}</h5>
                                <div><span class="acordeao-valor">${formatarMoeda(sub.dados.total)}</span> <i class="fas fa-chevron-right acordeao-icone"></i></div>
                            </div>
                            <div class="acordeao-conteudo">
                                 <table><tbody>
                                    ${sortedItems.map(item => {
                                        if (sub.isConta) {
                                            return `<tr>
                                                        <td>${item.tipo} (Ag: ${item.agencia || 'N/A'}, C/C: ${item.numero || 'N/A'})</td>
                                                        <td></td>
                                                        <td class="numero"><strong>${formatarMoeda(item.saldo)}</strong></td>
                                                    </tr>`;
                                        } else if (sub.isProvento) {
                                            return `<tr>
                                                        <td>${item.nome}</td>
                                                        <td class="numero" style="font-size: 0.9em; color: #555;">Paga em: ${new Date(item.dataPagamento + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                                                        <td class="numero"><strong>${formatarMoeda(item.valor)}</strong></td>
                                                    </tr>`;
                                        } else {
                                            return `<tr>
                                                        <td>${item.nome}</td>
                                                        ${item.quantidade ? `<td class="numero">Qtd: ${Math.round(item.quantidade)}</td>` : '<td></td>'}
                                                        <td class="numero"><strong>${formatarMoeda(item.valor)}</strong></td>
                                                    </tr>`;
                                        }
                                    }).join('')}
                                </tbody></table>
                            </div>
                        </div>`;
                    }
                });

                htmlFinal += `</div></div>`;
            }
            
            htmlFinal += `</div></div>`;
        }
    });

    if (htmlFinal === '') {
        container.innerHTML = '<p style="text-align: center;">Nenhuma posição encontrada.</p>';
    } else {
        container.innerHTML = htmlFinal;
    }
}
function salvarMeta(event) {
    event.preventDefault();
    const id = document.getElementById('meta-id').value;
    const tipo = document.getElementById('meta-tipo').value;
    let valorAlvo = parseDecimal(document.getElementById('meta-valor-alvo').value);
    
    if (tipo === 'posicao_ativo' || tipo === 'renda_passiva_sm') {
        valorAlvo = parseInt(valorAlvo, 10);
    }

    const meta = {
        id: id ? parseFloat(id) : Date.now(),
        nome: document.getElementById('meta-nome').value,
        tipo: tipo,
        valorAlvo: valorAlvo,
        ativoAlvo: tipo === 'posicao_ativo' ? document.getElementById('meta-ativo-alvo').value.toUpperCase() : null,
        moedaAlvo: (tipo === 'patrimonio_moeda' || tipo === 'renda_passiva_moeda') ? document.getElementById('meta-moeda-alvo').value : null,
        fonteProventos: (tipo === 'renda_passiva_moeda' || tipo === 'renda_passiva_sm') ? document.getElementById('meta-fonte-proventos').value : null
    };

    const index = todasAsMetas.findIndex(m => m.id === meta.id);
    if (index > -1) {
        todasAsMetas[index] = meta;
    } else {
        todasAsMetas.push(meta);
    }
    
    salvarMetas();
    renderizarTelaMetas();
    if(telas.dashboard.style.display === 'block'){
        renderizarPainelResumoMetasDashboard();
    }
    fecharModal('modal-cadastro-meta');
}
function deletarMeta(metaId) {
    if (confirm('Tem certeza que deseja excluir esta meta?')) {
        todasAsMetas = todasAsMetas.filter(m => m.id !== metaId);
        salvarMetas();
        renderizarTelaMetas();
    }
}
function getUltimoSnapshotPorData(dataStr) {
    // Filtra todos os snapshots daquele dia e pega o último (o mais recente)
    const snapshotsDoDia = historicoCarteira.filter(s => s.data === dataStr);
    if (snapshotsDoDia.length > 0) {
        return snapshotsDoDia[snapshotsDoDia.length - 1];
    }
    return null;
}