#!/usr/bin/env python3
"""
Development runner for mikrosms.
Runs both backend (uvicorn) and frontend (vite) with hot reload.
"""

import subprocess
import sys
import os
import signal
from pathlib import Path

ROOT = Path(__file__).parent.resolve()
BACKEND_DIR = ROOT / "backend"
FRONTEND_DIR = ROOT / "frontend"


def run_dev():
    """Run both backend and frontend in development mode."""
    # Set environment
    env = os.environ.copy()
    env.setdefault("SECRET_KEY", "dev-secret-key-32bytes!!!!!!!!")
    env.setdefault("DEBUG", "true")

    # Start backend
    backend_cmd = [
        sys.executable, "-m", "uvicorn",
        "backend.main:app",
        "--reload",
        "--host", "127.0.0.1",
        "--port", "8001",
    ]
    backend = subprocess.Popen(backend_cmd, cwd=ROOT, env=env)

    # Start frontend
    frontend_cmd = ["npm", "run", "dev", "--", "--port", "5174"]
    frontend = subprocess.Popen(frontend_cmd, cwd=FRONTEND_DIR, env=env)

    def cleanup(sig, frame):
        print("\nShutting down...")
        backend.terminate()
        frontend.terminate()
        backend.wait()
        frontend.wait()
        sys.exit(0)

    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    print("\n" + "=" * 50)
    print("MikroSMS Development Server")
    print("=" * 50)
    print(f"Backend:  http://localhost:8001")
    print(f"Frontend: http://localhost:5174")
    print("=" * 50 + "\n")

    # Wait for either to exit
    try:
        backend.wait()
    except KeyboardInterrupt:
        cleanup(None, None)


def run_prod():
    """Run backend in production mode (frontend should be pre-built)."""
    env = os.environ.copy()
    
    cmd = [
        sys.executable, "-m", "uvicorn",
        "backend.main:app",
        "--host", "0.0.0.0",
        "--port", "8000",
    ]
    subprocess.run(cmd, cwd=ROOT, env=env)


if __name__ == "__main__":
    if "--dev" in sys.argv:
        run_dev()
    else:
        run_prod()
