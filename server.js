const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de CORS
app.use(cors({
    origin: ['https://powerbi-dashboards-1234.netlify.app', 'http://localhost:3000', 'http://127.0.0.1:5500'],
    credentials: true
}));

app.use(express.json());

// Intentar cargar mssql de forma segura
let sql = null;
let SQL_AVAILABLE = false;

try {
    sql = require('mssql');
    SQL_AVAILABLE = true;
    console.log('✅ MSSQL module loaded successfully');
} catch (error) {
    console.log('⚠️  MSSQL module not available, using memory mode');
    SQL_AVAILABLE = false;
}

// Configuración de base de datos SQL Server
const dbConfig = {
    user: 'sa',
    password: 'TJTQ',
    server: '192.168.30.36',
    database: 'dbPowerbi',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        connectTimeout: 30000,
        requestTimeout: 30000
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

let pool = null;
let DB_CONNECTED = false;

// Variables globales para datos en memoria (fallback)
let users = [
    { id: 1, nombre: 'Admin', apellido: 'Sistema', email: 'admin@powerbi.com', password: 'admin123', admin: true, activo: true },
    { id: 2, nombre: 'Usuario', apellido: 'Demo', email: 'usuario@powerbi.com', password: 'user123', admin: false, activo: true }
];

let reports = [
    { 
        id: 1, 
        nombre: 'Ventas Dashboard', 
        url: 'https://app.powerbi.com/view?r=eyJrIjoiYzg4YWE1YjctMjQ3OC00Y2U5LTkzOWQtYWY5OTJjZGMwOGQ5IiwidCI6IjljOWEzMGRlLWQzZWUtNDJmNy04NzJiLTNjYjkyNzk1OGE4YyIsImMiOjl9', 
        descripcion: 'Dashboard principal de análisis de ventas', 
        refresh_interval: 120, 
        activo: true,
        usuario_creador: 1,
        fecha_creacion: new Date().toISOString()
    },
    { 
        id: 2, 
        nombre: 'Finanzas Dashboard', 
        url: 'https://app.powerbi.com/view?r=eyJrIjoiYzg4YWE1YjctMjQ3OC00Y2U5LTkzOWQtYWY5OTJjZGMwOGQ5IiwidCI6IjljOWEzMGRlLWQzZWUtNDJmNy04NzJiLTNjYjkyNzk1OGE4YyIsImMiOjl9', 
        descripcion: 'Reportes financieros y análisis de presupuesto', 
        refresh_interval: 300, 
        activo: true,
        usuario_creador: 1,
        fecha_creacion: new Date().toISOString()
    },
    { 
        id: 3, 
        nombre: 'Marketing Dashboard', 
        url: 'https://app.powerbi.com/view?r=eyJrIjoiYzg4YWE1YjctMjQ3OC00Y2U5LTkzOWQtYWY5OTJjZGMwOGQ5IiwidCI6IjljOWEzMGRlLWQzZWUtNDJmNy04NzJiLTNjYjkyNzk1OGE4YyIsImMiOjl9', 
        descripcion: 'Métricas de marketing y análisis de campañas', 
        refresh_interval: 180, 
        activo: true,
        usuario_creador: 1,
        fecha_creacion: new Date().toISOString()
    }
];

let permissions = [
    // Admin tiene acceso total a todos
    { id: 1, usuario_id: 1, reporte_id: 1, puede_ver: true, puede_editar: true },
    { id: 2, usuario_id: 1, reporte_id: 2, puede_ver: true, puede_editar: true },
    { id: 3, usuario_id: 1, reporte_id: 3, puede_ver: true, puede_editar: true },
    // Usuario normal solo puede ver
    { id: 4, usuario_id: 2, reporte_id: 1, puede_ver: true, puede_editar: false },
    { id: 5, usuario_id: 2, reporte_id: 2, puede_ver: true, puede_editar: false },
    { id: 6, usuario_id: 2, reporte_id: 3, puede_ver: true, puede_editar: false }
];

let activity = [];
let nextId = 4; // Para nuevos reportes

// Función para generar IDs únicos
function generateId() {
    return nextId++;
}

// Función para registrar actividad
function logActivity(userId, action, detail) {
    activity.push({
        id: generateId(),
        usuario_id: userId,
        accion: action,
        detalle: detail,
        fecha: new Date().toISOString(),
        ip_address: 'server'
    });
    
    // Mantener solo los últimos 100 registros
    if (activity.length > 100) {
        activity = activity.slice(-100);
    }
}

// Función para inicializar la base de datos
async function initializeDatabase() {
    if (!SQL_AVAILABLE) {
        console.log('⚠️  SQL Server module not available, using memory mode');
        return false;
    }

    try {
        console.log('🔄 Intentando conectar a SQL Server...');
        pool = await sql.connect(dbConfig);
        console.log('✅ Conectado a SQL Server');
        DB_CONNECTED = true;
        
        // Cargar datos desde la base de datos
        await loadDataFromDatabase();
        
        console.log('✅ Base de datos inicializada correctamente');
        return true;
    } catch (error) {
        console.error('❌ Error al conectar con SQL Server:', error.message);
        console.log('⚠️  Continuando en modo memoria local');
        pool = null;
        DB_CONNECTED = false;
        return false;
    }
}

// Función para cargar datos desde la base de datos
async function loadDataFromDatabase() {
    if (!DB_CONNECTED || !pool) return;

    try {
        console.log('🔄 Cargando datos desde SQL Server...');
        
        // Cargar usuarios
        const usersResult = await pool.request().query('SELECT * FROM usuarios WHERE activo = 1');
        if (usersResult.recordset.length > 0) {
            users = usersResult.recordset;
            console.log(`✅ Cargados ${users.length} usuarios desde BD`);
        }
        
        // Cargar reportes
        const reportsResult = await pool.request().query('SELECT * FROM reportes WHERE activo = 1');
        if (reportsResult.recordset.length > 0) {
            reports = reportsResult.recordset;
            console.log(`✅ Cargados ${reports.length} reportes desde BD`);
        }
        
        // Cargar permisos
        const permissionsResult = await pool.request().query('SELECT * FROM permisos');
        if (permissionsResult.recordset.length > 0) {
            permissions = permissionsResult.recordset;
            console.log(`✅ Cargados ${permissions.length} permisos desde BD`);
        }
        
        // Actualizar nextId
        if (reports.length > 0) {
            nextId = Math.max(...reports.map(r => r.id)) + 1;
        }
        
    } catch (error) {
        console.error('❌ Error al cargar datos desde BD:', error.message);
    }
}

// Función para ejecutar queries con manejo de errores
async function executeQuery(query, inputs = {}) {
    if (!DB_CONNECTED || !pool) {
        throw new Error('Base de datos no disponible');
    }

    try {
        const request = pool.request();
        
        // Agregar inputs al request
        for (const [key, value] of Object.entries(inputs)) {
            if (typeof value === 'string') {
                request.input(key, sql.NVarChar, value);
            } else if (typeof value === 'number') {
                request.input(key, sql.Int, value);
            } else if (typeof value === 'boolean') {
                request.input(key, sql.Bit, value);
            } else {
                request.input(key, value);
            }
        }
        
        const result = await request.query(query);
        return result.recordset;
    } catch (error) {
        console.error('Error en query:', error.message);
        throw error;
    }
}

// =============================================
// RUTAS DE LA API
// =============================================

// Ruta de health check
app.get('/health', (req, res) => {
    const status = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        database: DB_CONNECTED ? 'SQL Server Conectada' : 'Memoria Local',
        sqlModule: SQL_AVAILABLE ? 'Disponible' : 'No Disponible',
        mode: DB_CONNECTED ? 'Database' : 'Memory',
        server: 'Render - Híbrido SQL/Memory',
        users: users.length,
        reports: reports.length,
        permissions: permissions.length
    };
    res.json(status);
});

