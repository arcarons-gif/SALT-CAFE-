# Instrucciones de uso — SALTLAB Calculator

Guía completa de la calculadora del taller SALTLAB CAFE y todas sus funcionalidades.

---

## 1. ¿Qué es SALTLAB Calculator?

Es la **calculadora del taller** de SALTLAB CAFE. Permite:

- **Presupuestos** de reparaciones y tuneos según vehículo y piezas.
- **Registro** de cada servicio (reparación o tuneo) una vez realizado.
- **Fichajes** (entrada/salida) del personal.
- **Consulta de normativas** e **instrucciones** mediante un asistente (chatbot).
- **Gestión** de usuarios, organigrama, economía, clientes y materiales (según permisos).
- **Materiales recuperados**: cualquier usuario puede indicar materiales devueltos al almacén tras reparaciones y enviar el registro a Discord (el almacén se actualiza automáticamente).
- **Personalización** de colores, fuentes y aspecto de la interfaz.

---

## 2. Entrar en la aplicación (login)

1. Abre la aplicación en el navegador.
2. En la pantalla de login:
   - **Usuario**: tu nombre de usuario.
   - **Contraseña**: tu contraseña.
3. Opcional: marca **«Recordar credenciales»**.
4. Pulsa **«Entrar»**.

**Otras opciones en el login:**

- **Usuarios con sesión reciente**: elige un usuario de la lista para rellenar usuario y contraseña.
- **¿Olvidaste las credenciales?**: indica tu usuario y una **nueva contraseña** (queda actualizada).
- **Crear usuario**: darte de alta (usuario, nombre, contraseña).
- **Demo**: entrar como usuario de prueba.

Si es la primera vez o tu perfil lo requiere, deberás **leer las normativas** del taller y superar el **test de comprensión** antes de continuar.

---

## 3. Fichaje (obligatorio para usar la calculadora)

Para usar Reparación, Tuneo o Tuneo + Reparación **debes haber fichado entrada**.

- En la barra superior: indicador **«No fichado»** (gris) o **«Fichado»** (verde). Es un **botón**: clic para fichar entrada o salida.
- Si no has fichado, los botones de servicio están desactivados.

**Fichaje automático al salir:** Si tienes una entrada abierta y pulsas **Salir**, la aplicación registra automáticamente la **salida** con la hora actual antes de cerrar sesión.

**Menú → Fichajes:** Ver tu historial, registrar entradas/salidas manuales o (si eres admin) ver fichajes de todos los trabajadores.

---

## 4. Pantalla principal

**«¿Qué vas a realizar?»** — Tres botones:

| Botón | Uso |
|-------|-----|
| **Reparación** | Solo reparación (chasis, partes esenciales, etc.). |
| **Tuneo** | Solo modificaciones de tuneo. |
| **Tuneo + Reparación** | Tuneo y reparación en el mismo servicio. |

Flujo: **matrícula → calculadora → registrar**.

**En la misma pantalla:**

- **Últimas reparaciones:** listado de los últimos servicios. **Haz clic en una fila** para abrir una ventana con el **resumen** de esa reparación/tuneo. Puedes cerrar la ventana con la **X** o con la tecla **Escape**.
- **Dashboard:** indicadores (total materiales, compras pendientes, empleados, gastos del mes) y gráfico de estadísticas (si tienes permiso).

---

## 5. Matrícula del vehículo

1. Escribe la **matrícula** (hay sugerencias si ya existe).
2. Pulsa **«Continuar»**.

**Si la matrícula ya está registrada:** pasas a la calculadora.

**Si no existe:** se muestra un formulario para dar de alta el vehículo (modelo, nombre IC, convenio, placa de servicio). **«Guardar y continuar»** te lleva a la calculadora. **«← Volver»** vuelve sin guardar.

---

## 6. La calculadora (presupuesto)

- Arriba: **tipo de servicio** y **matrícula**.
- **Vehículo y tuneo** (si aplica): modelo, full tuning, piezas Performance/Custom/Cosmetic.
- **Reparación** (si aplica): chasis, partes esenciales, total.
- **Descuento** y **mecánico** (rellenado con tu usuario).

