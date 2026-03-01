# Instrucciones de uso — Calculadora Taller SALTLAB CAFE

Guía para personas que usan la calculadora por primera vez.

---

## 1. ¿Qué es esta aplicación?

Es la **calculadora del taller** de SALTLAB CAFE. Sirve para:

- Hacer **presupuestos** de reparaciones y tuneos según el vehículo y las piezas.
- **Registrar** cada servicio (reparación o tuneo) una vez realizado.
- Gestionar **fichajes** (entrada/salida) del personal.
- Consultar **normativas**, subir vídeos y acceder a otras funciones según tu perfil.

---

## 2. Entrar en la aplicación (login)

1. Abre la aplicación en el navegador.
2. En la pantalla de login:
   - **Usuario**: tu nombre de usuario.
   - **Contraseña**: tu contraseña.
3. Opcional: marca **«Recordar credenciales»** para no tener que escribirlas cada vez.
4. Pulsa **«Entrar»**.

**Otras opciones en el login:**

- **Usuarios con sesión reciente**: si has entrado antes, puedes elegir un usuario de la lista y rellenar solo la contraseña.
- **¿Olvidaste las credenciales?**: permite indicar tu usuario y una **nueva contraseña**; quedará actualizada en el sistema.
- **Crear usuario**: para darte de alta tú mismo (usuario, nombre, contraseña). Tras crearte, ya no te pedirá cambiar la contraseña.
- **Demo**: entra como usuario de prueba para ver la aplicación sin credenciales reales.

Si es la primera vez que entras o tu perfil lo requiere, es posible que tengas que **leer las normativas** del taller antes de continuar (pantalla de lectura obligatoria).

---

## 3. Fichaje (obligatorio para usar la calculadora)

Para usar Reparación, Tuneo o Tuneo + Reparación **tienes que haber fichado entrada**.

- En la barra superior verás un indicador: **«No fichado»** (gris) o **«Fichado»** (verde).
- Ese indicador es un **botón**: haz clic para:
  - **Fichar entrada** si no has fichado (pasa a «Fichado»).
  - **Fichar salida** si ya estás fichado (vuelve a «No fichado»).

Si no has fichado, los tres botones de servicio estarán desactivados. Ficha entrada y podrás usarlos.

También puedes ir al menú lateral → **Fichajes** para ver tu historial, registrar entradas/salidas manuales o (si eres admin) ver fichajes de todos los trabajadores.

---

## 4. Pantalla principal: elegir el tipo de servicio

Tras el login verás la pregunta: **«¿Qué vas a realizar?»** y tres botones:

| Botón | Uso |
|-------|-----|
| **Reparación** | Solo reparación (chasis, partes esenciales, etc.). |
| **Tuneo** | Solo modificaciones de tuneo (motor, performance, custom, cosmetic, full tuning). |
| **Tuneo + Reparación** | Incluye tuneo y reparación en el mismo servicio. |

Elige **uno** según lo que vayas a hacer en ese momento. A partir de ahí el flujo es el mismo: matrícula → calculadora → registrar.

---

## 5. Introducir la matrícula del vehículo

Después de elegir el tipo de servicio, la aplicación te pide la **matrícula del vehículo**.

1. Escribe la matrícula en el campo (aparecen sugerencias si ya existe en el sistema).
2. Pulsa **«Continuar»**.

**Si la matrícula ya está registrada:**  
Se cargan los datos del vehículo y pasas directamente a la **calculadora** con el servicio elegido (Reparación, Tuneo o Tuneo + Reparación).

**Si la matrícula NO está registrada:**  
Aparece un formulario para dar de alta el vehículo:

- **Modelo**: elige del catálogo.
- **Nombre IC del vehículo**: nombre in-game si lo conoces.
- **Convenio**: si aplica (ej. Badulaque, etc.).
- **Placa de servicio**: opcional (policía/EMS).

