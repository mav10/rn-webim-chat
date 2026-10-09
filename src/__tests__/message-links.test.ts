jest.mock(
  'marked',
  () =>
    jest.requireActual('../../example/node_modules/marked/lib/marked.umd.js'),
  { virtual: true }
);

import {
  getMessageLinkMatchers,
  isSupportedMessageLink,
} from '../../example/src/withCustomUI/message-links';

const parseLinks = (text: string) => {
  const matcher = getMessageLinkMatchers(text)[0];
  return matcher
    ? [...text.matchAll(matcher.pattern)].map((match) => ({
        text: matcher.getLinkText?.(match[0]),
        url: matcher.getLinkUrl?.(match[0]),
      }))
    : [];
};

it('keeps ordinary URLs clickable next to labeled Markdown links', () => {
  expect(
    parseLinks('[test link](https://yandex.ru) and https://example.com')
  ).toEqual([
    { text: 'test link', url: 'https://yandex.ru' },
    { text: 'https://example.com', url: 'https://example.com' },
  ]);
});

it('parses balanced parentheses inside Markdown link destinations', () => {
  expect(
    parseLinks('[Article](https://example.com/wiki/Topic_(detail))')
  ).toEqual([
    { text: 'Article', url: 'https://example.com/wiki/Topic_(detail)' },
  ]);
});

it('does not truncate URLs sharing the same prefix', () => {
  expect(parseLinks('https://example.com https://example.com/path')).toEqual([
    { text: 'https://example.com', url: 'https://example.com' },
    { text: 'https://example.com/path', url: 'https://example.com/path' },
  ]);
});

it('finds Markdown links nested in emphasis and repeated links', () => {
  expect(
    parseLinks('**[Go](https://example.com)** [Go](https://example.com)')
  ).toHaveLength(2);
});

it('does not invent a link in ordinary text', () => {
  expect(getMessageLinkMatchers('Just a message')).toEqual([]);
});

it.each([
  'https://example.com',
  'http://example.com',
  'mailto:user@example.com',
  'tel:+123456789',
])('allows supported link %s', (url) => {
  expect(isSupportedMessageLink(url)).toBe(true);
});

it.each([
  ['javascript', 'alert(1)'].join(':'),
  'data:text/html,test',
  'file:///etc/passwd',
  'intent://test',
])('rejects unsupported link %s', (url) => {
  expect(isSupportedMessageLink(url)).toBe(false);
});
