/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  MessageCircle, 
  Wind, 
  Timer, 
  ClipboardList, 
  ShieldAlert, 
  Send, 
  X, 
  ChevronRight,
  Info,
  ExternalLink,
  AlertCircle,
  Paperclip,
  Menu,
  Plus,
  Trash2,
  History
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface Message {
  role: 'user' | 'model';
  text: string;
  type?: 'chat' | 'study-plan' | 'crisis';
  attachment?: {
    data: string;
    mimeType: string;
    name: string;
  };
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

// --- Constants ---
const SYSTEM_INSTRUCTION = `You are "MindEase", an empathetic AI companion for IB MYP students (ages 14-16). 
Your tone is supportive, non-judgmental, and validating. 

OVERWHELM SCALE PROTOCOL:
When a student starts a new session or expresses significant stress, you MUST ask: "On a scale from 1–5, how overwhelmed are you right now?"

BRANCHING LOGIC BASED ON USER RATING:
- If 1–2: Acknowledge their readiness and go directly into a structured Study Plan task breakdown for whatever they are working on.
- If 3–4: Provide brief, warm empathy (e.g., "I hear you, that sounds like a lot") followed by a structured Study Plan task breakdown.
- If 5: IMMEDIATELY initiate "Calm Down" mode. Guide them through a brief breathing exercise (e.g., "Let's take a deep breath together...") or grounding technique. Do NOT suggest productivity tools until they feel more grounded.

STUDY PLAN PROGRESS TRACKING:
1. When generating a study plan, break the task into EXACTLY 3 actionable steps.
2. Display the steps as a checklist using [ ] for incomplete and [✔] for complete.
3. Example format:
   [ ] Step 1: [Task Description]
   [ ] Step 2: [Task Description]
   [ ] Step 3: [Task Description]
4. When the user says "done", "finished", or confirms completion:
   - Update the checklist: change the current step's [ ] to [✔].
   - Show updated progress: e.g., "Step 1 of 3 complete!"
   - Provide brief encouragement (e.g., "Great job! You're making real progress.").
   - Point them toward the next step.

SMART SUGGESTION CHIPS:
If a student expresses confusion, overwhelm, or indecision (e.g., "I don't know where to start", "This is too much", "I'm stuck"), you MUST include 3-4 short suggestion chips at the end of your response.
Format: [SUGGESTIONS: Chip 1, Chip 2, Chip 3]
Suggestions must be actionable and context-aware (e.g., "Break this into steps", "Make a 20-minute plan", "Calm me down first", "Summarize my task").

GENERAL RULES:
1. Acknowledge and validate feelings.
2. Use MYP-specific terminology where relevant (e.g., Criteria A-D, Summatives, Command Terms like 'Analyze' or 'Evaluate').
3. CRISIS PROTOCOL: If you detect high-risk keywords (suicide, self-harm, crisis), immediately provide a supportive message and list contact info for school counselors and international helplines.
Keep responses concise to reduce cognitive load.`;

const CRISIS_KEYWORDS = ['suicide', 'kill myself', 'self-harm', 'end it all', 'hurt myself', 'giving up on life'];

// --- Components ---

export default function App() {
  const [chats, setChats] = useState<Chat[]>(() => {
    const saved = localStorage.getItem('mindease_chats');
    if (saved) return JSON.parse(saved);
    const initialChat: Chat = {
      id: '1',
      title: 'New Chat',
      messages: [{ role: 'model', text: "Hi there. I'm MindEase. I know things can feel overwhelming right now, but I'm here to help. \n\nBefore we start, on a scale from 1–5, how overwhelmed are you right now?" }],
      createdAt: Date.now()
    };
    return [initialChat];
  });
  const [currentChatId, setCurrentChatId] = useState<string>(chats[0].id);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    if (window.innerWidth >= 1024) {
      setIsSidebarOpen(true);
    }
  }, []);
  const [input, setInput] = useState('');
  const [isPrivacyAccepted, setIsPrivacyAccepted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTool, setActiveTool] = useState<'none' | 'timer' | 'breathing' | 'study-plan'>('none');
  const [attachedFile, setAttachedFile] = useState<{ data: string; mimeType: string; name: string } | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

  const currentChat = chats.find(c => c.id === currentChatId) || chats[0];
  const messages = currentChat.messages;

  useEffect(() => {
    localStorage.setItem('mindease_chats', JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const createNewChat = () => {
    const newChat: Chat = {
      id: Date.now().toString(),
      title: 'New Chat',
      messages: [{ role: 'model', text: "Hi there. I'm MindEase. Before we dive in, on a scale from 1–5, how overwhelmed are you right now?" }],
      createdAt: Date.now()
    };
    setChats(prev => [newChat, ...prev]);
    setCurrentChatId(newChat.id);
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
  };

  const deleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (chats.length === 1) return;
    const newChats = chats.filter(c => c.id !== id);
    setChats(newChats);
    if (currentChatId === id) {
      setCurrentChatId(newChats[0].id);
    }
  };

  const updateCurrentChatMessages = (newMessages: Message[]) => {
    setChats(prev => prev.map(c => {
      if (c.id === currentChatId) {
        // Auto-update title if it's still "New Chat" and we have a user message
        let newTitle = c.title;
        if (c.title === 'New Chat' && newMessages.some(m => m.role === 'user')) {
          const firstUserMsg = newMessages.find(m => m.role === 'user')?.text || '';
          newTitle = firstUserMsg.slice(0, 20) + (firstUserMsg.length > 20 ? '...' : '');
        }
        return { ...c, messages: newMessages, title: newTitle };
      }
      return c;
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      const data = base64.split(',')[1];
      setAttachedFile({
        data,
        mimeType: file.type,
        name: file.name
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSendMessage = async (text: string | any = input) => {
    const messageText = typeof text === 'string' ? text : input;
    if (!messageText.trim() && !attachedFile) return;

    const userMessage: Message = { 
      role: 'user', 
      text: messageText,
      attachment: attachedFile || undefined
    };
    
    const updatedMessages = [...messages, userMessage];
    updateCurrentChatMessages(updatedMessages);
    
    setInput('');
    setAttachedFile(null);
    setSuggestions([]);
    setIsLoading(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Crisis Check
    if (CRISIS_KEYWORDS.some(k => messageText.toLowerCase().includes(k))) {
      const crisisMsg: Message = { 
        role: 'model', 
        type: 'crisis',
        text: "I'm really concerned about what you're saying. Please know that you're not alone and there is support available. \n\n**Immediate Help:**\n- Contact your school counselor immediately.\n- International: [Befrienders Worldwide](https://www.befrienders.org/)\n- Crisis Text Line: Text HOME to 741741\n\nPlease reach out to a trusted adult or professional right now." 
      };
      updateCurrentChatMessages([...updatedMessages, crisisMsg]);
      setIsLoading(false);
      return;
    }

    try {
      const contents = updatedMessages.map(m => {
        const parts: any[] = [{ text: m.text }];
        if (m.attachment) {
          parts.push({
            inlineData: {
              data: m.attachment.data,
              mimeType: m.attachment.mimeType
            }
          });
        }
        return { role: m.role, parts };
      });

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
        },
      });

      let aiText = response.text || "I'm here for you, but I'm having a little trouble connecting. Could you try saying that again?";
      
      // Parse suggestions
      const suggestionMatch = aiText.match(/\[SUGGESTIONS: (.*?)\]/);
      if (suggestionMatch) {
        const chips = suggestionMatch[1].split(',').map(s => s.trim());
        setSuggestions(chips);
        aiText = aiText.replace(/\[SUGGESTIONS: .*?\]/, '').trim();
      }

      updateCurrentChatMessages([...updatedMessages, { role: 'model', text: aiText }]);
    } catch (error) {
      console.error("Gemini Error:", error);
      updateCurrentChatMessages([...updatedMessages, { role: 'model', text: "I'm sorry, I'm feeling a bit stuck. Let's take a deep breath together. How else can I support you?" }]);
    } finally {
      setIsLoading(false);
    }
  };

  const startStudyPlan = () => {
    setActiveTool('study-plan');
  };

  const generateStudyPlan = async (task: string, attachment?: { data: string; mimeType: string; name: string } | null) => {
    setIsLoading(true);
    setActiveTool('none');
    const prompt = `Generate a 3-step study plan for this MYP task: "${task}". 
    Use the checklist format:
    [ ] Step 1: ...
    [ ] Step 2: ...
    [ ] Step 3: ...
    Make it actionable and supportive.`;
    
    const userMsg: Message = { 
      role: 'user', 
      text: `Help me plan for: ${task}`,
      attachment: attachment || undefined
    };
    
    const updatedMessages = [...messages, userMsg];
    updateCurrentChatMessages(updatedMessages);

    try {
      const parts: any[] = [{ text: prompt }];
      if (attachment) {
        parts.push({
          inlineData: {
            data: attachment.data,
            mimeType: attachment.mimeType
          }
        });
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: 'user', parts }],
        config: { systemInstruction: SYSTEM_INSTRUCTION }
      });
      updateCurrentChatMessages([...updatedMessages, { role: 'model', text: response.text || "I couldn't generate a plan right now, but let's try breaking it down together." }]);
    } catch (error) {
      updateCurrentChatMessages([...updatedMessages, { role: 'model', text: "I hit a snag. Let's try again in a moment." }]);
    } finally {
      setIsLoading(false);
      setAttachedFile(null);
    }
  };

  return (
    <div className="h-screen bg-brand-bg text-white flex w-full max-w-6xl mx-auto lg:border-x border-white/5 shadow-2xl relative overflow-hidden">
      
      {/* Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ 
          x: isSidebarOpen ? 0 : -280,
          width: isSidebarOpen ? 280 : 0
        }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className={cn(
          "fixed lg:static inset-y-0 left-0 bg-brand-surface border-r border-white/5 z-50 flex flex-col overflow-hidden",
          !isSidebarOpen && "border-none"
        )}
      >
        <div className="p-6 flex flex-col h-full w-[280px]">
          <button 
            onClick={createNewChat}
            className="w-full flex items-center gap-3 bg-brand-accent text-brand-bg font-bold py-3 px-4 rounded-xl hover:brightness-110 transition-all active:scale-95 mb-8"
          >
            <Plus size={20} />
            New Session
          </button>

          <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-4 px-2">Recent Sessions</p>
            {chats.map(chat => (
              <button
                key={chat.id}
                onClick={() => { 
                  setCurrentChatId(chat.id); 
                  if (window.innerWidth < 1024) setIsSidebarOpen(false); 
                }}
                className={cn(
                  "w-full flex items-center justify-between group px-4 py-3 rounded-xl text-sm transition-all",
                  currentChatId === chat.id ? "bg-white/10 text-brand-accent" : "text-white/60 hover:bg-white/5"
                )}
              >
                <div className="flex items-center gap-3 truncate">
                  <MessageCircle size={16} className={currentChatId === chat.id ? "text-brand-accent" : "opacity-40"} />
                  <span className="truncate font-medium">{chat.title}</span>
                </div>
                <div onClick={(e) => deleteChat(chat.id, e)} className="opacity-0 group-hover:opacity-40 hover:!opacity-100 p-1 hover:bg-red-500/20 rounded transition-all">
                  <Trash2 size={14} className="text-red-400" />
                </div>
              </button>
            ))}
          </div>

          <div className="pt-6 border-t border-white/5 mt-auto">
            <div className="flex items-center gap-3 px-2 opacity-40">
              <History size={16} />
              <span className="text-xs font-medium">History Saved</span>
            </div>
          </div>
        </div>
      </motion.aside>

      {/* Main Chat Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-brand-bg relative">
        {/* Privacy Disclaimer Modal */}
        <AnimatePresence>
          {!isPrivacyAccepted && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-md flex items-center justify-center p-6"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="bg-brand-surface p-8 rounded-3xl border border-brand-accent/20 max-w-md w-full shadow-2xl"
              >
                <div className="flex items-center gap-3 mb-6 text-brand-accent">
                  <ShieldAlert size={32} />
                  <h2 className="text-2xl font-semibold">Privacy Notice</h2>
                </div>
                <p className="text-white/70 mb-6 leading-relaxed">
                  MindEase is an AI companion designed to support your wellbeing. 
                  <br /><br />
                  • Conversations are processed via Google Cloud AI.<br />
                  • No personal identifiers (like your name) are stored.<br />
                  • This is not a substitute for professional medical advice or crisis counseling.
                </p>
                <button 
                  onClick={() => setIsPrivacyAccepted(true)}
                  className="w-full bg-brand-accent text-brand-bg font-bold py-4 rounded-2xl hover:brightness-110 transition-all active:scale-95"
                >
                  I Understand & Agree
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <header className="p-4 sm:p-6 border-b border-white/5 flex items-center justify-between bg-brand-bg/80 backdrop-blur-md sticky top-0 z-30">
          <div className="flex items-center gap-3 sm:gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-white/5 rounded-xl transition-colors"
            >
              <Menu size={20} className="sm:w-6 sm:h-6 text-brand-accent" />
            </button>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-brand-accent rounded-full flex items-center justify-center text-brand-bg">
                <MessageCircle size={18} className="sm:w-6 sm:h-6" fill="currentColor" />
              </div>
              <div>
                <h1 className="font-semibold text-base sm:text-lg leading-none">MindEase</h1>
                <span className="text-[10px] sm:text-xs text-brand-accent font-medium uppercase tracking-widest opacity-80">MYP Support Bot</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                const clearedMessages: Message[] = [{ role: 'model', text: "Chat cleared. How are you feeling now?" }];
                updateCurrentChatMessages(clearedMessages);
              }}
              className="p-2 hover:bg-white/5 rounded-full transition-colors"
              title="Clear Chat"
            >
              <X size={18} className="sm:w-5 sm:h-5 opacity-40" />
            </button>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/10 flex items-center justify-center text-white/40 border border-white/5">
              <span className="text-[9px] sm:text-[10px] font-bold">VA</span>
            </div>
          </div>
        </header>

        {/* Chat Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 custom-scrollbar">
          {messages.map((msg, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "flex flex-col max-w-[90%] sm:max-w-[85%]",
                msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
              )}
            >
              <div className={cn(
                "px-3 py-2 sm:px-4 sm:py-3 rounded-2xl text-sm leading-relaxed",
                msg.role === 'user' 
                  ? "bg-brand-accent text-brand-bg font-medium rounded-tr-none" 
                  : "bg-brand-surface text-white/90 rounded-tl-none border border-white/5",
                msg.type === 'crisis' && "border-red-500/50 bg-red-500/10 text-red-200"
              )}>
                {msg.attachment && (
                  <div className="mb-2 p-2 bg-black/20 rounded-lg flex items-center gap-2 border border-white/10">
                    {msg.attachment.mimeType.startsWith('image/') ? (
                      <img 
                        src={`data:${msg.attachment.mimeType};base64,${msg.attachment.data}`} 
                        alt="Attachment" 
                        className="w-12 h-12 object-cover rounded"
                      />
                    ) : (
                      <div className="w-10 h-10 bg-brand-accent/20 rounded flex items-center justify-center text-brand-accent">
                        <ClipboardList size={20} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold truncate opacity-80 uppercase tracking-wider">{msg.attachment.name}</p>
                      <p className="text-[8px] opacity-40 uppercase">{msg.attachment.mimeType}</p>
                    </div>
                  </div>
                )}
                <div className="markdown-body">
                  <Markdown>{msg.text}</Markdown>
                </div>
              </div>
              <span className="text-[10px] opacity-30 mt-1 uppercase tracking-tighter">
                {msg.role === 'user' ? 'You' : 'MindEase'}
              </span>
            </motion.div>
          ))}
          {isLoading && (
            <div className="flex gap-1 p-2">
              <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 bg-brand-accent rounded-full" />
              <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 bg-brand-accent rounded-full" />
              <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 bg-brand-accent rounded-full" />
            </div>
          )}

          {/* Quick Actions Bar (Inside scrollable area) */}
          <div className="pb-2 pt-4 flex flex-wrap gap-2">
            <ActionButton 
              icon={<ClipboardList size={16} />} 
              label="Study Plan" 
              onClick={startStudyPlan}
            />
            <ActionButton 
              icon={<Wind size={16} />} 
              label="Calm Down" 
              onClick={() => setActiveTool('breathing')}
            />
            <ActionButton 
              icon={<Timer size={16} />} 
              label="Focus Timer" 
              onClick={() => setActiveTool('timer')}
            />
          </div>

          <div ref={chatEndRef} />
        </main>

        {/* Input Area */}
        <footer className="p-4 sm:p-6 pt-2 flex justify-center">
          <div className="w-full max-w-3xl">
            <AnimatePresence>
              {suggestions.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="flex flex-wrap gap-2 mb-4 pb-1 justify-center"
                >
                  {suggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(suggestion)}
                      className="whitespace-nowrap bg-white/5 border border-white/10 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-[10px] sm:text-xs font-medium hover:bg-brand-accent hover:text-brand-bg hover:border-brand-accent transition-all active:scale-95"
                    >
                      {suggestion}
                    </button>
                  ))}
                </motion.div>
              )}
              {attachedFile && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="mb-3 p-2 sm:p-3 bg-brand-surface border border-brand-accent/30 rounded-2xl flex items-center gap-3"
                >
                  {attachedFile.mimeType.startsWith('image/') ? (
                    <img 
                      src={`data:${attachedFile.mimeType};base64,${attachedFile.data}`} 
                      alt="Preview" 
                      className="w-8 h-8 sm:w-10 sm:h-10 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-brand-accent/20 rounded-lg flex items-center justify-center text-brand-accent">
                      <ClipboardList size={18} className="sm:w-5 sm:h-5" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] sm:text-xs font-semibold truncate">{attachedFile.name}</p>
                    <p className="text-[8px] sm:text-[10px] opacity-40 uppercase tracking-widest">{attachedFile.mimeType}</p>
                  </div>
                  <button 
                    onClick={() => setAttachedFile(null)}
                    className="p-1.5 sm:p-2 hover:bg-white/5 rounded-full text-white/40 hover:text-white"
                  >
                    <X size={14} className="sm:w-4 sm:h-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            
            <form 
              onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
              className="relative flex items-end gap-2"
            >
              <div className="relative flex-1">
                <textarea 
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder={attachedFile ? "Add a caption..." : "Type your thoughts..."}
                  className="w-full bg-brand-surface border border-white/10 rounded-2xl py-3 sm:py-4 pl-4 sm:pl-5 pr-12 sm:pr-14 text-xs sm:text-sm focus:outline-none focus:border-brand-accent/50 transition-all placeholder:opacity-30 resize-none custom-scrollbar overflow-y-auto"
                />
                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute right-2 bottom-2 sm:bottom-3 p-2 text-white/40 hover:text-brand-accent transition-colors"
                >
                  <Paperclip size={18} className="sm:w-5 sm:h-5" />
                </button>
                <input 
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
              <button 
                type="submit"
                disabled={(!input.trim() && !attachedFile) || isLoading}
                className="mb-1 p-3 sm:p-4 bg-brand-accent text-brand-bg rounded-2xl disabled:opacity-50 disabled:grayscale transition-all hover:scale-105 active:scale-95 flex-shrink-0"
              >
                <Send size={18} className="sm:w-5 sm:h-5" />
              </button>
            </form>
          </div>
        </footer>

        {/* Tool Overlays */}
        <AnimatePresence>
          {activeTool === 'timer' && (
            <ToolOverlay title="Focus Timer" onClose={() => setActiveTool('none')}>
              <PomodoroTimer />
            </ToolOverlay>
          )}
          {activeTool === 'breathing' && (
            <ToolOverlay title="4-7-8 Breathing" onClose={() => setActiveTool('none')}>
              <BreathingExercise />
            </ToolOverlay>
          )}
          {activeTool === 'study-plan' && (
            <ToolOverlay title="Study Plan Generator" onClose={() => setActiveTool('none')}>
              <StudyPlanForm 
                onGenerate={generateStudyPlan} 
                attachedFile={attachedFile}
                setAttachedFile={setAttachedFile}
              />
            </ToolOverlay>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// --- Sub-Components ---

function ActionButton({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="flex items-center gap-2 bg-brand-surface border border-white/5 px-3 py-2 sm:px-4 sm:py-3 rounded-2xl whitespace-nowrap text-[10px] sm:text-xs font-medium hover:bg-white/10 transition-all active:scale-95"
    >
      <span className="text-brand-accent">{icon}</span>
      {label}
    </button>
  );
}

function ToolOverlay({ title, children, onClose }: { title: string, children: React.ReactNode, onClose: () => void }) {
  return (
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-x-0 bottom-0 z-40 bg-brand-surface border-t border-white/10 rounded-t-[24px] sm:rounded-t-[32px] p-6 sm:p-8 shadow-[0_-20px_50px_rgba(0,0,0,0.5)] max-w-2xl mx-auto"
    >
      <div className="flex items-center justify-between mb-6 sm:mb-8">
        <h3 className="text-lg sm:text-xl font-semibold">{title}</h3>
        <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full">
          <X size={20} className="sm:w-6 sm:h-6 opacity-40" />
        </button>
      </div>
      {children}
    </motion.div>
  );
}

function PomodoroTimer() {
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<'focus' | 'break'>('focus');

  useEffect(() => {
    let interval: any;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft(t => t - 1), 1000);
    } else if (timeLeft === 0) {
      setIsActive(false);
      const nextMode = mode === 'focus' ? 'break' : 'focus';
      setMode(nextMode);
      setTimeLeft((nextMode === 'focus' ? focusMinutes : breakMinutes) * 60);
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft, mode, focusMinutes, breakMinutes]);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleReset = () => {
    setIsActive(false);
    setTimeLeft((mode === 'focus' ? focusMinutes : breakMinutes) * 60);
  };

  const updateFocus = (val: number) => {
    const newMin = Math.max(1, focusMinutes + val);
    setFocusMinutes(newMin);
    if (!isActive && mode === 'focus') setTimeLeft(newMin * 60);
  };

  const updateBreak = (val: number) => {
    const newMin = Math.max(1, breakMinutes + val);
    setBreakMinutes(newMin);
    if (!isActive && mode === 'break') setTimeLeft(newMin * 60);
  };

  return (
    <div className="flex flex-col items-center py-2 sm:py-4">
      <div className="flex gap-1 sm:gap-2 mb-4 sm:mb-6 bg-white/5 p-1 rounded-xl">
        <button 
          onClick={() => { setMode('focus'); setTimeLeft(focusMinutes * 60); setIsActive(false); }}
          className={cn("px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-[10px] sm:text-xs font-bold transition-all", mode === 'focus' ? "bg-brand-accent text-brand-bg" : "opacity-40")}
        >
          Focus
        </button>
        <button 
          onClick={() => { setMode('break'); setTimeLeft(breakMinutes * 60); setIsActive(false); }}
          className={cn("px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-[10px] sm:text-xs font-bold transition-all", mode === 'break' ? "bg-brand-accent text-brand-bg" : "opacity-40")}
        >
          Rest
        </button>
      </div>

      <div className="text-5xl sm:text-7xl font-light tracking-tighter mb-6 sm:mb-8 font-mono text-brand-accent">
        {formatTime(timeLeft)}
      </div>

      {!isActive && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8 mb-6 sm:mb-8 w-full">
          <div className="flex flex-col items-center gap-1 sm:gap-2">
            <span className="text-[8px] sm:text-[10px] uppercase tracking-widest opacity-40 font-bold">Focus Time</span>
            <div className="flex items-center gap-3 sm:gap-4">
              <button onClick={() => updateFocus(-1)} className="p-1.5 sm:p-2 hover:bg-white/5 rounded-lg border border-white/10">-</button>
              <span className="text-lg sm:text-xl font-mono">{focusMinutes}</span>
              <button onClick={() => updateFocus(1)} className="p-1.5 sm:p-2 hover:bg-white/5 rounded-lg border border-white/10">+</button>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1 sm:gap-2">
            <span className="text-[8px] sm:text-[10px] uppercase tracking-widest opacity-40 font-bold">Rest Time</span>
            <div className="flex items-center gap-3 sm:gap-4">
              <button onClick={() => updateBreak(-1)} className="p-1.5 sm:p-2 hover:bg-white/5 rounded-lg border border-white/10">-</button>
              <span className="text-lg sm:text-xl font-mono">{breakMinutes}</span>
              <button onClick={() => updateBreak(1)} className="p-1.5 sm:p-2 hover:bg-white/5 rounded-lg border border-white/10">+</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3 sm:gap-4 w-full">
        <button 
          onClick={() => setIsActive(!isActive)}
          className="flex-1 bg-brand-accent text-brand-bg font-bold py-3 sm:py-4 rounded-2xl transition-all active:scale-95 text-sm sm:text-base"
        >
          {isActive ? 'Pause' : `Start ${mode === 'focus' ? 'Focus' : 'Rest'}`}
        </button>
        <button 
          onClick={handleReset}
          className="px-4 sm:px-6 bg-white/5 font-bold py-3 sm:py-4 rounded-2xl transition-all active:scale-95 text-sm sm:text-base"
        >
          Reset
        </button>
      </div>
      <p className="mt-4 sm:mt-6 text-[10px] sm:text-xs opacity-40 text-center">
        {mode === 'focus' ? `${focusMinutes} minutes of focused study.` : `${breakMinutes} minutes of rest.`} You can do this!
      </p>
    </div>
  );
}

function BreathingExercise() {
  const [phase, setPhase] = useState<'Inhale' | 'Hold' | 'Exhale'>('Inhale');
  const [count, setCount] = useState(4);

  useEffect(() => {
    const timer = setInterval(() => {
      setCount(c => {
        if (c > 1) return c - 1;
        
        if (phase === 'Inhale') {
          setPhase('Hold');
          return 7;
        } else if (phase === 'Hold') {
          setPhase('Exhale');
          return 8;
        } else {
          setPhase('Inhale');
          return 4;
        }
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  return (
    <div className="flex flex-col items-center py-4 sm:py-8">
      <motion.div 
        animate={{ 
          scale: phase === 'Inhale' ? 1.5 : phase === 'Hold' ? 1.5 : 1,
          opacity: phase === 'Inhale' ? 1 : phase === 'Hold' ? 0.8 : 0.6
        }}
        transition={{ duration: phase === 'Inhale' ? 4 : phase === 'Hold' ? 7 : 8, ease: "easeInOut" }}
        className="w-24 h-24 sm:w-32 sm:h-32 bg-brand-accent rounded-full flex items-center justify-center mb-8 sm:mb-12 shadow-[0_0_50px_rgba(162,194,224,0.3)]"
      >
        <span className="text-brand-bg font-bold text-2xl sm:text-3xl">{count}</span>
      </motion.div>
      <h4 className="text-xl sm:text-2xl font-medium mb-2">{phase}</h4>
      <p className="text-xs sm:text-sm opacity-40">Follow the circle to ground yourself.</p>
    </div>
  );
}

function StudyPlanForm({ 
  onGenerate, 
  attachedFile, 
  setAttachedFile 
}: { 
  onGenerate: (task: string, attachment?: { data: string; mimeType: string; name: string } | null) => void,
  attachedFile: { data: string; mimeType: string; name: string } | null,
  setAttachedFile: (file: { data: string; mimeType: string; name: string } | null) => void
}) {
  const [task, setTask] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      const data = base64.split(',')[1];
      setAttachedFile({
        data,
        mimeType: file.type,
        name: file.name
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <label className="text-[10px] sm:text-xs font-bold uppercase tracking-widest opacity-40 mb-2 block">What task are you working on?</label>
        <div className="relative">
          <input 
            type="text" 
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="e.g., Math Criterion A Summative"
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 sm:py-4 px-4 sm:px-5 pr-12 sm:pr-14 text-xs sm:text-sm focus:outline-none focus:border-brand-accent/50 transition-all"
          />
          <button 
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-white/40 hover:text-brand-accent transition-colors"
          >
            <Paperclip size={18} className="sm:w-5 sm:h-5" />
          </button>
          <input 
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </div>

      <AnimatePresence>
        {attachedFile && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="p-2 sm:p-3 bg-white/5 border border-brand-accent/30 rounded-2xl flex items-center gap-3"
          >
            {attachedFile.mimeType.startsWith('image/') ? (
              <img 
                src={`data:${attachedFile.mimeType};base64,${attachedFile.data}`} 
                alt="Preview" 
                className="w-8 h-8 sm:w-10 sm:h-10 object-cover rounded-lg"
              />
            ) : (
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-brand-accent/20 rounded-lg flex items-center justify-center text-brand-accent">
                <ClipboardList size={18} className="sm:w-5 sm:h-5" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] sm:text-xs font-semibold truncate">{attachedFile.name}</p>
              <p className="text-[8px] sm:text-[10px] opacity-40 uppercase tracking-widest">{attachedFile.mimeType}</p>
            </div>
            <button 
              onClick={() => setAttachedFile(null)}
              className="p-1.5 sm:p-2 hover:bg-white/5 rounded-full text-white/40 hover:text-white"
            >
              <X size={14} className="sm:w-4 sm:h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <button 
        disabled={!task.trim() && !attachedFile}
        onClick={() => onGenerate(task, attachedFile)}
        className="w-full bg-brand-accent text-brand-bg font-bold py-3 sm:py-4 rounded-2xl disabled:opacity-50 transition-all active:scale-95 text-sm sm:text-base"
      >
        Generate 3-Step Plan
      </button>
    </div>
  );
}
