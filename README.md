# Transporte Conexión

Sistema web de práctica para una agencia de transporte de pasajeros. Incluye interfaz pública, panel por perfiles, API HTTP, manejo de rutas y reservas, y scripts SQL de referencia.

## Inicio rápido

Requisitos: Node.js 18 o superior.

1. Abre esta carpeta en Visual Studio Code.
2. En Terminal > Nueva terminal ejecuta:

```powershell
node src/server.js
```

3. Abre [http://localhost:3000](http://localhost:3000).
4. Detén el servidor con **Ctrl + C**.

La app usa módulos incluidos en Node.js, por eso no necesita `npm install`.

## Perfiles de demostración

| Perfil | Correo | Contraseña |
| --- | --- | --- |
| Administrador | `admin@transporte.local` | `Admin123*` |
| Conductor | `conductor@transporte.local` | `Conductor123*` |
| Cliente | `cliente@transporte.local` | `Cliente123*` |

## Frontend

- `public/index.html`: estructura base de la página.
- `public/styles.css`: hoja de estilos CSS en cascada, adaptable a celular.
- `public/app.js`: pantallas, formularios y consumo de la API con `fetch()`.

El panel del administrador incluye dashboard, configuración, usuarios, vehículos, rutas, programación, conductores, clientes, reservas y ventas. Los perfiles de cliente y conductor tienen sus vistas correspondientes.

## Backend por capas

`src/server.js` levanta el servidor y define los endpoints. El router dirige cada petición al controlador; el controlador verifica los permisos; los servicios aplican las reglas del negocio; los repositorios y la infraestructura manejan la persistencia.

## Almacenamiento

Durante la ejecución, el backend guarda los datos en `.data/transporte.json`. La carpeta `database` incluye `schema.sql` y `seed.sql` para inspeccionar/importar el modelo en MySQL 8, pero el servidor de esta versión no abre una conexión MySQL.

Los pagos, la recuperación de contraseña y los avisos por correo son demostrativos; no se conecta a bancos ni a un servidor de correo.

## Consultar la API

Abre `solicitudes.http` para ver ejemplos de `GET`, inicio de sesión, búsquedas protegidas y consultas de reservas. En VS Code puedes enviarlas con la extensión REST Client. También hay ejemplos en `GUIA_DE_USO_Y_EJECUCION.md`.


