function exportarProventosCSV() {
    const proventosParaExportar = obterProventosFiltrados();

    if (proventosParaExportar.length === 0) {
        alert("Nenhum provento para exportar com os filtros atuais.");
        return;
    }

    const escapeCSV = (value) => {
        const str = String(value || '');
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };

    const headers = [
        'Ativo', 'Tipo', 'DataCOM', 'DataPagamento', 'ValorBrutoUnitario', 'AliquotaIR'
    ];
    let csvRows = [headers.join(',')];

    proventosParaExportar.forEach(p => {
        let aliquota, valorBruto;

        if (p.valorBrutoIndividual !== undefined && p.percentualIR !== undefined) {
            valorBruto = p.valorBrutoIndividual;
            aliquota = p.percentualIR;
        } else {
            aliquota = 0;
            valorBruto = p.valorIndividual; 
            if (p.tipo === 'JCP') {
                 aliquota = 15;
                 valorBruto = p.valorIndividual / (1 - 0.15);
            }
        }
        
        const row = [
            p.ticker, p.tipo, p.dataCom, p.dataPagamento,
            valorBruto.toFixed(8),
            aliquota
        ];
        csvRows.push(row.map(escapeCSV).join(','));
    });

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const nomeArquivo = `proventos_export_${new Date().toISOString().split('T')[0]}.csv`;
    
    link.setAttribute("href", url);
    link.setAttribute("download", nomeArquivo);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
function exportarResumoCarteira() {
    const hoje = new Date().toISOString().split('T')[0];
    const posicoesRV = gerarPosicaoDetalhada(hoje);
    const todosOsEventosCaixa = obterTodosOsEventosDeCaixa();

    let saldoTotalContas = 0;
    todasAsContas.forEach(conta => {
        saldoTotalContas += calcularSaldoEmData(conta, hoje);
    });

    let valorTotalMoedas = 0;
    todosOsAtivosMoedas.forEach(ativo => {
        const transacoesDoAtivo = todosOsEventosCaixa.filter(e =>
            e.tipo === 'moeda' &&
            String(e.idAlvo) === String(ativo.id) &&
            e.source !== 'recorrente_futura' &&
            e.data <= hoje
        );
        const saldoAtivo = transacoesDoAtivo.reduce((soma, t) => soma + arredondarMoeda(t.valor), ativo.saldoInicial);
        valorTotalMoedas += saldoAtivo * (dadosMoedas.cotacoes[ativo.moeda] || 0);
    });

    const resumoClasses = { 'Ações': 0, 'FIIs': 0, 'ETFs': 0, 'Renda Fixa': 0 };
    for (const ticker in posicoesRV) {
        const ativoInfo = todosOsAtivos.find(a => a.ticker === ticker);
        const tipoMapeado = ativoInfo ? (ativoInfo.tipo === 'Ação' ? 'Ações' : ativoInfo.tipo === 'FII' ? 'FIIs' : 'ETFs') : null;
        if (tipoMapeado && resumoClasses.hasOwnProperty(tipoMapeado)) {
            const posicao = posicoesRV[ticker];
            const cotacao = dadosDeMercado.cotacoes[ticker];
            if (posicao.quantidade > 0) {
                resumoClasses[tipoMapeado] += (cotacao && cotacao.valor > 0) ? (posicao.quantidade * cotacao.valor) : (posicao.quantidade * posicao.precoMedio);
            }
        }
    }

    todosOsAtivosRF.forEach(ativo => {
        if ((ativo.descricao || '').toLowerCase().includes('(inativa)') || (ativo.descricao || '').toLowerCase().includes('inactive')) {
            return;
        }
        resumoClasses['Renda Fixa'] += calcularSaldosRFEmData(ativo, hoje).saldoLiquido;
    });
    
    const projecaoProventos = calcularProjecaoProventosNegociacao();
    const proventosTotal = projecaoProventos.acoes + projecaoProventos.fiis;
    const valorCarteiraInvestimentos = Object.values(resumoClasses).reduce((s, v) => s + v, 0);
    const totalProventosProvisionados = calcularTotalProventosProvisionados();
    const patrimonioTotal = valorCarteiraInvestimentos + saldoTotalContas + valorTotalMoedas + totalProventosProvisionados;

    const linhasCsv = [
        ['Metrica', 'Valor'],
        ['nomeUsuario', userName],
        ['dataExportacao', hoje],
        ['patrimonioTotal', patrimonioTotal],
        ['carteiraInvestimentos', valorCarteiraInvestimentos],
        ['valorAcoes', resumoClasses['Ações']],
        ['valorFIIs', resumoClasses['FIIs']],
        ['valorETFs', resumoClasses['ETFs']],
        ['valorRendaFixa', resumoClasses['Renda Fixa']],
        ['proventosAcoes', projecaoProventos.acoes],
        ['proventosFIIs', projecaoProventos.fiis],
        ['proventosETFs', 0],
        ['proventosTotal', proventosTotal],
        ['saldoContas', saldoTotalContas],
        ['saldoMoedas', valorTotalMoedas],
        ['proventosProvisionados', totalProventosProvisionados]
    ];

    const csvContent = "data:text/csv;charset=utf-8," 
        + linhasCsv.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    const nomeArquivo = `portfolio_summary_${userName.replace(/\s/g, '_') || 'export'}_${hoje}.csv`;
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", nomeArquivo);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    alert('Portfolio summary exported as CSV successfully!');
}
function importarResumoCarteira(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const backupData = JSON.parse(e.target.result);

            if (!backupData.version || !backupData.ativos) {
                throw new Error('The selected file does not appear to be a valid backup.');
            }

            const resumoCalculado = calcularResumoDeBackup(backupData);
            
            dadosComparacao = resumoCalculado;
            salvarDadosComparacao();
            renderizarDashboard();
            alert(`Portfolio summary for "${resumoCalculado.nomeUsuario}" imported and calculated successfully!`);

        } catch (error) {
            alert('Error reading the backup file. It might be corrupted or in an invalid format.\nDetails: ' + error.message);
        }
    };
    reader.readAsText(file);
    event.target.value = ''; 
}
function exportarCadastrosCSV() {
    const escapeCSV = (value) => {
        if (value === null || typeof value === 'undefined') {
            return '';
        }
        let str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            str = str.replace(/"/g, '""');
            return `"${str}"`;
        }
        return str;
    };

    const headers = [
        'TipoCadastro', 'ID', 'Campo_A', 'Campo_B', 'Campo_C', 
        'Campo_D', 'Campo_E', 'Campo_F', 'Campo_G', 'Campo_H'
    ];
    let csvRows = [headers.join(',')];

    todosOsAtivos.forEach(a => {
        const row = [
            'ATIVO_RV', a.id, a.ticker, a.tipo, a.nomePregao,
            a.nome, a.cnpj, a.tipoAcao, a.adminNome, a.adminCnpj
        ];
        csvRows.push(row.map(escapeCSV).join(','));
    });

    todasAsContas.forEach(c => {
        // --- INÍCIO DA ALTERAÇÃO ---
        // Garantimos que o saldo inicial também seja formatado com ponto.
        const row = [
            'CONTA', c.id, c.banco, c.tipo, c.numeroBanco,
            c.agencia, c.numero, c.pix, (c.saldoInicial || 0).toFixed(2), c.dataSaldoInicial
        ];
        // --- FIM DA ALTERAÇÃO ---
        csvRows.push(row.map(escapeCSV).join(','));
    });

    todosOsFeriados.forEach(f => {
        const row = ['FERIADO', f.id, f.data, f.descricao];
        csvRows.push(row.map(escapeCSV).join(','));
    });

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });

    const hoje = new Date();
    const nomeArquivo = `cadastros_export_${hoje.toISOString().split('T')[0]}.csv`;

    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", nomeArquivo);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    alert('Exportação dos cadastros concluída!');
}
function importarCadastrosCSV(event) {
    const file = event.target.files[0];
    if (!file) return;

    // --- PERGUNTA AO USUÁRIO QUAL AÇÃO REALIZAR ---
    const escolha = prompt(
        "Qual tipo de importação você deseja fazer?\n\n" +
        "Digite '1' para ATUALIZAR ATIVOS:\n" +
        "   - Atualiza seus ativos existentes com os dados do arquivo.\n" +
        "   - Adiciona novos ativos que você não possui.\n" +
        "   - SUAS CONTAS E FERIADOS NÃO SERÃO ALTERADOS.\n\n" +
        "Digite '2' para SUBSTITUIÇÃO COMPLETA:\n" +
        "   - APAGA TUDO (Ativos, Contas e Feriados) e substitui pelos dados do arquivo. USE COM CUIDADO."
    );

    if (escolha !== '1' && escolha !== '2') {
        alert("Operação cancelada. Nenhuma opção válida foi selecionada.");
        event.target.value = ''; // Limpa o input
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const text = e.target.result;
            const linhas = text.split(/\r?\n/).filter(l => l.trim() !== '');
            if (linhas.length <= 1) throw new Error('Arquivo CSV vazio ou inválido.');
            
            const linhasDeDados = linhas.slice(1);

            // --- LÓGICA BASEADA NA ESCOLHA ---

            if (escolha === '1') {
                // --- OPÇÃO 1: ATUALIZAR E ADICIONAR ATIVOS ---
                const ativosAtuaisMap = new Map(todosOsAtivos.map(a => [a.ticker, a]));
                let ativosAtualizados = 0;
                let ativosAdicionados = 0;

                linhasDeDados.forEach(linha => {
                    const cols = linha.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g).map(c => c.trim().replace(/"/g, ''));
                    if (cols[0] === 'ATIVO_RV') {
                        const ticker = cols[2];
                        if (!ticker) return;

                        const ativoDoArquivo = {
                            id: parseFloat(cols[1]), ticker: ticker, tipo: cols[3], nomePregao: cols[4],
                            nome: cols[5], cnpj: cols[6], tipoAcao: cols[7], adminNome: cols[8], adminCnpj: cols[9]
                        };

                        if (ativosAtuaisMap.has(ticker)) {
                            const ativoExistente = ativosAtuaisMap.get(ticker);
                            Object.assign(ativoExistente, { tipo: ativoDoArquivo.tipo, nomePregao: ativoDoArquivo.nomePregao, nome: ativoDoArquivo.nome, cnpj: ativoDoArquivo.cnpj, tipoAcao: ativoDoArquivo.tipoAcao, adminNome: ativoDoArquivo.adminNome, adminCnpj: ativoDoArquivo.adminCnpj });
                            ativosAtualizados++;
                        } else {
                            todosOsAtivos.push(ativoDoArquivo);
                            ativosAdicionados++;
                        }
                    }
                });

                salvarAtivos();
                alert(`Atualização de ativos concluída!\n\n- ${ativosAtualizados} ativos existentes foram atualizados.\n- ${ativosAdicionados} novos ativos foram adicionados.\n\nSeus cadastros de Contas e Feriados foram mantidos.`);
                if(telas.cadastroAtivos.style.display === 'block') renderizarTabelaAtivos();

            } else if (escolha === '2') {
                // --- OPÇÃO 2: SUBSTITUIÇÃO COMPLETA ---
                const novosAtivos = [], novasContas = [], novosFeriados = [];

                linhasDeDados.forEach(linha => {
                    const cols = linha.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g).map(c => c.trim().replace(/"/g, ''));
                    const tipo = cols[0];
                    if (!tipo) return;

                    switch (tipo) {
                        case 'ATIVO_RV':
                            novosAtivos.push({ id: parseFloat(cols[1]), ticker: cols[2], tipo: cols[3], nomePregao: cols[4], nome: cols[5], cnpj: cols[6], tipoAcao: cols[7], adminNome: cols[8], adminCnpj: cols[9] });
                            break;
                        case 'CONTA':
                            novasContas.push({ id: parseFloat(cols[1]), banco: cols[2], tipo: cols[3], numeroBanco: cols[4], agencia: cols[5], numero: cols[6], pix: cols[7], saldoInicial: parseDecimal(cols[8]), dataSaldoInicial: normalizarDataParaInput(cols[9]) });
                            break;
                        case 'FERIADO':
                            novosFeriados.push({ id: parseFloat(cols[1]), data: normalizarDataParaInput(cols[2]), descricao: cols[3] });
                            break;
                    }
                });

                todosOsAtivos = novosAtivos;
                todasAsContas = novasContas;
                todosOsFeriados = novosFeriados;

                salvarAtivos();
                salvarContas();
                salvarFeriados();

                alert('Substituição completa realizada com sucesso! A aplicação será recarregada.');
                location.reload();
            }

        } catch (error) {
            alert('Erro ao processar o arquivo CSV. Verifique se o formato está correto.\nDetalhes: ' + error.message);
        }
    };
    reader.readAsText(file);
    event.target.value = ''; // Limpa o input para permitir a mesma seleção de arquivo novamente
}
function processarArquivoHistorico(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const text = e.target.result;
            const todasAsLinhas = text.split(/\r?\n/).filter(l => l.trim() !== '');
            
            if (todasAsLinhas.length < 2) {
                alert('O arquivo CSV está vazio ou contém apenas o cabeçalho.');
                return;
            }

            const tickersCadastrados = new Set(todosOsAtivos.map(a => a.ticker));
            let novosAtivosForamCadastrados = false;

            const linhasDeDados = todasAsLinhas.slice(1);
            const dadosAgrupados = {};

            linhasDeDados.forEach(linha => {
                const colunas = linha.split(',').map(c => c.trim().replace(/"/g, ''));
                if (colunas.length < 6) return;

                // --- ALTERAÇÃO: Adiciona a leitura da 7ª coluna 'valorTotal' ---
                const [tickerRaw, data, transacao, quantidade, corretora, precoMedio, valorTotal] = colunas;
                const ticker = tickerRaw.toUpperCase();
                
                if (!ticker) return;

                let isNewAsset = false;
                if (!tickersCadastrados.has(ticker)) {
                    const novoAtivoMinimo = {
                        id: Date.now() + Math.random(), ticker: ticker, tipo: '', nome: '', nomePregao: '', tipoAcao: '', cnpj: '', adminNome: '', adminCnpj: '', statusAporte: 'Ativo'
                    };
                    todosOsAtivos.push(novoAtivoMinimo);
                    tickersCadastrados.add(ticker);
                    novosAtivosForamCadastrados = true;
                    isNewAsset = true;
                }
                
                if (!dadosAgrupados[ticker]) {
                    dadosAgrupados[ticker] = { isNew: isNewAsset, registros: [] };
                }
                // --- ALTERAÇÃO: Adiciona 'valorTotal' ao objeto de registro ---
                dadosAgrupados[ticker].registros.push({ data, transacao, quantidade, corretora, precoMedio, valorTotal });
            });

            if (novosAtivosForamCadastrados) {
                salvarAtivos();
            }

            if(Object.keys(dadosAgrupados).length > 0) {
                renderizarTelaImportacaoHistorico(dadosAgrupados);
            } else {
                 alert('Nenhuma linha de dados válida foi encontrada no arquivo. Verifique se o formato está correto (separado por vírgulas) e se o arquivo não está em branco.');
            }
        } catch (error) {
            alert("Ocorreu um erro ao processar o arquivo: " + error.message);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}
function salvarHistoricoImportado() {
    const containers = document.querySelectorAll('#container-revisao-historico .import-review-container');
    let totalAdicionado = 0;
    let totalAtualizado = 0;

    // 1. Coleta e agrupa todas as linhas da tela de revisão por uma chave única.
    const dadosParaProcessar = new Map();

    containers.forEach(container => {
        const ticker = container.dataset.ticker;
        const linhas = container.querySelectorAll('tbody tr');

        linhas.forEach(linha => {
            const data = linha.querySelector('.hist-data').value;
            const transacao = linha.querySelector('.hist-transacao').value;
            const corretora = linha.querySelector('.hist-corretora').value;
            const quantidade = linha.querySelector('.hist-qtd').value;
            const precoMedio = linha.querySelector('.hist-pm').value;
            const valorTotal = linha.querySelector('.hist-valor-total').value;

            if (data && transacao && quantidade && corretora && precoMedio) {
                const chave = `${ticker}|${data}|${transacao}|${corretora}`;
                if (!dadosParaProcessar.has(chave)) {
                    dadosParaProcessar.set(chave, []);
                }
                dadosParaProcessar.get(chave).push({
                    quantidadeNum: parseInt(quantidade, 10),
                    precoMedioNum: parseDecimal(precoMedio),
                    valorTotalStr: valorTotal 
                });
            }
        });
    });

    // 2. Processa cada grupo de transações para consolidar os valores.
    dadosParaProcessar.forEach((registrosDoGrupo, chave) => {
        const [ticker, data, transacao, corretora] = chave.split('|');

        // --- INÍCIO DA ALTERAÇÃO ---
        // O cálculo de consolidação agora SOMA também o 'valorTotal'.
        const consolidado = registrosDoGrupo.reduce((acc, current) => {
            acc.quantidadeTotal += current.quantidadeNum;
            acc.valorTotalConsolidado += parseDecimal(current.valorTotalStr || '0'); // SOMA o valor total
            acc.ultimoPrecoMedio = current.precoMedioNum; // Mantém o último preço médio
            return acc;
        }, { quantidadeTotal: 0, ultimoPrecoMedio: 0, valorTotalConsolidado: 0 });
        // --- FIM DA ALTERAÇÃO ---

        const indexExistente = posicaoInicial.findIndex(p =>
            p.tipoRegistro === 'TRANSACAO_HISTORICA' &&
            p.ticker === ticker &&
            p.data === data &&
            p.transacao === transacao &&
            p.corretora === corretora
        );

        if (indexExistente > -1) {
            posicaoInicial[indexExistente].quantidade += consolidado.quantidadeTotal;
            posicaoInicial[indexExistente].precoMedio = consolidado.ultimoPrecoMedio;
            if (transacao.toLowerCase() === 'venda') {
                // Soma o novo valor total consolidado ao valor de venda já existente.
                const valorVendaExistente = posicaoInicial[indexExistente].valorVenda || 0;
                posicaoInicial[indexExistente].valorVenda = valorVendaExistente + consolidado.valorTotalConsolidado;
            }
            totalAtualizado++;
        } else {
            const novoRegistro = {
                id: Date.now() + Math.random(),
                tipoRegistro: 'TRANSACAO_HISTORICA',
                ticker: ticker,
                data: data,
                transacao: transacao,
                quantidade: consolidado.quantidadeTotal,
                corretora: corretora,
                precoMedio: consolidado.ultimoPrecoMedio
            };
            if (transacao.toLowerCase() === 'venda') {
                novoRegistro.valorVenda = consolidado.valorTotalConsolidado;
            }
            posicaoInicial.push(novoRegistro);
            totalAdicionado++;
        }
    });
    
    if (totalAdicionado > 0 || totalAtualizado > 0) {
        salvarPosicaoInicial();
        alert(`${totalAdicionado} registro(s) de histórico importado(s) com sucesso e ${totalAtualizado} registro(s) atualizado(s)!`);
        mostrarTela('posicaoInicial');
        renderizarTabelaPosicaoInicial();
    } else {
        alert('Nenhum registro válido para salvar.');
    }
}
function processarArquivoNotas(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        const todasAsLinhas = text.split(/\r?\n/).filter(l => l.trim() !== '');
        if (todasAsLinhas.length < 2) {
            alert('Arquivo CSV vazio ou com apenas o cabeçalho.');
            return;
        }
        
        const linhasDeDados = todasAsLinhas.slice(1);
        const notasAgrupadas = new Map();

        linhasDeDados.forEach((linha, index) => {
            const cols = linha.split(/[,;]/).map(c => c.trim().replace(/"/g, ''));
            if (cols.length < 9) return; 

            const [ativo, data, operacao, corretora, quantidade, valor, numNota, custos, irrf] = cols;
            
            const chave = `${normalizarDataParaInput(data)}|${corretora}|${numNota}|${custos}|${irrf}`;

            if (!notasAgrupadas.has(chave)) {
                notasAgrupadas.set(chave, {
                    id: `import_${Date.now()}_${index}`,
                    corretora: corretora,
                    numero: numNota,
                    data: normalizarDataParaInput(data),
                    custos: parseDecimal(custos),
                    irrf: parseDecimal(irrf),
                    operacoes: []
                });
            }

            const op = {
                id: `import_op_${Date.now()}_${index}`,
                ativo: ativo.toUpperCase(),
                tipo: operacao.toLowerCase() === 'venda' ? 'venda' : 'compra',
                quantidade: parseInt(quantidade),
                valor: parseDecimal(valor)
            };
            notasAgrupadas.get(chave).operacoes.push(op);
        });

        if (notasAgrupadas.size > 0) {
            renderizarTelaImportacaoNotas(Array.from(notasAgrupadas.values()));
        } else {
            alert('Nenhuma nota válida encontrada no arquivo. Verifique o formato das colunas.');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}
function salvarNotasImportadas() {
    const containers = document.querySelectorAll('#container-revisao-notas .import-review-container');
    let notasSalvas = 0;
    
    containers.forEach(container => {
        const novaNota = {
            id: Date.now() + Math.random(),
            corretora: container.querySelector('.nota-corretora').value,
            numero: container.querySelector('.nota-numero').value,
            data: container.querySelector('.nota-data').value,
            custos: parseDecimal(container.querySelector('.nota-custos').value),
            irrf: parseDecimal(container.querySelector('.nota-irrf').value),
            operacoes: []
        };
        
        const operacoesRows = container.querySelectorAll('tbody tr');
        operacoesRows.forEach(row => {
            novaNota.operacoes.push({
                id: Date.now() + Math.random(),
                ativo: row.querySelector('.op-ativo').value.toUpperCase(),
                tipo: row.querySelector('.op-tipo').value,
                quantidade: parseInt(row.querySelector('.op-quantidade').value),
                valor: parseDecimal(row.querySelector('.op-valor').value)
            });
        });

        if (novaNota.operacoes.length > 0) {
            todasAsNotas.push(novaNota);
            sincronizarNotaComTransacao(novaNota.id);
            notasSalvas++;
        }
    });

    if (notasSalvas > 0) {
        salvarNotas();
        salvarMovimentacoes();
        
        // DISPARA A SINCRONIZAÇÃO SILENCIOSA
        sincronizarTodosOsRegistros(null, true);

        // Tradução: Sucesso importação
        alert(`${notasSalvas} note(s) imported successfully!`);
        mostrarTela('listaNotas');
        renderizarListaNotas();
    } else {
        // Tradução: Erro importação
        alert('No notes to save.');
    }
}
function migrarDadosDoBackup(backupData) {
    let dados = JSON.parse(JSON.stringify(backupData));
    const versaoBackup = dados.version || 0;

    if (versaoBackup >= APP_VERSION) {
        if (versaoBackup > APP_VERSION) {
            throw new Error("Atenção: O arquivo de backup é de uma versão mais nova do aplicativo. Restaure-o em uma versão compatível.");
        }
        console.log("Versão do backup é a mesma do aplicativo. Nenhuma migração necessária.");
        return dados;
    }

    console.log(`Iniciando migração de dados da versão ${versaoBackup} para ${APP_VERSION}`);

    switch (true) {
        case versaoBackup < 26:
            if (typeof dados.linksExternos === 'undefined') {
                dados.linksExternos = { acoes: '', fiis: '', etfs: '' };
            }
            console.log("Migrando da v25 para v26: Adicionando configurações de links externos.");
        
        case versaoBackup < 27:
            if (typeof dados.metas === 'undefined') {
                dados.metas = [];
            }
            console.log("Migrando da v26 para v27: Adicionando a funcionalidade de Metas.");
        
        case versaoBackup < 28:
            if (dados.transacoes) {
                dados.transacoes.forEach(t => { if (typeof t.transferenciaId === 'undefined') t.transferenciaId = null; });
            }
            if (dados.todasAsTransacoesMoedas) {
                dados.todasAsTransacoesMoedas.forEach(t => { if (typeof t.transferenciaId === 'undefined') t.transferenciaId = null; });
            }
            console.log("Migrando da v27 para v28: Adicionando campo 'transferenciaId' às transações.");
        
        case versaoBackup < 29:
            if (typeof dados.autoUpdateEnabled === 'undefined') {
                dados.autoUpdateEnabled = false;
            }
            console.log("Migrando da v28 para v29: Adicionando a configuração de atualização automática.");
        
        case versaoBackup < 30:
            if (dados.transacoes || dados.todasAsTransacoesMoedas) {
                console.log("Migrando da v29 para v30: Unificando arrays de transações.");
                const movimentacoesUnificadas = [];
                (dados.transacoes || []).forEach(t => {
                    movimentacoesUnificadas.push({ ...t, tipoAlvo: 'conta', idAlvo: t.contaId, moeda: 'BRL' });
                });
                (dados.todasAsTransacoesMoedas || []).forEach(t => {
                    const ativoMoeda = (dados.todosOsAtivosMoedas || []).find(a => String(a.id) === String(t.ativoMoedaId));
                    movimentacoesUnificadas.push({ ...t, tipoAlvo: 'moeda', idAlvo: t.ativoMoedaId, moeda: ativoMoeda ? ativoMoeda.moeda : 'N/D' });
                });
                dados.movimentacoes = movimentacoesUnificadas;
                delete dados.transacoes;
                delete dados.todasAsTransacoesMoedas;
            }
        
        case versaoBackup < 31:
            if (dados.movimentacoes) {
                dados.movimentacoes.forEach(mov => {
                    if (mov.source === 'resgate_rf' && typeof mov.devolucaoCapital === 'undefined') {
                        mov.devolucaoCapital = 0;
                    }
                });
                console.log("Migrando para compatibilidade de resgate de RF (v31): Adicionado campo 'devolucaoCapital'.");
            }
        
        case versaoBackup < 32:
            console.log("Migrando da v31 para v32: Preparando para a nova flag de proventos.");
            
        case versaoBackup < 33:
            if (dados.proventos) {
                dados.proventos.forEach(p => {
                    if (typeof p.valorBrutoIndividual === 'undefined') {
                        if (p.tipo === 'JCP') {
                            p.percentualIR = 15;
                            p.valorBrutoIndividual = p.valorIndividual / 0.85;
                        } else {
                            p.percentualIR = 0;
                            p.valorBrutoIndividual = p.valorIndividual;
                        }
                    }
                });
            }
            console.log("Migrando da v32 para v33: Adicionando campos valorBrutoIndividual e percentualIR aos proventos.");
        
        case versaoBackup < 34:
            if (typeof dados.dataInicioIntegracaoFinancas === 'undefined') {
                dados.dataInicioIntegracaoFinancas = null;
            }
            console.log("Migrando da v33 para v34: Adicionando campo dataInicioIntegracaoFinancas.");
        
        case versaoBackup < 35:
            if (dados.movimentacoes) {
                dados.movimentacoes.forEach(mov => {
                    if (typeof mov.enviarParaFinancas === 'undefined') {
                        // Se o campo já existia (de uma sincronização anterior), marca como true. Senão, false.
                        mov.enviarParaFinancas = !!mov.idLancamentoCasa;
                    }
                });
            }
            console.log("Migrando da v34 para v35: Adicionando campo 'enviarParaFinancas' às movimentações.");
            break;
    }

    console.log("Migração de dados concluída.");
    return dados;
}
function calcularResumoDeBackup(dadosBackup) {
    const dataDoBackup = dadosBackup.mercado?.timestamp?.split('T')[0] || dadosBackup.dadosComparacao?.dataExportacao || new Date().toISOString().split('T')[0];
    const posicoesRV = gerarPosicaoDetalhadaDeBackup(dadosBackup, dataDoBackup);
    const todosOsEventosDoBackup = obterTodosOsEventosDeCaixaDeBackup(dadosBackup);

    let saldoTotalContas = 0;
    (dadosBackup.contas || []).forEach(conta => {
        saldoTotalContas += calcularSaldoEmDataDeBackup(conta, dataDoBackup, dadosBackup);
    });

    let valorTotalMoedas = 0;
    (dadosBackup.todosOsAtivosMoedas || []).forEach(ativo => {
        const transacoesDoAtivo = todosOsEventosDoBackup.filter(e =>
            e.tipo === 'moeda' &&
            String(e.idAlvo) === String(ativo.id) &&
            e.source !== 'recorrente_futura' &&
            e.data <= dataDoBackup
        );
        const saldoAtivo = transacoesDoAtivo.reduce((soma, t) => soma + arredondarMoeda(t.valor), ativo.saldoInicial);
        valorTotalMoedas += saldoAtivo * (dadosBackup.dadosMoedas?.cotacoes[ativo.moeda] || 0);
    });

    // --- INÍCIO DA ALTERAÇÃO ---
    // Agora, também calculamos o custo (baseado no Preço Médio)
    const resumoClasses = { 
        'Ações': { mercado: 0, custo: 0 }, 
        'FIIs': { mercado: 0, custo: 0 }, 
        'ETFs': { mercado: 0, custo: 0 }, 
        'Renda Fixa': { mercado: 0, custo: 0 } 
    };

    for (const ticker in posicoesRV) {
        const ativoInfo = (dadosBackup.ativos || []).find(a => a.ticker === ticker);
        const tipoMapeado = ativoInfo ? (ativoInfo.tipo === 'Ação' ? 'Ações' : ativoInfo.tipo === 'FII' ? 'FIIs' : 'ETFs') : null;
        
        if (tipoMapeado && resumoClasses.hasOwnProperty(tipoMapeado)) {
            const posicao = posicoesRV[ticker];
            const cotacao = dadosBackup.mercado?.cotacoes[ticker];
            if (posicao.quantidade > 0) {
                // Cálculo do Valor de Mercado (como já era feito)
                resumoClasses[tipoMapeado].mercado += (cotacao && cotacao.valor > 0) ? (posicao.quantidade * cotacao.valor) : (posicao.quantidade * posicao.precoMedio);
                // NOVO: Cálculo do Valor de Custo
                resumoClasses[tipoMapeado].custo += posicao.quantidade * posicao.precoMedio;
            }
        }
    }

    (dadosBackup.todosOsAtivosRF || []).forEach(ativo => {
        if ((ativo.descricao || '').toLowerCase().includes('(inativa)')) return;
        const saldosRF = calcularSaldosRFEmDataDeBackup(ativo, dataDoBackup, dadosBackup);
        resumoClasses['Renda Fixa'].mercado += saldosRF.saldoLiquido;
        resumoClasses['Renda Fixa'].custo += saldosRF.valorInvestido; // Custo da RF
    });
    
    const projecaoProventos = calcularProjecaoProventosNegociacaoDeBackup(dadosBackup);
    const proventosTotal = projecaoProventos.acoes + projecaoProventos.fiis;
    const valorCarteiraInvestimentos = Object.values(resumoClasses).reduce((s, v) => s + v.mercado, 0);
    const totalProventosProvisionados = calcularTotalProventosProvisionadosDeBackup(dadosBackup);
    const patrimonioTotal = valorCarteiraInvestimentos + saldoTotalContas + valorTotalMoedas + totalProventosProvisionados;

    return {
        nomeUsuario: dadosBackup.userName || "Carteira Importada",
        dataExportacao: dataDoBackup,
        patrimonioTotal: patrimonioTotal,
        carteiraInvestimentos: valorCarteiraInvestimentos,
        valorPorClasse: {
            'Ações': resumoClasses['Ações'].mercado, 'FIIs': resumoClasses['FIIs'].mercado,
            'ETFs': resumoClasses['ETFs'].mercado, 'Renda Fixa': resumoClasses['Renda Fixa'].mercado
        },
        // NOVO: Adiciona o objeto de custos ao retorno
        valorCustoPorClasse: {
            'Ações': resumoClasses['Ações'].custo, 'FIIs': resumoClasses['FIIs'].custo
        },
        proventosMensais: {
            acoes: projecaoProventos.acoes, fiis: projecaoProventos.fiis,
            etfs: 0, total: proventosTotal
        },
        saldoContas: saldoTotalContas,
        saldoMoedas: valorTotalMoedas,
        proventosProvisionados: totalProventosProvisionados
    };
    // --- FIM DA ALTERAÇÃO ---
}
function obterTodosOsEventosDeCaixaDeBackup(dadosBackup) {
    const eventos = [];
    if (!dadosBackup) return eventos;
    
    const versaoBackup = dadosBackup.version || 0;

    // Etapa 1: Processa movimentações manuais/confirmadas com base na versão do backup
    if (dadosBackup.movimentacoes || versaoBackup >= 30) {
        // Lógica para ler o formato NOVO (v30 e posteriores)
        (dadosBackup.movimentacoes || [])
            .filter(mov => mov.source !== 'provento' && mov.source !== 'nota')
            .forEach(mov => {
                eventos.push({
                    id: mov.id,
                    data: mov.data,
                    valor: mov.valor,
                    descricao: mov.descricao,
                    tipo: mov.tipoAlvo,
                    idAlvo: String(mov.idAlvo),
                    moeda: mov.moeda,
                    source: mov.source,
                    sourceId: mov.sourceId,
                    transferenciaId: mov.transferenciaId
                });
            });
    } else {
        // Lógica para ler o formato ANTIGO (v29 e anteriores)
        (dadosBackup.transacoes || [])
            .filter(t => t.source !== 'provento' && t.source !== 'nota')
            .forEach(t => {
                if (t.contaId) { 
                    eventos.push({
                        id: t.id, data: t.data, valor: t.valor, descricao: t.descricao,
                        tipo: 'conta', idAlvo: String(t.contaId), moeda: 'BRL', source: t.source
                    });
                }
            });

        (dadosBackup.todasAsTransacoesMoedas || []).forEach(t => {
            const ativoMoeda = (dadosBackup.todosOsAtivosMoedas || []).find(a => String(a.id) === String(t.ativoMoedaId));
            if (ativoMoeda) {
                eventos.push({
                    id: t.id, data: t.data, valor: t.valor, descricao: t.descricao, tipo: 'moeda',
                    idAlvo: String(t.ativoMoedaId), moeda: ativoMoeda.moeda, source: t.source
                });
            }
        });
    }

    // Etapa 2: Processa eventos gerados dinamicamente (comum a todas as versões)
    (dadosBackup.notas || []).forEach(n => {
        if (!n.data) return;
        const contaInvestimento = (dadosBackup.contas || []).find(c => c.banco === n.corretora && c.tipo === 'Conta Investimento');
        if (contaInvestimento) {
            const totalCompras = n.operacoes.filter(op => op.tipo === 'compra').reduce((acc, op) => acc + op.valor, 0);
            const totalVendas = n.operacoes.filter(op => op.tipo === 'venda').reduce((acc, op) => acc + op.valor, 0);
            const valorLiquido = arredondarMoeda(totalVendas - totalCompras - (n.custos || 0) - (n.irrf || 0));
            if (valorLiquido !== 0) {
                const dataLiquidacao = calcularDataLiquidacao(n.data, 2).toISOString().split('T')[0];
                const dataFormatadaNota = new Date(n.data + 'T12:00:00').toLocaleDateString('pt-BR');
                eventos.push({
                    id: `nota_${n.id}`, data: dataLiquidacao, valor: valorLiquido,
                    descricao: `Liq. Nota Neg. ${n.corretora} nro. ${n.numero} de ${dataFormatadaNota}`,
                    tipo: 'conta', idAlvo: String(contaInvestimento.id), moeda: 'BRL', source: 'nota'
                });
            }
        }
    });

    (dadosBackup.proventos || []).forEach(p => {
        if (!p.dataPagamento || p.valorTotalRecebido === 0) return;
        for (const corretora in p.posicaoPorCorretora) {
            const dadosCorretora = p.posicaoPorCorretora[corretora];
            if (dadosCorretora.valorRecebido === 0) continue;
            const contaInvestimento = (dadosBackup.contas || []).find(c => c.banco === corretora && c.tipo === 'Conta Investimento');
            if (contaInvestimento) {
                
                let transacaoEditadaExiste = false;
                if (versaoBackup < 30) {
                    transacaoEditadaExiste = (dadosBackup.transacoes || []).some(t =>
                        t.source === 'provento_editado' && t.sourceId === p.id && String(t.contaId) === String(contaInvestimento.id)
                    );
                } else {
                    transacaoEditadaExiste = (dadosBackup.movimentacoes || []).some(t =>
                        t.source === 'provento_editado' && t.sourceId === p.id && t.tipoAlvo === 'conta' && String(t.idAlvo) === String(contaInvestimento.id)
                    );
                }

                if (transacaoEditadaExiste) continue;

                eventos.push({
                    id: `provento_${p.id}_${corretora}`, data: p.dataPagamento, valor: arredondarMoeda(dadosCorretora.valorRecebido),
                    descricao: `${p.tipo} de ${p.ticker} s/${Math.round(dadosCorretora.quantidade)}`,
                    tipo: 'conta', idAlvo: String(contaInvestimento.id), moeda: 'BRL', source: 'provento'
                });
            }
        }
    });
    
    gerarTransacoesFilhasDeBackup(dadosBackup).forEach(filha => {
        let eventoRecorrente = {
            id: filha.id, data: filha.data, valor: filha.valor, descricao: filha.descricao,
            tipo: filha.targetType, idAlvo: String(filha.targetId),
            source: 'recorrente_futura', maeId: filha.sourceId
        };
        if (filha.targetType === 'moeda') {
            const ativoMoeda = (dadosBackup.todosOsAtivosMoedas || []).find(a => String(a.id) === String(filha.targetId));
            eventoRecorrente.moeda = ativoMoeda ? ativoMoeda.moeda : '';
        } else {
            eventoRecorrente.moeda = 'BRL';
        }
        eventos.push(eventoRecorrente);
    });

    return eventos;
}
function calcularSaldoEmDataDeBackup(conta, dataLimite, dadosBackup) {
    if (!dataLimite) return 0;
    const todosOsEventos = obterTodosOsEventosDeCaixaDeBackup(dadosBackup);
    const eventosFiltrados = todosOsEventos.filter(e =>
        e.tipo === 'conta' &&
        String(e.idAlvo) === String(conta.id) &&
        e.source !== 'recorrente_futura' &&
        new Date(e.data + 'T12:00:00') <= new Date(dataLimite + 'T12:00:00') &&
        new Date(e.data + 'T12:00:00') >= new Date(conta.dataSaldoInicial + 'T12:00:00')
    );
    const saldoFinal = eventosFiltrados.reduce((acc, evento) => {
        return acc + arredondarMoeda(evento.valor);
    }, conta.saldoInicial);
    return arredondarMoeda(saldoFinal);
}
function calcularTotalProventosProvisionadosDeBackup(dadosBackup) {
    const hojeStr = new Date().toISOString().split('T')[0];
    const proventosProvisionados = (dadosBackup.proventos || []).filter(p =>
        p.dataCom && p.dataPagamento &&
        p.dataCom < hojeStr &&
        p.dataPagamento > hojeStr
    );
    return proventosProvisionados.reduce((soma, p) => soma + (p.valorTotalRecebido || 0), 0);
}
function calcularProjecaoProventosNegociacaoDeBackup(dadosBackup) {
    const posicoesParaCalculo = gerarPosicaoDetalhadaDeBackup(dadosBackup);
    let totalRendimentoAtualFIIs = 0;
    let totalRendimentoAtualAcoes = 0;

    for (const ticker in posicoesParaCalculo) {
        const ativoInfo = (dadosBackup.ativos || []).find(a => a.ticker === ticker);
        if (!ativoInfo) continue;
        const posicao = posicoesParaCalculo[ticker];
        if (!posicao || posicao.quantidade <= 0) continue;

        if (ativoInfo.tipo === 'FII') {
            const proventosDoAtivo = (dadosBackup.proventos || [])
                .filter(p => p.ticker === ticker && p.valorIndividual > 0 && p.dataCom)
                .sort((a, b) => new Date(b.dataCom) - new Date(a.dataCom));
            const ultimoProvento = proventosDoAtivo.length > 0 ? proventosDoAtivo[0].valorIndividual : 0;
            totalRendimentoAtualFIIs += ultimoProvento * posicao.quantidade;
        } else if (ativoInfo.tipo === 'Ação') {
            const projecaoAnualUnitaria = calcularProjecaoAnualUnitariaDeBackup(ticker, { limiteAnos: 5 }, dadosBackup);
            totalRendimentoAtualAcoes += (projecaoAnualUnitaria * posicao.quantidade) / 12;
        }
    }
    return {
        acoes: totalRendimentoAtualAcoes,
        fiis: totalRendimentoAtualFIIs
    };
}
function calcularSaldosRFEmDataDeBackup(ativoRF, dataLimite, dadosBackup) {
    const dataDeCorte = getDataInicioCicloAtualRFDeBackup(ativoRF, dadosBackup);
    const capitalInvestidoTotal = getCapitalInvestidoNoCicloAtualDeBackup(ativoRF, dataLimite, dadosBackup);

    const resgatesNoCiclo = (dadosBackup.movimentacoes || []).filter(t =>
        t.source === 'resgate_rf' &&
        t.sourceId === ativoRF.id &&
        t.data <= dataLimite &&
        t.data > dataDeCorte
    );
    
    const capitalRetornadoTotal = resgatesNoCiclo.reduce((sum, m) => sum + (m.devolucaoCapital || 0), 0);
    const resgatesTotais = resgatesNoCiclo.reduce((sum, m) => sum + Math.abs(m.valor), 0);
    const capitalInvestidoRestante = capitalInvestidoTotal - capitalRetornadoTotal;

    const rendimentosPassados = (dadosBackup.todosOsRendimentosRFNaoRealizados || [])
        .filter(r => 
            r.ativoId === ativoRF.id && 
            r.data <= dataLimite &&
            r.data > dataDeCorte
        )
        .sort((a, b) => new Date(b.data) - new Date(a.data));
    
    const rendimentoAcumuladoTotal = rendimentosPassados.length > 0 ? rendimentosPassados[0].rendimento : 0;

    const saldoLiquidoNaData = (capitalInvestidoTotal + rendimentoAcumuladoTotal) - resgatesTotais;
    const rendimentoBrutoRestante = saldoLiquidoNaData - capitalInvestidoRestante;

    return {
        valorInvestido: arredondarMoeda(capitalInvestidoRestante),
        saldoLiquido: arredondarMoeda(saldoLiquidoNaData),
        rendimentoBruto: arredondarMoeda(rendimentoBrutoRestante)
    };
}

function gerarTransacoesFilhasDeBackup(dadosBackup) {
    const transacoesGeradas = [];
    if (!dadosBackup || !dadosBackup.todasAsTransacoesRecorrentes) return transacoesGeradas;

    dadosBackup.todasAsTransacoesRecorrentes.forEach(mae => {
        if (!mae.dataInicio || !mae.recorrencia || !mae.termino) return;

        let ocorrenciasGeradas = 0;
        let dataCandidata = new Date(mae.dataInicio + 'T12:00:00');

        if (mae.recorrencia.frequencia === 'mensal') {
            const diaDaRegra = mae.recorrencia.dia;
            dataCandidata.setDate(1);
            dataCandidata.setDate(diaDaRegra);
            if (dataCandidata.getMonth() !== new Date(mae.dataInicio + 'T12:00:00').getMonth()) {
                 dataCandidata = new Date(dataCandidata.getFullYear(), dataCandidata.getMonth(), 0, 12, 0, 0);
            }
        }
        
        while (true) {
            if (ocorrenciasGeradas >= 240) break;
            if (mae.termino.tipo === 'data' && dataCandidata > new Date(mae.termino.valor + 'T12:00:00')) break;
            if (mae.termino.tipo === 'ocorrencias' && (ocorrenciasGeradas + (mae.datasProcessadas?.length || 0)) >= mae.termino.valor) break;

            const dataCandidataStr = dataCandidata.toISOString().split('T')[0];

            if (!mae.datasProcessadas || !mae.datasProcessadas.includes(dataCandidataStr)) {
                transacoesGeradas.push({
                    id: `${mae.id}_${dataCandidataStr}`, data: dataCandidataStr,
                    descricao: `(Recorrente) ${mae.descricao}`, valor: mae.valor,
                    source: 'recorrente_futura', sourceId: mae.id,
                    targetType: mae.targetType, targetId: mae.targetId
                });
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
                case 'quinzenal': dataCandidata.setDate(dataCandidata.getDate() + 14); break;
                case 'semanal': dataCandidata.setDate(dataCandidata.getDate() + 7); break;
            }
        }
    });
    return transacoesGeradas;
}
function getCapitalInvestidoNoCicloAtualDeBackup(ativo, dataLimite, dadosBackup) {
    const dataDeCorte = getDataInicioCicloAtualRFDeBackup(ativo, dadosBackup);
    let capitalTotalCiclo = 0;

    if (ativo.dataAplicacao <= dataLimite && ativo.dataAplicacao > dataDeCorte) {
        capitalTotalCiclo += ativo.valorInvestido;
    }

    (dadosBackup.movimentacoes || [])
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
function gerarPosicaoDetalhadaDeBackup(dadosBackup, dataLimite = null) {
    const posicoes = {};
    if (!dadosBackup) return posicoes;

    let eventos = [];
    (dadosBackup.posicoes || []).forEach(p => eventos.push({ data: p.data, tipo: p.tipoRegistro, payload: p }));
    (dadosBackup.notas || []).forEach(n => n.operacoes.forEach(op => eventos.push({ data: n.data, tipo: 'OPERACAO_NOTA', payload: {...op, custosNota: n.custos, irrfNota: n.irrf, corretora: n.corretora, totalOperacoesNota: n.operacoes.reduce((soma, op) => soma + op.valor, 0)} })));
    (dadosBackup.ajustes || []).forEach(a => eventos.push({ data: a.data, tipo: a.tipoAjuste, payload: a }));

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
function getDataInicioCicloAtualRFDeBackup(ativo, dadosBackup) {
    const eventos = [];
    eventos.push({ data: ativo.dataAplicacao, valor: ativo.valorInvestido, tipo: 'aporte' });

    const movimentacoesDoAtivo = (dadosBackup.movimentacoes || []).filter(t =>
        t.sourceId === ativo.id && (t.source === 'aporte_rf' || t.source === 'resgate_rf')
    );

    movimentacoesDoAtivo.forEach(t => {
        eventos.push({
            data: t.data,
            valor: t.source === 'aporte_rf' ? Math.abs(t.valor) : -Math.abs(t.valor),
            tipo: t.source,
            movimentacaoOriginal: t 
        });
    });

    eventos.sort((a, b) => new Date(a.data) - new Date(b.data));

    let capitalAcumulado = 0;
    let dataUltimoEncerramento = '1970-01-01';

    eventos.forEach(evento => {
        if (evento.tipo === 'aporte' || evento.tipo === 'aporte_rf') {
            capitalAcumulado += evento.valor;
        } else if (evento.tipo === 'resgate_rf') {
            if (evento.movimentacaoOriginal) {
                capitalAcumulado -= (evento.movimentacaoOriginal.devolucaoCapital || 0);
            }
        }
        if (capitalAcumulado < 0.01) {
            dataUltimoEncerramento = evento.data;
        }
    });

    return dataUltimoEncerramento;
}
function calcularProjecaoAnualUnitariaDeBackup(ticker, options = {}, dadosBackup) {
    const hoje = new Date().toISOString().split('T')[0];
    const dataFim = options.dataFim || hoje;
    
    let dataInicio = options.dataInicio;
    if (!dataInicio) {
        // Simula getInicioInvestimento usando dados do backup
        const eventosDeCompra = [];
        (dadosBackup.notas || []).forEach(n => {
            n.operacoes.filter(op => op.ativo === ticker && op.tipo === 'compra')
                .forEach(op => eventosDeCompra.push({ data: n.data }));
        });
        (dadosBackup.posicoes || []).filter(p => p.ticker === ticker && (!p.transacao || p.transacao.toLowerCase() === 'compra'))
            .forEach(p => eventosDeCompra.push({ data: p.data }));
        if (eventosDeCompra.length > 0) {
            eventosDeCompra.sort((a, b) => new Date(a.data) - new Date(b.data));
            dataInicio = eventosDeCompra[0].data;
        }
    }
    
    if (!dataInicio) return 0;

    if (options.limiteAnos) {
        let dataLimite = new Date(dataFim);
        dataLimite.setFullYear(dataLimite.getFullYear() - options.limiteAnos);
        const dataLimiteStr = dataLimite.toISOString().split('T')[0];
        if (new Date(dataInicio) < new Date(dataLimiteStr)) {
            dataInicio = dataLimiteStr;
        }
    }

    const diasDeHistorico = calcularDiffDias(dataInicio, dataFim);
    if (diasDeHistorico <= 0) return 0;
    
    const proventosNoPeriodo = (dadosBackup.proventos || []).filter(p =>
        p.ticker === ticker && p.dataCom >= dataInicio && p.dataCom <= dataFim
    );

    const somaTotalPeriodo = proventosNoPeriodo.reduce((acc, p) => acc + p.valorIndividual, 0);

    return (somaTotalPeriodo / diasDeHistorico) * 365.25;
}