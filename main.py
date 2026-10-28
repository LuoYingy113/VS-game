from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from sqlalchemy import text, inspect as sa_inspect
from database import engine, Base, get_db, SessionLocal
import models
from geocoding import geocode_lng_lat, reconcile_coords
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uuid
import random
import string
from datetime import datetime, date, timedelta
import re
import asyncio
from contextlib import asynccontextmanager
import os
import threading
import smtplib
import subprocess
import tempfile
from email.message import EmailMessage
from urllib.parse import quote

def _load_dotenv(path: str = ".env") -> None:
    """Minimal .env loader for local/dev usage without extra dependencies."""
    if not os.path.exists(path):
        return
    try:
        with open(path, "r", encoding="utf-8") as f:
            for raw in f:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
    except Exception as exc:
        print(f"[env] failed to load {path}: {exc}", flush=True)

_load_dotenv()

# ---- Email config ----
SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "465"))
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "")
SENDER_NAME = os.environ.get("SENDER_NAME", "Team Matcher")
APP_BASE_URL = os.environ.get("APP_BASE_URL", "https://135.125.134.199.sslip.io")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD", "")
CORS_ALLOW_ORIGINS = os.environ.get("CORS_ALLOW_ORIGINS", "*")

def _send_email(to_email: str, subject: str, html: str) -> None:
    """Send via Gmail SMTP."""
    if not SENDER_EMAIL:
        print(f"[EMAIL SKIP] No SENDER_EMAIL — subject='{subject}' to={to_email}", flush=True)
        return
    if not GMAIL_APP_PASSWORD:
        print(f"[EMAIL SKIP] No GMAIL_APP_PASSWORD — subject='{subject}' to={to_email}", flush=True)
        return
    msg = EmailMessage()
    msg["From"] = f"{SENDER_NAME} <{SENDER_EMAIL}>"
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(html, subtype="html")
    with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as server:
        server.login(SENDER_EMAIL, GMAIL_APP_PASSWORD)
        server.send_message(msg)

def send_verification_email(to_email: str, name: str, token: str):
    verify_url = f"{APP_BASE_URL}/api/verify_email?token={token}"
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px">
      <h2 style="color:#1d4ed8">Team Matcher — 邮箱验证</h2>
      <p>Hi {name}，感谢注册！请点击下方按钮验证您的邮箱地址。</p>
      <a href="{verify_url}" style="display:inline-block;padding:12px 28px;background:#1d4ed8;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">验证邮箱 / Verify Email</a>
      <p style="color:#64748b;font-size:13px">如果按钮无法点击，请复制以下链接到浏览器：<br>{verify_url}</p>
      <p style="color:#94a3b8;font-size:12px">此链接仅可使用一次。如非本人操作，请忽略此邮件。</p>
    </div>
    """
    def _do():
        try:
            _send_email(to_email, "验证您的邮箱 / Verify your email", html)
            print(f"[EMAIL OK] Verification sent to {to_email}", flush=True)
        except Exception as e:
            print(f"[EMAIL ERROR] Verification to {to_email}: {e}", flush=True)
    threading.Thread(target=_do, daemon=True).start()

def send_admin_registration_notification(user_email: str, user_name: str, role: str):
    """Notify admin that a new account was registered using this email address."""
    ts = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px">
      <h2 style="color:#1d4ed8">新用户注册通知 / New Registration</h2>
      <p>以下邮箱已被用于注册 Team Matcher 账户：</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px">
        <tr><td style="padding:6px 0;color:#64748b;width:100px">邮箱</td><td><b>{user_email}</b></td></tr>
        <tr><td style="padding:6px 0;color:#64748b">姓名</td><td>{user_name}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">角色</td><td>{role}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">时间</td><td>{ts}</td></tr>
      </table>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">如非本人操作，请忽略此邮件。</p>
    </div>
    """
    def _do():
        try:
            _send_email(user_email, f"[Team Matcher] 新用户注册: {user_email}", html)
            print(f"[EMAIL OK] Admin notified of registration: {user_email}", flush=True)
        except Exception as e:
            print(f"[EMAIL ERROR] Admin notification: {e}", flush=True)
    threading.Thread(target=_do, daemon=True).start()


def send_guardian_link_request_email(to_email: str, player_name: str, guardian_name: str, confirm_url: str):
    html = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px">
      <h2 style="color:#7c3aed">Team Matcher — 监护人绑定确认 / Guardian Link Confirmation</h2>
      <p>Hi {player_name}，有人（{guardian_name}）请求绑定为您的监护人。</p>
      <p>请确认此请求，以便该监护人可以查看并审批您的比赛参与情况。</p>
      <a href="{confirm_url}" style="display:inline-block;padding:12px 28px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">确认绑定 / Confirm link</a>
      <p style="color:#64748b;font-size:13px">如果按钮无法点击，请复制以下链接：<br>{confirm_url}</p>
      <p style="color:#94a3b8;font-size:12px">此链接有效期为 24 小时。如非本人操作，请忽略此邮件。</p>
    </div>
    """
    def _do():
        try:
            _send_email(to_email, "监护人绑定确认 / Guardian Link Confirmation", html)
            print(f"[EMAIL OK] Guardian link request sent to {to_email}", flush=True)
        except Exception as e:
            print(f"[EMAIL ERROR] Guardian link request to {to_email}: {e}", flush=True)
    threading.Thread(target=_do, daemon=True).start()


_INVALID_PWD_RE = re.compile(r'[ <>"\']')
GROUP_INVITE_TTL_HOURS = 48

# ---- In-memory email code store: {email: (code, expires_timestamp)} ----
_email_codes: dict = {}

def normalize_verification_code(raw: Optional[str]) -> str:
    if not raw:
        return ""
    # Normalize full-width digits and remove all spaces.
    trans = str.maketrans("０１２３４５６７８９", "0123456789")
    return raw.translate(trans).replace(" ", "").strip()

def save_email_code(db: Session, email: str, code: str, expires_ts: float) -> None:
    code = models.hash_text(code)
    _email_codes[email] = (code, expires_ts)
    try:
        db.execute(
            text(
                """
                INSERT INTO email_codes (email, code, expires_ts)
                VALUES (:email, :code, :expires_ts)
                ON CONFLICT (email)
                DO UPDATE SET code = :code, expires_ts = :expires_ts
                """
            ),
            {"email": email, "code": code, "expires_ts": expires_ts},
        )
        db.commit()
    except Exception as exc:
        print(f"[email_code] save fallback memory only: {exc}", flush=True)

def get_email_code_entry(db: Session, email: str) -> Optional[tuple[str, float]]:
    try:
        row = db.execute(
            text("SELECT code, expires_ts FROM email_codes WHERE email = :email"),
            {"email": email},
        ).first()
        if row:
            return (row[0], float(row[1]))
    except Exception:
        pass
    return _email_codes.get(email)

def delete_email_code(db: Session, email: str) -> None:
    _email_codes.pop(email, None)
    try:
        db.execute(text("DELETE FROM email_codes WHERE email = :email"), {"email": email})
        db.commit()
    except Exception:
        pass

def is_email_code_valid(db: Session, email: str, submitted_code: Optional[str]) -> bool:
    import time as _time
    entry = get_email_code_entry(db, email)
    if not entry:
        return False
    stored_code, expires_ts = entry
    return expires_ts >= _time.time() and stored_code == models.hash_text(normalize_verification_code(submitted_code))

def parse_user_roles(raw_role: Optional[str]) -> list[str]:
    roles: list[str] = []
    for token in (raw_role or "").split(","):
        role = token.strip().lower()
        if role and role not in roles:
            roles.append(role)
    return roles

def has_user_role(user: Optional[models.User], role: str) -> bool:
    if not user:
        return False
    return role.lower() in parse_user_roles(user.role)

def append_user_role(raw_role: Optional[str], role: str) -> str:
    roles = parse_user_roles(raw_role)
    normalized = role.lower()
    if normalized not in roles:
        roles.append(normalized)
    return ",".join(roles)

def parse_age_groups(raw: Optional[str]) -> list[str]:
    if not raw:
        return []
    return [token.strip() for token in raw.split(",") if token.strip()]

def invite_expiry_iso(now: Optional[datetime] = None) -> str:
    base = now or datetime.utcnow()
    return (base + timedelta(hours=GROUP_INVITE_TTL_HOURS)).isoformat()

def parse_iso_datetime(raw: Optional[str]) -> Optional[datetime]:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw)
    except Exception:
        return None

def cleanup_expired_group_invites(db: Session, group_id: Optional[str] = None) -> None:
    query = db.query(models.InviteCode)
    if group_id:
        query = query.filter(models.InviteCode.group_id == group_id)
    now = datetime.utcnow()
    dirty = False
    for invite in query.all():
        expires_at = parse_iso_datetime(invite.expires_at) or (
            (parse_iso_datetime(invite.created_at) or now)
            + timedelta(hours=GROUP_INVITE_TTL_HOURS)
        )
        if invite.used or expires_at <= now:
            db.delete(invite)
            dirty = True
    if dirty:
        db.flush()

def generate_unique_group_code_value(db: Session) -> str:
    existing_bind_codes: set[str] = set()
    for group in db.query(models.TeamGroup).all():
        for player in list(group.offline_players or []):
            code = (player.get("bind_code") or "").strip().upper()
            if code:
                existing_bind_codes.add(code)
    for _ in range(30):
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
        if code in existing_bind_codes:
            continue
        if db.query(models.InviteCode).filter(models.InviteCode.code == code).first():
            continue
        if db.query(models.TeamGroup).filter(models.TeamGroup.invite_code == code).first():
            continue
        return code
    return uuid.uuid4().hex[:8].upper()

def ensure_legacy_group_invite_record(db: Session, group: Optional[models.TeamGroup]) -> None:
    if not group or not (group.invite_code or "").strip():
        return
    code = group.invite_code.strip().upper()
    if db.query(models.InviteCode).filter(models.InviteCode.code == code).first():
        return
    db.add(models.InviteCode(
        id=f"ic_{uuid.uuid4().hex[:8]}",
        code=code,
        coach_id=group.coach_id,
        group_id=group.id,
        used=False,
        used_by_player_id=None,
        created_at=datetime.utcnow().isoformat(),
        expires_at=invite_expiry_iso(),
    ))
    db.flush()

def get_active_group_invites(db: Session, group_id: str) -> list[models.InviteCode]:
    cleanup_expired_group_invites(db, group_id)
    return (
        db.query(models.InviteCode)
        .filter(models.InviteCode.group_id == group_id)
        .order_by(models.InviteCode.created_at.desc())
        .all()
    )

def sync_group_latest_invite_code(db: Session, group: models.TeamGroup) -> None:
    invites = get_active_group_invites(db, group.id)
    latest_code = invites[0].code if invites else None
    if group.invite_code != latest_code:
        group.invite_code = latest_code
        db.flush()

def create_group_invite_record(db: Session, group: models.TeamGroup) -> models.InviteCode:
    cleanup_expired_group_invites(db, group.id)
    code = generate_unique_group_code_value(db)
    now = datetime.utcnow()
    invite = models.InviteCode(
        id=f"ic_{uuid.uuid4().hex[:8]}",
        code=code,
        coach_id=group.coach_id,
        group_id=group.id,
        used=False,
        used_by_player_id=None,
        created_at=now.isoformat(),
        expires_at=invite_expiry_iso(now),
    )
    db.add(invite)
    db.flush()
    group.invite_code = invite.code
    db.flush()
    return invite

def consume_group_invite_code(db: Session, invite: models.InviteCode, player_id: str) -> None:
    group = db.query(models.TeamGroup).filter(models.TeamGroup.id == invite.group_id).first()
    invite.used = True
    invite.used_by_player_id = player_id
    db.flush()
    db.delete(invite)
    db.flush()
    if group:
        sync_group_latest_invite_code(db, group)

def find_group_by_active_invite_code(db: Session, code: str) -> tuple[Optional[models.TeamGroup], Optional[models.InviteCode]]:
    normalized = code.upper().strip()
    if not normalized:
        return None, None
    cleanup_expired_group_invites(db)
    invite = db.query(models.InviteCode).filter(models.InviteCode.code == normalized).first()
    if invite and invite.group_id:
        group = db.query(models.TeamGroup).filter(models.TeamGroup.id == invite.group_id).first()
        return group, invite
    legacy_group = db.query(models.TeamGroup).filter(models.TeamGroup.invite_code == normalized).first()
    if legacy_group:
        ensure_legacy_group_invite_record(db, legacy_group)
        invite = db.query(models.InviteCode).filter(models.InviteCode.code == normalized).first()
        return legacy_group, invite
    return None, None

def send_password_changed_email(to_email: str, name: str):
    ts = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px">
      <h2 style="color:#dc2626">Team Matcher — 密码已更改 / Password Changed</h2>
      <p>Hi {name}，您的账户密码刚刚已被成功修改。</p>
      <p>Hi {name}, your account password was just successfully changed.</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px">
        <tr><td style="padding:6px 0;color:#64748b;width:100px">邮箱</td><td><b>{to_email}</b></td></tr>
        <tr><td style="padding:6px 0;color:#64748b">时间</td><td>{ts}</td></tr>
      </table>
      <p style="color:#dc2626;margin-top:20px">如非本人操作，请立即联系管理员。<br>If this was not you, please contact admin immediately.</p>
    </div>
    """
    def _do():
        try:
            _send_email(to_email, "[Team Matcher] 密码已修改 / Password Changed", html)
            print(f"[EMAIL OK] Password change notification sent to {to_email}", flush=True)
        except Exception as e:
            print(f"[EMAIL ERROR] Password change notification to {to_email}: {e}", flush=True)
    threading.Thread(target=_do, daemon=True).start()