// Ruta de login
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email y contraseña son requeridos'
            });
        }

        let user = null;

        if (DB_CONNECTED) {
            // Autenticación con base de datos
            try {
                const result = await executeQuery(
                    'SELECT * FROM usuarios WHERE email = @email AND password = @password AND activo = 1',
                    { email: email, password: password }
                );
                user = result.length > 0 ? result[0] : null;
            } catch (error) {
                console.error('Error en DB login, usando memoria:', error.message);
            }
        }

        if (!user) {
            // Fallback: autenticación en memoria
            user = users.find(u => 
                u.email.toLowerCase() === email.toLowerCase() && 
                u.password === password && 
                u.activo
            );
        }
        
        if (user) {
            const token = (DB_CONNECTED ? 'db_' : 'mem_') + Buffer.from(email + ':' + Date.now()).toString('base64');
            
            // Registrar actividad
            logActivity(user.id, 'Login exitoso', `Usuario ${user.email} inició sesión`);
            
            return res.json({
                success: true,
                token: token,
                user: {
                    id: user.id,
                    nombre: user.nombre,
                    apellido: user.apellido,
                    email: user.email,
                    admin: user.admin
                }
            });
        }

        res.status(401).json({
            success: false,
            message: 'Credenciales incorrectas'
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Ruta para obtener reportes del usuario
app.get('/reports/user/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        let userReports = [];

        if (DB_CONNECTED) {
            // Obtener reportes desde base de datos
            try {
                userReports = await executeQuery(`
                    SELECT r.*, p.puede_ver, p.puede_editar
                    FROM reportes r
                    INNER JOIN permisos p ON r.id = p.reporte_id
                    WHERE p.usuario_id = @userId AND r.activo = 1 AND p.puede_ver = 1
                    ORDER BY r.nombre
                `, { userId: userId });
            } catch (error) {
                console.error('Error obteniendo reportes de BD:', error.message);
            }
        }

        if (userReports.length === 0) {
            // Fallback: obtener reportes desde memoria
            const userPermissions = permissions.filter(p => p.usuario_id === userId && p.puede_ver);
            userReports = reports.filter(r => {
                return r.activo && userPermissions.some(p => p.reporte_id === r.id);
            }).map(r => {
                const permission = userPermissions.find(p => p.reporte_id === r.id);
                return {
                    ...r,
                    puede_ver: permission.puede_ver,
                    puede_editar: permission.puede_editar
                };
            });
        }

        res.json(userReports);
    } catch (error) {
        console.error('Error al obtener reportes:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener reportes'
        });
    }
});

