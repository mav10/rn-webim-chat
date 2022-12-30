import * as React from 'react';
import { isWebimError, RNWebim, WebimMessage } from 'rn-webim-chat';
import { useCallback } from 'react';
import { getHashForChatSign } from '../chat-utils';
import * as AppConfig from '../../package.json';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ChatContainerBaseProps } from '../chat-container';

export const SimpleChatExample = (props: ChatContainerBaseProps) => {
  const {
    chatAccount: CHAT_SERVICE_ACCOUNT,
    privateKey: PRIVATE_KEY,
    userFields: acc,
  } = props;
  const [result, setResult] = React.useState<WebimMessage[]>([]);
  const [isInit, setInit] = React.useState<boolean>(false);
  const [fatalError, setFatalError] = React.useState<string>('');
  const [notFatalError, setNotFatalError] = React.useState<string>('');

  React.useEffect(() => {
    return () => {
      onCloseSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      acc.hash = await getHashForChatSign(acc.fields, PRIVATE_KEY);
      const sessionsParams = {
        accountName: CHAT_SERVICE_ACCOUNT,
        location: 'default',
        storeHistoryLocally: true,
        accountJSON: JSON.stringify(acc),
        appVersion: AppConfig.version,
        clearVisitorData: true,
      };

      await RNWebim.initSession(sessionsParams);
      await RNWebim.addErrorListener(errorListener);
      await RNWebim.addSateListener((state) => {
        console.log('State listener: ', state);
      });
      await RNWebim.addNewMessageListener((args) => {
        console.log('Got message listener listener: ', args);
      });
      await RNWebim.addTypingListener((args) => {
        console.log('Typing listener: ', args);
      });
      await RNWebim.addUnreadCountListener((args) => {
        console.log('UnreadCountListener listener: ', args);
      });
      console.log('Before resume: ');
      await RNWebim.resumeSession();
      console.log('[Chat][Init] initialized with params: ', sessionsParams);
      setInit(true);
    } catch (err: unknown) {
      console.log('[Chat][Init] error: ', JSON.stringify(err));
      handleError(err);
    }
  }, [acc, PRIVATE_KEY, CHAT_SERVICE_ACCOUNT, errorListener, handleError]);

  const onGetAllMessages = useCallback(async () => {
    try {
      const messageResult = await RNWebim.getLastMessages(5);
      console.log('[Chat][All Messages] get: ', messageResult);

      setResult(messageResult);
    } catch (err: unknown) {
      console.log('[Chat][All Messages] error: ', JSON.stringify(err));
      handleError(err);
    }
  }, [handleError]);

  const onCloseSession = useCallback(async () => {
    try {
      setFatalError('');
      setNotFatalError('');
      await RNWebim.destroySession(true);
      console.log('[Chat][Destroy] success');

      setInit(false);
      setResult([]);
    } catch (err: unknown) {
      console.log('[Chat][Destroy] error: ', JSON.stringify(err));
      handleError(err);
    }
  }, [handleError]);

  const sendTestMessage = useCallback(async () => {
    try {
      await RNWebim.send('Test example message');
    } catch (e) {
      console.log('[Chat][Send] error: ', JSON.stringify(e));
      handleError(e);
    }
  }, [handleError]);

  return (
    <View style={styles.container}>
      <View style={styles.errorContainer}>
        {fatalError && <Text style={styles.fatalError}>{fatalError}</Text>}
        {notFatalError && (
          <Text style={styles.commonError}>{notFatalError}</Text>
        )}
      </View>

      <View style={styles.messageContainer}>
        <Text>Result:messages</Text>
        <ScrollView>
          {result.map((x) => {
            return (
              <View key={x.id} style={styles.message}>
                <Text>{x.text}</Text>
                <Text>{x.time}</Text>
              </View>
            );
          })}
        </ScrollView>
      </View>

      <Text>{`Chat is init: ${isInit}`}</Text>
      <View style={styles.buttonsContainer}>
        <Button title={'Init session'} onPress={intSession} />
        <Button title={'Close session'} onPress={onCloseSession} />
      </View>
      <View style={styles.buttonsContainer}>
        <Button title={'Read messages'} onPress={onGetAllMessages} />
        <Button title={'Send messages'} onPress={sendTestMessage} />
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
