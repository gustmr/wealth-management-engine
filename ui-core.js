// Basic Interface Control // Controle Básico de Interface
function fecharModal(modalId) {
    const modalParaFechar = document.getElementById(modalId);
    if (modalParaFechar) {
        modalParaFechar.style.display = 'none';
        modalParaFechar.classList.remove('modal-no-topo');
    }

    // Encontra os modais que ainda estão visíveis
    const modaisVisiveis = document.querySelectorAll('.modal[style*="display: block"]');
    if (modaisVisiveis.length > 0) {
        // Garante que o último modal da lista (o que estava por baixo) se torne o do topo
        modaisVisiveis[modaisVisiveis.length - 1].classList.add('modal-no-topo');
    }
}
function abrirModal(modalId) {
    const modalParaAbrir = document.getElementById(modalId);
    if (!modalParaAbrir) {
        console.error(`Tentativa de abrir um modal que não existe: ${modalId}`);
        return;
    }

    // Remove a classe 'no-topo' de qualquer outro modal que já esteja aberto
    document.querySelectorAll('.modal.modal-no-topo').forEach(m => m.classList.remove('modal-no-topo'));

    // Adiciona a classe 'no-topo' ao novo modal e o exibe
    modalParaAbrir.classList.add('modal-no-topo');
    modalParaAbrir.style.display = 'block';
}
function mostrarTela(idTela) {
    // Limpa o destaque de qualquer item de menu anteriormente ativo
    document.querySelectorAll('.sidebar .active').forEach(el => el.classList.remove('active'));

    // Encontra o link ou o menu pai correspondente à nova tela
    const linkAtivo = document.querySelector(`.sidebar a[data-tela="${idTela}"]`);
    if (linkAtivo) {
        // Adiciona a classe 'active' ao link clicado
        linkAtivo.classList.add('active');
        
        // Verifica se o link está dentro de um submenu
        const submenu = linkAtivo.closest('.submenu');
        if (submenu) {
            // Se estiver, abre o submenu e destaca o menu pai também
            submenu.style.display = 'block';
            const menuPai = submenu.previousElementSibling;
            if (menuPai && menuPai.classList.contains('menu-parent')) {
                menuPai.classList.add('active');
            }
        }
    }
    
    Object.values(telas).forEach(tela => tela.style.display = 'none'); 
    if (telas[idTela]) { 
        telas[idTela].style.display = 'block'; 
    } 
}
function verificarStatusBackup() {
    // Seleciona tanto o botão da Toolbar quanto o da tela de Configurações
    const backupButtons = document.querySelectorAll('#btn-dashboard-backup, #btn-backup');
    const footer = document.querySelector('.sidebar-footer');
    let alertElement = document.getElementById('backup-alert-footer');

    // Critérios de Alerta
    const limiteAlteracoes = (typeof BACKUP_PROMPT_THRESHOLD !== 'undefined') ? BACKUP_PROMPT_THRESHOLD : 5;
    const diasLimiteSemBackup = 7; 
    
    let deveAlertar = false;
    let mensagemAlerta = '';

    // 1. Verifica por Quantidade
    if (alteracoesDesdeUltimoBackup >= limiteAlteracoes) {
        deveAlertar = true;
        mensagemAlerta = `<span><i class="fas fa-exclamation-triangle"></i> Atenção: ${alteracoesDesdeUltimoBackup} alterações sem Backup</span>`;
    } 
    // 2. Verifica por Tempo
    else if (timestampUltimoBackup) {
        const ultimaData = new Date(timestampUltimoBackup);
        const agora = new Date();
        const diffTempo = Math.abs(agora - ultimaData);
        const diffDias = Math.ceil(diffTempo / (1000 * 60 * 60 * 24));

        if (diffDias > diasLimiteSemBackup && alteracoesDesdeUltimoBackup > 0) {
            deveAlertar = true;
            mensagemAlerta = `<span><i class="fas fa-history"></i> Backup antigo (${diffDias} dias). Atualize.</span>`;
        }
    }

    // Lógica visual do Alerta no Rodapé
    if (deveAlertar) {
        if (!alertElement) {
            alertElement = document.createElement('div');
            alertElement.id = 'backup-alert-footer';
            alertElement.className = 'footer-info backup-alerta-ativo';
            if (footer) {
                footer.prepend(alertElement);
            }
        }
        alertElement.innerHTML = mensagemAlerta;
        
        // Adiciona efeito de piscar
        backupButtons.forEach(btn => btn.classList.add('btn-piscar'));
    } else {
        if (alertElement) {
            alertElement.remove();
        }
        backupButtons.forEach(btn => btn.classList.remove('btn-piscar'));
    }

    // --- CORREÇÃO AQUI ---
    // Atualiza o conteúdo dos botões respeitando o design de cada um
    backupButtons.forEach(btn => {
        // Se for o botão da toolbar do Dashboard (ícone puro)
        if (btn.id === 'btn-dashboard-backup') {
            btn.innerHTML = `<i class="fas fa-save"></i>`; 
            // Dica: Se quiser tooltip dinâmico no futuro, pode alterar o btn.title aqui
        } 
        // Se for o botão grande da tela de Configurações (com texto)
        else {
            btn.innerHTML = `<i class="fas fa-save"></i> Fazer Backup`;
        }
    });
}
function renderizarInfoBackup() {
    const container = document.getElementById('backup-info');
    if (!container) return;

    // Prioriza a variável global (vinda do Firestore) e usa o localStorage como fallback
    const timestamp = timestampUltimoBackup || localStorage.getItem('carteira_ultimo_backup');

    if (timestamp) {
        const data = new Date(timestamp);
        const dataFormatada = data.toLocaleDateString('pt-BR');
        const horaFormatada = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        container.innerHTML = `<span>Último backup: ${dataFormatada} às ${horaFormatada}</span>`;
    } else {
        container.innerHTML = `<span>Último backup: Nunca</span>`;
    }
}
function mostrarFeedbackAtualizacao(mensagem, status) {
    const footerInfo = document.getElementById('market-data-info');
    if (!footerInfo) return;

    // Limpa classes antigas
    footerInfo.classList.remove('update-success', 'update-error');

    // Define a mensagem e a classe de status
    footerInfo.innerHTML = `<span>${mensagem}</span>`;
    if (status === 'success') {
        footerInfo.classList.add('update-success');
    } else if (status === 'error') {
        footerInfo.classList.add('update-error');
    }

    // Se não for um carregamento, remove a cor após um tempo e restaura o texto original
    if (status === 'success' || status === 'error') {
        setTimeout(() => {
            footerInfo.classList.remove('update-success', 'update-error');
            renderizarInfoAtualizacaoMercado(); // Restaura o texto do timestamp
        }, 3000); // A cor de feedback some após 3 segundos
    }
}
function inicializarIconesCalculadora() {
    ['nota-custos', 'op-valor'].forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input && !input.parentElement.classList.contains('input-with-icon')) {
            const wrapper = document.createElement('div');
            wrapper.className = 'input-with-icon';
            input.parentNode.insertBefore(wrapper, input);
            wrapper.appendChild(input);
            wrapper.insertAdjacentHTML('beforeend', ` <i class="fas fa-calculator calculator-icon" data-target-input="${inputId}" title="Abrir calculadora"></i>`);
        }
    });
}
function fecharModalComparacao() {
    const modal = document.getElementById('modal-comparacao-snapshots');
    if (modal) {
        modal.style.display = 'none';
    }

    // 1. Limpa a lista global de seleções
    snapshotsSelecionados = [];

    // 2. Atualiza a tabela de histórico para remover os destaques verdes (classes CSS)
    // e esconder o botão "Comparar" novamente.
    if (typeof renderizarTelaHistoricoSnapshots === 'function') {
        renderizarTelaHistoricoSnapshots();
    }
}
function setupCalculator() {
    const calculator = document.getElementById('floating-calculator');
    calculatorDisplay = document.getElementById('calculator-display');
    const header = calculator.querySelector('.calculator-header');
    
    // Torna a calculadora arrastável
    makeDraggable(calculator, header);

    // Adiciona os listeners de eventos para cliques
    calculator.addEventListener('click', (e) => {
        const target = e.target;
        if (!target.matches('.calc-btn')) return;

        const action = target.dataset.action;
        const value = target.dataset.value;

        switch (action) {
            case 'clear':
                clearCalculatorDisplay();
                break;
            case 'backspace':
                backspaceCalculator();
                break;
            case 'calculate':
                calculateResult();
                break;
            case 'insert':
                insertCalculatorResult();
                break;
            default:
                if (value !== undefined) {
                    appendToCalculatorDisplay(value);
                }
        }
    });
    
    calculator.querySelector('.close-calculator').addEventListener('click', closeCalculator);

    // --- INÍCIO DA ALTERAÇÃO ---
    // Adiciona listener para entrada via teclado
    document.addEventListener('keydown', (e) => {
        // Só executa a lógica se a calculadora estiver visível
        if (calculator.style.display !== 'block') return;

        const key = e.key;
        let buttonToClick = null;

        if (key >= '0' && key <= '9') {
            buttonToClick = calculator.querySelector(`.calc-btn[data-value="${key}"]`);
        } else if (['+', '-', '*', '/'].includes(key)) {
            buttonToClick = calculator.querySelector(`.calc-btn[data-value="${key}"]`);
        } else if (key === '.' || key === ',') {
            buttonToClick = calculator.querySelector(`.calc-btn[data-value="."`);
        } else if (key === 'Enter' || key === '=') {
            e.preventDefault(); // Impede o comportamento padrão do Enter em formulários
            buttonToClick = calculator.querySelector('.calc-btn.equals');
        } else if (key === 'Backspace') {
            buttonToClick = calculator.querySelector('.calc-btn[data-action="backspace"]');
        } else if (key === 'Escape') {
            closeCalculator();
        } else if (key.toLowerCase() === 'c') {
            buttonToClick = calculator.querySelector('.calc-btn[data-action="clear"]');
        }

        if (buttonToClick) {
            buttonToClick.click();
        }
    });
    // --- FIM DA ALTERAÇÃO ---
}

