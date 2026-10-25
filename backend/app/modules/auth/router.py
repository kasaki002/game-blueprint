from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import select

from app.core.config import settings
from app.core.dependencies import AdminUser, CurrentUser, DbSession
from app.models.base import User
from app.modules.auth.schemas import Credentials, PasswordChange, PasswordReset, UserResponse
from app.modules.auth.service import (
    authenticate, create_reset_token, create_session, register, reset_password,
    revoke_session, serialize_user, verify_password, hasher,
)
from app.workers.job_store import open_redis

router = APIRouter(prefix="/api", tags=["auth"])


async def enforce_limit(key: str, limit: int, seconds: int) -> None:
    redis = await open_redis()
    try:
        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, seconds)
        if count > limit:
            raise HTTPException(status_code=429, detail="Too many attempts; try again later")
    finally:
        await redis.aclose()


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        settings.session_cookie_name, token, max_age=settings.session_days * 86400,
        httponly=True, secure=settings.secure_cookies, samesite="lax", path="/",
    )


@router.post("/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_user(data: Credentials, request: Request, response: Response, db: DbSession):
    client = request.client.host if request.client else "unknown"
    await enforce_limit(f"rate:register:{client}", settings.register_limit, 3600)
    try:
        user = await register(db, data.username, data.password)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    token = await create_session(db, user.id)
    set_session_cookie(response, token)
    return serialize_user(user)


@router.post("/auth/login", response_model=UserResponse)
async def login(data: Credentials, request: Request, response: Response, db: DbSession):
    client = request.client.host if request.client else "unknown"
    await enforce_limit(f"rate:login:{client}:{data.username.casefold()}", settings.login_limit, 900)
    user = await authenticate(db, data.username, data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = await create_session(db, user.id)
    set_session_cookie(response, token)
    return serialize_user(user)


@router.post("/auth/logout", status_code=204)
async def logout(request: Request, response: Response, db: DbSession):
    await revoke_session(db, request.cookies.get(settings.session_cookie_name))
    response.delete_cookie(settings.session_cookie_name, path="/")


@router.get("/auth/me", response_model=UserResponse)
async def me(current_user: CurrentUser):
    return serialize_user(current_user)


@router.post("/auth/change-password", status_code=204)
async def change_password(data: PasswordChange, current_user: CurrentUser, db: DbSession):
    if not verify_password(current_user.password_hash, data.current_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    current_user.password_hash = hasher.hash(data.new_password)


@router.post("/auth/reset-password", status_code=204)
async def use_reset_token(data: PasswordReset, db: DbSession):
    if not await reset_password(db, data.token, data.new_password):
        raise HTTPException(status_code=400, detail="Reset token is invalid or expired")


@router.get("/admin/users", response_model=list[UserResponse])
async def list_users(_admin: AdminUser, db: DbSession):
    users = await db.scalars(select(User).where(User.password_hash != "legacy-unusable").order_by(User.created_at))
    return [serialize_user(user) for user in users]


@router.post("/admin/users/{user_id}/password-reset")
async def issue_reset(user_id: UUID, _admin: AdminUser, db: DbSession):
    user = await db.get(User, user_id)
    if not user or user.password_hash == "legacy-unusable":
        raise HTTPException(status_code=404, detail="User not found")
    return {"token": await create_reset_token(db, user.id), "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat()}
