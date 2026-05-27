import { useState } from 'react';
import { MessageSquare, X, Send, Loader2, Bot, User, Copy, Check } from 'lucide-react';
import { useBaby } from './BabyContext';
import { askBabyTrackerQuestion } from '../utils/ai';

export default function InsightBox() {
  const { events, allTimeStats } = useBaby();
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [conversation, setConversation] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);

  const handleCopy = (text, idx) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(idx);
      setTimeout(() => {
        setCopiedIndex(null);
      }, 2000);
    }).catch(err => {
      console.error("Failed to copy text: ", err);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!question.trim() || isLoading) return;

    const userMsg = { role: 'user', content: question };
    setConversation(prev => [...prev, userMsg]);
    setQuestion('');
    setIsLoading(true);

    try {
      // Pass the user's question, full events array, and stats to our 2-pronged AI function
      const answer = await askBabyTrackerQuestion(userMsg.content, events, allTimeStats);
      setConversation(prev => [...prev, { role: 'ai', content: answer }]);
    } catch (err) {
      console.error("Failed to get answer:", err);
      setConversation(prev => [...prev, { role: 'ai', content: 'Sorry, I encountered an error analyzing the data.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to safely render markdown-ish text (bolding and basic bullets)
  const renderFormattedText = (text) => {
    return text.split('\n').map((line, i) => {
      // Handle bold text **bold**
      const formattedLine = line.split(/(\*\*.*?\*\*)/g).map((part, j) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={j}>{part.slice(2, -2)}</strong>;
        }
        return part;
      });

      return (
        <p key={i} style={{ margin: '0 0 8px 0', minHeight: line.trim() ? 'auto' : '1em' }}>
          {formattedLine}
        </p>
      );
    });
  };

  // Hidden from UI per user request, but logic kept intact
  return null;
  
  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: 'calc(env(safe-area-inset-bottom) + 16px)',
          right: '24px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
          color: 'white',
          border: 'none',
          boxShadow: '0 4px 12px rgba(167, 139, 250, 0.4)',
          display: isOpen ? 'none' : 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 1000,
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 6px 16px rgba(167, 139, 250, 0.5)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(167, 139, 250, 0.4)';
        }}
      >
        <MessageSquare size={24} />
      </button>

      {/* Floating Chat Window */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: 'calc(env(safe-area-inset-bottom) + 16px)',
            right: '24px',
            width: '90%',
            maxWidth: '380px',
            height: '500px',
            maxHeight: '80vh',
            background: 'var(--bg-card)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderRadius: '20px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 1000,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '16px',
              background: 'linear-gradient(90deg, rgba(167, 139, 250, 0.1), rgba(244, 114, 182, 0.1))',
              borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ background: 'var(--primary)', borderRadius: '50%', padding: '6px', display: 'flex' }}>
                <Bot size={16} color="white" />
              </div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600' }}>Pediatric Insight</h3>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Conversation Area */}
          <div
            style={{
              flex: 1,
              padding: '16px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            {conversation.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '40px', fontSize: '14px' }}>
                <Bot size={40} style={{ opacity: 0.2, margin: '0 auto 12px' }} />
                <p>Ask me anything about your baby's data.</p>
                <p style={{ fontSize: '12px', opacity: 0.7, marginTop: '8px' }}>e.g., "Is 6 wet diapers normal today?"</p>
              </div>
            ) : (
              conversation.map((msg, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '90%',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <div
                    style={{
                      background: msg.role === 'user' ? 'var(--primary)' : 'rgba(255, 255, 255, 0.05)',
                      color: msg.role === 'user' ? 'white' : 'var(--text-main)',
                      padding: '12px 16px',
                      borderRadius: '16px',
                      borderBottomRightRadius: msg.role === 'user' ? '4px' : '16px',
                      borderBottomLeftRadius: msg.role === 'ai' ? '4px' : '16px',
                      fontSize: '14px',
                      lineHeight: '1.5',
                      wordBreak: 'break-word',
                    }}
                  >
                    {msg.role === 'ai' ? renderFormattedText(msg.content) : msg.content}
                  </div>
                  
                  {msg.role === 'ai' && (
                    <button
                      onClick={() => handleCopy(msg.content, idx)}
                      title="Copy message"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: copiedIndex === idx ? 'var(--primary)' : 'var(--text-muted)',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'opacity 0.2s, color 0.2s',
                        outline: 'none',
                        opacity: copiedIndex === idx ? 1.0 : 0.4,
                      }}
                      onMouseOver={(e) => {
                        if (copiedIndex !== idx) e.currentTarget.style.opacity = '0.9';
                      }}
                      onMouseOut={(e) => {
                        if (copiedIndex !== idx) e.currentTarget.style.opacity = '0.4';
                      }}
                    >
                      {copiedIndex === idx ? (
                        <Check size={14} />
                      ) : (
                        <Copy size={14} />
                      )}
                    </button>
                  )}
                </div>
              ))
            )}
            
            {isLoading && (
              <div style={{ alignSelf: 'flex-start', padding: '12px 16px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '16px', borderBottomLeftRadius: '4px' }}>
                <Loader2 size={16} className="animate-spin text-primary" />
              </div>
            )}
          </div>

          {/* Input Area */}
          <div style={{ padding: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', background: 'var(--bg-app)' }}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask about trends, totals..."
                disabled={isLoading}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: '24px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  background: 'rgba(0, 0, 0, 0.2)',
                  color: 'var(--text)',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                disabled={!question.trim() || isLoading}
                style={{
                  background: question.trim() && !isLoading ? 'var(--primary)' : 'rgba(255, 255, 255, 0.1)',
                  color: question.trim() && !isLoading ? 'white' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '44px',
                  height: '44px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: question.trim() && !isLoading ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s',
                }}
              >
                <Send size={18} style={{ transform: 'translateX(-1px)' }} />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
