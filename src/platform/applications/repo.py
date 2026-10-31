# =============================================================================
# Applications — origen del acceso de una organización (Nivel 2)
# =============================================================================
# Una aplicación identifica al producto o canal que consume Zent en nombre de
# una organización (Mentora, OMNIO+, futuras). `api_keys.application_id = NULL`
# representa el acceso directo (contrato de agente directo).
# =============================================================================
from __future__ import annotations

from uuid import UUID

from sqlalchemy import text

from src.infrastructure.postgres.session import get_async_session

_LIST_SQL = """
    SELECT a.id, a.code, a.name, a.kind, a.status, a.partner_id, a.description,
           a.created_at, a.updated_at,
           COUNT(DISTINCT k.organization_id) AS organizations,
           COUNT(k.id) AS api_keys
    FROM applications a
    LEFT JOIN api_keys k ON k.application_id = a.id
    GROUP BY a.id
    ORDER BY a.name
"""

_GET_SQL = """
    SELECT id, code, name, kind, status, partner_id, description,
           created_at, updated_at
    FROM applications
    WHERE id = :aid
"""

_INSERT_SQL = """
    INSERT INTO applications (code, name, kind, description, partner_id)
    VALUES (:code, :name, :kind, :description, :partner_id)
    RETURNING id, code, name, kind, status, partner_id, description,
              created_at, updated_at
"""

_UPDATE_SQL = """
    UPDATE applications SET
        name = COALESCE(:name, name),
        status = COALESCE(:status, status),
        description = COALESCE(:description, description),
        kind = COALESCE(:kind, kind),
        updated_at = NOW()
    WHERE id = :aid
    RETURNING id, code, name, kind, status, partner_id, description,
              created_at, updated_at
"""

_ORG_APPS_SQL = """
    SELECT a.id, a.code, a.name, a.kind, a.status,
           COUNT(k.id) AS api_keys, MAX(k.last_used_at) AS last_used_at
    FROM api_keys k
    JOIN applications a ON a.id = k.application_id
    WHERE k.organization_id = :oid
    GROUP BY a.id, a.code, a.name, a.kind, a.status
    ORDER BY a.name
"""

_DIRECT_KEYS_SQL = """
    SELECT COUNT(*) AS n FROM api_keys
    WHERE organization_id = :oid AND application_id IS NULL
"""


def _row_to_app(row) -> dict:
    return {
        "id": str(row.id),
        "code": row.code,
        "name": row.name,
        "kind": row.kind,
        "status": row.status,
        "partner_id": str(row.partner_id) if row.partner_id else None,
        "description": row.description,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


async def list_applications() -> list[dict]:
    """Todas las aplicaciones con cuántas organizaciones y claves las usan."""
    session = await get_async_session()
    try:
        rows = (await session.execute(text(_LIST_SQL))).fetchall()
    finally:
        await session.close()
    return [
        {
            **_row_to_app(row),
            "organizations": int(row.organizations or 0),
            "api_keys": int(row.api_keys or 0),
        }
        for row in rows
    ]


async def get_application(app_id: UUID) -> dict | None:
    session = await get_async_session()
    try:
        row = (await session.execute(text(_GET_SQL), {"aid": app_id})).fetchone()
    finally:
        await session.close()
    return _row_to_app(row) if row else None


async def create_application(
    *,
    code: str,
    name: str,
    kind: str = "product",
    description: str | None = None,
    partner_id: UUID | None = None,
) -> dict:
    """Alta de una aplicación. `code` es único (clave estable para el cliente)."""
    session = await get_async_session()
    try:
        row = (
            await session.execute(
                text(_INSERT_SQL),
                {
                    "code": code,
                    "name": name,
                    "kind": kind,
                    "description": description,
                    "partner_id": partner_id,
                },
            )
        ).fetchone()
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()
    return _row_to_app(row)


async def update_application(app_id: UUID, **fields) -> dict | None:
    """Actualiza nombre, estado, descripción o tipo. None si no existe."""
    changes = {key: fields.get(key) for key in ("name", "status", "description", "kind") if fields.get(key) is not None}
    session = await get_async_session()
    try:
        row = (
            await session.execute(
                text(_UPDATE_SQL),
                {
                    "aid": app_id,
                    "name": changes.get("name"),
                    "status": changes.get("status"),
                    "description": changes.get("description"),
                    "kind": changes.get("kind"),
                },
            )
        ).fetchone()
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()
    return _row_to_app(row) if row else None


async def organization_applications(org_id: UUID) -> dict:
    """Aplicaciones por las que esta organización consume Zent.

    `direct_access_keys` cuenta las claves de la organización sin aplicación:
    es el contrato de agente directo.
    """
    session = await get_async_session()
    try:
        rows = (await session.execute(text(_ORG_APPS_SQL), {"oid": org_id})).fetchall()
        direct = (await session.execute(text(_DIRECT_KEYS_SQL), {"oid": org_id})).scalar()
    finally:
        await session.close()
    return {
        "applications": [
            {
                "id": str(row.id),
                "code": row.code,
                "name": row.name,
                "kind": row.kind,
                "status": row.status,
                "api_keys": int(row.api_keys or 0),
                "last_used_at": row.last_used_at.isoformat() if row.last_used_at else None,
            }
            for row in rows
        ],
        "direct_access_keys": int(direct or 0),
    }
