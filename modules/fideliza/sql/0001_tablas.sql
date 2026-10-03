-- ═══════════════════════════════════════════════════════════════════════════════
-- VENDEMIA FIDELIZA · 0001 · Tablas
--
-- ⚠️ ESTAS TABLAS NO SON ESPEJO DEL BOT. Todo lo demás de `public` es copia del
-- SQLite del bot y se escribe encolando `commands`. Las `loyalty_*` son al revés:
-- Postgres ES la fuente de verdad del saldo, y el bot no las conoce. Por eso:
--
--   · Fechas en `timestamptz` de verdad, no epoch + *_ts como el espejo.
--   · Booleanos `boolean`, JSON en `jsonb`.
--   · Ids `uuid` internos. Lo que ve un cliente (VDM-XXXXXX, tokens) es otra
--     columna, aleatoria e independiente del id.
--   · Dinero en céntimos (`bigint`), nunca numeric con decimales.
--
-- Nadie escribe aquí directamente: ni el panel (solo SELECT bajo RLS) ni la web
-- pública. Todas las escrituras pasan por las funciones de 0003/0004, que
-- comprueban permisos por dentro y dejan auditoría.
--
-- Cada tabla de negocio lleva `company_id` y una clave única (company_id, id).
-- Las hijas referencian (company_id, padre_id): así es IMPOSIBLE, a nivel de
-- restricción, colgar una fila de la empresa A de un padre de la empresa B,
-- aunque una función tuviera un fallo.
--
-- Se aplica en el SQL Editor de Supabase, en orden: 0001 → 0006. Ver README.md
-- de esta carpeta.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Claves del servidor (web pública y worker) ────────────────────────────────
-- Solo el HASH. La clave en claro vive en FIDELIZA_SERVER_KEY de Vercel. Sin
-- grants para nadie: solo la leen las funciones SECURITY DEFINER.
create table if not exists public.loyalty_server_keys (
    id          uuid primary key default gen_random_uuid(),
    key_hash    bytea not null unique,
    label       text  not null default '',
    active      boolean not null default true,
    created_at  timestamptz not null default now()
);

-- ── Ajustes del negocio en Fideliza ───────────────────────────────────────────
-- Una fila por compañía. El slug es el de fideliza.vendemias.com/n/<slug>.
create table if not exists public.loyalty_settings (
    company_id           text primary key references public.companies(id) on delete cascade,
    slug                 text not null unique
                         check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$'),
    display_name         text not null check (char_length(display_name) between 1 and 60),
    tagline              text not null default '' check (char_length(tagline) <= 120),
    logo_url             text check (logo_url is null or logo_url ~ '^https://[^\s]+$'),
    logo_checked         jsonb,   -- resultado de la validación de 660×660 (lo escribe el servidor)
    bg_color             text not null default '#FF4900' check (bg_color ~ '^#[0-9A-Fa-f]{6}$'),
    support_url          text check (support_url is null or support_url ~ '^https://[^\s]+$'),
    default_profile_id   uuid,
    require_external_ref boolean not null default false,
    -- Solo el admin de plataforma lo enciende: la clase de demo lleva la marca de
    -- Vendemia y no puede alojar clientes de otro comercio.
    wallet_use_demo_class boolean not null default false,
    timezone             text not null default 'America/Lima',
    currency             text not null default 'PEN' check (currency ~ '^[A-Z]{3}$'),
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now()
);

-- ── Sucursales ────────────────────────────────────────────────────────────────
-- No existían: `companies.location` es una dirección en texto. Fideliza las
-- necesita para acotar a gerentes y cajeros.
create table if not exists public.loyalty_locations (
    id          uuid primary key default gen_random_uuid(),
    company_id  text not null references public.companies(id) on delete cascade,
    name        text not null check (char_length(name) between 1 and 60),
    is_active   boolean not null default true,
    created_at  timestamptz not null default now(),
    unique (company_id, id),
    unique (company_id, name)
);

