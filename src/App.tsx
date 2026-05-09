/**
 * Jarvis JCS v2.0 — La Fábrica de Ecosistemas de Arnés
 * Frontend: chat conversacional + tracking de validación de 4 pilares
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { MessageSquare, Mic, Download, Plus, Settings, History, CheckCircle2, Circle, AlertCircle, Send, FileText, Shield, XCircle, Copy, Check, Trash2 } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'reviewer';
  content: string;
  createdAt: number;
  isAudio?: boolean;
}

interface Session {
  id: string;
  status: 'interviewing' | 'designing' | 'generating' | 'validating' | 'complete';
  projectName?: string;
  skillType?: string;
}

interface Skill {
  id: string;
  sessionId: string;
  skillFilename: string;
  skillContent: string;
  validateFilename: string;
  validateContent: string;
  harnessData?: string; // JSON string con el ecosistema completo
  layer1Passed: boolean;
  layer2Passed: boolean;
  validated: boolean;
  reviewRounds: number;
  createdAt: number;
}


const PHASES = ['interviewing', 'designing', 'generating', 'validating'] as const;
const PHASE_LABELS: Record<string, string> = {
  interviewing: 'DESCUBRIR',
  designing: 'DISEÑAR',
  generating: 'GENERAR',
  validating: 'VALIDAR',
  complete: 'COMPLETADO',
};

export default function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [input]);

  const fetchSessions = async () => {
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      setSessions(data);
    } catch (err) {
      console.error('Error fetching sessions:', err);
    }
  };

  const fetchSessionData = async (sid: string) => {
    setLoading(true);
    setError(null);
    try {
      const msgRes = await fetch(`/api/sessions/${sid}/messages`);
      const msgData = await msgRes.json();
      setMessages(msgData);

      const skillRes = await fetch(`/api/skills?sessionId=${sid}`);
      const skillData = await skillRes.json();
      setSkills(skillData);
    } catch (err) {
      console.error('Error fetching session data:', err);
      setError('No se pudo cargar la sesión');
    } finally {
      setLoading(false);
    }
  };

  const deleteSession = async (e: React.MouseEvent, sid: string) => {
    e.stopPropagation();
    if (!confirm('¿Seguro que quieres eliminar este proyecto?')) return;

    try {
      const res = await fetch(`/api/sessions/${sid}`, { method: 'DELETE' });
      if (res.ok) {
        if (currentSession?.id === sid) {
          setCurrentSession(null);
          setMessages([]);
          setSkills([]);
        }
        fetchSessions();
      }
    } catch (err) {
      console.error('Error deleting session:', err);
      setError('No se pudo eliminar la sesión');
    }
  };

  useEffect(() => {
    if (currentSession) {
      fetchSessionData(currentSession.id);
    }
  }, [currentSession]);

  const startRecording = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Tu navegador no soporta el reconocimiento de voz.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsRecording(true);
      setError(null);
    };

    recognition.onresult = async (event: any) => {
      const transcript = event.results[0][0].transcript;
      await processVoiceText(transcript);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsRecording(false);
      setError("Error en el reconocimiento de voz.");
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.start();
  };

  const processVoiceText = async (text: string) => {
    if (!text || typeof text !== 'string' || text.trim() === '') {
      console.warn("Transcripción vacía o inválida omitida.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      
      if (!res.ok) throw new Error("Error procesando voz");
      
      const data = await res.json();
      if (data.text) {
        setInput(data.text);
      }
    } catch (err: any) {
      console.error("Error processing voice:", err);
      setError("Error al procesar el texto de voz.");
    } finally {
      setLoading(false);
    }
  };

  const downloadFile = (content: string, filename: string) => {
    const mimeType = filename.endsWith('.sh')
      ? 'text/x-shellscript'
      : 'text/markdown';
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = async (content: string, msgId: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(msgId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = content;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedId(msgId);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const startNewSession = async () => {
    const res = await fetch('/api/sessions', { method: 'POST' });
    const { id } = await res.json();
    fetchSessions();
    setCurrentSession({ id, status: 'interviewing' });
    setMessages([]);
    setSkills([]);
    setError(null);
  };

  const sendMessage = async () => {
    if (!input.trim() || !currentSession || loading) return;

    const userMsg = input;
    setInput('');
    setLoading(true);
    setError(null);

    // Optimistic update
    const tempId = Math.random().toString();
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: 'user', content: userMsg, createdAt: Date.now() },
    ]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSession.id, message: userMsg }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as any).error || `Error del servidor (${res.status})`);
      }

      const data = await res.json();

      if (data.response) {
        setMessages((prev) => [
          ...prev,
          {
            id: Math.random().toString(),
            role: 'assistant',
            content: data.response,
            createdAt: Date.now(),
          },
        ]);
      }

      // Si se generó una skill, refrescar skills
      if (data.skill) {
        fetchSessionData(currentSession.id);
        fetchSessions(); // actualizar estado de sesión en sidebar
      }
    } catch (err: any) {
      console.error('Chat error:', err);
      setError(err.message || 'Error al comunicarse con Jarvis');
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          role: 'assistant',
          content: `❌ Error: ${err.message || 'No se pudo obtener respuesta de Jarvis. Revisa que el servidor esté corriendo y la API key de DeepSeek esté configurada.'}`,
          createdAt: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Determinar fase activa
  const currentPhaseIndex = currentSession
    ? PHASES.indexOf(currentSession.status as any)
    : -1;

  return (
    <div className="flex h-screen w-full bg-[#E6E6E6] overflow-hidden">
      {/* Sidebar */}
      <div className="w-72 hardware-card m-4 rounded-xl flex flex-col">
        <div className="p-6 border-bottom border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-orange-500 animate-pulse"></div>
            <h1 className="font-mono text-sm font-bold tracking-widest text-white">JCS v2.0</h1>
          </div>

          <button onClick={startNewSession} className="p-2 hover:bg-white/10 rounded-lg transition">
            <Plus size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <div className="status-label mb-4 opacity-50 px-2">Sesiones</div>
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => setCurrentSession(s)}
              className={`w-full group text-left p-3 rounded-lg flex items-center gap-3 transition cursor-pointer ${
                currentSession?.id === s.id
                  ? 'bg-white/10 text-orange-500'
                  : 'hover:bg-white/5 text-gray-400'
              }`}
            >
              <History size={16} />
              <div className="truncate flex-1">
                <div className="text-xs font-mono">{s.projectName || 'Nueva Skill'}</div>
                <div className="text-[10px] opacity-50">{PHASE_LABELS[s.status] || s.status}</div>
              </div>
              <div className="flex items-center gap-2">
                {s.status === 'complete' && <CheckCircle2 size={12} className="text-green-500" />}
                <button
                  onClick={(e) => deleteSession(e, s.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 hover:text-red-500 rounded transition"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
          {sessions.length === 0 && (
            <p className="text-[10px] text-gray-600 text-center p-4">Sin sesiones aún</p>
          )}
        </div>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-2 text-gray-500 text-[10px] font-mono">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            DeepSeek V4 Pro + Flash
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col m-4 ml-0">
        <div className="hardware-card flex-1 rounded-xl flex flex-col relative overflow-hidden">
          {/* Top Bar / Phase Tracker */}
          <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
            <div className="flex gap-6">
              {PHASES.map((phase, i) => {
                const isCompleted = currentPhaseIndex > i || currentSession?.status === 'complete';
                const isActive = currentPhaseIndex === i;
                return (
                  <div key={phase} className="flex items-center gap-2">
                    {isCompleted ? (
                      <CheckCircle2 size={14} className="text-green-500" />
                    ) : isActive ? (
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-orange-500 animate-pulse" />
                    ) : (
                      <Circle size={14} className="text-gray-600" />
                    )}
                    <span
                      className={`text-[10px] font-mono tracking-wider ${
                        isCompleted ? 'text-green-500' : isActive ? 'text-white' : 'text-gray-600'
                      }`}
                    >
                      {PHASE_LABELS[phase]}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-[10px] font-mono text-green-500">SYSTEM READY</span>
              </div>
            </div>
          </div>

          {/* Error banner */}
          {error && (
            <div className="mx-4 mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400 text-xs font-mono">
              <XCircle size={14} />
              {error}
              <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-white">
                ✕
              </button>
            </div>
          )}

          {!currentSession ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
              <div className="w-16 h-16 rounded-2xl bg-orange-500/10 flex items-center justify-center mb-6">
                <MessageSquare className="text-orange-500" size={32} />
              </div>
              <h2 className="text-2xl font-mono mb-2">Bienvenido a JCS</h2>
              <p className="text-gray-500 text-sm max-w-md">
                Inicia una nueva sesión para diseñar instrucciones arquitectónicamente correctas para tus agentes.
              </p>
              <p className="text-gray-600 text-xs max-w-md mt-2 font-mono">
                DeepSeek V4 Pro razona el plan • Flash genera la skill • 2 capas de validación
              </p>
              <button onClick={startNewSession} className="mt-8 jarvis-button flex items-center gap-2">
                <Plus size={18} />
                NUEVO PROYECTO
              </button>
            </div>
          ) : (
            <>
              {/* Messages Area */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
                {messages.map((m) => (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={m.id}
                    className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] p-4 rounded-xl ${
                        m.role === 'user'
                          ? 'chat-bubble-user'
                          : m.role === 'reviewer'
                          ? 'bg-purple-500/5 border-l-3 border-purple-500'
                          : 'chat-bubble-assistant'
                      }`}
                    >
                      <div className="status-label mb-2 opacity-50 flex justify-between items-center">
                        <span>
                          {m.role === 'user' ? 'TÚ' : m.role === 'reviewer' ? 'REVISOR (CAPA 2)' : 'JARVIS'}
                        </span>
                        <span>
                          {new Date(m.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</div>

                      {/* Copy button */}
                      {m.role !== 'user' && (
                        <button
                          onClick={() => copyToClipboard(m.content, m.id)}
                          className="mt-3 flex items-center gap-1.5 text-[10px] font-mono text-gray-500 hover:text-gray-300 transition"
                        >
                          {copiedId === m.id ? (
                            <>
                              <Check size={12} className="text-green-400" />
                              <span className="text-green-400">COPIADO</span>
                            </>
                          ) : (
                            <>
                              <Copy size={12} />
                              <span>COPIAR</span>
                            </>
                          )}
                        </button>
                      )}

                      {/* Skill download section */}
                      {m.role === 'assistant' && (m.content.includes('# SKILL:') || m.content.toLowerCase().includes('plan generado por jcs')) && skills.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-white/10 flex flex-col gap-3">
                          <div className="text-[10px] font-mono text-gray-400 mb-1">ARCHIVOS GENERADOS:</div>
                          {skills.map((skill) => {
                            const harness = skill.harnessData ? JSON.parse(skill.harnessData) : null;
                            return (
                              <div key={skill.id} className="space-y-2">
                                {/* Validation status badge */}
                                <div className="flex items-center gap-2 text-[10px] font-mono">
                                  <span className="flex items-center gap-1">
                                    <Shield size={10} />
                                    Capa 1:
                                  </span>
                                  <span className={skill.layer1Passed ? 'text-green-400' : 'text-red-400'}>
                                    {skill.layer1Passed ? '✅' : '❌'}
                                  </span>
                                  <span className="flex items-center gap-1 ml-2">
                                    <Shield size={10} />
                                    Capa 2:
                                  </span>
                                  <span className={skill.layer2Passed ? 'text-green-400' : 'text-red-400'}>
                                    {skill.layer2Passed ? '✅' : '❌'}
                                  </span>
                                  <span
                                    className={`ml-auto px-2 py-0.5 rounded text-[9px] ${
                                      skill.validated
                                        ? 'bg-green-500/20 text-green-400'
                                        : 'bg-red-500/20 text-red-400'
                                    }`}
                                  >
                                    {skill.validated ? 'VALIDADA' : `RONDAS: ${skill.reviewRounds}/2`}
                                  </span>
                                </div>
                                {/* Download buttons */}
                                <div className="flex gap-2 flex-wrap">
                                  {harness ? (
                                    <>
                                      <button
                                        onClick={() => downloadFile(harness.agentsMd, 'AGENTS.md')}
                                        className="text-[10px] items-center gap-1 font-mono flex p-1.5 px-3 border border-blue-500/50 text-blue-400 hover:bg-blue-500/10 rounded transition"
                                      >
                                        <FileText size={12} /> AGENTS.md
                                      </button>
                                      <button
                                        onClick={() => downloadFile(harness.orquestadorSkill, 'skill-orquestador.md')}
                                        className="text-[10px] items-center gap-1 font-mono flex p-1.5 px-3 border border-orange-500/50 text-orange-500 hover:bg-orange-500/10 rounded transition"
                                      >
                                        <FileText size={12} /> skill-orquestador.md
                                      </button>
                                      <button
                                        onClick={() => downloadFile(harness.validateContent, 'validate.sh')}
                                        className="text-[10px] items-center gap-1 font-mono flex p-1.5 px-3 border border-green-500/50 text-green-500 hover:bg-green-500/10 rounded transition"
                                      >
                                        <Download size={12} /> validate.sh
                                      </button>
                                      <button
                                        onClick={() => downloadFile(harness.progressTemplate, 'progress-template.json')}
                                        className="text-[10px] items-center gap-1 font-mono flex p-1.5 px-3 border border-purple-500/50 text-purple-400 hover:bg-purple-500/10 rounded transition"
                                      >
                                        <Settings size={12} /> progress.json
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        onClick={() => downloadFile(skill.skillContent, skill.skillFilename)}
                                        className="text-[10px] items-center gap-1 font-mono flex p-1.5 px-3 border border-orange-500/50 text-orange-500 hover:bg-orange-500/10 rounded transition"
                                      >
                                        <FileText size={12} /> {skill.skillFilename}
                                      </button>
                                      <button
                                        onClick={() => downloadFile(skill.validateContent, skill.validateFilename)}
                                        className="text-[10px] items-center gap-1 font-mono flex p-1.5 px-3 border border-green-500/50 text-green-500 hover:bg-green-500/10 rounded transition"
                                      >
                                        <Download size={12} /> {skill.validateFilename}
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
                {messages.length === 0 && !loading && (
                  <div className="flex-1 flex items-center justify-center text-gray-600 text-sm font-mono">
                    Jarvis está listo. Describe lo que necesitas construir.
                  </div>
                )}
                {loading && (
                  <div className="flex justify-start">
                    <div className="chat-bubble-assistant p-4 rounded-xl flex items-center gap-3">
                      <div className="flex gap-1">
                        <motion.div
                          animate={{ opacity: [1, 0.4, 1] }}
                          transition={{ repeat: Infinity, duration: 1.5, delay: 0 }}
                          className="w-1.5 h-1.5 rounded-full bg-orange-500"
                        />
                        <motion.div
                          animate={{ opacity: [1, 0.4, 1] }}
                          transition={{ repeat: Infinity, duration: 1.5, delay: 0.2 }}
                          className="w-1.5 h-1.5 rounded-full bg-orange-500"
                        />
                        <motion.div
                          animate={{ opacity: [1, 0.4, 1] }}
                          transition={{ repeat: Infinity, duration: 1.5, delay: 0.4 }}
                          className="w-1.5 h-1.5 rounded-full bg-orange-500"
                        />
                      </div>
                      <span className="text-[10px] font-mono text-gray-400">ANALIZANDO ARQUITECTURA...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Input Area */}
              <div className="p-6 bg-white/[0.01] border-t border-white/10">
                <div className="relative flex items-end gap-3 max-w-4xl mx-auto">
                  <div className="flex-1 relative">
                    <textarea
                      ref={textareaRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage();
                        }
                      }}
                      placeholder="Describe el propósito del agente..."
                      rows={1}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-4 pr-12 focus:outline-none focus:border-orange-500/50 transition resize-none text-sm"
                    />
                    <button 
                      onClick={isRecording ? () => {} : startRecording}
                      disabled={loading}
                      className={`absolute right-3 bottom-3 p-2 rounded-lg transition ${
                        isRecording 
                          ? 'bg-red-500 text-white animate-pulse' 
                          : 'hover:bg-white/10 text-gray-500 hover:text-white'
                      } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <Mic size={18} />
                    </button>
                  </div>
                  <button
                    onClick={sendMessage}
                    disabled={!input.trim() || loading}
                    className={`p-4 rounded-xl transition flex items-center justify-center ${
                      input.trim() && !loading
                        ? 'bg-orange-500 text-white'
                        : 'bg-white/5 text-gray-600'
                    }`}
                  >
                    <Send size={18} />
                  </button>
                </div>
                <div className="mt-3 flex justify-center gap-4">
                  <div className="flex items-center gap-1 opacity-20 hover:opacity-100 transition cursor-help">
                    <AlertCircle size={10} />
                    <span className="text-[9px] font-mono">
                      DeepSeek V4 Pro + Flash • Validación 4 pilares • v2.0
                    </span>

                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
