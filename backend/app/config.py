from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "StudyOS"
    data_dir: Path = Path("./data")
    database_url: str | None = None
    jwt_secret: str | None = None
    jwt_expire_days: int = 7
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    max_upload_mb: int = 25
    allow_signup: bool = True
    ai_provider: Literal["openai", "deepseek", "offline"] = "openai"
    deepseek_api_key: str | None = None
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-flash"
    openai_api_key: str | None = None
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o-mini"
    static_dir: Path = Path("./static")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def ai_api_key(self) -> str | None:
        if self.ai_provider == "offline":
            return None
        return self.deepseek_api_key if self.ai_provider == "deepseek" else self.openai_api_key

    @property
    def ai_base_url(self) -> str:
        return self.deepseek_base_url if self.ai_provider == "deepseek" else self.openai_base_url

    @property
    def ai_model(self) -> str:
        return self.deepseek_model if self.ai_provider == "deepseek" else self.openai_model

    @property
    def ai_label(self) -> str:
        return f"{'DeepSeek' if self.ai_provider == 'deepseek' else 'OpenAI-compatible'} · {self.ai_model}"

    @property
    def db_url(self) -> str:
        return self.database_url or f"sqlite:///{self.data_dir / 'studyos.db'}"

    @property
    def upload_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    def ensure_directories(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.upload_dir.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_directories()
    return settings
