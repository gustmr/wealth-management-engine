/**
 * Função para carregar dados de demonstração automaticamente.
 * Busca o arquivo default_data.json e injeta no localStorage caso seja a primeira visita.
 */
async function inicializarDadosDeDemonstracao() {
    if (localStorage.getItem('carteira_demo_carregada') === 'true' || localStorage.getItem('carteira_ativos_offline')) {
        return false; 
    }

    try {
        const resposta = await fetch('default_data.json');
        if (!resposta.ok) throw new Error('Arquivo default_data.json não encontrado');
        
        const dadosDemo = await resposta.json();

        // Mapa DEFINITIVO: Conecta o nome exato do seu arquivo JSON à chave exata do Local Storage
        const mapChaves = {
            'ativos': 'carteira_ativos_offline',
            'contas': 'carteira_contas_offline',
            'feriados': 'carteira_feriados_offline',
            'ajustes': 'carteira_ajustes_offline',
            'posicoes': 'carteira_posicoes_offline',
            'notas': 'carteira_notas_offline',
            'proventos': 'carteira_proventos_offline',
            'movimentacoes': 'carteira_movimentacoes_offline',
            'todosOsAtivosRF': 'carteira_todos_os_ativos_r_f_offline',
            'todosOsRendimentosRealizadosRF': 'carteira_todos_os_rendimentos_realizados_r_f_offline',
            'todosOsRendimentosRFNaoRealizados': 'carteira_todos_os_rendimentos_r_f_nao_realizados_offline',
            'dadosMoedas': 'carteira_dados_moedas_offline',
            'todosOsAtivosMoedas': 'carteira_todos_os_ativos_moedas_offline',
            'todasAsTransacoesRecorrentes': 'carteira_todas_as_transacoes_recorrentes_offline',
            'metas': 'carteira_metas_offline',
            'ajustesIR': 'carteira_ajustes_ir_offline',
            'dadosAlocacao': 'carteira_dados_alocacao_offline',
            'historicoCarteira': 'carteira_historico_carteira_offline',
            'urlCotacoesCSV': 'carteira_url_cotacoes_csv_offline',
            'configuracoesFiscais': 'carteira_configuracoes_fiscais_offline',
            'linksExternos': 'carteira_links_externos_offline',
            'autoUpdateEnabled': 'carteira_auto_update_enabled_offline',
            'dadosSimulacaoNegociar': 'carteira_dados_simulacao_negociar_offline',
            'userName': 'carteira_user_name_offline',
            'dadosComparacao': 'carteira_dados_comparacao_offline',
            'configuracoesGraficos': 'carteira_configuracoes_graficos_offline',
            'salarioMinimo': 'carteira_salario_minimo_offline',
            'timestampUltimoBackup': 'carteira_timestamp_ultimo_backup_offline'
        };
        
        for (const chaveOriginal in dadosDemo) {
            let chaveFinal = mapChaves[chaveOriginal];
            
            // Tratamento de segurança caso o JSON traga uma chave inesperada
            if (!chaveFinal) {
                if (chaveOriginal.startsWith('carteira_')) {
                    chaveFinal = chaveOriginal;
                } else {
                    chaveFinal = `carteira_${chaveOriginal}_offline`;
                }
            }
            
            const valor = typeof dadosDemo[chaveOriginal] === 'object' ? JSON.stringify(dadosDemo[chaveOriginal]) : String(dadosDemo[chaveOriginal]);
            localStorage.setItem(chaveFinal, valor);
        }
        
        localStorage.setItem('carteira_demo_carregada', 'true');
        return true; 
        
    } catch (erro) {
        console.error('Falha ao injetar dados de demonstração:', erro);
        return false;
    }
}