def send_code_email(to_email: str, code: str):
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px">
      <h2 style="color:#1d4ed8">Team Matcher — 邮箱验证</h2>
      <p>您的注册验证码为：</p>
      <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#1d4ed8;margin:24px 0">{code}</div>
      <p style="color:#64748b;font-size:13px">验证码10分钟内有效，请勿告知他人。<br>This code is valid for 10 minutes.</p>
    </div>
    """
    _send_email(to_email, "邮箱验证码 / Your Verification Code", html)
    print(f"[EMAIL OK] Code sent to {to_email}")


def _send_code_email_safe(to_email: str, code: str, source: str) -> None:
    """Send code email in background and keep endpoint response fast."""
    try:
        send_code_email(to_email, code)
    except Exception as e:
        print(f"[EMAIL ERROR] {source} to {to_email}: {e}", flush=True)


def _add_notification(db: Session, target_user_id: Optional[str], title: str, body: str) -> None:
    if not target_user_id:
        return
    db.add(models.Notification(
        id=f"n_{uuid.uuid4().hex[:12]}",
        target_user_id=target_user_id,
        title=title,
        body=body,
        read=False,
        ts=datetime.utcnow().isoformat(),
    ))


def _notif_i18n(key: str, **params: str) -> str:
    parts = [f"i18n:{key}"]
    for name, value in params.items():
        if value is None:
            continue
        parts.append(f"{name}={quote(str(value), safe='')}")
    return "|".join(parts)


def _game_label(game: models.Game) -> str:
    return f"{game.sport} @ {game.location} ({game.time})"


def _cleanup_deleted_player(db: Session, user: models.User) -> None:
    def _is_finished_game(game: Optional[models.Game]) -> bool:
        if not game:
            return False
        return bool(game.occurrence_counted) or (game.status or "").lower() == "locked"

    notified_coach_ids: set[str] = set()
    for group in db.query(models.TeamGroup).all():
        player_ids = list(group.player_ids or [])
        if user.id not in player_ids:
            continue
        group.player_ids = [player_id for player_id in player_ids if player_id != user.id]
        if group.coach_id and group.coach_id not in notified_coach_ids:
            _add_notification(
                db,
                group.coach_id,
                "👤 球员账号已注销 / Player Account Deleted",
                f"{user.name} deleted their account and has been removed from your team {group.team_name}.",
            )
            notified_coach_ids.add(group.coach_id)

    # Keep finished match history: unlink player_id there, only delete unfinished rosters.
    roster_rows = (
        db.query(models.Roster)
        .filter(models.Roster.player_id == user.id)
        .all()
    )
    roster_ids_to_delete: list[str] = []
    for roster in roster_rows:
        game = db.query(models.Game).filter(models.Game.id == roster.game_id).first()
        if _is_finished_game(game):
            roster.player_id = None
        else:
            roster_ids_to_delete.append(roster.id)

    if roster_ids_to_delete:
        db.query(models.Roster).filter(
            models.Roster.id.in_(roster_ids_to_delete)
        ).delete(synchronize_session=False)

    db.query(models.CoachPlayerNote).filter(
        models.CoachPlayerNote.player_id == user.id
    ).delete(synchronize_session=False)


def _cleanup_deleted_guardian(db: Session, user: models.User) -> None:
    child_ids = [
        child.id
        for child in db.query(models.User)
        .filter(models.User.guardian_id == user.id)
        .all()
    ]
    if not child_ids:
        return

    db.query(models.User).filter(
        models.User.guardian_id == user.id
    ).update({"guardian_id": None}, synchronize_session=False)

    # Guardian cleanup is unlink-only (child guardian_id -> null) and does not remove game history.
    db.query(models.Roster).filter(
        models.Roster.player_id.in_(child_ids),
        models.Roster.status == "pending_guardian",
    ).update(
        {"status": "approved", "guardian_approved": False},
        synchronize_session=False,
    )


def _cleanup_deleted_coach(db: Session, user: models.User) -> None:
    def _is_finished_game(game: models.Game) -> bool:
        return bool(game.occurrence_counted) or (game.status or "").lower() == "locked"

    coach_groups = (
        db.query(models.TeamGroup)
        .filter(models.TeamGroup.coach_id == user.id)
        .all()
    )
    coach_group_ids = [group.id for group in coach_groups]
    coach_group_player_ids = {
        group.id: list(group.player_ids or []) for group in coach_groups
    }
    coach_club_ids = [club.id for club in db.query(models.Club).filter(models.Club.coach_id == user.id).all()]

    created_games = (
        db.query(models.Game)
        .filter(models.Game.creator_id == user.id)
        .all()
    )
    created_game_ids_to_delete: list[str] = []

    for game in created_games:
        if _is_finished_game(game):
            # Keep finished games for history, but unlink the deleted coach and their groups.
            game.creator_id = None
            if game.opposing_team_id == user.id:
                game.opposing_team_id = None
            if game.home_group_id in coach_group_ids:
                game.home_group_id = None
            if game.opposing_group_id in coach_group_ids:
                game.opposing_group_id = None
            continue

        created_game_ids_to_delete.append(game.id)
        recipient_ids: set[str] = set()
        if game.opposing_team_id and game.opposing_team_id != user.id:
            recipient_ids.add(game.opposing_team_id)
        for application in db.query(models.MatchApplication).filter(
            models.MatchApplication.game_id == game.id
        ).all():
            if application.applicant_coach_id != user.id:
                recipient_ids.add(application.applicant_coach_id)

        for coach_id in recipient_ids:
            _add_notification(
                db,
                coach_id,
                _notif_i18n("notifMatchRemovedTitle"),
                _notif_i18n(
                    "notifBodyMatchRemoved",
                    coach=user.name,
                    gameLabel=_game_label(game),
                ),
            )

    outgoing_apps = (
        db.query(models.MatchApplication)
        .filter(models.MatchApplication.applicant_coach_id == user.id)
        .all()
    )
    notified_game_creator_ids: set[str] = set()
    for application in outgoing_apps:
        game = db.query(models.Game).filter(models.Game.id == application.game_id).first()
        if not game or game.creator_id == user.id:
            continue

        notify_key = f"{game.id}:{game.creator_id}"
        if notify_key not in notified_game_creator_ids:
            _add_notification(
                db,
                game.creator_id,
                _notif_i18n("notifMatchApplicationRemovedTitle"),
                _notif_i18n(
                    "notifBodyMatchApplicationRemoved",
                    coach=user.name,
                    gameLabel=_game_label(game),
                ),
            )
            notified_game_creator_ids.add(notify_key)

    opponent_games = (
        db.query(models.Game)
        .filter(models.Game.opposing_team_id == user.id)
        .all()
    )
    for game in opponent_games:
        if _is_finished_game(game):
            # Keep finished games for history, only unlink the deleted coach side.
            game.opposing_team_id = None
            if game.opposing_group_id in coach_group_ids:
                game.opposing_group_id = None
            if game.home_group_id in coach_group_ids:
                game.home_group_id = None
            continue

        if game.creator_id and game.creator_id != user.id:
            _add_notification(
                db,
                game.creator_id,
                "↩️ 对手已移除 / Opponent Removed",
                f"{user.name} deleted their account, so your match \"{_game_label(game)}\" has been reopened for a new opponent.",
            )

        accepted_application = db.query(models.MatchApplication).filter(
            models.MatchApplication.game_id == game.id,
            models.MatchApplication.applicant_coach_id == user.id,
        ).first()
        affected_player_ids = []
        if accepted_application and accepted_application.applicant_group_id:
            affected_player_ids = coach_group_player_ids.get(
                accepted_application.applicant_group_id,
                [],
            )
        if affected_player_ids:
            db.query(models.Roster).filter(
                models.Roster.game_id == game.id,
                models.Roster.player_id.in_(affected_player_ids),
            ).delete(synchronize_session=False)

        game.opposing_team_id = None
        game.opposing_group_id = None
        game.status = "open"

    if created_game_ids_to_delete:
        db.query(models.GameOccurrenceConfirmation).filter(
            models.GameOccurrenceConfirmation.game_id.in_(created_game_ids_to_delete)
        ).delete(synchronize_session=False)
        db.query(models.Roster).filter(
            models.Roster.game_id.in_(created_game_ids_to_delete)
        ).delete(synchronize_session=False)
        db.query(models.MatchApplication).filter(
            models.MatchApplication.game_id.in_(created_game_ids_to_delete)
        ).delete(synchronize_session=False)
        db.query(models.Game).filter(
            models.Game.id.in_(created_game_ids_to_delete)
        ).delete(synchronize_session=False)

    db.query(models.MatchApplication).filter(
        models.MatchApplication.applicant_coach_id == user.id
    ).delete(synchronize_session=False)
    db.query(models.CoachPlayerNote).filter(
        models.CoachPlayerNote.coach_id == user.id
    ).delete(synchronize_session=False)

    if coach_group_ids:
        db.query(models.InviteCode).filter(
            models.InviteCode.group_id.in_(coach_group_ids)
        ).delete(synchronize_session=False)
        db.query(models.MatchApplication).filter(
            models.MatchApplication.applicant_group_id.in_(coach_group_ids)
        ).delete(synchronize_session=False)

    if coach_club_ids:
        db.query(models.User).filter(
            models.User.default_club_id.in_(coach_club_ids)
        ).update({"default_club_id": None}, synchronize_session=False)

    db.query(models.TeamGroup).filter(
        models.TeamGroup.coach_id == user.id
    ).delete(synchronize_session=False)
    db.query(models.InviteCode).filter(
        models.InviteCode.coach_id == user.id
    ).delete(synchronize_session=False)
    db.query(models.CoachInviteCode).filter(
        models.CoachInviteCode.created_by_id == user.id
    ).delete(synchronize_session=False)
    db.query(models.Club).filter(
        models.Club.coach_id == user.id
    ).delete(synchronize_session=False)

async def _cleanup_expired_games():
    """Background loop: prune only stale unfinished games; keep finished games for history."""
    while True:
        try:
            db = SessionLocal()
            now = datetime.utcnow()
            games = db.query(models.Game).all()
            for game in games:
                # Keep completed/locked games permanently so history views remain intact.
                if bool(game.occurrence_counted) or (game.status or "").lower() == "locked":
                    continue
                try:
                    game_time = datetime.fromisoformat(game.time)
                except Exception:
                    continue
                if (now - game_time).total_seconds() <= 86400:
                    continue
                # Remove dependent records then the game itself
                db.query(models.MatchApplication).filter(
                    models.MatchApplication.game_id == game.id
                ).delete(synchronize_session=False)
                db.query(models.Roster).filter(
                    models.Roster.game_id == game.id
                ).delete(synchronize_session=False)
                db.delete(game)
            db.commit()
        except Exception as exc:
            print(f"[cleanup] error during expired-game sweep: {exc}")
        finally:
            db.close()
        await asyncio.sleep(3600)  # repeat every hour


@asynccontextmanager
async def lifespan(application: FastAPI):
    task = asyncio.create_task(_cleanup_expired_games())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in CORS_ALLOW_ORIGINS.split(",") if o.strip()] or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# Startup: migrate schema then seed data
# ==========================================

def run_migrations():
    """Safely add new columns to existing tables (idempotent)"""
    insp = sa_inspect(engine)
    existing_tables = insp.get_table_names()
    with engine.begin() as conn:
        conn.execute(text(
            """
            CREATE TABLE IF NOT EXISTS email_codes (
                email VARCHAR PRIMARY KEY,
                code VARCHAR NOT NULL,
                expires_ts DOUBLE PRECISION NOT NULL
            )
            """
        ))
        conn.execute(text(
            """
            CREATE TABLE IF NOT EXISTS invite_codes (
                id VARCHAR PRIMARY KEY,
                code VARCHAR UNIQUE NOT NULL,
                coach_id VARCHAR NOT NULL,
                group_id VARCHAR,
                used BOOLEAN DEFAULT FALSE,
                used_by_player_id VARCHAR,
                created_at VARCHAR,
                expires_at VARCHAR
            )
            """
        ))
        conn.execute(text(
            """
            CREATE TABLE IF NOT EXISTS coach_game_history (
                id VARCHAR PRIMARY KEY,
                coach_id VARCHAR NOT NULL,
                game_id VARCHAR NOT NULL,
                note VARCHAR,
                result VARCHAR,
                updated_at VARCHAR NOT NULL
            )
            """
        ))
        conn.execute(text(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_game_history_coach_game
            ON coach_game_history (coach_id, game_id)
            """
        ))
        conn.execute(text(
            """
            CREATE TABLE IF NOT EXISTS game_occurrence_confirmations (
                id VARCHAR PRIMARY KEY,
                game_id VARCHAR NOT NULL,
                coach_id VARCHAR NOT NULL,
                confirmed BOOLEAN DEFAULT FALSE,
                updated_at VARCHAR NOT NULL
            )
            """
        ))
        conn.execute(text(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_game_occurrence_confirmations_game_coach
            ON game_occurrence_confirmations (game_id, coach_id)
            """
        ))
        if 'games' in existing_tables:
            game_cols = {c['name'] for c in insp.get_columns('games')}
            if 'deadline' not in game_cols:
                conn.execute(text("ALTER TABLE games ADD COLUMN deadline VARCHAR"))
            if 'description' not in game_cols:
                conn.execute(text("ALTER TABLE games ADD COLUMN description VARCHAR"))
            if 'volunteers' not in game_cols:
                conn.execute(text("ALTER TABLE games ADD COLUMN volunteers JSON DEFAULT '[]'::json"))
            if 'contact_phone' not in game_cols:
                conn.execute(text("ALTER TABLE games ADD COLUMN contact_phone VARCHAR"))
            if 'gender' not in game_cols:
                conn.execute(text("ALTER TABLE games ADD COLUMN gender VARCHAR"))
            if 'home_group_id' not in game_cols:
                conn.execute(text("ALTER TABLE games ADD COLUMN home_group_id VARCHAR"))
            if 'opposing_group_id' not in game_cols:
                conn.execute(text("ALTER TABLE games ADD COLUMN opposing_group_id VARCHAR"))
            if 'is_private' not in game_cols:
                conn.execute(text("ALTER TABLE games ADD COLUMN is_private BOOLEAN DEFAULT FALSE"))
            if 'game_invite_code' not in game_cols:
                conn.execute(text("ALTER TABLE games ADD COLUMN game_invite_code VARCHAR"))
            if 'occurrence_counted' not in game_cols:
                conn.execute(text("ALTER TABLE games ADD COLUMN occurrence_counted BOOLEAN DEFAULT FALSE"))
            if 'strict_age_match' not in game_cols:
                conn.execute(text("ALTER TABLE games ADD COLUMN strict_age_match BOOLEAN DEFAULT FALSE"))
        if 'match_applications' in existing_tables:
            ma_cols = {c['name'] for c in insp.get_columns('match_applications')}
            if 'applicant_group_id' not in ma_cols:
                conn.execute(text("ALTER TABLE match_applications ADD COLUMN applicant_group_id VARCHAR"))
        if 'users' in existing_tables:
            user_cols = {c['name'] for c in insp.get_columns('users')}
            if 'sport' not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN sport VARCHAR"))
            if 'status' not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN status VARCHAR DEFAULT 'active'"))
            if 'password' not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN password VARCHAR DEFAULT '" + models.hash_text('password123') + "'"))
            if 'first_name' not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN first_name VARCHAR"))
            if 'last_name' not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN last_name VARCHAR"))
            # One-time backfill: keep existing full name in first_name per requirement.
            if 'name' in user_cols:
                conn.execute(text("""
                    UPDATE users
                    SET first_name = name
                    WHERE (first_name IS NULL OR first_name = '')
                      AND name IS NOT NULL
                """))
        if 'users' in existing_tables:
            user_cols2 = {c['name'] for c in insp.get_columns('users')}
            if 'default_location' not in user_cols2:
                conn.execute(text("ALTER TABLE users ADD COLUMN default_location VARCHAR"))
            if 'default_location_lng' not in user_cols2:
                conn.execute(text("ALTER TABLE users ADD COLUMN default_location_lng DOUBLE PRECISION"))
            if 'default_location_lat' not in user_cols2:
                conn.execute(text("ALTER TABLE users ADD COLUMN default_location_lat DOUBLE PRECISION"))
            if 'default_club_id' not in user_cols2:
                conn.execute(text("ALTER TABLE users ADD COLUMN default_club_id VARCHAR"))
            if 'games_played_count' not in user_cols2:
                conn.execute(text("ALTER TABLE users ADD COLUMN games_played_count INTEGER DEFAULT 0"))
            if 'verification_token' not in user_cols2:
                conn.execute(text("ALTER TABLE users ADD COLUMN verification_token VARCHAR"))
            if 'jersey_number' not in user_cols2:
                conn.execute(text("ALTER TABLE users ADD COLUMN jersey_number VARCHAR"))
        if 'invite_codes' in existing_tables:
            invite_cols = {c['name'] for c in insp.get_columns('invite_codes')}
            if 'group_id' not in invite_cols:
                conn.execute(text("ALTER TABLE invite_codes ADD COLUMN group_id VARCHAR"))
            if 'used' not in invite_cols:
                conn.execute(text("ALTER TABLE invite_codes ADD COLUMN used BOOLEAN DEFAULT FALSE"))
            if 'used_by_player_id' not in invite_cols:
                conn.execute(text("ALTER TABLE invite_codes ADD COLUMN used_by_player_id VARCHAR"))
            if 'created_at' not in invite_cols:
                conn.execute(text("ALTER TABLE invite_codes ADD COLUMN created_at VARCHAR"))
            if 'expires_at' not in invite_cols:
                conn.execute(text("ALTER TABLE invite_codes ADD COLUMN expires_at VARCHAR"))
        if 'team_groups' in existing_tables:
            tg_cols = {c['name'] for c in insp.get_columns('team_groups')}
            if 'invite_code' not in tg_cols:
                conn.execute(text("ALTER TABLE team_groups ADD COLUMN invite_code VARCHAR"))
                rows = conn.execute(text("SELECT id FROM team_groups")).fetchall()
                for row in rows:
                    code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
                    conn.execute(text("UPDATE team_groups SET invite_code = :code WHERE id = :id"), {"code": code, "id": row[0]})
            if 'team_name' not in tg_cols:
                conn.execute(text("ALTER TABLE team_groups ADD COLUMN team_name VARCHAR"))
            if 'age_group' not in tg_cols:
                conn.execute(text("ALTER TABLE team_groups ADD COLUMN age_group VARCHAR"))
            if 'gender' not in tg_cols:
                conn.execute(text("ALTER TABLE team_groups ADD COLUMN gender VARCHAR"))
            if 'club_id' not in tg_cols:
                conn.execute(text("ALTER TABLE team_groups ADD COLUMN club_id VARCHAR"))
            if 'offline_players' not in tg_cols:
                conn.execute(text("ALTER TABLE team_groups ADD COLUMN offline_players JSON DEFAULT '[]'::json"))
            if 'sport' not in tg_cols:
                conn.execute(text("ALTER TABLE team_groups ADD COLUMN sport VARCHAR"))
        if 'clubs' in existing_tables:
            club_cols = {c['name'] for c in insp.get_columns('clubs')}
            if 'default_location' not in club_cols:
                conn.execute(text("ALTER TABLE clubs ADD COLUMN default_location VARCHAR"))
            if 'default_location_lng' not in club_cols:
                conn.execute(text("ALTER TABLE clubs ADD COLUMN default_location_lng DOUBLE PRECISION"))
            if 'default_location_lat' not in club_cols:
                conn.execute(text("ALTER TABLE clubs ADD COLUMN default_location_lat DOUBLE PRECISION"))
        if 'games' in existing_tables:
            game_cols_geo = {c['name'] for c in insp.get_columns('games')}
            if 'location_lng' not in game_cols_geo:
                conn.execute(text("ALTER TABLE games ADD COLUMN location_lng DOUBLE PRECISION"))
            if 'location_lat' not in game_cols_geo:
                conn.execute(text("ALTER TABLE games ADD COLUMN location_lat DOUBLE PRECISION"))
        # notifications table is created automatically by SQLAlchemy metadata

def seed_database(db: Session):
    """Insert default demo users/games/groups if the DB is empty"""
    if db.query(models.User).count() > 0:
        return
    users = [
        models.User(id='c1', role='coach', name='Coach Alex', email='alex@coach.com', phone='+1 234-567-8900',
                    bio='10 years of coaching experience. Focusing on youth development, teamwork, and core soccer skills.',
                    sport='Soccer', status='active', password='password123'),
        models.User(id='c2', role='coach', name='Coach Bob', email='bob@coach.com', phone='+1 987-654-3210',
                    bio='Former pro player. Passionate about tactical analysis and building highly competitive adult leagues.',
                    sport='Soccer', status='active', password='password123'),
        models.User(id='p1', role='player', name='Mike (Adult)', email='mike@player.com', dob='1995-05-10', phone='123-456-7890', password='password123'),
        models.User(id='p2', role='player', name='Timmy (U16)', email='timmy@player.com', dob='2015-08-20', guardian_id='g1', password='password123'),
        models.User(id='g1', role='guardian', name='Timmy Mom', email='mom@guardian.com', password='password123'),
        models.User(id='admin1', role='admin', name='System Admin', email='admin@system.com', password='password123'),
    ]
    games = [
        models.Game(id='game1', creator_id='c2', sport='Soccer', time='2026-03-20T14:00', location='City Stadium',
                    age_group='U12', deadline='2026-03-15', status='open',
                    description='Friendly match for U12. Please bring white and dark jerseys. Contact me at bob@coach.com for questions.',
                    volunteers=[]),
        models.Game(id='game2', creator_id='c1', sport='Soccer', time='2026-03-25T10:00', location='North Park',
                    age_group='Adult', deadline='2026-03-20', status='open',
                    description='Competitive adult league prep. Looking for a strong opponent.',
                    volunteers=[]),
    ]
    team_groups = [
        models.TeamGroup(id='tg1', coach_id='c1', team_name='Strikers', age_group='U12', player_ids=['p1', 'p2']),
    ]
    settings = models.Settings(id=1, underage_limit=16)
    for u in users:
        db.add(u)
    db.commit()
    for g in games:
        db.add(g)
    for tg in team_groups:
        db.add(tg)
    db.add(settings)
    db.commit()

run_migrations()
Base.metadata.create_all(bind=engine)

def hash_existing_passwords():
    with engine.begin() as conn:
        rows = conn.execute(text("SELECT id, password FROM users WHERE password IS NOT NULL")).fetchall()
        for uid, pwd in rows:
            if not re.fullmatch(r"[0-9a-f]{64}", pwd):
                conn.execute(text("UPDATE users SET password = :p WHERE id = :id"),
                             {"p": models.hash_text(pwd), "id": uid})

hash_existing_passwords()
_startup_db = SessionLocal()
seed_database(_startup_db)
_startup_db.close()

# ==========================================
# Pydantic Schemas
# ==========================================

class UserCreate(BaseModel):
    role: str
    name: str
    email: str
    phone: Optional[str] = None
    dob: Optional[str] = None
    guardianId: Optional[str] = None
    bio: Optional[str] = None
    sport: Optional[str] = None
    status: Optional[str] = 'active'

class UserResponse(BaseModel):
    id: str
    role: str
    name: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: str
    phone: Optional[str] = None
    dob: Optional[str] = None
    guardian_id: Optional[str] = None
    bio: Optional[str] = None
    sport: Optional[str] = None
    status: Optional[str] = None
    default_location: Optional[str] = None
    default_club_id: Optional[str] = None
    games_played_count: int = 0
    verification_token: Optional[str] = None
    jersey_number: Optional[str] = None
    class Config:
        from_attributes = True

class CoachProfileUpdate(BaseModel):
    name: Optional[str] = None
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    dob: Optional[str] = None
    jerseyNumber: Optional[str] = None
    defaultLocation: Optional[str] = None
    defaultClubId: Optional[str] = None
    sport: Optional[str] = None

class GameCreate(BaseModel):
    creatorId: str
    sport: str
    time: str
    location: str
    ageGroup: str
    gender: Optional[str] = None  # 'male' | 'female' | 'mixed'
    deadline: Optional[str] = None
    description: Optional[str] = None
    contactPhone: Optional[str] = None
    homeGroupId: Optional[str] = None
    isPrivate: Optional[bool] = False
    strictAgeMatch: Optional[bool] = False

class GameUpdate(BaseModel):
    time: Optional[str] = None
    location: Optional[str] = None
    ageGroup: Optional[str] = None
    gender: Optional[str] = None
    deadline: Optional[str] = None
    description: Optional[str] = None
    contactPhone: Optional[str] = None
    opposingTeamId: Optional[str] = None
    status: Optional[str] = None
    strictAgeMatch: Optional[bool] = None

class GameResponse(BaseModel):
    id: str
    creator_id: Optional[str] = None
    sport: str
    time: str
    location: str
    age_group: str
    gender: Optional[str] = None
    deadline: Optional[str] = None
    description: Optional[str] = None
    contact_phone: Optional[str] = None
    status: str
    opposing_team_id: Optional[str] = None
    opposing_group_id: Optional[str] = None
    volunteers: Optional[list] = []
    home_group_id: Optional[str] = None
    is_private: Optional[bool] = False
    game_invite_code: Optional[str] = None
    occurrence_counted: Optional[bool] = False
    strict_age_match: Optional[bool] = False
    class Config:
        from_attributes = True

class TeamGroupCreate(BaseModel):
    coachId: str
    teamName: str
    ageGroup: str
    playerIds: Optional[list] = []
    gender: Optional[str] = None
    clubId: Optional[str] = None
    sport: Optional[str] = None

class TeamGroupUpdate(BaseModel):
    teamName: str
    ageGroup: str
    gender: Optional[str] = None
    clubId: Optional[str] = None
    sport: Optional[str] = None

class OfflinePlayerResponse(BaseModel):
    id: str
    name: str
    bind_code: Optional[str] = None

class OfflinePlayerCreate(BaseModel):
    name: str

class TeamGroupResponse(BaseModel):
    id: str
    coach_id: str
    team_name: str
    age_group: str
    player_ids: Optional[list] = []
    invite_code: Optional[str] = None
    gender: Optional[str] = None
    club_id: Optional[str] = None
    offline_players: Optional[list] = []
    sport: Optional[str] = None
    class Config:
        from_attributes = True

class ClubCreate(BaseModel):
    coachId: str
    name: str
    defaultLocation: Optional[str] = None

class ClubUpdate(BaseModel):
    name: Optional[str] = None
    defaultLocation: Optional[str] = None

class ClubResponse(BaseModel):
    id: str
    coach_id: str
    name: str
    default_location: Optional[str] = None
    class Config:
        from_attributes = True

class PlayerAction(BaseModel):
    playerId: str

class JoinTeamByInviteRequest(BaseModel):
    playerId: str
    inviteCode: str

class MovePlayerRequest(BaseModel):
    playerId: str
    fromGroup: str
    toGroup: str

class MatchApplicationCreate(BaseModel):
    gameId: str
    applicantCoachId: str
    applicantGroupId: Optional[str] = None
    status: Optional[str] = 'pending'

class MatchApplicationStatusUpdate(BaseModel):
    status: str

class MatchApplicationResponse(BaseModel):
    id: str
    game_id: str
    applicant_coach_id: str
    applicant_group_id: Optional[str] = None
    status: str
    class Config:
        from_attributes = True

class RosterCreate(BaseModel):
    gameId: str
    playerId: str
    status: Optional[str] = 'invited'

class RosterStatusUpdate(BaseModel):
    status: str
    guardian_approved: Optional[bool] = None
    withdraw_reason: Optional[str] = None

class RosterResponse(BaseModel):
    id: str
    game_id: str
    player_id: str
    status: str
    guardian_approved: bool
    withdraw_reason: Optional[str] = None
    class Config:
        from_attributes = True

class CoachPlayerNoteUpsert(BaseModel):
    coachId: str
    playerId: str
    nickname: Optional[str] = None

class CoachPlayerNoteResponse(BaseModel):
    id: Optional[str] = None
    coach_id: str
    player_id: str
    nickname: Optional[str] = None
    class Config:
        from_attributes = True

class CoachGameHistorySyncPayload(BaseModel):
    coachId: str
    notes: dict[str, str] = {}
    results: dict[str, str] = {}

class CoachGameHistoryResponse(BaseModel):
    coach_id: str
    notes: dict[str, str]
    results: dict[str, str]

class GameOccurrenceConfirmationCreate(BaseModel):
    coachId: str
    confirmed: bool

class GameOccurrenceConfirmationResponse(BaseModel):
    id: str
    game_id: str
    coach_id: str
    confirmed: bool
    updated_at: str
    peer_submitted: Optional[bool] = None
    peer_confirmed: Optional[bool] = None
    game_counted: Optional[bool] = None
    class Config:
        from_attributes = True

class GameOccurrenceConfirmationResult(BaseModel):
    confirmation: GameOccurrenceConfirmationResponse
    game_counted: bool
    creator_games_played_count: int
    opposing_coach_games_played_count: Optional[int] = None

class VolunteerAction(BaseModel):
    volunteerId: str
    action: str  # 'add' or 'remove'

class SettingsUpdate(BaseModel):
    underageLimit: int

class SettingsResponse(BaseModel):
    underage_limit: int
    class Config:
        from_attributes = True

# ==========================================
# API Routes
# ==========================================

# --- Auth ---

class LoginRequest(BaseModel):
    email: str
    password: str

@app.post("/api/login", response_model=UserResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email.ilike(body.email.strip())).first()
    if not user or user.password != models.hash_text(body.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.status == 'pending':
        raise HTTPException(status_code=403, detail="EMAIL_NOT_VERIFIED")
    return user

@app.get("/api/verify_email", response_class=HTMLResponse)
def verify_email(token: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.verification_token == token).first()
    if not user:
        return HTMLResponse("""
        <html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2 style="color:#ef4444">&#x274C; 验证链接无效或已过期</h2>
        <p>The verification link is invalid or has already been used.</p>
        </body></html>
        """, status_code=400)
    user.status = 'active'
    user.verification_token = None
    db.commit()
    return HTMLResponse("""
    <html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#f8fafc">
    <div style="max-width:400px;margin:auto;background:#fff;padding:40px;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
    <div style="font-size:48px">&#x2705;</div>
    <h2 style="color:#16a34a;margin-top:16px">邮箱验证成功！</h2>
    <p style="color:#475569">Your email has been verified. You can now log in to the app.</p>
    <p style="color:#64748b;font-size:13px;margin-top:24px">请返回 App 登录。/ Please return to the app and sign in.</p>
    </div></body></html>
    """)

@app.post("/api/resend_verification")
def resend_verification(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == body.email.strip().lower()).first()
    if not user or user.status != 'pending':
        raise HTTPException(status_code=400, detail="Account not found or already verified")
    token = uuid.uuid4().hex
    user.verification_token = token
    db.commit()
    send_verification_email(user.email, user.name, token)
    return {"ok": True}

class SendCodeRequest(BaseModel):
    email: str

@app.post("/api/send_email_code")
def send_email_code_endpoint(
    body: SendCodeRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    email = body.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="请输入有效的邮箱地址 / Invalid email address")
    if db.query(models.User).filter(models.User.email == email).first():
        raise HTTPException(status_code=400, detail="该邮箱已注册 / Email already registered")
    code = ''.join([str(random.randint(0, 9)) for _ in range(6)])
    import time as _time
    save_email_code(db, email, code, _time.time() + 600)
    background_tasks.add_task(_send_code_email_safe, email, code, "send_email_code")
    return {"ok": True}

@app.post("/api/send_guardian_email_code")
def send_guardian_email_code_endpoint(
    body: SendCodeRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    email = body.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="请输入有效的邮箱地址 / Invalid email address")
    code = ''.join([str(random.randint(0, 9)) for _ in range(6)])
    import time as _time
    save_email_code(db, email, code, _time.time() + 600)
    background_tasks.add_task(_send_code_email_safe, email, code, "send_guardian_email_code")
    return {"ok": True}

class GuardianRegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    emailCode: str

@app.post("/api/register_guardian", response_model=UserResponse, status_code=201)
def register_guardian(body: GuardianRegisterRequest, db: Session = Depends(get_db)):
    email_key = body.email.strip().lower()
    if not is_email_code_valid(db, email_key, body.emailCode):
        raise HTTPException(status_code=400, detail="邮箱验证码无效或已过期 / Email verification code is invalid or expired")
    if _INVALID_PWD_RE.search(body.password):
        raise HTTPException(status_code=400, detail="密码不能包含空格、<、>、引号 / Password cannot contain spaces, <, >, or quotes")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="密码至少需要6位 / Password must be at least 6 characters")
    if db.query(models.User).filter(models.User.email == email_key).first():
        raise HTTPException(status_code=400, detail="该邮箱已注册 / Email already registered")
    new_guardian = models.User(
        id=f"g_{uuid.uuid4().hex[:8]}",
        role='guardian',
        name=body.name,
        email=email_key,
        password=body.password,
        status='active',
        verification_token=None,
    )
    db.add(new_guardian)
    db.commit()
    db.refresh(new_guardian)
    delete_email_code(db, email_key)
    send_admin_registration_notification(new_guardian.email, new_guardian.name, 'guardian')
    return new_guardian

@app.post("/api/send_login_verify_code")
def send_login_verify_code_endpoint(
    body: SendCodeRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Send a verification code specifically for activating a pending account at login."""
    email = body.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="请输入有效的邮箱地址 / Invalid email address")
    user = db.query(models.User).filter(models.User.email.ilike(email)).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在 / User not found")
    if user.status != 'pending':
        raise HTTPException(status_code=400, detail="该账号已验证，请直接登录 / Account already verified")
    # Normalise stored email to lowercase
    if user.email != email:
        user.email = email
        db.commit()
    code = ''.join([str(random.randint(0, 9)) for _ in range(6)])
    import time as _time
    save_email_code(db, email, code, _time.time() + 600)
    background_tasks.add_task(_send_code_email_safe, email, code, "send_login_verify_code")
    return {"ok": True}

@app.post("/api/send_password_reset_code")
def send_password_reset_code_endpoint(
    body: SendCodeRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    email = body.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="请输入有效的邮箱地址 / Invalid email address")
    user = db.query(models.User).filter(models.User.email.ilike(email)).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在 / User not found")

    code = ''.join([str(random.randint(0, 9)) for _ in range(6)])
    import time as _time
    save_email_code(db, email, code, _time.time() + 600)
    background_tasks.add_task(_send_code_email_safe, email, code, "send_password_reset_code")
    return {"ok": True}

class VerifyEmailCodeRequest(BaseModel):
    email: str
    code: str

@app.post("/api/verify_email_code", response_model=UserResponse)
def verify_email_code_endpoint(body: VerifyEmailCodeRequest, db: Session = Depends(get_db)):
    email_key = body.email.strip().lower()
    if not is_email_code_valid(db, email_key, body.code):
        raise HTTPException(status_code=400, detail="验证码无效或已过期 / Verification code is invalid or expired")
    user = db.query(models.User).filter(models.User.email.ilike(email_key)).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在 / User not found")
    if user.status == 'pending':
        user.status = 'active'
        user.verification_token = None
        db.commit()
        db.refresh(user)
    delete_email_code(db, email_key)
    return user

# --- Invite Codes (legacy one-time codes, kept for backward compatibility) ---

def generate_unique_group_code(db: Session) -> str:
    return generate_unique_group_code_value(db)

def generate_unique_offline_bind_code(db: Session) -> str:
    existing_codes: set[str] = set()
    groups = db.query(models.TeamGroup).all()
    for g in groups:
        players = list(g.offline_players or [])
        for p in players:
            code = (p.get("bind_code") or "").strip().upper()
            if code:
                existing_codes.add(code)
    for _ in range(30):
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
        if code in existing_codes:
            continue
        if db.query(models.InviteCode).filter(models.InviteCode.code == code).first():
            continue
        if db.query(models.TeamGroup).filter(models.TeamGroup.invite_code == code).first():
            continue
        return code
    return uuid.uuid4().hex[:8].upper()

class InviteCodeCreate(BaseModel):
    coachId: str
    groupId: Optional[str] = None

class InviteCodeResponse(BaseModel):
    id: str
    code: str
    coach_id: str
    group_id: Optional[str] = None
    used: bool
    used_by_player_id: Optional[str] = None
    created_at: str
    expires_at: Optional[str] = None
    class Config:
        from_attributes = True

@app.post("/api/invite_codes", response_model=InviteCodeResponse, status_code=201)
def create_invite_code(body: InviteCodeCreate, db: Session = Depends(get_db)):
    coach = db.query(models.User).filter(models.User.id == body.coachId).first()
    if not has_user_role(coach, 'coach'):
        raise HTTPException(status_code=404, detail="Coach not found")
    if not body.groupId:
        raise HTTPException(status_code=400, detail="Group is required")
    group = db.query(models.TeamGroup).filter(models.TeamGroup.id == body.groupId).first()
    if not group or group.coach_id != body.coachId:
        raise HTTPException(status_code=404, detail="Group not found")
    new_code = create_group_invite_record(db, group)
    db.commit()
    db.refresh(new_code)
    return new_code

@app.get("/api/invite_codes", response_model=List[InviteCodeResponse])
def get_invite_codes(coachId: str, db: Session = Depends(get_db)):
    cleanup_expired_group_invites(db)
    return (
        db.query(models.InviteCode)
        .filter(models.InviteCode.coach_id == coachId)
        .order_by(models.InviteCode.created_at.desc())
        .all()
    )

# --- Coach Invite Codes ---

class CoachInviteCodeCreate(BaseModel):
    requesterId: str  # must be coach or admin

class CoachInviteCodeResponse(BaseModel):
    id: str
    code: str
    created_by_id: str
    used: bool
    used_by_id: Optional[str] = None
    created_at: str
    class Config:
        from_attributes = True

@app.post("/api/coach_invite_codes", response_model=CoachInviteCodeResponse, status_code=201)
def create_coach_invite_code(body: CoachInviteCodeCreate, db: Session = Depends(get_db)):
    requester = db.query(models.User).filter(models.User.id == body.requesterId).first()
    if not requester or not (has_user_role(requester, 'coach') or has_user_role(requester, 'admin')):
        raise HTTPException(status_code=403, detail="只有教练或管理员才能生成教练邀请码 / Only coaches or admins can generate coach invite codes")
    for _ in range(20):
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
        if not db.query(models.CoachInviteCode).filter(models.CoachInviteCode.code == code).first():
            break
    new_code = models.CoachInviteCode(
        id=f"cic_{uuid.uuid4().hex[:8]}",
        code=code,
        created_by_id=body.requesterId,
        used=False,
        created_at=datetime.utcnow().isoformat(),
    )
    db.add(new_code)
    db.commit()
    db.refresh(new_code)
    return new_code

@app.get("/api/coach_invite_codes", response_model=List[CoachInviteCodeResponse])
def get_coach_invite_codes(createdBy: str, db: Session = Depends(get_db)):
    return db.query(models.CoachInviteCode).filter(models.CoachInviteCode.created_by_id == createdBy).all()

# --- Coach Self-Registration ---

class CoachRegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    coachInviteCode: str
    emailCode: str
    sport: Optional[str] = None
    dob: Optional[str] = None
    phone: Optional[str] = None
    clubName: Optional[str] = None

@app.post("/api/register_coach", response_model=UserResponse, status_code=201)
def register_coach(body: CoachRegisterRequest, db: Session = Depends(get_db)):
    email_key = body.email.strip().lower()
    if not is_email_code_valid(db, email_key, body.emailCode):
        raise HTTPException(status_code=400, detail="邮箱验证码无效或已过期 / Email verification code is invalid or expired")
    if _INVALID_PWD_RE.search(body.password):
        raise HTTPException(status_code=400, detail="密码不能包含空格、<、>、引号 / Password cannot contain spaces, <, >, or quotes")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="密码至少需要6位 / Password must be at least 6 characters")
    invite = db.query(models.CoachInviteCode).filter(
        models.CoachInviteCode.code == body.coachInviteCode.upper().strip()
    ).first()
    if not invite or invite.used:
        raise HTTPException(status_code=400, detail="教练注册码无效或已被使用 / Coach invite code is invalid or already used")
    if db.query(models.User).filter(models.User.email == body.email.strip().lower()).first():
        raise HTTPException(status_code=400, detail="该邮箱已注册 / Email already registered")
    new_coach = models.User(
        id=f"c_{uuid.uuid4().hex[:8]}",
        role='coach',
        name=body.name,
        email=body.email.strip().lower(),
        password=body.password,
        dob=body.dob,
        phone=body.phone,
        sport=body.sport,
        status='active',
        verification_token=None,
    )
    db.add(new_coach)
    invite.used = True
    invite.used_by_id = new_coach.id
    db.commit()
    db.refresh(new_coach)
    # Auto-create club if name provided
    if body.clubName and body.clubName.strip():
        new_club = models.Club(
            id=f"cl_{uuid.uuid4().hex[:8]}",
            coach_id=new_coach.id,
            name=body.clubName.strip(),
        )
        db.add(new_club)
        new_coach.default_club_id = new_club.id
        db.commit()
        db.refresh(new_coach)
    delete_email_code(db, body.email.strip().lower())  # invalidate used code
    send_admin_registration_notification(new_coach.email, new_coach.name, 'coach')
    return new_coach