Los precios se actualizan al cambiar opciones. **Botones:** **HOME** (volver al inicio), **📋 Copiar registro**, **✔ REGISTRAR TUNEO** o **✔ REGISTRAR REPARACION**, **O RESET** (limpiar campos).

---

## 7. Registrar el servicio

- **Solo tuneo:** **«✔ REGISTRAR TUNEO»**.
- **Reparación** o **Tuneo + Reparación:** **«✔ REGISTRAR REPARACION»**.

El servicio queda registrado (y puede enviarse a Discord si está configurado). Luego puedes volver a HOME.

---

## 8. Menú lateral (barra derecha)

| Opción | Descripción |
|--------|-------------|
| **Fichajes** | Ver y registrar entradas/salidas; tu historial; (admin) todos los trabajadores. |
| **Mi ficha** | Tu ficha de trabajador en pantalla completa (solo si tienes el permiso; si eres admin puede estar oculto). |
| **Mi historial** | Tus servicios registrados. |
| **Subir video** | Enviar un vídeo para el taller (revisión por admin). |
| **Normativas** | Consultar las normativas del taller. |
| **Resultados** | Registro de servicios (reparaciones/tuneos). |
| **Gestión** | Panel: Usuarios, Convenios, Organigrama, Economía, Stock, **Materiales recuperados** (todos), Mi ficha, Normativas, etc. (según permisos). |
| **Clientes** | Registro de clientes, BBDD, pendientes, vetados (si tienes permiso). |
| **Personalización** | Ajustar colores, fuentes, tema, fondo de pantalla, estilo de tarjetas, animaciones. |
| **Materiales recuperados** | (Dentro de Gestión, visible para todos.) Indicar cantidades de materiales devueltos al almacén; **Enviar registro al canal de Discord** actualiza el almacén y envía el resumen a Discord. |
| **Salir** | Cerrar sesión (y fichar salida automática si tenías entrada abierta). |

La visibilidad de cada opción depende de tu **rol y permisos**.

---

## 9. Mi ficha de trabajador

Pantalla completa (no ventana emergente) con:

- **Credenciales:** usuario, nombre, rol.
- **Foto de perfil:** añadir, quitar o usar una foto como **fondo de la pantalla** de la ficha.
- **Material entregado:** registro de material asignado.
- **Permisos:** listado con iconos/indicadores por permiso.
- **Salario** y datos laborales.
- **Indicadores:** horas (hoy, semana, mes, total) y total cobrado.

**Importante:** Solo el usuario **admin** (usuario `admin`) ve en su ficha los **totales del taller**. El resto de usuarios ven **sus propios** resultados (horas y total cobrado personales).

---

## 10. Gestión (panel de administración)

Acceso desde **Menú → Gestión**. Incluye:

- **Usuarios:** crear y editar usuarios, roles y permisos. Al hacer clic en un usuario se abre su **ficha en pantalla completa** (organigrama desde aquí también).
- **Convenios:** crear y editar convenios con descuentos.
- **Organigrama:** vista jerárquica del equipo con **líneas de conexión** y **fichas** por nivel. Puedes seleccionar un nodo para ver una **previsualización de la ficha** del empleado; desde ahí abrir la ficha completa.
- **Economía:**  
  - Compras, inventario, gastos, **entregas a trabajadores**, historial de pedidos, previsiones.  
  - **Gestión financiera** (solo admin): resultado EBITA, reparto de beneficios, **Enviar registro al canal de Discord** (resumen financiero). El mismo botón de Discord está en Historial de pedidos, Gastos y Previsiones.  
  - **Entregas a trabajadores:** al registrar una entrega (quién entrega, material, cantidad, a qué trabajador), el registro se envía automáticamente al canal de Discord configurado.
- **Stock / Almacén materiales:**  
  - Tabla por material (ACERO, ALUMINIO, COBRE, etc.) con **Cantidad en almacén**, **Aportaciones**, **Retiradas**, **Aplicar** (suma aportaciones y resta retiradas) y **Reset** (poner esa cantidad a cero).  
  - **Registrar materiales recuperados** (modal): añade cantidades al almacén (como hasta ahora).

