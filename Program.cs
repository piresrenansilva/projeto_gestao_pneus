using System.Data;
using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls("http://localhost:5080");
var app = builder.Build();

var cs = app.Configuration.GetConnectionString("Fabrica")
    ?? throw new InvalidOperationException("Falta ConnectionStrings:Fabrica no appsettings.json.");

try
{
    await Banco.Preparar(cs, app.Environment.ContentRootPath);
}
catch (Exception ex)
{
    Console.Error.WriteLine("Não foi possível conectar ao SQL Server Express:");
    Console.Error.WriteLine(ex.Message);
    return 1;
}

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapGet("/api/dados", async () =>
{
    try { return Results.Json(await Banco.TudoAsync(cs)); }
    catch (Exception ex) { return Results.Problem(ex.Message); }
});

foreach (var (rota, def) in Esquema.Tabelas)
{
    app.MapPost($"/api/{rota}", async (JsonElement corpo) =>
    {
        try { return Results.Json(new { id = await Banco.CriarAsync(cs, def, corpo) }); }
        catch (Exception ex) { return Results.Problem(ex.Message); }
    });

    app.MapPut($"/api/{rota}/{{id:guid}}", async (Guid id, JsonElement corpo) =>
    {
        try { await Banco.AtualizarAsync(cs, def, id, corpo); return Results.NoContent(); }
        catch (Exception ex) { return Results.Problem(ex.Message); }
    });

    app.MapDelete($"/api/{rota}/{{id:guid}}", async (Guid id) =>
    {
        try { await Banco.ExcluirAsync(cs, def, id); return Results.NoContent(); }
        catch (Exception ex) { return Results.Problem(ex.Message); }
    });
}

Console.WriteLine("Fábrica de Pneus rodando em http://localhost:5080");
app.Run();
return 0;

record Col(string Nome, char Tipo, bool SoLeitura = false);
record Def(string Tabela, Col[] Cols);

static class Esquema
{
    static Col S(string n) => new(n, 's');
    static Col I(string n) => new(n, 'i');
    static Col M(string n) => new(n, 'd');
    static Col T(string n) => new(n, 't');

    // rota da API -> tabela e colunas (os nomes batem com o JSON usado no site)
    public static readonly Dictionary<string, Def> Tabelas = new()
    {
        ["clientes"] = new("clientes", new[] { S("nome"), S("tipo"), S("documento"), S("telefone"), S("email"), S("cep"), S("endereco"), S("numero"), S("complemento"), S("bairro"), S("cidade"), S("estado"), S("status"), S("obs") }),
        ["produtos"] = new("produtos", new[] { S("produtoId"), S("nome"), S("categoria"), S("medida"), S("unidade"), M("preco"), M("custo"), S("obs"), S("status") }),
        ["carcacas"] = new("carcacas", new[] { S("fogo"), S("medida"), S("dono"), S("origem"), I("qtd"), T("entrada"), S("status"), S("obs") }),
        ["estoque"] = new("estoque", new[] { S("produtoId"), S("item"), S("medida"), S("tipo"), I("qtd"), I("minimo"), S("local") }),
        ["producao"] = new("producao", new[] { T("data"), S("turno"), S("medida"), I("qtd"), I("carcacas"), S("banda"), S("operador"), S("status") }),
        ["cargas"] = new("cargas", new[] { S("tipo"), T("data"), S("placa"), S("motorista"), S("parceiro"), S("nf"), I("qtd"), S("item"), S("status") }),
        ["pedidos"] = new("pedidos", new[] { new Col("numero", 's', true), T("data"), S("cliente"), S("pagamento"), S("status"), S("vendedor"), T("previsao"), S("obs") }),
        ["itens"] = new("pedido_itens", new[] { new Col("pedidoId", 'g'), S("produtoId"), S("descricao"), S("medida"), I("qtd"), M("unitario") }),
        ["financeiro"] = new("financeiro", new[] { T("data"), S("tipo"), S("categoria"), S("descricao"), M("valor") }),
        ["contas"] = new("contas", new[] { S("tipo"), S("pessoa"), S("descricao"), M("valor"), T("vencimento"), S("boleto"), S("status") }),
        ["boletos"] = new("boletos", new[] { S("origem"), S("pessoa"), S("numero"), M("valor"), T("vencimento"), S("ref"), S("status") }),
    };
}

