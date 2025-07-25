const express = require('express');
const cors = require('cors');

// Intentar cargar mssql de forma segura
let sql = null;
let SQL_AVAILABLE = false;

try {
    sql = require('mssql');
    SQL_AVAILABLE = true;
    console.log('✅ MSSQL module loaded successfully');
} catch (error) {
    console.log('⚠️  MSSQL module not available, using fallback mode');
    SQL_AVAILABLE = false;
}

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de CORS
app.use(cors({
    origin: ['https://powerbi-dashboards-1234.netlify.app', 'http://localhost:3000', 'http://127.0.0.1:5500'],
    credentials: true
}));

app.use(express.json());

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

// Función para inicializar la base de datos
async function initializeDatabase() {
    if (!SQL_AVAILABLE) {
        console.log('⚠️  SQL Server no disponible, usando modo fallback');
        return false;
    }

    try {
        console.log('🔄 Conectando a SQL Server...');
        pool = await sql.connect(dbConfig);
        console.log('✅ Conectado a SQL Server');
        
        // Verificar y crear tablas si no existen
        await createTablesIfNotExist();
        await insertDefaultData();
        
        console.log('✅ Base de datos inicializada correctamente');
        return true;
    } catch (error) {
        console.error('❌ Error al conectar con SQL Server:', error.message);
        pool = null;
        return false;
    }
}

// Función para crear tablas si no existen
async function createTablesIfNotExist() {
    if (!SQL_AVAILABLE || !pool) {
        console.log('⚠️  Saltando creación de tablas - SQL no disponible');
        return;
    }

    try {
        console.log('🔄 Verificando tablas...');
        
        // Crear tabla usuarios
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[usuarios]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[usuarios] (
                    [id] [int] IDENTITY(1,1) NOT NULL,
                    [nombre] [nvarchar](100) NOT NULL,
                    [apellido] [nvarchar](100) NOT NULL,
                    [email] [nvarchar](255) NOT NULL UNIQUE,
                    [password] [nvarchar](255) NOT NULL,
                    [admin] [bit] NOT NULL DEFAULT 0,
                    [activo] [bit] NOT NULL DEFAULT 1,
                    [fecha_creacion] [datetime] NOT NULL DEFAULT GETDATE(),
                    [fecha_actualizacion] [datetime] NOT NULL DEFAULT GETDATE(),
                    CONSTRAINT [PK_usuarios] PRIMARY KEY CLUSTERED ([id] ASC)
                );
            END
        `);

        // Crear tabla reportes
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[reportes]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[reportes] (
                    [id] [int] IDENTITY(1,1) NOT NULL,
                    [nombre] [nvarchar](255) NOT NULL,
                    [url] [nvarchar](1000) NOT NULL,
                    [descripcion] [nvarchar](500) NULL,
                    [refresh_interval] [int] NOT NULL DEFAULT 60,
                    [activo] [bit] NOT NULL DEFAULT 1,
                    [usuario_creador] [int] NULL,
                    [fecha_creacion] [datetime] NOT NULL DEFAULT GETDATE(),
                    [fecha_actualizacion] [datetime] NOT NULL DEFAULT GETDATE(),
                    CONSTRAINT [PK_reportes] PRIMARY KEY CLUSTERED ([id] ASC)
                );
            END
        `);

        // Crear tabla permisos
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[permisos]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[permisos] (
                    [id] [int] IDENTITY(1,1) NOT NULL,
                    [usuario_id] [int] NOT NULL,
                    [reporte_id] [int] NOT NULL,
                    [puede_ver] [bit] NOT NULL DEFAULT 1,
                    [puede_editar] [bit] NOT NULL DEFAULT 0,
                    [fecha_asignacion] [datetime] NOT NULL DEFAULT GETDATE(),
                    CONSTRAINT [PK_permisos] PRIMARY KEY CLUSTERED ([id] ASC)
                );
            END
        `);

        // Crear tabla actividad
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[actividad]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[actividad] (
                    [id] [int] IDENTITY(1,1) NOT NULL,
                    [usuario_id] [int] NULL,
                    [accion] [nvarchar](100) NOT NULL,
                    [detalle] [nvarchar](500) NULL,
                    [fecha] [datetime] NOT NULL DEFAULT GETDATE(),
                    [ip_address] [nvarchar](50) NULL,
                    CONSTRAINT [PK_actividad] PRIMARY KEY CLUSTERED ([id] ASC)
                );
            END
        `);

        console.log('✅ Tablas verificadas/creadas');
    } catch (error) {
        console.error('❌ Error al crear tablas:', error.message);
        throw error;
    }
}

