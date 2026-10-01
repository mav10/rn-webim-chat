import type { WebimMessage } from 'rn-webim-chat';

const sameMessage = (left: WebimMessage, right: WebimMessage) =>
  left.id === right.id ||
  (!!left.serverSideId && left.serverSideId === right.serverSideId);

const newestFirst = (messages: WebimMessage[]) =>
  [...messages].sort((left, right) => right.time - left.time);

export function mergeMessages(
  current: WebimMessage[],
  incoming: WebimMessage[],
  source: 'history' | 'event'
): WebimMessage[] {
  const merged = [...current];
  for (const message of incoming) {
    const index = merged.findIndex((existing) =>
      sameMessage(existing, message)
    );
    if (index === -1) {
      merged.push(message);
    } else if (source === 'event') {
      merged[index] = message;
    }
  }
  return newestFirst(merged);
}

export function replaceMessage(
  current: WebimMessage[],
  previous: WebimMessage,
  next: WebimMessage
): WebimMessage[] {
  return mergeMessages(
    current.filter((message) => !sameMessage(message, previous)),
    [next],
    'event'
  );
}

export function removeMessage(current: WebimMessage[], target: WebimMessage) {
  return current.filter((message) => !sameMessage(message, target));
}
