import { chatThemes } from '../../example/src/withCustomUI/chat-themes';

it('keeps the existing Custom outgoing bubble and text colors', () => {
  expect(chatThemes.custom.outgoing).toBe('#0084ff');
  expect(chatThemes.custom.outgoingText).toBe('#ffffff');
});

it('uses dark text on the light Telegram message backgrounds', () => {
  expect(chatThemes.telegram.incoming).toBe('#ffffff');
  expect(chatThemes.telegram.outgoing).toBe('#e2ffc7');
  expect(chatThemes.telegram.text).toBe(chatThemes.telegram.outgoingText);
});

it('uses the Figma message colors and avoids white text on yellow', () => {
  expect(chatThemes.pizza.incoming).toBe('#f8f3e9');
  expect(chatThemes.pizza.outgoing).toBe('#ffcc1b');
  expect(chatThemes.pizza.outgoingText).toBe('#2a2a2a');
  expect(chatThemes.pizza.background).toBe('#ffffff');
});
