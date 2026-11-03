# =============================================================================
# Workflows desde el Control Center — mismo motor, sesión de plataforma
# =============================================================================
# NO es una segunda implementación: cada ruta delega en las funciones de
# `src.platform.workflows.*` que ya usan las rutas del tenant, recibiendo la
# organización por parámetro. Así el editor del Control Center y el portal del
# agente operan sobre los mismos datos y las mismas reglas.
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import text

from src.api.routes.workflows import (
    PinnedDataIn,
    RunIn,
    TriggerIn,
    WorkflowIn,
    WorkflowUpdateIn,
)
from src.api.security import require_change_grant
from src.infrastructure.postgres.session import get_async_session
from src.platform.rbac.authorization import require_platform_permission

router = APIRouter(
    prefix="/api/v1/platform/organizations/{org_id}",
    tags=["Platform workflows"],
)


def _org(org_id: str) -> UUID:
    try:
        return UUID(org_id)
    except ValueError:
        raise HTTPException(400, "org_id must be a valid UUID") from None


async def _read(request: Request, org_id: str) -> UUID:
    require_platform_permission(request, "tenant.read")
    return _org(org_id)


async def _write(request: Request, org_id: str) -> tuple[UUID, str | None]:
    require_platform_permission(request, "tenant.write")
    oid = _org(org_id)
    return oid, await require_change_grant(request, oid)


# ---------------------------------------------------------------------------
# Rutas estáticas primero (evitan que /{workflow_id} las capture)
# ---------------------------------------------------------------------------


@router.get("/workflows", summary="Flujos de trabajo de la organización")
async def platform_list_workflows(org_id: str, request: Request):
    oid = await _read(request, org_id)
    from src.platform.workflows.engine import list_workflows

    return await list_workflows(oid, None)


