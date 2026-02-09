import { useState, useEffect, memo } from 'react';

// ── Perf issue: live clock causes cascading re-renders ──
function LiveClock() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ fontFamily: 'monospace', margin: '8px 0' }}>
      <ClockDisplay timestamp={now} />
      <ClockLabel />
    </div>
  );
}

function ClockDisplay({ timestamp }: { timestamp: number }) {
  return <span>{new Date(timestamp).toLocaleTimeString()}</span>;
}

// Bug: ClockLabel re-renders every second even though it has no props that change,
// because it's a child of LiveClock which re-renders on every tick
function ClockLabel() {
  return <span style={{ marginLeft: 8, color: '#888' }}>local time</span>;
}

// ── Perf issue: expensive list without memoization ──
const ITEMS = Array.from({ length: 500 }, (_, i) => ({
  id: i,
  name: `Item ${i}`,
  category: ['A', 'B', 'C'][i % 3],
  value: Math.random() * 1000,
}));

function ExpensiveList({ filter }: { filter: string }) {
  // Bug: expensive filtering runs on every render, not memoized
  const filtered = ITEMS.filter((item) => {
    // Simulate expensive per-item work
    let hash = 0;
    for (let j = 0; j < 200; j++) hash += Math.sin(item.value + j);
    return item.name.toLowerCase().includes(filter.toLowerCase()) && hash !== Infinity;
  });

  return (
    <ul style={{ maxHeight: 150, overflow: 'auto', margin: '8px 0' }}>
      {filtered.map((item) => (
        <ExpensiveListItem key={item.id} name={item.name} category={item.category} />
      ))}
    </ul>
  );
}

const ExpensiveListItem = memo(function ExpensiveListItem({
  name,
  category,
}: {
  name: string;
  category: string;
}) {
  return (
    <li>
      {name} <small>({category})</small>
    </li>
  );
});

function ListFilter() {
  const [filter, setFilter] = useState('');
  const [, setUnrelated] = useState(0);

  return (
    <div>
      <input
        placeholder="Filter items..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      {/* Bug: clicking this re-runs ExpensiveList even though filter didn't change */}
      <button onClick={() => setUnrelated((n) => n + 1)} style={{ marginLeft: 8 }}>
        Unrelated update
      </button>
      <ExpensiveList filter={filter} />
    </div>
  );
}

// ── Perf issue: unstable props defeat memo ──
const ChatMessage = memo(function ChatMessage({
  message,
}: {
  message: { text: string; author: string };
}) {
  return (
    <div style={{ padding: '2px 0' }}>
      <strong>{message.author}:</strong> {message.text}
    </div>
  );
});

function ChatMessages() {
  const [messages, setMessages] = useState([
    { text: 'Hello!', author: 'Alice' },
    { text: 'Hi there', author: 'Bob' },
    { text: 'How are you?', author: 'Alice' },
  ]);
  const [draft, setDraft] = useState('');

  return (
    <div style={{ margin: '8px 0' }}>
      {messages.map((msg, i) => (
        // Bug: new object reference on every render defeats memo
        <ChatMessage key={i} message={{ text: msg.text, author: msg.author }} />
      ))}
      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
        <input
          placeholder="Type a message..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          onClick={() => {
            if (draft.trim()) {
              setMessages([...messages, { text: draft, author: 'You' }]);
              setDraft('');
            }
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

// ── Perf issue: cascading state updates ──
function NotificationBanner() {
  const [count, setCount] = useState(0);
  const [label, setLabel] = useState('0 notifications');

  // Bug: cascading effect — every count change triggers a second render to update label
  useEffect(() => {
    setLabel(count === 0 ? 'No notifications' : `${count} notification${count > 1 ? 's' : ''}`);
  }, [count]);

  return (
    <div style={{ padding: '4px 8px', background: count > 0 ? '#ffeeba' : '#d4edda', margin: '8px 0', borderRadius: 4 }}>
      <span>{label}</span>
      <button onClick={() => setCount((n) => n + 1)} style={{ marginLeft: 8 }}>
        Add
      </button>
      <button onClick={() => setCount(0)} style={{ marginLeft: 4 }}>
        Clear
      </button>
    </div>
  );
}

// ── App root ──
export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  return (
    <div style={{ background: theme === 'dark' ? '#222' : '#fff', color: theme === 'dark' ? '#fff' : '#000', minHeight: '100vh', padding: 20 }}>
      <h1>Perf Debug App</h1>
      <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
        Toggle theme
      </button>
      <LiveClock />
      <NotificationBanner />
      <h3>Chat</h3>
      <ChatMessages />
      <h3>Items</h3>
      <ListFilter />
    </div>
  );
}
