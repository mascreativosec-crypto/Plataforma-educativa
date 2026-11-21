# BRIEF DE CONSTRUCCIÓN — ALLEN Aula (plataforma de clases tipo Moodle)

> **Este documento es la única fuente de verdad.** Si algo no está especificado aquí,
> el agente **pregunta antes de inventar**.
>
> - **Destinatario:** agente constructor (Google AI Studio / Gemini).
> - **Autor:** Ferax Partner. **Fecha:** 19-nov-2026. **Versión:** 1.0.
> - **Producto:** app independiente `ALLEN Aula`, que se integra con el CRM `ALLEN` existente.
> - **Alcance de este brief:** MVP (Fases 0 a 2). Fases 3 y 4 son referencia, no se construyen aún.

---

## 0. Mensaje para abrir la conversación

```text
Vas a construir "ALLEN Aula", una plataforma de clases en línea (tipo Moodle) para una
academia de inglés en Ecuador. Es una app NUEVA e INDEPENDIENTE que se integra con un CRM
existente llamado ALLEN (NestJS + Next.js + PostgreSQL), que NO vas a modificar.

Lee completo el documento adjunto "BRIEF DE CONSTRUCCIÓN — ALLEN Aula". Ese documento
manda. Respeta el stack exacto (TypeScript, NestJS 10, Next.js 14, Prisma 5, PostgreSQL 16,
Tailwind). No instales librerías de componentes. No inventes tablas de estudiantes,
contratos ni pagos: esos datos son propiedad del CRM y se consultan por API.

Antes de escribir código, devuélveme:
1) el árbol de carpetas que vas a crear,
2) el schema.prisma completo,
3) la lista de endpoints con su rol autorizado.

Trabaja por fases. Al terminar cada fase, entrega: código, migraciones, `.env.example`,
y una lista de comprobaciones manuales para verificar que funciona.
```

---

## 1. Misión y alcance

Construir una **plataforma de impartición de clases** donde:

- el **profesor** publica cursos, unidades, lecciones, material (PDF/video/enlace),
  tareas y quizzes;
- el **estudiante** entra, consume el contenido, entrega tareas, rinde quizzes y ve su progreso;
- la **nota** de una evaluación vuelve al libro oficial de calificaciones del CRM ALLEN;
- la **matrícula** (quién está en qué curso) llega desde ALLEN, no se inventa en el Aula.

### Lo que NO es este proyecto

- No es un CRM. No gestiona contratos, cobros, caja, nómina, leads ni quejas.
- No reemplaza la clase presencial ni la asistencia: eso sigue viviendo en ALLEN.
- No es un Moodle instalado ni un plugin de Moodle. **No se escribe PHP.**

### Frontera de datos (regla no negociable)

| Dato | Vive en | Quién escribe |
|---|---|---|
| Empresa/tenant, usuario, rol, permisos | ALLEN | solo ALLEN |
| Estudiante, contrato, matrícula, horario, clase, asistencia | ALLEN | solo ALLEN |
| Curso, unidad, lección, material, tarea, entrega, quiz, progreso, anuncio | **Aula** | solo el Aula |
| **Nota oficial** | ALLEN (`contenido_ficha`) | ALLEN la guarda; el Aula la **envía** por API |

**Prohibido:** escribir directamente en la base de datos de ALLEN. Toda comunicación es por
HTTP contra su API. Aunque se use el mismo servidor PostgreSQL, son **dos bases separadas**.

---

## 2. Lenguaje y stack obligatorio

**Lenguaje: TypeScript, en todo el proyecto.** Backend y frontend. Sin excepciones.

| Componente | Obligatorio | Versión | Notas |
|---|---|---|---|
| Lenguaje | **TypeScript** | 5.6.x | `strict: true` |
| Runtime | **Node.js** | 20 LTS (API) / 22 (web build) | no usar Deno ni Bun |
| Backend | **NestJS** | 10.4.x | misma arquitectura que ALLEN |
| ORM | **Prisma** | 5.20.x | migraciones versionadas |
| Base de datos | **PostgreSQL** | 16 | base `allen_aula` |
| Frontend | **Next.js** (App Router) | 14.2.5 | React 18.3.1 |
| Estilos | **Tailwind CSS** | 3.4.x | sin librería de componentes |
| Auth | `@nestjs/jwt` + `passport-jwt` | compatibles Nest 10 | HS256 |
| Validación | `class-validator` + `class-transformer` | 0.14 / 0.5 | `whitelist` + `forbidNonWhitelisted` |
| Seguridad HTTP | `helmet` | 8.x | + `@nestjs/throttler` 6.x |
| Hash | `bcryptjs` | 2.4.x | solo para códigos de acceso de estudiantes |
| Archivos | `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` | v3 | S3/MinIO/R2 |
| PDF | `pdfkit` | 0.20.x | certificados (fase 3) |
| Fechas | `date-fns` + `date-fns-tz` | última estable | zona `America/Guayaquil` |
| Test | `jest` + `@nestjs/testing` | — | mínimo servicios críticos |
| Contenedores | Docker multi-stage | — | igual que ALLEN |

### Prohibiciones de stack

- ❌ PHP, Python, Go, Java, Ruby (el stack es uno solo: TypeScript).
- ❌ MySQL/MariaDB, MongoDB, SQLite en producción (solo PostgreSQL 16).
- ❌ TypeORM, Sequelize, Drizzle, Mongoose (el ORM es Prisma).
- ❌ MUI, Chakra, Ant Design, shadcn/ui, Mantine, Bootstrap, styled-components.
- ❌ Redux, MobX, Zustand, Recoil (estado con React Context + `fetch`).
- ❌ Firebase, Supabase, Vercel Postgres, PlanetScale.
- ❌ Prisma `$queryRaw` sin justificación escrita y sin parámetros enlazados.

---

## 3. Arquitectura

```text
Navegador
   ├─ appallen.feraxpartner.com  → ALLEN web   → ALLEN api   (existente, NO se toca)
   └─ aula.feraxpartner.com      → Aula web    → Aula api    (lo que se construye)
                                                      │
                                        PostgreSQL 16 (mismo servidor)
                                          · base allen       (solo ALLEN)
                                          · base allen_aula  (solo Aula)
                                        Almacenamiento S3-compatible (MinIO/R2)
                                        Caddy ya existente enruta los subdominios
```

