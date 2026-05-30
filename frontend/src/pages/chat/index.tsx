import { useState, useEffect, useRef, useCallback } from "react";
import {
  HiArrowLeft, HiPaperAirplane, HiSparkles, HiPlus, HiTrash,
  HiPencil, HiChatBubbleLeft, HiStop, HiXMark,
} from "react-icons/hi2";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/auth-context";
import ChatMarkdown from "@/components/chat/ChatMarkdown";
import api from "@/lib/api";

type ToolExec = { tool: string; params: any; result: any; pending: boolean };
type Message = { id: string; role: "user" | "assistant"; content: string; toolExecs: ToolExec[]; streaming: boolean };

/* ── Tool card badge ── */
function ToolBadge({ tool }: { tool: string }) {
  const map: Record<string, string> = {
    list: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800",
    get: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800",
    create: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
    update: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
    delete: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
    navigate: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800",
  };
  const key = Object.keys(map).find((k) => tool.startsWith(k));
  const cls = key ? map[key] : "bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700";
  const label = key === "list" || key === "get" ? "查询" : key === "create" ? "创建" : key === "update" ? "更新" : key === "delete" ? "删除" : key === "navigate" ? "导航" : "执行";
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${cls}`}>{label}</span>;
}

function ToolIcon({ tool }: { tool: string }) {
  const t = tool.toLowerCase();
  if (t.includes("workspace")) return "📁";
  if (t.includes("project")) return "📋";
  if (t.includes("task") || t.includes("status") || t.includes("priority")) return "✅";
  if (t.includes("sprint")) return "🔄";
  if (t.includes("label")) return "🏷️";
  if (t.includes("member") || t.includes("user")) return "👤";
  if (t.includes("navigate")) return "🔗";
  if (t.includes("organization")) return "🏢";
  if (t.includes("comment")) return "💬";
  if (t.includes("dependency")) return "🔗";
  if (t.includes("time")) return "⏱️";
  if (t.includes("attachment")) return "📎";
  if (t.includes("workflow") || t.includes("status")) return "🔄";
  if (t.includes("setting")) return "⚙️";
  if (t.includes("notification")) return "🔔";
  if (t.includes("invitation")) return "✉️";
  if (t.includes("custom_field")) return "🏗️";
  if (t.includes("recurrence") || t.includes("recurring")) return "🔁";
  if (t.includes("share")) return "🔗";
  if (t.includes("automation")) return "🤖";
  if (t.includes("inbox")) return "📥";
  if (t.includes("activity")) return "📜";
  return "🔧";
}

/* ── Tool execution card ── */
function ToolCard({ t }: { t: ToolExec }) {
  const [open, setOpen] = useState(false);
  const opLabel = t.tool.startsWith("list") || t.tool.startsWith("get") ? "查看" : t.tool.startsWith("create") ? "创建" : t.tool.startsWith("delete") ? "删除" : t.tool.startsWith("update") ? "更新" : "执行";
  const displayName = t.tool.replace(/_/g, " ");

  return (
    <div className="border border-gray-200 dark:border-gray-700/60 rounded-xl overflow-hidden transition-all duration-200 hover:border-gray-300 dark:hover:border-gray-600">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-2.5 flex items-center gap-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
      >
        <span className="text-base shrink-0"><ToolIcon tool={t.tool} /></span>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <ToolBadge tool={t.tool} />
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate font-mono">{displayName}</span>
        </div>
        {t.pending ? (
          <span className="shrink-0 flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            {opLabel}中
          </span>
        ) : (
          <span className="shrink-0 flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            完成
          </span>
        )}
        <svg className={`w-3 h-3 text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 px-3.5 py-3 space-y-3 text-xs">
          <div>
            <div className="font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wider text-[10px]">参数</div>
            <pre className="bg-white dark:bg-gray-950 p-2.5 rounded-lg border border-gray-100 dark:border-gray-800 text-[11px] overflow-x-auto whitespace-pre-wrap break-all font-mono leading-relaxed">{JSON.stringify(t.params, null, 2)}</pre>
          </div>
          <div>
            <div className="font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wider text-[10px]">结果</div>
            <pre className="bg-white dark:bg-gray-950 p-2.5 rounded-lg border border-gray-100 dark:border-gray-800 text-[11px] overflow-x-auto whitespace-pre-wrap break-all font-mono leading-relaxed max-h-60 overflow-y-auto">{JSON.stringify(t.result, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════ */
/*  STANDALONE CHAT PAGE                                          */
/* ═════════════════════════════════════════════════════════════ */

export default function ChatPage() {
  const router = useRouter();
  const { getCurrentUser, isAuthenticated } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [convs, setConvs] = useState<any[]>([]);
  const [histOpen, setHistOpen] = useState(false);
  const [convId, setConvId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Init ── */
  useEffect(() => { const u = getCurrentUser(); if (u) { setUser(u); loadConvs(); } }, [getCurrentUser]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { if (!isAuthenticated()) router.replace("/login"); }, []);
  useEffect(() => { return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);

  const loadConvs = async () => { try { const r = await api.get("/ai-chat/conversations"); setConvs(r.data || []); } catch {} };

  /* ── Poll for message updates ── */
  const startPolling = useCallback((targetConvId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    const interval = setInterval(async () => {
      try {
        const r = await api.get(`/ai-chat/conversations/${targetConvId}`);
        const conv = r.data;
        if (!conv?.messages) return;
        const assistantMsgs = conv.messages.filter((m: any) => m.role === "assistant");
        const lastAssistant = assistantMsgs[assistantMsgs.length - 1];
        if (!lastAssistant || lastAssistant.status === "completed" || lastAssistant.status === "error") {
          if (lastAssistant) {
            const tools: ToolExec[] = Array.isArray(lastAssistant.toolExecutions)
              ? lastAssistant.toolExecutions.map((t: any) => ({ tool: t.tool || "", params: t.params || {}, result: t.result || {}, pending: false }))
              : [];
            const allMsgs = conv.messages.map((m: any) => ({
              id: m.id || "" + Date.now(), role: m.role,
              content: m.content || "",
              toolExecs: Array.isArray(m.toolExecutions) ? m.toolExecutions.map((t: any) => ({ tool: t.tool || "", params: t.params || {}, result: t.result || {}, pending: false })) : [],
              streaming: false,
            }));
            setMessages(allMsgs);
            for (const tt of tools) { if (tt.tool === "navigate" && tt.result?.path) router.push(tt.result.path); }
            loadConvs();
          }
          clearInterval(interval);
          pollRef.current = null;
          setLoading(false);
          return;
        }
        // Still streaming — update messages in real-time
        const tools: ToolExec[] = Array.isArray(lastAssistant.toolExecutions)
          ? lastAssistant.toolExecutions.map((t: any) => ({ tool: t.tool || "", params: t.params || {}, result: t.result || {}, pending: false }))
          : [];
        setMessages((p) => {
          const c = [...p];
          const last = c[c.length - 1];
          if (last?.role === "assistant") c[c.length - 1] = { ...last, content: lastAssistant.content || "", toolExecs: tools, streaming: true };
          else c.push({ id: lastAssistant.id, role: "assistant", content: lastAssistant.content || "", toolExecs: tools, streaming: true });
          return c;
        });
      } catch {}
    }, 2000);
    pollRef.current = interval;
  }, [loadConvs]);

  const pollMessages = useCallback(async (targetConvId: string) => {
    try {
      const r = await api.get(`/ai-chat/conversations/${targetConvId}`);
      const conv = r.data;
      if (!conv?.messages) return true;
      const assistantMsgs = conv.messages.filter((m: any) => m.role === "assistant");
      const lastAssistant = assistantMsgs[assistantMsgs.length - 1];
      if (!lastAssistant) return true;

      const tools: ToolExec[] = Array.isArray(lastAssistant.toolExecutions)
        ? lastAssistant.toolExecutions.map((t: any) => ({ tool: t.tool || "", params: t.params || {}, result: t.result || {}, pending: false }))
        : [];

      if (lastAssistant.status === "completed") {
        setMessages((p) => { const c = [...p]; const last = c[c.length - 1]; if (last?.role === "assistant") c[c.length - 1] = { ...last, content: lastAssistant.content || "Done.", toolExecs: tools, streaming: false }; return c; });
        for (const tt of tools) { if (tt.tool === "navigate" && tt.result?.path) router.push(tt.result.path); }
        loadConvs();
        return false;
      }
      if (lastAssistant.status === "error") {
        setMessages((p) => { const c = [...p]; const last = c[c.length - 1]; if (last?.role === "assistant") c[c.length - 1] = { ...last, content: lastAssistant.content || "Error.", toolExecs: tools, streaming: false }; return c; });
        return false;
      }
      setMessages((p) => { const c = [...p]; const last = c[c.length - 1]; if (last?.role === "assistant") c[c.length - 1] = { ...last, content: "", toolExecs: tools, streaming: true }; return c; });
      return true;
    } catch { return true; }
  }, [loadConvs]);

  /* ── Send message ── */
  const send = async () => {
    const text = input.trim(); if (!text || loading || !user) return;
    const um: Message = { id: "" + Date.now(), role: "user", content: text, toolExecs: [], streaming: false };
    setMessages((p) => [...p, um]); setInput(""); setLoading(true);
    const aid = "" + (Date.now() + 1);
    setMessages((p) => [...p, { id: aid, role: "assistant", content: "", toolExecs: [], streaming: true }]);
    try {
      const sid = sessionId || "s" + Date.now();
      if (!sessionId) setSessionId(sid);
      const body: any = { message: text, sessionId: sid, currentOrganizationId: localStorage.getItem("currentOrganizationId") };
      const r = await api.post("/ai-chat/chat", body);
      const { conversationId: cid, status } = r.data;
      if (status === "processing" && cid) {
        setConvId(cid);
        startPolling(cid);
      } else {
        setMessages((p) => { const c = [...p]; const last = c[c.length - 1]; if (last?.role === "assistant") c[c.length - 1] = { ...last, content: (r.data as any).message || "Error", streaming: false }; return c; });
        setLoading(false);
      }
    } catch (err: any) {
      setMessages((p) => { const c = [...p]; const last = c[c.length - 1]; if (last?.role === "assistant") c[c.length - 1] = { ...last, content: "错误: " + err.message, streaming: false }; return c; });
      setLoading(false);
    }
  };

  /* ── Key handler ── */
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }, [loading, user, input]);

  /* ── Stop polling ── */
  const stop = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } setLoading(false); setMessages((p) => { const c = [...p]; const last = c[c.length - 1]; if (last?.streaming) c[c.length - 1] = { ...last, streaming: false }; return c; }); };

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-[#0f0f0f] flex flex-col overflow-hidden">

      {/* ═══ History sidebar ═══ */}
      {histOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm" onClick={() => setHistOpen(false)} />
          <div className="fixed left-0 top-0 bottom-0 w-72 bg-white dark:bg-[#0f0f0f] border-r border-gray-200 dark:border-gray-800 z-[70] flex flex-col shadow-xl">
            {/* header */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 dark:border-gray-800 shrink-0">
              <span className="font-semibold text-sm text-gray-800 dark:text-gray-200">对话记录</span>
              <button onClick={() => setHistOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors"><HiXMark className="w-4 h-4" /></button>
            </div>
            {/* new chat */}
            <div className="px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 shrink-0">
              <button onClick={() => { setMessages([]); setConvId(""); setSessionId(""); setHistOpen(false); }} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-sm font-medium hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-200 transition-all">
                <HiPlus className="w-4 h-4" />新建对话
              </button>
            </div>
            {/* list */}
            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-0.5">
              {convs.length === 0 && (
                <div className="text-center text-gray-400 dark:text-gray-500 text-xs py-8">暂无对话记录</div>
              )}
              {convs.map((c) => (
                <div
                  key={c.id}
                  onClick={() => {
                    setConvId(c.id); setSessionId(c.sessionId || ""); setHistOpen(false);
                    const msgs = (c.messages || []).map((m: any) => ({
                      id: m.id || "" + Date.now(), role: m.role,
                      content: m.content || "",
                      toolExecs: Array.isArray(m.toolExecutions) ? m.toolExecutions.map((t: any) => ({ tool: t.tool || "", params: t.params || {}, result: t.result || {}, pending: false })) : [],
                      streaming: m.status === "streaming" || m.status === "pending",
                    }));
                    setMessages(msgs);
                    // Auto-resume polling if conversation has streaming/pending messages
                    const hasStreaming = (c.messages || []).some((m: any) => m.status === "streaming" || m.status === "pending");
                    if (hasStreaming) { setLoading(true); startPolling(c.id); }
                  }}
                  className={`group flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${c.id === convId ? "bg-gray-100 dark:bg-gray-800" : "hover:bg-gray-50 dark:hover:bg-gray-800/50"}`}
                >
                  <HiChatBubbleLeft className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                  <div className="flex-1 min-w-0 flex items-center justify-between gap-1">
                    {editing === c.id ? (
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={async () => { if (editTitle.trim()) { try { await api.patch(`/ai-chat/conversations/${c.id}`, { title: editTitle.trim() }); loadConvs(); } catch {} } setEditing(null); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); } if (e.key === "Escape") setEditing(null); }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-0.5 text-xs w-full outline-none focus:ring-2 focus:ring-blue-500/30"
                        autoFocus
                      />
                    ) : (
                      <span className="text-sm truncate text-gray-700 dark:text-gray-300">{c.title || "New Chat"}</span>
                    )}
                    {editing !== c.id && (
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button onClick={(e) => { e.stopPropagation(); setEditing(c.id); setEditTitle(c.title || "New Chat"); }} className="p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 transition-colors"><HiPencil className="w-3 h-3" /></button>
                        <button onClick={async (e) => { e.stopPropagation(); try { await api.delete(`/ai-chat/conversations/${c.id}`); if (convId === c.id) { setConvId(""); setMessages([]); } loadConvs(); } catch {} }} className="p-1 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-colors"><HiTrash className="w-3 h-3" /></button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {/* Clear all */}
            {convs.length > 0 && (
              <div className="shrink-0 px-3 py-2.5 border-t border-gray-100 dark:border-gray-800">
                <button
                  onClick={async () => {
                    if (confirm("确定清空所有对话记录？此操作不可撤销。")) {
                      for (const c of convs) { try { await api.delete(`/ai-chat/conversations/${c.id}`); } catch {} }
                      setConvs([]); setMessages([]); setConvId(""); setSessionId("");
                    }
                  }}
                  className="w-full py-2.5 rounded-xl border border-red-200 dark:border-red-900/50 bg-transparent text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                >
                  清空所有对话
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══ Header ═══ */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-[#0f0f0f]">
        <div className="flex items-center gap-2.5">
          <button onClick={() => router.push("/dashboard")} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors">
            <HiArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-sm">
            <HiSparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">AI 助手</span>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button onClick={() => { setMessages([]); setConvId(""); setSessionId(""); }} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors" title="新对话">
              <HiPlus className="w-4 h-4" />
            </button>
          )}
          <button onClick={async () => { setHistOpen(true); await loadConvs(); }} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors" title="历史记录">
            <HiChatBubbleLeft className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ═══ Messages ═══ */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6 scroll-smooth">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/20">
              <HiSparkles className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-1.5">有什么可以帮你的？</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">我可以管理工作区、项目和任务，也可以查询分析数据</p>
            <div className="grid grid-cols-2 gap-2.5 w-full max-w-sm">
              {[
                { text: "列出所有工作区", icon: "📁" },
                { text: "创建新任务", icon: "✅" },
                { text: "查看高优先级任务", icon: "🔍" },
                { text: "列出我的项目", icon: "📋" },
              ].map((s) => (
                <button key={s.text} onClick={() => setInput(s.text)} className="flex items-center gap-2 text-left px-3.5 py-2.5 text-xs border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 text-gray-600 dark:text-gray-400 transition-all hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm">
                  <span className="text-sm shrink-0">{s.icon}</span>
                  <span className="truncate">{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-2xl rounded-br-lg px-4 py-2.5 shadow-sm">
                  <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">{m.content}</div>
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex gap-3 group">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  <HiSparkles className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="flex-1 min-w-0 space-y-3">
                  {m.toolExecs && m.toolExecs.length > 0 && (
                    <div className="space-y-1.5 mb-3">
                      {m.toolExecs.map((t, i) => <ToolCard key={i} t={t} />)}
                    </div>
                  )}
                  {m.content ? (
                    <div className="text-sm leading-relaxed text-gray-800 dark:text-gray-200 prose prose-sm dark:prose-invert max-w-none break-words">
                      <ChatMarkdown content={m.content} />
                    </div>
                  ) : m.streaming ? (
                    <div className="flex items-center gap-1.5 py-2">
                      <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" />
                      <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.15s]" />
                      <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.3s]" />
                    </div>
                  ) : null}
                  {!m.streaming && !m.content && m.toolExecs.length === 0 && (
                    <div className="text-sm text-gray-400 dark:text-gray-500 italic">无响应内容</div>
                  )}
                </div>
              </div>
            )
          )
        )}
        <div ref={endRef} />
      </div>

      {/* ═══ Input ═══ */}
      <div className="shrink-0 border-t border-gray-100 dark:border-gray-800 p-3.5 bg-white dark:bg-[#0f0f0f]">
        <div className="flex gap-2 items-end bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl px-3 py-2 focus-within:border-emerald-400/50 focus-within:ring-2 focus-within:ring-emerald-500/10 transition-all">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
            onKeyDown={onKeyDown}
            placeholder="发送消息给 AI 助手..."
            disabled={loading || !user}
            rows={1}
            className="flex-1 px-1 py-1.5 bg-transparent border-0 resize-none text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none disabled:opacity-50 text-gray-800 dark:text-gray-200"
            style={{ minHeight: "28px", maxHeight: "120px" }}
          />
          {loading ? (
            <button onClick={stop} className="p-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl shrink-0 transition-all hover:scale-105 active:scale-95 shadow-sm" title="停止">
              <HiStop className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={send} disabled={!input.trim() || loading || !user} className="p-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-xl shrink-0 transition-all disabled:cursor-not-allowed hover:scale-105 active:scale-95 shadow-sm disabled:shadow-none" title="发送">
              <HiPaperAirplane className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center mt-2">AI 助手可能会犯错，请核实重要信息</p>
      </div>
    </div>
  );
}
