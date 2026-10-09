import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, MoreVertical } from 'lucide-react-native';
import type { ChatContainerBaseProps } from '../chat-container';
import { CustomChat } from '../withCustomUI';

export const TelegramChatExample = (
  props: ChatContainerBaseProps & {
    onBack: () => void;
    onChooseExample: () => void;
  }
) => (
  <View style={styles.root}>
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to Custom chat"
        onPress={props.onBack}
        style={styles.iconButton}
      >
        <ArrowLeft size={24} color="#ffffff" />
      </Pressable>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>W</Text>
      </View>
      <View style={styles.titleGroup}>
        <Text style={styles.title}>Webim</Text>
        <Text style={styles.subtitle}>служба поддержки</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose chat example"
        onPress={props.onChooseExample}
        style={styles.iconButton}
      >
        <MoreVertical size={24} color="#ffffff" />
      </Pressable>
    </View>
    <View style={styles.chat}>
      <CustomChat {...props} appearance="telegram" />
    </View>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#dce7df' },
  chat: { flex: 1 },
  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#518db5',
    paddingRight: 4,
  },
  iconButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#74b0d5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { fontSize: 21, fontWeight: '600', color: '#ffffff' },
  titleGroup: { flex: 1, minWidth: 0 },
  title: { fontSize: 18, fontWeight: '600', color: '#ffffff' },
  subtitle: { fontSize: 13, color: '#e0eff8', marginTop: 2 },
});
