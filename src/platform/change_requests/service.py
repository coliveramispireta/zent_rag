# =============================================================================
# Change requests — sustento auditable de los cambios de configuración
# =============================================================================
# Ciclo: open → taken (token temporal) → resolved. El token vive solo mientras
# el requerimiento está tomado y sin vencer; al resolverlo se revoca.
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import text

from src.infrastructure.postgres.session import get_async_session

GRANT_TTL_HOURS = 2

_LIST_SQL = """
    SELECT cr.id, cr.organization_id, o.name AS organization_name, cr.kind,
           cr.title, cr.description, cr.status, cr.opened_by, cr.taken_by,
           cr.taken_at, cr.grant_expires_at, cr.resolved_by, cr.resolved_at,
           cr.resolution_note, cr.created_at
    FROM change_requests cr
    JOIN organizations o ON o.id = cr.organization_id
    ORDER BY cr.created_at DESC
    LIMIT 200
"""

_GET_SQL = """
    SELECT id, organization_id, kind, title, description, status, opened_by,
           taken_by, taken_at, grant_expires_at, resolved_by, resolved_at,
           resolution_note, created_at
    FROM change_requests WHERE id = :id
"""

_INSERT_SQL = """
    INSERT INTO change_requests (organization_id, kind, title, description, opened_by)
    VALUES (:oid, :kind, :title, :description, :opened_by)
    RETURNING id
"""

_TAKE_SQL = """
    UPDATE change_requests
    SET status = 'taken', taken_by = :uid, taken_at = NOW(),
        grant_token_hash = :hash, grant_expires_at = NOW() + INTERVAL '2 hours',
        revoked_at = NULL, updated_at = NOW()
    WHERE id = :id AND status = 'open'
    RETURNING id, grant_expires_at
"""

_RELEASE_SQL = """
    UPDATE change_requests
    SET status = 'open', taken_by = NULL, taken_at = NULL, grant_token_hash = NULL,
        grant_expires_at = NULL, revoked_at = NOW(), updated_at = NOW()
    WHERE id = :id AND status = 'taken'
    RETURNING id
"""

_RESOLVE_SQL = """
    UPDATE change_requests
    SET status = 'resolved', resolved_by = :uid, resolved_at = NOW(),
        resolution_note = :note, grant_token_hash = NULL, revoked_at = NOW(),
        updated_at = NOW()
    WHERE id = :id AND status = 'taken'
    RETURNING id
"""

_VALIDATE_SQL = """
    SELECT id, status, grant_expires_at
    FROM change_requests
    WHERE grant_token_hash = :hash AND organization_id = :oid
"""

_EXPIRE_SQL = """
    UPDATE change_requests
    SET status = 'expired', grant_token_hash = NULL, revoked_at = NOW(),
        updated_at = NOW()
    WHERE id = :id AND status = 'taken'
"""


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _row_to_request(row) -> dict:
    return {
        "id": str(row.id),
        "organization_id": str(row.organization_id),
        "kind": row.kind,
        "title": row.title,
        "description": row.description,
        "status": row.status,
        "opened_by": str(row.opened_by) if row.opened_by else None,
        "taken_by": str(row.taken_by) if row.taken_by else None,
        "taken_at": row.taken_at.isoformat() if row.taken_at else None,
        "grant_expires_at": (
            row.grant_expires_at.isoformat() if row.grant_expires_at else None
        ),
        "resolved_by": str(row.resolved_by) if row.resolved_by else None,
        "resolved_at": row.resolved_at.isoformat() if row.resolved_at else None,
        "resolution_note": row.resolution_note,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


async def list_requests(organization_id: UUID | None = None) -> list[dict]:
    session = await get_async_session()
    try:
        rows = (await session.execute(text(_LIST_SQL))).fetchall()
    finally:
        await session.close()
    items = [
        {**_row_to_request(row), "organization_name": row.organization_name}
        for row in rows
    ]
    if organization_id is not None:
        items = [
            item
            for item in items
            if item["organization_id"] == str(organization_id)
        ]
    return items


async def get_request(request_id: UUID) -> dict | None:
    session = await get_async_session()
    try:
        row = (
            await session.execute(text(_GET_SQL), {"id": request_id})
        ).fetchone()
    finally:
        await session.close()
    return _row_to_request(row) if row else None


async def open_request(
    *,
    organization_id: UUID,
    title: str,
    description: str,
    kind: str = "other",
    opened_by: UUID | None = None,
) -> dict:
    session = await get_async_session()
    try:
        row = (
            await session.execute(
                text(_INSERT_SQL),
                {
                    "oid": organization_id,
                    "kind": kind,
                    "title": title,
                    "description": description,
                    "opened_by": opened_by,
                },
            )
        ).fetchone()
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()
    created = await get_request(row.id)
    assert created is not None
    return created


async def take_request(request_id: UUID, user_id: UUID) -> dict | None:
    """Asigna el requerimiento y devuelve el token en claro (única vez)."""
    token = f"cr_{secrets.token_hex(24)}"
    session = await get_async_session()
    try:
        row = (
            await session.execute(
                text(_TAKE_SQL),
                {"id": request_id, "uid": user_id, "hash": _hash(token)},
            )
        ).fetchone()
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()
    if row is None:
        return None
    return {
        "request_id": str(row.id),
        "token": token,
        "expires_at": row.grant_expires_at.isoformat(),
        "ttl_hours": GRANT_TTL_HOURS,
    }


async def release_request(request_id: UUID) -> bool:
    session = await get_async_session()
    try:
        row = (
            await session.execute(text(_RELEASE_SQL), {"id": request_id})
        ).fetchone()
        await session.commit()
    finally:
        await session.close()
    return row is not None


async def resolve_request(
    request_id: UUID, user_id: UUID, note: str
) -> bool:
    session = await get_async_session()
    try:
        row = (
            await session.execute(
                text(_RESOLVE_SQL), {"id": request_id, "uid": user_id, "note": note}
            )
        ).fetchone()
        await session.commit()
    finally:
        await session.close()
    return row is not None


async def validate_grant(token: str, organization_id: UUID) -> str | None:
    """Id del requerimiento si el token es válido para esa organización."""
    if not token:
        return None
    session = await get_async_session()
    try:
        row = (
            await session.execute(
                text(_VALIDATE_SQL),
                {"hash": _hash(token), "oid": organization_id},
            )
        ).fetchone()
        if row is None:
            return None
        expires = row.grant_expires_at
        if expires is not None and expires < datetime.now(timezone.utc):
            await session.execute(text(_EXPIRE_SQL), {"id": row.id})
            await session.commit()
            return None
    finally:
        await session.close()
    return str(row.id)


def grant_ttl() -> timedelta:
    return timedelta(hours=GRANT_TTL_HOURS)
