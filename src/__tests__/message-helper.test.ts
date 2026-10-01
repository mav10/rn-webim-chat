import { mapWebimToChatMessage } from '../../example/src/withCustomUI/message-helper';
import type { WebimMessage } from '../types';

const makeMessage = (contentType: string): WebimMessage => ({
  id: 'message-1',
  serverSideId: 'server-1',
  time: 1,
  type: 'FILE_FROM_OPERATOR',
  text: '',
  name: 'Operator',
  status: 'SENT',
  read: true,
  canEdit: false,
  carReply: false,
  isEdited: false,
  canReact: false,
  canChangeReaction: false,
  attachment: {
    contentType,
    info: '',
    name: 'attachment',
    size: 10,
    url: 'https://example.test/attachment',
  },
});

describe('mapWebimToChatMessage attachments', () => {
  it('maps video attachments to GiftedChat video messages', () => {
    const mapped = mapWebimToChatMessage(makeMessage('video/mp4'));

    expect(mapped.video).toBe('https://example.test/attachment');
    expect(mapped.image).toBeUndefined();
    expect(mapped.text).toBe('');
  });

  it('maps image attachments to GiftedChat image messages', () => {
    const mapped = mapWebimToChatMessage(makeMessage('image/jpeg'));

    expect(mapped.image).toBe('https://example.test/attachment');
    expect(mapped.video).toBeUndefined();
  });

  it('keeps other file attachments as named text messages', () => {
    const mapped = mapWebimToChatMessage(makeMessage('application/pdf'));

    expect(mapped.text).toBe('attachment');
    expect(mapped.image).toBeUndefined();
    expect(mapped.video).toBeUndefined();
  });
});