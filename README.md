# rn-webim-chat

Implementation of [webim sdk](https://webim.ru/) for [react-native](https://github.com/facebook/react-native)

_Inspired by [volga-volga/react-native-webim](https://github.com/volga-volga/react-native-webim)_


<!-- BADGES/ -->

[![Package publish](https://github.com/mav10/rn-webim-chat/actions/workflows/npm-publish.yml/badge.svg)](https://github.com/mav10/rn-webim-chat/actions/workflows/npm-publish.yml)
<span class="badge-npmversion"><a href="https://www.npmjs.com/package/rn-webim-chat" title="View this project on NPM"><img src="https://badge.fury.io/js/rn-webim-chat.svg" alt="NPM version" /></a></span>
<span class="badge-npmdownloads"><a href="https://www.npmjs.com/package/rn-webim-chat" title="View this project on NPM"><img alt="npm" src="https://img.shields.io/npm/dm/rn-webim-chat"></a></span>
<!-- /BADGES -->
___

## Platforms:

![React Native](https://img.shields.io/badge/react_native-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)

![Android](https://img.shields.io/badge/Android-3DDC84?style=for-the-badge&logo=android&logoColor=white)

![iOS](https://img.shields.io/badge/iOS-000000?style=for-the-badge&logo=ios&logoColor=white)

## Installation
- Requires React Native version 0.60.0, or later.
- Supports iOS 10.0, or later.

Via NPM
```sh
npm install rn-webim-chat
```

Via Yarn
```sh
yarn add rn-webim-chat
```

#### :iphone:iOS (_Extra steps_)
- add `WebimClientLibrary` to Podfile with specific version (_Wrapper was written for v3.37.4_)
- pod install

see [example Podfile](./example/ios/Podfile)

Since the official [WebimClientLibrary](https://github.com/webim/webim-client-sdk-ios) is written is Swift, you need to have Swift enabled in your iOS project. If you already have any .swift files, you are good to go. Otherwise, create a new empty Swift source file in Xcode, and allow it to create the neccessary bridging header when prompted.

## Example
In [example folder](./example) there is simple workflow how to:
 - Start and destroy session
 - Resume and Pause session
 - Get and Send messages
 - Rate operator
 - Handle errors

How it looks like you can see here
It is achieved with [simple UI](./example/src/simple) (just test common methods)
<table align="Center">
  <tr>
    <td>Not init session</td>
    <td>Requested messages</td>
  </tr>
  <tr>
    <td><img src="doc/img.png" width=400 height=760></td>
    <td><img src="doc/messages.png" width=400 height=760></td>
  </tr>
 </table>


<table align="Center">
  <tr>
     <td>Error getMessages (as session is null)</td>
     <td>Error sendMessage (as session is null)</td>
  </tr>
  <tr>
    <td><img src="doc/error_1.png" width=400 height=760></td>
    <td><img src="doc/error_2.png" width=400 height=760></td>
  </tr>
 </table>

![](doc/chat.png)

_Also there is another [example with chat UI](./example/src/withCustomUI) [`react-native-gifted-chat`](https://github.com/FaridSafi/react-native-gifted-chat)_
## Methods

**Important:** All methods are promise based and can throw exceptions.
List of error codes will be provided later as get COMMON for both platform.
### Init chat

 ```ts
import { RNWebim } from 'rn-webim-chat';

await RNWebim.initSession(builderParams: SessionBuilderParams)
```
**SessionBuilderParams:**
- accountName (required) - name of your account in webim system
- location (required) - name of location. For example "mobile"
- accountJSON - encrypted json with user data. See [**Start chat with user data**](#start-chat-with-user-data)
- clearVisitorData - clear visitor data before start chat
- storeHistoryLocally - cache messages in local store
- title - title for chat in webim web panel
- providedAuthorizationToken - user token. Session will not start with wrong token. Read webim documentation
- pushToken - FCM token is enough - but Apple pushes will come through APN, so you are not able to process them in app by default.
- appVersion - version of your Application
- prechat - some additional fields to prechat

### Resume session

If you have already initialized a session you should **resume** it to consume and send messages, get actual information by listeners etc.

**NOTE:** _After that execution operator on web chat will get message that user opens a chat._

 ```ts
import { RNWebim } from 'rn-webim-chat';

await RNWebim.resumeSession()
```

### Pause session

If you have already initialized a session you should **resume** it to consume and send messages, get actual information by listeners etc.
After that execution operator on web chat will get message that user opens a chat.

 ```ts
import { RNWebim } from 'rn-webim-chat';

await RNWebim.pauseSession()
```


### Init events listeners

```js
import { RNWebim,  WebimEvents} from 'rn-webim-chat';

const listener = RNWebim.addNewMessageListener(({ msg }) => {
  // do something
});
// usubscribe
listener.remove();

// or
const listener2 = RNWebim.addListener(WebimEvents.NEW_MESSAGE, ({ msg }) => {
    // do something
});
```

Supported events (`WebimEvents`):
- WebimEvents.NEW_MESSAGE;
- WebimEvents.REMOVE_MESSAGE;
- WebimEvents.EDIT_MESSAGE;
- WebimEvents.CLEAR_DIALOG;
- WebimEvents.TOKEN_UPDATED;
- WebimEvents.ERROR;
- WebimEvents.STATE;
- WebimEvents.UNREAD_COUNTER;
- WebimEvents.TYPING;

- ~~WebimEvents.FILE_UPLOADING_PROGRESS;~~

### Get messages
As you called `getAllMessages` after that you should call `nextMessages` as reading "all messages" during the same session will get no result (native implementation uses holder and cursor by last loaded message)

```js
const { messages } = await RNWebim.getLastMessages(limit);
// or
const { messages } = await RNWebim.getNextMessages(limit);
// or
const { messages } = await RNWebim.getAllMessages();
```

**Message type**
```typescript
export type WebimMessage = {
  id: string;
  serverSideId: string;
  avatar?: string;
  time: number;
  type: MessageTypeAlias; // 'OPERATOR', 'VISITOR', 'INFO', 'ACTION_REQUEST', 'CONTACTS_REQUEST', 'FILE_FROM_OPERATOR', 'FILE_FROM_VISITOR', 'OPERATOR_BUSY', 'KEYBOARD', 'KEYBOARD_RESPONSE';
  text: string;
  name: string;
  status: 'SENT' | 'SENDING';
  read: boolean;
  canEdit: boolean;
  carReply: boolean;
  isEdited: boolean;
  canReact: boolean;
  canChangeReaction: boolean;
  visitorReaction?: string;
  stickerId?: number;
  quote?: Quote;
  attachment?: WebimAttachment;
  operatorId?: string;
}

```

**Quote type**
```typescript
export type Quote = {
  authorId?: string;
  senderName: string;
  messageId: string;
  messageText: string;
  messageType: MessageTypeAlias;
  state: 'FILLED' | 'NOT_FOUND' | 'PENDING';
  timestamp: Date | number;
  attachment?: WebimAttachment;
};
```
**Included attachment**
```typescript
export interface WebimAttachment {
  contentType: string;
  info: string;
  name: string;
  size: number;
  url: string;
}
```
Note: method `getAllMessages` works strange on iOS, and sometimes returns empty array. We recommend to use `getLastMessages` instead

### Send text message

```typescript
import RNWebim from 'rn-webim-chat';

const messageId = await RNWebim.send(message);
```

### Read Messages (mark as read)
You can manually mark all messages as read by calling this method.

```typescript
import RNWebim from 'rn-webim-chat';

await RNWebim.readMessages();
```

## Attach files

#### Use build in method for file attaching:
In future will add possibility to use external library as `react-native-fs` and some other picker to import files via them.
For now there are such methods

### Attach file
```typescript
var result: AttachFileResult = await RNWebim.tryAttachAndSendFile();

console.log('uri: ', result.uri)
console.log('name: ', result.name)
console.log('mime: ', result.mime)
console.log('extension: ', result.extension)
```


### Send file

```typescript
import RNWebim from 'rn-webim-chat';

try {
  RNWebim.sendFile(uri, name, mime, extension)
  console.log('Result: ', sendingResult.id)
} catch (e) {
  // can throw such errors
  'FILE_SIZE_EXCEEDED', 'FILE_SIZE_TOO_SMALL', 'FILE_TYPE_NOT_ALLOWED', 'MAX_FILES_COUNT_PER_CHAT_EXCEEDED', 'UPLOADED_FILE_NOT_FOUND', 'UNAUTHORIZED',
}

```


### Attach and Send file

```typescript
const onSelectFiles = useCallback(async () => {
  try {
    const fileResult = await RNWebim.tryAttachAndSendFile();
    console.log('File result: ', fileResult);
  } catch (err: any) {
    const webimError = err as WebimNativeError;
    console.log('Chat][File] error: ', webimError);
    if (webimError.errorType === 'common') {
      setNotFatalError(
        webimError.message + `(Code: ${webimError.errorCode})`
      );
    } else {
      setFatalError(webimError.message + `(Code: ${webimError.errorCode})`);
    }
  }
}, []);
```

### Rate current operator

```js
RNWebim.rateOperator(rate: number)
```
 - `rate` (required) - is number from 1 to 5

### Get current operator

```typescript
import RNWebim from 'rn-webim-chat';

RNWebim.getCurrentOperator()
```

it returns such object
```typescript
export type Operator = {
  id: string;
  name: string;
  avatar?: string;
  title: string;
  info: string;
};
```

### Destroy session
```js
RNWebim.destroySession(clearData);
```

- clearData (optional) boolean - If true wil

## Start chat with user data
**Tl;DR;**
You have to generate private key in your Webim Account and kinda sign your user fields values.
For more details see [webim documentation](https://webim.ru/kb/dev/identification/id-2-0.html) for client identification.

in [Example app](./example) there is code how to achieve it.
Example:

I'd recommend to you use some lightweight library. HMAC-256 is enough. Actually you can use md5 algorithm  - but I'd avoid it.
There are some other aproches e.g. with JsCrypto or with [react-native-crypto ](https://github.com/tradle/react-native-crypto). But here you need to hash all your modules.
Like [here](https://github.com/volga-volga/react-native-webim#start-chat-with-user-data). But the choice it is up to you!

- install [js-sha256](https://github.com/emn178/js-sha256)
- write hash-function to sign your fields.
- use it in your app.

```ts
// chat-utils.ts file
import { sha256 } from 'js-sha256';

const getHmac_sha256 = async (str: string, privateKey: string) => {
  return sha256.hmac(privateKey, str);
};

/**
 * Returns hash value for authorized user.
 * @param obj - User's json fields.
 * @param privateKey - private key value. By that hash will be generated.
 */
export const getHashForChatSign = async (
  obj: { [key: string]: string },
  privateKey: string
) => {
  const keys = Object.keys(obj).sort();
  const str = keys.map((key) => obj[key]).join('');
  return await getHmac_sha256(str, privateKey);
};
```

```tsx
// App.tsx file
...
import { getHashForChatSign } from './chat-utils';

const PRIVATE_KEY = 'YOUR-PRIVATE-KEY-FROM-PORTAL';
const CHAT_SERVICE_ACCOUNT = 'YOU-ACCOUNT';

const acc = {
  fields: {
    id: 'some-id',
    display_name: '1.0.0',
    phone: '+79000000000',
    address: 'Tomsk',
  },
  hash: '',
};

async function intSession() {
  acc.hash = await getHashForChatSign(acc.fields, PRIVATE_KEY);
  const sessionsParams = {
    accountName: CHAT_SERVICE_ACCOUNT,
    location: '',
    storeHistoryLocally: true,
    accountJSON: JSON.stringify(acc),
    appVersion: AppConfig.version,
    clearVisitorData: true,
  };

  await RNWebim.resumeSession(sessionsParams);
  console.log('[Chat][Init] initialized with params: ', sessionsParams);
};

...
```


## Contributing
See the [contributing guide](CONTRIBUTING.md) guide to learn how to contribute to the repository and the development workflow.

## License
Software provided as it is.
It will be maintained time-to-time. Currently, I have to use this package in some applications, so I try to keep it on working.
If you want to help or improve something see section #Contributing


---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
