"""Turn explicit tutor requests into validated local-wall-time calendar sessions."""
import json
import re
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Document, StudySession
from ..schemas import ChatRequest, StudySessionCreate
from .ai import call_ai


def local_parse(message: str, reference: date) -> dict:
    lower = message.lower()
    result = {}
    iso = re.search(r'\b\d{4}-\d{2}-\d{2}\b', message)
    if iso:
        result['date'] = iso.group()
    elif re.search(r'\btomorrow\b', lower):
        result['date'] = str(reference + timedelta(days=1))
    elif re.search(r'\btoday\b', lower):
        result['date'] = str(reference)
    time = re.search(r'\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b', lower)
    if time:
        hour, minute, meridian = int(time[1]), int(time[2] or 0), time[3]
        # Bare "at 6" is ambiguous: request a 24-hour time or am/pm instead.
        if minute < 60 and ((meridian and 1 <= hour <= 12) or (not meridian and time[2] and hour < 24)):
            if meridian:
                hour = hour % 12 + (12 if meridian == 'pm' else 0)
            result['start_time'] = f'{hour:02}:{minute:02}'
    duration = re.search(r'\bfor\s+(\d+)\s*(minutes?|mins?|hours?|hrs?)\b', lower)
    if duration:
        result['duration_minutes'] = int(duration[1]) * (60 if duration[2].startswith(('h',)) else 1)
    title = re.sub(r'^\s*(?:please\s+)?(?:schedule|create|add|book)\s+(?:(?:a|an)\s+)?(?:(?:study|calendar)\s+session\s+(?:for\s+)?)?', '', message, flags=re.I)
    title = re.split(r'\s+(?:today|tomorrow|on\s+\d{4}-|at\s+\d|for\s+\d)', title, maxsplit=1, flags=re.I)[0].strip(' .,:')
    result['title'] = title[:255] or 'Study session'
    return result


async def prepare_session(db: Session, user_id: int, payload: ChatRequest, history: list[dict]):
    reference = payload.reference_date or date.today()
    explicit = payload.session_details.model_dump(exclude_none=True) if payload.session_details else {}
    if not {'date', 'start_time', 'duration_minutes'} <= explicit.keys() and (len(re.findall(r'\bat\s+\d', payload.message, re.I)) > 1 or re.search(r'\b(?:daily|weekly|every|weekdays|sessions)\b', payload.message, re.I)):
        return None, 'I can add one calendar session here. For a multi-session study plan, use Schedule → Generate plan.', 'offline'
    parsed = local_parse(payload.message, reference)
    mode = 'offline'
    # Explicit UI details take precedence over natural-language interpretation.
    if not {'date', 'start_time', 'duration_minutes'} <= explicit.keys():
        response = await call_ai([
            {'role': 'system', 'content': (
                'Parse a request to CREATE ONE study calendar session. Return JSON with either '
                '{"session":{"title":"Biology","date":"YYYY-MM-DD","start_time":"HH:MM",'
                '"duration_minutes":45,"topic":"study","notes":"","document_id":null}} '
                'or {"session":null,"clarification":"Ask for missing or ambiguous details"}. '
                'Do not invent missing dates, start times, or durations. Use the supplied local reference date '
                'and timezone to resolve relative dates. Dates/times are local wall time; never convert to UTC. '
                'Use conversation history only to complete the user\'s explicit scheduling request. '
                'Never claim a session was saved. Only supplied document IDs may be linked. '
                'Return a clarification for requests to create multiple sessions or a full study plan; '
                'tell the user to use Schedule > Generate plan for those.'
            )}, *history[-6:],
            {'role': 'user', 'content': json.dumps({'request': payload.message, 'reference_date': str(reference),
                'timezone': payload.timezone, 'explicit_details': explicit, 'document_ids': payload.document_ids})}
        ], json_mode=True)
        if response:
            try:
                data = json.loads(response)
                if isinstance(data.get('session'), dict):
                    parsed = data['session']
                    mode = get_settings().ai_model
                elif isinstance(data.get('clarification'), str) and data['clarification'].strip() and not explicit:
                    return None, data['clarification'].strip()[:2000], get_settings().ai_model
            except (ValueError, TypeError, AttributeError):
                pass
    parsed.update(explicit)
    if any(parsed.get(field) is None for field in ['date', 'start_time', 'duration_minutes']):
        return None, 'Please provide a date, an unambiguous start time, and a duration. For example: “Review biology tomorrow at 18:00 for 45 minutes.” You can also fill in the session details below.', mode
    try:
        hour, minute = map(int, str(parsed['start_time']).split(':'))
        if not 0 <= hour <= 23 or not 0 <= minute <= 59:
            raise ValueError('Invalid time')
        values = StudySessionCreate(title=str(parsed.get('title', 'Study session')).strip(),
            date=parsed['date'], start_minutes=hour * 60 + minute, duration_minutes=parsed['duration_minutes'],
            topic=parsed.get('topic', 'study'), notes=parsed.get('notes', ''), document_id=parsed.get('document_id'))
    except (ValueError, TypeError):
        return None, 'Those session details are invalid. Choose a valid date and time, 5–480 minutes, and an end time before midnight.', mode
    if values.document_id is not None:
        document = db.scalar(select(Document.id).where(Document.id == values.document_id, Document.user_id == user_id))
        if document is None or values.document_id not in payload.document_ids:
            return None, 'The proposed linked document is unavailable. Select one of your own resources and try again.', mode
    conflict = db.scalar(select(StudySession).where(StudySession.user_id == user_id,
        StudySession.date == values.date, StudySession.start_minutes < values.start_minutes + values.duration_minutes,
        StudySession.start_minutes + StudySession.duration_minutes > values.start_minutes))
    if conflict is not None:
        return None, f'That time overlaps with “{conflict.title}”. Choose another start time or edit the existing session in Schedule.', mode
    start = f'{values.start_minutes // 60:02}:{values.start_minutes % 60:02}'
    return values, f'Created **{values.title}** on **{values.date.isoformat()} at {start}**, for **{values.duration_minutes} minutes** ({payload.timezone}).', mode
