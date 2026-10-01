import * as React from 'react';
import { useCallback } from 'react';
import {
  isWebimError,
  RNWebim,
  WebimMessage,
  WebimNativeError,
} from 'rn-webim-chat';
import * as AppConfig from '../../package.json';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ChatContainerBaseProps } from '../chat-container';
import type { WebimSubscription } from 'rn-webim-chat';
import { closeChatSession, openChatSession } from '../services/chat-service';

export const SimpleChatExample = (props: ChatContainerBaseProps) => {
  const { chatAccount: CHAT_SERVICE_ACCOUNT, userFields } = props;
  const [result, setResult] = React.useState<WebimMessage[]>([]);
  const [isInit, setInit] = React.useState<boolean>(false);
  const [isPaused, setPaused] = React.useState<boolean>(true);
  const [fatalError, setFatalError] = React.useState<string>('');
  const [notFatalError, setNotFatalError] = React.useState<string>('');
  const subscriptions = React.useRef<WebimSubscription[]>([]);
  const sessionOwner = React.useRef({}).current;
  const mounted = React.useRef(true);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      subscriptions.current.forEach((subscription) => subscription.remove());
      subscriptions.current = [];
      closeChatSession(sessionOwner).catch(console.error);
    };
  }, [sessionOwner]);

  const handleError = useCallback((err: any) => {
    if (isWebimError(err)) {
      err.errorType === 'fatal'
        ? setFatalError(err.errorCode)
        : setNotFatalError(err.errorCode);

      return;
    }

    setFatalError(err?.message || 'UNEXPECTED ERROR');
  }, []);

  const errorListener = useCallback(
    (err: any) => {
      console.log('[Chat] [Error handler]', err);
      handleError(err);
    },
    [handleError]
  );

  const intSession = useCallback(async () => {
    try {
      setFatalError('');
      setNotFatalError('');
      const sessionsParams = {
        accountName: CHAT_SERVICE_ACCOUNT,
        location: 'default',
        storeHistoryLocally: true,
        ...(userFields ? { accountJSON: JSON.stringify(userFields) } : {}),
        appVersion: AppConfig.version,
        clearVisitorData: false,
      };

      await openChatSession(sessionOwner, sessionsParams);
      if (!mounted.current) return;
      subscriptions.current.forEach((subscription) => subscription.remove());
      subscriptions.current = [
        RNWebim.addErrorListener(errorListener),
        RNWebim.addSateListener((state) => {
          console.log('State listener: ', state);
        }),
        RNWebim.addNewMessageListener((args) => {
          console.log('Got message listener listener: ', args);
        }),
        RNWebim.addTypingListener((args) => {
          console.log('Typing listener: ', args);
        }),
        RNWebim.addUnreadCountListener((args) => {
          console.log('UnreadCountListener listener: ', args);
        }),
        RNWebim.addFileUploadingListener((args) => {
          console.log('File uploading listener: ', args);
        }),
      ];
      console.log('[Chat][Init] initialized');
      setInit(true);
    } catch (err: unknown) {
      console.log('[Chat][Init] error: ', JSON.stringify(err), '\n', err);
      handleError(err);
    }
  }, [
    userFields,
    CHAT_SERVICE_ACCOUNT,
    errorListener,
    handleError,
    sessionOwner,
  ]);

  const onResume = useCallback(async () => {
    try {
      await RNWebim.resumeSession();
      setPaused(false);
    } catch (err) {
      console.log('[Chat][Resume] error: ', JSON.stringify(err), '\n', err);
      handleError(err);
    }
  }, [handleError]);

  const onPause = useCallback(async () => {
    try {
      await RNWebim.pauseSession();
      setPaused(true);
    } catch (err) {
      console.log('[Chat][Pause] error: ', JSON.stringify(err), '\n', err);
      handleError(err);
    }
  }, [handleError]);

  const onGetAllMessages = useCallback(async () => {
    try {
      const messageResult = await RNWebim.getAllMessages();
      console.log('[Chat][All Messages] get: ', messageResult);

      setResult(messageResult);
    } catch (err: unknown) {
      console.log(
        '[Chat][All Messages] error: ',
        JSON.stringify(err),
        '\n',
        err
      );
      handleError(err);
    }
  }, [handleError]);

  const onCloseSession = useCallback(async () => {
    try {
      setFatalError('');
      setNotFatalError('');
      subscriptions.current.forEach((subscription) => subscription.remove());
      subscriptions.current = [];
      await closeChatSession(sessionOwner);
      console.log('[Chat][Destroy] success');

      setInit(false);
      setPaused(true);
      setResult([]);
    } catch (err: unknown) {
      console.log('[Chat][Destroy] error: ', JSON.stringify(err));
      handleError(err);
    }
  }, [handleError, sessionOwner]);

  const sendTestMessage = useCallback(async () => {
    try {
      await RNWebim.send('Test example message');
    } catch (e) {
      console.log('[Chat][Send] error: ', JSON.stringify(e), '\n', e);
      handleError(e);
    }
  }, [handleError]);

  const onRateOperator = useCallback(
    async (rate: number) => {
      try {
        await RNWebim.rateOperator(rate);
      } catch (e) {
        console.log('[Chat][Rate] error: ', JSON.stringify(e), '\n', e);
        handleError(e);
      }
    },
    [handleError]
  );

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

  return (
    <View style={styles.container}>
      <View style={styles.errorContainer}>
        {!!fatalError && <Text style={styles.fatalError}>{fatalError}</Text>}
        {!!notFatalError && (
          <Text style={styles.commonError}>{notFatalError}</Text>
        )}
      </View>

      <View style={styles.messageContainer}>
        <Text>Result:messages</Text>
        <ScrollView>
          {result?.map((x) => {
            return (
              <View key={x.id} style={styles.message}>
                <Text>{x.text}</Text>
                <Text>{x.time}</Text>
              </View>
            );
          })}
        </ScrollView>
      </View>

      <Text>{`Chat is init: ${isInit} (Paused: ${isPaused})`}</Text>
      <View style={styles.buttonsContainer}>
        <Button title={'Init session'} onPress={intSession} />
        <Button title={'Destroy session'} onPress={onCloseSession} />
      </View>
      <View style={styles.buttonsContainer}>
        <Button title={'Resume session'} onPress={onResume} />
        <Button title={'Pause session'} onPress={onPause} />
      </View>
      <View style={styles.buttonsContainer}>
        <Button title={'Read messages'} onPress={onGetAllMessages} />
        <Button title={'Send messages'} onPress={sendTestMessage} />
      </View>

      <View style={styles.buttonsContainer}>
        <Button title={'Rate operator (2)'} onPress={() => onRateOperator(2)} />
        <Button title={'Rate operator (5)'} onPress={() => onRateOperator(5)} />
      </View>

      <View style={styles.buttonsContainer}>
        <Button title={'Select attachment'} onPress={onSelectFiles} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: '100%',
  },
  box: {
    width: 60,
    height: 60,
    marginVertical: 20,
  },
  messageContainer: {
    flex: 3,
  },

  message: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },

  buttonsContainer: {
    height: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },

  errorContainer: {
    height: 20 + 16 + 2 + 2,
  },

  fatalError: {
    fontSize: 20,
    textAlign: 'left',
    color: 'red',
    marginBottom: 2,
  },

  commonError: {
    fontSize: 16,
    textAlign: 'left',
    color: 'orange',
    marginBottom: 2,
  },
});