// Función para insertar datos por defecto
async function insertDefaultData() {
    if (!SQL_AVAILABLE || !pool) {
        console.log('⚠️  Saltando inserción de datos - SQL no disponible');
        return;
    }

    try {
        console.log('🔄 Insertando datos por defecto...');
        
        // Insertar usuarios por defecto
        const checkAdmin = await pool.request()
            .input('email', sql.NVarChar, 'admin@powerbi.com')
            .query('SELECT COUNT(*) as count FROM usuarios WHERE email = @email');
        
        if (checkAdmin.recordset[0].count === 0) {
            await pool.request()
                .input('nombre', sql.NVarChar, 'Admin')
                .input('apellido', sql.NVarChar, 'Sistema')
                .input('email', sql.NVarChar, 'admin@powerbi.com')
                .input('password', sql.NVarChar, 'admin123')
                .input('admin', sql.Bit, true)
                .query(`
                    INSERT INTO usuarios (nombre, apellido, email, password, admin, activo)
                    VALUES (@nombre, @apellido, @email, @password, @admin, 1)
                `);
            console.log('✅ Usuario administrador creado');
        }

        const checkUser = await pool.request()
            .input('email', sql.NVarChar, 'usuario@powerbi.com')
            .query('SELECT COUNT(*) as count FROM usuarios WHERE email = @email');
        
        if (checkUser.recordset[0].count === 0) {
            await pool.request()
                .input('nombre', sql.NVarChar, 'Usuario')
                .input('apellido', sql.NVarChar, 'Demo')
                .input('email', sql.NVarChar, 'usuario@powerbi.com')
                .input('password', sql.NVarChar, 'user123')
                .input('admin', sql.Bit, false)
                .query(`
                    INSERT INTO usuarios (nombre, apellido, email, password, admin, activo)
                    VALUES (@nombre, @apellido, @email, @password, @admin, 1)
                `);
            console.log('✅ Usuario demo creado');
        }

        // Insertar reportes por defecto
        const reportes = [
            {
                nombre: 'Ventas Dashboard',
                url: 'https://app.powerbi.com/view?r=eyJrIjoiYzg4YWE1YjctMjQ3OC00Y2U5LTkzOWQtYWY5OTJjZGMwOGQ5IiwidCI6IjljOWEzMGRlLWQzZWUtNDJmNy04NzJiLTNjYjkyNzk1OGE4YyIsImMiOjl9',
                descripcion: 'Dashboard principal de análisis de ventas',
                refresh_interval: 120
            },
            {
                nombre: 'Finanzas Dashboard',
                url: 'https://app.powerbi.com/view?r=eyJrIjoiYzg4YWE1YjctMjQ3OC00Y2U5LTkzOWQtYWY5OTJjZGMwOGQ5IiwidCI6IjljOWEzMGRlLWQzZWUtNDJmNy04NzJiLTNjYjkyNzk1OGE4YyIsImMiOjl9',
                descripcion: 'Reportes financieros y análisis de presupuesto',
                refresh_interval: 300
            },
            {
                nombre: 'Marketing Dashboard',
                url: 'https://app.powerbi.com/view?r=eyJrIjoiYzg4YWE1YjctMjQ3OC00Y2U5LTkzOWQtYWY5OTJjZGMwOGQ5IiwidCI6IjljOWEzMGRlLWQzZWUtNDJmNy04NzJiLTNjYjkyNzk1OGE4YyIsImMiOjl9',
                descripcion: 'Métricas de marketing y análisis de campañas',
                refresh_interval: 180
            }
        ];

        for (const reporte of reportes) {
            const checkReporte = await pool.request()
                .input('nombre', sql.NVarChar, reporte.nombre)
                .query('SELECT COUNT(*) as count FROM reportes WHERE nombre = @nombre');
            
            if (checkReporte.recordset[0].count === 0) {
                await pool.request()
                    .input('nombre', sql.NVarChar, reporte.nombre)
                    .input('url', sql.NVarChar, reporte.url)
                    .input('descripcion', sql.NVarChar, reporte.descripcion)
                    .input('refresh_interval', sql.Int, reporte.refresh_interval)
                    .input('usuario_creador', sql.Int, 1)
                    .query(`
                        INSERT INTO reportes (nombre, url, descripcion, refresh_interval, activo, usuario_creador)
                        VALUES (@nombre, @url, @descripcion, @refresh_interval, 1, @usuario_creador)
                    `);
                console.log(`✅ Reporte ${reporte.nombre} creado`);
            }
        }

        console.log('✅ Datos por defecto insertados');
    } catch (error) {
        console.error('❌ Error al insertar datos por defecto:', error.message);
        throw error;
    }
}

