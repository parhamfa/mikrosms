from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///./mikrosms.db"
    secret_key: str = "changeme-dev-only-key-32bytes!!"
    debug: bool = False

    class Config:
        env_file = ".env"


settings = Settings()
