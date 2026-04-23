/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, Loader2, Trash2, Settings, X, Sparkles, Mail, Key, Zap, Globe, Cpu, Moon, Sun, Image as ImageIcon, BookOpen, MessageSquare, Code, PenTool, BarChart, Brain, Briefcase, Music, CheckCircle, FileText, Paintbrush, Palette, Type, Maximize2, Minimize2, Search, ChevronUp, ChevronDown, Menu, Plus, Edit3, Volume2, Mic, MicOff, Paperclip } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { sendMessageStream, sendOpenAIMessage, sendAnthropicMessage } from './gemini';
import { createTempMail, checkInbox } from './services/mailService';
import { Canvas } from './components/Canvas';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  type?: 'text' | 'tool_result';
  image?: string | null;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  timestamp: number;
}

interface BotPersona {
  name: string;
  role: string;
  tone: string;
  avatar: string;
}

interface SavedKey {
    id: string;
    name: string;
    value: string;
    engine: AISettings['engine'];
}

interface AISettings {
  engine: 'gemini' | 'openai' | 'anthropic' | 'kyma' | 'groq' | 'together' | 'deepseek' | 'openrouter' | 'mistral' | 'custom';
  apiKey: string;
  model: string;
  customURL?: string;
  savedKeys: SavedKey[];
}

interface CurrentMail {
  email: string;
  token: string;
}

