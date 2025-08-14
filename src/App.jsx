import React, { useState, useRef, useEffect } from 'react'
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition'
import Editor from './components/Editor'
import axios from 'axios'
import { FaMobileAlt, FaTabletAlt, FaLaptop, FaExpand, FaExternalLinkAlt, FaRedoAlt, FaHighlighter, FaSyncAlt } from 'react-icons/fa'

const DEFAULT_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Preview</title>
  </head>
  <body>
    <div id="app">Hello from Voice Builder</div>
  </body>
</html>`

const DEFAULT_CSS = `body { font-family: Arial, sans-serif; padding: 40px; background: #0b0f14; color:#e5e7eb; }
#app { max-width: 900px; margin: 0 auto; }
`

const DEFAULT_JS = `// You can add JS here
console.log('Preview running')`

export default function App(){
  // code state
  const [html, setHtml] = useState(DEFAULT_HTML)
  const [css, setCss] = useState(DEFAULT_CSS)
  const [js, setJs] = useState(DEFAULT_JS)

  // UX / versioning state
  const [generated, setGenerated] = useState('')
  const [versions, setVersions] = useState(() => {
    try { return JSON.parse(localStorage.getItem('vtw_versions')||'[]') } catch(e){ return [] }
  })
  const [projectName, setProjectName] = useState('My Voice Site')

  // preview controls
  const [deviceWidth, setDeviceWidth] = useState(1280)    // px
  const [useFullWidth, setUseFullWidth] = useState(false) // full container width
  const [zoom, setZoom] = useState(100)                   // %
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [showOutlines, setShowOutlines] = useState(false)

  const iframeRef = useRef(null)
  const { transcript, listening, resetTranscript } = useSpeechRecognition()

  // update preview on code change (if autoRefresh on)
  useEffect(() => {
    if (autoRefresh) updatePreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, css, js, showOutlines])

  // persist versions
  useEffect(() => {
    localStorage.setItem('vtw_versions', JSON.stringify(versions))
  }, [versions])

  if (!SpeechRecognition.browserSupportsSpeechRecognition()){
    return <div style={{padding:20}}>Your browser does not support the Web Speech API. Use Chrome or Edge.</div>
  }

  function buildFullHtml(h, c, j){
    // Inject user's CSS & JS
    const extra = showOutlines ? `\n/* preview outline (not exported) */\n* { outline: 1px dashed rgba(255,255,255,0.18); outline-offset: -1px; }\n` : ''
    const style = `<style>\n${c}${extra}\n</style>`
    const script = `<script>\n${j}\n<\/script>`
    let out = h
    if (out.includes('</head>')) out = out.replace('</head>', style + '\n</head>')
    else out = style + '\n' + out
    if (out.includes('</body>')) out = out.replace('</body>', script + '\n</body>')
    else out += script
    return out
  }

  function updatePreview(){
    const full = buildFullHtml(html, css, js)
    if (iframeRef.current) iframeRef.current.srcdoc = full
  }

  async function handleGenerate(){
    if (!transcript) return alert('Please speak your instruction first (Start Listening)')
    try{
      const prompt = `You are a helpful web developer. The user wants to modify or create a website based on the instruction below. Respond with three clearly delimited sections: HTML, CSS and JS. Use the existing code as a base when appropriate. Existing HTML:\n${html}\nExisting CSS:\n${css}\nExisting JS:\n${js}\nUser instruction:\n${transcript}\n\nReturn only a json object like: {"html":"<...>","css":"...","js":"..."} without extra text.`
      const res = await axios.post('https://api.openai.com/v1/chat/completions',{
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a web developer that returns only a JSON object with html, css and js keys.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 1500
      },{
        headers: { Authorization: `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}` }
      })

      const text = res.data.choices[0].message.content
      let json = null
      try{
        json = JSON.parse(text)
      }catch(e){
        const m = text.match(/\{[\s\S]*\}/)
        if (m) json = JSON.parse(m[0])
        else throw e
      }

      if (json.html) setHtml(json.html)
      if (json.css) setCss(json.css)
      if (json.js) setJs(json.js)
      setGenerated(transcript)
      resetTranscript()

      // autosave version snapshot
      const snap = {
        id: Date.now(),
        name: projectName + ' @ ' + (new Date()).toLocaleString(),
        html: json.html||html,
        css: json.css||css,
        js: json.js||js
      }
      setVersions(v => [snap, ...v].slice(0, 50))

      if (!autoRefresh) updatePreview()

    }catch(err){
      console.error(err)
      alert('Generation failed. Check console for details and ensure your API key is set in .env')
    }
  }

  function handleSaveVersion(){
    const snap = { id: Date.now(), name: projectName + ' @ ' + (new Date()).toLocaleString(), html, css, js }
    setVersions(v => [snap, ...v].slice(0,50))
    alert('Version saved')
  }

  function restoreVersion(v){
    if (!confirm('Restore version? This will overwrite current code in the editor.')) return
    setHtml(v.html); setCss(v.css); setJs(v.js)
    if (!autoRefresh) updatePreview()
  }

  function downloadZip(){
    // simple: download 3 files (no zip lib)
    downloadFile('index.html', buildFullHtml(html, css, js))
    downloadFile('style.css', css)
    downloadFile('script.js', js)
  }
  function downloadFile(name, content){
    const blob = new Blob([content], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // --- Preview helpers ---
  function preset(width){ setUseFullWidth(false); setDeviceWidth(width); }
  function fullWidth(){ setUseFullWidth(true); }
  function openInNewTab(){
    const htmlDoc = buildFullHtml(html, css, js)
    const w = window.open()
    w.document.open(); w.document.write(htmlDoc); w.document.close()
  }

  const computedWidth = useFullWidth ? '100%' : `${deviceWidth}px`
  const scale = zoom / 100

  return (
    <div className="app-root dark">
      {/* Topbar */}
      <header className="topbar dark-card">
        <div className="topbar-left">
          <h2>🎙 Voice to Website</h2>
          <input value={projectName} onChange={e=>setProjectName(e.target.value)} className="projname dark-input" />
        </div>

        <div className="controls">
          <button className="btn" onClick={() => SpeechRecognition.startListening({ continuous: true })}>Start</button>
          <button className="btn" onClick={() => SpeechRecognition.stopListening()}>Stop</button>
          <button className="btn" onClick={() => resetTranscript()}>Reset</button>
          <button className="btn btn-primary" onClick={handleGenerate}>Generate from Voice</button>
          <button className="btn" onClick={handleSaveVersion}>Save Version</button>
          <button className="btn" onClick={downloadZip}>Export</button>
        </div>
      </header>

      {/* Main grid (responsive) */}
      <main className="main-grid">
        {/* Left: Transcript + Versions */}
        <section className="left-col">
          <div className="panel dark-card">
            <h3>Transcript (live)</h3>
            <div className="transcript dark-surface">{transcript || <i>Speak now — nothing yet</i>}</div>
            <div className="status">Listening: {listening ? 'yes' : 'no'}</div>
            <div className="tips">
              <h4>How to speak</h4>
              <ul>
                <li>“Make a hero section with a large heading: Welcome to my portfolio”</li>
                <li>“Change the background to a dark gradient and center the content”</li>
                <li>“Add a contact form with name, email and message fields”</li>
              </ul>
            </div>
          </div>

          <div className="panel dark-card">
            <h3>Versions</h3>
            <div className="versions">
              {versions.length === 0 && <div className="muted">No saved versions yet</div>}
              {versions.map(v => (
                <div key={v.id} className="ver dark-surface">
                  <div className="ver-name">{v.name}</div>
                  <div className="ver-actions">
                    <button className="btn sm" onClick={()=>restoreVersion(v)}>Restore</button>
                    <button className="btn sm" onClick={()=>{ navigator.clipboard.writeText(JSON.stringify(v)); alert('Copied snapshot JSON to clipboard') }}>Copy</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Center: Editors */}
        <section className="center-col">
          <div className="panel dark-card">
            <h3>Editors</h3>
            <div className="editor-row">
              <Editor language="html" value={html} onChange={setHtml} />
              <Editor language="css" value={css} onChange={setCss} />
              <Editor language="javascript" value={js} onChange={setJs} />
            </div>
          </div>
        </section>

        {/* Right: Preview */}
        <section className="right-col">
          <div className="panel dark-card preview-panel">
            <div className="preview-header">
              <h3>Live Preview</h3>

              {/* Toolbar */}
              <div className="toolbar">
                <div className="group">
                  <button className="icon-btn" title="Mobile 375" onClick={()=>preset(375)}><FaMobileAlt /></button>
                  <button className="icon-btn" title="Tablet 768" onClick={()=>preset(768)}><FaTabletAlt /></button>
                  <button className="icon-btn" title="Laptop 1366" onClick={()=>preset(1366)}><FaLaptop /></button>
                  <button className="icon-btn" title="Full width" onClick={fullWidth}><FaExpand /></button>
                </div>

                <div className="group range">
                  <label>W:</label>
                  <input type="range" min={320} max={1920} value={deviceWidth} onChange={e=>{ setUseFullWidth(false); setDeviceWidth(parseInt(e.target.value,10)) }} />
                  <span className="mono">{useFullWidth ? '100%' : `${deviceWidth}px`}</span>
                </div>

                <div className="group range">
                  <label>Zoom:</label>
                  <input type="range" min={50} max={150} value={zoom} onChange={e=>setZoom(parseInt(e.target.value,10))} />
                  <span className="mono">{zoom}%</span>
                </div>

                <div className="group">
                  <label className="toggle">
                    <input type="checkbox" checked={autoRefresh} onChange={e=>setAutoRefresh(e.target.checked)} />
                    <span>Auto</span>
                  </label>
                  <button className="icon-btn" title="Refresh" onClick={updatePreview}><FaRedoAlt /></button>
                </div>

                <div className="group">
                  <button className={`icon-btn ${showOutlines ? 'active' : ''}`} title="Toggle element outlines" onClick={()=>setShowOutlines(s=>!s)}><FaHighlighter /></button>
                  <button className="icon-btn" title="Open in new tab" onClick={openInNewTab}><FaExternalLinkAlt /></button>
                </div>
              </div>
            </div>

            {/* Preview viewport */}
            <div className="preview-viewport">
              <div className="frame-wrapper" style={{ width: computedWidth, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                <iframe
                  ref={iframeRef}
                  title="preview"
                  sandbox="allow-scripts allow-forms allow-same-origin"
                  className="preview-frame"
                />
              </div>
            </div>

            <div className="generated mono">Last action: {generated || '—'}</div>
          </div>
        </section>
      </main>

      <footer className="footer muted">
        Tip: For production, move OpenAI requests to a secure backend. This demo uses client-side key from VITE_OPENAI_API_KEY.
      </footer>
    </div>
  )
}
