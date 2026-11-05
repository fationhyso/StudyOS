import { expect, it } from 'vitest';
import { tutorRequest } from './tutorAction';

it('recognizes explicit calendar requests in chat without mistaking questions for writes', () => {
  expect(tutorRequest('Schedule biology tomorrow at 18:00 for 45 minutes', 'chat').action).toBe('session');
  expect(tutorRequest('How can I schedule my week?', 'chat').action).toBe('chat');
  expect(tutorRequest('Explain the study schedule in my syllabus', 'chat').action).toBe('chat');
});
it('lets explicit slash commands override the selected mode', () => {
  expect(tutorRequest('/session Review physics', 'note')).toEqual({ action: 'session', message: 'Review physics' });
  expect(tutorRequest('/note Explain energy', 'session')).toEqual({ action: 'note', message: 'Explain energy' });
  expect(tutorRequest('tomorrow at 18:00 for 45 minutes', 'session').action).toBe('session');
});
