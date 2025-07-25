-- Script para crear la base de datos y tablas del sistema Power BI
-- Ejecutar en SQL Server Management Studio conectado a 192.168.30.36

-- Crear base de datos si no existe
IF NOT EXISTS (SELECT name FROM tUsuarios WHERE name = N'dbPowerbi')
BEGIN
    CREATE DATABASE [dbPowerbi]
END
GO

USE [dbPowerbi]
GO

-- Tabla de usuarios
IF NOT EXISTS (SELECT * FROM dbPowerbi WHERE name='usuarios' AND xtype='U')
BEGIN
    CREATE TABLE [dbo].[usuarios] (
        [id] INT IDENTITY(1,1) PRIMARY KEY,
        [nombre] NVARCHAR(100) NOT NULL,
        [apellido] NVARCHAR(100) NOT NULL,
        [mail] NVARCHAR(255) NOT NULL UNIQUE,
        [password] NVARCHAR(255) NOT NULL,
        [admin] BIT NOT NULL DEFAULT 0,
        [activo] BIT NOT NULL DEFAULT 1,
        [fecha_creacion] DATETIME2 DEFAULT GETDATE(),
        [fecha_modificacion] DATETIME2 DEFAULT GETDATE()
    )
END
GO

-- Tabla de reportes
IF NOT EXISTS (SELECT * FROM dbPowerbi WHERE name='reportes' AND xtype='U')
BEGIN
    CREATE TABLE [dbo].[reportes] (
        [id] INT IDENTITY(1,1) PRIMARY KEY,
        [titulo] NVARCHAR(200) NOT NULL,
        [descripcion] NVARCHAR(500),
        [url] NVARCHAR(MAX) NOT NULL,
        [intervalo_refresh] INT NOT NULL DEFAULT 30,
        [activo] BIT NOT NULL DEFAULT 1,
        [fecha_creacion] DATETIME2 DEFAULT GETDATE(),
        [fecha_modificacion] DATETIME2 DEFAULT GETDATE(),
        [creado_por] INT FOREIGN KEY REFERENCES usuarios(id)
    )
END
GO

-- Tabla de permisos (relación muchos a muchos entre usuarios y reportes)
IF NOT EXISTS (SELECT * FROM dbPowerbi WHERE name='permisos_reportes' AND xtype='U')
BEGIN
    CREATE TABLE [dbo].[permisos_reportes] (
        [id] INT IDENTITY(1,1) PRIMARY KEY,
        [usuario_id] INT NOT NULL FOREIGN KEY REFERENCES usuarios(id) ON DELETE CASCADE,
        [reporte_id] INT NOT NULL FOREIGN KEY REFERENCES reportes(id) ON DELETE CASCADE,
        [fecha_asignacion] DATETIME2 DEFAULT GETDATE(),
        [asignado_por] INT FOREIGN KEY REFERENCES usuarios(id),
        UNIQUE(usuario_id, reporte_id)
    )
END
GO

-- Tabla de sesiones (para manejo de login)
IF NOT EXISTS (SELECT * FROM dbPowerbi WHERE name='sesiones' AND xtype='U')
BEGIN
    CREATE TABLE [dbo].[sesiones] (
        [id] INT IDENTITY(1,1) PRIMARY KEY,
        [usuario_id] INT NOT NULL FOREIGN KEY REFERENCES usuarios(id) ON DELETE CASCADE,
        [token] NVARCHAR(255) NOT NULL UNIQUE,
        [fecha_inicio] DATETIME2 DEFAULT GETDATE(),
        [fecha_expiracion] DATETIME2 NOT NULL,
        [activa] BIT NOT NULL DEFAULT 1,
        [ip_address] NVARCHAR(45),
        [user_agent] NVARCHAR(500)
    )
END
GO

-- Insertar usuario administrador por defecto
IF NOT EXISTS (SELECT * FROM usuarios WHERE mail = 'admin@powerbi.com')
BEGIN
    INSERT INTO usuarios (nombre, apellido, mail, password, admin, activo)
    VALUES ('Administrador', 'Sistema', 'admin@powerbi.com', 'admin123', 1, 1)
END
GO

-- Insertar reportes de ejemplo
IF NOT EXISTS (SELECT * FROM reportes WHERE titulo = 'Reporte Principal - Faena')
BEGIN
    DECLARE @AdminId INT = (SELECT id FROM usuarios WHERE mail = 'admin@powerbi.com')
    
    INSERT INTO reportes (titulo, descripcion, url, intervalo_refresh, creado_por) VALUES
    ('Reporte Principal - Hacienda', 'Dashboard principal con datos de hacienda y producción', 
     'https://app.powerbi.com/view?r=eyJrIjoiMmZhMTY5NTAtOThjMi00NTc2LWE3NWYtMzQ4NzkzYzM2NmVlIiwidCI6IjAxZDkxN2IyLTU5ZjktNDRjYi1iMzc2LWUyYjYzNmJkMTEyYiJ9', 
     30, @AdminId),
    ('Ventas Mensuales', 'Reporte de ventas y facturación mensual', '', 60, @AdminId),
    ('Inventario y Stock', 'Control de inventario y niveles de stock', '', 120, @AdminId),
    ('Análisis Financiero', 'Indicadores financieros y KPIs', '', 300, @AdminId),
    ('Producción Diaria', 'Métricas de producción en tiempo real', '', 30, @AdminId),
    ('Recursos Humanos', 'Dashboard de RRHH y personal', '', 600, @AdminId),
    ('Calidad y Control', 'Métricas de calidad y control de procesos', '', 180, @AdminId),
    ('Logística y Distribución', 'Seguimiento de logística y entregas', '', 240, @AdminId),
    ('Marketing y Clientes', 'Análisis de marketing y satisfacción del cliente', '', 300, @AdminId),
    ('Reportes Ejecutivos', 'Dashboard ejecutivo con KPIs principales', '', 600, @AdminId)
