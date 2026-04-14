from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes.attachments import router as attachments_router
from app.api.routes.auth import router as auth_router
from app.api.routes.billing import router as billing_router
from app.api.routes.chat import router as chat_router
from app.api.routes.chats import router as chats_router
from app.api.routes.history import router as history_router
from app.api.routes.images import router as images_router
from app.api.routes.models import router as models_router
from app.api.routes.usage import router as usage_router
from app.api.routes.users import router as users_router
from app.core.exceptions import register_exception_handlers

app = FastAPI(title="AIChatUniversal API")

generated_dir = Path("storage/generated")
generated_dir.mkdir(parents=True, exist_ok=True)

app.mount("/generated", StaticFiles(directory=generated_dir), name="generated")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

register_exception_handlers(app)

app.include_router(auth_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(chats_router, prefix="/api")
app.include_router(history_router, prefix="/api")
app.include_router(models_router, prefix="/api")
app.include_router(usage_router, prefix="/api")
app.include_router(billing_router, prefix="/api")
app.include_router(attachments_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(images_router, prefix="/api")