# Chat Examples

The app offers four selectable examples: Simple, Custom, Telegram and Figma.

- **Telegram** uses a compact support-chat header, green outgoing bubbles and an icon-based composer.
- **Figma** uses an unbranded yellow header with a menu button, yellow outgoing bubbles, illustrated avatars and bottom navigation. The bottom navigation opens local demonstration panels, not a commerce backend. It is hidden while the keyboard is open.

Both new examples reuse `src/withCustomUI/CustomChat`: real Webim history, attachments, replies, quote navigation/highlighting, editing, reactions, links and copying. Reaction availability still depends on the SDK's `canReact` and `canChangeReaction` flags. Switching examples uses the existing serialized session lifecycle.

Shared colors are in `src/withCustomUI/chat-themes.ts`. The separate example components are in `src/telegram/index.tsx` and `src/pizza/index.tsx`.

## Figma Sources

Design context and exact assets were obtained using Figma MCP from these frames:

- [Chat with keyboard](https://www.figma.com/design/B8qCaOY6n8soIiMweDmKBt/Chat?node-id=820-33658)
- [Conversation and navigation](https://www.figma.com/design/B8qCaOY6n8soIiMweDmKBt/Chat?node-id=820-34650)
- [Image attachment](https://www.figma.com/design/B8qCaOY6n8soIiMweDmKBt/Chat?node-id=820-35054)

Assets are bundled under `src/pizza/assets/`; the app does not depend on expiring Figma URLs. The content of the chat comes from Webim rather than the sample conversation in the frames.

Run `yarn --cwd example start` and the usual platform command (`yarn --cwd example android` or `yarn --cwd example ios`) for development. Install CocoaPods dependencies before an iOS build.