Reglas:

1. El Aula **no** lee ni escribe la base de ALLEN.
2. El Aula **sí** llama a la API de ALLEN (solo lectura + dos escrituras: entregar nota, y
   notificar eventos).
3. Cada tabla del Aula lleva `tenant_id`. **Toda** consulta filtra por `tenantId` del token.
   Un `findUnique({ id })` sin `tenantId` es un bug de seguridad.
4. Los IDs de entidades de ALLEN (`estudianteId`, `horarioId`, `claseId`) se guardan como
   `uuid` **sin foreign key** (bases distintas). Son referencias, no relaciones.

---

## 4. Estructura del repositorio

```text
allen-aula/
├─ package.json                  (workspaces: api, web, shared)
├─ docker-compose.yml            (solo desarrollo local)
├─ .env.example
├─ README.md
├─ api/
│  ├─ Dockerfile
│  ├─ package.json
│  ├─ prisma/
│  │  ├─ schema.prisma
│  │  ├─ migrations/
│  │  └─ seed.ts
│  └─ src/
│     ├─ main.ts
│     ├─ app.module.ts
│     ├─ common/
│     │  ├─ prisma.service.ts
│     │  ├─ auth/ (jwt.strategy.ts, guards, decorators)
│     │  ├─ filtros/ (all-exceptions.filter.ts)
│     │  ├─ integracion/ (hmac.guard.ts, outbox.service.ts)
│     │  └─ storage/ (storage.service.ts)
│     ├─ auth/          (SSO ticket, canje, sesión de estudiante)
│     ├─ cursos/
│     ├─ unidades/
│     ├─ lecciones/
│     ├─ materiales/
│     ├─ tareas/
│     ├─ entregas/
│     ├─ quizzes/
│     ├─ progreso/
│     ├─ anuncios/
│     └─ integracion/   (endpoints que consume ALLEN)
└─ web/
   ├─ Dockerfile
   ├─ package.json
   └─ src/
      ├─ app/
      │  ├─ (auth)/entrar/page.tsx
      │  ├─ (aula)/mis-cursos/page.tsx
      │  ├─ (aula)/cursos/[id]/page.tsx
      │  ├─ (aula)/cursos/[id]/lecciones/[leccionId]/page.tsx
      │  ├─ (aula)/cursos/[id]/tareas/page.tsx
      │  ├─ (aula)/cursos/[id]/entregas/page.tsx
      │  ├─ (aula)/cursos/[id]/calificaciones/page.tsx
      │  ├─ (aula)/estudiante/[id]/page.tsx
      │  └─ (docente)/docente/cursos/page.tsx
      ├─ components/
      ├─ lib/ (api.ts, auth.tsx, niveles.ts)
      └─ styles/
```

---

## 5. Convenciones de código (obligatorias)

- **Idioma del dominio en español** (`Curso`, `Leccion`, `Tarea`, `Entrega`), igual que ALLEN.
  Nombres de clases y campos en español; palabras técnicas en inglés.
- Archivos en `kebab-case` (`cursos.service.ts`), clases en `PascalCase`, variables en `camelCase`.
- Un módulo Nest por entidad: `controller` + `service` + `module` + `dto/`.
- DTOs con `class-validator`. Ningún campo entra sin DTO.
- Respuestas de error: `HttpException` con mensaje **en español, legible por el usuario**.
- Lógica de permisos en guards, nunca en el controller.
- Fechas en UTC en base de datos; se formatean a `America/Guayaquil` solo en la UI.
- Sin `any` implícito. Sin `@ts-ignore`. Sin `console.log` en producción (usar `Logger`).
- Comentarios solo donde la intención no es obvia. No comentar lo evidente.

---

## 6. Modelo de datos (`api/prisma/schema.prisma`)

Entregar exactamente esta forma (ajustes solo con justificación escrita).

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum EstadoCurso {
  BORRADOR
  PUBLICADO
  ARCHIVADO
}

enum EstadoInscripcion {
  ACTIVO
  RETIRADO
  FINALIZADO
}

enum TipoMaterial {
  PDF
  VIDEO
  ENLACE
  IMAGEN
  AUDIO
}

enum EstadoEntrega {
  PENDIENTE
  ENTREGADO
  TARDIO
  CALIFICADO
  DEVUELTO
}

enum TipoPregunta {
  OPCION_MULTIPLE
  VERDADERO_FALSO
  RESPUESTA_CORTA
}

enum EstadoIntento {
  EN_CURSO
  ENVIADO
  CALIFICADO
}

enum EstadoProgreso {
  NO_INICIADA
  EN_PROGRESO
  COMPLETADA
}

enum EstadoEvento {
  PENDIENTE
  ENVIADO
  FALLIDO
}

/// Espejo de solo lectura de la empresa de ALLEN. Se crea/actualiza al vuelo.
model TenantRef {
  id            String   @id @db.Uuid
  nombre        String?  @db.VarChar(200)
  subdominio    String?  @db.VarChar(100)
  actualizadoEn DateTime @updatedAt @map("actualizado_en")

  @@map("tenant_ref")
}

/// Espejo de solo lectura del estudiante de ALLEN. NUNCA se edita desde el Aula.
model EstudianteRef {
  id             String   @id @db.Uuid
  tenantId       String   @map("tenant_id") @db.Uuid
  nombres        String   @db.VarChar(150)
  apellidos      String   @db.VarChar(150)
  numeroContrato String?  @map("numero_contrato") @db.VarChar(40)
  email          String?  @db.VarChar(200)
  estado         String   @default("ACTIVO") @db.VarChar(20)
  actualizadoEn  DateTime @updatedAt @map("actualizado_en")

  inscripciones InscripcionCurso[]
  entregas      Entrega[]
  intentos      IntentoQuiz[]
  progresos     ProgresoLeccion[]
  accesos       AccesoEstudiante[]

  @@index([tenantId])
  @@map("estudiante_ref")
}

