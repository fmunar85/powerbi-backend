const express = require('express');
const cors = require('cors');
const sql = require('mssql');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 PowerBI Backend v1.1.0 - HYBRID SQL/Memory');

// Configuración de CORS
app.use(cors({
    origin: ['https://powerbi-dashboards-1234.netlify.app', 'http://localhost:3000'],
    credentials: true
}));

app.use(express.json());

// Configuración de la base de datos
const dbConfig = {
    user: 'sa',
    password: 'TJTQ',
    server: '192.168.30.36',
    database: 'dbPowerbi',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        connectTimeout: 5000,
        requestTimeout: 5000
    }
};

// Variables de estado
let pool;
let useSQLServer = false;

// Datos en memoria como fallback
let reportes = [
    {
        id: 1,
        titulo: "Dashboard Ventas Q1 2025",
        mail: "admin@empresa.com",
        permisos_reportes: "admin",
        activo: 1,
        fecha_creacion: "2025-01-15T10:30:00.000Z"
    },
    {
        id: 2,
        titulo: "Análisis Financiero Enero",
        mail: "finanzas@empresa.com",
        permisos_reportes: "financiero",
        activo: 1,
        fecha_creacion: "2025-01-20T14:15:00.000Z"
    },
    {
        id: 3,
        titulo: "Métricas de Marketing",
        mail: "marketing@empresa.com",
        permisos_reportes: "marketing",
        activo: 1,
        fecha_creacion: "2025-01-25T09:45:00.000Z"
    }
];

let nextId = 4;

// Conectar a la base de datos
async function conectarDB() {
    try {
        pool = await sql.connect(dbConfig);
        console.log('✅ Conectado a SQL Server');
        useSQLServer = true;
        return true;
    } catch (error) {
        console.log('⚠️ SQL Server no disponible:', error.message);
        console.log('🔄 Usando modo memoria');
        useSQLServer = false;
        return false;
    }
}

// GET /reportes - Obtener todos los reportes activos
app.get('/reportes', async (req, res) => {
    try {
        console.log('📊 GET /reportes');
        
        if (useSQLServer) {
            const result = await pool.request()
                .query('SELECT id, titulo, mail, permisos_reportes, activo, fecha_creacion FROM reportes WHERE activo = 1 ORDER BY fecha_creacion DESC');
            
            console.log(`✅ SQL Server - Reportes: ${result.recordset.length}`);
            res.json(result.recordset);
        } else {
            const reportesActivos = reportes.filter(r => r.activo === 1);
            console.log(`✅ Memoria - Reportes: ${reportesActivos.length}`);
            res.json(reportesActivos);
        }
        
    } catch (error) {
        console.error('❌ Error en GET /reportes:', error.message);
        res.status(500).json({ error: 'Error obteniendo reportes' });
    }
});

// POST /reportes - Crear nuevo reporte
app.post('/reportes', async (req, res) => {
    try {
        const { titulo, mail, permisos_reportes } = req.body;
        
        if (!titulo || !mail) {
            return res.status(400).json({ error: 'Título y email requeridos' });
        }

        console.log('📝 POST /reportes:', { titulo, mail, permisos_reportes });

        if (useSQLServer) {
            const result = await pool.request()
                .input('titulo', sql.NVarChar, titulo)
                .input('mail', sql.NVarChar, mail)
                .input('permisos', sql.NVarChar, permisos_reportes || 'usuario')
                .query(`
                    INSERT INTO reportes (titulo, mail, permisos_reportes, activo, fecha_creacion)
                    OUTPUT INSERTED.*
                    VALUES (@titulo, @mail, @permisos, 1, GETDATE())
                `);

            console.log('✅ SQL Server - Reporte creado:', result.recordset[0]);
            res.status(201).json(result.recordset[0]);
        } else {
            const nuevoReporte = {
                id: nextId++,
                titulo: titulo.trim(),
                mail: mail.trim().toLowerCase(),
                permisos_reportes: permisos_reportes || 'usuario',
                activo: 1,
                fecha_creacion: new Date().toISOString()
            };
            
            reportes.push(nuevoReporte);
            console.log('✅ Memoria - Reporte creado:', nuevoReporte);
            res.status(201).json(nuevoReporte);
        }

    } catch (error) {
        console.error('❌ Error en POST /reportes:', error.message);
        res.status(500).json({ error: 'Error creando reporte' });
    }
});

