import { useEffect, useRef, useState } from 'react'
import loader from '@monaco-editor/loader'
import { useComputedColorScheme } from '@mantine/core'

// Monaco, the editor of VS Code, loaded from jsDelivr at a pinned version the
// first time a file opens. The colors of each language are VS Code's own
// (the vs and vs-dark themes); only the background follows the panel.
export const MONACO_VERSION = '0.57.0'
loader.config({ paths: { vs: `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/min/vs` } })

const LANGUAGES = {
    js: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    mts: 'typescript',
    tsx: 'typescript',
    json: 'json',
    jsonc: 'json',
    md: 'markdown',
    markdown: 'markdown',
    html: 'html',
    htm: 'html',
    xml: 'xml',
    svg: 'xml',
    css: 'css',
    scss: 'scss',
    less: 'less',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'ini',
    ini: 'ini',
    env: 'ini',
    sql: 'sql',
    graphql: 'graphql',
    gql: 'graphql',
    dockerfile: 'dockerfile',
}

/** The Monaco language of a file, from its name; plain text when unknown. */
export function languageOf(name) {
    const base = String(name).split('/').pop().toLowerCase()
    if (base === 'dockerfile') return 'dockerfile'
    if (base === 'makefile') return 'makefile'
    const ext = base.includes('.') ? base.split('.').pop() : ''
    return LANGUAGES[ext] ?? 'plaintext'
}

let themesReady = false
function defineThemes(monaco) {
    if (themesReady) return
    themesReady = true
    // The panel's surfaces (neural-expressive.css), so the editor sits flush in its pane.
    monaco.editor.defineTheme('gemini-light', { base: 'vs', inherit: true, rules: [], colors: { 'editor.background': '#FFFFFF', 'editorGutter.background': '#FFFFFF' } })
    monaco.editor.defineTheme('gemini-dark', { base: 'vs-dark', inherit: true, rules: [], colors: { 'editor.background': '#16171B', 'editorGutter.background': '#16171B' } })
}

/**
 * A file in Monaco. With `onSave`, Cmd or Ctrl + S saves; without it the file
 * is read-only. Tells `onDirty` whether there are unsaved changes.
 */
export function CodeEditor({ path, value, onSave = null, onDirty = () => {} }) {
    const host = useRef(null)
    const editorRef = useRef(null)
    const savedRef = useRef(value)
    const saveRef = useRef(onSave)
    const [failure, setFailure] = useState(null)
    const scheme = useComputedColorScheme('light')
    saveRef.current = onSave

    useEffect(() => {
        let disposed = false
        let editor = null
        loader
            .init()
            .then(monaco => {
                if (disposed || !host.current) return
                defineThemes(monaco)
                editor = monaco.editor.create(host.current, {
                    value,
                    language: languageOf(path),
                    theme: scheme === 'dark' ? 'gemini-dark' : 'gemini-light',
                    readOnly: !saveRef.current,
                    automaticLayout: true,
                    fontFamily: "'Google Sans Code', 'JetBrains Mono', ui-monospace, Menlo, monospace",
                    fontSize: 13.5,
                    lineHeight: 22,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    renderLineHighlight: 'line',
                    roundedSelection: true,
                    smoothScrolling: true,
                    cursorSmoothCaretAnimation: 'on',
                    padding: { top: 16, bottom: 16 },
                    bracketPairColorization: { enabled: true },
                    guides: { bracketPairs: true, indentation: true },
                    tabSize: 4,
                    wordWrap: languageOf(path) === 'markdown' ? 'on' : 'off',
                })
                editorRef.current = editor
                editor.onDidChangeModelContent(() => onDirty(editor.getValue() !== savedRef.current))
                // An action, not addCommand: Monaco's commands are global, so with two editors open the last
                // one registered answered Cmd+S for both and saved one file's text into the other (25/11/2026).
                editor.addAction({
                    id: 'gemini-code.save',
                    label: 'Salvar',
                    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
                    run: async target => {
                        if (!saveRef.current) return
                        const text = target.getValue()
                        await saveRef.current(text)
                        savedRef.current = text
                        onDirty(false)
                    },
                })
            })
            .catch(error => setFailure(error?.message || 'o editor não carregou'))
        return () => {
            disposed = true
            editor?.getModel()?.dispose()
            editor?.dispose()
            editorRef.current = null
        }
        // A new file is a new editor; the value only seeds it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [path])

    useEffect(() => {
        loader.init().then(monaco => monaco.editor.setTheme(scheme === 'dark' ? 'gemini-dark' : 'gemini-light'))
    }, [scheme])

    // The file changed on disk and nothing is being edited here: show the new text.
    useEffect(() => {
        const editor = editorRef.current
        if (!editor || value === savedRef.current || editor.getValue() !== savedRef.current) return
        savedRef.current = value
        editor.setValue(value)
    }, [value])

    if (failure) return <pre className="src">{value}</pre>
    return (
        <div
            ref={host}
            className="code-editor"
            aria-label={`Editor de ${path}`}
        />
    )
}