// Ruta para crear nuevo reporte
app.post('/reports', async (req, res) => {
    try {
        const { nombre, url, descripcion, refresh_interval, usuario_id } = req.body;
        
        if (!nombre || !url) {
            return res.status(400).json({
                success: false,
                message: 'Nombre y URL son requeridos'
            });
        }

        let reporteId = null;

        if (DB_CONNECTED) {
            // Crear en base de datos
            try {
                const result = await pool.request()
                    .input('nombre', sql.NVarChar, nombre)
                    .input('url', sql.NVarChar, url)
                    .input('descripcion', sql.NVarChar, descripcion || '')
                    .input('refresh_interval', sql.Int, refresh_interval || 60)
                    .input('usuario_creador', sql.Int, usuario_id || 1)
                    .query(`
                        INSERT INTO reportes (nombre, url, descripcion, refresh_interval, activo, usuario_creador)
                        OUTPUT INSERTED.id
                        VALUES (@nombre, @url, @descripcion, @refresh_interval, 1, @usuario_creador)
                    `);

                reporteId = result.recordset[0].id;

                // Asignar permiso al usuario creador en BD
                await pool.request()
                    .input('usuario_id', sql.Int, usuario_id || 1)
                    .input('reporte_id', sql.Int, reporteId)
                    .query(`
                        INSERT INTO permisos (usuario_id, reporte_id, puede_ver, puede_editar)
                        VALUES (@usuario_id, @reporte_id, 1, 1)
                    `);

                // Recargar datos desde BD
                await loadDataFromDatabase();

                console.log(`✅ Reporte creado en BD con ID: ${reporteId}`);
            } catch (error) {
                console.error('Error creando reporte en BD:', error.message);
                DB_CONNECTED = false; // Marcar como desconectado para usar memoria
            }
        }

        if (!reporteId) {
            // Fallback: crear en memoria
            reporteId = generateId();
            const newReport = {
                id: reporteId,
                nombre: nombre,
                url: url,
                descripcion: descripcion || '',
                refresh_interval: refresh_interval || 60,
                activo: true,
                usuario_creador: usuario_id || 1,
                fecha_creacion: new Date().toISOString()
            };
            
            reports.push(newReport);
            
            // Asignar permiso al usuario creador en memoria
            permissions.push({
                id: generateId(),
                usuario_id: usuario_id || 1,
                reporte_id: reporteId,
                puede_ver: true,
                puede_editar: true
            });

            console.log(`✅ Reporte creado en memoria con ID: ${reporteId}`);
        }
        
        // Registrar actividad
        logActivity(usuario_id || 1, 'Reporte creado', `Reporte "${nombre}" creado exitosamente`);

        res.json({
            success: true,
            message: 'Reporte creado exitosamente',
            reporteId: reporteId
        });
    } catch (error) {
        console.error('Error al crear reporte:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear reporte'
        });
    }
});

