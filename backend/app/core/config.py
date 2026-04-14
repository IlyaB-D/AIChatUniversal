from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROXYAPI_KEY: str

    PROXYAPI_BASE_URL: str = "https://api.proxyapi.ru/anthropic"
    PROXYAPI_OPENAI_BASE_URL: str = "https://api.proxyapi.ru/openai/v1"

    DEFAULT_TEXT_MODEL: str = "claude-sonnet-4-6"

    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    DATABASE_URL: str

    MAX_UPLOAD_SIZE_MB: int = 10

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()