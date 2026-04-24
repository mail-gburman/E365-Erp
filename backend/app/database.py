import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from .env import load_env

load_env()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./kps_erp_tier_v01.db")
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args=connect_args)
else:
    engine = create_engine(
        DATABASE_URL,
        pool_size=3,          # max 3 persistent connections per worker
        max_overflow=2,       # allow 2 extra burst connections
        pool_timeout=30,      # wait max 30s for a connection
        pool_recycle=1800,    # recycle connections every 30 min
        pool_pre_ping=True,   # verify connection is alive before using
    )
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
