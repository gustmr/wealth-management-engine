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
// Adicione esta nova função
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
const setupUniversalTransactionModal = () => {
    const debitoSelect = document.getElementById('transacao-moeda-conta-debito');
    const creditoSelect = document.getElementById('transacao-moeda-conta-credito');
    const valorCreditoContainer = document.getElementById('container-valor-credito');
    const simboloDebito = document.getElementById('transacao-moeda-simbolo-debito');
    const simboloCredito = document.getElementById('transacao-moeda-simbolo-credito');
    const infoCambio = document.getElementById('info-cambio');
    const valorCreditoInput = document.getElementById('transacao-moeda-valor-credito');
    const valorDebitoInput = document.getElementById('transacao-moeda-valor-debito');
    const labelValor = document.querySelector('#form-nova-transacao-moeda label[for="transacao-moeda-valor-debito"]');

    const getMoedaInfo = (value) => {
        if (!value) return { tipo: null, moeda: 'BRL' };
        const [tipo, id] = value.split('_');
        if (tipo === 'brl') return { tipo: 'brl', moeda: 'BRL' };
        const ativo = todosOsAtivosMoedas.find(a => a.id == id);
        return { tipo: 'moeda', moeda: ativo ? ativo.moeda : '???' };
    };

    const getSimbolo = (moeda) => {
        switch(moeda) {
            case 'USD': return '$';
            case 'EUR': return '€';
            case 'GBP': return '£';
            default: return 'R$';
        }
    };

    const updateUI = () => {
        const isEditing = document.getElementById('transacao-moeda-transferencia-id').value !== '';
        const infoDebito = getMoedaInfo(debitoSelect.value);
        const infoCredito = getMoedaInfo(creditoSelect.value);

        labelValor.textContent = 'Valor do Lançamento';
        if (debitoSelect.value) {
            simboloDebito.textContent = getSimbolo(infoDebito.moeda);
            simboloDebito.style.display = 'inline';
        } else if (creditoSelect.value) {
            simboloDebito.textContent = getSimbolo(infoCredito.moeda);
            simboloDebito.style.display = 'inline';
        } else {
            simboloDebito.textContent = '';
            simboloDebito.style.display = 'none';
        }
        if (debitoSelect.value && creditoSelect.value) {
            labelValor.textContent = 'Valor do Débito';
        }
        
        simboloCredito.textContent = getSimbolo(infoCredito.moeda);

        if (infoDebito.moeda !== infoCredito.moeda && debitoSelect.value && creditoSelect.value) {
            valorCreditoContainer.style.display = 'block';
            const cotacaoDebito = infoDebito.moeda === 'BRL' ? 1 : (dadosMoedas.cotacoes[infoDebito.moeda] || 0);
            const cotacaoCredito = infoCredito.moeda === 'BRL' ? 1 : (dadosMoedas.cotacoes[infoCredito.moeda] || 0);
            
            if (cotacaoCredito > 0 && cotacaoDebito > 0) {
                const valorDebitoEmBRL = parseDecimal(valorDebitoInput.value) * cotacaoDebito;
                
                if (!isEditing) {
                    const valorCreditoSugerido = parseFloat((valorDebitoEmBRL / cotacaoCredito).toFixed(2));
                    if(document.activeElement !== valorCreditoInput) {
                        valorCreditoInput.value = formatarDecimalParaInput(valorCreditoSugerido);
                    }
                }

                infoCambio.textContent = `Cotação Sugerida: 1 ${infoDebito.moeda} ≈ ${formatarMoedaEstrangeira(cotacaoDebito / cotacaoCredito, infoCredito.moeda)}`;
            } else {
                 infoCambio.textContent = `Cotação para ${infoCredito.moeda} ou ${infoDebito.moeda} não encontrada.`;
            }

        } else {
            valorCreditoContainer.style.display = 'none';
            valorCreditoInput.value = '';
            infoCambio.textContent = '';
        }
    };

    debitoSelect.addEventListener('change', updateUI);
    creditoSelect.addEventListener('change', updateUI);
    valorDebitoInput.addEventListener('input', updateUI);
};
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



function clearCalculatorDisplay() {
    calculatorDisplay.textContent = '0';
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
function appendToCalculatorDisplay(value) {
    if (calculatorDisplay.textContent === '0' || calculatorDisplay.textContent === 'Error') {
        calculatorDisplay.textContent = value === '.' ? '0.' : value;
    } else {
        calculatorDisplay.textContent += value;
    }
}

function backspaceCalculator() {
    let currentText = calculatorDisplay.textContent;
    if (currentText.length > 1 && currentText !== 'Error') {
        calculatorDisplay.textContent = currentText.slice(0, -1);
    } else {
        calculatorDisplay.textContent = '0';
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


function calculateResult() {
    let expression = calculatorDisplay.textContent;
    const sanitizedExpression = expression.replace(/[^\d/*+.-]/g, '');
    
    try {
        const result = new Function('return ' + sanitizedExpression)();
        if (isNaN(result) || !isFinite(result)) {
            throw new Error('Invalid Calculation');
        }
        const roundedResult = Number(result.toFixed(6));
        calculatorDisplay.textContent = String(roundedResult);

    } catch (error) {
        calculatorDisplay.textContent = 'Error';
    }
}

function insertCalculatorResult() {
    if (calculatorTargetInput && calculatorDisplay.textContent !== 'Error') {
        const resultValue = calculatorDisplay.textContent;
        calculatorTargetInput.value = resultValue;
        
        calculatorTargetInput.dispatchEvent(new Event('change', { bubbles: true }));
        
        closeCalculator();
    }
}