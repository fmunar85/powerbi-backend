const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de la base de datos
const dbConfig = {
    server: '192.168.30.36',
    database: 'dbPowerbi',
    user: 'sa', // Cambiar por usuario apropiado
    password: 'TJTQ', // Cambiar por password real
    options: {
        encrypt: false, // Para SQL Server local
        trustServerCertificate: true
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

// Middleware
app.use(cors({
    origin: ['https://powerbi-dashboards-1234.netlify.app', 'http://localhost:3000'],
    credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../')));

// Conectar a la base de datos
let pool;
async function connectDB() {
    try {
        pool = await sql.connect(dbConfig);
        console.log('✅ Conectado a SQL Server');
    } catch (err) {
        console.error('❌ Error conectando a la base de datos:', err);
    }
}

// Middleware de autenticación
async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token requerido' });
    }

    try {
        // Verificar JWT token
        const decoded = jwt.verify(token, 'secret_key_powerbi_2025');
        
        if (!pool) {
            return res.status(500).json({ error: 'Error de conexión con la base de datos' });
        }
        
        // Verificar que el usuario sigue activo en la base de datos
        const request = pool.request();
        request.input('id', sql.Int, decoded.id);
        
        const result = await request.query(`
            SELECT id, nombre, apellido, mail, admin 
            FROM usuarios 
            WHERE id = @id AND activo = 1
        `);
        
        if (result.recordset.length === 0) {
            return res.status(403).json({ error: 'Usuario no encontrado o inactivo' });
        }

        req.user = {
            usuario_id: result.recordset[0].id,
            nombre: result.recordset[0].nombre,
            apellido: result.recordset[0].apellido,
            mail: result.recordset[0].mail,
            admin: result.recordset[0].admin
        };
        next();
    } catch (err) {
        console.error('Error validando token:', err);
        if (err.name === 'JsonWebTokenError') {
            return res.status(403).json({ error: 'Token inválido' });
        }
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

// Middleware para administradores
function requireAdmin(req, res, next) {
    if (!req.user.admin) {
        return res.status(403).json({ error: 'Acceso denegado. Se requieren privilegios de administrador' });
    }
    next();
}

// ==================== RUTAS DE AUTENTICACIÓN ====================

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: pool ? 'conectada' : 'desconectada'
    });
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { mail, password } = req.body;

        if (!mail || !password) {
            return res.status(400).json({ 
                success: false,
                error: 'Email y password son requeridos' 
            });
        }

        if (!pool) {
            return res.status(500).json({ 
                success: false,
                error: 'Error de conexión con la base de datos' 
            });
        }

        // Buscar usuario en la base de datos
        const request = pool.request();
        request.input('mail', sql.NVarChar, mail);
        
        const result = await request.query(`
            SELECT id, nombre, apellido, mail, password, admin 
            FROM usuarios 
            WHERE mail = @mail AND activo = 1
        `);
        
        if (result.recordset.length === 0) {
            return res.status(401).json({ 
                success: false,
                error: 'Credenciales incorrectas' 
            });
        }

        const user = result.recordset[0];
        
        // Verificar contraseña (asumiendo que están hasheadas con bcrypt)
        let passwordMatch = false;
        try {
            passwordMatch = await bcrypt.compare(password, user.password);
        } catch (bcryptError) {
            // Si falla bcrypt, probar comparación directa (para passwords sin hash)
            passwordMatch = (password === user.password);
        }

        if (!passwordMatch) {
            return res.status(401).json({ 
                success: false,
                error: 'Credenciales incorrectas' 
            });
        }
        
        // Generar token JWT
        const token = jwt.sign(
            { 
                id: user.id, 
                mail: user.mail, 
                admin: user.admin 
            }, 
            'secret_key_powerbi_2025', 
            { expiresIn: '8h' }
        );

        res.json({
            success: true,
            token: token,
            user: {
                id: user.id,
                nombre: user.nombre,
                apellido: user.apellido,
                mail: user.mail,
                admin: user.admin
            }
        });

    } catch (err) {
        console.error('Error en login:', err);
        res.status(500).json({ 
            success: false,
            error: 'Error interno del servidor' 
        });
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    // Para JWT, el logout es simplemente del lado del cliente
    res.json({ success: true, message: 'Logout exitoso' });
});

// Verificar sesión
app.get('/api/verify', authenticateToken, (req, res) => {
    res.json({
        success: true,
        user: {
            id: req.user.usuario_id,
            nombre: req.user.nombre,
            apellido: req.user.apellido,
            mail: req.user.mail,
            admin: req.user.admin
        }
    });
});

// ==================== RUTAS DE REPORTES ====================

// Obtener reportes del usuario logueado
app.get('/api/reportes', authenticateToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Error de conexión con la base de datos' });
        }

        const request = pool.request();
        request.input('usuario_id', sql.Int, req.user.usuario_id);
        
        // Query simplificado para obtener reportes
        const result = await request.query(`
            SELECT r.id, r.titulo, r.descripcion, r.url, r.intervalo_refresh, r.fecha_creacion
            FROM reportes r
            LEFT JOIN permisos_reportes pr ON r.id = pr.reporte_id
            WHERE (pr.usuario_id = @usuario_id OR @usuario_id IN (
                SELECT id FROM usuarios WHERE admin = 1 AND id = @usuario_id
            )) AND r.activo = 1
            ORDER BY r.titulo
        `);
        
        res.json({
            success: true,
            reportes: result.recordset
        });
    } catch (err) {
        console.error('Error obteniendo reportes:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ==================== RUTAS DE ADMINISTRACIÓN ====================

// Obtener todos los usuarios (solo admin)
app.get('/api/admin/usuarios', authenticateToken, requireAdmin, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Error de conexión con la base de datos' });
        }

        const request = pool.request();
        const result = await request.query(`
            SELECT id, nombre, apellido, mail, admin, activo, fecha_creacion
            FROM usuarios
            ORDER BY apellido, nombre
        `);
        
        res.json({
            success: true,
            usuarios: result.recordset
        });
    } catch (err) {
        console.error('Error obteniendo usuarios:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Obtener todos los reportes (solo admin)
app.get('/api/admin/reportes', authenticateToken, requireAdmin, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Error de conexión con la base de datos' });
        }

        const request = pool.request();
        const result = await request.query(`
            SELECT r.*, u.nombre + ' ' + u.apellido as creado_por_nombre
            FROM reportes r
            LEFT JOIN usuarios u ON r.creado_por = u.id
            ORDER BY r.titulo
        `);
        
        res.json({
            success: true,
            reportes: result.recordset
        });
    } catch (err) {
        console.error('Error obteniendo todos los reportes:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Obtener estadísticas generales (solo admin)
app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Error de conexión con la base de datos' });
        }

        const request = pool.request();
        const result = await request.query(`
            SELECT 
                (SELECT COUNT(*) FROM usuarios WHERE activo = 1) as totalUsuarios,
                (SELECT COUNT(*) FROM usuarios WHERE admin = 1 AND activo = 1) as totalAdmins,
                (SELECT COUNT(*) FROM reportes WHERE activo = 1) as totalReportes,
                (SELECT COUNT(*) FROM permisos_reportes) as totalPermisos
        `);
        
        res.json({
            success: true,
            stats: result.recordset[0]
        });
    } catch (err) {
        console.error('Error obteniendo estadísticas:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Obtener permisos de un usuario específico (solo admin)
app.get('/api/admin/permisos/:userId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        
        const request = pool.request();
        request.input('usuario_id', sql.Int, userId);
        
        const result = await request.query(`
            SELECT r.id, r.titulo, 
                   CASE WHEN pr.reporte_id IS NOT NULL THEN 1 ELSE 0 END as tiene_permiso
            FROM reportes r
            LEFT JOIN permisos_reportes pr ON r.id = pr.reporte_id AND pr.usuario_id = @usuario_id
            WHERE r.activo = 1
            ORDER BY r.titulo
        `);
        
        res.json({
            success: true,
            permisos: result.recordset
        });
    } catch (err) {
        console.error('Error obteniendo permisos:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Asignar permiso a usuario (solo admin)
app.post('/api/admin/permisos', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { usuario_id, reporte_id } = req.body;
        
        if (!pool) {
            return res.status(500).json({ error: 'Error de conexión con la base de datos' });
        }
        
        const request = pool.request();
        request.input('usuario_id', sql.Int, usuario_id);
        request.input('reporte_id', sql.Int, reporte_id);
        request.input('asignado_por', sql.Int, req.user.usuario_id);
        
        await request.query(`
            INSERT INTO permisos_reportes (usuario_id, reporte_id, asignado_por, fecha_asignacion)
            VALUES (@usuario_id, @reporte_id, @asignado_por, GETDATE())
        `);
        
        res.json({ success: true, message: 'Permiso asignado correctamente' });
    } catch (err) {
        console.error('Error asignando permiso:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Quitar permiso a usuario (solo admin)
app.delete('/api/admin/permisos', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { usuario_id, reporte_id } = req.body;
        
        if (!pool) {
            return res.status(500).json({ error: 'Error de conexión con la base de datos' });
        }
        
        const request = pool.request();
        request.input('usuario_id', sql.Int, usuario_id);
        request.input('reporte_id', sql.Int, reporte_id);
        
        await request.query(`
            DELETE FROM permisos_reportes 
            WHERE usuario_id = @usuario_id AND reporte_id = @reporte_id
        `);
        
        res.json({ success: true, message: 'Permiso removido correctamente' });
    } catch (err) {
        console.error('Error removiendo permiso:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Crear usuario (solo admin)
app.post('/api/admin/usuarios', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { nombre, apellido, mail, password, admin } = req.body;
        
        if (!nombre || !apellido || !mail || !password) {
            return res.status(400).json({ error: 'Todos los campos son requeridos' });
        }
        
        const request = pool.request();
        request.input('nombre', sql.NVarChar, nombre);
        request.input('apellido', sql.NVarChar, apellido);
        request.input('mail', sql.NVarChar, mail);
        request.input('password', sql.NVarChar, password);
        request.input('admin', sql.Bit, admin || false);
        
        const result = await request.query(`
            INSERT INTO usuarios (nombre, apellido, mail, password, admin)
            OUTPUT INSERTED.id
            VALUES (@nombre, @apellido, @mail, @password, @admin)
        `);
        
        res.json({
            success: true,
            message: 'Usuario creado correctamente',
            usuario_id: result.recordset[0].id
        });
    } catch (err) {
        if (err.number === 2627) { // Error de clave duplicada
            res.status(400).json({ error: 'El email ya está registrado' });
        } else {
            console.error('Error creando usuario:', err);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    }
});

// Actualizar usuario (solo admin)
app.put('/api/admin/usuarios/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, apellido, mail, admin, activo } = req.body;
        
        const request = pool.request();
        request.input('id', sql.Int, id);
        request.input('nombre', sql.NVarChar, nombre);
        request.input('apellido', sql.NVarChar, apellido);
        request.input('mail', sql.NVarChar, mail);
        request.input('admin', sql.Bit, admin);
        request.input('activo', sql.Bit, activo);
        
        await request.query(`
            UPDATE usuarios 
            SET nombre = @nombre, apellido = @apellido, mail = @mail, 
                admin = @admin, activo = @activo, fecha_modificacion = GETDATE()
            WHERE id = @id
        `);
        
        res.json({ success: true, message: 'Usuario actualizado correctamente' });
    } catch (err) {
        console.error('Error actualizando usuario:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Crear/Actualizar reporte (solo admin)
app.post('/api/admin/reportes', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { titulo, descripcion, url, intervalo_refresh } = req.body;
        
        if (!titulo || !url) {
            return res.status(400).json({ error: 'Título y URL son requeridos' });
        }
        
        const request = pool.request();
        request.input('titulo', sql.NVarChar, titulo);
        request.input('descripcion', sql.NVarChar, descripcion || '');
        request.input('url', sql.NVarChar, url);
        request.input('intervalo_refresh', sql.Int, intervalo_refresh || 30);
        request.input('creado_por', sql.Int, req.user.usuario_id);
        
        const result = await request.query(`
            INSERT INTO reportes (titulo, descripcion, url, intervalo_refresh, creado_por)
            OUTPUT INSERTED.id
            VALUES (@titulo, @descripcion, @url, @intervalo_refresh, @creado_por)
        `);
        
        res.json({
            success: true,
            message: 'Reporte creado correctamente',
            reporte_id: result.recordset[0].id
        });
    } catch (err) {
        console.error('Error creando reporte:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ==================== SERVIDOR ====================

// Servir páginas estáticas
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../login.html'));
});

app.get('/admin', authenticateToken, requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, '../admin/admin.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../dashboard.html'));
});

// Iniciar servidor
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
        console.log(`📊 Dashboard: http://localhost:${PORT}/`);
        console.log(`🔐 Login: http://localhost:${PORT}/login`);
        console.log(`⚙️ Admin: http://localhost:${PORT}/admin`);
    });
});

module.exports = app;
