import React from 'react'
import MonacoEditor from '@monaco-editor/react'

export default function Editor({ language='html', value='', onChange }){
  const height = 220
  const options = { minimap: { enabled: false }, fontSize: 13, wordWrap: 'on' }

  return (
    <div style={{flex:1, display:'flex', flexDirection:'column', gap:6}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <strong>{language.toUpperCase()}</strong>
        <span style={{fontSize:12, opacity:0.7}}>Monaco Editor</span>
      </div>
      <div style={{flex:1, minHeight:height}}>
        <MonacoEditor height={`${height}px`} defaultLanguage={language} language={language} value={value} onChange={onChange} options={options} />
      </div>
    </div>
  )
}