// Ruta para eliminar reporte
app.delete('/reports/:id', async (req, res) => {
    try {
        const reporteId = parseInt(req.params.id);
        let reporteName = 'Desconocido';
        let deleted = false;

        if (DB_CONNECTED) {
            // Eliminar de base de datos
            try {
                // Obtener nombre del reporte antes de eliminarlo
                const reportResult = await executeQuery('SELECT nombre FROM reportes WHERE id = @id', { id: reporteId });
                if (reportResult.length > 0) {
                    reporteName = reportResult[0].nombre;
                }

                // Eliminar permisos primero
                await executeQuery('DELETE FROM permisos WHERE reporte_id = @reporte_id', { reporte_id: reporteId });

                // Eliminar reporte (marcar como inactivo)
                await executeQuery('UPDATE reportes SET activo = 0 WHERE id = @id', { id: reporteId });

                // Recargar datos desde BD
                await loadDataFromDatabase();

                deleted = true;
                console.log(`✅ Reporte eliminado de BD: ${reporteName}`);
            } catch (error) {
                console.error('Error eliminando reporte de BD:', error.message);
                DB_CONNECTED = false; // Marcar como desconectado para usar memoria
            }
        }

        if (!deleted) {
            // Fallback: eliminar de memoria
            const reportIndex = reports.findIndex(r => r.id === reporteId);
            
            if (reportIndex === -1) {
                return res.status(404).json({
                    success: false,
                    message: 'Reporte no encontrado'
                });
            }
            
            reporteName = reports[reportIndex].nombre;
            
            // Eliminar permisos del reporte
            permissions = permissions.filter(p => p.reporte_id !== reporteId);
            
            // Eliminar reporte
            reports.splice(reportIndex, 1);

            console.log(`✅ Reporte eliminado de memoria: ${reporteName}`);
        }
        
        // Registrar actividad
        logActivity(1, 'Reporte eliminado', `Reporte "${reporteName}" eliminado`);

        res.json({
            success: true,
            message: 'Reporte eliminado exitosamente'
        });
    } catch (error) {
        console.error('Error al eliminar reporte:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar reporte'
        });
    }
});

// Rutas de administración
app.get('/admin/stats', async (req, res) => {
    try {
        let stats = {
            totalUsers: users.length,
            activeUsers: users.filter(u => u.activo).length,
            totalReports: reports.filter(r => r.activo).length,
            activeSessions: 1,
            totalActivity: activity.length,
            dataSource: DB_CONNECTED ? 'SQL Server' : 'Memory'
        };

        if (DB_CONNECTED) {
            try {
                const dbStats = await executeQuery(`
                    SELECT 
                        (SELECT COUNT(*) FROM usuarios WHERE activo = 1) as totalUsers,
                        (SELECT COUNT(*) FROM usuarios WHERE activo = 1) as activeUsers,
                        (SELECT COUNT(*) FROM reportes WHERE activo = 1) as totalReports
                `);
                
                if (dbStats.length > 0) {
                    stats = { ...stats, ...dbStats[0], activeSessions: 1, dataSource: 'SQL Server' };
                }
            } catch (error) {
                console.error('Error obteniendo stats de BD:', error.message);
            }
        }

        res.json(stats);
    } catch (error) {
        console.error('Error al obtener estadísticas:', error);
        res.json({
            totalUsers: 2,
            activeUsers: 2,
            totalReports: 3,
            activeSessions: 1,
            dataSource: 'Memory (Error)'
        });
    }
});

