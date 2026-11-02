# =============================================================================
# Consumo y presupuesto — tokens medidos, créditos facturados
# =============================================================================
# Se mide lo real (tokens de entrada/salida/embedding por modelo en
# `usage_events`) y se convierte a créditos con `model_rates`. El presupuesto es
# mensual por organización, sobre mes calendario America/Lima.
from __future__ import annotations

from datetime import datetime, time
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import text

from src.infrastructure.postgres.session import get_async_session

LIMA = ZoneInfo("America/Lima")

_CREDITS_EXPR = """
    COALESCE(ue.prompt_tokens, 0) / 1000.0
        * COALESCE(r.input_credits_per_1k, d.input_credits_per_1k)
  + COALESCE(ue.completion_tokens, 0) / 1000.0
        * COALESCE(r.output_credits_per_1k, d.output_credits_per_1k)
  + COALESCE(ue.embedding_tokens, 0) / 1000.0
        * COALESCE(r.embedding_credits_per_1k, d.embedding_credits_per_1k)
"""

_FROM = """
    FROM usage_events ue
    LEFT JOIN model_rates r ON r.model = ue.model
    CROSS JOIN (SELECT * FROM model_rates WHERE model = '__default__') d
"""

_WHERE = """
    WHERE ue.organization_id = :oid AND ue.created_at >= :from AND ue.created_at < :to
"""

_TOTALS_SQL = f"""
    SELECT COALESCE(SUM({_CREDITS_EXPR}), 0) AS credits,
           COALESCE(SUM(ue.prompt_tokens), 0) AS tokens_in,
           COALESCE(SUM(ue.completion_tokens), 0) AS tokens_out,
           COALESCE(SUM(ue.embedding_tokens), 0) AS tokens_embedding,
           COUNT(*) AS events
    {_FROM} {_WHERE}
"""

_BY_MODEL_SQL = f"""
    SELECT COALESCE(ue.model, 'desconocido') AS label,
           SUM({_CREDITS_EXPR}) AS credits,
           SUM(ue.total_tokens) AS tokens,
           COUNT(*) AS events
    {_FROM} {_WHERE}
    GROUP BY 1 ORDER BY credits DESC LIMIT 20
"""

_BY_APPLICATION_SQL = f"""
    SELECT COALESCE(a.name, 'Acceso directo') AS label,
           SUM({_CREDITS_EXPR}) AS credits,
           COUNT(*) AS events
    {_FROM}
    LEFT JOIN applications a ON a.id = ue.application_id
    {_WHERE}
    GROUP BY 1 ORDER BY credits DESC LIMIT 20
"""

_BY_AGENT_SQL = f"""
    SELECT COALESCE(ag.name, 'Sin agente') AS label,
           SUM({_CREDITS_EXPR}) AS credits,
           COUNT(*) AS events
    {_FROM}
    LEFT JOIN agents ag ON ag.id = ue.agent_id
    {_WHERE}
    GROUP BY 1 ORDER BY credits DESC LIMIT 20
"""

_BUDGET_SQL = """
    SELECT monthly_credits, alert_threshold, block_on_limit, alert_sent_at,
           blocked_at, updated_at
    FROM organization_budgets WHERE organization_id = :oid
"""

_UPSERT_BUDGET_SQL = """
    INSERT INTO organization_budgets
        (organization_id, monthly_credits, alert_threshold, block_on_limit, updated_by)
    VALUES (:oid, :credits, :threshold, :block, :uid)
    ON CONFLICT (organization_id) DO UPDATE
    SET monthly_credits = EXCLUDED.monthly_credits,
        alert_threshold = EXCLUDED.alert_threshold,
        block_on_limit = EXCLUDED.block_on_limit,
        updated_by = EXCLUDED.updated_by,
        alert_sent_at = NULL,
        blocked_at = NULL,
        updated_at = NOW()
    RETURNING organization_id
"""


