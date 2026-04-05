import json
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from passlib.context import CryptContext
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

load_dotenv()

from middleware.security import SecurityHeadersMiddleware
from routers import auth, works
from utils.limiter import limiter

# ── bootstrap directories & data file ────────────────────────────────────────
for d in ("uploads/2d", "uploads/3d", "data"):
    Path(d).mkdir(parents=True, exist_ok=True)

works_file = Path("data/works.json")
if not works_file.exists():
    works_file.write_text(json.dumps({"works": []}, indent=2))

# ── hash admin password once at startup ───────────────────────────────────────
_pwd = os.getenv("ADMIN_PASSWORD", "")
if not _pwd:
    raise RuntimeError("ADMIN_PASSWORD is not set in .env")
_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
os.environ["ADMIN_PASSWORD_HASH"] = _ctx.hash(_pwd)
del _pwd  # don't keep plaintext in memory

# ── app ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="artbyo3",
    docs_url=None,   # disable in production
    redoc_url=None,
    openapi_url=None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(SecurityHeadersMiddleware)

# ── routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(works.router)

# ── static files ──────────────────────────────────────────────────────────────
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
app.mount("/videos", StaticFiles(directory="public/videos"), name="videos")

# ── pages ─────────────────────────────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
async def serve_frontend():
    return FileResponse("public/index.html")


@app.get("/dashboard", response_class=HTMLResponse)
async def serve_dashboard():
    return FileResponse("dashboard/index.html")