Pulsa **«Guardar y continuar»**. La aplicación te llevará a la **calculadora** con el mismo tipo de servicio que elegiste al principio (no vuelve a la pantalla principal).

Con **«← Volver»** vuelves a la pantalla de matrícula sin guardar.

---

## 6. La calculadora (presupuesto)

En la calculadora verás:

- Arriba: **tipo de servicio** (Reparación / Tuneo / Tuneo + Reparación) y la **matrícula** del vehículo.
- **Vehículo y tipo de tuneo** (si aplica):
  - Modelo, categoría, nombre IC.
  - **Full tuning**: opción que aplica un precio según el valor del vehículo.
  - Swap de motor, piezas de Performance, Custom y Cosmetic (0–30).
- **Reparación** (si aplica):
  - Partes del chasis (0–10), partes esenciales (0–6).
  - Precio total de la reparación.
- **Descuento**: si tienes permiso, puedes elegir porcentaje y convenio.
- **Mecánico**: se rellena con tu usuario.

Ve cambiando modelo, piezas y cantidades; los **precios se actualizan solos**. Cuando el presupuesto sea el correcto, puedes registrar el servicio.

**Botones útiles:**

- **HOME**: vuelve a la pantalla principal («¿Qué vas a realizar?»).
- **📋 Copiar registro**: copia el resumen al portapapeles.

---

## 7. Registrar el servicio

Cuando el presupuesto esté listo:

- Si el servicio es **solo tuneo**: pulsa **«✔ REGISTRAR TUNEO»**.
- Si es **solo reparación** o **tuneo + reparación**: pulsa **«✔ REGISTRAR REPARACION»** (o el botón equivalente que muestre la pantalla).

El servicio quedará registrado (y, si está configurado, se enviará la información al Discord). Después puedes volver a HOME y empezar otro servicio.

---

## 8. Menú lateral (barra derecha)

En la barra de la derecha tienes acceso a:

| Opción | Descripción |
|--------|-------------|
| **Fichajes** | Ver y registrar entradas/salidas, tu historial y (admin) el de todos. |
| **Mi ficha** | Tu ficha de trabajador (si está activa). |
| **Mi historial** | Tus servicios registrados. |
| **Subir video** | Enviar un vídeo para el taller (si tienes permiso). |
| **Normativas** | Consultar las normativas del taller. |
| **Resultados** | Ver el registro de servicios (reparaciones/tuneos). |
| **Gestión** | Panel de administración (solo admin). |
| **Clientes** | Registro de clientes, BBDD y pendientes (solo si tienes permiso). |
| **Salir** | Cerrar sesión. |

No todos los botones se muestran a todos los usuarios; depende de tu rol y permisos.

---

## 9. Otras funciones en la barra superior

- **Indicador de fichaje** («No fichado» / «Fichado»): como se ha dicho, es un botón para fichar entrada o salida sin ir a la pestaña Fichajes.
- **Cambiar usuario** (icono ⇄): solo si tienes permiso de administración. Al hacer clic se abre un desplegable con los usuarios registrados; al elegir uno cambias de sesión sin cerrar la app.
- **Fecha y hora**: se muestran en la parte derecha del header.

---

## 10. Resumen del flujo típico

1. **Entrar** con usuario y contraseña (y leer normativas si toca).
2. **Fichar entrada** (clic en «No fichado» o desde Fichajes).
3. En la pantalla principal, elegir **Reparación**, **Tuneo** o **Tuneo + Reparación**.
4. **Introducir la matrícula** y continuar; si no existe, rellenar la ficha del vehículo y «Guardar y continuar».
5. En la **calculadora**, ajustar modelo, piezas y descuentos hasta tener el presupuesto correcto.
6. Pulsar **REGISTRAR TUNEO** o **REGISTRAR REPARACION** según corresponda.
7. Para otro servicio: **HOME** y repetir desde el paso 3.

Si tienes dudas sobre permisos, convenios o precios, consulta con el responsable del taller o con un administrador.
