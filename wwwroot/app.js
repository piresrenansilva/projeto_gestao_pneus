const money = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const br = (d) => d ? d.split("-").reverse().join("/") : "—";
const today = () => {
  const d = new Date();
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10));
const total = (itens) => (itens || []).reduce((a, i) => a + (Number(i.qtd) || 0) * (Number(i.unitario) || 0), 0);
const overdue = (date, status) => date && !["pago", "paga", "cancelado", "cancelada"].includes(status) && date < today();

let db = { clientes: [], produtos: [], carcacas: [], estoque: [], producao: [], cargas: [], pedidos: [], financeiro: [], contas: [], boletos: [] };
let page = "painel";
let pedidoId = null;
let editing = null;
let query = "";

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  if (!response.ok) {
    let message = `Erro HTTP ${response.status}`;
    try { const body = await response.json(); message = body.detail || body.title || message; } catch {}
    throw new Error(message);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function load() {
  db = await api("/api/dados");
  for (const key of ["clientes", "produtos", "carcacas", "estoque", "producao", "cargas", "pedidos", "financeiro", "contas", "boletos"])
    if (!Array.isArray(db[key])) db[key] = [];
  db.pedidos = db.pedidos.map((p) => ({ ...p, itens: p.itens || [] }));
}

async function reloadAndRender() {
  try {
    await load();
    render();
  } catch (error) {
    document.getElementById("title").textContent = "Erro ao carregar dados";
    document.getElementById("lede").textContent = "Não foi possível consultar o banco de dados.";
    document.getElementById("view").innerHTML = `<section class="card"><p>${escapeHtml(error.message)}</p><button class="btn" id="retryBtn">Tentar novamente</button></section>`;
    document.getElementById("retryBtn").onclick = reloadAndRender;
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch]));
}

const NAV = [
  ["painel", "Painel"], ["clientes", "Clientes"], ["produtos", "Produtos"], ["carcacas", "Carcaças"], ["estoque", "Estoque"], ["producao", "Produção"],
  ["cargas", "Carga e descarga"], ["vendas", "Vendas"], ["financeiro", "Entradas e saídas"],
  ["contas", "Pagar e receber"], ["boletos", "Boletos"]
];
const TITLES = {
  painel: ["Painel", "Todos os indicadores são consultados no SQL Server."],
  clientes: ["Clientes", "Cadastro e contato dos clientes."],
  produtos: ["Produtos", "Catálogo de produtos cadastrado no SQL Server."],
  carcacas: ["Carcaças", "Contagem por marca de fogo, dono e situação."],
  estoque: ["Estoque", "Pneus, recapados e insumos."],
  producao: ["Produção", "Apontamento por turno, medida e operador."],
  cargas: ["Carga e descarga", "Entrada e saída de pátio."],
  vendas: ["Vendas", "A lista mostra só a capa. Abra o pedido para ver os itens."],
  financeiro: ["Entradas e saídas", "Caixa do dia a dia."],
  contas: ["Pagar e receber", "Títulos em aberto, pagos e vencidos."],
  boletos: ["Boletos", "Da empresa (a pagar) e de clientes (a receber)."]
};

function tone(status) {
  const s = (status || "").toLowerCase();
  if (["aprovada", "concluída", "pago", "faturado", "conferida", "saiu", "pronta"].includes(s)) return "ok";
  if (["em produção", "em andamento", "aberto", "orçamento", "aguardando"].includes(s)) return "warn";
  if (["reprovada", "vencido", "cancelado", "divergente", "refugo"].includes(s)) return "bad";
  return "";
}
function badge(status, date) {
  const label = date && overdue(date, status) ? "vencido" : status;
  return `<span class="badge ${tone(label)}">${label}</span>`;
}
function opts(list) { return list.map((v) => `<option value="${v}">${v}</option>`).join(""); }
function field(name, label, type, extra = "") {
  const wide = type === "textarea" ? " full" : "";
  const control = type === "textarea"
    ? `<textarea name="${name}" ${extra}></textarea>`
    : type === "select"
      ? `<select name="${name}" ${extra}></select>`
      : `<input name="${name}" type="${type}" ${extra} />`;
  return `<label class="${wide}">${label}${control}</label>`;
}

