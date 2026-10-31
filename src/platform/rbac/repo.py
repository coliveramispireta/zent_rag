# =============================================================================
# Platform RBAC — repositorio de roles de plataforma (Control Center)
# =============================================================================
from __future__ import annotations

from uuid import UUID

from sqlalchemy import text

from src.infrastructure.postgres.session import get_async_session


async def get_platform_roles_for_user(user_id: UUID) -> tuple[list[str], set[str]]:
    """(nombres de rol, permisos) de un usuario de plataforma."""
    session = await get_async_session()
    try:
        result = await session.execute(
            text(
                "SELECT pr.name AS role_name, p.code AS permission "
                "FROM user_platform_roles upr "
                "JOIN platform_roles pr ON pr.id = upr.role_id "
                "LEFT JOIN platform_role_permissions prp ON prp.role_id = pr.id "
                "LEFT JOIN permissions p ON p.id = prp.permission_id "
                "WHERE upr.user_id = :uid"
            ),
            {"uid": user_id},
        )
        rows = result.fetchall()
    finally:
        await session.close()
    roles: list[str] = []
    permissions: set[str] = set()
    for row in rows:
        if row.role_name and row.role_name not in roles:
            roles.append(row.role_name)
        if row.permission:
            permissions.add(row.permission)
    return roles, permissions


async def list_platform_roles() -> list[dict]:
    """Roles de plataforma con sus permisos (para la UI del Control Center)."""
    session = await get_async_session()
    try:
        result = await session.execute(
            text(
                "SELECT pr.id, pr.name, pr.description, pr.is_system, "
                "COALESCE(array_agg(p.code ORDER BY p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS perms "
                "FROM platform_roles pr "
                "LEFT JOIN platform_role_permissions prp ON prp.role_id = pr.id "
                "LEFT JOIN permissions p ON p.id = prp.permission_id "
                "GROUP BY pr.id, pr.name, pr.description, pr.is_system "
                "ORDER BY pr.is_system DESC, pr.name"
            )
        )
        rows = result.fetchall()
    finally:
        await session.close()
    return [
        {
            "id": str(row.id),
            "name": row.name,
            "description": row.description,
            "is_system": row.is_system,
            "permissions": list(row.perms),
        }
        for row in rows
    ]


async def list_platform_users() -> list[dict]:
    """Usuarios de plataforma (email + roles)."""
    from src.infrastructure.postgres.relational_db import ensure_platform_admin_schema

    await ensure_platform_admin_schema()
    session = await get_async_session()
    try:
        result = await session.execute(
            text(
                "SELECT u.id, u.email, u.is_platform_admin, u.disabled_at, "
                "COALESCE(array_agg(pr.name ORDER BY pr.name) FILTER (WHERE pr.name IS NOT NULL), '{}') AS roles "
                "FROM users u "
                "LEFT JOIN user_platform_roles upr ON upr.user_id = u.id "
                "LEFT JOIN platform_roles pr ON pr.id = upr.role_id "
                "WHERE u.is_platform_admin OR upr.user_id IS NOT NULL "
                "GROUP BY u.id, u.email, u.is_platform_admin, u.disabled_at "
                "ORDER BY u.email"
            )
        )
        rows = result.fetchall()
    finally:
        await session.close()
    return [
        {
            "id": str(row.id),
            "email": row.email,
            "is_platform_admin": row.is_platform_admin,
            "roles": list(row.roles),
            "disabled_at": row.disabled_at.isoformat() if row.disabled_at else None,
        }
        for row in rows
    ]


async def assign_platform_role(user_id: UUID, role_name: str) -> bool:
    """Asigna un rol de plataforma a un usuario. True si cambió algo."""
    session = await get_async_session()
    try:
        result = await session.execute(
            text(
                "INSERT INTO user_platform_roles (user_id, role_id) "
                "SELECT :uid, id FROM platform_roles WHERE name = :role "
                "ON CONFLICT DO NOTHING"
            ),
            {"uid": user_id, "role": role_name},
        )
        changed = result.rowcount > 0
        # Solo `super_admin` marca la bandera de plataforma; `admin` y
        # `operador` son personal interno gobernado por pantallas.
        if changed and role_name == "super_admin":
            await session.execute(
                text("UPDATE users SET is_platform_admin = true WHERE id = :uid"),
                {"uid": user_id},
            )
        await session.commit()
        return changed
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