/// Credencial propia del Aula para el alumno (en ALLEN el estudiante no es usuario).
model AccesoEstudiante {
  id              String    @id @default(uuid()) @db.Uuid
  tenantId        String    @map("tenant_id") @db.Uuid
  estudianteId    String    @map("estudiante_id") @db.Uuid
  identificador   String    @db.VarChar(40)          // cédula o código interno
  codigoHash      String    @map("codigo_hash")      // bcrypt del código de 6 dígitos
  activo          Boolean   @default(true)
  debeCambiar     Boolean   @default(true) @map("debe_cambiar")
  intentosFallidos Int      @default(0) @map("intentos_fallidos")
  bloqueadoHasta  DateTime? @map("bloqueado_hasta")
  ultimoAcceso    DateTime? @map("ultimo_acceso")
  createdAt       DateTime  @default(now()) @map("created_at")

  estudiante EstudianteRef @relation(fields: [estudianteId], references: [id], onDelete: Cascade)

  @@unique([tenantId, identificador])
  @@map("acceso_estudiante")
}

model Curso {
  id              String      @id @default(uuid()) @db.Uuid
  tenantId        String      @map("tenant_id") @db.Uuid
  nombre          String      @db.VarChar(200)
  descripcion     String?     @db.Text
  nivel           String?     @db.VarChar(20)   // A1 A2 B1 B2 C1 C2 KIDS CAMBRIDGE
  portadaUrl      String?     @map("portada_url") @db.Text
  estado          EstadoCurso @default(BORRADOR)
  horarioId       String?     @map("horario_id") @db.Uuid  // ref ALLEN.Horario (sin FK)
  profesorId      String?     @map("profesor_id") @db.Uuid // ref ALLEN.Usuario (sin FK)
  profesorNombre  String?     @map("profesor_nombre") @db.VarChar(150)
  fechaInicio     DateTime?   @map("fecha_inicio") @db.Date
  fechaFin        DateTime?   @map("fecha_fin") @db.Date
  creadoPorId     String      @map("creado_por_id") @db.Uuid
  creadoPorNombre String      @map("creado_por_nombre") @db.VarChar(150)
  createdAt       DateTime    @default(now()) @map("created_at")
  updatedAt       DateTime    @updatedAt @map("updated_at")

  unidades      Unidad[]
  inscripciones InscripcionCurso[]
  tareas        Tarea[]
  anuncios      Anuncio[]

  @@index([tenantId, estado])
  @@index([tenantId, horarioId])
  @@map("curso")
}

model InscripcionCurso {
  id           String            @id @default(uuid()) @db.Uuid
  tenantId     String            @map("tenant_id") @db.Uuid
  cursoId      String            @map("curso_id") @db.Uuid
  estudianteId String            @map("estudiante_id") @db.Uuid
  estado       EstadoInscripcion @default(ACTIVO)
  origen       String            @default("ALLEN") @db.VarChar(20) // ALLEN | MANUAL
  fechaAlta    DateTime          @default(now()) @map("fecha_alta")
  fechaBaja    DateTime?         @map("fecha_baja")

  curso      Curso         @relation(fields: [cursoId], references: [id], onDelete: Cascade)
  estudiante EstudianteRef @relation(fields: [estudianteId], references: [id], onDelete: Cascade)

  @@unique([cursoId, estudianteId])
  @@index([tenantId, estudianteId])
  @@map("inscripcion_curso")
}

model Unidad {
  id          String  @id @default(uuid()) @db.Uuid
  tenantId    String  @map("tenant_id") @db.Uuid
  cursoId     String  @map("curso_id") @db.Uuid
  orden       Int
  titulo      String  @db.VarChar(200)
  descripcion String? @db.Text

  curso    Curso     @relation(fields: [cursoId], references: [id], onDelete: Cascade)
  lecciones Leccion[]

  @@unique([cursoId, orden])
  @@map("unidad")
}

model Leccion {
  id          String   @id @default(uuid()) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  unidadId    String   @map("unidad_id") @db.Uuid
  orden       Int
  titulo      String   @db.VarChar(200)
  contenido   String?  @db.Text        // HTML saneado del docente
  publicada   Boolean  @default(false)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  unidad    Unidad             @relation(fields: [unidadId], references: [id], onDelete: Cascade)
  materiales Material[]
  tareas    Tarea[]
  quizzes   Quiz[]
  progresos ProgresoLeccion[]

  @@unique([unidadId, orden])
  @@map("leccion")
}

model Material {
  id           String       @id @default(uuid()) @db.Uuid
  tenantId     String       @map("tenant_id") @db.Uuid
  leccionId    String       @map("leccion_id") @db.Uuid
  tipo         TipoMaterial
  titulo       String       @db.VarChar(200)
  descripcion  String?      @db.Text
  url          String       @db.Text      // clave S3 o URL externa
  mimeType     String?      @map("mime_type") @db.VarChar(120)
  tamanoBytes  BigInt?      @map("tamano_bytes")
  orden        Int          @default(0)
  createdAt    DateTime     @default(now()) @map("created_at")

  leccion Leccion @relation(fields: [leccionId], references: [id], onDelete: Cascade)

  @@index([tenantId, leccionId])
  @@map("material")
}

model Tarea {
  id                  String   @id @default(uuid()) @db.Uuid
  tenantId            String   @map("tenant_id") @db.Uuid
  cursoId             String   @map("curso_id") @db.Uuid
  leccionId           String?  @map("leccion_id") @db.Uuid
  titulo              String   @db.VarChar(200)
  instrucciones       String?  @db.Text
  notaMaxima          Float    @default(100) @map("nota_maxima")
  abreEn              DateTime? @map("abre_en")
  venceEn             DateTime? @map("vence_en")
  permiteTardio       Boolean  @default(false) @map("permite_tardio")
  publicada           Boolean  @default(false)
  createdAt           DateTime @default(now()) @map("created_at")

  curso    Curso     @relation(fields: [cursoId], references: [id], onDelete: Cascade)
  leccion  Leccion?  @relation(fields: [leccionId], references: [id], onDelete: SetNull)
  entregas Entrega[]

  @@index([tenantId, cursoId])
  @@map("tarea")
}