const FORMS = {
  clientes: () => [
    field("nome", "Nome / Razão social", "text", "required"),
    field("tipo", "Tipo de pessoa", "select"),
    field("documento", "CPF / CNPJ", "text"),
    field("telefone", "Telefone", "tel"),
    field("email", "E-mail", "email"),
    field("cep", "CEP", "text"),
    field("endereco", "Endereço", "text"),
    field("numero", "Número", "text"),
    field("complemento", "Complemento", "text"),
    field("bairro", "Bairro", "text"),
    field("cidade", "Cidade", "text"),
    field("estado", "Estado", "text", "maxlength='2'"),
    field("status", "Status", "select"),
    field("obs", "Observações", "textarea")
  ].join(""),
  produtos: () => [
    field("ProdutoId", "ProdutoId", "text"), field("nome", "Nome", "text", "required"),
    field("categoria", "Categoria", "text"), field("medida", "Medida", "text"),
    field("unidade", "Unidade (ex.: un, pneu)", "text"), field("preco", "Preço de venda", "number", "required min='0' step='0.01'"),
    field("custo", "Custo unitário", "number", "required min='0' step='0.01'"), field("status", "Status", "select"),
    field("obs", "Observações", "textarea")
  ].join(""),
  carcacas: () => [
    field("fogo", "Marca de fogo", "text", "required"),
    field("medida", "Medida", "text", "required"),
    field("dono", "Dono / cliente", "text", "required"),
    field("origem", "Origem", "select"),
    field("qtd", "Quantidade", "number", "required step='1'"),
    field("entrada", "Entrada", "date", "required"),
    field("status", "Status", "select"),
    field("obs", "Observação", "textarea")
  ].join(""),
  estoque: () => [
    field("ProdutoId", "ProdutoId", "text", "required"), field("item", "Descrição", "text", "required"),
    field("medida", "Medida", "text"),
    field("qtd", "Quantidade", "number", "required"), field("minimo", "Mínimo", "number", "required")
  ].join(""),
  producao: () => [
    field("data", "Data", "date", "required"), field("turno", "Turno", "select"),
    field("medida", "Medida", "text", "required"), field("qtd", "Pneus produzidos", "number", "required"),
    field("carcacas", "Carcaças usadas", "number", "required"), field("banda", "Banda", "text"),
    field("operador", "Operador", "text"), field("status", "Status", "select")
  ].join(""),
  cargas: () => [
    field("tipo", "Tipo", "select"), field("data", "Data", "date", "required"),
    field("placa", "Placa", "text", "required"), field("motorista", "Motorista", "text"),
    field("parceiro", "Cliente / fornecedor", "text", "required"), field("nf", "Nota fiscal", "text"),
    field("qtd", "Quantidade", "number", "required"), field("item", "Item", "text", "required"),
    field("status", "Status", "select")
  ].join(""),
  financeiro: () => [
    field("data", "Data", "date", "required"), field("tipo", "Tipo", "select"),
    field("categoria", "Categoria", "select"), field("descricao", "Descrição", "text", "required"),
    field("valor", "Valor", "number", "required step='0.01'")
  ].join(""),
  contas: () => [
    field("tipo", "Tipo", "select"), field("pessoa", "Pessoa", "text", "required"),
    field("descricao", "Descrição", "text", "required"), field("valor", "Valor", "number", "required step='0.01'"),
    field("vencimento", "Vencimento", "date", "required"), field("boleto", "Nº do boleto", "text"),
    field("status", "Status", "select")
  ].join(""),
  boletos: () => [
    field("origem", "Origem", "select"), field("pessoa", "Pessoa", "text", "required"),
    field("numero", "Número", "text", "required"), field("valor", "Valor", "number", "required step='0.01'"),
    field("vencimento", "Vencimento", "date", "required"), field("ref", "Referência", "text"),
    field("status", "Status", "select")
  ].join(""),
  capa: () => [
    field("cliente", "Cliente", "text", "required"), field("data", "Data", "date", "required"),
    field("pagamento", "Pagamento", "select"), field("status", "Status", "select"),
    field("vendedor", "Vendedor", "text"), field("previsao", "Previsão", "date"),
    field("obs", "Observação", "textarea")
  ].join(""),
  item: () => [
    field("ProdutoId", "ProdutoId", "text"), field("medida", "Medida", "text"),
    field("descricao", "Descrição", "text", "required"),
    field("qtd", "Quantidade", "number", "required min='1' step='1'"),
    field("unitario", "Preço unitário", "number", "required min='0' step='0.01'")
  ].join("")
};