@router.post("/workflows", status_code=201, summary="Crear flujo de trabajo")
async def platform_create_workflow(
    org_id: str, body: WorkflowIn, request: Request
):
    oid, grant = await _write(request, org_id)
    from src.platform.workflows.engine import create_workflow

    ctx = require_platform_permission(request, "tenant.write")
    try:
        return await create_workflow(
            oid,
            body.name,
            body.trigger_type,
            body.trigger_config,
            body.steps,
            body.description,
            ctx.user_id,
            body.editor_state,
            workspace_id=None,
            graph=body.graph,
            workflow_version=body.workflow_version,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/workflows/runs/{run_id}", summary="Detalle de un run")
async def platform_run_detail(org_id: str, run_id: str, request: Request):
    oid = await _read(request, org_id)
    from src.platform.workflows.engine import run_detail

    result = await run_detail(oid, UUID(run_id))
    if result is None:
        raise HTTPException(404, "Run not found")
    return result


@router.post("/workflow-triggers", status_code=201, summary="Suscribir flujo a un evento")
async def platform_create_trigger(org_id: str, body: TriggerIn, request: Request):
    oid, grant = await _write(request, org_id)
    from src.platform.workflows.events import create_event_trigger

    try:
        return await create_event_trigger(
            oid,
            UUID(body.workflow_id),
            None,
            body.event_type,
            body.filters,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/knowledge-bases", summary="Colecciones de conocimiento de la organización")
async def platform_knowledge_bases(org_id: str, request: Request):
    oid = await _read(request, org_id)
    session = await get_async_session()
    try:
        rows = (
            await session.execute(
                text(
                    "SELECT id, name FROM knowledge_bases "
                    "WHERE organization_id = :oid ORDER BY name"
                ),
                {"oid": oid},
            )
        ).fetchall()
    finally:
        await session.close()
    return {"knowledge_bases": [{"id": str(r.id), "name": r.name} for r in rows]}


# ---------------------------------------------------------------------------
# Rutas por flujo
# ---------------------------------------------------------------------------


@router.get("/workflows/{workflow_id}", summary="Detalle del flujo")
async def platform_get_workflow(org_id: str, workflow_id: str, request: Request):
    oid = await _read(request, org_id)
    from src.platform.workflows.engine import get_workflow

    result = await get_workflow(oid, UUID(workflow_id))
    if result is None:
        raise HTTPException(404, "Workflow not found")
    return result


@router.patch("/workflows/{workflow_id}", summary="Guardar el flujo")
async def platform_update_workflow(
    org_id: str, workflow_id: str, body: WorkflowUpdateIn, request: Request
):
    oid, grant = await _write(request, org_id)
    from src.platform.workflows.engine import WorkflowRevisionConflict, update_workflow

    try:
        result = await update_workflow(
            oid,
            UUID(workflow_id),
            body.name,
            body.description,
            body.trigger_config,
            body.steps,
            body.editor_state,
            graph=body.graph,
            workflow_version=body.workflow_version,
            trigger_type=body.trigger_type,
            expected_revision=body.expected_revision,
        )
    except WorkflowRevisionConflict as exc:
        raise HTTPException(
            409,
            {
                "code": "workflow_revision_conflict",
                "message": str(exc),
                "expected_revision": exc.expected,
                "current_revision": exc.current,
            },
        ) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if result is None:
        raise HTTPException(404, "Workflow not found")
    return result


@router.post("/workflows/{workflow_id}/activate", summary="Activar flujo")
async def platform_activate_workflow(
    org_id: str, workflow_id: str, request: Request
):
    oid, grant = await _write(request, org_id)
    from src.platform.workflows.release_policy import ReleaseDenied, activate_workflow

    try:
        result = await activate_workflow(
            oid,
            UUID(workflow_id),
            workspace_id=None,
            permissions=frozenset({"*"}),
        )
    except ReleaseDenied as exc:
        raise HTTPException(
            409, {"code": "release_blocked", "message": str(exc), **exc.decision}
        ) from exc
    if not result:
        raise HTTPException(404, "Workflow not found")
    return result


@router.post("/workflows/{workflow_id}/pause", summary="Pausar flujo")
async def platform_pause_workflow(org_id: str, workflow_id: str, request: Request):
    oid, grant = await _write(request, org_id)
    from src.platform.workflows.engine import set_workflow_status

    result = await set_workflow_status(oid, UUID(workflow_id), "paused")
    if result is None:
        raise HTTPException(404, "Workflow not found")
    return result


@router.get("/workflows/{workflow_id}/pinned-data", summary="Datos fijados para pruebas")
async def platform_pinned_list(org_id: str, workflow_id: str, request: Request):
    oid = await _read(request, org_id)
    from src.platform.workflows.pinned import list_pinned

    result = await list_pinned(oid, UUID(workflow_id))
    if result is None:
        raise HTTPException(404, "Workflow not found")
    return result


@router.put(
    "/workflows/{workflow_id}/pinned-data/{node_id}",
    summary="Fijar datos de un nodo",
)
async def platform_pinned_upsert(
    org_id: str, workflow_id: str, node_id: str, body: PinnedDataIn, request: Request
):
    oid, grant = await _write(request, org_id)
    from src.platform.workflows.pinned import upsert_pinned

    ctx = require_platform_permission(request, "tenant.write")
    result = await upsert_pinned(
        oid, UUID(workflow_id), node_id, body.output, created_by=ctx.user_id
    )
    if result is None:
        raise HTTPException(404, "Workflow not found")
    return result


@router.delete(
    "/workflows/{workflow_id}/pinned-data/{node_id}",
    summary="Quitar datos fijados",
)
async def platform_pinned_delete(
    org_id: str, workflow_id: str, node_id: str, request: Request
):
    oid, grant = await _write(request, org_id)
    from src.platform.workflows.pinned import delete_pinned

    if not await delete_pinned(oid, UUID(workflow_id), node_id):
        raise HTTPException(404, "Pinned data not found")
    return {"deleted": True}


@router.post("/workflows/{workflow_id}/run", summary="Probar el flujo")
async def platform_run_workflow(org_id: str, workflow_id: str, body: RunIn, request: Request):
    oid = await _read(request, org_id)
    from src.platform.workflows.engine import (
        WorkflowAccessError,
        get_workflow,
        run_workflow,
    )
    from src.platform.workflows.ingress import route_ingress

    ctx = require_platform_permission(request, "tenant.read")
    if await get_workflow(oid, UUID(workflow_id)) is None:
        raise HTTPException(404, "Workflow not found")
    try:
        if body.simulate or body.run_mode != "full":
            result = await run_workflow(
                UUID(workflow_id),
                body.payload,
                trigger="manual",
                organization_id=oid,
                workspace_id=None,
                actor_type="user",
                actor_id=ctx.user_id,
                permissions=frozenset({"*"}),
                simulate=True,
                run_mode=body.run_mode,
                target_node_id=body.target_node_id,
                source_run_id=UUID(body.source_run_id) if body.source_run_id else None,
            )
        else:
            result = await route_ingress(
                workflow_id=UUID(workflow_id),
                organization_id=oid,
                trigger="manual",
                payload=body.payload or {},
                workspace_id=None,
                actor_type="user",
                actor_id=ctx.user_id,
                permissions=frozenset({"*"}),
                require_active=False,
            )
    except WorkflowAccessError as exc:
        raise HTTPException(403, str(exc)) from exc
    if result is None:
        raise HTTPException(404, "Workflow not found")
    return result
