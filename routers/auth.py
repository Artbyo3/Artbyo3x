import os
from datetime import datetime, timedelta

import bcrypt as _bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from jose import JWTError, jwt
from pydantic import BaseModel

from utils.limiter import limiter

router = APIRouter(prefix="/auth", tags=["auth"])

ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 8
COOKIE_NAME = "access_token"

# In-memory token blacklist for logout revocation
# (single process — fits the single-worker uvicorn setup)
_revoked_tokens: set[str] = set()


class LoginRequest(BaseModel):
    username: str
    password: str


def get_secret() -> str:
    secret = os.getenv("JWT_SECRET")
    if not secret:
        raise RuntimeError("JWT_SECRET not set")
    return secret


def verify_password(plain: str, hashed: str) -> bool:
    return _bcrypt.checkpw(plain.encode(), hashed.encode())


def create_token(username: str) -> str:
    expire = datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS)
    # Store exp as Unix timestamp (RFC 7519 NumericDate)
    return jwt.encode(
        {"sub": username, "exp": int(expire.timestamp())},
        get_secret(),
        algorithm=ALGORITHM,
    )


def get_current_user(request: Request) -> str:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if token in _revoked_tokens:
        raise HTTPException(status_code=401, detail="Token has been revoked")
    try:
        payload = jwt.decode(token, get_secret(), algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid token")
        return username
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


@router.post("/login")
@limiter.limit("5/minute")
async def login(request: Request, response: Response, body: LoginRequest):
    admin_user = os.getenv("ADMIN_USERNAME", "")
    admin_hash = os.getenv("ADMIN_PASSWORD_HASH", "")

    # Always run verify to prevent timing attacks even on wrong username
    password_ok = verify_password(body.password, admin_hash) if admin_hash else False
    username_ok = body.username == admin_user

    if not (password_ok and username_ok):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_token(body.username)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=True,
        samesite="strict",
        max_age=TOKEN_EXPIRE_HOURS * 3600,
        path="/",
    )
    return {"ok": True}


@router.post("/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get(COOKIE_NAME)
    if token:
        _revoked_tokens.add(token)
    response.delete_cookie(COOKIE_NAME, samesite="strict", path="/")
    return {"ok": True}


@router.get("/me")
async def me(user: str = Depends(get_current_user)):
    return {"username": user}