const SELECTS = {
  clientes: { tipo: ["Pessoa física", "Pessoa jurídica"], status: ["Ativo", "Inativo"] },
  produtos: { status: ["Ativo", "Inativo"] },
  carcacas: {
    origem: ["cliente", "compra", "retorno"],
    status: ["recebida", "inspecionada", "aprovada", "reprovada", "em produção", "pronta"]
  },
  estoque: { tipo: ["novo", "recapado", "insumo", "carcaça"] },
  producao: { turno: ["Manhã", "Tarde", "Noite"], status: ["em andamento", "concluída", "refugo"] },
  cargas: { tipo: ["carga", "descarga"], status: ["aguardando", "conferida", "saiu", "divergente"] },
  financeiro: { tipo: ["entrada", "saída"], categoria: ["venda", "recapagem", "insumo", "folha", "frete", "energia", "imposto", "outros"] },
  contas: { tipo: ["pagar", "receber"], status: ["aberto", "pago", "vencido"] },
  boletos: { origem: [["cliente", "Cliente (a receber)"], ["empresa", "Empresa (a pagar)"]], status: ["aberto", "pago", "vencido", "cancelado"] },
  capa: { pagamento: ["boleto", "pix", "dinheiro", "cartão", "a prazo"], status: ["orçamento", "faturado", "pago", "cancelado"] },
  item: {}
};

function fillSelects(root, kind) {
  const spec = SELECTS[kind] || {};
  root.querySelectorAll("select").forEach((sel) => {
    const options = spec[sel.name] || [];
    sel.innerHTML = options.map((o) => Array.isArray(o) ? `<option value="${o[0]}">${o[1]}</option>` : `<option>${o}</option>`).join("");
  });
}

document.getElementById("nav").innerHTML = NAV.map(([id, label]) => `<button data-page="${id}">${label}</button>`).join("");
document.getElementById("nav").onclick = (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  page = b.dataset.page;
  pedidoId = null;
  query = "";
  render();
};
document.getElementById("cancelBtn").onclick = () => document.getElementById("modal").classList.remove("show");
document.getElementById("form").onsubmit = async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  ["qtd", "minimo", "custo", "preco", "valor", "carcacas", "unitario"].forEach((k) => { if (k in data) data[k] = Number(data[k] || 0); });
  try {
    if (editing.kind === "item") {
      data.pedidoId = pedidoId;
      if (editing.id) await api(`/api/itens/${editing.id}`, { method: "PUT", body: JSON.stringify(data) });
      else await api("/api/itens", { method: "POST", body: JSON.stringify(data) });
    } else if (editing.kind === "capa") {
      const result = await api("/api/pedidos", { method: "POST", body: JSON.stringify(data) });
      pedidoId = result.id;
    } else if (editing.id) {
      await api(`/api/${editing.kind}/${editing.id}`, { method: "PUT", body: JSON.stringify(data) });
    } else {
      await api(`/api/${editing.kind}`, { method: "POST", body: JSON.stringify(data) });
    }
    document.getElementById("modal").classList.remove("show");
    await load();
    render();
  } catch (error) {
    alert(`Não foi possível salvar no banco de dados: ${error.message}`);
  }
};

function openForm(kind, row) {
  editing = { kind, id: row?.id || null };
  const titles = { clientes: row ? "Editar cliente" : "Cadastrar cliente", produtos: row ? "Editar produto" : "Cadastrar produto", capa: "Nova capa", item: row ? "Editar item" : "Novo item", carcacas: "Carcaça", estoque: "Estoque", producao: "Produção", cargas: "Movimento", financeiro: "Lançamento", contas: "Título", boletos: "Boleto" };
  document.getElementById("modalTitle").textContent = titles[kind] || "Registro";
  document.getElementById("formFields").innerHTML = FORMS[kind]();
  const form = document.getElementById("form");
  fillSelects(form, kind);
  if (row) {
    Object.entries(row).forEach(([k, v]) => {
      if (form.elements[k]) form.elements[k].value = v ?? "";
    });
    // Em registros vinculados, usa a descrição atual do cadastro do produto
    // quando o texto legado da tabela de estoque estiver vazio.
    if (kind === "estoque") {
      // Localiza o produto pelo código textual compartilhado com o estoque.
      const produto = db.produtos.find(p =>
        p.produtoId && row.produtoId && String(p.produtoId).trim().toLowerCase() === String(row.produtoId).trim().toLowerCase()
      );
      if (form.elements.item) form.elements.item.value = produto?.nome || row.item || "";
      if (form.elements.produtoId) form.elements.produtoId.value = row.produtoId || produto?.produtoId || "";
      if (form.elements.medida) form.elements.medida.value = row.medida || produto?.medida || "";
    }
  } else if (form.elements.data) form.elements.data.value = today();
  document.getElementById("modal").classList.add("show");
}