-- ── Permisos de Fideliza sobre la membresía existente ─────────────────────────
-- `memberships.role` es owner|member y lo gestiona el bot: no se toca. Esto
-- AFINA a los `member` (gerente, cajero, analista). Un owner es propietario
-- aquí siempre. Una fila sin membresía viva no da nada: el permiso se calcula
-- con JOIN a memberships, así que quitar la membresía quita el acceso.
create table if not exists public.loyalty_staff (
    company_id    text not null references public.companies(id) on delete cascade,
    auth_user_id  text not null,
    role          text not null check (role in ('manager', 'cashier', 'analyst')),
    location_ids  uuid[],         -- null = todas las sucursales
    updated_by    text,
    updated_at    timestamptz not null default now(),
    primary key (company_id, auth_user_id)
);

-- ── Programas y sus versiones ─────────────────────────────────────────────────
create table if not exists public.loyalty_programs (
    id                  uuid primary key default gen_random_uuid(),
    company_id          text not null references public.companies(id) on delete cascade,
    name                text not null check (char_length(name) between 1 and 40),
    short_description   text not null default '' check (char_length(short_description) <= 120),
    objective           text check (objective in ('repeat', 'frequency', 'ticket', 'winback')),
    status              text not null default 'draft'
                        check (status in ('draft', 'active', 'paused', 'error')),
    -- La regla en edición. Lo publicado vive en loyalty_program_versions y no cambia.
    draft               jsonb not null default '{}'::jsonb,
    current_version_id  uuid,
    last_error          text,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    published_at        timestamptz,
    unique (company_id, id)
);
-- Un programa vivo (activo o pausado) por compañía en el MVP: el alta pública
-- tiene que saber a cuál apuntar sin preguntar.
create unique index if not exists ux_loyalty_programs_vivo
    on public.loyalty_programs (company_id) where status in ('active', 'paused');

create table if not exists public.loyalty_program_versions (
    id                   uuid primary key default gen_random_uuid(),
    company_id           text not null,
    program_id           uuid not null,
    version              integer not null check (version >= 1),
    rule_type            text not null check (rule_type in ('stamps', 'points', 'visits')),
    -- sellos: cuántos por compra elegible
    stamps_per_purchase  integer not null default 1 check (stamps_per_purchase between 1 and 100),
    -- puntos: points_per_unit puntos por cada unit_cents céntimos, con redondeo explícito
    points_per_unit      integer not null default 1 check (points_per_unit between 1 and 10000),
    unit_cents           integer not null default 100 check (unit_cents between 1 and 10000000),
    rounding             text not null default 'floor' check (rounding in ('floor', 'round', 'ceil')),
    min_purchase_cents   bigint not null default 0 check (min_purchase_cents >= 0),
    reward_threshold     integer not null check (reward_threshold between 1 and 1000000),
    reward_description   text not null check (char_length(reward_description) between 1 and 80),
    reward_valid_days    integer check (reward_valid_days between 1 and 3650),
    valid_from           timestamptz not null default now(),
    valid_to             timestamptz,
    location_ids         uuid[],   -- null = todas
    created_by           text,
    created_at           timestamptz not null default now(),
    unique (program_id, version),
    unique (company_id, id),
    foreign key (company_id, program_id) references public.loyalty_programs (company_id, id) on delete cascade,
    check (valid_to is null or valid_to > valid_from)
);

alter table public.loyalty_programs
    drop constraint if exists fk_loyalty_programs_version;
alter table public.loyalty_programs
    add constraint fk_loyalty_programs_version
    foreign key (company_id, current_version_id)
    references public.loyalty_program_versions (company_id, id) deferrable initially deferred;

