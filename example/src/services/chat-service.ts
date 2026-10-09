import { RNWebim, SessionBuilderParams } from 'rn-webim-chat';

let currentOwner: object | null = null;
let pending: Promise<void> = Promise.resolve();

function serialize(operation: () => Promise<void>): Promise<void> {
  const result = pending.then(operation);
  pending = result.catch(() => {});
  return result;
}

export function openChatSession(owner: object, params: SessionBuilderParams) {
  return serialize(async () => {
    if (currentOwner === owner) return;
    await RNWebim.destroySession(false);
    currentOwner = null;
    await RNWebim.initSession(params);
    currentOwner = owner;
    await RNWebim.resumeSession();
  });
}

export function closeChatSession(owner: object) {
  return serialize(async () => {
    if (currentOwner !== owner) return;
    await RNWebim.destroySession(false);
    currentOwner = null;
  });
}