model Entrega {
  id            String        @id @default(uuid()) @db.Uuid
  tenantId      String        @map("tenant_id") @db.Uuid
  tareaId       String        @map("tarea_id") @db.Uuid
  estudianteId  String        @map("estudiante_id") @db.Uuid
  archivoUrl    String?       @map("archivo_url") @db.Text
  comentario    String?       @db.Text
  estado        EstadoEntrega @default(PENDIENTE)
  nota          Float?
  feedback      String?       @db.Text
  calificadoPor String?       @map("calificado_por") @db.Uuid
  calificadoEn  DateTime?     @map("calificado_en")
  entregadoEn   DateTime?     @map("entregado_en")
  createdAt     DateTime      @default(now()) @map("created_at")
  updatedAt     DateTime      @updatedAt @map("updated_at")

  tarea      Tarea         @relation(fields: [tareaId], references: [id], onDelete: Cascade)
  estudiante EstudianteRef @relation(fields: [estudianteId], references: [id], onDelete: Cascade)

  @@unique([tareaId, estudianteId])
  @@index([tenantId, estudianteId])
  @@map("entrega")
}

model Quiz {
  id             String   @id @default(uuid()) @db.Uuid
  tenantId       String   @map("tenant_id") @db.Uuid
  leccionId      String   @map("leccion_id") @db.Uuid
  titulo         String   @db.VarChar(200)
  intentosMax    Int      @default(1) @map("intentos_max")
  notaMinima     Float    @default(70) @map("nota_minima")
  publicada      Boolean  @default(false)
  createdAt      DateTime @default(now()) @map("created_at")

  leccion   Leccion     @relation(fields: [leccionId], references: [id], onDelete: Cascade)
  preguntas Pregunta[]
  intentos  IntentoQuiz[]

  @@index([tenantId, leccionId])
  @@map("quiz")
}

model Pregunta {
  id               String       @id @default(uuid()) @db.Uuid
  quizId           String       @map("quiz_id") @db.Uuid
  orden            Int
  enunciado        String       @db.Text
  tipo             TipoPregunta
  opciones         Json?        // ["a","b","c"] solo OPCION_MULTIPLE
  respuestaCorrecta Json        @map("respuesta_correcta")
  puntos           Float        @default(1)

  quiz Quiz @relation(fields: [quizId], references: [id], onDelete: Cascade)

  @@unique([quizId, orden])
  @@map("pregunta")
}

model IntentoQuiz {
  id           String        @id @default(uuid()) @db.Uuid
  tenantId     String        @map("tenant_id") @db.Uuid
  quizId       String        @map("quiz_id") @db.Uuid
  estudianteId String        @map("estudiante_id") @db.Uuid
  estado       EstadoIntento @default(EN_CURSO)
  respuestas   Json?
  nota         Float?
  inicioEn     DateTime      @default(now()) @map("inicio_en")
  finEn        DateTime?     @map("fin_en")

  quiz       Quiz          @relation(fields: [quizId], references: [id], onDelete: Cascade)
  estudiante EstudianteRef @relation(fields: [estudianteId], references: [id], onDelete: Cascade)

  @@index([tenantId, quizId, estudianteId])
  @@map("intento_quiz")
}

model ProgresoLeccion {
  id           String         @id @default(uuid()) @db.Uuid
  tenantId     String         @map("tenant_id") @db.Uuid
  estudianteId String         @map("estudiante_id") @db.Uuid
  leccionId    String         @map("leccion_id") @db.Uuid
  estado       EstadoProgreso @default(NO_INICIADA)
  porcentaje   Int            @default(0)
  completadaEn DateTime?      @map("completada_en")
  updatedAt    DateTime       @updatedAt @map("updated_at")

  estudiante EstudianteRef @relation(fields: [estudianteId], references: [id], onDelete: Cascade)
  leccion    Leccion       @relation(fields: [leccionId], references: [id], onDelete: Cascade)

  @@unique([estudianteId, leccionId])
  @@index([tenantId, estudianteId])
  @@map("progreso_leccion")
}

model Anuncio {
  id           String   @id @default(uuid()) @db.Uuid
  tenantId     String   @map("tenant_id") @db.Uuid
  cursoId      String   @map("curso_id") @db.Uuid
  titulo       String   @db.VarChar(200)
  mensaje      String   @db.Text
  autorId      String   @map("autor_id") @db.Uuid
  autorNombre  String   @map("autor_nombre") @db.VarChar(150)
  createdAt    DateTime @default(now()) @map("created_at")

  curso Curso @relation(fields: [cursoId], references: [id], onDelete: Cascade)

  @@index([tenantId, cursoId, createdAt])
  @@map("anuncio")
}