static class Banco
{
    public static async Task Preparar(string cs, string raiz)
    {
        var sb = new SqlConnectionStringBuilder(cs);
        var nome = sb.InitialCatalog;
        sb.InitialCatalog = "master";

        await using (var master = new SqlConnection(sb.ConnectionString))
        {
            await master.OpenAsync();
            await using var criar = new SqlCommand(
                "IF DB_ID(@db) IS NULL BEGIN DECLARE @sql nvarchar(400) = N'CREATE DATABASE ' + QUOTENAME(@db); EXEC(@sql); END", master);
            criar.Parameters.AddWithValue("@db", nome);
            await criar.ExecuteNonQueryAsync();
        }

        var script = await File.ReadAllTextAsync(Path.Combine(raiz, "schema.sql"));
        await using var con = new SqlConnection(cs);
        await con.OpenAsync();
        foreach (var lote in Regex.Split(script, @"^\s*GO\s*$", RegexOptions.Multiline | RegexOptions.IgnoreCase))
        {
            if (string.IsNullOrWhiteSpace(lote)) continue;
            await using var cmd = new SqlCommand(lote, con);
            await cmd.ExecuteNonQueryAsync();
        }

        await using (var colunasProduto = new SqlCommand(@"
            IF COL_LENGTH('dbo.produtos', 'produtoId') IS NULL AND COL_LENGTH('dbo.produtos', 'codigo') IS NOT NULL
                EXEC sp_rename 'dbo.produtos.codigo', 'produtoId', 'COLUMN';
            IF COL_LENGTH('dbo.produtos', 'obs') IS NULL AND COL_LENGTH('dbo.produtos', 'descricao') IS NOT NULL
                EXEC sp_rename 'dbo.produtos.descricao', 'obs', 'COLUMN';", con))
        {
            await colunasProduto.ExecuteNonQueryAsync();
        }

        await using (var colunaItemPedido = new SqlCommand(@"
            IF COL_LENGTH('dbo.pedido_itens', 'produtoId') IS NULL AND COL_LENGTH('dbo.pedido_itens', 'codigo') IS NOT NULL
                EXEC sp_rename 'dbo.pedido_itens.codigo', 'produtoId', 'COLUMN';", con))
        {
            await colunaItemPedido.ExecuteNonQueryAsync();
        }

        await using (var coluna = new SqlCommand(@"
            IF COL_LENGTH('dbo.estoque', 'produtoRef') IS NULL
                ALTER TABLE dbo.estoque ADD produtoRef uniqueidentifier NULL;", con))
        {
            await coluna.ExecuteNonQueryAsync();
        }

        await using (var migrarEstoque = new SqlCommand(@"
            DECLARE @fk sysname;
            DECLARE @sql nvarchar(max);
            SELECT TOP (1) @fk = fk.name
            FROM sys.foreign_keys fk
            JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
            JOIN sys.columns c ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
            WHERE fk.parent_object_id = OBJECT_ID('dbo.estoque')
                AND fk.referenced_object_id = OBJECT_ID('dbo.produtos')
                AND c.name = 'produtoId';

            IF @fk IS NOT NULL
            BEGIN
                SET @sql = N'ALTER TABLE dbo.estoque DROP CONSTRAINT ' + QUOTENAME(@fk);
                EXEC(@sql);
                IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.estoque') AND name = 'UX_estoque_produtoId')
                    DROP INDEX UX_estoque_produtoId ON dbo.estoque;
                EXEC(N'UPDATE dbo.estoque
                      SET produtoRef = TRY_CONVERT(uniqueidentifier, produtoId)
                      WHERE produtoRef IS NULL AND TRY_CONVERT(uniqueidentifier, produtoId) IS NOT NULL');

                IF COL_LENGTH('dbo.estoque', 'sku') IS NOT NULL
                BEGIN
                    ALTER TABLE dbo.estoque DROP COLUMN produtoId;
                    EXEC sp_rename 'dbo.estoque.sku', 'produtoId', 'COLUMN';
                END
                ELSE
                    EXEC(N'UPDATE e SET produtoId = p.produtoId
                          FROM dbo.estoque e
                          JOIN dbo.produtos p ON p.id = e.produtoRef');
            END
            ELSE IF COL_LENGTH('dbo.estoque', 'sku') IS NOT NULL
            BEGIN
                IF COL_LENGTH('dbo.estoque', 'produtoId') IS NULL
                    EXEC sp_rename 'dbo.estoque.sku', 'produtoId', 'COLUMN';
                ELSE
                BEGIN
                    EXEC(N'UPDATE dbo.estoque
                          SET produtoId = sku
                          WHERE (produtoId IS NULL OR produtoId = N'''') AND sku IS NOT NULL');
                    ALTER TABLE dbo.estoque DROP COLUMN sku;
                END
            END;

            DECLARE @tipoId sysname;
            DECLARE @tamanhoId smallint;
            DECLARE @tipoRef sysname;
            DECLARE @tamanhoRef smallint;
            SELECT @tipoId = t.name, @tamanhoId = c.max_length
            FROM sys.columns c
            JOIN sys.types t ON t.user_type_id = c.user_type_id
            WHERE c.object_id = OBJECT_ID('dbo.produtos') AND c.name = 'id';
            SELECT @tipoRef = t.name, @tamanhoRef = c.max_length
            FROM sys.columns c
            JOIN sys.types t ON t.user_type_id = c.user_type_id
            WHERE c.object_id = OBJECT_ID('dbo.estoque') AND c.name = 'produtoRef';
            IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.estoque') AND name = 'UX_estoque_produtoRef')
                DROP INDEX UX_estoque_produtoRef ON dbo.estoque;

            IF @tipoId IN ('char', 'varchar', 'nchar', 'nvarchar')
                AND (@tipoRef <> @tipoId OR @tamanhoRef <> @tamanhoId)
            BEGIN
                SET @sql = N'ALTER TABLE dbo.estoque ALTER COLUMN produtoRef ' + @tipoId + N'(' +
                    CASE WHEN @tamanhoId = -1 THEN N'MAX'
                         WHEN @tipoId IN ('nchar', 'nvarchar') THEN CONVERT(nvarchar(10), @tamanhoId / 2)
                         ELSE CONVERT(nvarchar(10), @tamanhoId) END + N') NULL';
                EXEC(@sql);
            END
            ELSE IF @tipoId = 'uniqueidentifier' AND @tipoRef <> 'uniqueidentifier'
                ALTER TABLE dbo.estoque ALTER COLUMN produtoRef uniqueidentifier NULL;

            IF COL_LENGTH('dbo.estoque', 'produtoId') IS NULL
                ALTER TABLE dbo.estoque ADD produtoId nvarchar(60) NULL;", con))
        {
            await migrarEstoque.ExecuteNonQueryAsync();
        }

        // Garante o vínculo e cria uma linha de estoque para produtos já cadastrados.
        const string sincronizarEstoque = @"
            IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_estoque_produtos')
                ALTER TABLE dbo.estoque ADD CONSTRAINT FK_estoque_produtos
                    FOREIGN KEY (produtoRef) REFERENCES dbo.produtos(id) ON DELETE CASCADE;
            IF NOT EXISTS (
                SELECT 1 FROM sys.indexes i
                JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
                JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
                WHERE i.object_id = OBJECT_ID('dbo.estoque') AND i.is_unique = 1 AND c.name = 'produtoRef')
                CREATE UNIQUE INDEX UX_estoque_produtoRef ON dbo.estoque(produtoRef) WHERE produtoRef IS NOT NULL;
            UPDATE e
            SET produtoId = p.produtoId, item = p.nome, medida = p.medida
            FROM dbo.estoque e
            JOIN dbo.produtos p ON p.id = e.produtoRef
            WHERE e.tipo = N'produto';
            INSERT INTO dbo.estoque (produtoRef, produtoId, item, medida, tipo, qtd, minimo)
            SELECT p.id, p.produtoId, p.nome, p.medida, N'produto', 0, 0
            FROM dbo.produtos p
            WHERE NOT EXISTS (SELECT 1 FROM dbo.estoque e WHERE e.produtoRef = p.id);
            ";
        await using var sync = new SqlCommand(sincronizarEstoque, con);
        await sync.ExecuteNonQueryAsync();
    }

    public static async Task<Dictionary<string, List<Dictionary<string, object?>>>> TudoAsync(string cs)
    {
        await using var con = new SqlConnection(cs);
        await con.OpenAsync();

        var r = new Dictionary<string, List<Dictionary<string, object?>>>();
        foreach (var (rota, def) in Esquema.Tabelas)
            if (rota != "itens") r[rota] = await LerAsync(con, def);

        var itens = await LerAsync(con, Esquema.Tabelas["itens"]);
        var porPedido = itens.GroupBy(i => (string)i["pedidoId"]!).ToDictionary(g => g.Key, g => g.ToList());
        foreach (var p in r["pedidos"])
            p["itens"] = porPedido.TryGetValue((string)p["id"]!, out var l) ? l : new List<Dictionary<string, object?>>();
        return r;
    }

    static async Task<List<Dictionary<string, object?>>> LerAsync(SqlConnection con, Def def)
    {
        var nomes = string.Join(", ", new[] { "id" }.Concat(def.Cols.Select(c => c.Nome)).Select(n => $"[{n}]"));
        await using var cmd = new SqlCommand($"SELECT {nomes} FROM dbo.[{def.Tabela}] ORDER BY [criadoEm] DESC", con);
        await using var rd = await cmd.ExecuteReaderAsync();

        var lista = new List<Dictionary<string, object?>>();
        while (await rd.ReadAsync())
        {
            var linha = new Dictionary<string, object?>();
            for (var i = 0; i < rd.FieldCount; i++)
            {
                var v = rd.GetValue(i);
                linha[rd.GetName(i)] = v switch
                {
                    DBNull => "",
                    DateTime d => d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                    Guid g => g.ToString(),
                    _ => v
                };
            }
            lista.Add(linha);
        }
        return lista;
    }

    public static async Task<Guid> CriarAsync(string cs, Def def, JsonElement corpo)
    {
        await using var con = new SqlConnection(cs);
        await con.OpenAsync();
        await using var tx = (SqlTransaction)await con.BeginTransactionAsync();
        await using var cmd = con.CreateCommand();
        cmd.Transaction = tx;

        var usadas = Parametros(cmd, def.Cols, corpo);
        var nomes = usadas.Select(c => $"[{c.Nome}]").ToList();
        var valores = usadas.Select(c => "@" + c.Nome).ToList();

        if (def.Tabela == "pedidos")
        {
            nomes.Add("[numero]");
            valores.Add("'PED-' + FORMAT(NEXT VALUE FOR dbo.seq_pedido, '0000')");
        }

        cmd.CommandText = $"INSERT INTO dbo.[{def.Tabela}] ({string.Join(", ", nomes)}) OUTPUT inserted.id VALUES ({string.Join(", ", valores)})";
        var id = (Guid)(await cmd.ExecuteScalarAsync())!;

        if (def.Tabela == "produtos")
            await SincronizarEstoqueProdutoAsync(con, tx, id, corpo);

        await tx.CommitAsync();
        return id;
    }

    public static async Task AtualizarAsync(string cs, Def def, Guid id, JsonElement corpo)
    {
        await using var con = new SqlConnection(cs);
        await con.OpenAsync();
        await using var tx = (SqlTransaction)await con.BeginTransactionAsync();
        await using var cmd = con.CreateCommand();
        cmd.Transaction = tx;

        var usadas = Parametros(cmd, def.Cols, corpo);
        if (usadas.Count > 0)
        {
            var sets = string.Join(", ", usadas.Select(c => $"[{c.Nome}] = @{c.Nome}"));
            cmd.CommandText = $"UPDATE dbo.[{def.Tabela}] SET {sets} WHERE id = @id";
            cmd.Parameters.Add("@id", SqlDbType.UniqueIdentifier).Value = id;
            await cmd.ExecuteNonQueryAsync();
        }

        if (def.Tabela == "produtos")
            await SincronizarEstoqueProdutoAsync(con, tx, id, corpo);

        await tx.CommitAsync();
    }

    public static async Task ExcluirAsync(string cs, Def def, Guid id)
    {
        await using var con = new SqlConnection(cs);
        await con.OpenAsync();
        await using var cmd = new SqlCommand($"DELETE FROM dbo.[{def.Tabela}] WHERE id = @id", con);
        cmd.Parameters.Add("@id", SqlDbType.UniqueIdentifier).Value = id;
        await cmd.ExecuteNonQueryAsync();
    }

    static async Task SincronizarEstoqueProdutoAsync(SqlConnection con, SqlTransaction tx, Guid id, JsonElement corpo)
    {
        string Valor(string nome) => corpo.TryGetProperty(nome, out var v) && v.ValueKind != JsonValueKind.Null ? v.ToString() : "";
        await using var cmd = con.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = @"
IF EXISTS (SELECT 1 FROM dbo.estoque WHERE produtoRef = @id)
    UPDATE dbo.estoque SET produtoId=@produtoId, item=@nome, medida=@medida WHERE produtoRef=@id;
ELSE
    INSERT INTO dbo.estoque (produtoRef, produtoId, item, medida, tipo, qtd, minimo)
    VALUES (@id, @produtoId, @nome, @medida, N'produto', 0, 0);";
        cmd.Parameters.Add("@id", SqlDbType.UniqueIdentifier).Value = id;
        cmd.Parameters.Add("@produtoId", SqlDbType.NVarChar, 60).Value = Valor("produtoId");
        cmd.Parameters.Add("@nome", SqlDbType.NVarChar, 200).Value = Valor("nome");
        cmd.Parameters.Add("@medida", SqlDbType.NVarChar, 60).Value = Valor("medida");
        await cmd.ExecuteNonQueryAsync();
    }

    static List<Col> Parametros(SqlCommand cmd, Col[] cols, JsonElement corpo)
    {
        var usadas = new List<Col>();
        foreach (var c in cols)
        {
            if (c.SoLeitura || !corpo.TryGetProperty(c.Nome, out var el)) continue;

            var tipo = c.Tipo switch
            {
                'i' => SqlDbType.Int,
                'd' => SqlDbType.Decimal,
                't' => SqlDbType.Date,
                'g' => SqlDbType.UniqueIdentifier,
                _ => SqlDbType.NVarChar
            };
            var p = cmd.Parameters.Add("@" + c.Nome, tipo);
            if (c.Tipo == 'd') { p.Precision = 12; p.Scale = 2; }
            p.Value = Converter(c, el);
            usadas.Add(c);
        }
        return usadas;
    }

    static object Converter(Col c, JsonElement el)
    {
        if (el.ValueKind == JsonValueKind.Null) return DBNull.Value;
        var txt = el.ValueKind == JsonValueKind.String ? el.GetString() ?? "" : el.ToString();
        var vazio = string.IsNullOrWhiteSpace(txt);

        switch (c.Tipo)
        {
            case 'i':
                if (vazio) return 0;
                return (int)Math.Round(decimal.Parse(txt, CultureInfo.InvariantCulture));
            case 'd':
                if (vazio) return 0m;
                return decimal.Parse(txt, CultureInfo.InvariantCulture);
            case 't':
                if (vazio) return DBNull.Value;
                return DateTime.ParseExact(txt, "yyyy-MM-dd", CultureInfo.InvariantCulture);
            case 'g':
                return Guid.Parse(txt);
            default:
                return txt;
        }
    }
}
