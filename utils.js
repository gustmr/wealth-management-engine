// Utility Functions and Formatting // Funções Utilitárias e Formatações
function formatarMoeda(valor) {
    // Adição: Garante que valores que arredondam para 0,00 não mostrem sinal negativo.
    if (Math.abs(valor) < 0.005) {
        valor = 0;
    }
    if (typeof valor !== 'number' || isNaN(valor)) return 'R$ 0,00';
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function formatarMoedaEstrangeira(valor, moeda) {
    if (typeof valor !== 'number' || isNaN(valor)) valor = 0;
    const opcoes = { style: 'currency', currency: moeda, minimumFractionDigits: 2, maximumFractionDigits: 2 };
    // Omitir o código da moeda (USD, EUR) para um visual mais limpo se o símbolo for único
    if (moeda === 'USD' || moeda === 'EUR' || moeda === 'GBP') {
        opcoes.currencyDisplay = 'symbol';
    }
    return valor.toLocaleString('en-US', opcoes); // Usar 'en-US' para garantir o formato correto do símbolo
}
function formatarValor(valor, moeda = 'BRL') {
    if (moeda === 'BRL') {
        return formatarMoeda(valor);
    }
    return formatarMoedaEstrangeira(valor, moeda);
}
function formatarPercentual(valor) { if (typeof valor !== 'number' || isNaN(valor)) return '0,00%'; return (valor * 100).toFixed(2).replace('.', ',') + '%'; }
function formatarDecimal(valor, casas = 2) { if (typeof valor !== 'number' || isNaN(valor)) { const zero = 0; return zero.toFixed(casas).replace('.', ','); } return valor.toFixed(casas).replace('.', ','); }
function arredondarMoeda(valor) { if (typeof valor !== 'number' || isNaN(valor)) { return 0; } return Math.round(valor * 100) / 100; }
function formatarDecimalParaInput(valor) { if (typeof valor !== 'number' || isNaN(valor)) return ''; return String(valor).replace('.', ',');}
function formatarPrecoMedio(valor) { return formatarDecimal(valor, 6); }
function formatarValorComCeD(valor) { if (typeof valor !== 'number' || isNaN(valor)) return '0,00C'; const formatado = formatarDecimal(Math.abs(valor)); return valor >= 0 ? `${formatado}C` : `${formatado}D`; }
function parseDecimal(str) {
    if (!str || typeof str !== 'string') return 0;

    // Etapa 1 (CORRIGIDA): Limpa tudo que não for dígito, vírgula, ponto ou sinal de menos.
    // Isso remove "R$", espaços normais, espaços não-quebráveis (nbsp), etc. de forma robusta.
    const cleanStr = str.replace(/[^\d,.-]/g, '');

    // Etapa 2: A lógica para determinar o separador decimal (vírgula ou ponto) continua a mesma.
    const lastComma = cleanStr.lastIndexOf(',');
    const lastDot = cleanStr.lastIndexOf('.');
    let numberStr;

    if (lastComma > lastDot) {
        // Formato brasileiro (ex: 1.234,56) -> remove pontos de milhar, troca vírgula por ponto decimal.
        numberStr = cleanStr.replace(/\./g, '').replace(',', '.');
    } else {
        // Formato americano (ex: 1,234.56) ou sem separador de milhar -> remove vírgulas.
        numberStr = cleanStr.replace(/,/g, '');
    }

    const num = parseFloat(numberStr);
    return isNaN(num) ? 0 : num;
}
function formatarIntervaloDias(totalDias) {
    if (isNaN(totalDias) || totalDias <= 0) return "-";

    const diasPorMesMedio = 365.25 / 12;
    
    const anos = Math.floor(totalDias / 365.25);
    const diasRestantesAposAnos = totalDias % 365.25;
    const meses = Math.floor(diasRestantesAposAnos / diasPorMesMedio);
    const dias = Math.round(diasRestantesAposAnos % diasPorMesMedio);

    let partes = [];
    if (anos > 0) partes.push(`${anos} ano${anos > 1 ? 's' : ''}`);
    if (meses > 0) partes.push(`${meses} mes${meses > 1 ? 'es' : ''}`);
    // Mostra dias se for a única unidade ou se houver anos/meses. Evita mostrar "0 dias" se for exatamente X meses.
    if (dias > 0 || partes.length === 0) partes.push(`${dias} dia${dias !== 1 ? 's' : ''}`);
    
    return partes.join(', ');
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
function getPrimeiraData() { const datas = []; todasAsNotas.forEach(n => datas.push(new Date(n.data))); posicaoInicial.forEach(p => { if(p.data) datas.push(new Date(p.data)) }); todosOsAjustes.forEach(a => datas.push(new Date(a.data))); if (datas.length === 0) return null; const dataMaisAntiga = new Date(Math.min.apply(null, datas)); return dataMaisAntiga.toLocaleDateString('pt-BR', {timeZone: 'UTC'}); }
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
function isLeap(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
function obterCor(index) {
    const cores = [
        '#e6194B', '#3cb44b', '#ffe119', '#4363d8', '#f58231', 
        '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#fabed4', 
        '#469990', '#dcbeff', '#9A6324', '#fffac8', '#800000', 
        '#aaffc3', '#808000', '#ffd8b1', '#000075', '#a9a9a9'
    ];
    return cores[index % cores.length];
}
function invalidarCacheInicios() {
    cacheInicioIninterrupto = null;
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
function isFeriado(data) {
    // Formata a data para 'AAAA-MM-DD' para comparar com a lista de feriados
    const dataStr = data.toISOString().split('T')[0];
    return todosOsFeriados.some(f => f.data === dataStr);
}
function isFimDeSemana(data) {
    const diaDaSemana = data.getDay();
    return diaDaSemana === 0 || diaDaSemana === 6;
}
function isDiaUtil(data) {
    return !isFimDeSemana(data) && !isFeriado(data);
}