/// Outbox: todo lo que sale hacia ALLEN (notas, avisos) pasa por aquí. Garantiza reintento.
model EventoAula {
  id            String       @id @default(uuid()) @db.Uuid
  tenantId      String       @map("tenant_id") @db.Uuid
  tipo          String       @db.VarChar(60)   // nota.publicada | curso.completado | ...
  payload       Json
  estado        EstadoEvento @default(PENDIENTE)
  intentos      Int          @default(0)
  ultimoError   String?      @map("ultimo_error") @db.Text
  proximoIntento DateTime?   @map("proximo_intento")
  createdAt     DateTime     @default(now()) @map("created_at")
  enviadoEn     DateTime?    @map("enviado_en")

  @@index([estado, proximoIntento])
  @@map("evento_aula")
}
```

**Reglas del modelo:**

- `tenantId` obligatorio en toda tabla de negocio. `Pregunta` y `TenantRef` se filtran por su padre.
- Borrado lógico preferido en `Curso`, `Leccion`, `Tarea` (estado/`publicada`), no `DELETE` físico.
- `Entrega.nota` es la nota **del Aula**; la nota **oficial** se replica a ALLEN por evento.
- Nunca guardar el código del estudiante en claro: solo `codigoHash` (bcrypt, 10 rondas).

---

## 7. API del Aula

Prefijo global: **`/api`**. Todas las rutas exigen `Authorization: Bearer <jwt>` salvo las
marcadas como públicas.

| Método | Ruta | Rol autorizado | Qué hace |
|---|---|---|---|
| GET | `/api/health` | público | estado del servicio (consulta la BD) |
| POST | `/api/auth/canjear` | público (ticket) | canjea ticket de ALLEN por sesión del Aula |
| POST | `/api/auth/estudiante/codigo` | público | envía código de 6 dígitos al alumno |
| POST | `/api/auth/estudiante/entrar` | público | login por identificador + código |
| GET | `/api/auth/yo` | todos | usuario actual, tenant, rol |
| POST | `/api/auth/salir` | todos | revoca sesión |
| GET | `/api/cursos` | ADMIN, PROFESOR | cursos del tenant (filtro `?estado=`) |
| POST | `/api/cursos` | ADMIN, PROFESOR | crea curso |
| GET | `/api/cursos/:id` | ADMIN, PROFESOR, ESTUDIANTE (inscrito) | detalle con unidades y lecciones |
| PATCH | `/api/cursos/:id` | ADMIN, PROFESOR dueño | edita |
| POST | `/api/cursos/:id/publicar` | ADMIN, PROFESOR dueño | publica |
| GET | `/api/cursos/:id/inscripciones` | ADMIN, PROFESOR dueño | alumnos del curso |
| POST | `/api/cursos/:id/inscripciones` | ADMIN | inscribe a mano |
| DELETE | `/api/cursos/:id/inscripciones/:estudianteId` | ADMIN | retira |
| POST | `/api/cursos/:id/unidades` | ADMIN, PROFESOR dueño | crea unidad |
| PATCH | `/api/unidades/:id` | ADMIN, PROFESOR dueño | edita / reordena |
| DELETE | `/api/unidades/:id` | ADMIN, PROFESOR dueño | borra (si no tiene entregas) |
| POST | `/api/unidades/:id/lecciones` | ADMIN, PROFESOR dueño | crea lección |
| PATCH | `/api/lecciones/:id` | ADMIN, PROFESOR dueño | edita contenido/publica |
| POST | `/api/lecciones/:id/materiales` | ADMIN, PROFESOR dueño | registra material (tras subir) |
| POST | `/api/materiales/firma` | ADMIN, PROFESOR | URL prefirmada de subida S3 |
| GET | `/api/materiales/:id/descarga` | inscritos | URL prefirmada de descarga (10 min) |
| DELETE | `/api/materiales/:id` | ADMIN, PROFESOR dueño | borra material |
| GET | `/api/mis-cursos` | ESTUDIANTE | cursos donde está inscrito + progreso |
| POST | `/api/lecciones/:id/progreso` | ESTUDIANTE | reporta avance (0–100) |
| GET | `/api/tareas?cursoId=` | ADMIN, PROFESOR, ESTUDIANTE inscrito | lista |
| POST | `/api/tareas` | ADMIN, PROFESOR dueño | crea tarea |
| PATCH | `/api/tareas/:id` | ADMIN, PROFESOR dueño | edita/publica |
| POST | `/api/tareas/:id/entregas` | ESTUDIANTE inscrito | sube entrega (multipart) |
| GET | `/api/tareas/:id/entregas` | ADMIN, PROFESOR dueño | entregas del curso |
| PATCH | `/api/entregas/:id/calificar` | ADMIN, PROFESOR dueño | nota + feedback → **evento a ALLEN** |
| POST | `/api/quizzes` | ADMIN, PROFESOR dueño | crea quiz |
| POST | `/api/quizzes/:id/intentos` | ESTUDIANTE inscrito | inicia intento |
| PATCH | `/api/intentos/:id/enviar` | ESTUDIANTE dueño | corrige y cierra → **evento a ALLEN** |
| GET | `/api/anuncios?cursoId=` | inscritos | lista anuncios |
| POST | `/api/anuncios` | ADMIN, PROFESOR dueño | publica anuncio |
| POST | `/api/integracion/allen/inscripcion` | HMAC (ALLEN) | alta/baja de alumno |
| POST | `/api/integracion/allen/estudiante` | HMAC (ALLEN) | actualiza espejo del alumno |
| GET | `/api/integracion/allen/ping` | HMAC (ALLEN) | verificación de enlace |

### Reglas de autorización

- `ADMIN`: todo dentro de **su** `tenantId`.
- `PROFESOR`: solo cursos donde `profesorId = sub` (o `esTutor` del curso).
- `ESTUDIANTE`: solo cursos con `InscripcionCurso.estado = ACTIVO` y lecciones `publicada = true`.
- Todo handler verifica **primero** `tenantId` y **después** el rol. En ese orden.
- El Aula **no** crea usuarios ni contraseñas de personal: el personal viene de ALLEN.

---

## 8. Integración con ALLEN

### 8.1 Identidad del personal (SSO)

ALLEN ya emite este JWT (HS256):

```json
{ "sub": "uuid-usuario", "email": "prof@aae.edu.ec", "tenantId": "uuid-empresa", "rol": "PROFESOR", "iat": 0, "exp": 0 }
```

Flujo:

1. El usuario pulsa "Aula virtual" en ALLEN → ALLEN abre
   `https://aula.feraxpartner.com/entrar?ticket=<ticket>`.
2. `ticket` = JWT firmado por ALLEN con `SSO_TICKET_SECRET`, `exp` ≤ 60 s, `aud: "aula"`,
   payload `{ sub, email, tenantId, rol, nombre }`. Es de **un solo uso**.
3. `POST /api/auth/canjear { ticket }` → el Aula valida firma, `aud` y `exp`, marca el ticket
   como usado (tabla o caché en memoria con TTL 120 s) y emite **sesión propia** del Aula.
4. La sesión propia del Aula: access token 1 h + refresh 7 días en cookie `HttpOnly`,
   `Secure`, `SameSite=Lax`, dominio `aula.feraxpartner.com`. **No** se comparte cookie con ALLEN.

> **Contrato que ALLEN debe exponer (lo implementa Ferax, no este agente):**
> `GET /api/auth/ticket-aula` — devuelve `{ ticket }` para el usuario autenticado.
> Mientras no exista, el Aula debe permitir un modo de desarrollo con `AULA_DEV_TOKEN`.

