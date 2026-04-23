import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Copy, Check, FileText, Code, BarChart, Download } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface CanvasProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
  type: 'text' | 'code' | 'chart';
}

export const Canvas: React.FC<CanvasProps> = ({ isOpen, onClose, title, content, type }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: '45%', opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="h-full border-l border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0d1117] flex flex-col overflow-hidden shadow-2xl relative z-30"
        >
          <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/50 dark:bg-[#0a0a0b]/50 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-accent/10 text-accent rounded-xl">
                {type === 'code' ? <Code size={18} /> : type === 'chart' ? <BarChart size={18} /> : <FileText size={18} />}
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold truncate dark:text-white uppercase tracking-wider">{title || 'Untitled Artifact'}</h3>
                <p className="text-[10px] text-neutral-400 font-medium lowercase italic">tạo bởi AI Assistant</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button 
                onClick={handleCopy}
                className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg text-neutral-500 transition-all active:scale-95"
                title="Sao chép nội dung"
              >
                {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
              </button>
              <button 
                className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg text-neutral-500 transition-all active:scale-95"
                title="Tải xuống"
              >
                <Download size={18} />
              </button>
              <div className="w-px h-4 bg-neutral-200 dark:bg-neutral-800 mx-1"></div>
              <button 
                onClick={onClose} 
                className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-neutral-400 hover:text-red-500 rounded-lg transition-all"
              >
                <X size={20} />
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-8 md:p-12 custom-scrollbar">
            <div className="max-w-3xl mx-auto">
              <div className="prose prose-neutral dark:prose-invert max-w-none markdown-body dark:text-neutral-300 transition-all duration-500">
                <ReactMarkdown>
                  {content}
                </ReactMarkdown>
              </div>
            </div>
          </div>
          
          <div className="p-4 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-[10px] text-neutral-400 font-bold uppercase tracking-widest bg-neutral-50/30 dark:bg-[#0a0a0b]/30">
            <span>Phiên bản 1.0</span>
            <div className="flex gap-4">
                <button className="hover:text-accent transition-colors">Xem lịch sử</button>
                <button className="hover:text-accent transition-colors">Yêu cầu chỉnh sửa</button>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};
