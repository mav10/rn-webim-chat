import React, { useCallback, useEffect, useState } from 'react';
import type { ChatContainerBaseProps } from '../chat-container';
import { GiftedChat, IChatMessage } from 'react-native-gifted-chat';
import RNWebim from 'rn-webim-chat';
import { getHashForChatSign } from '../chat-utils';
import * as AppConfig from '../../package.json';
import { ActivityIndicator, Alert, StyleSheet, Text } from 'react-native';
import { mapWebimToChatMessage } from './message-helper';

const MESSAGE_BATCH_SIZE = 5;

export const CustomChat = (props: ChatContainerBaseProps) => {
  const { chatAccount, userFields, privateKey } = props;
  const [initState, setInitState] = useState<
    'INIT' | 'PENDING' | 'FAILED' | null
  >(null);
  const [isTyping, setTyping] = useState<boolean>(false);
  const [unread, setUnread] = useState<number>(0);

  const [messages, setMessages] = useState<IChatMessage[]>();

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

  const loadLastMessages = useCallback(async () => {
    const webimMessages = await RNWebim.getAllMessages();
    setMessages(
      webimMessages
        .map(mapWebimToChatMessage)
        .sort((a, b) => (a.createdAt <= b.createdAt ? 1 : -1))
    );
  }, []);

  const loadNextMessages = useCallback(async () => {
    const webimMessages = await RNWebim.getNextMessages(MESSAGE_BATCH_SIZE);
    setMessages((prev) =>
      GiftedChat.append(prev, webimMessages.map(mapWebimToChatMessage))
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

  const onSend = useCallback(async (text: string) => {
    await RNWebim.send(text);
  }, []);

  if (initState === 'INIT') {
    return (
      <>
        <GiftedChat
          wrapInSafeArea={true}
          user={{
            avatar: 'https://i.pravatar.cc/300',
            _id: 'custom_id',
            name: userFields.fields.display_name,
          }}
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
          inverted={true}
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
