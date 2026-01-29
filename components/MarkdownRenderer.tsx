
import React, { useEffect, useRef } from 'react';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true
});

interface MarkdownRendererProps {
  content: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      // Basic KaTeX manual processing for $...$ and $$...$$
      let processed = content
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
