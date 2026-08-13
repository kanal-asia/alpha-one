import { type ReactNode } from 'react'
import { CodeBlock } from './code-block'

/**
 * Lightweight Markdown renderer (no external dependency).
 * Supports: headings, bold/italic, inline code, fenced code blocks,
 * unordered/ordered lists, tables, links, and <details> collapsible blocks.
 */
export function Markdown({ content }: { content: string }) {
  const blocks = parseBlocks(content)
  return (
    <div className='space-y-3 text-sm leading-relaxed text-foreground/90'>
      {blocks.map((block, i) => (
        <BlockRenderer key={i} block={block} />
      ))}
    </div>
  )
}

type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'code'; lang?: string; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'quote'; text: string }
  | { type: 'details'; summary: string; text: string }

function parseBlocks(raw: string): Block[] {
  const blocks: Block[] = []
  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code
    if (line.trimStart().startsWith('```')) {
      const lang = line.trim().slice(3).trim() || undefined
      const buf: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        buf.push(lines[i])
        i++
      }
      i++ // closing fence
      blocks.push({ type: 'code', lang, text: buf.join('\n') })
      continue
    }

    // Collapsible <details>
    if (line.trimStart().startsWith('<details')) {
      const summaryMatch = raw.match(/<summary>(.*?)<\/summary>/s)
      const summary = summaryMatch ? summaryMatch[1].trim() : 'Details'
      const end = lines.findIndex(
        (l, idx) => idx > i && l.trimStart().startsWith('</details>')
      )
      const inner = lines.slice(i + 1, end === -1 ? lines.length : end).join('\n')
      blocks.push({
        type: 'details',
        summary,
        text: inner.replace(/<summary>.*?<\/summary>/s, '').trim(),
      })
      i = end === -1 ? lines.length : end + 1
      continue
    }

    // Heading
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length,
        text: heading[2].trim(),
      })
      i++
      continue
    }

    // Table
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[-:\s|]+\|?\s*$/.test(lines[i + 1])) {
      const headers = splitRow(line)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && lines[i].includes('|')) {
        rows.push(splitRow(lines[i]))
        i++
      }
      blocks.push({ type: 'table', headers, rows })
      continue
    }

    // Blockquote
    if (line.trimStart().startsWith('>')) {
      const buf: string[] = []
      while (i < lines.length && lines[i].trimStart().startsWith('>')) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''))
        i++
      }
      blocks.push({ type: 'quote', text: buf.join('\n') })
      continue
    }

    // Lists
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line)
      const items: string[] = []
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''))
        i++
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    // Paragraph (gather consecutive non-empty, non-special lines)
    if (line.trim() === '') {
      i++
      continue
    }
    const buf: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trimStart().startsWith('```') &&
      !lines[i].match(/^(#{1,6})\s+/) &&
      !/^\s*([-*]|\d+\.)\s+/.test(lines[i]) &&
      !lines[i].trimStart().startsWith('>')
    ) {
      buf.push(lines[i])
      i++
    }
    blocks.push({ type: 'paragraph', text: buf.join('\n') })
  }

  return blocks
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((s) => s.trim())
}

function BlockRenderer({ block }: { block: Block }) {
  switch (block.type) {
    case 'heading': {
      const cls =
        block.level === 1
          ? 'text-xl font-bold'
          : block.level === 2
            ? 'text-lg font-semibold'
            : block.level === 3
              ? 'text-base font-semibold'
              : 'text-sm font-semibold'
      return <p className={cls}>{inline(block.text)}</p>
    }
    case 'code':
      return <CodeBlock code={block.text} lang={block.lang} />
    case 'list':
      return block.ordered ? (
        <ol className='ml-5 list-decimal space-y-1'>
          {block.items.map((it, k) => (
            <li key={k}>{inline(it)}</li>
          ))}
        </ol>
      ) : (
        <ul className='ml-5 list-disc space-y-1'>
          {block.items.map((it, k) => (
            <li key={k}>{inline(it)}</li>
          ))}
        </ul>
      )
    case 'table':
      return (
        <div className='overflow-x-auto rounded-md border'>
          <table className='w-full text-left text-xs'>
            <thead className='bg-muted/50'>
              <tr>
                {block.headers.map((h, k) => (
                  <th key={k} className='px-3 py-2 font-medium'>
                    {inline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className='border-t'>
                  {row.map((cell, c) => (
                    <td key={c} className='px-3 py-2'>
                      {inline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'quote':
      return (
        <blockquote className='border-s-2 border-muted-foreground/30 ps-3 text-muted-foreground'>
          {inline(block.text)}
        </blockquote>
      )
    case 'details':
      return (
        <details className='rounded-md border bg-muted/20 px-3 py-2'>
          <summary className='cursor-pointer text-xs font-medium'>
            {block.summary}
          </summary>
          <div className='mt-2'>
            <Markdown content={block.text} />
          </div>
        </details>
      )
    case 'paragraph':
    default:
      return (
        <p className='whitespace-pre-wrap'>
          {block.type === 'paragraph' ? inline(block.text) : null}
        </p>
      )
  }
}

/** Inline formatting: bold, italic, inline code, links. */
function inline(text: string): ReactNode {
  const tokens: ReactNode[] = []
  const regex = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) tokens.push(text.slice(last, m.index))
    if (m[2] !== undefined) tokens.push(<strong key={key++}>{m[2]}</strong>)
    else if (m[3] !== undefined) tokens.push(<strong key={key++}>{m[3]}</strong>)
    else if (m[4] !== undefined) tokens.push(<em key={key++}>{m[4]}</em>)
    else if (m[5] !== undefined) tokens.push(<em key={key++}>{m[5]}</em>)
    else if (m[6] !== undefined)
      tokens.push(
        <code
          key={key++}
          className='rounded bg-muted px-1 py-0.5 font-mono text-xs'
        >
          {m[6]}
        </code>
      )
    else if (m[7] !== undefined)
      tokens.push(
        <a
          key={key++}
          href={m[8]}
          target='_blank'
          rel='noreferrer'
          className='text-primary underline underline-offset-2'
        >
          {m[7]}
        </a>
      )
    last = m.index + m[0].length
  }
  if (last < text.length) tokens.push(text.slice(last))
  return tokens
}
