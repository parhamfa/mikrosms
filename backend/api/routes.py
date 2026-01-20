from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel

from ..db import get_db
from ..models import Router, Message, SettingsKV, User
from ..security import encrypt, decrypt
from ..auth import verify_password, get_password_hash, create_access_token, decode_token
from ..mikrotik.rest_client import make_client

router = APIRouter()


# --- Pydantic Models ---

class RouterCreate(BaseModel):
    name: str
    host: str
    proto: str = "rest"
    port: int = 443
    username: str
    password: str
    tls_verify: bool = True
    lte_interface: str = "lte1"


class RouterUpdate(BaseModel):
    name: Optional[str] = None
    host: Optional[str] = None
    proto: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None
    tls_verify: Optional[bool] = None
    lte_interface: Optional[str] = None


class RouterOut(BaseModel):
    id: int
    name: str
    host: str
    proto: str
    port: int
    username: str
    tls_verify: bool
    lte_interface: str

    class Config:
        from_attributes = True


class MessageOut(BaseModel):
    id: int
    router_id: int
    direction: str
    phone: str
    body: str
    timestamp: datetime
    read: bool

    class Config:
        from_attributes = True


class SendSMS(BaseModel):
    phone: str
    message: str


class LoginRequest(BaseModel):
    username: str
    password: str


