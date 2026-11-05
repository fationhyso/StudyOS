export type TutorMode = 'chat' | 'note' | 'session';
export function tutorRequest(text: string, mode: TutorMode) {
  const trimmed = text.trim();
  const command = trimmed.match(/^\/(note|session)(?:\s|$)/i);
  const action: TutorMode = command ? command[1].toLowerCase() as 'note' | 'session'
    : mode === 'chat' && /^(?:please\s+)?(?:(?:schedule|book)\s+|(?:create|add)\s+(?:a\s+)?(?:calendar|study)\s+session\b)/i.test(trimmed)
      ? 'session' : mode;
  return { action, message: command ? trimmed.replace(/^\/(?:note|session)\s*/i, '') : trimmed };
}
