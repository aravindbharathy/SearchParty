'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

interface MarkdownViewProps {
  content: string
  className?: string
}

const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-2xl font-semibold text-text mb-3 mt-4 first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-xl font-semibold text-text mb-2 mt-3 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-lg font-semibold text-text mb-2 mt-3 first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-base font-semibold text-text mb-1 mt-2">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="text-sm text-text leading-relaxed mb-2">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-inside text-sm text-text leading-relaxed mb-2 ml-4 space-y-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-inside text-sm text-text leading-relaxed mb-2 ml-4 space-y-1">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-sm text-text">{children}</li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic">{children}</em>
  ),
  code: ({ className, children }) => {
    const isBlock = className?.includes('language-')
    if (isBlock) {
      return (
        <code className="block bg-bg border border-border rounded-md p-3 font-mono text-xs overflow-x-auto my-2">
          {children}
        </code>
      )
    }
    return (
      <code className="bg-bg px-1 rounded font-mono text-xs">{children}</code>
    )
  },
  pre: ({ children }) => (
    <pre className="bg-bg border border-border rounded-md p-3 font-mono text-xs overflow-x-auto my-2">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-accent/30 pl-4 italic text-text-muted my-2">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-border my-4" />,
  a: ({ href, children }) => (
    <a href={href} className="text-accent hover:underline" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="border-collapse text-sm w-full">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-border">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="border border-border px-3 py-1.5 text-left font-semibold text-text bg-bg">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border border-border px-3 py-1.5 text-text">{children}</td>
  ),
  tr: ({ children }) => (
    <tr className="border-b border-border">{children}</tr>
  ),
}

/**
 * Convert unlabeled fenced code blocks that contain markdown formatting
 * (bold, lists, etc.) into blockquotes so the markdown renders properly.
 * Code blocks with a language tag (```python, ```yaml) are left as-is.
 */
function convertMarkdownCodeBlocks(text: string): string {
  return text.replace(/```\s*\n([\s\S]*?)```/g, (_match, inner: string) => {
    // If the block contains markdown formatting, convert to blockquote
    const hasMarkdown = /\*\*|^- |^#{1,4} /m.test(inner)
    if (!hasMarkdown) return _match
    // Convert each line to a blockquote line
    const lines = inner.trimEnd().split('\n').map((line: string) => `> ${line}`)
    return lines.join('\n')
  })
}

export function MarkdownView({ content, className }: MarkdownViewProps) {
  const processed = convertMarkdownCodeBlocks(content)
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{processed}</ReactMarkdown>
    </div>
  )
}