def period_bounds(now: datetime | None = None) -> tuple[datetime, datetime]:
    """Mes calendario en America/Lima, devuelto en UTC naive para SQL."""
    local = (now or datetime.now(LIMA)).astimezone(LIMA)
    start = datetime.combine(local.date().replace(day=1), time.min, tzinfo=LIMA)
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    return (
        start.astimezone(ZoneInfo("UTC")).replace(tzinfo=None),
        end.astimezone(ZoneInfo("UTC")).replace(tzinfo=None),
    )


async def _fetch(sql: str, params: dict) -> list:
    session = await get_async_session()
    try:
        return (await session.execute(text(sql), params)).fetchall()
    finally:
        await session.close()


async def get_budget_row(organization_id: UUID) -> dict:
    rows = await _fetch(_BUDGET_SQL, {"oid": organization_id})
    if not rows:
        return {
            "monthly_credits": 0.0,
            "alert_threshold": 0.8,
            "block_on_limit": True,
            "alert_sent_at": None,
            "blocked_at": None,
            "updated_at": None,
        }
    row = rows[0]
    return {
        "monthly_credits": float(row.monthly_credits),
        "alert_threshold": float(row.alert_threshold),
        "block_on_limit": bool(row.block_on_limit),
        "alert_sent_at": row.alert_sent_at.isoformat() if row.alert_sent_at else None,
        "blocked_at": row.blocked_at.isoformat() if row.blocked_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


async def set_budget(
    organization_id: UUID,
    monthly_credits: float,
    alert_threshold: float,
    block_on_limit: bool,
    user_id: UUID | None,
) -> dict:
    session = await get_async_session()
    try:
        await session.execute(
            text(_UPSERT_BUDGET_SQL),
            {
                "oid": organization_id,
                "credits": monthly_credits,
                "threshold": alert_threshold,
                "block": block_on_limit,
                "uid": user_id,
            },
        )
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()
    return await get_budget_row(organization_id)


async def consumption(
    organization_id: UUID, now: datetime | None = None
) -> dict:
    start, end = period_bounds(now)
    params = {"oid": organization_id, "from": start, "to": end}
    totals = (await _fetch(_TOTALS_SQL, params))[0]
    budget = await get_budget_row(organization_id)
    credits = float(totals.credits or 0)
    limit = budget["monthly_credits"]
    pct = (credits / limit) if limit > 0 else 0.0
    if limit <= 0:
        state = "sin_presupuesto"
    elif pct >= 1:
        state = "bloqueado" if budget["block_on_limit"] else "alerta"
    elif pct >= budget["alert_threshold"]:
        state = "alerta"
    else:
        state = "ok"

    by_model = [
        {
            "label": row.label,
            "credits": round(float(row.credits or 0), 4),
            "tokens": int(row.tokens or 0),
            "events": int(row.events or 0),
        }
        for row in await _fetch(_BY_MODEL_SQL, params)
    ]
    by_application = [
        {
            "label": row.label,
            "credits": round(float(row.credits or 0), 4),
            "events": int(row.events or 0),
        }
        for row in await _fetch(_BY_APPLICATION_SQL, params)
    ]
    by_agent = [
        {
            "label": row.label,
            "credits": round(float(row.credits or 0), 4),
            "events": int(row.events or 0),
        }
        for row in await _fetch(_BY_AGENT_SQL, params)
    ]

    return {
        "period": {"from": start.isoformat() + "Z", "to": end.isoformat() + "Z"},
        "budget": {**budget, "state": state},
        "consumption": {
            "credits": round(credits, 4),
            "credits_used_pct": round(pct * 100, 2),
            "tokens_in": int(totals.tokens_in or 0),
            "tokens_out": int(totals.tokens_out or 0),
            "tokens_embedding": int(totals.tokens_embedding or 0),
            "events": int(totals.events or 0),
        },
        "by_model": by_model,
        "by_application": by_application,
        "by_agent": by_agent,
    }


async def is_blocked(organization_id: UUID) -> bool:
    """True si la organización agotó su presupuesto con bloqueo activo."""
    data = await consumption(organization_id)
    return data["budget"]["state"] == "bloqueado"
