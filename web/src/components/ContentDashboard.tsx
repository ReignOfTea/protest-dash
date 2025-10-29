import InfoEditor from './InfoEditor'
import type { InfoData } from './InfoEditor'

type Props = {
  about: InfoData
  setAbout: (next: InfoData) => void
  attend: InfoData
  setAttend: (next: InfoData) => void
  more: InfoData
  setMore: (next: InfoData) => void
}

export default function ContentDashboard({ about, setAbout, attend, setAttend, more, setMore }: Props) {
  return (
    <div className="main" style={{ paddingTop: 0 }}>
      <h1 style={{ margin: 0, marginBottom: 16 }}>Content Control</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24 }}>
        <section className="section-card">
          <h2 style={{ marginTop: 0 }}>about.json</h2>
          <InfoEditor
            value={about}
            onChange={setAbout}
            onAddSection={() => setAbout({ ...about, sections: [...about.sections, { heading: '', content: '' }] })}
            onRemoveSection={(idx) => setAbout({ ...about, sections: about.sections.filter((_, i) => i !== idx) })}
            onUpdateSection={(idx, key, value) => setAbout({ ...about, sections: about.sections.map((s, i) => i === idx ? { ...s, [key]: value } : s) })}
          />
        </section>

        <section className="section-card">
          <h2 style={{ marginTop: 0 }}>attend.json</h2>
          <InfoEditor
            value={attend}
            onChange={setAttend}
            onAddSection={() => setAttend({ ...attend, sections: [...attend.sections, { heading: '', content: '' }] })}
            onRemoveSection={(idx) => setAttend({ ...attend, sections: attend.sections.filter((_, i) => i !== idx) })}
            onUpdateSection={(idx, key, value) => setAttend({ ...attend, sections: attend.sections.map((s, i) => i === idx ? { ...s, [key]: value } : s) })}
          />
        </section>

        <section className="section-card">
          <h2 style={{ marginTop: 0 }}>more.json</h2>
          <InfoEditor
            value={more}
            onChange={setMore}
            onAddSection={() => setMore({ ...more, sections: [...more.sections, { heading: '', content: '' }] })}
            onRemoveSection={(idx) => setMore({ ...more, sections: more.sections.filter((_, i) => i !== idx) })}
            onUpdateSection={(idx, key, value) => setMore({ ...more, sections: more.sections.map((s, i) => i === idx ? { ...s, [key]: value } : s) })}
          />
        </section>
      </div>
    </div>
  )
}