async def revoke_platform_role(user_id: UUID, role_name: str) -> bool:
    """Revoca un rol de plataforma. True si cambió algo."""
    session = await get_async_session()
    try:
        result = await session.execute(
            text(
                "DELETE FROM user_platform_roles "
                "WHERE user_id = :uid AND role_id IN "
                "(SELECT id FROM platform_roles WHERE name = :role)"
            ),
            {"uid": user_id, "role": role_name},
        )
        remaining = await session.execute(
            text("SELECT COUNT(*) FROM user_platform_roles WHERE user_id = :uid"),
            {"uid": user_id},
        )
        if remaining.scalar() == 0:
            await session.execute(
                text("UPDATE users SET is_platform_admin = false WHERE id = :uid"),
                {"uid": user_id},
            )
        await session.commit()
        return result.rowcount > 0
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


async def role_name_exists(role_name: str, organization_id: UUID | None = None) -> bool:
    """¿Existe un rol (sistema o de la organización) asignable a un miembro?"""
    session = await get_async_session()
    try:
        result = await session.execute(
            text(
                "SELECT COUNT(*) FROM roles "
                "WHERE name = :name AND (organization_id IS NULL OR organization_id = :org)"
            ),
            {"name": role_name, "org": organization_id},
        )
        return result.scalar() > 0
    finally:
        await session.close()


async def get_platform_user(user_id: UUID) -> dict | None:
    """Usuario de plataforma por id (None si no existe o no es de plataforma)."""
    from src.infrastructure.postgres.relational_db import ensure_platform_admin_schema

    await ensure_platform_admin_schema()
    session = await get_async_session()
    try:
        result = await session.execute(
            text(
                "SELECT u.id, u.email, u.is_platform_admin, u.disabled_at, "
                "COALESCE(array_agg(pr.name ORDER BY pr.name) FILTER (WHERE pr.name IS NOT NULL), '{}') AS roles "
                "FROM users u "
                "LEFT JOIN user_platform_roles upr ON upr.user_id = u.id "
                "LEFT JOIN platform_roles pr ON pr.id = upr.role_id "
                "WHERE u.id = :uid AND (u.is_platform_admin OR upr.user_id IS NOT NULL) "
                "GROUP BY u.id, u.email, u.is_platform_admin, u.disabled_at"
            ),
            {"uid": user_id},
        )
        row = result.fetchone()
    finally:
        await session.close()
    if row is None:
        return None
    return {
        "id": str(row.id),
        "email": row.email,
        "is_platform_admin": row.is_platform_admin,
        "roles": list(row.roles),
        "disabled_at": row.disabled_at.isoformat() if row.disabled_at else None,
    }


async def create_platform_user(email: str) -> UUID:
    """Crea un usuario de plataforma sin password (entra vía reset token)."""
    import hashlib
    from uuid import uuid4 as _uuid4

    from src.infrastructure.postgres.relational_db import ensure_platform_admin_schema

    await ensure_platform_admin_schema()
    user_id = _uuid4()
    normalized = email.strip().lower()
    session = await get_async_session()
    try:
        await session.execute(
            text(
                "INSERT INTO users "
                "(id, organization_id, external_id, email_hash, role, email, is_platform_admin) "
                "VALUES (:id, NULL, :ext, :eh, 'admin', :email, true)"
            ),
            {
                "id": user_id,
                "ext": f"platform-{_uuid4().hex[:12]}",
                "eh": hashlib.sha256(normalized.encode("utf-8")).hexdigest(),
                "email": normalized,
            },
        )
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()
    return user_id


async def count_active_super_admins() -> int:
    """Cantidad de super_admins de plataforma activos (no desactivados)."""
    from src.infrastructure.postgres.relational_db import ensure_platform_admin_schema

    await ensure_platform_admin_schema()
    session = await get_async_session()
    try:
        result = await session.execute(
            text(
                "SELECT COUNT(DISTINCT u.id) FROM users u "
                "JOIN user_platform_roles upr ON upr.user_id = u.id "
                "JOIN platform_roles pr ON pr.id = upr.role_id "
                "WHERE pr.name = 'super_admin' AND u.disabled_at IS NULL"
            )
        )
        return int(result.scalar() or 0)
    finally:
        await session.close()