async function removeRow(kind, id) {
  if (!confirm("Deseja excluir este registro?")) return;
  try {
    await api(`/api/${kind}/${id}`, { method: "DELETE" });
    await load();
    render();
  } catch (error) { alert(`Não foi possível excluir: ${error.message}`); }
}

function table(kind, heads, map) {
  const q = query.toLowerCase();
  const rows = db[kind].filter((row) => !q || JSON.stringify(row).toLowerCase().includes(q));
  return `<div class="toolbar"><input id="q" placeholder="Filtrar" value="${escapeAttr(query)}" /></div>
    <div class="table-wrap"><table><thead><tr>${heads.map((h) => `<th>${h}</th>`).join("")}<th></th></tr></thead><tbody>
    ${rows.map((row) => `<tr>${map(row).map((c) => `<td>${c}</td>`).join("")}
      <td><button class="btn ghost small" data-edit="${kind}:${row.id}">Editar</button>
      <button class="btn danger small" data-del="${kind}:${row.id}">Excluir</button></td></tr>`).join("") || `<tr><td colspan="${heads.length + 1}">Nenhum registro.</td></tr>`}
    </tbody></table></div>`;
}
function escapeAttr(s) { return String(s).replace(/"/g, "&" + "quot;"); }

function render() {
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.page === (pedidoId ? "vendas" : page)));
  const actions = document.getElementById("actions");
  const view = document.getElementById("view");
  if (pedidoId) return renderPedido();
  const [title, lede] = TITLES[page];
  document.getElementById("title").textContent = title;
  document.getElementById("lede").textContent = lede;
  const creates = { clientes: "Cadastrar cliente", produtos: "Cadastrar produto", carcacas: "Nova carcaça", estoque: "Novo item", producao: "Novo apontamento", cargas: "Novo movimento", vendas: "Novo pedido", financeiro: "Novo lançamento", contas: "Novo título", boletos: "Novo boleto" };
  actions.innerHTML = creates[page] ? `<button class="btn" id="addBtn">${creates[page]}</button>` : "";
  view.innerHTML = views[page]();
  const add = document.getElementById("addBtn");
  if (add) add.onclick = () => page === "vendas" ? openForm("capa") : openForm(page);
  const q = document.getElementById("q");
  if (q) q.oninput = () => { query = q.value; const pos = q.selectionStart; render(); const next = document.getElementById("q"); if (next) { next.focus(); next.selectionStart = next.selectionEnd = pos; } };
  view.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => {
    const [kind, id] = b.dataset.edit.split(":");
    openForm(kind, db[kind].find((row) => row.id === id));
  });
  view.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => {
    const [kind, id] = b.dataset.del.split(":");
    removeRow(kind, id);
  });
  view.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => { pedidoId = b.dataset.open; render(); });
}

