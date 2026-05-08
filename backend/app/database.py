import os
from contextvars import ContextVar
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, declarative_base, sessionmaker, with_loader_criteria
from .env import load_env

load_env()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./eventory.db")
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw in (None, ""):
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args=connect_args)
else:
    engine = create_engine(
        DATABASE_URL,
        pool_size=_env_int("DB_POOL_SIZE", 10),
        max_overflow=_env_int("DB_MAX_OVERFLOW", 20),
        pool_timeout=_env_int("DB_POOL_TIMEOUT", 60),
        pool_recycle=_env_int("DB_POOL_RECYCLE", 1800),
        pool_pre_ping=True,
        pool_use_lifo=True,
    )
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

_current_company_id: ContextVar[int | None] = ContextVar("current_company_id", default=None)
_tenant_scoping_configured = False
_tenant_models = []


def set_current_company_id(company_id: int | None):
    _current_company_id.set(company_id)


def get_current_company_id() -> int | None:
    return _current_company_id.get()


def clear_current_company_id():
    _current_company_id.set(None)


def configure_tenant_scoping(models_module):
    """Apply company scoping to ORM selects/inserts for tenant-owned tables."""
    global _tenant_scoping_configured, _tenant_models
    if _tenant_scoping_configured:
        return
    _tenant_models = [
        value for value in vars(models_module).values()
        if isinstance(value, type) and hasattr(value, "__tablename__") and hasattr(value, "company_id")
    ]

    @event.listens_for(Session, "do_orm_execute")
    def _add_tenant_filter(execute_state):
        company_id = get_current_company_id()
        if company_id is None or not execute_state.is_select:
            return
        statement = execute_state.statement
        for model in _tenant_models:
            statement = statement.options(
                with_loader_criteria(
                    model,
                    lambda cls: cls.company_id == company_id,
                    include_aliases=True,
                )
            )
        execute_state.statement = statement

    @event.listens_for(Session, "before_flush")
    def _stamp_new_tenant_rows(session, flush_context, instances):
        company_id = get_current_company_id()
        if company_id is None:
            return
        for obj in session.new:
            if hasattr(obj, "company_id") and getattr(obj, "company_id", None) is None:
                setattr(obj, "company_id", company_id)

    _tenant_scoping_configured = True

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
