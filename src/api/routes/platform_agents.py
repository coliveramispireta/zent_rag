# =============================================================================
# Agentes desde el Control Center — alta y edición con sesión de plataforma
# =============================================================================
# Reutiliza PostgresAgentRepository: mismas columnas y mismas reglas que el alta
# del portal del agente.
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from src.api.security import require_change_grant
from src.infrastructure.postgres.relational_db import PostgresAgentRepository
from src.platform.rbac.authorization import require_platform_permission

router = APIRouter(
    prefix="/api/v1/platform/organizations/{org_id}",
    tags=["Platform agents"],
)


class AgentIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(None, max_length=4000)
    system_prompt: str | None = Field(None, max_length=16000)
    model: str | None = Field(None, max_length=100)
    tools: list[str] = Field(default_factory=list, max_length=20)
    knowledge_base_ids: list[str] = Field(default_factory=list, max_length=50)
    is_active: bool = True


class AgentPatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=4000)
    system_prompt: str | None = Field(None, max_length=16000)
    model: str | None = Field(None, max_length=100)
    tools: list[str] | None = Field(None, max_length=20)
    knowledge_base_ids: list[str] | None = Field(None, max_length=50)
    is_active: bool | None = None


def _org(org_id: str) -> UUID:
    try:
        return UUID(org_id)
    except ValueError:
        raise HTTPException(400, "org_id must be a valid UUID") from None


def _kb_ids(raw: list[str]) -> list[str]:
    out: list[str] = []
    for value in raw:
        try:
            out.append(str(UUID(value)))
        except ValueError:
            raise HTTPException(400, f"knowledge_base_id inválido: {value}") from None
    return out


def _serialize(agent) -> dict:
    config = agent.config_json or {}
    return {
        "id": str(agent.id),
        "name": agent.name,
        "description": agent.description,
        "system_prompt": agent.system_prompt,
        "model": agent.model,
        "tools": agent.tools or [],
        "is_active": agent.is_active,
        "knowledge_base_ids": config.get("knowledge_base_ids", []),
        "created_at": agent.created_at.isoformat() if agent.created_at else None,
    }


async def _audit_write(request: Request, action: str, org_id: str, agent_id: str, fields) -> None:
    from src.api.routes.platform import _audit

    ctx = require_platform_permission(request, "tenant.write")
    await _audit().write_or_raise(
        ctx,
        action,
        "agent",
        agent_id,
        organization_id=UUID(org_id),
        metadata={"fields": sorted(fields)},
    )


@router.get("/agents/{agent_id}", summary="Detalle de un agente")
async def platform_get_agent(org_id: str, agent_id: str, request: Request):
    require_platform_permission(request, "tenant.read")
    repo = PostgresAgentRepository()
    agent = await repo.get_agent(_org(org_id), UUID(agent_id))
    if agent is None:
        raise HTTPException(404, "Agent not found")
    return _serialize(agent)


@router.post("/agents", status_code=201, summary="Crear agente")
async def platform_create_agent(org_id: str, body: AgentIn, request: Request):
    ctx = require_platform_permission(request, "tenant.write")
    oid = _org(org_id)
    await require_change_grant(request, oid)
    repo = PostgresAgentRepository()
    from sqlalchemy.exc import IntegrityError

    try:
        agent = await repo.create_agent(
            oid,
            body.name.strip(),
            description=body.description,
            system_prompt=body.system_prompt,
            tools=body.tools,
            model=body.model,
            config_json={"knowledge_base_ids": _kb_ids(body.knowledge_base_ids)},
            created_by=ctx.user_id,
        )
    except IntegrityError:
        raise HTTPException(
            409,
            {
                "error_code": "duplicate_agent_name",
                "message": f"Ya existe un agente llamado «{body.name}» en esta organización.",
            },
        ) from None
    if not body.is_active:
        agent = await repo.update_agent(oid, agent.id, is_active=False)
    await _audit_write(request, "platform.agent_created", org_id, str(agent.id), body.model_dump())
    return _serialize(agent)


@router.patch("/agents/{agent_id}", summary="Editar agente")
async def platform_update_agent(
    org_id: str, agent_id: str, body: AgentPatch, request: Request
):
    require_platform_permission(request, "tenant.write")
    oid = _org(org_id)
    await require_change_grant(request, oid)
    repo = PostgresAgentRepository()
    current = await repo.get_agent(oid, UUID(agent_id))
    if current is None:
        raise HTTPException(404, "Agent not found")

    fields = body.model_dump(exclude_none=True)
    kb_ids = fields.pop("knowledge_base_ids", None)
    if kb_ids is not None:
        fields["config_json"] = {**(current.config_json or {}), "knowledge_base_ids": _kb_ids(kb_ids)}
    if "name" in fields:
        fields["name"] = fields["name"].strip()
    if not fields:
        raise HTTPException(400, "Nada que actualizar")
    agent = await repo.update_agent(oid, UUID(agent_id), **fields)
    await _audit_write(request, "platform.agent_updated", org_id, agent_id, fields)
    return _serialize(agent)
