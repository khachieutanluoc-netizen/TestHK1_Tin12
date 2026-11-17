import React from 'react';

interface CodeSnippetTextProps {
  text: string;
  className?: string;
}

/**
 * Hiển thị văn bản có chứa thẻ HTML hoặc đoạn mã CSS bằng font JetBrains Mono rõ nét,
 * giữ nguyên ký tự < > và dấu ngoặc kép theo đúng yêu cầu đặc tả đề Tin học 12.
 */
export const CodeSnippetText: React.FC<CodeSnippetTextProps> = ({ text, className = '' }) => {
  // Tách các đoạn mã HTML/CSS inline (ví dụ: <input type="text">, <h1>...</h1>, { color: red; })
  const tokenRegex = /(<\/?[a-zA-Z][^>\n]*>|`[^`]+`|\{[^{}\n]+:[^{}\n]+\})/g;
  const parts = text.split(tokenRegex);

  return (
    <span className={`whitespace-pre-line ${className}`}>
      {parts.map((part, idx) => {
        if (!part) return null;
        const isTagOrCode =
          (part.startsWith('<') && part.endsWith('>')) ||
          (part.startsWith('`') && part.endsWith('`')) ||
          (part.startsWith('{') && part.endsWith('}'));

        if (isTagOrCode) {
          const clean =
            part.startsWith('`') && part.endsWith('`') ? part.slice(1, -1) : part;
          return (
            <code
              key={idx}
              className="font-mono text-[0.9em] bg-slate-100 text-slate-900 border border-slate-200 px-1.5 py-0.5 rounded mx-0.5 inline-block"
            >
              {clean}
            </code>
          );
        }
        return <React.Fragment key={idx}>{part}</React.Fragment>;
      })}
    </span>
  );
};
