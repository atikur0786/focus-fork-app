import { useEffect, useRef, useCallback } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands'
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching, foldGutter, foldKeymap, HighlightStyle } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { tags } from '@lezer/highlight'

import { javascript } from '@codemirror/lang-javascript'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { rust } from '@codemirror/lang-rust'
import { cpp } from '@codemirror/lang-cpp'
import { java } from '@codemirror/lang-java'
import { xml } from '@codemirror/lang-xml'
import { sql } from '@codemirror/lang-sql'
import { yaml } from '@codemirror/lang-yaml'
import { go } from '@codemirror/lang-go'

const LANG_MAP: Record<string, () => ReturnType<typeof javascript>> = {
  ts: () => javascript({ typescript: true, jsx: false }),
  tsx: () => javascript({ typescript: true, jsx: true }),
  js: () => javascript({ jsx: false }),
  jsx: () => javascript({ jsx: true }),
  mjs: () => javascript(),
  cjs: () => javascript(),
  html: () => html(),
  htm: () => html(),
  vue: () => html(),
  svelte: () => html(),
  css: () => css(),
  scss: () => css(),
  less: () => css(),
  json: () => json(),
  jsonc: () => json(),
  md: () => markdown(),
  mdx: () => markdown(),
  py: () => python(),
  pyi: () => python(),
  rs: () => rust(),
  c: () => cpp(),
  cpp: () => cpp(),
  cc: () => cpp(),
  cxx: () => cpp(),
  h: () => cpp(),
  hpp: () => cpp(),
  java: () => java(),
  kt: () => java(),
  xml: () => xml(),
  svg: () => xml(),
  sql: () => sql(),
  yaml: () => yaml(),
  yml: () => yaml(),
  go: () => go(),
  toml: () => yaml(),
  ini: () => yaml(),
  conf: () => yaml(),
}

function getLangExtension(filePath: string | null) {
  if (!filePath) return []
  const ext = filePath.split('.').pop()?.toLowerCase()
  if (!ext) return []
  const factory = LANG_MAP[ext]
  return factory ? [factory()] : []
}

const darkTheme = EditorView.theme({
  '&': {
    backgroundColor: 'oklch(11% 0.004 260)',
    color: 'oklch(88% 0.01 95)',
    fontSize: '13px',
    fontFamily: '"JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
  },
  '.cm-content': {
    caretColor: 'oklch(95% 0.004 95)',
    padding: '8px 0',
    lineHeight: '1.6',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'oklch(95% 0.004 95)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'oklch(38% 0.06 250)',
  },
  '.cm-gutters': {
    backgroundColor: 'oklch(13% 0.005 260)',
    color: 'oklch(40% 0.01 95)',
    border: 'none',
    borderRight: '1px solid oklch(22% 0.008 260)',
    minWidth: '40px',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'oklch(18% 0.007 260)',
    color: 'oklch(60% 0.01 95)',
  },
  '.cm-activeLine': {
    backgroundColor: 'oklch(15% 0.006 260)',
  },
  '.cm-foldGutter .cm-gutterElement': {
    color: 'oklch(40% 0.01 95)',
  },
  '.cm-matchingBracket': {
    backgroundColor: 'oklch(30% 0.04 260)',
    outline: '1px solid oklch(45% 0.06 260)',
  },
  '.cm-selectionMatch': {
    backgroundColor: 'oklch(32% 0.05 250)',
  },
  '.cm-searchMatch': {
    backgroundColor: 'oklch(40% 0.12 80)',
    outline: '1px solid oklch(50% 0.12 80)',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'oklch(45% 0.15 80)',
  },
}, { dark: true })

const lightTheme = EditorView.theme({
  '&': {
    backgroundColor: 'oklch(100% 0 0)',
    color: 'oklch(20% 0.005 95)',
    fontSize: '13px',
    fontFamily: '"JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
  },
  '.cm-content': {
    caretColor: 'oklch(14% 0.004 95)',
    padding: '8px 0',
    lineHeight: '1.6',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'oklch(14% 0.004 95)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'oklch(90% 0.02 260)',
  },
  '.cm-gutters': {
    backgroundColor: 'oklch(97% 0.003 95)',
    color: 'oklch(65% 0.01 95)',
    border: 'none',
    borderRight: '1px solid oklch(89% 0.005 95)',
    minWidth: '40px',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'oklch(94% 0.005 95)',
    color: 'oklch(40% 0.01 95)',
  },
  '.cm-activeLine': {
    backgroundColor: 'oklch(96% 0.003 95)',
  },
  '.cm-matchingBracket': {
    backgroundColor: 'oklch(88% 0.04 260)',
    outline: '1px solid oklch(75% 0.06 260)',
  },
  '.cm-selectionMatch': {
    backgroundColor: 'oklch(92% 0.03 260)',
  },
}, { dark: false })

const darkHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: 'oklch(72% 0.15 310)' },
  { tag: [tags.name, tags.deleted, tags.character, tags.macroName], color: 'oklch(88% 0.01 95)' },
  { tag: [tags.function(tags.variableName), tags.labelName], color: 'oklch(78% 0.12 220)' },
  { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: 'oklch(75% 0.13 160)' },
  { tag: [tags.definition(tags.name), tags.separator], color: 'oklch(88% 0.01 95)' },
  { tag: [tags.typeName, tags.className, tags.number, tags.changed, tags.annotation, tags.modifier, tags.self, tags.namespace], color: 'oklch(78% 0.14 60)' },
  { tag: [tags.operator, tags.operatorKeyword, tags.url, tags.escape, tags.regexp, tags.special(tags.string)], color: 'oklch(72% 0.12 190)' },
  { tag: [tags.meta, tags.comment], color: 'oklch(48% 0.01 95)', fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: 'oklch(72% 0.12 220)', textDecoration: 'underline' },
  { tag: tags.heading, fontWeight: 'bold', color: 'oklch(78% 0.12 220)' },
  { tag: [tags.atom, tags.bool, tags.special(tags.variableName)], color: 'oklch(75% 0.13 160)' },
  { tag: [tags.processingInstruction, tags.string, tags.inserted], color: 'oklch(75% 0.12 140)' },
  { tag: tags.invalid, color: 'oklch(65% 0.2 25)' },
])

const lightHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: 'oklch(45% 0.2 310)' },
  { tag: [tags.name, tags.deleted, tags.character, tags.macroName], color: 'oklch(20% 0.005 95)' },
  { tag: [tags.function(tags.variableName), tags.labelName], color: 'oklch(40% 0.15 250)' },
  { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: 'oklch(40% 0.15 160)' },
  { tag: [tags.definition(tags.name), tags.separator], color: 'oklch(20% 0.005 95)' },
  { tag: [tags.typeName, tags.className, tags.number, tags.changed, tags.annotation, tags.modifier, tags.self, tags.namespace], color: 'oklch(45% 0.15 60)' },
  { tag: [tags.operator, tags.operatorKeyword, tags.url, tags.escape, tags.regexp, tags.special(tags.string)], color: 'oklch(42% 0.14 190)' },
  { tag: [tags.meta, tags.comment], color: 'oklch(55% 0.01 95)', fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: [tags.processingInstruction, tags.string, tags.inserted], color: 'oklch(38% 0.14 140)' },
  { tag: tags.invalid, color: 'oklch(50% 0.25 25)' },
])

interface CodeEditorProps {
  filePath: string | null
  content: string
  isDark: boolean
  onSave?: (content: string) => void
  onChange?: (content: string) => void
  readOnly?: boolean
}

export function CodeEditor({ filePath, content, isDark, onSave, onChange, readOnly = false }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const themeComp = useRef(new Compartment())
  const langComp = useRef(new Compartment())
  const readOnlyComp = useRef(new Compartment())
  const onSaveRef = useRef(onSave)
  const onChangeRef = useRef(onChange)
  onSaveRef.current = onSave
  onChangeRef.current = onChange

  const currentPathRef = useRef<string | null>(null)

  const saveKeymap = useCallback(() => {
    return keymap.of([{
      key: 'Mod-s',
      run: (view) => {
        onSaveRef.current?.(view.state.doc.toString())
        return true
      }
    }])
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        foldGutter(),
        drawSelection(),
        rectangularSelection(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        history(),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          indentWithTab,
        ]),
        saveKeymap(),
        themeComp.current.of([
          isDark ? darkTheme : lightTheme,
          syntaxHighlighting(isDark ? darkHighlight : lightHighlight),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        ]),
        langComp.current.of(getLangExtension(filePath)),
        readOnlyComp.current.of(EditorState.readOnly.of(readOnly)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current?.(update.state.doc.toString())
          }
        }),
        EditorView.lineWrapping,
      ],
    })

    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view
    currentPathRef.current = filePath

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Update content when filePath changes
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (filePath === currentPathRef.current && content === view.state.doc.toString()) return

    currentPathRef.current = filePath

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: content },
    })
    view.dispatch({
      effects: langComp.current.reconfigure(getLangExtension(filePath)),
    })
  }, [filePath, content])

  // Update theme
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: themeComp.current.reconfigure([
        isDark ? darkTheme : lightTheme,
        syntaxHighlighting(isDark ? darkHighlight : lightHighlight),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      ]),
    })
  }, [isDark])

  // Update readOnly
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: readOnlyComp.current.reconfigure(EditorState.readOnly.of(readOnly)),
    })
  }, [readOnly])

  return <div ref={containerRef} className="h-full w-full min-h-0 overflow-hidden" />
}