function openCalculator(targetInputId) {
    const target = document.getElementById(targetInputId);
    if (!target) return;
    
    calculatorTargetInput = target;
    const calculator = document.getElementById('floating-calculator');
    
    // Tenta posicionar a calculadora perto do input
    const inputRect = target.getBoundingClientRect();
    calculator.style.left = `${inputRect.left}px`;
    calculator.style.top = `${inputRect.bottom + 5}px`;

    calculator.style.display = 'block';
    clearCalculatorDisplay();
}

function closeCalculator() {
    document.getElementById('floating-calculator').style.display = 'none';
    calculatorTargetInput = null;
}

function appendToCalculatorDisplay(value) {
    if (calculatorDisplay.textContent === '0' || calculatorDisplay.textContent === 'Erro') {
        calculatorDisplay.textContent = value === '.' ? '0.' : value;
    } else {
        calculatorDisplay.textContent += value;
    }
}

function clearCalculatorDisplay() {
    calculatorDisplay.textContent = '0';
}

function backspaceCalculator() {
    let currentText = calculatorDisplay.textContent;
    if (currentText.length > 1 && currentText !== 'Erro') {
        calculatorDisplay.textContent = currentText.slice(0, -1);
    } else {
        calculatorDisplay.textContent = '0';
    }
}

