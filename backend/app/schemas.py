from datetime import date as Date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    name: str
    created_at: datetime


class AuthRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)

    @field_validator("password")
    @classmethod
    def bcrypt_byte_limit(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password must be at most 72 UTF-8 bytes")
        return value


class SignupRequest(AuthRequest):
    name: str = Field(min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Name cannot be empty")
        return value


class AuthResponse(BaseModel):
    token: str
    user: UserOut


class NoteCreate(BaseModel):
    title: str = Field(default="Untitled", max_length=255)
    content: str = Field(default="", max_length=500_000)


class NoteUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    content: str | None = Field(default=None, max_length=500_000)
    is_favorite: bool | None = None
    position: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def reject_null_fields(self):
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Note fields cannot be null")
        return self


class NoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    content: str
    is_favorite: bool
    position: int
    created_at: datetime
    updated_at: datetime


class FolderInput(BaseModel):
    parent_id: int | None = Field(default=None, ge=1)
    name: str = Field(min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Folder name cannot be empty")
        return value


class FolderUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    parent_id: int | None = Field(default=None, ge=1)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        if value is None or not value.strip():
            raise ValueError("Folder name cannot be empty")
        return value.strip()


class FolderOut(BaseModel):
    parent_id: int | None
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    created_at: datetime


class DocumentMove(BaseModel):
    folder_id: int | None = Field(ge=1)


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    mime_type: str
    folder_id: int | None
    extension: str
    size: int
    status: str
    error: str | None
    page_count: int
    created_at: datetime
    updated_at: datetime


class DocumentContent(BaseModel):
    id: int
    name: str
    extension: str
    text: str
    pages: list[str]


class StudySessionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    topic: str = Field(default="study", max_length=100)
    notes: str = Field(default="", max_length=5000)
    date: Date
    start_minutes: int = Field(default=1080, ge=0, le=1435)
    duration_minutes: int = Field(default=45, ge=5, le=480)
    document_id: int | None = None

    @model_validator(mode="after")
    def fits_in_one_day(self):
        if self.start_minutes + self.duration_minutes > 1440:
            raise ValueError("Study sessions must end by midnight")
        return self


class StudySessionUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    topic: str | None = Field(default=None, max_length=100)
    notes: str | None = Field(default=None, max_length=5000)
    date: Date | None = None
    start_minutes: int | None = Field(default=None, ge=0, le=1435)
    duration_minutes: int | None = Field(default=None, ge=5, le=480)
    document_id: int | None = None
    completed: bool | None = None

    @model_validator(mode="after")
    def reject_null_fields(self):
        nullable = {"document_id"}
        if any(field not in nullable and getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Only document_id can be null")
        return self


class StudySessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    topic: str
    notes: str
    date: Date
    start_minutes: int
    duration_minutes: int
    completed: bool
    source: str
    document_id: int | None
    created_at: datetime
    completed_at: datetime | None


class ScheduleGenerateRequest(BaseModel):
    document_ids: list[int] = Field(default_factory=list, max_length=20)
    start_date: Date
    end_date: Date
    minutes_per_day: int = Field(default=90, ge=20, le=480)
    session_length: int = Field(default=45, ge=15, le=180)
    preferred_start: str = Field(default="18:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    selected_days: list[int] = Field(default=[0, 1, 2, 3, 4, 5, 6], min_length=1, max_length=7)
    focus: str = Field(default="", max_length=1000)
    replace_existing: bool = False

    @field_validator("selected_days")
    @classmethod
    def valid_days(cls, value: list[int]) -> list[int]:
        days = sorted(set(value))
        if any(day < 0 or day > 6 for day in days):
            raise ValueError("Days must use Monday=0 through Sunday=6")
        return days

    @field_validator("end_date")
    @classmethod
    def reasonable_range(cls, value: Date, info):
        start = info.data.get("start_date")
        if start and value < start:
            raise ValueError("End date must be after the start date")
        if start and (value - start).days > 92:
            raise ValueError("Schedule range cannot exceed 93 days")
        return value


class SourceOut(BaseModel):
    document_id: int
    document_name: str
    page: int
    snippet: str


class CalendarDetails(BaseModel):
    date: Date | None = None
    start_time: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    duration_minutes: int | None = Field(default=None, ge=5, le=480)


class ChatRequest(BaseModel):
    create_session: bool = False
    session_details: CalendarDetails | None = None
    reference_date: Date | None = None
    timezone: str = Field(default="local time", max_length=80)
    create_note: bool = False
    message: str = Field(min_length=1, max_length=12_000)
    subject_id: int | None = Field(default=None, gt=0)
    conversation_id: int | None = None
    document_ids: list[int] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def one_action(self):
        if self.create_note and self.create_session:
            raise ValueError("Choose either note creation or calendar creation")
        return self


class ChatResponse(BaseModel):
    calendar_session: StudySessionOut | None = None
    message_id: int
    note: NoteOut | None = None
    conversation_id: int
    answer: str
    sources: list[SourceOut]
    mode: str


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    created_at: datetime
    updated_at: datetime


class MessageOut(BaseModel):
    calendar_session: StudySessionOut | None = None
    note_id: int | None = None
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: str
    content: str
    sources: list[SourceOut]
    created_at: datetime


class ProfileUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class HighlightRect(BaseModel):
    x: float = Field(ge=0, le=1, allow_inf_nan=False)
    y: float = Field(ge=0, le=1, allow_inf_nan=False)
    width: float = Field(gt=0, le=1, allow_inf_nan=False)
    height: float = Field(gt=0, le=1, allow_inf_nan=False)

    @model_validator(mode="after")
    def fits_page(self):
        if self.x + self.width > 1.001 or self.y + self.height > 1.001:
            raise ValueError("Highlight must fit within the page")
        return self


class HighlightCreate(BaseModel):
    page: int = Field(ge=1, le=400)
    text: str = Field(min_length=1, max_length=10000)
    rects: list[HighlightRect] = Field(min_length=1, max_length=1000)


class HighlightOut(HighlightCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    document_id: int
    created_at: datetime