# --- Player Self-Registration ---

class PlayerRegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    inviteCode: str
    emailCode: str
    dob: Optional[str] = None
    phone: Optional[str] = None
    # Guardian fields — required when player is underage
    guardianName: Optional[str] = None
    guardianEmail: Optional[str] = None
    guardianPassword: Optional[str] = None
    guardianEmailCode: Optional[str] = None

def _calc_age(dob_str: str) -> Optional[int]:
    try:
        dob = date.fromisoformat(dob_str)
        today = date.today()
        return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    except Exception:
        return None


def _auto_unbind_aged_out_players(db: Session) -> None:
    settings = db.query(models.Settings).filter(models.Settings.id == 1).first()
    underage_limit = settings.underage_limit if settings else 16
    changed = False

    players = (
        db.query(models.User)
        .filter(models.User.guardian_id.isnot(None))
        .all()
    )
    for player in players:
        age = _calc_age(player.dob) if player.dob else None
        if age is None or age < underage_limit:
            continue

        guardian_id = player.guardian_id
        player.guardian_id = None
        changed = True

        db.query(models.Roster).filter(
            models.Roster.player_id == player.id,
            models.Roster.status == "pending_guardian",
        ).update(
            {"status": "approved", "guardian_approved": False},
            synchronize_session=False,
        )

        _add_notification(
            db,
            player.id,
            "🎉 已自动解除监护绑定 / Guardian Unlinked",
            (
                f"You are now {age}, so guardian approval is no longer required. "
                f"Your guardian link has been removed automatically."
            ),
        )
        _add_notification(
            db,
            guardian_id,
            "ℹ️ 球员已不再需要监护绑定 / Guardian Link Removed",
            (
                f"{player.name} is now {age} and no longer requires a guardian account, "
                f"so the guardian link has been removed automatically."
            ),
        )

    if changed:
        db.commit()

