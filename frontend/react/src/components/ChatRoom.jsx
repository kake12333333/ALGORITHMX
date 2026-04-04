import { useEffect, useRef, useState } from "react";
import { db } from "../firebase";
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from "firebase/firestore";

function formatTime(timestamp) {
  if (!timestamp) return "--:--";
  try {
    const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "--:--";
  }
}

export default function ChatRoom({
  roomId = "Mumbai Relief Group",
  senderName = "Anonymous",
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const endRef = useRef(null);

  useEffect(() => {
    // 1. Setup Query
    const q = query(collection(db, "messages"), orderBy("createdAt", "asc"));

    // 2. Real-time Listener (onSnapshot)
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const fetchedMessages = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setMessages(fetchedMessages);
        setIsLoading(false);
        setError("");
      },
      (err) => {
        console.error("Firestore error:", err);
        setError("Permission denied or connection issue.");
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [roomId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (event) => {
    if (event) event.preventDefault();
    if (!input.trim()) return;

    try {
      console.log("Button clicked, sending to Firestore...");
      await addDoc(collection(db, "messages"), {
        text: input,
        user: senderName || "User",
        createdAt: serverTimestamp()
      });

      setInput("");
    } catch (err) {
      console.error("ERROR SENDING MESSAGE:", err);
      setError("Failed to send message. Check console or rules.");
    }
  };

  function onInputChange(value) {
    setInput(value);
  }

  return (
    <section className="h-full w-full rounded-xl border border-slate-700 bg-slate-900 text-slate-100 shadow-xl">
      <header className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold">{roomId}</h2>
          <p className="text-xs text-slate-400">Realtime relief coordination</p>
        </div>
      </header>

      <div className="h-[460px] overflow-y-auto px-4 py-3">
        {isLoading && <p className="text-sm text-slate-400">Loading messages...</p>}
        {!isLoading && messages.length === 0 && <p className="text-sm text-slate-400">No messages yet.</p>}

        {messages.map((msg) => {
          const mine = msg.user === senderName;
          return (
            <div key={msg.id} className={`mb-3 flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-lg px-3 py-2 ${mine ? "bg-indigo-600" : "bg-slate-800"}`}>
                <div className="mb-1 flex items-center gap-2 text-xs text-slate-300">
                  <span className="font-medium">{msg.user}</span>
                  <span>{formatTime(msg.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{msg.text}</p>
              </div>
            </div>
          );
        })}

        <div ref={endRef} />
      </div>

      <form onSubmit={sendMessage} className="border-t border-slate-700 p-3">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder="Type your message"
            className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500"
          >
            Send
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
      </form>
    </section>
  );
}
