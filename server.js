const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// Configuración de la base de datos usando variables de entorno
const dbConfig = {
    server: process.env.DB_SERVER || '192.168.30.36',
    database: process.env.DB_DATABASE || 'dbPowerbi',
    user: process.env.DB_USERNAME || 'sa',
    password: process.env.DB_PASSWORD || 'TJTQ',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        connectTimeout: 30000,
        requestTimeout: 30000
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

// Middleware
app.use(cors({
    origin: '*',
    credentials: true
}));
app.use(express.json());

// NO servir archivos estáticos - solo API
console.log('🚀 Configurando servidor API-only...');

// Conectar a la base de datos
let pool;
async function connectDB() {
    try {
        console.log('🔗 Conectando a SQL Server:', dbConfig.server);
        pool = await sql.connect(dbConfig);
        console.log('✅ Conectado a SQL Server exitosamente');
    } catch (err) {
        console.error('❌ Error conectando a la base de datos:', err);
        process.exit(1);
    }
}

// Middleware de autenticación
async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, error: 'Token requerido' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'powerbi-secret');
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ success: false, error: 'Token inválido' });
    }
}

// RUTAS DE LA API

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        message: 'Power BI Backend API funcionando',
        environment: process.env.NODE_ENV || 'development',
        server: process.env.DB_SERVER
    });
});

// Test de conexión a base de datos
app.get('/api/test-connection', async (req, res) => {
    try {
        const result = await pool.request().query('SELECT @@VERSION as version, GETDATE() as fecha');
        res.json({
            success: true,
            message: 'Conexión a BD exitosa',
            data: result.recordset[0]
        });
    } catch (error) {
        console.error('Error en test de conexión:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { mail, password } = req.body;
        
        if (!mail || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email y password requeridos' 
            });
        }

        // Buscar usuario en la base de datos
        const result = await pool.request()
            .input('mail', sql.VarChar, mail)
            .query('SELECT id, nombre, apellido, mail, password, admin, activo FROM usuarios WHERE mail = @mail AND activo = 1');

        if (result.recordset.length === 0) {
            return res.status(401).json({ 
                success: false, 
                message: 'Credenciales incorrectas' 
            });
        }

        const user = result.recordset[0];
        
        // Verificar password (comparación directa por ahora)
        if (password !== user.password) {
            return res.status(401).json({ 
                success: false, 
                message: 'Credenciales incorrectas' 
            });
        }

        // Generar token JWT
        const token = jwt.sign(
            { 
                id: user.id, 
                mail: user.mail,
                admin: user.admin 
            },
            process.env.JWT_SECRET || 'powerbi-secret',
            { expiresIn: '8h' }
        );

        // Respuesta exitosa
        res.json({
            success: true,
            token: token,
            user: {
                id: user.id,
                nombre: user.nombre,
                apellido: user.apellido,
                mail: user.mail,
                admin: user.admin,
                activo: user.activo
            }
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor' 
        });
    }
});

// Verificar token
app.get('/api/verify', authenticateToken, async (req, res) => {
    try {
        // Obtener datos actualizados del usuario
        const result = await pool.request()
            .input('id', sql.Int, req.user.id)
            .query('SELECT id, nombre, apellido, mail, admin, activo FROM usuarios WHERE id = @id AND activo = 1');

        if (result.recordset.length === 0) {
            return res.status(401).json({ 
                success: false, 
                message: 'Usuario no encontrado' 
            });
        }

        const user = result.recordset[0];
        
        res.json({
            success: true,
            user: {
                id: user.id,
                nombre: user.nombre,
                apellido: user.apellido,
                mail: user.mail,
                admin: user.admin,
                activo: user.activo
            }
        });

    } catch (error) {
        console.error('Error en verify:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor' 
        });
    }
});

// Obtener reportes del usuario
app.get('/api/reportes', authenticateToken, async (req, res) => {
    try {
        let query;
        let request = pool.request().input('userId', sql.Int, req.user.id);

        if (req.user.admin) {
            // Admin ve todos los reportes
            query = `
                SELECT id, titulo as nombre, descripcion, url, intervalo_refresh, activo
                FROM reportes 
                WHERE activo = 1 
                ORDER BY titulo
            `;
        } else {
            // Usuario normal ve solo reportes asignados
            query = `
                SELECT r.id, r.titulo as nombre, r.descripcion, r.url, r.intervalo_refresh, r.activo
                FROM reportes r
                INNER JOIN permisos_reportes pr ON r.id = pr.reporte_id
                WHERE pr.usuario_id = @userId AND r.activo = 1
                ORDER BY r.titulo
            `;
        }

        const result = await request.query(query);
        
        res.json({
            success: true,
            reportes: result.recordset
        });

    } catch (error) {
        console.error('Error obteniendo reportes:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error obteniendo reportes' 
        });
    }
});

// Ruta raíz - solo mensaje informativo
app.get('/', (req, res) => {
    res.json({
        message: 'Power BI Backend API',
        version: '1.0.0',
        endpoints: [
            'GET /api/health',
            'GET /api/test-connection', 
            'POST /api/login',
            'GET /api/verify',
            'GET /api/reportes'
        ]
    });
});

// Manejo de rutas no encontradas
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint no encontrado',
        availableEndpoints: [
            'GET /api/health',
            'POST /api/login',
            'GET /api/verify',
            'GET /api/reportes'
        ]
    });
});

// Manejo de errores
app.use((err, req, res, next) => {
    console.error('Error no manejado:', err);
    res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
    });
});

// Iniciar servidor
async function startServer() {
    await connectDB();
    
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Servidor API corriendo en puerto ${PORT}`);
        console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`🔗 Base de datos: ${process.env.DB_SERVER}/${process.env.DB_DATABASE}`);
        console.log(`✅ API disponible en: http://localhost:${PORT}/api/health`);
    });
}

startServer().catch(err => {
    console.error('💥 Error iniciando servidor:', err);
    process.exit(1);
});