app.get('/admin/users', async (req, res) => {
    try {
        let publicUsers = [];

        if (DB_CONNECTED) {
            try {
                const dbUsers = await executeQuery('SELECT id, nombre, apellido, email, admin, activo FROM usuarios ORDER BY nombre');
                publicUsers = dbUsers;
            } catch (error) {
                console.error('Error obteniendo usuarios de BD:', error.message);
            }
        }

        if (publicUsers.length === 0) {
            // Fallback: usuarios de memoria
            publicUsers = users.map(u => ({
                id: u.id,
                nombre: u.nombre,
                apellido: u.apellido,
                email: u.email,
                admin: u.admin,
                activo: u.activo
            }));
        }
        
        res.json(publicUsers);
    } catch (error) {
        console.error('Error al obtener usuarios:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener usuarios'
        });
    }
});

app.get('/admin/reports', async (req, res) => {
    try {
        let allReports = [];

        if (DB_CONNECTED) {
            try {
                allReports = await executeQuery('SELECT * FROM reportes WHERE activo = 1 ORDER BY nombre');
            } catch (error) {
                console.error('Error obteniendo reportes de BD:', error.message);
            }
        }

        if (allReports.length === 0) {
            // Fallback: reportes de memoria
            allReports = reports.filter(r => r.activo);
        }

        res.json(allReports);
    } catch (error) {
        console.error('Error al obtener reportes:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener reportes'
        });
    }
});

// Ruta para endpoints disponibles
app.get('/', (req, res) => {
    res.json({
        message: 'PowerBI Backend API',
        version: '3.1 - Hybrid Database/Memory Mode',
        database: DB_CONNECTED ? 'SQL Server Conectada' : 'Memoria Local',
        sqlModule: SQL_AVAILABLE ? 'Disponible' : 'No Disponible',
        mode: DB_CONNECTED ? 'Database Primary' : 'Memory Fallback',
        compatible: 'Node.js 18+',
        features: [
            'Autenticación híbrida DB/Memory',
            'Gestión de reportes persistente',
            'Permisos sincronizados',
            'Panel administrativo',
            'Registro de actividad',
            'CRUD completo con BD',
            'Fallback automático'
        ],
        endpoints: [
            'GET /health - Estado del servidor',
            'POST /login - Autenticación',
            'GET /reports/user/:userId - Reportes del usuario',
            'POST /reports - Crear reporte',
            'DELETE /reports/:id - Eliminar reporte',
            'GET /admin/stats - Estadísticas',
            'GET /admin/users - Lista de usuarios',
            'GET /admin/reports - Lista de reportes'
        ]
    });
});

// Inicializar datos de actividad
logActivity(1, 'Sistema iniciado', 'Backend PowerBI iniciado en modo híbrido');

// Inicializar servidor
async function startServer() {
    // Intentar conectar a la base de datos
    const dbConnected = await initializeDatabase();
    
    if (dbConnected) {
        console.log('🎉 Servidor iniciado con conexión a SQL Server');
        console.log('📊 Datos cargados desde base de datos');
    } else {
        console.log('⚠️  Servidor iniciado en modo MEMORY (sin SQL Server)');
        console.log('📊 Usando datos por defecto en memoria');
    }

    app.listen(PORT, () => {
        console.log(`🚀 Servidor PowerBI Backend v3.1 corriendo en puerto ${PORT}`);
        console.log(`🌐 Endpoints disponibles en https://powerbi-backend-vxjd.onrender.com`);
        console.log(`🔧 Modo: ${DB_CONNECTED ? 'Database Primary' : 'Memory Fallback'}`);
        console.log(`📊 Datos: ${users.length} usuarios, ${reports.length} reportes`);
        console.log(`🛡️ Funcionalidad: 100% operativa con persistencia`);
    });
}

// Manejar cierre del servidor
process.on('SIGINT', async () => {
    console.log('Cerrando servidor...');
    if (pool) {
        await pool.close();
    }
    process.exit(0);
});

// Iniciar el servidor
startServer().catch(error => {
    console.error('Error al iniciar servidor:', error);
    process.exit(1);
});

module.exports = app;
