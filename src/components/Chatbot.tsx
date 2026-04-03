import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, X, Send, Loader2, Minimize2, Maximize2 } from 'lucide-react';
import { chatWithAssistant } from '../services/geminiService';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { pushToDataLayer, markAIUsed } from '../services/tagManager';

interface ChatbotProps {
  lang: 'en' | 'fa';
}

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
}

export const Chatbot: React.FC<ChatbotProps> = ({ lang }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initial greeting
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: '0',
          role: 'model',
          text: lang === 'en' 
            ? "Hello! I am your Historical Assistant. Ask me anything about the history of Greater Iran, its dynasties, or specific events."
            : "سلام! من دستیار تاریخی شما هستم. هر چیزی درباره تاریخ ایران بزرگ، دودمان‌ها یا رویدادهای خاص آن بپرسید."
        }
      ]);
    }
  }, [lang, messages.length]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, isOpen, isMinimized]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    markAIUsed();
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: input.trim()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    pushToDataLayer('chatbot_message_sent', {
      user_message_length: userMessage.text.length
    });

    // Prepare history for API
    const history = messages.map(m => ({ role: m.role, text: m.text }));
    
    const responseText = await chatWithAssistant(history, userMessage.text, lang);

    const aiMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'model',
      text: responseText
    };

    setMessages(prev => [...prev, aiMessage]);
    setIsLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            id="tour-chatbot"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => {
              setIsOpen(true);
              pushToDataLayer('chatbot_opened');
            }}
            className="fixed sm:fixed bottom-6 right-6 p-3 bg-indigo-600 text-white rounded-full shadow-[0_0_20px_rgba(79,70,229,0.5)] hover:bg-indigo-500 hover:scale-105 z-60 chat-fab-mobile"
            style={{
              // On mobile: absolute positioning avoids fixed-context z-index bugs
              // We use a CSS variable for the bottom offset, now includes timeline height clearance (~88px)
              '--bottom-offset': 'calc(var(--sheet-height, 0px) + 88px + 16px + var(--safe-bottom, 0px))',
              transition: 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1), background-color 0.2s, opacity 0.2s',
            }}
            title={lang === 'en' ? 'Historical Assistant' : 'دستیار تاریخی'}
          >
            <MessageSquare className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>
 
      {/* Backdrop for mobile to close on click-out */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 sm:hidden"
          />
        )}
      </AnimatePresence>

      {/* Chat Window */}
      <AnimatePresence>
         {isOpen && (
           <motion.div
             initial={{ opacity: 0, y: 20, scale: 0.95 }}
             animate={{ 
               opacity: 1, 
               y: 0, 
               scale: 1,
               height: isMinimized ? 'auto' : (window.innerWidth < 640 ? '380px' : '500px')
             }}
             exit={{ opacity: 0, y: 20, scale: 0.95 }}
             transition={{ duration: 0.2 }}
             className={`fixed bottom-6 right-6 w-[calc(100vw-32px)] sm:max-w-[400px] liquid-glass-heavy border border-white/10 rounded-[1.5rem] sm:rounded-[2rem] shadow-2xl z-50 flex flex-col overflow-hidden calm-transition chat-fab-mobile ${isMinimized ? '' : 'max-h-[70vh] sm:max-h-[80vh]'}`}
             style={{
               '--bottom-offset': 'calc(var(--sheet-height, 0px) + 88px + 8px + var(--safe-bottom, 0px))',
               transition: 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1), background-color 0.2s, opacity 0.2s',
             } as any}
             dir={lang === 'fa' ? 'rtl' : 'ltr'}
           >
             {/* Header */}
             <div className="flex items-center justify-between p-4 bg-white/5 border-b border-white/10">
               <div className="flex items-center gap-2 text-white">
                 <MessageSquare className="w-5 h-5 text-indigo-400" />
                 <h3 className="font-semibold text-sm">{lang === 'en' ? 'Historical Assistant' : 'دستیار تاریخی'}</h3>
               </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setIsMinimized(!isMinimized)}
                  className="p-2 text-slate-400 hover:bg-white/10 rounded-xl calm-transition"
                >
                  {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
                </button>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-2 text-slate-400 hover:bg-white/10 rounded-xl calm-transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages Area */}
            {!isMinimized && (
              <>
                <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 custom-scrollbar">
                  {messages.map((msg) => (
                    <div 
                      key={msg.id} 
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div 
                        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                          msg.role === 'user' 
                            ? 'bg-indigo-600 text-white rounded-tr-sm shadow-md' 
                            : 'liquid-glass text-slate-200 border border-white/10 rounded-tl-sm shadow-md'
                        }`}
                      >
                        {msg.role === 'user' ? (
                          msg.text
                        ) : (
                          <div className="prose prose-sm prose-invert max-w-none">
                            <Markdown components={{ html: () => null }} remarkPlugins={[remarkGfm]}>{msg.text}</Markdown>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="liquid-glass border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2 shadow-md">
                        <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                        <span className="text-xs text-slate-400">{lang === 'en' ? 'Thinking...' : 'در حال فکر کردن...'}</span>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 bg-white/5 border-t border-white/10">
                  <div className="flex items-end gap-2 bg-black/20 border border-white/10 rounded-2xl p-1.5 focus-within:ring-2 focus-within:ring-indigo-500/50 focus-within:border-indigo-500 calm-transition">
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={lang === 'en' ? 'Ask a question...' : 'سوالی بپرسید...'}
                      className="flex-1 max-h-32 min-h-[40px] bg-transparent text-white placeholder-slate-500 text-sm px-3 py-2.5 resize-none focus:outline-none custom-scrollbar"
                      rows={1}
                    />
                    <button
                      onClick={handleSend}
                      disabled={!input.trim() || isLoading}
                      className="p-3 m-0.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed calm-transition"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
