import { Lexer, Token, Tokens } from 'marked';
import type { LinkMatcher } from 'react-native-gifted-chat';

export function getMessageLinkMatchers(text: string): LinkMatcher[] {
  const links = new Map<string, Tokens.Link>();
  const collectLinks = (tokens: Token[]) => {
    for (const token of tokens) {
      if (token.type === 'link') links.set(token.raw, token as Tokens.Link);
      else if ('tokens' in token && token.tokens) collectLinks(token.tokens);
    }
  };
  collectLinks(Lexer.lexInline(text));
  if (!links.size) return [];
  const patterns = [...links.keys()]
    .sort((left, right) => right.length - left.length)
    .map((raw) => raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return [
    {
      type: 'url',
      pattern: new RegExp(patterns.join('|'), 'g'),
      getLinkUrl: (raw) => links.get(raw)?.href ?? raw,
      getLinkText: (raw) => links.get(raw)?.text ?? raw,
    },
  ];
}

export function isSupportedMessageLink(url: string): boolean {
  return /^(https?:\/\/|mailto:|tel:)/i.test(url);
}