END
GO

-- Crear índices para mejorar rendimiento
CREATE NONCLUSTERED INDEX IX_usuarios_mail ON usuarios(mail)
GO

CREATE NONCLUSTERED INDEX IX_usuarios_activo ON usuarios(activo)
GO

CREATE NONCLUSTERED INDEX IX_reportes_activo ON reportes(activo)
GO

CREATE NONCLUSTERED INDEX IX_permisos_usuario ON permisos_reportes(usuario_id)
GO

CREATE NONCLUSTERED INDEX IX_permisos_reporte ON permisos_reportes(reporte_id)
GO

CREATE NONCLUSTERED INDEX IX_sesiones_token ON sesiones(token)
GO

CREATE NONCLUSTERED INDEX IX_sesiones_usuario ON sesiones(usuario_id, activa)
GO

-- Crear vistas útiles
CREATE OR ALTER VIEW vw_usuarios_reportes AS
SELECT 
    u.id as usuario_id,
    u.nombre,
    u.apellido,
    u.mail,
    u.admin,
    u.activo as usuario_activo,
    r.id as reporte_id,
    r.titulo as reporte_titulo,
    r.descripcion as reporte_descripcion,
    r.url as reporte_url,
    r.intervalo_refresh,
    r.activo as reporte_activo,
    pr.fecha_asignacion
FROM usuarios u
LEFT JOIN permisos_reportes pr ON u.id = pr.usuario_id
LEFT JOIN reportes r ON pr.reporte_id = r.id
WHERE u.activo = 1
GO

-- Procedimientos almacenados

-- SP para autenticar usuario
CREATE OR ALTER PROCEDURE sp_autenticar_usuario
    @mail NVARCHAR(255),
    @password NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;
    
    SELECT 
        id,
        nombre,
        apellido,
        mail,
        admin,
        activo
    FROM usuarios 
    WHERE mail = @mail 
    AND password = @password 
    AND activo = 1
END
GO

-- SP para obtener reportes de un usuario
CREATE OR ALTER PROCEDURE sp_obtener_reportes_usuario
    @usuario_id INT
AS
BEGIN
    SET NOCOUNT ON;
    
    SELECT DISTINCT
        r.id,
        r.titulo,
        r.descripcion,
        r.url,
        r.intervalo_refresh,
        r.activo,
        r.fecha_creacion
    FROM reportes r
    INNER JOIN permisos_reportes pr ON r.id = pr.reporte_id
    WHERE pr.usuario_id = @usuario_id
    AND r.activo = 1
    ORDER BY r.titulo
END
GO

-- SP para crear sesión
CREATE OR ALTER PROCEDURE sp_crear_sesion
    @usuario_id INT,
    @token NVARCHAR(255),
    @ip_address NVARCHAR(45) = NULL,
    @user_agent NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Cerrar sesiones anteriores del usuario
    UPDATE sesiones 
    SET activa = 0 
    WHERE usuario_id = @usuario_id AND activa = 1
    
    -- Crear nueva sesión (expira en 8 horas)
    INSERT INTO sesiones (usuario_id, token, fecha_expiracion, ip_address, user_agent)
    VALUES (@usuario_id, @token, DATEADD(HOUR, 8, GETDATE()), @ip_address, @user_agent)
    
    SELECT SCOPE_IDENTITY() as sesion_id
END
GO

-- SP para validar sesión
CREATE OR ALTER PROCEDURE sp_validar_sesion
    @token NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;
    
    SELECT 
        s.usuario_id,
        u.nombre,
        u.apellido,
        u.mail,
        u.admin,
        s.fecha_expiracion
    FROM sesiones s
    INNER JOIN usuarios u ON s.usuario_id = u.id
    WHERE s.token = @token 
    AND s.activa = 1 
    AND s.fecha_expiracion > GETDATE()
    AND u.activo = 1
END
GO

-- SP para asignar permiso
CREATE OR ALTER PROCEDURE sp_asignar_permiso
    @usuario_id INT,
    @reporte_id INT,
    @asignado_por INT
AS
BEGIN
    SET NOCOUNT ON;
    
    IF NOT EXISTS (SELECT 1 FROM permisos_reportes WHERE usuario_id = @usuario_id AND reporte_id = @reporte_id)
    BEGIN
        INSERT INTO permisos_reportes (usuario_id, reporte_id, asignado_por)
        VALUES (@usuario_id, @reporte_id, @asignado_por)
    END
END
GO

-- SP para quitar permiso
CREATE OR ALTER PROCEDURE sp_quitar_permiso
    @usuario_id INT,
    @reporte_id INT
AS
BEGIN
    SET NOCOUNT ON;
    
    DELETE FROM permisos_reportes 
    WHERE usuario_id = @usuario_id AND reporte_id = @reporte_id
END
GO

PRINT 'Base de datos dbPowerbi creada exitosamente con todas las tablas, índices y procedimientos'
