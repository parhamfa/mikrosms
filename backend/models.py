from __future__ import annotations
from sqlalchemy import Column, Integer, String, Boolean, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship, Mapped, mapped_column
from datetime import datetime
from .db import Base


class Router(Base):
    __tablename__ = "routers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    host: Mapped[str] = mapped_column(String(255))
    proto: Mapped[str] = mapped_column(String(10), default="rest")  # rest | rest-http
    port: Mapped[int] = mapped_column(Integer, default=443)
    username: Mapped[str] = mapped_column(String(255))
    secret_enc: Mapped[str] = mapped_column(String)
    tls_verify: Mapped[bool] = mapped_column(Boolean, default=True)
    lte_interface: Mapped[str] = mapped_column(String(64), default="lte1")

    messages: Mapped[list[Message]] = relationship("Message", back_populates="router", cascade="all, delete-orphan")


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    router_id: Mapped[int] = mapped_column(ForeignKey("routers.id", ondelete="CASCADE"))
    direction: Mapped[str] = mapped_column(String(10))  # "in" or "out"
    phone: Mapped[str] = mapped_column(String(32), index=True)
    body: Mapped[str] = mapped_column(Text)
    timestamp: Mapped[datetime] = mapped_column(DateTime, index=True)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    modem_index: Mapped[str] = mapped_column(String(16), default="")  # Index on modem for deletion

    router: Mapped[Router] = relationship("Router", back_populates="messages")


class SettingsKV(Base):
    __tablename__ = "settings_kv"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(String)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
