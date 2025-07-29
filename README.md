# PowerBI Backend - SQL Server CRUD

## Archivos del proyecto:
- `package.json` - Dependencias (mssql@4.3.2 compatible con Node 18)
- `server.js` - Servidor Express con CRUD SQL Server
- `.nvmrc` - Node.js 18.19.0

## Funcionalidades:
- ✅ GET /reportes - Lista reportes activos
- ✅ POST /reportes - Crea nuevo reporte  
- ✅ GET /reportes/:id - Obtiene reporte específico
- ✅ PUT /reportes/:id - Actualiza reporte
- ✅ DELETE /reportes/:id - Elimina reporte (soft delete)
- ✅ GET /health - Health check

## Base de datos:
- Server: 192.168.30.36
- Database: dbPowerbi
- User: sa
- Password: TJTQ

## Deploy:
1. Subir estos 3 archivos a GitHub
2. Conectar a Render
3. Listo - funciona con SQL Server real
