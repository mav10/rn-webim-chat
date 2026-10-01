import {
  mergeMessages,
  removeMessage,
  replaceMessage,
} from '../../example/src/withCustomUI/message-store';
import type { WebimMessage } from '../types';

const message = (id: string, time: number): WebimMessage => ({
  id,
  serverSideId: '',
  time,
  type: 'VISITOR',
  text: id,
  name: 'Visitor',
  status: 'SENDING',
  read: false,
  canEdit: false,
  carReply: false,
  isEdited: false,
  canReact: false,
  canChangeReaction: false,
});

describe('message store', () => {
  it('preserves live updates when older history arrives', () => {
    const sent = { ...message('one', 2), status: 'SENT' as const };
    const history = [message('two', 1), message('one', 2)];

    expect(mergeMessages([sent], history, 'history')).toEqual([
      sent,
      history[0],
    ]);
  });

  it('replaces a pending message rather than appending its confirmation', () => {
    const pending = message('one', 1);
    const sent = {
      ...pending,
      serverSideId: 'server-one',
      status: 'SENT' as const,
    };
    expect(mergeMessages([pending], [sent], 'event')).toEqual([sent]);
  });

  it('applies edits and removals using the original message identity', () => {
    const original = message('one', 1);
    const edited = { ...original, text: 'updated' };
    expect(replaceMessage([original], original, edited)).toEqual([edited]);
    expect(removeMessage([edited], original)).toEqual([]);
  });
});
