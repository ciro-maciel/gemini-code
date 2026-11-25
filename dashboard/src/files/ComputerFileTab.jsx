import { useEffect, useState } from 'react'

import { fileUrl } from '../services/api'
import { RichText } from '../components/RichText'
import { drawablePage } from '../components/FileGallery'
import { FileSkeleton } from './FileSkeleton'

const WORKSPACE = '/home/sprite/workspace/'

/**
 * A file of an agent's computer as a Mesa tab: Markdown rendered, a page drawn,
 * an image shown, anything else as its text. The path is "<botId>/<path in its workspace>".
 */
export function ComputerFileTab({ path }) {
    const slash = path.indexOf('/')
    const botId = path.slice(0, slash)
    const relative = path.slice(slash + 1)
    const url = fileUrl(botId, `${WORKSPACE}${relative}`)
    const isImage = /\.(png|jpe?g|webp|gif|svg)$/i.test(relative)
    const isPage = /\.html?$/i.test(relative)
    const [text, setText] = useState(null)
    const [view, setView] = useState('rendered')

    useEffect(() => {
        if (isImage) return
        setText(null)
        fetch(url)
            .then(response => (response.ok ? response.text() : Promise.reject(new Error(`${response.status}`))))
            .then(setText)
            .catch(() => setText(''))
    }, [url, isImage])

    return (
        <>
            <div className="sub">
                <span
                    className="path"
                    title={relative}
                >
                    {relative}
                </span>
                {!isImage && (
                    <span className="seg-sm tiny">
                        <button
                            className={view === 'rendered' ? 'on' : ''}
                            onClick={() => setView('rendered')}
                        >
                            {isPage ? 'Página' : 'Leitura'}
                        </button>
                        <button
                            className={view === 'original' ? 'on' : ''}
                            onClick={() => setView('original')}
                        >
                            Original
                        </button>
                    </span>
                )}
                <a
                    className="icon-btn"
                    href={url}
                    download={relative.split('/').pop()}
                    title="Baixar"
                    aria-label="Baixar"
                >
                    <i className="ti ti-download" />
                </a>
            </div>
            <div className="file-body">
                <div className="scroll">
                    {isImage ? (
                        <img
                            className="file-image"
                            src={url}
                            alt={relative}
                        />
                    ) : text === null ? (
                        <FileSkeleton />
                    ) : view === 'original' ? (
                        <pre className="src">{text}</pre>
                    ) : isPage ? (
                        <iframe
                            className="file-page"
                            title={relative}
                            sandbox="allow-scripts"
                            srcDoc={drawablePage(text)}
                        />
                    ) : (
                        <div className="paper">
                            <RichText text={text} />
                        </div>
                    )}
                </div>
            </div>
        </>
    )
}
