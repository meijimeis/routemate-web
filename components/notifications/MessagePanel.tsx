"use client";

import { useEffect, useState } from "react";
import { useMessageInbox } from "./useMessageInbox";
import { Message } from "./messageTypes";
import { MessageSquare, Send } from "lucide-react";

export default function MessagePanel() {
  const { createDraft, sendMessage } = useMessageInbox();
  const [activeMessage, setActiveMessage] = useState<Message | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    function handler(e: Event) {
      const customEvent = e as CustomEvent;
      const riderName =
        typeof customEvent.detail?.riderName === "string"
          ? customEvent.detail.riderName
          : "Unknown Driver";
      const draftMessage =
        typeof customEvent.detail?.message === "string" ? customEvent.detail.message : "";
      const riderId =
        typeof customEvent.detail?.riderId === "string" ? customEvent.detail.riderId : null;
      const sourceNotificationId =
        typeof customEvent.detail?.sourceNotificationId === "string"
          ? customEvent.detail.sourceNotificationId
          : null;

      const draft = createDraft(riderId, riderName, draftMessage, sourceNotificationId);
      setActiveMessage(draft);
      setSendError(null);
    }

    window.addEventListener("OPEN_MESSAGE_DRAFT", handler);
    return () =>
      window.removeEventListener("OPEN_MESSAGE_DRAFT", handler);
  }, [createDraft]);

  const handleSendMessage = async () => {
    if (activeMessage && activeMessage.content.trim()) {
      try {
        setSendError(null);
        setIsSending(true);
        await sendMessage(activeMessage.id);
        setActiveMessage(null);
      } catch (err) {
        console.error("Failed to send message:", err);
        setSendError(err instanceof Error ? err.message : "Failed to send message.");
      } finally {
        setIsSending(false);
      }
    }
  };

  if (!activeMessage) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 flex flex-col items-center justify-center h-[260px] shrink-0 text-center">
        <MessageSquare className="w-8 h-8 text-gray-400 mb-2" />
        <p className="text-sm font-medium text-gray-600">No message selected</p>
        <p className="text-xs text-gray-500 mt-1">Click on a notification to send a message</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 flex flex-col h-[260px] shrink-0">
      {/* HEADER */}
      <div className="px-4 py-3 border-b bg-gray-50 font-semibold text-sm flex items-center justify-between">
        <span>Message to {activeMessage.riderName}</span>
        <button
          onClick={() => setActiveMessage(null)}
          className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 hover:bg-gray-200 rounded"
        >
          Clear
        </button>
      </div>

      {/* TEXTAREA */}
      <textarea
        className="flex-1 p-3 text-sm outline-none resize-none focus:ring-0"
        value={activeMessage.content}
        onChange={(e) =>
          setActiveMessage({
            ...activeMessage,
            content: e.target.value,
          })
        }
        placeholder="Type your message here..."
      />

      {sendError ? (
        <div className="mx-3 mb-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
          {sendError}
        </div>
      ) : null}

      {/* FOOTER */}
      <div className="border-t px-3 py-2 flex items-center justify-between bg-gray-50">
        <span className="text-xs text-gray-500">
          {activeMessage.content.length} characters
        </span>
        <button
          onClick={handleSendMessage}
          disabled={!activeMessage.content.trim() || isSending}
          className="inline-flex items-center gap-1.5 bg-purple-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          <Send className="w-4 h-4" />
          {isSending ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
}
