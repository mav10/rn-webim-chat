import React, { useEffect, useState } from 'react';
import {
  Image,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Menu, X } from 'lucide-react-native';
import type { ChatContainerBaseProps } from '../chat-container';
import { CustomChat } from '../withCustomUI';
import { pizzaAssets } from './assets';

const navigation = [
  { id: 'menu', label: 'Меню', asset: pizzaAssets.menu, width: 20, height: 26 },
  {
    id: 'orders',
    label: 'Заказы',
    asset: pizzaAssets.orders,
    width: 20,
    height: 27,
  },
  {
    id: 'cart',
    label: 'Корзина',
    asset: pizzaAssets.cart,
    width: 26,
    height: 26,
  },
  { id: 'chat', label: 'Чат', asset: pizzaAssets.chat, width: 31, height: 27 },
  {
    id: 'profile',
    label: 'Профиль',
    asset: pizzaAssets.visitor,
    width: 26,
    height: 25,
  },
] as const;
type PizzaSection = (typeof navigation)[number]['id'];

export const PizzaChatExample = (props: ChatContainerBaseProps) => {
  const [section, setSection] = useState<PizzaSection>('chat');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () =>
      setKeyboardVisible(true)
    );
    const hidden = Keyboard.addListener('keyboardDidHide', () =>
      setKeyboardVisible(false)
    );
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  const closePanel = () => setSection('chat');
  const openSection = (next: PizzaSection) => {
    Keyboard.dismiss();
    setSection(next);
  };
  const title = navigation.find((item) => item.id === section)?.label;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open menu"
          onPress={() => openSection('menu')}
          style={styles.headerMenu}
        >
          <Menu size={26} color="#2a2a2a" />
        </Pressable>
      </View>
      <View style={styles.chat}>
        <CustomChat {...props} appearance="pizza" />
      </View>
      {!keyboardVisible && (
        <View style={styles.navigation}>
          {navigation.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: section === item.id }}
              onPress={() => openSection(item.id)}
              style={styles.tab}
            >
              <View
                style={item.id === 'cart' ? styles.cartBox : styles.iconBox}
              >
                <Image
                  source={item.asset}
                  style={{ width: item.width, height: item.height }}
                  resizeMode="contain"
                />
              </View>
              {item.id !== 'cart' && (
                <Text
                  style={[
                    styles.tabLabel,
                    section === item.id && styles.selectedLabel,
                  ]}
                >
                  {item.label}
                </Text>
              )}
            </Pressable>
          ))}
        </View>
      )}
      <Modal
        visible={section !== 'chat'}
        transparent
        animationType="slide"
        onRequestClose={closePanel}
      >
        <View style={styles.scrim}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close panel"
            style={StyleSheet.absoluteFill}
            onPress={closePanel}
          />
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>{title}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close panel"
                onPress={closePanel}
                style={styles.closeButton}
              >
                <X size={24} color="#2a2a2a" />
              </Pressable>
            </View>
            {section === 'menu' ? (
              <>
                <Image
                  source={pizzaAssets.pizza}
                  style={styles.pizzaImage}
                  resizeMode="cover"
                />
                <Text style={styles.panelTitle}>Пепперони</Text>
              </>
            ) : (
              <Text style={styles.emptyState}>
                {section === 'orders'
                  ? 'Нет заказов'
                  : section === 'cart'
                  ? 'Корзина пуста'
                  : props.userFields?.fields.display_name || 'Посетитель'}
              </Text>
            )}
            <Pressable
              accessibilityRole="button"
              onPress={closePanel}
              style={styles.returnButton}
            >
              <Text style={styles.returnLabel}>Написать в чат</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  chat: { flex: 1 },
  header: {
    width: '100%',
    height: 54,
    backgroundColor: '#ffcc1b',
    justifyContent: 'center',
  },
  headerMenu: {
    marginLeft: 6,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navigation: {
    height: 66,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#efe7de',
  },
  tab: { flex: 1, height: 64, alignItems: 'center', justifyContent: 'center' },
  iconBox: {
    width: 44,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBox: {
    width: 57,
    height: 57,
    borderRadius: 29,
    backgroundColor: '#ffcc1b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: { fontSize: 10, color: '#2a2a2a' },
  selectedLabel: { fontWeight: '700' },
  scrim: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  panel: {
    padding: 20,
    paddingBottom: 40,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  panelTitle: { fontSize: 20, color: '#2a2a2a', fontWeight: '600' },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pizzaImage: { width: 150, height: 150, borderRadius: 16, marginBottom: 12 },
  emptyState: { fontSize: 16, color: '#837c77', paddingVertical: 30 },
  returnButton: {
    minHeight: 48,
    marginTop: 24,
    backgroundColor: '#ffcc1b',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  returnLabel: { color: '#2a2a2a', fontSize: 16, fontWeight: '600' },
});
