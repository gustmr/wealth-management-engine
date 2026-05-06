// Audit and Data Quality // Auditoria e Qualidade de Dados
function verificarInconsistencias() {
    const resultadosDiv = document.getElementById('resultados-inconsistencias');
    resultadosDiv.innerHTML = '<h4>Verificando...</h4>';
    let htmlResultados = '';
    let totalInconsistencias = 0;

    const isDataInvalida = (data) => !data || isNaN(new Date(data).getTime());

    const ativosIncompletos = todosOsAtivos.filter(a => !a.tipo);
    if (ativosIncompletos.length > 0) {
        totalInconsistencias += ativosIncompletos.length;
        htmlResultados += `<div><h4>Ativos com Cadastro Incompleto (${ativosIncompletos.length})</h4><p>Os seguintes ativos não têm um tipo (Ação, FII, ETF) definido, o que é crucial para os cálculos.</p><ul>${ativosIncompletos.map(a => `<li>${a.ticker}</li>`).join('')}</ul></div>`;
    }

    const proventosOrfaos = todosOsProventos.filter(p => !p.quantidadeNaDataCom || p.quantidadeNaDataCom <= 0);
    if (proventosOrfaos.length > 0) {
        totalInconsistencias += proventosOrfaos.length;
        htmlResultados += `<div style="margin-top: 20px;"><h4>Proventos Órfãos (${proventosOrfaos.length})</h4><p>Os seguintes proventos foram lançados, mas não foi encontrada posição na "Data Com". Verifique o histórico do ativo ou a data do provento.</p><ul>${proventosOrfaos.map(p => `<li>${p.tipo} de <strong>${p.ticker}</strong> com pagamento em ${new Date(p.dataPagamento + 'T12:00:00').toLocaleDateString('pt-BR')}</li>`).join('')}</ul><button class="btn btn-primary" id="btn-corrigir-proventos-orfaos" style="margin-top: 15px;">Corrigir Posições Órfãs</button></div>`;
    }

    const posicoesAtuais = gerarPosicaoDetalhada();
    const posicoesNegativas = Object.entries(posicoesAtuais).filter(([_, dados]) => dados.quantidade < -0.000001);
    if (posicoesNegativas.length > 0) {
        totalInconsistencias += posicoesNegativas.length;
        htmlResultados += `<div style="margin-top: 20px;"><h4>Posições Negativas Encontradas (${posicoesNegativas.length})</h4><p>Os seguintes ativos estão com quantidade negativa, indicando uma possível venda maior que a posse. Verifique seu histórico de operações.</p><ul>${posicoesNegativas.map(([ticker, dados]) => `<li><strong>${ticker}</strong> (Quantidade atual: ${Math.round(dados.quantidade)})</li>`).join('')}</ul></div>`;
    }
    
    const registrosDataCorrigivel = [];
    todasAsNotas.filter(r => isDataInvalida(r.data)).forEach(r => registrosDataCorrigivel.push({ tipo: 'nota', id: r.id, nome: `Nota de Negociação nº ${r.numero}`}));
    todosOsAjustes.filter(r => isDataInvalida(r.data)).forEach(r => registrosDataCorrigivel.push({ tipo: 'ajuste', id: r.id, nome: `Ajuste (${r.tipoAjuste})`}));
    posicaoInicial.filter(r => isDataInvalida(r.data)).forEach(r => registrosDataCorrigivel.push({ tipo: 'posicao', id: r.id, nome: `Posição Inicial para ${r.ticker}`}));
    todasAsMovimentacoes.filter(r => r.source === 'manual' && isDataInvalida(r.data)).forEach(r => registrosDataCorrigivel.push({ tipo: 'transacao', id: r.id, nome: `Transação Manual: ${r.descricao}`}));
    todosOsProventos.forEach(r => {
        if(isDataInvalida(r.dataCom)) registrosDataCorrigivel.push({ tipo: 'provento-com', id: r.id, nome: `Provento (Data Com) para ${r.ticker}`});
        if(isDataInvalida(r.dataPagamento)) registrosDataCorrigivel.push({ tipo: 'provento-pag', id: r.id, nome: `Provento (Data Pag.) para ${r.ticker}`});
    });

    if (registrosDataCorrigivel.length > 0) {
        totalInconsistencias += registrosDataCorrigivel.length;
        htmlResultados += `<div style="margin-top: 20px;"><h4>Registros com Data Manual Inválida (${registrosDataCorrigivel.length})</h4><p>Os seguintes registros inseridos manualmente precisam de uma data válida.</p><ul>${registrosDataCorrigivel.map(r => `<li>${r.nome} <button class="btn btn-sm btn-primary btn-corrigir-data" data-record-type="${r.tipo}" data-record-id="${r.id}">Corrigir</button></li>`).join('')}</ul></div>`;
    }

    const vendasHistoricasSemValor = posicaoInicial.filter(p => p.tipoRegistro === 'TRANSACAO_HISTORICA' && p.transacao.toLowerCase() === 'venda' && (p.valorVenda === null || typeof p.valorVenda === 'undefined'));
    if (vendasHistoricasSemValor.length > 0) {
        totalInconsistencias += vendasHistoricasSemValor.length;
        htmlResultados += `<div style="margin-top: 20px;">
            <h4>Vendas Históricas com Valor Faltando (${vendasHistoricasSemValor.length})</h4>
            <p>Para o cálculo preciso do Imposto de Renda, é necessário informar o valor total de venda destas operações históricas.</p>
            <button class="btn btn-primary" id="btn-corrigir-vendas-historicas" style="margin-top: 10px;">Corrigir Vendas Agora</button>
        </div>`;
    }

    const contasSemMoeda = todasAsContas.filter(c => typeof c.moeda === 'undefined');
    if (contasSemMoeda.length > 0) {
        totalInconsistencias += contasSemMoeda.length;
        htmlResultados += `<div style="margin-top: 20px;">
            <h4>Contas com Moeda Não Especificada (${contasSemMoeda.length})</h4>
            <p>Estas contas precisam ter uma moeda definida para funcionar no novo sistema unificado. Clique no botão para corrigir.</p>
            <button class="btn btn-primary" type="button" id="btn-iniciar-correcao-contas-sem-moeda" style="margin-top: 10px;">Corrigir Contas Agora</button>
        </div>`;
    }

    if (totalInconsistencias === 0) {
        resultadosDiv.innerHTML = '<p class="no-issues"><i class="fas fa-check-circle"></i> Nenhuma inconsistência encontrada!</p>';
    } else {
        resultadosDiv.innerHTML = htmlResultados;
    }
}
function abrirModalCorrecaoContasSemMoeda() {
    const container = document.getElementById('lista-contas-sem-moeda-container');
    const contasParaCorrigir = todasAsContas.filter(c => typeof c.moeda === 'undefined');

    if (contasParaCorrigir.length === 0) {
        alert('Nenhuma conta para corrigir!');
        return;
    }

    let tableHtml = `<table class="tabela-correcao-orfaos">
        <thead>
            <tr>
                <th>Conta</th>
                <th>Moeda</th>
                <th>Detalhes (Apenas para BRL)</th>
            </tr>
        </thead>
        <tbody>`;
    
    contasParaCorrigir.forEach(conta => {
        tableHtml += `
            <tr class="conta-correcao-row" data-conta-id="${conta.id}">
                <td><strong>${conta.banco} - ${conta.tipo}</strong></td>
                <td>
                    <select class="conta-correcao-moeda" data-conta-id="${conta.id}">
                        <option value="">Selecione...</option>
                        <option value="BRL">Real (BRL)</option>
                        <option value="USD">Dólar (USD)</option>
                        <option value="EUR">Euro (EUR)</option>
                        <option value="GBP">Libra (GBP)</option>
                    </select>
                </td>
                <td>
                    <div class="detalhes-brl-container" id="detalhes-brl-${conta.id}" style="display: none;">
                        <input type="text" class="conta-correcao-agencia" placeholder="Agência" value="${conta.agencia || ''}">
                        <input type="text" class="conta-correcao-numero" placeholder="Conta" value="${conta.numero || ''}">
                        <input type="text" class="conta-correcao-pix" placeholder="Chave Pix" value="${conta.pix || ''}">
                    </div>
                </td>
            </tr>
        `;
    });
    
    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
    abrirModal('modal-corrigir-contas-sem-moeda');
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

function abrirModalValoresVenda() {
    const container = document.getElementById('lista-vendas-historicas-container');
    
    let tableHtml = `<table>
                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Ativo</th>
                                <th class="numero">Quantidade</th>
                                <th class="venda-input-col numero">Valor Total da Venda (R$)</th>
                            </tr>
                        </thead>
                        <tbody>`;
    
    let hasVendas = false;
    posicaoInicial.forEach((p, index) => {
        if (p.tipoRegistro === 'TRANSACAO_HISTORICA' && p.transacao.toLowerCase() === 'venda' && (p.valorVenda === null || typeof p.valorVenda === 'undefined')) {
            hasVendas = true;
            tableHtml += `<tr>
                            <td>${new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                            <td>${p.ticker}</td>
                            <td class="numero">${p.quantidade}</td>
                            <td class="venda-input-col">
                                <input type="text" class="venda-historica-valor" data-index="${index}" placeholder="Ex: 1.234,56">
                            </td>
                          </tr>`;
        }
    });

    if (!hasVendas) {
        alert("Nenhuma venda histórica para corrigir!");
        return;
    }

    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
    modalInformarValoresVenda.style.display = 'block';
}

function salvarValoresVenda(event) {
    event.preventDefault();
    const inputs = document.querySelectorAll('#lista-vendas-historicas-container .venda-historica-valor');
    let count = 0;

    inputs.forEach(input => {
        const valorStr = input.value;
        if (valorStr) {
            const valorNum = parseDecimal(valorStr);
            const index = parseInt(input.dataset.index, 10);
            
            if (!isNaN(index) && posicaoInicial[index]) {
                posicaoInicial[index].valorVenda = valorNum;
                count++;
            }
        }
    });

    if (count > 0) {
        salvarPosicaoInicial().then(() => {
            alert(`${count} registro(s) de venda histórica atualizado(s) com sucesso!`);
            fecharModal('modal-informar-valores-venda');
            verificarInconsistencias();
        });
    } else {
        fecharModal('modal-informar-valores-venda');
        verificarInconsistencias();
    }
}
function abrirModalCorrecaoData(recordType, recordId) {
    document.getElementById('corrigir-data-record-type').value = recordType;
    document.getElementById('corrigir-data-record-id').value = recordId;
    document.getElementById('form-corrigir-data').reset();
    
    let arrayFonte, nomeDescricao, registro;
    const id = parseFloat(recordId);

    switch(recordType) {
        case 'nota': arrayFonte = todasAsNotas; nomeDescricao = 'Nota de Negociação'; break;
        case 'provento-com':
        case 'provento-pag': arrayFonte = todosOsProventos; nomeDescricao = 'Provento'; break;
        case 'ajuste': arrayFonte = todosOsAjustes; nomeDescricao = 'Ajuste'; break;
        case 'posicao': arrayFonte = posicaoInicial; nomeDescricao = 'Posição Inicial'; break;
        case 'transacao': arrayFonte = todasAsMovimentacoes; nomeDescricao = 'Transação Manual'; break;
        default: return;
    }

    registro = arrayFonte.find(r => r.id === id);
    if(registro) {
        let nomeCampo = recordType.includes('provento') ? (recordType.endsWith('-com') ? 'Data Com' : 'Data Pagamento') : 'Data';
        document.getElementById('modal-corrigir-data-descricao').textContent = `Corrigindo ${nomeCampo} para: ${nomeDescricao} (${registro.ticker || registro.numero || registro.descricao || ''})`;
    }

    modalCorrigirData.style.display = 'block';
    document.getElementById('corrigir-data-input').focus();
}

function salvarCorrecaoData(event) {
    event.preventDefault();
    const recordType = document.getElementById('corrigir-data-record-type').value;
    const recordId = parseFloat(document.getElementById('corrigir-data-record-id').value);
    const novaData = document.getElementById('corrigir-data-input').value;

    let arrayFonte, saveFunction, dataField = 'data';
    switch(recordType) {
        case 'nota': arrayFonte = todasAsNotas; saveFunction = salvarNotas; break;
        case 'provento-com': arrayFonte = todosOsProventos; saveFunction = salvarProventos; dataField = 'dataCom'; break;
        case 'provento-pag': arrayFonte = todosOsProventos; saveFunction = salvarProventos; dataField = 'dataPagamento'; break;
        case 'ajuste': arrayFonte = todosOsAjustes; saveFunction = salvarAjustes; break;
        case 'posicao': arrayFonte = posicaoInicial; saveFunction = salvarPosicaoInicial; break;
        case 'transacao': arrayFonte = todasAsMovimentacoes; saveFunction = salvarMovimentacoes; break;
        default: return;
    }

    const registro = arrayFonte.find(r => r.id === recordId);
    if(registro) {
        registro[dataField] = novaData;
        saveFunction().then(() => {
            fecharModal('modal-corrigir-data');
            verificarInconsistencias(); 
        });
    } else {
        alert('Erro: Registro não encontrado.');
    }
}
async function migrarDadosCorretora(nomeAntigo, nomeNovo) {
    if (!nomeAntigo || !nomeNovo || nomeAntigo === nomeNovo) return;

    console.log(`Iniciando migração de "${nomeAntigo}" para "${nomeNovo}"...`);
    let alteracoesRealizadas = 0;

    // 1. Notas de Negociação
    todasAsNotas.forEach(nota => {
        if (nota.corretora === nomeAntigo) {
            nota.corretora = nomeNovo;
            alteracoesRealizadas++;
        }
    });

    // 2. Renda Fixa
    todosOsAtivosRF.forEach(rf => {
        if (rf.instituicao === nomeAntigo) {
            rf.instituicao = nomeNovo;
            alteracoesRealizadas++;
        }
    });

    // 3. Posição Inicial e Histórico (Estrutura Complexa)
    posicaoInicial.forEach(pos => {
        // Caso A: Registros Manuais ou de Importação (posicoesPorCorretora)
        if (pos.posicoesPorCorretora) {
            const indexAntigo = pos.posicoesPorCorretora.findIndex(p => p.corretora === nomeAntigo);
            if (indexAntigo > -1) {
                const dadosAntigos = pos.posicoesPorCorretora[indexAntigo];
                
                // Verifica se já existe o destino para fundir
                const indexNovo = pos.posicoesPorCorretora.findIndex(p => p.corretora === nomeNovo);
                
                if (indexNovo > -1) {
                    // Fusão: Soma a quantidade no destino
                    pos.posicoesPorCorretora[indexNovo].quantidade += dadosAntigos.quantidade;
                    // Remove o antigo
                    pos.posicoesPorCorretora.splice(indexAntigo, 1);
                } else {
                    // Renomeação simples
                    dadosAntigos.corretora = nomeNovo;
                }
                alteracoesRealizadas++;
            }
        }
        
        // Caso B: Registros de Histórico Individual (campo direto)
        if (pos.corretora === nomeAntigo) {
            pos.corretora = nomeNovo;
            alteracoesRealizadas++;
        }
    });

    // 4. Proventos (Chaves do Objeto)
    todosOsProventos.forEach(prov => {
        if (prov.posicaoPorCorretora && prov.posicaoPorCorretora[nomeAntigo]) {
            const dadosAntigos = prov.posicaoPorCorretora[nomeAntigo];
            
            if (prov.posicaoPorCorretora[nomeNovo]) {
                // Fusão: Soma quantidade e valor recebido
                prov.posicaoPorCorretora[nomeNovo].quantidade += dadosAntigos.quantidade;
                prov.posicaoPorCorretora[nomeNovo].valorRecebido += dadosAntigos.valorRecebido;
            } else {
                // Transferência simples
                prov.posicaoPorCorretora[nomeNovo] = dadosAntigos;
            }
            
            // Remove a chave antiga
            delete prov.posicaoPorCorretora[nomeAntigo];
            alteracoesRealizadas++;
        }
    });

    // 5. Ajustes e Transferências
    todosOsAjustes.forEach(ajuste => {
        // Transferências
        if (ajuste.tipoAjuste === 'transferencia') {
            if (ajuste.corretoraOrigem === nomeAntigo) {
                ajuste.corretoraOrigem = nomeNovo;
                alteracoesRealizadas++;
            }
            if (ajuste.corretoraDestino === nomeAntigo) {
                ajuste.corretoraDestino = nomeNovo;
                alteracoesRealizadas++;
            }
        }
        
        // Eventos Corporativos/Ativos (Detalhes)
        if (ajuste.detalhes && Array.isArray(ajuste.detalhes)) {
            let alterouDetalhe = false;
            // Cria um novo array de detalhes para gerenciar fusões
            const novosDetalhesMap = new Map();
            
            ajuste.detalhes.forEach(detalhe => {
                let nomeFinal = detalhe.corretora === nomeAntigo ? nomeNovo : detalhe.corretora;
                if (detalhe.corretora === nomeAntigo) alterouDetalhe = true;

                if (!novosDetalhesMap.has(nomeFinal)) {
                    novosDetalhesMap.set(nomeFinal, 0);
                }
                novosDetalhesMap.set(nomeFinal, novosDetalhesMap.get(nomeFinal) + detalhe.quantidade);
            });

            if (alterouDetalhe) {
                // Reconstrói o array de detalhes
                ajuste.detalhes = Array.from(novosDetalhesMap.entries()).map(([corretora, quantidade]) => ({ corretora, quantidade }));
                alteracoesRealizadas++;
            }
        }
    });

    // 6. Salvar tudo
    if (alteracoesRealizadas > 0) {
        await Promise.all([
            salvarNotas(),
            salvarAtivosRF(),
            salvarPosicaoInicial(),
            salvarProventos(),
            salvarAjustes()
        ]);
        
        // Recalcula movimentações automáticas para refletir novos nomes nas descrições futuras (opcional, mas bom para consistência interna)
        sincronizarTodosOsRegistros(null, true);
        
        alert(`Migração concluída com sucesso! ${alteracoesRealizadas} registros foram atualizados de "${nomeAntigo}" para "${nomeNovo}".`);
    } else {
        console.log("Nenhum registro encontrado para migração.");
    }
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