class UserCreate(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    is_admin: bool
    created_at: datetime

    class Config:
        from_attributes = True


# --- Auth Helpers ---

def get_current_user(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token = authorization[7:]
    payload = decode_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    user = db.query(User).filter(User.username == payload["sub"]).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    return user


def get_active_router_id(db: Session) -> Optional[int]:
    row = db.query(SettingsKV).filter(SettingsKV.key == "active_router_id").first()
    if row and row.value:
        try:
            return int(row.value)
        except ValueError:
            pass
    return None


def set_active_router_id(db: Session, router_id: int):
    row = db.query(SettingsKV).filter(SettingsKV.key == "active_router_id").first()
    if row:
        row.value = str(router_id)
    else:
        db.add(SettingsKV(key="active_router_id", value=str(router_id)))
    db.commit()


# --- Auth Endpoints ---

@router.post("/auth/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == req.username).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_access_token({"sub": user.username})
    return {"access_token": token, "token_type": "bearer"}


@router.get("/auth/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {"id": current_user.id, "username": current_user.username, "is_admin": current_user.is_admin}


@router.get("/auth/status")
def auth_status(db: Session = Depends(get_db)):
    """Check if any users exist (for setup flow)."""
    count = db.query(User).count()
    return {"has_users": count > 0}


@router.post("/auth/setup")
def setup_admin(req: UserCreate, db: Session = Depends(get_db)):
    """Create initial admin user (only works if no users exist)."""
    if db.query(User).count() > 0:
        raise HTTPException(status_code=400, detail="Setup already completed")
    
    user = User(
        username=req.username,
        hashed_password=get_password_hash(req.password),
        is_admin=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    token = create_access_token({"sub": user.username})
    return {"access_token": token, "token_type": "bearer"}


# --- User Management ---

@router.get("/users", response_model=List[UserOut])
def list_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(User).all()


@router.post("/users", response_model=UserOut)
def create_user(req: UserCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    existing = db.query(User).filter(User.username == req.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    user = User(
        username=req.username,
        hashed_password=get_password_hash(req.password),
        is_admin=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    db.delete(user)
    db.commit()
    return {"ok": True}


# --- Router Profiles ---

@router.get("/routers", response_model=List[RouterOut])
def list_routers(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Router).all()


@router.post("/routers", response_model=RouterOut)
def create_router(req: RouterCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    r = Router(
        name=req.name,
        host=req.host,
        proto=req.proto,
        port=req.port,
        username=req.username,
        secret_enc=encrypt(req.password),
        tls_verify=req.tls_verify,
        lte_interface=req.lte_interface,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


@router.put("/routers/{router_id}", response_model=RouterOut)
def update_router(router_id: int, req: RouterUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    r = db.query(Router).filter(Router.id == router_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Router not found")
    
    if req.name is not None:
        r.name = req.name
    if req.host is not None:
        r.host = req.host
    if req.proto is not None:
        r.proto = req.proto
    if req.port is not None:
        r.port = req.port
    if req.username is not None:
        r.username = req.username
    if req.password is not None:
        r.secret_enc = encrypt(req.password)
    if req.tls_verify is not None:
        r.tls_verify = req.tls_verify
    if req.lte_interface is not None:
        r.lte_interface = req.lte_interface
    
    db.commit()
    db.refresh(r)
    return r


@router.delete("/routers/{router_id}")
def delete_router(router_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    r = db.query(Router).filter(Router.id == router_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Router not found")
    
    db.delete(r)
    db.commit()
    return {"ok": True}


@router.post("/routers/{router_id}/test")
def test_router(router_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    r = db.query(Router).filter(Router.id == router_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Router not found")
    
    try:
        client = make_client(r)
        if client.test_connection():
            return {"ok": True, "message": "Connection successful"}
        else:
            raise HTTPException(status_code=502, detail="Connection failed")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# --- Active Router ---

@router.get("/active_router")
def get_active_router(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rid = get_active_router_id(db)
    return {"router_id": rid}


@router.post("/active_router")
def set_active_router(data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    router_id = data.get("router_id")
    if not router_id:
        raise HTTPException(status_code=400, detail="router_id required")
    
    r = db.query(Router).filter(Router.id == router_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Router not found")
    
    set_active_router_id(db, router_id)
    return {"router_id": router_id}


# --- Settings ---

@router.get("/settings")
def get_settings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = db.query(SettingsKV).all()
    return {row.key: row.value for row in rows}


@router.put("/settings")
def put_settings(data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    for key, value in data.items():
        row = db.query(SettingsKV).filter(SettingsKV.key == key).first()
        if row:
            row.value = str(value)
        else:
            db.add(SettingsKV(key=key, value=str(value)))
    db.commit()
    
    rows = db.query(SettingsKV).all()
    return {row.key: row.value for row in rows}


# --- SMS Inbox ---

@router.get("/inbox", response_model=List[MessageOut])
def list_inbox(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    rid = get_active_router_id(db)
    if not rid:
        return []
    
    messages = db.query(Message).filter(Message.router_id == rid).order_by(Message.timestamp.desc()).offset(offset).limit(limit).all()
    return messages


@router.get("/inbox/{message_id}", response_model=MessageOut)
def get_message(message_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    msg = db.query(Message).filter(Message.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    return msg


@router.post("/inbox/{message_id}/read")
def mark_read(message_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    msg = db.query(Message).filter(Message.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    
    msg.read = True
    db.commit()
    return {"ok": True}


@router.delete("/inbox/{message_id}")
def delete_message(message_id: int, delete_router: bool = False, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    msg = db.query(Message).filter(Message.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # Also try to delete from router if requested and we have modem index
    if delete_router and msg.modem_index:
        try:
            r = db.query(Router).filter(Router.id == msg.router_id).first()
            if r:
                client = make_client(r)
                # Use REST API deletion (RouterOS inbox)
                print(f"[DELETE] Attempting to delete SMS .id={msg.modem_index} from RouterOS inbox")
                client.delete_sms(msg.modem_index, r.lte_interface)
                print(f"[DELETE] Successfully deleted SMS .id={msg.modem_index}")
        except Exception as e:
            # Log the error for debugging but continue with local delete
            print(f"[DELETE] Failed to delete SMS from router: {e}")
    
    db.delete(msg)
    db.commit()
    return {"ok": True}


class EmptyRequest(BaseModel):
    delete_router: bool = False


@router.post("/inbox/empty")
def empty_inbox_action(req: EmptyRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Clear all messages from DB, optionally delete from router."""
    rid = get_active_router_id(db)
    if not rid:
        raise HTTPException(status_code=400, detail="No active router")
    
    # 1. Delete all local messages for this router
    db.query(Message).filter(Message.router_id == rid).delete()
    db.commit()
    
    # 2. Optionally delete from router
    if req.delete_router:
        r = db.query(Router).filter(Router.id == rid).first()
        if not r:
            return {"ok": True, "cleared": True, "router_deleted": False}
            
        try:
            client = make_client(r)
            client.delete_all_sms(r.lte_interface)
            return {"ok": True, "cleared": True, "router_deleted": True}
        except Exception as e:
            # If router deletion fails, we still return success for local clear
            # but maybe indicate partial success if needed. For now, just OK.
            print(f"Failed to delete all SMS from router: {e}")
            pass

    return {"ok": True, "cleared": True}


@router.post("/sync")
def sync_inbox(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Sync messages from router (soft sync - only fetches new messages)."""
    rid = get_active_router_id(db)
    if not rid:
        raise HTTPException(status_code=400, detail="No active router")
    
    r = db.query(Router).filter(Router.id == rid).first()
    if not r:
        raise HTTPException(status_code=404, detail="Router not found")
    
    try:
        client = make_client(r)
        sms_list = client.get_sms_inbox(r.lte_interface)
        
        # Get existing modem_index values to avoid duplicates
        existing_indices = set(
            m.modem_index for m in db.query(Message).filter(
                Message.router_id == rid,
                Message.modem_index != ""
            ).all()
        )
        
        new_count = 0
        for sms in sms_list:
            # Skip if we already have this message by modem index
            if sms.index and sms.index in existing_indices:
                continue
            
            try:
                ts = datetime.fromisoformat(sms.timestamp.replace("Z", "+00:00"))
            except Exception:
                ts = datetime.utcnow()
            
            msg = Message(
                router_id=rid,
                direction="in",
                phone=sms.phone,
                body=sms.body,
                timestamp=ts,
                read=False,
                modem_index=sms.index or "",
            )
            db.add(msg)
            new_count += 1
        
        db.commit()
        return {"ok": True, "new_messages": new_count}
    
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/resync")
def resync_inbox(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Clear all cached messages and fetch fresh from router."""
    # This endpoint can remain as 'Full Reload' functionality if needed,
    # or be deprecated. We'll keep it for now as a utility.
    rid = get_active_router_id(db)
    if not rid:
        raise HTTPException(status_code=400, detail="No active router")
    
    r = db.query(Router).filter(Router.id == rid).first()
    if not r:
        raise HTTPException(status_code=404, detail="Router not found")
    
    try:
        # Delete all existing messages for this router
        db.query(Message).filter(Message.router_id == rid).delete()
        db.commit()
        
        # Fetch fresh from router
        client = make_client(r)
        sms_list = client.get_sms_inbox(r.lte_interface)
        
        new_count = 0
        for sms in sms_list:
            try:
                ts = datetime.fromisoformat(sms.timestamp.replace("Z", "+00:00"))
            except Exception:
                ts = datetime.utcnow()
            
            msg = Message(
                router_id=rid,
                direction="in",
                phone=sms.phone,
                body=sms.body,
                timestamp=ts,
                read=False,
                modem_index=sms.index,
            )
            db.add(msg)
            new_count += 1
        
        db.commit()
        return {"ok": True, "new_messages": new_count, "cleared": True}
    
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/send")
def send_sms(req: SendSMS, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rid = get_active_router_id(db)
    if not rid:
        raise HTTPException(status_code=400, detail="No active router")
    
    r = db.query(Router).filter(Router.id == rid).first()
    if not r:
        raise HTTPException(status_code=404, detail="Router not found")
    
    try:
        client = make_client(r)
        client.send_sms(req.phone, req.message, r.lte_interface)
        
        # Store sent message locally
        msg = Message(
            router_id=rid,
            direction="out",
            phone=req.phone,
            body=req.message,
            timestamp=datetime.utcnow(),
            read=True,
        )
        db.add(msg)
        db.commit()
        db.refresh(msg)
        
        return {"ok": True, "message_id": msg.id}
    
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# --- LTE Info ---

@router.get("/lte/info")
def get_lte_info(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rid = get_active_router_id(db)
    if not rid:
        raise HTTPException(status_code=400, detail="No active router")
    
    r = db.query(Router).filter(Router.id == rid).first()
    if not r:
        raise HTTPException(status_code=404, detail="Router not found")
    
    try:
        client = make_client(r)
        info = client.get_lte_info(r.lte_interface)
        
        if info:
            return {
                "interface": info.interface,
                "status": info.status,
                "operator": info.operator,
                "signal_strength": info.signal_strength,
                "registration_status": info.registration_status,
            }
        else:
            return {"interface": r.lte_interface, "status": "unknown"}
    
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/lte/interfaces")
def list_lte_interfaces(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rid = get_active_router_id(db)
    if not rid:
        raise HTTPException(status_code=400, detail="No active router")
    
    r = db.query(Router).filter(Router.id == rid).first()
    if not r:
        raise HTTPException(status_code=404, detail="Router not found")
    
    try:
        client = make_client(r)
        interfaces = client.list_lte_interfaces()
        return {"interfaces": interfaces}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
