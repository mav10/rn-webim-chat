import { findQuotedMessageIndex } from '../../example/src/withCustomUI/quote-navigation';
import type { WebimMessage } from '../types';

const messages = [
  { id: 'local-new', serverSideId: 'server-new' },
  { id: 'local-old', serverSideId: 'server-old' },
] as WebimMessage[];

it('finds a quoted source by its local identifier', () => {
  expect(findQuotedMessageIndex(messages, 'local-old')).toBe(1);
});

it('finds a quoted source by its server identifier', () => {
  expect(findQuotedMessageIndex(messages, 'server-old')).toBe(1);
});

it('does not fall back to another message for a missing source', () => {
  expect(findQuotedMessageIndex(messages, 'deleted')).toBe(-1);
  expect(findQuotedMessageIndex(messages, '')).toBe(-1);
  expect(findQuotedMessageIndex([], 'server-old')).toBe(-1);
});
