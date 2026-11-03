/* Leitor de contratos — extrai campos do texto do PDF por regras (sem IA).
   Uso: LeitorContrato.extrair(texto, nomeDoArquivo) → {campo: valor, ...} */
(function (root) {
  "use strict";
  const MESES = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
  const NUMEXT = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezoito: 18, vinte: 20, trinta: 30, quarenta: 40, sessenta: 60, noventa: 90, cento: 100, cem: 100, "cento e vinte": 120, "cento e oitenta": 180, trezentos: 300 };
  const SV = /s[aã]o\s+vicente\s+de\s+minas|latic[ií]nios\s+s[aã]o\s+vicente|porto\s+del\s+rey|\blsv\b|86\.?454\.?741/i;

  const isSV = t => SV.test(t) || /saovicente|portodelrey|86454741/.test(String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,''));
  const semAcento = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const low = s => semAcento(s).toLowerCase();
  const pad = n => String(n).padStart(2, "0");
  const isoDate = (y, m, d) => {
    y = +y; m = +m; d = +d; if (y < 100) y += 2000;
    if (!(y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    return `${y}-${pad(m)}-${pad(d)}`;
  };
  const addPrazo = (iso, n, un) => {
    if (!iso || !n) return null;
    const d = new Date(iso + "T00:00:00");
    if (/^ano/.test(un)) d.setFullYear(d.getFullYear() + n);
    else if (/^mes/.test(un)) d.setMonth(d.getMonth() + n);
    else d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const brNum = s => { const n = parseFloat(String(s).replace(/\s/g, "").replace(/\./g, "").replace(",", ".")); return isFinite(n) ? n : null; };

  /* datas dentro de um trecho, em ordem: dd/mm/aaaa, dd.mm.aaaa, "10 de maio de 2024" */
  function datas(t) {
    const out = [];
    const re = /\b(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{2,4})\b|\b(\d{1,2})(?:º|°|o)?\s+de\s+([a-zç]+)\s+de\s+(\d{4})\b/gi;
    let m;
    while ((m = re.exec(t))) {
      let iso = null;
      if (m[1]) iso = isoDate(m[3], m[2], m[1]);
      else { const mm = MESES[low(m[5])]; if (mm) iso = isoDate(m[6], mm, m[4]); }
      if (iso) out.push({ iso, i: m.index });
    }
    return out;
  }
  function numero(s) {
    s = low(s).trim();
    if (/^\d+$/.test(s)) return +s;
    for (const k of Object.keys(NUMEXT).sort((a, b) => b.length - a.length)) if (s.startsWith(k)) return NUMEXT[k];
    return null;
  }

  function extrair(texto, arquivo) {
    const T = String(texto || "").replace(/\r/g, "").replace(/[ \t]+/g, " ");
    const flat = T.replace(/\s*\n\s*/g, " ");
    const L = low(flat);
    const r = {}; const notas = [];

    /* ---------- partes ---------- */
    const papeis = "contratad[ao]|locador[a]?|prestador[a]?(?: de servi[cç]os?)?|fornecedor[a]?|comodante|cedente|outorgad[ao]|segurador[a]|vendedor[a]";
    const papeisSV = "contratante|locat[aá]ri[ao]|tomador[a]?|comodat[aá]ri[ao]|cession[aá]ri[ao]|outorgante|segurad[ao]|comprador[a]";
    const limpaNome = s => {
      s = String(s).replace(/^\s*(?:\d{1,2}|[a-z]|[IVX]{1,4})\s*[).\-–]\s+/, "").replace(/^[\s:,\-–—.]*(a\s+|o\s+)?(empresa|sociedade|raz[aã]o social|nome(?: empresarial)?)\s*[:\-–]?\s*/i, "")
        .replace(/^(?:a|o)\s+(?=[A-ZÀ-Ú])/, "")
        .replace(/\s*[,;(].*$/, "")
        .replace(/\s+(?:pessoa jur[ií]dica|inscrit[ao]|com sede|sociedade (?:empres[aá]ria|limitada|an[oô]nima)|portador|brasileir[ao]|estabelecid[ao]|situad[ao]|doravante|neste ato|cnpj|cpf|com endere[cç]o|devidamente).*$/i, "")
        .replace(/[\s.:–—-]+$/, "").trim();
      return s.length >= 3 && s.length <= 140 ? s : null;
    };
    let empresa = null;
    { const reDen = /(?:doravante|neste\s+ato|simplesmente)\s+(?:designad|denominad|chamad)[ao]s?\s+(?:simplesmente\s+)?(?:(?:["“][^"”]{1,40}["”]|[A-ZÀ-Ú ]{2,30})\s+ou\s+)?(?:apenas\s+)?(contratad[ao]|locador[a]?|prestador[a]?|fornecedor[a]?|comodante|cedente|segurador[a])\b/gi;
      let d; while (!empresa && (d = reDen.exec(flat))) {
        const antes = flat.slice(Math.max(0, d.index - 420), d.index);
        const partes = antes.split(/\b(?:CONTRATANTE|LOCAT[AÁ]RI[AO]|TOMADOR[A]?)\s*[.,]?\s*(?:e|E)\s+|\b(?:CONTRATAD[AO]|LOCADOR[A]?|PRESTADOR[A]?|OPERADORA|FORNECEDOR[A]?)\s*:\s*|raz[aã]o\s+social\s*:?\s*|de\s+outro\s+lado,?\s*|;\s+|\s\d+\.\d+\s+/);
        const seg = partes[partes.length - 1].replace(/^.*?\b(?:qualifica[cç][aã]o d[ao] [a-zà-ú]+)\s*/i, "");
        const ateCnpj = seg.split(/,?\s+(?:inscrit|cnpj|com sede|sediad|pessoa jur|estabelecid|nome fantasia|com endere|sociedade (?:empres|limitada|an[oô]n))/i)[0];
        let n = ateCnpj.length <= 130 && ateCnpj.includes(",") ? limpaNome(ateCnpj.replace(/,/g, "\u0001")) : limpaNome(seg); if (n) n = n.replace(/\u0001\s*/g, ", ").replace(/\s+,/g, ",");
        if (n && /^[A-ZÀ-Ú0-9]/.test(n) && n.length >= 4 && !isSV(n) && !/contrato|cl[aá]usula|^(?:doravante|representad)/i.test(n)) empresa = n;
      } }
    { const rs = flat.match(new RegExp(`(?:${papeis})[^]{0,80}?raz[aã]o\\s+social\\s*[:\\-–]\\s*([^]{3,160})`, 'i')); if (rs) { const n = limpaNome(rs[1]); if (n && !SV.test(n) && !/contrato|cl[aá]usula|---/i.test(n)) empresa = n; } }
    const reParte = new RegExp(`(?:^|[\\s.;:)])(${papeis})\\s*(?:\\(a\\))?\\s*[:\\-–—]\\s*([^]{3,260})`, "gi");
    let m;
    while (!empresa && (m = reParte.exec(flat))) {
      const trecho = m[2];
      if (isSV(trecho.slice(0, 90))) continue;
      const n = limpaNome(trecho);
      if (n && !isSV(n) && !/^(?:e|ou|da|do|que|a|o|as|os|[IVX]+\.)(?:\s|$)/i.test(n) && /[A-ZÀ-Ú]/.test(n[0]) && !/_{3,}|---|\bcontrato\b|cl[aá]usula|testemunha|assinatura|poder[aá]|dever[aá]|ser[aá]\b|\bobriga/i.test(n) && n.split(' ').length <= 14) { empresa = n; break; }
    }
    if (!empresa) {
      /* "... de um lado ... e, de outro lado, XYZ LTDA, inscrita ..." ou primeira razão social que não é a SVSA */
      const STOP = /^(?:DE|DO|DA|DOS|DAS|E|OU|PELA|PELO|EM|COM|PARA|A|O|AS|OS|COMODATO|EQUIPAMENTOS?|SISTEMA|CESS[AÃ]O|COMERCIALIZADO|DESENVOLVIDO|SUPORTE|T[EÉ]CNICO|MANUTEN[CÇ][AÃ]O|LICEN[CÇ]A|USO|CONTRATO|SERVI[CÇ]OS?|PRESTA[CÇ][AÃ]O|MINAS|VICENTE|S[AÃ]O)$/i;
      const reRS = /((?:[A-ZÀ-Ú0-9&][A-ZÀ-Úa-zà-ú0-9&.\-']*\s+){1,7}?(?:LTDA|Ltda|S\.?\/?A\.?|S\/A|EIRELI|EPP|SOCIEDADE DE ADVOGADOS|Sociedade de Advogados|ADVOGADOS|Associados))(?![A-Za-zÀ-ú])/g;
      while ((m = reRS.exec(flat))) {
        if (isSV(flat.slice(Math.max(0, m.index - 45), m.index + m[1].length))) continue;
        const w = m[1].trim().split(/\s+/); while (w.length > 1 && STOP.test(w[0])) w.shift();
        const n = limpaNome(w.join(" ")); if (n && w.length >= 2 && !isSV(n) && !/contrato|cl[aá]usula/i.test(n)) { empresa = n; break; } }
    }
    if (empresa) r.empresa = empresa.replace(/\s{2,}/g, " ");

    /* CNPJ da contratada (vai para observações) */
    const cnpjs = [...flat.matchAll(/\b(\d{2}\.?\d{3}\.?\d{3}\s?\/\s?\d{4}\s?-\s?\d{2})\b/g)].map(x => x[1].replace(/\s/g, ""));
    const cnpjOutro = cnpjs.find(c => !/^86\.?454\.?741/.test(c));
    if (cnpjOutro) notas.push(`CNPJ da contratada: ${cnpjOutro}`);

    /* ---------- unidades (pelo endereço/CNPJ da SVSA) ---------- */
    const un = new Set();
    for (const c of flat.matchAll(/86\.?\s?454\.?\s?741\s?\/\s?(\d{4})/g)) { const f = c[1]; if (f === "0001") un.add("Matriz"); else if (f === "0004") un.add("Ritápolis"); else if (f === "0005") un.add("Perdões"); }
    if (!un.size) {
      const iSV = flat.search(SV);
      const blocoSV = iSV >= 0 ? low(flat.slice(Math.max(0, iSV - 40), iSV + 500)).split(/representad|residente|domiciliad/)[0] : "";
      const marca = (re, u) => { if (re.test(blocoSV)) un.add(u); };
      marca(/ritapolis/, "Ritápolis"); marca(/perdoes/, "Perdões"); marca(/belo horizonte/, "Sede BH"); marca(/centro de distribui/, "CD");
      if (!un.size && /sao vicente de minas\s*[\/\-–—,]?\s*(?:mg|minas gerais|estado)/.test(blocoSV)) un.add("Matriz");
    }
    if (/todas as unidades|todas as filiais/.test(L)) ["Ritápolis", "Perdões", "CD", "Matriz", "Sede BH"].forEach(u => un.add(u));
    if (un.size) r.unidades = [...un];

    /* ---------- objeto ---------- */
    const reObj = /(?:tem\s+(?:como|por)\s+objet(?:o|ivo)|constitui\s+objeto(?:\s+d[oe]ste\s+(?:contrato|instrumento))?|objeto\s+d[oe]\s+presente\s+(?:contrato|instrumento)\s+(?:é|e|consiste\s+(?:em|na|no))|o\s+objeto\s+d[oe]ste\s+(?:contrato|instrumento)\s+(?:é|e)|cl[aá]usula\s+(?:primeira|1[ªa]?)\s*[-–—:.]?\s*(?:d[oa]s?\s+)?objeto\s*[:.\-–—]?|servi[cç]os\s+d[ao]\s+contratad[ao]\s+consistir[aã]o\s+em|o\s+presente\s+contrato\s+(?:visa|consiste\s+(?:em|na|no)))\s*[:,]?\s*([^]{15,420})/i;
    m = flat.match(reObj);
    if (m) {
      let o = m[1].replace(/^(?:a|o|as|os)\s+(?=[a-zà-ú])/i, s => s).replace(/\s+/g, " ");
      const corte = o.search(/(?<!\b(?:n|art|inc|sr|sra|dr|ltda|s\.a|nº|n\.º))\.\s+(?:[A-ZÀ-Ú0-9]|§|par[aá]grafo|cl[aá]usula)|\s(?:par[aá]grafo|§)\s*(?:[uú]nico|primeiro|1)|\s\d+\.\d+\s/i);
      if (corte > 20) o = o.slice(0, corte); else if (o.length >= 200) o = o.slice(0, 280).replace(/\s\S*$/, "") + "…";
      o = o.replace(/[;,:\s]+$/, "");
      if (o.length > 300) o = o.slice(0, 297).replace(/\s\S*$/, "") + "…";
      o = o.replace(/^(?:\d+(?:\.\d+)*\.?\s+)?(?:o\s+presente\s+(?:instrumento|contrato)\s+tem\s+(?:por|como)\s+objeto\s+)?/i, "");
      r.objeto = o.charAt(0).toUpperCase() + o.slice(1);
    }

    /* ---------- prazos ---------- */
    const indeterminado = /prazo\s+indeterminado|tempo\s+indeterminado|vig[eê]ncia\s+indeterminada/i.test(flat);
    let inicio = null, termino = null;
    /* intervalo explícito: "de 10/05/2024 a 09/05/2025", "com início em X e término em Y" */
    const reInt = /(?:vig[eê]ncia|prazo|per[ií]odo|vigorar[aá]?)[^.]{0,140}?(?:de|a partir de|in[ií]cio em|iniciando(?:-se)? em|com in[ií]cio em|entre)\s+(\d{1,2}\s*[\/.\-]\s*\d{1,2}\s*[\/.\-]\s*\d{2,4}|\d{1,2}º?\s+de\s+[a-zç]+\s+de\s+\d{4})\s*(?:,|\s)\s*(?:a|at[eé]|e\s+t[eé]rmino\s+em|e|com\s+t[eé]rmino\s+em|terminando\s+em)\s+(\d{1,2}\s*[\/.\-]\s*\d{1,2}\s*[\/.\-]\s*\d{2,4}|\d{1,2}º?\s+de\s+[a-zç]+\s+de\s+\d{4})/i;
    m = flat.match(reInt);
    if (m) { const a = datas(m[1])[0], b = datas(m[2])[0]; if (a && b && b.iso > a.iso) { inicio = a.iso; termino = b.iso; } }
    if (!inicio) {
      m = flat.match(/(?:a\s+partir\s+de|in[ií]cio\s+(?:em|no\s+dia|a\s+partir\s+de)|iniciando(?:-se)?\s+em|com\s+in[ií]cio\s+em|vigorar[aá]?\s+(?:a\s+partir|desde)\s+(?:de|do\s+dia)?)\s*(?:o\s+dia\s+)?(\d{1,2}\s*[\/.\-]\s*\d{1,2}\s*[\/.\-]\s*\d{2,4}|\d{1,2}º?\s+de\s+[a-zç]+\s+de\s+\d{4})/i);
      if (m) { const a = datas(m[1])[0]; if (a) inicio = a.iso; }
    }
    /* prazo em meses/anos/dias */
    let prazo = null;
    m = flat.match(/(?:prazo|vig[eê]ncia|vigorar[aá]?|per[ií]odo|dura[cç][aã]o)[^.]{0,90}?(?:de|por)\s+(\d{1,3}|[a-zç]+(?:\s+e\s+[a-zç]+)?)\s*(?:\([^)]{0,40}\)\s*)?(anos?|m[eê]s(?:es)?|dias)\b/i);
    if (m) { const n = numero(m[1]); const u = low(m[2]); if (n && n < 400 && !(/^dia/.test(u) && n < 90)) prazo = { n, un: u }; }
    /* data de assinatura: "Cidade, 10 de maio de 2024" (última data por extenso do texto) */
    let assinatura = null;
    const porExtenso = [...flat.matchAll(/[A-ZÀ-Ú][a-zà-ú]+(?:\s+(?:d[eoa]s?\s+)?[A-ZÀ-Ú][a-zà-ú]+)*\s*(?:[\/\-–—]\s*MG)?\s*,\s*(\d{1,2})º?\s+de\s+([a-zç]+)\s+de\s+(\d{4})/gi)];
    if (porExtenso.length) { const x = porExtenso[porExtenso.length - 1]; const mm = MESES[low(x[2])]; if (mm) assinatura = isoDate(x[3], mm, x[1]); }
    if (!inicio && /(?:a\s+partir|a\s+contar)\s+d[ae]\s+(?:sua\s+|data\s+de\s+|da\s+)?assinatura/i.test(flat) && assinatura) { inicio = assinatura; notas.push("Início considerado na data de assinatura"); }
    if (!inicio && assinatura) { inicio = assinatura; notas.push("Início estimado pela data de assinatura — conferir"); }
    if (!termino && prazo && inicio && !indeterminado) termino = addPrazo(inicio, prazo.n, prazo.un);
    if (!termino) {
      m = flat.match(/(?:t[eé]rmino|terminar[aá]|encerrar-se-[aá]|at[eé]\s+o\s+dia|v[aá]lid[oa]\s+at[eé]|vigente\s+at[eé])\s*(?:em|no\s+dia|previsto\s+para)?\s*(\d{1,2}\s*[\/.\-]\s*\d{1,2}\s*[\/.\-]\s*\d{2,4}|\d{1,2}º?\s+de\s+[a-zç]+\s+de\s+\d{4})/i);
      if (m) { const b = datas(m[1])[0]; if (b && (!inicio || b.iso > inicio)) termino = b.iso; }
    }
    if (inicio) r.inicio = inicio;
    if (termino && !indeterminado) r.termino = termino;
    if (indeterminado) notas.push("Prazo indeterminado");
    if (prazo) notas.push(`Prazo: ${prazo.n} ${prazo.un}`);

    /* ---------- renovação, avisos ---------- */
    if (/(?:renova(?:d[oa]s?|r-se-[aá]|ção)|prorroga(?:d[oa]s?|r-se-[aá]|ção))\s+(?:de\s+forma\s+)?autom[aá]tic|autom[aá]tica(?:mente)?\s+(?:renovad|prorrogad)|t[aá]cita(?:mente)?\s+(?:renovad|prorrogad)|(?:renovad|prorrogad)[oa]s?\s+(?:t[aá]cita|sucessiva)/i.test(flat)
        && !/n[aã]o\s+(?:haver[aá]|ser[aá])\s+(?:renova[cç][aã]o|prorroga[cç][aã]o)\s+autom/i.test(flat)) r.renovAuto = "Sim";
    else if (/n[aã]o\s+(?:haver[aá]|ser[aá]|ocorrer[aá])\s+(?:renova|prorroga)|vedada\s+a\s+(?:renova|prorroga)[cç][aã]o\s+(?:t[aá]cita|autom)|renova[cç][aã]o\s+(?:somente|apenas)\s+(?:mediante|por)/i.test(flat)) r.renovAuto = "Não";

    const reAv = /(\d{1,3}|[a-zç]+(?:\s+e\s+[a-zç]+)?)\s*(?:\([^)]{0,30}\)\s*)?dias(?:\s+corridos|\s+[uú]teis)?(?:\s+de)?\s+(?:anteced[eê]ncia|aviso|pr[eé]vio\s+aviso)|(?:anteced[eê]ncia|aviso\s+pr[eé]vio|pr[eé]vio\s+aviso|pr[eé]-aviso|notifica[cç][aã]o\s+pr[eé]via)[^.]{0,40}?(?:de|com)\s+(?:no\s+m[ií]nimo\s+|pelo\s+menos\s+|m[ií]nim[ao]\s+de\s+)?(\d{1,3}|[a-zç]+(?:\s+e\s+[a-zç]+)?)\s*(?:\([^)]{0,30}\)\s*)?dias/gi;
    while ((m = reAv.exec(flat))) {
      const n = numero(m[1] || m[2]); if (!n || n > 400) continue;
      const ctx = low(flat.slice(Math.max(0, m.index - 260), m.index + m[0].length + 160));
      const pre = low(flat.slice(Math.max(0, m.index - 260), m.index + m[0].length));
      const ren = /renova|prorroga|nao\s+interesse\s+(?:na|em)\s+(?:sua\s+)?(?:renova|continu)|nao\s+renova/.test(pre);
      const res = /rescis|rescindi|resili|denunci|denuncia|cancel|distrat|rompi|encerra/.test(ctx);
      if (res && r.rescDias == null) r.rescDias = n;
      else if (ren && !res && r.avisoDias == null) r.avisoDias = n;
    }

    /* ---------- valores ---------- */
    const reVal = /R\$\s*([\d.]{1,12},\d{2}|\d{1,3}(?:\.\d{3})+(?=\s*\())(?![\d,])/g; const vals = [];
    const ruim = /seguro|cobertura|morte|invalidez|despesas medicas|multa|penalidade|indeniza|capital social|limite|franquia|caucao|garantia|excedente|hora tecnica|por hora|por km|quilometr|por litro|implantacao|setup|adesao|faturamento|ate r\$|valor (?:total|global) do contrato|da-se|dando ao presente|bonifica|desconto/;
    while ((m = reVal.exec(flat))) {
      const v = brNum(m[1]); if (!v || v < 1) continue;
      const antes = low(flat.slice(Math.max(0, m.index - 70), m.index)), depois = low(flat.slice(m.index + m[0].length, m.index + m[0].length + 110));
      let sc = 0;
      if (/(?:valor|aluguel|pagamento|preco|remuneracao|honorarios?|importancia|quantia|mensalidade)\s+(?:fixo\s+)?mensa|mensalidade|mensal de|mensais de|por mes|ao mes|aluguel de/.test(antes)) sc += 3;
      if (/^[^.;]{0,90}(?:por mes|ao mes|mensa|mes a mes|\/mes|a cada mes|cada mes)/.test(depois)) sc += 2;
      if (ruim.test(antes.slice(-60)) || /^[^.;]{0,40}(?:a r\$|reais mes – )/.test(depois)) sc -= 4;
      vals.push({ v, sc });
    }
    const mens = vals.filter(x => x.sc >= 2).sort((a, b) => b.sc - a.sc);
    if (mens.length) r.valor = mens[0].v;
    m = flat.match(/reajust[a-z]*[^.]{0,160}?\b(IPCA(?:-E)?|IGP-?M|INPC|IGP-?DI|IPC-?A|IPC-?FIPE)\b/i) || flat.match(/\b(IPCA|IGP-?M|INPC)\b[^.]{0,80}reajust/i);
    if (m) notas.push(`Reajuste anual pelo ${m[1].toUpperCase()}`);
    else { m = flat.match(/reajust[a-z]*[^.]{0,80}?(\d{1,2}(?:,\d{1,2})?)\s*%/i); if (m) { const p = brNum(m[1]); if (p && p < 30) r.reaj = p; } }

    /* ---------- multa ---------- */
    const multaRes = flat.match(/multa[^.]{0,220}?(?:rescis|resili|rompimento|cancelamento|antecipad|quebra\s+de\s+contrato|denuncia)|(?:rescis|resili|rompimento|cancelamento\s+antecipad)[^.]{0,220}?multa/i);
    if (multaRes) {
      r.multa = "Sim";
      const mv = multaRes[0].match(/R\$\s*([\d.]{1,12},\d{2})/); if (mv) r.valorMulta = brNum(mv[1]);
      const mp = multaRes[0].match(/(\d{1,3}(?:,\d+)?)\s*%|(\d+|[a-zç]+)\s*\(?[^)]{0,20}\)?\s*(?:mensalidades|alugu[eé]is|parcelas)/i);
      if (mp) notas.push(`Multa rescisória: ${mp[0].trim()}`);
    } else if (/multa/i.test(flat)) r.multa = "Não";

    /* ---------- tipo ---------- */
    r.tipo = r.valor != null || /mensal|presta[cç][aã]o\s+de\s+servi[cç]os\s+cont[ií]nu|loca[cç][aã]o|assinatura|licen[cç]a\s+de\s+uso|fretamento/i.test(flat) ? "Recorrente" : "Específico";

    /* ---------- setor ---------- */
    const base = low((r.objeto || "") + " " + (r.objeto || "") + " " + flat.slice(0, 6000));
    const S = {
      "Captação": /produtor(?:es)? (?:rura|de leite)|coleta de leite|captacao de leite|transporte de leite|captacao|pecuari|tanque de expansao|rota do leite|agropecuari|fazenda/g,
      "Comercial": /merchandising|promotor|promocao de vendas|reposicao de produtos|ponto(?:s)? de venda|\bpdv\b|supermercad|marketing|publicidade|representacao comercial|cadastro de produtos|codigo de barras/g,
      "Logística": /transporte de cargas?|frete|combustive|posto de|abastecimento de veicul|armazenag|empilhadeir|frota|transportadora|logistic|postais|correios|encomendas/g,
      "Manutenção": /manutenc(?:ao|oes) (?:predi|eletr|mecan|corretiva|preventiva)|\bobras?\b|construcao civil|reforma|empreitada|instalac(?:ao|oes) eletric|motores? eletric|rebobina|refrigeracao|caldeiraria|solda|montagens industriais|compressor|cabeamento|hidraulic|munck|icamento/g,
      "Produção": /produtos? quimic|embalage|energia eletrica|insumo|caldeira|tratamento de agua|controle de pragas|desratiz|desinset|laboratori|qualidade|appcc|\bbpf\b|maquin|equipamento industrial|ingredient|fermento|coalho/g,
      "G&A": /advocat|juridic|contab|software|sistema|licenca de uso|tecnologia da informacao|\bti\b|consultoria|seguro|apolice|plano odontolog|plano de saude|assistencia (?:a )?saude|locacao de imovel|imovel residencial|aluguel|viagens|cartao|associac|filiacao|compliance|recursos humanos|auditoria|internet|telefon|fretamento|transporte de (?:passageiros|funcionarios|empregados)|avaliacao patrimonial|laudo/g
    };
    const PESO = { "Captação": 3, "Comercial": 2, "Logística": 1.5, "Manutenção": 1.2, "Produção": 1.2, "G&A": 1 };
    let best = null, bestN = 0;
    for (const [k, re] of Object.entries(S)) { const objN = (low(r.objeto || "").match(re) || []).length; const n = ((base.match(re) || []).length + objN * 4) * PESO[k]; if (n > bestN) { best = k; bestN = n; } }
    if (best) r.setores = [best];

    /* ---------- observações ---------- */
    const num = flat.match(/contrato\s+(?:n[ºo°.]*|n[uú]mero)\s*[:\s]*([A-Z0-9][A-Z0-9.\/\-]{1,20})/i);
    if (num && /\d/.test(num[1])) notas.unshift(`Contrato nº ${num[1]}`);
    if (/foro\s+(?:da|de|do)\s+comarca\s+de\s+([A-ZÀ-Ú][a-zà-úA-ZÀ-Ú ]{2,40}?)(?:[\/,\-–—.]|\s+(?:MG|para|com|estado))/i.test(flat)) notas.push("Foro: comarca de " + RegExp.$1.trim());
    if (notas.length) r.obs = notas.join(". ") + ".";
    return r;
  }

  root.LeitorContrato = { extrair };
  if (typeof module !== "undefined") module.exports = root.LeitorContrato;
})(typeof window !== "undefined" ? window : globalThis);