### 8.2 Acceso del estudiante

En ALLEN el estudiante **no es un usuario**: es un registro. Por eso el Aula tiene su propio
acceso:

1. `POST /api/auth/estudiante/codigo { identificador }` → busca `AccesoEstudiante`; si existe y
   está activo, genera un código de 6 dígitos, lo guarda hasheado (TTL 10 min) y lo envía por
   WhatsApp/correo **a través de ALLEN** (`POST /api/integracion/mensaje`, ver 8.4).
   Respuesta **siempre** `202 { enviado: true }`, exista o no el identificador (evita enumeración).
2. `POST /api/auth/estudiante/entrar { identificador, codigo }` → valida, resetea el contador y
   emite sesión con `rol: "ESTUDIANTE"`.
3. Bloqueo: 5 intentos fallidos → 15 minutos. Registrar `intentosFallidos` y `bloqueadoHasta`.

### 8.3 Datos que el Aula consume de ALLEN (solo lectura)

| Uso | Endpoint de ALLEN | Nota |
|---|---|---|
| Ficha del alumno | `GET /api/estudiantes/:id` | para el espejo `EstudianteRef` |
| Buscar alumno | `GET /api/students/search?q=` | alta manual en el Aula |
| Resumen del contrato | `GET /api/students/:id/contract-summary` | validar que el contrato sigue vigente |
| Académico del alumno | `GET /api/estudiantes/:id/academico` | notas y clases reales |
| Clases del docente | `GET /api/profesores/clases?tutor=` | vincular curso ↔ clase |
| Bloques activos | `GET /api/schedule/active-slots` | `horarioId` para enlazar el curso |

Todas se llaman con el token del usuario (el Aula reenvía el `Bearer`), nunca con una clave
maestra. Si ALLEN responde 401, la sesión del Aula se invalida y se pide re-entrar.

### 8.4 Escrituras del Aula hacia ALLEN

**a) Nota oficial** → `POST https://apiaallen.feraxpartner.com/api/integracion/aula/nota`

```http
X-Aula-Signature: <hex hmac-sha256 del cuerpo crudo con AULA_HMAC_SECRET>
X-Aula-Timestamp: 1732000000
```

```json
{
  "tenantId": "uuid-empresa",
  "estudianteId": "uuid-estudiante",
  "claseId": "uuid-clase-o-null",
  "tipo": "EVALUACION",
  "actividad": "Quiz Unit 3 · Reading",
  "fecha": "2026-11-19",
  "nota": 85.5,
  "peso": 10,
  "origen": "AULA",
  "origenId": "uuid-del-intento-o-entrega"
}
```

- ALLEN la guarda en `contenido_ficha` (`grade`, `peso`, `activity`, `claseId`).
- Idempotencia exigida: mismo `origenId` **no** duplica la nota.
- Si ALLEN devuelve 4xx/5xx, el evento queda `PENDIENTE` en `EventoAula` y se reintenta con
  backoff (1 min, 5 min, 30 min, 2 h, 6 h; máximo 5 intentos).

**b) Mensaje al alumno** → `POST /api/integracion/mensaje`
```json
{ "tenantId": "...", "estudianteId": "...", "canal": "WHATSAPP", "plantilla": "CODIGO_AULA", "datos": { "codigo": "123456" } }
```

> **Contrato que ALLEN debe exponer (lo implementa Ferax):** `POST /api/integracion/aula/nota`
> y `POST /api/integracion/mensaje`. Ambos protegidos con HMAC.

### 8.5 Eventos que ALLEN envía al Aula

`POST /api/integracion/allen/inscripcion` (HMAC `ALLEN_HMAC_SECRET`):

```json
{
  "evento": "inscripcion.creada",
  "ocurridoEn": "2026-11-19T14:00:00Z",
  "tenantId": "uuid-empresa",
  "cursoRef": { "horarioId": "uuid-horario" },
  "estudiante": {
    "id": "uuid-estudiante",
    "nombres": "Mateo",
    "apellidos": "Villa Huanca",
    "numeroContrato": "M210",
    "email": null
  }
}
```

- Si existe `Curso` con ese `horarioId` → inscribe (`origen: "ALLEN"`). Si no → responde
  `200 { "aplicado": false, "motivo": "sin_curso" }` y **no** guarda nada.
- `evento: "inscripcion.retirada"` → marca `InscripcionCurso.estado = RETIRADO`.
- El endpoint es **idempotente**: repetir el mismo evento no duplica la inscripción.

---

## 9. Interfaz de usuario

- **Marca:** ALLEN es un producto de **Ferax Partner**. Paleta y reglas en §9.3.
- **Stack visual:** Tailwind + componentes propios. Sin librería externa.
- **Idioma:** español de Ecuador. Voz activa, sentence case: "Guardar cambios", no "Enviar".
- **Responsive:** funciona a 360 px antes de darse por terminado.
- **Accesibilidad mínima:** contraste ≥ 4.5:1 en texto normal; foco de teclado visible;
  el estado nunca se comunica solo por color (siempre color + palabra o icono).

### 9.1 Pantallas del MVP

**Docente**
1. `docente/cursos` — lista con estado (Borrador/Publicado) y acciones.
2. `cursos/[id]` — editor de unidades y lecciones, con reordenar y publicar.
3. `cursos/[id]/lecciones/[leccionId]` — contenido + material + tareas + quiz.
4. `cursos/[id]/entregas` — bandeja de entregas por alumno, calificar en línea.
5. `cursos/[id]/calificaciones` — tabla por alumno con notas de tareas y quizzes.
6. `estudiante/[id]` — progreso individual.

**Estudiante**
7. `mis-cursos` — tarjetas con progreso en %.
8. `cursos/[id]` — índice de unidades/lecciones con estado (vista/no vista).
9. `cursos/[id]/lecciones/[leccionId]` — material, "marcar como completada", tarea, quiz.
10. `cursos/[id]/tareas` — mis tareas y entregas.
11. `cursos/[id]/calificaciones` — mis notas (solo lectura).

### 9.2 Reglas de interfaz (no negociables)

