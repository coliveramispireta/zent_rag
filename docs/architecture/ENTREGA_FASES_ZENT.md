# Entrega — Reorganización de Zent por fases

Estado: fases 0, 1, 1.5, 2, 2.5 y 4 cerradas dentro del Control Center; fase 3
abierta por la integración con Zitadel.

Documento para el equipo backend: qué cambió funcionalmente, qué hay en la base
de datos, qué endpoints existen, qué decisiones se tomaron y qué falta.

Repositorio: `zent_rag` (monolito: API FastAPI + `portal/` React + `ingestion-worker`).
Portal de desarrollo: **http://localhost:8081** · API: **http://localhost:8000**.

---

## 1. Decisión marco

**Zent es un backoffice interno operado solo por personal de Omnio.** Ningún
cliente entra a Zent. La autogestión del cliente llegará después desde apps de
producto (Mentora, OMNIO+, futuras) que consumen Zent por API; lo único que se
deja preparado ahora es la jerarquía **Organización → Aplicación → Agente** y la
posibilidad de que un operador asista esas configuraciones.

Consecuencias directas de esa decisión:

- Todo lo que era self-service del cliente se retiró del portal (fases 1.5).
- El acceso es único: `/control-center/login`, para personal de Omnio.
- Los permisos son **default-deny**: sin fila de permiso, no hay pantalla y no
  hay scope.
- Zitadel queda diferido: la matriz de permisos es independiente del proveedor
  de identidad, la migración a OIDC/SCIM no obliga a rehacer autorización.

---

## 2. Qué cambia funcionalmente

### 2.1 Acceso

- Un solo login (`/control-center/login`). Se eliminaron el enlace y el subtítulo
  de "Portal de clientes".
- `platform_login` acepta a cualquier usuario con `users.is_platform_staff = true`.
  El rol `super_admin` **no** se auto-asigna: solo lo otorga un superadmin.
- Usuarios mock de desarrollo (sin conexión a Zitadel, ver §10.3):

  | Email | Rol inicial |
  |---|---|
  | `admin@omnio.pe` | superadmin |
  | `colivera@omnio.pe` | sin rol (a configurar) |
  | `ppimentel@omnio.pe` | sin rol |
  | `creyes@omnio.pe` | sin rol |
  | `mcamacho@omnio.pe` | sin rol |

  Las contraseñas de desarrollo están definidas en el seed de la migración 178.

### 2.2 Navegación de dos niveles

**Nivel 1 (sidebar principal)** — solo configuración general de la plataforma:
Resumen, Organizaciones, Aplicaciones, Requerimientos, Clientes, Suscripciones,
Ingresos, Partners, Personal, Configuración, Notificaciones, y el grupo de
monitoreo (Uso, Costos de IA, Capacidad, Estado) más operación, plataforma,
seguridad y cumplimiento.

**Nivel 2 (segundo sidebar, dentro del contexto de una organización)**: Resumen,
Agentes, Configuración de IA, Aplicaciones e integraciones, Parámetros, Ingesta de
información, Monitoreo de consumo. Se entra desde `/control-center/org/:orgId` y
la sección activa va en `?seccion=`.

Regla de diseño: **nada de configuración de IA en el Nivel 1**. Gateway de
modelos, motor de decisión, runtime, inferencia, evaluaciones, feedback, flujos,
copiloto, analítica, trazas, salud de modelos, medición, gobierno de costos y
optimizador viven todos en el Nivel 2, dentro de la organización.

El sidebar es un acordeón de **una sola categoría abierta** (abrir una cierra las
demás; volver a clickear la abierta colapsa todo).

### 2.3 Roles y pantallas

- Catálogo de **49 pantallas** (`screens`), cada una con `code`, nombre, categoría
  y ruta. El `code` coincide con la clave del catálogo i18n.
