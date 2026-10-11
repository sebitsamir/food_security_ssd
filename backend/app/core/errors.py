"""RFC 9457 problem+json responses, so clients get one consistent error shape."""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import request_id_var

log = logging.getLogger(__name__)
PROBLEM = "application/problem+json"


class ProblemError(Exception):
    def __init__(
        self, status: int, title: str, detail: str | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:  # fmt: skip
        super().__init__(title)
        self.status, self.title, self.detail, self.headers = status, title, detail, headers


def _problem(
    status: int, title: str, detail: str | None = None,
    headers: dict[str, str] | None = None, **extra: Any,
) -> JSONResponse:  # fmt: skip
    body = {
        "type": "about:blank",
        "title": title,
        "status": status,
        "request_id": request_id_var.get(),
        **extra,
    }
    if detail:
        body["detail"] = detail
    return JSONResponse(body, status_code=status, media_type=PROBLEM, headers=headers)


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ProblemError)
    async def _problem_error(_: Request, exc: ProblemError) -> JSONResponse:
        return _problem(exc.status, exc.title, exc.detail, exc.headers)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [
            {"field": ".".join(str(p) for p in e["loc"]), "message": e["msg"]} for e in exc.errors()
        ]
        return _problem(422, "Invalid request", errors=errors)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return _problem(exc.status_code, str(exc.detail))

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled error", exc_info=exc)
        return _problem(500, "Internal server error")  # never leak internals