-- ── Miembros ──────────────────────────────────────────────────────────────────
-- public_code: lo que se lee en voz alta en caja (VDM-A7K9P2). Alfabeto sin
--   0/O/1/I/L para que no se confundan al dictarlo.
-- qr_token: lo que lleva el QR de la tarjeta y del pase. Opaco; solo identifica
--   ante un empleado autenticado, no autoriza nada por sí solo.
-- card_token_hash: el enlace /m/<token> de la tarjeta web. Solo el hash: el
--   token en claro se entrega una vez y se puede rotar.
-- balance/rewards_available son una PROYECCIÓN del ledger. La verdad es
--   loyalty_ledger; loyalty_reconcile() compara las dos.
create table if not exists public.loyalty_members (
    id                 uuid primary key default gen_random_uuid(),
    company_id         text not null,
    program_id         uuid not null,
    public_code        text not null unique check (public_code ~ '^VDM-[A-HJKMNP-Z2-9]{6}$'),
    qr_token           text not null unique check (char_length(qr_token) >= 24),
    card_token_hash    bytea not null unique,
    alias              text check (char_length(alias) <= 40),
    status             text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
    balance            integer not null default 0,
    lifetime_units     integer not null default 0,
    rewards_available  integer not null default 0 check (rewards_available >= 0),
    ops_count          integer not null default 0,
    first_op_at        timestamptz,
    last_op_at         timestamptz,
    joined_via         text not null check (joined_via in ('public', 'panel', 'caja')),
    joined_device_id   uuid,
    -- Reintentar el alta con la misma clave no crea una segunda tarjeta.
    creation_key       text check (char_length(creation_key) between 8 and 80),
    created_by         text,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now(),
    suspended_at       timestamptz,
    deleted_at         timestamptz,
    unique (company_id, id),
    unique (company_id, creation_key),
    foreign key (company_id, program_id) references public.loyalty_programs (company_id, id)
);
create index if not exists ix_loyalty_members_company on public.loyalty_members (company_id, created_at desc);
create index if not exists ix_loyalty_members_last_op on public.loyalty_members (company_id, last_op_at);
create index if not exists ix_loyalty_members_alias on public.loyalty_members (company_id, lower(alias));

-- ── Contacto y consentimiento ─────────────────────────────────────────────────
-- Los datos personales viven aparte para que un cajero pueda leer miembros
-- (código, alias, saldo) sin leer teléfonos ni correos.
-- ⚠️ Sin unique por valor: dos personas pueden escribir el mismo teléfono, y
-- eso NO las fusiona. Fusionar exige verificación.
create table if not exists public.loyalty_contacts (
    id               uuid primary key default gen_random_uuid(),
    company_id       text not null,
    member_id        uuid not null,
    kind             text not null check (kind in ('phone', 'email')),
    value            text not null check (char_length(value) between 3 and 120),
    verified_at      timestamptz,
    verified_method  text check (verified_method in ('in_person', 'otp')),
    verified_by      text,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    unique (member_id, kind),
    foreign key (company_id, member_id) references public.loyalty_members (company_id, id) on delete cascade
);
create index if not exists ix_loyalty_contacts_value on public.loyalty_contacts (company_id, kind, value);

-- Solo se añaden filas. El consentimiento vigente es la ÚLTIMA por canal.
create table if not exists public.loyalty_consents (
    id            bigint generated always as identity primary key,
    company_id    text not null,
    member_id     uuid not null,
    channel       text not null check (channel in ('push', 'whatsapp', 'email', 'sms')),
    granted       boolean not null,
    text_version  text not null default 'v1',
    source        text not null check (source in ('card', 'panel', 'caja', 'unsubscribe', 'erase')),
    actor         text,
    created_at    timestamptz not null default now(),
    foreign key (company_id, member_id) references public.loyalty_members (company_id, id) on delete cascade
);
create index if not exists ix_loyalty_consents_member on public.loyalty_consents (member_id, channel, id desc);

-- ── Operaciones, ledger, premios y canjes ─────────────────────────────────────
create table if not exists public.loyalty_transactions (
    id               uuid primary key default gen_random_uuid(),
    company_id       text not null,
    program_id       uuid not null,
    version_id       uuid,
    member_id        uuid not null,
    location_id      uuid,
    kind             text not null check (kind in ('purchase', 'visit', 'refund', 'adjustment')),
    source           text not null default 'caja' check (source ~ '^[a-z0-9_.-]{1,32}$'),
    external_ref     text check (char_length(external_ref) between 1 and 64),
    idempotency_key  text not null check (char_length(idempotency_key) between 8 and 80),
    request_hash     text not null,
    amount_cents     bigint not null default 0 check (amount_cents >= 0),
    currency         text not null default 'PEN',
    units            integer not null,           -- efecto con signo sobre el saldo
    reverses_id      uuid,                       -- refund/corrección: a qué operación compensa
    reason           text check (char_length(reason) <= 200),
    staff_user_id    text,
    created_at       timestamptz not null default now(),
    unique (company_id, id),
    unique (company_id, idempotency_key),
    foreign key (company_id, member_id) references public.loyalty_members (company_id, id),
    foreign key (company_id, program_id) references public.loyalty_programs (company_id, id),
    foreign key (company_id, version_id) references public.loyalty_program_versions (company_id, id),
    foreign key (company_id, location_id) references public.loyalty_locations (company_id, id),
    foreign key (company_id, reverses_id) references public.loyalty_transactions (company_id, id)
);
-- La idempotencia de negocio: el mismo comprobante no suma dos veces.
create unique index if not exists ux_loyalty_tx_ref
    on public.loyalty_transactions (company_id, source, external_ref)
    where external_ref is not null and kind in ('purchase', 'visit');
