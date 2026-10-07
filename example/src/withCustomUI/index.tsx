import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatContainerBaseProps } from '../chat-container';
import {
  Bubble,
  GiftedChat,
  MessageText,
  Reply,
  Send,
  IGiftedChatContext,
  useChatContext,
  InputToolbar,
} from 'react-native-gifted-chat';
import Clipboard from '@react-native-clipboard/clipboard';
import {
  ThumbsUp,
  ThumbsDown,
  Paperclip,
  ArrowUp,
  SendHorizontal,
  Check,
} from 'lucide-react-native';
import type { FlatList } from 'react-native-gesture-handler';
import RNWebim, { WebimMessage } from 'rn-webim-chat';
import * as AppConfig from '../../package.json';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ChatMessage, mapWebimToChatMessage } from './message-helper';
import { ComposerAction, submitChatText } from './message-actions';
import { mergeMessages, removeMessage, replaceMessage } from './message-store';
import { closeChatSession, openChatSession } from '../services/chat-service';
import { findQuotedMessageIndex } from './quote-navigation';
import { ChatAppearance, chatThemes } from './chat-themes';
import { pizzaAssets } from '../pizza/assets';
import {
  getMessageLinkMatchers,
  isSupportedMessageLink,
} from './message-links';
import {
  canSetMessageReaction,
  getMessageReaction,
  MessageReaction,
  submitMessageReaction,
} from './message-reactions';

const MESSAGE_BATCH_SIZE = 5;

