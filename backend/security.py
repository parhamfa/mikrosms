from cryptography.fernet import Fernet
import os
import base64
import hashlib

_key = os.environ.get("SECRET_KEY", "changeme-dev-only-key-32bytes!!")
# Ensure key is 32 bytes for Fernet (URL-safe base64)
_derived = hashlib.sha256(_key.encode()).digest()
_fernet_key = base64.urlsafe_b64encode(_derived)
_fernet = Fernet(_fernet_key)


def encrypt(plaintext: str) -> str:
    return _fernet.encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    return _fernet.decrypt(ciphertext.encode()).decode()