create index if not exists ix_loyalty_tx_member on public.loyalty_transactions (member_id, created_at desc);
create index if not exists ix_loyalty_tx_company on public.loyalty_transactions (company_id, created_at desc);
create index if not exists ix_loyalty_tx_reverses on public.loyalty_transactions (reverses_id) where reverses_id is not null;

create table if not exists public.loyalty_rewards (
    id                     uuid primary key default gen_random_uuid(),
    company_id             text not null,
    member_id              uuid not null,
    program_id             uuid not null,
    version_id             uuid not null,
    description            text not null,
    threshold              integer not null,
    status                 text not null default 'available'
                           check (status in ('available', 'redeemed', 'expired', 'revoked')),
    issued_at              timestamptz not null default now(),
    expires_at             timestamptz,
    source_transaction_id  uuid,
    redeemed_at            timestamptz,
    revoked_at             timestamptz,
    unique (company_id, id),
    foreign key (company_id, member_id) references public.loyalty_members (company_id, id),
    foreign key (company_id, version_id) references public.loyalty_program_versions (company_id, id),
    foreign key (company_id, source_transaction_id) references public.loyalty_transactions (company_id, id)
);
create index if not exists ix_loyalty_rewards_member on public.loyalty_rewards (member_id, status, issued_at);
create index if not exists ix_loyalty_rewards_company on public.loyalty_rewards (company_id, status, issued_at desc);

create table if not exists public.loyalty_redemptions (
    id               uuid primary key default gen_random_uuid(),
    company_id       text not null,
    member_id        uuid not null,
    reward_id        uuid not null unique,      -- un premio se canjea UNA vez, y lo dice el índice
    location_id      uuid,
    idempotency_key  text not null,
    staff_user_id    text,
    created_at       timestamptz not null default now(),
    unique (company_id, id),
    unique (company_id, idempotency_key),
    foreign key (company_id, member_id) references public.loyalty_members (company_id, id),
    foreign key (company_id, reward_id) references public.loyalty_rewards (company_id, id),
    foreign key (company_id, location_id) references public.loyalty_locations (company_id, id)
);
create index if not exists ix_loyalty_redemptions_company on public.loyalty_redemptions (company_id, created_at desc);

-- EL LIBRO. Solo INSERT: el trigger de abajo rechaza UPDATE y DELETE incluso
-- para el dueño de la tabla. Un error se corrige con otra fila, nunca editando.
create table if not exists public.loyalty_ledger (
    id              bigint generated always as identity primary key,
    company_id      text not null,
    member_id       uuid not null,
    program_id      uuid not null,
    transaction_id  uuid,
    reward_id       uuid,
    kind            text not null
                    check (kind in ('earn', 'reverse', 'reward_issue', 'reward_revoke', 'adjust')),
    units           integer not null,
    balance_after   integer not null,
    created_by      text,
    created_at      timestamptz not null default now(),
    foreign key (company_id, member_id) references public.loyalty_members (company_id, id),
    foreign key (company_id, transaction_id) references public.loyalty_transactions (company_id, id),
    foreign key (company_id, reward_id) references public.loyalty_rewards (company_id, id)
);
create index if not exists ix_loyalty_ledger_member on public.loyalty_ledger (member_id, id);
create index if not exists ix_loyalty_ledger_company on public.loyalty_ledger (company_id, created_at desc);

create or replace function public.loyalty_ledger_inmutable()
returns trigger language plpgsql as $$
begin
    raise exception 'loyalty:ledger_inmutable' using
        errcode = '42501',
        hint = 'El ledger no se edita: registra un movimiento compensatorio.';