- Contraste **≥ 4.5:1** en texto normal y **≥ 3:1** en texto grande. Se mide, no se estima.
- **Foco de teclado visible** en todo elemento interactivo.
- **Estado vacío explícito**: "Sin cursos asignados", "Sin entregas todavía". Nunca una
  celda o lista en blanco.
- Cifras en columna con `font-variant-numeric: tabular-nums`.
- Sombra solo para elevación real (modal, dropdown, sticky). Nunca decorativa.
- **Una sola acción principal** por pantalla; el resto secundarias o fantasma.
- Colores de **nivel** (A1, A2, B1, B2, C1, C2, KIDS) son **señalética funcional**: no se
  recolorean a la marca. Reutilizar el helper `lib/niveles.ts` con el mismo criterio de ALLEN.
- Botones de archivo: descargar = flecha abajo ⤓, subir = flecha arriba ⤒, y color por formato
  (PDF rojo, Excel verde). Rojo sólido **nunca** para destruir.

### 9.3 Paleta de marca (obligatoria)

| Rol | Hex | Uso |
|---|---|---|
| Azul marino | `#0f172a` | tinta, texto principal, fondos oscuros |
| Azul Ferax | `#2f5597` | acción principal, foco, marca, enlace activo |
| Blanco | `#ffffff` | superficies y tarjetas |
| Gris de superficie | `#f8fafc` | fondo de página |
| Gris de texto secundario | `#475569` | descripciones, metadatos |

❌ Prohibido morado, violeta, fucsia o degradados de color.

---

## 10. Archivos y almacenamiento

- **S3-compatible** (MinIO en el VPS o Cloudflare R2). Bucket privado.
- Subida en dos pasos: el cliente pide `POST /api/materiales/firma` → recibe URL prefirmada
  (5 min) → sube directo a S3 → confirma con `POST /api/lecciones/:id/materiales`.
- **Descarga siempre por URL prefirmada de 10 minutos.** Nunca una URL pública permanente.
- Límites: 25 MB por archivo; PDF, DOCX, PPTX, JPG, PNG, MP4 (≤ 500 MB para video), MP3.
- Validar `mimeType` **por contenido**, no solo por extensión.
- Nombre en S3: `tenant/{tenantId}/curso/{cursoId}/{uuid}.{ext}` — nunca el nombre original
  (evita path traversal y filtración de datos personales).

---

## 11. Variables de entorno (`.env.example` completo)

```bash
NODE_ENV=production
PORT=3010

DATABASE_URL=postgresql://aula:CAMBIAR@localhost:5434/allen_aula?schema=public

# SSO (se comparte con ALLEN)
JWT_SECRET=                      # obligatorio; el proceso FALLA si falta en producción
JWT_EXPIRA=1h
REFRESH_SECRET=
REFRESH_EXPIRA=7d
SSO_TICKET_SECRET=               # para validar el ticket de ALLEN

# Integración
ALLEN_API_URL=https://apiaallen.feraxpartner.com/api
AULA_HMAC_SECRET=                # firma de lo que el Aula envía a ALLEN
ALLEN_HMAC_SECRET=               # firma de lo que ALLEN envía al Aula

# Archivos
S3_ENDPOINT=
S3_REGION=us-east-1
S3_BUCKET=allen-aula
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_FORCE_PATH_STYLE=true

# App
APP_URL=https://aula.feraxpartner.com
ALLEN_APP_URL=https://appallen.feraxpartner.com
CORS_ORIGENES=https://aula.feraxpartner.com
TZ=America/Guayaquil
```

**Regla:** ningún secreto en el código, en el repo ni en logs. Si falta una variable crítica en
producción, el proceso **no arranca** (patrón `getJwtSecret()` de ALLEN).

---

## 12. Seguridad obligatoria (checklist de aceptación)

- [ ] `helmet` activo + CSP. Sin `unsafe-eval`.
- [ ] `ValidationPipe` global: `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`.
- [ ] `@nestjs/throttler`: 120 req/min global; login de estudiante 5 req/min por IP.
- [ ] CORS con lista blanca explícita (`CORS_ORIGENES`). Nunca `origin: '*'` en producción.
- [ ] JWT: HS256, `exp` obligatorio, secreto ≥ 32 bytes, proceso falla sin secreto en producción.
- [ ] Refresh en cookie `HttpOnly` + `Secure` + `SameSite=Lax`; rotación en cada uso.
- [ ] Endpoints `/api/integracion/*`: HMAC-SHA256 sobre el **cuerpo crudo**, comparación con
      `timingSafeEqual`, ventana anti-replay de 5 minutos, y rechazo si falta el secreto.
- [ ] Toda consulta filtra por `tenantId`. Revisar los `findUnique` uno por uno.
- [ ] Sin contraseñas de personal (no hay login propio de personal).
- [ ] Código de estudiante: 6 dígitos aleatorios (`crypto.randomInt`), TTL 10 min, hash bcrypt,
      un solo uso, bloqueo tras 5 fallos.
- [ ] Errores 5xx no filtran stack al cliente; se registran en log con `requestId` y `tenantId`.
- [ ] Filtro global de excepciones (mismo patrón `AllExceptionsFilter` de ALLEN).
- [ ] HTML de lecciones **saneado** antes de guardar (lista blanca de etiquetas).
- [ ] Sin `$queryRaw` sin parámetros enlazados.

---

## 13. Protección de datos (LOPDP Ecuador — menores de edad)

- La mayoría de estudiantes son **menores**. El consentimiento lo otorga el **titular del
  contrato** en ALLEN; el Aula **no** recoge consentimiento nuevo, solo lo respeta.
- **Nunca** exponer un archivo por URL pública. Solo URLs prefirmadas con caducidad.
- No registrar en logs: cédula completa, correo, teléfono, contenido de entregas.
- El alumno **solo** ve sus propios datos. Un `DELETE`/`GET` de otro alumno → 403.
- Los datos personales se guardan en `EstudianteRef` como **espejo mínimo** (nombre, contrato,
  correo). Nada más. No copiar cédula, dirección ni datos del titular.
- Retención: las entregas y sus archivos se conservan el tiempo del curso + 1 año, luego se
  eliminan. Documentarlo en el README.

