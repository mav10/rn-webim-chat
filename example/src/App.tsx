import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SimpleChatExample } from './simple';
import { CustomChat } from './withCustomUI';
import { TelegramChatExample } from './telegram';
import { PizzaChatExample } from './pizza';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

const CHAT_SERVICE_ACCOUNT = 'comrnwebimchatexample001';
const examples = [
  { id: 'SIMPLE', label: 'Simple' },
  { id: 'CUSTOM', label: 'Custom' },
  { id: 'TELEGRAM', label: 'Telegram' },
  { id: 'PIZZA', label: 'Figma' },
] as const;
type Example = (typeof examples)[number]['id'];

export default function App() {
  const [chatUI, setChatUI] = useState<Example>('CUSTOM');
  const [chooserVisible, setChooserVisible] = useState(false);

  const renderContent = () => {
    switch (chatUI) {
      case 'SIMPLE':
        return <SimpleChatExample chatAccount={CHAT_SERVICE_ACCOUNT} />;
      case 'CUSTOM':
        return <CustomChat chatAccount={CHAT_SERVICE_ACCOUNT} />;
      case 'TELEGRAM':
        return (
          <TelegramChatExample
            chatAccount={CHAT_SERVICE_ACCOUNT}
            onBack={() => setChatUI('CUSTOM')}
            onChooseExample={() => setChooserVisible(true)}
          />
        );
      case 'PIZZA':
        return <PizzaChatExample chatAccount={CHAT_SERVICE_ACCOUNT} />;
    }
  };
  const chooseExample = (next: Example) => {
    setChatUI(next);
    setChooserVisible(false);
  };

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" />
        <SafeAreaView style={styles.safeAre}>
          <View style={styles.header}>
            {examples.map((example) => (
              <Pressable
                key={example.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: chatUI === example.id }}
                onPress={() => chooseExample(example.id)}
                style={[
                  styles.exampleTab,
                  chatUI === example.id && styles.activeTab,
                ]}
              >
                <Text
                  style={[
                    styles.exampleLabel,
                    chatUI === example.id && styles.activeLabel,
                  ]}
                >
                  {example.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.container}>{renderContent()}</View>
          <Modal
            visible={chooserVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setChooserVisible(false)}
          >
            <View style={styles.scrim}>
              <Pressable
                accessibilityLabel="Close example chooser"
                style={StyleSheet.absoluteFill}
                onPress={() => setChooserVisible(false)}
              />
              <View style={styles.chooser}>
                {examples.map((example) => (
                  <Pressable
                    key={example.id}
                    onPress={() => chooseExample(example.id)}
                    style={styles.chooserRow}
                  >
                    <Text style={styles.chooserLabel}>{example.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </Modal>
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
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    height: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e7e9',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#fefefe',
  },
  exampleTab: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: { borderBottomColor: '#248bc4' },
  exampleLabel: { fontSize: 12, color: '#6d767b' },
  activeLabel: { color: '#167ab0', fontWeight: '700' },
  scrim: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  chooser: {
    width: '80%',
    maxWidth: 360,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    paddingVertical: 8,
  },
  chooserRow: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  chooserLabel: { fontSize: 16, color: '#2a2a2a' },
});
