from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve .env relative to this file so it works regardless of CWD
_ENV_FILE = Path(__file__).parent.parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding='utf-8',
        extra='ignore',
    )

    # Supabase
    supabase_url: str
    supabase_publishable_key: str
    supabase_secret_key: str
    supabase_jwt_secret: str = ''

    # Anthropic
    anthropic_api_key: str

    # OpenAI (embeddings)
    openai_api_key: str

    # Deepgram (STT)
    deepgram_api_key: str

    # Azure Speech (TTS)
    azure_speech_key: str
    azure_speech_region: str = 'southeastasia'

    # Telegram
    telegram_bot_token: str

    # App
    frontend_origin: str = 'http://localhost:3000'
    debug: bool = False


settings = Settings()
