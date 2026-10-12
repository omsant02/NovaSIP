"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAccount } from "wagmi";
import { useChat } from "@/lib/useChat";
import { ConnectButton } from "@/components/app/ConnectButton";
import ReactMarkdown from "react-markdown";

const INTRO =
  "Hi, I'm Nova. I help you reach a savings goal with yield, and I explain every move I make. Connect your wallet and we can start.";

function Bubble({ role, text }: { role: "user" | "assistant"; text: string }) {
  const mine = role === "user";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          mine
            ? "whitespace-pre-wrap bg-gold text-gold-ink"
            : "border border-line bg-deep text-starlight"
        }`}
      >
        {mine ? (
          text
        ) : (
          <ReactMarkdown
            components={{
              p: ({ children }) => (
                <p className="mb-2 last:mb-0">{children}</p>
              ),
              ul: ({ children }) => (
                <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">
                  {children}
                </ol>
              ),
              strong: ({ children }) => (
                <strong className="font-semibold text-starlight">
                  {children}
                </strong>
              ),
            }}
          >
            {text}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}

export function ChatPanel() {
  const { isConnected } = useAccount();
  const { messages, busy, send, review } = useChat();
  const chips = [
    {
      label: "Add money",
      run: () => send("I'd like to add money to my goal."),
    },
    {
      label: "Why did you do that?",
      run: () => send("Why did you make your last move?"),
    },
    { label: "Review now", run: () => review() },
  ];
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    void send(text);
  }

  return (
    <section className="flex h-[560px] flex-col rounded-2xl border border-line bg-field lg:h-[calc(100vh-9rem)]">
      <header className="border-b border-line px-5 py-4">
        <h2 className="font-display text-lg font-semibold">Ask Nova</h2>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {!isConnected ? (
          <>
            <Bubble role="assistant" text={INTRO} />
            <div className="pt-1">
              <ConnectButton />
            </div>
          </>
        ) : (
          messages.map((m, i) => <Bubble key={i} role={m.role} text={m.text} />)
        )}
        {busy && <p className="text-sm text-dim">Nova is thinking...</p>}
        <div ref={endRef} />
      </div>

      {isConnected && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {chips.map((c) => (
            <button
              key={c.label}
              type="button"
              disabled={busy}
              onClick={() => void c.run()}
              className="rounded-full border border-line px-3 py-1 text-xs text-muted transition-colors hover:border-line-strong hover:text-starlight disabled:opacity-50"
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={onSubmit} className="flex gap-2 border-t border-line p-4">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!isConnected || busy}
          placeholder={
            isConnected
              ? "Tell Nova your goal..."
              : "Connect your wallet to chat"
          }
          className="flex-1 rounded-full border border-line bg-deep px-4 py-2 text-sm text-starlight outline-none focus:border-gold disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!isConnected || busy || !draft.trim()}
          className="rounded-full bg-gold px-4 py-2 text-sm font-medium text-gold-ink disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </section>
  );
}
