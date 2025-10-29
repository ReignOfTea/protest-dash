import { useMemo, useState } from 'react';

export type ListItem = { text: string };
export type Section = {
    heading: string;
    content: string | ListItem[];
};

export type InfoData = {
    title: string;
    sections: Section[];
};

type Props = {
    value: InfoData;
    onChange: (next: InfoData) => void;
    onAddSection: () => void;
    onRemoveSection: (index: number) => void;
    onUpdateSection: (index: number, key: keyof Section, value: string) => void;
};

export default function InfoEditor({ value, onChange, onAddSection, onRemoveSection, onUpdateSection }: Props) {
    const [query, setQuery] = useState('')
    const isValid = useMemo(() => {
        if (!value.title?.trim()) return false;
        return value.sections.every(s => {
            if (!s.heading?.trim()) return false;
            if (Array.isArray(s.content)) {
                return s.content.length > 0 && s.content.every(i => i.text?.trim());
            }
            return (s.content as string)?.trim();
        });
    }, [value]);

    const sectionIndices = useMemo(() => {
        const q = query.toLowerCase()
        return value.sections
            .map((_, i) => i)
            .filter(i => {
                if (!q) return true
                const s = value.sections[i]
                const contentText = Array.isArray(s.content) ? s.content.map(i => i.text).join('\n') : String(s.content || '')
                const hay = `${s.heading}\n${contentText}`.toLowerCase()
                return hay.includes(q)
            })
    }, [value, query])

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontWeight: 600 }}>Title</label>
                <input
                    value={value.title}
                    onChange={e => onChange({ ...value, title: e.target.value })}
                    placeholder="TITLE"
                    style={{ padding: 12, fontSize: 16, borderRadius: 10 }}
                />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <h2 style={{ margin: 0 }}>Sections</h2>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input placeholder="Filter sections…" value={query} onChange={e => setQuery(e.target.value)} />
                    <button onClick={onAddSection}>+ Add section</button>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {sectionIndices.map((idx) => {
                    const section = value.sections[idx]
                    return (
                    <div key={idx} className="section-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <strong>Section {idx + 1}</strong>
                            <button onClick={() => onRemoveSection(idx)} style={{ background: '#ef4444', padding: '6px 12px', fontSize: '14px' }}>Remove</button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <label style={{ fontWeight: 600 }}>Heading</label>
                            <input
                                value={section.heading}
                                onChange={e => onUpdateSection(idx, 'heading', e.target.value)}
                                placeholder="HEADING"
                                style={{ padding: 12, fontSize: 16, borderRadius: 10 }}
                            />
                        </div>
                        <ContentEditor
                            sectionIndex={idx}
                            section={section}
                            onUpdateSection={onUpdateSection}
                        />
                    </div>
                )})}
            </div>

            <div className={isValid ? 'badge-valid' : 'badge-invalid'}>
                {isValid ? 'All fields valid' : 'Please fill title, headings and contents'}
            </div>
        </div>
    );
}

type ContentEditorProps = {
    sectionIndex: number;
    section: Section;
    onUpdateSection: (index: number, key: keyof Section, value: any) => void;
}

function ContentEditor({ sectionIndex, section, onUpdateSection }: ContentEditorProps) {
    const isList = Array.isArray(section.content);

    const switchType = (type: 'text' | 'list') => {
        if (type === 'text') {
            const text = Array.isArray(section.content)
                ? section.content.map(i => i.text).join('\n')
                : (section.content || '');
            onUpdateSection(sectionIndex, 'content', text);
        } else {
            const arr = Array.isArray(section.content)
                ? section.content
                : String(section.content || '').split('\n').map(s => ({ text: s.trim() })).filter(i => i.text);
            onUpdateSection(sectionIndex, 'content', arr);
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontWeight: 600 }}>Content</label>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => switchType('text')} style={{ background: isList ? '#374151' : undefined }}>Text</button>
                    <button type="button" onClick={() => switchType('list')} style={{ background: isList ? undefined : '#374151' }}>List</button>
                </div>
            </div>
            {!isList ? (
                <textarea
                    value={String(section.content || '')}
                    onChange={e => onUpdateSection(sectionIndex, 'content', e.target.value)}
                    placeholder="Content..."
                    rows={4}
                    style={{ padding: 12, fontSize: 16, borderRadius: 10 }}
                />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(section.content as ListItem[]).map((item, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8 }}>
                            <input
                                value={item.text}
                                onChange={e => {
                                    const arr = [...(section.content as ListItem[])];
                                    arr[i] = { text: e.target.value };
                                    onUpdateSection(sectionIndex, 'content', arr);
                                }}
                                placeholder="List item text (supports HTML)"
                                style={{ flex: 1, padding: 12, fontSize: 16, borderRadius: 10 }}
                            />
                            <button type="button" onClick={() => {
                                const arr = (section.content as ListItem[]).filter((_, idx) => idx !== i);
                                onUpdateSection(sectionIndex, 'content', arr);
                            }} style={{ background: '#ef4444', padding: '6px 12px', fontSize: '14px', whiteSpace: 'nowrap' }}>Remove</button>
                        </div>
                    ))}
                    <div>
                        <button type="button" onClick={() => {
                            const arr = Array.isArray(section.content) ? [...section.content] : [];
                            arr.push({ text: '' });
                            onUpdateSection(sectionIndex, 'content', arr);
                        }}>+ Add item</button>
                    </div>
                </div>
            )}
        </div>
    );
}