# ---------------------------------------------------------------------------
# Pantallas del personal interno (Zitadel pendiente: usuarios mock)
# ---------------------------------------------------------------------------


async def list_screens() -> list[dict]:
    """Catálogo de pantallas de plataforma, en orden de presentación."""
    session = await get_async_session()
    try:
        result = await session.execute(
            text(
                "SELECT code, name, category, path, sort_order FROM screens "
                "ORDER BY sort_order, code"
            )
        )
        rows = result.fetchall()
    finally:
        await session.close()
    return [
        {
            "code": row.code,
            "name": row.name,
            "category": row.category,
            "path": row.path,
            "sort_order": row.sort_order,
        }
        for row in rows
    ]


async def list_platform_staff() -> list[dict]:
    """Personal de Omnio con su rol y sus pantallas asignadas."""
    from src.infrastructure.postgres.relational_db import ensure_platform_admin_schema

    await ensure_platform_admin_schema()
    session = await get_async_session()
    try:
        rows = (
            await session.execute(
                text(
                    "SELECT u.id, u.email, u.disabled_at, u.is_platform_admin, "
                    "u.is_platform_staff, "
                    "COALESCE(array_agg(pr.name ORDER BY pr.name) "
                    "FILTER (WHERE pr.name IS NOT NULL), '{}') AS roles "
                    "FROM users u "
                    "LEFT JOIN user_platform_roles upr ON upr.user_id = u.id "
                    "LEFT JOIN platform_roles pr ON pr.id = upr.role_id "
                    "WHERE u.is_platform_staff "
                    "GROUP BY u.id, u.email, u.disabled_at, u.is_platform_admin, "
                    "u.is_platform_staff "
                    "ORDER BY u.email"
                )
            )
        ).fetchall()
        perms = (
            await session.execute(
                text(
                    "SELECT user_id, screen_code, level "
                    "FROM user_screen_permissions ORDER BY screen_code"
                )
            )
        ).fetchall()
    finally:
        await session.close()

    by_user: dict[str, list[dict]] = {}
    for perm in perms:
        by_user.setdefault(str(perm.user_id), []).append(
            {"code": perm.screen_code, "level": perm.level}
        )
    return [
        {
            "id": str(row.id),
            "email": row.email,
            "roles": list(row.roles),
            "is_platform_admin": row.is_platform_admin,
            "is_platform_staff": row.is_platform_staff,
            "disabled_at": row.disabled_at.isoformat() if row.disabled_at else None,
            "screens": by_user.get(str(row.id), []),
        }
        for row in rows
    ]


async def get_staff_user(user_id: UUID) -> dict | None:
    """Personal interno por id (None si no existe o no es personal)."""
    from src.infrastructure.postgres.relational_db import ensure_platform_admin_schema

    await ensure_platform_admin_schema()
    session = await get_async_session()
    try:
        row = (
            await session.execute(
                text(
                    "SELECT id, email, disabled_at, is_platform_admin, is_platform_staff "
                    "FROM users WHERE id = :uid AND is_platform_staff"
                ),
                {"uid": user_id},
            )
        ).fetchone()
    finally:
        await session.close()
    if row is None:
        return None
    return {
        "id": str(row.id),
        "email": row.email,
        "is_platform_admin": row.is_platform_admin,
        "is_platform_staff": row.is_platform_staff,
        "disabled_at": row.disabled_at.isoformat() if row.disabled_at else None,
    }


async def create_staff_user(email: str, password: str) -> UUID:
    """Alta de personal interno (sin organización, sin rol por defecto)."""
    import hashlib
    from uuid import uuid4 as _uuid4

    from src.platform.auth.passwords import hash_password

    user_id = _uuid4()
    normalized = email.strip().lower()
    session = await get_async_session()
    try:
        await session.execute(
            text(
                "INSERT INTO users "
                "(id, organization_id, external_id, email_hash, role, email, "
                "password_hash, is_platform_admin, is_platform_staff) "
                "VALUES (:id, NULL, :ext, :eh, 'staff', :email, :pwd, false, true)"
            ),
            {
                "id": user_id,
                "ext": normalized,
                "eh": hashlib.sha256(normalized.encode("utf-8")).hexdigest(),
                "email": normalized,
                "pwd": hash_password(password),
            },
        )
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()
    return user_id