---

## 14. Prohibiciones explícitas

1. ❌ Crear tablas de `estudiante`, `contrato`, `pago`, `matricula`, `horario`, `clase`,
   `asistencia` dentro del Aula. Son de ALLEN.
2. ❌ Escribir en la base de datos de ALLEN o conectarse a ella.
3. ❌ Duplicar la nota oficial: la única escritura válida es el evento `nota.publicada`.
4. ❌ Implementar login con contraseña para profesores o administradores.
5. ❌ Registro público de usuarios o de instituciones.
6. ❌ Módulo de pagos, facturación o cobranza dentro del Aula.
7. ❌ Subir archivos a carpetas públicas del servidor web.
8. ❌ Usar `any`, `@ts-ignore` o `as unknown as` sin justificación en un comentario.
9. ❌ Instalar cualquier librería de componentes UI.
10. ❌ Dejar un endpoint sin guard de rol. Sin excepciones.
11. ❌ Inventar campos o endpoints que no estén en este documento. **Preguntar primero.**
12. ❌ Compilar en el servidor de producción. El build es local; al servidor va el resultado.

---

## 15. Fases, entregables y criterios de aceptación

### Fase 0 — Cimientos (1 sesión)

**Entregar:** repo con workspaces, Dockerfiles, `docker-compose.yml` local, Prisma con las 15
tablas + migración inicial, módulo `auth` (canje de ticket + sesión + `GET /auth/yo`), health
real, filtro global de excepciones, `.env.example`, README con arranque local.

**Acepta si:**
- `docker compose up` levanta API + web + Postgres y `GET /api/health` responde `{ status: "ok", db: "ok" }`.
- Un JWT de ALLEN válido permite entrar; uno vencido o de otro tenant da 401.
- `npm run build` y `npx tsc --noEmit` terminan sin errores en `api` y `web`.
- Existe un test que comprueba que una request sin `tenantId` no devuelve datos.

### Fase 1 — Contenido y tareas (3–4 sesiones)

**Entregar:** CRUD de cursos/unidades/lecciones, subida de material a S3 con URL prefirmada,
vista del alumno con progreso, tareas con entrega de archivo, calificación y **evento de nota
hacia ALLEN** con outbox y reintentos.

**Acepta si:**
- Un profesor crea un curso, 2 unidades, 3 lecciones y sube un PDF; el alumno inscrito lo ve.
- El alumno descarga el PDF solo con URL de 10 minutos; sin sesión recibe 401.
- El alumno entrega un archivo; el profesor califica; el evento queda `ENVIADO` en `EventoAula`.
- Con ALLEN apagado, el evento queda `PENDIENTE` y se reintenta solo; al volver, se envía.
- Un alumno **no inscrito** que abre el curso recibe 403.
- Un usuario del tenant A no ve nada del tenant B (test explícito).

### Fase 2 — Quizzes y comunicación (3 sesiones)

**Entregar:** quizzes con 3 tipos de pregunta, corrección automática, intentos limitados,
anuncios, panel de calificaciones del curso, y envío de código de acceso al alumno vía ALLEN.

**Acepta si:**
- Un quiz de 10 preguntas se corrige solo y la nota aparece en el panel del profesor.
- El segundo intento respeta `intentosMax`; el tercero se rechaza con mensaje claro.
- El login del alumno funciona con cédula + código; sin código válido da 401 genérico.
- El anuncio aparece en la portada del curso para todos los inscritos.

### Fases posteriores (no construir ahora)

- **Fase 3:** video con progreso, certificados PDF (pdfkit), vista del titular/padre.
- **Fase 4:** autoservicio por institución, límites por plan, facturación del SaaS.

---

## 16. Definición de "terminado" (Definition of Done)

Una tarea no está terminada hasta que:

1. Compila: `tsc --noEmit` limpio en `api` y `web`.
2. `nest build` y `next build` terminan con exit 0.
3. La migración corre desde cero (`prisma migrate deploy` sobre base vacía).
4. Los endpoints nuevos tienen guard de rol y filtro de `tenantId` verificado.
5. Hay una comprobación manual documentada (comando `curl` o pasos en la UI) que demuestra
   que funciona.
6. No se agregó ninguna dependencia fuera de la lista del §2 sin justificarlo por escrito.

---

## Anexo A — Lo que Ferax debe implementar en ALLEN (no es tarea del agente)

Para que la integración funcione, el CRM debe exponer:

| # | Cambio en ALLEN | Tipo |
|---|---|---|
| 1 | `GET /api/auth/ticket-aula` (JWT 60 s, `aud: "aula"`) | endpoint nuevo |
| 2 | `POST /api/integracion/aula/nota` (HMAC, upsert en `contenido_ficha`) | endpoint nuevo |
| 3 | `POST /api/integracion/mensaje` (WhatsApp/correo vía `ColaMensajes`) | endpoint nuevo |
| 4 | Emisor de eventos `inscripcion.creada` / `inscripcion.retirada` hacia el Aula | job |
| 5 | Columna `contenido_ficha.origen` + `origen_id` (idempotencia exacta de notas) | migración |
| 6 | Módulo `AULA` en `modulos.constants.ts` y `modulos.ts` (label "Aula virtual", icono 📚, ruta externa) | cambio menor |
| 7 | Botón "Aula virtual" en el layout de ALLEN | cambio menor |
| 8 | Bloque Caddy para `aula` / `apiaula` + registros DNS | infraestructura |

---

## Anexo B — Decisiones ya tomadas (no reabrir)

| Tema | Decisión |
|---|---|
| Lenguaje | TypeScript en todo |
| Base de datos | PostgreSQL 16, base separada `allen_aula` |
| Notas | ALLEN es el libro oficial; el Aula solo envía |
| Alumnos | el Aula tiene su propia credencial; no se crean usuarios en ALLEN |
| Archivos | S3-compatible, bucket privado, URL prefirmada |
| Multi-tenant | desde el día 1 (`tenantId` en toda tabla) |
| UI | Tailwind propio, paleta Ferax, sin librerías |
| Integración | HTTP + HMAC + outbox con reintentos |