const views = {
  painel() {
    const carc = db.carcacas.reduce((a, r) => a + Number(r.qtd || 0), 0);
    const est = db.estoque.reduce((a, r) => a + Number(r.qtd || 0), 0);
    const baixos = db.estoque.filter((r) => Number(r.qtd) < Number(r.minimo));
    const mes = today().slice(0, 7);
    const prod = db.producao.filter((r) => String(r.data).startsWith(mes)).reduce((a, r) => a + Number(r.qtd || 0), 0);
    const ent = db.financeiro.filter((r) => r.tipo === "entrada").reduce((a, r) => a + Number(r.valor || 0), 0);
    const sai = db.financeiro.filter((r) => r.tipo === "saída").reduce((a, r) => a + Number(r.valor || 0), 0);
    const alertas = [
      ...baixos.map((r) => `Estoque baixo: ${r.item} (${r.qtd} de ${r.minimo})`),
      ...db.contas.filter((r) => overdue(r.vencimento, r.status)).map((r) => `Título vencido: ${r.pessoa} · ${money(r.valor)}`),
      ...db.boletos.filter((r) => overdue(r.vencimento, r.status)).map((r) => `Boleto vencido: ${r.pessoa} · ${money(r.valor)}`)
    ];
    return `<div class="kpis">
      <div class="card"><span>Carcaças</span><strong>${carc}</strong><em>unidades</em></div>
      <div class="card"><span>Estoque</span><strong>${est}</strong><em>${baixos.length} abaixo do mínimo</em></div>
      <div class="card"><span>Produção no mês</span><strong>${prod}</strong><em>pneus</em></div>
      <div class="card"><span>Saldo</span><strong>${money(ent - sai)}</strong><em>entradas menos saídas</em></div>
    </div>
    <div>
      <section class="card"><h2>Alertas</h2>${alertas.length ? `<ul class="list">${alertas.map((a) => `<li>${a}</li>`).join("")}</ul>` : `<p class="hint">Nenhum alerta.</p>`}</section>
    </div>`;
  },
  produtos() { return table("produtos", ["produtoId", "Nome", "Categoria", "Medida", "Preço", "Custo", "Status"], (r) => [r.produtoId, r.nome, r.categoria, r.medida, money(r.preco), money(r.custo), badge(r.status)]); },
  carcacas() { return table("carcacas", ["Fogo", "Medida", "Dono", "Qtd", "Entrada", "Status"], (r) => [r.fogo, r.medida, r.dono, r.qtd, br(r.entrada), badge(r.status)]); },
  estoque() { return table("estoque", ["produtoId", "Descrição", "Medida", "Qtd", "Mínimo"], (r) => {
    const produto = db.produtos.find(p =>
      p.produtoId && r.produtoId && String(p.produtoId).trim().toLowerCase() === String(r.produtoId).trim().toLowerCase()
    );
    return [r.produtoId || produto?.produtoId || "", produto?.nome || r.item || "", r.medida || produto?.medida || "", r.qtd, r.minimo];
  }); },
  producao() { return table("producao", ["Data", "Turno", "Medida", "Qtd", "Carcaças", "Operador", "Status"], (r) => [br(r.data), r.turno, r.medida, r.qtd, r.carcacas, r.operador, badge(r.status)]); },
  cargas() { return table("cargas", ["Tipo", "Data", "Placa", "Parceiro", "NF", "Qtd", "Status"], (r) => [r.tipo, br(r.data), r.placa, r.parceiro, r.nf, r.qtd, badge(r.status)]); },
  vendas() {
    const q = query.toLowerCase();
    const lista = db.pedidos.filter((p) => !q || `${p.numero} ${p.cliente} ${p.pagamento} ${p.status} ${p.vendedor}`.toLowerCase().includes(q));
    return `<div class="toolbar"><input id="q" placeholder="Filtrar por cliente, número ou status" value="${escapeAttr(query)}" /></div>
      ${lista.map((p) => `<button class="pedido" data-open="${p.id}" type="button">
        <div class="back" style="justify-content:space-between"><span class="mono">${p.numero}</span>${badge(p.status)}</div>
        <h3>${p.cliente}</h3>
        <dl class="capa">
          <div><dt>Data</dt><dd>${br(p.data)}</dd></div>
          <div><dt>Pagamento</dt><dd>${p.pagamento}</dd></div>
          <div><dt>Itens</dt><dd class="num">${p.itens.length}</dd></div>
          <div><dt>Total</dt><dd class="num">${money(total(p.itens))}</dd></div>
        </dl>
        <p class="hint">Abrir pedido</p>
      </button>`).join("") || `<p class="hint">Nenhum pedido.</p>`}`;
  },
  financeiro() { return table("financeiro", ["Data", "Tipo", "Categoria", "Descrição", "Valor"], (r) => [br(r.data), badge(r.tipo), r.categoria, r.descricao, money(r.valor)]); },
  contas() { return table("contas", ["Tipo", "Pessoa", "Descrição", "Valor", "Vencimento", "Status"], (r) => [r.tipo, r.pessoa, r.descricao, money(r.valor), br(r.vencimento), badge(r.status, r.vencimento)]); },
  boletos() { return table("boletos", ["Origem", "Pessoa", "Número", "Valor", "Vencimento", "Status"], (r) => [r.origem === "empresa" ? "Empresa" : "Cliente", r.pessoa, r.numero, money(r.valor), br(r.vencimento), badge(r.status, r.vencimento)]); },
  clientes() { return table("clientes", ["ID", "Nome / Razão social", "Tipo", "CPF / CNPJ", "Telefone", "E-mail", "Cidade / UF", "Status"], (r) => [
    escapeHtml(r.id), escapeHtml(r.nome), escapeHtml(r.tipo), escapeHtml(r.documento), escapeHtml(r.telefone), escapeHtml(r.email),
    escapeHtml([r.cidade, r.estado].filter(Boolean).join(" / ")), badge(r.status)
  ]); }
};

