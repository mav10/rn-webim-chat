import * as React from 'react';

import { StyleSheet, Text, View } from 'react-native';
import { RNWebim, WebimMessage } from 'rn-webim-chat';

export default function App() {
  const [result, setResult] = React.useState<WebimMessage[]>([]);

  React.useEffect(() => {
    RNWebim.resumeSession({
      location: 'Tomsk',
      appVersion: '1.0.0',
      accountName: 'test',
    }).then(() => {
      RNWebim.getAllMessages().then(({ messages }) => setResult(messages));
    });
  }, []);

  return (
    <View style={styles.container}>
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    width: 60,
    height: 60,
    marginVertical: 20,
  },
  message: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
});
