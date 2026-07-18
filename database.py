from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

SQLALCHEMY_DATABASE_URL = "postgresql://postgres:XxnwxX@localhost:5432/team_matcher_db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_size=10,        # 常驻连接数 (默认 5)
    max_overflow=20,     # 高峰期额外连接数 (默认 10)
    pool_timeout=30,     # 等待可用连接的最长秒数
    pool_pre_ping=True,  # 每次取连接前先 ping，自动丢弃断开的连接
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
