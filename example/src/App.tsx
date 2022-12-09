import * as React from 'react';
import { useCallback } from 'react';
import * as AppConfig from '../package.json';
import { Button, StyleSheet, Text, View } from 'react-native';
import { isWebimError, RNWebim, WebimMessage } from 'rn-webim-chat';
import { getHashForChatSign } from './chat-utils';

const PRIVATE_KEY = '';
const CHAT_SERVICE_ACCOUNT = '';

const acc = {
  fields: {
    id: 'custom-id',
    display_name: AppConfig.name,
    phone: '+79000000000',
    address: 'Томск',
  },
  hash: '',
};

export default function App() {
  const [result, setResult] = React.useState<WebimMessage[]>([]);
  const [isInit, setInit] = React.useState<boolean>(false);
  const [fatalError, setFatalError] = React.useState<string>('');
  const [notFatalError, setNotFatalError] = React.useState<string>('');

  React.useEffect(() => {}, []);

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

      await RNWebim.addErrorListener(errorListener);
      await RNWebim.addSateListener((state) => {
        console.log('State listener: ', state);
      });
      await RNWebim.resumeSession(sessionsParams);
      console.log('[Chat][Init] initialized with params: ', sessionsParams);
      setInit(true);
    } catch (err: unknown) {
      console.log('[Chat][Init] error: ', JSON.stringify(err));
      handleError(err);
    }
  }, [handleError, errorListener]);

  const onGetAllMessages = useCallback(async () => {
    try {
      const messageResult = await RNWebim.getAllMessages();
      console.log('[Chat][All Messages] get: ', messageResult);

      setResult(messageResult.messages);
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
    }
  }, []);

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
        {result.map((x) => {
          return (
            <View key={x.id} style={styles.message}>
              <Text>{x.text}</Text>
              <Text>{x.time}</Text>
            </View>
          );
        })}
      </View>

      <Text>{`Chat is init: ${isInit}`}</Text>
      <View style={styles.buttonsContainer}>
        <Button title={'Init session'} onPress={intSession} />
        <Button title={'Read messages'} onPress={onGetAllMessages} />
        <Button title={'Send messages'} onPress={sendTestMessage} />

        <Button title={'Close session'} onPress={onCloseSession} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
