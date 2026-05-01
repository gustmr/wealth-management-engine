function formatarMoeda(valor) {
    // Adição: Garante que valores que arredondam para 0.00 não mostrem sinal negativo.
    if (Math.abs(valor) < 0.005) {
        valor = 0;
    }
    // Símbolo corrigido para R$, mantendo o ponto decimal
    if (typeof valor !== 'number' || isNaN(valor)) return 'R$ 0.00'; 
    
    // Mantém a formatação en-GB (1,000.00), mas força a moeda BRL (R$)
    return valor.toLocaleString('en-GB', { style: 'currency', currency: 'BRL' });
}

/**
 * Formata um valor monetário, decidindo entre a moeda local (BRL) e estrangeira.
 */
function formatarValor(valor, moeda = 'BRL') { // O padrão volta a ser 'BRL'
    if (moeda === 'BRL') {
        return formatarMoeda(valor);
    }
    return formatarMoedaEstrangeira(valor, moeda);
}

function formatarMoedaEstrangeira(valor, moeda) {
    if (typeof valor !== 'number' || isNaN(valor)) valor = 0;
    const opcoes = { style: 'currency', currency: moeda, minimumFractionDigits: 2, maximumFractionDigits: 2 };
    // Omitir o código da moeda se o símbolo for único
    if (moeda === 'USD' || moeda === 'EUR' || moeda === 'GBP') {
        opcoes.currencyDisplay = 'symbol';
    }
    // Alterado para en-GB para garantir pontuação correta (1,000.00)
    return valor.toLocaleString('en-GB', opcoes); 
}


