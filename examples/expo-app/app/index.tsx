import { useState, useEffect, memo } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';

function LiveClock() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={styles.row}>
      <ClockDisplay timestamp={now} />
      <ClockLabel />
    </View>
  );
}

function ClockDisplay({ timestamp }: { timestamp: number }) {
  return <Text style={styles.mono}>{new Date(timestamp).toLocaleTimeString()}</Text>;
}

function ClockLabel() {
  return <Text style={styles.muted}> local time</Text>;
}

const ITEMS = Array.from({ length: 50 }, (_, i) => ({
  id: String(i),
  name: `Item ${i}`,
  category: ['A', 'B', 'C'][i % 3],
}));

const ListItem = memo(function ListItem({ name, category }: { name: string; category: string }) {
  return (
    <View style={styles.listItem}>
      <Text>{name}</Text>
      <Text style={styles.muted}> ({category})</Text>
    </View>
  );
});

function ItemList({ filter }: { filter: string }) {
  const filtered = ITEMS.filter((item) =>
    item.name.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <FlatList
      data={filtered}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <ListItem name={item.name} category={item.category} />}
      style={styles.list}
    />
  );
}

function NotificationBanner() {
  const [count, setCount] = useState(0);
  const [label, setLabel] = useState('No notifications');

  useEffect(() => {
    setLabel(count === 0 ? 'No notifications' : `${count} notification${count > 1 ? 's' : ''}`);
  }, [count]);

  return (
    <View style={[styles.banner, count > 0 ? styles.bannerWarning : styles.bannerSuccess]}>
      <Text>{label}</Text>
      <Pressable onPress={() => setCount((n) => n + 1)} style={styles.button}>
        <Text>Add</Text>
      </Pressable>
      <Pressable onPress={() => setCount(0)} style={styles.button}>
        <Text>Clear</Text>
      </Pressable>
    </View>
  );
}

export default function HomeScreen() {
  const [filter, setFilter] = useState('');

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <Text style={styles.title}>Perf Debug App</Text>
      <LiveClock />
      <NotificationBanner />
      <TextInput
        placeholder="Filter items..."
        value={filter}
        onChangeText={setFilter}
        style={styles.input}
      />
      <ItemList filter={filter} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 60, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', marginVertical: 4 },
  mono: { fontFamily: 'monospace' },
  muted: { color: '#888' },
  banner: { flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 4, marginVertical: 8 },
  bannerWarning: { backgroundColor: '#ffeeba' },
  bannerSuccess: { backgroundColor: '#d4edda' },
  button: { marginLeft: 8, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: '#e0e0e0', borderRadius: 4 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 8, marginVertical: 8 },
  list: { maxHeight: 300 },
  listItem: { flexDirection: 'row', paddingVertical: 4 },
});
