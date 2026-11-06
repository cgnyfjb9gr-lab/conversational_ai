"""Test fixtures for direct row construction (framework P1, see Test-Framework-Design.md).

Appends rows when a test needs specific pre-existing state that the UI could not
produce on its own (for example a user message, or a reply from a specific agent).
Backed by the engine fixture from conftest.py.
"""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app import models


def chat_turn(db: Session, session_id: str, user_text: str, assistant_text: str, source="mock"):
    """Insert a connected user/assistant turn; return the assistant row.

    Models define no relationship(), so the session row must be flushed before
    messages reference it (the same pattern the existing tests use).
    """
    db.add(models.Session(id=session_id))
    db.flush()
    t = datetime.now(timezone.utc)
    user = models.Message(session_id=session_id, role="user", content=user_text, created_at=t)
    assistant = models.Message(
        session_id=session_id,
        role="assistant",
        content=assistant_text,
        source=source,
        created_at=t,
    )
    db.add_all([user, assistant])
    db.commit()
    return assistant


def user_only(db: Session, session_id: str, text: str = "text"):
    """Insert only a user message (rating it must be refused per the contract)."""
    db.add(models.Session(id=session_id))
    db.flush()
    message = models.Message(session_id=session_id, role="user", content=text)
    db.add(message)
    db.commit()
    return message
