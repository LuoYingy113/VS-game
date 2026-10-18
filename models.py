import hashlib
import os

from dotenv import load_dotenv
from sqlalchemy import Column, Float, Integer, String, Boolean, ForeignKey, JSON
from sqlalchemy.ext.mutable import MutableList
from sqlalchemy.orm import validates
from database import Base

load_dotenv()

def hash_text(value) -> str:
    return hashlib.sha256((value or "").encode("utf-8")).hexdigest()


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    role = Column(String, index=True)  # single role or comma-separated roles
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    email = Column(String, unique=True, index=True)
    phone = Column(String, nullable=True)
    dob = Column(String, nullable=True)
    guardian_id = Column(String, ForeignKey("users.id"), nullable=True)
    bio = Column(String, nullable=True)
    sport = Column(String, nullable=True)
    status = Column(String, nullable=True, default='active')
    password = Column(String, nullable=True, default=hash_text(os.getenv("DEFAULT_USER_PASSWORD", "change_me_please")))
    default_location = Column(String, nullable=True)
    default_location_lng = Column(Float, nullable=True)
    default_location_lat = Column(Float, nullable=True)
    default_club_id = Column(String, nullable=True)
    games_played_count = Column(Integer, nullable=False, default=0)
    verification_token = Column(String, nullable=True)
    jersey_number = Column(String, nullable=True)

    @validates("password")
    def _hash_password(self, key, value):
        return hash_text(value) if value is not None else None

    @property
    def name(self) -> str:
        first = (self.first_name or "").strip()
        last = (self.last_name or "").strip()
        if first and last:
            return f"{first} {last}"
        return first or last

    @name.setter
    def name(self, value: str) -> None:
        # Backward compatibility: existing code assigns full name to `name`.
        self.first_name = (value or "").strip() or None
        self.last_name = None

class Game(Base):
    __tablename__ = "games"

    id = Column(String, primary_key=True, index=True)
    creator_id = Column(String, ForeignKey("users.id"))
    sport = Column(String)
    time = Column(String)
    location = Column(String)
    location_lng = Column(Float, nullable=True)
    location_lat = Column(Float, nullable=True)
    age_group = Column(String)
    gender = Column(String, nullable=True)  # 'male' | 'female' | 'mixed'
    deadline = Column(String, nullable=True)
    description = Column(String, nullable=True)
    contact_phone = Column(String, nullable=True)
    status = Column(String, default="open")
    opposing_team_id = Column(String, ForeignKey("users.id"), nullable=True)
    opposing_group_id = Column(String, ForeignKey("team_groups.id"), nullable=True)
    volunteers = Column(MutableList.as_mutable(JSON), nullable=True, default=list)
    home_group_id = Column(String, ForeignKey("team_groups.id"), nullable=True)
    is_private = Column(Boolean, default=False)
    game_invite_code = Column(String, nullable=True)
    occurrence_counted = Column(Boolean, default=False)
    strict_age_match = Column(Boolean, default=False)

class TeamGroup(Base):
    __tablename__ = "team_groups"

    id = Column(String, primary_key=True, index=True)
    coach_id = Column(String, ForeignKey("users.id"))
    team_name = Column(String)  # e.g. "Lions"
    age_group = Column(String)  # e.g. "U12", "U16", "Adult"
    player_ids = Column(MutableList.as_mutable(JSON), nullable=True, default=list)
    invite_code = Column(String, unique=True, nullable=True)
    gender = Column(String, nullable=True)       # 'male' | 'female' | 'mixed'
    club_id = Column(String, ForeignKey("clubs.id"), nullable=True)
    offline_players = Column(JSON, default=list)
    sport = Column(String, nullable=True)

class MatchApplication(Base):
    __tablename__ = "match_applications"

    id = Column(String, primary_key=True, index=True)
    game_id = Column(String, ForeignKey("games.id"))
    applicant_coach_id = Column(String, ForeignKey("users.id"))
    applicant_group_id = Column(String, ForeignKey("team_groups.id"), nullable=True)
    status = Column(String, default="pending")

class Roster(Base):
    __tablename__ = "rosters"

    id = Column(String, primary_key=True, index=True)
    game_id = Column(String, ForeignKey("games.id"))
    player_id = Column(String, ForeignKey("users.id"))
    status = Column(String, default="invited")
    guardian_approved = Column(Boolean, default=False)
    withdraw_reason = Column(String, nullable=True)

class CoachPlayerNote(Base):
    __tablename__ = "coach_player_notes"

    id = Column(String, primary_key=True, index=True)
    coach_id = Column(String, ForeignKey("users.id"), index=True)
    player_id = Column(String, index=True)
    nickname = Column(String)

class GuardianPlayerLinkRequest(Base):
    __tablename__ = "guardian_player_link_requests"

    id = Column(String, primary_key=True, index=True)
    guardian_id = Column(String, ForeignKey("users.id"), index=True)
    player_id = Column(String, ForeignKey("users.id"), index=True)
    token = Column(String, unique=True, index=True)
    status = Column(String, default="pending")
    created_at = Column(String, nullable=False)
    expires_at = Column(String, nullable=False)

class Settings(Base):
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, default=1)
    underage_limit = Column(Integer, default=16)

class InviteCode(Base):
    __tablename__ = "invite_codes"

    id = Column(String, primary_key=True, index=True)
    code = Column(String, unique=True, index=True)
    coach_id = Column(String, ForeignKey("users.id"))
    group_id = Column(String, ForeignKey("team_groups.id"), nullable=True)
    used = Column(Boolean, default=False)
    used_by_player_id = Column(String, nullable=True)
    created_at = Column(String, nullable=True)
    expires_at = Column(String, nullable=True)

class Club(Base):
    __tablename__ = "clubs"

    id = Column(String, primary_key=True, index=True)
    coach_id = Column(String, ForeignKey("users.id"))
    name = Column(String)
    default_location = Column(String, nullable=True)
    default_location_lng = Column(Float, nullable=True)
    default_location_lat = Column(Float, nullable=True)

class CoachInviteCode(Base):
    __tablename__ = "coach_invite_codes"

    id = Column(String, primary_key=True)
    code = Column(String, unique=True)
    created_by_id = Column(String, ForeignKey("users.id"))
    used = Column(Boolean, default=False)
    used_by_id = Column(String, nullable=True)
    created_at = Column(String)

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String, primary_key=True, index=True)
    target_user_id = Column(String, ForeignKey("users.id"), index=True)
    title = Column(String)
    body = Column(String)
    read = Column(Boolean, default=False)
    ts = Column(String)  # ISO timestamp


class CoachGameHistory(Base):
    __tablename__ = "coach_game_history"

    id = Column(String, primary_key=True, index=True)
    coach_id = Column(String, ForeignKey("users.id"), index=True)
    game_id = Column(String, ForeignKey("games.id"), index=True)
    note = Column(String, nullable=True)
    result = Column(String, nullable=True)  # 'win' | 'lose'
    updated_at = Column(String, nullable=False)


class GameOccurrenceConfirmation(Base):
    __tablename__ = "game_occurrence_confirmations"

    id = Column(String, primary_key=True, index=True)
    game_id = Column(String, ForeignKey("games.id"), index=True)
    coach_id = Column(String, ForeignKey("users.id"), index=True)
    confirmed = Column(Boolean, default=False)
    updated_at = Column(String, nullable=False)