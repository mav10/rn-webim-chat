import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatContainerBaseProps } from '../chat-container';
import { GiftedChat, IChatMessage } from 'react-native-gifted-chat';
import RNWebim, { WebimMessage } from 'rn-webim-chat';
import * as AppConfig from '../../package.json';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';
import { mapWebimToChatMessage } from './message-helper';
import { mergeMessages, removeMessage, replaceMessage } from './message-store';
import { closeChatSession, openChatSession } from '../services/chat-service';

const MESSAGE_BATCH_SIZE = 5;

export const CustomChat = (props: ChatContainerBaseProps) => {
  const { chatAccount, userFields } = props;
  const sessionOwner = useRef({}).current;
  const [initState, setInitState] = useState<
    'INIT' | 'PENDING' | 'FAILED' | null
  >(null);
  const [isTyping, setTyping] = useState<boolean>(false);
  const [unread, setUnread] = useState<number>(0);
  const [isUploadingAttachment, setUploadingAttachment] = useState(false);

  const [webimMessages, setMessages] = useState<WebimMessage[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const loadingHistory = useRef(false);
  const messages: IChatMessage[] = webimMessages.map(mapWebimToChatMessage);

  const loadLastMessages = useCallback(async (isActive: () => boolean) => {
    const history = await RNWebim.getLastMessages(MESSAGE_BATCH_SIZE);
    if (!isActive()) return;
    setMessages((current) => mergeMessages(current, history, 'history'));
    setHasMore(history.length > 0);
  }, []);

  const loadNextMessages = useCallback(async () => {
    if (loadingHistory.current || !hasMore) return;
    loadingHistory.current = true;
    setLoadingEarlier(true);
    try {
      const history = await RNWebim.getNextMessages(MESSAGE_BATCH_SIZE);
      setMessages((current) => mergeMessages(current, history, 'history'));
      setHasMore(history.length > 0);
    } finally {
      loadingHistory.current = false;
      setLoadingEarlier(false);
    }
  }, [hasMore]);

  const initSession = useCallback(
    async (isActive: () => boolean) => {
      try {
        setInitState('PENDING');
        const sessionsParams = {
          accountName: chatAccount,
          location: 'default',
          storeHistoryLocally: true,
          ...(userFields ? { accountJSON: JSON.stringify(userFields) } : {}),
          appVersion: AppConfig.version,
          clearVisitorData: false,
        };

        await openChatSession(sessionOwner, sessionsParams);
        if (isActive()) setInitState('INIT');
      } catch (err: any) {
        if (isActive()) {
          Alert.alert(
            'Initialization session error',
            err?.message + '\nCode: ' + err?.errorCode
          );
          setInitState('FAILED');
        }
        throw err;
      }
    },
    [chatAccount, userFields, sessionOwner]
  );

  useEffect(() => {
    let active = true;
    const subscriptions = [
      RNWebim.addErrorListener((error) => {
        Alert.alert(
          error.errorType,
          error.message + '\nError Code: ' + error.errorCode
        );
      }),
      RNWebim.addTypingListener((value) => setTyping(value.isTyping)),
      RNWebim.addNewMessageListener((message) =>
        setMessages((current) => mergeMessages(current, [message], 'event'))
      ),
      RNWebim.addEditMessageListener(({ from, to }) =>
        setMessages((current) => replaceMessage(current, from, to))
      ),
      RNWebim.addRemoveMessageListener((message) =>
        setMessages((current) => removeMessage(current, message))
      ),
      RNWebim.addDialogClearedListener(() => setMessages([])),
      RNWebim.addUnreadCountListener(setUnread),
    ];

    const bootstrap = async () => {
      try {
        await initSession(() => active);
        if (!active) return;
        await loadLastMessages(() => active);
      } catch (error) {
        if (active) setInitState('FAILED');
      }
    };
    bootstrap();

    return () => {
      active = false;
      subscriptions.forEach((subscription) => subscription.remove());
      closeChatSession(sessionOwner).catch(console.error);
    };
  }, [initSession, loadLastMessages, sessionOwner]);

  const onSend = useCallback(async (text: string) => {
    await RNWebim.send(text);
  }, []);

  const onAttachFile = useCallback(async () => {
    if (isUploadingAttachment) return;
    setUploadingAttachment(true);
    try {
      await RNWebim.tryAttachAndSendFile();
    } catch (error) {
      const webimError = error as { message?: string; errorCode?: string };
      if (webimError.errorCode === 'ATTACHMENT_CANCELLED' ||
          webimError.errorCode === 'SELECT_FILE_CANCELED') {
        return;
      }
      const details = [
        webimError.message,
        webimError.errorCode ? `Code: ${webimError.errorCode}` : undefined,
      ].filter(Boolean).join('\n');
      Alert.alert('Attachment failed', details || 'The attachment could not be sent.');
    } finally {
      setUploadingAttachment(false);
    }
  }, [isUploadingAttachment]);

  if (initState === 'INIT') {
    return (
      <>
        <GiftedChat
          user={{
            avatar: 'https://i.pravatar.cc/300',
            _id: 'custom_id',
            name: userFields?.fields.display_name || 'Visitor',
          }}
          isScrollToBottomEnabled={true}
          isUsernameVisible={true}
          messages={messages}
          isTyping={isTyping}
          // infiniteScroll={true}
          loadEarlierMessagesProps={{
            isAvailable: hasMore,
            isLoading: loadingEarlier,
            onPress: loadNextMessages,
          }}
          renderMessageVideo={({ currentMessage }) => {
            const videoUrl = currentMessage.video;
            if (!videoUrl) return null;
            return (
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  Linking.openURL(videoUrl).catch(() =>
                    Alert.alert('Unable to open video', 'The attachment link could not be opened.')
                  )
                }
                style={{ padding: 10 }}
              >
                <Text>Open video attachment</Text>
              </Pressable>
            );
          }}
          renderActions={() => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Attach file"
              disabled={isUploadingAttachment}
              onPress={onAttachFile}
              style={{
                width: 44,
                height: 44,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isUploadingAttachment ? (
                <ActivityIndicator size="small" />
              ) : (
                <Text style={{ fontSize: 26 }}>+</Text>
              )}
            </Pressable>
          )}
          onSend={(data) => {
            if (data[0]?.text) onSend(data[0].text);
          }}
          isInverted={true}
        />
        {!!unread && <Text style={StyleSheet.absoluteFill}>{unread}</Text>}
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
