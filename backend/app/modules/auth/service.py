from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import AnalysisReport, DesignProject, InspirationNote
from app.models.base import PasswordResetToken, User, UserSession

hasher = PasswordHasher()


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def verify_password(password_hash: str, password: str) -> bool:
    if password_hash == "legacy-unusable":
        return False
    try:
        return hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


async def register(db: AsyncSession, username: str, password: str) -> User:
    normalized = username.casefold()
    await db.execute(select(func.pg_advisory_xact_lock(91260724)))
    if await db.scalar(select(User.id).where(User.username_normalized == normalized)):
        raise ValueError("Username is already registered")

    real_user_count = await db.scalar(select(func.count()).select_from(User).where(User.password_hash != "legacy-unusable")) or 0
    user = User(username=username, username_normalized=normalized, password_hash=hasher.hash(password), is_admin=real_user_count == 0)
    db.add(user)
    await db.flush()
    if user.is_admin:
        legacy_ids = select(User.id).where(User.password_hash == "legacy-unusable")
        for model in (DesignProject, AnalysisReport, InspirationNote):
            await db.execute(update(model).where(model.user_id.in_(legacy_ids)).values(user_id=user.id))
    return user


async def authenticate(db: AsyncSession, username: str, password: str) -> User | None:
    user = await db.scalar(select(User).where(User.username_normalized == username.casefold(), User.is_active.is_(True)))
    return user if user and verify_password(user.password_hash, password) else None


async def create_session(db: AsyncSession, user_id: UUID) -> str:
    token = secrets.token_urlsafe(48)
    db.add(UserSession(user_id=user_id, token_hash=token_hash(token), expires_at=datetime.now(timezone.utc) + timedelta(days=settings.session_days)))
    await db.flush()
    return token


async def get_session_user(db: AsyncSession, token: str | None) -> User | None:
    if not token:
        return None
    now = datetime.now(timezone.utc)
    return await db.scalar(
        select(User).join(UserSession, UserSession.user_id == User.id).where(
            UserSession.token_hash == token_hash(token), UserSession.revoked_at.is_(None),
            UserSession.expires_at > now, User.is_active.is_(True),
        )
    )


async def revoke_session(db: AsyncSession, token: str | None) -> None:
    if token:
        await db.execute(update(UserSession).where(UserSession.token_hash == token_hash(token)).values(revoked_at=datetime.now(timezone.utc)))


async def create_reset_token(db: AsyncSession, user_id: UUID) -> str:
    token = secrets.token_urlsafe(32)
    db.add(PasswordResetToken(user_id=user_id, token_hash=token_hash(token), expires_at=datetime.now(timezone.utc) + timedelta(minutes=30)))
    await db.flush()
    return token


async def reset_password(db: AsyncSession, token: str, password: str) -> bool:
    now = datetime.now(timezone.utc)
    reset = await db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash(token), PasswordResetToken.used_at.is_(None), PasswordResetToken.expires_at > now).with_for_update())
    if not reset:
        return False
    user = await db.get(User, reset.user_id)
    if not user:
        return False
    user.password_hash = hasher.hash(password)
    reset.used_at = now
    await db.execute(update(UserSession).where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None)).values(revoked_at=now))
    return True


def serialize_user(user: User) -> dict:
    return {"id": user.id, "username": user.username, "is_admin": user.is_admin, "created_at": user.created_at.isoformat()}
