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
  it.each([
    '[{"filename":"example.png"}]',
    '[{"url":"javascript:alert(1)"}]',
    JSON.stringify(
      [0, 1].map((index) => ({
        contentType: 'image/png',
        filename: `image-${index}.png`,
        localPath: `20261008_file-${index}`,
        size: 123,
        url: `https://account.webim.ru/l/v/m/download/file-${index}/image.png?page-id=abc&hash=def`,
      }))
    ),
    '{broken',
  ])(
    'keeps arbitrary and full attachment metadata JSON as text: %s',
    (text) => {
      for (const type of ['VISITOR', 'OPERATOR'] as const) {
        const message: WebimMessage = {
          ...makeMessage('image/png'),
          type,
          attachment: undefined,
          text,
        };
        const mapped = mapWebimToChatMessage(message);
        expect(mapped.text).toBe(text);
        expect(mapped.attachments).toEqual([]);
        expect(mapped.image).toBeUndefined();
        expect(mapped.video).toBeUndefined();
        expect(mapped.attachmentUrl).toBeUndefined();
        expect(mapped.webimMessage).toBe(message);
        expect(mapped.system).toBe(false);
      }
    }
  );

  it('does not show the raw payload of a structured file group', () => {
    const message = makeMessage('image/png');
    message.attachments = [
      message.attachment!,
      { ...message.attachment!, name: 'second.png' },
    ];
    message.text = '[{"internal":"metadata"}]';
    expect(mapWebimToChatMessage(message).text).toBe('');
  });

  it.each(['image/jpeg', 'video/mp4', 'application/pdf'])(
    'does not truncate a ten-file list beginning with %s',
    (contentType) => {
      const message = makeMessage(contentType);
      message.attachments = Array.from({ length: 10 }, (_, index) => ({
        ...message.attachment!,
        name: `file-${index}`,
        url: `https://example.test/file-${index}`,
      }));
      message.attachment = undefined;
      const mapped = mapWebimToChatMessage(message);
      expect(mapped.attachments).toEqual(message.attachments);
      expect(mapped.attachments).toHaveLength(10);
      expect(mapped.text).toBe('');
      expect(mapped.image).toBeUndefined();
      expect(mapped.video).toBeUndefined();
      expect(mapped.attachmentUrl).toBeUndefined();
      expect(mapped.webimMessage).toBe(message);
    }
  );

  it('maps plain text messages to an empty attachment list', () => {
    const message = {
      ...makeMessage('image/jpeg'),
      attachment: undefined,
      text: 'Hello',
    };
    const mapped = mapWebimToChatMessage(message);
    expect(mapped.attachments).toEqual([]);
    expect(mapped.text).toBe('Hello');
  });

  it('preserves every grouped attachment without a first-file media shortcut', () => {
    const message = makeMessage('image/jpeg');
    message.attachments = [
      message.attachment!,
      {
        ...message.attachment!,
        name: 'document.pdf',
        contentType: 'application/pdf',
      },
      { ...message.attachment!, name: 'video.mp4', contentType: 'video/mp4' },
    ];
    const mapped = mapWebimToChatMessage(message);

    expect(mapped.attachments).toBe(message.attachments);
    expect(mapped.attachments).toHaveLength(3);
    expect(mapped.text).toBe('');
    expect(mapped.webimMessage).toBe(message);
    expect(mapped.image).toBeUndefined();
    expect(mapped.video).toBeUndefined();
    expect(mapped.attachmentUrl).toBeUndefined();
  });

  it('prefers the native list and falls back to the legacy attachment alias', () => {
    const message = makeMessage('image/jpeg');
    message.attachments = [
      {
        ...message.attachment!,
        name: 'server-image.jpg',
        url: 'https://example.test/list',
      },
    ];
    const mapped = mapWebimToChatMessage(message);
    expect(mapped.attachments).toBe(message.attachments);
    expect(mapped.text).toBe('server-image.jpg');
    expect(mapped.attachmentUrl).toBe('https://example.test/list');
    expect(mapped.image).toBe('https://example.test/list');
    expect(mapped.video).toBeUndefined();
    expect(
      mapWebimToChatMessage(makeMessage('image/jpeg')).attachments
    ).toHaveLength(1);
    message.attachments = [];
    const legacy = mapWebimToChatMessage(message);
    expect(legacy.attachments).toEqual([message.attachment]);
    expect(legacy.text).toBe(message.attachment!.name);
    expect(legacy.attachmentUrl).toBe(message.attachment!.url);
    expect(legacy.image).toBe(message.attachment!.url);
    expect(legacy.video).toBeUndefined();
  });

  it.each([
    ['image/jpeg', 'photo.jpg'],
    ['video/mp4', 'video.mp4'],
    ['application/pdf', 'document.pdf'],
  ])(
    'maps %s native server attachments to media and link independently of local selection',
    (contentType, filename) => {
      const localSelection = [
        { name: filename, uri: `file:///tmp/${filename}`, contentType },
        { name: filename, uri: 'content://picker/selected-file', contentType },
      ];
      const serverUrl = `https://account.webim.ru/l/v/m/download/server-file/${filename}?page-id=abc&hash=def`;
      const message = makeMessage(contentType);
      message.attachment = {
        ...message.attachment!,
        name: filename,
        url: serverUrl,
      };
      message.attachments = [message.attachment];
      const mapped = mapWebimToChatMessage(message);

      expect(mapped.text).toBe(filename);
      expect(mapped.attachmentUrl).toBe(serverUrl);
      expect(mapped.attachmentUrl).toMatch(/^https:\/\//);
      for (const selection of localSelection) {
        expect(mapped.attachmentUrl).not.toBe(selection.uri);
      }
      expect(mapped.image).toBe(
        contentType.startsWith('image/') ? serverUrl : undefined
      );
      expect(mapped.video).toBe(
        contentType.startsWith('video/') ? serverUrl : undefined
      );
      expect(mapped.attachments).toBe(message.attachments);
      expect(mapped.webimMessage).toBe(message);
      expect(mapped.system).toBe(false);
      expect(mapped.user).toEqual({
        _id: 'custom_id',
        name: message.name,
        avatar: message.avatar,
      });

      localSelection.splice(0);
      expect(localSelection).toEqual([]);
      expect(mapWebimToChatMessage(message)).toEqual(mapped);
      expect(mapped.attachments[0]?.url).toBe(serverUrl);
    }
  );
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

    expect(mapped.webimMessage).toBe(message);
    expect(mapped.text).toBe(message.text);
    expect(mapped.system).toBe(true);
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

    const mapped = mapWebimToChatMessage(message);
    expect(mapped.quickReplies).toBeUndefined();
    expect(mapped.quote).toEqual(message.quote);
    expect(mapped.webimMessage).toBe(message);
  });
});
