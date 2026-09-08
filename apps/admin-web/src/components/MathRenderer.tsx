import React, { useMemo } from 'react';
import katex from 'katex';

interface MathRendererProps {
  content: string;
  className?: string;
}

export const MathRenderer: React.FC<MathRendererProps> = ({ content, className = '' }) => {
  const renderedHtml = useMemo(() => {
    if (!content) return '';

    // Regex to match $$display math$$ and $inline math$
    // First, process $$ ... $$ (display mode)
    // Then process $ ... $ (inline mode)
    try {
      const parts: { text: string; isMath: boolean; display: boolean }[] = [];
      let remainder = content;

      // Find $$ ... $$
      const displayRegex = /\$\$([\s\S]+?)\$\$/g;
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      const segments: { text: string; isMath: boolean; display: boolean }[] = [];

      while ((match = displayRegex.exec(content)) !== null) {
        if (match.index > lastIndex) {
          segments.push({
            text: content.substring(lastIndex, match.index),
            isMath: false,
            display: false,
          });
        }
        segments.push({
          text: match[1],
          isMath: true,
          display: true,
        });
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < content.length) {
        segments.push({
          text: content.substring(lastIndex),
          isMath: false,
          display: false,
        });
      }

      // Now for each non-math segment, look for inline $...$
      const finalSegments: { text: string; isMath: boolean; display: boolean }[] = [];
      const inlineRegex = /\$([^$]+?)\$/g;

      for (const seg of segments) {
        if (seg.isMath) {
          finalSegments.push(seg);
        } else {
          let innerLast = 0;
          let inlineMatch: RegExpExecArray | null;
          while ((inlineMatch = inlineRegex.exec(seg.text)) !== null) {
            if (inlineMatch.index > innerLast) {
              finalSegments.push({
                text: seg.text.substring(innerLast, inlineMatch.index),
                isMath: false,
                display: false,
              });
            }
            finalSegments.push({
              text: inlineMatch[1],
              isMath: true,
              display: false,
            });
            innerLast = inlineMatch.index + inlineMatch[0].length;
          }
          if (innerLast < seg.text.length) {
            finalSegments.push({
              text: seg.text.substring(innerLast),
              isMath: false,
              display: false,
            });
          }
        }
      }

      // Render each segment
      return finalSegments
        .map((seg) => {
          if (seg.isMath) {
            try {
              return katex.renderToString(seg.text, {
                displayMode: seg.display,
                throwOnError: false,
              });
            } catch {
              return `<code>${seg.text}</code>`;
            }
          }
          // Escape basic HTML in text segment and preserve newlines
          const escaped = seg.text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br />');
          return escaped;
        })
        .join('');
    } catch {
      return content;
    }
  }, [content]);

  return (
    <div
      className={`math-rendered prose prose-invert max-w-none text-slate-200 ${className}`}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
};
