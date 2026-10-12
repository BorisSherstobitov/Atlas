import os, hashlib, hmac, secrets, time
import jwt

SECRET = os.getenv("SECRET_KEY", "dev-secret-change-me")


def _h(p, salt):
    return hashlib.pbkdf2_hmac("sha256", p.encode(), salt.encode(), 120000).hex()


def hash_password(p):
    salt = secrets.token_hex(16)
    return f"{salt}${_h(p, salt)}"


def verify_password(p, stored):
    try:
        salt, h = stored.split("$")
        return hmac.compare_digest(_h(p, salt), h)
    except Exception:
        return False


def create_token(uid):
    return jwt.encode({"sub": str(uid), "exp": int(time.time()) + 7 * 86400}, SECRET, algorithm="HS256")


def decode_token(t):
    try:
        return int(jwt.decode(t, SECRET, algorithms=["HS256"])["sub"])
    except Exception:
        return None
