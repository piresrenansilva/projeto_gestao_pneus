const money = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const br = (d) => d ? d.split("-").reverse().join("/") : "—";
const today = () => {
  const d = new Date();
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10));
const total = (itens) => (itens || []).reduce((a, i) => a + (Number(i.qtd) || 0) * (Number(i.unitario) || 0), 0);
const totalPedido = (pedido) => Math.max(0, total(pedido.itens) - (Number(pedido.descontoValor) || 0));
const overdue = (date, status) => date && !["pago", "paga", "cancelado", "cancelada"].includes(status) && date < today();

let db = { clientes: [], veiculos: [], servicos: [], produtos: [], carcacas: [], estoque: [], producao: [], cargas: [], pedidos: [], financeiro: [], contas: [], boletos: [] };
let page = "painel";
let pedidoId = null;
let vendaRascunho = null;
let etapaVenda = 1;
let editing = null;
let query = "";
let confirmDelete = "";

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  if (!response.ok) {
    const rota = `${options.method || "GET"} ${new URL(url, window.location.href).pathname}`;
    let message = response.status === 404
      ? `Erro HTTP 404 em ${rota}; a rota não está disponível nesta instância do servidor.`
      : `Erro HTTP ${response.status} em ${rota}`;
    try {
      const body = await response.json();
      message = body.detail || (response.status === 404 ? message : body.title || message);
    } catch {}
    throw new Error(message);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function load() {
  db = await api("/api/dados");
  for (const key of ["clientes", "veiculos", "servicos", "produtos", "carcacas", "estoque", "producao", "cargas", "pedidos", "financeiro", "contas", "boletos"])
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
  ["painel", "Painel"], ["clientes", "Clientes"], ["veiculos", "Veículos"], ["produtos", "Produtos"], ["servicos", "Serviços"], ["carcacas", "Carcaças"], ["estoque", "Estoque"], ["producao", "Produção"],
  ["cargas", "Carga e descarga"], ["vendas", "Vendas"], ["financeiro", "Entradas e saídas"],
  ["contas", "Pagar e receber"], ["boletos", "Boletos"]
];
const TITLES = {
  painel: ["Painel", "Todos os indicadores são consultados no SQL Server."],
  clientes: ["Clientes", "Cadastro e contato dos clientes."],
  veiculos: ["Veículos", "Veículos vinculados aos clientes."],
  produtos: ["Produtos", "Catálogo de produtos cadastrado no SQL Server."],
  servicos: ["Serviços", "Catálogo de serviços oferecidos pela oficina."],
  carcacas: ["Carcaças", "Contagem por marca de fogo, dono e situação."],
  estoque: ["Estoque", "Pneus, recapados e insumos."],
  producao: ["Produção", "Apontamento por turno, medida e operador."],
  cargas: ["Carga e descarga", "Entrada e saída de pátio."],
  vendas: ["Vendas", "Monte pedidos com clientes cadastrados e produtos do catálogo."],
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
    field("limiteCredito", "Limite de crédito", "number", "min='0' step='0.01'"),
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
    field("produtoId", "Código do produto", "text"), field("nome", "Nome", "text", "required"),
    field("categoria", "Categoria", "text"), field("medida", "Medida", "text"),
    field("unidade", "Unidade (ex.: un, pneu)", "text"), field("preco", "Preço de venda", "number", "required min='0' step='0.01'"),
    field("custo", "Custo unitário", "number", "required min='0' step='0.01'"),
    field("estoqueCentral", "Estoque do depósito central", "number", "required min='0' step='1'"),
    field("status", "Status", "select"),
    field("obs", "Observações", "textarea")
  ].join(""),
  veiculos: () => [
    field("clienteId", "Cliente", "select", "required"),
    field("marca", "Marca", "text"),
    field("modelo", "Modelo", "text", "required"),
    field("ano", "Ano", "text"),
    field("placa", "Placa", "text"),
    field("medidaPneu", "Medida do pneu", "text"),
    field("status", "Status", "select")
  ].join(""),
  servicos: () => [
    field("codigo", "Código", "text"),
    field("nome", "Nome do serviço", "text", "required"),
    field("descricao", "Descrição", "text"),
    field("preco", "Preço", "number", "required min='0' step='0.01'"),
    field("status", "Status", "select")
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
    field("produtoId", "Código do produto", "text", "required"), field("item", "Descrição", "text", "required"),
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
    field("cliente", "Cliente", "text", "required list='clientesPedido' autocomplete='off'"), field("data", "Data", "date", "required"),
    field("pagamento", "Pagamento", "select"), field("status", "Status", "select"),
    field("vendedor", "Vendedor", "text"), field("previsao", "Previsão", "date"),
    field("obs", "Observação", "textarea")
  ].join("")
};

const SELECTS = {
  clientes: { tipo: ["Pessoa física", "Pessoa jurídica"], status: ["Ativo", "Inativo"] },
  veiculos: { status: ["Ativo", "Inativo"] },
  servicos: { status: ["Ativo", "Inativo"] },
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
  capa: { pagamento: ["boleto", "pix", "dinheiro", "cartão", "a prazo"], status: ["orçamento", "faturado", "pago", "cancelado"] }
};

