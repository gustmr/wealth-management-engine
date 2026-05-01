async function atualizarCotacoesComAPI(silencioso = false) {
    if (!urlCotacoesCSV || !urlCotacoesCSV.startsWith('http')) {
        if (!silencioso) {
            alert('Quotes spreadsheet URL not configured or invalid. Please configure it on the Settings screen.');
        }
        return;
    }

    const botoesAtualizar = document.querySelectorAll('#btn-atualizar-cotacoes-api, #btn-testar-salvar-url-cotacoes');
    botoesAtualizar.forEach(btn => {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
        btn.disabled = true;
    });

    if (!silencioso) {
        mostrarFeedbackAtualizacao('Updating quotes...', 'loading');
    }

    try {
        const response = await fetch(urlCotacoesCSV, { mode: 'cors' }); 
        if (!response.ok) {
            throw new Error(`Network error: ${response.statusText}`);
        }
        const csvText = await response.text();
        processarArquivoCotacoes(csvText, silencioso); 
    } catch (error) {
        console.error('Erro ao buscar cotações da URL:', error);
        
        if (window.location.protocol === 'file:' && error.message.includes('Failed to fetch')) {
             if (!silencioso) {
                alert("Warning: The browser blocked access to the spreadsheet for security reasons (CORS Error). This is common when running the file directly from your computer (file://).\n\nTo fix this, you can manually import the CSV or use a browser extension that allows CORS (like 'Allow CORS').");
             }
        }
        
        if (!silencioso) {
            mostrarFeedbackAtualizacao('Update failed!', 'error');
        }
    } finally {
        const btnAtualizar = document.getElementById('btn-atualizar-cotacoes-api');
        if(btnAtualizar) btnAtualizar.innerHTML = '<i class="fas fa-sync-alt"></i> Update Quotes (Auto)';
        
        const btnTestar = document.getElementById('btn-testar-salvar-url-cotacoes');
        if(btnTestar) btnTestar.textContent = 'Test and Save URL';
        
        botoesAtualizar.forEach(btn => btn.disabled = false);
    }
}
function processarArquivoCotacoes(conteudoCsv, silencioso = false) {
    if (!conteudoCsv) {
        if (!silencioso) mostrarFeedbackAtualizacao('Erro: Nenhum conteúdo recebido.', 'error');
        return;
    }
    
    const linhas = conteudoCsv.split(/\r?\n/).filter(l => l.trim() !== '');

    if (linhas.length < 2) {
        if (!silencioso) mostrarFeedbackAtualizacao('Erro: Arquivo vazio ou inválido.', 'error');
        return;
    }

    let novasCotacoesRV = {};
    const linhasDeDados = linhas.slice(1);
    let linhasProcessadas = 0;

    linhasDeDados.forEach(linha => {
        // --- INÍCIO DA ALTERAÇÃO ---
        // Agora espera 6 colunas e unifica o VPA
        const colunas = linha.split(/[,;]/).map(c => c.trim().replace(/"/g, ''));

        if (colunas.length < 6) return;
        
        const [ativo, valor, min52, max52, vpa, lpa_acao] = colunas;
        // --- FIM DA ALTERAÇÃO ---

        const ativoUpper = ativo.toUpperCase();
        const valorNum = parseDecimal(valor || '0');

        if (!ativoUpper || isNaN(valorNum)) return;
        if (ativoUpper === 'USDBRL') {
            dadosMoedas.cotacoes['USD'] = valorNum;
        } else if (ativoUpper === 'EURBRL') {
            dadosMoedas.cotacoes['EUR'] = valorNum;
        } else if (ativoUpper === 'GBPBRL') {
            dadosMoedas.cotacoes['GBP'] = valorNum;
        } else if (ativoUpper === 'IFIX') {
            dadosDeMercado.ifix = valorNum;
        } else if (ativoUpper === 'IBOV') {
            dadosDeMercado.ibov = valorNum;
        } else {
            // --- INÍCIO DA ALTERAÇÃO ---
            // Salva no novo campo unificado '.vpa'
            novasCotacoesRV[ativoUpper] = {
                valor: valorNum,
                min52: parseDecimal(min52 || '0'),
                max52: parseDecimal(max52 || '0'),
                vpa: parseDecimal(vpa || '0'),
                lpa_acao: parseDecimal(lpa_acao || '0')
            };
            // --- FIM DA ALTERAÇÃO ---
        }
        linhasProcessadas++;
    });

    dadosDeMercado.cotacoes = novasCotacoesRV;
    dadosDeMercado.timestamp = new Date().toISOString();
    
    salvarDadosDeMercado();
    salvarDadosMoedas();
    salvarSnapshotCarteira(true); // Salva o snapshot silenciosamente

    if (!silencioso) {
        mostrarFeedbackAtualizacao('Cotações atualizadas!', 'success');
    }
    renderizarInfoAtualizacaoMercado(); // Mantém o timestamp atualizado

    const telaVisivel = document.querySelector('.main-content > div[style*="display: block"]');
    if (telaVisivel) {
        if (telaVisivel.id === 'tela-renda-variavel') renderizarTelaRendaVariavel();
        if (telaVisivel.id === 'tela-caixa-global') renderizarTelaCaixaGlobal(true);
        if (telaVisivel.id === 'tela-dashboard') renderizarDashboard();
        if (telaVisivel.id === 'tela-performanceRV') renderizarTelaPerformanceRV();
        if (telaVisivel.id === 'tela-negociar') renderizarTelaNegociar();
        if (telaVisivel.id === 'tela-consulta-balanceamento') renderizarTelaConsultaBalanceamento();
    }
}
function iniciarAutoUpdate() {
    if (autoUpdateIntervalId) {
        clearInterval(autoUpdateIntervalId); // Limpa qualquer timer anterior
    }
    console.log("Iniciando atualização automática de cotações.");
    atualizarCotacoesComAPI(true); // Executa uma vez imediatamente de forma silenciosa
    autoUpdateIntervalId = setInterval(() => {
        console.log("Executando atualização automática agendada...");
        atualizarCotacoesComAPI(true); // Executa a cada 10 minutos de forma silenciosa
    }, 10 * 60 * 1000);
}

function pararAutoUpdate() {
    if (autoUpdateIntervalId) {
        clearInterval(autoUpdateIntervalId);
        autoUpdateIntervalId = null;
        console.log("Atualização automática de cotações interrompida.");
    }
}
function renderizarInfoAtualizacaoMercado() {
    const todosOsSpans = document.querySelectorAll('.market-data-timestamp');
    const footerInfo = document.getElementById('market-data-info');
    // Tradução: Cotações
    let textoHeader = 'Quotes: Never updated.';
    let textoFooter = '<span>Quotes: Never updated.</span>';

    if (dadosDeMercado.timestamp) {
        const data = new Date(dadosDeMercado.timestamp);
        const dataFormatada = data.toLocaleDateString('en-GB');
        const horaFormatada = data.toLocaleTimeString('en-GB');
        // Tradução: Cotações atualizadas em...
        textoHeader = `Quotes updated on: ${dataFormatada} at ${horaFormatada}`;
        textoFooter = `<span>Quotes: ${dataFormatada} at ${horaFormatada}</span>`;
    }

    todosOsSpans.forEach(span => span.textContent = textoHeader);
    if (footerInfo) {
        footerInfo.innerHTML = textoFooter;
    }
}