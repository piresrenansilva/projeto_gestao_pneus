IF OBJECT_ID('dbo.produtos', 'U') IS NULL
CREATE TABLE dbo.produtos (
    id uniqueidentifier NOT NULL CONSTRAINT DF_produtos_id DEFAULT NEWID() CONSTRAINT PK_produtos PRIMARY KEY,
    criadoEm datetime2 NOT NULL CONSTRAINT DF_produtos_criadoEm DEFAULT SYSDATETIME(),
    codigo nvarchar(60) NULL,
    nome nvarchar(200) NOT NULL,
    categoria nvarchar(80) NULL,
    medida nvarchar(60) NULL,
    unidade nvarchar(20) NULL,
    preco decimal(12,2) NOT NULL CONSTRAINT DF_produtos_preco DEFAULT 0,
    custo decimal(12,2) NOT NULL CONSTRAINT DF_produtos_custo DEFAULT 0,
    descricao nvarchar(500) NULL,
    status nvarchar(30) NOT NULL CONSTRAINT DF_produtos_status DEFAULT N'Ativo'
);
GO

IF OBJECT_ID('dbo.seq_pedido', 'SO') IS NULL
    CREATE SEQUENCE dbo.seq_pedido START WITH 1 INCREMENT BY 1;
GO

IF OBJECT_ID('dbo.carcacas', 'U') IS NULL
CREATE TABLE dbo.carcacas (
    id        uniqueidentifier NOT NULL CONSTRAINT DF_carcacas_id DEFAULT NEWID() CONSTRAINT PK_carcacas PRIMARY KEY,
    criadoEm  datetime2        NOT NULL CONSTRAINT DF_carcacas_criadoEm DEFAULT SYSDATETIME(),
    fogo      nvarchar(50)  NULL,
    medida    nvarchar(50)  NULL,
    dono      nvarchar(150) NULL,
    origem    nvarchar(30)  NULL,
    qtd       int           NOT NULL CONSTRAINT DF_carcacas_qtd DEFAULT 0,
    entrada   date          NULL,
    status    nvarchar(30)  NULL,
    obs       nvarchar(500) NULL
);
GO

IF OBJECT_ID('dbo.estoque', 'U') IS NULL
CREATE TABLE dbo.estoque (
    id        uniqueidentifier NOT NULL CONSTRAINT DF_estoque_id DEFAULT NEWID() CONSTRAINT PK_estoque PRIMARY KEY,
    criadoEm  datetime2        NOT NULL CONSTRAINT DF_estoque_criadoEm DEFAULT SYSDATETIME(),
    sku       nvarchar(50)  NULL,
    item      nvarchar(200) NULL,
    medida    nvarchar(50)  NULL,
    tipo      nvarchar(30)  NULL,
    qtd       int           NOT NULL CONSTRAINT DF_estoque_qtd DEFAULT 0,
    minimo    int           NOT NULL CONSTRAINT DF_estoque_minimo DEFAULT 0,
    [local]   nvarchar(100) NULL
);
GO

IF OBJECT_ID('dbo.producao', 'U') IS NULL
CREATE TABLE dbo.producao (
    id        uniqueidentifier NOT NULL CONSTRAINT DF_producao_id DEFAULT NEWID() CONSTRAINT PK_producao PRIMARY KEY,
    criadoEm  datetime2        NOT NULL CONSTRAINT DF_producao_criadoEm DEFAULT SYSDATETIME(),
    data      date          NULL,
    turno     nvarchar(20)  NULL,
    medida    nvarchar(50)  NULL,
    qtd       int           NOT NULL CONSTRAINT DF_producao_qtd DEFAULT 0,
    carcacas  int           NOT NULL CONSTRAINT DF_producao_carcacas DEFAULT 0,
    banda     nvarchar(100) NULL,
    operador  nvarchar(100) NULL,
    status    nvarchar(30)  NULL
);
GO

IF OBJECT_ID('dbo.cargas', 'U') IS NULL
CREATE TABLE dbo.cargas (
    id        uniqueidentifier NOT NULL CONSTRAINT DF_cargas_id DEFAULT NEWID() CONSTRAINT PK_cargas PRIMARY KEY,
    criadoEm  datetime2        NOT NULL CONSTRAINT DF_cargas_criadoEm DEFAULT SYSDATETIME(),
    tipo      nvarchar(20)  NULL,
    data      date          NULL,
    placa     nvarchar(20)  NULL,
    motorista nvarchar(100) NULL,
    parceiro  nvarchar(150) NULL,
    nf        nvarchar(30)  NULL,
    qtd       int           NOT NULL CONSTRAINT DF_cargas_qtd DEFAULT 0,
    item      nvarchar(200) NULL,
    status    nvarchar(30)  NULL
);
GO