function formatarPercentual(valor) { 
    if (typeof valor !== 'number' || isNaN(valor)) return '0.00%'; 
    // Alterado para en-GB (ponto decimal)
    return (valor * 100).toLocaleString('en-GB', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + '%'; 
}

function formatarDecimal(valor, casas = 2) { 
    if (typeof valor !== 'number' || isNaN(valor)) { 
        const zero = 0; 
        // Alterado para en-GB
        return zero.toLocaleString('en-GB', {minimumFractionDigits: casas, maximumFractionDigits: casas}); 
    } 
    // Alterado para en-GB
    return valor.toLocaleString('en-GB', {minimumFractionDigits: casas, maximumFractionDigits: casas}); 
}
function arredondarMoeda(valor) { 
    if (typeof valor !== 'number' || isNaN(valor)) { return 0; } 
    return Math.round(valor * 100) / 100; 
}

function formatarDecimalParaInput(valor) { 
    if (typeof valor !== 'number' || isNaN(valor)) return ''; 
    // O input HTML type="number" ou texto em inglês espera ponto como decimal
    return String(valor); // Não substitui mais ponto por vírgula
}

function formatarPrecoMedio(valor) { 
    return formatarDecimal(valor, 6); 
}

function formatarValorComCeD(valor) { 
    if (typeof valor !== 'number' || isNaN(valor)) return '0.00C'; 
    const formatado = formatarDecimal(Math.abs(valor)); 
    return valor >= 0 ? `${formatado}C` : `${formatado}D`; 
}

// NOVA FUNÇÃO para padronizar datas no sistema (UK Format: dd/mm/yyyy)
function formatarData(dataString) {
    if (!dataString) return '-';
    // Cria data garantindo fuso horário correto para evitar voltar 1 dia
    const data = new Date(dataString + 'T12:00:00');
    return data.toLocaleDateString('en-GB');
}

function parseDecimal(str) {
    if (!str) return 0;
    if (typeof str === 'number') return str;

    // Etapa 1: Limpa tudo que não for dígito, ponto ou sinal de menos.
    // Removemos a vírgula da lista de permitidos, pois em en-GB ela é separador de milhar e deve ser ignorada.
    const cleanStr = str.toString().replace(/[^\d.-]/g, '');

    const num = parseFloat(cleanStr);
    return isNaN(num) ? 0 : num;
}
function truncarTexto(texto, limite) {
    if (texto.length <= limite) {
        return texto;
    }
    return texto.substring(0, limite) + '...';
}
function normalizarDataParaInput(dataStr) {
    if (!dataStr) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) {
        return dataStr;
    }
    const parts = dataStr.split(/[/.-]/);
    if (parts.length === 3) {
        let [p1, p2, p3] = parts;
        if (p3.length === 4) {
            if (p1.length === 2 && p2.length === 2) {
                return `${p3}-${p2}-${p1}`;
            }
        }
    }
    console.warn(`Formato de data não reconhecido: "${dataStr}". Tentando usar como está.`);
    return dataStr;
}
function formatarCNPJ(cnpj) { if (!cnpj) return ""; cnpj = cnpj.replace(/\D/g, ''); cnpj = cnpj.replace(/^(\d{2})(\d)/, '$1.$2'); cnpj = cnpj.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3'); cnpj = cnpj.replace(/\.(\d{3})(\d)/, '.$1/$2'); cnpj = cnpj.replace(/(\d{4})(\d)/, '$1-$2'); return cnpj; }
function validarCNPJ(cnpj) { cnpj = cnpj.replace(/[^\d]+/g,''); if(cnpj === '' || cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false; let t = cnpj.length - 2, n = cnpj.substring(0,t), d = cnpj.substring(t), s = 0, p = t - 7; for (let i = t; i >= 1; i--) { s += parseInt(n.charAt(t - i)) * p--; if (p < 2) p = 9; } let r = s % 11 < 2 ? 0 : 11 - s % 11; if (r !== parseInt(d.charAt(0))) return false; t = t + 1; n = cnpj.substring(0,t); s = 0, p = t - 7; for (let i = t; i >= 1; i--) { s += parseInt(n.charAt(t - i)) * p--; if (p < 2) p = 9; } r = s % 11 < 2 ? 0 : 11 - s % 11; if (r !== parseInt(d.charAt(1))) return false; return true; }
function calcularDiffDias(dataInicio, dataFim) {
    if (!dataInicio || !dataFim || new Date(dataInicio) > new Date(dataFim)) return 0;
    const umDia = 1000 * 60 * 60 * 24;
    const inicio = new Date(dataInicio + 'T12:00:00');
    const fim = new Date(dataFim + 'T12:00:00');
    return Math.round(Math.abs((fim - inicio) / umDia));
}
function calcularDataLiquidacao(dataInicialStr, diasUteis) {
    if(!dataInicialStr || isNaN(new Date(dataInicialStr).getTime())) return new Date('1970-01-01');
    let dataAtual = new Date(dataInicialStr + 'T12:00:00'); 
    let diasContados = 0;
    const feriadosFormatados = todosOsFeriados.map(f => f.data);
    while (diasContados < diasUteis) {
        dataAtual.setDate(dataAtual.getDate() + 1);
        const diaDaSemana = dataAtual.getDay();
        const dataAtualStr = `${dataAtual.getFullYear()}-${String(dataAtual.getMonth() + 1).padStart(2, '0')}-${String(dataAtual.getDate()).padStart(2, '0')}`;
        if (diaDaSemana !== 0 && diaDaSemana !== 6 && !feriadosFormatados.includes(dataAtualStr)) {
            diasContados++;
        }
    }
    return dataAtual;
}
function getProximaDataUtil(dataStr) {
    if (!dataStr) return null;
    
    // Cria o objeto data (forçando meio-dia para evitar problemas de fuso)
    let data = new Date(dataStr + 'T12:00:00');
    
    // Avança pelo menos um dia
    data.setDate(data.getDate() + 1);

    // Continua avançando enquanto não for dia útil
    while (!isDiaUtil(data)) {
        data.setDate(data.getDate() + 1);
    }

    return data.toISOString().split('T')[0];
}
/**
 * Verifica se uma data é um feriado.
 * @param {Date} data - O objeto Date a ser verificado.
 * @returns {boolean}
 */
function isFeriado(data) {
    // Formata a data para 'AAAA-MM-DD' para comparar com a lista de feriados
    const dataStr = data.toISOString().split('T')[0];
    return todosOsFeriados.some(f => f.data === dataStr);
}

/**
 * Verifica se uma data é sábado (6) ou domingo (0).
 * @param {Date} data - O objeto Date a ser verificado.
 * @returns {boolean}
 */
function isFimDeSemana(data) {
    const diaDaSemana = data.getDay();
    return diaDaSemana === 0 || diaDaSemana === 6;
}

/**
 * Verifica se uma data é um dia útil (não é fim de semana nem feriado).
 * @param {Date} data - O objeto Date a ser verificado.
 * @returns {boolean}
 */
function isDiaUtil(data) {
    return !isFimDeSemana(data) && !isFeriado(data);
}