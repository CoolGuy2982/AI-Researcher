
import React, { useEffect, useRef } from 'react';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true
});

interface MarkdownRendererProps {
  content: string;
  experimentId?: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, experimentId }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      // Rewrite relative image paths to workspace API URLs
      let processed = content;
      if (experimentId) {
        processed = processed.replace(
          /!\[([^\]]*)\]\((?!https?:\/\/)([^)]+)\)/g,
          (_, alt, src) => `![${alt}](/api/workspace/${experimentId}/file?path=${encodeURIComponent(src)})`
        );
      }

      // Basic KaTeX manual processing for $...$ and $$...$$
      processed = processed
        .replace(/\$\$(.*?)\$\$/gs, (_, formula) => {
          try { return `<div class="katex-display">${(window as any).katex.renderToString(formula, { displayMode: true })}</div>`; }
          catch (e) { return formula; }
        })
        .replace(/\$(.*?)\$/g, (_, formula) => {
          try { return (window as any).katex.renderToString(formula, { displayMode: false }); }
          catch (e) { return formula; }
        });

      containerRef.current.innerHTML = md.render(processed);
    }
  }, [content]);

  return <div ref={containerRef} className="prose prose-sm max-w-none text-gray-700 leading-relaxed" />;
};

export default MarkdownRenderer;
