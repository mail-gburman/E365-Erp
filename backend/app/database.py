import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from .env import load_env

load_env()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./kps_erp_tier_v01.db")
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

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
