'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Terminal, X, Search, Menu, ChevronRight, ChevronDown, 
  Folder, Clock, FileText, CheckCircle2, ArrowLeft, ArrowRight, 
  Sun, Moon, ListOrdered, Edit3, Check, Lightbulb, RotateCcw,
  UserRound, LogOut
} from 'lucide-react';
import { marked } from 'marked';

const getCategory = (slug) => {
  const name = slug.toLowerCase();
  if (/(acid|postgresql|redis|locks|storage)/.test(name)) return 'Cơ sở dữ liệu';
  if (/(kafka|log|giao_tiep|1tr_users)/.test(name)) return 'Kiến trúc hệ thống';
  if (/(dsa|solid)/.test(name)) return 'Thuật toán & Thiết kế';
  if (/(devops|docker|kubernetes)/.test(name)) return 'DevOps & Hạ tầng';
  if (/(owasp|security)/.test(name)) return 'Bảo mật';
  return 'Khác';
};

const normalizeCategory = (category, slug) => {
  const labels = {
    database: 'Cơ sở dữ liệu',
    architecture: 'Kiến trúc hệ thống',
    'algorithm-design': 'Thuật toán & Thiết kế',
    security: 'Bảo mật',
    devops: 'DevOps & Hạ tầng',
    backend: 'Backend',
  };
  return labels[category] || category || getCategory(slug);
};

const toLesson = (document) => {
  const content = document.content || '';
  const computedWordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const wordCount = document.wordCount || computedWordCount;
  return {
    id: document.slug,
    slug: document.slug,
    title: document.title,
    content,
    wordCount,
    readingTime: document.readingTime || Math.max(1, Math.ceil(wordCount / 200)),
    category: normalizeCategory(document.category, document.slug),
  };
};

// Helper: inject id attributes into h2/h3 tags in HTML string from marked.parse
// This ensures IDs are embedded in the HTML itself (not via DOM mutation),
// so they persist across React re-renders and document.getElementById() always works.
const ALLOWED_CHARS = /[^a-z0-9\u00e0-\u00ff\u0100-\u024f\u1e00-\u1ef9\s-]/g;
const addIdsToHeadings = (html) => {
  return html.replace(/<h([23])([^>]*)>(.*?)<\/h\1>/g, (match, level, attrs, content) => {
    if (attrs.includes('id=')) return match; // already has an ID, skip
    const plainText = content.replace(/<[^>]*>/g, ''); // strip inner HTML tags
    const id = plainText
      .toLowerCase()
      .replace(ALLOWED_CHARS, '')
      .replace(/\s+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '')
      .trim();
    const safeId = id || `h${level}-${Math.random().toString(36).slice(2, 7)}`;
    return `<h${level} id="${safeId}"${attrs}>${content}</h${level}>`;
  });
};