**Sincronización de datos:**  
- **Sin backend:** Los datos se guardan en el **navegador** (localStorage). En el mismo PC y navegador, varias pestañas comparten datos. Entre ordenadores distintos no se comparten.  
- **Con backend en la nube:** Si el backend está desplegado (p. ej. en Render) y la app abre desde la URL pública (GitHub Pages), **todos los usuarios comparten los mismos usuarios, fichajes y reparaciones**; la actualización es simultánea y no depende de que tu PC esté encendido. Ver **[DEPLIEGUE_BACKEND.md](DEPLIEGUE_BACKEND.md)** para desplegar el backend.

---

## 11. Clientes

Desde **Menú → Clientes** (si tienes permiso): registro de clientes, base de datos, pendientes y vetados. Pestañas para cambiar entre vistas.

---

## 12. Personalización

Desde **Menú → Personalización** cualquier usuario puede:

- **Color de acento:** elegir el color principal (oro, verde, naranja, azul, etc.).
- **Tipografía:** familia y tamaño de fuente.
- **Tema:** claro/oscuro y contraste.
- **Fondo de pantalla:** imagen personalizada o gradiente; **intensidad del fondo** (opacidad).
- **Estilo de tarjetas:** plano o elevado.
- **Accesibilidad:** reducir animaciones, etc.

Los cambios se **guardan por usuario** y se aplican al instante.

---

## 13. Asistente de dudas (chatbot)

- **Botón flotante** en la esquina inferior derecha: forma **redonda** con la mascota del flamenco (animada al estilo Clippy). Solo visible cuando has iniciado sesión.
- **Clic** en el botón: se abre el **panel del chat**.
- En el panel puedes **escribir preguntas** en el campo de texto y pulsar **Enviar** (o Enter). El asistente **solo responde con contenido de las normativas e instrucciones** del taller (fichaje, descuentos, reparación, tuneo, convenios, etc.). Si la pregunta no está relacionada, indica que solo puede ayudar sobre ese tema.
- **Cerrar el panel:** botón **X** en la esquina del panel o tecla **Escape**.

---

## 14. Barra superior

- **Indicador de fichaje** («No fichado» / «Fichado»): botón para fichar entrada o salida.
- **Cambiar usuario** (icono ⇄): solo con permiso de administración; cambia de sesión sin cerrar la app.
- **Fecha y hora** en la parte derecha.

---

## 15. Normativas y test de comprensión

- **Menú → Normativas:** consulta de todos los documentos (normativa interna, SAPD, tuning importados, comercios, instrucciones de uso).
- Si tu perfil lo exige, la **primera vez** deberás **leer todas las páginas** de cada documento y superar un **test de comprensión** (preguntas sobre normativas e instrucciones). Solo entonces podrás continuar al taller.

---

## 16. Resumen del flujo típico

1. **Entrar** con usuario y contraseña (y leer normativas + test si aplica).
2. **Fichar entrada** (clic en el indicador o desde Fichajes).
3. En la pantalla principal: **Reparación**, **Tuneo** o **Tuneo + Reparación**.
4. **Matrícula** → Continuar (o alta de vehículo si no existe).
5. En la **calculadora**, ajustar modelo, piezas y descuentos.
6. **REGISTRAR TUNEO** o **REGISTRAR REPARACION**.
7. Para otro servicio: **HOME** y repetir desde el paso 3.

Para dudas sobre permisos, precios o convenios, consulta al responsable del taller o usa el **asistente de dudas** (chatbot) para preguntas sobre normativas e instrucciones.

---

## 17. Configuración y despliegue

- **`js/config.js`**: Define la URL del backend para uso local (`API_URL_LOCAL`) y para cuando la app se abre desde GitHub Pages (`API_URL_PRODUCCION`). Los webhooks de Discord (economía, entregas, materiales) se configuran en el backend al desplegarlo.
- **Backend en la nube:** Para que todos los que abran el enlace público compartan los mismos datos (usuarios, fichajes, reparaciones) sin depender de tu PC, despliega la carpeta `server` en un servicio como Render y configura `API_URL_PRODUCCION` con la URL que te den. Instrucciones paso a paso: **[DEPLIEGUE_BACKEND.md](DEPLIEGUE_BACKEND.md)**.