function renderPedido() {
  const pedido = db.pedidos.find((p) => p.id === pedidoId);
  if (!pedido) { pedidoId = null; return render(); }
  document.getElementById("title").textContent = pedido.numero;
  document.getElementById("lede").textContent = pedido.cliente;
  document.getElementById("actions").innerHTML = `<button class="btn ghost" id="backBtn">Voltar</button>`;
  document.getElementById("view").innerHTML = `
    <section class="card">
      <h2>Capa</h2>
      <form id="capaForm" class="grid" style="margin-top:12px">
        ${FORMS.capa()}
        <div class="full" style="display:flex;justify-content:flex-end"><button class="btn" type="submit">Salvar capa</button></div>
      </form>
    </section>
    <section class="card" style="margin-top:12px">
      <div class="back" style="justify-content:space-between"><h2>Itens</h2><button class="btn" id="addItem" type="button">Adicionar item</button></div>
      <div class="table-wrap" style="margin-top:12px"><table>
        <thead><tr><th>produtoId</th><th>Descrição</th><th>Medida</th><th>Qtd</th><th>Unitário</th><th>Total</th><th></th></tr></thead>
        <tbody>
          ${pedido.itens.map((item) => `<tr>
            <td class="mono">${item.produtoId || "—"}</td><td>${item.descricao}</td><td>${item.medida || "—"}</td>
            <td class="num">${item.qtd}</td><td class="num">${money(item.unitario)}</td><td class="num">${money(item.qtd * item.unitario)}</td>
            <td><button class="btn ghost small" data-item="${item.id}" type="button">Editar</button>
            <button class="btn danger small" data-drop="${item.id}" type="button">Excluir</button></td></tr>`).join("") || `<tr><td colspan="7">Nenhum item neste pedido.</td></tr>`}
        </tbody>
      </table></div>
      <p style="text-align:right">Total do pedido <strong class="num">${money(total(pedido.itens))}</strong></p>
    </section>
    <button class="btn danger" id="dropPedido" type="button" style="margin-top:12px">Excluir pedido</button>`;
  const form = document.getElementById("capaForm");
  fillSelects(form, "capa");
  Object.entries(pedido).forEach(([k, v]) => { if (form.elements[k] && k !== "itens") form.elements[k].value = v ?? ""; });
  form.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      await api(`/api/pedidos/${pedido.id}`, { method: "PUT", body: JSON.stringify(data) });
      await load();
      render();
    } catch (error) { alert(`Não foi possível atualizar o pedido: ${error.message}`); }
  };
  document.getElementById("backBtn").onclick = () => { pedidoId = null; render(); };
  document.getElementById("addItem").onclick = () => openForm("item");
  document.getElementById("view").querySelectorAll("[data-item]").forEach((b) => b.onclick = () => openForm("item", pedido.itens.find((i) => i.id === b.dataset.item)));
  document.getElementById("view").querySelectorAll("[data-drop]").forEach((b) => b.onclick = async () => {
    if (!confirm("Excluir este item do pedido?")) return;
    try {
      await api(`/api/itens/${b.dataset.drop}`, { method: "DELETE" });
      await load();
      render();
    } catch (error) { alert(`Não foi possível excluir o item: ${error.message}`); }
  });
  document.getElementById("dropPedido").onclick = async () => {
    if (!confirm("Excluir este pedido?")) return;
    try {
      await api(`/api/pedidos/${pedido.id}`, { method: "DELETE" });
      pedidoId = null;
      await load();
      render();
    } catch (error) { alert(`Não foi possível excluir o pedido: ${error.message}`); }
  };
}

reloadAndRender();
