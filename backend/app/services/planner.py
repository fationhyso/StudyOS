import re
from datetime import timedelta
from typing import Any

from ..models import Document


def clean_topic(line: str) -> str:
    line = re.sub(r"^#{1,6}\s*", "", line)
    line = re.sub(r"^(chapter|unit|module|week|lesson)?\s*\d+[.:)\-]\s*", "", line, flags=re.I)
    return re.sub(r"\s+", " ", line).strip(" #*_-\t")[:90]


def extract_topics(documents: list[Document], focus: str = "") -> list[tuple[str, int | None]]:
    topics: list[tuple[str, int | None]] = []
    seen: set[str] = set()
    for document in documents:
        lines = [line.strip() for line in document.text.splitlines() if len(line.strip()) >= 5]
        headings = [line for line in lines if line.startswith("#") or re.match(r"^(chapter|unit|module|week|lesson)\s+\d+", line, re.I)]
        candidates = headings or [line for line in lines[:40] if len(line) <= 140][:12]
        if not candidates and document.text:
            candidates = [" ".join(document.text.split()[:10])]
        for line in candidates:
            topic = clean_topic(line)
            if len(topic) >= 4 and topic.lower() not in seen:
                seen.add(topic.lower())
                topics.append((topic, document.id))
    if not topics:
        topics.append((focus.strip() or "Independent study and active recall", None))
    return topics[:40]


def build_offline_schedule(documents: list[Document], preferences: dict[str, Any]) -> list[dict[str, Any]]:
    topics = extract_topics(documents, preferences.get("focus", ""))
    sessions = []
    current = preferences["start_date"]
    end = preferences["end_date"]
    allowed_days = set(preferences["selected_days"])
    session_length = preferences["session_length"]
    daily_minutes = preferences["minutes_per_day"]
    start_hour, start_minute = map(int, preferences["preferred_start"].split(":"))
    day_start = start_hour * 60 + start_minute
    topic_index = 0

    while current <= end:
        if current.weekday() in allowed_days:
            used = 0
            cursor = day_start
            while used < daily_minutes and cursor < 1435:
                remaining = daily_minutes - used
                duration = min(session_length, remaining)
                if duration < 15 or cursor + duration > 1440:
                    break
                topic, document_id = topics[topic_index % len(topics)]
                sequence = topic_index % 6
                kind = "review" if sequence in {2, 5} else "practice" if sequence == 4 else "study"
                if kind == "review" and topic_index > 0:
                    topic, document_id = topics[(topic_index - 1) % len(topics)]
                notes = {
                    "study": "Read actively, make a short concept map, and write three recall questions.",
                    "review": "Use spaced recall: review without notes first, then check and correct gaps.",
                    "practice": "Work through problems or flashcards. Mark difficult items for the next review.",
                }[kind]
                sessions.append({
                    "date": current,
                    "start_minutes": cursor,
                    "duration_minutes": duration,
                    "title": topic,
                    "topic": kind,
                    "notes": notes,
                    "document_id": document_id,
                })
                used += duration + 10
                cursor += duration + 10
                topic_index += 1
        current += timedelta(days=1)
    return sessions


def validate_ai_sessions(raw_sessions: list[dict[str, Any]], preferences: dict[str, Any], document_ids: list[int]) -> list[dict[str, Any]] | None:
    from datetime import datetime

    if not raw_sessions or len(raw_sessions) > 500:
        return None
    valid = []
    allowed_days = set(preferences["selected_days"])
    start_hour, start_minute = map(int, preferences["preferred_start"].split(":"))
    preferred_minutes = start_hour * 60 + start_minute
    try:
        for item in raw_sessions:
            if not isinstance(item, dict):
                return None
            session_date = datetime.strptime(str(item["date"]), "%Y-%m-%d").date()
            start_time = datetime.strptime(str(item["start_time"]), "%H:%M")
            duration = int(item["duration_minutes"])
            start_minutes = start_time.hour * 60 + start_time.minute
            document_id = item.get("document_id")
            if not preferences["start_date"] <= session_date <= preferences["end_date"]:
                return None
            if session_date.weekday() not in allowed_days or not 5 <= duration <= preferences["session_length"]:
                return None
            if start_minutes < preferred_minutes or start_minutes + duration > 1440:
                return None
            if document_id is not None and int(document_id) not in document_ids:
                return None
            title = str(item.get("title", "Study session")).strip()[:255]
            if not title:
                return None
            topic = str(item.get("topic", "study"))
            valid.append({
                "date": session_date,
                "start_minutes": start_minutes,
                "duration_minutes": duration,
                "title": title,
                "topic": topic if topic in {"study", "review", "practice"} else "study",
                "notes": str(item.get("notes", ""))[:5000],
                "document_id": int(document_id) if document_id is not None else None,
            })
    except (KeyError, TypeError, ValueError):
        return None

    for session_date in {item["date"] for item in valid}:
        daily = sorted((item for item in valid if item["date"] == session_date), key=lambda item: item["start_minutes"])
        if sum(item["duration_minutes"] for item in daily) + 10 * (len(daily) - 1) > preferences["minutes_per_day"]:
            return None
        previous_end = None
        for item in daily:
            if previous_end is not None and item["start_minutes"] < previous_end + 10:
                return None
            previous_end = item["start_minutes"] + item["duration_minutes"]
    return valid or None
