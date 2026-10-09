@echo off
cd /d "%~dp0"
echo Iniciando Fábrica de Pneus...
echo Os dados serao carregados do SQL Server configurado em appsettings.json.
start "" http://localhost:5080
dotnet run
pause
