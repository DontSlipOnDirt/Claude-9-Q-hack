"""Backward-compatible ASGI entry: ``uvicorn backend.backend:app``."""

from backend.main import app

__all__ = ["app"]
