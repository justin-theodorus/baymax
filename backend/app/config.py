from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file='../.env',
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
