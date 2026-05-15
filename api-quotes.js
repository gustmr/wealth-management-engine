// Quotes and Market // Cotações e Mercado
function iniciarAutoUpdate() {
    // Limpa timer anterior para garantir que não haja duplicidade
    if (autoUpdateIntervalId) {
        clearInterval(autoUpdateIntervalId);
        autoUpdateIntervalId = null;
    }

    if (!autoUpdateEnabled) return;

    console.log("🔄 Auto-Update iniciado: Cotações serão atualizadas a cada 10 minutos.");
    
    // Executa a primeira vez imediatamente (silencioso)
    atualizarCotacoesComAPI(true); 

    // Define o intervalo de 10 minutos (600.000 ms)
    autoUpdateIntervalId = setInterval(() => {
        console.log("⏰ Executando auto-update agendado...");
        atualizarCotacoesComAPI(true);
    }, 600000);
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
    
    // Estado padrão (sem dados)
    let textoHeader = 'Cotações: <span style="color: #ffcc00;">Nunca atualizado</span>';
    let textoFooter = '<span>Cotações: --/--</span>';

    if (dadosDeMercado.timestamp) {
        const data = new Date(dadosDeMercado.timestamp);
        const agora = new Date();
        const diffHoras = (agora - data) / (1000 * 60 * 60); // Diferença em horas

        const dataFormatada = data.toLocaleDateString('pt-BR');
        const horaFormatada = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        
        // Definição de Status (Cores)
        let corStatus = '#2ecc71'; // Verde (Recente)
        let iconStatus = '';

        if (diffHoras > 48) {
            corStatus = '#e74c3c'; // Vermelho (> 48h)
            iconStatus = '<i class="fas fa-exclamation-circle"></i> ';
        } else if (diffHoras > 24) {
            corStatus = '#f1c40f'; // Amarelo (> 24h)
        }

        const spanEstilizado = `<span style="color: ${corStatus}; font-weight: bold;">${iconStatus}${dataFormatada} às ${horaFormatada}</span>`;

        textoHeader = `Cotações: ${spanEstilizado}`;
        
        // CORREÇÃO AQUI: Adicionado "às ${horaFormatada}" de volta ao rodapé
        textoFooter = `<span style="border-left: 3px solid ${corStatus}; padding-left: 5px;">Cotações: ${dataFormatada} às ${horaFormatada}</span>`;
    }

    todosOsSpans.forEach(span => span.innerHTML = textoHeader);
    if (footerInfo) {
        footerInfo.innerHTML = textoFooter;
    }
}
async function atualizarCotacoesComAPI(silencioso = false) {
    if (!urlCotacoesCSV || !urlCotacoesCSV.startsWith('http')) {
        if (!silencioso) alert('URL não configurada.');
        return;
    }

    // Trava Arquitetural: Se a sincronização inicial não terminou, cancela.
    if (!window.isInitialSyncComplete) {
        console.warn("Atualização de cotações abortada: Sincronização inicial do Firebase ainda não foi concluída.");
        return;
    }

    // --- SETUP VISUAL (Apenas modo Manual) ---
    const btnPrincipal = document.getElementById('btn-atualizar-cotacoes-api');
    const iconPrincipal = btnPrincipal ? btnPrincipal.querySelector('i') : null;
    const botoesAtualizar = document.querySelectorAll('#btn-atualizar-cotacoes-api, #btn-testar-salvar-url-cotacoes');
    const footerPadrao = document.getElementById('sidebar-main-info');
    const footerLogs = document.getElementById('sidebar-footer-logs');
    const consoleContainer = document.getElementById('log-console-container');

    const alternarModoRodape = (modoAtualizacao) => {
        if (footerPadrao && footerLogs) {
            footerPadrao.style.display = modoAtualizacao ? 'none' : 'block';
            footerLogs.style.display = modoAtualizacao ? 'block' : 'none';
        }
    };

    const logNoSistema = (texto, tipo = 'info') => {
        if (!consoleContainer) return;
        const time = new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit', second:'2-digit'});
        
        let iconHtml = '', styleHtml = 'color:#aaa;';
        if (tipo === 'sucesso') { styleHtml = 'color: var(--success-color); font-weight:bold;'; iconHtml = '✔ '; } 
        else if (tipo === 'erro') { styleHtml = 'color: var(--danger-color); font-weight:bold;'; iconHtml = '✖ '; } 
        else if (tipo === 'indice') { styleHtml = 'color: #f1c40f; font-weight:bold;'; iconHtml = '⚡ '; } 
        else if (tipo === 'taxa') { styleHtml = 'color: #3498db; font-weight:bold;'; iconHtml = '📊 '; }

        consoleContainer.innerHTML = `<div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"><span style="color:#555; font-size:0.9em;">[${time}]</span> <span style="${styleHtml}">${iconHtml}${texto}</span></div>`;
    };

    // --- 1. BLOQUEIO DE UI (Apenas Manual) ---
    if (!silencioso) {
        if (btnPrincipal) {
            botoesAtualizar.forEach(btn => btn.disabled = true);
            if (iconPrincipal) iconPrincipal.classList.add('fa-spin');
        }
        alternarModoRodape(true);
        mostrarFeedbackAtualizacao('Conectando...', 'loading');
        logNoSistema('Iniciando conexão segura...');
    }

    try {
        // --- 2. FETCH E PROCESSAMENTO IMEDIATO (Velocidade Máxima) ---
        const response = await fetch(urlCotacoesCSV);
        if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);
        const csvText = await response.text();
        
        // Processa as novas cotações
        processarArquivoCotacoes(csvText, silencioso);

        // --- SALVAMENTO ATRELADO ---
        // Assim que as cotações novas entram, tiramos a foto da carteira silenciosamente.
        logNoSistema('Consolidando Snapshot Diário...', 'info');
        if (typeof salvarSnapshotCarteira === 'function') {
            await salvarSnapshotCarteira(true);
        }

        // --- 3. ANIMAÇÃO VISUAL ---
        if (!silencioso) {
            const linhas = csvText.split('\n');
            const totalLinhas = linhas.length;
            logNoSistema(`Processados ${totalLinhas} registros com sucesso.`, 'sucesso');
            
            const passo = totalLinhas > 50 ? Math.floor(totalLinhas / 10) : 1; 
            
            for (let i = 1; i < totalLinhas; i += passo) {
                const colunas = linhas[i].split(',');
                if (colunas.length >= 2) {
                    const ticker = colunas[0].trim().toUpperCase();
                    const valor = colunas[1].trim();
                    
                    const MAPA = { 'IBOV': 'IBOV', 'IFIX': 'IFIX', 'USDBRL=X': 'Dólar', 'EURBRL=X': 'Euro', 'CDI': 'CDI', 'SELIC': 'Selic' };
                    
                    if (MAPA[ticker] || ticker === 'IBOV' || ticker === 'IFIX') {
                        logNoSistema(`${MAPA[ticker] || ticker}: ${valor}`, 'indice');
                        await new Promise(r => setTimeout(r, 100)); 
                    } else {
                        logNoSistema(`Sincronizado: ${ticker}...`);
                        await new Promise(r => setTimeout(r, 20)); 
                    }
                }
            }

            logNoSistema('Atualizando Dashboard...', 'info');
            await new Promise(r => setTimeout(r, 500)); 
            logNoSistema('SISTEMA ATUALIZADO.', 'sucesso');
            mostrarFeedbackAtualizacao('Cotações Atualizadas!', 'success');
            
            await new Promise(r => setTimeout(r, 1500)); 
        }

    } catch (error) {
        console.error(error);
        if (!silencioso) {
            logNoSistema(`Falha: ${error.message}`, 'erro');
            mostrarFeedbackAtualizacao('Erro na atualização', 'error');
            await new Promise(r => setTimeout(r, 3000));
        }
    } finally {
        // --- 4. LIMPEZA ---
        if (!silencioso) {
            if (btnPrincipal && iconPrincipal) iconPrincipal.classList.remove('fa-spin');
            botoesAtualizar.forEach(btn => btn.disabled = false);
            alternarModoRodape(false);
        }
    }
}