function salvarSnapshotCarteira(silencioso = false) {
    const hoje = new Date().toISOString().split('T')[0];
    
    const posicoesRV = gerarPosicaoDetalhada(hoje);
    
    const detalhesCarteira = {
        valorPorClasse: { 'Ações': 0, 'FIIs': 0, 'ETFs': 0, 'Renda Fixa': 0 },
        ativos: {},
        rendaFixa: []
    };

    for (const ticker in posicoesRV) {
        const posicao = posicoesRV[ticker];
        if (posicao.quantidade <= 0.000001) continue;

        const ativoInfo = todosOsAtivos.find(a => a.ticker === ticker);
        const tipoMapeado = ativoInfo ? (ativoInfo.tipo === 'Ação' ? 'Ações' : ativoInfo.tipo === 'FII' ? 'FIIs' : 'ETFs') : null;
        const cotacao = dadosDeMercado.cotacoes[ticker];
        const precoAtual = cotacao ? cotacao.valor : 0;
        const valorDeMercado = posicao.quantidade * precoAtual;

        if (tipoMapeado) {
            detalhesCarteira.valorPorClasse[tipoMapeado] += valorDeMercado;
        }

        detalhesCarteira.ativos[ticker] = {
            quantidade: posicao.quantidade,
            precoMedio: posicao.precoMedio,
            precoAtual: precoAtual,
            valorDeMercado: valorDeMercado
        };
    }

    todosOsAtivosRF.forEach(ativo => {
        if ((ativo.descricao || '').toLowerCase().includes('(inativa)') || (ativo.descricao || '').toLowerCase().includes('inactive')) {
            return;
        }
        const saldosNaData = calcularSaldosRFEmData(ativo, hoje);
        detalhesCarteira.valorPorClasse['Renda Fixa'] += saldosNaData.saldoLiquido;
        detalhesCarteira.rendaFixa.push({
            descricao: ativo.descricao,
            valorInvestido: saldosNaData.valorInvestido, 
            saldoLiquido: saldosNaData.saldoLiquido   
        });
    });

    let saldoTotalContas = 0;
    todasAsContas.forEach(conta => {
        saldoTotalContas += calcularSaldoEmData(conta, hoje);
    });

    let valorTotalMoedas = 0;
    const todosOsEventosCaixa = obterTodosOsEventosDeCaixa();
    const hojeStr = new Date().toISOString().split('T')[0];

    todosOsAtivosMoedas.forEach(ativo => {
        const transacoesPassadasEPresentes = todosOsEventosCaixa.filter(e =>
            e.tipo === 'moeda' &&
            String(e.idAlvo) === String(ativo.id) &&
            e.source !== 'recorrente_futura' &&
            e.data <= hojeStr
        );
        const saldoAtivoAtual = transacoesPassadasEPresentes.reduce((soma, t) => soma + arredondarMoeda(t.valor), ativo.saldoInicial);
        const cotacao = dadosMoedas.cotacoes[ativo.moeda] || 0;
        valorTotalMoedas += saldoAtivoAtual * cotacao;
    });
    
    const valorTotalInvestimentos = Object.values(detalhesCarteira.valorPorClasse).reduce((soma, v) => soma + v, 0);
    const totalProventosProvisionados = calcularTotalProventosProvisionados();
    const patrimonioTotal = valorTotalInvestimentos + saldoTotalContas + valorTotalMoedas + totalProventosProvisionados;

    const novoSnapshot = {
        data: hoje,
        patrimonioTotal: patrimonioTotal,
        valorTotalInvestimentos: valorTotalInvestimentos,
        valorTotalContas: saldoTotalContas,
        valorTotalMoedas: valorTotalMoedas,
        valorTotalProventosProvisionados: totalProventosProvisionados,
        cotacoesMoedas: {
            USD: dadosMoedas.cotacoes['USD'] || 0,
            EUR: dadosMoedas.cotacoes['EUR'] || 0,
            GBP: dadosMoedas.cotacoes['GBP'] || 0
        },
        ifix: dadosDeMercado.ifix || 0,
        ibov: dadosDeMercado.ibov || 0,
        detalhesCarteira: detalhesCarteira
    };

    const indexExistente = historicoCarteira.findIndex(s => s.data === hoje);

    if (indexExistente > -1) {
        if (!silencioso) { 
            if (confirm(`There is already a snapshot of ${formatarMoeda(historicoCarteira[indexExistente].patrimonioTotal)} for today. Do you want to update it to ${formatarMoeda(novoSnapshot.patrimonioTotal)}?`)) {
                historicoCarteira[indexExistente] = novoSnapshot;
            } else {
                return; 
            }
        } else { 
            historicoCarteira[indexExistente] = novoSnapshot;
        }
    } else {
        historicoCarteira.push(novoSnapshot);
    }

    historicoCarteira.sort((a, b) => new Date(a.data) - new Date(b.data));
    
    salvarHistoricoCarteira();

    if (!silencioso) {
        const dataFormatada = new Date(hoje + 'T12:00:00').toLocaleDateString('en-GB');
        const mensagem = `Snapshot saved successfully!\n\nDate: ${dataFormatada}\n-----------------------------------\nTotal Net Worth: ${formatarMoeda(novoSnapshot.patrimonioTotal)}\nTotal Investments: ${formatarMoeda(novoSnapshot.valorTotalInvestimentos)}\nAccount Balance: ${formatarMoeda(novoSnapshot.valorTotalContas)}\nCurrency Balance: ${formatarMoeda(novoSnapshot.valorTotalMoedas)}\nIncome to Receive: ${formatarMoeda(novoSnapshot.valorTotalProventosProvisionados)}\n-----------------------------------\nIFIX: ${formatarDecimal(novoSnapshot.ifix, 2)}\nIBOV: ${formatarDecimal(novoSnapshot.ibov, 2)}\n`;
        alert(mensagem);
    } 
    
    if (telas.dashboard.style.display === 'block') {
        renderizarDashboard();
    }
}
function salvarTimestampBackup(timestamp = null) {
    const dataParaSalvar = timestamp ? timestamp : new Date().toISOString();
    localStorage.setItem('carteira_ultimo_backup', dataParaSalvar);
    timestampUltimoBackup = dataParaSalvar;
    salvarDadosNaFonte({ timestampUltimoBackup: timestampUltimoBackup });
    renderizarInfoBackup();
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
function carregarDadosDeMercado() {
    const data = localStorage.getItem('carteira_dados_mercado');
    // Adicionado ifix e ibov à estrutura padrão
    dadosDeMercado = data ? JSON.parse(data) : { timestamp: null, cotacoes: {}, ifix: 0, ibov: 0 };
}
function salvarDadosDeMercado() { localStorage.setItem('carteira_dados_mercado', JSON.stringify(dadosDeMercado)); }
function salvarDadosNaFonte(dadosParaSalvar) {
    registrarAlteracao();
    
    // Versão Offline: Salva sempre no LocalStorage
    for (const key in dadosParaSalvar) {
        const dados = dadosParaSalvar[key];
        // O nome da chave no localStorage é construído dinamicamente para manter compatibilidade com o backup original
        const chaveLocalStorage = `carteira_${key.replace(/([A-Z])/g, '_$1').toLowerCase()}_offline`;
        localStorage.setItem(chaveLocalStorage, JSON.stringify(dados));
    }
    return Promise.resolve(); // Retorna uma promessa resolvida para manter compatibilidade com .then()
}
function salvarDadosNaFonteSemContar(dadosParaSalvar) {
    // Versão Offline: Salva sempre no LocalStorage sem incrementar contador
    for (const key in dadosParaSalvar) {
        const dados = dadosParaSalvar[key];
        const chaveLocalStorage = `carteira_${key.replace(/([A-Z])/g, '_$1').toLowerCase()}_offline`;
        localStorage.setItem(chaveLocalStorage, JSON.stringify(dados));
    }
    return Promise.resolve();
}
function salvarAtivos() { return salvarDadosNaFonte({ ativos: todosOsAtivos }); }
function salvarNotas() { return salvarDadosNaFonte({ notas: todasAsNotas }); }
function salvarPosicaoInicial() { return salvarDadosNaFonte({ posicoes: posicaoInicial }); }
function salvarAjustes() { return salvarDadosNaFonte({ ajustes: todosOsAjustes }); }
function salvarProventos() { return salvarDadosNaFonte({ proventos: todosOsProventos }); }
function salvarContas() { return salvarDadosNaFonte({ contas: todasAsContas }); }
function salvarFeriados() { return salvarDadosNaFonte({ feriados: todosOsFeriados }); }
function salvarMovimentacoes() { return salvarDadosNaFonte({ movimentacoes: todasAsMovimentacoes }); }
function salvarAjustesIR() { return salvarDadosNaFonte({ ajustesIR: todosOsAjustesIR }); }
function salvarAtivosRF() { return salvarDadosNaFonte({ todosOsAtivosRF: todosOsAtivosRF }); }
function salvarRendimentosRealizadosRF() { return salvarDadosNaFonte({ todosOsRendimentosRealizadosRF: todosOsRendimentosRealizadosRF }); }
function salvarRendimentosRFNaoRealizados() { return salvarDadosNaFonte({ todosOsRendimentosRFNaoRealizados: todosOsRendimentosRFNaoRealizados }); }
function salvarDadosMoedas() { return salvarDadosNaFonte({ dadosMoedas: dadosMoedas }); }
function salvarAtivosMoedas() { return salvarDadosNaFonte({ todosOsAtivosMoedas: todosOsAtivosMoedas }); }
function salvarDadosAlocacao() { return salvarDadosNaFonte({ dadosAlocacao: dadosAlocacao }); }
function salvarHistoricoCarteira() { return salvarDadosNaFonteSemContar({ historicoCarteira: historicoCarteira }); }
function salvarTransacoesRecorrentes() { return salvarDadosNaFonte({ todasAsTransacoesRecorrentes: todasAsTransacoesRecorrentes }); }
function salvarMetas() { return salvarDadosNaFonte({ metas: todasAsMetas }); }
function salvarUserName() { return salvarDadosNaFonte({ userName: userName }); }
function salvarDadosComparacao() { return salvarDadosNaFonte({ dadosComparacao: dadosComparacao }); }
function salvarConfiguracoesGraficos() { return salvarDadosNaFonte({ configuracoesGraficos: configuracoesGraficos }); }
function salvarLinksExternos() { return salvarDadosNaFonte({ linksExternos: linksExternos }); }
function salvarSalarioMinimo() { return salvarDadosNaFonte({ salarioMinimo: salarioMinimo }); }
function salvarConfiguracaoAutoUpdate() { return salvarDadosNaFonte({ autoUpdateEnabled: autoUpdateEnabled }); }
function salvarUrlCotacoes() { 
    // Força a chave 'url_cotacoes_csv' para evitar conversão automática errada de CamelCase
    return salvarDadosNaFonte({ url_cotacoes_csv: urlCotacoesCSV }); 
}

function salvarConfiguracoesFiscais() { 
    // Força a chave 'configuracoes_fiscais'
    return salvarDadosNaFonte({ configuracoes_fiscais: configuracoesFiscais }); 
}
function salvarDadosSimulacaoNegociar() { return salvarDadosNaFonte({ dadosSimulacaoNegociar: dadosSimulacaoNegociar }); }
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
function salvarProventosEmMassa() {
    const linhas = document.querySelectorAll('#tabela-proventos-massa-body tr');
    let proventosAdicionados = 0;

    for (const linha of linhas) {
        const ticker = linha.querySelector('.prov-massa-ticker').value.toUpperCase();
        const tipo = linha.querySelector('.prov-massa-tipo').value;
        const dataCom = linha.querySelector('.prov-massa-data-com').value;
        const dataPagamento = linha.querySelector('.prov-massa-data-pag').value;
        const valorBrutoStr = linha.querySelector('.prov-massa-valor-bruto').value;
        const irPercentStr = linha.querySelector('.prov-massa-ir').value;

        if (!ticker || !tipo || !dataCom || !dataPagamento || !valorBrutoStr) {
            continue;
        }

        if (!todosOsAtivos.some(a => a.ticker === ticker)) {
            alert(`O ativo "${ticker}" não está cadastrado e será ignorado. Por favor, cadastre-o primeiro.`);
            continue;
        }

        const valorBruto = parseDecimal(valorBrutoStr);
        const irPercent = parseDecimal(irPercentStr) || 0;
        const irValor = valorBruto * (irPercent / 100);
        const valorLiquido = valorBruto - irValor;

        const dadosCalculados = calcularDadosProvento(ticker, dataCom, valorLiquido);
        
        const novoProvento = {
            id: Date.now() + Math.random(),
            ticker,
            tipo,
            dataCom,
            dataPagamento,
            valorIndividual: valorLiquido,
            valorBrutoIndividual: valorBruto,
            percentualIR: irPercent,
            ...dadosCalculados
        };

        todosOsProventos.push(novoProvento);
        sincronizarProventoComTransacao(novoProvento.id);
        proventosAdicionados++;
    }

    if (proventosAdicionados > 0) {
        salvarProventos();
        salvarMovimentacoes();
        
        // DISPARA A SINCRONIZAÇÃO SILENCIOSA
        sincronizarTodosOsRegistros(null, true);

        alert(`${proventosAdicionados} lançamento(s) de proventos salvos com sucesso!`);
        
        mostrarTela('proventos');
        renderizarTabelaProventos();
    } else {
        alert('Nenhuma linha válida foi preenchida para salvar.');
    }
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
function salvarEdicaoOperacao(event) { event.preventDefault(); const opId = parseFloat(document.getElementById('edit-op-id').value); const opIndex = notaAtual.operacoes.findIndex(o => o.id === opId); if (opIndex === -1) return; notaAtual.operacoes[opIndex].tipo = document.getElementById('edit-op-tipo').value; notaAtual.operacoes[opIndex].quantidade = parseInt(document.getElementById('edit-op-quantidade').value); notaAtual.operacoes[opIndex].valor = parseDecimal(document.getElementById('edit-op-valor').value); modalEdicaoOperacao.style.display = 'none'; renderizarTabelaOperacoes(); atualizarTotais(); }

async function salvarEdicaoTransacaoProvento() {
    // As linhas "event" e "event.preventDefault()" foram REMOVIDAS daqui.

    const transacaoId = document.getElementById('edit-trans-provento-id').value;
    const novoValorTotal = parseDecimal(document.getElementById('edit-trans-provento-valor').value);
    const transacaoIdNum = parseFloat(transacaoId);
    const transacaoIndex = todasAsMovimentacoes.findIndex(t => t.id === transacaoIdNum);

    if (transacaoIndex === -1) {
        // Tradução: Erro
        alert("Error: Transaction not found for update.");
        return;
    }

    const transacao = todasAsMovimentacoes[transacaoIndex];
    const proventoOriginal = todosOsProventos.find(p => p.id === transacao.sourceId);

    if (!proventoOriginal) {
        // Tradução: Erro
        alert("Error: Original income associated with this transaction was not found.");
        return;
    }
    transacao.valor = novoValorTotal;
    const contaAssociada = todasAsContas.find(c => String(c.id) === String(transacao.idAlvo));
    let quantidadeNaContaStr = '';
    if (contaAssociada && proventoOriginal.posicaoPorCorretora[contaAssociada.banco]) {
        const quantidade = proventoOriginal.posicaoPorCorretora[contaAssociada.banco].quantidade;
        quantidadeNaContaStr = ` s/${Math.round(quantidade)}`;
    }
    // Tradução: Valor Editado
    let tipoProvFmt = proventoOriginal.tipo;
    if (proventoOriginal.tipo === 'Rendimento') tipoProvFmt = 'Yield';
    if (proventoOriginal.tipo === 'Dividendo') tipoProvFmt = 'Dividend';
    if (proventoOriginal.tipo === 'Bonificação') tipoProvFmt = 'Bonus';
    if (proventoOriginal.tipo === 'Outros') tipoProvFmt = 'Others';

    transacao.descricao = `(Edited Value) ${tipoProvFmt} of ${proventoOriginal.ticker}${quantidadeNaContaStr}`;
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
function salvarAjusteIR(target) {
    const isPrejuizo = target.classList.contains('editable-prejudice-cell');
    const chaveAjuste = isPrejuizo ? target.dataset.chaveAjustePrejuizo : target.dataset.chaveAjuste;
    const novoValorExibido = parseDecimal(target.textContent);

    let valorParaSalvar;

    if (isPrejuizo) {
        // --- INÍCIO DA CORREÇÃO DEFINITIVA ---
        // Pega o valor exato digitado pelo usuário e o armazena como negativo (pois é um prejuízo).
        // Não calcula mais a diferença, tratando este valor como a "verdade absoluta" para o início do ano.
        valorParaSalvar = -Math.abs(novoValorExibido);
        // --- FIM DA CORREÇÃO DEFINITIVA ---
    } else {
        // Lógica original para ajustes de resultado do mês (que já está correta).
        const valorCalculado = parseFloat(target.dataset.resultadoCalculado);
        valorParaSalvar = novoValorExibido - valorCalculado;
    }

    const index = todosOsAjustesIR.findIndex(a => a.chave === chaveAjuste);

    // Condição ajustada: Salva se o valor for diferente de zero, ou se for um prejuízo inicial (mesmo que seja zero).
    if (Math.abs(valorParaSalvar) > 0.001 || isPrejuizo) {
         if (index > -1) {
            todosOsAjustesIR[index].valor = valorParaSalvar;
        } else {
            todosOsAjustesIR.push({ chave: chaveAjuste, valor: valorParaSalvar });
        }
    } else {
        // Se o ajuste for zero (e não for um prejuízo inicial), remove o registro.
        if (index > -1) {
            todosOsAjustesIR.splice(index, 1);
        }
    }
    
    salvarAjustesIR();
    renderizarCalculadoraIR();
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
function deletarFeriado(feriadoId) {
    if (confirm('Tem certeza que deseja excluir este feriado?')) {
        todosOsFeriados = todosOsFeriados.filter(f => f.id !== feriadoId);
        salvarFeriados();
        renderizarTabelaFeriados();
    }
}
function deletarAtivo(ativoId) { 
    // Tradução: Confirmação de exclusão
    if (confirm('Are you sure you want to delete this asset? This action cannot be undone and may affect other records that use it.')) { 
        todosOsAtivos = todosOsAtivos.filter(a => a.id !== ativoId); 
        salvarAtivos(); 
        renderizarTabelaAtivos(); 
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
function deletarEventoCorporativo(ajusteId) {
    if (confirm('Tem certeza que deseja excluir este evento? Esta ação recalculará a posição do ativo a partir da data do evento.')) {
        todosOsAjustes = todosOsAjustes.filter(a => a.id !== ajusteId);
        salvarAjustes();
        renderizarTabelaEventosCorporativos();
    }
}
async function deletarNota(notaId) {
    if (confirm('Tem certeza que deseja excluir esta nota de negociação e todas as suas operações? A movimentação financeira correspondente no extrato da conta também será removida.')) {
        const notaParaExcluir = todasAsNotas.find(n => n.id === notaId);
        if (!notaParaExcluir) return;

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
function deletarOperacao(opId) { if(!notaAtual) return; notaAtual.operacoes = notaAtual.operacoes.filter(op => op.id !== opId); renderizarTabelaOperacoes(); atualizarTotais(); }
function deletarEventoAtivo(ajusteId) {
    if (confirm('Tem certeza que deseja excluir este evento? Esta ação recalculará a posição do ativo.')) {
        todosOsAjustes = todosOsAjustes.filter(a => a.id !== ajusteId);
        salvarAjustes();
        renderizarTelaEventosAtivos();
    }
}
async function deletarMovimentacao(id, tipoAlvo) {
    const movIndex = todasAsMovimentacoes.findIndex(m => m.id === id);
    if (movIndex === -1) return;

    const movimentacao = todasAsMovimentacoes[movIndex];
    // Tradução: Confirmação de exclusão
    let confirmMessage = 'Are you sure you want to delete this movement?';
    
    const idsParaExcluirLocalmente = new Set();
    
    idsParaExcluirLocalmente.add(movimentacao.id);

    if (movimentacao.transferenciaId) {
        // Tradução: Alerta transferência
        confirmMessage = 'This is a transfer movement. Deleting this record will also delete the corresponding record in the other account/asset. Do you want to continue?';
        
        const idPar = movimentacao.transferenciaId;
        const movimentacaoPar = todasAsMovimentacoes.find(m => m.id === idPar);
        
        if (movimentacaoPar) {
            idsParaExcluirLocalmente.add(movimentacaoPar.id);
        }
    }

    if (confirm(confirmMessage)) {
        // Remove todos os IDs locais marcados
        todasAsMovimentacoes = todasAsMovimentacoes.filter(m => !idsParaExcluirLocalmente.has(m.id));
        
        await salvarMovimentacoes();
        
        // Atualiza a tela visível
        if (telas.caixaGlobal.style.display === 'block') {
            renderizarTelaCaixaGlobal(true);
        }
    }
}
async function importarProventosCSV(event) {
    const file = event.target.files[0];
    if (!file) return;

    // --- INÍCIO DA ALTERAÇÃO (Feedback do Botão) ---
    const btnImportar = document.getElementById('btn-importar-proventos');
    const originalBtnHTML = btnImportar.innerHTML;
    btnImportar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importando...';
    btnImportar.disabled = true;
    
    // Força a UI a atualizar antes da tarefa pesada
    await new Promise(resolve => setTimeout(resolve, 0));
    // --- FIM DA ALTERAÇÃO ---

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const text = e.target.result;
            const linhas = text.split(/\r?\n/).filter(l => l.trim() !== '');
            if (linhas.length <= 1) throw new Error('Arquivo CSV vazio ou inválido.');

            const linhasDeDados = linhas.slice(1);
            let proventosImportados = 0;
            let proventosIgnorados = 0;

            linhasDeDados.forEach(linha => {
                const cols = linha.split(',').map(c => c.trim().replace(/"/g, ''));
                if (cols.length < 6) return;

                const [ticker, tipo, dataComRaw, dataPagamentoRaw, valorBrutoStr, aliquotaIRStr] = cols;
                const dataCom = normalizarDataParaInput(dataComRaw);
                const dataPagamento = normalizarDataParaInput(dataPagamentoRaw);

                if (!todosOsAtivos.some(a => a.ticker === ticker)) {
                    proventosIgnorados++;
                    console.warn(`Provento para ${ticker} ignorado: Ativo não cadastrado.`);
                    return;
                }

                const posicoesNaDataCom = gerarPosicaoDetalhada(dataCom);
                const posicaoDoAtivo = posicoesNaDataCom[ticker];
                if (!posicaoDoAtivo || posicaoDoAtivo.quantidade <= 0) {
                    proventosIgnorados++;
                    console.warn(`Provento para ${ticker} ignorado: Sem posição em carteira na data ${dataCom}.`);
                    return;
                }

                const valorBruto = parseDecimal(valorBrutoStr);
                const aliquotaIRPercent = parseDecimal(aliquotaIRStr) || 0;
                const aliquotaIR = aliquotaIRPercent / 100;
                const valorLiquido = valorBruto * (1 - aliquotaIR);

                const proventoJaExiste = todosOsProventos.some(p => 
                    p.ticker === ticker &&
                    p.tipo === tipo &&
                    p.dataCom === dataCom &&
                    p.dataPagamento === dataPagamento &&
                    Math.abs(p.valorIndividual - valorLiquido) < 0.005 
                );

                if (proventoJaExiste) {
                    proventosIgnorados++;
                    console.warn(`Provento para ${ticker} ignorado: Registro duplicado já existente.`);
                    return; 
                }

                const dadosCalculados = calcularDadosProvento(ticker, dataCom, valorLiquido);

                const novoProvento = {
                    id: Date.now() + Math.random(),
                    ticker, tipo, dataCom, dataPagamento,
                    valorIndividual: valorLiquido,
                    valorBrutoIndividual: valorBruto,
                    percentualIR: aliquotaIRPercent,
                    ...dadosCalculados
                };

                todosOsProventos.push(novoProvento);
                sincronizarProventoComTransacao(novoProvento.id);
                proventosImportados++;
            });

            if (proventosImportados > 0) {
                // --- INÍCIO DA CORREÇÃO (await) ---
                // Espera os salvamentos terminarem ANTES de sincronizar
                await salvarProventos();
                await salvarMovimentacoes();
                
                // DISPARA A SINCRONIZAÇÃO SILENCIOSA (agora com dados atualizados)
                await sincronizarTodosOsRegistros(null, true);
                // --- FIM DA CORREÇÃO (await) ---
            }

            alert(`Importação concluída!\n\n- ${proventosImportados} proventos foram importados com sucesso.\n- ${proventosIgnorados} proventos foram ignorados (por duplicidade, falta de posição ou ativo não cadastrado).`);

        } catch (error) {
            alert('Erro ao processar o arquivo CSV de proventos.\nDetalhes: ' + error.message);
        } finally {
            // --- INÍCIO DA ALTERAÇÃO (Feedback do Botão) ---
            // Reabilita o botão em todos os casos (sucesso ou falha)
            btnImportar.innerHTML = originalBtnHTML;
            btnImportar.disabled = false;
            event.target.value = ''; // Limpa o input
            // --- FIM DA ALTERAÇÃO ---
        }
    };
    reader.readAsText(file);
    // event.target.value = ''; // Movido para dentro do 'finally'
}

async function carregarSalarioMinimo() {
    if (currentUser) {
        const { doc, getDoc } = window.dbFunctions;
        const userDocRef = doc(window.db, 'carteiras', currentUser.uid);
        try {
            const docSnap = await getDoc(userDocRef);
            salarioMinimo = docSnap.exists() ? (docSnap.data().salarioMinimo || 1518.00) : 1518.00;
        } catch (error) {
            console.error("Erro ao carregar salário mínimo:", error);
            salarioMinimo = 1518.00;
        }
    } else {
        const data = localStorage.getItem('carteira_salario_minimo_offline');
        salarioMinimo = data ? parseFloat(data) : 1518.00;
    }
}
function carregarContadorAlteracoes() {
    alteracoesDesdeUltimoBackup = parseInt(localStorage.getItem('carteira_alteracoes_pendentes'), 10) || 0;
}
async function carregarLinksExternos() {
    if (currentUser) {
        const { doc, getDoc } = window.dbFunctions;
        const userDocRef = doc(window.db, 'carteiras', currentUser.uid);
        try {
            const docSnap = await getDoc(userDocRef);
            linksExternos = docSnap.exists() ? (docSnap.data().linksExternos || { acoes: '', fiis: '', etfs: '' }) : { acoes: '', fiis: '', etfs: '' };
        } catch (error) {
            console.error("Erro ao carregar links externos:", error);
            linksExternos = { acoes: '', fiis: '', etfs: '' };
        }
    } else {
        const data = localStorage.getItem('carteira_links_externos_offline');
        linksExternos = data ? JSON.parse(data) : { acoes: '', fiis: '', etfs: '' };
    }
}
async function carregarConfiguracoesGraficos() {
    const defaultConfig = { evolucao: { hidden: [] }, desempenho: { hidden: [] } };
    if (currentUser) {
        const { doc, getDoc } = window.dbFunctions;
        const userDocRef = doc(window.db, 'carteiras', currentUser.uid);
        try {
            const docSnap = await getDoc(userDocRef);
            configuracoesGraficos = docSnap.exists() ? (docSnap.data().configuracoesGraficos || defaultConfig) : defaultConfig;
        } catch (error) {
            console.error("Erro ao carregar configs de gráficos:", error);
            configuracoesGraficos = defaultConfig;
        }
    } else {
        const data = localStorage.getItem('carteira_config_graficos_offline');
        configuracoesGraficos = data ? JSON.parse(data) : defaultConfig;
    }
}
async function carregarUrlCotacoes() {
    if (currentUser) {
        const { doc, getDoc } = window.dbFunctions;
        const userDocRef = doc(window.db, 'carteiras', currentUser.uid);
        try {
            const docSnap = await getDoc(userDocRef);
            urlCotacoesCSV = docSnap.exists() ? (docSnap.data().urlCotacoesCSV || '') : '';
        } catch (error) {
            console.error("Erro ao carregar URL de cotações:", error);
            urlCotacoesCSV = '';
        }
    } else {
        urlCotacoesCSV = localStorage.getItem('carteira_url_cotacoes_csv_offline') || '';
    }
}

async function carregarConfiguracaoAutoUpdate() {
    if (currentUser) {
        const { doc, getDoc } = window.dbFunctions;
        const userDocRef = doc(window.db, 'carteiras', currentUser.uid);
        try {
            const docSnap = await getDoc(userDocRef);
            autoUpdateEnabled = docSnap.exists() ? (docSnap.data().autoUpdateEnabled === true) : false;
        } catch (error) {
            console.error("Erro ao carregar config de auto-update:", error);
            autoUpdateEnabled = false;
        }
    } else {
        const salvo = localStorage.getItem('carteira_auto_update_enabled_offline');
        autoUpdateEnabled = salvo === 'true';
    }
}
function carregarHistoricoCarteira() { // Renomeado
    const data = localStorage.getItem('carteira_historico_carteira'); // Chave renomeada
    historicoCarteira = data ? JSON.parse(data) : [];
}

// --- FUNÇÕES DE CONFIGURAÇÕES FISCAIS E RENDA FIXA ---
async function carregarConfiguracoesFiscais() {
    const defaultConfig = { aliquotaAcoes: 0.15, aliquotaFiisDt: 0.20, limiteIsencaoAcoes: 20000, tabelaRegressivaIR: { 180: 0.225, 360: 0.200, 720: 0.175, 9999: 0.150 } };
    if (currentUser) {
        const { doc, getDoc } = window.dbFunctions;
        const userDocRef = doc(window.db, 'carteiras', currentUser.uid);
        try {
            const docSnap = await getDoc(userDocRef);
            if (docSnap.exists() && docSnap.data().configuracoesFiscais) {
                configuracoesFiscais = { ...defaultConfig, ...docSnap.data().configuracoesFiscais };
            } else {
                configuracoesFiscais = defaultConfig;
            }
        } catch (error) {
            console.error("Erro ao carregar configs fiscais:", error);
            configuracoesFiscais = defaultConfig;
        }
    } else {
        const data = localStorage.getItem('carteira_config_fiscais_offline');
        configuracoesFiscais = data ? { ...defaultConfig, ...JSON.parse(data) } : defaultConfig;
    }
}
async function carregarAjustesIR() {
    if (currentUser) {
        const { doc, getDoc } = window.dbFunctions;
        const userDocRef = doc(window.db, 'carteiras', currentUser.uid);
        try {
            const docSnap = await getDoc(userDocRef);
            if (docSnap.exists()) {
                todosOsAjustesIR = docSnap.data().ajustesIR || [];
            } else {
                todosOsAjustesIR = [];
            }
        } catch (error) {
            console.error("Erro ao carregar ajustes de IR do Firestore:", error);
            todosOsAjustesIR = [];
        }
    } else {
        const data = localStorage.getItem('carteira_ajustes_ir_offline');
        todosOsAjustesIR = data ? JSON.parse(data) : [];
    }
}
async function carregarUserName() {
    if (currentUser) {
        const { doc, getDoc } = window.dbFunctions;
        const userDocRef = doc(window.db, 'carteiras', currentUser.uid);
        try {
            const docSnap = await getDoc(userDocRef);
            userName = docSnap.exists() ? (docSnap.data().userName || '') : '';
        } catch (error) {
            console.error("Erro ao carregar nome do usuário:", error);
            userName = '';
        }
    } else {
        userName = localStorage.getItem('carteira_user_name_offline') || '';
    }
}
async function carregarDadosComparacao() {
    if (currentUser) {
        const { doc, getDoc } = window.dbFunctions;
        const userDocRef = doc(window.db, 'carteiras', currentUser.uid);
        try {
            const docSnap = await getDoc(userDocRef);
            dadosComparacao = docSnap.exists() ? (docSnap.data().dadosComparacao || null) : null;
        } catch (error) {
            console.error("Erro ao carregar dados de comparação:", error);
            dadosComparacao = null;
        }
    } else {
        const data = localStorage.getItem('carteira_dados_comparacao_offline');
        dadosComparacao = data ? JSON.parse(data) : null;
    }
}
async function carregarDadosSimulacaoNegociar() {
    if (currentUser) {
        const { doc, getDoc } = window.dbFunctions;
        const userDocRef = doc(window.db, 'carteiras', currentUser.uid);
        try {
            const docSnap = await getDoc(userDocRef);
            dadosSimulacaoNegociar = docSnap.exists() ? (docSnap.data().dadosSimulacaoNegociar || { fiis: {}, acoes: {}, aporteTotal: '' }) : { fiis: {}, acoes: {}, aporteTotal: '' };
        } catch (error) {
            console.error("Erro ao carregar dados de simulação:", error);
            dadosSimulacaoNegociar = { fiis: {}, acoes: {}, aporteTotal: '' };
        }
    } else {
        const data = localStorage.getItem('carteira_simulacao_negociar_offline');
        dadosSimulacaoNegociar = data ? JSON.parse(data) : { fiis: {}, acoes: {}, aporteTotal: '' };
    }
}
async function carregarDadosAlocacao() {
    if (currentUser) {
        const { doc, getDoc } = window.dbFunctions;
        const userDocRef = doc(window.db, 'carteiras', currentUser.uid);
        try {
            const docSnap = await getDoc(userDocRef);
            if (docSnap.exists()) {
                const userData = docSnap.data();
                dadosAlocacao = userData.dadosAlocacao || { categorias: {}, ativos: {} };
            } else {
                dadosAlocacao = { categorias: {}, ativos: {} };
            }
        } catch (error) {
            console.error("Erro ao carregar dados de alocação do Firestore:", error);
            dadosAlocacao = { categorias: {}, ativos: {} };
        }
    } else {
        const data = localStorage.getItem('carteira_dados_alocacao_offline');
        dadosAlocacao = data ? JSON.parse(data) : { categorias: {}, ativos: {} };
    }

    // Garante valor padrão para o modo de rebalanceamento se não existir
    if (!dadosAlocacao.modoRebalanceamento) {
        dadosAlocacao.modoRebalanceamento = 'categoria';
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
async function carregarTodosOsDados() {
    console.log("Carregando dados do armazenamento local...");
    
    // Função auxiliar robusta para ler JSON
    const carregarItem = (chave, valorPadrao = []) => {
        const dados = localStorage.getItem(`carteira_${chave}_offline`);
        if (dados) {
            try {
                return JSON.parse(dados);
            } catch (e) {
                console.warn(`Erro ao ler ${chave}, retornando padrão.`);
                return valorPadrao;
            }
        }
        return valorPadrao;
    };

    // Função auxiliar robusta para ler Strings (remove aspas extras do JSON)
    const carregarString = (chave, valorPadrao = '') => {
        const dados = localStorage.getItem(`carteira_${chave}_offline`);
        if (dados) {
            try {
                // Tenta parsear caso tenha sido salvo com JSON.stringify (com aspas)
                return JSON.parse(dados);
            } catch (e) {
                // Se falhar, usa o dado bruto (sem aspas ou formato antigo)
                return dados;
            }
        }
        return valorPadrao;
    };

    // Carregamento das Listas
    todosOsAtivos = carregarItem('ativos');
    todasAsContas = carregarItem('contas');
    todosOsFeriados = carregarItem('feriados');
    todosOsAjustes = carregarItem('ajustes');
    posicaoInicial = carregarItem('posicoes');
    todasAsNotas = carregarItem('notas');
    todosOsProventos = carregarItem('proventos');
    todasAsMovimentacoes = carregarItem('movimentacoes');
    todosOsAtivosRF = carregarItem('todos_os_ativos_r_f');
    todosOsRendimentosRealizadosRF = carregarItem('todos_os_rendimentos_realizados_r_f');
    todosOsRendimentosRFNaoRealizados = carregarItem('todos_os_rendimentos_r_f_nao_realizados');
    
    // Carregamento de Configurações
    dadosMoedas = carregarItem('dados_moedas', { cotacoes: {} });
    todosOsAtivosMoedas = carregarItem('todos_os_ativos_moedas');
    todasAsTransacoesRecorrentes = carregarItem('todas_as_transacoes_recorrentes');
    todasAsMetas = carregarItem('metas');
    todosOsAjustesIR = carregarItem('ajustes_ir');
    dadosAlocacao = carregarItem('dados_alocacao', { categorias: {}, ativos: {} });
    historicoCarteira = carregarItem('historico_carteira');
    
    // --- LEITURA BLINDADA DAS CONFIGURAÇÕES ---
    // Lê explicitamente as chaves que o diagnóstico confirmou estarem gravadas
    urlCotacoesCSV = carregarString('url_cotacoes_csv', '');
    
    configuracoesFiscais = carregarItem('configuracoes_fiscais', { 
        aliquotaAcoes: 0.15, 
        aliquotaFiisDt: 0.20, 
        limiteIsencaoAcoes: 20000, 
        tabelaRegressivaIR: { 180: 0.225, 360: 0.200, 720: 0.175, 9999: 0.150 } 
    });
    
    linksExternos = carregarItem('links_externos', { acoes: '', fiis: '', etfs: '' });
    
    // Auto Update: Lê o booleano corretamente (o diagnóstico mostrou que está como "true" string)
    const autoUpdateRaw = localStorage.getItem('carteira_auto_update_enabled_offline');
    try {
        autoUpdateEnabled = JSON.parse(autoUpdateRaw) === true;
    } catch (e) {
        autoUpdateEnabled = autoUpdateRaw === 'true';
    }
    // ------------------------------------------
    
    dadosSimulacaoNegociar = carregarItem('dados_simulacao_negociar', { fiis: {}, acoes: {}, aporteTotal: '' });
    userName = carregarString('user_name', '');
    dadosComparacao = carregarItem('dados_comparacao', null);
    configuracoesGraficos = carregarItem('configuracoes_graficos', { evolucao: { hidden: [] }, desempenho: { hidden: [] } });
    salarioMinimo = parseFloat(localStorage.getItem('carteira_salario_minimo_offline')) || 1518.00;
    timestampUltimoBackup = localStorage.getItem('carteira_timestamp_ultimo_backup_offline') || null;
    
    dataInicioIntegracaoFinancas = null;

    // Normalizações de data
    todasAsContas.forEach(r => r.dataSaldoInicial = normalizarDataParaInput(r.dataSaldoInicial));
    todosOsFeriados.forEach(r => r.data = normalizarDataParaInput(r.data));
    todosOsAjustes.forEach(r => r.data = normalizarDataParaInput(r.data));
    posicaoInicial.forEach(r => r.data = normalizarDataParaInput(r.data));
    todasAsNotas.forEach(r => r.data = normalizarDataParaInput(r.data));
    todosOsProventos.forEach(r => {
        r.dataCom = normalizarDataParaInput(r.dataCom);
        r.dataPagamento = normalizarDataParaInput(r.dataPagamento);
    });
    todasAsMovimentacoes.forEach(r => r.data = normalizarDataParaInput(r.data));
    
    if (!dadosAlocacao.modoRebalanceamento) {
        dadosAlocacao.modoRebalanceamento = 'categoria';
    }

    carregarDadosDeMercado();
    verificarEMigrarDadosNaInicializacao();
}

function carregarDadosDoLocalStorage() {
    const carregarItem = (chave, valorPadrao = []) => {
        const dados = localStorage.getItem(`carteira_${chave}_offline`);
        try {
            return dados ? JSON.parse(dados) : valorPadrao;
        } catch (e) {
            console.warn(`Erro ao fazer parse de ${chave}:`, e);
            return valorPadrao;
        }
    };

    todosOsAtivos = carregarItem('ativos');
    todasAsContas = carregarItem('contas');
    todosOsFeriados = carregarItem('feriados');
    todosOsAjustes = carregarItem('ajustes');
    posicaoInicial = carregarItem('posicoes');
    todasAsNotas = carregarItem('notas');
    todosOsProventos = carregarItem('proventos');
    todasAsMovimentacoes = carregarItem('movimentacoes');
    todosOsAtivosRF = carregarItem('todos_os_ativos_r_f');
    todosOsRendimentosRealizadosRF = carregarItem('todos_os_rendimentos_realizados_r_f');
    todosOsRendimentosRFNaoRealizados = carregarItem('todos_os_rendimentos_r_f_nao_realizados');
    dadosMoedas = carregarItem('dados_moedas', { cotacoes: {} });
    todosOsAtivosMoedas = carregarItem('todos_os_ativos_moedas');
    todasAsTransacoesRecorrentes = carregarItem('todas_as_transacoes_recorrentes');
    todasAsMetas = carregarItem('metas');
    todosOsAjustesIR = carregarItem('ajustes_ir');
    dadosAlocacao = carregarItem('dados_alocacao', { categorias: {}, ativos: {} });
    historicoCarteira = carregarItem('historico_carteira');
    
    // CORREÇÃO: Lê a chave 'url_cotacoes_csv' usando carregarItem (com JSON.parse)
    // Isso garante que as aspas extras salvas pelo JSON.stringify sejam removidas.
    urlCotacoesCSV = carregarItem('url_cotacoes_csv', '');

    // CORREÇÃO: Lê a chave 'configuracoes_fiscais'
    configuracoesFiscais = carregarItem('configuracoes_fiscais', { aliquotaAcoes: 0.15, aliquotaFiisDt: 0.20, limiteIsencaoAcoes: 20000, tabelaRegressivaIR: { 180: 0.225, 360: 0.200, 720: 0.175, 9999: 0.150 } });
    
    dadosSimulacaoNegociar = carregarItem('dados_simulacao_negociar', { fiis: {}, acoes: {}, aporteTotal: '' });
    userName = localStorage.getItem('carteira_user_name_offline') || 'Visitante Demo'; // Nome simples sem JSON
    dadosComparacao = carregarItem('dados_comparacao', null);
    configuracoesGraficos = carregarItem('configuracoes_graficos', { evolucao: { hidden: [] }, desempenho: { hidden: [] } });
    linksExternos = carregarItem('links_externos', { acoes: '', fiis: '', etfs: '' });
    salarioMinimo = parseFloat(localStorage.getItem('carteira_salario_minimo_offline')) || 1518.00;
    autoUpdateEnabled = localStorage.getItem('carteira_auto_update_enabled_offline') === 'true';
    timestampUltimoBackup = localStorage.getItem('carteira_timestamp_ultimo_backup_offline') || null;
    
    dataInicioIntegracaoFinancas = null;

    // Normalizações de data
    todasAsContas.forEach(r => r.dataSaldoInicial = normalizarDataParaInput(r.dataSaldoInicial));
    todosOsFeriados.forEach(r => r.data = normalizarDataParaInput(r.data));
    todosOsAjustes.forEach(r => r.data = normalizarDataParaInput(r.data));
    posicaoInicial.forEach(r => r.data = normalizarDataParaInput(r.data));
    todasAsNotas.forEach(r => r.data = normalizarDataParaInput(r.data));
    todosOsProventos.forEach(r => {
        r.dataCom = normalizarDataParaInput(r.dataCom);
        r.dataPagamento = normalizarDataParaInput(r.dataPagamento);
    });
    todasAsMovimentacoes.forEach(r => r.data = normalizarDataParaInput(r.data));
    
    if (!dadosAlocacao.modoRebalanceamento) {
        dadosAlocacao.modoRebalanceamento = 'categoria';
    }

    carregarDadosDeMercado(); 
}
function limparDadosLocais() {
    console.log("Limpando dados locais (variáveis e localStorage)...");
    // Reseta todas as variáveis de estado para o padrão inicial
    todosOsAtivos = []; todasAsNotas = []; posicaoInicial = []; todosOsAjustes = [];
    todosOsProventos = []; todasAsContas = []; todosOsFeriados = []; todosOsAjustesIR = [];
    todosOsAtivosRF = []; todosOsRendimentosRealizadosRF = []; todosOsRendimentosRFNaoRealizados = [];
    dadosMoedas = { cotacoes: {} }; todosOsAtivosMoedas = []; todasAsMovimentacoes = [];
    todasAsTransacoesRecorrentes = []; dadosAlocacao = { categorias: {}, ativos: {} };
    dadosSimulacaoNegociar = { fiis: {}, acoes: {}, aporteTotal: '' };
    historicoCarteira = []; todasAsMetas = [];
    userName = '';

    // Remove todos os itens do localStorage relacionados à carteira
    Object.keys(localStorage)
        .filter(key => key.startsWith('carteira_'))
        .forEach(key => localStorage.removeItem(key));

    alteracoesDesdeUltimoBackup = 0; // Reseta o contador de alterações
}
function apagarTodosOsDados() {
    // Tradução: Aviso de perigo extremo
    if (confirm('WARNING: You are about to wipe ALL application data. This action is IRREVERSIBLE.')) {
        // Tradução: WIPE ALL
        if (prompt('To confirm, type "WIPE ALL" in the box below:') === 'WIPE ALL') {
            localStorage.setItem('carteira_sync_needed', 'false');
            localStorage.clear();
            alert('All data has been wiped. The application will reload.');
            location.reload();
        } else {
            alert('Confirmation failed. No action taken.');
        }
    }
}
async function sincronizarTodosOsRegistros(callback, silencioso = false) {
    if (!silencioso) {
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) loadingOverlay.style.display = 'flex';
    }

    console.log("Starting recalculation and internal data sanitation...");

    try {
        const totalRecorrentesAntes = todasAsTransacoesRecorrentes.length;
        todasAsTransacoesRecorrentes = todasAsTransacoesRecorrentes.filter(regra => {
            if (regra.targetType === 'conta') return todasAsContas.some(conta => String(conta.id) === String(regra.targetId));
            if (regra.targetType === 'moeda') return todosOsAtivosMoedas.some(moeda => String(moeda.id) === String(regra.targetId));
            return false;
        });
        const recorrentesRemovidas = totalRecorrentesAntes - todasAsTransacoesRecorrentes.length;

        let contasPixLimpas = 0;
        todasAsContas.forEach(conta => {
            if (conta.tipo === 'Conta Investimento' && conta.pix) {
                conta.pix = ''; 
                contasPixLimpas++;
            }
        });

        todasAsMovimentacoes = todasAsMovimentacoes.filter(t => t.source !== 'nota' && t.source !== 'provento');

        for (const provento of todosOsProventos) {
            if (!provento.pagamentoRedirecionadoManualmente) {
                const dadosRecalculados = calcularDadosProvento(provento.ticker, provento.dataCom, provento.valorIndividual);
                Object.assign(provento, dadosRecalculados);
            }
            await sincronizarProventoComTransacao(provento.id);
        }

        for (const nota of todasAsNotas) {
            await sincronizarNotaComTransacao(nota.id);
        }

        const numeroAtivosAntes = todosOsAtivos.length;
        buscarEcadastrarAtivosAusentes(true); 
        const novosAtivosEncontrados = todosOsAtivos.length - numeroAtivosAntes;
        
        await salvarDadosNaFonte({
            todasAsTransacoesRecorrentes, 
            contas: todasAsContas, 
            proventos: todosOsProventos, 
            movimentacoes: todasAsMovimentacoes, 
            todosOsAtivos
        });

        console.log("Internal sanitation completed.");

        if (!silencioso) {
            // Tradução: Relatório de Manutenção
            let relatorio = `Data maintenance completed successfully!\n\n` +
                            `- Income values recalculated based on history.\n` +
                            `- Financial transactions from notes and income regenerated.\n` +
                            `- ${recorrentesRemovidas} invalid recurring rule(s) removed.\n` +
                            `- ${novosAtivosEncontrados} new asset(s) identified and registered.`;

            alert(relatorio);
            
            const telaVisivel = document.querySelector('.main-content > div[style*="display: block"]');
            if(telaVisivel && telaVisivel.id === 'tela-configuracoes') {
                verificarInconsistencias();
            }
        }

        if (typeof callback === 'function') {
            callback();
        }

    } catch (error) {
        console.error("Error during recalculation:", error);
        if (!silencioso) alert("An error occurred while processing data. Check the console.");
    } finally {
        if (!silencioso) {
            const loadingOverlay = document.getElementById('loading-overlay');
            if (loadingOverlay) loadingOverlay.style.display = 'none';
        }
    }
}
function fazerBackup() {
    // Sincroniza antes para garantir dados frescos na memória
    salvarSnapshotCarteira(true);
    
    const hoje = new Date();
    const dia = String(hoje.getDate()).padStart(2, '0');
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const ano = hoje.getFullYear();
    const hora = String(hoje.getHours()).padStart(2, '0');
    const minuto = String(hoje.getMinutes()).padStart(2, '0');
    const segundo = String(hoje.getSeconds()).padStart(2, '0');

    const nomeUsuario = userName.trim() ? userName.trim().toUpperCase() : 'BACKUP';
    const nomeArquivo = `${nomeUsuario}_${ano}${mes}${dia}_${hora}${minuto}${segundo}.json`;

    // Monta o objeto com segurança, garantindo que variáveis existam
    const backupData = {
        version: APP_VERSION,
        timestampUltimoBackup: timestampUltimoBackup,
        ativos: todosOsAtivos,
        notas: todasAsNotas,
        posicoes: posicaoInicial,
        ajustes: todosOsAjustes,
        proventos: todosOsProventos,
        contas: todasAsContas,
        feriados: todosOsFeriados,
        movimentacoes: todasAsMovimentacoes,
        todosOsAtivosRF: todosOsAtivosRF,
        todosOsRendimentosRealizadosRF: todosOsRendimentosRealizadosRF,
        todosOsRendimentosRFNaoRealizados: todosOsRendimentosRFNaoRealizados,
        dadosMoedas: dadosMoedas,
        todosOsAtivosMoedas: todosOsAtivosMoedas,
        dadosAlocacao: dadosAlocacao,
        mercado: dadosDeMercado, // Salva as cotações atuais
        configFiscais: configuracoesFiscais,
        ajustesIR: todosOsAjustesIR,
        urlCotacoesCSV: urlCotacoesCSV,
        historicoCarteira: historicoCarteira,
        dadosSimulacaoNegociar: dadosSimulacaoNegociar,
        todasAsTransacoesRecorrentes: todasAsTransacoesRecorrentes,
        userName: userName,
        dadosComparacao: dadosComparacao,
        configuracoesGraficos: configuracoesGraficos,
        linksExternos: linksExternos,
        metas: todasAsMetas,
        salarioMinimo: salarioMinimo,
        autoUpdateEnabled: typeof autoUpdateEnabled !== 'undefined' ? autoUpdateEnabled : false
    };

    const jsonString = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    alteracoesDesdeUltimoBackup = 0;
    localStorage.setItem('carteira_alteracoes_pendentes', '0');
    salvarTimestampBackup();

    const alertElement = document.getElementById('backup-alert-footer');
    if (alertElement) {
        alertElement.remove();
    }
    verificarStatusBackup();
}

async function restaurarBackup(event) {
    const file = event.target.files[0];
    if (!file) return;

    const loadingOverlay = document.getElementById('loading-overlay');
    const reader = new FileReader();

    reader.onload = async (e) => {
        if (loadingOverlay) loadingOverlay.style.display = 'flex';
        try {
            const rawBackupData = JSON.parse(e.target.result);

            if (!rawBackupData.ativos || (!rawBackupData.notas && !rawBackupData.posicoes)) {
                // Tradução: Formato inválido
                throw new Error('Invalid backup file format.');
            }

            const urlFinal = rawBackupData.urlCotacoesCSV || rawBackupData.url_cotacoes_csv || '';
            const configFinal = rawBackupData.configFiscais || rawBackupData.configuracoesFiscais || { 
                aliquotaAcoes: 0.15, 
                aliquotaFiisDt: 0.20, 
                limiteIsencaoAcoes: 20000, 
                tabelaRegressivaIR: { 180: 0.225, 360: 0.200, 720: 0.175, 9999: 0.150 } 
            };
            const linksFinais = rawBackupData.linksExternos || rawBackupData.links_externos || { acoes: '', fiis: '', etfs: '' };
            
            let autoUpdateFinal = false;
            if (typeof rawBackupData.autoUpdateEnabled !== 'undefined') autoUpdateFinal = rawBackupData.autoUpdateEnabled;
            else if (typeof rawBackupData.auto_update_enabled !== 'undefined') autoUpdateFinal = rawBackupData.auto_update_enabled;

            const backupData = migrarDadosDoBackup(rawBackupData);

            // Tradução: Confirmação de restauração
            if (confirm('WARNING! This will replace ALL current data with the data from the backup file. This action is irreversible. Do you want to continue?')) {

                todosOsAtivos = backupData.ativos || [];
                todasAsNotas = backupData.notas || [];
                posicaoInicial = backupData.posicoes || [];
                todosOsAjustes = backupData.ajustes || [];
                todosOsProventos = backupData.proventos || [];
                todasAsContas = backupData.contas || [];
                todosOsFeriados = backupData.feriados || [];
                todasAsMovimentacoes = backupData.movimentacoes || [];
                todosOsAtivosRF = backupData.todosOsAtivosRF || [];
                todosOsRendimentosRealizadosRF = backupData.todosOsRendimentosRealizadosRF || [];
                todosOsRendimentosRFNaoRealizados = backupData.todosOsRendimentosRFNaoRealizados || [];
                dadosMoedas = backupData.dadosMoedas || { cotacoes: {} };
                todosOsAtivosMoedas = backupData.todosOsAtivosMoedas || [];
                dadosAlocacao = backupData.dadosAlocacao || { categorias: {}, ativos: {} };
                todosOsAjustesIR = backupData.ajustesIR || [];
                historicoCarteira = backupData.historicoCarteira || [];
                todasAsTransacoesRecorrentes = backupData.todasAsTransacoesRecorrentes || [];
                todasAsMetas = backupData.metas || [];
                userName = backupData.userName || '';
                dadosComparacao = backupData.dadosComparacao || null;
                configuracoesGraficos = backupData.configuracoesGraficos || { evolucao: { hidden: [] }, desempenho: { hidden: [] } };
                salarioMinimo = backupData.salarioMinimo || 1518.00;
                dadosSimulacaoNegociar = backupData.dadosSimulacaoNegociar || { fiis: {}, acoes: {}, aporteTotal: '' };
                timestampUltimoBackup = backupData.timestampUltimoBackup || null;
                
                dadosDeMercado = backupData.mercado || { timestamp: null, cotacoes: {}, ifix: 0, ibov: 0 };

                urlCotacoesCSV = urlFinal;
                configuracoesFiscais = configFinal;
                linksExternos = linksFinais;
                autoUpdateEnabled = autoUpdateFinal;
                
                try {
                    localStorage.setItem('carteira_url_cotacoes_csv_offline', JSON.stringify(urlFinal));
                    localStorage.setItem('carteira_configuracoes_fiscais_offline', JSON.stringify(configFinal));
                    localStorage.setItem('carteira_links_externos_offline', JSON.stringify(linksFinais));
                    localStorage.setItem('carteira_auto_update_enabled_offline', JSON.stringify(autoUpdateFinal));
                    localStorage.setItem('carteira_dados_mercado', JSON.stringify(dadosDeMercado));
                } catch (e) {
                    console.error("Error saving critical settings:", e);
                }

                const dadosParaSalvar = {
                    ativos: todosOsAtivos, 
                    notas: todasAsNotas, 
                    posicoes: posicaoInicial, 
                    ajustes: todosOsAjustes,
                    proventos: todosOsProventos, 
                    contas: todasAsContas, 
                    feriados: todosOsFeriados,
                    movimentacoes: todasAsMovimentacoes, 
                    todos_os_ativos_r_f: todosOsAtivosRF, 
                    todos_os_rendimentos_realizados_r_f: todosOsRendimentosRealizadosRF,
                    todos_os_rendimentos_r_f_nao_realizados: todosOsRendimentosRFNaoRealizados,
                    dados_moedas: dadosMoedas,
                    todos_os_ativos_moedas: todosOsAtivosMoedas,
                    dados_alocacao: dadosAlocacao,
                    ajustes_ir: todosOsAjustesIR, 
                    historico_carteira: historicoCarteira,
                    todas_as_transacoes_recorrentes: todasAsTransacoesRecorrentes,
                    metas: todasAsMetas,
                    user_name: userName, 
                    dados_comparacao: dadosComparacao, 
                    configuracoes_graficos: configuracoesGraficos,
                    salario_minimo: salarioMinimo, 
                    dados_simulacao_negociar: dadosSimulacaoNegociar,
                    timestamp_ultimo_backup: timestampUltimoBackup
                };

                await salvarDadosNaFonte(dadosParaSalvar);

                alteracoesDesdeUltimoBackup = 0;
                localStorage.setItem('carteira_alteracoes_pendentes', '0');

                verificarStatusBackup();

                // Tradução: Sucesso
                alert('Data restored successfully! The application will reload.');
                location.reload();
            } else {
                if (loadingOverlay) loadingOverlay.style.display = 'none';
            }
        } catch (error) {
            if (loadingOverlay) loadingOverlay.style.display = 'none';
            console.error(error);
            // Tradução: Erro
            alert('Error reading backup file: ' + error.message);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}


function verificarEMigrarDadosNaInicializacao() {
    let dadosForamMigrados = false;
    if (todosOsAtivos && todosOsAtivos.length > 0) {
        todosOsAtivos.forEach(ativo => {
            if (typeof ativo.statusAporte === 'undefined') {
                ativo.statusAporte = 'Ativo'; // Define 'Ativo' como padrão
                dadosForamMigrados = true;
            }
        });
    }

    if (dadosForamMigrados) {
        console.log("MIGRAÇÃO DE DADOS: A propriedade 'statusAporte' foi adicionada aos ativos existentes.");
        salvarAtivos(); // Salva os dados corrigidos de volta no localStorage
    }
}

