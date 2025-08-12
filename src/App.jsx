import React, { useState, useRef, useEffect } from 'react'
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition'
import Editor from './components/Editor'
import axios from 'axios'

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

const DEFAULT_CSS = `body { font-family: Arial, sans-serif; padding: 40px; background: #f7f7f7; }
#app { max-width: 900px; margin: 0 auto; }
`;

const DEFAULT_JS = `// You can add JS here\nconsole.log('Preview running')`;

export default function App(){
  const [html, setHtml] = useState(DEFAULT_HTML)
  const [css, setCss] = useState(DEFAULT_CSS)
  const [js, setJs] = useState(DEFAULT_JS)
  const [generated, setGenerated] = useState('')
  const [versions, setVersions] = useState(() => {
    try { return JSON.parse(localStorage.getItem('vtw_versions')||'[]') } catch(e){ return [] }
  })
  const [projectName, setProjectName] = useState('My Voice Site')
  const iframeRef = useRef(null)

  const { transcript, listening, resetTranscript } = useSpeechRecognition()

  useEffect(() => {
    updatePreview()
  }, [html, css, js])

  useEffect(() => {
    // persist versions
    localStorage.setItem('vtw_versions', JSON.stringify(versions))
  }, [versions])

  if (!SpeechRecognition.browserSupportsSpeechRecognition()){
    return <div style={{padding:20}}>Your browser does not support the Web Speech API. Use Chrome or Edge.</div>
  }

  function updatePreview(){
    const full = buildFullHtml(html, css, js)
    // use srcdoc for preview
    if (iframeRef.current) iframeRef.current.srcdoc = full
  }

  function buildFullHtml(h, c, j){
    // If the html already contains <style> or <script>, we preserve it — otherwise inject
    const style = `<style>\n${c}\n</style>`
    const script = `<script>\n${j}\n<\/script>`
    // Put style in head and script before </body>
    let out = h
    if (out.includes('</head>')){
      out = out.replace('</head>', style + '\n</head>')
    } else {
      out = style + '\n' + out
    }
    if (out.includes('</body>')){
      out = out.replace('</body>', script + '\n</body>')
    } else {
      out += script
    }
    return out
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
      // try to parse JSON out of response
      let json = null
      try{
        json = JSON.parse(text)
      }catch(e){
        // try to find json substring
        const m = text.match(/\{[\s\S]*\}/)
        if (m) json = JSON.parse(m[0])
        else throw e
      }

      if (json.html) setHtml(json.html)
      if (json.css) setCss(json.css)
      if (json.js) setJs(json.js)
      setGenerated(transcript)
      resetTranscript()

      // autosave a version snapshot
      const snap = { id: Date.now(), name: projectName + ' @ ' + (new Date()).toLocaleString(), html: json.html||html, css: json.css||css, js: json.js||js }
      setVersions(v => [snap, ...v].slice(0, 50))

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
    setHtml(v.html)
    setCss(v.css)
    setJs(v.js)
  }

  function downloadZip(){
    // simple zip-free download: create files and trigger downloads individually
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

  return (
    <div className="app-root">
      <header className="topbar">
        <div>
          <h2>🎙 Voice to Website — Advanced Demo</h2>
          <input value={projectName} onChange={e=>setProjectName(e.target.value)} className="projname" />
        </div>
        <div className="controls">
          <button onClick={() => SpeechRecognition.startListening({ continuous: true })}>Start Listening</button>
          <button onClick={() => SpeechRecognition.stopListening()}>Stop</button>
          <button onClick={() => resetTranscript()}>Reset Transcript</button>
          <button onClick={handleGenerate}>Generate from Voice</button>
          <button onClick={handleSaveVersion}>Save Version</button>
          <button onClick={downloadZip}>Export Files</button>
        </div>
      </header>

      <main className="main-grid">
        <section className="left-col">
          <div className="panel">
            <h3>Transcript (live)</h3>
            <div className="transcript">{transcript || <i>Speak now — nothing yet</i>}</div>
            <div className="status">Listening: {listening ? 'yes' : 'no'}</div>
            <h4>How to speak (examples)</h4>
            <ul>
              <li>"Make a hero section with a large heading: Welcome to my portfolio"</li>
              <li>"Change the background to a dark gradient and center the content"</li>
              <li>"Add a contact form with name, email and message fields"</li>
            </ul>
          </div>

          <div className="panel">
            <h3>Versions</h3>
            <div className="versions">
              {versions.length === 0 && <div>No saved versions yet</div>}
              {versions.map(v => (
                <div key={v.id} className="ver">
                  <div className="ver-name">{v.name}</div>
                  <div className="ver-actions">
                    <button onClick={()=>restoreVersion(v)}>Restore</button>
                    <button onClick={()=>{ navigator.clipboard.writeText(JSON.stringify(v)); alert('Copied snapshot JSON to clipboard') }}>Copy</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="center-col">
          <div className="editor-row">
            <Editor language="html" value={html} onChange={setHtml} />
            <Editor language="css" value={css} onChange={setCss} />
            <Editor language="javascript" value={js} onChange={setJs} />
          </div>
        </section>

        <section className="right-col">
          <div className="panel preview-panel">
            <h3>Live Preview</h3>
            <iframe ref={iframeRef} title="preview" sandbox="allow-scripts allow-forms allow-same-origin" style={{width:'100%', height: '520px', border: '1px solid #ddd'}} />
            <div className="generated">Last action: {generated || '—'}</div>
          </div>
        </section>
      </main>

      <footer className="footer">Tip: For production, move OpenAI requests to a secure backend. This demo uses client-side key from VITE_OPENAI_API_KEY.</footer>
    </div>
  )
}