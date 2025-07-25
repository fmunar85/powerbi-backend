const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: ['https://powerbi-dashboards-1234.netlify.app', 'http://localhost:3000'],
    credentials: true
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0-node18',
        mode: 'fallback'
    });
});

// Login fallback con credenciales hardcodeadas
app.post('/api/login', async (req, res) => {
    try {
        const { mail, password } = req.body;

        if (!mail || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email y contraseña son requeridos'
            });
        }

        console.log(`🔄 Login attempt: ${mail}`);

        // Credenciales hardcodeadas para funcionamiento inmediato
        if (mail === 'admin@powerbi.com' && password === 'admin123') {
            const token = 'token_admin_' + Date.now();
            console.log('✅ Admin login successful');
            return res.json({
                success: true,
                token: token,
                user: {
                    id: 1,
                    nombre: 'Administrador',
                    apellido: 'Sistema',
                    mail: 'admin@powerbi.com',
                    admin: true
                }
            });
        } else if (mail === 'usuario@powerbi.com' && password === 'user123') {
            const token = 'token_user_' + Date.now();
            console.log('✅ User login successful');
            return res.json({
                success: true,
                token: token,
                user: {
                    id: 2,
                    nombre: 'Usuario',
                    apellido: 'Demo',
                    mail: 'usuario@powerbi.com',
                    admin: false
                }
            });
        } else {
            console.log('❌ Invalid credentials');
            return res.status(401).json({
                success: false,
                error: 'Credenciales incorrectas'
            });
        }

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
});

// Verify token
app.get('/api/verify', (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ error: 'Token requerido' });
        }

        // Verificar tokens básicos
        if (token.startsWith('token_admin_')) {
            return res.json({
                success: true,
                user: {
                    id: 1,
                    nombre: 'Administrador',
                    apellido: 'Sistema',
                    mail: 'admin@powerbi.com',
                    admin: true
                }
            });
        } else if (token.startsWith('token_user_')) {
            return res.json({
                success: true,
                user: {
                    id: 2,
                    nombre: 'Usuario',
                    apellido: 'Demo',
                    mail: 'usuario@powerbi.com',
                    admin: false
                }
            });
        } else {
            return res.status(403).json({ error: 'Token inválido' });
        }

    } catch (error) {
        console.error('Error verificando token:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    res.json({ success: true, message: 'Logout exitoso' });
});

// Admin stats
app.get('/api/admin/stats', (req, res) => {
    res.json({
        success: true,
        stats: {
            totalUsuarios: 2,
            totalAdmins: 1,
            totalReportes: 1,
            totalPermisos: 0
        }
    });
});

// Admin usuarios
app.get('/api/admin/usuarios', (req, res) => {
    res.json({
        success: true,
        usuarios: [
            {
                id: 1,
                nombre: 'Administrador',
                apellido: 'Sistema',
                mail: 'admin@powerbi.com',
                admin: true,
                activo: true,
                fecha_creacion: new Date().toISOString()
            },
            {
                id: 2,
                nombre: 'Usuario',
                apellido: 'Demo',
                mail: 'usuario@powerbi.com',
                admin: false,
                activo: true,
                fecha_creacion: new Date().toISOString()
            }
        ]
    });
});

// Admin reportes
app.get('/api/admin/reportes', (req, res) => {
    res.json({
        success: true,
        reportes: [
            {
                id: 1,
                titulo: 'Dashboard Principal',
                descripcion: 'Dashboard principal de Power BI',
                url: 'https://app.powerbi.com/reportEmbed?reportId=sample',
                intervalo_refresh: 30,
                activo: true,
                creado_por_nombre: 'Administrador Sistema',
                fecha_creacion: new Date().toISOString()
            }
        ]
    });
});

// Reportes del usuario
app.get('/api/reportes', (req, res) => {
    res.json({
        success: true,
        reportes: [
            {
                id: 1,
                titulo: 'Dashboard Principal',
                descripcion: 'Dashboard principal de Power BI',
                url: 'https://app.powerbi.com/reportEmbed?reportId=sample',
                intervalo_refresh: 30,
                fecha_creacion: new Date().toISOString()
            }
        ]
    });
});

// Catch all para rutas no encontradas
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint no encontrado',
        message: 'La ruta solicitada no existe',
        available_endpoints: [
            'GET /health',
            'POST /api/login',
            'GET /api/verify',
            'POST /api/logout',
            'GET /api/admin/stats',
            'GET /api/admin/usuarios',
            'GET /api/admin/reportes',
            'GET /api/reportes'
        ]
    });
});

// Error handler global
app.use((error, req, res, next) => {
    console.error('Error no manejado:', error);
    res.status(500).json({
        error: 'Error interno del servidor',
        message: 'Ocurrió un error inesperado'
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor PowerBI corriendo en puerto ${PORT}`);
    console.log(`📊 Modo: Fallback (sin base de datos)`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    console.log(`🔑 Credenciales admin: admin@powerbi.com / admin123`);
    console.log(`👤 Credenciales user: usuario@powerbi.com / user123`);
});

module.exports = app;
