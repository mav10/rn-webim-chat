import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChatContainerBaseProps } from '../chat-container';
import {
  Bubble,
  BubbleProps,
  Composer,
  GiftedChat,
  IChatMessage,
  InputToolbar,
  InputToolbarProps,
} from 'react-native-gifted-chat';
import RNWebim from 'rn-webim-chat';
import { getHashForChatSign } from '../chat-utils';
import * as AppConfig from '../../package.json';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { SwipeRow } from 'react-native-swipe-list-view';
import { mapWebimToChatMessage, WebimWithReplyMessage } from './message-helper';

const MESSAGE_BATCH_SIZE = 20;

export const CustomChat = (props: ChatContainerBaseProps) => {
  const { chatAccount, userFields, privateKey } = props;
  const [initState, setInitState] = useState<
    'INIT' | 'PENDING' | 'FAILED' | null
  >(null);
  const [isTyping, setTyping] = useState<boolean>(false);
  const [unread, setUnread] = useState<number>(0);

  const [messages, setMessages] = useState<IChatMessage[]>();
  const [replyMessage, setReplyMessage] =
    useState<WebimWithReplyMessage | null>(null);

  useEffect(() => {
    const bootstrapAsync = async () => {
      await initSession();
      subscribeOnListeners();
      await RNWebim.resumeSession();
      await loadLastMessages();
    };

    bootstrapAsync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subscribeOnListeners = useCallback(() => {
    RNWebim.addErrorListener((error) => {
      Alert.alert(
        error.errorType,
        error.message + '\nError Code: ' + error.errorCode
      );
    });
    RNWebim.addTypingListener((value) => {
      setTyping(value.isTyping);
    });
    RNWebim.addNewMessageListener((message) => {
      console.log('Catch new message', message, mapWebimToChatMessage(message));
      setMessages((previousMessages) =>
        GiftedChat.append(previousMessages, [mapWebimToChatMessage(message)])
      );
    });
    RNWebim.addEditMessageListener((data) => {
      const foundIndex = messages?.findIndex(
        (x) => x._id === data.from.id || x._id === data.from.serverSideId
      );
      if (foundIndex) {
        console.log(
          'Will Update message',
          // @ts-ignore
          messages[foundIndex],
          'to: ',
          data.to
        );
      }
    });
    RNWebim.addUnreadCountListener(setUnread);
  }, [messages]);

  const BubbleComp = (args: Readonly<BubbleProps<WebimWithReplyMessage>>) => {
    const { system } = args.currentMessage;

    const onLeftAction = useCallback(
      ({ isActivated }) => {
        if (isActivated) {
          console.log(args.currentMessage);
          Vibration.vibrate(50);
          setReplyMessage(args?.currentMessage || null);
        }
      },
      [args.currentMessage]
    );

    return (
      <SwipeRow
        useNativeDriver
        onLeftActionStatusChange={onLeftAction}
        disableLeftSwipe
        disableRightSwipe={
          system ||
          args.currentMessage?.user?._id === 'custom_id' ||
          !!args.currentMessage?.quote ||
          args.currentMessage?.audio ||
          args.currentMessage?.image
        }
        leftActivationValue={90}
        leftActionValue={0}
        swipeKey={args.currentMessage?._id + ''}
      >
        <></>
        <Bubble {...args}>
          <></>
        </Bubble>
      </SwipeRow>
    );
  };

  const renderBubble = (args: Readonly<BubbleProps<WebimWithReplyMessage>>) => {
    return (
      <>
        <BubbleComp {...args} />
      </>
    );
  };

  const loadLastMessages = useCallback(async () => {
    const webimMessages = await RNWebim.getLastMessages(MESSAGE_BATCH_SIZE);
    setMessages(
      webimMessages
        .map(mapWebimToChatMessage)
        .sort((a, b) => (a.createdAt <= b.createdAt ? 1 : -1))
    );
  }, []);

  const loadNextMessages = useCallback(async () => {
    const webimMessages = await RNWebim.getNextMessages(MESSAGE_BATCH_SIZE);
    setMessages((prev) =>
      GiftedChat.append(prev, webimMessages.map(mapWebimToChatMessage)).sort(
        (a, b) => (a.createdAt <= b.createdAt ? 1 : -1)
      )
    );
  }, []);

  const initSession = useCallback(async () => {
    try {
      setInitState('PENDING');
      const fields = { ...userFields };
      fields.hash = await getHashForChatSign(fields.fields, privateKey);
      const sessionsParams = {
        accountName: chatAccount,
        location: 'default',
        storeHistoryLocally: true,
        accountJSON: JSON.stringify(fields),
        appVersion: AppConfig.version,
        clearVisitorData: true,
      };

      await RNWebim.initSession(sessionsParams);
      setInitState('INIT');
    } catch (err: any) {
      Alert.alert(
        'Initialization session error',
        err?.message + '\nCode: ' + err?.errorCode
      );
      setInitState('FAILED');
    }
  }, [chatAccount, privateKey, userFields]);

  const onSend = useCallback(
    async (text: string) => {
      if (replyMessage) {
        // await RNWebim.reply()
      } else {
        await RNWebim.send(text);
      }
    },
    [replyMessage]
  );

  const renderQuote = useCallback(
    (args: Readonly<BubbleProps<WebimWithReplyMessage>>) => {
      if (args.currentMessage?.quote) {
        const quote = args.currentMessage?.quote;
        return (
          <View
            style={{
              borderLeftColor: 'blue',
              borderLeftWidth: 2,
              marginLeft: 10,
              marginTop: 10,
              padding: 5,
            }}
          >
            <Text style={{ color: 'grey' }}>{quote.messageText}</Text>
            {quote?.timestamp && (
              <Text style={{ fontSize: 10, color: '#bebcbc' }}>
                {new Date(quote.timestamp).toTimeString().split(' ')[0]}
              </Text>
            )}
          </View>
        );
      }

      return <></>;
    },
    []
  );

  const Reply = useMemo(() => {
    return (
      <View
        style={{
          height: 55,
          flexDirection: 'row',
          marginTop: 10,
          backgroundColor: 'rgba(0,0,0,.1)',
          borderRadius: 10,
          position: 'relative',
        }}
      >
        <View style={{ height: 55, width: 5, backgroundColor: 'red' }} />
        <View style={{ flexDirection: 'column', overflow: 'hidden' }}>
          <Text
            style={{
              color: 'red',
              paddingLeft: 10,
              paddingTop: 5,
              fontWeight: 'bold',
            }}
          >
            {replyMessage?.user.name}
          </Text>
          <Text
            style={{
              color: '#034f84',
              paddingLeft: 10,
              paddingTop: 5,
              marginBottom: 2,
            }}
          >
            {replyMessage?.text}
          </Text>
        </View>
        <View
          style={{
            flex: 1,
            alignItems: 'flex-end',
            paddingRight: 2,
            position: 'absolute',
            right: 0,
            top: 0,
          }}
        >
          <TouchableOpacity
            onPress={() => {
              setReplyMessage(null);
            }}
          >
            <Text>X</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [replyMessage?.text, replyMessage?.user.name]);

  const renderInputToolbar = useCallback(
    (args: InputToolbarProps<WebimWithReplyMessage>) => {
      return (
        <InputToolbar
          {...args}
          containerStyle={{
            marginLeft: 15,
            marginRight: 15,
            marginBottom: 5,
            borderRadius: 25,
            borderColor: '#fff',
            borderTopWidth: 0,
          }}
          renderComposer={(props1) => {
            return (
              <View style={{ flex: 1 }}>
                {!!replyMessage && <Reply />}
                <Composer {...props1} />
              </View>
            );
          }}
        />
      );
    },
    [Reply, replyMessage]
  );

  if (initState === 'INIT') {
    return (
      <>
        <GiftedChat<WebimWithReplyMessage>
          wrapInSafeArea={true}
          user={{
            avatar: 'https://i.pravatar.cc/300',
            _id: 'custom_id',
            name: userFields.fields.display_name,
          }}
          renderBubble={renderBubble}
          renderCustomView={renderQuote}
          renderInputToolbar={renderInputToolbar}
          showUserAvatar={true}
          scrollToBottom={true}
          renderUsernameOnMessage={true}
          messages={messages}
          isTyping={isTyping}
          // infiniteScroll={true}
          loadEarlier={true}
          onLoadEarlier={loadNextMessages}
          onSend={(data) => {
            setMessages((prev) => GiftedChat.append(prev, data));
            // @ts-ignore
            onSend(data[0].text);
          }}
        />
        {!!unread && (
          <Text style={StyleSheet.absoluteFillObject}>{unread}</Text>
        )}
      </>
    );
  }

  if (initState === 'PENDING') {
    return <ActivityIndicator size={'large'} />;
  }

  return (
    <Text>
      {!initState ? 'Chat is not initialized yet' : 'Initialization failed'}
    </Text>
  );
};
