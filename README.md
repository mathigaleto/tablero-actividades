# Tablero de actividades

Interfaz estática en GitHub Pages y backend independiente en Supabase.

Los datos del tablero y las cuentas no se almacenan en el repositorio. Todas las operaciones requieren una cuenta activa, validada por la función de servidor. El registro público no da acceso al tablero. Las tablas bloquean el acceso directo de los clientes mediante permisos y RLS. La clave pública de `client.js` es un identificador de proyecto y no concede acceso a los datos.

## Uso

1. Iniciar sesión con usuario y contraseña.
2. En el menú del tablero, seleccionar el usuario para abrir Mi cuenta.
3. Desde Mi cuenta, el administrador puede acceder a Administrar cuentas.
4. Crear usuarios de a uno o en lotes de hasta 50, una línea por cuenta: `usuario;Nombre completo;contraseña`.
5. Distribuir usuario y contraseña directamente a cada persona. No se envían correos ni invitaciones.
6. Los usuarios habilitados pueden crear, editar y eliminar actividades, comentar y gestionar empresas y personas.
7. Deshabilitar una cuenta impide inmediatamente sus próximas operaciones, aunque tenga una sesión abierta.
8. Descargar copias JSON desde Administración. Para importar, seleccionar un JSON compatible y confirmar el reemplazo.

Los cambios de otras personas se consultan cada 15 segundos cuando no hay un formulario abierto. Si se intenta guardar sobre una versión desactualizada, se bloquea el guardado para evitar sobrescribir el trabajo ajeno. Se puede descargar la versión pendiente y recargar.

## Privacidad y límites

La dirección de GitHub Pages y el código de la interfaz son públicos. Conocer la dirección permite abrir la pantalla de ingreso; las actividades requieren una cuenta habilitada. El enlace no es una contraseña. No se garantiza que la URL permanezca secreta. `robots.txt` y las etiquetas `noindex` solicitan que no se indexe el sitio.

El plan gratuito de Supabase tiene límites y puede pausar el proyecto después de un período de baja actividad. Revisar las condiciones vigentes en https://supabase.com/pricing y https://supabase.com/docs/guides/platform/free-project-pausing. No se configuró ningún servicio de pago.

La sesión se conserva en la pestaña del navegador. Al cerrar la pestaña se requerirá ingresar nuevamente. Las credenciales iniciales se entregan por separado y no están en este repositorio.