function fillSelects(root, kind) {
  const spec = SELECTS[kind] || {};
  root.querySelectorAll("select").forEach((sel) => {
    const options = spec[sel.name] || [];
    const dinâmico = sel.name === "clienteId";
    const choices = dinâmico
      ? db.clientes.filter((cliente) => String(cliente.status || "").toLowerCase() !== "inativo")
        .map((cliente) => [cliente.id, `${cliente.nome}${cliente.documento ? ` · ${cliente.documento}` : ""}`])
      : options;
    sel.innerHTML = (dinâmico ? `<option value="">Selecione...</option>` : "") + choices.map((o) => Array.isArray(o)
      ? `<option value="${escapeHtml(o[0])}">${escapeHtml(o[1])}</option>`
      : `<option>${escapeHtml(o)}</option>`).join("");
  });
}

document.getElementById("nav").innerHTML = NAV.map(([id, label]) => `<button data-page="${id}">${label}</button>`).join("");
document.getElementById("nav").onclick = (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  page = b.dataset.page;
  pedidoId = null;
  vendaRascunho = null;
  query = "";
  confirmDelete = "";
  render();
};
document.getElementById("cancelBtn").onclick = () => document.getElementById("modal").classList.remove("show");
document.getElementById("form").onsubmit = async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  ["qtd", "minimo", "custo", "preco", "valor", "carcacas", "unitario", "limiteCredito", "estoqueCentral"].forEach((k) => { if (k in data) data[k] = Number(data[k] || 0); });
  try {
    if (editing.id) {
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
  const titles = { clientes: row ? "Editar cliente" : "Cadastrar cliente", produtos: row ? "Editar produto" : "Cadastrar produto", carcacas: "Carcaça", estoque: "Estoque", producao: "Produção", cargas: "Movimento", financeiro: "Lançamento", contas: "Título", boletos: "Boleto" };
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
  if (vendaRascunho) return renderVenda();
  if (pedidoId) return renderPedido();
  const [title, lede] = TITLES[page];
  document.getElementById("title").textContent = title;
  document.getElementById("lede").textContent = lede;
  const creates = { clientes: "Cadastrar cliente", veiculos: "Cadastrar veículo", servicos: "Cadastrar serviço", produtos: "Cadastrar produto", carcacas: "Nova carcaça", estoque: "Novo item", producao: "Novo apontamento", cargas: "Novo movimento", vendas: "Novo pedido", financeiro: "Novo lançamento", contas: "Novo título", boletos: "Novo boleto" };
  actions.innerHTML = creates[page] ? `<button class="btn" id="addBtn">${creates[page]}</button>` : "";
  view.innerHTML = views[page]();
  const add = document.getElementById("addBtn");
  if (add) add.onclick = () => page === "vendas" ? iniciarPedido() : openForm(page);
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
  view.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => {
    pedidoId = b.dataset.open;
    vendaRascunho = null;
    confirmDelete = "";
    render();
  });
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
  produtos() {
    const busca = normalizarBuscaCliente(query);
    const produtos = db.produtos.filter((produto) => !busca || normalizarBuscaCliente([
      produto.produtoId, produto.nome, produto.categoria, produto.medida, produto.status
    ].join(" ")).includes(busca));
    const ativos = db.produtos.filter((produto) => String(produto.status || "").toLowerCase() !== "inativo").length;
    const estoqueLocalTotal = db.produtos.reduce((soma, produto) => soma + estoqueLocal(produto), 0);
    const estoqueCentralTotal = db.produtos.reduce((soma, produto) => soma + Number(produto.estoqueCentral || 0), 0);
    return `<div class="produto-resumo-kpis">
      <div class="produto-resumo-kpi"><span>Produtos cadastrados</span><strong>${db.produtos.length}</strong></div>
      <div class="produto-resumo-kpi"><span>Produtos ativos</span><strong>${ativos}</strong></div>
      <div class="produto-resumo-kpi"><span>Estoque local</span><strong>${estoqueLocalTotal} <small>un.</small></strong></div>
      <div class="produto-resumo-kpi"><span>Depósito central</span><strong>${estoqueCentralTotal} <small>un.</small></strong></div>
    </div>
    <section class="card produto-admin">
      <div class="produto-admin-toolbar">
        <label>Pesquisar produto<input id="q" type="search" placeholder="Nome, código, categoria ou medida" value="${escapeAttr(query)}"></label>
        <span>${produtos.length} de ${db.produtos.length} produtos</span>
      </div>
      <div class="produto-admin-grid">${produtos.length ? produtos.map((produto) => {
        const estoque = estoqueLocal(produto);
        return `<article class="produto-admin-card">
          <div class="produto-admin-topo"><span class="produto-codigo">${escapeHtml(produto.produtoId || "Sem código")}</span>${badge(produto.status)}</div>
          <div class="produto-admin-info"><h2>${escapeHtml(produto.nome)}</h2><p>${escapeHtml([produto.categoria, produto.medida].filter(Boolean).join(" · ") || "Produto sem categoria ou medida")}</p></div>
          <div class="produto-admin-preco"><span>Preço de venda</span><strong>${money(produto.preco)}</strong></div>
          <div class="produto-admin-estoque">
            <div><span>Estoque local</span><strong class="${estoque > 0 ? "ok" : "warn"}">${estoque} <small>un.</small></strong></div>
            <div><span>Depósito central</span><strong>${Number(produto.estoqueCentral || 0)} <small>un.</small></strong></div>
          </div>
          <div class="produto-admin-acoes"><button class="btn ghost small" type="button" data-edit="produtos:${escapeHtml(produto.id)}">Editar produto</button><button class="btn danger small" type="button" data-del="produtos:${escapeHtml(produto.id)}">Excluir</button></div>
        </article>`;
      }).join("") : `<p class="hint">${db.produtos.length ? "Nenhum produto corresponde à pesquisa." : "Nenhum produto cadastrado. Use “Cadastrar produto” para criar o primeiro item do catálogo."}</p>`}</div>
    </section>`;
  },
  veiculos() { return table("veiculos", ["Cliente", "Marca", "Modelo", "Ano", "Placa", "Medida do pneu", "Status"], (r) => [
    escapeHtml(db.clientes.find((cliente) => cliente.id === r.clienteId)?.nome || "Cliente não encontrado"),
    escapeHtml(r.marca), escapeHtml(r.modelo), escapeHtml(r.ano), escapeHtml(r.placa), escapeHtml(r.medidaPneu), badge(r.status)
  ]); },
  servicos() { return table("servicos", ["Código", "Serviço", "Descrição", "Preço", "Status"], (r) => [
    escapeHtml(r.codigo), escapeHtml(r.nome), escapeHtml(r.descricao), money(r.preco), badge(r.status)
  ]); },
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
        <h3>${escapeHtml(p.cliente)}</h3>
        <dl class="capa">
          <div><dt>Data</dt><dd>${br(p.data)}</dd></div>
          <div><dt>Pagamento</dt><dd>${escapeHtml(p.pagamento)}</dd></div>
          <div><dt>Itens</dt><dd class="num">${p.itens.length}</dd></div>
          <div><dt>Total</dt><dd class="num">${money(totalPedido(p))}</dd></div>
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

function iniciarPedido() {
  vendaRascunho = {
    clienteId: "", veiculoId: "", data: today(), pagamento: "pix", vendedor: "", previsao: "",
    obs: "", box: "", agendamento: "", horario: "", status: "orçamento", descontoPercentual: 0, itens: []
  };
  etapaVenda = 1;
  pedidoId = null;
  render();
}

function clienteSelecionado() {
  return db.clientes.find((cliente) => cliente.id === vendaRascunho?.clienteId);
}

function limiteDisponivel(cliente) {
  const usado = db.pedidos
    .filter((pedido) => pedido.clienteId === cliente.id && pedido.status === "faturado" && ["boleto", "a prazo"].includes(pedido.pagamento))
    .reduce((soma, pedido) => soma + totalPedido(pedido), 0);
  return Math.max(0, Number(cliente.limiteCredito || 0) - usado);
}

function estoqueLocal(produto) {
  return db.estoque
    .filter((linha) => linha.produtoRef === produto.id || (!linha.produtoRef && linha.produtoId === produto.produtoId))
    .reduce((soma, linha) => soma + Number(linha.qtd || 0), 0);
}

function produtoEhPneu(produto) {
  return !["serviço", "servicos", "serviço"].includes(String(produto.categoria || "").trim().toLocaleLowerCase("pt-BR"));
}

function subtotalPorTipo(tipo) {
  return vendaRascunho.itens
    .filter((item) => item.tipo === tipo)
    .reduce((soma, item) => soma + item.qtd * item.unitario, 0);
}

function alterarItem(tipo, id, quantidade) {
  const produto = tipo === "pneu" ? db.produtos.find((item) => item.id === id) : db.servicos.find((item) => item.id === id);
  if (!produto) return;
  const item = vendaRascunho.itens.find((linha) => linha.tipo === tipo && linha.referencia === id);
  if (quantidade <= 0) {
    vendaRascunho.itens = vendaRascunho.itens.filter((linha) => linha !== item);
  } else if (item) {
    item.qtd = Math.floor(quantidade);
  } else {
    vendaRascunho.itens.push({
      tipo,
      referencia: id,
      produtoRef: tipo === "pneu" ? id : "",
      servicoRef: tipo === "servico" ? id : "",
      produtoId: tipo === "pneu" ? produto.produtoId || "" : produto.codigo || "",
      descricao: produto.nome,
      medida: tipo === "pneu" ? produto.medida || "" : "",
      qtd: Math.floor(quantidade),
      unitario: Number(produto.preco) || 0
    });
  }
  render();
}

function itensMarkup(tipo) {
  const catalogo = tipo === "pneu" ? db.produtos.filter(produtoEhPneu) : db.servicos;
  const ativos = catalogo.filter((item) => String(item.status || "").toLowerCase() !== "inativo");
  return ativos.length ? ativos.map((item) => {
    const selecionado = vendaRascunho.itens.find((linha) => linha.tipo === tipo && linha.referencia === item.id);
    const qtd = selecionado?.qtd || 0;
    const detalhe = tipo === "pneu"
      ? [item.categoria, item.medida].filter(Boolean).join(" · ")
      : item.descricao || "Serviço de montagem";
    const estoque = tipo === "pneu" ? `<span>Estoque local: <strong>${estoqueLocal(item)}</strong> un · Depósito central: <strong>${Number(item.estoqueCentral || 0)}</strong> un</span>` : "";
    return `<article class="venda-item ${qtd ? "selecionado" : ""}">
      <label class="venda-item-check"><input type="checkbox" data-check-item="${tipo}:${escapeHtml(item.id)}" ${qtd ? "checked" : ""}><span></span></label>
      <div class="venda-item-info">
        <span class="mono">${escapeHtml(tipo === "pneu" ? item.produtoId || "Sem código" : item.codigo || "Serviço")}</span>
        <h3>${escapeHtml(item.nome)}</h3><p>${escapeHtml(detalhe || "—")}</p>${estoque}
      </div>
      <strong class="venda-item-preco">${money(item.preco)}</strong>
      <div class="quantidade">
        <button type="button" aria-label="Diminuir quantidade" data-qty-change="${tipo}:${escapeHtml(item.id)}:-1">−</button>
        <input type="number" min="0" step="1" value="${qtd}" aria-label="Quantidade de ${escapeHtml(item.nome)}" data-qty-value="${tipo}:${escapeHtml(item.id)}">
        <button type="button" aria-label="Aumentar quantidade" data-qty-change="${tipo}:${escapeHtml(item.id)}:1">+</button>
      </div>
    </article>`;
  }).join("") : `<p class="hint">Nenhum ${tipo === "pneu" ? "pneu" : "serviço"} ativo cadastrado. Use as abas Produtos e Serviços para montar o catálogo.</p>`;
}

function etapasMarkup() {
  const nomes = ["Cliente / Veículo", "Pneus", "Serviços", "Pagamento"];
  return `<div class="venda-etapas">${nomes.map((nome, index) => {
    const numero = index + 1;
    const estado = numero < etapaVenda ? "concluida" : numero === etapaVenda ? "atual" : "";
    return `<button type="button" class="venda-etapa ${estado}" data-etapa="${numero}" ${numero > etapaVenda ? "disabled" : ""}>
      <span>${numero < etapaVenda ? "✓" : numero}</span>${nome}
    </button>`;
  }).join("")}</div>`;
}

function clienteEtapaMarkup() {
  const selecionado = clienteSelecionado();
  const termoBusca = String(vendaRascunho.clienteBusca || "").trim();
  const sugestoes = !selecionado && termoBusca.length >= 3
    ? clientesCorrespondentes(termoBusca).slice(0, 8)
    : [];
  const veiculos = selecionado
    ? db.veiculos.filter((veiculo) => veiculo.clienteId === selecionado.id && String(veiculo.status || "").toLowerCase() !== "inativo")
    : [];
  return `<section class="card venda-etapa-conteudo">
    <span class="meta">Etapa 1 de 4</span><h2>Dados do cliente e veículo</h2>
    <label class="venda-busca">Buscar cliente por nome ou CPF / CNPJ
      <input id="buscaClienteVenda" type="search" placeholder="Digite ao menos 3 letras ou números" autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="sugestoesClienteVenda" aria-expanded="${sugestoes.length ? "true" : "false"}" value="${escapeHtml(vendaRascunho.clienteBusca || "")}">
    </label>
    <div id="sugestoesClienteVenda" class="cliente-sugestoes" role="listbox">
      ${termoBusca.length >= 3 && !selecionado
        ? sugestoes.length
          ? sugestoes.map((cliente) => `<button type="button" class="cliente-sugestao" role="option" aria-selected="false" data-cliente-venda="${escapeHtml(cliente.id)}">
              <span><strong>${escapeHtml(cliente.nome)}</strong><small>${escapeHtml(cliente.documento || "Documento não cadastrado")}</small></span>
              <span class="cliente-sugestao-contato">${escapeHtml(cliente.telefone || cliente.email || "")}</span>
            </button>`).join("")
          : `<p class="cliente-sugestoes-vazio">Nenhum cliente correspondente.</p>`
        : ""}
    </div>
    ${selecionado ? `<div class="cliente-resumo">
      <div><span class="meta">Cliente</span><strong>${escapeHtml(selecionado.nome)}</strong><span>${escapeHtml(selecionado.documento || "Documento não cadastrado")}</span></div>
      <div><span class="meta">Limite de crédito</span><strong>${money(selecionado.limiteCredito)}</strong><span>Disponível: ${money(limiteDisponivel(selecionado))}</span></div>
    </div>
    <label class="venda-busca">Veículo
      <select id="veiculoVenda"><option value="">Sem veículo</option>${veiculos.map((v) => `<option value="${escapeHtml(v.id)}" ${v.id === vendaRascunho.veiculoId ? "selected" : ""}>${escapeHtml([v.marca, v.modelo, v.ano, v.placa].filter(Boolean).join(" · "))}</option>`).join("")}</select>
    </label>${!veiculos.length ? `<p class="hint">Este cliente ainda não tem veículo cadastrado. Você pode continuar sem veículo ou cadastrá-lo na aba Veículos.</p>` : ""}`
      : `<p class="hint">${db.clientes.length ? "Escolha uma opção do cadastro para exibir os dados e os veículos do cliente." : "Cadastre um cliente antes de iniciar uma venda."}</p>`}
    <div class="venda-navegacao"><span></span><button class="btn" type="button" data-proxima ${selecionado ? "" : "disabled"}>Próximo: Pneus →</button></div>
  </section>`;
}

function normalizarBuscaCliente(valor) {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

function clientesCorrespondentes(termo) {
  const buscaTexto = normalizarBuscaCliente(termo);
  const buscaDocumento = buscaTexto.replace(/\D/g, "");
  return db.clientes.filter((cliente) => {
    if (String(cliente.status || "").toLowerCase() === "inativo") return false;
    const nome = normalizarBuscaCliente(cliente.nome);
    const documento = normalizarBuscaCliente(cliente.documento);
    return nome.includes(buscaTexto) || (buscaDocumento.length >= 3 && documento.replace(/\D/g, "").includes(buscaDocumento));
  });
}

function produtoVendaCardMarkup(produto) {
  const selecionado = vendaRascunho.itens.find((item) => item.tipo === "pneu" && item.referencia === produto.id);
  const quantidade = selecionado?.qtd || 0;
  const estoque = estoqueLocal(produto);
  const detalhe = [produto.categoria, produto.medida].filter(Boolean).join(" · ");
  return `<article class="produto-venda-card ${quantidade ? "selecionado" : ""}">
    <div class="produto-venda-cabecalho">
      <span class="produto-codigo">${escapeHtml(produto.produtoId || "Sem código")}</span>
      <span class="produto-estoque ${estoque > 0 ? "disponivel" : "indisponivel"}">${estoque > 0 ? `${estoque} em estoque` : "Sem estoque local"}</span>
    </div>
    <div class="produto-venda-info">
      <h3>${escapeHtml(produto.nome)}</h3>
      <p>${escapeHtml(detalhe || "Pneu")}</p>
    </div>
    <div class="produto-venda-rodape">
      <div class="produto-venda-preco"><span>Preço unitário</span><strong>${money(produto.preco)}</strong></div>
      <div class="quantidade produto-venda-quantidade">
        <button type="button" aria-label="Diminuir quantidade de ${escapeHtml(produto.nome)}" data-qty-change="pneu:${escapeHtml(produto.id)}:-1">−</button>
        <input type="number" min="0" step="1" value="${quantidade}" aria-label="Quantidade de ${escapeHtml(produto.nome)}" data-qty-value="pneu:${escapeHtml(produto.id)}">
        <button type="button" aria-label="Aumentar quantidade de ${escapeHtml(produto.nome)}" data-qty-change="pneu:${escapeHtml(produto.id)}:1">+</button>
      </div>
    </div>
  </article>`;
}

function produtosEtapaMarkup() {
  const catalogo = db.produtos.filter((produto) => produtoEhPneu(produto) && String(produto.status || "").toLowerCase() !== "inativo");
  const termo = String(vendaRascunho.buscaProduto || "");
  const busca = normalizarBuscaCliente(termo.trim());
  const produtos = catalogo.filter((produto) => !busca || normalizarBuscaCliente([
    produto.produtoId, produto.nome, produto.categoria, produto.medida
  ].join(" ")).includes(busca));
  const quantidadeSelecionada = vendaRascunho.itens.filter((item) => item.tipo === "pneu").reduce((soma, item) => soma + item.qtd, 0);
  return `<section class="card venda-etapa-conteudo">
    <span class="meta">Etapa 2 de 4</span><h2>Catálogo de pneus</h2><p class="hint">Pesquise por nome, código, categoria ou medida e ajuste a quantidade no próprio produto.</p>
    <div class="produto-venda-toolbar">
      <label>Buscar no catálogo<input id="buscaProdutoVenda" type="search" placeholder="Ex.: Continental, 205/55 R16 ou código" autocomplete="off" value="${escapeHtml(termo)}"></label>
      <span class="produto-contagem">${produtos.length} de ${catalogo.length} produtos</span>
    </div>
    <div class="produto-venda-grid">${produtos.length ? produtos.map(produtoVendaCardMarkup).join("") : `<p class="hint">${catalogo.length ? "Nenhum produto corresponde à busca." : "Nenhum pneu ativo cadastrado. Use a aba Produtos para montar o catálogo."}</p>`}</div>
    <div class="venda-subtotal"><span>${quantidadeSelecionada} pneus selecionados</span><strong>Subtotal pneus: ${money(subtotalPorTipo("pneu"))}</strong></div>
    <div class="venda-navegacao"><button class="btn ghost" type="button" data-anterior>← Anterior</button><button class="btn" type="button" data-proxima>Próximo: Serviços →</button></div>
  </section>`;
}

function servicosEtapaMarkup() {
  return `<section class="card venda-etapa-conteudo">
    <span class="meta">Etapa 3 de 4</span><h2>Serviços para a montagem</h2><p class="hint">Marque os serviços e ajuste a quantidade na lista.</p>
    <div class="venda-lista">${itensMarkup("servico")}</div>
    <div class="venda-subtotal"><span>Subtotal pneus: ${money(subtotalPorTipo("pneu"))}</span><strong>Subtotal serviços: ${money(subtotalPorTipo("servico"))}</strong></div>
    <div class="venda-navegacao"><button class="btn ghost" type="button" data-anterior>← Anterior</button><button class="btn" type="button" data-proxima>Próximo: Pagamento →</button></div>
  </section>`;
}

function pagamentoEtapaMarkup() {
  const subtotal = total(vendaRascunho.itens);
  const percentual = Number(vendaRascunho.descontoPercentual) || 0;
  const desconto = Math.round(subtotal * percentual) / 100;
  return `<section class="card venda-etapa-conteudo">
    <span class="meta">Etapa 4 de 4</span><h2>Pagamento e conclusão</h2>
    <div class="venda-resumo">${vendaRascunho.itens.map((item) => `<div><span>${item.qtd} × ${escapeHtml(item.descricao)}${item.medida ? ` ${escapeHtml(item.medida)}` : ""}</span><strong>${money(item.qtd * item.unitario)}</strong></div>`).join("") || `<p class="hint">Nenhum item selecionado. Volte e adicione pneus ou serviços.</p>`}
      <div class="resumo-subtotal"><span>Subtotal pneus</span><strong>${money(subtotalPorTipo("pneu"))}</strong></div>
      <div><span>Subtotal serviços</span><strong>${money(subtotalPorTipo("servico"))}</strong></div>
      <div class="desconto-linha"><label>Desconto (%)<input id="descontoPercentual" type="number" min="0" max="100" step="0.01" value="${escapeHtml(percentual)}"></label>
        <label>Valor do desconto<input id="descontoValor" type="text" readonly value="${money(desconto)}"></label></div>
      <div class="venda-total"><span>Total final</span><strong id="totalFinal">${money(Math.max(0, subtotal - desconto))}</strong></div>
    </div>
    <div class="grid venda-pagamento">
      <label>Forma de pagamento<select id="pagamentoVenda">${["pix", "dinheiro", "cartão", "boleto", "a prazo"].map(v => `<option ${v === vendaRascunho.pagamento ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <label>Status da venda<select id="statusVenda"><option value="orçamento" ${vendaRascunho.status === "orçamento" ? "selected" : ""}>Pedido (não baixa estoque)</option><option value="faturado" ${vendaRascunho.status === "faturado" ? "selected" : ""}>Faturar agora (baixa estoque)</option><option value="pago" ${vendaRascunho.status === "pago" ? "selected" : ""}>Pago e faturado (baixa estoque)</option></select></label>
    </div>
    <h3 class="venda-agenda-titulo">Agendar na oficina (opcional)</h3>
    <div class="grid venda-pagamento">
      <label>Box<input id="boxVenda" type="text" value="${escapeHtml(vendaRascunho.box)}" placeholder="Ex.: Box 02 - Elevador 1"></label>
      <label>Data<input id="dataAgendaVenda" type="date" value="${escapeHtml(vendaRascunho.agendamento)}"></label>
      <label>Horário<input id="horarioVenda" type="time" value="${escapeHtml(vendaRascunho.horario)}"></label>
    </div>
    <div class="venda-navegacao"><button class="btn ghost" type="button" data-anterior>← Anterior</button><button class="btn" type="button" id="concluirVenda" ${vendaRascunho.itens.length ? "" : "disabled"}>Concluir venda e baixar pedido em PDF</button></div>
  </section>`;
}

function renderVenda() {
  const nomes = ["Cliente / Veículo", "Pneus", "Serviços", "Pagamento"];
  document.getElementById("title").textContent = `Nova venda · Etapa ${etapaVenda} de 4`;
  document.getElementById("lede").textContent = "Sistema SFA / PDV — complete as etapas para concluir a venda.";
  document.getElementById("actions").innerHTML = `<button class="btn ghost" id="cancelarVenda" type="button">Cancelar venda</button>`;
  const conteudo = [clienteEtapaMarkup, produtosEtapaMarkup, servicosEtapaMarkup, pagamentoEtapaMarkup][etapaVenda - 1]();
  document.getElementById("view").innerHTML = `<section class="card venda-topo"><div><span class="meta">Sistema SFA / PDV</span><h2>${escapeHtml(nomes[etapaVenda - 1])}</h2></div><span class="badge">${etapaVenda} / 4</span></section>${etapasMarkup()}${conteudo}`;

  document.querySelectorAll("[data-etapa]").forEach((button) => button.onclick = () => { etapaVenda = Number(button.dataset.etapa); render(); });
  document.getElementById("cancelarVenda").onclick = () => {
    if (!confirm("Descartar os dados desta venda?")) return;
    vendaRascunho = null;
    render();
  };
  document.querySelectorAll("[data-anterior]").forEach((button) => button.onclick = () => { etapaVenda--; render(); });
  document.querySelectorAll("[data-proxima]").forEach((button) => button.onclick = () => {
    if (etapaVenda === 1 && !vendaRascunho.clienteId) {
      alert("Selecione um cliente cadastrado para continuar.");
      return;
    }
    etapaVenda++;
    render();
  });

  const busca = document.getElementById("buscaClienteVenda");
  if (busca) {
    busca.oninput = () => {
      vendaRascunho.clienteBusca = busca.value;
      vendaRascunho.clienteId = "";
      vendaRascunho.veiculoId = "";
      render();
      const novoCampo = document.getElementById("buscaClienteVenda");
      novoCampo.focus();
      novoCampo.setSelectionRange(novoCampo.value.length, novoCampo.value.length);
    };
  }
  document.querySelectorAll("[data-cliente-venda]").forEach((button) => button.onclick = () => {
    const cliente = db.clientes.find((item) => item.id === button.dataset.clienteVenda);
    if (!cliente) return;
    vendaRascunho.clienteId = cliente.id;
    vendaRascunho.clienteBusca = cliente.nome;
    vendaRascunho.veiculoId = "";
    render();
  });
  const buscaProduto = document.getElementById("buscaProdutoVenda");
  if (buscaProduto) buscaProduto.oninput = () => {
    const posicao = buscaProduto.selectionStart;
    vendaRascunho.buscaProduto = buscaProduto.value;
    render();
    const novoCampo = document.getElementById("buscaProdutoVenda");
    novoCampo.focus();
    novoCampo.setSelectionRange(posicao, posicao);
  };
  const veiculo = document.getElementById("veiculoVenda");
  if (veiculo) veiculo.onchange = () => { vendaRascunho.veiculoId = veiculo.value; };

  document.querySelectorAll("[data-check-item]").forEach((control) => control.onchange = () => {
    const [tipo, id] = control.dataset.checkItem.split(":");
    alterarItem(tipo, id, control.checked ? 1 : 0);
  });
  document.querySelectorAll("[data-qty-change]").forEach((button) => button.onclick = () => {
    const [tipo, id, incremento] = button.dataset.qtyChange.split(":");
    const atual = vendaRascunho.itens.find((item) => item.tipo === tipo && item.referencia === id)?.qtd || 0;
    alterarItem(tipo, id, atual + Number(incremento));
  });
  document.querySelectorAll("[data-qty-value]").forEach((input) => input.onchange = () => {
    const [tipo, id] = input.dataset.qtyValue.split(":");
    const qtd = Number(input.value);
    if (!Number.isInteger(qtd) || qtd < 0) { alert("Informe uma quantidade inteira igual ou maior que zero."); render(); return; }
    alterarItem(tipo, id, qtd);
  });
  const desconto = document.getElementById("descontoPercentual");
  if (desconto) desconto.oninput = () => {
    const percentual = Math.min(100, Math.max(0, Number(desconto.value) || 0));
    vendaRascunho.descontoPercentual = percentual;
    const valorDesconto = total(vendaRascunho.itens) * percentual / 100;
    document.getElementById("descontoValor").value = money(valorDesconto);
    document.getElementById("totalFinal").textContent = money(Math.max(0, total(vendaRascunho.itens) - valorDesconto));
  };
  const pagamento = document.getElementById("pagamentoVenda");
  if (pagamento) pagamento.onchange = () => { vendaRascunho.pagamento = pagamento.value; };
  const status = document.getElementById("statusVenda");
  if (status) status.onchange = () => { vendaRascunho.status = status.value; };
  const box = document.getElementById("boxVenda");
  if (box) box.oninput = () => { vendaRascunho.box = box.value; };
  const dataAgenda = document.getElementById("dataAgendaVenda");
  if (dataAgenda) dataAgenda.onchange = () => { vendaRascunho.agendamento = dataAgenda.value; };
  const horario = document.getElementById("horarioVenda");
  if (horario) horario.onchange = () => { vendaRascunho.horario = horario.value; };
  const concluir = document.getElementById("concluirVenda");
  if (concluir) concluir.onclick = concluirVenda;
}

async function concluirVenda() {
  if (!vendaRascunho?.clienteId || !vendaRascunho.itens.length) {
    alert("Selecione o cliente e adicione ao menos um item antes de concluir.");
    return;
  }
  const corpo = {
    ...vendaRascunho,
    itens: vendaRascunho.itens.map((item) => ({
      tipo: item.tipo, produtoRef: item.produtoRef, servicoRef: item.servicoRef, qtd: item.qtd
    }))
  };
  let pedido;
  try {
    pedido = await api("/api/vendas", { method: "POST", body: JSON.stringify(corpo) });
  } catch (error) {
    alert(`Não foi possível salvar o pedido: ${error.message}`);
    return;
  }

  vendaRascunho = null;
  pedidoId = pedido.id;
  etapaVenda = 1;
  try {
    await load();
  } catch (error) {
    pedidoId = null;
    render();
    alert(`O pedido ${pedido.numero} foi salvo, mas não foi possível atualizar a tela: ${error.message}`);
  }
  render();
  try { await baixarPdf(pedido.id); }
  catch (error) { alert(`O pedido ${pedido.numero} foi salvo, mas não foi possível baixar o PDF: ${error.message}`); }
}

async function baixarPdf(id) {
  const response = await fetch(`/api/pedidos/${id}/pdf`);
  if (!response.ok) {
    let message = `Erro HTTP ${response.status}`;
    try { const body = await response.json(); message = body.detail || message; } catch {}
    throw new Error(message);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = response.headers.get("Content-Disposition")?.match(/filename="?([^";]+)"?/i)?.[1] || "pedido.pdf";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function renderPedido() {
  const pedido = db.pedidos.find((p) => p.id === pedidoId);
  if (!pedido) { pedidoId = null; return render(); }
  document.getElementById("title").textContent = pedido.numero;
  document.getElementById("lede").textContent = pedido.cliente;
  document.getElementById("actions").innerHTML = `<button class="btn ghost" id="backBtn" type="button">Voltar às vendas</button><button class="btn" id="baixarPedidoPdf" type="button">Baixar pedido em PDF</button>`;
  document.getElementById("view").innerHTML = `<section class="card">
    <div class="venda-detalhe-topo"><div><span class="meta">Pedido de venda</span><h2>${escapeHtml(pedido.numero)}</h2></div>${badge(pedido.status)}</div>
    <dl class="capa venda-detalhe">
      <div><dt>Cliente</dt><dd>${escapeHtml(pedido.cliente)}</dd></div>
      <div><dt>Veículo</dt><dd>${escapeHtml(db.veiculos.find((v) => v.id === pedido.veiculoId)?.modelo || "—")}</dd></div>
      <div><dt>Data</dt><dd>${br(pedido.data)}</dd></div>
      <div><dt>Pagamento</dt><dd>${escapeHtml(pedido.pagamento)}</dd></div>
      <div><dt>Agendamento</dt><dd>${br(pedido.agendamento)} ${escapeHtml(pedido.horario)}</dd></div>
      <div><dt>Box</dt><dd>${escapeHtml(pedido.box || "—")}</dd></div>
    </dl>
    <div class="table-wrap" style="margin-top:16px"><table><thead><tr><th>Item</th><th>Tipo</th><th>Qtd.</th><th>Unitário</th><th>Total</th></tr></thead><tbody>
      ${pedido.itens.map((item) => `<tr><td>${escapeHtml(item.descricao)} ${escapeHtml(item.medida)}</td><td>${item.tipo === "servico" ? "Serviço" : "Pneu"}</td><td>${item.qtd}</td><td>${money(item.unitario)}</td><td>${money(item.qtd * item.unitario)}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="venda-total"><span>Subtotal</span><strong>${money(total(pedido.itens))}</strong></div>
    <div class="venda-total"><span>Desconto (${Number(pedido.descontoPercentual || 0).toLocaleString("pt-BR")}%)</span><strong>− ${money(pedido.descontoValor)}</strong></div>
    <div class="venda-total"><span>Total final</span><strong>${money(totalPedido(pedido))}</strong></div>
    <div class="venda-navegacao">
      ${pedido.status === "orçamento" ? `<button class="btn" id="faturarPedido" type="button">Faturar e baixar estoque</button>` : ""}
      ${confirmDelete === `pedido:${pedido.id}`
        ? `<button class="btn danger" id="confirmarExclusaoPedido" type="button">Confirmar exclusão</button><button class="btn ghost" id="cancelarExclusaoPedido" type="button">Cancelar</button>`
        : `<button class="btn danger" id="pedirExclusaoPedido" type="button">Excluir pedido</button>`}
    </div>
  </section>`;
  document.getElementById("backBtn").onclick = () => { pedidoId = null; render(); };
  document.getElementById("baixarPedidoPdf").onclick = async () => {
    try { await baixarPdf(pedido.id); } catch (error) { alert(`Não foi possível baixar o PDF: ${error.message}`); }
  };
  const faturar = document.getElementById("faturarPedido");
  if (faturar) faturar.onclick = async () => {
    try {
      await api(`/api/pedidos/${pedido.id}`, { method: "PUT", body: JSON.stringify({ status: "faturado" }) });
      await load();
      render();
    } catch (error) { alert(`Não foi possível faturar a venda: ${error.message}`); }
  };
  const pedirExclusao = document.getElementById("pedirExclusaoPedido");
  if (pedirExclusao) pedirExclusao.onclick = () => { confirmDelete = `pedido:${pedido.id}`; render(); };
  const cancelarExclusao = document.getElementById("cancelarExclusaoPedido");
  if (cancelarExclusao) cancelarExclusao.onclick = () => { confirmDelete = ""; render(); };
  const confirmarExclusao = document.getElementById("confirmarExclusaoPedido");
  if (confirmarExclusao) confirmarExclusao.onclick = async () => {
    try {
      await api(`/api/pedidos/${pedido.id}`, { method: "DELETE" });
      pedidoId = null;
      confirmDelete = "";
      await load();
      render();
    } catch (error) { alert(`Não foi possível excluir o pedido: ${error.message}`); }
  };
}

reloadAndRender();