// GET /reportes/:id - Obtener reporte específico
app.get('/reportes/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        console.log(`📋 GET /reportes/${id}`);

        if (useSQLServer) {
            const result = await pool.request()
                .input('id', sql.Int, id)
                .query('SELECT id, titulo, mail, permisos_reportes, activo, fecha_creacion FROM reportes WHERE id = @id AND activo = 1');

            if (result.recordset.length === 0) {
                return res.status(404).json({ error: 'Reporte no encontrado' });
            }

            console.log('✅ SQL Server - Reporte encontrado:', result.recordset[0]);
            res.json(result.recordset[0]);
        } else {
            const reporte = reportes.find(r => r.id === id && r.activo === 1);
            
            if (!reporte) {
                return res.status(404).json({ error: 'Reporte no encontrado' });
            }

            console.log('✅ Memoria - Reporte encontrado:', reporte);
            res.json(reporte);
        }

    } catch (error) {
        console.error('❌ Error en GET /reportes/:id:', error.message);
        res.status(500).json({ error: 'Error obteniendo reporte' });
    }
});

// PUT /reportes/:id - Actualizar reporte
app.put('/reportes/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { titulo, mail, permisos_reportes } = req.body;
        
        console.log(`📝 PUT /reportes/${id}:`, { titulo, mail, permisos_reportes });

        if (useSQLServer) {
            const result = await pool.request()
                .input('id', sql.Int, id)
                .input('titulo', sql.NVarChar, titulo)
                .input('mail', sql.NVarChar, mail)
                .input('permisos', sql.NVarChar, permisos_reportes)
                .query(`
                    UPDATE reportes 
                    SET titulo = @titulo, mail = @mail, permisos_reportes = @permisos
                    OUTPUT INSERTED.*
                    WHERE id = @id AND activo = 1
                `);

            if (result.recordset.length === 0) {
                return res.status(404).json({ error: 'Reporte no encontrado' });
            }

            console.log('✅ SQL Server - Reporte actualizado:', result.recordset[0]);
            res.json(result.recordset[0]);
        } else {
            const reporteIndex = reportes.findIndex(r => r.id === id && r.activo === 1);
            
            if (reporteIndex === -1) {
                return res.status(404).json({ error: 'Reporte no encontrado' });
            }

            if (titulo) reportes[reporteIndex].titulo = titulo.trim();
            if (mail) reportes[reporteIndex].mail = mail.trim().toLowerCase();
            if (permisos_reportes) reportes[reporteIndex].permisos_reportes = permisos_reportes;
            
            console.log('✅ Memoria - Reporte actualizado:', reportes[reporteIndex]);
            res.json(reportes[reporteIndex]);
        }

    } catch (error) {
        console.error('❌ Error en PUT /reportes/:id:', error.message);
        res.status(500).json({ error: 'Error actualizando reporte' });
    }
});

// DELETE /reportes/:id - Eliminar reporte (soft delete)
app.delete('/reportes/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        console.log(`🗑️ DELETE /reportes/${id}`);

        if (useSQLServer) {
            const result = await pool.request()
                .input('id', sql.Int, id)
                .query(`
                    UPDATE reportes 
                    SET activo = 0
                    OUTPUT INSERTED.*
                    WHERE id = @id AND activo = 1
                `);

            if (result.recordset.length === 0) {
                return res.status(404).json({ error: 'Reporte no encontrado' });
            }

            console.log('✅ SQL Server - Reporte eliminado:', result.recordset[0]);
            res.json({ message: 'Reporte eliminado', reporte: result.recordset[0] });
        } else {
            const reporteIndex = reportes.findIndex(r => r.id === id && r.activo === 1);
            
            if (reporteIndex === -1) {
                return res.status(404).json({ error: 'Reporte no encontrado' });
            }

            reportes[reporteIndex].activo = 0;
            reportes[reporteIndex].fecha_eliminacion = new Date().toISOString();
            
            console.log('✅ Memoria - Reporte eliminado:', reportes[reporteIndex]);
            res.json({ message: 'Reporte eliminado', reporte: reportes[reporteIndex] });
        }

    } catch (error) {
        console.error('❌ Error en DELETE /reportes/:id:', error.message);
        res.status(500).json({ error: 'Error eliminando reporte' });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        version: '1.1.0',
        database: useSQLServer ? 'SQL Server' : 'Memory',
        timestamp: new Date().toISOString(),
        sql_available: useSQLServer
    });
});

// Iniciar servidor
async function iniciar() {
    await conectarDB(); // Intenta conectar, pero no falla si no puede
    
    app.listen(PORT, () => {
        console.log(`\n🚀 Servidor iniciado en puerto ${PORT}`);
        console.log(`📍 Health: http://localhost:${PORT}/health`);
        console.log(`📊 API: http://localhost:${PORT}/reportes`);
        console.log(`💾 Modo: ${useSQLServer ? 'SQL Server' : 'Memoria'}`);
        console.log('\n✅ SERVIDOR LISTO\n');
    });
}

iniciar();
