import React, { useMemo, useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import { SimpleChatExample } from './simple';
import { CustomChat } from './withCustomUI';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

const CHAT_SERVICE_ACCOUNT = 'comrnwebimchatexample001';

export default function App() {
  const [chatUI, setChatUI] = useState<'SIMPLE' | 'CUSTOM' | null>(null);

  const content = useMemo(() => {
    switch (chatUI) {
      case 'SIMPLE':
        return <SimpleChatExample chatAccount={CHAT_SERVICE_ACCOUNT} />;
      case 'CUSTOM':
        return <CustomChat chatAccount={CHAT_SERVICE_ACCOUNT} />;
      default:
        return <Text>Not selected UI</Text>;
    }
  }, [chatUI]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.safeAre}>
          <View style={styles.header}>
            <Button title={'Simple'} onPress={() => setChatUI('SIMPLE')} />
            <Button title={'Custom'} onPress={() => setChatUI('CUSTOM')} />
          </View>
          <View style={styles.container}>{content}</View>
        </SafeAreaView>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
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