async def set_user_screens(user_id: UUID, screens: list[dict]) -> None:
    """Reemplaza las pantallas de un usuario con su nivel (read | full)."""
    session = await get_async_session()
    try:
        await session.execute(
            text("DELETE FROM user_screen_permissions WHERE user_id = :uid"),
            {"uid": user_id},
        )
        for item in screens:
            await session.execute(
                text(
                    "INSERT INTO user_screen_permissions (user_id, screen_code, level) "
                    "VALUES (:uid, :code, :level)"
                ),
                {
                    "uid": user_id,
                    "code": item["code"],
                    "level": item.get("level", "read"),
                },
            )
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


async def get_effective_screens(user_id: UUID) -> list[dict]:
    """Pantallas visibles para el usuario: las del rol más las propias.

    El nivel efectivo es el mayor entre rol y usuario: `full` gana a `read`.
    `super_admin` ve todas las pantallas con `full`.
    """
    session = await get_async_session()
    try:
        is_super = await session.execute(
            text(
                "SELECT COUNT(*) FROM user_platform_roles upr "
                "JOIN platform_roles pr ON pr.id = upr.role_id "
                "WHERE upr.user_id = :uid AND pr.name = 'super_admin'"
            ),
            {"uid": user_id},
        )
        super_admin = int(is_super.scalar() or 0) > 0
        if super_admin:
            rows = (
                await session.execute(
                    text("SELECT code FROM screens ORDER BY sort_order, code")
                )
            ).fetchall()
            return [{"code": row.code, "level": "full"} for row in rows]
        rows = (
            await session.execute(
                text(
                    "SELECT screen_code, "
                    "CASE MAX(CASE level WHEN 'full' THEN 2 ELSE 1 END) "
                    "WHEN 2 THEN 'full' ELSE 'read' END AS level FROM ("
                    "  SELECT ups.screen_code, ups.level "
                    "  FROM user_screen_permissions ups WHERE ups.user_id = :uid "
                    "  UNION ALL "
                    "  SELECT prs.screen_code, 'read' AS level "
                    "  FROM platform_role_screens prs "
                    "  JOIN user_platform_roles upr ON upr.role_id = prs.role_id "
                    "  WHERE upr.user_id = :uid"
                    ") AS s GROUP BY screen_code ORDER BY screen_code"
                ),
                {"uid": user_id},
            )
        ).fetchall()
    finally:
        await session.close()
    return [
        {"code": row.screen_code, "level": row.level}
        for row in rows
    ]


async def list_role_screens() -> dict[str, list[str]]:
    """Pantallas asignadas a cada rol (vacías si nadie las asignó)."""
    session = await get_async_session()
    try:
        rows = (
            await session.execute(
                text(
                    "SELECT pr.name, COALESCE(array_agg(prs.screen_code ORDER BY prs.screen_code) "
                    "FILTER (WHERE prs.screen_code IS NOT NULL), '{}') AS screens "
                    "FROM platform_roles pr "
                    "LEFT JOIN platform_role_screens prs ON prs.role_id = pr.id "
                    "GROUP BY pr.name ORDER BY pr.name"
                )
            )
        ).fetchall()
    finally:
        await session.close()
    return {row.name: list(row.screens) for row in rows}


async def set_role_screens(role_name: str, screen_codes: list[str]) -> bool:
    """Reemplaza las pantallas de un rol. False si el rol no existe."""
    session = await get_async_session()
    try:
        role = await session.execute(
            text("SELECT id FROM platform_roles WHERE name = :name"),
            {"name": role_name},
        )
        row = role.fetchone()
        if row is None:
            return False
        await session.execute(
            text("DELETE FROM platform_role_screens WHERE role_id = :rid"),
            {"rid": row.id},
        )
        for code in screen_codes:
            await session.execute(
                text(
                    "INSERT INTO platform_role_screens (role_id, screen_code) "
                    "VALUES (:rid, :code)"
                ),
                {"rid": row.id, "code": code},
            )
        await session.commit()
        return True
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()
