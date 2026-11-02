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
    state, pct = budget_state(
        credits, limit, budget["alert_threshold"], budget["block_on_limit"]
    )

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


# Misma fórmula que _CREDITS_EXPR, escrita literal para no interpolar SQL.
_OVERVIEW_SQL = """
    SELECT o.id,
           COALESCE(o.company_name, o.name) AS name,
           COALESCE(b.monthly_credits, 0) AS monthly_credits,
           COALESCE(b.alert_threshold, 0.8) AS alert_threshold,
           COALESCE(b.block_on_limit, TRUE) AS block_on_limit,
           COALESCE(SUM(
               COALESCE(ue.prompt_tokens, 0) / 1000.0
                   * COALESCE(r.input_credits_per_1k, d.input_credits_per_1k)
             + COALESCE(ue.completion_tokens, 0) / 1000.0
                   * COALESCE(r.output_credits_per_1k, d.output_credits_per_1k)
             + COALESCE(ue.embedding_tokens, 0) / 1000.0
                   * COALESCE(r.embedding_credits_per_1k, d.embedding_credits_per_1k)
           ), 0) AS credits,
           COUNT(ue.id) AS events
    FROM organizations o
    LEFT JOIN organization_budgets b ON b.organization_id = o.id
    LEFT JOIN usage_events ue
        ON ue.organization_id = o.id
        AND ue.created_at >= :from AND ue.created_at < :to
    LEFT JOIN model_rates r ON r.model = ue.model
    CROSS JOIN (SELECT * FROM model_rates WHERE model = '__default__') d
    GROUP BY o.id, o.name, o.company_name,
             b.monthly_credits, b.alert_threshold, b.block_on_limit
    ORDER BY credits DESC
"""

_RATES_SQL = """
    SELECT model, input_credits_per_1k, output_credits_per_1k,
           embedding_credits_per_1k, updated_at
    FROM model_rates ORDER BY model
"""

_UPSERT_RATE_SQL = """
    INSERT INTO model_rates
        (model, input_credits_per_1k, output_credits_per_1k,
         embedding_credits_per_1k, updated_at)
    VALUES (:model, :inp, :out, :emb, NOW())
    ON CONFLICT (model) DO UPDATE
    SET input_credits_per_1k = EXCLUDED.input_credits_per_1k,
        output_credits_per_1k = EXCLUDED.output_credits_per_1k,
        embedding_credits_per_1k = EXCLUDED.embedding_credits_per_1k,
        updated_at = NOW()
    RETURNING model
"""

_MARK_ALERT_SQL = """
    UPDATE organization_budgets
    SET alert_sent_at = NOW(),
        blocked_at = CASE WHEN :state = 'bloqueado'
                          THEN COALESCE(blocked_at, NOW()) ELSE blocked_at END
    WHERE organization_id = :oid
      AND (alert_sent_at IS NULL OR alert_sent_at < :start)
    RETURNING organization_id
"""


def budget_state(
    credits: float, limit: float, threshold: float, block: bool
) -> tuple[str, float]:
    if limit <= 0:
        return "sin_presupuesto", 0.0
    pct = credits / limit
    if pct >= 1:
        return ("bloqueado" if block else "alerta"), pct
    if pct >= threshold:
        return "alerta", pct
    return "ok", pct


async def overview(limit: int = 200) -> dict:
    """Consumo del período de todas las organizaciones, de mayor a menor."""
    start, end = period_bounds()
    rows = await _fetch(_OVERVIEW_SQL, {"from": start, "to": end})
    items = []
    for row in rows:
        credits = float(row.credits or 0)
        state, pct = budget_state(
            credits,
            float(row.monthly_credits),
            float(row.alert_threshold),
            bool(row.block_on_limit),
        )
        items.append(
            {
                "organization_id": str(row.id),
                "name": row.name,
                "credits": round(credits, 4),
                "monthly_credits": float(row.monthly_credits),
                "credits_used_pct": round(pct * 100, 2),
                "events": int(row.events or 0),
                "state": state,
            }
        )
    order = {"bloqueado": 0, "alerta": 1, "ok": 2, "sin_presupuesto": 3}
    items.sort(key=lambda item: (order.get(item["state"], 9), -item["credits_used_pct"]))
    return {
        "period": {"from": start.isoformat() + "Z", "to": end.isoformat() + "Z"},
        "organizations": items[:limit],
        "totals": {
            "credits": round(sum(item["credits"] for item in items), 4),
            "alerting": sum(1 for item in items if item["state"] == "alerta"),
            "blocked": sum(1 for item in items if item["state"] == "bloqueado"),
            "without_budget": sum(
                1 for item in items if item["state"] == "sin_presupuesto"
            ),
        },
    }


async def list_rates() -> list[dict]:
    rows = await _fetch(_RATES_SQL, {})
    return [
        {
            "model": row.model,
            "input_credits_per_1k": float(row.input_credits_per_1k),
            "output_credits_per_1k": float(row.output_credits_per_1k),
            "embedding_credits_per_1k": float(row.embedding_credits_per_1k),
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }
        for row in rows
    ]


async def upsert_rate(
    model: str, input_rate: float, output_rate: float, embedding_rate: float
) -> dict:
    session = await get_async_session()
    try:
        await session.execute(
            text(_UPSERT_RATE_SQL),
            {"model": model, "inp": input_rate, "out": output_rate, "emb": embedding_rate},
        )
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()
    return {
        "model": model,
        "input_credits_per_1k": input_rate,
        "output_credits_per_1k": output_rate,
        "embedding_credits_per_1k": embedding_rate,
    }


async def mark_alert(organization_id: UUID, state: str) -> bool:
    """Marca el aviso del período. True solo la primera vez que cruza el umbral."""
    if state not in ("alerta", "bloqueado"):
        return False
    start, _ = period_bounds()
    session = await get_async_session()
    try:
        row = (
            await session.execute(
                text(_MARK_ALERT_SQL),
                {"oid": organization_id, "state": state, "start": start},
            )
        ).fetchone()
        await session.commit()
    finally:
        await session.close()
    return row is not None


async def is_blocked(organization_id: UUID) -> bool:
    """True si la organización agotó su presupuesto con bloqueo activo."""
    data = await consumption(organization_id)
    return data["budget"]["state"] == "bloqueado"
