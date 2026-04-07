import asyncio
import json
import uuid
from datetime import datetime
from pathlib import Path

import aiofiles
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from routers.auth import get_current_user
from utils.limiter import limiter

router = APIRouter(prefix="/api", tags=["works"])

WORKS_FILE = Path("data/works.json")
UPLOAD_DIR = Path("uploads")
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}

_lock = asyncio.Lock()


# ── helpers ──────────────────────────────────────────────────────────────────

def _check_magic(data: bytes) -> bool:
    """Return True if the file starts with a known image signature."""
    if data[:3] == b"\xff\xd8\xff":               # JPEG
        return True
    if data[:8] == b"\x89PNG\r\n\x1a\n":          # PNG
        return True
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":  # WebP
        return True
    if data[:6] in (b"GIF87a", b"GIF89a"):         # GIF
        return True
    return False


async def _modify(fn):
    """Read works.json, apply fn(data) under a single lock, then write back."""
    async with _lock:
        async with aiofiles.open(WORKS_FILE, "r") as f:
            data = json.loads(await f.read())
        result = fn(data)
        async with aiofiles.open(WORKS_FILE, "w") as f:
            await f.write(json.dumps(data, indent=2))
        return result


async def _read() -> dict:
    async with _lock:
        async with aiofiles.open(WORKS_FILE, "r") as f:
            return json.loads(await f.read())


# ── public endpoints ──────────────────────────────────────────────────────────

@router.get("/works")
async def get_all_works():
    data = await _read()
    return sorted(data["works"], key=lambda w: w["created_at"], reverse=True)


@router.get("/works/{category}")
async def get_works_by_category(category: str):
    if category not in ("2d", "3d"):
        raise HTTPException(status_code=400, detail="Category must be '2d' or '3d'")
    data = await _read()
    works = [w for w in data["works"] if w["category"] == category]
    return sorted(works, key=lambda w: w["created_at"], reverse=True)


# ── protected endpoints ───────────────────────────────────────────────────────

@router.post("/works")
@limiter.limit("30/minute")
async def create_work(
    request: Request,
    title: str = Form(..., max_length=120),
    tag: str = Form(..., max_length=80),
    category: str = Form(...),
    note: str = Form("", max_length=300),
    hue: int = Form(270),
    shader: str = Form("noise"),
    file: UploadFile = File(...),
    _user: str = Depends(get_current_user),
):
    if category not in ("2d", "3d"):
        raise HTTPException(status_code=400, detail="Category must be '2d' or '3d'")
    if shader not in ("noise", "wave", "grid"):
        raise HTTPException(status_code=400, detail="Invalid shader type")
    if not (0 <= hue <= 360):
        raise HTTPException(status_code=400, detail="Hue must be 0-360")

    # Validate extension and declared content-type
    ext = Path(file.filename).suffix.lower()
    if file.content_type not in ALLOWED_MIME or ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: JPEG, PNG, WebP, GIF")

    content = await file.read()

    # Validate actual file content via magic bytes (prevents spoofed content-type)
    if not _check_magic(content):
        raise HTTPException(status_code=400, detail="File content does not match a supported image format")

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Max 20MB")

    # UUID filename — no user input touches the filesystem path
    filename = f"{uuid.uuid4()}{ext}"
    dest = UPLOAD_DIR / category / filename
    async with aiofiles.open(dest, "wb") as f:
        await f.write(content)

    work = {
        "id": str(uuid.uuid4()),
        "title": title.strip(),
        "tag": tag.strip(),
        "category": category,
        "filename": filename,
        "note": note.strip(),
        "hue": hue,
        "shader": shader,
        "created_at": datetime.utcnow().isoformat(),
    }

    def _append(data):
        data["works"].append(work)

    await _modify(_append)
    return work


@router.put("/works/{work_id}")
async def update_work(
    work_id: str,
    title: str = Form(..., max_length=120),
    tag: str = Form(..., max_length=80),
    note: str = Form("", max_length=300),
    hue: int = Form(270),
    shader: str = Form("noise"),
    _user: str = Depends(get_current_user),
):
    if shader not in ("noise", "wave", "grid"):
        raise HTTPException(status_code=400, detail="Invalid shader type")

    updated = None

    def _update(data):
        nonlocal updated
        for i, w in enumerate(data["works"]):
            if w["id"] == work_id:
                data["works"][i].update({
                    "title": title.strip(),
                    "tag": tag.strip(),
                    "note": note.strip(),
                    "hue": hue,
                    "shader": shader,
                })
                updated = data["works"][i]
                return

    await _modify(_update)

    if updated is None:
        raise HTTPException(status_code=404, detail="Work not found")
    return updated


@router.delete("/works/{work_id}")
async def delete_work(
    work_id: str,
    _user: str = Depends(get_current_user),
):
    file_to_delete = None

    def _remove(data):
        nonlocal file_to_delete
        for i, w in enumerate(data["works"]):
            if w["id"] == work_id:
                file_to_delete = UPLOAD_DIR / w["category"] / w["filename"]
                data["works"].pop(i)
                return

    await _modify(_remove)

    if file_to_delete is None:
        raise HTTPException(status_code=404, detail="Work not found")

    # Only delete regular files — never follow symlinks
    if file_to_delete.exists() and not file_to_delete.is_symlink():
        file_to_delete.unlink()

    return {"ok": True}