end $$;

drop trigger if exists tr_loyalty_ledger_inmutable on public.loyalty_ledger;
create trigger tr_loyalty_ledger_inmutable
    before update or delete on public.loyalty_ledger
    for each row execute function public.loyalty_ledger_inmutable();

-- ── Google Wallet ─────────────────────────────────────────────────────────────
create table if not exists public.loyalty_wallet_classes (
    id              uuid primary key default gen_random_uuid(),
    company_id      text not null,
    program_id      uuid not null unique,
    issuer_id       text,
    class_id        text check (class_id ~ '^[0-9]+\.[A-Za-z0-9._-]+$'),
    is_demo         boolean not null default false,
    review_status   text,
    config_hash     text,
    state           text not null default 'pending' check (state in ('pending', 'synced', 'error')),
    last_error      text,
    last_synced_at  timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    foreign key (company_id, program_id) references public.loyalty_programs (company_id, id)
);
-- Una clase propia por programa; la de demo (is_demo) es la única compartible.
create unique index if not exists ux_loyalty_wallet_class_id
    on public.loyalty_wallet_classes (class_id) where not is_demo;

-- Una emisión por miembro y proveedor. El object_id sale del id de ESTA fila
-- (no del miembro) y no cambia nunca: reintentar no puede crear otro objeto.
create table if not exists public.loyalty_wallet_passes (
    id                   uuid primary key default gen_random_uuid(),
    company_id           text not null,
    member_id            uuid not null,
    program_id           uuid not null,
    provider             text not null default 'google' check (provider in ('google')),
    object_id            text not null unique,
    class_id             text not null,
    state                text not null default 'pending'
                         check (state in ('pending', 'synced', 'error', 'inactive')),
    desired_rev          integer not null default 1,
    synced_rev           integer not null default 0,
    save_links_issued    integer not null default 0,
    last_save_link_at    timestamptz,
    last_error           text,
    last_synced_at       timestamptz,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now(),
    unique (member_id, provider),
    foreign key (company_id, member_id) references public.loyalty_members (company_id, id)
);
create index if not exists ix_loyalty_wallet_passes_company on public.loyalty_wallet_passes (company_id, state);

-- ── Enlaces y placas ──────────────────────────────────────────────────────────
create table if not exists public.loyalty_link_profiles (
    id                    uuid primary key default gen_random_uuid(),
    company_id            text not null references public.companies(id) on delete cascade,
    name                  text not null check (char_length(name) between 1 and 60),
    title                 text not null default '' check (char_length(title) <= 60),
    tagline               text not null default '' check (char_length(tagline) <= 120),
    published_version_id  uuid,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now(),
    unique (company_id, id)
);