interface ThemeSettings {
  accentColor: string;
  accentSoft: string;
  accentDark: string;
  fontFamily: string;
}

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const saved = localStorage.getItem('chat_sessions');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.error('Lỗi khi tải danh sách hội thoại:', e);
      }
    }
    // Tạo session mặc định nếu chưa có
    const defaultSession: ChatSession = {
      id: 'session-' + Date.now(),
      title: 'Cuộc trò chuyện mới',
      messages: [],
      timestamp: Date.now()
    };
    return [defaultSession];
  });

  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    const saved = localStorage.getItem('current_session_id');
    const savedSessions = localStorage.getItem('chat_sessions');
    if (saved && savedSessions) {
      try {
        const sessions = JSON.parse(savedSessions);
        if (sessions.find((s: any) => s.id === saved)) return saved;
      } catch (e) {}
    }
    const savedSessionsParsed = savedSessions ? JSON.parse(savedSessions) : [];
    return savedSessionsParsed[0]?.id || ('session-' + Date.now());
  });

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<{name: string, base64: string}[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isCanvasOpen, setIsCanvasOpen] = useState(false);
  const [activeCanvas, setActiveCanvas] = useState<{title: string, content: string, type: 'text'|'code'|'chart'} | null>(null);
  const [isFocusMode, setIsFocusMode] = useState(false);

  // Derived current messages
  const currentSession = sessions.find(s => s.id === currentSessionId) || sessions[0];
  const messages = currentSession?.messages || [];

  // Helper to update current session messages
  const setMessages = (newMessages: Message[] | ((prev: Message[]) => Message[])) => {
    setSessions(prev => prev.map(s => {
      if (s.id === currentSessionId) {
        const updatedMessages = typeof newMessages === 'function' ? newMessages(s.messages) : newMessages;
        
        // Cập nhật tiêu đề nếu là tin nhắn đầu tiên
        let newTitle = s.title;
        if (s.messages.length === 0 && updatedMessages.length > 0) {
          const firstMsg = updatedMessages.find(m => m.role === 'user')?.content || 'Cuộc trò chuyện mới';
          newTitle = firstMsg.slice(0, 30) + (firstMsg.length > 30 ? '...' : '');
        }

        return { ...s, messages: updatedMessages, title: newTitle, timestamp: Date.now() };
      }
      return s;
    }));
  };

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark';
  });
  const [isPromptLabOpen, setIsPromptLabOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [userMemory, setUserMemory] = useState<string>(() => localStorage.getItem('user_memory') || '');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentSearchIndex, setCurrentSearchIndex] = useState(-1);

  // Auto-scroll management
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  // Deletion confirmation state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Gallery view states
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [currentGalleryIndex, setCurrentGalleryIndex] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);

  // Collective images in current session
  const collectiveImages = messages
    .filter(m => m.image)
    .map(m => m.image as string);

  const openGallery = (imageUrl: string) => {
    const index = collectiveImages.indexOf(imageUrl);
    if (index !== -1) {
      setCurrentGalleryIndex(index);
      setIsGalleryOpen(true);
      setIsZoomed(false);
    }
  };

  const nextImage = () => {
    setCurrentGalleryIndex((prev) => (prev + 1) % collectiveImages.length);
    setIsZoomed(false);
  };

  const prevImage = () => {
    setCurrentGalleryIndex((prev) => (prev - 1 + collectiveImages.length) % collectiveImages.length);
    setIsZoomed(false);
  };

  const [themeSettings, setThemeSettings] = useState<ThemeSettings>(() => {
    const saved = localStorage.getItem('theme_settings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Lỗi khi tải cài đặt chủ đề:', e);
      }
    }
    return {
      accentColor: '#6366f1',
      accentSoft: '#eef2ff',
      accentDark: '#4f46e5',
      fontFamily: 'var(--font-sans)'
    };
  });

  const [persona, setPersona] = useState<BotPersona>(() => {
    const saved = localStorage.getItem('bot_persona');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Lỗi khi tải nhân cách robot:', e);
      }
    }
    return {
      name: 'Trợ Lý Đa Năng',
      role: 'Trợ lý tích hợp đa nền tảng và công cụ',
      tone: 'Chuyên nghiệp, nhanh nhẹn và chính xác',
      avatar: ''
    };
  });
  
  const [aiSettings, setAiSettings] = useState<AISettings>(() => {
    const saved = localStorage.getItem('ai_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Tự động nâng cấp model lên gemini-3.1-pro-preview nếu dùng gemini
        if (parsed.engine === 'gemini' && (parsed.model === 'gpt-4o' || parsed.model === 'gemini-1.5-flash')) {
            parsed.model = 'gemini-3.1-pro-preview';
        }
        return parsed;
      } catch (e) {
        console.error('Lỗi khi tải cấu hình AI:', e);
      }
    }
    return {
      engine: 'gemini',
      apiKey: '',
      model: 'gemini-3.1-pro-preview',
      customURL: '',
      savedKeys: []
    };
  });

  // Save changes to localStorage
  useEffect(() => {
    localStorage.setItem('chat_sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem('current_session_id', currentSessionId || '');
  }, [currentSessionId]);

  useEffect(() => {
    localStorage.setItem('ai_settings', JSON.stringify(aiSettings));
  }, [aiSettings]);

  useEffect(() => {
    localStorage.setItem('bot_persona', JSON.stringify(persona));
  }, [persona]);

  useEffect(() => {
    localStorage.setItem('theme_settings', JSON.stringify(themeSettings));
    
    // Apply CSS variables to root
    const root = document.documentElement;
    root.style.setProperty('--accent-color', themeSettings.accentColor);
    root.style.setProperty('--accent-color-soft', themeSettings.accentSoft);
    root.style.setProperty('--accent-color-dark', themeSettings.accentDark);
    root.style.setProperty('--font-family', themeSettings.fontFamily);
  }, [themeSettings]);
  
  const promptLibrary = [
    // Lập trình
    { category: 'LẬP TRÌNH', title: 'Tạo Function', content: 'Hãy viết một hàm [Tên hàm] bằng [Ngôn ngữ] thực hiện công việc [Mô tả công việc]. Yêu cầu code ngắn gọn, có chú thích chi tiết.', icon: <Code size={14} /> },
    { category: 'LẬP TRÌNH', title: 'Giải thích Code', content: 'Hãy giải thích cách hoạt động của đoạn code sau một cách dễ hiểu nhất cho người mới bắt đầu: \n\n```\n[Dán Code]\n```', icon: <Cpu size={14} /> },
    { category: 'LẬP TRÌNH', title: 'Viết Unit Test', content: 'Hãy tạo các trường hợp kiểm thử (unit tests) cho hàm sau đây bằng thư viện [Tên thư viện]: \n\n```\n[Dán Code]\n```', icon: <CheckCircle size={14} /> },
    { category: 'LẬP TRÌNH', title: 'Fix Bug', content: 'Tôi có đoạn code sau đang gặp lỗi [Mô tả lỗi]. Hãy giúp tôi tìm nguyên nhân và cách khắc phục: \n\n```\n[Dán Code]\n```', icon: <Cpu size={14} /> },

    // Sáng tạo & Nội dung
    { category: 'SÁNG TẠO', title: 'Viết Story', content: 'Hãy viết một câu truyện ngắn thuộc thể loại [Thể loại] lấy bối cảnh ở [Bối cảnh]. Nhân vật chính là [Tên/Mô tả].', icon: <PenTool size={14} /> },
    { category: 'SÁNG TẠO', title: 'Lời Bài Hát', content: 'Hãy viết lời một bài hát về chủ đề [Chủ đề] với phong cách [Pop/Rock/Rap...]. Bao gồm Verse 1, Chorus và Bridge.', icon: <Music size={14} /> },
    { category: 'SÁNG TẠO', title: 'Viết Content SEO', content: 'Hãy soạn một bài viết chuyên sâu về chủ đề [Chủ đề] dành cho đối tượng [Đối tượng], độ dài khoảng 1000 từ, chuẩn SEO.', icon: <MessageSquare size={14} /> },

    // Phân tích
    { category: 'PHÂN TÍCH', title: 'Phân tích Data', content: 'Dựa trên tập dữ liệu sau, hãy chỉ ra 3 xu hướng quan trọng nhất và đưa ra nhận xét: \n\n[Dán dữ liệu/Số liệu]', icon: <BarChart size={14} /> },
    { category: 'PHÂN TÍCH', title: 'Tóm tắt Insight', content: 'Hãy phân tích nội dung sau và rút ra những "insight" giá trị nhất cho chiến dịch marketing: \n\n[Nội dung]', icon: <Zap size={14} /> },
    { category: 'PHÂN TÍCH', title: 'Tóm tắt bài', content: 'Hãy tóm tắt nội dung chính của bài viết sau một cách ngắn gọn, súc tích dưới dạng các gạch đầu dòng: \n\n[Dán nội dung]', icon: <BookOpen size={14} /> },

    // Công việc & Học tập
    { category: 'CÔNG VIỆC', title: 'Soạn Email', content: 'Hãy soạn một email chuyên nghiệp gửi cho [Đối tượng] để [Mục đích email]. Ngôn ngữ cần [Trang trọng/Thân thiện].', icon: <Mail size={14} /> },
    { category: 'CÔNG VIỆC', title: 'Tóm tắt Họp', content: 'Dưới đây là biên bản cuộc họp, hãy tóm tắt các hành động (Action Items) cần thực hiện và người chịu trách nhiệm: \n\n[Nội dung]', icon: <Briefcase size={14} /> },
    { category: 'HỌC TẬP', title: 'Giải thích đơn giản', content: 'Hãy giải thích khái niệm [Tên khái niệm] cho một đứa trẻ 5 tuổi sao cho thật dễ hiểu và sinh động.', icon: <Brain size={14} /> },
    { category: 'HỌC TẬP', title: 'Lộ trình học', content: 'Hãy thiết kế một lộ trình học từ cơ bản đến nâng cao cho kỹ năng [Tên kỹ năng] trong vòng 30 ngày.', icon: <FileText size={14} /> },
  ];

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);
  const [currentMail, setCurrentMail] = useState<CurrentMail | null>(null);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;

      switch (e.key.toLowerCase()) {
        case 's':
          e.preventDefault();
          setIsSettingsOpen(prev => !prev);
          break;
        case 'd':
          e.preventDefault();
          clearChat();
          break;
        case 'f':
          e.preventDefault();
          setIsFocusMode(prev => !prev);
          break;
        case 'k':
          e.preventDefault();
          setIsSearchOpen(prev => !prev);
          break;
        case 'b':
          e.preventDefault();
          setIsSidebarOpen(prev => !prev);
          break;
        case 'escape':
          if (isGalleryOpen) setIsGalleryOpen(false);
          break;
      }
    };

    const handleKeyNavigation = (e: KeyboardEvent) => {
      if (!isGalleryOpen) return;
      if (e.key === 'ArrowRight') nextImage();
      if (e.key === 'ArrowLeft') prevImage();
      if (e.key === 'Escape') setIsGalleryOpen(false);
    };

    window.addEventListener('keydown', handleGlobalShortcuts);
    window.addEventListener('keydown', handleKeyNavigation);
    return () => {
      window.removeEventListener('keydown', handleGlobalShortcuts);
      window.removeEventListener('keydown', handleKeyNavigation);
    };
  }, [isGalleryOpen, collectiveImages.length]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShouldAutoScroll(isAtBottom);
  };

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'vi-VN';
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        setAttachedFiles(prev => [...prev, { name: file.name, base64: base64.split(',')[1] }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const toggleRecording = () => {
    if (!isRecording) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = 'vi-VN';
        recognition.onresult = (event: any) => {
          const text = event.results[0][0].transcript;
          setInput(prev => prev + text);
          setIsRecording(false);
        };
        recognition.onend = () => setIsRecording(false);
        recognition.start();
        setIsRecording(true);
      } else {
        alert('Trình duyệt của bạn không hỗ trợ nhận dạng giọng nói.');
      }
    } else {
      setIsRecording(false);
    }
  };

  const scrollToBottom = (force = false) => {
    if (force || shouldAutoScroll) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  };

  useEffect(() => {
    // Scroll to bottom when messages change or content of the streaming message changes
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, isLoading]);

  const systemPrompt = `Bạn là ${persona.name}. 
Vai trò: ${persona.role}. 
Tính cách: ${persona.tone}.

THÔNG TIN VỀ NGƯỜI DÙNG (MEMORY): 
${userMemory || 'Chưa có thông tin ghi nhớ nào.'}

HƯỚNG DẪN QUAN TRỌNG:
1. Bạn có khả năng sử dụng công cụ để tạo Email tạm thời qua Mail.tm.
2. NỀN TẢNG CANVAS: Nếu bạn viết code dài (>30 dòng), tạo tài liệu chi tiết, hoặc viết kịch bản phức tạp, hãy đặt nội dung đó trong một block code đặc biệt dạng: \`\`\`canvas [Tiêu đề]\n[Nội dung chi tiết]\n\`\`\`. Nội dung này sẽ được hiển thị ở bảng điều khiển phụ (Canvas) bên phải màn hình để người dùng dễ theo dõi.
3. GHI NHỚ (MEMORY): Nếu người dùng chia sẻ thông tin cá nhân quan trọng (tên, sở thích, thông tin công việc...), hãy phản hồi bắt đầu bằng "Đã ghi nhớ: [Thông tin]" để hệ thống tự động cập nhật vào bộ nhớ lâu dài của bạn.
4. TÌM KIẾM WEB: Bạn có khả năng truy cập internet nếu được hỏi về các thông tin thời sự mới nhất thông qua Google Search Integration.`;

  const quickCreateMail = async () => {
    setIsLoading(true);
    setMessages(prev => [...prev, { id: 'q-'+Date.now(), role: 'user', content: 'Tạo nhanh mail tạm thời', timestamp: Date.now() }]);
    try {
      const mailData = await createTempMail();
      setCurrentMail({ email: mailData.email, token: mailData.token });
      setMessages(prev => [...prev, { 
        id: 'a-'+Date.now(), 
        role: 'assistant', 
        content: `✅ **Đã tạo thành công!**\n\n- **Email:** \`${mailData.email}\`\n- **Password:** \`${mailData.password}\`\n\nBạn có thể nhấn nút "Kiểm tra thư" bên dưới để xem inbox.`, 
        timestamp: Date.now() 
      }]);
    } catch (error) {
      setMessages(prev => [...prev, { id: 'e-'+Date.now(), role: 'assistant', content: '❌ Lỗi khi gọi API Mail.tm. Vui lòng thử lại.', timestamp: Date.now() }]);
    }
    setIsLoading(false);
  };

  const quickCheckInbox = async () => {
    if (!currentMail) {
      alert('Vui lòng tạo mail trước!');
      return;
    }
    setIsLoading(true);
    setMessages(prev => [...prev, { id: 'q-'+Date.now(), role: 'user', content: `Kiểm tra inbox cho ${currentMail.email}`, timestamp: Date.now() }]);
    try {
      const inbox = await checkInbox(currentMail.token);
      let content = `📫 **Kết quả hộp thư (${currentMail.email}):**\n\n`;
      if (inbox.length === 0) {
        content += "*Chưa có thư mới nào.*";
      } else {
        content += inbox.map((m: any) => `--- \n**Từ:** ${m.from}\n**Chủ đề:** ${m.subject}\n**Nội dung:** ${m.body}`).join('\n\n');
      }
      setMessages(prev => [...prev, { id: 'a-'+Date.now(), role: 'assistant', content, timestamp: Date.now() }]);
    } catch (error) {
      setMessages(prev => [...prev, { id: 'e-'+Date.now(), role: 'assistant', content: '❌ Lỗi khi kiểm tra inbox.', timestamp: Date.now() }]);
    }
    setIsLoading(false);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now(),
      image: selectedImage
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    const currentImage = selectedImage;
    
    setInput('');
    setSelectedImage(null);
    setIsLoading(true);

    try {
      const history = messages.filter(m => m.role !== 'system').map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        parts: msg.content
      }));

      const assistantMessageId = (Date.now() + 1).toString();
      let assistantContent = '';

      setMessages(prev => [...prev, {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      }]);

      if (aiSettings.engine === 'openai' && aiSettings.apiKey) {
        const stream = await sendOpenAIMessage(aiSettings.apiKey, aiSettings.model, history, input);
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content || '';
          assistantContent += text;
          setMessages(prev => prev.map(msg => 
            msg.id === assistantMessageId ? { ...msg, content: assistantContent } : msg
          ));
        }
      } else if (aiSettings.engine === 'anthropic' && aiSettings.apiKey) {
        const stream = await sendAnthropicMessage(aiSettings.apiKey, aiSettings.model, history, input, systemPrompt);
        for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta' && 'text' in chunk.delta) {
                assistantContent += (chunk.delta as any).text;
                setMessages(prev => prev.map(msg => 
                    msg.id === assistantMessageId ? { ...msg, content: assistantContent } : msg
                ));
            }
        }
      } else if (aiSettings.engine === 'custom' && aiSettings.apiKey && aiSettings.customURL) {
        const stream = await sendOpenAIMessage(aiSettings.apiKey, aiSettings.model, history, input, aiSettings.customURL);
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content || '';
          assistantContent += text;
          setMessages(prev => prev.map(msg => 
            msg.id === assistantMessageId ? { ...msg, content: assistantContent } : msg
          ));
        }
      } else if (aiSettings.engine === 'kyma' && aiSettings.apiKey) {
        const stream = await sendOpenAIMessage(aiSettings.apiKey, aiSettings.model, history, input, 'https://kymaapi.com/v1');
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content || '';
          assistantContent += text;
          setMessages(prev => prev.map(msg => 
            msg.id === assistantMessageId ? { ...msg, content: assistantContent } : msg
          ));
        }
      } else if (aiSettings.engine === 'groq' && aiSettings.apiKey) {
        const stream = await sendOpenAIMessage(aiSettings.apiKey, aiSettings.model, history, input, 'https://api.groq.com/openai/v1');
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content || '';
          assistantContent += text;
          setMessages(prev => prev.map(msg => 
            msg.id === assistantMessageId ? { ...msg, content: assistantContent } : msg
          ));
        }
      } else if (aiSettings.engine === 'together' && aiSettings.apiKey) {
        const stream = await sendOpenAIMessage(aiSettings.apiKey, aiSettings.model, history, input, 'https://api.together.xyz/v1');
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content || '';
          assistantContent += text;
          setMessages(prev => prev.map(msg => 
            msg.id === assistantMessageId ? { ...msg, content: assistantContent } : msg
          ));
        }
      } else if (aiSettings.engine === 'deepseek' && aiSettings.apiKey) {
        const stream = await sendOpenAIMessage(aiSettings.apiKey, aiSettings.model, history, input, 'https://api.deepseek.com');
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content || '';
          assistantContent += text;
          setMessages(prev => prev.map(msg => 
            msg.id === assistantMessageId ? { ...msg, content: assistantContent } : msg
          ));
        }
      } else if (aiSettings.engine === 'openrouter' && aiSettings.apiKey) {
        const stream = await sendOpenAIMessage(aiSettings.apiKey, aiSettings.model, history, input, 'https://openrouter.ai/api/v1');
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content || '';
          assistantContent += text;
          setMessages(prev => prev.map(msg => 
            msg.id === assistantMessageId ? { ...msg, content: assistantContent } : msg
          ));
        }
      } else if (aiSettings.engine === 'mistral' && aiSettings.apiKey) {
        const stream = await sendOpenAIMessage(aiSettings.apiKey, aiSettings.model, history, input, 'https://api.mistral.ai/v1');
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content || '';
          assistantContent += text;
          setMessages(prev => prev.map(msg => 
            msg.id === assistantMessageId ? { ...msg, content: assistantContent } : msg
          ));
        }
      } else {
        // Mặc định Gemini qua Proxy
        const response = await fetch('/api/ai/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            history, 
            message: currentInput + (attachedFiles.length > 0 ? "\n\n[Dữ liệu tài liệu đính kèm]:\n" + attachedFiles.map(f => `--- File: ${f.name} ---\n${f.base64}`).join('\n') : ""), 
            systemInstruction: systemPrompt,
            imageBase64: currentImage,
            apiKey: aiSettings.apiKey,
            model: aiSettings.model
          })
        });
        
        // Reset attached files after sending
        setAttachedFiles([]);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Lỗi kết nối Gemini (Có thể do API Key chưa đúng)');
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader!.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
               const data = JSON.parse(line.slice(6));
               
               // Xử lý Tool Call từ proxy (nếu có)
               if (data.tool_calls) {
                  for (const tool of data.tool_calls) {
                    if (tool.name === 'create_temp_email') {
                       setMessages(prev => [...prev, { id: 'sys-'+Date.now(), role: 'system', content: '⏳ Đang tạo mail tại Mail.tm...', timestamp: Date.now() }]);
                       const mailData = await createTempMail();
                       setCurrentMail({ email: mailData.email, token: mailData.token });
                       assistantContent += `\n\n✅ **Email mới:** \`${mailData.email}\`\nPass: \`${mailData.password}\``;
                    } else if (tool.name === 'check_temp_email_inbox') {
                       setMessages(prev => [...prev, { id: 'sys-'+Date.now(), role: 'system', content: '⏳ Đang check inbox...', timestamp: Date.now() }]);
                       const inbox = await checkInbox(currentMail?.token || '');
                       assistantContent += `\n\n📫 **Inbox:**\n${inbox.length > 0 ? inbox.map((m: any) => `- **Từ:** ${m.from}\n  **Chủ đề:** ${m.subject}`).join('\n') : '*Hộp thư trống*'}`;
                    }
                  }
               }

               if (data.text) {
                 assistantContent += data.text;

                 // Tự động phát hiện Canvas (Artifacts)
                 const canvasRegex = /```(?:canvas|artifact)\s*([^\n]*)\n([\s\S]*?)```/g;
                 let match;
                 while ((match = canvasRegex.exec(assistantContent)) !== null) {
                     const title = match[1]?.trim() || 'Tài liệu mới';
                     const content = match[2];
                     if (!activeCanvas || activeCanvas.content !== content) {
                         setActiveCanvas({ title, content, type: 'text' });
                         setIsCanvasOpen(true);
                     }
                 }

                 // Tự động cập nhật Memory
                 if (data.text.includes('Đã ghi nhớ:')) {
                     const memMatch = data.text.match(/Đã ghi nhớ:\s*(.*)/);
                     if (memMatch && memMatch[1]) {
                         const newInfo = memMatch[1].trim();
                         setUserMemory(prev => {
                             const updated = (prev ? prev + '\n' : '') + '- ' + newInfo;
                             localStorage.setItem('user_memory', updated);
                             return updated;
                         });
                     }
                 }
               }
               
               setMessages(prev => prev.map(msg => 
                 msg.id === assistantMessageId ? { ...msg, content: assistantContent } : msg
               ));
            }
          }
        }
      }
    } catch (error: any) {
      console.error('Chat error:', error);
      let errorMessage = error.message || 'Không thể kết nối đến máy chủ AI.';
      
      if (errorMessage.includes('401') || errorMessage.includes('API Key')) {
        errorMessage = "🔑 AI chưa được kích hoạt: " + errorMessage;
      }

      setMessages(prev => [...prev, {
        id: (Date.now() + 2).toString(),
        role: 'assistant',
        content: `❌ **Thông báo từ hệ thống:**\n\n${errorMessage}\n\n*Hướng dẫn: Vui lòng vào phần **Cài đặt** (Ctrl+S) để nhập API Key hoặc kiểm tra cấu hình Secrets trong AI Studio.*`,
        timestamp: Date.now(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, messages: [], title: 'Cuộc trò chuyện mới' } : s));
  };

  const modelPresets = {
    gemini: 'gemini-2.0-flash-exp',
    openai: 'gpt-4o',
    anthropic: 'claude-3-5-sonnet-latest',
    kyma: 'gpt-oss-120b',
    groq: 'llama-3.3-70b-versatile',
    together: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    deepseek: 'deepseek-chat',
    openrouter: 'google/gemini-2.0-flash-001',
    mistral: 'pixtral-large-latest',
    custom: 'deepseek-chat'
  };

  const modelOptions: Record<string, string[]> = {
    gemini: ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro'],
    openai: ['gpt-4o', 'gpt-4o-mini', 'o1-preview', 'o1-mini', 'gpt-4-turbo'],
    anthropic: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-20240229'],
    groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
    deepseek: ['deepseek-chat', 'deepseek-reasoner'],
    together: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'mistralai/Mixtral-8x7B-Instruct-v0.1'],
    openrouter: ['google/gemini-2.0-flash-001', 'anthropic/claude-3.5-sonnet', 'openai/gpt-4o-2024-11-20'],
    mistral: ['pixtral-large-latest', 'mistral-large-latest', 'codestral-latest'],
    kyma: ['gpt-oss-120b', 'gemma-4-31b', 'deepseek-v3', 'kyma-pro-v1']
  };

  const applyEngine = (engine: AISettings['engine']) => {
    const presetModel = modelPresets[engine as keyof typeof modelPresets] || 'gemini-1.5-flash';
    // Tìm key gần nhất của engine này trong danh sách đã lưu (nếu có)
    const matchingKey = aiSettings.savedKeys.find(k => k.engine === engine)?.value || '';
    
    setAiSettings({
        ...aiSettings,
        engine,
        model: presetModel,
        apiKey: matchingKey
    });
  };

  const addNewKey = (name: string, value: string, engine: AISettings['engine']) => {
    if (!value) return;
    const newKey: SavedKey = {
        id: Date.now().toString(),
        name: name || `${engine.toUpperCase()} Key`,
        value: value,
        engine: engine
    };
    setAiSettings(prev => ({
        ...prev,
        savedKeys: [newKey, ...prev.savedKeys],
        apiKey: value,
        engine: engine
    }));
  };

  const deleteKey = (id: string) => {
    setAiSettings(prev => ({
        ...prev,
        savedKeys: prev.savedKeys.filter(k => k.id !== id)
    }));
  };

  const bulkAddKeys = (text: string, defaultEngine: AISettings['engine']) => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5);
    const newSavedKeys: SavedKey[] = [...aiSettings.savedKeys];
    
    lines.forEach(line => {
        // Hỗ trợ định dạng: "Tên | Key" hoặc chỉ "Key"
        let name = '';
        let value = '';
        
        if (line.includes('|')) {
            const parts = line.split('|').map(p => p.trim());
            name = parts[0];
            value = parts[1];
        } else {
            value = line;
        }

        if (value && !newSavedKeys.find(k => k.value === value)) {
            newSavedKeys.unshift({
                id: Math.random().toString(36).substring(7) + Date.now(),
                name: name || `${defaultEngine.toUpperCase()} Key`,
                value: value,
                engine: defaultEngine
            });
        }
    });

    setAiSettings(prev => ({
        ...prev,
        savedKeys: newSavedKeys,
        apiKey: newSavedKeys[0]?.value || prev.apiKey,
        engine: newSavedKeys[0]?.engine || prev.engine
    }));
  };

  const [isBulkMode, setIsBulkMode] = useState(false);
  const [isCustomColorMode, setIsCustomColorMode] = useState(false);

  const filteredMessagesIndices = messages
    .map((m, i) => m.content.toLowerCase().includes(searchTerm.toLowerCase()) && searchTerm !== '' ? i : -1)
    .filter(i => i !== -1);

  const scrollToMatch = (index: number) => {
    const messageId = messages[index].id;
    const element = document.getElementById(`message-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const goToNextMatch = () => {
    if (filteredMessagesIndices.length === 0) return;
    const nextIndex = (currentSearchIndex + 1) % filteredMessagesIndices.length;
    setCurrentSearchIndex(nextIndex);
    scrollToMatch(filteredMessagesIndices[nextIndex]);
  };

  const goToPrevMatch = () => {
    if (filteredMessagesIndices.length === 0) return;
    const prevIndex = (currentSearchIndex - 1 + filteredMessagesIndices.length) % filteredMessagesIndices.length;
    setCurrentSearchIndex(prevIndex);
    scrollToMatch(filteredMessagesIndices[prevIndex]);
  };

  const createNewSession = () => {
    const newSession: ChatSession = {
      id: 'session-' + Date.now(),
      title: 'Cuộc trò chuyện mới',
      messages: [],
      timestamp: Date.now()
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setIsSidebarOpen(false);
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Nếu chưa ở trạng thái chờ xác nhận, thì chuyển sang trạng thái chờ
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      // Tự động hủy trạng thái chờ sau 3 giây
      setTimeout(() => setConfirmDeleteId(prev => prev === id ? null : prev), 3000);
      return;
    }

    // Nếu đã ở trạng thái chờ xóa, thì thực thi xóa thật
    setConfirmDeleteId(null);

    if (sessions.length <= 1) {
      setSessions(prev => prev.map(s => s.id === id ? { ...s, messages: [], title: 'Cuộc trò chuyện mới' } : s));
      return;
    }

    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== id);
      if (currentSessionId === id && filtered.length > 0) {
        setCurrentSessionId(filtered[0].id);
      }
      return filtered;
    });
  };

  const switchSession = (id: string) => {
    setCurrentSessionId(id);
    setIsSidebarOpen(false);
  };

  return (
    <div className={`flex flex-col h-screen max-w-6xl mx-auto border-x border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0a0a0b] shadow-sm overflow-hidden relative transition-colors duration-200`} id="chat-container">
      {/* Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 bottom-0 w-[280px] bg-white dark:bg-[#0f0f10] z-[70] border-r border-neutral-200 dark:border-neutral-800 shadow-2xl flex flex-col"
            >
              <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
                <h2 className="font-bold dark:text-white flex items-center gap-2">
                    <MessageSquare size={18} className="text-accent" /> Lịch sử Chat
                </h2>
                <button 
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg text-neutral-400"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-3">
                <button 
                  onClick={createNewSession}
                  className="w-full py-2.5 px-4 bg-accent text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-accent-dark transition-all shadow-lg active:scale-95"
                >
                  <Plus size={18} /> Chat Mới
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                {sessions.map(session => (
                    <div 
                      key={session.id}
                      onClick={() => switchSession(session.id)}
                      className={`group relative p-3 rounded-xl border transition-all cursor-pointer ${
                        currentSessionId === session.id 
                        ? 'bg-accent-soft dark:bg-accent-dark/20 border-accent/30 ring-1 ring-accent-soft text-accent' 
                        : 'bg-transparent border-transparent hover:bg-neutral-50 dark:hover:bg-neutral-900 text-neutral-600 dark:text-neutral-400'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <MessageSquare size={16} className={currentSessionId === session.id ? 'text-accent' : 'text-neutral-400'} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate">{session.title}</p>
                          <p className="text-[10px] opacity-60 mt-0.5">
                            {new Date(session.timestamp).toLocaleDateString('vi-VN')}
                          </p>
                        </div>
                        <button 
                          onClick={(e) => deleteSession(e, session.id)}
                          className={`p-2 -mr-2 transition-all rounded-lg active:scale-90 z-10 flex items-center gap-1 ${
                            confirmDeleteId === session.id 
                              ? 'bg-red-500 text-white animate-pulse' 
                              : 'text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10'
                          }`}
                          title={confirmDeleteId === session.id ? "Bấm lại để xác nhận xóa" : "Xóa hội thoại"}
                        >
                          {confirmDeleteId === session.id ? (
                            <><CheckCircle size={14} /><span className="text-[10px] font-bold">XÓA?</span></>
                          ) : (
                            <Trash2 size={16} />
                          )}
                        </button>
                      </div>
                    </div>
                ))}
              </div>

              <div className="p-4 border-t border-neutral-100 dark:border-neutral-800">
                <div className="flex items-center gap-3 p-3 bg-neutral-50 dark:bg-neutral-900 rounded-xl border border-neutral-100 dark:border-neutral-800">
                    <div className="w-8 h-8 rounded-full bg-accent-soft dark:bg-accent-dark/20 flex items-center justify-center text-accent">
                        <Bot size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold dark:text-white truncate">{persona.name}</p>
                        <p className="text-[9px] text-neutral-400 truncate tracking-wide uppercase font-bold">Premium AI Assistant</p>
                    </div>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Header Area */}
      <header className={`px-3 py-2 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between bg-white/80 dark:bg-[#0a0a0b]/80 backdrop-blur-md sticky top-0 z-20 transition-all ${isFocusMode ? 'h-0 py-0 opacity-0 pointer-events-none' : 'h-auto'}`} id="chat-header">
        <div className="flex items-center gap-2 min-w-0">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-all lg:hidden flex-shrink-0"
          >
            <Menu size={18} className="text-neutral-600 dark:text-neutral-400" />
          </button>
          <div className="relative flex-shrink-0">
            <div className={`w-8 h-8 rounded-xl bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center text-white shadow-lg shadow-accent/20`}>
              {persona.avatar ? <img src={persona.avatar} alt="Bot" className="w-full h-full object-cover rounded-xl" /> : <Bot size={18} />}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 border-2 border-white dark:border-[#0a0a0b] rounded-full shadow-sm"></div>
          </div>
          <div className="min-w-0">
            <h1 className="text-xs font-bold text-neutral-900 dark:text-white tracking-tight leading-none mb-0.5 truncate">{persona.name}</h1>
            <div className="flex items-center gap-1 overflow-hidden">
              <span className="text-[9px] font-bold text-accent uppercase tracking-wider truncate shrink-0">{aiSettings.engine}</span>
              <span className="w-0.5 h-0.5 rounded-full bg-neutral-300 dark:bg-neutral-700 shrink-0"></span>
              <span className="text-[9px] font-medium text-neutral-500 dark:text-neutral-400 truncate opacity-70 leading-none">{aiSettings.model}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button 
            onClick={() => setIsCanvasOpen(!isCanvasOpen)}
            className={`p-1.5 rounded-lg transition-all ${isCanvasOpen ? 'bg-accent-soft text-accent' : 'text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
            title="Mở Canvas Area (Artifacts)"
          >
            <FileText size={16} />
          </button>
          <button 
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            className={`p-1.5 transition-colors rounded-lg ${isSearchOpen ? 'text-accent bg-accent-soft dark:bg-accent-dark/20' : 'text-neutral-400 hover:text-accent hover:bg-neutral-50 dark:hover:bg-neutral-900'}`}
            title="Tìm kiếm tin nhắn (Ctrl+K)"
          >
            <Search size={16} />
          </button>
          <button 
            onClick={() => setIsFocusMode(!isFocusMode)}
            className={`p-1.5 rounded-lg transition-all ${isFocusMode ? 'bg-accent-soft text-accent animate-pulse' : 'text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
          >
            <Maximize2 size={16} />
          </button>
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)} 
            className="p-1.5 text-neutral-400 hover:text-accent transition-colors rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-900"
          >
            {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button onClick={() => setIsSettingsOpen(true)} className="p-1.5 text-neutral-400 hover:text-accent transition-colors rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-900" id="settings-btn" title="Cài đặt hệ thống (Ctrl+S)">
            <Settings size={16} />
          </button>
        </div>
      </header>

      {/* Search Bar */}
      <AnimatePresence>
        {isSearchOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-6 py-3 bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 flex items-center gap-3 overflow-hidden shadow-inner"
          >
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input 
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentSearchIndex(-1);
                }}
                autoFocus
                placeholder="Tìm nội dung tin nhắn..."
                className="w-full pl-10 pr-4 py-2 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent-soft dark:text-white"
              />
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-neutral-500 whitespace-nowrap">
              {filteredMessagesIndices.length > 0 ? (
                <>
                  <span className="bg-white dark:bg-neutral-800 px-2 py-1 rounded border border-neutral-100 dark:border-neutral-700">
                    {currentSearchIndex + 1} / {filteredMessagesIndices.length}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={goToPrevMatch} className="p-1.5 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg transition-colors border border-neutral-200 dark:border-neutral-700">
                      <ChevronUp size={16} />
                    </button>
                    <button onClick={goToNextMatch} className="p-1.5 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg transition-colors border border-neutral-200 dark:border-neutral-700">
                      <ChevronDown size={16} />
                    </button>
                  </div>
                </>
              ) : searchTerm !== '' ? (
                <span className="text-red-500">Không tìm thấy</span>
              ) : null}
              <button 
                onClick={() => { setIsSearchOpen(false); setSearchTerm(''); }} 
                className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded-lg transition-colors"
                title="Đóng tìm kiếm"
              >
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Overlay */}
      {isFocusMode && (
        <button 
          onClick={() => setIsFocusMode(false)}
          className="fixed top-4 right-6 p-2 bg-white/50 dark:bg-black/50 backdrop-blur-sm text-neutral-400 hover:text-accent transition-all rounded-full z-50 shadow-lg border border-neutral-200 dark:border-neutral-800"
          title="Thoát chế độ tập trung"
        >
          <Minimize2 size={20} />
        </button>
      )}

      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div 
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            className="absolute inset-y-0 right-0 w-80 bg-white dark:bg-[#0c0c0d] shadow-2xl z-30 border-l border-neutral-100 dark:border-neutral-800 p-6 flex flex-col overflow-y-auto custom-scrollbar"
            id="settings-panel"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold flex items-center gap-2 dark:text-white">Cài Đặt Hệ Thống</h2>
              <button onClick={() => setIsSettingsOpen(false)} className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white"><X size={24} /></button>
            </div>

            <div className="space-y-6 flex-1">
              {/* Quản lý Key động */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Danh sách API Key</label>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => setIsBulkMode(!isBulkMode)}
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-md transition-all ${isBulkMode ? 'bg-accent text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700'}`}
                        >
                            {isBulkMode ? 'Chế độ đơn' : 'Dán nhiều Key'}
                        </button>
                        <span className="text-[10px] text-accent font-medium bg-accent-soft px-2 py-0.5 rounded-full">{aiSettings.savedKeys.length} key</span>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="p-4 bg-neutral-50 dark:bg-neutral-900/50 rounded-2xl border border-neutral-100 dark:border-neutral-800 space-y-3">
                        {!isBulkMode ? (
                            <div className="flex gap-2">
                                <select 
                                    onChange={(e) => setAiSettings({...aiSettings, engine: e.target.value as any})}
                                    value={aiSettings.engine}
                                    className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-2 py-2 text-xs outline-none focus:ring-2 focus:ring-accent-soft dark:focus:ring-accent-dark/30 dark:text-white"
                                >
                                    {Object.keys(modelPresets).map(e => <option key={e} value={e}>{e.toUpperCase()}</option>)}
                                </select>
                                <input 
                                    type="password"
                                    id="new-key-value"
                                    placeholder="Dán API Key mới..."
                                    className="flex-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-accent-soft dark:focus:ring-accent-dark/30 dark:text-white font-mono"
                                />
                                <button 
                                    onClick={() => {
                                        const input = document.getElementById('new-key-value') as HTMLInputElement;
                                        if (input.value) {
                                            addNewKey('', input.value, aiSettings.engine);
                                            input.value = '';
                                        }
                                    }}
                                    className="bg-accent text-white p-2 rounded-xl hover:bg-accent-dark transition-colors"
                                >
                                    <Zap size={18} />
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-neutral-400">CHỌN NỀN TẢNG CHUNG</span>
                                    <select 
                                        onChange={(e) => setAiSettings({...aiSettings, engine: e.target.value as any})}
                                        value={aiSettings.engine}
                                        className="bg-transparent text-[10px] font-bold text-accent outline-none"
                                    >
                                        {Object.keys(modelPresets).map(e => <option key={e} value={e}>{e.toUpperCase()}</option>)}
                                    </select>
                                </div>
                                <textarea 
                                    id="bulk-keys"
                                    rows={4}
                                    placeholder="Dán danh sách Key (mỗi dòng 1 key)&#10;Hoặc: Tên Key | Key"
                                    className="w-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-accent-soft dark:focus:ring-accent-dark/30 dark:text-white font-mono resize-none"
                                />
                                <button 
                                    onClick={() => {
                                        const area = document.getElementById('bulk-keys') as HTMLTextAreaElement;
                                        if (area.value) {
                                            bulkAddKeys(area.value, aiSettings.engine);
                                            area.value = '';
                                            setIsBulkMode(false);
                                        }
                                    }}
                                    className="w-full bg-accent text-white py-2 rounded-xl font-bold text-xs hover:bg-accent-dark transition-all flex items-center justify-center gap-2"
                                >
                                    <Zap size={14} /> Thêm Tất Cả Key
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                        {aiSettings.savedKeys.length === 0 ? (
                            <p className="text-center py-4 text-[11px] text-neutral-400 italic">Chưa có key nào được lưu</p>
                        ) : (
                            aiSettings.savedKeys.map(key => (
                                <div 
                                    key={key.id}
                                    className={`group flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                                        aiSettings.apiKey === key.value && aiSettings.engine === key.engine
                                        ? 'bg-accent-soft dark:bg-accent-dark/30 border-accent/30 ring-1 ring-accent-soft' 
                                        : 'bg-white dark:bg-neutral-900 border-neutral-100 dark:border-neutral-800 hover:border-neutral-200 dark:hover:border-neutral-700'
                                    }`}
                                    onClick={() => {
                                        setAiSettings({...aiSettings, apiKey: key.value, engine: key.engine});
                                    }}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2 h-2 rounded-full ${aiSettings.apiKey === key.value ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-300'}`} />
                                        <div>
                                            <p className="text-[11px] font-bold text-neutral-700 dark:text-neutral-300">{key.name}</p>
                                            <p className="text-[9px] text-neutral-400 font-mono line-clamp-1 opacity-60">
                                                {key.value.substring(0, 8)}••••••••{key.value.substring(key.value.length - 4)}
                                            </p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); deleteKey(key.id); }}
                                        className="opacity-0 group-hover:opacity-100 p-1.5 text-neutral-400 hover:text-red-500 transition-all"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
              </div>

              <div className="h-px bg-neutral-100 dark:bg-neutral-800 my-2" />

              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600">
                        <Cpu className="w-4 h-4" />
                    </div>
                    <h3 className="font-bold text-neutral-800 dark:text-white">Cấu hình Engine</h3>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    {[
                        { id: 'gemini' as const, label: 'Gemini', icon: Sparkles },
                        { id: 'openai' as const, label: 'OpenAI', icon: Key },
                        { id: 'anthropic' as const, label: 'Claude', icon: Cpu },
                        { id: 'kyma' as const, label: 'Kyma AI', icon: Zap },
                        { id: 'groq' as const, label: 'Groq Cloud', icon: Zap },
                        { id: 'together' as const, label: 'Together', icon: Globe },
                        { id: 'deepseek' as const, label: 'DeepSeek', icon: Cpu },
                        { id: 'mistral' as const, label: 'Mistral AI', icon: Sparkles },
                        { id: 'openrouter' as const, label: 'OpenRouter', icon: Sparkles },
                        { id: 'custom' as const, label: 'Custom', icon: Globe }
                    ].map(engine => (
                        <button 
                            key={engine.id}
                            onClick={() => applyEngine(engine.id)}
                            className={`flex items-center justify-center gap-2 py-3 text-xs font-bold rounded-xl transition-all border ${
                                aiSettings.engine === engine.id 
                                ? 'bg-accent text-white border-accent shadow-md ring-2 ring-accent-soft' 
                                : 'bg-neutral-50 dark:bg-neutral-900 text-neutral-500 border-neutral-100 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                            }`}
                        >
                            <engine.icon size={14} />
                            {engine.label}
                        </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400 flex items-center gap-2 italic">
                            <Key size={14} /> API Key
                        </label>
                        <input 
                            type="password" 
                            value={aiSettings.apiKey}
                            onChange={(e) => setAiSettings({...aiSettings, apiKey: e.target.value})}
                            className="w-full p-2.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm focus:ring-2 focus:ring-accent-soft dark:focus:ring-accent-dark/30 outline-none dark:text-white"
                            placeholder={aiSettings.engine === 'gemini' ? 'Mặc định dùng key hệ thống' : 'Nhập API Key của bạn...'}
                        />
                    </div>
                    {aiSettings.engine === 'custom' && (
                        <div className="space-y-2 text-accent">
                             <label className="text-xs font-medium flex items-center gap-2 italic">
                                <Globe size={14} /> Đường dẫn API (Base URL)
                            </label>
                            <input 
                                type="text" 
                                value={aiSettings.customURL}
                                onChange={(e) => setAiSettings({...aiSettings, customURL: e.target.value})}
                                className="w-full p-2.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm focus:ring-2 focus:ring-accent-soft dark:focus:ring-accent-dark/30 outline-none dark:text-white"
                                placeholder="https://api.proxy.com/v1"
                            />
                        </div>
                    )}
                    <div className="space-y-4">
                        <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400 italic">ID Mô hình (Model ID)</label>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                value={aiSettings.model}
                                onChange={(e) => setAiSettings({...aiSettings, model: e.target.value})}
                                className="flex-1 p-2.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm focus:ring-2 focus:ring-accent-soft dark:focus:ring-accent-dark/30 outline-none dark:text-white"
                                placeholder="Nhập Model ID..."
                            />
                        </div>
                        
                        {/* Quick Model Selection */}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                            {(modelOptions[aiSettings.engine] || []).map(m => (
                                <button
                                    key={m}
                                    onClick={() => setAiSettings({...aiSettings, model: m})}
                                    className={`px-2 py-1 rounded-md text-[9px] font-bold transition-all border ${
                                        aiSettings.model === m 
                                        ? 'bg-accent text-white border-accent' 
                                        : 'bg-neutral-50 dark:bg-neutral-900 text-neutral-500 border-neutral-100 dark:border-neutral-800 hover:border-accent-soft'
                                    }`}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

              <div className="h-px bg-neutral-100 dark:bg-neutral-800 my-4"></div>

              <div className="space-y-6">
                <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center text-pink-600">
                        <User className="w-4 h-4" />
                    </div>
                    <h3 className="font-bold text-neutral-800 dark:text-white">Quản lý Nhân cách (Persona)</h3>
                </div>

                <div className="bg-white dark:bg-neutral-800/40 p-5 rounded-3xl border border-neutral-100 dark:border-neutral-800 space-y-5 shadow-xl backdrop-blur-sm relative overflow-hidden group/card">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-pink-500/5 blur-3xl rounded-full -mr-16 -mt-16 group-hover/card:bg-pink-500/10 transition-colors" />
                    
                    <div className="space-y-2 relative">
                        <label className="text-[10px] text-neutral-400 font-bold ml-1 uppercase flex items-center gap-2 tracking-widest">
                            <Sparkles size={12} className="text-pink-500" /> Tên định danh
                        </label>
                        <input 
                            type="text" value={persona.name}
                            onChange={(e) => setPersona({...persona, name: e.target.value})}
                            className="w-full p-3.5 bg-neutral-50/50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-pink-100 dark:focus:ring-pink-900/30 transition-all dark:text-white font-medium"
                            placeholder="Ví dụ: Trợ Lý Jarvis, Chị Google..."
                        />
                    </div>

                    <div className="space-y-2 relative">
                        <label className="text-[10px] text-neutral-400 font-bold ml-1 uppercase flex items-center gap-2 tracking-widest">
                            <ImageIcon size={12} className="text-accent" /> Ảnh đại diện
                        </label>
                        <div className="flex gap-4 items-start">
                             <div className="w-16 h-16 rounded-2xl bg-neutral-50 dark:bg-neutral-900 flex-shrink-0 flex items-center justify-center overflow-hidden border-2 border-accent-soft shadow-inner group/avatar">
                                {persona.avatar ? (
                                    <img src={persona.avatar} className="w-full h-full object-cover group-hover/avatar:scale-110 transition-transform duration-500" />
                                ) : (
                                    <Bot size={28} className="text-neutral-300" />
                                )}
                             </div>
                             <div className="flex-1 space-y-3">
                                <div className="relative group/input">
                                    <input 
                                        type="text" value={persona.avatar}
                                        onChange={(e) => setPersona({...persona, avatar: e.target.value})}
                                        className="w-full p-2.5 bg-neutral-50/50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded-xl text-[10px] outline-none focus:border-pink-300 dark:text-white font-mono"
                                        placeholder="Tùy chỉnh link ảnh (https://...)"
                                    />
                                    <div className="absolute right-2 top-1.5 opacity-0 group-hover/input:opacity-100 transition-opacity">
                                        <Zap size={14} className="text-amber-400" />
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {[
                                        'https://api.dicebear.com/7.x/bottts/svg?seed=Lucky', 
                                        'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix', 
                                        'https://api.dicebear.com/7.x/notionists/svg?seed=Mao',
                                        'https://api.dicebear.com/7.x/micah/svg?seed=Jack',
                                        'https://api.dicebear.com/7.x/pixel-art/svg?seed=Ape',
                                        'https://api.dicebear.com/7.x/adventurer/svg?seed=Mimi'
                                    ].map(url => (
                                        <button 
                                            key={url}
                                            onClick={() => setPersona({...persona, avatar: url})}
                                            className={`w-8 h-8 rounded-xl bg-neutral-50 dark:bg-neutral-900 border flex items-center justify-center overflow-hidden hover:scale-110 active:scale-95 transition-all shadow-sm ${persona.avatar === url ? 'border-pink-500 ring-2 ring-pink-100 dark:ring-pink-900' : 'border-neutral-200 dark:border-neutral-700'}`}
                                        >
                                            <img src={url} className="w-full h-full" />
                                        </button>
                                    ))}
                                </div>
                             </div>
                        </div>
                    </div>

                    <div className="space-y-2 relative">
                        <label className="text-[10px] text-neutral-400 font-bold ml-1 uppercase flex items-center gap-2 tracking-widest">
                            <Zap size={12} className="text-amber-500" /> Vai trò & Sứ mệnh
                        </label>
                        <textarea 
                            rows={2} value={persona.role}
                            onChange={(e) => setPersona({...persona, role: e.target.value})}
                            className="w-full p-3.5 bg-neutral-50/50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded-2xl text-sm outline-none resize-none focus:ring-2 focus:ring-pink-100 dark:focus:ring-pink-900/30 transition-all dark:text-white leading-relaxed"
                            placeholder="Mô tả nhiệm vụ cụ thể của Bot..."
                        />
                    </div>

                    <div className="space-y-2 relative">
                        <label className="text-[10px] text-neutral-400 font-bold ml-1 uppercase flex items-center gap-2 tracking-widest">
                            <MessageSquare size={12} className="text-emerald-500" /> Giọng văn đặc trưng
                        </label>
                        <div className="relative group/select">
                            <select 
                                value={persona.tone}
                                onChange={(e) => setPersona({...persona, tone: e.target.value})}
                                className="w-full p-3.5 bg-neutral-50/50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-pink-100 dark:focus:ring-pink-900/30 transition-all dark:text-white appearance-none cursor-pointer font-medium"
                            >
                                <option value="Chuyên nghiệp, nhanh nhẹn và chính xác">👔 Chuyên nghiệp & Chính xác</option>
                                <option value="Thân thiện, hóm hỉnh và giàu năng lượng">🌟 Thân thiện & Hóm hỉnh</option>
                                <option value="Ngắn gọn, súc tích và tập trung vào kết quả">⚡ Ngắn gọn & Súc tích</option>
                                <option value="Đồng cảm, thấu hiểu và hỗ trợ tận tâm">❤️ Đồng cảm & Thấu hiểu</option>
                                <option value="Sáng tạo, đột phá và không giới hạn">🎨 Sáng tạo & Đột phá</option>
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400 group-hover/select:text-pink-500 transition-colors">
                                <Send size={14} className="rotate-90" />
                            </div>
                        </div>
                    </div>
                </div>
              </div>

              <div className="h-px bg-neutral-100 dark:bg-neutral-800 my-4" />

              <div className="space-y-6">
                <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600">
                        <Palette className="w-4 h-4" />
                    </div>
                    <h3 className="font-bold text-neutral-800 dark:text-white">Chủ đề & Màu sắc</h3>
                </div>

                <div className="bg-white dark:bg-neutral-800/40 p-5 rounded-3xl border border-neutral-100 dark:border-neutral-800 space-y-5 shadow-xl backdrop-blur-sm relative overflow-hidden group/theme-card">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/5 blur-3xl rounded-full -mr-16 -mt-16 group-hover/theme-card:bg-violet-500/10 transition-colors" />
                    
                    <div className="space-y-3 relative">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] text-neutral-400 font-bold ml-1 uppercase flex items-center gap-2 tracking-widest">
                                <Paintbrush size={12} className="text-violet-500" /> Màu chủ đạo
                            </label>
                            <button 
                                onClick={() => setIsCustomColorMode(!isCustomColorMode)}
                                className="text-[9px] font-bold text-accent px-2 py-0.5 bg-accent-soft rounded-md hover:bg-accent hover:text-white transition-all"
                            >
                                {isCustomColorMode ? 'Dùng bảng màu' : 'Tùy chỉnh mã HEX'}
                            </button>
                        </div>
                        
                        {!isCustomColorMode ? (
                            <div className="flex flex-wrap gap-3">
                                {[
                                    { name: 'Indigo', main: '#6366f1', soft: '#eef2ff', dark: '#4f46e5' },
                                    { name: 'Emerald', main: '#10b981', soft: '#ecfdf5', dark: '#059669' },
                                    { name: 'Amber', main: '#f59e0b', soft: '#fffbeb', dark: '#d97706' },
                                    { name: 'Rose', main: '#f43f5e', soft: '#fff1f2', dark: '#e11d48' },
                                    { name: 'Violet', main: '#8b5cf6', soft: '#f5f3ff', dark: '#7c3aed' },
                                    { name: 'Sky', main: '#0ea5e9', soft: '#f0f9ff', dark: '#0284c7' }
                                ].map(color => (
                                    <button 
                                        key={color.name}
                                        onClick={() => setThemeSettings({
                                            ...themeSettings,
                                            accentColor: color.main,
                                            accentSoft: color.soft,
                                            accentDark: color.dark
                                        })}
                                        className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 active:scale-95 shadow-sm ${themeSettings.accentColor === color.main ? 'border-violet-500 ring-4 ring-violet-100 dark:ring-violet-900/30' : 'border-white dark:border-neutral-700'}`}
                                        style={{ backgroundColor: color.main }}
                                        title={color.name}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-neutral-50 dark:bg-neutral-900/50 rounded-2xl border border-neutral-100 dark:border-neutral-800">
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-tighter">Màu Chính (Main)</label>
                                    <div className="flex gap-1.5">
                                        <input 
                                            type="color" 
                                            value={themeSettings.accentColor} 
                                            onChange={(e) => setThemeSettings({...themeSettings, accentColor: e.target.value})}
                                            className="w-8 h-8 rounded-lg overflow-hidden border-none cursor-pointer"
                                        />
                                        <input 
                                            type="text" 
                                            value={themeSettings.accentColor} 
                                            onChange={(e) => setThemeSettings({...themeSettings, accentColor: e.target.value})}
                                            className="flex-1 min-w-0 px-2 py-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-[10px] font-mono outline-none focus:ring-1 focus:ring-accent-soft dark:text-white"
                                            placeholder="#6366f1"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-tighter">Màu Mềm (Soft)</label>
                                    <div className="flex gap-1.5">
                                        <input 
                                            type="color" 
                                            value={themeSettings.accentSoft} 
                                            onChange={(e) => setThemeSettings({...themeSettings, accentSoft: e.target.value})}
                                            className="w-8 h-8 rounded-lg overflow-hidden border-none cursor-pointer"
                                        />
                                        <input 
                                            type="text" 
                                            value={themeSettings.accentSoft} 
                                            onChange={(e) => setThemeSettings({...themeSettings, accentSoft: e.target.value})}
                                            className="flex-1 min-w-0 px-2 py-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-[10px] font-mono outline-none focus:ring-1 focus:ring-accent-soft dark:text-white"
                                            placeholder="#eef2ff"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-tighter">Màu Tối (Dark)</label>
                                    <div className="flex gap-1.5">
                                        <input 
                                            type="color" 
                                            value={themeSettings.accentDark} 
                                            onChange={(e) => setThemeSettings({...themeSettings, accentDark: e.target.value})}
                                            className="w-8 h-8 rounded-lg overflow-hidden border-none cursor-pointer"
                                        />
                                        <input 
                                            type="text" 
                                            value={themeSettings.accentDark} 
                                            onChange={(e) => setThemeSettings({...themeSettings, accentDark: e.target.value})}
                                            className="flex-1 min-w-0 px-2 py-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-[10px] font-mono outline-none focus:ring-1 focus:ring-accent-soft dark:text-white"
                                            placeholder="#4f46e5"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="space-y-3 relative">
                        <label className="text-[10px] text-neutral-400 font-bold ml-1 uppercase flex items-center gap-2 tracking-widest">
                            <Type size={12} className="text-blue-500" /> Kiểu chữ (Font)
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { name: 'Hiện đại (Sans)', value: 'var(--font-sans)', class: 'font-sans' },
                                { name: 'Kỹ thuật (Mono)', value: 'var(--font-mono)', class: 'font-mono' },
                                { name: 'Thanh lịch (Serif)', value: 'var(--font-serif)', class: 'font-serif' },
                                { name: 'Nổi bật (Display)', value: 'var(--font-display)', class: 'font-display' }
                            ].map(f => (
                                <button 
                                    key={f.value}
                                    onClick={() => setThemeSettings({ ...themeSettings, fontFamily: f.value })}
                                    className={`p-3 rounded-xl border text-[11px] transition-all text-left group ${themeSettings.fontFamily === f.value ? 'bg-violet-600 text-white border-violet-600 shadow-lg' : 'bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 border-neutral-100 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
                                >
                                    <span className={`${f.class} block mb-0.5`}>Font Sample</span>
                                    <span className="text-[9px] opacity-70 block font-normal">{f.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
              </div>
            </div>

            {/* Extension & PWA Info */}
            <div className="mt-4 p-4 bg-neutral-50 dark:bg-neutral-900/50 rounded-2xl border border-neutral-100 dark:border-neutral-800">
                <div className="flex items-center gap-2 mb-2">
                    <Zap size={14} className="text-yellow-500 fill-yellow-500" />
                    <h3 className="text-[11px] font-bold uppercase tracking-wider dark:text-neutral-300">Tiện ích & Ứng dụng</h3>
                </div>
                <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mb-2 leading-relaxed italic">
                    Ứng dụng đã được tối ưu hóa để chạy như một Tiện ích (Side Panel) hoặc Ứng dụng web (PWA).
                </p>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1" />
                    <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                      <span className="font-bold text-neutral-700 dark:text-neutral-200">Chrome Extension:</span> Tải dự án và Load Unpacked folder `dist` vào Chrome Extensions.
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1" />
                    <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                      <span className="font-bold text-neutral-700 dark:text-neutral-200">PWA:</span> Chọn `Cài đặt ứng dụng` trên trình duyệt để dùng như app di động/desktop.
                    </p>
                  </div>
                </div>
            </div>

            <div className="mt-8 mb-4">
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="w-full py-3 bg-neutral-900 dark:bg-accent text-white rounded-xl font-bold text-sm shadow-lg hover:bg-neutral-800 dark:hover:bg-accent-dark transition-all"
                >
                    Lưu Cấu Hình
                </button>
            </div>
            
            <div className="mt-auto pt-6 border-t border-neutral-100 dark:border-neutral-800">
                <div className="flex items-center gap-3 p-3 bg-accent-soft dark:bg-accent-dark/30 rounded-xl text-accent-dark dark:text-accent">
                    <Mail size={18} />
                    <div className="flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider">Tích hợp Mail Temp</p>
                        <p className="text-[9px] opacity-80 leading-tight">Gemini đã được cấu hình để tự động sử dụng API email tạm thời.</p>
                    </div>
                </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages Area */}
      <div className="flex-1 flex overflow-hidden">
        <main 
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar dark:bg-[#0a0a0b]" 
          id="message-list"
        >
        {messages.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4"
          >
            <div className="w-16 h-16 rounded-2xl bg-accent-soft dark:bg-accent-dark/20 flex items-center justify-center text-accent border border-accent-soft mb-2">
              <Sparkles size={32} />
            </div>
            <h2 className="text-xl font-medium text-neutral-900 dark:text-white tracking-tight">Hệ Thống Đã Sẵn Sàng</h2>
            <p className="text-neutral-500 dark:text-neutral-400 max-w-xs text-sm">
              Trò chuyện và yêu cầu tạo Mail Temp hoặc xử lý các tác vụ phức tạp một cách nhanh chóng.
            </p>
          </motion.div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((message, idx) => (
              <motion.div
                key={message.id}
                id={`message-${message.id}`}
                layout
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                  <div className={`flex flex-col max-w-[90%] ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center gap-2 mb-0.5 px-0.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                        {message.role === 'user' ? 'Bạn' : persona.name}
                      </span>
                      <span className="text-[10px] font-medium text-neutral-300">
                        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  {message.image && (
                    <motion.div 
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="mb-2 max-w-sm rounded-xl overflow-hidden shadow-md border-2 border-accent-soft cursor-zoom-in group relative"
                      onClick={() => openGallery(message.image!)}
                    >
                      <img src={message.image} alt="Hình ảnh người dùng" className="max-h-60 w-auto object-contain transition-all group-hover:brightness-110" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                        <Maximize2 className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md" size={24} />
                      </div>
                    </motion.div>
                  )}
                  <div className={`px-3 py-2 rounded-xl shadow-sm ${
                    message.role === 'user' 
                      ? 'bg-neutral-900 dark:bg-accent text-white rounded-tr-none' 
                      : message.role === 'system'
                        ? 'bg-neutral-100 dark:bg-neutral-900 text-neutral-500 italic text-[11px] py-1 px-4 border-none shadow-none text-center w-full bg-transparent'
                        : 'bg-neutral-50 dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 dark:text-neutral-200 rounded-tl-none'
                  }`}>
                    {message.role === 'system' ? (
                        <span>• {message.content}</span>
                    ) : (
                        <div className="markdown-body dark:text-neutral-200">
                           <ReactMarkdown>
                             {(() => {
                               // Fix JSON display bug: try to parse if it looks like JSON
                               let displayContent = message.content;
                               if (typeof displayContent === 'string' && displayContent.trim().startsWith('{') && displayContent.trim().endsWith('}')) {
                                   try {
                                       const parsed = JSON.parse(displayContent);
                                       displayContent = parsed.message || parsed.text || parsed.content || (parsed.data && (parsed.data.message || parsed.data.text)) || displayContent;
                                   } catch(e) {}
                               }
                               return displayContent;
                             })()}
                           </ReactMarkdown>
                        </div>
                    )}
                  </div>
                  {message.role !== 'system' && (
                    <div className="flex items-center justify-between gap-4 mt-1">
                        <span className="text-[9px] text-neutral-400 uppercase tracking-widest font-medium">
                            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {message.role === 'assistant' && (
                            <button 
                                onClick={() => speakText(message.content)}
                                className="p-1 text-neutral-400 hover:text-accent transition-colors"
                                title="Đọc nội dung này"
                            >
                                <Volume2 size={12} />
                            </button>
                        )}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
            {isLoading && (
               <motion.div 
                 initial={{ opacity: 0, y: 10 }} 
                 animate={{ opacity: 1, y: 0 }} 
                 className="flex gap-4"
               >
                 <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 px-4 py-3 rounded-2xl flex items-center gap-1 shadow-sm">
                    <div className="typing-dot"></div>
                    <div className="typing-dot"></div>
                    <div className="typing-dot"></div>
                 </div>
               </motion.div>
            )}
          </AnimatePresence>
        )}
        <div ref={messagesEndRef} />
        </main>

        <Canvas 
            isOpen={isCanvasOpen}
            onClose={() => setIsCanvasOpen(false)}
            title={activeCanvas?.title || ""}
            content={activeCanvas?.content || ""}
            type={activeCanvas?.type || "text"}
        />
      </div>

      {/* Input Area */}
      <footer className="p-3 bg-white dark:bg-[#0a0a0b] border-t border-neutral-100 dark:border-neutral-800">
        <div className="flex flex-col gap-2">
            {/* Quick Actions & Prompt Lab */}
            {!isFocusMode && (
                <div className="flex items-center justify-between gap-2">
                    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide flex-1">
                        <button 
                            onClick={quickCreateMail}
                            disabled={isLoading}
                            className="flex items-center gap-1 px-3 py-1.5 bg-accent-soft dark:bg-accent-dark/30 text-accent dark:text-accent rounded-lg text-[10px] font-bold hover:bg-accent-soft/80 dark:hover:bg-accent-dark/50 transition-all whitespace-nowrap"
                        >
                            <Mail size={12} /> Tạo Mail
                        </button>
                        <button 
                            onClick={quickCheckInbox}
                            disabled={isLoading || !currentMail}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap ${
                                !currentMail ? 'bg-neutral-50 dark:bg-neutral-900 text-neutral-300 dark:text-neutral-700' : 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50'
                            }`}
                        >
                            <Zap size={12} /> Inbox
                        </button>
                        <button 
                            onClick={() => setIsPromptLabOpen(!isPromptLabOpen)}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap ${
                                isPromptLabOpen ? 'bg-amber-100 text-amber-600' : 'bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                            }`}
                        >
                            <BookOpen size={12} /> Prompts
                        </button>
                    </div>
                </div>
            )}

            {/* Prompt Lab Panel */}
            <AnimatePresence>
                {isPromptLabOpen && (
                    <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: '400px', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-y-auto custom-scrollbar bg-neutral-50 dark:bg-neutral-900/50 rounded-xl p-4 border border-neutral-100 dark:border-neutral-800"
                    >
                        <div className="space-y-6">
                            {Array.from(new Set(promptLibrary.map(p => p.category))).map(cat => (
                                <div key={cat} className="space-y-2">
                                    <h4 className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest pl-1">{cat}</h4>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                        {promptLibrary.filter(p => p.category === cat).map((p, idx) => (
                                            <button 
                                                key={idx}
                                                onClick={() => {
                                                    setInput(p.content);
                                                    setIsPromptLabOpen(false);
                                                }}
                                                className="flex items-center gap-2 p-2.5 bg-white dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700/50 rounded-lg hover:border-accent shadow-sm transition-all text-left group"
                                            >
                                                <div className="text-accent group-hover:scale-110 transition-transform">{p.icon}</div>
                                                <span className="text-[10px] font-bold text-neutral-600 dark:text-neutral-300 truncate">{p.title}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Selected File Preview */}
            <div className="flex flex-wrap gap-2">
                {attachedFiles.map((file, idx) => (
                    <div key={idx} className="relative p-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg flex items-center gap-2 border border-neutral-200 dark:border-neutral-700 min-w-[120px]">
                        <FileText size={14} className="text-accent" />
                        <span className="text-[10px] font-bold truncate max-w-[80px] dark:text-neutral-300">{file.name}</span>
                        <button 
                            onClick={() => setAttachedFiles(prev => prev.filter((_, i) => i !== idx))}
                            className="text-neutral-400 hover:text-red-500 ml-auto"
                        >
                            <X size={12} />
                        </button>
                    </div>
                ))}
                {selectedImage && (
                    <div className="relative w-20 h-20 rounded-xl overflow-hidden self-start border-2 border-accent shadow-lg">
                        <img src={selectedImage} alt="Hình ảnh đã chọn" className="w-full h-full object-cover" />
                        <button 
                            onClick={() => setSelectedImage(null)}
                            className="absolute top-1 right-1 bg-black/50 text-white p-1 rounded-full hover:bg-black"
                        >
                            <X size={12} />
                        </button>
                    </div>
                )}
            </div>

            <div className="relative flex items-center gap-2">
              <div className="flex gap-1 items-center">
                  <button 
                    className="p-3 text-neutral-400 hover:text-accent transition-all rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 border border-transparent hover:border-neutral-200 dark:hover:border-neutral-700"
                    onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.multiple = true;
                        input.onchange = (e: any) => handleFileUpload(e);
                        input.click();
                    }}
                    title="Đính kèm tài liệu (PDF, Word...)"
                  >
                    <Paperclip size={20} />
                  </button>
                  <button 
                    className="p-3 text-neutral-400 hover:text-accent transition-all rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 border border-transparent hover:border-neutral-200 dark:hover:border-neutral-700"
                    onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*';
                        input.onchange = (e: any) => {
                            const file = e.target.files?.[0];
                            if (file) {
                                const reader = new FileReader();
                                reader.onload = (e) => setSelectedImage(e.target?.result as string);
                                reader.readAsDataURL(file);
                            }
                        };
                        input.click();
                    }}
                    title="Tải ảnh lên"
                  >
                    <ImageIcon size={20} />
                  </button>
              </div>

              <div className="flex-1 relative flex items-center">
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || (!e.shiftKey))) {
                        e.preventDefault();
                        handleSend();
                    }
                    }}
                    placeholder="Hỏi gì đó..."
                    rows={1}
                    className="w-full pl-3 pr-16 py-3 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-soft dark:focus:ring-accent-dark/30 focus:border-accent resize-none max-h-32 transition-all text-xs shadow-inner dark:text-white"
                />
                <div className="absolute right-1 flex items-center gap-0.5">
                    <button
                        onClick={toggleRecording}
                        className={`p-1.5 rounded-lg transition-all ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'text-neutral-400 hover:text-accent hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
                        title={isRecording ? "Đang lắng nghe..." : "Giọng nói"}
                    >
                        {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
                    </button>
                    <button
                        onClick={handleSend}
                        disabled={(!input.trim() && !selectedImage && attachedFiles.length === 0) || isLoading}
                        className={`p-1.5 rounded-lg transition-all ${
                        (!input.trim() && !selectedImage && attachedFiles.length === 0) || isLoading ? 'text-neutral-300 dark:text-neutral-700' : 'bg-accent text-white shadow-lg shadow-accent/20 hover:bg-accent-dark'
                        }`}
                    >
                        {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </button>
                </div>
              </div>
            </div>
        </div>
      </footer>

      {/* Modern Image Gallery Overlay */}
      <AnimatePresence>
        {isGalleryOpen && collectiveImages.length > 0 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-xl"
            onKeyDown={(e) => {
                if (e.key === 'ArrowRight') nextImage();
                if (e.key === 'ArrowLeft') prevImage();
                if (e.key === 'Escape') setIsGalleryOpen(false);
            }}
          >
            {/* Gallery Navbar */}
            <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-b from-black/60 to-transparent">
                <div className="flex items-center gap-4">
                    <div className="text-white/60 text-xs font-bold tracking-widest uppercase bg-white/10 px-3 py-1 rounded-full border border-white/5">
                        {currentGalleryIndex + 1} / {collectiveImages.length} ẢNH
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => setIsZoomed(!isZoomed)}
                        className={`p-2 rounded-full transition-all ${isZoomed ? 'bg-accent text-white shadow-lg' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
                        title="Phóng to/Thu nhỏ"
                    >
                        {isZoomed ? <Minimize2 size={22} /> : <Maximize2 size={22} />}
                    </button>
                    <button 
                        onClick={() => setIsGalleryOpen(false)}
                        className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-full transition-all"
                        title="Đóng (Esc)"
                    >
                        <X size={24} />
                    </button>
                </div>
            </div>

            {/* Main Stage */}
            <div className="flex-1 relative flex items-center justify-center overflow-hidden touch-none group">
                {/* Navigation Buttons (Desktop) */}
                <button 
                    onClick={prevImage}
                    className="absolute left-6 z-10 p-4 transition-all opacity-0 group-hover:opacity-100 bg-black/30 hover:bg-black/50 text-white rounded-full backdrop-blur-sm border border-white/10"
                >
                    <X size={24} className="-rotate-180" style={{ transform: 'rotate(-180deg)' }} />
                    <Search size={24} className="hidden" /> {/* Placeholder for logic icon if needed */}
                    <ChevronDown size={24} className="rotate-90" />
                </button>

                <motion.div
                    key={currentGalleryIndex}
                    drag={isZoomed ? false : "x"}
                    dragConstraints={{ left: 0, right: 0 }}
                    onDragEnd={(_, info) => {
                        if (info.offset.x > 100) prevImage();
                        else if (info.offset.x < -100) nextImage();
                    }}
                    initial={{ scale: 0.9, opacity: 0, x: 50 }}
                    animate={{ scale: isZoomed ? 1.5 : 1, opacity: 1, x: 0 }}
                    exit={{ scale: 0.9, opacity: 0, x: -50 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className={`relative select-none ${isZoomed ? 'cursor-zoom-out' : 'cursor-grab active:cursor-grabbing'}`}
                    onClick={() => {
                        if (isZoomed) setIsZoomed(false);
                    }}
                >
                    <img 
                        src={collectiveImages[currentGalleryIndex]} 
                        alt="Gallery" 
                        className={`max-w-full max-h-[80vh] object-contain shadow-2xl rounded-sm transition-transform duration-300 pointer-events-none`}
                        draggable="false"
                    />
                </motion.div>

                <button 
                    onClick={nextImage}
                    className="absolute right-6 z-10 p-4 transition-all opacity-0 group-hover:opacity-100 bg-black/30 hover:bg-black/50 text-white rounded-full backdrop-blur-sm border border-white/10"
                >
                    <ChevronDown size={24} className="-rotate-90" />
                </button>
            </div>

            {/* Thumbnails Footer */}
            <div className="p-6 bg-gradient-to-t from-black/60 to-transparent">
                <div className="flex justify-center gap-2 overflow-x-auto pb-4 scrollbar-hide px-4 max-w-4xl mx-auto">
                    {collectiveImages.map((img, idx) => (
                        <button
                            key={idx}
                            onClick={() => {
                                setCurrentGalleryIndex(idx);
                                setIsZoomed(false);
                            }}
                            className={`relative flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all hover:scale-105 active:scale-95 ${currentGalleryIndex === idx ? 'border-accent scale-110 shadow-lg' : 'border-transparent opacity-40 hover:opacity-100'}`}
                        >
                            <img src={img} className="w-full h-full object-cover" />
                            {currentGalleryIndex === idx && (
                                <div className="absolute inset-0 bg-accent/20 flex items-center justify-center">
                                    <div className="w-1.5 h-1.5 rounded-full bg-white shadow-sm" />
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
