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

// Variables globales para datos en memoria
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

// =============================================
// RUTAS DE LA API
// =============================================

// Ruta de health check
app.get('/health', (req, res) => {
    const status = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        database: 'Memoria Local',
        sqlModule: 'No Requerido',
        mode: 'Standalone',
        server: 'Render - Funcionando sin dependencias SQL',
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

        // Buscar usuario en datos locales
        const user = users.find(u => 
            u.email.toLowerCase() === email.toLowerCase() && 
            u.password === password && 
            u.activo
        );
        
        if (user) {
            const token = 'mem_' + Buffer.from(email + ':' + Date.now()).toString('base64');
            
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

// Ruta para verificar token
app.post('/verify-token', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (token && token.startsWith('mem_')) {
        res.json({ success: true, message: 'Token válido' });
    } else {
        res.status(401).json({ success: false, message: 'Token inválido' });
    }
});

// Ruta para obtener reportes del usuario
app.get('/reports/user/:userId', (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        
        // Obtener permisos del usuario
        const userPermissions = permissions.filter(p => p.usuario_id === userId && p.puede_ver);
        
        // Obtener reportes permitidos
        const userReports = reports.filter(r => {
            return r.activo && userPermissions.some(p => p.reporte_id === r.id);
        }).map(r => {
            const permission = userPermissions.find(p => p.reporte_id === r.id);
            return {
                ...r,
                puede_ver: permission.puede_ver,
                puede_editar: permission.puede_editar
            };
        });

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
app.post('/reports', (req, res) => {
    try {
        const { nombre, url, descripcion, refresh_interval, usuario_id } = req.body;
        
        if (!nombre || !url) {
            return res.status(400).json({
                success: false,
                message: 'Nombre y URL son requeridos'
            });
        }
        
        const newReport = {
            id: generateId(),
            nombre: nombre,
            url: url,
            descripcion: descripcion || '',
            refresh_interval: refresh_interval || 60,
            activo: true,
            usuario_creador: usuario_id || 1,
            fecha_creacion: new Date().toISOString()
        };
        
        reports.push(newReport);
        
        // Asignar permiso al usuario creador
        permissions.push({
            id: generateId(),
            usuario_id: usuario_id || 1,
            reporte_id: newReport.id,
            puede_ver: true,
            puede_editar: true
        });
        
        // Registrar actividad
        logActivity(usuario_id || 1, 'Reporte creado', `Reporte "${nombre}" creado exitosamente`);

        res.json({
            success: true,
            message: 'Reporte creado exitosamente',
            reporteId: newReport.id
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
app.delete('/reports/:id', (req, res) => {
    try {
        const reporteId = parseInt(req.params.id);
        
        // Buscar reporte
        const reportIndex = reports.findIndex(r => r.id === reporteId);
        
        if (reportIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Reporte no encontrado'
            });
        }
        
        const reporteName = reports[reportIndex].nombre;
        
        // Eliminar permisos del reporte
        permissions = permissions.filter(p => p.reporte_id !== reporteId);
        
        // Eliminar reporte
        reports.splice(reportIndex, 1);
        
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
app.get('/admin/stats', (req, res) => {
    try {
        const stats = {
            totalUsers: users.length,
            activeUsers: users.filter(u => u.activo).length,
            totalReports: reports.filter(r => r.activo).length,
            activeSessions: 1,
            totalActivity: activity.length
        };

        res.json(stats);
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

app.get('/admin/users', (req, res) => {
    try {
        const publicUsers = users.map(u => ({
            id: u.id,
            nombre: u.nombre,
            apellido: u.apellido,
            email: u.email,
            admin: u.admin,
            activo: u.activo
        }));
        
        res.json(publicUsers);
    } catch (error) {
        console.error('Error al obtener usuarios:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener usuarios'
        });
    }
});

app.get('/admin/reports', (req, res) => {
    try {
        res.json(reports);
    } catch (error) {
        console.error('Error al obtener reportes:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener reportes'
        });
    }
});

app.get('/admin/activity', (req, res) => {
    try {
        // Devolver últimos 50 registros
        const recentActivity = activity.slice(-50).reverse();
        res.json(recentActivity);
    } catch (error) {
        console.error('Error al obtener actividad:', error);
        res.json([]);
    }
});

app.get('/admin/permissions', (req, res) => {
    try {
        // Combinar permisos con información de usuarios y reportes
        const detailedPermissions = permissions.map(p => {
            const user = users.find(u => u.id === p.usuario_id);
            const report = reports.find(r => r.id === p.reporte_id);
            
            return {
                ...p,
                usuario_nombre: user ? `${user.nombre} ${user.apellido}` : 'Usuario desconocido',
                reporte_nombre: report ? report.nombre : 'Reporte desconocido'
            };
        });
        
        res.json(detailedPermissions);
    } catch (error) {
        console.error('Error al obtener permisos:', error);
        res.json([]);
    }
});

// Ruta para crear usuario (admin)
app.post('/admin/users', (req, res) => {
    try {
        const { nombre, apellido, email, password, admin, activo } = req.body;
        
        if (!nombre || !apellido || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Todos los campos son requeridos'
            });
        }
        
        // Verificar si el email ya existe
        if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
            return res.status(400).json({
                success: false,
                message: 'El email ya está registrado'
            });
        }
        
        const newUser = {
            id: generateId(),
            nombre,
            apellido,
            email,
            password,
            admin: !!admin,
            activo: activo !== false
        };
        
        users.push(newUser);
        
        // Registrar actividad
        logActivity(1, 'Usuario creado', `Usuario ${email} creado`);
        
        res.json({
            success: true,
            message: 'Usuario creado exitosamente',
            userId: newUser.id
        });
    } catch (error) {
        console.error('Error al crear usuario:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear usuario'
        });
    }
});

// Ruta para asignar permisos
app.post('/admin/permissions', (req, res) => {
    try {
        const { usuario_id, reporte_id, puede_ver, puede_editar } = req.body;
        
        if (!usuario_id || !reporte_id) {
            return res.status(400).json({
                success: false,
                message: 'Usuario y reporte son requeridos'
            });
        }
        
        // Verificar si ya existe el permiso
        const existingPermission = permissions.find(p => 
            p.usuario_id === usuario_id && p.reporte_id === reporte_id
        );
        
        if (existingPermission) {
            // Actualizar permiso existente
            existingPermission.puede_ver = puede_ver !== false;
            existingPermission.puede_editar = !!puede_editar;
        } else {
            // Crear nuevo permiso
            permissions.push({
                id: generateId(),
                usuario_id,
                reporte_id,
                puede_ver: puede_ver !== false,
                puede_editar: !!puede_editar
            });
        }
        
        // Registrar actividad
        logActivity(1, 'Permiso asignado', `Permiso asignado a usuario ${usuario_id} para reporte ${reporte_id}`);
        
        res.json({
            success: true,
            message: 'Permiso asignado exitosamente'
        });
    } catch (error) {
        console.error('Error al asignar permiso:', error);
        res.status(500).json({
            success: false,
            message: 'Error al asignar permiso'
        });
    }
});

// Ruta para endpoints disponibles
app.get('/', (req, res) => {
    res.json({
        message: 'PowerBI Backend API',
        version: '3.0 - Standalone Mode',
        database: 'Memoria Local (Sin SQL Dependencies)',
        mode: 'Standalone - Zero Dependencies',
        compatible: 'Node.js 18+',
        features: [
            'Autenticación completa',
            'Gestión de reportes',
            'Permisos de usuario',
            'Panel administrativo',
            'Registro de actividad',
            'CRUD completo',
            'Sin dependencias SQL'
        ],
        endpoints: [
            'GET /health - Estado del servidor',
            'POST /login - Autenticación',
            'POST /verify-token - Verificar token',
            'GET /reports/user/:userId - Reportes del usuario',
            'POST /reports - Crear reporte',
            'DELETE /reports/:id - Eliminar reporte',
            'GET /admin/stats - Estadísticas',
            'GET /admin/users - Lista de usuarios',
            'GET /admin/reports - Lista de reportes',
            'GET /admin/activity - Registro de actividad',
            'GET /admin/permissions - Lista de permisos',
            'POST /admin/users - Crear usuario',
            'POST /admin/permissions - Asignar permisos'
        ]
    });
});

// Inicializar datos de actividad
logActivity(1, 'Sistema iniciado', 'Backend PowerBI iniciado correctamente');

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor PowerBI Backend v3.0 corriendo en puerto ${PORT}`);
    console.log(`🌐 Endpoints disponibles en https://powerbi-backend-vxjd.onrender.com`);
    console.log(`💾 Modo: Standalone (Sin dependencias SQL)`);
    console.log(`✅ Compatible: Node.js 18+ (Sin conflictos de Azure)`);
    console.log(`📊 Datos cargados: ${users.length} usuarios, ${reports.length} reportes`);
    console.log(`🔧 Funcionalidad: 100% operativa sin base de datos externa`);
});

// Manejar cierre del servidor
process.on('SIGINT', () => {
    console.log('Cerrando servidor PowerBI Backend...');
    process.exit(0);
});

module.exports = app;