-- El BORRADOR de los enlaces. Lo que ve el público es la versión publicada.
create table if not exists public.loyalty_links (
    id          uuid primary key default gen_random_uuid(),
    company_id  text not null,
    profile_id  uuid not null,
    label       text not null check (char_length(label) between 1 and 40),
    kind        text not null default 'url' check (kind in ('url', 'join')),
    url         text check (url is null or (url ~ '^https://[^\s]+$' and char_length(url) <= 600)),
    position    integer not null default 0,
    is_active   boolean not null default true,
    is_primary  boolean not null default false,
    starts_at   timestamptz,
    ends_at     timestamptz,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    foreign key (company_id, profile_id) references public.loyalty_link_profiles (company_id, id) on delete cascade,
    check (kind <> 'url' or url is not null),
    check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index if not exists ix_loyalty_links_profile on public.loyalty_links (profile_id, position);

-- Foto inmutable de lo publicado. Publicar = insertar una fila y mover el
-- puntero del perfil en la MISMA transacción: el visitante nunca ve una mezcla.
create table if not exists public.loyalty_published_link_versions (
    id            uuid primary key default gen_random_uuid(),
    company_id    text not null,
    profile_id    uuid not null,
    version       integer not null,
    title         text not null,
    tagline       text not null,
    links         jsonb not null,
    published_by  text,
    published_at  timestamptz not null default now(),
    unique (profile_id, version),
    unique (company_id, id),
    foreign key (company_id, profile_id) references public.loyalty_link_profiles (company_id, id) on delete cascade
);

alter table public.loyalty_link_profiles drop constraint if exists fk_loyalty_profile_published;
alter table public.loyalty_link_profiles
    add constraint fk_loyalty_profile_published
    foreign key (company_id, published_version_id)
    references public.loyalty_published_link_versions (company_id, id) deferrable initially deferred;

alter table public.loyalty_settings drop constraint if exists fk_loyalty_settings_profile;
alter table public.loyalty_settings
    add constraint fk_loyalty_settings_profile
    foreign key (company_id, default_profile_id)
    references public.loyalty_link_profiles (company_id, id) deferrable initially deferred;

-- Una placa existe antes de tener dueño (inventario de fábrica): company_id
-- puede ser null SOLO en fabricada/probada. El token público va en claro —está
-- grabado en el chip y en el QR—; el código de activación, solo su hash.
create table if not exists public.loyalty_devices (
    id                    uuid primary key default gen_random_uuid(),
    company_id            text references public.companies(id),
    location_id           uuid,
    profile_id            uuid,
    public_token          text not null unique check (public_token ~ '^[A-Za-z0-9_-]{22,64}$'),
    activation_code_hash  bytea unique,
    activation_used_at    timestamptz,
    label                 text not null default '' check (char_length(label) <= 60),
    kind                  text not null default 'nfc_qr' check (kind in ('nfc_qr', 'qr')),
    status                text not null default 'manufactured'
                          check (status in ('manufactured', 'tested', 'assigned', 'active', 'suspended', 'retired')),
    batch                 text,
    created_by            text,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now(),
    activated_at          timestamptz,
    unique (company_id, id),
    foreign key (company_id, location_id) references public.loyalty_locations (company_id, id),
    foreign key (company_id, profile_id) references public.loyalty_link_profiles (company_id, id),
    check (company_id is not null or status in ('manufactured', 'tested'))
);
create index if not exists ix_loyalty_devices_company on public.loyalty_devices (company_id, status);

create table if not exists public.loyalty_device_claims (
    id          uuid primary key default gen_random_uuid(),
    device_id   uuid not null references public.loyalty_devices(id),
    company_id  text not null references public.companies(id),
    method      text not null check (method in ('activation_code', 'created_in_panel')),
    claimed_by  text,
    claimed_at  timestamptz not null default now()
);

-- ── Eventos públicos (medición) ───────────────────────────────────────────────
-- Sin IP, sin user agent, sin nada que identifique a quien abre.
create table if not exists public.loyalty_public_events (
    id          bigint generated always as identity primary key,
    company_id  text,
    device_id   uuid,
    profile_id  uuid,
    member_id   uuid,
    kind        text not null check (kind in (
                    'device_open', 'device_unavailable', 'links_view', 'link_click',
                    'join_view', 'join', 'card_view', 'wallet_link', 'push_subscribed', 'campaign_click')),
    source      text check (source in ('nfc', 'qr', 'direct', 'link')),
    detail      jsonb,
    created_at  timestamptz not null default now()
);
create index if not exists ix_loyalty_events_company on public.loyalty_public_events (company_id, kind, created_at desc);
create index if not exists ix_loyalty_events_device on public.loyalty_public_events (device_id, created_at desc);

-- ── Campañas ──────────────────────────────────────────────────────────────────
create table if not exists public.loyalty_campaigns (
    id          uuid primary key default gen_random_uuid(),
    company_id  text not null references public.companies(id) on delete cascade,
    template    text not null check (template in ('welcome', 'reward_available', 'return_reminder', 'winback')),
    channel     text not null default 'push' check (channel in ('push')),
    status      text not null default 'draft' check (status in ('draft', 'active', 'paused')),
    title       text not null check (char_length(title) between 1 and 60),
    body        text not null check (char_length(body) between 1 and 160),
    -- inactive_days / cycle_days según plantilla; max_per_30d es el tope por persona
    config      jsonb not null default '{}'::jsonb,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    unique (company_id, id),
    unique (company_id, template)
);

create table if not exists public.loyalty_campaign_events (
    id           bigint generated always as identity primary key,
    company_id   text not null,
    campaign_id  uuid not null,
    member_id    uuid not null,
    stage        text not null check (stage in (
                     'eligible', 'attempted', 'provider_accepted', 'observed_click',
                     'validated_purchase_after', 'unsubscribed', 'skipped')),
    detail       text,
    created_at   timestamptz not null default now(),
    foreign key (company_id, campaign_id) references public.loyalty_campaigns (company_id, id) on delete cascade
);
create index if not exists ix_loyalty_campaign_events on public.loyalty_campaign_events (company_id, campaign_id, stage, created_at desc);
create index if not exists ix_loyalty_campaign_events_member on public.loyalty_campaign_events (member_id, created_at desc);

create table if not exists public.loyalty_push_subscriptions (
    id               uuid primary key default gen_random_uuid(),
    company_id       text not null,
    member_id        uuid not null,
    -- Un navegador tiene UNA suscripción para todo fideliza.vendemias.com, y
    -- puede llevar tarjetas de varios negocios: el endpoint se repite entre
    -- miembros, no dentro del mismo.
    endpoint         text not null check (endpoint ~ '^https://[^\s]+$'),
    p256dh           text not null,
    auth             text not null,
    installation_id  text,
    created_at       timestamptz not null default now(),
    revoked_at       timestamptz,
    last_error       text,
    unique (member_id, endpoint),
    foreign key (company_id, member_id) references public.loyalty_members (company_id, id) on delete cascade
);
create index if not exists ix_loyalty_push_member on public.loyalty_push_subscriptions (member_id) where revoked_at is null;

-- ── Outbox ────────────────────────────────────────────────────────────────────
-- Lo que hay que contarle a Google o mandar por push se escribe AQUÍ, en la
-- misma transacción que el cambio. Si Google falla, la compra sigue siendo
-- válida y esto se reintenta. Nunca promesas en memoria tras responder.
create table if not exists public.loyalty_outbox (
    id               bigint generated always as identity primary key,
    company_id       text,
    kind             text not null check (kind in ('wallet.class.sync', 'wallet.object.sync', 'push.send')),
    payload          jsonb not null default '{}'::jsonb,
    dedupe_key       text,
    status           text not null default 'pending'
                     check (status in ('pending', 'processing', 'done', 'retry', 'dead')),
    attempts         integer not null default 0,
    max_attempts     integer not null default 8,
    next_attempt_at  timestamptz not null default now(),
    locked_at        timestamptz,
    locked_by        text,
    last_error       text,
    result           jsonb,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    done_at          timestamptz
);
-- Un solo trabajo PENDIENTE por clave. El que está en curso no cuenta: pudo
-- leer el estado anterior, así que un cambio nuevo sí necesita otro trabajo.
create unique index if not exists ux_loyalty_outbox_dedupe
    on public.loyalty_outbox (dedupe_key) where status in ('pending', 'retry');
create index if not exists ix_loyalty_outbox_due
    on public.loyalty_outbox (next_attempt_at) where status in ('pending', 'retry');
create index if not exists ix_loyalty_outbox_company on public.loyalty_outbox (company_id, status, created_at desc);

-- Para recibos de terceros (callbacks de Google Wallet) cuando se verifiquen
-- sus firmas. Hoy no hay endpoint que escriba aquí: ver README.
create table if not exists public.loyalty_webhook_receipts (
    id           bigint generated always as identity primary key,
    provider     text not null,
    external_id  text,
    verified     boolean not null default false,
    payload      jsonb not null,
    received_at  timestamptz not null default now(),
    unique (provider, external_id)
);

-- ── Auditoría y límites ───────────────────────────────────────────────────────
create table if not exists public.loyalty_audit_log (
    id          bigint generated always as identity primary key,
    company_id  text,
    actor       text,
    actor_kind  text not null check (actor_kind in ('user', 'platform_admin', 'server', 'public')),
    action      text not null,
    entity      text,
    entity_id   text,
    context     jsonb,
    created_at  timestamptz not null default now()
);
create index if not exists ix_loyalty_audit_company on public.loyalty_audit_log (company_id, created_at desc);

create table if not exists public.loyalty_rate_limits (
    bucket        text primary key,
    window_start  timestamptz not null,
    hits          integer not null
);
