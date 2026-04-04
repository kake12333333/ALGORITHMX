import ChatRoom from "./components/ChatRoom";

export default function App() {
  const senderName = localStorage.getItem("chatUserName") || "Responder";

  return (
    <main className="min-h-screen bg-slate-950 p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        <ChatRoom roomId="Mumbai Relief Group" senderName={senderName} />
      </div>
    </main>
  );
}
