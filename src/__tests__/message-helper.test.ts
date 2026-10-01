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
  canReply: false,
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
    expect(mapped.attachmentUrl).toBeUndefined();
    expect(mapped.text).toBe('');
  });

  it('maps image attachments to GiftedChat image messages', () => {
    const mapped = mapWebimToChatMessage(makeMessage('image/jpeg'));

    expect(mapped.image).toBe('https://example.test/attachment');
    expect(mapped.video).toBeUndefined();
    expect(mapped.attachmentUrl).toBeUndefined();
  });

  it('keeps other file attachments as named text messages', () => {
    const mapped = mapWebimToChatMessage(makeMessage('application/pdf'));

    expect(mapped.text).toBe('attachment');
    expect(mapped.image).toBeUndefined();
    expect(mapped.video).toBeUndefined();
    expect(mapped.attachmentUrl).toBe('https://example.test/attachment');
  });
});

describe('mapWebimToChatMessage keyboards', () => {
  it('maps active keyboard button rows to radio quick replies', () => {
    const message = {
      ...makeMessage('text/plain'),
      type: 'KEYBOARD',
      attachment: undefined,
      text: 'Choose an option',
      keyboard: {
        buttons: [
          [
            { id: 'option-1', text: 'First option' },
            { id: 'option-2', text: 'Second option' },
          ],
        ],
        state: 'PENDING',
      },
    } as WebimMessage;

    const mapped = mapWebimToChatMessage(message);

    expect(mapped.quickReplies).toEqual({
      type: 'radio',
      values: [
        { title: 'First option', value: 'option-1' },
        { title: 'Second option', value: 'option-2' },
      ],
      keepIt: false,
    });
  });

  it('does not create quick replies from quotes or inactive keyboards', () => {
    const message = {
      ...makeMessage('text/plain'),
      type: 'KEYBOARD',
      attachment: undefined,
      keyboard: {
        buttons: [[{ id: 'option-1', text: 'First option' }]],
        state: 'COMPLETED',
      },
      quote: {
        senderName: 'Operator',
        messageId: 'quoted-message',
        messageText: 'Quoted text',
        messageType: 'OPERATOR',
        state: 'FILLED',
        timestamp: 1,
      },
    } as WebimMessage;

    expect(mapWebimToChatMessage(message).quickReplies).toBeUndefined();
  });
});