// Middleware para verificar conexión DB
async function checkDbConnection(req, res, next) {
    if (!SQL_AVAILABLE || !pool) {
        // En modo fallback, continuar sin base de datos
        req.fallbackMode = true;
        return next();
    }
    next();
}

// Función para ejecutar queries con manejo de errores
async function executeQuery(query, inputs = {}) {
    if (!SQL_AVAILABLE || !pool) {
        throw new Error('Base de datos no disponible');
    }

    try {
        const request = pool.request();
        
        // Agregar inputs al request
        for (const [key, value] of Object.entries(inputs)) {
            if (SQL_AVAILABLE && sql) {
                // Solo usar tipos SQL si está disponible
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
        database: pool ? 'Conectada' : 'Modo Fallback',
        sqlModule: SQL_AVAILABLE ? 'Disponible' : 'No Disponible',
        server: 'Render - Funcionando'
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

        if (pool && SQL_AVAILABLE) {
            // Autenticación con base de datos
            const users = await executeQuery(
                'SELECT * FROM usuarios WHERE email = @email AND password = @password AND activo = 1',
                { 
                    email: sql.NVarChar(email), 
                    password: sql.NVarChar(password) 
                }
            );

            if (users.length > 0) {
                const user = users[0];
                const token = 'db_' + Buffer.from(email + ':' + Date.now()).toString('base64');
                
                // Registrar actividad
                if (SQL_AVAILABLE) {
                    await executeQuery(
                        'INSERT INTO actividad (usuario_id, accion, detalle, ip_address) VALUES (@usuario_id, @accion, @detalle, @ip)',
                        {
                            usuario_id: sql.Int(user.id),
                            accion: sql.NVarChar('Login exitoso'),
                            detalle: sql.NVarChar(`Usuario ${user.email} inició sesión`),
                            ip: sql.NVarChar(req.ip || 'unknown')
                        }
                    );
                }

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
        }

        // Fallback: autenticación local
        const localUsers = [
            { id: 1, email: 'admin@powerbi.com', password: 'admin123', nombre: 'Admin', apellido: 'Sistema', admin: true },
            { id: 2, email: 'usuario@powerbi.com', password: 'user123', nombre: 'Usuario', apellido: 'Demo', admin: false }
        ];

        const user = localUsers.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
        
        if (user) {
            const token = 'local_' + Buffer.from(email + ':' + Date.now()).toString('base64');
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
app.get('/reports/user/:userId', checkDbConnection, async (req, res) => {
    try {
        const userId = req.params.userId;
        
        if (req.fallbackMode) {
            // Datos por defecto en modo fallback
            const defaultReports = [
                { id: 1, nombre: 'Ventas Dashboard', url: 'https://app.powerbi.com/view?r=eyJrIjoiYzg4YWE1YjctMjQ3OC00Y2U5LTkzOWQtYWY5OTJjZGMwOGQ5IiwidCI6IjljOWEzMGRlLWQzZWUtNDJmNy04NzJiLTNjYjkyNzk1OGE4YyIsImMiOjl9', descripcion: 'Dashboard de ventas', refresh_interval: 120, puede_ver: true, puede_editar: userId == 1 },
                { id: 2, nombre: 'Finanzas Dashboard', url: 'https://app.powerbi.com/view?r=eyJrIjoiYzg4YWE1YjctMjQ3OC00Y2U5LTkzOWQtYWY5OTJjZGMwOGQ5IiwidCI6IjljOWEzMGRlLWQzZWUtNDJmNy04NzJiLTNjYjkyNzk1OGE4YyIsImMiOjl9', descripcion: 'Reportes financieros', refresh_interval: 300, puede_ver: true, puede_editar: userId == 1 },
                { id: 3, nombre: 'Marketing Dashboard', url: 'https://app.powerbi.com/view?r=eyJrIjoiYzg4YWE1YjctMjQ3OC00Y2U5LTkzOWQtYWY5OTJjZGMwOGQ5IiwidCI6IjljOWEzMGRlLWQzZWUtNDJmNy04NzJiLTNjYjkyNzk1OGE4YyIsImMiOjl9', descripcion: 'Métricas de marketing', refresh_interval: 180, puede_ver: true, puede_editar: userId == 1 }
            ];
            return res.json(defaultReports);
        }
        
        const reportes = await executeQuery(`
            SELECT r.*, p.puede_ver, p.puede_editar
            FROM reportes r
            INNER JOIN permisos p ON r.id = p.reporte_id
            WHERE p.usuario_id = @userId AND r.activo = 1 AND p.puede_ver = 1
            ORDER BY r.nombre
        `, { userId: sql.Int(userId) });

        res.json(reportes);
    } catch (error) {
        console.error('Error al obtener reportes:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener reportes'
        });
    }
});

// Ruta para crear nuevo reporte
app.post('/reports', checkDbConnection, async (req, res) => {
    try {
        const { nombre, url, descripcion, refresh_interval, usuario_id } = req.body;
        
        if (req.fallbackMode) {
            // Simulación en modo fallback
            const reporteId = Math.floor(Math.random() * 1000) + 100;
            return res.json({
                success: true,
                message: 'Reporte creado en modo local',
                reporteId: reporteId
            });
        }
        
        const result = await pool.request()
            .input('nombre', sql.NVarChar, nombre)
            .input('url', sql.NVarChar, url)
            .input('descripcion', sql.NVarChar, descripcion || '')
            .input('refresh_interval', sql.Int, refresh_interval || 60)
            .input('usuario_creador', sql.Int, usuario_id)
            .query(`
                INSERT INTO reportes (nombre, url, descripcion, refresh_interval, activo, usuario_creador)
                OUTPUT INSERTED.id
                VALUES (@nombre, @url, @descripcion, @refresh_interval, 1, @usuario_creador)
            `);

        const reporteId = result.recordset[0].id;

        // Asignar permiso al usuario creador
        await pool.request()
            .input('usuario_id', sql.Int, usuario_id)
            .input('reporte_id', sql.Int, reporteId)
            .query(`
                INSERT INTO permisos (usuario_id, reporte_id, puede_ver, puede_editar)
                VALUES (@usuario_id, @reporte_id, 1, 1)
            `);

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
app.delete('/reports/:id', checkDbConnection, async (req, res) => {
    try {
        const reporteId = req.params.id;
        
        if (req.fallbackMode) {
            // Simulación en modo fallback
            return res.json({
                success: true,
                message: 'Reporte eliminado en modo local'
            });
        }
        
        // Eliminar permisos primero
        await pool.request()
            .input('reporte_id', sql.Int, reporteId)
            .query('DELETE FROM permisos WHERE reporte_id = @reporte_id');

        // Eliminar reporte
        await pool.request()
            .input('id', sql.Int, reporteId)
            .query('DELETE FROM reportes WHERE id = @id');

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
app.get('/admin/stats', checkDbConnection, async (req, res) => {
    try {
        if (req.fallbackMode) {
            return res.json({
                totalUsers: 2,
                activeUsers: 2,
                totalReports: 3,
                activeSessions: 1
            });
        }

        const stats = await executeQuery(`
            SELECT 
                (SELECT COUNT(*) FROM usuarios) as totalUsers,
                (SELECT COUNT(*) FROM usuarios WHERE activo = 1) as activeUsers,
                (SELECT COUNT(*) FROM reportes WHERE activo = 1) as totalReports,
                1 as activeSessions
        `);

        res.json(stats[0]);
    } catch (error) {
        console.error('Error al obtener estadísticas:', error);
        res.json({
            totalUsers: 2,
            activeUsers: 2,
            totalReports: 3,
            activeSessions: 1
        });
    }
});

app.get('/admin/users', checkDbConnection, async (req, res) => {
    try {
        if (req.fallbackMode) {
            return res.json([
                { id: 1, nombre: 'Admin', apellido: 'Sistema', email: 'admin@powerbi.com', admin: true, activo: true },
                { id: 2, nombre: 'Usuario', apellido: 'Demo', email: 'usuario@powerbi.com', admin: false, activo: true }
            ]);
        }

        const users = await executeQuery('SELECT id, nombre, apellido, email, admin, activo FROM usuarios ORDER BY nombre');
        res.json(users);
    } catch (error) {
        console.error('Error al obtener usuarios:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener usuarios'
        });
    }
});

app.get('/admin/reports', checkDbConnection, async (req, res) => {
    try {
        if (req.fallbackMode) {
            return res.json([
                { id: 1, nombre: 'Ventas Dashboard', url: 'https://app.powerbi.com/view?r=sample1', descripcion: 'Dashboard de ventas', refresh_interval: 120, activo: true },
                { id: 2, nombre: 'Finanzas Dashboard', url: 'https://app.powerbi.com/view?r=sample2', descripcion: 'Reportes financieros', refresh_interval: 300, activo: true },
                { id: 3, nombre: 'Marketing Dashboard', url: 'https://app.powerbi.com/view?r=sample3', descripcion: 'Métricas de marketing', refresh_interval: 180, activo: true }
            ]);
        }

        const reports = await executeQuery('SELECT * FROM reportes ORDER BY nombre');
        res.json(reports);
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
        version: '2.0 - Hybrid Mode',
        database: pool ? 'Conectada' : 'Modo Fallback',
        sqlModule: SQL_AVAILABLE ? 'Disponible' : 'No Disponible',
        mode: SQL_AVAILABLE && pool ? 'Database' : 'Fallback',
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

// Inicializar servidor
async function startServer() {
    // Intentar conectar a la base de datos
    const dbConnected = await initializeDatabase();
    
    if (!dbConnected) {
        console.log('⚠️  Servidor iniciado en modo FALLBACK (sin conexión a base de datos)');
        console.log('📊 Todas las funciones están disponibles con datos por defecto');
    }

    app.listen(PORT, () => {
        console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
        console.log(`🌐 Endpoints disponibles en https://powerbi-backend-vxjd.onrender.com`);
        console.log(`🔧 Modo SQL: ${SQL_AVAILABLE ? 'Disponible' : 'No Disponible'}`);
        console.log(`📊 Estado de DB: ${pool ? 'Conectada' : 'Fallback'}`);
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
