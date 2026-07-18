import os

from dotenv import load_dotenv
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, JSON
from sqlalchemy.ext.mutable import MutableList
from database import Base

load_dotenv()

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    role = Column(String, index=True)  # 'coach', 'player', 'guardian', 'admin'
    name = Column(String)
    email = Column(String, unique=True, index=True)
    phone = Column(String, nullable=True)
    dob = Column(String, nullable=True)
    guardian_id = Column(String, ForeignKey("users.id"), nullable=True)
    bio = Column(String, nullable=True)
    sport = Column(String, nullable=True)
    status = Column(String, nullable=True, default='active')
    password = Column(String, nullable=True, default=os.getenv("DEFAULT_USER_PASSWORD", "change_me_please"))
    default_location = Column(String, nullable=True)
    default_club_id = Column(String, nullable=True)
    verification_token = Column(String, nullable=True)

class Game(Base):
    __tablename__ = "games"

    id = Column(String, primary_key=True, index=True)
    creator_id = Column(String, ForeignKey("users.id"))
    sport = Column(String)
    time = Column(String)
    location = Column(String)
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

class Settings(Base):
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, default=1)
    underage_limit = Column(Integer, default=16)

class InviteCode(Base):
    __tablename__ = "invite_codes"

    id = Column(String, primary_key=True, index=True)
    code = Column(String, unique=True, index=True)
    coach_id = Column(String, ForeignKey("users.id"))

class Club(Base):
    __tablename__ = "clubs"

    id = Column(String, primary_key=True, index=True)
    coach_id = Column(String, ForeignKey("users.id"))
    name = Column(String)
    group_id = Column(String, ForeignKey("team_groups.id"), nullable=True)
    used = Column(Boolean, default=False)
    used_by_player_id = Column(String, nullable=True)
    created_at = Column(String)

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