export default function Home() {
  // App state
  const [lessons, setLessons] = useState([]);
  const [activeLesson, setActiveLesson] = useState(null);
  const [loadingLessonId, setLoadingLessonId] = useState('');
  const [theme, setTheme] = useState('dark');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [isSidebarLeftActive, setIsSidebarLeftActive] = useState(false);
  const [isSidebarRightActive, setIsSidebarRightActive] = useState(false);
  
  // Lesson status & progress (stored in localStorage)
  // Format: { [lessonId]: 'unread' | 'studying' | 'completed' }
  const [lessonStatuses, setLessonStatuses] = useState({});
  const [overallProgress, setOverallProgress] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  
  // Right sidebar state
  const [activeTab, setActiveTab] = useState('toc');
  const [tocItems, setTocItems] = useState([]);
  const [activeTocId, setActiveTocId] = useState('');
  
  // Notes state
  const [noteText, setNoteText] = useState('');
  const [isNoteSaved, setIsNoteSaved] = useState(false);
  
  // Flashcards / Key Takeaways state
  const [flashcards, setFlashcards] = useState([]);
  const [checkedFlashcards, setCheckedFlashcards] = useState({}); // { [lessonId]: { [cardIndex]: boolean } }

  // Status dropdown state
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);

  // Auth state
  const [authUser, setAuthUser] = useState(null);
  const [authToken, setAuthToken] = useState('');
  const [pendingLessonId, setPendingLessonId] = useState('');
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authView, setAuthView] = useState('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '', otp: '' });
  const [authMessage, setAuthMessage] = useState('');
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);

  // Scroll tracking refs
  const contentScrollRef = useRef(null);
  const articleRef = useRef(null);
  const notesSaveTimeoutRef = useRef(null);
  const progressSaveTimeoutsRef = useRef({});
  const isTransitioningRef = useRef(false);

  // Initialize preferences and load documents from the backend API.
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);

    const savedToken = localStorage.getItem('auth-token');
    if (savedToken) {
      setAuthToken(savedToken);
      fetch('/api/auth/me', { headers: { Authorization: `Bearer ${savedToken}` } })
        .then(response => response.ok ? response.json() : Promise.reject())
        .then(async payload => {
          setAuthUser(payload.data);
          await loadLearningProgress(savedToken);
        })
        .catch(() => {
          localStorage.removeItem('auth-token');
          setAuthToken('');
          setAuthUser(null);
        });
    }

    const controller = new AbortController();
    const loadDocuments = async () => {
      try {
        const listResponse = await fetch('/api/documents', { signal: controller.signal });
        if (!listResponse.ok) throw new Error('Không thể tải danh sách tài liệu');
        const listPayload = await listResponse.json();
        const details = (listPayload.data || []).map(toLesson);

        setLessons(details);
        const savedStatuses = {};
        const savedFlashcards = {};
        details.forEach(doc => {
          savedStatuses[doc.id] = localStorage.getItem(`status-${doc.id}`) || 'unread';
          try {
            savedFlashcards[doc.id] = JSON.parse(localStorage.getItem(`flashcards-${doc.id}`) || '{}');
          } catch {
            savedFlashcards[doc.id] = {};
          }
        });
        setLessonStatuses(savedStatuses);
        setCheckedFlashcards(savedFlashcards);
      } catch (error) {
        if (error.name !== 'AbortError') console.error(error);
      }
    };

    loadDocuments();
    return () => controller.abort();
  }, []);

  const applyLearningProgress = (items) => {
    const serverStatuses = {};
    const serverFlashcards = {};

    (items || []).forEach(item => {
      serverStatuses[item.documentSlug] = item.status;
      serverFlashcards[item.documentSlug] = item.checkedFlashcards || {};
      localStorage.setItem(`status-${item.documentSlug}`, item.status);
      localStorage.setItem(`scroll-${item.documentSlug}`, String(item.scrollPosition || 0));
      localStorage.setItem(`notes-${item.documentSlug}`, item.note || '');
      localStorage.setItem(`flashcards-${item.documentSlug}`, JSON.stringify(item.checkedFlashcards || {}));
    });

    setLessonStatuses(current => ({ ...current, ...serverStatuses }));
    setCheckedFlashcards(current => ({ ...current, ...serverFlashcards }));

    if (activeLesson) {
      const currentProgress = (items || []).find(item => item.documentSlug === activeLesson.id);
      if (currentProgress) {
        setNoteText(currentProgress.note || '');
        setTimeout(() => {
          if (contentScrollRef.current) {
            contentScrollRef.current.scrollTop = currentProgress.scrollPosition || 0;
          }
        }, 0);
      }
    }
  };

  const loadLearningProgress = async (token) => {
    if (!token) return;
    const response = await fetch('/api/progress', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Cannot load learning progress');
    const payload = await response.json();
    applyLearningProgress(payload.data || []);
  };

  const saveLearningProgress = async (lessonId, changes, token = authToken) => {
    if (!token || !lessonId) return;
    const response = await fetch(`/api/progress/${encodeURIComponent(lessonId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(changes),
    });
    if (!response.ok) throw new Error('Cannot save learning progress');
  };

  const scheduleProgressSave = (lessonId, key, changes, delay = 1200) => {
    if (!authToken || !lessonId) return;
    const timeoutKey = `${lessonId}:${key}`;
    clearTimeout(progressSaveTimeoutsRef.current[timeoutKey]);
    progressSaveTimeoutsRef.current[timeoutKey] = setTimeout(() => {
      saveLearningProgress(lessonId, changes).catch(console.error);
      delete progressSaveTimeoutsRef.current[timeoutKey];
    }, delay);
  };

  // Calculate overall progress when lesson statuses change
  useEffect(() => {
    if (lessons.length === 0) return;
    
    let completed = 0;
    lessons.forEach(doc => {
      if (lessonStatuses[doc.id] === 'completed') {
        completed++;
      }
    });

    setCompletedCount(completed);
    setOverallProgress(Math.round((completed / lessons.length) * 100));
  }, [lessonStatuses, lessons]);

  // Handle active lesson change
  useEffect(() => {
    if (!activeLesson) return;

    // Set transitioning flag
    isTransitioningRef.current = true;

    // 1. Load note for this lesson
    const savedNote = localStorage.getItem(`notes-${activeLesson.id}`) || '';
    setNoteText(savedNote);
    setIsNoteSaved(false);

    // 2. Generate flashcards from headers
    const cardItems = generateFlashcardsFromContent(activeLesson.content || '');
    setFlashcards(cardItems);

    // 3. Reset scroll position to top or restore last scroll pos
    if (contentScrollRef.current) {
      contentScrollRef.current.scrollTop = 0;
      const lastScroll = localStorage.getItem(`scroll-${activeLesson.id}`);
      
      const progressBar = document.getElementById('scroll-progress');
      if (progressBar) {
        progressBar.style.width = lastScroll ? '0%' : '0%';
      }

      setTimeout(() => {
        if (contentScrollRef.current) {
          contentScrollRef.current.scrollTop = lastScroll ? parseInt(lastScroll) : 0;
        }
        // Turn off transitioning flag after layout settles
        setTimeout(() => {
          isTransitioningRef.current = false;
        }, 150);
      }, 100);
    } else {
      isTransitioningRef.current = false;
    }

    // 4. Auto set status to 'studying' if it was 'unread'
    if (lessonStatuses[activeLesson.id] === 'unread') {
      updateLessonStatus(activeLesson.id, 'studying');
    }

    // 5. Highlight code blocks (Prism)
    setTimeout(() => {
      if (window.Prism) {
        window.Prism.highlightAll();
      }
      generateTOC();
    }, 100);

  }, [activeLesson]);

  // Handle notes auto-save (debounce)
  useEffect(() => {
    if (!activeLesson) return;

    // Clear previous timeout
    if (notesSaveTimeoutRef.current) {
      clearTimeout(notesSaveTimeoutRef.current);
    }

    // Don't save on initial empty render
    const savedNote = localStorage.getItem(`notes-${activeLesson.id}`) || '';
    if (noteText === savedNote) {
      return;
    }

    setIsNoteSaved(false);

    notesSaveTimeoutRef.current = setTimeout(() => {
      localStorage.setItem(`notes-${activeLesson.id}`, noteText);
      saveLearningProgress(activeLesson.id, { note: noteText }).catch(console.error);
      setIsNoteSaved(true);
      setTimeout(() => setIsNoteSaved(false), 2000);
    }, 1000);

    return () => {
      if (notesSaveTimeoutRef.current) {
        clearTimeout(notesSaveTimeoutRef.current);
      }
    };
  }, [noteText, activeLesson]);

  // Generate Table of Contents (TOC) from rendered DOM
  const generateTOC = () => {
    if (!articleRef.current) return;
    
    const headingElements = articleRef.current.querySelectorAll('h2, h3');
    const items = Array.from(headingElements).map((el, index) => {
      // ID already injected into HTML by addIdsToHeadings; generate fallback only if missing
      const text = el.innerText || el.textContent;
      if (!el.id) {
        el.id = text.toLowerCase().replace(ALLOWED_CHARS, '').replace(/\s+/g, '-').trim();
      }
      const id = el.id;

      return {
        id,
        text,
        level: el.tagName.toLowerCase(),
      };
    });

    setTocItems(items);
    if (items.length > 0) {
      setActiveTocId(items[0].id);
    }
  };

  // Generate key learning points (flashcards) from content headings
  const generateFlashcardsFromContent = (content) => {
    const lines = content.split('\n');
    const points = [];
    
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('## **') || trimmed.startsWith('## ')) {
        const title = trimmed
          .replace(/^#+\s*/, '')
          .replace(/^\*+\s*/, '')
          .replace(/\*+\s*$/, '')
          .replace(/^_\s*/, '')
          .replace(/_\s*$/, '')
          .trim();
        
        // Exclude generic headings
        if (
          title && 
          !title.toLowerCase().includes('cẩm nang') && 
          !title.toLowerCase().includes('tài liệu') &&
          !title.toLowerCase().includes('lời nói đầu') &&
          !title.toLowerCase().includes('phần') &&
          !title.toLowerCase().includes('chương')
        ) {
          points.push(`Hiểu rõ khái niệm và cách áp dụng của: ${title}`);
        }
      }
    });

    // Fallback if no headings found
    if (points.length === 0) {
      points.push("Đã đọc kỹ toàn bộ nội dung tài liệu.");
      points.push("Nắm vững các ví dụ thực hành được cung cấp.");
      points.push("Hiểu rõ các sơ đồ kiến trúc và phân tích hệ thống.");
    }

    return points.slice(0, 8); // Limit to 8 core cards per lesson
  };

  // Update status of active lesson
  const updateLessonStatus = (lessonId, newStatus) => {
    const updatedStatuses = { ...lessonStatuses, [lessonId]: newStatus };
    setLessonStatuses(updatedStatuses);
    localStorage.setItem(`status-${lessonId}`, newStatus);
    saveLearningProgress(lessonId, { status: newStatus }).catch(console.error);
  };

  // Toggle theme Sáng/Tối
  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  const updateAuthForm = (field, value) => {
    setAuthForm(prev => ({ ...prev, [field]: value }));
  };

  const submitAuth = async (event) => {
    event.preventDefault();
    setIsAuthSubmitting(true);
    setAuthMessage('');
    try {
      const path = authView === 'register'
        ? 'register'
        : authView === 'verify'
          ? 'verify-email'
          : 'login';
      const body = authView === 'verify'
        ? { email: authForm.email, otp: authForm.otp }
        : { email: authForm.email, password: authForm.password };
      const response = await fetch(`/api/auth/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message || 'Request failed');
      }
      if (authView === 'register') {
        setAuthView('verify');
        setAuthForm(current => ({ ...current, password: '', otp: '' }));
        setAuthMessage('OTP sent. Please check your email.');
      } else if (authView === 'verify') {
        setAuthView('login');
        setAuthMessage('Email verified. You can login now.');
      } else {
        localStorage.setItem('auth-token', payload.data.token);
        setAuthToken(payload.data.token);
        setAuthUser(payload.data.user);
        await loadLearningProgress(payload.data.token);
        setIsAuthOpen(false);
        setAuthForm({ email: '', password: '', otp: '' });
      }
    } catch (error) {
      setAuthMessage(error.message);
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const logout = () => {
    Object.values(progressSaveTimeoutsRef.current).forEach(clearTimeout);
    progressSaveTimeoutsRef.current = {};
    localStorage.removeItem('auth-token');
    setAuthToken('');
    setAuthUser(null);
    setPendingLessonId('');
    setActiveLesson(null);
    setLessons(current => current.map(lesson => ({ ...lesson, content: '' })));
  };

  const loadLessonDetail = async (lesson, token = authToken) => {
    if (!lesson || lesson.content) return lesson;
    if (!token) throw new Error('Login is required to view this document');

    setLoadingLessonId(lesson.id);
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(lesson.slug)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (response.status === 401) {
        localStorage.removeItem('auth-token');
        setAuthToken('');
        setAuthUser(null);
        setActiveLesson(null);
        setPendingLessonId(lesson.id);
        setAuthView('login');
        setAuthMessage('Your session has expired. Please login again.');
        setIsAuthOpen(true);
        throw new Error('Session expired');
      }
      if (!response.ok) throw new Error(`Cannot load document ${lesson.slug}`);

      const payload = await response.json();
      const detailedLesson = toLesson(payload.data);

      setLessons(currentLessons => currentLessons.map(item => (
        item.id === detailedLesson.id ? { ...item, ...detailedLesson } : item
      )));
      setActiveLesson(current => (
        current?.id === detailedLesson.id ? { ...current, ...detailedLesson } : current
      ));

      return detailedLesson;
    } finally {
      setLoadingLessonId(current => current === lesson.id ? '' : current);
    }
  };

  const openLesson = (lesson) => {
    if (!lesson) return;
    if (!authToken) {
      setPendingLessonId(lesson.id);
      setAuthView('login');
      setAuthMessage('Please login to view the document.');
      setIsAuthOpen(true);
      return;
    }

    setActiveLesson(lesson);
    setIsSidebarLeftActive(false);
    setIsSidebarRightActive(false);
    loadLessonDetail(lesson).catch(console.error);
  };

  useEffect(() => {
    if (!authToken || !pendingLessonId) return;
    const lesson = lessons.find(item => item.id === pendingLessonId);
    if (!lesson) return;

    setPendingLessonId('');
    setActiveLesson(lesson);
    setIsSidebarLeftActive(false);
    setIsSidebarRightActive(false);
    loadLessonDetail(lesson, authToken).catch(console.error);
  }, [authToken, pendingLessonId, lessons]);

  // Handle Search Input
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    const query = searchQuery.toLowerCase();
    const results = [];

    lessons.forEach(doc => {
      const inTitle = doc.title.toLowerCase().includes(query);
      const inCategory = doc.category.toLowerCase().includes(query);

      if (inTitle || inCategory) {
        results.push({
          id: doc.id,
          title: doc.title,
          snippet: `${doc.category} · ${doc.readingTime} min · ${doc.wordCount} words`,
          matchType: inTitle ? 'title' : 'category'
        });
      }
    });

    setSearchResults(results);
    setShowSearchResults(true);
  }, [searchQuery, lessons]);

  // Scroll listener for reading position and TOC ScrollSpy
  const handleScroll = () => {
    if (!contentScrollRef.current || isTransitioningRef.current) return;
    
    const container = contentScrollRef.current;
    const { scrollTop, scrollHeight, clientHeight } = container;
    
    // 1. Update top scroll progress bar
    const totalScroll = scrollHeight - clientHeight;
    const scrollPercent = totalScroll > 0 ? (scrollTop / totalScroll) * 100 : 0;
    const progressBar = document.getElementById('scroll-progress');
    if (progressBar) {
      progressBar.style.width = `${scrollPercent}%`;
    }

    // 2. Save scroll position to localStorage
    if (activeLesson) {
      localStorage.setItem(`scroll-${activeLesson.id}`, scrollTop.toString());
      scheduleProgressSave(activeLesson.id, 'scroll', { scrollPosition: Math.round(scrollTop) });
    }

    // 3. Auto mark as completed if scrolled past 92%
    if (scrollPercent > 92 && activeLesson && lessonStatuses[activeLesson.id] !== 'completed') {
      updateLessonStatus(activeLesson.id, 'completed');
    }

    // 4. ScrollSpy: Highlight active TOC heading
    if (tocItems.length === 0) return;

    let currentActiveId = tocItems[0].id;
    for (let i = 0; i < tocItems.length; i++) {
      const headingEl = document.getElementById(tocItems[i].id);
      if (headingEl) {
        const rect = headingEl.getBoundingClientRect();
        // If the heading is in the upper part of the viewport
        if (rect.top < 150) {
          currentActiveId = tocItems[i].id;
        } else {
          break;
        }
      }
    }
    setActiveTocId(currentActiveId);
  };

  // Complete lesson button handler (triggers confetti)
  const handleCompleteLesson = () => {
    if (!activeLesson) return;

    updateLessonStatus(activeLesson.id, 'completed');

    // Confetti celebration
    if (window.confetti) {
      // Central burst
      window.confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 }
      });

      // Side bursts
      const duration = 2 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 1000 };

      const randomInRange = (min, max) => Math.random() * (max - min) + min;

      const interval = setInterval(function() {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);
        window.confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } }));
        window.confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } }));
      }, 250);
    }
  };

  // Toggle flashcard checked status
  const handleToggleFlashcard = (index) => {
    if (!activeLesson) return;

    const lessonChecked = { ...checkedFlashcards[activeLesson.id] };
    lessonChecked[index] = !lessonChecked[index];
    
    const updatedChecked = { ...checkedFlashcards, [activeLesson.id]: lessonChecked };
    setCheckedFlashcards(updatedChecked);
    localStorage.setItem(`flashcards-${activeLesson.id}`, JSON.stringify(lessonChecked));
    saveLearningProgress(activeLesson.id, { checkedFlashcards: lessonChecked }).catch(console.error);

    // If all flashcards are checked, auto mark lesson as completed
    const allChecked = flashcards.every((_, i) => lessonChecked[i]);
    if (allChecked && lessonStatuses[activeLesson.id] !== 'completed') {
      handleCompleteLesson();
    }
  };

  // Reset flashcards
  const handleResetFlashcards = () => {
    if (!activeLesson) return;
    const updatedChecked = { ...checkedFlashcards, [activeLesson.id]: {} };
    setCheckedFlashcards(updatedChecked);
    localStorage.setItem(`flashcards-${activeLesson.id}`, JSON.stringify({}));
    saveLearningProgress(activeLesson.id, { checkedFlashcards: {} }).catch(console.error);
  };

  // Group lessons by category
  const groupedLessons = {};
  lessons.forEach(lesson => {
    if (!groupedLessons[lesson.category]) {
      groupedLessons[lesson.category] = [];
    }
    groupedLessons[lesson.category].push(lesson);
  });

  // Next/Prev navigation
  const currentIdx = lessons.findIndex(l => l.id === activeLesson?.id);
  const prevLesson = currentIdx > 0 ? lessons[currentIdx - 1] : null;
  const nextLesson = currentIdx < lessons.length - 1 ? lessons[currentIdx + 1] : null;

  // Render status dropdown class
  const getStatusDotClass = (status) => {
    if (status === 'completed') return 'status-dot status-completed';
    if (status === 'studying') return 'status-dot status-studying';
    return 'status-dot status-unread';
  };

  const getResumeLesson = () => {
    if (lessons.length === 0) return null;
    const studying = lessons.find(l => lessonStatuses[l.id] === 'studying');
    if (studying) return studying;
    const unread = lessons.find(l => lessonStatuses[l.id] === 'unread');
    if (unread) return unread;
    return lessons[0];
  };

  const getStatusText = (status) => {
    if (status === 'completed') return 'Đã hoàn thành';
    if (status === 'studying') return 'Đang học';
    return 'Chưa học';
  };

  return (
    <>
      {/* Top Progress Scroll Indicator */}
      <div id="scroll-progress" className="scroll-progress-bar"></div>

      <div 
        className="app-container"
        style={{ 
          gridTemplateColumns: activeLesson 
            ? 'var(--sidebar-left-width) 1fr var(--sidebar-right-width)' 
            : 'var(--sidebar-left-width) 1fr' 
        }}
      >
        
        {/* Sidebar Left: Navigation & Overall Progress */}
        <aside className={`sidebar-left ${isSidebarLeftActive ? 'active' : ''}`}>
          <div className="sidebar-header">
            <div className="logo" onClick={() => setActiveLesson(null)} style={{ cursor: 'pointer' }}>
              <div className="logo-icon">
                <Terminal size={18} />
              </div>
              <span className="logo-text">CodeLife<span>Academy</span></span>
            </div>
            <button 
              className="mobile-close-btn" 
              onClick={() => setIsSidebarLeftActive(false)}
            >
              <X size={20} />
            </button>
          </div>

          {/* Overall Progress Card */}
          <div className="overall-progress-card">
            <div className="progress-info">
              <span className="progress-label">Tiến độ học tập</span>
              <span className="progress-percentage">{overallProgress}%</span>
            </div>
            <div className="progress-bar-container">
              <div 
                className="progress-bar-fill" 
                style={{ width: `${overallProgress}%` }}
              ></div>
            </div>
            <div className="progress-stats">
              <span>{completedCount}/{lessons.length} bài học</span>
              <span className="badge success-badge">
                {overallProgress === 100 ? 'Thành công' : 'Đang học tập'}
              </span>
            </div>
          </div>

          {/* Search Box */}
          <div className="search-box">
            <Search className="search-icon" size={16} />
            <input 
              type="text" 
              placeholder="Tìm kiếm bài viết..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button 
                className="clear-search-btn"
                onClick={() => setSearchQuery('')}
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Search Results Drawer */}
          {showSearchResults && (
            <div className="search-results-list">
              <div className="search-results-header">
                <span>KẾT QUẢ TÌM KIẾM ({searchResults.length})</span>
                <button onClick={() => setSearchQuery('')}>Đóng</button>
              </div>
              <div id="search-results-items">
                {searchResults.length === 0 ? (
                  <p style={{ padding: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    Không tìm thấy bài viết nào.
                  </p>
                ) : (
                  searchResults.map(result => (
                    <div 
                      key={result.id}
                      className="search-result-item"
                      onClick={() => {
                        const target = lessons.find(l => l.id === result.id);
                        if (target) openLesson(target);
                        setSearchQuery('');
                      }}
                    >
                      <h4>{result.title}</h4>
                      <p className="search-result-snippet" dangerouslySetInnerHTML={{
                        __html: result.snippet.replace(
                          new RegExp(`(${searchQuery})`, 'gi'), 
                          '<mark>$1</mark>'
                        )
                      }}></p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Lesson Navigation */}
          <nav className="lesson-navigation">
            {Object.keys(groupedLessons).map(category => (
              <div key={category} className="nav-category">
                <h3 className="category-title">{category}</h3>
                <ul className="lesson-list">
                  {groupedLessons[category].map(lesson => {
                    const status = lessonStatuses[lesson.id] || 'unread';
                    const isActive = activeLesson?.id === lesson.id;
                    return (
                      <li 
                        key={lesson.id}
                        className={`lesson-item-link ${isActive ? 'active' : ''}`}
                        onClick={() => openLesson(lesson)}
                      >
                        <div className="lesson-status-icon">
                          <span className={`status-indicator ${status}`}></span>
                        </div>
                        <div className="lesson-title-meta">
                          <span className="lesson-title-text" title={lesson.title}>
                            {lesson.title}
                          </span>
                          <div className="lesson-meta-desc">
                            <span>{lesson.readingTime} phút</span>
                            <span>{lesson.wordCount} từ</span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="main-content">
          <header className="content-header">
            <div className="header-left">
              <button 
                className="hamburger-menu" 
                onClick={() => setIsSidebarLeftActive(true)}
              >
                <Menu size={20} />
              </button>
              <div className="breadcrumb">
                {activeLesson ? (
                  <>
                    <span>{activeLesson.category}</span>
                    <ChevronRight size={14} />
                    <span className="active">{activeLesson.title}</span>
                  </>
                ) : (
                  <>
                    <span>Tổng quan</span>
                    <ChevronRight size={14} />
                    <span className="active">Bảng học tập</span>
                  </>
                )}
              </div>
            </div>
            
            <div className="header-right">
              {authUser ? (
                <div className="auth-user-chip">
                  <span>{authUser.email}</span>
                  <button className="icon-button" onClick={logout} title="Logout">
                    <LogOut size={15} />
                  </button>
                </div>
              ) : (
                <button className="auth-open-btn" onClick={() => { setAuthView('login'); setAuthMessage(''); setIsAuthOpen(true); }}>
                  <UserRound size={15} />
                  <span>Login</span>
                </button>
              )}

              {activeLesson ? (
                <div className="status-dropdown-container">
                  <button 
                    className="status-dropdown-btn" 
                    onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                  >
                    <span className={getStatusDotClass(lessonStatuses[activeLesson.id])}></span>
                    <span>{getStatusText(lessonStatuses[activeLesson.id])}</span>
                    <ChevronDown size={14} />
                  </button>
                  
                  {isStatusDropdownOpen && (
                    <ul className="status-dropdown-menu active">
                      <li onClick={() => { updateLessonStatus(activeLesson.id, 'unread'); setIsStatusDropdownOpen(false); }}>
                        <span className="status-dot status-unread"></span>
                        Chưa học
                      </li>
                      <li onClick={() => { updateLessonStatus(activeLesson.id, 'studying'); setIsStatusDropdownOpen(false); }}>
                        <span className="status-dot status-studying"></span>
                        Đang học
                      </li>
                      <li onClick={() => { updateLessonStatus(activeLesson.id, 'completed'); setIsStatusDropdownOpen(false); }}>
                        <span className="status-dot status-completed"></span>
                        Đã hoàn thành
                      </li>
                    </ul>
                  )}
                </div>
              ) : (
                <button 
                  className="theme-toggle" 
                  onClick={toggleTheme}
                  title="Chuyển đổi giao diện Sáng/Tối"
                  style={{ alignSelf: 'center' }}
                >
                  {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                </button>
              )}
              
              {activeLesson && (
                <button 
                  className="hamburger-menu" 
                  style={{ display: 'none' }} // visible only on tablet/mobile layout
                  onClick={() => setIsSidebarRightActive(true)}
                >
                  <ListOrdered size={20} />
                </button>
              )}
            </div>
          </header>

          <div 
            className="content-body-scroll" 
            ref={contentScrollRef}
            onScroll={handleScroll}
          >
            {activeLesson ? (
              <article className="document-container" ref={articleRef}>
                <div className="document-meta-info">
                  <span className="meta-item"><Folder size={14} /> {activeLesson.category}</span>
                  <span className="meta-item"><Clock size={14} /> {activeLesson.readingTime} phút đọc</span>
                  <span className="meta-item"><FileText size={14} /> {activeLesson.wordCount} từ</span>
                </div>

                <h1 className="document-title">{activeLesson.title}</h1>

                {loadingLessonId === activeLesson.id && !activeLesson.content ? (
                  <div className="document-loading">Loading document...</div>
                ) : (
                  <div 
                    className="markdown-body"
                    dangerouslySetInnerHTML={{ 
                      __html: addIdsToHeadings(marked.parse(activeLesson.content || '')) 
                    }}
                  ></div>
                )}

                {/* Footer buttons */}
                <div className="lesson-footer">
                  <div className="completion-section">
                    <h3>Tuyệt vời! Bạn đã nắm vững kiến thức bài này chưa?</h3>
                    <p>Hãy đánh dấu hoàn thành để ghi nhận tiến độ học tập của mình.</p>
                    <button 
                      className="btn btn-primary btn-complete-lesson" 
                      onClick={handleCompleteLesson}
                      disabled={lessonStatuses[activeLesson.id] === 'completed'}
                    >
                      <CheckCircle2 size={16} />
                      <span>
                        {lessonStatuses[activeLesson.id] === 'completed' 
                          ? 'Đã hoàn thành bài học' 
                          : 'Đánh dấu đã hoàn thành'}
                      </span>
                    </button>
                  </div>

                  <div className="navigation-controls">
                    {prevLesson ? (
                      <button 
                        className="btn btn-secondary nav-btn" 
                        onClick={() => openLesson(prevLesson)}
                      >
                        <ArrowLeft size={16} />
                        <div className="nav-btn-text">
                          <span className="label">BÀI TRƯỚC</span>
                          <span className="title">{prevLesson.title}</span>
                        </div>
                      </button>
                    ) : (
                      <div className="nav-btn" style={{ visibility: 'hidden' }}></div>
                    )}

                    {nextLesson ? (
                      <button 
                        className="btn btn-secondary nav-btn" 
                        onClick={() => openLesson(nextLesson)}
                      >
                        <div className="nav-btn-text">
                          <span className="label">BÀI TIẾP THEO</span>
                          <span className="title">{nextLesson.title}</span>
                        </div>
                        <ArrowRight size={16} />
                      </button>
                    ) : (
                      <div className="nav-btn" style={{ visibility: 'hidden' }}></div>
                    )}
                  </div>
                </div>
              </article>
            ) : (
              <div className="dashboard-container">
                <div className="dashboard-banner">
                  <h2 className="dashboard-welcome-title">Chào mừng bạn đến với CodeLife Academy!</h2>
                  <p className="dashboard-welcome-desc">
                    Nền tảng tự học kiến thức hệ thống, cơ sở dữ liệu, DevOps, thuật toán và bảo mật chuyên sâu.
                    Tất cả tài liệu được tuyển chọn kỹ lưỡng giúp bạn nâng cấp tư duy lập trình chuyên nghiệp.
                  </p>
                  {getResumeLesson() && (
                    <button 
                      className="dashboard-resume-btn"
                      onClick={() => openLesson(getResumeLesson())}
                    >
                      <span>Học tiếp: {getResumeLesson().title}</span>
                      <ChevronRight size={14} />
                    </button>
                  )}
                </div>

                <div className="dashboard-stats-grid">
                  <div className="dashboard-stat-card">
                    <span className="dashboard-stat-val accent">{overallProgress}%</span>
                    <span className="dashboard-stat-label">Tiến độ tổng quan</span>
                  </div>
                  <div className="dashboard-stat-card">
                    <span className="dashboard-stat-val">{completedCount} / {lessons.length}</span>
                    <span className="dashboard-stat-label">Bài học đã hoàn thành</span>
                  </div>
                  <div className="dashboard-stat-card">
                    <span className="dashboard-stat-val">
                      {lessons.filter(l => lessonStatuses[l.id] === 'studying').length}
                    </span>
                    <span className="dashboard-stat-label">Bài học đang học</span>
                  </div>
                </div>

                {Object.keys(groupedLessons).map(category => (
                  <div key={category} className="dashboard-category-section">
                    <h3 className="dashboard-category-title">{category}</h3>
                    <div className="dashboard-lessons-grid">
                      {groupedLessons[category].map(lesson => {
                        const status = lessonStatuses[lesson.id] || 'unread';
                        return (
                          <div 
                            key={lesson.id} 
                            className="dashboard-lesson-card"
                            onClick={() => openLesson(lesson)}
                          >
                            <div className="dashboard-lesson-card-header">
                              <h4>{lesson.title}</h4>
                              <span className={`status-badge ${status}`}>
                                {getStatusText(status)}
                              </span>
                            </div>
                            <p className="dashboard-lesson-card-desc">
                              {`${lesson.category} · ${lesson.readingTime} min · ${lesson.wordCount} words`}
                            </p>
                            <div className="dashboard-lesson-card-meta">
                              <span><Clock size={12} /> {lesson.readingTime} phút đọc</span>
                              <span><FileText size={12} /> {lesson.wordCount} từ</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>

        {/* Sidebar Right: TOC, Notes, Flashcards & Theme Toggle (Visible only when viewing a lesson) */}
        {activeLesson && (
          <aside className={`sidebar-right ${isSidebarRightActive ? 'active' : ''}`}>
            <div className="sidebar-right-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button 
                  className="mobile-close-btn" 
                  style={{ display: isSidebarRightActive ? 'block' : 'none' }}
                  onClick={() => setIsSidebarRightActive(false)}
                >
                  <X size={20} />
                </button>
                
                <button 
                  className="theme-toggle" 
                  onClick={toggleTheme}
                  title="Chuyển đổi giao diện Sáng/Tối"
                >
                  {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                </button>
              </div>

              <div className="sidebar-right-tabs">
                <button 
                  className={`tab-btn ${activeTab === 'toc' ? 'active' : ''}`}
                  onClick={() => setActiveTab('toc')}
                >
                  Mục lục
                </button>
                <button 
                  className={`tab-btn ${activeTab === 'notes' ? 'active' : ''}`}
                  onClick={() => setActiveTab('notes')}
                >
                  Ghi chú
                </button>
                <button 
                  className={`tab-btn ${activeTab === 'flashcards' ? 'active' : ''}`}
                  onClick={() => setActiveTab('flashcards')}
                >
                  Gợi ý
                </button>
              </div>
            </div>

            <div className="sidebar-right-content">
              {/* Tab: Table of Contents */}
              {activeTab === 'toc' && (
                <div className="tab-pane active">
                  <div className="toc-container">
                    <div className="toc-header">
                      <ListOrdered size={14} />
                      <span>BÀI VIẾT NÀY CÓ</span>
                    </div>
                    <ul className="toc-list">
                      {tocItems.map(item => (
                        <li 
                          key={item.id}
                          className={`toc-item ${item.level === 'h3' ? 'indent-h3' : ''} ${activeTocId === item.id ? 'active' : ''}`}
                          onClick={() => {
                            const element = document.getElementById(item.id);
                            if (element && contentScrollRef.current) {
                              const container = contentScrollRef.current;
                              const containerTop = container.getBoundingClientRect().top;
                              const elementTop = element.getBoundingClientRect().top;
                              const scrollOffset = elementTop - containerTop + container.scrollTop - 24;
                              container.scrollTo({ top: scrollOffset, behavior: 'smooth' });
                              setActiveTocId(item.id);
                              setIsSidebarRightActive(false);
                            }
                          }}
                          title={item.text}
                        >
                          {item.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Tab: Personal Notes */}
              {activeTab === 'notes' && (
                <div className="tab-pane active">
                  <div className="notes-container">
                    <div className="notes-header">
                      <Edit3 size={14} />
                      <span>Ghi chú bài học</span>
                    </div>
                    <p className="notes-sub">Tự động lưu lại khi bạn dừng viết.</p>
                    <textarea 
                      id="notes-textarea"
                      placeholder="Viết ghi chú quan trọng ở đây..."
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                    ></textarea>
                    <div className={`notes-status ${isNoteSaved ? 'visible' : ''}`}>
                      <Check size={12} />
                      <span>Đã tự động lưu ghi chú</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: Flashcards / Key Points */}
              {activeTab === 'flashcards' && (
                <div className="tab-pane active">
                  <div className="flashcards-container">
                    <div className="flashcards-header">
                      <Lightbulb size={14} />
                      <span>Các điểm cốt lõi</span>
                    </div>
                    <p className="flashcards-sub">Tích chọn khi bạn đã nắm chắc phần kiến thức tương ứng:</p>
                    <ul className="flashcard-list">
                      {flashcards.map((card, i) => {
                        const isChecked = checkedFlashcards[activeLesson?.id]?.[i] || false;
                        return (
                          <li 
                            key={i}
                            className={`flashcard-item ${isChecked ? 'checked' : ''}`}
                            onClick={() => handleToggleFlashcard(i)}
                          >
                            <div className="flashcard-checkbox">
                              {isChecked && <Check size={10} />}
                            </div>
                            <span className="flashcard-text">{card}</span>
                          </li>
                        );
                      })}
                    </ul>
                    
                    <button 
                      className="btn btn-secondary reset-flashcards-btn" 
                      onClick={handleResetFlashcards}
                    >
                      <RotateCcw size={12} />
                      <span>Đặt lại trạng thái</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}

      </div>

      {isAuthOpen && (
        <div className="auth-modal-backdrop" onClick={() => setIsAuthOpen(false)}>
          <form className="auth-modal" onSubmit={submitAuth} onClick={(event) => event.stopPropagation()}>
            <div className="auth-modal-header">
              <div>
                <span className="auth-kicker">Account</span>
                <h2>{authView === 'register' ? 'Register' : authView === 'verify' ? 'Verify email' : 'Login'}</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setIsAuthOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <label className="auth-field">
              <span>Email</span>
              <input
                type="email"
                value={authForm.email}
                onChange={(event) => updateAuthForm('email', event.target.value)}
                readOnly={authView === 'verify'}
                required
              />
            </label>

            {authView !== 'verify' && (
              <label className="auth-field">
                <span>Password</span>
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(event) => updateAuthForm('password', event.target.value)}
                  minLength={8}
                  required
                />
              </label>
            )}

            {authView === 'verify' && (
              <label className="auth-field">
                <span>OTP</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={authForm.otp}
                  onChange={(event) => updateAuthForm('otp', event.target.value)}
                  maxLength={6}
                  required
                />
              </label>
            )}

            {authMessage && <p className="auth-message">{authMessage}</p>}

            <button className="auth-submit-btn" type="submit" disabled={isAuthSubmitting}>
              {isAuthSubmitting ? 'Submitting...' : authView === 'register' ? 'Send OTP' : authView === 'verify' ? 'Verify' : 'Login'}
            </button>

            <div className="auth-switch-row">
              {authView === 'login' ? (
                <button type="button" onClick={() => { setAuthView('register'); setAuthMessage(''); }}>
                  Create account
                </button>
              ) : (
                <button type="button" onClick={() => { setAuthView('login'); setAuthMessage(''); }}>
                  Back to login
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </>
  );
}
