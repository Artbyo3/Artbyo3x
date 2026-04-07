import json
import os
import bcrypt as _bcrypt
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

# ── bootstrap directories & data file ────────────────────────────────────────
for d in ("uploads/2d", "uploads/3d", "data"):
    Path(d).mkdir(parents=True, exist_ok=True)

works_file = Path("data/works.json")
if not works_file.exists():
    works_file.write_text(json.dumps({"works": []}, indent=2))

# ── hash admin password once at startup ───────────────────────────────────────
_pwd = os.getenv("ADMIN_PASSWORD", "")
if not _pwd:
    raise RuntimeError("ADMIN_PASSWORD is not set")
os.environ["ADMIN_PASSWORD_HASH"] = _bcrypt.hashpw(_pwd.encode(), _bcrypt.gensalt()).decode()
del _pwd

# ── app ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="artbyo3 api",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — allow your frontend domain
allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type"],
)

app.add_middleware(SecurityHeadersMiddleware)

# ── routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(works.router)

# ── static files ──────────────────────────────────────────────────────────────
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# ── serve frontend ───────────────────────────────────────────────────────────
frontend_path = Path("frontend")
if frontend_path.exists():
    @app.get("/")
    async def serve_index():
        return FileResponse(frontend_path / "index.html")
    
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        file_path = frontend_path / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(frontend_path / "index.html")