- Roles `admin` y `operador` existen **vacíos**: hay que asignarles pantallas.
- Un usuario sin pantallas ve un estado vacío explícito ("Sin pantallas
  asignadas. Pedile al superadmin que te asigne acceso.").
- Niveles por pantalla: `read` (solo lectura) o `full` (lectura + escritura).
- La pantalla **Personal** (`/control-center/staff`) permite al superadmin asignar
  rol y marcar pantallas por usuario.

### 2.4 Requerimientos de cambio (sustento auditable)

Ninguna escritura de configuración se hace sin sustento. Flujo:

1. Un operador abre un requerimiento (organización, tipo, título, sustento
   obligatorio de 10+ caracteres).
2. **Cualquier** operador puede tomarlo. Al tomarlo recibe un token temporal de
   **2 horas**, que se muestra **una sola vez**.
3. Con ese token puede escribir la configuración **de esa organización**.
4. Al marcar el requerimiento como resuelto (nota obligatoria), el token **muere
   al instante** y el requerimiento queda con su resolución en la auditoría.
5. Si el token vence sin resolver, el requerimiento pasa a `expired`.

El superadmin está **exento** de tomar requerimiento, pero sus cambios igual
quedan auditados (con `change_request_id` en `null`).

### 2.5 Consumo en créditos y presupuesto

- Se **miden tokens reales** (`usage_events`) y se **factura en créditos** con una
  tabla de tarifas por modelo (`model_rates`).
- Ventana del período: **mes calendario en America/Lima** (corte a las 00:00 del
  día 1, que en UTC es `T05:00:00Z`).
- Presupuesto: **mensual por organización**, con umbral de alerta (80 % por
  defecto) y bloqueo al 100 %.
- Estados de presupuesto: `ok`, `alerta`, `bloqueado`, `sin_presupuesto`.
- Al cruzar el umbral se registra el aviso **una sola vez por período** en la
  auditoría (`platform.organization_budget_alert`).
- El desglose por modelo, por aplicación y por agente es informativo; el
  presupuesto no se reparte entre ellos.

---

## 3. Base de datos

Migraciones nuevas (cadena `alembic`, head actual **184**):

| Revisión | Archivo | Qué hace |
|---|---|---|
| **177** | `177_applications.py` | Tabla `applications`; `api_keys.application_id`, `usage_events.application_id`, `audit_logs.application_id` + índices |
| **178** | `178_internal_staff_screens.py` | `screens`, `platform_role_screens`, `user_screen_permissions`; `users.is_platform_staff`; constraint relajada para personal sin organización; seed de staff (solo development/test/local) |
| **179** | `179_applications_screen.py` | Registra la pantalla "Aplicaciones" |
| **180** | `180_screen_permissions.py` | `screens.permissions` (lectura) y `screens.write_permissions` (solo con acceso total); mapa de 35 pantallas del Nivel 1 |
| **181** | `181_feature_flags.py` | Tabla `client_flags` (banderas en runtime) |
| **182** | `182_drop_client_flags.py` | Elimina `client_flags` y el mecanismo completo (las rutas de cliente ya no existían) |
| **183** | `183_change_requests.py` | Tabla `change_requests` + pantalla "Requerimientos" |
| **184** | `184_consumption_budget.py` | `model_rates` (con fila `__default__` y tarifas iniciales) y `organization_budgets` |

### 3.1 `applications`

Origen técnico del acceso. **No** se reutiliza `partners`:

- `partners` = relación comercial / rev-share.
- `applications` = de dónde viene la llamada.

Un partner puede tener varias aplicaciones, y una aplicación puede no tener
partner. El "acceso directo" del PDF se modela como `api_keys.application_id NULL`.

Columnas: `code` (único), `name`, `kind`, `status` (`active|suspended|retired`),
`partner_id` (nullable), `description`, `config_json`, timestamps.

### 3.2 `change_requests`

```
id                  UUID PK
organization_id     UUID NOT NULL -> organizations
kind                VARCHAR(30)         -- agent_create | agent_config | integration | parameters | other
title, description  VARCHAR(200), TEXT  -- sustento obligatorio
scopes              JSONB               -- scopes habilitados por el token
status              VARCHAR(20)         -- open | taken | resolved | cancelled | expired
opened_by / taken_by / resolved_by  UUID -> users
taken_at / resolved_at              TIMESTAMPTZ
grant_token_hash    VARCHAR(64)         -- SHA-256 del token; NUNCA se guarda en claro
grant_expires_at    TIMESTAMPTZ
revoked_at          TIMESTAMPTZ
resolution_note     TEXT
```

Índices: `(organization_id, status)` y parcial sobre `grant_token_hash`.

### 3.3 `organization_budgets` y `model_rates`

`organization_budgets`: `organization_id` PK, `monthly_credits NUMERIC(14,2)`,
`alert_threshold NUMERIC(4,3)` (0.8), `block_on_limit BOOLEAN` (true),
`alert_sent_at`, `blocked_at`, `updated_by`, `updated_at`.

`model_rates`: `model` PK, `input_credits_per_1k`, `output_credits_per_1k`,
`embedding_credits_per_1k`, `updated_at`. La fila `__default__` es el respaldo
para modelos sin tarifa propia.

Fórmula de créditos (idéntica en el detalle y en el listado global):

```
créditos = prompt_tokens/1000      * input_credits_per_1k
         + completion_tokens/1000  * output_credits_per_1k
         + embedding_tokens/1000   * embedding_credits_per_1k
```

Se resuelve con `LEFT JOIN model_rates r ON r.model = ue.model` y `COALESCE`
contra `__default__`, así que **un modelo nuevo nunca queda sin costo** y cambiar
tarifas **no altera lo ya medido**.

---

## 4. Autorización

### 4.1 Fuentes de permiso

- `platform_role_screens`: pantallas por rol.
- `user_screen_permissions`: pantallas por usuario (`read` | `full`).
- `screens.permissions`: scopes que otorga la pantalla en lectura.
- `screens.write_permissions`: scopes extra que solo se otorgan con `full`.

El nivel efectivo por pantalla es `MAX` con **ranking** (`full` > `read`), no
`MAX()` sobre texto: `'read' > 'full'` alfabéticamente y ese bug ya se corrigió
una vez.

`TenantMiddleware` suma a la **sesión de plataforma** los scopes de las pantallas
asignadas. El camino del tenant no se toca.

### 4.2 Guard de requerimiento

`src/api/security.py::require_change_grant(request, organization_id)`:

- Exento si el contexto tiene `super_admin` o `admin:*`.
- Si no, lee `X-Change-Token`, lo valida contra `organization_id` (hash, estado
  `taken`, no vencido) y devuelve el `request_id`.
- Si no hay grant: **403 `change_grant_required`**.

El `request_id` se escribe en el `metadata` JSON de `audit_logs`. No se agregó
columna `change_request_id`: el metadata ya es JSONB y es consultable.

Está aplicado hoy en:

- `PUT /platform/organizations/{id}/parameters`
- `PATCH /platform/api-keys/{key_id}/application`
- `PUT /platform/organizations/{id}/budget`

---

## 5. API nueva (Nivel 1 y Nivel 2)

| Método | Ruta | Permiso | Notas |
|---|---|---|---|
| GET | `/api/v1/platform/me/screens` | sesión de plataforma | Pantallas y scopes del usuario; se carga en login y refresh |
| GET | `/api/v1/platform/screens` | `platform.users.manage` | Catálogo de 49 pantallas |
| GET | `/api/v1/platform/staff` | `platform.users.manage` | Solo personal interno real |
| POST | `/api/v1/platform/staff` | `platform.users.manage` + **step-up** | Alta de usuario interno |
| PUT | `/api/v1/platform/staff/{id}/screens` | `platform.users.manage` | Asigna pantallas y niveles |
| GET | `/api/v1/platform/role-screens` | `platform.users.manage` | Pantallas por rol |
| PUT | `/api/v1/platform/roles/{role}/screens` | `platform.users.manage` | Edita pantallas del rol |
| GET | `/api/v1/platform/applications` | `tenant.read` | Catálogo de aplicaciones |
| POST | `/api/v1/platform/applications` | `platform.settings.manage` | Alta; `code` único (409 si se repite) |
| PATCH | `/api/v1/platform/applications/{app_id}` | `platform.settings.manage` | Editar / suspender / retirar |
| GET | `/api/v1/platform/organizations/{id}/applications` | `tenant.read` | Aplicaciones por las que consume la organización |
| GET | `/api/v1/platform/organizations/{id}/parameters` | `tenant.read` | Parámetros efectivos |
| PUT | `/api/v1/platform/organizations/{id}/parameters` | `tenant.write` | **Exige grant** |
| PATCH | `/api/v1/platform/api-keys/{key_id}/application` | `tenant.write` | **Exige grant** |
| GET | `/api/v1/platform/change-requests` | `tenant.read` | Filtra por `?organization_id=` |
| POST | `/api/v1/platform/change-requests` | `tenant.read` | Abre requerimiento |
| POST | `/api/v1/platform/change-requests/{id}/take` | `tenant.read` | Devuelve el token en claro una vez |
| POST | `/api/v1/platform/change-requests/{id}/release` | `tenant.read` | Vuelve a `open` y revoca el token |
| POST | `/api/v1/platform/change-requests/{id}/resolve` | `tenant.read` (solo quien tomó, o superadmin) | Revoca el token |
| GET | `/api/v1/platform/organizations/{id}/budget` | `tenant.read` | Consumo + presupuesto + desgloses |
| PUT | `/api/v1/platform/organizations/{id}/budget` | `tenant.write` | **Exige grant** |
| GET | `/api/v1/platform/consumption/overview` | `tenant.read` | Todas las organizaciones + totales |
| GET | `/api/v1/platform/model-rates` | `tenant.read` | Tarifas vigentes |
| PUT | `/api/v1/platform/model-rates/{model}` | `tenant.write` | Tarifa global (no es por organización, no usa grant) |

### 5.1 Contrato del token temporal

```
POST /api/v1/platform/change-requests/{id}/take
200 {"request_id": "...", "token": "cr_<48 hex>", "expires_at": "...", "ttl_hours": 2}
409 {"detail": "El requerimiento no está disponible"}
```

```
PUT /api/v1/platform/organizations/{id}/parameters
Headers: Authorization: Bearer <sesión>, X-Change-Token: cr_...
403 {"error_code": "change_grant_required", "message": "Necesitás tomar un requerimiento para modificar la configuración."}
```

El token **no se puede recuperar**: solo se guarda su SHA-256. Si se pierde, hay
que liberar el requerimiento (`release`) y volver a tomarlo.

---

## 6. Frontend

Rutas y piezas nuevas o reescritas (`portal/src`):

| Pieza | Rol |
|---|---|
| `lib/i18n/es.ts` + `t()` | Catálogo tipado (`MessageKey`); hoy cubre solo navegación |
| `lib/nav.ts` | Navegación del portal del tenant, 52 etiquetas al catálogo |
| `lib/platformNav.ts` | 7 grupos / 48 ítems del Nivel 1, default-deny por pantalla |
| `lib/orgSections.ts` | 7 secciones del Nivel 2, activa en `?seccion=` |
| `lib/format.ts` | `dd/mm/aaaa` y `dd/mm/aaaa HH:mm` (24 h, es-PE) |
| `lib/changeGrant.ts` | Grant en `sessionStorage` (nunca `localStorage`) |
| `pages/admin/Staff.tsx` | Rol + grilla de 49 pantallas por categoría |
| `pages/admin/Applications.tsx` | Catálogo de aplicaciones |
| `pages/admin/ChangeRequests.tsx` | Pantalla Requerimientos (abrir, tomar, resolver) |
| `pages/admin/OrgContext.tsx` | Contexto de organización con segundo sidebar |
| `components/org/ChangeGrantBar.tsx` | Barra "Solo lectura" / sesión activa con tiempo restante |
| `components/org/OrgBudget.tsx` | Presupuesto y desglose del período |
| `components/admin/ConsumptionCredits.tsx` | Consumo global + editor de tarifas (pantalla Uso) |
| `components/shell/AppSidebar.tsx` | Acordeón de una sola categoría + buscador en español |
| `scripts/find-english-text.mjs` | Detector de literales en inglés (`npm run i18n:scan`) |

**Archivos borrados** (self-service del cliente): `pages/Signup`, `Onboarding`,
`TeamAccess`, `Projects`, `Workspaces`, `Billing`, `pages/Login` (+ test),
`onboarding/StartMode` (+ test), `onboarding/TransitionWizard`.

---

## 7. Cambios fuera del Control Center

Importante para quien toque la API del producto:

1. **Columnas aditivas**: `api_keys.application_id`, `usage_events.application_id`,
   `audit_logs.application_id` son nullable. `usage_events.application_id` ya está
   indexado junto a organización y fecha.
2. **Rate limit de login** (`src/api/routes/auth.py`): cuenta por IP **y** por
   email, 10 fallos / 15 min tras el ajuste. Estaba en 5 y bloqueaba a todo el
   equipo porque, sin `RAG_TRUSTED_PROXIES`, todos los logins llegaban con la IP
   del contenedor `portal`.
   - Variables: `RAG_TRUSTED_PROXIES` (`127.0.0.1,::1,172.16.0.0/12` en dev) y
     `RAG_AUTH_LOGIN_MAX_ATTEMPTS`.
   - Limpieza manual:
     `docker exec rag-redis redis-cli -a <pass> DEL "auth:fail:ip:<ip>" "auth:fail:email:<email>"`.
   - Ojo: `_client_ip()` acepta el primer `X-Forwarded-For` si hay proxies
     configurados; un cliente puede falsear su IP. El límite por email sigue
     protegiendo la cuenta.
3. **Navegación y formato del portal del tenant** (`/agents`, `/knowledge`,
   `/chat`): siguen vivos y comparten `lib/nav.ts`, `lib/format.ts` y el sidebar,
   así que los cambios de idioma y de acordeón también les aplican.
4. **Bloqueo de presupuesto**: `is_blocked(organization_id)` existe en
   `src/platform/consumption/budget.py`, pero **todavía no se invoca** en
   `/rag/query` ni en `/rag/query/stream`.

---

## 8. Operación

```bash
# levantar / reconstruir (el API corre migraciones al arrancar, tarda ~40 s)
docker compose up -d --build api
docker compose up -d --build portal

# verificar que el bundle servido tiene el código nuevo
docker exec rag-portal sh -c "grep -o 'Presupuesto de consumo' /usr/share/nginx/html/assets/*.js | head -1"
```

Reglas aprendidas:

- **Antes de crear una migración**: `alembic heads`. Ya hubo colisión en 174/175.
- Los IDs de rol **no son fijos** en la base; usar `RETURNING` o `SELECT` por
  nombre, nunca UUID hardcodeados (rompió la 178 con `UniqueViolationError`).
- No correr `alembic upgrade` desde el host: `.env` tiene variables que
  `Settings` (con `extra_forbidden`) rechaza. Siempre dentro del contenedor.
- Cualquier cambio de frontend exige **rebuild** del contenedor `portal`; el nginx
  sirve el build estático.
- Para mensajes de commit con acentos en Windows, pasar el mensaje por archivo
  UTF-8 (`git commit -F archivo`); `echo`/here-string desde PowerShell los rompe.

---

## 9. Verificación ejecutada

- **Requerimientos**: sin token → `403 change_grant_required`; con token → 200;
  tras resolver → 403 otra vez (probado con `colivera@omnio.pe`, usuario con
  `tenant.write` y sin `super_admin`).
- **Créditos**: evento sintético de 800 000 tokens en `gpt-4o` → 4 250 créditos,
  85 % de un presupuesto de 5 000, estado `alerta`, aviso registrado una vez y no
  duplicado en el segundo `GET`.
- **Overview**: 74 organizaciones, la que está en alerta ordenada primero.
- **Tarifas**: `PUT /model-rates/gpt-4o` persistido y auditado.
- `ruff`, `eslint`, `tsc --noEmit` y los tests de `platformNav` +
  `components/org` en verde.

---

## 10. Pendientes

### 10.1 Bloqueo en la ruta de consultas (Fase 4)

Aplazar la decisión del producto: determinar si al 100 % se responde 429, y con
qué mensaje. Implementación prevista:

```python
from src.platform.consumption.budget import is_blocked
if await is_blocked(ctx.tenant_id):
    raise HTTPException(429, {"error_code": "budget_exhausted",
                              "message": "La organización agotó su presupuesto de créditos."})
```

Aplicar en `/rag/query` y `/rag/query/stream`, después de autenticar y antes de
llamar al modelo. Criterio de aceptación: organización en `bloqueado` → 429;
organización en `alerta` → 200; subir el presupuesto con un requerimiento
desbloquea de inmediato (hoy `set_budget` ya limpia `blocked_at`).

### 10.2 Enforcement en agentes (Fase 2.5)

Falta que crear o modificar un agente exija requerimiento. **Bloqueado**: no hay
endpoints de escritura de agentes. Cuando existan, aplicar `require_change_grant`
y guardar `change_request_id` en la auditoría.

### 10.3 Zitadel (Fase 3)

Decidir **OIDC** (login) vs **SCIM** (provisión de usuarios y grupos). Hoy los
usuarios y contraseñas son mock. La matriz de permisos no depende del proveedor:
al integrar, solo hay que mapear grupos de Zitadel a roles y pantallas.

### 10.4 Alta de usuario en Personal

`POST /platform/staff` ya existe; falta el formulario en
`/control-center/staff`.

### 10.5 Deuda técnica

- **i18n**: los ~800 literales quedaron inline en el JSX; el catálogo solo cubre
  navegación. Migrarlos es mecánico pero extenso.
- **`pages/Settings.tsx`** sigue en el repo, aunque ya es inalcanzable.
- **Portal del tenant** (`/agents`, `/knowledge`, `/chat`): decidir si se congela,
  se migra al Nivel 2 o se elimina cuando existan los endpoints de agentes.
- **Claves de API existentes**: revisar si todas tienen `application_id` o
  quedaron como acceso directo (`NULL`), y si eso es lo esperado.
- **`_client_ip()`** no valida que el peer esté en `RAG_TRUSTED_PROXIES`; solo que
  la lista no esté vacía. Endurecerlo cuando haya proxies reales.
- **Notificaciones de presupuesto**: hoy el aviso queda en la auditoría y en la
  UI. No hay envío por correo/Slack porque no existe esa infraestructura.

---

## 11. Mapa de código

```
src/
  api/
    security.py                  require_change_grant()
    routes/platform.py           rutas de plataforma (staff, screens, applications,
                                 change-requests, budget, model-rates)
    routes/auth.py               platform_login + rate limit por IP/email
  platform/
    rbac/repo.py                 pantallas, roles, personal, scopes efectivos
    applications/repo.py         catálogo de aplicaciones
    change_requests/service.py   ciclo del requerimiento y validación del token
    consumption/budget.py        créditos, período, presupuesto, avisos, tarifas
  infrastructure/db_init/versions/177..184
portal/src/
  lib/{i18n,nav,platformNav,orgSections,format,changeGrant}
  components/{org,admin,shell}
  pages/admin/{Staff,Applications,ChangeRequests,OrgContext,Usage,...}
docs/platform/
  PLAN_REORGANIZACION_ZENT.md    plan maestro por fases
  GLOSARIO_ZENT.md               terminología y formatos regionales
  ENTREGA_FASES_ZENT.md          este documento
```

Commits de referencia: `bb2bfea9` (fases 0/1), `cd73e25f` (fases 2 y 3),
`0fbef9db` (2.5), `4512bd29` y `d809c99d` (4).