IF OBJECT_ID('dbo.pedidos', 'U') IS NULL
CREATE TABLE dbo.pedidos (
    id         uniqueidentifier NOT NULL CONSTRAINT DF_pedidos_id DEFAULT NEWID() CONSTRAINT PK_pedidos PRIMARY KEY,
    criadoEm   datetime2        NOT NULL CONSTRAINT DF_pedidos_criadoEm DEFAULT SYSDATETIME(),
    numero     nvarchar(20)  NOT NULL,
    data       date          NULL,
    cliente    nvarchar(150) NULL,
    pagamento  nvarchar(30)  NULL,
    status     nvarchar(30)  NULL,
    vendedor   nvarchar(100) NULL,
    previsao   date          NULL,
    obs        nvarchar(500) NULL
);
GO

IF OBJECT_ID('dbo.pedido_itens', 'U') IS NULL
CREATE TABLE dbo.pedido_itens (
    id         uniqueidentifier NOT NULL CONSTRAINT DF_pedido_itens_id DEFAULT NEWID() CONSTRAINT PK_pedido_itens PRIMARY KEY,
    criadoEm   datetime2        NOT NULL CONSTRAINT DF_pedido_itens_criadoEm DEFAULT SYSDATETIME(),
    pedidoId   uniqueidentifier NOT NULL CONSTRAINT FK_pedido_itens_pedido REFERENCES dbo.pedidos (id) ON DELETE CASCADE,
    codigo     nvarchar(50)  NULL,
    descricao  nvarchar(200) NULL,
    medida     nvarchar(50)  NULL,
    qtd        int           NOT NULL CONSTRAINT DF_pedido_itens_qtd DEFAULT 0,
    unitario   decimal(12,2) NOT NULL CONSTRAINT DF_pedido_itens_unitario DEFAULT 0
);
GO

IF OBJECT_ID('dbo.financeiro', 'U') IS NULL
CREATE TABLE dbo.financeiro (
    id         uniqueidentifier NOT NULL CONSTRAINT DF_financeiro_id DEFAULT NEWID() CONSTRAINT PK_financeiro PRIMARY KEY,
    criadoEm   datetime2        NOT NULL CONSTRAINT DF_financeiro_criadoEm DEFAULT SYSDATETIME(),
    data       date          NULL,
    tipo       nvarchar(20)  NULL,
    categoria  nvarchar(30)  NULL,
    descricao  nvarchar(200) NULL,
    valor      decimal(12,2) NOT NULL CONSTRAINT DF_financeiro_valor DEFAULT 0
);
GO

IF OBJECT_ID('dbo.contas', 'U') IS NULL
CREATE TABLE dbo.contas (
    id          uniqueidentifier NOT NULL CONSTRAINT DF_contas_id DEFAULT NEWID() CONSTRAINT PK_contas PRIMARY KEY,
    criadoEm    datetime2        NOT NULL CONSTRAINT DF_contas_criadoEm DEFAULT SYSDATETIME(),
    tipo        nvarchar(20)  NULL,
    pessoa      nvarchar(150) NULL,
    descricao   nvarchar(200) NULL,
    valor       decimal(12,2) NOT NULL CONSTRAINT DF_contas_valor DEFAULT 0,
    vencimento  date          NULL,
    boleto      nvarchar(100) NULL,
    status      nvarchar(30)  NULL
);
GO

IF OBJECT_ID('dbo.boletos', 'U') IS NULL
CREATE TABLE dbo.boletos (
    id          uniqueidentifier NOT NULL CONSTRAINT DF_boletos_id DEFAULT NEWID() CONSTRAINT PK_boletos PRIMARY KEY,
    criadoEm    datetime2        NOT NULL CONSTRAINT DF_boletos_criadoEm DEFAULT SYSDATETIME(),
    origem      nvarchar(20)  NULL,
    pessoa      nvarchar(150) NULL,
    numero      nvarchar(100) NULL,
    valor       decimal(12,2) NOT NULL CONSTRAINT DF_boletos_valor DEFAULT 0,
    vencimento  date          NULL,
    ref         nvarchar(150) NULL,
    status      nvarchar(30)  NULL
);
GO
