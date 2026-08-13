import { type ReactNode, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Minimal, dependency-free code block with a copy button and very light
 * token coloring. A real syntax highlighter (e.g. Shiki) can replace this
 * later without touching callers.
 */
export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false)
  const highlighted = highlight(code, lang)

  return (
    <div className='group relative my-3 overflow-hidden rounded-lg border bg-[#0b0e14] text-sm'>
      <div className='flex items-center justify-between border-b border-white/10 px-3 py-1.5'>
        <span className='font-mono text-xs text-white/50'>{lang || 'text'}</span>
        <Button
          variant='ghost'
          size='icon'
          className='size-7 text-white/60 hover:bg-white/10 hover:text-white'
          aria-label='Copy code'
          onClick={() => {
            void navigator.clipboard?.writeText(code)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? (
            <Check className='size-3.5' />
          ) : (
            <Copy className='size-3.5' />
          )}
        </Button>
      </div>
      <pre className='overflow-x-auto px-3 py-3'>
        <code className='font-mono'>{highlighted}</code>
      </pre>
    </div>
  )
}

const KEYWORDS = new Set([
  'import', 'export', 'from', 'const', 'let', 'var', 'function', 'return',
  'if', 'else', 'for', 'while', 'class', 'new', 'await', 'async', 'type',
  'interface', 'extends', 'implements', 'public', 'private', 'void', 'def',
  'print', 'package', 'func', 'struct', 'enum', 'switch', 'case',
])

function highlight(code: string, lang?: string): ReactNode {
  // Only apply heuristic coloring for code-like languages.
  const codeLike = !lang || !['text', 'bash', 'sh', 'json', 'md', 'mermaid'].includes(lang)
  if (!codeLike) {
    return <>{code}</>
  }
  const lines = code.split('\n')
  return (
    <>
      {lines.map((line, li) => (
        <span key={li} className='block'>
          {renderLine(line)}
        </span>
      ))}
    </>
  )
}

function renderLine(line: string): ReactNode {
  const out: ReactNode[] = []
  // Comment
  const commentIdx = line.search(/\/\/|#/)
  let codePart = line
  let commentPart = ''
  if (commentIdx >= 0) {
    codePart = line.slice(0, commentIdx)
    commentPart = line.slice(commentIdx)
  }
  // Tokenize by spaces/quotes
  const regex = /("[^"]*"|'[^']*'|\S+)/g
  let match: RegExpExecArray | null
  let last = 0
  while ((match = regex.exec(codePart)) !== null) {
    if (match.index > last) out.push(codePart.slice(last, match.index))
    const token = match[0]
    if (/^["'].*["']$/.test(token)) {
      out.push(
        <span key={out.length} className='text-emerald-300'>
          {token}
        </span>
      )
    } else if (KEYWORDS.has(token)) {
      out.push(
        <span key={out.length} className='text-violet-300'>
          {token}
        </span>
      )
    } else if (/^\d/.test(token)) {
      out.push(
        <span key={out.length} className='text-amber-300'>
          {token}
        </span>
      )
    } else {
      out.push(token)
    }
    last = match.index + token.length
  }
  if (last < codePart.length) out.push(codePart.slice(last))
  if (commentPart) {
    out.push(
      <span key={out.length} className='text-white/40'>
        {commentPart}
      </span>
    )
  }
  return out
}