const QuoteBubble = ({
  bubbleProps,
  highlighted,
}: {
  bubbleProps: React.ComponentProps<typeof Bubble<ChatMessage>>;
  highlighted: boolean;
}) => {
  const context = useChatContext();
  const reaction = getMessageReaction(bubbleProps.currentMessage.webimMessage);
  const ReactionIcon = reaction === 'like' ? ThumbsUp : ThumbsDown;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    opacity.setValue(0);
    if (!highlighted) return;
    const pulse = Animated.sequence([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.delay(200),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 450,
        useNativeDriver: true,
      }),
      Animated.delay(100),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.delay(200),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 450,
        useNativeDriver: true,
      }),
    ]);
    pulse.start();
    return () => pulse.stop();
  }, [highlighted, opacity]);

  return (
    <View>
      <Bubble {...bubbleProps} />
      {reaction && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Your reaction: ${reaction}`}
          onPress={() =>
            bubbleProps.onLongPressMessage?.(
              context,
              bubbleProps.currentMessage
            )
          }
          style={[
            styles.reaction,
            bubbleProps.position === 'right' && styles.reactionOutgoing,
          ]}
        >
          <ReactionIcon size={18} color="#145951" />
        </Pressable>
      )}
      <Animated.View
        pointerEvents="none"
        style={[styles.highlight, { opacity }]}
      />
    </View>
  );
};

export const CustomChat = (
  props: ChatContainerBaseProps & { appearance?: ChatAppearance }
) => {
  const { chatAccount, userFields } = props;
  const appearance = props.appearance ?? 'custom';
  const theme = chatThemes[appearance];
  const themed = appearance !== 'custom';
  const SendIcon = appearance === 'pizza' ? ArrowUp : SendHorizontal;
  const sessionOwner = useRef({}).current;
  const [initState, setInitState] = useState<
    'INIT' | 'PENDING' | 'FAILED' | null
  >(null);
  const [isTyping, setTyping] = useState<boolean>(false);
  const [unread, setUnread] = useState<number>(0);
  const [isUploadingAttachment, setUploadingAttachment] = useState(false);
  const uploadingAttachmentRef = useRef(false);
  const [draft, setDraft] = useState('');
  const [composerAction, setComposerAction] = useState<ComposerAction | null>(
    null
  );
  const [isSubmitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const reactingRef = useRef(false);

  const [webimMessages, setMessages] = useState<WebimMessage[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const loadingHistory = useRef(false);
  const messagesContainerRef = useRef<FlatList<ChatMessage>>(null!);
  const messagesRef = useRef(webimMessages);
  messagesRef.current = webimMessages;
  const [quoteTarget, setQuoteTarget] = useState<{ messageId: string } | null>(
    null
  );
  const navigationRef = useRef<{ messageId: string; failures: number } | null>(
    null
  );
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const scrollRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messages = webimMessages.map((message) => {
    const mapped = mapWebimToChatMessage(message);
    return appearance === 'pizza'
      ? { ...mapped, user: { ...mapped.user, avatar: undefined } }
      : mapped;
  });
  const selectedMessage = webimMessages.find(
    (message) => message.id === composerAction?.messageId
  );

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

  const scrollToQuote = useCallback(() => {
    const request = navigationRef.current;
    if (!request || !messagesContainerRef.current) return;
    const index = findQuotedMessageIndex(
      messagesRef.current,
      request.messageId
    );
    if (index < 0) {
      navigationRef.current = null;
      setQuoteTarget(null);
      Alert.alert('Original message unavailable');
      return;
    }
    const failures = request.failures;
    messagesContainerRef.current.scrollToIndex({
      index,
      animated: true,
      viewPosition: 0.5,
    });
    if (request.failures !== failures) return;
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => {
      if (navigationRef.current !== request) return;
      const targetIndex = findQuotedMessageIndex(
        messagesRef.current,
        request.messageId
      );
      setHighlightedId(messagesRef.current[targetIndex]?.id ?? null);
      navigationRef.current = null;
      setQuoteTarget(null);
      highlightTimer.current = setTimeout(() => setHighlightedId(null), 1800);
    }, 450);
  }, []);

  useEffect(() => {
    if (!quoteTarget) return;
    if (findQuotedMessageIndex(webimMessages, quoteTarget.messageId) >= 0) {
      const timer = setTimeout(scrollToQuote, 80);
      return () => clearTimeout(timer);
    }
    if (loadingEarlier || loadingHistory.current) return;
    if (!hasMore) {
      navigationRef.current = null;
      setQuoteTarget(null);
      Alert.alert(
        'Original message unavailable',
        'The quoted message was deleted or is no longer in chat history.'
      );
      return;
    }
    loadNextMessages().catch((error) => {
      if (navigationRef.current?.messageId !== quoteTarget.messageId) return;
      navigationRef.current = null;
      setQuoteTarget(null);
      Alert.alert('Unable to load original message', (error as Error).message);
    });
    return undefined;
  }, [
    quoteTarget,
    webimMessages,
    hasMore,
    loadingEarlier,
    loadNextMessages,
    scrollToQuote,
  ]);

  useEffect(
    () => () => {
      navigationRef.current = null;
      if (scrollRetryTimer.current) clearTimeout(scrollRetryTimer.current);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    },
    []
  );

  const onQuotePress = (quote: NonNullable<WebimMessage['quote']>) => {
    if (scrollRetryTimer.current) clearTimeout(scrollRetryTimer.current);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    navigationRef.current = null;
    setQuoteTarget(null);
    setHighlightedId(null);
    if (!quote.messageId || quote.state === 'NOT_FOUND') {
      Alert.alert('Original message unavailable');
      return;
    }
    navigationRef.current = { messageId: quote.messageId, failures: 0 };
    setQuoteTarget({ messageId: quote.messageId });
  };

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
      } catch {
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

  const cancelComposerAction = () => {
    if (isSubmitting) return;
    if (composerAction?.kind === 'edit') setDraft(composerAction.previousDraft);
    setComposerAction(null);
  };

  const onSend = async () => {
    if (submittingRef.current || !draft.trim()) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await submitChatText(draft, composerAction, webimMessages);
      setDraft(
        composerAction?.kind === 'edit' ? composerAction.previousDraft : ''
      );
      setComposerAction(null);
    } catch (error) {
      Alert.alert('Unable to send message', (error as Error).message);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const onReact = async (messageId: string, reaction: MessageReaction) => {
    if (reactingRef.current) return;
    reactingRef.current = true;
    try {
      await submitMessageReaction(messageId, reaction, messagesRef.current);
    } catch (error) {
      Alert.alert('Unable to send reaction', (error as Error).message);
    } finally {
      reactingRef.current = false;
    }
  };

  const onLongPressMessage = (context: unknown, chatMessage: ChatMessage) => {
    if (isSubmitting) return;
    const message = webimMessages.find((item) => item.id === chatMessage._id);
    if (!message) return;
    const previousDraft =
      composerAction?.kind === 'edit' ? composerAction.previousDraft : draft;
    const actions: { text: string; onPress: () => void; disabled?: boolean }[] =
      [];
    if (message.text.trim())
      actions.push({
        text: 'Copy text',
        onPress: () => {
          try {
            Clipboard.setString(message.text);
          } catch {
            Alert.alert('Unable to copy text');
          }
        },
      });
    for (const reaction of ['like', 'dislike'] as const) {
      if (!chatMessage.system)
        actions.push({
          text: reaction === 'like' ? 'Like' : 'Dislike',
          disabled:
            reactingRef.current || !canSetMessageReaction(message, reaction),
          onPress: () => {
            onReact(message.id, reaction);
          },
        });
    }
    if (message.canReply)
      actions.push({
        text: 'Reply',
        onPress: () => {
          setDraft(previousDraft);
          setComposerAction({
            kind: 'reply',
            messageId: message.id,
            previousDraft,
          });
        },
      });
    if (message.canEdit && message.type === 'VISITOR' && !message.attachment)
      actions.push({
        text: 'Edit',
        onPress: () => {
          setDraft(message.text);
          setComposerAction({
            kind: 'edit',
            messageId: message.id,
            previousDraft,
          });
        },
      });
    if (actions.length) {
      (context as IGiftedChatContext).actionSheet().showActionSheetWithOptions(
        {
          title: 'Message',
          options: [...actions.map((action) => action.text), 'Cancel'],
          cancelButtonIndex: actions.length,
          disabledButtonIndices: actions.flatMap((action, index) =>
            action.disabled ? [index] : []
          ),
        },
        (index) => {
          if (index !== undefined && !actions[index]?.disabled)
            actions[index]?.onPress();
        }
      );
    }
  };

  const onQuickReply = useCallback((replies: Reply[]) => {
    const reply = replies[0];
    if (!reply?.messageId || typeof reply.value !== 'string') return;
    RNWebim.sendKeyboardResponse(String(reply.messageId), reply.value).catch(
      (error) => {
        const webimError = error as { message?: string };
        Alert.alert(
          'Unable to send response',
          webimError.message || 'The keyboard response could not be sent.'
        );
      }
    );
  }, []);

  const onAttachFile = useCallback(async () => {
    if (uploadingAttachmentRef.current) return;
    uploadingAttachmentRef.current = true;
    setUploadingAttachment(true);
    try {
      await RNWebim.tryAttachAndSendFile();
    } catch (error) {
      const webimError = error as { message?: string; errorCode?: string };
      if (
        webimError.errorCode === 'ATTACHMENT_CANCELLED' ||
        webimError.errorCode === 'SELECT_FILE_CANCELED'
      ) {
        return;
      }
      const details = [
        webimError.message,
        webimError.errorCode ? `Code: ${webimError.errorCode}` : undefined,
      ]
        .filter(Boolean)
        .join('\n');
      Alert.alert(
        'Attachment failed',
        details || 'The attachment could not be sent.'
      );
    } finally {
      uploadingAttachmentRef.current = false;
      setUploadingAttachment(false);
    }
  }, []);

  const openAttachment = useCallback((url: string) => {
    Linking.openURL(url).catch(() =>
      Alert.alert(
        'Unable to open attachment',
        'The attachment link could not be opened.'
      )
    );
  }, []);

  if (initState === 'INIT') {
    return (
      <>
        <GiftedChat<ChatMessage>
          colorScheme="light"
          keyboardAvoidingViewProps={
            themed
              ? { automaticOffset: true, keyboardVerticalOffset: 0 }
              : undefined
          }
          messagesContainerStyle={{ backgroundColor: theme.background }}
          user={{
            avatar: 'https://i.pravatar.cc/300',
            _id: 'custom_id',
            name: userFields?.fields.display_name || 'Visitor',
          }}
          isScrollToBottomEnabled={true}
          isUsernameVisible={!themed}
          isUserAvatarVisible={appearance === 'pizza'}
          isAvatarVisibleForEveryMessage={appearance === 'pizza'}
          renderAvatar={
            appearance === 'telegram'
              ? null
              : appearance === 'pizza'
              ? ({ position }) => (
                  <View style={styles.pizzaAvatarBox}>
                    <Image
                      source={
                        position === 'right'
                          ? pizzaAssets.visitor
                          : pizzaAssets.operator
                      }
                      style={
                        position === 'right'
                          ? styles.pizzaVisitor
                          : styles.pizzaOperator
                      }
                      resizeMode="contain"
                    />
                  </View>
                )
              : undefined
          }
          timeFormat={themed ? 'HH:mm' : undefined}
          imageStyle={
            appearance === 'pizza' ? styles.pizzaMessageImage : undefined
          }
          renderSystemMessage={
            themed
              ? ({ currentMessage }) => (
                  <Text
                    style={[
                      styles.themedSystemMessage,
                      { color: theme.secondary },
                    ]}
                  >
                    {currentMessage.text}
                  </Text>
                )
              : undefined
          }
          renderDay={
            themed
              ? ({ createdAt }) => (
                  <Text style={[styles.themedDay, { color: theme.secondary }]}>
                    {new Date(createdAt).toLocaleDateString('ru-RU', {
                      day: 'numeric',
                      month: 'long',
                    })}
                  </Text>
                )
              : undefined
          }
          timeTextStyle={
            themed
              ? {
                  left: {
                    color: theme.secondary,
                    fontSize: appearance === 'pizza' ? 10 : 11,
                  },
                  right: {
                    color: theme.secondary,
                    fontSize: appearance === 'pizza' ? 10 : 11,
                  },
                }
              : undefined
          }
          renderInputToolbar={
            themed
              ? (toolbarProps) => (
                  <InputToolbar
                    {...toolbarProps}
                    containerStyle={[
                      styles.themedToolbar,
                      { borderColor: theme.composerBorder },
                    ]}
                    primaryStyle={styles.themedToolbarPrimary}
                  />
                )
              : undefined
          }
          messages={messages}
          messagesContainerRef={messagesContainerRef}
          listProps={{
            extraData: highlightedId,
            onScrollToIndexFailed: ({ index, averageItemLength }) => {
              const request = navigationRef.current;
              if (!request) return;
              request.failures += 1;
              if (highlightTimer.current) clearTimeout(highlightTimer.current);
              if (request.failures > 8) {
                navigationRef.current = null;
                setQuoteTarget(null);
                Alert.alert(
                  'Unable to scroll to original message',
                  'Please try again.'
                );
                return;
              }
              messagesContainerRef.current?.scrollToOffset({
                offset: Math.max(0, averageItemLength * index),
                animated: false,
              });
              if (scrollRetryTimer.current)
                clearTimeout(scrollRetryTimer.current);
              scrollRetryTimer.current = setTimeout(scrollToQuote, 180);
            },
          }}
          renderBubble={(bubbleProps) => (
            <QuoteBubble
              bubbleProps={{
                ...bubbleProps,
                wrapperStyle: {
                  left: {
                    backgroundColor: theme.incoming,
                    borderRadius: theme.radius,
                  },
                  right: {
                    backgroundColor: theme.outgoing,
                    borderRadius: theme.radius,
                  },
                },
                textStyle: {
                  left: {
                    color: theme.text,
                    fontSize: appearance === 'pizza' ? 14 : 16,
                  },
                  right: {
                    color: theme.outgoingText,
                    fontSize: appearance === 'pizza' ? 14 : 16,
                  },
                },
                tickStyle: { color: theme.secondary },
              }}
              highlighted={bubbleProps.currentMessage._id === highlightedId}
            />
          )}
          text={draft}
          textInputProps={{
            onChangeText: setDraft,
            editable: !isSubmitting,
            placeholder:
              appearance === 'pizza'
                ? 'Спрашивай всё что угодно'
                : themed
                ? 'Сообщение'
                : 'Type a message...',
            placeholderTextColor: theme.secondary,
            style: themed
              ? {
                  color: theme.text,
                  fontSize: appearance === 'pizza' ? 14 : 16,
                  maxHeight: 120,
                }
              : undefined,
          }}
          onLongPressMessage={onLongPressMessage}
          renderSend={(sendProps) => (
            <Send
              {...sendProps}
              isSendButtonAlwaysVisible={themed}
              label={composerAction?.kind === 'edit' ? 'Save' : 'Send'}
              sendButtonProps={{
                enabled: !isSubmitting && !!draft.trim(),
                accessibilityLabel:
                  composerAction?.kind === 'edit'
                    ? 'Save edit'
                    : 'Send message',
              }}
              onSend={() => {
                onSend();
              }}
            >
              {isSubmitting ? (
                <ActivityIndicator />
              ) : themed ? (
                <View
                  style={[
                    styles.iconSend,
                    {
                      backgroundColor:
                        appearance === 'pizza' ? theme.outgoing : theme.accent,
                    },
                    !draft.trim() && styles.sendDisabled,
                  ]}
                >
                  {composerAction?.kind === 'edit' ? (
                    <Check
                      size={20}
                      color={appearance === 'pizza' ? theme.text : '#ffffff'}
                    />
                  ) : (
                    <SendIcon
                      size={20}
                      color={appearance === 'pizza' ? theme.text : '#ffffff'}
                    />
                  )}
                </View>
              ) : undefined}
            </Send>
          )}
          renderAccessory={
            composerAction
              ? () => (
                  <View
                    style={[
                      styles.composerMode,
                      themed && {
                        backgroundColor: theme.incoming,
                        borderLeftColor: theme.accent,
                      },
                    ]}
                  >
                    <View style={styles.previewBody}>
                      <Text
                        style={[
                          styles.previewTitle,
                          themed && { color: theme.accent },
                        ]}
                      >
                        {composerAction.kind === 'edit'
                          ? 'Edit message'
                          : `Reply to ${selectedMessage?.name || 'Visitor'}`}
                      </Text>
                      <Text numberOfLines={2}>
                        {selectedMessage?.text ||
                          selectedMessage?.attachment?.name ||
                          'Message unavailable'}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Cancel reply or edit"
                      disabled={isSubmitting}
                      onPress={cancelComposerAction}
                      style={styles.cancelButton}
                    >
                      <Text
                        style={[
                          styles.cancelText,
                          themed && { color: theme.accent },
                        ]}
                      >
                        X
                      </Text>
                    </Pressable>
                  </View>
                )
              : undefined
          }
          renderCustomView={({ currentMessage, position }) => (
            <View>
              {currentMessage.quote && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Show original message"
                  accessibilityState={{
                    busy:
                      quoteTarget?.messageId === currentMessage.quote.messageId,
                  }}
                  onPress={() => onQuotePress(currentMessage.quote!)}
                  style={[
                    styles.quote,
                    position === 'right' && styles.quoteOutgoing,
                    themed && {
                      backgroundColor: theme.quoteBackground,
                      borderLeftColor: theme.accent,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.previewTitle,
                      themed && { color: theme.accent },
                    ]}
                  >
                    {currentMessage.quote.senderName || 'Visitor'}
                  </Text>
                  <Text numberOfLines={3}>
                    {currentMessage.quote.state === 'NOT_FOUND'
                      ? 'Original message unavailable'
                      : currentMessage.quote.state === 'PENDING'
                      ? 'Loading original message...'
                      : currentMessage.quote.messageText ||
                        currentMessage.quote.attachment?.name ||
                        'Attachment'}
                  </Text>
                </Pressable>
              )}
              {currentMessage.webimMessage.isEdited && (
                <Text
                  style={[styles.edited, themed && { color: theme.secondary }]}
                >
                  Edited
                </Text>
              )}
            </View>
          )}
          isTyping={isTyping}
          onQuickReply={onQuickReply}
          // infiniteScroll={true}
          loadEarlierMessagesProps={{
            isAvailable: hasMore,
            isLoading: loadingEarlier,
            onPress: loadNextMessages,
            label: themed ? 'Ранние сообщения' : undefined,
            textStyle: themed ? { color: theme.secondary } : undefined,
            wrapperStyle: themed
              ? { backgroundColor: 'transparent' }
              : undefined,
          }}
          renderMessageVideo={({ currentMessage }) => {
            const videoUrl = currentMessage.video;
            if (!videoUrl) return null;
            return (
              <Pressable
                accessibilityRole="button"
                onPress={() => openAttachment(videoUrl)}
                style={{ padding: 10 }}
              >
                <Text>Open video attachment</Text>
              </Pressable>
            );
          }}
          renderMessageText={(textProps) => {
            const attachmentUrl = textProps.currentMessage.attachmentUrl;
            if (!attachmentUrl)
              return (
                <MessageText
                  {...textProps}
                  matchers={getMessageLinkMatchers(
                    textProps.currentMessage.text
                  )}
                  onPress={(_message, url) => {
                    if (!isSupportedMessageLink(url)) {
                      Alert.alert(
                        'Unsupported link',
                        'This type of link cannot be opened.'
                      );
                      return;
                    }
                    Linking.openURL(url).catch(() =>
                      Alert.alert(
                        'Unable to open link',
                        'The link could not be opened.'
                      )
                    );
                  }}
                />
              );
            return (
              <Pressable
                accessibilityRole="link"
                onPress={() => openAttachment(attachmentUrl)}
                style={{ paddingVertical: 4 }}
              >
                <Text
                  style={[
                    textProps.textStyle?.[textProps.position ?? 'left'],
                    { textDecorationLine: 'underline' },
                  ]}
                >
                  {textProps.currentMessage.text}
                </Text>
              </Pressable>
            );
          }}
          renderActions={() => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Attach file"
              disabled={
                isUploadingAttachment || isSubmitting || !!composerAction
              }
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
              ) : themed ? (
                <Paperclip
                  size={appearance === 'pizza' ? 16 : 22}
                  color={theme.secondary}
                />
              ) : (
                <Text style={{ fontSize: 26 }}>+</Text>
              )}
            </Pressable>
          )}
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

const styles = StyleSheet.create({
  themedSystemMessage: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginHorizontal: 24,
    marginVertical: 8,
  },
  themedDay: { fontSize: 10, textAlign: 'center', marginVertical: 12 },
  pizzaMessageImage: { width: 150, height: 150, borderRadius: 16 },
  sendDisabled: { opacity: 0.4 },
  themedToolbar: {
    marginHorizontal: 10,
    marginVertical: 8,
    borderWidth: 1.5,
    borderRadius: 24,
    backgroundColor: '#ffffff',
  },
  themedToolbarPrimary: { alignItems: 'center' },
  iconSend: {
    width: 34,
    height: 34,
    margin: 5,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pizzaAvatarBox: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pizzaOperator: { width: 26, height: 28 },
  pizzaVisitor: { width: 26, height: 25 },
  reaction: {
    alignSelf: 'flex-start',
    minWidth: 44,
    height: 36,
    paddingHorizontal: 10,
    marginTop: 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e6f1ef',
    borderRadius: 8,
  },
  reactionOutgoing: { alignSelf: 'flex-end' },
  highlight: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255, 206, 64, 0.35)',
    borderColor: '#d49b00',
    borderWidth: 2,
    borderRadius: 8,
  },
  quote: {
    margin: 6,
    padding: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#007f78',
    backgroundColor: '#e6f1ef',
    borderRadius: 4,
  },
  quoteOutgoing: { backgroundColor: '#e7f3ff' },
  previewTitle: { color: '#145951', fontWeight: '600' },
  composerMode: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#007f78',
    backgroundColor: '#e6f1ef',
  },
  previewBody: { flex: 1, minWidth: 0 },
  cancelButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontSize: 18, color: '#145951' },
  edited: { fontSize: 11, color: '#555', paddingHorizontal: 10 },
});