@app.post("/api/register", response_model=UserResponse, status_code=201)
def register_player(body: PlayerRegisterRequest, db: Session = Depends(get_db)):
    email_key = body.email.strip().lower()
    if not is_email_code_valid(db, email_key, body.emailCode):
        raise HTTPException(status_code=400, detail="邮箱验证码无效或已过期 / Email verification code is invalid or expired")
    # Validate player password
    if _INVALID_PWD_RE.search(body.password):
        raise HTTPException(status_code=400, detail="密码不能包含空格、<、>、引号 / Password cannot contain spaces, <, >, or quotes")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="密码至少需要6位 / Password must be at least 6 characters")
    code = body.inviteCode.upper().strip()
    group, invite_record = find_group_by_active_invite_code(db, code)
    # 2) Fallback: dedicated bind code of an offline player placeholder.
    bound_offline_id: Optional[str] = None
    bound_offline_name: Optional[str] = None
    if not group:
        for tg in db.query(models.TeamGroup).all():
            players = list(tg.offline_players or [])
            matched = next(
                (
                    p
                    for p in players
                    if (p.get("bind_code") or "").strip().upper() == code
                ),
                None,
            )
            if matched:
                group = tg
                bound_offline_id = matched.get("id")
                bound_offline_name = (matched.get("name") or "").strip() or None
                break
    if not group:
        raise HTTPException(status_code=400, detail="邀请码无效 / Invalid invite code")
    # Check email uniqueness
    if db.query(models.User).filter(models.User.email == body.email.strip().lower()).first():
        raise HTTPException(status_code=400, detail="该邮箱已注册 / Email already registered")
    # Check underage limit
    settings = db.query(models.Settings).filter(models.Settings.id == 1).first()
    underage_limit = settings.underage_limit if settings else 16
    age = _calc_age(body.dob) if body.dob else None
    is_underage = age is not None and age < underage_limit
    if is_underage:
        if not body.guardianName or not body.guardianEmail or not body.guardianPassword:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "guardian_required",
                    "message": f"未满{underage_limit}岁的球员注册时必须同时注册监护人账号 / Players under {underage_limit} must register a guardian account",
                },
            )
        guardian_email = body.guardianEmail.strip().lower()
        if not is_email_code_valid(db, guardian_email, body.guardianEmailCode):
            raise HTTPException(status_code=400, detail="监护人邮箱验证码无效或已过期 / Guardian email verification code is invalid or expired")
        if _INVALID_PWD_RE.search(body.guardianPassword):
            raise HTTPException(status_code=400, detail="监护人密码不能包含空格、<、>、引号 / Guardian password cannot contain spaces, <, >, or quotes")
        if len(body.guardianPassword) < 6:
            raise HTTPException(status_code=400, detail="监护人密码至少需要6位 / Guardian password must be at least 6 characters")
    # Get coach's sport
    coach = db.query(models.User).filter(models.User.id == group.coach_id).first()
    # Create guardian first if underage
    guardian_id = None
    if is_underage:
        existing_guardian = db.query(models.User).filter(models.User.email == guardian_email).first()
        if existing_guardian:
            if existing_guardian.password != models.hash_text(body.guardianPassword):
                raise HTTPException(status_code=400, detail="监护人邮箱已存在，请输入该账号当前密码以完成关联 / Guardian email already exists; enter the existing account password to link it")
            if not has_user_role(existing_guardian, 'guardian'):
                existing_guardian.role = append_user_role(existing_guardian.role, 'guardian')
            guardian_id = existing_guardian.id
        else:
            new_guardian = models.User(
                id=f"g_{uuid.uuid4().hex[:8]}",
                role='guardian',
                name=body.guardianName,
                email=guardian_email,
                password=body.guardianPassword,
                status='active',
            )
            db.add(new_guardian)
            db.flush()
            guardian_id = new_guardian.id
    new_player = models.User(
        id=f"p_{uuid.uuid4().hex[:8]}",
        role='player',
        name=bound_offline_name or body.name,
        email=body.email.strip().lower(),
        password=body.password,
        dob=body.dob,
        phone=body.phone,
        sport=coach.sport if coach else None,
        status='active',
        guardian_id=guardian_id,
        verification_token=None,
    )
    db.add(new_player)
    db.flush()
    # Add player to group
    ids = list(group.player_ids or [])
    if new_player.id not in ids:
        ids.append(new_player.id)
    group.player_ids = ids
    if invite_record:
        consume_group_invite_code(db, invite_record, new_player.id)
    # If registered via dedicated offline bind code, consume the placeholder
    # (which also removes that one-time bind code from DB state).
    if bound_offline_id:
        players = list(group.offline_players or [])
        group.offline_players = [
            p for p in players if (p.get("id") or "") != bound_offline_id
        ]
    db.add(models.Notification(
        id=f"n_{uuid.uuid4().hex[:12]}",
        target_user_id=group.coach_id,
        title="👥 新球员加入分组 / New Player Joined",
        body=(
            f"{new_player.name} registered and joined your team {group.team_name}."
            if not bound_offline_id
            else f"{new_player.name} registered and claimed an offline player slot in {group.team_name}."
        ),
        read=False,
        ts=datetime.utcnow().isoformat(),
    ))
    db.commit()
    db.refresh(new_player)
    delete_email_code(db, email_key)
    send_admin_registration_notification(new_player.email, new_player.name, 'player')
    return new_player