function calculateResult() {
    let expression = calculatorDisplay.textContent.replace(/,/g, '.');
    const sanitizedExpression = expression.replace(/[^\d/*+.]/g, '');
    
    try {
        const result = new Function('return ' + sanitizedExpression)();
        if (isNaN(result) || !isFinite(result)) {
            throw new Error('Cálculo inválido');
        }
        const roundedResult = Number(result.toFixed(6));
        calculatorDisplay.textContent = String(roundedResult).replace(/\./g, ',');

    } catch (error) {
        calculatorDisplay.textContent = 'Erro';
    }
}

function insertCalculatorResult() {
    if (calculatorTargetInput && calculatorDisplay.textContent !== 'Erro') {
        const resultValue = calculatorDisplay.textContent;
        calculatorTargetInput.value = resultValue;
        
        // Dispara um evento de 'change' para que qualquer lógica associada ao campo seja ativada
        calculatorTargetInput.dispatchEvent(new Event('change', { bubbles: true }));
        
        closeCalculator();
    }
}

function makeDraggable(element, handle) {
    let isDragging = false;
    let offsetX, offsetY;

    handle.addEventListener('mousedown', (e) => {
        isDragging = true;
        offsetX = e.clientX - element.offsetLeft;
        offsetY = e.clientY - element.offsetTop;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
        if (!isDragging) return;
        element.style.left = `${e.clientX - offsetX}px`;
        element.style.top = `${e.clientY - offsetY}px`;
    }

    function onMouseUp() {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }
}
