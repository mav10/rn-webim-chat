import React, { useMemo, useState } from 'react';
import * as AppConfig from '../package.json';
import { Button, StyleSheet, Text, View } from 'react-native';
import { SimpleChatExample } from './simple';
import { CustomChat } from './withCustomUI';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

const PRIVATE_KEY = '437d574200394d92ba3aa9fe619eb02c';
const CHAT_SERVICE_ACCOUNT = 'comrnwebimchatexample';

const acc = {
  fields: {
    id: 'custom-id',
    display_name: AppConfig.name,
    avatar_url: 'https://i.pravatar.cc/300',
    phone: '+79000000000',
    address: 'Томск',
    info: 'Some additional text info',
  },
  hash: '',
};

export default function App() {
  const [chatUI, setChatUI] = useState<'SIMPLE' | 'CUSTOM' | null>(null);

  const content = useMemo(() => {
    switch (chatUI) {
      case 'SIMPLE':
        return (
          <SimpleChatExample
            chatAccount={CHAT_SERVICE_ACCOUNT}
            privateKey={PRIVATE_KEY}
            userFields={acc}
          />
        );
      case 'CUSTOM':
        return (
          <CustomChat
            privateKey={PRIVATE_KEY}
            chatAccount={CHAT_SERVICE_ACCOUNT}
            userFields={acc}
          />
        );
      default:
        return <Text>Not selected UI</Text>;
    }
  }, [chatUI]);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeAre}>
        <View style={styles.header}>
          <Button title={'Simple'} onPress={() => setChatUI('SIMPLE')} />
          <Button title={'Custom'} onPress={() => setChatUI('CUSTOM')} />
        </View>
        <View style={styles.container}>{content}</View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeAre: {
    flexGrow: 1,
    backgroundColor: '#ffb114',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignContent: 'center',

    paddingHorizontal: 16,
    minHeight: 60,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#fefefe',
  },
  placeholder: {},
});