# --- Users ---

@app.get("/api/check_email")
def check_email(email: str, db: Session = Depends(get_db)):
    exists = db.query(models.User).filter(models.User.email == email.strip().lower()).first() is not None
    return {"taken": exists}

@app.get("/api/users", response_model=List[UserResponse])
def get_all_users(db: Session = Depends(get_db)):
    _auto_unbind_aged_out_players(db)
    return db.query(models.User).all()

@app.post("/api/users", response_model=UserResponse, status_code=201)
def create_user(user: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == user.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    new_user = models.User(
        id=f"u_{uuid.uuid4().hex[:8]}",
        role=user.role,
        name=user.name,
        email=user.email,
        phone=user.phone,
        dob=user.dob,
        guardian_id=user.guardianId,
        bio=user.bio,
        sport=user.sport,
        status=user.status or 'active',
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.put("/api/users/{user_id}/profile", response_model=UserResponse)
def update_coach_profile(user_id: str, data: CoachProfileUpdate, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if data.firstName is not None or data.lastName is not None:
        if data.firstName is not None:
            user.first_name = data.firstName.strip() or None
        if data.lastName is not None:
            user.last_name = data.lastName.strip() or None
    elif data.name is not None:
        stripped_name = data.name.strip()
        if stripped_name:
            user.name = stripped_name
    if data.email is not None:
        next_email = data.email.strip().lower()
        if not next_email or "@" not in next_email:
            raise HTTPException(status_code=400, detail="请输入有效的邮箱地址 / Invalid email address")
        existing = db.query(models.User).filter(
            models.User.email == next_email,
            models.User.id != user_id,
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="该邮箱已注册 / Email already registered")
        user.email = next_email
    if data.phone is not None:
        user.phone = data.phone.strip() or None
    if data.dob is not None:
        user.dob = data.dob.strip() or None
    if data.jerseyNumber is not None:
        user.jersey_number = data.jerseyNumber.strip() or None
    if data.defaultLocation is not None:
        user.default_location = data.defaultLocation.strip() or None
        user.default_location_lng, user.default_location_lat = geocode_lng_lat(user.default_location)
    if data.defaultClubId is not None:
        user.default_club_id = data.defaultClubId or None
    if data.sport is not None:
        user.sport = data.sport.strip() or None
    db.commit()
    db.refresh(user)
    return user

class ChangePasswordRequest(BaseModel):
    newPassword: str
    emailCode: str


class GuardianPlayerLinkRequestCreate(BaseModel):
    guardianId: str
    playerEmail: str


@app.post("/api/guardian_player_link_requests")
def create_guardian_player_link_request(body: GuardianPlayerLinkRequestCreate, db: Session = Depends(get_db)):
    guardian = db.query(models.User).filter(models.User.id == body.guardianId).first()
    if not guardian or not has_user_role(guardian, 'guardian'):
        raise HTTPException(status_code=400, detail="Only guardian accounts can request player link approvals")

    player_email = (body.playerEmail or "").strip().lower()
    player = db.query(models.User).filter(models.User.email == player_email).first()
    if not player:
        raise HTTPException(status_code=404, detail="Player account not found")
    if not has_user_role(player, 'player'):
        raise HTTPException(status_code=400, detail="This email does not belong to a player account")
    if player.guardian_id == guardian.id:
        return {"ok": True, "alreadyLinked": True, "message": "This player is already linked to this guardian account"}
    if player.guardian_id and player.guardian_id != guardian.id:
        other_guardian = db.query(models.User).filter(models.User.id == player.guardian_id).first()
        raise HTTPException(status_code=400, detail=f"This player is already linked to another guardian: {other_guardian.email if other_guardian else 'another guardian'}")

    existing = (
        db.query(models.GuardianPlayerLinkRequest)
        .filter(
            models.GuardianPlayerLinkRequest.guardian_id == guardian.id,
            models.GuardianPlayerLinkRequest.player_id == player.id,
            models.GuardianPlayerLinkRequest.status == 'pending',
        )
        .order_by(models.GuardianPlayerLinkRequest.created_at.desc())
        .first()
    )
    if existing:
        expires_at = parse_iso_datetime(existing.expires_at)
        if expires_at and expires_at > datetime.utcnow():
            return {"ok": True, "alreadyRequested": True, "message": f"A confirmation email has already been sent to {player.email}"}
        existing.status = 'expired'

    token = uuid.uuid4().hex
    now = datetime.utcnow()
    expiry = now + timedelta(hours=24)
    req = models.GuardianPlayerLinkRequest(
        id=f"gpl_{uuid.uuid4().hex[:8]}",
        guardian_id=guardian.id,
        player_id=player.id,
        token=token,
        status='pending',
        created_at=now.isoformat(),
        expires_at=expiry.isoformat(),
    )
    db.add(req)
    db.commit()

    confirm_url = f"{APP_BASE_URL}/api/guardian_link_confirm?token={token}"
    send_guardian_link_request_email(player.email, player.name or 'Player', guardian.name or guardian.email, confirm_url)
    return {"ok": True, "message": f"A confirmation email was sent to {player.email}"}


@app.get("/api/guardian_link_confirm")
def confirm_guardian_player_link(token: str, db: Session = Depends(get_db)):
    req = db.query(models.GuardianPlayerLinkRequest).filter(models.GuardianPlayerLinkRequest.token == token).first()
    if not req:
        return HTMLResponse("""
        <html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2 style="color:#ef4444">❌ 绑定确认链接无效或已过期</h2>
        <p>The guardian link is invalid or has expired.</p>
        </body></html>
        """, status_code=400)

    if req.status != 'pending':
        return HTMLResponse("""
        <html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2 style="color:#16a34a">✅ 绑定已处理</h2>
        <p>This guardian link has already been processed.</p>
        </body></html>
        """)

    expires_at = parse_iso_datetime(req.expires_at)
    if not expires_at or expires_at <= datetime.utcnow():
        req.status = 'expired'
        db.commit()
        return HTMLResponse("""
        <html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2 style="color:#ef4444">❌ 绑定确认已过期</h2>
        <p>The guardian confirmation link has expired. Please request a new link.</p>
        </body></html>
        """, status_code=410)

    guardian = db.query(models.User).filter(models.User.id == req.guardian_id).first()
    player = db.query(models.User).filter(models.User.id == req.player_id).first()
    if not guardian or not player:
        req.status = 'expired'
        db.commit()
        return HTMLResponse("""
        <html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2 style="color:#ef4444">❌ 绑定信息不存在</h2>
        <p>The guardian or player account no longer exists.</p>
        </body></html>
        """, status_code=404)

    if player.guardian_id and player.guardian_id != guardian.id:
        req.status = 'rejected'
        db.commit()
        return HTMLResponse("""
        <html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2 style="color:#ef4444">❌ 该球员已绑定其他监护人</h2>
        <p>This player is already linked to another guardian.</p>
        </body></html>
        """, status_code=409)

    player.guardian_id = guardian.id
    guardian.role = append_user_role(guardian.role, 'guardian')
    req.status = 'confirmed'
    db.commit()
    return HTMLResponse(f"""
    <html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#f8fafc">
    <div style="max-width:420px;margin:auto;background:#fff;padding:40px;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
      <div style="font-size:48px">✅</div>
      <h2 style="color:#16a34a;margin-top:16px">绑定确认成功</h2>
      <p>{guardian.name or guardian.email} 已成功关联到 {player.name or player.email}。</p>
      <p style="color:#64748b;font-size:13px;margin-top:24px">你现在可以返回 App 继续使用。</p>
    </div></body></html>
    """)

_INVALID_PWD_RE_INLINE = re.compile(r'[ <>\'"]')

@app.post("/api/users/{user_id}/change_password")
def change_password(user_id: str, data: ChangePasswordRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    email_key = user.email.strip().lower()
    if not is_email_code_valid(db, email_key, data.emailCode):
        raise HTTPException(status_code=400, detail="验证码无效或已过期 / Verification code is invalid or expired")

    if _INVALID_PWD_RE.search(data.newPassword):
        raise HTTPException(status_code=400, detail="密码不能包含空格、<、>、引号 / Password cannot contain spaces, <, >, or quotes")
    if len(data.newPassword) < 6:
        raise HTTPException(status_code=400, detail="密码至少需要6位 / Password must be at least 6 characters")

    user.password = data.newPassword
    db.commit()
    delete_email_code(db, email_key)
    send_password_changed_email(user.email, user.name)
    return {"ok": True}


@app.delete("/api/users/{user_id}", status_code=204)
def delete_user_account(user_id: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        roles = set(parse_user_roles(user.role))
        if "player" in roles:
            _cleanup_deleted_player(db, user)
        if "guardian" in roles:
            _cleanup_deleted_guardian(db, user)
        if "coach" in roles:
            _cleanup_deleted_coach(db, user)

        db.query(models.GameOccurrenceConfirmation).filter(
            models.GameOccurrenceConfirmation.coach_id == user.id
        ).delete(synchronize_session=False)
        db.query(models.CoachGameHistory).filter(
            models.CoachGameHistory.coach_id == user.id
        ).delete(synchronize_session=False)
        db.query(models.InviteCode).filter(
            models.InviteCode.coach_id == user.id
        ).delete(synchronize_session=False)
        db.query(models.CoachInviteCode).filter(
            models.CoachInviteCode.created_by_id == user.id
        ).delete(synchronize_session=False)

        db.query(models.Notification).filter(
            models.Notification.target_user_id == user.id
        ).delete(synchronize_session=False)
        db.delete(user)
        db.commit()
    except Exception:
        db.rollback()
        raise

@app.get("/api/coach_player_notes", response_model=List[CoachPlayerNoteResponse])
def get_coach_player_notes(coachId: str, db: Session = Depends(get_db)):
    return (
        db.query(models.CoachPlayerNote)
        .filter(models.CoachPlayerNote.coach_id == coachId)
        .all()
    )

@app.put("/api/coach_player_notes", response_model=CoachPlayerNoteResponse)
def upsert_coach_player_note(data: CoachPlayerNoteUpsert, db: Session = Depends(get_db)):
    coach = db.query(models.User).filter(models.User.id == data.coachId).first()
    if not coach or not has_user_role(coach, 'coach'):
        raise HTTPException(status_code=404, detail="Coach not found")

    player_key = (data.playerId or "").strip()
    if not player_key:
        raise HTTPException(status_code=400, detail="Player id is required")

    nickname = (data.nickname or "").strip()
    existing = (
        db.query(models.CoachPlayerNote)
        .filter(
            models.CoachPlayerNote.coach_id == data.coachId,
            models.CoachPlayerNote.player_id == player_key,
        )
        .first()
    )

    if not nickname:
        if existing:
            db.delete(existing)
            db.commit()
        return {
            "coach_id": data.coachId,
            "player_id": player_key,
            "nickname": None,
        }

    if existing:
        existing.nickname = nickname
        db.commit()
        db.refresh(existing)
        return existing

    created = models.CoachPlayerNote(
        id=f"cpn_{uuid.uuid4().hex[:8]}",
        coach_id=data.coachId,
        player_id=player_key,
        nickname=nickname,
    )
    db.add(created)
    db.commit()
    db.refresh(created)
    return created

@app.get("/api/coach_game_history", response_model=CoachGameHistoryResponse)
def get_coach_game_history(coachId: str, db: Session = Depends(get_db)):
    rows = (
        db.query(models.CoachGameHistory)
        .filter(models.CoachGameHistory.coach_id == coachId)
        .all()
    )
    notes: dict[str, str] = {}
    results: dict[str, str] = {}
    for row in rows:
        game_id = (row.game_id or "").strip()
        if not game_id:
            continue
        note = (row.note or "").strip()
        if note:
            notes[game_id] = note
        if row.result in ("win", "lose"):
            results[game_id] = row.result
    return {
        "coach_id": coachId,
        "notes": notes,
        "results": results,
    }

@app.put("/api/coach_game_history", response_model=CoachGameHistoryResponse)
def sync_coach_game_history(data: CoachGameHistorySyncPayload, db: Session = Depends(get_db)):
    coach = db.query(models.User).filter(models.User.id == data.coachId).first()
    if not coach or not has_user_role(coach, 'coach'):
        raise HTTPException(status_code=404, detail="Coach not found")

    normalized_notes: dict[str, str] = {}
    for game_id, note in (data.notes or {}).items():
        key = str(game_id or "").strip()
        text_note = str(note or "").strip()
        if key and text_note:
            normalized_notes[key] = text_note

    normalized_results: dict[str, str] = {}
    for game_id, result in (data.results or {}).items():
        key = str(game_id or "").strip()
        value = str(result or "").strip().lower()
        if key and value in ("win", "lose"):
            normalized_results[key] = value

    all_game_ids = set(normalized_notes.keys()) | set(normalized_results.keys())
    existing_rows = (
        db.query(models.CoachGameHistory)
        .filter(models.CoachGameHistory.coach_id == data.coachId)
        .all()
    )
    existing_by_game_id = {row.game_id: row for row in existing_rows}
    now_iso = datetime.utcnow().isoformat()

    for game_id in all_game_ids:
        row = existing_by_game_id.get(game_id)
        note_val = normalized_notes.get(game_id)
        result_val = normalized_results.get(game_id)
        if row:
            row.note = note_val
            row.result = result_val
            row.updated_at = now_iso
            continue
        db.add(models.CoachGameHistory(
            id=f"cgh_{uuid.uuid4().hex[:12]}",
            coach_id=data.coachId,
            game_id=game_id,
            note=note_val,
            result=result_val,
            updated_at=now_iso,
        ))

    for row in existing_rows:
        if row.game_id not in all_game_ids:
            db.delete(row)

    db.commit()
    return {
        "coach_id": data.coachId,
        "notes": normalized_notes,
        "results": normalized_results,
    }

class ResetPasswordByEmailRequest(BaseModel):
    email: str
    emailCode: str
    newPassword: str

@app.post("/api/reset_password_by_email")
def reset_password_by_email(data: ResetPasswordByEmailRequest, db: Session = Depends(get_db)):
    email_key = data.email.strip().lower()
    if not email_key or "@" not in email_key:
        raise HTTPException(status_code=400, detail="请输入有效的邮箱地址 / Invalid email address")
    user = db.query(models.User).filter(models.User.email.ilike(email_key)).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在 / User not found")
    if not is_email_code_valid(db, email_key, data.emailCode):
        raise HTTPException(status_code=400, detail="验证码无效或已过期 / Verification code is invalid or expired")
    if _INVALID_PWD_RE.search(data.newPassword):
        raise HTTPException(status_code=400, detail="密码不能包含空格、<、>、引号 / Password cannot contain spaces, <, >, or quotes")
    if len(data.newPassword) < 6:
        raise HTTPException(status_code=400, detail="密码至少需要6位 / Password must be at least 6 characters")
    user.password = data.newPassword
    db.commit()
    delete_email_code(db, email_key)
    send_password_changed_email(user.email, user.name)
    return {"ok": True}

# --- Games ---

@app.get("/api/games", response_model=List[GameResponse])
def get_all_games(db: Session = Depends(get_db)):
    return db.query(models.Game).filter(
        (models.Game.is_private == False) | (models.Game.is_private == None)
    ).all()

_SCORER_SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scorer.java")
_SCORER_BUILD_DIR = os.path.join(tempfile.gettempdir(), "team_matcher_scorer")

def _ensure_scorer_compiled() -> None:
    class_file = os.path.join(_SCORER_BUILD_DIR, "scorer.class")
    if os.path.exists(class_file) and os.path.getmtime(class_file) >= os.path.getmtime(_SCORER_SRC):
        return
    os.makedirs(_SCORER_BUILD_DIR, exist_ok=True)
    subprocess.run(["javac", "-d", _SCORER_BUILD_DIR, _SCORER_SRC], check=True, capture_output=True, timeout=60)

def run_java_scorer(rows: list) -> list[tuple[float, float]]:
    """rows: (lat1, lon1, lat2, lon2, blacklisted, liked, age_diff). Returns (score, distance_km) per row via scorer.java."""
    if not rows:
        return []
    _ensure_scorer_compiled()
    payload = "\n".join(
        f"{a} {b} {c} {d} {str(bl).lower()} {str(lk).lower()} {age}" for a, b, c, d, bl, lk, age in rows
    )
    out = subprocess.run(
        ["java", "-cp", _SCORER_BUILD_DIR, "scorer", "--batch"],
        input=payload, capture_output=True, text=True, check=True, timeout=30,
    ).stdout
    values = [float(x) for x in out.split()]
    return list(zip(values[0::2], values[1::2]))

def _age_level(token: str) -> Optional[int]:
    m = re.fullmatch(r"[Uu](\d+)", token.strip())
    return int(m.group(1)) if m else None

def age_group_diff(coach_ages: list[str], game_ages: list[str]) -> int:
    """Smallest age-level gap between any coach team age and any game age group."""
    if not coach_ages or not game_ages:
        return 0
    best = 99
    for a in coach_ages:
        for g in game_ages:
            la, lg = _age_level(a), _age_level(g)
            if la is not None and lg is not None:
                best = min(best, abs(la - lg))
            elif la is None and lg is None and a.lower() == g.lower():
                best = 0
    return best

@app.get("/api/games/scores")
def get_game_scores(coachId: str, db: Session = Depends(get_db)):
    """Match score (from scorer.java) of every public game for this coach, keyed by game id."""
    coach = db.query(models.User).filter(models.User.id == coachId).first()
    if not coach:
        raise HTTPException(status_code=404, detail="Coach not found")
    coach_ages = [
        a for tg in db.query(models.TeamGroup).filter(models.TeamGroup.coach_id == coachId).all()
        for a in parse_age_groups(tg.age_group)
    ]
    games = db.query(models.Game).filter(
        ((models.Game.is_private == False) | (models.Game.is_private == None))
        & (models.Game.creator_id != coachId)
    ).all()
    rows = []
    has_real_coords = []
    for g in games:
        pts = (coach.default_location_lng, coach.default_location_lat, g.location_lng, g.location_lat)
        # (0, 0) is a leftover placeholder, not a real location
        has_real_coords.append(
            None not in pts
            and (pts[0], pts[1]) != (0, 0)
            and (pts[2], pts[3]) != (0, 0)
        )
        coach_pt, game_pt = reconcile_coords(
            (coach.default_location_lng, coach.default_location_lat),
            (g.location_lng, g.location_lat),
        )
        rows.append((
            coach_pt[1], coach_pt[0], game_pt[1], game_pt[0],
            False, False, age_group_diff(coach_ages, parse_age_groups(g.age_group)),
        ))
    try:
        scores = run_java_scorer(rows)
    except Exception as exc:
        print(f"[scorer] java scoring failed: {exc}", flush=True)
        raise HTTPException(status_code=503, detail="Scoring unavailable")
    # Distance is only meaningful when both sides were actually geocoded
    return {
        g.id: {"score": score, "distanceKm": distance if real else None}
        for g, (score, distance), real in zip(games, scores, has_real_coords)
    }

@app.get("/api/games/by_invite/{code}", response_model=GameResponse)
def get_game_by_invite(code: str, db: Session = Depends(get_db)):
    game = db.query(models.Game).filter(
        models.Game.game_invite_code == code.upper().strip()
    ).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    return game

@app.get("/api/games/history", response_model=List[GameResponse])
def get_coach_past_games(coachId: str, db: Session = Depends(get_db)):
    """Return all past games (any status) involving this coach, for the history view."""
    games = db.query(models.Game).filter(
        (models.Game.creator_id == coachId) | (models.Game.opposing_team_id == coachId)
    ).all()
    now = datetime.utcnow()
    past_games = []
    for g in games:
        try:
            game_dt = datetime.fromisoformat(g.time)
            end_of_day = game_dt.replace(hour=23, minute=59, second=59, microsecond=0)
            if now > end_of_day:
                past_games.append(g)
        except Exception:
            pass
    past_games.sort(key=lambda g: g.time, reverse=True)
    return past_games

@app.post("/api/games", response_model=GameResponse, status_code=201)
def create_game(game: GameCreate, db: Session = Depends(get_db)):
    loc_lng, loc_lat = geocode_lng_lat(game.location)
    new_game = models.Game(
        id=f"g_{uuid.uuid4().hex[:8]}",
        creator_id=game.creatorId,
        sport=game.sport,
        time=game.time,
        location=game.location,
        location_lng=loc_lng,
        location_lat=loc_lat,
        age_group=game.ageGroup,
        gender=game.gender,
        deadline=game.deadline,
        description=game.description,
        contact_phone=game.contactPhone,
        status="open",
        home_group_id=game.homeGroupId,
        volunteers=[],
        is_private=game.isPrivate or False,
        game_invite_code=(''.join(random.choices(string.ascii_uppercase + string.digits, k=8)) if game.isPrivate else None),
        occurrence_counted=False,
        strict_age_match=bool(game.strictAgeMatch),
    )
    db.add(new_game)
    db.commit()
    db.refresh(new_game)
    return new_game

@app.put("/api/games/{game_id}", response_model=GameResponse)
def update_game(game_id: str, game_data: GameUpdate, db: Session = Depends(get_db)):
    game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    if game_data.time is not None:
        game.time = game_data.time
    if game_data.location is not None:
        game.location = game_data.location
        game.location_lng, game.location_lat = geocode_lng_lat(game.location)
    if game_data.ageGroup is not None:
        game.age_group = game_data.ageGroup
    if game_data.gender is not None:
        game.gender = game_data.gender
    if game_data.deadline is not None:
        game.deadline = game_data.deadline
    if game_data.description is not None:
        game.description = game_data.description
    if game_data.contactPhone is not None:
        game.contact_phone = game_data.contactPhone
    if game_data.opposingTeamId is not None:
        game.opposing_team_id = game_data.opposingTeamId
    if game_data.status is not None:
        game.status = game_data.status
    if game_data.strictAgeMatch is not None:
        game.strict_age_match = bool(game_data.strictAgeMatch)
    # Increment games played count immediately when game is locked (both coaches agreed)
    if game_data.status == "locked" and game.opposing_team_id and not game.occurrence_counted:
        _apply_game_played_count(game, db)
    db.commit()
    db.refresh(game)
    return game

@app.delete("/api/games/{game_id}", status_code=204)
def delete_game(game_id: str, db: Session = Depends(get_db)):
    game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    db.query(models.GameOccurrenceConfirmation).filter(models.GameOccurrenceConfirmation.game_id == game_id).delete(synchronize_session=False)
    db.query(models.MatchApplication).filter(models.MatchApplication.game_id == game_id).delete(synchronize_session=False)
    db.query(models.Roster).filter(models.Roster.game_id == game_id).delete(synchronize_session=False)
    db.delete(game)
    db.commit()

@app.put("/api/games/{game_id}/volunteers", response_model=GameResponse)
def update_game_volunteers(game_id: str, action_data: VolunteerAction, db: Session = Depends(get_db)):
    game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    volunteers = list(game.volunteers or [])
    if action_data.action == 'add' and action_data.volunteerId not in volunteers:
        volunteers.append(action_data.volunteerId)
    elif action_data.action == 'remove' and action_data.volunteerId in volunteers:
        volunteers.remove(action_data.volunteerId)
    game.volunteers = volunteers
    db.commit()
    db.refresh(game)
    return game

# --- Team Groups ---

@app.get("/api/team_groups", response_model=List[TeamGroupResponse])
def get_all_team_groups(
    ageGroup: Optional[str] = None,
    gender: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.TeamGroup)
    if ageGroup:
        q = q.filter(models.TeamGroup.age_group == ageGroup)
    if gender:
        q = q.filter(models.TeamGroup.gender == gender)
    return q.all()

@app.post("/api/team_groups", response_model=TeamGroupResponse, status_code=201)
def create_team_group(group: TeamGroupCreate, db: Session = Depends(get_db)):
    normalized_team_name = (group.teamName or "").strip()
    if not normalized_team_name:
        raise HTTPException(status_code=400, detail="队伍名称不能为空 / Team name is required")

    is_top_level_team = not (group.ageGroup or "").strip()
    if is_top_level_team:
        existing_groups = db.query(models.TeamGroup).filter(
            models.TeamGroup.coach_id == group.coachId
        ).all()
        for existing in existing_groups:
            existing_team_name = (existing.team_name or "").strip().lower()
            existing_age_group = (existing.age_group or "").strip()
            if not existing_age_group and existing_team_name == normalized_team_name.lower():
                raise HTTPException(
                    status_code=400,
                    detail="同一教练下队伍名称不能重复 / Duplicate team name for this coach",
                )

    new_group = models.TeamGroup(
        id=f"tg_{uuid.uuid4().hex[:8]}",
        coach_id=group.coachId,
        team_name=normalized_team_name,
        age_group=group.ageGroup,
        player_ids=group.playerIds or [],
        invite_code=None,
        gender=group.gender or None,
        club_id=group.clubId or None,
        sport=group.sport or None,
    )
    db.add(new_group)
    db.flush()
    create_group_invite_record(db, new_group)
    db.commit()
    db.refresh(new_group)
    return new_group

# NOTE: move_player must be declared BEFORE /{group_id} routes to avoid path conflicts
@app.post("/api/team_groups/move_player")
def move_player_between_groups(data: MovePlayerRequest, db: Session = Depends(get_db)):
    from_group = db.query(models.TeamGroup).filter(models.TeamGroup.id == data.fromGroup).first()
    to_group = db.query(models.TeamGroup).filter(models.TeamGroup.id == data.toGroup).first()
    if not from_group or not to_group:
        raise HTTPException(status_code=404, detail="Group not found")
    from_ids = list(from_group.player_ids or [])
    to_ids = list(to_group.player_ids or [])
    if data.playerId in from_ids:
        from_ids.remove(data.playerId)
    if data.playerId not in to_ids:
        to_ids.append(data.playerId)
    from_group.player_ids = from_ids
    to_group.player_ids = to_ids
    db.commit()
    return {"message": "Player moved successfully"}

@app.post("/api/team_groups/join_by_invite", response_model=TeamGroupResponse)
def join_team_group_by_invite(data: JoinTeamByInviteRequest, db: Session = Depends(get_db)):
    code = data.inviteCode.upper().strip()
    if not code:
        raise HTTPException(status_code=400, detail="邀请码不能为空 / Invite code is required")

    player = db.query(models.User).filter(models.User.id == data.playerId).first()
    if not player:
        raise HTTPException(status_code=404, detail="球员不存在 / Player not found")
    if not has_user_role(player, 'player'):
        raise HTTPException(status_code=400, detail="仅球员可加入队伍 / Only players can join teams")

    group, invite_record = find_group_by_active_invite_code(db, code)
    if not group:
        raise HTTPException(status_code=404, detail="邀请码无效 / Invalid invite code")

    player_ids = list(group.player_ids or [])
    if data.playerId not in player_ids:
        player_ids.append(data.playerId)
        group.player_ids = player_ids
        db.add(models.Notification(
            id=f"n_{uuid.uuid4().hex[:12]}",
            target_user_id=group.coach_id,
            title="👥 新球员加入分组 / New Player Joined",
            body=f"{player.name} joined your team {group.team_name}.",
            read=False,
            ts=datetime.utcnow().isoformat(),
        ))
        if invite_record:
            consume_group_invite_code(db, invite_record, data.playerId)
        db.commit()
    elif invite_record:
        consume_group_invite_code(db, invite_record, data.playerId)
        db.commit()
    db.refresh(group)
    return group

@app.get("/api/team_groups/{group_id}/invite_code")
def get_group_invite_code(group_id: str, db: Session = Depends(get_db)):
    group = db.query(models.TeamGroup).filter(models.TeamGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    ensure_legacy_group_invite_record(db, group)
    sync_group_latest_invite_code(db, group)
    if not group.invite_code:
        create_group_invite_record(db, group)
        db.commit()
        db.refresh(group)
    return {"code": group.invite_code, "group_id": group.id, "group_name": group.team_name}

@app.get("/api/team_groups/{group_id}/invite_codes", response_model=List[InviteCodeResponse])
def get_group_invite_codes(group_id: str, db: Session = Depends(get_db)):
    group = db.query(models.TeamGroup).filter(models.TeamGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    ensure_legacy_group_invite_record(db, group)
    invites = get_active_group_invites(db, group_id)
    sync_group_latest_invite_code(db, group)
    db.commit()
    return invites

@app.post("/api/team_groups/{group_id}/invite_codes", response_model=InviteCodeResponse, status_code=201)
def generate_group_invite_code(group_id: str, body: InviteCodeCreate, db: Session = Depends(get_db)):
    group = db.query(models.TeamGroup).filter(models.TeamGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if group.coach_id != body.coachId:
        raise HTTPException(status_code=403, detail="Only the group coach can generate invite codes")
    invite = create_group_invite_record(db, group)
    db.commit()
    db.refresh(invite)
    return invite

@app.put("/api/team_groups/{group_id}", response_model=TeamGroupResponse)
def update_team_group(group_id: str, data: TeamGroupUpdate, db: Session = Depends(get_db)):
    group = db.query(models.TeamGroup).filter(models.TeamGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    group.team_name = data.teamName
    group.age_group = data.ageGroup
    group.gender = data.gender if data.gender is not None else group.gender
    group.club_id = data.clubId if data.clubId is not None else group.club_id
    if data.sport is not None:
        group.sport = data.sport or None
    db.commit()
    db.refresh(group)
    return group

@app.delete("/api/team_groups/{group_id}", status_code=204)
def delete_team_group(group_id: str, db: Session = Depends(get_db)):
    group = db.query(models.TeamGroup).filter(models.TeamGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    # Clean up FK references before deleting the group
    db.query(models.InviteCode).filter(models.InviteCode.group_id == group_id).delete(synchronize_session=False)
    db.query(models.MatchApplication).filter(models.MatchApplication.applicant_group_id == group_id).delete(synchronize_session=False)
    db.query(models.Game).filter(models.Game.home_group_id == group_id).update({"home_group_id": None}, synchronize_session=False)
    db.query(models.Game).filter(models.Game.opposing_group_id == group_id).update({"opposing_group_id": None}, synchronize_session=False)
    db.delete(group)
    db.commit()

@app.post("/api/team_groups/{group_id}/players", response_model=TeamGroupResponse)
def add_player_to_group(group_id: str, data: PlayerAction, db: Session = Depends(get_db)):
    group = db.query(models.TeamGroup).filter(models.TeamGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    player_ids = list(group.player_ids or [])
    if data.playerId not in player_ids:
        player_ids.append(data.playerId)
    group.player_ids = player_ids
    db.commit()
    db.refresh(group)
    return group

@app.post("/api/team_groups/{group_id}/remove_player", response_model=TeamGroupResponse)
def remove_player_from_group(group_id: str, data: PlayerAction, db: Session = Depends(get_db)):
    group = db.query(models.TeamGroup).filter(models.TeamGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    player_ids = list(group.player_ids or [])
    if data.playerId in player_ids:
        player_ids.remove(data.playerId)
    group.player_ids = player_ids
    db.commit()
    db.refresh(group)
    return group

@app.post("/api/team_groups/{group_id}/offline_players", response_model=OfflinePlayerResponse, status_code=201)
def add_offline_player(group_id: str, data: OfflinePlayerCreate, db: Session = Depends(get_db)):
    group = db.query(models.TeamGroup).filter(models.TeamGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    players = list(group.offline_players or [])
    new_player = {
        "id": f"op_{uuid.uuid4().hex[:8]}",
        "name": data.name.strip(),
        "bind_code": generate_unique_offline_bind_code(db),
    }
    players.append(new_player)
    group.offline_players = players
    db.commit()
    return new_player

@app.delete("/api/team_groups/{group_id}/offline_players/{player_id}", status_code=204)
def remove_offline_player(group_id: str, player_id: str, db: Session = Depends(get_db)):
    group = db.query(models.TeamGroup).filter(models.TeamGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    players = list(group.offline_players or [])
    group.offline_players = [p for p in players if p.get("id") != player_id]
    db.commit()

# --- Clubs ---

@app.get("/api/clubs", response_model=List[ClubResponse])
def get_clubs(coachId: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(models.Club)
    if coachId:
        q = q.filter(models.Club.coach_id == coachId)
    return q.all()

@app.post("/api/clubs", response_model=ClubResponse, status_code=201)
def create_club(club: ClubCreate, db: Session = Depends(get_db)):
    club_lng, club_lat = geocode_lng_lat(club.defaultLocation)
    new_club = models.Club(
        id=f"cl_{uuid.uuid4().hex[:8]}",
        coach_id=club.coachId,
        name=club.name.strip(),
        default_location=club.defaultLocation.strip() if club.defaultLocation else None,
        default_location_lng=club_lng,
        default_location_lat=club_lat,
    )
    db.add(new_club)
    db.commit()
    db.refresh(new_club)
    return new_club

@app.put("/api/clubs/{club_id}", response_model=ClubResponse)
def update_club(club_id: str, club: ClubUpdate, db: Session = Depends(get_db)):
    record = db.query(models.Club).filter(models.Club.id == club_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Club not found")
    if club.name is not None:
        record.name = club.name.strip() or record.name
    if club.defaultLocation is not None:
        record.default_location = club.defaultLocation.strip() or None
        record.default_location_lng, record.default_location_lat = geocode_lng_lat(record.default_location)
    db.commit()
    db.refresh(record)
    return record

@app.delete("/api/clubs/{club_id}", status_code=204)
def delete_club(club_id: str, db: Session = Depends(get_db)):
    club = db.query(models.Club).filter(models.Club.id == club_id).first()
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")
    # Unlink teams from this club
    db.query(models.TeamGroup).filter(models.TeamGroup.club_id == club_id).update({"club_id": None})
    db.delete(club)
    db.commit()

# --- Game Occurrence Confirmations ---

@app.get("/api/game_occurrence_confirmations", response_model=List[GameOccurrenceConfirmationResponse])
def get_game_occurrence_confirmations(coachId: str, db: Session = Depends(get_db)):
    rows = (
        db.query(models.GameOccurrenceConfirmation)
        .filter(models.GameOccurrenceConfirmation.coach_id == coachId)
        .all()
    )
    result = []
    for row in rows:
        game = db.query(models.Game).filter(models.Game.id == row.game_id).first()
        peer_submitted = False
        peer_confirmed = False
        game_counted = False
        if game:
            peer_id = (
                game.opposing_team_id if coachId == game.creator_id else game.creator_id
            )
            if peer_id:
                peer_row = (
                    db.query(models.GameOccurrenceConfirmation)
                    .filter(
                        models.GameOccurrenceConfirmation.game_id == row.game_id,
                        models.GameOccurrenceConfirmation.coach_id == peer_id,
                    )
                    .first()
                )
                peer_submitted = peer_row is not None
                peer_confirmed = bool(peer_row.confirmed) if peer_row else False
            game_counted = bool(game.occurrence_counted)

        result.append(
            {
                "id": row.id,
                "game_id": row.game_id,
                "coach_id": row.coach_id,
                "confirmed": bool(row.confirmed),
                "updated_at": row.updated_at,
                "peer_submitted": peer_submitted,
                "peer_confirmed": peer_confirmed,
                "game_counted": game_counted,
            }
        )
    return result

def _apply_game_played_count(game: models.Game, db: Session) -> tuple[int, Optional[int]]:
    creator = db.query(models.User).filter(models.User.id == game.creator_id).first()
    opponent = (
        db.query(models.User).filter(models.User.id == game.opposing_team_id).first()
        if game.opposing_team_id
        else None
    )
    if creator:
        creator.games_played_count = int(creator.games_played_count or 0) + 1
    if opponent and opponent.id != game.creator_id:
        opponent.games_played_count = int(opponent.games_played_count or 0) + 1
    game.occurrence_counted = True
    db.flush()
    creator_count = int(creator.games_played_count or 0) if creator else 0
    opponent_count = int(opponent.games_played_count or 0) if opponent else None
    return creator_count, opponent_count

@app.post("/api/games/{game_id}/occurrence_confirmation", response_model=GameOccurrenceConfirmationResult)
def upsert_game_occurrence_confirmation(
    game_id: str,
    data: GameOccurrenceConfirmationCreate,
    db: Session = Depends(get_db),
):
    game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    if data.coachId not in {game.creator_id, game.opposing_team_id}:
        raise HTTPException(status_code=403, detail="Not allowed")

    now_iso = datetime.utcnow().isoformat()
    row = (
        db.query(models.GameOccurrenceConfirmation)
        .filter(
            models.GameOccurrenceConfirmation.game_id == game_id,
            models.GameOccurrenceConfirmation.coach_id == data.coachId,
        )
        .first()
    )
    if row:
        row.confirmed = bool(data.confirmed)
        row.updated_at = now_iso
    else:
        row = models.GameOccurrenceConfirmation(
            id=f"goc_{uuid.uuid4().hex[:8]}",
            game_id=game_id,
            coach_id=data.coachId,
            confirmed=bool(data.confirmed),
            updated_at=now_iso,
        )
        db.add(row)
    db.flush()

    creator_confirmed = (
        db.query(models.GameOccurrenceConfirmation)
        .filter(
            models.GameOccurrenceConfirmation.game_id == game_id,
            models.GameOccurrenceConfirmation.coach_id == game.creator_id,
            models.GameOccurrenceConfirmation.confirmed == True,
        )
        .first()
    )
    opponent_confirmed = (
        db.query(models.GameOccurrenceConfirmation)
        .filter(
            models.GameOccurrenceConfirmation.game_id == game_id,
            models.GameOccurrenceConfirmation.coach_id == game.opposing_team_id,
            models.GameOccurrenceConfirmation.confirmed == True,
        )
        .first()
        if game.opposing_team_id
        else None
    )

    creator_count: int
    opponent_count: Optional[int]
    if creator_confirmed and opponent_confirmed and not game.occurrence_counted:
        creator_count, opponent_count = _apply_game_played_count(game, db)
    else:
        creator = db.query(models.User).filter(models.User.id == game.creator_id).first()
        opponent = (
            db.query(models.User).filter(models.User.id == game.opposing_team_id).first()
            if game.opposing_team_id
            else None
        )
        creator_count = int(creator.games_played_count or 0) if creator else 0
        opponent_count = int(opponent.games_played_count or 0) if opponent else None

    db.commit()
    db.refresh(row)
    db.refresh(game)
    return {
        "confirmation": row,
        "game_counted": bool(game.occurrence_counted),
        "creator_games_played_count": creator_count,
        "opposing_coach_games_played_count": opponent_count,
    }

# --- Match Applications ---

@app.get("/api/match_applications", response_model=List[MatchApplicationResponse])
def get_all_match_applications(db: Session = Depends(get_db)):
    return db.query(models.MatchApplication).all()

@app.post("/api/match_applications", response_model=MatchApplicationResponse, status_code=201)
def create_match_application(app_data: MatchApplicationCreate, db: Session = Depends(get_db)):
    game = db.query(models.Game).filter(models.Game.id == app_data.gameId).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    applicant_group = None
    if app_data.applicantGroupId:
        applicant_group = db.query(models.TeamGroup).filter(models.TeamGroup.id == app_data.applicantGroupId).first()

    if bool(game.strict_age_match):
        if not applicant_group:
            raise HTTPException(status_code=400, detail="该比赛仅允许年龄组匹配的队伍申请 / This match only accepts age-matched team applications")
        game_ages = parse_age_groups(game.age_group)
        group_ages = parse_age_groups(applicant_group.age_group)
        if game_ages and group_ages and not any(age in group_ages for age in game_ages):
            raise HTTPException(status_code=400, detail="该比赛仅允许年龄组匹配的队伍申请 / This match only accepts age-matched team applications")

    existing = db.query(models.MatchApplication).filter(
        models.MatchApplication.game_id == app_data.gameId,
        models.MatchApplication.applicant_coach_id == app_data.applicantCoachId,
    ).first()
    if existing:
        return existing
    new_app = models.MatchApplication(
        id=f"ma_{uuid.uuid4().hex[:8]}",
        game_id=app_data.gameId,
        applicant_coach_id=app_data.applicantCoachId,
        applicant_group_id=app_data.applicantGroupId or None,
        status=app_data.status or 'pending',
    )
    db.add(new_app)

    # Notify game owner that a new opponent application has arrived.
    applicant = db.query(models.User).filter(models.User.id == app_data.applicantCoachId).first()

    if game and game.creator_id and game.creator_id != app_data.applicantCoachId:
        game_label = f"{game.sport} @ {game.location} ({game.time})"
        applicant_name = applicant.name if applicant else "A coach"
        team_name = applicant_group.team_name if applicant_group else "Unknown team"
        age_gender = f"{(applicant_group.age_group or '—')} / {(applicant_group.gender or '—')}" if applicant_group else "— / —"
        db.add(models.Notification(
            id=f"n_{uuid.uuid4().hex[:12]}",
            target_user_id=game.creator_id,
            title=_notif_i18n("notifMatchApplicationTitle"),
            body=_notif_i18n(
                "notifBodyMatchApplicationDetailed",
                coach=applicant_name,
                gameLabel=game_label,
                teamName=team_name,
                ageGender=age_gender,
            ),
            read=False,
            ts=datetime.utcnow().isoformat(),
        ))

    db.commit()
    db.refresh(new_app)
    return new_app

@app.put("/api/match_applications/{app_id}/status", response_model=MatchApplicationResponse)
def update_match_application_status(app_id: str, data: MatchApplicationStatusUpdate, db: Session = Depends(get_db)):
    application = db.query(models.MatchApplication).filter(models.MatchApplication.id == app_id).first()
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    application.status = data.status

    # Auto-invite players from both teams when application is accepted
    if data.status == 'accepted':
        game = db.query(models.Game).filter(models.Game.id == application.game_id).first()
        player_ids_to_invite: set = set()

        if game and game.home_group_id:
            home_group = db.query(models.TeamGroup).filter(models.TeamGroup.id == game.home_group_id).first()
            if home_group:
                player_ids_to_invite.update(home_group.player_ids or [])

        if application.applicant_group_id:
            away_group = db.query(models.TeamGroup).filter(models.TeamGroup.id == application.applicant_group_id).first()
            if away_group:
                player_ids_to_invite.update(away_group.player_ids or [])

        # Record the opposing team's group on the game itself
        if game and application.applicant_group_id:
            game.opposing_group_id = application.applicant_group_id

        ts_now = datetime.utcnow().isoformat()
        game_label = f"{game.sport} @ {game.location} ({game.time})" if game else "比赛"
        for pid in player_ids_to_invite:
            exists = db.query(models.Roster).filter(
                models.Roster.game_id == application.game_id,
                models.Roster.player_id == pid,
            ).first()
            if not exists:
                db.add(models.Roster(
                    id=f"r_{uuid.uuid4().hex[:8]}",
                    game_id=application.game_id,
                    player_id=pid,
                    status='invited',
                    guardian_approved=False,
                ))
                db.add(models.Notification(
                    id=f"n_{uuid.uuid4().hex[:12]}",
                    target_user_id=pid,
                    title="🏅 比赛邀请 / Game Invitation",
                    body=f"您已被邀请参加「{game_label}」/ You have been invited to \"{game_label}\".",
                    read=False,
                    ts=ts_now,
                ))

    db.commit()
    db.refresh(application)
    return application

@app.delete("/api/match_applications/{app_id}", status_code=204)
def delete_match_application(app_id: str, db: Session = Depends(get_db)):
    application = db.query(models.MatchApplication).filter(models.MatchApplication.id == app_id).first()
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    db.delete(application)
    db.commit()

# --- Rosters ---

@app.get("/api/rosters", response_model=List[RosterResponse])
def get_all_rosters(db: Session = Depends(get_db)):
    return db.query(models.Roster).all()

@app.post("/api/rosters/batch", response_model=List[RosterResponse], status_code=201)
def batch_create_rosters(rosters: List[RosterCreate], db: Session = Depends(get_db)):
    created = []
    for r in rosters:
        existing = db.query(models.Roster).filter(
            models.Roster.game_id == r.gameId,
            models.Roster.player_id == r.playerId,
        ).first()
        if existing:
            created.append(existing)
            continue
        new_roster = models.Roster(
            id=f"r_{uuid.uuid4().hex[:8]}",
            game_id=r.gameId,
            player_id=r.playerId,
            status=r.status or 'invited',
            guardian_approved=False,
        )
        db.add(new_roster)
        created.append(new_roster)
    db.commit()
    for r in created:
        db.refresh(r)
    return created

@app.put("/api/rosters/{roster_id}/status", response_model=RosterResponse)
def update_roster_status(roster_id: str, status_data: RosterStatusUpdate, db: Session = Depends(get_db)):
    roster = db.query(models.Roster).filter(models.Roster.id == roster_id).first()
    if not roster:
        raise HTTPException(status_code=404, detail="Roster entry not found")

    # Players who withdrew are locked in non-participating state.
    if roster.status == "withdrawn" and status_data.status != "withdrawn":
        raise HTTPException(status_code=400, detail="Withdrawn roster entry is locked")

    roster.status = status_data.status
    if status_data.guardian_approved is not None:
        roster.guardian_approved = status_data.guardian_approved
    if status_data.withdraw_reason is not None:
        roster.withdraw_reason = status_data.withdraw_reason
    elif status_data.status != "withdrawn":
        roster.withdraw_reason = None
    db.commit()
    db.refresh(roster)
    return roster

# --- Settings ---

@app.get("/api/settings", response_model=SettingsResponse)
def get_settings(db: Session = Depends(get_db)):
    settings = db.query(models.Settings).filter(models.Settings.id == 1).first()
    if not settings:
        settings = models.Settings(id=1, underage_limit=16)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings

@app.put("/api/settings", response_model=SettingsResponse)
def update_settings(data: SettingsUpdate, db: Session = Depends(get_db)):
    settings = db.query(models.Settings).filter(models.Settings.id == 1).first()
    if not settings:
        settings = models.Settings(id=1, underage_limit=data.underageLimit)
        db.add(settings)
    else:
        settings.underage_limit = data.underageLimit
    db.commit()
    _auto_unbind_aged_out_players(db)
    db.refresh(settings)
    return settings

# --- Notifications ---

class NotificationCreate(BaseModel):
    targetUserId: str
    title: str
    body: str

class NotificationResponse(BaseModel):
    id: str
    target_user_id: str
    title: str
    body: str
    read: bool
    ts: str
    class Config:
        from_attributes = True

@app.post("/api/notifications", response_model=NotificationResponse, status_code=201)
def create_notification(data: NotificationCreate, db: Session = Depends(get_db)):
    notif = models.Notification(
        id=f"n_{uuid.uuid4().hex[:12]}",
        target_user_id=data.targetUserId,
        title=data.title,
        body=data.body,
        read=False,
        ts=datetime.utcnow().isoformat(),
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif

@app.get("/api/notifications/{user_id}", response_model=List[NotificationResponse])
def get_notifications(user_id: str, db: Session = Depends(get_db)):
    return (
        db.query(models.Notification)
        .filter(models.Notification.target_user_id == user_id)
        .order_by(models.Notification.ts.desc())
        .all()
    )

@app.put("/api/notifications/{user_id}/read_all", status_code=204)
def mark_all_notifications_read(user_id: str, db: Session = Depends(get_db)):
    db.query(models.Notification).filter(
        models.Notification.target_user_id == user_id,
        models.Notification.read == False,
    ).update({"read": True})
    db.commit()

# --- Root ---

@app.get("/")
def read_root():
    return {"message": "Team Matcher API is running. Visit /docs for Swagger UI."}
