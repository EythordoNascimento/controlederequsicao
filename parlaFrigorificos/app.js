(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  let atual = null; // { numero, blob, texto }

  // ---------- Utilidades ----------
  const hojeISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const fmtData = (iso) => iso.split("-").reverse().join("/");
  const fmtNum = (n) => String(Math.round(n * 1000) / 1000).replace(".", ",");
  const titulo = (s) => s.toLowerCase().replace(/(^|\s|\/)([a-zà-ú])/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Para|E)\b/g, (w) => w.toLowerCase());
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
  const ler = (k, p) => { try { return JSON.parse(localStorage.getItem(k)) ?? p; } catch { return p; } };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const somaKg = (itens) => itens.reduce((t, i) => t + (i.qtd || 0), 0);

  // ---------- Abas / telas ----------
  const TELAS = ["tela-form", "tela-ok", "tela-hist", "tela-dash"];
  function mostrar(tela) {
    TELAS.forEach((t) => ($(t).hidden = t !== tela));
    const aba = tela === "tela-ok" ? "tela-form" : tela;
    document.querySelectorAll(".aba").forEach((b) => b.classList.toggle("ativa", b.dataset.tela === aba));
    if (tela === "tela-hist") renderHistorico();
    if (tela === "tela-dash") renderDashboard();
    window.scrollTo(0, 0);
  }

  // ---------- Itens do formulário ----------
  function novoItem() {
    const div = document.createElement("div");
    div.className = "item";
    const opcoes = PRODUTOS.slice().sort((a, b) => a.localeCompare(b, "pt-BR")).map((p) => `<option value="${esc(p)}">${esc(titulo(p))}</option>`).join("");
    div.innerHTML = `
      <div class="item-topo"><span>Produto</span><button type="button" class="rm" aria-label="Remover produto">×</button></div>
      <div class="item-campos">
        <div><label>Produto</label><select class="i-nome"><option value="">Selecione um produto...</option>${opcoes}</select></div>
        <div><label>Quantidade</label><input type="number" class="i-qtd" min="0" step="0.1" inputmode="decimal" placeholder="0,00"></div>
        <div><label>Unidade</label><div class="unid">KG</div></div>
      </div>`;
    div.querySelector(".rm").onclick = () => {
      div.remove();
      if (!document.querySelector(".item")) $("lista-produtos").appendChild(novoItem());
      atualizarResumo();
    };
    div.addEventListener("input", () => { div.classList.remove("invalido"); atualizarResumo(); });
    return div;
  }

  function coletarItens() {
    return [...document.querySelectorAll(".item")].map((el) => ({
      el,
      nome: el.querySelector(".i-nome").value,
      qtd: parseFloat(String(el.querySelector(".i-qtd").value).replace(",", ".")),
      un: "KG"
    }));
  }

  function atualizarResumo() {
    const v = coletarItens().filter((i) => i.nome && i.qtd > 0);
    $("contador").textContent = v.length + (v.length === 1 ? " item" : " itens");
    $("r-qtd").textContent = v.length;
    $("r-total").innerHTML = `${fmtNum(somaKg(v))} <span>kg</span>`;
  }

  // ---------- Numeração ----------
  function proximoNumero(dataISO) {
    const k = "parla_seq_" + dataISO;
    const n = ler(k, 0) + 1;
    guardar(k, n);
    return `REQ-${dataISO.replace(/-/g, "")}-${String(n).padStart(3, "0")}`;
  }

  const blobParaDataURL = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
  function dataURLParaBlob(url) {
    const bin = atob(url.split(",")[1]), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: "application/pdf" });
  }

  // ---------- PDF ----------
  function montarPDF(r) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const L = 20, R = 190, W = R - L;
    let y = 20;
    const linha = (yy, grossa) => { doc.setLineWidth(grossa ? 0.8 : 0.2); doc.line(L, yy, R, yy); };
    const novaPag = (p) => { if (y + p > 275) { doc.addPage(); y = 20; } };

    doc.setFont("helvetica", "bold"); doc.setFontSize(22);
    doc.text("PARLA DELI", 105, y, { align: "center" }); y += 8;
    doc.setFontSize(13);
    doc.text("REQUISIÇÃO DE FRIGORIFICADOS", 105, y, { align: "center" }); y += 5;
    linha(y, true); y += 9;

    const campo = (rot, val) => {
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text(rot, L, y);
      doc.setFont("helvetica", "normal"); doc.setFontSize(12); doc.text(val, L + 28, y); y += 7;
    };
    campo("Número:", r.numero); campo("Data:", fmtData(r.data)); campo("Responsável:", r.responsavel);
    y += 1; linha(y); y += 8;

    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("PRODUTOS", L, y); y += 8;
    doc.setFontSize(11);
    r.itens.forEach((i) => {
      novaPag(8);
      const nome = titulo(i.nome), qtd = `${fmtNum(i.qtd)} KG`;
      doc.setFont("helvetica", "normal"); doc.text(nome, L, y);
      doc.setFont("helvetica", "bold"); doc.text(qtd, R, y, { align: "right" });
      doc.setFont("helvetica", "normal");
      const x1 = L + doc.getTextWidth(nome) + 2, x2 = R - doc.getTextWidth(qtd) - 2;
      doc.text(".".repeat(Math.max(0, Math.floor((x2 - x1) / doc.getTextWidth(".")))), x1, y);
      y += 7;
    });
    y += 1; novaPag(30); linha(y); y += 8;

    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("TOTAL", L, y); y += 7;
    doc.setFontSize(14); doc.text(`${fmtNum(somaKg(r.itens))} KG`, L, y); y += 5;
    linha(y); y += 8;

    novaPag(40);
    doc.setFontSize(12); doc.text("OBSERVAÇÕES", L, y); y += 7;
    doc.setFont("helvetica", "normal"); doc.setFontSize(11);
    doc.splitTextToSize(r.obs || "—", W).forEach((ln) => { novaPag(7); doc.text(ln, L, y); y += 6; });
    y += 2; novaPag(55); linha(y); y += 8;

    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("ASSINATURAS", L, y); y += 18;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.line(L, y, L + 70, y); doc.line(R - 70, y, R, y); y += 5;
    doc.text("Solicitante", L, y); doc.text("Responsável Estoque", R - 70, y);
    y += 8; linha(y, true);
    return doc.output("blob");
  }

  function textoWhats(r) {
    const linhas = r.itens.map((i) => `• ${titulo(i.nome)}: ${fmtNum(i.qtd)} KG`).join("\n");
    return `*PARLA DELI – Requisição de Frigorificados*\n${r.numero} | ${fmtData(r.data)}\nResponsável: ${r.responsavel}\n\n${linhas}\n\n*Total:* ${fmtNum(somaKg(r.itens))} KG` + (r.obs ? `\n\nObs.: ${r.obs}` : "");
  }

  // ---------- Gerar ----------
  async function gerar() {
    const data = $("data").value, responsavel = $("responsavel").value.trim();
    const itens = coletarItens();
    itens.forEach((i) => i.el.classList.remove("invalido"));
    if (!data) return erro("Informe a data da requisição.");
    if (!responsavel) return erro("Informe o responsável.");
    const ruins = itens.filter((i) => !i.nome || !(i.qtd > 0));
    if (ruins.length) { ruins.forEach((i) => i.el.classList.add("invalido")); return erro("Selecione o produto e informe a quantidade em todos os itens."); }

    // junta produtos repetidos
    const mapa = new Map();
    itens.forEach((i) => mapa.set(i.nome, (mapa.get(i.nome) || 0) + i.qtd));
    const lista = [...mapa].map(([nome, qtd]) => ({ nome, qtd, un: "KG" }));

    const req = { numero: proximoNumero(data), data, responsavel, itens: lista, obs: $("obs").value.trim() };
    const blob = montarPDF(req);
    const pdf = await blobParaDataURL(blob);

    const hist = ler("parla_hist", []);
    hist.unshift({ numero: req.numero, data, responsavel, itens: lista, obs: req.obs, total: somaKg(lista), pdf });
    if (!guardar("parla_hist", hist)) {
      hist.forEach((h, i) => { if (i >= 15) delete h.pdf; });
      guardar("parla_hist", hist.slice(0, 300));
    }

    atual = { numero: req.numero, blob, texto: textoWhats(req) };
    $("ok-num").textContent = req.numero;
    limparForm();
    mostrar("tela-ok");
  }
  function erro(msg) { const e = $("erro"); e.textContent = msg; e.classList.add("erro"); }

  // ---------- PDF: baixar / abrir / compartilhar ----------
  function baixar(blob, nome) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = nome + ".pdf";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function abrir(blob) {
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank") || (location.href = url);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function compartilhar() {
    if (!atual) return;
    const sel = document.querySelector('input[name="dest"]:checked');
    const dest = DESTINATARIOS.find((d) => d.id === (sel && sel.value));
    if (!dest) return alert("Escolha um destinatário.");
    const texto = `${dest.nome}\n\n${atual.texto}`;
    const arquivo = new File([atual.blob], atual.numero + ".pdf", { type: "application/pdf" });
    if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      try { await navigator.share({ files: [arquivo], title: atual.numero, text: texto }); return; }
      catch (e) { if (e.name === "AbortError") return; }
    }
    baixar(atual.blob, atual.numero);
    const base = dest.fone ? `https://wa.me/${dest.fone}` : "https://wa.me/";
    window.open(`${base}?text=${encodeURIComponent(texto + "\n\n(PDF em anexo)")}`, "_blank");
    alert("O PDF foi baixado. Anexe-o na conversa do WhatsApp que abriu.");
  }

  // ---------- Histórico ----------
  function renderHistorico() {
    const hist = ler("parla_hist", []);
    const box = $("hist-lista");
    if (!hist.length) { box.innerHTML = '<p class="vazio">Nenhuma requisição gerada ainda.</p>'; return; }
    box.innerHTML = hist.map((h, i) => `
      <div class="h-item">
        <div><strong>${esc(h.numero)}</strong><small>${fmtData(h.data)} · ${esc(h.responsavel)} · ${typeof h.total === "number" ? fmtNum(h.total) + " KG" : esc(h.total)}</small></div>
        ${h.pdf ? `<div class="h-btns"><button type="button" data-a="abrir" data-i="${i}">Abrir</button><button type="button" data-a="enviar" data-i="${i}">Enviar</button></div>` : ""}
      </div>`).join("");
    box.querySelectorAll("button").forEach((b) => (b.onclick = () => {
      const h = hist[b.dataset.i], blob = dataURLParaBlob(h.pdf);
      if (b.dataset.a === "abrir") return abrir(blob);
      atual = { numero: h.numero, blob, texto: textoWhats({ ...h, itens: h.itens || [] }) };
      $("ok-num").textContent = h.numero;
      mostrar("tela-ok");
    }));
  }

  // ---------- Dashboard ----------
  function renderDashboard() {
    const hist = ler("parla_hist", []);
    const mes = hojeISO().slice(0, 7);
    const doMes = hist.filter((h) => h.data.startsWith(mes));
    const kgMes = doMes.reduce((t, h) => t + (h.itens ? somaKg(h.itens) : 0), 0);
    $("dash-tiles").innerHTML =
      `<div class="tile"><small>Requisições no mês</small><b>${doMes.length}</b></div>` +
      `<div class="tile"><small>Total no mês</small><b>${fmtNum(kgMes)} <span>kg</span></b></div>`;

    const prod = {};
    hist.forEach((h) => (h.itens || []).forEach((i) => { prod[i.nome] = (prod[i.nome] || 0) + i.qtd; }));
    const top = Object.entries(prod).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const max = top.length ? top[0][1] : 1;
    $("dash-top").innerHTML = top.length
      ? top.map(([n, q]) => `<div class="barra"><div class="t"><span>${esc(titulo(n))}</span><b>${fmtNum(q)} kg</b></div><div class="f"><i style="width:${(q / max) * 100}%"></i></div></div>`).join("")
      : '<p class="vazio">Sem dados ainda.</p>';

    const dias = [];
    for (let k = 6; k >= 0; k--) {
      const d = new Date(); d.setDate(d.getDate() - k); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      const iso = d.toISOString().slice(0, 10);
      dias.push([iso, hist.filter((h) => h.data === iso).reduce((t, h) => t + (h.itens ? somaKg(h.itens) : 0), 0)]);
    }
    const maxD = Math.max(1, ...dias.map((d) => d[1]));
    $("dash-dias").innerHTML = dias.map(([iso, q]) => `<div class="barra"><div class="t"><span>${fmtData(iso).slice(0, 5)}</span><b>${fmtNum(q)} kg</b></div><div class="f"><i style="width:${(q / maxD) * 100}%"></i></div></div>`).join("");
  }

  // ---------- Reiniciar / início ----------
  function limparForm() {
    $("responsavel").value = "";
    $("obs").value = "";
    $("data").value = hojeISO();
    $("lista-produtos").innerHTML = "";
    for (let i = 0; i < 3; i++) $("lista-produtos").appendChild(novoItem());
    const e = $("erro"); e.textContent = "Confira os produtos e as quantidades antes de salvar."; e.classList.remove("erro");
    atualizarResumo();
  }
  function nova() { limparForm(); mostrar("tela-form"); }

  function iniciar() {
    $("destinatarios").innerHTML = DESTINATARIOS.map((d, i) =>
      `<label class="dest"><input type="radio" name="dest" value="${d.id}" ${i === 0 ? "checked" : ""}> ${esc(d.nome)}</label>`).join("");
    document.querySelectorAll(".aba").forEach((b) => (b.onclick = () => mostrar(b.dataset.tela)));
    $("btn-add").onclick = () => { const it = novoItem(); $("lista-produtos").appendChild(it); it.querySelector(".i-nome").focus(); atualizarResumo(); };
    $("btn-gerar").onclick = gerar;
    $("btn-baixar").onclick = () => atual && baixar(atual.blob, atual.numero);
    $("btn-abrir").onclick = () => atual && abrir(atual.blob);
    $("btn-whats").onclick = compartilhar;
    $("btn-nova").onclick = nova;
    nova();
  }
  iniciar();
})();